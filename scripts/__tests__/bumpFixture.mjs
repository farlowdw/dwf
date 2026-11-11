/**
 * scripts/__tests__/bumpFixture.mjs: a site for the shared:bump tests. The git is real, from fixture.mjs.
 * npm and the compare are stand-ins, written into the fixture's folder, so a test can choose what each
 * step does and read back how it was called, with no network and no browser.
 *
 *     const { fixture, site, bump, calls } = bumpSite(t);              a site on FROM, with a kept build
 *     const { fixture, site, bump } = bumpSite(t, { install: 'eresolve' });
 *     bump('3.11.0');                                                  runs the real bump.mjs, in that site
 *     bumpAsync('--verify-timeout', '1');                              the same without blocking
 * Every run gets a --keep folder in the fixture, unless it names one or uses bumpNoKeep.
 *
 * What the stand-in npm does, each key a choice of `bumpSite`'s second argument. Under `sites`, the same
 * keys for one site by its folder's name, for a suite with several (allFixture.mjs):
 *   install     'ok', 'eresolve' or 'hang'
 *   lockEdits   lock keys to change at install, each to a version, or null to remove it
 *   diskEdits   package folders to give another version at install
 *   build       'ok', 'fail', 'empty' (exit 0, no page), or 'touch' (also changes a tracked file)
 *   failBuildOn the version whose build fails, for the "before" side
 *   verify      'ok', 'fail', 'hang', or 'stubborn' (hangs and ignores SIGTERM). Both leave a child
 *   compare     the stand-in compare's exit code
 *   compareFirst  its exit code on a site's first call only, so a test can see a second try
 *   firstReport the report.json of that first call: 'timeouts' (every view failed by running out of time) or
 *               'broken' (a view that answered 404)
 *   report      true to have it write a report.json
 *   scripts     other npm scripts by name, each with its exit code
 *   newest      what `npm view` prints for the newest version
 *   missing     versions `npm view @docusaurus/core@<version>` has no answer for; any other is answered
 *   versions    the list `npm view @docusaurus/core versions --json` prints, [] by default; 'unreachable' fails it
 * Each stand-in also adds a line to steps.log, "<site> <step>", so a suite can read the order of a run.
 * `npm ci` stops at ERESOLVE on a package.json whose override sits at another major than its Docusaurus, as the
 * real one does, and leaves node_modules as it was.
 *
 * HOW TO CHANGE IT
 *   Another way for a step to behave: a key above and a line in NPM_STAND_IN. SITE_FILES is the seed.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPARE_SCRIPT_ENV } from '../lib/bumpSettings.mjs';
import { NPM_COMMAND_ENV } from '../lib/settings.mjs';
import { PIN, fixtureFor, hangCode, runScript, runScriptAsync, writeFiles } from './fixture.mjs';

const SCRIPTS_FOLDER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUMP_SCRIPT = path.join(SCRIPTS_FOLDER, 'bump.mjs');

/** The Docusaurus version a fixture site starts on. The fixture's pin is PIN. */
export const FROM = '3.9.2';

export const MUI_X_KEY = 'node_modules/@mui/x-internals';
export const MUI_KEY = 'node_modules/@mui/material';
const NESTED_KEY = 'node_modules/@docusaurus/core/node_modules/webpack-merge';
const LOADER_KEY = 'node_modules/@docusaurus/responsive-loader';
const LOADER_VERSION = '1.7.0';

/** package.json of a site on `version`. */
export function manifestOn(version) {
  return {
    name: 'fixture-site',
    private: true,
    scripts: { build: 'docusaurus build', 'shared:verify': 'node verify.mjs' },
    dependencies: {
      '@docusaurus/core': version,
      '@docusaurus/preset-classic': version,
      '@docusaurus/responsive-loader': LOADER_VERSION,
      '@mui/material': '^9.4.0',
      react: '^19.0.0',
    },
    devDependencies: { '@docusaurus/types': version },
    comparePages: ['/'],
  };
}

/** The lock of a site on `version`. */
export function lockOn(version) {
  return {
    name: 'fixture-site',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': { name: 'fixture-site' },
      'node_modules/@docusaurus/core': { version },
      'node_modules/@docusaurus/preset-classic': { version },
      'node_modules/@docusaurus/types': { version },
      [LOADER_KEY]: { version: LOADER_VERSION },
      [NESTED_KEY]: { version: '5.10.0' },
      [MUI_KEY]: { version: '9.4.0' },
      [MUI_X_KEY]: { version: '9.14.0' },
      'node_modules/react': { version: '19.2.3' },
    },
  };
}

