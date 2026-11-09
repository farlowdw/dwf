/**
 * scripts/__tests__/state.test.mjs: the state reader on real repositories. Each state is built by
 * real subtree commands, as a person would reach it, and classify()'s table is tested without git.
 * To add a state: a row in the table and a test that reaches it with real commands.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  REASONS, RELATIONS, STATES, carriedCommits, classify, commitsToPublish, hubRecords, readRecords, readState,
} from '../lib/state.mjs';
import { fixtureFor } from './fixture.mjs';
import { pullIn, pushIn, pushToOrigin, remount, revertTheAdd, rewindHub, stubTests } from './flows.mjs';

const EDIT = { 'shared/README.md': 'Edited in a site.\n' };
const HUB_EDIT = { 'css/custom.scss': 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\n' };

test('classify: the table of the six states', () => {
  const same = { recorded: 'r', upstream: 'r', headTree: 'a', recordedTree: 'a', upstreamTree: 'a', recordedIsAncestor: true };
  const rows = [
    [{}, STATES.IN_SYNC],
    [{ upstream: 'u', upstreamTree: 'b' }, STATES.BEHIND],
    [{ upstream: 'u' }, STATES.BEHIND],
    [{ headTree: 'b' }, STATES.AHEAD],
    [{ upstream: 'u', upstreamTree: 'b', headTree: 'c' }, STATES.DIVERGED],
    [{ upstream: 'u', upstreamTree: 'b', headTree: 'b' }, STATES.PUSHED_NOT_REJOINED],
    [{ recordedIsAncestor: false }, STATES.NOT_ANCESTOR],
  ];
  for (const [change, expected] of rows) assert.equal(classify({ ...same, ...change }), expected);
});

test('hubRecords drops a trailer that points at a local squash commit', () => {
  const squash = { commit: 'S', parents: [], split: 'H' };
  const addMerge = { commit: 'M', parents: ['X', 'S'], split: 'S' };
  assert.deepEqual(hubRecords([addMerge, squash]), [squash]);
});

test('in sync: straight after git subtree add', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.IN_SYNC);
  assert.equal(state.recorded, fixture.git(['rev-parse', 'HEAD'], fixture.hubWork));
  assert.equal(state.fetched, true);
  assert.deepEqual([state.ahead, state.behind], [0, 0]);
});

test('behind: the hub moved, and the state lists what a pull brings', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const sha = fixture.commitToHub(HUB_EDIT, 'Add a ninth line');
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.BEHIND);
  assert.equal(state.behind, 1);
  assert.deepEqual(state.incoming, [{ sha, subject: 'Add a ninth line' }]);
});

test('in sync again after a real pull', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(HUB_EDIT, 'Add a ninth line');
  fixture.subtreePull(site);
  assert.equal(readState(site, { env: fixture.env }).state, STATES.IN_SYNC);
});

test('the record is read with no path limit: a limited log misses the squash commit', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const sha = fixture.commitToHub(HUB_EDIT, 'Add a ninth line');
  fixture.subtreePull(site);
  const limited = fixture.git(['log', '--grep=^git-subtree-dir: shared', '--format=%B', 'HEAD', '--', 'shared'], site);
  assert.equal(limited.includes(sha), false);
  assert.equal(readRecords(site, fixture.env)[0].split, sha);
});

test('ahead: a site commit under shared/, listed with its subject', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const sha = fixture.commitToSite(site, EDIT, 'Reword the readme');
  fixture.commitToSite(site, { 'docs/two.md': 'A site page.\n' }, 'Add a site page');
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.AHEAD);
  assert.equal(state.ahead, 1);
  assert.deepEqual(state.outgoing.map((commit) => [commit.sha, commit.subject]), [[sha, 'Reword the readme']]);
});

test('a commit that mixes shared/ with site files is flagged, a shared-only one is not', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Shared only');
  fixture.commitToSite(site, { 'shared/css/custom.scss': 'mixed\n', 'docs/two.md': 'x\n' }, 'Mixed');
  const { outgoing } = readState(site, { env: fixture.env });
  assert.deepEqual(outgoing.map((commit) => [commit.subject, commit.mixed]), [['Mixed', true], ['Shared only', false]]);
});

test('diverged: both moved, and a clean pull leaves it ahead', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Reword the readme');
  fixture.commitToHub(HUB_EDIT, 'Add a ninth line');
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.DIVERGED);
  assert.deepEqual([state.ahead, state.behind], [1, 1]);
  fixture.subtreePull(site);
  const pulled = readState(site, { env: fixture.env });
  assert.equal(pulled.state, STATES.AHEAD);
  assert.equal(pulled.ahead, 1);
});

test('pushed but not rejoined, then in sync after the rejoin', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Reword the readme');
  fixture.subtreePush(site);
  const pushed = readState(site, { env: fixture.env });
  assert.equal(pushed.state, STATES.PUSHED_NOT_REJOINED);
  assert.notEqual(pushed.recorded, pushed.upstream);
  fixture.rejoin(site);
  assert.equal(readState(site, { env: fixture.env }).state, STATES.IN_SYNC);
});

test('a second site reads behind after the first pushes, and ends in sync', (t) => {
  const fixture = fixtureFor(t);
  const one = fixture.addSite('one');
  const two = fixture.addSite('two');
  fixture.commitToSite(one, EDIT, 'Reword the readme');
  fixture.subtreePush(one);
  fixture.rejoin(one);
  assert.equal(readState(two, { env: fixture.env }).state, STATES.BEHIND);
  fixture.subtreePull(two);
  assert.equal(readState(two, { env: fixture.env }).state, STATES.IN_SYNC);
});

test('recorded sha not an ancestor: the hub was rewritten', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.git(['commit', '--amend', '-q', '-m', 'Rewritten'], fixture.hubWork);
  fixture.git(['push', '-q', '--force', 'origin', 'main'], fixture.hubWork);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.NOT_ANCESTOR);
  assert.equal(state.relation, RELATIONS.UNRELATED);
});

test('recorded sha not an ancestor: a rejoin ran without its push', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Reword the readme');
  fixture.rejoin(site);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.NOT_ANCESTOR);
  assert.equal(state.relation, RELATIONS.AHEAD_OF_HUB);
});

test('recorded sha not an ancestor: a fresh clone cannot find a rewritten sha', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.git(['commit', '--amend', '-q', '-m', 'Rewritten'], fixture.hubWork);
  fixture.git(['push', '-q', '--force', 'origin', 'main'], fixture.hubWork);
  const clone = path.join(fixture.sites, 'clone');
  fixture.git(['clone', '-q', '--no-local', site, clone], fixture.sites);
  fixture.git(['remote', 'add', 'shared', fixture.hub], clone);
  const state = readState(clone, { env: fixture.env });
  assert.equal(state.state, STATES.NOT_ANCESTOR);
  assert.equal(state.relation, RELATIONS.MISSING);
});

test('a stale branch that merges late does not win: the descendant-most sha does', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.git(['branch', 'stale'], site);
  const older = fixture.commitToHub({ 'one.txt': 'one\n' }, 'First hub change');
  const newest = fixture.commitToHub({ 'two.txt': 'two\n' }, 'Second hub change');
  fixture.subtreePull(site);
  fixture.git(['switch', '-q', 'stale'], site);
  const later = { GIT_COMMITTER_DATE: '2040-01-01T00:00:00Z', GIT_AUTHOR_DATE: '2040-01-01T00:00:00Z' };
  fixture.git(['subtree', 'merge', '--prefix', 'shared', older, '--squash', '-m', 'shared: stale pull'], site, later);
  fixture.git(['switch', '-q', 'master'], site);
  fixture.git(['merge', '-q', '--no-edit', 'stale'], site);
  const records = readRecords(site, fixture.env);
  assert.equal(records[0].split, older);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.recorded, newest);
  assert.equal(state.state, STATES.IN_SYNC);
});

test('fetch: false reads the hub as last fetched, and a failed fetch says so', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(HUB_EDIT, 'Add a ninth line');
  const offline = readState(site, { fetch: false, env: fixture.env });
  assert.equal(offline.state, STATES.IN_SYNC);
  assert.equal(offline.fetched, null);
  fixture.git(['remote', 'set-url', 'shared', path.join(fixture.base, 'gone.git')], site);
  const unreachable = readState(site, { env: fixture.env });
  assert.equal(unreachable.fetched, false);
  assert.equal(unreachable.state, STATES.IN_SYNC);
});

test('unreadable: no folder, no record, no remote, never fetched', (t) => {
  const fixture = fixtureFor(t);
  const reasonOf = (root) => readState(root, { env: fixture.env }).reason;
  const plain = fixture.addRepository('plain', { 'a.txt': 'a\n' });
  assert.equal(reasonOf(plain), REASONS.NO_FOLDER);
  const byHand = fixture.addRepository('by-hand', { 'shared/a.txt': 'a\n' });
  assert.equal(reasonOf(byHand), REASONS.NO_RECORD);
  const site = fixture.addSite('one');
  fixture.git(['update-ref', '-d', 'refs/remotes/shared/main'], site);
  assert.equal(readState(site, { fetch: false, env: fixture.env }).reason, REASONS.NO_UPSTREAM);
  fixture.git(['remote', 'remove', 'shared'], site);
  assert.equal(reasonOf(site), REASONS.NO_REMOTE);
});

test('commitsToPublish lists exactly what a push adds to the hub', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Reword the readme');
  const { recorded } = readState(site, { env: fixture.env });
  const { split, commits } = commitsToPublish(site, recorded, fixture.env);
  assert.deepEqual(commits.map((commit) => commit.subject), ['Reword the readme']);
  fixture.subtreePush(site);
  assert.equal(fixture.git(['rev-parse', 'main'], fixture.hub), split);
  assert.equal(fs.existsSync(path.join(site, 'shared', 'README.md')), true);
});

/** carriedCommits on a history written out by hand: each key is a commit, each value its parents. */
function carried(parents, { noFolder = [], records = [{ commit: 'q', mainline: null, split: 'H' }], head = 'head' }) {
  const history = new Map(Object.entries(parents));
  return carriedCommits({ head, history, records, hasFolder: (commit) => !noFolder.includes(commit) });
}

