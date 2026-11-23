/**
 * rules.js: the rules the page-feedback prompt and its function share, in one place: which thumbs
 * exist, when text is required, how long it may be, which page addresses are accepted, which pages
 * get no prompt, what the browser sends and what the function answers. Constants and pure
 * functions: no import, no React, no DOM. The component (index.jsx), the transport
 * (sendFeedback.js), the function (functions/feedback) and the tests all read this one file, so
 * the browser and the server cannot disagree.
 *
 * WHAT THE BROWSER SENDS  One POST to FEEDBACK_ENDPOINT, content type application/json:
 *     { thumb, text, page, captcha, id }
 *   thumb    THUMB_UP or THUMB_DOWN
 *   text     the reader's message, cleaned with cleanText; may be '' after a thumbs up
 *   page     the page's permalink, as isPagePath accepts it ('/docs/intro')
 *   captcha  the captcha's token, when the site has a captcha; else left out
 *   id       one made-up id per message (SEND_ID_PATTERN), so a second try of the same message
 *            is not delivered twice; may be left out. isMailRefusal says when the next try
 *            needs a new one
 * WHAT THE FUNCTION ANSWERS  JSON, never the reader's own words back:
 *     200 { ok: true }                    the mail service took the message
 *     4xx / 5xx { ok: false, code }       code is one of CODES; outcomeOf turns the status and
 *                                         the code into the key of the words to show (words.js)
 *     500 { ok: false }                   a failure no check foresaw: no code
 *
 * HOW TO CHANGE IT
 *   A limit: its constant below. The function reads the same constant, so a new value holds on
 *   both sides after the next deploy. When text is required: isTextRequired. The page addresses
 *   the function accepts: PAGE_PATTERN (the prompt shows on no page that it refuses). Another
 *   answer of the function: a name in CODES, a row in outcomeOf if it needs words of its own,
 *   and those words in words.js. The limits are also written as numbers in
 *   functions/feedback/README.md and in the README's chapter "Page feedback": change them there
 *   in the same commit.
 *   Tests: __tests__/rules.test.js (package.json > shared:verify names it).
 */

/** The two answers to the prompt's question. */
export const THUMB_UP = 'up';
export const THUMB_DOWN = 'down';
export const THUMBS = Object.freeze([THUMB_UP, THUMB_DOWN]);

/** Most characters (Unicode code points) one message may hold, after cleanText. */
export const MAX_TEXT_LENGTH = 2000;

/** The length from which the card shows how many characters are used. */
export const COUNTER_FROM = 1800;

/** Where the browser posts a message: the site's own function, at Netlify's default address. */
export const FEEDBACK_ENDPOINT = '/.netlify/functions/feedback';

/** How long the browser waits for the function's answer before it reports a failed send. */
export const SEND_TIMEOUT_MS = 15000;

/** Most characters a page address may hold. */
export const MAX_PAGE_LENGTH = 200;

/**
 * A page address the function accepts, without a trailing slash: '/docs' or '/blog', then one to
 * twelve segments of letters, digits, '.', '_', '~' and '-', each starting with a letter or a
 * digit (so no '.' and no '..' segment, no query and no hash).
 */
export const PAGE_PATTERN = /^\/(?:docs|blog)(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*){1,12}$/;

/** Most characters a captcha token may hold (Turnstile's own limit is 2,048). */
export const MAX_CAPTCHA_LENGTH = 4096;

/** The shape of a message's id: 8 to 64 letters, digits and hyphens (a UUID fits). */
export const SEND_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** The codes of the function's refusals, as the `code` of its JSON answer. */
export const CODES = Object.freeze({
  method: 'method',
  mediaType: 'media-type',
  origin: 'origin',
  rate: 'rate',
  setup: 'setup',
  size: 'size',
  fields: 'fields',
  captcha: 'captcha',
  captchaUnavailable: 'captcha-unavailable',
  mail: 'mail',
  mailQuota: 'mail-quota',
  mailTimeout: 'mail-timeout',
});

/**
 * What a send came to, each the key of its words in words.js (OUTCOME_SENT shows `thanks`).
 * OUTCOME_CAPTCHA_NEEDED never comes from the function: the page gives it when Send is pressed
 * while the captcha still waits for the reader, and nothing is sent then.
 */
export const OUTCOME_SENT = 'sent';
export const OUTCOME_FAILED = 'failed';
export const OUTCOME_TOO_MANY = 'tooMany';
export const OUTCOME_CAPTCHA = 'captchaFailed';
export const OUTCOME_CAPTCHA_NEEDED = 'captchaNeeded';

/** What textProblem reports. */
export const PROBLEM_REQUIRED = 'required';
export const PROBLEM_TOO_LONG = 'too-long';

/** The status of a refusal for too many messages from one connection. */
const TOO_MANY_REQUESTS = 429;

/** The status of an accepted message. */
const OK = 200;

/** Control characters, except tab, line feed and carriage return. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Characters that change the direction of the text around them (the marks, embeddings, overrides and isolates). */
const DIRECTION_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

