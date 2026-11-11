/**
 * useGuided.test.js — the guided parts' rules (../useGuided.js), through createGuide with fakes
 * of Monaco's editor and model (they log the reveals and keep the decorations), wrapped in the
 * real Monaco surface (../monacoSurface.js, so its delegation is exercised too), and a fake
 * page follow-up, plus the hook rendered on the server and the small helpers:
 *   - nothing is revealed while a fold pass runs: a <CodeRef>'s request, and the reveal of a
 *     step chosen with Previous / Next, wait for foldsEnded (the mount's folds, Reset's);
 *     without a fold pass they act at once; only the newest waits;
 *   - another language: the request switches back first and acts when the opening language
 *     shows; the screen-reader words start with "Switched to …";
 *   - Reset keeps the step and reveals a step past the first once its folds have closed (not
 *     step 1, not in another language);
 *   - Clear / "Use this solution": the step bar goes stale, Previous / Next draw nothing, a
 *     <CodeRef> gets a warning and a word instead; per language; Reset or an undo back to the
 *     snippet ends it;
 *   - the words for screen readers: the lines shown, lines past the end, a step the bar cannot
 *     say itself (and none it can); the page follow-up gets the revealed span and the fit flag,
 *     and the flash waits for it;
 *   - the hook: an inert bar before the surface is up, a live one after; the surface that owns
 *     the DOM id (ownsEditorDomId); the marks in words (markedLinesSummary);
 *   - attach(surface) again (a phone's "Tap to edit": the static surface, then Monaco's): the
 *     old surface's marks go, the new one's listener is heard, the old one's not.
 * Run with `npm run test:shared`.
 * To change it: a new rule of ../useGuided.js gets a test here, over the fakes and the real Monaco
 * surface.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ANNOUNCE_DELAY_MS, REVEAL_STEP, WARNINGS, WORDS, createGuide, markedLinesSummary, ownsEditorDomId, useGuided } = await import('../useGuided.js');
const { LINE_KINDS, STEP_CLASS } = await import('../decorations.js');
const { createMonacoSurface } = await import('../monacoSurface.js');
const { EDITOR_WARNINGS } = await import('../messages.js');
const { stepSpeech } = await import('../StepBar.jsx');
const { ACTION_TYPES } = await import('../lib/registry/index.js');

const PYTHON = Array.from({ length: 20 }, (_, index) => `line_${index + 1} = ${index}`).join('\n');
const JAVASCRIPT = 'let a = 1;\nconsole.log(a);';

const STEPS = Object.freeze([
	{ ranges: [[1, 2]], note: 'Set up `a`.', title: 'Start' },
	{ ranges: [[5, 7]], note: 'The loop.', title: 'Loop' },
	{ ranges: [[15, 16]], note: 'Print it.', title: '' },
]);

/** An editor's settings as props.js gives them (only what useGuided reads). */
function settingsFor(overrides = {}) {
	return {
		id: 'demo',
		language: 'python',
		steps: STEPS,
		lineKinds: { python: { 3: 'error', 4: 'success' }, javascript: { 1: 'warning' } },
		snippets: { languages: ['python', 'javascript'], code: { python: PYTHON, javascript: JAVASCRIPT } },
		fit: false,
		title: undefined,
		...overrides,
	};
}

class FakeRange {
	constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
		Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
	}
}

const fakeMonaco = Object.freeze({
	Range: FakeRange,
	editor: Object.freeze({
		TrackedRangeStickiness: Object.freeze({ NeverGrowsWhenTypingAtEdges: 1 }),
		ScrollType: Object.freeze({ Smooth: 0, Immediate: 1 }),
	}),
});

/** A text model over `code` that keeps its decorations (id -> { range, options }). */
function fakeModel(code) {
	let text = code;
	let nextId = 1;
	return {
		decorations: new Map(),
		getValue: () => text,
		setValue(value) {
			text = value;
		},
		getLineCount: () => text.split('\n').length,
		getLineMaxColumn: (line) => text.split('\n')[line - 1].length + 1,
		isDisposed: () => false,
		deltaDecorations(oldIds, added) {
			for (const id of oldIds) this.decorations.delete(id);
			return added.map((decoration) => {
				const id = `d${nextId++}`;
				this.decorations.set(id, decoration);
				return id;
			});
		},
	};
}

