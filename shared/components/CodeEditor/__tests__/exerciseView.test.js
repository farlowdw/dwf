/**
 * exerciseView.test.js — the pure logic behind the exercise panels (../exerciseView.js): the small
 * output diff (from the reader's output to the expected one: the reader's lines removed, the
 * expected ones added, the reader's first in each run of changes; changed lines, a little
 * context, skip rows for long matching runs, a cap with a "more" row; nothing when the outputs
 * match), the verdict, a check run's cases and tally, how
 * a check value is written, when a check passes (finished, every case, no type error, something
 * checked), a check's error output (the compiler's, else the run's stderr), the hints prop, and
 * the hints area's state (2026-10-26): the light bulb's toggle (the first open reveals hint 1, a
 * close keeps everything for the reopen, the bulb never reveals more), "Show hint N of M"
 * (reveal-next, unfolded, read out), a hint's eye (fold / unfold; folding the hint the live
 * region holds empties it), what a close and a reopen read out, and where the focus goes after
 * a "Show hint" press (focusAfterReveal: the button, or the last hint's eye). Run with
 * `npm run test:shared`.
 * To change it: a new rule of ../exerciseView.js gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	CHECK_STATES,
	DIFF_CONTEXT_LINES,
	DIFF_MAX_ROWS,
	DIFF_SIDES,
	FOCUS_AFTER_REVEAL,
	LIBRARY_TO_ROW_KIND,
	HINTS_START,
	ROW_KINDS,
	checkCases,
	checkErrorOutput,
	checkOutcome,
	checkTally,
	clampRevealed,
	diffRows,
	focusAfterReveal,
	formatCheckValue,
	hasText,
	hintsStateOf,
	nextHintNumber,
	normalizeHints,
	outputVerdict,
	revealNextHint,
	toggleHintFold,
	toggleHintsArea,
	typeErrorsOf,
} from '../exerciseView.js';

/** A diff entry as the library's compareOutput gives it ('removed': expected only; 'added': the reader's only). */
const same = (text) => ({ type: 'same', text });
const added = (text) => ({ type: 'added', text });
const removed = (text) => ({ type: 'removed', text });

/** `count` matching lines named line-<from> … */
function sameLines(count, from = 1) {
	return Array.from({ length: count }, (_, index) => same(`line-${from + index}`));
}

/** A finished run's summary (the library's summarizeResult shape, only what is read). */
const SUCCESS = Object.freeze({ status: 'success', stage: 'run', output: '' });

test('diffRows: matching outputs, no diff or a broken one give no rows', () => {
	assert.deepEqual(diffRows([same('a'), same('b')]), []);
	assert.deepEqual(diffRows([]), []);
	assert.deepEqual(diffRows(null), []);
	assert.deepEqual(diffRows([{ type: 'added' }, 'x', null]), [], 'entries without text are ignored');
});

test('diffRows: a change in a long output shows the change, its context, and skip rows for the rest', () => {
	assert.equal(DIFF_CONTEXT_LINES, 2);
	const diff = [...sameLines(10), removed('6'), added('7'), ...sameLines(10, 11)];
	assert.deepEqual(diffRows(diff), [
		{ kind: ROW_KINDS.skip, count: 8 },
		{ kind: ROW_KINDS.same, text: 'line-9' },
		{ kind: ROW_KINDS.same, text: 'line-10' },
		{ kind: ROW_KINDS.removed, text: '7' },
		{ kind: ROW_KINDS.added, text: '6' },
		{ kind: ROW_KINDS.same, text: 'line-11' },
		{ kind: ROW_KINDS.same, text: 'line-12' },
		{ kind: ROW_KINDS.skip, count: 8 },
	]);
});

test('diffRows: a hidden run of one line is shown as it is (a skip row would be as tall)', () => {
	const diff = [...sameLines(3), added('x')];
	assert.deepEqual(diffRows(diff), [
		{ kind: ROW_KINDS.same, text: 'line-1' },
		{ kind: ROW_KINDS.same, text: 'line-2' },
		{ kind: ROW_KINDS.same, text: 'line-3' },
		{ kind: ROW_KINDS.removed, text: 'x' },
	]);
});

