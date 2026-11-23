/**
 * captcha.js: loads Cloudflare Turnstile and drives one widget for the page-feedback card
 * (index.jsx), on a site that has a site key (docusaurus.config.js >
 * customFields.feedbackCaptchaSiteKey). Without a key the card uses no captcha and nothing of
 * Cloudflare loads. No React here.
 *
 *     const captcha = createCaptcha({ container, siteKey, theme });   // when the card opens
 *     const token = await captcha.token();     // on Send: a fresh token, or a rejection
 *     captcha.reset();                         // after a send that did not go: ask for a new token
 *     captcha.remove();                        // when the card closes, or the page is left
 *
 * THE SCRIPT  loadCaptchaScript() adds CAPTCHA_SCRIPT_URL as one <script> element the first time
 *   a card opens (never at page load), and keeps it for the page: a later card, or a second call,
 *   gets the same load. It is Cloudflare's own address, never a copy (Cloudflare's docs: a proxied
 *   or cached api.js fails once they update it). It sets window.turnstile and has no AMD define
 *   (checked 2026-11-22), so Monaco's loader on a page with a code editor does not take it. Each
 *   caller waits at most LOAD_TIMEOUT_MS. A load that failed (blocked, offline) is forgotten and
 *   its element taken out, so a later call tries again. A load that is only slow goes on after
 *   that limit: the open card's widget is rendered when the script arrives
 *   (renderWhenLateScriptArrives), so a Send pressed after that goes through at the first press.
 *   A Send pressed between the limit and the script's arrival is still turned away at once.
 * THE WIDGET  Rendered explicitly into the card's empty <div>, with appearance 'interaction-only':
 *   nothing shows unless Cloudflare needs the reader, and then its checkbox shows in the card. Its
 *   size is chosen when it is rendered, from the width of that <div> (widgetSize): 'flexible', as
 *   wide as the card but never narrower than FLEXIBLE_MIN_WIDTH, or 'compact' (150 × 140 px) where
 *   that would stick out of the card, as on a phone 320 px wide; a place without a clientWidth
 *   gets 'flexible'. The size stays until the widget is rendered again (the card opens again, or
 *   the colour mode changes). Its check starts as soon as it is rendered, while the reader writes,
 *   and each token arrives through its callback. A token is single use and lasts 300 seconds:
 *   token() hands each one out once; an expired one is dropped (the widget then fetches a new one
 *   by itself, Cloudflare's default); reset() asks for a new one after a send that did not go, and
 *   loads the script again if it had failed. The page keeps each token's time too, by the clock
 *   on the wall (Date.now): Cloudflare's own notice of an expiry rides on a timer, which stands
 *   still while a laptop sleeps or a phone is locked, so a token kept longer than
 *   TOKEN_MAX_AGE_MS is not handed out; token() asks the widget afresh and waits for the next
 *   one. `theme` is the site's colour mode when the widget is rendered: index.jsx renders it
 *   again when the mode changes.
 *   token() waits at most TOKEN_TIMEOUT_MS for a token. It rejects at once after remove(), and in
 *   two cases more:
 *   - An error the widget or its script reported stands until reset(), which clears it and asks
 *     again; until the widget hands over a token or shows its checkbox by itself (Turnstile
 *     retries a failed check on its own); or until a script that was only slow arrives and its
 *     widget is rendered. While it stands, token() rejects at once, so a host missing from the
 *     widget's list, which Cloudflare reports when the card opens, costs no wait on Send. An
 *     error that comes while a call waits rejects that call at once too.
 *   - The widget waits for the reader from its before-interactive-callback until its
 *     after-interactive-callback, a token or reset(), whichever comes first: its checkbox shows
 *     meanwhile. While it does and no token is at hand, token() rejects at once with an Error
 *     whose `needsReader` is true; a call that already waits when the box appears is rejected the
 *     same way. The card then asks the reader to tick the box (rules.js > OUTCOME_CAPTCHA_NEEDED)
 *     and leaves the widget as it is: the reader ticks, and presses Send again.
 *   An error callback is always given: without one, Turnstile throws on an error. It returns
 *   nothing, so Turnstile still logs a warning with its error code in the console (where a wrong
 *   site key, or a host name missing from the widget's list, shows).
 * NOT TESTED  __tests__/captcha.test.js drives this file with a fake document and a fake
 *   `turnstile`. Cloudflare's real script, its widget, its timing, the order in which it calls the
 *   callbacks above, and how it sits in the card are not tested: look at them in a browser.
 *   Cloudflare's test site keys work on localhost: 3x00000000000000000000FF always shows the
 *   checkbox, 2x00000000000000000000AB always fails.
 *
 * HOW TO CHANGE IT
 *   The time limits: LOAD_TIMEOUT_MS, TOKEN_TIMEOUT_MS and TOKEN_MAX_AGE_MS. The widget's fixed
 *   options: WIDGET_OPTIONS; its size: FLEXIBLE_MIN_WIDTH and widgetSize. Cloudflare's names and
 *   values for both:
 *   developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/.
 *   Another captcha service: this file, keeping createCaptcha's three methods and the
 *   `needsReader` rejection, and the function's check (functions/feedback/lib/captcha.mjs).
 *   Tests: __tests__/captcha.test.js (package.json > shared:verify names it).
 */

