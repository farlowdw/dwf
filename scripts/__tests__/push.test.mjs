/**
 * scripts/__tests__/push.test.mjs: `shared:push` as a person runs it: the real script as a child
 * process, in real sites, on a real bare hub. test:shared is a stand-in here (flows.mjs > stubTests),
 * so a test decides whether it is green. The rejections are real too: a hook in the hub refuses the
 * push, or changes the site while the push runs. A recovery a refusal prints is run for real, not
 * only read. A new refusal gets a test that makes it fire and proves that nothing moved.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EXIT } from '../lib/exitCodes.mjs';
import { STATES } from '../lib/state.mjs';
import { TEST_SCRIPT_ENV } from '../lib/testGate.mjs';
import { parseArgs } from '../push.mjs';
import { fixtureFor, writeFiles } from './fixture.mjs';
import {
  assertExit, gitExit, head, hubHook, hubSubjects, hubTip, hubTree, pullIn, pushIn, pushToOrigin, remount, revertTheAdd,
  rewindHub, runIn, sharedTree, snapshot, stateOf, stubTests,
} from './flows.mjs';

const EDIT = { 'shared/README.md': 'Edited in a site.\n' };
const EDIT_AGAIN = { 'shared/README.md': 'Edited again.\n' };
const SITE_FILE = { 'docs/two.md': 'A site page.\n' };
const SEED_SUBJECTS = ['Seed the hub'];

/** Built here so this file never matches the secret shapes it tests. */
const PLANTED_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

/** A fixture with one site and green tests. */
function oneSite(t) {
  const fixture = fixtureFor(t);
  return { fixture, tests: stubTests(fixture), site: fixture.addSite('one') };
}

test('a shared-only commit goes out: verbatim subject, rejoined, in sync, the other sites named', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.addSite('two');
  fixture.addSite('three');
  fixture.commitToSite(site, EDIT, 'Say more in the readme');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.OK);
  assert.equal(tests.runs(), 1);
  assert.deepEqual(hubSubjects(fixture), ['Say more in the readme', ...SEED_SUBJECTS]);
  assert.equal(hubTree(fixture), sharedTree(fixture, site));
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  const tip = hubTip(fixture).slice(0, 7);
  assert.equal(fixture.git(['log', '-1', '--format=%s'], site), `shared: rejoin ${tip}`);
  assert.match(result.stdout, new RegExp(`The hub is at ${tip}, and this site is rejoined`));
  assert.match(result.stdout, /Say more in the readme/);
  assert.match(result.stdout, /Other sites to pull[^\n]*\n {2}three\n {2}two\n/);
  assert.doesNotMatch(result.stdout, /\n {2}one\n/);
});

test('the loop in both directions: every tree ends equal, and the next push has nothing to do', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const other = fixture.addSite('two');
  fixture.commitToSite(site, EDIT, 'First change');
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assertExit(pullIn(fixture, other), EXIT.OK);
  fixture.commitToSite(other, { 'shared/css/custom.scss': 'changed\n' }, 'Second change');
  assertExit(pushIn(fixture, other, tests), EXIT.OK);
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.equal(sharedTree(fixture, site), hubTree(fixture));
  assert.equal(sharedTree(fixture, other), hubTree(fixture));
  assert.deepEqual(hubSubjects(fixture), ['Second change', 'First change', ...SEED_SUBJECTS]);
  const before = snapshot(fixture, site);
  const again = pushIn(fixture, site, tests);
  assertExit(again, EXIT.OK);
  assert.match(again.stdout, /Nothing to push: in sync/);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('a site commit that only touches site files needs no push', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, SITE_FILE, 'A site page');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /Nothing to push/);
  assert.equal(tests.runs(), 0);
});

test('behind and diverged refuse, because the push would be rejected', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  const behind = pushIn(fixture, site, tests);
  assertExit(behind, EXIT.REFUSED);
  assert.match(behind.stderr, /the hub moved/);
  assert.match(behind.stderr, /npm run shared:pull/);
  fixture.commitToSite(site, EDIT, 'Edit');
  const before = snapshot(fixture, site);
  const diverged = pushIn(fixture, site, tests);
  assertExit(diverged, EXIT.REFUSED);
  assert.match(diverged.stderr, /diverged/);
  assert.deepEqual(snapshot(fixture, site), before);
  assert.equal(tests.runs(), 0);
});

test('a changed tree refuses before anything leaves: a plain subtree push would publish here', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'Edit');
  writeFiles(site, { 'docs/intro.md': 'Changed.\n' });
  const before = snapshot(fixture, site);
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /1 changed tracked file/);
  assert.match(result.stderr, /-m "Subject"/);
  assert.deepEqual(snapshot(fixture, site), before);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
});

test('another branch, a worktree and an open merge refuse', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.git(['switch', '-q', '-c', 'side'], site);
  assert.match(pushIn(fixture, site, tests).stderr, /on side, not master/);
  const worktree = path.join(fixture.base, 'worktree');
  fixture.git(['worktree', 'add', '-q', worktree, 'master'], site);
  assert.match(pushIn(fixture, worktree, tests).stderr, /this is a worktree/);
  fixture.git(['worktree', 'remove', worktree], site);
  fixture.git(['switch', '-q', 'master'], site);
  fixture.git(['switch', '-q', '-c', 'late'], site);
  fixture.commitToSite(site, { 'shared/README.md': 'From late.\n' }, 'On late');
  fixture.git(['switch', '-q', 'master'], site);
  fixture.commitToSite(site, { 'shared/README.md': 'From master.\n' }, 'On master');
  assert.notEqual(gitExit(fixture, ['merge', 'late'], site), 0);
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /a merge is still open/);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
});

