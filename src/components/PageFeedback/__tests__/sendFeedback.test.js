/**
 * sendFeedback.test.js: the page-feedback card's transport (../sendFeedback.js), driven with an
 * injected fetch (no network): the one request exactly as sent, what each kind of answer comes to
 * (the function's 200, a dev server's HTML, 404, 429, the captcha's codes, the mail service's
 * refusals), a thrown error, and a fetch that never answers. Each result is
 * { outcome, mailRefused }: mailRefused is true only for an answer that says the mail service
 * refused the message. Run with
 * `node --test src/components/PageFeedback/__tests__/sendFeedback.test.js`; package.json >
 * shared:verify names this file.
 *
 * HOW TO CHANGE IT  A new kind of answer gets a case here, and its outcome in ../rules.js >
 * outcomeOf (rules.test.js holds that table); if it asks for a new id, also in ../rules.js >
 * isMailRefusal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODES, FEEDBACK_ENDPOINT, OUTCOME_CAPTCHA, OUTCOME_FAILED, OUTCOME_SENT, OUTCOME_TOO_MANY, THUMB_DOWN, THUMB_UP,
} from '../rules.js';
import { feedbackBody, sendFeedback } from '../sendFeedback.js';

/** A message as the card sends it. */
const MESSAGE = Object.freeze({
  thumb: THUMB_DOWN,
  text: 'x',
  page: '/docs/software-engineering/sql/ctes',
  captcha: 'token-x',
  id: '0b6f1c1e-1d1f-4e5a-9a77-3d2f4f0a9c11',
});

/** A short time limit, for the tests that wait for it. */
const SHORT_MS = 30;

/** What a send comes to when no answer can be read: failed, and no word of the mail service's. */
const FAILED_WITHOUT_ANSWER = Object.freeze({ outcome: OUTCOME_FAILED, mailRefused: false });

/** An answer whose body is JSON. */
function jsonAnswer(status, body) {
  return { status, json: async () => body };
}

/** An answer whose body is not JSON (a page of HTML). */
function htmlAnswer(status) {
  return {
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    },
  };
}

/** A fetch that records each call and answers with `answer` (a value, or a function of the call). */
function fakeFetch(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return typeof answer === 'function' ? answer(url, init) : answer;
  };
  return { calls, fetchImpl };
}

/** A fetch that never answers, unless its request is aborted (then it rejects, as fetch does). */
function stalledFetch() {
  const seen = { signal: null };
  const fetchImpl = (url, init) => {
    seen.signal = init.signal;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    });
  };
  return { seen, fetchImpl };
}

test('one POST to the function, JSON, with the cleaned text and the fields rules.js names', async () => {
  const { calls, fetchImpl } = fakeFetch(jsonAnswer(200, { ok: true }));
  const result = await sendFeedback({ ...MESSAGE, text: '\r\n  x\r\ny  \n\n' }, { fetchImpl });
  assert.deepEqual(result, { outcome: OUTCOME_SENT, mailRefused: false });
  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(url, FEEDBACK_ENDPOINT);
  assert.equal(init.method, 'POST');
  assert.deepEqual({ ...init.headers }, { 'content-type': 'application/json' });
  assert.ok(init.signal instanceof AbortSignal, 'the request can be aborted');
  assert.deepEqual(JSON.parse(init.body), { ...MESSAGE, text: '  x\ny' }, 'indent kept, line ends and the blank ends cleaned');
  assert.deepEqual(Object.keys(init).sort(), ['body', 'headers', 'method', 'signal'], 'nothing else: no cookie, no mode');
});

test('a key without a value is left out of the body', () => {
  const body = JSON.parse(feedbackBody({ thumb: THUMB_UP, text: '', page: '/docs/intro', captcha: undefined, id: undefined }));
  assert.deepEqual(body, { thumb: THUMB_UP, text: '', page: '/docs/intro' });
});

test('anything that is not text is sent as empty text', () => {
  assert.equal(JSON.parse(feedbackBody({ ...MESSAGE, text: null })).text, '');
});

