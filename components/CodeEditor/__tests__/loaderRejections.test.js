/**
 * loaderRejections.test.js — when Monaco's files fail, @monaco-editor/loader rejects every
 * loader.init() it handed out, and for each one it also leaves a copy of the failure that nothing
 * handles (its makeCancelable chains a `.then` with no rejection handler): the page's console
 * then shows "Uncaught (in promise)" once per call, though the editor already tells the reader
 * (EDITOR_ERRORS.failedToLoad). useMonacoLoader.js marks exactly those as handled:
 *   - after a failed load, an unhandledrejection whose reason IS that failure is cancelled;
 *   - any other unhandled rejection on the page is left alone;
 *   - before any failure, nothing is touched.
 * The hook runs for real through ./reactHookShim.js with ./fakeMonacoReact.js's loader set to
 * fail; the page is a plain EventTarget standing in for `window`. The same in a browser: the
 * review's probe counts the page's uncaught errors with Monaco's files failing. Run with
 * `npm run test:shared`.
 * To change it: a new kind of failure the loader leaves behind gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./reactHookShim.js', import.meta.url);
register('./fakeMonacoReact.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { loaderFailure } = await import('./fakeMonacoReact.js');
const { useMonacoLoader } = await import('../useMonacoLoader.js');

/** A path the plugin could hand over. */
const VS_PATH = '/vendor/monaco-editor-0.55.1/vs';

/** An unhandledrejection as the browser fires it: cancelable, with the promise's reason. */
function unhandled(reason) {
	const event = new Event('unhandledrejection', { cancelable: true });
	event.reason = reason;
	return event;
}

/** Let the rejected load's handlers run. */
function settle() {
	return new Promise((resolve) => {
		setImmediate(resolve);
	});
}

test('before any failure nothing is touched; after one, only that failure\'s leftovers are marked handled', async () => {
	const page = new EventTarget();
	globalThis.window = page;
	try {
		const failure = new Error('Monaco did not load');
		const before = unhandled(failure);
		page.dispatchEvent(before);
		assert.equal(before.defaultPrevented, false, 'no failure yet: nothing is touched');

		loaderFailure.reason = failure;
		const hook = renderHook(() => useMonacoLoader(VS_PATH));
		hook.current; // eslint-disable-line no-unused-expressions -- the render whose effect calls init()
		await settle();
		assert.equal(hook.current.error, failure, 'the editor knows (it shows EDITOR_ERRORS.failedToLoad)');

		const leftover = unhandled(failure);
		page.dispatchEvent(leftover);
		assert.equal(leftover.defaultPrevented, true, "the loader's unhandled copy of the same failure is marked handled");

		const other = unhandled(new Error('something else on the page'));
		page.dispatchEvent(other);
		assert.equal(other.defaultPrevented, false, 'any other rejection is left to the console');
		const nothing = unhandled(undefined);
		page.dispatchEvent(nothing);
		assert.equal(nothing.defaultPrevented, false, 'a rejection with no reason is left alone too');
		hook.unmount();
	} finally {
		loaderFailure.reason = null;
		delete globalThis.window;
	}
});