const OLD_COMMITS = { old: [], older: ['old'], add: ['older', 'q'], q: [] };

test('carriedCommits: what a split would keep as it is, without running one', () => {
  const beforeAdd = ['old', 'older', 'q'];
  const lost = { ...OLD_COMMITS, gone: ['add'], back: ['gone'], head: ['back'] };
  const twice = { ...OLD_COMMITS, gone: ['add'], still: ['gone'], back: ['still'], head: ['back'] };
  const late = { ...OLD_COMMITS, late: ['old'], work: ['add'], head: ['work', 'late'] };
  const side = { ...OLD_COMMITS, gone: ['add'], work: ['add'], head: ['work', 'gone'] };
  const closed = { ...lost, q2: ['q'], head: ['back'], record: ['head', 'q2'] };
  const stopsLater = { ...closed, gone2: ['record'], then: ['gone2'] };
  const oddMerge = { ...OLD_COMMITS, odd: ['older', 'q'], head: ['odd'] };
  const rejoinRecord = { commit: 'record', mainline: 'head', split: 'H2' };
  const squash = { commit: 'q2', mainline: null, split: 'H2' };
  const rows = [
    ['the site\'s commits before the add are never counted', OLD_COMMITS, { head: 'add', noFolder: beforeAdd }, []],
    ['a commit after the add without the folder is', lost, { noFolder: [...beforeAdd, 'gone'] }, ['gone']],
    ['two in a row are both counted, oldest first', twice, { noFolder: [...beforeAdd, 'gone', 'still'] }, ['gone', 'still']],
    ['a branch from before the add, merged later, is not', late, { noFolder: [...beforeAdd, 'late'] }, []],
    ['a side line that lost the folder is', side, { noFolder: [...beforeAdd, 'gone'] }, ['gone']],
    ['a record stops the walk', closed, { head: 'record', noFolder: [...beforeAdd, 'gone'], records: [rejoinRecord, squash, { commit: 'q', mainline: null, split: 'H' }] }, []],
    ['a squash commit has a mapping: a merge of one with no folder is counted', oddMerge, { noFolder: [...beforeAdd, 'odd'] }, ['odd']],
    ['one after the record is counted', stopsLater, { head: 'then', noFolder: [...beforeAdd, 'gone', 'gone2'], records: [rejoinRecord, squash] }, ['gone2']],
  ];
  for (const [name, parents, options, expected] of rows) assert.deepEqual(carried(parents, options), expected, name);
});

