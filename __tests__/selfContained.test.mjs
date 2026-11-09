/**
 * selfContained.test.mjs: shared/ must work in any site, so it may lean on nothing outside itself.
 * Over every script and stylesheet, comments left out:
 *   - no @site import, no relative import that climbs out of the folder, no absolute path;
 *   - every relative import and @use names a file that is there, letter for letter: macOS finds a
 *     wrong case, and a build on Linux does not;
 *   - no @mui/x-* package (they stay with the one site that holds the licence), and no row for one
 *     in requirements.cjs either;
 *   - a bare import is a Node built-in, a package in RANGES or a name in BUILT_IN_IMPORTS, both in
 *     requirements.cjs;
 *   - every script and stylesheet opens with a header comment;
 *   - every header says how to change its file, template/ included;
 *   - package.json lists no packages and no lock sits beside it: shared/ installs nothing.
 * A script is any file webpack compiles, TypeScript included. An import is an import or export, a
 * require, a createRequire(...)(name) or its .resolve, a name that holds a createRequire(...) called the
 * same two ways, and a require.context. template/ is skipped
 * otherwise: those are a new site's files, and they import @site on purpose. So are the files under a
 * __tests__/fixtures/ folder: they are a test's input, read as text, and never run.
 *
 * HOW TO CHANGE IT
 *   A new package is a row in requirements.cjs, not a change here. A new built-in name goes in its
 *   BUILT_IN_IMPORTS. Another kind of file: SCRIPT_FILE or STYLE_FILE. Another way to import: IMPORT_FORMS,
 *   with a line in the reader's test; a way to keep a loader in a name first: REQUIRE_BINDING. A name made
 *   at run time is not read: BUILT_AT_RUN_TIME. The extensions an import may leave out: RESOLVED_EXTENSIONS
 *   and, for a stylesheet, STYLE_CANDIDATES. How much a header must say:
 *   HEADER_MIN_WORDS, and the words that count as saying how to change a file: HOW_TO_LINE. A line a
 *   tool reads above the header: PRAGMA. A test sees only that a header is there and holds such words:
 *   whether they are right is for the person who reads them.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SHARED_ROOT, exactExists, maskSource, readShared, sharedFiles, stripComments, unquote,
} from './sharedTree.mjs';

const require = createRequire(import.meta.url);
const table = require('../requirements.cjs');

const SCRIPT_FILE = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/;
const STYLE_FILE = /\.(?:scss|css)$/;

/** A test's input files, read as text and never run. */
const FIXTURE_FOLDER = /(?:^|\/)__tests__\/fixtures\//;

/** What an import without its extension may mean, in webpack's order, and a folder's index. */
const RESOLVED_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json'];

/** What `@use 'name'` may mean, as Sass looks: a partial first, then the file, then a folder's index. */
const STYLE_CANDIDATES = [
  (dir, name) => `${dir}/_${name}.scss`, (dir, name) => `${dir}/${name}.scss`, (dir, name) => `${dir}/_${name}.sass`,
  (dir, name) => `${dir}/${name}.sass`, (dir, name) => `${dir}/${name}.css`,
  (dir, name) => `${dir}/${name}/_index.scss`, (dir, name) => `${dir}/${name}/index.scss`,
];

/** Fewer words than this at the top of a file is a label, not a header. */
const HEADER_MIN_WORDS = 8;

const SHEBANG = /^#![^\n]*\n/;
const OPENING_COMMENT = /^\s*(\/\*[\s\S]*?\*\/|(?:\/\/[^\n]*\n)+)/;

/** A line a tool reads above the header, as in the template's config. The header starts below it. */
const PRAGMA = /^\/\/ @ts-(?:no)?check[^\n]*\n/;

/** Words that say how to change a file: "How to change it", "To change ...", "A new row gets ...". */
const HOW_TO_LINE = /\bhow to change\b|\bto (?:change|add|adjust) \w|\ba new [^.]{1,80}?\b(?:gets|goes|is|needs|lives)\b/i;

