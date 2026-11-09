/**
 * scripts/__tests__/requirements.test.mjs: the requirements reader. It reads the hub's real
 * requirements.cjs, then a fixture table with one row of each kind in a real mounted site. The kinds
 * and the checks are the contract: a new kind gets a test here.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkPackages, fixLine, fixSteps, installLine, loadRequirements, openSite, readLock, readPieces, tableProblems,
} from '../lib/requirements.mjs';
import { fixtureFor, writeFiles } from './fixture.mjs';

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HUB_TABLE = path.join(HUB_ROOT, 'requirements.cjs');

/** The pieces of a site, by name. */
function piecesOf(root, env) {
  const table = loadRequirements(root);
  const pieces = readPieces(openSite(root, env), table);
  return { table, pieces, byName: Object.fromEntries(pieces.map((piece) => [piece.row.name, piece])) };
}

test('the hub\'s requirements.cjs is sound, and uses only the five kinds', { skip: !fs.existsSync(HUB_TABLE) }, async () => {
  const { default: table } = await import(HUB_TABLE);
  assert.deepEqual(tableProblems(table), []);
  const kinds = new Set(table.ENTRIES.map((row) => row.kind));
  for (const kind of kinds) assert.ok(['component', 'theme', 'plugin', 'library', 'script'].includes(kind));
});

test('tableProblems names an unknown kind, a missing field and a package with no range', () => {
  const table = {
    RANGES: { react: '^19.0.0' },
    ENTRIES: [
      { name: 'A', kind: 'mystery' },
      { name: 'B', kind: 'component', packages: ['react'] },
      { name: 'C', kind: 'plugin', configText: 'x', packages: ['nope'] },
      { name: 'D', kind: 'script' },
      { name: 'E', kind: 'script', script: 'x', cachePackages: ['absent'] },
    ],
  };
  assert.equal(tableProblems(table).length, 5);
});

test('a script is used through its line in package.json, and the cache is not looked for in the lock', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const row = { name: 'Tool', kind: 'script', script: 'shared:tool', packages: ['serve-handler'], cachePackages: ['puppeteer-core'] };
  const table = { RANGES: { 'serve-handler': '^6.1.6', 'puppeteer-core': '25.16.0' }, ENTRIES: [row] };
  const manifest = JSON.parse(fs.readFileSync(path.join(site, 'package.json'), 'utf8'));
  assert.equal(readPieces(openSite(site, fixture.env), table)[0].used, false);

  const withLine = { ...manifest, scripts: { ...manifest.scripts, 'shared:tool': 'node x.mjs' } };
  writeFiles(site, { 'package.json': `${JSON.stringify(withLine)}\n` });
  const pieces = readPieces(openSite(site, fixture.env), table);
  assert.equal(pieces[0].used, true);
  const { problems } = checkPackages(site, table, pieces);
  assert.deepEqual(problems.map(({ name }) => name), ['serve-handler']);
});

test('a site uses a component by its stub, and a piece it never mentions stays unused', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const { byName } = piecesOf(site, fixture.env);
  assert.deepEqual([byName.Widget.used, byName.Widget.missingStub], [true, false]);
  assert.equal(byName.Widget.stub.target, '@site/shared/components/Widget');
  assert.deepEqual([byName.Editor.used, byName.Editor.missingStub], [false, false]);
});

test('a deleted stub reads as missing when the docs or the config still use the piece', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fs.rmSync(path.join(site, 'src/components/Widget/index.jsx'));
  assert.equal(piecesOf(site, fixture.env).byName.Widget.missingStub, true);
  fixture.commitToSite(site, { 'docusaurus.config.js': 'const { admonitionsConfig } = {};\n' }, 'Use the config');
  assert.equal(piecesOf(site, fixture.env).byName.Admonition.missingStub, true);
});

test('a :::keyword in the docs is evidence too', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'blog/post.md': 'Text.\n\n:::keynote\nHello\n:::\n' }, 'Add a post');
  assert.equal(piecesOf(site, fixture.env).byName.Admonition.missingStub, true);
});

test('a plugin is found in the config, a library in a client module', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const before = piecesOf(site, fixture.env).byName;
  assert.deepEqual([before.Styles.used, before.Reload.used], [true, false]);
  fixture.commitToSite(site, { 'src/clientModules/reload.js': "import x from '@site/shared/lib/reload/index.js';\n" }, 'Add it');
  assert.equal(piecesOf(site, fixture.env).byName.Reload.used, true);
});

test('checkPackages: only the used pieces count, and the lock decides', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const clean = piecesOf(site, fixture.env);
  assert.deepEqual(checkPackages(site, clean.table, clean.pieces), { locked: true, count: 2, problems: [] });
  writeFiles(site, { 'src/components/Editor/index.jsx': "export { default } from '@site/shared/components/Editor';\n" });
  const lock = JSON.parse(fs.readFileSync(path.join(site, 'package-lock.json'), 'utf8'));
  lock.packages['node_modules/react'].version = '18.3.1';
  writeFiles(site, { 'package-lock.json': JSON.stringify(lock) });
  const { table, pieces } = piecesOf(site, fixture.env);
  const { problems } = checkPackages(site, table, pieces);
  assert.deepEqual(problems.map(({ name, found }) => [name, found]), [['react', '18.3.1'], ['tiny-editor', null]]);
  assert.equal(installLine(problems), 'npm install --save-exact react@19.0.0 tiny-editor@1.2.3');
});

test('fixLine: a @docusaurus name goes through a bump, first, and every other name keeps its install line', () => {
  const row = (name, range = '^3.10.2') => ({ name, range });
  const docusaurus = [row('@docusaurus/core'), row('@docusaurus/theme-classic'), row('@docusaurus/theme-common')];
  assert.equal(fixLine(docusaurus), 'npm run shared:bump');
  assert.equal(fixLine([row('react', '^19.0.0')]), 'npm install --save-exact react@19.0.0');
  assert.equal(fixLine([...docusaurus, row('react', '^19.0.0')]), 'npm run shared:bump');
  assert.deepEqual(fixSteps([...docusaurus, row('react', '^19.0.0')]), ['npm run shared:bump', 'npm install --save-exact react@19.0.0'], 'two steps, never one chain a bump that exits 8 would cut');
  assert.equal(fixLine([row('@docusaurus/responsive-loader', '^1.7.0')]), 'npm install --save-exact @docusaurus/responsive-loader@1.7.0');
});

test('without a lock a declared package counts, and an older lock format reads', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fs.rmSync(path.join(site, 'package-lock.json'));
  const { table, pieces } = piecesOf(site, fixture.env);
  const result = checkPackages(site, table, pieces);
  assert.equal(result.locked, false);
  assert.deepEqual(result.problems.map(({ name }) => name), ['sass']);
  writeFiles(site, { 'package-lock.json': '{ "dependencies": { "react": { "version": "19.1.0" } } }' });
  assert.equal(readLock(site)('react'), '19.1.0');
});