const pretty = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** The files a site commits. */
export function siteFiles({ manifest = manifestOn(FROM), lock = lockOn(FROM) } = {}) {
  return {
    'package.json': pretty(manifest),
    'package-lock.json': pretty(lock),
    '.gitignore': 'node_modules\nbuild\n.docusaurus\n',
    '.nvmrc': '22\n',
    'docs/intro.md': 'Hello.\n',
  };
}

/** A page of the shape bump builds. */
export function pageOf(version) {
  return `<!DOCTYPE html>\n<html><body>${version}</body></html>\n`;
}

/** The same page, minified. */
export const MINIFIED_PAGE = '<!doctype html><html><body>old</body></html>';

/** Writes what `npm ci` would leave: every package of the lock, on disk. */
export function installFromLock(root) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const [key, { version }] of Object.entries(lock.packages)) {
    if (key !== '') writeFiles(root, { [`${key}/package.json`]: `{ "version": "${version}" }\n` });
  }
  writeFiles(root, { 'node_modules/.package-lock.json': '{}\n' });
}

const NPM_STAND_IN = String.raw`
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BUMP_FIXTURE;
const site = path.basename(process.cwd());
const written = JSON.parse(fs.readFileSync(path.join(base, 'scenario.json'), 'utf8'));
const scenario = { ...written, ...written.sites?.[site] };
const args = process.argv.slice(2);
const note = { args, site, shape: process.env.SKIP_HTML_MINIFICATION ?? null, nested: process.env.NODE_TEST_CONTEXT ?? null };
fs.appendFileSync(path.join(base, 'npm-calls.jsonl'), JSON.stringify(note) + '\n');
if (args[0] !== 'view') fs.appendFileSync(path.join(base, 'steps.log'), site + ' ' + args.slice(0, 2).join(' ') + '\n');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
};

/** Hangs until the fixture's limit. A child of its own stays behind, as a test file under npm run does. */
function hang({ ignoreTerm }) {
  const code = (ignoreTerm ? "process.on('SIGTERM', () => {});" : '') + ${JSON.stringify(hangCode())};
  const child = spawn(process.execPath, ['-e', code], { stdio: 'ignore' });
  fs.writeFileSync(path.join(base, 'hung.pid'), String(child.pid));
  if (ignoreTerm) process.on('SIGTERM', () => {});
  ${hangCode()}
}

function install() {
  if (scenario.install === 'eresolve') {
    console.error('npm error code ERESOLVE');
    console.error('npm error ERESOLVE could not resolve');
    process.exit(1);
  }
  if (scenario.install === 'hang') return hang({ ignoreTerm: false });
  const lock = readJson('package-lock.json');
  const left = Object.keys(lock.packages).filter((key) => key.includes('@docusaurus/'));
  writeJson(path.join(base, 'install-saw.json'), {
    lockKeys: left,
    coreFolder: fs.existsSync('node_modules/@docusaurus/core'),
    hiddenLock: fs.existsSync('node_modules/.package-lock.json'),
    manifest: readJson('package.json'),
  });
  const manifest = readJson('package.json');
  for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (!name.startsWith('@docusaurus/') || name.endsWith('responsive-loader')) continue;
    lock.packages['node_modules/' + name] = { version };
    writeJson('node_modules/' + name + '/package.json', { version });
  }
  for (const [key, version] of Object.entries(scenario.lockEdits ?? {})) {
    if (version === null) delete lock.packages[key];
    else lock.packages[key] = { version };
  }
  for (const [name, version] of Object.entries(scenario.diskEdits ?? {})) {
    writeJson('node_modules/' + name + '/package.json', { version });
  }
  writeJson('package-lock.json', lock);
  writeJson('node_modules/.package-lock.json', {});
}

/** True when an override sits at another major than the site's @docusaurus/core. */
function overrideShutsOut({ dependencies, overrides = {} }) {
  const major = (text) => text.replace(/^\D*/, '').split('.')[0];
  const values = Object.values(overrides).flatMap((block) => Object.values(block));
  return values.some((value) => major(value) !== major(dependencies['@docusaurus/core']));
}

function restore() {
  if (overrideShutsOut(readJson('package.json'))) {
    console.error('npm error code ERESOLVE');
    process.exit(1);
  }
  fs.rmSync('node_modules', { recursive: true, force: true });
  for (const [key, { version }] of Object.entries(readJson('package-lock.json').packages)) {
    if (key !== '') writeJson(key + '/package.json', { version });
  }
}

function build() {
  const version = readJson('node_modules/@docusaurus/core/package.json').version;
  if (scenario.build === 'fail' || scenario.failBuildOn === version) {
    console.error('the build broke');
    process.exit(1);
  }
  if (scenario.build === 'empty') return;
  if (scenario.build === 'touch') fs.appendFileSync('docs/intro.md', 'Changed by a build.\n');
  fs.mkdirSync('build', { recursive: true });
  fs.writeFileSync('build/index.html', '<!DOCTYPE html>\n<html><body>' + version + '</body></html>\n');
}

function verify() {
  if (scenario.verify === 'fail') {
    console.error('a suite failed');
    process.exit(1);
  }
  if (scenario.verify === 'hang') return hang({ ignoreTerm: false });
  if (scenario.verify === 'stubborn') return hang({ ignoreTerm: true });
}

if (args[0] === 'install') install();
if (args[0] === 'ci') restore();
if (args[0] === 'run' && args[1] === 'build') build();
if (args[0] === 'run' && args[1] === 'shared:verify') verify();
if (args[0] === 'run' && scenario.scripts?.[args[1]]) process.exit(scenario.scripts[args[1]]);
const asked = args[0] === 'view' ? /^@docusaurus\/core@(.+)$/.exec(args[1] ?? '')?.[1] : undefined;
if (asked !== undefined && (scenario.missing ?? []).includes(asked)) process.exit(1);
if (asked !== undefined) console.log(asked);
const listing = args[0] === 'view' && args[2] === 'versions';
if (listing && scenario.versions === 'unreachable') process.exit(1);
if (listing) console.log(JSON.stringify(scenario.versions ?? []));
if (args[0] === 'view' && asked === undefined && !listing) console.log(scenario.newest ?? '');
`;

