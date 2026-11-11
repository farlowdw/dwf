/**
 * shared/functions/code-runner/lib/piston.mjs — what the code editor's two functions share: the
 * Piston server's address and secret, one call to that server, the log, and the JSON answers sent
 * back to the page. Used by execute.mjs (runs code) and runtimes.mjs (lists the installed languages).
 *
 * WHY
 *   The code editor (shared/components/CodeEditor) runs code on the site's Piston server. The
 *   page never talks to that server itself: the server's proxy refuses any request without the
 *   secret header, and the secret must never reach a browser. So the page asks its own site's
 *   functions, and they add the secret here and forward the request.
 *
 * THE MODERN FUNCTIONS API
 *   Both functions are modern Netlify Functions (ES modules; `export default async (request,
 *   context) => Response`): a request is a web `Request` (its method, `headers.get()`, `url`,
 *   `arrayBuffer()`), an answer a web `Response`. The helpers here take and give those; nothing
 *   of the retired Lambda shape (event.httpMethod, event.body, { statusCode }) is left. The
 *   variables are read from `process.env`, which Netlify fills for a function (its own
 *   `Netlify.env.get()` reads the same values; `process.env` keeps the functions and their tests
 *   plain Node).
 *
 * THE SECRET (PISTON_PROXY_SECRET)
 *   Sent only in PROXY_HEADER, only to PISTON_BASE_URL: callPiston never follows a redirect
 *   (REFUSED_REDIRECT_STATUSES, as fetch's redirect: 'error'), because a client that follows one
 *   sends the header on to wherever it points. It is never part of a URL or an answer, and every
 *   log line goes through createLogger(), which replaces it with SECRET_PLACEHOLDER. A secret
 *   holding a character a header cannot carry (a line break pasted with it, for example) is
 *   refused as configuration (CONFIG_PROBLEMS.invalidSecret), before any request — Node would
 *   otherwise throw an error, and its fetch quotes the whole value in it.
 *
 * WHAT A CALLER IS TOLD (on a public site, that is anyone)
 *   The functions' answers name no variable, no server, no path and none of the server's own
 *   words: a caller learns nothing of how the site is set up. So each failure has two texts: the
 *   page's fixed words (the JSON { message }: CONFIG_PROBLEMS' `message`,
 *   upstreamStatusMessage(), …) and a log line for whoever runs the site, which names the
 *   variable to check and keeps the first LOGGED_BODY_CHARS characters of the server's answer
 *   (upstreamLogLine, bodyExcerpt). The editor tells failures apart by status and by the markers
 *   at the start of a message ("Missing server configuration", lib/origin.mjs's "Refused origin",
 *   lib/rateLimit.mjs's "Too many requests"), and its own console note names the variables.
 *   Only Piston's own 400 message, about the request, reaches the page (execute.mjs).
 *
 * THE CALL GOES OVER NODE'S OWN http / https, NOT THE GLOBAL fetch
 *   Netlify's function runtime replaces the global fetch with one that times every call by the
 *   host it reached, and adds that host to the function's answer in an `x-nf-fetch-timing`
 *   header (seen under `netlify dev`; whether Netlify's edge strips it is not documented). A
 *   call through fetch would so name the Piston server to every page. requestOverSocket uses
 *   node:https (node:http for an http:// base URL), which the runtime does not time. It sends a
 *   content-length and `connection: close` on a socket of its own (agent: false): a reused
 *   keep-alive socket the server has closed resets the request. It refuses the redirect
 *   statuses itself, and callPiston's time limit ends it through the signal. `fetchImpl` stays
 *   the tests' way in: anything shaped like fetch (fakePiston.mjs > fakeFetch).
 *
 * WHAT IT GIVES
 *   pistonConfig(env)        { baseUrl, secret } from PISTON_BASE_URL / PISTON_PROXY_SECRET
 *                            (Netlify environment variables; `netlify dev` injects them), or
 *                            null when it cannot be used (configProblem says why). baseUrl has
 *                            no trailing "/".
 *   configProblem(env)       why pistonConfig is null: CONFIG_PROBLEMS.missing (either variable
 *                            missing or blank) or CONFIG_PROBLEMS.invalidSecret (the secret holds
 *                            a character HEADER_VALUE_FORBIDDEN matches), each { message, log };
 *                            or null when usable.
 *   loadConfig(env, log)     { config, failure: null }, or { config: null, failure } where
 *                            failure is the 500 Response { message: <the problem's message> },
 *                            its log line written. Neither shows a value; only the log names a
 *                            variable. Both functions start with it.
 *   createLogger(label, env) log(message): one console.error line "[label] message" (Netlify's
 *                            function log) with every occurrence of the secret replaced by
 *                            SECRET_PLACEHOLDER. Every line the functions log goes through one.
 *   callPiston(config, path, { method, body, fetchImpl, timeoutMs })
 *                            one request to baseUrl + path WITH the secret header, redirects
 *                            refused, through requestOverSocket unless `fetchImpl` is given.
 *                            Resolves to { status, contentType, text } whatever the
 *                            status. Throws an Error whose `code` is TIMEOUT_CODE (no answer
 *                            within timeoutMs) or NETWORK_CODE (the server could not be reached,
 *                            or it answered with a redirect: the cause "unexpected redirect").
 *   requestOverSocket(url, { method, headers, body, signal })
 *                            the default transport (see THE CALL…): a fetch-shaped call that
 *                            resolves to { status, headers.get(), text() }; rejects for a
 *                            refused redirect, a connection that fails or is cut, an abort.
 *   jsonResponse / errorResponse / textResponse
 *                            web Responses: a JSON body (jsonResponse), the JSON { message } the
 *                            editor reads for every error (errorResponse), or a text body passed
 *                            through as it is (textResponse; no body on a status that forbids
 *                            one). All with `cache-control: no-store` unless the caller
 *                            overrides it.
 *   withoutBody(response)    the same status and headers with no body (a HEAD answer).
 *   failureResponse(log, error)
 *                            logs a failed callPiston with `log` and answers 504 for a timeout,
 *                            502 otherwise.
 *   pageStatusFor(status)    the status the page should see for an upstream status: 401, 404,
 *                            any 3xx, and any status a Response cannot carry (outside 200-599)
 *                            become 502. The editor reads 401 and 404 as the SITE's own
 *                            (401: a site password's session ended; 404: no functions here, as
 *                            under `npm start` —
 *                            shared/components/CodeEditor/lib/codeRunner/errors.js), a 3xx without the
 *                            redirect is no answer (the call refuses 301/302/303/307/308 itself; a
 *                            300 or 304 would arrive as a status), and a 600 from an odd proxy
 *                            would make `new Response()` throw (FIRST_RESPONSE_STATUS /
 *                            LAST_RESPONSE_STATUS). Everything else passes.
 *   upstreamStatusMessage(status)
 *                            the page's words for an error answer from the server: its status,
 *                            nothing else (see WHAT A CALLER IS TOLD).
 *   upstreamLogLine(status, path, text)
 *                            the log line for that answer: the status, Piston's path, "Check
 *                            PISTON_BASE_URL." for a re-labelled status, and bodyExcerpt(text).
 *   bodyExcerpt(text)        at most LOGGED_BODY_CHARS characters of a body for a log line, every
 *                            run of white space or control characters as one space. Its caller
 *                            replaces the secret first (redactSecret), so a cut never keeps a
 *                            piece of it.
 *   Small helpers both functions need: requestMethod, headerValue (a request header by name;
 *   '' when absent), isPlainObject, parseJson, messageFromBody, redactSecret, and
 *   redactForCaller(text, config): the secret AND the server's address replaced, for the two
 *   places where the server's own words go on to a caller (execute.mjs). The public-site
 *   guards live beside this file: lib/origin.mjs (which sites may ask) and lib/rateLimit.mjs (how
 *   often one client may).
 *
 * NOT A FUNCTION ITSELF
 *   Netlify deploys as a function only a .js / .mjs (…) file directly in a site's
 *   netlify/functions, or a subfolder holding index.* / <folder>.*. That folder holds the two
 *   shims (__tests__/functionShims.test.mjs), and lib/ holds no entry file of its own (keep it
 *   so: __tests__/functionsLayout.test.mjs checks), so this file ships only inside the functions
 *   that import it — esbuild bundles it into each (netlify.toml > [functions]).
 *
 * HOW TO CHANGE IT
 *   The header the Piston server's proxy checks: PROXY_HEADER (change both sides together).
 *   The variable names: BASE_URL_VARIABLE / PROXY_VARIABLE (also
 *   shared/functions/code-runner/README.md > Environment variables). How long a function waits for the server: UPSTREAM_TIMEOUT_MS —
 *   Netlify has its own limit on how long a function may run (the site's Functions settings);
 *   when that is shorter, Netlify's own error answers first and the page reports it as an
 *   upstream failure. Which upstream statuses are re-labelled: SITE_STATUSES, isRedirect() and
 *   isOutsideResponseRange() (FIRST_RESPONSE_STATUS / LAST_RESPONSE_STATUS: the web Response
 *   constructor's own range, so change them only when the platform's does).
 *   What a caller is told: the *_MESSAGE constants, CONFIG_PROBLEMS' `message`s and
 *   upstreamStatusMessage() (never a variable, a server's name, a path or the server's words:
 *   __tests__/readerWords.test.mjs holds it; keep "Missing server configuration" at the start of
 *   MISSING_CONFIG_MESSAGE, the editor reads it). What the log keeps of a server's answer:
 *   LOGGED_BODY_CHARS.
 *   What a log line shows instead of the secret: SECRET_PLACEHOLDER. Keep REDIRECT_MODE 'error'
 *   for an injected fetch ('follow' resends the secret to the redirect's target; 'manual' would
 *   need a 3xx answer of its own in both functions), and keep requestOverSocket refusing
 *   REFUSED_REDIRECT_STATUSES: never make it follow one. Never put the global fetch back as the
 *   default (see THE CALL…; __tests__/overSocket.test.mjs holds it).
 *   Tests: __tests__/ beside the functions (`npm run test:shared`).
 */