test('conflict markers under shared/ refuse: a git ci during a conflict stops here', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const marker = `${'<'.repeat(7)} HEAD\nmine\n${'='.repeat(7)}\ntheirs\n${'>'.repeat(7)} other\n`;
  fixture.commitToSite(site, { 'shared/css/custom.scss': marker }, 'Commit a conflict');
  const before = snapshot(fixture, site);
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /FAIL +markers/);
  assert.match(result.stderr, /shared\/css\/custom\.scss:1/);
  assert.deepEqual(snapshot(fixture, site), before);
  assert.equal(tests.runs(), 0);
});

test('a file touched while the tests run, its content the same, does not stop the rejoin', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const touch = [
    "const [file] = execFileSync('git', ['ls-files', 'shared'], { encoding: 'utf8' }).split('\\n');",
    'const later = new Date(Date.now() + 100000);',
    'fs.utimesSync(file, later, later);',
  ].join('\n');
  const tests = stubTests(fixture, { code: touch });
  fixture.commitToSite(site, { 'shared/notes.txt': 'A note.\n' }, 'Add a note');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.OK);
  assert.equal(tests.runs(), 1);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
});

test('a requirements.cjs that does not load is refused, --skip-tests and all', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, { 'shared/requirements.cjs': "module.exports = { RANGES: {} ENTRIES: [] };\n" }, 'Lose a comma');
  const result = pushIn(fixture, site, tests, ['--skip-tests']);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /FAIL +packages +shared\/requirements\.cjs does not load: SyntaxError/);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
});

test('a private word inside a binary file under shared/ refuses, and the word never prints', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const font = Buffer.concat([Buffer.from('wOF2'), Buffer.from([0, 1, 0, 0]), Buffer.from('name: Zebrafish Sans')]);
  fixture.commitToSite(site, { 'shared/static/font.woff2': font }, 'Add a font');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /shared\/static\/font\.woff2, a binary file, matches line 2 of the word list/);
  assert.doesNotMatch(result.output, /zebrafish/i);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
});

test('a private word or a secret shape under shared/ refuses, and the word never prints', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, { 'shared/notes.md': 'first\nthe quokka line\n' }, 'Add notes');
  const inFile = pushIn(fixture, site, tests);
  assertExit(inFile, EXIT.REFUSED);
  assert.match(inFile.stderr, /shared\/notes\.md:2 matches line 3 of the word list/);
  assert.doesNotMatch(inFile.output, /quokka/i);
  fixture.commitToSite(site, { 'shared/notes.md': 'plain\n', 'shared/quokka.md': 'plain\n' }, 'Rename notes');
  const inName = pushIn(fixture, site, tests);
  assertExit(inName, EXIT.REFUSED);
  assert.match(inName.stderr, /the file name shared\/\*{6}\.md/);
  assert.doesNotMatch(inName.output, /quokka/i);
  fixture.git(['rm', '-q', 'shared/quokka.md'], site);
  fixture.commitToSite(site, { 'shared/keys.txt': `${PLANTED_KEY}\n` }, 'Add a list');
  const shape = pushIn(fixture, site, tests);
  assertExit(shape, EXIT.REFUSED);
  assert.match(shape.stderr, /looks like an AWS key/);
  assert.doesNotMatch(shape.output, new RegExp(PLANTED_KEY));
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
});

test('licence wiring and an ignored file under shared/ refuse', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, { 'shared/wire.js': "const key = process.env.MUI_LICENSE_KEY;\n" }, 'Wire a key');
  assert.match(pushIn(fixture, site, tests).stderr, /FAIL +mui-x/);
  fixture.commitToSite(site, { 'shared/wire.js': 'export {};\n' }, 'Drop the key');
  writeFiles(site, { 'shared/archive.gz': 'not committed\n' });
  const ignored = pushIn(fixture, site, tests);
  assertExit(ignored, EXIT.REFUSED);
  assert.match(ignored.stderr, /FAIL +ignored/);
  assert.match(ignored.stderr, /shared\/archive\.gz/);
});

test('a shared/node_modules refuses a push and -m, nothing moves, and removing it clears the way', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const folder = path.join(site, 'shared/node_modules');
  writeFiles(site, { 'shared/node_modules/pad/index.js': 'module.exports = 1;\n', ...EDIT });
  const before = snapshot(fixture, site);
  const withMessage = pushIn(fixture, site, tests, ['-m', 'Edit the readme']);
  assertExit(withMessage, EXIT.REFUSED);
  assert.match(withMessage.stderr, /FAIL +node_modules +shared\/node_modules exists/);
  assert.deepEqual(snapshot(fixture, site), before);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
  gitExit(fixture, ['add', '--', 'shared/README.md'], site);
  gitExit(fixture, ['commit', '-q', '-m', 'Edit the readme'], site);
  const plain = pushIn(fixture, site, tests);
  assertExit(plain, EXIT.REFUSED);
  assert.match(plain.stderr, /FAIL +node_modules/);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
  fs.rmSync(folder, { recursive: true });
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
});

