/**
 * scripts/__tests__/flows.mjs: what the pull and push suites add to fixture.mjs. The repositories stay
 * real and come from the fixture. This file runs the scripts with an answer on stdin, stands in for
 * test:shared, and reads the facts the tests compare.
 *
 *     const tests = stubTests(fixture);                 green, counts its runs: tests.runs()
 *     const red = stubTests(fixture, { exitCode: 1 });
 *     pushIn(fixture, site, tests);                     shared:push --yes, with those tests
 *     pushIn(fixture, site, tests, ['-m', 'Subject']);
 *     pullIn(fixture, site);
 *     const before = snapshot(fixture, site);           compare with assert.deepEqual afterwards
 *     remount(fixture, site);                           git rm -r shared, then a fresh add
 *     revertTheAdd(fixture, site);                      a revert of the add, then a revert of that
 *
 * HOW TO CHANGE IT
 *   Another fact a test compares: a field in snapshot. The stand-in's code is in stubTests.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState } from '../lib/state.mjs';
import { TEST_SCRIPT_ENV } from '../lib/testGate.mjs';

const SCRIPTS_FOLDER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** Runs a script of this folder in a site: { status, stdout, stderr, output }. */
export function runIn(fixture, name, site, args = [], { env = {}, input } = {}) {
  const script = path.join(SCRIPTS_FOLDER, name);
  const options = { cwd: site, env: { ...fixture.env, ...env }, input, encoding: 'utf8' };
  const result = spawnSync(process.execPath, [script, ...args], options);
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

/** Writes a stand-in for test:shared: it notes each run and exits with `exitCode`. */
export function stubTests(fixture, { exitCode = 0, code = '' } = {}) {
  const name = `stub-tests-${fs.readdirSync(fixture.base).length}`;
  const log = path.join(fixture.base, `${name}.runs`);
  const script = path.join(fixture.base, `${name}.mjs`);
  fs.writeFileSync(log, '');
  fs.writeFileSync(script, [
    "import { execFileSync } from 'node:child_process';",
    "import fs from 'node:fs';",
    `fs.appendFileSync(${JSON.stringify(log)}, 'ran\\n');`,
    code,
    `process.exit(${exitCode});`,
    '',
  ].join('\n'));
  const runs = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length;
  return { env: { [TEST_SCRIPT_ENV]: script }, runs };
}

/** shared:push with those tests. `--yes` unless the test gives its own arguments with `plain`. */
export function pushIn(fixture, site, tests, args = [], { plain = false, input, env = {} } = {}) {
  const words = plain ? args : ['--yes', ...args];
  return runIn(fixture, 'push.mjs', site, words, { env: { ...tests.env, ...env }, input });
}

/** shared:pull. */
export function pullIn(fixture, site, args = [], options = {}) {
  return runIn(fixture, 'pull.mjs', site, args, options);
}

/** Runs a git command that may fail, and gives its exit code. */
export function gitExit(fixture, args, cwd) {
  return spawnSync('git', args, { cwd, env: fixture.env, encoding: 'utf8' }).status;
}

/** The commit HEAD names, in a site. */
export function head(fixture, site) {
  return fixture.git(['rev-parse', 'HEAD'], site);
}

/** The hub's tip. */
export function hubTip(fixture) {
  return fixture.git(['rev-parse', 'main'], fixture.hub);
}

/** The hub's subjects, newest first. */
export function hubSubjects(fixture) {
  return fixture.git(['log', '--format=%s', 'main'], fixture.hub).split('\n');
}

/** The site's state, as last fetched. */
export function stateOf(fixture, site) {
  return readState(site, { fetch: false, env: fixture.env }).state;
}

/** The site's shared/ tree. */
export function sharedTree(fixture, site) {
  return fixture.git(['rev-parse', 'HEAD:shared'], site);
}

/** The hub's tree at its tip. */
export function hubTree(fixture) {
  return fixture.git(['rev-parse', 'main^{tree}'], fixture.hub);
}

/** Everything a stopped script must leave alone. */
export function snapshot(fixture, site) {
  return {
    head: head(fixture, site),
    changes: fixture.git(['status', '--porcelain'], site),
    hub: hubTip(fixture),
  };
}

/** Asserts an exit code, showing the whole output when it differs. */
export function assertExit(result, code) {
  assert.equal(result.status, code, result.output);
}

/** Takes shared/ out in a commit of its own, then adds it back. The commit in between holds no shared/. */
export function remount(fixture, site, subject = 'Take the mount out') {
  fixture.git(['rm', '-r', '-q', 'shared'], site);
  fixture.git(['commit', '-q', '-m', subject], site);
  fixture.git(['subtree', 'add', '--prefix', 'shared', 'shared', 'main', '--squash'], site);
}

/** Reverts the add, then that revert, so shared/ is back and a commit without it stays in the history. */
export function revertTheAdd(fixture, site) {
  const adds = fixture.git(['log', '--format=%H', '--grep=^Merge commit .* as .shared.$'], site).split('\n');
  fixture.git(['revert', '-m', '1', '--no-edit', adds.at(-1)], site);
  fixture.git(['revert', '--no-edit', 'HEAD'], site);
}

/** Moves the hub back to an older commit, as a rewrite that drops the newer ones does. */
export function rewindHub(fixture, sha) {
  fixture.git(['reset', '-q', '--hard', sha], fixture.hubWork);
  fixture.git(['push', '-q', '--force', 'origin', 'main'], fixture.hubWork);
}

/** Writes an executable hook into the bare hub. */
export function hubHook(fixture, name, body) {
  const file = path.join(fixture.hub, 'hooks', name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return () => fs.rmSync(file);
}

/** Gives a site an origin and pushes its master there, so its commits sit on a remote. */
export function pushToOrigin(fixture, site) {
  const origin = `${site}-origin.git`;
  fixture.git(['init', '-q', '--bare', origin], fixture.base);
  fixture.git(['remote', 'add', 'origin', origin], site);
  fixture.git(['push', '-q', 'origin', 'master'], site);
}