test('each kind of answer comes to its outcome, and only a refusal of the mail service asks for a new id', async () => {
  const cases = [
    [jsonAnswer(200, { ok: true }), OUTCOME_SENT, false],
    [jsonAnswer(200, { ok: false }), OUTCOME_FAILED, false],
    [htmlAnswer(200), OUTCOME_FAILED, false, 'a dev server answers a missing function with its own HTML page'],
    [htmlAnswer(404), OUTCOME_FAILED, false],
    [jsonAnswer(404, { message: 'x' }), OUTCOME_FAILED, false],
    [jsonAnswer(429, { ok: false, code: CODES.rate }), OUTCOME_TOO_MANY, false],
    [htmlAnswer(429), OUTCOME_TOO_MANY, false, 'a 429 from the platform itself is still too many'],
    [jsonAnswer(403, { ok: false, code: CODES.captcha }), OUTCOME_CAPTCHA, false],
    [jsonAnswer(503, { ok: false, code: CODES.captchaUnavailable }), OUTCOME_CAPTCHA, false],
    [jsonAnswer(400, { ok: false, code: CODES.fields }), OUTCOME_FAILED, false],
    [jsonAnswer(500, { ok: false, code: CODES.setup }), OUTCOME_FAILED, false],
    [jsonAnswer(502, { ok: false, code: CODES.mail }), OUTCOME_FAILED, true, 'the mail service refused: the next try needs a new id'],
    [jsonAnswer(503, { ok: false, code: CODES.mailQuota }), OUTCOME_FAILED, true, 'its quota: the same'],
    [jsonAnswer(504, { ok: false, code: CODES.mailTimeout }), OUTCOME_FAILED, false, 'no answer from it: the mail may have gone, so the id stays'],
    [htmlAnswer(502), OUTCOME_FAILED, false, 'a 502 page of the platform says nothing of the mail service'],
    [jsonAnswer(500, null), OUTCOME_FAILED, false],
  ];
  for (const [answer, outcome, mailRefused, note] of cases) {
    const { fetchImpl } = fakeFetch(answer);
    assert.deepEqual(await sendFeedback(MESSAGE, { fetchImpl }), { outcome, mailRefused }, note ?? `status ${answer.status}`);
  }
});

test('a fetch that throws or rejects is a failed send with no refusal of the mail service, never a rejection', async () => {
  const throwing = () => {
    throw new TypeError('x');
  };
  const rejecting = async () => {
    throw new TypeError('Failed to fetch');
  };
  assert.deepEqual(await sendFeedback(MESSAGE, { fetchImpl: throwing }), FAILED_WITHOUT_ANSWER);
  assert.deepEqual(await sendFeedback(MESSAGE, { fetchImpl: rejecting }), FAILED_WITHOUT_ANSWER);
  assert.deepEqual(await sendFeedback(MESSAGE, { fetchImpl: 'not a function' }), FAILED_WITHOUT_ANSWER);
  assert.deepEqual(await sendFeedback(MESSAGE, { fetchImpl: async () => undefined }), FAILED_WITHOUT_ANSWER, 'no answer at all');
  assert.deepEqual(await sendFeedback(undefined, { fetchImpl: rejecting }), FAILED_WITHOUT_ANSWER, 'no message at all');
});

test('a fetch that never answers is aborted at the time limit, and the send failed', async () => {
  const { seen, fetchImpl } = stalledFetch();
  const started = Date.now();
  assert.deepEqual(await sendFeedback(MESSAGE, { fetchImpl, timeoutMs: SHORT_MS }), FAILED_WITHOUT_ANSWER);
  assert.ok(Date.now() - started >= SHORT_MS - 5, 'it waited for the limit');
  assert.equal(seen.signal.aborted, true, 'the request itself was aborted');
});

test('the time limit holds even for a fetch that ignores the abort', async () => {
  const deaf = () => new Promise(() => {});
  assert.deepEqual(await sendFeedback(MESSAGE, { fetchImpl: deaf, timeoutMs: SHORT_MS }), FAILED_WITHOUT_ANSWER);
});

test('the time limit covers reading the answer too, and an answer never read refuses nothing', async () => {
  const endless = { status: 502, json: () => new Promise(() => {}) };
  const { fetchImpl } = fakeFetch(endless);
  assert.deepEqual(await sendFeedback(MESSAGE, { fetchImpl, timeoutMs: SHORT_MS }), FAILED_WITHOUT_ANSWER);
});

test('without a fetchImpl it uses the global fetch of the moment (the reloader wraps window.fetch)', async () => {
  const original = globalThis.fetch;
  const { calls, fetchImpl } = fakeFetch(jsonAnswer(200, { ok: true }));
  globalThis.fetch = fetchImpl;
  try {
    assert.equal((await sendFeedback(MESSAGE)).outcome, OUTCOME_SENT);
    assert.equal((await sendFeedback(MESSAGE, null)).outcome, OUTCOME_SENT, 'options that are not an object');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
