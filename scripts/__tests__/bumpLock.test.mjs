/**
 * bumpLock.test.mjs: what shared:bump does to package.json and the lock, as plain data: which entries
 * move, what stays, what counts as an @mui move, and what a new major leaves to change by hand.
 *
 * HOW TO CHANGE IT
 *   A new rule of bumpLock.mjs: a test here. The whole script runs in bump.test.mjs.
 * Run with `npm run test:shared -- --scripts`, or `node --test "scripts/__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  blockedEntries, cutInstalled, cutLock, installedOffManifest, installedOffVersion, isOnVersion, muiMoves, muiVersions, muiXMoves,
  overrideLines, peerOverrideLines, pinnedEntries, rewriteManifest, writeManifest,
} from '../lib/bumpLock.mjs';
import { installFromLock, siteFiles } from './bumpFixture.mjs';
import { writeFiles } from './fixture.mjs';

const VERSION = '3.11.0';

/** A folder holding `files`, removed when the test ends. */
function folderWith(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFiles(root, files);
  return root;
}

const lockWith = (entries) => ({ lockfileVersion: 3, packages: { '': {}, ...entries } });

test('every entry under the pin moves, in both blocks, and nothing else does', () => {
  const manifest = {
    dependencies: { '@docusaurus/core': '^3.9.2', '@docusaurus/theme-mermaid': '3.8.1', react: '^19.0.0' },
    devDependencies: { '@docusaurus/types': '~3.9.0', sass: '1.97.2' },
    scripts: { '@docusaurus/core': 'not a dependency' },
  };
  const result = rewriteManifest(manifest, VERSION);
  assert.deepEqual(result.dependencies, { '@docusaurus/core': VERSION, '@docusaurus/theme-mermaid': VERSION, react: '^19.0.0' });
  assert.deepEqual(result.devDependencies, { '@docusaurus/types': VERSION, sass: '1.97.2' });
  assert.equal(result.scripts['@docusaurus/core'], 'not a dependency');
  assert.equal(manifest.dependencies['@docusaurus/core'], '^3.9.2', 'the original stays as it was');
});

test('a package under the scope with version numbers of its own stays', () => {
  const manifest = { dependencies: { '@docusaurus/responsive-loader': '1.7.0', '@docusaurus/react-loadable': '6.0.0' } };
  assert.deepEqual(rewriteManifest(manifest, VERSION).dependencies, manifest.dependencies);
});

for (const [name, text] of [
  ['two spaces and a line break', '{\n  "dependencies": {\n    "@docusaurus/core": "3.9.2"\n  }\n}\n'],
  ['four spaces', '{\n    "dependencies": {\n        "@docusaurus/core": "3.9.2"\n    }\n}\n'],
  ['tabs', '{\n\t"dependencies": {\n\t\t"@docusaurus/core": "3.9.2"\n\t}\n}\n'],
  ['no line break at the end', '{\n  "dependencies": {\n    "@docusaurus/core": "3.9.2"\n  }\n}'],
]) {
  test(`package.json keeps its layout: ${name}`, (t) => {
    const root = folderWith(t, { 'package.json': text });
    assert.equal(writeManifest(root, VERSION), 1);
    assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), text.replace('3.9.2', VERSION));
  });
}

