/**
 * scripts/lib/state.mjs: reads where a site's shared/ stands against the hub. Every status, pull and
 * push decision starts here. It only reads, apart from the optional fetch of the hub.
 *
 *   in sync                       HEAD's shared/ is the hub's tip, and the site recorded that tip
 *   behind                        the hub moved, shared/ did not
 *   ahead                         shared/ moved, the hub did not
 *   diverged                      both moved
 *   pushed but not rejoined       shared/ equals the hub's tree, but the site recorded an older sha
 *   recorded sha not an ancestor  the sha this site recorded is not in the hub's history
 *   unreadable                    no shared/, no record, no remote or never fetched: see `reason`
 *
 * How it reads them. `git subtree` writes a `git-subtree-split` trailer into a site's history at
 * every add, pull and rejoin. That trailer is the hub commit the site last joined: the "recorded"
 * sha. Then three trees decide: HEAD:shared, the recorded commit's and the hub tip's.
 *
 * Three traps, all paid for. (1) The log has NO path limit. A squash commit's tree holds the hub at
 * its root, so `-- shared` misses it and every later state reads wrong. (2) The newest trailer is
 * not always the latest sha: a stale branch can merge in late with an old one, so the descendant-most
 * recorded sha wins. Older git also wrote a trailer on the add merge that points at the local squash
 * commit; hubRecords drops those. (3) A pull does not publish local work. `outgoing` counts from where
 * a split really stops, a rejoin, and not from the last pull: a pull's squash commit stops nothing, so a
 * commit behind a pull can still go out, even with shared/ equal to the hub.
 *
 * Two more facts come with a state, both read without running a split:
 *
 *   leaks    the commits without shared/ that a split would keep as they are, oldest first. Each one
 *            brings the site's own line along. carriedCommits walks git subtree's own rules, and it
 *            is cheap: one rev-list and one cat-file, for a site of any age. push.mjs still counts
 *            the real split, which is the exact answer.
 *   revert   a commit going out that reverts a pull and still stands, read from the line git writes
 *            in a revert's message. A message rewritten by hand reads as ordinary work.
 *
 * HOW TO CHANGE IT
 *   A new state: add it to STATES, decide it in classify(), and add a status line for it in
 *   lib/checks.mjs. classify() and carriedCommits() are pure, and tested without git.
 */

import { isOnRemote } from './checkout.mjs';
import { git, gitOrThrow, gitValue } from './git.mjs';
import { BRANCH, MS_PER_SECOND, PREFIX, REMOTE, UPSTREAM_REF } from './settings.mjs';

export const STATES = Object.freeze({
  IN_SYNC: 'in sync',
  BEHIND: 'behind',
  AHEAD: 'ahead',
  DIVERGED: 'diverged',
  PUSHED_NOT_REJOINED: 'pushed but not rejoined',
  NOT_ANCESTOR: 'recorded sha not an ancestor',
  UNREADABLE: 'unreadable',
});

/** Why a state is unreadable. */
export const REASONS = Object.freeze({
  NO_FOLDER: 'no-folder',
  NO_RECORD: 'no-record',
  NO_REMOTE: 'no-remote',
  NO_UPSTREAM: 'no-upstream',
});

/** How a recorded sha that is not an ancestor relates to the hub. */
export const RELATIONS = Object.freeze({
  AHEAD_OF_HUB: 'ahead-of-hub',
  HUB_WENT_BACK: 'hub-went-back',
  MISSING: 'missing',
  UNRELATED: 'unrelated',
});

const SPLIT_TRAILER = /^git-subtree-split: ([0-9a-f]{40})\s*$/m;
const MAINLINE_TRAILER = /^git-subtree-mainline: ([0-9a-f]{40})\s*$/m;

/** The line git writes in a revert's message. It reads the same for a merge and a plain commit. */
const REVERTS_LINE = /^This reverts commit ([0-9a-f]{40})/m;

/** How long a fetch may wait on the network before the hub counts as out of reach. */
const FETCH_TIMEOUT_MS = 60_000;

/** How many of git's own lines a failed fetch keeps, from the end: the reason is there. */
const FETCH_REASON_LINES = 3;

const FIELD_SEPARATOR = '\0';
const RECORD_SEPARATOR = '\x01';

/** Splits `git log` output written with %x00 between fields and %x01 after each commit. */
function logRows(stdout) {
  const rows = stdout.split(RECORD_SEPARATOR).map((row) => row.replace(/^\n/, ''));
  return rows.filter((row) => row !== '').map((row) => row.split(FIELD_SEPARATOR));
}