/** The lines of a model's decorations whose className holds `className`, in order. */
function linesWith(model, className) {
	return [...model.decorations.values()]
		.filter((decoration) => decoration.options.className?.split(' ').includes(className))
		.map((decoration) => decoration.range.startLineNumber)
		.sort((a, b) => a - b);
}

/** An editor showing one model per language; reveals logged; content listeners told by fireContent(event). */
function fakeEditor(models, language) {
	const contentListeners = new Set();
	const editor = {
		models,
		language,
		reveals: [],
		getModel() {
			return this.models[this.language] ?? null;
		},
		getContribution: () => null,
		revealLinesInCenterIfOutsideViewport(start, end) {
			this.reveals.push([start, end]);
		},
		onDidDispose() {},
		onDidChangeModelContent(listener) {
			contentListeners.add(listener);
			return { dispose: () => contentListeners.delete(listener) };
		},
		fireContent(event) {
			for (const listener of [...contentListeners]) listener(event);
		},
		contentListenerCount: () => contentListeners.size,
	};
	return editor;
}

/** The surface the shell hands the guide: the real Monaco adapter over the fake editor (no page geometry needed here). */
function surfaceOf(editor) {
	return createMonacoSurface(editor, fakeMonaco);
}

/** Waits until every pending promise callback has run. */
function settle() {
	return new Promise((resolve) => setImmediate(resolve));
}

/**
 * A guide over a fake editor (Python opening, JavaScript second) with everything it reports
 * recorded: { guide, editor, models, warnings, said, stale, indexes, switches, follows }.
 */
function setup({ settings = settingsFor(), follow } = {}) {
	const models = { python: fakeModel(settings.snippets.code.python), javascript: fakeModel(settings.snippets.code.javascript) };
	const editor = fakeEditor(models, settings.language);
	const record = { warnings: [], said: [], stale: [], indexes: [], switches: [], follows: [] };
	const guide = createGuide({
		settings,
		currentLanguage: () => editor.language,
		showLanguage: (language) => record.switches.push(language),
		report: {
			stepIndex: (index) => record.indexes.push(index),
			staleLanguages: (set) => record.stale.push([...set]),
			announce: (text) => record.said.push(text),
		},
		warn: (...parts) => record.warnings.push(parts[0]),
		follow:
			follow ??
			((followed, span, options) => {
				record.follows.push({ span, options });
				return Promise.resolve();
			}),
	});
	guide.attach(surfaceOf(editor));
	return { guide, editor, models, ...record };
}

/** The mount as CodeEditorClient.jsx does it: marks on, the fold pass started (and the show's end). */
function mountWithFolds({ guide }, language = 'python') {
	guide.applyMarks(language);
	guide.foldsStarted();
	guide.modelShown();
}

const SHOW_LINES = Object.freeze({ type: ACTION_TYPES.lines, ranges: [[12, 13]] });

test('a <CodeRef> request that arrives while the first folds close waits, and is revealed only when the pass ends', async () => {
	const context = setup();
	mountWithFolds(context);
	context.guide.perform(SHOW_LINES);
	await settle();
	assert.deepEqual(context.editor.reveals, [], 'nothing revealed while the folds close (their scroll to the top would undo it)');
	context.guide.foldsEnded('python');
	await settle();
	assert.deepEqual(context.editor.reveals, [[12, 13]]);
	assert.deepEqual(linesWith(context.models.python, 'dwf-ce-flash'), [12, 13], 'then flashed');
	assert.deepEqual(context.said, [WORDS.showingLines('lines 12 to 13', 'main.py')]);
});

test('no fold pass running: a request acts at once; only the newest waiting one is kept', async () => {
	const context = setup();
	context.guide.applyMarks('python');
	context.guide.perform(SHOW_LINES);
	await settle();
	assert.deepEqual(context.editor.reveals, [[12, 13]]);
	context.guide.foldsStarted();
	context.guide.perform({ type: ACTION_TYPES.lines, ranges: [[2, 2]] });
	context.guide.perform({ type: ACTION_TYPES.lines, ranges: [[18, 19]] });
	context.guide.foldsEnded('python');
	await settle();
	assert.deepEqual(context.editor.reveals, [[12, 13], [18, 19]], 'the second request replaced the first');
});

