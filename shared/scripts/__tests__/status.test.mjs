/**
 * scripts/__tests__/status.test.mjs: `shared:status` as a person runs it: the real script as a child
 * process, in real sites, one test per way a line can fire. `assertLine` reads the printed report,
 * so a change of wording in lib/checks.mjs shows up here. A new check gets a test that makes it fire.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EXIT } from '../lib/exitCodes.mjs';
import { CHECKS, formatResult, redCheck, restoreLine, stubsCheck } from '../lib/checks.mjs';
import { MAX_DETAILS } from '../lib/phrases.mjs';
import { parseArgs, summary } from '../status.mjs';
import { assertLine, fixtureFor, startServer, writeFiles } from './fixture.mjs';
import { gitExit, pullIn, pushIn, pushToOrigin, remount, revertTheAdd, rewindHub, stubTests } from './flows.mjs';

const EDIT = { 'shared/README.md': 'Edited in a site.\n' };

/** The levels of a report, counted from its last line. */
function counts(report) {
  const last = report.stdout.trim().split('\n').at(-1);
  const [, passed, warned, failed] = last.match(/^(\d+) ok, (\d+) warnings?, (\d+) failed$/);
  return { passed: Number(passed), warned: Number(warned), failed: Number(failed) };
}

/** Checks that print nothing on a clean site: the red line speaks only while a red run here still stands. */
const SILENT_WHEN_CLEAN = [redCheck];

test('a clean site: every check ok, exit 0', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.equal(counts(report).warned + counts(report).failed, 0, report.output);
  const information = report.stdout.split('\n').filter((line) => line.startsWith('info '));
  assert.equal(counts(report).passed + information.length, CHECKS.length - SILENT_WHEN_CLEAN.length);
  assert.doesNotMatch(report.stdout, /^\S+\s+red\s/m);
  assertLine(report, 'ok', 'hub', /in sync at [0-9a-f]{7}/);
  assertLine(report, 'ok', 'split', /a split carries none of this site's own commits/);
  assertLine(report, 'ok', 'stubs', /1 of 3 stubs present/);
  assertLine(report, 'ok', 'packages', /2 packages in range/);
});

test('it runs from a subfolder, and refuses a repository with no shared/', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  assert.equal(fixture.status(path.join(site, 'docs')).status, EXIT.OK);
  const plain = fixture.addRepository('plain', { 'a.txt': 'a\n' });
  const report = fixture.status(plain);
  assert.equal(report.status, EXIT.USAGE);
  assert.match(report.stderr, /has no shared\/ folder/);
});

test('it reads and changes nothing: refs, index and files stay as they were', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const snapshot = () => [
    fixture.git(['rev-parse', 'HEAD'], site),
    fixture.git(['status', '--porcelain'], site),
    fixture.git(['for-each-ref', 'refs/heads'], site),
    fixture.git(['count-objects'], site),
  ];
  const before = snapshot();
  fixture.status(site);
  assert.deepEqual(snapshot(), before);
  assert.equal(fs.existsSync(path.join(site, '.git', 'subtree-cache')), false);
});

test('behind: a warning that lists the commits and the fix, exit 0', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK);
  assertLine(report, 'warn', 'hub', /behind the hub by 1 commit .*fix: npm run shared:pull/);
  assert.match(report.stdout, /[0-9a-f]{7} Add a file/);
});

test('ahead: lists the commits, flags a mixed one, says a public site publishes them', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { ...EDIT, 'docs/two.md': 'x\n' }, 'A mixed commit');
  const report = fixture.status(site);
  assertLine(report, 'warn', 'hub', /ahead of the hub by 1 commit .*fix: npm run shared:push/);
  assert.match(report.stdout, /A mixed commit \[mixes in site files\]/);
  assert.match(report.stdout, /A public site publishes these commits/);
});

test('diverged, then pushed but not rejoined, then a rejoin without a push', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  assertLine(fixture.status(site), 'warn', 'hub', /diverged: 1 commit here, 1 commit on the hub/);

  const pushed = fixture.addSite('pushed');
  fixture.commitToSite(pushed, EDIT, 'Edit');
  fixture.subtreePush(pushed);
  const report = fixture.status(pushed);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'hub', /pushed but not rejoined.*fix: npm run shared:push/);

  const rejoined = fixture.addSite('rejoined');
  fixture.commitToSite(rejoined, { 'shared/css/custom.scss': 'changed\n' }, 'Edit');
  fixture.rejoin(rejoined);
  assertLine(fixture.status(rejoined), 'FAIL', 'hub', /ahead of the hub: a rejoin ran without its push/);
});

