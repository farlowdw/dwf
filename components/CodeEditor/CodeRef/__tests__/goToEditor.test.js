/**
 * goToEditor.test.js — what a click on a <CodeRef> does (../goToEditor.js), against a fake
 * window and document and node's mock timers:
 *   - where the editor lands (scrollTopFor): no scroll when it is wholly in view (counting the
 *     navbar only where it covers the window now); centred under the navbar when it fits; its
 *     top just under the navbar when it is taller than the window; never past the page's ends;
 *   - the scroll: smooth, or a jump with reduced motion; none for an element without a box (a
 *     closed dropdown);
 *   - the wait: the request goes out at `scrollend`, after SCROLL_IDLE_MS without a scroll
 *     event (each one restarts it), or after SCROLL_SETTLE_MAX_MS at most; cancel stops it;
 *   - the whole click, through the page's real registry: a missing editor (a warning, nothing
 *     else), no scroll (the request at once), a scroll (the request once it settles), only a
 *     scroll (no action), and cancel (the wait stopped, a waiting request withdrawn);
 *   - the follow-up after an editor's reveal (scrollTopToShow, keepLinesInWindow, measuring
 *     through a surface made of monacoLinesBox / monacoLayoutSettled over a fake editor whose
 *     box can grow): nothing when the lines are in view; the least scroll that shows them (below
 *     the window, under the navbar, taller than the room); a fit editor measured only after it
 *     grew (its layout change, or LAYOUT_SETTLE_MS at most); done once the scroll has settled;
 *     nothing at all without a window.
 * Run with `npm run test:shared`.
 * To change it: a new rule of ../goToEditor.js (where the editor lands, the wait, the follow-up) gets a
 * test here, over the same fakes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TYPES, editorDomId, registerEditor } from '../../lib/registry/index.js';
import {
	LAYOUT_SETTLE_MS,
	NAVBAR_SELECTOR,
	SCROLL_IDLE_MS,
	SCROLL_SETTLE_MAX_MS,
	TOP_GAP_PX,
	goToEditor,
	keepLinesInWindow,
	monacoLayoutSettled,
	monacoLinesBox,
	scrollEditorIntoView,
	scrollTopFor,
	scrollTopToShow,
	waitForScrollToSettle,
} from '../goToEditor.js';

/** A laptop window: 800 px tall, a 60 px navbar showing, a 5000 px page scrolled to 1000. */
const WINDOW = Object.freeze({ scrollY: 1000, viewportHeight: 800, documentHeight: 5000, navbarBottom: 60, navbarHeight: 60 });

const SHOW_LINES = Object.freeze({ type: ACTION_TYPES.lines, ranges: Object.freeze([Object.freeze([10, 12])]) });

/** An id no other test uses (the page registry is shared by the whole file). */
let idCount = 0;
function uniqueId() {
	idCount += 1;
	return `go-to-editor-test-${idCount}`;
}

/**
 * A fake page: `win` and `doc` as goToEditor reads them, the editor's element (with `rect`, or
 * no box when `hidden`), the scrolls asked for, and dispatch(type) for window events.
 */
function fakePage({ id, rect, scrollY = WINDOW.scrollY, innerHeight = WINDOW.viewportHeight, scrollHeight = WINDOW.documentHeight, navbar = { bottom: 60, height: 60 }, reducedMotion = false, hidden = false }) {
	const scrolls = [];
	const listeners = new Map();
	const element = {
		getClientRects: () => (hidden ? [] : [rect]),
		getBoundingClientRect: () => (hidden ? { top: 0, height: 0 } : rect),
	};
	const doc = {
		getElementById: (wanted) => (wanted === editorDomId(id) ? element : null),
		querySelector: (selector) => (selector === NAVBAR_SELECTOR && navbar ? { getBoundingClientRect: () => navbar } : null),
		documentElement: { scrollHeight },
	};
	const win = {
		scrollY,
		innerHeight,
		matchMedia: (query) => ({ matches: reducedMotion && query === '(prefers-reduced-motion: reduce)' }),
		scrollTo: (options) => scrolls.push(options),
		addEventListener: (type, listener) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type).add(listener);
		},
		removeEventListener: (type, listener) => listeners.get(type)?.delete(listener),
		setTimeout: (callback, ms) => setTimeout(callback, ms),
		clearTimeout: (timer) => clearTimeout(timer),
	};
	const dispatch = (type) => {
		for (const listener of [...(listeners.get(type) ?? [])]) listener();
	};
	const listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
	return { win, doc, element, scrolls, dispatch, listenerCount };
}