test('a fold pass of an older show does not hold requests back once the newest pass ended', async () => {
	const context = setup();
	mountWithFolds(context);
	context.guide.foldsStarted(); // a newer pass (Reset) before the first ended: the client calls foldsEnded for the newest only
	context.guide.perform(SHOW_LINES);
	context.guide.foldsEnded('python');
	await settle();
	assert.deepEqual(context.editor.reveals, [[12, 13]]);
});

test('Previous / Next during a fold pass: the step is drawn at once, its reveal waits for the pass', async () => {
	const context = setup();
	mountWithFolds(context);
	context.guide.changeStep(1);
	assert.deepEqual(linesWith(context.models.python, STEP_CLASS), [5, 6, 7], 'highlighted at once');
	assert.deepEqual(context.indexes, [1]);
	await settle();
	assert.deepEqual(context.editor.reveals, []);
	context.guide.foldsEnded('python');
	await settle();
	assert.deepEqual(context.editor.reveals, [[5, 7]]);
	assert.deepEqual(context.said, [], 'the step bar says the step itself');
});

test('another language shows: the request switches back first, acts when the opening language shows, and says so', async () => {
	const context = setup();
	context.guide.applyMarks('python');
	context.editor.language = 'javascript';
	context.guide.perform(SHOW_LINES);
	assert.deepEqual(context.switches, ['python']);
	context.guide.modelShown(); // still JavaScript: nothing yet
	await settle();
	assert.deepEqual(context.editor.reveals, []);
	context.editor.language = 'python';
	context.guide.modelShown();
	await settle();
	assert.deepEqual(context.editor.reveals, [[12, 13]]);
	assert.deepEqual(context.said, [`${WORDS.switchedTo('Python')} ${WORDS.showingLines('lines 12 to 13', 'main.py')}`]);
});

test('Reset keeps the step: once its folds closed, a step past the first is revealed again; step 1 and other languages are not', async () => {
	const context = setup();
	context.guide.applyMarks('python');
	context.guide.changeStep(2);
	await settle();
	context.editor.reveals.length = 0;
	// Reset: the marks and the step's lines again, then the folds
	context.guide.applyMarks('python');
	assert.deepEqual(linesWith(context.models.python, STEP_CLASS), [15, 16]);
	context.guide.foldsStarted();
	context.guide.foldsEnded('python');
	await settle();
	assert.deepEqual(context.editor.reveals, [[15, 16]], 'the step is brought back into view');

	const first = setup();
	first.guide.applyMarks('python');
	first.guide.foldsStarted();
	first.guide.foldsEnded('python');
	await settle();
	assert.deepEqual(first.editor.reveals, [], 'step 1 at mount (and after Reset) stays where the folds left the view');

	context.editor.reveals.length = 0;
	context.editor.language = 'javascript';
	context.guide.applyMarks('javascript');
	context.guide.foldsStarted();
	context.guide.foldsEnded('javascript');
	await settle();
	assert.deepEqual(context.editor.reveals, [], "another language's Reset reveals no step");
});

test('Clear: the marks go, the bar goes stale, Previous / Next draw nothing, a <CodeRef> is refused with a warning and a word', async () => {
	const context = setup();
	context.guide.applyMarks('python');
	assert.deepEqual(linesWith(context.models.python, 'dwf-ce-line'), [1, 2, 3, 4], 'marks on 3 and 4, step 1 on 1-2');
	context.models.python.setValue('');
	context.guide.clearMarks();
	assert.equal(context.models.python.decorations.size, 0);
	assert.deepEqual(context.stale.at(-1), ['python']);
	assert.equal(context.guide.isStale('python'), true);
	context.guide.changeStep(1);
	assert.equal(context.models.python.decorations.size, 0, 'no step drawn on code it does not describe');
	context.guide.perform(SHOW_LINES);
	context.guide.perform({ type: ACTION_TYPES.step, index: 2 });
	await settle();
	assert.deepEqual(context.editor.reveals, []);
	assert.deepEqual(context.warnings, [WARNINGS.refAfterClear('demo'), WARNINGS.refAfterClear('demo')]);
	assert.deepEqual(context.said, [WORDS.afterClear, WORDS.afterClear]);
	context.guide.perform({ type: REVEAL_STEP });
	assert.equal(context.warnings.length, 2, "the bar's own waiting reveal is dropped quietly");
	context.guide.applyMarks('python'); // Reset
	assert.deepEqual(context.stale.at(-1), [], 'Reset ends it');
});