test('diffRows: two changes close together share their context; the context option is honoured', () => {
	const diff = [same('a'), removed('b'), same('c'), same('d'), same('e'), added('f'), same('g')];
	assert.deepEqual(
		diffRows(diff).map((row) => row.kind),
		['same', 'added', 'same', 'same', 'same', 'removed', 'same'],
	);
	const tight = diffRows([...sameLines(5), removed('x'), ...sameLines(5, 6)], { context: 0 });
	assert.deepEqual(tight, [
		{ kind: ROW_KINDS.skip, count: 5 },
		{ kind: ROW_KINDS.added, text: 'x' },
		{ kind: ROW_KINDS.skip, count: 5 },
	]);
});

test('diffRows: at most DIFF_MAX_ROWS rows, the rest one "more" row that counts the lines left', () => {
	assert.equal(DIFF_MAX_ROWS, 40);
	const diff = Array.from({ length: 50 }, (_, index) => added(`out-${index}`));
	const rows = diffRows(diff);
	assert.equal(rows.length, DIFF_MAX_ROWS + 1);
	assert.deepEqual(rows.at(-1), { kind: ROW_KINDS.more, count: 10 });
	const withSkip = diffRows([added('a'), added('b'), ...sameLines(20), added('c')], { maxRows: 4 });
	// a, b, line-1, line-2 | skip (16 lines), line-19, line-20, c: the rows left out stand for 19 lines
	assert.deepEqual(withSkip.at(-1), { kind: ROW_KINDS.more, count: 19 }, 'a skip row left out counts its lines');
});

test('the diff sides: from the reader\'s output to the expected one (− yours, + expected), the library\'s types flipped', () => {
	assert.deepEqual({ ...DIFF_SIDES }, { removed: 'yours', added: 'expected' });
	assert.deepEqual({ ...LIBRARY_TO_ROW_KIND }, { same: 'same', added: 'removed', removed: 'added' });
});

test('diffRows: in each run of changes the reader\'s lines come first, then the expected ones, each in its own order', () => {
	const pair = diffRows([same('a'), removed('e1'), removed('e2'), added('r1'), added('r2'), same('z')]);
	assert.deepEqual(pair, [
		{ kind: ROW_KINDS.same, text: 'a' },
		{ kind: ROW_KINDS.removed, text: 'r1' },
		{ kind: ROW_KINDS.removed, text: 'r2' },
		{ kind: ROW_KINDS.added, text: 'e1' },
		{ kind: ROW_KINDS.added, text: 'e2' },
		{ kind: ROW_KINDS.same, text: 'z' },
	]);
	const interleaved = diffRows([removed('e1'), added('r1'), removed('e2'), added('r2')]);
	assert.deepEqual(interleaved.map((row) => row.text), ['r1', 'r2', 'e1', 'e2'], 'an LCS tie order evened out');
	const twoRuns = diffRows([removed('e1'), added('r1'), same('m'), removed('e2'), added('r2')]);
	assert.deepEqual(twoRuns.map((row) => `${row.kind}:${row.text}`), ['removed:r1', 'added:e1', 'same:m', 'removed:r2', 'added:e2'], 'a matching line ends a run');
	const bounded = diffRows([same('top'), removed('e0'), removed('e1'), removed('e2'), added('a0'), added('a1'), same('end')]);
	assert.deepEqual(bounded.map((row) => row.text), ['top', 'a0', 'a1', 'e0', 'e1', 'e2', 'end'], "the library's bounded fallback (all removed, then all added)");
	assert.deepEqual(diffRows([{ type: 'odd', text: 'x' }, added('r')]).map((row) => row.kind), ['odd', 'removed'], 'an unknown type passes through');
});

