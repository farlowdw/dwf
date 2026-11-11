#!/usr/bin/env node
/**
 * scripts/test.mjs: `npm run test:shared`. It runs the tests of what this site uses from shared/, on
 * this site's own packages, and says what it left out and why. It changes nothing, so run it whenever
 * you like: after a pull, before a push.
 *
 *     npm run test:shared
 *     npm run test:shared -- --scripts     the scripts' own real-git suites too, 6 to 8 minutes on a quiet
 *                                          machine and more under load: the browser tests start Chrome
 *
 * lib/suites.mjs picks the suites from requirements.cjs: shared/__tests__ always, a piece's suites
 * when the site uses it, the scripts' suites on --scripts or when shared/scripts changed.
 *
 * The exit code is node's own: 0 green, 1 a test failed. A green node with something wrong around it
 * exits 3: a suite with no test files, a test file that would never run, a planned file that holds no
 * test (node counts it as one passing test), a bad row of the table, a table that does not load, nothing
 * to run. Usage errors exit 2 (lib/exitCodes.mjs). The last line counts the suites left out and the tests
 * node skipped, read from a second reporter (lib/testEvents.mjs) whose file goes when the run ends.
 *
 * Nothing here can wait for ever. Node gets a time limit (--test-timeout), so a test that never settles fails by
 * its name:
 *   Node 24 and later   the limit is per test: TEST_LIMIT_SECONDS, 10 minutes. The slowest test, a browser
 *                       compare, takes about 41 s on a quiet Mac. A test failed at its limit may leave its timer
 *                       or a child running, which keeps its file open, so once the events file shows one, the
 *                       run gets STOP_GRACE_SECONDS (2 minutes, or the limit when that is shorter) to end, and is
 *                       then stopped.
 *   Node 22 and older   node applies the same flag to each test FILE as a whole (Node 24.0.0 made it per test,
 *                       nodejs/node#57672), so there the limit is FILE_LIMIT_SECONDS, 45 minutes: all.test.mjs
 *                       alone takes 12 to 15 minutes on a quiet Mac. The test that was running is named from the
 *                       events file.
 * The whole run stops at RUN_LIMIT_SECONDS, 2 hours, for a file that hangs outside any test. Every test that ran out
 * of time is a FAIL line with its file and name. TEST_LIMIT_ENV sets the limit in seconds for one run (a slower
 * machine, or a test of this script). Not --test-force-exit: it ends a file as soon as the tests it knows have run,
 * so the tests a file declares after a top-level await (compare.test.mjs's browser tests) would never run.
 *
 * HOW TO CHANGE IT
 *   A suite is a row in requirements.cjs. A new option goes in FLAGS. REPORTER is how node prints, and
 *   EVENTS_REPORTER what this script reads back. The limits are TEST_LIMIT_SECONDS, FILE_LIMIT_SECONDS,
 *   STOP_GRACE_SECONDS and RUN_LIMIT_SECONDS below.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findRoot } from './lib/checkout.mjs';
import { EXIT, STOP_SIGNALS, ScriptError, runScript } from './lib/exitCodes.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { counted } from './lib/phrases.mjs';
import { AFTER_BUMP, checkPackages, fixSteps, notInstalled, openSite, readPieces, requireTable } from './lib/requirements.mjs';
import { MS_PER_SECOND, NESTED_RUN_VARIABLE, PREFIX } from './lib/settings.mjs';
import { SCRIPTS_SUITES, planSuites, readScriptsChange } from './lib/suites.mjs';
import { readEvents } from './lib/testEvents.mjs';

const SCRIPTS_FLAG = '--scripts';
const HELP_FLAG = '--help';
const FLAGS = [SCRIPTS_FLAG, HELP_FLAG];
const USAGE = `Usage: npm run test:shared [-- ${SCRIPTS_FLAG}]`;

/** node picks tap on a pipe in some versions and spec in others. One shape, in a terminal or a log. */
const REPORTER = 'spec';

