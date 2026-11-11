/**
 * siteWiring.test.mjs: a site that has shared/ mounted is wired the way the folder expects. It reads
 * the HOST site's files as text, so it needs nothing built. In the hub there is no host: the checks
 * on a real site skip, and the same rules run on small fixture sites written to a temporary folder,
 * one good and one broken for each thing that can go wrong.
 *
 * A site is wired in steps: subtree add first, then its config, then its stylesheets. A rule runs
 * once the site has reached its step (the rule's `step`, from STEPS) and skips, saying so, before that.
 * So a site with shared/ only mounted skips them all, and one on the shared wiring with its own
 * stylesheets still skips customCss and the check for old stylesheets, fonts and icons. The step of the
 * stylesheets is reached once the config names shared/css/custom.scss or src/css/site.scss exists: a
 * config that loses the shared line then fails here, rather than turning the rule off.
 *
 * THE RULES
 *   customCss          shared/css/custom.scss first, src/css/site.scss second, anything else after
 *   staticDirectories  'static' and 'shared/static' both, once the shared stylesheet loads (its url()s
 *                      read shared/static); a config without the key serves 'static', as Docusaurus does
 *   keywords           every docs, blog and pages block takes the shared keywords; no list of the
 *                      site's own; a keyword the site adds has its component in the Types stub
 *   stubs              a piece in use has its stub, each stub points at its piece, DropDownIC's is
 *                      a plain re-export (its MDX plugin writes <DropDownIC.Title>), and so is
 *                      unsavedWork's (a copy or a wrapper hands a site's reloader an empty
 *                      registry, so a tab reloads over typed text, with no error). A piece in use
 *                      also has every line its row's needsConfig asks of the config, read with the
 *                      comments left out: without codeRunnerPlugin() the site builds and the editor
 *                      never loads its Monaco
 *   no leftover copies a file shared/ now holds is gone from where the site used to keep it: a
 *                      stylesheet, a font, a theme or component file, a library under src/lib, a
 *                      plugin under plugins/. One in static/ that a doc imports by path is named
 *                      too: it hides shared's copy, since 'static' comes first in staticDirectories,
 *                      so the doc imports shared's instead. A site's own README.md at the top of
 *                      such a folder is no copy: it is about the site's files
 *   bibItems           BibRef's stub passes the site's bibliography, or every citation says
 *                      ITEM NOT FOUND while the build exits 0
 *   Admonition stub    needed whenever the config uses admonitionsConfig, or custom boxes render
 *                      as info boxes
 *   DropDownIC plugins with DropDownIC's stub, every docs, blog and pages block runs remarkDropDownIc
 *                      and rehypeDropDownIc, and a preprocessor runs preprocessDropDownIc; without
 *                      them the build passes and a page with a dropdown throws React error #418. A
 *                      docs, blog or pages plugin of the site's own, in `plugins:`, runs both too,
 *                      unless no tracked Markdown file of its folder holds a dropdown
 *
 * The wiring's own row in requirements.cjs is held to its code here too: it runs the suite of every
 * component whose code wiring/index.cjs hands each page, and asks for no package that code leaves out.
 *   minification       SKIP_HTML_MINIFICATION=true in .env or netlify.toml
 *
 * .env is not in git, so a fresh clone or a working copy has none and cannot answer the last rule.
 * That checkout passes with a note, never a skip, and a .env that lacks the line fails. A value is
 * never printed.
 *
 * HOW TO CHANGE IT
 *   A new piece is a row in requirements.cjs and is picked up from there, with the config lines it
 *   needs. A file moved into shared/ needs nothing here when its old home is in COPY_HOMES; another
 *   old name goes in OLD_PATHS. A new rule: a function returning sentences, a row in RULES with its
 *   step, a broken fixture in BREAKS. A new step: a row in STEPS. valueAt is a small reader of a config
 *   value, not a parser.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { trackedFiles } from '../scripts/lib/checkout.mjs';
import { openSite, readPieces } from '../scripts/lib/requirements.mjs';
import { readStub } from '../scripts/lib/stubs.mjs';
import { SHARED_ROOT, hostSite, sharedFiles, stripComments } from './sharedTree.mjs';

const require = createRequire(import.meta.url);
const table = require('../requirements.cjs');

const CONFIG_FILE = 'docusaurus.config.js';
const WIRING_FILE = 'shared/wiring/index.cjs';
const SHARED_STYLESHEET = 'shared/css/custom.scss';
const SITE_STYLESHEET = 'src/css/site.scss';
const STATIC_DIRECTORIES = ['static', 'shared/static'];
/** What Docusaurus serves when the config has no staticDirectories key. */
const DEFAULT_STATIC_DIRECTORIES = ['static'];
const ADMONITION_STUB = 'src/theme/Admonition/Types.js';
const ADMONITION_TARGET = 'shared/theme/Admonition/Types';
const BIBREF_STUB = 'src/components/BibRef/index.jsx';
const BIBLIOGRAPHY = 'src/components/BibRef/bibliography.js';
const UNSAVED_WORK_STUB = 'src/components/CodeEditor/unsavedWork.js';
const EDITOR_STUB = 'src/components/CodeEditor/index.jsx';
const DROPDOWN_STUB = 'src/components/DropDownIC/index.jsx';
/** The folder a site mounts the hub at, as a path's start. */
const PREFIX_FOLDER = 'shared/';

/** The plugin lists a block with DropDownIC's stub runs, and the plugin each must hold. */
const DROPDOWN_PLUGINS = [['remarkPlugins', 'remarkDropDownIc'], ['rehypePlugins', 'rehypeDropDownIc']];
const DROPDOWN_PREPROCESSOR = 'preprocessDropDownIc';

/**
 * A content plugin of the site's own, as `['@docusaurus/plugin-content-docs', { ... }]` in `plugins:`:
 * group 1 is its kind. Its folder, when the options name none, is Docusaurus's own default.
 */
