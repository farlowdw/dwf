/**
 * draftSession.js — the rules of the `saveDraft` prop for ONE editor, without React: which
 * drafts were found at mount, the code each language opens with, its folds, saving and
 * discarding. useDrafts.js holds one session per editor and only wires it to React; the storage
 * itself is drafts.js. The storage and the saver are handed in (or the browser's are used), so
 * __tests__/draftSession.test.js runs every rule with fakes.
 *
 *     const session = createDraftSession({ settings, path: '/site-guide' });
 *     session.enabled                 // saveDraft on, and not read-only
 *     session.startingCode(lang)      // the restored draft, else the page's snippet: <Editor defaultValue>
 *     session.foldsFor(lang)          // the author's folds, or none while lang shows a restored draft
 *     session.foldsFor(lang, text)    // … and none when `text` (the code the editor opens on) is not the snippet
 *     session.save(lang, text)        // every edit (written SAVE_DELAY_MS after the last one)
 *     session.discard(lang)           // Reset and Discard: returns the new restored set (the same set when unchanged)
 *     session.restored()              // the languages showing a restored draft: the notice
 *     session.flush()                 // a waiting save written now (unmount, the page hidden or left)
 *
 * THE RULES
 *   - Only with `saveDraft`, and never for a read-only editor (there is nothing to save). Without
 *     it every function is harmless: startingCode is the snippet, foldsFor the author's folds,
 *     save / discard / flush touch no storage, restored() is empty — the editor behaves exactly
 *     as before.
 *   - A draft is looked for once, when the session is made (drafts.js > loadDraft, per
 *     language). The code it is compared with (drafts.js > draftKey's `snippet`) is the snippet
 *     WITHOUT its magic comments: the code the editor starts with, Reset brings back and the
 *     reader's edits are compared with (props.js). A changed snippet starts afresh.
 *   - The key is the page's path (fixed when the session is made), the author's `id` (never
 *     React's useId(): drafts.js's header says why), the language and the snippet's hash.
 *   - A restored language opens WITHOUT the author's folds: their line numbers are the snippet's,
 *     and the reader's code may have moved them. discard() brings them back AT ONCE (Reset folds
 *     in the same click, before React draws again). Highlights and steps still apply (the
 *     orchestrator's decision 5).
 *
 * HOW TO CHANGE IT
 *   The storage rules, the delay, the size cap and the notice's words: drafts.js. When drafts
 *   are on: draftsEnabled. Where the notice is drawn and when save / discard are called:
 *   CodeEditorClient.jsx; the React side (page hide, unmount): useDrafts.js.
 */

import { createDraftSaver, loadDraft } from './drafts.js';

/** The restored set of an editor that has none (frozen: nothing ever adds to it). */
const NO_LANGUAGES = Object.freeze(new Set());

/** The page's snippet for `lang` ('' when it gave none), without magic comments (props.js). */
function snippetOf(settings, lang) {
	return settings.snippets.code[lang] ?? '';
}

/** Where `lang`'s draft lives (drafts.js > draftKey). editorKey is the author's id, never useId(). */
function draftWhere(settings, path, lang) {
	return { path, editorKey: settings.id ?? undefined, language: lang, snippet: snippetOf(settings, lang) };
}

/** { [language]: code } of the drafts found now (`storage` undefined: the browser's). */
function loadAllDrafts(settings, path, storage) {
	const drafts = {};
	for (const lang of settings.snippets.languages) {
		const draft = loadDraft(draftWhere(settings, path, lang), { storage });
		if (draft) drafts[lang] = draft.code;
	}
	return drafts;
}

/** Are drafts on for these settings (see THE RULES)? */
export function draftsEnabled(settings) {
	return settings.saveDraft === true && !settings.readOnly;
}

/**
 * One editor's drafts (see the header). `settings`: props.js > normalizeEditorProps (fixed at
 * mount). `path`: the page's path. `storage` and `saver` are for the tests (default: the
 * browser's localStorage, and drafts.js > createDraftSaver over the same storage).
 */
export function createDraftSession({ settings, path, storage, saver }) {
	const enabled = draftsEnabled(settings);
	const drafts = enabled ? loadAllDrafts(settings, path, storage) : {};
	const writer = enabled ? (saver ?? createDraftSaver({ storage })) : null;
	const found = Object.keys(drafts);
	let restored = found.length > 0 ? new Set(found) : NO_LANGUAGES;

	function startingCode(lang) {
		return drafts[lang] ?? snippetOf(settings, lang);
	}

	/** The author's folds for `lang`; none over a restored draft, and none over `text` when it is given and is not the snippet (its line numbers would be wrong). */
	function foldsFor(lang, text) {
		if (restored.has(lang)) return [];
		if (typeof text === 'string' && text !== snippetOf(settings, lang)) return [];
		return settings.foldedRegions[lang] ?? [];
	}

	function save(lang, text) {
		writer?.schedule(draftWhere(settings, path, lang), text);
	}

	function discard(lang) {
		writer?.discard(draftWhere(settings, path, lang));
		if (!restored.has(lang)) return restored;
		const next = new Set(restored);
		next.delete(lang);
		restored = next;
		return restored;
	}

	function flush() {
		writer?.flush();
	}

	return { enabled, startingCode, foldsFor, save, discard, restored: () => restored, flush };
}
