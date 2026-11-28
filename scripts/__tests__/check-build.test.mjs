/**
 * scripts/__tests__/check-build.test.mjs: tests for check-build.mjs. From a site:
 *   node --test shared/scripts/__tests__/check-build.test.mjs
 *
 * The rules are tested as functions, on markup as a site's React writes it for KaTeX and for BibRef.
 * Every exit code and message is tested by running the real command on a throwaway build in the
 * system's temp folder. The last group renders maths with the site's own remark-math, rehype-katex and
 * katexOptions(), through React, as a build does, and reads what the check finds there: it needs those
 * packages, so it runs in a site and skips in the hub, saying so. BibRef's own render test
 * (components/BibRef/__tests__/render.test.mjs) holds the mark of a citation its bibliography lacks.
 *
 * How to change it: add a case beside the rule it covers. A new kind needs its markup in SAMPLES and a
 * real render: in the last group for maths, or in the piece's own render test.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUILD_FOLDER } from '../lib/bumpSettings.mjs';
import {
  ERROR_CLASS,
  ERROR_COLOR,
  EXIT_CLEAN,
  EXIT_FOUND,
  EXIT_REFUSED,
  KINDS,
  MISSING_CITATION,
  addressOf,
  failuresIn,
  isErrorColour,
  pageLines,
  unescaped,
} from '../check-build.mjs';

const require = createRequire(import.meta.url);
const SCRIPT = fileURLToPath(new URL('../check-build.mjs', import.meta.url));
const SHARED_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const WIRING = '../../wiring/index.cjs';

/** KaTeX's message for $\frac{1}{$, as KaTeX 0.16 words it. */
const MESSAGE = "ParseError: KaTeX parse error: Unexpected end of input in a macro argument, expected '}' at end of input: \\frac{1}{";

/** Markup as a site's build holds it: React writes KaTeX's spans and BibRef's this way. */
const SAMPLES = Object.freeze({
  formula: `<span class="katex-error" title="${MESSAGE.replaceAll("'", '&#x27;')}" style="color:#cc0000">\\frac{1}{</span>`,
  command: '<span class="katex"><span class="katex-html" aria-hidden="true"><span class="base">'
    + '<span class="mord text" style="color:#cc0000"><span class="mord" style="color:#cc0000">\\notAMacro</span></span>'
    + '<span class="mord"><span class="mord mathnormal">x</span></span></span></span></span>',
  citation: MISSING_CITATION,
});

/** A formula KaTeX drew, with its MathML, as a page holds it. */
const GOOD_FORMULA = '<span class="katex"><span class="katex-mathml"><math xmlns="http://www.w3.org/1998/Math/MathML">'
  + '<semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">x^2</annotation>'
  + '</semantics></math></span><span class="katex-html" aria-hidden="true"><span class="base">'
  + '<span class="strut" style="height:0.8141em"></span><span class="mord"><span class="mord mathnormal">x</span></span>'
  + '</span></span></span>';

/** Maths that colours a part KaTeX's red on purpose: \color{#cc0000}{x} and \textcolor{#cc0000}{\text{a}}. */
const RED_ON_PURPOSE = [
  '<span class="mord" style="color:#cc0000"><span class="mord mathnormal" style="color:#cc0000">x</span></span>',
  '<span class="mord text" style="color:#cc0000"><span class="mord" style="color:#cc0000">a</span></span>',
];

const page = (body) => `<!doctype html><html><head><title>A page</title></head><body><main>${body}</main></body></html>`;
const CLEAN_PAGE = page(`<p>Some words and ${GOOD_FORMULA}.</p>`);

function tempFolder(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-build-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, relativePath, contents) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

/** A temp site whose build/ holds `files`, each a path below build/ and its text. */
function makeSite(t, files) {
  const root = tempFolder(t);
  fs.mkdirSync(path.join(root, BUILD_FOLDER));
  for (const [relativePath, contents] of Object.entries(files)) write(root, path.join(BUILD_FOLDER, relativePath), contents);
  return root;
}

