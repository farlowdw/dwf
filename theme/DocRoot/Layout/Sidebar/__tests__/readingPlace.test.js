/**
 * readingPlace.test.js — the reader's place while the docs sidebar collapses or expands
 * (../readingPlace.js). Which block is the anchor (findReadingAnchor: the first block
 * that starts at or below the reading line, searched inside a block the line crosses first; the
 * deepest crossing block when nothing starts in view; never an inline, sticky, fixed or absolute
 * box), and the hold (createReadingPlace: every frame undoes the anchor's movement for HOLD_MS
 * from the first frame, which always corrects; Docusaurus's scroll events and the browser's own
 * scroll anchoring off meanwhile and back on at every way out, the scroll events one frame later;
 * a second toggle lengthens it; the
 * reader's own scrolling, or any scroll to a place it did not put the page, ends it; a position of
 * its own that the browser reports late, as an iPad does, does not, and a correction asks for a
 * place, never a distance, so that asking twice moves the page once). Invented boxes, a hand-run clock
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
		scrollTo: (top) => {
			page.scrolls.push(top - page.scrollY); // how far that moves the page: what the tests read
			page.scrollY = Math.max(0, top); // a browser stops at the top of the page
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

test('a position that comes back late (an iPad reports the page’s position a moment after the hold scrolled it) does not end the hold: the correction is made again', () => {
	const { page, env, scrollController, step, screenTop } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step(); // the first frame: nothing has moved yet
	page.docTop -= 96; // a collapse: the first lines above re-wrap
	step();
	assert.deepEqual(page.scrolls, [-96]);
	page.scrollY = 400; // the late report: where the page was before that correction
	step();
	assert.equal(place.holding(), true, 'the hold’s own earlier position is not the reader’s scrolling');
	assert.equal(screenTop(), 200);
	page.docTop -= 24; // the last line re-wraps a few frames later
	step();
	assert.equal(screenTop(), 200);
	assert.deepEqual(page.scrolls, [-96, -96, -24]);
});

test('any earlier position of the hold may come back, not only the one it started from', () => {
	const { page, env, scrollController, step, screenTop } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.docTop -= 96;
	step(); // 400 -> 304
	page.docTop -= 24;
	step(); // 304 -> 280
	page.scrollY = 304; // the first correction's position, reported after the second
	step();
	assert.equal(place.holding(), true);
	assert.equal(screenTop(), 200);
	assert.deepEqual(page.scrolls, [-96, -24, -24]);
});

test('a browser that has not moved the page yet when asked: the position it was sent to is the hold’s own', () => {
	const { page, env, scrollController, step, screenTop } = fakePage();
	const waiting = [];
	env.scrollTo = (top) => {
		page.scrolls.push(top - page.scrollY);
		waiting.push(top); // the page moves only after this frame
	};
	const arrive = () => waiting.splice(0).forEach((top) => (page.scrollY = top));
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.docTop -= 96;
	step(); // asked for -96; scrollY still reads 400
	arrive(); // now 304
	step();
	assert.equal(place.holding(), true);
	assert.equal(screenTop(), 200);
	assert.deepEqual(page.scrolls, [-96]);
});

test('a place the hold never put the page still ends it, after a late report too', () => {
	const { page, env, scrollController, step, assertAllBack } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.docTop -= 96;
	step(); // 400 -> 304
	page.scrollY = 400; // late report
	step(); // corrected again: 304
	page.scrollY = 350; // between two positions of the hold's own, and neither: the reader
	page.docTop -= 24;
	step();
	assert.equal(place.holding(), false);
	assert.deepEqual(page.scrolls, [-96, -96]);
	assertAllBack();
});

test('the first of three corrections’ positions may come back after the third', () => {
	const { page, env, scrollController, step, screenTop } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	for (const rise of [72, 24, 24]) {
		page.docTop -= rise;
		step(); // 400 -> 328 -> 304 -> 280
	}
	page.scrollY = 328; // the first correction's position, reported after the third
	step();
	assert.equal(place.holding(), true);
	assert.equal(screenTop(), 200);
});

test('a place exactly TOLERANCE_PX from every position of the hold’s own ends it', () => {
	const { page, env, scrollController, step } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.scrollY += TOLERANCE_PX;
	step();
	assert.equal(place.holding(), false);
});

test('a correction the browser stops at the top of the page leaves the page at a place of the hold’s own', () => {
	const { page, env, scrollController, step, screenTop } = fakePage({ docTop: 250, scrollY: 50 });
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.docTop -= 96; // the anchor rises 96 px; the page can go up 50 only
	step();
	assert.equal(page.scrollY, 0);
	step(); // the frame after: the page stands at 0, where the browser left it
	assert.equal(place.holding(), true, 'the stopped position is not someone else’s scroll');
	page.docTop += 96; // the sidebar is opened again inside the hold: the anchor comes back down
	place.hold(scrollController);
	step();
	assert.equal(screenTop(), 200);
});

test('a place that is not a whole pixel: the browser cuts it and a report may round it; neither ends the hold', () => {
	const { page, env, scrollController, step } = fakePage();
	env.scrollTo = (top) => {
		page.scrolls.push(top - page.scrollY);
		page.scrollY = Math.trunc(top); // a browser that keeps whole pixels cuts the place
	};
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.docTop -= 96.4; // the place is 303.6; the page stands at 303
	step();
	assert.equal(page.scrollY, 303);
	step();
	assert.equal(place.holding(), true, 'the cut position is the hold’s own');
	page.scrollY = 304; // a report that rounded 303.6 instead of cutting it
	step();
	assert.equal(place.holding(), true, 'under 1 px from the place sent: the hold’s own');
});

test('a second toggle inside the hold keeps the positions made so far: an older one may still come back after it', () => {
	const { page, env, scrollController, step, screenTop } = fakePage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	step();
	page.docTop -= 72;
	step(); // 400 -> 328
	page.docTop -= 24;
	step(); // 328 -> 304
	place.hold(scrollController); // the sidebar is opened again inside the hold
	page.docTop += 96;
	step(); // 304 -> 400
	page.scrollY = 328; // the collapse's first position, reported after the expand's correction
	step();
	assert.equal(place.holding(), true);
	assert.equal(screenTop(), 200);
});

/**
 * A page and its system apart, as on an iPad: pageY is what the page reads (window.scrollY), systemY
 * is where the system holds the page, which is what the reader sees. The page's own scroll moves pageY
 * at once and leaves a request; systemTakes() lets the system take the requests (it ADDS a distance to
 * its own position and GOES TO a place); report() tells the page the system's position. The page offers
 * both ways of scrolling, so that a hold that went back to distances would be caught here.
 */
