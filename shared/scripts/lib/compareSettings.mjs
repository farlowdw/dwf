/**
 * scripts/lib/compareSettings.mjs: every number, list and path `shared:compare` uses, in one place.
 * What the browser reads, what counts as a change, how long a page may take, and where the three
 * things kept outside every repository live: the browser, puppeteer-core and the sweep lock.
 *
 * HOW TO CHANGE IT
 *   Edit the constant and its comment. COMPUTED_PROPERTIES is the list a change must show up in, so a
 *   property missing here is a change nobody sees. A page that still reads differently between two
 *   copies of one build is a stabiliser missing here (STABILITY_CSS, SKIP_SELECTORS, BUSY_SELECTORS), or,
 *   for pixels the page draws the same and the browser does not, a switch in CHROME_ARGS. The three *_ENV variables point a machine at other places. The defaults name no site and no user.
 *   A new Chrome may refuse other ports: CHROME_REFUSED_PORTS says where its list comes from.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Both themes, read through Docusaurus's own query string. */
export const THEMES = Object.freeze(['dark', 'light']);
export const THEME_QUERY = 'docusaurus-theme';

/**
 * The windows each page is read in: a desktop and a phone. Docusaurus changes its navbar and sidebar below
 * 996 px, so a change there shows on the phone alone. The first is the one a view's name leaves unsaid.
 */
export const VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1280, height: 900 }),
  Object.freeze({ name: 'phone', width: 375, height: 812 }),
]);

/** How much of the top of a page each screenshot holds. */
export const SCREENSHOT_HEIGHT = 2400;

/**
 * The 37 computed properties compared on every element. A change they miss still shows in the two
 * screenshots, which are compared too (comparePixels.mjs): these say where, the pixels say that.
 */
export const COMPUTED_PROPERTIES = Object.freeze([
  'color', 'backgroundColor', 'backgroundImage',
  'fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'lineHeight', 'textAlign',
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'display', 'position', 'visibility', 'flexDirection', 'transform',
  'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopColor', 'borderLeftColor', 'borderRadius',
  'textDecorationLine', 'textTransform',
  'width', 'height', 'maxWidth', 'boxShadow', 'opacity', 'overflowX', 'listStyleType',
]);

/**
 * Properties a browser works out from the layout. 379.984px to 380px is rounding, not a change, and
 * it was most of the small counts on a real upgrade. Everything else is compared exactly.
 */
export const SUB_PIXEL_PROPERTIES = new Set(['width', 'height']);
export const SUB_PIXEL_TOLERANCE_PX = 1;

/** No page is read past this many elements. A page cut short says so in its notes. */
export const MAX_ELEMENTS = 40_000;

/** A selector prints its tag and this many classes, within this many characters. */
export const SELECTOR_CLASSES = 3;
export const SELECTOR_CHARS = 80;

/**
 * Left out of the reading, with everything inside them. The first six draw nothing, and a library adds
 * them to the body at its own moment. The rest are parts of Monaco that come and go on their own
 * timers, and `.context-view` is an empty box it moves between editors from load to load.
 */
export const SKIP_SELECTORS = Object.freeze([
  'script', 'style', 'noscript', 'template', 'link', 'meta',
  '.monaco-editor .cursors-layer',
  '.monaco-editor .scrollbar',
  '.monaco-editor .iPadShowKeyboard',
  '.monaco-editor .decorationsOverviewRuler',
  '.monaco-editor .lightBulbWidget',
  '.context-view',
]);

/**
 * Read as computed values through Typed OM, not as getComputedStyle's used values. Chrome reports an
 * `auto` side margin as 0 or as its used value from one load to the next, with the same box.
 */
export const TYPED_PROPERTIES = Object.freeze({ marginLeft: 'margin-left', marginRight: 'margin-right' });

/**
 * Shown while something is still loading. A page is read after these are gone. A plain
 * [aria-busy="true"] is not here: a placeholder that waits to be scrolled to carries it, and this
 * check never scrolls, so it would never end.
 */
