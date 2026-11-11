/**
 * render.test.js — the editor's .jsx parts that render without a browser, rendered on the server
 * through this folder's module hooks (jsxHooks.js), as the site renders every page at build time:
 *   - <CodeEditor> on the server is the placeholder (index.jsx): the frame, the title, an empty
 *     space per header button (one fewer when read-only — the same count as the real header's
 *     icon buttons), the box at its first height (50vh by default; with height="fit" the folded
 *     code's height), an inert resize strip right after the box (aria-hidden, the real strip's
 *     class plus its inert look, with the same grip, so nothing moves when the editor arrives), the stdin field's space when it starts
 *     open (as many rows as the field will show), the idle line (with an exercise's hint cue:
 *     "Hints available: 1 (click [bulb] to reveal).", the bulb drawn inline, "the Hints button"
 *     for screen readers; the waiting placeholder too);
 *   - the failure frame (the error boundary's fallback): the message, a Retry button, an alert;
 *     no hint cue (it has no light bulb to click);
 *   - the resize strip (ResizeHandle.jsx): a focusable separator with its label and tooltip, its
 *     grip hidden from screen readers;
 *   - the header (Toolbar.jsx): Run and Stop are the same element tree (the focus stays on it),
 *     Stop is never disabled, no tooltip wrapper <span> carries an aria-label, the copy
 *     result is said in a polite live region, and the Theme button (2026-10-25) sits after Copy
 *     output and before Run, in every editor (read-only too), with a space of its own in the
 *     placeholder.
 *   - a second editor with the same id never answers <CodeRef>s (index.jsx > ownsDomId);
 *   - the teaching layer (2026-10-25): an exercise's placeholder has a space for each of the
 *     light bulb, Solution and Check as the header draws them, and the exercise block in its
 *     output (inert while the editor loads or waits, working in the failure frame); Check and its
 *     Stop are one button; the light bulb (2026-10-26) is a toggle like Input (stdin): one name,
 *     "Hints", aria-pressed, aria-controls naming the hints area while open, never disabled, its
 *     tooltip "Show hints" closed and "Hide hints" open (Solution's likewise); the
 *     step bar sits right after the strip; an `id` or `loadWhenVisible` wraps the
 *     frame in one element with the DOM id; the waiting placeholder (a loadWhenVisible editor
 *     not near yet) is not busy and shows the code as text in a box of the same size; a
 *     TypeScript editor's runtime is text; an exercise's or a TypeScript editor's header and
 *     placeholder have the same runtime slot (props.js > runtimeSlotFor), so they wrap at the
 *     same widths (the widths themselves need a browser). (Nothing changes without these
 *     props: backCompat.test.js.)
 *   - the header's narrow layouts (styles.module.css, read as text): up to 620 px the actions
 *     always take a line of their own (the pickers arrive after the placeholder, so a header that
 *     fitted on one line without them would jump), and below 341 px they drop their gaps, so the
 *     six icons and Run fit on one line of a 320 px phone.
 * The error boundary itself, Monaco and the runs need a browser: they are checked by hand
 * (README.md > How to change it). Run with `npm run test:shared`.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDITOR_ERRORS, IDLE_HINT, IDLE_HINT_UNAVAILABLE, LABELS, LOADING_EDITOR, RUN_DISABLED, RUN_SHORTCUT, hintCueText } from '../messages.js';
import { RUNTIME_SLOTS, initialBoxStyle, normalizeEditorProps, runtimeSlotFor, waitingCodeStyle } from '../props.js';
import { MIN_HEIGHT_PX, stdinRows } from '../sizing.js';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: CodeEditor, EditorPlaceholder, boxClassOf, ownsDomId } = await import('../index.jsx');
const { default: Toolbar, COPY_STATES, hintsTooltip, solutionTooltip } = await import('../Toolbar.jsx');
const { default: ResizeHandle } = await import('../ResizeHandle.jsx');

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

const ICON_SPACER = /class="iconSpacer"/g;
const ICON_BUTTON = /<button[^>]*MuiIconButton-root/g;

/** The header's icon buttons: Input (stdin) · Reset · Clear · Copy code · Copy output · Theme (no Clear when read-only). */
const HEADER_ICON_BUTTONS = 6;
const HEADER_ICON_BUTTONS_READ_ONLY = HEADER_ICON_BUTTONS - 1;

/** Every button with a tooltip: the icon buttons and Run. */
const TOOLTIP_ANCHORS = HEADER_ICON_BUTTONS + 1;

/** The placeholder's inert resize strip, exactly. */
const INERT_STRIP = '<div class="resizeHandle resizeHandleInert" aria-hidden="true">';

/** The placeholder's editor box (its message inside) followed at once by the inert strip. */
const BOX_THEN_STRIP = /<div class="editorBox" style="[^"]*"><div class="cover"[^>]*>[\s\S]*?<\/div><\/div><div class="resizeHandle resizeHandleInert" aria-hidden="true"><svg class="resizeGrip"[^>]*aria-hidden="true"[^>]*>/;
/** The same in the failure frame, whose box carries editorBoxFailed (it stays visible in print: the message prints with the code). */
const BOX_THEN_STRIP_FAILED = /<div class="editorBox editorBoxFailed" style="[^"]*"><div class="cover"[^>]*>[\s\S]*?<\/div><\/div><div class="resizeHandle resizeHandleInert" aria-hidden="true"><svg class="resizeGrip"[^>]*aria-hidden="true"[^>]*>/;