/** Cloudflare's script, for explicit rendering. */
export const CAPTCHA_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** How long one caller waits for the script to load. */
export const LOAD_TIMEOUT_MS = 10000;

/** How long token() waits for a token. */
export const TOKEN_TIMEOUT_MS = 10000;

/**
 * How long a kept token is handed out after it came. Cloudflare takes a token for 300 seconds;
 * this leaves room for the send itself (rules.js > SEND_TIMEOUT_MS).
 */
export const TOKEN_MAX_AGE_MS = 280000;

/**
 * The widget's fixed options, in Cloudflare's names: shown only when the reader must act; no
 * hidden field in the card's form (the token goes in the JSON). Its size is not fixed: widgetSize
 * chooses it when the widget is rendered.
 */
export const WIDGET_OPTIONS = Object.freeze({
  appearance: 'interaction-only',
  'response-field': false,
});

/** The narrowest Cloudflare draws a 'flexible' widget, in CSS pixels; a narrower place gets 'compact'. */
export const FLEXIBLE_MIN_WIDTH = 300;

/** Cloudflare's two sizes the card uses: as wide as its place (FLEXIBLE_MIN_WIDTH at least), or 150 × 140 px. */
const SIZE_FLEXIBLE = 'flexible';
const SIZE_COMPACT = 'compact';

/** The script's load per document: a promise of window.turnstile, while it loads or once it has loaded. */
const loads = new WeakMap();

/** `promise`, or a rejection with `reason` once `ms` have passed. */
function withTimeout(promise, ms, reason) {
  let timer;
  const timeUp = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(reason)), ms);
  });
  return Promise.race([promise, timeUp]).finally(() => clearTimeout(timer));
}

/** Add the script to `doc`; the promise settles with its load (window.turnstile) or its error. */
function addScript(doc) {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    const fail = (reason) => {
      loads.delete(doc);
      script.remove();
      reject(new Error(reason));
    };
    script.src = CAPTCHA_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', () => {
      const turnstile = doc.defaultView?.turnstile;
      if (turnstile) resolve(turnstile);
      else fail('the captcha script ran without setting window.turnstile');
    });
    script.addEventListener('error', () => fail('the captcha script could not be loaded'));
    doc.head.append(script);
  });
}

/**
 * window.turnstile of `doc`, loading Cloudflare's script the first time (see the header). Rejects
 * when the script cannot load, or after LOAD_TIMEOUT_MS.
 */
export function loadCaptchaScript(doc = document) {
  const loaded = doc.defaultView?.turnstile;
  if (loaded) return Promise.resolve(loaded);
  if (!loads.has(doc)) loads.set(doc, addScript(doc));
  return withTimeout(loads.get(doc), LOAD_TIMEOUT_MS, 'the captcha script did not load in time');
}

/** The widget's size for its place: 'compact' where 'flexible' would be wider than the place, else 'flexible'. */
function widgetSize(container) {
  const width = container?.clientWidth;
  return typeof width === 'number' && width < FLEXIBLE_MIN_WIDTH ? SIZE_COMPACT : SIZE_FLEXIBLE;
}

/** The Error of a token() call that the widget's error, or its script's, turned away. */
function reportedError() {
  return new Error('the captcha reported an error');
}

/** The Error of a token() call made while the widget waits for the reader: `needsReader` is true. */
function readerNeeded() {
  const error = new Error('the captcha waits for the reader to tick its box');
  error.needsReader = true;
  return error;
}

/**
 * Render one widget into `container` (an empty element in the page) and return its three methods
 * (see the header). It never throws: a script that cannot load, or a widget that fails, makes
 * token() reject.
 */
