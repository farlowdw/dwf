/**
 * decorations.js — the coloured lines of a <CodeEditor> and the way to bring lines into view:
 *   - the AUTHOR'S MARKS: the lines the `highlight` prop and the magic comments name, each with
 *     its kind (highlight, error, success, warning, add, remove — the site's code-block kinds,
 *     lib/codeRunner/magicComments.js);
 *   - the CURRENT STEP's lines (the `steps` prop, StepBar.jsx), drawn like a highlight but with
 *     classes of their own (STEP_CLASS), so an author's kind always wins its line (below);
 *   - a brief FLASH of the lines a <CodeRef> points at;
 *   - revealLines: opens every fold that hides some of the lines, then scrolls them into view.
 *
 *     const lines = createLineDecorations(editor, monaco);
 *     lines.set({ 3: 'highlight', 7: 'error' });   // the author's marks (replaces the earlier ones)
 *     lines.showStep([[4, 6]]);                    // the step's lines (replaces the previous step's)
 *     await revealLines(editor, monaco, [[4, 6]]); // unfold, then scroll them into view
 *     lines.flash([[4, 6]]);                       // a short flash (FLASH_MS)
 *     lines.dispose();                             // everything off (the editor goes away)
 *
 * HOW A LINE IS DRAWN  Each marked line is one whole-line Monaco decoration carrying three
 *   GLOBAL class names (guided.module.css; kindClassNames below): `dwf-ce-line` on the band
 *   behind the code, `dwf-ce-margin` on the band under the gutter (it also draws the coloured
 *   left edge of highlight / error / success / warning and the + / − of add / remove),
 *   `dwf-ce-number` on the line number (the kind's colour), each with `dwf-ce-kind-<kind>`.
 *   The colours are the site's code-line tokens (shared/css/_code-blocks.scss: --code-line-<kind>-
 *   bg / -bar / -ink), light and dark — except the highlight's blue left edge and its stronger
 *   band in dark mode, which guided.module.css sets for the editor alone (the code blocks'
 *   faint band was hard to see on VS Code's dark background).
 *
 * THE CURRENT STEP UNDER AN AUTHOR'S MARK  A step's lines carry `dwf-ce-line` /
 *   `dwf-ce-margin` with STEP_CLASS (`dwf-ce-current-step`) and NO line-number class, so a
 *   marked line inside the step keeps its kind's number colour (Monaco joins every
 *   decoration's number class on one element). Monaco draws the bands of a line in a fixed
 *   order: behind the code by zIndex, then by class name; under the gutter by class name only
 *   (its margin ignores zIndex). The step has zIndex STEP_Z_INDEX (below the marks' 0) AND a
 *   class name that sorts before every kind's ('dwf-ce-c…' < 'dwf-ce-k…'), so in both places
 *   the author's band is drawn OVER the step's: the step shows underneath. guided.module.css
 *   then drops the step's left edge where the kind has an edge of its own, and the step's band
 *   and edge on an author's highlight (the same look: never twice as dark).
 *   __tests__/monacoFoldingContract.test.js checks both orders in the installed Monaco.
 *
 * FOLLOWING THE READER'S EDITS  A decoration never grows when the reader types at its edges
 *   (Enter at the end of a marked line does not mark the new line); it moves with its line
 *   when lines are added above it. An edit that REMOVES a marked line takes its mark with it
 *   (lineRemovedBy: the change covered the line's whole text and a line break next to it —
 *   delete-line, a selection over several lines, select-all and paste, Reset then ⌘/Ctrl+Z),
 *   instead of Monaco's way of squeezing it onto a neighbouring line. Rewriting a line's text,
 *   or Enter in the middle of it, keeps the mark. When two lines of one layer end up on one
 *   line (Backspace joins two marked lines), the upper one's decoration stays, the other goes,
 *   so a band is never drawn twice. Each model's layers listen to its onDidChangeContent and
 *   keep a snapshot of their lines (the change's ranges are in the coordinates from BEFORE the
 *   edit, the decorations already moved): followEdit.
 *
 * WHY ON THE MODEL (and not an editor's decorations collection)  The decorations are put on the
 *   language's TEXT MODEL (model.deltaDecorations, no owner), kept per model in three layers
 *   (marks, step, flash). Monaco removes an editor collection's decorations from a model when
 *   the editor switches to another model (the language picker does), so on the way back they
 *   would have to be set again from the snippet's line numbers — on code the reader may have
 *   edited since. A model's own decorations stay on it while it is not shown and keep following
 *   the reader's edits. So: set the marks once per language (when it is first shown) and again
 *   after Reset; the step's lines on each step change (and after Reset).
 *
 * HOW revealLines UNFOLDS  It asks Monaco's folding controller for its folding model and opens
 *   exactly the collapsed regions that HIDE one of the lines: a region whose hidden lines
 *   (start + 1 … end) include it — the rule Monaco's own "reveal the cursor" uses. A fold whose
 *   first, visible line is the line itself stays closed. Then it scrolls with
 *   revealLinesInCenterIfOutsideViewport: all the lines when they fit in the editor's window,
 *   else the first range (revealTarget, revealSpan), so a step of lines 3-5 and 40-42 does not
 *   centre on line 22. Without folding (the `folding: false` option) it only scrolls. It
 *   scrolls the EDITOR only; keeping the lines in the page's window is
 *   CodeRef/goToEditor.js > keepLinesInWindow (useGuided.js calls both). The
 *   folding controller and its model are Monaco internals (not in monaco.d.ts):
 *   __tests__/monacoFoldingContract.test.js reads the installed Monaco and fails if an upgrade
 *   changes them; until then, a folding model that throws or lacks a method only costs the
 *   unfolding (a console warning), never the scroll. The scroll is smooth only where Monaco
 *   scrolls smoothly (its `smoothScrolling` option, off by default) and never for a reader who
 *   asks for reduced motion.
 *
 * Pure apart from the `editor` / `monaco` objects it is handed (and the timer of the flash), so
 * __tests__/decorations.test.js drives it with small fakes.
 *
 * HOW TO CHANGE IT
 *   A colour or the look of a kind: guided.module.css (it reads the site's tokens, but for the
 *   highlight's edge and dark band). A new kind: its magic comment in
 *   lib/codeRunner/magicComments.js > MAGIC_COMMENTS (LINE_KINDS here is that file's list,
 *   so the two never differ), its rule in guided.module.css (__tests__/guidedStyles.test.js
 *   fails until it exists), and its tokens in shared/css/_code-blocks.scss. The step's look: its
 *   rule in guided.module.css (STEP_CLASS; keep the name sorting before `kind-`, a test checks).
 *   When an edit removes a mark: lineRemovedBy.
 *   The flash's length: FLASH_MS, kept equal to the animation's duration in guided.module.css
 *   (a test compares them). The class names' prefix: CLASS_PREFIX (and every name in
 *   guided.module.css). The console warning: WARNINGS.
 */

