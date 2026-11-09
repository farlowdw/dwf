/**
 * scripts/lib/wordForms.mjs: the ways one entry of the word list can be written, and the views of a text
 * that the scans read. lib/privacy.mjs and check-public.mjs both match through here, so a word that one of
 * them sees, the other sees too.
 *
 * An entry with parts, such as a hyphened name or one written in camel case, is matched in every common
 * spelling of those parts: joined by nothing, a space, an underscore or a hyphen. A text is read three
 * ways: line by line as written; for Markdown and HTML also with tags and the * _ ` marks taken out, so
 * emphasis inside a word hides nothing; and with each line break taken out, along with the next line's
 * indentation and comment leader, so an entry with parts that wraps over a line is still one entry. The
 * joined view reads entries with parts only: a single word that meets the start of the next line by
 * chance is no hit.
 *
 * HOW TO CHANGE IT
 *   What splits an entry into parts: PART_BREAK and CASE_BREAK. The spellings tried: JOINERS. Which files
 *   lose their markup: MARKUP_FILE and MARKUP. What a wrapped line starts with: LINE_BREAK. A joined
 *   spelling shorter than MIN_JOINED_CHARACTERS is left out, because a short one lands in ordinary words.
 */

/** Where an entry splits into parts: a hyphen, a dot, a slash, an underscore or a space. */
const PART_BREAK = /[-./_\s]+/;

/** Where a lower-case letter or digit meets an upper-case one: CamelCase is Camel and Case. */
const CASE_BREAK = /(?<=[a-z0-9])(?=[A-Z])/;

/** How the parts of an entry may be joined. */
const JOINERS = Object.freeze(['', ' ', '_', '-']);

/** A joined spelling this short matches too much ordinary text, so it is not tried. */
const MIN_JOINED_CHARACTERS = 6;

/** Files whose markup can split a word that the reader still sees whole. */
const MARKUP_FILE = /\.(?:md|mdx|html?)$/i;

/** A tag on one line, and the marks of emphasis and code. */
const MARKUP = [/<[^<>\n]*>/g, /[*_`]/g];

/** A line break, the next line's indentation, and a comment or quote leader after it. */
const LINE_BREAK = /\r?\n[ \t]*(?:(?:\/\/+|#+|\*+|;+|--|>+)[ \t]*)?/g;

/** The parts of an entry, in lower case. A plain word is one part. */
export function wordParts(raw) {
  const pieces = String(raw).trim().split(PART_BREAK).flatMap((piece) => piece.split(CASE_BREAK));
  return pieces.map((piece) => piece.toLowerCase()).filter((piece) => piece !== '');
}

/** Every spelling an entry is matched in, lowered, the entry itself first. */
export function wordForms(raw) {
  const lower = String(raw).trim().toLowerCase();
  const parts = wordParts(raw);
  const joined = parts.length > 1 && parts.join('').length >= MIN_JOINED_CHARACTERS
    ? JOINERS.map((joiner) => parts.join(joiner))
    : [];
  return [...new Set([lower, ...joined])];
}

/** { forms, multiPart } for an entry, from its text as the list writes it. */
export function formsOf(raw) {
  return { forms: wordForms(raw), multiPart: wordParts(raw).length > 1 };
}

/** The text with its tags and marks of emphasis taken out, line by line. */
function withoutMarkup(text) {
  return MARKUP.reduce((stripped, pattern) => stripped.replace(pattern, ''), text);
}

/** The lines of a text as one string, and the offset at which each line starts in it. */
function joinedView(text) {
  const starts = [0];
  let joined = '';
  let last = 0;
  for (const match of text.matchAll(LINE_BREAK)) {
    joined += text.slice(last, match.index);
    starts.push(joined.length);
    last = match.index + match[0].length;
  }
  joined += text.slice(last);
  return { joined, starts };
}

/** The 1-based line of an offset in a joined view. */
function lineOfOffset(starts, offset) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle] <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/**
 * The ways one text is read: { lines: [lowered lines, per view], joined: [{ joined, starts }] }. `filePath`
 * decides whether markup comes out. Work it out once per file, then ask linesOf for each entry.
 */
export function textViews(text, filePath = '') {
  const lowered = String(text).toLowerCase();
  const texts = MARKUP_FILE.test(filePath) ? [lowered, withoutMarkup(lowered)] : [lowered];
  return { lines: texts.map((one) => one.split('\n')), joined: texts.map(joinedView) };
}

/** The places of one form in a joined view, as lines. */
function joinedLines({ joined, starts }, form) {
  const lines = [];
  let offset = joined.indexOf(form);
  while (offset !== -1) {
    lines.push(lineOfOffset(starts, offset));
    offset = joined.indexOf(form, offset + 1);
  }
  return lines;
}

/** The sorted 1-based lines on which an entry ({ forms, multiPart }) shows up in any view of a text. */
export function linesOf(views, { forms, multiPart }) {
  const found = new Set();
  for (const lines of views.lines) {
    lines.forEach((line, index) => {
      if (forms.some((form) => line.includes(form))) found.add(index + 1);
    });
  }
  if (multiPart) {
    for (const view of views.joined) forms.forEach((form) => joinedLines(view, form).forEach((line) => found.add(line)));
  }
  return [...found].sort((a, b) => a - b);
}

/** True when a short text, such as a path or a subject, holds any form of the entry. */
export function holdsForm(text, { forms }) {
  const lowered = String(text).toLowerCase();
  return forms.some((form) => lowered.includes(form));
}
