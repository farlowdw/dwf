/**
 * scripts/lib/listeners.mjs: one preflight for pull, bump and all. A dev server started from a
 * checkout keeps serving and writing while git changes the files under it, so those scripts refuse
 * while a process that listens on a TCP port has this checkout as its working folder.
 *
 * A desktop app is not a server. An app's own process, one whose program sits in a macOS app bundle
 * (`<name>.app/Contents/MacOS/`), may keep the folder it was opened in as its working folder and listen
 * on a 127.0.0.1 port of its own, so to lsof it looks like a server, but it serves no page. Such a
 * process is named through `warn`, and the script goes on. A server that an app starts, `npm start` say,
 * runs a program of its own outside any bundle, node, so it still stops the script.
 *
 * This file only reads, with `lsof`. It never stops a process: stopping one is a person's call.
 * A machine without `lsof`, or an `lsof` that times out, gives `checked: false`, and the caller says so.
 *
 * HOW TO CHANGE IT
 *   LSOF_COMMANDS are tried in order. LSOF_TIMEOUT_MS bounds each call.
 *   What counts as an app's own program: APP_PROGRAM.
 *   `spawner` is there so a test can hand in lsof's output.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EXIT, ScriptError } from './exitCodes.mjs';

const LSOF_COMMANDS = ['lsof', '/usr/sbin/lsof'];
const LSOF_TIMEOUT_MS = 10_000;

/** An app's own program: a file in the Contents/MacOS folder of a macOS app bundle. */
const APP_PROGRAM = /\.app\/Contents\/MacOS\/[^/]+$/;

/** Every process with a listening TCP socket: pid and command name. */
const LISTENING_ARGS = ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpc'];

/** The same processes' working folders. */
function workingFolderArgs(pids) {
  return ['-a', '-d', 'cwd', '-p', pids.join(','), '-Fpcn'];
}

/** The same processes' program files: lsof names a process's program first among its txt files. */
function programArgs(pids) {
  return ['-a', '-d', 'txt', '-p', pids.join(','), '-Fpn'];
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

/** lsof's txt output as a Map from pid to program: the first name after each `p` line. */
export function programsOf(text) {
  const programs = new Map();
  let pid = null;
  for (const line of text.split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1));
    else if (line[0] === 'n' && pid !== null && !programs.has(pid)) programs.set(pid, line.slice(1));
  }
  return programs;
}

/** True when `folder` is `root` or sits inside it. */
function isInside(folder, root) {
  return folder === root || folder.startsWith(root + path.sep);
}

/**
 * { checked, processes, apps }: the listening processes running from this checkout, the servers in
 * `processes` and the apps' own processes in `apps`. A process whose program lsof does not name counts
 * as a server.
 */
export function listenersInCheckout(root, { spawner = spawnSync } = {}) {
  const listening = runLsof(LISTENING_ARGS, spawner);
  if (listening === null) return { checked: false, processes: [], apps: [] };
  const pids = parseFields(listening).map((row) => row.pid);
  if (pids.length === 0) return { checked: true, processes: [], apps: [] };
  const folders = runLsof(workingFolderArgs(pids), spawner);
  if (folders === null) return { checked: false, processes: [], apps: [] };
  const realRoot = fs.realpathSync(root);
  const here = parseFields(folders)
    .filter((row) => isInside(row.name, realRoot))
    .map(({ pid, command }) => ({ pid, command }));
  if (here.length === 0) return { checked: true, processes: [], apps: [] };
  const programs = programsOf(runLsof(programArgs(here.map((row) => row.pid)), spawner) ?? '');
  const isApp = (row) => APP_PROGRAM.test(programs.get(row.pid) ?? '');
  return { checked: true, processes: here.filter((row) => !isApp(row)), apps: here.filter(isApp) };
}

/** One line per process, for a message. */
export function describeListeners(processes) {
  return processes.map(({ pid, command }) => `  pid ${pid} ${command}`).join('\n');
}

/** "an app listens" or "2 apps listen". */
function appsListen(count) {
  return count === 1 ? 'an app listens' : `${count} apps listen`;
}

/**
 * Throws a refusal when a server listens from this checkout. `warn` gets one line when the check could
 * not run, and a message naming them when only apps listen here: both times the script goes on, and for
 * the first the caller's own message has said what was skipped.
 */
export function refuseWhenListening(root, { script, spawner, warn = console.warn } = {}) {
  const { checked, processes, apps } = listenersInCheckout(root, { spawner });
  if (!checked) warn('Could not ask lsof which servers run from this checkout. Stop any dev server here first.');
  if (processes.length === 0) {
    if (apps.length > 0) {
      warn(`${script} goes on: ${appsListen(apps.length)} from this checkout, and an app serves no page.\n` +
        describeListeners(apps));
    }
    return;
  }
  throw new ScriptError(
    `${script} refused: a server is running from this checkout.\n${describeListeners(processes)}\n` +
      'Stop it, then run this again. Nothing was changed, and this check stops no process.',
    EXIT.REFUSED,
  );
}
