/**
 * scripts/__tests__/pull.test.mjs: `shared:pull` as a person runs it: the real script as a child
 * process, in real sites, on a real bare hub. A refusal's test proves that nothing moved, and a scan's
 * test proves that the private word never printed. A new refusal gets a test that makes it fire.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EXIT } from '../lib/exitCodes.mjs';
import { STATES, readState } from '../lib/state.mjs';
import { parseArgs } from '../pull.mjs';
import { fixtureFor, startServer, writeFiles } from './fixture.mjs';
import {
  assertExit, head, hubSubjects, hubTip, hubTree, pullIn, pushIn, pushToOrigin, remount, revertTheAdd, runIn, sharedTree,
  snapshot, stateOf, stubTests,
} from './flows.mjs';

const EDIT = { 'shared/README.md': 'Edited in a site.\n' };
const ADD_FILE = { 'a.txt': 'a\n' };
const SITE_FILE = { 'docs/two.md': 'A site page.\n' };
const SITE_LINE = { 'shared/css/custom.scss': 'one-from-site\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n' };
const HUB_LINE = { 'css/custom.scss': 'one-from-hub\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n' };

/** Built here so this file never matches the secret shapes it tests. */
const PLANTED_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

test('behind: the pull lands, records the hub tip and names its commits', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  const tip = fixture.commitToHub({ 'b.txt': 'b\n' }, 'Add a second file');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  assert.equal(sharedTree(fixture, site), hubTree(fixture));
  assert.equal(fixture.git(['log', '-1', '--format=%s'], site), `shared: pull ${tip.slice(0, 7)} (2 commits)`);
  const squash = fixture.git(['log', '-1', '--format=%B', 'HEAD^2'], site);
  assert.match(squash, /Add a file/);
  assert.match(squash, /Add a second file/);
  assert.match(result.stdout, /Pulled 2 commits\. The hub is at [0-9a-f]{7}\./);
  assert.match(result.stdout, /npm run test:shared/);
  assert.match(result.stdout, /ok +packages/);
  assert.doesNotMatch(result.stdout, /shared:verify/);
});

test('one commit reads as one, and a pull run twice changes nothing the second time', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  assert.match(pullIn(fixture, site).stdout, /Pulled 1 commit\./);
  assert.match(fixture.git(['log', '-1', '--format=%s'], site), /\(1 commit\)$/);
  const before = snapshot(fixture, site);
  const again = pullIn(fixture, site);
  assertExit(again, EXIT.OK);
  assert.match(again.stdout, /Nothing to pull: in sync at [0-9a-f]{7}\./);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('ahead: nothing to pull, nothing moves, and it points at shared:push', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit');
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /npm run shared:push/);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('a changed tracked file refuses, an untracked or a touched one does not', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  writeFiles(site, { 'docs/intro.md': 'Changed.\n' });
  const before = snapshot(fixture, site);
  const refused = pullIn(fixture, site);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /1 changed tracked file/);
  assert.match(refused.stderr, /docs\/intro\.md/);
  assert.match(refused.stderr, /Nothing was changed\./);
  assert.deepEqual(snapshot(fixture, site), before);
  fixture.git(['checkout', '--', 'docs/intro.md'], site);
  writeFiles(site, { 'untracked.md': 'Scratch.\n' });
  const file = path.join(site, 'docs/intro.md');
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  assertExit(pullIn(fixture, site), EXIT.OK);
});

test('another branch and a detached HEAD refuse', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  fixture.git(['switch', '-q', '-c', 'side'], site);
  const onSide = pullIn(fixture, site);
  assertExit(onSide, EXIT.REFUSED);
  assert.match(onSide.stderr, /on side, not master/);
  assert.match(onSide.stderr, /git switch master/);
  fixture.git(['switch', '-q', '--detach'], site);
  const detached = pullIn(fixture, site);
  assertExit(detached, EXIT.REFUSED);
  assert.match(detached.stderr, /a detached HEAD/);
});

test('a worktree refuses, even one on master', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  fixture.git(['switch', '-q', '-c', 'side'], site);
  const worktree = path.join(fixture.base, 'worktree');
  fixture.git(['worktree', 'add', '-q', worktree, 'master'], site);
  const before = head(fixture, worktree);
  const result = pullIn(fixture, worktree);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /this is a worktree/);
  assert.equal(head(fixture, worktree), before);
});

