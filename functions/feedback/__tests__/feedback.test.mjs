/**
 * feedback.test.mjs: functions/feedback/feedback.mjs, the function as Netlify runs it. The checks
 * run in their order and the first five never read the body; only a POST (OPTIONS is a 405)
 * typed application/json from this site's own page is read; no answer carries a CORS header; the
 * rate limit on a fake clock; setup (the answer names no variable, the log does); the size limit
 * in bytes, declared and read; the field rules on the server, the text required after a thumbs
 * down and the whitelist among them; the captcha (not set up, a missing token, a refused token,
 * another host, Cloudflare down, no answer in time and not a millisecond sooner); the mail
 * service's 429, 5xx and time-out (the same), and the two time limits together inside Netlify's
 * shortest limit; the idempotency key, and two tries of one message, 37 s apart across a new year
 * and each with a fresh captcha token, as the same request; every answer JSON { ok, code } at its
 * status, never cached, holding no word of the request, no variable, no service and no address;
 * one log line per refusal and none for a message sent, never the text, the page, the client's
 * address or the token; the key and the captcha's secret in no answer and no log line; the
 * default export, once with what Netlify gives it (the variables in process.env, both outgoing
 * calls over node:https, never the global fetch); and the site's shim. The rules of the parts are
 * tested beside them: fields.test.mjs, captcha.test.mjs, mail.test.mjs. A fake fetch stands in
 * for Cloudflare and Resend, a fake of node:https's request for the socket (fakes.mjs), and
 * node:test's mock timers for the clock: no network, no listening socket, no waiting.
 * Run with `node --test functions/feedback/__tests__/feedback.test.mjs` (package.json >
 * shared:verify names this file).
 *
 * HOW TO CHANGE IT
 *   A new check in feedback.mjs: its test here, and a step in the test of the order, in the order
 *   the function runs them. A new answer: a case in everyAnswer().
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as feedback from '../feedback.mjs';
import { CAPTCHA_TIMEOUT_MS } from '../lib/captcha.mjs';
import { USER_AGENT, createRateLimiter } from '../lib/helpers.mjs';
import { MAIL_TIMEOUT_MS } from '../lib/mail.mjs';
import { CODES, MAX_CAPTCHA_LENGTH, MAX_PAGE_LENGTH, MAX_TEXT_LENGTH, SEND_TIMEOUT_MS } from '../../../src/components/PageFeedback/rules.js';
import {
  CAPTCHA_PASSED, FAKE_CAPTCHA_SECRET, FAKE_FROM, FAKE_KEY, FAKE_TO, FAKE_TOKEN, FEEDBACK_PATH, NOW, PAGE, RESEND,
  RESEND_SENT, SEND_ID, SITE_HOST, SITE_ORIGIN, SITEVERIFY, answerText, bodilessRequest, bodyOf, captchaEnv,
  corsHeadersOf, fakeEnv, fakeHttpsRequest, feedbackRequest, hasSettled, logRecorder, message, networkError, sentBody,
  servicesUp, siteHeaders,
} from './fakes.mjs';

const { handleFeedback, MAX_BODY_BYTES, MESSAGE_LIMIT, STATUS_OF_CODE } = feedback;

/** The site's shim (netlify/functions/feedback.mjs): the file Netlify deploys at FEEDBACK_ENDPOINT. */
const SHIM_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../netlify/functions/feedback.mjs');

/** The client's address, as Netlify's context gives it. */
const CLIENT_IP = '203.0.113.9';

/** A text no answer and no log line may hold. */
const TEXT_MARKER = 'zq-text-marker';

/** The name of the answer to a message that was sent, beside the codes of the refusals. */
const SENT = 'sent';

/** What would tell a caller how the site is set up: a variable, a service, an address. */
const SETUP_WORDS = /FEEDBACK_|resend|cloudflare|turnstile|siteverify|@/i;

/** The four variables' names, as Netlify's project holds them. */
const VARIABLE_NAMES = Object.freeze(Object.keys(captchaEnv()));

/** How far apart the two tries of one message are: a reader who presses Send again later. */
const RETRY_GAP_MS = 37_000;

/**
 * The first of those two tries: 15 s before a new year, so the second comes in another second,
 * minute, hour, day, month and year, and no reading of the time can be the same for both.
 */
const BEFORE_NEW_YEAR = Date.UTC(2026, 11, 31, 23, 59, 45, 123);

/** The shortest time Netlify has given a function of this kind to answer, in milliseconds. */
const SHORTEST_NETLIFY_LIMIT_MS = 10_000;

/** The statuses of THE CHECKS (feedback.mjs; README.md > What it checks), written out. */
const EXPECTED_STATUSES = Object.freeze({
  [CODES.method]: 405,
  [CODES.mediaType]: 415,
  [CODES.origin]: 403,
  [CODES.rate]: 429,
  [CODES.setup]: 500,
  [CODES.size]: 413,
  [CODES.fields]: 400,
  [CODES.captcha]: 403,
  [CODES.captchaUnavailable]: 503,
  [CODES.mail]: 502,
  [CODES.mailQuota]: 503,
  [CODES.mailTimeout]: 504,
});

/** Cloudflare's answer to a token it refuses. */
const TOKEN_REFUSED = Object.freeze({ status: 200, body: { success: false, 'error-codes': ['invalid-input-response'] } });

/**
 * handleFeedback for the fake site: no captcha, both services up, no rate limit, the client at
 * CLIENT_IP, the clock at NOW, the log kept. `options` replace any of those.
 * Gives { response, fetchImpl, logged }.
 */
