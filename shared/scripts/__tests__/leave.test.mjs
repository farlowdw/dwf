/**
 * scripts/__tests__/leave.test.mjs: `shared:leave` on real repositories from fixture.mjs. A leave takes the
 * site's shared npm lines out in one commit and removes the `shared` remote; `--check` changes nothing; the
 * other sites then pass the site by without a word, while a fresh clone, which keeps its lines, still gets the
 * warning; and the way back, a join and a pull, puts the lines back as they were and brings what the hub took in.
 *
 * HOW TO CHANGE IT
 *   A site as a join leaves it: joinedSite. The lines a leave takes out: lib/siteLines.mjs. From the hub:
 *   node --test scripts/__tests__/leave.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { EXIT } from '../lib/exitCodes.mjs';
import { SITE_LINES } from '../lib/joinSettings.mjs';
import { LEAVE_SUBJECT, isSharedLine, linesBeforeLeave, sharedLineNames } from '../lib/siteLines.mjs';
import { STATES, readState } from '../lib/state.mjs';
import { fixtureFor } from './fixture.mjs';
import { gitExit, pullIn, pushIn, runIn, stubTests } from './flows.mjs';

/** The line the leave prints for the way back, as a person pastes it in the site. */
const WAY_BACK = 'The way back, in this site: node shared/scripts/join.mjs && npm run shared:pull';

/** A site's own verify line, which a join would never write. */
const OWN_VERIFY = 'npm run test:site && npm run test:shared';

/** What npm leaves in the environment when it kept `--check` for itself. */
const NPM_KEPT_CHECK = Object.freeze({ npm_lifecycle_event: 'shared:leave', npm_config_check: 'true' });

/** A tidy site, so that a join commits nothing but its mount and its lines. */
const TIDY_SITE = Object.freeze({
  'package.json': `${JSON.stringify({
    name: 'tidy-site',
    private: true,
    scripts: { build: 'docusaurus build', deploy: 'netlify deploy --prod --context production', 'test:site': 'node --test' },
    dependencies: { '@docusaurus/core': '3.10.2', react: '^19.0.0' },
  }, null, 2)}\n`,
  '.gitignore': '/node_modules\n# Any folder\'s, as the joined sites hold it.\nnode_modules\n.env\n.netlify\n',
  'netlify.toml': '[build]\n  command = "npm run build"\n',
  '.nvmrc': '22\n',
  'docusaurus.config.js': 'module.exports = {};\n',
  'docs/intro.md': '# Intro\n',
});

/** The site's package.json as text. */
function manifestText(site) {
  return fs.readFileSync(path.join(site, 'package.json'), 'utf8');
}

