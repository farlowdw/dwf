/**
 * functions/feedback/__tests__/fakes.mjs: what the feedback function's tests share. Not a test
 * itself: `node --test` runs only the *.test.mjs files it is given. A fake fetch that answers in
 * place of Cloudflare and Resend and records every call; a fake of node:https's request, for the
 * test that runs the function's own transport; a fake environment; the requests the site's own
 * page sends; a log that keeps its lines; and hasSettled, for the tests of the time limits.
 * Nothing here opens a socket or touches the network.
 *
 * THE MADE-UP VALUES
 *   FAKE_KEY, FAKE_CAPTCHA_SECRET and FAKE_TOKEN are placeholders, never real ones: each is
 *   shorter than 16 characters (the privacy scan, shared/scripts/lib/privacy.mjs, reads a longer
 *   value in that shape as a real secret), and the key is not shaped like a mail service's key.
 *   FAKE_FROM and FAKE_TO stand in for the two addresses and are no addresses: no file of the
 *   feature may hold one (scripts/site-files.test.mjs), and the function passes them on as they
 *   are. SITE_HOST is the host a request is sent to; the mail's own SITE_ORIGIN (lib/mail.mjs) is
 *   another on purpose, so a test sees that the mail never takes the request's host.
 *
 * HOW TO CHANGE IT
 *   A new kind of answer: an option of fakeFetch (today a status and a body, an error to throw, or
 *   no answer at all). The site a request comes from: SITE_HOST. The two services' addresses are
 *   written out here (SITEVERIFY, RESEND), so a changed address in the code fails a test. The
 *   function's own path is the one the page posts to (rules.js > FEEDBACK_ENDPOINT), never a copy.
 */

import { EventEmitter } from 'node:events';
import { FEEDBACK_ENDPOINT } from '../../../src/components/PageFeedback/rules.js';

/** The made-up key and captcha secret, and a token (see THE MADE-UP VALUES in the header). */
export const FAKE_KEY = 'made-up-key-42';
export const FAKE_CAPTCHA_SECRET = 'made-up-cf-9';
export const FAKE_TOKEN = 'made-up-token';

/** Stand-ins for the sending address and the address the mail goes to. */
export const FAKE_FROM = 'sender-box';
export const FAKE_TO = 'owner-box';

/** The site a request is sent to and comes from (.test never resolves). */
export const SITE_HOST = 'notes.example.test';
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** The function's path on the site: the one the page posts to (rules.js > FEEDBACK_ENDPOINT). */
export const FEEDBACK_PATH = FEEDBACK_ENDPOINT;

/** Cloudflare's and Resend's endpoints, as the code must call them. */
export const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const RESEND = 'https://api.resend.com/emails';

/** A page of the site, as its permalink reads. */
export const PAGE = '/docs/software-engineering/sql/ctes';

/** A message id of the browser's shape (crypto.randomUUID()). */
export const SEND_ID = '2f1c5a8e-4b7d-4c3a-9e6f-0123456789ab';

/** A moment in milliseconds (2026-11-22T21:14:05.123Z), for the clock. */
export const NOW = Date.UTC(2026, 10, 22, 21, 14, 5, 123);

/** Resend's answer to a mail it took. */
export const RESEND_SENT = Object.freeze({ status: 200, body: { id: 'made-up-id' } });

/** Cloudflare's yes for a token solved on the site. */
export const CAPTCHA_PASSED = Object.freeze({ status: 200, body: { success: true, hostname: SITE_HOST, 'error-codes': [] } });

/** The environment of a site without a captcha: the three mail variables. */
export function fakeEnv(overrides = {}) {
  return { FEEDBACK_EMAIL_API_KEY: FAKE_KEY, FEEDBACK_EMAIL_FROM: FAKE_FROM, FEEDBACK_EMAIL_TO: FAKE_TO, ...overrides };
}

/** The environment of a site with a captcha. */
export function captchaEnv(overrides = {}) {
  return fakeEnv({ FEEDBACK_CAPTCHA_SECRET: FAKE_CAPTCHA_SECRET, ...overrides });
}

/** A message as the browser sends it (src/components/PageFeedback/sendFeedback.js), with `overrides`. */
export function message(overrides = {}) {
  return { thumb: 'up', page: PAGE, text: 'x', id: SEND_ID, ...overrides };
}

/** The headers of the site's own page sending JSON, plus `extra`. */
export function siteHeaders(extra = {}) {
  return { 'content-type': 'application/json', origin: SITE_ORIGIN, ...extra };
}

/**
 * A POST to the function, the way Netlify hands it over: a web Request on the site's own URL.
 * `body` is sent as it is when a string, else as JSON. `extra.headers` REPLACES the headers,
 * `extra.site` the origin the request is sent to, `extra.method` the method.
 */
export function feedbackRequest(body, extra = {}) {
  const { headers = siteHeaders(), site = SITE_ORIGIN, method = 'POST' } = extra;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(`${site}${FEEDBACK_PATH}`, { method, headers, body: text });
}

