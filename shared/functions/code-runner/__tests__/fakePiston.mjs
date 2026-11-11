/**
 * fakePiston.mjs — helpers for the functions' tests (not a test itself: `node --test` runs only
 * the *.test.mjs files). A fake `fetch` that records every request and answers the way the
 * Piston server would, a fake environment, the web Requests a page would send, and a way to
 * read what was logged. Nothing here touches the network. The secret below is a made-up
 * placeholder, never a real one.
 *
 * HOW TO CHANGE IT
 *   A new kind of answer: add an option to fakeFetch() (today: a status + body, an error to
 *   throw, or a request that never answers). The fake server's address / secret: FAKE_BASE_URL /
 *   FAKE_SECRET. The fake site a request comes from: SITE_HOST / SITE_ORIGIN (siteRequest(),
 *   siteHeaders()). fakeEnv() switches the rate limit off (CODE_RUNNER_RATE_LIMIT "off"): a
 *   test of the limit passes its own limiter, or sets the variable itself.
 */

import assert from 'node:assert/strict';

/**
 * A placeholder secret: the tests check it is sent upstream and never shown or logged. Under 16
 * characters, because the privacy scan reads a longer one in this shape as a real secret.
 */
export const FAKE_SECRET = 'made-up-7f3a';

/** The fake Piston server's origin (.test never resolves). */
export const FAKE_BASE_URL = 'https://piston.example.test';

/** The fake site the functions belong to: the host a request is sent to, and the page's origin. */
export const SITE_HOST = 'notes.example.test';
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** The environment the functions read, with a trailing slash the config must strip. */
export function fakeEnv(overrides = {}) {
	return {
		PISTON_BASE_URL: `${FAKE_BASE_URL}/`,
		PISTON_PROXY_SECRET: FAKE_SECRET,
		CODE_RUNNER_RATE_LIMIT: 'off',
		...overrides,
	};
}

/** The headers of a request the site's own page makes: its Origin, plus `extra`. */
export function siteHeaders(extra = {}) {
	return { origin: SITE_ORIGIN, ...extra };
}

/**
 * A web Request to the site's function at `path` (e.g. '/.netlify/functions/execute'), the way
 * Netlify hands it over: the URL the page asked for, on the site's own host. `init` is the
 * Request's (method, headers, body); a GET or HEAD never carries a body.
 */
export function siteRequest(path, init = {}) {
	return new Request(`${SITE_ORIGIN}${path}`, init);
}

/** A fetch Response-like object: status, headers.get(), text(). */
export function fakeResponse({ status = 200, body = '', contentType = 'application/json; charset=utf-8' }) {
	const text = typeof body === 'string' ? body : JSON.stringify(body);
	const headers = { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) };
	return { status, headers, text: async () => text };
}

/** A promise that never settles unless the request's signal aborts (like a real fetch). */
function hangingRequest(signal) {
	return new Promise((resolve, reject) => {
		if (!signal) return;
		signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
	});
}

/**
 * A fake fetch. `answer`: { status, body, contentType } to respond, { error } to throw it,
 * { hang: true } to never answer. `fetchImpl.calls` lists { url, init } per request.
 */
export function fakeFetch(answer = {}) {
	const calls = [];
	async function fetchImpl(url, init = {}) {
		calls.push({ url, init });
		if (answer.error) throw answer.error;
		if (answer.hang) return hangingRequest(init.signal);
		return fakeResponse(answer);
	}
	fetchImpl.calls = calls;
	return fetchImpl;
}

/** The error Node's fetch throws when the server cannot be reached (undici's shape). */
export function fetchFailed(code = 'ECONNREFUSED') {
	const cause = Object.assign(new Error(`connect ${code} 192.0.2.1:443`), { code });
	return Object.assign(new TypeError('fetch failed'), { cause });
}

/** Everything a mocked console.error received, as one string. */
export function loggedText(errorMock) {
	return errorMock.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
}

/** A Response's body parsed as JSON (the shape of every answer the functions write themselves). */
export async function bodyOf(response) {
	return JSON.parse(await response.text());
}

/** The names of a Response's headers that are CORS headers (access-control-*; Headers keeps names lowercase). */
export function corsHeadersOf(response) {
	return [...response.headers.keys()].filter((name) => name.startsWith('access-control-'));
}

/** Fails when the placeholder secret appears anywhere in `value` (a Response, its text, a log). */
export async function assertNoSecret(value) {
	const text = await textOf(value);
	assert.ok(!text.includes(FAKE_SECRET), 'the secret must never be shown or logged');
}

/** `value` as text: a Response's headers and body (a clone, so the body can still be read), else its JSON. */
async function textOf(value) {
	if (value instanceof Response) {
		const headers = JSON.stringify([...value.headers]);
		return `${headers}\n${await value.clone().text()}`;
	}
	if (Array.isArray(value)) {
		const parts = await Promise.all(value.map(textOf));
		return parts.join('\n');
	}
	return typeof value === 'string' ? value : JSON.stringify(value);
}
