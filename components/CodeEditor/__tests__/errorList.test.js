/**
 * errorList.test.js — the "Line 4 · …" rows under the status line (../ErrorList.jsx), rendered
 * on the server through this folder's module hooks (jsxHooks.js; a CSS module's class reads as
 * its own name): a labelled list (role="list"), one row per location in the error or warning
 * look, "Error:" / "Warning:" for screen readers, the Go to line buttons named "Go to line 4"
 * (none without onGoToLine), nothing at all without a location, at most MAX_ROWS rows plus a
 * "more" line, the message shortened to its first line and MAX_MESSAGE_CHARS, bad lines left
 * out, errors never pushed out of the rows by warnings (fittingLocations); a click on a button
 * calls onGoToLine(line, location) (the element tree walked by hand —
 * no DOM in node); and every class the component uses exists in ErrorList.module.css (the
 * folder's files.test.js checks `styles.*` against styles.module.css only); bad props (a
 * maxRows that is not a whole number from 1 up, an onGoToLine that is not a function); and the
 * rows for the REAL answers of lib/codeRunner/__tests__/fixtures/errors, read by the
 * library's errorLocations. Run with `npm run test:shared`.
 * To change it: a new prop or row rule of ../ErrorList.jsx gets a test here, rendered through the
 * hooks.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ErrorList, MAX_MESSAGE_CHARS, MAX_ROWS, WORDS, fittingLocations, goToLabel, lineText, listRows, moreText, shortMessage } = await import('../ErrorList.jsx');
const { errorLocations } = await import('../lib/codeRunner/errorLocations.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT = path.resolve(HERE, '../ErrorList.jsx');
const STYLESHEET = path.resolve(HERE, '../ErrorList.module.css');

/** Markup without MUI's emotion <style> tags and generated css-… classes (they are not under test). */
function render(element) {
	return renderToStaticMarkup(element)
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
		.replace(/ ?css-[\w-]+/g, '');
}

/** How many times `pattern` (a global RegExp) matches. */
function count(html, pattern) {
	return [...html.matchAll(pattern)].length;
}

const INDEX_ERROR = Object.freeze({ line: 4, column: 12, endColumn: 20, message: 'IndexError: list index out of range', severity: 'error', stage: 'run' });
const UNUSED_WARNING = Object.freeze({ line: 9, column: 9, message: "unused variable 'x' [-Wunused-variable]", severity: 'warning', stage: 'compile' });

const noop = () => {};

