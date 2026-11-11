/**
 * readingPlace.test.js — the reader's place while the docs sidebar collapses or expands
 * (../readingPlace.js). Which block is the anchor (findReadingAnchor: the first block
 * that starts at or below the reading line, searched inside a block the line crosses first; the
 * deepest crossing block when nothing starts in view; never an inline, sticky, fixed or absolute
 * box), and the hold (createReadingPlace: every frame undoes the anchor's movement for HOLD_MS
 * from the first frame, which always corrects; Docusaurus's scroll events and the browser's own
 * scroll anchoring off meanwhile and back on at every way out, the scroll events one frame later;
 * a second toggle lengthens it; the
 * reader's own scrolling, or any scroll it did not make, ends it). Invented boxes, a hand-run clock
 * and frames. Run with `npm run test:shared`, in a site that has the stub.
 *
 * HOW TO CHANGE IT  A new rule of the hold or the anchor: a test here, with the page drawn as
 * invented boxes (el) and the clock and frames stepped by hand (fakePage).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLD_MS, TOLERANCE_PX, USER_SCROLL_EVENTS, createReadingPlace, findReadingAnchor } from '../readingPlace.js';

/** The reading line (the navbar's bottom edge) and the window's bottom of the invented page. */
const LINE = 72;
const BOTTOM = 720;

/** An invented element: a box from `top` to `bottom` (px from the window's top), a style, children. */
function el(name, top, bottom, { display = 'block', position = 'static', children = [] } = {}) {
	return { name, box: { top, bottom, height: bottom - top }, style: { display, position }, children };
}

const LOOK = { boxOf: (element) => element.box, styleOf: (element) => element.style };

function anchorName(root) {
	return findReadingAnchor(root, LINE, BOTTOM, LOOK)?.name ?? null;
}

test('the first block that starts at or below the reading line is the anchor; blocks above it are passed over', () => {
	const root = el('main', -3000, 9000, { children: [el('p1', -400, -300), el('p2', -280, 60), el('h3', 90, 120), el('p3', 130, 400)] });
	assert.equal(anchorName(root), 'h3');
});

test('a block starting exactly on the line starts in view; one ending exactly on it is above', () => {
	const root = el('main', -3000, 9000, { children: [el('above', 20, LINE), el('on', LINE, 140)] });
	assert.equal(anchorName(root), 'on');
});

test('a block the line crosses is searched inside first: its first child in view wins over the blocks after it', () => {
	const details = el('details', -500, 600, { children: [el('summary', -500, -460), el('code', -440, 300, { children: [el('line9', 50, 70), el('line10', 76, 96), el('line11', 96, 116)] })] });
	const root = el('main', -3000, 9000, { children: [details, el('h3-after', 620, 650)] });
	assert.equal(anchorName(root), 'line10');
});

test('a paragraph the line crosses, with no block inside, gives way to the next block that starts in view', () => {
	const paragraph = el('p', 10, 200, { children: [el('em', 40, 60, { display: 'inline' })] });
	const root = el('main', -3000, 9000, { children: [paragraph, el('p-next', 210, 300)] });
	assert.equal(anchorName(root), 'p-next');
});

test('when nothing starts in view (one code block fills the window), the deepest block the line crosses is the anchor', () => {
	const code = el('code', -2000, 4000, { children: [el('token', -2000, 4000, { display: 'inline' })] });
	const root = el('main', -3000, 9000, { children: [el('wrapper', -2100, 4100, { children: [el('pre', -2050, 4050, { children: [code] })] })] });
	assert.equal(anchorName(root), 'code');
});

test('the first block below the window ends the walk: then the crossing block is the anchor', () => {
	const root = el('main', -3000, 9000, { children: [el('tall', -100, 700), el('below', 760, 800)] });
	assert.equal(anchorName(root), 'tall');
});

test('inline, sticky, fixed and absolute boxes are never anchors and are not searched', () => {
	const toc = el('toc-column', -3000, 9000, { children: [el('toc', 80, 600, { position: 'sticky', children: [el('toc-link', 100, 120)] })] });
	const root = el('main', -3000, 9000, {
		children: [
			el('link', 80, 100, { display: 'inline' }),
			el('chip', 85, 105, { display: 'inline-block' }),
			el('copy-button', 90, 110, { position: 'absolute' }),
			el('back-to-top', 650, 700, { position: 'fixed' }),
			el('row', -3000, 9000, { display: 'flex', children: [el('doc-column', -3000, 9000, { children: [el('code', -900, 2000)] }), toc] }),
		],
	});
	assert.equal(anchorName(root), 'code');
});

