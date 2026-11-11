/**
 * site-files.test.mjs: checks on this site's own files that need no build. Run from the repo's top
 * folder:
 *   node --test scripts/site-files.test.mjs
 * `npm run shared:verify` runs it too.
 *
 * THE CHECKS
 *   no hidden shared file   no file in static/ sits at the path of a file in shared/static/. Both
 *                           folders are served from the site's root, and the config lists static/
 *                           first, so such a copy wins wherever a stylesheet's url() names that path,
 *                           and which of the two the site serves is not fixed. A change to the shared
 *                           file then never shows here. A doc that imports a shared icon names it
 *                           under @site/shared/static/, so the site needs no copy.
 *   the README's pointer    the README's sentence on shared/README.md sends readers to --help for
 *                           the options shared/README.md leaves out, and promises no full list of
 *                           them there: that file gives the main ones only
 *   published addresses     every blog address the site has published (its sitemap and feeds named it)
 *                           still belongs to a post, so links and feed readers keep finding it. A post's
 *                           address is the one Docusaurus gives it: the slug in its front matter, or else
 *                           the date and name of its file or folder. So a post whose date changes keeps its
 *                           old address with `slug:` in its front matter. The name rule is Docusaurus's
 *                           own parseBlogFileName, read from node_modules, so run npm ci first.
 *   the five rules          the README's list under "The five rules" says word for word what the list
 *                           under that heading in shared/README.md says, so the copy here never drifts
 *                           from the rules every site keeps
 *   the docs sidebar stub   src/theme/DocRoot/Layout/Sidebar/index.jsx stays a plain re-export of
 *                           shared/theme/DocRoot/Layout/Sidebar, the wrapper that keeps the reader's
 *                           place when the docs sidebar collapses or expands. Nothing else sees it go:
 *                           shared:status reads a missing stub as "not in use", and without it the
 *                           theme's plain column comes back and the build passes. The sidebar stays
 *                           hideable in docusaurus.config.js, or the wrapper has nothing to hold
 *
 * How to change it: a new check is a test below with a line in the list above. A name Finder or an
 * editor leaves in a folder goes in IGNORED_NAMES. A new wording of the README's sentence must still
 * match POINTER_SENTENCE. A post published for the first time adds its address to
 * PUBLISHED_POST_ADDRESSES; a post moved on purpose needs a redirect first, and then its line goes.
 * Red on the five rules after a pull: copy the list from shared/README.md into the README.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseBlogFileName } from '@docusaurus/plugin-content-blog/lib/blogUtils.js';

/** The repo's top folder, so the tests read the same files from any working folder. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_STATIC = 'static';
const SHARED_STATIC = 'shared/static';
/** Files no one ships on purpose, which may sit in both folders. */
const IGNORED_NAMES = new Set(['.DS_Store']);

