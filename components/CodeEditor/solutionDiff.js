/**
 * solutionDiff.js — the Monaco side of the Solution panel (SolutionPanel.jsx): a read-only diff
 * view of the reader's code (left, "original") against the page's solution (right, "modified"),
 * made IMPERATIVELY with monaco.editor.createDiffEditor and two text models that THIS module
 * creates, updates and disposes. No React; the functions take the `monaco` object (and the host
 * element) they work on, so __tests__/solutionDiff.test.js runs them with fakes.
 *
 *     const view = createSolutionDiff(monaco, hostElement, { readerCode, solution, language, theme, editorOptions, labels, onContentHeight });
 *     view.update({ readerCode, solution, language, theme });   // only what changed is touched
 *     view.dispose();                                           // safe to call twice
 *
 * WHY NOT @monaco-editor/react's <DiffEditor>  It disposes its two models BEFORE the diff editor
 *   that still shows them (its bug #647). Monaco 0.55's DiffEditorWidget watches its models and
 *   reports "TextModel got disposed before DiffEditorWidget model got reset" as an unexpected
 *   error when one goes first. dispose() here goes in the one safe order:
 *     1. the listeners this module added;
 *     2. diffEditor.setModel(null) — the diff editor lets go of both models;
 *     3. diffEditor.dispose() — the diff editor and its two inner editors;
 *     4. the two models (unless something already disposed them).
 *   The models have no address of their own (Monaco gives each an inmemory://model/<n> one), so
 *   they never clash with the editor's own models (monacoSetup.js > modelPath).
 *
 * THE OPTIONS (diffEditorOptions)  The editor's font, line height, tab size, padding, word wrap
 *   and scrollbar behaviour are copied from the editor's own options (INHERITED_EDITOR_OPTIONS),
 *   so the two sides read like the editor above them; the rest is DIFF_EDITOR_OPTIONS:
 *   read-only on both sides, side by side when there is room and one column below
 *   INLINE_BELOW_PX (a phone, a narrow column), whitespace changes shown (indentation matters in
 *   Python), no revert arrows or gutter menu (nothing here is edited), no overview ruler, no
 *   minimap, and NO SQUIGGLES (renderValidationDecorations 'off': a diff is for reading, and a
 *   TypeScript copy of the code would otherwise draw the type checker's errors on it).
 *   The theme is Monaco's, page-wide: pass the editor's own (the reader's, useEditorTheme.js), and
 *   the two always match.
 *
 * THE SIDES' NAMES  A screen reader hears "Your code" / "The solution" (labels.original /
 *   labels.modified) in the two sides. Monaco 0.55 takes them as originalAriaLabel /
 *   modifiedAriaLabel, but its own first option update (and every later one, e.g. a switch
 *   between one column and two) sets each side's ariaLabel back to '' (seen in the browser,
 *   2026-10-25: getOption(ariaLabel) read ''). So keepAriaLabel() sets each side's label itself
 *   and sets it again whenever Monaco changes it.
 *
 * ITS HEIGHT  estimateDiffHeight() before Monaco has drawn anything (the longer side's lines, as
 *   sizing.js counts them for the editor); then `onContentHeight(px)` reports the diff's real
 *   height whenever it changes (the taller of the two sides: in one column the solution's side
 *   also holds the reader's removed lines). SolutionPanel.jsx applies it once per frame
 *   (autoHeight.js) between its CSS min- and max-height.
 *
 * HOW TO CHANGE IT
 *   What the diff view shows: DIFF_EDITOR_OPTIONS (Monaco's IDiffEditorOptions, in
 *   node_modules/monaco-editor/esm/vs/editor/editor.api.d.ts). Which of the editor's options it
 *   copies: INHERITED_EDITOR_OPTIONS. When it turns into one column: INLINE_BELOW_PX. The
 *   shortest view: sizing.js > MIN_HEIGHT_PX (the same as the editor's box).
 */

import { MIN_HEIGHT_PX, estimateContentHeight, lineCountOf, lineHeightPx } from './sizing.js';

/** Below this width (px) the diff is shown in one column (the solution's side, with the reader's removed lines in it). */
export const INLINE_BELOW_PX = 640;

/** Monaco's language id for code it has no mode for. */
export const PLAIN_TEXT = 'plaintext';

