/**
 * all.test.mjs: `shared:all` from end to end. Real repositories and a real bare hub, as allFixture.mjs builds
 * them, and each site runs its own copy of the real scripts. npm and the compare are stand-ins. What it holds:
 *   - The words: actions, sites, options, and what stops before anything runs.
 *   - Which sites: the hub holds no list, a remote spelled another way counts, the site you run it from goes
 *     first, --only keeps its order, and a stray clone is held back with --skip.
 *   - status: one row per site, read with no path limit, and one question to npm.
 *   - pull: every site is asked before any is touched. The first red stops the run with the recorded sha, the
 *     exact undo, the untouched sites and the ready line. A list to read stops it too. A pull of the template
 *     alone builds nothing, and the printed lines are the ones that work.
 *   - bump: one proof per site, the pin behind one question, and a rehearsal that leaves the pin alone.
 *   - A green end names the sites shared:status still fails, and the way back, and exits 0.
 *   - A red where the pin moved from: its undo, then the pin-back, walked both ways round, and status in between.
 *   - The red record: a site that went red refuses a run again until its undo, status fails there and then names the
 *     way on, a red build never stays in build/, a take-back clears the red with a word about the build, and a
 *     carry-on still prints the publish lines of the run that went red.
 *   - Nothing here pushes a site, deploys, or starts a server.
 *
 * HOW TO CHANGE IT
 *   A new refusal, a new stop or a new printed line: a test here that makes it fire. Run with
 *   `npm run test:shared -- --scripts`, or `node --test "scripts/__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArgs, rerunLine, scopeWithout } from '../lib/allArgs.mjs';
import { commitSubject } from '../lib/bumpSettings.mjs';
import { EXIT } from '../lib/exitCodes.mjs';
import { STATES, readState } from '../lib/state.mjs';
import { allSites, lineWith } from './allFixture.mjs';
import { FROM, PIN, isRunning, pageOf, waitFor } from './bumpFixture.mjs';
import { assertLine, startServer, stopProcess, writeFiles } from './fixture.mjs';
import { assertExit, hubSubjects, pushToOrigin, stateOf } from './flows.mjs';

const SCRIPTS_FOLDER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NEXT = '3.11.0';
const DEPLOY = 'git push && netlify deploy --prod --no-build';
const TEMPLATE_LINE = 'Nothing outside shared/template changed';
const FAST_TIMEOUT = ['--verify-timeout', '1'];

/**
 * The limit of a push that must reach the hub before it is stopped. The pin's push takes under 2 s on a quiet Mac
 * and up to about 7 s at a load average of 60; the hub's hook then holds it past the limit.
 */
const PUSH_LIMIT_SECONDS = 20;

/** A hub hook that holds a push until the fixture is gone, or for HOOK_HOLD_SECONDS at most, so nothing outlives the test. */
const HOOK_HOLD_SECONDS = 600;
const holdingHook = (folder) => [
  '#!/bin/sh',
  'held=0',
  `while [ -d "${folder}" ] && [ "$held" -lt ${HOOK_HOLD_SECONDS} ]; do sleep 1; held=$((held + 1)); done`,
  '',
].join('\n');

/** The steps a site took, as the words after its name. */
const stepsOf = (context, name) => context.steps().filter((line) => line.startsWith(`${name} `)).map((line) => line.slice(name.length + 1));

const PROOF = ['run build', 'run shared:verify', 'compare'];
const BUMP_PROOF = ['install --no-audit', 'run build', 'run shared:verify', 'compare'];

/** Everything a stopped or refused run must leave as it was, in every site and on the hub. */
function everything({ sites, head, changes, hubHead }) {
  const rows = Object.entries(sites).map(([name, site]) => [name, head(site), changes(site)]);
  return { rows, hub: hubHead() };
}

/** Runs a script with an environment of the test's own. */
function runWith(script, cwd, env, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

/** A stopped run's undo line: its own, with the site's folder, not the one a bump printed for itself. */
function undoOf(result) {
  return lineWith(result.output, 'Undo: cd ').replace('Undo: ', '');
}

/** A run's Next lines. */
function nextOf(result) {
  return result.stdout.split('\n').filter((line) => line.startsWith('Next: '));
}

/** True when a status report holds a red line at any level. */
const hasRedLine = (report) => /^\S+\s+red\s/m.test(report.stdout);

/** The seed's stylesheet, as fixture.mjs writes it: a hub commit of it takes a change back. */
const SEED_STYLES = 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n';

/** A pull that goes red at two: the run, the sha two was on, and the undo it printed. */
function redPullAtTwo(t, scenario) {
  const context = allSites(t, { scenario: { sites: { two: scenario } } });
  context.hubChange();
  const recorded = context.head(context.sites.two);
  const result = context.all(context.sites.one, 'pull');
  assertExit(result, EXIT.CHECKS);
  return { context, result, recorded, undo: undoOf(result) };
}

test('the words: each action, its value and its options', () => {
  assert.equal(parseArgs(['status']).action, 'status');
  assert.equal(parseArgs(['status', '--offline']).offline, true);
  assert.equal(parseArgs(['bump']).version, undefined);
  assert.equal(parseArgs(['bump', 'v3.11.0']).version, NEXT);
  assert.equal(parseArgs(['run', 'test:shared']).script, 'test:shared');
  assert.equal(parseArgs(['run', 'verify']).words.at(-1), 'verify');
  assert.equal(parseArgs(['--help']).help, true);
  const { only, skip, keep, verifyTimeout, yes, noPin, noWordList } = parseArgs([
    'bump', '--only', 'c,a', '--skip', 'b', '--keep', 'k', '--verify-timeout', '60', '--yes', '--no-pin', '--no-word-list',
  ]);
  assert.deepEqual([only, skip, keep, verifyTimeout, yes, noPin, noWordList], [['c', 'a'], ['b'], 'k', '60', true, true, true]);
});

test('the words: what stops before anything runs', () => {
  const words = [
    [], ['nothing'], ['pull', 'extra'], ['bump', 'latest'], ['bump', '3.1.0', '3.2.0'], ['run'], ['status', 'x'],
    ['pull', '--unknown'], ['pull', '--only'], ['pull', '--only', ','], ['pull', '--skip', '--keep'], ['pull', '--keep'],
    ['pull', '--verify-timeout', 'soon'], ['pull', '--verify-timeout', '0'],
    ['pull', '--yes'], ['pull', '--no-pin'], ['status', '--keep', 'k'], ['status', '--no-word-list'], ['bump', '--offline'],
    ['run', 'x', '--yes'], ['run', 'x', '--offline'], ['run', 'start'], ['run', 'serve'],
  ];
  for (const argv of words) {
    assert.throws(() => parseArgs(argv), ({ code }) => code === EXIT.USAGE, `${argv.join(' ')} should be a usage error`);
  }
});

test('the words: --ports and --lock-wait go to a compare, and stop anywhere else', () => {
  assert.deepEqual(['pull', 'bump'].map((action) => parseArgs([action, '--ports', '4100-4109', '--lock-wait', '0'])).map(({ ports, lockWait }) => [ports, lockWait]), [
    ['4100-4109', '0'], ['4100-4109', '0'],
  ]);
  const typed = parseArgs(['pull', '--ports', '4100-4109', '--lock-wait', '60']);
  assert.equal(rerunLine(typed, { only: ['a'] }), 'npm run shared:all -- pull --ports 4100-4109 --lock-wait 60 --only a');
  const words = [
    ['status', '--ports', '4100-4109'], ['run', 'x', '--ports', '4100-4109'], ['status', '--lock-wait', '5'], ['run', 'x', '--lock-wait', '5'],
    ['pull', '--ports'], ['pull', '--ports', 'soon'], ['pull', '--ports', '4109-4100'], ['pull', '--lock-wait', 'soon'], ['bump', '--lock-wait'],
  ];
  for (const argv of words) {
    assert.throws(() => parseArgs(argv), ({ code }) => code === EXIT.USAGE, `${argv.join(' ')} should be a usage error`);
  }
});

test('the words: a --ports range that leaves one port is a usage error, because a compare serves both builds at once', () => {
  for (const action of ['pull', 'bump']) {
    assert.throws(() => parseArgs([action, '--ports', '6140-6140']), ({ code, message }) => code === EXIT.USAGE
      && message.startsWith('--ports 6140-6140 leaves 1 port, 6140, and a compare serves its two builds at once, one port each.'), action);
    assert.throws(() => parseArgs([action, '--ports', '5999-6000']), ({ code }) => code === EXIT.USAGE, 'one left beside a refused port');
    assert.equal(parseArgs([action, '--ports', '6140-6141']).ports, '6140-6141');
  }
});

test('the ready lines repeat what was typed, for the sites asked for', () => {
  const typed = parseArgs(['bump', 'v3.11.0', '--keep', 'k', '--skip', 'a', '--yes']);
  assert.equal(rerunLine(typed, { only: ['c', 'b'] }), 'npm run shared:all -- bump 3.11.0 --keep k --yes --only c,b');
  assert.equal(rerunLine(typed, scopeWithout(typed, ['b', 'c'], ['b'])), 'npm run shared:all -- bump 3.11.0 --keep k --yes --skip a,b');
  const narrow = parseArgs(['pull', '--only', 'c,b,d']);
  assert.equal(rerunLine(narrow, scopeWithout(narrow, ['c', 'b', 'd'], ['b'])), 'npm run shared:all -- pull --only c,d');
});

test('--help lists every option, with no site and no git', () => {
  const script = path.join(SCRIPTS_FOLDER, 'all.mjs');
  const child = spawn(process.execPath, [script, '--help'], { env: {}, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((resolve) => {
    let text = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { text += chunk; });
    child.on('close', (code) => {
      assert.equal(code, 0);
      for (const flag of ['--only', '--skip', '--keep', '--verify-timeout', '--ports', '--lock-wait', '--no-pin', '--yes', '--offline', '--no-word-list', '--help']) {
        assert.ok(text.includes(flag), flag);
      }
      resolve();
    });
  });
});

test('an option npm kept stops the run, with the line to type', (t) => {
  const context = allSites(t, { names: ['one'] });
  const script = path.join(context.sites.one, context.ownAll);
  const env = { ...context.env, npm_lifecycle_event: 'shared:all', npm_config_skip: 'two' };
  const result = runWith(script, context.sites.one, env, ['pull']);
  assertExit(result, EXIT.USAGE);
  assert.match(result.output, /npm kept --skip/);
});

test('sites: found from the siblings, here first, then by name', (t) => {
  const context = allSites(t);
  const result = context.all(context.sites.two, 'status');
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /Found 3 sites of this hub: two \(here\), one, zed\./);
  const rows = result.stdout.split('\n').filter((line) => /^(one|two|zed) /.test(line));
  assert.deepEqual(rows.map((row) => row.split(' ')[0]), ['two', 'one', 'zed']);
});

test('sites: a remote spelled another way is one hub, and another hub is left out', (t) => {
  const context = allSites(t);
  const { one, two, zed } = context.sites;
  context.fixture.git(['remote', 'set-url', 'shared', '../../hub.git'], two);
  context.fixture.git(['remote', 'set-url', 'shared', 'git@github.com:owner/another.git'], zed);
  const result = context.all(one, 'status', '--offline');
  assert.match(result.stdout, /Found 2 sites of this hub: one \(here\), two\./);
  assert.match(result.stdout, /zed has a shared remote for another hub, so this run leaves it out\./);
});

test('sites: warns about a mount with no remote, and survives a dangling link and a file', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  const { fixture } = context;
  fixture.addSharedLines(two);
  fixture.git(['remote', 'remove', 'shared'], two);
  fs.symlinkSync(path.join(fixture.base, 'gone'), path.join(fixture.sites, 'dangling'));
  fs.writeFileSync(path.join(fixture.sites, 'a-file.txt'), 'not a folder\n');
  const result = context.all(one, 'status', '--offline');
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /Found 2 sites of this hub: one \(here\), zed\./);
  const warning = lineWith(result.stdout, 'WARNING: two');
  assert.match(warning, /holds shared\/ and has no shared remote/);
  assert.ok(warning.includes(`cd ../two && git remote add shared ${fixture.hub}`), warning);
  assert.ok(warning.endsWith('To take two out of the hub instead: cd ../two && npm run shared:leave.'), warning);
});

