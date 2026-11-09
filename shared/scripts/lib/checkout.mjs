/**
 * scripts/lib/checkout.mjs: plain facts about the checkout a script runs in: its root, its branch,
 * whether it is the main checkout or a worktree, which tracked files have changed, whether a remote holds
 * a commit, which merge, revert, cherry-pick or rebase is still open, and which worktree holds a branch.
 * Also the two small readers other files share: a folder's real path and a file's text.
 *
 * HOW TO CHANGE IT
 *   Add a function per fact. Nothing here decides what a fact means: the scripts and the status
 *   checks do that. A read goes through git(…, { read: true }) so it takes no lock. A new kind of
 *   step git leaves open is a row in OPEN_STEPS.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { git, gitValue } from './git.mjs';

/** A folder's real path, or the path as given when it does not exist. */
export function realPath(folder) {
  try {
    return fs.realpathSync(folder);
  } catch {
    return folder;
  }
}

/** The file's text, or null when it cannot be read. */
export function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** The top of the repository holding `cwd`, or a usage ScriptError outside any repository. */
export function findRoot(cwd = process.cwd(), env = process.env) {
  const root = gitValue(['rev-parse', '--show-toplevel'], { cwd, env, read: true });
  if (root === null) throw new ScriptError(`${cwd} is not inside a git repository.`, EXIT.USAGE);
  return root;
}

/** True in the main checkout, false in a linked worktree (git's two folders differ there). */
export function isMainCheckout(root, env = process.env) {
  const options = { cwd: root, env, read: true };
  const gitDir = gitValue(['rev-parse', '--git-dir'], options);
  const commonDir = gitValue(['rev-parse', '--git-common-dir'], options);
  return realPath(path.resolve(root, gitDir)) === realPath(path.resolve(root, commonDir));
}

/** The branch name, or null when HEAD is detached. */
export function currentBranch(root, env = process.env) {
  return gitValue(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: root, env, read: true });
}

/**
 * What git leaves behind while a step waits for you, in the order to look: a rebase can stop at a
 * cherry-pick of its own. `marker` is a ref or a folder below .git, and `fix` is the way on or out.
 */
const OPEN_STEPS = Object.freeze([
  { kind: 'rebase', marker: 'rebase-merge', folder: true, fix: 'git add the resolved files, then git rebase --continue; or git rebase --abort' },
  { kind: 'rebase', marker: 'rebase-apply', folder: true, fix: 'git add the resolved files, then git rebase --continue; or git rebase --abort' },
  { kind: 'cherry-pick', marker: 'CHERRY_PICK_HEAD', fix: 'git add the resolved files, then git cherry-pick --continue; or git cherry-pick --abort' },
  { kind: 'revert', marker: 'REVERT_HEAD', fix: 'git add the resolved files, then git revert --continue; or git revert --abort' },
  { kind: 'merge', marker: 'MERGE_HEAD', fix: 'git add the resolved files, then git commit --no-edit; or git merge --abort' },
]);

/** True when the step's marker is there. */
function hasMarker(root, { marker, folder }, env) {
  const options = { cwd: root, env, read: true };
  if (!folder) return gitValue(['rev-parse', '--verify', '--quiet', marker], options) !== null;
  const where = gitValue(['rev-parse', '--git-path', marker], options);
  return where !== null && fs.existsSync(path.resolve(root, where));
}

/** The step git has open here, as { kind, fix }, or null when none is. */
export function openStep(root, env = process.env) {
  const found = OPEN_STEPS.find((step) => hasMarker(root, step, env));
  return found ? { kind: found.kind, fix: found.fix } : null;
}

/** The path of another worktree that has `branch` checked out, or null. */
export function worktreeHolding(root, branch, env = process.env) {
  const { stdout } = git(['worktree', 'list', '--porcelain'], { cwd: root, env, read: true });
  const here = realPath(root);
  let current = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) current = line.slice('worktree '.length);
    if (line === `branch refs/heads/${branch}` && current !== null && realPath(current) !== here) return current;
  }
  return null;
}

/** True for a shallow clone, whose history stops short. */
export function isShallow(root, env = process.env) {
  return gitValue(['rev-parse', '--is-shallow-repository'], { cwd: root, env, read: true }) === 'true';
}

/**
 * The way onto `branch` from here: a plain switch, unless another worktree holds the branch. A linked
 * worktree is told to use the main checkout, where pull and push run.
 */
export function switchFix(root, branch, env = process.env) {
  if (!isMainCheckout(root, env)) return 'run it in the main checkout';
  const holder = worktreeHolding(root, branch, env);
  if (holder === null) return `git switch ${branch}`;
  return `the worktree at ${holder} has ${branch}: switch it to another branch there, then git switch ${branch} here`;
}

/** True when any remote-tracking branch holds this commit. */
export function isOnRemote(root, sha, env = process.env) {
  const { stdout } = git(['branch', '-r', '--contains', sha], { cwd: root, env, read: true });
  return stdout.trim() !== '';
}

/** The output of a name-only git command as a list. */
function nameList(args, options) {
  const result = git(args, options);
  return result.stdout.split('\n').filter((line) => line !== '');
}

/**
 * Refreshes the index's record of each file. git subtree's clean check reads that record as it is, so a
 * file whose content is the same but whose time or attributes changed, as an editor, Finder or Quick
 * Look can change them, reads as changed there. Call it right before every git subtree command.
 */
export function refreshIndex(root, env = process.env) {
  git(['update-index', '-q', '--refresh'], { cwd: root, env });
}

/**
 * Every changed tracked file, the same way git-subtree's own clean check sees them: against HEAD,
 * in the work tree and in the index. It refreshes the index first, because that check does not,
 * and a touched but unchanged file would read as changed.
 */
export function dirtyPaths(root, env = process.env) {
  refreshIndex(root, env);
  const options = { cwd: root, env, read: true };
  const inWorkTree = nameList(['diff-index', '--name-only', 'HEAD', '--'], options);
  const inIndex = nameList(['diff-index', '--cached', '--name-only', 'HEAD', '--'], options);
  return [...new Set([...inWorkTree, ...inIndex])].sort();
}

/** Every tracked file below `folder`, relative to the root, once: a conflicted file has three entries. */
export function trackedFiles(root, folder, env = process.env) {
  const result = git(['ls-files', '-z', '--', folder], { cwd: root, env, read: true });
  return [...new Set(result.stdout.split('\0').filter((name) => name !== ''))];
}

/** Every file below `folder` that git ignores, relative to the root. */
export function ignoredFiles(root, folder, env = process.env) {
  const args = ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', folder];
  const result = git(args, { cwd: root, env, read: true });
  return result.stdout.split('\0').filter((name) => name !== '');
}