/** The editor's own options the diff view copies, so both sides read like the editor (see the header). */
export const INHERITED_EDITOR_OPTIONS = Object.freeze([
	'fontSize',
	'fontFamily',
	'fontWeight',
	'fontLigatures',
	'letterSpacing',
	'lineHeight',
	'tabSize',
	'padding',
	'wordWrap',
	'scrollbar',
	'fixedOverflowWidgets',
]);

/** The diff view's own options (see the header); they win over the inherited ones. */
export const DIFF_EDITOR_OPTIONS = Object.freeze({
	readOnly: true,
	originalEditable: false,
	automaticLayout: true,
	renderSideBySide: true,
	useInlineViewWhenSpaceIsLimited: true,
	renderSideBySideInlineBreakpoint: INLINE_BELOW_PX,
	ignoreTrimWhitespace: false,
	renderIndicators: true,
	renderMarginRevertIcon: false,
	renderGutterMenu: false,
	renderOverviewRuler: false,
	renderValidationDecorations: 'off',
	scrollBeyondLastLine: false,
	minimap: Object.freeze({ enabled: false }),
	hideUnchangedRegions: Object.freeze({ enabled: false }),
	lineNumbersMinChars: 3,
	folding: false,
});

/** Is this a plain object (not null, not an array)? */
function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The two sides' names ({ original, modified }), or {} when none are given (undefined, null …). */
function sideLabelsOf(labels) {
	return isPlainObject(labels) ? labels : {};
}

/** A copy Monaco may keep: plain objects copied one level deep (the constants above are frozen). */
function copyOption(value) {
	return isPlainObject(value) ? { ...value } : value;
}

/**
 * The options handed to createDiffEditor: the editor's INHERITED_EDITOR_OPTIONS, then
 * DIFF_EDITOR_OPTIONS, then the theme and the two sides' names for screen readers
 * (`labels.original`, `labels.modified`).
 */
export function diffEditorOptions(editorOptions = {}, { theme, labels } = {}) {
	const source = isPlainObject(editorOptions) ? editorOptions : {};
	const names = sideLabelsOf(labels);
	const options = {};
	for (const key of INHERITED_EDITOR_OPTIONS) {
		if (source[key] !== undefined) options[key] = copyOption(source[key]);
	}
	for (const [key, value] of Object.entries(DIFF_EDITOR_OPTIONS)) options[key] = copyOption(value);
	if (theme) options.theme = theme;
	if (names.original) options.originalAriaLabel = names.original;
	if (names.modified) options.modifiedAriaLabel = names.modified;
	return options;
}

/**
 * The diff view's height (px) before Monaco has measured it: the longer side's lines at the
 * editor's line height, plus its padding — never less than the editor box's MIN_HEIGHT_PX.
 */
export function estimateDiffHeight(readerCode, solution, editorOptions = {}) {
	const options = isPlainObject(editorOptions) ? editorOptions : {};
	const height = estimateContentHeight({
		lineCount: Math.max(lineCountOf(readerCode), lineCountOf(solution)),
		lineHeight: lineHeightPx(options),
		paddingTop: options.padding?.top ?? 0,
		paddingBottom: options.padding?.bottom ?? 0,
	});
	return Math.max(MIN_HEIGHT_PX, Math.round(height));
}

/** Code as compared by isSameCode: \n line endings, no white space at the very end. */
function comparableCode(text) {
	const source = typeof text === 'string' ? text : '';
	return source.replace(/\r\n?/g, '\n').trimEnd();
}

/**
 * Is the reader's code already the solution? Line endings and white space at the very end do
 * not count (an editor's text and a raw-loader file differ there). "Use this solution" is
 * greyed out when it is.
 */
export function isSameCode(readerCode, solution) {
	return comparableCode(readerCode) === comparableCode(solution);
}

/** The taller side's content height (px). */
function contentHeightOf(diffEditor) {
	const sides = [diffEditor.getOriginalEditor(), diffEditor.getModifiedEditor()];
	return Math.max(...sides.map((side) => side.getContentHeight()));
}

/** Report the diff's content height to `onContentHeight` whenever the diff or a side's size changes. Returns the subscriptions. */
function watchContentHeight(diffEditor, onContentHeight) {
	const report = () => onContentHeight(contentHeightOf(diffEditor));
	return [
		diffEditor.onDidUpdateDiff(report),
		diffEditor.getOriginalEditor().onDidContentSizeChange(report),
		diffEditor.getModifiedEditor().onDidContentSizeChange(report),
	];
}

