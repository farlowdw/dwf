/**
 * mail.test.mjs: functions/feedback/lib/mail.mjs, the mail and the one call to Resend. The call
 * exactly as sent (address, headers, body; no html, no reply_to; redirects refused); the subject
 * and the text as lib/mail.mjs > THE MAIL lays them out: the reader's words first, the last three
 * lines always the function's own, the page link from SITE_ORIGIN and never from the request; the
 * idempotency key, page-feedback/<id>; what each of Resend's answers becomes (2xx sent, 429
 * mail-quota, any other status or no connection mail, no answer within six seconds mail-timeout,
 * and not a millisecond sooner); one call each, never a retry; the log's words keep the status
 * and the error name, never Resend's body. A fake fetch stands in for Resend (fakes.mjs), and
 * node:test's mock timers for the clock: no network, no waiting.
 * Run with `node --test functions/feedback/__tests__/mail.test.mjs` (package.json > shared:verify
 * names this file).
 *
 * HOW TO CHANGE IT
 *   The mail's layout changes in lib/mail.mjs: EXPECTED_TEXT and FACTS here with it. Another mail
 *   service: this file's calls and answers with it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIL_TIMEOUT_MS, MAIL_URL, SITE_ORIGIN, buildMail, mailSubject, mailText, sendMail } from '../lib/mail.mjs';
import { CODES } from '../../../src/components/PageFeedback/rules.js';
import { FAKE_FROM, FAKE_KEY, FAKE_TO, PAGE, RESEND, RESEND_SENT, SEND_ID, SITE_HOST, fakeFetch, hasSettled, networkError, sentBody } from './fakes.mjs';

/** The fields of a message as lib/fields.mjs gives them. */
function fields(overrides = {}) {
  return { thumb: 'up', page: PAGE, text: 'x', captcha: undefined, id: SEND_ID, ...overrides };
}

/** The mail for `overrides` of the fields. */
function mailFor(overrides = {}) {
  return buildMail({ from: FAKE_FROM, to: FAKE_TO, fields: fields(overrides) });
}

/** sendMail with Resend answering `answer`; the message's id is SEND_ID unless `options` names one (undefined: none). */
async function send(answer, options = {}) {
  const id = 'id' in options ? options.id : SEND_ID;
  const fetchImpl = fakeFetch({ [RESEND]: answer });
  const outcome = await sendMail(mailFor(), { key: FAKE_KEY, id, fetchImpl });
  return { outcome, fetchImpl };
}

/** The idempotency key of a message whose id is SEND_ID, written out. */
const IDEMPOTENCY_KEY = `page-feedback/${SEND_ID}`;

/** The function's own last three lines of a mail about a thumbs up on PAGE. */
const FACTS = Object.freeze(['-----', `Page:   ${SITE_ORIGIN}${PAGE}`, 'Thumb:  up']);

/** The text of the mail for fields(): the reader's words, a blank line, the facts. */
const EXPECTED_TEXT = ['x', '', ...FACTS].join('\n');

test('the call exactly as sent: one POST to Resend with the key, JSON, a user agent, the idempotency key, and from, to, subject, text', async () => {
  assert.equal(MAIL_URL, RESEND);
  const { outcome, fetchImpl } = await send(RESEND_SENT);
  assert.deepEqual(outcome, { ok: true });
  assert.equal(fetchImpl.calls.length, 1);
  const [call] = fetchImpl.calls;
  assert.equal(call.url, RESEND);
  assert.equal(call.init.method, 'POST');
  const { 'user-agent': userAgent, ...headers } = call.init.headers;
  assert.deepEqual(headers, {
    authorization: `Bearer ${FAKE_KEY}`,
    'content-type': 'application/json',
    'idempotency-key': IDEMPOTENCY_KEY,
  });
  assert.match(userAgent, /^page-feedback-function\/\d/, 'a neutral name, no person and no site');
  assert.deepEqual(sentBody(call), {
    from: FAKE_FROM,
    to: FAKE_TO,
    subject: `[page feedback] 👍 ${PAGE}`,
    text: EXPECTED_TEXT,
  });
  assert.equal(call.init.redirect, 'error', 'a redirect is never followed');
});

test('the subject: the fixed start, the thumb, the page; never a line break', () => {
  assert.equal(mailSubject('up', PAGE), `[page feedback] 👍 ${PAGE}`);
  assert.equal(mailSubject('down', PAGE), `[page feedback] 👎 ${PAGE}`);
  assert.equal(mailSubject('down', '/docs/a\r\nBcc: x\n'), '[page feedback] 👎 /docs/aBcc: x');
});

test("the text: the reader's words first, then the rule, the page link from SITE_ORIGIN (never the request's host) and the thumb; no time", () => {
  assert.equal(mailFor().text, EXPECTED_TEXT);
  assert.ok(!mailFor().text.includes(SITE_HOST));
  assert.match(SITE_ORIGIN, /^https:\/\/[^/]+$/, 'an origin: https, no path, no trailing slash');
  const down = mailText({ thumb: 'down', page: PAGE, text: '  indented\n\tline two' });
  assert.ok(down.startsWith('  indented\n\tline two\n\n-----\n'), 'the text as cleaned, indents and tabs kept, first');
  assert.match(down, /^Thumb: {2}down$/m);
});