import http from 'node:http';
import https from 'node:https';

/**
 * The request header the Piston server's proxy requires (its value: PISTON_PROXY_SECRET). The
 * constant's name leaves out the word "secret", as PROXY_VARIABLE's does: that word, then a long
 * quoted value, is the shape scripts/lib/privacy.mjs refuses, and these two values are only names.
 */
export const PROXY_HEADER = 'x-piston-proxy-secret';

/** How long a function waits for the Piston server's whole answer, in milliseconds. */
export const UPSTREAM_TIMEOUT_MS = 25000;

/** fetch's redirect mode, for an injected fetch: a redirect is a network failure, never followed (see the header). */
export const REDIRECT_MODE = 'error';

/**
 * The statuses requestOverSocket refuses as a redirect, as fetch's redirect: 'error' does (the
 * Fetch standard's redirect statuses). A 300 or a 304 arrives as a status (pageStatusFor).
 */
export const REFUSED_REDIRECT_STATUSES = Object.freeze([301, 302, 303, 307, 308]);

/** The Node module that carries a request, by the URL's scheme (see THE CALL… in the header). */
const TRANSPORTS = Object.freeze({ 'http:': http, 'https:': https });

/** Environment variable holding the Piston server's origin, e.g. https://piston.example.com. */
export const BASE_URL_VARIABLE = 'PISTON_BASE_URL';