function iPadPage({ docTop = 600, scrollY = 400 } = {}) {
	const page = { docTop, pageY: scrollY, systemY: scrollY, time: 1000, frames: [], asked: [] };
	const anchor = { isConnected: true, getBoundingClientRect: () => ({ top: page.docTop - page.pageY }) };
	const env = {
		now: () => page.time,
		nextFrame: (callback) => page.frames.push(callback),
		scrollBy: (pixels) => {
			page.pageY += pixels;
			page.asked.push({ by: pixels });
		},
		scrollTo: (top) => {
			page.pageY = top;
			page.asked.push({ to: top });
		},
		scrollY: () => page.pageY,
		maxScrollY: () => 100_000,
		listen: () => {},
		unlisten: () => {},
		pauseNativeAnchoring: () => () => {},
		findAnchor: () => anchor,
	};
	const scrollController = { disableScrollEvents: () => {}, enableScrollEvents: () => {} };
	const step = (ms = 16) => {
		page.time += ms;
		page.frames.splice(0).forEach((frame) => frame());
	};
	const systemTakes = () => {
		for (const request of page.asked.splice(0)) page.systemY = 'by' in request ? page.systemY + request.by : request.to;
	};
	const report = () => (page.pageY = page.systemY);
	const onScreen = () => page.docTop - page.systemY;
	return { page, env, scrollController, step, systemTakes, report, onScreen };
}

test('an iPad’s system adds a distance to its own position and goes to a place: a correction asked again after a late report moves the page once', () => {
	const { page, env, scrollController, step, systemTakes, report, onScreen } = iPadPage();
	const place = createReadingPlace(env);
	place.hold(scrollController);
	assert.equal(onScreen(), 200);
	step(); // the first frame: nothing has moved yet
	page.docTop -= 96; // a collapse: the first lines above re-wrap
	step(); // the hold corrects: the page reads 304 at once, the system still holds 400
	report(); // the late report: the system's position from before it took the request
	step(); // the page reads 400 again: the hold asks for the same place again
	systemTakes(); // the system takes both requests
	report();
	step();
	assert.equal(onScreen(), 200, 'after the first re-wrap the reader sees the anchor where it was');
	page.docTop -= 24; // the last line re-wraps
	step();
	report(); // late again
	step();
	systemTakes();
	report();
	step();
	assert.equal(onScreen(), 200, 'after the last re-wrap too');
	assert.equal(place.holding(), true, 'and the hold is still running');
	assert.equal(page.asked.length, 0);
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
