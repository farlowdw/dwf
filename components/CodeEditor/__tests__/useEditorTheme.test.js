/**
 * useEditorTheme.test.js — the page's one editor theme (../useEditorTheme.js): the store
 * (createThemeStore) with a fake window and fake storages, and the hook rendered with the real
 * React on the server ('@docusaurus/theme-common' answers a colour mode the test sets):
 *   - importing the module touches no window and no storage (SSR-safe);
 *   - the store reads the stored choice once, lazily; the server's snapshot is always the default;
 *     unusable values, a throwing storage, a blocked window and no window all read the default;
 *   - setFamily: stored, every subscriber told once, nothing for the same family again or for an
 *     unknown id; a refusing storage still recolours the page;
 *   - other tabs: one `storage` listener for the page whatever the number of editors, kept after
 *     the last one goes (no stale value); our key, the storage cleared, another key,
 *     sessionStorage; the catch-up read as the store starts listening;
 *   - the hook: on the server the default family, resolved for the site's mode (VS Code's `vs` /
 *     `vs-dark`: the editors look as before), even with another family stored; the browser's first
 *     render (imitated) resolves the stored family for the site's mode, a single-variant one
 *     keeping its own.
 * Run with `npm run test:shared`.
 * To change it: a new rule of the store or the hook (../useEditorTheme.js) gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_FAMILY, resolveTheme } from '../editorThemes.js';
import { THEME_STORAGE_KEY } from '../themeChoice.js';

/**
 * A module hook: '@docusaurus/theme-common' becomes a useColorMode() that answers the mode the
 * test last set with setTestColorMode() (the same module for the test and the hook).
 */
const THEME_COMMON_STUB = [
	"let colorMode = 'light';",
	'export function setTestColorMode(mode) { colorMode = mode; }',
	'export function useColorMode() { return { colorMode, setColorMode() {} }; }',
].join('\n');
const THEME_COMMON_URL = `data:text/javascript,${encodeURIComponent(THEME_COMMON_STUB)}`;
const THEME_COMMON_HOOK = [
	'export async function resolve(specifier, context, nextResolve) {',
	`	if (specifier === '@docusaurus/theme-common') return { url: ${JSON.stringify(THEME_COMMON_URL)}, shortCircuit: true };`,
	'	return nextResolve(specifier, context);',
	'}',
].join('\n');

register(`data:text/javascript,${encodeURIComponent(THEME_COMMON_HOOK)}`);

const { setTestColorMode } = await import('@docusaurus/theme-common');

/** The site's two modes. */
const SITE_MODES = Object.freeze(['light', 'dark']);

/** localStorage over a Map (getItem / setItem / removeItem), counting each call. */
function fakeStorage(entries = {}) {
	const map = new Map(Object.entries(entries));
	const calls = { getItem: 0, setItem: 0, removeItem: 0 };
	return {
		map,
		calls,
		getItem(key) {
			calls.getItem += 1;
			return map.has(key) ? map.get(key) : null;
		},
		setItem(key, value) {
			calls.setItem += 1;
			map.set(key, String(value));
		},
		removeItem(key) {
			calls.removeItem += 1;
			map.delete(key);
		},
	};
}

/** A storage whose every call throws (blocked site data; setItem: a full quota). */
function throwingStorage() {
	const refuse = () => {
		throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
	};
	return { getItem: refuse, setItem: refuse, removeItem: refuse };
}

/**
 * A fake window: `localStorage` (a storage, or a getter that throws when `blocked`), and the
 * event-target methods, keeping their listeners: fire(type, event) calls them; count(type) says
 * how many there are; reads counts the reads of `localStorage`.
 */
