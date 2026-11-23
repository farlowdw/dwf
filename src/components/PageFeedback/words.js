/**
 * words.js: every word the page-feedback prompt shows a reader or reads to a screen reader, in
 * one place. The site's owner writes them. Each value starts empty, except the question, which
 * he gave (2026-11-22). The component (index.jsx) reads this file, and the function's answers are
 * codes, never sentences. Two things a reader may meet are not words of this file: the count of
 * characters near the limit, which is digits ("1834 / 2000"), and, on a site with a captcha,
 * Cloudflare's own widget with its own words, when it needs the reader.
 *
 * WHAT AN EMPTY VALUE DOES
 *   A word in REQUIRED_WORDS that is still empty keeps the prompt off every page of a production
 *   build, and scripts/site-files.test.mjs fails while the feature is switched on
 *   (docusaurus.config.js > customFields.feedbackEnabled). The same holds for the words in
 *   CAPTCHA_WORDS on a site with a captcha (customFields.feedbackCaptchaSiteKey is not empty).
 *   Under `npm start` the prompt shows the word's name in its place (‹thumbUp›), so the layout
 *   can be seen before the words are written.
 *   A word in OPTIONAL_WORDS may stay empty for good: its place is then left out, or the word
 *   FALLBACKS names is shown in its place.
 *
 * HOW TO CHANGE IT
 *   Edit the text between the quotes; nothing else needs to change. A new word: a key here, in
 *   REQUIRED_WORDS, CAPTCHA_WORDS or OPTIONAL_WORDS, and its use in index.jsx.
 *   Tests: __tests__/rules.test.js holds the three lists to the keys of WORDS.
 */

export const WORDS = Object.freeze({
  /** The prompt itself, beside the two thumbs. */
  question: 'Is this page useful?',

  /** The name of the thumbs-up button, read by a screen reader and shown as its tooltip. */
  thumbUp: '',

  /** The name of the thumbs-down button, read by a screen reader and shown as its tooltip. */
  thumbDown: '',

  /**
   * The line above the text field after a thumbs up. Text is optional there: say so in it. A
   * thumb alone sends nothing: the message goes when Send is pressed, with or without text.
   */
  askUp: '',

  /**
   * The line above the text field after a thumbs down. Text is required there: say so in it. A
   * thumb alone sends nothing: the message goes when Send is pressed.
   */
  askDown: '',

  /** Optional. The grey text in the empty field after a thumbs up. */
  placeholderUp: '',

  /** Optional. The grey text in the empty field after a thumbs down. */
  placeholderDown: '',

  /**
   * Optional. A line under the field, for example on where the message goes, or that no reply
   * can come back: the prompt asks for no address.
   */
  note: '',

  /** The button that sends the message. */
  send: '',

  /** The same button while the message is on its way; also read to a screen reader then. */
  sending: '',

  /** The button that closes the card without sending. The text is kept until the page is left. */
  cancel: '',

  /** Shown in place of the question once the message was sent; the card is then gone. */
  thanks: '',

  /** Shown under the field when Send is pressed after a thumbs down with no text. */
  textRequired: '',

  /**
   * Shown in the card when the message could not be sent. The text stays, so Send can be pressed
   * again. It also stands for failures that pressing Send again cannot mend: the function is not
   * set up, or the mail service's limit for the day is used up.
   */
  failed: '',

  /**
   * Optional. Shown when too many messages came from one connection: the function takes five in
   * ten minutes, then one more every two minutes. `failed` when empty.
   */
  tooMany: '',

  /**
   * Required on a site with a captcha. Shown when the captcha's check did not pass or could not
   * run. A reader whose browser or network stops Cloudflare's script meets it at every Send:
   * pressing Send again does not help there.
   */
  captchaFailed: '',

  /**
   * Optional. Shown when Send is pressed while the captcha still waits for the reader: its box
   * then shows in the card, above Cancel and Send, and nothing was sent. `captchaFailed` when
   * empty.
   */
  captchaNeeded: '',
});

/** The words the prompt cannot do without. */
export const REQUIRED_WORDS = Object.freeze([
  'question', 'thumbUp', 'thumbDown', 'askUp', 'askDown', 'send', 'sending', 'cancel', 'thanks', 'textRequired', 'failed',
]);

/** The words the prompt cannot do without on a site with a captcha. */
export const CAPTCHA_WORDS = Object.freeze(['captchaFailed']);

/** The words that may stay empty. */
export const OPTIONAL_WORDS = Object.freeze(['placeholderUp', 'placeholderDown', 'note', 'tooMany', 'captchaNeeded']);

/** The word shown in place of an optional word that is still empty, by the keys of WORDS. */
export const FALLBACKS = Object.freeze({ tooMany: 'failed', captchaNeeded: 'captchaFailed' });

/** A word of `words` without the white space round it; '' when it is missing or not a string. */
function written(words, name) {
  return typeof words[name] === 'string' ? words[name].trim() : '';
}

/**
 * The words the prompt needs that are still empty, by name: REQUIRED_WORDS, and CAPTCHA_WORDS too
 * when `captcha` is true (the site has a captcha).
 */
export function missingWords(words = WORDS, { captcha = false } = {}) {
  const needed = captcha ? [...REQUIRED_WORDS, ...CAPTCHA_WORDS] : REQUIRED_WORDS;
  return needed.filter((name) => written(words, name) === '');
}

/**
 * The word for `name`; while it is empty, the word FALLBACKS names in its place, and so on; ''
 * when none of them is written.
 */
export function wordOf(name, words = WORDS) {
  const tried = new Set();
  for (let key = name; key !== undefined && !tried.has(key); key = FALLBACKS[key]) {
    tried.add(key);
    const own = written(words, key);
    if (own !== '') return own;
  }
  return '';
}
