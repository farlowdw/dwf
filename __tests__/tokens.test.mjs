/**
 * tokens.test.mjs: names that must agree across files, where a slip builds without a word and only
 * shows on a page.
 *   - The admonition keywords of wiring/index.cjs against theme/Admonition/Types.js: every keyword
 *     has a component. A keyword without one renders as a plain info box. Each custom kind then has
 *     its Type file, an import, a line in the export, its own .alert-- class, and an .alert-- rule
 *     in css/custom.scss with a dark twin.
 *   - The magic comments of wiring/index.cjs against $code-line-kinds in css/_code-blocks.scss.
 *   - Every url() in a stylesheet exists in static/, letter for letter, as a build on Linux reads it.
 *     data: addresses are skipped.
 *   - Every --color-gray-* token in use is defined.
 *
 * HOW TO CHANGE IT
 *   A new admonition, magic comment or colour needs no change here: this test says what is missing.
 *   STOCK_KINDS is what Types.js takes from Docusaurus's own list; the test on the installed package
 *   fails if an upgrade drops one, and a site's upgrade is where that shows. CUSTOM_RULES_FILE and
 *   CODE_LINES_FILE say where the rules live.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import {
  exactExists, hostSite, maskSource, readShared, sharedFiles, stripComments, unquote,
} from './sharedTree.mjs';

const require = createRequire(import.meta.url);
const { ADMONITION_KEYWORDS, MAGIC_COMMENTS } = require('../wiring/index.cjs');
const { ENTRIES } = require('../requirements.cjs');

const TYPES_FILE = 'theme/Admonition/Types.js';
const TYPE_FOLDER = 'theme/Admonition/Type';
const CUSTOM_RULES_FILE = 'css/custom.scss';
const CODE_LINES_FILE = 'css/_code-blocks.scss';
const STATIC_FOLDER = 'static';

/** The Docusaurus file that holds the stock list, from a site's root. */
const INSTALLED_TYPES = 'node_modules/@docusaurus/theme-classic/lib/theme/Admonition/Types.js';

/** The kinds Types.js takes from Docusaurus through ...DefaultAdmonitionTypes. */
const STOCK_KINDS = ['note', 'tip', 'info', 'warning', 'danger'];

const STYLE_FILE = /\.(?:scss|css)$/;
const TOKEN_FILE = /\.(?:scss|css|js|jsx)$/;

/** The folders that hold what a site ships, so template/, scripts/ and tests stay out. */
const SHIPPED_FOLDERS = /^(?:components|css|theme)\//;
const TEST_FOLDER = /(?:^|\/)__tests__\//;

/** One line of Types.js, over masked code: `dwf: AdmonitionTypeDWF,` or `caution: (props) => …`. */
const TYPE_LINE = /^\s*(\w+):\s*(AdmonitionType\w+|\(props\))/gm;
const TYPE_IMPORT = /import\s+(AdmonitionType\w+)\s+from\s+"(\d+)"/g;
const LOCAL_TYPE = /^\.\/Type\/(\w+)$/;

const CODE_KINDS_MAP = /\$code-line-kinds:\s*\(([\s\S]*?)\n\);/;
const CODE_KIND_CLASS = /class:\s*'([^']+)'/g;

/** A url(), quoted either way or not at all. */
const URL_CALL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"\s]+))\s*\)/g;
const DATA_ADDRESS = /^data:/;

const GRAY_TOKEN = /(?<![\w-])--color-gray-[\w-]+/g;
const GRAY_DEFINITION = /(?<![\w-])(--color-gray-[\w-]+)\s*:/g;

/** Types.js as { kinds: { keyword: { legacy, file } }, files }: what it lists and where each comes from. */
function readTypes(text) {
  const { code, literals } = maskSource(text);
  const fromImport = new Map();
  for (const [, name, number] of code.matchAll(TYPE_IMPORT)) {
    fromImport.set(name, unquote(literals[Number(number)]));
  }
  const kinds = {};
  for (const [, keyword, value] of code.matchAll(TYPE_LINE)) {
    const local = LOCAL_TYPE.exec(fromImport.get(value) ?? '');
    kinds[keyword] = { legacy: value === '(props)', file: local && `${local[1]}.js` };
  }
  return kinds;
}

/** The keywords with no component, stock or listed in Types.js. */
function keywordsWithoutComponent(keywords, kinds) {
  return keywords.filter((keyword) => !STOCK_KINDS.includes(keyword) && !kinds[keyword]);
}

