/**
 * join.test.mjs: `shared:join` on real repositories, built by fixture.mjs. A site here starts the way the
 * older sites do: a caret on Docusaurus, `docusaurus deploy`, an ignore file that ignores itself. Each test
 * runs the real script, then reads the repository it left.
 *
 * Two things are kept honest with more than a look at the output. `--check` runs on a copied folder with a
 * stale index, and the whole tree is compared before and after, so a stray index refresh shows. A stand-in
 * for git logs every call, so a call without GIT_OPTIONAL_LOCKS=0 or a call that writes shows too.
 *
 * HOW TO CHANGE IT
 *   A new blocker: a row in BLOCKERS, with the state that causes it. OLD_SITE is an older site's files.
 *   Every test cleans up after itself. Pure rules such as the ignore plan are in joinPlans.test.mjs.
 * Run with `npm run test:shared -- --scripts`, or `node --test "scripts/__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EXIT } from '../lib/exitCodes.mjs';
import { hubAddress } from '../lib/joinFacts.mjs';
import { MUI_GUARD_LINE, MUI_PATCH, NETLIFY_COMMAND_ENV, SITE_LINES, VERIFY_LINE } from '../lib/joinSettings.mjs';
import { sameCode } from '../lib/joinStubs.mjs';
import { REMOTE_URL, REMOTE_URL_ENV } from '../lib/settings.mjs';
import { readStub } from '../lib/stubs.mjs';
import { makeFixture, startServer, writeFiles } from './fixture.mjs';
import { README_PACKAGE, SHARED_ROOT } from './joinFixture.mjs';

const REAL_PATCH = path.join(SHARED_ROOT, 'scripts', MUI_PATCH);

const OLD_VERSION = '3.9.2';
const OLD_RANGE = `^${OLD_VERSION}`;

const OLD_MANIFEST = {
  name: 'older-site',
  private: true,
  scripts: { build: 'docusaurus build', deploy: 'docusaurus deploy' },
  dependencies: { '@docusaurus/core': OLD_RANGE, '@mui/material': '6.5.0', 'docusaurus2-dotenv': '^1.4.0', react: '^19.0.0' },
};

const lockFor = (version) => ({
  lockfileVersion: 3,
  packages: {
    'node_modules/@docusaurus/core': { version },
    'node_modules/@mui/material': { version: '6.5.0' },
    'node_modules/react': { version: '19.2.0' },
  },
});

const OLD_IGNORE = [
  '# Dependencies', '/node_modules', '', '# Generated', '/build', '.docusaurus', '.env.local', '.netlify', 'netlify.toml', '',
  '# Custom', '.gitignore', '.vscode', '',
].join('\n');

/** An older site's tracked files. Its .gitignore ignores itself, so it is never among them. */
const OLD_SITE = Object.freeze({
  'package.json': `${JSON.stringify(OLD_MANIFEST, null, 2)}\n`,
  'package-lock.json': `${JSON.stringify(lockFor(OLD_VERSION), null, 2)}\n`,
  'docusaurus.config.js': 'module.exports = { title: "An older site" };\n',
  'docs/intro.md': '# Intro\n',
  'src/components/Widget/index.jsx': 'export default function Widget() {\n  return null;\n}\n',
});

/** An older site beside the hub, with its ignore file on disk and out of git. */
function olderSite(fixture, name = 'older', files = {}) {
  const root = fixture.addRepository(name, { ...OLD_SITE, ...files });
  fs.writeFileSync(path.join(root, '.gitignore'), OLD_IGNORE);
  return root;
}

/** The same site with its housekeeping done, so a join commits nothing before the mount. */
function tidySite(fixture, name = 'tidy') {
  const manifest = { ...OLD_MANIFEST, scripts: { ...OLD_MANIFEST.scripts, deploy: 'netlify deploy --prod' } };
  return fixture.addRepository(name, {
    ...OLD_SITE,
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    '.gitignore': 'node_modules\n.env\n.netlify\n',
    'netlify.toml': '[build]\n  command = "npm run build"\n',
    '.nvmrc': '22\n',
  });
}

/** The fixture for one test, and the join script as it runs there. */
function setUp(t) {
  const fixture = makeFixture();
  t.after(fixture.cleanup);
  const join = (site, ...args) => fixture.script('join.mjs', site, ...args);
  const check = (site, ...args) => join(site, '.', '--check', '--offline', ...args);
  return { fixture, join, check };
}

/** The file's text, or null. */
function read(root, name) {
  const file = path.join(root, name);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

/** The site's package.json. */
function manifestOf(root) {
  return JSON.parse(read(root, 'package.json'));
}

/** Every subject since the first commit, newest first. */
function subjects(fixture, root) {
  return fixture.git(['log', '--format=%s'], root).split('\n');
}

/** One line per path in the tree, .git included: size and time, and the index's bytes as text. */
function treeSnapshot(root) {
  const lines = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      const { size, mtimeMs } = fs.statSync(file);
      lines.push(`${path.relative(root, file)} ${size} ${mtimeMs}`);
      if (entry.isDirectory()) walk(file);
    }
  };
  walk(root);
  return [...lines.sort(), fs.readFileSync(path.join(root, '.git', 'index'), 'hex')].join('\n');
}

/** A copy of a folder, as a person's cp makes it: its index is stale. */
function copyFolder(fixture, root, name) {
  const copy = path.join(fixture.sites, name);
  fs.cpSync(root, copy, { recursive: true });
  return copy;
}

/** A stand-in for git that logs each call, then runs the real one. Returns the log file and its PATH. */
function loggingGit(fixture) {
  const folder = path.join(fixture.base, 'git-log');
  fs.mkdirSync(folder);
  const log = path.join(folder, 'calls.txt');
  const real = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  const script = ['#!/bin/sh', `echo "\${GIT_OPTIONAL_LOCKS:-unset} $1" >> "${log}"`, `exec "${real}" "$@"`, ''].join('\n');
  fs.writeFileSync(path.join(folder, 'git'), script, { mode: 0o755 });
  return { log, PATH: `${folder}${path.delimiter}${process.env.PATH}` };
}

test('--help lists every option, and an unknown one stops with usage', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  const { stdout, status } = join(site, '--help');
  assert.equal(status, EXIT.OK);
  for (const option of ['--check', '--public', '--exclude', '--offline', '--help']) assert.match(stdout, new RegExp(option));
  assert.equal(join(site, '--unknown').status, EXIT.USAGE);
  assert.equal(join(site, '.', 'second').status, EXIT.USAGE);
  assert.equal(join(site, '--exclude').status, EXIT.USAGE);
});