/** The second reporter: one JSON line per finished test, read back after the run. */
const EVENTS_REPORTER = pathToFileURL(fileURLToPath(new URL('./lib/testEvents.mjs', import.meta.url))).href;

/** How many package names a warning prints. */
const MAX_NAMES_SHOWN = 5;

/** Where that reporter writes, below the system's temp folder, removed when the run ends. */
const EVENTS_FOLDER = 'docusaurus-shared-test-';

/** One test's time limit, on a node that times each test: about 15 times the slowest test of the scripts' suites. */
export const TEST_LIMIT_SECONDS = 600;

/** One test file's, on a node that times each file as a whole: about 3 times the slowest file, all.test.mjs. */
export const FILE_LIMIT_SECONDS = 2700;

/** The whole run: the last stop, for a file that hangs outside any test. Above any file's limit. */
export const RUN_LIMIT_SECONDS = 7200;

/** After a test ran out of time, how long the run may take to end by itself before it is stopped. */
export const STOP_GRACE_SECONDS = 120;

/** How often the run's events are read while it runs, and how long a stopped node gets before SIGKILL. */
const WATCH_EVERY_MS = 2000;
const NODE_KILL_GRACE_MS = 30_000;

/** The mark lib/testEvents.mjs writes on a test node failed at its limit. */
const TIMED_OUT_MARK = '"timedOut":true';

/** The first node whose --test-timeout times each test rather than each file (Node 24.0.0, nodejs/node#57672). */
const PER_TEST_LIMIT_SINCE_MAJOR = 24;

/** Seconds that replace the test's (or the file's) limit for one run. */
export const TEST_LIMIT_ENV = 'DOCUSAURUS_SHARED_TEST_LIMIT';

/**
 * node sets this inside a test. A `node --test` that inherits it runs NO file and exits 0, with only
 * a warning, so a run started from inside a test would read as green. It must never reach node.
 */

/** The options, or a usage error for anything else. */
export function parseArgs(argv) {
  const unknown = argv.filter((option) => !FLAGS.includes(option));
  if (unknown.length > 0) throw new ScriptError(`Unknown option ${unknown[0]}. ${USAGE}`, EXIT.USAGE);
  return { scripts: argv.includes(SCRIPTS_FLAG), help: argv.includes(HELP_FLAG) };
}

/** The plan for this site, with the lines about packages the suites need and the site lacks. */
function readPlan(root, env, askedForScripts) {
  const table = requireTable(root, { exitCode: EXIT.CHECKS, missingFix: 'npm run shared:pull' });
  const pieces = readPieces(openSite(root, env), table);
  const scripts = askedForScripts ? { run: true, why: `${SCRIPTS_SUITES}: ${SCRIPTS_FLAG}` } : readScriptsChange(root, env);
  const plan = planSuites({ sharedRoot: path.join(root, PREFIX), table, pieces, scripts });
  const withSuites = pieces.filter(({ row }) => (row.suites ?? []).length > 0);
  const running = withSuites.filter(({ row }) => (row.suites ?? []).some((folder) => plan.runs.some((run) => run.folder === folder)));
  return { ...plan, missing: checkPackages(root, table, withSuites).problems, uninstalled: notInstalled(root, running) };
}

/** The environment node runs in. */
function nodeEnv(env) {
  const copy = { ...env };
  delete copy[NESTED_RUN_VARIABLE];
  return copy;
}

/**
 * The time limit node gets, in seconds, and what it limits: { seconds, per: 'test' | 'file' }. TEST_LIMIT_ENV, a
 * whole number above 0, replaces the default.
 */
export function nodeLimit(env = process.env, version = process.versions.node) {
  const perTest = Number(version.split('.')[0]) >= PER_TEST_LIMIT_SINCE_MAJOR;
  const given = Number(env[TEST_LIMIT_ENV]);
  const fallback = perTest ? TEST_LIMIT_SECONDS : FILE_LIMIT_SECONDS;
  return { seconds: Number.isInteger(given) && given > 0 ? given : fallback, per: perTest ? 'test' : 'file' };
}