import { linesOf } from './lib/codeRunner/lineSpec.js';
import { LINE_KINDS as MAGIC_COMMENT_KINDS } from './lib/codeRunner/magicComments.js';

/**
 * The kinds of marked line: magicComments.js's list (highlight, error, success, warning, remove,
 * add), so a kind the snippets can name is a kind drawn here. `highlight` is also the
 * `highlight` prop's.
 */
export const LINE_KINDS = MAGIC_COMMENT_KINDS;

/** Every global class name of this file starts with this (guided.module.css defines them). */
export const CLASS_PREFIX = 'dwf-ce-';

/**
 * The current step's own class (beside dwf-ce-line / dwf-ce-margin). Its name must sort BEFORE
 * every `dwf-ce-kind-…`, so Monaco's margin draws an author's band over it (see the header).
 */
export const STEP_CLASS = `${CLASS_PREFIX}current-step`;

/** The step's stack order behind the code: below the marks' (Monaco's default 0), so their bands are drawn over it. */
export const STEP_Z_INDEX = -1;

/** The flash's classes: the band behind the code and under the gutter; AGAIN alternates (see flash()). */
export const FLASH_CLASS = `${CLASS_PREFIX}flash`;
export const FLASH_MARGIN_CLASS = `${CLASS_PREFIX}flash-margin`;
export const FLASH_AGAIN_CLASS = `${CLASS_PREFIX}flash-again`;

