/**
 * scripts/lib/siteGate.mjs: the proof a site's change has to pass, for `shared:bump` and `shared:all`: the
 * old build kept outside the repository, a cold build, the site's suites under a timeout, and a compare of
 * the two builds. Both sides are made one way, so a difference between them is the change.
 *
 * A job is what every step reads: gateJob makes one, and a script adds what it needs. A red step throws a
 * ScriptError holding the end of that step's log, then whatever `job.undoLines()` gives. Each step's output
 * goes to its own log below the job's keep folder, so a script's own lines stay readable.
 *
 * The old side is the site as package.json says it stands. A failed undo can leave node_modules on the new
 * version with the old package.json back, and a build there is the new version on both sides of the compare,
 * which can read 0 changed. So keepBefore refuses a tree off its manifest before it builds anything.
 *
 * A build that went red never stays in build/. When the new side's build, the suites or the compare stop red, or a
 * signal stops them, build/ moves to the job's keep folder as RED_FOLDER, and the red's message says where. So a
 * deploy typed by hand after a red finds no build to send, and the next run builds its old side afresh. Each red
 * carries its step as `step`, and a stop its signal as `signal`, for the record lib/redRecord.mjs writes.
 *
 * HOW TO CHANGE IT
 *   Numbers, names and commands: bumpSettings.mjs. How a build is made: bumpBuild.mjs. A new step is a short
 *   function here, built on timedStep. Where a red build goes: RED_FOLDER.
 */

import fs from 'node:fs';
import path from 'node:path';
import { hasBuild, coldBuild, keepBuild, rebuildReason } from './bumpBuild.mjs';
import { installedOffManifest, pinnedEntries, readManifest } from './bumpLock.mjs';
import { lastLines, runLogged } from './bumpRun.mjs';
import { CHAIN, installSteps } from './bumpUndo.mjs';
import {
  BEFORE_FOLDER, BUILD_FOLDER, COMPARE_FILE, COMPARE_FOLDER, COMPARE_SCRIPT_ENV, FALLBACK_VERIFY_FILE, FALLBACK_VERIFY_LABEL,
  LOG_TAIL_LINES, LOGS_FOLDER, VERIFY_SCRIPT, VERIFY_TIMEOUT_SECONDS,
} from './bumpSettings.mjs';
import { loadPuppeteer, requireChrome } from './compareBrowser.mjs';
import { REPORT_FILE, summaryLines } from './compareReport.mjs';
import { loadServeHandler } from './compareServers.mjs';
import { EXIT, STOP_SIGNALS, ScriptError } from './exitCodes.mjs';
import { gitOrThrow } from './git.mjs';
import { refusal } from './preflight.mjs';
import { MS_PER_SECOND, NESTED_RUN_VARIABLE, npmCommand } from './settings.mjs';
import { pagesOf } from '../compare.mjs';

const STEP_WIDTH = 9;
const HEAD = 'HEAD';

/** The folder below a job's keep folder where a build that went red waits. */
export const RED_FOLDER = 'red';

/** One line of a report. */
export function stepLine(word, text) {
  return `${word.padEnd(STEP_WIDTH)}${text}`;
}

/** What every step reads. `scriptsFolder` holds the compare and test scripts, and `script` names the run. */
export function gateJob({
  root, env, print, keep, script, pages, ports, lockWait, scriptsFolder, verifyTimeout = VERIFY_TIMEOUT_SECONDS, undoLines = () => [],
}) {
  const stepEnv = { ...env };
  delete stepEnv[NESTED_RUN_VARIABLE];
  return {
    root, env, stepEnv, print, keep, script, pages, ports, lockWait, scriptsFolder, verifyTimeout, undoLines,
    site: path.basename(root),
    before: path.join(keep, BEFORE_FOLDER),
  };
}

/** The error of a red step, which names its step as `step`. `logFile` adds the end of that step's log. */
export function red(job, step, reason, logFile = null) {
  const log = logFile === null ? [] : [...lastLines(logFile, LOG_TAIL_LINES).map((line) => `  ${line}`), `Log: ${logFile}`];
  const error = new ScriptError([`${job.site}: RED at ${step}: ${reason}`, ...log, ...job.undoLines()].join('\n'), EXIT.CHECKS);
  error.step = step;
  return error;
}