test('display: none and empty blocks are passed over; display: contents is searched through', () => {
	const root = el('main', -3000, 9000, {
		children: [
			el('hidden', 0, 0, { display: 'none', children: [el('inside-hidden', 100, 120)] }),
			el('empty', 90, 90),
			el('wrapper', 0, 0, { display: 'contents', children: [el('through-contents', 110, 140)] }),
			el('later', 150, 180),
		],
	});
	assert.equal(anchorName(root), 'through-contents');
});

test('nothing in view: no anchor', () => {
	const root = el('main', -3000, 9000, { children: [el('far-above', -900, -800), el('far-below', 900, 1000)] });
	assert.equal(anchorName(root), null);
	assert.equal(anchorName(el('empty-main', 0, 0)), null);
});

/**
 * The invented page for the hold: the anchor sits at `docTop` in the page, the window at
 * `scrollY`; the layout moves the anchor by changing docTop, the hold scrolls by changing scrollY
 * (the reader, or the browser clamping a page that got shorter, changes scrollY directly).
 * Frames and the clock are run by hand (step).
 */
function fakePage({ docTop = 600, scrollY = 400, maxScrollY = 100_000 } = {}) {
	const page = { docTop, scrollY, maxScrollY, time: 1000, frames: [], scrolls: [], listeners: new Map(), eventsOn: true, nativeAnchoring: true, found: 0 };
	const anchor = { isConnected: true, getBoundingClientRect: () => ({ top: page.docTop - page.scrollY }) };
	const env = {
		now: () => page.time,
		nextFrame: (callback) => page.frames.push(callback),
		scrollBy: (pixels) => {
			page.scrolls.push(pixels);
			page.scrollY += pixels;
		},
		scrollY: () => page.scrollY,
		maxScrollY: () => page.maxScrollY,
		listen: (type, handler) => page.listeners.set(type, handler),
		unlisten: (type, handler) => page.listeners.get(type) === handler && page.listeners.delete(type),
		pauseNativeAnchoring: () => {
			page.nativeAnchoring = false;
			return () => (page.nativeAnchoring = true);
		},
		findAnchor: () => {
			page.found += 1;
			return page.noAnchor ? null : anchor;
		},
	};
	const scrollController = {
		disableScrollEvents: () => (page.eventsOn = false),
		enableScrollEvents: () => (page.eventsOn = true),
	};
	const step = (ms = 16) => {
		page.time += ms;
		page.frames.splice(0).forEach((frame) => frame());
	};
	const screenTop = () => page.docTop - page.scrollY;
	/** Right after a hold ended: native anchoring and the listeners are back at once, Docusaurus's scroll events in the next frame, and nothing of the hold is left running. */
	const assertAllBack = (message) => {
		assert.equal(page.nativeAnchoring, true, message);
		assert.equal(page.listeners.size, 0, message);
		assert.equal(page.eventsOn, false, `${message ?? ''} (scroll events still off until the next frame)`);
		step(); // the next frame: the last correction's scroll event has been sent by now
		assert.equal(page.eventsOn, true, message);
		assert.equal(page.frames.length, 0, message);
	};
	return { page, anchor, env, scrollController, step, screenTop, assertAllBack };
}

test('every frame undoes the anchor’s movement, before the frame is drawn, with the scroll events and native anchoring off', () => {
	const { page, env, scrollController, step, screenTop } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	assert.equal(screenTop(), 200);
	assert.equal(page.eventsOn, false);
	assert.equal(page.nativeAnchoring, false);
	assert.deepEqual([...page.listeners.keys()].sort(), [...USER_SCROLL_EVENTS].sort());
	// the content above re-wraps over a few frames (collapse: it gets shorter, the anchor rises)
	for (const docTop of [590, 560, 520, 470]) {
		page.docTop = docTop;
		step();
		assert.equal(screenTop(), 200);
	}
	assert.deepEqual(page.scrolls, [-10, -30, -40, -50]);
});

test('a movement under the tolerance is left alone', () => {
	const { page, env, scrollController, step } = fakePage();
	createReadingPlace(env).hold(scrollController);
	page.docTop += TOLERANCE_PX / 2;
	step();
	assert.deepEqual(page.scrolls, []);
});

test('HOLD_MS counts from the first frame, which always corrects, even when it comes late', () => {
	const { page, env, scrollController, step, screenTop } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	page.docTop += 40; // expand: the column narrows at once, the content above grows
	step(HOLD_MS + 500); // a very slow first frame
	assert.equal(screenTop(), 200);
	assert.equal(place.holding(), true);
});

test('after HOLD_MS the hold ends: no correction in its last frame, everything back as it was', () => {
	const { page, env, scrollController, step, assertAllBack } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step(); // the first frame starts the clock
	step(HOLD_MS - 16);
	assert.equal(place.holding(), true);
	page.docTop += 40;
	step(16);
	assert.equal(place.holding(), false);
	assert.deepEqual(page.scrolls, []);
	assertAllBack();
});

