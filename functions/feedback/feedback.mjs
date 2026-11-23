/**
 * functions/feedback/feedback.mjs: receives one message from the page-feedback prompt and mails it
 * to the site's owner. The page POSTs JSON to /.netlify/functions/feedback (rules.js >
 * FEEDBACK_ENDPOINT; the site's one-line shim, netlify/functions/feedback.mjs, is what Netlify
 * deploys there). This function checks the request, asks Cloudflare about the captcha's token
 * when the site has a captcha, and sends one plain-text mail through Resend. The browser's side is
 * src/components/PageFeedback; the rules both sides share, the codes of the answers included, are
 * src/components/PageFeedback/rules.js. The model is the code editor's execute.mjs
 * (shared/functions/code-runner).
 *
 * A MODERN NETLIFY FUNCTION
 *   An ES module whose default export is `async (request, context) => Response`. No `handler`
 *   export: the bundler reads a file as modern when it has a default export and no `handler`,
 *   and takes a `handler` as the Lambda-compatible shape (`exports.handler`), whose deploys
 *   Netlify stops accepting on 2027-07-01 (shared/functions/code-runner/README.md > The modern
 *   functions API). No `config` export either: its `path` would replace the default URL, which
 *   FEEDBACK_ENDPOINT names. The logic is handleFeedback(request, options), which the tests call
 *   with a fake environment, fetch, limiter, clock and log; the default export passes the real
 *   ones.
 *
 * THE VARIABLES (Netlify, scope Functions; a changed value reaches the function at the next deploy)
 *   FEEDBACK_EMAIL_API_KEY   the mail service's key (sending access only)
 *   FEEDBACK_EMAIL_FROM      the sending address, on a subdomain the mail service has verified
 *   FEEDBACK_EMAIL_TO        the one address the mail goes to
 *   FEEDBACK_CAPTCHA_SECRET  optional: the captcha's secret. Unset or blank: no captcha check
 *   Each value is trimmed. The key travels in a header, so a key holding a character a header
 *   cannot carry (a line break pasted inside it, say) is refused as setup too.
 *
 * THE CHECKS, in this order; the first five refuse a request without reading its body
 *   1  the method is POST: OPTIONS, a CORS preflight, is refused like any other
 *                                                              405 method, with allow: POST
 *   2  the content type is application/json (parameters allowed, any case)
 *                                                              415 media-type
 *   3  an Origin header names this site: the host the request was sent to, over https, or over
 *      http on a loopback host (lib/helpers.mjs > isSameSite)  403 origin
 *   4  at most MESSAGE_LIMIT per client: a token bucket kept in the warm instance, keyed on the
 *      client's IP (lib/helpers.mjs > clientKey)               429 rate, with retry-after
 *   5  the three mail variables are set                        500 setup
 *   6  the content-length and the bytes read are at most MAX_BODY_BYTES
 *                                                              413 size
 *   7  the fields (lib/fields.mjs)                             400 fields
 *   8  the captcha, only when FEEDBACK_CAPTCHA_SECRET is set (lib/captcha.mjs)
 *                                                              403 captcha, 503 captcha-unavailable
 *   9  the mail (lib/mail.mjs)                                 502 mail, 503 mail-quota,
 *                                                              504 mail-timeout
 *
 * THE ANSWER
 *   JSON, with cache-control: no-store, and never a CORS header: another site's page cannot call
 *   the function, because its browser stops at the refused preflight. Sent: 200 { ok: true }.
 *   Refused: { ok: false, code }, the code one of rules.js > CODES, its status as above
 *   (STATUS_OF_CODE). A failure no check foresaw: 500 { ok: false }, with no code (CODES has none
 *   for it). No answer holds a word of the request, a variable's name, a service's name or an
 *   address.
 *
 * THE LOG (Netlify's function log)
 *   One line for each refusal or failure, "[feedback] <code>: <a few fixed words>"; a message that
 *   was sent logs nothing. The setup line names the variable. Never the text, the page's address,
 *   the client's address, a token, or the body of an answer from Resend or Cloudflare: of those,
 *   the status and the error name only. The key and the captcha's secret are replaced in every
 *   line (lib/helpers.mjs > createLog).
 *
 * HOW TO CHANGE IT
 *   The limits: MESSAGE_LIMIT and MAX_BODY_BYTES (a test holds that a message at its longest fits
 *   in the second). A variable's name: its constant below and every file that names it (search
 *   the repository for the name). A status: STATUS_OF_CODE. A new check: a function below, its
 *   place in respond(), a row in THE CHECKS and in README.md, and a test in
 *   __tests__/feedback.test.mjs in the order the checks run. The fields, the captcha and the
 *   mail: their files in lib/. Tests: __tests__/ (package.json > shared:verify names each file).
 */

