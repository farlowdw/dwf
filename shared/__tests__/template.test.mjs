/**
 * template.test.mjs: template/ is a new site's files. The other tests here skip it on purpose, because those
 * files name site things, so this one holds it to what a new site needs. It reads text, and needs no install.
 *   - It holds exactly the files in TEMPLATE_FILES. A file the global ignore drops is missing from a fresh clone
 *     and reads red here, and a rules file named for one tool reads red as well.
 *   - Every file opens with a comment, below a page's front matter, apart from the two formats with none.
 *   - The config gives Docusaurus relative strings, never require.resolve, and uses no my-loaders. KaTeX's
 *     stylesheet comes from the shared plugin, through the wiring.
 *   - Only known tokens, each in use, and package.json carries the lines a site runs, with mermaid on one exact
 *     version (MERMAID_PACKAGE), as its description says.
 *   - The README's "Publish it" gives the two deploy steps that npm run deploy prints, and says it deploys nothing.
 *   - The stubs are the ones a join writes, and the ignore file needs no change from a join.
 * What a real site does with these files is proved by the template's own __tests__/site.test.mjs, which a run
 * of shared:new reads.
 *
 * HOW TO CHANGE IT
 *   A new starter file: a row in TEMPLATE_FILES. A new token: lib/newSiteSettings.mjs > TOKENS. Another kind of
 *   file: a row in HEADER_SHAPES. A format that cannot hold a comment: NO_COMMENT_FILES.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { planIgnore } from '../scripts/lib/joinHousekeeping.mjs';
import {
  DEPLOY_LINE, DEPLOY_STEPS_LINE, IGNORE_TEMPLATE_FILE, MUI_GUARD_LINE, SITE_LINES, VERIFY_LINE_NAME,
} from '../scripts/lib/joinSettings.mjs';
import { MANIFEST_FILE, NVMRC_FILE } from '../scripts/lib/settings.mjs';
import { stubText } from '../scripts/lib/joinStubs.mjs';
import { readStub } from '../scripts/lib/stubs.mjs';
import { ANY_TOKEN, TOKENS } from '../scripts/lib/newSiteSettings.mjs';
import { SHARED_ROOT, TEMPLATE_FOLDER, sharedFiles, stripComments } from './sharedTree.mjs';

const require = createRequire(import.meta.url);
const { RANGES } = require('../requirements.cjs');

const CONFIG_FILE = 'docusaurus.config.js';
const MUI_X_PREFIX = '@mui/x-';
const NOT_IN_A_NEW_SITE = 'my-loaders';
/** KaTeX's stylesheet and fonts: the shared plugin, through the wiring. */
const KATEX_CSS_LINE = 'katexCssPlugin()';
const SHAPE_VARIABLE = 'SKIP_HTML_MINIFICATION=true';
const TEMPLATE_README = 'README.md';
/** What the README says of the deploy script, which prints the steps and publishes nothing. */
const DEPLOY_SCRIPT_WORDS = '`npm run deploy` deploys nothing';
/** The diagrams' package: one exact version, whose katex range takes the site's KaTeX 0.16 (the description says why). */
const MERMAID_PACKAGE = 'mermaid';
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/** Every file of the template, in sorted order. */
const TEMPLATE_FILES = Object.freeze([
  '.nvmrc',
  'README.md',
  'SITE-RULES.md',
  '__tests__/site.test.mjs',
  'blog/2026-01-01-first-post.md',
  'docs/examples.mdx',
  'docs/intro.md',
  'docs/reference-list.mdx',
  'docusaurus.config.js',
  'gitignore.template',
  'netlify.toml',
  'package.json',
  'sidebars.js',
  'src/components/Asterisk/index.jsx',
  'src/components/BibRef/bibliography.js',
  'src/components/BibRef/index.jsx',
  'src/components/DropDownIC/index.jsx',
  'src/components/LC/index.jsx',
  'src/css/site.scss',
  'src/pages/index.js',
  'src/pages/index.module.scss',
  'src/theme/Admonition/Types.js',
  'src/theme/DocRoot/Layout/Sidebar/index.jsx',
  'static/img/logo.svg',
]);

/** Stubs that are plain re-exports: the text a join writes. */
const PLAIN_STUBS = Object.freeze([
  'src/components/Asterisk/index.jsx',
  'src/components/DropDownIC/index.jsx',
  'src/components/LC/index.jsx',
  'src/theme/Admonition/Types.js',
  'src/theme/DocRoot/Layout/Sidebar/index.jsx',
]);

/** JSON and a one-word version file have no comments. package.json's description does that work. */
const NO_COMMENT_FILES = new Set([MANIFEST_FILE, NVMRC_FILE]);

const FRONT_MATTER = /^---\n[\s\S]*?\n---\n\s*/;

