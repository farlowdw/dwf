/**
 * sendFeedback.js: the page-feedback card's transport. One POST of the reader's message to the
 * site's own function (rules.js > FEEDBACK_ENDPOINT; the function is functions/feedback), with a
 * time limit, and what it came to: the key of the words to show (rules.js > OUTCOME_*), and
 * whether the mail service refused the message, so that the card gives its next try a new id. It
 * never rejects: a network error, a time-out, an answer that is not the function's (a 429 aside,
 * which is OUTCOME_TOO_MANY), anything thrown, is OUTCOME_FAILED.
 *
 *     const { outcome, mailRefused } = await sendFeedback({ thumb, text, page, captcha, id });
 *     // outcome: OUTCOME_SENT, OUTCOME_FAILED, OUTCOME_TOO_MANY or OUTCOME_CAPTCHA
 *     // mailRefused: true when the next try needs a new id (rules.js > isMailRefusal)
 *
 * WHAT IT SENDS  The body rules.js describes, { thumb, text, page, captcha, id }, with the text
 *   cleaned by cleanText; a key whose value is undefined (no captcha on the site, no id) is left out.
 *   content-type application/json, and nothing else: the function needs no cookie and no other
 *   header. This file sends nothing until the reader presses Send (index.jsx calls it then).
 * THE TIME LIMIT  SEND_TIMEOUT_MS (rules.js) from the call to the parsed answer. When it runs out,
 *   the request is aborted and the outcome is OUTCOME_FAILED, even from a fetch that would never
 *   settle.
 * WHY THE GLOBAL fetch  The reloader that src/clientModules/buildIdReload.js starts
 *   (shared/lib/pageReload/reloader.js) wraps window.fetch, and holds a reload after a deploy
 *   while a request to /.netlify/functions/ is under way (shared/lib/pageReload/decide.js >
 *   isApiRequest). So the default `fetchImpl` is read when a message is sent, never when this
 *   file loads: it is then that wrapped fetch. (globalThis.fetch and not a bare `fetch`: a browser
 *   without one gives OUTCOME_FAILED, not an error.)
 * THE ANSWER  outcome is outcomeOf(status, body) (rules.js), where body is the parsed JSON, or
 *   null when the answer is not JSON (a missing function's 404 page, a dev server's HTML).
 *   mailRefused is isMailRefusal(body) (rules.js): false when there was no answer (a network
 *   error, the time limit) or it was not JSON.
 *
 * HOW TO CHANGE IT
 *   The time limit: rules.js > SEND_TIMEOUT_MS. What a status or a code means to the reader:
 *   rules.js > outcomeOf; which codes ask for a new id: rules.js > isMailRefusal. The body:
 *   rules.js's header first (the function reads the same fields), then feedbackBody below.
 *   Another transport: here, keeping the promise that never rejects and the shape of its result.
 *   Tests: __tests__/sendFeedback.test.js (package.json > shared:verify names it).
 */

import { FEEDBACK_ENDPOINT, OUTCOME_FAILED, SEND_TIMEOUT_MS, cleanText, isMailRefusal, outcomeOf } from './rules.js';

/** The request's method. */
const METHOD = 'POST';

/** The request's one header: what the body is. */
const HEADERS = Object.freeze({ 'content-type': 'application/json' });

/** What a send came to when no answer can be read: a failed send, and no refusal of the mail service. */
const NO_ANSWER = Object.freeze({ outcome: OUTCOME_FAILED, mailRefused: false });

/** The request's body: the fields of rules.js, the text cleaned; JSON leaves out the undefined ones. */
export function feedbackBody({ thumb, text, page, captcha, id }) {
  return JSON.stringify({ thumb, text: cleanText(text), page, captcha, id });
}

/** The answer's body as JSON, or null when it is not JSON (or cannot be read). */
async function answerBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** One POST and what it came to; NO_ANSWER for anything that goes wrong on the way. */
async function post(message, fetchImpl, signal) {
  try {
    const response = await fetchImpl(FEEDBACK_ENDPOINT, { method: METHOD, headers: HEADERS, body: feedbackBody(message), signal });
    const body = await answerBody(response);
    return { outcome: outcomeOf(response.status, body), mailRefused: isMailRefusal(body) };
  } catch {
    return NO_ANSWER;
  }
}

/**
 * Send one message (see the header): a promise of { outcome, mailRefused } that never rejects.
 * `options` is for the tests: `fetchImpl` (default: the global fetch at the time of the call) and
 * `timeoutMs` (default: SEND_TIMEOUT_MS).
 */
export async function sendFeedback(message, options = {}) {
  let timer;
  try {
    const { fetchImpl = globalThis.fetch, timeoutMs = SEND_TIMEOUT_MS } = options ?? {};
    const controller = new AbortController();
    const timeUp = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(NO_ANSWER);
      }, timeoutMs);
    });
    return await Promise.race([post(message, fetchImpl, controller.signal), timeUp]);
  } catch {
    return NO_ANSWER;
  } finally {
    clearTimeout(timer);
  }
}
