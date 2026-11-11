/**
 * folding.js — closes the author's chosen line ranges (the `foldedRegions` prop) when an editor
 * opens on pre-filled code, and again on Reset. The Monaco side of folding; the ranges are
 * checked first by the library (lib/codeRunner/folds.js > normalizeFoldRegions: bad,
 * crossing or too-long ranges are dropped or clamped, each with a console warning), against the
 * last line a fold can end on (lastFoldableLine): the last line, or the one before it when the
 * code ends with a newline — that final line is empty, and a fold ending on it would end a line
 * early (step 3), so [N-1, N] would fold nothing. [1, N] is clamped to [1, N-1] with a warning;
 * [N-1, N] is dropped with one.
 *
 *     await applyFolds(editor, monaco, [[1, 6]]);   // line 1 stays visible, lines 2-6 are hidden
 *
 * HOW IT FOLDS (and why each step is there — the old editor skipped several)
 *   1. Wait one frame (at most 50 ms: nextFrame), so the editor has laid out; give up if the
 *      reader switched to another language's model meanwhile (the caller folds it next time),
 *      or if the text of the same model changed (its version id: a page that sets new code at
 *      mount, within about 650 ms of it): the ranges were checked against the old text, and a
 *      line past the new end made Monaco throw "Illegal value for lineNumber" (2026-11-10).
 *   2. Clear earlier folds: 'editor.unfoldAll', then select the whole code and run
 *      'editor.removeManualFoldingRanges' (that action removes only the manual ranges that touch
 *      the SELECTION).
 *   3. For each range, innermost first (selecting inside a closed fold makes Monaco open it
 *      again): select it and run 'editor.createFoldingRangeFromSelection', awaiting each run
 *      (the action waits for Monaco's folding model). The selection ends at the END of line
 *      `end` — or at the start of line end+1 when line `end` is empty, because Monaco drops a
 *      last line the selection touches only at column 1.
 *   4. Cursor to 1:1, no selection, scrolled to the top. Nothing takes the page's focus.
 *   An action Monaco lacks (an older or newer Monaco, or folding turned off with the `folding:
 *   false` option) is skipped quietly.
 *   NOTHING TO FOLD on a language's FIRST show (`clear: false`; the model has just appeared, so
 *   it has no folds yet and its view is at the top): nothing at all is done, at once — no frame,
 *   no waiting for Monaco's folding model (200 ms or more after a model appears), which a
 *   <CodeRef> waiting for the fold pass (useGuided.js) would otherwise wait for too. Reset
 *   (`clear`, the default) always clears the reader's folds and scrolls to the top.
 *
 * Pure apart from the `editor` / `monaco` objects it is handed, so __tests__/folding.test.js
 * drives it with small fakes.
 *
 * HOW TO CHANGE IT
 *   The action ids: the constants below (they are Monaco's: monaco-editor/esm/vs/editor/contrib/
 *   folding/browser/folding.js). When folds are applied (first show of a language, Reset):
 *   CodeEditorClient.jsx.
 */

import { innermostFirst, normalizeFoldRegions } from './lib/codeRunner/index.js';

/** Monaco's folding actions used here. */
export const FOLD_SELECTION_ACTION = 'editor.createFoldingRangeFromSelection';
export const REMOVE_MANUAL_FOLDS_ACTION = 'editor.removeManualFoldingRanges';
export const UNFOLD_ALL_ACTION = 'editor.unfoldAll';

/** How long to wait when there is no requestAnimationFrame (ms; one 60 Hz frame). */
const FRAME_FALLBACK_MS = 16;

/**
 * The longest nextFrame() waits for a frame (ms). A tab in the background (or the desktop app's
 * hidden browser pane) gets almost no frames — 2 a second were measured — so a fold that waited
 * on a frame alone stayed open for seconds there. The folding model does not need a painted
 * frame (Monaco's fold actions await it themselves), so a short timer is as good.
 */
const FRAME_TIMEOUT_MS = 50;

