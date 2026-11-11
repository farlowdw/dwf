/**
 * useUnsavedInput.js — keeps the editor's own registry of unsaved work (unsavedWork.js, which a
 * site's after-deploy reloader reads) told that a field of the editor holds text the reader
 * typed: the program input (stdin). The code has its own flag (CodeEditorClient.jsx >
 * useUnsavedWork, dirtyLanguages.js); this one is for a plain text value, compared with the
 * page's own, under a holder of its own.
 *
 *     useUnsavedInput(stdin, settings.stdin);   // held while the two differ
 *
 * WHY
 *   The reloader holds a reload while a text field has focus, but typed input stays in the page
 *   after the focus has left the field (the reader pressed Run, or clicked elsewhere). A reload
 *   then would close the field and drop the text.
 *
 * WHAT ENDS THE HOLD
 *   The field back at the page's value (on a page that gives no input: emptied), or the editor
 *   unmounting. Nothing else: Reset is about the code and leaves the input as it is.
 *
 * HOW TO CHANGE IT
 *   Another typed field of the editor: one more call, with its value and the page's. Tests:
 *   __tests__/useUnsavedInput.test.js (`npm run test:shared`).
 */

import { useEffect, useRef } from 'react';
import { setUnsavedWork } from './unsavedWork.js';

/** Holds the registry's flag while `value` (what the field holds) differs from `pageValue` (what the page gave it). */
export function useUnsavedInput(value, pageValue) {
	const holderRef = useRef({});
	useEffect(() => {
		const holder = holderRef.current;
		setUnsavedWork(holder, value !== pageValue);
		return () => setUnsavedWork(holder, false);
	}, [value, pageValue]);
}
