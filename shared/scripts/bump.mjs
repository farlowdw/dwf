#!/usr/bin/env node
/**
 * scripts/bump.mjs: `npm run shared:bump`. It moves this site to one Docusaurus version and proves the
 * move: install, cold build, the site's suites, a compare against the old build. When nothing is red it
 * commits package.json and the lock, so a later site's failure leaves this one clean.
 *
 *     npm run shared:bump                 to the version in shared/template/package.json
 *     npm run shared:bump -- 3.11.0       to this version: a rehearsal, or a step down
 *     npm run shared:bump -- --help       the other options
 *
 * A version outside the @docusaurus ranges of shared/requirements.cjs is refused before anything changes, with the
 * newest version npm has inside them: the site's own shared:verify would fail on it.
 *
 * On a clean tree it:
 *   1. keeps the current build outside the repository as "before", first rebuilding it when it is older
 *      than the last commit or another shape (lib/bumpBuild.mjs), and refusing when node_modules is off
 *      package.json. `--before <folder>` hands in a build kept already, as shared:all does when a pull comes first;
 *   2. rewrites every @docusaurus entry of package.json to the one version;
 *   3. takes those entries out of the lock and node_modules (lib/bumpLock.mjs says why);
 *   4. runs npm install, and stops there when it fails, with nothing built. It never forces it;
 *   5. checks that exactly one @docusaurus version remains, in the lock and in node_modules;
 *   6. prints how many @mui lock entries moved. Any @mui/x-* entry that moved is red;
 *   7. runs a cold build, the same shape as the "before" side;
 *   8. runs `shared:verify`, or test:shared on a site without that line, under a timeout;
 *   9. compares the two builds;
 *  10. commits, prints the undo and the line that publishes what was tested. It never pushes or deploys.
 *
 * A site already on the version is skipped, so a run can start again after a red on another site.
 * Every step's output goes to a log beside the old build, and a red step prints the end of its log.
 * A red leaves the two files changed and prints the undo, which lib/bumpUndo.mjs writes for the commit the
 * run started from. A red at the build, the suites or the compare moves build/ beside the old build, so no deploy
 * can send it. A red also leaves a record inside .git (lib/redRecord.mjs), which shared:status reads, and a bump that
 * commits takes it away. A site that still holds the pull a red shared:all went red on is refused, with its undo.
 * This script never runs a dev server.
 *
 * It exits 0 on "0 changed" and on a skip, 8 when it committed and the compare left a list to read, 3 on
 * a red, 4 when it refused and changed nothing, 5 when the commit failed. See lib/exitCodes.mjs.
 *
 * HOW TO CHANGE IT
 *   Numbers, names and commands: lib/bumpSettings.mjs. A new option goes in VALUE_FLAGS and USAGE.
 *   The order of the steps is `runBump`. A step of its own is one short function above it, and the steps
 *   shared:all uses too are in lib/siteGate.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cutInstalled, installedOffVersion, isOnVersion, muiMoves, muiVersions, muiXMoves, overrideLines, peerOverrideLines,
  pinnedEntries, readLock, readManifest, writeManifest,
} from './lib/bumpLock.mjs';
import { runLogged } from './lib/bumpRun.mjs';
import {
  CHANGED_FILES, INSTALL_ARGS, INSTALL_TIMEOUT_SECONDS, KEEP_ROOT, VERIFY_TIMEOUT_SECONDS, commitSubject,
} from './lib/bumpSettings.mjs';
import { CHAIN, CHECKOUT_LINE, installSteps } from './lib/bumpUndo.mjs';
import { currentBranch, dirtyPaths, findRoot } from './lib/checkout.mjs';
import { portsInRange } from './lib/compareServers.mjs';
import { COMPARE_SIDES, LOCK_WAIT_SECONDS } from './lib/compareSettings.mjs';
import { deployLine } from './lib/deployLine.mjs';
import { EXIT, ScriptError, isRedStop, runScript } from './lib/exitCodes.mjs';
import { git, gitOrThrow } from './lib/git.mjs';
import { refuseWhenListening } from './lib/listeners.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { short } from './lib/phrases.mjs';
import { DOCUSAURUS_LABEL, lockedVersions, readPin } from './lib/pin.mjs';
import { refuseOutsideRanges } from './lib/pinRange.mjs';
import { refuseDirty, refuseHeldRed, refusal } from './lib/preflight.mjs';
import { readVersionWord } from './lib/range.mjs';
import { KINDS, RECORD_SCRIPTS, readRecord, removeRecord, writeRecord } from './lib/redRecord.mjs';
import { BUILD_ENTRY, LOCK_FILE, MANIFEST_FILE, npmCommand } from './lib/settings.mjs';
import { readState } from './lib/state.mjs';
import {
  buildAfter, compareBuilds, failureOf, gateJob, keepBefore, red, refuseNoCompare, runSuites, stepLine, timedStep,
} from './lib/siteGate.mjs';
import { lockWaitOf } from './compare.mjs';

const SCRIPT = 'shared:bump';
const SCRIPTS_FOLDER = path.dirname(fileURLToPath(import.meta.url));

const HELP_FLAG = '--help';
const VALUE_FLAGS = Object.freeze({
  '--keep': 'keep',
  '--before': 'before',
  '--pages': 'pages',
  '--verify-timeout': 'verifyTimeout',
  '--ports': 'ports',
  '--lock-wait': 'lockWait',
});
const FLAGS = [...Object.keys(VALUE_FLAGS), HELP_FLAG];
const USAGE = [
  'Usage: npm run shared:bump [-- <version>] [options]',
  '  <version>                  move to this version. Default: the pin in shared/template/package.json',
  '  --keep <folder>            where the old build, the logs and the compare go, outside the repository.',
  '                             Default: a new temp folder',
  '  --before <folder>          the old build, kept already. Default: the current build, kept by this run',
  '  --pages /a/,/b/            compare these pages. Default: comparePages in package.json',
  `  --verify-timeout <seconds> how long the suites may run. Default: ${VERIFY_TIMEOUT_SECONDS}`,
  '  --ports <from>-<to>        the compare serves on these ports. Default: free ports the system picks',
  `  --lock-wait <seconds>      how long the compare waits for the sweep lock. Default: ${LOCK_WAIT_SECONDS}`,
  '  --help                     this list',
].join('\n');

const WHOLE_NUMBER = /^[1-9]\d*$/;
const NOT_A_DIGIT = /[^0-9]/g;
const STAMP_DIGITS = 14;

/** A usage error, with the list of options. */
function usageError(sentence) {
  return new ScriptError(`${sentence}\n${USAGE}`, EXIT.USAGE);
}