test('sites: --only keeps the order given, and --skip leaves a site out', (t) => {
  const context = allSites(t);
  const { one } = context.sites;
  assertExit(context.all(one, 'run', 'shared:verify', '--only', 'zed,one'), EXIT.OK);
  assert.deepEqual(context.steps(), ['zed run shared:verify', 'one run shared:verify']);
  context.hubChange();
  const pulled = context.all(one, 'pull', '--only', 'zed,two', '--skip', 'two');
  assertExit(pulled, EXIT.OK);
  assert.deepEqual(stepsOf(context, 'two'), []);
  assert.equal(stateOf(context.fixture, context.sites.zed), STATES.IN_SYNC);
  assert.match(pulled.stdout, /Left out of this run: one, two\./);
});

test('sites: a name that is no site stops the run with the names found', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  context.hubChange();
  for (const flag of ['--only', '--skip']) {
    const result = context.all(one, 'pull', flag, 'twoo');
    assertExit(result, EXIT.USAGE);
    assert.match(result.output, /no site is called twoo\. Found: one, two, zed\./);
  }
  assert.equal(context.steps().length, 0);
  assert.equal(stateOf(context.fixture, two), STATES.IN_SYNC);
});

test('sites: every site left out stops the run', (t) => {
  const context = allSites(t, { names: ['one'] });
  assertExit(context.all(context.sites.one, 'status', '--skip', 'one'), EXIT.USAGE);
});

test('sites: a run needs a mount, and refuses a worktree', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { fixture } = context;
  const { one } = context.sites;
  const script = path.join(one, context.ownAll);
  const bare = fixture.addRepository('plain', { 'README.md': 'No mount here.\n' });
  const unmounted = runWith(script, bare, context.env, ['status']);
  assertExit(unmounted, EXIT.USAGE);
  assert.match(unmounted.output, /has no shared\/ folder/);
  const tree = path.join(fixture.base, 'a-worktree');
  fixture.git(['worktree', 'add', '-q', tree], one);
  const worktree = runWith(path.join(tree, context.ownAll), tree, context.env, ['status']);
  assertExit(worktree, EXIT.REFUSED);
  assert.match(worktree.output, /this is a worktree/);
});

test('status: one row per site, and a pulled site still reads behind', (t) => {
  const context = allSites(t);
  const { one, two, zed } = context.sites;
  context.hubChange('First change');
  context.fixture.subtreePull(one);
  context.fixture.subtreePull(two);
  context.fixture.commitToSite(two, { 'docs/two.md': 'A page.\n' }, 'Add a page');
  writeFiles(two, { 'docs/intro.md': 'Changed.\n' });
  context.hubChange('Second change');
  const before = context.head(zed);
  const result = context.all(one, 'status');
  assertExit(result, EXIT.OK);
  assert.match(lineWith(result.stdout, 'one  '), /^one\s+behind by 1 commit\s+0\s+3\.10\.2\s+\d+ ok, \d+ warnings?, 0 failed$/);
  assert.match(lineWith(result.stdout, 'two  '), /^two\s+behind by 1 commit\s+1\s+3\.10\.2/);
  assert.match(lineWith(result.stdout, 'zed  '), /^zed\s+behind by 2 commits\s+0/);
  assert.equal(context.head(zed), before);
  assert.ok(result.stdout.includes('Next: npm run shared:all -- pull\n'), result.stdout);
});

test('status: a failed line prints with its site and its fix, exits 3, and points at bump', (t) => {
  const context = allSites(t, { on: FROM, names: ['one', 'two'] });
  const result = context.all(context.sites.one, 'status', '--skip', 'two');
  assertExit(result, EXIT.CHECKS);
  assert.match(result.stdout, /^one:$/m);
  assert.match(result.stdout, /FAIL pin/);
  assert.match(lineWith(result.stdout, 'one   '), /3\.9\.2\s+\d+ ok, \d+ warnings?, [1-9]\d* failed/);
  assert.ok(result.stdout.includes('Next: npm run shared:all -- bump --skip two\n'), result.stdout);
});

test('status: one question to npm, and none with --offline, which fetches nothing either', (t) => {
  const context = allSites(t, { scenario: { newest: '3.99.0' } });
  const { one } = context.sites;
  const asked = () => context.calls().filter(({ args }) => args[0] === 'view').length;
  const result = context.all(one, 'status');
  assert.equal(asked(), 1);
  assert.match(result.stdout, /newest\s+Docusaurus 3\.99\.0 is on npm, the pin is 3\.10\.2/);
  context.hubChange();
  const offline = context.all(one, 'status', '--offline');
  assert.equal(asked(), 1);
  assert.match(lineWith(offline.stdout, 'one  '), /in sync/);
  assert.doesNotMatch(offline.stdout, /^Next: /m);
});

test('status: a site that cannot be read gets a row, and the rest stand', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  context.fixture.git(['rm', '-r', '-q', 'shared'], two);
  context.fixture.git(['commit', '-q', '-m', 'Take the mount out'], two);
  const result = context.all(one, 'status');
  assertExit(result, EXIT.CHECKS);
  assert.match(lineWith(result.stdout, 'zed  '), /in sync/);
  assert.match(lineWith(result.stdout, 'two  '), /^two\s+(unreadable|could not be read)/);
});

test('status: a site whose files break the checks gets a row, and the rest stand', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  context.fixture.commitToSite(two, { 'shared/requirements.cjs': 'module.exports = {\n' }, 'Break the table');
  const result = context.all(one, 'status');
  assertExit(result, EXIT.CHECKS);
  assert.match(lineWith(result.stdout, 'two  '), /^two\s+ahead by 1 commit\s.*\s1 failed$/);
  assert.match(result.stdout, /^two:$/m);
  assert.match(result.stdout, /^ +FAIL +packages +shared\/requirements\.cjs does not load: SyntaxError: .*fix: if a pull just brought it/m);
  assert.match(lineWith(result.stdout, 'zed  '), /in sync/);
});

test('pull: each site is pulled, built, verified and compared in order, and nothing is pushed', (t) => {
  const context = allSites(t);
  const { one, two, zed } = context.sites;
  const tip = context.hubChange();
  const originless = context.hubHead();
  const result = context.all(two, 'pull');
  assertExit(result, EXIT.OK);
  assert.deepEqual(context.steps(), ['two', 'one', 'zed'].flatMap((name) => PROOF.map((step) => `${name} ${step}`)));
  for (const site of [one, two, zed]) {
    assert.equal(stateOf(context.fixture, site), STATES.IN_SYNC);
    assert.match(context.subject(site), new RegExp(`^shared: pull ${tip.slice(0, 7)}`));
  }
  assert.equal(context.hubHead(), originless);
  assert.match(result.stdout, /Green: two, one, zed\. Nothing was pushed or deployed\./);
});

test('pull: the end prints one chained line per site, with a public check first', (t) => {
  const context = allSites(t);
  const { one, zed } = context.sites;
  context.fixture.commitToSite(zed, { 'netlify.toml': '[build]\n  command = "npm run build && node shared/scripts/check-public.mjs"\n' }, 'Check the build');
  context.pathOfFreshBuild(zed);
  context.hubChange();
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.OK);
  const lines = result.stdout.split('\n').filter((line) => line.startsWith('  cd ../'));
  assert.deepEqual(lines, [
    `  cd ../one && ${DEPLOY}`,
    `  cd ../two && ${DEPLOY}`,
    `  cd ../zed && node shared/scripts/check-public.mjs && ${DEPLOY}`,
  ]);
});

test('pull: both sides of the compare are the site\'s, kept before the pull and outside it', (t) => {
  const context = allSites(t);
  const { one } = context.sites;
  context.hubChange();
  writeFiles(one, { 'build/index.html': '<!DOCTYPE html>\n<html><body>the old build</body></html>\n' });
  context.builtJustNow(one);
  const keep = context.keep();
  assertExit(context.all(one, 'pull', '--only', 'one', '--keep', keep), EXIT.OK);
  const [{ beforePage, args, cwd }] = context.compares();
  assert.match(beforePage, /the old build/);
  assert.equal(cwd, fs.realpathSync(one));
  assert.equal(args[args.indexOf('--before') + 1], path.join(keep, 'one', 'before'));
  assert.equal(args[args.indexOf('--after') + 1], 'build');
});