function run(root, { flags = [], cwd = root } = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...flags], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The lines a run printed, without the last newline. */
const linesOf = (text) => text.trimEnd().split('\n');

// The rules

test('the exit codes are 0, 1 and 2', () => {
  assert.deepEqual([EXIT_CLEAN, EXIT_FOUND, EXIT_REFUSED], [0, 1, 2]);
});

test("KaTeX's red and its error class are its defaults, which katexOptions() keeps", () => {
  assert.equal(ERROR_COLOR, '#cc0000');
  assert.equal(ERROR_CLASS, 'katex-error');
  const options = require(WIRING).katexOptions();
  assert.equal(Object.hasOwn(options, 'errorColor'), false, 'katexOptions() sets an errorColor: ERROR_COLOR must follow it');
});

test("a formula KaTeX could not read is found once, with KaTeX's message read back", () => {
  assert.deepEqual(failuresIn(page(SAMPLES.formula)), [{ kind: 'formula', detail: MESSAGE }]);
});

test("a command KaTeX does not know is found once by its name, though two spans hold KaTeX's red", () => {
  assert.deepEqual(failuresIn(page(SAMPLES.command)), [{ kind: 'command', detail: '\\notAMacro' }]);
});

test('a citation bibliography.js lacks is found each time it stands', () => {
  const citation = { kind: 'citation', detail: null };
  assert.deepEqual(failuresIn(page(`${SAMPLES.citation} and ${SAMPLES.citation}`)), [citation, citation]);
});

test('every kind on one page is found', () => {
  const kinds = failuresIn(page(Object.values(SAMPLES).join('\n'))).map(({ kind }) => kind);
  assert.deepEqual(kinds, ['formula', 'command', 'citation']);
  assert.deepEqual(Object.keys(KINDS), ['formula', 'command', 'citation']);
});

test("maths that colours a part KaTeX's red on purpose passes: only a command's name in that red counts", () => {
  for (const markup of RED_ON_PURPOSE) assert.deepEqual(failuresIn(page(markup)), [], markup);
  assert.deepEqual(failuresIn(page('<span class="mord" style="color:#cc0000">\\</span>')), [], 'a backslash alone is no name');
});

test('a background or a border in that red is no failure, nor another red', () => {
  for (const style of ['background-color:#cc0000', 'border-color:#cc0000', 'color:#c00', 'color:#cc00001', 'color:red']) {
    assert.deepEqual(failuresIn(page(`<span style="${style}">\\notAMacro</span>`)), [], style);
  }
});

test("KaTeX's red is read in any spelling of the declaration, beside others", () => {
  for (const style of ['color:#cc0000', 'color: #CC0000;', 'margin-right:0.05em;color:#cc0000', ' COLOR : #cc0000 ; top:0']) {
    assert.deepEqual(failuresIn(page(`<span class="mord" style="${style}">\\notAMacro</span>`)), [{ kind: 'command', detail: '\\notAMacro' }], style);
  }
});

test('the error class counts only as a whole class, among others in any order', () => {
  assert.equal(failuresIn(page('<span class="katex-error extra" title="t">x</span>'))[0]?.kind, 'formula');
  assert.equal(failuresIn(page('<span title="t" class="other katex-error">x</span>'))[0]?.kind, 'formula');
  for (const name of ['my-katex-error', 'katex-errors', 'katex']) assert.deepEqual(failuresIn(page(`<span class="${name}" title="t">x</span>`)), [], name);
});

test('words about the marks are no failure, in prose or in code', () => {
  const words = [
    '<p>BibRef prints <code>ITEM NOT FOUND</code> on red.</p>',
    '<p>A class of <code>katex-error</code>, a colour of <code>color:#cc0000</code>.</p>',
    '<pre><code><span class="token plain">ITEM NOT FOUND</span></code></pre>',
    '<span class="token plain">&lt;span class=&quot;katex-error&quot;&gt;</span>',
  ];
  assert.deepEqual(failuresIn(page(words.join('\n'))), []);
  assert.deepEqual(failuresIn(CLEAN_PAGE), []);
});

