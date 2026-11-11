/**
 * runtimes.test.mjs — shared/functions/code-runner/runtimes.mjs: the list of installed runtimes is
 * asked for with the secret header, reduced to { language, version, aliases, runtime }, cached by the
 * browser only; every failure has its status and a JSON { message } in the function's own words,
 * naming no variable or server, the server's words only in the log (a redirect, never followed,
 * is a 502; a secret a header cannot carry, a 500); the secret is never echoed or logged; the
 * default export is a modern Netlify Function (a web Request and the context in, a Response
 * out); the public-site checks are wired leniently (a foreign origin is a 403, no origin at all
 * passes, a flood is a 429, keyed on the context's ip); no answer carries a CORS header; the
 * rate-limit setting is read after the method check and parsed once per instance. A fake fetch
 * stands in for the Piston server (fakePiston.mjs): no network.
 * Run with `npm run test:shared`.
 * To change it: a new rule of runtimes.mjs gets a test here, over fakePiston.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as runtimes from '../runtimes.mjs';
import { INVALID_SECRET_MESSAGE, MISSING_CONFIG_MESSAGE, PROXY_HEADER } from '../lib/piston.mjs';
import { ORIGIN_REFUSED_MESSAGE } from '../lib/origin.mjs';
import { RUNTIMES_LIMIT, createRateLimiter, forgetRateLimitSettings } from '../lib/rateLimit.mjs';
import {
	FAKE_BASE_URL,
	FAKE_SECRET,
	SITE_ORIGIN,
	assertNoSecret,
	bodyOf,
	corsHeadersOf,
	fakeEnv,
	fakeFetch,
	fetchFailed,
	loggedText,
	siteHeaders,
	siteRequest,
} from './fakePiston.mjs';

const { handleRuntimes, toRuntime, CACHE_SECONDS } = runtimes;

/** The function's URL on the site (the editor's RUNTIMES_URL). */
const RUNTIMES_URL = '/.netlify/functions/runtimes';

/** What GET /api/v2/runtimes answers (shape verified on the server), plus odd entries. */
const PISTON_RUNTIMES = [
	{ language: 'python', version: '3.12.0', aliases: ['py', 'py3', 'python3', 'python3.12'] },
	{ language: 'javascript', version: '20.11.1', aliases: ['node-javascript', 'js'], runtime: 'node', extra: 'dropped' },
	{ language: 'c++', version: '10.2.0', aliases: 'not-an-array', runtime: 'gcc' },
	{ language: 'bash', version: '5.2.0', aliases: ['sh', 7] },
	{ language: 'broken' },
	'not an object',
];

/** What the page should receive for PISTON_RUNTIMES. */
const EXPECTED_RUNTIMES = [
	{ language: 'python', version: '3.12.0', aliases: ['py', 'py3', 'python3', 'python3.12'], runtime: null },
	{ language: 'javascript', version: '20.11.1', aliases: ['node-javascript', 'js'], runtime: 'node' },
	{ language: 'c++', version: '10.2.0', aliases: [], runtime: 'gcc' },
	{ language: 'bash', version: '5.2.0', aliases: ['sh'], runtime: null },
];

/** The function's words for an error status from upstream (lib/piston.mjs > upstreamStatusMessage): the status, nothing else. */
function upstreamWords(status) {
	return `The code runner's server answered ${status}.`;
}

/** A made-up host an upstream error names, which no answer to a page may carry. */
const MARKER = 'runner-host.example.internal';

/** What tells a caller how the site is set up: a variable, the server's name, its paths. */
const SETUP_NAMES = /PISTON_|CODE_RUNNER_|piston|\/api\/v2/i;

/** A request for the list: `method` (GET unless given) with these headers (none: a bare same-origin GET). */
function listRequest(headers = {}, method = 'GET') {
	return siteRequest(RUNTIMES_URL, { method, headers });
}

/** How many lines of a mocked console.error name CODE_RUNNER_RATE_LIMIT. */
function rateLimitWarnings(errorLog) {
	return loggedText(errorLog).split('\n').filter((line) => line.includes('CODE_RUNNER_RATE_LIMIT')).length;
}

