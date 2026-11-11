#!/usr/bin/env node
/**
 * scripts/push.mjs: `npm run shared:push`. It publishes this site's shared/ commits to the hub, then
 * rejoins, so the next split stops here and this site does not re-conflict with its own change.
 *
 *     npm run shared:push                     asks once, then publishes
 *     npm run shared:push -- --yes            no question
 *     npm run shared:push -- -m "Subject"     runs the tests, commits shared/ alone, then publishes
 *     npm run shared:push -- --skip-tests     publishes without test:shared
 *     npm run shared:push -- --no-word-list   on a machine without the word list: shapes only
 *
 * It refuses, before anything leaves: a worktree, another branch, an open merge, a changed tree, a hub
 * that moved, a shared/node_modules, conflict markers, a private word or a secret shape under shared/, a
 * split that would carry this site's own commits (lib/carried.mjs), a private hit in any subject going
 * out, a mixed commit and red tests. A subject reaches the hub verbatim, and then every site's history,
 * so the list it scans is the split itself: what really goes out. A requirements.cjs that does not load
 * stops it too, --skip-tests or not. A hit in a commit's body, or in a file
 * of a commit that a later commit took it out of, stays on the hub. The plan warns about both before the
 * question. --yes skips the question and no refusal.
 *
 * The rejoin runs ONLY after git push exits 0: a rejoin after a rejected push loses local work. If the
 * push got through and the rejoin did not, it exits 7. Run it again on a clean tree: it finds the state
 * "pushed but not rejoined" and picks up at the rejoin, with nothing to publish, ask or test.
 *
 * HOW TO CHANGE IT
 *   The shared refusals live in lib/preflight.mjs, the wording for a mixed commit in
 *   lib/mixedCommit.mjs, the test run in lib/testGate.mjs. A new switch goes in SWITCHES, and in
 *   KEPT_BY_NPM. FILE_CHECKS are status checks that stop a push.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { missedLine, otherHubLine } from './lib/allSites.mjs';
import { askOnce } from './lib/ask.mjs';
import { carriedReason, closeLine, leakDetails } from './lib/carried.mjs';
import { dirtyPaths, findRoot, refreshIndex } from './lib/checkout.mjs';
import {
  FETCH_FIX, LEVELS, commitLine, formatResult, ignoredCheck, makeContext, markersCheck, muiCheck, nodeModulesCheck,
  privacyFilesCheck, runChecks, tableLoadCheck,
} from './lib/checks.mjs';
import { EXIT, ScriptError, runScript } from './lib/exitCodes.mjs';
import { git, gitLive, gitOrThrow, gitValue } from './lib/git.mjs';
import { hubChanges } from './lib/hubChanges.mjs';
import { mixedRefusal } from './lib/mixedCommit.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { once } from './lib/once.mjs';
import { counted, shellWord, short } from './lib/phrases.mjs';
import { NO_WORD_LIST_FLAG, freshState, passGates, refuseDirty, refusal, stateRefusal } from './lib/preflight.mjs';
import { describeHit, readTexts, scanCommits, scanNames, scanTexts, shapeHits, wordHits } from './lib/privacy.mjs';
import { mixedPublished, recordMessage } from './lib/published.mjs';
import { BRANCH, MS_PER_SECOND, PREFIX, REMOTE, UPSTREAM_REF } from './lib/settings.mjs';
import { findSiblings } from './lib/siblings.mjs';
import { RELATIONS, STATES, commitsToPublish, fetchHub, fetchReason, readState } from './lib/state.mjs';
import { runSharedTests } from './lib/testGate.mjs';

const SCRIPT = 'shared:push';

/**
 * The push to the hub may wait this long, then it is stopped with the ssh it started: a connection that goes quiet
 * would otherwise hold it for hours. A push of a few commits takes seconds. DOCUSAURUS_SHARED_PUSH_LIMIT (ms) moves it.
 */
const PUSH_TIMEOUT_MS = Number(process.env.DOCUSAURUS_SHARED_PUSH_LIMIT) > 0 ? Number(process.env.DOCUSAURUS_SHARED_PUSH_LIMIT) : 300_000;
const YES_FLAG = '--yes';
const SKIP_TESTS_FLAG = '--skip-tests';
const HELP_FLAG = '--help';
const MESSAGE_FLAGS = ['-m', '--message'];

/** Each switch and the option it sets. */
const SWITCHES = Object.freeze({
  [YES_FLAG]: 'yes',
  [SKIP_TESTS_FLAG]: 'skipTests',
  [NO_WORD_LIST_FLAG]: 'noWordList',
  [HELP_FLAG]: 'help',
});

