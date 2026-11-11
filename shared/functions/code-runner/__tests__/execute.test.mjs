/**
 * execute.test.mjs — shared/functions/code-runner/execute.mjs: only a JSON POST is read (415 otherwise, the
 * guard against another site's form); a request is checked, cleaned (only Piston's fields,
 * within bounds, at most 100 KB as received and as forwarded) and forwarded with the secret
 * header; Piston's JSON comes back as it is (its "too large" 400 as 413, its own 400 message with
 * the secret replaced), and any other upstream error in the function's own words, its body only
 * in the log (a 400 that is not Piston's is a 502); every failure has its status and a JSON
 * { message } that names no variable or server; a memory limit under 1 MiB (Piston's "no limit") never
 * reaches the server; the secret is never echoed or logged; the timeout maxima match the editor
 * library's (shared/components/CodeEditor/lib/codeRunner/request.js > TIMEOUT_BOUNDS); the default
 * export is a modern Netlify Function (a web Request and the context in, a Response out); the
 * public-site checks are wired in the right order (a foreign origin is a 403 and a flood a 429,
 * keyed on the context's ip, both before the body is read — the rules themselves are tested in
 * origin.test.mjs / rateLimit.test.mjs); no answer ever carries a CORS header (the refused
 * preflight is the guard against other sites); the rate-limit setting is read after the cheap
 * refusals and parsed once per instance. A fake fetch stands in for the Piston server
 * (fakePiston.mjs): no network.
 * Run with `npm run test:shared`.
 * To change it: a new check of execute.mjs gets a test here, in the order the function runs them, over
 * fakePiston.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as execute from '../execute.mjs';
import { INVALID_SECRET_MESSAGE, MISSING_CONFIG_MESSAGE, PROXY_HEADER } from '../lib/piston.mjs';
import { ORIGIN_REFUSED_MESSAGE } from '../lib/origin.mjs';
import { RATE_LIMITED_MARKER, createRateLimiter, forgetRateLimitSettings } from '../lib/rateLimit.mjs';
import {
	FAKE_BASE_URL,
	FAKE_SECRET,
	SITE_HOST,
	SITE_ORIGIN,
	assertNoSecret,
	bodyOf,
	corsHeadersOf,
	fakeEnv,
	fakeFetch,
	fetchFailed,
	loggedText,
	siteHeaders,
} from './fakePiston.mjs';

const {
	handleExecute,
	validateExecuteRequest,
	MAX_BODY_BYTES,
	MAX_FORWARD_BYTES,
	MIN_TIMEOUT_MS,
	MAX_COMPILE_TIMEOUT_MS,
	MAX_RUN_TIMEOUT_MS,
	MIN_MEMORY_LIMIT_BYTES,
} = execute;

/** The function's path on the site (the editor's EXECUTE_URL). */
const EXECUTE_PATH = '/.netlify/functions/execute';

/** The editor library's request builder, beside these functions in shared/ on every site (imported dynamically). */
const LIBRARY_REQUEST_MODULE = '../../../components/CodeEditor/lib/codeRunner/request.js';

/** The 413 message (the contract with the editor: shared/components/CodeEditor/lib/codeRunner/errors.js reads the status). */
const TOO_LARGE_MESSAGE = 'The code and its input are too large to run (at most 100 KB).';

/** The 415 message. */
const WRONG_MEDIA_TYPE_MESSAGE = 'Send the request as application/json.';

/** The headers of the editor's request: the site's own page (fakePiston.mjs) sending JSON (shared/components/CodeEditor/lib/codeRunner/client.js). */
const JSON_HEADERS = Object.freeze(siteHeaders({ 'content-type': 'application/json' }));

/** Piston's answer to `import sys; print(sys.version.split()[0])` (shape verified on the server). */
const PISTON_SUCCESS = {
	run: { signal: null, stdout: '3.12.0\n', stderr: '', code: 0, output: '3.12.0\n', memory: 14412000, message: null, status: null, cpu_time: 52, wall_time: 113 },
	language: 'python',
	version: '3.12.0',
};

/** The function's words for an error status from upstream (lib/piston.mjs > upstreamStatusMessage): the status, nothing else. */
function upstreamWords(status) {
	return `The code runner's server answered ${status}.`;
}

/** A made-up host an upstream error page names, which no answer to a page may carry. */
const MARKER = 'runner-host.example.internal';

/** What tells a caller how the site is set up: a variable, the server's name, its paths. */
const SETUP_NAMES = /PISTON_|CODE_RUNNER_|piston|\/api\/v2/i;

/** The smallest valid request. */
function minimalRequest(overrides = {}) {
	return { language: 'python', version: '3.12.0', files: [{ name: 'main.py', content: 'print(1)' }], ...overrides };
}

/**
 * A JSON POST to the function the way Netlify hands it over: a web Request on the site's own
 * URL, the page's Origin and content type. `extra.headers` REPLACES the headers, `extra.site`
 * the origin the request is sent to (netlify dev, a LAN address), `extra.method` the method.
 */
function postRequest(body, extra = {}) {
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	const { headers = { ...JSON_HEADERS }, site = SITE_ORIGIN, method = 'POST' } = extra;
	return new Request(`${site}${EXECUTE_PATH}`, { method, headers, body: text });
}

