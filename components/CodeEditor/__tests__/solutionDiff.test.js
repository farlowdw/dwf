/**
 * solutionDiff.test.js — the Solution panel's Monaco bookkeeping (../solutionDiff.js) with a fake
 * `monaco` that records every call and, like Monaco 0.55's DiffEditorWidget, notes a model
 * disposed while the diff editor still shows it ("TextModel got disposed before DiffEditorWidget
 * model got reset", @monaco-editor/react's bug #647): the two models it owns, the diff editor's
 * options (the editor's font copied, read-only, no squiggles, the theme and the sides' names),
 * the sides' names kept against Monaco's resets, the take-down ORDER (listeners, setModel(null), the diff editor, then the models; twice is
 * harmless), updates that touch only what changed, the content height it reports, texts that
 * are not strings (never handed to createModel) and null labels, no leak when Monaco fails, the
 * first height estimate, and "already the solution". Run with `npm run test:shared`.
 * To change it: a new step of the bookkeeping in ../solutionDiff.js gets a test here, in the take-down
 * order tested here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonacoOptions } from '../props.js';
import { MIN_HEIGHT_PX, lineHeightPx } from '../sizing.js';
import {
	DIFF_EDITOR_OPTIONS,
	INHERITED_EDITOR_OPTIONS,
	INLINE_BELOW_PX,
	PLAIN_TEXT,
	createSolutionDiff,
	diffEditorOptions,
	estimateDiffHeight,
	isSameCode,
} from '../solutionDiff.js';

/** An event: on(listener) -> { dispose }, fire() calls the listeners. */
function fakeEvent(name, log) {
	const listeners = new Set();
	return {
		on(listener) {
			listeners.add(listener);
			return {
				dispose() {
					listeners.delete(listener);
					log.push(['unsubscribe', name]);
				},
			};
		},
		fire(event) {
			for (const listener of [...listeners]) listener(event);
		},
		count: () => listeners.size,
	};
}

/** Monaco's EditorOption enum, the one value read here. */
const ARIA_LABEL_OPTION = 4;

/**
 * One side of the diff (an inner code editor): its content height and size event, and its
 * options — updateOptions fires the configuration event, as Monaco's does.
 */
function fakeSide(name, contentHeight, log) {
	const sizeChange = fakeEvent(`${name}.contentSize`, log);
	const configChange = fakeEvent(`${name}.config`, log);
	const options = { [ARIA_LABEL_OPTION]: '' };
	return {
		contentHeight,
		sizeChange,
		configChange,
		getContentHeight() {
			return this.contentHeight;
		},
		onDidContentSizeChange: sizeChange.on,
		getOption: (id) => options[id],
		updateOptions(next) {
			if (!('ariaLabel' in next)) return;
			log.push(['updateOptions', name, next.ariaLabel]);
			options[ARIA_LABEL_OPTION] = next.ariaLabel;
			configChange.fire({ hasChanged: (id) => id === ARIA_LABEL_OPTION });
		},
		onDidChangeConfiguration: configChange.on,
	};
}