/** How long a flash lasts (ms): the animation's duration in guided.module.css. */
export const FLASH_MS = 1500;

/** Monaco's folding controller (its id: monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js). */
export const FOLDING_CONTRIBUTION_ID = 'editor.contrib.folding';

/** Monaco's TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, for a Monaco object without the enum. */
const NEVER_GROWS_FALLBACK = 1;

/** Monaco's ScrollType values, for a Monaco object without the enum. */
const SCROLL_SMOOTH_FALLBACK = 0;
const SCROLL_IMMEDIATE_FALLBACK = 1;

/** The media query of a reader who asks for less motion. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** The console warnings (for the site's developer: a Monaco upgrade changed what revealLines uses). */
const WARNINGS = Object.freeze({
	unfoldFailed:
		'CodeEditor: the folds over these lines could not be opened (did a Monaco upgrade change its folding model? Run __tests__/monacoFoldingContract.test.js). The lines were scrolled to anyway.',
});

/** The three layers of decorations a model can carry (see the header). */
const LAYERS = Object.freeze({ marks: 'marks', step: 'step', flash: 'flash' });
const LAYER_NAMES = Object.freeze(Object.values(LAYERS));

/** Is `line` a line of a model with `lineCount` lines? */
function isLineOf(line, lineCount) {
	return Number.isInteger(line) && line >= 1 && line <= lineCount;
}

/** Is this a [start, end] pair of whole numbers? */
function isRange(value) {
	return Array.isArray(value) && value.length === 2 && Number.isInteger(value[0]) && Number.isInteger(value[1]);
}

/**
 * `ranges` ([[start, end], …], as parseLineSpec gives them) cut to the lines 1 … lineCount; a
 * range wholly outside them, or anything that is not a pair of whole numbers, is left out.
 */
export function rangesWithin(ranges, lineCount) {
	if (!Array.isArray(ranges)) return [];
	const fitted = [];
	for (const range of ranges) {
		if (!isRange(range)) continue;
		const start = Math.max(1, range[0]);
		const end = Math.min(lineCount, range[1]);
		if (start <= end) fitted.push([start, end]);
	}
	return fitted;
}

/** The global class names a line of `kind` carries on the three parts Monaco draws (see the header). */
export function kindClassNames(kind) {
	const kindClass = `${CLASS_PREFIX}kind-${kind}`;
	return {
		className: `${CLASS_PREFIX}line ${kindClass}`,
		marginClassName: `${CLASS_PREFIX}margin ${kindClass}`,
		lineNumberClassName: `${CLASS_PREFIX}number ${kindClass}`,
	};
}

/** The global class names of a line of the current step: the bands only, no line-number class (see the header). */
export function stepClassNames() {
	return {
		className: `${CLASS_PREFIX}line ${STEP_CLASS}`,
		marginClassName: `${CLASS_PREFIX}margin ${STEP_CLASS}`,
	};
}

/** The stickiness that never grows a decoration when the reader types at its edges. */
function neverGrows(monaco) {
	return monaco.editor?.TrackedRangeStickiness?.NeverGrowsWhenTypingAtEdges ?? NEVER_GROWS_FALLBACK;
}

/** Monaco's options for a line of `kind`. */
function kindOptions(monaco, kind) {
	return { isWholeLine: true, stickiness: neverGrows(monaco), ...kindClassNames(kind) };
}

/** Monaco's options for a line of the current step (drawn under the author's marks). */
function stepOptions(monaco) {
	return { isWholeLine: true, stickiness: neverGrows(monaco), zIndex: STEP_Z_INDEX, ...stepClassNames() };
}