test('a hit taken out by a later commit goes out with a warning, which never prints the word', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, { 'shared/notes.md': 'Zebrafish\n' }, 'Add notes');
  fixture.commitToSite(site, { 'shared/notes.md': 'Plain\n' }, 'Reword the notes');
  const declined = pushIn(fixture, site, tests, [], { plain: true, input: 'n\n' });
  assertExit(declined, EXIT.REFUSED);
  assert.match(declined.stderr, /Warning: commit [0-9a-f]{7}: shared\/notes\.md:1 matches line \d+ of the word list\. It stays in the hub's history\./);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.OK);
  assert.match(result.stderr, /Warning: commit/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /zebrafish/i);
  assert.equal(hubSubjects(fixture).length, SEED_SUBJECTS.length + 2);
});

test('a clean history prints no such warning', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'Say more in the readme');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.OK);
  assert.doesNotMatch(result.stderr, /Warning/);
});

test('no word list refuses; --no-word-list publishes, says so, and still scans the shapes', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'Edit');
  fs.rmSync(fixture.wordList);
  const refused = pushIn(fixture, site, tests);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /the word list is missing/);
  fixture.commitToSite(site, { 'shared/keys.txt': `${PLANTED_KEY}\n` }, 'Add a list');
  assertExit(pushIn(fixture, site, tests, ['--no-word-list']), EXIT.REFUSED);
  fixture.commitToSite(site, { 'shared/keys.txt': 'plain\n' }, 'Replace the list');
  const result = pushIn(fixture, site, tests, ['--no-word-list']);
  assertExit(result, EXIT.OK);
  assert.match(result.stderr, /WARNING: no word list/);
});

test('a private word in a subject going out refuses, masked, and a reworded commit goes', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const sha = fixture.commitToSite(site, EDIT, 'Tweak for the Zebrafish project');
  const before = snapshot(fixture, site);
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /commit [0-9a-f]{7}'s subject matches line 2 of the word list/);
  assert.doesNotMatch(result.output, /zebrafish/i);
  assert.doesNotMatch(result.output, new RegExp(`${sha}`));
  assert.deepEqual(snapshot(fixture, site), before);
  assert.equal(tests.runs(), 0);
  fixture.git(['commit', '--amend', '-q', '-m', 'Tweak the readme'], site);
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['Tweak the readme', ...SEED_SUBJECTS]);
});

test('a mixed commit with a private word is refused for the word, and never printed', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Quokka page and a shared tweak');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /a subject going out holds a private hit/);
  assert.doesNotMatch(result.output, /quokka/i);
});

test('a private word in a body warns once and goes out: a body stays on the hub', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'A clean subject\n\nA note about the quokka.');
  writeFiles(site, EDIT_AGAIN);
  const result = pushIn(fixture, site, tests, ['-m', 'A second clean subject']);
  assertExit(result, EXIT.OK);
  const warning = /Warning: commit [0-9a-f]{7}'s body matches line 3 of the word list/g;
  assert.equal(result.stderr.match(warning)?.length, 1, result.output);
  assert.doesNotMatch(result.output, /quokka/i);
});

test('a mixed commit refuses, and the printed split works', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Site page plus a shared tweak');
  const before = snapshot(fixture, site);
  const refused = pushIn(fixture, site, tests);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /1 commit mixes shared\/ with site files/);
  assert.match(refused.stderr, /[0-9a-f]{7} Site page plus a shared tweak/);
  assert.match(refused.stderr, /git reset HEAD~1/);
  assert.doesNotMatch(refused.stderr, /git rebase/);
  assert.match(refused.stderr, /git add -- docs\/two\.md && git commit/);
  assert.match(refused.stderr, /shared:push -- -m/);
  assert.deepEqual(snapshot(fixture, site), before);
  assert.equal(tests.runs(), 0);
  fixture.git(['reset', '-q', 'HEAD~1'], site);
  fixture.git(['add', 'shared'], site);
  fixture.git(['commit', '-q', '-m', 'Say more in the readme'], site);
  fixture.git(['add', '--', 'docs/two.md'], site);
  fixture.git(['commit', '-q', '-m', 'A site page'], site);
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['Say more in the readme', ...SEED_SUBJECTS]);
  assert.equal(fixture.git(['ls-tree', '--name-only', 'main', 'docs/'], fixture.hub), '');
});