async function run(request, options = {}) {
  const logged = logRecorder();
  const fetchImpl = options.fetchImpl ?? servicesUp();
  const defaults = { env: fakeEnv(), limiter: null, context: { ip: CLIENT_IP }, now: () => NOW, log: logged.log };
  const response = await handleFeedback(request, { ...defaults, ...options, fetchImpl });
  return { response, fetchImpl, logged };
}

/** A limiter whose bucket for `key` is empty at NOW: the next message is refused. */
function emptyLimiter(key = CLIENT_IP) {
  const limiter = createRateLimiter(MESSAGE_LIMIT);
  for (let taken = 0; taken < MESSAGE_LIMIT.limit; taken += 1) limiter.take(key, NOW);
  return limiter;
}

/** A body of exactly `bytes` bytes: a valid message, padded with spaces (JSON allows them). */
function paddedBody(bytes) {
  const json = JSON.stringify(message());
  return `${json}${' '.repeat(bytes - Buffer.byteLength(json, 'utf8'))}`;
}

/** How Node begins a warning it writes itself: "(node:<pid>) ExperimentalWarning: …". */
const NODE_WARNING_START = '(node:';

/**
 * What a mocked console.error was given, without the warnings Node writes there itself (under
 * Node 22, the one for node:test's mock timers, which may come late, during another test). Every
 * other line stays, so a line of the function's without its "[feedback]" start is seen too.
 */
function errorLines(errorLog) {
  return errorLog.mock.calls.map((call) => String(call.arguments[0])).filter((line) => !line.startsWith(NODE_WARNING_START));
}

/**
 * `body()`'s result, with process.env holding `values` for the four variables and none of the
 * others; each variable is put back as it was afterwards, whatever happens.
 */