test('npm keeping an option is stopped, and nothing runs', (t) => {
  const { fixture } = setUp(t);
  const site = olderSite(fixture);
  const env = { ...fixture.env, npm_lifecycle_event: 'shared:join', npm_config_check: 'true' };
  const script = path.join(SHARED_ROOT, 'scripts', 'join.mjs');
  const { status, stderr } = spawnSync(process.execPath, [script], { cwd: site, env, encoding: 'utf8' });
  assert.equal(status, EXIT.USAGE);
  assert.match(stderr, /npm kept --check/);
  assert.equal(read(site, 'netlify.toml'), null);
});

test('--check on an older site says what the join does and what stays by hand, and exits 0', (t) => {
  const { fixture, check } = setUp(t);
  const site = olderSite(fixture);
  const { status, stdout } = check(site);
  assert.equal(status, EXIT.OK, stdout);
  assert.match(stdout, /^warn docusaurus\s+3\.9\.2, the pin is /m);
  assert.match(stdout, /^info gitignore\s+\.gitignore is not tracked and does not list \.env/m);
  assert.match(stdout, /drops the line that ignores \.gitignore itself/);
  assert.match(stdout, /widens \/node_modules to node_modules/);
  assert.match(stdout, /^info deploy\s+no Netlify deploy script/m);
  assert.match(stdout, /^info netlify\s+no netlify\.toml/m);
  assert.match(stdout, /^warn mui\s+@mui\/material 6\.5\.0 is outside/m);
  assert.match(stdout, /^warn dotenv\s+docusaurus2-dotenv is listed/m);
  assert.match(stdout, /^info admonition\s+no src\/theme\/Admonition\/Types\.js/m);
  assert.match(stdout, /^info mount\s+no shared\/: the join adds it/m);
  assert.match(stdout, /shared:join can run here$/m);
});

test('a joined site has nothing left for the join on --check', (t) => {
  const { fixture, join, check } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  const { stdout } = check(site);
  assert.doesNotMatch(stdout, /^info /m);
  assert.match(stdout, / 0 for the join, /);
});

test('--check reads a tracked .gitignore that lists .env as fine', (t) => {
  const { fixture, check } = setUp(t);
  const site = tidySite(fixture);
  const { stdout } = check(site);
  assert.match(stdout, /^ok\s+gitignore\s+\.gitignore is tracked and lists \.env/m);
  assert.match(stdout, /^ok\s+deploy\s+deploys through Netlify/m);
  assert.match(stdout, /^ok\s+netlify\s+netlify\.toml is tracked/m);
  assert.match(stdout, /^ok\s+node\s+\.nvmrc is here/m);
});

test('--check writes nothing, not even to a stale index', (t) => {
  const { fixture, check } = setUp(t);
  const site = copyFolder(fixture, olderSite(fixture), 'copied');
  const before = treeSnapshot(site);
  assert.equal(check(site).status, EXIT.OK);
  assert.equal(treeSnapshot(site), before);
});

test('--check reads a stale index as clean, and a changed file as changed', (t) => {
  const { fixture, check } = setUp(t);
  const site = copyFolder(fixture, olderSite(fixture), 'copied');
  assert.match(check(site).stdout, /^ok\s+changes\s+no uncommitted tracked changes/m);
  writeFiles(site, { 'docs/intro.md': '# Changed\n' });
  const { status, stdout } = check(site);
  assert.equal(status, EXIT.CHECKS);
  assert.match(stdout, /^FAIL changes\s+1 changed tracked file: the tree must be clean/m);
  assert.match(stdout, /docs\/intro\.md/);
});

test('every git call of --check runs without optional locks, and none of them writes', (t) => {
  const { fixture } = setUp(t);
  const site = olderSite(fixture);
  const { log, PATH } = loggingGit(fixture);
  const env = { ...fixture.env, PATH };
  const script = path.join(SHARED_ROOT, 'scripts', 'join.mjs');
  const args = [script, '.', '--check', '--offline'];
  const result = spawnSync(process.execPath, args, { cwd: site, env, encoding: 'utf8' });
  assert.equal(result.status, EXIT.OK, result.stderr);
  const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => line.split(' '));
  assert.ok(calls.length >= 8, `only ${calls.length} calls were logged`);
  assert.deepEqual(calls.filter(([locks]) => locks !== '0'), []);
  const reading = new Set(['apply', 'log', 'ls-files', 'remote', 'rev-parse', 'status', 'subtree', 'symbolic-ref']);
  assert.deepEqual(calls.filter(([, command]) => !reading.has(command)), []);
});

/** Each state that stops a join, the words its line prints and the words of its fix. */
const BLOCKERS = Object.freeze([
  {
    name: 'a changed tracked file',
    make: (fixture, site) => writeFiles(site, { 'docs/intro.md': '# Changed\n' }),
    reason: /1 changed tracked file/,
    fix: /commit or stash them/,
  },
  {
    name: 'Docusaurus 2',
    make: (fixture, site) => fixture.commitToSite(site, { 'package-lock.json': JSON.stringify(lockFor('2.4.3')) }, 'Old'),
    reason: /2\.4\.3: below 3\.x/,
    fix: /migrate to Docusaurus 3 first, see "Join an existing site"/,
  },
  {
    name: 'another branch',
    make: (fixture, site) => fixture.git(['switch', '-q', '-c', 'work'], site),
    reason: /on work: pull and push run on master/,
    fix: /git switch master/,
  },
  {
    name: 'a detached HEAD',
    make: (fixture, site) => fixture.git(['checkout', '-q', '--detach'], site),
    reason: /on a detached HEAD/,
    fix: /git switch master/,
  },
  {
    name: 'a shared/ folder of another kind',
    make: (fixture, site) => fixture.commitToSite(site, { 'shared/a.txt': 'mine\n' }, 'Mine'),
    reason: /a shared\/ folder that git subtree did not add/,
    fix: /rename it/,
  },
  {
    name: 'an untracked shared/ folder',
    make: (fixture, site) => writeFiles(site, { 'shared/a.txt': 'mine\n' }),
    reason: /a shared\/ folder that git subtree did not add/,
    fix: /rename it/,
  },
  {
    name: 'a shared remote that points elsewhere',
    make: (fixture, site) => fixture.git(['remote', 'add', 'shared', '/elsewhere/other.git'], site),
    reason: /shared is \/elsewhere\/other\.git, not /,
    fix: /git remote set-url shared /,
  },
]);