test('a server running from the checkout refuses, and is left running', async (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  const server = await startServer(t, site);
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /a server is running from this checkout/);
  assert.equal(server.exitCode, null);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('no word list refuses, and --no-word-list goes on and says so', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  fs.rmSync(fixture.wordList);
  const before = snapshot(fixture, site);
  const refused = pullIn(fixture, site);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /the word list is missing/);
  assert.match(refused.stderr, /--no-word-list/);
  assert.deepEqual(snapshot(fixture, site), before);
  const result = pullIn(fixture, site, ['--no-word-list']);
  assertExit(result, EXIT.OK);
  assert.match(result.stderr, /WARNING: no word list/);
});

test('an emptied word list refuses like a missing one', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  fs.writeFileSync(fixture.wordList, '# nothing yet\n');
  const refused = pullIn(fixture, site);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /the word list is missing or empty/);
  assertExit(pullIn(fixture, site, ['--no-word-list']), EXIT.OK);
});

test('a private word in a subject on the hub refuses before anything merges, and never prints', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const sha = fixture.commitToHub(ADD_FILE, 'Notes for the Zebrafish project');
  fixture.commitToHub({ 'b.txt': 'b\n' }, 'A clean subject');
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, new RegExp(`commit ${sha.slice(0, 7)}'s subject matches line 2 of the word list`));
  assert.match(result.stderr, /rewriting the hub/);
  assert.doesNotMatch(result.output, /zebrafish/i);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('a commit that lands on the hub right after the fetch cannot slip past the scan', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const scanned = fixture.commitToHub(ADD_FILE, 'Add a file');
  const once = path.join(fixture.base, 'landed-once');
  const hook = path.join(site, '.git/hooks/reference-transaction');
  fs.writeFileSync(hook, [
    '#!/bin/sh',
    '[ "$1" = committed ] || exit 0',
    'grep -q refs/remotes/shared/main || exit 0',
    `[ -e '${once}' ] && exit 0`,
    `: > '${once}'`,
    'unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX',
    `cd '${fixture.hubWork}'`,
    "printf 'the quokka line\\n' > late.txt",
    'git add late.txt',
    "git commit -q -m 'Landed after the fetch'",
    'git push -q origin main',
    '',
  ].join('\n'), { mode: 0o755 });
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.ok(fs.existsSync(once), 'the race never happened');
  assert.equal(fs.existsSync(path.join(site, 'shared/late.txt')), false);
  assert.match(fixture.git(['log', '-1', '--format=%s'], site), new RegExp(scanned.slice(0, 7)));
  const next = pullIn(fixture, site);
  assertExit(next, EXIT.REFUSED);
  assert.match(next.stderr, /shared\/late\.txt:1 matches line 3 of the word list/);
});

test('a private word in a file on the hub refuses, and a later fix lets the pull through', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub({ 'notes/plain.md': 'first\nthe quokka line\n' }, 'Add notes');
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /shared\/notes\/plain\.md:2 matches line 3 of the word list/);
  assert.doesNotMatch(result.output, /quokka/i);
  assert.deepEqual(snapshot(fixture, site), before);
  fixture.commitToHub({ 'notes/plain.md': 'first\na plain line\n' }, 'Reword the notes');
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
});

test('a private word inside a binary file on the hub refuses, by line number only', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const picture = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13]), Buffer.from('tEXtAuthor\0the quokka\0')]);
  fixture.commitToHub({ 'static/picture.png': picture }, 'Add a picture');
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /shared\/static\/picture\.png, a binary file, matches line 3 of the word list/);
  assert.doesNotMatch(result.output, /quokka/i);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('a requirements.cjs on the hub that does not load is refused before anything merges', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub({ 'requirements.cjs': "module.exports = { RANGES: { a: '1' } ENTRIES: [] };\n" }, 'Lose a comma');
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /shared\/requirements\.cjs does not load: SyntaxError/);
  assert.doesNotMatch(result.output, /\n\s+at /);
  assert.deepEqual(snapshot(fixture, site), before);
  fixture.commitToHub({ 'requirements.cjs': fixture.git(['show', 'main~1:requirements.cjs'], fixture.hub) + '\n' }, 'Mend the table');
  assertExit(pullIn(fixture, site), EXIT.OK);
});

