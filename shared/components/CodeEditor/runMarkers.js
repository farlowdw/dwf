/**
 * runMarkers.js — after a FAILED run (or a Bash script that ran past an error; runErrors.js
 * decides which), marks the places the code runner's errors point to in the reader's code: a
 * squiggle under the line (or under the exact columns, when the error names them) with the
 * error's message in Monaco's hover — the same marks Monaco draws for its own syntax errors, so
 * Alt+F8 / Shift+Alt+F8 (Monaco's "Go to Next / Previous Problem")
 * step through them too. The locations come from the library
 * (lib/codeRunner/errorLocations.js > errorLocations: [{ line, column, endColumn, message,
 * severity: 'error' | 'warning', stage: 'compile' | 'run' }], lines of the code the reader
 * SEES); ErrorList.jsx shows the same locations as "Line 4 · …" rows under the status line,
 * and its Go to line button calls goToRunLocation.
 *
 *     const snapshot = runSnapshot(editor);                     // when a run starts …
 *     clearRunMarkers(editor, monaco);                          // … the old marks go
 *     showRunMarkers(editor, monaco, locations, { snapshot });  // when its answer is in
 *     const watch = watchRunMarkers(editor, monaco);            // the next edit or language switch clears them
 *     goToRunLocation(editor, location);                        // a row's Go to line button
 *
 * HOW THE MARKS ARE MADE
 *   - Monaco's markers (monaco.editor.setModelMarkers) under ONE owner, RUN_MARKER_OWNER
 *     ('dwf-run'): they never touch the markers of Monaco's own checking (its owners are
 *     'javascript', 'typescript' …), and clearing them clears only these.
 *   - A location with a column and a later end column marks exactly those columns (Monaco's
 *     end column is the one AFTER the last character); with a column only, the word at that
 *     column (Monaco widens an empty range to the word there, or draws one character where
 *     there is no word); without a column, the whole line from its first non-blank character
 *     (Monaco's own rule for startColumn 1 with endColumn Number.MAX_VALUE).
 *   - A line outside the code (0, past the last line, not a whole number) is dropped: Monaco
 *     would move it onto the first or last line, a wrong place. A location without a message
 *     gets WORDS.noMessage (Monaco drops a marker that has none).
 *   - The hover says where the error came from, after the message (WORDS.source: 'compiler' for
 *     a compile error or warning, 'runtime' for an error while the program ran).
 *   - Markers belong to a MODEL (the editor has one per language). Each editor remembers which
 *     of its models holds its run markers (markedModels), so clearRunMarkers still clears them
 *     after a language switch, and never another editor's. A model that is disposed takes its
 *     markers with it (Monaco removes the markers of an inmemory:// model when it goes).
 *   - The code may change while a run waits (the reader types, or switches language). Take a
 *     snapshot when the run starts and hand it to showRunMarkers: when the code shown is no
 *     longer the code that ran, nothing is marked (its lines could be wrong). Undoing back to
 *     the same text counts as the same code (Monaco's alternative version id).
 *
 * READ-ONLY EDITORS  Monaco draws markers — these AND its own — on an editable editor only,
 *   unless its option renderValidationDecorations is 'on': the default, 'editable', hides them
 *   all while readOnly is true. renderValidationDecorationsFor() (props.js, re-exported here)
 *   is the value for an editor that needs one: 'off' with the `hideErrors` prop (no marks at
 *   all, Monaco's own squiggles included), else the page's own editorOptions value, else 'on'.
 *   props.js > validationDecorations applies it only to read-only editors and `hideErrors`
 *   editors. An editable editor without `hideErrors` keeps Monaco's default ('editable', which
 *   already shows the marks) or the page's own value, so its options stay as before
 *   (props.test.js, backCompat.test.js).
 *
 * GO TO LINE  goToRunLocation puts the cursor on the line — at the error's column, else at the
 *   line's first non-blank character — scrolls it into view (centred, when it was outside the
 *   view) and moves the keyboard focus into the editor, so the reader can type the fix. A line
 *   inside a closed fold: Monaco's folding opens the folds that hide the cursor by itself,
 *   200 ms later (folding.js in Monaco: FoldingController.revealCursor), and scrolls to it.
 *
 * Pure apart from the `editor` / `monaco` objects it is handed, so __tests__/runMarkers.test.js
 * drives it with fakes (and with the real answers of lib/codeRunner/__tests__/fixtures/
 * errors, read by errorLocations). A missing editor, model or Monaco API is no work, never a
 * throw: showRunMarkers returns 0, goToRunLocation false.
 *
 * HOW TO CHANGE IT
 *   The words in the hover: WORDS. Which runs mark the code, and when the marks are cleared
 *   (the next edit, a run, Reset, Clear, a language switch): useRunErrors.js. How the
 *   errors are found in the code runner's answer: lib/codeRunner/errorLocations.js. The
 *   squiggles' colours are Monaco's theme's (editorError.foreground, editorWarning.foreground).
 */