/** The error of a run stopped from outside, which names its signal as `signal`. */
export function stoppedError(job, signal) {
  const error = new ScriptError([`${job.site}: stopped by ${signal}.`, ...job.undoLines()].join('\n'), STOP_SIGNALS[signal]);
  error.signal = signal;
  return error;
}

/**
 * Moves build/ out of the site after a red, into the job's keep folder, cloning where the disk can. Returns where it
 * went, or null when there was no build/ to move.
 */
export function setRedBuildAside(job) {
  const from = path.join(job.root, BUILD_FOLDER);
  if (!fs.existsSync(from)) return null;
  const to = path.join(job.keep, RED_FOLDER);
  fs.rmSync(to, { recursive: true, force: true });
  keepBuild(job.root, to);
  fs.rmSync(from, { recursive: true, force: true });
  return to;
}

/** The same error, once build/ is set aside, with the line that says where it went and the path as `build`. */
function withBuildAside(job, error) {
  if (!(error instanceof ScriptError)) return error;
  const aside = setRedBuildAside(job);
  if (aside === null) return error;
  const moved = new ScriptError(`${error.message}\nThe build that went red: ${aside}`, error.code);
  Object.assign(moved, { step: error.step, signal: error.signal, build: aside });
  return moved;
}

/** Runs a step of the new side, and sets build/ aside when it stops red or is stopped. */
async function newSide(job, step) {
  try {
    return await step();
  } catch (error) {
    throw withBuildAside(job, error);
  }
}

/** How a step that did not exit 0 ended. */
export function failureOf(result) {
  if (result.timedOut) return 'it ran out of time and was stopped';
  if (result.error !== null) return `it could not start: ${result.error.message}`;
  return `exit code ${result.code}`;
}

/** Runs one step with its own log. A signal ends the whole run here. */
export async function timedStep(job, name, start) {
  const logFile = path.join(job.keep, LOGS_FOLDER, `${name}.log`);
  const began = Date.now();
  const result = await start(logFile);
  if (result.stopped !== null) throw stoppedError(job, result.stopped);
  return { ...result, logFile, seconds: Math.round((Date.now() - began) / MS_PER_SECOND) };
}

/** One cold build, either side. Red unless it exits 0 and leaves a first page. */
async function buildSite(job, logName, step) {
  const { root, stepEnv } = job;
  const result = await timedStep(job, logName, (logFile) => coldBuild({ root, env: stepEnv, logFile }));
  if (result.code !== 0) throw red(job, step, failureOf(result), result.logFile);
  if (!hasBuild(root)) throw red(job, step, `it exited 0 and left no ${BUILD_FOLDER}/`, result.logFile);
  return result;
}

/** Refuses a tree whose @docusaurus packages are not what package.json asks for. A build there proves nothing. */
export function refuseOffManifest({ root, env, script }) {
  const off = installedOffManifest(root, pinnedEntries(readManifest(root)));
  if (off.length === 0) return;
  const details = off.map(({ name, spec, found }) => `${name}: package.json ${spec}, node_modules ${found ?? 'nothing'}`);
  const fix = installSteps(root, HEAD, env).join(CHAIN);
  throw refusal(script, 'node_modules does not match package.json, so no old build can be made here.', { details, fix });
}

/** The "before" side, made here when the current build cannot stand in. `step` names it in a red. */
export async function keepBefore(job, step) {
  const { root, env, print } = job;
  refuseOffManifest(job);
  const lastCommit = Number(gitOrThrow(['log', '-1', '--format=%ct'], { cwd: root, env, read: true }));
  const reason = rebuildReason(root, lastCommit);
  if (reason !== null) {
    print(stepLine('before', `${reason}, so it is built first`));
    await buildSite(job, 'before-build', step);
  }
  keepBuild(root, job.before);
  print(stepLine('before', `kept outside the repository, ${reason === null ? 'as it was' : 'built just now'}`));
}

