/**
 * bump.test.mjs: `shared:bump` from end to end, on real git, with stand-ins for npm and the compare
 * (bumpFixture.mjs says what each can be told to do). What it holds:
 *   - The green path commits the two files alone, and a list to read commits and exits 8.
 *   - A site on the version is skipped, and a red run's leftovers do not read as "on the version".
 *   - Every refusal stops before anything changes.
 *   - Both builds are the same shape, the old one sits outside the repository, and a build of another
 *     shape or an older one is not used.
 *   - A failed install stops with nothing built and an undo that works. Install flags cannot force it.
 *   - A commit that holds a by-hand override gets an undo that works there too, and the override a major
 *     needs is named from the manifest and from the lock's peer ranges.
 *   - node_modules off package.json refuses before an old side is built.
 *   - Two versions left behind, and any @mui/x-* entry that moved, are red before a build.
 *   - A failed build, a failed or hung suite and a red compare commit nothing and print the undo.
 *   - A red at the build, the suites or the compare leaves no build in build/, and a red leaves a record that
 *     shared:status reads until the bump that commits clears it.
 *   - Nothing here runs a dev server, pushes or deploys, and the script holds no date.
 *
 * HOW TO CHANGE IT
 *   A new step or refusal: a test here. The real npm and the real compare are proved by hand on copies
 *   of real sites, because they need a network and a browser.
 * Run with `npm run test:shared -- --scripts`, or `node --test "scripts/__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../bump.mjs';
import { COMPARE_SCRIPT_ENV, commitSubject } from '../lib/bumpSettings.mjs';
import { deployLine } from '../lib/deployLine.mjs';
import { LOCK_WAIT_SECONDS } from '../lib/compareSettings.mjs';
import { EXIT } from '../lib/exitCodes.mjs';
import { compareLimitSeconds } from '../lib/siteGate.mjs';
import {
  FROM, MINIFIED_PAGE, MUI_KEY, MUI_X_KEY, PIN, bumpSite, installFromLock, isRunning, lineStarting, lockOn, pageOf, siteFiles, stopGently,
  waitFor, waitForPidFile,
} from './bumpFixture.mjs';

/** Every call of the stand-in compare in this fixture, in order. */
function readCompareCalls(context) {
  const file = path.join(context.base, 'compare-calls.jsonl');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}

/** How long a bump may take to reach its install, which a stand-in holds: about 2 s quiet. */
const INSTALL_REACHED_MS = 60_000;
import { assertLine, startServer, writeFiles } from './fixture.mjs';

const SCRIPTS_FOLDER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BUMP_FILES = [
  'bump.mjs', 'lib/bumpBuild.mjs', 'lib/bumpLock.mjs', 'lib/bumpRun.mjs', 'lib/bumpSettings.mjs', 'lib/bumpUndo.mjs',
  'lib/deployLine.mjs', 'lib/siteGate.mjs',
];
const NEXT = '3.11.0';
const MAJOR = '4.0.0';
const CHECKOUT = 'git checkout -- package.json package-lock.json';
const UNDO_RED = `Undo: ${CHECKOUT} && npm ci`;
const FAST_TIMEOUT = ['--verify-timeout', '1'];

const OFF_MANIFEST = /node_modules does not match package\.json/;

const npmWords = ({ args }) => args.join(' ');
const buildCalls = (calls) => calls.filter(({ args }) => args[1] === 'build');
const isCommitted = ({ log }) => log()[0] === commitSubject(NEXT);

/** Asserts a red run: exit 3, the reason, the undo, no commit. */
function assertRed(context, report, reason) {
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assert.match(report.stderr, reason);
  assert.ok(report.stderr.includes(UNDO_RED), report.output);
  assert.equal(isCommitted(context), false);
}

/** The version node_modules holds. */
const installedCore = ({ readSite }) => JSON.parse(readSite('node_modules/@docusaurus/core/package.json')).version;

/** The printed line after `label`. */
const lineAfter = (text, label) => lineStarting(text, label).replace(label, '');

/**
 * Commits a by-hand override at `version` under the site's old entries, as a major asks for. Returns the last
 * commit whose package.json npm could still read.
 */
