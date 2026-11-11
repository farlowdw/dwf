/**
 * staticCode.test.js — the static view's markup (StaticCode.jsx), rendered on the server
 * through this folder's module hooks (jsxHooks.js for the .jsx and CSS-module imports,
 * staticViewFakes.js for the theme mapping and the store, which have their own tests):
 *   - one div.line per logical line, numbered from 1 (a final newline makes one more, empty
 *     line, as Monaco counts), the number hidden from screen readers;
 *   - the author's kinds as `marked` plus decorations.js's global kind class (an unknown kind
 *     is dropped), the current step's underlay, the flash's underlay with its token;
 *   - a closed fold hides its lines (the `hidden` attribute) and ends its first line with the
 *     "⋯ N lines" button; an open fold has its chevron in the gutter;
 *   - the tokens are coloured inline by the chosen theme, the container by its `plain`
 *     colours and Monaco's metrics (staticCodeStyle = the placeholder's waitingCodeStyle plus
 *     the bottom padding; the client's built options when given), the line numbers by the
 *     theme's number colour;
 *   - a language the Prism instance lacks renders as plain text (no crash);
 *   - every styles.<class> StaticCode.jsx and StaticBox.jsx use is defined in static.module.css.
 * Run with `npm run test:shared`.
 * To change it: a new part of the static markup (StaticCode.jsx) gets a test here, rendered through the
 * hooks.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASS_PREFIX, FLASH_CLASS, STEP_CLASS } from '../decorations.js';
import { normalizeEditorProps, waitingCodeStyle } from '../props.js';

register('./jsxHooks.js', import.meta.url);
register('./staticViewFakes.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const fakes = await import('./staticViewFakes.js');
const { default: StaticCode, WORDS, kindClass, lineClassName, staticCodeStyle } = await import('../StaticCode.jsx');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, '..');

/** A snippet of nine lines (the final newline makes line 9, empty). */
const SNIPPET = ['def greet(name):', '    # say hello', '    print("hi", name)', '    return name', '', 'x = 1', 'y = 2', 'greet("a")', ''].join('\n');
const LINE_COUNT = 9;

/** A fake theme: its name goes to prismThemeOf, its number colour to the container. */
const THEME = { name: 'dwf-dracula', keyColors: { lineNumber: '#6272a4' } };

/** A snapshot with one closed fold (1-4), one open fold (6-7), marks, a step and a flash. */
function snapshotOf(text = SNIPPET) {
	return {
		text,
		lines: text.split('\n'),
		folds: [
			{ start: 1, end: 4, open: false },
			{ start: 6, end: 7, open: true },
		],
		lineKinds: { 1: 'highlight', 5: 'error', 6: 'add', 8: 'remove', 9: 'bogus' },
		stepLines: new Set([5, 6]),
		flash: { lines: new Set([1, 8]), token: 3 },
	};
}

/** The settings of an editor on SNIPPET (Python, the default language). */
const SETTINGS = normalizeEditorProps({ initialCode: SNIPPET });

function render(props = {}) {
	const element = createElement(StaticCode, { store: fakes.fakeStore(snapshotOf()), settings: SETTINGS, language: 'python', theme: THEME, onToggleFold() {}, ...props });
	return renderToStaticMarkup(element);
}

/** The opening tag of line `n`, or null. */
function lineTagOf(html, n) {
	return html.match(new RegExp(`<div class="line[^"]*" data-line="${n}"[^>]*>`))?.[0] ?? null;
}

/** The whole markup of line `n` (up to the next line or the end). */
function lineOf(html, n) {
	const start = html.indexOf(lineTagOf(html, n));
	assert.ok(start >= 0, `line ${n} is drawn`);
	const next = html.indexOf('<div class="line', start + 1);
	return html.slice(start, next === -1 ? undefined : next);
}

/** The class attribute of line `n`'s div. */
function classesOf(html, n) {
	return lineTagOf(html, n).match(/class="([^"]*)"/)[1];
}