test('a private word in a file name refuses, masked', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub({ 'notes/quokka-plan.md': 'plain\n' }, 'Add a plan');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /the file name shared\/notes\/\*{6}-plan\.md matches line 3/);
  assert.doesNotMatch(result.output, /quokka/i);
});

test('a secret shape refuses, and a word the list allows in that path passes', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub({ 'keys.txt': `${PLANTED_KEY}\n` }, 'Add a list');
  const refused = pullIn(fixture, site);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /shared\/keys\.txt:1 looks like an AWS key/);
  assert.doesNotMatch(refused.output, new RegExp(PLANTED_KEY));
  fixture.commitToHub({ 'keys.txt': 'plain\n', 'docs/allowed.md': 'the quokka line\n' }, 'Replace the list');
  fs.writeFileSync(fixture.wordList, 'quokka\tshared/docs/allowed.md\n');
  assertExit(pullIn(fixture, site), EXIT.OK);
});

test('conflict markers on the hub refuse', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const marker = `${'<'.repeat(7)} HEAD\nmine\n${'='.repeat(7)}\ntheirs\n${'>'.repeat(7)} other\n`;
  fixture.commitToHub({ 'css/more.scss': marker }, 'Add styles');
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /shared\/css\/more\.scss:1 is a conflict marker/);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('diverged, a clean merge: it pulls, and says this site still holds commits', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit the readme');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /npm run shared:push .*still holds commits/);
  assert.equal(stateOf(fixture, site), STATES.AHEAD);
  assert.equal(fs.readFileSync(path.join(site, 'shared/a.txt'), 'utf8'), 'a\n');
  assert.equal(fs.readFileSync(path.join(site, 'shared/README.md'), 'utf8'), EDIT['shared/README.md']);
});

/** A site that pulled one hub commit and reverted that pull. Gives the site and the revert's short sha. */
function revertedPullSite(fixture) {
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  assertExit(pullIn(fixture, site), EXIT.OK);
  fixture.git(['revert', '-m', '1', '--no-edit', 'HEAD'], site);
  return { site, revert: fixture.git(['rev-parse', '--short=7', 'HEAD'], site) };
}

test('a reverted pull with nothing to pull: it gives status\'s way back, and offers no push', (t) => {
  const fixture = fixtureFor(t);
  const { site, revert } = revertedPullSite(fixture);
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /Nothing to pull: the hub has not moved\. A revert of a pull stands here\./);
  const wayBack = `git revert --no-edit ${revert}, then npm run shared:pull`;
  assert.ok(result.stdout.includes(wayBack), result.stdout);
  assert.ok(fixture.status(site).stdout.includes(wayBack), 'status prints other words');
  assert.match(result.stdout, /npm run shared:push would publish that revert to every site/);
  assert.doesNotMatch(result.stdout, /To publish this site's commits/);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('a pull on top of a revert: its Next list gives the way back, and offers no push', (t) => {
  const fixture = fixtureFor(t);
  const { site, revert } = revertedPullSite(fixture);
  fixture.commitToHub({ 'b.txt': 'b\n' }, 'Add another file');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.AHEAD);
  assert.ok(result.stdout.includes(`  to take the hub again: git revert --no-edit ${revert}, then npm run shared:pull\n`), result.stdout);
  assert.match(result.stdout, /npm run shared:push would publish that revert to every site/);
  assert.doesNotMatch(result.stdout, /still holds commits/);
});

test('once the revert is reverted, a site ahead hears about the push again', (t) => {
  const fixture = fixtureFor(t);
  const { site } = revertedPullSite(fixture);
  fixture.git(['revert', '--no-edit', 'HEAD'], site);
  fixture.commitToSite(site, EDIT, 'Edit');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /To publish this site's commits: npm run shared:push/);
  assert.doesNotMatch(result.stdout, /A revert of a pull stands/);
});