/** The options as { version, keep, before, pages, verifyTimeout, ports, lockWait, help }, or a usage error. */
export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];
    if (word === HELP_FLAG) {
      options.help = true;
    } else if (word.startsWith('-')) {
      if (VALUE_FLAGS[word] === undefined) throw usageError(`Unknown option ${word}.`);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) throw usageError(`${word} needs a value.`);
      options[VALUE_FLAGS[word]] = value;
      index += 1;
    } else if (options.version !== undefined) {
      throw usageError('Name one version.');
    } else {
      options.version = readVersionWord(word, usageError);
    }
  }
  return options;
}

/** The seconds the suites may run. */
function verifyTimeoutOf(text) {
  if (text === undefined) return VERIFY_TIMEOUT_SECONDS;
  if (!WHOLE_NUMBER.test(text)) throw usageError(`--verify-timeout wants seconds, and reads ${text}.`);
  return Number(text);
}

/** The compare's two options, read now, because the compare itself comes after the install. */
function compareOptionsOf({ ports, lockWait }) {
  if (ports !== undefined) portsInRange(ports, COMPARE_SIDES);
  if (lockWait !== undefined) lockWaitOf(lockWait);
  return { ports, lockWait };
}

/** The version to move to: the one named, or the pin. */
function targetVersion(root, named) {
  if (named !== undefined) return named;
  const { version, problems } = readPin(root);
  if (version !== null) return version;
  const fix = 'name one: npm run shared:bump -- <version>';
  throw refusal(SCRIPT, `the pin gives no version: ${problems.join('; ')}.`, { fix });
}