/** The Run / Stop button with its tooltip wrapper. */
function runButtonOf(html) {
	const match = html.match(/<span class="tooltipAnchor"[^>]*><button[^>]*runButton[^>]*>[\s\S]*?<\/button><\/span>/);
	assert.ok(match, 'the Run / Stop button is drawn');
	return match[0];
}

/** The tag names of a piece of markup, in order (its element tree, without attributes or text). */
function tagsOf(html) {
	return [...html.matchAll(/<\/?([a-z]+)/g)].map((match) => match[0]);
}

/** The header's props (an idle Python editor with every button). */
function toolbarProps(overrides = {}) {
	return {
		title: 'main.py',
		languages: [{ id: 'python', label: 'Python' }],
		language: 'python',
		onLanguageChange() {},
		runtime: { options: [], version: '*', runLanguage: 'python', text: 'Python', notice: null, canRun: true },
		onVersionChange() {},
		running: false,
		runDisabledReason: null,
		onRun() {},
		onStop() {},
		onReset() {},
		onClear() {},
		onCopy() {},
		copyState: COPY_STATES.idle,
		onCopyOutput() {},
		copyOutputState: COPY_STATES.idle,
		hasOutput: false,
		stdinShown: false,
		onToggleStdin() {},
		themeFamily: 'vscode',
		onThemeChange() {},
		...overrides,
	};
}

test('the server render is the placeholder: frame, title, a space per header button, the box at its first height (50vh), the hint', () => {
	const props = { initialCode: 'a\nb\nc', foldedRegions: [[1, 3]] };
	const html = render(createElement(CodeEditor, props));
	assert.match(html, /^<div class="frame" aria-busy="true">/);
	assert.match(html, /<span class="title">main\.py<\/span>/);
	assert.equal(count(html, ICON_SPACER), HEADER_ICON_BUTTONS);
	assert.equal(count(html, /class="runButton runSpacer"/g), 1);
	assert.match(html, /<div class="actions" aria-hidden="true">/);
	assert.deepEqual(initialBoxStyle(normalizeEditorProps(props), 'python'), { height: '50vh' });
	assert.ok(html.includes('<div class="editorBox" style="height:50vh">'), 'the box at the default height, whatever the code');
	assert.ok(html.includes(`<div class="cover">${LOADING_EDITOR}</div>`));
	assert.match(html, /<p class="hint">/);
	assert.doesNotMatch(html, /class="stdin"/, 'no stdin: no field space');
});

test('height="fit": the placeholder\'s box is the folded code\'s height, between the minimum and the ceiling', () => {
	const props = { initialCode: 'a\nb\nc', foldedRegions: [[1, 3]], height: 'fit' };
	const html = render(createElement(CodeEditor, props));
	const style = initialBoxStyle(normalizeEditorProps(props), 'python');
	assert.equal(style.minHeight, `${MIN_HEIGHT_PX}px`, 'the fit-the-content style');
	assert.ok(html.includes(`<div class="editorBox" style="height:${style.height};min-height:${style.minHeight};max-height:${style.maxHeight}">`), 'the box at the folded height');
	const fixed = render(createElement(CodeEditor, { initialCode: 'x', height: '24rem' }));
	assert.ok(fixed.includes('<div class="editorBox" style="height:24rem">'), "a page's own height as it is");
});

test('the placeholder draws an inert resize strip right after the box (hidden from screen readers, not focusable)', () => {
	const html = render(createElement(CodeEditor, { initialCode: 'x' }));
	assert.equal(count(html, /class="resizeHandle resizeHandleInert"/g), 1, 'one strip, in its inert look (no resize cursor, no hover)');
	assert.match(html, BOX_THEN_STRIP, 'the strip follows the box at once');
	assert.ok(html.indexOf(INERT_STRIP) < html.indexOf('class="output"'), 'and comes before the output');
	assert.doesNotMatch(html, /role="separator"|tabindex=/, 'no separator role and no tab stop: it does nothing until the editor arrives');
	const withStdin = render(createElement(CodeEditor, { initialCode: 'x', showStdin: true }));
	assert.ok(withStdin.indexOf(INERT_STRIP) < withStdin.indexOf('class="stdin"'), 'above the stdin field, as in the real editor');
	const fit = render(createElement(CodeEditor, { initialCode: 'x', height: 'fit' }));
	assert.match(fit, BOX_THEN_STRIP, 'in fit mode too (a drag works there as well)');
	const failed = render(createElement(EditorPlaceholder, { settings: normalizeEditorProps({ initialCode: 'x' }), onRetry() {} }));
	assert.match(failed, BOX_THEN_STRIP_FAILED, 'and in the failure frame (its box carries editorBoxFailed for print): Retry keeps the frame the same size');
});