test('a conflict exits 6 with the files and both ways out, and aborting restores the site', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, SITE_LINE, 'Change the first line here');
  fixture.commitToHub(HUB_LINE, 'Change the first line there');
  const before = head(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.CONFLICT);
  assert.match(result.stderr, /conflict in 1 file/);
  assert.match(result.stderr, /git add -- shared\/css\/custom\.scss/);
  assert.match(result.stderr, /git commit --no-edit/);
  assert.match(result.stderr, /git merge --abort/);
  assert.match(result.stderr, /Never run git ci or git add -A/);
  const again = pullIn(fixture, site);
  assertExit(again, EXIT.REFUSED);
  assert.match(again.stderr, /a merge is still open/);
  fixture.git(['merge', '--abort'], site);
  assert.equal(head(fixture, site), before);
  assert.equal(fixture.git(['status', '--porcelain'], site), '');
});

test('a conflict in a file whose name holds a space prints a git add that works as printed', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/static/read me.txt': 'one here\n' }, 'Add a note here');
  fixture.commitToHub({ 'static/read me.txt': 'one there\n' }, 'Add a note there');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.CONFLICT);
  const line = result.stderr.split('\n').find((text) => text.trim().startsWith('git add --'));
  assert.equal(line.trim(), "git add -- 'shared/static/read me.txt'");
  writeFiles(site, { 'shared/static/read me.txt': 'one from both\n' });
  assert.equal(spawnSync('sh', ['-c', line.trim()], { cwd: site, env: fixture.env }).status, 0);
  assert.equal(fixture.git(['diff', '--name-only', '--diff-filter=U'], site), '');
  fixture.git(['merge', '--abort'], site);
});

test('a conflict resolved by hand: the site publishes the answer, and the other site gets it', (t) => {
  const fixture = fixtureFor(t);
  const tests = stubTests(fixture);
  const site = fixture.addSite('one');
  const other = fixture.addSite('two');
  fixture.commitToSite(site, SITE_LINE, 'Change the first line here');
  fixture.commitToHub(HUB_LINE, 'Change the first line there');
  assertExit(pullIn(fixture, site), EXIT.CONFLICT);
  writeFiles(site, { 'shared/css/custom.scss': 'one-from-both\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n' });
  fixture.git(['add', '--', 'shared/css/custom.scss'], site);
  fixture.git(['commit', '--no-edit', '-q'], site);
  assert.equal(stateOf(fixture, site), STATES.AHEAD);
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  assertExit(pullIn(fixture, other), EXIT.OK);
  assert.equal(sharedTree(fixture, other), sharedTree(fixture, site));
  assert.equal(sharedTree(fixture, other), hubTree(fixture));
});

test('a package the new shared/ needs: the pull lands, prints the install line, exits 3', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const requirements = fs.readFileSync(path.join(fixture.hubWork, 'requirements.cjs'), 'utf8');
  fixture.commitToHub({ 'requirements.cjs': requirements.replace("react: '^19.0.0'", "react: '^20.0.0'") }, 'Need a newer react');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.CHECKS);
  assert.match(result.stdout, /npm install --save-exact react@20\.0\.0/);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
});

test('shared:verify, which checks the page\'s transcripts, is named only when the site has its own page about shared/', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'src/pages/shared.md': '# Shared\n' }, 'Add the old page, which is gone with no redirect');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  assert.doesNotMatch(pullIn(fixture, site).stdout, /shared:verify/, 'src/pages/shared.md is no page about shared/ any more');
  fixture.commitToSite(site, { 'src/pages/guide-shared-sites.md': '# Shared Sites (Guide)\n' }, 'Add the guide');
  fixture.commitToHub({ 'b.txt': 'b\n' }, 'Add another file');
  const { stdout } = pullIn(fixture, site);
  assert.match(stdout, /\n {2}npm run shared:verify \(this site has its own page about shared\/\)\n/);
  assert.doesNotMatch(stdout, /test:site/);
});

/** The two caches Docusaurus keeps between runs, as a site holds them after a build. */
const CACHE_FILES = { '.docusaurus/registry.js': 'old\n', 'node_modules/.cache/webpack/pack': 'old\n' };
const CLEARED = /Cleared the build cache \(\.docusaurus, node_modules\/\.cache\): this pull changed what the config reads at start-up/;

/** True when both cache files are still in the site. */
function cacheKept(site) {
  return Object.keys(CACHE_FILES).every((name) => fs.existsSync(path.join(site, name)));
}