/** A fake editor registered on the page's registry: { received, unregister }. */
function registeredEditor(id) {
	const received = [];
	const unregister = registerEditor(id, { perform: (action) => received.push(action) });
	return { received, unregister };
}

/** A warn that records its messages. */
function recordingWarn() {
	const messages = [];
	const warn = (message) => messages.push(message);
	return { warn, messages };
}

test('scrollTopFor: no scroll when the editor is wholly in view below the navbar', () => {
	assert.equal(scrollTopFor({ ...WINDOW, top: 100, height: 500 }), null);
	assert.equal(scrollTopFor({ ...WINDOW, top: 60, height: 740 }), null, 'exactly the free space');
});

test('scrollTopFor: under a navbar that covers the window now, it is not in view', () => {
	assert.notEqual(scrollTopFor({ ...WINDOW, top: 30, height: 300 }), null);
	assert.equal(scrollTopFor({ ...WINDOW, navbarBottom: 0, top: 30, height: 300 }), null, 'the navbar is hidden: in view');
});

test('scrollTopFor: an editor that fits is centred in the space under the navbar', () => {
	const height = 400;
	const top = 1200; // below the window
	const scrollTop = scrollTopFor({ ...WINDOW, top, height });
	const room = WINDOW.viewportHeight - WINDOW.navbarHeight - 2 * TOP_GAP_PX;
	const landedTop = top - (scrollTop - WINDOW.scrollY);
	assert.equal(landedTop, WINDOW.navbarHeight + TOP_GAP_PX + (room - height) / 2);
	const above = scrollTopFor({ ...WINDOW, top: -600, height });
	assert.equal(-600 - (above - WINDOW.scrollY), landedTop, 'the same place, coming from below');
});

test("scrollTopFor: the navbar's height is kept free even while it is hidden (it may come back)", () => {
	const shown = scrollTopFor({ ...WINDOW, top: 1200, height: 400 });
	const hidden = scrollTopFor({ ...WINDOW, navbarBottom: 0, top: 1200, height: 400 });
	assert.equal(hidden, shown);
});

test('scrollTopFor: an editor taller than the window lands with its top just under the navbar', () => {
	const top = 1500;
	const scrollTop = scrollTopFor({ ...WINDOW, top, height: 1200 });
	assert.equal(top - (scrollTop - WINDOW.scrollY), WINDOW.navbarHeight + TOP_GAP_PX);
});

test("scrollTopFor: never past the page's ends; no scroll when the page cannot move", () => {
	assert.equal(scrollTopFor({ ...WINDOW, scrollY: 100, top: -500, height: 300 }), 0, 'not above the top');
	const furthest = WINDOW.documentHeight - WINDOW.viewportHeight;
	assert.equal(scrollTopFor({ ...WINDOW, scrollY: 3800, top: 900, height: 300 }), furthest, 'not below the bottom');
	assert.equal(scrollTopFor({ ...WINDOW, scrollY: furthest, top: 700, height: 300 }), null, 'already at the bottom');
	assert.equal(scrollTopFor({ ...WINDOW, scrollY: 0, documentHeight: 600, top: 500, height: 300 }), null, 'a page shorter than the window');
});

test('scrollTopFor: the result is a whole number of pixels', () => {
	const scrollTop = scrollTopFor({ ...WINDOW, top: 1200.4, height: 401 });
	assert.equal(scrollTop, Math.round(scrollTop));
});

test('scrollEditorIntoView: smooth by default; a jump with reduced motion', () => {
	const rect = { top: 1200, height: 400 };
	const smooth = fakePage({ id: 'x', rect });
	assert.equal(scrollEditorIntoView(smooth.element, smooth), true);
	assert.deepEqual(smooth.scrolls, [{ top: scrollTopFor({ ...WINDOW, top: 1200, height: 400 }), behavior: 'smooth' }]);
	const reduced = fakePage({ id: 'x', rect, reducedMotion: true });
	scrollEditorIntoView(reduced.element, reduced);
	assert.equal(reduced.scrolls[0].behavior, 'auto');
});

test('scrollEditorIntoView: none when in view, none for an element without a box, a page without a navbar works', () => {
	const inView = fakePage({ id: 'x', rect: { top: 100, height: 300 } });
	assert.equal(scrollEditorIntoView(inView.element, inView), false);
	assert.deepEqual(inView.scrolls, []);
	const hidden = fakePage({ id: 'x', rect: { top: 1200, height: 400 }, hidden: true });
	assert.equal(scrollEditorIntoView(hidden.element, hidden), false);
	assert.deepEqual(hidden.scrolls, []);
	const noNavbar = fakePage({ id: 'x', rect: { top: 1200, height: 400 }, navbar: null });
	assert.equal(scrollEditorIntoView(noNavbar.element, noNavbar), true);
	assert.equal(noNavbar.scrolls[0].top, scrollTopFor({ ...WINDOW, navbarBottom: 0, navbarHeight: 0, top: 1200, height: 400 }));
});