/** A line end as Windows or an old Mac writes it. */
const FOREIGN_LINE_ENDS = /\r\n?/g;

/** Blank lines at the very start (the first written line keeps its indent). */
const LEADING_BLANK_LINES = /^(?:[ \t]*\n)+/;

/** Everything a reader cannot see: white space and zero-width characters. */
const INVISIBLE_CHARACTERS = /[\s\u200B-\u200D\u2060\uFEFF]/g;

/** Trailing slashes of an address. */
const TRAILING_SLASHES = /\/+$/;

/** True for one of the two thumbs. */
export function isThumb(value) {
  return THUMBS.includes(value);
}

/** True when a message must hold text: after a thumbs down. */
export function isTextRequired(thumb) {
  return thumb === THUMB_DOWN;
}

/**
 * The text as it is sent and mailed: lone surrogates replaced, line ends as '\n', control and
 * direction characters removed, blank lines at the start and white space at the end removed.
 * Indents, tabs and line breaks inside the text stay, so code arrives as typed. Never longer than
 * what it was given. Anything that is not a string gives ''.
 */
export function cleanText(text) {
  const raw = typeof text === 'string' ? text : '';
  const wellFormed = typeof raw.toWellFormed === 'function' ? raw.toWellFormed() : raw;
  return wellFormed
    .replace(FOREIGN_LINE_ENDS, '\n')
    .replace(CONTROL_CHARACTERS, '')
    .replace(DIRECTION_CONTROLS, '')
    .replace(LEADING_BLANK_LINES, '')
    .trimEnd();
}

/** True when the text holds nothing a reader can see. */
export function isBlank(text) {
  return cleanText(text).replace(INVISIBLE_CHARACTERS, '') === '';
}

/** How many characters (Unicode code points) the cleaned text holds. */
export function textLength(text) {
  return Array.from(cleanText(text)).length;
}

/** What stops a message from being sent: PROBLEM_REQUIRED, PROBLEM_TOO_LONG, or null for nothing. */
export function textProblem(thumb, text) {
  if (isTextRequired(thumb) && isBlank(text)) return PROBLEM_REQUIRED;
  if (textLength(text) > MAX_TEXT_LENGTH) return PROBLEM_TOO_LONG;
  return null;
}

/** An address without its trailing slashes ('/docs/intro/' gives '/docs/intro'; '/' stays '/'). */
export function normalisePath(path) {
  const trimmed = String(path ?? '').replace(TRAILING_SLASHES, '');
  return trimmed === '' ? '/' : trimmed;
}

/** True for a page address the function accepts, with or without a trailing slash. */
export function isPagePath(path) {
  return typeof path === 'string' && path.length <= MAX_PAGE_LENGTH && PAGE_PATTERN.test(normalisePath(path));
}

/** True when the page is on a list of pages without the prompt; a trailing slash makes no difference. */
export function isExcluded(permalink, entries) {
  if (!Array.isArray(entries)) return false;
  const page = normalisePath(permalink);
  return entries.some((entry) => typeof entry === 'string' && normalisePath(entry) === page);
}

/** The entries of a list that can match no page (not a string, or not a page address), for the tests. */
export function listProblems(entries) {
  if (!Array.isArray(entries)) return ['the list is not an array'];
  return entries.filter((entry) => !isPagePath(entry)).map((entry) => `not a page address: ${JSON.stringify(entry)}`);
}

/**
 * True when a page shows the prompt: the feature is on, the page is not unlisted, its address is
 * one the function accepts, and it is not on the list of pages without the prompt.
 */
export function promptIsShown({ enabled, permalink, unlisted, forbidden }) {
  if (enabled !== true || unlisted === true) return false;
  return isPagePath(permalink) && !isExcluded(permalink, forbidden);
}

/**
 * What a send came to, from the function's status and the `code` of its JSON answer: OUTCOME_SENT
 * only for 200 with `ok: true`, OUTCOME_TOO_MANY for 429, OUTCOME_CAPTCHA for a captcha code, and
 * OUTCOME_FAILED for everything else, an answer that is not the function's included.
 */
export function outcomeOf(status, body) {
  const answer = body !== null && typeof body === 'object' ? body : {};
  if (status === OK && answer.ok === true) return OUTCOME_SENT;
  if (status === TOO_MANY_REQUESTS) return OUTCOME_TOO_MANY;
  if (answer.code === CODES.captcha || answer.code === CODES.captchaUnavailable) return OUTCOME_CAPTCHA;
  return OUTCOME_FAILED;
}

/**
 * True when the function's answer says the mail service itself refused the message or could not
 * be reached (CODES.mail, CODES.mailQuota). The mail service may keep that answer under the
 * message's id and give it again to a repeat, so the page's next try of the message goes out
 * under a new id. After every other outcome the page keeps the id while the message stays the
 * same: either nothing was asked of the mail service under it, or its answer never came back and
 * the mail may have gone, and then the id is what stops a second copy.
 */
export function isMailRefusal(body) {
  const answer = body !== null && typeof body === 'object' ? body : {};
  return answer.code === CODES.mail || answer.code === CODES.mailQuota;
}