test('pull: a stale build is built again before the pull, the same shape as the new one', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  context.hubChange();
  context.fixture.commitToSite(one, { 'docs/two.md': 'A page.\n' }, 'Add a page');
  const later = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(one, 'docs/two.md'), later, later);
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(one, 'build/index.html'), old, old);
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /older than the last commit, so it is built first/);
  const builds = context.calls().filter(({ args }) => args[1] === 'build');
  assert.deepEqual(builds.map(({ shape }) => shape), ['true', 'true']);
  assert.deepEqual(stepsOf(context, 'one'), ['run build', ...PROOF]);
});

test('pull: the template alone builds nothing, and the line is a push', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  context.templateChange();
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.OK);
  assert.deepEqual(context.steps(), []);
  assert.equal(result.output.split(TEMPLATE_LINE).length - 1, 3);
  assert.equal(stateOf(context.fixture, two), STATES.IN_SYNC);
  const lines = result.stdout.split('\n').filter((line) => line.startsWith('  cd ../'));
  assert.deepEqual(lines, ['  cd ../one && git push', '  cd ../two && git push', '  cd ../zed && git push']);
});

test('pull: the template and anything else is proved, a deleted file included', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  context.fixture.commitToHub({ 'template/notes.txt': 'A note.\n', 'css/custom.scss': 'Changed.\n' }, 'Change both');
  assertExit(context.all(one, 'pull', '--only', 'one'), EXIT.OK);
  assert.deepEqual(stepsOf(context, 'one'), PROOF);
  context.fixture.git(['rm', '-q', 'css/custom.scss'], context.fixture.hubWork);
  context.fixture.git(['commit', '-q', '-m', 'Remove the styles'], context.fixture.hubWork);
  context.fixture.git(['push', '-q', 'origin', 'main'], context.fixture.hubWork);
  assertExit(context.all(two, 'pull', '--only', 'two'), EXIT.OK);
  assert.deepEqual(stepsOf(context, 'two'), PROOF);
});

test('pull: sites in sync take no step and get no line, and a second run does nothing', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one } = context.sites;
  const first = context.all(one, 'pull');
  assertExit(first, EXIT.OK);
  assert.deepEqual(context.steps(), []);
  assert.match(first.stdout, /one: nothing to do\./);
  assert.doesNotMatch(first.stdout, /To publish/);
  context.hubChange();
  assertExit(context.all(one, 'pull'), EXIT.OK);
  const steps = context.steps().length;
  const again = everything(context);
  const second = context.all(one, 'pull');
  assertExit(second, EXIT.OK);
  assert.equal(context.steps().length, steps);
  assert.deepEqual(everything(context), again);
});

test('pull: a site ahead of the hub is left alone, and one that diverged is pulled and proved', (t) => {
  const context = allSites(t, { names: ['one', 'two', 'zed'] });
  const { one, two, zed } = context.sites;
  context.fixture.commitToSite(two, { 'shared/notes.txt': 'A change here.\n' }, 'Add a note');
  const ahead = context.all(one, 'pull');
  assertExit(ahead, EXIT.OK);
  assert.equal(stateOf(context.fixture, two), STATES.AHEAD);
  assert.match(ahead.stdout, /two: nothing to do\./);
  context.hubChange();
  assertExit(context.all(one, 'pull'), EXIT.OK);
  assert.deepEqual(stepsOf(context, 'two'), PROOF);
  assert.equal(stateOf(context.fixture, zed), STATES.IN_SYNC);
});

test('pull: a dirty site means nothing is pulled, and the printed line goes on without it', (t) => {
  const context = allSites(t);
  const { one, two, zed } = context.sites;
  context.hubChange();
  writeFiles(zed, { 'docs/intro.md': 'Changed.\n' });
  const before = everything(context);
  const held = context.head(zed);
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.REFUSED);
  assert.deepEqual(everything(context), before);
  assert.deepEqual(context.steps(), []);
  assert.match(result.output, /1 site of 3 cannot run/);
  assert.match(result.output, /^zed:$/m);
  assert.match(result.output, /docs\/intro\.md/);
  assert.match(result.output, /Nothing was changed in any site\./);
  const ready = lineWith(result.output, 'go on without it');
  assert.match(ready, /--skip zed$/);
  const carried = context.line(one, ready.replace(/--keep \S+ /, ''));
  assertExit(carried, EXIT.OK);
  assert.equal(stateOf(context.fixture, one), STATES.IN_SYNC);
  assert.equal(stateOf(context.fixture, two), STATES.IN_SYNC);
  assert.equal(context.head(zed), held);
  assert.match(carried.stdout, /Left out of this run: zed\./);
});

test('pull: every site in the way is named, and with --only the line stays an --only line', (t) => {
  const context = allSites(t);
  const { one, two, zed } = context.sites;
  context.hubChange();
  writeFiles(one, { 'docs/intro.md': 'Changed.\n' });
  context.fixture.git(['switch', '-q', '-c', 'side'], two);
  const result = context.all(one, 'pull', '--only', 'one,two,zed');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /2 sites of 3 cannot run/);
  assert.match(result.output, /^one:$/m);
  assert.match(result.output, /^two:$/m);
  assert.match(lineWith(result.output, 'go on without it'), /--only zed$/);
  assert.equal(stateOf(context.fixture, zed), STATES.BEHIND);
});

test('pull: a site with nothing left to run prints no ready line', (t) => {
  const context = allSites(t, { names: ['one'] });
  context.hubChange();
  writeFiles(context.sites.one, { 'docs/intro.md': 'Changed.\n' });
  const result = context.all(context.sites.one, 'pull');
  assertExit(result, EXIT.REFUSED);
  assert.doesNotMatch(result.output, /go on without it/);
});

test('pull: an open merge and a hub commit with a private subject each stop every site', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  context.fixture.commitToSite(two, { 'shared/css/custom.scss': 'Here.\n' }, 'Change the styles here');
  context.hubChange('Change the styles there');
  const script = path.join(two, 'shared/scripts/pull.mjs');
  assertExit(runWith(script, two, context.env, []), EXIT.CONFLICT);
  const before = context.head(one);
  const open = context.all(one, 'pull');
  assertExit(open, EXIT.REFUSED);
  assert.match(open.output, /a merge is still open/);
  assert.equal(context.head(one), before);
  context.fixture.git(['merge', '--abort'], two);
  context.hubChange('Mention the zebrafish');
  const hit = context.all(one, 'pull');
  assertExit(hit, EXIT.REFUSED);
  assert.match(hit.output, /a subject on the hub holds a private hit/);
  assert.doesNotMatch(hit.output, /zebrafish/);
});

test('pull: a server running from any site stops the run', async (t) => {
  const context = allSites(t);
  const { one, zed } = context.sites;
  context.hubChange();
  await startServer(t, zed);
  const before = everything(context);
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /a server is running from this checkout/);
  assert.deepEqual(everything(context), before);
});

test('pull: no word list stops the run once, and --no-word-list carries through', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  context.hubChange();
  fs.rmSync(context.fixture.wordList);
  const refused = context.all(one, 'pull');
  assertExit(refused, EXIT.REFUSED);
  assert.equal(refused.output.split('the word list is missing').length - 1, 1);
  assert.doesNotMatch(refused.output, /go on without it/);
  const passed = context.all(one, 'pull', '--no-word-list');
  assertExit(passed, EXIT.OK);
  assert.equal(stateOf(context.fixture, two), STATES.IN_SYNC);
});