/** Environment variable holding the shared secret sent in PROXY_HEADER. */
export const PROXY_VARIABLE = 'PISTON_PROXY_SECRET';

/**
 * The 500's words when either variable is missing or blank. The editor reads its first words
 * (shared/components/CodeEditor/lib/codeRunner/errors.js > MISSING_CONFIG_MARKER); it names no
 * variable (see WHAT A CALLER IS TOLD): the log line does.
 */
export const MISSING_CONFIG_MESSAGE = 'Missing server configuration.';

/** The 500's words when the secret holds a character a header cannot carry: no variable, never the value. */
export const INVALID_SECRET_MESSAGE = 'Invalid server configuration.';

/**
 * Why the configuration cannot be used, as configProblem() gives it: the 500's words (`message`)
 * and the log line (`log`), which names the variables to check, never a value.
 */
export const CONFIG_PROBLEMS = Object.freeze({
	missing: Object.freeze({
		message: MISSING_CONFIG_MESSAGE,
		log: `Missing server configuration (${BASE_URL_VARIABLE} / ${PROXY_VARIABLE}).`,
	}),
	invalidSecret: Object.freeze({
		message: INVALID_SECRET_MESSAGE,
		log: `Invalid server configuration: ${PROXY_VARIABLE} contains a character a header cannot carry.`,
	}),
});

/** The 502's words when the server cannot be reached or answers with a redirect. */
export const UNREACHABLE_MESSAGE = 'Could not reach the code runner. Try again in a moment.';