test('a rewritten hub fails, and warns off a push', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.git(['commit', '--amend', '-q', '-m', 'Rewritten'], fixture.hubWork);
  fixture.git(['push', '-q', '--force', 'origin', 'main'], fixture.hubWork);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  const line = assertLine(report, 'FAIL', 'hub', /is not in the hub's history: the hub was rewritten/);
  assert.match(line, /no shared:push: it would publish [0-9a-f]{7} again/);
});

test('--offline does not fetch: no network needed, and it says so', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  fixture.git(['remote', 'set-url', 'shared', path.join(fixture.base, 'gone.git')], site);
  const offline = fixture.status(site, '--offline');
  assert.equal(offline.status, EXIT.OK);
  assertLine(offline, 'ok', 'fetch', /skipped \(--offline\)/);
  assertLine(offline, 'ok', 'hub', /in sync/);
  const online = fixture.status(site);
  assertLine(online, 'warn', 'fetch', /could not reach the hub/);
});

test('options: --help, an unknown option, and an option npm kept', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  assert.deepEqual(parseArgs(['--offline']), { offline: true, help: false });
  assert.equal(fixture.status(site, '--help').status, EXIT.OK);
  assert.equal(fixture.status(site, '--nonsense').status, EXIT.USAGE);
  const kept = { ...fixture.env, npm_lifecycle_event: 'shared:status', npm_config_offline: 'true' };
  const report = fixture.statusWith(site, kept);
  assert.equal(report.status, EXIT.USAGE);
  assert.match(report.stderr, /npm kept --offline/);
  assert.match(report.stderr, /If they were after `--` already, an npmrc or the environment sets npm_config_offline: take that setting out, or run the script without npm: node \S*status\.mjs/);
});

test('the subtree line fails when git has no subtree command', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const noSubtree = { ...fixture.env, GIT_EXEC_PATH: fixture.base };
  const report = fixture.statusWith(site, noSubtree, '--offline');
  assertLine(report, 'FAIL', 'subtree', /not installed/);
});

test('the remote line: gone fails with the add command, elsewhere warns, a spelling passes', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.git(['remote', 'set-url', 'shared', path.relative(site, fixture.hub)], site);
  assertLine(fixture.status(site), 'ok', 'remote', /shared is \.\.\/\.\.\/hub\.git/);
  fixture.git(['remote', 'set-url', 'shared', 'git@github.com:owner/another.git'], site);
  assertLine(fixture.status(site, '--offline'), 'warn', 'remote', /fix: git remote set-url shared/);
  fixture.git(['remote', 'remove', 'shared'], site);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'remote', /no shared remote.*fix: git remote add shared /);
});

test('changes: a changed file warns, a touched but unchanged one does not', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const file = path.join(site, 'docs/intro.md');
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  assertLine(fixture.status(site), 'ok', 'changes', /no uncommitted tracked changes/);
  writeFiles(site, { 'docs/intro.md': 'Changed.\n' });
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK);
  assertLine(report, 'warn', 'changes', /1 changed tracked file: they block pull and push/);
});

test('branch and checkout: another branch and a worktree warn', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const worktree = path.join(fixture.base, 'worktree');
  fixture.git(['worktree', 'add', '-q', worktree, '-b', 'side'], site);
  const report = fixture.status(worktree);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'warn', 'branch', /on side: pull and push run on master.*fix: run it in the main checkout/);
  assertLine(report, 'warn', 'checkout', /a worktree/);
});

test('branch: master held by a linked worktree names that worktree, not a switch that fails', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const worktree = path.join(fixture.base, 'holder');
  fixture.git(['switch', '-q', '-c', 'side'], site);
  fixture.git(['worktree', 'add', '-q', worktree, 'master'], site);
  const line = assertLine(fixture.status(site), 'warn', 'branch', /on side/);
  assert.ok(line.includes(`the worktree at ${worktree} has master: switch it to another branch there, then git switch master here`), line);
  const refused = pullIn(fixture, site);
  assert.equal(refused.status, EXIT.REFUSED, refused.output);
  assert.ok(refused.stderr.includes(`Fix: the worktree at ${worktree} has master`), refused.stderr);
});

