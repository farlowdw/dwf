/**
 * captcha.test.js: the page-feedback card's captcha (../captcha.js), driven with a fake document
 * and a fake `turnstile` object (no network, no browser): one script element per page, added on
 * the first call; a failed load tried again; the widget's options and its size; each token handed
 * out once, and never one kept too long; the time limits (node's mock timers); a slow script
 * whose widget is rendered when it arrives; an error that stands until reset(); the wait for
 * the reader (needsReader); reset and remove. Cloudflare's real script and widget are not tested
 * here (the file's header says what to look at in a browser). Run with
 * `node --test src/components/PageFeedback/__tests__/captcha.test.js`; package.json >
 * shared:verify names this file.
 *
 * HOW TO CHANGE IT  A new rule of the captcha gets a test here. The fakes below copy only what
 * captcha.js uses of a document, of the widget's place (its clientWidth) and of Cloudflare's
 * `turnstile` (render, reset, remove).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTCHA_SCRIPT_URL, FLEXIBLE_MIN_WIDTH, LOAD_TIMEOUT_MS, TOKEN_MAX_AGE_MS, TOKEN_TIMEOUT_MS, WIDGET_OPTIONS,
  createCaptcha, loadCaptchaScript,
} from '../captcha.js';

/** Let every promise that can settle, settle (a macrotask: setImmediate is never mocked here). */
function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** How `promise` stands once every promise that can settle has: 'resolved', 'rejected' or 'pending'. */
async function stateOf(promise) {
  const outcome = promise.then(() => 'resolved', () => 'rejected');
  return Promise.race([outcome, settle().then(() => 'pending')]);
}

/** True for the Error token() gives while the widget waits for the reader. */
function needsReader(error) {
  return error instanceof Error && error.needsReader === true;
}

/** A <script> element as captcha.js uses it: src, async, two events, remove(). */
function fakeScript() {
  const listeners = new Map();
  return {
    src: '',
    async: false,
    removed: false,
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    remove() {
      this.removed = true;
    },
    fire(type) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
}

/** Cloudflare's `turnstile` as captcha.js uses it: render, reset, remove, with each widget's record. */
function fakeTurnstile() {
  const widgets = [];
  return {
    widgets,
    render(container, params) {
      widgets.push({ container, params, resets: 0, removed: false });
      return `widget-${widgets.length}`;
    },
    reset(id) {
      widgets[Number(id.split('-')[1]) - 1].resets += 1;
    },
    remove(id) {
      widgets[Number(id.split('-')[1]) - 1].removed = true;
    },
  };
}

/**
 * A document with a window, a head that records the scripts added, and an element for the widget,
 * `width` pixels wide inside (its clientWidth; none when `width` is undefined).
 */
function fakePage({ width } = {}) {
  const win = {};
  const scripts = [];
  const doc = {
    defaultView: win,
    head: { append: (element) => scripts.push(element) },
    createElement: (tag) => {
      assert.equal(tag, 'script');
      return fakeScript();
    },
  };
  const container = width === undefined ? { ownerDocument: doc } : { ownerDocument: doc, clientWidth: width };
  /** The script loads: Cloudflare's script sets window.turnstile, then the element's load event fires. */
  const load = (turnstile = fakeTurnstile()) => {
    win.turnstile = turnstile;
    scripts.at(-1).fire('load');
    return turnstile;
  };
  return { win, doc, scripts, container, load };
}

/** A widget in a page whose script has loaded; `params` are the options it was rendered with. */
async function renderedCaptcha({ width, ...options } = {}) {
  const page = fakePage({ width });
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'dark', ...options });
  await settle();
  const turnstile = page.load();
  await settle();
  const [widget] = turnstile.widgets;
  return { ...page, captcha, turnstile, widget, params: widget.params };
}