test('pull: a site with no comparePages stops the run before any site moves', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  const manifest = JSON.parse(context.readSite(two, 'package.json'));
  delete manifest.comparePages;
  context.fixture.commitToSite(two, { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` }, 'Drop the pages');
  context.hubChange();
  const before = context.head(one);
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /No pages to compare/);
  assert.equal(context.head(one), before);
});

test('pull: a folder named twice stops, and one inside a site stops', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  context.hubChange();
  const inside = context.all(one, 'pull', '--keep', 'kept-here');
  assertExit(inside, EXIT.REFUSED);
  assert.match(inside.output, /which is inside this site/);
  const keep = context.keep();
  fs.mkdirSync(path.join(keep, 'one', 'before'), { recursive: true });
  const used = context.all(one, 'pull', '--keep', keep);
  assertExit(used, EXIT.REFUSED);
  assert.match(used.output, /exists/);
  assert.equal(stateOf(context.fixture, one), STATES.BEHIND);
});

test('pull: node_modules off package.json stops the run before any site moves, with the fix and the --skip line', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  context.hubChange();
  writeFiles(two, { 'node_modules/@docusaurus/core/package.json': '{ "version": "4.0.0" }\n' });
  const before = everything(context);
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /two:\n\s+shared:all refused: node_modules does not match package\.json/);
  assert.match(result.output, /@docusaurus\/core: package\.json 3\.10\.2, node_modules 4\.0\.0/);
  assert.match(result.output, /Fix: npm ci/);
  assert.match(result.output, /go on without it: npm run shared:all -- pull .*--skip two/);
  assert.deepEqual(context.steps(), []);
  assert.deepEqual(everything(context), before);
});

test('pull: a site with nothing to prove is not asked about node_modules', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  writeFiles(two, { 'node_modules/@docusaurus/core/package.json': '{ "version": "4.0.0" }\n' });
  assertExit(context.all(one, 'pull'), EXIT.OK);
});

test('pull: --ports and --lock-wait reach each compare, and a plain run passes neither', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  context.hubChange();
  assertExit(context.all(one, 'pull', '--ports', '4100-4109', '--lock-wait', '60'), EXIT.OK);
  const [{ args }] = context.compares();
  assert.deepEqual(args.slice(args.indexOf('--ports'), args.indexOf('--ports') + 2), ['--ports', '4100-4109']);
  assert.deepEqual(args.slice(args.indexOf('--lock-wait'), args.indexOf('--lock-wait') + 2), ['--lock-wait', '60']);
  context.hubChange('Change the styles again');
  assertExit(context.all(one, 'pull'), EXIT.OK);
  assert.equal(context.compares()[1].args.includes('--ports'), false);
  assert.equal(context.compares()[1].args.includes('--lock-wait'), false);
});

test('pull: a green end with nothing failing adds no line about status', (t) => {
  const context = allSites(t);
  const { one } = context.sites;
  context.hubChange();
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.OK);
  assert.equal(lineWith(result.output, 'reads FAIL'), '');
});

test('pull: a site that reads FAIL for a reason a bump cannot clear points at status, not at bump', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  context.hubChange();
  writeFiles(two, { 'shared/node_modules/stray.txt': 'A stray folder.\n' });
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.OK);
  assert.equal(lineWith(result.output, 'reads FAIL'), 'shared:status reads FAIL on two (node_modules). Read why: npm run shared:all -- status');
});

for (const [name, scenario, step] of [
  ['build', { build: 'fail' }, 'the build'],
  ['verify', { verify: 'fail' }, 'shared:verify'],
  ['compare', { compare: EXIT.CHECKS }, 'the compare'],
]) {
  test(`red ${name}: status fails on its red line with the printed undo, and a run again refuses that site, never Green`, (t) => {
    const { context, undo } = redPullAtTwo(t, scenario);
    const { one, two } = context.sites;
    const status = context.fixture.status(two, '--offline');
    assertExit(status, EXIT.CHECKS);
    const line = assertLine(status, 'FAIL', 'red', new RegExp(`went red here at ${step}, and this site still holds it  `));
    assert.ok(line.endsWith(`(fix: ${undo})`), line);
    const again = context.all(one, 'pull', '--only', 'two');
    assertExit(again, EXIT.REFUSED);
    assert.doesNotMatch(again.output, /Green|nothing to do/);
    assert.ok(again.output.includes(`Fix: run its undo first: ${undo}`), again.output);
    assertExit(context.fixture.script('pull.mjs', two), EXIT.REFUSED);
    const fleet = context.all(one, 'status', '--offline');
    assertExit(fleet, EXIT.CHECKS);
    assert.deepEqual(nextOf(fleet), [`Next: ${undo}`]);
    assert.equal(context.shell(one, undo).status, 0);
    assertExit(context.fixture.status(two, '--offline'), EXIT.OK);
  });
}

test('red pull, undone: status and Next point at a fix forward until the hub moves, and the next green proof clears it', (t) => {
  const { context, undo } = redPullAtTwo(t, { build: 'fail' });
  const { one, two } = context.sites;
  assert.equal(context.shell(one, undo).status, 0);
  const status = context.fixture.status(two, '--offline');
  assertLine(status, 'warn', 'hub', /behind the hub by 1 commit {2}\(fix: see the red line\)$/);
  const red = assertLine(status, 'warn', 'red', /went red here at the build and was undone: a pull brings it back/);
  const forward = 'fix it forward from a site in sync with the hub: npm run shared:push -- -m "<what the fix does>" there, then npm run shared:all -- pull';
  assert.ok(red.endsWith(`(fix: ${forward})`), red);
  const fleet = context.all(one, 'status', '--offline');
  assert.deepEqual(nextOf(fleet), ['Next: fix it forward: cd ../one && npm run shared:push -- -m "<what the fix does>", then npm run shared:all -- pull']);
  context.hubChange('Fix the styles');
  const moved = context.fixture.status(two);
  assertLine(moved, 'warn', 'hub', /behind the hub by 2 commits {2}\(fix: npm run shared:pull\)$/);
  assertLine(moved, 'warn', 'red', /and the hub has moved since {2}\(fix: npm run shared:all -- pull, which proves the hub here\)$/);
  assert.ok(nextOf(context.all(one, 'status')).includes('Next: npm run shared:all -- pull'));
  context.setScenario({});
  assertExit(context.all(one, 'pull'), EXIT.OK);
  assert.deepEqual(stepsOf(context, 'two').slice(-PROOF.length), PROOF);
  assert.equal(hasRedLine(context.fixture.status(two, '--offline')), false, 'the green proof cleared the red');
});

test('red pull, undone, then taken by hand: the site\'s own pull settles the red, and a run there goes on', (t) => {
  const { context, undo } = redPullAtTwo(t, { verify: 'fail' });
  const { one, two } = context.sites;
  assert.equal(context.shell(one, undo).status, 0);
  assertExit(context.fixture.script('pull.mjs', two), EXIT.OK);
  const status = context.fixture.status(two, '--offline');
  assert.equal(hasRedLine(status), false, 'a pull of its own after the undo is the site\'s call, so status reads no red');
  assert.deepEqual(nextOf(context.all(one, 'status', '--offline')).filter((line) => line.includes(undo)), []);
  context.setScenario({});
  const again = context.all(one, 'pull', '--only', 'two');
  assertExit(again, EXIT.OK);
  assert.doesNotMatch(again.output, /run its undo first/);
  assert.match(lineWith(again.stdout, 'two: the pull of hub'), /that red is cleared: it took hub [0-9a-f]{7} again in a pull of its own\. It has no build\/: build it before any deploy\.$/);
  assert.equal(hasRedLine(context.fixture.status(two, '--offline')), false);
});

test('red verify: build/ goes aside, and a take-back that builds nothing clears the red and says to build first', (t) => {
  const { context, result, undo } = redPullAtTwo(t, { verify: 'fail' });
  const { one, two } = context.sites;
  assert.equal(fs.existsSync(path.join(two, 'build')), false, 'the build that went red stays out of build/');
  const aside = lineWith(result.output, 'The build that went red: ').replace('The build that went red: ', '');
  assert.ok(fs.existsSync(path.join(aside, 'index.html')), result.output);
  assert.equal(context.shell(one, undo).status, 0);
  context.fixture.commitToHub({ 'css/custom.scss': SEED_STYLES }, 'Take back the styles');
  context.setScenario({});
  const back = context.all(one, 'pull');
  assertExit(back, EXIT.OK);
  assert.match(back.stdout, /^pull {5}ok, 2 commits, .*Nothing outside shared\/template changed, so nothing is built$/m);
  const cleared = lineWith(back.stdout, 'two: the pull of hub');
  assert.match(cleared, /went red here at shared:verify in an earlier run, and that red is cleared: it holds hub [0-9a-f]{7}, past [0-9a-f]{7}\. It has no build\/: build it before any deploy\.$/);
  assert.equal(fs.existsSync(path.join(two, 'build')), false);
  assert.equal(hasRedLine(context.fixture.status(two, '--offline')), false);
});

test('red bump at a later site, undone: Next names its fix and the bump, or the pin put back, never a pull', (t) => {
  const context = allSites(t, { names: ['one', 'two'], scenario: { sites: { two: { failBuildOn: NEXT } } } });
  const { one, two } = context.sites;
  const red = context.all(one, 'bump', NEXT, '--yes');
  assertExit(red, EXIT.CHECKS);
  assert.equal(context.subject(one), commitSubject(NEXT));
  assert.equal(context.shell(one, undoOf(red)).status, 0);
  const next = [`Next: put the pin back: cd ../one && npm run shared:all -- bump ${PIN} --yes; or fix the red in two and commit it there, then npm run shared:all -- bump`];
  assert.deepEqual(nextOf(context.all(one, 'status', '--offline')), next);
  const status = context.fixture.status(two, '--offline');
  assertLine(status, 'warn', 'hub', /\(fix: see the red line\)$/);
  const line = assertLine(status, 'warn', 'red', new RegExp(`the bump to ${NEXT.replaceAll('.', '\\.')} went red here at the build and was undone: this site stays on ${PIN.replaceAll('.', '\\.')}`));
  assert.ok(line.endsWith(`(fix: put the pin back from a site in sync with the hub: npm run shared:all -- bump ${PIN} --yes; or fix the red here and commit it, then npm run shared:all -- bump)`), line);
  assertExit(context.all(one, 'pull'), EXIT.OK);
  assertLine(context.fixture.status(two, '--offline'), 'warn', 'red', /went red here at the build and was undone/);
  assert.deepEqual(nextOf(context.all(one, 'status', '--offline')), next, 'a pull of the pin alone leaves the red where it was');
  context.setScenario({});
  assertExit(context.all(one, 'bump'), EXIT.OK);
  assert.equal(context.subject(two), commitSubject(NEXT));
  assert.equal(hasRedLine(context.fixture.status(two, '--offline')), false);
});

test('carry on: a run that leaves the red site out repeats the publish line of a site the red run tested, until it is pushed', (t) => {
  const context = allSites(t, { on: FROM, scenario: { sites: { two: { verify: 'fail' } } } });
  const { one } = context.sites;
  const red = context.all(one, 'bump');
  assertExit(red, EXIT.CHECKS);
  const home = `  cd ../one && ${DEPLOY}`;
  assert.ok(red.stdout.includes(`${home}\n`), red.stdout);
  assert.equal(context.shell(one, undoOf(red)).status, 0);
  const ready = lineWith(red.output, 'To carry on without two: ').split('To carry on without two: ')[1];
  const carried = context.line(one, ready.replace(/--keep \S+ /, ''));
  assertExit(carried, EXIT.OK);
  const lines = carried.stdout.split('\n').filter((line) => line.startsWith('  cd ../'));
  assert.deepEqual(lines, [`  cd ../zed && ${DEPLOY}`, home]);
  pushToOrigin(context.fixture, one);
  const later = context.all(one, 'bump', '--only', 'zed');
  assertExit(later, EXIT.OK);
  assert.doesNotMatch(later.stdout, /cd \.\.\/one/, 'a pushed site\'s line is not printed again');
});

test('pull: a red build stops there, and the undo restores the recorded sha, the rest untouched', (t) => {
  const context = allSites(t, { scenario: { sites: { two: { build: 'fail' } } } });
  const { one, two, zed } = context.sites;
  context.hubChange();
  const recorded = context.head(two);
  const untouched = context.head(zed);
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.CHECKS);
  assert.match(result.output, /two: RED at the build: exit code 1/);
  assert.match(result.output, new RegExp(`Stopped at two, which was at ${recorded.slice(0, 7)}\\.`));
  assert.match(result.output, /Not touched: zed\./);
  assert.deepEqual(stepsOf(context, 'zed'), []);
  assert.equal(context.head(zed), untouched);
  assert.notEqual(context.head(two), recorded);
  assert.equal(context.changes(two), '');
  const undo = undoOf(result);
  assert.equal(undo, `cd ../two && git update-index -q --refresh && git reset --keep ${recorded.slice(0, 7)}`);
  const ran = context.shell(one, undo);
  assert.equal(ran.status, 0, ran.stderr);
  assert.equal(context.head(two), recorded);
  assert.equal(context.changes(two), '');
  assert.equal(stateOf(context.fixture, two), STATES.BEHIND);
});

test('pull: after a red the printed --only line carries on without that site', (t) => {
  const context = allSites(t, { scenario: { sites: { one: { verify: 'fail' } } } });
  const { one, two, zed } = context.sites;
  context.hubChange();
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.CHECKS);
  assert.match(result.output, /one: RED at shared:verify/);
  assert.match(result.output, /Not touched: two, zed\./);
  const ready = lineWith(result.output, 'To carry on without one');
  assert.match(ready, /--only two,zed$/);
  const carried = context.line(one, ready.replace(/--keep \S+ /, ''));
  assertExit(carried, EXIT.OK);
  assert.equal(stateOf(context.fixture, two), STATES.IN_SYNC);
  assert.equal(stateOf(context.fixture, zed), STATES.IN_SYNC);
});

test('pull: green sites before a red still get their lines, and the red one does not', (t) => {
  const context = allSites(t, { scenario: { sites: { two: { verify: 'fail' } } } });
  const { one } = context.sites;
  context.hubChange();
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.CHECKS);
  const lines = result.stdout.split('\n').filter((line) => line.startsWith('  cd ../'));
  assert.deepEqual(lines, [`  cd ../one && ${DEPLOY}`]);
  assert.doesNotMatch(result.output, /Green:/);
});

test('pull: a hung suite reads red at the limit, and leaves no process', (t) => {
  const context = allSites(t, { scenario: { sites: { two: { verify: 'hang' } } } });
  const { one, two } = context.sites;
  context.hubChange();
  const result = context.all(one, 'pull', ...FAST_TIMEOUT);
  assertExit(result, EXIT.CHECKS);
  assert.match(result.output, /still running after 1 s/);
  const pid = Number(fs.readFileSync(path.join(context.base, 'hung.pid'), 'utf8'));
  assert.equal(isRunning(pid), false);
  assert.equal(stateOf(context.fixture, two), STATES.IN_SYNC);
});

test('pull: a red compare stops the run, and a list to read stops it with the commits kept', (t) => {
  const context = allSites(t, { scenario: { sites: { one: { compare: EXIT.TO_READ, report: true } } } });
  const { one, two } = context.sites;
  context.hubChange();
  const recorded = context.head(one);
  const list = context.all(one, 'pull');
  assertExit(list, EXIT.TO_READ);
  assert.match(list.output, /one has a list to read, above\./);
  assert.match(list.output, /a list to read/);
  assert.match(list.output, /Not touched: two, zed\./);
  assert.match(list.output, /When the list reads fine: npm run shared:all -- pull .*--only two,zed/);
  assert.equal(stateOf(context.fixture, one), STATES.IN_SYNC);
  assert.equal(stateOf(context.fixture, two), STATES.BEHIND);
  assert.ok(lineWith(list.output, 'Undo: ').includes(`git reset --keep ${recorded.slice(0, 7)}`));
  assert.ok(list.stdout.includes(`  cd ../one && ${DEPLOY}\n`), list.stdout);
  context.setScenario({ sites: { two: { compare: EXIT.CHECKS } } });
  const redCompare = context.all(one, 'pull');
  assertExit(redCompare, EXIT.CHECKS);
  assert.match(redCompare.output, /two: RED at the compare/);
  assert.match(redCompare.output, /Not touched: zed\./);
});

test('pull: a run started again skips what is done and goes on', (t) => {
  const context = allSites(t, { scenario: { sites: { one: { compare: EXIT.TO_READ } } } });
  const { one, zed } = context.sites;
  context.hubChange();
  assertExit(context.all(one, 'pull'), EXIT.TO_READ);
  context.setScenario({});
  const again = context.all(one, 'pull');
  assertExit(again, EXIT.OK);
  assert.match(again.stdout, /one: nothing to do\./);
  assert.deepEqual(stepsOf(context, 'zed'), PROOF);
  assert.equal(stateOf(context.fixture, zed), STATES.IN_SYNC);
});

test('pull: a conflict stops with the merge open, and the undo drops it', (t) => {
  const context = allSites(t, { names: ['one', 'two', 'zed'] });
  const { one, two, zed } = context.sites;
  context.fixture.commitToSite(two, { 'shared/css/custom.scss': 'Here.\n' }, 'Change the styles here');
  context.hubChange('Change the styles there');
  const recorded = context.head(two);
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.CONFLICT);
  assert.match(result.output, /two: shared:pull stopped with exit code 6/);
  assert.match(result.output, /stopped at a conflict/);
  assert.match(result.output, /Not touched: zed\./);
  assert.equal(stateOf(context.fixture, zed), STATES.BEHIND);
  const undo = undoOf(result);
  assert.equal(undo, 'cd ../two && git merge --abort');
  assert.equal(context.shell(one, undo).status, 0);
  assert.equal(context.head(two), recorded);
  assert.equal(context.changes(two), '');
});

test('pull: a package the new shared/ needs stops the run, and the undo works', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  context.fixture.commitToSite(one, { 'docusaurus.config.js': "module.exports = { customCss: ['./shared/css/custom.scss'] };\n" }, 'Use the styles');
  context.pathOfFreshBuild(one);
  context.fixture.commitToHub({ 'css/custom.scss': 'Changed.\n' }, 'Change the styles');
  const recorded = context.head(one);
  const result = context.all(one, 'pull');
  assertExit(result, EXIT.CHECKS);
  assert.match(result.output, /one: shared:pull stopped with exit code 3/);
  assert.deepEqual(stepsOf(context, 'one'), []);
  assert.equal(stateOf(context.fixture, two), STATES.BEHIND);
  assert.equal(context.shell(one, undoOf(result)).status, 0);
  assert.equal(context.head(one), recorded);
});

test('pull: a signal stops the run, leaves no process, and says how to go back', async (t) => {
  const context = allSites(t, { scenario: { sites: { two: { verify: 'hang' } } } });
  const { one, two, zed } = context.sites;
  context.hubChange();
  const recorded = context.head(two);
  const args = [context.ownAll, 'pull', '--keep', context.keep()];
  const child = spawn(process.execPath, args, { cwd: one, env: context.env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => stopProcess(child));
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  const hungFile = path.join(context.base, 'hung.pid');
  assert.ok(await waitFor(() => fs.existsSync(hungFile), 30_000), output);
  const pid = Number(fs.readFileSync(hungFile, 'utf8'));
  const closed = new Promise((resolve) => { child.once('close', resolve); });
  child.kill('SIGTERM');
  assert.equal(await closed, 143);
  assert.equal(await waitFor(() => !isRunning(pid), 5000), true);
  assert.match(output, /two: stopped by SIGTERM\./);
  assert.ok(output.includes(`git reset --keep ${recorded.slice(0, 7)}`), output);
  assert.equal(stateOf(context.fixture, zed), STATES.BEHIND);
  assertLine(context.fixture.status(two, '--offline'), 'FAIL', 'red', /was stopped here by SIGTERM, and this site still holds it/);
});

test('pull: --skip handles a stray clone, and a week later --only takes it', (t) => {
  const context = allSites(t);
  const { one, zed } = context.sites;
  const { fixture } = context;
  const stray = path.join(fixture.sites, 'one-copy');
  fs.cpSync(one, stray, { recursive: true });
  writeFiles(stray, { 'docs/intro.md': 'Half-done work in a copy.\n' });
  context.hubChange();
  assertExit(context.all(one, 'pull'), EXIT.REFUSED);
  const held = context.all(one, 'pull', '--skip', 'one-copy,zed');
  assertExit(held, EXIT.OK);
  assert.match(held.stdout, /Left out of this run: one-copy, zed\./);
  assert.equal(stateOf(fixture, zed), STATES.BEHIND);
  const later = context.all(one, 'pull', '--only', 'zed');
  assertExit(later, EXIT.OK);
  assert.equal(stateOf(fixture, zed), STATES.IN_SYNC);
});

test('bump: each site moves to the hub\'s pin, with one proof, and the end lines', (t) => {
  const context = allSites(t, { on: FROM });
  const { one, two, zed } = context.sites;
  const hub = context.hubHead();
  const result = context.all(two, 'bump');
  assertExit(result, EXIT.OK);
  for (const [name, site] of Object.entries({ one, two, zed })) {
    assert.equal(context.subject(site), commitSubject(PIN));
    assert.deepEqual(stepsOf(context, name), BUMP_PROOF);
  }
  assert.equal(context.hubHead(), hub);
  assert.deepEqual(result.stdout.split('\n').filter((line) => line.startsWith('  cd ../')), [
    `  cd ../two && ${DEPLOY}`, `  cd ../one && ${DEPLOY}`, `  cd ../zed && ${DEPLOY}`,
  ]);
});

test('bump: bump.mjs gets the version and the folders, in the site, and no site is touched by this process', (t) => {
  const context = allSites(t, { on: FROM, names: ['one'] });
  const { one } = context.sites;
  const keep = context.keep();
  assertExit(context.all(one, 'bump', '--keep', keep, '--verify-timeout', '77'), EXIT.OK);
  assert.ok(fs.existsSync(path.join(keep, 'one', 'logs', 'install.log')));
  assert.ok(fs.existsSync(path.join(keep, 'one', 'before', 'index.html')));
  const [{ beforePage }] = context.compares();
  assert.equal(beforePage, pageOf(FROM));
});

test('bump: --ports and --lock-wait pass through bump.mjs to the compare', (t) => {
  const context = allSites(t, { on: FROM, names: ['one'] });
  const { one } = context.sites;
  assertExit(context.all(one, 'bump', '--ports', '4100-4109', '--lock-wait', '60'), EXIT.OK);
  const [{ args }] = context.compares();
  assert.deepEqual(args.slice(args.indexOf('--ports'), args.indexOf('--ports') + 2), ['--ports', '4100-4109']);
  assert.deepEqual(args.slice(args.indexOf('--lock-wait'), args.indexOf('--lock-wait') + 2), ['--lock-wait', '60']);
});

test('bump: a site on the version takes no step', (t) => {
  const context = allSites(t);
  const { one } = context.sites;
  const result = context.all(one, 'bump');
  assertExit(result, EXIT.OK);
  assert.deepEqual(context.steps(), []);
  assert.match(result.stdout, /one: nothing to do\./);
  assert.doesNotMatch(result.stdout, /To publish/);
});

test('bump: --verify-timeout reaches the bump of each site', (t) => {
  const context = allSites(t, { on: FROM, names: ['one'], scenario: { verify: 'hang' } });
  const { one } = context.sites;
  const result = context.all(one, 'bump', ...FAST_TIMEOUT);
  assertExit(result, EXIT.CHECKS);
  assert.match(result.output, /still running after 1 s/);
  const pid = Number(fs.readFileSync(path.join(context.base, 'hung.pid'), 'utf8'));
  assert.equal(isRunning(pid), false);
});

test('bump: a site behind the hub is pulled first, and one proof covers both', (t) => {
  const context = allSites(t, { on: FROM, names: ['one'] });
  const { one } = context.sites;
  context.hubChange();
  const result = context.all(one, 'bump');
  assertExit(result, EXIT.OK);
  assert.deepEqual(stepsOf(context, 'one'), BUMP_PROOF);
  assert.equal(stateOf(context.fixture, one), STATES.IN_SYNC);
  assert.equal(context.subject(one), commitSubject(PIN));
  assert.equal(context.compares()[0].beforePage, pageOf(FROM));
});

test('bump: a site already on the version still proves a pull that brings a change', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  context.hubChange();
  const result = context.all(one, 'bump');
  assertExit(result, EXIT.OK);
  assert.deepEqual(stepsOf(context, 'one'), PROOF);
});

test('bump <version>: one line moves the pin, publishes it, and moves every site', (t) => {
  const context = allSites(t);
  const { one, two, zed } = context.sites;
  const result = context.all(two, 'bump', NEXT, '--yes');
  assertExit(result, EXIT.OK);
  assert.equal(context.hubPin(), NEXT);
  assert.equal(hubSubjects(context.fixture)[0], `Move the Docusaurus pin to ${NEXT}`);
  for (const [name, site] of Object.entries({ one, two, zed })) {
    assert.equal(context.subject(site), commitSubject(NEXT));
    assert.deepEqual(stepsOf(context, name), BUMP_PROOF);
    assert.equal(stateOf(context.fixture, site), STATES.IN_SYNC);
    assert.equal(context.changes(site), '');
    assert.ok(context.readSite(site, 'shared/template/package.json').includes(NEXT), name);
  }
  assert.match(result.stdout, new RegExp(`pin +3\\.10\\.2 -> ${NEXT.replaceAll('.', '\\.')}, published from two`));
  assert.equal(context.pushTests.runs(), 1);
  for (const { beforePage } of context.compares()) assert.equal(beforePage, pageOf(PIN));
});

test('bump <version>: the site that moves the pin keeps its build from before the pin', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  writeFiles(one, { 'build/index.html': '<!DOCTYPE html>\n<html><body>the old build</body></html>\n' });
  context.builtJustNow(one);
  assertExit(context.all(one, 'bump', NEXT, '--yes'), EXIT.OK);
  assert.deepEqual(stepsOf(context, 'one'), BUMP_PROOF);
  assert.match(context.compares()[0].beforePage, /the old build/);
});

test('bump <version>: the pin holds that version on every entry and nothing else moved', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  const before = JSON.parse(context.fixture.git(['show', 'main:template/package.json'], context.fixture.hub));
  assertExit(context.all(one, 'bump', NEXT, '--yes'), EXIT.OK);
  const after = JSON.parse(context.fixture.git(['show', 'main:template/package.json'], context.fixture.hub));
  assert.deepEqual(after.dependencies, { ...before.dependencies, '@docusaurus/core': NEXT, '@docusaurus/theme-classic': NEXT });
  assert.deepEqual(after.devDependencies, { '@docusaurus/types': NEXT });
});

test('bump <version>: the one question: no moves nothing, and no answer is a no', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one } = context.sites;
  const before = everything(context);
  const declined = context.allAnswering(one, 'n\n', 'bump', NEXT);
  assertExit(declined, EXIT.REFUSED);
  assert.match(declined.stdout, /Publish the pin, 3\.10\.2 to 3\.11\.0, to the hub, then bump one, two\? \[y\/N\]/);
  assert.match(declined.stdout, /Nothing was published\./);
  assert.deepEqual(everything(context), before);
  const silent = context.allAnswering(one, '', 'bump', NEXT);
  assertExit(silent, EXIT.REFUSED);
  assert.match(silent.stdout, /no answer\. Pass --yes/);
  assert.deepEqual(everything(context), before);
  assert.deepEqual(context.steps(), []);
  assert.equal(context.pushTests.runs(), 0);
});

test('bump <version>: a yes goes on, and asks nothing more', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const result = context.allAnswering(context.sites.one, 'y\n', 'bump', NEXT);
  assertExit(result, EXIT.OK);
  assert.equal(result.stdout.split('[y/N]').length - 1, 1);
  assert.equal(context.hubPin(), NEXT);
});

test('bump <version>: a push that stops leaves the site as it was', (t) => {
  const context = allSites(t, { names: ['one', 'two'], tests: { exitCode: 1 } });
  const { one } = context.sites;
  const before = everything(context);
  const result = context.all(one, 'bump', NEXT, '--yes');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /test:shared is red/);
  assert.match(result.output, /The pin was not published/);
  assert.deepEqual(everything(context), before);
  assert.deepEqual(context.steps(), []);
});

test('bump <version>: a hub that takes nothing leaves the site as it was', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  const hook = path.join(context.fixture.hub, 'hooks', 'pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const before = everything(context);
  const result = context.all(one, 'bump', NEXT, '--yes');
  assertExit(result, EXIT.GIT);
  assert.deepEqual(everything(context), before);
  assert.match(result.output, /The pin was not published/);
});

test('bump <version>: a version npm lacks is refused before the question, and nothing moves', (t) => {
  const context = allSites(t, { names: ['one', 'two'], scenario: { missing: ['3.10.9'] } });
  const { one } = context.sites;
  const before = everything(context);
  const result = context.all(one, 'bump', '3.10.9', '--yes');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /npm gave no Docusaurus 3\.10\.9: it does not exist, or npm could not be reached\. The pin stays at 3\.10\.2\./);
  assert.equal(context.hubPin(), PIN);
  assert.deepEqual(everything(context), before);
  assert.deepEqual(context.steps(), []);
  assert.equal(context.pushTests.runs(), 0);
});

/** The hub's requirements.cjs with @docusaurus ranges, as a hub that asks for a newer Docusaurus holds it. */
function rangedRequirements({ fixture }, range) {
  const text = fixture.git(['show', 'main:requirements.cjs'], fixture.hub);
  const ranged = `RANGES: { '@docusaurus/core': '${range}', '@docusaurus/theme-classic': '${range}', `;
  return { 'requirements.cjs': text.replace('RANGES: { ', ranged) };
}

test('bump <version>: a version the requirements\' ranges rule out is refused before the question, naming the newest inside', (t) => {
  const versions = ['3.9.2', '3.10.1', '3.10.2', '3.11.0', '3.12.0-canary.1', '4.0.0'];
  const context = allSites(t, { names: ['one', 'two'], scenario: { versions } });
  const { one } = context.sites;
  context.fixture.commitToHub(rangedRequirements(context, '^3.10.2'), 'Ask for Docusaurus 3.10.2 or later');
  assertExit(context.all(one, 'pull'), EXIT.OK);
  const before = everything(context);
  const steps = context.steps().length;
  const result = context.allAnswering(one, 'y\n', 'bump', '3.10.1');
  assertExit(result, EXIT.REFUSED);
  const reason = 'Docusaurus 3.10.1 is outside what shared/requirements.cjs asks: ^3.10.2 of @docusaurus/core and '
    + '@docusaurus/theme-classic, so shared:verify would fail on it. The newest version npm has inside ^3.10.2 is 3.11.0. '
    + `The pin stays at ${PIN}.`;
  assert.ok(result.output.includes(reason), result.output);
  assert.match(result.output, /Fix: name a version inside it, or change the range in shared\/requirements\.cjs and publish that first/);
  assert.doesNotMatch(result.output, /\[y\/N\]/);
  assert.equal(context.hubPin(), PIN);
  assert.deepEqual(everything(context), before);
  assert.equal(context.steps().length, steps);
  assert.ok(!context.calls().some(({ args }) => args[1] === '@docusaurus/core@3.10.1'), 'npm was asked whether it exists');
  assertExit(context.all(one, 'bump', NEXT, '--yes'), EXIT.OK);
  assert.equal(context.hubPin(), NEXT);
});

test('bump <version>: a push stopped by its limit after the hub took it says the pin is out, and keeps it', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  const hook = path.join(context.fixture.hub, 'hooks', 'post-receive');
  fs.writeFileSync(hook, holdingHook(context.fixture.base), { mode: 0o755 });
  const result = context.all(one, 'bump', NEXT, '--yes', '--verify-timeout', String(PUSH_LIMIT_SECONDS));
  assertExit(result, EXIT.NOT_REJOINED);
  assert.equal(context.hubPin(), NEXT);
  assert.match(result.output, /The pin reached the hub, and one did not rejoin\. Run npm run shared:push there/);
  assert.doesNotMatch(result.output, /The pin was not published/);
});

test('bump <version>: a site that stops after the pin went out hears how to put the pin back', (t) => {
  const context = allSites(t, { names: ['one', 'two'], scenario: { sites: { two: { install: 'eresolve' } } } });
  const { one } = context.sites;
  const result = context.all(one, 'bump', NEXT, '--yes');
  assertExit(result, EXIT.CHECKS);
  assert.equal(context.hubPin(), NEXT);
  assert.ok(result.output.includes(`The hub holds the pin at ${NEXT} now, and every site that pulls takes it. If it should not stay: npm run shared:all -- bump ${PIN} --yes`), result.output);
});

/** A run that publishes the pin from `one`, then goes red at one's own build: the stop, and its pin-back line. */
function redWhereThePinMoved(t) {
  const context = allSites(t, { names: ['one', 'two'], scenario: { sites: { one: { failBuildOn: NEXT } } } });
  const result = context.all(context.sites.one, 'bump', NEXT, '--yes');
  assertExit(result, EXIT.CHECKS);
  assert.equal(context.hubPin(), NEXT);
  assert.match(result.output, /Not touched: two\./);
  const back = lineWith(result.output, 'If it should not stay: ').split('If it should not stay: ')[1];
  assert.equal(back, `npm run shared:all -- bump ${PIN} --yes`);
  return { context, result, back };
}

test('bump <version>: after a red where the pin moved from and its undo, status names the bump and the pin-back', (t) => {
  const { context, result, back } = redWhereThePinMoved(t);
  const { one, two } = context.sites;
  assert.equal(context.shell(one, undoOf(result)).status, 0);
  assert.equal(context.changes(one), '');
  const line = assertLine(context.fixture.status(one, '--offline'), 'FAIL', 'pin', /off the pin, Docusaurus 3\.11\.0 /);
  assert.ok(line.endsWith(`(fix: npm run shared:bump, or if Docusaurus ${NEXT} went red here, put the pin back: ${back})`), line);
  assertExit(context.fixture.script('pull.mjs', two), EXIT.OK);
  const pulled = assertLine(context.fixture.status(two, '--offline'), 'FAIL', 'pin', /off the pin/);
  assert.ok(pulled.endsWith(`put the pin back: ${back})`), `a pin a pull brought reads the same: ${pulled}`);
  context.setScenario({});
  const undone = context.line(one, back);
  assertExit(undone, EXIT.OK);
  assert.equal(context.hubPin(), PIN);
  for (const site of [one, two]) assertLine(context.fixture.status(site, '--offline'), 'ok', 'pin', /on the pin, Docusaurus 3\.10\.2/);
});

test('bump <version>: after a red where the pin moved from and its undo, shared:all -- status names the pin-back first, and no pull', (t) => {
  const { context, result, back } = redWhereThePinMoved(t);
  const { one } = context.sites;
  assert.equal(context.shell(one, undoOf(result)).status, 0);
  const next = nextOf(context.all(one, 'status', '--offline'));
  assert.deepEqual(next, [`Next: put the pin back: cd ../one && ${back}; or fix the red in one and commit it there, then npm run shared:all -- bump`]);
});

test('bump <version>: the pin-back run before the undo names that undo, not a --skip that cannot help', (t) => {
  const { context, result, back } = redWhereThePinMoved(t);
  const { one } = context.sites;
  const hub = context.hubHead();
  const early = context.line(one, back);
  assertExit(early, EXIT.REFUSED);
  assert.equal(context.hubHead(), hub, 'nothing was published');
  assert.match(early.output, /^one:$/m);
  assert.doesNotMatch(early.output, /--skip/);
  const named = lineWith(early.output, 'The pin moves from one');
  const undo = undoOf(result);
  assert.equal(named, `The pin moves from one, so the run cannot go on without it. If a red run left these changes, run the undo it printed, then this again: ${undo}`);
  assert.equal(context.shell(one, named.split('then this again: ')[1]).status, 0);
  context.setScenario({});
  assertExit(context.line(one, back), EXIT.OK);
  assert.equal(context.hubPin(), PIN);
});

test('bump <version>: the site the pin moves from, dirty with its own work, is never offered a --skip', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one } = context.sites;
  writeFiles(one, { 'docs/intro.md': 'Changed.\n' });
  const result = context.all(one, 'bump', NEXT, '--yes');
  assertExit(result, EXIT.REFUSED);
  assert.notEqual(context.hubPin(), NEXT);
  assert.doesNotMatch(result.output, /--skip/);
  assert.equal(lineWith(result.output, 'The pin moves from one'), 'The pin moves from one, so the run cannot go on without it. Fix it and run this again.');
  const held = context.all(one, 'bump', '--yes');
  assert.match(lineWith(held.output, 'go on without it'), /--skip one$/, 'a run that moves no pin can still go on without it');
});

test('bump <version>: the pin moves only from a site in sync', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  context.hubChange();
  const behind = context.all(one, 'bump', NEXT, '--yes');
  assertExit(behind, EXIT.REFUSED);
  assert.match(behind.output, /moving the pin starts from a site in sync with the hub, and one reads behind/);
  assert.match(behind.output, /Fix: npm run shared:all -- pull, then run this again/);
  assert.equal(stateOf(context.fixture, two), STATES.BEHIND);
  assertExit(context.all(one, 'pull'), EXIT.OK);
  context.fixture.commitToSite(one, { 'shared/notes.txt': 'A change here.\n' }, 'Add a note');
  const ahead = context.all(one, 'bump', NEXT, '--yes');
  assertExit(ahead, EXIT.REFUSED);
  assert.match(ahead.output, /one reads ahead/);
  assert.notEqual(context.hubPin(), NEXT);
});

test('bump <version>: the pin moved from a site outside the run', (t) => {
  const context = allSites(t);
  const { one, two, zed } = context.sites;
  const before = context.head(zed);
  const result = context.all(one, 'bump', NEXT, '--yes', '--only', 'two');
  assertExit(result, EXIT.OK);
  assert.equal(context.hubPin(), NEXT);
  assert.equal(context.subject(two), commitSubject(NEXT));
  assert.equal(context.head(zed), before);
  assert.deepEqual(stepsOf(context, 'one'), []);
  const lines = result.stdout.split('\n').filter((line) => line.startsWith('  cd ../'));
  assert.deepEqual(lines, ['  cd ../one && git push', `  cd ../two && ${DEPLOY}`]);
});

test('bump <version>: the hub on that version already asks nothing and publishes nothing', (t) => {
  const context = allSites(t, { on: FROM, names: ['one'] });
  const { one } = context.sites;
  const hub = context.hubHead();
  const result = context.all(one, 'bump', PIN);
  assertExit(result, EXIT.OK);
  assert.equal(context.hubHead(), hub);
  assert.doesNotMatch(result.stdout, /\[y\/N\]/);
});

test('bump --no-pin: a green end names the sites that read FAIL and the way back, and still exits 0', (t) => {
  const context = allSites(t);
  const { one } = context.sites;
  const result = context.all(one, 'bump', FROM, '--no-pin');
  assertExit(result, EXIT.OK);
  assert.match(result.output, /^Green: one, two, zed\. Nothing was pushed or deployed\.$/m);
  const line = lineWith(result.output, 'reads FAIL');
  assert.equal(line, 'shared:status reads FAIL on one (pin), two (pin), zed (pin). The way back: npm run shared:all -- bump');
  const back = context.line(one, line);
  assertExit(back, EXIT.OK);
  assert.equal(lineWith(back.output, 'reads FAIL'), '');
  assert.equal(context.subject(one), commitSubject(PIN));
});

test('bump --no-pin: the way back covers the sites this run covered', (t) => {
  const context = allSites(t);
  const { one } = context.sites;
  const result = context.all(one, 'bump', FROM, '--no-pin', '--only', 'two');
  assertExit(result, EXIT.OK);
  assert.equal(lineWith(result.output, 'reads FAIL'), 'shared:status reads FAIL on two (pin). The way back: npm run shared:all -- bump --only two');
});

test('bump <version>: a pin below what a piece in use needs is never published, so no site is left reading FAIL on packages', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  const table = context.fixture.git(['show', 'main:requirements.cjs'], context.fixture.hub)
    .replace("RANGES: { react: '^19.0.0',", `RANGES: { '@docusaurus/core': '^${PIN}', react: '^19.0.0',`)
    .replace("packages: ['sass'], suites", "packages: ['@docusaurus/core'], suites");
  context.fixture.commitToHub({ 'requirements.cjs': `${table}\n` }, 'Raise the Docusaurus range');
  const config = { 'docusaurus.config.js': "module.exports = { customCss: ['./shared/css/custom.scss'] };\n" };
  [one, two].forEach((site) => context.fixture.commitToSite(site, config, 'Load the shared styles'));
  assertExit(context.all(one, 'pull'), EXIT.OK);
  const before = everything(context);
  const result = context.all(one, 'bump', FROM, '--yes');
  assertExit(result, EXIT.REFUSED);
  assert.ok(result.output.includes(`Docusaurus ${FROM} is outside what shared/requirements.cjs asks: ^${PIN} of @docusaurus/core`), result.output);
  assert.match(result.output, /npm has no version inside \^3\.10\.2\./);
  assert.equal(context.hubPin(), PIN);
  assert.deepEqual(everything(context), before);
  assert.equal(lineWith(result.output, 'reads FAIL'), '');
});

test('run: a script run says nothing about status: it moved nothing', (t) => {
  const context = allSites(t, { on: FROM });
  const { one } = context.sites;
  const result = context.all(one, 'run', 'shared:verify');
  assertExit(result, EXIT.OK);
  assert.equal(lineWith(result.output, 'reads FAIL'), '');
});

test('bump --no-pin: a rehearsal moves the sites and leaves the hub', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  const hub = context.hubHead();
  const result = context.all(one, 'bump', FROM, '--no-pin', '--only', 'two');
  assertExit(result, EXIT.OK);
  assert.equal(context.hubHead(), hub);
  assert.equal(context.subject(two), commitSubject(FROM));
  assert.doesNotMatch(result.stdout, /\[y\/N\]/);
  assert.notEqual(context.subject(one), commitSubject(FROM));
});

test('bump: a red install stops there, and the undo goes back to the sha, packages included', (t) => {
  const context = allSites(t, { on: FROM, scenario: { sites: { two: { install: 'eresolve' } } } });
  const { one, two, zed } = context.sites;
  context.hubChange();
  const recorded = context.head(two);
  const result = context.all(one, 'bump');
  assertExit(result, EXIT.CHECKS);
  assert.match(result.output, /two: RED at the install/);
  assert.match(result.output, /two: shared:bump stopped with exit code 3/);
  assert.match(result.output, /Not touched: zed\./);
  assert.deepEqual(stepsOf(context, 'zed'), []);
  assert.equal(stateOf(context.fixture, zed), STATES.BEHIND);
  const undo = undoOf(result);
  assert.equal(undo, `cd ../two && git checkout -- package.json package-lock.json && git update-index -q --refresh && git reset --keep ${recorded.slice(0, 7)} && npm ci`);
  assert.equal(context.shell(one, undo).status, 0);
  assert.equal(context.head(two), recorded);
  assert.equal(context.changes(two), '');
});

test('bump: after a by-hand override the undo goes back through the package.json before it', (t) => {
  const major = '4.0.0';
  const context = allSites(t, { on: FROM, names: ['one'], scenario: { failBuildOn: major } });
  const { one } = context.sites;
  const older = context.fixture.git(['log', '-1', '--format=%h', '--', 'package.json'], one);
  const manifest = JSON.parse(context.readSite(one, 'package.json'));
  manifest.overrides = { 'docusaurus-plugin-sass': { '@docusaurus/core': `^${major}` } };
  context.fixture.commitToSite(one, { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` }, 'Add the override a major needs');
  const recorded = context.head(one);
  const result = context.all(one, 'bump', major, '--no-pin');
  assertExit(result, EXIT.CHECKS);
  const undo = undoOf(result);
  const install = `git show ${older}:package.json > package.json && npm ci && git checkout -- package.json`;
  assert.equal(undo, `cd ../one && git checkout -- package.json package-lock.json && ${install}`);
  assert.equal(context.shell(one, undo).status, 0);
  assert.equal(context.head(one), recorded);
  assert.equal(context.changes(one), '');
  assert.equal(JSON.parse(context.readSite(one, 'node_modules/@docusaurus/core/package.json')).version, FROM);
});