/** A request without a body (a GET, an OPTIONS preflight) with these headers. */
function bodilessRequest(method, headers = {}) {
	return new Request(`${SITE_ORIGIN}${EXECUTE_PATH}`, { method, headers });
}

/** A request whose body is exactly `bytes` long, padded in its one file's content. */
function requestOfBytes(bytes, overrides = {}) {
	const empty = minimalRequest({ files: [{ content: '' }], ...overrides });
	const padding = bytes - Buffer.byteLength(JSON.stringify(empty), 'utf8');
	return { ...empty, files: [{ content: 'x'.repeat(padding) }] };
}

/** How many lines of a mocked console.error name CODE_RUNNER_RATE_LIMIT. */
function rateLimitWarnings(errorLog) {
	return loggedText(errorLog).split('\n').filter((line) => line.includes('CODE_RUNNER_RATE_LIMIT')).length;
}

test('forwards to PISTON_BASE_URL/api/v2/execute as a POST with the secret header', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.equal(fetchImpl.calls.length, 1);
	const [{ url, init }] = fetchImpl.calls;
	assert.equal(url, `${FAKE_BASE_URL}/api/v2/execute`, 'the trailing slash of the base URL is dropped');
	assert.equal(init.method, 'POST');
	assert.equal(init.headers[PROXY_HEADER], FAKE_SECRET);
	assert.equal(init.headers['content-type'], 'application/json');
	assert.deepEqual(JSON.parse(init.body), { ...minimalRequest(), stdin: '', args: [] });
});

test("passes Piston's status, body and content type through as a Response, never cached", async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS, contentType: 'application/json; charset=utf-8' });
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.ok(response instanceof Response);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
	assert.equal(response.headers.get('cache-control'), 'no-store');
	await assertNoSecret(response);
	assert.deepEqual(await bodyOf(response), PISTON_SUCCESS);
});

test("Piston's 400 for a version it lacks reaches the page as it is", async () => {
	const unknown = { message: 'python-3.10.0 runtime is unknown' };
	const fetchImpl = fakeFetch({ status: 400, body: unknown });
	const response = await handleExecute(postRequest(minimalRequest({ version: '3.10.0' })), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 400);
	assert.deepEqual(await bodyOf(response), unknown);
});

test('an upstream 401 or 404 becomes 502, so the page never mistakes it for the site', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	for (const status of [401, 404]) {
		const fetchImpl = fakeFetch({ status, body: '<html>Not here</html>', contentType: 'text/html' });
		const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 502, `upstream ${status}`);
		assert.equal((await bodyOf(response)).message, upstreamWords(status));
		assert.match(loggedText(errorLog), new RegExp(`answered ${status} for /api/v2/execute\\. Check PISTON_BASE_URL\\.`), 'the log names the variable');
	}
});

test('a 2xx that is not JSON (a wrong PISTON_BASE_URL) becomes 502; the log names the variable, the answer does not', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: '<!doctype html><p>Some other site</p>', contentType: 'text/html' });
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 502);
	const { message } = await bodyOf(response);
	assert.match(message, /not JSON/);
	assert.doesNotMatch(message, SETUP_NAMES);
	assert.match(loggedText(errorLog), /not JSON \(\/api\/v2\/execute\)\. Check PISTON_BASE_URL\. Body: <!doctype html><p>Some other site<\/p>/);
});

test('only POST: anything else is 405 with allow: POST, and nothing is forwarded', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const others = [
		bodilessRequest('GET', { ...JSON_HEADERS }),
		postRequest(minimalRequest(), { method: 'PUT' }),
		bodilessRequest('OPTIONS', { ...JSON_HEADERS }),
		postRequest(minimalRequest(), { method: 'DELETE' }),
	];
	for (const request of others) {
		const response = await handleExecute(request, { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 405, request.method);
		assert.equal(response.headers.get('allow'), 'POST');
		assert.equal(typeof (await bodyOf(response)).message, 'string');
	}
	assert.equal(fetchImpl.calls.length, 0);
});

test('only application/json: any other content type (or none) is a 415, before the body is read', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	// What another site can send without a preflight: a form (text/plain, urlencoded, multipart),
	// a no-cors fetch (text/plain;charset=UTF-8); and near misses.
	const refused = [
		undefined,
		'',
		'text/plain',
		'text/plain;charset=UTF-8',
		'application/x-www-form-urlencoded',
		'multipart/form-data; boundary=x',
		'application/jsonp',
		'application/json-patch+json',
		'text/json',
	];
	for (const contentType of refused) {
		const headers = contentType === undefined ? {} : { 'content-type': contentType };
		const response = await handleExecute(postRequest(minimalRequest(), { headers }), { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 415, String(contentType));
		assert.deepEqual(await bodyOf(response), { message: WRONG_MEDIA_TYPE_MESSAGE });
	}
	const noHeaders = await handleExecute(postRequest('{not json', { headers: {} }), { env: fakeEnv(), fetchImpl });
	assert.equal(noHeaders.status, 415, 'refused before the body is parsed (not a 400)');
	const tooBig = postRequest('x'.repeat(MAX_BODY_BYTES + 1), { headers: { 'content-type': 'text/plain' } });
	assert.equal((await handleExecute(tooBig, { env: fakeEnv(), fetchImpl })).status, 415, 'before the size check too');
	assert.equal(fetchImpl.calls.length, 0);
});

