/**
 * scripts/lib/checks.mjs: the list behind `shared:status`, one function per line of its output. Each
 * takes the run's context and gives one result, or a list of them:
 *
 *     { level, label, text, fix?, details? }
 *
 * `level` is ok, warn, FAIL or info (LEVELS below). A warning is a normal state that wants an action,
 * such as "behind" or a changed file. A failure is something broken, and it sets the exit code. An
 * information line says what is so and passes no judgement: it is never red, and the summary does not
 * count it. `fix` is the exact command to run. `details` are extra lines under the check.
 *
 * Every check only reads. The exceptions are the fetch of the hub and the question to npm about the
 * newest Docusaurus, both skipped with `--offline`. So status never runs a split: its `split` line
 * reads the state's `leaks`, a cheap sign that needs no split (lib/state.mjs). Only a push counts the
 * real one.
 *
 * The `red` line prints only while a red run of shared:all or shared:bump here still stands (lib/redRecord.mjs): it
 * fails while the site holds what went red, with the printed undo, and warns once that is undone and a pull would
 * bring it back, with the way on. The hub line's pull fix then points at it.
 *
 * HOW TO CHANGE IT
 *   A new check: write a function here and add it to CHECKS, in the order it should print. Read what
 *   it needs from the context (makeContext), which reads each thing once.
 */

import fs from 'node:fs';
import path from 'node:path';
import { closeLine, carriedReason, leakDetails } from './carried.mjs';
import {
  currentBranch, dirtyPaths, ignoredFiles, isMainCheckout, isShallow, openStep, switchFix, trackedFiles,
} from './checkout.mjs';
import { git, gitValue } from './git.mjs';
import { describeListeners, listenersInCheckout } from './listeners.mjs';
import { findConflictMarkers } from './markers.mjs';
import { findRefusedTerms } from './muiRefusals.mjs';
import { once } from './once.mjs';
import { MAX_DETAILS, capped, counted, shellWord, short } from './phrases.mjs';
import { pullBringsItBack, redLine, redOf } from './redRecord.mjs';
import {
  describeHit, readTexts, readWordList, scanCommits, scanNames, scanTexts, textFilesOf,
} from './privacy.mjs';
import {
  DOCUSAURUS_LABEL, askNewest, docusaurusEntries, isNewer, lockedVersions, looseEntries, nodeProblems,
  pinBackLine, pinBefore, pinDrift, rangeRows, readPin,
} from './pin.mjs';
import {
  AFTER_BUMP, BUMP_LINE, LOAD_UNDO, checkPackages, fixSteps, installLine, loadRequirements, notInstalled, openSite,
  readLock, readManifest, readPieces, tableProblems,
} from './requirements.mjs';
import {
  BRANCH, PREFIX, REMOTE, SITE_BRANCH, SYSTEM_FILES, TEMPLATE_FOLDER, remoteUrl, wordListPath,
} from './settings.mjs';
import { remoteKey } from './siblings.mjs';
import { REASONS, RELATIONS, STATES, readState, remoteOf } from './state.mjs';

export const LEVELS = Object.freeze({ OK: 'ok', WARN: 'warn', FAIL: 'FAIL', INFO: 'info' });

/** How many package names a line about the lock prints. */
const MAX_NAMES = 3;

/** The columns of the report. */
const LEVEL_WIDTH = 5;
const LABEL_WIDTH = 13;
const DETAIL_INDENT = ' '.repeat(LEVEL_WIDTH + LABEL_WIDTH);

/** A hub line's fix when the split line has a better one. */
const SEE_SPLIT = 'see the split line';

/** A hub line's fix when a pull would bring back what went red here. */
const SEE_RED = 'see the red line';

/** The hub line's fix for a site the hub has moved past. */
const PULL_FIX = 'npm run shared:pull';

/** `git subtree -h` prints its usage and exits with this code. */
const SUBTREE_USAGE_EXIT = 129;

/** A result of each level. */
export const ok = (label, text) => ({ level: LEVELS.OK, label, text });
export const warn = (label, text, fix, details) => ({ level: LEVELS.WARN, label, text, fix, details });
export const fail = (label, text, fix, details) => ({ level: LEVELS.FAIL, label, text, fix, details });
export const info = (label, text, fix, details) => ({ level: LEVELS.INFO, label, text, fix, details });