test('waitForScrollToSettle: done after SCROLL_IDLE_MS without a scroll event; each scroll restarts it', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const page = fakePage({ id: 'x', rect: { top: 0, height: 0 } });
	let done = 0;
	waitForScrollToSettle(page.win, () => (done += 1));
	t.mock.timers.tick(SCROLL_IDLE_MS - 10);
	page.dispatch('scroll');
	t.mock.timers.tick(SCROLL_IDLE_MS - 10);
	assert.equal(done, 0, 'the scroll restarted the wait');
	t.mock.timers.tick(10);
	assert.equal(done, 1);
	t.mock.timers.tick(SCROLL_SETTLE_MAX_MS);
	assert.equal(done, 1, 'once only');
	assert.equal(page.listenerCount(), 0, 'its listeners are gone');
});

test('waitForScrollToSettle: done at scrollend, at once', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const page = fakePage({ id: 'x', rect: { top: 0, height: 0 } });
	let done = 0;
	waitForScrollToSettle(page.win, () => (done += 1));
	page.dispatch('scroll');
	page.dispatch('scrollend');
	assert.equal(done, 1);
	t.mock.timers.tick(SCROLL_SETTLE_MAX_MS);
	assert.equal(done, 1);
	assert.equal(page.listenerCount(), 0);
});

test('waitForScrollToSettle: never later than SCROLL_SETTLE_MAX_MS, however long the scrolling goes on', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const page = fakePage({ id: 'x', rect: { top: 0, height: 0 } });
	let done = 0;
	waitForScrollToSettle(page.win, () => (done += 1));
	const step = 50;
	for (let elapsed = 0; elapsed < SCROLL_SETTLE_MAX_MS - step; elapsed += step) {
		page.dispatch('scroll');
		t.mock.timers.tick(step);
	}
	assert.equal(done, 0);
	page.dispatch('scroll');
	t.mock.timers.tick(step);
	assert.equal(done, 1);
});

test('waitForScrollToSettle: cancel stops the wait without calling done', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const page = fakePage({ id: 'x', rect: { top: 0, height: 0 } });
	let done = 0;
	const cancel = waitForScrollToSettle(page.win, () => (done += 1));
	cancel();
	cancel(); // twice is harmless
	page.dispatch('scrollend');
	t.mock.timers.tick(SCROLL_SETTLE_MAX_MS);
	assert.equal(done, 0);
	assert.equal(page.listenerCount(), 0);
});

test('goToEditor: no element with the editor\'s DOM id — a warning, no scroll, no request', () => {
	const id = uniqueId();
	const editor = registeredEditor(id);
	const page = fakePage({ id: 'another-editor', rect: { top: 1200, height: 400 } });
	const { warn, messages } = recordingWarn();
	const cancel = goToEditor({ id, action: SHOW_LINES }, { ...page, warn });
	cancel();
	assert.equal(messages.length, 1);
	assert.match(messages[0], new RegExp(`^CodeRef: there is no editor called "${id}" on this page \\(no element #code-editor-${id}\\)`));
	assert.deepEqual(page.scrolls, []);
	assert.deepEqual(editor.received, []);
	editor.unregister();
});

test('goToEditor: the editor already in view — no scroll, the request at once', () => {
	const id = uniqueId();
	const editor = registeredEditor(id);
	const page = fakePage({ id, rect: { top: 100, height: 400 } });
	goToEditor({ id, action: SHOW_LINES }, page);
	assert.deepEqual(page.scrolls, []);
	assert.deepEqual(editor.received, [SHOW_LINES]);
	editor.unregister();
});

test('goToEditor: the editor in a closed dropdown (no box) — no scroll, the request at once', () => {
	const id = uniqueId();
	const editor = registeredEditor(id);
	const page = fakePage({ id, rect: { top: 1200, height: 400 }, hidden: true });
	goToEditor({ id, action: SHOW_LINES }, page);
	assert.deepEqual(page.scrolls, []);
	assert.deepEqual(editor.received, [SHOW_LINES]);
	editor.unregister();
});

