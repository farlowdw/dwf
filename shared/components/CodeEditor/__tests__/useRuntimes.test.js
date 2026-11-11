/**
 * useRuntimes.test.js — the runtimes hook (../useRuntimes.js) driven through ./reactHookShim.js
 * (no renderer) with a fake fetch: it starts loading, then holds the library's answer; the
 * site's runtimes URL (the monaco-editor plugin's option, handed in by CodeEditorClient.jsx)
 * is what it asks, and no URL means the library's default. Run with `npm run test:shared`.
 * To change it: a new state of ../useRuntimes.js gets a test here, with the fake fetch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./jsxHooks.js', import.meta.url);
register('./reactHookShim.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { useRuntimes } = await import('../useRuntimes.js');
const { RUNTIMES_URL, resetRuntimesCache } = await import('../lib/codeRunner/client.js');
const { RUNTIMES_LOADING, RUNTIMES_READY } = await import('../runtimeChoice.js');

/** One installed runtime, as the function lists them. */
const RUNTIMES = [{ language: 'python', version: '3.12.0', aliases: ['py'] }];

/** Replace globalThis.fetch for one test with one that answers RUNTIMES and records each URL. */
function fakeFetch(t) {
	const urls = [];
	const original = globalThis.fetch;
	globalThis.fetch = (url) => {
		urls.push(url);
		return Promise.resolve(new Response(JSON.stringify(RUNTIMES), { status: 200, headers: { 'content-type': 'application/json' } }));
	};
	t.after(() => {
		globalThis.fetch = original;
		resetRuntimesCache();
	});
	return urls;
}

/** Let the fetch and its handlers settle. */
async function settle() {
	for (let round = 0; round < 10; round += 1) await Promise.resolve();
	await new Promise((resolve) => setImmediate(resolve));
}

test("useRuntimes: loading first, then the library's list; the site's URL is asked, the default without one", async (t) => {
	const urls = fakeFetch(t);
	const hook = renderHook(() => useRuntimes('/api/runtimes'));
	assert.equal(hook.current.status, RUNTIMES_LOADING);
	await settle();
	assert.equal(hook.current.status, RUNTIMES_READY);
	assert.equal(hook.current.runtimes.length, 1);
	assert.equal(hook.current.runtimes[0].language, 'python');
	const byDefault = renderHook(() => useRuntimes(undefined));
	await settle();
	assert.equal(byDefault.current.status, RUNTIMES_READY);
	assert.deepEqual(urls, ['/api/runtimes', RUNTIMES_URL]);
	hook.unmount();
	byDefault.unmount();
});