test('a pull that changes what the config reads at start-up clears the build cache, and another pull keeps it', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  writeFiles(site, CACHE_FILES);
  fixture.commitToHub(ADD_FILE, 'Add a file');
  const plain = pullIn(fixture, site);
  assertExit(plain, EXIT.OK);
  assert.doesNotMatch(plain.stdout, CLEARED);
  assert.ok(cacheKept(site), 'a pull that left the config alone cleared the cache');
  fixture.commitToHub({ 'wiring/katex-macros.cjs': 'module.exports = { changed: true };\n' }, 'Change a macro');
  const wiring = pullIn(fixture, site);
  assertExit(wiring, EXIT.OK);
  assert.match(wiring.stdout, CLEARED);
  for (const name of Object.keys(CACHE_FILES)) assert.equal(fs.existsSync(path.join(site, name)), false, name);
  assert.equal(fixture.git(['status', '--porcelain'], site), '');
  writeFiles(site, CACHE_FILES);
  fixture.commitToHub({ 'components/DropDownIC/mdx.cjs': 'module.exports = {};\n' }, 'Change the plugins');
  assert.match(pullIn(fixture, site).stdout, CLEARED);
  assert.equal(cacheKept(site), false);
});

test('a conflict in a file the config reads at start-up names npm run clear, and another conflict does not', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, SITE_LINE, 'Change the first line here');
  fixture.commitToHub(HUB_LINE, 'Change the first line there');
  const plain = pullIn(fixture, site);
  assertExit(plain, EXIT.CONFLICT);
  assert.doesNotMatch(plain.stderr, /npm run clear/);
  fixture.git(['merge', '--abort'], site);
  fixture.commitToSite(site, { 'shared/wiring/katex-macros.cjs': 'module.exports = { here: true };\n' }, 'A macro here');
  fixture.commitToHub({ 'wiring/katex-macros.cjs': 'module.exports = { there: true };\n' }, 'A macro there');
  const wiring = pullIn(fixture, site);
  assertExit(wiring, EXIT.CONFLICT);
  assert.match(wiring.stderr, /git commit --no-edit\nA file the config reads at start-up is among them, so after the commit run npm run clear/);
  fixture.git(['merge', '--abort'], site);
});

test('a hub out of reach stops with exit 5, and nothing moved', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.git(['remote', 'set-url', 'shared', path.join(fixture.base, 'gone.git')], site);
  const before = head(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.GIT);
  assert.match(result.stderr, /Could not reach the hub/);
  assert.equal(head(fixture, site), before);
});

test('a rewritten hub and a rejoin without its push refuse, in the words status uses', (t) => {
  const fixture = fixtureFor(t);
  const rejoined = fixture.addSite('rejoined');
  fixture.commitToSite(rejoined, EDIT, 'Edit');
  fixture.rejoin(rejoined);
  const ahead = pullIn(fixture, rejoined);
  assertExit(ahead, EXIT.REFUSED);
  assert.match(ahead.stderr, /a rejoin ran without its push/);
  assert.match(ahead.stderr, /npm run shared:push/);
  const site = fixture.addSite('one');
  fixture.git(['commit', '--amend', '-q', '-m', 'Rewritten'], fixture.hubWork);
  fixture.git(['push', '-q', '--force', 'origin', 'main'], fixture.hubWork);
  const rewritten = pullIn(fixture, site);
  assertExit(rewritten, EXIT.REFUSED);
  assert.match(rewritten.stderr, /is not in the hub's history/);
});

test('a site with no record of the hub refuses', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addRepository('copied', { 'shared/a.txt': 'a\n' });
  fixture.git(['remote', 'add', 'shared', fixture.hub], site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.REFUSED);
  assert.match(result.stderr, /no subtree record/);
  assert.ok(result.stderr.includes('Fix: a shared/ made by hand: git mv shared shared-before && git commit -m "Set the old shared folder aside", '
    + 'then git update-index -q --refresh && git fetch shared main && git subtree add --prefix shared shared/main~1 --squash, '
    + 'then npm run shared:pull, whose record keeps the old folder out of every split'), result.stderr);
});

test('a mixed commit a merge would bury refuses, unless it cannot be split anyway', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { ...EDIT, 'docs/two.md': 'x\n' }, 'A mixed commit');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  const before = snapshot(fixture, site);
  const refused = pullIn(fixture, site);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /1 commit mixes shared\/ with site files/);
  assert.match(refused.stderr, /git reset HEAD~1/);
  assert.deepEqual(snapshot(fixture, site), before);
  pushToOrigin(fixture, site);
  assertExit(pullIn(fixture, site), EXIT.OK);
});

