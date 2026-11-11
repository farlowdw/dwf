/**
 * notServed.test.js — a site that does not serve Monaco (its monaco-editor plugin is not
 * registered): the reader reads EDITOR_ERRORS.notServed (CodeEditorClient.jsx), which says nothing
 * of the setup, and the page's author reads EDITOR_WARNINGS.notServed in the console, once per page
 * load however many editors the page holds (useMonacoLoader.js). Run with `npm run test:shared`.
 * To change it: the words are EDITOR_ERRORS.notServed and EDITOR_WARNINGS.notServed; a new case of a
 * site without Monaco gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./reactHookShim.js', import.meta.url);
register('./fakeMonacoReact.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { loaderCalls } = await import('./fakeMonacoReact.js');
const { useMonacoLoader } = await import('../useMonacoLoader.js');
const { EDITOR_ERRORS, EDITOR_WARNINGS } = await import('../messages.js');

/** A path the plugin could hand over. */
const VS_PATH = '/vendor/monaco-editor-0.55.1/vs';

/** One editor's hook, rendered once, so its effects have run. */
function mountEditor(vsPath, options) {
	const hook = renderHook(() => useMonacoLoader(vsPath, options));
	const state = hook.current;
	return { hook, state };
}

// In this order: the module remembers for the page load that it has warned.
test('with a path: Monaco loads and nothing is said', (t) => {
	const warned = t.mock.method(console, 'warn', () => {});
	const { hook } = mountEditor(VS_PATH);
	assert.equal(loaderCalls.config, 1);
	assert.equal(loaderCalls.init, 1);
	assert.equal(warned.mock.callCount(), 0);
	hook.unmount();
});

test('with no path: nothing loads, the console says why, once however many editors the page holds', (t) => {
	const warned = t.mock.method(console, 'warn', () => {});
	const before = { ...loaderCalls };
	const editors = [mountEditor(undefined), mountEditor(undefined), mountEditor(undefined, { enabled: false })];
	assert.deepEqual(loaderCalls, before, 'never the CDN the loader falls back to');
	assert.equal(warned.mock.callCount(), 1);
	assert.deepEqual(warned.mock.calls[0].arguments, [EDITOR_WARNINGS.notServed]);
	for (const { hook } of editors) hook.unmount();
});

test("the reader's words say nothing of the setup, the console's name what to do", () => {
	assert.doesNotMatch(EDITOR_ERRORS.notServed, /plugin|docusaurus|config|monaco/i);
	assert.match(EDITOR_WARNINGS.notServed, /monaco-editor/);
	assert.match(EDITOR_WARNINGS.notServed, /docusaurus\.config\.js/);
});
