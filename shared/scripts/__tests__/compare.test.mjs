/**
 * scripts/__tests__/compare.test.mjs: `shared:compare` from its options to its exit code. The first
 * half needs nothing: options, refusals, the printed report. The second half runs the real script on
 * two small builds in a real Chrome, through puppeteer-core in the cache. It is skipped, with the
 * reason, on a machine without them, so a site's `test:shared -- --scripts` never needs a browser.
 *
 * Point it at a machine's own places with the variables in lib/compareSettings.mjs:
 *     env DOCUSAURUS_SHARED_CACHE=<folder> DOCUSAURUS_SHARED_CHROME=<path> node --test scripts/__tests__/compare.test.mjs
 *
 * No test here waits on a file alone or guesses a free port. A run picks its own ports and report.json names them
 * (`origins`); a test that follows a run waits for its report OR its end, under FIRST_REPORT_MS (waitForRunning).
 * Two copies of this suite on one machine take ports from the same counter, so a port that was free a moment ago
 * may be another run's now: that is how a test here once polled for seven hours.
 *
 * HOW TO CHANGE IT
 *   A new option gets a line in the first half. A new way for a run to end gets a browser test, and
 *   that test checks the exit code and that no server is left. A stand-in for the site's serve-handler
 *   is in STATIC_HANDLER, so the fixture needs nothing from npm. A test that follows a running compare uses
 *   waitForRunning, never a loop of its own.
 */

import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, pagesOf, resolveOptions } from '../compare.mjs';
import {
  PUPPETEER_VERSION, cacheInstallLine, loadPuppeteer, requireChrome, startBrowser, stopBrowser,
} from '../lib/compareBrowser.mjs';
import { VERDICT, VIEW } from '../lib/compareDiff.mjs';
import { loadAtRest, themedUrl } from '../lib/comparePage.mjs';
import { REPORT_FILE, summaryLines, viewLines, writeReport } from '../lib/compareReport.mjs';
import { serveBuild } from '../lib/compareServers.mjs';
import {
  BUSY_NOTE, BUSY_RETRIES, CACHE_ENV, CHROME_ARGS, CHROME_ENV, CHROME_REFUSED_PORTS, REFUSED_PORT_ERROR, STABILITY_CSS,
  SWEEP_LOCK_ENV, chromePath, cacheFolder, sweepLockPath,
} from '../lib/compareSettings.mjs';
import { EXIT } from '../lib/exitCodes.mjs';
import { compareSummary } from '../lib/siteGate.mjs';
import { PROCESS_LIFE_MS, hangCode, stopProcess } from './fixture.mjs';

const SCRIPT = fileURLToPath(new URL('../compare.mjs', import.meta.url));
const BROWSER_MODULE = new URL('../lib/compareBrowser.mjs', import.meta.url).href;

const require = createRequire(import.meta.url);
const table = require('../../requirements.cjs');

const PAGE_BODY = '<nav class="top" style="color: rgb(1, 2, 3)">x</nav><main><p>text</p></main>';

/**
 * Longer than any run here takes on a busy machine. A run reads one page in 4 views, 8 loads, in about 20 s on a
 * quiet Mac and up to a few minutes at a load average of 60. A run that cannot end is stopped, and its test fails.
 */
const RUN_TIMEOUT_MS = 480_000;

/**
 * How long a run may take to write its first report: both servers and the browser up, about 2 s on a quiet Mac.
 * A run that has not by then, and has not ended, is a failure that says so, never a wait for ever.
 */
const FIRST_REPORT_MS = 120_000;
const POLL_MS = 50;

/** The two sides a compare serves. */
const SIDES = ['before', 'after'];

/**
 * A second process that takes the next ports the system hands out, as a second suite beside this one does. It has
 * the fixture's ends: the test's `after`, a closed stdin, and PROCESS_LIFE_MS.
 */
const NEIGHBOUR_EVERY_MS = 5;
const NEIGHBOUR_HOLDS = 400;
const NEIGHBOUR_SCRIPT = `const net = require('node:net');
const held = [];
setInterval(() => {
  const server = net.createServer();
  server.on('error', () => {});
  server.listen(0, '127.0.0.1');
  held.push(server);
  if (held.length > ${NEIGHBOUR_HOLDS}) held.shift().close();
}, ${NEIGHBOUR_EVERY_MS});
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
setTimeout(() => process.exit(0), ${PROCESS_LIFE_MS});
console.log('up');
`;

/** How long the stand-in browser's helper holds its output, and how much sooner than that the stop must end. */
const HELPER_HOLDS_SECONDS = 60;
const STOP_LIMIT_MS = 20_000;

