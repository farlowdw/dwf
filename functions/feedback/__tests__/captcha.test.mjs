/**
 * captcha.test.mjs: functions/feedback/lib/captcha.mjs, the question to Cloudflare Turnstile. The
 * call exactly as sent (one POST to siteverify with the secret and the token, never the reader's
 * IP address, redirects refused); a yes only for success with this host's name (ports and letter
 * case aside); a token Cloudflare refuses, or one solved on another host, is `captcha`; no
 * connection, a 5xx, an answer that is not JSON, Cloudflare's internal-error and no answer within
 * three seconds (and not a millisecond sooner) are `captcha-unavailable`; the log's words never
 * hold the secret, the token or Cloudflare's body. A fake fetch stands in for Cloudflare
 * (fakes.mjs), and node:test's mock timers for the clock: no network, no waiting.
 * Run with `node --test functions/feedback/__tests__/captcha.test.mjs` (package.json >
 * shared:verify names this file).
 *
 * HOW TO CHANGE IT
 *   A new rule of THE VERDICT in lib/captcha.mjs: its case here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPTCHA_TIMEOUT_MS, SITEVERIFY_URL, verifyCaptcha } from '../lib/captcha.mjs';
import { CODES } from '../../../src/components/PageFeedback/rules.js';
import { FAKE_CAPTCHA_SECRET, FAKE_TOKEN, SITE_HOST, SITEVERIFY, fakeFetch, hasSettled, networkError, sentBody } from './fakes.mjs';

/** verifyCaptcha for the fake site, Cloudflare answering `answer`; `host` the host the request was sent to. */
async function verify(answer, host = SITE_HOST) {
  const fetchImpl = fakeFetch({ [SITEVERIFY]: answer });
  const verdict = await verifyCaptcha({ secret: FAKE_CAPTCHA_SECRET, token: FAKE_TOKEN, host, fetchImpl });
  return { verdict, fetchImpl };
}

/** Cloudflare's JSON answer with `fields`. */
function cloudflare(fields, status = 200) {
  return { status, body: { 'error-codes': [], ...fields } };
}

test("the call: one POST to Cloudflare's siteverify with the secret and the token, nothing else, redirects refused", async () => {
  assert.equal(SITEVERIFY_URL, SITEVERIFY);
  const { verdict, fetchImpl } = await verify(cloudflare({ success: true, hostname: SITE_HOST }));
  assert.deepEqual(verdict, { ok: true });
  assert.equal(fetchImpl.calls.length, 1);
  const [call] = fetchImpl.calls;
  assert.equal(call.url, SITEVERIFY);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['content-type'], 'application/json');
  assert.equal(typeof call.init.headers['user-agent'], 'string');
  assert.deepEqual(sentBody(call), { secret: FAKE_CAPTCHA_SECRET, response: FAKE_TOKEN }, 'no remoteip, no idempotency_key');
  assert.equal(call.init.redirect, 'error');
  assert.ok(call.init.signal instanceof AbortSignal, 'the call has a time limit');
});

test("a yes only for success with this host's name: the port and the letter case make no difference", async () => {
  const hosts = [[SITE_HOST, SITE_HOST], [SITE_HOST, 'Notes.Example.TEST'], ['localhost:8892', 'localhost'], ['127.0.0.1:8888', '127.0.0.1']];
  for (const [host, hostname] of hosts) {
    const { verdict } = await verify(cloudflare({ success: true, hostname }), host);
    assert.deepEqual(verdict, { ok: true }, `${host} / ${hostname}`);
  }
});

