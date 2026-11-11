/**
 * backCompat.test.js — the teaching layer (2026-10-25) changes NOTHING for an editor without its
 * props (the orchestrator's decision 11). For each of the site guide's seven editors as they
 * stood before it (the site guide: four live, three in its code examples) and a blog post's
 * (with the old editorSettings prop; the snippets: fixtures/snippets, the post's a stand-in):
 *   - the settings: every new key off, the snippets byte-for-byte the files (no magic comments);
 *   - the server-rendered placeholder: no wrapper element, no id, the same five header spaces
 *     (four read-only) plus the Theme button's, and Run's, no Check space, no runtime slot, no step bar, no exercise
 *     block, nothing inert, no waiting text, the idle line without a hint cue (2026-10-26) — and
 *     for the blog post the whole markup, pinned;
 *   - the header as the editor draws it for those settings: the same icon buttons plus the
 *     Theme button, no light bulb (Hints), no Solution, no Check, no runtime slot, no button
 *     with aria-expanded (the language picker has its own; the closed Theme button has none) or
 *     aria-disabled, and only one toggle (Input (stdin)) with aria-pressed;
 *   - Monaco's options: the same keys as before (renderValidationDecorations only for a
 *     read-only editor), and the same values — except, for a height="fit" editor (the guide's
 *     dropdown editors), the scrollbar's two FIT_SCROLLBAR_OPTIONS (2026-10-25: Monaco no
 *     longer adds a 12 px bar to the box when a line is wider than it, so the box stays the
 *     height its placeholder drew; props.js header).
 * One control was added on purpose since (2026-10-25, on request): the Theme button
 * (ThemeMenu.jsx), in every editor's header after Copy output, with its space in the placeholder.
 * These tests allow exactly that one, and nothing else (THEME_BUTTON); with the default theme the
 * colours are unchanged (__tests__/editorThemes.test.js, __tests__/themeWiring.test.js).
 * The one approved visible change of the teaching layer, run-error markers after a failed run,
 * needs a browser (README > How to change it). Run with `npm run test:shared`.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABELS } from '../messages.js';
import { DEFAULT_EDITOR_OPTIONS, FIT_SCROLLBAR_OPTIONS, buildMonacoOptions, exerciseButtonsFor, normalizeEditorProps, waitingCodeStyle } from '../props.js';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: CodeEditor } = await import('../index.jsx');
const { default: Toolbar, COPY_STATES } = await import('../Toolbar.jsx');

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A snippet file (fixtures/snippets: copies of a site guide's, kept equal by that site's wiring test, and tally-votes.py, a made-up stand-in for a blog post's), read as raw-loader hands it to the page. */
function snippet(name) {
	return readFileSync(path.join(HERE, 'fixtures/snippets', name), 'utf8');
}

const SQUARES_PY = snippet('squares.py');
const SUM_PY = snippet('sum-of-squares.py');
const SUM_JS = snippet('sum-of-squares.js');
const SUM_C = snippet('sum-of-squares.c');
const SUM_CPP = snippet('sum-of-squares.cpp');
const SUM_GO = snippet('sum-of-squares.go');
const READ_INPUT_PY = snippet('read-input.py');
const BLOG_SNIPPET = snippet('tally-votes.py');

/** The editors before the teaching layer: [name, props]. */
const EDITORS = Object.freeze([
	['guide: squares, folded', { initialCode: SQUARES_PY, foldedRegions: [[1, 6]] }],
	['guide: five languages', { initialCode: { python: SUM_PY, javascript: SUM_JS, c: SUM_C, 'c++': SUM_CPP, go: SUM_GO } }],
	['guide: adding one to a note (code example)', { initialCode: SQUARES_PY, foldedRegions: [[1, 6]] }],
	['guide: stdin', { initialCode: READ_INPUT_PY, stdin: '5\n3 1 4 1 5' }],
	['guide: inside a dropdown', { initialCode: { python: SUM_PY, go: SUM_GO }, height: 'fit' }],
	['guide: dropdown, on lines of its own (code example)', { initialCode: SQUARES_PY, foldedRegions: [[1, 6]] }],
	['guide: dropdown, mid-sentence (code example)', { initialCode: { python: SUM_PY, go: SUM_GO }, height: 'fit' }],
	['blog: a long snippet (old editorSettings)', { initialCode: BLOG_SNIPPET, editorSettings: { height: '50vh' }, foldedRegions: [[1, 6]] }],
]);

/** The header's icon buttons before the teaching layer: Input · Reset · Clear · Copy code · Copy output (four read-only). */
const ICON_BUTTONS_BEFORE = 5;
const ICON_BUTTONS_BEFORE_READ_ONLY = 4;

/** The one control added since, on purpose (2026-10-25): the Theme button (and its placeholder space). */
const THEME_BUTTON = 1;

