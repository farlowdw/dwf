/**
 * useStaticStores.test.js — the static view's stores hook (useStaticStores.js), run in node
 * through reactHookShim.js (React's hooks as plain calls) with staticViewFakes.js standing in
 * for staticCodeStore.js (its own test covers the store):
 *   - one store per language, made on its first show with the restored draft (or the snippet)
 *     and the author's folds (none over a restored draft), kept across switches;
 *   - reset(lang): the snippet as the text, then the author's folds — whatever the drafts say;
 *   - foldsFor delegates to the latest drafts object (the hook reads it through a ref).
 * Run with `npm run test:shared`.
 * To change it: a new rule of ../useStaticStores.js gets a test here, through the shim.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEditorProps } from '../props.js';

register('./staticViewFakes.js', import.meta.url);
register('./reactHookShim.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const fakes = await import('./staticViewFakes.js');
const { useStaticStores } = await import('../useStaticStores.js');

const PY = 'def f():\n    return 1\n';
const JS = 'function f() {\n  return 1;\n}\n';
const SETTINGS = normalizeEditorProps({ initialCode: { python: PY, javascript: JS }, foldedRegions: { python: [[1, 2]], javascript: [[1, 3]] } });

/** useDrafts.js's shape: Python shows a restored draft (no author folds for it), JavaScript the snippet. */
function draftsOf({ pythonDraft = 'print(2)\n' } = {}) {
	return {
		startingCode: (lang) => (lang === 'python' ? pythonDraft : SETTINGS.snippets.code[lang]),
		foldsFor: (lang) => (lang === 'python' ? [] : (SETTINGS.foldedRegions[lang] ?? [])),
	};
}

test('one store per language, made on its first show with the starting code and folds, kept across switches', () => {
	const before = fakes.createdStores.length;
	const hook = renderHook(() => useStaticStores(SETTINGS, draftsOf()));
	const python = hook.current.storeFor('python');
	assert.equal(fakes.createdStores.length, before + 1);
	assert.deepEqual(python.config, { text: 'print(2)\n', foldRegions: [], lineKinds: {} }, 'the restored draft, without the author\'s folds');
	assert.equal(hook.current.storeFor('python'), python, 'the same store on the next show');
	const javascript = hook.current.storeFor('javascript');
	assert.deepEqual(javascript.config, { text: JS, foldRegions: [[1, 3]], lineKinds: {} }, "the snippet and the author's folds");
	assert.notEqual(javascript, python);
	assert.equal(hook.current.storeFor('python'), python, 'a switch back finds the same store');
	assert.equal(fakes.createdStores.length, before + 2, 'two stores in all');
	hook.unmount();
});

test("reset(lang): the snippet as the text, then the author's folds (the store drops the old folds and marks with the text)", () => {
	const hook = renderHook(() => useStaticStores(SETTINGS, draftsOf()));
	const python = hook.current.storeFor('python');
	hook.current.reset('python');
	assert.deepEqual(python.calls, [
		['setText', PY],
		['setFolds', [[1, 2]]],
	]);
	assert.equal(python.getSnapshot().text, PY);
	assert.deepEqual(python.getSnapshot().folds, [{ start: 1, end: 2, open: false }]);
	const javascript = hook.current.storeFor('javascript');
	hook.current.reset('javascript');
	assert.deepEqual(javascript.calls.at(-1), ['setFolds', [[1, 3]]]);
	hook.unmount();
});

test('reset of a language the box has not shown yet makes its store first', () => {
	const before = fakes.createdStores.length;
	const hook = renderHook(() => useStaticStores(SETTINGS, draftsOf()));
	hook.current.reset('javascript');
	assert.equal(fakes.createdStores.length, before + 1);
	assert.deepEqual(fakes.createdStores.at(-1).calls, [
		['setText', JS],
		['setFolds', [[1, 3]]],
	]);
	hook.unmount();
});

test('foldsFor reads the latest drafts object (a new one every render of the shell)', () => {
	let drafts = draftsOf();
	const hook = renderHook(() => useStaticStores(SETTINGS, drafts));
	assert.deepEqual(hook.current.foldsFor('python'), [], 'a restored draft: no folds');
	drafts = { ...draftsOf(), foldsFor: () => [[1, 2]] };
	assert.deepEqual(hook.current.foldsFor('python'), [[1, 2]], 'the next render\'s drafts');
	hook.unmount();
});
