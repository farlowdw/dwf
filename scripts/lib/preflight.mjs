/**
 * scripts/lib/preflight.mjs: the refusals shared:pull and shared:push have in common. Each one stops
 * before anything changes, says why and gives the command that fixes it. They exit 4 (lib/exitCodes.mjs).
 *
 * Both scripts start with passGates, which covers the main checkout, a merge, revert, cherry-pick or
 * rebase still open, the site's branch and the word list. The open step comes before the branch: a rebase
 * leaves HEAD detached, and a switch fails there. Then refuseDirty runs before anything moves: `git subtree` refuses a changed tree
 * at the merge and the rejoin, but NOT at the push, so a push on a changed tree publishes and only then
 * stops. The check has to come first.
 *
 * A site that still holds what a red run of shared:all or shared:bump went red on is refused by refuseHeldRed, with
 * the undo that red printed: a pull or a bump on top of it would build on a change nobody proved (lib/redRecord.mjs).
 *
 * HOW TO CHANGE IT
 *   A new refusal for both scripts: a function here, called from passGates. A refusal for one script
 *   stays in that script. The longest list a refusal prints is lib/phrases.mjs > MAX_DETAILS.
 */

import { currentBranch, dirtyPaths, isMainCheckout, openStep, switchFix } from './checkout.mjs';
import { FETCH_FIX, hubCheck } from './checks.mjs';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { capped, counted } from './phrases.mjs';
import { readWordList } from './privacy.mjs';
import { KINDS, STANDINGS, heldRefusal, redOf } from './redRecord.mjs';
import { REMOTE, SITE_BRANCH, remoteUrl, wordListPath } from './settings.mjs';
import { REASONS, readState } from './state.mjs';

/** The option that lets a machine without the word list go on. Both scripts take it. */
export const NO_WORD_LIST_FLAG = '--no-word-list';

/** The last line of a refusal. */
export const NOTHING_CHANGED = 'Nothing was changed.';

/** The error a refusal throws: the reason, its details, the fix, and that nothing moved. */
export function refusal(script, reason, { details = [], fix } = {}) {
  const lines = [`${script} refused: ${reason}`, ...capped(details).map((line) => `  ${line}`)];
  if (fix) lines.push(`Fix: ${fix}`);
  lines.push(NOTHING_CHANGED);
  return new ScriptError(lines.join('\n'), EXIT.REFUSED);
}

/** Worktrees share one branch list, so pull and push run in the main checkout only. */
function refuseWorktree(root, script, env) {
  if (isMainCheckout(root, env)) return;
  throw refusal(script, 'this is a worktree.', { fix: 'run it in the main checkout' });
}

/** Pull and push run on the site's one branch. */
function refuseOffBranch(root, script, env) {
  const branch = currentBranch(root, env);
  if (branch === SITE_BRANCH) return;
  const reason = `this checkout is on ${branch ?? 'a detached HEAD'}, not ${SITE_BRANCH}.`;
  throw refusal(script, reason, { fix: switchFix(root, SITE_BRANCH, env) });
}

/** An open merge, revert, cherry-pick or rebase is finished or dropped first. Never git ci there: it commits the markers. */
function refuseOpenStep(root, script, env) {
  const open = openStep(root, env);
  if (open === null) return;
  throw refusal(script, `a ${open.kind} is still open.`, { fix: open.fix });
}

/** The machine's word list. Without it only the secret shapes can be scanned. */
export function requireWordList(script, env, allowNoWordList) {
  const list = readWordList(wordListPath(env));
  if (!list.missing) return list;
  if (allowNoWordList) {
    console.warn(`WARNING: no word list at ${list.file}, so only secret shapes are scanned.`);
    return list;
  }
  const fix = `fill in the file, or pass ${NO_WORD_LIST_FLAG} to scan for secret shapes alone`;
  throw refusal(script, `the word list is missing or empty at ${list.file}.`, { fix });
}

/** The checks every run starts with. Returns the word list. */
export function passGates(root, { script, env, allowNoWordList = false }) {
  refuseWorktree(root, script, env);
  refuseOpenStep(root, script, env);
  refuseOffBranch(root, script, env);
  return requireWordList(script, env, allowNoWordList);
}

/**
 * A site that still holds a red run's change stops a pull or a bump, with that red's undo as the fix. `kinds` narrows
 * which reds count: a bump reads its own leftovers with refusals of its own.
 */
export function refuseHeldRed(root, { script, env, kinds = Object.values(KINDS) }) {
  const red = redOf(root, { env });
  if (red === null || red.standing !== STANDINGS.HOLDS || !kinds.includes(red.record.kind)) return;
  const { reason, fix } = heldRefusal(red.record);
  throw refusal(script, reason, { fix });
}

/** Changed tracked files stop a pull or a push. `paths` narrows what counts, for `push -m`. */
export function refuseDirty(root, { script, env, fix, paths = dirtyPaths(root, env) }) {
  if (paths.length === 0) return;
  throw refusal(script, `${counted(paths.length, 'changed tracked file')}.`, { details: paths, fix });
}

/**
 * The state after a fetch. A hub out of reach stops the run: an old answer is no answer here. git's own
 * last lines say why, so a refused key or a wrong address does not read as the network.
 */
export function freshState(root, env) {
  const state = readState(root, { env });
  if (state.fetched !== false) return state;
  const reason = (state.fetchError ?? []).map((line) => `  ${line}`);
  const lines = ['Could not reach the hub, so nothing was changed. git said:', ...reason, `Fix: ${FETCH_FIX}, then run this again.`];
  throw new ScriptError(lines.join('\n'), EXIT.GIT);
}

/** The refusal for a state a script cannot act on, in the words shared:status uses for it. */
export function stateRefusal(script, state, list, env, root) {
  const line = hubCheck({ root, env, open: () => null, state: () => state, wordList: () => list, offline: false }).at(-1);
  const addRemote = `git remote add ${REMOTE} ${remoteUrl(env)}`;
  return refusal(script, `${line.text}.`, { fix: state.reason === REASONS.NO_REMOTE ? addRemote : line.fix });
}
