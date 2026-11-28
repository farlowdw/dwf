/**
 * scripts/check-build.mjs: no page of a site's build shows maths that KaTeX could not draw, or a
 * citation that the site's bibliography lacks. Each shows on the page, in red, while the build exits 0,
 * and rehype-katex's warning never reaches the build's log, so this reads the built pages themselves.
 *
 * It lists each page under build/ that holds one of these:
 *   1. a formula KaTeX could not read, such as $\frac{1}{$: rehype-katex draws it as a span of class
 *      katex-error, and the span's title holds KaTeX's message;
 *   2. a command KaTeX does not know, such as a macro missing from the config, or a command the trust of
 *      katexOptions() leaves out: an ordinary formula holds the command's name in KaTeX's error colour,
 *      #cc0000, and no element has the katex-error class;
 *   3. a citation of an id that bibliography.js lacks: BibRef draws ITEM NOT FOUND on red.
 * A span in that red whose text is not a command's name is left alone, so maths that colours a part
 * #cc0000 on purpose passes.
 *
 * It reads only what the HTML holds, so three failures stay out of it:
 *   maths in a BibRef tooltip, which the page draws only on hover;
 *   a % in a formula, which KaTeX reads as a comment: the rest of the formula is gone, with no mark;
 *   a colour's name spelled wrong, such as \color{rde}{x}: KaTeX writes it out and the browser ignores it.
 * A partial that no page imports is never built, so this check cannot see it either. And it reads what
 * build/ holds now: run it after the build, never on its own before one.
 *
 * Run it from the site's top folder, after the build:
 *   node shared/scripts/check-build.mjs
 *   node --test shared/scripts/__tests__/check-build.test.mjs
 *
 * Exit codes: 0 clean, 1 a page shows a failure, 2 refused because the check could not run: no build/, or
 * one with no page in it. A check that could not run is never a pass. With --report-only the pages are
 * listed and the exit is 0, for a site whose pages wait for a fix; a refusal still exits 2.
 *
 * Flags:
 *   --root <folder>   the site's top folder, if it is not the current folder
 *   --report-only     list the pages, and exit 0 even when a page shows a failure
 *   --help            print the flags and stop
 *
 * How to change it:
 *   another sign of a piece that failed to draw: a kind in KINDS, found in failuresIn, with a test that
 *     renders the real piece. The maths are rendered in this script's test, and BibRef in its own
 *   KaTeX's error colour: ERROR_COLOR. katexOptions() in wiring/index.cjs sets no errorColor, so a site's
 *     red is KaTeX's default
 *   what counts as a command's name: COMMAND_NAME
 *   which files it reads: PAGE_ENDING. The folder, BUILD_FOLDER, is the one shared:bump and shared:all
 *     build into, in lib/bumpSettings.mjs
 * It is published, so it names no site and no page of one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { BUILD_FOLDER } from './lib/bumpSettings.mjs';
import { counted } from './lib/phrases.mjs';

export const EXIT_CLEAN = 0;
export const EXIT_FOUND = 1;
export const EXIT_REFUSED = 2;

/** Each message starts with this, so a line in a long build log says where it came from. */
const LABEL = 'check-build';

const REPORT_ONLY_FLAG = '--report-only';

const USAGE = `Usage: node shared/scripts/check-build.mjs [--root <folder>] [${REPORT_ONLY_FLAG}], after the build
  --root <folder>   the site's top folder, if it is not the current folder
  ${REPORT_ONLY_FLAG}     list the pages, and exit 0 even when a page shows a failure
  --help            print this and stop`;

/** The files it reads: every page under BUILD_FOLDER, at any depth. */
const PAGE_ENDING = '.html';

/** A page's own file in its folder: docs/a/index.html is the page /docs/a. */
const INDEX_PAGE = 'index.html';

/** KaTeX's default errorColor, which every site's maths uses: katexOptions() sets no other. */
export const ERROR_COLOR = '#cc0000';