/** True when the events file already shows a test node failed at its limit. */
function showsTimeout(events) {
  try {
    return fs.readFileSync(events, 'utf8').includes(TIMED_OUT_MARK);
  } catch {
    return false;
  }
}

/**
 * Runs node with its output as it comes, and stops it when a test ran out of time and the run did not end within
 * `graceMs`, or when it passed `runLimitMs`. Resolves { status, signal, stopped }: stopped is null, 'grace' or 'run'.
 * A stop signal sent to this script goes on to node, which stops its files, and the report still prints.
 */
function watchedNode(args, options, { events, graceMs, runLimitMs }) {
  const child = spawn(process.execPath, args, options);
  const forward = (signal) => child.kill(signal);
  Object.keys(STOP_SIGNALS).forEach((signal) => process.on(signal, forward));
  const started = Date.now();
  let lateSince = null;
  let stopped = null;
  const stop = (why) => {
    stopped = why;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), NODE_KILL_GRACE_MS).unref();
  };
  const watch = setInterval(() => {
    if (stopped !== null) return;
    if (lateSince === null && showsTimeout(events)) lateSince = Date.now();
    if (Date.now() - started > runLimitMs) stop('run');
    else if (lateSince !== null && Date.now() - lateSince > graceMs) stop('grace');
  }, WATCH_EVERY_MS);
  const done = () => {
    clearInterval(watch);
    Object.keys(STOP_SIGNALS).forEach((signal) => process.off(signal, forward));
  };
  return new Promise((resolve) => {
    child.once('error', (error) => { done(); resolve({ status: null, signal: null, stopped, error }); });
    child.once('close', (status, signal) => { done(); resolve({ status, signal, stopped }); });
  });
}

/**
 * Runs node's test runner on the files, with its output as it comes. Returns { code, finished, emptyFiles,
 * skipped, outOfTime, stopped }: node's real exit code, and what its events say.
 */