/** Monaco's options for a flashing line; `again` alternates one class so Monaco draws the lines anew. */
function flashOptions(monaco, again) {
	const extra = again ? ` ${FLASH_AGAIN_CLASS}` : '';
	return {
		isWholeLine: true,
		stickiness: neverGrows(monaco),
		className: `${FLASH_CLASS}${extra}`,
		marginClassName: `${FLASH_MARGIN_CLASS}${extra}`,
	};
}

/** One decoration over the whole of line `line` (to its end, so it follows the line's text). */
function lineDecoration(monaco, model, line, options) {
	return { range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)), options };
}

/** The decorations for `lineKinds` ({ [line]: kind }); a line the model lacks, or an unknown kind, is left out. */
export function decorationsForKinds(monaco, model, lineKinds) {
	const lineCount = model.getLineCount();
	const decorations = [];
	for (const [key, kind] of Object.entries(lineKinds ?? {})) {
		const line = Number(key);
		if (!isLineOf(line, lineCount) || !LINE_KINDS.includes(kind)) continue;
		decorations.push(lineDecoration(monaco, model, line, kindOptions(monaco, kind)));
	}
	return decorations;
}

/** Every line of `ranges` once, in order (ranges that overlap would otherwise draw a line twice, darker). */
function uniqueLines(ranges) {
	return [...new Set(linesOf(ranges))];
}

/** One decoration with `options` per line of `ranges` (cut to the model's lines). */
function decorationsForRanges(monaco, model, ranges, options) {
	const lines = uniqueLines(rangesWithin(ranges, model.getLineCount()));
	return lines.map((line) => lineDecoration(monaco, model, line, options));
}

/** -1, 0 or 1: is (lineA, columnA) before, at or after (lineB, columnB)? */
function comparePositions(lineA, columnA, lineB, columnB) {
	if (lineA !== lineB) return lineA < lineB ? -1 : 1;
	if (columnA !== columnB) return columnA < columnB ? -1 : 1;
	return 0;
}

/**
 * Did this edit REMOVE the line? `change` is one of Monaco's content changes ({ range } in the
 * coordinates from before the edit); `line` and `maxColumn` (its length + 1) are the line as it
 * was. Removed: the change covered all of the line's text AND a line break next to it (the
 * line itself is gone, not only rewritten) — except an empty line where the change only ENDS
 * (the lines above it were deleted, it stays).
 */
export function lineRemovedBy(change, { line, maxColumn }) {
	const { startLineNumber, startColumn, endLineNumber, endColumn } = change.range;
	const fromBefore = comparePositions(startLineNumber, startColumn, line, 1) <= 0;
	const toAfter = comparePositions(line, maxColumn, endLineNumber, endColumn) <= 0;
	const takesABreak = startLineNumber < line || endLineNumber > line;
	const endsAtItsStart = endLineNumber === line && endColumn === 1;
	return fromBefore && toAfter && takesABreak && !endsAtItsStart;
}

/** setTimeout / clearTimeout, looked up when called (so a test may pass its own). */
function defaultSetTimer(callback, ms) {
	return setTimeout(callback, ms);
}

function defaultClearTimer(timer) {
	clearTimeout(timer);
}

/** Can this model tell where a decoration is now (a fake in an older test may not)? */
function canFollowEdits(model) {
	return typeof model.getDecorationRange === 'function';
}

/** model.getVersionId(), or null where the model has none. */
function versionOf(model) {
	return typeof model.getVersionId === 'function' ? model.getVersionId() : null;
}

/** Calls `subscribe(listener)` when the model has that event; its disposable, or null. */
function listenTo(subscribe, listener) {
	return typeof subscribe === 'function' ? subscribe(listener) : null;
}

/**
 * The line decorations of one editor (see the header): { set(lineKinds), showStep(ranges),
 * flash(ranges), dispose() }. set / showStep / flash work on the model the editor shows now
 * and return how many lines they decorated (0 with no model, or after dispose). Options for
 * the tests: `setTimer` / `clearTimer` (default setTimeout / clearTimeout).
 */
