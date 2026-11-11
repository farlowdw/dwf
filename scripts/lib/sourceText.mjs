/**
 * scripts/lib/sourceText.mjs: a source file with its comments gone and its strings set aside, so that a
 * commented-out line, or a string that merely looks like code, proves nothing. The scripts read a site's
 * docusaurus.config.js through it, and the tests of __tests__/ read every shared file through it
 * (__tests__/sharedTree.mjs hands the same three functions on).
 *
 * maskSource is a small reader, not a parser: it knows comments, strings and regular expressions, and it
 * needs no more, because its readers only look for imports, rules, tokens and a config's lines.
 *
 * HOW TO CHANGE IT
 *   QUOTES: what opens a string. REGEX_MAY_FOLLOW: what a slash must follow to open a regular expression,
 *   and REGEX_LOOK_BEHIND how far back that looks. A new kind of token: tokenAt, with a line in
 *   __tests__/selfContained.test.mjs, whose reader tests cover this file.
 */

const QUOTES = ['"', "'", '`'];

/** After one of these, a slash opens a regular expression and is no division or closing tag. */
const REGEX_MAY_FOLLOW = /(?:^|[(,=:[!&|?{;]|\breturn|\btypeof)\s*$/;

/** How far back REGEX_MAY_FOLLOW looks. */
const REGEX_LOOK_BEHIND = 12;

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
