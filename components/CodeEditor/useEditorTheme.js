/**
 * useEditorTheme.js — the editor theme the reader picked, ONE for the whole page: every editor
 * (and its solution diff) shows the same theme, since Monaco has one theme per page, and a pick
 * in one editor's Theme menu recolours them all at once. The pick is remembered in the reader's
 * browser (themeChoice.js: localStorage), and a pick in another open tab of the site arrives
 * here too (the `storage` event).
 *
 *     const { family, setFamily, theme } = useEditorTheme();
 *     family          // 'vscode' (editorThemes.js > DEFAULT_FAMILY) until the reader picks another
 *     setFamily(id)   // the Theme menu: every editor on the page, remembered; false for an unknown id
 *     theme           // the concrete theme for the site's light / dark mode:
 *                     //   editorThemes.js > resolveTheme(family, colorMode) — { name, mode, monaco, frame }
 *
 * THE RULES
 *   - One value for the page: a store made once, at module level (pageThemeStore), that every
 *     editor reads through React's useSyncExternalStore, so a change re-renders each of them in
 *     the same pass. Two-variant families follow the site's switch: `theme` is resolved on each
 *     render from the family and useColorMode().
 *   - The server cannot read localStorage: it renders the DEFAULT family (getServerSnapshot),
 *     which is what the placeholder (index.jsx) draws. The editor itself renders only in the
 *     browser, where the first read of the store reads the stored choice: a stored theme is there
 *     from the editor's first frame.
 *   - The stored choice is read ONCE, the first time an editor asks (never at import: SSR-safe,
 *     no `window` touched while the module loads). From the first subscription on, the store
 *     listens to the window's `storage` event until the page closes (one listener for the page,
 *     however many editors come and go), so its value never goes stale while no editor is on
 *     the page; it reads the storage once more as it starts listening, in case another tab
 *     wrote between the editor's first render and its subscription.
 *   - A pick the storage refuses (blocked site data, a full quota) still recolours the page and
 *     holds for this visit; it is only not remembered (themeChoice.js > NOTHING THROWS).
 *   - An unknown id given to setFamily changes nothing (the Theme menu only offers the
 *     registry's families).
 *
 * The store is a plain object (createThemeStore) that __tests__/useEditorTheme.test.js drives
 * with a fake window and storage; the hook only wires it to React and the colour mode.
 *
 * HOW TO CHANGE IT
 *   The themes, their variants and the default: editorThemes.js. The storage key and what counts
 *   as a stored choice: themeChoice.js. Where the theme is used: CodeEditorClient.jsx (calls this
 *   hook once per editor: Monaco, the frame's `data-ce-mode` and --ce-* colours, the MUI mode of
 *   its controls; it hands `family` / `setFamily` to Toolbar.jsx > ThemeMenu.jsx, the menu, and
 *   the Monaco theme to SolutionPanel.jsx, the diff).
 */

import { useSyncExternalStore } from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import { DEFAULT_FAMILY, resolveTheme } from './editorThemes.js';
import { familyFromStorageEvent, isThemeFamily, readThemeChoice, writeThemeChoice } from './themeChoice.js';
import { browserStorage } from './drafts.js';

/** The window event another tab's write fires here. */
const STORAGE_EVENT = 'storage';

/** The store's value before its first read (a family id is never null). */
const NOT_READ = null;

/** The browser's window, looked up when called (none on the server). */
function browserWindow() {
	return globalThis.window;
}

/**
 * A theme store (see the header): { subscribe, getSnapshot, getServerSnapshot, setFamily }, each
 * a stable function (what useSyncExternalStore wants). Options, for the tests: `getWindow` (the
 * window whose localStorage holds the choice and whose `storage` events are heard; default: the
 * browser's, looked up at each use).
 */
export function createThemeStore({ getWindow = browserWindow } = {}) {
	const listeners = new Set();
	let family = NOT_READ;
	let listening = false;

	const currentStorage = () => browserStorage(getWindow());

	function change(next) {
		if (next === family) return;
		family = next;
		for (const listener of [...listeners]) listener();
	}

	function onStorage(event) {
		const next = familyFromStorageEvent(event, currentStorage());
		if (next !== null) change(next);
	}

	/** Read the stored choice again; subscribers hear of it only when it replaces a value they could have seen. */
	function catchUp() {
		const stored = readThemeChoice({ storage: currentStorage() });
		if (family === NOT_READ) family = stored;
		else change(stored);
	}

	/** Hear other tabs from now until the page closes, and catch up with what they wrote (see the header). */
	function startListening() {
		const win = getWindow();
		if (listening || typeof win?.addEventListener !== 'function') return;
		listening = true;
		win.addEventListener(STORAGE_EVENT, onStorage);
		catchUp();
	}

	function getSnapshot() {
		if (family === NOT_READ) family = readThemeChoice({ storage: currentStorage() });
		return family;
	}

	function getServerSnapshot() {
		return DEFAULT_FAMILY;
	}

	function subscribe(listener) {
		listeners.add(listener);
		startListening();
		return () => {
			listeners.delete(listener);
		};
	}

	/** The reader's pick: every editor on the page, and remembered. false (nothing changed) for an unknown id. */
	function setFamily(next) {
		if (!isThemeFamily(next)) return false;
		writeThemeChoice(next, { storage: currentStorage() });
		change(next);
		return true;
	}

	return Object.freeze({ subscribe, getSnapshot, getServerSnapshot, setFamily });
}

/** The page's one store (see the header). Made at import, but it touches nothing until an editor asks. */
export const pageThemeStore = createThemeStore();

/**
 * The reader's editor theme (see the header): { family, setFamily, theme }. `store` is for the
 * tests (default: the page's).
 */
export function useEditorTheme(store = pageThemeStore) {
	const family = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
	const { colorMode } = useColorMode();
	return { family, setFamily: store.setFamily, theme: resolveTheme(family, colorMode) };
}