test('an older mixed commit: the printed rebase works', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const mixed = fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Site page plus a shared tweak');
  fixture.commitToSite(site, { 'docs/three.md': 'x\n' }, 'A later site page');
  const refused = pushIn(fixture, site, tests);
  assertExit(refused, EXIT.REFUSED);
  const lines = refused.stderr.split('\n').map((text) => text.trim());
  const rebase = lines.find((text) => text.startsWith('git rebase -i'));
  assert.equal(rebase, `git rebase -i ${mixed.slice(0, 7)}~1`, 'the command line stands alone');
  assert.ok(lines.includes(`then, in the list that opens, mark ${mixed.slice(0, 7)} as edit, save and close it, and run:`), refused.stderr);
  assert.match(refused.stderr, /git rebase --continue/);
  const markFirstAsEdit = { GIT_SEQUENCE_EDITOR: "perl -pi -e 's/^pick/edit/ if $. == 1'" };
  const printed = spawnSync('sh', ['-c', rebase], { cwd: site, env: { ...fixture.env, ...markFirstAsEdit } });
  assert.equal(printed.status, 0, String(printed.stderr));
  fixture.git(['reset', '-q', 'HEAD~1'], site);
  fixture.git(['add', 'shared'], site);
  fixture.git(['commit', '-q', '-m', 'Say more in the readme'], site);
  fixture.git(['add', '--', 'docs/two.md'], site);
  fixture.git(['commit', '-q', '-m', 'A site page'], site);
  fixture.git(['rebase', '--continue'], site);
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['Say more in the readme', ...SEED_SUBJECTS]);
});

test('a mixed commit that reached the hub long ago is not held against a commit of the same second', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const moment = '2026-01-02T03:04:05Z';
  const sameMoment = { GIT_AUTHOR_DATE: moment, GIT_COMMITTER_DATE: moment };
  writeFiles(site, { ...EDIT, ...SITE_FILE });
  fixture.git(['add', 'shared', 'docs'], site);
  fixture.git(['commit', '-q', '-m', 'An old mixed commit'], site, sameMoment);
  fixture.subtreePush(site);
  fixture.rejoin(site);
  writeFiles(site, EDIT_AGAIN);
  fixture.git(['add', 'shared'], site);
  fixture.git(['commit', '-q', '-m', 'A clean edit'], site, sameMoment);
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['A clean edit', 'An old mixed commit', ...SEED_SUBJECTS]);
});

test('the hub moved and a commit is mixed: the mixed refusal comes first, while it can be split', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Site page plus a shared tweak');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /1 commit mixes shared\//);
  assert.match(result.stderr, /git reset HEAD~1/);
});

test('the hub moved and a mixed commit has a private subject: the refusal hides the subject', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Tweak for the Zebrafish project');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /1 commit mixes shared\//);
  assert.match(result.stderr, /\(subject hidden: it holds a private hit\)/);
  assert.doesNotMatch(result.stderr, /zebrafish/i);
});

test('a mixed commit behind a pull by hand is caught, though shared/ equals the hub', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const other = fixture.addSite('two');
  fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Site page plus a shared tweak');
  pushToOrigin(fixture, site);
  fixture.commitToSite(other, { ...EDIT, 'shared/more.txt': 'more\n' }, 'Two shared changes');
  assertExit(pushIn(fixture, other, tests), EXIT.OK);
  fixture.subtreePull(site);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  fixture.commitToSite(site, EDIT_AGAIN, 'A clean edit');
  const before = snapshot(fixture, site);
  const refused = pushIn(fixture, site, tests);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /1 commit mixes shared\//);
  assert.match(refused.stderr, /Site page plus a shared tweak/);
  assert.deepEqual(snapshot(fixture, site), before);
  assert.deepEqual(hubSubjects(fixture), ['Two shared changes', ...SEED_SUBJECTS]);
});

test('a mixed commit behind a shared:pull stays out: the pull lands on the hub and records it', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const other = fixture.addSite('two');
  fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Site page plus a shared tweak');
  pushToOrigin(fixture, site);
  fixture.commitToSite(other, { ...EDIT, 'shared/more.txt': 'more\n' }, 'Two shared changes');
  assertExit(pushIn(fixture, other, tests), EXIT.OK);
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  fixture.commitToSite(site, EDIT_AGAIN, 'A clean edit');
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['A clean edit', 'Two shared changes', ...SEED_SUBJECTS]);
});

/** A site whose next split would carry its own commits, with a change of its own to publish. */
function carryingSite(t, poison = remount) {
  const context = oneSite(t);
  poison(context.fixture, context.site);
  context.fixture.commitToSite(context.site, EDIT, 'Edit after the way back');
  return context;
}

for (const [name, poison] of [['git rm and a fresh add', remount], ['a revert of the add and its way back', revertTheAdd]]) {
  test(`a split that carries the site's commits is refused, with --yes: ${name}`, (t) => {
    const { fixture, tests, site } = carryingSite(t, poison);
    const before = snapshot(fixture, site);
    const refused = pushIn(fixture, site, tests);
    assertExit(refused, EXIT.REFUSED);
    assert.match(refused.stderr, /shared:push refused: the split would carry \d+ of this site's own commits to the hub, in \d+ commits\./);
    assert.match(refused.stderr, /git rm -r shared or a revert of the add/);
    assert.match(refused.stderr, /Fix: make this site's shared\/ change in another site and publish it there, then npm run shared:pull here/);
    assert.match(refused.stderr, /Nothing was changed\./);
    assert.deepEqual(snapshot(fixture, site), before);
    assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
    assert.equal(tests.runs(), 0);
  });
}

test('the same split is refused with --skip-tests and without --yes, before any question', (t) => {
  const { fixture, tests, site } = carryingSite(t);
  const refused = pushIn(fixture, site, tests, ['--skip-tests'], { plain: true, input: 'y\n' });
  assertExit(refused, EXIT.REFUSED);
  assert.doesNotMatch(refused.stdout, /About to publish/);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
});

test('-m stops before it commits when the split would carry the site\'s commits', (t) => {
  const { fixture, tests, site } = oneSite(t);
  remount(fixture, site);
  writeFiles(site, EDIT);
  const headBefore = head(fixture, site);
  const refused = pushIn(fixture, site, tests, ['-m', 'A change']);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /the split would carry/);
  assert.equal(head(fixture, site), headBefore);
  assert.equal(fixture.git(['status', '--porcelain', '--', 'shared'], site), 'M shared/README.md');
  assert.equal(tests.runs(), 0);
});

test('this refusal comes before the subject scan, and hides a private subject', (t) => {
  const { fixture, tests, site } = oneSite(t);
  remount(fixture, site, 'The zebrafish commit');
  fixture.commitToSite(site, EDIT, 'Edit after the way back');
  const refused = pushIn(fixture, site, tests);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /the split would carry/);
  assert.doesNotMatch(refused.stderr, /a subject going out/);
  assert.doesNotMatch(refused.output, /zebrafish/);
  assert.match(refused.stderr, /subject hidden/);
});