/** Every commit in HEAD's history that carries this prefix's trailers, newest first. */
export function readRecords(root, env = process.env) {
  const args = [
    'log',
    '--no-show-signature',
    `--grep=^git-subtree-dir: ${PREFIX}/*$`,
    '--format=%H%x00%P%x00%B%x01',
    'HEAD',
  ];
  const { stdout } = git(args, { cwd: root, env, read: true });
  const records = logRows(stdout).map(([commit, parents, message]) => ({
    commit,
    parents: parents.split(' ').filter(Boolean),
    split: message.match(SPLIT_TRAILER)?.[1] ?? null,
    mainline: message.match(MAINLINE_TRAILER)?.[1] ?? null,
  }));
  return records.filter((record) => record.split !== null);
}

/** The records that name a hub commit: a trailer pointing at a local squash commit is dropped. */
export function hubRecords(records) {
  const localCommits = new Set(records.map((record) => record.commit));
  return records.filter((record) => !localCommits.has(record.split));
}

/** The commits among `shas` that this repository holds. */
function commitsPresent(root, shas, env) {
  const args = ['rev-list', '--no-walk', '--ignore-missing', ...shas];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return stdout.split('\n').filter(Boolean);
}

/** The commits among `shas` that no other one of them descends from. */
function tipsAmong(root, shas, env) {
  const { stdout } = git(['merge-base', '--independent', ...shas], { cwd: root, env, read: true });
  return stdout.split('\n').filter(Boolean);
}

/**
 * The descendant-most recorded sha, and whether this repository holds it. `records` come newest
 * first, so a tie between unrelated shas goes to the newest. A newest sha the repository does not
 * hold stops the search: the hub was rewritten, or was never fetched.
 */
export function pickRecorded(root, records, env = process.env) {
  const shas = [...new Set(records.map((record) => record.split))];
  const present = commitsPresent(root, shas, env);
  if (!present.includes(shas[0])) return { sha: shas[0], known: false };
  const tips = tipsAmong(root, present, env);
  const sha = shas.find((candidate) => tips.includes(candidate));
  return { sha, known: true };
}

/** True when `ancestor` is `descendant` or sits behind it. */
export function isAncestor(root, ancestor, descendant, env) {
  return git(['merge-base', '--is-ancestor', ancestor, descendant], { cwd: root, env, read: true }).ok;
}

/** Every commit in HEAD's history with its parents, newest first. */
function readHistory(root, env) {
  const { stdout } = git(['rev-list', '--parents', 'HEAD'], { cwd: root, env, read: true });
  const history = new Map();
  for (const line of stdout.split('\n').filter(Boolean)) {
    const [commit, ...parents] = line.split(' ');
    history.set(commit, parents);
  }
  return history;
}

/** A map from a commit to the merges that have it as a parent. */
function mergesByParent(history) {
  const merges = new Map();
  for (const [merge, parents] of history) {
    if (parents.length < 2) continue;
    for (const parent of parents) merges.set(parent, [...(merges.get(parent) ?? []), merge]);
  }
  return merges;
}

/** The object each name means, or null where there is none, with one git call for all of them. */
function objectsOf(root, names, env) {
  const args = ['cat-file', '--batch-check=%(objectname)'];
  const { stdout } = git(args, { cwd: root, env, read: true, input: `${names.join('\n')}\n` });
  const answers = stdout.split('\n').filter(Boolean);
  const objects = new Map();
  names.forEach((name, index) => {
    const answer = answers[index] ?? '';
    objects.set(name, answer.endsWith(' missing') ? null : answer);
  });
  return objects;
}

/** The name of a commit's shared/ folder. */
function folderOf(commit) {
  return `${commit}:${PREFIX}`;
}

/**
 * The commits where a split really stops: a rejoin, and a pull that wrote a rejoin's record. Everything
 * older has reached the hub or never will. A plain pull is no such point: a commit behind one still goes
 * out, even when shared/ equals the hub. The add needs no line here: nothing before it touches shared/,
 * and withoutBareMerges drops its merge.
 */