test('open: a resolved but uncommitted merge fails, and the hub and changes lines point at it', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/css/custom.scss': 'mine\n' }, 'One side');
  fixture.commitToHub({ 'css/custom.scss': 'theirs\n' }, 'Other side');
  assert.notEqual(gitExit(fixture, ['subtree', 'pull', '--prefix', 'shared', 'shared', 'main', '--squash', '-m', 'pull'], site), 0);
  writeFiles(site, { 'shared/css/custom.scss': 'both\n' });
  fixture.git(['add', 'shared/css/custom.scss'], site);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assertLine(report, 'FAIL', 'open', /a merge is still open: pull and push refuse .*fix: git add the resolved files, then git commit --no-edit; or git merge --abort/);
  assertLine(report, 'warn', 'hub', /diverged.*fix: see the open line first/);
  assertLine(report, 'warn', 'changes', /fix: see the open line first/);
  assert.doesNotMatch(report.stdout, /commit or stash them/);
  assert.doesNotMatch(report.stdout, /fix: npm run shared:pull/);
});

test('open: a revert or a rebase that waits is named, with its own way on and out', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/notes.txt': 'zero\n' }, 'Add a note');
  const first = fixture.commitToSite(site, { 'shared/notes.txt': 'one\n' }, 'Change the note');
  fixture.commitToSite(site, { 'shared/notes.txt': 'two\n' }, 'Change it again');
  assert.notEqual(gitExit(fixture, ['revert', '--no-edit', first], site), 0);
  const reverting = fixture.status(site);
  assertLine(reverting, 'FAIL', 'open', /a revert is still open.*git revert --continue; or git revert --abort/);
  assertLine(reverting, 'FAIL', 'markers', /remove them from each file, then git add the resolved files, then git revert --continue; or git revert --abort/);
  assertLine(reverting, 'warn', 'hub', /ahead of the hub.*fix: see the open line first/);
  assert.doesNotMatch(reverting.stdout, /git reset --keep/);
  fixture.git(['revert', '--abort'], site);
  const markFirstAsEdit = { GIT_SEQUENCE_EDITOR: "perl -pi -e 's/^pick/edit/ if $. == 1'" };
  fixture.git(['rebase', '-q', '-i', `${first}~1`], site, markFirstAsEdit);
  const rebasing = fixture.status(site);
  assertLine(rebasing, 'FAIL', 'open', /a rebase is still open.*git rebase --continue; or git rebase --abort/);
  assertLine(rebasing, 'warn', 'branch', /on a detached HEAD.*fix: see the open line first/);
  const refused = pushIn(fixture, site, stubTests(fixture));
  assert.equal(refused.status, EXIT.REFUSED, refused.output);
  assert.match(refused.stderr, /a rebase is still open\.\nFix: git add the resolved files, then git rebase --continue; or git rebase --abort/);
  assert.doesNotMatch(refused.stderr, /git switch/);
  fixture.git(['rebase', '--abort'], site);
});

test('no record: a shallow clone is told to unshallow, and a shared/ made by hand to set it aside first', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'docs/more.md': 'more\n' }, 'More');
  const shallow = path.join(fixture.base, 'shallow');
  fixture.git(['clone', '-q', '--depth', '1', `file://${site}`, shallow], fixture.base);
  fixture.git(['remote', 'add', 'shared', fixture.hub], shallow);
  assertLine(fixture.status(shallow), 'FAIL', 'hub', /no subtree record for shared\/ in this history .*fix: git fetch --unshallow, then run this again/);
  const copied = fixture.addRepository('copied', { 'shared/a.txt': 'a\n' });
  fixture.git(['remote', 'add', 'shared', fixture.hub], copied);
  const line = assertLine(fixture.status(copied), 'FAIL', 'hub', /no subtree record/);
  assert.ok(line.includes(BY_HAND_FIX), line);
});

/** The fix a shared/ made by hand is given, as status, pull and push print it. */
const BY_HAND_FIX = 'a shared/ made by hand: git mv shared shared-before && git commit -m "Set the old shared folder aside", '
  + 'then git update-index -q --refresh && git fetch shared main && git subtree add --prefix shared shared/main~1 --squash, '
  + 'then npm run shared:pull, whose record keeps the old folder out of every split';

/** Runs the steps of a printed fix in order: `npm run shared:pull` as the site's pull, every other step in a shell. */
function followFix(fixture, site, fix) {
  for (const step of fix.split(', then ')) {
    const shell = () => spawnSync('sh', ['-c', step], { cwd: site, env: fixture.env, encoding: 'utf8' });
    const result = step.startsWith('npm run shared:pull') ? fixture.script('pull.mjs', site) : shell();
    assert.equal(result.status, 0, `${step}\n${result.stdout}${result.stderr}`);
  }
}