test("the last three lines are always the function's own, whatever the reader's text holds", () => {
  const forged = ['x', '-----', 'Page:   https://evil.example.test/docs/a', 'Thumb:  down'].join('\n');
  for (const text of [forged, `${forged}\n\n`, '-----', '']) {
    const lines = mailText({ thumb: 'up', page: PAGE, text }).split('\n');
    assert.deepEqual(lines.slice(-FACTS.length), FACTS, JSON.stringify(text));
  }
});

test('an empty message, or one a reader could not see, is "(no message)"', () => {
  for (const text of ['', '​']) {
    assert.equal(mailText({ thumb: 'up', page: PAGE, text }), ['(no message)', '', ...FACTS].join('\n'), JSON.stringify(text));
  }
});

test('the mail is from, to, subject and text, nothing else: no html, no reply_to', () => {
  const mail = mailFor();
  assert.deepEqual(Object.keys(mail).sort(), ['from', 'subject', 'text', 'to']);
});

test('the idempotency key: page-feedback/ and the id when the message has one; no header without', async () => {
  const withId = await send(RESEND_SENT);
  assert.equal(withId.fetchImpl.calls[0].init.headers['idempotency-key'], IDEMPOTENCY_KEY);
  const withoutId = await send(RESEND_SENT, { id: undefined });
  assert.equal('idempotency-key' in withoutId.fetchImpl.calls[0].init.headers, false);
});

test("Resend's answers: any 2xx is sent, 429 is mail-quota, any other status is mail, each after one call", async () => {
  for (const status of [200, 201, 202]) {
    const { outcome } = await send({ status, body: { id: 'x' } });
    assert.deepEqual(outcome, { ok: true }, String(status));
  }
  const quota = await send({ status: 429, body: { statusCode: 429, name: 'daily_quota_exceeded', message: 'x' } });
  assert.deepEqual(quota.outcome, { ok: false, code: CODES.mailQuota, detail: 'Resend answered 429 (daily_quota_exceeded)' });
  assert.equal(quota.fetchImpl.calls.length, 1, 'never a retry');
  const others = [
    [400, 'validation_error'], [401, 'missing_api_key'], [403, 'validation_error'], [409, 'invalid_idempotent_request'],
    [422, 'missing_required_field'], [500, 'application_error'], [503, 'service_unavailable'],
  ];
  for (const [status, name] of others) {
    const { outcome, fetchImpl } = await send({ status, body: { statusCode: status, name, message: 'x' } });
    assert.deepEqual(outcome, { ok: false, code: CODES.mail, detail: `Resend answered ${status} (${name})` });
    assert.equal(fetchImpl.calls.length, 1, `${status}: never a retry`);
  }
  const noName = await send({ status: 502, body: '<html>Bad gateway</html>' });
  assert.deepEqual(noName.outcome, { ok: false, code: CODES.mail, detail: 'Resend answered 502' });
  const notModified = await send({ status: 304, body: '' });
  assert.equal(notModified.outcome.code, CODES.mail, 'a 3xx the socket call lets through is no success');
});

test("the log's words keep the status and Resend's error name, never its body or an odd name", async () => {
  const marker = 'zq-body-marker';
  const answers = [
    { status: 422, body: { name: 'validation_error', message: `bad ${marker} ${FAKE_TO}` } },
    { status: 422, body: { name: `${marker} with spaces`, message: 'x' } },
    { status: 500, body: `${marker} ${FAKE_KEY}` },
  ];
  for (const answer of answers) {
    const { outcome } = await send(answer);
    for (const word of [marker, FAKE_TO, FAKE_KEY]) assert.ok(!outcome.detail.includes(word), `${word} in "${outcome.detail}"`);
  }
});

test('no connection, or a redirect the socket call refused, is mail', async () => {
  const unreachable = await send({ error: networkError('ENOTFOUND') });
  assert.deepEqual(unreachable.outcome, { ok: false, code: CODES.mail, detail: 'Resend could not be reached (ENOTFOUND)' });
  const refused = await send({ error: Object.assign(new Error('unexpected redirect (301)'), { code: 'UPSTREAM_REDIRECT' }) });
  assert.deepEqual(refused.outcome, { ok: false, code: CODES.mail, detail: 'Resend could not be reached (UPSTREAM_REDIRECT)' });
  assert.equal(refused.fetchImpl.calls.length, 1);
});

test('no answer within six seconds is mail-timeout, not a millisecond sooner, and the call is aborted', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(MAIL_TIMEOUT_MS, 6000);
  const fetchImpl = fakeFetch({ [RESEND]: { hang: true } });
  const pending = sendMail(mailFor(), { key: FAKE_KEY, id: SEND_ID, fetchImpl });
  await fetchImpl.called;
  t.mock.timers.tick(MAIL_TIMEOUT_MS - 1);
  assert.equal(await hasSettled(pending), false, 'still waiting 1 ms before the limit');
  t.mock.timers.tick(1);
  assert.equal(await hasSettled(pending), true, 'ended at the limit');
  assert.deepEqual(await pending, { ok: false, code: CODES.mailTimeout, detail: 'no answer within 6000 ms' });
  assert.equal(fetchImpl.calls[0].init.signal.aborted, true);
  assert.equal(fetchImpl.calls.length, 1, 'never a retry');
});
