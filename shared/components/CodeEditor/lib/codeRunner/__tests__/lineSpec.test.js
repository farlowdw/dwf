/**
 * lineSpec.test.js — reading a line spec (../lineSpec.js): every form an author may write (a
 * number, a string of parts, braces, an array of lines / pairs / strings), sorting and merging,
 * every part that is dropped or fixed (with its warning), clamping to the code, and the three
 * helpers (linesOf, formatLineSpec, lineKindsOf). Run with `npm run test:shared`.
 * To change it: a new form of a line spec in ../lineSpec.js gets a test here, with its warning.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLineSpec, lineKindsOf, linesOf, parseLineSpec } from '../lineSpec.js';

/** parseLineSpec with its warnings collected: [ranges, warnings]. */
function parsed(spec, options = {}) {
	const warnings = [];
	const ranges = parseLineSpec(spec, { ...options, warn: (message) => warnings.push(message) });
	return [ranges, warnings];
}

/** The ranges only, asserting there was no warning. */
function quietly(spec, options) {
	const [ranges, warnings] = parsed(spec, options);
	assert.deepEqual(warnings, [], `no warning for ${JSON.stringify(spec)}`);
	return ranges;
}

test('nothing at all: undefined, null, an empty or blank string, an empty array -> [], no warning', () => {
	for (const spec of [undefined, null, '', '   ', []]) assert.deepEqual(quietly(spec, { lineCount: 10 }), []);
});

test('one line, as a number or a string', () => {
	assert.deepEqual(quietly(5), [[5, 5]]);
	assert.deepEqual(quietly('5'), [[5, 5]]);
	assert.deepEqual(quietly(' 5 '), [[5, 5]]);
});

test("the spec's examples: '3-5,8' and [3, [5, 7]]", () => {
	assert.deepEqual(quietly('3-5,8', { lineCount: 20 }), [[3, 5], [8, 8]]);
	assert.deepEqual(quietly([3, [5, 7]], { lineCount: 20 }), [[3, 3], [5, 7]]);
});

test('spaces, an en dash and braces are fine', () => {
	assert.deepEqual(quietly('3 - 5 , 8'), [[3, 5], [8, 8]]);
	assert.deepEqual(quietly('3–5'), [[3, 5]]);
	assert.deepEqual(quietly('{1,4-6,11}'), [[1, 1], [4, 6], [11, 11]], "a code block's metastring");
	assert.deepEqual(quietly(' { 2-3 } '), [[2, 3]]);
});

test('an array may hold strings too', () => {
	assert.deepEqual(quietly(['3-5', 8, [10, 12]]), [[3, 5], [8, 8], [10, 12]]);
	assert.deepEqual(quietly(['1,2', '7']), [[1, 2], [7, 7]]);
});

test('an array is a list: [3, 5] is lines 3 and 5, not a range', () => {
	assert.deepEqual(quietly([3, 5]), [[3, 3], [5, 5]]);
	assert.deepEqual(quietly([[3, 5]]), [[3, 5]]);
});

test('sorted, with overlapping and touching ranges merged', () => {
	assert.deepEqual(quietly('8,3-5'), [[3, 5], [8, 8]]);
	assert.deepEqual(quietly('3-5,4-9'), [[3, 9]], 'overlapping');
	assert.deepEqual(quietly('3-5,6-8'), [[3, 8]], 'touching');
	assert.deepEqual(quietly('5,3,4'), [[3, 5]], 'single lines in a row');
	assert.deepEqual(quietly('2-10,4-6'), [[2, 10]], 'one inside another');
	assert.deepEqual(quietly('3,3,3-3'), [[3, 3]], 'duplicates');
	assert.deepEqual(quietly('1,3'), [[1, 1], [3, 3]], 'a gap of one line stays a gap');
});

test('empty parts are skipped without a warning', () => {
	assert.deepEqual(quietly('3,,5'), [[3, 3], [5, 5]]);
	assert.deepEqual(quietly('3,'), [[3, 3]]);
	assert.deepEqual(quietly(','), []);
});

test('a part that is not a line or a range is skipped with a warning; the rest is kept', () => {
	const [ranges, warnings] = parsed('3-x,8,a,1-2-3,-1,2.5');
	assert.deepEqual(ranges, [[8, 8]]);
	assert.equal(warnings.length, 5);
	assert.match(warnings[0], /^CodeEditor lines: '3-x' was skipped: a part is a line \(8\) or a range \(3-5\)\.$/);
	assert.match(warnings[3], /'-1' was skipped/);
	assert.match(warnings[4], /'2\.5' was skipped/);
});

test('array items that are not lines, pairs or strings are skipped with a warning', () => {
	const [ranges, warnings] = parsed([2.5, [1, 2, 3], [1], ['1', '2'], null, { line: 4 }, [[4, 5]], 6]);
	assert.deepEqual(ranges, [[6, 6]]);
	assert.equal(warnings.length, 7);
	assert.match(warnings[1], /\[1, 2, 3\] was skipped/);
	assert.match(warnings[6], /\[\[4, 5\]\] was skipped/, 'a list inside a list is not a pair');
});

test('a number that is not whole is skipped with a warning', () => {
	for (const spec of [2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
		const [ranges, warnings] = parsed(spec);
		assert.deepEqual(ranges, [], String(spec));
		assert.equal(warnings.length, 1, String(spec));
	}
});

test('a value of another type: one warning, []', () => {
	for (const spec of [{ lines: '3' }, true, () => 3]) {
		const [ranges, warnings] = parsed(spec);
		assert.deepEqual(ranges, []);
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /was ignored: name lines as 5, '3-5,8' or \[3, \[5, 7\]\]\./);
	}
});

