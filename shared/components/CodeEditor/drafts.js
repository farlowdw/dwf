/**
 * drafts.js — the reader's saved code for an editor with `saveDraft`: what they typed survives a
 * reload, one draft per language, kept in THEIR browser only (localStorage). No React; the
 * storage, the clock and the timers are handed in (or found when called), so
 * __tests__/drafts.test.js runs everything with fakes.
 *
 *     const where = { path: '/site-guide', editorKey: 'two-sum', language: 'python', snippet };
 *     loadDraft(where);                    // { code, savedAt } or null
 *     saveDraft(where, code);              // DRAFT_RESULTS.saved | cleared | tooLarge | unavailable | failed
 *     clearDraft(where);                   // true when no draft is left (Reset, Discard)
 *
 *     const saver = createDraftSaver();    // the editor's onChange → saver.schedule(where, code)
 *     saver.schedule(where, code);         // written SAVE_DELAY_MS after the last change
 *     saver.flush();                       // written now (unmount, a language switch)
 *     saver.discard(where);                // a waiting save dropped AND the stored draft removed (Reset)
 *     const stop = flushOnPageHide(saver); // a reload inside the delay loses nothing
 *
 * WHERE A DRAFT LIVES  One localStorage key per page, editor, language AND snippet (draftKey):
 *   DRAFT_KEY_PREFIX|<path>|<editorKey>|<language>|<snippet hash>
 *   - path: the page's path (`useLocation().pathname`); a trailing slash is ignored, so
 *     /site-guide and /site-guide/ share their drafts.
 *   - editorKey: the author's `id` prop. NEVER React's useId(): in a render that happens only in
 *     the browser (the editor's is one, BrowserOnly) useId() is a counter of every id React has
 *     made since the app started (react-dom's globalClientIdCounter), so it differs between a
 *     fresh load and a visit by link.
 *     Without an id the key falls back to DEFAULT_EDITOR_KEY: the draft is then the page's,
 *     language's and snippet's, so two editors with the very same snippet on one page share one
 *     draft (give them ids).
 *   - snippet hash: FNV-1a (32 bits, over the snippet's UTF-8 bytes, 8 hex digits) of the code
 *     the editor STARTS with — what Reset brings back (after magic comments are removed: the
 *     same text the editor compares the reader's code with). When the author changes the
 *     snippet, the key changes: an old draft is never poured into new code. For an editor WITH
 *     an id, loadDraft also removes that editor's old drafts of the language (dropStaleDrafts).
 *     Without an id nothing is removed: the hash is then what tells the page's id-less editors
 *     apart, so a draft for another snippet may well be ANOTHER editor's (KNOWN LIMITS).
 *   The parts are escaped (only `%` and `|`), so a key stays readable in the browser's tools and
 *   no part can run into the next.
 *
 * WHAT IS STORED  JSON { code, savedAt } (savedAt: ms since 1970). A draft equal to the snippet
 *   is not a draft: saving it removes the stored one (so an untouched editor never says
 *   "Restored"). A draft longer than MAX_DRAFT_CHARS is not saved and the older one is REMOVED,
 *   so a reload never brings back code older than what the reader last saw; the code runner
 *   refuses a request that large anyway (Piston's 100 KB body limit). For the same reason a
 *   save the storage refuses (a full quota) removes the older draft too — which also frees its
 *   space for the next save. A stored value that does not read as a draft (another format,
 *   broken JSON, too long) is removed when met.
 *
 * NOTHING THROWS  Every storage access is in try/catch: Safari's private windows, blocked site
 *   data and a full quota (QuotaExceededError) all make storage refuse, and so can merely READING
 *   window.localStorage. Then loadDraft finds nothing, saveDraft says why (DRAFT_RESULTS), and
 *   the editor goes on working without drafts.
 *
 * KNOWN LIMITS  Two tabs editing the same editor: the last write wins. Two editors given the
 *   same id on one page share (and overwrite) one draft per language; the page registry
 *   (lib/registry) warns about the duplicate id. These stay in storage, never
 *   loaded, until the browser clears the site's data: the draft of a language a page no longer
 *   offers, and the old draft of an id-less editor whose snippet changed (see above).
 *
 * WORDS  The notice an editor shows after restoring a draft ("Restored your saved code ·
 *   Discard"): WORDS below.
 *
 * HOW TO CHANGE IT
 *   The delay before a save: SAVE_DELAY_MS. The size cap: MAX_DRAFT_CHARS. A new stored format:
 *   bump the `v1` in DRAFT_KEY_PREFIX (old drafts are then simply never read) and readStoredDraft.
 *   The notice's words: WORDS. Where the editor calls these: useDrafts.js.
 */

/** The words of the notice shown after a draft is restored (see the header). */
export const WORDS = Object.freeze({
	restored: 'Restored your saved code',
	discard: 'Discard',
	discardTooltip: 'Discard your saved code and bring back the original (undo with ⌘/Ctrl+Z)',
});

/** Every key of this file starts with this; the `v1` is the stored format's version. */
export const DRAFT_KEY_PREFIX = 'code-editor:draft:v1';

