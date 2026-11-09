/**
 * scripts/lib/privacy.mjs: the privacy scan. shared/ reaches public history through a public site,
 * so nothing private may enter it, and that goes for commit subjects too: `git subtree` copies them
 * into every site's history.
 *
 * Two lists:
 *   The word list, one plain file on this machine, outside every repo (lib/settings.mjs). It cannot
 *   sit in shared/: public history would then publish the words it guards. lib/wordList.mjs reads it,
 *   for these scripts and for check-public alike: one entry per line, a line that starts with `#` is a
 *   comment, `word<TAB>path` allows that word in that one path. Case does not count. An entry with
 *   parts is matched in each common spelling of them, and over a wrapped line or Markdown's marks
 *   (lib/wordForms.mjs). A line the reader cannot take is in `badLines`, and status warns about it.
 *   SECRET_SHAPES below, which hold no secret, only what keys look like.
 *
 * A list with no word in it reads as missing. Otherwise an emptied file scans nothing and reads clean.
 *
 * A binary file, a picture, a PDF or a font, is read for the word list too, as a whole: its hit gives
 * no line. The secret shapes skip binaries, because random bytes look like keys.
 *
 * The scan's own files (OWN_FILES) must spell the shapes, so the shapes skip them. The word list still
 * reads them: nothing in them needs a listed word.
 *
 * A hit prints where it is and the word's line number in the list, never the word, the file name
 * holding it (it is masked) or the matched text. Every script reads this one list.
 *
 * HOW TO CHANGE IT
 *   A new word: add a line to the file on the machine. A new shape: add a row to SECRET_SHAPES and
 *   to the planted list in the test. OWN_FILES names the files that must spell these shapes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { wordListPath } from './settings.mjs';
import { formsOf, holdsForm, linesOf, textViews } from './wordForms.mjs';
import { parseWordList } from './wordList.mjs';

/** The bytes checked for a NUL: git's own test for "this is a binary file". */
const BINARY_PROBE_BYTES = 8000;

