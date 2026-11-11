/**
 * monacoSetup.js — the small Monaco settings <CodeEditor> applies around each editor: the names
 * of the default themes, re-measuring the font once the site's mono face has loaded, the address
 * of each language's text model, an undoable "replace all the code" (Reset, Clear, Use this
 * solution) and the clean-up of models. No React; the functions take the `monaco` / `editor`
 * objects they work on, so __tests__/monacoSetup.test.js runs them with fakes.
 *
 * THE THEMES  Every theme a reader can pick lives in editorThemes.js (2026-10-25), and the
 *   editor shows the reader's choice (useEditorTheme.js). The DEFAULT stays Monaco's own 'vs-dark'
 *   and 'vs', unchanged: the colours of VS Code's default dark and light themes, which most
 *   readers know from their own editor (chosen on 2026-10-24; a site-grey background
 *   was tried and dropped), following Docusaurus's colour mode. THEME_DARK / THEME_LIGHT and
 *   themeNameFor name them, read from the registry's default family, so this file and the
 *   registry cannot disagree (__tests__/monacoSetup.test.js pins the two names).
 *
 * JAVASCRIPT / TYPESCRIPT CHECKING  typescript.js > configureTypeScript (2026-10-25: TypeScript
 *   checked strictly in the browser, JavaScript syntax only), which replaced this file's
 *   configureTypeScriptChecking.
 *
 * MODEL ADDRESSES  One text model per language per editor, at
 *   inmemory://code-editor/<editor id>/<language>/<file name>; @monaco-editor/react's
 *   `path` prop switches between them, so each language keeps its own edits, undo history and
 *   folds. The editor id is React's useId() of that editor (CodeEditorClient.jsx): unique on the
 *   page, and never reused by a later editor, so two editors never share a model (nor
 *   @monaco-editor/react's saved view state, which it keys by path). A module counter was not
 *   enough: Fast Refresh re-runs this file and would start counting from 0 again.
 *
 * MONACO'S CANCELLATIONS  When an editor is disposed (the reader leaves the page) while Monaco
 *   still waits on its own work — its word highlighter asks for the occurrences of the word under
 *   the cursor — Monaco cancels that work, and the promise it cancels has no handler, so the
 *   browser logs "Uncaught (in promise) Canceled" (seen 2026-10-24 on leaving a page within
 *   ~300 ms of an editor appearing). Nothing is wrong and nothing leaks; it is Monaco's own
 *   unhandled rejection. ignoreMonacoCancellations() quiets exactly that error — a rejection whose
 *   reason is Monaco's CancellationError (name and message both 'Canceled') — and nothing else,
 *   once per page.
 *
 * THE CONTENT HEIGHT  laidOutContentHeight (2026-10-26): a box that fits its code must take
 *   Monaco's content height only from a laid-out editor. @monaco-editor/react creates the editor
 *   in a hidden box, which Monaco measures as 5 px wide (never 0), so with word wrap on the first
 *   content height is one line per character. The guard: the container rendered, the text with
 *   room (contentWidth above 0), the height not Monaco's -1. CodeEditorClient.jsx fits through it
 *   everywhere, and calls `editor.layout()` first thing on mount, once the box is shown.
 *
 * HOW TO CHANGE IT
 *   A theme, or the default family: editorThemes.js (THEME_FAMILIES, DEFAULT_FAMILY; its header
 *   says how). The font Monaco waits for: the first family of the page's stack (editorFont.js;
 *   --ce-font-family in shared/css/custom.scss).
 */

import { DEFAULT_FAMILY, resolveTheme } from './editorThemes.js';

/** The default family's two themes: VS Code's default dark and light colours, Monaco's built-in 'vs-dark' / 'vs' (see the header). */
export const THEME_DARK = resolveTheme(DEFAULT_FAMILY, 'dark').name;
export const THEME_LIGHT = resolveTheme(DEFAULT_FAMILY, 'light').name;

/** Monaco's CancellationError: its name and its message are both this (see the header). */
export const MONACO_CANCELED = 'Canceled';

/** The window that already quiets Monaco's cancellations (once per page). */
let quietedWindow = null;

/** true for Monaco's own CancellationError, and for nothing else. */
export function isMonacoCancellation(reason) {
	return Boolean(reason) && reason.name === MONACO_CANCELED && reason.message === MONACO_CANCELED;
}