/** The editorKey of an editor without an `id` (see the header). */
export const DEFAULT_EDITOR_KEY = '-';

/** The longest draft kept, in characters: about the code runner's 100 KB request limit. */
export const MAX_DRAFT_CHARS = 100_000;

/** How long the editor must be quiet before the draft is written (ms). */
export const SAVE_DELAY_MS = 500;

/** What saveDraft did. */
export const DRAFT_RESULTS = Object.freeze({
	saved: 'saved',
	cleared: 'cleared',
	tooLarge: 'tooLarge',
	unavailable: 'unavailable',
	failed: 'failed',
});

/** Between the parts of a key. */
const KEY_SEPARATOR = '|';

/** FNV-1a, 32 bits: the offset basis and the prime. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** The hash's length in hex digits. */
const HASH_DIGITS = 8;

const UTF8 = new TextEncoder();

/** Does nothing (what a stop function is when there was nothing to stop). */
function noop() {}

/** setTimeout / clearTimeout, looked up when called (tests pass their own). */
function browserSetTimer(callback, ms) {
	return setTimeout(callback, ms);
}

function browserClearTimer(timer) {
	clearTimeout(timer);
}

/** The browser's localStorage, or null where there is none or it refuses to be read (see the header). `win` is for the tests. */
export function browserStorage(win = globalThis.window) {
	try {
		return win?.localStorage ?? null;
	} catch {
		return null;
	}
}

/** The FNV-1a hash (32 bits) of `text`'s UTF-8 bytes, as 8 hex digits: '811c9dc5' for ''. */
export function fnv1a(text) {
	let hash = FNV_OFFSET_BASIS;
	for (const byte of UTF8.encode(String(text))) {
		hash ^= byte;
		hash = Math.imul(hash, FNV_PRIME);
	}
	return (hash >>> 0).toString(16).padStart(HASH_DIGITS, '0');
}

/** One part of a key, with `%` and `|` escaped so no part runs into the next. */
function escapePart(part) {
	return String(part).replaceAll('%', '%25').replaceAll(KEY_SEPARATOR, '%7C');
}

/** The page's path without a trailing slash ('/' stays '/'; nothing at all is '/'). */
function normalizePath(path) {
	const text = typeof path === 'string' ? path : '';
	if (text === '' || text === '/') return '/';
	return text.endsWith('/') ? text.slice(0, -1) : text;
}

/** The editor's key: the author's id, or DEFAULT_EDITOR_KEY (see the header). */
function normalizeEditorKey(editorKey) {
	if (typeof editorKey !== 'string' || editorKey === '') return DEFAULT_EDITOR_KEY;
	return editorKey;
}

/** Did the author name this editor (its `id`)? Without one the key is DEFAULT_EDITOR_KEY. */
function hasAuthorKey(editorKey) {
	return normalizeEditorKey(editorKey) !== DEFAULT_EDITOR_KEY;
}

/** The key's start shared by every snippet of one page, editor and language (ends with the separator). */
function editorLanguagePrefix({ path, editorKey, language }) {
	const parts = [normalizePath(path), normalizeEditorKey(editorKey), String(language ?? '')].map(escapePart);
	return [DRAFT_KEY_PREFIX, ...parts].join(KEY_SEPARATOR) + KEY_SEPARATOR;
}

/** The localStorage key of one draft: page, editor, language and the snippet's hash (see the header). */
export function draftKey({ path, editorKey, language, snippet = '' }) {
	return editorLanguagePrefix({ path, editorKey, language }) + fnv1a(snippet);
}

/** A stored value read back as { code, savedAt }, or null when it is not a draft of this format. */
function readStoredDraft(raw) {
	if (typeof raw !== 'string') return null;
	let value;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!value || typeof value.code !== 'string' || value.code.length > MAX_DRAFT_CHARS) return null;
	return { code: value.code, savedAt: Number.isFinite(value.savedAt) ? value.savedAt : null };
}

/** storage.removeItem(key), true when it did not throw. */
function removeKey(storage, key) {
	try {
		storage.removeItem(key);
		return true;
	} catch {
		return false;
	}
}

/** Every key in `storage` that starts with `prefix` (none when the storage refuses). */
function keysStartingWith(storage, prefix) {
	const keys = [];
	try {
		for (let index = 0; index < storage.length; index += 1) {
			const key = storage.key(index);
			if (typeof key === 'string' && key.startsWith(prefix)) keys.push(key);
		}
	} catch {
		return [];
	}
	return keys;
}

/**
 * Remove this editor's drafts of this language made for ANOTHER snippet (the author changed it):
 * they can never load again. Only for an editor with an id (`where.editorKey`): without one, a
 * draft for another snippet may be another id-less editor's on the same page, so nothing is
 * removed (see the header). Returns how many it removed.
 */
export function dropStaleDrafts(where, { storage = browserStorage() } = {}) {
	if (!storage || !hasAuthorKey(where.editorKey)) return 0;
	const current = draftKey(where);
	const stale = keysStartingWith(storage, editorLanguagePrefix(where)).filter((key) => key !== current);
	let removed = 0;
	for (const key of stale) {
		if (removeKey(storage, key)) removed += 1;
	}
	return removed;
}