/** What npm swallows when `--` is left out. `-m "Subject"` is its own --message, subject and all. */
const KEPT_BY_NPM = [YES_FLAG, SKIP_TESTS_FLAG, NO_WORD_LIST_FLAG, '--message'];

const USAGE = [
  `Usage: npm run ${SCRIPT} [-- [-m "Subject"] [${YES_FLAG}] [${SKIP_TESTS_FLAG}] [${NO_WORD_LIST_FLAG}]]`,
  `  -m "Subject"    commit ${PREFIX}/ alone with this subject first; the tests run before the commit`,
  `  ${YES_FLAG}           do not ask before publishing`,
  `  ${SKIP_TESTS_FLAG}    publish without running test:shared`,
  `  ${NO_WORD_LIST_FLAG}  go on without the word list: only secret shapes are scanned`,
].join('\n');

/** Status checks whose failure stops a push: what they find must not reach the hub. */
const FILE_CHECKS = [nodeModulesCheck, ignoredCheck, markersCheck, privacyFilesCheck, muiCheck, tableLoadCheck];

/** Reads one -m option. Returns the subject, or a usage error. */
function readSubject(option, value) {
  if (value === undefined) throw new ScriptError(`${option} needs a subject. ${USAGE}`, EXIT.USAGE);
  const subject = value.trim();
  if (subject === '' || subject.includes('\n')) {
    throw new ScriptError(`${option} needs a subject of one line. ${USAGE}`, EXIT.USAGE);
  }
  return subject;
}

/** The options, or a usage error for anything else. */
export function parseArgs(argv) {
  const options = { yes: false, skipTests: false, noWordList: false, help: false, message: null };
  const rest = [...argv];
  while (rest.length > 0) {
    const option = rest.shift();
    if (MESSAGE_FLAGS.includes(option)) options.message = readSubject(option, rest.shift());
    else if (SWITCHES[option]) options[SWITCHES[option]] = true;
    else throw new ScriptError(`Unknown option ${option}. ${USAGE}`, EXIT.USAGE);
  }
  return options;
}

/** Everything under shared/ that the next commit would hold. */
function filesForCommit({ root, env }) {
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', PREFIX];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return stdout.split('\0').filter(Boolean);
}

/** The status checks' context, reading the files `-m` is about to commit in place of the tracked ones. */
function pendingContext(run) {
  const { root, env } = run;
  const files = once(() => filesForCommit(run));
  const texts = once(() => readTexts(root, files()));
  return { ...makeContext({ root, env, offline: true }), tracked: files, texts };
}

/** Stops at anything under shared/ that must not reach the hub. */
function refuseFiles(context) {
  const failed = runChecks(context, FILE_CHECKS).filter(({ level }) => level === LEVELS.FAIL);
  if (failed.length === 0) return;
  const details = failed.flatMap(formatResult);
  throw refusal(SCRIPT, `${PREFIX}/ holds something that must not reach the hub.`, { details });
}

/** Stops at a private hit in a subject going out. */
function refuseSubjects(commits, list) {
  const hits = scanCommits(commits, list).filter((hit) => hit.where === 'subject');
  if (hits.length === 0) return;
  const reason = 'a subject going out holds a private hit, and it would reach every site\'s history.';
  const fix = 'reword that commit before it is pushed';
  throw refusal(SCRIPT, reason, { details: hits.map(describeHit), fix });
}

/** A private hit in a body is a warning: a body stays on the hub, and no site's history copies it. */
function warnAboutBodies(commits, list) {
  const hits = scanCommits(commits, list).filter((hit) => hit.where === 'body');
  hits.forEach((hit) => console.warn(`Warning: ${describeHit(hit)}.`));
}

/**
 * A hit in a commit going out, gone from the tip. The tree passed, and that commit's files still reach
 * the hub's history, though no site's: a pull squashes. It warns, as for a body, before the question:
 * by then only rewriting that commit takes the hit out, and that is for the reader to decide.
 */
function warnAboutHistory({ root, env, list }, commits) {
  for (const { sha } of commits) {
    const { paths, texts } = hubChanges(root, `${sha}~1`, sha, env);
    const hits = [...scanNames(paths, list), ...scanTexts(texts, list)];
    hits.forEach((hit) => console.warn(`Warning: commit ${short(sha)}: ${describeHit(hit)}. It stays in the hub's history.`));
  }
}

/**
 * Stops at a split that holds this site's real commits. A clean split holds only copies. This comes
 * before every other check of the split, and nothing passes it: not --yes, not --skip-tests, not an
 * empty word list. The site's subjects would each read as a problem of their own.
 */
