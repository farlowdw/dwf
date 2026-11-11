/**
 * monacoSurface.js — the Monaco half of surface.js's contract: one object over a mounted Monaco
 * editor that the shell (CodeEditorClient.jsx > handleMount) hands to the hooks. Every member
 * delegates to the file that did the work before the contract existed, with the same arguments:
 * decorations.js (the marks, revealLines, revealSpan), runMarkers.js (the run-error squiggles,
 * Go to line), monacoSetup.js (replaceCode) and, injected by the shell, the page geometry of
 * CodeRef/goToEditor.js (monacoLinesBox, monacoLayoutSettled) — injected so this file imports
 * nothing of CodeRef/ and the tests pass small fakes.
 *
 *     const surface = createMonacoSurface(editor, monaco, { linesBox: monacoLinesBox, layoutSettled: monacoLayoutSettled });
 *
 * The marks (decorations.js > createLineDecorations) are made with the surface and disposed with
 * the editor (its onDidDispose), as useGuided.js did before. Pure apart from the `editor` /
 * `monaco` objects it is handed, so __tests__/monacoSurface.test.js drives it with the fakes of
 * decorations.test.js and runMarkers.test.js.
 *
 * HOW TO CHANGE IT  A new member of the contract: surface.js first, then its delegation here
 * and in staticSurface.js.
 */

import { createLineDecorations, revealLines, revealSpan } from './decorations.js';
import { replaceCode } from './monacoSetup.js';
import { clearRunMarkers, goToRunLocation, runSnapshot, showRunMarkers, watchRunMarkers } from './runMarkers.js';
import { SURFACE_KINDS } from './surface.js';

/** The geometry functions a surface needs when none are injected (a test without the page). */
const NO_GEOMETRY = Object.freeze({
	linesBox: () => null,
	layoutSettled: () => Promise.resolve(),
});

/** The model the editor shows, or null. */
function modelOf(editor) {
	return editor.getModel?.() ?? null;
}

/** See the header. `linesBox(editor, span)` and `layoutSettled(editor, win, ms)`: goToEditor.js's. */
export function createMonacoSurface(editor, monaco, { linesBox = NO_GEOMETRY.linesBox, layoutSettled = NO_GEOMETRY.layoutSettled } = {}) {
	const marks = createLineDecorations(editor, monaco);
	editor.onDidDispose?.(() => marks.dispose());

	/** Run-error markers: runMarkers.js, with this editor and Monaco. */
	const markers = {
		begin: () => runSnapshot(editor),
		show: (locations, snapshot) => showRunMarkers(editor, monaco, locations, { snapshot }),
		clear: () => clearRunMarkers(editor, monaco),
		watch: () => watchRunMarkers(editor, monaco),
	};

	/** Open the fold over the location's line, then put the cursor there (runMarkers.js > goToRunLocation). */
	async function goTo(location) {
		const line = location?.line;
		if (Number.isInteger(line)) await revealLines(editor, monaco, [[line, line]]);
		return goToRunLocation(editor, location);
	}

	return {
		kind: SURFACE_KINDS.monaco,
		hasModel: () => modelOf(editor) !== null,
		domNode: () => editor.getContainerDomNode?.() ?? null,
		getValue: () => modelOf(editor)?.getValue() ?? '',
		lineCount: () => modelOf(editor)?.getLineCount() ?? 0,
		setValue: (text, { undoable = true } = {}) => replaceCode(editor, text, { readOnly: !undoable }),
		focus: () => editor.focus?.(),
		onDidChange(listener) {
			const subscription = editor.onDidChangeModelContent?.(listener) ?? null;
			return () => subscription?.dispose?.();
		},
		marks,
		reveal: (ranges) => revealLines(editor, monaco, ranges),
		revealSpan: (ranges) => revealSpan(editor, monaco, ranges),
		linesBox: (span) => linesBox(editor, span),
		layoutSettled: (win, ms) => layoutSettled(editor, win, ms),
		markers,
		goTo,
	};
}
