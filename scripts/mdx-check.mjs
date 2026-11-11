#!/usr/bin/env node
/**
 * scripts/mdx-check.mjs: compiles every page of a site with MDX 3 and lists the pages that fail. A build
 * stops at the first bad page, so this gives the whole list at once, in seconds. Run it before a major
 * version of Docusaurus, and on an older site before it joins. It changes nothing.
 *
 *   node shared/scripts/mdx-check.mjs                     this site, as Docusaurus reads it today
 *   node shared/scripts/mdx-check.mjs --strict            this site, with mdx1Compat off
 *   node shared/scripts/mdx-check.mjs --root ../old-site  another site, with this site's packages
 *
 * --strict reads a page the way `future.v4` does, which is what the next major does by default. Two things
 * then fail to compile: an HTML comment such as <!--truncate--> (the hit names the fix: {/* truncate *\/}), and a
 * heading id written {#id}. A third
 * compiles and prints wrong, so only this script sees it: `:::note Some title` stays plain text on the
 * page. Write `:::note[Some title]`.
 *
 * It takes MDX and the remark plugins from the installed packages of the site around this script, the ones
 * that site's Docusaurus uses, so that site must have run `npm ci`. That is how it reads an older site:
 * --root names the site to read, whose own packages do not matter. --packages takes them from another site.
 *
 * It reads each page apart, with the plugins that change what parses: front matter, GFM, directives,
 * maths, comments, the admonition keywords and the dropdown's preprocessor of wiring/index.cjs. A keyword
 * of one site's own makes no difference. It does not read a page's imports or links.
 *
 * A partial is a file with a leading _ in its path. A build compiles one only when a page imports it, so a
 * partial that fails is listed and leaves the exit code alone. A partial a page does import stops the
 * build, which says so.
 *
 * THE ONE-REGEX NOTE  A page written for MDX 1 usually fails on <details>. MDX 3 needs a blank line after
 * <details> and after its <summary> line, or it reads them as text in a paragraph and fails with
 * end-tag-mismatch. DETAILS_BLOCK and DETAILS_FIX below are one regular expression that fixes that, run over
 * a site's pages with `text.replace(DETAILS_BLOCK, DETAILS_FIX)`. On four older sites it took 3,114 failing
 * files to 76. Read the diff: it also changes such a block inside a code fence. It stays a note, not an
 * option, because a person should read what it did.
 *
 * Exit codes: 0 no page fails, 1 a page fails, 2 refused because the check could not run. A check that
 * could not run is never a pass: no pages, or no packages to compile with.
 *
 * Flags:
 *   --root <folder>      the site to read, if it is not the current folder
 *   --packages <folder>  the site whose installed packages compile it. Default: the site around this script
 *   --strict             read with mdx1Compat off
 *   --help               print the flags and stop
 *
 * How to change it:
 *   another place to read: PAGE_FOLDERS
 *   a plugin that changes what parses: LOADER_PLUGINS, or SITE_PLUGINS for one a site installs itself
 *   a new shape of legacy title: LEGACY_TITLE
 * It is published, so it names no site and no folder of one.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { counted } from './lib/phrases.mjs';

export const EXIT_CLEAN = 0;
export const EXIT_FOUND = 1;
export const EXIT_REFUSED = 2;

/** Each message starts with this, so a line in a long test run says where it came from. */
const LABEL = 'mdx-check';

const USAGE = `Usage: node shared/scripts/mdx-check.mjs [--root <folder>] [--packages <folder>] [--strict]
  --root <folder>      the site to read, if it is not the current folder
  --packages <folder>  the site whose installed packages compile it. Default: the site around this script
  --strict             read with mdx1Compat off, as future.v4 and the next major do
  --help               print this and stop`;

/** Where a site keeps its pages, from its top folder. */
const PAGE_FOLDERS = Object.freeze(['docs', 'blog', 'src/pages']);
const PAGE_FILE = /\.mdx?$/;
const SKIPPED_FOLDERS = new Set(['node_modules']);
const PARTIAL_MARK = '_';

/** Docusaurus strips front matter before MDX sees a page. Blank lines keep the line numbers true. */
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/** The note in the header. It takes a <summary> on the same line as <details>, or on the next. */
export const DETAILS_BLOCK = /^([ \t]*)(<details[^>]*>)[ \t]*(?:\r?\n[ \t]*)?(<summary[^>]*>.*<\/summary>)[ \t]*$/gm;
export const DETAILS_FIX = '$1$2\n\n$1$3\n';

/** A paragraph that opens with a keyword and words: a legacy title that nothing turned into a directive. */
const LEGACY_TITLE = /^:::[a-z]+[ \t]+\S/;
const LEGACY_RULE = 'admonition-title';
const LEGACY_REASON = 'prints as plain text with mdx1Compat off. Write :::keyword[Title]';