test('a mixed commit with a private subject: the refusal hides the subject', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { ...EDIT, 'docs/two.md': 'x\n' }, 'Tweak for the Zebrafish project');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  const refused = pullIn(fixture, site);
  assertExit(refused, EXIT.REFUSED);
  assert.match(refused.stderr, /\(subject hidden: it holds a private hit\)/);
  assert.doesNotMatch(refused.stderr, /zebrafish/i);
});

test('pushed but not rejoined: a pull records the hub tip the way a rejoin does', (t) => {
  const fixture = fixtureFor(t);
  const tests = stubTests(fixture);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.subtreePush(site);
  assert.equal(stateOf(fixture, site), STATES.PUSHED_NOT_REJOINED);
  const tree = sharedTree(fixture, site);
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  assert.equal(sharedTree(fixture, site), tree);
  assert.match(fixture.git(['log', '-1', '--format=%B'], site), /git-subtree-mainline: [0-9a-f]{40}/);
  fixture.commitToSite(site, { 'shared/README.md': 'Again.\n' }, 'Edit again');
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['Edit again', 'Edit', 'Seed the hub']);
});

test('pushed, not rejoined, and the hub moved on: the pull mends it', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.subtreePush(site);
  fixture.git(['pull', '-q', 'origin', 'main'], fixture.hubWork);
  fixture.commitToHub(ADD_FILE, 'Add a file');
  fixture.git(['fetch', '-q', 'shared', 'main'], site);
  assert.equal(stateOf(fixture, site), STATES.DIVERGED);
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  assert.equal(sharedTree(fixture, site), hubTree(fixture));
});

/** The real split of a site. */
function splitOf(fixture, site) {
  return fixture.git(['subtree', 'split', '--prefix', 'shared', 'HEAD'], site);
}

/** The text of the commit HEAD names. */
const headMessage = (fixture, site) => fixture.git(['log', '-1', '--format=%B'], site);

test('an ordinary pull stays a plain merge: no record, and the next split lands on the hub by itself', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.doesNotMatch(headMessage(fixture, site), /git-subtree/);
  assert.doesNotMatch(result.stdout, /record/);
  assert.equal(splitOf(fixture, site), hubTip(fixture));
});

for (const [name, poison] of [['git rm and a fresh add', remount], ['a revert of the add and its way back', revertTheAdd]]) {
  test(`an ordinary pull closes a split that carried the site's commits: ${name}`, (t) => {
    const fixture = fixtureFor(t);
    const tests = stubTests(fixture);
    const site = fixture.addSite('one');
    poison(fixture, site);
    assert.equal(readState(site, { env: fixture.env }).leaks.length, 1);
    fixture.commitToHub(ADD_FILE, 'Add a file');
    const result = pullIn(fixture, site);
    assertExit(result, EXIT.OK);
    assert.match(result.stdout, /This pull holds a rejoin's record: the next split stops here\./);
    assert.match(headMessage(fixture, site), /^shared: pull [0-9a-f]{7} \(1 commit\)\n/);
    assert.match(headMessage(fixture, site), /git-subtree-mainline: [0-9a-f]{40}/);
    assert.equal(fixture.git(['rev-parse', 'HEAD^1'], site), headMessage(fixture, site).match(/git-subtree-mainline: (\S+)/)[1]);
    assert.deepEqual(readState(site, { env: fixture.env }).leaks, []);
    assert.equal(splitOf(fixture, site), hubTip(fixture));
    assert.equal(fixture.status(site).status, EXIT.OK);
    fixture.commitToSite(site, EDIT, 'A real edit');
    assertExit(pushIn(fixture, site, tests), EXIT.OK);
    assert.deepEqual(hubSubjects(fixture), ['A real edit', 'Add a file', 'Seed the hub']);
    fixture.git(['pull', '-q', 'origin', 'main'], fixture.hubWork);
    fixture.commitToHub({ 'b.txt': 'b\n' }, 'Add another file');
    assertExit(pullIn(fixture, site), EXIT.OK);
    assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  });
}

test('in sync with such a commit: nothing to pull, nothing moves, and it says what is needed', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  remount(fixture, site);
  const before = snapshot(fixture, site);
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /Nothing to pull: in sync/);
  assert.match(result.stdout, /But the split would carry some of this site's own commits/);
  assert.match(result.stdout, /publish any commit from another site, then npm run shared:pull here/);
  assert.deepEqual(snapshot(fixture, site), before);
});

