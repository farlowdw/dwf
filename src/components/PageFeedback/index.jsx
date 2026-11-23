/**
 * index.jsx: the page-feedback prompt, under the text of a docs page or a blog post. A reader
 * answers the question with a thumb, may write a few words in the card that opens, and sends them
 * to the site's own function, which mails them to the owner (functions/feedback). Drawn here with
 * each word as its name in angle marks, as `npm start` shows a word that is still empty:
 *
 *     ( ‹question›   [up] [down] )                      the row: the question and two thumbs
 *     +----------------------------------------------+
 *     | ‹askDown›                                    |  the card, while a thumb is chosen: the
 *     | +------------------------------------------+ |  line for that thumb, the field, the note
 *     | |                                          | |  (optional), the problem line, the count
 *     | +------------------------------------------+ |  (from COUNTER_FROM on), the captcha's
 *     | ‹note›                                       |  place, Cancel and Send
 *     |                          [‹cancel›] [‹send›] |
 *     +----------------------------------------------+
 *
 *     <PageFeedback key={metadata.permalink} permalink={metadata.permalink}
 *       unlisted={metadata.unlisted} />                 // a docs page: the row is in the server's HTML
 *     <PageFeedback … clientOnly />                     // a blog post: in the browser only
 *
 * WHERE IT SHOWS
 *   - Only where rules.js > promptIsShown says so: the switch is on
 *     (docusaurus.config.js > customFields.feedbackEnabled), the page is not unlisted, its address
 *     is one the function accepts, and it is on neither list of pages without the prompt
 *     (customFields.forbiddenFeedbackDocPaths and forbiddenFeedbackBlogPaths, read as one list).
 *   - A production build shows it only once every word it needs is written (words.js >
 *     missingWords: the required words, and on a site with a captcha the captcha's words too).
 *     Under `npm start` a word that is still empty shows its name in angle marks (shownWord).
 *   - Docs: the row is in the server's HTML, kept hidden (its space kept) until the page has
 *     hydrated, so nobody presses a button that does nothing yet; with scripts off it never shows
 *     (styles.module.css). A post (`clientOnly`): rendered in the browser only, after hydration,
 *     because the blog plugin copies a post's built HTML into the RSS and Atom feeds.
 *   - The mounts give it key={permalink}: a move to another page starts afresh.
 * WHAT A READER DOES
 *   - A thumb opens the card under the row and is drawn filled; the page below moves down. The
 *     other thumb changes the card's line and keeps the text. The chosen thumb again, Cancel or
 *     Escape close the card; the text is kept until the page is left. The second click of a
 *     double click does nothing, and its press moves no focus: a double click opens the card and
 *     leaves it open, the focus in its field.
 *   - Nothing goes to the site's function before Send. On a site with a captcha, opening the card
 *     loads Cloudflare's script, and its check runs while the reader writes (captcha.js).
 *   - On Send: text is required after a thumbs down (rules.js > isTextRequired); without it the
 *     problem line says `textRequired`, the focus goes to the field, and nothing is sent. Then the
 *     captcha's token, on a site with one: while Cloudflare's box waits for the reader the problem
 *     line says `captchaNeeded` at once (OUTCOME_CAPTCHA_NEEDED), and when no token can be had it
 *     says `captchaFailed` (OUTCOME_CAPTCHA); nothing is sent in either case. Then one POST
 *     (sendFeedback.js).
 *   - Sent: the card goes, the text is emptied, the row says `thanks` in place of the question,
 *     and the thumbs do nothing more. Anything else: the card and the text stay, the problem line
 *     says so with the outcome's own word (`failed`, `tooMany`, `captchaFailed` or
 *     `captchaNeeded`; an optional one that is still empty gives way to the word words.js >
 *     FALLBACKS names), and Send can be pressed again. The captcha is then reset for a fresh
 *     token, except after OUTCOME_CAPTCHA_NEEDED: the reader ticks the box, then presses Send.
 *   - While a message is on its way Send says `sending`; the thumbs, Cancel and the field wait.
 *   - Keys: Cmd/Ctrl+Enter in the field sends (the code editor on this site runs code with the
 *     same keys); Enter alone is a new line; Escape in the card is Cancel; Tab is not captured.
 *     A key that belongs to an input-method composition is left alone (isCompositionKey): the
 *     Escape that drops a half-typed word does not close the card.
 * ACCESSIBILITY
 *   - The row is a group named by the question (once sent, by the thanks), a <span> (never a
 *     heading: the page's outline and its table of contents stay as they are). Each thumb is a
 *     real button: aria-label and title from words.js, aria-pressed, aria-expanded, aria-controls
 *     on the chosen one while the card is open, and aria-disabled (never `disabled`, which would
 *     drop the focus) while a message is on its way and once it was sent. Send is aria-disabled
 *     while sending, for the same reason.
 *   - The card's line labels the field. The field has aria-required after a thumbs down, and
 *     aria-invalid while its text is missing or too long; its aria-describedby names the note,
 *     when there is one, and the problem line while the text is at fault. The problem line
 *     (role="alert") is in the card from the start, empty while there is no problem.
 *   - The count (from COUNTER_FROM on) counts what the field's maxLength counts, so it reads
 *     "2000 / 2000" exactly when the field takes no more; it is then drawn in the problem's colour
 *     (data-full). A screen reader skips it (aria-hidden) and reads a hidden copy instead
 *     (aria-live="polite", in the card from the start), which gets the count only once the field
 *     has rested for SPOKEN_COUNT_DELAY_MS: the count is not read out at every key. Nor is it in
 *     the field's aria-describedby, which a screen reader would read again at every change.
 *   - One status line for a screen reader (role="status", visually hidden, in the prompt but not
 *     in the card, there from the first render and empty at rest): `sending` while a message is
 *     on its way (the wait for the captcha's token too), and `thanks` after a send when the focus
 *     did not go to the thanks. The thanks in the row is no live region itself, so it is heard
 *     once.
 *   - Focus: into the field when the card opens, without the browser's jump (preventScroll; then
 *     the card is scrolled into view only as far as needed); on a touch-first device it stays on
 *     the thumb, so no keyboard rises over the page. Back to the thumb on Cancel, and on a second
 *     click of the chosen thumb. After a send, to the thanks (preventScroll) only when the focus
 *     is still in the prompt, or nowhere (<body>): a reader who has moved on (a link, the comment
 *     box, another field) keeps the focus there, and the status line says `thanks`. With the
 *     focus the thanks comes into view, as far as needed, where the card's going left the row
 *     outside the window (a phone whose reader had scrolled down to Send); not for a reader who
 *     scrolled the whole prompt out of the window while the message was on its way.
 *   - Every text that changes sits alone in its own element (React replaces it whole), so a
 *     browser's page translation, which wraps text in elements of its own, cannot break an update.
 * THE RELOAD AFTER A DEPLOY  While the field holds text a reader could see, or a message is on its
 *   way, the card holds the reload (unsentText.js; src/clientModules/buildIdReload.js asks it).
 * ONE ID PER MESSAGE  Made when the card first opens, and sent as `id`, so a second try of the same
 *   message is not delivered twice: it is kept while the thumb and the cleaned text stay the same.
 *   A new one comes after a send that succeeded; for a message whose thumb or text changed after a
 *   try that failed (another message); and after a try the mail service refused, even when nothing
 *   changed (sendFeedback.js > mailRefused, rules.js > isMailRefusal): the mail service may keep
 *   its refusal under the id and give it again to a repeat.
 *
 * HOW TO CHANGE IT
 *   The words: words.js. The rules (what is required, the limits, the outcomes): rules.js. The
 *   look: styles.module.css. The icons: the four *_PATH constants below. The captcha: captcha.js.
 *   The transport: sendFeedback.js. Where it is mounted: src/theme/DocItem/Layout/index.js and
 *   src/theme/BlogPostItem/Content/index.js. The switch and the two lists: docusaurus.config.js >
 *   customFields. The plain modules beside it have tests (__tests__); this file has none of its
 *   own, so walk through the list above in a browser after a change.
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useIsBrowser from '@docusaurus/useIsBrowser';
import { useColorMode } from '@docusaurus/theme-common';
import {
  COUNTER_FROM, MAX_TEXT_LENGTH, OUTCOME_CAPTCHA, OUTCOME_CAPTCHA_NEEDED, OUTCOME_FAILED, OUTCOME_SENT,
  PROBLEM_REQUIRED, PROBLEM_TOO_LONG, THUMBS, THUMB_DOWN, THUMB_UP, cleanText, isBlank, isTextRequired,
  normalisePath, promptIsShown, textProblem,
} from './rules.js';
import { missingWords, wordOf } from './words.js';
import { setUnsentText } from './unsentText.js';
import { sendFeedback } from './sendFeedback.js';
import { createCaptcha } from './captcha.js';
import styles from './styles.module.css';

/*
 * The four icons below are Google's Material Icons (Apache License 2.0), as @mui/icons-material
 * 9.4.0 (MIT) ships them: each path is copied from that package, in its 24 × 24 box, and each
 * comment gives the name the package gives it.
 */