function commitOverride({ fixture, site, readSite, freshen }, { version = MAJOR, extra = {} } = {}) {
  const manifest = JSON.parse(readSite('package.json'));
  const before = fixture.git(['log', '-1', '--format=%h', '--', 'package.json'], site);
  manifest.overrides = { 'docusaurus-plugin-sass': { '@docusaurus/core': `^${version}` } };
  Object.assign(manifest.dependencies, extra);
  fixture.commitToSite(site, { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` }, 'Add the override a major needs');
  freshen();
  return before;
}

/** The steps that install from an older package.json, as an undo prints them. */
const throughOlder = (sha) => `git show ${sha}:package.json > package.json && npm ci && git checkout -- package.json`;

/** Asserts that a refused run changed nothing. */
function assertRefused(context, report, reason) {
  assert.equal(report.status, EXIT.REFUSED, report.output);
  assert.match(report.stderr, reason);
  assert.match(report.stderr, /Nothing was changed/);
  assert.deepEqual(context.calls(), []);
}

test('green: every step runs in order, and the commit holds the two files alone', (t) => {
  const context = bumpSite(t);
  const { bump, calls, site, fixture, readSite, changed } = context;
  const before = context.head();
  const report = bump(NEXT);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.deepEqual(calls().map(npmWords), [
    'install --no-audit --no-fund --no-force --no-legacy-peer-deps',
    'run build',
    'run shared:verify',
  ]);
  assert.equal(context.log()[0], `Bump Docusaurus to ${NEXT}`);
  assert.equal(fixture.git(['rev-list', '--count', `${before}..HEAD`], site), '1');
  assert.equal(fixture.git(['show', '--format=', '--name-only', 'HEAD'], site), 'package-lock.json\npackage.json');
  assert.equal(changed(), '');
  const manifest = JSON.parse(readSite('package.json'));
  assert.equal(manifest.dependencies['@docusaurus/core'], NEXT);
  assert.equal(manifest.devDependencies['@docusaurus/types'], NEXT);
  assert.equal(readSite('build/index.html'), pageOf(NEXT));
});

test('green: the last lines give the undo for that commit and the line that publishes the tested build', (t) => {
  const { bump, shell, head, changed, readSite } = bumpSite(t);
  const before = head();
  const { stdout } = bump(NEXT);
  const undo = lineStarting(stdout, 'Undo: ').replace('Undo: ', '');
  assert.equal(undo, `git reset --keep ${before.slice(0, 7)} && npm ci`);
  assert.equal(lineStarting(stdout, 'Next: '), 'Next: git push && netlify deploy --prod --no-build');
  assert.equal(shell(undo).status, 0);
  assert.equal(head(), before);
  assert.equal(changed(), '');
  assert.equal(JSON.parse(readSite('node_modules/@docusaurus/core/package.json')).version, FROM);
});

test('the report names each step, and the npm output stays in the logs', (t) => {
  const { bump, keep } = bumpSite(t);
  const { stdout } = bump(NEXT);
  assert.match(lineStarting(stdout, 'one: '), new RegExp(`@docusaurus ${FROM} -> ${NEXT}\\. The old build and the logs: ${keep}`));
  assert.match(stdout, /^files +package\.json entries rewritten: 3, lock entries cut: 4$/m);
  assert.match(stdout, new RegExp(`^version +one @docusaurus version, ${NEXT}$`, 'm'));
  assert.match(stdout, /^mui +@mui lock entries moved: 0$/m);
  assert.match(stdout, /^verify +ok, shared:verify, \d+ s$/m);
  assert.match(stdout, new RegExp(`^commit +[0-9a-f]{7} Bump Docusaurus to ${NEXT}$`, 'm'));
  assert.ok(fs.existsSync(path.join(keep, 'logs', 'install.log')));
  assert.ok(fs.existsSync(path.join(keep, 'logs', 'build.log')));
  assert.ok(fs.existsSync(path.join(keep, 'logs', 'verify.log')));
  assert.ok(fs.existsSync(path.join(keep, 'logs', 'compare.log')));
});

test('with no version it moves to the pin', (t) => {
  const context = bumpSite(t);
  const report = context.bump();
  assert.equal(report.status, EXIT.OK, report.output);
  assert.equal(context.log()[0], commitSubject(PIN));
  assert.doesNotMatch(report.stdout, /^pin /m);
});

test('a version other than the pin wins, and says the pin differs', (t) => {
  const { bump, log } = bumpSite(t);
  const report = bump(NEXT);
  assert.equal(log()[0], commitSubject(NEXT));
  assert.match(report.stdout, new RegExp(`^pin +the pin says ${PIN}, and this run moves to ${NEXT}$`, 'm'));
});

test('a step down works the same way', (t) => {
  const context = bumpSite(t);
  const report = context.bump('3.8.1');
  assert.equal(report.status, EXIT.OK, report.output);
  assert.equal(context.log()[0], commitSubject('3.8.1'));
});

/** Gives the site's shared/requirements.cjs @docusaurus ranges, as a hub that asks for a newer Docusaurus does. */
function askForDocusaurus({ fixture, site, readSite, freshen }, range) {
  const ranged = `RANGES: { '@docusaurus/core': '${range}', '@docusaurus/theme-common': '${range}', `;
  const text = readSite('shared/requirements.cjs').replace('RANGES: { ', ranged);
  fixture.commitToSite(site, { 'shared/requirements.cjs': text }, 'Ask for a newer Docusaurus');
  freshen();
}

test('a version the requirements\' ranges rule out refuses before anything moves, and names the newest inside', (t) => {
  const context = bumpSite(t, { versions: ['3.9.2', '3.10.2', '3.11.0', '3.12.0-canary.1', '4.0.0'] });
  askForDocusaurus(context, '^3.10.2');
  const report = context.bump('3.9.0');
  assert.equal(report.status, EXIT.REFUSED, report.output);
  const reason = 'Docusaurus 3.9.0 is outside what shared/requirements.cjs asks: ^3.10.2 of @docusaurus/core and '
    + '@docusaurus/theme-common, so shared:verify would fail on it. The newest version npm has inside ^3.10.2 is 3.11.0.';
  assert.ok(report.stderr.includes(reason), report.output);
  assert.match(report.stderr, /Fix: name a version inside it, or change the range in shared\/requirements\.cjs and push that first/);
  assert.match(report.stderr, /Nothing was changed/);
  assert.deepEqual(context.calls().map(npmWords), ['view @docusaurus/core versions --json --fetch-retries=0']);
  assert.equal(context.changed(), '');
  const inside = context.bump(NEXT);
  assert.equal(inside.status, EXIT.OK, inside.output);
  assert.equal(context.calls().filter(({ args }) => args[2] === 'versions').length, 1, 'npm is asked only for a refused version');
});

test('a v in front of a version is dropped', (t) => {
  const context = bumpSite(t);
  context.bump(`v${NEXT}`);
  assert.equal(JSON.parse(context.readSite('package.json')).dependencies['@docusaurus/core'], NEXT);
});

test('a site already on the version is skipped: no step, no commit, and a run can start again', (t) => {
  const context = bumpSite(t);
  context.bump(NEXT);
  const callsBefore = context.calls().length;
  const head = context.head();
  const report = context.bump(NEXT, '--keep', path.join(context.base, 'second'));
  assert.equal(report.status, EXIT.OK, report.output);
  assert.equal(report.stdout, `one: already on @docusaurus ${NEXT}, nothing to do.\n`);
  assert.equal(context.calls().length, callsBefore);
  assert.equal(context.head(), head);
});

test('a skip does not care about another changed file', (t) => {
  const context = bumpSite(t);
  context.bump(NEXT);
  writeFiles(context.site, { 'docs/intro.md': 'Being edited.\n' });
  const report = context.bump(NEXT, '--keep', path.join(context.base, 'second'));
  assert.equal(report.status, EXIT.OK, report.output);
  assert.match(report.stdout, /already on/);
});

test('the leftovers of a red run are not "already on the version"', (t) => {
  const context = bumpSite(t, { verify: 'fail' });
  context.bump(NEXT);
  const report = context.bump(NEXT, '--keep', path.join(context.base, 'second'));
  assert.equal(report.status, EXIT.REFUSED, report.output);
  assert.match(report.stderr, /2 changed tracked files/);
  assert.ok(report.stderr.includes('git checkout -- package.json package-lock.json && npm ci'));
});

test('a changed tracked file refuses, before anything moves', (t) => {
  const context = bumpSite(t);
  writeFiles(context.site, { 'docs/intro.md': 'Being edited.\n' });
  const manifest = context.readSite('package.json');
  assertRefused(context, context.bump(NEXT), /1 changed tracked file/);
  assert.equal(context.readSite('package.json'), manifest);
  assert.equal(fs.existsSync(context.keep), false);
});

test('a staged change refuses too', (t) => {
  const context = bumpSite(t);
  writeFiles(context.site, { 'docs/new.md': 'New.\n' });
  context.fixture.git(['add', 'docs/new.md'], context.site);
  assertRefused(context, context.bump(NEXT), /1 changed tracked file/);
});

test('a server running from the checkout refuses, and is left running', async (t) => {
  const context = bumpSite(t);
  const server = await startServer(t, context.site);
  assertRefused(context, await context.bumpAsync(NEXT), /a server is running from this checkout/);
  assert.equal(server.exitCode, null);
});

test('a detached HEAD refuses', (t) => {
  const context = bumpSite(t);
  context.fixture.git(['checkout', '-q', '--detach'], context.site);
  assertRefused(context, context.bump(NEXT), /detached HEAD/);
});

test('a site without a lock refuses', (t) => {
  const context = bumpSite(t);
  context.fixture.git(['rm', '-q', 'package-lock.json'], context.site);
  context.fixture.git(['commit', '-q', '-m', 'Drop the lock'], context.site);
  assertRefused(context, context.bump(NEXT), /there is no package-lock\.json/);
});

test('a folder with no package.json refuses, and names the fix', (t) => {
  const context = bumpSite(t);
  context.fixture.git(['rm', '-q', 'package.json'], context.site);
  context.fixture.git(['commit', '-q', '-m', 'Drop the manifest'], context.site);
  assertRefused(context, context.bump(NEXT), /has no package\.json/);
});

test('a site with no Docusaurus entry refuses', (t) => {
  const context = bumpSite(t, {}, {
    files: siteFiles({ manifest: { name: 'x', dependencies: { react: '^19.0.0' } } }),
  });
  assertRefused(context, context.bump(NEXT), /lists no @docusaurus package/);
});

test('a keep folder inside the repository refuses, the old build must stay out of it', (t) => {
  const context = bumpSite(t);
  assertRefused(context, context.bump(NEXT, '--keep', 'kept'), /inside the repository/);
  assertRefused(context, context.bump(NEXT, '--keep', context.site), /inside the repository/);
});

test('a keep folder that already holds an old build refuses', (t) => {
  const context = bumpSite(t);
  writeFiles(context.keep, { 'before/index.html': 'x' });
  assertRefused(context, context.bump(NEXT), /exists\./);
});

/** The fixture's site with no comparePages. */
function siteFilesWithoutPages() {
  const manifest = JSON.parse(siteFiles()['package.json']);
  delete manifest.comparePages;
  return siteFiles({ manifest });
}

test('no pages to compare stops before anything moves', (t) => {
  const context = bumpSite(t, {}, { files: siteFilesWithoutPages() });
  const report = context.bump(NEXT);
  assert.equal(report.status, EXIT.USAGE, report.output);
  assert.match(report.stderr, /No pages to compare/);
  assert.deepEqual(context.calls(), []);
});

test('--pages stands in for comparePages and reaches the compare', (t) => {
  const context = bumpSite(t, {}, { files: siteFilesWithoutPages() });
  const report = context.bump(NEXT, '--pages', '/a/,/b/');
  assert.equal(report.status, EXIT.OK, report.output);
  assert.deepEqual(context.compareCall().args.slice(-2), ['--pages', '/a/,/b/']);
});

test('a missing compare tool stops before anything moves', (t) => {
  const context = bumpSite(t);
  const env = { ...context.env, DOCUSAURUS_SHARED_CACHE: path.join(context.base, 'empty-cache') };
  delete env[COMPARE_SCRIPT_ENV];
  const report = context.bumpIn(context.site, env, NEXT);
  assert.equal(report.status, EXIT.REFUSED, report.output);
  assert.match(report.stderr, /needs puppeteer-core/);
  assert.deepEqual(context.calls(), []);
});

test('a worktree may bump, which is how a change is tried away from the main checkout', (t) => {
  const context = bumpSite(t);
  const tree = path.join(context.base, 'tree');
  context.fixture.git(['worktree', 'add', '-q', '-b', 'try', tree], context.site);
  installFromLock(tree);
  writeFiles(tree, { 'build/index.html': pageOf(FROM) });
  const report = context.bumpIn(tree, context.env, NEXT);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.equal(context.fixture.git(['log', '-1', '--format=%s'], tree), commitSubject(NEXT));
  assert.notEqual(context.log()[0], commitSubject(NEXT));
});

test('the old build is kept outside the repository, and the compare reads it against build/', (t) => {
  const context = bumpSite(t);
  context.bump(NEXT);
  const { args, beforePage, cwd } = context.compareCall();
  assert.equal(args[args.indexOf('--before') + 1], path.join(context.keep, 'before'));
  assert.equal(args[args.indexOf('--after') + 1], 'build');
  assert.equal(args[args.indexOf('--out') + 1], path.join(context.keep, 'compare'));
  assert.equal(fs.realpathSync(cwd), fs.realpathSync(context.site));
  assert.equal(beforePage, pageOf(FROM));
  assert.equal(fs.readFileSync(path.join(context.keep, 'before', 'index.html'), 'utf8'), pageOf(FROM));
});

test('with no --keep it uses a new temp folder, named in the first line', (t) => {
  const context = bumpSite(t);
  const report = context.bumpNoKeep({ ...context.env, TMPDIR: context.base }, NEXT);
  assert.equal(report.status, EXIT.OK, report.output);
  const folder = lineStarting(report.stdout, 'one: ').split('logs: ')[1];
  assert.match(path.relative(context.base, folder), /^docusaurus-shared-bump\/one-\d{14}-\d+$/);
  assert.equal(fs.readFileSync(path.join(folder, 'before', 'index.html'), 'utf8'), pageOf(FROM));
});

test('a current build of the right shape stands in: the only build is the cold one after the install', (t) => {
  const context = bumpSite(t);
  const report = context.bump(NEXT);
  assert.equal(buildCalls(context.calls()).length, 1);
  assert.deepEqual(context.calls().map(npmWords).slice(0, 2), [
    'install --no-audit --no-fund --no-force --no-legacy-peer-deps', 'run build',
  ]);
  assert.match(report.stdout, /^before +kept outside the repository, as it was$/m);
});

for (const [name, change, reason] of [
  ['no build at all', ({ site }) => fs.rmSync(path.join(site, 'build'), { recursive: true }), /there is no build/],
  ['a build older than the last commit', ({ site }) => {
    const earlier = new Date(Date.now() - 3_600_000);
    fs.utimesSync(path.join(site, 'build/index.html'), earlier, earlier);
  }, /older than the last commit/],
  ['a minified build', ({ site, freshen }) => {
    writeFiles(site, { 'build/index.html': MINIFIED_PAGE });
    freshen();
  }, /another shape/],
]) {
  test(`${name} is rebuilt first, the same way as the new one`, (t) => {
    const context = bumpSite(t);
    change(context);
    const report = context.bump(NEXT);
    assert.equal(report.status, EXIT.OK, report.output);
    assert.match(report.stdout, reason);
    assert.match(report.stdout, /^before +kept outside the repository, built just now$/m);
    const builds = buildCalls(context.calls());
    assert.equal(builds.length, 2);
    assert.equal(npmWords(context.calls()[0]), 'run build', 'the old side comes before the install');
    assert.equal(context.compareCall().beforePage, pageOf(FROM));
    assert.deepEqual(builds[0].shape, builds[1].shape);
  });
}

for (const [name, outside] of [['unset', undefined], ['false', 'false']]) {
  test(`both builds carry the shape whatever the caller set: ${name}`, (t) => {
    const context = bumpSite(t);
    fs.rmSync(path.join(context.site, 'build'), { recursive: true });
    const env = { ...context.env };
    if (outside === undefined) delete env.SKIP_HTML_MINIFICATION;
    else env.SKIP_HTML_MINIFICATION = outside;
    context.bumpIn(context.site, env, NEXT);
    assert.deepEqual(buildCalls(context.calls()).map(({ shape }) => shape), ['true', 'true']);
  });
}

test('both builds start cold, with no cache and no old output', (t) => {
  const context = bumpSite(t);
  writeFiles(context.site, {
    '.docusaurus/stale.txt': 'x',
    'node_modules/.cache/stale.txt': 'x',
    'build/stale.txt': 'x',
  });
  context.bump(NEXT);
  assert.equal(fs.existsSync(path.join(context.site, '.docusaurus/stale.txt')), false);
  assert.equal(fs.existsSync(path.join(context.site, 'node_modules/.cache/stale.txt')), false);
  assert.equal(fs.existsSync(path.join(context.site, 'build/stale.txt')), false);
});

test('the build before the bump failing is red with nothing changed', (t) => {
  const context = bumpSite(t, { failBuildOn: FROM });
  fs.rmSync(path.join(context.site, 'build'), { recursive: true });
  const manifest = context.readSite('package.json');
  const report = context.bump(NEXT);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assert.match(report.stderr, /RED at the build before the bump/);
  assert.match(report.stderr, /Nothing was changed\./);
  assert.ok(!report.stderr.includes('Undo:'), report.output);
  assert.equal(context.readSite('package.json'), manifest);
  assert.equal(context.changed(), '');
});

test('a build before the bump that leaves no page is red with nothing changed', (t) => {
  const context = bumpSite(t, { build: 'empty' });
  fs.rmSync(path.join(context.site, 'build'), { recursive: true });
  const report = context.bump(NEXT);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assert.match(report.stderr, /RED at the build before the bump: it exited 0 and left no build\//);
  assert.match(report.stderr, /Nothing was changed\./);
  assert.equal(context.changed(), '');
});

test('npm install sees the entries gone from the lock and node_modules, and the manifest rewritten', (t) => {
  const context = bumpSite(t);
  context.bump(NEXT);
  const saw = context.installSaw();
  assert.deepEqual(saw.lockKeys, ['node_modules/@docusaurus/responsive-loader']);
  assert.equal(saw.coreFolder, false);
  assert.equal(saw.hiddenLock, false);
  assert.equal(saw.manifest.dependencies['@docusaurus/preset-classic'], NEXT);
  assert.equal(saw.manifest.dependencies['@docusaurus/responsive-loader'], '1.7.0');
});

test('ERESOLVE stops the run with nothing built, build/ as it was, and an undo that works', (t) => {
  const context = bumpSite(t, { install: 'eresolve' });
  const page = context.readSite('build/index.html');
  const report = context.bump(NEXT);
  assertRed(context, report, /RED at the install: exit code 1\. Nothing was built\./);
  assert.match(report.stderr, /npm error code ERESOLVE/);
  assert.equal(buildCalls(context.calls()).length, 0);
  assert.equal(context.readSite('build/index.html'), page);
  assert.deepEqual(context.calls().map(npmWords), ['install --no-audit --no-fund --no-force --no-legacy-peer-deps']);
  assert.equal(fs.existsSync(path.join(context.base, 'compare-call.json')), false);
  const undo = lineStarting(report.stderr, 'Undo: ').replace('Undo: ', '');
  assert.equal(context.shell(undo).status, 0);
  assert.equal(context.changed(), '');
  assert.equal(JSON.parse(context.readSite('node_modules/@docusaurus/core/package.json')).version, FROM);
});

test('a site with an .npmrc that forces cannot slip past: the install turns both settings off', (t) => {
  const context = bumpSite(t);
  context.bump(NEXT);
  const words = npmWords(context.calls()[0]).split(' ');
  assert.ok(words.includes('--no-force') && words.includes('--no-legacy-peer-deps'));
  assert.ok(!words.includes('--force') && !words.includes('--legacy-peer-deps'));
});

test('two versions in the lock after the install are red, with nothing built', (t) => {
  const context = bumpSite(t, { lockEdits: { 'node_modules/a/node_modules/@docusaurus/utils': FROM } });
  assertRed(context, context.bump(NEXT), new RegExp(`the lock holds ${NEXT}, ${FROM}, not ${NEXT} alone\\. Nothing was built\\.`));
  assert.equal(buildCalls(context.calls()).length, 0);
});

test('a lock that left the version behind is red too', (t) => {
  const context = bumpSite(t, {
    lockEdits: {
      'node_modules/@docusaurus/core': FROM, 'node_modules/@docusaurus/preset-classic': FROM, 'node_modules/@docusaurus/types': FROM,
    },
  });
  assertRed(context, context.bump(NEXT), new RegExp(`the lock holds ${FROM}, not ${NEXT} alone`));
});

test('node_modules off the lock is red, with the package named', (t) => {
  const context = bumpSite(t, { diskEdits: { '@docusaurus/core': FROM } });
  assertRed(context, context.bump(NEXT), new RegExp(`node_modules disagrees with the lock: @docusaurus/core is ${FROM}`));
  assert.equal(buildCalls(context.calls()).length, 0);
});

test('an @mui entry that moved is counted and named, and is not red', (t) => {
  const context = bumpSite(t, { lockEdits: { [MUI_KEY]: '9.5.0' } });
  const report = context.bump(NEXT);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.match(report.stdout, /^mui +@mui lock entries moved: 1$/m);
  assert.match(report.stdout, /^mui +@mui\/material 9\.4\.0 -> 9\.5\.0$/m);
});

for (const [name, edits, reason] of [
  ['moved', { [MUI_X_KEY]: '9.17.0' }, /no @mui\/x-\* lock entry may move: @mui\/x-internals 9\.14\.0 -> 9\.17\.0\. Nothing was built\./],
  ['removed', { [MUI_X_KEY]: null }, /@mui\/x-internals 9\.14\.0 -> removed/],
  ['added', { 'node_modules/@mui/x-virtualizer': '0.7.2' }, /@mui\/x-virtualizer absent -> 0\.7\.2/],
]) {
  test(`an @mui/x-* entry ${name} is red, with nothing built`, (t) => {
    const context = bumpSite(t, { lockEdits: edits });
    assertRed(context, context.bump(NEXT), reason);
    assert.equal(buildCalls(context.calls()).length, 0);
  });
}

test('a failed build is red, and the suites and the compare never start', (t) => {
  const context = bumpSite(t, { build: 'fail' });
  const report = context.bump(NEXT);
  assertRed(context, report, /RED at the build: exit code 1/);
  assert.match(report.stderr, /the build broke/);
  assert.ok(report.stderr.includes(`The build as it was: ${path.join(context.keep, 'before')}`));
  assert.ok(!context.calls().some(({ args }) => args[1] === 'shared:verify'));
  assert.equal(fs.existsSync(path.join(context.base, 'compare-call.json')), false);
});

test('a build that exits 0 and leaves no page is red', (t) => {
  const context = bumpSite(t, { build: 'empty' });
  assertRed(context, context.bump(NEXT), /it exited 0 and left no build\//);
});

for (const [name, scenario] of [['suite', { verify: 'fail' }], ['compare', { compare: EXIT.CHECKS }]]) {
  test(`a red ${name} moves build/ beside the old build, so no deploy can send it`, (t) => {
    const context = bumpSite(t, scenario);
    const report = context.bump(NEXT);
    assert.equal(report.status, EXIT.CHECKS, report.output);
    assert.equal(fs.existsSync(path.join(context.site, 'build')), false);
    const aside = path.join(context.keep, 'red');
    assert.ok(report.stderr.includes(`The build that went red: ${aside}`), report.output);
    assert.equal(fs.readFileSync(path.join(aside, 'index.html'), 'utf8'), pageOf(NEXT));
  });
}

test('a red leaves a record: status fails with the undo, warns once it is undone, and the bump that commits clears it', (t) => {
  const context = bumpSite(t, { verify: 'fail' });
  const red = context.bump();
  assert.equal(red.status, EXIT.CHECKS, red.output);
  const held = assertLine(context.fixture.status(context.site, '--offline'), 'FAIL', 'red', /the bump to 3\.10\.2 went red here at shared:verify, and this site still holds its changes/);
  assert.ok(held.endsWith(`(fix: cd ../one && ${CHECKOUT} && npm ci)`), held);
  assert.equal(context.shell(`${CHECKOUT} && npm ci`).status, 0);
  const waiting = assertLine(context.fixture.status(context.site, '--offline'), 'warn', 'red', /was undone: this site stays on 3\.9\.2/);
  assert.ok(waiting.endsWith('(fix: fix the red here and commit it, then npm run shared:bump -- 3.10.2)'), waiting);
  context.setScenario({});
  assert.equal(context.bump('--keep', path.join(context.base, 'second')).status, EXIT.OK);
  assert.doesNotMatch(context.fixture.status(context.site, '--offline').stdout, /^\S+\s+red\s/m);
});

test('a --ports range that leaves one port is a usage error before anything moves', (t) => {
  const context = bumpSite(t);
  const report = context.bump(NEXT, '--ports', '6140-6140');
  assert.equal(report.status, EXIT.USAGE, report.output);
  assert.match(report.stderr, /--ports 6140-6140 leaves 1 port, 6140, and a compare serves its two builds at once, one port each\./);
  assert.deepEqual(context.calls(), []);
});

test('a failed suite is red, and the compare never starts', (t) => {
  const context = bumpSite(t, { verify: 'fail' });
  const report = context.bump(NEXT);
  assertRed(context, report, /RED at shared:verify: exit code 1/);
  assert.match(report.stderr, /a suite failed/);
  assert.equal(fs.existsSync(path.join(context.base, 'compare-call.json')), false);
});

for (const [name, verify] of [['a hung suite', 'hang'], ['a hung suite that ignores SIGTERM', 'stubborn']]) {
  test(`${name} reads red at the timeout, and leaves no process`, async (t) => {
    const context = bumpSite(t, { verify });
    const began = Date.now();
    const report = await context.bumpAsync(NEXT, ...FAST_TIMEOUT);
    assertRed(context, report, /RED at shared:verify: still running after 1 s, so it was stopped/);
    assert.ok(Date.now() - began < 20_000);
    assert.equal(fs.existsSync(path.join(context.base, 'compare-call.json')), false);
    assert.ok(await waitFor(() => !isRunning(context.hungPid())), 'the suite\'s child is gone');
  });
}

test('the default timeout is 900 seconds: a site\'s whole shared:verify took longer than 180 under load', async () => {
  const { VERIFY_TIMEOUT_SECONDS } = await import('../lib/bumpSettings.mjs');
  assert.equal(VERIFY_TIMEOUT_SECONDS, 900);
});

test('a site without shared:verify gets test:shared, and that reaches its real tests', (t) => {
  const manifest = JSON.parse(siteFiles()['package.json']);
  delete manifest.scripts['shared:verify'];
  const context = bumpSite(t, {}, { files: siteFiles({ manifest }) });
  const suite = "import test from 'node:test';\ntest('a real test ran', () => {});\n";
  context.fixture.commitToHub({ '__tests__/one.test.mjs': suite, 'scripts/__tests__/two.test.mjs': suite }, 'Add the suites');
  context.fixture.subtreePull(context.site);
  context.freshen();
  const report = context.bump(NEXT);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.match(report.stdout, /^verify +ok, test:shared, \d+ s$/m);
  assert.match(fs.readFileSync(path.join(context.keep, 'logs', 'verify.log'), 'utf8'), /a real test ran/);
});

test('a suite never inherits the test runner\'s own variable, which would make it run nothing', (t) => {
  const context = bumpSite(t);
  context.bumpIn(context.site, { ...context.env, NODE_TEST_CONTEXT: 'child-v8' }, NEXT);
  assert.ok(context.calls().every(({ nested }) => nested === null));
});

test('a list to read commits, and exits 8 so a caller can tell', (t) => {
  const context = bumpSite(t, { compare: EXIT.TO_READ, report: true });
  const report = context.bump(NEXT);
  assert.equal(report.status, EXIT.TO_READ, report.output);
  assert.equal(context.log()[0], commitSubject(NEXT));
  assert.match(report.stdout, /^compare +a list to read$/m);
  assert.match(report.stdout, /^Read the list above before you push\.$/m);
  assert.equal(context.changed(), '');
});

test('"0 changed" says nothing about reading', (t) => {
  const { bump } = bumpSite(t);
  assert.doesNotMatch(bump(NEXT).stdout, /Read the list/);
});

test('without a report the compare\'s log stands in', (t) => {
  const { bump } = bumpSite(t);
  assert.match(bump(NEXT).stdout, /^compare +the end of the compare log$/m);
});

for (const code of [EXIT.CHECKS, EXIT.REFUSED, EXIT.USAGE, EXIT.UNEXPECTED]) {
  test(`a compare that exits ${code} is red: only 0 and 8 commit`, (t) => {
    const context = bumpSite(t, { compare: code });
    assertRed(context, context.bump(NEXT), new RegExp(`RED at the compare: exit code ${code}`));
  });
}

test('a compare that refused before it compared, a lock still held or a port taken, is tried once more', (t) => {
  const context = bumpSite(t, { compareFirst: EXIT.REFUSED });
  const report = context.bump(NEXT);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.match(report.stdout, /^compare +it refused before it compared: once more$/m);
  assert.equal(readCompareCalls(context).length, 2);
});

test('a compare whose every red view ran out of time is tried once more, and a page that broke is red at once', (t) => {
  const slow = bumpSite(t, { compareFirst: EXIT.CHECKS, firstReport: 'timeouts' });
  const again = slow.bump(NEXT);
  assert.equal(again.status, EXIT.OK, again.output);
  assert.match(again.stdout, /^compare +every view it failed ran out of time: once more$/m);
  const broken = bumpSite(t, { compareFirst: EXIT.CHECKS, firstReport: 'broken' });
  assertRed(broken, broken.bump(NEXT), /RED at the compare: exit code 3/);
  assert.equal(readCompareCalls(broken).length, 1);
});

test('the compare step has a limit: its lock wait, then a minute for each load it plans', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-limit-'));
  try {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ comparePages: ['/', '/a/'] }));
    assert.equal(compareLimitSeconds({ root, lockWait: '60' }), 60 + 2 * 2 * 2 * 2 * 60);
    assert.equal(compareLimitSeconds({ root, pages: '/', lockWait: undefined }), LOCK_WAIT_SECONDS + 8 * 60);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a tracked file changed by a step stops the commit', (t) => {
  const context = bumpSite(t, { build: 'touch' });
  assertRed(context, context.bump(NEXT), /a step changed docs\/intro\.md, so nothing was committed/);
});

test('a commit that fails exits 5 with the undo', (t) => {
  const context = bumpSite(t);
  writeFiles(context.site, { '.git/hooks/pre-commit': '#!/bin/sh\necho refused by a hook >&2\nexit 1\n' });
  fs.chmodSync(path.join(context.site, '.git/hooks/pre-commit'), 0o755);
  const report = context.bump(NEXT);
  assert.equal(report.status, EXIT.GIT, report.output);
  assert.match(report.stderr, /refused by a hook/);
  assert.ok(report.stderr.includes(UNDO_RED));
});

test('a signal stops the running step and prints the undo', async (t) => {
  const context = bumpSite(t, { install: 'hang' });
  const script = path.join(SCRIPTS_FOLDER, 'bump.mjs');
  const child = spawn(process.execPath, [script, NEXT, '--keep', context.keep], { cwd: context.site, env: context.env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => stopGently(child));
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (text) => { stderr += text; });
  child.stdout.resume();
  await waitForPidFile(child, path.join(context.base, 'hung.pid'), () => stderr, INSTALL_REACHED_MS);
  child.kill('SIGTERM');
  const code = await new Promise((resolve) => { child.on('close', resolve); });
  assert.equal(code, 143);
  assert.match(stderr, /stopped by SIGTERM/);
  assert.ok(stderr.includes(UNDO_RED));
  assert.ok(await waitFor(() => !isRunning(context.hungPid())), 'the step\'s child is gone');
  assert.equal(buildCalls(context.calls()).length, 0);
});

test('a by-hand override in the last commit: the undo of a red installs through the package.json before it', (t) => {
  const context = bumpSite(t, { failBuildOn: MAJOR });
  const before = commitOverride(context);
  const head = context.head();
  const report = context.bump(MAJOR);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assert.equal(installedCore(context), MAJOR);
  const undo = lineAfter(report.stderr, 'Undo: ');
  assert.equal(undo, `${CHECKOUT} && ${throughOlder(before)}`);
  assert.equal(context.shell(undo).status, 0);
  assert.equal(installedCore(context), FROM);
  assert.equal(context.changed(), '');
  assert.equal(context.head(), head);
});

test('a by-hand override: the plain undo stops at ERESOLVE, and the next run refuses with the line that works', (t) => {
  const context = bumpSite(t, { failBuildOn: MAJOR });
  const before = commitOverride(context);
  context.bump(MAJOR);
  assert.notEqual(context.shell(`${CHECKOUT} && npm ci`).status, 0);
  assert.equal(installedCore(context), MAJOR, 'the failed npm ci left the new version');
  const builds = buildCalls(context.calls()).length;
  const report = context.bump(MAJOR, '--keep', path.join(context.base, 'second'));
  assert.equal(report.status, EXIT.REFUSED, report.output);
  assert.match(report.stderr, OFF_MANIFEST);
  assert.match(report.stderr, new RegExp(`@docusaurus/core: package\\.json ${FROM}, node_modules ${MAJOR}`));
  assert.match(report.stderr, /Nothing was changed/);
  assert.equal(buildCalls(context.calls()).length, builds, 'no old side was built');
  const fix = lineAfter(report.stderr, 'Fix: ');
  assert.equal(fix, throughOlder(before));
  assert.equal(context.shell(fix).status, 0);
  assert.equal(installedCore(context), FROM);
  assert.equal(context.changed(), '');
});

test('a by-hand override: the undo of a green bump goes back the same way', (t) => {
  const context = bumpSite(t);
  const before = commitOverride(context);
  const head = context.head();
  const { stdout } = context.bump(MAJOR);
  const undo = lineAfter(stdout, 'Undo: ');
  assert.equal(undo, `git reset --keep ${head.slice(0, 7)} && ${throughOlder(before)}`);
  assert.equal(context.shell(undo).status, 0);
  assert.equal(context.head(), head);
  assert.equal(context.changed(), '');
  assert.equal(installedCore(context), FROM);
});

test('two override commits: the undo reaches past both, and a commit between them that keeps the entries counts', (t) => {
  const context = bumpSite(t, { failBuildOn: MAJOR });
  const before = commitOverride(context);
  const manifest = JSON.parse(context.readSite('package.json'));
  manifest.overrides['docusaurus-plugin-image-zoom'] = { '@docusaurus/theme-classic': `^${MAJOR}` };
  manifest.scripts.lint = 'node lint.mjs';
  context.fixture.commitToSite(context.site, { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` }, 'Add another override');
  context.freshen();
  const undo = lineAfter(context.bump(MAJOR).stderr, 'Undo: ');
  assert.equal(undo, `${CHECKOUT} && ${throughOlder(before)}`);
  assert.equal(context.shell(undo).status, 0);
  assert.equal(installedCore(context), FROM);
});