test('no record: the steps printed for a shared/ made by hand end in sync, with nothing for a split to carry', (t) => {
  const fixture = fixtureFor(t);
  fixture.commitToHub({ 'b.txt': 'b\n' }, 'Add a second file');
  const copied = fixture.addRepository('copied', { 'shared/a.txt': 'a\n', 'docs/intro.md': 'A note.\n' });
  fixture.git(['remote', 'add', 'shared', fixture.hub], copied);
  const line = assertLine(fixture.status(copied), 'FAIL', 'hub', /no subtree record/);
  followFix(fixture, copied, line.slice(line.indexOf('(fix: a shared/ made by hand: ') + '(fix: a shared/ made by hand: '.length, -1));
  const report = fixture.status(copied, '--offline');
  assertLine(report, 'ok', 'hub', /in sync at [0-9a-f]{7}$/);
  assertLine(report, 'ok', 'split', /a split carries none of this site's own commits/);
  assert.equal(fs.readFileSync(path.join(copied, 'shared-before/a.txt'), 'utf8'), 'a\n', 'the old folder is kept aside');
});

test('fetch: a hub that cannot be fetched shows git\'s own reason, not only the network', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const gone = path.join(fixture.base, 'no-such-hub.git');
  fixture.git(['remote', 'set-url', 'shared', gone], site);
  const report = fixture.status(site);
  assertLine(report, 'warn', 'fetch', /could not reach the hub.*fix: check the network, the hub URL and SSH access/);
  assert.match(report.stdout, /does not appear to be a git repository|Could not read from remote repository/);
  const refused = pullIn(fixture, site);
  assert.equal(refused.status, EXIT.GIT, refused.output);
  assert.match(refused.stderr, /Could not reach the hub, so nothing was changed\. git said:\n {2}\S/);
  assert.match(refused.stderr, /Fix: check the network, the hub URL and SSH access, then run this again\./);
});

test('a requirements.cjs that does not load is one FAIL line with the way back, never a stack', (t) => {
  const fixture = fixtureFor(t);
  fixture.commitToHub({ 'requirements.cjs': "module.exports = { RANGES: { a: '1' } ENTRIES: [] };\n" }, 'Lose a comma');
  const site = fixture.addSite('broken');
  for (const report of [fixture.status(site), fixture.status(site, '--offline')]) {
    assert.equal(report.status, EXIT.CHECKS, report.output);
    assertLine(report, 'FAIL', 'packages', /shared\/requirements\.cjs does not load: SyntaxError: .*fix: if a pull just brought it: git update-index -q --refresh && git reset --keep HEAD~1; otherwise mend the file/);
    assert.doesNotMatch(report.output, /\n\s+at /);
    assertLine(report, 'ok', 'remote', /shared is/);
  }
  fixture.commitToHub({ 'requirements.cjs': 'module.exports = { RANGES: {} };\n' }, 'Drop the rows');
  const empty = fixture.addSite('empty');
  assertLine(fixture.status(empty), 'FAIL', 'packages', /does not load: its ENTRIES is not a list/);
});

test('packages: a @docusaurus package short of its range gets shared:bump, and never an install line', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const table = path.join(site, 'shared/requirements.cjs');
  const raised = fs.readFileSync(table, 'utf8')
    .replace("RANGES: { react: '^19.0.0',", "RANGES: { '@docusaurus/core': '^3.11.0', react: '^19.0.0',")
    .replace("packages: ['sass'], suites", "packages: ['sass', '@docusaurus/core'], suites");
  fs.writeFileSync(table, raised);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'packages', /fix: npm run shared:bump\)$/);
  assert.doesNotMatch(report.stdout, /--save-exact/);
  const lockFile = path.join(site, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  lock.packages['node_modules/react'].version = '18.3.1';
  fs.writeFileSync(lockFile, JSON.stringify(lock));
  const both = fixture.status(site);
  assertLine(both, 'FAIL', 'packages', /fix: npm run shared:bump\)$/);
  assert.match(both.stdout, /^ +then, once the bump has ended, green or with a list to read: npm install --save-exact react@19\.0\.0$/m);
  assert.doesNotMatch(both.stdout, /shared:bump &&/);
});

test('packages: an out-of-range lock fails with the exact install line, and no lock warns', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const lockFile = path.join(site, 'package-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  lock.packages['node_modules/react'].version = '18.3.1';
  fs.writeFileSync(lockFile, JSON.stringify(lock));
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'packages', /fix: npm install --save-exact react@19\.0\.0/);
  assert.match(report.stdout, /react: needs \^19\.0\.0, found 18\.3\.1 \(Widget\)/);
  fs.rmSync(lockFile);
  fixture.commitToSite(site, { 'package.json': '{ "dependencies": { "react": "^19.0.0", "sass": "^1.80.5" } }\n' }, 'Declare sass');
  assertLine(fixture.status(site), 'warn', 'packages', /no package-lock\.json/);
});

