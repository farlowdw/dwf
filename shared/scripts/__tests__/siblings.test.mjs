/**
 * scripts/__tests__/siblings.test.mjs: the sibling finder on real folders. It proves the hub holds no
 * site list: sites are found from `.git/config` files alone. A new remote form gets a row in the
 * first test.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { findSiblings, remoteKey, remoteUrlFromConfig } from '../lib/siblings.mjs';
import { fixtureFor } from './fixture.mjs';

const names = (entries) => entries.map((entry) => entry.name);

test('remoteKey: one hub however it is spelled', () => {
  const spellings = [
    'git@github.com:owner/repo.git',
    'git@github.com:Owner/Repo',
    'git@github.com:/owner/repo.git',
    'ssh://git@github.com/owner/repo.git',
    'ssh://git@github.com:22/owner/repo.git',
    'https://github.com/owner/repo',
    'https://github.com/owner/repo.git/',
  ];
  const keys = new Set(spellings.map((spelling) => remoteKey(spelling)));
  assert.deepEqual([...keys], ['github.com/owner/repo']);
  assert.notEqual(remoteKey('git@github.com:owner/other.git'), remoteKey(spellings[0]));
});

test('remoteKey: a local path means where it is, relative or not', () => {
  const absolute = remoteKey('/tmp/lab/hub.git', '/tmp/lab/one');
  assert.equal(remoteKey('../hub.git', '/tmp/lab/one'), absolute);
  assert.equal(remoteKey('file:///tmp/lab/hub.git', '/tmp/lab/one'), absolute);
  assert.equal(remoteKey('/tmp/lab/hub', '/tmp/lab/one'), absolute);
});

test('remoteUrlFromConfig reads the shared section only', () => {
  const text = [
    '[remote "origin"]', '\turl = git@github.com:owner/site.git',
    '[remote "shared"]', '\tfetch = +refs/heads/*:refs/remotes/shared/*', '\turl = "git@github.com:owner/repo.git"',
    '[branch "master"]', '\tremote = origin',
  ].join('\n');
  assert.equal(remoteUrlFromConfig(text), 'git@github.com:owner/repo.git');
  assert.equal(remoteUrlFromConfig('[remote "origin"]\n\turl = x\n'), null);
});

test('finds the other sites, in name order, spelled differently, and not itself', (t) => {
  const fixture = fixtureFor(t);
  const one = fixture.addSite('one');
  const two = fixture.addSite('two');
  const three = fixture.addSite('three');
  fixture.git(['remote', 'set-url', 'shared', '../../hub.git'], three);
  const found = findSiblings(one, { env: fixture.env });
  assert.deepEqual(names(found.sites), ['three', 'two']);
  assert.equal(found.sites.at(-1).root, two);
});

test('sorts a sibling with no remote and one with another hub apart from the sites', (t) => {
  const fixture = fixtureFor(t);
  const one = fixture.addSite('one');
  const noRemote = fixture.addSite('no-remote');
  fixture.addSharedLines(noRemote);
  fixture.git(['remote', 'remove', 'shared'], noRemote);
  const elsewhere = fixture.addSite('elsewhere');
  fixture.git(['remote', 'set-url', 'shared', 'git@github.com:owner/another.git'], elsewhere);
  fixture.addRepository('plain', { 'shared/notes.txt': 'A folder that happens to be called shared.\n' });
  const found = findSiblings(one, { env: fixture.env });
  assert.deepEqual(names(found.sites), []);
  assert.deepEqual(names(found.withoutRemote), ['no-remote']);
  assert.deepEqual(names(found.otherHub), ['elsewhere']);
  assert.deepEqual(names(found.left), []);
});

test('a mount with no remote and no shared npm line has left the hub; one with its lines is a fresh clone', (t) => {
  const fixture = fixtureFor(t);
  const one = fixture.addSite('one');
  const gone = fixture.addSite('gone');
  fixture.git(['remote', 'remove', 'shared'], gone);
  const clone = fixture.addSite('clone');
  fixture.addSharedLines(clone);
  fixture.git(['remote', 'remove', 'shared'], clone);
  const unreadable = fixture.addSite('unreadable');
  fixture.git(['remote', 'remove', 'shared'], unreadable);
  fs.writeFileSync(path.join(unreadable, 'package.json'), '{ not json');
  const found = findSiblings(one, { env: fixture.env });
  assert.deepEqual(names(found.left), ['gone']);
  assert.deepEqual(names(found.withoutRemote), ['clone', 'unreadable'], 'a package.json that does not read is no proof of a leave');
  assert.deepEqual(names(found.sites), []);
});

test('survives files, dangling symlinks and worktrees, and counts a symlinked site once', (t) => {
  const fixture = fixtureFor(t);
  const one = fixture.addSite('one');
  const two = fixture.addSite('two');
  fs.writeFileSync(path.join(fixture.sites, 'a-file.txt'), 'not a folder\n');
  fs.symlinkSync(path.join(fixture.base, 'gone'), path.join(fixture.sites, 'dangling'));
  fs.symlinkSync(two, path.join(fixture.sites, 'alias-of-two'));
  fs.symlinkSync(one, path.join(fixture.sites, 'alias-of-one'));
  fixture.git(['worktree', 'add', '-q', path.join(fixture.sites, 'worktree'), '-b', 'side'], one);
  assert.deepEqual(names(findSiblings(one, { env: fixture.env }).sites), ['two']);
});

test('with no remote of its own it looks for the settings\' hub', (t) => {
  const fixture = fixtureFor(t);
  fixture.addSite('one');
  const fresh = fixture.addRepository('fresh', { 'a.txt': 'a\n' });
  assert.deepEqual(names(findSiblings(fresh, { env: fixture.env }).sites), ['one']);
});
