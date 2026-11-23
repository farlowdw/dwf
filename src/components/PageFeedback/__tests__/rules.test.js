/**
 * rules.test.js: the rules the page-feedback prompt and its function share (../rules.js), and the
 * lists of words with their fallbacks (../words.js). Run with
 * `node --test src/components/PageFeedback/__tests__/rules.test.js`; package.json > shared:verify
 * names this file.
 *
 * HOW TO CHANGE IT
 *   A rule changes in ../rules.js: change its case here in the same commit. A new word in
 *   ../words.js: nothing here, as long as it is on exactly one of the three lists.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODES, MAX_PAGE_LENGTH, MAX_TEXT_LENGTH, OUTCOME_CAPTCHA, OUTCOME_CAPTCHA_NEEDED, OUTCOME_FAILED, OUTCOME_SENT,
  OUTCOME_TOO_MANY, PROBLEM_REQUIRED, PROBLEM_TOO_LONG, THUMB_DOWN, THUMB_UP, cleanText, isBlank, isExcluded,
  isMailRefusal, isPagePath, isTextRequired, isThumb, listProblems, normalisePath, outcomeOf, promptIsShown,
  textLength, textProblem,
} from '../rules.js';
import { CAPTCHA_WORDS, FALLBACKS, OPTIONAL_WORDS, REQUIRED_WORDS, WORDS, missingWords, wordOf } from '../words.js';

/** A page of the site, as its permalink reads. */
const PAGE = '/docs/software-engineering/sql/ctes';

test('the two thumbs are the only answers, and only a thumbs down requires text', () => {
  assert.equal(isThumb(THUMB_UP), true);
  assert.equal(isThumb(THUMB_DOWN), true);
  for (const other of ['', 'UP', 'sideways', null, undefined, 1, {}]) assert.equal(isThumb(other), false, String(other));
  assert.equal(isTextRequired(THUMB_DOWN), true);
  assert.equal(isTextRequired(THUMB_UP), false);
});

test('cleanText keeps what was typed (indents, tabs, line breaks) and drops what cannot be seen or would mislead', () => {
  assert.equal(cleanText('  first line is indented\n\tsecond\n\n  third  \n\n'), '  first line is indented\n\tsecond\n\n  third');
  assert.equal(cleanText('\n \n\t\nafter blank lines'), 'after blank lines');
  assert.equal(cleanText('a\r\nb\rc'), 'a\nb\nc');
  assert.equal(cleanText('bell\u0007 and escape\u001B gone'), 'bell and escape gone');
  assert.equal(cleanText('right‮to left⁦ marks⁩ gone'), 'rightto left marks gone');
  assert.equal(cleanText('lone \uD800 surrogate'), 'lone � surrogate');
  assert.equal(cleanText('an Arabic letter mark؜ goes too'), 'an Arabic letter mark goes too');
  assert.equal(cleanText('white space of every kind at the end    ﻿\n\t'), 'white space of every kind at the end');
  for (const notText of [null, undefined, 42, {}, []]) assert.equal(cleanText(notText), '');
});

test('cleanText stays fast on a long run of white space before a last character', () => {
  // A pattern that backtracks over the run costs seconds here; trimEnd does not.
  const runs = 200;
  const text = `${' '.repeat(16000)}x`;
  const started = process.hrtime.bigint();
  for (let run = 0; run < runs; run += 1) cleanText(text);
  const milliseconds = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(milliseconds < 2000, `${runs} runs took ${Math.round(milliseconds)} ms`);
});

test('cleanText never makes a text longer', () => {
  for (const text of ['plain', ' \n padded \n ', 'a\r\nb', '\uD800\uD800', 'é', '👍🏽 emoji']) {
    assert.ok(cleanText(text).length <= text.length, JSON.stringify(text));
  }
});

test('a text is blank when a reader could see nothing in it', () => {
  for (const blank of ['', '   ', '\n\t\n', '​‌‍', '﻿ ⁠', null]) assert.equal(isBlank(blank), true, JSON.stringify(blank));
  for (const written of ['x', ' . ', '0', '👍']) assert.equal(isBlank(written), false, written);
});

test('length is counted in characters, not in UTF-16 units', () => {
  assert.equal(textLength('abc'), 3);
  assert.equal(textLength('👍'), 1);
  assert.equal(textLength('  padded  '), 8);
});

