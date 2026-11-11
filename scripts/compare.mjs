#!/usr/bin/env node
/**
 * scripts/compare.mjs: `npm run shared:compare`. It answers one question after a change: did any page
 * of this site look different? It serves two builds on local ports with the site's own serve-handler,
 * loads the pages listed in package.json's `comparePages` in dark and light, in a desktop window and a
 * phone's, compares 37 computed properties on every element plus the console, and compares the two
 * screenshots of each view pixel by pixel. "0 changed" means all of that read the same: the top 2,400 px
 * of each listed page, in both windows. A page nobody listed, and anything further down, is not seen.
 *
 *     npm run shared:compare -- --before ../keep/build
 *     npm run shared:compare -- --before ../keep/build --after build --pages /,/docs/intro/
 *     npm run shared:compare -- --before ../keep/build --after-url http://127.0.0.1:4100
 *
 * The verdict is "0 changed", a list to read, or red. It exits 0 for "0 changed", 8 for a list to read
 * and 3 for red: a page that did not load, which is never read as no change. Other codes are in
 * lib/exitCodes.mjs. It reads two folders, writes one outside the site, and leaves no process behind.
 *
 * It needs puppeteer-core in a cache folder outside every repo, and prints the line that puts it
 * there. It takes the machine's sweep lock first and waits for whoever holds it.
 *
 * HOW TO CHANGE IT
 *   What it reads and every number: lib/compareSettings.mjs. What counts as a change: lib/compareDiff.mjs.
 *   How a page is loaded: lib/comparePage.mjs. The wording: lib/compareReport.mjs.
 *   A new option goes in VALUE_FLAGS and USAGE.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot } from './lib/checkout.mjs';
import { loadPuppeteer, requireChrome, startBrowser, stopBrowser } from './lib/compareBrowser.mjs';
import { VERDICT, diffView, verdictOf } from './lib/compareDiff.mjs';
import { releaseLock, waitForLock } from './lib/compareLock.mjs';
import { loadAtRest } from './lib/comparePage.mjs';
import { comparePixels } from './lib/comparePixels.mjs';
import { summaryLines, viewLines, writeReport } from './lib/compareReport.mjs';
import { isRefusedPort, loadServeHandler, portsInRange, serveBuild } from './lib/compareServers.mjs';
import { LOCK_WAIT_SECONDS, REFUSED_PORT_ERROR, THEMES, VIEWPORTS, sweepLockPath } from './lib/compareSettings.mjs';
import { EXIT, STOP_SIGNALS, ScriptError, runScript } from './lib/exitCodes.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { counted } from './lib/phrases.mjs';
import { BUILD_ENTRY } from './lib/settings.mjs';

const HELP_FLAG = '--help';
const VALUE_FLAGS = Object.freeze({
  '--before': 'before',
  '--after': 'after',
  '--before-url': 'beforeUrl',
  '--after-url': 'afterUrl',
  '--pages': 'pages',
  '--out': 'out',
  '--ports': 'ports',
  '--lock-wait': 'lockWait',
});
const FLAGS = [...Object.keys(VALUE_FLAGS), HELP_FLAG];

const USAGE = [
  'Usage: npm run shared:compare -- --before <build folder> [options]',
  '  --before <folder>      the build as it was',
  '  --after <folder>       the build as it is now. Default: build',
  '  --before-url <origin>  a server already running, in place of --before',
  '  --after-url <origin>   a server already running, in place of --after',
  '  --pages /a/,/b/        these pages. Default: comparePages in package.json',
  '  --out <folder>         where the screenshots and report.json go. Default: a new temp folder',
  '  --ports <from>-<to>    serve on these ports. Default: free ports the system picks',
  `  --lock-wait <seconds>  how long to wait for the sweep lock. Default: ${LOCK_WAIT_SECONDS}`,
  '  --help                 this list',
].join('\n');

const DEFAULT_BUILD = 'build';
const OUT_FOLDER = 'docusaurus-shared-compare';
const WEB_ORIGIN = /^https?:\/\/[^/]+$/;
const WHOLE_NUMBER = /^\d+$/;
const SIDES = Object.freeze(['before', 'after']);

/** Exit code per verdict. A list to read is not red, and a caller can tell the two apart. */
const EXIT_BY_VERDICT = Object.freeze({
  [VERDICT.NONE]: EXIT.OK,
  [VERDICT.READ]: EXIT.TO_READ,
  [VERDICT.RED]: EXIT.CHECKS,
});

/** The options as { before, after, ... }, or a usage error for anything else. */
export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === HELP_FLAG) {
      options.help = true;
    } else if (VALUE_FLAGS[flag] === undefined) {
      throw new ScriptError(`Unknown option ${flag}.\n${USAGE}`, EXIT.USAGE);
    } else {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw new ScriptError(`${flag} needs a value.\n${USAGE}`, EXIT.USAGE);
      options[VALUE_FLAGS[flag]] = value;
      index += 1;
    }
  }
  return options;
}

