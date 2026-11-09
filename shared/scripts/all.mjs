#!/usr/bin/env node
/**
 * scripts/all.mjs: `npm run shared:all`. One command over every site of this hub. The hub holds no list of
 * sites, so they are found from sibling `.git/config` files, and the site you run it from goes first.
 *
 *     npm run shared:all -- status                 one line per site, then the next command
 *     npm run shared:all -- pull                   each site: pull, build, shared:verify, compare
 *     npm run shared:all -- bump                   each site: pull, then shared:bump to the hub's pin
 *     npm run shared:all -- bump 3.11.0            moves the pin first, behind one question, so one line does it all
 *     npm run shared:all -- run test:shared        this npm script in each site
 *     npm run shared:all -- pull --skip my-clone   --only a,b keeps the order given. --help lists the rest
 *
 * `pull` and `bump` ask every site before they touch any. One site that cannot run means nothing runs, and the
 * refusal prints the ready --skip line. Then each site takes its turn in lib/allSite.mjs. A pull that changes only
 * shared/template builds nothing. The first red stops the run with the sha the site was on, the exact undo,
 * the sites it never touched and the ready --only line. A list to read stops it too: that site keeps its commits,
 * and a person reads the list before the next site moves. A run started again skips what is done.
 *
 * A red leaves a record inside that site's .git folder (lib/redRecord.mjs), so a run started again before its undo
 * refuses that site instead of reading it green, and shared:status names the undo and the way on. The next green
 * proof there clears it. The record keeps the red run's publish lines, and later runs print them again.
 *
 * It never pushes a site, never deploys and never starts a server. Only `bump <version>` publishes, and only
 * the pin. The end prints one chained line per site, to paste.
 *
 * It exits 0 when every site is green, 2 on a usage error, 3 on a red, 4 when it refused and changed nothing,
 * 5 when git stopped it, 6 at a conflict, 7 when the pin reached the hub and the rejoin did not, and 8 at a
 * list to read. See lib/exitCodes.mjs.
 *
 * Every import here is static on purpose: a pull replaces this very file on disk while it runs.
 *
 * HOW TO CHANGE IT
 *   The words: lib/allArgs.mjs. Which sites: lib/allSites.mjs. What is asked first: lib/allPreflight.mjs. The
 *   pin: lib/allPin.mjs. One site's turn: lib/allSite.mjs. The end: lib/allReport.mjs. `status`: lib/allStatus.mjs.
 *   What a red leaves for the next run: lib/allRed.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIONS, FLAGS, SCRIPT, USAGE, parseArgs } from './lib/allArgs.mjs';
import { pinMoveOf, publishPin } from './lib/allPin.mjs';
import { preflightRollOut, preflightScript } from './lib/allPreflight.mjs';
import { collectPending, endTurn, putBack, startTurn } from './lib/allRed.mjs';
import { endLines, publishEntries, stopLines, undoSteps } from './lib/allReport.mjs';
import { runSite } from './lib/allSite.mjs';
import { chooseSites, foundLines } from './lib/allSites.mjs';
import { statusOfSites } from './lib/allStatus.mjs';
import { lastLines, runLogged } from './lib/bumpRun.mjs';
import { LOG_TAIL_LINES, VERIFY_TIMEOUT_SECONDS } from './lib/bumpSettings.mjs';
import { findRoot, isMainCheckout } from './lib/checkout.mjs';
import { EXIT, ScriptError, runScript } from './lib/exitCodes.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { refusal, requireWordList } from './lib/preflight.mjs';
import { PREFIX, npmCommand } from './lib/settings.mjs';
import { failureOf, gateJob, timedStep } from './lib/siteGate.mjs';

/** Below the system's temp folder unless `--keep` names another. */
const KEEP_ROOT = 'docusaurus-shared-all';

/** Far above a slow suite, so that a stuck script ends instead of waiting for a person. */
const RUN_TIMEOUT_SECONDS = 1800;

const NOT_A_DIGIT = /[^0-9]/g;
const STAMP_DIGITS = 14;

/** The folder for this run's old builds, logs and compares. */
function keepFolderOf(root, named) {
  if (named !== undefined) return path.resolve(root, named);
  const stamp = new Date().toISOString().replace(NOT_A_DIGIT, '').slice(0, STAMP_DIGITS);
  return path.join(os.tmpdir(), KEEP_ROOT, `${stamp}-${process.pid}`);
}

