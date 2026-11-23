/**
 * functions/feedback/lib/helpers.mjs: what the page-feedback function borrows from the code
 * editor's functions, in one file, and the few small helpers its own parts share. Nothing here
 * knows the mail service or the captcha: lib/mail.mjs and lib/captcha.mjs do.
 *
 * BORROWED (shared/functions/code-runner/lib; their headers have the rules in full)
 *   piston.mjs     headerValue, requestMethod, parseJson, isPlainObject, redactSecret,
 *                  requestOverSocket
 *   origin.mjs     requestOrigin, requestHost, isSameSite
 *   rateLimit.mjs  createRateLimiter, sharedLimiter, clientKey
 *   Only these, because each is neutral: no word, variable or log line of the code runner's own.
 *   The rest of those files (originProblem, instanceRateLimitSettings, rateLimitRefusal,
 *   createLogger, errorResponse and the others) carries the code runner's words, variables or
 *   log lines, so this function never imports it. This file is the one place the coupling lives.
 *
 * WHY THE OUTGOING CALLS GO OVER requestOverSocket, NOT THE GLOBAL fetch
 *   Netlify's function runtime wraps the global fetch and adds the host of each call to the
 *   function's answer, in an x-nf-fetch-timing header (shared/functions/code-runner/lib/piston.mjs >
 *   THE CALL GOES OVER NODE'S OWN http / https). Through fetch, every answer of this function would
 *   name the mail service and the captcha service. requestOverSocket uses node:https on a socket of
 *   its own and refuses a redirect (301, 302, 303, 307, 308) instead of following it. It has no
 *   time limit of its own: timedCall gives each call one. A test passes a fetch-shaped
 *   `fetchImpl` instead, and gets `redirect: 'error'` in the call's options (REDIRECT_MODE), so a
 *   real fetch would refuse a redirect too.
 *
 * OWN
 *   jsonAnswer(status, body, headers)  a JSON Response, never cached.
 *   createLog(secrets, write)          log(line): "[feedback] line" through `write`
 *                                      (console.error by default), each secret replaced
 *                                      (redactSecret). A write that throws is dropped.
 *   timedCall(url, options)            one outgoing call with a time limit, never retried:
 *                                      { status, text } for any answer, or { failure, reason }.
 *                                      Never rejects.
 *   isSuccessStatus(status)            true for a 2xx.
 *   loggableName(value)                a short name fit for a log line (a provider's error name,
 *                                      an error's code), or null.
 *   failureName(error)                 a thrown error in one loggable word.
 *   USER_AGENT                         the user-agent header of both outgoing calls.
 *
 * HOW TO CHANGE IT
 *   Another borrowed helper: add it to the export lines below and to BORROWED, and only when it
 *   carries no word, variable or log line of the code runner. A change inside the code runner's
 *   files is a change to shared/ (shared/README.md). What a log line may keep of a name:
 *   LOGGABLE_NAME. Never make the global fetch timedCall's default (see WHY THE OUTGOING
 *   CALLS…; ../__tests__/feedback.test.mjs holds it). Tests: ../__tests__/ run these helpers
 *   through the parts that use them.
 */

import { redactSecret, requestOverSocket } from '../../../shared/functions/code-runner/lib/piston.mjs';

export {
  headerValue, isPlainObject, parseJson, redactSecret, requestMethod, requestOverSocket,
} from '../../../shared/functions/code-runner/lib/piston.mjs';
export { isSameSite, requestHost, requestOrigin } from '../../../shared/functions/code-runner/lib/origin.mjs';
export { clientKey, createRateLimiter, sharedLimiter } from '../../../shared/functions/code-runner/lib/rateLimit.mjs';

/** The start of every line this function logs (Netlify's function log). */
const LOG_LABEL = '[feedback]';

/** The content type of every answer. */
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

/** No answer of this function is ever kept by a cache. */
const NEVER_CACHE = 'no-store';