const COMPARE_STAND_IN = String.raw`
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.BUMP_FIXTURE;
const site = path.basename(process.cwd());
const written = JSON.parse(fs.readFileSync(path.join(base, 'scenario.json'), 'utf8'));
const scenario = { ...written, ...written.sites?.[site] };
const args = process.argv.slice(2);
const valueOf = (flag) => args[args.indexOf(flag) + 1];
const record = { args, cwd: process.cwd(), beforePage: fs.readFileSync(path.join(valueOf('--before'), 'index.html'), 'utf8') };
fs.writeFileSync(path.join(base, 'compare-call.json'), JSON.stringify(record));
fs.appendFileSync(path.join(base, 'compare-calls.jsonl'), JSON.stringify({ site, ...record }) + '\n');
fs.appendFileSync(path.join(base, 'steps.log'), site + ' compare\n');
console.log('the end of the compare log');
const calls = fs.readFileSync(path.join(base, 'compare-calls.jsonl'), 'utf8').split('\n').filter(Boolean);
const first = calls.filter((line) => JSON.parse(line).site === site).length === 1;
const FIRST_FAILURES = {
  timeouts: ['after: no result after 180000 ms', 'before: Navigation timeout of 60000 ms exceeded'],
  broken: ['after: the server answered 404'],
};
const writeReport = (report) => {
  const out = valueOf('--out');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ browser: 'Chrome/1', out, ...report }));
};
if (first && scenario.firstReport) {
  const view = {
    pagePath: '/', theme: 'dark', viewport: 'desktop', kind: 'failed', failures: FIRST_FAILURES[scenario.firstReport],
    elementsBefore: 0, elementsAfter: 0, changedElements: 0, groups: [], firstDifference: null, onlyBefore: [], onlyAfter: [],
    notes: [], pixels: { compared: false, differing: null, total: null },
  };
  const views = [view];
  writeReport({ state: 'done', verdict: 'red', views, origins: { before: 'http://127.0.0.1:1', after: 'http://127.0.0.1:2' } });
} else if (scenario.report) {
  writeReport({ views: [], verdict: 'a list to read' });
}
process.exit(first && scenario.compareFirst !== undefined ? scenario.compareFirst : (scenario.compare ?? 0));
`;

/** Writes both stand-ins. Returns npm's command. */
export function writeStandIns(base) {
  const bin = path.join(base, 'bin');
  const npmScript = path.join(base, 'npm-stand-in.mjs');
  const command = path.join(bin, 'npm');
  fs.mkdirSync(bin);
  fs.writeFileSync(npmScript, NPM_STAND_IN);
  fs.writeFileSync(path.join(base, 'compare-stand-in.mjs'), COMPARE_STAND_IN);
  fs.writeFileSync(command, `#!/bin/sh\nexec "${process.execPath}" "${npmScript}" "$@"\n`, { mode: 0o755 });
  return command;
}

/** Marks the build as made after the last commit, however fast the test ran. */
export function freshen(root) {
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(path.join(root, 'build/index.html'), later, later);
}

