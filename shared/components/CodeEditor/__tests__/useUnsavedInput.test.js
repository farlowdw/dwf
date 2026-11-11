/**
 * useUnsavedInput.test.js — typed program input holds a site's after-deploy reload
 * (../useUnsavedInput.js), through the REAL hook driven by ./reactHookShim.js (no renderer) and
 * the real registry (../unsavedWork.js):
 *   - the page's own input holds nothing; typed input that differs does, with or without focus;
 *   - the hold ends when the field is back at the page's value, and when the editor unmounts;
 *   - it is a holder of its own: the code's flag and another editor's are untouched;
 *   - the editor calls the hook with its stdin and the page's (CodeEditorClient.jsx, read as text:
 *     the editor itself needs a browser).
 * Run with `npm run test:shared`.
 * To change it: another typed field the editor holds gets its call checked here.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

register('./reactHookShim.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { hasUnsavedWork, resetUnsavedWork, setUnsavedWork } = await import('../unsavedWork.js');
const { useUnsavedInput } = await import('../useUnsavedInput.js');

/** The hook as the editor calls it: `field.value` is what the field holds now (change it, then read `current`). */
function inputHook(field, pageValue) {
	return renderHook(() => useUnsavedInput(field.value, pageValue));
}

test("the page's own input holds nothing; typed input holds the reload until the field is back at the page's value", () => {
	resetUnsavedWork();
	const field = { value: '' };
	const hook = inputHook(field, '');
	assert.equal(hasUnsavedWork(), false, 'nothing typed');
	field.value = '3 4\n';
	hook.current;
	assert.equal(hasUnsavedWork(), true, 'typed input');
	hook.current;
	assert.equal(hasUnsavedWork(), true, 'and it stays across renders');
	field.value = '';
	hook.current;
	assert.equal(hasUnsavedWork(), false, 'emptied again');
	hook.unmount();
});

test('a page that gives input: only a change of it counts', () => {
	resetUnsavedWork();
	const field = { value: '1 2\n' };
	const hook = inputHook(field, '1 2\n');
	assert.equal(hasUnsavedWork(), false);
	field.value = '1 2\n5';
	hook.current;
	assert.equal(hasUnsavedWork(), true);
	field.value = '1 2\n';
	hook.current;
	assert.equal(hasUnsavedWork(), false);
	hook.unmount();
});

test('an editor that unmounts with typed input lets go; the code\'s flag and another editor\'s are not its own', () => {
	resetUnsavedWork();
	const code = {};
	const first = inputHook({ value: 'typed' }, '');
	const second = inputHook({ value: 'typed too' }, '');
	first.unmount();
	assert.equal(hasUnsavedWork(), true, 'the second editor still holds input');
	second.unmount();
	assert.equal(hasUnsavedWork(), false);
	setUnsavedWork(code, true);
	const third = inputHook({ value: 'typed' }, '');
	third.unmount();
	assert.equal(hasUnsavedWork(), true, 'edited code is still held');
	setUnsavedWork(code, false);
	assert.equal(hasUnsavedWork(), false);
});

test('the editor hands its program input to the hook, with the page\'s own', () => {
	const source = readFileSync(new URL('../CodeEditorClient.jsx', import.meta.url), 'utf8');
	assert.match(source, /import \{ useUnsavedInput \} from '\.\/useUnsavedInput\.js';/);
	assert.match(source, /^\tuseUnsavedInput\(stdin, settings\.stdin\);/m);
});