test('outputVerdict: matches, differs from a line, differs without a line, nothing', () => {
	assert.equal(outputVerdict(null), null);
	assert.deepEqual(outputVerdict({ matches: true, firstDifferentLine: null, diff: [] }), { matches: true });
	assert.deepEqual(outputVerdict({ matches: false, firstDifferentLine: 3, diff: [] }), { matches: false, line: 3 });
	assert.deepEqual(outputVerdict({ matches: false, firstDifferentLine: 0 }), { matches: false, line: null });
});

test('formatCheckValue: strings as the helper wrote them, the rest JSON-like with spaces', () => {
	assert.equal(formatCheckValue("'abc'"), "'abc'");
	assert.equal(formatCheckValue('[0, 1]'), '[0, 1]');
	assert.equal(formatCheckValue([0, 1]), '[0, 1]');
	assert.equal(formatCheckValue([['a', 1], [true, null]]), '[["a", 1], [true, null]]');
	assert.equal(formatCheckValue({ a: 1, b: [2] }), '{"a": 1, "b": [2]}');
	assert.equal(formatCheckValue(3.5), '3.5');
	assert.equal(formatCheckValue(false), 'false');
	assert.equal(formatCheckValue(null), 'null');
	assert.equal(formatCheckValue(undefined), 'undefined');
});

test('checkCases / checkTally: cases made safe to draw; the library\'s counts, or counted', () => {
	const results = {
		cases: [
			{ name: 'two_sum([2, 7], 9)', pass: true, got: '[0, 1]', expected: '[0, 1]' },
			{ name: '  ', pass: false, got: 1, expected: 2 },
			null,
		],
		passed: 1,
		total: 3,
		otherOutput: '',
	};
	assert.deepEqual(checkCases(results), [
		{ index: 1, name: 'two_sum([2, 7], 9)', pass: true, got: '[0, 1]', expected: '[0, 1]' },
		{ index: 2, name: null, pass: false, got: '1', expected: '2' },
		{ index: 3, name: null, pass: false, got: 'undefined', expected: 'undefined' },
	]);
	assert.deepEqual(checkTally(results), { passed: 1, total: 3 });
	assert.deepEqual(checkTally({ cases: [{ pass: true }, { pass: false }] }), { passed: 1, total: 2 }, 'counted when the library gives no counts');
	assert.deepEqual(checkTally(null), { passed: 0, total: 0 });
	assert.deepEqual(checkCases(undefined), []);
});

test("typeErrorsOf: typeCheckOnly's diagnostics (errors only), each with its line's source", () => {
	assert.deepEqual(typeErrorsOf(null), []);
	const typeCheck = {
		ok: false,
		errorCount: 2,
		diagnostics: [
			{ line: 2, column: 11, message: "Type 'false' does not satisfy the constraint 'true'.", category: 'error', inHarness: true },
			{ line: 1, column: 7, message: "'unused' is declared but never used.", category: 'suggestion', inHarness: false },
			{ line: 3, column: 5, message: "Type 'string' is not assignable to type 'number'.", category: 'error', inHarness: false },
		],
	};
	const sources = { readerCode: 'function sum(a: number) {\r\n  let x = 1;\r\n  x = "1";\r\n}', harness: 'const r = sum(1);\n  type t = [Expect<Equal<typeof r, string>>];  \n' };
	assert.deepEqual(typeErrorsOf(typeCheck, sources), [
		{ message: "Type 'false' does not satisfy the constraint 'true'.", line: 2, inHarness: true, lineText: 'type t = [Expect<Equal<typeof r, string>>];' },
		{ message: "Type 'string' is not assignable to type 'number'.", line: 3, inHarness: false, lineText: 'x = "1";' },
	]);
	assert.deepEqual(typeErrorsOf(typeCheck).map((error) => error.lineText), ['', ''], 'no sources: no line text');
});

test('typeErrorsOf: a plain errors list works too (its own lineText wins); bad lines are null', () => {
	assert.deepEqual(typeErrorsOf({ errors: [{ message: 'x', line: 0, lineText: '  a ' }, { message: 'y', line: 9, inHarness: true }] }, { harness: 'one line' }), [
		{ message: 'x', line: null, inHarness: false, lineText: 'a' },
		{ message: 'y', line: 9, inHarness: true, lineText: '' },
	]);
});