test('unescaped reads back what React escapes', () => {
  assert.equal(unescaped('&amp;&lt;&gt;&quot;&#x27;&#39;&apos; &#x332;&AMP;'), "&<>\"''' \u0332&");
  assert.equal(unescaped('&amp;lt;'), '&lt;', 'one pass, as a browser reads it');
  assert.equal(unescaped('no reference & none; &nbsp; stays'), 'no reference & none; &nbsp; stays');
  assert.equal(unescaped('&#x110000; &#99999999; &#x10FFFF;'), '&#x110000; &#99999999; \u{10FFFF}', 'past the last code point it stays');
});

test('isErrorColour reads the colour declaration alone', () => {
  assert.equal(isErrorColour('color:#cc0000'), true);
  assert.equal(isErrorColour('background-color:#cc0000'), false);
  assert.equal(isErrorColour(''), false);
  assert.equal(isErrorColour('color'), false);
});

test("a built file's address is the page's path on the site", () => {
  assert.equal(addressOf('index.html'), '/');
  assert.equal(addressOf(path.join('docs', 'a', 'index.html')), '/docs/a');
  assert.equal(addressOf(path.join('docs', 'b.html')), '/docs/b');
  assert.equal(addressOf('404.html'), '/404');
  assert.equal(addressOf(path.join('docs', 'index.html', 'index.html')), '/docs/index.html');
});

test("a page prints a line for each formula, one for its commands with their counts, one for its citations", () => {
  const failures = [
    { kind: 'command', detail: '\\a' },
    { kind: 'formula', detail: 'one' },
    { kind: 'citation', detail: null },
    { kind: 'command', detail: '\\b' },
    { kind: 'command', detail: '\\a' },
    { kind: 'formula', detail: 'two' },
    { kind: 'citation', detail: null },
  ];
  assert.deepEqual(pageLines('/p', failures), [
    '/p: a formula KaTeX could not read: one',
    '/p: a formula KaTeX could not read: two',
    '/p: commands KaTeX does not know: \\a (2 times), \\b',
    '/p: 2 citations bibliography.js lacks',
  ]);
  assert.deepEqual(pageLines('/p', [{ kind: 'command', detail: '\\a' }, { kind: 'command', detail: '\\a' }]), [
    '/p: a command KaTeX does not know: \\a (2 times)',
  ]);
  assert.deepEqual(pageLines('/p', [{ kind: 'citation', detail: null }]), ['/p: a citation bibliography.js lacks']);
});

// The command

test('a clean build exits 0 and says how many pages it read', (t) => {
  const root = makeSite(t, { 'index.html': CLEAN_PAGE, 'docs/a/index.html': CLEAN_PAGE });
  const { status, stdout, stderr } = run(root);
  assert.equal(status, EXIT_CLEAN, stderr);
  assert.equal(stdout, 'check-build: clean, 2 pages in build/\n');
  assert.equal(stderr, '');
});

test('one page reads as one', (t) => {
  const root = makeSite(t, { 'index.html': CLEAN_PAGE });
  assert.equal(run(root).stdout, 'check-build: clean, 1 page in build/\n');
});

test("a page that shows each kind exits 1, and names the page, the kind and what KaTeX printed", (t) => {
  const root = makeSite(t, { 'index.html': CLEAN_PAGE, 'docs/a/index.html': page(Object.values(SAMPLES).join('\n')) });
  const { status, stdout, stderr } = run(root);
  assert.equal(status, EXIT_FOUND, stderr);
  assert.equal(stdout, '');
  assert.deepEqual(linesOf(stderr), [
    `check-build: /docs/a: a formula KaTeX could not read: ${MESSAGE}`,
    'check-build: /docs/a: a command KaTeX does not know: \\notAMacro',
    'check-build: /docs/a: a citation bibliography.js lacks',
    "check-build: 1 page of 2 in build/ shows a failure. The kinds are in this script's header.",
  ]);
});