/** What every check reads, each thing once. */
export function makeContext({ root, env = process.env, offline = false }) {
  const open = once(() => openStep(root, env));
  const tracked = once(() => trackedFiles(root, PREFIX, env));
  const texts = once(() => readTexts(root, tracked()));
  const table = once(() => loadRequirements(root));
  const site = once(() => openSite(root, env));
  const pieces = once(() => readPieces(site(), table()));
  const state = once(() => readState(root, { fetch: !offline, env }));
  const wordList = once(() => readWordList(wordListPath(env)));
  const pin = once(() => readPin(root));
  const manifest = once(() => readManifest(root));
  const versionOf = once(() => readLock(root));
  const newest = once(() => askNewest({ root, env }));
  const before = once(() => pinBefore(root, pin().version, env));
  const red = once(() => redOf(root, { env, state }));
  return { root, env, offline, open, tracked, texts, table, pieces, state, wordList, pin, manifest, versionOf, newest, before, red };
}

/** The fix of a line that has to wait while a merge, revert, cherry-pick or rebase is open. */
const SEE_OPEN = 'see the open line first';

/** The step open in a check's checkout, from the context's reading or, given only a root, read now. */
function openOf({ open, root, env }) {
  if (open) return open();
  return root ? openStep(root, env) : null;
}

/** A line's fix, or the pointer to the open step when one is open: its own fix would refuse or drop it. */
function unlessOpen(context, fix) {
  return openOf(context) !== null ? SEE_OPEN : fix;
}

/** One commit as a detail line. A subject with a private hit stays hidden. */
export function commitLine(commit, list) {
  const clean = scanCommits([{ sha: commit.sha, subject: commit.subject }], list).length === 0;
  const subject = clean ? commit.subject : '(subject hidden: see the subjects line)';
  const mark = commit.mixed ? ' [mixes in site files]' : '';
  return `${short(commit.sha)} ${subject}${mark}`;
}

/** `git subtree` is a contrib command, so some installs lack it. */
export function subtreeCheck({ root, env }) {
  const { status } = git(['subtree', '-h'], { cwd: root, env, read: true });
  if (status === SUBTREE_USAGE_EXIT) return ok('subtree', 'git subtree is available');
  return fail('subtree', 'git subtree is not installed', 'brew install git');
}

/** The `shared` remote exists and points at the hub. */
export function remoteCheck({ root, env }) {
  const address = remoteOf(root, env);
  const wanted = remoteUrl(env);
  if (address === null) {
    return fail('remote', `no ${REMOTE} remote`, `git remote add ${REMOTE} ${wanted}`);
  }
  if (remoteKey(address, root) === remoteKey(wanted, root)) return ok('remote', `${REMOTE} is ${address}`);
  return warn('remote', `${REMOTE} is ${address}, not ${wanted}`, `git remote set-url ${REMOTE} ${wanted}`);
}

/**
 * The way to a record when shared/ is there and its history is not: a shallow clone lacks the history,
 * and a shared/ made by hand never had one, so it goes aside before the add. An add over the folder fails.
 * The commit that sets it aside has no shared/ and follows commits that had one, so a split would carry it
 * and the site's history behind it (lib/carried.mjs). So the add takes the hub one commit short of its tip,
 * and the pull that follows writes the rejoin's record that closes that split, with no commit from another site.
 */
export function noRecordFix(root, env) {
  if (isShallow(root, env)) return 'git fetch --unshallow, then run this again';
  const add = `git update-index -q --refresh && git fetch ${REMOTE} ${BRANCH} && git subtree add --prefix ${PREFIX} ${REMOTE}/${BRANCH}~1 --squash`;
  const aside = `git mv ${PREFIX} ${PREFIX}-before && git commit -m "Set the old shared folder aside"`;
  return `a ${PREFIX}/ made by hand: ${aside}, then ${add}, then npm run shared:pull, whose record keeps the old folder out of every split`;
}

/** The line for a state that could not be read. */
function unreadableLine({ reason }, { root, env } = {}) {
  const addLine = `git subtree add --prefix ${PREFIX} ${REMOTE} ${BRANCH} --squash`;
  if (reason === REASONS.NO_FOLDER) return fail('hub', `HEAD has no ${PREFIX}/ folder`, addLine);
  if (reason === REASONS.NO_RECORD) return fail('hub', `no subtree record for ${PREFIX}/ in this history`, noRecordFix(root, env));
  if (reason === REASONS.NO_REMOTE) return warn('hub', 'state not read: no remote');
  return warn('hub', 'state not read: the hub was never fetched', `git fetch ${REMOTE} ${BRANCH}`);
}