/** A request without a body (a GET, a preflight) with these headers. */
export function bodilessRequest(method, headers = siteHeaders()) {
  return new Request(`${SITE_ORIGIN}${FEEDBACK_PATH}`, { method, headers });
}

/** The text of an answer's body: a string as it is, anything else as JSON. */
function bodyText(body) {
  return typeof body === 'string' ? body : JSON.stringify(body);
}

/** A fetch answer: status, headers.get(), text(); an object body is sent as JSON. */
function fakeAnswer({ status = 200, body = '' }) {
  const text = bodyText(body);
  return { status, headers: { get: () => null }, text: async () => text };
}

/** A promise that settles only when the call's signal aborts, as a real fetch does. */
function hangingCall(signal) {
  return new Promise((resolve, reject) => {
    if (!signal) return;
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
}

/**
 * A fake fetch. `routes` maps a URL to its answer: { status, body } to answer, { error } to throw
 * it, { hang: true } to never answer (until the call is aborted). A URL without a route throws.
 * fetchImpl.calls lists { url, init } per call, fetchImpl.callsTo(url) those to one URL, and
 * fetchImpl.called resolves at the first call (the moment a test's clock may move on).
 */
export function fakeFetch(routes = {}) {
  const calls = [];
  let markCalled = () => {};
  const called = new Promise((resolve) => {
    markCalled = resolve;
  });
  async function fetchImpl(url, init = {}) {
    calls.push({ url, init });
    markCalled();
    const answer = routes[url];
    if (answer === undefined) throw new Error(`the fake fetch has no route for ${url}`);
    if (answer.error) throw answer.error;
    if (answer.hang) return hangingCall(init.signal);
    return fakeAnswer(answer);
  }
  fetchImpl.calls = calls;
  fetchImpl.called = called;
  fetchImpl.callsTo = (url) => calls.filter((call) => call.url === url);
  return fetchImpl;
}

/** Both services up: Cloudflare says yes, Resend takes the mail. `routes` replace either. */
export function servicesUp(routes = {}) {
  return fakeFetch({ [SITEVERIFY]: CAPTCHA_PASSED, [RESEND]: RESEND_SENT, ...routes });
}

/** The error Node's socket gives when a server cannot be reached (requestOverSocket rejects with it). */
export function networkError(code = 'ECONNREFUSED') {
  return Object.assign(new Error(`connect ${code} 192.0.2.1:443`), { code });
}

/** Answers one fake https request as node:https does: the response, then its body, then its end. */
function answerOverSocket(outgoing, { status = 200, body = '' }) {
  const incoming = new EventEmitter();
  incoming.statusCode = status;
  incoming.headers = {};
  incoming.complete = true;
  incoming.destroy = () => {};
  outgoing.emit('response', incoming);
  incoming.emit('data', Buffer.from(bodyText(body), 'utf8'));
  incoming.emit('end');
  incoming.emit('close');
}

/**
 * A fake of node:https's request, for a test that puts it in place of the real one
 * (t.mock.method(https, 'request', …)): the function's own transport (lib/helpers.mjs >
 * requestOverSocket) then runs without a socket. `routes` maps a URL to its answer, { status,
 * body } as for fakeFetch; a URL without a route ends in an error. request.calls lists
 * { url, method, headers, body } per call, the headers and the body as they would go out.
 */
export function fakeHttpsRequest(routes = {}) {
  const calls = [];
  function request(url, options) {
    const outgoing = new EventEmitter();
    outgoing.end = (payload) => {
      const call = { url: String(url), method: options.method, headers: options.headers, body: payload === undefined ? '' : payload.toString('utf8') };
      calls.push(call);
      const answer = routes[call.url];
      setImmediate(() => {
        if (answer === undefined) outgoing.emit('error', new Error(`the fake https request has no route for ${call.url}`));
        else answerOverSocket(outgoing, answer);
      });
    };
    return outgoing;
  }
  request.calls = calls;
  return request;
}

/** A log that keeps its lines: pass `log` to the function, read `lines` or `text()`. */
export function logRecorder() {
  const lines = [];
  return { log: (line) => lines.push(line), lines, text: () => lines.join('\n') };
}

/** A Response's JSON body (read from a clone, so the body can be read again). */
export async function bodyOf(response) {
  return JSON.parse(await response.clone().text());
}

/** A Response's headers and body as one text, for a test that looks for a word anywhere in it. */
export async function answerText(response) {
  return `${JSON.stringify([...response.headers])}\n${await response.clone().text()}`;
}

/** The names of a Response's CORS headers (access-control-*). */
export function corsHeadersOf(response) {
  return [...response.headers.keys()].filter((name) => name.startsWith('access-control-'));
}

/** The JSON body of a recorded call. */
export function sentBody(call) {
  return JSON.parse(call.init.body);
}

/**
 * True when `promise` has settled by the next turn of the event loop, once every callback already
 * due has run: for a test of a time limit, right after it moves node:test's mock clock.
 */
export async function hasSettled(promise) {
  let settled = false;
  promise.then(() => { settled = true; }, () => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  return settled;
}
