/**
 * printRefresh.test.js — the printout's refresh (../usePrintRefresh.js), through the REAL hook
 * driven by ./reactHookShim.js (no renderer, no DOM: a fake window and a fake node):
 *   - the mount adds ONE `beforeprint` listener to the window; the unmount removes that same one;
 *   - the event writes getCode()'s text into the node's textContent — the LATEST getCode of any
 *     render, with no second listener — and nothing without a node, a function or a string (the
 *     initial text then prints);
 *   - no window (a server render) or one without addEventListener: nothing, and no throw;
 *   - refreshPrintText alone: the same rules as plain calls, with its answer.
 * The component around it (PrintCopy.jsx) is printCopy.test.js's. Run with `npm run test:shared`.
 * To change it: a new rule of ../usePrintRefresh.js gets a test here, through the shim.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./reactHookShim.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { PRINT_EVENT, refreshPrintText, usePrintRefresh } = await import('../usePrintRefresh.js');

/** A window that remembers its listeners: `added` / `removed` ([type, fn]) and `fire(type)` calls the ones still on. */
function fakeWindow() {
	const listeners = new Map();
	return {
		added: [],
		removed: [],
		addEventListener(type, fn) {
			this.added.push([type, fn]);
			listeners.set(fn, type);
		},
		removeEventListener(type, fn) {
			this.removed.push([type, fn]);
			listeners.delete(fn);
		},
		fire(type) {
			for (const [fn, listenerType] of listeners) if (listenerType === type) fn({ type });
		},
	};
}

/** A node with only what the hook writes. */
function fakeNode(text = 'initial') {
	return { textContent: text };
}

test('PRINT_EVENT is the window event the browsers fire before the print preview', () => {
	assert.equal(PRINT_EVENT, 'beforeprint');
});

test('the mount adds one beforeprint listener; the event writes the current code into the node; the unmount removes that listener', () => {
	const win = fakeWindow();
	const node = fakeNode();
	const nodeRef = { current: node };
	const hook = renderHook(() => usePrintRefresh(nodeRef, () => 'print("edited")', win));
	assert.equal(win.added.length, 1, 'one listener');
	assert.equal(win.added[0][0], PRINT_EVENT);
	assert.equal(node.textContent, 'initial', 'nothing written before a print');
	win.fire(PRINT_EVENT);
	assert.equal(node.textContent, 'print("edited")', "the reader's current code");
	hook.unmount();
	assert.deepEqual(win.removed, [win.added[0]], 'the same listener, removed');
	win.fire(PRINT_EVENT);
	assert.equal(node.textContent, 'print("edited")', 'a print after the unmount writes nothing');
});

test('the latest getCode of any render is the one called, and a re-render adds no second listener', () => {
	const win = fakeWindow();
	const node = fakeNode();
	const nodeRef = { current: node };
	const view = { getCode: () => 'one' };
	const hook = renderHook(() => usePrintRefresh(nodeRef, view.getCode, win));
	view.getCode = () => 'two';
	hook.current; // a render with the new function
	win.fire(PRINT_EVENT);
	assert.equal(node.textContent, 'two');
	assert.equal(win.added.length, 1, 'still the one listener');
	hook.unmount();
});

test('nothing is written without a node (not mounted yet), without a function, or for a text that is not a string', () => {
	const win = fakeWindow();
	const node = fakeNode();
	const unmounted = renderHook(() => usePrintRefresh({ current: null }, () => 'x', win));
	assert.doesNotThrow(() => win.fire(PRINT_EVENT));
	unmounted.unmount();

	const noFunction = renderHook(() => usePrintRefresh({ current: node }, null, win));
	win.fire(PRINT_EVENT);
	assert.equal(node.textContent, 'initial', 'no getCode: the initial text prints');
	noFunction.unmount();

	const notReady = renderHook(() => usePrintRefresh({ current: node }, () => null, win));
	win.fire(PRINT_EVENT);
	assert.equal(node.textContent, 'initial', 'the editor not ready (null): the initial text prints');
	notReady.unmount();
});

test('no window (a server render) or one without addEventListener: nothing happens, nothing throws', () => {
	const node = fakeNode();
	assert.doesNotThrow(() => renderHook(() => usePrintRefresh({ current: node }, () => 'x', undefined)).unmount(), 'the default window: none in node');
	assert.doesNotThrow(() => renderHook(() => usePrintRefresh({ current: node }, () => 'x', null)).unmount());
	assert.doesNotThrow(() => renderHook(() => usePrintRefresh({ current: node }, () => 'x', {})).unmount());
	assert.equal(node.textContent, 'initial');
});

test('refreshPrintText: writes a string and says so; false (and no write) for no node, no function or no string', () => {
	const node = fakeNode();
	assert.equal(refreshPrintText(node, () => 'a\nb'), true);
	assert.equal(node.textContent, 'a\nb');
	assert.equal(refreshPrintText(node, () => ''), true, 'an emptied editor prints empty');
	assert.equal(node.textContent, '');
	assert.equal(refreshPrintText(null, () => 'x'), false);
	assert.equal(refreshPrintText(node, null), false);
	assert.equal(refreshPrintText(node, () => undefined), false);
	assert.equal(refreshPrintText(node, () => 42), false);
	assert.equal(node.textContent, '', 'untouched by the refused calls');
});
