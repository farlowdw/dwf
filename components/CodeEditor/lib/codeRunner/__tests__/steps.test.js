/**
 * steps.test.js — reading the `steps` prop (../steps.js): a usable list as { ranges, note, title },
 * the lines read as a line spec and clamped to the code, every entry that is dropped (and what
 * that does to the numbering), the notes and titles that are fixed, unknown keys, and the
 * warnings. Run with `npm run test:shared`.
 * To change it: a new key or rule of the steps prop in ../steps.js gets a test here, with its warning.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSteps } from '../steps.js';

/** normalizeSteps with its warnings collected: [steps, warnings]. */
function normalized(steps, options = {}) {
	const warnings = [];
	const result = normalizeSteps(steps, { ...options, warn: (message) => warnings.push(message) });
	return [result, warnings];
}

/** The steps only, asserting there was no warning. */
function quietly(steps, options) {
	const [result, warnings] = normalized(steps, options);
	assert.deepEqual(warnings, [], 'no warning');
	return result;
}

test("the spec's shape: { lines, note, title? } -> { ranges, note, title }", () => {
	const steps = [
		{ lines: '1-3', note: 'The function takes a list `nums`.' },
		{ lines: [5, [7, 9]], title: 'The loop', note: 'Each pass adds `x` to `total`.' },
		{ lines: 12, note: 'It returns the total.' },
	];
	assert.deepEqual(quietly(steps, { lineCount: 12 }), [
		{ ranges: [[1, 3]], note: 'The function takes a list `nums`.', title: null },
		{ ranges: [[5, 5], [7, 9]], note: 'Each pass adds `x` to `total`.', title: 'The loop' },
		{ ranges: [[12, 12]], note: 'It returns the total.', title: null },
	]);
});

test('no steps: undefined, null, [] -> [], no warning', () => {
	for (const steps of [undefined, null, []]) assert.deepEqual(quietly(steps), []);
});

test('steps that are not a list: one warning, []', () => {
	for (const steps of [{ lines: '1', note: 'x' }, '1-3', 3, true]) {
		const [result, warnings] = normalized(steps);
		assert.deepEqual(result, []);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /^CodeEditor steps: the prop was ignored: `steps` is a list/);
	}
});

test('note and title are trimmed; an empty title is no title', () => {
	const [step] = quietly([{ lines: '2', note: '\n  Look here.  \n', title: '  Start  ' }]);
	assert.equal(step.note, 'Look here.');
	assert.equal(step.title, 'Start');
	assert.equal(quietly([{ lines: '2', note: 'x', title: '   ' }])[0].title, null);
	assert.equal(quietly([{ lines: '2', note: 'x', title: null }])[0].title, null);
});

test('an empty note is allowed without a warning', () => {
	assert.equal(quietly([{ lines: '2', note: '' }])[0].note, '');
});

test('lines are read as a line spec and clamped to the code (with the line spec warnings, labelled)', () => {
	const [result, warnings] = normalized([{ lines: '2-4,9-20', note: 'x' }], { lineCount: 10 });
	assert.deepEqual(result[0].ranges, [[2, 4], [9, 10]]);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /^CodeEditor steps: step 1's lines: '9-20' ends after the last line \(10\)/);
});

test('an entry that is not an object is dropped, with a warning; the next steps move up', () => {
	const [result, warnings] = normalized([{ lines: 1, note: 'a' }, 'oops', [1, 2], null, { lines: 2, note: 'b' }]);
	assert.deepEqual(result.map((step) => step.note), ['a', 'b']);
	assert.equal(warnings.length, 3);
	assert.match(warnings[0], /^CodeEditor steps: step 2 was skipped: a step is an object/);
	assert.match(warnings[1], /^CodeEditor steps: step 3 /);
	assert.match(warnings[2], /^CodeEditor steps: step 4 /);
});

test('an entry without lines is dropped, with a warning', () => {
	const [result, warnings] = normalized([{ note: 'no lines' }, { lines: null, note: 'null lines' }, { lines: 3, note: 'kept' }]);
	assert.deepEqual(result.map((step) => step.note), ['kept']);
	assert.equal(warnings.length, 2);
	assert.match(warnings[0], /step 1 was skipped: it has no `lines`/);
});

test('an entry whose lines name no line of the code is dropped, with a warning', () => {
	const [result, warnings] = normalized([{ lines: '40-50', note: 'past the end' }, { lines: 'x', note: 'bad' }, { lines: [], note: 'empty' }, { lines: 1, note: 'kept' }], { lineCount: 10 });
	assert.deepEqual(result.map((step) => step.note), ['kept']);
	const skipped = warnings.filter((warning) => /name no line of the code/.test(warning));
	assert.equal(skipped.length, 3);
	assert.match(skipped[0], /step 1 was skipped/);
	assert.ok(warnings.some((warning) => /step 1's lines: '40-50' was skipped: the code has only 10 lines/.test(warning)), 'and why');
});

test('a missing note, or one that is not text: the step stays, with an empty note and a warning', () => {
	const [result, warnings] = normalized([{ lines: 1 }, { lines: 2, note: 42 }, { lines: 3, note: null }]);
	assert.deepEqual(result.map((step) => step.note), ['', '', '']);
	assert.equal(warnings.length, 3);
	assert.match(warnings[0], /step 1 has no `note`/);
	assert.match(warnings[1], /step 2 has a `note` that is not text/);
	assert.match(warnings[2], /step 3 has no `note`/);
});

test('a title that is not text: the step stays, without a title, with a warning', () => {
	const [result, warnings] = normalized([{ lines: 1, note: 'x', title: 7 }]);
	assert.equal(result.length, 1);
	assert.equal(result[0].title, null);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /step 1 has a `title` that is not text/);
});

test('a key a step does not have is named in a warning (the step is still read)', () => {
	const [result, warnings] = normalized([{ line: 3, lines: 4, text: 'typo', note: 'x' }]);
	assert.deepEqual(result, [{ ranges: [[4, 4]], note: 'x', title: null }]);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /^CodeEditor steps: step 1 has `line`, `text`, which a step does not have \(it has lines, note, title\)\.$/);
});

test('`line` instead of `lines`: the step is dropped, and both warnings say why', () => {
	const [result, warnings] = normalized([{ line: 3, note: 'x' }]);
	assert.deepEqual(result, []);
	assert.equal(warnings.length, 2);
	assert.match(warnings[0], /has `line`/);
	assert.match(warnings[1], /has no `lines`/);
});

test('no line count: nothing is clamped', () => {
	assert.deepEqual(quietly([{ lines: '100-200', note: 'x' }])[0].ranges, [[100, 200]]);
});

test('the input is not changed', () => {
	const steps = [{ lines: [[9, 7]], note: ' x ', title: ' t ' }];
	const copy = structuredClone(steps);
	normalized(steps, { lineCount: 5 });
	assert.deepEqual(steps, copy);
});

test('warnings go to console.warn when no `warn` is given', (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	assert.deepEqual(normalizeSteps([{ note: 'x' }]), []);
	assert.equal(warn.mock.callCount(), 1);
	assert.match(warn.mock.calls[0].arguments[0], /^CodeEditor steps: step 1/);
});
