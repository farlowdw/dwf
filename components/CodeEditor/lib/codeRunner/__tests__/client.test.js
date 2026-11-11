/**
 * client.test.js — the browser's requests (../client.js), driven by a fake fetch that answers
 * with real Response objects: the runtimes list (cleaned, shared by every caller, a failure
 * forgotten, never a rejection) and one run (the request sent, every way it can fail, the console
 * note of a failed run, Stop before and during the wait). Run with `npm run test:shared`.
 * To change it: a new request or way to fail in ../client.js gets a test here, with the fake fetch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EXECUTE_URL, MESSAGE_ABORTED, RUNTIMES_URL, executeCode, fetchRuntimes, resetRuntimesCache } from '../client.js';
import { RunError } from '../errors.js';
import { buildExecuteRequest } from '../request.js';

const JSON_TYPE = 'application/json; charset=utf-8';

/** Piston's runtimes as the function passes them on. */
const RUNTIMES = [
	{ language: 'python', version: '3.12.0', aliases: ['py', 'py3', 'python3', 'python3.12'], runtime: null },
	{ language: 'javascript', version: '20.11.1', aliases: ['js'], runtime: 'node' },
];

/** A Piston answer to a run. */
const RUN_ANSWER = {
	run: { signal: null, stdout: '3.12.0\n', stderr: '', code: 0, output: '3.12.0\n', memory: 14412000, message: null, status: null, cpu_time: 52, wall_time: 113 },
	language: 'python',
	version: '3.12.0',
};

/** A real Response with a JSON body. */
function jsonResponse(status, value) {
	return new Response(JSON.stringify(value), { status, headers: { 'content-type': JSON_TYPE } });
}

/** A real Response with a text body. */
function textResponse(status, text, contentType = 'text/plain') {
	return new Response(text, { status, headers: { 'content-type': contentType } });
}

/**
 * A fake fetch: `answer(url, init)` returns a Response (or throws / rejects). `calls` records
 * every request.
 */
function fakeFetch(answer) {
	const calls = [];
	const fetchImpl = async (url, init = {}) => {
		calls.push({ url, init });
		return answer(url, init);
	};
	return { fetchImpl, calls };
}

/** A fetch that never answers on its own, but rejects with an AbortError when its signal aborts (like the browser's). */
function hangingFetch() {
	const calls = [];
	const fetchImpl = (url, init = {}) => {
		calls.push({ url, init });
		return new Promise((resolve, reject) => {
			init.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
		});
	};
	return { fetchImpl, calls };
}

/** Assert that `promise` rejects with a RunError of `kind`; returns the error. */
async function rejectsWith(promise, kind) {
	let caught = null;
	try {
		await promise;
	} catch (error) {
		caught = error;
	}
	assert.ok(caught instanceof RunError, `expected a RunError, got ${caught}`);
	assert.equal(caught.kind, kind, caught.message);
	return caught;
}

test.beforeEach(() => resetRuntimesCache());

test('the URLs are the two functions', () => {
	assert.equal(EXECUTE_URL, '/.netlify/functions/execute');
	assert.equal(RUNTIMES_URL, '/.netlify/functions/runtimes');
});

test('fetchRuntimes: GETs the runtimes function asking for JSON, and returns its list', async () => {
	const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, RUNTIMES));
	const result = await fetchRuntimes({ fetchImpl });
	assert.deepEqual(result, { runtimes: RUNTIMES, error: null });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, RUNTIMES_URL);
	assert.equal(calls[0].init.method, 'GET');
	assert.equal(calls[0].init.headers.accept, 'application/json');
});

test('fetchRuntimes: cleans each entry and drops broken ones', async () => {
	const raw = [
		{ language: 'python', version: '3.12.0', aliases: ['py', 7, null], runtime: '', extra: 'dropped' },
		{ language: 'c++', version: '10.2.0', runtime: 'gcc' },
		{ language: 'python' },
		null,
		'python',
	];
	const { fetchImpl } = fakeFetch(() => jsonResponse(200, raw));
	const { runtimes, error } = await fetchRuntimes({ fetchImpl });
	assert.equal(error, null);
	assert.deepEqual(runtimes, [
		{ language: 'python', version: '3.12.0', aliases: ['py'], runtime: null },
		{ language: 'c++', version: '10.2.0', aliases: [], runtime: 'gcc' },
	]);
});