async function withProcessEnv(values, body) {
  const saved = VARIABLE_NAMES.map((name) => [name, process.env[name]]);
  try {
    for (const name of VARIABLE_NAMES) delete process.env[name];
    Object.assign(process.env, values);
    return await body();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** One request for every answer of the function but the time-outs (they need the mock clock): [{ name, response, logged }]. */
async function everyAnswer() {
  const text = message({ text: TEXT_MARKER });
  const withToken = message({ text: TEXT_MARKER, captcha: FAKE_TOKEN });
  const cases = [
    [SENT, feedbackRequest(text), {}],
    [CODES.method, bodilessRequest('OPTIONS', siteHeaders({ 'access-control-request-method': 'POST' })), {}],
    [CODES.mediaType, feedbackRequest(text, { headers: siteHeaders({ 'content-type': 'text/plain' }) }), {}],
    [CODES.origin, feedbackRequest(text, { headers: siteHeaders({ origin: 'https://evil.example.test' }) }), {}],
    [CODES.rate, feedbackRequest(text), { limiter: emptyLimiter() }],
    [CODES.setup, feedbackRequest(text), { env: fakeEnv({ FEEDBACK_EMAIL_TO: undefined }) }],
    [CODES.size, feedbackRequest(message({ text: TEXT_MARKER.repeat(MAX_BODY_BYTES) })), {}],
    [CODES.fields, feedbackRequest(message({ text: TEXT_MARKER, page: `/docs/${TEXT_MARKER}?` })), {}],
    [CODES.captcha, feedbackRequest(withToken), { env: captchaEnv(), fetchImpl: servicesUp({ [SITEVERIFY]: TOKEN_REFUSED }) }],
    [CODES.captchaUnavailable, feedbackRequest(withToken), { env: captchaEnv(), fetchImpl: servicesUp({ [SITEVERIFY]: { status: 503 } }) }],
    [CODES.mail, feedbackRequest(text), { fetchImpl: servicesUp({ [RESEND]: { status: 422, body: { name: 'validation_error' } } }) }],
    [CODES.mailQuota, feedbackRequest(text), { fetchImpl: servicesUp({ [RESEND]: { status: 429, body: { name: 'daily_quota_exceeded' } } }) }],
  ];
  const answers = [];
  for (const [name, request, options] of cases) answers.push({ name, ...(await run(request, options)) });
  return answers;
}

test('a message that passes every check is mailed once: 200 { ok: true }, JSON, never cached, and nothing is logged', async () => {
  const { response, fetchImpl, logged } = await run(feedbackRequest(message()));
  assert.equal(response.status, 200);
  assert.deepEqual(await bodyOf(response), { ok: true });
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(fetchImpl.callsTo(RESEND).length, 1);
  assert.equal(fetchImpl.callsTo(SITEVERIFY).length, 0, 'no captcha set up: Cloudflare is never asked');
  assert.deepEqual(logged.lines, []);
});

test('every code of rules.js has the status THE CHECKS give it (feedback.mjs; README.md > What it checks)', () => {
  assert.deepEqual(Object.keys(STATUS_OF_CODE).sort(), Object.values(CODES).sort());
  assert.deepEqual({ ...STATUS_OF_CODE }, EXPECTED_STATUSES);
});

test('every answer is JSON { ok, code } at its status, never cached, and none carries a CORS header', async () => {
  for (const { name, response } of await everyAnswer()) {
    const expected = name === SENT ? { ok: true } : { ok: false, code: name };
    assert.deepEqual(await bodyOf(response), expected, name);
    assert.equal(response.status, name === SENT ? 200 : EXPECTED_STATUSES[name], name);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8', name);
    assert.equal(response.headers.get('cache-control'), 'no-store', name);
    assert.deepEqual(corsHeadersOf(response), [], name);
  }
});

test('no answer holds a word of the request, a variable, a service or an address', async () => {
  for (const { name, response } of await everyAnswer()) {
    const text = await answerText(response);
    assert.doesNotMatch(text, SETUP_WORDS, name);
    for (const word of [TEXT_MARKER, PAGE, FAKE_TOKEN, FAKE_FROM, FAKE_TO, CLIENT_IP, SITE_HOST]) {
      assert.ok(!text.includes(word), `${name}: ${word}`);
    }
  }
});

test('the log: one line per refusal, "[feedback] <code>: …"; none for a message sent; never the text, the page, the address or the token', async () => {
  for (const { name, logged } of await everyAnswer()) {
    if (name === SENT) {
      assert.deepEqual(logged.lines, []);
      continue;
    }
    assert.equal(logged.lines.length, 1, name);
    assert.ok(logged.lines[0].startsWith(`[feedback] ${name}: `), logged.lines[0]);
    for (const word of [TEXT_MARKER, PAGE, FAKE_TOKEN, CLIENT_IP]) assert.ok(!logged.lines[0].includes(word), `${name}: ${word}`);
  }
});

test('the order of the checks: method, media type, origin, rate limit, setup, size, fields, captcha, mail; the first five never read the body', async () => {
  // Each step's request also fails every check after its own, so only the order can decide.
  const foreign = siteHeaders({ origin: 'https://evil.example.test' });
  const broken = captchaEnv({ FEEDBACK_EMAIL_FROM: '' });
  const oversized = message({ text: 'x'.repeat(MAX_BODY_BYTES) });
  const failing = servicesUp({ [SITEVERIFY]: TOKEN_REFUSED, [RESEND]: { status: 500 } });
  const steps = [
    [CODES.method, feedbackRequest(oversized, { method: 'PUT', headers: { ...foreign, 'content-type': 'text/plain' } }), { env: broken, limiter: emptyLimiter() }],
    [CODES.mediaType, feedbackRequest(oversized, { headers: { ...foreign, 'content-type': 'text/plain' } }), { env: broken, limiter: emptyLimiter() }],
    [CODES.origin, feedbackRequest(oversized, { headers: foreign }), { env: broken, limiter: emptyLimiter() }],
    [CODES.rate, feedbackRequest(oversized), { env: broken, limiter: emptyLimiter() }],
    [CODES.setup, feedbackRequest(oversized), { env: broken }],
    [CODES.size, feedbackRequest(oversized), { env: captchaEnv(), fetchImpl: failing }],
    [CODES.fields, feedbackRequest(message({ thumb: 'sideways' })), { env: captchaEnv(), fetchImpl: failing }],
    [CODES.captcha, feedbackRequest(message({ captcha: FAKE_TOKEN })), { env: captchaEnv(), fetchImpl: failing }],
    [CODES.mail, feedbackRequest(message({ captcha: FAKE_TOKEN })), { env: captchaEnv(), fetchImpl: servicesUp({ [RESEND]: { status: 500 } }) }],
  ];
  const beforeTheBody = [CODES.method, CODES.mediaType, CODES.origin, CODES.rate, CODES.setup];
  for (const [code, request, options] of steps) {
    const { response, fetchImpl } = await run(request, options);
    assert.equal((await bodyOf(response)).code, code);
    assert.equal(request.bodyUsed, !beforeTheBody.includes(code), `${code}: the body was ${request.bodyUsed ? '' : 'not '}read`);
    assert.equal(fetchImpl.callsTo(SITEVERIFY).length, [CODES.captcha, CODES.mail].includes(code) ? 1 : 0, code);
    assert.equal(fetchImpl.callsTo(RESEND).length, code === CODES.mail ? 1 : 0, code);
  }
});

test('only POST: GET, HEAD, PUT, DELETE and a CORS preflight (OPTIONS) are 405 with allow: POST; nothing is read, sent or counted', async () => {
  const limiter = createRateLimiter(MESSAGE_LIMIT);
  const preflight = siteHeaders({ 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' });
  const requests = [
    bodilessRequest('GET'),
    bodilessRequest('HEAD'),
    bodilessRequest('OPTIONS', preflight),
    feedbackRequest(message(), { method: 'PUT' }),
    feedbackRequest(message(), { method: 'DELETE' }),
  ];
  for (const request of requests) {
    const { response, fetchImpl, logged } = await run(request, { limiter });
    assert.equal(response.status, 405, request.method);
    assert.equal(response.headers.get('allow'), 'POST');
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.method });
    assert.deepEqual(corsHeadersOf(response), []);
    assert.equal(request.bodyUsed, false);
    assert.equal(fetchImpl.calls.length, 0);
    assert.deepEqual(logged.lines, ['[feedback] method: not a POST']);
  }
  assert.equal(limiter.size(), 0, 'no bucket was touched');
});

test('only application/json: any other content type, or none, is a 415 before the body is read', async () => {
  // What another site can send without a preflight (a form, a no-cors fetch), and near misses.
  const refused = [undefined, '', 'text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonp', 'text/json'];
  for (const contentType of refused) {
    const headers = contentType === undefined ? { origin: SITE_ORIGIN } : siteHeaders({ 'content-type': contentType });
    const request = feedbackRequest(message(), { headers });
    const { response, fetchImpl, logged } = await run(request);
    assert.equal(response.status, 415, String(contentType));
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.mediaType });
    assert.equal(request.bodyUsed, false);
    assert.equal(fetchImpl.calls.length, 0);
    assert.deepEqual(logged.lines, ['[feedback] media-type: not application/json']);
  }
  for (const contentType of ['application/json; charset=utf-8', 'Application/JSON ; charset=UTF-8']) {
    const { response } = await run(feedbackRequest(message(), { headers: siteHeaders({ 'content-type': contentType }) }));
    assert.equal(response.status, 200, contentType);
  }
});