for (const { name, make, reason, fix } of BLOCKERS) {
  test(`${name} fails --check with its fix, and a join refuses with the same words`, (t) => {
    const { fixture, join, check } = setUp(t);
    const site = olderSite(fixture);
    make(fixture, site);
    const head = fixture.git(['rev-parse', 'HEAD'], site);
    const looked = check(site);
    assert.equal(looked.status, EXIT.CHECKS, looked.stdout);
    assert.match(looked.stdout, reason);
    assert.match(looked.stdout, fix);
    assert.match(looked.stdout, /shared:join refuses until they are fixed/);
    const joined = join(site, '.');
    assert.equal(joined.status, EXIT.REFUSED, joined.output);
    assert.match(joined.stderr, reason);
    assert.match(joined.stderr, fix);
    assert.match(joined.stderr, /Nothing was changed\./);
    assert.equal(fixture.git(['rev-parse', 'HEAD'], site), head);
    assert.equal(read(site, 'netlify.toml'), null);
    assert.doesNotMatch(read(site, '.gitignore'), /^\.env$/m);
  });
}

test('an open merge fails --check, and a join refuses', (t) => {
  const { fixture, join, check } = setUp(t);
  const site = olderSite(fixture);
  fixture.git(['switch', '-q', '-c', 'side'], site);
  fixture.commitToSite(site, { 'docs/intro.md': '# Side\n' }, 'Side');
  fixture.git(['switch', '-q', 'master'], site);
  fixture.commitToSite(site, { 'docs/intro.md': '# Master\n' }, 'Master');
  spawnSync('git', ['merge', 'side'], { cwd: site, env: fixture.env });
  assert.match(check(site).stdout, /^FAIL merge\s+a merge is still open/m);
  assert.equal(join(site, '.').status, EXIT.REFUSED);
});

test('a worktree fails --check, and a join refuses', (t) => {
  const { fixture, join, check } = setUp(t);
  const site = olderSite(fixture);
  const tree = path.join(fixture.sites, 'older-tree');
  fixture.git(['worktree', 'add', '-q', '-b', 'master-copy', tree], site);
  assert.match(check(tree).stdout, /^FAIL checkout\s+a worktree/m);
  assert.equal(join(tree, '.').status, EXIT.REFUSED);
});

test('a folder with no repository, no site or no path fails with the reason and the fix', (t) => {
  const { fixture, join } = setUp(t);
  const plain = path.join(fixture.sites, 'plain');
  writeFiles(plain, OLD_SITE);
  const noRepo = join(fixture.sites, plain, '--check', '--offline');
  assert.equal(noRepo.status, EXIT.CHECKS);
  assert.match(noRepo.stdout, /^FAIL repo\s+not a git repository\s+\(fix: git init/m);
  assert.equal(join(fixture.sites, plain).status, EXIT.REFUSED);
  assert.equal(fs.existsSync(path.join(plain, '.git')), false);
  const absent = join(fixture.sites, path.join(fixture.sites, 'gone'), '--check');
  assert.equal(absent.status, EXIT.CHECKS);
  assert.match(absent.stdout, /^FAIL site\s+no such folder/m);
  const empty = path.join(fixture.sites, 'empty');
  fs.mkdirSync(empty);
  assert.match(join(fixture.sites, empty, '--check').stdout, /^FAIL site\s+no readable package\.json/m);
  writeFiles(empty, { 'package.json': '{ "name": "not-a-site" }\n' });
  assert.match(join(fixture.sites, empty, '--check').stdout, /^FAIL site\s+package\.json lists no @docusaurus\/core/m);
});

test('a repository with no commit, and a folder inside another repository, are refused', (t) => {
  const { fixture, join } = setUp(t);
  const empty = path.join(fixture.sites, 'fresh');
  writeFiles(empty, OLD_SITE);
  fixture.git(['init', '-q', '-b', 'master'], empty);
  assert.match(join(empty, '.', '--check', '--offline').stdout, /^FAIL repo\s+a repository with no commit/m);
  const outer = olderSite(fixture, 'outer');
  const inner = path.join(outer, 'inner');
  writeFiles(inner, OLD_SITE);
  assert.match(join(inner, '.', '--check', '--offline').stdout, /^FAIL repo\s+inside the repository at /m);
});

test('a join makes the housekeeping commit, the mount and the site commit, in that order', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  const { status, stdout, output } = join(site, '.');
  assert.equal(status, EXIT.OK, output);
  const line = fixture.git(['log', '--first-parent', '--format=%s'], site).split('\n');
  assert.equal(line.length, 4);
  assert.equal(line[0], 'Add the shared commands and stubs');
  assert.match(line[1], /^Merge commit '[0-9a-f]{40}' as 'shared'$/);
  assert.equal(line[2], 'Track the ignore file and deploy through Netlify');
  assert.equal(line[3], 'Start the site');
  assert.match(fixture.git(['log', '-1', '--format=%s', 'HEAD~1^2'], site), /^Squashed 'shared\/' content from commit /);
  assert.match(stdout, /^Joined /m);
  assert.match(stdout, /housekeeping: \.gitignore, package\.json, netlify\.toml, \.nvmrc, in [0-9a-f]{7}/);
  assert.match(stdout, /mounted shared\/ at [0-9a-f]{7}/);
  assert.equal(fixture.git(['status', '--porcelain'], site), '');
});

test('the housekeeping leaves a tracked ignore file a fresh Mac can trust', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  const tracked = fixture.git(['ls-files', '--', '.gitignore', 'netlify.toml', '.nvmrc'], site).split('\n');
  assert.deepEqual(tracked, ['.gitignore', '.nvmrc', 'netlify.toml']);
  const lines = read(site, '.gitignore').split('\n');
  assert.ok(lines.includes('.env'));
  assert.ok(lines.includes('node_modules'));
  assert.equal(lines.includes('/node_modules'), false);
  assert.equal(lines.includes('.gitignore'), false);
  assert.equal(lines.includes('netlify.toml'), false);
  for (const file of ['.env', 'shared/node_modules/a', '.netlify/state.json']) {
    fixture.git(['-c', 'core.excludesFile=/dev/null', 'check-ignore', '-q', file], site);
  }
  const shared = spawnSync('git', ['check-ignore', '-q', 'shared/template/netlify.toml'], { cwd: site, env: fixture.env });
  assert.equal(shared.status, 1, 'the mount\'s own netlify.toml must not read as ignored');
});

test('a join sets the Netlify deploy line and the template\'s Node, and keeps the rest of package.json', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  const manifest = manifestOf(site);
  assert.equal(manifest.scripts.deploy, 'netlify deploy --prod --context production');
  assert.equal(manifest.scripts.build, 'docusaurus build');
  assert.deepEqual(manifest.dependencies, OLD_MANIFEST.dependencies);
  assert.equal(read(site, '.nvmrc'), read(SHARED_ROOT, 'template/.nvmrc'));
  assert.equal(read(site, 'netlify.toml'), read(SHARED_ROOT, 'template/netlify.toml'));
});