test('the region is named after the file and holds one numbered line per logical line (a final newline makes one more)', () => {
	const html = render();
	assert.match(html, /^<div class="static" role="region" aria-label="Code: main\.py" style="/);
	assert.equal([...html.matchAll(/<div class="line[ "]/g)].length, LINE_COUNT);
	for (let n = 1; n <= LINE_COUNT; n += 1) {
		assert.ok(lineTagOf(html, n), `line ${n} has data-line`);
		assert.ok(lineOf(html, n).includes(`<span class="number" aria-hidden="true">${n}</span>`), `line ${n}'s number, hidden from screen readers`);
	}
	assert.ok(lineOf(html, 9).includes('<span class="code"></span>'), "the empty last line's code is empty (no newline text)");
	assert.ok(lineOf(html, 1).indexOf('class="number"') < lineOf(html, 1).indexOf('class="code"'), 'the number comes before the code');
});

test('a page title names the region instead of the file', () => {
	const html = render({ settings: normalizeEditorProps({ initialCode: SNIPPET, title: 'Greeting' }) });
	assert.match(html, /aria-label="Code: Greeting"/);
});

test("the author's kinds: `marked` with the global kind class, an unknown kind dropped; the step's and the flash's underlays", () => {
	const html = render();
	assert.equal(classesOf(html, 1), `line marked ${kindClass('highlight')} flash`);
	assert.equal(classesOf(html, 5), `line marked ${kindClass('error')} currentStep`);
	assert.equal(classesOf(html, 6), `line marked ${kindClass('add')} currentStep`);
	assert.equal(classesOf(html, 8), `line marked ${kindClass('remove')} flash`);
	assert.equal(classesOf(html, 9), 'line', 'an unknown kind marks nothing');
	assert.equal(kindClass('error'), `${CLASS_PREFIX}kind-error`, "decorations.js's name, so guided.module.css colours it");
	assert.ok(lineOf(html, 5).includes(`<span class="step ${STEP_CLASS}"></span>`), "the step's underlay carries the global step class");
	assert.ok(!lineOf(html, 1).includes('class="step'), 'no step underlay on a line outside the step');
	assert.match(lineTagOf(html, 1), /data-flash-token="3"/);
	assert.ok(lineOf(html, 1).includes(`<span class="flashBand ${FLASH_CLASS}"></span>`), "the flash's underlay carries the global flash class");
	assert.doesNotMatch(lineTagOf(html, 5), /data-flash-token/, 'no token on a line that is not flashing');
	const line5 = lineOf(html, 5);
	assert.ok(line5.indexOf('class="step') < line5.indexOf('class="number"'), 'the underlays come before the number');
});

test('a closed fold hides its lines and ends its first line with the "⋯ N lines" button; an open fold shows its chevron', () => {
	const html = render();
	for (let n = 1; n <= LINE_COUNT; n += 1) {
		const hidden = [2, 3, 4].includes(n);
		assert.equal(/ hidden=""/.test(lineTagOf(html, n)), hidden, `line ${n} ${hidden ? 'is' : 'is not'} hidden`);
	}
	const line1 = lineOf(html, 1);
	assert.ok(line1.includes(`<button type="button" class="foldMarker" aria-expanded="false" title="${WORDS.showHidden}">⋯ 3 lines</button></span>`), 'the marker, inline at the end of the code');
	const line6 = lineOf(html, 6);
	assert.ok(line6.includes('<button type="button" class="foldChevron" aria-expanded="true" aria-label="Hide 1 line">'), 'the chevron names what it hides');
	assert.ok(line6.indexOf('class="foldChevron"') < line6.indexOf('class="code"'), 'the chevron sits in the gutter, before the code');
	assert.ok(!line6.includes('foldMarker'), 'no marker on an open fold');
	assert.ok(!lineOf(html, 7).includes('fold'), 'nothing on a line inside an open fold');
	assert.equal([...html.matchAll(/<button/g)].length, 2, 'two buttons: one per fold');
});

test("the tokens are coloured inline by the theme (the fake's keyword and comment), the container by its plain colours and the theme's number colour", () => {
	const html = render();
	assert.ok(html.includes('<span class="token keyword" style="color:#ff00ff">def</span>'), 'a keyword');
	assert.ok(html.includes('style="color:#00aa00;font-style:italic"'), 'a comment, italic');
	const style = html.match(/^<div class="static"[^>]*style="([^"]*)"/)[1];
	assert.ok(style.includes('color:#111111;background-color:#fefefe'), "the theme's plain colours");
	assert.ok(style.includes('--ce-static-number:#6272a4'), "the theme's line number colour");
	assert.ok(style.includes('--ce-static-line-height:21px'), "the line height, for the chevron's column");
	assert.deepEqual(fakes.themeNamesAsked.slice(-1), [THEME.name], "the chosen theme's name goes to prismThemeOf");
});

