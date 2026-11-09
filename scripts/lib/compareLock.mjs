/**
 * scripts/lib/compareLock.mjs: one sweep at a time on a machine. Loading pages is heavy, and timings
 * bend when two runs share a machine, so `shared:compare` takes a lock before it starts anything and
 * gives way to whoever holds it.
 *
 * The lock is a plain file whose first line is the holder's process id, with free text after it.
 * Creating it is atomic, so two runs cannot both win. A lock whose process is dead is cleared and
 * taken. A lock with no process id in it is a run caught between creating the file and writing it,
 * so it counts as held until it is EMPTY_LOCK_GRACE_MS old; past that its writer is gone, and it is
 * cleared. Any tool that keeps that format can share the file: compareSettings.mjs > SWEEP_LOCK_ENV.
 *
 * HOW TO CHANGE IT
 *   The wait is compareSettings.mjs > LOCK_WAIT_SECONDS and LOCK_POLL_MS, the grace for a lock still
 *   being written EMPTY_LOCK_GRACE_MS. Keep the format.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { EMPTY_LOCK_GRACE_MS, LOCK_POLL_MS } from './compareSettings.mjs';
import { MS_PER_SECOND } from './settings.mjs';

/** Signal 0 tests a process without touching it. EPERM means it exists under another user. */
export function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** A process id as it is written: whole digits, above 0. */
const PROCESS_ID = /^[1-9]\d*$/;

/** The holder's process id, or null when the file is empty, unreadable or holds no process id. */
export function readLockPid(lockPath) {
  try {
    const firstLine = fs.readFileSync(lockPath, 'utf8').split('\n')[0].trim();
    return PROCESS_ID.test(firstLine) ? Number(firstLine) : null;
  } catch {
    return null;
  }
}

/** True for a lock with no process id that is young enough to be a run still writing it. */
function isBeingWritten(lockPath, now = Date.now()) {
  const stats = fs.statSync(lockPath, { throwIfNoEntry: false });
  return Boolean(stats) && now - stats.mtimeMs < EMPTY_LOCK_GRACE_MS;
}

function createLockFile(lockPath, pid, note) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const descriptor = fs.openSync(lockPath, 'wx');
  fs.writeSync(descriptor, `${pid}\n${note}\n`);
  fs.closeSync(descriptor);
}

/** Renaming first means only one of two racers clears a dead lock. */
function clearDeadLock(lockPath) {
  const moved = `${lockPath}.dead.${process.pid}`;
  try {
    fs.renameSync(lockPath, moved);
  } catch {
    return;
  }
  fs.rmSync(moved, { force: true });
}

/** { taken: true } or { taken: false, holderPid }. */
export function takeLock({ lockPath, pid = process.pid, note = '' }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      createLockFile(lockPath, pid, note);
      return { taken: true };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const holderPid = readLockPid(lockPath);
    if (pidIsAlive(holderPid)) return { taken: false, holderPid };
    if (holderPid === null && isBeingWritten(lockPath)) return { taken: false, holderPid: null };
    clearDeadLock(lockPath);
  }
  return { taken: false, holderPid: readLockPid(lockPath) };
}

/** Removes the lock, only when `pid` holds it. */
export function releaseLock({ lockPath, pid = process.pid }) {
  if (readLockPid(lockPath) === pid) fs.rmSync(lockPath, { force: true });
}

function pause(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/** Who holds the lock, in words. A lock with no process id yet is a run still writing it. */
function holderWords(holderPid) {
  return holderPid === null ? 'a run that is still writing it' : `process ${holderPid}`;
}

/** Takes the lock, waiting up to `waitSeconds`. Past that it refuses, and nothing has started. */
export async function waitForLock({ lockPath, waitSeconds, note, print = console.log, pollMs = LOCK_POLL_MS }) {
  const deadline = Date.now() + waitSeconds * MS_PER_SECOND;
  let result = takeLock({ lockPath, note });
  if (result.taken) return;
  print(`Waiting up to ${waitSeconds} s for ${holderWords(result.holderPid)}, which holds the sweep lock.`);
  while (Date.now() < deadline) {
    await pause(pollMs);
    result = takeLock({ lockPath, note });
    if (result.taken) return;
  }
  const holder = holderWords(result.holderPid);
  const refusal = `${holder[0].toUpperCase()}${holder.slice(1)} holds the sweep lock (${lockPath}). Nothing was compared. ` +
    'Run it again when that run ends, or wait longer with -- --lock-wait <seconds>.';
  throw new ScriptError(refusal, EXIT.REFUSED);
}
