/**
 * shared/theme/DocRoot/Layout/Sidebar/readingPlace.js — keeps the reader's place while the docs
 * sidebar collapses or expands. Called by the wrapper beside it (index.jsx) from every collapse and
 * expand.
 *
 * THE PROBLEM  Collapsing the sidebar ("⇤" at its foot) widens the doc's column: Docusaurus
 *   animates the sidebar's width for 200 ms and the column follows, frame by frame (on a window
 *   wider than about 1,640 px, where the column's own cap decides, it widens at once). Expanding
 *   narrows the column at once. Every paragraph ABOVE the window re-wraps, so the page under the
 *   reader moves: 40 px on a short demo page, 650–970 px on a long notes page at 1280 px wide, up to
 *   1,350 px at the iPad's landscape width (measured 2026-10-21). The browser's own scroll
 *   anchoring, made for exactly this, did nothing: it anchored on the sidebar's <aside> (the
 *   first element partly in view, in reading order; as tall as the page), which never moves —
 *   styles.module.css takes the aside out of it. Even then the browser would not correct a
 *   toggle's FIRST frame: both directions change max-width on <main> and its .container in that
 *   frame, a "suppression trigger" (CSS Scroll Anchoring) the browser leaves alone by design — and
 *   the whole expand happens in it (the whole collapse too, on a wide window). Safari before 27
 *   has no scroll anchoring at all. So the hold below does it. (Upstream: facebook/docusaurus#7918,
 *   closed 2026-10-16 as working as designed.)
 *
 * WHAT IT DOES  At the toggle, before React redraws anything: find the reading anchor
 *   (findReadingAnchor: the first block of the doc that starts at or below the reading line —
 *   the navbar's bottom edge, the window's top while the navbar is hidden — or the block the line
 *   crosses when nothing starts in view) and note where it is on the screen. Then, every frame
 *   for HOLD_MS (counted from the first frame, which always corrects), scroll the window to the
 *   place that puts it back there, before the frame is drawn. The text re-wraps around a page that
 *   otherwise stays put. A second toggle during the hold keeps the same place a little longer.
 *   Meanwhile the hold is the only thing that moves the page: the browser's own scroll anchoring
 *   is paused (it would hold another element), and Docusaurus's scroll events are off (the wrapper
 *   hands over its scroll controller), so the hide-on-scroll navbar and the back-to-top button do
 *   not take the corrections for the reader's scrolling. Every way out puts both back (the scroll
 *   events one frame later, after the last correction's scroll event: see stop()).
 *
 * NEVER AGAINST THE READER  their own wheel, touch, key or mouse press ends the hold at once,
 *   except a press inside the sidebar: that is the toggle again, or a link that leaves the page
 *   (the hold ends when its anchor is gone).
 *   Any scroll to a place the hold did not put the page (a dragged scrollbar, Space on the expand
 *   strip) ends it too.
 *
 * LATE REPORTS (the iPad)  On an iPad the system scrolls the page, outside the page, and tells
 *   the page its position a moment later. So in the frame after one of the hold's own scrolls the
 *   browser may report a position from before it: where the toggle began, or where an earlier
 *   correction left the page. Every position the hold started from, sent the page to or found it
 *   at is therefore its own for as long as it lasts (run.made): such a frame does not end the
 *   hold, and it asks for the same place again. That is why a correction names a PLACE
 *   (window.scrollTo), never a distance: an iPad's system adds a distance (window.scrollBy) to
 *   its own position, so a distance asked twice would move the page twice; a place asked twice is
 *   one place. (Until 2026-11 only the last position counted and a correction was a distance.
 *   On an iPad a collapse then lost its later corrections, a line or more of the place each
 *   time, while an expand, which needs one correction, kept it: seen on a device on 2026-11-11,
 *   and gone there with this change. That the cause is a late report is read from WebKit's
 *   source, where the system's reports reach the page on a path of their own; it was not
 *   measured on the device.)
 *
 * KNOWN LIMIT  Docusaurus does not note the scroll position while its scroll events are off, so
 *   the reader's FIRST scroll after a toggle is compared with the position from before it: the
 *   hide-on-scroll navbar may take one scroll event's wrong direction (peek in, or start to hide),
 *   and the back-to-top button flash in or out, until the next scroll event puts them right.
 *   Docusaurus's own Tabs have the same flaw; there is no way to update its private note from
 *   outside without it seeing the whole correction as a scroll.
 *
 * HOW TO CHANGE IT
 *   How long: HOLD_MS. What counts as the reader scrolling: USER_SCROLL_EVENTS, and any position
 *   that is not the hold's own (scrolledByOthers, run.made). Where the reading
 *   line is: readingLine() (NAVBAR_SELECTOR). Which block is the anchor: findReadingAnchor() and
 *   UNANCHORED_POSITIONS. Tests: __tests__/readingPlace.test.js (npm run test:shared), with
 *   invented boxes and a hand-run clock; __tests__/docusaurusContract.test.js checks the
 *   Docusaurus internals this relies on.
 */

