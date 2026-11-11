/**
 * goToEditor.js — what a click on a <CodeRef> (index.jsx) does, in the browser: it brings the
 * named editor into view, waits for the page to stop scrolling, then asks the editor (through
 * the page registry, shared/components/CodeEditor/lib/registry) to show the lines or to go to the step. And
 * the editor's follow-up, once it has revealed lines in its own window: keepLinesInWindow
 * brings them into the PAGE's window too.
 *
 *     const cancel = goToEditor({ id: 'two-sum', action: { type: 'lines', ranges: [[10, 12]] } });
 *     cancel();   // the <CodeRef> unmounts: stop waiting, withdraw a request that still waits
 *     await keepLinesInWindow(surface, [10, 12], { waitForGrowth: true });   // useGuided.js
 *
 * `window` and `document` are arguments (defaulting to the real ones), so the tests pass fakes.
 * keepLinesInWindow measures through the editor's SURFACE (surface.js: `linesBox`,
 * `layoutSettled`), so it serves Monaco and the static view of a phone alike; the Monaco
 * geometry stays here (monacoLinesBox, monacoLayoutSettled: monacoSurface.js delegates to them).
 *
 * THE SCROLL  (scrollTopFor; nothing scrolls when the editor is already wholly in view)
 *   - The target is the element with the editor's DOM id (editorDomId: 'code-editor-two-sum'),
 *     which <CodeEditor id> puts around its placeholder and its editor, so it is there before
 *     Monaco loads. No such element: a console warning, and the click does nothing (a typo in
 *     `to`, or an editor without that id). An element with no box (inside a closed
 *     <DropDownIC>) cannot be scrolled to: the request is sent at once instead (the editor
 *     acts, unseen until the dropdown opens).
 *   - An editor that fits in the window is centred in the space under the navbar; a taller one
 *     is placed with its top just under the navbar (TOP_GAP_PX below it). The navbar's height
 *     is always kept free — the site's navbar hides on a scroll down and comes back on a scroll
 *     up, so it may be back by the time the scroll ends — but "already wholly in view" counts
 *     only the part of the window the navbar covers NOW.
 *   - Smooth, unless the reader asked for reduced motion (prefers-reduced-motion: reduce): then
 *     it jumps ('auto': instant, unless a site sets CSS scroll-behavior).
 *
 * THE WAIT  The request goes out once the scroll has settled (waitForScrollToSettle): at the
 *   browser's `scrollend`, or when no `scroll` event has come for SCROLL_IDLE_MS (a browser
 *   without `scrollend`), and never later than SCROLL_SETTLE_MAX_MS. So the editor's flash
 *   (shared/components/CodeEditor/decorations.js) plays while the reader can see it, not halfway
 *   through the scroll. Meanwhile a loadWhenVisible editor has already started to mount: the
 *   scroll brought it near the viewport (and if it has not, the request asks it to mount).
 *
 * THE FOLLOW-UP  (keepLinesInWindow; shared/components/CodeEditor/useGuided.js calls it after each
 *   reveal: a <CodeRef>'s, and the step bar's Previous / Next.) The scroll above is measured
 *   BEFORE the editor opens a fold, and the editor's reveal scrolls only its own window. An
 *   editor with height="fit" grows downward in the next frame when a fold opens, so revealed
 *   lines can end up below the page's window (and Previous / Next never scroll the page at
 *   all). So, after the reveal: wait until the box has had time to grow (the editor's first
 *   layout change, LAYOUT_SETTLE_MS at most; not at all for a box of fixed height), measure the
 *   lines on the page (cut to the editor's box), and scroll the page the LEAST that shows them
 *   (scrollTopToShow: the bottom just above the window's edge, or the top just under the
 *   navbar; the top when they cannot all fit). Nothing moves when they are in view. Smooth
 *   unless the reader asked for reduced motion; it resolves once the scroll has settled, so the
 *   editor flashes the lines where the reader can see them.
 *
 * HOW TO CHANGE IT
 *   Where the editor lands: scrollTopFor (TOP_GAP_PX; the navbar is NAVBAR_SELECTOR). How long
 *   the wait may be: SCROLL_IDLE_MS, SCROLL_SETTLE_MAX_MS. Where revealed lines land:
 *   scrollTopToShow; how long it waits for a fit editor to grow: LAYOUT_SETTLE_MS. How the
 *   lines are measured: the surface's linesBox (Monaco: monacoLinesBox here). The warning:
 *   WARNINGS. Tests: __tests__/goToEditor.test.js (`npm run test:shared`).
 */