/** Adds a number of elements that differs from load to load, unless the clock and chance are fixed. */
const RESTLESS_SCRIPT = `<script>
  const count = (Date.now() % 97) + Math.floor(Math.random() * 97);
  for (let index = 0; index < count; index += 1) document.body.append(document.createElement('p'));
</script>`;

/** Holds a page busy past the fixed waits, then adds three elements. */
const BUSY_SCRIPT = `<script>
  const spinner = document.createElement('div');
  spinner.className = 'MuiCircularProgress-root';
  spinner.textContent = 'loading';
  document.body.append(spinner);
  setTimeout(() => {
    spinner.remove();
    for (let index = 0; index < 3; index += 1) document.body.append(document.createElement('p'));
  }, 2500);
</script>`;

/**
 * A focused text box whose caret stays lit: a caret is drawn for the first half of each blink, and every move
 * of the selection starts a blink again. Two pages that differ only in the caret's colour.
 */
function caretBody(colour) {
  return `<input id="box" autofocus value="carbon" style="caret-color: ${colour}"><script>
  const box = document.getElementById('box');
  let at = 3;
  box.focus();
  setInterval(() => { at = 7 - at; box.setSelectionRange(at, at); }, 100);
</script>`;
}

/** Stands in for the site's serve-handler: answers a folder's index.html, and 404 for anything else. */
const STATIC_HANDLER = `const fs = require('node:fs');
const path = require('node:path');
module.exports = (request, response, { public: folder }) => {
  const url = new URL(request.url, 'http://x');
  const file = path.join(folder, url.pathname, 'index.html');
  if (!fs.existsSync(file)) {
    response.statusCode = 404;
    response.end('<html data-theme="dark"><body>missing</body></html>');
    return;
  }
  response.setHeader('content-type', 'text/html');
  response.end(fs.readFileSync(file));
};
`;

/** A page that sets its theme the way Docusaurus does, from the query string. */
function pageHtml(body) {
  const script = "document.documentElement.setAttribute('data-theme', new URLSearchParams(location.search).get('docusaurus-theme'))";
  return `<!doctype html><html><head><script>${script}</script></head><body>${body}</body></html>`;
}

/** A throwaway site: a git repository, the stand-in handler, and a before and an after build. */
function makeSite(t, { after = PAGE_BODY, manifest = { comparePages: ['/'] } } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'compare-site-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'package.json': JSON.stringify({ name: 'fixture', ...manifest }),
    'node_modules/serve-handler/index.js': STATIC_HANDLER,
    'keep/index.html': pageHtml(PAGE_BODY),
    'build/index.html': pageHtml(after),
  };
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

/** Exits with `error.code` when `run` throws one, for short checks of refusals. */
function codeOf(run) {
  try {
    run();
    return EXIT.OK;
  } catch (error) {
    return error.code;
  }
}

test('options are read, and anything else is a usage error', () => {
  assert.deepEqual(parseArgs(['--before', 'a', '--pages', '/,/b/']), { before: 'a', pages: '/,/b/' });
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(codeOf(() => parseArgs(['--nope'])), EXIT.USAGE);
  assert.equal(codeOf(() => parseArgs(['--before'])), EXIT.USAGE);
  assert.equal(codeOf(() => parseArgs(['--before', '--after', 'x'])), EXIT.USAGE);
});

test('the pages come from package.json, or from --pages', (t) => {
  const root = makeSite(t, { manifest: { comparePages: ['/', '/docs/intro'] } });
  assert.deepEqual(pagesOf(root), ['/', '/docs/intro']);
  assert.deepEqual(pagesOf(root, '/a/,/b/'), ['/a/', '/b/']);
  assert.equal(codeOf(() => pagesOf(root, 'nope')), EXIT.USAGE);
  const bare = makeSite(t, { manifest: {} });
  assert.equal(codeOf(() => pagesOf(bare)), EXIT.USAGE);
});

test('a build must exist, and two sides of one folder prove nothing', (t) => {
  const root = makeSite(t);
  assert.equal(codeOf(() => resolveOptions(root, {})), EXIT.USAGE);
  assert.equal(codeOf(() => resolveOptions(root, { before: 'gone' })), EXIT.USAGE);
  assert.equal(codeOf(() => resolveOptions(root, { before: 'build' })), EXIT.USAGE);
  assert.equal(codeOf(() => resolveOptions(root, { before: 'keep', beforeUrl: 'http://127.0.0.1:1' })), EXIT.USAGE);
  assert.equal(codeOf(() => resolveOptions(root, { before: 'keep', afterUrl: 'not a url' })), EXIT.USAGE);
  assert.equal(codeOf(() => resolveOptions(root, { before: 'keep', lockWait: 'soon' })), EXIT.USAGE);
  const options = resolveOptions(root, { before: 'keep', ports: '4100-4101', lockWait: '0' });
  assert.deepEqual(options.sides.before, { folder: path.join(root, 'keep') });
  assert.deepEqual(options.sides.after, { folder: path.join(root, 'build') });
  assert.deepEqual(options.ports, [4100, 4101]);
  assert.equal(options.lockWait, 0);
  assert.ok(!options.out.startsWith(root), 'the default report folder sits outside the site');
});

