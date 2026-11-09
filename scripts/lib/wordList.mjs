/**
 * scripts/lib/wordList.mjs: the one reader of the machine's word list. The privacy scan of status, pull and
 * push (lib/privacy.mjs) and the public check of a site's build (check-public.mjs) both read the list
 * through parseWordList, so the two never take a line differently.
 *
 * The format, one entry per line:
 *   word                 matched in any case; an entry with parts in each common spelling (lib/wordForms.mjs)
 *   word<TAB>path        that word is allowed in that one path, and the word is still listed
 *   # a comment          a line whose first mark is #, indented or not; a # later in a line is part of the word
 *   a blank line         skipped
 * A line with more than one tab, or with a path and no word, is a bad line. It is reported by its number:
 * check-public refuses the list, and shared:status warns. A bad line's word is still read, so the scan never
 * reads fewer words than the list holds. A word listed twice keeps its first line number and gathers every
 * allowed path. Line ends may be CRLF.
 *
 * HOW TO CHANGE IT
 *   A new kind of line: a case in readLine, with a line in the tests of both readers
 *   (__tests__/privacy.test.mjs and scripts/__tests__/check-public.test.mjs). The marks: COMMENT_START and
 *   ALLOW_SEPARATOR. Never print an entry: a hit gives the line number alone.
 */

import { formsOf } from './wordForms.mjs';

const COMMENT_START = '#';
const ALLOW_SEPARATOR = '\t';

/** One line as { word, allowedPath, bad }, or null for a comment or a blank line. */
function readLine(rawLine) {
  const line = rawLine.replace(/\r$/, '');
  if (line.trim() === '' || line.trimStart().startsWith(COMMENT_START)) return null;
  const [word, allowedPath = '', ...extra] = line.split(ALLOW_SEPARATOR).map((part) => part.trim());
  return { word, allowedPath, bad: word === '' || extra.length > 0 };
}

/**
 * The list's text as { words: [{ lower, line, forms, multiPart }], allowed: [{ lower, path }], badLines }.
 * `line` is the entry's first line number, which is all a hit may print.
 */
export function parseWordList(text) {
  const list = { words: [], allowed: [], badLines: [] };
  text.split('\n').forEach((rawLine, index) => {
    const read = readLine(rawLine);
    if (read === null) return;
    if (read.bad) list.badLines.push(index + 1);
    if (read.word === '') return;
    const lower = read.word.toLowerCase();
    if (read.allowedPath !== '') list.allowed.push({ lower, path: read.allowedPath });
    if (!list.words.some((entry) => entry.lower === lower)) list.words.push({ lower, line: index + 1, ...formsOf(read.word) });
  });
  return list;
}