test('a by-hand override: the refusal on a changed tree prints the same undo', (t) => {
  const context = bumpSite(t);
  const before = commitOverride(context);
  writeFiles(context.site, { 'docs/intro.md': 'Changed.\n' });
  const report = context.bump(MAJOR);
  assert.equal(report.status, EXIT.REFUSED, report.output);
  assert.ok(report.stderr.includes(`if a red run left them: ${CHECKOUT} && ${throughOlder(before)}`), report.output);
});

test('an older package.json that lists other packages would not fit the lock, so the undo says what to take out', (t) => {
  const context = bumpSite(t, { failBuildOn: MAJOR });
  commitOverride(context, { extra: { added: '^1.0.0' } });
  const undo = lineAfter(context.bump(MAJOR).stderr, 'Undo: ');
  const line = 'take overrides > docusaurus-plugin-sass > @docusaurus/core out of package.json by hand';
  assert.equal(undo, `${CHECKOUT} && ${line} && npm ci && git checkout -- package.json`);
});

test('an override as old as the file: no commit to install from, so the undo says what to take out', (t) => {
  const manifest = JSON.parse(siteFiles()['package.json']);
  manifest.overrides = { 'docusaurus-plugin-sass': { '@docusaurus/core': `^${MAJOR}` } };
  const context = bumpSite(t, { failBuildOn: MAJOR }, { files: siteFiles({ manifest }) });
  assert.match(context.bump(MAJOR).stderr, /Undo: .* && take overrides > docusaurus-plugin-sass > @docusaurus\/core out of package\.json by hand/);
});