test('the origin: an Origin header naming this site, over https, or http on a loopback host; anything else is a 403 before the body is read', async () => {
  const refused = [
    ['no Origin header', { 'content-type': 'application/json' }, 'no Origin header'],
    ["a Referer of the site, no Origin", { 'content-type': 'application/json', referer: `${SITE_ORIGIN}${PAGE}` }, 'no Origin header'],
    ["an opaque Origin, with a Referer of the site", siteHeaders({ origin: 'null', referer: `${SITE_ORIGIN}${PAGE}` }), 'no Origin header'],
    ['another site', siteHeaders({ origin: 'https://evil.example.test' }), 'not this site'],
    ["a name that starts with the site's", siteHeaders({ origin: `https://${SITE_HOST}.evil.test` }), 'not this site'],
    ["plain http on the site's host", siteHeaders({ origin: `http://${SITE_HOST}` }), 'not this site'],
    ['another port', siteHeaders({ origin: `${SITE_ORIGIN}:8443` }), 'not this site'],
    ['not an origin', siteHeaders({ origin: 'not a url' }), 'not this site'],
  ];
  for (const [label, headers, reason] of refused) {
    const request = feedbackRequest(message(), { headers });
    const { response, fetchImpl, logged } = await run(request);
    assert.equal(response.status, 403, label);
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.origin }, label);
    assert.equal(request.bodyUsed, false, label);
    assert.equal(fetchImpl.calls.length, 0, label);
    assert.deepEqual(logged.lines, [`[feedback] origin: ${reason}`], label);
  }
  const allowed = [
    feedbackRequest(message(), { headers: siteHeaders({ origin: 'HTTPS://Notes.Example.TEST' }) }),
    feedbackRequest(message(), { headers: siteHeaders({ origin: 'http://localhost:8892' }), site: 'http://localhost:8892' }),
    feedbackRequest(message(), { headers: siteHeaders({ origin: 'http://127.0.0.1:8892' }), site: 'http://127.0.0.1:8892' }),
  ];
  for (const request of allowed) assert.equal((await run(request)).response.status, 200, request.headers.get('origin'));
});

test('the rate limit on a fake clock: 5 in 600 s per client, then a 429 with retry-after, one more every 120 s; each client its own bucket; no address logged', async () => {
  assert.deepEqual({ ...MESSAGE_LIMIT }, { limit: 5, windowSeconds: 600 });
  const limiter = createRateLimiter(MESSAGE_LIMIT);
  let clock = NOW;
  const send = (ip = CLIENT_IP) => run(feedbackRequest(message()), { limiter, now: () => clock, context: { ip } });
  for (let sent = 0; sent < MESSAGE_LIMIT.limit; sent += 1) assert.equal((await send()).response.status, 200);
  const request = feedbackRequest(message());
  const refused = await run(request, { limiter, now: () => clock, context: { ip: CLIENT_IP } });
  assert.equal(refused.response.status, 429);
  assert.deepEqual(await bodyOf(refused.response), { ok: false, code: CODES.rate });
  assert.equal(refused.response.headers.get('retry-after'), '120');
  assert.equal(request.bodyUsed, false);
  assert.equal(refused.fetchImpl.calls.length, 0);
  assert.deepEqual(refused.logged.lines, ['[feedback] rate: over 5 in 600 s, retry after 120 s']);
  clock = NOW + 119_000;
  const early = await send();
  assert.equal(early.response.status, 429);
  assert.equal(early.response.headers.get('retry-after'), '1');
  clock = NOW + 120_000;
  assert.equal((await send()).response.status, 200, 'one token back after 120 s');
  assert.equal((await send('198.51.100.4')).response.status, 200, 'another client has its own bucket');
});