/** The "after" side. */
export async function buildAfter(job) {
  const { seconds } = await newSide(job, () => buildSite(job, 'build', 'the build'));
  job.print(stepLine('build', `ok, cold, ${seconds} s`));
}

/** The command that proves this site: its own line, or test:shared. */
function verifyCommand({ root, env, scriptsFolder }) {
  const { scripts = {} } = readManifest(root);
  if (scripts[VERIFY_SCRIPT] !== undefined) {
    return { label: VERIFY_SCRIPT, command: npmCommand(env), args: ['run', VERIFY_SCRIPT] };
  }
  return { label: FALLBACK_VERIFY_LABEL, command: process.execPath, args: [path.join(scriptsFolder, FALLBACK_VERIFY_FILE)] };
}

/** The suites, once. A hung suite is stopped at the timeout and reads red. */
async function runSuitesOnce(job) {
  const { root, stepEnv, verifyTimeout, print } = job;
  const { label, command, args } = verifyCommand(job);
  const options = { command, args, cwd: root, env: stepEnv, timeoutSeconds: verifyTimeout };
  const result = await timedStep(job, 'verify', (logFile) => runLogged({ ...options, logFile }));
  if (result.timedOut) throw red(job, label, `still running after ${verifyTimeout} s, so it was stopped`, result.logFile);
  if (result.code !== 0) throw red(job, label, failureOf(result), result.logFile);
  print(stepLine('verify', `ok, ${label}, ${result.seconds} s`));
}

/** The suites, on the new side. */
export function runSuites(job) {
  return newSide(job, () => runSuitesOnce(job));
}

/** report.json as the compare left it, or null when there is none to read. */
function readCompareReport(out) {
  try {
    return JSON.parse(fs.readFileSync(path.join(out, REPORT_FILE), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * What the compare said: its verdict and list from report.json, or the end of its log. A report with no
 * verdict is a compare that stopped partway, so its log says more than the report does.
 */
export function compareSummary(out, logFile) {
  const report = readCompareReport(out);
  if (report !== null && report.verdict) return summaryLines(report);
  const state = report === null ? 'no report.json' : `report.json reads ${report.state ?? 'nothing'}`;
  return [`it ended before its verdict (${state}). The end of its log:`, ...lastLines(logFile, LOG_TAIL_LINES)];
}

/** The compare's options this run was given, as words on its command line. */
export function compareArgs({ pages, ports, lockWait }) {
  const given = [['--pages', pages], ['--ports', ports], ['--lock-wait', lockWait]];
  return given.filter(([, value]) => value !== undefined).flat();
}

/** The compare, on the new side. Returns EXIT.OK for "0 changed" or EXIT.TO_READ for a list. Red throws. */
export function compareBuilds(job) {
  return newSide(job, () => compareOnce(job));
}

/** The compare, once. */
async function compareOnce(job) {
  const { root, env, stepEnv, before, keep, scriptsFolder, print } = job;
  const out = path.join(keep, COMPARE_FOLDER);
  const script = env[COMPARE_SCRIPT_ENV] || path.join(scriptsFolder, COMPARE_FILE);
  const args = [script, '--before', before, '--after', BUILD_FOLDER, '--out', out, ...compareArgs(job)];
  const options = { command: process.execPath, args, cwd: root, env: stepEnv };
  const result = await timedStep(job, 'compare', (logFile) => runLogged({ ...options, logFile }));
  compareSummary(out, result.logFile).forEach((line) => print(stepLine('compare', line)));
  if (result.code === EXIT.OK || result.code === EXIT.TO_READ) return result.code;
  throw red(job, 'the compare', failureOf(result), result.logFile);
}

/** A compare that cannot run would be found out only after the change, so ask first. */
export async function refuseNoCompare({ root, env, pages }) {
  pagesOf(root, pages);
  if (env[COMPARE_SCRIPT_ENV]) return;
  await loadPuppeteer(env);
  requireChrome(env);
  loadServeHandler(root);
}
