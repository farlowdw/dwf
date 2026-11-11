/**
 * themeChoice.test.js — the reader's remembered editor theme (../themeChoice.js) with fake
 * storages, against the real registry (../editorThemes.js):
 *   - the key and the families it accepts (every family of the spec's table, exact ids only);
 *   - reading: nothing stored, a stored family, unusable values (read as the default AND left in
 *     place), no storage, a storage that throws, a window whose localStorage throws when read;
 *   - writing: a family is stored, an unknown id is not, a refusing storage (full quota) and no
 *     storage at all say so without throwing;
 *   - another tab's `storage` event: our key, an unusable value, the whole storage cleared,
 *     another key, sessionStorage.
 * Run with `npm run test:shared`.
 * To change it: a new rule of ../themeChoice.js (the key, a storage that fails) gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { browserStorage } from '../drafts.js';
import { DEFAULT_FAMILY } from '../editorThemes.js';
import {
	THEME_STORAGE_KEY,
	THEME_WRITE_RESULTS,
	familyFromStorageEvent,
	familyOrDefault,
	isThemeFamily,
	readThemeChoice,
	writeThemeChoice,
} from '../themeChoice.js';

/** The family ids of the spec's table (THEME-SPEC.md, 2026-10-25), the default first. */
const SPEC_FAMILIES = Object.freeze(['vscode', 'high-contrast', 'github', 'solarized', 'dracula', 'one-dark', 'monokai']);

/** Values that are not a family id: wrong case, spaces, other types, names every object has. */
const NOT_FAMILIES = Object.freeze(['', 'VSCode', ' vscode', 'vscode ', 'vs-dark', 'dwf-dracula', 'nonsense', '__proto__', 'toString', 'constructor', '{"family":"github"}', null, undefined, 0, 1, true, {}, ['github']]);

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

test('the key is the one the spec names, and the default is VS Code', () => {
	assert.equal(THEME_STORAGE_KEY, 'code-editor.theme');
	assert.equal(DEFAULT_FAMILY, 'vscode');
	assert.deepEqual(Object.values(THEME_WRITE_RESULTS).sort(), ['failed', 'invalid', 'saved', 'unavailable']);
});

test('every family of the spec is a family; nothing else is', () => {
	for (const id of SPEC_FAMILIES) assert.equal(isThemeFamily(id), true, id);
	for (const value of NOT_FAMILIES) assert.equal(isThemeFamily(value), false, String(value));
});

test('familyOrDefault keeps a family and turns anything else into the default', () => {
	for (const id of SPEC_FAMILIES) assert.equal(familyOrDefault(id), id);
	for (const value of NOT_FAMILIES) assert.equal(familyOrDefault(value), DEFAULT_FAMILY, String(value));
});

test('nothing stored reads as the default', () => {
	assert.equal(readThemeChoice({ storage: fakeStorage() }), DEFAULT_FAMILY);
});

test('a stored family reads back as itself', () => {
	for (const id of SPEC_FAMILIES) {
		assert.equal(readThemeChoice({ storage: fakeStorage({ [THEME_STORAGE_KEY]: id }) }), id);
	}
});

test('an unusable stored value reads as the default and is left in place (reading never writes)', () => {
	for (const value of ['nonsense', 'VSCode', '', '"github"', '{"family":"github"}', 'dwf-dracula', 'a-theme-from-a-newer-build']) {
		const storage = fakeStorage({ [THEME_STORAGE_KEY]: value });
		assert.equal(readThemeChoice({ storage }), DEFAULT_FAMILY, value);
		assert.equal(storage.map.get(THEME_STORAGE_KEY), value);
		assert.equal(storage.calls.setItem + storage.calls.removeItem, 0);
	}
});

test('no storage, or a storage that throws, reads as the default without throwing', () => {
	assert.equal(readThemeChoice({ storage: null }), DEFAULT_FAMILY);
	assert.equal(readThemeChoice({ storage: throwingStorage() }), DEFAULT_FAMILY);
});