test('a site that published first and leaked after is refused too', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'Edit');
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  remount(fixture, site);
  fixture.commitToSite(site, EDIT_AGAIN, 'Edit after the way back');
  assertExit(pushIn(fixture, site, tests), EXIT.REFUSED);
  assert.deepEqual(hubSubjects(fixture), ['Edit', ...SEED_SUBJECTS]);
});

test('a rejoin without its push, on such a site, is refused', (t) => {
  const { fixture, tests, site } = carryingSite(t);
  fixture.rejoin(site);
  fixture.commitToSite(site, EDIT_AGAIN, 'Another edit');
  const refused = pushIn(fixture, site, tests);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /the split would carry/);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
});

test('a hub that went back: a push refuses, and does not publish that commit again', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const before = hubTip(fixture);
  fixture.commitToHub({ 'bad.txt': 'bad\n' }, 'A bad commit');
  assertExit(pullIn(fixture, site), EXIT.OK);
  rewindHub(fixture, before);
  const refused = pushIn(fixture, site, tests);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /was on the hub and is gone: the hub was rewritten/);
  assert.match(refused.stderr, /Fix: no shared:push: it would publish [0-9a-f]{7} again/);
  assert.equal(hubTip(fixture), before);
});

test('that hub, after the printed step: the pull is undone and the site reads in sync', (t) => {
  const { fixture, site } = oneSite(t);
  const before = hubTip(fixture);
  fixture.commitToHub({ 'bad.txt': 'bad\n' }, 'A bad commit');
  assertExit(pullIn(fixture, site), EXIT.OK);
  rewindHub(fixture, before);
  fixture.git(['reset', '--keep', 'HEAD~1'], site);
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  assert.equal(fs.existsSync(path.join(site, 'shared', 'bad.txt')), false);
});

test('a mixed commit that cannot be split goes around, and none of it reaches the hub', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const other = fixture.addSite('two');
  fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Site page plus a shared tweak');
  pushToOrigin(fixture, site);
  const refused = pushIn(fixture, site, tests);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /It is already on a remote/);
  assert.match(refused.stderr, /in another site/);
  writeFiles(other, EDIT);
  assertExit(pushIn(fixture, other, tests, ['-m', 'Say more in the readme']), EXIT.OK);
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  fixture.commitToSite(site, EDIT_AGAIN, 'A clean edit');
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['A clean edit', 'Say more in the readme', ...SEED_SUBJECTS]);
});

test('red tests refuse and nothing moves; --skip-tests is the one way past, and it says so', (t) => {
  const { fixture, site } = oneSite(t);
  const red = stubTests(fixture, { exitCode: 1 });
  fixture.commitToSite(site, EDIT, 'Edit');
  const before = snapshot(fixture, site);
  const refused = pushIn(fixture, site, red);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /test:shared is red: it stopped with exit code 1/);
  assert.match(refused.stderr, /--skip-tests/);
  assert.equal(red.runs(), 1);
  assert.deepEqual(snapshot(fixture, site), before);
  const result = pushIn(fixture, site, red, ['--skip-tests']);
  assertExit(result, EXIT.OK);
  assert.equal(red.runs(), 1);
  assert.match(result.stderr, /--skip-tests: test:shared did not run/);
  assert.deepEqual(hubSubjects(fixture), ['Edit', ...SEED_SUBJECTS]);
});

test('tests that cannot start count as red', (t) => {
  const { fixture, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'Edit');
  const missing = { env: { [TEST_SCRIPT_ENV]: path.join(fixture.base, 'gone.mjs') } };
  const result = pushIn(fixture, site, missing);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /test:shared is red: .*gone\.mjs does not exist/);
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
});