/** The class KaTeX gives a formula it could not read, and rehype-katex a formula that failed in another way. */
export const ERROR_CLASS = 'katex-error';

/** The text KaTeX writes in its error colour for a command it does not know: the command's name, backslash first. */
const COMMAND_NAME = /^\\[A-Za-z]/;

/** What BibRef draws for an id its bibliography lacks, as the site's React writes it. */
export const MISSING_CITATION = '<span style="background-color:red">ITEM NOT FOUND</span>';

/** The three kinds, each as one failure and as several. */
export const KINDS = Object.freeze({
  formula: { one: 'a formula KaTeX could not read', many: 'formulas KaTeX could not read' },
  command: { one: 'a command KaTeX does not know', many: 'commands KaTeX does not know' },
  citation: { one: 'a citation bibliography.js lacks', many: 'citations bibliography.js lacks' },
});

/**
 * An opening span, its attributes and the text right after it. React writes every value between double
 * quotes, with > and " escaped, so neither ends a value early.
 */
const SPAN = /<span\b([^>]*)>([^<]*)/g;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/g;

/** A character reference React writes: &amp; &lt; &gt; &quot; and a number, such as &#x27; for '. */
const REFERENCE = /&(?:#x([\da-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi;
const NAMED_REFERENCES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });

/** The last code point there is. A reference past it stays as it was written. */
const LAST_CODE_POINT = 0x10ffff;

/** The check could not run. Never a pass. */
class Refusal extends Error {}

/** The options from the command line. */
function readOptions(argv) {
  try {
    const options = { root: { type: 'string' }, 'report-only': { type: 'boolean' }, help: { type: 'boolean' } };
    const { values } = parseArgs({ args: argv, options });
    return {
      root: path.resolve(values.root ?? process.cwd()),
      reportOnly: values['report-only'] === true,
      help: values.help === true,
    };
  } catch (error) {
    throw new Refusal(error.message);
  }
}

/** Text as React escaped it, read back. */
export function unescaped(text) {
  return text.replace(REFERENCE, (whole, hex, decimal, name) => {
    if (name) return NAMED_REFERENCES[name.toLowerCase()];
    const codePoint = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
    return codePoint <= LAST_CODE_POINT ? String.fromCodePoint(codePoint) : whole;
  });
}

/** True when a style attribute's value sets the text's colour to KaTeX's red. background-color is another property. */
export function isErrorColour(style) {
  return style.split(';').some((declaration) => {
    const colon = declaration.indexOf(':');
    if (colon === -1) return false;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    return property === 'color' && declaration.slice(colon + 1).trim().toLowerCase() === ERROR_COLOR;
  });
}

/** The attributes of one opening tag, by name. */
function attributesOf(text) {
  return Object.fromEntries([...text.matchAll(ATTRIBUTE)].map(([, name, value]) => [name, value]));
}

/** How often `part` stands in `text`. */
function timesIn(text, part) {
  return text.split(part).length - 1;
}

/**
 * Every failure one page holds, as { kind, detail }, where kind is a key of KINDS: KaTeX's message for a
 * formula it could not read, the name of a command it does not know, and null for a citation, whose id
 * the page does not hold.
 */
export function failuresIn(html) {
  const found = [];
  for (const [, attributes, text] of html.matchAll(SPAN)) {
    const { class: classes = '', style = '', title = '' } = attributesOf(attributes);
    if (classes.split(/\s+/).includes(ERROR_CLASS)) {
      found.push({ kind: 'formula', detail: unescaped(title) });
    } else if (isErrorColour(style) && COMMAND_NAME.test(text)) {
      found.push({ kind: 'command', detail: unescaped(text).trim() });
    }
  }
  const citations = timesIn(html, MISSING_CITATION);
  return [...found, ...Array.from({ length: citations }, () => ({ kind: 'citation', detail: null }))];
}

