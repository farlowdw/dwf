/**
 * usePrintRefresh.js — keeps the printout's copy of the code (PrintCopy.jsx) current: on the
 * window's `beforeprint` event (PRINT_EVENT) the <pre>'s text is replaced with what `getCode()`
 * returns — the editor's current text — so a printout shows the code as the reader last left
 * it, not the text the page loaded. The text is written straight into the DOM node
 * (refreshPrintText), not through React state: the browser lays the print preview out as soon
 * as the event's listeners return, and a state update could land after that; React does not
 * touch the node's text again unless the `code` it renders changes (a language switch), and
 * then the new text is the right one anyway.
 *
 *     const nodeRef = useRef(null);
 *     usePrintRefresh(nodeRef, getCode);      // then <pre ref={nodeRef}>…</pre>
 *
 *   - `nodeRef`  the <pre>'s ref (React fills it at the mount; nothing is written before)
 *   - `getCode`  () => the current text, or null for none (the initial text then prints). The
 *                LATEST function is the one called, whichever render passed it (a ref holds
 *                it), so the listener is added once per window, not once per render.
 *   - `win`      the window; the default is globalThis.window, which a server render has not
 *                (nothing happens then), and a test replaces with a fake.
 *   A text that is not a string (the editor not ready yet) leaves the node as it is.
 * React's two hooks and nothing else: __tests__/printRefresh.test.js runs it through
 * reactHookShim.js with a fake window and a fake node.
 *
 * HOW TO CHANGE IT  The event: PRINT_EVENT (Chrome, Firefox and Safari 13+ fire it before the
 * print preview; a `matchMedia('print')` listener would be the fallback for an older WebKit).
 * What is written: refreshPrintText.
 */

import { useEffect, useRef } from 'react';

/** The window event the browser fires before it lays the printout out. */
export const PRINT_EVENT = 'beforeprint';

/**
 * Writes `getCode()`'s text into `node`: true when it did, false when there was no node, no
 * function or no string to write (the node keeps its text).
 */
export function refreshPrintText(node, getCode) {
	if (!node || typeof getCode !== 'function') return false;
	const text = getCode();
	if (typeof text !== 'string') return false;
	node.textContent = text;
	return true;
}

/** Can this window take a listener? (A server render has no window at all.) */
function listens(win) {
	return Boolean(win) && typeof win.addEventListener === 'function';
}

/** See the header. */
export function usePrintRefresh(nodeRef, getCode, win = globalThis.window) {
	const getCodeRef = useRef(getCode);
	useEffect(() => {
		getCodeRef.current = getCode; // the latest function, after every render
	});
	useEffect(() => {
		if (!listens(win)) return undefined;
		const refresh = () => refreshPrintText(nodeRef.current, getCodeRef.current);
		win.addEventListener(PRINT_EVENT, refresh);
		return () => win.removeEventListener(PRINT_EVENT, refresh);
	}, [nodeRef, win]);
}
