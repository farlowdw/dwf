/**
 * surface.js — the ONE contract the editor's shell (CodeEditorClient.jsx) and its hooks
 * (useGuided.js, useRunErrors.js, useExercise.js) use to talk to the code, whichever of the two
 * surfaces shows it: Monaco (monacoSurface.js, a desktop; a phone after "Tap to edit") or the
 * static view (staticSurface.js: the code as text on a phone or tablet, touchMode.js). The
 * hooks never ask which; what only Monaco can do (folding, TypeScript, the solution diff) stays
 * on the shell's editorRef / monacoRef. Pure data and two small functions; no React, no DOM.
 *
 * THE CONTRACT (every member, both surfaces)
 *   kind                      SURFACE_KINDS.monaco | SURFACE_KINDS.static
 *   hasModel()                is there code to act on (Monaco: a model is shown; static: always)
 *   domNode()                 the element the code is drawn in (useGuided.js > ownsEditorDomId)
 *   getValue()                the code as text; lineCount() its lines (as Monaco counts them)
 *   setValue(text, { undoable })   replace the code (Monaco: one undoable edit when `undoable`,
 *                             a plain set otherwise; static: the store's text)
 *   focus()                   the keyboard focus into the code (static: the "Tap to edit" bar)
 *   onDidChange(fn) → dispose fn(event) after each change of the text (Monaco's event passes
 *                             through: useGuided.js reads isUndoing; static: an empty object)
 *   marks                     { set(lineKinds), showStep(ranges), flash(ranges), dispose() }:
 *                             the author's marks, the step, the flash (decorations.js's shape)
 *   reveal(ranges) → Promise<boolean>   open every fold hiding one of the lines, then (Monaco)
 *                             scroll them into the editor's window; true when it revealed
 *   revealSpan(ranges)        the [start, end] a reveal scrolls to, or null (for the page's
 *                             follow-up: CodeRef/goToEditor.js > keepLinesInWindow)
 *   linesBox([start, end])    where those lines are on the page now, { top, bottom }, or null
 *   layoutSettled(win, ms)    a promise for the next layout change, or `ms` at most
 *   markers                   { begin() → snapshot, show(locations, snapshot) → count, clear(),
 *                             watch() → { dispose } }: the run-error squiggles (runMarkers.js;
 *                             the static view draws none: noopMarkers)
 *   goTo(location) → Promise<boolean>   Go to line on an error row: open the fold over it, then
 *                             put the cursor there (Monaco) or flash it and scroll the page (static)
 *
 * HOW TO CHANGE IT  A new member: its name in SURFACE_METHODS (or MARKS_METHODS /
 * MARKERS_METHODS), both adapters, and the JSDoc above; isSurface then refuses an adapter that
 * forgot it (__tests__/surface.test.js, monacoSurface.test.js, staticSurface.test.js).
 */

/** The two surfaces. */
export const SURFACE_KINDS = Object.freeze({ monaco: 'monaco', static: 'static' });

/** Every function member of a surface (see the header). */
export const SURFACE_METHODS = Object.freeze([
	'hasModel',
	'domNode',
	'getValue',
	'lineCount',
	'setValue',
	'focus',
	'onDidChange',
	'reveal',
	'revealSpan',
	'linesBox',
	'layoutSettled',
	'goTo',
]);

/** The members of `surface.marks` (decorations.js > createLineDecorations's shape). */
export const MARKS_METHODS = Object.freeze(['set', 'showStep', 'flash', 'dispose']);

/** The members of `surface.markers`. */
export const MARKERS_METHODS = Object.freeze(['begin', 'show', 'clear', 'watch']);

/** Does `object` have every one of `names` as a function? */
function hasFunctions(object, names) {
	return object !== null && typeof object === 'object' && names.every((name) => typeof object[name] === 'function');
}

/** Is `value` a whole surface: one of the two kinds, every method, `marks` and `markers` complete? */
export function isSurface(value) {
	if (!value || typeof value !== 'object') return false;
	if (!Object.values(SURFACE_KINDS).includes(value.kind)) return false;
	return hasFunctions(value, SURFACE_METHODS) && hasFunctions(value.marks, MARKS_METHODS) && hasFunctions(value.markers, MARKERS_METHODS);
}

/** A disposable that does nothing. */
function nothingToDispose() {
	return { dispose() {} };
}

/** The markers of a surface that draws none (the static view): begin → null, show → 0, clear and watch do nothing. */
export function noopMarkers() {
	return {
		begin: () => null,
		show: () => 0,
		clear() {},
		watch: nothingToDispose,
	};
}