function fakeWindow(storage, { blocked = false } = {}) {
	const listeners = new Map();
	const win = {
		reads: 0,
		get localStorage() {
			win.reads += 1;
			if (blocked) throw new DOMException('The operation is insecure.', 'SecurityError');
			return storage;
		},
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type).add(listener);
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener);
		},
		fire(type, event) {
			for (const listener of listeners.get(type) ?? []) listener(event);
		},
		count(type) {
			return listeners.get(type)?.size ?? 0;
		},
	};
	return win;
}

/** A listener that counts its calls. */
function counter() {
	const listener = () => {
		listener.calls += 1;
	};
	listener.calls = 0;
	return listener;
}

/** The `storage` event another tab's write of `value` under our key fires here. */
function themeEvent(storage, newValue) {
	return { key: THEME_STORAGE_KEY, newValue, oldValue: null, storageArea: storage };
}

// Import with a window whose every use is counted: the module must touch nothing while it loads.
const importWindow = fakeWindow(fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' }));
globalThis.window = importWindow;
let themeModule;
try {
	themeModule = await import('../useEditorTheme.js');
} finally {
	delete globalThis.window;
}
const { createThemeStore, pageThemeStore, useEditorTheme } = themeModule;

/** A store over a fake window holding `storage`. */
function storeWith(storage, options) {
	const win = fakeWindow(storage, options);
	return { win, store: createThemeStore({ getWindow: () => win }) };
}

/** Render useEditorTheme(store) on the server in `colorMode`; returns what the hook gave. */
function renderOnServer(store, colorMode) {
	setTestColorMode(colorMode);
	let result = null;
	function Probe() {
		result = store === undefined ? useEditorTheme() : useEditorTheme(store);
		return null;
	}
	renderToStaticMarkup(createElement(Probe));
	return result;
}

/** The store as the browser's first render sees it: React then calls getSnapshot, which the server never does. */
function asInBrowser(store) {
	return { ...store, getServerSnapshot: store.getSnapshot };
}

test('importing the module touches no window and no storage (SSR-safe)', () => {
	assert.equal(importWindow.reads, 0);
	assert.equal(importWindow.count('storage'), 0);
	assert.equal(typeof pageThemeStore.getSnapshot, 'function');
});

test('a new store touches nothing until it is asked', () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' });
	const { win } = storeWith(storage);
	assert.equal(win.reads, 0);
	assert.equal(storage.calls.getItem, 0);
	assert.equal(win.count('storage'), 0);
});

test("the store's functions are stable (useSyncExternalStore would resubscribe on every render otherwise)", () => {
	const { store } = storeWith(fakeStorage());
	assert.equal(Object.isFrozen(store), true);
	assert.deepEqual(Object.keys(store).sort(), ['getServerSnapshot', 'getSnapshot', 'setFamily', 'subscribe']);
});

test('getSnapshot reads the stored family once, then answers from memory', () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' });
	const { store } = storeWith(storage);
	assert.equal(store.getSnapshot(), 'dracula');
	assert.equal(store.getSnapshot(), 'dracula');
	assert.equal(storage.calls.getItem, 1);
});

test("the server's snapshot is always the default, and reads nothing", () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' });
	const { store, win } = storeWith(storage);
	assert.equal(store.getServerSnapshot(), DEFAULT_FAMILY);
	assert.equal(win.reads, 0);
});

