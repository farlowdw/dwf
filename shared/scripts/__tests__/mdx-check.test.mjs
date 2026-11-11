/**
 * scripts/__tests__/mdx-check.test.mjs: tests for mdx-check.mjs. From a site:
 *   node --test shared/scripts/__tests__/mdx-check.test.mjs
 *
 * The rules are tested as functions, and every exit code and message by running the real command on a
 * throwaway site in the system's temp folder. The hub has no node_modules, so those runs compile with
 * STAND_IN: a small folder laid out like a site's packages, whose compile throws on a marker and runs the
 * plugins it is given. The last group needs the real MDX, so it runs in a site and skips in the hub, saying so.
 *
 * How to change it: add a case beside the rule it covers. A new package the script loads needs a file in
 * STAND_IN and a name in REQUIRED_PACKAGES.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { hostSite } from '../../__tests__/sharedTree.mjs';
import {
  DETAILS_BLOCK,
  DETAILS_FIX,
  EXIT_CLEAN,
  EXIT_FOUND,
  EXIT_REFUSED,
  blankFrontMatter,
  failureOf,
  isPartial,
} from '../mdx-check.mjs';

const SCRIPT = fileURLToPath(new URL('../mdx-check.mjs', import.meta.url));
const SHARED_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MOUNTED_SCRIPT = 'shared/scripts/mdx-check.mjs';
const NOT_MOUNTED = new Set(['.git', 'node_modules']);

const CLEAN_PAGE = '# A page\n\nSome words.\n';
const BROKEN_PAGE = '# A page\n\nBROKEN\n';
const END_TAG_PAGE = '<details><summary>Title</summary>\n\nENDTAG\n';
const NOTE_POINTER = 'one-regex note';

const LOADER = 'node_modules/@docusaurus/mdx-loader';

/** A compile that stands in for MDX: it runs the plugins, then throws on a marker. */
const STAND_IN_COMPILE = `
export async function compile(text, { remarkPlugins }) {
  const lines = text.split('\\n');
  const paragraph = (value, index) => ({
    type: 'paragraph',
    children: [{ type: 'text', value, position: { start: { line: index + 1 } } }],
  });
  const tree = { type: 'root', children: lines.map(paragraph) };
  for (const attacher of remarkPlugins) attacher()?.(tree);
  const failAt = (rule, reason, index) => {
    throw Object.assign(new Error(reason), { line: index + 1, ruleId: rule, reason });
  };
  lines.forEach((line, index) => {
    if (line.includes('BROKEN')) failAt('stand-in-rule', 'broken here', index);
    if (line.includes('ENDTAG')) failAt('end-tag-mismatch', 'tag left open', index);
    if (line.includes('<!--') && !tree.comments) failAt('unexpected-character', 'a comment', index);
  });
}
`;

/** Turns a legacy title into a directive where compat is on, as the real preprocessor does. */
const STAND_IN_PREPROCESSOR = `
exports.default = ({ fileContent, filePath, markdownConfig, admonitions }) => {
  if (admonitions.keywords.length === 0) throw new Error('no keywords');
  const text = markdownConfig.preprocessor({ fileContent, filePath });
  return markdownConfig.mdx1Compat.admonitions ? text.replace(/^:::(\\w+) (.+)$/gm, ':::$1[$2]') : text;
};
`;

const NO_OP_PLUGIN = 'export default function plugin() {}\n';
const COMMENT_PLUGIN = 'export default function comment() { return (tree) => { tree.comments = true; }; }\n';

/** Each file of a folder of packages, laid out as npm would. */
const STAND_IN = Object.freeze({
  'package.json': '{ "name": "stand-in", "private": true }\n',
  [`${LOADER}/package.json`]: '{ "name": "@docusaurus/mdx-loader", "version": "0.0.0" }\n',
  [`${LOADER}/lib/preprocessor.js`]: STAND_IN_PREPROCESSOR,
  'node_modules/@mdx-js/mdx/package.json': '{ "name": "@mdx-js/mdx", "main": "index.mjs" }\n',
  'node_modules/@mdx-js/mdx/index.mjs': STAND_IN_COMPILE,
  ...Object.fromEntries(['remark-frontmatter', 'remark-gfm', 'remark-directive', 'remark-math'].flatMap((name) => [
    [`node_modules/${name}/package.json`, `{ "name": "${name}", "main": "index.mjs" }\n`],
    [`node_modules/${name}/index.mjs`, NO_OP_PLUGIN],
  ])),
  'node_modules/@slorber/remark-comment/package.json': '{ "name": "@slorber/remark-comment", "main": "index.mjs" }\n',
  'node_modules/@slorber/remark-comment/index.mjs': COMMENT_PLUGIN,
});

