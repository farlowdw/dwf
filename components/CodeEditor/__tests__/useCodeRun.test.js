/**
 * useCodeRun.test.js — one editor's runs (../useCodeRun.js), the real hook driven through
 * ./reactHookShim.js (no renderer) with a fake fetch: a plain payload is sent and its answer
 * kept; Stop while a promised payload (TypeScript compiling in the browser) is still waiting
 * stops AT ONCE — `stopped`, nothing sent — and stays stopped whatever the compile comes to
 * later (a payload, or syntax errors); a compile that fails before Stop is a failed run; Stop
 * during the fetch; Clear and unmounting during a compile. Also the pure payloadUnlessStopped (whichever comes
 * first, no unhandled rejection, the listener removed). Run with `npm run test:shared`.
 * To change it: a new state of a run in ../useCodeRun.js gets a test here, through the shim and the
 * fake fetch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./jsxHooks.js', import.meta.url);
register('./reactHookShim.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { RUN_PHASES, abortedRunError, payloadUnlessStopped, useCodeRun } = await import('../useCodeRun.js');
const { BlockedRunError } = await import('../typescriptRun.js');
const { EXECUTE_URL, MESSAGE_ABORTED } = await import('../lib/codeRunner/client.js');

/** A payload as buildExecuteRequest makes one (its content does not matter to the fake fetch). */
const PAYLOAD = Object.freeze({ language: 'javascript', version: '20.11.1', files: [{ name: 'main.js', content: 'console.log("hi")' }] });

/** Piston's answer to PAYLOAD. */
const ANSWER = Object.freeze({ language: 'javascript', version: '20.11.1', run: { stdout: 'hi\n', stderr: '', output: 'hi\n', code: 0, signal: null } });

/** The longest a Stop test may take (ms): should Stop ever stop ending the wait, the test fails instead of hanging. */
const HANG_LIMIT = Object.freeze({ timeout: 5000 });

/** Let every pending promise callback run. */
function settle() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A promise and its two ends: { promise, resolve, reject }. */
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((resolveIt, rejectIt) => {
		resolve = resolveIt;
		reject = rejectIt;
	});
	return { promise, resolve, reject };
}

/** Replace globalThis.fetch for one test: answers ANSWER (or waits for the abort when `hang`); `calls` counts the requests. */
function fakeFetch(t, { hang = false } = {}) {
	const record = { calls: 0 };
	const original = globalThis.fetch;
	globalThis.fetch = (url, { signal }) => {
		record.calls += 1;
		if (!hang) return Promise.resolve(new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }));
		return new Promise((resolve, reject) => {
			signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
		});
	};
	t.after(() => {
		globalThis.fetch = original;
	});
	return record;
}

/** A syntax error that stops a TypeScript run (what compileForRun rejects with). */
function syntaxError() {
	return new BlockedRunError([{ line: 2, column: 11, endColumn: 12, message: 'Expression expected.', severity: 'error', stage: 'compile' }]);
}

// ---- payloadUnlessStopped (pure) ----

test('payloadUnlessStopped: the payload when it comes first, plain or promised', async () => {
	const controller = new AbortController();
	assert.equal(await payloadUnlessStopped(PAYLOAD, controller.signal), PAYLOAD);
	assert.equal(await payloadUnlessStopped(Promise.resolve(PAYLOAD), controller.signal), PAYLOAD);
	await assert.rejects(payloadUnlessStopped(Promise.reject(syntaxError()), controller.signal), BlockedRunError, 'a compile that fails first fails');
});

test("payloadUnlessStopped: the abort, at once, when it comes first — the 'aborted' RunError; a payload that rejects later is dropped (no unhandled rejection)", HANG_LIMIT, async () => {
	const controller = new AbortController();
	const compile = deferred();
	const waiting = payloadUnlessStopped(compile.promise, controller.signal);
	controller.abort();
	await assert.rejects(waiting, (error) => {
		assert.equal(error.kind, 'aborted');
		assert.equal(error.message, MESSAGE_ABORTED);
		return true;
	});
	compile.reject(syntaxError()); // an unhandled rejection would fail this file
	await settle();

	const never = new Promise(() => {});
	const stopped = new AbortController();
	stopped.abort();
	await assert.rejects(payloadUnlessStopped(never, stopped.signal), { kind: 'aborted' }, 'a signal aborted already: at once');
	assert.equal(abortedRunError().kind, 'aborted');
});

test('payloadUnlessStopped: the abort listener is removed once the payload came', async () => {
	const added = [];
	const removed = [];
	const signal = {
		aborted: false,
		addEventListener: (type, listener) => added.push([type, listener]),
		removeEventListener: (type, listener) => removed.push([type, listener]),
	};
	await payloadUnlessStopped(PAYLOAD, signal);
	assert.equal(added.length, 1);
	assert.deepEqual(removed, added);
});