test('a deploy line of the site\'s own stays, and goes on the check as by hand', (t) => {
  const { fixture, join, check } = setUp(t);
  const manifest = { ...OLD_MANIFEST, scripts: { deploy: 'sh ship.sh' } };
  const site = olderSite(fixture, 'own', { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` });
  assert.match(check(site).stdout, /^warn deploy\s+deploy reads sh ship\.sh/m);
  join(site, '.');
  assert.equal(manifestOf(site).scripts.deploy, 'sh ship.sh');
});

test('a netlify.toml on disk and out of git stays out, and goes on the by-hand list', (t) => {
  const { fixture, join, check } = setUp(t);
  const site = olderSite(fixture);
  writeFiles(site, { 'netlify.toml': '[build]\n  command = "npm run build"\n' });
  assert.match(check(site).stdout, /^warn netlify\s+netlify\.toml is here and out of git/m);
  const { stdout } = join(site, '.');
  assert.equal(fixture.git(['ls-files', '--', 'netlify.toml'], site), '');
  assert.ok(read(site, '.gitignore').split('\n').includes('/netlify.toml'));
  assert.match(stdout, /netlify\.toml sits out of git and stays ignored\. Read it for secrets, then track it: git add -f netlify\.toml$/m);
  const shared = spawnSync('git', ['check-ignore', '-q', 'shared/template/netlify.toml'], { cwd: site, env: fixture.env });
  assert.equal(shared.status, 1);
});

test('a site with no ignore file gets one that lists .env', (t) => {
  const { fixture, join } = setUp(t);
  const site = fixture.addRepository('bare', OLD_SITE);
  assert.equal(join(site, '.').status, EXIT.OK);
  assert.ok(read(site, '.gitignore').split('\n').includes('.env'));
  assert.equal(fixture.git(['ls-files', '--', '.gitignore'], site), '.gitignore');
});

test('a sound ignore file that was never tracked gets tracked as it is', (t) => {
  const { fixture, join } = setUp(t);
  const site = fixture.addRepository('sound', OLD_SITE);
  const text = 'node_modules\n.env\n.netlify\n';
  fs.writeFileSync(path.join(site, '.gitignore'), text);
  join(site, '.');
  assert.equal(fixture.git(['ls-files', '--', '.gitignore'], site), '.gitignore');
  assert.equal(read(site, '.gitignore'), text);
});

test('a broad rule of the site cannot keep the files a join writes out of git', (t) => {
  const { fixture, join } = setUp(t);
  const site = fixture.addRepository('broad', OLD_SITE);
  fs.writeFileSync(path.join(site, '.gitignore'), 'node_modules\n.env\n.netlify\n*.toml\n');
  const { status, output } = join(site, '.');
  assert.equal(status, EXIT.OK, output);
  assert.equal(fixture.git(['ls-files', '--', 'netlify.toml'], site), 'netlify.toml');
});

test('package.json keeps its own indent', (t) => {
  const { fixture, join } = setUp(t);
  const text = `${JSON.stringify(OLD_MANIFEST, null, 4)}\n`;
  const site = olderSite(fixture, 'four', { 'package.json': text });
  join(site, '.');
  assert.match(read(site, 'package.json'), /^ {4}"name": "older-site",$/m);
  assert.match(read(site, 'package.json'), /^ {8}"build": "docusaurus build",$/m);
});

test('a site with no lock reads Docusaurus from package.json', (t) => {
  const { fixture, check } = setUp(t);
  const withoutLock = Object.entries(OLD_SITE).filter(([name]) => name !== 'package-lock.json');
  const site = fixture.addRepository('nolock', Object.fromEntries(withoutLock));
  assert.match(check(site).stdout, /^warn docusaurus\s+3\.9\.2, the pin is /m);
});

test('a tracked .env is on the check as a person\'s to fix', (t) => {
  const { fixture, check } = setUp(t);
  const site = olderSite(fixture, 'leaky', { '.env': 'NAME=value\n' });
  const { stdout } = check(site);
  assert.match(stdout, /^warn env\s+\.env is tracked\s+\(fix: git rm --cached \.env/m);
  assert.doesNotMatch(stdout, /NAME|value\b/);
});

test('a tidy site gets no housekeeping commit', (t) => {
  const { fixture, join } = setUp(t);
  const site = tidySite(fixture);
  join(site, '.');
  assert.equal(subjects(fixture, site).includes('Track the ignore file and deploy through Netlify'), false);
});

test('a copied folder joins: the index is refreshed before the subtree add', (t) => {
  const { fixture, join } = setUp(t);
  const site = copyFolder(fixture, tidySite(fixture), 'tidy-copy');
  const { status, output } = join(site, '.');
  assert.equal(status, EXIT.OK, output);
  assert.equal(fs.existsSync(path.join(site, 'shared', 'requirements.cjs')), true);
});

test('a joined site holds every npm line, comparePages and the admonition stub', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  const manifest = manifestOf(site);
  for (const [name, line] of Object.entries(SITE_LINES)) assert.equal(manifest.scripts[name], line);
  assert.equal(manifest.scripts['shared:verify'], VERIFY_LINE);
  assert.deepEqual(manifest.comparePages, ['/', '/docs/intro']);
  const stub = readStub(site, 'src/theme/Admonition/Types.js');
  assert.equal(stub.target, '@site/shared/theme/Admonition/Types');
  assert.equal(stub.plain, true);
  assert.deepEqual(fixture.git(['diff', 'HEAD~1', '--name-only', '--', 'shared'], site), '');
});

test('comparePages names /docs/intro only when that page exists, and a site\'s own list stays', (t) => {
  const { fixture, join } = setUp(t);
  const withoutIntro = Object.entries(OLD_SITE).filter(([name]) => name !== 'docs/intro.md');
  const site = fixture.addRepository('nodocs', Object.fromEntries(withoutIntro));
  join(site, '.');
  assert.deepEqual(manifestOf(site).comparePages, ['/']);
  const manifest = { ...OLD_MANIFEST, comparePages: ['/mine'] };
  const own = olderSite(fixture, 'ownpages', { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` });
  join(own, '.');
  assert.deepEqual(manifestOf(own).comparePages, ['/mine']);
});