test('bump: a list to read stops the run with the commit kept, and the undo takes packages back', (t) => {
  const context = allSites(t, { on: FROM, scenario: { sites: { one: { compare: EXIT.TO_READ } } } });
  const { one, two } = context.sites;
  const recorded = context.head(one);
  const result = context.all(one, 'bump');
  assertExit(result, EXIT.TO_READ);
  assert.equal(context.subject(one), commitSubject(PIN));
  assert.deepEqual(stepsOf(context, 'two'), []);
  assert.match(result.output, /When the list reads fine: .*--only two,zed/);
  const undo = undoOf(result);
  assert.equal(undo, `cd ../one && git update-index -q --refresh && git reset --keep ${recorded.slice(0, 7)} && npm ci`);
  assert.equal(context.shell(one, undo).status, 0);
  assert.equal(context.head(one), recorded);
});

test('bump: a run started again skips the sites done and goes on, however it stopped', (t) => {
  const context = allSites(t, { on: FROM, scenario: { sites: { two: { verify: 'fail' } } } });
  const { one, two, zed } = context.sites;
  assertExit(context.all(one, 'bump'), EXIT.CHECKS);
  assert.equal(context.subject(one), commitSubject(PIN));
  context.shell(two, 'git checkout -- package.json package-lock.json && npm ci');
  context.setScenario({});
  const again = context.all(one, 'bump', '--skip', 'one');
  assertExit(again, EXIT.OK);
  assert.equal(context.subject(two), commitSubject(PIN));
  assert.equal(context.subject(zed), commitSubject(PIN));
  assert.equal(stepsOf(context, 'one').length, BUMP_PROOF.length);
});