function syncPoints(root, records, env) {
  const rejoins = records.filter(({ parents, mainline }) => parents.length > 1 && mainline);
  if (rejoins.length === 0) return [];
  const names = rejoins.flatMap(({ commit, split }) => [folderOf(commit), `${split}^{tree}`]);
  const objects = objectsOf(root, names, env);
  const matchesHub = ({ commit, split }) => {
    const hubTree = objects.get(`${split}^{tree}`);
    return Boolean(hubTree) && objects.get(folderOf(commit)) === hubTree;
  };
  return rejoins.filter(matchesHub).map(({ commit }) => commit);
}

/** The merges of the pulls and the add: a squash commit joins the site's line through one. */
function pullMerges(records, history) {
  const merges = mergesByParent(history);
  return new Set(records.flatMap(({ commit }) => merges.get(commit) ?? []));
}

/**
 * The commits without shared/ that a split would keep as they are, oldest first. This walks git
 * subtree's own rules from HEAD, so it needs no split and writes nothing. A record says where a commit
 * already maps. A commit with the folder gets a mapping. One without it gets a mapping only when a
 * parent has one, and that mapping is the commit itself: the split then holds a real site commit, and
 * through its parents the whole line behind it. Before the add no parent has a mapping, so the site's
 * old commits are never counted. `history` holds parents, `hasFolder` answers for a commit. Pure.
 */
export function carriedCommits({ head, history, records, hasFolder }) {
  const mapped = new Set();
  for (const { commit, mainline, split } of records) {
    if (mainline) [mainline, split].forEach((known) => mapped.add(known));
    else mapped.add(commit);
  }
  const finished = new Set();
  const carried = [];
  const stack = [head];
  while (stack.length > 0) {
    const commit = stack.at(-1);
    const parents = history.get(commit) ?? [];
    const unread = parents.filter((parent) => !mapped.has(parent) && !finished.has(parent));
    if (!mapped.has(commit) && !finished.has(commit) && unread.length > 0) {
      stack.push(...unread);
      continue;
    }
    stack.pop();
    if (mapped.has(commit) || finished.has(commit)) continue;
    finished.add(commit);
    if (hasFolder(commit)) {
      mapped.add(commit);
    } else if (parents.some((parent) => mapped.has(parent))) {
      mapped.add(commit);
      carried.push(commit);
    }
  }
  return carried;
}

/** The subjects of some commits, as a map. */
function subjectsOf(root, shas, env) {
  const args = ['log', '--no-walk', '--no-show-signature', '--format=%H%x00%s%x01', ...shas];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return new Map(logRows(stdout));
}

/** The commits a split would carry, each as { sha, subject }. */
function readLeaks(root, records, history, env) {
  const [head] = history.keys();
  const folders = objectsOf(root, [...history.keys()].map(folderOf), env);
  const hasFolder = (commit) => folders.get(folderOf(commit)) !== null;
  const carried = carriedCommits({ head, history, records, hasFolder });
  if (carried.length === 0) return [];
  const subjects = subjectsOf(root, carried, env);
  return carried.map((sha) => ({ sha, subject: subjects.get(sha) ?? '' }));
}

/** Every file a commit changed, relative to the root. */
function commitPaths(root, sha, env) {
  const args = ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', sha];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return stdout.split('\0').filter(Boolean);
}

/** A commit row with the facts a push must know: is it a merge, does it mix in site files. */
function outgoingCommit(root, [sha, parents, subject, body], env) {
  const merge = parents.split(' ').filter(Boolean).length > 1;
  const paths = merge ? [] : commitPaths(root, sha, env);
  const inShared = paths.filter((file) => file.startsWith(`${PREFIX}/`));
  const mixed = inShared.length > 0 && inShared.length < paths.length;
  return { sha, subject, body: body.trim(), merge, paths, mixed };
}

/**
 * Drops the oldest merges of a list, newest first. A pull's merge with no site commit behind it maps
 * onto the hub commit it pulled, so a split makes nothing of it.
 */
function withoutBareMerges(commits) {
  return commits.slice(0, commits.findLastIndex((commit) => !commit.merge) + 1);
}

/**
 * The site's commits that touch shared/ and came after the last stop, newest first, the way a split
 * finds them. --full-history keeps a side line that a merge left the same as its other parent: a
 * split copies that line too. The push reads the split itself, so this list guides and that one rules.
 */
function outgoingCommits(root, records, env) {
  const exclusions = syncPoints(root, records, env).map((sha) => `^${sha}`);
  const format = '--format=%H%x00%P%x00%s%x00%b%x01';
  const args = ['log', '--no-show-signature', '--topo-order', '--full-history', format, 'HEAD', ...exclusions, '--', PREFIX];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return withoutBareMerges(logRows(stdout).map((row) => outgoingCommit(root, row, env)));
}

