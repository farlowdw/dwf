/**
 * stepBar.test.js — the step bar (../StepBar.jsx), rendered on the server through this folder's
 * module hooks (jsxHooks.js), and its buttons pressed by calling the component directly (it has
 * no hooks): "Step 2 of 4", the title, the note with its inline code, the polite live region
 * that says the counter, the lines and the title (the visible ones are hidden from screen
 * readers), Previous / Next aria-disabled at the ends (so they keep the focus) and doing
 * nothing there, the placeholder's inert bar (the same element tree, buttons disabled), a bad
 * index kept within the steps, a single step (both ends at once), steps straight from the run
 * library's normalizeSteps, no steps: no bar; the stale bar after Clear (muted, buttons
 * disabled, the note asking for Reset, and only that said), and the words useGuided.js reuses
 * (spokenRanges, stepSpeech: exactly what the live region says). Run with `npm run test:shared`.
 * To change it: a new part of ../StepBar.jsx, or a new word useGuided.js reuses, gets a test here.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: StepBar, WORDS, clampStepIndex, spokenRanges, stepAfter, stepAnnouncement, stepSpeech } = await import('../StepBar.jsx');
const { normalizeSteps } = await import('../lib/codeRunner/steps.js');

const STEPS = Object.freeze([
	{ ranges: [[1, 2]], note: 'Read `n` and start the total at `0`.', title: 'Set up' },
	{ ranges: [[3, 5]], note: 'The loop fills `dp[i]` from the two cells before it.', title: 'Building the table' },
	{ ranges: [[8, 8]], note: 'Print the answer.', title: '' },
	{ ranges: [[3, 5], [8, 8]], note: '', title: 'Both' },
]);

const noop = () => {};

/** The bar's markup for these props. */
function render(props) {
	return renderToStaticMarkup(createElement(StepBar, props));
}

/** The two <button> tags of a render: [previous, next]. */
function buttonsOf(html) {
	return [...html.matchAll(/<button[^>]*>/g)].map((match) => match[0]);
}

/** The live region's text (tags removed). */
function liveTextOf(html) {
	const match = html.match(/<div class="[^"]*" aria-live="polite" aria-atomic="true">([\s\S]*?)<\/div>/);
	assert.ok(match, 'the note is a polite, atomic live region');
	return match[1].replace(/<[^>]+>/g, '');
}

/** The tag names of a piece of markup, in order (its element tree, without attributes or text). */
function tagsOf(html) {
	return [...html.matchAll(/<\/?([a-z]+)/g)].map((match) => match[0]);
}

/**
 * The element tree of a component call, with every function component expanded by calling it
 * (none of these has hooks): what the server would render, as objects with their props.
 */
function expand(node) {
	if (Array.isArray(node)) return node.map(expand);
	if (!node || typeof node !== 'object') return node;
	if (typeof node.type === 'function') return expand(node.type(node.props));
	return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}

/** Every <button> element of an expanded tree, in order. */
function buttonElements(tree, found = []) {
	if (Array.isArray(tree)) {
		for (const child of tree) buttonElements(child, found);
		return found;
	}
	if (!tree || typeof tree !== 'object') return found;
	if (tree.type === 'button') found.push(tree);
	buttonElements(tree.props?.children, found);
	return found;
}

/** Press [previous, next] of a bar drawn with `props`; returns what onStepChange received. */
function press(props, which) {
	const calls = [];
	const tree = expand(StepBar({ ...props, onStepChange: props.onStepChange === null ? null : (index) => calls.push(index) }));
	const [previous, next] = buttonElements(tree);
	(which === 'previous' ? previous : next).props.onClick();
	return calls;
}

test('a middle step: the counter, the title, both buttons on, the note with its inline code', () => {
	const html = render({ steps: STEPS, index: 1, onStepChange: noop });
	assert.match(html, new RegExp(`^<div class="stepBar" role="group" aria-label="${WORDS.group}">`));
	assert.ok(html.includes('<span class="stepCount" aria-hidden="true">Step 2 of 4</span>'));
	assert.ok(html.includes('<span class="stepTitle" aria-hidden="true">Building the table</span>'));
	const [previous, next] = buttonsOf(html);
	assert.match(previous, /aria-label="Previous step"/);
	assert.match(next, /aria-label="Next step"/);
	for (const button of [previous, next]) {
		assert.match(button, /type="button"/);
		assert.doesNotMatch(button, /disabled/, 'neither disabled nor aria-disabled');
	}
	assert.ok(html.includes('The loop fills <code>dp[i]</code> from the two cells before it.'));
	assert.match(html, /<span>Previous<\/span>/, 'the visible word');
	assert.equal([...html.matchAll(/<svg class="chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">/g)].length, 2);
});