import { CODES } from '../../src/components/PageFeedback/rules.js';
import { verifyCaptcha } from './lib/captcha.mjs';
import { readFields } from './lib/fields.mjs';
import {
  clientKey, createLog, failureName, headerValue, isSameSite, jsonAnswer, requestHost, requestMethod, requestOrigin,
  sharedLimiter,
} from './lib/helpers.mjs';
import { buildMail, sendMail } from './lib/mail.mjs';

/**
 * The variables (see THE VARIABLES in the header). The constants' names leave out the words the
 * privacy scan (shared/scripts/lib/privacy.mjs) reads, before a long quoted value, as a secret's.
 */
export const KEY_VARIABLE = 'FEEDBACK_EMAIL_API_KEY';
export const FROM_VARIABLE = 'FEEDBACK_EMAIL_FROM';
export const TO_VARIABLE = 'FEEDBACK_EMAIL_TO';
export const CAPTCHA_VARIABLE = 'FEEDBACK_CAPTCHA_SECRET';

/** The variables a mail needs, in the order a setup line names them. */
const MAIL_VARIABLES = Object.freeze([KEY_VARIABLE, FROM_VARIABLE, TO_VARIABLE]);

/** Messages per client: 5 in 600 seconds, one more every 120 seconds after that. */
export const MESSAGE_LIMIT = Object.freeze({ limit: 5, windowSeconds: 600 });

/** The largest body read, in bytes. */
export const MAX_BODY_BYTES = 16384;

/** The only method accepted. */
const REQUIRED_METHOD = 'POST';

/** The only media type accepted. */
const REQUIRED_MEDIA_TYPE = 'application/json';

/** The Origin a browser sends for a page with no usable origin (a sandboxed frame, a file:// page). */
const OPAQUE_ORIGIN = 'null';

/**
 * A character a header value may not hold (the key is sent in one): allowed are tab, space,
 * visible ASCII and 0x80-0xFF, the rule Node applies.
 */
const HEADER_VALUE_FORBIDDEN = /[^\t\x20-\x7e\x80-\xff]/;

/** The status of each refusal, by its code (see THE CHECKS in the header). */
export const STATUS_OF_CODE = Object.freeze({
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

/** The status of a message that was sent. */
const SENT_STATUS = 200;

/** The status of a failure no check foresaw (see THE ANSWER in the header). */
const UNEXPECTED_STATUS = 500;

/** The log's word for a failure no check foresaw. */
const UNEXPECTED = 'unexpected';

/** A refusal: its code, the few words its log line holds, and any header its answer carries. */
function refusal(code, reason, headers = {}) {
  return { code, reason, headers };
}

/** A variable's value, trimmed; '' when it is unset (or there is no environment at all). */
function readVariable(env, name) {
  const value = env ? env[name] : undefined;
  return typeof value === 'string' ? value.trim() : '';
}

/** The values every log line has replaced: the key and the captcha's secret. */
function secretsOf(env) {
  return [readVariable(env, KEY_VARIABLE), readVariable(env, CAPTCHA_VARIABLE)];
}

/** Check 1: anything but a POST, a preflight included. */
function methodRefusal(request) {
  if (requestMethod(request) === REQUIRED_METHOD) return null;
  return refusal(CODES.method, `not a ${REQUIRED_METHOD}`, { allow: REQUIRED_METHOD });
}

/** The media type of a content-type value, lowercased, without its parameters. */
function mediaTypeOf(contentType) {
  const [mediaType] = contentType.split(';');
  return mediaType.trim().toLowerCase();
}

/** Check 2: a body that does not say it is JSON. */
function mediaTypeRefusal(request) {
  if (mediaTypeOf(headerValue(request, 'content-type')) === REQUIRED_MEDIA_TYPE) return null;
  return refusal(CODES.mediaType, `not ${REQUIRED_MEDIA_TYPE}`);
}

/** Check 3: no Origin header, an opaque one, or another site's (a Referer never stands in for it). */
function originRefusal(request) {
  const header = headerValue(request, 'origin').trim();
  if (header === '' || header === OPAQUE_ORIGIN) return refusal(CODES.origin, 'no Origin header');
  // The header is there and not opaque, so requestOrigin reads it, never the Referer.
  const origin = requestOrigin(request);
  if (origin !== null && isSameSite(origin, requestHost(request))) return null;
  return refusal(CODES.origin, 'not this site');
}

/** Check 4: one token from the client's bucket at `now`, or the refusal with the wait. No limiter: no limit. */
function rateRefusal(request, context, limiter, now) {
  if (limiter === null) return null;
  const outcome = limiter.take(clientKey(request, context), now());
  if (outcome.allowed) return null;
  const { limit, windowSeconds } = limiter.settings;
  const wait = outcome.retryAfterSeconds;
  return refusal(CODES.rate, `over ${limit} in ${windowSeconds} s, retry after ${wait} s`, { 'retry-after': String(wait) });
}

/** Check 5: { setup: { key, from, to, captchaSecret } }, or { refusal } whose line names the variable. */
function readSetup(env) {
  const missing = MAIL_VARIABLES.filter((name) => readVariable(env, name) === '');
  if (missing.length > 0) return { refusal: refusal(CODES.setup, `${missing.join(', ')} not set`) };
  const key = readVariable(env, KEY_VARIABLE);
  if (HEADER_VALUE_FORBIDDEN.test(key)) {
    return { refusal: refusal(CODES.setup, `${KEY_VARIABLE} holds a character a header cannot carry`) };
  }
  const from = readVariable(env, FROM_VARIABLE);
  const to = readVariable(env, TO_VARIABLE);
  return { setup: { key, from, to, captchaSecret: readVariable(env, CAPTCHA_VARIABLE) } };
}

/** The size refusal (check 6). */
function tooLarge() {
  return refusal(CODES.size, `over ${MAX_BODY_BYTES} bytes`);
}

/** True when the request's content-length says it is larger than MAX_BODY_BYTES. */
function declaresTooMuch(request) {
  const declared = Number(headerValue(request, 'content-length'));
  return Number.isFinite(declared) && declared > MAX_BODY_BYTES;
}

/** A body stream read to its end as UTF-8 text, or null once it passes MAX_BODY_BYTES (the rest is never read). */
async function readCapped(stream) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks).toString('utf8');
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
}

