#!/usr/bin/env node
/**
 * scripts/pull.mjs: `npm run shared:pull`. It brings the hub's new commits into this site's shared/.
 *
 *     npm run shared:pull
 *     npm run shared:pull -- --no-word-list     on a machine without the word list: shapes only
 *
 * It refuses a changed tree, another branch, a worktree, an open merge and a running server, and a site that still
 * holds what a red run of shared:all went red on, with that red's undo (lib/redRecord.mjs). Then it
 * fetches and reads the state. What the hub would bring is scanned BEFORE anything merges: subjects,
 * because `git subtree` writes each one into this site's squash commit, and a public site publishes
 * those with its next git push; files, for the same reason. A requirements.cjs the hub would bring is
 * loaded first, and one that does not load is refused. It merges the exact commit it scanned, so
 * a push from elsewhere in between cannot slip past the scan. A conflict prints the files and both
 * ways out, and exits 6. After a clean pull it reads the requirements again, because the new shared/
 * may need a package this site lacks: that exits 3 with the install line.
 *
 * A pull that lands where shared/ equals the hub can also close the split. A plain pull stops nothing:
 * the next split still walks back to the last rejoin, and carries whatever it finds. So when a pull
 * lands and that walk would still find a commit, the merge's message gets a rejoin's record, and the
 * next split stops there. That is what closes a split that would carry the site's own commits, and it
 * needs nothing typed by hand. lib/carried.mjs says why only such a pull gets the record.
 *
 * A site ahead of the hub hears about shared:push, unless a revert of a pull stands there: that push
 * would publish the revert to every site, so it hears the way back, in the words shared:status uses.
 *
 * A pull that changes a file the config reads at start-up clears the build cache itself, as `npm run clear`
 * does but leaving build/. Docusaurus reads the config through a loader that webpack's cache does not
 * follow, so without it a restart or a plain build after such a pull keeps the old macros and lists. A
 * conflict in such a file stops before that, so its report names `npm run clear` for after the commit.
 *
 * Every import here is static on purpose: a pull replaces this very file on disk while it runs.
 *
 * HOW TO CHANGE IT
 *   The shared refusals live in lib/preflight.mjs, the states in lib/state.mjs. A new option goes in
 *   FLAGS. SHARED_PAGES names the pages that make a site run shared:verify after a pull, where the check of
 *   their transcripts runs: the guide to the shared sites, in any of its three forms. CONFIG_TIME_PATHS names what a site's config reads at start-up, which makes a
 *   pull clear the cache; the folders are BUILD_CACHE_FOLDERS in lib/settings.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carriedReason, closeLine } from './lib/carried.mjs';
import { publicCheck } from './lib/deployLine.mjs';
import { findRoot, refreshIndex } from './lib/checkout.mjs';
import { HUB_SUBJECT_FIX, LEVELS, formatResult, makeContext, requirementsCheck, revertedPull, runChecks } from './lib/checks.mjs';
import { EXIT, ScriptError, runScript } from './lib/exitCodes.mjs';
import { git, gitLive, gitOrThrow } from './lib/git.mjs';
import { hubChanges } from './lib/hubChanges.mjs';
import { refuseWhenListening } from './lib/listeners.mjs';
import { findConflictMarkers } from './lib/markers.mjs';
import { canSplit, mixedRefusal } from './lib/mixedCommit.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { counted, shellWord, short } from './lib/phrases.mjs';
import { STANDINGS, redOf, verifyAllLine } from './lib/redRecord.mjs';
import { NO_WORD_LIST_FLAG, freshState, passGates, refuseDirty, refuseHeldRed, refusal, stateRefusal } from './lib/preflight.mjs';
import { describeHit, scanCommits, scanNames, scanTexts, textFilesOf } from './lib/privacy.mjs';
import { recordMessage } from './lib/published.mjs';
import { loadRequirementsText } from './lib/requirements.mjs';
import { BUILD_CACHE_FOLDERS, PREFIX } from './lib/settings.mjs';
import { STATES, readState } from './lib/state.mjs';

const SCRIPT = 'shared:pull';
const HELP_FLAG = '--help';
const FLAGS = [NO_WORD_LIST_FLAG, HELP_FLAG];
const USAGE = `Usage: npm run shared:pull [-- ${NO_WORD_LIST_FLAG}]`;

/**
 * A page like one of these means shared:verify guards this site's words about shared/: its transcripts are checked
 * there. It is the guide to the shared sites, the one page about them a site keeps.
 */
