/**
 * __tests__/site.test.mjs: this site's own checks, run by `npm run test:site`. They read files as text and
 * need nothing installed. The last one reads a build, and skips until `build/` exists.
 *   - docusaurus.config.js names its paths by relative strings, so no machine's path reaches the main bundle;
 *   - docs/examples.mdx holds every admonition keyword and each shared piece;
 *   - every page of comparePages has its file;
 *   - a build gives each keyword its own alert class, and each piece drew.
 *
 * HOW TO CHANGE IT
 *   A new shared piece: a row in PIECES, and a line in docs/examples.mdx. A page in another folder: PAGE_FILES.
 *   A keyword Docusaurus draws under another class: KEYWORD_CLASSES.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ADMONITION_KEYWORDS } = require('../shared/wiring/index.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = 'docusaurus.config.js';
const EXAMPLE_PAGE = 'docs/examples.mdx';
const BUILT_EXAMPLE_PAGE = 'build/docs/examples/index.html';

/** The shared pieces of the example page: how a note opens each one, and what the build leaves of it. */
const PIECES = Object.freeze([
  { tag: '<Asterisk>', built: '[*]' },
  { tag: '<BibRef ', built: 'href="/docs/reference-list#1"' },
  { tag: '<DropDownIC ', built: 'role="button"' },
  { tag: '<LC ', built: 'leetcode.com/problems/two-sum' },
  { tag: '$\\R^2$', built: 'class="katex"' },
]);

/** The files a path of comparePages may come from, in order. */
const PAGE_FILES = Object.freeze([
  (page) => `src/pages${page === '/' ? '/index' : page}.js`,
  (page) => `${page.slice(1)}.md`,
  (page) => `${page.slice(1)}.mdx`,
  (page) => page.slice(1),
]);

/** The keywords Docusaurus draws under a class of another name. The rest use their own. */
const KEYWORD_CLASSES = Object.freeze({ caution: 'warning', note: 'secondary', tip: 'success' });

/** The paths of the config, each a relative string for Docusaurus to resolve. */
const RELATIVE_PATHS = Object.freeze(['./sidebars.js', './shared/css/custom.scss', './src/css/site.scss', './plugins/katex-css']);

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^\s*\/\/.*$/gm;

/** A file of this site as text. */
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/** The text without its comments. */
function withoutComments(text) {
  return text.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '');
}

/** The class a keyword's box carries. */
function alertClass(keyword) {
  return `alert--${KEYWORD_CLASSES[keyword] ?? keyword}`;
}

test('the config names its paths by relative strings', () => {
  const code = withoutComments(read(CONFIG_FILE));
  assert.equal(code.includes('require.resolve'), false);
  assert.deepEqual(RELATIVE_PATHS.filter((file) => !code.includes(`'${file}'`)), []);
});

test('the example page holds every admonition keyword and each shared piece', () => {
  const page = read(EXAMPLE_PAGE);
  const missing = ADMONITION_KEYWORDS.filter((keyword) => !page.includes(`\n:::${keyword}\n`));
  assert.deepEqual(missing, []);
  assert.deepEqual(PIECES.filter(({ tag }) => !page.includes(tag)), []);
});

test('every page of comparePages has its file', () => {
  const { comparePages } = JSON.parse(read('package.json'));
  assert.ok(comparePages.length > 0);
  const lost = comparePages.filter((page) => !PAGE_FILES.some((file) => fs.existsSync(path.join(ROOT, file(page)))));
  assert.deepEqual(lost, []);
});

test('a build gives each keyword its own alert class, and each piece drew', {
  skip: fs.existsSync(path.join(ROOT, BUILT_EXAMPLE_PAGE)) ? false : 'no build yet',
}, () => {
  const page = read(BUILT_EXAMPLE_PAGE);
  assert.deepEqual(ADMONITION_KEYWORDS.filter((keyword) => !page.includes(alertClass(keyword))), []);
  assert.deepEqual(PIECES.filter(({ built }) => !page.includes(built)), []);
  assert.equal(page.includes('ITEM NOT FOUND'), false);
});
