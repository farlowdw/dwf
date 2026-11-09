/**
 * scripts/lib/listeners.mjs: one preflight for pull, bump and all. A dev server started from a
 * checkout keeps serving and writing while git changes the files under it, so those scripts refuse
 * while a process that listens on a TCP port has this checkout as its working folder.
 *
 * This file only reads, with `lsof`. It never stops a process: stopping one is a person's call.
 * A machine without `lsof`, or an `lsof` that times out, gives `checked: false`, and the caller says so.
 *
 * HOW TO CHANGE IT
 *   LSOF_COMMANDS are tried in order. LSOF_TIMEOUT_MS bounds each call.
 *   `spawner` is there so a test can hand in lsof's output.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EXIT, ScriptError } from './exitCodes.mjs';

const LSOF_COMMANDS = ['lsof', '/usr/sbin/lsof'];
const LSOF_TIMEOUT_MS = 10_000;

/** Every process with a listening TCP socket: pid and command name. */
const LISTENING_ARGS = ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpc'];

/** The same processes' working folders. */
function workingFolderArgs(pids) {
  return ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fpcn'];
}

/** lsof's result, or null when no lsof ran. It exits 1 when it finds nothing: that is an answer. */
function runLsof(args, spawner) {
  for (const command of LSOF_COMMANDS) {
    const result = spawner(command, args, { encoding: 'utf8', timeout: LSOF_TIMEOUT_MS });
    if (!result.error) return result.stdout ?? '';
  }
  return null;
}

/** lsof's field output as [{ pid, command, name }]: a `p` line starts each process. */
export function parseFields(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const value = line.slice(1);
    if (line[0] === 'p') rows.push({ pid: Number(value), command: '', name: '' });
    const row = rows.at(-1);
    if (row && line[0] === 'c') row.command = value;
    if (row && line[0] === 'n') row.name = value;
  }
  return rows;
}

/** True when `folder` is `root` or sits inside it. */
function isInside(folder, root) {
  return folder === root || folder.startsWith(root + path.sep);
}

/** { checked, processes }: the listening processes running from this checkout. */
export function listenersInCheckout(root, { spawner = spawnSync } = {}) {
  const listening = runLsof(LISTENING_ARGS, spawner);
  if (listening === null) return { checked: false, processes: [] };
  const pids = parseFields(listening).map((row) => row.pid);
  if (pids.length === 0) return { checked: true, processes: [] };
  const folders = runLsof(workingFolderArgs(pids), spawner);
  if (folders === null) return { checked: false, processes: [] };
  const realRoot = fs.realpathSync(root);
  const here = parseFields(folders).filter((row) => isInside(row.name, realRoot));
  return { checked: true, processes: here.map(({ pid, command }) => ({ pid, command })) };
}

/** One line per process, for a message. */
export function describeListeners(processes) {
  return processes.map(({ pid, command }) => `  pid ${pid} ${command}`).join('\n');
}

/**
 * Throws a refusal when a process listens from this checkout. `warn` gets one line when the check
 * could not run: the script goes on, and the caller's own message has said what was skipped.
 */
export function refuseWhenListening(root, { script, spawner, warn = console.warn } = {}) {
  const { checked, processes } = listenersInCheckout(root, { spawner });
  if (!checked) warn('Could not ask lsof which servers run from this checkout. Stop any dev server here first.');
  if (processes.length === 0) return;
  throw new ScriptError(
    `${script} refused: a server is running from this checkout.\n${describeListeners(processes)}\n` +
      'Stop it, then run this again. Nothing was changed, and this check stops no process.',
    EXIT.REFUSED,
  );
}