test('it asks once: y publishes, n stops, no answer stops and names --yes', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'Edit');
  const before = snapshot(fixture, site);
  const declined = pushIn(fixture, site, tests, [], { plain: true, input: 'n\n' });
  assertExit(declined, EXIT.REFUSED);
  assert.match(declined.stdout, /Publish them\? \[y\/N\]/);
  assert.match(declined.stdout, /Not published\./);
  const silent = pushIn(fixture, site, tests, [], { plain: true });
  assertExit(silent, EXIT.REFUSED);
  assert.match(silent.stdout, /no answer\. Pass --yes/);
  assert.deepEqual(snapshot(fixture, site), before);
  assertExit(pushIn(fixture, site, tests, [], { plain: true, input: 'y\n' }), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['Edit', ...SEED_SUBJECTS]);
});

test('a rejected push exits 5 and runs no rejoin; the same push goes through once the hub allows it', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const removeHook = hubHook(fixture, 'pre-receive', 'echo "the hub says no" >&2\nexit 1');
  fixture.commitToSite(site, EDIT, 'Edit');
  const before = snapshot(fixture, site);
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.GIT);
  assert.match(result.output, /the hub says no/);
  assert.match(result.stderr, /No rejoin ran, so this site is as it was\./);
  assert.match(result.stderr, /The hub declined it: read the remote: lines above, fix what they name, then run this again\./);
  assert.doesNotMatch(result.stderr, /shared:pull/, 'a pull changes nothing for a push the hub declines');
  assert.deepEqual(snapshot(fixture, site), before);
  assert.equal(stateOf(fixture, site), STATES.AHEAD);
  removeHook();
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
});

test('a push declined after -m says the commit stays, not that the site is as it was', (t) => {
  const { fixture, tests, site } = oneSite(t);
  hubHook(fixture, 'pre-receive', 'exit 1');
  writeFiles(site, EDIT);
  const result = pushIn(fixture, site, tests, ['-m', 'Say more']);
  assertExit(result, EXIT.GIT);
  assert.match(result.stderr, /No rejoin ran, and the commit made with -m stays: npm run shared:push publishes it later\./);
  assert.doesNotMatch(result.stderr, /as it was/);
});

test('the hub moves while the tests run: rejected, no rejoin, the local edit stays, pull then push', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const script = [
    `const options = { cwd: ${JSON.stringify(fixture.hubWork)}, stdio: 'ignore' };`,
    "fs.writeFileSync(`${options.cwd}/late.txt`, 'late\\n');",
    "execFileSync('git', ['add', 'late.txt'], options);",
    "execFileSync('git', ['commit', '-q', '-m', 'Landed during the tests'], options);",
    "execFileSync('git', ['push', '-q', 'origin', 'main'], options);",
  ].join('\n');
  const racing = stubTests(fixture, { code: script });
  fixture.commitToSite(site, EDIT, 'Edit');
  const before = head(fixture, site);
  const result = pushIn(fixture, site, racing);
  assertExit(result, EXIT.GIT);
  assert.match(result.stderr, /The hub moved while this push ran\. Run npm run shared:pull, then push again\./);
  assert.equal(head(fixture, site), before);
  assert.equal(fs.readFileSync(path.join(site, 'shared/README.md'), 'utf8'), EDIT['shared/README.md']);
  assert.deepEqual(hubSubjects(fixture), ['Landed during the tests', ...SEED_SUBJECTS]);
  assertExit(pullIn(fixture, site), EXIT.OK);
  assertExit(pushIn(fixture, site, stubTests(fixture)), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  assert.equal(sharedTree(fixture, site), hubTree(fixture));
});

test('a rejoin that fails exits 7, and running it again on a clean tree finishes', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const removeHook = hubHook(fixture, 'post-receive', `printf 'dirty\\n' >> '${site}/docs/intro.md'`);
  fixture.commitToSite(site, EDIT, 'Edit');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.NOT_REJOINED);
  assert.match(result.stderr, /The push reached the hub, and the rejoin stopped with exit code/);
  assert.match(result.stderr, /picks up at the rejoin/);
  assert.deepEqual(hubSubjects(fixture), ['Edit', ...SEED_SUBJECTS]);
  assert.equal(stateOf(fixture, site), STATES.PUSHED_NOT_REJOINED);
  removeHook();

  const dirty = pushIn(fixture, site, tests);
  assertExit(dirty, EXIT.REFUSED);
  assert.match(dirty.stderr, /docs\/intro\.md/);

  fixture.git(['checkout', '--', 'docs/intro.md'], site);
  const hubBefore = hubTip(fixture);
  const resumed = pushIn(fixture, site, tests);
  assertExit(resumed, EXIT.OK);
  assert.match(resumed.stdout, /The hub already holds this push/);
  assert.equal(hubTip(fixture), hubBefore);
  assert.equal(tests.runs(), 1);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
});

test('resume asks nothing and tests nothing: after a bare git subtree push it only rejoins', (t) => {
  const { fixture, site } = oneSite(t);
  const red = stubTests(fixture, { exitCode: 1 });
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.subtreePush(site);
  const result = pushIn(fixture, site, red, [], { plain: true });
  assertExit(result, EXIT.OK);
  assert.equal(red.runs(), 0);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
});

test('the hub holds this tree from another site: the push records it and publishes nothing', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const other = fixture.addSite('two');
  fixture.commitToSite(site, EDIT, 'The same change here');
  fixture.commitToSite(other, EDIT, 'The same change there');
  assertExit(pushIn(fixture, other, tests), EXIT.OK);
  const hubBefore = hubTip(fixture);
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /The hub holds this tree from other commits/);
  assert.equal(hubTip(fixture), hubBefore);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  fixture.commitToSite(site, EDIT_AGAIN, 'A later change');
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['A later change', 'The same change there', ...SEED_SUBJECTS]);
});