test('a second toggle during the hold keeps the SAME place and lengthens the hold', () => {
	const { page, env, scrollController, step, screenTop } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	step(300);
	page.docTop = 650; // the expand starts before the collapse's hold is over
	place.hold(scrollController);
	assert.equal(page.found, 1);
	step(HOLD_MS - 100);
	assert.equal(place.holding(), true);
	assert.equal(screenTop(), 200);
	step(200);
	assert.equal(place.holding(), false);
});

test('the owner’s own wheel, key or press ends the hold at once', () => {
	for (const type of USER_SCROLL_EVENTS) {
		const { page, env, scrollController, step, assertAllBack } = fakePage();
		const place = createReadingPlace(env);
		place.hold(scrollController);
		page.listeners.get(type)({ type, target: { closest: () => null } });
		assert.equal(place.holding(), false, type);
		page.docTop += 80;
		assertAllBack(type); // steps a frame: the frame already asked for finds the hold over and does nothing
		assert.deepEqual(page.scrolls, [], type);
	}
});

test('a key or click that ends the hold between a correction and its scroll event: scroll events stay off until the next frame', () => {
	const { page, env, scrollController, step } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	page.docTop -= 50;
	step(); // corrects: the browser sends that scroll event at the start of the next frame
	page.listeners.get('keydown')({ type: 'keydown', target: { closest: () => null } });
	assert.equal(page.eventsOn, false, 'the correction’s scroll event must not reach the navbar');
	step();
	assert.equal(page.eventsOn, true);
});

test('a new hold begun before the old one’s scroll events came back keeps them off', () => {
	const { page, env, scrollController, step } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.listeners.get('mousedown')({ type: 'mousedown', target: { closest: () => null } });
	place.hold(scrollController); // the toggle pressed again from the keyboard, say
	step();
	assert.equal(place.holding(), true);
	assert.equal(page.eventsOn, false);
});

test('a press inside the sidebar (the toggle again) does not end the hold; a key there does', () => {
	const inSidebar = { closest: (selector) => (selector === '.theme-doc-sidebar-container' ? {} : null) };
	const { page, env, scrollController } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	page.listeners.get('mousedown')({ type: 'mousedown', target: inSidebar });
	page.listeners.get('touchstart')({ type: 'touchstart', target: inSidebar });
	assert.equal(place.holding(), true);
	page.listeners.get('keydown')({ type: 'keydown', target: inSidebar });
	assert.equal(place.holding(), false);
});

test('a scroll the hold did not make (a dragged scrollbar, Space on the expand strip) ends it without a fight', () => {
	const { page, env, scrollController, step, assertAllBack } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.scrollY += 300; // the reader drags the scrollbar: no wheel, key or press reached the page
	page.docTop -= 20;
	step();
	assert.equal(place.holding(), false);
	assert.deepEqual(page.scrolls, []);
	assertAllBack();
});

test('a page that got shorter under the window (the browser clamps the scroll) is not taken for the owner', () => {
	const { page, env, scrollController, step, screenTop } = fakePage({ scrollY: 1000, maxScrollY: 1000, docTop: 1200 });
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	// collapse at the very bottom: the content above shrinks by 60 px, the page too, the browser clamps
	page.docTop -= 60;
	page.maxScrollY -= 60;
	page.scrollY = page.maxScrollY;
	step();
	assert.equal(place.holding(), true);
	assert.equal(screenTop(), 200);
});

test('an anchor that left the page (a link in the sidebar opened another doc) ends the hold without scrolling', () => {
	const { page, anchor, env, scrollController, step, assertAllBack } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	anchor.isConnected = false;
	page.docTop = 0;
	step();
	assert.equal(place.holding(), false);
	assert.deepEqual(page.scrolls, []);
	assertAllBack();
});

test('an error inside a frame ends the hold, puts everything back, and is still reported', () => {
	const { anchor, env, scrollController, step, assertAllBack } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	anchor.getBoundingClientRect = () => {
		throw new Error('layout gone wrong');
	};
	assert.throws(() => step(), /layout gone wrong/);
	assert.equal(place.holding(), false);
	assertAllBack();
});

test('no anchor (nothing of the doc in view): nothing is held, nothing is turned off', () => {
	const { page, env, scrollController } = fakePage();
	page.noAnchor = true;
	const place = createReadingPlace(env);
	place.hold(scrollController);
	assert.equal(place.holding(), false);
	assert.equal(page.eventsOn, true);
	assert.equal(page.nativeAnchoring, true);
	assert.equal(page.listeners.size, 0);
	assert.equal(page.frames.length, 0);
});