/** The folder for the old build, the logs and the compare. */
function keepFolderOf(root, named) {
  if (named !== undefined) return path.resolve(root, named);
  const stamp = new Date().toISOString().replace(NOT_A_DIGIT, '').slice(0, STAMP_DIGITS);
  return path.join(os.tmpdir(), KEEP_ROOT, `${path.basename(root)}-${stamp}-${process.pid}`);
}

/** What every step reads, and what a red needs to say. */
function newJob({ root, args, env, print, version }) {
  const gate = gateJob({
    root, env, print,
    ...compareOptionsOf(args),
    script: SCRIPT,
    keep: keepFolderOf(root, args.keep),
    pages: args.pages,
    scriptsFolder: SCRIPTS_FOLDER,
    verifyTimeout: verifyTimeoutOf(args.verifyTimeout),
  });
  const job = {
    ...gate,
    version,
    keptBefore: args.before !== undefined,
    before: args.before === undefined ? gate.before : path.resolve(root, args.before),
    head: gitOrThrow(['rev-parse', 'HEAD'], { cwd: root, env, read: true }),
    changed: false,
    muiBefore: new Map(),
  };
  job.undoLines = () => undoLines(job);
  return job;
}

/** True when this site needs nothing. A red run's leftovers look the same, so they do not count. */
export function isDone(root, version, env) {
  if (!isOnVersion(root, version)) return false;
  const dirty = dirtyPaths(root, env);
  return !CHANGED_FILES.some((file) => dirty.includes(file));
}

/** Without a manifest there is no site here to read. */
function refuseNoManifest(root) {
  if (fs.existsSync(path.join(root, MANIFEST_FILE))) return;
  throw refusal(SCRIPT, `${root} has no ${MANIFEST_FILE}.`, { fix: 'run this from a site' });
}

/** A bump needs a lock to read and a Docusaurus to move. */
export function refuseWrongSite(root) {
  if (!fs.existsSync(path.join(root, LOCK_FILE))) {
    throw refusal(SCRIPT, `there is no ${LOCK_FILE}.`, { fix: 'run npm install once and commit the lock' });
  }
  if (pinnedEntries(readManifest(root)).length === 0) {
    throw refusal(SCRIPT, `${MANIFEST_FILE} lists no ${DOCUSAURUS_LABEL} package.`);
  }
}

/** A commit made on a detached HEAD is easy to lose. */
function refuseDetached(root, env) {
  if (currentBranch(root, env) !== null) return;
  throw refusal(SCRIPT, 'this checkout is on a detached HEAD.', { fix: 'git switch <branch>' });
}

/** The old build must stay out of the repository. */
function refuseKeepInside({ root, keep, before, keptBefore }) {
  if (keep === root || keep.startsWith(`${root}${path.sep}`)) {
    throw refusal(SCRIPT, `--keep names ${keep}, which is inside the repository.`, { fix: 'name a folder outside it' });
  }
  if (keptBefore) {
    if (fs.existsSync(path.join(before, BUILD_ENTRY))) return;
    throw refusal(SCRIPT, `--before names ${before}, which holds no build.`, { fix: 'name a folder that holds a build' });
  }
  if (fs.existsSync(before)) {
    throw refusal(SCRIPT, `${before} exists.`, { fix: 'name a new folder with --keep' });
  }
}

/** What takes a site back to where a red run found it. */
function redUndoLine({ root, head, env }) {
  return [CHECKOUT_LINE, ...installSteps(root, head, env)].join(CHAIN);
}