const CONTENT_PLUGIN = /['"]@docusaurus\/plugin-content-(docs|blog|pages)['"]\s*\)?\s*,/g;
const DEFAULT_CONTENT_FOLDERS = { docs: 'docs', blog: 'blog', pages: 'src/pages' };

/** The files of a content folder that MDX reads, and what marks a dropdown in one. */
const MARKDOWN_FILE = /\.mdx?$/;
const DROPDOWN_TAG = '<DropDownIC';

/** Pieces whose stub may not grow into a wrapper. */
const PLAIN_ONLY = ['DropDownIC', 'unsavedWork'];

/**
 * Where a site kept each shared folder's files. `step`: the step of STEPS that makes a copy
 * there a leftover. `importable`: a doc may import a file there by path, so a copy a doc imports
 * gets the import to change as well. It still goes: served at the same address as shared's file,
 * it wins over it in the shared stylesheet's url(), and which of the two the address serves is not fixed.
 */
const COPY_HOMES = [
  { shared: 'css/', site: 'src/css/', step: 'stylesheets' },
  { shared: 'static/', site: 'static/', step: 'stylesheets', importable: true },
  { shared: 'theme/', site: 'src/theme/', step: 'wiring' },
  { shared: 'components/', site: 'src/components/', step: 'wiring' },
  { shared: 'lib/', site: 'src/lib/', step: 'wiring' },
  { shared: 'plugins/', site: 'plugins/', step: 'wiring' },
];

/** A shared folder's own notes, at its top. A site's file of that name is about the site's files: no copy. */
const HOME_NOTES = 'README.md';

/** Old copies with no file of the same name in shared/. */
const OLD_PATHS = [
  'katex-macros.js',
  'src/theme/Admonition/Type/Caution.js',
  'src/theme/Admonition/Type/Danger.js',
  'src/theme/Admonition/Type/Info.js',
  'src/theme/Admonition/Type/Note.js',
  'src/theme/Admonition/Type/Tip.js',
  'src/theme/Admonition/Type/Warning.js',
];

const SKIP_NAME = 'SKIP_HTML_MINIFICATION';
const ENV_FILE = '.env';
const NETLIFY_FILE = 'netlify.toml';
const SKIP_LINE = new RegExp(`^\\s*(?:export\\s+)?${SKIP_NAME}\\s*=\\s*["']?true["']?\\s*$`, 'm');

/** The preset's content blocks, between `presets:` and `themeConfig`. A false block has no brace. */
const CONTENT_BLOCK = /\b(?:docs|blog|pages)\s*:\s*\{/g;
const SHARED_KEYWORDS = /\.\.\.(?:admonitionsConfig|ADMONITION_KEYWORDS)\b/g;
const KEYWORD_LIST = /\bkeywords\s*:\s*\[([^\]]*)\]/g;
const QUOTED = /['"]([^'"]+)['"]/g;

/** The strings of the list after `key:`, without a leading ./, or null when it is not a list. */
function listAfter(config, key) {
  const list = config.match(new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`));
  if (!list) return null;
  return [...list[1].matchAll(QUOTED)].map((match) => match[1].replace(/^\.\//, ''));
}

/** The site as its rules read it. */
function readSite(root, env = process.env) {
  const read = (file) => {
    try {
      return fs.readFileSync(path.join(root, file), 'utf8');
    } catch {
      return null;
    }
  };
  const exists = (file) => fs.existsSync(path.join(root, file));
  const config = stripComments(read(CONFIG_FILE) ?? '');
  return { read, exists, config, opened: openSite(root, env), root, env };
}

function customCssRule({ config }) {
  const list = listAfter(config, 'customCss');
  if (list === null) return ['customCss is not a list'];
  const problems = [];
  if (list[0] !== SHARED_STYLESHEET) problems.push(`customCss must start with ${SHARED_STYLESHEET}`);
  if (list[1] !== SITE_STYLESHEET) problems.push(`customCss must go on with ${SITE_STYLESHEET}`);
  return problems;
}

function staticDirectoriesRule({ config }) {
  const list = listAfter(config, 'staticDirectories') ?? DEFAULT_STATIC_DIRECTORIES;
  const missing = STATIC_DIRECTORIES.filter((folder) => !list.includes(folder));
  return missing.map((folder) => `staticDirectories lacks '${folder}'`);
}

/** What ends the preset's text: the theme's settings, or the site's own plugins when they come first. */
const AFTER_PRESET = /\bthemeConfig\b|\bplugins\s*:/g;

/** The text of the preset, where the content blocks sit. */
function presetText(config) {
  const start = config.indexOf('presets:');
  if (start === -1) return '';
  AFTER_PRESET.lastIndex = start;
  const end = AFTER_PRESET.exec(config)?.index;
  return config.slice(start, end);
}

/** Blocks of the preset that do not take the shared keywords. */
function blockProblems(config) {
  const preset = presetText(config);
  const blocks = preset.match(CONTENT_BLOCK)?.length ?? 0;
  const spreads = preset.match(SHARED_KEYWORDS)?.length ?? 0;
  if (spreads === 0 || spreads >= blocks) return [];
  return [`only ${spreads} of ${blocks} docs, blog and pages blocks take the shared keywords`];
}

/** Lists of the site's own, and added keywords with no component in the stub. */
function keywordListProblems({ config, read }) {
  const stub = read(ADMONITION_STUB) ?? '';
  const problems = [];
  for (const [, list] of config.matchAll(KEYWORD_LIST)) {
    if (!list.includes('...ADMONITION_KEYWORDS')) problems.push('a keywords list of its own: spread ADMONITION_KEYWORDS');
    const added = [...list.matchAll(QUOTED)].map((match) => match[1]);
    const missing = added.filter((keyword) => !new RegExp(`\\b${keyword}\\s*:`).test(stub));
    problems.push(...missing.map((keyword) => `the keyword '${keyword}' has no component in ${ADMONITION_STUB}`));
  }
  return problems;
}

function keywordsRule(site) {
  return [...blockProblems(site.config), ...keywordListProblems(site)];
}

/** "shared/components/LC" for src/components/LC/index.jsx. */
function expectedTarget(stubPath) {
  return stubPath.replace(/^src\//, 'shared/').replace(/\/index\.jsx?$/, '').replace(/\.jsx?$/, '');
}

/** What is wrong with one stub file that exists. */
function stubProblems({ row, stub }) {
  if (stub.target === null) return [`${row.stub} is a local copy of ${row.name}, not a stub`];
  const wanted = expectedTarget(row.stub);
  const target = stub.target.replace(/\/index\.jsx?$/, '').replace(/\.jsx?$/, '');
  const problems = target.endsWith(wanted) ? [] : [`${row.stub} points at ${stub.target}, not ${wanted}`];
  if (PLAIN_ONLY.includes(row.name) && !stub.plain) problems.push(`${row.stub} must be a plain re-export`);
  return problems;
}

/** A sentence for each line a piece in use needs in the config and the config, its comments aside, lacks. */
function configLineProblems({ row, missingConfig }) {
  return missingConfig.map(({ text, what }) => `${CONFIG_FILE} lacks ${text}: ${row.name} is in use and needs ${what}`);
}

function stubsRule({ opened }) {
  const all = readPieces(opened, table);
  const pieces = all.filter(({ row }) => row.stub);
  const missing = pieces.filter(({ missingStub }) => missingStub);
  const present = pieces.filter(({ stub }) => stub.exists);
  return [
    ...missing.map(({ row }) => `${row.stub} is missing: ${row.name} is in use`),
    ...present.flatMap(stubProblems),
    ...all.flatMap(configLineProblems),
  ];
}

/** True when a doc of the site imports this file by its path. */
function importedByPath({ opened }, file) {
  return opened.docTexts().some(({ text }) => text.includes(`@site/${file}`));
}

/**
 * The old copies still in one home of COPY_HOMES. `shared` lists what shared/ holds, from its root: the real
 * folder's files, or a test's.
 */
function copiesIn(site, home, shared = sharedFiles({ skipTemplate: true })) {
  const files = shared.filter((file) => file.startsWith(home.shared) && file !== `${home.shared}${HOME_NOTES}`);
  const stubs = new Set(table.ENTRIES.map((row) => row.stub));
  const copies = files.map((file) => `${home.site}${file.slice(home.shared.length)}`);
  return copies.filter((file) => !stubs.has(file) && site.exists(file)).map((file) => ({ file, home }));
}

/** The sentence for one leftover. A copy a doc imports names the import that keeps it. */
function leftoverSentence(site, { file, home }) {
  const sentence = `${file} is a leftover copy: shared/ holds it now`;
  if (!home?.importable || !importedByPath(site, file)) return sentence;
  const shared = `${PREFIX_FOLDER}${home.shared}${file.slice(home.site.length)}`;
  return `${sentence}, and it hides ${shared}: a doc imports @site/${file}, so import @site/${shared} there and delete the copy`;
}

function leftoversRule(site) {
  const homes = COPY_HOMES.filter(({ step }) => STEPS[step].reached(site));
  const left = [...homes.flatMap((home) => copiesIn(site, home)), ...OLD_PATHS.filter(site.exists).map((file) => ({ file }))];
  return left.map((leftover) => leftoverSentence(site, leftover));
}

function bibItemsRule({ read, exists }) {
  const stub = read(BIBREF_STUB);
  if (stub === null) return [];
  const problems = [];
  if (!stripComments(stub).includes('bibItems={')) problems.push(`${BIBREF_STUB} does not pass bibItems`);
  if (!exists(BIBLIOGRAPHY)) problems.push(`${BIBLIOGRAPHY} is missing`);
  return problems;
}

function admonitionStubRule({ config, read }) {
  if (!/\badmonitionsConfig\b/.test(config)) return [];
  const stub = read(ADMONITION_STUB);
  if (stub === null) return [`${ADMONITION_STUB} is missing: the config uses admonitionsConfig`];
  return stub.includes(ADMONITION_TARGET) ? [] : [`${ADMONITION_STUB} does not use ${ADMONITION_TARGET}`];
}

const OPENERS = '([{';
const CLOSERS = ')]}';

/** The text of the value that starts at `start`, up to the comma or closing bracket that ends it. */
function valueAt(text, start) {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (OPENERS.includes(char)) depth += 1;
    if (CLOSERS.includes(char) && depth === 0) return text.slice(start, index);
    if (CLOSERS.includes(char)) depth -= 1;
    if (char === ',' && depth === 0) return text.slice(start, index);
  }
  return text.slice(start);
}

/** The value of every `key:` in a text. */
function valuesOf(text, key) {
  return [...text.matchAll(new RegExp(`\\b${key}\\s*:`, 'g'))].map((match) => valueAt(text, match.index + match[0].length));
}

/** Every content plugin of the site's own: { kind, options }, the options as the config's text. */
function contentPlugins(config) {
  return [...config.matchAll(CONTENT_PLUGIN)].map((match) => ({
    kind: match[1],
    options: valueAt(config, match.index + match[0].length),
  }));
}

/**
 * The folder a content plugin reads, from the root: its `path`, written as a string or as a name the config
 * sets to one, or the kind's default. null when the text does not say, as for a path worked out in code.
 */
function contentFolder(config, { kind, options }) {
  const [written] = valuesOf(options, 'path');
  if (written === undefined) return DEFAULT_CONTENT_FOLDERS[kind];
  const value = written.trim();
  const quoted = value.match(/^['"]([^'"]+)['"]$/);
  if (quoted) return quoted[1].replace(/^\.\//, '');
  if (!/^[A-Za-z_$][\w$]*$/.test(value)) return null;
  const set = config.match(new RegExp(`\\b(?:const|let|var)\\s+${value.replace(/\$/g, '\\$')}\\s*=\\s*['"]([^'"]+)['"]`));
  return set ? set[1].replace(/^\.\//, '') : null;
}

/** The tracked Markdown files of a folder that hold a dropdown. */
function filesWithDropDown({ root, env }, folder) {
  const files = trackedFiles(root, folder, env).filter((file) => MARKDOWN_FILE.test(file));
  return files.filter((file) => fs.readFileSync(path.join(root, file), 'utf8').includes(DROPDOWN_TAG));
}

/** A content plugin of the site's own that lacks one of DropDownIC's plugins while its folder holds a dropdown. */
function contentPluginProblems(site, plugin) {
  const missing = DROPDOWN_PLUGINS.map(([, name]) => name).filter((name) => !new RegExp(`\\b${name}\\b`).test(plugin.options));
  if (missing.length === 0) return [];
  const without = missing.join(' and ');
  const folder = contentFolder(site.config, plugin);
  if (folder === null) {
    return [`a ${plugin.kind} plugin of the site's own runs no ${without}, and its path is not one this check can read: run both there, or write its path as a string or a name set to one`];
  }
  const held = filesWithDropDown(site, folder);
  if (held.length === 0) return [];
  return [`the ${plugin.kind} plugin over ${folder} runs no ${without}, and ${held[0]} holds a dropdown: it throws React error #418 there`];
}

/** Plugin lists that run DropDownIC's plugins in too few blocks, and a preprocessor that leaves its own out. */
function dropDownIcRule(site) {
  const { config } = site;
  const preset = presetText(config);
  const blocks = preset.match(CONTENT_BLOCK)?.length ?? 0;
  const problems = DROPDOWN_PLUGINS.flatMap(([list, plugin]) => {
    const running = valuesOf(preset, list).filter((value) => new RegExp(`\\b${plugin}\\b`).test(value)).length;
    if (running >= blocks) return [];
    return [`only ${running} of ${blocks} docs, blog and pages blocks run ${plugin}: a dropdown there throws React error #418`];
  });
  problems.push(...contentPlugins(config).flatMap((plugin) => contentPluginProblems(site, plugin)));
  const own = valuesOf(config, 'preprocessor').filter((value) => !value.includes(DROPDOWN_PREPROCESSOR));
  if (own.length > 0) problems.push(`the markdown preprocessor does not run ${DROPDOWN_PREPROCESSOR}`);
  return problems;
}

/** True when DropDownIC's stub is there and points into shared/. A copy of the site's own keeps its own wiring. */
function hasDropDownStub({ root }) {
  const stub = readStub(root, DROPDOWN_STUB);
  return stub.exists && stub.target !== null;
}

/** True when a file sets the variable. Nothing of the file is ever printed. */
function setsSkip(text) {
  return text !== null && SKIP_LINE.test(text);
}

/** True when the checkout has no .env to read and netlify.toml does not settle it. */
function cannotTellMinification({ read }) {
  return read(ENV_FILE) === null && !setsSkip(read(NETLIFY_FILE));
}

function minificationRule(site) {
  const { read } = site;
  if (setsSkip(read(ENV_FILE)) || setsSkip(read(NETLIFY_FILE)) || cannotTellMinification(site)) return [];
  return [`${SKIP_NAME}=true is in neither ${ENV_FILE} nor ${NETLIFY_FILE}`];
}

/**
 * The steps of a site's wiring: when one is reached, and what a rule that waits for it says until then.
 *   wiring       the config names shared/wiring/index.cjs
 *   sharedStyle  the config names shared/css/custom.scss
 *   stylesheets  the site has moved its styles: the config names shared/css/custom.scss, or the site holds
 *                src/css/site.scss, which only a moved site has. A site still on its own src/css/custom.scss
 *                waits, as a join leaves it; one that drops the shared line fails.
 *   dropDownStub DropDownIC's stub is there and points into shared/
 */
const STEPS = {
  wiring: {
    reached: ({ config }) => config.includes(WIRING_FILE),
    waiting: `the config does not name ${WIRING_FILE} yet`,
  },
  sharedStyle: {
    reached: ({ config }) => config.includes(SHARED_STYLESHEET),
    waiting: `the config does not name ${SHARED_STYLESHEET}`,
  },
  stylesheets: {
    reached: ({ config, exists }) => config.includes(SHARED_STYLESHEET) || exists(SITE_STYLESHEET),
    waiting: `the config does not name ${SHARED_STYLESHEET} and there is no ${SITE_STYLESHEET} yet`,
  },
  dropDownStub: {
    reached: hasDropDownStub,
    waiting: `there is no ${DROPDOWN_STUB} that points into shared/`,
  },
};

const RULES = [
  { name: 'customCss order', step: 'stylesheets', check: customCssRule },
  { name: 'staticDirectories', step: 'sharedStyle', check: staticDirectoriesRule },
  { name: 'admonition keywords', step: 'wiring', check: keywordsRule },
  { name: 'stubs', step: 'wiring', check: stubsRule },
  { name: 'no leftover copies', step: 'wiring', check: leftoversRule },
  { name: 'the bibItems stub', step: 'wiring', check: bibItemsRule },
  { name: 'the Admonition stub', step: 'wiring', check: admonitionStubRule },
  { name: SKIP_NAME, step: 'wiring', check: minificationRule },
  { name: 'the DropDownIC plugins', step: 'dropDownStub', check: dropDownIcRule },
];

/** The sentences of every rule this site has reached. */
function allProblems(site) {
  const reached = RULES.filter(({ step }) => STEPS[step].reached(site));
  return reached.flatMap(({ check }) => check(site));
}

/** The wiring's row, and the package it names that no code of the wiring imports: Docusaurus, whose pin it ties. */
const WIRING_ROW = table.ENTRIES.find((row) => row.configText === WIRING_FILE);
const WIRING_PINNED = '@docusaurus/core';

/** The shared folders whose code the wiring requires, as `components/DropDownIC` for ../components/DropDownIC/mdx.cjs. */
function wiringComponentFolders() {
  const code = stripComments(fs.readFileSync(path.join(SHARED_ROOT, WIRING_FILE.replace(/^shared\//, '')), 'utf8'));
  return [...code.matchAll(/require\(\s*['"]\.\.\/(components\/\w+)\//g)].map((match) => match[1]);
}

/** The bare packages the wiring's code requires, its own .cjs files and the ones it reaches. */
function wiringPackages() {
  const files = [WIRING_FILE.replace(/^shared\//, ''), 'wiring/katex-macros.cjs',
    ...wiringComponentFolders().map((folder) => `${folder}/mdx.cjs`)];
  const code = files.map((file) => stripComments(fs.readFileSync(path.join(SHARED_ROOT, file), 'utf8'))).join('\n');
  return [...code.matchAll(/require\(\s*['"]([^'".][^'"]*)['"]/g)].map((match) => match[1]).filter((name) => !name.startsWith('node:'));
}

test('the wiring row runs the suite of every component whose code the wiring hands each page', () => {
  const folders = wiringComponentFolders();
  assert.ok(folders.length > 0, `${WIRING_FILE} requires no component`);
  const wanted = folders.flatMap((folder) => table.ENTRIES.filter((row) => (row.suites ?? []).some((suite) => suite.startsWith(`${folder}/`)))
    .flatMap((row) => row.suites));
  assert.ok(wanted.length > 0, 'no suite found for the components the wiring requires');
  assert.deepEqual(wanted.filter((suite) => !WIRING_ROW.suites.includes(suite)), []);
});

test('the wiring row asks for no package its code leaves out', () => {
  const imported = new Set(wiringPackages());
  const extra = WIRING_ROW.packages.filter((name) => name !== WIRING_PINNED && !imported.has(name));
  assert.deepEqual(extra, [], 'a site on the wiring without maths would read FAIL packages for these');
});

const plainStub = (name) => `export { default } from '@site/shared/components/${name}';\n`;

/** DropDownIC's two plugins, as a block of the good config runs them. */
const DROPDOWN_LISTS = 'remarkPlugins: [remarkMath, remarkDropDownIc], rehypePlugins: [rehypeDropDownIc, [rehypeKatex, katexOptions()]]';

/** How the good config's pages block opens: the breaks below change what follows it. */
const PAGES_OPEN = 'pages: { ...admonitionsConfig,';

const GOOD_CONFIG = `
// customCss: ['src/css/custom.scss'] once sat here
const { ADMONITION_KEYWORDS, admonitionsConfig, katexOptions, ${DROPDOWN_PREPROCESSOR}, rehypeDropDownIc, remarkDropDownIc } = require('./${WIRING_FILE}');
module.exports = {
  staticDirectories: ['static', '${STATIC_DIRECTORIES[1]}'],
  markdown: { preprocessor: ${DROPDOWN_PREPROCESSOR} },
  presets: [['classic', {
    docs: { ...admonitionsConfig, ${DROPDOWN_LISTS} },
    blog: false,
    ${PAGES_OPEN} ${DROPDOWN_LISTS} },
    theme: {
      customCss: [require.resolve('./${SHARED_STYLESHEET}'), require.resolve('./${SITE_STYLESHEET}')],
    },
  }]],
  themeConfig: { docs: { sidebar: {} } },
};
`;

const GOOD_SITE = {
  [CONFIG_FILE]: GOOD_CONFIG,
  [SITE_STYLESHEET]: '/* site.scss */\n',
  [ADMONITION_STUB]: `export { default } from '@site/${ADMONITION_TARGET}';\n`,
  [BIBREF_STUB]: `import Shared from '@site/shared/components/BibRef';
import bibItems from './bibliography.js';
export default (props) => <Shared bibItems={bibItems} {...props} />;
`,
  [BIBLIOGRAPHY]: 'export default {};\n',
  [DROPDOWN_STUB]: plainStub('DropDownIC'),
  'src/components/LC/index.jsx': plainStub('LC'),
  'docs/intro.md': "import LC from '@site/src/components/LC';\n\nA note.\n",
  [ENV_FILE]: `${SKIP_NAME}=true\n`,
};

/** A page of the notes plugin below, and a note that holds a dropdown. */
const NOTES_PAGE = 'notes/a.md';
const DROPDOWN_NOTE = "import DropDownIC from '@site/src/components/DropDownIC';\n\nWords <DropDownIC title=\"t\">body</DropDownIC> on.\n";

/** The good config with a docs plugin of its own, given its options' text, and lines to put above the config. */
function withNotesPlugin(options, above = '') {
  const plugin = `  plugins: [['@docusaurus/plugin-content-docs', ({ id: 'notes', ${options} })]],\n  themeConfig:`;
  return { [CONFIG_FILE]: `${above}${GOOD_CONFIG.replace('  themeConfig:', plugin)}` };
}

/** A git that reads no setting of the machine, as the scripts' own fixture has it. */
const FIXTURE_ENV = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };

/** The folders a fixture site tracks: its docs, the folder of the content plugin of its own below, its client modules. */
const TRACKED_FOLDERS = ['docs', 'notes', 'src/clientModules'];

/** Writes a fixture site with its TRACKED_FOLDERS tracked, and removes it when the test ends. */
function writeFixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-wiring-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  spawnSync('git', ['init', '-q'], { cwd: root, env: FIXTURE_ENV });
  const present = TRACKED_FOLDERS.filter((folder) => fs.existsSync(path.join(root, folder)));
  if (present.length > 0) spawnSync('git', ['add', '--', ...present], { cwd: root, env: FIXTURE_ENV });
  return readSite(root, FIXTURE_ENV);
}

/** GOOD_SITE with some files changed. `null` removes a file. */
function siteWith(changes) {
  const merged = { ...GOOD_SITE, ...changes };
  return Object.fromEntries(Object.entries(merged).filter(([, text]) => text !== null));
}

const configWith = (from, to) => ({ [CONFIG_FILE]: GOOD_CONFIG.replace(from, to) });

/** Each thing that can go wrong: the change, and words its sentence must hold. */
const BREAKS = [
  ['the site stylesheet before the shared one', configWith(
    `[require.resolve('./${SHARED_STYLESHEET}'), require.resolve('./${SITE_STYLESHEET}')]`,
    `[require.resolve('./${SITE_STYLESHEET}'), require.resolve('./${SHARED_STYLESHEET}')]`,
  ), 'customCss must start'],
  ['no site stylesheet', configWith(`, require.resolve('./${SITE_STYLESHEET}')`, ''), 'customCss must go on'],
  ['customCss as one string', configWith(/customCss: \[require.*\]/, `customCss: require.resolve('./${SHARED_STYLESHEET}')`), 'not a list'],
  ['no shared static folder', configWith(", 'shared/static'", ''), "lacks 'shared/static'"],
  ['the shared stylesheet dropped once the styles moved', configWith(`require.resolve('./${SHARED_STYLESHEET}'), `, ''), 'customCss must start'],
  ['a font left in static once the shared stylesheet is dropped', {
    ...configWith(`require.resolve('./${SHARED_STYLESHEET}'), `, ''),
    'static/fonts/IBM-Plex-Sans-400.woff2': '',
  }, 'IBM-Plex-Sans-400.woff2 is a leftover'],
  ['a block without the keywords', configWith(PAGES_OPEN, 'pages: {'), 'only 1 of 2 docs, blog and pages blocks take'],
  ['a keywords list of its own', configWith(PAGES_OPEN, "pages: { admonitions: { keywords: ['note'] },"), 'of its own'],
  ['an added keyword with no component', configWith(
    PAGES_OPEN,
    "pages: { admonitions: { keywords: [...ADMONITION_KEYWORDS, 'mine'] },",
  ), "'mine' has no component"],
  ['a stub missing for a piece in use', { 'src/components/LC/index.jsx': null }, 'LC is in use'],
  ['a local copy for a stub', { 'src/components/LC/index.jsx': 'export default function LC() {}\n' }, 'local copy of LC'],
  ['a stub pointing at another piece', { 'src/components/LC/index.jsx': plainStub('Asterisk') }, 'points at'],
  ['a wrapper round DropDownIC', {
    'src/components/DropDownIC/index.jsx': `import Shared from '@site/shared/components/DropDownIC';
export default function DropDownIC(props) { return <Shared {...props} />; }
`,
  }, 'plain re-export'],
  ['the registry stub missing while a client module imports it', {
    'src/clientModules/buildIdReload.js': "import { hasUnsavedWork } from '../components/CodeEditor/unsavedWork.js';\n",
  }, 'unsavedWork is in use'],
  ['a copy of the editor\'s registry', { [UNSAVED_WORK_STUB]: 'export const hasUnsavedWork = () => false;\n' }, 'local copy of unsavedWork'],
  ['the editor\'s stub with no Monaco plugin in the config', { [EDITOR_STUB]: plainStub('CodeEditor') }, `${CONFIG_FILE} lacks codeRunnerPlugin(`],
  ['the editor\'s stub with its Monaco plugin commented out', {
    [EDITOR_STUB]: plainStub('CodeEditor'),
    ...configWith('  themeConfig:', '  plugins: [\n    // codeRunnerPlugin(),\n  ],\n  themeConfig:'),
  }, 'CodeEditor is in use and needs the Monaco plugin'],
  ['a wrapper round the editor\'s registry', {
    [UNSAVED_WORK_STUB]: `import { hasUnsavedWork as shared } from '@site/shared/components/CodeEditor/unsavedWork.js';
export const hasUnsavedWork = () => shared();
`,
  }, 'plain re-export'],
  ['a stylesheet left in src/css', { 'src/css/custom.scss': '' }, 'src/css/custom.scss is a leftover'],
  ['a font left in static', { 'static/fonts/IBM-Plex-Sans-400.woff2': '' }, 'IBM-Plex-Sans-400.woff2 is a leftover'],
  ['an icon left in static', { 'static/icons/dot.svg': '' }, 'dot.svg is a leftover'],
  ['a custom Type file left', { 'src/theme/Admonition/Type/DWF.js': '' }, 'DWF.js is a leftover'],
  ['a stock Type file left', { 'src/theme/Admonition/Type/Note.js': '' }, 'Note.js is a leftover'],
  ['a component file left', { 'src/components/LC/problems.js': '' }, 'problems.js is a leftover'],
  ['a plugin left in plugins/', { 'plugins/monaco-editor/index.js': '' }, 'plugins/monaco-editor/index.js is a leftover'],
  ['the old macros file left', { 'katex-macros.js': '' }, 'katex-macros.js is a leftover'],
  ['a plain BibRef stub', { [BIBREF_STUB]: plainStub('BibRef') }, 'does not pass bibItems'],
  ['no bibliography', { [BIBLIOGRAPHY]: null }, `${BIBLIOGRAPHY} is missing`],
  ['no Admonition stub', { [ADMONITION_STUB]: null }, 'the config uses admonitionsConfig'],
  ['an Admonition stub of another piece', { [ADMONITION_STUB]: plainStub('LC') }, `does not use ${ADMONITION_TARGET}`],
  ['a .env without the variable', { [ENV_FILE]: 'OTHER=1\n' }, `${SKIP_NAME}=true is in neither`],
  ['a .env that turns it off', { [ENV_FILE]: `${SKIP_NAME}=false\n` }, `${SKIP_NAME}=true is in neither`],
  ['a DropDownIC stub with no remark plugin in one block', configWith(
    `${PAGES_OPEN} remarkPlugins: [remarkMath, remarkDropDownIc],`,
    `${PAGES_OPEN} remarkPlugins: [remarkMath],`,
  ), 'only 1 of 2 docs, blog and pages blocks run remarkDropDownIc'],
  ['a DropDownIC stub with no rehype plugin anywhere', configWith(/rehypeDropDownIc, \[/g, '['), 'only 0 of 2 docs, blog and pages blocks run rehypeDropDownIc'],
  ['a DropDownIC stub with no plugin lists at all', { [CONFIG_FILE]: GOOD_CONFIG.replaceAll(`, ${DROPDOWN_LISTS}`, '') }, 'run remarkDropDownIc'],
  ['a preprocessor of its own without DropDownIC\'s', configWith(`preprocessor: ${DROPDOWN_PREPROCESSOR}`, 'preprocessor: ownPreprocessor'), `does not run ${DROPDOWN_PREPROCESSOR}`],
  ['a docs plugin of its own without the DropDownIC plugins, over a folder with a dropdown', {
    ...withNotesPlugin("path: 'notes', remarkPlugins: [remarkMath]"),
    [NOTES_PAGE]: DROPDOWN_NOTE,
  }, 'the docs plugin over notes runs no remarkDropDownIc and rehypeDropDownIc, and notes/a.md holds a dropdown'],
  ['a docs plugin of its own with the remark plugin alone, its folder named by a const', {
    ...withNotesPlugin('path: NOTES_DIR, remarkPlugins: [remarkDropDownIc]', "const NOTES_DIR = 'notes';\n"),
    [NOTES_PAGE]: DROPDOWN_NOTE,
  }, 'the docs plugin over notes runs no rehypeDropDownIc, and notes/a.md holds a dropdown'],
  ['a docs plugin of its own whose path is worked out in code', withNotesPlugin("path: path.join(__dirname, 'notes')"), 'its path is not one this check can read'],
];

test('a good site has no problems', (t) => {
  assert.deepEqual(allProblems(writeFixture(t, GOOD_SITE)), []);
});

test('customCss as relative strings, the form the README prints, is a good site', (t) => {
  const relative = `['./${SHARED_STYLESHEET}', './${SITE_STYLESHEET}']`;
  const site = writeFixture(t, siteWith(configWith(/\[require\.resolve.*\]/, relative)));
  assert.ok(site.config.includes(relative), 'the fixture kept require.resolve');
  assert.deepEqual(allProblems(site), []);
});

for (const [name, changes, words] of BREAKS) {
  test(`a broken site is caught: ${name}`, (t) => {
    const problems = allProblems(writeFixture(t, siteWith(changes)));
    assert.ok(problems.some((problem) => problem.includes(words)), `expected "${words}" in ${JSON.stringify(problems)}`);
  });
}

test('a site adding a keyword of its own, with its component, passes', (t) => {
  const site = writeFixture(t, siteWith({
    ...configWith('pages: { ...admonitionsConfig }', "pages: { admonitions: { keywords: [...ADMONITION_KEYWORDS, 'mine'] } }"),
    [ADMONITION_STUB]: `import Types from '@site/${ADMONITION_TARGET}';
import Mine from './Type/Mine';
export default { ...Types, mine: Mine };
`,
  }));
  assert.deepEqual(allProblems(site), []);
});

test('a site with no custom admonitions needs no Admonition stub', (t) => {
  const site = writeFixture(t, siteWith({
    ...configWith(/(?:\.\.\.)?admonitionsConfig/g, ''),
    [ADMONITION_STUB]: null,
  }));
  assert.deepEqual(allProblems(site), []);
});

test('an icon a doc imports from static/ hides shared\'s copy, and its sentence names the import to change', (t) => {
  const site = writeFixture(t, siteWith({
    'static/icons/arrow_right.svg': '<svg />\n',
    'docs/cards.md': "import Arrow from '@site/static/icons/arrow_right.svg';\n",
  }));
  assert.deepEqual(allProblems(site), [
    'static/icons/arrow_right.svg is a leftover copy: shared/ holds it now, and it hides shared/static/icons/arrow_right.svg: '
    + 'a doc imports @site/static/icons/arrow_right.svg, so import @site/shared/static/icons/arrow_right.svg there and delete the copy',
  ]);
});

test('the editor\'s stub with codeRunnerPlugin() in the config\'s plugins passes', (t) => {
  const site = writeFixture(t, siteWith({
    [EDITOR_STUB]: plainStub('CodeEditor'),
    ...configWith('  themeConfig:', '  plugins: [codeRunnerPlugin()],\n  themeConfig:'),
  }));
  assert.ok(site.config.includes('codeRunnerPlugin()'), 'the fixture lost its plugin line');
  assert.deepEqual(allProblems(site), []);
});

test('a library or a plugin left where the site kept it is a leftover once shared/ holds the file', (t) => {
  const site = writeFixture(t, siteWith({ 'src/lib/reload/rules.js': '', 'plugins/stamp/index.js': '', 'src/lib/other/own.js': '' }));
  const held = ['lib/reload/rules.js', 'lib/reload/__tests__/rules.test.js', 'plugins/stamp/index.js', 'components/LC/index.jsx'];
  const left = COPY_HOMES.flatMap((home) => copiesIn(site, home, held)).map(({ file }) => file);
  assert.deepEqual(left, ['src/lib/reload/rules.js', 'plugins/stamp/index.js']);
});

test('a site\'s own README.md at the top of a folder shared/ has too is no leftover', (t) => {
  const site = writeFixture(t, siteWith({ 'src/lib/README.md': 'This site\'s libraries.\n', 'src/lib/reload/README.md': '' }));
  const held = ['lib/README.md', 'lib/reload/README.md'];
  const left = COPY_HOMES.flatMap((home) => copiesIn(site, home, held)).map(({ file }) => file);
  assert.deepEqual(left, ['src/lib/reload/README.md']);
});

test('a doc that imports the icon from shared/static/ passes', (t) => {
  const site = writeFixture(t, siteWith({
    'docs/cards.md': "import Arrow from '@site/shared/static/icons/arrow_right.svg';\n",
  }));
  assert.deepEqual(allProblems(site), []);
});

test('a site with shared/ only mounted has reached no rule', (t) => {
  const site = writeFixture(t, {
    [CONFIG_FILE]: "module.exports = { customCss: [require.resolve('./src/css/custom.scss')] };\n",
    'src/css/custom.scss': '',
    'src/components/LC/index.jsx': 'export default function LC() {}\n',
    'katex-macros.js': '',
    'docs/intro.md': 'A note.\n',
  });
  assert.deepEqual(allProblems(site), []);
});

test('a site on the shared wiring keeps its own stylesheets until it moves them', (t) => {
  const site = writeFixture(t, siteWith({
    ...configWith(`require.resolve('./${SHARED_STYLESHEET}'), require.resolve('./${SITE_STYLESHEET}')`, "require.resolve('./src/css/custom.scss')"),
    [SITE_STYLESHEET]: null,
    'src/css/custom.scss': '',
    'static/fonts/IBM-Plex-Sans-400.woff2': '',
  }));
  assert.deepEqual(allProblems(site), []);
});

test('a third stylesheet after the site one passes', (t) => {
  const third = `require.resolve('./${SITE_STYLESHEET}'), require.resolve('./src/css/extra.scss')`;
  const site = writeFixture(t, siteWith(configWith(`require.resolve('./${SITE_STYLESHEET}')`, third)));
  assert.deepEqual(allProblems(site), []);
});

/** The good config without its staticDirectories line. */
const NO_STATIC_KEY = GOOD_CONFIG.replace(/ *staticDirectories: \[[^\]]*\],\n/, '');

test('a site on the wiring that loads no shared stylesheet needs no shared/static', (t) => {
  const ownStyles = NO_STATIC_KEY.replace(/customCss: \[require[^\]]*\]/, "customCss: [require.resolve('./src/css/custom.scss')]");
  const site = writeFixture(t, siteWith({ [CONFIG_FILE]: ownStyles, [SITE_STYLESHEET]: null, 'src/css/custom.scss': '' }));
  assert.equal(site.config.includes('staticDirectories'), false, 'the fixture kept the key');
  assert.deepEqual(allProblems(site), []);
});

test('a config with no staticDirectories key serves static alone, as Docusaurus does', (t) => {
  const site = writeFixture(t, siteWith({ [CONFIG_FILE]: NO_STATIC_KEY }));
  assert.deepEqual(allProblems(site), ["staticDirectories lacks 'shared/static'"]);
});

test('a site without DropDownIC\'s stub needs none of its plugins', (t) => {
  const site = writeFixture(t, siteWith({
    [CONFIG_FILE]: GOOD_CONFIG.replaceAll(`, ${DROPDOWN_LISTS}`, '').replace(/\n *markdown: [^\n]*/, ''),
    [DROPDOWN_STUB]: null,
  }));
  assert.equal(site.config.includes('remarkPlugins'), false, 'the fixture kept a plugin list');
  assert.deepEqual(allProblems(site), []);
});

test('a copy of DropDownIC of the site\'s own keeps its own wiring', (t) => {
  const site = writeFixture(t, siteWith({
    [CONFIG_FILE]: GOOD_CONFIG.replaceAll(`, ${DROPDOWN_LISTS}`, ''),
    [DROPDOWN_STUB]: 'export default function DropDownIC() { return null; }\n',
  }));
  assert.deepEqual(allProblems(site).filter((problem) => problem.includes('DropDownIc')), []);
});

test('a docs plugin of its own that runs both DropDownIC plugins passes, its dropdown and all', (t) => {
  const site = writeFixture(t, siteWith({
    ...withNotesPlugin("path: 'notes', remarkPlugins: [remarkDropDownIc], rehypePlugins: [rehypeDropDownIc]"),
    [NOTES_PAGE]: DROPDOWN_NOTE,
  }));
  assert.equal(contentPlugins(site.config).length, 1, 'the fixture lost its plugin');
  assert.deepEqual(allProblems(site), []);
});

test('a docs plugin of its own that runs neither passes while no Markdown file of its folder holds a dropdown', (t) => {
  const site = writeFixture(t, siteWith({
    ...withNotesPlugin('path: NOTES_DIR', "const NOTES_DIR = 'notes';\n"),
    [NOTES_PAGE]: 'Plain words.\n',
    'notes/page.jsx': 'export default () => <DropDownIC title="t" />;\n',
  }));
  assert.deepEqual(allProblems(site), []);
});

test('a plugin of its own that runs the DropDownIC plugins does not stand in for a preset block that lacks them', (t) => {
  const site = writeFixture(t, siteWith({
    [CONFIG_FILE]: withNotesPlugin("path: 'notes', remarkPlugins: [remarkDropDownIc], rehypePlugins: [rehypeDropDownIc]")[CONFIG_FILE]
      .replace(`${PAGES_OPEN} remarkPlugins: [remarkMath, remarkDropDownIc],`, `${PAGES_OPEN} remarkPlugins: [remarkMath],`),
  }));
  assert.deepEqual(allProblems(site), ['only 1 of 2 docs, blog and pages blocks run remarkDropDownIc: a dropdown there throws React error #418']);
});

test('a content plugin\'s folder: a string, a name set to one, the kind\'s default, or unknown', () => {
  const config = "const DIR = './extra';\n";
  const folderOf = (kind, options) => contentFolder(config, { kind, options });
  assert.equal(folderOf('docs', " ({ path: 'notes' })"), 'notes');
  assert.equal(folderOf('docs', ' ({ path: DIR, sidebarPath: SIDEBARS })'), 'extra');
  assert.equal(folderOf('blog', " ({ id: 'news' })"), 'blog');
  assert.equal(folderOf('pages', ' ({})'), 'src/pages');
  assert.equal(folderOf('docs', ' ({ path: OTHER })'), null);
  assert.equal(folderOf('docs', " ({ path: path.resolve('x') })"), null);
});

test('a preprocessor of its own that runs DropDownIC\'s passes', (t) => {
  const own = `preprocessor: (args) => ${DROPDOWN_PREPROCESSOR}({ ...args, fileContent: own(args) })`;
  const site = writeFixture(t, siteWith(configWith(`preprocessor: ${DROPDOWN_PREPROCESSOR}`, own)));
  assert.deepEqual(allProblems(site), []);
});

test('the value reader stops at the comma or bracket that ends a value', () => {
  assert.equal(valueAt('a: [x, [y, z()]], b: 1', 2), ' [x, [y, z()]]');
  assert.equal(valueAt('{ p: (args) => f({ ...args, q: g(args) }) }', 4), ' (args) => f({ ...args, q: g(args) }) ');
  assert.deepEqual(valuesOf('x: 1, y: [2], x: f(3, 4)', 'x'), [' 1', ' f(3, 4)']);
});

test('netlify.toml answers for the variable, with no .env', (t) => {
  const toml = `[build.environment]\n  ${SKIP_NAME} = "true"\n`;
  const site = writeFixture(t, siteWith({ [ENV_FILE]: null, [NETLIFY_FILE]: toml }));
  assert.deepEqual(allProblems(site), []);
  assert.equal(cannotTellMinification(site), false);
});

test('a checkout with no .env cannot tell, so it passes with a note', (t) => {
  const site = writeFixture(t, siteWith({ [ENV_FILE]: null }));
  assert.deepEqual(minificationRule(site), []);
  assert.equal(cannotTellMinification(site), true);
});

test('a site is a config beside a folder named shared', (t) => {
  const { root } = writeFixture(t, { ...GOOD_SITE, 'shared/package.json': '{}\n', 'hub/package.json': '{}\n' });
  assert.equal(hostSite(path.join(root, 'shared')), root);
  assert.equal(hostSite(path.join(root, 'hub')), null);
});

const host = hostSite();
const hostView = host === null ? null : readSite(host);

/** Why a rule cannot run here, or false. */
function ruleSkip({ step }) {
  if (hostView === null) return 'outside a site: the rules ran on the fixtures above';
  return STEPS[step].reached(hostView) ? false : STEPS[step].waiting;
}

for (const rule of RULES) {
  test(`this site: ${rule.name}`, { skip: ruleSkip(rule) }, (t) => {
    assert.deepEqual(rule.check(hostView), []);
    if (rule.name === SKIP_NAME && cannotTellMinification(hostView)) {
      t.diagnostic(`no ${ENV_FILE} here and ${NETLIFY_FILE} does not set ${SKIP_NAME}: not checked in this checkout`);
    }
  });
}