// Defined in props.js (the page's first download needs them, and must not import this file).
export { VALIDATION_DECORATIONS, renderValidationDecorationsFor } from './props.js';

/** The owner of every run-error marker (see the header). */
export const RUN_MARKER_OWNER = 'dwf-run';

/** The words this file shows (in Monaco's hover). */
export const WORDS = Object.freeze({
	/** The message of a location that came without one, per severity. */
	noMessage: Object.freeze({ error: 'Error', warning: 'Warning' }),
	/** Where the error came from, shown after the message, per stage. */
	source: Object.freeze({ compile: 'compiler', run: 'runtime' }),
});

/** A location's severity that is a warning (anything else is an error). */
export const SEVERITY_WARNING = 'warning';

/** A line's (and a column's) first number: Monaco counts from 1. */
const FIRST = 1;

/** The end column that makes Monaco mark a whole line, from its first non-blank character. */
const WHOLE_LINE_END_COLUMN = Number.MAX_VALUE;

/** Each editor's model that holds its run markers (see the header). */
const markedModels = new WeakMap();

/** A whole number from 1 up, or null. */
function positiveWholeOrNull(value) {
	return Number.isInteger(value) && value >= FIRST ? value : null;
}

/** The model the editor shows, or null (no editor, no model, or an editor already disposed). */
function modelOf(editor) {
	if (typeof editor?.getModel !== 'function') return null;
	return editor.getModel() ?? null;
}

/** Can this Monaco set markers? */
function hasMarkerApi(monaco) {
	return typeof monaco?.editor?.setModelMarkers === 'function' && Boolean(monaco.MarkerSeverity);
}

/** Is `line` a line of the model? */
function isLineOf(model, line) {
	const wanted = positiveWholeOrNull(line);
	return wanted !== null && wanted <= model.getLineCount();
}

/**
 * The columns a location marks, [start, end] (see the header): its columns; or its column
 * twice (an empty range: Monaco marks the word there); or the whole line.
 */
export function markerColumns({ column, endColumn } = {}) {
	const start = positiveWholeOrNull(column);
	if (start === null) return [FIRST, WHOLE_LINE_END_COLUMN];
	const end = positiveWholeOrNull(endColumn);
	if (end === null || end <= start) return [start, start];
	return [start, end];
}

/** The message the hover shows: the location's, or WORDS.noMessage for its severity. */
export function markerMessage({ message, severity } = {}) {
	const text = typeof message === 'string' ? message.trim() : '';
	if (text !== '') return text;
	return severity === SEVERITY_WARNING ? WORDS.noMessage.warning : WORDS.noMessage.error;
}

/** Monaco's severity for a location's ('warning' is a warning; anything else an error). */
function markerSeverity(monaco, severity) {
	return severity === SEVERITY_WARNING ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error;
}

/** Monaco's marker for one location (its line must be a line of the code: showRunMarkers checks). */
export function toMarkerData(monaco, location) {
	const [startColumn, endColumn] = markerColumns(location);
	const marker = {
		severity: markerSeverity(monaco, location.severity),
		message: markerMessage(location),
		startLineNumber: location.line,
		startColumn,
		endLineNumber: location.line,
		endColumn,
	};
	if (Object.hasOwn(WORDS.source, location.stage)) marker.source = WORDS.source[location.stage];
	return marker;
}

/** Set this owner's markers on one model ([] removes them). */
function setMarkers(monaco, model, markers) {
	monaco.editor.setModelMarkers(model, RUN_MARKER_OWNER, markers);
}

