/**
 * themeChoice.js — the reader's editor theme, remembered in THEIR browser (localStorage), so it
 * holds across visits, pages and open tabs. No React; the storage is handed in (or found when
 * called), so __tests__/themeChoice.test.js runs everything with fakes. The page-wide store and
 * the hook the editors use: useEditorTheme.js.
 *
 *     readThemeChoice();                  // 'dracula', or DEFAULT_FAMILY ('vscode') when nothing usable is stored
 *     writeThemeChoice('github');         // THEME_WRITE_RESULTS.saved | invalid | unavailable | failed
 *     isThemeFamily('one-dark');          // true for a family of editorThemes.js > THEME_FAMILIES
 *     familyFromStorageEvent(event, storage);  // another tab's new choice, or null when the event is not about it
 *
 * WHAT IS STORED  One key, THEME_STORAGE_KEY, whose value is a theme FAMILY id of
 *   editorThemes.js > THEME_FAMILIES ('vscode', 'github', 'dracula', …) as a plain string: the
 *   family, not the concrete theme, so a two-variant family keeps following the site's light /
 *   dark switch (editorThemes.js > resolveTheme picks the variant). Every valid choice is stored,
 *   the default too: a reader who picked "VS Code" keeps it even if DEFAULT_FAMILY changes one day.
 *
 * WHAT IS READ  Only an exact family id counts. Nothing stored, a value that is not a family id
 *   (another format, a typo made in the browser's tools, a theme since removed from the
 *   registry, or one a NEWER version of the site added, read by an older tab still open) all
 *   read as DEFAULT_FAMILY — and are left in place: reading never writes, so an older tab never
 *   erases a choice a newer one made, and the reader's next pick overwrites the value anyway.
 *
 * NOTHING THROWS  Every storage access is in try/catch: Safari's private windows, blocked site
 *   data and a full quota all make storage refuse, and so can merely READING
 *   window.localStorage (drafts.js > browserStorage). Then readThemeChoice answers
 *   DEFAULT_FAMILY, writeThemeChoice says why (THEME_WRITE_RESULTS), and the editor goes on
 *   working: the choice still recolours the page, it is only not remembered.
 *
 * OTHER TABS  The browser fires a `storage` event in every OTHER tab of the site when one tab
 *   writes (never in the writing tab). familyFromStorageEvent reads it: our key changed → the new
 *   family (an unusable value → DEFAULT_FAMILY), the whole storage cleared (key null: "clear
 *   site data") → DEFAULT_FAMILY, anything else (another key, sessionStorage) → null.
 *
 * HOW TO CHANGE IT
 *   The key: THEME_STORAGE_KEY (readers' stored choices are then forgotten once). The themes and
 *   the default: editorThemes.js (THEME_FAMILIES, DEFAULT_FAMILY) — nothing here lists them.
 *   How the page shares one choice between its editors: useEditorTheme.js.
 */

import { browserStorage } from './drafts.js';
import { DEFAULT_FAMILY, THEME_FAMILIES } from './editorThemes.js';

/** The localStorage key of the reader's theme family (see the header). */
export const THEME_STORAGE_KEY = 'code-editor.theme';

/** What writeThemeChoice did. */
export const THEME_WRITE_RESULTS = Object.freeze({
	saved: 'saved',
	invalid: 'invalid',
	unavailable: 'unavailable',
	failed: 'failed',
});

/**
 * The registry's families as a list. THEME_FAMILIES is a list of { id, label, … }; Object.values
 * also reads an object keyed by id the same way, so this file does not care which it is.
 */
function families() {
	return Object.values(THEME_FAMILIES ?? {});
}

/** Is `value` exactly the id of a family of the registry (editorThemes.js > THEME_FAMILIES)? */
export function isThemeFamily(value) {
	if (typeof value !== 'string') return false;
	return families().some((family) => family?.id === value);
}

/** `value` when it is a family id, else DEFAULT_FAMILY. */
export function familyOrDefault(value) {
	return isThemeFamily(value) ? value : DEFAULT_FAMILY;
}

/**
 * The reader's stored theme family, or DEFAULT_FAMILY: nothing stored, no storage, the storage
 * refuses, or the value is not a family id (left in place: see the header). Never throws.
 */
export function readThemeChoice({ storage = browserStorage() } = {}) {
	if (!storage) return DEFAULT_FAMILY;
	let raw = null;
	try {
		raw = storage.getItem(THEME_STORAGE_KEY);
	} catch {
		return DEFAULT_FAMILY;
	}
	return familyOrDefault(raw);
}

/**
 * Remember `family` as the reader's choice. Returns one of THEME_WRITE_RESULTS: saved; invalid
 * (not a family id: nothing written); unavailable (no storage); failed (the storage refused, a
 * full quota for one). Never throws.
 */
export function writeThemeChoice(family, { storage = browserStorage() } = {}) {
	if (!isThemeFamily(family)) return THEME_WRITE_RESULTS.invalid;
	if (!storage) return THEME_WRITE_RESULTS.unavailable;
	try {
		storage.setItem(THEME_STORAGE_KEY, family);
		return THEME_WRITE_RESULTS.saved;
	} catch {
		return THEME_WRITE_RESULTS.failed;
	}
}

/** Did this `storage` event come from `storage` (localStorage), not from another area (sessionStorage)? */
function fromStorage(event, storage) {
	if (!storage || !event.storageArea) return true;
	return event.storageArea === storage;
}

/**
 * Another tab's new theme family from a `storage` event (see the header): our key → its new value
 * as a family (an unusable one → DEFAULT_FAMILY); key null (the whole storage cleared) →
 * DEFAULT_FAMILY; another key, or another storage area than `storage` → null (not about the theme).
 */
export function familyFromStorageEvent(event, storage = browserStorage()) {
	if (!event || !fromStorage(event, storage)) return null;
	if (event.key === null) return DEFAULT_FAMILY;
	if (event.key !== THEME_STORAGE_KEY) return null;
	return familyOrDefault(event.newValue);
}