/** ThumbUpOutlined: thumbs up, not chosen. */
export const THUMB_UP_OUTLINED_PATH =
  'M9 21h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.58 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2M9 9l4.34-4.34L12 10h9v2l-3 7H9zM1 9h4v12H1z';

/** ThumbDownOutlined: thumbs down, not chosen. */
export const THUMB_DOWN_OUTLINED_PATH =
  'M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2m0 12-4.34 4.34L12 14H3v-2l3-7h9zm4-12h4v12h-4z';

/** ThumbUp: thumbs up, chosen. */
export const THUMB_UP_PATH =
  'M1 21h4V9H1zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73z';

/** ThumbDown: thumbs down, chosen. */
export const THUMB_DOWN_PATH =
  'M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2m4 0v12h4V3z';

/** Each thumb's two icons, its look (styles.module.css) and its words (the keys of words.js). */
const THUMB_PARTS = Object.freeze({
  [THUMB_UP]: Object.freeze({
    outlined: THUMB_UP_OUTLINED_PATH,
    filled: THUMB_UP_PATH,
    className: styles.up,
    name: 'thumbUp',
    ask: 'askUp',
    placeholder: 'placeholderUp',
  }),
  [THUMB_DOWN]: Object.freeze({
    outlined: THUMB_DOWN_OUTLINED_PATH,
    filled: THUMB_DOWN_PATH,
    className: styles.down,
    name: 'thumbDown',
    ask: 'askDown',
    placeholder: 'placeholderDown',
  }),
});

