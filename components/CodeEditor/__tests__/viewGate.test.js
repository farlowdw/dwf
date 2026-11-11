/**
 * viewGate.test.js — the touch reading mode never shows on a desktop (the orchestrator's
 * "desktop: no change at all", 2026-10-26), checked three ways:
 *   - the gate itself: touchMode.js > viewFor gives the Monaco view for every window that is not
 *     touch-first (no matchMedia, a throw, no match) and the static view only for a match;
 *   - the sources, read as text (index.jsx and CodeEditorClient.jsx need a browser): index.jsx
 *     reads the device ONLY inside the BrowserOnly callback (ClientEditor), ONLY through viewFor,
 *     and its placeholder never sees a view; the shell renders <StaticBox> only under
 *     VIEWS.static, sets TOUCH_ATTRIBUTE only from the gate's answer, loads Monaco only in the
 *     Monaco view (useMonacoLoader's `enabled`), and prints a copy in the Monaco view only;
 *   - what a desktop gets: the server render of every guide editor (fixtures/snippets, as
 *     backCompat.test.js) carries no data-ce-touch and no "Tap to edit"; Monaco's options with
 *     and without `touch: false` are deep-equal for every one of them (and the touch options
 *     differ, so the flag is live); no stylesheet of the folder holds the gate's `hover: none`
 *     query or any `any-hover` / `any-pointer` one (the frame's attribute is the only touch hook;
 *     the two `(pointer: coarse)` target-size rules of ErrorList.module.css and styles.module.css
 *     predate the touch mode and size a button, they decide no view).
 * Run with `npm run test:shared`.
 * To change it: a new place that reads the device gets a test here that keeps a desktop unchanged.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMonacoOptions, normalizeEditorProps } from '../props.js';
import { TOUCH_ATTRIBUTE, TOUCH_MEDIA_QUERY, VIEWS, viewFor } from '../touchMode.js';
import { TOUCH_EDITOR_OPTIONS } from '../touchOptions.js';
import { FOLDER } from './paths.js';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: CodeEditor } = await import('../index.jsx');
const { WORDS: STATIC_WORDS } = await import('../StaticCode.jsx');

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A source file of the folder, read as text; `comments: false` strips its comments (the headers name the touch files). */
function sourceOf(name, { comments = true } = {}) {
	const source = readFileSync(path.join(FOLDER, name), 'utf8');
	return comments ? source : source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

const INDEX = sourceOf('index.jsx', { comments: false });
const CLIENT = sourceOf('CodeEditorClient.jsx', { comments: false });

/** A snippet file (fixtures/snippets: copies of a site guide's, and tally-votes.py, a made-up stand-in for a blog post's). */
function snippet(name) {
	return readFileSync(path.join(HERE, 'fixtures/snippets', name), 'utf8');
}

/** The guide's editors as they stand (backCompat.test.js's list): [name, props]. */
const EDITORS = Object.freeze([
	['squares, folded', { initialCode: snippet('squares.py'), foldedRegions: [[1, 6]] }],
	['five languages', { initialCode: { python: snippet('sum-of-squares.py'), javascript: snippet('sum-of-squares.js'), c: snippet('sum-of-squares.c'), 'c++': snippet('sum-of-squares.cpp'), go: snippet('sum-of-squares.go') } }],
	['stdin', { initialCode: snippet('read-input.py'), stdin: '5\n3 1 4 1 5' }],
	['inside a dropdown', { initialCode: { python: snippet('sum-of-squares.py'), go: snippet('sum-of-squares.go') }, height: 'fit' }],
	['blog: a long snippet', { initialCode: snippet('tally-votes.py'), editorSettings: { height: '50vh' }, foldedRegions: [[1, 6]] }],
	['read-only', { initialCode: snippet('squares.py'), readOnly: true }],
]);

/** A window whose matchMedia answers `matches` for the touch query (or throws / is missing). */
function windowWith(matches) {
	return { matchMedia: (query) => ({ matches: query === TOUCH_MEDIA_QUERY && matches }) };
}

test('viewFor: the Monaco view for every window that is not touch-first; the static view only for a match', () => {
	assert.equal(viewFor(windowWith(false)), VIEWS.monaco);
	assert.equal(viewFor(windowWith(true)), VIEWS.static);
	assert.equal(viewFor(undefined), VIEWS.monaco, 'no window');
	assert.equal(viewFor({}), VIEWS.monaco, 'no matchMedia');
	assert.equal(
		viewFor({
			matchMedia: () => {
				throw new Error('no');
			},
		}),
		VIEWS.monaco,
		'a throwing matchMedia',
	);
	assert.equal(viewFor({ matchMedia: () => ({ matches: 'yes' }) }), VIEWS.monaco, 'only a true match counts');
});

test('index.jsx reads the device only inside the BrowserOnly callback, only through viewFor; the placeholder knows no view', () => {
	const gateCalls = INDEX.match(/viewFor\(/g) ?? [];
	assert.equal(gateCalls.length, 1, 'the device is read in one place');
	const clientEditor = INDEX.match(/function ClientEditor\(\{ settings \}\) \{([\s\S]*?)\n\}/);
	assert.ok(clientEditor, 'ClientEditor exists');
	assert.match(clientEditor[1], /const \[view\] = useState\(\(\) => viewFor\(globalThis\.window\)\);/, 'read once, at mount, from the window');
	assert.match(clientEditor[1], /<LoadedEditor settings=\{settings\} view=\{view\} \/>/);
	assert.match(INDEX, /\{\(\) => \(visible \? <ClientEditor settings=\{settings\} \/> : <EditorPlaceholder settings=\{settings\} waiting \/>\)\}/, 'rendered from the BrowserOnly callback only');
	assert.doesNotMatch(INDEX, /matchMedia|TOUCH_MEDIA_QUERY|isTouchFirst/, 'nothing else asks the device');
	const placeholder = INDEX.match(/export function EditorPlaceholder\([\s\S]*?\n\}/)[0];
	assert.doesNotMatch(placeholder, /view|touch|Static/i, 'the placeholder is untouched');
	assert.match(INDEX, /<Client settings=\{settings\} view=\{view\} \/>/, 'the lazy client gets the answer');
});

test('CodeEditorClient.jsx: the static view only under VIEWS.static, the attribute only from the gate, Monaco loaded only in the Monaco view, the print copy there only', () => {
	assert.equal((CLIENT.match(/<StaticBox/g) ?? []).length, 1);
	assert.match(CLIENT, /\{view === VIEWS\.static \? \(\s*<StaticBox/, 'the static box only under VIEWS.static');
	assert.match(CLIENT, /const touch = initialView === VIEWS\.static;/, "the gate's answer, fixed for the editor's life");
	assert.match(CLIENT, /function touchAttributes\(touch\) \{\s*return touch \? \{ \[TOUCH_ATTRIBUTE\]: '' \} : \{\};/, 'the attribute from `touch`, nothing at all otherwise');
	assert.match(CLIENT, /<section className=\{styles\.frame\} \{\.\.\.frameAttributesOf\(theme\)\} \{\.\.\.touchAttributes\(touch\)\}/);
	assert.equal((CLIENT.match(/TOUCH_ATTRIBUTE/g) ?? []).length, 2, 'the import and the one use');
	assert.match(CLIENT, /useMonacoLoader\(vsPath, \{ enabled: view === VIEWS\.monaco \}\)/);
	assert.match(CLIENT, /\{view === VIEWS\.monaco \? <PrintCopy code=/, 'the print copy in the Monaco view only');
	assert.match(CLIENT, /<StaticSolution[\s\S]*?\{solutionPanel\.open && view === VIEWS\.static \?|\{solutionPanel\.open && view === VIEWS\.static \? \(\s*<StaticSolution/, 'the static solution panel in the static view only');
	assert.match(CLIENT, /<OutputPanel[\s\S]*?touch=\{touch\}/, 'the idle line follows the gate');
	assert.match(CLIENT, /export default function CodeEditorClient\(\{ settings, view = VIEWS\.monaco \}\)/, 'without the prop: Monaco');
});

test('CodeEditorClient.jsx: a failed load after the tap goes back to the static view through viewAfterLoad, drops a waiting Run, greys out the bar, and offers Go to line only with a surface', () => {
	assert.match(CLIENT, /viewAfterLoad\(\{ initialView, view, editorError, monacoReady \}\)/, 'the decision is touchMode.js > viewAfterLoad');
	assert.match(CLIENT, /pending\.cancel\(\);\s*setView\(/, 'a waiting Run or Check is dropped before the view goes back');
	assert.match(CLIENT, /runBlockingError\(\{ view, language, editorError \}\)/, 'which view the error disables Run in: touchMode.js > runBlockingError');
	assert.match(CLIENT, /editBlockedReason=\{editorError \? RUN_DISABLED\.noEditor : null\}/, '"Tap to edit" is greyed out while Monaco cannot load');
	assert.match(CLIENT, /useRunErrors\(\{[\s\S]*?surfaceReady,[\s\S]*?\}\)/, 'Go to line needs a surface');
});

for (const [name, props] of EDITORS) {
	test(`${name}: the server render carries no touch attribute and no "Tap to edit"; Monaco's options are the same with and without touch: false`, () => {
		const html = renderToStaticMarkup(createElement(CodeEditor, props));
		assert.doesNotMatch(html, new RegExp(TOUCH_ATTRIBUTE));
		assert.ok(!html.includes(STATIC_WORDS.tapToEdit) && !html.includes('touchBar') && !html.includes('class="static"'), 'nothing of the static view');
		const settings = normalizeEditorProps(props);
		const base = { readOnly: settings.readOnly, hideErrors: settings.hideErrors, ariaLabel: 'Code editor: main.py', fit: settings.fit, fontFamily: 'monospace' };
		const without = buildMonacoOptions(settings.editorOptions, base);
		const explicit = buildMonacoOptions(settings.editorOptions, { ...base, touch: false });
		assert.deepEqual(explicit, without);
		for (const key of Object.keys(TOUCH_EDITOR_OPTIONS)) assert.ok(!(key in without), `${key} is not in a desktop's options`);
		const touched = buildMonacoOptions(settings.editorOptions, { ...base, touch: true });
		assert.notDeepEqual(touched, without, 'the flag is live');
		assert.equal(touched.wordWrap, TOUCH_EDITOR_OPTIONS.wordWrap);
	});
}

/** The stylesheets allowed a `(pointer: coarse)` rule, each sizing one touch target (WCAG 2.5.8), from before the touch mode. */
const TARGET_SIZE_RULES = Object.freeze(['ErrorList.module.css', 'styles.module.css']);

test("no stylesheet of the folder holds the gate's query (hover: none) or an any-* one: the frame's attribute is the only touch hook", () => {
	const stylesheets = readdirSync(FOLDER).filter((file) => file.endsWith('.module.css'));
	assert.ok(stylesheets.length >= 5);
	assert.match(TOUCH_MEDIA_QUERY, /hover: none/, 'the gate asks about hover');
	for (const file of stylesheets) {
		const css = sourceOf(file, { comments: false });
		assert.doesNotMatch(css, /hover:\s*none|any-hover|any-pointer/, `${file} decides nothing by device`);
		const coarseRules = (css.match(/@media \(pointer: coarse\)/g) ?? []).length;
		assert.equal(coarseRules, TARGET_SIZE_RULES.includes(file) ? 1 : 0, `${file}: a (pointer: coarse) rule only where a touch target is sized`);
	}
	assert.ok(sourceOf('static.module.css').includes(`[${TOUCH_ATTRIBUTE}]`), 'the touch rules key on the attribute');
});