test('application/json is accepted with parameters, in any case, under any header-name case', async () => {
	const accepted = [
		{ 'content-type': 'application/json' },
		{ 'content-type': 'application/json; charset=utf-8' },
		{ 'content-type': 'Application/JSON ; charset=UTF-8' },
		{ 'Content-Type': 'application/json' },
	];
	for (const contentType of accepted) {
		const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
		const headers = siteHeaders(contentType);
		const response = await handleExecute(postRequest(minimalRequest(), { headers }), { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 200, JSON.stringify(headers));
		assert.equal(fetchImpl.calls.length, 1);
	}
});

test('a missing or blank PISTON_BASE_URL / PISTON_PROXY_SECRET is a 500 with the configuration message', async (t) => {
	t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const broken = [
		fakeEnv({ PISTON_BASE_URL: undefined }),
		fakeEnv({ PISTON_PROXY_SECRET: undefined }),
		fakeEnv({ PISTON_PROXY_SECRET: '   ' }),
		{},
	];
	for (const env of broken) {
		const response = await handleExecute(postRequest(minimalRequest()), { env, fetchImpl });
		assert.equal(response.status, 500);
		assert.deepEqual(await bodyOf(response), { message: MISSING_CONFIG_MESSAGE });
	}
	assert.equal(MISSING_CONFIG_MESSAGE, 'Missing server configuration.', 'the marker the editor reads, and no variable');
	assert.equal(fetchImpl.calls.length, 0);
});

test('the size limits: 100,000 bytes, under the 102,400 the Piston server reads', () => {
	assert.equal(MAX_BODY_BYTES, 100000);
	assert.equal(MAX_FORWARD_BYTES, 100000);
	assert.equal(execute.TOO_LARGE_MESSAGE, TOO_LARGE_MESSAGE);
});

test('a body of exactly MAX_BODY_BYTES is forwarded; one byte more is a 413', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const full = requestOfBytes(MAX_BODY_BYTES, { stdin: '', args: [] });
	const ok = await handleExecute(postRequest(full), { env: fakeEnv(), fetchImpl });
	assert.equal(ok.status, 200);
	assert.equal(Buffer.byteLength(fetchImpl.calls[0].init.body, 'utf8'), MAX_BODY_BYTES, 'forwarded as it came');

	const over = requestOfBytes(MAX_BODY_BYTES + 1, { stdin: '', args: [] });
	const refused = await handleExecute(postRequest(over), { env: fakeEnv(), fetchImpl });
	assert.equal(refused.status, 413);
	assert.deepEqual(await bodyOf(refused), { message: TOO_LARGE_MESSAGE });
	assert.equal(fetchImpl.calls.length, 1, 'the second request was never forwarded');
});

test('the size limit counts the bytes received, not characters', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	// "é" is 2 bytes in UTF-8: about 50,000 characters but over 100,000 bytes.
	const content = 'é'.repeat(MAX_BODY_BYTES / 2);
	const text = JSON.stringify(minimalRequest({ files: [{ content }] }));
	assert.ok(text.length < MAX_BODY_BYTES * 0.6, 'few characters…');
	const response = await handleExecute(postRequest(text), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 413, '…but too many bytes');
	assert.deepEqual(await bodyOf(response), { message: TOO_LARGE_MESSAGE });
	assert.equal(fetchImpl.calls.length, 0);
});

test('the FORWARDED JSON is measured too: the defaults added to a full body make it a 413', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	// No version, stdin or args: the clean request adds "version":"*","stdin":"","args":[].
	const bare = requestOfBytes(MAX_BODY_BYTES - 5, { version: undefined });
	const text = JSON.stringify(bare);
	assert.ok(Buffer.byteLength(text, 'utf8') <= MAX_BODY_BYTES, 'the body itself is within the limit');
	const response = await handleExecute(postRequest(text), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 413);
	assert.deepEqual(await bodyOf(response), { message: TOO_LARGE_MESSAGE });
	assert.equal(fetchImpl.calls.length, 0);
});

test("Piston's own 400 PayloadTooLargeError (no message) becomes the same 413", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	// The shape a real server answered for a 105 KB body (2026-10-24).
	const refusal = { stack: 'PayloadTooLargeError: request entity too large\n    at readStream (/piston_api/node_modules/raw-body/index.js:156:17)' };
	const fetchImpl = fakeFetch({ status: 400, body: refusal });
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 413);
	assert.deepEqual(await bodyOf(response), { message: TOO_LARGE_MESSAGE });
	assert.match(loggedText(errorLog), /PayloadTooLargeError/);
});

test('a body that is not JSON (or no body at all) is a 400, and nothing is forwarded', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const bodies = [postRequest('{not json'), postRequest(''), new Request(`${SITE_ORIGIN}${EXECUTE_PATH}`, { method: 'POST', headers: { ...JSON_HEADERS } })];
	for (const request of bodies) {
		const response = await handleExecute(request, { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 400);
		assert.match((await bodyOf(response)).message, /not valid JSON/);
	}
	assert.equal(fetchImpl.calls.length, 0);
});