import { editorDomId, requestEditor } from '../lib/registry/index.js';

/** The site's navbar (Docusaurus's), whose height is kept free above the editor. */
export const NAVBAR_SELECTOR = '.navbar';

/** The space between the navbar (or the window's edge) and the editor (px; Docusaurus leaves 0.5rem above an anchor). */
export const TOP_GAP_PX = 8;

/** A scroll shorter than this (px) is not worth making. */
const MIN_SCROLL_PX = 1;

/** No `scroll` event for this long (ms) means the scroll has ended (for a browser without `scrollend`). */
export const SCROLL_IDLE_MS = 150;

/** The request goes out after this long (ms) at most, however the scroll goes. */
export const SCROLL_SETTLE_MAX_MS = 1500;

/**
 * How long keepLinesInWindow waits at most for a fit editor's box to grow (ms): its new height
 * is applied in the next frame and Monaco lays out after it; this also covers Monaco's own
 * 125 ms smooth scroll, and a hidden tab, which gets almost no frames.
 */
export const LAYOUT_SETTLE_MS = 150;

/** The reader's "reduce motion" setting. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** What a cancel returns when there is nothing to undo. */
const NOTHING_TO_UNDO = () => {};

/** Prefix of every warning, so the console says where it comes from. */
const WARNING_PREFIX = 'CodeRef:';

/** Every console warning of this file (for the author of a note). */
const WARNINGS = Object.freeze({
	noEditor: (id) =>
		`${WARNING_PREFIX} there is no editor called "${id}" on this page (no element #${editorDomId(id)}): give the <CodeEditor> the prop id="${id}", or fix the reference's \`to\`.`,
});

/** console.warn, looked up at each call (so a test may replace it). */
function consoleWarn(...parts) {
	console.warn(...parts);
}

/** `value` kept between `low` and `high`. */
function clamp(value, low, high) {
	return Math.min(Math.max(value, low), high);
}

/** Is the box [top, top + height] wholly inside the window, below what the navbar covers now? */
function whollyInView({ top, height }, { viewportHeight, coveredTop }) {
	return top >= coveredTop && top + height <= viewportHeight;
}

/** Where the editor's top should land, from the window's top (px): centred under the navbar when it fits, else just under it. */
function landingTop(height, { viewportHeight, navbarHeight }) {
	const firstFree = navbarHeight + TOP_GAP_PX;
	const room = viewportHeight - firstFree - TOP_GAP_PX;
	if (height > room) return firstFree;
	return firstFree + (room - height) / 2;
}

/**
 * The page's new scroll position (px) that brings the editor into view, or null when no scroll
 * is needed (it is wholly in view, or the page cannot scroll that far anyway).
 *   top, height       the editor's box, from getBoundingClientRect (top relative to the window)
 *   scrollY           the page's scroll position now
 *   viewportHeight    the window's height (innerHeight)
 *   documentHeight    the page's full height (scrollHeight), which limits the scroll
 *   navbarBottom      how far down the navbar covers the window NOW (0 while it is hidden)
 *   navbarHeight      the navbar's height (kept free: it may come back during the scroll)
 */
export function scrollTopFor({ top, height, scrollY, viewportHeight, documentHeight, navbarBottom = 0, navbarHeight = 0 }) {
	if (whollyInView({ top, height }, { viewportHeight, coveredTop: navbarBottom })) return null;
	const wanted = scrollY + top - landingTop(height, { viewportHeight, navbarHeight });
	const furthest = Math.max(0, documentHeight - viewportHeight);
	const target = clamp(Math.round(wanted), 0, furthest);
	if (Math.abs(target - scrollY) < MIN_SCROLL_PX) return null;
	return target;
}

