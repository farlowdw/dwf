/**
 * sizing.test.js — the editor box's height (../sizing.js): CSS lengths from props (and the ones
 * refused with a warning: a percentage, a keyword, 0 or less), the `height` prop read as a fixed
 * height or fit-the-content (readHeightProp: 'fit' in any case, a length, nothing or a refused
 * length -> the default 50vh), Monaco's line height, line counts, the last line a fold can end
 * on, the lines folds hide (nested folds counted once), the estimate drawn before Monaco loads,
 * the box's inline style in both modes, and the stdin field's rows. Run with `npm run test:shared`.
 * To change it: a new length rule or box mode of ../sizing.js gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_HEIGHT,
	DEFAULT_MAX_HEIGHT,
	FIT_HEIGHT,
	MIN_HEIGHT_PX,
	STDIN_MAX_ROWS,
	STDIN_MIN_ROWS,
	editorBoxStyle,
	estimateContentHeight,
	hiddenLineCount,
	lastFoldableLineOf,
	lineCountOf,
	lineHeightPx,
	readHeightProp,
	stdinRows,
	toCssLength,
} from '../sizing.js';

/** toCssLength with its warnings collected: [result, warnings]. */
function lengthOf(value, prop = 'height') {
	const warnings = [];
	const result = toCssLength(value, { prop, warn: (message) => warnings.push(message) });
	return [result, warnings];
}

/** readHeightProp with its warnings collected: [result, warnings]. */
function heightOf(value) {
	const warnings = [];
	const result = readHeightProp(value, { warn: (message) => warnings.push(message) });
	return [result, warnings];
}

/** The end of the warning for a refused `height`: the default applies. */
const HEIGHT_REFUSED_END = `the default height \\(${DEFAULT_HEIGHT}\\) applies\\.$`;

test('toCssLength: numbers and plain numbers are px; lengths with a unit and CSS functions are kept; no value is nothing', () => {
	const cases = [
		[400, '400px'],
		['400', '400px'],
		[' 320.5 ', '320.5px'],
		['50vh', '50vh'],
		['24rem', '24rem'],
		['.5em', '.5em'],
		['calc(100vh - 10rem)', 'calc(100vh - 10rem)'],
		['min(50vh, 30rem)', 'min(50vh, 30rem)'],
		['var(--editor-height)', 'var(--editor-height)'],
		['', undefined],
		['   ', undefined],
		[undefined, undefined],
		[null, undefined],
	];
	for (const [value, expected] of cases) {
		const [result, warnings] = lengthOf(value);
		assert.equal(result, expected, String(value));
		assert.deepEqual(warnings, [], `${String(value)}: no warning`);
	}
});

test('toCssLength refuses a percentage, a keyword, 0 or less and junk, with a warning naming the prop', () => {
	const refused = ['100%', 'calc(100% - 2rem)', 'auto', 'fit-content', 'none', '0', '0px', '-5rem', '-5', 0, -5, Number.NaN, {}, true, '50 vh'];
	for (const value of refused) {
		const [result, warnings] = lengthOf(value);
		assert.equal(result, undefined, String(value));
		assert.equal(warnings.length, 1, `${String(value)}: one warning`);
		assert.match(warnings[0], new RegExp(`^CodeEditor height: .+ was ignored \\(.+\\); ${HEIGHT_REFUSED_END}`));
	}
	assert.match(lengthOf('100%')[1][0], /^CodeEditor height: '100%' was ignored \(a percentage has nothing to measure against here\)/);
	assert.match(lengthOf('auto')[1][0], /a keyword is not a length/);
	assert.match(lengthOf('0px')[1][0], /it must be more than 0/);
	const [maxHeight, maxWarnings] = lengthOf('50%', 'maxHeight');
	assert.equal(maxHeight, undefined);
	assert.match(maxWarnings[0], new RegExp(`^CodeEditor maxHeight: '50%' was ignored .*the default ceiling \\(${DEFAULT_MAX_HEIGHT}\\) applies\\.$`));
});

