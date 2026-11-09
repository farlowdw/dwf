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
 * HOW TO CHANGE IT
 *   A suite is a row in requirements.cjs. A new option goes in FLAGS. REPORTER is how node prints, and
 *   EVENTS_REPORTER what this script reads back.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findRoot } from './lib/checkout.mjs';
import { EXIT, ScriptError, runScript } from './lib/exitCodes.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { counted } from './lib/phrases.mjs';
import { AFTER_BUMP, checkPackages, fixSteps, notInstalled, openSite, readPieces, requireTable } from './lib/requirements.mjs';
import { NESTED_RUN_VARIABLE, PREFIX } from './lib/settings.mjs';
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
 * Runs node's test runner on the files, with its output as it comes. Returns { code, finished, emptyFiles,
 * skipped }: node's real exit code, and what its events say.
 */
function runNode(root, env, files) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), EVENTS_FOLDER));
  const events = path.join(folder, 'events.jsonl');
  try {
    const reporters = [
      `--test-reporter=${REPORTER}`, '--test-reporter-destination=stdout',
      `--test-reporter=${EVENTS_REPORTER}`, `--test-reporter-destination=${events}`,
    ];
    const result = spawnSync(process.execPath, ['--test', ...reporters, ...files], { cwd: root, env: nodeEnv(env), stdio: 'inherit' });
    if (result.status === null) console.error(`node stopped: ${result.signal ?? result.error}`);
    return { code: result.status ?? EXIT.UNEXPECTED, ...readEvents(events, files, root) };
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
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

/** Runs the site's suites, prints the report and returns the exit code. */
export function runSharedTests({ root, env = process.env, scripts = false, print = console.log }) {
  const plan = readPlan(root, env, scripts);
  const files = plan.runs.flatMap((run) => run.files.map((file) => path.posix.join(PREFIX, file)));
  const problems = files.length > 0 ? plan.problems : [...plan.problems, 'no test files to run'];
  plan.runs.forEach(({ folder, why, files: own }) => print(line('run', folder, `${why}, ${counted(own.length, 'file')}`)));
  missingLines(plan.missing).forEach((text) => print(text));
  uninstalledLines(plan.uninstalled).forEach((text) => print(text));
  const node = files.length > 0 ? runNode(root, env, files) : { code: EXIT.OK, finished: true, emptyFiles: [], skipped: 0 };
  plan.skips.forEach(({ folder, why }) => print(line('skip', folder, why)));
  const allProblems = [...problems, ...eventProblems(node)];
  allProblems.forEach((problem) => print(`FAIL  ${problem}`));
  const code = node.code === EXIT.OK && allProblems.length > 0 ? EXIT.CHECKS : node.code;
  print(summary(plan, files.length, node.skipped, code));
  return code;
}

/** The script's entry point. */
function main() {
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
