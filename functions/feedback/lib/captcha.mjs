/**
 * functions/feedback/lib/captcha.mjs: asks Cloudflare Turnstile whether a captcha token is good,
 * before any mail goes out. feedback.mjs calls it only when FEEDBACK_CAPTCHA_SECRET is set.
 *
 * THE CALL (Cloudflare's docs, read 2026-11-22:
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
 *   POST SITEVERIFY_URL, content-type application/json, { secret, response: <the token> }. The
 *   reader's IP address is never sent (remoteip is optional), and no idempotency_key either (the
 *   function never retries). At most CAPTCHA_TIMEOUT_MS; a redirect is refused, never followed
 *   (lib/helpers.mjs > timedCall).
 *
 * THE VERDICT (fail closed: anything but a clear yes stops the mail)
 *   yes             a 2xx JSON answer with success: true and a hostname equal to the host the
 *                   request was sent to (host names compared without their ports, in any letter
 *                   case)
 *   CODES.captcha   success is not true (the token is invalid, expired or already used:
 *                   Cloudflare's error-codes say which), or the token was solved on another host
 *   CODES.captchaUnavailable
 *                   no answer within the time limit, no connection, a 5xx, an answer that is not
 *                   JSON, or Cloudflare's own internal-error: the token was not judged
 *   A token is single use and lasts 300 seconds: the browser asks for a fresh one after every
 *   send that failed (src/components/PageFeedback/index.jsx > showProblem). Cloudflare's dummy
 *   secret keys answer every token with the hostname example.com, so on any other host they end
 *   in CODES.captcha (functions/feedback/README.md > Trying it).
 *
 * WHAT IT GIVES
 *   verifyCaptcha({ secret, token, host, fetchImpl })
 *     { ok: true }, or { ok: false, code, detail }: `code` one of the two above, `detail` a few
 *     words for the log line (Cloudflare's status or error codes), never its body, the token or
 *     the secret. `host` is the host the request was sent to (lib/helpers.mjs > requestHost).
 *
 * HOW TO CHANGE IT
 *   The time limit: CAPTCHA_TIMEOUT_MS; with lib/mail.mjs > MAIL_TIMEOUT_MS it stays under 10 s
 *   (../__tests__/feedback.test.mjs holds the sum). Another captcha service: this file (its URL,
 *   its request, its verdict) and the browser's side (src/components/PageFeedback/captcha.js).
 *   Tests: ../__tests__/captcha.test.mjs.
 */

import { CODES } from '../../../src/components/PageFeedback/rules.js';
import { CALL_TIMEOUT, USER_AGENT, isPlainObject, isSuccessStatus, loggableName, parseJson, timedCall } from './helpers.mjs';

/** Cloudflare Turnstile's endpoint that judges a token. */
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * How long the function waits for Cloudflare's verdict, in milliseconds. With
 * lib/mail.mjs > MAIL_TIMEOUT_MS (6 s), the two calls take 9 s at worst: inside the shortest
 * limit Netlify has had for a function of this kind (10 s), and well inside the page's own
 * (src/components/PageFeedback/rules.js > SEND_TIMEOUT_MS, 15 s).
 */
export const CAPTCHA_TIMEOUT_MS = 3000;

/** Cloudflare's error code for a failure of its own: the token was not judged. */
const INTERNAL_ERROR = 'internal-error';

/** The first status of a server error (5xx). */
const FIRST_SERVER_ERROR = 500;

/** The most of Cloudflare's error codes one log line keeps. */
const MAX_LOGGED_CODES = 5;

/** The verdict that lets the message go on. */
const PASSED = Object.freeze({ ok: true });

/** A token Cloudflare judged and refused. */
function refused(detail) {
  return { ok: false, code: CODES.captcha, detail };
}

/** No judgement at all: Cloudflare could not be asked, or could not answer. */
function unavailable(detail) {
  return { ok: false, code: CODES.captchaUnavailable, detail };
}

/** The host name of a host ("name" or "name:port"), lowercase and without the port; '' when it cannot be read. */
function hostnameOf(host) {
  try {
    return new URL(`https://${host}`).hostname;
  } catch {
    return '';
  }
}

/** True when Cloudflare's hostname is the name of the host the request was sent to. */
function isSameHostname(answered, host) {
  const expected = hostnameOf(host);
  return expected !== '' && typeof answered === 'string' && answered.toLowerCase() === expected;
}

/** Cloudflare's error codes that are fit for a log line, at most MAX_LOGGED_CODES of them. */
function errorCodesOf(answer) {
  const codes = Array.isArray(answer['error-codes']) ? answer['error-codes'] : [];
  return codes.map(loggableName).filter((code) => code !== null).slice(0, MAX_LOGGED_CODES);
}

/** The verdict of a JSON answer (see THE VERDICT in the header). */
function verdictOf(status, answer, host) {
  if (!isSuccessStatus(status) || answer.success !== true) {
    const codes = errorCodesOf(answer);
    const listed = codes.length === 0 ? 'no error code' : codes.join(', ');
    if (codes.includes(INTERNAL_ERROR)) return unavailable(`Cloudflare could not judge the token (${listed})`);
    return refused(`Cloudflare refused the token (${listed})`);
  }
  if (!isSameHostname(answer.hostname, host)) return refused('the token was solved on another host');
  return PASSED;
}

/** Asks Cloudflare about one token (see WHAT IT GIVES in the header). Never rejects. */
export async function verifyCaptcha({ secret, token, host, fetchImpl }) {
  const call = await timedCall(SITEVERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ secret, response: token }),
    fetchImpl,
    timeoutMs: CAPTCHA_TIMEOUT_MS,
  });
  if (call.failure === CALL_TIMEOUT) return unavailable(`no answer within ${CAPTCHA_TIMEOUT_MS} ms`);
  if (call.failure !== undefined) return unavailable(`Cloudflare could not be reached (${call.reason})`);
  if (call.status >= FIRST_SERVER_ERROR) return unavailable(`Cloudflare answered ${call.status}`);
  const parsed = parseJson(call.text);
  if (!parsed.ok || !isPlainObject(parsed.value)) return unavailable(`Cloudflare answered ${call.status} without JSON`);
  return verdictOf(call.status, parsed.value, host);
}