test('textProblem: text is required after a thumbs down, optional after a thumbs up, and bounded for both', () => {
  assert.equal(textProblem(THUMB_DOWN, ''), PROBLEM_REQUIRED);
  assert.equal(textProblem(THUMB_DOWN, ' \n​'), PROBLEM_REQUIRED);
  assert.equal(textProblem(THUMB_DOWN, 'a typo in step 3'), null);
  assert.equal(textProblem(THUMB_UP, ''), null);
  assert.equal(textProblem(THUMB_UP, 'x'.repeat(MAX_TEXT_LENGTH)), null);
  assert.equal(textProblem(THUMB_UP, 'x'.repeat(MAX_TEXT_LENGTH + 1)), PROBLEM_TOO_LONG);
  assert.equal(textProblem(THUMB_DOWN, '👍'.repeat(MAX_TEXT_LENGTH)), null, 'an emoji is one character');
});

test('normalisePath drops trailing slashes and keeps the root', () => {
  assert.equal(normalisePath('/docs/intro/'), '/docs/intro');
  assert.equal(normalisePath('/docs/intro//'), '/docs/intro');
  assert.equal(normalisePath('/docs/intro'), '/docs/intro');
  assert.equal(normalisePath('/'), '/');
  assert.equal(normalisePath(''), '/');
  assert.equal(normalisePath(undefined), '/');
});

test('isPagePath accepts the addresses of docs and posts, with or without a trailing slash', () => {
  for (const page of [PAGE, `${PAGE}/`, '/docs/intro', '/docs/dp', '/blog/2026/01/15/2026/feynman-technique', '/docs/a/b.c_d~e-f']) {
    assert.equal(isPagePath(page), true, page);
  }
});

test('isPagePath refuses everything else', () => {
  const refused = [
    '/', '/docs', '/docs/', '/blog', '/about', '/resume', 'docs/intro', '//docs/intro', '/docs//intro',
    '/docs/../secret', '/docs/./intro', '/docs/.hidden', '/docs/intro?x=1', '/docs/intro#part', '/docs/in tro',
    '/docs/intro\n', '/docs/<script>', 'https://example.com/docs/intro', '/Docs/intro', `/docs/${'a'.repeat(MAX_PAGE_LENGTH)}`,
    `/docs${'/a'.repeat(13)}`, null, undefined, 42, {},
  ];
  for (const page of refused) assert.equal(isPagePath(page), false, String(page));
});

test('a page on a list has no prompt, whichever way the entry or the address ends', () => {
  const list = ['/docs/intro', '/docs/admonitions/'];
  assert.equal(isExcluded('/docs/intro', list), true);
  assert.equal(isExcluded('/docs/intro/', list), true);
  assert.equal(isExcluded('/docs/admonitions', list), true);
  assert.equal(isExcluded('/docs/introduction', list), false, 'a longer address is another page');
  assert.equal(isExcluded('/docs/intro/more', list), false, 'an entry never stands for the pages below it');
  assert.equal(isExcluded('/docs/intro', []), false);
  assert.equal(isExcluded('/docs/intro', undefined), false);
  assert.equal(isExcluded('/docs/intro', [null, 7]), false);
});

test('listProblems names every entry that can match no page', () => {
  assert.deepEqual(listProblems(['/docs/intro', '/blog/2026/01/15/2026/feynman-technique/']), []);
  assert.equal(listProblems(['/docs/references/*']).length, 1, 'no wildcard: an entry is one page');
  assert.equal(listProblems(['/about', 3, '']).length, 3);
  assert.equal(listProblems('not a list').length, 1);
});

test('promptIsShown: on, listed, an accepted address and not on the list', () => {
  const shown = { enabled: true, permalink: PAGE, unlisted: false, forbidden: ['/docs/intro'] };
  assert.equal(promptIsShown(shown), true);
  assert.equal(promptIsShown({ ...shown, enabled: false }), false);
  assert.equal(promptIsShown({ ...shown, enabled: 'true' }), false, 'only the boolean true switches it on');
  assert.equal(promptIsShown({ ...shown, enabled: undefined }), false);
  assert.equal(promptIsShown({ ...shown, unlisted: true }), false);
  assert.equal(promptIsShown({ ...shown, permalink: '/about' }), false);
  assert.equal(promptIsShown({ ...shown, permalink: '/docs/intro/' }), false);
  assert.equal(promptIsShown({ ...shown, forbidden: undefined }), true);
});