test('without a limiter of its own, the function keeps one per instance at MESSAGE_LIMIT', async () => {
  const context = { ip: '192.0.2.201' }; // a client no other test uses
  const statuses = [];
  for (let sent = 0; sent <= MESSAGE_LIMIT.limit; sent += 1) {
    const logged = logRecorder();
    const response = await handleFeedback(feedbackRequest(message()), { env: fakeEnv(), fetchImpl: servicesUp(), context, now: () => NOW, log: logged.log });
    statuses.push(response.status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

test('setup: a missing or blank mail variable is a 500 whose answer names no variable; the log names each one missing', async () => {
  const cases = [
    [{ FEEDBACK_EMAIL_API_KEY: undefined }, 'FEEDBACK_EMAIL_API_KEY not set'],
    [{ FEEDBACK_EMAIL_FROM: '' }, 'FEEDBACK_EMAIL_FROM not set'],
    [{ FEEDBACK_EMAIL_TO: '   ' }, 'FEEDBACK_EMAIL_TO not set'],
    [{ FEEDBACK_EMAIL_API_KEY: '', FEEDBACK_EMAIL_TO: undefined }, 'FEEDBACK_EMAIL_API_KEY, FEEDBACK_EMAIL_TO not set'],
  ];
  for (const [overrides, line] of cases) {
    const request = feedbackRequest(message());
    const { response, fetchImpl, logged } = await run(request, { env: fakeEnv(overrides) });
    assert.equal(response.status, 500, line);
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.setup });
    assert.doesNotMatch(await answerText(response), /FEEDBACK_/);
    assert.deepEqual(logged.lines, [`[feedback] setup: ${line}`]);
    assert.equal(request.bodyUsed, false);
    assert.equal(fetchImpl.calls.length, 0);
  }
  const none = await run(feedbackRequest(message()), { env: {} });
  assert.deepEqual(none.logged.lines, ['[feedback] setup: FEEDBACK_EMAIL_API_KEY, FEEDBACK_EMAIL_FROM, FEEDBACK_EMAIL_TO not set']);
  const trimmed = await run(feedbackRequest(message()), { env: fakeEnv({ FEEDBACK_EMAIL_API_KEY: ` ${FAKE_KEY}\n`, FEEDBACK_EMAIL_TO: `${FAKE_TO} ` }) });
  assert.equal(trimmed.response.status, 200, 'the ends of a value are trimmed');
  const [call] = trimmed.fetchImpl.callsTo(RESEND);
  assert.equal(call.init.headers.authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(sentBody(call).to, FAKE_TO);
});

test('a key a header cannot carry is a 500 setup: the log says why and never shows the key; nothing is sent', async () => {
  for (const key of [`${FAKE_KEY}\n${FAKE_KEY}`, `${FAKE_KEY}\rx`, `${FAKE_KEY}\0`, `${FAKE_KEY}€`]) {
    const { response, fetchImpl, logged } = await run(feedbackRequest(message()), { env: fakeEnv({ FEEDBACK_EMAIL_API_KEY: key }) });
    assert.equal(response.status, 500);
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.setup });
    assert.deepEqual(logged.lines, ['[feedback] setup: FEEDBACK_EMAIL_API_KEY holds a character a header cannot carry']);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('the size: a content-length over 16,384 bytes is a 413 before the body is read', async () => {
  assert.equal(MAX_BODY_BYTES, 16384);
  const request = feedbackRequest(message(), { headers: siteHeaders({ 'content-length': String(MAX_BODY_BYTES + 1) }) });
  const { response, fetchImpl, logged } = await run(request);
  assert.equal(response.status, 413);
  assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.size });
  assert.equal(request.bodyUsed, false);
  assert.equal(fetchImpl.calls.length, 0);
  assert.deepEqual(logged.lines, ['[feedback] size: over 16384 bytes']);
});

test('the size: a body of exactly 16,384 bytes is read; one byte more is a 413; a body without a content-length is read no further than the limit', async () => {
  assert.equal((await run(feedbackRequest(paddedBody(MAX_BODY_BYTES)))).response.status, 200);
  const over = await run(feedbackRequest(paddedBody(MAX_BODY_BYTES + 1)));
  assert.equal(over.response.status, 413);
  assert.equal(over.fetchImpl.calls.length, 0);
  // A stream of 20 chunks of 4,096 bytes, handed over only when asked for.
  const chunk = new Uint8Array(4096).fill(0x20);
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled += 1;
      controller.enqueue(chunk);
      if (pulled === 20) controller.close();
    },
  }, { highWaterMark: 0 });
  const streamed = new Request(`${SITE_ORIGIN}${FEEDBACK_PATH}`, { method: 'POST', headers: siteHeaders(), body: stream, duplex: 'half' });
  const { response } = await run(streamed);
  assert.equal(response.status, 413);
  assert.ok(pulled <= Math.ceil(MAX_BODY_BYTES / chunk.byteLength) + 1, `${pulled} chunks read`);
});

test('the size counts bytes, not characters', async () => {
  const text = 'é'.repeat(MAX_BODY_BYTES / 2); // 8,192 characters, 16,384 bytes
  const request = feedbackRequest(message({ text }));
  assert.ok(JSON.stringify(message({ text })).length < MAX_BODY_BYTES, 'fewer characters than the limit');
  assert.equal((await run(request)).response.status, 413, 'but more bytes');
});

test('the largest message the rules allow fits in MAX_BODY_BYTES, and is mailed', async () => {
  const largest = message({
    thumb: 'down',
    page: `/docs/${'a'.repeat(MAX_PAGE_LENGTH - '/docs/'.length)}`,
    text: '👍'.repeat(MAX_TEXT_LENGTH),
    captcha: 'x'.repeat(MAX_CAPTCHA_LENGTH),
    id: 'x'.repeat(64),
  });
  const bytes = Buffer.byteLength(JSON.stringify(largest), 'utf8');
  assert.ok(bytes <= MAX_BODY_BYTES, `${bytes} bytes`);
  const { response } = await run(feedbackRequest(largest), { env: captchaEnv() });
  assert.equal(response.status, 200);
});