function refuseCarried({ list }, state, { ownCommits, commits }) {
  if (ownCommits === 0) return;
  const reason = `${carriedReason(ownCommits)}, in ${counted(commits.length, 'commit')}.`;
  const details = leakDetails(state.leaks ?? [], (commit) => commitLine(commit, list));
  const fix = `${closeLine(state)}. Then npm run shared:status reads ok on its split line, and this runs.`;
  throw refusal(SCRIPT, reason, { details, fix });
}

/** The split and its commits, once every subject has passed and no mixed commit is among them. */
function readOutgoing(run, state) {
  const { root, env, list } = run;
  const outgoing = commitsToPublish(root, state.upstream, env);
  refuseCarried(run, state, outgoing);
  refuseSubjects(outgoing.commits, list);
  const mixed = mixedPublished(root, { upstream: state.upstream, split: outgoing.split }, env);
  if (mixed.length > 0) throw mixedRefusal(SCRIPT, mixed, run);
  return outgoing;
}

/** Runs test:shared unless the push skips it. Red stops the push. */
function passTests({ root, env, options }) {
  if (options.skipTests) {
    console.warn(`Warning: ${SKIP_TESTS_FLAG}: test:shared did not run for this push.`);
    return;
  }
  console.log('Running test:shared.');
  const { green, why } = runSharedTests(root, env);
  if (green) return;
  throw refusal(SCRIPT, `test:shared is red: ${why}.`, { fix: `fix the tests, or pass ${SKIP_TESTS_FLAG} to publish anyway` });
}

/** Shows what is about to go out. */
function printPlan(commits) {
  console.log(`About to publish ${counted(commits.length, 'commit')} to the hub:`);
  commits.forEach(({ sha, subject }) => console.log(`  ${short(sha)} ${subject}`));
  console.log('Each subject reaches the hub as written, and every site\'s history at its next pull.');
}

/** True when publishing may go on. A question nobody can answer is a no. */
async function approved({ options }) {
  if (options.yes) return true;
  const { answered, yes } = await askOnce('Publish them? [y/N] ');
  if (yes) return true;
  const why = answered ? 'Not published.' : `Not published: no answer. Pass ${YES_FLAG} to skip the question.`;
  console.log(why);
  return false;
}

/**
 * The last lines of a finished run: the new sha, the sites that should pull, and the siblings left out
 * of that list, in shared:all's words: one with a mount and no remote, and one on another hub.
 */
function reportPublished({ root, env }, sha) {
  console.log(`The hub is at ${short(sha)}, and this site is rejoined. Run git push to send this site's own commits.`);
  const { sites, withoutRemote, otherHub } = findSiblings(root, { env });
  if (sites.length > 0) {
    console.log('Other sites to pull, with npm run shared:pull in each:');
    sites.forEach(({ name }) => console.log(`  ${name}`));
  }
  withoutRemote.forEach((site) => console.log(missedLine(site, env, 'it is not on the list to pull')));
  otherHub.forEach((site) => console.log(otherHubLine(site, 'it is not on the list to pull')));
  if (sites.length + withoutRemote.length + otherHub.length === 0) console.log('No other site found beside this one.');
}

/** Tells a site how to finish after a published push that did not rejoin. */
function reportNotRejoined(status, lines) {
  lines.forEach((line) => console.error(line));
  console.error([
    `The push reached the hub, and the rejoin stopped with exit code ${status}.`,
    'Run npm run shared:push again: it picks up at the rejoin. If git status lists a change, commit or stash it first.',
  ].join('\n'));
}

/**
 * Rejoins after a push that exited 0. This is the only caller of the rejoin. The index is refreshed first:
 * the tests and the question can take minutes, and a file touched in that time must not stop it.
 */
async function rejoin(run, sha) {
  const { root, env } = run;
  refreshIndex(root, env);
  const args = ['subtree', 'split', '--prefix', PREFIX, '--rejoin', '--squash', '-m', `shared: rejoin ${short(sha)}`];
  const result = await gitLive(args, { cwd: root, env, onLine: () => {} });
  if (result.ok) {
    reportPublished(run, sha);
    return EXIT.OK;
  }
  reportNotRejoined(result.status, result.lines);
  return EXIT.NOT_REJOINED;
}

/**
 * Why the hub did not take a push, as the line to act on. The hub is fetched again: when it moved, another
 * push won the race and a pull comes first; when it did not, the hub declined this push for a reason of its
 * own, which git's remote: lines above name, and a pull would change nothing. Git's wording is never read.
 */