export function createLineDecorations(editor, monaco, { setTimer = defaultSetTimer, clearTimer = defaultClearTimer } = {}) {
	// model -> { marks: [ids], step: [ids], flash: [ids], lines: Map(id -> { line, maxColumn }), version, listeners }
	const records = new Map();
	let disposed = false;
	let flashTimer = null;
	let flashModel = null;
	let flashCount = 0;

	function recordOf(model) {
		if (!records.has(model)) records.set(model, newRecord(model));
		return records.get(model);
	}

	/** A model's empty layers, listening to its edits (and forgotten when it is disposed). */
	function newRecord(model) {
		const record = { [LAYERS.marks]: [], [LAYERS.step]: [], [LAYERS.flash]: [], lines: new Map(), version: null, listeners: [] };
		record.listeners = [
			listenTo(model.onDidChangeContent?.bind(model), (event) => followEdit(model, event)),
			listenTo(model.onWillDispose?.bind(model), () => forget(model)),
		].filter(Boolean);
		return record;
	}

	/** Stop listening to a model and drop what was kept about it. */
	function forget(model) {
		const record = records.get(model);
		if (!record) return;
		for (const listener of record.listeners) listener.dispose?.();
		records.delete(model);
		if (flashModel === model) flashModel = null;
	}

	/** Where each decoration of the model is now: its line and that line's length (see FOLLOWING THE READER'S EDITS). */
	function takeSnapshot(model, record) {
		record.lines = new Map();
		record.version = versionOf(model);
		if (!canFollowEdits(model)) return;
		for (const layer of LAYER_NAMES) {
			for (const id of record[layer]) {
				const range = model.getDecorationRange(id);
				if (range) record.lines.set(id, { line: range.startLineNumber, maxColumn: model.getLineMaxColumn(range.startLineNumber) });
			}
		}
	}

	/** The ids whose line one of `changes` removed (lineRemovedBy), from the snapshot taken before the edit. */
	function removedIds(record, changes) {
		const removed = new Set();
		for (const [id, place] of record.lines) {
			if (changes.some((change) => lineRemovedBy(change, place))) removed.add(id);
		}
		return removed;
	}

	/** The ids of one layer that share a line with an id above them (the upper one stays). */
	function duplicateIds(model, record, layer, removed) {
		const kept = record[layer].filter((id) => !removed.has(id));
		const byOldLine = [...kept].sort((a, b) => (record.lines.get(a)?.line ?? 0) - (record.lines.get(b)?.line ?? 0));
		const seen = new Set();
		const duplicates = [];
		for (const id of byOldLine) {
			const line = model.getDecorationRange(id)?.startLineNumber;
			if (seen.has(line)) duplicates.push(id);
			else seen.add(line);
		}
		return duplicates;
	}

	/** After an edit: the decorations whose line it removed go, and so do a layer's second decorations on one line. */
	function followEdit(model, event) {
		const record = records.get(model);
		if (disposed || !record || !canFollowEdits(model) || model.isDisposed?.()) return;
		// Already taken after this edit (a layer was set from another listener of the same edit): nothing moved since.
		if (record.version !== null && record.version === event?.versionId) return;
		const removed = event?.isFlush ? new Set(record.lines.keys()) : removedIds(record, event?.changes ?? []);
		for (const layer of LAYER_NAMES) {
			for (const id of duplicateIds(model, record, layer, removed)) removed.add(id);
		}
		if (removed.size > 0) {
			model.deltaDecorations([...removed], []);
			for (const layer of LAYER_NAMES) record[layer] = record[layer].filter((id) => !removed.has(id));
		}
		takeSnapshot(model, record);
	}

	/** Replace one layer of the CURRENT model with `makeDecorations(model)`; how many it holds now. */
	function replaceLayer(layer, makeDecorations) {
		const model = editor.getModel();
		if (disposed || !model) return 0;
		const record = recordOf(model);
		record[layer] = model.deltaDecorations(record[layer], makeDecorations(model));
		takeSnapshot(model, record);
		return record[layer].length;
	}

	/** Empty one layer of `model` (a disposed model has lost its decorations already). */
	function clearLayer(model, layer) {
		const record = records.get(model);
		if (!record || record[layer].length === 0) return;
		if (!model.isDisposed()) model.deltaDecorations(record[layer], []);
		record[layer] = [];
	}

	/** Take the flash off now, wherever it is. */
	function endFlash() {
		clearTimer(flashTimer);
		flashTimer = null;
		if (flashModel) clearLayer(flashModel, LAYERS.flash);
		flashModel = null;
	}

	/** The author's marks ({ [line]: kind }), replacing the earlier ones; {} or null takes them off. */
	function set(lineKinds) {
		return replaceLayer(LAYERS.marks, (model) => decorationsForKinds(monaco, model, lineKinds));
	}

	/** The current step's lines ([[start, end], …]), replacing the previous step's; [] or null takes them off. */
	function showStep(ranges) {
		return replaceLayer(LAYERS.step, (model) => decorationsForRanges(monaco, model, ranges, stepOptions(monaco)));
	}

	/**
	 * Flash these lines for FLASH_MS. A new flash ends the one before. Each flash alternates
	 * FLASH_AGAIN_CLASS: Monaco redraws a line only when its classes change, and a redrawn line
	 * starts the animation again — so a second <CodeRef> click on the same lines flashes too.
	 */
	function flash(ranges) {
		endFlash();
		flashCount += 1;
		const again = flashCount % 2 === 0;
		const count = replaceLayer(LAYERS.flash, (model) => decorationsForRanges(monaco, model, ranges, flashOptions(monaco, again)));
		if (count === 0) return 0;
		flashModel = editor.getModel();
		flashTimer = setTimer(endFlash, FLASH_MS);
		return count;
	}

	/** Every decoration off every model it is on (models already disposed are skipped); later calls do nothing. */
	function dispose() {
		if (disposed) return;
		endFlash();
		disposed = true;
		for (const model of [...records.keys()]) {
			clearLayer(model, LAYERS.marks);
			clearLayer(model, LAYERS.step);
			forget(model);
		}
	}

	return { set, showStep, flash, dispose };
}