/** Everything that stops a run before it changes anything. */
async function refuseUnready(job) {
  const { root, env } = job;
  refuseWrongSite(root);
  refuseDetached(root, env);
  refuseDirty(root, { script: SCRIPT, env, fix: `commit them, or if a red run left them: ${redUndoLine(job)}` });
  refuseHeldRed(root, { script: SCRIPT, env, kinds: [KINDS.PULL] });
  refuseWhenListening(root, { script: SCRIPT });
  refuseKeepInside(job);
  const fix = 'name a version inside it, or change the range in shared/requirements.cjs and push that first';
  refuseOutsideRanges({ root, env, version: job.version, script: SCRIPT, fix });
  await refuseNoCompare(job);
}

/** What a red here leaves for shared:status and the next run, once the files have changed. */
function bumpRecord(job, error) {
  const { root, env, head, version, site } = job;
  return {
    kind: KINDS.BUMP,
    script: RECORD_SCRIPTS.BUMP,
    site,
    step: error.step ?? null,
    signal: error.signal ?? null,
    at: head,
    head,
    hub: readState(root, { fetch: false, env }).recorded ?? null,
    moved: false,
    version,
    pin: null,
    undo: [CHECKOUT_LINE, ...installSteps(root, head, env)],
    publish: [],
    build: error.build ?? null,
    when: new Date().toISOString(),
  };
}

/** Leaves a record of a red that changed the files, then hands the error on. */
function noteRed(job, error) {
  if (error instanceof ScriptError && isRedStop(error.code) && job.changed) writeRecord(job.root, bumpRecord(job, error), job.env);
  return error;
}

/** A bump that committed is the proof a bump's red here waited for. A pull's red is not its business. */
function clearBumpRed({ root, env }) {
  if (readRecord(root, env)?.kind === KINDS.BUMP) removeRecord(root, env);
}

/** What ends a red report: the undo, or that nothing needs undoing. */
function undoLines(job) {
  const { changed, before } = job;
  if (!changed) return ['Nothing was changed.'];
  const kept = fs.existsSync(before) ? [`The build as it was: ${before}`] : [];
  return [`Undo: ${redUndoLine(job)}`, ...kept];
}

/** Steps 2 and 3. */
function changeFiles(job) {
  const { root, version, print } = job;
  const lock = readLock(root);
  job.muiBefore = muiVersions(lock);
  job.changed = true;
  const entries = writeManifest(root, version);
  const removed = cutInstalled(root);
  print(stepLine('files', `package.json entries rewritten: ${entries}, lock entries cut: ${removed}`));
  const manifest = readManifest(root);
  const byHand = [...overrideLines(manifest, version), ...peerOverrideLines(manifest, lock, version)];
  byHand.forEach((line) => print(stepLine('by hand', line)));
}

/** Step 4. */
async function installPackages(job) {
  const { root, env, stepEnv, print } = job;
  const options = { command: npmCommand(env), args: [...INSTALL_ARGS], cwd: root, env: stepEnv };
  const start = (logFile) => runLogged({ ...options, logFile, timeoutSeconds: INSTALL_TIMEOUT_SECONDS });
  const result = await timedStep(job, 'install', start);
  if (result.code !== 0) throw red(job, 'the install', `${failureOf(result)}. Nothing was built.`, result.logFile);
  print(stepLine('install', `ok, ${result.seconds} s`));
}

/** Step 5: one version, in the lock and on disk. */
function checkOneVersion(job) {
  const { root, version, print } = job;
  const locked = [...(lockedVersions(root)?.keys() ?? [])];
  if (locked.length !== 1 || locked[0] !== version) {
    throw red(job, 'the version check', `the lock holds ${locked.join(', ') || 'none'}, not ${version} alone. Nothing was built.`);
  }
  const off = installedOffVersion(root, pinnedEntries(readManifest(root)), version);
  if (off.length > 0) {
    const named = off.map(({ name, found }) => `${name} is ${found ?? 'missing'}`).join(', ');
    throw red(job, 'the version check', `node_modules disagrees with the lock: ${named}. Nothing was built.`);
  }
  print(stepLine('version', `one ${DOCUSAURUS_LABEL} version, ${version}`));
}