test('leaks: none on a mounted site, one with its subject after git rm and a fresh add', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  assert.deepEqual(readState(site, { env: fixture.env }).leaks, []);
  remount(fixture, site);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.IN_SYNC);
  assert.deepEqual(state.leaks.map(({ subject }) => subject), ['Take the mount out']);
  assert.equal(state.leaks[0].sha, fixture.git(['log', '-1', '--format=%H', '--grep=Take the mount out'], site));
});

test('leaks: a revert of the add counts, and bringing shared/ back by a revert leaves it counted', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  revertTheAdd(fixture, site);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.IN_SYNC);
  assert.equal(state.leaks.length, 1);
  assert.match(state.leaks[0].subject, /^Revert "Merge commit/);
});

/** A commit on a side branch that a merge leaves out of shared/. */
function sideLine(fixture, site) {
  fixture.git(['switch', '-q', '-c', 'side'], site);
  fixture.commitToSite(site, EDIT, 'Side edit');
  fixture.git(['switch', '-q', 'master'], site);
  fixture.git(['merge', '-q', '--no-edit', '-s', 'ours', 'side'], site);
}

/** Histories to read both ways. Each takes a site in sync, and `leaks` says what it should end up as. */
const SHAPES = [
  ['just mounted', () => {}, false],
  ['a site commit outside shared/', (fixture, site) => fixture.commitToSite(site, { 'docs/two.md': 'x\n' }, 'Site page'), false],
  ['a commit under shared/', (fixture, site) => fixture.commitToSite(site, EDIT, 'Edit'), false],
  ['published and rejoined', (fixture, site) => {
    fixture.commitToSite(site, EDIT, 'Edit');
    assert.equal(pushIn(fixture, site, stubTests(fixture)).status, 0);
  }, false],
  ['pulled', (fixture, site) => {
    fixture.commitToHub(HUB_EDIT, 'Hub edit');
    assert.equal(pullIn(fixture, site).status, 0);
  }, false],
  ['pulled, then a commit', (fixture, site) => {
    fixture.commitToHub(HUB_EDIT, 'Hub edit');
    assert.equal(pullIn(fixture, site).status, 0);
    fixture.commitToSite(site, EDIT, 'Edit');
  }, false],
  ['a commit behind a pull by hand', (fixture, site) => {
    fixture.commitToSite(site, EDIT, 'Edit');
    fixture.commitToHub(HUB_EDIT, 'Hub edit');
    fixture.subtreePull(site);
  }, false],
  ['a commit and its revert behind a pull by hand', (fixture, site) => {
    fixture.commitToSite(site, EDIT, 'Edit');
    fixture.git(['revert', '--no-edit', 'HEAD'], site);
    fixture.commitToHub(HUB_EDIT, 'Hub edit');
    fixture.subtreePull(site);
  }, false],
  ['a branch from before the mount, merged in', (fixture, site) => {
    const start = fixture.git(['log', '--format=%H', '--grep=^Start the site$'], site);
    fixture.git(['switch', '-q', '-c', 'old', start], site);
    fixture.commitToSite(site, { 'docs/old.md': 'x\n' }, 'Old branch');
    fixture.git(['switch', '-q', 'master'], site);
    fixture.git(['merge', '-q', '--no-edit', 'old'], site);
  }, false],
  ['a side line that a merge leaves out', sideLine, false],
  ['git rm and a fresh add', (fixture, site) => remount(fixture, site), true],
  ['the add reverted and brought back', (fixture, site) => revertTheAdd(fixture, site), true],
  ['the mount out, back, then a commit', (fixture, site) => {
    remount(fixture, site);
    fixture.commitToSite(site, EDIT, 'Edit');
  }, true],
];