/** The safe step for a site that holds a commit the hub no longer does. A push would publish it again. */
function rewrittenHubFix({ recorded, undoablePull }) {
  const warning = `no shared:push: it would publish ${short(recorded)} again`;
  if (undoablePull) return `${warning}. Undo the pull that brought it: git reset --keep HEAD~1, then npm run shared:pull`;
  return `${warning}. Take the README's row for a rewritten hub`;
}

/** The line for a recorded sha outside the hub's history. */
function notAncestorLine(state) {
  const { recorded, relation } = state;
  const sha = short(recorded);
  if (relation === RELATIONS.AHEAD_OF_HUB) {
    return fail('hub', `recorded ${sha} is ahead of the hub: a rejoin ran without its push`, 'npm run shared:push');
  }
  if (relation === RELATIONS.HUB_WENT_BACK) {
    return fail('hub', `recorded ${sha} was on the hub and is gone: the hub was rewritten`, rewrittenHubFix(state));
  }
  if (relation === RELATIONS.UNRELATED) {
    return fail('hub', `recorded ${sha} is not in the hub's history: the hub was rewritten`, rewrittenHubFix(state));
  }
  return fail('hub', `recorded ${sha} is not in this repository: was the hub rewritten?`, `git log --oneline ${REMOTE}/${BRANCH}`);
}

/** What to do about a reverted pull, and what a push would do. shared:pull prints the same words. */
export const revertedPull = ({ revert }) => ({
  fix: `to take the hub again: git revert --no-edit ${short(revert)}, then npm run shared:pull`,
  note: 'npm run shared:push would publish that revert to every site: run it only if every site should lose that pull.',
});

/** The ahead line. A push is its fix unless a reverted pull or a carried line says otherwise. */
function aheadLine(state, outgoing) {
  const publicNote = 'A public site publishes these commits with its next git push.';
  const text = `ahead of the hub by ${counted(state.outgoing.length, 'commit')}`;
  if (state.leaks.length > 0) return warn('hub', text, SEE_SPLIT, outgoing);
  if (!state.revert) return warn('hub', text, 'npm run shared:push', [...outgoing, publicNote]);
  const { fix, note } = revertedPull(state);
  return warn('hub', `${text}, one of them a revert of a pull`, fix, [...outgoing, note]);
}

/** The in sync line. A commit still in the split is not in sync, whatever the trees say. */
function inSyncLine(state, outgoing) {
  const text = `in sync at ${short(state.upstream)}`;
  if (state.outgoing.length === 0) return ok('hub', text);
  const drops = 'your next push carries them; the next pull that brings a hub commit drops them';
  const fix = state.leaks.length > 0 ? SEE_SPLIT : drops;
  return warn('hub', `${text}, with ${counted(state.outgoing.length, 'commit')} still waiting in the split`, fix, outgoing);
}

/** The line for each readable state. `where` is { root, env }, for the lines that read the checkout. */
function stateLine(state, list, where = {}) {
  const incoming = capped((state.incoming ?? []).map((commit) => commitLine(commit, list)));
  const outgoing = capped((state.outgoing ?? []).map((commit) => commitLine(commit, list)));
  switch (state.state) {
    case STATES.IN_SYNC:
      return inSyncLine(state, outgoing);
    case STATES.BEHIND:
      return warn('hub', `behind the hub by ${counted(state.behind, 'commit')}`, PULL_FIX, incoming);
    case STATES.AHEAD:
      return aheadLine(state, outgoing);
    case STATES.DIVERGED: {
      const text = `diverged: ${counted(state.outgoing.length, 'commit')} here, ${counted(state.behind, 'commit')} on the hub`;
      const plain = state.leaks.length > 0 ? SEE_SPLIT : PULL_FIX;
      const fix = state.revert ? revertedPull(state).fix : plain;
      return warn('hub', text, fix, [...outgoing, ...incoming]);
    }
    case STATES.PUSHED_NOT_REJOINED:
      return fail('hub', `pushed but not rejoined: the site still records ${short(state.recorded)}`, 'npm run shared:push');
    case STATES.NOT_ANCESTOR:
      return notAncestorLine(state);
    default:
      return unreadableLine(state, where);
  }
}

/** What to check when a fetch of the hub failed. git's own lines under it say which. */
export const FETCH_FIX = 'check the network, the hub URL and SSH access';

/** The hub line's fix: the open step first, then the red line when a pull would bring back what went red here. */
function hubFix({ root, env, open, red }, current, fix) {
  const own = fix === PULL_FIX && pullBringsItBack(red?.() ?? null, current) ? SEE_RED : fix;
  return unlessOpen({ open, root, env }, own);
}