test('a request that breaks a rule is a 400 with the rule, and nothing is forwarded', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const response = await handleExecute(postRequest(minimalRequest({ files: [] })), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 400);
	assert.match((await bodyOf(response)).message, /"files"/);
	assert.equal(fetchImpl.calls.length, 0);
});

test('validateExecuteRequest fills the defaults and keeps ONLY the whitelisted fields', () => {
	const { request, error } = validateExecuteRequest({
		language: '  python ',
		files: [{ name: 'main.py', content: 'print(1)', encoding: 'base64', extra: true }],
		run_timeout: 3000,
		compile_timeout: 10000,
		compile_memory_limit: 300000000,
		run_memory_limit: 200000000,
		unknown_field: 'dropped',
		__proto__: { polluted: true },
	});
	assert.equal(error, null);
	assert.deepEqual(request, {
		language: 'python',
		version: '*',
		files: [{ name: 'main.py', content: 'print(1)' }],
		stdin: '',
		args: [],
		compile_timeout: 10000,
		run_timeout: 3000,
		compile_memory_limit: 300000000,
		run_memory_limit: 200000000,
	});
	assert.equal(request.polluted, undefined);
});

test('validateExecuteRequest: a blank version is "*", a file without a name stays nameless', () => {
	const { request } = validateExecuteRequest({ language: 'c++', version: ' ', files: [{ content: '' }, { name: '', content: 'x' }] });
	assert.equal(request.version, '*');
	assert.deepEqual(request.files, [{ content: '' }, { content: 'x' }]);
	const kept = validateExecuteRequest({ language: 'python', version: '3.x', files: [{ content: '' }], stdin: 'a\nb', args: ['--flag', 'x'] });
	assert.equal(kept.request.version, '3.x');
	assert.equal(kept.request.stdin, 'a\nb');
	assert.deepEqual(kept.request.args, ['--flag', 'x']);
});

test('validateExecuteRequest clamps the timeouts into their bounds', () => {
	const low = validateExecuteRequest(minimalRequest({ compile_timeout: 0, run_timeout: -50 })).request;
	assert.equal(low.compile_timeout, 1);
	assert.equal(low.run_timeout, 1);
	const high = validateExecuteRequest(minimalRequest({ compile_timeout: 999999, run_timeout: 999999 })).request;
	assert.equal(high.compile_timeout, MAX_COMPILE_TIMEOUT_MS);
	assert.equal(high.run_timeout, MAX_RUN_TIMEOUT_MS);
	// a Piston server refuses anything above its own limits (here 10 s compile, 3 s run)
	assert.equal(MAX_COMPILE_TIMEOUT_MS, 10000);
	assert.equal(MAX_RUN_TIMEOUT_MS, 3000);
	const fraction = validateExecuteRequest(minimalRequest({ run_timeout: 2500.6 })).request;
	assert.equal(fraction.run_timeout, 2501, 'a whole number of milliseconds');
});

test('validateExecuteRequest: a memory limit of -1 (the server\'s own) is accepted and left out', () => {
	const { request, error } = validateExecuteRequest(minimalRequest({ compile_memory_limit: -1, run_memory_limit: -1 }));
	assert.equal(error, null);
	assert.equal('compile_memory_limit' in request, false);
	assert.equal('run_memory_limit' in request, false);
});

test('validateExecuteRequest: a memory limit under 1 MiB is refused (Piston reads 0 to 999 as no limit at all)', () => {
	assert.equal(MIN_MEMORY_LIMIT_BYTES, 1048576);
	for (const tooSmall of [0, 1, 500, 999, MIN_MEMORY_LIMIT_BYTES - 1]) {
		for (const field of ['run_memory_limit', 'compile_memory_limit']) {
			const { request, error } = validateExecuteRequest(minimalRequest({ [field]: tooSmall }));
			assert.equal(request, null, `${field} ${tooSmall} must not reach the server`);
			assert.match(error, new RegExp(`"${field}" must be .*at least ${MIN_MEMORY_LIMIT_BYTES}`));
		}
	}
	const smallest = validateExecuteRequest(minimalRequest({ run_memory_limit: MIN_MEMORY_LIMIT_BYTES })).request;
	assert.equal(smallest.run_memory_limit, MIN_MEMORY_LIMIT_BYTES);
});