/** What the check needs, as a name in its refusal and the folder that holds it. */
const REQUIRED_PACKAGES = Object.freeze({
  '@docusaurus/mdx-loader': LOADER,
  '@mdx-js/mdx': 'node_modules/@mdx-js/mdx',
  'remark-frontmatter': 'node_modules/remark-frontmatter',
  'remark-gfm': 'node_modules/remark-gfm',
  'remark-directive': 'node_modules/remark-directive',
  'remark-math': 'node_modules/remark-math',
  '@slorber/remark-comment': 'node_modules/@slorber/remark-comment',
});

function tempFolder(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdx-check-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeAll(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const fullPath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, contents);
  }
  return root;
}

function makeSite(t, files) {
  return writeAll(tempFolder(t), files);
}

function makePackages(t) {
  return makeSite(t, STAND_IN);
}

function run(root, { packages, flags = [], script = SCRIPT } = {}) {
  const fromPackages = packages === undefined ? [] : ['--packages', packages];
  const args = [script, ...fromPackages, ...flags];
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

/** A run of a throwaway site that holds `files`, on the stand-in packages. */
function runOn(t, files, flags = []) {
  return run(makeSite(t, files), { packages: makePackages(t), flags });
}

/** Path, size and time of every file below `root`. */
function snapshot(root) {
  const entries = fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  return entries.map((entry) => {
    const file = path.join(entry.parentPath, entry.name);
    const { size, mtimeMs } = fs.statSync(file);
    return `${file} ${size} ${mtimeMs}`;
  }).sort();
}

// The rules

test('the exit codes are 0, 1 and 2', () => {
  assert.deepEqual([EXIT_CLEAN, EXIT_FOUND, EXIT_REFUSED], [0, 1, 2]);
});

test('a partial is any path with a piece that opens with an underscore', () => {
  assert.equal(isPartial('docs/_Partials/one.md'), true);
  assert.equal(isPartial('docs/guide/_one.mdx'), true);
  assert.equal(isPartial('src/pages/_page/two/three.md'), true);
  assert.equal(isPartial('docs/guide/one_two.md'), false);
  assert.equal(isPartial('docs/guide.md'), false);
});

test('front matter turns into as many blank lines, and the rest stays', () => {
  const page = '---\ntitle: A\ndate: B\n---\n# Heading\n\n---\n\nEnd\n';
  assert.equal(blankFrontMatter(page), '\n\n\n\n# Heading\n\n---\n\nEnd\n');
  assert.equal(blankFrontMatter('---\r\ntitle: A\r\n---\r\nBody\r\n'), '\n\n\nBody\r\n');
});

test('a page with no front matter stays as it is, a rule further down included', () => {
  const page = '# Heading\n\n---\n\ntext: not front matter\n\n---\n';
  assert.equal(blankFrontMatter(page), page);
});

test('a failure keeps the line and the rule, and its reason stays on one short line', () => {
  const reason = `${'long '.repeat(40)}\nsecond line`;
  const failure = failureOf({ line: 7, ruleId: 'acorn', reason });
  assert.equal(failure.line, 7);
  assert.equal(failure.rule, 'acorn');
  assert.ok(!failure.reason.includes('\n'));
  assert.ok(failure.reason.length <= 120);
});

test('an error from outside the compiler still reads as a failure of its page', () => {
  assert.deepEqual(failureOf(new Error('disk\nmore')), { line: 0, rule: 'other', reason: 'disk' });
});

test('the regex opens a block written on one line', () => {
  const page = '<details><summary>Title</summary>\nBody\n</details>\n';
  assert.equal(page.replace(DETAILS_BLOCK, DETAILS_FIX), '<details>\n\n<summary>Title</summary>\n\nBody\n</details>\n');
});

test('the regex opens a block written on two lines, and keeps its indent and attributes', () => {
  const page = '  <details open>\n  <summary>Title</summary>\n  Body\n';
  assert.equal(page.replace(DETAILS_BLOCK, DETAILS_FIX), '  <details open>\n\n  <summary>Title</summary>\n\n  Body\n');
});

test('the regex leaves a block alone that has its blank line, and a summary of several lines', () => {
  const spaced = '<details>\n\n<summary>Title</summary>\n\nBody\n';
  const several = '<details>\n<summary>\nTitle\n</summary>\n';
  assert.equal(spaced.replace(DETAILS_BLOCK, DETAILS_FIX), spaced);
  assert.equal(several.replace(DETAILS_BLOCK, DETAILS_FIX), several);
});

// The command

test('--help lists every flag and reads nothing', (t) => {
  const { status, stdout } = run(tempFolder(t), { flags: ['--help'] });
  assert.equal(status, EXIT_CLEAN);
  for (const flag of ['--root', '--packages', '--strict', '--help']) assert.ok(stdout.includes(`\n  ${flag} `), flag);
});

test('an unknown flag is refused with the usage', (t) => {
  const { status, stderr } = run(tempFolder(t), { flags: ['--nope'] });
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /mdx-check: refused/);
  assert.match(stderr, /Usage: node shared\/scripts\/mdx-check\.mjs/);
});