test('fetchRuntimes: one request per page load, shared by every caller', async () => {
	const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, RUNTIMES));
	const [first, second] = await Promise.all([fetchRuntimes({ fetchImpl }), fetchRuntimes({ fetchImpl })]);
	const third = await fetchRuntimes({ fetchImpl });
	assert.equal(calls.length, 1, 'concurrent and later callers share the first request');
	assert.equal(first, second);
	assert.equal(first, third);
});

test("fetchRuntimes: a site's own URL (the plugin's runtimesUrl option) is fetched, and cached apart from the default", async () => {
	const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, RUNTIMES));
	const elsewhere = '/api/runtimes';
	await fetchRuntimes({ fetchImpl, url: elsewhere });
	await fetchRuntimes({ fetchImpl, url: elsewhere });
	assert.equal(calls.length, 1, 'one request per URL');
	assert.equal(calls[0].url, elsewhere);
	await fetchRuntimes({ fetchImpl });
	assert.equal(calls.length, 2, 'the default URL is another cache entry');
	assert.equal(calls[1].url, RUNTIMES_URL);
	resetRuntimesCache();
	await fetchRuntimes({ fetchImpl, url: elsewhere });
	assert.equal(calls.length, 3, 'resetRuntimesCache forgets every URL');
});

test('fetchRuntimes: a failure is not remembered; the next call asks again', async () => {
	let answers = 0;
	const { fetchImpl, calls } = fakeFetch(() => {
		answers += 1;
		return answers === 1 ? textResponse(503, '') : jsonResponse(200, RUNTIMES);
	});
	const failed = await fetchRuntimes({ fetchImpl });
	assert.deepEqual(failed.runtimes, []);
	assert.equal(failed.error.kind, 'upstream');
	assert.equal(failed.error.status, 503);
	const retried = await fetchRuntimes({ fetchImpl });
	assert.deepEqual(retried, { runtimes: RUNTIMES, error: null });
	await fetchRuntimes({ fetchImpl });
	assert.equal(calls.length, 2, 'the success is remembered');
});

test('fetchRuntimes: concurrent callers of a failing request share its error', async () => {
	const { fetchImpl, calls } = fakeFetch(() => textResponse(404, '<html>Not found</html>', 'text/html'));
	const [first, second] = await Promise.all([fetchRuntimes({ fetchImpl }), fetchRuntimes({ fetchImpl })]);
	assert.equal(calls.length, 1);
	assert.equal(first.error.kind, 'no-function', 'npm start');
	assert.equal(second.error, first.error);
});

test('fetchRuntimes: never rejects (no network, a broken answer, no fetch at all)', async () => {
	const offline = await fetchRuntimes({ fetchImpl: fakeFetch(() => { throw new TypeError('Failed to fetch'); }).fetchImpl });
	assert.deepEqual(offline.runtimes, []);
	assert.equal(offline.error.kind, 'network');
	assert.match(offline.error.message, /Failed to fetch/);

	resetRuntimesCache();
	const notJson = await fetchRuntimes({ fetchImpl: fakeFetch(() => textResponse(200, '<html>login</html>', 'text/html')).fetchImpl });
	assert.equal(notJson.error.kind, 'upstream');
	assert.match(notJson.error.message, /text\/html/);

	resetRuntimesCache();
	const notAList = await fetchRuntimes({ fetchImpl: fakeFetch(() => jsonResponse(200, { python: '3.12.0' })).fetchImpl });
	assert.equal(notAList.error.kind, 'upstream');
	assert.deepEqual(notAList.runtimes, []);

	resetRuntimesCache();
	const broken = await fetchRuntimes({ fetchImpl: fakeFetch(() => undefined).fetchImpl });
	assert.deepEqual(broken.runtimes, []);
	assert.ok(broken.error instanceof RunError, 'a response that is not one');

	resetRuntimesCache();
	const savedFetch = globalThis.fetch;
	globalThis.fetch = undefined;
	try {
		const noFetch = await fetchRuntimes();
		assert.equal(noFetch.error.kind, 'network');
	} finally {
		globalThis.fetch = savedFetch;
	}
});