test("readHeightProp: 'fit' (any case, any spaces around it) is fit-the-content, with no height and no warning", () => {
	assert.equal(FIT_HEIGHT, 'fit');
	for (const value of ['fit', ' FIT ', 'Fit', '\tfit\n']) {
		const [result, warnings] = heightOf(value);
		assert.deepEqual(result, { height: null, fit: true }, JSON.stringify(value));
		assert.deepEqual(warnings, [], `${JSON.stringify(value)}: no warning`);
	}
	const [length] = lengthOf('fit');
	assert.equal(length, undefined, "toCssLength alone refuses 'fit' (a keyword): readHeightProp must take it first");
});

test('readHeightProp: a usable length is a fixed height; nothing at all is the default (50vh), silently', () => {
	assert.equal(DEFAULT_HEIGHT, '50vh', "the original editor's size");
	const cases = [
		[400, '400px'],
		['400', '400px'],
		['24rem', '24rem'],
		[' 50vh ', '50vh'],
		['calc(100vh - 10rem)', 'calc(100vh - 10rem)'],
		[undefined, DEFAULT_HEIGHT],
		[null, DEFAULT_HEIGHT],
		['', DEFAULT_HEIGHT],
		['   ', DEFAULT_HEIGHT],
	];
	for (const [value, height] of cases) {
		const [result, warnings] = heightOf(value);
		assert.deepEqual(result, { height, fit: false }, JSON.stringify(value));
		assert.deepEqual(warnings, [], `${JSON.stringify(value)}: no warning`);
	}
});

test('readHeightProp: a refused length warns once and the default height applies (never fit-the-content)', () => {
	const refused = ['100%', 'auto', 'fit-content', 'fits', 'fit 50vh', 0, -5, '0px', {}, true, Number.NaN];
	for (const value of refused) {
		const [result, warnings] = heightOf(value);
		assert.deepEqual(result, { height: DEFAULT_HEIGHT, fit: false }, String(value));
		assert.equal(warnings.length, 1, `${String(value)}: one warning`);
		assert.match(warnings[0], new RegExp(`^CodeEditor height: .+ was ignored \\(.+\\); ${HEIGHT_REFUSED_END}`));
	}
	assert.match(heightOf('100%')[1][0], /^CodeEditor height: '100%' was ignored \(a percentage has nothing to measure against here\); the default height \(50vh\) applies\.$/);
});

test('lineHeightPx follows Monaco: a ratio below 8 times the font size, rounded, at least 8 px', () => {
	assert.equal(lineHeightPx({ fontSize: 14, lineHeight: 1.5 }), 21);
	assert.equal(lineHeightPx({ fontSize: 14 }), 21, "no lineHeight: Monaco's own 1.5");
	assert.equal(lineHeightPx({}), 21, 'no options: 14 px × 1.5');
	assert.equal(lineHeightPx({ fontSize: 16, lineHeight: 24 }), 24, 'a value of 8 or more is px');
	assert.equal(lineHeightPx({ fontSize: 13, lineHeight: 1.5 }), 20, '19.5 rounds to 20');
	assert.equal(lineHeightPx({ fontSize: 14, lineHeight: 0.4 }), 8, 'never below 8 px');
});

test('lineCountOf counts like Monaco (a final newline starts one more line)', () => {
	assert.equal(lineCountOf(''), 1);
	assert.equal(lineCountOf('a'), 1);
	assert.equal(lineCountOf('a\nb'), 2);
	assert.equal(lineCountOf('a\nb\n'), 3);
	assert.equal(lineCountOf(undefined), 1);
});

test('lastFoldableLineOf: the last line, or the one before it when the code ends with a newline', () => {
	assert.equal(lastFoldableLineOf('a\nb\nc'), 3);
	assert.equal(lastFoldableLineOf('a\nb\nc\n'), 3, 'line 4 is the empty line after the final newline');
	assert.equal(lastFoldableLineOf('a\nb\n\n'), 3, 'only the very last line is left out: an empty line 3 can still end a fold');
	assert.equal(lastFoldableLineOf('\n'), 1);
	assert.equal(lastFoldableLineOf(''), 1);
});

