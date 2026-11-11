/**
 * staticSurface.js — the static half of surface.js's contract: one object over the static view's
 * stores (staticCodeStore.js, one per language) and the element they are drawn in
 * (StaticBox.jsx makes it, in a layout effect, and hands it to the shell). ONE surface serves
 * every language: `currentStore()` is asked for the shown language's store on each call, so a
 * language switch changes nothing here.
 *
 *     const surface = createStaticSurface({ currentStore: () => stores.storeFor(language), host });
 *
 * WHAT EACH MEMBER DOES HERE (the contract: surface.js)
 *   - the text and the marks go to the current store (getValue, lineCount, setValue → setText,
 *     marks.set → setMarks, showStep, flash; marks.dispose does nothing: the stores outlive the
 *     surface);
 *   - onDidChange(fn): fn({}) after each change of a store's TEXT (not of its folds or marks);
 *     every store that has been current is watched, so a change in a language shown earlier is
 *     heard too;
 *   - reveal(ranges): opens the closed folds hiding one of the lines (the store's
 *     openFoldsHiding) and waits a frame for the lines to be drawn (folding.js > nextFrame);
 *     true when the ranges are within the code. Nothing scrolls: the page is the only scroller,
 *     and the follow-up (CodeRef/goToEditor.js > keepLinesInWindow) scrolls IT;
 *   - revealSpan(ranges): [first, last] of the ranges within the code (every line fits: the
 *     page has no window of its own to cut them to);
 *   - linesBox([start, end]): the rects of the first and last VISIBLE line elements
 *     (`[data-line="n"]` inside the host; a line inside a closed fold is `hidden`), or null;
 *   - layoutSettled(): the next frame (the folds open in the next React commit);
 *   - markers: none (surface.js > noopMarkers): the static view draws no squiggles, the rows stay;
 *   - goTo(location): Go to line on an error row — open the fold over the line, flash it, then
 *     keep it in the page's window (`follow`: keepLinesInWindow, with this surface as the
 *     measurer); true;
 *   - focus(): the "Tap to edit" bar (`[data-touch-bar]`) when the box has one, else nothing —
 *     WITHOUT scrolling (`preventScroll`): the page is the only scroller and the bar may sit
 *     below the window, so a plain focus() after Reset would throw the page down to it
 *     (2026-10-26, measured on a phone); the shell focuses after Reset, Clear and the Solution
 *     panel's buttons for Monaco's undo, which the static view has no use for;
 *   - domNode(): the host; hasModel(): true.
 * `win` / `doc` default to the browser's (the tests pass fakes); `follow` for the tests.
 *
 * HOW TO CHANGE IT  A new member of the contract: surface.js first, then here and in
 * monacoSurface.js. What a reveal opens: staticCodeStore.js > openFoldsHiding.
 */

import { keepLinesInWindow } from './CodeRef/goToEditor.js';
import { rangesWithin, revealTarget } from './decorations.js';
import { nextFrame } from './folding.js';
import { SURFACE_KINDS, noopMarkers } from './surface.js';

/** The attribute of the "Tap to edit" bar (StaticBox.jsx > TouchBar). */
export const TOUCH_BAR_SELECTOR = '[data-touch-bar]';

/** The element of line `n` (StaticCode.jsx: div.line[data-line="n"]). */
function lineSelector(line) {
	return `[data-line="${line}"]`;
}

/** `ranges` cut to the code's lines and sorted by start ([] with nothing usable). */
function sortedWithin(ranges, lineCount) {
	return rangesWithin(ranges, lineCount).sort((a, b) => a[0] - b[0]);
}

/** `line` moved inside the code: at least 1, at most `lineCount`. */
function clampLine(line, lineCount) {
	if (!Number.isFinite(line) || line < 1) return 1;
	return Math.min(Math.floor(line), lineCount);
}

/** See the header. */
export function createStaticSurface({ currentStore, host, win = globalThis.window, doc = globalThis.document, follow = keepLinesInWindow }) {
	const watched = new Map(); // store -> its last text
	const listeners = new Set();

	/** The listeners told once about a store whose text changed since last seen. */
	function noticeTextChange(store) {
		const text = store.getSnapshot().text;
		if (watched.get(store) === text) return;
		watched.set(store, text);
		for (const listener of [...listeners]) listener({});
	}

	/** The current store, watched for text changes from now on. */
	function store() {
		const current = currentStore();
		if (!watched.has(current)) {
			watched.set(current, current.getSnapshot().text);
			current.subscribe(() => noticeTextChange(current));
		}
		return current;
	}

	/** The line elements start … end that are drawn now (not inside a closed fold). */
	function visibleLineElements([start, end]) {
		const elements = [];
		if (!host?.querySelector) return elements;
		for (let line = start; line <= end; line += 1) {
			const element = host.querySelector(lineSelector(line));
			if (element && !element.hidden) elements.push(element);
		}
		return elements;
	}

	function linesBox(span) {
		const elements = visibleLineElements(span);
		if (elements.length === 0) return null;
		const top = elements[0].getBoundingClientRect().top;
		const bottom = elements[elements.length - 1].getBoundingClientRect().bottom;
		return bottom > top ? { top, bottom } : null;
	}

	/** Open the folds hiding `ranges`; waits a frame when it opened one, so the lines are drawn. */
	async function reveal(ranges) {
		const current = store();
		const fitted = sortedWithin(ranges, current.lineCount());
		if (fitted.length === 0) return false;
		if (current.openFoldsHiding(fitted)) await nextFrame();
		return true;
	}

	function revealSpan(ranges) {
		const fitted = sortedWithin(ranges, store().lineCount());
		if (fitted.length === 0) return null;
		return revealTarget(fitted, Infinity);
	}

	const surface = {
		kind: SURFACE_KINDS.static,
		hasModel: () => true,
		domNode: () => host ?? null,
		getValue: () => store().getSnapshot().text,
		lineCount: () => store().lineCount(),
		setValue: (text) => store().setText(text),
		focus: () => host?.querySelector?.(TOUCH_BAR_SELECTOR)?.focus?.({ preventScroll: true }),
		onDidChange(listener) {
			store(); // the shown language is watched from the first listener on
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		marks: {
			set: (lineKinds) => store().setMarks(lineKinds),
			showStep: (ranges) => store().showStep(ranges),
			flash: (ranges) => store().flash(ranges),
			dispose() {},
		},
		reveal,
		revealSpan,
		linesBox,
		layoutSettled: () => nextFrame(),
		markers: noopMarkers(),
		async goTo(location) {
			const current = store();
			const line = clampLine(location?.line, current.lineCount());
			await reveal([[line, line]]);
			current.flash([[line, line]]);
			await follow(surface, [line, line], { win, doc });
			return true;
		},
	};
	return surface;
}