test('the cut takes every copy of a pinned package, and what is nested below one', () => {
  const lock = lockWith({
    'node_modules/@docusaurus/core': { version: '3.9.2' },
    'node_modules/@docusaurus/core/node_modules/webpack-merge': { version: '5.10.0' },
    'node_modules/@docusaurus/core/node_modules/deep/node_modules/a': { version: '1.0.0' },
    'node_modules/some-plugin/node_modules/@docusaurus/utils': { version: '3.8.1' },
    'node_modules/some-plugin/node_modules/@docusaurus/utils/node_modules/b': { version: '1.0.0' },
    'node_modules/some-plugin': { version: '2.0.0' },
    'node_modules/@docusaurus/responsive-loader': { version: '1.7.0' },
    'node_modules/@docusaurus/core-like': { version: '1.0.0' },
    'node_modules/webpack-merge': { version: '6.0.0' },
  });
  const { lock: cut, removed } = cutLock(lock);
  assert.deepEqual(Object.keys(cut.packages).sort(), [
    '',
    'node_modules/@docusaurus/responsive-loader',
    'node_modules/some-plugin',
    'node_modules/webpack-merge',
  ]);
  assert.equal(removed.length, 6);
  assert.equal(Object.keys(lock.packages).length, 10, 'the original stays as it was');
});

test('a package whose name starts like a pinned one is not nested below it', () => {
  const lock = lockWith({
    'node_modules/@docusaurus/core': { version: '3.9.2' },
    'node_modules/@docusaurus/core-extras': { version: '1.0.0' },
  });
  const removedKeys = cutLock(lock).removed;
  assert.ok(removedKeys.includes('node_modules/@docusaurus/core'));
  assert.ok(removedKeys.includes('node_modules/@docusaurus/core-extras'), 'it is under the pin by its own name');
  const other = lockWith({ 'node_modules/@docusaurus/core': { version: '3.9.2' }, 'node_modules/@docusaurus/corex/node_modules/a': {} });
  assert.deepEqual(cutLock(other).removed, ['node_modules/@docusaurus/core']);
});

test('a lock with no packages block is left alone', () => {
  assert.deepEqual(cutLock({ lockfileVersion: 1, dependencies: {} }).removed, []);
});

