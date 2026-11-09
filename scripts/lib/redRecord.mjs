/**
 * scripts/lib/redRecord.mjs: what a red run leaves for the runs after it. When `shared:all` or `shared:bump` goes red
 * at a site and leaves something to undo, it writes one small file inside that site's .git folder, where no commit,
 * push or pull ever carries it: the step that went red, the commit the site was on, the hub commit it took in, the
 * undo it printed, and the lines it printed to publish the sites it had tested. shared:status, shared:all,
 * shared:pull and shared:bump read it, so a red site never reads green and a pull there waits for the undo. The next
 * green proof at that site takes the file away.
 *
 * A file and not the history, because a red is about the work tree and node_modules as much as the commits, the undo
 * resets the commits away, and nothing about a red may ever reach the hub or a public site.
 *
 * Where a red stands is read from the site each time, never from the file alone (standingOf):
 *
 *   holds     the site still holds what went red: a bump's package files or node_modules, or the commits of the
 *             red turn, which took in the hub commit. Status fails with the printed undo, and pull, bump and
 *             shared:all refuse.
 *   waiting   the undo ran, and the change is still ahead: a plain pull would bring the same hub commit back, or
 *             the hub's pin is still the version that went red. Status warns with the way on.
 *   settled   the site is past it: it holds a later hub commit, or it took the same hub commit again in a pull of
 *             its own after the undo, as a site does when the red was its own code, or the pin moved off that
 *             version and the site stands on its own pin. Nothing reads it any more, and the next shared:all turn
 *             there removes it.
 *
 * HOW TO CHANGE IT
 *   The file's name: RECORD_FILE, and RECORD_FORMAT when its fields change. What a red says: the phrases below,
 *   which status, the refusals and shared:all's Next lines share. A new kind of red: a value in KINDS and its case
 *   in standingOf.
 */

import fs from 'node:fs';
import path from 'node:path';
import { installedOffManifest, isOnVersion, pinnedEntries, readManifest } from './bumpLock.mjs';
import { CHANGED_FILES } from './bumpSettings.mjs';
import { dirtyPaths } from './checkout.mjs';
import { gitValue } from './git.mjs';
import { inSite, short } from './phrases.mjs';
import { hubPin, lockedVersions, pinBackLine, readPin } from './pin.mjs';
import { BUMP_LINE } from './requirements.mjs';
import { isAncestor, readState } from './state.mjs';

/** The file, below the site's git folder. */
const RECORD_FILE = 'docusaurus-shared-red.json';

/** The shape of the file's fields. A file of another shape is read as none. */
const RECORD_FORMAT = 1;

/** What a red turn was doing: a pull of the hub, or a bump of Docusaurus. */
export const KINDS = Object.freeze({ PULL: 'pull', BUMP: 'bump' });

/** Where a red stands now. */
export const STANDINGS = Object.freeze({ HOLDS: 'holds', WAITING: 'waiting', SETTLED: 'settled' });

/** The two scripts that write a record. */
export const RECORD_SCRIPTS = Object.freeze({ ALL: 'shared:all', BUMP: 'shared:bump' });

/** The fix forward a red pull waits for, with the words a person fills in. */
export const PUSH_FIX_LINE = 'npm run shared:push -- -m "<what the fix does>"';

const ALL_PULL_LINE = 'npm run shared:all -- pull';
const ALL_BUMP_LINE = 'npm run shared:all -- bump';

/** Where a site's record lives. Null outside a repository. */
export function recordPath(root, env = process.env) {
  const where = gitValue(['rev-parse', '--git-path', RECORD_FILE], { cwd: root, env, read: true });
  return where === null ? null : path.resolve(root, where);
}

/** The site's record, or null when there is none or it cannot be read. */
export function readRecord(root, env = process.env) {
  const file = recordPath(root, env);
  if (file === null) return null;
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    return record?.format === RECORD_FORMAT ? record : null;
  } catch {
    return null;
  }
}