/** The navbar's box: { bottom } (what it covers now, 0 while hidden) and { height }; zeros when there is none. */
function navbarBox(doc) {
	const navbar = doc.querySelector(NAVBAR_SELECTOR);
	if (!navbar) return { bottom: 0, height: 0 };
	const rect = navbar.getBoundingClientRect();
	return { bottom: Math.max(0, rect.bottom), height: rect.height };
}

/** Did the reader ask for reduced motion? */
function prefersReducedMotion(win) {
	return Boolean(win.matchMedia?.(REDUCED_MOTION_QUERY)?.matches);
}

/** Does the element have a box (an element inside a display:none parent has none)? */
function hasBox(element) {
	return element.getClientRects().length > 0;
}

/**
 * Scrolls the page so that `element` (the editor) is in view (see THE SCROLL). Returns true
 * when it started a scroll, false when none was needed or possible.
 */
export function scrollEditorIntoView(element, { win, doc }) {
	if (!hasBox(element)) return false;
	const rect = element.getBoundingClientRect();
	const navbar = navbarBox(doc);
	const top = scrollTopFor({
		top: rect.top,
		height: rect.height,
		scrollY: win.scrollY,
		viewportHeight: win.innerHeight,
		documentHeight: doc.documentElement.scrollHeight,
		navbarBottom: navbar.bottom,
		navbarHeight: navbar.height,
	});
	if (top === null) return false;
	win.scrollTo({ top, behavior: prefersReducedMotion(win) ? 'auto' : 'smooth' });
	return true;
}

/**
 * Calls `done()` once the page has stopped scrolling (see THE WAIT): at `scrollend`, after
 * `idleMs` without a `scroll` event, or after `maxMs` at most. Returns cancel(), which stops
 * waiting without calling `done`.
 */
export function waitForScrollToSettle(win, done, { idleMs = SCROLL_IDLE_MS, maxMs = SCROLL_SETTLE_MAX_MS } = {}) {
	let idleTimer = null;
	let maxTimer = null;
	let over = false;

	function stop() {
		over = true;
		win.clearTimeout(idleTimer);
		win.clearTimeout(maxTimer);
		win.removeEventListener('scroll', restartIdle);
		win.removeEventListener('scrollend', finish);
	}

	function finish() {
		if (over) return;
		stop();
		done();
	}

	function restartIdle() {
		win.clearTimeout(idleTimer);
		idleTimer = win.setTimeout(finish, idleMs);
	}

	maxTimer = win.setTimeout(finish, maxMs);
	win.addEventListener('scroll', restartIdle, { passive: true });
	win.addEventListener('scrollend', finish);
	restartIdle();
	return () => {
		if (!over) stop();
	};
}

/**
 * The page's new scroll position (px) that brings revealed lines into view with the least
 * movement, or null when they are in view already (or the page cannot move).
 *   top, bottom       the lines' box, from the window's top (px)
 *   the others        as scrollTopFor
 * Lines below the window: their bottom lands TOP_GAP_PX above its edge. Lines under the navbar
 * or above the window, or lines taller than the room under the navbar: their top lands
 * TOP_GAP_PX under the navbar (its height kept free, as in scrollTopFor).
 */
export function scrollTopToShow({ top, bottom, scrollY, viewportHeight, documentHeight, navbarBottom = 0, navbarHeight = 0 }) {
	if (top >= navbarBottom && bottom <= viewportHeight) return null;
	const firstFree = navbarHeight + TOP_GAP_PX;
	const lastFree = viewportHeight - TOP_GAP_PX;
	const tooTall = bottom - top > lastFree - firstFree;
	const delta = tooTall || top < navbarBottom ? top - firstFree : bottom - lastFree;
	const furthest = Math.max(0, documentHeight - viewportHeight);
	const target = clamp(Math.round(scrollY + delta), 0, furthest);
	if (Math.abs(target - scrollY) < MIN_SCROLL_PX) return null;
	return target;
}

/**
 * Resolves at the Monaco editor's next layout change (its box was resized: a fit editor grew),
 * or after `ms`, whichever comes first. The Monaco surface's `layoutSettled` (monacoSurface.js).
 */