/** Does the reader ask for reduced motion? (false where there is no window or no matchMedia) `win` is for the tests. */
export function prefersReducedMotion(win = globalThis.window) {
	try {
		return Boolean(win?.matchMedia?.(REDUCED_MOTION_QUERY)?.matches);
	} catch {
		return false;
	}
}

/** Monaco's scroll type: smooth, or immediate. */
function scrollTypeOf(monaco, smooth) {
	const scrollType = monaco.editor?.ScrollType;
	if (smooth) return scrollType?.Smooth ?? SCROLL_SMOOTH_FALLBACK;
	return scrollType?.Immediate ?? SCROLL_IMMEDIATE_FALLBACK;
}

/** How many lines the editor's window shows (Infinity when Monaco cannot say). */
function visibleLineCount(editor, monaco) {
	const height = editor.getLayoutInfo?.()?.height;
	const lineHeightOption = monaco.editor?.EditorOption?.lineHeight;
	const lineHeight = lineHeightOption === undefined ? undefined : editor.getOption?.(lineHeightOption);
	if (!Number.isFinite(height) || !Number.isFinite(lineHeight) || lineHeight <= 0) return Infinity;
	return Math.floor(height / lineHeight);
}

/** How many lines start … end holds. */
function lineSpan(start, end) {
	return end - start + 1;
}

/** The last line `ranges` reach (the largest end: a range may lie inside the one before it). */
function lastLineOf(ranges) {
	let last = ranges[0][1];
	for (const [, end] of ranges) last = Math.max(last, end);
	return last;
}