test("fetchRuntimes: the function's errors through explainHttpError", async () => {
	const statuses = { 401: 'wall', 403: 'refused', 500: 'config', 504: 'upstream' };
	for (const [status, kind] of Object.entries(statuses)) {
		resetRuntimesCache();
		const body = status === '500' ? { message: 'Missing server configuration (PISTON_BASE_URL / PISTON_PROXY_SECRET).' } : { message: 'x' };
		const { error } = await fetchRuntimes({ fetchImpl: fakeFetch(() => jsonResponse(Number(status), body)).fetchImpl });
		assert.equal(error.kind, kind, status);
		assert.equal(error.status, Number(status));
	}
});

test('fetchRuntimes: uses the global fetch when none is passed', async () => {
	const savedFetch = globalThis.fetch;
	const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, RUNTIMES));
	globalThis.fetch = fetchImpl;
	try {
		const { runtimes } = await fetchRuntimes();
		assert.deepEqual(runtimes, RUNTIMES);
		assert.equal(calls.length, 1);
	} finally {
		globalThis.fetch = savedFetch;
	}
});

test('executeCode: POSTs the payload as JSON and resolves with Piston\'s answer', async () => {
	const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, RUN_ANSWER));
	const payload = buildExecuteRequest({ language: 'python', version: '3.12.0', code: 'import sys\nprint(sys.version.split()[0])' });
	const answer = await executeCode(payload, { fetchImpl });
	assert.deepEqual(answer, RUN_ANSWER);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, EXECUTE_URL);
	assert.equal(calls[0].init.method, 'POST');
	assert.equal(calls[0].init.headers['content-type'], 'application/json', 'the function refuses any other type (415)');
	assert.equal(calls[0].init.headers.accept, 'application/json');
	assert.deepEqual(JSON.parse(calls[0].init.body), payload);
});

test("executeCode: a site's own URL (the plugin's executeUrl option) is POSTed to; the default otherwise", async () => {
	const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, RUN_ANSWER));
	await executeCode({}, { fetchImpl, url: 'https://runner.example.test/execute' });
	await executeCode({}, { fetchImpl });
	assert.deepEqual(calls.map((call) => call.url), ['https://runner.example.test/execute', EXECUTE_URL]);
});

test('executeCode: passes the signal on to fetch', async () => {
	const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, RUN_ANSWER));
	const controller = new AbortController();
	await executeCode({}, { fetchImpl, signal: controller.signal });
	assert.equal(calls[0].init.signal, controller.signal);
});

test('executeCode: every non-2xx answer is a RunError from explainHttpError', async (t) => {
	t.mock.method(console, 'warn', () => {});
	const cases = [
		[textResponse(404, '<!DOCTYPE html><html>Cannot POST</html>', 'text/html'), 'no-function'],
		[textResponse(401, '', 'text/html'), 'wall'],
		[jsonResponse(403, { message: 'Forbidden' }), 'refused'],
		[jsonResponse(400, { message: 'python-3.10.0 runtime is unknown' }), 'bad-request'],
		[jsonResponse(413, { message: 'Payload too large' }), 'too-large'],
		[jsonResponse(500, { message: 'Missing server configuration (PISTON_BASE_URL / PISTON_PROXY_SECRET).' }), 'config'],
		[jsonResponse(502, { message: 'Could not reach the Piston server.' }), 'upstream'],
		[textResponse(503, ''), 'upstream'],
		[jsonResponse(504, { message: 'The code runner did not answer within 25 s.' }), 'upstream'],
	];
	for (const [response, kind] of cases) {
		const error = await rejectsWith(executeCode({}, { fetchImpl: async () => response }), kind);
		assert.equal(error.status, response.status);
	}
	const unknownRuntime = await rejectsWith(executeCode({}, { fetchImpl: async () => jsonResponse(400, { message: 'python-3.10.0 runtime is unknown' }) }), 'bad-request');
	assert.equal(unknownRuntime.message, 'python-3.10.0 runtime is unknown');
});