/** Fetch the hub, then say where this site stands. */
export function hubCheck(context) {
  const { root, env, state, wordList, offline } = context;
  const current = state();
  const line = stateLine(current, wordList(), { root, env });
  const lines = [line.fix ? { ...line, fix: hubFix(context, current, line.fix) } : line];
  if (current.fetched === false) {
    const fix = `${FETCH_FIX}, or run: npm run shared:status -- --offline`;
    lines.unshift(warn('fetch', 'could not reach the hub: this is the state as last fetched', fix, current.fetchError ?? []));
  }
  if (offline) lines.unshift(ok('fetch', 'skipped (--offline): this is the state as last fetched'));
  return lines;
}

/**
 * A red run of shared:all or shared:bump at this site, while it still stands: a failure while the site holds what
 * went red, with the undo that red printed, and a warning once that is undone, with the way on. Nothing otherwise.
 */
export function redCheck({ root, env, red, state }) {
  const found = red?.() ?? null;
  const line = found === null ? null : redLine(root, found, state(), env);
  if (line === null) return [];
  return line.held ? fail('red', line.text, line.fix, line.details) : warn('red', line.text, line.fix, line.details);
}

/**
 * The commits a split would carry as they are. A read-only command runs no split, so this reads the
 * sign the state gives: a commit without shared/ that the split's own rules would keep. A push counts
 * the real split as well, and that count is the one that refuses.
 */
export function splitCheck({ state, wordList }) {
  const current = state();
  if (current.leaks === undefined) return [];
  if (current.leaks.length === 0) return ok('split', `a split carries none of this site's own commits`);
  const details = capped(leakDetails(current.leaks, (commit) => commitLine(commit, wordList())));
  const text = `${counted(current.leaks.length, 'commit')} without ${PREFIX}/: ${carriedReason('some')}`;
  return fail('split', text, closeLine(current), details);
}

/**
 * A merge, revert, cherry-pick or rebase still open. Pull and push refuse while one is, and a stash or a
 * switch there drops it, so this line comes first and the hub, changes and branch lines point at it.
 */
export function openCheck(context) {
  const step = openOf(context);
  if (step === null) return ok('open', 'no merge, revert, cherry-pick or rebase open');
  return fail('open', `a ${step.kind} is still open: pull and push refuse until it is finished or dropped`, step.fix);
}

/** Changed tracked files block pull and push. */
export function dirtyCheck({ root, env, open }) {
  const paths = dirtyPaths(root, env);
  if (paths.length === 0) return ok('changes', 'no uncommitted tracked changes');
  const text = `${counted(paths.length, 'changed tracked file')}: they block pull and push`;
  return warn('changes', text, unlessOpen({ open, root, env }, 'commit or stash them'), capped(paths));
}

/** Pull and push run on one branch. */
export function branchCheck({ root, env, open }) {
  const branch = currentBranch(root, env);
  if (branch === SITE_BRANCH) return ok('branch', `on ${SITE_BRANCH}`);
  const text = `on ${branch ?? 'a detached HEAD'}: pull and push run on ${SITE_BRANCH}`;
  return warn('branch', text, unlessOpen({ open, root, env }, switchFix(root, SITE_BRANCH, env)));
}

/** The names of a list, the first MAX_NAMES of them, and how many more. */
function someNames(names) {
  const more = names.length > MAX_NAMES ? `, and ${names.length - MAX_NAMES} more` : '';
  return `${names.slice(0, MAX_NAMES).join(', ')}${more}`;
}

/**
 * The packages of the pieces this site uses. The lock says which versions a site has asked for, and the disk
 * whether it has them: a fresh clone or a new worktree holds the lock and no node_modules until its npm ci.
 */
export function requirementsCheck({ root, table, pieces }) {
  if (table() === null) return fail('packages', `${PREFIX}/requirements.cjs is missing`, 'npm run shared:pull');
  if (table().loadError) return fail('packages', `${PREFIX}/requirements.cjs does not load: ${table().loadError}`, LOAD_UNDO);
  const unsound = tableProblems(table());
  if (unsound.length > 0) return fail('packages', 'requirements.cjs has bad rows', 'fix the rows', capped(unsound));
  const { locked, count, problems } = checkPackages(root, table(), pieces());
  if (problems.length > 0) {
    const lines = problems.map(({ name, range, found, pieces: owners }) =>
      `${name}: needs ${range}, found ${found ?? 'nothing'} (${owners.join(', ')})`);
    const [first, ...later] = fixSteps(problems);
    const steps = later.map((step) => `${AFTER_BUMP} ${step}`);
    return fail('packages', `${counted(problems.length, 'package')} missing or out of range`, first, [...capped(lines), ...steps]);
  }
  if (!locked) return warn('packages', `no package-lock.json: ${counted(count, 'package')} read from package.json`, 'npm install');
  const absent = notInstalled(root, pieces());
  if (absent.length > 0) {
    return warn('packages', `${counted(count, 'package')} in range in the lock, ${absent.length} not installed here: ${someNames(absent)}`, 'npm ci');
  }
  return ok('packages', `${counted(count, 'package')} in range`);
}