test('staticCodeStyle: the placeholder\'s waitingCodeStyle plus the bottom padding; the client\'s built options when given', () => {
	assert.deepEqual(staticCodeStyle(SETTINGS), { ...waitingCodeStyle(SETTINGS), paddingBottom: '8px' });
	const html = render();
	const style = html.match(/^<div class="static"[^>]*style="([^"]*)"/)[1];
	assert.ok(style.startsWith('font-family:var(--ce-font-family, var(--ifm-font-family-monospace));font-size:14px;line-height:21px;padding-top:8px;padding-bottom:8px;tab-size:4;'), style);
	const options = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, lineHeight: 1.5, padding: { top: 4, bottom: 2 }, tabSize: 2 };
	assert.deepEqual(staticCodeStyle(SETTINGS, options), {
		fontFamily: "'IBM Plex Mono', monospace",
		fontSize: '16px',
		lineHeight: '24px',
		paddingTop: '4px',
		paddingBottom: '2px',
		tabSize: 2,
	});
	assert.match(render({ options }), /font-family:&#x27;IBM Plex Mono&#x27;, monospace;font-size:16px;line-height:24px;/, 'the built options reach the container');
});

test('lineClassName: the classes of a line from the snapshot', () => {
	const styles = new Proxy({}, { get: (target, key) => key });
	const snapshot = snapshotOf();
	assert.equal(lineClassName(snapshot, 2, styles), 'line');
	assert.equal(lineClassName(snapshot, 5, styles), `line marked ${CLASS_PREFIX}kind-error currentStep`);
	assert.equal(lineClassName(snapshot, 8, styles), `line marked ${CLASS_PREFIX}kind-remove flash`);
	assert.equal(lineClassName({ text: '', lines: [''], folds: [] }, 1, styles), 'line', 'a snapshot without marks, step or flash');
});

test('WORDS: the fold buttons count their lines, singular and plural', () => {
	assert.equal(WORDS.hiddenLines(1), '⋯ 1 line');
	assert.equal(WORDS.hiddenLines(5), '⋯ 5 lines');
	assert.equal(WORDS.hideLines(1), 'Hide 1 line');
	assert.equal(WORDS.hideLines(2), 'Hide 2 lines');
	assert.equal(WORDS.region('main.py'), 'Code: main.py');
	assert.equal(WORDS.tapToEdit, 'Tap to edit');
});

test('a language whose grammar the Prism instance lacks renders as plain text (bash is not bundled in node)', () => {
	const settings = normalizeEditorProps({ initialCode: 'echo "hi"\nls -la\n', language: 'bash' });
	const html = render({ settings, language: 'bash', store: fakes.fakeStore({ text: 'echo "hi"\nls -la\n', lines: ['echo "hi"', 'ls -la', ''], folds: [] }) });
	assert.match(html, /aria-label="Code: main\.sh"/);
	assert.ok(html.includes('<span class="token plain">echo &quot;hi&quot;</span>'), 'plain tokens');
	assert.equal([...html.matchAll(/<div class="line[ "]/g)].length, 3);
});

test('a snapshot without folds, marks, step or flash draws plain numbered lines', () => {
	const html = render({ store: fakes.fakeStore({ text: 'a\nb', lines: ['a', 'b'], folds: [] }) });
	assert.equal(classesOf(html, 1), 'line');
	assert.equal(classesOf(html, 2), 'line');
	assert.doesNotMatch(html, /hidden=""|<button|class="step|class="flashBand/);
});

test('every styles.<class> StaticCode.jsx and StaticBox.jsx use is defined in static.module.css', () => {
	const css = readFileSync(path.join(FOLDER, 'static.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const defined = new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
	for (const file of ['StaticCode.jsx', 'StaticBox.jsx']) {
		const source = readFileSync(path.join(FOLDER, file), 'utf8');
		assert.match(source, /import styles from '\.\/static\.module\.css';/, `${file} imports the static stylesheet as styles`);
		const used = [...source.matchAll(/styles\.(\w+)/g)].map((match) => match[1]);
		assert.ok(used.length >= 2, `${file} uses the stylesheet`);
		for (const name of used) assert.ok(defined.has(name), `${file} uses styles.${name}, which static.module.css does not define`);
	}
});