test('lines are numbered from 1', () => {
	const [ranges, warnings] = parsed([0, -2, [0, 3], '0', '0-2', 4]);
	assert.deepEqual(ranges, [[4, 4]]);
	assert.equal(warnings.length, 5);
	for (const warning of warnings) assert.match(warning, /numbered from 1/);
});

test('a line number above a million is a typo: skipped with a warning', () => {
	const [ranges, warnings] = parsed('2,1000001,999999');
	assert.deepEqual(ranges, [[2, 2], [999999, 999999]]);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /'1000001' was skipped: no line number is above 1000000\./);
});

test('a range written backwards is read forwards, with a warning', () => {
	const [ranges, warnings] = parsed('5-3');
	assert.deepEqual(ranges, [[3, 5]]);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /'5-3' was read as 3-5/);
	assert.deepEqual(parsed([[9, 7]])[0], [[7, 9]]);
});

test('with a line count: past the end dropped, over the end clamped (each with a warning)', () => {
	const [ranges, warnings] = parsed('2-4,8-15,20', { lineCount: 10 });
	assert.deepEqual(ranges, [[2, 4], [8, 10]]);
	assert.equal(warnings.length, 2);
	assert.match(warnings[0], /'8-15' ends after the last line \(10\): it ends on line 10 instead\./);
	assert.match(warnings[1], /'20' was skipped: the code has only 10 lines\./);
	assert.deepEqual(quietly('10', { lineCount: 10 }), [[10, 10]], 'the last line itself is fine');
	assert.deepEqual(parsed('1', { lineCount: 0 })[0], [], 'empty code');
	assert.match(parsed('3', { lineCount: 1 })[1][0], /the code has only 1 line\.$/, 'one line, not "1 lines"');
});

test('no usable line count: nothing is clamped', () => {
	for (const lineCount of [undefined, null, Number.NaN, -1, 2.5, '10']) {
		assert.deepEqual(quietly('2-400', { lineCount }), [[2, 400]], String(lineCount));
	}
});

test('the label starts every warning', () => {
	const [, warnings] = parsed('x', { label: 'CodeEditor highlight' });
	assert.match(warnings[0], /^CodeEditor highlight: 'x' was skipped/);
});

test('never throws, whatever it is given', () => {
	const odd = [Symbol('x'), 10n, new Date(0), [Symbol('y')], [[1, 2n]], ['{'], '{}', '}{'];
	for (const spec of odd) assert.doesNotThrow(() => parsed(spec, { lineCount: 5 }), String(typeof spec));
});

test('warnings go to console.warn when no `warn` is given', (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	assert.deepEqual(parseLineSpec('x,2'), [[2, 2]]);
	assert.equal(warn.mock.callCount(), 1);
	assert.match(warn.mock.calls[0].arguments[0], /^CodeEditor lines: 'x'/);
});

test('the input is not changed', () => {
	const spec = [[9, 7], 3, '1-2'];
	const copy = structuredClone(spec);
	parsed(spec, { lineCount: 5 });
	assert.deepEqual(spec, copy);
});

test('linesOf: every line of the ranges', () => {
	assert.deepEqual(linesOf([[3, 5], [8, 8]]), [3, 4, 5, 8]);
	assert.deepEqual(linesOf([]), []);
	assert.deepEqual(linesOf(undefined), []);
	assert.deepEqual(linesOf([[3, 5], 'x', [7], [9, 8], [10, 10]]), [3, 4, 5, 10], 'unusable items are left out');
	assert.deepEqual(linesOf([[0, 2], [-3, -1], [4, 4]]), [4], 'a range that starts below line 1 is left out');
	assert.equal(formatLineSpec([[0, 2], [4, 4]]), '4');
	assert.deepEqual(lineKindsOf([[-1, 1], [2, 2]], 'error'), { 2: 'error' });
});

test('the helpers read what parseLineSpec gives, with the code clamped (the way the editor uses them)', () => {
	const ranges = parseLineSpec('2-3, 9-40', { lineCount: 10, warn: () => {} });
	assert.deepEqual(linesOf(ranges), [2, 3, 9, 10]);
	assert.equal(formatLineSpec(ranges), '2-3, 9-10');
	assert.deepEqual(lineKindsOf(ranges, 'highlight'), { 2: 'highlight', 3: 'highlight', 9: 'highlight', 10: 'highlight' });
});

test('formatLineSpec: the ranges as a reader reads them', () => {
	assert.equal(formatLineSpec([[3, 5], [8, 8]]), '3-5, 8');
	assert.equal(formatLineSpec([[1, 1]]), '1');
	assert.equal(formatLineSpec([]), '');
	assert.equal(formatLineSpec(null), '');
});

test('formatLineSpec and parseLineSpec go round', () => {
	for (const spec of ['3-5, 8', '1', '2-4, 6-9, 12']) {
		assert.equal(formatLineSpec(quietly(spec)), spec);
	}
});

test("lineKindsOf: the lines as magicComments.js's { [line]: kind }", () => {
	assert.deepEqual(lineKindsOf([[3, 4], [8, 8]], 'highlight'), { 3: 'highlight', 4: 'highlight', 8: 'highlight' });
	assert.deepEqual(lineKindsOf([], 'error'), {});
});