async function runNode(root, env, files) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), EVENTS_FOLDER));
  const events = path.join(folder, 'events.jsonl');
  try {
    const limit = nodeLimit(env);
    const reporters = [
      `--test-reporter=${REPORTER}`, '--test-reporter-destination=stdout',
      `--test-reporter=${EVENTS_REPORTER}`, `--test-reporter-destination=${events}`,
    ];
    const runLimitMs = Math.max(RUN_LIMIT_SECONDS, limit.seconds * 2) * MS_PER_SECOND;
    const graceMs = Math.min(STOP_GRACE_SECONDS, limit.seconds) * MS_PER_SECOND;
    const args = ['--test', `--test-timeout=${limit.seconds * MS_PER_SECOND}`, ...reporters, ...files];
    const result = await watchedNode(args, { cwd: root, env: nodeEnv(env), stdio: 'inherit' }, { events, graceMs, runLimitMs });
    if (result.status === null && result.stopped === null) console.error(`node stopped: ${result.signal ?? result.error}`);
    const code = result.stopped !== null && result.status === EXIT.OK ? EXIT.CHECKS : (result.status ?? EXIT.UNEXPECTED);
    return { code, stopped: result.stopped, graceMs, runLimitMs, limit, ...readEvents(events, files, root) };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

/** The FAIL lines for what ran out of time: each test by its file and name, and the run itself when it was stopped. */
function timeProblems({ outOfTime = [], stopped = null, graceMs = 0, runLimitMs = 0, limit }) {
  const per = limit?.per === 'file' ? `its file's limit of ${limit.seconds} s` : `the limit of ${limit?.seconds} s a test`;
  const lines = outOfTime.map((place) => `ran out of time (${per}): ${place}`);
  if (stopped === 'grace') lines.push(`the run was stopped ${graceMs / MS_PER_SECOND} s after a test ran out of time, since its file did not end`);
  if (stopped === 'run') lines.push(`the run passed its limit of ${runLimitMs / MS_PER_SECOND} s and was stopped`);
  return lines;
}

/** What node's events show is wrong around a green run. */
function eventProblems({ code, finished, emptyFiles }) {
  if (code !== EXIT.OK) return [];
  if (!finished) return ['node wrote no totals, so what it ran is not known'];
  return emptyFiles.map((file) => `${file} holds no test: node counts it as one passing test`);
}

/** One line of the report. */
function line(word, folder, why) {
  return `${word.padEnd(5)} ${folder}: ${why}`;
}

/** What a site lacks, then the line that fixes it. A suite that needs it fails by itself. */
function missingLines(missing) {
  if (missing.length === 0) return [];
  const lines = missing.map(({ name, range, found, pieces }) =>
    `warn  ${name}: needs ${range}, found ${found ?? 'nothing'} (${pieces.join(', ')})`);
  const [first, ...later] = fixSteps(missing);
  return [...lines, `warn  fix: ${first}`, ...later.map((step) => `warn  ${AFTER_BUMP} ${step}`)];
}

/** Packages the running suites need that are in the lock and not on disk: an install comes first. */
function uninstalledLines(uninstalled) {
  if (uninstalled.length === 0) return [];
  const shown = uninstalled.slice(0, MAX_NAMES_SHOWN).join(', ');
  const more = uninstalled.length > MAX_NAMES_SHOWN ? `, and ${uninstalled.length - MAX_NAMES_SHOWN} more` : '';
  return [`warn  ${counted(uninstalled.length, 'package')} the suites need ${uninstalled.length === 1 ? 'is' : 'are'} not installed here: ${shown}${more}`, 'warn  fix: npm ci, then run this again'];
}

/** The last line of the report: the suites run and left out, and the tests node itself skipped. */
function summary(plan, fileCount, skipped, code) {
  const ran = `${counted(plan.runs.length, 'suite')} run (${counted(fileCount, 'file')})`;
  return `test:shared: ${ran}, ${plan.skips.length} left out, node skipped ${counted(skipped, 'test')}, exit ${code}`;
}

/** Runs the site's suites, prints the report and resolves the exit code. */
export async function runSharedTests({ root, env = process.env, scripts = false, print = console.log }) {
  const plan = readPlan(root, env, scripts);
  const files = plan.runs.flatMap((run) => run.files.map((file) => path.posix.join(PREFIX, file)));
  const problems = files.length > 0 ? plan.problems : [...plan.problems, 'no test files to run'];
  plan.runs.forEach(({ folder, why, files: own }) => print(line('run', folder, `${why}, ${counted(own.length, 'file')}`)));
  missingLines(plan.missing).forEach((text) => print(text));
  uninstalledLines(plan.uninstalled).forEach((text) => print(text));
  const node = files.length > 0 ? await runNode(root, env, files) : { code: EXIT.OK, finished: true, emptyFiles: [], skipped: 0 };
  plan.skips.forEach(({ folder, why }) => print(line('skip', folder, why)));
  const allProblems = [...problems, ...timeProblems(node), ...eventProblems(node)];
  allProblems.forEach((problem) => print(`FAIL  ${problem}`));
  const code = node.code === EXIT.OK && allProblems.length > 0 ? EXIT.CHECKS : node.code;
  print(summary(plan, files.length, node.skipped, code));
  return code;
}

/** The script's entry point. */
async function main() {
  refuseNpmKeptOptions({ flags: [SCRIPTS_FLAG], script: 'test:shared', example: `npm run test:shared -- ${SCRIPTS_FLAG}` });
  const { scripts, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  const root = findRoot();
  if (!fs.existsSync(path.join(root, PREFIX))) {
    throw new ScriptError(`${root} has no ${PREFIX}/ folder. Run this from a site.`, EXIT.USAGE);
  }
  return runSharedTests({ root, scripts });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
