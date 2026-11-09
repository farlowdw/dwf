/**
 * scripts/__tests__/strays.test.mjs: tests leave nothing running. Two servers from these suites once ran
 * for 7 hours, because a runner that dies runs no `after` hook. fixture.mjs gives a test's process three
 * ends, and each has a test here: its test's `after`, on a failure too; a closed stdin, when the test
 * process is killed outright; and a time limit, for a hung stand-in with nothing to read.
 *
 * The last test runs the real server tests in a child runner, then asks `ps` for what is left. Each server
 * carries that run's own mark on its command line, so runs side by side never read each other's.
 *
 * HOW TO CHANGE IT
 *   SERVER_TESTS and SERVER_TEST_NAMES say what the suite run covers: a new test that starts a server
 *   joins them through startServer in fixture.mjs. A file that may name a raw server or a raw hang goes in
 *   RAW_ALLOWED. Run with `npm run test:shared -- --scripts`, or `node --test "scripts/__tests__/*.test.mjs"`
 *   in the hub.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { isRunning, waitFor } from './bumpFixture.mjs';
import { RUN_MARK_ENV, SERVER_MARK, hangCode } from './fixture.mjs';

const TESTS_FOLDER = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_URL = new URL('./fixture.mjs', import.meta.url).href;

const SERVER_TESTS = ['listeners.test.mjs', 'pull.test.mjs', 'status.test.mjs', 'bump.test.mjs', 'all.test.mjs'];
const SERVER_TEST_NAMES = 'server|refusal names the process|symlink';

/** The fixture starts servers and hangs, this file writes them on purpose. */
const RAW_ALLOWED = new Set(['fixture.mjs', 'strays.test.mjs']);
const RAW_SERVER = /require\('node:http'\)/;
const RAW_HANG = /setInterval\(\(\) => \{\}/;

const WAIT_MS = 5000;
const SHORT_LIMIT_MS = 100;

/** The process's variables without the marker of the runner this test sits in. */
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** A folder for one test, removed when it ends. */
function folderFor(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-strays-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

/** The running processes whose command line holds `mark`, as process ids. */
function processesMarked(mark) {
  const { stdout } = spawnSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return stdout.split('\n').filter((line) => line.includes(mark)).map((line) => Number.parseInt(line, 10));
}

test('a server stops with its test, when that test fails too', async (t) => {
  const folder = folderFor(t);
  const pidFile = path.join(folder, 'pid.txt');
  const verdict = path.join(folder, 'verdict.txt');
  const file = path.join(folder, 'fails.test.mjs');
  fs.writeFileSync(file, `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import test from 'node:test';
    import { startServer } from ${JSON.stringify(FIXTURE_URL)};
    let pid;
    test('starts a server and fails', async (t) => {
      pid = (await startServer(t, ${JSON.stringify(folder)})).pid;
      fs.writeFileSync(${JSON.stringify(pidFile)}, String(pid));
      assert.fail('on purpose');
    });
    test('runs in the same process, after that one', () => {
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch {
        alive = false;
      }
      fs.writeFileSync(${JSON.stringify(verdict)}, alive ? 'alive' : 'gone');
    });
  `);
  const run = spawnSync(process.execPath, ['--test', file], { env: childEnv(), encoding: 'utf8' });
  assert.notEqual(run.status, 0, 'the inner test failed, as it should');
  assert.equal(fs.readFileSync(verdict, 'utf8'), 'gone');
  assert.equal(isRunning(Number(fs.readFileSync(pidFile, 'utf8'))), false);
});

test('a server stops when its test process is killed outright, with no hook run', async (t) => {
  const folder = folderFor(t);
  const pidFile = path.join(folder, 'pid.txt');
  const file = path.join(folder, 'killed.mjs');
  fs.writeFileSync(file, `
    import fs from 'node:fs';
    import { startServer } from ${JSON.stringify(FIXTURE_URL)};
    const server = await startServer({ after: () => {} }, ${JSON.stringify(folder)});
    fs.writeFileSync(${JSON.stringify(pidFile)}, String(server.pid));
    process.kill(process.pid, 'SIGKILL');
  `);
  const run = spawnSync(process.execPath, [file], { env: childEnv(), encoding: 'utf8' });
  assert.equal(run.signal, 'SIGKILL');
  const pid = Number(fs.readFileSync(pidFile, 'utf8'));
  t.after(() => {
    if (isRunning(pid)) process.kill(pid, 'SIGKILL');
  });
  assert.ok(await waitFor(() => !isRunning(pid), WAIT_MS), `server ${pid} outlived its test process`);
});

test('a hung stand-in ends by itself at its limit', () => {
  const run = spawnSync(process.execPath, ['-e', hangCode(SHORT_LIMIT_MS)], { timeout: WAIT_MS, encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(run.signal, null);
});

test('no test starts a server or a hang of its own: they all come from the fixture, with their limits', () => {
  const files = fs.readdirSync(TESTS_FOLDER).filter((name) => name.endsWith('.mjs') && !RAW_ALLOWED.has(name));
  const raw = files.filter((name) => {
    const text = fs.readFileSync(path.join(TESTS_FOLDER, name), 'utf8');
    return RAW_SERVER.test(text) || RAW_HANG.test(text);
  });
  assert.deepEqual(raw, []);
});

test('a run of the suites that start servers leaves no process behind', (t) => {
  const mark = `${SERVER_MARK}-${crypto.randomUUID()}`;
  t.after(() => {
    for (const pid of processesMarked(mark)) process.kill(pid, 'SIGKILL');
  });
  const files = SERVER_TESTS.map((name) => path.join(TESTS_FOLDER, name));
  const args = ['--test', `--test-name-pattern=${SERVER_TEST_NAMES}`, ...files];
  const run = spawnSync(process.execPath, args, { env: childEnv({ [RUN_MARK_ENV]: mark }), encoding: 'utf8' });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.match(output, /a server running from the checkout refuses, and is left running/);
  assert.match(output, /a server started in the checkout is found/);
  assert.deepEqual(processesMarked(mark), []);
});