test('validateExecuteRequest refuses each out-of-bounds field with a message naming it', () => {
	const cases = [
		[null, /JSON object/],
		[['python'], /JSON object/],
		[minimalRequest({ language: undefined }), /"language"/],
		[minimalRequest({ language: '' }), /"language"/],
		[minimalRequest({ language: 42 }), /"language"/],
		[minimalRequest({ language: 'x'.repeat(41) }), /"language".*40/],
		[minimalRequest({ version: 'v'.repeat(41) }), /"version".*40/],
		[minimalRequest({ version: 3.12 }), /"version"/],
		[minimalRequest({ files: undefined }), /"files"/],
		[minimalRequest({ files: 'print(1)' }), /"files"/],
		[minimalRequest({ files: [] }), /"files"/],
		[minimalRequest({ files: Array.from({ length: 6 }, () => ({ content: '' })) }), /"files".*5/],
		[minimalRequest({ files: [{ name: 'main.py' }] }), /files\[0\]/],
		[minimalRequest({ files: ['print(1)'] }), /files\[0\]/],
		[minimalRequest({ files: [{ content: 'x', name: 'n'.repeat(101) }] }), /files\[0\]\.name.*100/],
		[minimalRequest({ files: [{ content: 'x', name: 7 }] }), /files\[0\]\.name/],
		[minimalRequest({ stdin: 'x'.repeat(65537) }), /"stdin".*65536/],
		[minimalRequest({ stdin: 5 }), /"stdin"/],
		[minimalRequest({ args: 'a b' }), /"args"/],
		[minimalRequest({ args: Array.from({ length: 21 }, () => 'a') }), /"args".*20/],
		[minimalRequest({ args: ['ok', 3] }), /"args"/],
		[minimalRequest({ args: ['a'.repeat(1001)] }), /"args".*1000/],
		[minimalRequest({ run_timeout: '3000' }), /"run_timeout"/],
		[minimalRequest({ compile_timeout: Number.POSITIVE_INFINITY }), /"compile_timeout"/],
		[minimalRequest({ run_memory_limit: -2 }), /"run_memory_limit"/],
		[minimalRequest({ compile_memory_limit: '1mb' }), /"compile_memory_limit"/],
	];
	for (const [input, expected] of cases) {
		const { request, error } = validateExecuteRequest(input);
		assert.equal(request, null, JSON.stringify(input)?.slice(0, 80));
		assert.match(error, expected);
	}
});

test('a secret a header cannot carry is a 500 that names neither the variable nor its value; the log names the variable; nothing is sent', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	// Inside the value: the ends are trimmed (a pasted trailing line break is harmless).
	for (const secret of [`${FAKE_SECRET}\n${FAKE_SECRET}`, `${FAKE_SECRET}\rx`, `${FAKE_SECRET}\0`, `${FAKE_SECRET}€`]) {
		const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv({ PISTON_PROXY_SECRET: secret }), fetchImpl });
		assert.equal(response.status, 500);
		await assertNoSecret(response);
		assert.deepEqual(await bodyOf(response), { message: INVALID_SECRET_MESSAGE });
	}
	assert.equal(INVALID_SECRET_MESSAGE, 'Invalid server configuration.');
	assert.match(loggedText(errorLog), /Invalid server configuration: PISTON_PROXY_SECRET contains a character a header cannot carry\./);
	await assertNoSecret(loggedText(errorLog));
	assert.equal(fetchImpl.calls.length, 0);
});

test('an upstream 3xx that reaches the function (the call follows none) becomes 502', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	for (const status of [300, 302, 304]) {
		const fetchImpl = fakeFetch({ status, body: '' });
		const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 502, `upstream ${status}`);
		assert.equal((await bodyOf(response)).message, upstreamWords(status));
		assert.match(loggedText(errorLog), new RegExp(`answered ${status} for /api/v2/execute\\. Check PISTON_BASE_URL\\.`));
		assert.equal(fetchImpl.calls[0].init.redirect, 'error', 'redirects are never followed');
	}
});

test('an upstream status a Response cannot carry (a 600 from an odd proxy) is a 502 whose log names the variable, not a 500 from the constructor', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 600, body: '', contentType: 'text/plain' });
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 502);
	assert.equal((await bodyOf(response)).message, upstreamWords(600));
	assert.match(loggedText(errorLog), /answered 600 for \/api\/v2\/execute\. Check PISTON_BASE_URL\./);
	assert.doesNotMatch(loggedText(errorLog), /Unexpected error/);
});

test('an unexpected failure (a body that cannot be read) is a 500, and its log line has the secret replaced by [secret]', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const failing = new ReadableStream({
		start(controller) {
			controller.error(new Error(`boom near ${FAKE_SECRET}`));
		},
	});
	const request = new Request(`${SITE_ORIGIN}${EXECUTE_PATH}`, { method: 'POST', headers: { ...JSON_HEADERS }, body: failing, duplex: 'half' });
	const response = await handleExecute(request, { env: fakeEnv(), fetchImpl: fakeFetch({ status: 200, body: PISTON_SUCCESS }) });
	assert.equal(response.status, 500);
	assert.match(loggedText(errorLog), /\[execute\] Unexpected error: boom near \[secret\]/);
	await assertNoSecret(loggedText(errorLog));
});

test("the timeout bounds equal the editor library's TIMEOUT_BOUNDS (shared/components/CodeEditor/lib/codeRunner/request.js)", async () => {
	const { TIMEOUT_BOUNDS } = await import(LIBRARY_REQUEST_MODULE);
	assert.ok(TIMEOUT_BOUNDS, 'request.js exports TIMEOUT_BOUNDS');
	assert.equal(TIMEOUT_BOUNDS.compileTimeout.max, MAX_COMPILE_TIMEOUT_MS);
	assert.equal(TIMEOUT_BOUNDS.runTimeout.max, MAX_RUN_TIMEOUT_MS);
	assert.equal(TIMEOUT_BOUNDS.compileTimeout.min, MIN_TIMEOUT_MS);
	assert.equal(TIMEOUT_BOUNDS.runTimeout.min, MIN_TIMEOUT_MS);
});