/**
 * The saved draft for `where` ({ path, editorKey, language, snippet }) as { code, savedAt }, or
 * null: none, the storage refuses, or the stored value is not a draft (it is then removed). A
 * draft equal to the snippet is not one either. Drops the stale drafts first (dropStaleDrafts:
 * an editor with an id only).
 */
export function loadDraft(where, { storage = browserStorage() } = {}) {
	if (!storage) return null;
	dropStaleDrafts(where, { storage });
	const key = draftKey(where);
	let raw = null;
	try {
		raw = storage.getItem(key);
	} catch {
		return null;
	}
	if (raw === null) return null;
	const draft = readStoredDraft(raw);
	if (!draft || draft.code === (where.snippet ?? '')) {
		removeKey(storage, key);
		return null;
	}
	return draft;
}

/** Remove the draft for `where`. true when none is left (false when the storage refuses). */
export function clearDraft(where, { storage = browserStorage() } = {}) {
	if (!storage) return false;
	return removeKey(storage, draftKey(where));
}

/**
 * Write `text` as the draft for `where`. When the storage refuses (a full quota), the older draft
 * is removed instead (see the header). Returns DRAFT_RESULTS.saved or .failed.
 */
function writeDraft(storage, where, text, now) {
	try {
		storage.setItem(draftKey(where), JSON.stringify({ code: text, savedAt: now() }));
		return DRAFT_RESULTS.saved;
	} catch {
		clearDraft(where, { storage });
		return DRAFT_RESULTS.failed;
	}
}

/**
 * Save `code` as the draft for `where`. Code equal to the snippet removes the draft instead; code
 * longer than MAX_DRAFT_CHARS, or code the storage refuses, is not saved and removes the older
 * draft (see the header). Returns one of DRAFT_RESULTS. `now` is for the tests.
 */
export function saveDraft(where, code, { storage = browserStorage(), now = Date.now } = {}) {
	if (!storage) return DRAFT_RESULTS.unavailable;
	const text = typeof code === 'string' ? code : '';
	if (text === (where.snippet ?? '')) {
		const cleared = clearDraft(where, { storage });
		return cleared ? DRAFT_RESULTS.cleared : DRAFT_RESULTS.failed;
	}
	if (text.length > MAX_DRAFT_CHARS) {
		clearDraft(where, { storage });
		return DRAFT_RESULTS.tooLarge;
	}
	return writeDraft(storage, where, text, now);
}

/**
 * Debounced saving for one editor (see the header). Options:
 *   storage    where drafts go (default: the browser's localStorage, looked up at each save)
 *   delayMs    quiet time before a save (default SAVE_DELAY_MS)
 *   now        the clock (default Date.now)
 *   setTimer   (callback, ms) => timer (default setTimeout); clearTimer (timer) => void
 *   onResult   (result, where) => void after each write (one of DRAFT_RESULTS)
 * Returns { schedule(where, code), flush(), discard(where), hasPending() }. Only the LAST code of
 * a key waits; a change for another key (another language) writes the waiting one at once.
 */
export function createDraftSaver({
	storage,
	delayMs = SAVE_DELAY_MS,
	now = Date.now,
	setTimer = browserSetTimer,
	clearTimer = browserClearTimer,
	onResult,
} = {}) {
	let pending = null;
	let timer = null;

	function stopTimer() {
		if (timer !== null) clearTimer(timer);
		timer = null;
	}

	function writePending() {
		stopTimer();
		if (!pending) return null;
		const { where, code } = pending;
		pending = null;
		const result = saveDraft(where, code, { storage, now });
		onResult?.(result, where);
		return result;
	}

	return {
		schedule(where, code) {
			const key = draftKey(where);
			if (pending && pending.key !== key) writePending();
			pending = { key, where, code };
			stopTimer();
			timer = setTimer(writePending, delayMs);
		},
		flush() {
			return writePending();
		},
		discard(where) {
			if (pending?.key === draftKey(where)) {
				pending = null;
				stopTimer();
			}
			return clearDraft(where, { storage });
		},
		hasPending() {
			return pending !== null;
		},
	};
}

/**
 * Write `saver`'s waiting draft when the page goes away or out of sight (a reload, closing the
 * tab, switching apps on a phone), so the last keystrokes before a reload are kept. Returns a
 * function that stops listening. `win` is for the tests.
 */
export function flushOnPageHide(saver, win = globalThis.window) {
	if (!win || typeof win.addEventListener !== 'function') return noop;
	const doc = win.document;
	const flush = () => saver.flush();
	const flushWhenHidden = () => {
		if (doc?.visibilityState === 'hidden') saver.flush();
	};
	win.addEventListener('pagehide', flush);
	doc?.addEventListener?.('visibilitychange', flushWhenHidden);
	return () => {
		win.removeEventListener('pagehide', flush);
		doc?.removeEventListener?.('visibilitychange', flushWhenHidden);
	};
}