test('the fields are checked on the server: a refusal is 400 fields, and its log line names the field, never its value', async () => {
  const cases = [
    ['{not json', 'not JSON'],
    ['[]', 'not a JSON object'],
    [message({ thumb: 'sideways' }), 'thumb'],
    [message({ page: '/about' }), 'page'],
    [message({ text: 7 }), 'text is not a string'],
    [message({ text: 'x'.repeat(MAX_TEXT_LENGTH + 1) }), 'text too long'],
  ];
  for (const [body, reason] of cases) {
    const { response, fetchImpl, logged } = await run(feedbackRequest(body));
    assert.equal(response.status, 400, reason);
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.fields });
    assert.deepEqual(logged.lines, [`[feedback] fields: ${reason}`]);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('text is required after a thumbs down, on the server too; after a thumbs up an empty text is mailed as "(no message)"', async () => {
  for (const text of ['', ' \n\t', '​']) {
    const { response, fetchImpl, logged } = await run(feedbackRequest(message({ thumb: 'down', text })));
    assert.equal(response.status, 400, JSON.stringify(text));
    assert.deepEqual(logged.lines, ['[feedback] fields: text required']);
    assert.equal(fetchImpl.calls.length, 0);
  }
  const up = await run(feedbackRequest(message({ thumb: 'up', text: '' })));
  assert.equal(up.response.status, 200);
  assert.ok(sentBody(up.fetchImpl.callsTo(RESEND)[0]).text.startsWith('(no message)\n\n-----\n'));
});

test('the whitelist: keys other than the five are ignored, and none of them reaches the mail', async () => {
  const extra = { to: 'zq-to', from: 'zq-from', subject: 'zq-subject', html: '<b>zq</b>', reply_to: 'zq-reply', remoteip: '192.0.2.55', headers: { bcc: 'zq' } };
  const { response, fetchImpl } = await run(feedbackRequest({ ...message(), ...extra }));
  assert.equal(response.status, 200);
  const [call] = fetchImpl.callsTo(RESEND);
  const sent = sentBody(call);
  assert.deepEqual(Object.keys(sent).sort(), ['from', 'subject', 'text', 'to']);
  assert.equal(sent.from, FAKE_FROM);
  assert.equal(sent.to, FAKE_TO);
  assert.ok(!call.init.body.includes('zq') && !call.init.body.includes('192.0.2.55'), 'no other key reached the mail');
});

test('the mail: the page link starts with the site\'s own address, never the host of the request, and holds no address of the client', async () => {
  const { fetchImpl } = await run(feedbackRequest(message({ page: `${PAGE}/` })), { context: { ip: CLIENT_IP } });
  const [call] = fetchImpl.callsTo(RESEND);
  const { text, subject } = sentBody(call);
  assert.match(text, new RegExp(`^Page: {3}https://[^/\\s]+${PAGE}$`, 'm'));
  assert.ok(!text.includes(SITE_HOST), 'not the request\'s host');
  assert.equal(subject, `[page feedback] 👍 ${PAGE}`);
  assert.ok(!call.init.body.includes(CLIENT_IP));
});

test('the captcha, not set up: Cloudflare is never asked, and a token in the body is ignored', async () => {
  for (const captcha of [undefined, FAKE_TOKEN, 7, '']) {
    const { response, fetchImpl } = await run(feedbackRequest(message({ captcha })));
    assert.equal(response.status, 200, JSON.stringify(captcha));
    assert.equal(fetchImpl.callsTo(SITEVERIFY).length, 0);
  }
  const blank = await run(feedbackRequest(message()), { env: captchaEnv({ FEEDBACK_CAPTCHA_SECRET: '  ' }) });
  assert.equal(blank.response.status, 200, 'a blank secret is no captcha');
  assert.equal(blank.fetchImpl.callsTo(SITEVERIFY).length, 0);
});

test('the captcha, set up: a missing or malformed token is 400 fields; neither Cloudflare nor Resend is called', async () => {
  for (const captcha of [undefined, '', 7, 'x'.repeat(MAX_CAPTCHA_LENGTH + 1)]) {
    const { response, fetchImpl, logged } = await run(feedbackRequest(message({ captcha })), { env: captchaEnv() });
    assert.equal(response.status, 400);
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.fields });
    assert.deepEqual(logged.lines, ['[feedback] fields: captcha token']);
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test("the captcha, set up: Cloudflare gets the token and the secret, never the client's address; a refused token or another host is a 403, and no mail", async () => {
  const passed = await run(feedbackRequest(message({ captcha: FAKE_TOKEN })), { env: captchaEnv() });
  assert.equal(passed.response.status, 200);
  const [ask] = passed.fetchImpl.callsTo(SITEVERIFY);
  assert.deepEqual(sentBody(ask), { secret: FAKE_CAPTCHA_SECRET, response: FAKE_TOKEN });
  assert.ok(!ask.init.body.includes(CLIENT_IP));
  assert.equal(passed.fetchImpl.callsTo(RESEND).length, 1);

  const refusals = [
    [TOKEN_REFUSED, 'Cloudflare refused the token (invalid-input-response)'],
    [{ status: 200, body: { success: true, hostname: 'example.com' } }, 'the token was solved on another host'],
  ];
  for (const [answer, reason] of refusals) {
    const { response, fetchImpl, logged } = await run(feedbackRequest(message({ captcha: FAKE_TOKEN })), { env: captchaEnv(), fetchImpl: servicesUp({ [SITEVERIFY]: answer }) });
    assert.equal(response.status, 403, reason);
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.captcha });
    assert.deepEqual(logged.lines, [`[feedback] captcha: ${reason}`]);
    assert.equal(fetchImpl.callsTo(RESEND).length, 0, 'no mail');
  }

  const devSite = 'http://localhost:8892';
  const devRequest = feedbackRequest(message({ captcha: FAKE_TOKEN }), { headers: siteHeaders({ origin: devSite }), site: devSite });
  const devAnswer = { status: 200, body: { success: true, hostname: 'localhost' } };
  const dev = await run(devRequest, { env: captchaEnv(), fetchImpl: servicesUp({ [SITEVERIFY]: devAnswer }) });
  assert.equal(dev.response.status, 200, 'netlify dev: the host names compared without the port');
});

test('the captcha, set up: Cloudflare unreachable or answering 5xx is a 503 captcha-unavailable, and no mail', async () => {
  const answers = [
    [{ error: networkError('ECONNREFUSED') }, 'Cloudflare could not be reached (ECONNREFUSED)'],
    [{ status: 502, body: '' }, 'Cloudflare answered 502'],
  ];
  for (const [answer, reason] of answers) {
    const { response, fetchImpl, logged } = await run(feedbackRequest(message({ captcha: FAKE_TOKEN })), { env: captchaEnv(), fetchImpl: servicesUp({ [SITEVERIFY]: answer }) });
    assert.equal(response.status, 503);
    assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.captchaUnavailable });
    assert.deepEqual(logged.lines, [`[feedback] captcha-unavailable: ${reason}`]);
    assert.equal(fetchImpl.callsTo(RESEND).length, 0, 'fail closed: no mail');
  }
});