test('a range that starts on a port Chrome refuses serves past it, and a server on one is a usage error', (t) => {
  const root = makeSite(t);
  assert.deepEqual(resolveOptions(root, { before: 'keep', ports: '6000-6002' }).ports, [6001, 6002]);
  assert.equal(codeOf(() => resolveOptions(root, { before: 'keep', ports: '6000-6000' })), EXIT.USAGE);
  for (const [side, url] of [['after', 'http://127.0.0.1:6000'], ['before', 'http://localhost:10080']]) {
    const args = side === 'after' ? { before: 'keep', afterUrl: url } : { beforeUrl: url };
    const port = new URL(url).port;
    assert.throws(() => resolveOptions(root, args), (error) => error.code === EXIT.USAGE
      && error.message === `--${side}-url names port ${port}, which Chrome refuses (${REFUSED_PORT_ERROR}), so no page there would load. Serve it on another port.`, url);
  }
  assert.deepEqual(resolveOptions(root, { before: 'keep', afterUrl: 'http://127.0.0.1:4100' }).sides.after, { url: 'http://127.0.0.1:4100' });
  assert.deepEqual(resolveOptions(root, { before: 'keep', afterUrl: 'http://localhost' }).sides.after, { url: 'http://localhost' });
});

test('a range must leave a port for each side the run serves: two for two builds, one beside a running server', (t) => {
  const root = makeSite(t);
  assert.throws(() => resolveOptions(root, { before: 'keep', ports: '6140-6140' }), (error) => error.code === EXIT.USAGE
    && error.message === '--ports 6140-6140 leaves 1 port, 6140, and a compare serves its two builds at once, one port each. Name a range with 2 ports or more in it.');
  assert.equal(codeOf(() => resolveOptions(root, { before: 'keep', ports: '6000-6001' })), EXIT.USAGE, 'one left beside a refused port');
  assert.deepEqual(resolveOptions(root, { before: 'keep', afterUrl: 'http://127.0.0.1:4100', ports: '6140-6140' }).ports, [6140]);
});

test('the defaults name no site and no user, and the three variables move them', () => {
  const home = os.homedir();
  assert.ok(cacheFolder({}).startsWith(home));
  assert.ok(sweepLockPath({}).startsWith(cacheFolder({})));
  assert.equal(cacheFolder({ [CACHE_ENV]: '/x' }), '/x');
  assert.equal(sweepLockPath({ [CACHE_ENV]: '/x', [SWEEP_LOCK_ENV]: '/y/lock' }), '/y/lock');
  assert.equal(chromePath({ [CHROME_ENV]: '/gone' }, () => false), null);
  assert.equal(chromePath({ [CHROME_ENV]: '/here' }, () => true), '/here');
});

test('two loads of one build draw the same: no caret is drawn, and a changed tile is redrawn whole', () => {
  assert.match(STABILITY_CSS, /caret-color: transparent !important;/);
  assert.ok(CHROME_ARGS.includes('--disable-partial-raster'), CHROME_ARGS.join(' '));
});

test('requirements.cjs names the two packages this script loads by hand', () => {
  const row = table.ENTRIES.find((entry) => entry.script === 'shared:compare');
  assert.deepEqual(row.packages, ['serve-handler']);
  assert.deepEqual(row.cachePackages, ['puppeteer-core']);
  assert.match(table.RANGES['puppeteer-core'], /^\d+\.\d+\.\d+$/, 'the cache holds one exact version');
  assert.equal(PUPPETEER_VERSION, table.RANGES['puppeteer-core']);
});

test('a theme joins a page\'s address, with or without a query of its own', () => {
  assert.equal(themedUrl('http://h', '/a/', 'dark'), 'http://h/a/?docusaurus-theme=dark');
  assert.equal(themedUrl('http://h', '/a/?id=1', 'light'), 'http://h/a/?id=1&docusaurus-theme=light');
});