test('nothing stored, an unusable value, a throwing storage, a blocked window, no window: the default', () => {
	assert.equal(storeWith(fakeStorage()).store.getSnapshot(), DEFAULT_FAMILY);
	assert.equal(storeWith(fakeStorage({ [THEME_STORAGE_KEY]: 'nonsense' })).store.getSnapshot(), DEFAULT_FAMILY);
	assert.equal(storeWith(throwingStorage()).store.getSnapshot(), DEFAULT_FAMILY);
	assert.equal(storeWith(fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' }), { blocked: true }).store.getSnapshot(), DEFAULT_FAMILY);
	assert.equal(createThemeStore({ getWindow: () => undefined }).getSnapshot(), DEFAULT_FAMILY);
});

test('setFamily stores the family, changes the snapshot and tells every subscriber once', () => {
	const storage = fakeStorage();
	const { store } = storeWith(storage);
	const first = counter();
	const second = counter();
	store.subscribe(first);
	store.subscribe(second);
	assert.equal(store.setFamily('github'), true);
	assert.equal(store.getSnapshot(), 'github');
	assert.equal(storage.map.get(THEME_STORAGE_KEY), 'github');
	assert.deepEqual([first.calls, second.calls], [1, 1]);
});

test('the same family again tells no one (but is written, in case the stored value was unusable)', () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'nonsense' });
	const { store } = storeWith(storage);
	const listener = counter();
	store.subscribe(listener);
	assert.equal(store.setFamily(DEFAULT_FAMILY), true);
	assert.equal(listener.calls, 0);
	assert.equal(storage.map.get(THEME_STORAGE_KEY), DEFAULT_FAMILY);
});

test('an unknown id changes nothing: no write, no call, the same snapshot', () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'monokai' });
	const { store } = storeWith(storage);
	const listener = counter();
	store.subscribe(listener);
	for (const value of ['nonsense', 'vs-dark', '', null, undefined, 42]) {
		assert.equal(store.setFamily(value), false, String(value));
	}
	assert.equal(store.getSnapshot(), 'monokai');
	assert.equal(storage.calls.setItem, 0);
	assert.equal(listener.calls, 0);
});

test('a storage that refuses, or a blocked window, still recolours the page (not remembered, no throw)', () => {
	for (const { store } of [storeWith(throwingStorage()), storeWith(fakeStorage(), { blocked: true })]) {
		const listener = counter();
		store.subscribe(listener);
		assert.equal(store.setFamily('one-dark'), true);
		assert.equal(store.getSnapshot(), 'one-dark');
		assert.equal(listener.calls, 1);
	}
});

test('an unsubscribed listener is not called again', () => {
	const { store } = storeWith(fakeStorage());
	const listener = counter();
	const unsubscribe = store.subscribe(listener);
	unsubscribe();
	unsubscribe();
	store.setFamily('solarized');
	assert.equal(listener.calls, 0);
});

test('one storage listener for the page, however many editors subscribe, kept after the last one goes', () => {
	const storage = fakeStorage();
	const { store, win } = storeWith(storage);
	const stops = [store.subscribe(counter()), store.subscribe(counter()), store.subscribe(counter())];
	assert.equal(win.count('storage'), 1);
	for (const stop of stops) stop();
	assert.equal(win.count('storage'), 1);
	storage.map.set(THEME_STORAGE_KEY, 'github');
	win.fire('storage', themeEvent(storage, 'github'));
	assert.equal(store.getSnapshot(), 'github', 'no stale value while no editor is on the page');
});

test("another tab's pick recolours this page and tells every subscriber", () => {
	const storage = fakeStorage();
	const { store, win } = storeWith(storage);
	const listener = counter();
	store.subscribe(listener);
	win.fire('storage', themeEvent(storage, 'high-contrast'));
	assert.equal(store.getSnapshot(), 'high-contrast');
	assert.equal(listener.calls, 1);
	win.fire('storage', themeEvent(storage, 'high-contrast'));
	assert.equal(listener.calls, 1, 'the same family again: no call');
});

test('another tab writing an unusable value, or the storage cleared, brings the default back', () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' });
	const { store, win } = storeWith(storage);
	store.subscribe(counter());
	assert.equal(store.getSnapshot(), 'dracula');
	win.fire('storage', themeEvent(storage, 'a-theme-from-a-newer-build'));
	assert.equal(store.getSnapshot(), DEFAULT_FAMILY);
	store.setFamily('github');
	win.fire('storage', { key: null, newValue: null, oldValue: null, storageArea: storage });
	assert.equal(store.getSnapshot(), DEFAULT_FAMILY);
});