/** What every step of a run reads. */
function newRun({ root, args, env, print }) {
  return {
    ...chooseSites(root, args, env),
    args, env, print,
    keep: keepFolderOf(root, args.keep),
    bumping: args.action === ACTIONS.BUMP,
    verifyTimeout: Number(args.verifyTimeout ?? VERIFY_TIMEOUT_SECONDS),
    pinMove: null,
    pinPublished: false,
    heads: new Map(),
    plans: new Map(),
    tested: new Set(),
    finished: [],
    pending: [],
  };
}

/** Runs the turn itself: { code, error }. A red's own message prints here. */
async function turnResult(run, site, turn, earlier) {
  try {
    const code = await turn(run, site);
    run.finished.push(site);
    return { code, error: null };
  } catch (error) {
    if (!(error instanceof ScriptError)) {
      putBack(run, site, earlier);
      throw error;
    }
    console.error(error.message);
    return { code: error.code, error };
  }
}

/** One site's turn: the code to go on or stop with. What it leaves for the next run is lib/allRed.mjs's. */
async function takeTurn(run, site, turn) {
  const { recorded, earlier } = startTurn(run, site);
  const { code, error } = await turnResult(run, site, turn, earlier);
  const steps = code === EXIT.OK ? [] : undoSteps(site.root, recorded, run.env);
  const publish = code === EXIT.OK ? [] : publishEntries(run);
  endTurn(run, site, { recorded, earlier, code, error, steps, publish }).forEach((line) => run.print(line));
  if (code !== EXIT.OK) stopLines(run, site, recorded, code, steps).forEach((line) => run.print(line));
  return code;
}

/** Takes the sites in order, and stops at the first that does not read green. */
async function everySite(run, turn) {
  for (const site of run.sites) {
    const code = await takeTurn(run, site, turn);
    if (code !== EXIT.OK) return code;
  }
  endLines(run).forEach((line) => run.print(line));
  return EXIT.OK;
}

/** `pull` and `bump`: ask every site, move the pin if asked to, then each site's turn. */
async function rollOut(run) {
  requireWordList(SCRIPT, run.env, run.args.noWordList);
  await preflightRollOut(run);
  run.pending = collectPending(run);
  run.pinMove = pinMoveOf(run);
  const published = await publishPin(run);
  return published === EXIT.OK ? everySite(run, runSite) : published;
}

/** `run`: one npm script in this site, under a limit, with its output in a log. */
async function runOwnScript(run, site) {
  const { args, env, keep, print } = run;
  const job = gateJob({ root: site.root, env, print, keep: path.join(keep, site.name) });
  const step = { command: npmCommand(env), args: ['run', args.script], cwd: site.root, env: job.stepEnv, timeoutSeconds: RUN_TIMEOUT_SECONDS };
  const result = await timedStep(job, args.script.replaceAll(':', '-'), (logFile) => runLogged({ ...step, logFile }));
  if (result.code === EXIT.OK) {
    print(`${site.name}: ok, ${args.script}, ${result.seconds} s`);
    return EXIT.OK;
  }
  const log = lastLines(result.logFile, LOG_TAIL_LINES).map((line) => `  ${line}`);
  const lines = [`${site.name}: RED at ${args.script}: ${failureOf(result)}`, ...log, `Log: ${result.logFile}`];
  throw new ScriptError(lines.join('\n'), EXIT.CHECKS);
}

/** `run`, over every site. */
async function runEverywhere(run) {
  await preflightScript(run);
  return everySite(run, runOwnScript);
}

/** Runs one action over the sites. Returns the exit code. */
export async function runAll({ root, args, env = process.env, print = console.log }) {
  if (!fs.existsSync(path.join(root, PREFIX))) {
    throw new ScriptError(`${root} has no ${PREFIX}/ folder. Run this from a site.`, EXIT.USAGE);
  }
  if (!isMainCheckout(root, env)) {
    throw refusal(SCRIPT, 'this is a worktree, and the other sites sit beside the main checkout.', { fix: 'run it in the main checkout' });
  }
  const run = newRun({ root, args, env, print });
  foundLines(run, env).forEach((line) => print(line));
  if (args.action === ACTIONS.STATUS) return statusOfSites(run);
  return args.action === ACTIONS.RUN ? runEverywhere(run) : rollOut(run);
}

/** The script's entry point. */
async function main() {
  refuseNpmKeptOptions({ flags: FLAGS, script: SCRIPT, example: `npm run ${SCRIPT} -- pull --skip my-site` });
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  return runAll({ root: findRoot(), args });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