/** Writes the site's record, over any one before it. */
export function writeRecord(root, record, env = process.env) {
  const file = recordPath(root, env);
  if (file !== null) fs.writeFileSync(file, `${JSON.stringify({ format: RECORD_FORMAT, ...record }, null, 2)}\n`);
}

/** Removes the site's record. Nothing happens when there is none. */
export function removeRecord(root, env = process.env) {
  const file = recordPath(root, env);
  if (file !== null) fs.rmSync(file, { force: true });
}

/** True while a bump's leftovers are here: a package file changed against HEAD, or node_modules off package.json. */
function packagesHeld(root, env) {
  const dirty = dirtyPaths(root, env);
  if (CHANGED_FILES.some((file) => dirty.includes(file))) return true;
  try {
    return installedOffManifest(root, pinnedEntries(readManifest(root))).length > 0;
  } catch {
    return false;
  }
}

/** True when the site stands on the pin of its own template, in package.json and in the lock. */
function onOwnPin(root) {
  const { version } = readPin(root);
  try {
    return version !== null && isOnVersion(root, version);
  } catch {
    return false;
  }
}

/**
 * True while HEAD still holds the commits the red turn left, its pull among them: the undo has not run. After the
 * undo, a pull of the same hub commit makes new commits, and HEAD holds those instead. A record with no `head` reads
 * as held, as before.
 */
function keepsTurnCommits(root, record, env) {
  return !record.head || isAncestor(root, record.head, 'HEAD', env);
}

/** Where a bump's red stands, once its leftovers are gone. */
function bumpStanding(root, record, env) {
  const sitePin = readPin(root).version;
  const pinGone = hubPin(root, env).version !== record.version;
  if (onOwnPin(root) && (sitePin === record.version || pinGone)) return STANDINGS.SETTLED;
  return STANDINGS.WAITING;
}

/**
 * Where the red of `record` stands now, or null when the site's state cannot say. `state` is the site's state as
 * lib/state.mjs reads it: its `recorded` is the hub commit the site last took in.
 */
export function standingOf(root, record, { state, env = process.env }) {
  if (record.kind === KINDS.BUMP && packagesHeld(root, env)) return STANDINGS.HOLDS;
  const recorded = state?.recorded ?? null;
  if (recorded === null || !record.hub) return null;
  const tookItIn = record.kind === KINDS.PULL || record.moved;
  if (tookItIn && recorded === record.hub && keepsTurnCommits(root, record, env)) return STANDINGS.HOLDS;
  if (record.kind === KINDS.BUMP) return bumpStanding(root, record, env);
  if (recorded === record.hub) return STANDINGS.SETTLED;
  return isAncestor(root, record.hub, recorded, env) ? STANDINGS.SETTLED : STANDINGS.WAITING;
}

/** A site's record and where it stands, or null without one. `state` is read only when there is a record. */
export function redOf(root, { env = process.env, state = () => readState(root, { fetch: false, env }) } = {}) {
  const record = readRecord(root, env);
  if (record === null) return null;
  return { record, standing: standingOf(root, record, { state: state(), env }) };
}

/** The red run in words: "the pull of hub 1234567" or "the bump to 3.11.0". */
export function runPhrase(record) {
  if (record.kind === KINDS.BUMP) return `the bump to ${record.version}`;
  return record.hub ? `the pull of hub ${short(record.hub)}` : 'the pull';
}

/** How it ended, in words: "went red here at the build" or "was stopped here by SIGTERM". */
export function endPhrase(record) {
  if (record.signal) return `was stopped here by ${record.signal}`;
  return record.step ? `went red here at ${record.step}` : 'went red here';
}

/** The undo the red printed, as one line that runs from this site or any sibling. */
export function undoLine(record) {
  return inSite({ name: record.site }, record.undo);
}

/** True when a plain pull here brings back what went red: the same hub commit, or the pin a bump went red on. */
export function pullBringsItBack(red, state) {
  if (red === null || red.standing !== STANDINGS.WAITING) return false;
  return red.record.kind === KINDS.BUMP || state?.upstream === red.record.hub;
}