/**
 * Stop the browser from logging Monaco's own unhandled cancellations (see the header); every
 * other unhandled rejection is left alone. Safe to repeat: it listens once per window. `win` is
 * for the tests.
 */
export function ignoreMonacoCancellations(win = globalThis.window) {
	if (!win || typeof win.addEventListener !== 'function' || quietedWindow === win) return false;
	quietedWindow = win;
	win.addEventListener('unhandledrejection', (event) => {
		if (isMonacoCancellation(event.reason)) event.preventDefault();
	});
	return true;
}

/** The model address scheme and authority (see the header). */
const MODEL_ROOT = 'inmemory://code-editor';

/** The default family's theme for Docusaurus's colour mode ('dark' or 'light'): what a reader who picked nothing sees. */
export function themeNameFor(colorMode) {
	return resolveTheme(DEFAULT_FAMILY, colorMode).name;
}

/**
 * Once the site's mono face has loaded, have Monaco measure its characters again (Monaco
 * measures when an editor is created, possibly with the fallback font, and the cursor then
 * drifts from the text). Resolves true when it re-measured. `doc` is for the tests.
 */
export function remeasureFontsWhenLoaded(monaco, { fontSize, fontFamily, doc = globalThis.document } = {}) {
	const fonts = doc?.fonts;
	if (!fonts || typeof fonts.load !== 'function') return Promise.resolve(false);
	return fonts
		.load(`${fontSize}px ${fontFamily}`)
		.then(() => fonts.ready)
		.then(() => {
			monaco.editor.remeasureFonts();
			return true;
		})
		.catch(() => false);
}

/**
 * The editor's content height (px), or null while the editor is not laid out (THE CONTENT
 * HEIGHT in the header): @monaco-editor/react creates the editor inside a box it keeps
 * `display: none` until the editor exists, and a hidden container has no width — which Monaco
 * measures as 5 px (elementSizeObserver.js > Math.max(5, …)), leaving the text no room
 * (`contentWidth` below 0: measured in Chrome, width 5, contentWidth -46). With word wrap on (a
 * touch-first device, touchOptions.js) every character then wraps onto a line of its own and the
 * content height is enormous (2,599 px for four lines). A box that fits its code (autoHeight.js)
 * must never take that figure — on an iPhone it filled the whole screen for four lines
 * (2026-10-26). Once the box is shown, Monaco lays out again (automaticLayout, and handleMount's
 * `editor.layout()`) and the height is real. So "laid out" means: the container is rendered
 * (offsetWidth above 0) and the text has room (contentWidth above 0); and Monaco's -1 "no model
 * yet" (codeEditorWidget.js > getContentHeight) is not a height either.
 */
export function laidOutContentHeight(editor) {
	const container = editor.getContainerDomNode?.() ?? editor.getDomNode?.();
	if (container && !(container.offsetWidth > 0)) return null;
	const contentWidth = editor.getLayoutInfo?.()?.contentWidth ?? 0;
	if (!(contentWidth > 0)) return null;
	const height = editor.getContentHeight();
	return height >= 0 ? height : null;
}

/** The address of `language`'s text model in the editor `editorId` (React's useId(); see the header). Every part is encoded. */
export function modelPath(editorId, language, fileName) {
	const parts = [editorId, language, fileName].map((part) => encodeURIComponent(String(part)));
	return `${MODEL_ROOT}/${parts.join('/')}`;
}

/** The source name Monaco records for the component's own edits (Reset, Clear). */
const EDIT_SOURCE = 'code-editor';

/**
 * Replace the editor's whole text with `text` as ONE undoable edit (⌘/Ctrl+Z brings the
 * reader's code back after Reset or Clear). A read-only editor refuses edits, so its model is
 * set directly. Nothing happens when the text is already `text`.
 */
export function replaceCode(editor, text, { readOnly = false } = {}) {
	const model = editor.getModel();
	if (!model || model.getValue() === text) return;
	if (readOnly) {
		model.setValue(text);
		return;
	}
	editor.pushUndoStop();
	editor.executeEdits(EDIT_SOURCE, [{ range: model.getFullModelRange(), text, forceMoveMarkers: true }]);
	editor.pushUndoStop();
}

/** Dispose these text models, except `keep` (the one an editor still shows: the editor disposes it). */
export function disposeModels(models, keep) {
	for (const model of models) {
		if (model === keep || model.isDisposed()) continue;
		model.dispose();
	}
}
