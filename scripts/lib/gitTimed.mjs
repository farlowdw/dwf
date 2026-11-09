#!/usr/bin/env node
/**
 * scripts/lib/gitTimed.mjs: runs one git command that may wait on the network, and at its time limit
 * stops git together with everything git started. A limit on git alone leaves its ssh running after the
 * script has ended, with the connection still open. lib/git.mjs starts this file for a call made with
 * `group: true`; nothing else should.
 *
 *     node gitTimed.mjs <limit in ms> <git arguments...>
 *
 * It runs git in its own place in the terminal's process group, not in a group of its own, so an ssh that
 * asks for a passphrase can still reach the terminal. At the limit it asks every process below git to stop,
 * deepest first, then git, insists after KILL_GRACE_MS, and exits TIMED_OUT. Otherwise it exits with git's
 * own code. Output passes straight through.
 *
 * HOW TO CHANGE IT
 *   TIMED_OUT and NOT_STARTED are the codes lib/git.mjs reads as no answer. KILL_GRACE_MS is how long a process
 *   has to stop before it is killed. The process table is read with PROCESS_LIST.
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The code for a run that ran out of time, as timeout(1) gives it. git itself never exits with it. */
export const TIMED_OUT = 124;

/** The code for a git that could not start, as a shell gives it. */
export const NOT_STARTED = 127;

const KILL_GRACE_MS = 2_000;
const POLL_MS = 50;

/** Every process with its parent: `ps` on macOS and Linux alike. */
const PROCESS_LIST = ['ps', ['-A', '-o', 'pid=,ppid=']];

/** A map from a process id to the ids of its children. */
function childrenByParent() {
  const [command, args] = PROCESS_LIST;
  const children = new Map();
  let listing = '';
  try {
    listing = execFileSync(command, args, { encoding: 'utf8' });
  } catch {
    return children;
  }
  for (const line of listing.split('\n')) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(pid) || !Number.isInteger(parent)) continue;
    children.set(parent, [...(children.get(parent) ?? []), pid]);
  }
  return children;
}

/** `pid` and every process below it, the deepest first. */
function treeOf(pid) {
  const children = childrenByParent();
  const order = [];
  const visit = (id) => {
    (children.get(id) ?? []).forEach(visit);
    order.push(id);
  };
  visit(pid);
  return order;
}

/** Sends a signal, and says nothing about a process already gone. */
function signal(pid, name) {
  try {
    process.kill(pid, name);
    return true;
  } catch {
    return false;
  }
}

/** Stops a whole tree: a polite signal, then a kill for whatever is still there after the grace. */
async function stopTree(pid) {
  const tree = treeOf(pid);
  tree.forEach((id) => signal(id, 'SIGTERM'));
  const deadline = Date.now() + KILL_GRACE_MS;
  while (Date.now() < deadline && tree.some((id) => signal(id, 0))) {
    await new Promise((resolve) => { setTimeout(resolve, POLL_MS); });
  }
  tree.forEach((id) => signal(id, 'SIGKILL'));
}

/** Runs git under the limit and exits with its code, or TIMED_OUT. */
function main() {
  const [limitText, ...args] = process.argv.slice(2);
  const child = spawn('git', args, { stdio: 'inherit' });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    stopTree(child.pid);
  }, Number(limitText));
  child.on('error', () => process.exit(NOT_STARTED));
  child.on('exit', (code) => {
    clearTimeout(timer);
    process.exitCode = timedOut ? TIMED_OUT : (code ?? 1);
  });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