export function monacoLayoutSettled(editor, win, ms) {
	return new Promise((resolve) => {
		let settled = false;
		let subscription = null;
		let timer = null;
		const finish = () => {
			if (settled) return;
			settled = true;
			win.clearTimeout(timer);
			subscription?.dispose?.();
			resolve();
		};
		timer = win.setTimeout(finish, ms);
		subscription = editor.onDidLayoutChange?.(finish) ?? null;
		if (settled) subscription?.dispose?.();
	});
}

/**
 * Where lines start … end of a Monaco editor are on the page now: { top, bottom } from the
 * window's top, cut to the editor's box (its own window may show only part of them), or null
 * when the editor cannot say. The Monaco surface's `linesBox` (monacoSurface.js).
 */
export function monacoLinesBox(editor, [start, end]) {
	const node = editor.getDomNode?.();
	const first = editor.getScrolledVisiblePosition?.({ lineNumber: start, column: 1 });
	const last = editor.getScrolledVisiblePosition?.({ lineNumber: end, column: 1 });
	if (!node || !first || !last) return null;
	const box = node.getBoundingClientRect();
	const top = Math.max(box.top, box.top + first.top);
	const bottom = Math.min(box.bottom, box.top + last.top + last.height);
	return bottom > top ? { top, bottom } : null;
}

/** Resolves once the page has stopped scrolling (waitForScrollToSettle as a promise). */
function scrollSettled(win) {
	return new Promise((resolve) => {
		waitForScrollToSettle(win, resolve);
	});
}

/**
 * After an editor revealed lines [start, end] in its own window: scrolls the page, if it must,
 * so they are in the page's window too (see THE FOLLOW-UP). `measurer` is the editor's surface
 * (shared/components/CodeEditor/surface.js): its `linesBox(span)` says where the lines are on the
 * page, its `layoutSettled(win, ms)` when its box has had time to grow — Monaco's are
 * monacoLinesBox / monacoLayoutSettled above, the static view's are staticSurface.js's.
 * `waitForGrowth`: the editor's box follows its code (height="fit"), so wait for it to grow
 * first. Resolves when done (at once where there is no window: the server, node).
 */
export async function keepLinesInWindow(measurer, span, { win = globalThis.window, doc = globalThis.document, waitForGrowth = false, waitMs = LAYOUT_SETTLE_MS } = {}) {
	if (!win || !doc || !measurer) return;
	if (waitForGrowth) await measurer.layoutSettled(win, waitMs);
	const lines = measurer.linesBox(span);
	if (!lines) return;
	const navbar = navbarBox(doc);
	const top = scrollTopToShow({
		...lines,
		scrollY: win.scrollY,
		viewportHeight: win.innerHeight,
		documentHeight: doc.documentElement.scrollHeight,
		navbarBottom: navbar.bottom,
		navbarHeight: navbar.height,
	});
	if (top === null) return;
	const settled = scrollSettled(win);
	win.scrollTo({ top, behavior: prefersReducedMotion(win) ? 'auto' : 'smooth' });
	await settled;
}

/**
 * The whole click: brings the editor called `id` into view and, once the scroll has settled,
 * sends it `action` (none when `action` is null: the reference only scrolls). Returns cancel():
 * it stops the wait and withdraws the request if the editor has not taken it yet.
 */
export function goToEditor({ id, action }, { win = window, doc = document, warn = consoleWarn } = {}) {
	const domId = editorDomId(id);
	const element = domId === null ? null : doc.getElementById(domId);
	if (!element) {
		warn(WARNINGS.noEditor(id));
		return NOTHING_TO_UNDO;
	}
	const scrolled = scrollEditorIntoView(element, { win, doc });
	if (!action) return NOTHING_TO_UNDO;
	if (!scrolled) return requestEditor(id, action);

	let cancelRequest = NOTHING_TO_UNDO;
	const cancelWait = waitForScrollToSettle(win, () => {
		cancelRequest = requestEditor(id, action);
	});
	return () => {
		cancelWait();
		cancelRequest();
	};
}