const SHARED_PAGES = ['src/pages/guide-shared-sites.md', 'src/pages/guide-shared-sites.mdx', 'src/pages/guide-shared-sites.jsx'];

/** What a site's config requires at start-up: the wiring, and the DropDownIC plugins it hands on. */
const CONFIG_TIME_PATHS = [`${PREFIX}/wiring`, `${PREFIX}/components/DropDownIC/mdx.cjs`];

/** What a pull says when it cleared the cache, and what a conflict in such a file says to run. */
const CLEARED_LINE = `Cleared the build cache (${BUILD_CACHE_FOLDERS.join(', ')}): this pull changed what the config reads at start-up, which that cache does not see.`;
const CONFLICT_CLEAR_LINE = 'A file the config reads at start-up is among them, so after the commit run npm run clear before the next build.';

/** The states a pull acts on. In the last one it only records a tree the hub already holds. */
export const PULLABLE = new Set([STATES.BEHIND, STATES.DIVERGED, STATES.PUSHED_NOT_REJOINED]);

/** The options, or a usage error for anything else. */
export function parseArgs(argv) {
  const unknown = argv.filter((option) => !FLAGS.includes(option));
  if (unknown.length > 0) throw new ScriptError(`Unknown option ${unknown[0]}. ${USAGE}`, EXIT.USAGE);
  return { noWordList: argv.includes(NO_WORD_LIST_FLAG), help: argv.includes(HELP_FLAG) };
}

/** A private hit in a hub commit's subject. git subtree would copy it into this site's history. */
function refuseSubjects(state, list) {
  const hits = scanCommits(state.incoming, list).filter((hit) => hit.where === 'subject');
  if (hits.length === 0) return;
  const reason = 'a subject on the hub holds a private hit, and a pull writes subjects into this site\'s history.';
  throw refusal(SCRIPT, reason, { details: hits.map(describeHit), fix: HUB_SUBJECT_FIX });
}

/** The table file as the hub would bring it, loaded before it merges: a line when it does not load. */
function tableLines(root, texts) {
  const table = texts.find(({ path: file, binary }) => file === `${PREFIX}/requirements.cjs` && !binary);
  if (table === undefined) return [];
  const { loadError } = loadRequirementsText(table.text, path.join(root, table.path));
  return loadError ? [`${table.path} does not load: ${loadError}`] : [];
}

/** A private hit, a conflict marker or a table that does not load, in what the hub would bring. */
function refuseFiles(root, state, list, env) {
  const { paths, texts } = hubChanges(root, state.recorded, state.upstream, env);
  const privateHits = [...scanNames(paths, list), ...scanTexts(texts, list)].map(describeHit);
  const markers = findConflictMarkers(textFilesOf(texts)).map((place) => `${place} is a conflict marker`);
  const details = [...privateHits, ...markers, ...tableLines(root, texts)];
  if (details.length === 0) return;
  const fix = 'remove it with a new commit from any site (npm run shared:push there), then pull here';
  throw refusal(SCRIPT, 'the hub holds something that must not reach this site.', { details, fix });
}

/**
 * A mixed commit that a merge would bury. After a pull it can no longer be split, so it goes first.
 * One that cannot be split anyway goes around through another site, and this pull is that way's end.
 */
function refuseBuriedMixed(root, state, list, env) {
  if (state.state !== STATES.DIVERGED) return;
  const mixed = state.outgoing.filter((commit) => commit.mixed);
  if (mixed.length > 0 && canSplit(root, mixed[0], env)) throw mixedRefusal(SCRIPT, mixed, { root, env, list });
}

/** The merge's subject. */
function pullSubject(state) {
  return `shared: pull ${short(state.upstream)} (${counted(state.incoming.length, 'commit')})`;
}

/** Merges the exact hub commit that was scanned. The index is refreshed first: the fetch takes a while. */
function mergeHub(root, state, env) {
  refreshIndex(root, env);
  const args = ['subtree', 'merge', '--prefix', PREFIX, '--squash', '-m', pullSubject(state), state.upstream];
  return gitLive(args, { cwd: root, env, onLine: () => {} });
}