/** The pages to load: --pages, or the site's comparePages. */
export function pagesOf(root, listed) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const pages = listed === undefined ? manifest.comparePages : listed.split(',');
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new ScriptError('No pages to compare. Add comparePages to package.json, or pass -- --pages.', EXIT.USAGE);
  }
  const bad = pages.find((page) => typeof page !== 'string' || !page.startsWith('/'));
  if (bad !== undefined) throw new ScriptError(`A page starts with /, and this one reads ${bad}.`, EXIT.USAGE);
  return pages;
}

/** A server on a port Chrome refuses could never be read: every page of it would load as red. */
function refuseRefusedPort(side, origin) {
  const { port } = new URL(origin);
  if (port === '' || !isRefusedPort(Number(port))) return;
  const sentence = `--${side}-url names port ${port}, which Chrome refuses (${REFUSED_PORT_ERROR}), so no page there would load.`;
  throw new ScriptError(`${sentence} Serve it on another port.`, EXIT.USAGE);
}

/** One side: { url } for a server that runs already, { folder } for a build to serve. */
function sideOf(root, side, folderOption, urlOption, fallback) {
  if (urlOption !== undefined) {
    if (folderOption !== undefined) throw new ScriptError(`Give a folder or a url for ${side}, not both.`, EXIT.USAGE);
    if (!WEB_ORIGIN.test(urlOption)) throw new ScriptError(`--${side}-url wants an origin, and reads ${urlOption}.`, EXIT.USAGE);
    refuseRefusedPort(side, urlOption);
    return { url: urlOption };
  }
  const given = folderOption ?? fallback;
  if (given === undefined) throw new ScriptError(`Which build is ${side}?\n${USAGE}`, EXIT.USAGE);
  const folder = path.resolve(root, given);
  if (!fs.existsSync(path.join(folder, BUILD_ENTRY))) {
    throw new ScriptError(`${folder} has no ${BUILD_ENTRY}. Build the site first.`, EXIT.USAGE);
  }
  return { folder: fs.realpathSync(folder) };
}

/** Two sides from one folder would agree whatever the change was. */
function refuseSameFolder(before, after) {
  if (before.folder !== undefined && before.folder === after.folder) {
    throw new ScriptError(`--before and --after are one folder, ${before.folder}, so they prove nothing.`, EXIT.USAGE);
  }
}

export function lockWaitOf(text) {
  if (text === undefined) return LOCK_WAIT_SECONDS;
  if (!WHOLE_NUMBER.test(text)) throw new ScriptError(`--lock-wait wants seconds, and reads ${text}.`, EXIT.USAGE);
  return Number(text);
}

/** A folder the site's git never sees, unique to this run. */
function defaultOut(root) {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  return path.join(os.tmpdir(), OUT_FOLDER, `${path.basename(root)}-${stamp}-${process.pid}`);
}

/** How many sides this run serves itself: a side given by its url is served already. */
function servedSides(...sides) {
  return sides.filter((side) => side.url === undefined).length;
}

/** Everything a run needs from its arguments, or a usage error before anything starts. */
export function resolveOptions(root, args) {
  const before = sideOf(root, 'before', args.before, args.beforeUrl);
  const after = sideOf(root, 'after', args.after, args.afterUrl, DEFAULT_BUILD);
  refuseSameFolder(before, after);
  return {
    sides: { before, after },
    pages: pagesOf(root, args.pages),
    out: path.resolve(root, args.out ?? defaultOut(root)),
    ports: args.ports === undefined ? undefined : portsInRange(args.ports, servedSides(before, after)),
    lockWait: lockWaitOf(args.lockWait),
  };
}

/** Steps to run at the end, last added first, once, whether the run ended or was stopped. */
function makeCleanup() {
  const steps = [];
  let started = null;
  const runSteps = async () => {
    for (const step of steps.reverse()) {
      await step().catch((error) => console.error(`cleanup: ${error.message}`));
    }
  };
  const run = () => {
    if (started === null) started = runSteps();
    return started;
  };
  return { add: (step) => steps.push(step), run };
}

/** A signal stops everything in order. Returns the function that stops listening. */
function stopOnSignals(cleanup, onStopped) {
  const handlers = Object.entries(STOP_SIGNALS).map(([signal, code]) => {
    const handler = async () => {
      onStopped();
      await cleanup.run();
      process.exit(code);
    };
    process.once(signal, handler);
    return [signal, handler];
  });
  return () => handlers.forEach(([signal, handler]) => process.off(signal, handler));
}

/** The origin of one side, serving its build when it has one. */
async function originOf(side, handler, ports, cleanup) {
  if (side.url !== undefined) return side.url;
  const served = await serveBuild({ handler, folder: side.folder, ports });
  cleanup.add(served.stop);
  return served.origin;
}