test('checkOutcome: passes only when the run finished, every case passed and there is no type error', () => {
	const allPass = { cases: [{ pass: true }, { pass: true }], passed: 2, total: 2 };
	const onePasses = { cases: [{ pass: true }, { pass: false }], passed: 1, total: 2 };
	assert.equal(checkOutcome({ summary: SUCCESS, results: allPass }).state, CHECK_STATES.passed);
	assert.deepEqual(checkOutcome({ summary: SUCCESS, results: onePasses }), { state: CHECK_STATES.failed, passed: 1, total: 2, typeErrors: 0, finished: true });
	assert.equal(checkOutcome({ summary: { status: 'runtime-error' }, results: allPass }).state, CHECK_STATES.unfinished, 'a crash after the cases is not a pass');
	assert.equal(checkOutcome({ summary: { status: 'compile-error' }, results: null }).state, CHECK_STATES.unfinished);
	assert.equal(checkOutcome({ summary: SUCCESS, results: { cases: [], passed: 0, total: 0 } }).state, CHECK_STATES.nothingChecked);
	const stoppedHalfWay = { ...allPass, finished: false };
	assert.equal(checkOutcome({ summary: SUCCESS, results: stoppedHalfWay }).state, CHECK_STATES.unfinished, "exit code 0 but no done line (a reader's exit()): not a pass");
	assert.equal(checkOutcome({ summary: SUCCESS, results: { ...allPass, finished: true } }).state, CHECK_STATES.passed);
});

test('checkOutcome: TypeScript — the type check counts; type tests alone (no runtime case) can pass', () => {
	const allPass = { cases: [{ pass: true }], passed: 1, total: 1 };
	const typeError = { ok: false, errorCount: 1, diagnostics: [{ message: 'nope', line: 1, category: 'error' }, { message: 'fyi', line: 1, category: 'warning' }] };
	assert.deepEqual(checkOutcome({ summary: SUCCESS, results: allPass, typeCheck: typeError }), { state: CHECK_STATES.failed, passed: 1, total: 1, typeErrors: 1, finished: true });
	const none = { cases: [], passed: 0, total: 0 };
	assert.equal(checkOutcome({ summary: SUCCESS, results: none, typeCheck: { ok: true, errorCount: 0, diagnostics: [] } }).state, CHECK_STATES.passed);
	const warningOnly = { ok: true, errorCount: 0, diagnostics: [{ message: 'fyi', line: 1, category: 'warning' }] };
	assert.equal(checkOutcome({ summary: SUCCESS, results: allPass, typeCheck: warningOnly }).state, CHECK_STATES.passed, 'a warning does not fail the check');
	assert.equal(checkOutcome({ summary: SUCCESS, results: none, typeCheck: typeError }).state, CHECK_STATES.failed);
});

test("checkErrorOutput: the compiler's output when compiling failed, else the run's stderr (never the @@check@@ stdout)", () => {
	const compileFailed = { status: 'compile-error', stage: 'compile', output: 'main.c:1:1: error: x' };
	assert.equal(checkErrorOutput(compileFailed, { compile: {}, run: null }), 'main.c:1:1: error: x');
	const crashed = { status: 'runtime-error', stage: 'run', output: '@@check@@ {}\nTraceback' };
	assert.equal(checkErrorOutput(crashed, { run: { stdout: '@@check@@ {}', stderr: 'Traceback (most recent call last):' } }), 'Traceback (most recent call last):');
	assert.equal(checkErrorOutput(crashed, null), '');
	assert.equal(checkErrorOutput(null, null), '');
});

test('hasText: only text with something but white space', () => {
	assert.equal(hasText(' x '), true);
	assert.equal(hasText(' \n '), false);
	assert.equal(hasText(undefined), false);
});