test('asks PISTON_BASE_URL/api/v2/runtimes with a GET and the secret header, no body', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl });
	assert.equal(fetchImpl.calls.length, 1);
	const [{ url, init }] = fetchImpl.calls;
	assert.equal(url, `${FAKE_BASE_URL}/api/v2/runtimes`);
	assert.equal(init.method, 'GET');
	assert.equal(init.headers[PROXY_HEADER], FAKE_SECRET);
	assert.equal(init.body, undefined);
	assert.equal(init.headers['content-type'], undefined, 'no body, no content type');
	assert.equal(init.redirect, 'error', 'a redirect is never followed');
});

test('200: each runtime reduced to its four fields, odd entries skipped, cached privately', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	const response = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl });
	assert.ok(response instanceof Response);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
	assert.equal(response.headers.get('cache-control'), `private, max-age=${CACHE_SECONDS}`);
	assert.equal(CACHE_SECONDS, 300);
	await assertNoSecret(response);
	assert.deepEqual(await bodyOf(response), EXPECTED_RUNTIMES);
});

test('toRuntime keeps language, version, aliases (always an array) and runtime (string or null)', () => {
	assert.deepEqual(toRuntime({ language: 'go', version: '1.16.2' }), { language: 'go', version: '1.16.2', aliases: [], runtime: null });
	assert.equal(toRuntime({ language: 'go' }), null);
	assert.equal(toRuntime({ version: '1.16.2' }), null);
	assert.equal(toRuntime(null), null);
	assert.equal(toRuntime([]), null);
});

test('HEAD answers the same status and headers with no body', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	const response = await handleRuntimes(listRequest({}, 'HEAD'), { env: fakeEnv(), fetchImpl });
	assert.equal(response.status, 200);
	assert.equal(await response.text(), '');
	assert.equal(response.headers.get('cache-control'), `private, max-age=${CACHE_SECONDS}`);
});

test('only GET and HEAD: anything else is 405 with allow, and nothing is asked', async () => {
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
		const response = await handleRuntimes(listRequest({}, method), { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 405, method);
		assert.equal(response.headers.get('allow'), 'GET, HEAD');
		assert.equal(typeof (await bodyOf(response)).message, 'string');
	}
	assert.equal(fetchImpl.calls.length, 0);
});

test('a missing PISTON_BASE_URL / PISTON_PROXY_SECRET is a 500 with the configuration message', async (t) => {
	t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	for (const env of [fakeEnv({ PISTON_BASE_URL: '' }), fakeEnv({ PISTON_PROXY_SECRET: undefined })]) {
		const response = await handleRuntimes(listRequest(), { env, fetchImpl });
		assert.equal(response.status, 500);
		assert.deepEqual(await bodyOf(response), { message: MISSING_CONFIG_MESSAGE });
		assert.equal(response.headers.get('cache-control'), 'no-store');
	}
	assert.equal(fetchImpl.calls.length, 0);
});

test('a secret a header cannot carry is a 500 that names neither the variable nor its value; nothing is asked', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	const env = fakeEnv({ PISTON_PROXY_SECRET: `${FAKE_SECRET}\n${FAKE_SECRET}` });
	const response = await handleRuntimes(listRequest(), { env, fetchImpl });
	assert.equal(response.status, 500);
	assert.equal(response.headers.get('cache-control'), 'no-store');
	await assertNoSecret(response);
	assert.deepEqual(await bodyOf(response), { message: INVALID_SECRET_MESSAGE });
	await assertNoSecret(loggedText(errorLog));
	assert.equal(fetchImpl.calls.length, 0);
});

