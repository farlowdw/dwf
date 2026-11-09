/**
 * bumpRun.test.mjs: one step of shared:bump, on real processes. A step's log, its exit code, and above all
 * that a hung step ends at its timeout and takes every process it started with it.
 *
 * HOW TO CHANGE IT
 *   A new way a step can end: a test here. GRACE_MS is short so the suite stays fast.
 * Run with `npm run test:shared -- --scripts`, or `node --test "scripts/__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { lastLines, runLogged } from '../lib/bumpRun.mjs';
import { isRunning, waitFor } from './bumpFixture.mjs';
import { hangCode, stopProcess } from './fixture.mjs';

const GRACE_MS = 100;
const SHORT_TIMEOUT_SECONDS = 0.2;

/** A folder for one test, removed when it ends. */
function folderFor(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-run-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

/** runLogged on a piece of JavaScript. */
function runCode(folder, code, options = {}) {
  const logFile = path.join(folder, 'logs', 'step.log');
  const args = ['-e', code];
  return { logFile, run: runLogged({ command: process.execPath, args, cwd: folder, env: process.env, logFile, graceMs: GRACE_MS, ...options }) };
}

/** Code that starts a child, notes its pid in pid.txt, and then hangs until the fixture's limit. */
function hangingCode({ ignoreTerm }) {
  const ignore = "process.on('SIGTERM', () => {});";
  const childCode = `${ignoreTerm ? ignore : ''}${hangCode()}`;
  return `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}], { stdio: 'ignore' });
    require('node:fs').writeFileSync('pid.txt', String(child.pid));
    ${ignoreTerm ? ignore : ''}
    ${hangCode()}
  `;
}

const readPid = (folder) => Number(fs.readFileSync(path.join(folder, 'pid.txt'), 'utf8'));

test('a step that ends gives its exit code, and its output is in the log', async (t) => {
  const folder = folderFor(t);
  const { logFile, run } = runCode(folder, "console.log('to out'); console.error('to err'); process.exit(7);");
  const result = await run;
  assert.deepEqual(result, { code: 7, timedOut: false, stopped: null, error: null });
  assert.equal(fs.readFileSync(logFile, 'utf8'), 'to out\nto err\n');
});

test('nothing of a step reaches this script\'s own output', async (t) => {
  const folder = folderFor(t);
  const script = path.join(folder, 'outer.mjs');
  const library = new URL('../lib/bumpRun.mjs', import.meta.url).href;
  fs.writeFileSync(script, `
    import { runLogged } from ${JSON.stringify(library)};
    await runLogged({ command: process.execPath, args: ['-e', "console.log('noisy')"], cwd: ${JSON.stringify(folder)}, env: process.env, logFile: ${JSON.stringify(path.join(folder, 'a.log'))} });
    console.log('quiet');
  `);
  const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(() => stopProcess(child));
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (text) => { output += text; });
  await new Promise((resolve) => { child.on('close', resolve); });
  assert.equal(output, 'quiet\n');
});

test('a second step adds to the log', async (t) => {
  const folder = folderFor(t);
  await runCode(folder, "console.log('one')").run;
  const { logFile, run } = runCode(folder, "console.log('two')");
  await run;
  assert.equal(fs.readFileSync(logFile, 'utf8'), 'one\ntwo\n');
});

test('a command that cannot start reads as an error, not as a pass', async (t) => {
  const folder = folderFor(t);
  const { run } = runCode(folder, '', { command: path.join(folder, 'no-such-command') });
  const result = await run;
  assert.equal(result.code, null);
  assert.equal(result.error.code, 'ENOENT');
});

test('a hung step ends at the timeout, and so does the child it started', async (t) => {
  const folder = folderFor(t);
  const began = Date.now();
  const { run } = runCode(folder, hangingCode({ ignoreTerm: false }), { timeoutSeconds: SHORT_TIMEOUT_SECONDS });
  const result = await run;
  assert.equal(result.timedOut, true);
  assert.notEqual(result.code, 0);
  assert.ok(Date.now() - began < 5000, 'it ended near the timeout');
  assert.ok(await waitFor(() => !isRunning(readPid(folder))), 'the child is gone');
});

test('a step that ignores SIGTERM ends too, with its child, after the grace period', async (t) => {
  const folder = folderFor(t);
  const { run } = runCode(folder, hangingCode({ ignoreTerm: true }), { timeoutSeconds: SHORT_TIMEOUT_SECONDS });
  const result = await run;
  assert.equal(result.timedOut, true);
  assert.ok(await waitFor(() => !isRunning(readPid(folder))), 'the child is gone');
});

test('a step that exits leaves no child behind it', async (t) => {
  const folder = folderFor(t);
  const code = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(hangCode())}], { stdio: 'ignore' });
    require('node:fs').writeFileSync('pid.txt', String(child.pid));
    process.exit(0);
  `;
  const result = await runCode(folder, code).run;
  assert.equal(result.code, 0);
  assert.ok(await waitFor(() => !isRunning(readPid(folder))), 'the child is gone');
});

test('a step within its time is left alone', async (t) => {
  const folder = folderFor(t);
  const result = await runCode(folder, 'setTimeout(() => process.exit(0), 50)', { timeoutSeconds: 30 }).run;
  assert.deepEqual(result, { code: 0, timedOut: false, stopped: null, error: null });
});

test('the last lines of a log, and none for a missing file', (t) => {
  const folder = folderFor(t);
  const file = path.join(folder, 'a.log');
  fs.writeFileSync(file, 'one\ntwo\nthree\n');
  assert.deepEqual(lastLines(file, 2), ['two', 'three']);
  assert.deepEqual(lastLines(path.join(folder, 'none.log'), 2), []);
});