/** The most characters of a server's answer a log line keeps (see WHAT A CALLER IS TOLD). */
export const LOGGED_BODY_CHARS = 300;

/** A run of white space or control characters, which a log line keeps as one space. */
const LOG_UNSAFE_RUN = /[\s\u0000-\u001f\u007f]+/g;

/**
 * A character an HTTP header value may NOT hold. Allowed are tab, space, visible ASCII and
 * 0x80-0xFF (RFC 9110 field values) — the same rule Node's fetch applies: it throws for \r, \n
 * and \0 (quoting the value), for any other control character, and for a character above 0xFF.
 */
const HEADER_VALUE_FORBIDDEN = /[^\t\x20-\x7e\x80-\xff]/;

/** What a log line shows in place of the secret. */
export const SECRET_PLACEHOLDER = '[secret]';

/** What an answer shows in place of the server's address. */
export const SERVER_PLACEHOLDER = '[server]';

/** Names every machine gives itself: no secret, so a run's output may print them. */
const LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1', '[::1]']);

/** The characters that mean something in a regular expression. */
const PATTERN_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

/** `code` of the Error callPiston throws when the server does not answer in time. */
export const TIMEOUT_CODE = 'UPSTREAM_TIMEOUT';

/** `code` of the Error callPiston throws when the server cannot be reached at all. */
export const NETWORK_CODE = 'UPSTREAM_NETWORK';

/** `code`s of requestOverSocket's own failures, each kept as NETWORK_CODE's cause for the log. */
export const REDIRECT_REFUSED_CODE = 'UPSTREAM_REDIRECT';
const ANSWER_CUT_CODE = 'UPSTREAM_CUT';
const UNKNOWN_SCHEME_CODE = 'UPSTREAM_SCHEME';

/** Causes Node's fetch (undici) reports for its own timeouts: treated as TIMEOUT_CODE too. */
const UNDICI_TIMEOUT_CODES = Object.freeze([
	'UND_ERR_CONNECT_TIMEOUT',
	'UND_ERR_HEADERS_TIMEOUT',
	'UND_ERR_BODY_TIMEOUT',
]);

/** How many levels of error.cause a log line follows. */
const MAX_CAUSE_DEPTH = 3;

/** Content type of every JSON answer the functions write themselves. */
export const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';

/** Every answer's cache rule unless a function overrides it (the runtime list does). */
const NEVER_CACHE = 'no-store';

/** Statuses a Response may not carry a body with (the constructor throws otherwise). */
const NULL_BODY_STATUSES = Object.freeze([204, 205, 304]);

/** Upstream statuses the editor would mistake for the site's own (see pageStatusFor). */
export const SITE_STATUSES = Object.freeze([401, 404]);

/** The range of redirect statuses (3xx). */
const FIRST_REDIRECT_STATUS = 300;
const FIRST_STATUS_AFTER_REDIRECTS = 400;

/**
 * The statuses a web Response may carry (its constructor throws a RangeError outside them). An
 * odd proxy in front of a wrong PISTON_BASE_URL can answer 600: Node's http client (and its
 * fetch) hands any three-digit status over, so such a status is re-labelled 502 (see
 * pageStatusFor) instead of reaching `new Response()`. (A 1xx never arrives as the answer: the
 * client keeps waiting for the final one, and the timeout ends it.)
 */
const FIRST_RESPONSE_STATUS = 200;
const LAST_RESPONSE_STATUS = 599;

/** What the page gets instead of a re-labelled status, and for an unreachable server. */
export const BAD_GATEWAY = 502;

/** What the page gets when the Piston server does not answer in time. */
export const GATEWAY_TIMEOUT = 504;

/** The status of an answer saying the function's own configuration is unusable. */
const SERVER_ERROR = 500;

/** Trailing slashes at the end of PISTON_BASE_URL (paths are added with their own "/"). */
const TRAILING_SLASHES = /\/+$/;

/** A variable's value, trimmed; '' when it is unset (or there is no environment at all). */
function readVariable(env, name) {
	const value = env ? env[name] : undefined;
	if (typeof value !== 'string') return '';
	return value.trim();
}

/** PISTON_BASE_URL without its trailing slashes; '' when unset. */
function readBaseUrl(env) {
	return readVariable(env, BASE_URL_VARIABLE).replace(TRAILING_SLASHES, '');
}