/** Where a message stands: being written, on its way, or sent. */
const STATUS_IDLE = 'idle';
const STATUS_SENDING = 'sending';
const STATUS_SENT = 'sent';

/** The field's height in lines before it grows (styles.module.css > .field keeps the same four). */
const FIELD_ROWS = 4;

/** How long the field must rest before a screen reader is told the count: it is not read at every key. */
const SPOKEN_COUNT_DELAY_MS = 1000;

/** event.detail of a single click and of its press: a double click's second ones have 2, a key press on a button 0. */
const SINGLE_CLICK = 1;

/**
 * The keyCode of a key an input method took for itself. Safari gives it to the key that ends a
 * composition (Escape, Enter), which it sends after the composition, with isComposing false.
 */
const IME_KEY_CODE = 229;

/** A touch-first device: the focus stays on the thumb when the card opens. */
const COARSE_POINTER = '(pointer: coarse)';

/** A reader who asked for less motion: the card when it opens, and the thanks after a send, come into view without a smooth scroll. */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** A production build: a word the prompt needs that is still empty keeps the prompt off (words.js). */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * The word `name` as the reader meets it: words.js > wordOf, which gives the word FALLBACKS names
 * while an optional word is empty. Under `npm start` a word that is still empty, fallbacks and
 * all, shows its name in angle marks (‹thumbUp›), so the layout can be seen before the words are
 * written. In a production build an optional word that is empty, fallbacks and all, is '' (its
 * place is left out); a needed one never gets here empty.
 */
function shownWord(name) {
  const own = wordOf(name);
  if (own !== '' || IS_PRODUCTION) return own;
  return `‹${name}›`;
}

/**
 * The problem line's words: missing text shows `textRequired`, text over the limit `failed`, and
 * what a send came to its own word (an outcome is a key of words.js; its fallback is there).
 */
