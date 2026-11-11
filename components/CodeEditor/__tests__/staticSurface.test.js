/**
 * staticSurface.test.js — the static half of the contract (../staticSurface.js) over real
 * stores (staticCodeStore.js) and a fake host whose line elements have boxes: a whole surface
 * (isSurface); the text and the marks going to the CURRENT store (one surface, two languages);
 * onDidChange told on a text change only, in a language shown earlier too; reveal opening
 * exactly the folds that hide a line and waiting a frame, false outside the code; revealSpan;
 * linesBox skipping the hidden lines, null when none is drawn; layoutSettled; no markers; goTo
 * opening, flashing and following with the surface as the measurer; focus on the bar, with
 * preventScroll (the page must not jump to the bar after Reset).
 * Run with `npm run test:shared`.
 * To change it: a new member of the contract (../surface.js) gets a test here for its static half.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticCodeStore } from '../staticCodeStore.js';
import { createStaticSurface } from '../staticSurface.js';
import { SURFACE_KINDS, isSurface } from '../surface.js';

const PYTHON = 'def f():\n    a = 1\n    b = 2\n    return a + b\n\nprint(f())';
const GO = 'package main\n\nfunc main() {}';

/** A line element: 21 px tall from `top`; `hidden` as the attribute would make it. */
function lineElement(line, hidden) {
	const top = 100 + (line - 1) * 21;
	return { line, hidden, focused: 0, getBoundingClientRect: () => ({ top, bottom: top + 21, height: 21 }) };
}

/** A host over `store`: its lines' elements follow the store's folds; the bar is optional. */
function fakeHost(store, { bar = true } = {}) {
	const barElement = {
		focused: 0,
		options: null,
		focus(options) {
			this.focused += 1;
			this.options = options;
		},
	};
	return {
		barElement,
		querySelector(selector) {
			if (selector === '[data-touch-bar]') return bar ? barElement : null;
			const line = Number(selector.match(/\[data-line="(\d+)"\]/)?.[1]);
			if (!line || line > store.lineCount()) return null;
			return lineElement(line, store.isHidden(line));
		},
	};
}

/** Two stores, a host over the current one, and the surface over them; `follows` records the page follow-ups. */
function setup({ folds = [[1, 4]] } = {}) {
	const stores = { python: createStaticCodeStore({ text: PYTHON, foldRegions: folds }), go: createStaticCodeStore({ text: GO }) };
	const shown = { language: 'python' };
	const host = fakeHost({ lineCount: () => stores[shown.language].lineCount(), isHidden: (line) => stores[shown.language].isHidden(line) });
	const follows = [];
	const win = { name: 'win' };
	const doc = { name: 'doc' };
	const surface = createStaticSurface({
		currentStore: () => stores[shown.language],
		host,
		win,
		doc,
		follow: (measurer, span, options) => {
			follows.push({ measurer, span, options });
			return Promise.resolve();
		},
	});
	return { stores, shown, host, surface, follows, win, doc };
}

test('a whole surface of the static kind; always a model; the host is its node', () => {
	const { surface, host } = setup();
	assert.equal(isSurface(surface), true);
	assert.equal(surface.kind, SURFACE_KINDS.static);
	assert.equal(surface.hasModel(), true);
	assert.equal(surface.domNode(), host);
});

test('the text, the lines, setValue and the marks go to the CURRENT store: a language switch changes the store, not the surface', () => {
	const { surface, stores, shown } = setup();
	assert.equal(surface.getValue(), PYTHON);
	assert.equal(surface.lineCount(), 6);
	assert.equal(surface.marks.set({ 2: 'error', 9: 'error' }), 1);
	assert.deepEqual(stores.python.getSnapshot().lineKinds, { 2: 'error' });
	shown.language = 'go';
	assert.equal(surface.getValue(), GO);
	assert.equal(surface.lineCount(), 3);
	surface.setValue('package main');
	assert.equal(stores.go.getSnapshot().text, 'package main');
	assert.equal(stores.python.getSnapshot().text, PYTHON, 'the other language untouched');
	assert.equal(surface.marks.showStep([[1, 1]]), 1);
	assert.deepEqual([...stores.go.getSnapshot().stepLines], [1]);
	assert.equal(surface.marks.flash([[1, 1]]), 1);
	assert.equal(stores.go.getSnapshot().flash.token, 1);
	surface.marks.dispose();
	assert.deepEqual(stores.go.getSnapshot().lineKinds, {}, 'dispose takes nothing off: the stores outlive the surface');
});