/** One entry off the pin as a detail line. */
function driftLine({ name, spec, locked }) {
  return `${name}: package.json ${spec}, lock ${locked ?? 'nothing'}`;
}

/** True when every entry stands on `version`, in package.json and in the lock. */
function allOn(drifted, entries, version) {
  if (version === null || drifted.length !== entries.length) return false;
  return drifted.every(({ spec, locked }) => spec.replace(/^v/, '') === version && (locked === null || locked === version));
}

/**
 * The fix of a site off the pin. A site still on the pin before this one reads the same whether its bump has not
 * run yet, or ran here, went red and was undone, and nothing on disk tells the two apart. So it names both: the
 * bump, and the line that puts the pin back, which a shared:all stopped after its pin printed, because a bump
 * into the version that just went red goes red again.
 */
function pinFix({ version, drifted, entries, before }) {
  const pinned = before();
  if (!allOn(drifted, entries, pinned)) return BUMP_LINE;
  return `${BUMP_LINE}, or if Docusaurus ${version} went red here, put the pin back: ${pinBackLine(pinned)}`;
}

/** The site's @docusaurus packages stand on the template's one version. */
export function pinCheck({ pin, manifest, versionOf, before }) {
  const { version, problems } = pin();
  const template = `${PREFIX}/${TEMPLATE_FOLDER}`;
  if (problems.length > 0) return fail('pin', `${template} gives no sound pin`, 'npm run shared:pull', capped(problems));
  const entries = docusaurusEntries(manifest());
  if (entries.length === 0) {
    return fail('pin', `package.json lists no ${DOCUSAURUS_LABEL} package`, `copy them from ${template}/package.json`);
  }
  const drifted = pinDrift(entries, version, versionOf());
  if (drifted.length > 0) {
    const text = `${counted(drifted.length, 'package')} off the pin, Docusaurus ${version}`;
    return fail('pin', text, pinFix({ version, drifted, entries, before }), capped(drifted.map(driftLine)));
  }
  return ok('pin', `${counted(entries.length, 'package')} on the pin, Docusaurus ${version}`);
}

/** Every @docusaurus entry names one exact version, so npm can never move a site off the pin. */
export function caretsCheck({ pin, manifest }) {
  const entries = docusaurusEntries(manifest());
  const loose = looseEntries(entries);
  if (loose.length === 0) return ok('carets', `no caret on ${counted(entries.length, 'package')}`);
  const { version } = pin();
  const line = version ? installLine(loose.map(({ name }) => ({ name, range: version }))) : undefined;
  const details = capped(loose.map(({ name, spec }) => `${name} ${spec}`));
  return fail('carets', `${counted(loose.length, 'entry')} without an exact version`, line, details);
}

/** One version text with how many packages hold it, the first few by name. */
function lockedLine([version, names]) {
  const shown = names.slice(0, MAX_NAMES).join(', ');
  const more = names.length > MAX_NAMES ? ', and more' : '';
  return `${version}: ${counted(names.length, 'package')}, ${shown}${more}`;
}

/** Two Docusaurus versions in one tree break a build in ways that are hard to read. */
export function lockVersionsCheck({ root }) {
  const versions = lockedVersions(root);
  if (versions === null) return warn('lock', 'no package-lock.json: no versions to read', 'npm install');
  if (versions.size === 0) return warn('lock', `no ${DOCUSAURUS_LABEL} package in the lock`, 'npm install');
  if (versions.size === 1) return ok('lock', `one ${DOCUSAURUS_LABEL} version in the lock, ${[...versions.keys()][0]}`);
  const text = `${versions.size} ${DOCUSAURUS_LABEL} versions in the lock`;
  return fail('lock', text, BUMP_LINE, capped([...versions].map(lockedLine)));
}