test("a Piston error keeps its status, in fixed words; its body goes to the log, never the secret", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const refused = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl: fakeFetch({ status: 403, body: 'Forbidden', contentType: 'text/plain' }) });
	assert.equal(refused.status, 403);
	assert.deepEqual(await bodyOf(refused), { message: upstreamWords(403) });
	assert.equal(refused.headers.get('cache-control'), 'no-store');

	const failing = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl: fakeFetch({ status: 500, body: { message: `disk full near ${FAKE_SECRET}` } }) });
	assert.equal(failing.status, 500);
	assert.deepEqual(await bodyOf(failing), { message: upstreamWords(500) });
	assert.match(loggedText(errorLog), /answered 403 for \/api\/v2\/runtimes\. Body: Forbidden/);
	assert.match(loggedText(errorLog), /answered 500 for \/api\/v2\/runtimes\. Body: \{"message":"disk full near \[secret\]"\}/);
	await assertNoSecret(loggedText(errorLog));
});

test("an upstream error's own words (a 500 or a 401 naming a host) never reach the page", async (t) => {
	t.mock.method(console, 'error', () => {});
	for (const status of [500, 401]) {
		const response = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl: fakeFetch({ status, body: { message: `failed behind ${MARKER}` } }) });
		const text = await response.text();
		assert.equal(text.split(MARKER).length - 1, 0, `upstream ${status}`);
		assert.doesNotMatch(text, SETUP_NAMES, `upstream ${status}`);
	}
});

test('an upstream 401 / 404 / 3xx / other 2xx becomes 502, so the page never mistakes it for the site', async (t) => {
	t.mock.method(console, 'error', () => {});
	for (const status of [401, 404, 204, 300, 302, 304]) {
		const response = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl: fakeFetch({ status, body: '' }) });
		assert.equal(response.status, 502, `upstream ${status}`);
		assert.match((await bodyOf(response)).message, new RegExp(`answered ${status}`));
	}
});

test('an upstream status a Response cannot carry (a 600 from an odd proxy) is a 502 whose log names the variable, not a 500 from the constructor', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const response = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl: fakeFetch({ status: 600, body: '', contentType: 'text/plain' }) });
	assert.equal(response.status, 502);
	assert.deepEqual(await bodyOf(response), { message: upstreamWords(600) });
	assert.match(loggedText(errorLog), /answered 600 for \/api\/v2\/runtimes\. Check PISTON_BASE_URL\./);
	assert.doesNotMatch(loggedText(errorLog), /Unexpected error/);
});

test('a 200 that is not a JSON array is a 502; the log names the variable, the answer does not', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	for (const body of ['<!doctype html><p>Some other site</p>', '{"language":"python"}']) {
		const response = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl: fakeFetch({ status: 200, body }) });
		assert.equal(response.status, 502);
		const { message } = await bodyOf(response);
		assert.match(message, /unexpected runtime list/);
		assert.doesNotMatch(message, SETUP_NAMES);
	}
	assert.match(loggedText(errorLog), /not a JSON array \(\/api\/v2\/runtimes\)\. Check PISTON_BASE_URL\. Body: \{"language":"python"\}/);
});

test('unreachable is 502, a timeout 504; the log never shows the secret', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const down = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl: fakeFetch({ error: fetchFailed('ENOTFOUND') }) });
	assert.equal(down.status, 502);
	const slow = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl: fakeFetch({ error: fetchFailed('UND_ERR_CONNECT_TIMEOUT') }) });
	assert.equal(slow.status, 504);
	assert.match(loggedText(errorLog), /ENOTFOUND/);
	await assertNoSecret(loggedText(errorLog));
	await assertNoSecret([down, slow]);
});

test('the default export is the modern function: a Request and the context in, a Response out', async () => {
	assert.equal(typeof runtimes.default, 'function');
	assert.equal('handler' in runtimes, false, 'no Lambda-style handler export is left');
	const response = await runtimes.default(listRequest({}, 'DELETE'), { ip: '203.0.113.9' });
	assert.ok(response instanceof Response);
	assert.equal(response.status, 405, 'answered before any configuration or network is needed');
	assert.equal(response.headers.get('allow'), 'GET, HEAD');
});