// ---- the hook ----

test('useCodeRun: a plain payload is sent; the answer is kept', async (t) => {
	const fetched = fakeFetch(t);
	const hook = renderHook(useCodeRun);
	assert.equal(hook.current.phase, RUN_PHASES.idle);
	const done = hook.current.run(PAYLOAD);
	assert.equal(hook.current.phase, RUN_PHASES.running);
	await done;
	assert.equal(fetched.calls, 1);
	assert.equal(hook.current.phase, RUN_PHASES.done);
	assert.deepEqual(hook.current.response, ANSWER);
	assert.equal(hook.current.summary.status, 'success');
});

test("useCodeRun: the site's execute URL (the plugin's option) is what the run is sent to; none means the library's default", async (t) => {
	const urls = [];
	const original = globalThis.fetch;
	globalThis.fetch = (url) => {
		urls.push(url);
		return Promise.resolve(new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }));
	};
	t.after(() => {
		globalThis.fetch = original;
	});
	await renderHook(() => useCodeRun('/api/run')).current.run(PAYLOAD);
	await renderHook(() => useCodeRun(undefined)).current.run(PAYLOAD);
	assert.deepEqual(urls, ['/api/run', EXECUTE_URL]);
});

test('useCodeRun: Stop while TypeScript compiles stops AT ONCE; the compile that finishes later is dropped and nothing is sent', HANG_LIMIT, async (t) => {
	const fetched = fakeFetch(t);
	const hook = renderHook(useCodeRun);
	const compile = deferred();
	const done = hook.current.run(compile.promise);
	assert.equal(hook.current.phase, RUN_PHASES.running);
	hook.current.stop();
	await settle();
	assert.equal(hook.current.phase, RUN_PHASES.stopped, 'not still "running" until the compile ends');
	assert.equal(hook.current.error.message, MESSAGE_ABORTED);
	compile.resolve(PAYLOAD);
	await done;
	await settle();
	assert.equal(hook.current.phase, RUN_PHASES.stopped);
	assert.equal(fetched.calls, 0, 'the compiled payload is never sent');
});

test('useCodeRun: Stop while TypeScript compiles, then the compile finds syntax errors: still stopped, not failed', HANG_LIMIT, async (t) => {
	fakeFetch(t);
	const hook = renderHook(useCodeRun);
	const compile = deferred();
	const done = hook.current.run(compile.promise);
	hook.current.stop();
	await settle();
	assert.equal(hook.current.phase, RUN_PHASES.stopped);
	compile.reject(syntaxError());
	await done;
	await settle();
	assert.equal(hook.current.phase, RUN_PHASES.stopped, 'the syntax-error notice does not replace the stopped one');
	assert.equal(hook.current.error.kind, 'aborted');
});

test('useCodeRun: a compile that fails before any Stop is a failed run with its message', async (t) => {
	fakeFetch(t);
	const hook = renderHook(useCodeRun);
	const error = syntaxError();
	await hook.current.run(Promise.reject(error));
	assert.equal(hook.current.phase, RUN_PHASES.failed);
	assert.equal(hook.current.error, error);
});

test('useCodeRun: Stop while the code runner works stops the wait', async (t) => {
	const fetched = fakeFetch(t, { hang: true });
	const hook = renderHook(useCodeRun);
	const done = hook.current.run(PAYLOAD);
	await settle();
	assert.equal(fetched.calls, 1);
	hook.current.stop();
	await done;
	assert.equal(hook.current.phase, RUN_PHASES.stopped);
});

test('useCodeRun: Clear during a compile goes back to idle, and the late compile changes nothing', async (t) => {
	const fetched = fakeFetch(t);
	const hook = renderHook(useCodeRun);
	const compile = deferred();
	const done = hook.current.run(compile.promise);
	hook.current.clear();
	assert.equal(hook.current.phase, RUN_PHASES.idle);
	compile.resolve(PAYLOAD);
	await done;
	await settle();
	assert.equal(hook.current.phase, RUN_PHASES.idle);
	assert.equal(fetched.calls, 0);
});

test('useCodeRun: unmounting stops a waiting compile', HANG_LIMIT, async (t) => {
	const fetched = fakeFetch(t);
	const hook = renderHook(useCodeRun);
	const compile = deferred();
	const done = hook.current.run(compile.promise);
	hook.unmount();
	await settle();
	assert.equal(hook.current.phase, RUN_PHASES.stopped, 'the wait ended with the component');
	compile.resolve(PAYLOAD);
	await done;
	assert.equal(fetched.calls, 0, 'nothing sent after the unmount');
});