/** The user-agent header of the outgoing calls (Resend refuses a call without one): a neutral name. */
export const USER_AGENT = 'page-feedback-function/1.0';

/** fetch's redirect mode, for an injected fetch: a redirect is a failure, never followed. */
export const REDIRECT_MODE = 'error';

/** What timedCall gives instead of an answer: no whole answer in time, or none at all. */
export const CALL_TIMEOUT = 'timeout';
export const CALL_FAILED = 'failed';

/** The first and the last status of a success (2xx). */
const FIRST_SUCCESS_STATUS = 200;
const LAST_SUCCESS_STATUS = 299;

/** The shape of a name a log line may keep: letters, digits, '_', '.' and '-', at most 64. */
const LOGGABLE_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

/** What failureName gives when an error has no loggable code or name. */
const UNKNOWN_FAILURE = 'unknown';

/** A JSON Response, never cached; `headers` add to the defaults. */
export function jsonAnswer(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': JSON_CONTENT_TYPE, 'cache-control': NEVER_CACHE, ...headers },
  });
}

/** `text` with every occurrence of each non-empty secret replaced (redactSecret). */
function redactAll(text, secrets) {
  return secrets.reduce((safe, secret) => redactSecret(safe, secret), text);
}

/** console.error, looked up at each call, so a test that mocks it sees the line. */
function writeToConsole(line) {
  console.error(line);
}

/**
 * A log(line) for one request: writes "[feedback] line" through `write`, with each of `secrets`
 * replaced. A write that throws is dropped: a log line must never fail an answer.
 */
export function createLog(secrets, write = writeToConsole) {
  return (line) => {
    try {
      write(`${LOG_LABEL} ${redactAll(String(line), secrets)}`);
    } catch {
      // Dropped on purpose: see above.
    }
  };
}

/** True for a 2xx status. */
export function isSuccessStatus(status) {
  return status >= FIRST_SUCCESS_STATUS && status <= LAST_SUCCESS_STATUS;
}

/** `value` when it is a short name fit for a log line, else null (see LOGGABLE_NAME). */
export function loggableName(value) {
  return typeof value === 'string' && LOGGABLE_NAME.test(value) ? value : null;
}

/** A thrown error in one word for the log: its code, its cause's code, or its name; never its message. */
export function failureName(error) {
  const candidates = [error?.code, error?.cause?.code, error?.name];
  return candidates.map(loggableName).find((name) => name !== null) ?? UNKNOWN_FAILURE;
}

/** The call, read to its end: { status, text }, or { failure: CALL_FAILED, reason }. */
async function answerOf(url, init, fetchImpl) {
  try {
    const response = await fetchImpl(url, init);
    return { status: response.status, text: await response.text() };
  } catch (error) {
    return { failure: CALL_FAILED, reason: failureName(error) };
  }
}

/**
 * One outgoing call with a time limit, through requestOverSocket unless the caller passes a
 * fetch (see WHY THE OUTGOING CALLS… in the header). Resolves to { status, text } for any answer,
 * whatever its status, or to { failure, reason } when there is none: CALL_TIMEOUT when the whole
 * answer has not come within `timeoutMs` (the call is then aborted), CALL_FAILED when there is no
 * connection, a refused redirect or a cut answer (`reason`: failureName of the error). The timer
 * starts before the call does. Never rejects, never retries.
 */
export async function timedCall(url, { method = 'POST', headers = {}, body, fetchImpl = requestOverSocket, timeoutMs }) {
  const controller = new AbortController();
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      // Settle first, then abort: the race must end with the time limit, not the abort's failure.
      resolve({ failure: CALL_TIMEOUT, reason: CALL_TIMEOUT });
      controller.abort();
    }, timeoutMs);
  });
  const init = { method, headers, body, redirect: REDIRECT_MODE, signal: controller.signal };
  try {
    return await Promise.race([answerOf(url, init, fetchImpl), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