/** True when the next split would walk past this point and find a commit. */
function splitIsOpen({ leaks, outgoing }) {
  return leaks.length > 0 || outgoing.length > 0;
}

/**
 * Gives the pull's merge a rejoin's record, if it landed on the hub's tree and the split is still open.
 * The result decides, so nothing is predicted. The merge was made a moment ago in this run, and this
 * rewrites its message and nothing else. `mainline` is the commit the merge was made on.
 */
function recordPull(root, state, mainline, env) {
  const landed = readState(root, { fetch: false, env });
  if (landed.state !== STATES.IN_SYNC || !splitIsOpen(landed)) return false;
  const message = recordMessage(pullSubject(state), mainline, state.upstream);
  gitOrThrow(['commit', '--amend', '--no-verify', '--quiet', '-m', message], { cwd: root, env });
  return true;
}

/** The files a merge left in conflict. */
function conflictedFiles(root, env) {
  const args = ['diff', '--name-only', '--diff-filter=U', '-z'];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return stdout.split('\0').filter(Boolean);
}

/** A conflict's report: the files, both ways out, and the one thing never to do. */
function reportConflict(files) {
  console.error([
    `${SCRIPT} stopped at a conflict in ${counted(files.length, 'file')}. The merge is open.`,
    ...files.map((file) => `  ${file}`),
    '',
    'To resolve it, edit each file and remove the conflict markers, then:',
    `  git add -- ${files.map(shellWord).join(' ')}`,
    '  git commit --no-edit',
    ...(touchesConfigTime(files) ? [CONFLICT_CLEAR_LINE] : []),
    'To drop this pull:',
    '  git merge --abort',
    '',
    'Never run git ci or git add -A while a conflict is open: that commits the markers.',
  ].join('\n'));
}

/** True when the site has its own page about shared/. */
function hasSharedPage(root) {
  return SHARED_PAGES.some((page) => fs.existsSync(path.join(root, page)));
}

/** The step for a site ahead of the hub: a push, unless a reverted pull stands. */
function aheadSteps(state) {
  if (!state.revert) return ['npm run shared:push   (this site still holds commits the hub lacks)'];
  const { fix, note } = revertedPull(state);
  return [fix, note];
}

/** True when the pull from `before` to HEAD changed a file the config reads at start-up. */
function changedConfigTime(root, before, env) {
  return git(['diff', '--quiet', before, 'HEAD', '--', ...CONFIG_TIME_PATHS], { cwd: root, env }).status === 1;
}

/** True when one of `files` is, or sits under, one of CONFIG_TIME_PATHS. */
function touchesConfigTime(files) {
  return files.some((file) => CONFIG_TIME_PATHS.some((place) => file === place || file.startsWith(`${place}/`)));
}

/** After a pull that changed what the config reads at start-up, empties the cache that would keep the old values. */
function clearBuildCache(root, before, env) {
  if (!changedConfigTime(root, before, env)) return;
  for (const folder of BUILD_CACHE_FOLDERS) fs.rmSync(path.join(root, folder), { recursive: true, force: true });
  console.log(CLEARED_LINE);
}

/** The last step: the push, behind the site's public check where its build command runs one (`npm run build` alone does not). */
function pushStep(root) {
  const check = publicCheck(root);
  return `build it and look, then ${check === null ? '' : `${check} && `}git push`;
}

/** What to run after a clean pull. `landed` is the state it left. */
function nextSteps(root, landed, takenRed = false) {
  const steps = ['npm run test:shared'];
  if (takenRed) steps.push('npm run shared:verify (this pull took back a hub commit that went red here)');
  else if (hasSharedPage(root)) steps.push('npm run shared:verify (this site has its own page about shared/)');
  if (landed.state === STATES.AHEAD) steps.push(...aheadSteps(landed));
  steps.push(pushStep(root));
  return ['Next:', ...steps.map((step) => `  ${step}`)];
}