test('a load that ended busy is tried again, and one that stays busy keeps its note', async () => {
  let loads = 0;
  const busyTwice = async () => {
    loads += 1;
    return { notes: loads <= 2 ? [BUSY_NOTE] : [] };
  };
  assert.deepEqual((await loadAtRest({}, busyTwice)).notes, []);
  assert.equal(loads, 3);

  loads = 0;
  const alwaysBusy = async () => {
    loads += 1;
    return { notes: [BUSY_NOTE] };
  };
  assert.deepEqual((await loadAtRest({}, alwaysBusy)).notes, [BUSY_NOTE]);
  assert.equal(loads, BUSY_RETRIES + 1);

  loads = 0;
  const calm = async () => {
    loads += 1;
    return { notes: ['fonts not settled'] };
  };
  await loadAtRest({}, calm);
  assert.equal(loads, 1);
});

test('an empty cache is refused with the line that fills it, and no browser is a refusal', async (t) => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-cache-'));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  const env = { [CACHE_ENV]: cache };
  const refused = (error) => error.code === EXIT.REFUSED && error.message.includes(cacheInstallLine(env));
  await assert.rejects(loadPuppeteer(env), refused);
  assert.ok(cacheInstallLine(env).includes(`puppeteer-core@${PUPPETEER_VERSION}`));
  assert.equal(codeOf(() => requireChrome({ [CHROME_ENV]: '/gone' })), EXIT.REFUSED);
});

test('a cache on another version is refused too', async (t) => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-cache-'));
  t.after(() => fs.rmSync(cache, { recursive: true, force: true }));
  const manifest = path.join(cache, 'compare/node_modules/puppeteer-core/package.json');
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, '{ "version": "1.0.0" }');
  await assert.rejects(loadPuppeteer({ [CACHE_ENV]: cache }), (error) => error.message.includes('holds 1.0.0'));
});

/** A view as lib/compareDiff.mjs builds it. */
function view(extra) {
  return {
    pagePath: '/', theme: 'dark', kind: VIEW.SAME, elementsBefore: 10, elementsAfter: 10, changedElements: 0,
    groups: [], firstDifference: null, onlyBefore: [], onlyAfter: [], failures: [], notes: [], ...extra,
  };
}

/** The words of a summary. */
function summaryOf(views, verdict) {
  return summaryLines({ views, verdict, browser: 'Chrome/1', out: '/o' }).join('\n');
}

test('0 changed is the last line, with nothing to read before it', () => {
  const text = summaryOf([view()], VERDICT.NONE);
  assert.ok(text.endsWith('\n0 changed'));
  assert.ok(text.includes('Chrome/1'));
});

test('a list prints each group once, with where it showed up, and no score', () => {
  const group = { selector: 'nav', property: 'paddingLeft', before: '16px', after: '24px', elements: 1 };
  const views = [view({ kind: VIEW.CHANGED, changedElements: 1, groups: [group] }), view({ theme: 'light', kind: VIEW.CHANGED, changedElements: 1, groups: [group] })];
  const text = summaryOf(views, VERDICT.READ);
  assert.equal(text.split('nav | paddingLeft: 16px -> 24px').length, 2);
  assert.ok(text.includes('2 elements: / dark, / light'));
  assert.ok(!/%|score/i.test(text));
  assert.ok(text.endsWith(VERDICT.READ));
});

test('a count and its noun agree, in a view line and in the last lines', () => {
  assert.match(viewLines(view({ elementsBefore: 1, elementsAfter: 1 }))[0], /^\/ dark: same, 1 element$/);
  assert.match(viewLines(view({ kind: VIEW.STRUCTURE, elementsBefore: 2, elementsAfter: 1 }))[0], /2 -> 1 element$/);
  assert.match(viewLines(view({ kind: VIEW.STRUCTURE, elementsBefore: 1, elementsAfter: 2 }))[0], /1 -> 2 elements$/);
  assert.ok(summaryOf([view()], VERDICT.NONE).includes('Chrome/1, 1 view. Screenshots'));
  assert.ok(summaryOf([view(), view()], VERDICT.NONE).includes('Chrome/1, 2 views. Screenshots'));
});

test('a changed structure prints the words the check asks for, and where it starts', () => {
  const place = { index: 7, before: 'p', after: 'h2' };
  const changed = view({ kind: VIEW.STRUCTURE, elementsAfter: 9, firstDifference: place });
  assert.match(viewLines(changed)[0], /^\/ dark: structure changed, read by eye, 10 -> 9 elements$/);
  assert.ok(summaryOf([changed], VERDICT.READ).includes('first at element 7, p -> h2'));
});

test('a failed view prints why, and a console change prints its side', () => {
  const failed = view({ kind: VIEW.FAILED, failures: ['after: the server answered 404'] });
  assert.ok(viewLines(failed)[0].includes('FAILED after: the server answered 404'));
  assert.ok(summaryOf([failed], VERDICT.RED).endsWith('\nred'));
  const noisy = view({ kind: VIEW.CHANGED, onlyAfter: ['boom'], onlyBefore: ['old'] });
  const text = summaryOf([noisy], VERDICT.READ);
  assert.ok(text.includes('/ dark, new: boom'));
  assert.ok(text.includes('/ dark, gone: old'));
});