/**
 * The one element added since, on purpose (2026-10-26, for printing): the print
 * copy of the snippet after the placeholder's box (index.jsx > PrintOnlyCode; nothing on screen,
 * `display: none`), so a printout made before the editor's chunk arrives shows the code.
 */
function printCopyOf(props) {
	const settings = normalizeEditorProps(props);
	return renderToStaticMarkup(createElement('pre', { className: 'printOnly', style: waitingCodeStyle(settings), 'aria-hidden': 'true' }, settings.snippets.code[settings.language]));
}

/**
 * The blog post's placeholder, exactly as the server rendered it before the teaching layer — with
 * the Theme button's space (the sixth iconSpacer) and the print copy, the two approved additions.
 */
const BLOG_PLACEHOLDER =
	'<div class="frame" aria-busy="true"><div class="toolbar"><div class="identity"><span class="title">main.py</span></div>' +
	'<div class="actions" aria-hidden="true"><span class="iconSpacer"></span><span class="iconSpacer"></span><span class="iconSpacer"></span>' +
	'<span class="iconSpacer"></span><span class="iconSpacer"></span>' +
	'<span class="iconSpacer"></span>' + // the Theme button's space (2026-10-25)
	'<span class="runButton runSpacer"></span></div></div>' +
	'<div class="editorBox" style="height:50vh"><div class="cover">Loading editor…</div></div>' +
	'<div class="resizeHandle resizeHandleInert" aria-hidden="true"><svg class="resizeGrip" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M9 3 L3 9 M9 6 L6 9 M9 9 L9 9"></path></svg></div>' +
	printCopyOf(EDITORS[EDITORS.length - 1][1]) + // the print copy (2026-10-26), after the strip as the loaded editor's
	'<div class="output"><p class="hint">Run the code to see its output (⌘/Ctrl+Enter).</p></div></div>';

/** Markup without MUI's emotion <style> tags and generated css-… classes. */
function render(element) {
	return renderToStaticMarkup(element)
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
		.replace(/ ?css-[\w-]+/g, '');
}

/** How many times `pattern` (a global RegExp) matches. */
function count(html, pattern) {
	return [...html.matchAll(pattern)].length;
}

/** The header's props exactly as CodeEditorClient.jsx derives them for `settings` (idle, before any run). */
function toolbarPropsFor(settings) {
	const buttons = exerciseButtonsFor(settings, settings.language);
	return {
		title: 'main.py',
		languages: settings.snippets.languages.map((id) => ({ id, label: id })),
		language: settings.language,
		onLanguageChange() {},
		runtime: { options: [], version: '*', runLanguage: settings.language, text: 'Python', notice: null, canRun: true },
		onVersionChange() {},
		running: false,
		runDisabledReason: null,
		onRun() {},
		onStop() {},
		onReset() {},
		onClear: settings.readOnly ? null : () => {},
		onCopy() {},
		copyState: COPY_STATES.idle,
		onCopyOutput() {},
		copyOutputState: COPY_STATES.idle,
		hasOutput: false,
		stdinShown: settings.showStdin,
		onToggleStdin() {},
		themeFamily: 'vscode',
		onThemeChange() {},
		hint: buttons.hint ? { open: false, areaId: 'h' } : null,
		solution: buttons.solution ? { open: false, panelId: 'p', disabled: false } : null,
		check: buttons.check ? { checking: false, disabledReason: null } : null,
	};
}

/** The font stack the editor always had (now --ce-font-family, shared/css/custom.scss, read by the client: editorFont.js). */
const FONT_STACK_BEFORE = "'IBM Plex Mono', Menlo, Consolas, monospace";

/** The keys Monaco's options had before the teaching layer (fontFamily: handed in by the client since 2026-10-26). */
const OPTION_KEYS_BEFORE = Object.freeze([...Object.keys(DEFAULT_EDITOR_OPTIONS), 'fontFamily', 'readOnly', 'ariaLabel'].sort());