/** Reports a clean pull. Returns the exit code: 3 when the site now lacks a package. */
function finishPull(root, state, env, { before, recorded }) {
  console.log(`Pulled ${counted(state.incoming.length, 'commit')}. The hub is at ${short(state.upstream)}.`);
  if (recorded) console.log('This pull holds a rejoin\'s record: the next split stops here.');
  const results = runChecks(makeContext({ root, env, offline: true }), [requirementsCheck]);
  results.flatMap(formatResult).forEach((line) => console.log(line));
  clearBuildCache(root, before, env);
  const landed = readState(root, { fetch: false, env });
  const red = redOf(root, { env, state: () => landed });
  const takenRed = red?.standing === STANDINGS.TAKEN;
  if (takenRed) console.log(`This pull took back hub ${short(red.record.hub)}, which went red here in an earlier run: prove the site before anything else, then ${verifyAllLine(red.record.site)}.`);
  nextSteps(root, landed, takenRed).forEach((line) => console.log(line));
  return results.some(({ level }) => level === LEVELS.FAIL) ? EXIT.CHECKS : EXIT.OK;
}

/** Merges, and turns the outcome into an exit code. */
async function pull(root, state, env) {
  const head = gitOrThrow(['rev-parse', 'HEAD'], { cwd: root, env });
  const merged = await mergeHub(root, state, env);
  if (merged.ok) return finishPull(root, state, env, { before: head, recorded: recordPull(root, state, head, env) });
  const files = conflictedFiles(root, env);
  if (files.length > 0) {
    reportConflict(files);
    return EXIT.CONFLICT;
  }
  merged.lines.forEach((line) => console.error(line));
  throw new ScriptError(`git subtree merge stopped with exit code ${merged.status}. Nothing was merged.`, EXIT.GIT);
}

/** What a site ahead of the hub hears when there is nothing to pull. */
function reportNothingAhead(state) {
  const plain = 'Nothing to pull: the hub has not moved.';
  if (!state.revert) {
    console.log(`${plain} To publish this site's commits: npm run shared:push`);
    return;
  }
  const { fix, note } = revertedPull(state);
  console.log(`${plain} A revert of a pull stands here. Fix: ${fix}.`);
  console.log(note);
}

/** A pull needs a new hub commit to write its record, so a site with an open split hears that here. */
function noteOpenSplit(state) {
  if (state.leaks.length === 0) return;
  console.log(`But ${carriedReason('some')}. Fix: ${closeLine(state)}.`);
}

/**
 * Everything that stops a pull, and it changes nothing but the fetch. Returns the state. It is exported
 * because `shared:all` asks this of every site before it touches any.
 */
export function refusePull({ root, noWordList, env = process.env }) {
  const list = passGates(root, { script: SCRIPT, env, allowNoWordList: noWordList });
  refuseHeldRed(root, { script: SCRIPT, env });
  refuseDirty(root, { script: SCRIPT, env, fix: 'commit or stash them, then run this again' });
  refuseWhenListening(root, { script: SCRIPT });
  const state = freshState(root, env);
  if (state.state === STATES.IN_SYNC || state.state === STATES.AHEAD) return state;
  if (!PULLABLE.has(state.state)) throw stateRefusal(SCRIPT, state, list, env, root);
  refuseSubjects(state, list);
  refuseFiles(root, state, list, env);
  refuseBuriedMixed(root, state, list, env);
  return state;
}

/** The whole run, from the refusals to the merge. */
async function runPull({ root, noWordList, env = process.env }) {
  const state = refusePull({ root, noWordList, env });
  if (state.state === STATES.IN_SYNC) {
    console.log(`Nothing to pull: in sync at ${short(state.upstream)}.`);
    noteOpenSplit(state);
    return EXIT.OK;
  }
  if (state.state === STATES.AHEAD) {
    reportNothingAhead(state);
    noteOpenSplit(state);
    return EXIT.OK;
  }
  return pull(root, state, env);
}

/** The script's entry point. */
async function main() {
  refuseNpmKeptOptions({ flags: [NO_WORD_LIST_FLAG], script: SCRIPT, example: `npm run ${SCRIPT} -- ${NO_WORD_LIST_FLAG}` });
  const { noWordList, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  const root = findRoot();
  if (!fs.existsSync(path.join(root, PREFIX))) {
    throw new ScriptError(`${root} has no ${PREFIX}/ folder. Run this from a site.`, EXIT.USAGE);
  }
  return runPull({ root, noWordList });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