export function createCaptcha({ container, siteKey, theme }) {
  const widget = {
    turnstile: null,
    id: null,
    loading: null,
    token: null,
    tokenAt: 0,
    waiter: null,
    failed: false,
    waitsForReader: false,
    removed: false,
  };

  /** Settle the token() call that waits, if one does; true when there was one. */
  function settleWaiter(settle) {
    const { waiter } = widget;
    if (waiter === null) return false;
    widget.waiter = null;
    clearTimeout(waiter.timer);
    settle(waiter);
    return true;
  }

  /** A new token: to the token() call that waits for it, or kept for the next one. It ends an error and a wait for the reader. */
  function receive(token) {
    widget.failed = false;
    widget.waitsForReader = false;
    if (settleWaiter((waiter) => waiter.resolve(token))) return;
    widget.token = token;
    widget.tokenAt = Date.now();
  }

  /** True when the token at hand was kept longer than TOKEN_MAX_AGE_MS (or the clock was set back meanwhile). */
  function tokenIsStale() {
    const age = Date.now() - widget.tokenAt;
    return age < 0 || age > TOKEN_MAX_AGE_MS;
  }

  /** The token at hand is no longer good (expired, or its challenge timed out). */
  function drop() {
    widget.token = null;
  }

  /** The widget or its script failed: no token at hand, the error stands, and the waiting call rejects at once. */
  function fail() {
    widget.failed = true;
    widget.token = null;
    settleWaiter((waiter) => waiter.reject(reportedError()));
  }

  /**
   * Cloudflare's box shows: until the reader is done with it, token() rejects at once (needsReader).
   * A widget that has come to its box is alive, so an error it reported before is over.
   */
  function awaitReader() {
    widget.failed = false;
    widget.waitsForReader = true;
    settleWaiter((waiter) => waiter.reject(readerNeeded()));
  }

  /** The reader is done with the box: the token follows, and token() waits for it again. */
  function readerDone() {
    widget.waitsForReader = false;
  }

  /** Load the script (again, after a failure) and render the widget into the container. */
  function render() {
    widget.loading = Promise.resolve()
      .then(() => loadCaptchaScript(container.ownerDocument))
      .then((turnstile) => {
        if (widget.removed) return;
        const id = turnstile.render(container, {
          ...WIDGET_OPTIONS,
          size: widgetSize(container),
          sitekey: siteKey,
          theme,
          callback: receive,
          'expired-callback': drop,
          'timeout-callback': drop,
          'error-callback': fail,
          'unsupported-callback': fail,
          'before-interactive-callback': awaitReader,
          'after-interactive-callback': readerDone,
        });
        if (id === undefined || id === null) throw new Error('the captcha widget was not rendered');
        widget.turnstile = turnstile;
        widget.id = id;
      })
      .catch(() => {
        widget.loading = null;
        fail();
        renderWhenLateScriptArrives();
      });
  }

  /**
   * After a render that failed: when the script was only slow (its load still goes on after
   * LOAD_TIMEOUT_MS), render the widget once it arrives, unless the card closed, or a reset() has
   * started a render of its own meanwhile. Not when the script is there already: then it was the
   * widget that could not be rendered, and trying again at once would never end.
   */
  function renderWhenLateScriptArrives() {
    const doc = container?.ownerDocument;
    if (!doc || doc.defaultView?.turnstile) return;
    loads.get(doc)?.then(() => {
      if (widget.removed || widget.id !== null || widget.loading !== null) return;
      widget.failed = false;
      render();
    }, () => {});
  }

  /**
   * A fresh token, handed out once. Rejects at once while an error stands, while the widget waits
   * for the reader (needsReader), or once removed; else after TOKEN_TIMEOUT_MS without a token.
   * A token kept too long (tokenIsStale) is not handed out: the widget is asked afresh, and the
   * call waits for the next one like any other.
   */
  function token() {
    if (widget.removed) return Promise.reject(new Error('the captcha was removed'));
    if (widget.token !== null && tokenIsStale()) reset();
    if (widget.token !== null) {
      const fresh = widget.token;
      widget.token = null;
      return Promise.resolve(fresh);
    }
    if (widget.failed) return Promise.reject(reportedError());
    if (widget.waitsForReader) return Promise.reject(readerNeeded());
    settleWaiter((waiter) => waiter.reject(new Error('a later call took its place')));
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        if (widget.waiter === waiter) widget.waiter = null;
        reject(new Error('no captcha token in time'));
      }, TOKEN_TIMEOUT_MS);
      widget.waiter = waiter;
    });
  }

  /**
   * Ask for a new token (the last one was used, or may have been, or was kept too long: token()
   * calls this for a stale one): the widget starts afresh, with no error and no wait for the reader.
   */
  function reset() {
    widget.token = null;
    widget.failed = false;
    widget.waitsForReader = false;
    if (widget.removed) return;
    if (widget.id !== null) {
      try {
        widget.turnstile.reset(widget.id);
      } catch {
        // The next token() waits for a token, then rejects: the send reports the captcha.
      }
    } else if (widget.loading === null) {
      render();
    }
  }

  /** Take the widget out (the card closed, or the page was left); later calls do nothing. */
  function remove() {
    widget.removed = true;
    widget.token = null;
    settleWaiter((waiter) => waiter.reject(new Error('the captcha was removed')));
    if (widget.id === null) return;
    try {
      widget.turnstile.remove(widget.id);
    } catch {
      // Its container may already be out of the page with the card: nothing is left to remove.
    }
    widget.id = null;
  }

  render();
  return { token, reset, remove };
}