test('packages: a lock in range with nothing on disk is a warning with npm ci, as a fresh clone reads', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.uninstall('sass');
  const one = fixture.status(site);
  assert.equal(one.status, EXIT.OK, one.output);
  assertLine(one, 'warn', 'packages', /^warn packages +2 packages in range in the lock, 1 not installed here: sass {2}\(fix: npm ci\)$/);
  fixture.uninstall();
  assertLine(fixture.status(site), 'warn', 'packages', /2 packages in range in the lock, 2 not installed here: react, sass {2}\(fix: npm ci\)$/);
  writeFiles(site, { 'node_modules/react/package.json': '{}\n', 'node_modules/sass/package.json': '{}\n' });
  assertLine(fixture.status(site), 'ok', 'packages', /2 packages in range$/);
});

test('node_modules, ignored files and a bad table each fail', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  writeFiles(site, {
    'shared/node_modules/x/index.js': 'x\n',
    'shared/data.gz': 'x\n',
    'shared/.DS_Store': 'x\n',
  });
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'node_modules', /shared\/node_modules exists/);
  assertLine(report, 'FAIL', 'ignored', /1 file under shared\/ that git ignores/);
  assert.match(report.stdout, /shared\/data\.gz/);
  assert.doesNotMatch(report.stdout, /DS_Store/);

  fixture.commitToHub({ 'requirements.cjs': "module.exports = { RANGES: {}, ENTRIES: [{ name: 'A', kind: 'mystery' }] };\n" }, 'Break the table');
  const broken = fixture.addSite('broken');
  const bad = fixture.status(broken);
  assertLine(bad, 'FAIL', 'packages', /requirements\.cjs has bad rows/);
  assert.match(bad.stdout, /A: unknown kind mystery/);
});

test('conflict markers committed into shared/ fail with file and line', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const marker = '<'.repeat(7);
  fixture.commitToSite(site, { 'shared/css/custom.scss': `one\n${marker} HEAD\ntwo\n` }, 'Commit a marker');
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'markers', /1 conflict marker .*git reset --keep HEAD~1, then npm run shared:pull/);
  assert.match(report.stdout, /shared\/css\/custom\.scss:2/);
});

test('conflict markers in an open merge point at the two ways out, not at the undo', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/css/custom.scss': 'mine\n' }, 'One side');
  fixture.commitToHub({ 'css/custom.scss': 'theirs\n' }, 'Other side');
  assert.notEqual(gitExit(fixture, ['subtree', 'pull', '--prefix', 'shared', 'shared', 'main', '--squash', '-m', 'pull'], site), 0);
  const report = fixture.status(site);
  assertLine(report, 'FAIL', 'markers', / 2 conflict markers .*git commit --no-edit; or git merge --abort/);
  assert.doesNotMatch(report.stdout, /git reset --keep/);
});

test('a merge that git add -A made with markers lists the files of yours it took in, and the undo brings them back', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/css/custom.scss': 'mine\n' }, 'One side');
  fixture.commitToHub({ 'css/custom.scss': 'theirs\n' }, 'Other side');
  const before = fixture.git(['rev-parse', 'HEAD'], site);
  assert.notEqual(gitExit(fixture, ['subtree', 'pull', '--prefix', 'shared', 'shared', 'main', '--squash', '-m', 'pull'], site), 0);
  const draft = 'docs/draft note.md';
  writeFiles(site, { [draft]: 'An unfinished note.\n' });
  fixture.git(['add', '-A'], site);
  fixture.git(['commit', '-q', '--no-edit'], site);
  const merge = fixture.git(['rev-parse', '--short', 'HEAD'], site);
  const report = fixture.status(site);
  const line = assertLine(report, 'FAIL', 'markers', /1 file of yours outside shared\/ that a git add -A took in/);
  const restore = `git restore --source=${merge} -- 'docs/draft note.md'`;
  assert.ok(line.includes(`git reset --keep HEAD~1, then ${restore}, then npm run shared:pull`), line);

  fixture.git(['update-index', '-q', '--refresh'], site);
  fixture.git(['reset', '-q', '--keep', 'HEAD~1'], site);
  assert.equal(fixture.git(['rev-parse', 'HEAD'], site), before);
  assert.equal(fs.existsSync(path.join(site, draft)), false, 'the reset alone deletes the file, which is why the line names it');
  assert.equal(fixture.git(['status', '--porcelain'], site), '', 'and git status shows nothing');
  fixture.git(['restore', `--source=${merge}`, '--', draft], site);
  assert.equal(fs.readFileSync(path.join(site, draft), 'utf8'), 'An unfinished note.\n');
  assert.equal(fixture.git(['status', '--porcelain'], site), '?? "docs/draft note.md"');
});

