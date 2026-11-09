/**
 * scripts/lib/bumpRun.mjs: runs one long step of `shared:bump` or `shared:all`: npm, a build, a suite, the
 * compare, or a whole script in another site. Its output goes to a log file, so the caller's own lines stay
 * readable, or to the caller's own streams when the step's lines are worth reading as they come.
 *
 * Each step is started as its own process group, and a step that ends takes its group with it. A
 * timeout on the child alone is not enough: `npm run` starts node, node starts a test file, and a hung
 * test file outlives npm. A hung step reads as `timedOut`, a signal to this script as `stopped`, and
 * nothing is left running either way.
 *
 * HOW TO CHANGE IT
 *   The timeouts are in bumpSettings.mjs, and the signals with their exit codes in exitCodes.mjs. This
 *   file knows nothing about a bump.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { KILL_GRACE_MS } from './bumpSettings.mjs';
import { STOP_SIGNALS } from './exitCodes.mjs';
import { MS_PER_SECOND } from './settings.mjs';

/** Signals a whole process group. A group already gone answers with an error, which is the wish. */
function signalGroup(pid, signal) {
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // Gone, or only zombies left in it.
  }
}

/** Asks a group to stop, and insists after the grace period. Returns the timer. */
function stopGroup(pid, graceMs) {
  signalGroup(pid, 'SIGTERM');
  return setTimeout(() => signalGroup(pid, 'SIGKILL'), graceMs);
}

/** Calls `onSignal(name)` on each stop signal until the returned function is called. */
function listenForStop(onSignal) {
  const handlers = Object.keys(STOP_SIGNALS).map((signal) => {
    const handler = () => onSignal(signal);
    process.once(signal, handler);
    return [signal, handler];
  });
  return () => handlers.forEach(([signal, handler]) => process.off(signal, handler));
}

/**
 * Runs a command in its own process group, to its end, and resolves with { code, timedOut, stopped, error }.
 * `code` is null when it did not exit by itself. `timeoutSeconds` null means no limit. It never rejects.
 */
export function runGroup({ command, args, cwd, env, stdio, timeoutSeconds = null, graceMs = KILL_GRACE_MS }) {
  const child = spawn(command, args, { cwd, env, detached: true, stdio });
  return new Promise((resolve) => {
    const timers = [];
    let timedOut = false;
    let stopped = null;
    let finished = false;
    const stopListening = listenForStop((signal) => {
      stopped = signal;
      timers.push(stopGroup(child.pid, graceMs));
    });
    const finish = (code, error = null) => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      stopListening();
      signalGroup(child.pid, 'SIGKILL');
      resolve({ code, timedOut, stopped, error });
    };
    if (timeoutSeconds !== null) {
      timers.push(setTimeout(() => {
        timedOut = true;
        timers.push(stopGroup(child.pid, graceMs));
      }, timeoutSeconds * MS_PER_SECOND));
    }
    child.once('error', (error) => finish(null, error));
    child.once('exit', (code) => finish(code));
  });
}

/** runGroup with the step's output in `logFile`. */
export async function runLogged({ logFile, ...step }) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const log = fs.openSync(logFile, 'a');
  try {
    return await runGroup({ ...step, stdio: ['ignore', log, log] });
  } finally {
    fs.closeSync(log);
  }
}

/** The last `count` lines of a log, or nothing when it cannot be read. */
export function lastLines(file, count) {
  try {
    return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-count);
  } catch {
    return [];
  }
}