test('an override that lets the site\'s own version in changes nothing in the undo', (t) => {
  const manifest = JSON.parse(siteFiles()['package.json']);
  manifest.overrides = { 'docusaurus-plugin-image-zoom': { '@docusaurus/theme-classic': '^3.0.1' } };
  const context = bumpSite(t, { failBuildOn: NEXT }, { files: siteFiles({ manifest }) });
  assert.ok(context.bump(NEXT).stderr.includes(UNDO_RED));
});

test('node_modules off package.json refuses before an old side is built', (t) => {
  const context = bumpSite(t);
  writeFiles(context.site, { 'node_modules/@docusaurus/core/package.json': `{ "version": "${NEXT}" }\n` });
  const report = context.bump(MAJOR);
  assertRefused(context, report, OFF_MANIFEST);
  assert.equal(lineAfter(report.stderr, 'Fix: '), 'npm ci');
});

test('a package missing from node_modules refuses too, and --before needs no old side', (t) => {
  const context = bumpSite(t);
  fs.rmSync(path.join(context.site, 'node_modules/@docusaurus/types'), { recursive: true });
  const report = context.bump(NEXT);
  assertRefused(context, report, /@docusaurus\/types: package\.json 3\.9\.2, node_modules nothing/);
  const kept = path.join(context.base, 'kept');
  writeFiles(kept, { 'index.html': pageOf(FROM) });
  assert.equal(context.bump(NEXT, '--before', kept).status, EXIT.OK);
});

