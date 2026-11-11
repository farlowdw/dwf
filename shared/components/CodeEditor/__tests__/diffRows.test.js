/**
 * diffRows.test.js — the diff rows list (../DiffRows.jsx), rendered on the server through
 * ./jsxHooks.js (no browser):
 *   - a <ul role="list"> of rows, each exactly as ExercisePanel.jsx draws the output diff: the
 *     sign hidden from screen readers, the side's prefix visually hidden on a changed row, then
 *     the text; a matching row with no prefix; the reader's row first in a changed pair;
 *   - the gap rows ("⋯ 8 matching lines", "… 3 more lines") in the muted look, without a prefix;
 *   - a panel's own side prefixes (`sidePrefix`), as the static solution panel passes them;
 *   - SIGNS and ROW_CLASSES cover every row kind;
 *   - PARITY: the list is a verbatim part of what ExercisePanel renders for the same comparison,
 *     before and after the panel imports this file.
 * Run with `npm run test:shared`.
 * To change it: a new row kind of ../DiffRows.jsx gets its entry in SIGNS and ROW_CLASSES there and a
 * test here.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: DiffRows, DiffRow, ROW_CLASSES, SIGNS } = await import('../DiffRows.jsx');
const { default: ExercisePanel, WORDS } = await import('../ExercisePanel.jsx');
const { DIFF_SIDES, ROW_KINDS, diffRows } = await import('../exerciseView.js');

/** Markup without MUI's emotion <style> tags and generated css-… classes (they are not under test). */
function render(element) {
	return renderToStaticMarkup(element)
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
		.replace(/ ?css-[\w-]+/g, '');
}

/** The library's diff of a run whose line 2 printed 20 instead of 2 (exerciseRender.test.js's case). */
const LINE_TWO_DIFFERS = Object.freeze([
	{ type: 'same', text: '1' },
	{ type: 'removed', text: '2' },
	{ type: 'added', text: '20' },
	{ type: 'same', text: '3' },
]);

const MATCHING_ROW = '<li class="diffRow"><span class="diffSign" aria-hidden="true"> </span><span>1</span></li>';
const READER_ROW = '<li class="diffRow diffRowRemoved"><span class="diffSign" aria-hidden="true">−</span><span class="visuallyHidden">Your output: </span><span>20</span></li>';
const EXPECTED_ROW = '<li class="diffRow diffRowAdded"><span class="diffSign" aria-hidden="true">+</span><span class="visuallyHidden">Expected: </span><span>2</span></li>';

test('the list: a <ul role="list">, each row with its sign, the side prefix for screen readers, and the text', () => {
	const html = render(createElement(DiffRows, { rows: diffRows(LINE_TWO_DIFFERS) }));
	assert.ok(html.startsWith('<ul role="list" class="diffRows">'), 'a list Safari keeps as one');
	assert.ok(html.endsWith('</ul>'));
	assert.ok(html.includes(MATCHING_ROW), 'a matching line: no prefix');
	assert.ok(html.includes(READER_ROW), "the reader's line: removed (red, −)");
	assert.ok(html.includes(EXPECTED_ROW), 'the expected line: added (green, +)');
	assert.ok(html.indexOf(READER_ROW) < html.indexOf(EXPECTED_ROW), "the reader's line first, as git and the Solution panel show a changed pair");
});

test('PARITY: the list is exactly what ExercisePanel draws for the same comparison', () => {
	const comparison = { matches: false, firstDifferentLine: 2, diff: LINE_TWO_DIFFERS };
	const panel = render(createElement(ExercisePanel, { expectedOutput: '1\n2\n3\n', comparison }));
	const list = render(createElement(DiffRows, { rows: diffRows(LINE_TWO_DIFFERS) }));
	assert.ok(panel.includes(list), 'the panel holds the list verbatim');
	assert.equal(panel.split('<ul role="list" class="diffRows">').length, 2, 'one list in the panel');
});

test('gap rows: "⋯ N matching lines" and "… N more lines" in the muted gap look, without a prefix', () => {
	const rows = [
		{ kind: ROW_KINDS.skip, count: 8 },
		{ kind: ROW_KINDS.added, text: 'x' },
		{ kind: ROW_KINDS.more, count: 3 },
	];
	const html = render(createElement(DiffRows, { rows }));
	assert.ok(html.includes(`<li class="diffRow diffRowGap"><span class="diffSign" aria-hidden="true">⋯</span><span>${WORDS.skipped(8)}</span></li>`));
	assert.ok(html.includes(`<li class="diffRow diffRowGap"><span class="diffSign" aria-hidden="true">…</span><span>${WORDS.more(3)}</span></li>`));
	assert.equal(html.split('visuallyHidden').length, 2, 'only the changed row carries a prefix');
});

test("a panel's own side prefixes (the static solution panel: your code, the solution)", () => {
	const sidePrefix = { yours: 'Your code: ', expected: 'The solution: ' };
	const rows = diffRows([{ type: 'same', text: 'a' }, { type: 'added', text: 'mine' }, { type: 'removed', text: 'theirs' }]);
	const html = render(createElement(DiffRows, { rows, sidePrefix }));
	assert.ok(html.includes('<span class="visuallyHidden">Your code: </span><span>mine</span>'));
	assert.ok(html.includes('<span class="visuallyHidden">The solution: </span><span>theirs</span>'));
	assert.ok(html.includes('<li class="diffRow"><span class="diffSign" aria-hidden="true"> </span><span>a</span></li>'), 'a matching row: still no prefix');
	assert.doesNotMatch(html, /Your output|Expected: /);
});

test('an empty diff: an empty list (the panel decides whether to show it)', () => {
	assert.equal(render(createElement(DiffRows, { rows: [] })), '<ul role="list" class="diffRows"></ul>');
});

test('one row on its own (DiffRow), and the default prefixes are ExercisePanel\'s words', () => {
	const html = render(createElement(DiffRow, { row: { kind: ROW_KINDS.removed, text: 'z' } }));
	assert.equal(html, `<li class="diffRow diffRowRemoved"><span class="diffSign" aria-hidden="true">−</span><span class="visuallyHidden">${WORDS.sidePrefix.yours}</span><span>z</span></li>`);
});

test('SIGNS and ROW_CLASSES: one entry per row kind; the sides map onto changed rows only', () => {
	const kinds = Object.values(ROW_KINDS);
	assert.deepEqual(Object.keys(SIGNS).sort(), [...kinds].sort());
	assert.deepEqual(Object.keys(ROW_CLASSES).sort(), [...kinds].sort());
	assert.deepEqual(SIGNS, { same: ' ', added: '+', removed: '−', skip: '⋯', more: '…' });
	assert.equal(SIGNS.removed, '−', 'U+2212, the same minus as the site\'s removed code lines');
	assert.deepEqual(ROW_CLASSES, { same: null, added: 'diffRowAdded', removed: 'diffRowRemoved', skip: 'diffRowGap', more: 'diffRowGap' });
	assert.deepEqual(Object.keys(DIFF_SIDES).sort(), ['added', 'removed']);
});