test('bump: the old build is not the red one after an undo', (t) => {
  const context = allSites(t, { on: FROM, names: ['one'], scenario: { verify: 'fail' } });
  const { one } = context.sites;
  const red = context.all(one, 'bump');
  assertExit(red, EXIT.CHECKS);
  assert.equal(context.shell(path.dirname(one), `cd one && ${undoOf(red).replace('cd ../one && ', '')}`).status, 0);
  context.setScenario({});
  const again = context.all(one, 'bump');
  assertExit(again, EXIT.OK);
  assert.match(again.stdout, /there is no build\/, so it is built first/, 'the build that went red was set aside');
  assert.equal(context.compares().at(-1).beforePage, pageOf(FROM));
});

test('bump: the pin the hub holds wins over a site that has not pulled it', (t) => {
  const context = allSites(t, { names: ['one', 'two'] });
  const { one, two } = context.sites;
  assertExit(context.all(one, 'bump', NEXT, '--yes', '--only', 'one'), EXIT.OK);
  const later = context.all(two, 'bump');
  assertExit(later, EXIT.OK);
  assert.equal(context.subject(two), commitSubject(NEXT));
});

test('bump: a site without a lock or Docusaurus stops the run before any site moves', (t) => {
  const context = allSites(t, { names: ['one', 'two'], on: FROM });
  const { one, two } = context.sites;
  context.fixture.git(['rm', '-q', 'package-lock.json'], two);
  context.fixture.git(['commit', '-q', '-m', 'Drop the lock'], two);
  const before = context.head(one);
  const result = context.all(one, 'bump');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /there is no package-lock\.json/);
  assert.equal(context.head(one), before);
  assert.deepEqual(context.steps(), []);
});