test('the script: one element with Cloudflare\'s own address, added on the first call, shared by later ones', async () => {
  const page = fakePage();
  assert.equal(page.scripts.length, 0, 'nothing at first');
  const first = loadCaptchaScript(page.doc);
  const second = loadCaptchaScript(page.doc);
  assert.equal(page.scripts.length, 1, 'one element for both calls');
  const [script] = page.scripts;
  assert.equal(script.src, CAPTCHA_SCRIPT_URL);
  assert.equal(CAPTCHA_SCRIPT_URL, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  assert.equal(script.async, true);
  const turnstile = page.load();
  assert.equal(await first, turnstile);
  assert.equal(await second, turnstile);
  assert.equal(await loadCaptchaScript(page.doc), turnstile, 'once loaded: at once');
  assert.equal(page.scripts.length, 1);
});

test('a script that cannot load: the call rejects, its element goes, and the next call tries again', async () => {
  const page = fakePage();
  const failed = loadCaptchaScript(page.doc);
  page.scripts[0].fire('error');
  await assert.rejects(failed);
  assert.equal(page.scripts[0].removed, true);
  const again = loadCaptchaScript(page.doc);
  assert.equal(page.scripts.length, 2, 'a fresh element');
  const turnstile = page.load();
  assert.equal(await again, turnstile);
});

test('a script that runs without setting window.turnstile counts as not loaded', async () => {
  const page = fakePage();
  const call = loadCaptchaScript(page.doc);
  page.scripts[0].fire('load');
  await assert.rejects(call);
  assert.equal(page.scripts[0].removed, true);
});

test('a script slower than LOAD_TIMEOUT_MS: the caller gives up, the load goes on and serves the next call', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = fakePage();
  const slow = loadCaptchaScript(page.doc);
  t.mock.timers.tick(LOAD_TIMEOUT_MS);
  await assert.rejects(slow, /in time/);
  assert.equal(page.scripts[0].removed, false, 'the element stays: it may still arrive');
  const next = loadCaptchaScript(page.doc);
  assert.equal(page.scripts.length, 1, 'no second element');
  const turnstile = page.load();
  assert.equal(await next, turnstile);
});

test('the widget: rendered into the card\'s element with the site key, the colour mode and the fixed options', async () => {
  const { params, widget, container } = await renderedCaptcha();
  assert.equal(widget.container, container);
  assert.equal(params.sitekey, 'x');
  assert.equal(params.theme, 'dark');
  assert.equal(params.appearance, 'interaction-only', 'nothing shows unless Cloudflare needs the reader');
  for (const [name, value] of Object.entries(WIDGET_OPTIONS)) assert.equal(params[name], value, name);
  const callbacks = [
    'callback', 'expired-callback', 'timeout-callback', 'error-callback', 'unsupported-callback',
    'before-interactive-callback', 'after-interactive-callback',
  ];
  for (const name of callbacks) assert.equal(typeof params[name], 'function', name);
  assert.equal(params['error-callback']('x'), undefined, 'falsy: Turnstile logs the error code instead of throwing');
});

test('the widget\'s size: compact where a flexible one would stick out of its place, flexible elsewhere', async () => {
  assert.equal(FLEXIBLE_MIN_WIDTH, 300, 'Cloudflare draws a flexible widget at least 300 px wide');
  assert.equal('size' in WIDGET_OPTIONS, false, 'chosen when the widget is rendered, not fixed');
  const cases = [
    [254, 'compact', 'the card\'s inside on a phone 320 px wide'],
    [299, 'compact'],
    [FLEXIBLE_MIN_WIDTH, 'flexible'],
    [undefined, 'flexible', 'a place without a clientWidth'],
  ];
  for (const [width, size, note] of cases) {
    const { params } = await renderedCaptcha({ width });
    assert.equal(params.size, size, note ?? String(width));
  }
});

test('createCaptcha adds the script itself, and renders once it has loaded', async () => {
  const page = fakePage();
  createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  assert.equal(page.scripts.length, 1);
  const turnstile = page.load();
  await settle();
  assert.equal(turnstile.widgets.length, 1);
});

test('token(): a token that came before the call is handed out at once, and only once', async (t) => {
  const { captcha, params } = await renderedCaptcha();
  params.callback('token-1');
  assert.equal(await captcha.token(), 'token-1');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const second = captcha.token();
  t.mock.timers.tick(TOKEN_TIMEOUT_MS);
  await assert.rejects(second, /in time/, 'a used token is never handed out again');
});