for (const [name, reach, leaking] of SHAPES) {
  test(`the sign and a real split agree: ${name}`, (t) => {
    const fixture = fixtureFor(t);
    const site = fixture.addSite('one');
    reach(fixture, site);
    const state = readState(site, { env: fixture.env });
    const { commits, ownCommits } = commitsToPublish(site, state.upstream, fixture.env);
    assert.equal(state.leaks.length > 0, leaking);
    assert.equal(ownCommits > 0, leaking);
    if (leaking) return;
    const subjects = (list) => list.map(({ subject }) => subject).sort();
    assert.deepEqual(subjects(state.outgoing), subjects(commits));
  });
}

test('commitsToPublish counts the site\'s own commits in a split, and none in a clean one', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit');
  const clean = commitsToPublish(site, fixture.git(['rev-parse', 'shared/main'], site), fixture.env);
  assert.equal(clean.ownCommits, 0);
  fixture.git(['revert', '--no-edit', 'HEAD'], site);
  remount(fixture, site);
  fixture.commitToSite(site, EDIT, 'Edit again');
  const { ownCommits } = commitsToPublish(site, fixture.git(['rev-parse', 'shared/main'], site), fixture.env);
  const onTheLine = Number(fixture.git(['rev-list', '--count', 'HEAD'], site));
  assert.ok(ownCommits > 3 && ownCommits < onTheLine, `${ownCommits} of ${onTheLine}`);
});

