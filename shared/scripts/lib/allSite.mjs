/**
 * scripts/lib/allSite.mjs: one site's turn in a `shared:all` roll-out. It reads the state again, because the
 * pin may just have reached the hub, works out what this site needs, and does that.
 *
 *   nothing to pull, nothing to bump    no step at all
 *   only shared/template changed        the pull alone: the pin is not in any build, so nothing is proved
 *   anything else changed               old build kept, pull, cold build, shared:verify, compare
 *   off the version                     old build kept, pull if there is one, then shared:bump does the rest
 *
 * The old build is kept before the pull, so one proof covers the pull and the bump together. It goes to
 * shared:bump through `--before`: the pull is a newer commit than build/, and bump would build the old side
 * again, with the pull already in it. Each site runs its own copy of the scripts, because the hub's new
 * ones are what it should run once it has pulled.
 *
 * A step that stops throws a ScriptError with the code to leave with. "A list to read" is not an error: it
 * comes back as the turn's result. The plan stays in `run.plans`, for the record a red leaves (lib/allRed.mjs).
 *
 * HOW TO CHANGE IT
 *   What needs proof: planSite. The step's lines: stepLine in lib/siteGate.mjs. The stop's wording: lib/allReport.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SCRIPT } from './allArgs.mjs';
import { lastLines, runGroup, runLogged } from './bumpRun.mjs';
import { KILL_GRACE_MS, LOG_TAIL_LINES } from './bumpSettings.mjs';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { git, gitOrThrow } from './git.mjs';
import { counted, short } from './phrases.mjs';
import { hubPin } from './pin.mjs';
import { NO_WORD_LIST_FLAG, freshState, refusal } from './preflight.mjs';
import { PREFIX, SCRIPTS_FOLDER, TEMPLATE_FOLDER } from './settings.mjs';
import {
  COMPARE_GRACE_MS, buildAfter, compareArgs, compareBuilds, gateJob, keepBefore, runSuites, stepLine, stoppedError, timedStep,
} from './siteGate.mjs';
import { isDone } from '../bump.mjs';
import { PULLABLE } from '../pull.mjs';

/**
 * A site's own shared:bump gets this long to stop after SIGTERM: longer than its steps' own grace (a compare's
 * COMPARE_GRACE_MS), so it can stop its step, write its record and set build/ aside before it is killed.
 */
const OUTER_BUMP_GRACE_MS = COMPARE_GRACE_MS + KILL_GRACE_MS + 5000;

const PULL_FILE = 'pull.mjs';
const BUMP_FILE = 'bump.mjs';
const BEFORE_STEP = 'the build before the pull';

/** The step a red names when the site's own pull stops it, as after a pull the site lacks a package for. */
const PULL_STEP = 'shared:pull';

/** A site's own copy of a script, as `node` reads it from the site's root. */
function ownScript(file) {
  return path.join(PREFIX, SCRIPTS_FOLDER, file);
}

/** The commit a site is on. */
export function headOf(root, env) {
  return gitOrThrow(['rev-parse', 'HEAD'], { cwd: root, env, read: true });
}

/** The version this site should end on: the one named, or the pin the hub holds. */
function targetOf({ args, env }, { root }) {
  if (args.version !== undefined) return args.version;
  const { version, problems } = hubPin(root, env);
  if (version !== null) return version;
  throw refusal(SCRIPT, `the hub's pin gives no version: ${problems.join('; ')}.`, { fix: `name one: npm run ${SCRIPT} -- bump <version>` });
}

/** The files a pull would change here. Deleted files count, so this asks git and not lib/hubChanges.mjs. */
function filesPullChanges(root, { headTree, upstreamTree }, env) {
  const args = ['diff', '--name-only', '--no-renames', '-z', headTree, upstreamTree];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return stdout.split('\0').filter(Boolean);
}

/**
 * What this site needs: { pulls, moves, bumps, gate, target, incoming, upstream }. `moves` means the pull changes a
 * file outside the template, and `gate` that something must be proved.
 */