/** A built file's address on the site: docs/a/index.html is /docs/a, index.html is /, docs/b.html is /docs/b. */
export function addressOf(file) {
  const posix = file.split(path.sep).join('/');
  if (posix === INDEX_PAGE) return '/';
  const end = posix.endsWith(`/${INDEX_PAGE}`) ? -(INDEX_PAGE.length + 1) : -PAGE_ENDING.length;
  return `/${posix.slice(0, end)}`;
}

/** "\a, \b (3 times)": each name once, in the order it first stands, with how often it does when more than once. */
function namesWithCounts(details) {
  const counts = new Map();
  for (const detail of details) counts.set(detail, (counts.get(detail) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count === 1 ? name : `${name} (${count} times)`)).join(', ');
}

/** The lines one page prints: one for each formula KaTeX could not read, one for its commands, one for its citations. */
export function pageLines(address, failures) {
  const of = (kind) => failures.filter((failure) => failure.kind === kind).map(({ detail }) => detail);
  const formulas = of('formula').map((message) => `${address}: ${KINDS.formula.one}: ${message}`);
  const commands = of('command');
  const citations = of('citation').length;
  const lines = [...formulas];
  if (commands.length > 0) {
    const kind = new Set(commands).size === 1 ? KINDS.command.one : KINDS.command.many;
    lines.push(`${address}: ${kind}: ${namesWithCounts(commands)}`);
  }
  if (citations === 1) lines.push(`${address}: ${KINDS.citation.one}`);
  if (citations > 1) lines.push(`${address}: ${citations} ${KINDS.citation.many}`);
  return lines;
}

/** Every page under a folder, as paths from it, sorted. A link is not followed. */
function pagesIn(folder, inner = '') {
  const entries = fs.readdirSync(path.join(folder, inner), { withFileTypes: true });
  const pages = entries.flatMap((entry) => {
    const file = path.join(inner, entry.name);
    if (entry.isDirectory()) return pagesIn(folder, file);
    return entry.isFile() && entry.name.endsWith(PAGE_ENDING) ? [file] : [];
  });
  return pages.sort();
}

/** Reads the build of the site at `root`. Returns { found, lines }, or throws a Refusal. */
function checkBuild(root) {
  const folder = path.join(root, BUILD_FOLDER);
  if (!fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Refusal(`no ${BUILD_FOLDER}/ in ${path.basename(root)}: build the site, then run this`);
  }
  const pages = pagesIn(folder);
  if (pages.length === 0) throw new Refusal(`${BUILD_FOLDER}/ holds no page`);

  const shown = pages
    .map((file) => ({ address: addressOf(file), failures: failuresIn(fs.readFileSync(path.join(folder, file), 'utf8')) }))
    .filter(({ failures }) => failures.length > 0);
  if (shown.length === 0) return { found: false, lines: [`${LABEL}: clean, ${counted(pages.length, 'page')} in ${BUILD_FOLDER}/`] };

  const lines = shown.flatMap(({ address, failures }) => pageLines(address, failures)).map((line) => `${LABEL}: ${line}`);
  const verb = shown.length === 1 ? 'shows' : 'show';
  lines.push(`${LABEL}: ${counted(shown.length, 'page')} of ${pages.length} in ${BUILD_FOLDER}/ ${verb} a failure. The kinds are in this script's header.`);
  return { found: true, lines };
}

function main() {
  try {
    const { root, reportOnly, help } = readOptions(process.argv.slice(2));
    if (help) {
      console.log(USAGE);
      return;
    }
    const { found, lines } = checkBuild(root);
    if (found && reportOnly) lines.push(`${LABEL}: ${REPORT_ONLY_FLAG}, so the exit is 0 all the same.`);
    const print = found ? console.error : console.log;
    lines.forEach((line) => print(line));
    process.exitCode = found && !reportOnly ? EXIT_FOUND : EXIT_CLEAN;
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
  main();
}