test('a Clear in another language leaves the opening language live', async () => {
	const context = setup();
	context.guide.applyMarks('python');
	context.editor.language = 'javascript';
	context.guide.applyMarks('javascript');
	context.guide.clearMarks();
	assert.equal(context.guide.isStale('javascript'), true);
	assert.equal(context.guide.isStale('python'), false);
	assert.deepEqual(linesWith(context.models.python, 'dwf-ce-kind-error'), [3], "Python's marks are still on its model");
});

test('an undo or redo back to the snippet brings the marks back (Clear, then ⌘/Ctrl+Z); a plain edit does not', () => {
	const context = setup();
	context.guide.applyMarks('python');
	context.models.python.setValue('');
	context.guide.clearMarks();
	context.models.python.setValue(PYTHON);
	context.editor.fireContent({ isUndoing: false, isRedoing: false });
	assert.equal(context.guide.isStale('python'), true, 'typing the same text is not an undo');
	context.editor.fireContent({ isUndoing: true, isRedoing: false });
	assert.equal(context.guide.isStale('python'), false);
	assert.deepEqual(linesWith(context.models.python, 'dwf-ce-kind-error'), [3]);
	context.models.python.setValue('mine = 1');
	context.guide.clearMarks();
	context.editor.fireContent({ isUndoing: false, isRedoing: true });
	assert.equal(context.guide.isStale('python'), true, 'a redo to other code changes nothing');
});

test('words for screen readers: lines past the end, a step already shown, and none for a step the bar will say', async () => {
	const context = setup();
	context.guide.applyMarks('python');
	context.guide.perform({ type: ACTION_TYPES.lines, ranges: [[40, 50]] });
	assert.deepEqual(context.warnings, [EDITOR_WARNINGS.refPastEnd('demo', 20)]);
	assert.deepEqual(context.said, [WORDS.noLines]);
	context.guide.perform({ type: ACTION_TYPES.step, index: 0 });
	assert.deepEqual(context.said.at(-1), stepSpeech(STEPS[0], 0, 3), 'the step already shown: its live region would stay silent');
	const before = context.said.length;
	context.guide.perform({ type: ACTION_TYPES.step, index: 1 });
	assert.equal(context.said.length, before, 'another step: the step bar says it');
	context.guide.perform({ type: ACTION_TYPES.step, index: 9 });
	assert.match(context.warnings.at(-1), /has 3 steps; step 10 was asked/);
	await settle();
});

test('a step request from another language: the bar has just appeared, so the step is said here', async () => {
	const context = setup();
	context.guide.applyMarks('python');
	context.editor.language = 'javascript';
	context.guide.perform({ type: ACTION_TYPES.step, index: 2 });
	context.editor.language = 'python';
	context.guide.modelShown();
	await settle();
	assert.deepEqual(context.said, [`${WORDS.switchedTo('Python')} ${stepSpeech(STEPS[2], 2, 3)}`]);
	assert.deepEqual(context.editor.reveals, [[15, 16]]);
});

test('the page follow-up gets the revealed span and the fit flag; the flash waits for it', async () => {
	let finish = null;
	const follows = [];
	const context = setup({
		settings: settingsFor({ fit: true }),
		follow: (editor, span, options) => {
			follows.push({ span, options });
			return new Promise((resolve) => {
				finish = resolve;
			});
		},
	});
	context.guide.applyMarks('python');
	context.guide.perform(SHOW_LINES);
	await settle();
	assert.deepEqual(follows, [{ span: [12, 13], options: { waitForGrowth: true } }]);
	assert.deepEqual(linesWith(context.models.python, 'dwf-ce-flash'), [], 'no flash while the page may still move');
	finish();
	await settle();
	assert.deepEqual(linesWith(context.models.python, 'dwf-ce-flash'), [12, 13]);
	context.guide.changeStep(1);
	await settle();
	assert.deepEqual(follows.at(-1).span, [5, 7], 'Previous / Next are followed too');
});

/** The hook's result, rendered once on the server with these arguments. */
function renderHook(args) {
	let result = null;
	function Probe() {
		result = useGuided(args);
		return null;
	}
	renderToStaticMarkup(createElement(Probe));
	return result;
}