/** One moved entry, in words. */
function moveText({ name, from, to }) {
  return `${name} ${from ?? 'absent'} -> ${to ?? 'removed'}`;
}

/** Step 6: @mui entries may be counted, and @mui/x-* entries may not move at all. */
function checkMui(job) {
  const moves = muiMoves(job.muiBefore, muiVersions(readLock(job.root)));
  job.print(stepLine('mui', `@mui lock entries moved: ${moves.length}`));
  moves.forEach((move) => job.print(stepLine('mui', moveText(move))));
  const refused = muiXMoves(moves);
  if (refused.length === 0) return;
  const named = refused.map(moveText).join(', ');
  throw red(job, 'the @mui check', `no @mui/x-* lock entry may move: ${named}. Nothing was built.`);
}

/** Step 10: the two files, alone. Anything else a step changed stops the commit. */
function commitBump(job) {
  const { root, env, version, print } = job;
  const strays = dirtyPaths(root, env).filter((file) => !CHANGED_FILES.includes(file));
  if (strays.length > 0) {
    throw red(job, 'the commit', `a step changed ${strays.join(', ')}, so nothing was committed.`);
  }
  const result = git(['commit', '-q', '-m', commitSubject(version), '--', ...CHANGED_FILES], { cwd: root, env });
  if (!result.ok) {
    const lines = [`${job.site}: git commit stopped with exit code ${result.status}: ${result.stderr}`, ...undoLines(job)];
    throw new ScriptError(lines.join('\n'), EXIT.GIT);
  }
  const sha = gitOrThrow(['rev-parse', 'HEAD'], { cwd: root, env, read: true });
  print(stepLine('commit', `${short(sha)} ${commitSubject(version)}`));
}

/** The last lines: how to go back, what to read, and how to publish what was tested. */
function printEnd({ root, head, env, print }, verdict) {
  const steps = [`git reset --keep ${short(head)}`, ...installSteps(root, head, env)];
  print(`Undo: ${steps.join(CHAIN)}`);
  if (verdict === EXIT.TO_READ) print('Read the list above before you push.');
  print(`Next: ${deployLine(root)}`);
}

/** Says so when a named version is not the pin, which shared:status will then report. */
function printPinNote({ root, version, print }) {
  const pin = readPin(root).version;
  if (pin !== null && pin !== version) print(stepLine('pin', `the pin says ${pin}, and this run moves to ${version}`));
}

/** Runs the steps in order and returns the exit code. */
export async function runBump({ root, args, env = process.env, print = console.log }) {
  refuseNoManifest(root);
  const version = targetVersion(root, args.version);
  const site = path.basename(root);
  if (isDone(root, version, env)) {
    print(`${site}: already on ${DOCUSAURUS_LABEL} ${version}, nothing to do.`);
    return EXIT.OK;
  }
  const job = newJob({ root, args, env, print, version });
  await refuseUnready(job);
  const from = [...(lockedVersions(root)?.keys() ?? [])].join(', ');
  print(`${site}: ${DOCUSAURUS_LABEL} ${from} -> ${version}. The old build and the logs: ${job.keep}`);
  printPinNote(job);
  if (!job.keptBefore) await keepBefore(job, 'the build before the bump');
  const verdict = await changeAndProve(job);
  clearBumpRed(job);
  printEnd(job, verdict);
  return verdict;
}

/** Steps 2 to 10. A red among them leaves its record. */
async function changeAndProve(job) {
  try {
    changeFiles(job);
    await installPackages(job);
    checkOneVersion(job);
    checkMui(job);
    await buildAfter(job);
    await runSuites(job);
    const verdict = await compareBuilds(job);
    commitBump(job);
    return verdict;
  } catch (error) {
    throw noteRed(job, error);
  }
}

/** The script's entry point. */
async function main() {
  refuseNpmKeptOptions({ flags: FLAGS, script: SCRIPT, example: 'npm run shared:bump -- --keep ../keep' });
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  return runBump({ root: findRoot(), args });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