test('normalizeHints: strings in order, blank and non-string entries dropped with a warning', () => {
	const warnings = [];
	const warn = (message) => warnings.push(message);
	assert.deepEqual(normalizeHints(['Sort first.', '', 3, 'Use `i`.'], { warn }), ['Sort first.', 'Use `i`.']);
	assert.equal(warnings.length, 2);
	assert.deepEqual(normalizeHints('One hint.', { warn }), ['One hint.']);
	assert.deepEqual(normalizeHints(undefined, { warn }), []);
	assert.deepEqual(normalizeHints({ a: 1 }, { warn }), []);
	assert.equal(warnings.length, 3);
});

test('clampRevealed: between 0 and the number of hints', () => {
	assert.equal(clampRevealed(2, 3), 2);
	assert.equal(clampRevealed(5, 3), 3);
	assert.equal(clampRevealed(-1, 3), 0);
	assert.equal(clampRevealed(1.5, 3), 0);
	assert.equal(clampRevealed(1, 0), 0);
});

// ---- the hints area (2026-10-26): the light bulb, "Show hint N of M", the eyes ----

test('HINTS_START: closed, nothing revealed, folded or read out; frozen', () => {
	assert.deepEqual(HINTS_START, { open: false, revealed: 0, folded: [], announce: 0 });
	assert.ok(Object.isFrozen(HINTS_START) && Object.isFrozen(HINTS_START.folded));
	assert.equal(nextHintNumber(HINTS_START, 3), 1);
});

test('the light bulb: the first open reveals hint 1 (and reads it out); a close hides the area and keeps the rest', () => {
	const opened = toggleHintsArea(HINTS_START, 3);
	assert.deepEqual(opened, { open: true, revealed: 1, folded: [], announce: 1 });
	const closed = toggleHintsArea(opened, 3);
	assert.deepEqual(closed, { open: false, revealed: 1, folded: [], announce: 0 }, 'closed: still one revealed, nothing to read out');
	assert.equal(HINTS_START.open, false, 'the start state is never changed');
});

test('the light bulb never reveals past hint 1: a reopen brings the area back exactly as it was', () => {
	let state = toggleHintsArea(HINTS_START, 3);
	state = revealNextHint(state, 3);
	state = toggleHintFold(state, 0, 3);
	assert.deepEqual(state, { open: true, revealed: 2, folded: [0], announce: 2 });
	const closed = toggleHintsArea(state, 3);
	const reopened = toggleHintsArea(closed, 3);
	assert.deepEqual(reopened, { open: true, revealed: 2, folded: [0], announce: 0 }, 'two revealed, hint 1 still folded, nothing new to read out');
	for (let presses = 0; presses < 6; presses += 1) state = toggleHintsArea(state, 3);
	assert.equal(state.revealed, 2, 'toggling again and again reveals nothing');
});

test('"Show hint N of M": the next hint, unfolded and read out; nothing once all are revealed, or while closed', () => {
	let state = toggleHintsArea(HINTS_START, 3);
	assert.equal(nextHintNumber(state, 3), 2);
	state = revealNextHint(state, 3);
	assert.deepEqual(state, { open: true, revealed: 2, folded: [], announce: 2 });
	assert.equal(nextHintNumber(state, 3), 3);
	state = revealNextHint(state, 3);
	assert.deepEqual(state, { open: true, revealed: 3, folded: [], announce: 3 });
	assert.equal(nextHintNumber(state, 3), null, 'every hint revealed: no button');
	assert.deepEqual(revealNextHint(state, 3), state, 'past the last: nothing changes');
	const closed = toggleHintsArea(toggleHintsArea(HINTS_START, 3), 3);
	assert.deepEqual(revealNextHint(closed, 3), closed, 'the button is not on screen while the area is closed');
});