test('the captcha, set up: no answer from Cloudflare within three seconds, and not a millisecond sooner, is a 503 captcha-unavailable, and no mail', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetchImpl = servicesUp({ [SITEVERIFY]: { hang: true } });
  const pending = run(feedbackRequest(message({ captcha: FAKE_TOKEN })), { env: captchaEnv(), fetchImpl });
  await fetchImpl.called;
  t.mock.timers.tick(CAPTCHA_TIMEOUT_MS - 1);
  assert.equal(await hasSettled(pending), false, 'still waiting 1 ms before the limit');
  t.mock.timers.tick(1);
  assert.equal(await hasSettled(pending), true, 'answered at the limit');
  const { response, logged } = await pending;
  assert.equal(response.status, 503);
  assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.captchaUnavailable });
  assert.deepEqual(logged.lines, ['[feedback] captcha-unavailable: no answer within 3000 ms']);
  assert.equal(fetchImpl.callsTo(RESEND).length, 0);
});

test("the mail service's 429 is a 503 mail-quota, any other error status or no connection a 502 mail; one call each, never a retry", async () => {
  const answers = [
    [{ status: 429, body: { name: 'rate_limit_exceeded' } }, 503, CODES.mailQuota, 'Resend answered 429 (rate_limit_exceeded)'],
    [{ status: 500, body: { name: 'application_error' } }, 502, CODES.mail, 'Resend answered 500 (application_error)'],
    [{ status: 503, body: '<html>down</html>' }, 502, CODES.mail, 'Resend answered 503'],
    [{ status: 403, body: { name: 'validation_error' } }, 502, CODES.mail, 'Resend answered 403 (validation_error)'],
    [{ error: networkError('ECONNRESET') }, 502, CODES.mail, 'Resend could not be reached (ECONNRESET)'],
  ];
  for (const [answer, status, code, reason] of answers) {
    const { response, fetchImpl, logged } = await run(feedbackRequest(message()), { fetchImpl: servicesUp({ [RESEND]: answer }) });
    assert.equal(response.status, status, reason);
    assert.deepEqual(await bodyOf(response), { ok: false, code });
    assert.deepEqual(logged.lines, [`[feedback] ${code}: ${reason}`]);
    assert.equal(fetchImpl.callsTo(RESEND).length, 1, 'never a retry');
  }
});

test('no answer from the mail service within six seconds, and not a millisecond sooner, is a 504 mail-timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fetchImpl = servicesUp({ [RESEND]: { hang: true } });
  const pending = run(feedbackRequest(message()), { fetchImpl });
  await fetchImpl.called;
  t.mock.timers.tick(MAIL_TIMEOUT_MS - 1);
  assert.equal(await hasSettled(pending), false, 'still waiting 1 ms before the limit');
  t.mock.timers.tick(1);
  assert.equal(await hasSettled(pending), true, 'answered at the limit');
  const { response, logged } = await pending;
  assert.equal(response.status, 504);
  assert.deepEqual(await bodyOf(response), { ok: false, code: CODES.mailTimeout });
  assert.deepEqual(logged.lines, ['[feedback] mail-timeout: no answer within 6000 ms']);
  assert.equal(fetchImpl.callsTo(RESEND).length, 1);
});

test("the two outgoing calls take 9 s at worst: inside the shortest limit Netlify has had for a function (10 s), and the page's own", () => {
  const worst = CAPTCHA_TIMEOUT_MS + MAIL_TIMEOUT_MS;
  const why = `${worst} ms: Netlify, or the page, could give up before the function answers`;
  assert.ok(worst < SHORTEST_NETLIFY_LIMIT_MS, why);
  assert.ok(worst < SEND_TIMEOUT_MS, why);
});

test('the idempotency key: page-feedback/ and the message id when it has the shape, no header otherwise; an id of another shape is no refusal', async () => {
  const withId = await run(feedbackRequest(message()));
  assert.equal(withId.fetchImpl.callsTo(RESEND)[0].init.headers['idempotency-key'], `page-feedback/${SEND_ID}`);
  for (const id of [undefined, 'short', 'has spaces in it', 'x'.repeat(65)]) {
    const { response, fetchImpl } = await run(feedbackRequest(message({ id })));
    assert.equal(response.status, 200, JSON.stringify(id));
    assert.equal('idempotency-key' in fetchImpl.callsTo(RESEND)[0].init.headers, false, JSON.stringify(id));
  }
});

test('two tries of one message, 37 s apart across a new year and each with a fresh captcha token, send the mail service the same body and the same headers, so it answers the second as the first', async (t) => {
  // Both clocks move: the one the function is given, and Date, which any other reading of the
  // time would use. Each try carries a token of its own, as the page sends after a failed try.
  t.mock.timers.enable({ apis: ['Date'], now: BEFORE_NEW_YEAR });
  const tries = [[BEFORE_NEW_YEAR, `${FAKE_TOKEN}-1`], [BEFORE_NEW_YEAR + RETRY_GAP_MS, `${FAKE_TOKEN}-2`]];
  const calls = [];
  for (const [at, captcha] of tries) {
    t.mock.timers.setTime(at);
    const { response, fetchImpl } = await run(feedbackRequest(message({ captcha })), { env: captchaEnv(), now: () => Date.now() });
    assert.equal(response.status, 200);
    assert.equal(sentBody(fetchImpl.callsTo(SITEVERIFY)[0]).response, captcha, 'each try is checked with its own token');
    calls.push(...fetchImpl.callsTo(RESEND));
  }
  assert.equal(calls.length, 2);
  const [first, second] = calls;
  assert.equal(second.init.body, first.init.body, 'the same body: the mail holds no time and no token');
  assert.deepEqual(second.init.headers, first.init.headers, 'the same headers, the idempotency key among them');
});