/** The rule MDX 3 fails an HTML comment such as <!-- truncate --> on, at its `!`, and the way to write one. */
const COMMENT_RULE = 'unexpected-character';
const COMMENT_OPEN = '<!--';
const COMMENT_FIX = 'An HTML comment with mdx1Compat off: write {/* truncate */} for <!-- truncate -->, and {/* ... */} for any other';

const LOADER_PACKAGE = '@docusaurus/mdx-loader';
const PREPROCESSOR_FILE = 'lib/preprocessor.js';
/** What Docusaurus's own loader imports. COMMENT_PLUGIN goes only where comments are allowed. */
const COMPILER_PACKAGE = '@mdx-js/mdx';
const LOADER_PLUGINS = Object.freeze(['remark-frontmatter', 'remark-gfm', 'remark-directive']);
const COMMENT_PLUGIN = '@slorber/remark-comment';
/** What a site puts in its config itself. */
const SITE_PLUGINS = Object.freeze(['remark-math']);

/** The codes Node gives a package that is not installed, or that hides the file asked for. */
const MISSING_PACKAGE_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED']);

const OTHER_RULE = 'other';
/** The rule MDX names when <details> and <summary> are read as text. */
const END_TAG_RULE = 'end-tag-mismatch';
const MAX_REASON_LENGTH = 120;

/** The wiring holds the keywords and the preprocessor, and it needs no package. */
const wiring = createRequire(import.meta.url)('../wiring/index.cjs');

/** The folder around shared/, when this script sits in a site. */
const SITE_AROUND_SCRIPT = fileURLToPath(new URL('../..', import.meta.url));

class Refusal extends Error {}

function readOptions(args) {
  try {
    const { values } = parseArgs({
      args,
      options: {
        root: { type: 'string' },
        packages: { type: 'string' },
        strict: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
    });
    const root = path.resolve(values.root ?? process.cwd());
    return { ...values, root, packages: path.resolve(values.packages ?? SITE_AROUND_SCRIPT) };
  } catch (error) {
    throw new Refusal(`${error.message}\n${USAGE}`);
  }
}

/** Every page below `folder`, as paths from the site's root with forward slashes. */
function walk(root, folder, found) {
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const relative = `${folder}/${entry.name}`;
    if (entry.isDirectory() && !SKIPPED_FOLDERS.has(entry.name)) walk(root, relative, found);
    else if (entry.isFile() && PAGE_FILE.test(entry.name)) found.push(relative);
  }
  return found;
}

function listPages(root) {
  const folders = PAGE_FOLDERS.filter((folder) => fs.existsSync(path.join(root, folder)));
  return folders.flatMap((folder) => walk(root, folder, [])).sort();
}

/** True for a file a build compiles only when a page imports it. */
export function isPartial(page) {
  return page.split('/').some((piece) => piece.startsWith(PARTIAL_MARK));
}

export function blankFrontMatter(text) {
  return text.replace(FRONT_MATTER, (block) => '\n'.repeat(block.split('\n').length - 1));
}

/** One failure from what the compiler threw, on one line. */
export function failureOf(error) {
  const reason = String(error.reason ?? error.message).split('\n')[0].slice(0, MAX_REASON_LENGTH);
  return { line: error.line ?? 0, rule: String(error.ruleId ?? OTHER_RULE), reason };
}

/** A remark plugin that notes each legacy title it passes, in `found`. */
function legacyTitles(found) {
  const visit = (node) => {
    if (node.type === 'text' && LEGACY_TITLE.test(node.value)) {
      found.push({ line: node.position?.start.line ?? 0, rule: LEGACY_RULE, reason: LEGACY_REASON });
    }
    node.children?.forEach(visit);
  };
  return () => visit;
}

/** Runs `load`. A package that is not there is a refusal that names it. */
async function tool(name, load) {
  try {
    return await load();
  } catch (error) {
    if (!MISSING_PACKAGE_CODES.has(error.code)) throw error;
    throw new Refusal(`no ${name} to compile with: run it from a site with its packages installed, or give --packages <folder>`);
  }
}

/** One ES module of the packages `require` can see. */
function importFrom(require, name) {
  return tool(name, () => import(pathToFileURL(require.resolve(name)).href));
}