test('a long list stops at its limit and says how many are left', () => {
  const groups = Array.from({ length: 45 }, (unused, index) => ({ selector: `s${index}`, property: 'color', before: 'a', after: 'b', elements: 1 }));
  const text = summaryOf([view({ kind: VIEW.CHANGED, changedElements: 45, groups })], VERDICT.READ);
  assert.ok(text.includes('and 5 more groups in report.json'));
});

test('the report file is replaced in one step and nothing is left beside it', (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-out-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  writeReport(out, { state: 'running' });
  writeReport(out, { state: 'done' });
  assert.deepEqual(fs.readdirSync(out), ['report.json']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8')).state, 'done');
});

test('a compare that stopped before its verdict prints the end of its log, never a bare null', (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-out-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const log = path.join(out, 'compare.log');
  fs.writeFileSync(log, 'one\nthe browser went away\n');
  writeReport(out, { state: 'running', verdict: null, views: [] });
  const lines = compareSummary(out, log);
  assert.ok(!lines.some((line) => line === null || /\bnull\b/.test(String(line))), lines.join('\n'));
  assert.match(lines[0], /ended before its verdict \(report\.json reads running\)/);
  assert.ok(lines.includes('the browser went away'), lines.join('\n'));
  writeReport(out, { state: 'done', verdict: VERDICT.NONE, views: [], browser: 'Chrome/1', out });
  assert.equal(compareSummary(out, log).at(-1), VERDICT.NONE);
});

/**
 * A stand-in for Chrome and its crash reporter: a shell that exits at once and leaves a sleep holding its output, in
 * its own process group. The script prints that group's id, stops the stand-in the way compare stops Chrome, and ends.
 */
const HELD_OUTPUT_SCRIPT = `import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { stopBrowser } from ${JSON.stringify(BROWSER_MODULE)};
const child = spawn('/bin/sh', ['-c', 'sleep ${HELPER_HOLDS_SECONDS} & exit 0'], { stdio: 'pipe', detached: true });
console.log(child.pid);
const exited = once(child, 'exit');
await stopBrowser({ process: () => child, close: () => exited });
`;

test('a stopped browser whose helper still holds its output lets the run end', (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-stop-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const script = path.join(folder, 'stop.mjs');
  fs.writeFileSync(script, HELD_OUTPUT_SCRIPT);
  const started = Date.now();
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: STOP_LIMIT_MS });
  const group = Number(result.stdout.trim());
  t.after(() => {
    try {
      process.kill(-group, 'SIGKILL');
    } catch {
      // the helper is gone already
    }
  });
  assert.ok(group > 0, `no process group printed: ${result.stdout}${result.stderr}`);
  assert.equal(result.status, 0, `the stop did not end within ${STOP_LIMIT_MS} ms: ${result.stderr}`);
  assert.ok(Date.now() - started < STOP_LIMIT_MS);
});

/** Why the browser tests cannot run here, or false. No path, so a skip reads the same on any machine. */
async function whyNoBrowser() {
  try {
    await loadPuppeteer();
    requireChrome();
    return false;
  } catch {
    return 'no puppeteer-core in the cache, or no Chrome';
  }
}

/** The environment of a browser run: its own lock, unless a test hands one in. */
function runEnv(t, extra = {}) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-lock-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const env = { ...process.env, [SWEEP_LOCK_ENV]: path.join(folder, 'sweep'), ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** Runs the script in `root` to its end: { code, text, report, out }. */
function runScript(t, root, args, env = runEnv(t)) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-out-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const child = spawn(process.execPath, [SCRIPT, ...args, '--out', out, '--lock-wait', '0'], { cwd: root, env, timeout: RUN_TIMEOUT_MS });
  t.after(() => stopProcess(child));
  let text = '';
  child.stdout.on('data', (chunk) => { text += chunk; });
  child.stderr.on('data', (chunk) => { text += chunk; });
  return new Promise((resolve) => {
    child.once('close', (code, signal) => {
      const file = path.join(out, 'report.json');
      const report = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
      resolve({ code, signal, text, report, out, env });
    });
  });
}

/** A child's output as it comes, stdout and stderr together. */
function collectOutput(child) {
  const output = { text: '' };
  child.stdout?.on('data', (chunk) => { output.text += chunk; });
  child.stderr?.on('data', (chunk) => { output.text += chunk; });
  return output;
}