const SITE_PREFIX = '@site/';
const MUI_X_PREFIX = '@mui/x-';

/** The package.json fields that make npm install something. */
const INSTALL_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/** Import forms, over masked code: a string there is "<n>". */
const IMPORT_FORMS = [
  /\b(?:import|export)\b[^;"]*?\bfrom\s*"(\d+)"/g,
  /\bimport\s*"(\d+)"/g,
  /\b(?:import|require(?:\.resolve)?)\s*\(\s*"(\d+)"/g,
  /\bcreateRequire\s*\((?:[^()]|\([^()]*\))*\)\s*(?:\.resolve\s*)?\(\s*"(\d+)"/g,
  /\brequire\.context\s*\(\s*"(\d+)"/g,
];

/**
 * A name that holds a loader made by createRequire, as in `const load = createRequire(import.meta.url);`.
 * Its calls, `load("n")` and `load.resolve("n")`, are imports too. A name `require` is read by IMPORT_FORMS.
 */
const REQUIRE_BINDING = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*createRequire\s*\((?:[^()]|\([^()]*\))*\)\s*[;,\n]/g;

/** A template literal with a ${...} in it: a name made at run time, which no reading of the text can check. */
const BUILT_AT_RUN_TIME = /^`[\s\S]*\$\{/;

/** The calls of a loader kept in `name`, over masked code. */
function callsOf(name) {
  const escaped = name.replace(/\$/g, '\\$');
  return new RegExp(`(?<![\\w$.])${escaped}\\s*(?:\\.resolve\\s*)?\\(\\s*"(\\d+)"`, 'g');
}

const STYLE_IMPORT = /@(?:use|forward|import)\s+['"]([^'"]+)['"]/g;

/** Sass's own modules, as in `@use 'sass:map'`. */
const SASS_MODULE = /^sass:/;

/** Every import a script names. */
function importsOf(text) {
  const { code, literals } = maskSource(text);
  const loaders = [...code.matchAll(REQUIRE_BINDING)].map((match) => match[1]).filter((name) => name !== 'require');
  const forms = [...IMPORT_FORMS, ...loaders.map(callsOf)];
  const names = forms.flatMap((form) => [...code.matchAll(form)].map((match) => match[1]));
  return names.map((number) => literals[Number(number)]).filter((literal) => !BUILT_AT_RUN_TIME.test(literal)).map(unquote);
}

/** Every import a stylesheet names. */
function styleImportsOf(text) {
  const code = stripComments(text, { regexLiterals: false });
  return [...code.matchAll(STYLE_IMPORT)].map((match) => match[1]);
}

/** "@scope/name/deep" to "@scope/name", "name/deep" to "name". */
function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** True for a name requirements.cjs or Node accounts for. */
function isListed(specifier) {
  if (isBuiltin(specifier)) return true;
  const allowed = table.BUILT_IN_IMPORTS.some((name) =>
    (name.endsWith('/') ? specifier.startsWith(name) : specifier === name));
  return allowed || table.RANGES[packageName(specifier)] !== undefined;
}

/** True when a relative import from `file` lands outside the shared folder. */
function climbsOut(specifier, file) {
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  return target === '..' || target.startsWith('../');
}

/** What is wrong with one import of a script, or null. */
function importProblem(specifier, file) {
  if (specifier.startsWith('.')) return climbsOut(specifier, file) ? 'climbs out of shared/' : null;
  if (specifier.startsWith('/')) return 'is an absolute path';
  if (specifier.startsWith(SITE_PREFIX)) return 'reaches into the site with @site';
  if (specifier.startsWith(MUI_X_PREFIX)) return 'is an MUI X package';
  return isListed(specifier) ? null : 'is not in requirements.cjs';
}

/** What is wrong with one import of a stylesheet, or null. */
function styleImportProblem(specifier, file) {
  if (SASS_MODULE.test(specifier)) return null;
  return climbsOut(specifier, file) ? 'climbs out of shared/' : null;
}

/** The scripts this test reads: every one outside template/ and the fixture folders. */
function sharedScripts() {
  return sharedFiles({ skipTemplate: true }).filter((file) => SCRIPT_FILE.test(file) && !FIXTURE_FOLDER.test(file));
}

/** The files a relative import from `file` may mean, from the shared root. */
function scriptCandidates(specifier, file) {
  const target = path.posix.join(path.posix.dirname(file), specifier);
  return [target, ...RESOLVED_EXTENSIONS.map((extension) => `${target}${extension}`),
    ...RESOLVED_EXTENSIONS.map((extension) => `${target}/index${extension}`)];
}

/** The files a relative `@use` from `file` may mean, from the shared root. */
function styleCandidates(specifier, file) {
  const target = path.posix.join(path.posix.dirname(file), specifier);
  return STYLE_CANDIDATES.map((candidate) => candidate(path.posix.dirname(target), path.posix.basename(target)));
}

/** True when a path from the shared root is a file. */
function isFile(relative) {
  try {
    return fs.statSync(path.join(SHARED_ROOT, relative)).isFile();
  } catch {
    return false;
  }
}

/**
 * Why a relative import names no file letter for letter, or null. `candidates` lists what it may mean, and
 * `exists` reads names exactly. A file found only by another case names that file.
 */
function exactProblem(candidates, exists) {
  const files = candidates.filter(isFile);
  if (files.some(exists)) return null;
  return files.length > 0 ? `names ${files[0]} in another case, which a build on Linux cannot find` : 'names no file that is there';
}

/** "file imports 'x', which <problem>" for each bad import of a list. */
function problemsOf(file, specifiers, problemOf) {
  const lines = specifiers.map((specifier) => {
    const problem = problemOf(specifier, file);
    return problem && `${file} imports '${specifier}', which ${problem}`;
  });
  return lines.filter(Boolean);
}

/** The comment a file opens with, after any #! line and PRAGMA, or '' when it opens with code. */
function openingComment(text) {
  const opening = text.replace(SHEBANG, '').replace(PRAGMA, '').match(OPENING_COMMENT);
  return opening === null ? '' : opening[1];
}

/** True when the text opens with a comment of some substance, after any #! line. */
function hasHeader(text) {
  return openingComment(text).split(/\s+/).length >= HEADER_MIN_WORDS;
}

/** True when the comment a file opens with says how to change the file. */
function saysHowToChange(text) {
  return HOW_TO_LINE.test(openingComment(text));
}

test('the reader leaves out comments and strings that only look like imports', () => {
  const source = [
    "import real from 'react';",
    "// import commented from '@site/line';",
    "/* import blocked from '@site/block'; */",
    "const fixture = `",
    "import inTemplate from '@site/template';",
    "`;",
    "const text = \"require('@site/string')\";",
    "const pattern = /['\"]/;",
    "export { value } from 'clsx';",
    "import 'side-effect';",
    "const lazy = () => import('dynamic');",
    "const old = require('required');",
    "const address = 'https://example.com'; import after from 'kept';",
  ].join('\n');
  const found = importsOf(source).sort();
  assert.deepEqual(found, ['clsx', 'dynamic', 'kept', 'react', 'required', 'side-effect']);
});

test('the reader survives an apostrophe in JSX words', () => {
  const source = "export default () => <p>don't</p>;\nimport next from 'react';\n";
  assert.deepEqual(importsOf(source), ['react']);
});

test('names that may be imported pass', () => {
  const allowed = [
    'react', 'react-dom/server', 'clsx', '@mui/icons-material/Bolt', '@mui/material/Tooltip',
    'node:fs', 'fs', '@theme/Admonition/Layout', '@theme-original/Admonition/Types',
    '@docusaurus/Translate', '@docusaurus/theme-common', './here', '../wiring/index.cjs',
  ];
  for (const specifier of allowed) {
    assert.equal(importProblem(specifier, 'components/LC/index.jsx'), null, specifier);
  }
});

test('names that may not be imported are refused, each for its own reason', () => {
  const refused = {
    '@site/src/components/Widget': '@site',
    '@site/shared/components/LC': '@site',
    '../../../src/lib/data': 'climbs out',
    '../../..': 'climbs out',
    '/opt/thing': 'absolute',
    '@mui/x-data-grid-premium': 'MUI X',
    'left-pad': 'requirements.cjs',
    '@acme/widget/deep': 'requirements.cjs',
  };
  for (const [specifier, reason] of Object.entries(refused)) {
    assert.match(importProblem(specifier, 'components/LC/index.jsx') ?? '', new RegExp(reason), specifier);
  }
});

test('the reader finds a createRequire call, its .resolve and a require.context', () => {
  const source = [
    "const load = createRequire(import.meta.url)('made');",
    "const where = createRequire(path.join(here, 'x')).resolve('resolved');",
    "const pages = require.context('../pages', true, /\\.mdx$/);",
    "// createRequire(import.meta.url)('commented');",
  ].join('\n');
  assert.deepEqual(importsOf(source).sort(), ['../pages', 'made', 'resolved']);
});

test('the reader follows a createRequire kept in a name, to its calls and its .resolve', () => {
  const source = [
    "import { createRequire } from 'node:module';",
    'const load = createRequire(import.meta.url);',
    "const fromSite = createRequire(path.join(folder, 'package.json')), other = 1;",
    "const one = load('two-step');",
    "const where = fromSite.resolve('resolved-later');",
    "const kept = reload('not-a-loader');",
    "// load('commented');",
    "const text = \"load('in-a-string')\";",
    'const made = fromSite.resolve(`${NAME}/package.json`);',
    'const plain = load(`plain-template`);',
  ].join('\n');
  assert.deepEqual(importsOf(source).sort(), ['node:module', 'plain-template', 'resolved-later', 'two-step']);
});

test('a TypeScript file is a script, and a fixture folder is not read', () => {
  assert.ok(SCRIPT_FILE.test('components/Widget/index.tsx') && SCRIPT_FILE.test('components/Widget/types.ts'));
  assert.ok(FIXTURE_FOLDER.test('components/Widget/__tests__/fixtures/prism/typescript.ts'));
  assert.equal(FIXTURE_FOLDER.test('components/Widget/__tests__/render.test.mjs'), false);
});

test('an import in another case is found, and one in the right case passes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-case-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'LC'));
  fs.writeFileSync(path.join(root, 'LC', 'problems.js'), '');
  const exists = exactExists(root);
  assert.equal(exists('LC/problems.js'), true);
  assert.equal(exists('LC/Problems.js'), false);
  assert.equal(exists('lc/problems.js'), false);
  assert.equal(exists('../outside.js'), false);
});

test('every relative import and @use names a file that is there, letter for letter', () => {
  const exists = exactExists();
  const scripts = sharedScripts().flatMap((file) => importsOf(readShared(file))
    .filter((specifier) => specifier.startsWith('.') && !climbsOut(specifier, file))
    .map((specifier) => [file, specifier, exactProblem(scriptCandidates(specifier, file), exists)]));
  const styles = sharedFiles({ skipTemplate: true }).filter((file) => STYLE_FILE.test(file)).flatMap((file) =>
    styleImportsOf(readShared(file)).filter((specifier) => !SASS_MODULE.test(specifier) && !climbsOut(specifier, file))
      .map((specifier) => [file, specifier, exactProblem(styleCandidates(specifier, file), exists)]));
  const checked = [...scripts, ...styles];
  assert.ok(checked.length > 0, 'no relative imports found');
  const problems = checked.filter(([, , problem]) => problem !== null);
  assert.deepEqual(problems.map(([file, specifier, problem]) => `${file} imports '${specifier}', which ${problem}`), []);
});

test('every script imports only what shared/ may lean on', () => {
  const files = sharedScripts();
  const problems = files.flatMap((file) => problemsOf(file, importsOf(readShared(file)), importProblem));
  assert.ok(files.length > 0, 'no scripts found');
  assert.deepEqual(problems, []);
});

test('every stylesheet stays inside shared/', () => {
  const files = sharedFiles({ skipTemplate: true }).filter((file) => STYLE_FILE.test(file));
  const problems = files.flatMap((file) =>
    problemsOf(file, styleImportsOf(readShared(file)), styleImportProblem));
  assert.ok(files.length > 0, 'no stylesheets found');
  assert.deepEqual(problems, []);
});

test('a stylesheet that climbs out is refused', () => {
  const text = "@use 'sass:map';\n@use 'custom-dark';\n// @use '../../gone';\n@use '../../src/css/mine';\n";
  const problems = problemsOf('css/custom.scss', styleImportsOf(text), styleImportProblem);
  assert.deepEqual(problems, ["css/custom.scss imports '../../src/css/mine', which climbs out of shared/"]);
});

test('shared/ installs nothing: package.json lists no packages, and no lock sits beside it', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(SHARED_ROOT, 'package.json'), 'utf8'));
  const installed = INSTALL_FIELDS.filter((field) => manifest[field] !== undefined);
  assert.deepEqual(installed, []);
  assert.equal(fs.existsSync(path.join(SHARED_ROOT, 'package-lock.json')), false);
});