/**
 * The lines to scroll to for `ranges` (sorted by start, not empty), in a window of `capacity`
 * lines: from the first line to the last when they fit; else the first range when it fits;
 * else the first range's top `capacity` lines (at least one).
 */
export function revealTarget(ranges, capacity) {
	const first = ranges[0];
	const last = lastLineOf(ranges);
	if (lineSpan(first[0], last) <= capacity) return [first[0], last];
	if (lineSpan(first[0], first[1]) <= capacity) return [first[0], first[1]];
	return [first[0], first[0] + Math.max(1, capacity) - 1];
}

/** `ranges` cut to the model's lines and sorted by start ([] with nothing usable). */
function sortedWithin(ranges, lineCount) {
	return rangesWithin(ranges, lineCount).sort((a, b) => a[0] - b[0]);
}

/**
 * The lines revealLines scrolls to for `ranges` in this editor, as its window is now: [start,
 * end] (revealTarget), or null with no model or no usable range. useGuided.js hands it to the
 * page's follow-up scroll (CodeRef/goToEditor.js > keepLinesInWindow).
 */
export function revealSpan(editor, monaco, ranges) {
	const model = editor.getModel();
	if (!model) return null;
	const fitted = sortedWithin(ranges, model.getLineCount());
	if (fitted.length === 0) return null;
	return revealTarget(fitted, visibleLineCount(editor, monaco));
}

/** Monaco's folding model for the editor's current model, or null (no folding controller, or folding is off). */
async function foldingModelOf(editor) {
	try {
		const controller = editor.getContribution?.(FOLDING_CONTRIBUTION_ID);
		const pending = controller?.getFoldingModel?.();
		return pending ? await pending : null;
	} catch {
		return null;
	}
}

/**
 * The collapsed regions that hide a line of `ranges`: for each line, every region around it
 * that is collapsed and starts ABOVE it (Monaco's own rule for revealing the cursor). Each
 * region once (Monaco's regions are fresh objects per call: compared by regionIndex).
 */
export function regionsHiding(foldingModel, ranges) {
	const found = new Map();
	for (const line of linesOf(ranges)) {
		const hiding = foldingModel.getAllRegionsAtLine(line, (region) => region.isCollapsed && line > region.startLineNumber);
		for (const region of hiding) found.set(region.regionIndex, region);
	}
	return [...found.values()];
}

/** console.warn, looked up when called (so a test may replace console.warn). */
function consoleWarn(...parts) {
	console.warn(...parts);
}

/**
 * Open the collapsed regions of `foldingModel` that hide a line of `ranges`. A folding model
 * that throws (its internals changed in a Monaco upgrade) gets a warning and is left as it
 * is: the caller still scrolls.
 */
function openHidingFolds(foldingModel, ranges) {
	try {
		const hiding = regionsHiding(foldingModel, ranges);
		if (hiding.length > 0) foldingModel.toggleCollapseState(hiding);
	} catch (error) {
		consoleWarn(WARNINGS.unfoldFailed, error);
	}
}

/**
 * Bring `ranges` ([[start, end], …]) into view: open every fold that hides one of their lines,
 * then scroll them into the editor's window (see the header). Resolves true when it scrolled;
 * false with no model, no usable range, or when the editor switched model while it waited.
 * Never rejects for a folding problem. Options: `smooth` (default: unless the reader asks for
 * reduced motion).
 */
export async function revealLines(editor, monaco, ranges, { smooth = !prefersReducedMotion() } = {}) {
	const model = editor.getModel();
	if (!model) return false;
	const fitted = sortedWithin(ranges, model.getLineCount());
	if (fitted.length === 0) return false;
	const foldingModel = await foldingModelOf(editor);
	if (editor.getModel() !== model) return false;
	if (foldingModel) openHidingFolds(foldingModel, fitted);
	const [start, end] = revealTarget(fitted, visibleLineCount(editor, monaco));
	editor.revealLinesInCenterIfOutsideViewport(start, end, scrollTypeOf(monaco, smooth));
	return true;
}