/** report.json as it reads now, or null. */
function readReportFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Waits until the run's report.json reads running with both origins, and returns it. Fails, with the run's output,
 * the moment the run ends first, and at `limitMs` while it still runs: never a wait on the file alone, since a run
 * that refused (a port taken, a lock held) writes no running report at all.
 */
async function waitForRunning(child, reportFile, output, limitMs = FIRST_REPORT_MS) {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const report = readReportFile(reportFile);
    if (report?.state === 'running' && report.origins) return report;
    if (child.exitCode !== null || child.signalCode !== null) {
      const state = report === null ? 'no report.json' : `report.json reads ${report.state}`;
      throw new Error(`the run ended before its servers were up (exit ${child.exitCode ?? child.signalCode}, ${state}). Its output:\n${output.text}`);
    }
    if (Date.now() > deadline) throw new Error(`no running report.json after ${limitMs} ms, and the run still runs. Its output:\n${output.text}`);
    await new Promise((resolve) => { setTimeout(resolve, POLL_MS); });
  }
}

/** Starts NEIGHBOUR_SCRIPT and waits until it takes ports. It ends with the test, or when this process dies. */
function startNeighbour(t) {
  const child = spawn(process.execPath, ['-e', NEIGHBOUR_SCRIPT], { stdio: ['pipe', 'pipe', 'ignore'] });
  t.after(() => stopProcess(child));
  return new Promise((resolve, reject) => {
    child.stdout.once('data', () => resolve(child));
    child.once('exit', (code) => reject(new Error(`the neighbour ended before it took a port: ${code}`)));
  });
}

/**
 * A compare of four views per page, stopped by SIGTERM while it runs: its servers, its browser and its lock must
 * go, and its report must read stopped. The run picks its own ports and the test reads them from the report.
 */
async function stopHalfway(t) {
  const root = makeSite(t);
  const env = runEnv(t);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-out-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const args = [SCRIPT, '--before', 'keep', '--pages', '/,/,/,/', '--out', out];
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => stopProcess(child));
  const output = collectOutput(child);
  const reportFile = path.join(out, REPORT_FILE);
  const running = await waitForRunning(child, reportFile, output);
  assert.equal(running.pid, child.pid, 'the report names the run');
  const ports = SIDES.map((side) => Number(new URL(running.origins[side]).port));
  for (const port of ports) assert.equal(await isListening(port), true, `the server on ${port} was up`);
  const closed = new Promise((resolve) => { child.once('close', resolve); });
  child.kill('SIGTERM');
  assert.equal(await closed, 143, output.text);
  for (const port of ports) assert.equal(await isListening(port), false, `the server on ${port} stopped`);
  assert.equal(readReportFile(reportFile).state, 'stopped');
  assert.equal(fs.existsSync(env[SWEEP_LOCK_ENV]), false);
}

test('a run that ends before its report is read as ended at once, with its output', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-out-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const code = "console.error('No free port in 4100-4101. Nothing was compared.'); process.exit(4)";
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => stopProcess(child));
  const output = collectOutput(child);
  const started = Date.now();
  await assert.rejects(waitForRunning(child, path.join(folder, REPORT_FILE), output), (error) => {
    assert.match(error.message, /the run ended before its servers were up \(exit 4, no report\.json\)/);
    assert.match(error.message, /No free port in 4100-4101/);
    return true;
  });
  assert.ok(Date.now() - started < FIRST_REPORT_MS / 4, 'it did not wait for the limit');
});

test('a run that writes no report in time is given up on at the limit, while it still runs', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-out-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const child = spawn(process.execPath, ['-e', hangCode()], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => stopProcess(child));
  const limitMs = 300;
  await assert.rejects(waitForRunning(child, path.join(folder, REPORT_FILE), collectOutput(child), limitMs), /no running report\.json after 300 ms, and the run still runs/);
});

/** True when something accepts a connection on the port. */
function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

/** A free port, closed again at once: nothing listens on it. */
async function deadPort() {
  const probe = net.createServer();
  await new Promise((resolve) => { probe.listen(0, '127.0.0.1', resolve); });
  const { port } = probe.address();
  await new Promise((resolve) => { probe.close(resolve); });
  return port;
}

const noBrowser = await whyNoBrowser();

test('in a browser: two equal builds give 0 changed, exit 0, and both screenshots', { skip: noBrowser }, async (t) => {
  const root = makeSite(t);
  const { code, text, report, out } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.OK, text);
  assert.ok(text.trim().endsWith('0 changed'), text);
  assert.equal(report.state, 'done');
  assert.equal(report.verdict, VERDICT.NONE);
  assert.match(report.browser, /Chrome\//);
  assert.deepEqual(report.views.map((one) => `${one.theme} ${one.viewport}`), ['dark desktop', 'light desktop', 'dark phone', 'light phone']);
  assert.ok(report.views.every((one) => one.pixels.compared && one.pixels.differing === 0), JSON.stringify(report.views.map((one) => one.pixels)));
  const shots = fs.readdirSync(out).filter((file) => file.endsWith('.png'));
  assert.equal(shots.length, 8);
  assert.match(text, /at desktop 1280 px and phone 375 px/);
});