function problemWords(problem) {
  if (problem === null) return '';
  if (problem === PROBLEM_REQUIRED) return shownWord('textRequired');
  if (problem === PROBLEM_TOO_LONG) return shownWord(OUTCOME_FAILED);
  return shownWord(problem);
}

/** The status line's words: `sending` while a message is on its way; `thanks` once sent, when the focus did not go to the thanks. */
function statusWords(sending, thanksInStatus) {
  if (sending) return shownWord('sending');
  return thanksInStatus ? shownWord('thanks') : '';
}

/**
 * The count: "1834 / 2000" from COUNTER_FROM on, '' before. It counts what the field's maxLength
 * counts (the length of its value, in UTF-16 units), so it reads "2000 / 2000" when the field is full.
 */
function countWords(text) {
  return text.length >= COUNTER_FROM ? `${text.length} / ${MAX_TEXT_LENGTH}` : '';
}

/** True when the field holds all its maxLength lets it hold: it takes no more. */
function isFull(text) {
  return text.length >= MAX_TEXT_LENGTH;
}

/** The pages without the prompt: the docs list and the blog list as one (their addresses cannot meet). */
function forbiddenPages(fields) {
  return [fields.forbiddenFeedbackDocPaths, fields.forbiddenFeedbackBlogPaths].flatMap((list) => (Array.isArray(list) ? list : []));
}

/** The captcha's site key, or '' for a site without a captcha. */
function captchaSiteKey(fields) {
  const key = fields.feedbackCaptchaSiteKey;
  return typeof key === 'string' ? key.trim() : '';
}

/** True in a production build while a word the prompt needs is empty (with a captcha, its words count too). */
function wordsAreMissing(hasCaptcha) {
  return IS_PRODUCTION && missingWords(undefined, { captcha: hasCaptcha }).length > 0;
}

/** True when the browser matches a media query; false where it cannot tell. */
function matchesMedia(query) {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/**
 * `element` into view, as far as needed and no further (nothing moves when it is in view
 * already, its scroll margins included); without the smooth scroll for a reader who asked for
 * less motion.
 */
function bringIntoView(element) {
  element?.scrollIntoView?.({ block: 'nearest', behavior: matchesMedia(REDUCED_MOTION) ? 'auto' : 'smooth' });
}

/**
 * True when some part of `element` is inside the window, from its top edge to its bottom one:
 * the reader still has it before them. False once they have scrolled all of it away (and where
 * the browser cannot tell).
 */
function isInWindow(element) {
  if (typeof element?.getBoundingClientRect !== 'function') return false;
  const box = element.getBoundingClientRect();
  return box.bottom > 0 && box.top < window.innerHeight;
}

/**
 * True when the focus is in `root` (the prompt) or nowhere (<body>): a send that ends may move it
 * to the thanks. Anywhere else (a link, the comment box, another field) the reader has moved on.
 */
function focusIsOurs(root) {
  const active = document.activeElement;
  return active === null || active === document.body || Boolean(root?.contains(active));
}

/**
 * True for a click, or a press of the mouse button, that is the second (or third) of a quick run:
 * the second click of a double click. A thumb ignores both: the click chooses nothing, and the
 * press (prevented) does not take the focus out of the field the first click put it in.
 */
function isRepeatClick(event) {
  return event.detail > SINGLE_CLICK;
}

/**
 * True for a key press that belongs to an input-method composition (Japanese, Chinese, Korean):
 * the card leaves it alone. Most browsers say so on the key (isComposing); Safari ends the
 * composition first, and its key says only IME_KEY_CODE.
 */
function isCompositionKey(event) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === IME_KEY_CODE;
}

/** True when the captcha gave no token because Cloudflare's box waits for the reader (captcha.js). */
function waitsForReader(error) {
  return error?.needsReader === true;
}

/** A new id for a message, or undefined where the browser makes none (randomUUID needs https or localhost). */
function newMessageId() {
  try {
    return globalThis.crypto?.randomUUID?.();
  } catch {
    return undefined;
  }
}

/** What a message says, to tell a second try of the same message from a changed one. */
function messageKey(thumb, text) {
  return `${thumb}\n${cleanText(text)}`;
}

/**
 * The count for a screen reader: '' at first, then the count once `text` has not changed for
 * SPOKEN_COUNT_DELAY_MS (the reader has stopped typing). The timer goes with the card.
 */