test('the live region says the counter, the lines and the title, then the note', () => {
	const html = render({ steps: STEPS, index: 1, onStepChange: noop });
	assert.equal(liveTextOf(html), 'Step 2 of 4, lines 3 to 5: Building the table. The loop fills dp[i] from the two cells before it.');
	assert.match(html, /<span class="visuallyHidden">Step 2 of 4, lines 3 to 5: Building the table\. <\/span>/);
});

test('the announcement: one line, several ranges, no title, no lines', () => {
	assert.equal(stepAnnouncement(STEPS[2], 2, 4), 'Step 3 of 4, line 8.');
	assert.equal(stepAnnouncement(STEPS[3], 3, 4), 'Step 4 of 4, lines 3 to 5, 8: Both.', 'a range in words: screen readers do not all read a hyphen as "to"');
	assert.equal(stepAnnouncement({ ranges: [], note: 'x', title: 'Only a title' }, 0, 2), 'Step 1 of 2: Only a title.');
	assert.equal(stepAnnouncement({ note: 'x' }, 0, 1), 'Step 1 of 1.');
	assert.equal(stepAnnouncement({ ranges: [[2, 2]], title: 'Why a set? ' }, 0, 1), 'Step 1 of 1, line 2: Why a set?', 'a title with its own mark gets no full stop');
});

test('the ends: Previous on the first step and Next on the last are aria-disabled, never disabled (the focus stays)', () => {
	const [firstPrevious, firstNext] = buttonsOf(render({ steps: STEPS, index: 0, onStepChange: noop }));
	assert.match(firstPrevious, /aria-disabled="true"/);
	assert.doesNotMatch(firstPrevious, / disabled=""/);
	assert.doesNotMatch(firstNext, /disabled/);
	const [lastPrevious, lastNext] = buttonsOf(render({ steps: STEPS, index: 3, onStepChange: noop }));
	assert.doesNotMatch(lastPrevious, /disabled/);
	assert.match(lastNext, /aria-disabled="true"/);
	assert.doesNotMatch(lastNext, / disabled=""/);
});

test('pressing the buttons: Next and Previous move one step; at the ends they do nothing', () => {
	assert.deepEqual(press({ steps: STEPS, index: 1 }, 'next'), [2]);
	assert.deepEqual(press({ steps: STEPS, index: 1 }, 'previous'), [0]);
	assert.deepEqual(press({ steps: STEPS, index: 0 }, 'previous'), [], 'the first step has no previous');
	assert.deepEqual(press({ steps: STEPS, index: 3 }, 'next'), [], 'the last step has no next');
});

test("the placeholder's bar (no onStepChange): buttons disabled, nothing else changes, the same element tree", () => {
	const placeholder = render({ steps: STEPS });
	for (const button of buttonsOf(placeholder)) {
		assert.match(button, / disabled=""/);
		assert.doesNotMatch(button, /aria-disabled/);
	}
	assert.ok(placeholder.includes('Step 1 of 4'), 'the first step');
	const real = render({ steps: STEPS, index: 0, onStepChange: noop });
	assert.deepEqual(tagsOf(placeholder), tagsOf(real), 'so the editor replaces it without a jump');
	assert.deepEqual(press({ steps: STEPS, index: 0, onStepChange: null }, 'next'), [], 'a click does nothing');
});

test('a step without a note: the note keeps only the spoken line and loses its gap', () => {
	const html = render({ steps: STEPS, index: 3, onStepChange: noop });
	assert.match(html, /<div class="stepNote stepNoteEmpty" aria-live="polite"/);
	assert.equal(liveTextOf(html), 'Step 4 of 4, lines 3 to 5, 8: Both. ');
	const withNote = render({ steps: STEPS, index: 2, onStepChange: noop });
	assert.match(withNote, /<div class="stepNote" aria-live="polite"/);
	assert.doesNotMatch(withNote, /class="stepTitle"/, 'no title: no title element');
});

test('a note is text: tags in it are shown, not run', () => {
	const html = render({ steps: [{ ranges: [[1, 1]], note: '<b>bold</b> and `<i>`', title: '' }], onStepChange: noop });
	assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt; and <code>&lt;i&gt;</code>'));
});