test("another site's page is a 403; the site's own page, or a request with no origin at all, passes", async (t) => {
	t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	for (const headers of [siteHeaders(), {}, { referer: `${SITE_ORIGIN}/` }]) {
		const response = await handleRuntimes(listRequest(headers), { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 200, JSON.stringify(headers));
	}
	const foreign = [siteHeaders({ origin: 'https://evil.example.test' }), { referer: 'https://evil.example.test/' }];
	for (const headers of foreign) {
		const response = await handleRuntimes(listRequest(headers), { env: fakeEnv(), fetchImpl });
		assert.equal(response.status, 403, JSON.stringify(headers));
		assert.deepEqual(await bodyOf(response), { message: ORIGIN_REFUSED_MESSAGE });
	}
	assert.equal(fetchImpl.calls.length, 3);
});

test("no answer carries a CORS header, an allowlisted origin included: another site's page cannot read the list", async (t) => {
	t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	const env = fakeEnv({ CODE_RUNNER_ALLOWED_ORIGINS: 'https://other.example.test' });
	const allowed = siteHeaders({ origin: 'https://other.example.test' });
	const preflight = await handleRuntimes(listRequest({ ...allowed, 'access-control-request-method': 'GET' }, 'OPTIONS'), { env, fetchImpl });
	assert.equal(preflight.status, 405);
	assert.deepEqual(corsHeadersOf(preflight), []);
	const answers = [
		await handleRuntimes(listRequest(allowed), { env, fetchImpl }), // 200, allowlisted
		await handleRuntimes(listRequest(siteHeaders()), { env, fetchImpl }), // 200, the site itself
		await handleRuntimes(listRequest(siteHeaders({ origin: 'https://evil.example.test' })), { env, fetchImpl }), // 403
	];
	assert.deepEqual(answers.map((answer) => answer.status), [200, 200, 403]);
	for (const answer of answers) assert.deepEqual(corsHeadersOf(answer), [], JSON.stringify([...answer.headers]));
});

test('the rate-limit setting is read after the method check, and parsed once per instance', async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	const env = fakeEnv({ CODE_RUNNER_RATE_LIMIT: 'unlimited' });
	const context = { ip: '192.0.2.151' }; // a bucket of its own in the list limiter
	forgetRateLimitSettings();
	for (const method of ['POST', 'PUT', 'DELETE']) {
		assert.equal((await handleRuntimes(listRequest(siteHeaders(), method), { env, fetchImpl, context })).status, 405);
	}
	assert.equal(rateLimitWarnings(errorLog), 0, 'a 405 never reads the setting');
	for (let i = 0; i < 3; i += 1) {
		assert.equal((await handleRuntimes(listRequest(siteHeaders()), { env, fetchImpl, context })).status, 200);
	}
	assert.equal(rateLimitWarnings(errorLog), 1, 'three allowed lists: the warning once');
	assert.equal(fetchImpl.calls.length, 3);
	forgetRateLimitSettings();
});

test("a flood of list requests from one client (the context's ip) is a 429 with retry-after; the list limit is 60 per minute", async (t) => {
	t.mock.method(console, 'error', () => {});
	assert.deepEqual(RUNTIMES_LIMIT, { limit: 60, windowSeconds: 60 });
	const fetchImpl = fakeFetch({ status: 200, body: PISTON_RUNTIMES });
	const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });
	const context = { ip: '203.0.113.9' };
	const first = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl, limiter, context });
	const second = await handleRuntimes(listRequest({}, 'HEAD'), { env: fakeEnv(), fetchImpl, limiter, context });
	assert.equal(first.status, 200);
	assert.equal(second.status, 429);
	assert.equal(await second.text(), '', 'HEAD: the status and headers without a body');
	assert.match(second.headers.get('retry-after'), /^\d+$/);
	assert.equal(fetchImpl.calls.length, 1);
	const other = await handleRuntimes(listRequest(), { env: fakeEnv(), fetchImpl, limiter, context: { ip: '198.51.100.4' } });
	assert.equal(other.status, 200, 'another client has its own bucket');
});