for (const [name, props] of EDITORS) {
	test(`${name}: every new setting off, the snippets byte-for-byte the files`, () => {
		const settings = normalizeEditorProps(props);
		assert.equal(settings.id, null);
		assert.deepEqual(settings.steps, []);
		assert.equal(settings.hideErrors, false);
		assert.equal(settings.expectedOutput, null);
		assert.deepEqual([settings.tests, settings.solution], [null, null]);
		assert.deepEqual(settings.hints, []);
		assert.deepEqual([settings.saveDraft, settings.loadWhenVisible], [false, false]);
		for (const language of settings.snippets.languages) assert.deepEqual(settings.lineKinds[language], {}, `${language}: no marked lines`);
		const given = typeof props.initialCode === 'string' ? [props.initialCode] : Object.values(props.initialCode);
		assert.deepEqual(Object.values(settings.snippets.code), given, 'no line of any snippet was removed');
		assert.deepEqual(exerciseButtonsFor(settings, settings.language), { hint: false, solution: false, check: false });
	});

	test(`${name}: the placeholder has no new element and no new control`, () => {
		const html = render(createElement(CodeEditor, props));
		assert.match(html, /^<div class="frame" aria-busy="true">/, 'no wrapper element around the frame');
		assert.doesNotMatch(html, /\sid="/, 'no DOM id');
		assert.equal(count(html, /class="iconSpacer"/g), ICON_BUTTONS_BEFORE + THEME_BUTTON, 'the five spaces and the Theme button\'s');
		assert.equal(count(html, /class="runButton runSpacer"/g), 1);
		assert.doesNotMatch(html, /data-ce-mode/, 'the placeholder draws the default theme in the site\'s mode, as before');
		assert.doesNotMatch(html, /checkSpacer|stepBar|class="exercise"|class="anchor"|class="hints"|Expected output/);
		assert.doesNotMatch(html, /Hints available|cueIcon|<svg[^>]*viewBox="0 0 24 24"/, 'no hint cue, no light bulb in the idle line');
		assert.match(html, /<div class="output"><p class="hint">Run the code to see its output \(⌘\/Ctrl\+Enter\)\.<\/p>/, 'the idle line, word for word');
		assert.doesNotMatch(html, /runtimeSlot|inert|waitingCode|editorBoxWaiting|editorBoxFailed/, 'no runtime slot, nothing inert, no waiting text, not the failure frame');
		assert.equal(count(html, /<pre class="printOnly"/g), 1, 'the print copy of the snippet, the one approved new element (2026-10-26): nothing on screen');
		assert.match(html, /<div class="identity"><span class="title">[^<]*<\/span><\/div>/, 'the title alone, as before');
	});

	test(`${name}: the header draws the same buttons as before`, () => {
		const html = render(createElement(Toolbar, toolbarPropsFor(normalizeEditorProps(props))));
		assert.equal(count(html, /<button[^>]*MuiIconButton-root/g), ICON_BUTTONS_BEFORE + THEME_BUTTON, 'Input · Reset · Clear · Copy code · Copy output, and Theme');
		assert.equal(count(html, /<button/g), ICON_BUTTONS_BEFORE + THEME_BUTTON + 1, 'and Run: nothing else');
		assert.equal(count(html, /<button[^>]*aria-label="Editor theme"[^>]*aria-haspopup="menu"|<button[^>]*aria-haspopup="menu"[^>]*aria-label="Editor theme"/g), THEME_BUTTON, 'the new control is the Theme button');
		assert.doesNotMatch(html, /checkButton|<button[^>]*aria-expanded|aria-label="Hints"|Show hint|Show the solution/);
		assert.equal(count(html, /aria-pressed=/g), 1, 'one toggle: Input (stdin)');
		assert.doesNotMatch(html, /runtimeSlot|aria-disabled/, 'no runtime slot around the pickers, no inactive button');
		assert.ok(!html.includes(`>${LABELS.check}<`));
	});

	test(`${name}: Monaco's options have the same keys as before, and the same values (a fit editor: its scrollbar's two keys)`, () => {
		const settings = normalizeEditorProps(props);
		const options = buildMonacoOptions(settings.editorOptions, { readOnly: settings.readOnly, hideErrors: settings.hideErrors, ariaLabel: 'Code editor: main.py', fit: settings.fit, fontFamily: FONT_STACK_BEFORE });
		assert.deepEqual(Object.keys(options).sort(), OPTION_KEYS_BEFORE);
		assert.equal(options.fontFamily, FONT_STACK_BEFORE, 'the same stack as before (the site sets it: --ce-font-family)');
		const scrollbarBefore = { ...DEFAULT_EDITOR_OPTIONS.scrollbar };
		assert.deepEqual(options.scrollbar, settings.fit ? { ...scrollbarBefore, ...FIT_SCROLLBAR_OPTIONS } : scrollbarBefore);
		for (const key of Object.keys(DEFAULT_EDITOR_OPTIONS).filter((name) => name !== 'scrollbar')) {
			assert.deepEqual(options[key], DEFAULT_EDITOR_OPTIONS[key], `${key}: as before`);
		}
	});
}

test('the blog post: the placeholder markup is exactly what it was', () => {
	const [, blogProps] = EDITORS[EDITORS.length - 1];
	assert.equal(render(createElement(CodeEditor, blogProps)), BLOG_PLACEHOLDER);
});

test('a read-only editor: one space fewer, as before, and Monaco shows its run errors (the one approved option change)', () => {
	const props = { initialCode: SQUARES_PY, readOnly: true };
	const html = render(createElement(CodeEditor, props));
	assert.equal(count(html, /class="iconSpacer"/g), ICON_BUTTONS_BEFORE_READ_ONLY + THEME_BUTTON);
	const settings = normalizeEditorProps(props);
	const options = buildMonacoOptions(settings.editorOptions, { readOnly: true, hideErrors: false });
	assert.equal(options.renderValidationDecorations, 'on');
});