test('a rejoin that ran without its push: the push sends what the record already names', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.rejoin(site);
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['Edit', ...SEED_SUBJECTS]);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  assert.equal(sharedTree(fixture, site), hubTree(fixture));
});

test('-m runs the tests on the changed tree, commits shared/ alone, then publishes', (t) => {
  const fixture = fixtureFor(t);
  const seen = path.join(fixture.base, 'seen.txt');
  const code = `fs.writeFileSync(${JSON.stringify(seen)}, execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }));`;
  const tests = stubTests(fixture, { code });
  const site = fixture.addSite('one');
  writeFiles(site, { ...EDIT, 'shared/brand-new.txt': 'new\n', 'untracked-site-file.md': 'scratch\n' });
  const result = pushIn(fixture, site, tests, ['-m', 'Say more in the readme']);
  assertExit(result, EXIT.OK);
  assert.match(fs.readFileSync(seen, 'utf8'), /M shared\/README\.md/);
  assert.equal(tests.runs(), 1);
  assert.deepEqual(hubSubjects(fixture), ['Say more in the readme', ...SEED_SUBJECTS]);
  assert.equal(fixture.git(['show', 'main:brand-new.txt'], fixture.hub), 'new');
  assert.equal(fixture.git(['status', '--porcelain'], site), '?? untracked-site-file.md');
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
});

test('-m on red tests commits nothing, and the changes stay in the tree', (t) => {
  const { fixture, site } = oneSite(t);
  const red = stubTests(fixture, { exitCode: 1 });
  writeFiles(site, EDIT);
  const before = snapshot(fixture, site);
  const result = pushIn(fixture, site, red, ['-m', 'Subject']);
  assertExit(result, EXIT.REFUSED);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('-m with a changed site file refuses: it commits shared/ alone', (t) => {
  const { fixture, tests, site } = oneSite(t);
  writeFiles(site, { ...EDIT, 'docs/intro.md': 'Changed.\n' });
  const before = snapshot(fixture, site);
  const result = pushIn(fixture, site, tests, ['-m', 'Subject']);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /1 changed tracked file/);
  assert.match(result.stderr, /docs\/intro\.md/);
  assert.doesNotMatch(result.stderr, /shared\/README\.md/);
  assert.deepEqual(snapshot(fixture, site), before);
  assert.equal(tests.runs(), 0);
});

test('-m checks before it commits: the subject, a new file, and nothing to commit', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const nothing = pushIn(fixture, site, tests, ['-m', 'Subject']);
  assertExit(nothing, EXIT.REFUSED);
  assert.match(nothing.stderr, /nothing to commit under shared\//);
  writeFiles(site, { 'shared/new.md': 'the quokka line\n' });
  const before = snapshot(fixture, site);
  const newFile = pushIn(fixture, site, tests, ['-m', 'Subject']);
  assertExit(newFile, EXIT.REFUSED);
  assert.match(newFile.stderr, /shared\/new\.md:1 matches line 3/);
  writeFiles(site, { 'shared/new.md': 'plain\n' });
  const word = pushIn(fixture, site, tests, ['-m', 'For the Zebrafish page']);
  assertExit(word, EXIT.REFUSED);
  assert.match(word.stderr, /the subject you gave matches line 2 of the word list/);
  assert.doesNotMatch(word.output, /zebrafish/i);
  const shape = pushIn(fixture, site, tests, ['-m', `Add ${PLANTED_KEY}`]);
  assertExit(shape, EXIT.REFUSED);
  assert.match(shape.stderr, /the subject you gave looks like an AWS key/);
  assert.equal(head(fixture, site), before.head);
  assert.equal(tests.runs(), 0);
});

test('-m when the hub moved, or a mixed commit waits, refuses before it commits', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const mixed = fixture.addSite('mixed');
  fixture.commitToHub({ 'a.txt': 'a\n' }, 'Add a file');
  writeFiles(site, EDIT);
  const before = snapshot(fixture, site);
  const moved = pushIn(fixture, site, tests, ['-m', 'Tighten the margins']);
  assertExit(moved, EXIT.REFUSED);
  assert.match(moved.stderr, /the hub moved, and a pull needs a clean tree/);
  assert.match(moved.stderr, /git add shared && git commit -m 'Tighten the margins', then npm run shared:pull/, 'the subject given, to paste');
  const quoted = pushIn(fixture, site, tests, ['-m', "Price the $5 plan's page"]);
  const line = quoted.stderr.match(/git commit -m (.*), then npm run shared:pull/)[1];
  const hasFish = spawnSync('fish', ['--version']).status === 0;
  for (const shell of [['sh', '-c'], ...(hasFish ? [['fish', '--no-config', '-c']] : [])]) {
    const echoed = spawnSync(shell[0], [...shell.slice(1), `printf %s ${line}`], { encoding: 'utf8' });
    assert.equal(echoed.stdout, "Price the $5 plan's page", `${shell[0]} reads the printed subject as given`);
  }
  assert.deepEqual(snapshot(fixture, site), before);
  fixture.subtreePull(mixed);
  fixture.commitToSite(mixed, { 'shared/x.txt': 'x\n', ...SITE_FILE }, 'A mixed commit');
  writeFiles(mixed, EDIT);
  const waiting = pushIn(fixture, mixed, tests, ['-m', 'Subject']);
  assertExit(waiting, EXIT.REFUSED);
  assert.match(waiting.stderr, /1 commit mixes shared\//);
  assert.equal(tests.runs(), 0);
});

test('-m declined at the question: the commit stays, and a later push publishes it', (t) => {
  const { fixture, tests, site } = oneSite(t);
  writeFiles(site, EDIT);
  const declined = pushIn(fixture, site, tests, ['-m', 'Say more'], { plain: true, input: 'n\n' });
  assertExit(declined, EXIT.REFUSED);
  assert.match(declined.stdout, /npm run shared:push publishes that commit later/);
  assert.equal(fixture.git(['log', '-1', '--format=%s'], site), 'Say more');
  assert.deepEqual(hubSubjects(fixture), SEED_SUBJECTS);
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['Say more', ...SEED_SUBJECTS]);
});