test('ahead with such a commit: nothing to pull, and the change has to go around', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  remount(fixture, site);
  fixture.commitToSite(site, EDIT, 'Edit');
  const result = pullIn(fixture, site);
  assertExit(result, EXIT.OK);
  assert.match(result.stdout, /make this site's shared\/ change in another site and publish it there/);
});

test('that way round closes it: the same change from another site, then a pull here', (t) => {
  const fixture = fixtureFor(t);
  const tests = stubTests(fixture);
  const site = fixture.addSite('one');
  const other = fixture.addSite('two');
  remount(fixture, site);
  fixture.commitToSite(site, EDIT, 'Edit here');
  fixture.commitToSite(other, EDIT, 'Edit there');
  assertExit(pushIn(fixture, other, tests), EXIT.OK);
  const report = fixture.status(site);
  assert.match(report.stdout, /pushed but not rejoined/);
  assert.match(report.stdout, /fix: npm run shared:pull: its record closes this/);
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.equal(stateOf(fixture, site), STATES.IN_SYNC);
  assert.deepEqual(readState(site, { env: fixture.env }).leaks, []);
  assert.equal(splitOf(fixture, site), hubTip(fixture));
  assert.deepEqual(hubSubjects(fixture), ['Edit there', 'Seed the hub']);
});

test('a pull that lands apart from the hub writes no record, and the split stays refused', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  remount(fixture, site);
  fixture.commitToSite(site, EDIT, 'Edit here');
  fixture.commitToHub(ADD_FILE, 'Add a file');
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.doesNotMatch(headMessage(fixture, site), /git-subtree/);
  assert.equal(readState(site, { env: fixture.env }).leaks.length, 1);
});

test('a commit left in the split by a pull by hand is dropped by the next pull', (t) => {
  const fixture = fixtureFor(t);
  const tests = stubTests(fixture);
  const site = fixture.addSite('one');
  const other = fixture.addSite('two');
  fixture.commitToSite(site, { ...EDIT, ...SITE_FILE }, 'Site page plus a shared tweak');
  fixture.commitToSite(other, EDIT, 'Same edit');
  assertExit(pushIn(fixture, other, tests), EXIT.OK);
  fixture.subtreePull(site);
  assert.equal(readState(site, { env: fixture.env }).ahead, 1);
  fixture.git(['pull', '-q', 'origin', 'main'], fixture.hubWork);
  fixture.commitToHub(ADD_FILE, 'Add a file');
  assertExit(pullIn(fixture, site), EXIT.OK);
  assert.match(headMessage(fixture, site), /git-subtree-mainline/);
  assert.equal(readState(site, { env: fixture.env }).ahead, 0);
  fixture.commitToSite(site, { 'shared/README.md': 'Again.\n' }, 'A clean edit');
  assertExit(pushIn(fixture, site, tests), EXIT.OK);
  assert.deepEqual(hubSubjects(fixture), ['A clean edit', 'Add a file', 'Same edit', 'Seed the hub']);
});

test('options: --help, an unknown option, an option npm kept, and no shared/ folder', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  assert.deepEqual(parseArgs([]), { noWordList: false, help: false });
  assert.deepEqual(parseArgs(['--no-word-list']), { noWordList: true, help: false });
  assert.throws(() => parseArgs(['--nonsense']), /Unknown option --nonsense/);
  assertExit(pullIn(fixture, site, ['--help']), EXIT.OK);
  assertExit(pullIn(fixture, site, ['--nonsense']), EXIT.USAGE);
  const env = { npm_lifecycle_event: 'shared:pull', 'npm_config_word_list': '' };
  const kept = runIn(fixture, 'pull.mjs', site, [], { env });
  assertExit(kept, EXIT.USAGE);
  assert.match(kept.stderr, /npm kept --no-word-list/);
  const plain = fixture.addRepository('plain', { 'a.txt': 'a\n' });
  const outside = pullIn(fixture, plain);
  assertExit(outside, EXIT.USAGE);
  assert.match(outside.stderr, /has no shared\/ folder/);
});
