/**
 * useDrafts.js — the `saveDraft` prop inside the editor: the reader's code, per language, kept in
 * THEIR browser (drafts.js: localStorage) and brought back after a reload, with the notice
 * "Restored your saved code · Discard" (CodeEditorClient.jsx draws it).
 *
 *     const drafts = useDrafts(settings);
 *     drafts.startingCode(lang)      // the restored draft, else the page's snippet: <Editor defaultValue>
 *     drafts.foldsFor(lang)          // the author's folds, or none while lang shows a restored draft
 *     drafts.foldsFor(lang, text)    // … and none when `text` is not the snippet (Monaco mounting on a phone's edited text)
 *     drafts.save(lang, text)        // every edit (written SAVE_DELAY_MS after the last one)
 *     drafts.discard(lang)           // Reset and Discard: the draft goes, the author's folds come back
 *     drafts.restored.has(lang)      // show the notice for this language
 *
 * Every rule (only with `saveDraft` and never read-only; the drafts found once, at mount, against
 * the snippet without magic comments; no author folds over a restored draft until Reset /
 * Discard) lives in draftSession.js, a plain object without React that
 * __tests__/draftSession.test.js covers. This hook makes ONE session per editor, at mount (the
 * page's path then: drafts are kept per page), keeps `restored` in React's state so the notice
 * goes after a discard, and writes a waiting save when the page is hidden or left
 * (drafts.js > flushOnPageHide) and when the editor unmounts, so a reload inside the delay loses
 * nothing. The restored languages also count as unsaved work from the start
 * (CodeEditorClient.jsx > useUnsavedWork, dirtyLanguages.js).
 *
 * HOW TO CHANGE IT
 *   The rules: draftSession.js. The storage rules, the delay, the size cap and the notice's
 *   words: drafts.js. Where the notice is drawn and when save / discard are called:
 *   CodeEditorClient.jsx.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import { createDraftSession } from './draftSession.js';
import { flushOnPageHide } from './drafts.js';

/** See the header. `settings`: props.js > normalizeEditorProps (fixed at mount). */
export function useDrafts(settings) {
	const { pathname } = useLocation();
	const [session] = useState(() => createDraftSession({ settings, path: pathname }));
	const [restored, setRestored] = useState(() => session.restored());

	useEffect(() => {
		if (!session.enabled) return undefined;
		const stop = flushOnPageHide(session);
		return () => {
			stop();
			session.flush();
		};
	}, [session]);

	// discard() hands back the same set when nothing changed, so React then draws nothing again.
	const discard = useCallback((lang) => setRestored(session.discard(lang)), [session]);

	return { restored, startingCode: session.startingCode, foldsFor: session.foldsFor, save: session.save, discard };
}
