/**
 * functions/feedback/lib/mail.mjs: the mail one message becomes, and the one call that sends it
 * through Resend. feedback.mjs reads the key and the two addresses (its variables) and calls this
 * file only once every other check has passed.
 *
 * THE MAIL (plain text)
 *   Subject  [page feedback] 👍 /docs/software-engineering/sql/ctes      (👎 for a thumbs down)
 *   Text     <the reader's text, as cleaned; or "(no message)">
 *
 *            -----
 *            Page:   <SITE_ORIGIN>/docs/software-engineering/sql/ctes
 *            Thumb:  up
 *   The reader's words come first, so a mail client's preview shows them. The subject and the
 *   last three lines (the rule, Page, Thumb) are always the function's own, built from constants
 *   and checked values: a reader's text comes before them, whatever it holds. SITE_ORIGIN is a
 *   constant, never built from the request (a request can name any host);
 *   scripts/site-files.test.mjs holds it equal to `url` in docusaurus.config.js. The subject
 *   holds no line break, whatever it is given. The mail holds no time of its own (its Date
 *   header has it), no IP address and no user agent, no html and no reply_to.
 *
 * THE CALL (Resend's API reference, read 2026-11-22:
 * https://resend.com/docs/api-reference/emails/send-email)
 *   POST MAIL_URL with authorization: Bearer <key>, content-type: application/json, a user-agent
 *   (Resend refuses a call without one: lib/helpers.mjs > USER_AGENT) and, when the message has an
 *   id, idempotency-key: page-feedback/<id> (IDEMPOTENCY_KEY_PREFIX, so no other use of the same
 *   mail account can meet the key). Body: { from, to, subject, text }, `to` the one address. At
 *   most MAIL_TIMEOUT_MS; a redirect is refused, never followed (lib/helpers.mjs > timedCall);
 *   never retried here. Resend keeps an idempotency key 24 hours. A second try of one message is
 *   the same request byte for byte, so Resend answers it as it answered the first, without a
 *   second mail. A repeat that comes while the first is still under way, or the same key with
 *   another body (after a deploy that changed the mail, say), is refused with a 409.
 *
 * WHAT RESEND'S ANSWER BECOMES
 *   2xx                sent
 *   429                CODES.mailQuota: the daily or monthly quota, or too many calls a second
 *   any other status   CODES.mail
 *   no connection      CODES.mail (a refused redirect included)
 *   no answer in time  CODES.mailTimeout (the mail may still have gone out)
 *   The log line keeps the status and Resend's error name (the `name` of its JSON), never its body.
 *
 * WHAT IT GIVES
 *   SITE_ORIGIN, MAIL_URL, MAIL_TIMEOUT_MS
 *   mailSubject(thumb, page), mailText({ thumb, page, text })
 *   buildMail({ from, to, fields })          { from, to, subject, text }: `fields` as
 *                                           lib/fields.mjs gives them
 *   sendMail(mail, { key, id, fetchImpl })   { ok: true }, or { ok: false, code, detail }:
 *                                           `detail` a few words for the log line. Never rejects.
 *
 * HOW TO CHANGE IT
 *   The mail's layout: mailSubject, mailText and the constants above them. Keep every value that
 *   changes from one try to the next (a time, a counter, the captcha's token) out of the call, so
 *   that a second try of one message stays the same request (../__tests__/feedback.test.mjs holds
 *   it). Another mail service: MAIL_URL and sendMail with its helpers, in this file only; the
 *   variables keep their names. The time limit: MAIL_TIMEOUT_MS, which with lib/captcha.mjs >
 *   CAPTCHA_TIMEOUT_MS stays under 10 s (see there). Tests: ../__tests__/mail.test.mjs.
 */

import { CODES, THUMB_DOWN, THUMB_UP, isBlank } from '../../../src/components/PageFeedback/rules.js';
import { CALL_TIMEOUT, USER_AGENT, isPlainObject, isSuccessStatus, loggableName, parseJson, timedCall } from './helpers.mjs';

/** The site's address, the start of the page link in every mail (see THE MAIL in the header). */
export const SITE_ORIGIN = 'https://danielwfarlow.com';

/** Resend's endpoint that sends one mail. */
export const MAIL_URL = 'https://api.resend.com/emails';

/**
 * How long the function waits for Resend's answer, in milliseconds. With
 * lib/captcha.mjs > CAPTCHA_TIMEOUT_MS, the two calls take 9 s at worst (see there).
 */
