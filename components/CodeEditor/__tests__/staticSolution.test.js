/**
 * staticSolution.test.js — the static view's Solution panel (../StaticSolution.jsx), rendered on
 * the server through ./jsxHooks.js (no browser, no Monaco):
 *   - solutionRows: the reader's lines are the removed (−) rows, the solution's the added (+)
 *     rows, EVERY matching line shown (no "⋯ N matching lines" gap: STATIC_DIFF_CONTEXT), at most
 *     STATIC_DIFF_MAX_ROWS rows and then one "… N more lines" row;
 *   - the frame: a titled region with the given id, the colour key hidden from screen readers,
 *     "Use this solution" with the static tooltip (Reset brings the PAGE's code back: no undo
 *     stack without Monaco), greyed out while the language shows a restored draft (`restored`:
 *     the draft would be lost; Tap to edit first), and "Close", the empty live region, then the rows in a focusable region
 *     with the panel's own side prefixes ("Your code: ", "The solution: ");
 *   - the same code: the "already the solution" note, "Use this solution" greyed out, no rows;
 *   - an empty solution: greyed out, no note; code differing only in spaces at line ends: its own
 *     note, "Use this solution" still usable;
 *   - the colour key follows the theme's diff (editorThemes.js > diffKeyOf): VS Code's from the
 *     stylesheet, a custom theme's colours inline, a high-contrast theme outlined — and the rows'
 *     box carries the outlined class then, so the bands go and the signs take the colours;
 *   - the stylesheet: every class the panel uses exists, the band bridge reads the key's
 *     properties, the box scrolls past --sp-max-height.
 * Run with `npm run test:shared`.
 * To change it: a new state of ../StaticSolution.jsx gets a test here; the row limits are its
 * STATIC_DIFF_CONTEXT and STATIC_DIFF_MAX_ROWS.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: StaticSolution, STATIC_DIFF_CONTEXT, STATIC_DIFF_MAX_ROWS, WORDS, blockedReasonOf, solutionRows } = await import('../StaticSolution.jsx');
const { WORDS: SOLUTION_WORDS } = await import('../SolutionPanel.jsx');
const { diffKeyOf } = await import('../editorThemes.js');
const { ROW_KINDS } = await import('../exerciseView.js');

/** Markup without MUI's emotion <style> tags and generated css-… classes (they are not under test). */
function render(element) {
	return renderToStaticMarkup(element)
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
		.replace(/ ?css-[\w-]+/g, '');
}

/** The panel's props (the theme as useEditorTheme.js gives it: only its name is read here). */
function props(overrides = {}) {
	return {
		id: 'solution-1',
		readerCode: 'def f(x):\n    return x\n',
		solution: 'def f(x):\n    return x * 2\n',
		theme: { name: 'vs-dark' },
		onUse() {},
		onClose() {},
		...overrides,
	};
}

