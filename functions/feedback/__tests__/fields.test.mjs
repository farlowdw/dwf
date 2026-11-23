/**
 * fields.test.mjs: functions/feedback/lib/fields.mjs, what the body of one message may hold. Each
 * field's rule (thumb, page, text, captcha token, id), the rule "text is required after a thumbs
 * down" on the server's side, the whitelist (no other key is read or kept), and a problem that is
 * a few fixed words, never a value from the body. The rules themselves are tested with the
 * browser's side in src/components/PageFeedback/__tests__/rules.test.js; this file holds the
 * function to them.
 * Run with `node --test functions/feedback/__tests__/fields.test.mjs` (package.json > shared:verify
 * names this file).
 *
 * HOW TO CHANGE IT
 *   A new field or rule in lib/fields.mjs: its cases here, in the order the fields are read.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_PROBLEMS, readFields } from '../lib/fields.mjs';
import { MAX_CAPTCHA_LENGTH, MAX_PAGE_LENGTH, MAX_TEXT_LENGTH } from '../../../src/components/PageFeedback/rules.js';
import { FAKE_TOKEN, PAGE, SEND_ID, message } from './fakes.mjs';

/** readFields over a value sent as JSON. */
function read(value, options) {
  return readFields(JSON.stringify(value), options);
}

/** The problem readFields finds in `value` (undefined when it finds none). */
function problemOf(value, options) {
  return read(value, options).problem;
}

test('a message is read: the thumb, the page without its trailing slash, the text cleaned, the id', () => {
  const { fields, problem } = read(message({ page: `${PAGE}/`, text: '\n\n  x\r\ny  \n' }));
  assert.equal(problem, undefined);
  assert.deepEqual(fields, { thumb: 'up', page: PAGE, text: '  x\ny', captcha: undefined, id: SEND_ID });
});

test('the thumb must be up or down', () => {
  for (const thumb of [undefined, null, '', 'UP', 'Down', 'sideways', 1, true, ['up'], { up: true }]) {
    assert.equal(problemOf(message({ thumb })), FIELD_PROBLEMS.thumb, JSON.stringify(thumb));
  }
  assert.equal(read(message({ thumb: 'down' })).fields.thumb, 'down');
});

test('the page must be the address of a docs page or a post', () => {
  const refused = [
    undefined, null, 42, '', '/', '/docs', '/about', 'docs/intro', '/docs/../x', '/docs/a?b=1', '/docs/a#b',
    'https://example.test/docs/a', `/docs/${'a'.repeat(MAX_PAGE_LENGTH)}`, ['/docs/a'],
  ];
  for (const page of refused) assert.equal(problemOf(message({ page })), FIELD_PROBLEMS.page, JSON.stringify(page));
  assert.equal(read(message({ page: '/blog/2026/01/15/2026/feynman-technique/' })).fields.page, '/blog/2026/01/15/2026/feynman-technique');
});

test('the text must be a string, at most MAX_TEXT_LENGTH characters', () => {
  for (const text of [undefined, null, 42, ['x'], { text: 'x' }]) {
    assert.equal(problemOf(message({ text })), FIELD_PROBLEMS.text, JSON.stringify(text));
  }
  assert.equal(problemOf(message({ text: 'x'.repeat(MAX_TEXT_LENGTH + 1) })), FIELD_PROBLEMS.textTooLong);
  assert.equal(read(message({ text: 'x'.repeat(MAX_TEXT_LENGTH) })).problem, undefined, 'the longest text passes');
  assert.equal(read(message({ text: '👍'.repeat(MAX_TEXT_LENGTH) })).problem, undefined, 'an emoji is one character');
});

test('text is required after a thumbs down, on the server too; after a thumbs up it may be empty', () => {
  for (const text of ['', '   ', '\n\t\n', '​‌‍']) {
    assert.equal(problemOf(message({ thumb: 'down', text })), FIELD_PROBLEMS.textRequired, JSON.stringify(text));
  }
  assert.equal(read(message({ thumb: 'down', text: 'x' })).fields.text, 'x');
  assert.equal(read(message({ thumb: 'up', text: '' })).fields.text, '');
  assert.equal(read(message({ thumb: 'up', text: '  \n' })).fields.text, '');
});

test('the captcha token: required only when the function has a captcha, a non-empty string of at most MAX_CAPTCHA_LENGTH', () => {
  const required = { captchaRequired: true };
  for (const captcha of [undefined, null, '', 7, ['x'], 'x'.repeat(MAX_CAPTCHA_LENGTH + 1)]) {
    assert.equal(problemOf(message({ captcha }), required), FIELD_PROBLEMS.captcha, JSON.stringify(captcha)?.slice(0, 20));
  }
  assert.equal(read(message({ captcha: FAKE_TOKEN }), required).fields.captcha, FAKE_TOKEN);
  assert.equal(read(message({ captcha: 'x'.repeat(MAX_CAPTCHA_LENGTH) }), required).problem, undefined);
  const without = read(message({ captcha: 7 }));
  assert.equal(without.problem, undefined, 'without a captcha the field is never looked at');
  assert.equal(without.fields.captcha, undefined, 'nor kept');
});

test('the id is kept only when it has the shape of SEND_ID_PATTERN, and a bad id is never a refusal', () => {
  assert.equal(read(message({ id: SEND_ID })).fields.id, SEND_ID);
  for (const id of [undefined, null, 42, '', 'short', 'has spaces in it', 'x'.repeat(65), 'not/an/id-1234', `${SEND_ID}\n`]) {
    const { fields, problem } = read(message({ id }));
    assert.equal(problem, undefined, JSON.stringify(id));
    assert.equal(fields.id, undefined, JSON.stringify(id));
  }
});

test('the whitelist: only the five keys are read, and nothing else is kept', () => {
  const extra = { to: 'x', from: 'x', subject: 'x', html: 'x', reply_to: 'x', remoteip: 'x', constructor: 'x' };
  const { fields } = read({ ...message({ captcha: FAKE_TOKEN }), ...extra }, { captchaRequired: true });
  assert.deepEqual(Object.keys(fields).sort(), ['captcha', 'id', 'page', 'text', 'thumb']);
  const polluted = readFields(`{"__proto__":{"thumb":"down"},"thumb":"up","page":"${PAGE}","text":""}`);
  assert.equal(polluted.problem, undefined);
  assert.equal(polluted.fields.thumb, 'up');
  assert.equal(Object.getPrototypeOf(polluted.fields), Object.prototype);
});

test('a body that is not JSON, or not a JSON object, is refused', () => {
  for (const text of ['', '{not json', 'thumb=up', '{"thumb":"up",}']) {
    assert.equal(readFields(text).problem, FIELD_PROBLEMS.notJson, JSON.stringify(text));
  }
  for (const text of ['null', '[]', '"up"', '42', 'true', JSON.stringify([message()])]) {
    assert.equal(readFields(text).problem, FIELD_PROBLEMS.notObject, text.slice(0, 20));
  }
});

test('a problem is a few fixed words, never a value from the body', () => {
  const marker = 'zq-marker';
  const cases = [
    message({ thumb: marker }),
    message({ page: `/docs/${marker}?` }),
    message({ thumb: 'down', text: ' ' }),
    message({ text: marker.repeat(MAX_TEXT_LENGTH) }),
  ];
  for (const value of cases) {
    const { problem } = read(value, { captchaRequired: true });
    assert.ok(Object.values(FIELD_PROBLEMS).includes(problem), problem);
    assert.ok(!problem.includes(marker));
  }
});
