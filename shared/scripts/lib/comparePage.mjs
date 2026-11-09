/**
 * scripts/lib/comparePage.mjs: one load of one page in one theme and one window. It opens the page in a fresh browser
 * context, so no storage or cache is left by the page before, waits until the page is at rest, reads
 * every element's computed styles and takes the screenshot.
 *
 * A load that could not be read has `failure` set, and that view is red: a dead server, an answer of
 * 400 or more, a page that stayed in the other theme, a crash, a timeout. A wait that merely ran out
 * adds a note instead, because the page can still be read. A load that ended busy is tried again.
 *
 * Content a page only loads when it is scrolled to stays out on both sides: a sweep goes there.
 *
 * Functions handed to the browser (pageInit, collectElements and the small ones around them) run in
 * the page, as text, so they use only their arguments and browser globals.
 *
 * HOW TO CHANGE IT
 *   Timeouts and selectors: compareSettings.mjs. What a row holds: collectElements and compareDiff.mjs.
 *   Keep the order: read the styles before the screenshot, because a capture can resize the page.
 */

import {
  BROWSER_STOP_TIMEOUT_MS, BUSY_NOTE, BUSY_RETRIES, BUSY_SELECTORS, BUSY_TIMEOUT_MS, COMPUTED_PROPERTIES, DATE_TICK_MS,
  DOM_QUIET_MS, DOM_QUIET_TIMEOUT_MS, FONTS_TIMEOUT_MS, FROZEN_TIME_MS, HIDDEN_BUSY_SELECTORS, HYDRATION_TIMEOUT_MS,
  LATE_TIMER_MS, LOAD_TIMEOUT_MS, MAX_ELEMENTS, MAX_MESSAGE_CHARS, MAX_REST_PASSES, NAVIGATION_TIMEOUT_MS,
  NETWORK_IDLE_MS, NETWORK_IDLE_TIMEOUT_MS, POLL_MS, RANDOM_SEED, SCREENSHOT_HEIGHT, SKIP_SELECTORS, STABILITY_CSS,
  THEME_QUERY, TYPED_PROPERTIES, VIEWPORTS,
} from './compareSettings.mjs';

const CONSOLE_TYPES = new Set(['error', 'warn', 'warning']);

const CHANGING_NOTE = 'still changing';

/** A built file's hash, so one message reads the same from two builds. */
const FILE_HASH = /\.[0-9a-f]{8}(?=\.(?:js|css)\b)/g;

/** Runs in the page before its scripts: a fixed clock, a seeded Math.random, the stability sheet. */
function pageInit({ frozenTimeMs, tickMs, randomSeed, css }) {
  let clock = frozenTimeMs;
  const readClock = () => {
    const now = clock;
    clock += tickMs;
    return now;
  };
  const RealDate = window.Date;
  window.Date = new Proxy(RealDate, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [readClock()], newTarget),
    apply: () => new RealDate(readClock()).toString(),
    get: (target, name, receiver) => (name === 'now' ? readClock : Reflect.get(target, name, receiver)),
  });

  // mulberry32: small, seeded, and never stuck on one value.
  let state = randomSeed;
  window.Math.random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };

  const addSheet = () => {
    const sheet = document.createElement('style');
    sheet.textContent = css;
    (document.head ?? document.documentElement).appendChild(sheet);
  };
  if (document.documentElement) {
    addSheet();
    return;
  }
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    addSheet();
  });
  observer.observe(document, { childList: true });
}

function isHydrated() {
  return document.documentElement.getAttribute('data-has-hydrated') !== 'false';
}

/** Images load when they come near the window, and this check never scrolls. */
function loadLazyImages() {
  for (const image of document.querySelectorAll('img[loading="lazy"]')) image.loading = 'eager';
}

