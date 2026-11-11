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

test('tableProblems names a needsConfig that is no list of { text, what }', () => {
  const row = (name, needsConfig) => ({ name, kind: 'plugin', configText: 'x', needsConfig });
  const table = {
    RANGES: {},
    ENTRIES: [
      row('Sound', [{ text: 'plugin(', what: 'the plugin' }]),
      row('Empty', []),
      row('Words', 'plugin('),
      row('NoWhat', [{ text: 'plugin(' }]),
      row('NoText', [{ text: '', what: 'the plugin' }]),
    ],
  };
  assert.deepEqual(tableProblems(table), ['Words', 'NoWhat', 'NoText'].map((name) => `${name}: needsConfig is a list of { text, what }`));
});

/** A table whose stubbed piece and whose plugin each need a line in the config, and an unused piece that needs one too. */
const NEEDS_TABLE = {
  RANGES: {},
  ENTRIES: [
    {
      name: 'Widget', kind: 'component', stub: 'src/components/Widget/index.jsx',
      needsConfig: [{ text: 'widgetPlugin(', what: 'the widget plugin' }, { text: "'widget-loader'", what: 'the loader' }],
    },
    { name: 'Styles', kind: 'plugin', configText: 'shared/css/custom.scss', needsConfig: [{ text: 'sheetPlugin(', what: 'the sheet plugin' }] },
    { name: 'Editor', kind: 'component', stub: 'src/components/Editor/index.jsx', needsConfig: [{ text: 'editorPlugin(', what: 'the editor plugin' }] },
  ],
};

/** The texts each piece of NEEDS_TABLE lacks in the site's config, by the piece's name. */
function lackedBy(site, env) {
  const pieces = readPieces(openSite(site, env), NEEDS_TABLE);
  return Object.fromEntries(pieces.map(({ row, missingConfig }) => [row.name, missingConfig.map(({ text }) => text)]));
}

test('a piece in use lacks each config line its row needs until the config holds it, and an unused piece lacks none', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const config = fs.readFileSync(path.join(site, 'docusaurus.config.js'), 'utf8');
  assert.deepEqual(lackedBy(site, fixture.env), { Widget: ['widgetPlugin(', "'widget-loader'"], Styles: ['sheetPlugin('], Editor: [] });
  writeFiles(site, { 'docusaurus.config.js': `${config}module.exports.plugins = ['widget-loader', widgetPlugin(), sheetPlugin({ a: 1 })];\n` });
  assert.deepEqual(lackedBy(site, fixture.env), { Widget: [], Styles: [], Editor: [] });
});

test('a config line that is commented out, or only named in a comment, is missing', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const config = fs.readFileSync(path.join(site, 'docusaurus.config.js'), 'utf8');
  const commented = [
    '/* The plugins: widgetPlugin() serves the widget. */',
    "const globs = ['docs/**/*.md', 'src/**/*.js'];",
    'module.exports.plugins = [',
    "  // 'widget-loader',",
    '  //   widgetPlugin({ a: 1 }),',
    '  sheetPlugin(),',
    '];',
    '',
  ].join('\n');
  writeFiles(site, { 'docusaurus.config.js': `${config}${commented}` });
  assert.deepEqual(lackedBy(site, fixture.env), { Widget: ['widgetPlugin(', "'widget-loader'"], Styles: [], Editor: [] });
});

test('a local copy where a stub belongs, and a missing stub of a piece in use, are asked for no config line', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const stub = 'src/components/Widget/index.jsx';
  const table = { RANGES: {}, ENTRIES: [{
    name: 'Widget', kind: 'component', stub, evidence: { docsPattern: "['\"]@site/src/components/Widget['\"/]" },
    needsConfig: [{ text: 'widgetPlugin(', what: 'the widget plugin' }],
  }] };
  const widget = () => readPieces(openSite(site, fixture.env), table)[0];
  assert.equal(widget().missingConfig.length, 1, 'the stub points at shared/, so the line is asked for');
  writeFiles(site, { [stub]: 'export default function Widget() {\n  return null;\n}\n' });
  assert.deepEqual([widget().used, widget().stub.target, widget().missingConfig], [true, null, []]);
  fs.rmSync(path.join(site, stub));
  assert.deepEqual([widget().missingStub, widget().missingConfig], [true, []]);
});

/** A table whose piece no page imports: another component does. */
const SOURCE_TABLE = {
  RANGES: {},
  ENTRIES: [{
    name: 'Viewer', kind: 'component', stub: 'src/components/Viewer/index.jsx',
    evidence: { docsPattern: "['\"]@site/src/components/Viewer['\"/]", srcPattern: "['\"]@site/src/components/Viewer['\"/]" },
  }],
};

test('a pattern over src/ is evidence for a piece that only another component imports', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const viewer = () => readPieces(openSite(site, fixture.env), SOURCE_TABLE)[0];
  assert.deepEqual([viewer().used, viewer().missingStub], [false, false]);
  fixture.commitToSite(site, { 'src/components/Reader/index.jsx': "import Viewer from '@site/src/components/Viewer';\n" }, 'Read with the viewer');
  assert.deepEqual([viewer().used, viewer().missingStub], [true, true], 'a deleted stub is an error, not "not used"');
  const docsOnly = { ...SOURCE_TABLE, ENTRIES: [{ ...SOURCE_TABLE.ENTRIES[0], evidence: { docsPattern: SOURCE_TABLE.ENTRIES[0].evidence.docsPattern } }] };
  assert.equal(readPieces(openSite(site, fixture.env), docsOnly)[0].used, false, 'docs, blog and src/pages alone do not see it');
  writeFiles(site, { 'src/components/Viewer/index.jsx': "export { default } from '@site/shared/components/Viewer';\n" });
  assert.deepEqual([viewer().used, viewer().missingStub], [true, false]);
});

test('with its stub in place a piece reads no evidence: no docs, no code', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const never = (what) => () => assert.fail(`${what} were read`);
  const opened = { ...openSite(site, fixture.env), docTexts: never('the docs'), sourceTexts: never('the sources'), clientModules: never('the client modules') };
  const table = { RANGES: {}, ENTRIES: [{
    name: 'Widget', kind: 'component', stub: 'src/components/Widget/index.jsx',
    evidence: { docsPattern: 'Widget', srcPattern: 'Widget', clientImport: 'Widget' },
  }] };
  assert.deepEqual(readPieces(opened, table).map(({ used, missingStub }) => [used, missingStub]), [[true, false]]);
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