test('every page is read at any depth, in order, and a file that is not a page is not', (t) => {
  const root = makeSite(t, {
    'b/index.html': page(SAMPLES.citation),
    'a/deep/er.html': page(SAMPLES.command),
    'index.html': CLEAN_PAGE,
    'assets/js/main.js': `const html = '${SAMPLES.citation}';`,
    'notes.txt': SAMPLES.citation,
  });
  const { status, stderr } = run(root);
  assert.equal(status, EXIT_FOUND, stderr);
  assert.deepEqual(linesOf(stderr), [
    'check-build: /a/deep/er: a command KaTeX does not know: \\notAMacro',
    'check-build: /b: a citation bibliography.js lacks',
    "check-build: 2 pages of 3 in build/ show a failure. The kinds are in this script's header.",
  ]);
});

test('a link under build/ is not followed', (t) => {
  const root = makeSite(t, { 'index.html': CLEAN_PAGE });
  const elsewhere = tempFolder(t);
  write(elsewhere, 'x.html', page(SAMPLES.citation));
  fs.symlinkSync(elsewhere, path.join(root, BUILD_FOLDER, 'linked'));
  fs.symlinkSync(path.join(elsewhere, 'x.html'), path.join(root, BUILD_FOLDER, 'y.html'));
  const { status, stdout } = run(root);
  assert.equal(status, EXIT_CLEAN, stdout);
  assert.equal(stdout, 'check-build: clean, 1 page in build/\n');
});

test('--report-only lists the same pages and exits 0, saying so', (t) => {
  const root = makeSite(t, { 'docs/a/index.html': page(SAMPLES.citation) });
  const { status, stdout, stderr } = run(root, { flags: ['--report-only'] });
  assert.equal(status, EXIT_CLEAN, stderr);
  assert.equal(stdout, '');
  assert.deepEqual(linesOf(stderr), [
    'check-build: /docs/a: a citation bibliography.js lacks',
    "check-build: 1 page of 1 in build/ shows a failure. The kinds are in this script's header.",
    'check-build: --report-only, so the exit is 0 all the same.',
  ]);
});

test('--report-only on a clean build reads as clean', (t) => {
  const root = makeSite(t, { 'index.html': CLEAN_PAGE });
  const { status, stdout, stderr } = run(root, { flags: ['--report-only'] });
  assert.equal(status, EXIT_CLEAN, stderr);
  assert.equal(stdout, 'check-build: clean, 1 page in build/\n');
});

test('--root reads that folder from anywhere', (t) => {
  const root = makeSite(t, { 'index.html': page(SAMPLES.formula) });
  const { status } = run(root, { flags: ['--root', root], cwd: os.tmpdir() });
  assert.equal(status, EXIT_FOUND);
});

test('--help lists the flags, exits 0 and reads nothing', (t) => {
  const { status, stdout } = run(tempFolder(t), { flags: ['--help'] });
  assert.equal(status, EXIT_CLEAN);
  for (const flag of ['--root', '--report-only', '--help']) assert.ok(stdout.includes(flag), flag);
});

// A check that could not run is never a pass

test('a folder with no build/ refuses, and says to build first', (t) => {
  const root = tempFolder(t);
  const { status, stdout, stderr } = run(root);
  assert.equal(status, EXIT_REFUSED);
  assert.equal(stdout, '');
  assert.equal(stderr, `check-build: refused: no build/ in ${path.basename(root)}: build the site, then run this\n`);
});

test('a build/ that is a file refuses', (t) => {
  const root = tempFolder(t);
  write(root, BUILD_FOLDER, CLEAN_PAGE);
  const { status, stderr } = run(root);
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /^check-build: refused: no build\/ in /);
});

test('a build with no page refuses', (t) => {
  const root = makeSite(t, { 'assets/js/main.js': 'const a = 1;', 'index.htm': CLEAN_PAGE });
  const { status, stderr } = run(root);
  assert.equal(status, EXIT_REFUSED);
  assert.equal(stderr, 'check-build: refused: build/ holds no page\n');
});

test('--report-only never turns a refusal into a pass', (t) => {
  const { status, stderr } = run(tempFolder(t), { flags: ['--report-only'] });
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /^check-build: refused: no build\/ in /);
});