/** Why the configuration cannot be used (one of CONFIG_PROBLEMS), or null when it can. */
export function configProblem(env = process.env) {
	const secret = readVariable(env, PROXY_VARIABLE);
	if (readBaseUrl(env) === '' || secret === '') return CONFIG_PROBLEMS.missing;
	if (HEADER_VALUE_FORBIDDEN.test(secret)) return CONFIG_PROBLEMS.invalidSecret;
	return null;
}

/** { baseUrl, secret } from the environment, or null when configProblem() finds a problem. */
export function pistonConfig(env = process.env) {
	if (configProblem(env) !== null) return null;
	return { baseUrl: readBaseUrl(env), secret: readVariable(env, PROXY_VARIABLE) };
}

/** `text` with every occurrence of `secret` replaced by SECRET_PLACEHOLDER ('' secret: as is). */
export function redactSecret(text, secret) {
	if (typeof secret !== 'string' || secret === '') return text;
	return text.split(secret).join(SECRET_PLACEHOLDER);
}

/** How the server's address can be written: the base URL, its host with the port, its host name (not a local one). */
function serverNames(baseUrl) {
	let url;
	try {
		url = new URL(baseUrl);
	} catch {
		return [];
	}
	const names = [baseUrl, url.host, url.hostname].filter((name) => name !== '' && !LOCAL_HOSTS.includes(name));
	return [...new Set(names)];
}

/**
 * `text` for a caller: the secret replaced (redactSecret), and the server's address
 * (`config.baseUrl`, its host) by SERVER_PLACEHOLDER, in any letter case. For the server's own
 * words that go on to the page: its 400 about the request, a run's output.
 */
export function redactForCaller(text, config) {
	const safe = redactSecret(text, config.secret);
	const names = serverNames(config.baseUrl);
	if (names.length === 0) return safe;
	const pattern = names.map((name) => name.replace(PATTERN_CHARACTERS, '\\$&')).join('|');
	return safe.replace(new RegExp(pattern, 'gi'), SERVER_PLACEHOLDER);
}

/** A log(message) for one request: "[label] message" with console.error, the secret redacted. */
export function createLogger(label, env = process.env) {
	const secret = readVariable(env, PROXY_VARIABLE);
	return (message) => console.error(`[${label}] ${redactSecret(String(message), secret)}`);
}

/** { config, failure: null }, or { config: null, failure: <logged 500 answer> } (see the header). */
export function loadConfig(env, log) {
	const problem = configProblem(env);
	if (problem === null) return { config: pistonConfig(env), failure: null };
	log(problem.log);
	return { config: null, failure: errorResponse(SERVER_ERROR, problem.message) };
}

/** An Error carrying one of the codes above; `cause` keeps the original for the log. */
function upstreamError(code, message, cause) {
	const error = new Error(message, { cause });
	error.code = code;
	return error;
}

/** True when a fetch failure was a timeout (a TimeoutError, or one of undici's own). */
function isFetchTimeout(error) {
	if (error && error.name === 'TimeoutError') return true;
	const cause = error && error.cause;
	return Boolean(cause && UNDICI_TIMEOUT_CODES.includes(cause.code));
}

/** The headers of a request to Piston: the secret always, a content type when there is a body. */
function requestHeaders(config, body) {
	const headers = { accept: 'application/json', [PROXY_HEADER]: config.secret };
	if (body !== undefined) headers['content-type'] = 'application/json';
	return headers;
}

/** An Error with a `code` (the transport's own failures, kept as a cause for the log). */
function codedError(code, message) {
	return Object.assign(new Error(message), { code });
}

/** The headers requestOverSocket sends: the caller's, `connection: close`, and the body's length when there is one. */
function socketHeaders(headers, payload) {
	const sent = { ...headers, connection: 'close' };
	if (payload !== null) sent['content-length'] = String(payload.length);
	return sent;
}

/** A header of a Node answer as fetch's headers.get() gives it: a string, or null when absent. */
function headerText(value) {
	if (value === undefined) return null;
	return Array.isArray(value) ? value.join(', ') : String(value);
}

/** The fetch-shaped answer requestOverSocket resolves to. */
function answerOf(status, headers, text) {
	return {
		status,
		headers: { get: (name) => headerText(headers[String(name).toLowerCase()]) },
		text: async () => text,
	};
}