test('a range in package.json takes what it covers, so an older site is not refused', (t) => {
  const manifest = JSON.parse(siteFiles()['package.json']);
  manifest.dependencies['@docusaurus/core'] = `^${FROM}`;
  const context = bumpSite(t, {}, { files: siteFiles({ manifest }) });
  assert.equal(context.bump(NEXT).status, EXIT.OK);
});

test('a new major prints the override to change before the install', (t) => {
  const manifest = JSON.parse(siteFiles()['package.json']);
  manifest.overrides = { 'docusaurus-plugin-image-zoom': { '@docusaurus/theme-classic': '^3.0.1' } };
  const context = bumpSite(t, { install: 'eresolve' }, { files: siteFiles({ manifest }) });
  const report = context.bump('4.0.0');
  assert.match(report.stdout, /^by hand +overrides > docusaurus-plugin-image-zoom > @docusaurus\/theme-classic is \^3\.0\.1: change it to \^4\.0\.0$/m);
});

/** A site whose lock holds the two plugins a major stops at, the first with an override already. */
function siteWithPlugins(t, scenario) {
  const manifest = JSON.parse(siteFiles()['package.json']);
  manifest.overrides = { 'docusaurus-plugin-image-zoom': { '@docusaurus/theme-classic': '^3.0.1' } };
  const lock = lockOn(FROM);
  lock.packages['node_modules/docusaurus-plugin-image-zoom'] = { version: '2.0.0', peerDependencies: { '@docusaurus/theme-classic': '>=3.0.0' } };
  lock.packages['node_modules/docusaurus-plugin-sass'] = { version: '0.2.7', peerDependencies: { '@docusaurus/core': '^2.0.0-beta || ^3.0.0-alpha' } };
  return bumpSite(t, scenario, { files: siteFiles({ manifest, lock }) });
}