/** The site tests on, and Netlify builds on, the template's Node. */
export function nodeCheck({ root, pin }) {
  const { node } = pin();
  if (!node) return warn('node', 'no Node version to compare: see the pin line');
  const problems = nodeProblems(root, node);
  if (problems.length === 0) return ok('node', `Node ${node} in .nvmrc and netlify.toml`);
  const fix = `set Node ${node} in .nvmrc and NODE_VERSION in netlify.toml`;
  return warn('node', `${counted(problems.length, 'place')} not on Node ${node}`, fix, capped(problems));
}

/** React and MUI are ranges, so this line reports what the lock holds and never fails. */
export function rangesCheck({ pin, manifest, versionOf }) {
  const rows = rangeRows(pin().ranges, manifest(), versionOf());
  if (rows.length === 0) return info('ranges', 'the template lists no React or MUI range');
  const text = rows.map(({ name, found }) => `${name} ${found ?? 'absent'}`).join(', ');
  const outside = rows.filter((row) => row.outside);
  const details = outside.map(({ name, range, found }) => `${name} ${found} is outside the template's ${range}`);
  return info('ranges', text, undefined, details);
}

/**
 * Says when npm has a newer Docusaurus than the pin. It waits for you, so it never warns. Its fix moves the
 * pin and every site together: a one-site bump would leave that site off the pin, and failing pin.
 */
export function newestCheck({ offline, pin, newest }) {
  if (offline) return ok('newest', 'skipped (--offline)');
  const found = newest();
  const { version } = pin();
  if (found === null) return info('newest', 'could not ask npm for the newest Docusaurus');
  if (version === null) return info('newest', `Docusaurus ${found} is the newest on npm`);
  if (isNewer(found, version)) {
    return info('newest', `Docusaurus ${found} is on npm, the pin is ${version}`, `npm run shared:all -- bump ${found}`);
  }
  return ok('newest', `npm has nothing newer than the pin, Docusaurus ${version}`);
}

/** shared/ installs nothing. */
export function nodeModulesCheck({ root }) {
  const folder = `${PREFIX}/node_modules`;
  if (!fs.existsSync(path.join(root, folder))) return ok('node_modules', `no ${folder}`);
  return fail('node_modules', `${folder} exists: ${PREFIX}/ installs nothing`, `rm -rf ${folder}`);
}

/** An ignored file under shared/ never reaches the hub, and git says nothing about it. */
export function ignoredCheck({ root, env }) {
  const skipped = `${PREFIX}/node_modules/`;
  const isListed = (file) => !file.startsWith(skipped) && !SYSTEM_FILES.has(path.basename(file));
  const files = ignoredFiles(root, PREFIX, env).filter(isListed);
  if (files.length === 0) return ok('ignored', `git ignores nothing under ${PREFIX}/`);
  const fix = 'rename them, or add a ! line to a .gitignore';
  return fail('ignored', `${counted(files.length, 'file')} under ${PREFIX}/ that git ignores`, fix, capped(files));
}

/** The undo of a pull's merge, and what follows it. The README's stops table and its undo section name the same. */
export const MARKERS_UNDO = 'git reset --keep HEAD~1';
const MARKERS_PULL = 'npm run shared:pull';
const MARKERS_OTHER = 'any other commit: fix the file and commit';

/** What brings back the files of a person's own that a merge took in, from that merge, once the reset has gone. */
export const MARKERS_RESTORE = 'git restore --source=';

/**
 * The files outside shared/ that the merge at HEAD added or changed against its first parent: a pull's merge
 * touches only shared/, so these came from a `git add -A` (or `git ci`) while its conflict was open, untracked
 * files among them. The undo's reset deletes those, and `git status` then shows nothing. [] when HEAD is no
 * merge or git cannot say.
 */
function filesTakenIn({ root, env }) {
  if (!root) return [];
  const options = { cwd: root, env, read: true };
  if (gitValue(['rev-parse', '--verify', '--quiet', 'HEAD^2'], options) === null) return [];
  const listed = git(['diff', '--name-only', '-z', '--diff-filter=AM', 'HEAD^1', 'HEAD', '--', '.', `:(exclude)${PREFIX}`], options);
  return listed.ok ? listed.stdout.split('\0').filter(Boolean) : [];
}

/**
 * The line that brings back what the merge took in. Each file by name, up to MAX_DETAILS; past that, every path
 * outside shared/ at once, which sets each of them as the merge had it.
 */