test('a labelled list (role="list" too), one row per location, "Line 4 · message"', () => {
	const html = render(createElement(ErrorList, { locations: [INDEX_ERROR, UNUSED_WARNING], onGoToLine: noop }));
	assert.match(html, new RegExp(`^<ul role="list" class="list" aria-label="${WORDS.listLabel}">`));
	assert.equal(count(html, /<li class="row /g), 2);
	assert.ok(html.includes('<span class="line">Line 4</span> · <span class="message">IndexError: list index out of range</span>'));
	assert.ok(html.includes('<span class="line">Line 9</span> · <span class="message">unused variable &#x27;x&#x27; [-Wunused-variable]</span>'));
	assert.equal(lineText(12), 'Line 12');
});

test('an error row and a warning row: their looks, their icons, and the word a screen reader hears first', () => {
	const html = render(createElement(ErrorList, { locations: [INDEX_ERROR, UNUSED_WARNING], onGoToLine: noop }));
	const [errorRow, warningRow] = html.match(/<li class="row [^"]*">[\s\S]*?<\/li>/g);
	assert.match(errorRow, /^<li class="row rowError">/);
	assert.match(warningRow, /^<li class="row rowWarning">/);
	assert.ok(errorRow.includes('<span class="visuallyHidden">Error: </span>'));
	assert.ok(warningRow.includes('<span class="visuallyHidden">Warning: </span>'));
	assert.match(errorRow, /<span class="icon" aria-hidden="true"><svg[^>]*data-testid="ErrorOutlineOutlinedIcon"/);
	assert.match(warningRow, /<span class="icon" aria-hidden="true"><svg[^>]*data-testid="WarningAmberOutlinedIcon"/);
});

test('each Go to line is a real button named "Go to line 4" (its visible words plus the line)', () => {
	const html = render(createElement(ErrorList, { locations: [INDEX_ERROR, UNUSED_WARNING], onGoToLine: noop }));
	assert.ok(html.includes(`<button type="button" class="goTo" aria-label="Go to line 4">${WORDS.goTo}</button>`));
	assert.ok(html.includes('aria-label="Go to line 9"'));
	assert.equal(goToLabel(4), 'Go to line 4');
	assert.ok(goToLabel(4).startsWith(WORDS.goTo), 'the accessible name starts with the visible words');
});

test('without onGoToLine the rows have no button (the code shown is not the code that ran)', () => {
	const html = render(createElement(ErrorList, { locations: [INDEX_ERROR] }));
	assert.equal(count(html, /<li class="row /g), 1);
	assert.doesNotMatch(html, /<button/);
});

test('no location, nothing drawn (a segfault, an error outside the reader\'s file)', () => {
	assert.equal(render(createElement(ErrorList, { locations: [] })), '');
	assert.equal(render(createElement(ErrorList, { locations: undefined })), '');
	assert.equal(render(createElement(ErrorList, { locations: [{ line: 0 }, { message: 'no line' }, null] })), '');
});

test('at most MAX_ROWS rows, then one muted line with how many more the output holds', () => {
	const many = Array.from({ length: MAX_ROWS + 3 }, (_, index) => ({ line: index + 1, message: `error ${index + 1}`, severity: 'error' }));
	const html = render(createElement(ErrorList, { locations: many, onGoToLine: noop }));
	assert.equal(count(html, /<li class="row /g), MAX_ROWS);
	assert.ok(html.includes(`<li class="more">${moreText(3)}</li>`));
	assert.equal(moreText(3), '3 more in the output below');
	const exactly = render(createElement(ErrorList, { locations: many.slice(0, MAX_ROWS) }));
	assert.doesNotMatch(exactly, /class="more"/);
	const fewer = render(createElement(ErrorList, { locations: many, maxRows: 2 }));
	assert.equal(count(fewer, /<li class="row /g), 2);
	assert.ok(fewer.includes(moreText(MAX_ROWS + 1)));
});

test('when not all fit, a warning never takes an error\'s place; the rows stay in line order', () => {
	const warnings = Array.from({ length: MAX_ROWS + 2 }, (_, index) => ({ line: index + 1, message: `warning ${index + 1}`, severity: 'warning' }));
	const failing = { line: MAX_ROWS + 5, message: 'the error that failed the build', severity: 'error' };
	const { rows, hiddenCount } = listRows([...warnings, failing]);
	assert.equal(rows.length, MAX_ROWS);
	assert.equal(hiddenCount, 3, 'three warnings left out');
	assert.deepEqual(rows.at(-1).location, failing, 'the error has its row, last by line');
	assert.deepEqual(rows.slice(0, -1).map((row) => row.line), Array.from({ length: MAX_ROWS - 1 }, (_, index) => index + 1), 'the first warnings fill the rest');
	const errors = Array.from({ length: MAX_ROWS + 1 }, (_, index) => ({ line: index + 2, severity: 'error' }));
	const onlyErrors = fittingLocations([{ line: 1, severity: 'warning' }, ...errors], MAX_ROWS);
	assert.equal(onlyErrors.length, MAX_ROWS);
	assert.ok(onlyErrors.every((location) => location.severity === 'error'), 'more errors than rows: no warning at all');
	assert.deepEqual(fittingLocations([INDEX_ERROR, UNUSED_WARNING], MAX_ROWS), [INDEX_ERROR, UNUSED_WARNING], 'all fit: all, as given');
});

test('a message: its first line, at most MAX_MESSAGE_CHARS; none reads "Error" / "Warning"', () => {
	assert.equal(shortMessage('  NameError: name \'x\' is not defined  ', 'error'), "NameError: name 'x' is not defined");
	assert.equal(shortMessage('first line\n  second line', 'error'), 'first line');
	const long = 'x'.repeat(MAX_MESSAGE_CHARS + 50);
	const shortened = shortMessage(long, 'error');
	assert.equal(shortened.length, MAX_MESSAGE_CHARS);
	assert.ok(shortened.endsWith('…'));
	assert.equal(shortMessage('y'.repeat(MAX_MESSAGE_CHARS), 'error').length, MAX_MESSAGE_CHARS, 'exactly the limit is kept whole');
	assert.equal(shortMessage('', 'error'), WORDS.severity.error);
	assert.equal(shortMessage(undefined, 'warning'), WORDS.severity.warning);
	assert.equal(shortMessage('   \n  ', 'warning'), 'Warning');
});

test('listRows: only locations with a whole line from 1 up, in their order, each keeping its location', () => {
	const { rows, hiddenCount } = listRows([INDEX_ERROR, { line: 2.5 }, { line: -3 }, UNUSED_WARNING, { line: '7' }]);
	assert.equal(hiddenCount, 0);
	assert.deepEqual(
		rows.map((row) => [row.line, row.severity, row.message]),
		[
			[4, 'error', 'IndexError: list index out of range'],
			[9, 'warning', "unused variable 'x' [-Wunused-variable]"],
		],
	);
	assert.equal(rows[0].location, INDEX_ERROR);
	assert.equal(new Set(rows.map((row) => row.key)).size, rows.length, 'unique keys');
	assert.equal(listRows([{ line: 3, severity: 'fatal' }]).rows[0].severity, 'error', 'anything but a warning is an error');
});

/**
 * The element tree with every function component drawn (none of them uses hooks), so a button's
 * onClick can be called without a DOM. MUI's icons (objects, not functions) are left as they are.
 */
function expand(node) {
	if (Array.isArray(node)) return node.map(expand);
	if (!node || typeof node !== 'object' || !node.props) return node;
	if (typeof node.type === 'function') return expand(node.type(node.props));
	return { ...node, props: { ...node.props, children: expand(node.props.children) } };
}

/** Every <button> element in an expanded tree. */
function buttonsIn(node, found = []) {
	if (Array.isArray(node)) {
		for (const child of node) buttonsIn(child, found);
		return found;
	}
	if (!node || typeof node !== 'object' || !node.props) return found;
	if (node.type === 'button') found.push(node);
	buttonsIn(node.props.children, found);
	return found;
}

test('a click on Go to line calls onGoToLine(line, location) for its own row', () => {
	const calls = [];
	const tree = expand(createElement(ErrorList, { locations: [INDEX_ERROR, UNUSED_WARNING], onGoToLine: (line, location) => calls.push([line, location]) }));
	const buttons = buttonsIn(tree);
	assert.equal(buttons.length, 2);
	buttons[1].props.onClick();
	buttons[0].props.onClick();
	assert.deepEqual(calls, [
		[9, UNUSED_WARNING],
		[4, INDEX_ERROR],
	]);
});

test('every listStyles.<class> the component uses is defined in ErrorList.module.css', () => {
	const css = readFileSync(STYLESHEET, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const defined = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
	const used = new Set([...readFileSync(COMPONENT, 'utf8').matchAll(/\blistStyles\.([A-Za-z_]\w*)/g)].map((match) => match[1]));
	assert.ok(used.size >= 8, 'the component uses its stylesheet');
	for (const name of used) assert.ok(defined.has(name), `ErrorList.jsx uses listStyles.${name}, which ErrorList.module.css does not define`);
});

test('the stylesheet: no colour without a token or a fallback, rows outrank Infima\'s list margin, a 24 px button on touch screens', () => {
	const css = readFileSync(STYLESHEET, 'utf8');
	assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,8}\b|rgba?\(/i, 'colours come from the site\'s tokens and the editor\'s --ce-* properties');
	assert.match(css, /\.list > \.row,\s*\.list > \.more \{\s*margin: 0;/);
	assert.match(css, /@media \(pointer: coarse\) \{\s*\.goTo \{\s*min-height: 24px;/);
});

test('the stylesheet: the list keeps its own gap above (under a notice too) and none below when it is last', () => {
	const css = readFileSync(STYLESHEET, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const listRule = /\.list \{([^}]*)\}/.exec(css)[1];
	assert.match(listRule, /\bmargin: 0\.5rem 0;/, '0.5rem above (it collapses with a status line\'s) and below');
	assert.match(css, /\.list:last-child \{\s*margin-bottom: 0;\s*\}/);
});

test('bad props: a maxRows that is not a whole number from 1 up shows MAX_ROWS rows; an onGoToLine that is not a function gives no buttons', () => {
	const many = Array.from({ length: MAX_ROWS + 2 }, (_, index) => ({ line: index + 1, message: `error ${index + 1}` }));
	for (const maxRows of [0, -1, Number.NaN, 2.5, '3', null]) {
		const { rows, hiddenCount } = listRows(many, { maxRows });
		assert.equal(rows.length, MAX_ROWS, `maxRows ${String(maxRows)}`);
		assert.equal(hiddenCount, 2);
	}
	const html = render(createElement(ErrorList, { locations: [INDEX_ERROR], onGoToLine: true }));
	assert.equal(count(html, /<li class="row /g), 1);
	assert.doesNotMatch(html, /<button/);
});

test('a long message is cut between characters, never inside one (an emoji is two UTF-16 units)', () => {
	const long = `${'a'.repeat(MAX_MESSAGE_CHARS - 2)}😀😀😀`;
	const shortened = shortMessage(long, 'error');
	assert.equal(Array.from(shortened).length, MAX_MESSAGE_CHARS);
	assert.ok(shortened.endsWith('a😀…'), 'the emoji before the ellipsis is whole');
	assert.equal(shortMessage('', 'toString'), WORDS.severity.error, "an unknown severity reads \"Error\" (never Object.prototype's)");
});

/** The real answers of a Piston server (lib/codeRunner/__tests__/fixtures/errors). */
const FIXTURES_DIR = new URL('../lib/codeRunner/__tests__/fixtures/errors/', import.meta.url);

/** One fixture's locations, as the editor gets them (the code it sent, the language's own file). */
function fixtureLocations(name) {
	const { request, response } = JSON.parse(readFileSync(new URL(name, FIXTURES_DIR), 'utf8'));
	return errorLocations(response, { language: request.language, code: request.files[0].content });
}

test('real answers: one row per location errorLocations finds (none for a segfault)', () => {
	const names = readdirSync(FIXTURES_DIR).filter((name) => name.endsWith('.json'));
	assert.ok(names.length >= 20, 'the fixtures are there');
	for (const name of names) {
		const locations = fixtureLocations(name);
		const html = render(createElement(ErrorList, { locations, onGoToLine: noop }));
		assert.equal(count(html, /<li class="row /g), Math.min(locations.length, MAX_ROWS), name);
		assert.equal(count(html, /<button /g), Math.min(locations.length, MAX_ROWS), `${name}: a button per row`);
	}
	assert.equal(render(createElement(ErrorList, { locations: fixtureLocations('c-segfault.json') })), '');
});

test("real answers: Python's IndexError and gcc's two errors read as the spec's rows", () => {
	const python = render(createElement(ErrorList, { locations: fixtureLocations('python-3.12-index-error.json'), onGoToLine: noop }));
	assert.ok(python.includes('<span class="line">Line 2</span> · <span class="message">IndexError: list index out of range</span>'));
	assert.ok(python.includes('aria-label="Go to line 2"'));
	const gcc = render(createElement(ErrorList, { locations: fixtureLocations('c-compile-error.json'), onGoToLine: noop }));
	assert.ok(gcc.includes('<span class="line">Line 3</span> · <span class="message">&#x27;y&#x27; undeclared (first use in this function)</span>'));
	assert.ok(gcc.includes('<span class="line">Line 4</span> · <span class="message">expected &#x27;;&#x27; before &#x27;return&#x27;</span>'));
	const warning = render(createElement(ErrorList, { locations: fixtureLocations('c-warning-only.json') }));
	assert.match(warning, /^<ul role="list" class="list" aria-label="Problems by line"><li class="row rowWarning">/);
});

test("real answer: a C program missing its #include lines — eleven warnings, and the one error keeps its row", () => {
	const locations = fixtureLocations('c-missing-includes-plus-error.json');
	assert.equal(locations.length, 12);
	const html = render(createElement(ErrorList, { locations, onGoToLine: noop }));
	assert.equal(count(html, /<li class="row /g), MAX_ROWS);
	assert.ok(html.includes('<li class="row rowError">'), 'the error has a row');
	assert.ok(html.includes('<span class="line">Line 7</span> · <span class="message">&#x27;count&#x27; undeclared (first use in this function)</span>'));
	assert.ok(html.includes(`<li class="more">${moreText(2)}</li>`), 'two warnings left out');
});