test('an unreachable server is a 502; the log says why but never shows the secret', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ error: fetchFailed('ECONNREFUSED') });
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 502);
	await assertNoSecret(response);
	assert.equal(typeof (await bodyOf(response)).message, 'string');
	assert.match(loggedText(errorLog), /ECONNREFUSED/);
	await assertNoSecret(loggedText(errorLog));
});

test('a server that times out is a 504', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ error: fetchFailed('UND_ERR_HEADERS_TIMEOUT') });
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 504);
	assert.match((await bodyOf(response)).message, /did not answer/);
	await assertNoSecret(loggedText(errorLog));
});

test("a Piston error status (e.g. the proxy's 403) keeps its status, in fixed JSON words; its body goes to the log, never the secret", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 403, body: 'Forbidden', contentType: 'text/plain' });
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 403);
	assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
	assert.deepEqual(await bodyOf(response), { message: upstreamWords(403) });
	assert.ok(!upstreamWords(403).startsWith('Refused origin'), "the editor must not read it as the origin guard's 403");
	assert.equal(loggedText(errorLog), '[execute] The Piston server answered 403 for /api/v2/execute. Body: Forbidden');
	await assertNoSecret(loggedText(errorLog));
});

test("an error page from upstream never reaches the page: every status the function does not re-label answers JSON in the function's own words", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const upstreamErrors = [
		{ status: 503, body: `<html><h1>503</h1><p>${MARKER}</p></html>`, contentType: 'text/html' },
		{ status: 502, body: `<html><p>${MARKER}</p></html>`, contentType: 'text/html' },
		{ status: 500, body: { message: `worker pool crashed on ${MARKER}` } },
		{ status: 403, body: `Forbidden by ${MARKER}`, contentType: 'text/plain' },
		{ status: 422, body: `Unprocessable at ${MARKER}`, contentType: 'text/plain' },
		{ status: 405, body: `Method not allowed by ${MARKER}`, contentType: 'text/plain' },
		{ status: 401, body: { message: `who are you, says ${MARKER}` } },
	];
	for (const answer of upstreamErrors) {
		const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl: fakeFetch(answer) });
		const text = await response.clone().text();
		assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8', String(answer.status));
		assert.deepEqual(Object.keys(JSON.parse(text)), ['message'], String(answer.status));
		assert.equal(text.split(MARKER).length - 1, 0, `upstream ${answer.status}: the answer holds none of the server's words`);
		assert.doesNotMatch(text, SETUP_NAMES, String(answer.status));
	}
	assert.equal(loggedText(errorLog).split(MARKER).length - 1, upstreamErrors.length, 'the log keeps each body once');
});

test("a 400 from upstream: Piston's own message reaches the page with the secret replaced; one without a message is a 502 with one log line naming the variable", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const echoed = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl: fakeFetch({ status: 400, body: { message: `bad header x-piston-proxy-secret: ${FAKE_SECRET}` } }) });
	assert.equal(echoed.status, 400);
	await assertNoSecret(echoed);
	assert.deepEqual(await bodyOf(echoed), { message: 'bad header x-piston-proxy-secret: [secret]' });
	assert.equal(errorLog.mock.callCount(), 0, "Piston's own 400 is about the request: not logged");

	// A plain-text 400 that echoes the request (a proxy's own page): it names the secret.
	const plain = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl: fakeFetch({ status: 400, body: `Bad request; headers: x-piston-proxy-secret=${FAKE_SECRET}`, contentType: 'text/plain' }) });
	assert.equal(plain.status, 502);
	assert.equal(plain.headers.get('content-type'), 'application/json; charset=utf-8');
	assert.deepEqual(await bodyOf(plain.clone()), { message: upstreamWords(400) });
	await assertNoSecret(plain);
	await assertNoSecret(loggedText(errorLog));
	assert.match(loggedText(errorLog), /answered 400 without Piston's JSON message \(\/api\/v2\/execute\)\. Check PISTON_BASE_URL\. Body: Bad request; headers: x-piston-proxy-secret=\[secret\]/);
});

test("a 400 that is not Piston's own (http:// to a TLS port: Go's plain sentence, no content type) is a 502 in JSON with one log line", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 400, body: 'Client sent an HTTP request to an HTTPS server.\n', contentType: null });
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 502);
	assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
	const { message } = await bodyOf(response);
	assert.equal(typeof message, 'string');
	assert.doesNotMatch(message, /HTTPS/);
	assert.equal(errorLog.mock.callCount(), 1, 'exactly one log line');
	assert.match(loggedText(errorLog), /Check PISTON_BASE_URL\. Body: Client sent an HTTP request to an HTTPS server\.$/);
});