test('token(): waits for the widget\'s callback', async () => {
  const { captcha, params } = await renderedCaptcha();
  const waiting = captcha.token();
  params.callback('token-2');
  assert.equal(await waiting, 'token-2');
});

test('token(): rejects after TOKEN_TIMEOUT_MS, and a token that comes later is kept for the next call', async (t) => {
  const { captcha, params } = await renderedCaptcha();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const waiting = captcha.token();
  t.mock.timers.tick(TOKEN_TIMEOUT_MS - 1);
  params.callback('token-3');
  assert.equal(await waiting, 'token-3', 'in time');
  const late = captcha.token();
  t.mock.timers.tick(TOKEN_TIMEOUT_MS);
  await assert.rejects(late, /in time/);
  params.callback('token-4');
  assert.equal(await captcha.token(), 'token-4', 'kept, not handed to the call that gave up');
});

test('token(): rejects at once when the widget reports an error', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = fakePage();
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  const turnstile = page.load();
  await settle();
  const waiting = captcha.token();
  turnstile.widgets[0].params['error-callback']('x');
  assert.equal(await stateOf(waiting), 'rejected', 'at once, not after TOKEN_TIMEOUT_MS');
  await assert.rejects(waiting, /error/);
});

test('an expired token, or a challenge that timed out, is never handed out', async (t) => {
  const { captcha, params } = await renderedCaptcha();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const name of ['expired-callback', 'timeout-callback']) {
    params.callback('old');
    params[name]();
    const call = captcha.token();
    t.mock.timers.tick(TOKEN_TIMEOUT_MS);
    await assert.rejects(call, /in time/, name);
  }
});

test('a token kept longer than TOKEN_MAX_AGE_MS is not handed out: token() asks the widget afresh and waits for the next one', async (t) => {
  assert.ok(TOKEN_MAX_AGE_MS < 300000, 'Cloudflare takes a token for 300 seconds');
  const { captcha, params, widget } = await renderedCaptcha();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  params.callback('young');
  t.mock.timers.tick(TOKEN_MAX_AGE_MS);
  assert.equal(await captcha.token(), 'young', 'at the limit it still goes out');
  assert.equal(widget.resets, 0);
  params.callback('old');
  t.mock.timers.tick(TOKEN_MAX_AGE_MS + 1);
  const call = captcha.token();
  assert.equal(widget.resets, 1, 'the widget is asked for a fresh one (no notice of an expiry came: the timers stood still)');
  assert.equal(await stateOf(call), 'pending', 'the call waits for it');
  params.callback('fresh');
  assert.equal(await call, 'fresh', 'never the old one');
});

test('a token whose time lies in the future (the clock was set back) is not handed out either', async (t) => {
  const { captcha, params, widget } = await renderedCaptcha();
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000000 });
  params.callback('before');
  t.mock.timers.setTime(1000);
  const call = captcha.token();
  assert.equal(widget.resets, 1);
  params.callback('after');
  assert.equal(await call, 'after');
});

test('reset() asks the widget for a new token and drops the one at hand', async (t) => {
  const { captcha, params, widget } = await renderedCaptcha();
  params.callback('used');
  captcha.reset();
  assert.equal(widget.resets, 1);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const call = captcha.token();
  t.mock.timers.tick(TOKEN_TIMEOUT_MS);
  await assert.rejects(call, /in time/, 'the dropped token is not handed out');
});

test('a script that could not load: a waiting token() rejects at once, and reset() loads it again', async () => {
  const page = fakePage();
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  const waiting = captcha.token();
  page.scripts[0].fire('error');
  await assert.rejects(waiting);
  captcha.reset();
  await settle();
  assert.equal(page.scripts.length, 2, 'reset() tried once more');
  const turnstile = page.load();
  await settle();
  const call = captcha.token();
  turnstile.widgets[0].params.callback('token-5');
  assert.equal(await call, 'token-5');
});