/** `count` lines "line 1" … "line count", joined with newlines (and a final one). */
function lines(count, prefix = 'line ') {
	return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`).join('\n') + '\n';
}

test('solutionRows: a two-line change, the reader\'s line as the removed row, the solution\'s as the added one, the rest as matching rows', () => {
	const rows = solutionRows('a\nb\nc\n', 'a\nB\nc\n');
	assert.deepEqual(rows, [
		{ kind: ROW_KINDS.same, text: 'a' },
		{ kind: ROW_KINDS.removed, text: 'b' },
		{ kind: ROW_KINDS.added, text: 'B' },
		{ kind: ROW_KINDS.same, text: 'c' },
	]);
	assert.deepEqual(solutionRows('x = 1\n', 'x = 1\n'), [], 'nothing differs: no rows');
});

test('solutionRows: every matching line is shown (the rows read as the code), however far from the change', () => {
	assert.equal(STATIC_DIFF_CONTEXT, Number.POSITIVE_INFINITY);
	const rows = solutionRows(lines(30), `${lines(29)}changed\n`);
	assert.equal(rows.length, 31, '29 matching rows, the reader\'s line, the solution\'s line');
	assert.ok(rows.every((row) => row.kind !== ROW_KINDS.skip), 'no "matching lines" gap');
	assert.deepEqual(rows.slice(-2), [{ kind: ROW_KINDS.removed, text: 'line 30' }, { kind: ROW_KINDS.added, text: 'changed' }]);
});

test('solutionRows: at most STATIC_DIFF_MAX_ROWS rows, then one "more" row counting the rest', () => {
	assert.equal(STATIC_DIFF_MAX_ROWS, 400);
	const rows = solutionRows(lines(300, 'mine '), lines(300, 'theirs '));
	assert.equal(rows.length, STATIC_DIFF_MAX_ROWS + 1);
	assert.deepEqual(rows[STATIC_DIFF_MAX_ROWS], { kind: ROW_KINDS.more, count: 600 - STATIC_DIFF_MAX_ROWS });
	assert.equal(solutionRows(lines(3, 'a'), lines(3, 'b'), { maxRows: 2 }).length, 3, 'the options may be narrowed');
});

test('the frame: a titled region with the id, the key hidden from screen readers, the two buttons, then the rows region', () => {
	const html = render(createElement(StaticSolution, props()));
	const labelledBy = html.match(/^<section id="solution-1" class="solution" aria-labelledby="([^"]+)">/)?.[1];
	assert.ok(labelledBy, 'a section with the given id, named by its title');
	assert.ok(html.includes(`<span id="${labelledBy}" class="title">${SOLUTION_WORDS.title}</span>`));
	assert.ok(html.includes('<span class="key" aria-hidden="true"><span class="keyItem"><span class="swatch swatchYours"></span>your code</span><span class="keyItem"><span class="swatch swatchSolution"></span>the solution</span></span>'));
	assert.match(html, /<button[^>]*MuiButton-contained[^>]*>Use this solution<\/button>/);
	assert.doesNotMatch(html.match(/<button[^>]*>Use this solution/)[0], /disabled/);
	assert.match(html, /<button[^>]*MuiButton-text[^>]*>Close<\/button>/);
	assert.doesNotMatch(html, /<span[^>]*tooltipAnchor[^>]*aria-label=/, 'the tooltip wrapper carries no aria-label');
	assert.ok(html.includes(`<div aria-live="polite"></div><div class="rows" role="region" aria-label="${WORDS.diffLabel}" tabindex="0"><ul role="list" class="diffRows">`), 'the empty live region, then the focusable rows region');
	assert.ok(html.endsWith('</ul></div></section>'));
});

test('the rows: the reader\'s line as "Your code: ", the solution\'s as "The solution: ", the matching line plain', () => {
	const html = render(createElement(StaticSolution, props()));
	assert.ok(html.includes('<li class="diffRow"><span class="diffSign" aria-hidden="true"> </span><span>def f(x):</span></li>'));
	const readerRow = '<li class="diffRow diffRowRemoved"><span class="diffSign" aria-hidden="true">−</span><span class="visuallyHidden">Your code: </span><span>    return x</span></li>';
	const solutionRow = '<li class="diffRow diffRowAdded"><span class="diffSign" aria-hidden="true">+</span><span class="visuallyHidden">The solution: </span><span>    return x * 2</span></li>';
	assert.ok(html.includes(readerRow));
	assert.ok(html.includes(solutionRow));
	assert.ok(html.indexOf(readerRow) < html.indexOf(solutionRow), "the reader's line first");
	assert.deepEqual(WORDS.sidePrefix, { yours: `${SOLUTION_WORDS.yourCode}: `, expected: `${SOLUTION_WORDS.theSolution}: ` }, "built from the Monaco panel's side names");
});

test('"Use this solution" says what it does here: no undo without Monaco, Reset brings the PAGE\'s code back (never "your code": a restored draft would not come back)', () => {
	assert.equal(WORDS.useTooltipStatic, "Put the solution in (Reset brings the page's code back)");
	assert.doesNotMatch(WORDS.useTooltipStatic, /your code/i, 'Reset restores the snippet, not the reader\'s draft');
	// MUI's Tooltip draws its title only in the browser (on hover / focus): the wiring is checked in the source.
	const source = readFileSync(new URL('../StaticSolution.jsx', import.meta.url), 'utf8');
	assert.match(source, /<Tooltip title=\{blockedReason \?\? WORDS\.useTooltipStatic\}>/, 'the static tooltip when the button can be used');
	assert.doesNotMatch(source, /useTooltip\b/, "never the Monaco panel's undo tooltip");
	const html = render(createElement(StaticSolution, props()));
	assert.match(html, /<span class="tooltipAnchor" data-mui-internal-clone-element="true"><button[^>]*>Use this solution<\/button><\/span>/, 'the button sits in the tooltip wrapper');
});

test('a restored draft (`restored`): "Use this solution" greyed out with the Tap-to-edit tooltip, the rows still shown; the empty and same reasons come first', () => {
	const html = render(createElement(StaticSolution, props({ restored: true })));
	assert.match(html, /<button[^>]*disabled=""[^>]*>Use this solution<\/button>/, 'greyed out: the static view has no undo, and the replacement would be saved over the draft');
	assert.ok(html.includes('<li class="diffRow diffRowRemoved">'), 'the diff still shows');
	assert.ok(!html.includes('<p class="same">'), 'no note: the code is not the solution');
	assert.equal(blockedReasonOf({ same: false, empty: false, restored: true }), WORDS.restoredTooltip);
	assert.match(WORDS.restoredTooltip, /Tap to edit first/, 'the way out is named');
	assert.equal(blockedReasonOf({ same: false, empty: true, restored: true }), WORDS.emptyTooltip, 'nothing to use comes first');
	assert.equal(blockedReasonOf({ same: true, empty: false, restored: true }), WORDS.sameTooltip);
	assert.equal(blockedReasonOf({ same: false, empty: false }), null, 'the default: usable');
	const usable = render(createElement(StaticSolution, props()));
	assert.doesNotMatch(usable, /<button[^>]*disabled=""[^>]*>Use this solution<\/button>/, 'without a restored draft the button works');
});

test('the same code (line endings and the very end aside): the note, "Use this solution" greyed out, no rows', () => {
	const html = render(createElement(StaticSolution, props({ readerCode: 'x = 1\r\n', solution: 'x = 1' })));
	assert.ok(html.includes(`<div aria-live="polite"><p class="same">${SOLUTION_WORDS.same}</p></div>`));
	assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="${SOLUTION_WORDS.sameTooltip}"|<button[^>]*disabled=""[^>]*>Use this solution/);
	assert.ok(html.includes('<ul role="list" class="diffRows"></ul>'), 'an empty list');
});

test('an empty solution (none for this language): "Use this solution" greyed out, no note, no rows', () => {
	for (const solution of ['', '  \n', undefined]) {
		const html = render(createElement(StaticSolution, props({ solution })));
		assert.match(html, /<button[^>]*disabled=""[^>]*>Use this solution<\/button>/, JSON.stringify(solution));
		assert.ok(html.includes('<div aria-live="polite"></div>'), 'no note');
		assert.ok(html.includes('<ul role="list" class="diffRows"></ul>'), 'no rows');
	}
});

test('code that differs only in spaces at the ends of lines: no rows, its own note, "Use this solution" still usable', () => {
	const html = render(createElement(StaticSolution, props({ readerCode: 'x = 1 \ny = 2\n', solution: 'x = 1\ny = 2\n' })));
	assert.ok(html.includes(`<div aria-live="polite"><p class="same">${WORDS.onlyBlanksDiffer}</p></div>`));
	assert.doesNotMatch(html.match(/<button[^>]*>Use this solution/)[0], /disabled/);
	assert.ok(html.includes('<ul role="list" class="diffRows"></ul>'));
});

test("the colour key follows the theme's diff: VS Code's from the stylesheet, a custom theme's colours inline, high contrast outlined", () => {
	const vscode = render(createElement(StaticSolution, props()));
	assert.match(vscode, /^<section id="solution-1" class="solution" aria-labelledby=/, "VS Code's: nothing inline, the stylesheet's key");
	assert.ok(vscode.includes('<div class="rows" role="region"'), 'filled bands');
	const key = diffKeyOf('dwf-monokai');
	const monokai = render(createElement(StaticSolution, props({ theme: { name: 'dwf-monokai' } })));
	assert.match(monokai, new RegExp(`^<section id="solution-1" class="solution" style="--sp-key-yours:${key.yours};--sp-key-solution:${key.solution}"`), "Monokai's own red and green on the panel");
	assert.ok(monokai.includes('<span class="key" aria-hidden="true">'), 'filled swatches');
	assert.ok(monokai.includes('<div class="rows" role="region"'));
	const highContrast = render(createElement(StaticSolution, props({ theme: { name: 'hc-black' } })));
	assert.ok(highContrast.includes('<span class="key keyOutlined" aria-hidden="true">'), 'outlined swatches, as the high-contrast diff draws them');
	assert.match(highContrast, /style="--sp-key-yours:#ff008f;--sp-key-solution:#33ff2e"/);
	assert.ok(highContrast.includes('<div class="rows rowsOutlined" role="region"'), 'no bands: the signs take the colours');
	const noTheme = render(createElement(StaticSolution, props({ theme: undefined })));
	assert.match(noTheme, /^<section id="solution-1" class="solution" aria-labelledby=/, "no theme yet: the stylesheet's key");
});

test('the stylesheet: every class the panel uses exists, the bands are bridged to the key, the box scrolls', () => {
	const css = readFileSync(new URL('../StaticSolution.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const classes = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
	const source = readFileSync(new URL('../StaticSolution.jsx', import.meta.url), 'utf8');
	for (const name of [...source.matchAll(/ownStyles\.(\w+)/g)].map((match) => match[1])) {
		assert.ok(classes.has(name), `ownStyles.${name} is not in StaticSolution.module.css`);
	}
	const rowsRule = css.match(/\.rows\s*\{([^}]*)\}/)[1];
	assert.match(rowsRule, /--ce-band-removed:\s*var\(--sp-key-yours\)/, "the reader's band is the key's red");
	assert.match(rowsRule, /--ce-band-added:\s*var\(--sp-key-solution\)/, "the solution's band is the key's green");
	assert.match(rowsRule, /max-height:\s*var\(--sp-max-height\)/);
	assert.match(rowsRule, /overflow:\s*auto/);
	const outlinedRule = css.match(/\.rowsOutlined\s*\{([^}]*)\}/)[1];
	assert.match(outlinedRule, /--ce-band-removed:\s*transparent/);
	assert.match(outlinedRule, /--ce-line-removed-ink:\s*var\(--sp-key-yours\)/);
	assert.doesNotMatch(css, /html\[data-theme/, "the editor's mode, never the site's");
});

test("the buttons take the editor's light-mode blue (buttonInk.js), as the Monaco panel's do", () => {
	const source = readFileSync(new URL('../StaticSolution.jsx', import.meta.url), 'utf8');
	assert.match(source, /sx=\{LIGHT_PRIMARY_INK_SX\.contained\}/);
	assert.match(source, /sx=\{LIGHT_PRIMARY_INK_SX\.text\}/);
});