/** A fake monaco: models, a diff editor, setModelLanguage, setTheme — everything recorded in `log`. */
function fakeMonaco({ failCreate = false } = {}) {
	const log = [];
	const state = { diffEditor: null, models: [] };

	function createModel(value, language) {
		const model = {
			id: state.models.length + 1,
			value,
			language,
			disposed: false,
			getValue() {
				return this.value;
			},
			setValue(text) {
				log.push(['setValue', this.id, text]);
				this.value = text;
			},
			isDisposed() {
				return this.disposed;
			},
			dispose() {
				const shown = state.diffEditor?.model;
				if (shown && (shown.original === this || shown.modified === this)) log.push(['BUG: TextModel got disposed before DiffEditorWidget model got reset']);
				log.push(['model.dispose', this.id]);
				this.disposed = true;
			},
		};
		state.models.push(model);
		log.push(['createModel', model.id, value, language]);
		return model;
	}

	function createDiffEditor(host, options) {
		log.push(['createDiffEditor', host, options]);
		if (failCreate) throw new Error('Monaco could not make the diff editor');
		const updateDiff = fakeEvent('updateDiff', log);
		const original = fakeSide('original', 100, log);
		const modified = fakeSide('modified', 140, log);
		state.diffEditor = {
			model: null,
			options,
			updateDiff,
			original,
			modified,
			setModel(model) {
				log.push(['setModel', model ? [model.original.id, model.modified.id] : null]);
				this.model = model;
			},
			dispose() {
				log.push(['diffEditor.dispose']);
			},
			onDidUpdateDiff: updateDiff.on,
			getOriginalEditor: () => original,
			getModifiedEditor: () => modified,
		};
		return state.diffEditor;
	}

	const monaco = {
		editor: {
			EditorOption: { ariaLabel: ARIA_LABEL_OPTION },
			createModel,
			createDiffEditor,
			setModelLanguage(model, language) {
				log.push(['setModelLanguage', model.id, language]);
				model.language = language;
			},
			setTheme(theme) {
				log.push(['setTheme', theme]);
			},
		},
	};
	return { monaco, log, state };
}

const HOST = Object.freeze({ id: 'host' });
const EDITOR_OPTIONS = buildMonacoOptions({}, { readOnly: false, ariaLabel: 'Code editor: main.py' });
const LABELS = Object.freeze({ original: 'Your code', modified: 'The solution' });

/** A diff view over two short programs, with its fake monaco. */
function makeView(overrides = {}) {
	const fake = fakeMonaco();
	const heights = [];
	const view = createSolutionDiff(fake.monaco, HOST, {
		readerCode: 'print(1)\n',
		solution: 'print(2)\n',
		language: 'python',
		theme: 'vs-dark',
		editorOptions: EDITOR_OPTIONS,
		labels: LABELS,
		onContentHeight: (px) => heights.push(px),
		...overrides,
	});
	return { ...fake, view, heights };
}

test('it makes two models of its own (the reader\'s code, the solution) and shows them in a new diff editor', () => {
	const { log, state, view } = makeView();
	assert.deepEqual(log.slice(0, 2), [
		['createModel', 1, 'print(1)\n', 'python'],
		['createModel', 2, 'print(2)\n', 'python'],
	]);
	assert.equal(log[2][0], 'createDiffEditor');
	assert.equal(log[2][1], HOST, 'in the host element it was given');
	assert.deepEqual(log[3], ['setModel', [1, 2]], 'original = the reader\'s code, modified = the solution');
	assert.equal(view.diffEditor, state.diffEditor);
	assert.equal(view.isDisposed(), false);
	assert.equal(state.diffEditor.updateDiff.count(), 1, 'it listens for new diffs (the height)');
});

test("the diff editor's options: the editor's font copied, read-only, no squiggles, the theme and the sides' names", () => {
	const { state } = makeView();
	const options = state.diffEditor.options;
	assert.equal(options.fontFamily, EDITOR_OPTIONS.fontFamily);
	assert.equal(options.fontSize, EDITOR_OPTIONS.fontSize);
	assert.equal(options.lineHeight, EDITOR_OPTIONS.lineHeight);
	assert.deepEqual(options.padding, EDITOR_OPTIONS.padding);
	assert.equal(options.readOnly, true);
	assert.equal(options.originalEditable, false);
	assert.equal(options.renderValidationDecorations, 'off');
	assert.equal(options.ignoreTrimWhitespace, false, 'indentation changes show (Python)');
	assert.equal(options.renderMarginRevertIcon, false);
	assert.equal(options.useInlineViewWhenSpaceIsLimited, true);
	assert.equal(options.renderSideBySideInlineBreakpoint, INLINE_BELOW_PX);
	assert.equal(options.automaticLayout, true);
	assert.equal(options.theme, 'vs-dark');
	assert.equal(options.originalAriaLabel, 'Your code');
	assert.equal(options.modifiedAriaLabel, 'The solution');
	assert.equal(options.ariaLabel, undefined, "the editor's own name is not copied");
	assert.equal(options.showFoldingControls, undefined, 'only INHERITED_EDITOR_OPTIONS are copied');
});