/** The by-hand lines of a report, in order. */
const byHandLines = ({ stdout }) => stdout.split('\n').filter((line) => line.startsWith('by hand'));

test('a new major names every override it needs, what only the lock knows included', (t) => {
  const context = siteWithPlugins(t, { install: 'eresolve' });
  assert.deepEqual(byHandLines(context.bump(MAJOR)), [
    `by hand  overrides > docusaurus-plugin-image-zoom > @docusaurus/theme-classic is ^3.0.1: change it to ^${MAJOR}`,
    `by hand  overrides > docusaurus-plugin-sass > @docusaurus/core is not set: add it at ^${MAJOR}, because docusaurus-plugin-sass 0.2.7 asks for ^2.0.0-beta || ^3.0.0-alpha`,
  ]);
});

test('a preview is read as npm reads it: the same two lines, and nothing twice', (t) => {
  const context = siteWithPlugins(t, { install: 'eresolve' });
  const canary = '4.0.0-canary-7002';
  const lines = byHandLines(context.bump(canary));
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.ok(lines[0].endsWith(`change it to ^${canary}`));
  assert.ok(lines[1].includes(`add it at ^${canary}`));
});

test('a step inside the major names no peer either', (t) => {
  const context = siteWithPlugins(t, {});
  assert.deepEqual(byHandLines(context.bump(NEXT)), []);
});