test('a site with no pages is refused, never clean', (t) => {
  const { status, stderr } = runOn(t, { 'README.md': CLEAN_PAGE });
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /no pages to read in docs, blog, src\/pages/);
});

test('a site with no packages is refused and says how to give it some', (t) => {
  const site = makeSite(t, { 'docs/a.md': CLEAN_PAGE, 'package.json': '{}\n' });
  const { status, stderr } = run(site, { packages: site });
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /no @docusaurus\/mdx-loader to compile with/);
  assert.match(stderr, /--packages <folder>/);
});

test('each missing package is refused by name', (t) => {
  const site = makeSite(t, { 'docs/a.md': CLEAN_PAGE });
  for (const [name, folder] of Object.entries(REQUIRED_PACKAGES)) {
    const packages = makePackages(t);
    fs.rmSync(path.join(packages, folder), { recursive: true });
    const { status, stderr } = run(site, { packages });
    assert.equal(status, EXIT_REFUSED, name);
    assert.ok(stderr.includes(`no ${name} to compile with`), name);
  }
});

test('--strict needs no comment plugin, because it reads with comments off', (t) => {
  const packages = makePackages(t);
  fs.rmSync(path.join(packages, REQUIRED_PACKAGES['@slorber/remark-comment']), { recursive: true });
  const { status } = run(makeSite(t, { 'docs/a.md': CLEAN_PAGE }), { packages, flags: ['--strict'] });
  assert.equal(status, EXIT_CLEAN);
});

test('a site that compiles is clean, and the count is every file read', (t) => {
  const { status, stdout } = runOn(t, { 'docs/a.md': CLEAN_PAGE, 'blog/b.mdx': CLEAN_PAGE });
  assert.equal(status, EXIT_CLEAN);
  assert.match(stdout, /mdx-check: clean, 2 files read\./);
});

test('a page that fails gives its place, rule and reason, and exit 1', (t) => {
  const { status, stderr } = runOn(t, { 'docs/a.md': CLEAN_PAGE, 'docs/b.md': BROKEN_PAGE });
  assert.equal(status, EXIT_FOUND);
  assert.match(stderr, /mdx-check: docs\/b\.md:3: stand-in-rule: broken here/);
  assert.match(stderr, /mdx-check: 1 page failing, 2 files read\./);
  assert.doesNotMatch(stderr, /docs\/a\.md/);
});

test('it reads docs, blog and src/pages, .md and .mdx, and nothing else', (t) => {
  const read = ['docs/a/b.md', 'blog/c/d.mdx', 'src/pages/e.md'];
  const skipped = ['src/components/f.md', 'static/g.md', 'docs/node_modules/h.md', 'docs/i.txt', 'README.md'];
  const files = Object.fromEntries([...read, ...skipped].map((file) => [file, BROKEN_PAGE]));
  const { status, stderr } = runOn(t, files);
  assert.equal(status, EXIT_FOUND);
  for (const file of read) assert.ok(stderr.includes(`${file}:3`), file);
  for (const file of skipped) assert.ok(!stderr.includes(file), file);
  assert.match(stderr, /3 pages failing, 3 files read/);
});