test('diffEditorOptions: its own options win, nested objects are fresh copies, nothing is required', () => {
	const editorOptions = { readOnly: false, minimap: { enabled: true }, padding: { top: 4, bottom: 4 }, fontSize: 16 };
	const options = diffEditorOptions(editorOptions, {});
	assert.equal(options.readOnly, true);
	assert.deepEqual(options.minimap, { enabled: false });
	assert.notEqual(options.minimap, DIFF_EDITOR_OPTIONS.minimap, 'not the frozen constant');
	assert.notEqual(options.padding, editorOptions.padding, "not the editor's own object");
	assert.deepEqual(options.padding, { top: 4, bottom: 4 });
	assert.equal(options.theme, undefined);
	assert.equal(options.originalAriaLabel, undefined);
	assert.ok(INHERITED_EDITOR_OPTIONS.includes('fontFamily'));
	assert.doesNotThrow(() => diffEditorOptions(undefined));
	assert.doesNotThrow(() => diffEditorOptions(null, undefined));
});

test("the sides' names for screen readers are set, and set again when Monaco resets them (as 0.55 does on every option update)", () => {
	const { log, state } = makeView();
	const { original, modified } = state.diffEditor;
	assert.equal(original.getOption(ARIA_LABEL_OPTION), 'Your code');
	assert.equal(modified.getOption(ARIA_LABEL_OPTION), 'The solution');
	log.length = 0;
	original.updateOptions({ ariaLabel: '' });
	assert.equal(original.getOption(ARIA_LABEL_OPTION), 'Your code', 'put back at once');
	assert.deepEqual(log, [
		['updateOptions', 'original', ''],
		['updateOptions', 'original', 'Your code'],
	], 'once, without a loop');
	const unlabelled = fakeMonaco();
	createSolutionDiff(unlabelled.monaco, HOST, {});
	assert.equal(unlabelled.state.diffEditor.original.configChange.count(), 0, 'no labels: nothing kept');
});

test('dispose goes in the one safe order: listeners, setModel(null), the diff editor, THEN the models', () => {
	const { log, view } = makeView();
	log.length = 0;
	view.dispose();
	assert.deepEqual(log, [
		['unsubscribe', 'updateDiff'],
		['unsubscribe', 'original.contentSize'],
		['unsubscribe', 'modified.contentSize'],
		['unsubscribe', 'original.config'],
		['unsubscribe', 'modified.config'],
		['setModel', null],
		['diffEditor.dispose'],
		['model.dispose', 1],
		['model.dispose', 2],
	]);
	assert.ok(!log.some(([entry]) => entry.startsWith('BUG')), 'no model is disposed while the diff editor shows it');
	assert.equal(view.isDisposed(), true);
});

test('dispose twice does nothing the second time; a model someone else disposed is skipped', () => {
	const { log, state, view } = makeView();
	state.models[1].disposed = true;
	log.length = 0;
	view.dispose();
	view.dispose();
	assert.deepEqual(
		log.filter(([entry]) => entry === 'model.dispose'),
		[['model.dispose', 1]],
	);
	assert.equal(log.filter(([entry]) => entry === 'diffEditor.dispose').length, 1);
});

test('update touches only what changed: the texts, both models\' language, the theme; nothing after dispose', () => {
	const { log, view } = makeView();
	log.length = 0;
	view.update({ readerCode: 'print(1)\n', solution: 'print(2)\n', language: 'python', theme: 'vs-dark' });
	assert.deepEqual(log, [], 'nothing changed: nothing touched');
	view.update({ readerCode: 'print(10)\n' });
	assert.deepEqual(log, [['setValue', 1, 'print(10)\n']]);
	log.length = 0;
	view.update({ solution: 'print(20)\n', language: 'javascript', theme: 'vs' });
	assert.deepEqual(log, [
		['setValue', 2, 'print(20)\n'],
		['setModelLanguage', 1, 'javascript'],
		['setModelLanguage', 2, 'javascript'],
		['setTheme', 'vs'],
	]);
	view.dispose();
	log.length = 0;
	view.update({ readerCode: 'x', theme: 'vs-dark' });
	assert.deepEqual(log, []);
});