test('an event about another key, or from sessionStorage, changes nothing', () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'github' });
	const session = fakeStorage();
	const { store, win } = storeWith(storage);
	const listener = counter();
	store.subscribe(listener);
	win.fire('storage', { key: 'some-other-key', newValue: 'dracula', storageArea: storage });
	win.fire('storage', themeEvent(session, 'dracula'));
	win.fire('storage', { key: null, newValue: null, storageArea: session });
	assert.equal(store.getSnapshot(), 'github');
	assert.equal(listener.calls, 0);
});

test('starting to listen catches up with a write made between the first render and the subscription', () => {
	const storage = fakeStorage();
	const { store } = storeWith(storage);
	assert.equal(store.getSnapshot(), DEFAULT_FAMILY);
	storage.map.set(THEME_STORAGE_KEY, 'solarized'); // another tab, before this page listened
	const listener = counter();
	store.subscribe(listener);
	assert.equal(store.getSnapshot(), 'solarized');
	assert.equal(listener.calls, 1);
});

test('without a window (the server) subscribing works and adds no listener', () => {
	const store = createThemeStore({ getWindow: () => undefined });
	const unsubscribe = store.subscribe(counter());
	assert.equal(store.getSnapshot(), DEFAULT_FAMILY);
	unsubscribe();
});

test("on the server the hook gives the default family resolved for the site's mode: VS Code, as before", () => {
	const expectedNames = { light: 'vs', dark: 'vs-dark' };
	for (const mode of SITE_MODES) {
		const result = renderOnServer(undefined, mode);
		assert.equal(result.family, DEFAULT_FAMILY);
		assert.deepEqual(result.theme, resolveTheme(DEFAULT_FAMILY, mode));
		assert.equal(result.theme.name, expectedNames[mode]);
		assert.equal(result.theme.mode, mode);
		assert.equal(result.setFamily, pageThemeStore.setFamily);
	}
});

test('on the server a stored family is ignored (the placeholder draws the default) and storage is not read', () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' });
	const { store, win } = storeWith(storage);
	for (const mode of SITE_MODES) {
		const result = renderOnServer(store, mode);
		assert.equal(result.family, DEFAULT_FAMILY);
		assert.deepEqual(result.theme, resolveTheme(DEFAULT_FAMILY, mode));
	}
	assert.equal(win.reads, 0);
	assert.equal(win.count('storage'), 0, 'effects (the subscription) never run on the server');
});

test("in the browser's first render a stored two-variant family follows the site's mode", () => {
	const expectedNames = { light: 'dwf-github-light', dark: 'dwf-github-dark' };
	const { store } = storeWith(fakeStorage({ [THEME_STORAGE_KEY]: 'github' }));
	for (const mode of SITE_MODES) {
		const result = renderOnServer(asInBrowser(store), mode);
		assert.equal(result.family, 'github');
		assert.deepEqual(result.theme, resolveTheme('github', mode));
		assert.equal(result.theme.name, expectedNames[mode]);
		assert.equal(result.theme.mode, mode);
		assert.equal(result.setFamily, store.setFamily);
	}
});

test("in the browser's first render a single-variant family keeps its own mode whatever the site's", () => {
	const { store } = storeWith(fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' }));
	for (const mode of SITE_MODES) {
		const result = renderOnServer(asInBrowser(store), mode);
		assert.equal(result.family, 'dracula');
		assert.equal(result.theme.name, 'dwf-dracula');
		assert.equal(result.theme.mode, 'dark');
	}
});

test("a pick re-resolves on the next render: high contrast follows the site's mode", () => {
	const expectedNames = { light: 'hc-light', dark: 'hc-black' };
	const { store } = storeWith(fakeStorage());
	store.setFamily('high-contrast');
	for (const mode of SITE_MODES) {
		assert.equal(renderOnServer(asInBrowser(store), mode).theme.name, expectedNames[mode]);
	}
});