test('a token Cloudflare refuses is captcha, its error codes kept for the log', async () => {
  for (const codes of [['invalid-input-response'], ['timeout-or-duplicate'], ['invalid-input-secret'], []]) {
    const { verdict } = await verify(cloudflare({ success: false, 'error-codes': codes }));
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, CODES.captcha, codes.join());
    for (const code of codes) assert.match(verdict.detail, new RegExp(code));
  }
  const odd = await verify(cloudflare({ success: 'true', hostname: SITE_HOST }));
  assert.equal(odd.verdict.code, CODES.captcha, 'only the boolean true is a yes');
  const notOk = await verify(cloudflare({ success: true, hostname: SITE_HOST }, 403));
  assert.equal(notOk.verdict.code, CODES.captcha, 'a yes on a status that is not 2xx is no yes');
});

test("a token solved on another host is captcha: Cloudflare's dummy keys (example.com) included", async () => {
  for (const hostname of ['example.com', 'other.example.test', `${SITE_HOST}.evil.test`, '', undefined, 7]) {
    const { verdict } = await verify(cloudflare({ success: true, hostname }));
    assert.equal(verdict.code, CODES.captcha, String(hostname));
    assert.equal(verdict.detail, 'the token was solved on another host');
  }
  const noHost = await verify(cloudflare({ success: true, hostname: '' }), '');
  assert.equal(noHost.verdict.code, CODES.captcha, 'an unknown host never matches');
});

test('no verdict is captcha-unavailable: no connection, a 5xx, an answer that is not JSON, internal-error', async () => {
  const answers = [
    [{ error: networkError('ECONNREFUSED') }, /could not be reached \(ECONNREFUSED\)/],
    [{ error: Object.assign(new Error('x'), { code: 'UPSTREAM_REDIRECT' }) }, /UPSTREAM_REDIRECT/],
    [{ status: 500, body: '' }, /answered 500/],
    [{ status: 503, body: { success: true, hostname: SITE_HOST } }, /answered 503/],
    [{ status: 200, body: '<html>busy</html>' }, /answered 200 without JSON/],
    [{ status: 200, body: '[]' }, /without JSON/],
    [cloudflare({ success: false, 'error-codes': ['internal-error'] }), /could not judge the token \(internal-error\)/],
  ];
  for (const [answer, detail] of answers) {
    const { verdict } = await verify(answer);
    assert.equal(verdict.code, CODES.captchaUnavailable, JSON.stringify(answer));
    assert.match(verdict.detail, detail);
  }
});

test('no answer within three seconds is captcha-unavailable, not a millisecond sooner, and the call is aborted', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(CAPTCHA_TIMEOUT_MS, 3000);
  const fetchImpl = fakeFetch({ [SITEVERIFY]: { hang: true } });
  const pending = verifyCaptcha({ secret: FAKE_CAPTCHA_SECRET, token: FAKE_TOKEN, host: SITE_HOST, fetchImpl });
  await fetchImpl.called;
  t.mock.timers.tick(CAPTCHA_TIMEOUT_MS - 1);
  assert.equal(await hasSettled(pending), false, 'still waiting 1 ms before the limit');
  t.mock.timers.tick(1);
  assert.equal(await hasSettled(pending), true, 'ended at the limit');
  const verdict = await pending;
  assert.deepEqual(verdict, { ok: false, code: CODES.captchaUnavailable, detail: 'no answer within 3000 ms' });
  assert.equal(fetchImpl.calls[0].init.signal.aborted, true);
});

test("the log's words never hold the secret, the token or Cloudflare's body", async () => {
  const marker = 'zq-body-marker';
  const answers = [
    cloudflare({ success: false, 'error-codes': [`${FAKE_TOKEN} ${FAKE_CAPTCHA_SECRET}`, 'invalid-input-response'], note: marker }),
    cloudflare({ success: true, hostname: marker }),
    { status: 502, body: `${marker} ${FAKE_CAPTCHA_SECRET}` },
    { status: 200, body: `${marker} ${FAKE_TOKEN}` },
  ];
  for (const answer of answers) {
    const { verdict } = await verify(answer);
    for (const word of [FAKE_CAPTCHA_SECRET, FAKE_TOKEN, marker]) assert.ok(!verdict.detail.includes(word), `${word} in "${verdict.detail}"`);
  }
});