export const BUSY_SELECTORS = Object.freeze([
  '.MuiSkeleton-root',
  '.MuiCircularProgress-root',
  '.rpv-core__spinner',
  '.rpv-core__doc-loading',
]);

/** Busy while they exist, drawn or not. The PDF viewer hides a page's canvas until it has drawn it. */
export const HIDDEN_BUSY_SELECTORS = Object.freeze(['.rpv-core__canvas-layer canvas[hidden]']);

/** The note a load ends with when a page never stopped being busy. */
export const BUSY_NOTE = 'busy page not settled';

/**
 * A load that ended busy is loaded again this many times. The PDF viewer can leave a page as a spinner
 * for good on a busy machine. A page that is really stuck stays stuck, and keeps its note.
 */
export const BUSY_RETRIES = 3;

/**
 * A quiet page is not a page at rest: a PDF viewer draws for over a second with no change, then swaps
 * its spinner out. Quiet and "nothing busy" must hold together, and are tried this many times.
 */
export const MAX_REST_PASSES = 4;

/** A message is cut to this long. */
export const MAX_MESSAGE_CHARS = 200;

/** In a printed list: the longest value, the views named per group, and the groups. Views whose pixels differ: PRINTED_PIXEL_VIEWS. */
export const PRINTED_PIXEL_VIEWS = 12;
export const PRINTED_VALUE_CHARS = 80;
export const PRINTED_VIEWS = 4;
export const PRINTED_GROUPS = 40;

// Timeouts, in ms. A load that runs out is red. A wait that runs out leaves a note on the view.
export const LOAD_TIMEOUT_MS = 180_000;
export const NAVIGATION_TIMEOUT_MS = 60_000;
export const HYDRATION_TIMEOUT_MS = 20_000;
export const NETWORK_IDLE_TIMEOUT_MS = 10_000;
export const FONTS_TIMEOUT_MS = 15_000;
export const BUSY_TIMEOUT_MS = 20_000;
export const DOM_QUIET_TIMEOUT_MS = 8_000;
export const BROWSER_START_TIMEOUT_MS = 60_000;
export const BROWSER_STOP_TIMEOUT_MS = 10_000;
export const NETWORK_IDLE_MS = 300;
export const DOM_QUIET_MS = 300;
export const POLL_MS = 50;

/** docusaurus-plugin-image-zoom attaches in a 1 s timer set at hydration. Read after that. */
export const LATE_TIMER_MS = 1_100;

/** Date.now() reads this, moving by a tick each reading, so a page never depends on today. */
export const FROZEN_TIME_MS = Date.UTC(2026, 5, 15, 12, 0, 0);
export const DATE_TICK_MS = 1;

/** The seed of Math.random, so a page that picks at random picks the same on both sides. */
export const RANDOM_SEED = 0x5eed1234;

/**
 * Added to every page: animations and transitions end at once, so nothing is read in mid-flight, and a text
 * box's caret is never drawn. A focused box blinks its caret on the browser's own timer, so one shot holds it
 * and the next may not: a search page that focuses its box read a 1 by 23 px difference between two copies of
 * one build. No property the compare reads is caret-color, so this hides the caret and nothing else.
 */
