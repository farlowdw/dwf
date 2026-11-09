/**
 * scripts/__tests__/compareLock.test.mjs: the sweep lock, on real files and real processes. The file's
 * format is a contract with any other tool that shares it, so the first test spells it out.
 *
 * HOW TO CHANGE IT
 *   A change to the lock's format breaks whoever shares it: change them together.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pidIsAlive, readLockPid, releaseLock, takeLock, waitForLock } from '../lib/compareLock.mjs';
import { EMPTY_LOCK_GRACE_MS } from '../lib/compareSettings.mjs';
import { EXIT } from '../lib/exitCodes.mjs';

/** A lock path in a folder of its own, gone after the test. */
function lockIn(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-lock-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return path.join(folder, 'nested', 'sweep');
}

/** The id of a process that has already ended. */
async function deadPid() {
  const child = spawn(process.execPath, ['-e', '']);
  await new Promise((resolve) => { child.once('exit', resolve); });
  return child.pid;
}

test('the lock is a file: the process id on the first line, free text after it', (t) => {
  const lockPath = lockIn(t);
  assert.deepEqual(takeLock({ lockPath, note: 'shared:compare one' }), { taken: true });
  assert.equal(fs.readFileSync(lockPath, 'utf8'), `${process.pid}\nshared:compare one\n`);
});

test('a live holder keeps the lock, and a second taker is told who holds it', (t) => {
  const lockPath = lockIn(t);
  takeLock({ lockPath });
  assert.deepEqual(takeLock({ lockPath, pid: process.pid + 1 }), { taken: false, holderPid: process.pid });
});

test('a dead holder\'s lock is cleared and taken', async (t) => {
  const lockPath = lockIn(t);
  const pid = await deadPid();
  assert.equal(pidIsAlive(pid), false);
  takeLock({ lockPath, pid });
  assert.deepEqual(takeLock({ lockPath }), { taken: true });
  assert.equal(readLockPid(lockPath), process.pid);
});

/** A lock file that holds `text`, written `ageMs` ago. */
function lockFileWith(t, text, ageMs) {
  const lockPath = lockIn(t);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, text);
  const when = new Date(Date.now() - ageMs);
  fs.utimesSync(lockPath, when, when);
  return lockPath;
}

test('a lock with no process id reads as null, never as 0', (t) => {
  for (const text of ['', '\n', '0\n', 'abc\n', '-4\n']) assert.equal(readLockPid(lockFileWith(t, text, 0)), null, JSON.stringify(text));
  assert.equal(readLockPid(lockFileWith(t, '123\nnote\n', 0)), 123);
});

test('an empty lock file just made is a run still writing it, so it is left alone', (t) => {
  const lockPath = lockFileWith(t, '', 0);
  assert.deepEqual(takeLock({ lockPath }), { taken: false, holderPid: null });
  assert.equal(fs.existsSync(lockPath), true);
});

test('an empty lock file past the grace is cleared and taken', (t) => {
  const lockPath = lockFileWith(t, '', EMPTY_LOCK_GRACE_MS + 1000);
  assert.deepEqual(takeLock({ lockPath }), { taken: true });
  assert.equal(readLockPid(lockPath), process.pid);
});

test('a refusal over a lock still being written names no process', async (t) => {
  const lockPath = lockFileWith(t, '', 0);
  const printed = [];
  const refused = (error) => error.code === EXIT.REFUSED && error.message.startsWith('A run that is still writing it holds');
  await assert.rejects(waitForLock({ lockPath, waitSeconds: 0, note: '', print: (line) => printed.push(line), pollMs: 1 }), refused);
  assert.match(printed[0], /for a run that is still writing it/);
});

test('only the holder can release', (t) => {
  const lockPath = lockIn(t);
  takeLock({ lockPath });
  releaseLock({ lockPath, pid: process.pid + 1 });
  assert.equal(fs.existsSync(lockPath), true);
  releaseLock({ lockPath });
  assert.equal(fs.existsSync(lockPath), false);
});

test('a run waits for the lock, and takes it when it comes free', async (t) => {
  const lockPath = lockIn(t);
  const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']);
  t.after(() => holder.kill('SIGKILL'));
  takeLock({ lockPath, pid: holder.pid });
  const printed = [];
  setTimeout(() => holder.kill('SIGKILL'), 150);
  await waitForLock({ lockPath, waitSeconds: 10, note: '', print: (line) => printed.push(line), pollMs: 20 });
  assert.equal(readLockPid(lockPath), process.pid);
  assert.match(printed[0], new RegExp(`process ${holder.pid}`));
});

test('past the wait a run refuses, says who holds it and starts nothing', async (t) => {
  const lockPath = lockIn(t);
  takeLock({ lockPath });
  const refused = (error) => error.code === EXIT.REFUSED && error.message.includes(`Process ${process.pid} holds`);
  await assert.rejects(waitForLock({ lockPath, waitSeconds: 0, note: '', print: () => {}, pollMs: 1 }), refused);
});