test('onDidChange: told once per TEXT change, with an empty event, in a language shown earlier too; not for folds or marks; disposable', () => {
	const { surface, stores, shown } = setup();
	const events = [];
	const dispose = surface.onDidChange((event) => events.push(event));
	stores.python.toggleFold(0);
	stores.python.setMarks({ 1: 'add' });
	assert.deepEqual(events, [], 'folds and marks are not text changes');
	stores.python.setText('x = 1');
	assert.deepEqual(events, [{}]);
	shown.language = 'go';
	surface.getValue(); // the Go store is current now, and watched from here on
	shown.language = 'python';
	stores.go.setText('package main\n');
	assert.equal(events.length, 2, 'a change in a language shown earlier is heard');
	stores.go.setText('package main\n');
	assert.equal(events.length, 2, 'the same text again: not told');
	dispose();
	stores.python.setText('y = 2');
	assert.equal(events.length, 2);
});

test('reveal: opens exactly the folds hiding a line (and waits a frame), true within the code; false outside; revealSpan is [first, last]', async () => {
	const { surface, stores } = setup();
	assert.equal(await surface.reveal([[1, 1]]), true, 'line 1 is in the code');
	assert.equal(stores.python.getSnapshot().folds[0].open, false, "but it is the fold's own visible line: still closed");
	assert.equal(await surface.reveal([[3, 3]]), true);
	assert.equal(stores.python.getSnapshot().folds[0].open, true);
	assert.equal(await surface.reveal([[20, 30]]), false);
	assert.deepEqual(surface.revealSpan([[5, 6], [2, 3]]), [2, 6]);
	assert.equal(surface.revealSpan([[20, 30]]), null);
});

test('linesBox: the first and last DRAWN lines of the span; hidden lines skipped; null when none is drawn', () => {
	const { surface } = setup();
	assert.deepEqual(surface.linesBox([1, 6]), { top: 100, bottom: 100 + 6 * 21 });
	assert.deepEqual(surface.linesBox([2, 4]), null, 'lines 2-4 are inside the closed fold');
	assert.deepEqual(surface.linesBox([2, 5]), { top: 100 + 4 * 21, bottom: 100 + 5 * 21 }, 'only line 5 is drawn');
	assert.equal(surface.linesBox([10, 12]), null, 'past the code');
	const noHost = createStaticSurface({ currentStore: () => createStaticCodeStore({ text: 'x' }), host: null });
	assert.equal(noHost.linesBox([1, 1]), null);
	assert.equal(noHost.domNode(), null);
});

test('layoutSettled resolves (the next frame); the markers do nothing', async () => {
	const { surface } = setup();
	assert.equal(await surface.layoutSettled({}, 10), undefined);
	assert.equal(surface.markers.begin(), null);
	assert.equal(surface.markers.show([{ line: 1 }], null), 0);
	surface.markers.clear();
	surface.markers.watch().dispose();
});

test('goTo: opens the fold over the line, flashes it, then follows with the surface as the measurer (the window and document it was given); true', async () => {
	const { surface, stores, follows, win, doc } = setup();
	assert.equal(await surface.goTo({ line: 3, column: 5 }), true);
	assert.equal(stores.python.getSnapshot().folds[0].open, true);
	assert.deepEqual([...stores.python.getSnapshot().flash.lines], [3]);
	assert.equal(follows.length, 1);
	assert.equal(follows[0].measurer, surface);
	assert.deepEqual(follows[0].span, [3, 3]);
	assert.deepEqual(follows[0].options, { win, doc });
	assert.equal(await surface.goTo({ line: 99 }), true, 'a line past the end goes to the last line');
	assert.deepEqual(follows.at(-1).span, [6, 6]);
});

test('focus: the "Tap to edit" bar when the box has one, without scrolling the page to it; else nothing (and no throw)', () => {
	const { surface, host } = setup();
	surface.focus();
	assert.equal(host.barElement.focused, 1);
	assert.deepEqual(host.barElement.options, { preventScroll: true }, 'a plain focus() would scroll the page down to the bar after Reset (the page is the only scroller)');
	const readOnly = createStaticSurface({ currentStore: () => createStaticCodeStore({ text: 'x' }), host: fakeHost({ lineCount: () => 1, isHidden: () => false }, { bar: false }) });
	assert.doesNotThrow(() => readOnly.focus());
});