test('outgoing: a commit behind a plain pull stays listed, with shared/ equal to the hub', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { ...EDIT, 'docs/two.md': 'x\n' }, 'Mixed');
  fixture.git(['fetch', '-q', 'shared', 'main'], site);
  const other = fixture.addSite('two');
  fixture.commitToSite(other, EDIT, 'Same edit');
  fixture.commitToSite(other, { 'shared/more.txt': 'more\n' }, 'More');
  assert.equal(pushIn(fixture, other, stubTests(fixture)).status, 0);
  fixture.subtreePull(site);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.IN_SYNC);
  assert.deepEqual(state.outgoing.map(({ subject, mixed }) => [subject, mixed]), [['shared: pull', false], ['Mixed', true]]);
  assert.equal(state.ahead, 1);
});

test('outgoing: a pull\'s merge with nothing behind it is not listed, and a commit after it is', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToHub(HUB_EDIT, 'Hub edit');
  fixture.subtreePull(site);
  assert.deepEqual(readState(site, { env: fixture.env }).outgoing, []);
  fixture.commitToSite(site, EDIT, 'Edit');
  assert.deepEqual(readState(site, { env: fixture.env }).outgoing.map(({ subject }) => subject), ['Edit']);
});

test('outgoing starts empty and stops at a rejoin, so a published commit leaves the list', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  assert.deepEqual(readState(site, { env: fixture.env }).outgoing, []);
  fixture.commitToSite(site, EDIT, 'Edit');
  assert.equal(pushIn(fixture, site, stubTests(fixture)).status, 0);
  assert.deepEqual(readState(site, { env: fixture.env }).outgoing, []);
  fixture.commitToSite(site, { 'shared/README.md': 'Again.\n' }, 'Edit again');
  assert.deepEqual(readState(site, { env: fixture.env }).outgoing.map(({ subject }) => subject), ['Edit again']);
});