/** Writes the site's package.json after `change`, and commits it. */
function commitManifest(fixture, site, change, subject) {
  const manifest = JSON.parse(manifestText(site));
  change(manifest);
  fixture.commitToSite(site, { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` }, subject);
}

/** A site joined by the real join, with its own shared:verify committed after, as a real site has one. */
function joinedSite(fixture, name) {
  const root = fixture.addRepository(name, TIDY_SITE);
  const joined = fixture.script('join.mjs', root, '.');
  assert.equal(joined.status, EXIT.OK, joined.output);
  commitManifest(fixture, root, (manifest) => { manifest.scripts['shared:verify'] = OWN_VERIFY; }, 'Verify this site its own way');
  return root;
}

/** The fixture for one test, and the scripts as they run in a site. */
function setUp(t) {
  const fixture = fixtureFor(t);
  const leave = (site, ...args) => fixture.script('leave.mjs', site, ...args);
  const all = (site, ...args) => fixture.script('all.mjs', site, ...args);
  return { fixture, leave, all };
}

/** The site's `shared` remote, or null. */
function remoteOf(fixture, site) {
  const listed = fixture.git(['remote'], site).split('\n');
  return listed.includes('shared') ? fixture.git(['remote', 'get-url', 'shared'], site) : null;
}

/** What a stopped run may not change: the head, the tree, the remote and the file. */
function contentFacts(fixture, site) {
  return {
    head: fixture.git(['rev-parse', 'HEAD'], site),
    changes: fixture.git(['status', '--porcelain'], site),
    remote: remoteOf(fixture, site),
    manifest: manifestText(site),
  };
}

/** What a check or a refusal may not change: all of that, and the index's bytes too. */
function facts(fixture, site) {
  return { ...contentFacts(fixture, site), index: fs.readFileSync(path.join(site, '.git', 'index'), 'hex') };
}

/** The shared lines a site holds now. */
function sharedLinesOf(site) {
  return sharedLineNames(JSON.parse(manifestText(site)).scripts);
}

/** The WARNING lines of a run's output. */
function warnings(output) {
  return output.split('\n').filter((line) => line.includes('WARNING'));
}

test('the shared lines are every shared: line and test:shared, the site\'s own shared:verify among them', () => {
  for (const name of [...Object.keys(SITE_LINES), 'shared:verify', 'shared:anything']) assert.equal(isSharedLine(name), true, name);
  for (const name of ['test:site', 'build', 'deploy', 'shared', 'test:shared:extra']) assert.equal(isSharedLine(name), false, name);
  assert.deepEqual(sharedLineNames({ build: 'x', 'shared:pull': 'y', 'test:shared': 'z' }), ['shared:pull', 'test:shared']);
});

test('--help lists --check, an unknown option stops with usage, and npm keeping --check stops before anything', (t) => {
  const { fixture, leave } = setUp(t);
  const site = joinedSite(fixture, 'one');
  const help = leave(site, '--help');
  assert.equal(help.status, EXIT.OK);
  assert.match(help.stdout, /--check/);
  const before = facts(fixture, site);
  assert.equal(leave(site, '--soon').status, EXIT.USAGE);
  const kept = runIn(fixture, 'leave.mjs', site, [], { env: NPM_KEPT_CHECK });
  assert.equal(kept.status, EXIT.USAGE, kept.output);
  assert.match(kept.stderr, /npm kept --check for itself/);
  assert.deepEqual(facts(fixture, site), before, 'a run that npm robbed of --check must not leave');
});

test('--check says what a leave does, changes nothing, and exits 0', (t) => {
  const { fixture, leave } = setUp(t);
  const site = joinedSite(fixture, 'one');
  const before = facts(fixture, site);
  const { status, stdout } = leave(site, '--check');
  assert.equal(status, EXIT.OK, stdout);
  assert.match(stdout, /^info remote\s+the leave removes the shared remote, /m);
  assert.match(stdout, /^info scripts\s+11 shared npm lines: the leave takes them out in one commit$/m);
  assert.match(stdout, /^info mount\s+shared\/ stays as ordinary files/m);
  assert.match(stdout, /shared:leave can run here$/m);
  assert.deepEqual(facts(fixture, site), before);
});

test('a leave takes the shared lines out in one commit, removes the remote, keeps shared/ and prints the way back', (t) => {
  const { fixture, leave } = setUp(t);
  const site = joinedSite(fixture, 'one');
  const head = fixture.git(['rev-parse', 'HEAD'], site);
  const { status, stdout } = leave(site);
  assert.equal(status, EXIT.OK, stdout);
  assert.equal(fixture.git(['rev-parse', 'HEAD~1'], site), head, 'one commit');
  assert.equal(fixture.git(['log', '-1', '--format=%s'], site), LEAVE_SUBJECT);
  assert.match(fixture.git(['log', '-1', '--format=%b'], site), /To come back, in the site: node shared\/scripts\/join\.mjs && npm run shared:pull$/);
  assert.deepEqual(fixture.git(['show', '--name-only', '--format=', 'HEAD'], site).split('\n'), ['package.json']);
  assert.deepEqual(sharedLinesOf(site), []);
  const scripts = JSON.parse(manifestText(site)).scripts;
  assert.deepEqual(Object.keys(scripts), ['build', 'deploy', 'test:site'], 'the site\'s own lines stay');
  assert.equal(remoteOf(fixture, site), null);
  assert.equal(fs.existsSync(path.join(site, 'shared', 'requirements.cjs')), true);
  assert.equal(fixture.git(['status', '--porcelain'], site), '');
  assert.ok(stdout.split('\n').includes(WAY_BACK), stdout);
  const again = leave(site);
  assert.equal(again.status, EXIT.OK);
  assert.match(again.stdout, /^Nothing to do in .*: this site has left the hub\.$/m);
  assert.equal(fixture.git(['rev-parse', 'HEAD~1'], site), head, 'a second run commits nothing');
  assert.match(leave(site, '--check').stdout, /This site has left the hub: nothing to do$/m);
});

test('a site whose remote went by hand finishes its leave with the lines alone', (t) => {
  const { fixture, leave } = setUp(t);
  const site = joinedSite(fixture, 'one');
  fixture.git(['remote', 'remove', 'shared'], site);
  const { status, stdout } = leave(site);
  assert.equal(status, EXIT.OK, stdout);
  assert.match(stdout, /11 shared npm lines taken out of package\.json/);
  assert.doesNotMatch(stdout, /remote removed/);
  assert.deepEqual(sharedLinesOf(site), []);
});

test('a changed tracked file, another branch and an open merge fail --check, and a leave refuses with nothing changed', (t) => {
  const { fixture, leave } = setUp(t);
  const site = joinedSite(fixture, 'one');
  fs.appendFileSync(path.join(site, 'docs', 'intro.md'), 'More.\n');
  const before = facts(fixture, site);
  const checked = leave(site, '--check');
  assert.equal(checked.status, EXIT.CHECKS, checked.stdout);
  assert.match(checked.stdout, /^FAIL changes\s+1 changed tracked file: the tree must be clean/m);
  const refused = leave(site);
  assert.equal(refused.status, EXIT.REFUSED, refused.output);
  assert.match(refused.stderr, /shared:leave refused: 1 blocker\./);
  assert.match(refused.stderr, /Nothing was changed\./);
  assert.deepEqual(facts(fixture, site), before);
  fixture.git(['checkout', '-q', '--', 'docs/intro.md'], site);
  fixture.git(['switch', '-q', '-c', 'side'], site);
  assert.match(leave(site, '--check').stdout, /^FAIL branch\s+on side: a leave commits on master/m);
  assert.equal(leave(site).status, EXIT.REFUSED);
  assert.equal(remoteOf(fixture, site), fixture.hub);
  fixture.commitToSite(site, { 'docs/intro.md': '# Intro on side\n' }, 'Change the intro on side');
  fixture.git(['switch', '-q', 'master'], site);
  fixture.commitToSite(site, { 'docs/intro.md': '# Intro on master\n' }, 'Change the intro on master');
  assert.notEqual(gitExit(fixture, ['merge', '-q', 'side'], site), 0, 'the merge stops at a conflict');
  assert.match(leave(site, '--check').stdout, /^FAIL open\s+a merge is still open {2}\(fix: /m);
  assert.equal(leave(site).status, EXIT.REFUSED);
  assert.equal(remoteOf(fixture, site), fixture.hub);
  assert.equal(sharedLinesOf(site).length, 11, 'the lines stay');
});

test('a commit that stops puts package.json back, keeps the remote, and exits 5', (t) => {
  const { fixture, leave } = setUp(t);
  const site = joinedSite(fixture, 'one');
  const hook = path.join(site, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hook, '#!/bin/sh\necho "the hook says no" >&2\nexit 1\n', { mode: 0o755 });
  const before = contentFacts(fixture, site);
  const result = leave(site);
  assert.equal(result.status, EXIT.GIT, result.output);
  assert.match(result.stderr, /package\.json is back as it was, and nothing else was changed/);
  assert.deepEqual(contentFacts(fixture, site), before, 'the file is put back, so only its time in the index moved');
  fs.rmSync(hook);
  assert.equal(leave(site).status, EXIT.OK, 'the same run goes through once the hook lets it');
});

test('a line of the site\'s own that runs a shared line, and work the hub lacks, are named by hand', (t) => {
  const { fixture, leave } = setUp(t);
  const site = joinedSite(fixture, 'one');
  commitManifest(fixture, site, (manifest) => { manifest.scripts.test = 'npm run test:site && npm run test:shared'; }, 'Test it all');
  fixture.commitToSite(site, { 'shared/css/custom.scss': 'a change the hub never took\n' }, 'Change the shared styles');
  const { status, stdout } = leave(site, '--check');
  assert.equal(status, EXIT.OK, stdout);
  assert.match(stdout, /^warn callers\s+1 npm line of the site's own run a line that goes {2}\(fix: edit them after the leave\)$/m);
  assert.match(stdout, /^\s+test: npm run test:shared$/m);
  assert.match(stdout, /^warn unpublished\s+shared\/ holds 1 commit the hub lacks: after the leave they stay here alone {2}\(fix: npm run shared:push first/m);
  assert.match(stdout, /Change the shared styles/);
});

test('after a leave, the other sites\' runs pass it by without a word', (t) => {
  const { fixture, leave, all } = setUp(t);
  const one = joinedSite(fixture, 'one');
  const two = joinedSite(fixture, 'two');
  assert.equal(leave(two).status, EXIT.OK);
  const status = all(one, 'status', '--offline');
  assert.match(status.stdout, /^Found 1 site of this hub: one \(here\)\.$/m, status.output);
  assert.deepEqual(warnings(status.output), []);
  assert.doesNotMatch(status.output, /\btwo\b/);
  fixture.commitToSite(one, { 'shared/css/custom.scss': 'a change from one\n' }, 'Change the styles from one');
  const pushed = pushIn(fixture, one, stubTests(fixture));
  assert.equal(pushed.status, EXIT.OK, pushed.output);
  assert.deepEqual(warnings(pushed.output), []);
  assert.doesNotMatch(pushed.output, /\btwo\b/);
});

test('a fresh clone, which keeps its shared lines, still gets the warning with both ways on', (t) => {
  const { fixture, all } = setUp(t);
  const one = joinedSite(fixture, 'one');
  const two = joinedSite(fixture, 'two');
  fixture.git(['remote', 'remove', 'shared'], two);
  const { output } = all(one, 'status', '--offline');
  const [warning = '', ...rest] = warnings(output);
  assert.deepEqual(rest, []);
  assert.ok(warning.startsWith('WARNING: two holds shared/ and has no shared remote, so this run misses it.'), warning);
  assert.ok(warning.includes(`Fix, for a fresh clone: cd ../two && git remote add shared ${fixture.hub}.`), warning);
  assert.ok(warning.endsWith('To take two out of the hub instead: cd ../two && npm run shared:leave.'), warning);
});

test('the round trip: a site leaves, the others take a change quietly, it comes back with its own lines and pulls the change', (t) => {
  const { fixture, leave, all } = setUp(t);
  const one = joinedSite(fixture, 'one');
  const two = joinedSite(fixture, 'two');
  const three = joinedSite(fixture, 'three');
  const linesBefore = manifestText(two);
  assert.equal(leave(two).status, EXIT.OK);
  assert.equal(linesBeforeLeave(two, fixture.env)['shared:verify'], OWN_VERIFY);
  const body = fixture.git(['log', '-1', '--format=%b'], two);
  fixture.git(['commit', '-q', '--amend', '-m', 'Take two off the hub for a while', '-m', body], two);
  assert.equal(linesBeforeLeave(two, fixture.env)['shared:verify'], OWN_VERIFY, 'a leave commit reworded by hand is still found');
  fixture.commitToSite(one, { 'shared/css/custom.scss': 'taken while two was out\n' }, 'Change the styles while two is out');
  const pushed = pushIn(fixture, one, stubTests(fixture));
  assert.equal(pushed.status, EXIT.OK, pushed.output);
  assert.deepEqual(warnings(pushed.output), []);
  const pulled = pullIn(fixture, three);
  assert.equal(pulled.status, EXIT.OK, pulled.output);
  assert.deepEqual(warnings(all(three, 'status', '--offline').output), []);
  assert.notEqual(fs.readFileSync(path.join(two, 'shared', 'css', 'custom.scss'), 'utf8'), 'taken while two was out\n', 'two took nothing while out');
  const left = fixture.git(['rev-parse', 'HEAD'], two);
  const joined = fixture.script('join.mjs', two, '.');
  assert.equal(joined.status, EXIT.OK, joined.output);
  assert.doesNotMatch(joined.stdout, /compare against the build you kept/, 'shared/ stayed, so the way back asks for no compare');
  assert.deepEqual(fixture.git(['log', '--format=%s', `${left}..HEAD`], two).split('\n'), ['Add the shared commands and stubs'], 'one commit');
  assert.equal(manifestText(two), linesBefore, 'the lines come back as they were, shared:verify the site\'s own');
  assert.equal(remoteOf(fixture, two), fixture.hub);
  const back = pullIn(fixture, two);
  assert.equal(back.status, EXIT.OK, back.output);
  assert.equal(fs.readFileSync(path.join(two, 'shared', 'css', 'custom.scss'), 'utf8'), 'taken while two was out\n');
  assert.equal(readState(two, { fetch: false, env: fixture.env }).state, STATES.IN_SYNC);
  assert.equal(fixture.git(['status', '--porcelain'], two), '');
  assert.match(all(one, 'status', '--offline').stdout, /^Found 3 sites of this hub: one \(here\), three, two\.$/m);
});
