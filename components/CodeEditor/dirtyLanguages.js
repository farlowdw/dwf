/**
 * dirtyLanguages.js — which of an editor's languages hold the reader's edits, told to the
 * editor's own registry (./unsavedWork.js, which a site's after-deploy reloader reads) as one
 * yes / no: while any language is edited, the page is not reloaded under the reader. No React,
 * no DOM: `report` is handed in,
 * so __tests__/dirtyLanguages.test.js runs it with the real unsavedWork.js and a plain holder.
 *
 *     const dirty = createDirtyLanguages({ initiallyDirty: ['python'], report: (active) => setUnsavedWork(holder, active) });
 *     dirty.publish();               // the editor mounts (and again when React re-runs effects)
 *     dirty.mark('python', false);   // every edit: is this language's code the page's snippet again?
 *     dirty.release();               // the editor unmounts: nothing is held any more
 *
 * THE RULES
 *   - A language is dirty while its code differs from the page's snippet (CodeEditorClient.jsx >
 *     handleChange compares them on every edit).
 *   - A RESTORED DRAFT (useDrafts.js, `saveDraft`) is dirty from the start, whether its language
 *     is shown yet or not: the editor opens with it as Monaco's defaultValue, which fires no
 *     change event, so without `initiallyDirty` a reload right after the restore would go ahead
 *     — and a deploy that changed the snippet would then drop the draft (drafts.js > loadDraft).
 *     A draft never equals its snippet (drafts.js stores none that does), so this is the same
 *     rule as an edit.
 *   - Discard, Reset, or typing the code back to the snippet makes that language clean again
 *     (their change event reaches mark()).
 *   - publish() says the current answer; mark() says it after each change; release() says no
 *     (whatever is still dirty), so an unmounted editor never holds the page.
 *
 * HOW TO CHANGE IT
 *   What counts as edited: handleChange in CodeEditorClient.jsx (the comparison) and
 *   `initiallyDirty` (useDrafts.js > restored). Where the answer goes: `report`
 *   (CodeEditorClient.jsx > useUnsavedWork).
 */

/**
 * The dirty languages of one editor (see the header). `initiallyDirty`: languages edited from
 * the start (restored drafts; any iterable). `report(active)`: told whether any language is
 * dirty. Returns { mark(language, isDirty), publish(), release(), isDirty(language) }.
 */
export function createDirtyLanguages({ initiallyDirty = [], report }) {
	const dirty = new Set(initiallyDirty);

	function publish() {
		report(dirty.size > 0);
	}

	function mark(language, isDirty) {
		if (isDirty) dirty.add(language);
		else dirty.delete(language);
		publish();
	}

	function release() {
		report(false);
	}

	function isDirty(language) {
		return dirty.has(language);
	}

	return { mark, publish, release, isDirty };
}