test('the restore line names each file up to the cap, and every path outside shared/ past it', () => {
  assert.equal(restoreLine('abc1234', ['docs/a.md', "it's.md"]), "git restore --source=abc1234 -- docs/a.md 'it'\\''s.md'");
  const many = Array.from({ length: MAX_DETAILS + 1 }, (_, index) => `docs/${index}.md`);
  assert.equal(restoreLine('abc1234', many), "git restore --source=abc1234 -- . ':(exclude)shared'");
});

test('the count on the ahead line is the commits listed under it, a pull\'s merge among them', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  fixture.subtreePull(site);
  const report = fixture.status(site);
  assertLine(report, 'warn', 'hub', /ahead of the hub by 2 commits /);
  assert.match(report.stdout, /[0-9a-f]{7} Edit/);
});

test('privacy: a word in a file or a file name fails, and the word never prints', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/css/custom.scss': 'A Zebrafish line\n', 'shared/zebrafish.md': 'x\n' }, 'Plant words');
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'privacy', /2 private hits under shared\//);
  assert.match(report.stdout, /shared\/css\/custom\.scss:1 matches line 2 of the word list/);
  assert.match(report.stdout, /the file name shared\/\*{9}\.md matches line 2/);
  assert.doesNotMatch(report.output, /zebrafish/i);
});

test('privacy: a secret shape fails, and the secret never prints', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const secret = `${'gh'}p_${'abcdefghijklmnopqrstuvwxyz0123456789'}`;
  fixture.commitToSite(site, { 'shared/README.md': `${secret}\n` }, 'Plant a secret');
  const report = fixture.status(site);
  assertLine(report, 'FAIL', 'privacy', /1 private hit /);
  assert.match(report.stdout, /looks like a GitHub token/);
  assert.doesNotMatch(report.output, new RegExp(secret));
  const second = fixture.addSite('two');
  fixture.commitToSite(second, EDIT, `Paste ${secret} by mistake`);
  const subjects = fixture.status(second);
  assertLine(subjects, 'FAIL', 'subjects', /1 private hit in commit subjects/);
  assert.doesNotMatch(subjects.output, new RegExp(secret));
});

test('subjects: a word in an outgoing or incoming subject fails, and stays hidden', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Fix the Zebrafish page');
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'subjects', /1 private hit in commit subjects/);
  assert.match(report.stdout, /subject hidden/);
  assert.doesNotMatch(report.output, /zebrafish/i);

  const outgoing = assertLine(report, 'FAIL', 'subjects', /1 private hit in commit subjects {2}/);
  assert.ok(outgoing.endsWith('(fix: reword the commit before it is pushed)'), outgoing);

  const clean = fixture.addSite('clean');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Tell of a quokka');
  const incoming = assertLine(fixture.status(clean), 'FAIL', 'subjects', /1 private hit in commit subjects on the hub {2}/);
  assert.match(incoming, /\(fix: a subject only changes by rewriting the hub, .*rewritten hub\. Decide that with whoever runs the hub\.\)$/, 'a new commit leaves it in the hub');
});

test('subjects: a word in a body only warns', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.git(['commit', '-q', '--allow-empty', '-m', 'Clean'], site);
  writeFiles(site, EDIT);
  fixture.git(['add', '--', 'shared/README.md'], site);
  fixture.git(['commit', '-q', '-m', 'A clean subject', '-m', 'A zebrafish in the body'], site);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'warn', 'subjects', /1 private hit in commit bodies/);
});

test('a missing word list warns loudly and the shapes still run', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fs.rmSync(fixture.wordList);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK);
  assertLine(report, 'warn', 'words', /WORD LIST MISSING OR EMPTY/);
});

test('a word list line the reader cannot take warns by its number, and its word is still read', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const lines = fs.readFileSync(fixture.wordList, 'utf8').split('\n').length;
  fs.appendFileSync(fixture.wordList, 'otter\tdocs/a.md\textra\n');
  fixture.commitToSite(site, { 'shared/notes.md': 'An otter here.\n' }, 'Add a note');
  const report = fixture.status(site);
  assertLine(report, 'warn', 'words', new RegExp(`word list line ${lines}: more than one tab, or no word {2}\\(fix: mend them: check-public refuses the list until then\\)$`));
  assertLine(report, 'FAIL', 'privacy', /1 private hit under shared\//);
  assert.match(report.stdout, new RegExp(`word list line ${lines}\\b`));
  assert.doesNotMatch(report.stdout, /otter/);
});