test('a 2xx that names the secret (a wrong PISTON_BASE_URL at a service echoing the request) reaches the page with the secret replaced', async (t) => {
	t.mock.method(console, 'error', () => {});
	const echo = { headers: { [PROXY_HEADER]: FAKE_SECRET }, url: '/api/v2/execute' };
	const response = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl: fakeFetch({ status: 200, body: echo }) });
	assert.equal(response.status, 200);
	await assertNoSecret(response);
	assert.deepEqual(await bodyOf(response), { headers: { [PROXY_HEADER]: '[secret]' }, url: '/api/v2/execute' });
	// A secret that is all digits could sit in a number: replaced, the JSON breaks, so the page gets the 502.
	const digits = '738291';
	const broken = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv({ PISTON_PROXY_SECRET: digits }), fetchImpl: fakeFetch({ status: 200, body: `{"memory":${digits}}` }) });
	assert.equal(broken.status, 502);
	assert.ok(!(await broken.text()).includes(digits));
});

test('the default export is the modern function: a Request and the context in, a Response out', async () => {
	assert.equal(typeof execute.default, 'function');
	assert.equal('handler' in execute, false, 'no Lambda-style handler export is left');
	const response = await execute.default(bodilessRequest('GET'), { ip: '203.0.113.9' });
	assert.ok(response instanceof Response);
	assert.equal(response.status, 405, 'answered before any configuration or network is needed');
	assert.equal(response.headers.get('allow'), 'POST');
});

test("another site's page, or no page at all, is a 403 before the body is read; nothing is forwarded", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const foreign = [
		siteHeaders({ 'content-type': 'application/json', origin: 'https://evil.example.test' }),
		siteHeaders({ 'content-type': 'application/json', origin: 'null' }), // a sandboxed frame
		siteHeaders({ 'content-type': 'application/json', origin: `http://${SITE_HOST}` }), // plain http on the site's host
		{ 'content-type': 'application/json' }, // no Origin, no Referer: not a browser's POST
		{ 'content-type': 'application/json', referer: 'https://evil.example.test/page' },
	];
	for (const headers of foreign) {
		const response = await handleExecute(postRequest('{not json', { headers }), { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 403, JSON.stringify(headers));
		assert.deepEqual(await bodyOf(response), { message: ORIGIN_REFUSED_MESSAGE }, 'refused before the body is parsed');
	}
	assert.equal(fetchImpl.calls.length, 0);
	assert.match(loggedText(errorLog), /evil\.example\.test/);
	await assertNoSecret(loggedText(errorLog));
});

test('a site named in CODE_RUNNER_ALLOWED_ORIGINS, the Referer of a same-site page, or netlify dev on localhost passes', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const env = fakeEnv({ CODE_RUNNER_ALLOWED_ORIGINS: 'https://other.example.test, https://Also.Example.test:443/' });
	const allowed = [
		postRequest(minimalRequest(), { headers: siteHeaders({ 'content-type': 'application/json', origin: 'https://other.example.test' }) }),
		postRequest(minimalRequest(), { headers: siteHeaders({ 'content-type': 'application/json', origin: 'https://also.example.test' }) }),
		postRequest(minimalRequest(), { headers: { 'content-type': 'application/json', referer: `${SITE_ORIGIN}/docs/a-note` } }),
		postRequest(minimalRequest(), { headers: { 'content-type': 'application/json', origin: 'http://localhost:8888' }, site: 'http://localhost:8888' }), // netlify dev
	];
	for (const request of allowed) {
		const response = await handleExecute(request, { env, fetchImpl });
		assert.equal(response.status, 200, `${request.url} ${JSON.stringify([...request.headers])}`);
	}
	assert.equal(fetchImpl.calls.length, allowed.length);
});

test("over the rate limit (keyed on the context's ip): a 429 with retry-after and a message in plain words, before the body is read", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const limiter = createRateLimiter({ limit: 2, windowSeconds: 60 });
	const context = { ip: '203.0.113.9' };
	const first = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl, limiter, context });
	const second = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl, limiter, context });
	assert.equal(first.status, 200);
	assert.equal(second.status, 200);
	const third = await handleExecute(postRequest('{not json'), { env: fakeEnv(), fetchImpl, limiter, context });
	assert.equal(third.status, 429, 'the third request within the window');
	assert.match((await bodyOf(third)).message, new RegExp(`^${RATE_LIMITED_MARKER} .*at most 2 in 60 s.*try again in \\d+ s`));
	assert.match(third.headers.get('retry-after'), /^\d+$/);
	assert.equal(third.headers.get('cache-control'), 'no-store');
	assert.equal(fetchImpl.calls.length, 2, 'the refused request was never forwarded');
	assert.match(loggedText(errorLog), /Rate limit.*203\.0\.113\.9/);

	const other = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl, limiter, context: { ip: '198.51.100.4' } });
	assert.equal(other.status, 200, 'another client has its own bucket');
	const byHeader = postRequest(minimalRequest(), { headers: siteHeaders({ 'content-type': 'application/json', 'x-nf-client-connection-ip': '203.0.113.9' }) });
	assert.equal((await handleExecute(byHeader, { env: fakeEnv(), fetchImpl, limiter })).status, 429, "without a context, Netlify's header names the same client");
});

