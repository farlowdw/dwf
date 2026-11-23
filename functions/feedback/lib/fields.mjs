/**
 * functions/feedback/lib/fields.mjs: what the body of one message may hold. The body is read
 * through a whitelist: only thumb, page, text, captcha and id are looked at, any other key is
 * ignored (an open tab may post an older shape after a deploy), and nothing that was not checked
 * is copied from it. The rules are src/components/PageFeedback/rules.js, the file the browser
 * reads too, so the two sides cannot disagree.
 *
 * THE FIELDS
 *   thumb    required: THUMB_UP or THUMB_DOWN (isThumb)
 *   page     required: an address isPagePath accepts; kept as normalisePath gives it
 *   text     required, a string; refused when textProblem(thumb, text) finds a problem (text is
 *            required after a thumbs down, and at most MAX_TEXT_LENGTH characters long); kept as
 *            cleanText gives it ('' after a thumbs up is a message without text)
 *   captcha  only when the function has a captcha (FEEDBACK_CAPTCHA_SECRET is set): a non-empty
 *            string of at most MAX_CAPTCHA_LENGTH. Never looked at otherwise
 *   id       optional: kept only when it matches SEND_ID_PATTERN, else left out (never a refusal)
 *
 * WHAT IT GIVES
 *   readFields(bodyText, { captchaRequired })
 *     { fields: { thumb, page, text, captcha, id } } (captcha and id undefined when not kept), or
 *     { problem } with one of FIELD_PROBLEMS: a few fixed words for the log line, never a value
 *     from the body.
 *
 * HOW TO CHANGE IT
 *   A rule: rules.js, which both sides read; never a copy here. A new field: a reader below, a row
 *   in THE FIELDS, the browser's side (src/components/PageFeedback/sendFeedback.js) and a test in
 *   ../__tests__/fields.test.mjs.
 */

import { isPlainObject, parseJson } from './helpers.mjs';
import {
  MAX_CAPTCHA_LENGTH, PROBLEM_REQUIRED, SEND_ID_PATTERN, cleanText, isPagePath, isThumb, normalisePath, textProblem,
} from '../../../src/components/PageFeedback/rules.js';

/** Why a body was refused: a few fixed words for the log line, never a value from the body. */
export const FIELD_PROBLEMS = Object.freeze({
  notJson: 'not JSON',
  notObject: 'not a JSON object',
  thumb: 'thumb',
  page: 'page',
  text: 'text is not a string',
  textRequired: 'text required',
  textTooLong: 'text too long',
  captcha: 'captcha token',
});

/** The problem of the text, or null: it must be a string that textProblem accepts. */
function textRefusal(thumb, text) {
  if (typeof text !== 'string') return FIELD_PROBLEMS.text;
  const problem = textProblem(thumb, text);
  if (problem === null) return null;
  return problem === PROBLEM_REQUIRED ? FIELD_PROBLEMS.textRequired : FIELD_PROBLEMS.textTooLong;
}

/** True for a captcha token of an acceptable shape. */
function isCaptchaToken(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_CAPTCHA_LENGTH;
}

/** The message's id when it has the shape of SEND_ID_PATTERN, else undefined. */
function sendId(value) {
  return typeof value === 'string' && SEND_ID_PATTERN.test(value) ? value : undefined;
}

/** The first field that breaks its rule, in the order of THE FIELDS, or null. */
function firstProblem(input, captchaRequired) {
  if (!isThumb(input.thumb)) return FIELD_PROBLEMS.thumb;
  if (!isPagePath(input.page)) return FIELD_PROBLEMS.page;
  const text = textRefusal(input.thumb, input.text);
  if (text !== null) return text;
  if (captchaRequired && !isCaptchaToken(input.captcha)) return FIELD_PROBLEMS.captcha;
  return null;
}

/** The message in a body (see WHAT IT GIVES in the header). */
export function readFields(bodyText, { captchaRequired = false } = {}) {
  const parsed = parseJson(bodyText);
  if (!parsed.ok) return { problem: FIELD_PROBLEMS.notJson };
  const input = parsed.value;
  if (!isPlainObject(input)) return { problem: FIELD_PROBLEMS.notObject };
  const problem = firstProblem(input, captchaRequired);
  if (problem !== null) return { problem };
  return {
    fields: {
      thumb: input.thumb,
      page: normalisePath(input.page),
      text: cleanText(input.text),
      captcha: captchaRequired ? input.captcha : undefined,
      id: sendId(input.id),
    },
  };
}
