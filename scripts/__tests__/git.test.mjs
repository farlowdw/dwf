/**
 * scripts/__tests__/git.test.mjs: the git wrapper on real repositories: real exit codes, the filter
 * for git-subtree's counter, and the read option. To change the filter, change PROGRESS_LINE in
 * lib/git.mjs and add its text here.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EXIT, ScriptError } from '../lib/exitCodes.mjs';
import { git, gitLive, gitOrThrow, gitValue, stripProgress } from '../lib/git.mjs';
import { fixtureFor } from './fixture.mjs';

const UNKNOWN_COMMAND_EXIT = 1;
const FATAL_EXIT = 128;

test('stripProgress drops the redrawn counter and keeps real lines', () => {
  const text = '1/     4 (0) [0]\r2/     4 (1) [0]\r\nMerge made by the ort strategy.\n4/     4 (2) [0]\r';
  assert.equal(stripProgress(text), 'Merge made by the ort strategy.');
  assert.equal(stripProgress('12/3 is not a counter\n'), '12/3 is not a counter');
});

test('git hands back the real exit code, and never throws', (t) => {
  const fixture = fixtureFor(t);
  const options = { cwd: fixture.hubWork, env: fixture.env };
  assert.equal(git(['no-such-command'], options).status, UNKNOWN_COMMAND_EXIT);
  const failed = git(['rev-parse', '--verify', 'no-such-ref'], options);
  assert.deepEqual([failed.ok, failed.status], [false, FATAL_EXIT]);
  assert.equal(git(['rev-parse', 'HEAD'], options).ok, true);
});

test('a git that cannot start reads as status null', () => {
  const result = git(['version'], { env: { PATH: '' } });
  assert.deepEqual([result.ok, result.status], [false, null]);
  const timed = git(['version'], { env: { PATH: '' }, timeout: 5000, group: true });
  assert.deepEqual([timed.ok, timed.status], [false, null]);
});

/** True while a process runs. */
function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('a timed call that runs out stops git and what git started, so no ssh is left behind', (t) => {
  const fixture = fixtureFor(t);
  const pids = path.join(fixture.base, 'ssh.pids');
  const ssh = path.join(fixture.base, 'silent-ssh');
  fs.writeFileSync(ssh, `#!/bin/sh\necho $$ >> "${pids}"\nsleep 60 &\necho $! >> "${pids}"\nwait\n`, { mode: 0o755 });
  const env = { ...fixture.env, GIT_SSH_COMMAND: ssh };
  const result = git(['ls-remote', 'ssh://example.invalid/hub.git'], { cwd: fixture.base, env, timeout: 1500, group: true });
  const started = fs.existsSync(pids) ? fs.readFileSync(pids, 'utf8').trim().split('\n').map(Number) : [];
  const left = started.filter(isRunning);
  left.forEach((pid) => process.kill(pid, 'SIGKILL'));
  assert.deepEqual([result.ok, result.status], [false, null]);
  assert.ok(started.length >= 2, 'the stand-in for ssh never ran');
  assert.deepEqual(left, [], 'git\'s helpers outlived the call');
});

test('gitValue is the trimmed output or null; gitOrThrow names the exit code', (t) => {
  const fixture = fixtureFor(t);
  const options = { cwd: fixture.hubWork, env: fixture.env };
  assert.equal(gitValue(['symbolic-ref', '--short', 'HEAD'], options), 'main');
  assert.equal(gitValue(['rev-parse', '--verify', 'no-such-ref'], options), null);
  assert.throws(() => gitOrThrow(['rev-parse', '--verify', 'no-such-ref'], options), (error) => {
    assert.ok(error instanceof ScriptError);
    assert.equal(error.code, EXIT.GIT);
    assert.match(error.message, /exit code 128/);
    return true;
  });
});

test('read: true sets GIT_OPTIONAL_LOCKS for that call only', (t) => {
  const fixture = fixtureFor(t);
  const args = ['-c', 'alias.lockvalue=!printenv GIT_OPTIONAL_LOCKS', 'lockvalue'];
  const options = { cwd: fixture.hubWork, env: fixture.env };
  assert.equal(gitValue(args, { ...options, read: true }), '0');
  assert.equal(gitValue(args, options), null);
});

test('input reaches git on stdin', (t) => {
  const fixture = fixtureFor(t);
  const options = { cwd: fixture.hubWork, env: fixture.env, input: 'HEAD\n' };
  const sha = gitValue(['rev-parse', 'HEAD'], { cwd: fixture.hubWork, env: fixture.env });
  assert.equal(gitValue(['cat-file', '--batch-check=%(objectname)'], options), sha);
});

test('gitLive filters a real subtree split and reports its exit code', async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/README.md': 'Edited.\n' }, 'Edit');
  const seen = [];
  const args = ['subtree', 'split', '--prefix', 'shared', 'HEAD'];
  const passed = await gitLive(args, { cwd: site, env: fixture.env, onLine: (line) => seen.push(line) });
  assert.equal(passed.status, 0);
  assert.deepEqual(seen, passed.lines);
  assert.equal(seen.some((line) => /^\d+\//.test(line)), false);
  assert.match(seen.at(-1), /^[0-9a-f]{40}$/);
  const rejected = await gitLive(['subtree', 'split', '--prefix', 'nothing-here'], { cwd: site, env: fixture.env, onLine: () => {} });
  assert.equal(rejected.ok, false);
  assert.notEqual(rejected.status, 0);
});
