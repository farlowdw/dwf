/**
 * client.js — the browser's two requests to the code runner, through the site's Netlify
 * Functions (shared/functions/code-runner/): the list of installed runtimes, and one run. The only module
 * of this folder that does I/O (fetch); no React, no DOM otherwise.
 *
 * THE REQUESTS
 *   fetchRuntimes()   GET the runtimes URL -> { runtimes, error }. It NEVER rejects: on failure
 *                     `runtimes` is [] and `error` a RunError, and the editor keeps working
 *                     without a version menu. Asked once per page load and URL however many
 *                     editors the page holds (the answer is shared); a failed answer is
 *                     forgotten, so the next editor asks again.
 *   executeCode()     POST the execute URL (content-type application/json, POST_HEADERS) with a
 *                     payload from request.js > buildExecuteRequest ->
 *                     Piston's JSON answer (read it with result.js > summarizeResult). Throws a
 *                     RunError: errors.js > explainHttpError for a non-2xx answer, 'aborted'
 *                     when the `signal` aborts (Stop), 'network' when there is no answer.
 *   Both go to the page's own site (same origin), so a site password's cookie goes with them; neither
 *   sees the Piston server's address or secret (the functions add those).
 *
 * THE CONSOLE  A failed run prints its RunError's `setup` note with console.warn, for whoever runs
 * the site (errors.js > TWO AUDIENCES). A failed runtimes request prints nothing: it goes out on
 * every page with an editor, with no reader waiting for it, and the editor carries on without it.
 *
 * THE URLS  Both calls take `url`; without one the defaults EXECUTE_URL / RUNTIMES_URL apply
 * (the site's two functions). The editor passes the site's settings from the monaco-editor
 * plugin's options (shared/plugins/monaco-editor > executeUrl / runtimesUrl, through its global data),
 * so another site with other paths changes its config, not this folder.
 *
 * TESTS pass `fetchImpl` (a fake fetch); the page uses the browser's fetch. Call
 * resetRuntimesCache() between tests.
 *
 * HOW TO CHANGE IT
 *   The default URLs: EXECUTE_URL / RUNTIMES_URL (they must match the shim file names in
 *   a site's netlify/functions, and the plugin's DEFAULT_OPTIONS: a test keeps them equal). Error
 *   wording: errors.js. What starts a console note: WARNING_PREFIX. What a runtime entry keeps:
 *   cleanRuntime().
 */

import { RunError, explainHttpError } from './errors.js';

/** The run function (shared/functions/code-runner/execute.mjs). */
export const EXECUTE_URL = '/.netlify/functions/execute';

/** The runtimes function (shared/functions/code-runner/runtimes.mjs). */
export const RUNTIMES_URL = '/.netlify/functions/runtimes';

/** Shown when the reader stops waiting (the request is aborted; the server may run on). */
export const MESSAGE_ABORTED = 'Stopped waiting for the result. The code runner may still finish the run on its side.';

/** What starts a console note, as the editor's other warnings do. */
const WARNING_PREFIX = 'CodeEditor: ';

/** Asking for JSON keeps a dev server from answering with its HTML page. */
const JSON_HEADERS = Object.freeze({ accept: 'application/json' });

/**
 * A run's headers. The execute function refuses any body that is not sent as application/json
 * (415): a page on another site cannot send that type without the browser asking first, so it
 * cannot run code through a reader's password session.
 */
const POST_HEADERS = Object.freeze({ ...JSON_HEADERS, 'content-type': 'application/json' });

/** The shared runtimes request of this page load, by URL (absent until asked, and again after a failure). */
const runtimesPromises = new Map();

/** The fetch to use: the injected one, else the global one (looked up when called), else null. */
function fetchFor(fetchImpl) {
	if (typeof fetchImpl === 'function') return fetchImpl;
	if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
	return null;
}

/** A response's content-type ('' when it has none). */
function contentTypeOf(response) {
	return response?.headers?.get?.('content-type') ?? '';
}

/** A response's body as text ('' when it cannot be read). */
async function textOf(response) {
	try {
		return await response.text();
	} catch {
		return '';
	}
}

/** console.warn, looked up when called (so a test may replace console.warn). */
function warn(message) {
	console.warn(message);
}

/** Prints `error`'s setup note, if it has one (see THE CONSOLE), and gives `error` back. */
function withSetupNote(error) {
	if (error.setup !== null) warn(`${WARNING_PREFIX}${error.setup}`);
	return error;
}

/** Parsed JSON, or undefined when the text is not JSON. */
function parseJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** The RunError for an answer that is not the JSON expected. */
function unreadableAnswer(response) {
	const type = contentTypeOf(response) || 'no content-type';
	return new RunError(`The code runner's answer could not be read (${type}).`, { kind: 'upstream', status: response.status });
}