/** How long (ms) after a collapse or an expand the place is held: the sidebar animates for 200 ms (Infima's --ifm-transition-fast), so a slow frame or two cannot outlast it. */
export const HOLD_MS = 600;

/** A movement (px) smaller than this is left alone: sub-pixel rounding, nothing a reader sees. */
export const TOLERANCE_PX = 1;

/** The reader scrolling by themselves: any of these ends the hold at once (but see PRESS_EVENTS). */
export const USER_SCROLL_EVENTS = Object.freeze(['wheel', 'touchstart', 'keydown', 'mousedown']);

/** Presses that do NOT end the hold when they land inside the sidebar (the toggle pressed again). */
const PRESS_EVENTS = new Set(['mousedown', 'touchstart']);

/** The docs sidebar's column (ThemeClassNames.docs.docSidebarContainer). */
export const SIDEBAR_SELECTOR = '.theme-doc-sidebar-container';

/** Where the anchor is looked for: the docs layout's one <main> (the doc, its table-of-contents column, its paginator). */
export const CONTENT_SELECTOR = 'main';

/** The navbar: its bottom edge is the reading line. */
export const NAVBAR_SELECTOR = '.navbar';

/** Positions whose boxes do not move with the text, or sit over it: never an anchor, never searched. */
const UNANCHORED_POSITIONS = new Set(['sticky', 'fixed', 'absolute']);

/** The finder's view of an element; the tests pass invented boxes and styles. */
const BROWSER_LOOK = Object.freeze({
	boxOf: (element) => element.getBoundingClientRect(),
	styleOf: (element) => getComputedStyle(element),
});

/** Can an element with this computed style be an anchor? Blocks only: inline words and links move sideways when a line re-wraps. */
function isBlock(style) {
	return !style.display.startsWith('inline') && !UNANCHORED_POSITIONS.has(style.position);
}

/**
 * The walk under `parent`, in reading order: { start } is the first block that starts in view
 * (its top at or below `line`, above `bottom`), searched inside a block the line crosses before
 * the blocks after it; otherwise { start: null, crossing } with the deepest block the line
 * crosses (null when there is none). Siblings are taken to be stacked, as a doc's blocks are:
 * the first one below the window ends the walk.
 */
function walk(parent, line, bottom, look) {
	let crossing = null;
	for (const child of parent.children) {
		const style = look.styleOf(child);
		if (style.display === 'none') continue;
		if (style.display === 'contents') {
			// no box of its own: its children stand where it is
			const inside = walk(child, line, bottom, look);
			if (inside.start) return inside;
			crossing = crossing ?? inside.crossing;
			continue;
		}
		if (!isBlock(style)) continue;
		const box = look.boxOf(child);
		if (box.height === 0 || box.bottom <= line) continue; // empty, or wholly above the line
		if (box.top >= bottom) break; // below the window, and so is everything after it
		if (box.top >= line) return { start: child, crossing };
		const inside = walk(child, line, bottom, look); // the line crosses it: look inside first
		if (inside.start) return inside;
		crossing = crossing ?? inside.crossing ?? child;
	}
	return { start: null, crossing };
}

/**
 * The element whose place on the screen stands for the reader's place, inside `root`: the first
 * block that starts at or below the reading line `line` and above `bottom` (px from the window's
 * top); when nothing starts in view (one long code block fills the window), the deepest block
 * the line crosses. Null when there is neither.
 */
export function findReadingAnchor(root, line, bottom, look = BROWSER_LOOK) {
	const found = walk(root, line, bottom, look);
	return found.start ?? found.crossing;
}

/** The reading line (px from the window's top): the navbar's bottom edge, or the window's top while the navbar is hidden. */
export function readingLine() {
	const navbar = document.querySelector(NAVBAR_SELECTOR);
	return navbar ? Math.max(0, navbar.getBoundingClientRect().bottom) : 0;
}

/** Turns the browser's own scroll anchoring off for the whole page; returns the function that puts it back. */
function pauseNativeAnchoring() {
	const { style } = document.body;
	const before = style.overflowAnchor;
	style.overflowAnchor = 'none';
	return () => {
		style.overflowAnchor = before;
	};
}