/** The newest commit going out that reverts a pull and still stands, or null. */
function standingPullRevert(outgoing, records, history) {
  const pulls = pullMerges(records, history);
  const undone = new Set();
  for (const { sha, body } of outgoing) {
    if (undone.has(sha)) continue;
    const reverted = body.match(REVERTS_LINE)?.[1];
    if (reverted) undone.add(reverted);
    if (pulls.has(reverted)) return sha;
  }
  return null;
}

/** The hub's commits a pull would bring. Their subjects land in this site's history. */
function incomingCommits(root, recorded, upstream, env) {
  const args = ['log', '--no-show-signature', '--format=%H%x00%s%x01', `${recorded}..${upstream}`];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return logRows(stdout).map(([sha, subject]) => ({ sha, subject }));
}

/** The six states from plain facts. Pure. */
export function classify({ recorded, upstream, headTree, recordedTree, upstreamTree, recordedIsAncestor }) {
  if (!recordedIsAncestor) return STATES.NOT_ANCESTOR;
  const hubMoved = recorded !== upstream;
  const siteMoved = headTree !== recordedTree;
  if (!hubMoved) return siteMoved ? STATES.AHEAD : STATES.IN_SYNC;
  if (!siteMoved) return STATES.BEHIND;
  return headTree === upstreamTree ? STATES.PUSHED_NOT_REJOINED : STATES.DIVERGED;
}

/** The hub's address as this checkout has it, or null without the remote. */
export function remoteOf(root, env = process.env) {
  return gitValue(['remote', 'get-url', REMOTE], { cwd: root, env, read: true });
}

/** Fetches the hub's branch. Its exit code is the answer: a failed fetch reads as `ok: false`. */
export function fetchHub(root, env = process.env) {
  return git(['fetch', '--quiet', '--no-tags', REMOTE, BRANCH], { cwd: root, env, timeout: FETCH_TIMEOUT_MS, group: true });
}

/**
 * Why a fetch failed, as git's last lines, so a refused key, a wrong address or a missing repository
 * reads as itself and not as the network. A fetch that ran out of time says so.
 */
export function fetchReason({ status, stderr }) {
  if (status === null) return [`no answer from the hub within ${FETCH_TIMEOUT_MS / MS_PER_SECOND} s`];
  const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.length === 0 ? [`git fetch stopped with exit code ${status}`] : lines.slice(-FETCH_REASON_LINES);
}

/** The state for a site that cannot be read, with the reason. */
function unreadable(reason, facts = {}) {
  return { state: STATES.UNREADABLE, reason, ...facts };
}

/**
 * True when the hub once held `sha`. A record without a mainline came in by a pull. Failing that, the
 * fetched ref's own log says where the hub has been: a push and a fetch both leave a line there.
 */
function hubOnceHeld(root, sha, records, env) {
  if (!records.some((record) => record.split === sha && record.mainline)) return true;
  const { stdout } = git(['log', '-g', '--format=%H', UPSTREAM_REF], { cwd: root, env, read: true });
  return stdout.split('\n').includes(sha);
}

/** How a recorded sha that is not an ancestor relates to the hub. */
function relationToHub(root, { recorded, known, upstream, records }, env) {
  if (!known) return RELATIONS.MISSING;
  if (!isAncestor(root, upstream, recorded, env)) return RELATIONS.UNRELATED;
  return hubOnceHeld(root, recorded, records, env) ? RELATIONS.HUB_WENT_BACK : RELATIONS.AHEAD_OF_HUB;
}

/**
 * True when HEAD is the merge of the pull that brought `recorded`, and no remote holds it yet. A rejoin
 * has that shape, but it holds a record itself, and what it joined was this site's own push. An add has
 * it too, but its first parent has no shared/, and undoing an add takes the mount away.
 */
function pullCanBeUndone(root, recorded, records, history, env) {
  const [head] = history.keys();
  const [firstParent, secondParent] = history.get(head);
  const squash = records.find((record) => record.split === recorded && record.parents.length < 2);
  if (squash === undefined || secondParent !== squash.commit) return false;
  if (records.some(({ commit }) => commit === head)) return false;
  const hadFolder = objectsOf(root, [folderOf(firstParent)], env).get(folderOf(firstParent)) !== null;
  return hadFolder && !isOnRemote(root, head, env);
}