test('a window whose localStorage throws when merely read (blocked site data) reads as the default', () => {
	const blockedWindow = {
		get localStorage() {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		},
	};
	assert.equal(browserStorage(blockedWindow), null);
	assert.equal(readThemeChoice({ storage: browserStorage(blockedWindow) }), DEFAULT_FAMILY);
});

test('in node (no window, as on the server) the default lookup finds no storage and reads the default', () => {
	assert.equal(globalThis.window, undefined);
	assert.equal(readThemeChoice(), DEFAULT_FAMILY);
	assert.equal(writeThemeChoice('github'), THEME_WRITE_RESULTS.unavailable);
});

test('writing a family stores its id under the key', () => {
	for (const id of SPEC_FAMILIES) {
		const storage = fakeStorage();
		assert.equal(writeThemeChoice(id, { storage }), THEME_WRITE_RESULTS.saved);
		assert.deepEqual([...storage.map], [[THEME_STORAGE_KEY, id]]);
		assert.equal(readThemeChoice({ storage }), id);
	}
});

test('the default is stored too when it is picked (an explicit choice outlives a new default)', () => {
	const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'dracula' });
	assert.equal(writeThemeChoice(DEFAULT_FAMILY, { storage }), THEME_WRITE_RESULTS.saved);
	assert.equal(storage.map.get(THEME_STORAGE_KEY), DEFAULT_FAMILY);
});

test('an unknown id is not written', () => {
	for (const value of NOT_FAMILIES) {
		const storage = fakeStorage({ [THEME_STORAGE_KEY]: 'github' });
		assert.equal(writeThemeChoice(value, { storage }), THEME_WRITE_RESULTS.invalid, String(value));
		assert.equal(storage.map.get(THEME_STORAGE_KEY), 'github');
		assert.equal(storage.calls.setItem, 0);
	}
});

test('a storage that refuses (a full quota) says failed; no storage says unavailable; neither throws', () => {
	assert.equal(writeThemeChoice('dracula', { storage: throwingStorage() }), THEME_WRITE_RESULTS.failed);
	assert.equal(writeThemeChoice('dracula', { storage: null }), THEME_WRITE_RESULTS.unavailable);
});

test("another tab's write of our key gives its family", () => {
	const storage = fakeStorage();
	const event = { key: THEME_STORAGE_KEY, newValue: 'solarized', oldValue: null, storageArea: storage };
	assert.equal(familyFromStorageEvent(event, storage), 'solarized');
});

test('an event without storageArea (some fakes, old browsers) is read by its key alone', () => {
	assert.equal(familyFromStorageEvent({ key: THEME_STORAGE_KEY, newValue: 'monokai' }, fakeStorage()), 'monokai');
	assert.equal(familyFromStorageEvent({ key: THEME_STORAGE_KEY, newValue: 'monokai' }, null), 'monokai');
});

test('another tab removing our key, or writing an unusable value, gives the default', () => {
	const storage = fakeStorage();
	assert.equal(familyFromStorageEvent({ key: THEME_STORAGE_KEY, newValue: null, storageArea: storage }, storage), DEFAULT_FAMILY);
	assert.equal(familyFromStorageEvent({ key: THEME_STORAGE_KEY, newValue: 'nonsense', storageArea: storage }, storage), DEFAULT_FAMILY);
});

test('the whole storage cleared (key null: "clear site data") gives the default', () => {
	const storage = fakeStorage();
	assert.equal(familyFromStorageEvent({ key: null, newValue: null, storageArea: storage }, storage), DEFAULT_FAMILY);
});

test('an event about another key, or from sessionStorage, is not about the theme (null)', () => {
	const local = fakeStorage();
	const session = fakeStorage();
	assert.equal(familyFromStorageEvent({ key: 'code-editor:draft:v1|/|-|python|811c9dc5', newValue: 'x', storageArea: local }, local), null);
	assert.equal(familyFromStorageEvent({ key: THEME_STORAGE_KEY, newValue: 'github', storageArea: session }, local), null);
	assert.equal(familyFromStorageEvent({ key: null, newValue: null, storageArea: session }, local), null);
	assert.equal(familyFromStorageEvent(null, local), null);
	assert.equal(familyFromStorageEvent(undefined, local), null);
});