/** Check 6: { text } (the body; '' when there is none), or { refusal }. */
async function readBody(request) {
  if (declaresTooMuch(request)) return { refusal: tooLarge() };
  if (request.body === null) return { text: '' };
  const text = await readCapped(request.body);
  return text === null ? { refusal: tooLarge() } : { text };
}

/** Checks 1 to 4, which never read the body: the first refusal, or null. */
function requestRefusal(request, context, limiter, now) {
  return methodRefusal(request) ?? mediaTypeRefusal(request) ?? originRefusal(request)
    ?? rateRefusal(request, context, limiter, now);
}

/** Check 8: the captcha's verdict as a refusal, or null when it passed. */
async function captchaRefusal(request, setup, fields, fetchImpl) {
  const host = requestHost(request);
  const verdict = await verifyCaptcha({ secret: setup.captchaSecret, token: fields.captcha, host, fetchImpl });
  return verdict.ok ? null : refusal(verdict.code, verdict.detail);
}

/** Every check in order (see THE CHECKS in the header), then the mail: null when it was sent, else the refusal. */
async function respond(request, { env, context, fetchImpl, limiter, now }) {
  const refused = requestRefusal(request, context, limiter, now);
  if (refused !== null) return refused;
  const { setup, refusal: unset } = readSetup(env);
  if (unset) return unset;
  const body = await readBody(request);
  if (body.refusal) return body.refusal;
  const captchaRequired = setup.captchaSecret !== '';
  const { fields, problem } = readFields(body.text, { captchaRequired });
  if (problem) return refusal(CODES.fields, problem);
  if (captchaRequired) {
    const captcha = await captchaRefusal(request, setup, fields, fetchImpl);
    if (captcha !== null) return captcha;
  }
  const mail = buildMail({ from: setup.from, to: setup.to, fields });
  const sent = await sendMail(mail, { key: setup.key, id: fields.id, fetchImpl });
  return sent.ok ? null : refusal(sent.code, sent.detail);
}

/** The answer to a refusal, its line logged. */
function refusalAnswer(refused, log) {
  log(`${refused.code}: ${refused.reason}`);
  return jsonAnswer(STATUS_OF_CODE[refused.code], { ok: false, code: refused.code }, refused.headers);
}

/**
 * The function's logic, testable. `request` is a web Request. `options`: `context`, Netlify's
 * function context (its `ip` keys the rate limit; may be absent), and for the tests `env` (default
 * process.env), `fetchImpl` (a fetch for both outgoing calls; without one they go over
 * lib/helpers.mjs > requestOverSocket, never the global fetch), `limiter` (a limiter of
 * lib/helpers.mjs > createRateLimiter, or null for none; default this instance's at MESSAGE_LIMIT),
 * `now` (the rate limit's clock, in milliseconds; default Date.now) and `log` (receives each
 * finished log line, the secrets already replaced; default console.error). Always resolves to a
 * Response, never rejects.
 */
export async function handleFeedback(request, options = {}) {
  const { env = process.env, log: write } = options;
  const log = createLog(secretsOf(env), write);
  try {
    const { context, fetchImpl, limiter = sharedLimiter(MESSAGE_LIMIT), now = Date.now } = options;
    const refused = await respond(request, { env, context, fetchImpl, limiter, now });
    if (refused === null) return jsonAnswer(SENT_STATUS, { ok: true });
    return refusalAnswer(refused, log);
  } catch (error) {
    log(`${UNEXPECTED}: ${failureName(error)}`);
    return jsonAnswer(UNEXPECTED_STATUS, { ok: false });
  }
}

/** The function Netlify runs (see A MODERN NETLIFY FUNCTION in the header). */
export default async (request, context) => handleFeedback(request, { context });