test('the hook: an inert step bar before the surface is up (as in the placeholder), a live one after; none in another language', () => {
	const settings = settingsFor();
	const base = { settings, languageRef: { current: 'python' }, language: 'python', setLanguage: () => {} };
	const before = renderHook({ ...base, surface: null });
	assert.equal(before.stepBar.onStepChange, null);
	assert.equal(before.stepBar.stale, false);
	assert.equal(before.announcement, '');
	const surface = surfaceOf(fakeEditor({ python: fakeModel(PYTHON) }, 'python'));
	const after = renderHook({ ...base, surface });
	assert.equal(typeof after.stepBar.onStepChange, 'function');
	assert.equal(renderHook({ ...base, language: 'javascript', surface }).stepBar, null);
	assert.equal(after.markSummary, markedLinesSummary(settings.lineKinds.python));
	for (const name of ['attach', 'applyMarks', 'clearMarks', 'foldsStarted', 'foldsEnded', 'modelShown', 'isStale']) assert.equal(typeof after[name], 'function', name);
	assert.ok(ANNOUNCE_DELAY_MS > 0);
});

test('ownsEditorDomId: the surface drawn inside the first element with the DOM id owns it; true when it cannot be told', () => {
	const node = { name: 'editor node' };
	const surface = { domNode: () => node };
	const anchorWith = (inside) => ({ contains: (other) => inside && other === node });
	const docWith = (anchor) => ({ getElementById: (id) => (id === 'code-editor-demo' ? anchor : null) });
	assert.equal(ownsEditorDomId(docWith(anchorWith(true)), 'demo', surface), true);
	assert.equal(ownsEditorDomId(docWith(anchorWith(false)), 'demo', surface), false, 'a second editor with the same id: the first one on the page owns it');
	assert.equal(ownsEditorDomId(docWith(null), 'demo', surface), true, 'no such element');
	assert.equal(ownsEditorDomId(undefined, 'demo', surface), true, 'no document');
	assert.equal(ownsEditorDomId(docWith(anchorWith(false)), 'demo', { domNode: () => null }), true, 'a surface without its node');
});

test('attach(surface) again: the old surface\'s marks and listener go, the new one takes over (a phone\'s "Tap to edit")', () => {
	const context = setup();
	context.guide.applyMarks('python');
	assert.ok(context.models.python.decorations.size > 0);
	const nextModels = { python: fakeModel(PYTHON), javascript: fakeModel(JAVASCRIPT) };
	const nextEditor = fakeEditor(nextModels, 'python');
	context.guide.attach(surfaceOf(nextEditor));
	assert.equal(context.models.python.decorations.size, 0, "the old surface's marks are disposed");
	assert.equal(context.editor.contentListenerCount(), 0, 'and its listener');
	context.guide.applyMarks('python');
	assert.deepEqual(linesWith(nextModels.python, 'dwf-ce-kind-error'), [3], 'the marks go on the new surface');
	nextModels.python.setValue('');
	context.guide.clearMarks();
	nextModels.python.setValue(PYTHON);
	nextEditor.fireContent({ isUndoing: true });
	assert.equal(context.guide.isStale('python'), false, "the new surface's undo is heard");
	context.guide.attach(null);
	assert.equal(nextModels.python.decorations.size, 0, 'attach(null) lets go of everything');
});

test('markedLinesSummary: runs of one kind as ranges, in the order of their first line; nothing without marks', () => {
	assert.equal(
		markedLinesSummary({ 2: 'highlight', 7: 'error', 8: 'error', 9: 'error', 10: 'error', 12: 'add', 3: 'highlight', 14: 'error' }),
		'Marked lines in the code as given: lines 2 to 3 highlighted; lines 7 to 10 error; line 12 added; line 14 error.',
	);
	assert.equal(markedLinesSummary({}), '');
	assert.equal(markedLinesSummary(undefined), '');
	assert.equal(markedLinesSummary({ 0: 'error', x: 'error', 3: 'glow', 4: 'toString' }), '', 'junk lines and unknown kinds are left out');
	assert.deepEqual(Object.keys(WORDS.kinds).sort(), [...LINE_KINDS].sort(), 'a word for every kind');
});