const README = 'README.md';
/** The README's sentence about what shared/README.md holds, read with its line breaks as spaces. */
const POINTER_SENTENCE = /`shared\/README\.md` says [^.]*\./;
/** `-- --help` after an npm command, or `--help` after a node one. */
const HELP_POINTER = /--help` lists the rest/;
const FULL_LIST_CLAIM = /\bevery option\b/;

const SHARED_README = 'shared/README.md';
/** The heading both READMEs give the rules, at any level from ## to ####. */
const FIVE_RULES_HEADING = 'The five rules';
const FIVE_RULES_COUNT = 5;
const HEADING_LINE = /^(#{1,6}) (.*)$/;
const NUMBERED_LINE = /^\d+\. /;
/** A wrapped line of a numbered item: indented under the item's text. */
const ITEM_CONTINUATION = /^ {2,}\S/;

const BLOG = 'blog';
/** The blog's route: Docusaurus's default routeBasePath, which docusaurus.config.js keeps. */
const BLOG_ROUTE = '/blog';
/** Every blog address the live site has published, as its sitemap and feeds named them in January 2026. */
const PUBLISHED_POST_ADDRESSES = [
  '/blog/2026/01/13/2026/working-with-arbitrary-bases',
  '/blog/2026/01/15/2026/algorithm-grading-rubric',
  '/blog/2026/01/15/2026/docusaurus-mui-light-dark',
  '/blog/2026/01/15/2026/feynman-technique',
  '/blog/2026/01/19/2026/excerpts-from-polya',
];
const POST_FILE = /\.mdx?$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const SLUG_LINE = /^slug:[ \t]*['"]?([^'"\r\n]+?)['"]?[ \t]*\r?$/m;
const DRAFT_LINE = /^draft:[ \t]*true[ \t]*\r?$/m;

const CONFIG = 'docusaurus.config.js';
/** The docs sidebar's stub, the one statement it holds once its comments are out, and the file it names. */
const SIDEBAR_STUB = 'src/theme/DocRoot/Layout/Sidebar/index.jsx';
const SIDEBAR_STUB_CODE = "export { default } from '@site/shared/theme/DocRoot/Layout/Sidebar';";
const SIDEBAR_WRAPPER = 'shared/theme/DocRoot/Layout/Sidebar/index.jsx';
/** themeConfig.docs.sidebar with hideable on: the collapse button and the expand strip exist. */
const HIDEABLE = /\bdocs:\s*\{\s*sidebar:\s*\{[^}]*\bhideable:\s*true\b/;

/** Every file under a folder of the repo, as paths relative to that folder. */
function filesUnder(folder) {
  const top = path.join(ROOT, folder);
  return fs
    .readdirSync(top, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !IGNORED_NAMES.has(entry.name))
    .map((entry) => path.relative(top, path.join(entry.parentPath, entry.name)))
    .sort();
}

/** The shared static files that this site also keeps a file of its own for, at the same path. */
function hiddenSharedFiles() {
  return filesUnder(SHARED_STATIC).filter((file) => fs.existsSync(path.join(ROOT, SITE_STATIC, file)));
}

/** A file's code: its comments taken out, the ends trimmed. */
function codeOf(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
}

/** A heading line's level and text, or null for any other line. */
function headingOf(line) {
  const match = line.match(HEADING_LINE);
  return match ? { level: match[1].length, text: match[2] } : null;
}

/**
 * The numbered items under the first heading called `heading` (## or deeper), up to the next heading,
 * each with its wrapped lines joined by single spaces. Text between the heading and the list is not an item.
 */
function numberedItemsUnder(file, heading) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const start = lines.findIndex((line) => {
    const found = headingOf(line);
    return found !== null && found.level >= 2 && found.text === heading;
  });
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING_LINE.test(line)) break;
    if (NUMBERED_LINE.test(line)) items.push(line.trim());
    else if (items.length > 0 && ITEM_CONTINUATION.test(line)) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items.map((item) => item.replace(/\s+/g, ' '));
}

/** The address Docusaurus gives one post, or null for a draft, which has no page. */
function postAddress(relativePath, text) {
  const frontMatter = text.match(FRONT_MATTER)?.[1] ?? '';
  if (DRAFT_LINE.test(frontMatter)) return null;
  const slug = frontMatter.match(SLUG_LINE)?.[1] ?? parseBlogFileName(relativePath).slug;
  return `${BLOG_ROUTE}/${slug}`.replace(/\/{2,}/g, '/');
}

/** The address of every post under blog/. Docusaurus skips a file or folder whose name starts with _. */
function postAddresses() {
  return filesUnder(BLOG)
    .filter((file) => POST_FILE.test(file) && !file.split(path.sep).some((part) => part.startsWith('_')))
    .map((file) => postAddress(file.split(path.sep).join('/'), fs.readFileSync(path.join(ROOT, BLOG, file), 'utf8')))
    .filter(Boolean);
}

test('no file in static/ hides a file of shared/static/', () => {
  assert.ok(fs.existsSync(path.join(ROOT, SHARED_STATIC)), `${SHARED_STATIC} is missing: is shared/ mounted?`);
  const hidden = hiddenSharedFiles();
  const advice = `delete the copy in ${SITE_STATIC}/, and import the shared file as @site/${SHARED_STATIC}/<path>`;
  assert.deepEqual(hidden, [], `${SITE_STATIC}/ hides ${hidden.join(', ')} of ${SHARED_STATIC}/: ${advice}`);
});

test("the README's pointer to shared/README.md sends readers to --help for the rest", () => {
  const text = fs.readFileSync(path.join(ROOT, README), 'utf8').replace(/\s+/g, ' ');
  const sentence = text.match(POINTER_SENTENCE)?.[0];
  assert.ok(sentence, `${README} has no sentence that starts "\`shared/README.md\` says"`);
  assert.doesNotMatch(sentence, FULL_LIST_CLAIM, `${README} promises every option, but shared/README.md gives the main ones`);
  assert.match(sentence, HELP_POINTER, `${README} should say that \`--help\` lists the rest`);
});

test('every blog address the site has published still belongs to a post', () => {
  const addresses = new Set(postAddresses());
  const lost = PUBLISHED_POST_ADDRESSES.filter((address) => !addresses.has(address));
  const advice = 'give the post that moved `slug: <its old address without /blog>` in its front matter';
  assert.deepEqual(lost, [], `no post has ${lost.join(', ')} any more: ${advice}`);
});

test('the docs sidebar stub hands on the shared wrapper', () => {
  assert.ok(fs.existsSync(path.join(ROOT, SIDEBAR_STUB)), `${SIDEBAR_STUB} is missing: the theme's plain column is back, and a collapse moves the page`);
  assert.equal(codeOf(SIDEBAR_STUB), SIDEBAR_STUB_CODE, `${SIDEBAR_STUB} must stay a plain re-export of the shared wrapper`);
  assert.ok(fs.existsSync(path.join(ROOT, SIDEBAR_WRAPPER)), `${SIDEBAR_WRAPPER} is missing: is shared/ mounted?`);
});

test('the docs sidebar can be collapsed, so the wrapper has a toggle to hold', () => {
  assert.match(fs.readFileSync(path.join(ROOT, CONFIG), 'utf8'), HIDEABLE);
});

test("the README's five rules say what shared/README.md's say", () => {
  const shared = numberedItemsUnder(SHARED_README, FIVE_RULES_HEADING);
  const here = numberedItemsUnder(README, FIVE_RULES_HEADING);
  assert.equal(shared.length, FIVE_RULES_COUNT, `${SHARED_README} has no list of ${FIVE_RULES_COUNT} under "${FIVE_RULES_HEADING}": is shared/ mounted?`);
  assert.deepEqual(here, shared, `${README}'s list under "${FIVE_RULES_HEADING}" differs from ${SHARED_README}'s: copy it from there`);
});