test('a folder that does not exist refuses', (t) => {
  const { status, stderr } = run(tempFolder(t), { flags: ['--root', path.join(os.tmpdir(), 'check-build-no-such-folder')] });
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /^check-build: refused: no build\/ in check-build-no-such-folder: /);
});

test('a flag it does not know refuses, and so does a stray word', (t) => {
  const root = makeSite(t, { 'index.html': CLEAN_PAGE });
  for (const flags of [['--nope'], ['build'], ['--root'], ['--report-only=yes']]) {
    const { status, stderr } = run(root, { flags });
    assert.equal(status, EXIT_REFUSED, flags.join(' '));
    assert.match(stderr, /^check-build: refused: /, flags.join(' '));
  }
});

test('the shared tree holds no build, so run there it refuses', () => {
  const { status, stderr } = run(SHARED_ROOT);
  assert.equal(status, EXIT_REFUSED, stderr);
  assert.match(stderr, /^check-build: refused: no build\/ in /);
});

// Real maths, rendered with the site's own packages as its build renders a page

/** The site's MDX, maths and React, or null where they are not installed, as in the hub. */
async function sitePackages() {
  try {
    const [mdx, math, katex, runtime, react, server] = await Promise.all([
      import('@mdx-js/mdx'), import('remark-math'), import('rehype-katex'), import('react/jsx-runtime'), import('react'),
      import('react-dom/server'),
    ]);
    return { evaluate: mdx.evaluate, remarkMath: math.default, rehypeKatex: katex.default, runtime, react, server };
  } catch {
    return null;
  }
}

const packages = await sitePackages();
const OUTSIDE_A_SITE = packages ? false : 'outside a site: no remark-math, rehype-katex, MDX or React to render with';

/** A page of MDX, as a build draws it: remark-math, rehype-katex with katexOptions(), then React. */
async function drawn(source) {
  const { katexOptions } = require(WIRING);
  const { default: Content } = await packages.evaluate(source, {
    ...packages.runtime,
    Fragment: packages.react.Fragment,
    remarkPlugins: [packages.remarkMath],
    rehypePlugins: [[packages.rehypeKatex, katexOptions()]],
  });
  return packages.server.renderToStaticMarkup(packages.react.createElement(Content));
}

test("real maths: a formula KaTeX could not read is found, with KaTeX's message", { skip: OUTSIDE_A_SITE }, async () => {
  const failures = failuresIn(await drawn('A sum $\\frac{1}{$ here.'));
  assert.deepEqual(failures.map(({ kind }) => kind), ['formula']);
  assert.match(failures[0].detail, /^ParseError: KaTeX parse error: .* \\frac\{1\}\{$/);
});

test('real maths: a command KaTeX does not know is found by its name, inline and on its own line', { skip: OUTSIDE_A_SITE }, async () => {
  assert.deepEqual(failuresIn(await drawn('A sum $\\notAMacro{x} + 1$ here.')), [{ kind: 'command', detail: '\\notAMacro' }]);
  const display = failuresIn(await drawn('$$\n\\notAMacro{x} + \\alsoMissing\n$$\n'));
  assert.deepEqual(display.map(({ detail }) => detail), ['\\notAMacro', '\\alsoMissing']);
  assert.deepEqual(failuresIn(await drawn('$\\text{\\notAMacro}$')), [{ kind: 'command', detail: '\\notAMacro' }]);
});

test("real maths: a command the trust of katexOptions() leaves out is found too", { skip: OUTSIDE_A_SITE }, async (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(failuresIn(await drawn('$\\htmlClass{a}{x}$')), [{ kind: 'command', detail: '\\htmlClass' }]);
});

test("real maths: a site macro, a trusted \\href and red on purpose all pass", { skip: OUTSIDE_A_SITE }, async () => {
  const html = await drawn('$\\R^2$, $\\href{https://example.com}{x}$, $\\color{#cc0000}{x}$ and $\\textcolor{#cc0000}{\\text{a}}$.');
  assert.match(html, /class="katex"/);
  assert.deepEqual(failuresIn(html), []);
});