/** Remove the run markers from `model`, unless it is gone (a disposed model took them with it). */
function clearModel(monaco, model) {
	if (!model || model.isDisposed()) return;
	setMarkers(monaco, model, []);
}

/**
 * Remove this editor's run markers: from the model that holds them (after a language switch
 * too) and from the model it shows. Safe to repeat; another editor's markers stay.
 */
export function clearRunMarkers(editor, monaco) {
	if (!editor) return;
	const marked = markedModels.get(editor) ?? null;
	markedModels.delete(editor);
	if (!hasMarkerApi(monaco)) return;
	clearModel(monaco, marked);
	const shown = modelOf(editor);
	if (shown !== marked) clearModel(monaco, shown);
}

/** What the code was when a run started: { model, versionId }, or null without a model. */
export function runSnapshot(editor) {
	const model = modelOf(editor);
	if (!model) return null;
	return { model, versionId: model.getAlternativeVersionId() };
}

/** Does the editor still show the code of `snapshot` (the same model, the same text)? */
export function isSnapshotCurrent(editor, snapshot) {
	const model = modelOf(editor);
	if (!snapshot || !model || model !== snapshot.model) return false;
	return model.getAlternativeVersionId() === snapshot.versionId;
}

/** Monaco's markers for the locations that are on a line of `model` (the others are dropped). */
function markersFor(monaco, model, locations) {
	const list = Array.isArray(locations) ? locations : [];
	const onTheCode = list.filter((location) => location && isLineOf(model, location.line));
	return onTheCode.map((location) => toMarkerData(monaco, location));
}

/**
 * Mark `locations` on the editor's code, replacing its earlier run markers. With `snapshot`
 * (runSnapshot when the run started), nothing is marked once the code shown has changed.
 * Returns how many markers it set.
 */
export function showRunMarkers(editor, monaco, locations, { snapshot = null } = {}) {
	clearRunMarkers(editor, monaco);
	const model = modelOf(editor);
	if (!model || !hasMarkerApi(monaco)) return 0;
	if (snapshot && !isSnapshotCurrent(editor, snapshot)) return 0;
	const markers = markersFor(monaco, model, locations);
	if (markers.length === 0) return 0;
	setMarkers(monaco, model, markers);
	markedModels.set(editor, model);
	return markers.length;
}

/**
 * Clear the run markers on the next edit (any change of the text: typing, Reset, Clear, a
 * restored draft) and on a language switch. Returns { dispose } to stop listening.
 */
export function watchRunMarkers(editor, monaco) {
	const clear = () => clearRunMarkers(editor, monaco);
	const subscriptions = [];
	if (typeof editor?.onDidChangeModelContent === 'function') subscriptions.push(editor.onDidChangeModelContent(clear));
	if (typeof editor?.onDidChangeModel === 'function') subscriptions.push(editor.onDidChangeModel(clear));
	return {
		dispose() {
			for (const subscription of subscriptions) subscription?.dispose?.();
		},
	};
}

/** `line` moved inside the code: at least 1, at most `lineCount`. */
function clampLine(line, lineCount) {
	if (!Number.isFinite(line) || line < FIRST) return FIRST;
	return Math.min(Math.floor(line), lineCount);
}

/** Where the cursor goes on `line`: the error's column (at most the line's end), else the first non-blank character. */
function cursorColumn(model, line, column) {
	const wanted = positiveWholeOrNull(column);
	if (wanted !== null) return Math.min(wanted, model.getLineMaxColumn(line));
	const firstNonBlank = model.getLineFirstNonWhitespaceColumn(line);
	return firstNonBlank > 0 ? firstNonBlank : FIRST;
}

/**
 * Take the reader to a location (see GO TO LINE in the header): the cursor on its line, the
 * line in view, the focus in the editor (`focus: false` leaves the focus where it is). A line
 * past the end goes to the last line. Returns false when the editor has no model.
 */
export function goToRunLocation(editor, location, { focus = true } = {}) {
	const model = modelOf(editor);
	if (!model) return false;
	const line = clampLine(location?.line, model.getLineCount());
	editor.setPosition({ lineNumber: line, column: cursorColumn(model, line, location?.column) });
	editor.revealLineInCenterIfOutsideViewport(line);
	if (focus) editor.focus();
	return true;
}