export function restoreLine(sha, files) {
  const paths = files.length <= MAX_DETAILS ? files.map(shellWord) : ['.', shellWord(`:(exclude)${PREFIX}`)];
  return `${MARKERS_RESTORE}${sha} -- ${paths.join(' ')}`;
}

/** The undo of a pull's merge that holds markers, with the restore of the person's own files when it took some in. */
function pullUndo(context) {
  const taken = filesTakenIn(context);
  const sha = taken.length === 0 ? null : gitValue(['rev-parse', '--short', 'HEAD'], { cwd: context.root, env: context.env, read: true });
  if (sha === null) return `a pull's merge holds them: ${MARKERS_UNDO}, then ${MARKERS_PULL}`;
  const yours = `${counted(taken.length, 'file')} of yours outside ${PREFIX}/ that a git add -A took in, which the reset deletes`;
  return `a pull's merge holds them, with ${yours}: ${MARKERS_UNDO}, then ${restoreLine(sha, taken)}, then ${MARKERS_PULL}`;
}

/**
 * The way out of markers. An open merge, revert, cherry-pick or rebase is still being resolved: remove
 * them, then that step's own way on or out. Once a commit holds them, the undo comes first: fixing them in
 * a new commit works, and the commit with the markers then reaches the hub's history. A merge made with
 * `git add -A` holds the person's untracked files too, so the undo names them and brings them back.
 */
function markersFix(context) {
  const step = openOf(context);
  if (step !== null) return `remove them from each file, then ${step.fix}`;
  return `${pullUndo(context)}; ${MARKERS_OTHER}`;
}

/** Conflict markers committed into shared/ would reach every site. */
export function markersCheck({ root, env, open, texts }) {
  const hits = findConflictMarkers(textFilesOf(texts()));
  if (hits.length === 0) return ok('markers', `no conflict markers under ${PREFIX}/`);
  return fail('markers', `${counted(hits.length, 'conflict marker')} under ${PREFIX}/`, markersFix({ root, env, open }), capped(hits));
}

/**
 * The word list's own lines. A missing list is loud: only the secret shapes ran. A line the reader cannot take
 * (lib/wordList.mjs) is named by its number, never its text: its word is still read, and check-public refuses it.
 */
function wordListLines(list, env) {
  const text = `WORD LIST MISSING OR EMPTY at ${wordListPath(env)}: only secret shapes were scanned`;
  if (list.missing) return [warn('words', text, 'fill in the file: pull and push refuse without it')];
  const bad = list.badLines ?? [];
  if (bad.length === 0) return [];
  const numbers = `${bad.length === 1 ? 'line' : 'lines'} ${bad.join(', ')}`;
  return [warn('words', `word list ${numbers}: more than one tab, or no word`, 'mend them: check-public refuses the list until then')];
}

/** Tracked files under shared/: their names and contents. */
export function privacyFilesCheck({ tracked, texts, wordList, env }) {
  const list = wordList();
  const hits = [...scanNames(tracked(), list), ...scanTexts(texts(), list)];
  const lines = wordListLines(list, env);
  if (hits.length === 0) return [...lines, ok('privacy', `${counted(tracked().length, 'file')} clean`)];
  const details = capped(hits.map(describeHit));
  const fix = 'remove them before any push, and amend a commit that holds one: a new commit leaves it in the hub\'s history';
  return [...lines, fail('privacy', `${counted(hits.length, 'private hit')} under ${PREFIX}/`, fix, details)];
}

/**
 * What to do about a private hit in a subject the hub already holds: a new commit leaves it in the hub's history,
 * so only a rewrite takes it out. shared:pull refuses with the same words.
 */
export const HUB_SUBJECT_FIX = 'a subject only changes by rewriting the hub, and every site that pulled it then takes the README\'s steps for a rewritten hub. Decide that with whoever runs the hub.';

/** Subjects going out and coming in. A subject travels into every site's history. */
export function privacySubjectsCheck({ state, wordList }) {
  const { outgoing = [], incoming = [] } = state();
  const goingHits = scanCommits(outgoing, wordList());
  const heldHits = scanCommits(incoming, wordList());
  const going = goingHits.filter((hit) => hit.where === 'subject');
  const held = heldHits.filter((hit) => hit.where === 'subject');
  const bodies = [...goingHits, ...heldHits].filter((hit) => hit.where === 'body');
  const count = outgoing.length + incoming.length;
  const results = [];
  if (going.length > 0) {
    const fix = 'reword the commit before it is pushed';
    results.push(fail('subjects', `${counted(going.length, 'private hit')} in commit subjects`, fix, capped(going.map(describeHit))));
  }
  if (held.length > 0) {
    results.push(fail('subjects', `${counted(held.length, 'private hit')} in commit subjects on the hub`, HUB_SUBJECT_FIX, capped(held.map(describeHit))));
  }
  if (bodies.length > 0) {
    results.push(warn('subjects', `${counted(bodies.length, 'private hit')} in commit bodies`, 'reword the commit', capped(bodies.map(describeHit))));
  }
  return results.length > 0 ? results : ok('subjects', `${counted(count, 'commit')} to or from the hub, clean`);
}