test('a step inside the major prints no override', (t) => {
  const manifest = JSON.parse(siteFiles()['package.json']);
  manifest.overrides = { 'docusaurus-plugin-image-zoom': { '@docusaurus/theme-classic': '^3.0.1' } };
  const context = bumpSite(t, {}, { files: siteFiles({ manifest }) });
  assert.doesNotMatch(context.bump(NEXT).stdout, /^by hand/m);
});

test('a dev server, a push and a deploy are never started', (t) => {
  const context = bumpSite(t);
  const hubTip = context.fixture.git(['rev-parse', 'main'], context.fixture.hub);
  context.bump(NEXT);
  assert.ok(!context.calls().some(({ args }) => args.includes('start')));
  assert.equal(context.fixture.git(['rev-parse', 'main'], context.fixture.hub), hubTip);
  for (const file of BUMP_FILES) {
    const text = fs.readFileSync(path.join(SCRIPTS_FOLDER, file), 'utf8');
    assert.doesNotMatch(text, /'start'|"start"/, file);
    assert.doesNotMatch(text, /\['push'/, file);
  }
});

test('no date sits in the script or its library', () => {
  for (const file of BUMP_FILES) {
    assert.doesNotMatch(fs.readFileSync(path.join(SCRIPTS_FOLDER, file), 'utf8'), /\b20\d\d-\d\d-\d\d\b/, file);
  }
});

test('the install never carries a forcing word in the code either', () => {
  for (const file of BUMP_FILES) {
    const text = fs.readFileSync(path.join(SCRIPTS_FOLDER, file), 'utf8');
    assert.doesNotMatch(text, /'--force'|'--legacy-peer-deps'/, file);
  }
});

test('a package file or shared/ newer than the build means the build does not stand in', (t) => {
  for (const file of ['package-lock.json', 'shared/css/custom.scss']) {
    const context = bumpSite(t);
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(context.site, file), later, later);
    const report = context.bump(NEXT);
    assert.equal(report.status, EXIT.OK, report.output);
    assert.match(report.stdout, /changed after build\/ was made, so it is built first/);
    assert.equal(buildCalls(context.calls()).length, 2);
  }
});