/** The RunError for a request that got no answer. */
function networkError(error) {
	const detail = error?.message ? ` (${error.message})` : '';
	return new RunError(`Could not reach the code runner${detail}. Check the connection and try again.`, { kind: 'network' });
}

/** One runtime as the editor keeps it: { language, version, aliases, runtime }, or null when it is not one. */
function cleanRuntime(entry) {
	if (!entry || typeof entry !== 'object') return null;
	if (typeof entry.language !== 'string' || typeof entry.version !== 'string') return null;
	const aliases = Array.isArray(entry.aliases) ? entry.aliases.filter((alias) => typeof alias === 'string') : [];
	const runtime = typeof entry.runtime === 'string' && entry.runtime !== '' ? entry.runtime : null;
	return { language: entry.language, version: entry.version, aliases, runtime };
}

/** What a runtimes request that threw unexpectedly (a broken response object) resolves with. */
function unexpectedFailure(error) {
	const detail = error?.message ? `: ${error.message}` : '';
	return { runtimes: [], error: new RunError(`The list of runtimes could not be read${detail}.`, { kind: 'upstream' }) };
}

/** The runtimes request itself: { runtimes, error } (fetchRuntimes catches anything it throws). */
async function loadRuntimes(fetchImpl, url) {
	const doFetch = fetchFor(fetchImpl);
	if (doFetch === null) return { runtimes: [], error: networkError({ message: 'no fetch in this environment' }) };
	let response;
	try {
		response = await doFetch(url, { method: 'GET', headers: JSON_HEADERS });
	} catch (error) {
		return { runtimes: [], error: networkError(error) };
	}
	const text = await textOf(response);
	if (!response.ok) return { runtimes: [], error: explainHttpError(response.status, text, contentTypeOf(response)) };
	const body = parseJson(text);
	if (!Array.isArray(body)) return { runtimes: [], error: unreadableAnswer(response) };
	const runtimes = body.map(cleanRuntime).filter((runtime) => runtime !== null);
	return { runtimes, error: null };
}

/**
 * The runtimes installed on the code runner: Promise<{ runtimes, error }> (see the header).
 * One request per page load and `url` (RUNTIMES_URL unless the site says otherwise); a failure
 * is not remembered.
 */
export function fetchRuntimes({ fetchImpl, url = RUNTIMES_URL } = {}) {
	const shared = runtimesPromises.get(url);
	if (shared !== undefined) return shared;
	const request = loadRuntimes(fetchImpl, url).catch(unexpectedFailure).then((result) => {
		if (result.error !== null && runtimesPromises.get(url) === request) runtimesPromises.delete(url);
		return result;
	});
	runtimesPromises.set(url, request);
	return request;
}

/** Forget the shared runtimes answers (tests). */
export function resetRuntimesCache() {
	runtimesPromises.clear();
}

/** The RunError for a stopped request. */
function abortedError() {
	return new RunError(MESSAGE_ABORTED, { kind: 'aborted' });
}

/** Was this failure the signal aborting? */
function isAbort(error, signal) {
	return signal?.aborted === true || error?.name === 'AbortError';
}

/** POST the payload to `url`; the response, or a RunError ('aborted' / 'network'). */
async function postPayload(doFetch, payload, signal, url) {
	try {
		return await doFetch(url, {
			method: 'POST',
			headers: POST_HEADERS,
			body: JSON.stringify(payload),
			signal,
		});
	} catch (error) {
		throw isAbort(error, signal) ? abortedError() : networkError(error);
	}
}

/** The response body as text; a RunError when the read is aborted or cut off. */
async function readBody(response, signal) {
	try {
		return await response.text();
	} catch (error) {
		throw isAbort(error, signal) ? abortedError() : networkError(error);
	}
}

/**
 * Run code: POST `payload` (request.js > buildExecuteRequest) and resolve with Piston's JSON.
 *   signal      an AbortSignal: aborting stops the wait (fetch rejects) with a RunError of kind
 *               'aborted'; an answer that arrives after the abort is dropped
 *   fetchImpl   a fetch to use instead of the browser's (tests)
 * Rejects with a RunError (see the header).
 */
export async function executeCode(payload, { signal, fetchImpl, url = EXECUTE_URL } = {}) {
	if (signal?.aborted) throw abortedError();
	const doFetch = fetchFor(fetchImpl);
	if (doFetch === null) throw networkError({ message: 'no fetch in this environment' });
	const response = await postPayload(doFetch, payload, signal, url);
	const text = await readBody(response, signal);
	if (signal?.aborted) throw abortedError();
	if (!response.ok) throw withSetupNote(explainHttpError(response.status, text, contentTypeOf(response)));
	const body = parseJson(text);
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw unreadableAnswer(response);
	return body;
}