test('a script slower than LOAD_TIMEOUT_MS: the open card\'s widget is rendered when it arrives, with no reset()', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = fakePage();
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  t.mock.timers.tick(LOAD_TIMEOUT_MS);
  await settle();
  const early = captcha.token();
  assert.equal(await stateOf(early), 'rejected', 'while the script is still on its way, the error stands');
  await assert.rejects(early, /error/);
  const turnstile = page.load();
  await settle();
  assert.equal(page.scripts.length, 1, 'the same element: nothing loaded it again');
  assert.equal(turnstile.widgets.length, 1, 'rendered by itself once the script was there');
  const call = captcha.token();
  assert.equal(await stateOf(call), 'pending', 'the error is over: it waits for the token');
  turnstile.widgets[0].params.callback('token-16');
  assert.equal(await call, 'token-16');
});

test('a slow script that arrives after a reset() started a render of its own gives one widget, not two', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = fakePage();
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  t.mock.timers.tick(LOAD_TIMEOUT_MS);
  await settle();
  captcha.reset();
  await settle();
  const turnstile = page.load();
  await settle();
  assert.equal(turnstile.widgets.length, 1);
  captcha.remove();
});

test('a slow script that arrives after the card closed renders nothing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const page = fakePage();
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  t.mock.timers.tick(LOAD_TIMEOUT_MS);
  await settle();
  captcha.remove();
  const turnstile = page.load();
  await settle();
  assert.equal(turnstile.widgets.length, 0);
});

test('a widget that cannot be rendered stands as an error, and is not tried again by itself', async () => {
  const page = fakePage();
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  let renders = 0;
  // No widget for the first tries, then one: a loop of tries would end here and fail the count, not hang.
  const render = () => {
    renders += 1;
    return renders > 3 ? 'widget-late' : undefined;
  };
  page.load({ render, reset: () => {}, remove: () => {} });
  await settle();
  await settle();
  assert.equal(renders, 1, 'one try: the script is there, so the widget is at fault');
  const call = captcha.token();
  assert.equal(await stateOf(call), 'rejected', 'at once');
  await assert.rejects(call, /error/);
});

test('a script that failed before the call: token() rejects at once while that stands, and only reset() loads it again', async () => {
  const page = fakePage();
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  page.scripts[0].fire('error');
  await settle();
  const call = captcha.token();
  assert.equal(await stateOf(call), 'rejected', 'at once, not after TOKEN_TIMEOUT_MS');
  await assert.rejects(call, (error) => !needsReader(error), 'a failure, not a wait for the reader');
  assert.equal(page.scripts.length, 1, 'token() does not load the script again');
  captcha.reset();
  await settle();
  assert.equal(page.scripts.length, 2, 'reset() does');
  const turnstile = page.load();
  await settle();
  const next = captcha.token();
  assert.equal(await stateOf(next), 'pending', 'the failure is cleared: it waits for the token');
  turnstile.widgets[0].params.callback('token-6');
  assert.equal(await next, 'token-6');
});

test('an error the widget reported before the call stands: token() rejects at once until reset() asks again', async () => {
  const { captcha, params, widget } = await renderedCaptcha();
  params['error-callback']('x');
  const first = captcha.token();
  assert.equal(await stateOf(first), 'rejected', 'at once, not after TOKEN_TIMEOUT_MS');
  await assert.rejects(first, /error/);
  await assert.rejects(captcha.token(), /error/, 'and at the next call too: the error stands');
  captcha.reset();
  assert.equal(widget.resets, 1, 'reset() asks the widget again');
  const call = captcha.token();
  assert.equal(await stateOf(call), 'pending', 'the error is cleared: it waits for the token');
  params.callback('token-7');
  assert.equal(await call, 'token-7');
});

test('an unsupported browser stands as an error too', async () => {
  const { captcha, params } = await renderedCaptcha();
  params['unsupported-callback']();
  const call = captcha.token();
  assert.equal(await stateOf(call), 'rejected', 'at once');
  await assert.rejects(call, /error/);
});

test('a token the widget hands over by itself after an error ends the error (Turnstile retries a failed check)', async () => {
  const { captcha, params } = await renderedCaptcha();
  params['error-callback']('x');
  params.callback('token-8');
  assert.equal(await captcha.token(), 'token-8');
  const next = captcha.token();
  assert.equal(await stateOf(next), 'pending', 'no error left: the next call waits for the next token');
  params.callback('token-9');
  assert.equal(await next, 'token-9');
});