/** The line that puts the pin back, when the red run moved it and the hub still holds it there. Null otherwise. */
export function pinBackOf(root, record, env = process.env) {
  if (!record.pin || hubPin(root, env).version !== record.pin.to) return null;
  return pinBackLine(record.pin.from);
}

/** The bump that moves this site on once its red is fixed: the one the record's own script runs. */
export function bumpAgainLine(record) {
  return record.script === RECORD_SCRIPTS.BUMP ? `${BUMP_LINE} -- ${record.version}` : ALL_BUMP_LINE;
}

/** Every Docusaurus version this site's lock holds, as words. */
function versionsHere(root) {
  const versions = [...(lockedVersions(root)?.keys() ?? [])];
  return versions.length === 0 ? 'its own version' : versions.join(', ');
}

/** The status line's text and fix for a red that waits: { text, fix }. */
function waitingLine(root, record, state, env) {
  const undone = `${runPhrase(record)} ${endPhrase(record)} and was undone`;
  if (record.kind === KINDS.PULL && state?.upstream !== record.hub) {
    return { text: `${undone}, and the hub has moved since`, fix: `${ALL_PULL_LINE}, which proves the hub here` };
  }
  if (record.kind === KINDS.PULL) {
    const fix = `fix it forward from a site in sync with the hub: ${PUSH_FIX_LINE} there, then ${ALL_PULL_LINE}`;
    return { text: `${undone}: a pull brings it back`, fix };
  }
  const again = `fix the red here and commit it, then ${bumpAgainLine(record)}`;
  const back = pinBackOf(root, record, env);
  const fix = back === null ? again : `put the pin back from a site in sync with the hub: ${back}; or ${again}`;
  return { text: `${undone}: this site stays on ${versionsHere(root)}`, fix };
}

/** What a site still holds of a red, as status and the refusals say it. */
function heldText(record) {
  return `${runPhrase(record)} ${endPhrase(record)}, and this site still holds ${record.kind === KINDS.BUMP ? 'its changes' : 'it'}`;
}

/** A note when HEAD moved on after the red and the undo resets: the reset takes those commits as well. */
function movedOnDetails(root, record, env) {
  const head = gitValue(['rev-parse', 'HEAD'], { cwd: root, env, read: true });
  const resets = record.undo.some((step) => step.startsWith('git reset'));
  if (head === null || !record.head || head === record.head || !resets) return [];
  return [`HEAD has moved since: the reset takes every commit after ${short(record.at)} with it`];
}

/**
 * What status says of a red: { held, text, fix, details }, or null when it says nothing. `held` means the site
 * still holds it, a failure; otherwise it is undone and waits, a warning.
 */
export function redLine(root, red, state, env = process.env) {
  if (red === null || red.standing === null || red.standing === STANDINGS.SETTLED) return null;
  const { record } = red;
  if (red.standing === STANDINGS.HOLDS) {
    return { held: true, text: heldText(record), fix: undoLine(record), details: movedOnDetails(root, record, env) };
  }
  return { held: false, details: [], ...waitingLine(root, record, state, env) };
}

/** The refusal's reason and fix for a site that holds a red: { reason, fix }. */
export function heldRefusal(record) {
  return { reason: `${heldText(record)}.`, fix: `run its undo first: ${undoLine(record)}` };
}

/** Why a red no longer stands, in words, for the line that says it is cleared. */
export function clearedReason(root, record, state, env = process.env) {
  if (record.kind === KINDS.PULL && state?.recorded === record.hub) return `it took hub ${short(record.hub)} again in a pull of its own`;
  if (record.kind === KINDS.PULL) return `it holds hub ${short(state?.recorded ?? '')}, past ${short(record.hub)}`;
  const pin = hubPin(root, env).version;
  return pin === record.version ? `it stands on ${record.version}` : `the hub's pin is ${pin ?? 'another version'} now`;
}