export const STABILITY_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}
`;

/**
 * Never reached, on either side. They change on their own and add nothing to a comparison: giscus
 * once answered one load of a page with an error on the console and the next without it. A CDN that
 * serves a page's own code stays reachable.
 */
export const BLOCKED_HOSTS = Object.freeze([
  'giscus.app',
  'youtube.com',
  'www.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'i.ytimg.com',
  'googlevideo.com',
  'www.google-analytics.com',
  'www.googletagmanager.com',
]);

const HOST_RULES = BLOCKED_HOSTS.map((host) => `MAP ${host} ~NOTFOUND`).join(', ');

/**
 * How the browser starts. `--disable-partial-raster` has it redraw a whole tile of the page each time part of
 * that tile changes. Without it, it redraws only the changed part over the old pixels, and the shaded edge of a
 * box that sits between two pixel rows can come out a shade apart, by when each part was redrawn: a form's
 * rounded corner on a phone read 5 or 6 pixels apart in 7 of 66 loads of one build, and in 0 of 42 with it.
 * What the page draws is the same either way.
 */
export const CHROME_ARGS = Object.freeze([
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-gpu',
  '--disable-partial-raster',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  `--host-resolver-rules=${HOST_RULES}`,
]);

/** Where the servers listen. Pages never leave this machine. */
export const SERVE_HOST = '127.0.0.1';

/** With no --ports the system picks a free port. A range walks past these, the dev servers' ports. */
export const RESERVED_PORTS = Object.freeze([3000, 3010, 3221, 3222, 5000, 7000, 8888, 8890]);

/** A compare of two builds serves both at once, one port each, so a --ports range needs this many left. */
export const COMPARE_SIDES = 2;

/**
 * Ports Chrome never loads a page from: it stops at net::ERR_UNSAFE_PORT before it connects. A range walks past
 * these too, so `--ports 6000-6009` serves on 6001. With no --ports the system picks a port far above them all.
 * The list is kRestrictedPorts in Chromium's net/base/port_util.cc at Chrome 156, without its 0, which no range
 * holds. The Fetch standard's list also names 4190 and 6679, and Chrome 156 loads both, so they are not here.
 * To change it: copy the numbers from that file at the new Chrome's tag. A browser test in compare.test.mjs
 * loads each port here in the compare's own browser and reads the refusal.
 */
export const CHROME_REFUSED_PORTS = Object.freeze([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000,
  6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

/** The error Chrome gives a refused port, as the compare's messages name it. */
export const REFUSED_PORT_ERROR = 'net::ERR_UNSAFE_PORT';

/** How long a run waits for another to give up the sweep lock, unless --lock-wait says otherwise. */
export const LOCK_WAIT_SECONDS = 900;
export const LOCK_POLL_MS = 2_000;

/** A lock file with no process id counts as held while it is younger than this: its run is still writing it. */
export const EMPTY_LOCK_GRACE_MS = 10_000;

/** The folder below the cache that holds puppeteer-core, as an npm prefix. */
export const COMPARE_PACKAGES_FOLDER = 'compare';
export const SWEEP_LOCK_FILE = 'sweep.lock';

/** The usual places of a Chrome. The first that exists wins. */
export const CHROME_PATHS = Object.freeze([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]);

const CACHE_FROM_HOME = '.cache/docusaurus-shared';

/** Set this variable to keep the cache elsewhere: the packages, and the lock unless it is set too. */
export const CACHE_ENV = 'DOCUSAURUS_SHARED_CACHE';

/** Set this variable to share a lock with another tool. The format is in compareLock.mjs. */
export const SWEEP_LOCK_ENV = 'DOCUSAURUS_SHARED_SWEEP_LOCK';

/** Set this variable to use one given browser. */
export const CHROME_ENV = 'DOCUSAURUS_SHARED_CHROME';

/** The cache folder, outside every repository. */
export function cacheFolder(env = process.env) {
  return env[CACHE_ENV] || path.join(os.homedir(), CACHE_FROM_HOME);
}

/** The npm prefix that holds puppeteer-core. */
export function comparePackagesFolder(env = process.env) {
  return path.join(cacheFolder(env), COMPARE_PACKAGES_FOLDER);
}

/** The sweep lock's path. */
export function sweepLockPath(env = process.env) {
  return env[SWEEP_LOCK_ENV] || path.join(cacheFolder(env), SWEEP_LOCK_FILE);
}

/** The browser to use, or null when none is found. */
export function chromePath(env = process.env, exists = fs.existsSync) {
  if (env[CHROME_ENV]) return exists(env[CHROME_ENV]) ? env[CHROME_ENV] : null;
  return CHROME_PATHS.find((candidate) => exists(candidate)) ?? null;
}