test('the resize strip (ResizeHandle.jsx): a focusable separator with its label and tooltip; the grip is decoration', () => {
	const boxRef = { current: null };
	const html = render(createElement(ResizeHandle, { boxRef, onResizeStart() {}, onReset() {} }));
	assert.match(html, /^<div role="separator" aria-orientation="horizontal"/);
	assert.ok(html.includes(`aria-label="${LABELS.resize}"`));
	assert.ok(html.includes(`title="${LABELS.resizeTooltip}"`));
	assert.match(html, /tabindex="0"/, 'reachable with Tab (the keys resize)');
	assert.match(html, new RegExp(`aria-valuemin="${MIN_HEIGHT_PX}"`));
	assert.match(html, /aria-valuemax="\d+"/);
	assert.match(html, /class="resizeHandle"/, 'not in its dragging look');
	assert.match(html, /<svg class="resizeGrip" viewBox="0 0 10 10" aria-hidden="true" focusable="false">/);
});

test('read-only: one button space fewer (no Clear), as in the real header', () => {
	const html = render(createElement(CodeEditor, { initialCode: 'x', readOnly: true }));
	assert.equal(count(html, ICON_SPACER), HEADER_ICON_BUTTONS_READ_ONLY);
});

test("the placeholder's button spaces match the real header's icon buttons (index.jsx > ICON_BUTTONS)", () => {
	const editable = render(createElement(Toolbar, toolbarProps()));
	const readOnly = render(createElement(Toolbar, toolbarProps({ onClear: null })));
	assert.equal(count(editable, ICON_BUTTON), count(render(createElement(CodeEditor, { initialCode: 'x' })), ICON_SPACER));
	assert.equal(count(readOnly, ICON_BUTTON), count(render(createElement(CodeEditor, { initialCode: 'x', readOnly: true })), ICON_SPACER));
});