function declinedLines(run, upstream) {
  const fetched = fetchHub(run.root, run.env);
  const now = gitValue(['rev-parse', '--verify', '--quiet', `${UPSTREAM_REF}^{commit}`], { cwd: run.root, env: run.env, read: true });
  if (!fetched.ok) return [`The hub could not be fetched again either: ${fetchReason(fetched).join(' ')}`, `Fix: ${FETCH_FIX}, then run this again.`];
  if (now !== upstream) return ['The hub moved while this push ran. Run npm run shared:pull, then push again.'];
  return ['The hub declined it: read the remote: lines above, fix what they name, then run this again.'];
}

/** True when the hub, fetched again, holds `split` as its tip: a push stopped at its limit that arrived even so. */
function hubTookIt(run, split) {
  if (!fetchHub(run.root, run.env).ok) return false;
  return gitValue(['rev-parse', '--verify', '--quiet', `${UPSTREAM_REF}^{commit}`], { cwd: run.root, env: run.env, read: true }) === split;
}

/**
 * Sends the exact commit that was scanned. Exit 0 from git is the way on to the rejoin, and so is a push stopped at
 * PUSH_TIMEOUT_MS that the hub, asked again, holds: a push can land in the instant before its limit.
 */
async function publishAndRejoin(run, split, upstream) {
  const refspec = `${split}:refs/heads/${BRANCH}`;
  const options = { cwd: run.root, env: run.env, group: true, timeout: PUSH_TIMEOUT_MS };
  const pushed = await gitLive(['push', REMOTE, refspec], options);
  if (pushed.ok) return rejoin(run, split);
  if (pushed.timedOut && hubTookIt(run, split)) {
    console.log(`The push ran past ${PUSH_TIMEOUT_MS / MS_PER_SECOND} s and was stopped, and the hub holds it: it is published.`);
    return rejoin(run, split);
  }
  if (pushed.timedOut) {
    console.error(`The push gave no answer within ${PUSH_TIMEOUT_MS / MS_PER_SECOND} s and was stopped, and the hub does not hold it. No rejoin ran, and nothing was published.`);
    console.error('Fix: check the network and the hub, then run this again.');
    return EXIT.GIT;
  }
  const site = run.options.message === null
    ? 'so this site is as it was'
    : `and the commit made with -m stays: npm run ${SCRIPT} publishes it later`;
  console.error(`The hub refused the push: exit code ${pushed.status}. No rejoin ran, ${site}.`);
  declinedLines(run, upstream).forEach((line) => console.error(line));
  return EXIT.GIT;
}

/** The publishing half: every check on the tree and the split, then the question, the push, the rejoin. */
async function publish(run, state, { tested }) {
  const { root, env } = run;
  refuseFiles(makeContext({ root, env, offline: true }));
  const { split, commits } = readOutgoing(run, state);
  warnAboutBodies(commits, run.list);
  if (!tested) passTests(run);
  printPlan(commits);
  warnAboutHistory(run, commits);
  if (!(await approved(run))) return EXIT.REFUSED;
  return publishAndRejoin(run, split, state.upstream);
}

/** "Pushed but not rejoined": nothing is published, so there is no test and no question. */
async function resume(run, state) {
  const { root, env } = run;
  const { split } = commitsToPublish(root, state.upstream, env);
  if (split === state.upstream) {
    console.log(`The hub already holds this push at ${short(split)}. Finishing the rejoin.`);
    return rejoin(run, split);
  }
  console.log(`The hub holds this tree from other commits. Recording ${short(state.upstream)}.`);
  const head = gitValue(['rev-parse', 'HEAD'], { cwd: root, env, read: true });
  const message = recordMessage(`shared: rejoin ${short(state.upstream)}`, head, state.upstream);
  refreshIndex(root, env);
  gitOrThrow(['subtree', 'merge', '--prefix', PREFIX, '--squash', '-m', message, state.upstream], { cwd: root, env });
  reportPublished(run, state.upstream);
  return EXIT.OK;
}

/** True for a rejoin that ran without its push: the hub is simply behind this site's record. */
function rejoinedWithoutPush(state) {
  return state.state === STATES.NOT_ANCESTOR && state.relation === RELATIONS.AHEAD_OF_HUB;
}

/** The refusal when the hub moved. A mixed commit comes first: after a pull it cannot be split. */
function hubMovedRefusal(run, state) {
  const mixed = state.outgoing.filter((commit) => commit.mixed);
  if (mixed.length > 0) return mixedRefusal(SCRIPT, mixed, run);
  return refusal(SCRIPT, `the hub moved, and a push would be rejected (${state.state}).`, { fix: 'npm run shared:pull, then push again' });
}