/** What secrets look like. Written so that none of these lines matches itself. */
export const SECRET_SHAPES = Object.freeze([
  { name: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'a GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { name: 'an API key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'an AWS key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'a Google key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'a Netlify token', pattern: /\bnfp_[A-Za-z0-9]{20,}\b/ },
  { name: 'a JSON web token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'a licence key', pattern: /\b[0-9a-f]{32}T[A-Za-z0-9+/=]{40,}/ },
  { name: 'a password in an address', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"]+:[^\s/:@'"]+@[^\s/'"]+/i },
  { name: 'a Basic-Auth value', pattern: /Basic-Auth\s*[:=]\s*['"]?[^\s'"]+:[^\s'"]+/i },
  { name: 'a secret in a setting', pattern: /(?:secret|token|password|api[_-]?key)\w*['"]?\s*[:=]\s*['"][^'"\s]{16,}['"]/i },
]);

/**
 * This file and its two tests hold the shapes and planted secrets, so the shapes skip them, in the hub or
 * below shared/ in a site. Nothing else is skipped, and the word list reads these too.
 */
const OWN_FILES = /^(?:shared\/)?(?:scripts\/lib\/privacy\.mjs|(?:scripts\/)?__tests__\/privacy\.test\.mjs)$/;

/** True for the scan's own files, in a site (under shared/) or in the hub. */
export function isOwnFile(filePath) {
  return OWN_FILES.test(filePath);
}

/**
 * The word list: { file, missing, words: [{ lower, line, forms, multiPart }], allowed: [{ lower, path }], badLines }.
 */
export function readWordList(file = wordListPath()) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { file, missing: true, words: [], allowed: [], badLines: [] };
  }
  const list = parseWordList(text);
  return { file, missing: list.words.length === 0, ...list };
}

/** True when the list allows this word in this path. */
function isAllowed(list, lower, filePath) {
  return list.allowed.some((entry) => entry.lower === lower && entry.path === filePath);
}

/** An entry with its spellings. A list made by hand, as a test may, has only `lower`. */
function withForms(entry) {
  return entry.forms ? entry : { ...entry, ...formsOf(entry.lower) };
}

/** The text's word hits as [{ line, listLine }], by line. `filePath` is what allow lines match against. */
export function wordHits(text, list, filePath = null) {
  const views = textViews(text, filePath ?? '');
  const hits = [];
  for (const entry of list.words.map(withForms)) {
    if (isAllowed(list, entry.lower, filePath)) continue;
    linesOf(views, entry).forEach((line) => hits.push({ line, listLine: entry.line }));
  }
  return hits.sort((a, b) => a.line - b.line || a.listLine - b.listLine);
}

/** A binary file's word hits, one per entry, as [{ line: 0, listLine }]: its bytes have no lines. */
function binaryWordHits(text, list, filePath) {
  const entries = list.words.map(withForms).filter((entry) => !isAllowed(list, entry.lower, filePath));
  return entries.filter((entry) => holdsForm(text, entry)).map((entry) => ({ line: 0, listLine: entry.line }));
}

/** The text's secret shapes as [{ line, shape }]. */
export function shapeHits(text) {
  const hits = [];
  text.split('\n').forEach((line, index) => {
    for (const { name, pattern } of SECRET_SHAPES) {
      if (pattern.test(line)) hits.push({ line: index + 1, shape: name });
    }
  });
  return hits;
}

/**
 * Tracked files as [{ path, text, binary }], without files that cannot be read. A binary file comes as
 * its bytes read as UTF-8, which keeps every ASCII word whole. `binaries: false` leaves them out, for a
 * reader that wants text alone.
 */
export function readTexts(root, paths, { binaries = true } = {}) {
  const texts = [];
  for (const filePath of paths) {
    let bytes;
    try {
      bytes = fs.readFileSync(path.join(root, filePath));
    } catch {
      continue;
    }
    const binary = isBinary(bytes);
    if (binary && !binaries) continue;
    texts.push({ path: filePath, text: bytes.toString('utf8'), binary });
  }
  return texts;
}

/** True for bytes git would call binary: a NUL near the start. */
export function isBinary(bytes) {
  return bytes.subarray(0, BINARY_PROBE_BYTES).includes(0);
}

/** The texts that are not binary, for a reader of lines. */
export function textFilesOf(texts) {
  return texts.filter(({ binary }) => !binary);
}

/** One file's hits. Binaries take the word list alone, and the scan's own files skip the shapes. */
function fileHits({ path: filePath, text, binary }, list) {
  if (binary) return binaryWordHits(text, list, filePath);
  const words = wordHits(text, list, filePath);
  return isOwnFile(filePath) ? words : [...words, ...shapeHits(text)];
}

/** Every hit in the files' contents. The path a hit carries is masked, as a name hit's is. */
export function scanTexts(texts, list) {
  const hits = [];
  for (const file of texts) {
    const masked = maskWords(file.path, list);
    hits.push(...fileHits(file, list).map((hit) => ({ ...hit, path: masked, where: 'content' })));
  }
  return hits;
}

/** The text with every place of one word starred out. */
function maskWord(text, lower) {
  const stars = '*'.repeat(lower.length);
  let masked = text;
  let start = masked.toLowerCase().indexOf(lower);
  while (start >= 0) {
    masked = masked.slice(0, start) + stars + masked.slice(start + lower.length);
    start = masked.toLowerCase().indexOf(lower);
  }
  return masked;
}

/** The text with every spelling of every listed word starred out, so printing it shows no word. */
export function maskWords(text, list) {
  const forms = list.words.flatMap((entry) => withForms(entry).forms);
  return forms.reduce(maskWord, text);
}

/** Every hit in the file names. The path a hit carries is masked. */
export function scanNames(paths, list) {
  const hits = [];
  for (const filePath of paths) {
    const found = wordHits(filePath, list, filePath);
    const masked = maskWords(filePath, list);
    hits.push(...found.map(({ listLine }) => ({ listLine, path: masked, where: 'name' })));
  }
  return hits;
}

/** The hits in one commit's subject or body. */
function commitHits(text, list, where, sha) {
  const found = [...wordHits(text, list), ...shapeHits(text)];
  return found.map(({ listLine, shape }) => ({ listLine, shape, sha, where }));
}

/** Every hit in commits' subjects and bodies: [{ sha, where: 'subject' or 'body', … }]. */
export function scanCommits(commits, list) {
  return commits.flatMap(({ sha, subject, body = '' }) => [
    ...commitHits(subject, list, 'subject', sha),
    ...commitHits(body, list, 'body', sha),
  ]);
}

/** One line for a hit. It never holds the word or the matched text. */
export function describeHit({ path: filePath, line, sha, where, listLine, shape }) {
  const what = shape ? `looks like ${shape}` : `matches line ${listLine} of the word list`;
  if (sha) return `commit ${sha.slice(0, 7)}'s ${where} ${what}`;
  if (where === 'name') return `the file name ${filePath} ${what}`;
  if (line === 0) return `${filePath}, a binary file, ${what}`;
  return `${filePath}:${line} ${what}`;
}