test('the cut reaches the disk, and npm\'s own record of the folder goes with it', (t) => {
  const root = folderWith(t, siteFiles());
  installFromLock(root);
  assert.equal(cutInstalled(root), 4);
  assert.equal(fs.existsSync(path.join(root, 'node_modules/@docusaurus/core')), false);
  assert.equal(fs.existsSync(path.join(root, 'node_modules/@docusaurus/types')), false);
  assert.equal(fs.existsSync(path.join(root, 'node_modules/.package-lock.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'node_modules/@docusaurus/responsive-loader')), true);
  assert.equal(fs.existsSync(path.join(root, 'node_modules/react')), true);
});

test('a linked folder of the lock stays, on disk and in the lock', (t) => {
  const key = 'packages/@docusaurus/core';
  const root = folderWith(t, {
    'package-lock.json': JSON.stringify(lockWith({ [key]: { version: '1.0.0' } })),
    'packages/@docusaurus/core/keep.txt': 'x',
  });
  assert.equal(cutInstalled(root), 0);
  assert.equal(fs.existsSync(path.join(root, key, 'keep.txt')), true);
});

test('on the version means exact entries and one version in the lock', (t) => {
  const on = (manifest, lock) => isOnVersion(folderWith(t, { 'package.json': JSON.stringify(manifest), 'package-lock.json': JSON.stringify(lock) }), VERSION);
  const exact = { dependencies: { '@docusaurus/core': VERSION } };
  const locked = lockWith({ 'node_modules/@docusaurus/core': { version: VERSION } });
  assert.equal(on(exact, locked), true);
  assert.equal(on({ dependencies: { '@docusaurus/core': `^${VERSION}` } }, locked), false, 'a caret can move');
  assert.equal(on({ dependencies: { '@docusaurus/core': '3.9.2' } }, locked), false);
  assert.equal(on(exact, lockWith({ 'node_modules/@docusaurus/core': { version: '3.9.2' } })), false);
  const two = lockWith({ 'node_modules/@docusaurus/core': { version: VERSION }, 'node_modules/a/node_modules/@docusaurus/utils': { version: '3.9.2' } });
  assert.equal(on(exact, two), false, 'two versions in the lock');
  assert.equal(on({ dependencies: { react: '19.0.0' } }, locked), false, 'no entry at all');
  assert.equal(isOnVersion(folderWith(t, { 'package.json': JSON.stringify(exact) }), VERSION), false, 'no lock');
});

test('a direct entry off the version on disk is named, a missing one too', (t) => {
  const root = folderWith(t, {
    'node_modules/@docusaurus/core/package.json': `{ "version": "${VERSION}" }`,
    'node_modules/@docusaurus/types/package.json': '{ "version": "3.9.2" }',
  });
  const entries = pinnedEntries({ dependencies: { '@docusaurus/core': VERSION }, devDependencies: { '@docusaurus/types': VERSION, '@docusaurus/gone': VERSION } });
  assert.deepEqual(installedOffVersion(root, entries, VERSION), [
    { name: '@docusaurus/gone', found: null },
    { name: '@docusaurus/types', found: '3.9.2' },
  ]);
});

test('off the manifest: an exact entry wants that version, a range what it covers, and a tag cannot be read', (t) => {
  const root = folderWith(t, {
    'node_modules/@docusaurus/core/package.json': '{ "version": "4.0.0-canary-7002" }',
    'node_modules/@docusaurus/types/package.json': '{ "version": "3.9.2" }',
    'node_modules/@docusaurus/theme-classic/package.json': '{ "version": "3.9.2" }',
    'node_modules/@docusaurus/preset-classic/package.json': '{ "version": "4.0.0-canary-7002" }',
  });
  const off = (dependencies) => installedOffManifest(root, pinnedEntries({ dependencies }));
  assert.deepEqual(off({ '@docusaurus/core': '3.10.2' }), [{ name: '@docusaurus/core', spec: '3.10.2', found: '4.0.0-canary-7002' }]);
  assert.deepEqual(off({ '@docusaurus/types': '3.9.2', '@docusaurus/theme-classic': '^3.8.0' }), []);
  assert.deepEqual(off({ '@docusaurus/types': '^3.10.0' }), [{ name: '@docusaurus/types', spec: '^3.10.0', found: '3.9.2' }]);
  assert.deepEqual(off({ '@docusaurus/preset-classic': '4.0.0-canary-7002' }), []);
  assert.deepEqual(off({ '@docusaurus/gone': '3.10.2' }), [{ name: '@docusaurus/gone', spec: '3.10.2', found: null }]);
  assert.deepEqual(off({ '@docusaurus/gone': 'latest' }), []);
});

test('an override that shuts out the manifest\'s own entries is named, nested, at the top or under a version', () => {
  const entries = { '@docusaurus/core': '3.10.2' };
  const blocked = (overrides, dependencies = entries) => blockedEntries({ dependencies, overrides });
  assert.deepEqual(blocked({ a: { '@docusaurus/core': '^4.0.0' }, b: { '@docusaurus/core': '^3.0.0' } }), ['a > @docusaurus/core']);
  assert.deepEqual(blocked({ '@docusaurus/core': '^4.0.0' }), ['@docusaurus/core']);
  assert.deepEqual(blocked({ a: { '@docusaurus/core': '$@docusaurus/core' } }), []);
  assert.deepEqual(blocked({ a: { react: '^4.0.0' } }), []);
  assert.deepEqual(blocked({ a: { '@docusaurus/core': '^3.0.0' } }, { '@docusaurus/core': '^3.9.0' }), [], 'a range reads as its first version');
  assert.deepEqual(blockedEntries({ dependencies: entries }), [], 'no overrides');
  assert.deepEqual(blockedEntries({ dependencies: { react: '19.0.0' }, overrides: { a: { '@docusaurus/core': '^4.0.0' } } }), [], 'no entries');
  assert.deepEqual(blocked({ a: { '@docusaurus/core': '^4.0.0-canary-7002' } }, { '@docusaurus/core': '4.0.0-canary-7002' }), [], 'on its own version');
});

test('a short @docusaurus spec reads as its first version with zeros, and never throws', () => {
  const blocked = (spec, value) => blockedEntries({ dependencies: { '@docusaurus/core': spec }, overrides: { a: { '@docusaurus/core': value } } });
  assert.deepEqual(blocked('^3.9', '^4.0.0'), ['a > @docusaurus/core']);
  assert.deepEqual(blocked('3.x', '^4.0.0'), ['a > @docusaurus/core']);
  assert.deepEqual(blocked('~3', '^3.0.0'), []);
  assert.deepEqual(blocked('^3.9', '^3.9.0'), []);
  assert.deepEqual(blocked('latest', '^4.0.0'), [], 'a tag names no version');
});

/** A lock holding one package that asks for @docusaurus/core at `range`. */
const lockAsking = (range, entry = {}) => lockWith({
  'node_modules/@docusaurus/core': { version: '3.10.2' },
  'node_modules/a-plugin': { version: '1.2.0', peerDependencies: { '@docusaurus/core': range, react: '^18.0.0' }, ...entry },
});

const SASS_RANGE = '^2.0.0-beta || ^3.0.0-alpha';

test('peers: a range that shuts the version out and has no override is named, once', () => {
  const line = `overrides > a-plugin > @docusaurus/core is not set: add it at ^4.0.0, because a-plugin 1.2.0 asks for ${SASS_RANGE}`;
  assert.deepEqual(peerOverrideLines({}, lockAsking(SASS_RANGE), '4.0.0'), [line]);
  const twice = lockAsking(SASS_RANGE);
  twice.packages['node_modules/b/node_modules/a-plugin'] = twice.packages['node_modules/a-plugin'];
  assert.deepEqual(peerOverrideLines({}, twice, '4.0.0'), [line]);
  assert.deepEqual(peerOverrideLines({}, lockAsking(SASS_RANGE), '3.11.0'), []);
});

test('peers: a preview is read as npm reads it, so a plain floor shuts it out and its release does not', () => {
  assert.equal(peerOverrideLines({}, lockAsking('>=3.0.0'), '4.0.0-canary-7002').length, 1);
  assert.equal(peerOverrideLines({}, lockAsking('>=3.0.0'), '4.0.0').length, 0);
});

test('peers: an override that is there already is overrideLines\' to judge', () => {
  const lock = lockAsking(SASS_RANGE);
  for (const overrides of [
    { 'a-plugin': { '@docusaurus/core': '^4.0.0' } },
    { 'a-plugin': { '@docusaurus/core': '^3.0.0' } },
    { 'a-plugin@1': { '@docusaurus/core': '^4.0.0' } },
    { 'a-plugin@1.2.0': { '@docusaurus/core': '^4.0.0' } },
    { '@docusaurus/core': '^4.0.0' },
  ]) {
    assert.deepEqual(peerOverrideLines({ overrides }, lock, '4.0.0'), [], JSON.stringify(overrides));
  }
  const other = { overrides: { 'a-plugin': { react: '^19.0.0' }, 'b-plugin': { '@docusaurus/core': '^4.0.0' } } };
  assert.equal(peerOverrideLines(other, lock, '4.0.0').length, 1);
});

test('peers: only packages outside the pin that ask for one under it, and an optional peer only when it is there', () => {
  const optional = { peerDependenciesMeta: { '@docusaurus/theme-search': { optional: true } }, peerDependencies: { '@docusaurus/theme-search': '^3.0.0' } };
  assert.deepEqual(peerOverrideLines({}, lockAsking(SASS_RANGE, optional), '4.0.0'), []);
  const held = lockAsking(SASS_RANGE, optional);
  held.packages['node_modules/@docusaurus/theme-search'] = { version: '3.10.2' };
  assert.equal(peerOverrideLines({}, held, '4.0.0').length, 1);
  const inside = lockWith({ 'node_modules/@docusaurus/theme-common': { version: '3.10.2', peerDependencies: { '@docusaurus/plugin-content-docs': '^3.0.0' } } });
  assert.deepEqual(peerOverrideLines({}, inside, '4.0.0'), []);
  const loader = lockWith({ 'node_modules/a-plugin': { version: '1.0.0', peerDependencies: { '@docusaurus/react-loadable': '^6.0.0' } } });
  assert.deepEqual(peerOverrideLines({}, loader, '7.0.0'), [], 'a package outside the pin keeps its own numbers');
  assert.deepEqual(peerOverrideLines({}, { lockfileVersion: 1 }, '4.0.0'), [], 'an older lock has no packages');
});

test('every @mui entry counts, nested ones too, and nothing else', () => {
  const lock = lockWith({
    'node_modules/@mui/material': { version: '9.4.0' },
    'node_modules/@mui/x-charts/node_modules/@mui/utils': { version: '9.3.0' },
    'node_modules/@mui/material/node_modules/react-is': { version: '19.0.0' },
    'node_modules/@emotion/react': { version: '11.0.0' },
  });
  assert.deepEqual([...muiVersions(lock).keys()], ['node_modules/@mui/material', 'node_modules/@mui/x-charts/node_modules/@mui/utils']);
});

test('a move is a changed, added or removed entry, and an unchanged one is none', () => {
  const before = new Map([['node_modules/@mui/material', '9.4.0'], ['node_modules/@mui/x-charts', '9.14.0'], ['node_modules/@mui/lab', '9.0.0']]);
  const after = new Map([['node_modules/@mui/material', '9.5.0'], ['node_modules/@mui/x-charts', '9.14.0'], ['node_modules/@mui/system', '9.4.0']]);
  assert.deepEqual(muiMoves(before, after), [
    { name: '@mui/lab', from: '9.0.0', to: null },
    { name: '@mui/material', from: '9.4.0', to: '9.5.0' },
    { name: '@mui/system', from: null, to: '9.4.0' },
  ]);
  assert.deepEqual(muiMoves(before, new Map(before)), []);
});

test('only @mui/x-* moves are the refused kind', () => {
  const moves = [
    { name: '@mui/material', from: '9.4.0', to: '9.5.0' },
    { name: '@mui/x-internals', from: '9.14.0', to: '9.17.0' },
    { name: '@mui/x-virtualizer', from: null, to: '0.7.2' },
    { name: '@mui/xylophone', from: '1.0.0', to: '2.0.0' },
  ];
  assert.deepEqual(muiXMoves(moves).map(({ name }) => name), ['@mui/x-internals', '@mui/x-virtualizer']);
});

const IMAGE_ZOOM = { overrides: { 'docusaurus-plugin-image-zoom': { '@docusaurus/theme-classic': '^3.0.1' }, react: '^19.0.0' } };

test('a new major names the override to change, down to its nested place', () => {
  assert.deepEqual(overrideLines(IMAGE_ZOOM, '4.0.0'), [
    'overrides > docusaurus-plugin-image-zoom > @docusaurus/theme-classic is ^3.0.1: change it to ^4.0.0',
  ]);
  assert.equal(overrideLines(IMAGE_ZOOM, '4.0.0-canary-7002').length, 1, 'a prerelease of it too');
});

test('a step inside the range names nothing, and neither does a site with no overrides', () => {
  assert.deepEqual(overrideLines(IMAGE_ZOOM, '3.11.0'), []);
  assert.deepEqual(overrideLines(IMAGE_ZOOM, '3.9.2'), []);
  assert.deepEqual(overrideLines({}, '4.0.0'), []);
});

test('an override that follows another entry, or names another package, stays out of it', () => {
  const manifest = { overrides: { a: { '@docusaurus/core': '$@docusaurus/core' }, '@docusaurus/responsive-loader': '1.7.0', b: { react: '18.0.0' } } };
  assert.deepEqual(overrideLines(manifest, '4.0.0'), []);
});