/** Runs on the page's own timer queue, so it fires after any timer the page set before it. */
function pageTimer(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function fontsSettled() {
  return document.fonts.status === 'loaded';
}

function imagesComplete() {
  return [...document.images].every((image) => image.complete);
}

/** False while anything that means "still loading" is on show, or Monaco has no lines yet. */
function nothingBusy(busySelectors, hiddenBusySelectors) {
  const isShown = (element) => element.getClientRects().length > 0;
  const shown = busySelectors.some((selector) => [...document.querySelectorAll(selector)].some(isShown));
  const hidden = hiddenBusySelectors.some((selector) => document.querySelector(selector) !== null);
  const emptyEditor = [...document.querySelectorAll('.monaco-editor')].some((editor) => !editor.querySelector('.view-line'));
  return !shown && !hidden && !emptyEditor;
}

/** Resolves true once no mutation has happened for quietMs, false at timeoutMs. */
function domQuiet(quietMs, timeoutMs, pollMs) {
  return new Promise((resolve) => {
    const started = performance.now();
    let lastChange = started;
    const observer = new MutationObserver(() => { lastChange = performance.now(); });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const check = () => {
      const now = performance.now();
      const quiet = now - lastChange >= quietMs;
      if (!quiet && now - started < timeoutMs) {
        setTimeout(check, pollMs);
        return;
      }
      observer.disconnect();
      resolve(quiet);
    };
    check();
  });
}

/** Every element of the page in order: its tag, its class text and its computed values. */
function collectElements({ properties, typedProperties, maxElements, skipSelector }) {
  const all = [...document.querySelectorAll('html, body, body *')];
  const kept = all.filter((element) => !element.closest(skipSelector));
  const rows = kept.slice(0, maxElements).map((element) => {
    const style = getComputedStyle(element);
    const typed = element.computedStyleMap();
    const valueOf = (property) => {
      const name = typedProperties[property];
      return name ? String(typed.get(name)) : style[property];
    };
    return {
      tag: element.tagName.toLowerCase(),
      classes: element.getAttribute('class') ?? '',
      values: properties.map(valueOf),
    };
  });
  return { total: kept.length, rows, theme: document.documentElement.getAttribute('data-theme') };
}

/** Takes the origin out, which differs on the two sides, and a built file's hash. */
function cleanMessage(text, origin) {
  return text.replaceAll(origin, '').replace(FILE_HASH, '').slice(0, MAX_MESSAGE_CHARS);
}

/** Collects what the page says on its console, each message once. */
function listen(page, load, origin) {
  const add = (text) => {
    const clean = cleanMessage(text, origin);
    if (!load.console.includes(clean)) load.console.push(clean);
  };
  page.on('console', (message) => {
    if (CONSOLE_TYPES.has(message.type())) add(message.text());
  });
  page.on('pageerror', (error) => add(`page error: ${error?.message ?? error}`));
}

/** One step of the wait that may run out: it leaves a note and the load goes on. */
async function waitOrNote(notes, label, wait) {
  try {
    await wait();
  } catch {
    notes.push(`${label} not settled`);
  }
}

/** Waits until the page is quiet and nothing is busy, both at once. */
async function waitUntilAtRest(page, waitFor, notes) {
  for (let pass = 0; pass < MAX_REST_PASSES; pass += 1) {
    const quiet = await page.evaluate(domQuiet, DOM_QUIET_MS, DOM_QUIET_TIMEOUT_MS, POLL_MS);
    if (!quiet && !notes.includes(CHANGING_NOTE)) notes.push(CHANGING_NOTE);
    if (await page.evaluate(nothingBusy, BUSY_SELECTORS, HIDDEN_BUSY_SELECTORS)) return;
    try {
      await waitFor(nothingBusy, BUSY_TIMEOUT_MS, BUSY_SELECTORS, HIDDEN_BUSY_SELECTORS);
    } catch {
      notes.push(BUSY_NOTE);
      return;
    }
  }
  notes.push(BUSY_NOTE);
}

/** Waits until the page is at rest, in this order: each step can start the next one's work. */
async function settle(page, notes) {
  const polling = POLL_MS;
  const waitFor = (fn, timeout, ...args) => page.waitForFunction(fn, { polling, timeout }, ...args);
  await waitOrNote(notes, 'hydration', () => waitFor(isHydrated, HYDRATION_TIMEOUT_MS));
  await page.evaluate(loadLazyImages);
  await page.evaluate(pageTimer, LATE_TIMER_MS);
  await waitOrNote(notes, 'network', () => page.waitForNetworkIdle({ idleTime: NETWORK_IDLE_MS, timeout: NETWORK_IDLE_TIMEOUT_MS }));
  await waitOrNote(notes, 'fonts', () => waitFor(fontsSettled, FONTS_TIMEOUT_MS));
  await waitOrNote(notes, 'images', () => waitFor(imagesComplete, FONTS_TIMEOUT_MS));
  await waitUntilAtRest(page, waitFor, notes);
}

/** Opens the page. Throws what a reader needs when it did not load. */
async function open(page, url) {
  const response = await page.goto(url, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
  const status = response?.status() ?? null;
  if (status === null || status >= 400) throw new Error(`the server answered ${status ?? 'nothing'}`);
}

/** Reads the page into `load`. A page in the wrong theme proves nothing, so it fails the load. */
async function read(page, load, theme) {
  const elements = await page.evaluate(collectElements, {
    properties: [...COMPUTED_PROPERTIES],
    typedProperties: { ...TYPED_PROPERTIES },
    maxElements: MAX_ELEMENTS,
    skipSelector: SKIP_SELECTORS.join(','),
  });
  if (elements.theme !== theme) throw new Error(`the page stayed in ${elements.theme ?? 'no theme'}, not ${theme}`);
  if (elements.total > MAX_ELEMENTS) load.notes.push(`read ${MAX_ELEMENTS} of ${elements.total} elements`);
  load.total = elements.total;
  load.rows = elements.rows;
}

async function screenshot(page, load, shotPath, viewport) {
  const clip = { x: 0, y: 0, width: viewport.width, height: SCREENSHOT_HEIGHT };
  try {
    await page.screenshot({ path: shotPath, clip, captureBeyondViewport: true });
  } catch (error) {
    load.notes.push(`no screenshot: ${error.message}`.slice(0, MAX_MESSAGE_CHARS));
  }
}

/** The address of one page in one theme. */
export function themedUrl(origin, pagePath, theme) {
  const separator = pagePath.includes('?') ? '&' : '?';
  return `${origin}${pagePath}${separator}${THEME_QUERY}=${theme}`;
}

/** The steps of one load, on an open page. */
async function loadSteps(page, load, { origin, pagePath, theme, shotPath, viewport = VIEWPORTS[0] }) {
  listen(page, load, origin);
  await page.setViewport({ width: viewport.width, height: viewport.height });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
  await page.evaluateOnNewDocument(pageInit, {
    frozenTimeMs: FROZEN_TIME_MS, tickMs: DATE_TICK_MS, randomSeed: RANDOM_SEED, css: STABILITY_CSS,
  });
  await open(page, themedUrl(origin, pagePath, theme));
  await settle(page, load.notes);
  await read(page, load, theme);
  await screenshot(page, load, shotPath, viewport);
}

/** Closes a context, and goes on if closing hangs: stopping the browser clears it later. */
async function closeContext(context) {
  let timer;
  const timedOut = new Promise((resolve) => { timer = setTimeout(resolve, BROWSER_STOP_TIMEOUT_MS); });
  await Promise.race([context.close().catch(() => {}), timedOut]);
  clearTimeout(timer);
}

/** Rejects when the page crashes or the load runs out of time. Call `clear` when done. */
function abortWatch(page) {
  let timer;
  const aborted = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no result after ${LOAD_TIMEOUT_MS} ms`)), LOAD_TIMEOUT_MS);
    page.once('error', (error) => reject(new Error(`the page crashed: ${error.message}`)));
  });
  return { aborted, clear: () => clearTimeout(timer) };
}

/**
 * One load. `failure` is null when the page was read.
 * @returns {Promise<{failure: string|null, total: number, rows: object[], console: string[], notes: string[]}>}
 */
export async function loadView({ browser, origin, pagePath, theme, shotPath, viewport }) {
  const load = { failure: null, total: 0, rows: [], console: [], notes: [] };
  let context = null;
  try {
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    const { aborted, clear } = abortWatch(page);
    await Promise.race([loadSteps(page, load, { origin, pagePath, theme, shotPath, viewport }), aborted]).finally(clear);
  } catch (error) {
    load.failure = cleanMessage(String(error.message ?? error), origin);
  }
  if (context !== null) await closeContext(context);
  return load;
}

/** One load, again when it ended busy. Hand in `loadOnce` to test it. */
export async function loadAtRest(view, loadOnce = loadView) {
  let load = await loadOnce(view);
  for (let retry = 0; retry < BUSY_RETRIES && load.notes.includes(BUSY_NOTE); retry += 1) {
    load = await loadOnce(view);
  }
  return load;
}