/** A mounted site with a clean tree, its packages on disk and a build of the right shape. */
export function bumpSite(t, scenario = {}, { files = siteFiles(), page = pageOf(FROM) } = {}) {
  const fixture = fixtureFor(t);
  const npm = writeStandIns(fixture.base);
  const site = fixture.addSite('one', files);
  installFromLock(site);
  writeFiles(site, { 'build/index.html': page });
  freshen(site);
  const base = fixture.base;
  const keep = path.join(base, 'keep');
  const env = {
    ...fixture.env,
    BUMP_FIXTURE: base,
    PATH: `${path.dirname(npm)}:${fixture.env.PATH}`,
    [NPM_COMMAND_ENV]: npm,
    [COMPARE_SCRIPT_ENV]: path.join(base, 'compare-stand-in.mjs'),
  };
  fs.writeFileSync(path.join(base, 'scenario.json'), JSON.stringify(scenario));
  const argsOf = (args) => (args.includes('--keep') ? args : [...args, '--keep', keep]);
  const readLines = (name) => {
    const file = path.join(base, name);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [];
  };
  return {
    fixture, site, env, keep, base,
    bump: (...args) => runScript(BUMP_SCRIPT, site, argsOf(args), env),
    bumpAsync: (...args) => runScriptAsync(BUMP_SCRIPT, site, argsOf(args), env),
    bumpIn: (cwd, otherEnv, ...args) => runScript(BUMP_SCRIPT, cwd, argsOf(args), otherEnv),
    bumpNoKeep: (otherEnv, ...args) => runScript(BUMP_SCRIPT, site, args, otherEnv),
    calls: () => readLines('npm-calls.jsonl'),
    installSaw: () => JSON.parse(fs.readFileSync(path.join(base, 'install-saw.json'), 'utf8')),
    compareCall: () => JSON.parse(fs.readFileSync(path.join(base, 'compare-call.json'), 'utf8')),
    hungPid: () => Number(fs.readFileSync(path.join(base, 'hung.pid'), 'utf8')),
    setScenario: (next) => fs.writeFileSync(path.join(base, 'scenario.json'), JSON.stringify(next)),
    readSite: (name) => fs.readFileSync(path.join(site, name), 'utf8'),
    log: () => fixture.git(['log', '--format=%s'], site).split('\n'),
    head: () => fixture.git(['rev-parse', 'HEAD'], site),
    changed: () => fixture.git(['status', '--porcelain'], site),
    shell: (line) => spawnSync('sh', ['-c', line], { cwd: site, env, encoding: 'utf8' }),
    freshen: () => freshen(site),
  };
}

/** The line that starts with `label`, or the empty text. */
export function lineStarting(text, label) {
  return text.split('\n').find((line) => line.startsWith(label)) ?? '';
}

/** Polls until `check` holds or the time is up. Returns its last answer. */
export async function waitFor(check, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((resolve) => { setTimeout(resolve, 25); });
  }
  return check();
}

/** How long a test waits for a run to reach a step that never ends: far above the 2 to 15 s it takes, even loaded. */
export const REACH_STEP_MS = 120_000;

/** How long a stopped run gets to stop its own steps before it is killed. */
const GENTLE_STOP_MS = 10_000;

/** The process id a file holds, or null while it holds none (not there yet, or empty in the instant it is made). */
function pidIn(file) {
  try {
    const pid = Number(fs.readFileSync(file, 'utf8'));
    return Number.isInteger(pid) && pid > 1 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Waits until `file` holds a process id, or `child` has ended, or `limitMs` passed, and returns the id. Fails with the
 * run's output (`output()`) otherwise, so a run that ended early or a machine too slow reads as what it is.
 */
export async function waitForPidFile(child, file, output, limitMs = REACH_STEP_MS) {
  const ended = () => child.exitCode !== null || child.signalCode !== null;
  await waitFor(() => pidIn(file) !== null || ended(), limitMs);
  const pid = pidIn(file);
  const why = ended() ? `the run ended (exit ${child.exitCode ?? child.signalCode})` : `nothing after ${limitMs} ms`;
  if (pid === null) assert.fail(`${why} before its step wrote a process id:\n${output()}`);
  return pid;
}

/**
 * Stops a run as Ctrl-C would, so it stops its own steps (each sits in a process group of its own), and kills it
 * only when it has not ended GENTLE_STOP_MS later. For a test's `after`, on failure too.
 */
export function stopGently(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const kill = setTimeout(() => child.kill('SIGKILL'), GENTLE_STOP_MS);
    child.once('close', () => { clearTimeout(kill); resolve(); });
    child.kill('SIGTERM');
  });
}

/** True while a process exists. */
export function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export { PIN };