/** The keywords a Type file of ours draws. */
function customKeywords(kinds) {
  return Object.keys(kinds).filter((keyword) => kinds[keyword].file);
}

/** Types.js's text without the line that names `keyword`. */
function withoutLine(text, keyword) {
  return text.split('\n').filter((line) => !new RegExp(`^\\s*${keyword}:`).test(line)).join('\n');
}

/** What is missing for a custom kind in the stylesheet. */
function alertProblems(keyword, css) {
  const rule = new RegExp(`^\\s*\\.alert--${keyword}\\b`, 'm');
  const twin = new RegExp(`html\\[data-theme=['"]?dark['"]?\\]\\s+\\.alert--${keyword}\\b`);
  const problems = [];
  if (!rule.test(css)) problems.push(`.alert--${keyword} has no rule`);
  if (!twin.test(css)) problems.push(`.alert--${keyword} has no dark twin`);
  return problems;
}

/** A stylesheet without its comments. */
function styleText(file) {
  return stripComments(readShared(file), { regexLiterals: false });
}

/** The class of each kind in the $code-line-kinds map. */
function codeLineClasses(scss) {
  const map = CODE_KINDS_MAP.exec(scss);
  return map ? [...map[1].matchAll(CODE_KIND_CLASS)].map((match) => match[1]) : [];
}

/** Every address in a stylesheet's url() calls. */
function urlsIn(css) {
  return [...css.matchAll(URL_CALL)].map((match) => match[1] ?? match[2] ?? match[3]);
}