test('in a browser: a change no listed property holds shows in the pixels, and is a list to read', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: `${PAGE_BODY}<style>p { text-shadow: 3px 3px rgb(255, 0, 0) }</style>` });
  const { code, text, report } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.TO_READ, text);
  assert.deepEqual(report.views.map((one) => one.kind), Array(4).fill(VIEW.PIXELS));
  assert.ok(report.views.every((one) => one.pixels.differing > 0), JSON.stringify(report.views.map((one) => one.pixels)));
  assert.match(text, /\/ dark: pixels differ, open the two shots: [\d,]+ of [\d,]+ pixels/);
  assert.match(text, /Pixels that differ\. Open the two shots:\n {2}\/ dark, [\d,]+ of [\d,]+ pixels: 001-home-dark-desktop-before\.png and 001-home-dark-desktop-after\.png/);
  assert.ok(text.trim().endsWith(VERDICT.READ), text);
});

test('in a browser: a rule for small screens alone changes the phone views alone', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: `${PAGE_BODY}<style>@media (max-width: 500px) { p { color: rgb(200, 0, 0) } }</style>` });
  const { code, text, report } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.TO_READ, text);
  assert.deepEqual(report.views.map((one) => [one.viewport, one.kind]), [
    ['desktop', VIEW.SAME], ['desktop', VIEW.SAME], ['phone', VIEW.CHANGED], ['phone', VIEW.CHANGED],
  ]);
  assert.ok(text.includes('2 elements: / dark phone, / light phone'), text);
});

test('in a browser: a changed colour is a list to read, exit 8', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: PAGE_BODY.replace('rgb(1, 2, 3)', 'rgb(9, 9, 9)') });
  const { code, text, report } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.TO_READ, text);
  assert.ok(text.includes('nav.top | color: rgb(1, 2, 3) -> rgb(9, 9, 9)'), text);
  assert.equal(report.verdict, VERDICT.READ);
  assert.deepEqual(report.views.map((one) => one.kind), Array(4).fill(VIEW.CHANGED));
});

test('in a browser: one element fewer reads structure changed', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: PAGE_BODY.replace('<p>text</p>', '') });
  const { code, text } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.TO_READ, text);
  assert.ok(text.includes('structure changed, read by eye'), text);
});

test('in a browser: a new console error is on the list', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: `${PAGE_BODY}<script>console.error('boom')</script>` });
  const { code, text } = await runScript(t, root, ['--before', 'keep', '--pages', '/']);
  assert.equal(code, EXIT.TO_READ, text);
  assert.ok(text.includes('new: boom'), text);
});

test('in a browser: a tag that draws nothing changes nothing', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: `${PAGE_BODY}<script>void 0</script>` });
  const { code, text } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.OK, text);
});

test('in a browser: a focused text box draws no caret, so its blink cannot tell two loads apart', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: caretBody('rgb(255, 0, 0)') });
  fs.writeFileSync(path.join(root, 'keep/index.html'), pageHtml(caretBody('rgb(0, 0, 255)')));
  const { code, text, report } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.OK, text);
  assert.ok(report.views.every((one) => one.pixels.differing === 0), JSON.stringify(report.views.map((one) => one.pixels)));
});

test('in a browser: a page that reads the clock and picks at random reads the same on both sides', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: `${PAGE_BODY}${RESTLESS_SCRIPT}` });
  fs.writeFileSync(path.join(root, 'keep/index.html'), pageHtml(`${PAGE_BODY}${RESTLESS_SCRIPT}`));
  const { code, text } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.OK, text);
});

test('in a browser: a busy page is read after it rests', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: `${PAGE_BODY}${BUSY_SCRIPT}` });
  fs.writeFileSync(path.join(root, 'keep/index.html'), pageHtml(`${PAGE_BODY}${BUSY_SCRIPT}`));
  const plain = makeSite(t);
  const { code, text, report } = await runScript(t, root, ['--before', 'keep']);
  const baseline = await runScript(t, plain, ['--before', 'keep']);
  assert.equal(code, EXIT.OK, text);
  assert.equal(report.views[0].elementsBefore, baseline.report.views[0].elementsBefore + 3);
});