/** Reads a Node answer to its end: the answer, or a rejection for a refused redirect or a cut connection. */
function readAnswer(response) {
	return new Promise((resolve, reject) => {
		const status = response.statusCode;
		if (REFUSED_REDIRECT_STATUSES.includes(status)) {
			response.destroy();
			reject(codedError(REDIRECT_REFUSED_CODE, `unexpected redirect (${status})`));
			return;
		}
		const chunks = [];
		response.on('data', (chunk) => chunks.push(chunk));
		response.on('error', reject);
		response.on('close', () => {
			if (!response.complete) reject(codedError(ANSWER_CUT_CODE, 'the connection closed before the whole answer arrived'));
		});
		response.on('end', () => resolve(answerOf(status, response.headers, Buffer.concat(chunks).toString('utf8'))));
	});
}

/**
 * The default transport (see THE CALL… in the header): one request over node:https or node:http,
 * on a socket of its own. Takes fetch's (url, { method, headers, body, signal }) and resolves to
 * { status, headers.get(), text() }; rejects for a refused redirect, a failed or cut connection,
 * an aborted signal, or a scheme other than http and https. Every event that can fail has a
 * listener, so no failure is ever thrown outside the promise.
 */
export function requestOverSocket(url, { method = 'GET', headers = {}, body, signal } = {}) {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		const transport = TRANSPORTS[target.protocol];
		if (transport === undefined) throw codedError(UNKNOWN_SCHEME_CODE, `${target.protocol} is neither http: nor https:`);
		const payload = body === undefined ? null : Buffer.from(body, 'utf8');
		const request = transport.request(target, { method, headers: socketHeaders(headers, payload), agent: false, signal });
		request.on('error', reject);
		request.on('response', (response) => readAnswer(response).then(resolve, reject));
		request.end(payload ?? undefined);
	});
}

/** The request itself, read to the end; any failure becomes a coded upstreamError. */
async function sendRequest(config, path, { method, body, fetchImpl, signal }) {
	try {
		const response = await fetchImpl(`${config.baseUrl}${path}`, {
			method,
			headers: requestHeaders(config, body),
			body,
			redirect: REDIRECT_MODE,
			signal,
		});
		const text = await response.text();
		const contentType = response.headers.get('content-type') || '';
		return { status: response.status, contentType, text };
	} catch (error) {
		if (isFetchTimeout(error)) {
			throw upstreamError(TIMEOUT_CODE, `The Piston server timed out (${path}).`, error);
		}
		throw upstreamError(NETWORK_CODE, `Could not reach the Piston server (${path}).`, error);
	}
}

/**
 * One request to the Piston server with the secret, through requestOverSocket unless the caller
 * passes a fetch (the tests). Resolves to { status, contentType, text }; throws a coded Error on a
 * timeout or a network failure (see the file header).
 */
