/**
 * useDrafts.test.js — the `saveDraft` hook itself (../useDrafts.js), the real hook driven through
 * ./reactHookShim.js (no renderer), with '@docusaurus/router' answering a fixed page path and a
 * fake `window` (localStorage, pagehide, visibilitychange) standing in for the browser:
 *   - a stored draft is restored at mount (the notice's set, its code, no author folds), and
 *     Discard takes it out of the set on the next render, with the folds back at once;
 *   - a waiting save is written when the editor unmounts, and the page-hide listeners go;
 *   - a waiting save is written when the page is hidden (pagehide, visibilitychange);
 *   - without `saveDraft`: no listener, nothing restored, nothing written.
 * The rules themselves: draftSession.test.js. Run with `npm run test:shared`.
 * To change it: a new effect of ../useDrafts.js gets a test here; a new rule of saving goes in
 * draftSession.test.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

/** The page's path useLocation() answers in these tests. */
const PATH = '/site-guide';

/** A module hook: '@docusaurus/router' becomes a useLocation() that answers PATH. */
const ROUTER_STUB = `export function useLocation() { return { pathname: ${JSON.stringify(PATH)} }; }`;
const ROUTER_HOOK = [
	'export async function resolve(specifier, context, nextResolve) {',
	`	if (specifier === '@docusaurus/router') return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(ROUTER_STUB)}`)}, shortCircuit: true };`,
	'	return nextResolve(specifier, context);',
	'}',
].join('\n');

register('./jsxHooks.js', import.meta.url);
register('./reactHookShim.js', import.meta.url);
register(`data:text/javascript,${encodeURIComponent(ROUTER_HOOK)}`);

const { renderHook } = await import('./reactHookShim.js');
const { useDrafts } = await import('../useDrafts.js');
const { draftKey } = await import('../drafts.js');
const { normalizeEditorProps } = await import('../props.js');

const PYTHON = 'def two_sum(nums, target):\n    pass\n';
const JAVASCRIPT = 'function twoSum(nums, target) {\n}\n';

/** localStorage over a Map (only what drafts.js uses). */
function fakeStorage(entries = {}) {
	const map = new Map(Object.entries(entries));
	return {
		map,
		get length() {
			return map.size;
		},
		key: (index) => [...map.keys()][index] ?? null,
		getItem: (key) => (map.has(key) ? map.get(key) : null),
		setItem: (key, value) => map.set(key, String(value)),
		removeItem: (key) => map.delete(key),
	};
}

/** An event target that keeps its listeners: { addEventListener, removeEventListener, fire(type), count() }. */
function eventTarget(extra = {}) {
	const listeners = new Map();
	return {
		...extra,
		addEventListener(type, listener) {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type).add(listener);
		},
		removeEventListener(type, listener) {
			listeners.get(type)?.delete(listener);
		},
		fire(type) {
			for (const listener of listeners.get(type) ?? []) listener();
		},
		count() {
			let total = 0;
			for (const set of listeners.values()) total += set.size;
			return total;
		},
	};
}

/** Puts a fake `window` (with `storage` as its localStorage) on globalThis for `run`, then takes it away. */
async function withWindow(storage, run) {
	const document = eventTarget({ visibilityState: 'visible' });
	const win = eventTarget({ localStorage: storage, document });
	const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
	globalThis.window = win;
	try {
		await run(win);
	} finally {
		if (before) Object.defineProperty(globalThis, 'window', before);
		else delete globalThis.window;
	}
}

/** Settings from the real props.js: two languages, folds in both, an id. */
function settingsWith(props) {
	return normalizeEditorProps({ id: 'two-sum', initialCode: { python: PYTHON, javascript: JAVASCRIPT }, foldedRegions: { python: [[1, 2]], javascript: [[1, 2]] }, ...props });
}

/** The storage key of `language`'s draft on PATH. */
function keyOf(settings, language) {
	return draftKey({ path: PATH, editorKey: settings.id, language, snippet: settings.snippets.code[language] });
}

/** The code of `language`'s stored draft, or null. */
function storedCode(storage, settings, language) {
	const raw = storage.map.get(keyOf(settings, language));
	return raw === undefined ? null : JSON.parse(raw).code;
}

test('a stored draft is restored at mount; Discard takes it out of the set on the next render, folds back at once', async () => {
	const settings = settingsWith({ saveDraft: true });
	const storage = fakeStorage({ [keyOf(settings, 'python')]: JSON.stringify({ code: 'print(1)\n', savedAt: 1 }) });
	await withWindow(storage, async () => {
		const hook = renderHook(() => useDrafts(settings));
		const first = hook.current;
		assert.deepEqual([...first.restored], ['python'], 'the notice shows for Python');
		assert.equal(first.startingCode('python'), 'print(1)\n');
		assert.equal(first.startingCode('javascript'), JAVASCRIPT);
		assert.deepEqual(first.foldsFor('python'), [], 'no author folds over the restored draft');
		first.discard('python');
		assert.deepEqual(first.foldsFor('python'), [[1, 2]], 'back at once, before React draws again (Reset folds in the same click)');
		assert.deepEqual([...hook.current.restored], [], 'the next render has no notice');
		assert.equal(storedCode(storage, settings, 'python'), null, 'the draft is gone');
		hook.unmount();
	});
});

test('a waiting save is written when the editor unmounts, and the page-hide listeners go', async () => {
	const settings = settingsWith({ saveDraft: true });
	const storage = fakeStorage();
	await withWindow(storage, async (win) => {
		const hook = renderHook(() => useDrafts(settings));
		assert.equal(win.count() + win.document.count(), 2, 'pagehide and visibilitychange');
		hook.current.save('javascript', 'console.log(2);\n');
		assert.equal(storedCode(storage, settings, 'javascript'), null, 'waiting for the delay');
		hook.unmount();
		assert.equal(storedCode(storage, settings, 'javascript'), 'console.log(2);\n');
		assert.equal(win.count() + win.document.count(), 0);
	});
});

test('a waiting save is written when the page is hidden or left', async () => {
	const settings = settingsWith({ saveDraft: true });
	const storage = fakeStorage();
	await withWindow(storage, async (win) => {
		const hook = renderHook(() => useDrafts(settings));
		hook.current.save('python', 'print(3)\n');
		win.fire('pagehide');
		assert.equal(storedCode(storage, settings, 'python'), 'print(3)\n', 'pagehide (a reload, the tab closed)');
		hook.current.save('python', 'print(4)\n');
		win.document.visibilityState = 'hidden';
		win.document.fire('visibilitychange');
		assert.equal(storedCode(storage, settings, 'python'), 'print(4)\n', 'hidden (another app on a phone)');
		hook.unmount();
	});
});

test('without saveDraft: no listener, nothing restored, nothing written', async () => {
	const settings = settingsWith({});
	const storage = fakeStorage({ [keyOf(settings, 'python')]: JSON.stringify({ code: 'print(1)\n', savedAt: 1 }) });
	await withWindow(storage, async (win) => {
		const hook = renderHook(() => useDrafts(settings));
		assert.equal(win.count() + win.document.count(), 0);
		const drafts = hook.current;
		assert.deepEqual([...drafts.restored], []);
		assert.equal(drafts.startingCode('python'), PYTHON);
		assert.deepEqual(drafts.foldsFor('python'), [[1, 2]]);
		drafts.save('python', 'print(5)\n');
		drafts.discard('python');
		hook.unmount();
		assert.equal(storedCode(storage, settings, 'python'), 'print(1)\n', 'the stored draft is left alone');
		assert.equal(storage.map.size, 1);
	});
});