test('goToEditor: a scroll first, the request once it has settled', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const id = uniqueId();
	const editor = registeredEditor(id);
	const page = fakePage({ id, rect: { top: 1200, height: 400 } });
	goToEditor({ id, action: SHOW_LINES }, page);
	assert.equal(page.scrolls.length, 1);
	assert.equal(page.scrolls[0].behavior, 'smooth');
	page.dispatch('scroll');
	assert.deepEqual(editor.received, [], 'not while it scrolls');
	page.dispatch('scrollend');
	assert.deepEqual(editor.received, [SHOW_LINES]);
	editor.unregister();
});

test('goToEditor: no action — only the scroll, nothing requested', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const id = uniqueId();
	const editor = registeredEditor(id);
	const page = fakePage({ id, rect: { top: 1200, height: 400 } });
	goToEditor({ id, action: null }, page);
	assert.equal(page.scrolls.length, 1);
	t.mock.timers.tick(SCROLL_SETTLE_MAX_MS);
	assert.deepEqual(editor.received, []);
	assert.equal(page.listenerCount(), 0, 'no wait was started');
	editor.unregister();
});

test('goToEditor: cancel during the scroll — nothing is requested', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const id = uniqueId();
	const editor = registeredEditor(id);
	const page = fakePage({ id, rect: { top: 1200, height: 400 } });
	const cancel = goToEditor({ id, action: SHOW_LINES }, page);
	cancel();
	page.dispatch('scrollend');
	t.mock.timers.tick(SCROLL_SETTLE_MAX_MS);
	assert.deepEqual(editor.received, []);
	editor.unregister();
});

test('goToEditor: an editor not registered yet — the request waits; cancel withdraws it', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const id = uniqueId();
	const page = fakePage({ id, rect: { top: 1200, height: 400 } });
	const cancel = goToEditor({ id, action: SHOW_LINES }, page);
	page.dispatch('scrollend'); // the request is made now, and waits
	cancel(); // the <CodeRef> unmounts
	const late = registeredEditor(id);
	assert.deepEqual(late.received, [], 'withdrawn');
	late.unregister();

	const kept = uniqueId();
	const keptPage = fakePage({ id: kept, rect: { top: 100, height: 400 } });
	goToEditor({ id: kept, action: SHOW_LINES }, keptPage); // in view: requested at once, and waits
	const editor = registeredEditor(kept); // Monaco has loaded
	assert.deepEqual(editor.received, [SHOW_LINES]);
	editor.unregister();
});

test('scrollTopToShow: no scroll when the lines are in view below the navbar', () => {
	assert.equal(scrollTopToShow({ ...WINDOW, top: 100, bottom: 160 }), null);
	assert.equal(scrollTopToShow({ ...WINDOW, top: 60, bottom: 800 }), null, 'exactly the free space');
});

test('scrollTopToShow: lines below the window land with their bottom just above its edge (the least scroll)', () => {
	const target = scrollTopToShow({ ...WINDOW, top: 780, bottom: 840 });
	assert.equal(840 - (target - WINDOW.scrollY), WINDOW.viewportHeight - TOP_GAP_PX);
});

test('scrollTopToShow: lines under the navbar or above the window, and lines taller than the room, land with their top under the navbar', () => {
	const under = scrollTopToShow({ ...WINDOW, top: 30, bottom: 90 });
	assert.equal(30 - (under - WINDOW.scrollY), WINDOW.navbarHeight + TOP_GAP_PX);
	const above = scrollTopToShow({ ...WINDOW, top: -300, bottom: -240 });
	assert.equal(-300 - (above - WINDOW.scrollY), WINDOW.navbarHeight + TOP_GAP_PX);
	const tall = scrollTopToShow({ ...WINDOW, top: 500, bottom: 1500 });
	assert.equal(500 - (tall - WINDOW.scrollY), WINDOW.navbarHeight + TOP_GAP_PX, 'their top wins');
});

test("scrollTopToShow: never past the page's ends; a whole number of pixels", () => {
	const furthest = WINDOW.documentHeight - WINDOW.viewportHeight;
	assert.equal(scrollTopToShow({ ...WINDOW, scrollY: furthest, top: 790, bottom: 900 }), null, 'already at the bottom');
	assert.equal(scrollTopToShow({ ...WINDOW, scrollY: 10, top: -100, bottom: -50 }), 0);
	const target = scrollTopToShow({ ...WINDOW, top: 790.4, bottom: 851.3 });
	assert.equal(target, Math.round(target));
});

/**
 * A fake Monaco editor for keepLinesInWindow, as the Monaco surface measures it
 * (monacoLinesBox / monacoLayoutSettled: `linesBox` and `layoutSettled` here): its DOM node's
 * box ({ top, height }) and 21 px lines from its top (scrollTop 0); grow(px) makes the box
 * taller and fires onDidLayoutChange.
 */