test('stubs: deleted in turn, each one is reported; a local copy warns', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'src/theme/Admonition/Types.js': "export { default } from '@site/shared/theme/Admonition/Types';\n", 'docusaurus.config.js': "const { admonitionsConfig } = require('./shared/css/custom.scss');\n" }, 'Add a theme stub');
  assertLine(fixture.status(site), 'ok', 'stubs', /2 of 3 stubs present/);
  for (const stub of ['src/components/Widget/index.jsx', 'src/theme/Admonition/Types.js']) {
    const text = fs.readFileSync(path.join(site, stub), 'utf8');
    fs.rmSync(path.join(site, stub));
    const report = fixture.status(site);
    assert.equal(report.status, EXIT.CHECKS);
    assertLine(report, 'FAIL', 'stubs', /1 stub missing/);
    assert.match(report.stdout, new RegExp(`${stub.replaceAll('.', '\\.')} \\(`));
    writeFiles(site, { [stub]: text });
  }
  writeFiles(site, { 'src/components/Widget/index.jsx': 'export default function Widget() {\n  return null;\n}\n' });
  assertLine(fixture.status(site), 'warn', 'stubs', /1 local copy where a stub belongs/);
});

test('MUI X: a refused term in shared code fails, a README may name it', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit');
  const term = ['MUI', 'LICENSE', 'KEY'].join('_');
  assertLine(fixture.status(site), 'ok', 'mui-x', /no MUI X licence wiring/);
  fixture.commitToSite(site, { 'shared/README.md': `Never here: ${term}.\n` }, 'Name it in the readme');
  assertLine(fixture.status(site), 'ok', 'mui-x', /no MUI X licence wiring/);
  fixture.commitToSite(site, { 'shared/components/Widget/key.js': `export const key = process.env.${term};\n` }, 'Wire it');
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'FAIL', 'mui-x', /1 refused MUI X line /);
  assert.match(report.stdout, /shared\/components\/Widget\/key\.js:1/);
});

test('split: a commit without shared/ fails, while the trees read in sync', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  remount(fixture, site);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  assertLine(report, 'warn', 'hub', /in sync at/);
  assertLine(report, 'FAIL', 'split', /1 commit without shared\/: the split would carry some of this site's own commits/);
  assert.match(report.stdout, /[0-9a-f]{7} Take the mount out/);
  assert.match(report.stdout, /git rm -r shared or a revert of the add/);
});

test('split: a revert of the add fails the same way', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  revertTheAdd(fixture, site);
  assertLine(fixture.status(site), 'FAIL', 'split', /1 commit without shared\//);
});

test('split: the subject of such a commit stays hidden when it holds a private word', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  remount(fixture, site, 'The zebrafish commit');
  const report = fixture.status(site);
  assertLine(report, 'FAIL', 'split', /1 commit without shared/);
  assert.doesNotMatch(report.output, /zebrafish/);
  assert.match(report.stdout, /subject hidden/);
});

test('split: the fix fits the state, and a site ahead is not offered a push', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  remount(fixture, site);
  assertLine(fixture.status(site), 'FAIL', 'split', /fix: publish any commit from another site, then npm run shared:pull here/);
  const ahead = fixture.addSite('two');
  remount(fixture, ahead);
  fixture.commitToSite(ahead, EDIT, 'Edit');
  const report = fixture.status(ahead);
  assertLine(report, 'FAIL', 'split', /fix: make this site's shared\/ change in another site and publish it there/);
  assertLine(report, 'warn', 'hub', /ahead of the hub by \d+ commits? +\(fix: see the split line\)/);
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  assertLine(fixture.status(site), 'FAIL', 'split', /fix: npm run shared:pull: its record closes this/);
});

test('split: with a rewritten hub as well, the hub line comes first', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const before = fixture.git(['rev-parse', 'main'], fixture.hub);
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  assert.equal(pullIn(fixture, site).status, EXIT.OK);
  remount(fixture, site);
  rewindHub(fixture, before);
  const report = fixture.status(site);
  assertLine(report, 'FAIL', 'hub', /the hub was rewritten/);
  assertLine(report, 'FAIL', 'split', /fix: see the hub line first/);
});

test('split: a site in sync or diverged with such a commit is pointed at the split line', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  remount(fixture, site);
  assertLine(fixture.status(site), 'warn', 'hub', /still waiting in the split +\(fix: see the split line\)/);
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  const report = fixture.status(site);
  assertLine(report, 'warn', 'hub', /diverged: .*fix: see the split line/);
  assertLine(report, 'FAIL', 'split', /fix: make this site's shared\/ change in another site/);
});