test('the key and the captcha secret are in no answer and no log line, even when a service sends them back', async () => {
  const withToken = message({ captcha: FAKE_TOKEN });
  const echoes = [
    [feedbackRequest(message()), { fetchImpl: servicesUp({ [RESEND]: { status: 401, body: { name: FAKE_KEY, message: `bad key ${FAKE_KEY}` } } }) }],
    [feedbackRequest(message()), { fetchImpl: servicesUp({ [RESEND]: { error: networkError(FAKE_KEY) } }) }],
    [feedbackRequest(withToken), { env: captchaEnv(), fetchImpl: servicesUp({ [SITEVERIFY]: { status: 200, body: { success: false, 'error-codes': [FAKE_CAPTCHA_SECRET] } } }) }],
  ];
  for (const [request, options] of echoes) {
    const { response, logged } = await run(request, options);
    for (const secret of [FAKE_KEY, FAKE_CAPTCHA_SECRET]) {
      assert.ok(!(await answerText(response)).includes(secret));
      assert.ok(!logged.text().includes(secret), logged.text());
    }
    assert.match(logged.text(), /\[secret\]/, 'what came back was replaced');
  }
  for (const { name, response, logged } of await everyAnswer()) {
    for (const secret of [FAKE_KEY, FAKE_CAPTCHA_SECRET]) {
      assert.ok(!(await answerText(response)).includes(secret), name);
      assert.ok(!logged.text().includes(secret), name);
    }
  }
});

test('a failure no check foresaw (a body that cannot be read) is a 500 { ok: false }; the log names the error, never its message', async () => {
  const failing = new ReadableStream({
    start(controller) {
      controller.error(new Error(`broken near ${TEXT_MARKER}`));
    },
  });
  const request = new Request(`${SITE_ORIGIN}${FEEDBACK_PATH}`, { method: 'POST', headers: siteHeaders(), body: failing, duplex: 'half' });
  const { response, fetchImpl, logged } = await run(request);
  assert.equal(response.status, 500);
  assert.deepEqual(await bodyOf(response), { ok: false });
  assert.deepEqual(logged.lines, ['[feedback] unexpected: Error']);
  assert.equal(fetchImpl.calls.length, 0);
});

test('a log that cannot be written never fails an answer', async () => {
  const response = await handleFeedback(bodilessRequest('GET'), { env: fakeEnv(), limiter: null, log: () => { throw new Error('x'); } });
  assert.equal(response.status, 405);
});

test('the default export is the modern function: a web Request and the context in, a Response out; no handler, no config', async (t) => {
  const errorLog = t.mock.method(console, 'error', () => {});
  assert.equal(typeof feedback.default, 'function');
  assert.equal('handler' in feedback, false, 'a handler export would make the bundler take the Lambda-compatible shape (exports.handler)');
  assert.equal('config' in feedback, false, 'no config: the default /.netlify/functions/feedback URL stays');
  const get = await feedback.default(bodilessRequest('GET'), { ip: CLIENT_IP });
  assert.ok(get instanceof Response);
  assert.equal(get.status, 405, 'answered before any variable or service is needed');
  assert.equal(get.headers.get('allow'), 'POST');
  const foreign = await feedback.default(feedbackRequest(message(), { headers: siteHeaders({ origin: 'https://evil.example.test' }) }), { ip: CLIENT_IP });
  assert.equal(foreign.status, 403);
  assert.deepEqual(errorLines(errorLog), ['[feedback] method: not a POST', '[feedback] origin: not this site'], 'the log goes to console.error');
});

test('the default export with what Netlify gives it: the variables from process.env, both outgoing calls over node:https, never the global fetch', async (t) => {
  const socket = fakeHttpsRequest({ [SITEVERIFY]: CAPTCHA_PASSED, [RESEND]: RESEND_SENT });
  t.mock.method(https, 'request', socket);
  const globalFetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('the global fetch was called');
  });
  const errorLog = t.mock.method(console, 'error', () => {});
  const context = { ip: '192.0.2.202' }; // a client no other test uses
  const request = feedbackRequest(message({ captcha: FAKE_TOKEN }));
  const response = await withProcessEnv(captchaEnv(), () => feedback.default(request, context));
  assert.equal(response.status, 200, await answerText(response));
  assert.deepEqual(await bodyOf(response), { ok: true });
  assert.equal(globalFetch.mock.callCount(), 0, "never the global fetch: Netlify's runtime would name both services in the answer");
  assert.deepEqual(socket.calls.map((call) => [call.method, call.url]), [['POST', SITEVERIFY], ['POST', RESEND]], 'the captcha, then the mail, each over node:https');
  const [ask, mail] = socket.calls;
  assert.deepEqual(JSON.parse(ask.body), { secret: FAKE_CAPTCHA_SECRET, response: FAKE_TOKEN }, 'the secret from process.env');
  assert.deepEqual(mail.headers, {
    authorization: `Bearer ${FAKE_KEY}`,
    'content-type': 'application/json',
    'user-agent': USER_AGENT,
    'idempotency-key': `page-feedback/${SEND_ID}`,
    connection: 'close',
    'content-length': String(Buffer.byteLength(mail.body, 'utf8')),
  });
  const sent = JSON.parse(mail.body);
  assert.deepEqual([sent.from, sent.to], [FAKE_FROM, FAKE_TO], 'the addresses from process.env');
  assert.deepEqual(errorLines(errorLog), [], 'a message sent logs nothing');
});

test("the site's shim re-exports this default export, and a request through it is answered", async (t) => {
  t.mock.method(console, 'error', () => {});
  const shim = await import(pathToFileURL(SHIM_FILE));
  assert.deepEqual(Object.keys(shim), ['default']);
  assert.equal(shim.default, feedback.default, 'the function itself, not a wrapper');
  const preflight = await shim.default(bodilessRequest('OPTIONS', siteHeaders({ 'access-control-request-method': 'POST' })), { ip: CLIENT_IP });
  assert.equal(preflight.status, 405);
  assert.deepEqual(corsHeadersOf(preflight), []);
});