test('while the widget waits for the reader, token() rejects at once with needsReader, until the reader is done', async () => {
  const { captcha, params } = await renderedCaptcha();
  params['before-interactive-callback']();
  const call = captcha.token();
  assert.equal(await stateOf(call), 'rejected', 'at once: the reader must tick the box first');
  await assert.rejects(call, needsReader);
  await assert.rejects(captcha.token(), needsReader, 'at every call while the box shows');
  params['after-interactive-callback']();
  const next = captcha.token();
  assert.equal(await stateOf(next), 'pending', 'the reader is done: it waits for the token that follows');
  params.callback('token-10');
  assert.equal(await next, 'token-10');
});

test('a call that already waits when the box appears is rejected with needsReader', async () => {
  const { captcha, params } = await renderedCaptcha();
  const waiting = captcha.token();
  assert.equal(await stateOf(waiting), 'pending');
  params['before-interactive-callback']();
  await assert.rejects(waiting, needsReader);
});

test('a token ends the wait for the reader, and a token at hand is handed out even while the box shows', async () => {
  const { captcha, params } = await renderedCaptcha();
  params['before-interactive-callback']();
  params.callback('token-11');
  assert.equal(await captcha.token(), 'token-11', 'the token came before the reader was done');
  const next = captcha.token();
  assert.equal(await stateOf(next), 'pending', 'the wait for the reader ended with that token');
  params.callback('token-12');
  assert.equal(await next, 'token-12');
  params.callback('token-13');
  params['before-interactive-callback']();
  assert.equal(await captcha.token(), 'token-13', 'a token at hand goes out, box or not');
});

test('an error turns a call away as an error, not as a wait for the reader', async () => {
  const { captcha, params } = await renderedCaptcha();
  params['before-interactive-callback']();
  params['error-callback']('x');
  await assert.rejects(captcha.token(), (error) => /error/.test(error.message) && !needsReader(error));
});

test('a box that shows after an error ends the error: token() asks for the reader (Turnstile retried, and now needs a tick)', async () => {
  const { captcha, params, widget } = await renderedCaptcha();
  params['error-callback']('x');
  await assert.rejects(captcha.token(), (error) => /error/.test(error.message) && !needsReader(error), 'the error stands at first');
  params['before-interactive-callback']();
  await assert.rejects(captcha.token(), needsReader, 'the box shows: the reader is asked, the error is over');
  assert.equal(widget.resets, 0, 'nothing here resets the widget: the box stays for the reader');
  params['after-interactive-callback']();
  const next = captcha.token();
  assert.equal(await stateOf(next), 'pending', 'ticked: it waits for the token, with no error left');
  params.callback('token-15');
  assert.equal(await next, 'token-15');
});

test('reset() starts the widget afresh: no wait for the reader is left', async () => {
  const { captcha, params, widget } = await renderedCaptcha();
  params['before-interactive-callback']();
  captcha.reset();
  assert.equal(widget.resets, 1);
  const call = captcha.token();
  assert.equal(await stateOf(call), 'pending');
  params.callback('token-14');
  assert.equal(await call, 'token-14');
});

test('remove() takes the widget out, ends a waiting call, and makes later calls do nothing', async () => {
  const { captcha, turnstile, widget } = await renderedCaptcha();
  const waiting = captcha.token();
  captcha.remove();
  assert.equal(widget.removed, true);
  await assert.rejects(waiting, /removed/);
  await assert.rejects(captcha.token(), /removed/);
  captcha.reset();
  assert.equal(widget.resets, 0);
  captcha.remove();
  assert.equal(turnstile.widgets.length, 1);
});

test('remove() before the script has loaded: no widget is rendered afterwards', async () => {
  const page = fakePage();
  const captcha = createCaptcha({ container: page.container, siteKey: 'x', theme: 'light' });
  await settle();
  captcha.remove();
  const turnstile = page.load();
  await settle();
  assert.equal(turnstile.widgets.length, 0);
});

test('createCaptcha never throws, even without a container: token() rejects instead', async () => {
  const captcha = createCaptcha({ container: null, siteKey: 'x', theme: 'light' });
  const call = captcha.token();
  await assert.rejects(call);
});