export async function callPiston(config, path, options = {}) {
	const { method = 'GET', body, fetchImpl = requestOverSocket, timeoutMs = UPSTREAM_TIMEOUT_MS } = options;
	const controller = new AbortController();
	let timer = null;
	const timeout = new Promise((resolve, reject) => {
		timer = setTimeout(() => {
			// Reject first, then abort: the race below must end with the timeout, not with the
			// network error the abort causes.
			reject(upstreamError(TIMEOUT_CODE, `No answer from the Piston server within ${timeoutMs} ms (${path}).`));
			controller.abort();
		}, timeoutMs);
	});
	try {
		const request = sendRequest(config, path, { method, body, fetchImpl, signal: controller.signal });
		return await Promise.race([request, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

/** A Response with `text` as its body (none on a status that forbids one); `headers` override the defaults. */
export function textResponse(status, text, headers = {}) {
	const body = NULL_BODY_STATUSES.includes(status) ? null : text;
	return new Response(body, { status, headers: { 'cache-control': NEVER_CACHE, ...headers } });
}

/** A Response with a JSON body; `headers` (lowercase names) override the defaults. */
export function jsonResponse(status, value, headers = {}) {
	return textResponse(status, JSON.stringify(value), { 'content-type': JSON_CONTENT_TYPE, ...headers });
}

/** A JSON answer { message } — the shape the editor reads for every error. */
export function errorResponse(status, message, headers = {}) {
	return jsonResponse(status, { message }, headers);
}

/** The same status and headers with no body (for HEAD). */
export function withoutBody(response) {
	return new Response(null, { status: response.status, headers: response.headers });
}

/**
 * The error's causes in a few words for the log, e.g.
 * " (TypeError: fetch failed; caused by ECONNREFUSED: connect ECONNREFUSED …)", or ''.
 * Node's fetch wraps the real reason one level down, so the chain is followed.
 */
function causeText(error) {
	const parts = [];
	let cause = error && error.cause;
	while (cause && parts.length < MAX_CAUSE_DEPTH) {
		parts.push(`${cause.code || cause.name || 'Error'}: ${cause.message || 'no message'}`);
		cause = cause.cause;
	}
	if (parts.length === 0) return '';
	return ` (${parts.join('; caused by ')})`;
}

/** Log a failed callPiston with `log` (createLogger) and answer the page: 504 for a timeout, else 502. */
export function failureResponse(log, error) {
	log(`${error && error.message}${causeText(error)}`);
	if (error && error.code === TIMEOUT_CODE) {
		const seconds = UPSTREAM_TIMEOUT_MS / 1000;
		return errorResponse(GATEWAY_TIMEOUT, `The code runner did not answer within ${seconds} s. Try again in a moment.`);
	}
	return errorResponse(BAD_GATEWAY, UNREACHABLE_MESSAGE);
}

/** True for a 3xx status. */
function isRedirect(status) {
	return status >= FIRST_REDIRECT_STATUS && status < FIRST_STATUS_AFTER_REDIRECTS;
}

/** True for a status a web Response cannot carry (outside 200-599). */
function isOutsideResponseRange(status) {
	return status < FIRST_RESPONSE_STATUS || status > LAST_RESPONSE_STATUS;
}

/** True when the page must not see this upstream status as it is (see pageStatusFor). */
function isRelabelled(status) {
	return SITE_STATUSES.includes(status) || isRedirect(status) || isOutsideResponseRange(status);
}

/** The status the page should see for an upstream status (see the file header). */
export function pageStatusFor(status) {
	if (isRelabelled(status)) return BAD_GATEWAY;
	return status;
}

/** The request's HTTP method in capitals ('' when there is no request). */
export function requestMethod(request) {
	const method = request && request.method;
	if (typeof method !== 'string') return '';
	return method.toUpperCase();
}

/** True for a JSON object (not null, not an array). */
export function isPlainObject(value) {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A request header's value (`name` in any case; Headers compare names case-insensitively); '' when absent. */
export function headerValue(request, name) {
	const headers = request && request.headers;
	if (!headers || typeof headers.get !== 'function') return '';
	return headers.get(name) ?? '';
}

/** { ok: true, value } for valid JSON text, { ok: false } otherwise. */
export function parseJson(text) {
	try {
		return { ok: true, value: JSON.parse(text) };
	} catch {
		return { ok: false };
	}
}

/** The `message` of a JSON body like {"message":"…"}, or null. */
export function messageFromBody(text) {
	const parsed = parseJson(text);
	if (!parsed.ok || !isPlainObject(parsed.value)) return null;
	const { message } = parsed.value;
	if (typeof message !== 'string' || message.trim() === '') return null;
	return message;
}

/** "The code runner's server answered 503." — the page's words for an error answer (see WHAT A CALLER IS TOLD). */
export function upstreamStatusMessage(status) {
	return `The code runner's server answered ${status}.`;
}

/** "Body: <at most LOGGED_BODY_CHARS characters>" or "The body was empty." — `text` with the secret already replaced. */
export function bodyExcerpt(text) {
	const flat = String(text ?? '').replace(LOG_UNSAFE_RUN, ' ').trim();
	if (flat === '') return 'The body was empty.';
	if (flat.length <= LOGGED_BODY_CHARS) return `Body: ${flat}`;
	return `Body: ${flat.slice(0, LOGGED_BODY_CHARS)} [cut at ${LOGGED_BODY_CHARS} characters]`;
}

/**
 * The log line for an error answer from the server, e.g. "The Piston server answered 401 for
 * /api/v2/execute. Check PISTON_BASE_URL. Body: …" (the check only for a re-labelled status).
 * `text` comes with the secret already replaced (redactSecret).
 */
export function upstreamLogLine(status, path, text) {
	const check = isRelabelled(status) ? ` Check ${BASE_URL_VARIABLE}.` : '';
	return `The Piston server answered ${status} for ${path}.${check} ${bodyExcerpt(text)}`;
}
