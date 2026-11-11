/**
 * folds.test.js — the regions an editor folds when it opens (../folds.js): a blog post's
 * fold on a snippet of the same shape, every rule that drops or fits a region (shape, order, the end
 * of the code, duplicates, nesting, crossing, two folds on one line), the folding order, and
 * the per-language prop. Run with `npm run test:shared`.
 * To change it: a new fold rule of ../folds.js gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { foldRegionsFor, innermostFirst, normalizeFoldRegions } from '../folds.js';

/** A made-up stand-in for a blog post's snippet, which it pre-loads with foldedRegions={[[1,6]]}. */
const BLOG_SNIPPET = fileURLToPath(new URL('../../../__tests__/fixtures/snippets/tally-votes.py', import.meta.url));

/** Shorthand: the regions only. */
const regionsOf = (regions, lineCount) => normalizeFoldRegions(regions, lineCount).regions;

/** Shorthand: the warnings only. */
const warningsOf = (regions, lineCount) => normalizeFoldRegions(regions, lineCount).warnings;

test("the blog post's fold: [[1, 6]] over its snippet, kept as it is, no warning", (t) => {
	if (!fs.existsSync(BLOG_SNIPPET)) {
		t.skip('the blog snippet is not there');
		return;
	}
	const code = fs.readFileSync(BLOG_SNIPPET, 'utf8');
	const lineCount = code.split('\n').length;
	assert.ok(lineCount > 6, 'the snippet is longer than the fold');
	assert.deepEqual(normalizeFoldRegions([[1, 6]], lineCount), { regions: [[1, 6]], warnings: [] });
	assert.match(code.split('\n')[0], /^def tally_by_hand/, 'line 1 (the one left visible) is the def line');
});

test('nothing to fold: undefined, null, an empty list', () => {
	assert.deepEqual(normalizeFoldRegions(undefined, 10), { regions: [], warnings: [] });
	assert.deepEqual(normalizeFoldRegions(null, 10), { regions: [], warnings: [] });
	assert.deepEqual(normalizeFoldRegions([], 10), { regions: [], warnings: [] });
});

test('not a list at all: one warning', () => {
	for (const value of [[1, 6].join('-'), 7, { python: [[1, 6]] }]) {
		const result = normalizeFoldRegions(value, 10);
		assert.deepEqual(result.regions, [], String(value));
		assert.equal(result.warnings.length, 1, String(value));
		assert.match(result.warnings[0], /^CodeEditor foldedRegions:/);
	}
});

test('a single pair instead of a list of pairs is two broken items', () => {
	const result = normalizeFoldRegions([1, 6], 10);
	assert.deepEqual(result.regions, []);
	assert.equal(result.warnings.length, 2);
	assert.match(result.warnings[0], /pair of line numbers/);
});

test('items that are not [start, end] pairs of whole numbers are dropped with a warning', () => {
	const items = [null, 'x', [1], [1, 2, 3], [1.5, 4], ['1', '4'], [1, Number.NaN], [1, Number.POSITIVE_INFINITY], [2, 5]];
	const result = normalizeFoldRegions(items, 10);
	assert.deepEqual(result.regions, [[2, 5]]);
	assert.equal(result.warnings.length, items.length - 1);
	assert.match(result.warnings[4], /whole line numbers/);
});

test('start must be at least 1', () => {
	const result = normalizeFoldRegions([[0, 4], [-2, 3]], 10);
	assert.deepEqual(result.regions, []);
	assert.equal(result.warnings.length, 2);
	assert.match(result.warnings[0], /numbered from 1/);
});

test('a fold hides at least one line: end must be greater than start', () => {
	const result = normalizeFoldRegions([[3, 3], [5, 2], [1, 2]], 10);
	assert.deepEqual(result.regions, [[1, 2]]);
	assert.equal(result.warnings.length, 2);
	assert.match(result.warnings[0], /\[3, 3\].*at least one hidden line/);
	assert.match(result.warnings[1], /\[5, 2\]/);
});

test('an end past the last line moves to the last line, with a warning', () => {
	const result = normalizeFoldRegions([[2, 40]], 10);
	assert.deepEqual(result.regions, [[2, 10]]);
	assert.equal(result.warnings.length, 1);
	assert.match(result.warnings[0], /\[2, 40\] ends after the last line \(10\)/);
	assert.deepEqual(normalizeFoldRegions([[2, 10]], 10), { regions: [[2, 10]], warnings: [] }, 'ending on the last line is fine');
});

test('a region starting on or after the last line is dropped', () => {
	assert.deepEqual(regionsOf([[10, 12]], 10), []);
	assert.deepEqual(regionsOf([[15, 20]], 10), []);
	assert.match(warningsOf([[10, 12]], 10)[0], /only 10 lines/);
	assert.deepEqual(regionsOf([[1, 3]], 0), [], 'empty code');
});

test('no usable line count: no clamping', () => {
	for (const lineCount of [undefined, null, Number.NaN, -1, 2.5, '10']) {
		assert.deepEqual(normalizeFoldRegions([[2, 400]], lineCount), { regions: [[2, 400]], warnings: [] }, String(lineCount));
	}
});

test('sorted by start; exact duplicates dropped without a warning', () => {
	const result = normalizeFoldRegions([[20, 25], [1, 6], [8, 12], [1, 6]], 30);
	assert.deepEqual(result.regions, [[1, 6], [8, 12], [20, 25]]);
	assert.deepEqual(result.warnings, []);
});