test("executeCode: a failed run prints its setup note with console.warn, and the reader's words hold none of it", async (t) => {
	const warned = t.mock.method(console, 'warn', () => {});
	const answer = () => jsonResponse(500, { message: 'Missing server configuration (PISTON_BASE_URL / PISTON_PROXY_SECRET).' });
	const error = await rejectsWith(executeCode({}, { fetchImpl: async () => answer() }), 'config');
	assert.equal(warned.mock.callCount(), 1);
	assert.deepEqual(warned.mock.calls[0].arguments, [`CodeEditor: ${error.setup}`]);
	assert.match(error.setup, /PISTON_BASE_URL/);
	assert.doesNotMatch(error.message, /PISTON/);
});

test('executeCode: a failure with nothing to set up prints nothing', async (t) => {
	const warned = t.mock.method(console, 'warn', () => {});
	await rejectsWith(executeCode({}, { fetchImpl: async () => jsonResponse(400, { message: 'python-3.10.0 runtime is unknown' }) }), 'bad-request');
	await rejectsWith(executeCode({}, { fetchImpl: async () => textResponse(502, '<html>Bad gateway</html>', 'text/html') }), 'upstream');
	assert.equal(warned.mock.callCount(), 0);
});

test('fetchRuntimes: a failure prints nothing: it goes out on every page with an editor, with no reader waiting', async (t) => {
	const warned = t.mock.method(console, 'warn', () => {});
	resetRuntimesCache();
	const { error } = await fetchRuntimes({ fetchImpl: async () => textResponse(404, '<html>Not found</html>', 'text/html') });
	assert.equal(error.kind, 'no-function');
	assert.notEqual(error.setup, null, 'the note is there; only a run prints it');
	assert.equal(warned.mock.callCount(), 0);
	resetRuntimesCache();
});

test('executeCode: no answer at all is a network error', async () => {
	const error = await rejectsWith(executeCode({}, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), 'network');
	assert.match(error.message, /Failed to fetch/);
	assert.equal(error.status, null);
});

test('executeCode: a 200 that is not a JSON object is an upstream error', async () => {
	await rejectsWith(executeCode({}, { fetchImpl: async () => textResponse(200, '<html>login</html>', 'text/html') }), 'upstream');
	await rejectsWith(executeCode({}, { fetchImpl: async () => jsonResponse(200, [1, 2]) }), 'upstream');
	await rejectsWith(executeCode({}, { fetchImpl: async () => jsonResponse(200, null) }), 'upstream');
	await rejectsWith(executeCode({}, { fetchImpl: async () => textResponse(200, '') }), 'upstream');
});

test('executeCode: a signal already aborted never sends the request', async () => {
	const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, RUN_ANSWER));
	const controller = new AbortController();
	controller.abort();
	const error = await rejectsWith(executeCode({}, { fetchImpl, signal: controller.signal }), 'aborted');
	assert.equal(error.message, MESSAGE_ABORTED);
	assert.match(error.message, /may still finish/);
	assert.equal(calls.length, 0);
});

test('executeCode: Stop while waiting rejects with "aborted"', async () => {
	const { fetchImpl, calls } = hangingFetch();
	const controller = new AbortController();
	const running = executeCode({}, { fetchImpl, signal: controller.signal });
	assert.equal(calls.length, 1);
	controller.abort();
	await rejectsWith(running, 'aborted');
});

test('executeCode: an abort while the body is read, and an answer that arrives after Stop, are "aborted"', async () => {
	const controller = new AbortController();
	const slowBody = {
		ok: true,
		status: 200,
		headers: new Headers({ 'content-type': JSON_TYPE }),
		text: () => new Promise((resolve, reject) => {
			controller.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
		}),
	};
	const reading = executeCode({}, { fetchImpl: async () => slowBody, signal: controller.signal });
	await new Promise((resolve) => setImmediate(resolve));
	controller.abort();
	await rejectsWith(reading, 'aborted');

	const late = new AbortController();
	const lateBody = {
		ok: true,
		status: 200,
		headers: new Headers({ 'content-type': JSON_TYPE }),
		text: async () => {
			late.abort();
			return JSON.stringify(RUN_ANSWER);
		},
	};
	await rejectsWith(executeCode({}, { fetchImpl: async () => lateBody, signal: late.signal }), 'aborted');
});

test('executeCode: an AbortError from fetch is "aborted" even without our signal', async () => {
	const fetchImpl = async () => {
		throw new DOMException('aborted', 'AbortError');
	};
	await rejectsWith(executeCode({}, { fetchImpl }), 'aborted');
});