test('hiddenLineCount: lines start+1 … end of each fold, nested folds counted once', () => {
	assert.equal(hiddenLineCount([[1, 6]]), 5, 'the blog post: lines 2-6');
	assert.equal(hiddenLineCount([[1, 3], [5, 8]]), 5);
	assert.equal(hiddenLineCount([[5, 8], [1, 3]]), 5, 'order does not matter');
	assert.equal(hiddenLineCount([[1, 10], [3, 5]]), 9, 'a fold inside another hides nothing more');
	assert.equal(hiddenLineCount([]), 0);
	assert.equal(hiddenLineCount(undefined), 0);
	assert.equal(hiddenLineCount([[2, 4], 'junk']), 2);
});

test('estimateContentHeight: visible lines × line height + padding (at least one line)', () => {
	assert.equal(estimateContentHeight({ lineCount: 26, hiddenLines: 5, lineHeight: 21, paddingTop: 8, paddingBottom: 8 }), 21 * 21 + 16);
	assert.equal(estimateContentHeight({ lineCount: 3, lineHeight: 20 }), 60);
	assert.equal(estimateContentHeight({ lineCount: 2, hiddenLines: 5, lineHeight: 20 }), 20, 'never fewer than one line');
});

test('editorBoxStyle, a fixed height: the height as it is (the default when there is none); the content does not matter', () => {
	assert.deepEqual(editorBoxStyle({ height: '24rem', contentHeight: 999 }), { height: '24rem' });
	assert.deepEqual(editorBoxStyle({ height: '24rem', fit: false, maxHeight: '30rem', contentHeight: 10 }), { height: '24rem' }, 'no min / max in this mode');
	assert.deepEqual(editorBoxStyle({ contentHeight: 999 }), { height: DEFAULT_HEIGHT }, 'no height: 50vh, not the content');
	assert.deepEqual(editorBoxStyle({ height: null, contentHeight: 999 }), { height: DEFAULT_HEIGHT });
	assert.deepEqual(editorBoxStyle({ height: '', contentHeight: 999 }), { height: DEFAULT_HEIGHT });
});

test('editorBoxStyle, fit the content: the content height (rounded) clamped by CSS between the minimum and maxHeight', () => {
	assert.deepEqual(editorBoxStyle({ fit: true, contentHeight: 456.6, maxHeight: '30rem' }), {
		height: '457px',
		minHeight: `${MIN_HEIGHT_PX}px`,
		maxHeight: '30rem',
	});
	assert.deepEqual(editorBoxStyle({ height: '24rem', fit: true, contentHeight: 300 }), {
		height: '300px',
		minHeight: `${MIN_HEIGHT_PX}px`,
		maxHeight: DEFAULT_MAX_HEIGHT,
	}, 'fit wins over a height; maxHeight defaults to 60vh');
	assert.equal(editorBoxStyle({ fit: true, contentHeight: 37 }).height, '37px', 'a short snippet: CSS min-height does the clamping');
	assert.equal(editorBoxStyle({ fit: true, contentHeight: 10 }).maxHeight, DEFAULT_MAX_HEIGHT);
});

test("stdinRows: one row per line of the field's text, between the field's minimum and maximum", () => {
	assert.equal(stdinRows(''), STDIN_MIN_ROWS);
	assert.equal(stdinRows('5'), STDIN_MIN_ROWS);
	assert.equal(stdinRows('5\n1 2 3\n4'), 3);
	assert.equal(stdinRows('5\n1 2 3\n'), 3, 'a final newline starts one more row, as in the field');
	assert.equal(stdinRows(Array.from({ length: 40 }, (_, index) => index).join('\n')), STDIN_MAX_ROWS);
	assert.equal(stdinRows(undefined), STDIN_MIN_ROWS);
});