test('the rate limit is read from CODE_RUNNER_RATE_LIMIT, and the shared limiter is kept per settings', async (t) => {
	t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	// A setting of its own so no other test shares this bucket; a client of its own likewise.
	const env = fakeEnv({ CODE_RUNNER_RATE_LIMIT: '1/3600' });
	const context = { ip: '192.0.2.77' };
	const first = await handleExecute(postRequest(minimalRequest()), { env, fetchImpl, context });
	const second = await handleExecute(postRequest(minimalRequest()), { env, fetchImpl, context });
	assert.equal(first.status, 200);
	assert.equal(second.status, 429, 'the same instance remembers the client across requests');
	assert.equal(fetchImpl.calls.length, 1);
	const off = await handleExecute(postRequest(minimalRequest()), { env: fakeEnv(), fetchImpl, context });
	assert.equal(off.status, 200, '"off" switches the limit off');
});

test('no answer carries a CORS header, an allowlisted origin included: the refused preflight is the guard against other sites', async (t) => {
	// CSRF: another site's page can only send application/json after a preflight (OPTIONS), and
	// a 405 with no access-control-* header makes the browser drop the request. So the allowlist
	// admits no browser page on another origin — only a request that already reached the function
	// with that Origin (a server-side proxy, netlify dev from the LAN): lib/origin.mjs.
	t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const env = fakeEnv({ CODE_RUNNER_ALLOWED_ORIGINS: 'https://other.example.test' });
	const allowed = siteHeaders({ 'content-type': 'application/json', origin: 'https://other.example.test' });
	const preflight = await handleExecute(bodilessRequest('OPTIONS', { ...allowed, 'access-control-request-method': 'POST' }), { env, fetchImpl });
	assert.equal(preflight.status, 405, 'the preflight of an allowlisted origin is refused like any other');
	assert.deepEqual(corsHeadersOf(preflight), []);
	const answers = [
		await handleExecute(postRequest(minimalRequest(), { headers: allowed }), { env, fetchImpl }), // 200, allowlisted
		await handleExecute(postRequest('{not json', { headers: allowed }), { env, fetchImpl }), // 400, allowlisted
		await handleExecute(postRequest(minimalRequest()), { env, fetchImpl }), // 200, the site itself
		await handleExecute(postRequest(minimalRequest(), { headers: siteHeaders({ 'content-type': 'application/json', origin: 'https://evil.example.test' }) }), { env, fetchImpl }), // 403
		await handleExecute(postRequest(minimalRequest(), { headers: { ...allowed, 'content-type': 'text/plain' } }), { env, fetchImpl }), // 415
	];
	assert.deepEqual(answers.map((answer) => answer.status), [200, 400, 200, 403, 415]);
	for (const answer of answers) assert.deepEqual(corsHeadersOf(answer), [], JSON.stringify([...answer.headers]));
});

test('the rate-limit setting is read after the cheap refusals, and parsed once per instance', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	// An unreadable value: the default applies and a warning is logged — but how often?
	const env = fakeEnv({ CODE_RUNNER_RATE_LIMIT: 'unlimited' });
	const context = { ip: '192.0.2.150' }; // a bucket of its own in the default limiter
	forgetRateLimitSettings();
	await handleExecute(bodilessRequest('GET', siteHeaders()), { env, fetchImpl, context });
	await handleExecute(bodilessRequest('OPTIONS', siteHeaders()), { env, fetchImpl, context });
	await handleExecute(postRequest(minimalRequest(), { headers: siteHeaders({ 'content-type': 'text/plain' }) }), { env, fetchImpl, context });
	assert.equal(rateLimitWarnings(errorLog), 0, 'a 405 or 415 never reads the setting');
	for (let i = 0; i < 3; i += 1) {
		const response = await handleExecute(postRequest(minimalRequest()), { env, fetchImpl, context });
		assert.equal(response.status, 200);
	}
	assert.equal(rateLimitWarnings(errorLog), 1, 'three allowed runs: the warning once');
	assert.equal(fetchImpl.calls.length, 3);
	forgetRateLimitSettings();
});

test('the order of the checks: method, media type, origin, rate limit, configuration', async (t) => {
	t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_SUCCESS });
	const empty = createRateLimiter({ limit: 1, windowSeconds: 3600 });
	empty.take('unknown');
	const foreign = { 'content-type': 'application/json', origin: 'https://evil.example.test' };
	const broken = fakeEnv({ PISTON_PROXY_SECRET: undefined });
	assert.equal((await handleExecute(bodilessRequest('GET', foreign), { env: broken, fetchImpl, limiter: empty })).status, 405);
	assert.equal((await handleExecute(postRequest('{}', { headers: { origin: 'https://evil.example.test' } }), { env: broken, fetchImpl, limiter: empty })).status, 415);
	assert.equal((await handleExecute(postRequest('{}', { headers: foreign }), { env: broken, fetchImpl, limiter: empty })).status, 403);
	assert.equal((await handleExecute(postRequest('{}'), { env: broken, fetchImpl, limiter: empty })).status, 429);
	assert.equal((await handleExecute(postRequest('{}'), { env: broken, fetchImpl, limiter: null })).status, 500);
	assert.equal(fetchImpl.calls.length, 0);
});
