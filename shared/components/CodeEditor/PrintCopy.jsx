/**
 * PrintCopy.jsx — the printout's copy of the code. Monaco prints as its box: cut at the box's
 * height, the lines scrolled away and the folded ones missing. So the client renders this
 * <pre> right after the Monaco box (CodeEditorClient.jsx: on a desktop, and on a touch device
 * after Tap to edit; the static view of a touch device prints its own lines, and the
 * server-rendered placeholder keeps its own print rule, styles.module.css > .waitingCode):
 *
 *     <PrintCopy code={drafts.startingCode(language)} getCode={readCode} options={monacoOptions} />
 *
 *   - on screen nothing: `display: none` (PrintCopy.module.css), so the box keeps its size and
 *     find-in-page, a copy of the page and screen readers (aria-hidden as well) never meet it;
 *   - in print (@media print) a block of plain, wrapped text where the editor's text was —
 *     Monaco's text column and the editor's ink, as the waiting placeholder prints — in the
 *     editor's font, size, line height and tab width (printCopyStyle: read from the BUILT
 *     Monaco options, the way props.js > waitingCodeStyle reads them for the placeholder);
 *   - `code` is the text the editor opened on (the language's snippet or a restored draft): it
 *     prints when the browser gives no warning; on the window's `beforeprint` (PRINT_EVENT,
 *     usePrintRefresh.js) the text becomes getCode()'s — the editor's current text, every
 *     line of it: a fold hides nothing in a <pre> — so a printout shows the code as the reader
 *     left it. A new `code` (a language switch) replaces the text as React renders it.
 *   No MUI, no Monaco: a <pre> and one hook. Tested by __tests__/printCopy.test.js (the markup,
 *   the metrics, the stylesheet) and __tests__/printRefresh.test.js (the hook).
 *
 * HOW TO CHANGE IT  The look in print: PrintCopy.module.css. The metrics: printCopyStyle. The
 * event and what it writes: usePrintRefresh.js.
 */

import React, { useRef } from 'react';
import styles from './PrintCopy.module.css';
import { DEFAULT_EDITOR_OPTIONS, WAITING_FONT_CSS } from './props.js';
import { lineHeightPx } from './sizing.js';
import { PRINT_EVENT, usePrintRefresh } from './usePrintRefresh.js';

export { PRINT_EVENT };

/** The font size (px) of built Monaco options, or Monaco's default for a value it would refuse. */
function fontSizeOf(options) {
	return typeof options.fontSize === 'number' && options.fontSize > 0 ? options.fontSize : DEFAULT_EDITOR_OPTIONS.fontSize;
}

/** The tab width of built Monaco options, or Monaco's default for a value it would refuse. */
function tabSizeOf(options) {
	return Number.isInteger(options.tabSize) && options.tabSize > 0 ? options.tabSize : DEFAULT_EDITOR_OPTIONS.tabSize;
}

/**
 * The inline style of the print copy: the font, size, line height and tab width Monaco draws
 * this editor with (`options`: props.js > buildMonacoOptions's result, a page's editorOptions
 * included), the numbers the waiting placeholder's text gets too (props.js > waitingCodeStyle).
 */
export function printCopyStyle(options = {}) {
	return {
		fontFamily: options.fontFamily ?? WAITING_FONT_CSS,
		fontSize: `${fontSizeOf(options)}px`,
		lineHeight: `${lineHeightPx(options)}px`,
		tabSize: tabSizeOf(options),
	};
}

/** See the header. `code`: the text at the start; `getCode`: the current text, read when printing; `options`: the built Monaco options. */
export default function PrintCopy({ code, getCode = null, options = {} }) {
	const nodeRef = useRef(null);
	usePrintRefresh(nodeRef, getCode);
	return (
		<pre ref={nodeRef} className={styles.printCopy} style={printCopyStyle(options)} aria-hidden="true">
			{code}
		</pre>
	);
}