/** The trees that classify() needs, from the commits already known to exist. */
function readTrees(root, recorded, upstream, env) {
  const options = { cwd: root, env, read: true };
  return {
    recordedTree: gitOrThrow(['rev-parse', `${recorded}^{tree}`], options),
    upstreamTree: gitOrThrow(['rev-parse', `${upstream}^{tree}`], options),
  };
}

/** Reads the state from the records, once the hub's tip is known. */
function stateFromRecords(root, allRecords, facts, env) {
  const { upstream, headTree } = facts;
  const records = hubRecords(allRecords);
  const history = readHistory(root, env);
  const { sha: recorded, known } = pickRecorded(root, records, env);
  const outgoing = known ? outgoingCommits(root, records, env) : [];
  const ahead = outgoing.filter((commit) => !commit.merge).length;
  const leaks = readLeaks(root, allRecords, history, env);
  const revert = standingPullRevert(outgoing, records, history);
  const common = { ...facts, recorded, outgoing, ahead, leaks, revert, incoming: [], behind: 0 };
  const recordedIsAncestor = known && isAncestor(root, recorded, upstream, env);
  if (!recordedIsAncestor) {
    const relation = relationToHub(root, { recorded, known, upstream, records }, env);
    const undoablePull = known && pullCanBeUndone(root, recorded, records, history, env);
    return { ...common, state: STATES.NOT_ANCESTOR, relation, undoablePull };
  }
  const trees = readTrees(root, recorded, upstream, env);
  const state = classify({ ...trees, recorded, upstream, headTree, recordedIsAncestor });
  const incoming = incomingCommits(root, recorded, upstream, env);
  return { ...common, ...trees, state, incoming, behind: incoming.length };
}

/**
 * The site's state. `fetch: false` uses the hub's tip as last fetched. The answer always has
 * `state`, and `fetched` is true, false, or null when no fetch was tried. A failed fetch also gives
 * `fetchError`, git's own last lines.
 */
export function readState(root, { fetch = true, env = process.env } = {}) {
  const options = { cwd: root, env, read: true };
  const headTree = gitValue(['rev-parse', '--verify', '--quiet', `HEAD:${PREFIX}`], options);
  if (headTree === null) return unreadable(REASONS.NO_FOLDER);
  const allRecords = readRecords(root, env);
  if (hubRecords(allRecords).length === 0) return unreadable(REASONS.NO_RECORD);
  if (remoteOf(root, env) === null) return unreadable(REASONS.NO_REMOTE);
  const fetchResult = fetch ? fetchHub(root, env) : null;
  const fetched = fetchResult === null ? null : fetchResult.ok;
  const fetchError = fetched === false ? fetchReason(fetchResult) : null;
  const upstream = gitValue(['rev-parse', '--verify', '--quiet', `${UPSTREAM_REF}^{commit}`], options);
  if (upstream === null) return unreadable(REASONS.NO_UPSTREAM, { fetched, fetchError });
  return stateFromRecords(root, allRecords, { fetched, fetchError, upstream, headTree }, env);
}

/** How many commits a range holds. */
function countCommits(root, range, env) {
  return Number(gitOrThrow(['rev-list', '--count', ...range], { cwd: root, env, read: true }));
}

/**
 * Exactly what a push would publish: the split of HEAD's shared/, the commits it adds to the hub,
 * merges included, and `ownCommits`, how many of those are this site's real commits. A clean split
 * holds only copies, so that is 0. A commit HEAD holds as it is means the site's line came along.
 * Slower than the state reader, and it writes dangling commits and a cache below .git, so a read-only
 * script leaves this alone. It throws if the split fails.
 */
export function commitsToPublish(root, recorded, env = process.env) {
  const split = gitOrThrow(['subtree', 'split', '--prefix', PREFIX, 'HEAD'], { cwd: root, env });
  const format = '--format=%H%x00%P%x00%s%x00%b%x01';
  const range = `${recorded}..${split}`;
  const args = ['log', '--no-show-signature', format, range];
  const { stdout } = git(args, { cwd: root, env, read: true });
  const commits = logRows(stdout).map(([sha, , subject, body]) => ({ sha, subject, body: body.trim() }));
  const ownCommits = countCommits(root, [range], env) - countCommits(root, [range, '^HEAD'], env);
  return { split, commits, ownCommits };
}