/** The compiler and plugins of the site at `folder`, the ones its Docusaurus uses. */
async function loadTools(folder, strict) {
  const site = createRequire(path.join(folder, 'package.json'));
  const loaderFile = await tool(LOADER_PACKAGE, () => site.resolve(`${LOADER_PACKAGE}/package.json`));
  const loader = createRequire(loaderFile);
  const preprocessorFile = path.join(path.dirname(loaderFile), PREPROCESSOR_FILE);
  const { default: preprocess } = await tool(PREPROCESSOR_FILE, () => loader(preprocessorFile));
  const { compile } = await importFrom(loader, COMPILER_PACKAGE);
  const fromLoader = strict ? LOADER_PLUGINS : [...LOADER_PLUGINS, COMMENT_PLUGIN];
  const modules = [
    ...await Promise.all(fromLoader.map((name) => importFrom(loader, name))),
    ...await Promise.all(SITE_PLUGINS.map((name) => importFrom(site, name))),
  ];
  return { compile, preprocess, plugins: modules.map((module) => module.default) };
}

/** The failures of one page: what the compiler threw, or the legacy titles it passed. */
async function checkPage(root, page, { compile, preprocess, plugins }, strict) {
  const legacy = [];
  const compat = !strict;
  const markdownConfig = {
    mdx1Compat: { headingIds: compat, admonitions: compat, comments: compat },
    preprocessor: wiring.preprocessDropDownIc,
  };
  const source = fs.readFileSync(path.join(root, page), 'utf8');
  try {
    const fileContent = blankFrontMatter(source);
    const filePath = path.join(root, page);
    const text = preprocess({ fileContent, filePath, markdownConfig, admonitions: wiring.admonitionsConfig.admonitions });
    const remarkPlugins = strict ? [...plugins, legacyTitles(legacy)] : plugins;
    await compile(text, { format: 'mdx', remarkPlugins });
    return legacy;
  } catch (error) {
    const failure = failureOf(error);
    const atComment = failure.rule === COMMENT_RULE && (source.split('\n')[failure.line - 1] ?? '').includes(COMMENT_OPEN);
    return [strict && atComment ? { ...failure, reason: `${failure.reason}. ${COMMENT_FIX}` } : failure];
  }
}

/** How many of `hits` are the failure of the note in the header, on a page that holds its shape. */
function detailsPages(root, hits) {
  const tagHits = hits.filter(({ rule }) => rule === END_TAG_RULE);
  const holdsBlock = (page) => fs.readFileSync(path.join(root, page), 'utf8').search(DETAILS_BLOCK) !== -1;
  return [...new Set(tagHits.map(({ page }) => page))].filter(holdsBlock).length;
}

function hitLines(hits) {
  return hits.map(({ page, line, rule, reason }) => `${LABEL}: ${page}:${line}: ${rule}: ${reason}`);
}

/** What a run found, as the lines it prints: partials first, so the pages that count end the output. */
function report(root, hits, read) {
  const partials = hits.filter(({ page }) => isPartial(page));
  const pages = hits.filter(({ page }) => !isPartial(page));
  const lines = [...hitLines(partials), ...hitLines(pages)];
  if (partials.length > 0) {
    lines.push(`${LABEL}: ${counted(partials.length, 'hit')} in partials above: each counts only if a page imports that file.`);
  }
  const blocks = detailsPages(root, pages);
  if (blocks > 0) lines.push(`${LABEL}: ${counted(blocks, 'page')} with a <details> block: see the one-regex note at the top of this script.`);
  const failing = new Set(pages.map(({ page }) => page)).size;
  lines.push(`${LABEL}: ${failing === 0 ? 'clean' : `${counted(failing, 'page')} failing`}, ${counted(read, 'file')} read.`);
  return { exitCode: failing === 0 ? EXIT_CLEAN : EXIT_FOUND, lines };
}

/** Reads the site at `root`. Returns { exitCode, lines }, or throws a Refusal. */
async function checkSite({ root, packages, strict }) {
  const pages = listPages(root);
  if (pages.length === 0) throw new Refusal(`no pages to read in ${PAGE_FOLDERS.join(', ')} of ${path.basename(root)}`);
  const tools = await loadTools(packages, strict);
  const hits = [];
  for (const page of pages) {
    const failures = await checkPage(root, page, tools, strict);
    hits.push(...failures.map((failure) => ({ page, ...failure })));
  }
  return report(root, hits, pages.length);
}

async function main() {
  try {
    const options = readOptions(process.argv.slice(2));
    if (options.help) {
      console.log(USAGE);
      return;
    }
    const { exitCode, lines } = await checkSite(options);
    const print = exitCode === EXIT_CLEAN ? console.log : console.error;
    lines.forEach((line) => print(line));
    process.exitCode = exitCode;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`${LABEL}: refused: ${error.message}`);
    process.exitCode = EXIT_REFUSED;
  }
}

function isRunDirectly() {
  const script = process.argv[1];
  return Boolean(script) && fs.realpathSync(script) === fileURLToPath(import.meta.url);
}

if (isRunDirectly()) {
  await main();
}