test('the content height: the taller side, reported when the diff or a side\'s size changes', () => {
	const { state, heights } = makeView();
	state.diffEditor.updateDiff.fire();
	assert.deepEqual(heights, [140]);
	state.diffEditor.original.contentHeight = 200;
	state.diffEditor.original.sizeChange.fire();
	assert.deepEqual(heights, [140, 200]);
	state.diffEditor.modified.sizeChange.fire();
	assert.deepEqual(heights, [140, 200, 200]);
});

test('without onContentHeight nothing is listened to; the language defaults to plain text', () => {
	const fake = fakeMonaco();
	const view = createSolutionDiff(fake.monaco, HOST, {});
	assert.equal(fake.state.diffEditor.updateDiff.count(), 0);
	assert.deepEqual(fake.log[0], ['createModel', 1, '', PLAIN_TEXT]);
	view.dispose();
	assert.ok(fake.state.models.every((model) => model.disposed));
});

test('texts that are not strings become empty models, an empty language is plain text, null labels are no labels', () => {
	const fake = fakeMonaco();
	const view = createSolutionDiff(fake.monaco, HOST, { readerCode: null, solution: 42, language: '', labels: null });
	assert.deepEqual(fake.log.slice(0, 2), [
		['createModel', 1, '', PLAIN_TEXT],
		['createModel', 2, '', PLAIN_TEXT],
	], "Monaco's createModel never sees null");
	assert.equal(fake.state.diffEditor.options.originalAriaLabel, undefined);
	assert.equal(fake.state.diffEditor.original.configChange.count(), 0, 'no labels: nothing kept');
	assert.doesNotThrow(() => diffEditorOptions({}, { labels: null }));
	view.update({ readerCode: null, solution: undefined, language: '' });
	assert.equal(fake.log.filter(([entry]) => entry === 'setValue' || entry === 'setModelLanguage').length, 0, 'update ignores them too');
	view.dispose();
});

test('when Monaco cannot make the diff editor, its two models are disposed and the error is passed on', () => {
	const fake = fakeMonaco({ failCreate: true });
	assert.throws(() => createSolutionDiff(fake.monaco, HOST, { readerCode: 'a', solution: 'b' }), /could not make the diff editor/);
	assert.equal(fake.state.models.length, 2);
	assert.ok(fake.state.models.every((model) => model.disposed), 'nothing leaks');
});

test("estimateDiffHeight: the longer side's lines at the editor's line height plus its padding, at least the editor's shortest box", () => {
	const lineHeight = lineHeightPx(EDITOR_OPTIONS);
	const padding = EDITOR_OPTIONS.padding.top + EDITOR_OPTIONS.padding.bottom;
	const fiveLines = 'a\nb\nc\nd\ne';
	assert.equal(estimateDiffHeight('x\ny', fiveLines, EDITOR_OPTIONS), 5 * lineHeight + padding);
	assert.equal(estimateDiffHeight(fiveLines, 'x', EDITOR_OPTIONS), 5 * lineHeight + padding);
	assert.equal(estimateDiffHeight('x', 'y', EDITOR_OPTIONS), MIN_HEIGHT_PX, 'one line: the shortest box');
	assert.ok(estimateDiffHeight('x', 'y', undefined) >= MIN_HEIGHT_PX, 'no options: still a height');
});

test('isSameCode: line endings and white space at the very end do not count; anything else does', () => {
	assert.equal(isSameCode('a\nb\n', 'a\nb'), true);
	assert.equal(isSameCode('a\r\nb\r\n', 'a\nb\n'), true);
	assert.equal(isSameCode('a\n  b', 'a\nb'), false, 'indentation counts');
	assert.equal(isSameCode('a', 'b'), false);
	assert.equal(isSameCode(undefined, ''), true);
});