/**
 * Keep `label` as the screen-reader name of one side of the diff (see THE SIDES' NAMES): set it
 * now, and again whenever Monaco changes that option. Returns the subscription (null when there
 * is no label, or a Monaco without the EditorOption enum).
 */
function keepAriaLabel(monaco, editor, label) {
	const option = monaco.editor.EditorOption?.ariaLabel;
	if (!label || option === undefined) return null;
	const apply = () => {
		if (editor.getOption(option) !== label) editor.updateOptions({ ariaLabel: label });
	};
	apply();
	return editor.onDidChangeConfiguration((event) => {
		if (event.hasChanged(option)) apply();
	});
}

/** Both sides' names kept (keepAriaLabel); the subscriptions that are not null. */
function keepSideLabels(monaco, diffEditor, labels) {
	const names = sideLabelsOf(labels);
	const kept = [
		keepAriaLabel(monaco, diffEditor.getOriginalEditor(), names.original),
		keepAriaLabel(monaco, diffEditor.getModifiedEditor(), names.modified),
	];
	return kept.filter(Boolean);
}

/** A text for a new model: the string itself, or '' for anything else (Monaco's createModel throws on null). */
function textOf(value) {
	return typeof value === 'string' ? value : '';
}

/** Give a model this text, unless it already has it (or the text is not a string). */
function setText(model, text) {
	if (typeof text !== 'string' || model.getValue() === text) return;
	model.setValue(text);
}

/** Dispose these models, skipping any that something else already disposed. */
function disposeOwnModels(models) {
	for (const model of models) {
		if (!model.isDisposed()) model.dispose();
	}
}

/** The diff editor over the two models; if Monaco fails to make it, the models go too (nothing leaks). */
function createDiffOver(monaco, host, options, models) {
	try {
		const diffEditor = monaco.editor.createDiffEditor(host, options);
		diffEditor.setModel(models);
		return diffEditor;
	} catch (error) {
		disposeOwnModels([models.original, models.modified]);
		throw error;
	}
}

/**
 * A read-only diff view of `readerCode` against `solution` in `host` (see the header):
 *   readerCode, solution   the two texts ('' for a missing one, or anything but a string)
 *   language         Monaco's language id for both sides (languages.js > monaco); 'plaintext' by default
 *   theme            Monaco's theme (page-wide: the editor's own)
 *   editorOptions    the editor's Monaco options (props.js > buildMonacoOptions), for the font
 *   labels           { original, modified }: the two sides' names for screen readers
 *   onContentHeight  (px) => void, called whenever the diff's height changes
 * Returns { diffEditor, update({ readerCode, solution, language, theme }), dispose(), isDisposed() }.
 */
export function createSolutionDiff(monaco, host, options = {}) {
	const { readerCode, solution, theme, editorOptions, labels, onContentHeight } = options;
	const language = options.language || PLAIN_TEXT;
	const original = monaco.editor.createModel(textOf(readerCode), language);
	const modified = monaco.editor.createModel(textOf(solution), language);
	const diffEditor = createDiffOver(monaco, host, diffEditorOptions(editorOptions, { theme, labels }), { original, modified });
	const heightSubscriptions = typeof onContentHeight === 'function' ? watchContentHeight(diffEditor, onContentHeight) : [];
	const subscriptions = [...heightSubscriptions, ...keepSideLabels(monaco, diffEditor, labels)];
	const current = { language, theme };
	let disposed = false;

	/** The new texts, language and theme; only what changed is touched. Nothing after dispose(). */
	function update(next = {}) {
		if (disposed) return;
		setText(original, next.readerCode);
		setText(modified, next.solution);
		if (next.language && next.language !== current.language) {
			monaco.editor.setModelLanguage(original, next.language);
			monaco.editor.setModelLanguage(modified, next.language);
			current.language = next.language;
		}
		if (next.theme && next.theme !== current.theme) {
			monaco.editor.setTheme(next.theme);
			current.theme = next.theme;
		}
	}

	/** Take everything down in the safe order (see the header). A second call does nothing. */
	function dispose() {
		if (disposed) return;
		disposed = true;
		for (const subscription of subscriptions) subscription?.dispose?.();
		diffEditor.setModel(null);
		diffEditor.dispose();
		disposeOwnModels([original, modified]);
	}

	return { diffEditor, update, dispose, isDisposed: () => disposed };
}