test('a line the site holds in another form stays, and --check says so', (t) => {
  const { fixture, join } = setUp(t);
  const manifest = { ...OLD_MANIFEST, scripts: { ...OLD_MANIFEST.scripts, 'shared:status': 'node elsewhere.mjs', 'shared:verify': 'npm run mine' } };
  const site = olderSite(fixture, 'ownline', { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` });
  join(site, '.');
  assert.equal(manifestOf(site).scripts['shared:status'], 'node elsewhere.mjs');
  assert.equal(manifestOf(site).scripts['shared:verify'], 'npm run mine');
  assert.match(join(site, '.', '--check', '--offline').stdout, /^warn scripts\s+1 npm line in another form: they stay/m);
});

test('a copy of shared code becomes a stub, and its folder goes', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  const { stdout } = join(site, '.');
  assert.equal(readStub(site, 'src/components/Widget/index.jsx').target, '@site/shared/components/Widget');
  assert.match(stdout, /npm lines and 2 stubs, in/);
});

test('a piece with no default export gets the stub its row asks for, and status reads it as a stub', (t) => {
  const { fixture, join } = setUp(t);
  const table = fixture.git(['show', 'main:requirements.cjs'], fixture.hub).replace(
    "  ENTRIES: [\n",
    "  ENTRIES: [\n    { name: 'Flags', kind: 'component', stub: 'src/components/Flags/index.js', namedOnly: true, packages: [], suites: [] },\n",
  );
  fixture.commitToHub({ 'requirements.cjs': `${table}\n`, 'components/Flags/index.js': 'export const flag = 1;\n' }, 'Add a piece with no default');
  const site = olderSite(fixture, 'older', { 'src/components/Flags/index.js': 'export const flag = 1;\n' });
  const { status, output } = join(site, '.');
  assert.equal(status, EXIT.OK, output);
  const stubPath = 'src/components/Flags/index.js';
  assert.match(read(site, stubPath), /^export \* from '@site\/shared\/components\/Flags';$/m);
  assert.doesNotMatch(read(site, stubPath), /default/);
  assert.deepEqual(readStub(site, stubPath), { path: stubPath, exists: true, target: '@site/shared/components/Flags', plain: true });
});

test('a copy with a file of the site\'s own stays, and the check names the file', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture, 'data', { 'src/components/Widget/items.js': 'export default [];\n' });
  join(site, '.');
  assert.equal(readStub(site, 'src/components/Widget/index.jsx').target, null);
  assert.equal(fs.existsSync(path.join(site, 'src/components/Widget/items.js')), true);
  const { stdout } = join(site, '.', '--check', '--offline');
  assert.match(stdout, /^warn stubs\s+1 copied folder unlike shared\/: they stay/m);
  assert.match(stdout, /Widget: items\.js/);
});

test('a copy that differs stays until the MUI step, then a second run stubs it', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture, 'older', { 'src/components/Widget/index.jsx': 'export default function Widget() {\n  return 1;\n}\n' });
  join(site, '.');
  assert.equal(readStub(site, 'src/components/Widget/index.jsx').target, null);
  fixture.commitToSite(site, { 'src/components/Widget/index.jsx': OLD_SITE['src/components/Widget/index.jsx'] }, 'Move to MUI 9');
  const { status, stdout, output } = join(site, '.');
  assert.equal(status, EXIT.OK, output);
  assert.match(stdout, /^ {2}1 stub, in /m);
  assert.equal(readStub(site, 'src/components/Widget/index.jsx').target, '@site/shared/components/Widget');
});

test('--check compares copies with this script\'s own shared files before a mount', (t) => {
  const { fixture, check } = setUp(t);
  const real = read(SHARED_ROOT, 'components/Asterisk/index.jsx');
  const copy = real.replace(/^\/\*[\s\S]*?\*\/\s*/, '');
  assert.notEqual(copy, real, 'the shared file should open with a comment');
  const site = olderSite(fixture, 'older', { 'src/components/Asterisk/index.jsx': copy });
  const { stdout } = check(site);
  assert.match(stdout, /^info stubs\s+1 copied folder of shared code: the join stubs them/m);
});

test('a stub takes the place of the whole copy, its helper files too', (t) => {
  const { fixture, join } = setUp(t);
  const helper = 'export const help = 1;\n';
  fixture.commitToHub({ 'components/Widget/helper.js': helper }, 'Give the widget a helper');
  const site = olderSite(fixture, 'older', { 'src/components/Widget/helper.js': helper });
  join(site, '.');
  assert.equal(readStub(site, 'src/components/Widget/index.jsx').target, '@site/shared/components/Widget');
  assert.equal(fs.existsSync(path.join(site, 'src/components/Widget/helper.js')), false);
  assert.equal(fixture.git(['ls-files', '--', 'src/components/Widget'], site), 'src/components/Widget/index.jsx');
});

test('a copied folder holding a .DS_Store still counts as a copy', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  fs.writeFileSync(path.join(site, 'src/components/Widget/.DS_Store'), 'written by a Mac');
  join(site, '.');
  assert.equal(readStub(site, 'src/components/Widget/index.jsx').target, '@site/shared/components/Widget');
});

test('a copy on MUI 9 that still differs is the site\'s to stub', (t) => {
  const { fixture, join } = setUp(t);
  const lock = { ...lockFor(OLD_VERSION) };
  lock.packages = { ...lock.packages, 'node_modules/@mui/material': { version: '9.4.0' } };
  const files = { 'package-lock.json': JSON.stringify(lock), 'src/components/Widget/items.js': 'export default [];\n' };
  const site = olderSite(fixture, 'moved', files);
  const { stdout } = join(site, '.');
  assert.match(stdout, /These copies still differ from shared\/, so they keep their code: Widget\. Write each stub by hand: "Join an existing site"/);
  assert.doesNotMatch(stdout, /shared:join -- \./, 'a list past the MUI step never sends a person round again');
  assert.match(join(site, '.', '--check', '--offline').stdout, /^warn stubs.*compare them, then write the stub by hand/m);
});

test('a second run changes nothing and says so', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  const head = fixture.git(['rev-parse', 'HEAD'], site);
  const { status, stdout } = join(site, '.');
  assert.equal(status, EXIT.OK);
  assert.match(stdout, /^Nothing to do in /m);
  assert.equal(fixture.git(['rev-parse', 'HEAD'], site), head);
  assert.equal(fixture.git(['status', '--porcelain'], site), '');
});

test('a join that runs from a joined site reaches the other site', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  const other = olderSite(fixture, 'other');
  const { status, output } = join(site, other);
  assert.equal(status, EXIT.OK, output);
  assert.equal(fs.existsSync(path.join(other, 'shared', 'requirements.cjs')), true);
  assert.equal(fs.existsSync(path.join(site, 'shared')), false);
});

test('the hub a joining site gets is the one this script came from', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  const env = { ...fixture.env, [REMOTE_URL_ENV]: '' };
  assert.equal(hubAddress(fixture.hubWork, env), fixture.hub, 'from a clone of the hub');
  assert.equal(hubAddress(path.join(site, 'shared'), env), fixture.hub, 'from a site');
  assert.equal(hubAddress(fixture.base, env), REMOTE_URL, 'from a folder that is neither');
  assert.equal(hubAddress(fixture.hubWork, { ...env, [REMOTE_URL_ENV]: '/a/fixture.git' }), '/a/fixture.git');
});

test('a second run needs no hub: the stub pass reads the mount', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  fs.renameSync(fixture.hub, `${fixture.hub}-gone`);
  const { status, output } = join(site, '.');
  assert.equal(status, EXIT.OK, output);
});

test('a fresh clone of a joined site gets its remote back from a second run', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  const clone = path.join(fixture.sites, 'clone');
  fixture.git(['clone', '-q', site, clone], fixture.sites);
  assert.equal(join(clone, '.').status, EXIT.OK);
  assert.equal(fixture.git(['remote', 'get-url', 'shared'], clone), fixture.hub);
});

test('a hub out of reach changes nothing, the remote included', (t) => {
  const { fixture } = setUp(t);
  const site = olderSite(fixture);
  const head = fixture.git(['rev-parse', 'HEAD'], site);
  const env = { ...fixture.env, DOCUSAURUS_SHARED_REMOTE_URL: path.join(fixture.base, 'gone.git') };
  const script = path.join(SHARED_ROOT, 'scripts', 'join.mjs');
  const { status, stderr } = spawnSync(process.execPath, [script, '.'], { cwd: site, env, encoding: 'utf8' });
  assert.equal(status, EXIT.GIT);
  assert.match(stderr, /Could not reach the hub at .*gone\.git, so nothing was changed/);
  assert.equal(fixture.git(['rev-parse', 'HEAD'], site), head);
  assert.equal(fixture.git(['remote'], site), '');
  assert.equal(read(site, 'netlify.toml'), null);
});

test('a server running from the site stops a join', async (t) => {
  const { fixture, join, check } = setUp(t);
  const site = olderSite(fixture);
  await startServer(t, site);
  assert.equal(check(site).status, EXIT.OK);
  const { status, stderr } = join(site, '.');
  assert.equal(status, EXIT.REFUSED);
  assert.match(stderr, /a server is running from this checkout/);
  assert.equal(read(site, 'netlify.toml'), null);
});

test('the end prints the by-hand list in order, and only what is open', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  const { stdout } = join(site, '.');
  const steps = stdout.split('\n').filter((line) => /^ {2}\d+\. /.test(line)).join('\n');
  assert.ok(steps.indexOf('docusaurus2-dotenv') < steps.indexOf('Move MUI'));
  assert.ok(steps.indexOf('Move MUI') < steps.indexOf('shared:bump'), 'the bump runs a check that fails on the old MUI names');
  assert.ok(steps.indexOf('shared:bump') < steps.indexOf('Wire docusaurus.config.js'));
  assert.ok(steps.indexOf('Wire docusaurus.config.js') < steps.indexOf('site.scss'));
  assert.match(steps, /Wire docusaurus\.config\.js: the block under "Mount it on a site"/);
  assert.match(stdout, /Nothing was pushed\./);
  fixture.commitToSite(site, { 'docusaurus.config.js': "require('./shared/wiring/index.cjs');\n" }, 'Wire it');
  assert.doesNotMatch(join(site, '.').stdout, /Wire docusaurus\.config\.js/);
});

/** What an older site holds: the shared component's code with the patch taken back out of it. */
function unpatchedCopy(fixture, file) {
  const folder = path.join(fixture.base, 'unpatched');
  const code = read(SHARED_ROOT, 'components/Asterisk/index.jsx').replace(/^\/\*[\s\S]*?\*\/\s*/, '');
  writeFiles(folder, { [file]: code });
  fixture.git(['init', '-q'], folder);
  fixture.git(['apply', '--reverse', `--include=${file}`, REAL_PATCH], folder);
  return read(folder, file);
}

test('the real patch fits an old copy, and the printed line leaves out what the site lacks', (t) => {
  const { fixture, join, check } = setUp(t);
  const file = 'src/components/Asterisk/index.jsx';
  const old = unpatchedCopy(fixture, file);
  const site = olderSite(fixture, 'older', { [file]: old });
  const { stdout } = check(site);
  assert.match(stdout, /^warn mui-patch\s+1 of 5 files fit/m);
  const line = stdout.match(/\(fix: (git apply .*)\)$/m)[1];
  assert.equal(line.match(/--exclude=/g).length, 4);
  assert.match(join(site, '.').stdout, /Patch the site's own components: git apply --exclude=/);
  const typed = line.replace('shared/scripts/patches/mui-9-components.patch', REAL_PATCH);
  assert.equal(spawnSync('sh', ['-c', typed], { cwd: site, env: fixture.env }).status, 0);
  assert.notEqual(read(site, file), old);
  assert.ok(sameCode(read(site, file), read(SHARED_ROOT, 'components/Asterisk/index.jsx')));
});

test('a copy the site has changed is left out of the patch, and the list names it with the old-props check', (t) => {
  const { fixture, join, check } = setUp(t);
  const fitting = 'src/components/Asterisk/index.jsx';
  const changed = 'src/components/LC/index.jsx';
  const site = olderSite(fixture, 'changed', {
    [fitting]: unpatchedCopy(fixture, fitting),
    [changed]: 'export default function LC() { return null; }\n',
  });
  const line = check(site).stdout.match(/\(fix: (git apply .*)\)$/m)[1];
  assert.ok(line.includes(`--exclude=${changed}`), line);
  const { stdout } = join(site, '.');
  assert.match(stdout, /The patch leaves out what this site has changed, so move it to MUI 9 by hand: src\/components\/LC\/index\.jsx\. node shared\/scripts\/check-mui-api\.mjs lists the old props\./);
  assert.doesNotMatch(stdout, /by hand: [^\n]*Asterisk/, 'a file the patch moves is not named');
});

test('a site that holds none of the patch\'s files gets no git apply line', (t) => {
  const { fixture, join, check } = setUp(t);
  const site = olderSite(fixture);
  assert.match(check(site).stdout, /^ok\s+mui-patch\s+none of its 5 files fit here/m);
  assert.doesNotMatch(join(site, '.').stdout, /git apply/);
});

test('a site with the grid component hears it stays by hand, and no patch names it', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture, 'grid', { 'src/components/CustomToolbar/index.jsx': 'export default null;\n' });
  assert.match(join(site, '.').stdout, /src\/components\/CustomToolbar and the grid illustrations hold MUI X code/);
});

test('a site with only the grid illustrations hears the same line', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture, 'illustrated', { 'src/components/_IllustrationsOnly/DataGridGood/index.jsx': 'export default null;\n' });
  assert.match(join(site, '.').stdout, /the grid illustrations hold MUI X code/);
});

/** An older site whose package.json lists two MUI X packages at the old major, out of order. */
function gridSite(fixture) {
  const dependencies = { ...OLD_MANIFEST.dependencies, '@mui/x-license': '^7.23.5', '@mui/x-data-grid-pro': '^7.23.5' };
  const manifest = { ...OLD_MANIFEST, dependencies };
  return olderSite(fixture, 'grid-packages', { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` });
}

test('MUI X packages at the old major are cleared before the MUI install, which would stop at them', (t) => {
  const { fixture, join, check } = setUp(t);
  const site = gridSite(fixture);
  const { stdout: report } = check(site);
  assert.match(report, /^warn mui-x\s+2 MUI X packages would stop the MUI install\s+\(fix: by hand, before the MUI step\)/m);
  assert.match(report, /^\s+@mui\/x-data-grid-pro$/m);
  const steps = join(site, '.').stdout;
  assert.match(steps, /npm uninstall @mui\/x-data-grid-pro @mui\/x-license$/m);
  assert.ok(steps.indexOf('npm uninstall @mui/x-') < steps.indexOf('Move MUI'));
});

test('a site with no MUI X packages, or past the MUI step, hears nothing of them', (t) => {
  const { fixture, join, check } = setUp(t);
  const plain = olderSite(fixture);
  assert.doesNotMatch(check(plain).stdout, /^warn mui-x/m);
  assert.doesNotMatch(join(plain, '.').stdout, /npm uninstall @mui/);
  const moved = gridSite(fixture);
  const lock = lockFor(OLD_VERSION);
  lock.packages = { ...lock.packages, 'node_modules/@mui/material': { version: '9.4.0' } };
  fixture.commitToSite(moved, { 'package-lock.json': `${JSON.stringify(lock, null, 2)}\n` }, 'Move to MUI 9');
  assert.doesNotMatch(check(moved).stdout, /^warn mui-x/m);
});

test('the MUI step prints its own install line, MUI\'s two packages together', (t) => {
  const { fixture, join } = setUp(t);
  const { stdout } = join(olderSite(fixture), '.');
  assert.match(stdout, /Move MUI to \^\d+\.\d+\.\d+: npm install --save-exact @mui\/material@\d+\.\d+\.\d+ @mui\/icons-material@\d+\.\d+\.\d+$/m);
});

/** The hub's table with the admonitions needing an MUI package too, as the real table has them. */
function admonitionsNeedMui(fixture) {
  const text = read(fixture.hubWork, 'requirements.cjs')
    .replace("RANGES: { react: '^19.0.0',", "RANGES: { react: '^19.0.0', '@mui/icons-material': '^9.4.0',")
    .replace("docsPattern: '^:::keynote\\\\b' }, packages: ['react'],", "docsPattern: '^:::keynote\\\\b' }, packages: ['react', '@mui/icons-material'],");
  assert.notEqual(text, read(fixture.hubWork, 'requirements.cjs'));
  assert.match(text, /packages: \['react', '@mui\/icons-material'\]/);
  fixture.commitToHub({ 'requirements.cjs': text }, 'The admonitions need an icon package');
}

/** A plain Docusaurus site, as create-docusaurus makes it: no MUI, its lock holding what Docusaurus brings. */
function plainSite(fixture) {
  const manifest = { ...OLD_MANIFEST, dependencies: { '@docusaurus/core': OLD_RANGE, react: '^19.0.0' } };
  const lock = { lockfileVersion: 3, packages: {} };
  for (const [name, version] of [['@docusaurus/core', OLD_VERSION], ['react', '19.2.0']]) {
    lock.packages[`node_modules/${name}`] = { version };
  }
  return olderSite(fixture, 'plain', {
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify(lock, null, 2)}\n`,
  });
}

const INSTALL_ROW = 'Install what the shared pieces need and this site lacks, and commit it: npm install --save-exact ';

test('a site with no MUI hears to install what the shared pieces need, before the bump that builds it first', (t) => {
  const { fixture, join } = setUp(t);
  admonitionsNeedMui(fixture);
  const { stdout } = join(plainSite(fixture), '.');
  const steps = stdout.split('\n').filter((line) => /^ {2}\d+\. /.test(line)).join('\n');
  const line = steps.split('\n').find((step) => step.includes(INSTALL_ROW)) ?? '';
  assert.match(line, /npm install --save-exact @mui\/icons-material@9\.4\.0$/, stdout);
  assert.ok(steps.indexOf(INSTALL_ROW) < steps.indexOf('shared:bump'), 'the bump builds the site first, and the stubs import these');
  assert.doesNotMatch(steps, /Move MUI/);
});

test('a site that holds what the pieces need hears no install, and one with MUI to move hears MUI\'s packages once', (t) => {
  const { fixture, join } = setUp(t);
  assert.doesNotMatch(join(olderSite(fixture), '.').stdout, /Install what the shared pieces need/);
  admonitionsNeedMui(fixture);
  const steps = join(olderSite(fixture, 'older-mui'), '.').stdout;
  assert.match(steps, /Move MUI/);
  assert.doesNotMatch(steps, /Install what the shared pieces need/, 'the MUI step installs MUI\'s own packages');
});

test('the bump\'s step says to commit first and to list the awkward pages, and the last step names the kept build', (t) => {
  const { fixture, join } = setUp(t);
  const { stdout } = join(olderSite(fixture), '.');
  assert.match(stdout, /Add the site's awkward pages to comparePages, so that the bump's compare reads them, and commit, because a bump needs a clean tree\./);
  assert.match(stdout, /npm run shared:compare -- --before \.\.\/keep-build$/m);
  assert.match(stdout, /npm uninstall docusaurus2-dotenv, then delete its block from plugins/);
  assert.match(stdout, /npm run shared:verify names every old file shared\/ now holds/);
});

test('--public writes the check into a netlify.toml it makes, and --exclude reaches only the exclude file', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  const { stdout } = join(site, '.', '--public', '--exclude', '.toolfolder/', '--exclude', '.other/');
  assert.match(read(site, 'netlify.toml'), /command = "npm run build && node shared\/scripts\/check-public\.mjs"/);
  assert.match(stdout, /\.git\/info\/exclude gained \.toolfolder\/, \.other\//);
  assert.match(read(site, '.git/info/exclude'), /^\.toolfolder\/$/m);
  assert.doesNotMatch(read(site, '.gitignore'), /toolfolder/);
  assert.equal(fixture.git(['log', '--all', '-S.toolfolder', '--format=%h'], site), '');
  writeFiles(site, { '.toolfolder/settings.json': '{}\n' });
  assert.equal(fixture.git(['status', '--porcelain'], site), '');
  assert.match(join(site, '.', '--check', '--offline', '--public').stdout, /^ok\s+public\s+the build runs node shared\/scripts\/check-public\.mjs/m);
  const again = join(site, '.', '--exclude', '.toolfolder/');
  assert.doesNotMatch(again.stdout, /gained/);
  assert.equal(read(site, '.git/info/exclude').match(/\.toolfolder/g).length, 1);
});

test('--public with no --exclude asks for one, and the file stays as it was', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  assert.match(join(site, '.', '--public').stdout, /run the join again with --exclude <path>/);
  assert.doesNotMatch(join(site, '.', '--public', '--exclude', '.a/').stdout, /run the join again with --exclude/);
  assert.doesNotMatch(join(site, '.').stdout, /with --exclude/);
});

test('--public on a site that has a netlify.toml leaves it, and says what to add', (t) => {
  const { fixture, join } = setUp(t);
  const site = tidySite(fixture);
  const before = read(site, 'netlify.toml');
  assert.match(join(site, '.', '--check', '--offline', '--public').stdout, /^warn public\s+the build command lacks the public check/m);
  const { stdout } = join(site, '.', '--public');
  assert.equal(read(site, 'netlify.toml'), before);
  assert.match(stdout, /Add && node shared\/scripts\/check-public\.mjs to the end of the build command/);
});

/** A stand-in for the Netlify CLI that prints `answer`, or exits 1 with none. */
function fakeNetlify(fixture, answer) {
  const command = path.join(fixture.base, 'fake-netlify');
  const body = answer === null ? 'exit 1' : `cat <<'END'\n${JSON.stringify(answer)}\nEND`;
  fs.writeFileSync(command, ['#!/bin/sh', body, ''].join('\n'), { mode: 0o755 });
  return { ...fixture.env, [NETLIFY_COMMAND_ENV]: command };
}

/** The check of a site linked to a Netlify project, with the CLI's answer standing in. */
function checkLinked(fixture, site, answer, ...args) {
  writeFiles(site, { '.netlify/state.json': '{ "siteId": "a-project" }\n' });
  const script = path.join(SHARED_ROOT, 'scripts', 'join.mjs');
  const env = fakeNetlify(fixture, answer);
  return spawnSync(process.execPath, [script, '.', '--check', ...args], { cwd: site, env, encoding: 'utf8' }).stdout;
}

test('--check reports build on push when the CLI can read it', (t) => {
  const { fixture, check } = setUp(t);
  const site = olderSite(fixture);
  assert.match(check(site).stdout, /^ok\s+on-push\s+not linked to a Netlify project/m);
  const repo = 'https://example.invalid/site';
  const builds = checkLinked(fixture, site, { build_settings: { repo_url: repo, stop_builds: false } });
  assert.match(builds, /^warn on-push\s+Netlify builds every push/m);
  const stopped = checkLinked(fixture, site, { build_settings: { repo_url: repo, stop_builds: true } });
  assert.match(stopped, /^ok\s+on-push\s+linked to a Netlify project, builds stopped/m);
  const noRepo = checkLinked(fixture, site, { build_settings: {} });
  assert.match(noRepo, /^ok\s+on-push\s+linked to a Netlify project, builds stopped/m);
  assert.match(checkLinked(fixture, site, null), /^ok\s+on-push\s+linked to a Netlify project, and the CLI could not say more/m);
  assert.match(checkLinked(fixture, site, { build_settings: {} }, '--offline'), /not read \(--offline\)/);
});

test('the CLI runs outside the site and is not asked under --offline', (t) => {
  const { fixture } = setUp(t);
  const site = olderSite(fixture);
  writeFiles(site, { '.netlify/state.json': '{ "siteId": "a-project" }\n' });
  const calls = path.join(fixture.base, 'netlify-calls');
  const command = path.join(fixture.base, 'fake-netlify-log');
  fs.writeFileSync(command, ['#!/bin/sh', `pwd >> "${calls}"`, `echo "$*" >> "${calls}"`, 'echo "{}"', ''].join('\n'), { mode: 0o755 });
  const env = { ...fixture.env, [NETLIFY_COMMAND_ENV]: command };
  const script = path.join(SHARED_ROOT, 'scripts', 'join.mjs');
  spawnSync(process.execPath, [script, '.', '--check', '--offline'], { cwd: site, env });
  assert.equal(fs.existsSync(calls), false);
  spawnSync(process.execPath, [script, '.', '--check'], { cwd: site, env });
  const [folder, words] = fs.readFileSync(calls, 'utf8').trim().split('\n');
  assert.notEqual(fs.realpathSync(folder), fs.realpathSync(site));
  assert.match(words, /^api getSite --data \{"site_id":"a-project"\}$/);
});

test('the CLI\'s answer prints no value', (t) => {
  const { fixture } = setUp(t);
  const site = olderSite(fixture);
  const planted = 'plantedvariablevalue';
  const answer = { name: planted, build_settings: { repo_url: 'x', stop_builds: false, env: { SOMETHING: planted } } };
  assert.doesNotMatch(checkLinked(fixture, site, answer), new RegExp(planted));
});

test('after a join status reads the mount, and a published change carries no commit of the site', (t) => {
  const { fixture, join } = setUp(t);
  const site = olderSite(fixture);
  join(site, '.');
  const status = fixture.status(site, '--offline');
  assert.match(status.stdout, /^ok\s+hub\s+in sync at /m);
  assert.match(status.stdout, /^ok\s+split\s+a split carries none of this site's own commits/m);
  assert.match(status.stdout, /^ok\s+ignored\s+git ignores nothing under shared\//m);
  assert.match(status.stdout, /^ok\s+stubs\s+/m);
  fixture.commitToSite(site, { 'shared/css/custom.scss': 'changed\n' }, 'Change the shared styles');
  const pushed = fixture.script('push.mjs', site, '--yes', '--skip-tests');
  assert.equal(pushed.status, EXIT.OK, pushed.output);
  const hubSubjects = fixture.git(['log', '--format=%s', 'main'], fixture.hub).split('\n');
  assert.deepEqual(hubSubjects, ['Change the shared styles', 'Seed the hub']);
});

test('the printed package.json block of the README is SITE_LINES', () => {
  const printed = { ...README_PACKAGE.scripts };
  delete printed['shared:verify'];
  assert.deepEqual(SITE_LINES, printed);
  assert.equal(README_PACKAGE.scripts['shared:verify'], VERIFY_LINE);
});

test('the verify line a join writes runs the old-MUI check first', () => {
  assert.equal(VERIFY_LINE, `${MUI_GUARD_LINE} && npm run test:shared`);
  assert.equal(fs.existsSync(path.join(SHARED_ROOT, MUI_GUARD_LINE.replace('node shared/', ''))), true);
});