function fakeRevealEditor({ top, height, lineHeight = 21 }) {
	const box = { top, height };
	const layoutListeners = new Set();
	const editor = {
		box,
		getDomNode: () => ({ getBoundingClientRect: () => ({ top: box.top, bottom: box.top + box.height, height: box.height }) }),
		getScrolledVisiblePosition: ({ lineNumber }) => ({ top: (lineNumber - 1) * lineHeight, left: 0, height: lineHeight }),
		onDidLayoutChange(listener) {
			layoutListeners.add(listener);
			return { dispose: () => layoutListeners.delete(listener) };
		},
		grow(px) {
			box.height += px;
			for (const listener of [...layoutListeners]) listener();
		},
		layoutListenerCount: () => layoutListeners.size,
		// the measurer half of the surface (monacoSurface.js delegates exactly so)
		linesBox: (span) => monacoLinesBox(editor, span),
		layoutSettled: (win, ms) => monacoLayoutSettled(editor, win, ms),
	};
	return editor;
}

test('monacoLinesBox: the lines cut to the editor\'s box, null when the editor cannot say', () => {
	const editor = fakeRevealEditor({ top: 300, height: 200 });
	assert.deepEqual(monacoLinesBox(editor, [1, 2]), { top: 300, bottom: 342 });
	assert.deepEqual(monacoLinesBox(editor, [1, 40]), { top: 300, bottom: 500 }, "cut to the box's bottom");
	assert.equal(monacoLinesBox(editor, [20, 25]), null, 'wholly below the box');
	assert.equal(monacoLinesBox({ getDomNode: () => null }, [1, 1]), null);
});

test('keepLinesInWindow: lines already in the window — no scroll, done at once', async () => {
	const page = fakePage({ id: 'x', rect: { top: 0, height: 0 } });
	const editor = fakeRevealEditor({ top: 200, height: 400 });
	await keepLinesInWindow(editor, [3, 5], page);
	assert.deepEqual(page.scrolls, []);
});

test('keepLinesInWindow: a fit editor is measured after it grew; the page scrolls the least that shows the lines, then waits for it to settle', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const page = fakePage({ id: 'x', rect: { top: 0, height: 0 } });
	// the box ends at 760: line 30 (609-630 from its top) is cut off until the box grows
	const editor = fakeRevealEditor({ top: 400, height: 360 });
	let done = false;
	const following = keepLinesInWindow(editor, [29, 30], { ...page, waitForGrowth: true }).then(() => (done = true));
	editor.grow(300);
	await Promise.resolve();
	assert.equal(page.scrolls.length, 1, 'measured once the box grew');
	const lineBottom = 400 + 30 * 21;
	assert.equal(lineBottom - (page.scrolls[0].top - WINDOW.scrollY), WINDOW.viewportHeight - TOP_GAP_PX, "line 30's bottom lands just above the window's edge");
	assert.equal(page.scrolls[0].behavior, 'smooth');
	assert.equal(editor.layoutListenerCount(), 0, 'its layout listener is gone');
	await Promise.resolve();
	assert.equal(done, false, 'not before the scroll has settled');
	page.dispatch('scrollend');
	await following;
	assert.equal(done, true);
});

test('keepLinesInWindow: a fit editor that never lays out again is measured after LAYOUT_SETTLE_MS; reduced motion jumps', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const page = fakePage({ id: 'x', rect: { top: 0, height: 0 }, reducedMotion: true });
	const editor = fakeRevealEditor({ top: 600, height: 400 });
	const following = keepLinesInWindow(editor, [10, 12], { ...page, waitForGrowth: true });
	await Promise.resolve();
	assert.deepEqual(page.scrolls, [], 'still waiting for the box');
	t.mock.timers.tick(LAYOUT_SETTLE_MS);
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(page.scrolls.length, 1);
	assert.equal(page.scrolls[0].behavior, 'auto');
	page.dispatch('scrollend');
	await following;
});

test('keepLinesInWindow: the lines are cut to the editor\'s box; no window (the server, node) does nothing', async () => {
	const page = fakePage({ id: 'x', rect: { top: 0, height: 0 } });
	// lines 1-40 asked, the box shows 200 px from 300: in view once cut to the box
	await keepLinesInWindow(fakeRevealEditor({ top: 300, height: 200 }), [1, 40], page);
	assert.deepEqual(page.scrolls, []);
	await assert.doesNotReject(keepLinesInWindow(fakeRevealEditor({ top: 0, height: 10 }), [1, 1], { win: undefined, doc: undefined }));
});