test('a pull reverted reads as such, and not once the revert is reverted, or for a plain commit', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, EDIT, 'Edit');
  fixture.git(['revert', '--no-edit', 'HEAD'], site);
  assert.equal(readState(site, { env: fixture.env }).revert, null);
  fixture.commitToHub(HUB_EDIT, 'Hub edit');
  fixture.subtreePull(site);
  fixture.git(['revert', '-m', '1', '--no-edit', 'HEAD'], site);
  const revert = fixture.git(['rev-parse', 'HEAD'], site);
  assert.equal(readState(site, { env: fixture.env }).revert, revert);
  fixture.git(['revert', '--no-edit', 'HEAD'], site);
  assert.equal(readState(site, { env: fixture.env }).revert, null);
});

test('the hub went back: a commit a site pulled is on no line of the hub any more', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const before = fixture.git(['rev-parse', 'main'], fixture.hub);
  fixture.commitToHub(HUB_EDIT, 'Hub edit');
  assert.equal(pullIn(fixture, site).status, 0);
  rewindHub(fixture, before);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.state, STATES.NOT_ANCESTOR);
  assert.equal(state.relation, RELATIONS.HUB_WENT_BACK);
  assert.equal(state.undoablePull, true);
  pushToOrigin(fixture, site);
  assert.equal(readState(site, { env: fixture.env }).undoablePull, false);
});

test('the hub went back: a commit this site published counts too, by the log of the fetched ref', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const before = fixture.git(['rev-parse', 'main'], fixture.hub);
  fixture.commitToSite(site, EDIT, 'Edit');
  assert.equal(pushIn(fixture, site, stubTests(fixture)).status, 0);
  rewindHub(fixture, before);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.relation, RELATIONS.HUB_WENT_BACK);
  assert.equal(state.undoablePull, false);
});

test('the hub went back: a pulled commit counts with the fetched ref\'s log expired too', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const before = fixture.git(['rev-parse', 'main'], fixture.hub);
  fixture.commitToHub(HUB_EDIT, 'Hub edit');
  assert.equal(pullIn(fixture, site).status, 0);
  rewindHub(fixture, before);
  fixture.git(['fetch', '-q', 'shared', 'main'], site);
  fixture.git(['reflog', 'expire', '--expire=now', '--expire-unreachable=now', '--all'], site);
  const state = readState(site, { fetch: false, env: fixture.env });
  assert.equal(state.relation, RELATIONS.HUB_WENT_BACK);
});

test('undoablePull is false with a commit on top of the pull: a reset would take that commit instead', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const before = fixture.git(['rev-parse', 'main'], fixture.hub);
  fixture.commitToHub(HUB_EDIT, 'Hub edit');
  assert.equal(pullIn(fixture, site).status, 0);
  fixture.commitToSite(site, { 'docs/two.md': 'x\n' }, 'A site page');
  rewindHub(fixture, before);
  const state = readState(site, { env: fixture.env });
  assert.equal(state.relation, RELATIONS.HUB_WENT_BACK);
  assert.equal(state.undoablePull, false);
});

test('undoablePull is false for an add: undoing it would take the mount away', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.git(['commit', '--amend', '-q', '-m', 'Rewritten'], fixture.hubWork);
  fixture.git(['push', '-q', '--force', 'origin', 'main'], fixture.hubWork);
  assert.equal(readState(site, { env: fixture.env }).undoablePull, false);
});
