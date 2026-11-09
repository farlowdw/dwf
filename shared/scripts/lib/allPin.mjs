/**
 * scripts/lib/allPin.mjs: the first step of `shared:all -- bump <version>`. It moves the pin in
 * shared/template/package.json and publishes that one change, behind one question, so the sites can pull it.
 * Once the question is answered the rest of the run needs nobody.
 *
 * It starts from the site you ran it from, in sync with the hub, and from a version npm has that the ranges of
 * shared/requirements.cjs take, so the commit holds the pin and nothing else, and every site can install what it
 * names and pass its shared:verify on it. Both are asked before the question, and a no publishes nothing. shared:push does the publishing:
 * the tests, the scans and the rejoin. Anything but a push that went through puts the site back as it was,
 * so a stop here leaves nothing behind in any site. A push stopped from outside, by its time limit or a
 * signal, may have reached the hub all the same, so the hub is asked before anything is put back.
 * `--no-pin` skips all of this: a rehearsal should not change what every site reads.
 *
 * HOW TO CHANGE IT
 *   The commit's wording: pinSubject. A public site carries it, so it holds no private word.
 */

import path from 'node:path';
import { ACTIONS, SCRIPT, actionLine } from './allArgs.mjs';
import { headOf, keepOldBuild, planSite, siteJob } from './allSite.mjs';
import { askOnce } from './ask.mjs';
import { writeManifest } from './bumpLock.mjs';
import { lastLines, runLogged } from './bumpRun.mjs';
import { LOG_TAIL_LINES, LOGS_FOLDER } from './bumpSettings.mjs';
import { EXIT } from './exitCodes.mjs';
import { git, gitValue } from './git.mjs';
import { short } from './phrases.mjs';
import { hubPin, versionOnNpm } from './pin.mjs';
import { refuseOutsideRanges } from './pinRange.mjs';
import { NO_WORD_LIST_FLAG, freshState, refusal } from './preflight.mjs';
import { MANIFEST_FILE, PREFIX, TEMPLATE_FOLDER, UPSTREAM_REF } from './settings.mjs';
import { stepLine } from './siteGate.mjs';
import { STATES, readState } from './state.mjs';
import { refusePull } from '../pull.mjs';

const OWN_PUSH = path.join(PREFIX, 'scripts', 'push.mjs');
const PIN_FILE = path.join(PREFIX, TEMPLATE_FOLDER, MANIFEST_FILE);
const PIN_LABEL = 'pin';
const PUSH_LOG = 'pin-push.log';

/** The subject of the commit that moves the pin. */
function pinSubject(version) {
  return `Move the Docusaurus pin to ${version}`;
}

/** The move a run has to make: { from, to }, or null. Stops when this site cannot make it cleanly. */
export function pinMoveOf({ args, home, env, bumping }) {
  if (!bumping || args.version === undefined || args.noPin) return null;
  const state = refusePull({ root: home.root, noWordList: args.noWordList, env });
  const { version } = hubPin(home.root, env);
  if (version === args.version) return null;
  if (state.state !== STATES.IN_SYNC) {
    const fix = `${actionLine(ACTIONS.PULL, args)}, then run this again`;
    throw refusal(SCRIPT, `moving the pin starts from a site in sync with the hub, and ${home.name} reads ${state.state}.`, { fix });
  }
  const stays = `The pin stays at ${version}.`;
  const fix = 'name a version inside it, or change the range in shared/requirements.cjs and publish that first';
  refuseOutsideRanges({ root: home.root, env, version: args.version, script: SCRIPT, stays, fix });
  refuseUnknownVersion(home, env, { from: version, to: args.version });
  return { from: version, to: args.version };
}

/** A pin npm cannot install would reach every site, so npm is asked before the question. */
function refuseUnknownVersion(home, env, { from, to }) {
  if (versionOnNpm({ root: home.root, env, version: to })) return;
  const reason = `npm gave no Docusaurus ${to}: it does not exist, or npm could not be reached. The pin stays at ${from}.`;
  throw refusal(SCRIPT, reason, { fix: `npm view @docusaurus/core versions, then run this with one of them` });
}