test('requirements.cjs has no row for an MUI X package', () => {
  const rows = Object.keys(table.RANGES).filter((name) => name.startsWith(MUI_X_PREFIX));
  assert.deepEqual(rows, []);
});

test('the header check tells a header from a label', () => {
  assert.equal(hasHeader('/**\n * thing.js: what it is for, and how to change it in a sentence.\n */\ncode();\n'), true);
  assert.equal(hasHeader('#!/usr/bin/env node\n// tool.mjs: what it is for, and how to change it, in a line.\ncode();\n'), true);
  assert.equal(hasHeader('code();\n/* a late comment that says plenty about what the file is for */\n'), false);
  assert.equal(hasHeader('// label\ncode();\n'), false);
});

test('every script and stylesheet opens with a header', () => {
  const isSource = (file) => (SCRIPT_FILE.test(file) || STYLE_FILE.test(file)) && !FIXTURE_FOLDER.test(file);
  const files = sharedFiles({ skipTemplate: true }).filter(isSource);
  assert.deepEqual(files.filter((file) => !hasHeader(readShared(file))), []);
});

test('the how-to check tells a header that says how to change its file from one that does not', () => {
  assert.equal(saysHowToChange('/**\n * rows.mjs: the rows.\n *\n * HOW TO CHANGE IT\n *   Edit ROWS.\n */\n'), true);
  assert.equal(saysHowToChange('// @ts-check\n/*\n * site.js: the config. To change the title: TITLE.\n */\n'), true);
  assert.equal(saysHowToChange('/**\n * rows.test.mjs: the rows. A new row gets a test here.\n */\n'), true);
  assert.equal(saysHowToChange('/**\n * rows.mjs: what the rows are for, and nothing more.\n */\ncode(); // to change it: ROWS\n'), false);
  assert.equal(saysHowToChange('code();\n'), false);
});

test('every script and stylesheet says in its header how to change it', () => {
  const isSource = (file) => (SCRIPT_FILE.test(file) || STYLE_FILE.test(file)) && !FIXTURE_FOLDER.test(file);
  const files = sharedFiles().filter(isSource);
  assert.deepEqual(files.filter((file) => !saysHowToChange(readShared(file))), []);
});