export const MAIL_TIMEOUT_MS = 6000;

/**
 * The start of every idempotency key the function sends, before the message's id: Resend's
 * suggested shape (<event-type>/<entity-id>), so no other use of the same mail account can meet
 * one.
 */
const IDEMPOTENCY_KEY_PREFIX = 'page-feedback/';

/** The subject's fixed start. */
const SUBJECT_PREFIX = '[page feedback]';

/** Each thumb's sign in the subject. */
const THUMB_SIGNS = Object.freeze({ [THUMB_UP]: '👍', [THUMB_DOWN]: '👎' });

/** Line breaks, which a subject never holds. */
const LINE_BREAKS = /[\r\n]/g;

/** The width of a label in the text, its colon and spaces included ("Page:   "), so the values line up. */
const LABEL_WIDTH = 8;

/** The line between the reader's text and the facts. */
const FACTS_RULE = '-----';

/** What the text shows when the reader wrote nothing. */
const NO_MESSAGE = '(no message)';

/** Resend's status for a quota or a rate limit. */
const QUOTA_STATUS = 429;

/** The outcome of a mail Resend took. */
const SENT = Object.freeze({ ok: true });

/** The outcome of a mail that did not go out: its code, and a few words for the log line. */
function notSent(code, detail) {
  return { ok: false, code, detail };
}

/** "[page feedback] 👍 /docs/…": built from constants and checked values, without a line break. */
export function mailSubject(thumb, page) {
  return `${SUBJECT_PREFIX} ${THUMB_SIGNS[thumb]} ${page}`.replace(LINE_BREAKS, '');
}

/** One line of the facts: the label, padded to LABEL_WIDTH, then the value. */
function labelled(label, value) {
  return `${`${label}:`.padEnd(LABEL_WIDTH)}${value}`;
}

/**
 * The mail's text (see THE MAIL in the header): the reader's words, then the facts. `text` comes
 * cleaned (lib/fields.mjs).
 */
export function mailText({ thumb, page, text }) {
  return [
    isBlank(text) ? NO_MESSAGE : text,
    '',
    FACTS_RULE,
    labelled('Page', `${SITE_ORIGIN}${page}`),
    labelled('Thumb', thumb),
  ].join('\n');
}

/** The mail for one message: { from, to, subject, text }. */
export function buildMail({ from, to, fields }) {
  const { thumb, page, text } = fields;
  return { from, to, subject: mailSubject(thumb, page), text: mailText({ thumb, page, text }) };
}

/** The headers of the call: the key, JSON, the user agent, and the idempotency key when there is an id. */
function mailHeaders(key, id) {
  const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'user-agent': USER_AGENT };
  if (id !== undefined) headers['idempotency-key'] = `${IDEMPOTENCY_KEY_PREFIX}${id}`;
  return headers;
}

/** Resend's error name in its answer (the `name` of its JSON), when it is fit for a log line; else null. */
function errorNameOf(text) {
  const parsed = parseJson(text);
  if (!parsed.ok || !isPlainObject(parsed.value)) return null;
  return loggableName(parsed.value.name);
}

/** The log's words for an answer that is not a success: the status, and the error name when there is one. */
function answered(status, text) {
  const name = errorNameOf(text);
  return name === null ? `Resend answered ${status}` : `Resend answered ${status} (${name})`;
}

/** Sends one mail through Resend (see THE CALL and WHAT RESEND'S ANSWER BECOMES in the header). */
export async function sendMail(mail, { key, id, fetchImpl }) {
  const call = await timedCall(MAIL_URL, {
    method: 'POST',
    headers: mailHeaders(key, id),
    body: JSON.stringify({ from: mail.from, to: mail.to, subject: mail.subject, text: mail.text }),
    fetchImpl,
    timeoutMs: MAIL_TIMEOUT_MS,
  });
  if (call.failure === CALL_TIMEOUT) return notSent(CODES.mailTimeout, `no answer within ${MAIL_TIMEOUT_MS} ms`);
  if (call.failure !== undefined) return notSent(CODES.mail, `Resend could not be reached (${call.reason})`);
  if (isSuccessStatus(call.status)) return SENT;
  const code = call.status === QUOTA_STATUS ? CODES.mailQuota : CODES.mail;
  return notSent(code, answered(call.status, call.text));
}