test('--root reads another folder from where it runs', (t) => {
  const site = makeSite(t, { 'docs/a.md': BROKEN_PAGE });
  const elsewhere = tempFolder(t);
  const flags = ['--root', path.relative(elsewhere, site)];
  const { status, stderr } = run(elsewhere, { packages: makePackages(t), flags });
  assert.equal(status, EXIT_FOUND);
  assert.match(stderr, /docs\/a\.md:3/);
});

test('front matter does not move the line a failure names', (t) => {
  const { stderr } = runOn(t, { 'docs/a.md': `---\ntitle: A\n---\n${BROKEN_PAGE}` });
  assert.match(stderr, /docs\/a\.md:6:/);
});

test('front matter is not compiled', (t) => {
  assert.equal(runOn(t, { 'docs/a.md': `---\ntitle: BROKEN\n---\n${CLEAN_PAGE}` }).status, EXIT_CLEAN);
});

test('a partial that fails is listed and leaves the exit code alone', (t) => {
  const { status, stdout } = runOn(t, { 'docs/a.md': CLEAN_PAGE, 'docs/_Partials/b.md': BROKEN_PAGE });
  assert.equal(status, EXIT_CLEAN);
  assert.match(stdout, /docs\/_Partials\/b\.md:3: stand-in-rule/);
  assert.match(stdout, /1 hit in partials above: each counts only if a page imports that file\./);
  assert.match(stdout, /mdx-check: clean, 2 files read\./);
});

test('the pages that count end the output, after the partials', (t) => {
  const { status, stderr } = runOn(t, { 'docs/z/_b.md': BROKEN_PAGE, 'docs/a.md': BROKEN_PAGE });
  assert.equal(status, EXIT_FOUND);
  assert.ok(stderr.indexOf('docs/z/_b.md') < stderr.indexOf('docs/a.md'));
  assert.match(stderr, /1 page failing/);
});

test('a comment fails with --strict and compiles without it', (t) => {
  const files = { 'docs/a.md': '<!-- a note -->\n' };
  assert.equal(runOn(t, files).status, EXIT_CLEAN);
  const { status, stderr } = runOn(t, files, ['--strict']);
  assert.equal(status, EXIT_FOUND);
  assert.match(stderr, /docs\/a\.md:1: unexpected-character/);
  assert.match(stderr, /write \{\/\* truncate \*\/\} for <!-- truncate -->/, 'the hit names the fix');
});

test('a legacy title is a hit with --strict, line by line, on one page', (t) => {
  const page = ':::note A title\n\nBody\n\n:::\n\n:::tip Another\n\n:::\n';
  const { status, stderr } = runOn(t, { 'docs/a.md': page }, ['--strict']);
  assert.equal(status, EXIT_FOUND);
  assert.match(stderr, /docs\/a\.md:1: admonition-title: prints as plain text/);
  assert.match(stderr, /docs\/a\.md:7: admonition-title/);
  assert.match(stderr, /1 page failing/);
});

test('a legacy title is no hit today, and a title in brackets and a bare fence never are', (t) => {
  assert.equal(runOn(t, { 'docs/a.md': ':::note A title\n\n:::\n' }).status, EXIT_CLEAN);
  const fine = { 'docs/a.md': ':::note[A title]\n\nBody\n\n:::\n\n:::note\n\n:::\n\n::: words\n' };
  assert.equal(runOn(t, fine, ['--strict']).status, EXIT_CLEAN);
});

test('a page that fails to compile gives that failure and no legacy titles', (t) => {
  const { stderr } = runOn(t, { 'docs/a.md': `:::note A title\n\n${BROKEN_PAGE}` }, ['--strict']);
  assert.match(stderr, /stand-in-rule/);
  assert.doesNotMatch(stderr, /admonition-title/);
});

test('an end-tag failure on a <details> block points at the note', (t) => {
  const { stderr } = runOn(t, { 'docs/a.md': END_TAG_PAGE });
  assert.match(stderr, /1 page with a <details> block: see the one-regex note/);
});

test('the note stays out of another failure, and out of a partial', (t) => {
  const otherRule = runOn(t, { 'docs/a.md': `<details><summary>Title</summary>\n\n${BROKEN_PAGE}` });
  const noBlock = runOn(t, { 'docs/a.md': 'ENDTAG\n' });
  const partial = runOn(t, { 'docs/_a.md': END_TAG_PAGE });
  for (const { output } of [otherRule, noBlock, partial]) assert.ok(!output.includes(NOTE_POINTER), output);
});