test('a bad index is kept within the steps; no steps: no bar', () => {
	assert.ok(render({ steps: STEPS, index: 9, onStepChange: noop }).includes('Step 4 of 4'));
	assert.ok(render({ steps: STEPS, index: -2, onStepChange: noop }).includes('Step 1 of 4'));
	assert.ok(render({ steps: STEPS, index: 'x', onStepChange: noop }).includes('Step 1 of 4'));
	assert.equal(render({ steps: [], onStepChange: noop }), '');
	assert.equal(render({ onStepChange: noop }), '');
});

test('clampStepIndex and stepAfter', () => {
	assert.equal(clampStepIndex(2, 4), 2);
	assert.equal(clampStepIndex(7, 4), 3);
	assert.equal(clampStepIndex(-1, 4), 0);
	assert.equal(clampStepIndex(1.5, 4), 0);
	assert.equal(clampStepIndex(0, 0), 0);
	assert.equal(stepAfter(1, 1, 4), 2);
	assert.equal(stepAfter(3, 1, 4), 3);
	assert.equal(stepAfter(0, -1, 4), 0);
	assert.equal(stepAfter(10, -1, 4), 2, 'from a bad index: first kept within the steps, then moved');
});

test('a single step: both buttons aria-disabled at once, and neither moves', () => {
	const one = [{ ranges: [[2, 2]], note: 'Only this.', title: null }];
	const html = render({ steps: one, index: 0, onStepChange: noop });
	assert.ok(html.includes('Step 1 of 1'));
	for (const button of buttonsOf(html)) assert.match(button, /aria-disabled="true"/);
	assert.deepEqual(press({ steps: one, index: 0 }, 'previous'), []);
	assert.deepEqual(press({ steps: one, index: 0 }, 'next'), []);
	assert.equal(liveTextOf(html), 'Step 1 of 1, line 2. Only this.');
});

test("steps as the run library's normalizeSteps gives them (title null, note trimmed, ranges merged)", () => {
	const steps = normalizeSteps(
		[
			{ lines: '4-5, 6', note: '  The loop builds `result`.  ' },
			{ lines: [10, 11], title: 'Output', note: 'Prints it.' },
		],
		{ lineCount: 11, warn: assert.fail },
	);
	const first = render({ steps, index: 0, onStepChange: noop });
	assert.doesNotMatch(first, /class="stepTitle"/, 'title null: no title element');
	assert.equal(liveTextOf(first), 'Step 1 of 2, lines 4 to 6. The loop builds result.');
	const second = render({ steps, index: 1, onStepChange: noop });
	assert.equal(liveTextOf(second), 'Step 2 of 2, lines 10 to 11: Output. Prints it.');
});

test('a stale bar (after Clear or "Use this solution"): muted, both buttons disabled, the note asks for Reset and is all it says', () => {
	const html = render({ steps: STEPS, index: 1, onStepChange: noop, stale: true });
	assert.match(html, /^<div class="stepBar stepBarStale" role="group"/);
	assert.ok(html.includes('Step 2 of 4'), 'the counter stays (muted by the stylesheet)');
	for (const button of buttonsOf(html)) assert.match(button, / disabled=""/);
	assert.equal(liveTextOf(html), WORDS.stale);
	assert.deepEqual(press({ steps: STEPS, index: 1, stale: true }, 'next'), [], 'a click does nothing');
	assert.deepEqual(tagsOf(render({ steps: STEPS, index: 3, onStepChange: noop, stale: true })).slice(0, 3), ['<div', '<div', '<span'], 'the same frame');
});

test('spokenRanges: the lines as a screen reader is told them; junk is left out', () => {
	assert.equal(spokenRanges([[8, 8]]), 'line 8');
	assert.equal(spokenRanges([[3, 5], [8, 8]]), 'lines 3 to 5, 8');
	assert.equal(spokenRanges([[0, 2], 'x', [5, 4]]), '');
	assert.equal(spokenRanges(undefined), '');
});

test("stepSpeech: exactly what the bar's live region says (its code spans as plain words)", () => {
	for (const index of [0, 1, 2, 3]) {
		const html = render({ steps: STEPS, index, onStepChange: noop });
		assert.equal(stepSpeech(STEPS[index], index, STEPS.length), liveTextOf(html).trim(), `step ${index + 1}`);
	}
});