/** Resolves on the next animation frame, or after FRAME_TIMEOUT_MS, whichever comes first (a timer where there is no requestAnimationFrame, e.g. in node). */
export function nextFrame() {
	return new Promise((resolve) => {
		if (typeof requestAnimationFrame !== 'function') {
			setTimeout(resolve, FRAME_FALLBACK_MS);
			return;
		}
		const timer = setTimeout(resolve, FRAME_TIMEOUT_MS);
		requestAnimationFrame(() => {
			clearTimeout(timer);
			resolve();
		});
	});
}

/** Run one editor action and wait for it; false when the editor does not have it (or it is turned off). */
async function runAction(editor, actionId) {
	const action = editor.getAction(actionId);
	if (!action) return false;
	if (typeof action.isSupported === 'function' && !action.isSupported()) return false;
	await action.run();
	return true;
}

/**
 * The last line a fold can end on (see the header): the model's last line, or the one before it
 * when the last line is empty. sizing.js > lastFoldableLineOf is the same rule for a string.
 */
export function lastFoldableLine(model) {
	const lastLine = model.getLineCount();
	return lastLine > 1 && model.getLineMaxColumn(lastLine) === 1 ? lastLine - 1 : lastLine;
}

/** A selection of the whole code. */
function wholeCodeSelection(monaco, model) {
	const lastLine = model.getLineCount();
	return new monaco.Selection(1, 1, lastLine, model.getLineMaxColumn(lastLine));
}

/**
 * The selection that makes Monaco fold exactly [start, end]: from the start of line `start` to
 * the end of line `end` (to the start of line end+1 when line `end` is empty; see the header).
 */
export function selectionForRegion(monaco, model, [start, end]) {
	const endColumn = model.getLineMaxColumn(end);
	if (endColumn > 1 || end >= model.getLineCount()) return new monaco.Selection(start, 1, end, endColumn);
	return new monaco.Selection(start, 1, end + 1, 1);
}

/** Open every fold and remove every manual fold range (Reset starts from a clean slate). */
export async function clearFolds(editor, monaco) {
	const model = editor.getModel();
	if (!model) return;
	await runAction(editor, UNFOLD_ALL_ACTION);
	editor.setSelection(wholeCodeSelection(monaco, model));
	await runAction(editor, REMOVE_MANUAL_FOLDS_ACTION);
}

/** Cursor at 1:1, nothing selected, scrolled to the top-left. */
export function resetView(editor, monaco) {
	editor.setSelection(new monaco.Selection(1, 1, 1, 1));
	editor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
}

/** The model's version id (Monaco's getVersionId: every edit of the text changes it), or null for a model without one. */
function versionOf(model) {
	return typeof model.getVersionId === 'function' ? model.getVersionId() : null;
}

/** Is `model` still the editor's model, with the text it had at `version` (HOW IT FOLDS, step 1)? */
function stillTheSame(editor, model, version) {
	return editor.getModel() === model && versionOf(model) === version;
}

/** console.warn, looked up when called (so a test may replace console.warn). */
function consoleWarn(message) {
	console.warn(message);
}

/**
 * Fold `regions` (the author's [start, end] pairs, unchecked) in the editor's current model.
 * Resolves true when done; false when there was no model, or the model or its text changed while
 * it worked (the caller should fold that model again when it is shown next). `clear` (default true):
 * false on a language's first show, where nothing to fold means nothing to do (see NOTHING TO
 * FOLD in the header). Options for the tests: `warn` (default console.warn) and `waitFrame`
 * (default nextFrame).
 */
export async function applyFolds(editor, monaco, regions, { clear = true, warn = consoleWarn, waitFrame = nextFrame } = {}) {
	const model = editor.getModel();
	if (!model) return false;
	const version = versionOf(model);
	const checked = normalizeFoldRegions(regions, lastFoldableLine(model));
	for (const warning of checked.warnings) warn(warning);
	if (!clear && checked.regions.length === 0) return true;
	await waitFrame();
	if (!stillTheSame(editor, model, version)) return false;
	await clearFolds(editor, monaco);
	for (const region of innermostFirst(checked.regions)) {
		if (!stillTheSame(editor, model, version)) return false;
		editor.setSelection(selectionForRegion(monaco, model, region));
		const folded = await runAction(editor, FOLD_SELECTION_ACTION);
		if (!folded) break;
	}
	if (!stillTheSame(editor, model, version)) return false;
	resetView(editor, monaco);
	return true;
}
