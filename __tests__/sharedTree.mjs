/**
 * __tests__/sharedTree.mjs: how the tests in this folder read the shared folder. Its root, its
 * files, the site around it (if any), and a source file with its comments gone and its strings set
 * aside, so that a commented-out line or a string that merely looks like an import proves nothing.
 *
 * The same files run in the hub, where this folder's parent is the repository, and in a site, where
 * it is shared/ and the site is one level up. Nothing here needs a package from npm.
 *
 * HOW TO CHANGE IT
 *   NEVER_WALKED: folders no test reads. TEMPLATE_FOLDER: the folder of a new site's files, which
 *   some tests skip on purpose. CONFIG_FILE: what makes the parent of a folder named shared a site.
 *   maskSource is a small reader, not a parser: it knows comments, strings and regular expressions,
 *   and it needs no more, because the tests only look for imports, rules and tokens. exactExists reads
 *   names letter for letter, as a case-sensitive disk does.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREFIX } from '../scripts/lib/settings.mjs';

/** This folder's parent: the hub's root, or shared/ in a site. */
export const SHARED_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A new site's files. They import @site and name site things on purpose. */
export const TEMPLATE_FOLDER = 'template';

const NEVER_WALKED = new Set(['.git', 'node_modules']);

/** Files a Mac writes by itself. */
const SYSTEM_FILES = new Set(['.DS_Store']);

const CONFIG_FILE = 'docusaurus.config.js';

const QUOTES = ['"', "'", '`'];

/** After one of these, a slash opens a regular expression and is no division or closing tag. */
const REGEX_MAY_FOLLOW = /(?:^|[(,=:[!&|?{;]|\breturn|\btypeof)\s*$/;

/** How far back REGEX_MAY_FOLLOW looks. */
const REGEX_LOOK_BEHIND = 12;

/**
 * Every file below `folder`, as paths from it with forward slashes. A NEVER_WALKED name is left out whatever it
 * is, so a node_modules that is a link to a site's packages, as a test run beside them uses, is no file here.
 */
function walk(folder, prefix, found) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (NEVER_WALKED.has(entry.name)) continue;
    if (entry.isDirectory()) {
      walk(path.join(folder, entry.name), `${relative}/`, found);
    } else if (!SYSTEM_FILES.has(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

/** True for a path inside template/. */
export function isTemplatePath(filePath) {
  return filePath.startsWith(`${TEMPLATE_FOLDER}/`);
}

/** Every file of the shared folder from its root, sorted. */
export function sharedFiles({ root = SHARED_ROOT, skipTemplate = false } = {}) {
  const files = walk(root, '', []).sort();
  return skipTemplate ? files.filter((file) => !isTemplatePath(file)) : files;
}

/** The text of a shared file, by its path from the root. */
export function readShared(filePath, root = SHARED_ROOT) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

/** The site this folder is mounted in, or null in the hub. */
export function hostSite(root = SHARED_ROOT) {
  const parent = path.dirname(root);
  const isMount = path.basename(root) === PREFIX;
  return isMount && fs.existsSync(path.join(parent, CONFIG_FILE)) ? parent : null;
}

/** Where the quoted text opening at `start` ends. A ' or " stops at its line: JSX words hold apostrophes. */
function stringEnd(text, start) {
  const quote = text[start];
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\') {
      index += 2;
    } else if (char === quote) {
      return index + 1;
    } else if (char === '\n' && quote !== '`') {
      return index;
    } else {
      index += 1;
    }
  }
  return text.length;
}

/** Where the regular expression opening at `start` ends, or null when it never closes on its line. */
function regexEnd(text, start) {
  let inClass = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\n') return null;
    if (char === '\\') index += 1;
    else if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return index + 1;
  }
  return null;
}

/** True when a line comment starts here. A // right after a colon is an address, as in https://. */
function opensLineComment(text, index) {
  return text.startsWith('//', index) && text[index - 1] !== ':';
}

/** The next token at `index`: a comment, a literal (string or regex) or one character of code. */
function tokenAt(text, index, written, regexLiterals) {
  if (text.startsWith('/*', index)) {
    const close = text.indexOf('*/', index + 2);
    return { kind: 'comment', end: close === -1 ? text.length : close + 2 };
  }
  if (opensLineComment(text, index)) {
    const close = text.indexOf('\n', index);
    return { kind: 'comment', end: close === -1 ? text.length : close };
  }
  if (QUOTES.includes(text[index])) return { kind: 'literal', end: stringEnd(text, index) };
  if (regexLiterals && text[index] === '/' && REGEX_MAY_FOLLOW.test(written.slice(-REGEX_LOOK_BEHIND))) {
    const end = regexEnd(text, index);
    if (end !== null) return { kind: 'literal', end };
  }
  return { kind: 'code', end: index + 1 };
}

/**
 * The source without comments: { code, literals }. Each string or regular expression in `code` is
 * "<n>", its number in `literals`, quotes included. Set regexLiterals false for a stylesheet.
 */
export function maskSource(text, { regexLiterals = true } = {}) {
  const literals = [];
  let code = '';
  let index = 0;
  while (index < text.length) {
    const { kind, end } = tokenAt(text, index, code, regexLiterals);
    if (kind === 'code') {
      code += text[index];
    } else if (kind === 'literal') {
      literals.push(text.slice(index, end));
      code += `"${literals.length - 1}"`;
    }
    index = end;
  }
  return { code, literals };
}

/** The source without comments, strings back in place. */
export function stripComments(text, options) {
  const { code, literals } = maskSource(text, options);
  return code.replace(/"(\d+)"/g, (match, number) => literals[Number(number)] ?? match);
}

/** A literal's text without its quotes. */
export function unquote(literal) {
  return literal.slice(1, -1);
}

/**
 * A test of whether a path, from `root`, names a file or folder with exactly these letters. macOS finds a file
 * whatever its case, so existsSync passes './Problems' for problems.js there, and a build on Linux then fails. This
 * reads each folder's own listing, kept per folder, and compares one part at a time. A path that climbs out of
 * `root` reads false.
 */
export function exactExists(root = SHARED_ROOT) {
  const listings = new Map();
  const listing = (folder) => {
    if (!listings.has(folder)) {
      let names = [];
      try {
        names = fs.readdirSync(folder);
      } catch {
        names = [];
      }
      listings.set(folder, new Set(names));
    }
    return listings.get(folder);
  };
  return (relative) => {
    const normal = path.posix.normalize(relative.replace(/^\/+/, ''));
    if (normal === '..' || normal.startsWith('../')) return false;
    let folder = root;
    for (const part of normal.split('/').filter((piece) => piece !== '' && piece !== '.')) {
      if (!listing(folder).has(part)) return false;
      folder = path.join(folder, part);
    }
    return true;
  };
}