test('--before uses a build kept already, builds no old side and copies nothing', (t) => {
  const context = bumpSite(t);
  const { base, site } = context;
  const kept = path.join(base, 'kept-build');
  writeFiles(kept, { 'index.html': pageOf('the kept build') });
  fs.rmSync(path.join(site, 'build'), { recursive: true });
  const report = context.bump(NEXT, '--before', kept);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.equal(buildCalls(context.calls()).length, 1);
  assert.equal(context.compareCall().beforePage, pageOf('the kept build'));
  assert.equal(fs.existsSync(path.join(context.keep, 'before')), false);
});

test('--before that holds no build is refused with nothing changed', (t) => {
  const context = bumpSite(t);
  const report = context.bump(NEXT, '--before', path.join(context.base, 'nothing-here'));
  assert.equal(report.status, EXIT.REFUSED, report.output);
  assert.match(report.output, /holds no build/);
  assert.equal(context.changed(), '');
  assert.deepEqual(context.calls(), []);
});

test('the options: a version, three values, and usage errors for the rest', () => {
  assert.deepEqual(parseArgs([]), {});
  assert.deepEqual(parseArgs(['3.11.0']), { version: '3.11.0' });
  assert.deepEqual(parseArgs(['4.0.0-canary-7002']), { version: '4.0.0-canary-7002' });
  assert.deepEqual(parseArgs(['--keep', '../k', '--pages', '/a/', '--verify-timeout', '9']), { keep: '../k', pages: '/a/', verifyTimeout: '9' });
  assert.deepEqual(parseArgs(['--ports', '4100-4109', '--lock-wait', '0']), { ports: '4100-4109', lockWait: '0' });
  assert.deepEqual(parseArgs(['--help']), { help: true });
  for (const argv of [['latest'], ['3.11'], ['1.0.0', '2.0.0'], ['--force'], ['--keep'], ['--keep', '--pages'], ['-x']]) {
    assert.throws(() => parseArgs(argv), (error) => error.code === EXIT.USAGE, argv.join(' '));
  }
});

test('--ports and --lock-wait reach the compare, and without them nothing is passed', (t) => {
  const context = bumpSite(t);
  context.bump(NEXT, '--ports', '4100-4109', '--lock-wait', '60');
  const { args } = context.compareCall();
  assert.deepEqual(args.slice(args.indexOf('--ports'), args.indexOf('--ports') + 2), ['--ports', '4100-4109']);
  assert.deepEqual(args.slice(args.indexOf('--lock-wait'), args.indexOf('--lock-wait') + 2), ['--lock-wait', '60']);
  const plain = bumpSite(t);
  plain.bump(NEXT);
  assert.equal(plain.compareCall().args.includes('--ports'), false);
  assert.equal(plain.compareCall().args.includes('--lock-wait'), false);
});

for (const [flag, value] of [['--ports', 'soon'], ['--ports', '4109-4100'], ['--lock-wait', 'soon']]) {
  test(`a bad compare option, ${flag} ${value}, is a usage error before anything moves`, (t) => {
    const context = bumpSite(t);
    const report = context.bump(NEXT, flag, value);
    assert.equal(report.status, EXIT.USAGE, report.output);
    assert.deepEqual(context.calls(), []);
  });
}

test('a bad timeout is a usage error before anything moves', (t) => {
  const context = bumpSite(t);
  const report = context.bump(NEXT, '--verify-timeout', 'soon');
  assert.equal(report.status, EXIT.USAGE, report.output);
  assert.deepEqual(context.calls(), []);
});

test('an option npm kept for itself stops the run and shows the right form', (t) => {
  const context = bumpSite(t);
  const env = { ...context.env, npm_lifecycle_event: 'shared:bump', npm_config_keep: 'x' };
  const report = context.bumpIn(context.site, env, NEXT);
  assert.equal(report.status, EXIT.USAGE, report.output);
  assert.match(report.stderr, /npm kept --keep for itself/);
  assert.deepEqual(context.calls(), []);
});

test('a pin that gives no version refuses unless one is named', (t) => {
  const context = bumpSite(t);
  fs.writeFileSync(path.join(context.site, 'shared/template/package.json'), '{ "dependencies": { "@docusaurus/core": "^3.0.0" } }\n');
  context.fixture.git(['add', 'shared/template/package.json'], context.site);
  context.fixture.git(['commit', '-q', '-m', 'Loosen the pin'], context.site);
  context.freshen();
  const report = context.bump();
  assert.equal(report.status, EXIT.REFUSED, report.output);
  assert.match(report.stderr, /the pin gives no version/);
  assert.match(report.stderr, /npm run shared:bump -- <version>/);
  assert.equal(context.bump(NEXT, '--keep', path.join(context.base, 'second')).status, EXIT.OK);
});

test('the deploy line chains a public site\'s own check, and a commented command does not count', (t) => {
  const { site } = bumpSite(t);
  assert.equal(deployLine(site), 'git push && netlify deploy --prod --no-build');
  writeFiles(site, { 'netlify.toml': '[build]\n  # command = "npm run build && node scripts/check-public.mjs"\n  command = "npm run build"\n' });
  assert.equal(deployLine(site), 'git push && netlify deploy --prod --no-build');
  writeFiles(site, { 'netlify.toml': '[build]\n  command = "npm run build && node scripts/check-public.mjs"\n' });
  assert.equal(deployLine(site), 'node scripts/check-public.mjs && git push && netlify deploy --prod --no-build');
  writeFiles(site, { 'netlify.toml': '[build]\n  command = "npm run build && node shared/scripts/check-public.mjs"\n' });
  assert.equal(deployLine(site), 'node shared/scripts/check-public.mjs && git push && netlify deploy --prod --no-build');
});
