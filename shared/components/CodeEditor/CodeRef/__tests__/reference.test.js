/**
 * reference.test.js — a <CodeRef>'s props read (../reference.js): the editor's id, the request a
 * click sends (the lines as sorted, merged ranges read by the run library's parseLineSpec, not
 * cut to any code; a step as an index from 0; neither: none), the tooltip and the words shown
 * without children, and a warning for each mistake (no `to`, a broken line spec — the parser's
 * own warnings first —, a broken step, both lines and step). Run with `npm run test:shared`.
 * To change it: a new prop of ../reference.js, or a new mistake it warns about, gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_TYPES } from '../../lib/registry/index.js';
import { LINES_LABEL, WORDS, rangesOf, rangesWords, readReference, stepIndexOf } from '../reference.js';

test('lines: sent as sorted, merged ranges, with words for the tooltip and the label', () => {
	assert.deepEqual(readReference({ to: 'two-sum', lines: '10-12' }), {
		id: 'two-sum',
		action: { type: ACTION_TYPES.lines, ranges: [[10, 12]] },
		label: 'lines 10–12',
		description: 'Show lines 10–12 in the code editor',
		warnings: [],
	});
	const fromList = readReference({ to: 'two-sum', lines: [3, [5, 7]] });
	assert.deepEqual(fromList.action, { type: 'lines', ranges: [[3, 3], [5, 7]] });
	assert.equal(fromList.label, 'lines 3, 5–7');
	assert.deepEqual(readReference({ to: 'two-sum', lines: 4 }).action, { type: 'lines', ranges: [[4, 4]] });
	assert.equal(readReference({ to: 'two-sum', lines: 4 }).description, 'Show line 4 in the code editor');
	assert.deepEqual(readReference({ to: 'two-sum', lines: '8, 3-5, 4' }).action.ranges, [[3, 5], [8, 8]], 'sorted and merged');
	assert.deepEqual(readReference({ to: 'two-sum', lines: '{3-5}' }).action.ranges, [[3, 5]], "a code block's braces");
});

test('lines: never cut to a length (the reference cannot see the code; the editor cuts them)', () => {
	const reference = readReference({ to: 'two-sum', lines: '900-950' });
	assert.deepEqual(reference.action.ranges, [[900, 950]]);
	assert.deepEqual(reference.warnings, []);
});

test("lines: the parser's warnings come first, with the reference's label; the usable parts are kept", () => {
	const reference = readReference({ to: 'two-sum', lines: '3-x, 5-3, 8' });
	assert.deepEqual(reference.action.ranges, [[3, 5], [8, 8]], "'3-x' left out, '5-3' read forwards");
	assert.equal(reference.label, 'lines 3–5, 8');
	assert.equal(reference.warnings.length, 2);
	for (const warning of reference.warnings) assert.ok(warning.startsWith(`${LINES_LABEL}: `), warning);
	assert.match(reference.warnings[0], /'3-x' was skipped/);
	assert.match(reference.warnings[1], /'5-3' was read as 3-5/);
});

test('a step: its number as the reader sees it, sent as an index from 0; the string form too', () => {
	assert.deepEqual(readReference({ to: 'two-sum', step: 2 }), {
		id: 'two-sum',
		action: { type: ACTION_TYPES.step, index: 1 },
		label: 'step 2',
		description: 'Go to step 2 in the code editor',
		warnings: [],
	});
	assert.deepEqual(readReference({ to: 'two-sum', step: '1' }).action, { type: 'step', index: 0 });
	assert.deepEqual(readReference({ to: 'two-sum', step: ' 3 ' }).action, { type: 'step', index: 2 });
});

test('neither lines nor step: the reference only brings the editor into view', () => {
	assert.deepEqual(readReference({ to: 'two-sum' }), {
		id: 'two-sum',
		action: null,
		label: WORDS.editor,
		description: WORDS.goToEditor,
		warnings: [],
	});
	assert.equal(readReference({ to: 'two-sum', lines: null, step: undefined }).action, null, 'null and undefined mean "not given"');
});

test('the id: trimmed; a number becomes its digits', () => {
	assert.equal(readReference({ to: '  two-sum ' }).id, 'two-sum');
	assert.equal(readReference({ to: 3 }).id, '3');
});

test('a `to` that names no editor: id null and a warning', () => {
	for (const to of [undefined, '', 'two sum', null, {}]) {
		const reference = readReference({ to, lines: '3' });
		assert.equal(reference.id, null, String(to));
		assert.equal(reference.warnings.length, 1, String(to));
		assert.match(reference.warnings[0], /^CodeRef: to=.* names no editor/);
	}
	assert.match(readReference({ to: 'two sum' }).warnings[0], /to="two sum"/);
	assert.equal(readReference().id, null, 'no props at all');
});

test('a line spec that names no line: its warning(s), the last one ours, and only the scroll', () => {
	const silentlyEmpty = ['', '   ', []]; // nothing to read: the parser says nothing
	for (const lines of [...silentlyEmpty, 0, -2, 2.5, 'abc', '3-x', {}, true]) {
		const reference = readReference({ to: 'two-sum', lines });
		const shown = JSON.stringify(lines);
		assert.equal(reference.action, null, shown);
		assert.equal(reference.label, WORDS.editor, shown);
		const expected = silentlyEmpty.includes(lines) ? 1 : 2;
		assert.equal(reference.warnings.length, expected, shown);
		assert.match(reference.warnings.at(-1), /^CodeRef: lines=.* names no line .*so it was left out\.$/, shown);
	}
	assert.match(readReference({ to: 'two-sum', lines: {} }).warnings.at(-1), /lines=\{\}/, 'an object is shown as JSON');
});

test('a broken step: a warning, and only the scroll (or the lines, when they are given)', () => {
	for (const step of [0, -1, 1.5, '', 'two', '2a', [], {}]) {
		const reference = readReference({ to: 'two-sum', step });
		assert.equal(reference.action, null, JSON.stringify(step));
		assert.equal(reference.warnings.length, 1, JSON.stringify(step));
		assert.match(reference.warnings[0], /^CodeRef: step=.* is not a step number .*so it was left out\.$/);
	}
	const withLines = readReference({ to: 'two-sum', step: 0, lines: '5' });
	assert.deepEqual(withLines.action, { type: 'lines', ranges: [[5, 5]] }, 'the usable prop is used');
	assert.equal(withLines.warnings.length, 1);
});

test('both lines and step: the step wins, with a warning', () => {
	const reference = readReference({ to: 'two-sum', lines: '3-5', step: 2 });
	assert.deepEqual(reference.action, { type: 'step', index: 1 });
	assert.deepEqual(reference.warnings, ['CodeRef: the reference to "two-sum" gives both lines and step: it goes to the step.']);
});

test('several mistakes at once: one warning each', () => {
	const reference = readReference({ lines: '', step: 'x' });
	assert.equal(reference.warnings.length, 3);
});

test('a broken line spec with a good step: the step, and no "both" warning', () => {
	const reference = readReference({ to: 'two-sum', lines: 'x', step: 2 });
	assert.deepEqual(reference.action, { type: 'step', index: 1 });
	assert.equal(reference.warnings.length, 2, "the parser's and ours");
	assert.ok(reference.warnings.every((warning) => !/both lines and step/.test(warning)));
});

test('rangesOf: the library parser without a line count, its warnings to `warn`', () => {
	const warnings = [];
	const warn = (message) => warnings.push(message);
	assert.deepEqual(rangesOf('3-5,8', warn), [[3, 5], [8, 8]]);
	assert.deepEqual(rangesOf(' 3 - 5 ', warn), [[3, 5]]);
	assert.deepEqual(rangesOf('3–5', warn), [[3, 5]], 'an en dash');
	assert.deepEqual(rangesOf(5000, warn), [[5000, 5000]], 'no line count: nothing is cut');
	assert.deepEqual(warnings, []);
	for (const bad of [0, -1, 1.5, NaN, {}, true]) assert.deepEqual(rangesOf(bad, warn), [], String(bad));
	assert.equal(warnings.length, 6, 'one warning each');
	for (const empty of ['', '  ', [], null, undefined]) assert.deepEqual(rangesOf(empty, warn), [], String(empty));
	assert.equal(warnings.length, 6, 'nothing to read: no warning');
});

test('stepIndexOf: whole numbers from 1, as numbers or strings', () => {
	assert.equal(stepIndexOf(1), 0);
	assert.equal(stepIndexOf(4), 3);
	assert.equal(stepIndexOf('2'), 1);
	for (const bad of [0, -1, 1.5, '', ' ', 'two', null, undefined, [2], NaN]) assert.equal(stepIndexOf(bad), null, String(bad));
});

test('rangesWords: each range with an en dash, commas spaced; one line is "line"', () => {
	assert.equal(rangesWords([[5, 5]]), 'line 5');
	assert.equal(rangesWords([[10, 12]]), 'lines 10–12');
	assert.equal(rangesWords([[3, 5], [8, 8]]), 'lines 3–5, 8');
	assert.equal(rangesWords([[3, 3], [5, 7]]), 'lines 3, 5–7');
	assert.equal(rangesWords([[4, 4], [9, 9]]), 'lines 4, 9');
});

test('the label from what the author wrote: read, sorted, merged', () => {
	const label = (lines) => readReference({ to: 'two-sum', lines }).label;
	assert.equal(label(' 5 '), 'line 5');
	assert.equal(label('3 - 5 ,  8,'), 'lines 3–5, 8');
	assert.equal(label('8,3-5'), 'lines 3–5, 8');
	assert.equal(label(['2-3', 9]), 'lines 2–3, 9');
	assert.equal(label('3-4,5'), 'lines 3–5', 'touching ranges merged');
});

test('the words are frozen', () => {
	assert.ok(Object.isFrozen(WORDS));
	assert.equal(WORDS.show('lines 1–2'), 'Show lines 1–2 in the code editor');
});