/** A plain push, from the state to the end. */
async function pushCommitted(run) {
  const { root, env, list } = run;
  const fix = `commit or stash them, or commit ${PREFIX}/ alone with -m "Subject"`;
  refuseDirty(root, { script: SCRIPT, env, fix });
  const state = freshState(root, env);
  switch (state.state) {
    case STATES.IN_SYNC:
      console.log(`Nothing to push: in sync at ${short(state.upstream)}.`);
      return EXIT.OK;
    case STATES.AHEAD:
      return publish(run, state, { tested: false });
    case STATES.PUSHED_NOT_REJOINED:
      return resume(run, state);
    case STATES.BEHIND:
    case STATES.DIVERGED:
      throw hubMovedRefusal(run, state);
    default:
      if (rejoinedWithoutPush(state)) return publish(run, state, { tested: false });
      throw stateRefusal(SCRIPT, state, list, env, root);
  }
}

/** A subject given with -m is checked before it can become a commit. */
function refuseOwnSubject(subject, list) {
  const [word] = wordHits(subject, list);
  const [shape] = shapeHits(subject);
  if (!word && !shape) return;
  const what = shape ? `looks like ${shape.shape}` : `matches line ${word.listLine} of the word list`;
  throw refusal(SCRIPT, `the subject you gave ${what}.`, { fix: 'write another subject' });
}

/**
 * -m needs a site that a commit on top could still publish from. The fix prints the subject, so it runs only after
 * refuseOwnSubject: a subject with a listed word or a key shape is never printed.
 */
function refuseCommitOnState(run, state) {
  if ([STATES.IN_SYNC, STATES.AHEAD].includes(state.state) || rejoinedWithoutPush(state)) return;
  if (![STATES.BEHIND, STATES.DIVERGED].includes(state.state)) throw stateRefusal(SCRIPT, state, run.list, run.env, run.root);
  const commit = `git add ${PREFIX} && git commit -m ${shellWord(run.options.message)}`;
  const fix = `${commit}, then npm run shared:pull, then npm run shared:push`;
  throw refusal(SCRIPT, 'the hub moved, and a pull needs a clean tree.', { fix });
}

/** True when shared/ holds something to commit. */
function hasPendingWork({ root, env }) {
  const { stdout } = git(['status', '--porcelain', '--', PREFIX], { cwd: root, env, read: true });
  return stdout.trim() !== '';
}

/** Everything -m must know before it commits: the commit should only ever land when it can go out. */
function refuseBeforeCommit(run, state) {
  const { root, env, list, options } = run;
  const outside = dirtyPaths(root, env).filter((file) => !file.startsWith(`${PREFIX}/`));
  refuseDirty(root, { script: SCRIPT, env, fix: 'commit or stash them first: -m commits shared/ alone', paths: outside });
  refuseOwnSubject(options.message, list);
  refuseCommitOnState(run, state);
  if (!hasPendingWork(run)) throw refusal(SCRIPT, `nothing to commit under ${PREFIX}/.`, { fix: 'run it without -m' });
  refuseFiles(pendingContext(run));
  readOutgoing(run, state);
}

/** `-m "Subject"`: tests, a shared-only commit, then the normal way out. */
async function commitThenPublish(run) {
  const { root, env, options } = run;
  const state = freshState(root, env);
  refuseBeforeCommit(run, state);
  passTests(run);
  gitOrThrow(['add', '--', PREFIX], { cwd: root, env });
  gitOrThrow(['commit', '-q', '-m', options.message], { cwd: root, env });
  console.log(`Committed ${PREFIX}/ alone. If this push stops here, npm run ${SCRIPT} publishes that commit later.`);
  return publish(run, readState(root, { fetch: false, env }), { tested: true });
}

/** The script's entry point. */
async function main() {
  const example = `npm run ${SCRIPT} -- -m "Subject"`;
  refuseNpmKeptOptions({ flags: KEPT_BY_NPM, script: SCRIPT, example });
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  const root = findRoot();
  if (!fs.existsSync(path.join(root, PREFIX))) {
    throw new ScriptError(`${root} has no ${PREFIX}/ folder. Run this from a site.`, EXIT.USAGE);
  }
  const env = process.env;
  const list = passGates(root, { script: SCRIPT, env, allowNoWordList: options.noWordList });
  const run = { root, env, list, options };
  return options.message === null ? pushCommitted(run) : commitThenPublish(run);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