test('bump: a hub pin that gives no version stops the run', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  context.fixture.commitToHub({ 'template/package.json': '{ "name": "broken" }\n' }, 'Break the template');
  const result = context.all(one, 'bump');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /the hub's pin gives no version/);
});

test('run: the script runs in each site, in order, and changes nothing', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  const before = everything(context);
  const result = context.all(two, 'run', 'shared:verify');
  assertExit(result, EXIT.OK);
  assert.deepEqual(context.steps(), ['two run shared:verify', 'one run shared:verify', 'zed run shared:verify']);
  assert.match(result.stdout, /Green: two, one, zed\./);
  assert.doesNotMatch(result.stdout, /To publish/);
  assert.deepEqual(everything(context), before);
  assert.ok(one);
});

test('run: a dirty tree does not stop it, a red stops it with the --only line', (t) => {
  const context = allSites(t, { scenario: { sites: { two: { verify: 'fail' } } } });
  const { one } = context.sites;
  writeFiles(one, { 'docs/intro.md': 'Changed.\n' });
  const result = context.all(one, 'run', 'shared:verify');
  assertExit(result, EXIT.CHECKS);
  assert.match(result.output, /two: RED at shared:verify: exit code 1/);
  assert.match(result.output, /a suite failed/);
  assert.match(result.output, /Nothing to undo in two\./);
  assert.match(result.output, /Not touched: zed\./);
  assert.match(lineWith(result.output, 'To carry on without two'), /--only zed$/);
  assert.deepEqual(stepsOf(context, 'zed'), []);
});

