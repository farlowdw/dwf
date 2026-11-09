/**
 * scripts/lib/published.mjs: the mixed commits a push would really publish, and the rejoin record.
 *
 * `git subtree split` walks back to the last rejoin, not to the last pull, so a commit behind a pull's
 * merge can still go out with the next push, subject and all. The state reader's `outgoing` list walks
 * the same way, and it is a guide: it reads no split. This file starts from the split itself. A split
 * commit keeps the author's time, the committer's time and the message of the site commit it came from,
 * so those name the site commit, and that commit's files say whether it is mixed.
 *
 * recordMessage is the other half. A rejoin's merge carries a `git-subtree-mainline` trailer, and that
 * trailer, not the squash, is where the next split stops. A pull that lands on the hub's tree with the
 * split still open writes the same trailer, so what came before it never goes out.
 *
 * HOW TO CHANGE IT
 *   ROW_FORMAT and parseRow read one line of `git log`, and they change together.
 */

import { git } from './git.mjs';
import { PREFIX } from './settings.mjs';

const FIELD_SEPARATOR = '\0';
const ROW_FORMAT = '--format=%H%x00%P%x00%at%x00%ct%x00%s';

/** One log line as { sha, merge, subject, identity }. */
function parseRow(line) {
  const [sha, parents, authored, committed, subject] = line.split(FIELD_SEPARATOR);
  const merge = parents.trim().includes(' ');
  return { sha, merge, subject, identity: `${authored} ${committed} ${subject}` };
}

/** The rows of a `git log`, newest first. */
function readRows(root, range, env) {
  const args = ['log', '--no-show-signature', ROW_FORMAT, ...range];
  const { stdout } = git(args, { cwd: root, env, read: true });
  return stdout.split('\n').filter(Boolean).map(parseRow);
}

/** A site commit with its files, and whether they mix shared/ with the site's own. */
function withPaths(root, row, env) {
  const args = ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', row.sha];
  const { stdout } = git(args, { cwd: root, env, read: true });
  const paths = stdout.split('\0').filter(Boolean);
  const inShared = paths.filter((file) => file.startsWith(`${PREFIX}/`));
  return { ...row, paths, mixed: inShared.length > 0 && inShared.length < paths.length };
}

/** The site commits behind `upstream..split` that mix shared/ with site files. Newest first. */
export function mixedPublished(root, { upstream, split }, env) {
  const published = new Set(readRows(root, [`${upstream}..${split}`], env).map((row) => row.identity));
  const siteCommits = readRows(root, ['HEAD', '--', PREFIX], env);
  const behindSplit = siteCommits.filter((row) => !row.merge && published.has(row.identity));
  return behindSplit.map((row) => withPaths(root, row, env)).filter((commit) => commit.mixed);
}

/** A merge message that records `split` as a rejoin does, with `mainline` as the commit it joins. */
export function recordMessage(subject, mainline, split) {
  return [
    subject,
    '',
    `git-subtree-dir: ${PREFIX}`,
    `git-subtree-mainline: ${mainline}`,
    `git-subtree-split: ${split}`,
  ].join('\n');
}