/** How a file of each kind opens, once any front matter is gone. */
const HEADER_SHAPES = Object.freeze([
  { file: /\.mdx?$/, opens: /^(?:\{\/\*|<!--)/ },
  { file: /\.(?:js|jsx|mjs|scss)$/, opens: /^(?:\/\/|\/\*)/ },
  { file: /\.svg$/, opens: /^<!--/ },
  { file: /\.(?:toml|template)$/, opens: /^# / },
]);

/** The template's files, as paths from its folder. */
function templateFiles() {
  const start = `${TEMPLATE_FOLDER}/`;
  return sharedFiles().filter((file) => file.startsWith(start)).map((file) => file.slice(start.length));
}

/** A template file's text. */
function read(file) {
  return fs.readFileSync(path.join(SHARED_ROOT, TEMPLATE_FOLDER, file), 'utf8');
}

/** The template's package.json. */
function manifest() {
  return JSON.parse(read(MANIFEST_FILE));
}

/** True when a file opens as its kind should. */
function hasHeader(file) {
  const shape = HEADER_SHAPES.find(({ file: kind }) => kind.test(file));
  assert.ok(shape, `no row in HEADER_SHAPES for ${file}`);
  return shape.opens.test(read(file).replace(FRONT_MATTER, ''));
}

test('the template holds exactly its files', () => {
  assert.deepEqual(templateFiles().sort(), [...TEMPLATE_FILES].sort());
});

test('every file of the template opens with a comment', () => {
  const judged = TEMPLATE_FILES.filter((file) => !NO_COMMENT_FILES.has(file));
  assert.deepEqual(judged.filter((file) => !hasHeader(file)), []);
});

test('the config gives Docusaurus relative strings', () => {
  const code = stripComments(read(CONFIG_FILE));
  assert.equal(code.includes('require.resolve'), false);
  for (const name of ['./sidebars.js', './shared/css/custom.scss', './src/css/site.scss']) {
    assert.ok(code.includes(`'${name}'`), `${CONFIG_FILE} lacks '${name}'`);
  }
  assert.ok(code.includes(KATEX_CSS_LINE), `${CONFIG_FILE} lacks ${KATEX_CSS_LINE}, KaTeX's stylesheet from shared/`);
});

test('the template does not lean on the old loaders plugin', () => {
  assert.deepEqual(TEMPLATE_FILES.filter((file) => read(file).includes(NOT_IN_A_NEW_SITE)), []);
});

test('only known tokens are used, and each is in use', () => {
  const used = new Set(TEMPLATE_FILES.flatMap((file) => read(file).match(ANY_TOKEN) ?? []));
  assert.deepEqual([...used].sort(), Object.values(TOKENS).sort());
});

test('a new site gets every shared line, the deploy line and the shape of a build', () => {
  const { scripts } = manifest();
  for (const [name, line] of Object.entries(SITE_LINES)) assert.equal(scripts[name], line, name);
  assert.equal(scripts.deploy, DEPLOY_LINE);
  assert.ok(scripts.build.startsWith(SHAPE_VARIABLE), 'the build sets the shape itself');
});

test('the README gives the two deploy steps that npm run deploy prints, and says it deploys nothing', () => {
  const readme = read(TEMPLATE_README);
  assert.ok(readme.includes(`\n${DEPLOY_STEPS_LINE}\n`), `${TEMPLATE_README} lacks the line ${DEPLOY_STEPS_LINE}`);
  assert.ok(readme.includes(DEPLOY_SCRIPT_WORDS), `${TEMPLATE_README} lacks "${DEPLOY_SCRIPT_WORDS}"`);
});

test('shared:verify and comparePages start with sensible lines', () => {
  const { scripts, comparePages } = manifest();
  assert.ok(scripts[VERIFY_LINE_NAME].includes('test:shared'));
  assert.ok(scripts[VERIFY_LINE_NAME].includes('test:site'));
  assert.ok(scripts['test:site'].startsWith(`${MUI_GUARD_LINE} && `), 'a new site runs the old-MUI check first');
  assert.ok(scripts['test:site'].includes('--test-reporter=spec'), 'one report shape on any Node, in a terminal or a log');
  assert.ok(comparePages.includes('/'));
  assert.ok(comparePages.includes('/docs/examples'));
});

test('a package with a row in requirements.cjs has that range, and no MUI X package is in', () => {
  const { dependencies, devDependencies } = manifest();
  const packages = { ...dependencies, ...devDependencies };
  const pinned = (name) => name.startsWith('@docusaurus/');
  const drift = Object.entries(packages).filter(([name, spec]) => RANGES[name] && !pinned(name) && RANGES[name] !== spec);
  assert.deepEqual(drift, []);
  assert.deepEqual(Object.keys(packages).filter((name) => name.startsWith(MUI_X_PREFIX)), []);
});

test('mermaid is one exact version, and the description names it and says why', () => {
  const { dependencies, description } = manifest();
  const version = dependencies[MERMAID_PACKAGE] ?? '';
  assert.match(version, EXACT_VERSION, 'a range would let a new site take a mermaid that nests KaTeX 0.18');
  assert.ok(description.includes(`on one exact version, ${version},`), 'the description names the version held');
});

test('the README calls a stub one line only when it is, and names the one that hands in data', () => {
  const row = read(TEMPLATE_README).split('\n').find((line) => line.startsWith('| `src/components/` |'));
  assert.ok(row, 'the README has no src/components row');
  const stubs = templateFiles().filter((file) => /^src\/components\/\w+\/index\.jsx$/.test(file));
  const wrappers = stubs.filter((file) => !readStub(path.join(SHARED_ROOT, TEMPLATE_FOLDER), file).plain);
  assert.ok(wrappers.length > 0, 'no stub hands in data: is the row still right?');
  for (const file of wrappers) {
    const name = file.split('/')[2];
    assert.ok(row.includes(`${name}, whose stub hands in`), `the row calls ${file} a one-line stub: ${row}`);
  }
});

test('each plain stub is the one a join writes', () => {
  for (const file of PLAIN_STUBS) assert.equal(read(file), stubText(file), file);
});

test('the ignore file needs no change from a join', () => {
  const starter = read(IGNORE_TEMPLATE_FILE);
  assert.deepEqual(planIgnore(starter, { keepNetlifyOut: false, starter }), { text: starter, changes: [] });
});