test('in a browser: an auto margin reads as auto, not as what it came to', { skip: noBrowser }, async (t) => {
  const box = (width) => `<div style="width: ${width}px"><div style="width: 100px; margin: 0 auto">x</div></div>`;
  const root = makeSite(t, { after: box(500) });
  fs.writeFileSync(path.join(root, 'keep/index.html'), pageHtml(box(300)));
  const { report } = await runScript(t, root, ['--before', 'keep']);
  const properties = report.views[0].groups.map((group) => group.property);
  assert.deepEqual(properties, ['width']);
});

test('in a browser: a blocked host is never reached, whatever the network does', { skip: noBrowser }, async (t) => {
  const root = makeSite(t, { after: `${PAGE_BODY}<img src="https://giscus.app/never.png">` });
  const { report } = await runScript(t, root, ['--before', 'keep']);
  assert.ok(report.views[0].onlyAfter.some((message) => message.includes('ERR_NAME_NOT_RESOLVED')), JSON.stringify(report.views[0]));
});

test('in a browser: a dead server is red, exit 3, never 0 changed', { skip: noBrowser }, async (t) => {
  const root = makeSite(t);
  const port = await deadPort();
  const { code, text, report } = await runScript(t, root, ['--before', 'keep', '--after-url', `http://127.0.0.1:${port}`]);
  assert.equal(code, EXIT.CHECKS, text);
  assert.equal(report.verdict, VERDICT.RED);
  assert.ok(text.includes('ERR_CONNECTION_REFUSED'), text);
  assert.ok(!text.includes('0 changed'), text);
  assert.ok(text.trim().endsWith('red'), text);
});

test('in a browser: every port on the refused list is refused before a connection, and a served page loads', { skip: noBrowser }, async (t) => {
  const browser = await startBrowser(await loadPuppeteer(), requireChrome());
  t.after(() => stopBrowser(browser));
  const page = await browser.newPage();
  const served = await serveBuild({ handler: (request, response) => response.end('<p>served</p>'), folder: 'x' });
  t.after(() => served.stop());
  const response = await page.goto(served.origin);
  assert.equal(response.status(), 200, 'a page on a port the system picked loads');
  const loaded = [];
  for (const port of CHROME_REFUSED_PORTS) {
    const error = await page.goto(`http://127.0.0.1:${port}/`).then(() => null, (failure) => failure);
    if (!error?.message.includes(REFUSED_PORT_ERROR)) loaded.push(`${port}: ${error?.message.split('\n')[0] ?? 'loaded'}`);
  }
  assert.deepEqual(loaded, [], `${await browser.version()} does not refuse these, so the list is out of date`);
});

test('in a browser: a listed page the build lacks is red, on both sides', { skip: noBrowser }, async (t) => {
  const root = makeSite(t);
  const { code, text } = await runScript(t, root, ['--before', 'keep', '--pages', '/gone/']);
  assert.equal(code, EXIT.CHECKS, text);
  assert.ok(text.includes('the server answered 404'), text);
});

test('in a browser: a page that ignores the theme is red', { skip: noBrowser }, async (t) => {
  const root = makeSite(t);
  const fixedTheme = '<!doctype html><html data-theme="dark"><body>x</body></html>';
  fs.writeFileSync(path.join(root, 'keep/index.html'), fixedTheme);
  fs.writeFileSync(path.join(root, 'build/index.html'), fixedTheme);
  const { code, text, report } = await runScript(t, root, ['--before', 'keep']);
  assert.equal(code, EXIT.CHECKS, text);
  assert.deepEqual(report.views.map((one) => one.kind), [VIEW.SAME, VIEW.FAILED, VIEW.SAME, VIEW.FAILED]);
  assert.ok(text.includes('the page stayed in dark, not light'), text);
});

test('in a browser: a held lock refuses before anything starts, and a free one is left free', { skip: noBrowser }, async (t) => {
  const root = makeSite(t);
  const env = runEnv(t);
  fs.writeFileSync(env[SWEEP_LOCK_ENV], `${process.pid}\nanother sweep\n`);
  const held = await runScript(t, root, ['--before', 'keep'], env);
  assert.equal(held.code, EXIT.REFUSED, held.text);
  assert.ok(held.text.includes('holds the sweep lock'), held.text);
  fs.rmSync(env[SWEEP_LOCK_ENV]);
  const free = await runScript(t, root, ['--before', 'keep'], env);
  assert.equal(free.code, EXIT.OK, free.text);
  assert.equal(fs.existsSync(env[SWEEP_LOCK_ENV]), false);
});

test('in a browser: stopped halfway it stops its servers, the browser and the lock', { skip: noBrowser }, async (t) => {
  await stopHalfway(t);
});

test('in a browser: stopped halfway while another process takes the next free ports, it still stops cleanly', { skip: noBrowser }, async (t) => {
  await startNeighbour(t);
  await stopHalfway(t);
});