function useSpokenCount(text) {
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSpoken(countWords(text)), SPOKEN_COUNT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return spoken;
}

/** A thumb's icon: outlined, or filled while it is chosen (decoration: its button has a name). */
function ThumbIcon({ thumb, chosen }) {
  const parts = THUMB_PARTS[thumb];
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={chosen ? parts.filled : parts.outlined} />
    </svg>
  );
}

/** One thumb's button. */
function ThumbButton({ thumb, chosen, open, locked, cardId, buttonRef, onChoose }) {
  const parts = THUMB_PARTS[thumb];
  const name = shownWord(parts.name);
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`${styles.thumb} ${parts.className}`}
      aria-label={name}
      title={name}
      aria-pressed={chosen}
      aria-expanded={open && chosen}
      aria-controls={open && chosen ? cardId : undefined}
      aria-disabled={locked || undefined}
      onMouseDown={(event) => {
        if (isRepeatClick(event)) event.preventDefault();
      }}
      onClick={(event) => {
        if (!isRepeatClick(event)) onChoose(thumb);
      }}>
      <ThumbIcon thumb={thumb} chosen={chosen} />
    </button>
  );
}

/** The row: the question (or, once sent, the thanks) and the two thumbs. */
function Row({ ids, thumb, open, sent, locked, thumbButtons, thanksRef, onChoose }) {
  return (
    <div className={styles.row} role="group" aria-labelledby={sent ? ids.thanks : ids.question}>
      {sent ? (
        <span key="thanks" id={ids.thanks} ref={thanksRef} className={styles.question} tabIndex={-1}>
          {shownWord('thanks')}
        </span>
      ) : (
        <span key="question" id={ids.question} className={styles.question}>
          {shownWord('question')}
        </span>
      )}
      <span className={styles.thumbs}>
        {THUMBS.map((value) => (
          <ThumbButton
            key={value}
            thumb={value}
            chosen={thumb === value}
            open={open}
            locked={locked}
            cardId={ids.card}
            buttonRef={(node) => {
              thumbButtons.current[value] = node;
            }}
            onChoose={onChoose}
          />
        ))}
      </span>
    </div>
  );
}

/**
 * The card: the line for the chosen thumb, the field, the note, the problem line, the count (and
 * its copy for a screen reader), the captcha's place, Cancel and Send.
 */
function Card({ ids, thumb, text, problem, sending, hasCaptcha, refs, handlers }) {
  const parts = THUMB_PARTS[thumb];
  const spokenCount = useSpokenCount(text);
  const invalid = problem === PROBLEM_REQUIRED || problem === PROBLEM_TOO_LONG;
  const note = shownWord('note');
  const describedBy = [note === '' ? null : ids.note, invalid ? ids.problem : null].filter(Boolean).join(' ');
  return (
    <form id={ids.card} ref={refs.card} className={styles.card} noValidate onSubmit={handlers.submit} onKeyDown={handlers.cardKey}>
      <label htmlFor={ids.field} className={styles.ask}>
        {shownWord(parts.ask)}
      </label>
      <textarea
        id={ids.field}
        ref={refs.field}
        className={styles.field}
        rows={FIELD_ROWS}
        maxLength={MAX_TEXT_LENGTH}
        value={text}
        placeholder={shownWord(parts.placeholder) || undefined}
        aria-required={isTextRequired(thumb) || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy || undefined}
        readOnly={sending}
        onChange={handlers.text}
        onKeyDown={handlers.fieldKey}
      />
      {note === '' ? null : (
        <div id={ids.note} className={styles.note}>
          {note}
        </div>
      )}
      <div id={ids.problem} className={styles.problem} role="alert">
        {problemWords(problem)}
      </div>
      <div className={styles.count} aria-hidden="true" data-full={isFull(text) || undefined}>
        {countWords(text)}
      </div>
      <div className={styles.visuallyHidden} aria-live="polite">
        {spokenCount}
      </div>
      {hasCaptcha ? <div ref={refs.captchaBox} className={styles.captcha} /> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} aria-disabled={sending || undefined} onClick={handlers.cancel}>
          {shownWord('cancel')}
        </button>
        <button type="submit" className={styles.send} aria-disabled={sending || undefined}>
          <span key={sending ? 'sending' : 'send'}>{shownWord(sending ? 'sending' : 'send')}</span>
        </button>
      </div>
    </form>
  );
}

