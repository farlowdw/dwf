/**
 * scripts/lib/mixedCommit.mjs: what shared:push and shared:pull say about a mixed commit, one that
 * changes shared/ and site files together. `git subtree` copies its subject to the hub verbatim while
 * only its shared files travel, so a site's subject reaches every other site's history. There is no
 * flag past this refusal. The refusal prints how to split the commit, and which way fits:
 *
 *   newest   a soft undo, then two commits
 *   older    the same inside `git rebase -i`
 *   stuck    already on a remote, or a merge sits after it, so it stays as it is. A subtree pull is
 *            never rebased. The change reaches the hub from another site, and a pull here records it.
 *            lib/published.mjs says why that keeps this commit out of the hub.
 *
 * A refusal lists the commits by subject, so a subject with a private hit stays hidden, as it does in
 * shared:status: the push's own subject scan comes later than this one when the hub has moved, and a
 * pull has no such scan of a site's commits.
 *
 * Every line that is a command stands alone, so it can be pasted into fish or sh as printed; a step for
 * the reader has a line of its own.
 *
 * HOW TO CHANGE IT
 *   A new way out: a case in splitRoute and its lines in SPLIT_LINES. MAX_SITE_PATHS is the longest
 *   list of site files printed in one `git add`.
 */

import { isOnRemote } from './checkout.mjs';
import { gitValue } from './git.mjs';
import { shellWord, short } from './phrases.mjs';
import { refusal } from './preflight.mjs';
import { scanCommits } from './privacy.mjs';
import { PREFIX } from './settings.mjs';

const MAX_SITE_PATHS = 6;
const SHARED_SUBJECT = '"<a subject that reads well in the hub>"';
const SITE_SUBJECT = '"<the site change>"';
const HIDDEN_SUBJECT = '(subject hidden: it holds a private hit)';

const ROUTES = Object.freeze({ NEWEST: 'newest', OLDER: 'older', STUCK: 'stuck' });

/** True when a merge sits between this commit and HEAD. */
function hasMergeAfter(root, sha, env) {
  const args = ['rev-list', '--count', '--merges', `${sha}..HEAD`];
  return gitValue(args, { cwd: root, env, read: true }) !== '0';
}

/** Which way out fits this commit. */
export function splitRoute(root, commit, env) {
  if (isOnRemote(root, commit.sha, env) || hasMergeAfter(root, commit.sha, env)) return ROUTES.STUCK;
  const head = gitValue(['rev-parse', 'HEAD'], { cwd: root, env, read: true });
  return head === commit.sha ? ROUTES.NEWEST : ROUTES.OLDER;
}

/** True when the commit can still be split here. */
export function canSplit(root, commit, env) {
  return splitRoute(root, commit, env) !== ROUTES.STUCK;
}

/** The site files of a commit as an argument of `git add`. */
function siteFiles(commit) {
  const files = commit.paths.filter((file) => !file.startsWith(`${PREFIX}/`));
  if (files.length > MAX_SITE_PATHS) return '<the site files>';
  return files.map(shellWord).join(' ');
}

/** The two commits that replace a mixed one. */
function twoCommits(commit) {
  return [
    `git add ${PREFIX} && git commit -m ${SHARED_SUBJECT}`,
    `git add -- ${siteFiles(commit)} && git commit -m ${SITE_SUBJECT}`,
  ];
}

const SPLIT_LINES = Object.freeze({
  [ROUTES.NEWEST]: (commit) => ['Split it:', 'git reset HEAD~1', ...twoCommits(commit)],
  [ROUTES.OLDER]: (commit) => [
    'Split it:',
    `git rebase -i ${short(commit.sha)}~1`,
    `then, in the list that opens, mark ${short(commit.sha)} as edit, save and close it, and run:`,
    'git reset HEAD~1',
    ...twoCommits(commit),
    'git rebase --continue',
  ],
  [ROUTES.STUCK]: () => [
    'It is already on a remote, or a merge sits after it, so it stays as it is. Go around it:',
    `make the same change under ${PREFIX}/ in another site, then run this there:`,
    `npm run shared:push -- -m ${SHARED_SUBJECT}`,
    'then run this here, and the hub gets none of this commit:',
    'npm run shared:pull',
  ],
});

/** One commit as a line of the refusal. */
function listedLine({ sha, subject }, list) {
  const clean = scanCommits([{ sha, subject }], list).length === 0;
  return `${short(sha)} ${clean ? subject : HIDDEN_SUBJECT}`;
}

/** The refusal for mixed commits. It explains the newest: one at a time, newest first. */
export function mixedRefusal(script, commits, { root, env, list }) {
  const [newest] = commits;
  const listed = commits.map((commit) => listedLine(commit, list));
  const steps = SPLIT_LINES[splitRoute(root, newest, env)](newest);
  const noun = commits.length === 1 ? '1 commit mixes' : `${commits.length} commits mix`;
  const reason = `${noun} ${PREFIX}/ with site files, and a subject reaches the hub verbatim.`;
  const later = `Next time, npm run shared:push -- -m ${SHARED_SUBJECT} commits ${PREFIX}/ alone.`;
  return refusal(script, reason, { details: [...listed, ...steps, later] });
}