/** Both sides' origins. */
async function startSides(root, sides, ports, cleanup) {
  const needsServer = SIDES.some((side) => sides[side].url === undefined);
  const handler = needsServer ? loadServeHandler(root) : null;
  const before = await originOf(sides.before, handler, ports, cleanup);
  const after = await originOf(sides.after, handler, ports, cleanup);
  return { before, after };
}

/** "/docs/intro/" as a piece of a file name. */
function pageLabel(pagePath) {
  const word = pagePath.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return word === '' ? 'home' : word;
}

/** The two shots compared, unless a side did not load: then the view is red anyway. */
function pixelsOf(before, after, files) {
  if (before.failure !== null || after.failure !== null) return null;
  return comparePixels(files.before, files.after);
}

/** Loads one page in one theme and one window on both sides. */
async function compareOne({ browser, origins, out, pagePath, theme, viewport, number }) {
  const label = `${String(number).padStart(3, '0')}-${pageLabel(pagePath)}-${theme}-${viewport.name}`;
  const names = { before: `${label}-before.png`, after: `${label}-after.png` };
  const files = { before: path.join(out, names.before), after: path.join(out, names.after) };
  const loadSide = (side) => loadAtRest({ browser, origin: origins[side], pagePath, theme, viewport, shotPath: files[side] });
  const before = await loadSide('before');
  const after = await loadSide('after');
  const pixels = pixelsOf(before, after, files);
  return diffView({ pagePath, theme, viewport: viewport.name, before, after, origins, pixels, shots: names });
}

/** Every page in every window and theme. Stops early only when the run was stopped. */
async function compareAll({ browser, origins, options, report, print, stopped }) {
  const views = (pagePath) => VIEWPORTS.flatMap((viewport) => THEMES.map((theme) => ({ pagePath, theme, viewport })));
  const plan = options.pages.flatMap(views);
  for (const [index, view] of plan.entries()) {
    if (stopped()) return;
    const result = await compareOne({ browser, origins, out: options.out, ...view, number: index + 1 });
    if (stopped()) return;
    report.views.push(result);
    viewLines(result).forEach((line) => print(line));
    writeReport(options.out, report);
  }
}

/**
 * The empty report. `pid` is this run's process, so a reader can tell a live run from one that was killed; `origins`
 * are where the two sides are served, set once both servers listen, so a reader never has to guess a port.
 */
function newReport(root, options) {
  return {
    state: 'running', pid: process.pid, site: path.basename(root), browser: null, verdict: null, out: options.out,
    before: options.sides.before, after: options.sides.after, origins: null, pages: options.pages, views: [],
  };
}

/** Marks the report failed, with the reason. A folder that cannot be written keeps the first error the one shown. */
function writeFailure(out, report, error) {
  try {
    writeReport(out, { ...report, state: 'failed', failure: error.message });
  } catch {
    // the out folder was never made: the error itself is the report
  }
}

/** Takes the lock, compares, stops everything and returns the exit code. */
export async function runCompare({ root, options, env = process.env, print = console.log }) {
  const puppeteer = await loadPuppeteer(env);
  const executablePath = requireChrome(env);
  const lockPath = sweepLockPath(env);
  const cleanup = makeCleanup();
  const report = newReport(root, options);
  let wasStopped = false;
  const stopListening = stopOnSignals(cleanup, () => { wasStopped = true; });
  try {
    fs.mkdirSync(options.out, { recursive: true });
    cleanup.add(async () => {
      if (wasStopped) writeReport(options.out, { ...report, state: 'stopped' });
    });
    await waitForLock({ lockPath, waitSeconds: options.lockWait, note: `shared:compare ${report.site}`, print });
    cleanup.add(async () => releaseLock({ lockPath }));
    const origins = await startSides(root, options.sides, options.ports, cleanup);
    report.origins = origins;
    const browser = await startBrowser(puppeteer, executablePath);
    cleanup.add(() => stopBrowser(browser));
    report.browser = await browser.version();
    const windows = VIEWPORTS.map(({ name, width }) => `${name} ${width} px`).join(' and ');
    print(`${report.site}: ${counted(options.pages.length, 'page')} in ${THEMES.join(' and ')}, at ${windows}, ${report.browser}`);
    writeReport(options.out, report);
    await compareAll({ browser, origins, options, report, print, stopped: () => wasStopped });
    if (wasStopped) return EXIT.REFUSED;
    report.verdict = verdictOf(report.views);
    report.state = 'done';
    writeReport(options.out, report);
    summaryLines({ views: report.views, verdict: report.verdict, browser: report.browser, out: options.out }).forEach((line) => print(line));
    return EXIT_BY_VERDICT[report.verdict];
  } catch (error) {
    if (!wasStopped) writeFailure(options.out, report, error);
    throw error;
  } finally {
    await cleanup.run();
    stopListening();
  }
}

/** The script's entry point. */
async function main() {
  refuseNpmKeptOptions({ flags: FLAGS, script: 'shared:compare', example: 'npm run shared:compare -- --before ../keep/build' });
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  const root = findRoot();
  return runCompare({ root, options: resolveOptions(root, args) });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