test('nested regions are kept, outer before inner', () => {
	assert.deepEqual(normalizeFoldRegions([[3, 5], [1, 10]], 20), { regions: [[1, 10], [3, 5]], warnings: [] });
	assert.deepEqual(regionsOf([[2, 10], [3, 5], [1, 20], [6, 9], [7, 8]], 30), [[1, 20], [2, 10], [3, 5], [6, 9], [7, 8]]);
	assert.deepEqual(regionsOf([[1, 10], [4, 10]], 20), [[1, 10], [4, 10]], 'inner ending on the same line');
});

test('a region crossing another is dropped with a warning (the earlier one stays)', () => {
	const result = normalizeFoldRegions([[1, 5], [3, 8]], 20);
	assert.deepEqual(result.regions, [[1, 5]]);
	assert.equal(result.warnings.length, 1);
	assert.match(result.warnings[0], /\[3, 8\].*crosses \[1, 5\]/);
});

test('starting on the last line of another region is crossing too', () => {
	const result = normalizeFoldRegions([[1, 5], [5, 8]], 20);
	assert.deepEqual(result.regions, [[1, 5]]);
	assert.match(result.warnings[0], /crosses/);
	assert.deepEqual(regionsOf([[1, 5], [6, 8]], 20), [[1, 5], [6, 8]], 'starting on the next line is fine');
});

test('crossing is checked against the region a fold sits in, not only the previous one', () => {
	assert.deepEqual(regionsOf([[1, 10], [2, 4], [5, 12]], 20), [[1, 10], [2, 4]], '[5, 12] crosses [1, 10]');
	assert.deepEqual(regionsOf([[1, 10], [2, 4], [3, 6]], 20), [[1, 10], [2, 4]], '[3, 6] crosses [2, 4]');
	assert.deepEqual(regionsOf([[1, 10], [2, 4], [5, 9], [11, 15]], 20), [[1, 10], [2, 4], [5, 9], [11, 15]]);
});

test('two regions starting on one line: the longer stays, the other is dropped with a warning', () => {
	const result = normalizeFoldRegions([[1, 3], [1, 6]], 20);
	assert.deepEqual(result.regions, [[1, 6]]);
	assert.equal(result.warnings.length, 1);
	assert.match(result.warnings[0], /\[1, 3\].*line 1 already opens the fold \[1, 6\]/);
});

test('warnings come in a stable order: shape and fit first, then overlap', () => {
	const warnings = warningsOf([[3, 8], [2, 2], [1, 5], [4, 99]], 20);
	assert.equal(warnings.length, 4);
	assert.match(warnings[0], /\[2, 2\]/);
	assert.match(warnings[1], /\[4, 99\] ends after/);
	assert.match(warnings[2], /\[3, 8\].*crosses \[1, 5\]/);
	assert.match(warnings[3], /\[4, 20\] was skipped: it crosses \[1, 5\]/);
});

test('the input is not changed, and the output is new arrays', () => {
	const input = [[5, 40], [1, 3]];
	const copy = JSON.stringify(input);
	const { regions } = normalizeFoldRegions(input, 10);
	assert.equal(JSON.stringify(input), copy);
	assert.deepEqual(regions, [[1, 3], [5, 10]]);
	assert.notEqual(regions[0], input[1]);
});

test('innermostFirst: every region after the ones inside it', () => {
	const regions = regionsOf([[1, 20], [2, 10], [3, 5], [12, 15]], 30);
	assert.deepEqual(innermostFirst(regions), [[12, 15], [3, 5], [2, 10], [1, 20]]);
	assert.deepEqual(regions, [[1, 20], [2, 10], [3, 5], [12, 15]], 'the input is not changed');
	assert.deepEqual(innermostFirst([]), []);
	assert.deepEqual(innermostFirst(undefined), []);
});

test('foldRegionsFor: a list applies to every language', () => {
	const regions = [[1, 6]];
	assert.equal(foldRegionsFor(regions, 'python'), regions);
	assert.equal(foldRegionsFor(regions, 'javascript'), regions);
	assert.equal(foldRegionsFor(regions, undefined), regions);
});

test('foldRegionsFor: an object gives the entry of the language', () => {
	const perLanguage = { python: [[1, 6]], javascript: [[2, 4]] };
	assert.deepEqual(foldRegionsFor(perLanguage, 'python'), [[1, 6]]);
	assert.deepEqual(foldRegionsFor(perLanguage, 'javascript'), [[2, 4]]);
	assert.deepEqual(foldRegionsFor(perLanguage, 'go'), []);
});

test('foldRegionsFor: keys and languages match through languageInfo (case, aliases)', () => {
	assert.deepEqual(foldRegionsFor({ py: [[1, 6]] }, 'python'), [[1, 6]]);
	assert.deepEqual(foldRegionsFor({ python: [[1, 6]] }, 'py3'), [[1, 6]]);
	assert.deepEqual(foldRegionsFor({ Python: [[1, 6]] }, 'python'), [[1, 6]]);
	assert.deepEqual(foldRegionsFor({ cpp: [[3, 9]] }, 'c++'), [[3, 9]]);
	assert.deepEqual(foldRegionsFor({ 'c++': [[3, 9]] }, 'cpp'), [[3, 9]]);
	assert.deepEqual(foldRegionsFor({ python: [[1, 6]], py: [[2, 3]] }, 'python'), [[1, 6]], 'the exact key first');
});

test('foldRegionsFor: anything else is an empty list', () => {
	assert.deepEqual(foldRegionsFor(undefined, 'python'), []);
	assert.deepEqual(foldRegionsFor(null, 'python'), []);
	assert.deepEqual(foldRegionsFor('1-6', 'python'), []);
	assert.deepEqual(foldRegionsFor({ python: '1-6' }, 'python'), [], 'an entry that is not a list');
	assert.deepEqual(foldRegionsFor({ constructor: [[1, 2]] }, 'toString'), []);
	assert.deepEqual(foldRegionsFor({}, 'constructor'), [], 'never a prototype property');
});