/** True when the run may go on. A question nobody can answer is a no. */
async function approved({ args, sites, print }, { from, to }) {
  if (args.yes) return true;
  const names = sites.map(({ name }) => name).join(', ');
  const question = `Publish the pin, ${from} to ${to}, to the hub, then bump ${names}? [y/N] `;
  const { answered, yes } = await askOnce(question);
  if (yes) return true;
  print(answered ? 'Nothing was published.' : 'Nothing was published: no answer. Pass --yes to skip the question.');
  return false;
}

/** The site you ran it from keeps its old build first: the pin's commits are newer than build/. */
async function keepHomeBuild(run) {
  const { home, sites, env } = run;
  if (!sites.includes(home)) return;
  const pinned = { ...run, args: { ...run.args, version: run.pinMove.to } };
  const plan = planSite(pinned, home, freshState(home.root, env));
  if (plan.gate) await keepOldBuild(siteJob(run, home));
}

/** The hub's tip as this site last saw it. */
function hubTip({ root }, env) {
  return gitValue(['rev-parse', UPSTREAM_REF], { cwd: root, env, read: true });
}

/** Puts the site back after a push that did not go through. */
function takeBack({ root }, head, env) {
  git(['reset', '--quiet', '--keep', head], { cwd: root, env });
  git(['checkout', '--', PIN_FILE], { cwd: root, env });
}

/** Publishes the moved pin through the site's own push, whose tests get the suites' limit. Returns its exit code. */
async function pushPin(run, { to }) {
  const { home, keep, verifyTimeout } = run;
  const logFile = path.join(keep, home.name, LOGS_FOLDER, PUSH_LOG);
  const args = [OWN_PUSH, '-m', pinSubject(to), '--yes', ...(run.args.noWordList ? [NO_WORD_LIST_FLAG] : [])];
  const step = { command: process.execPath, args, cwd: home.root, env: siteJob(run, home).stepEnv, timeoutSeconds: verifyTimeout };
  const { code } = await runLogged({ ...step, logFile });
  if (code !== EXIT.OK) lastLines(logFile, LOG_TAIL_LINES).forEach((line) => console.error(`  ${line}`));
  return code;
}

/**
 * Where a push that did not exit 0 left things: 'published', 'not rejoined' or 'not published'. Exit 7 says
 * so itself. Any other code, and a push stopped from outside, which has none, asks the hub: the pin may
 * have gone out before the stop.
 */
function afterFailedPush({ home, env }, { to }, code) {
  if (code === EXIT.NOT_REJOINED) return 'not rejoined';
  const state = readState(home.root, { env });
  if (state.fetched === false || hubPin(home.root, env).version !== to) return 'not published';
  return state.state === STATES.IN_SYNC ? 'published' : 'not rejoined';
}

/** The line for a pin that is out. */
function publishedLine({ home, env }, { from, to }) {
  return stepLine(PIN_LABEL, `${from} -> ${to}, published from ${home.name}. The hub is at ${short(hubTip(home, env))}`);
}

/** The pin step. Returns the exit code to stop with, or EXIT.OK to go on. */
export async function publishPin(run) {
  const { pinMove, home, env, print } = run;
  if (pinMove === null) return EXIT.OK;
  if (!(await approved(run, pinMove))) return EXIT.REFUSED;
  await keepHomeBuild(run);
  const head = headOf(home.root, env);
  writeManifest(path.join(home.root, PREFIX, TEMPLATE_FOLDER), pinMove.to);
  const code = await pushPin(run, pinMove);
  const outcome = code === EXIT.OK ? 'published' : afterFailedPush(run, pinMove, code);
  if (outcome !== 'not published') run.pinPublished = true;
  if (outcome === 'published') {
    print(publishedLine(run, pinMove));
    return EXIT.OK;
  }
  if (outcome === 'not rejoined') {
    print(`The pin reached the hub, and ${home.name} did not rejoin. Run npm run shared:push there, then this again.`);
    return EXIT.NOT_REJOINED;
  }
  takeBack(home, head, env);
  print(`The pin was not published, and ${home.name} is back at ${short(head)}. Nothing was changed.`);
  return code ?? EXIT.CHECKS;
}