test('a sibling on another hub is named as left out, never as a site to pull', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const stray = fixture.addSite('stray');
  fixture.git(['remote', 'set-url', 'shared', 'git@github.com:owner/another.git'], stray);
  fixture.commitToSite(site, EDIT, 'Edit');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.OK);
  assert.doesNotMatch(result.stdout, /Other sites to pull/);
  assert.match(result.stdout, /^stray has a shared remote for another hub, so it is not on the list to pull\.$/m);
  assert.doesNotMatch(result.stdout, /No other site found/);
});

test('a sibling that holds a mount and no shared remote is named with the fix for a fresh clone', (t) => {
  const { fixture, tests, site } = oneSite(t);
  const bare = fixture.addSite('bare');
  fixture.addSharedLines(bare);
  fixture.git(['remote', 'remove', 'shared'], bare);
  fixture.commitToSite(site, EDIT, 'Edit');
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.OK);
  const warning = result.stdout.split('\n').find((line) => line.startsWith('WARNING: bare'));
  assert.ok(warning, result.stdout);
  assert.ok(warning.includes(`so it is not on the list to pull. Fix, for a fresh clone: cd ../bare && git remote add shared ${fixture.hub}. To take bare out of the hub instead: cd ../bare && npm run shared:leave.`), warning);
  assert.doesNotMatch(result.stdout, /No other site found/);
});

test('options: -m in its spellings, a bad subject, an unknown option, --help', (t) => {
  const { fixture, tests, site } = oneSite(t);
  assert.equal(parseArgs(['-m', 'A subject']).message, 'A subject');
  assert.equal(parseArgs(['--message', ' A subject ']).message, 'A subject');
  assert.deepEqual(parseArgs(['--yes', '--skip-tests', '--no-word-list']), {
    yes: true, skipTests: true, noWordList: true, help: false, message: null,
  });
  assert.throws(() => parseArgs(['-m']), /needs a subject/);
  assert.throws(() => parseArgs(['-m', '  ']), /of one line/);
  assert.throws(() => parseArgs(['-m', 'two\nlines']), /of one line/);
  assert.throws(() => parseArgs(['A stray word']), /Unknown option A stray word/);
  assertExit(pushIn(fixture, site, tests, ['--nonsense']), EXIT.USAGE);
  const help = pushIn(fixture, site, tests, ['--help']).stdout;
  assert.match(help, /npm run shared:push \[-- \[-m "Subject"\]/);
  assert.match(help, /--no-word-list  go on without the word list/);
});

test('the npm trap: -m typed without -- reaches npm alone, and it stops with the right line', (t) => {
  const { fixture, tests, site } = oneSite(t);
  writeFiles(site, EDIT);
  const before = snapshot(fixture, site);
  const env = { npm_lifecycle_event: 'shared:push', npm_config_message: 'A subject' };
  const kept = runIn(fixture, 'push.mjs', site, [], { env: { ...tests.env, ...env } });
  assertExit(kept, EXIT.USAGE);
  assert.match(kept.stderr, /npm kept --message/);
  assert.match(kept.stderr, /npm run shared:push -- -m "Subject"/);
  const yes = runIn(fixture, 'push.mjs', site, [], { env: { ...tests.env, npm_lifecycle_event: 'shared:push', npm_config_yes: 'true' } });
  assertExit(yes, EXIT.USAGE);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('a fresh clone with no shared remote gets the line that adds it', (t) => {
  const { fixture, tests, site } = oneSite(t);
  fixture.git(['remote', 'remove', 'shared'], site);
  const result = pushIn(fixture, site, tests);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, new RegExp(`git remote add shared ${fixture.hub}`));
  assert.match(pullIn(fixture, site).stderr, /git remote add shared /);
});

test('a repository with no shared/ stops with usage', (t) => {
  const { fixture, tests } = oneSite(t);
  const plain = fixture.addRepository('plain', { 'a.txt': 'a\n' });
  const result = pushIn(fixture, plain, tests);
  assertExit(result, EXIT.USAGE);
  assert.match(result.stderr, /has no shared\/ folder/);
});