test('run: a site without the script stops the run with the --skip line', (t) => {
  const context = allSites(t);
  const { one, two } = context.sites;
  const manifest = JSON.parse(context.readSite(two, 'package.json'));
  manifest.scripts['only-here'] = 'node a.mjs';
  const others = JSON.parse(context.readSite(one, 'package.json'));
  others.scripts['only-here'] = 'node a.mjs';
  context.fixture.commitToSite(two, { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` }, 'Add a line');
  context.fixture.commitToSite(one, { 'package.json': `${JSON.stringify(others, null, 2)}\n` }, 'Add a line');
  const result = context.all(one, 'run', 'only-here');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /1 site of 3 cannot run/);
  assert.match(result.output, /package\.json has no only-here line/);
  assert.match(lineWith(result.output, 'go on without it'), /--skip zed$/);
  assert.deepEqual(context.steps(), []);
});

test('run: a script that serves is refused, by its name or by what it runs', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  assertExit(context.all(one, 'run', 'start'), EXIT.USAGE);
  const manifest = JSON.parse(context.readSite(one, 'package.json'));
  manifest.scripts.watch = 'docusaurus start --port 3000';
  context.fixture.commitToSite(one, { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` }, 'Add a line');
  const result = context.all(one, 'run', 'watch');
  assertExit(result, EXIT.REFUSED);
  assert.match(result.output, /serves until stopped/);
  assert.deepEqual(context.steps(), []);
});

test('nothing here runs a dev server, pushes a site or deploys', (t) => {
  const context = allSites(t, { on: FROM });
  const { one } = context.sites;
  context.hubChange();
  assertExit(context.all(one, 'bump'), EXIT.OK);
  for (const { args } of context.calls()) {
    assert.notEqual(args[0], 'start');
    assert.notEqual(args[1], 'start');
    assert.notEqual(args[0], 'deploy');
    assert.notEqual(args[1], 'deploy');
  }
  const files = fs.readdirSync(path.join(SCRIPTS_FOLDER, 'lib')).filter((name) => name.startsWith('all'));
  for (const file of [...files.map((name) => path.join('lib', name)), 'all.mjs']) {
    const text = fs.readFileSync(path.join(SCRIPTS_FOLDER, file), 'utf8');
    assert.doesNotMatch(text, /\['push'|\['deploy'|'netlify'/, file);
    assert.doesNotMatch(text, /\b20\d\d-\d\d-\d\d\b/, file);
  }
});

test('the state a run leaves reads the same through the state reader', (t) => {
  const context = allSites(t, { names: ['one'] });
  const { one } = context.sites;
  context.hubChange();
  assertExit(context.all(one, 'pull'), EXIT.OK);
  const { state, leaks, outgoing } = readState(one, { env: context.env });
  assert.equal(state, STATES.IN_SYNC);
  assert.deepEqual(leaks, []);
  assert.deepEqual(outgoing, []);
});