/** What is wrong with an address: it must be a path that exists in shared/static. */
function urlProblem(address, existsInStatic) {
  if (!address.startsWith('/') || address.startsWith('//')) return `${address} is not a path on the site`;
  const file = address.split(/[?#]/)[0];
  return existsInStatic(file) ? null : `${file} is not in shared/${STATIC_FOLDER}`;
}

/** The sets of --color-gray-* tokens used and defined in a text. */
function grayTokens(text) {
  const used = text.match(GRAY_TOKEN) ?? [];
  const defined = [...text.matchAll(GRAY_DEFINITION)].map((match) => match[1]);
  return { used, defined };
}

/** The stylesheets a site ships. */
function shippedStyles() {
  return sharedFiles({ skipTemplate: true }).filter((file) => SHIPPED_FOLDERS.test(file) && STYLE_FILE.test(file));
}

/** The files that may read a token. */
function tokenReaders() {
  const isReader = (file) => SHIPPED_FOLDERS.test(file) && TOKEN_FILE.test(file) && !TEST_FOLDER.test(file);
  return sharedFiles({ skipTemplate: true }).filter(isReader);
}

/** Why the stock test cannot run here, or false. */
function stockSkip() {
  const site = hostSite();
  if (site === null) return 'outside a site';
  return fs.existsSync(path.join(site, INSTALLED_TYPES)) ? false : 'no installed Docusaurus';
}

const typesText = readShared(TYPES_FILE);
const kinds = readTypes(typesText);

test('every admonition keyword has a component', () => {
  assert.deepEqual(keywordsWithoutComponent(ADMONITION_KEYWORDS, kinds), []);
});

test('a keyword goes red when its type is removed, or never had one', () => {
  for (const keyword of ['dwf', 'iio', 'caution']) {
    const broken = readTypes(withoutLine(typesText, keyword));
    assert.deepEqual(keywordsWithoutComponent(ADMONITION_KEYWORDS, broken), [keyword]);
  }
  assert.deepEqual(keywordsWithoutComponent(['note', 'made-up'], kinds), ['made-up']);
});

test('every keyword that is not stock or legacy has a Type file of its own', () => {
  const custom = customKeywords(kinds);
  const expected = ADMONITION_KEYWORDS.filter((keyword) => !STOCK_KINDS.includes(keyword) && !kinds[keyword]?.legacy);
  assert.deepEqual([...custom].sort(), [...expected].sort());
});

test('every file in theme/Admonition/Type is listed in Types.js', () => {
  const listed = customKeywords(kinds).map((keyword) => `${TYPE_FOLDER}/${kinds[keyword].file}`);
  const onDisk = sharedFiles().filter((file) => file.startsWith(`${TYPE_FOLDER}/`));
  assert.deepEqual(onDisk, [...listed].sort());
});

test('each Type file draws its own alert class', () => {
  for (const keyword of customKeywords(kinds)) {
    const text = stripComments(readShared(`${TYPE_FOLDER}/${kinds[keyword].file}`));
    assert.ok(text.includes(`alert--${keyword}`), `${kinds[keyword].file} does not use alert--${keyword}`);
  }
});

test('every custom kind has an .alert-- rule with a dark twin', () => {
  const css = styleText(CUSTOM_RULES_FILE);
  assert.deepEqual(customKeywords(kinds).flatMap((keyword) => alertProblems(keyword, css)), []);
});

test('the alert check goes red without the rule or without the twin', () => {
  assert.deepEqual(alertProblems('dwf', ".alert--dwf {\n}\n"), ['.alert--dwf has no dark twin']);
  assert.deepEqual(alertProblems('dwf', "html[data-theme='dark'] .alert--dwf {\n}\n"), ['.alert--dwf has no rule']);
  const commentedOut = stripComments("// .alert--dwf {\n// }\n", { regexLiterals: false });
  assert.equal(alertProblems('dwf', commentedOut).length, 2);
});

test('requirements.cjs looks for every custom keyword in a site\'s docs', () => {
  const pattern = new RegExp(ENTRIES.find((row) => row.name === 'Admonition').evidence.docsPattern, 'm');
  for (const keyword of customKeywords(kinds)) {
    assert.match(`:::${keyword}\n`, pattern);
  }
});

test('the installed Docusaurus still has the stock kinds', { skip: stockSkip() }, () => {
  const text = fs.readFileSync(path.join(hostSite(), INSTALLED_TYPES), 'utf8');
  for (const keyword of STOCK_KINDS) {
    assert.match(text, new RegExp(`\\b${keyword}:`), `the stock list has no ${keyword}`);
  }
});

test('each magic comment has a kind of code line, and each kind a magic comment', () => {
  const classes = codeLineClasses(styleText(CODE_LINES_FILE));
  const comments = MAGIC_COMMENTS.map((comment) => comment.className);
  assert.ok(classes.length > 0, `no kinds read from ${CODE_LINES_FILE}`);
  assert.deepEqual([...classes].sort(), [...comments].sort());
});

test('every url() in a stylesheet exists in static/', (t) => {
  const addresses = shippedStyles().flatMap((file) => urlsIn(styleText(file)));
  const paths = new Set(addresses.filter((address) => !DATA_ADDRESS.test(address)));
  const dataAddresses = new Set(addresses.filter((address) => DATA_ADDRESS.test(address)));
  const exact = exactExists();
  const exists = (file) => exact(path.posix.join(STATIC_FOLDER, file));
  const problems = [...paths].map((address) => urlProblem(address, exists)).filter(Boolean);
  assert.ok(paths.size > 0, 'no url() found');
  assert.deepEqual(problems, []);
  t.diagnostic(`${paths.size} distinct paths, ${dataAddresses.size} data: addresses skipped`);
});

test('the url() check reads every quoting, and refuses another host', () => {
  const css = "a { b: url('/x.svg'); c: url(\"/y.svg\"); d: url(/z.svg?v=1); e: url(https://cdn.example/f.css); }";
  assert.deepEqual(urlsIn(css), ['/x.svg', '/y.svg', '/z.svg?v=1', 'https://cdn.example/f.css']);
  assert.match(urlProblem('https://cdn.example/f.css', () => true), /not a path/);
  assert.match(urlProblem('/gone.svg', () => false), /not in shared/);
  assert.equal(urlProblem('/z.svg?v=1', (file) => file === '/z.svg'), null);
});

test('every --color-gray-* token in use is defined', (t) => {
  const texts = tokenReaders().map((file) => stripComments(readShared(file), { regexLiterals: false }));
  const { used, defined } = grayTokens(texts.join('\n'));
  const known = new Set(defined);
  assert.ok(known.size > 0, 'no --color-gray-* definitions found');
  assert.deepEqual([...new Set(used)].filter((token) => !known.has(token)), []);
  t.diagnostic(`${known.size} tokens defined`);
});

test('the gray check tells a definition from a use, and leaves Infima\'s names alone', () => {
  const { used, defined } = grayTokens('--color-gray-4: #fff; a { color: var(--color-gray-9); b: var(--ifm-color-gray-100); }');
  assert.deepEqual(defined, ['--color-gray-4']);
  assert.deepEqual(used, ['--color-gray-4', '--color-gray-9']);
});