test("a hint's eye: folds a revealed hint to its header row, and unfolds it; other indexes change nothing", () => {
	let state = revealNextHint(revealNextHint(toggleHintsArea(HINTS_START, 3), 3), 3);
	state = toggleHintFold(state, 0, 3);
	assert.equal(state.announce, 3, 'folding another hint leaves the region alone (a fold says nothing: its eye has aria-expanded)');
	state = toggleHintFold(state, 2, 3);
	assert.deepEqual(state.folded, [0, 2], 'in order, whatever order they were folded in');
	assert.equal(state.announce, 0, 'folding the hint the region holds empties it: its folded text is not left in the page there');
	state = toggleHintFold(state, 2, 3);
	assert.deepEqual(state.folded, [0], 'unfolded');
	assert.equal(state.announce, 0, 'an unfold reads nothing out');
	assert.equal(state.revealed, 3, 'a fold never hides or reveals a hint');
	const oneRevealed = toggleHintsArea(HINTS_START, 3);
	for (const index of [1, 2, -1, 0.5, '0', null]) assert.deepEqual(toggleHintFold(oneRevealed, index, 3), oneRevealed, `index ${index}: not a revealed hint`);
});

test('one hint: the first open reveals it and there is no next; no hints: nothing opens', () => {
	const one = toggleHintsArea(HINTS_START, 1);
	assert.deepEqual(one, { open: true, revealed: 1, folded: [], announce: 1 });
	assert.equal(nextHintNumber(one, 1), null);
	assert.deepEqual(toggleHintsArea(HINTS_START, 0), HINTS_START, 'no hints: the area stays closed');
	assert.equal(nextHintNumber(HINTS_START, 0), null);
});

test('focusAfterReveal (from the state before the press): the button keeps the focus while more remain; the press that reveals the last hint hands it to that hint\'s eye', () => {
	assert.deepEqual(FOCUS_AFTER_REVEAL, { button: 'button', lastEye: 'lastEye' });
	const one = toggleHintsArea(HINTS_START, 3); // hint 1 revealed: the button says "Show hint 2 of 3"
	assert.equal(focusAfterReveal(one, 3), FOCUS_AFTER_REVEAL.button, 'revealing hint 2 of 3: the button stays');
	const two = revealNextHint(one, 3); // "Show hint 3 of 3"
	assert.equal(focusAfterReveal(two, 3), FOCUS_AFTER_REVEAL.lastEye, 'revealing hint 3 of 3: the button goes, the eye of hint 3 takes the focus');
	const all = revealNextHint(two, 3);
	assert.equal(focusAfterReveal(all, 3), FOCUS_AFTER_REVEAL.button, 'nothing left to reveal: nothing moves');
	assert.equal(focusAfterReveal(toggleHintsArea(two, 3), 3), FOCUS_AFTER_REVEAL.button, 'closed: the button is not on screen');
	assert.equal(focusAfterReveal(HINTS_START, 3), FOCUS_AFTER_REVEAL.button);
	const twoHints = toggleHintsArea(HINTS_START, 2);
	assert.equal(focusAfterReveal(twoHints, 2), FOCUS_AFTER_REVEAL.lastEye, 'two hints: "Show hint 2 of 2" reveals the last');
	const oneHint = toggleHintsArea(HINTS_START, 1);
	assert.equal(nextHintNumber(oneHint, 1), null, 'one hint: the first open reveals it, so there is no button');
	assert.equal(focusAfterReveal(oneHint, 1), FOCUS_AFTER_REVEAL.button);
	assert.equal(focusAfterReveal(HINTS_START, 0), FOCUS_AFTER_REVEAL.button, 'no hints');
});

test('hintsStateOf: any state made safe for the number of hints (what HintList draws)', () => {
	assert.deepEqual(hintsStateOf(undefined, 3), HINTS_START);
	assert.deepEqual(hintsStateOf({ open: true, revealed: 9, folded: [5, 1, 1, -1, 'x'], announce: 7 }, 3), { open: true, revealed: 3, folded: [1], announce: 0 });
	assert.deepEqual(hintsStateOf({ open: true, revealed: 0 }, 3), { open: false, revealed: 0, folded: [], announce: 0 }, 'open with nothing revealed reads as closed');
	assert.deepEqual(hintsStateOf({ open: 'yes', revealed: 2, folded: [1], announce: 2 }, 3), { open: false, revealed: 2, folded: [1], announce: 2 });
});