/** Every stub the site needs exists, and each one points at shared/. */
export function stubsCheck({ table, pieces }) {
  if (table() === null) return warn('stubs', 'no requirements.cjs to read');
  if (table().loadError) return warn('stubs', 'requirements.cjs does not load: see the packages line');
  const withStub = pieces().filter(({ row }) => row.stub);
  const missing = withStub.filter(({ missingStub }) => missingStub);
  const copies = withStub.filter(({ stub }) => stub.exists && stub.target === null);
  const lines = [];
  if (missing.length > 0) {
    const details = missing.map(({ row }) => `${row.stub} (${row.name} is in use)`);
    lines.push(fail('stubs', `${counted(missing.length, 'stub')} missing`, 'add each stub, see the README', details));
  }
  if (copies.length > 0) {
    const details = copies.map(({ row }) => row.stub);
    lines.push(warn('stubs', `${counted(copies.length, 'local copy')} where a stub belongs`, 'point them at shared/', details));
  }
  if (lines.length > 0) return lines;
  const present = withStub.filter(({ stub }) => stub.exists).length;
  return ok('stubs', `${present} of ${counted(withStub.length, 'stub')} present, the rest not in use`);
}

/** The paid MUI X packages and their licence stay out of shared/. */
export function muiCheck({ texts }) {
  const hits = findRefusedTerms(textFilesOf(texts())).map(({ path: file, line, term }) => `${file}:${line} ${term}`);
  if (hits.length === 0) return ok('mui-x', `no MUI X licence wiring under ${PREFIX}/`);
  return fail('mui-x', `${counted(hits.length, 'refused MUI X line')} under ${PREFIX}/`, 'move them into the site', capped(hits));
}

/** Pull and push run in the main checkout. */
export function checkoutCheck({ root, env }) {
  if (isMainCheckout(root, env)) return ok('checkout', 'main checkout');
  return warn('checkout', 'a worktree: pull and push run in the main checkout');
}

/** A server running from here makes pull refuse, so say so now. */
export function listenersCheck({ root }) {
  const { checked, processes } = listenersInCheckout(root);
  if (!checked) return warn('server', 'could not ask lsof about servers');
  if (processes.length === 0) return ok('server', 'no server runs from this checkout');
  const details = describeListeners(processes).split('\n').map((line) => line.trim());
  return warn('server', `${counted(processes.length, 'server')} running from this checkout: pull refuses`, 'stop them first', details);
}

/** A requirements.cjs that does not load stops a push: every site that pulls it would read a stack. */
export function tableLoadCheck({ table }) {
  if (table() === null || !table().loadError) return [];
  return fail('packages', `${PREFIX}/requirements.cjs does not load: ${table().loadError}`, 'mend the file, then commit it');
}

/** The checks, in printing order. */
export const CHECKS = Object.freeze([
  subtreeCheck,
  remoteCheck,
  openCheck,
  hubCheck,
  redCheck,
  splitCheck,
  dirtyCheck,
  branchCheck,
  requirementsCheck,
  pinCheck,
  caretsCheck,
  lockVersionsCheck,
  nodeCheck,
  rangesCheck,
  newestCheck,
  nodeModulesCheck,
  ignoredCheck,
  markersCheck,
  privacyFilesCheck,
  privacySubjectsCheck,
  stubsCheck,
  muiCheck,
  checkoutCheck,
  listenersCheck,
]);

/** Runs every check and hands back a flat list of results. */
export function runChecks(context, checks = CHECKS) {
  return checks.flatMap((check) => check(context));
}

/** One result as printed lines: the check with its fix, then its details. */
export function formatResult({ level, label, text, fix, details = [] }) {
  const fixPart = fix ? `  (fix: ${fix})` : '';
  const head = `${level.padEnd(LEVEL_WIDTH)}${label.padEnd(LABEL_WIDTH)}${text}${fixPart}`;
  return [head, ...details.map((line) => `${DETAIL_INDENT}${line}`)];
}