test('in sync with a commit still in the split warns and lists it', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { ...EDIT, 'docs/two.md': 'x\n' }, 'A mixed commit');
  const other = fixture.addSite('two');
  fixture.commitToSite(other, EDIT, 'Same edit');
  fixture.commitToSite(other, { 'shared/more.txt': 'more\n' }, 'More');
  assert.equal(pushIn(fixture, other, stubTests(fixture)).status, EXIT.OK);
  fixture.subtreePull(site);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK);
  assertLine(report, 'warn', 'hub', /in sync at [0-9a-f]{7}, with 2 commits still waiting in the split/);
  assert.match(report.stdout, /A mixed commit \[mixes in site files\]/);
});

test('a reverted pull: the fix takes the hub again, and says what a push would do', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  assert.equal(pullIn(fixture, site).status, EXIT.OK);
  fixture.git(['revert', '-m', '1', '--no-edit', 'HEAD'], site);
  const revert = fixture.git(['rev-parse', '--short=7', 'HEAD'], site);
  const report = fixture.status(site);
  const line = assertLine(report, 'warn', 'hub', /ahead of the hub by 1 commit, one of them a revert of a pull/);
  assert.ok(line.includes(`git revert --no-edit ${revert}, then npm run shared:pull`), line);
  assert.doesNotMatch(line, /fix: npm run shared:push/);
  assert.match(report.stdout, /npm run shared:push would publish that revert to every site/);
  fixture.commitToHub({ 'b.txt': 'b\n' }, 'Add another file');
  const diverged = assertLine(fixture.status(site), 'warn', 'hub', /diverged/);
  assert.ok(diverged.includes(`git revert --no-edit ${revert}, then npm run shared:pull`), diverged);
});

test('a revert of the revert goes back to the plain lines, and the fix lands on the hub', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  assert.equal(pullIn(fixture, site).status, EXIT.OK);
  fixture.git(['revert', '-m', '1', '--no-edit', 'HEAD'], site);
  fixture.git(['revert', '--no-edit', 'HEAD'], site);
  assertLine(fixture.status(site), 'warn', 'hub', /in sync at [0-9a-f]{7}, with 2 commits still waiting in the split/);
  fixture.commitToHub({ 'b.txt': 'b\n' }, 'Add another file');
  assert.equal(pullIn(fixture, site).status, EXIT.OK);
  assertLine(fixture.status(site), 'ok', 'hub', /in sync at/);
});

test('a hub that went back: the fix undoes the pull and never offers a push', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const before = fixture.git(['rev-parse', 'main'], fixture.hub);
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  assert.equal(pullIn(fixture, site).status, EXIT.OK);
  rewindHub(fixture, before);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.CHECKS);
  const line = assertLine(report, 'FAIL', 'hub', /was on the hub and is gone: the hub was rewritten/);
  assert.match(line, /no shared:push: it would publish [0-9a-f]{7} again/);
  assert.match(line, /git reset --keep HEAD~1, then npm run shared:pull/);
  assert.doesNotMatch(line, /fix: npm run shared:push/);
  pushToOrigin(fixture, site);
  const pushed = assertLine(fixture.status(site), 'FAIL', 'hub', /the hub was rewritten/);
  assert.match(pushed, /the README's row for a rewritten hub/);
  assert.doesNotMatch(pushed, /git reset/);
});

test('a server running from the checkout warns: pull will refuse', async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const server = await startServer(t, site);
  const report = await fixture.statusAsync(site);
  assert.equal(report.status, EXIT.OK);
  assertLine(report, 'warn', 'server', /1 server running from this checkout: pull refuses/);
});

test('the last line: a count and its noun agree', () => {
  const results = (...levels) => levels.map((level) => ({ level }));
  assert.equal(summary(results('ok', 'ok', 'warn')), '2 ok, 1 warning, 0 failed');
  assert.equal(summary(results('ok', 'warn', 'warn', 'FAIL')), '1 ok, 2 warnings, 1 failed');
  assert.equal(summary(results('ok')), '1 ok, 0 warnings, 0 failed');
});

test('stubs: one stub in the table reads as one', () => {
  const piece = { row: { stub: 'src/one.js' }, stub: { exists: true, target: 'shared/one.js' }, missingStub: false };
  const result = stubsCheck({ table: () => ({}), pieces: () => [piece] });
  assert.equal(result.text, '1 of 1 stub present, the rest not in use');
});

test('formatResult puts the fix on the line and the details under it', () => {
  const lines = formatResult({ level: 'warn', label: 'hub', text: 'behind', fix: 'npm run shared:pull', details: ['abc Subject'] });
  assert.equal(lines[0], 'warn hub          behind  (fix: npm run shared:pull)');
  assert.equal(lines[1], `${' '.repeat(18)}abc Subject`);
});