/** The browser's side of a hold; the tests pass a hand-run clock, frames they step and a record of the scrolling. It scrolls to a place only: see LATE REPORTS. */
function browserEnv() {
	return {
		now: () => performance.now(),
		nextFrame: (callback) => requestAnimationFrame(callback),
		scrollTo: (top) => window.scrollTo({ top, behavior: 'instant' }),
		scrollY: () => window.scrollY,
		maxScrollY: () => document.documentElement.scrollHeight - window.innerHeight,
		listen: (type, handler) => window.addEventListener(type, handler, { capture: true, passive: true }),
		unlisten: (type, handler) => window.removeEventListener(type, handler, { capture: true }),
		pauseNativeAnchoring,
		findAnchor: () => {
			const content = document.querySelector(CONTENT_SELECTOR);
			return content ? findReadingAnchor(content, readingLine(), window.innerHeight) : null;
		},
	};
}

/** Does this event mean the reader is scrolling by themselves? A press inside the sidebar does not. */
function isOwnersScroll(event) {
	return !(PRESS_EVENTS.has(event.type) && event.target?.closest?.(SIDEBAR_SELECTOR));
}

/**
 * A holder of the reading place: { hold(scrollController) } starts a hold (or lengthens the one in
 * progress); { holding() } says whether one is in progress. `scrollController` is Docusaurus's
 * (useScrollController): its scroll events are off during a hold and on again after it.
 */
export function createReadingPlace(env = browserEnv()) {
	let current = null; // the hold in progress: { anchor, top, until, made, scrollController, restoreAnchoring, onInput }

	/**
	 * Ends `run` (if it is still the hold in progress) and puts back everything it turned off.
	 * Docusaurus's scroll events come back one frame later: the browser sends the scroll event of
	 * the last correction at the start of the next frame, before its callbacks, and it must not be
	 * taken for the reader's (a key or a click can end the hold between a correction and that
	 * event). A hold begun in the meantime keeps them off; it turns them on when it ends.
	 */
	function stop(run) {
		if (current !== run) return;
		current = null;
		USER_SCROLL_EVENTS.forEach((type) => env.unlisten(type, run.onInput));
		run.restoreAnchoring();
		env.nextFrame(() => {
			if (current === null) run.scrollController.enableScrollEvents();
		});
	}

	/**
	 * Did something other than the hold scroll the page? Not while the page is at a position of the
	 * hold's own (run.made: on an iPad an earlier one comes back for a frame, see LATE REPORTS), and
	 * not when a page that got shorter under the window was clamped by the browser: not the reader.
	 */
	function scrolledByOthers(run) {
		const scrollY = env.scrollY();
		if (scrollY >= env.maxScrollY() - TOLERANCE_PX) return false;
		for (const made of run.made) {
			if (Math.abs(scrollY - made) < TOLERANCE_PX) return false;
		}
		return true;
	}

	/** Undoes the anchor's movement since the toggle, and notes the positions that makes the hold's own. */
	function correct(run) {
		const moved = run.anchor.getBoundingClientRect().top - run.top;
		if (Math.abs(moved) >= TOLERANCE_PX) {
			const place = env.scrollY() + moved; // a place, not a distance (LATE REPORTS): measured in a frame that began at an older position, it is still the right place
			run.made.add(place); // where the page is sent
			env.scrollTo(place);
		}
		run.made.add(env.scrollY()); // where the browser says the page is now: a whole pixel, or an end of the page
	}

	/** One frame of the hold: stop (time is up, the anchor left the page, or something else scrolled it), or correct and ask for the next frame. */
	function step(run) {
		const first = run.until === null;
		if (first) run.until = env.now() + HOLD_MS;
		const over = !first && env.now() >= run.until;
		if (over || !run.anchor.isConnected || scrolledByOthers(run)) {
			stop(run);
			return;
		}
		correct(run);
		env.nextFrame(() => frame(run));
	}

	function frame(run) {
		if (current !== run) return;
		try {
			step(run);
		} catch (error) {
			stop(run); // never leave the navbar's scroll events or the browser's anchoring off
			throw error;
		}
	}

	function hold(scrollController) {
		if (current) {
			if (current.until !== null) current.until = env.now() + HOLD_MS;
			return;
		}
		const anchor = env.findAnchor();
		if (!anchor) return;
		const run = { anchor, top: anchor.getBoundingClientRect().top, until: null, made: new Set([env.scrollY()]), scrollController };
		run.onInput = (event) => {
			if (isOwnersScroll(event)) stop(run);
		};
		current = run;
		scrollController.disableScrollEvents();
		run.restoreAnchoring = env.pauseNativeAnchoring();
		USER_SCROLL_EVENTS.forEach((type) => env.listen(type, run.onInput));
		env.nextFrame(() => frame(run));
	}

	return { hold, holding: () => current !== null };
}

let shared = null; // the page's one holder, made on first use (never during the server render)

/** Holds the reader's place from now: the wrapper calls it from every collapse and expand, before the change. */
export function holdReadingPlace(scrollController) {
	shared = shared ?? createReadingPlace();
	shared.hold(scrollController);
}