test('outcomeOf: sent only for 200 with ok true; words of their own for 429 and the captcha; failed for the rest', () => {
  assert.equal(outcomeOf(200, { ok: true }), OUTCOME_SENT);
  assert.equal(outcomeOf(200, { ok: false }), OUTCOME_FAILED);
  assert.equal(outcomeOf(200, null), OUTCOME_FAILED, 'a 200 that is not the function\'s answer is not a send');
  assert.equal(outcomeOf(200, 'ok'), OUTCOME_FAILED);
  assert.equal(outcomeOf(204, { ok: true }), OUTCOME_FAILED);
  assert.equal(outcomeOf(429, { ok: false, code: CODES.rate }), OUTCOME_TOO_MANY);
  assert.equal(outcomeOf(403, { ok: false, code: CODES.captcha }), OUTCOME_CAPTCHA);
  assert.equal(outcomeOf(503, { ok: false, code: CODES.captchaUnavailable }), OUTCOME_CAPTCHA);
  for (const [status, code] of [[400, CODES.fields], [403, CODES.origin], [404, undefined], [413, CODES.size], [500, CODES.setup], [502, CODES.mail], [503, CODES.mailQuota], [504, CODES.mailTimeout]]) {
    assert.equal(outcomeOf(status, { ok: false, code }), OUTCOME_FAILED, `${status} ${code}`);
  }
});

test('isMailRefusal: only an answer that says the mail service refused, so only then a new id', () => {
  assert.equal(isMailRefusal({ ok: false, code: CODES.mail }), true);
  assert.equal(isMailRefusal({ ok: false, code: CODES.mailQuota }), true);
  const kept = [
    { ok: true }, { ok: false, code: CODES.mailTimeout }, { ok: false, code: CODES.rate }, { ok: false, code: CODES.fields },
    { ok: false, code: CODES.captcha }, { ok: false, code: CODES.captchaUnavailable }, { ok: false, code: CODES.setup },
    { ok: false }, null, undefined, 'not JSON', 42,
  ];
  for (const body of kept) assert.equal(isMailRefusal(body), false, JSON.stringify(body));
});

test('every outcome that is not a send names a word, and every word is on exactly one list', () => {
  for (const outcome of [OUTCOME_FAILED, OUTCOME_TOO_MANY, OUTCOME_CAPTCHA, OUTCOME_CAPTCHA_NEEDED]) assert.ok(outcome in WORDS, outcome);
  const listed = [...REQUIRED_WORDS, ...CAPTCHA_WORDS, ...OPTIONAL_WORDS];
  assert.deepEqual([...listed].sort(), Object.keys(WORDS).sort());
  assert.equal(new Set(listed).size, listed.length);
  for (const name of Object.keys(WORDS)) assert.equal(typeof WORDS[name], 'string', name);
});

test('a fallback stands in for an optional word only, and names a word that exists', () => {
  for (const [name, fallback] of Object.entries(FALLBACKS)) {
    assert.ok(OPTIONAL_WORDS.includes(name), `${name} has a fallback, so it must be optional`);
    assert.ok(fallback in WORDS, `${name} falls back to ${fallback}, which is no word`);
    assert.notEqual(fallback, name);
  }
});

test('missingWords names the needed words that are empty: the required ones, and the captcha ones on a site with a captcha', () => {
  const filled = Object.fromEntries(REQUIRED_WORDS.map((name) => [name, 'x']));
  assert.deepEqual(missingWords(filled), []);
  assert.deepEqual(missingWords({ ...filled, thanks: '  ', tooMany: '' }), ['thanks']);
  assert.deepEqual(missingWords(filled, { captcha: false }), []);
  assert.deepEqual(missingWords(filled, { captcha: true }), CAPTCHA_WORDS);
  assert.deepEqual(missingWords({ ...filled, captchaFailed: 'x' }, { captcha: true }), []);
});

test('wordOf gives the word, or the word its fallbacks lead to, or nothing', () => {
  const words = { failed: 'F', tooMany: '', captchaFailed: '', captchaNeeded: ' ', note: '' };
  assert.equal(wordOf('failed', words), 'F');
  assert.equal(wordOf('tooMany', words), 'F');
  assert.equal(wordOf('tooMany', { ...words, tooMany: ' T ' }), 'T');
  assert.equal(wordOf('captchaNeeded', words), '', 'captchaFailed is empty too, and has no fallback');
  assert.equal(wordOf('captchaNeeded', { ...words, captchaFailed: 'C' }), 'C');
  assert.equal(wordOf('captchaNeeded', { ...words, captchaNeeded: 'N', captchaFailed: 'C' }), 'N');
  assert.equal(wordOf('note', words), '');
  assert.equal(wordOf('noSuchWord', words), '');
});
