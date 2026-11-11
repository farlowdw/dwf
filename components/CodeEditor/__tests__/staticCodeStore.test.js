/**
 * staticCodeStore.test.js — the static view's store (../staticCodeStore.js): the lines as
 * Monaco counts them, the folds checked by the library and closed, what a reveal opens (exactly
 * the closed folds that HIDE a line), toggle / close, what setText drops, the marks, the step,
 * the flash (a new token per call, cleared after FLASH_MS with node's mock timers), the
 * subscription, and a snapshot that keeps its identity when nothing changed.
 * Run with `npm run test:shared`.
 * To change it: a new rule of ../staticCodeStore.js gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FLASH_MS, LINE_KINDS } from '../decorations.js';
import { EMPTY_FLASH, createStaticCodeStore, foldsHiding, hiddenLinesOf, splitLines } from '../staticCodeStore.js';

/** Twelve lines, then a final newline (line 13 is empty, as Monaco counts it). */
const CODE = `${Array.from({ length: 12 }, (_, index) => `line_${index + 1} = ${index + 1}`).join('\n')}\n`;

/** A store over CODE with the given folds, its warnings and timers recorded. */
function storeOf(foldRegions = [], { text = CODE, lineKinds = {} } = {}) {
	const warnings = [];
	const timers = [];
	const store = createStaticCodeStore({
		text,
		foldRegions,
		lineKinds,
		warn: (message) => warnings.push(message),
		setTimer: (callback, ms) => {
			timers.push({ callback, ms });
			return timers.length;
		},
		clearTimer: (id) => {
			if (id) timers[id - 1].cleared = true;
		},
	});
	return { store, warnings, timers };
}

test('splitLines: Monaco\'s count — an empty text is one line, a final newline makes one more', () => {
	assert.deepEqual(splitLines(''), ['']);
	assert.deepEqual(splitLines('a'), ['a']);
	assert.deepEqual(splitLines('a\nb\n'), ['a', 'b', '']);
	assert.deepEqual(splitLines(undefined), ['']);
});

test('the snapshot starts with the text, its lines, the folds closed, the usable marks, no step, no flash', () => {
	const { store } = storeOf([[1, 4]], { lineKinds: { 2: 'error', 99: 'error', 3: 'bogus' } });
	const snapshot = store.getSnapshot();
	assert.equal(snapshot.text, CODE);
	assert.equal(snapshot.lines.length, 13);
	assert.deepEqual(snapshot.folds, [{ start: 1, end: 4, open: false }]);
	assert.deepEqual(snapshot.lineKinds, { 2: 'error' }, 'a line the code lacks and an unknown kind are dropped');
	assert.deepEqual([...snapshot.stepLines], []);
	assert.equal(snapshot.flash, EMPTY_FLASH);
	assert.equal(store.lineCount(), 13);
});

test('setFolds: the regions go through the library (clamped, dropped, with warnings) and close; nested folds hide their lines once', () => {
	const { store, warnings } = storeOf();
	store.setFolds([[1, 13], [3, 3], [2, 5], [4, 5]]);
	assert.deepEqual(store.getSnapshot().folds, [
		{ start: 1, end: 12, open: false },
		{ start: 2, end: 5, open: false },
		{ start: 4, end: 5, open: false },
	]);
	assert.equal(warnings.length, 2, '[1, 13] clamped to the last foldable line, [3, 3] dropped');
	const hidden = hiddenLinesOf(store.getSnapshot().folds);
	assert.deepEqual([...hidden].sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'each line once');
	assert.equal(store.isHidden(1), false);
	assert.equal(store.isHidden(5), true);
	assert.equal(store.isHidden(13), false);
});

test('foldsHiding / openFoldsHiding: exactly the closed folds whose hidden lines include a line; a fold whose first line is the target stays closed', () => {
	const folds = [
		{ start: 1, end: 6, open: false },
		{ start: 8, end: 10, open: false },
		{ start: 11, end: 12, open: true },
	];
	assert.deepEqual(foldsHiding(folds, [[1, 1]]), [], "line 1 is the first fold's own, visible line");
	assert.deepEqual(foldsHiding(folds, [[3, 3]]), [0]);
	assert.deepEqual(foldsHiding(folds, [[3, 9]]), [0, 1]);
	assert.deepEqual(foldsHiding(folds, [[12, 12]]), [], 'an open fold hides nothing');
	assert.deepEqual(foldsHiding(folds, [[7, 7], [13, 20]]), []);

	const { store } = storeOf([[1, 6]]);
	const before = store.getSnapshot();
	assert.equal(store.openFoldsHiding([[1, 1]]), false);
	assert.equal(store.getSnapshot(), before, 'nothing changed: the same snapshot');
	assert.equal(store.openFoldsHiding([[3, 3]]), true);
	assert.deepEqual(store.getSnapshot().folds, [{ start: 1, end: 6, open: true }]);
	assert.equal(store.openFoldsHiding([[3, 3]]), false, 'already open');
});