test('it changes no file of the site', (t) => {
  const site = makeSite(t, { 'docs/a.md': BROKEN_PAGE, 'blog/b.md': END_TAG_PAGE, 'docs/c.md': ':::note A\n\n:::\n' });
  const before = snapshot(site);
  run(site, { packages: makePackages(t), flags: ['--strict'] });
  assert.deepEqual(snapshot(site), before);
});

test('with no --packages it uses the site around the script', (t) => {
  const site = makeSite(t, { ...STAND_IN, 'docs/a.md': BROKEN_PAGE });
  const mounted = (source) => !NOT_MOUNTED.has(path.basename(source));
  fs.cpSync(SHARED_ROOT, path.join(site, 'shared'), { recursive: true, filter: mounted });
  const { status, stderr } = run(site, { script: path.join(site, MOUNTED_SCRIPT) });
  assert.equal(status, EXIT_FOUND);
  assert.match(stderr, /docs\/a\.md:3/);
});

// The real MDX, from the packages of the site around this folder

const host = hostSite(SHARED_ROOT.replace(/\/$/, ''));
const realMdx = { skip: host === null ? 'needs a site, for its packages' : false };

/** A run of a throwaway site on the host site's real MDX. */
function realRun(t, files, flags = []) {
  return run(makeSite(t, files), { packages: host, flags });
}

test('real MDX: a page with maths, a directive and a table is clean', realMdx, (t) => {
  const page = '# A\n\n$a<b$ and $$y$$\n\n:::note[Title]\n\nBody\n\n:::\n\n| a |\n|---|\n| b |\n';
  assert.equal(realRun(t, { 'docs/a.md': `---\ntitle: A\n---\n${page}` }).status, EXIT_CLEAN);
});

test('real MDX: a one-line <details> fails at end-tag-mismatch, and the regex clears it', realMdx, (t) => {
  const page = '<details><summary>Title</summary>\n\nBody\n\n</details>\n';
  const { status, stderr } = realRun(t, { 'docs/a.md': page });
  assert.equal(status, EXIT_FOUND);
  assert.match(stderr, /end-tag-mismatch/);
  assert.match(stderr, /one-regex note/);
  assert.equal(realRun(t, { 'docs/a.md': page.replace(DETAILS_BLOCK, DETAILS_FIX) }).status, EXIT_CLEAN);
});

test('real MDX: the truncate comment and a heading id compile today and fail with --strict', realMdx, (t) => {
  const files = { 'docs/a.md': 'Intro\n\n<!--truncate-->\n\nBody\n', 'docs/b.md': '## Heading {#the-id}\n' };
  assert.equal(realRun(t, files).status, EXIT_CLEAN);
  const { status, stderr } = realRun(t, files, ['--strict']);
  assert.equal(status, EXIT_FOUND);
  assert.match(stderr, /docs\/a\.md:3: unexpected-character/);
  assert.match(stderr, /docs\/b\.md:1: acorn/);
});

test('real MDX: a legacy title is a hit with --strict, and not inside a code fence', realMdx, (t) => {
  const page = '```md\n:::note In a fence\n\n:::\n```\n\n:::note A title\n\nBody\n\n:::\n';
  assert.equal(realRun(t, { 'docs/a.md': page }).status, EXIT_CLEAN);
  const { status, stderr } = realRun(t, { 'docs/a.md': page }, ['--strict']);
  assert.equal(status, EXIT_FOUND);
  assert.match(stderr, /docs\/a\.md:7: admonition-title/);
  assert.doesNotMatch(stderr, /docs\/a\.md:2:/);
});

test('real MDX: a keyword of one site\'s own is no hit today, and is one with --strict', realMdx, (t) => {
  const files = { 'docs/a.md': ':::mine A title\n\nBody\n\n:::\n' };
  assert.equal(realRun(t, files).status, EXIT_CLEAN);
  assert.equal(realRun(t, files, ['--strict']).status, EXIT_FOUND);
});

test('real MDX: a dropdown the preprocessor rewrites compiles', realMdx, (t) => {
  const page = 'Words <DropDownIC title="code">\n\n```js\nconst a = 1;\n```\n\n</DropDownIC> and more.\n';
  assert.equal(realRun(t, { 'docs/a.md': page }).status, EXIT_CLEAN);
});