test("stdin that starts open: the field's space, as many rows as the field will show", () => {
	const three = render(createElement(CodeEditor, { initialCode: 'x', stdin: '5\n1 2 3\n4' }));
	assert.ok(three.includes(`<div class="stdin"><div class="stdinPlaceholder" style="--ce-stdin-rows:${stdinRows('5\n1 2 3\n4')}"></div></div>`));
	assert.match(three, /--ce-stdin-rows:3"/);
	const openEmpty = render(createElement(CodeEditor, { initialCode: 'x', showStdin: true }));
	assert.match(openEmpty, /--ce-stdin-rows:2"/, 'an empty field shows its two rows');
	const closed = render(createElement(CodeEditor, { initialCode: 'x', stdin: '5', showStdin: false }));
	assert.doesNotMatch(closed, /class="stdin"/);
});

test('the failure frame: the message and a Retry button in an alert, not busy, no "Loading editor…"; its box keeps the class the print rule exempts', () => {
	const settings = normalizeEditorProps({ initialCode: 'print(1)' });
	const html = render(createElement(EditorPlaceholder, { settings, onRetry() {} }));
	assert.match(html, /^<div class="frame">/);
	assert.ok(html.includes(`<div class="editorBox editorBoxFailed" style="height:50vh"><div class="cover" role="alert"><span>${EDITOR_ERRORS.clientFailed}</span><button type="button" class="retryButton">${LABELS.retry}</button></div></div>`), 'the failed box (editorBoxFailed: it stays visible in print, so the message prints with the code)');
	assert.ok(!html.includes(LOADING_EDITOR));
	assert.match(EDITOR_ERRORS.clientFailed, /reload the page/i, 'Retry cannot bring back a chunk a deploy replaced: the frame names the reload too');
	assert.match(EDITOR_ERRORS.failedToLoad, /reload the page/i, 'and so does the notice when Monaco did not load');
	assert.deepEqual(boxClassOf({ waiting: false, failed: true }), 'editorBox editorBoxFailed');
	assert.deepEqual(boxClassOf({ waiting: true, failed: false }), 'editorBox editorBoxWaiting');
	assert.deepEqual(boxClassOf({ waiting: false, failed: false }), 'editorBox');
});

/** The print copy of a placeholder whose box holds only a message (index.jsx > PrintOnlyCode), or null. */
function printOnlyOf(html) {
	return html.match(/<pre class="printOnly" style="([^"]*)" aria-hidden="true">([\s\S]*?)<\/pre>/);
}

test('PRINT: the server render and the failure frame carry a print-only copy of the snippet after the box (magic comments removed); the waiting placeholder prints its own box instead', () => {
	const props = { initialCode: 'a = 1\n# highlight-next-line\nb = 2\nprint(a + b)\n', foldedRegions: [[1, 2]] };
	const settings = normalizeEditorProps(props);
	const server = render(createElement(CodeEditor, props));
	const copy = printOnlyOf(server);
	assert.ok(copy, 'the server HTML holds the code before the editor chunk arrives');
	assert.equal(copy[2], 'a = 1\nb = 2\nprint(a + b)\n', 'the code the editor will show');
	const style = waitingCodeStyle(settings);
	assert.ok(copy[1].includes(`font-size:${style.fontSize};line-height:${style.lineHeight}`), "the waiting text's metrics");
	assert.match(server, /<div class="editorBox" style="[^"]*"><div class="cover">Loading editor…<\/div><\/div><div class="resizeHandle resizeHandleInert"[\s\S]*?<\/div><pre class="printOnly"/, 'the box (hidden in print), the strip, then the copy: where the loaded editor puts its PrintCopy');
	const failed = render(createElement(EditorPlaceholder, { settings, onRetry() {} }));
	assert.equal(printOnlyOf(failed)?.[2], 'a = 1\nb = 2\nprint(a + b)\n', 'the failure frame too');
	const waiting = render(createElement(EditorPlaceholder, { settings, waiting: true }));
	assert.equal(printOnlyOf(waiting), null, 'the waiting placeholder prints its own waitingCode box, not a second copy');
	assert.match(waiting, /class="waitingCode"/);
});

test('Run and Stop are ONE element tree (the keyboard focus stays on it); only its looks and words change', () => {
	const idle = runButtonOf(render(createElement(Toolbar, toolbarProps())));
	const running = runButtonOf(render(createElement(Toolbar, toolbarProps({ running: true }))));
	assert.deepEqual(tagsOf(running), tagsOf(idle));
	assert.match(idle, /MuiButton-contained[^"]*MuiButton-colorPrimary[\s\S]*>Run<\/button>/);
	assert.match(running, /MuiButton-outlined[^"]*MuiButton-colorError[\s\S]*>Stop<\/button>/);
});

test('Run is disabled with a reason; Stop never is', () => {
	const disabled = runButtonOf(render(createElement(Toolbar, toolbarProps({ runDisabledReason: RUN_DISABLED.empty }))));
	assert.match(disabled, /<button[^>]* disabled=""/);
	const stop = runButtonOf(render(createElement(Toolbar, toolbarProps({ running: true, runDisabledReason: RUN_DISABLED.empty }))));
	assert.doesNotMatch(stop, /disabled=""/);
});

test('no tooltip wrapper <span> carries an aria-label (the buttons inside carry their own)', () => {
	const html = render(createElement(Toolbar, toolbarProps({ runDisabledReason: RUN_DISABLED.loading })));
	assert.equal(count(html, /<span class="tooltipAnchor"/g), TOOLTIP_ANCHORS);
	assert.doesNotMatch(html, /<span[^>]*aria-label=/);
	assert.match(html, /<button[^>]*aria-label="Copy code"/);
});

test('the Theme button: after Copy output, before Run, in every editor (read-only and exercises too), with its own placeholder space', () => {
	const order = (html) => ['aria-label="Copy output"', 'aria-label="Editor theme"', '>Run</button>'].map((marker) => html.indexOf(marker));
	for (const props of [toolbarProps(), toolbarProps({ onClear: null }), exerciseToolbarProps()]) {
		const html = render(createElement(Toolbar, props));
		assert.equal(count(html, /<button[^>]*aria-label="Editor theme"/g), 1, 'one Theme button');
		const [copyOutput, theme, run] = order(html);
		assert.ok(copyOutput >= 0 && copyOutput < theme && theme < run, 'Copy output · Theme · … · Run');
	}
	const exercise = render(createElement(Toolbar, exerciseToolbarProps()));
	assert.ok(exercise.indexOf('aria-label="Editor theme"') < exercise.indexOf('aria-label="Hints"'), "before an exercise's light bulb");
	const placeholder = render(createElement(CodeEditor, { initialCode: 'x' }));
	assert.match(placeholder, /^<div class="frame" aria-busy="true">/, 'the placeholder carries no data-ce-mode: it follows the site through the stylesheet (index.jsx > THE READER\'S THEME)');
	assert.doesNotMatch(placeholder, /data-ce-mode/);
});

test('the copy result is said in a polite live region (empty while there is nothing to say)', () => {
	const live = (copyState) => render(createElement(Toolbar, toolbarProps({ copyState }))).match(/<span class="visuallyHidden" role="status">([^<]*)<\/span>/)?.[1];
	assert.equal(live(COPY_STATES.idle), '');
	assert.equal(live(COPY_STATES.copied), LABELS.copied);
	assert.equal(live(COPY_STATES.failed), LABELS.copyFailed.replace("'", '&#x27;'));
});

// ---- the teaching layer (2026-10-25): what the placeholder draws for the new props ----

/** An exercise with every header button: hints, a solution and tests. */
const EXERCISE_PROPS = Object.freeze({
	initialCode: 'def add(a, b):\n    return 0\n',
	hints: ['Add them.'],
	solution: 'def add(a, b):\n    return a + b\n',
	tests: 'check("add(2, 3)", add(2, 3), 5)',
	expectedOutput: '\n5\n',
});

/** The header props the editor passes for EXERCISE_PROPS (idle). */
function exerciseToolbarProps(overrides = {}) {
	return toolbarProps({
		hint: { open: false, areaId: 'hints-area' },
		solution: { open: false, panelId: 'solution-panel', disabled: false },
		check: { checking: false, disabledReason: null },
		...overrides,
	});
}

test("an exercise's placeholder: a space for the light bulb, Solution and Check, as the real header draws them", () => {
	const placeholder = render(createElement(CodeEditor, EXERCISE_PROPS));
	const header = render(createElement(Toolbar, exerciseToolbarProps()));
	assert.equal(count(placeholder, ICON_SPACER), HEADER_ICON_BUTTONS + 2);
	assert.equal(count(header, ICON_BUTTON), count(placeholder, ICON_SPACER), 'one space per icon button');
	assert.equal(count(placeholder, /class="checkButton checkSpacer"/g), 1);
	assert.equal(count(header, /<button[^>]*checkButton[^>]*>Check<\/button>/g), 1, 'Check is a text button');
	assert.ok(placeholder.indexOf('checkSpacer') < placeholder.indexOf('runSpacer'), 'Check comes just before Run');
	assert.match(header, /<button[^>]*aria-label="Hints"/);
	assert.match(header, /<button[^>]*aria-expanded="false"[^>]*aria-label="Solution"|<button[^>]*aria-label="Solution"[^>]*aria-expanded="false"/);
});

test("an exercise's placeholder: the exercise block in the output (the closed \"Expected output\"), as the panel draws it before a run", () => {
	const html = render(createElement(CodeEditor, EXERCISE_PROPS));
	assert.match(html, /<div class="output"><p class="hint">[\s\S]*?<\/p><div class="exercise" inert=""><div aria-live="polite"><\/div><div aria-live="polite"><\/div><details class="expected">/);
	assert.ok(html.includes('<code>5</code>'), 'the expected text without its leading newline');
	const readOnly = render(createElement(CodeEditor, { ...EXERCISE_PROPS, readOnly: true }));
	assert.equal(count(readOnly, ICON_SPACER), HEADER_ICON_BUTTONS_READ_ONLY + 1, 'read-only: no Clear and no Solution (its edit could not be undone)');
});

test('Check while it waits: the same button, now Stop (red), never disabled', () => {
	const idle = render(createElement(Toolbar, exerciseToolbarProps()));
	const checking = render(createElement(Toolbar, exerciseToolbarProps({ check: { checking: true, disabledReason: 'x' } })));
	const checkButton = (html) => html.match(/<button[^>]*checkButton[^>]*>[^<]*<\/button>/)[0];
	assert.match(checkButton(idle), />Check<\/button>$/);
	assert.match(checkButton(checking), /MuiButton-colorError[\s\S]*>Stop<\/button>$/);
	assert.doesNotMatch(checkButton(checking), /disabled=""/);
});

test('steps: the placeholder draws the step bar (inert) after the resize strip and the print copy, as the editor does (its strip, PrintCopy, then the bar)', () => {
	const html = render(createElement(CodeEditor, { initialCode: 'a\nb\n', steps: [{ lines: 1, note: 'first' }, { lines: 2, note: 'second' }] }));
	assert.match(html, /<div class="resizeHandle resizeHandleInert" aria-hidden="true">[\s\S]*?<\/svg><\/div><pre class="printOnly"[^>]*>[\s\S]*?<\/pre><div class="stepBar" role="group"/);
	assert.equal(count(html, /<button type="button" class="stepButton"[^>]* disabled=""/g), 2, 'both buttons inert until the editor arrives');
});

test('id and loadWhenVisible: one wrapper element, carrying the DOM id <CodeRef> scrolls to', () => {
	const named = render(createElement(CodeEditor, { id: 'two-sum', initialCode: 'x' }));
	assert.match(named, /^<div id="code-editor-two-sum" class="anchor"><div class="frame" aria-busy="true">/);
	const lazy = render(createElement(CodeEditor, { loadWhenVisible: true, initialCode: 'x' }));
	assert.match(lazy, /^<div class="anchor"><div class="frame" aria-busy="true">/, 'the placeholder until the editor nears the view');
});

test('a TypeScript editor shows its runtime as text, never a menu (with a language picker: without the word TypeScript)', () => {
	const runtime = { options: [], version: '20.11.1', runLanguage: 'javascript', text: 'TypeScript 5.9.3 · Node 20.11.1', notice: null, canRun: true, textOnly: true, shortText: '5.9.3 · Node 20.11.1' };
	const alone = render(createElement(Toolbar, toolbarProps({ runtime, language: 'typescript', languages: [{ id: 'typescript', label: 'TypeScript' }] })));
	assert.ok(alone.includes('<span class="versionText">TypeScript 5.9.3 · Node 20.11.1</span>'));
	const languages = [{ id: 'typescript', label: 'TypeScript' }, { id: 'python', label: 'Python' }];
	const picker = render(createElement(Toolbar, toolbarProps({ runtime, language: 'typescript', languages })));
	assert.ok(picker.includes('<span class="versionText">5.9.3 · Node 20.11.1</span>'));
});

test("the placeholder's exercise block is inert while the editor loads or waits (it is replaced: an opened block would snap shut), and works in the failure frame", () => {
	const settings = normalizeEditorProps(EXERCISE_PROPS);
	const loading = render(createElement(EditorPlaceholder, { settings }));
	const waiting = render(createElement(EditorPlaceholder, { settings, waiting: true }));
	const failed = render(createElement(EditorPlaceholder, { settings, onRetry() {} }));
	assert.match(loading, /<div class="exercise" inert="">/);
	assert.match(waiting, /<div class="exercise" inert="">/);
	assert.match(failed, /<div class="exercise"><div aria-live/, 'the failure frame: no inert, the block can be read');
	assert.equal(count(loading, /inert=/g), 1, 'only the exercise block (the hint above it stays readable)');
	const testsOnly = render(createElement(CodeEditor, { initialCode: EXERCISE_PROPS.initialCode, tests: EXERCISE_PROPS.tests }));
	assert.match(testsOnly, /<div class="exercise" inert=""><div aria-live="polite"><\/div><div aria-live="polite"><\/div><\/div>/, 'tests only: the two empty live regions, inert too');
	const plain = render(createElement(CodeEditor, { initialCode: 'x' }));
	assert.doesNotMatch(plain, /inert/, 'an editor without an exercise: nothing new');
});

test('the waiting placeholder (a loadWhenVisible editor not near yet): not busy, the code as text in a box of the same size, no "Loading editor…"', () => {
	const props = { initialCode: 'a = 1\n# highlight-next-line\nb = 2\nprint(a + b)\n', foldedRegions: [[1, 2]], height: 'fit', loadWhenVisible: true };
	const settings = normalizeEditorProps(props);
	const loading = render(createElement(EditorPlaceholder, { settings }));
	const waiting = render(createElement(EditorPlaceholder, { settings, waiting: true }));
	assert.match(loading, /^<div class="frame" aria-busy="true">/, 'loading for real: busy');
	assert.match(waiting, /^<div class="frame">/, 'waiting: nothing is loading, so not busy');
	assert.ok(!waiting.includes(LOADING_EDITOR));
	const boxStyle = loading.match(/<div class="editorBox" (style="[^"]*")>/)[1];
	assert.ok(waiting.includes(`<div class="editorBox editorBoxWaiting" ${boxStyle}>`), 'the same box size (the print rule reads editorBoxWaiting)');
	const pre = waiting.match(/<pre class="waitingCode" style="([^"]*)">([\s\S]*?)<\/pre>/);
	assert.ok(pre, 'the code in a <pre> inside the box');
	assert.equal(pre[2], 'a = 1\nb = 2\nprint(a + b)\n', 'the code the editor will show: the magic comment removed, the folds open');
	const style = waitingCodeStyle(settings);
	assert.ok(pre[1].includes(`font-size:${style.fontSize};line-height:${style.lineHeight};padding-top:${style.paddingTop}`), "Monaco's font size, line height and top padding");
	const server = render(createElement(CodeEditor, props));
	assert.match(server, /^<div class="anchor"><div class="frame" aria-busy="true">/, 'the server render stays the loading placeholder (hydration matches it)');
	assert.doesNotMatch(server, /waitingCode/);
});

/** The header's runtime slot in a placeholder ({ slot } or null) and in a header ({ slot, inner } or null). */
function placeholderSlot(html) {
	const match = html.match(/<div class="identity"><span class="title">[^<]*<\/span><div class="runtimeSlot" data-slot="(\w+)" aria-hidden="true"><\/div><\/div>/);
	return match ? match[1] : null;
}

function headerSlot(html) {
	const match = html.match(/<div class="runtimeSlot" data-slot="(\w+)">/);
	return match ? match[1] : null;
}

/** Each case: [name, editor props, the header's props for it (the buttons the editor shows, the language, the languages)]. */
const TS_RUNTIME = Object.freeze({ options: [], version: '20.11.1', runLanguage: 'javascript', text: 'TypeScript 5.9.3 · Node 20.11.1', notice: null, canRun: true, textOnly: true, shortText: '5.9.3 · Node 20.11.1' });
const SLOT_CASES = Object.freeze([
	['a Python exercise', EXERCISE_PROPS, exerciseToolbarProps(), RUNTIME_SLOTS.single],
	['an exercise with hints only', { initialCode: 'x', hints: ['h'] }, toolbarProps({ hint: { open: false, areaId: 'h' } }), RUNTIME_SLOTS.single],
	[
		'a JavaScript exercise',
		{ initialCode: 'let x', language: 'javascript', tests: 'check("x", x, 1)' },
		toolbarProps({ language: 'javascript', languages: [{ id: 'javascript', label: 'JavaScript' }], check: { checking: false, disabledReason: null } }),
		RUNTIME_SLOTS.single,
	],
	[
		'a two-language exercise (a language picker)',
		{ initialCode: { python: 'x', javascript: 'y' }, solution: 'x = 1' },
		toolbarProps({ languages: [{ id: 'python', label: 'Python' }, { id: 'javascript', label: 'JavaScript' }], solution: { open: false, panelId: 'p', disabled: false } }),
		RUNTIME_SLOTS.several,
	],
	[
		'a TypeScript editor without an exercise',
		{ initialCode: 'const x: number = 1;', language: 'typescript' },
		toolbarProps({ language: 'typescript', languages: [{ id: 'typescript', label: 'TypeScript' }], runtime: TS_RUNTIME }),
		RUNTIME_SLOTS.single,
	],
	[
		'TypeScript beside Python',
		{ initialCode: { typescript: 'let a = 1;', python: 'a = 1' } },
		toolbarProps({ language: 'typescript', languages: [{ id: 'typescript', label: 'TypeScript' }, { id: 'python', label: 'Python' }], runtime: TS_RUNTIME }),
		RUNTIME_SLOTS.several,
	],
	['a plain Python editor', { initialCode: 'x' }, toolbarProps(), null],
	['a plain two-language editor', { initialCode: { python: 'x', go: 'y' } }, toolbarProps({ languages: [{ id: 'python', label: 'Python' }, { id: 'go', label: 'Go' }] }), null],
]);

for (const [name, props, headerProps, expected] of SLOT_CASES) {
	test(`the runtime slot, ${name}: the placeholder and the header agree (${expected ?? 'none'})`, () => {
		const placeholder = render(createElement(CodeEditor, props));
		const header = render(createElement(Toolbar, headerProps));
		assert.equal(placeholderSlot(placeholder), expected, 'the placeholder: an empty slot right after the title, or none');
		assert.equal(headerSlot(header), expected, 'the header: the same slot around its pickers or text');
		if (expected === null) assert.doesNotMatch(placeholder + header, /runtimeSlot/, 'no slot at all: the header as before');
	});
}

test('the runtime slot holds the header\'s pickers or version text, and the slot is what props.js > runtimeSlotFor says', () => {
	const ts = render(createElement(Toolbar, SLOT_CASES[4][2]));
	assert.ok(ts.includes('<div class="runtimeSlot" data-slot="single"><span class="versionText">TypeScript 5.9.3 · Node 20.11.1</span></div>'));
	const several = render(createElement(Toolbar, SLOT_CASES[3][2]));
	assert.match(several, /<div class="runtimeSlot" data-slot="several"><div class="[^"]*MuiInputBase-root[^"]*"><div [^>]*aria-label="Language"/, 'the language picker first, inside the slot');
	assert.equal(runtimeSlotFor({ buttons: { hint: true, solution: false, check: false }, language: 'python', languageCount: 1 }), RUNTIME_SLOTS.single);
	assert.equal(runtimeSlotFor({ buttons: { hint: false, solution: false, check: false }, language: 'ts', languageCount: 1 }), RUNTIME_SLOTS.single, 'an alias of TypeScript too');
});

test('the light bulb: a toggle like Input (stdin) — one name, "Hints", aria-pressed, aria-controls naming the area only while it is open', () => {
	const bulb = (html) => html.match(/<button[^>]*aria-label="Hints"[^>]*>/)[0];
	const closed = bulb(render(createElement(Toolbar, exerciseToolbarProps({ hint: { open: false, areaId: 'hints-area' } }))));
	assert.match(closed, /aria-pressed="false"/);
	assert.doesNotMatch(closed, /aria-controls|aria-expanded/, 'closed: the area is not in the page, so nothing to name');
	const open = bulb(render(createElement(Toolbar, exerciseToolbarProps({ hint: { open: true, areaId: 'hints-area' } }))));
	assert.match(open, /aria-pressed="true"/);
	assert.match(open, /aria-controls="hints-area"/);
	for (const button of [closed, open]) assert.doesNotMatch(button, /aria-disabled|\sdisabled=""|Mui-disabled/, 'never greyed out: it always opens or closes the area');
	const stdin = render(createElement(Toolbar, exerciseToolbarProps())).match(/<button[^>]*aria-label="Input \(stdin\)"[^>]*>/)[0];
	assert.match(stdin, /aria-pressed="false"/, 'the same pattern as the Input (stdin) toggle');
	assert.equal(LABELS.hints, 'Hints', 'the name, the same in both states');
	assert.equal(hintsTooltip(false), 'Show hints', 'closed: the tooltip says what a press does');
	assert.equal(hintsTooltip(true), 'Hide hints', 'open');
	const toolbar = readFileSync(new URL('../Toolbar.jsx', import.meta.url), 'utf8');
	assert.match(toolbar, /tooltip=\{hintsTooltip\(hint\.open\)\}/, "the light bulb's tooltip is hintsTooltip (MUI's closed Tooltip draws nothing on the server)");
});

test("Solution's tooltip: \"Show the solution\" while the panel is closed, \"Hide the solution\" while it is open", () => {
	assert.equal(solutionTooltip(false), 'Show the solution');
	assert.equal(solutionTooltip(true), 'Hide the solution');
	const toolbar = readFileSync(new URL('../Toolbar.jsx', import.meta.url), 'utf8');
	assert.match(toolbar, /tooltip=\{solutionTooltip\(solution\.open\)\}/);
});

test("the placeholder's idle line: an exercise with hints names them, the light bulb drawn inline (singular and plural); without hints, the line as before", () => {
	const idleLine = (props) => render(createElement(CodeEditor, props)).match(/<p class="hint">[\s\S]*?<\/p>/)[0];
	const three = idleLine({ initialCode: 'x', hints: ['a', 'b', 'c'] });
	assert.ok(three.startsWith(`<p class="hint">${IDLE_HINT} <span>Hints available: 3 (click <svg class="cueIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="`));
	assert.ok(three.endsWith('"></path></svg><span class="visuallyHidden">the Hints button</span> to reveal).</span></p>'), "the bulb in words for screen readers: the button's name as they announce it");
	const one = idleLine({ initialCode: 'x', hints: ['a'] });
	assert.match(one, /Hints available: 1 \(click <svg/, 'one hint: the same words');
	assert.equal(hintCueText(1), 'Hints available: 1 (click the Hints button to reveal).');
	assert.equal(hintCueText(3), 'Hints available: 3 (click the Hints button to reveal).');
	assert.equal(idleLine({ initialCode: 'x' }), `<p class="hint">${IDLE_HINT}</p>`, 'no hints: exactly the old line');
	assert.match(idleLine({ ...EXERCISE_PROPS }), /Hints available: 1 \(click/, 'in a full exercise too');
});

test('the failure frame of an exercise with hints: the idle line WITHOUT the cue (no light bulb to click); the waiting placeholder keeps it', () => {
	const settings = normalizeEditorProps({ initialCode: 'x', hints: ['a', 'b', 'c'] });
	const failed = render(createElement(EditorPlaceholder, { settings, onRetry() {} }));
	assert.doesNotMatch(failed, /Hints available|class="cueIcon"|the Hints button/, 'no cue, no inline bulb, no hidden words');
	assert.doesNotMatch(failed, /aria-label="Hints"/, 'and indeed no light bulb in its header');
	assert.ok(failed.includes(`<p class="hint">${IDLE_HINT_UNAVAILABLE}</p>`), 'the idle line names no Run: the failure frame has none');
	assert.ok(!failed.includes(IDLE_HINT) && !failed.includes(RUN_SHORTCUT), 'no "Run the code", no shortcut');
	assert.equal((failed.match(/<p class="hint">/g) ?? []).length, 1, 'still exactly one idle line: the frame keeps its size');
	const loading = render(createElement(EditorPlaceholder, { settings }));
	assert.ok(loading.includes('Hints available: 3'), 'the loading placeholder still draws the cue (it stands in for the editor)');
	const waiting = render(createElement(EditorPlaceholder, { settings, waiting: true }));
	assert.ok(waiting.includes('Hints available: 3'), 'and so does the waiting one');
});

test('ownsDomId: only the first element with the editor\'s DOM id answers <CodeRef>s (a duplicate id is reported instead)', () => {
	const first = {};
	const page = { getElementById: (domId) => (domId === 'code-editor-two-sum' ? first : null) };
	first.ownerDocument = page;
	const second = { ownerDocument: page };
	assert.equal(ownsDomId(first, 'two-sum'), true);
	assert.equal(ownsDomId(second, 'two-sum'), false, 'the second editor with that id');
	assert.equal(ownsDomId({ ownerDocument: { getElementById: () => null } }, 'two-sum'), true, 'not in the page yet: cannot tell');
	assert.equal(ownsDomId(null, 'two-sum'), true);
});

/* ---- the header's narrow layouts (styles.module.css) ---- */

const STYLESHEET = readFileSync(new URL('../styles.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the `@media (max-width: <px>px)` block of the stylesheet (its inner rules as text), or null. */
function mediaBlock(px) {
	const start = STYLESHEET.indexOf(`@media (max-width: ${px}px) {`);
	if (start === -1) return null;
	let depth = 0;
	for (let index = STYLESHEET.indexOf('{', start); index < STYLESHEET.length; index += 1) {
		if (STYLESHEET[index] === '{') depth += 1;
		if (STYLESHEET[index] === '}') depth -= 1;
		if (depth === 0) return STYLESHEET.slice(start, index + 1);
	}
	return null;
}

/** A CSS length in px at the root's 16 px (rem, px, or calc(<rem> + <px>)). */
function pxOf(length) {
	const rem = Number(length.match(/([\d.]+)rem/)?.[1] ?? 0);
	const px = Number(length.match(/([\d.]+)px/)?.[1] ?? 0);
	return rem * 16 + px;
}

/** The px widths the 320 px check needs, from the stylesheet (see the test below). */
const ROOT_PX = 16;
const NARROW_PHONE_ACTIONS_PX = 270; // a 320 px window: the page's 16 px gutters, the frame's border, the header's 8 px paddings (measured 2026-10-25)

test('up to 620 px the actions always take a line of their own: the header wraps the same before and after the pickers arrive', () => {
	const stacked = mediaBlock(620);
	assert.ok(stacked, 'a (max-width: 620px) block');
	assert.match(stacked, /\.actions \{[^}]*flex-basis: 100%;/, 'the actions take the whole line');
	assert.equal(mediaBlock(480)?.includes('flex-basis'), false, 'no second, narrower stacking rule');
});

test('below 341 px the actions drop their gaps: six icons and Run fit on one line of a 320 px phone (Run never alone on a third line)', () => {
	const narrow = mediaBlock(340);
	assert.ok(narrow, 'a (max-width: 340px) block');
	assert.match(narrow, /\.actions \{\s*gap: 0;\s*\}/);
	const icon = pxOf(STYLESHEET.match(/--ce-icon-button-size: ([^;]+);/)[1]);
	const run = STYLESHEET.match(/\.actions \.runButton,\s*\.actions \.checkButton \{([^}]*)\}/)[1];
	const runWidth = pxOf(run.match(/min-width: ([^;]+);/)[1]) + pxOf(run.match(/margin-left: ([^;]+);/)[1]);
	const iconButtons = 6; // index.jsx > ICON_BUTTONS: Input, Reset, Clear, Copy code, Copy output, Theme
	assert.equal(icon, 1.25 * ROOT_PX + 10, 'a small IconButton: 30 px');
	assert.ok(iconButtons * icon + runWidth <= NARROW_PHONE_ACTIONS_PX, `${iconButtons * icon + runWidth} px of actions fit in ${NARROW_PHONE_ACTIONS_PX} px`);
	const gap = pxOf(STYLESHEET.match(/\.actions \{[^}]*gap: ([^;]+);/)[1]);
	assert.ok(iconButtons * (icon + gap) + runWidth > NARROW_PHONE_ACTIONS_PX, 'with the gaps they would not (why the rule exists)');
});