/** The prompt itself, on a page that shows it (see the header): its state, its effects, its handlers. */
function Prompt({ page, siteKey }) {
  const [thumb, setThumb] = useState(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState(STATUS_IDLE);
  const [problem, setProblem] = useState(null);
  const [thanksInStatus, setThanksInStatus] = useState(false);
  const [holder] = useState(() => ({}));
  const { colorMode } = useColorMode();
  const baseId = useId();
  const ids = {
    question: `${baseId}question`,
    thanks: `${baseId}thanks`,
    card: `${baseId}card`,
    field: `${baseId}field`,
    note: `${baseId}note`,
    problem: `${baseId}problem`,
  };
  const rootRef = useRef(null);
  const thumbButtons = useRef({});
  const thanksRef = useRef(null);
  const cardRef = useRef(null);
  const fieldRef = useRef(null);
  const captchaBox = useRef(null);
  const captcha = useRef(null);
  const sendingNow = useRef(false);
  const message = useRef({ id: undefined, tried: null });
  const pendingFocus = useRef(null);
  const refs = { card: cardRef, field: fieldRef, captchaBox };
  const sending = status === STATUS_SENDING;
  const sent = status === STATUS_SENT;
  const hasCaptcha = siteKey !== '';

  // The reload after a deploy waits while the field holds text, or while a message is on its way.
  useEffect(() => {
    setUnsentText(holder, !isBlank(text) || status === STATUS_SENDING);
    return () => setUnsentText(holder, false);
  }, [holder, text, status]);

  // A focus asked for by a handler, once the elements it needs are in the page.
  useEffect(() => {
    const move = pendingFocus.current;
    pendingFocus.current = null;
    if (move !== null) move();
  });

  // The captcha lives with the card: created when it opens, removed when it closes.
  useEffect(() => {
    if (!open || !hasCaptcha || captchaBox.current === null) return undefined;
    const created = createCaptcha({ container: captchaBox.current, siteKey, theme: colorMode });
    captcha.current = created;
    return () => {
      created.remove();
      if (captcha.current === created) captcha.current = null;
    };
  }, [open, hasCaptcha, siteKey, colorMode]);

  /** Into the field (unless touch-first), and the card into view as far as needed. */
  function showCard() {
    if (!matchesMedia(COARSE_POINTER)) fieldRef.current?.focus({ preventScroll: true });
    bringIntoView(cardRef.current);
  }

  /**
   * The focus to the thanks, without the browser's jump. With `follow`, the thanks then comes
   * into view, where the card's going left the row outside the window (a phone whose reader had
   * scrolled down to Send).
   */
  function focusThanks(follow) {
    thanksRef.current?.focus({ preventScroll: true });
    if (follow) bringIntoView(thanksRef.current);
  }

  function close() {
    setOpen(false);
    setThumb(null);
  }

  /** A new message: a new id, not tried yet. */
  function startMessage() {
    message.current = { id: newMessageId(), tried: null };
  }

  function choose(value) {
    if (sending || sent) return;
    if (open && thumb === value) {
      cancel();
      return;
    }
    setThumb(value);
    setProblem(null);
    if (open) return;
    setOpen(true);
    if (message.current.id === undefined) startMessage();
    pendingFocus.current = showCard;
  }

  /** Close the card and put the focus back on the chosen thumb (Cancel, Escape, the chosen thumb again). */
  function cancel() {
    if (sending) return;
    const chosen = thumbButtons.current[thumb];
    close();
    chosen?.focus();
  }

  /** The id for this message: kept for a second try of the same message, new once it changed. */
  function messageId() {
    const key = messageKey(thumb, text);
    if (message.current.tried !== null && message.current.tried !== key) startMessage();
    message.current.tried = key;
    return message.current.id;
  }

  /**
   * The captcha's token (on a site with one), then the one POST: what the send came to, as
   * sendFeedback.js gives it. When the captcha gives no token nothing is sent, and no mail
   * service refused anything.
   */
  async function deliver() {
    let token;
    if (hasCaptcha) {
      try {
        token = await captcha.current.token();
      } catch (error) {
        return { outcome: waitsForReader(error) ? OUTCOME_CAPTCHA_NEEDED : OUTCOME_CAPTCHA, mailRefused: false };
      }
    }
    return sendFeedback({ thumb, text, page, captcha: token, id: messageId() });
  }

  /**
   * The message went: the card goes, the row says thanks, and the focus follows only when it was
   * the prompt's. The page follows the focus only when the prompt was still before the reader
   * (`promptWasInView`): one who scrolled on while the message was on its way stays where they are.
   */
  function showThanks(focusWasOurs, promptWasInView) {
    setStatus(STATUS_SENT);
    setOpen(false);
    setText('');
    setThanksInStatus(!focusWasOurs);
    startMessage();
    if (focusWasOurs) pendingFocus.current = () => focusThanks(promptWasInView);
  }

  /**
   * The message did not go: the card and the text stay, and the problem line says why. A refusal
   * of the mail service starts a new id; every outcome but OUTCOME_CAPTCHA_NEEDED resets the
   * captcha for a fresh token (after that one the widget keeps its box, for the reader to tick).
   */
  function showProblem({ outcome, mailRefused }) {
    if (mailRefused) startMessage();
    setStatus(STATUS_IDLE);
    setProblem(outcome);
    if (outcome !== OUTCOME_CAPTCHA_NEEDED) captcha.current?.reset();
  }

  async function send() {
    if (sendingNow.current || status !== STATUS_IDLE || !open) return;
    const missing = textProblem(thumb, text);
    if (missing !== null) {
      setProblem(missing);
      fieldRef.current?.focus();
      return;
    }
    sendingNow.current = true;
    setStatus(STATUS_SENDING);
    setProblem(null);
    const result = await deliver();
    const focusWasOurs = focusIsOurs(rootRef.current);
    const promptWasInView = isInWindow(rootRef.current);
    sendingNow.current = false;
    if (result.outcome === OUTCOME_SENT) showThanks(focusWasOurs, promptWasInView);
    else showProblem(result);
  }

  const handlers = {
    submit(event) {
      event.preventDefault();
      send();
    },
    text(event) {
      const next = event.target.value;
      setText(next);
      if ((problem === PROBLEM_REQUIRED || problem === PROBLEM_TOO_LONG) && textProblem(thumb, next) === null) setProblem(null);
    },
    fieldKey(event) {
      if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || isCompositionKey(event)) return;
      event.preventDefault();
      send();
    },
    cardKey(event) {
      if (event.key !== 'Escape' || isCompositionKey(event)) return;
      event.preventDefault();
      cancel();
    },
    cancel,
  };

  return (
    <div ref={rootRef} className={styles.feedback}>
      <Row
        ids={ids}
        thumb={thumb}
        open={open}
        sent={sent}
        locked={sending || sent}
        thumbButtons={thumbButtons}
        thanksRef={thanksRef}
        onChoose={choose}
      />
      {open ? (
        <Card
          ids={ids}
          thumb={thumb}
          text={text}
          problem={problem}
          sending={sending}
          hasCaptcha={hasCaptcha}
          refs={refs}
          handlers={handlers}
        />
      ) : null}
      <div className={styles.visuallyHidden} role="status">
        {statusWords(sending, thanksInStatus)}
      </div>
    </div>
  );
}

/**
 * See the header. `permalink`: the page's address (metadata.permalink); `unlisted`: the page's
 * own flag; `clientOnly`: nothing on the server and during hydration (a blog post).
 */
export default function PageFeedback({ permalink, unlisted = false, clientOnly = false }) {
  const { siteConfig } = useDocusaurusContext();
  const isBrowser = useIsBrowser();
  const fields = siteConfig.customFields ?? {};
  const siteKey = captchaSiteKey(fields);
  const shown = promptIsShown({ enabled: fields.feedbackEnabled, permalink, unlisted, forbidden: forbiddenPages(fields) });
  if (!shown || wordsAreMissing(siteKey !== '') || (clientOnly && !isBrowser)) return null;
  return <Prompt page={normalisePath(permalink)} siteKey={siteKey} />;
}
