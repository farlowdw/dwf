/**
 * unsavedWork.js — the code editor's own tiny registry of "an editor on this page holds typed
 * text that is not saved yet": one flag per editor (CodeEditorClient.jsx > useUnsavedWork, set
 * while code in any of its languages is edited — a restored draft counts from the start:
 * dirtyLanguages.js). A site that reloads its tabs after a deploy may read hasUnsavedWork() and
 * hold the reload while it is true, through a one-line stub of this file (README.md > Taking it
 * to another Docusaurus site); another site may ignore it. The editor imports nothing of the
 * site for this: the dependency points from the site to the editor, so the folder works the same
 * on every site that mounts shared/.
 *
 *     const holder = {};                   // any object, one per editor
 *     setUnsavedWork(holder, true);        // while it has unsaved text
 *     setUnsavedWork(holder, false);       // saved, discarded or unmounted
 *     hasUnsavedWork();                    // true while at least one holder is registered
 *
 * Plain module state (one Set), no React, no storage: it describes THIS page only and is empty
 * after a reload. Safe during SSR (nothing touches `window`).
 *
 * HOW TO CHANGE IT
 *   Another editor that must block the reload: call setUnsavedWork(holder, dirty) from it (true
 *   while it holds unsaved text; false once saved, discarded or unmounted — e.g. from a React
 *   effect and its cleanup). A site that wants the flag: import { hasUnsavedWork } from this
 *   file (its only public use outside the folder, with setUnsavedWork / resetUnsavedWork).
 *   Tests: __tests__/unsavedWork.test.js (`npm run test:shared`).
 */

const holders = new Set();

/** Register (`active` true) or release (`active` false) one holder. */
export function setUnsavedWork(holder, active) {
	if (active) holders.add(holder);
	else holders.delete(holder);
}

/** true while at least one editor on the page has unsaved text. */
export function hasUnsavedWork() {
	return holders.size > 0;
}

/** For the tests: forget every holder. */
export function resetUnsavedWork() {
	holders.clear();
}