test('toggleFold and closeFolds', () => {
	const { store } = storeOf([[1, 3], [5, 7]]);
	store.toggleFold(1);
	assert.deepEqual(store.getSnapshot().folds.map((fold) => fold.open), [false, true]);
	store.toggleFold(1);
	assert.deepEqual(store.getSnapshot().folds.map((fold) => fold.open), [false, false]);
	const closed = store.getSnapshot();
	store.toggleFold(5);
	assert.equal(store.getSnapshot(), closed, 'no such fold: nothing changed');
	store.closeFolds();
	assert.equal(store.getSnapshot(), closed, 'all closed already: the same snapshot');
	store.toggleFold(0);
	store.toggleFold(1);
	store.closeFolds();
	assert.deepEqual(store.getSnapshot().folds.map((fold) => fold.open), [false, false]);
});

test('setText: the lines re-split, the folds and the marks dropped (their numbers described the old text)', () => {
	const { store } = storeOf([[1, 3]], { lineKinds: { 2: 'highlight' } });
	store.setText('a\nb');
	const snapshot = store.getSnapshot();
	assert.deepEqual(snapshot.lines, ['a', 'b']);
	assert.deepEqual(snapshot.folds, []);
	assert.deepEqual(snapshot.lineKinds, {});
	assert.equal(store.lineCount(), 2);
	const same = store.getSnapshot();
	store.setText('a\nb');
	assert.equal(store.getSnapshot(), same, 'the same text, nothing to drop: the same snapshot');
	store.setText(undefined);
	assert.equal(store.getSnapshot().text, '', 'not a string: empty');
});

test('setMarks, showStep: cut to the code and to the known kinds; the count comes back; nothing changes for the same marks', () => {
	const { store } = storeOf();
	assert.equal(store.setMarks({ 3: 'error', 4: 'success', 13: 'add', 14: 'add', x: 'error', 5: 'glow' }), 3);
	assert.deepEqual(store.getSnapshot().lineKinds, { 3: 'error', 4: 'success', 13: 'add' });
	const marked = store.getSnapshot();
	store.setMarks({ 3: 'error', 4: 'success', 13: 'add' });
	assert.equal(store.getSnapshot(), marked);
	assert.equal(store.setMarks(null), 0);
	assert.deepEqual(store.getSnapshot().lineKinds, {});
	assert.equal(store.showStep([[4, 6], [12, 20]]), 5);
	assert.deepEqual([...store.getSnapshot().stepLines].sort((a, b) => a - b), [4, 5, 6, 12, 13]);
	const stepped = store.getSnapshot();
	store.showStep([[4, 6], [12, 20]]);
	assert.equal(store.getSnapshot(), stepped);
	assert.equal(store.showStep([]), 0);
	assert.deepEqual([...store.getSnapshot().stepLines], []);
	for (const kind of LINE_KINDS) assert.equal(store.setMarks({ 1: kind }), 1, `${kind} is a kind the store keeps`);
});

test('flash: the lines with a new token per call, ended after FLASH_MS (or by the next flash); none for lines outside the code', () => {
	const { store, timers } = storeOf();
	assert.equal(store.flash([[2, 3]]), 2);
	let flash = store.getSnapshot().flash;
	assert.deepEqual([...flash.lines], [2, 3]);
	assert.equal(flash.token, 1);
	assert.equal(timers.at(-1).ms, FLASH_MS);
	assert.equal(store.flash([[2, 3]]), 2);
	flash = store.getSnapshot().flash;
	assert.equal(flash.token, 2, 'the same lines again: a new token, so the animation starts again');
	assert.equal(timers[0].cleared, true, "the first flash's timer was cleared");
	timers.at(-1).callback();
	assert.equal(store.getSnapshot().flash, EMPTY_FLASH, 'ended after FLASH_MS');
	assert.equal(store.flash([[40, 50]]), 0);
	assert.equal(store.getSnapshot().flash, EMPTY_FLASH);
});

test('subscribe: told on each change, not after unsubscribing; subscribe and getSnapshot keep their identity', () => {
	const { store } = storeOf([[1, 3]]);
	let told = 0;
	const stop = store.subscribe(() => (told += 1));
	store.toggleFold(0);
	store.setMarks({ 1: 'error' });
	assert.equal(told, 2);
	store.setMarks({ 1: 'error' });
	assert.equal(told, 2, 'nothing changed: not told');
	stop();
	store.toggleFold(0);
	assert.equal(told, 2);
	assert.equal(store.subscribe, store.subscribe);
	assert.equal(store.getSnapshot, store.getSnapshot);
});