export function planSite(run, site, state) {
  const { root } = site;
  const pulls = PULLABLE.has(state.state);
  const files = pulls ? filesPullChanges(root, state, run.env) : [];
  const moves = files.some((file) => !file.startsWith(`${TEMPLATE_FOLDER}/`));
  const target = run.bumping ? targetOf(run, site) : null;
  const bumps = run.bumping && !isDone(root, target, run.env);
  return { pulls, moves, bumps, target, gate: moves || bumps, incoming: state.incoming?.length, upstream: state.upstream };
}

/** A job for this site, with its own folder below the run's. */
export function siteJob(run, site) {
  return gateJob({
    root: site.root,
    env: run.env,
    print: run.print,
    script: SCRIPT,
    keep: path.join(run.keep, site.name),
    ports: run.args.ports,
    lockWait: run.args.lockWait,
    scriptsFolder: path.join(site.root, PREFIX, SCRIPTS_FOLDER),
    verifyTimeout: run.verifyTimeout,
  });
}

/** Keeps the old build, unless the pin step already did for this site. */
export async function keepOldBuild(job) {
  if (!fs.existsSync(job.before)) await keepBefore(job, BEFORE_STEP);
}

/** The line for a pull that went through. */
function pulledText({ gate, incoming, upstream }) {
  const pulled = `ok, ${counted(incoming, 'commit')}, the hub is at ${short(upstream)}`;
  return gate ? pulled : `${pulled}. Nothing outside ${PREFIX}/${TEMPLATE_FOLDER} changed, so nothing is built`;
}

/** The site's own pull. It scans again and merges, and its output goes to a log. */
async function pullSite(run, site, job, plan) {
  const args = [ownScript(PULL_FILE), ...(run.args.noWordList ? [NO_WORD_LIST_FLAG] : [])];
  const step = { command: process.execPath, args, cwd: site.root, env: job.stepEnv };
  const result = await timedStep(job, 'pull', (logFile) => runLogged({ ...step, logFile }));
  if (result.code === EXIT.OK) {
    run.print(stepLine('pull', pulledText(plan)));
    return;
  }
  const log = lastLines(result.logFile, LOG_TAIL_LINES).map((line) => `  ${line}`);
  const lines = [`${site.name}: shared:pull stopped with exit code ${result.code}`, ...log, `Log: ${result.logFile}`];
  const error = new ScriptError(lines.join('\n'), result.code ?? EXIT.CHECKS);
  error.step = PULL_STEP;
  throw error;
}

/**
 * The site's own bump, with its lines on this run's streams. 0 and 8 are results, and bump has committed on
 * both. Anything else stops the run, and bump has printed why.
 */
async function bumpSite(run, site, job, { target }) {
  const options = ['--keep', job.keep, '--before', job.before, '--verify-timeout', String(job.verifyTimeout), ...compareArgs(job)];
  const args = [ownScript(BUMP_FILE), target, ...options];
  const stdio = ['ignore', 'inherit', 'inherit'];
  const result = await runGroup({ command: process.execPath, args, cwd: site.root, env: job.stepEnv, stdio, graceMs: OUTER_BUMP_GRACE_MS });
  if (result.stopped !== null) throw stoppedError(job, result.stopped);
  if (result.code === EXIT.OK || result.code === EXIT.TO_READ) return result.code;
  throw new ScriptError(`${site.name}: shared:bump stopped with exit code ${result.code}`, result.code ?? EXIT.CHECKS);
}

/** A pull's proof, for a site with no bump to run. */
async function proveSite(job) {
  await buildAfter(job);
  await runSuites(job);
  return compareBuilds(job);
}

/** One site's turn. Returns EXIT.OK or EXIT.TO_READ. A stop throws. */
export async function runSite(run, site) {
  const { print, env } = run;
  const plan = planSite(run, site, freshState(site.root, env));
  run.plans.set(site.name, plan);
  if (!plan.pulls && !plan.gate) {
    print(`${site.name}: nothing to do.`);
    return EXIT.OK;
  }
  const job = siteJob(run, site);
  print(`${site.name}: at ${short(headOf(site.root, env))}. Its old build and logs: ${job.keep}`);
  if (plan.gate) await keepOldBuild(job);
  if (plan.pulls) await pullSite(run, site, job, plan);
  if (!plan.gate) return EXIT.OK;
  const verdict = plan.bumps ? await bumpSite(run, site, job, plan) : await proveSite(job);
  run.tested.add(site.name);
  return verdict;
}
