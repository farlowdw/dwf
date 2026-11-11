/**
 * shared/functions/code-runner/runtimes.mjs — lists the languages and versions installed on the
 * site's Piston server, for the code editor's pickers: the page GETs
 * /.netlify/functions/runtimes (a site's one-line shim in netlify/functions), this function adds
 * the server's secret and asks PISTON_BASE_URL + /api/v2/runtimes.
 *
 * A MODERN NETLIFY FUNCTION
 *   An ES module whose default export is `async (request, context) => Response` (Netlify's
 *   current functions API; the retired Lambda shape is gone). The bundler takes a file as
 *   modern when it has a default export and NO `handler` export: never add one
 *   (__tests__/functionsLayout.test.mjs holds it). No `config` export: the function keeps
 *   Netlify's default URL, /.netlify/functions/runtimes, which the editor and the monaco-editor
 *   plugin's `runtimesUrl` default name (a `config.path` would REPLACE that URL). The logic is
 *   handleRuntimes(request, options), which the tests call with a fake environment, fetch and
 *   limiter; the default export passes the real ones.
 *
 * WHY
 *   The code editor (shared/components/CodeEditor) offers only what the server can run, and a
 *   server gains runtimes over time (Piston's package manager, on the server), so the list
 *   must come from the server, never from a hard-coded version. The browser cannot ask the
 *   server itself: its proxy needs a secret the page must never see (lib/piston.mjs).
 *
 * THE ANSWER
 *   200 and a JSON array, one entry per installed runtime, reduced to the four fields the editor
 *   uses (anything else Piston adds is dropped; an entry without a string language and version
 *   is skipped):
 *       [{ "language": "python", "version": "3.12.0",
 *          "aliases": ["py", "py3", "python3", "python3.12"], "runtime": null }, …]
 *   `aliases` is always an array, `runtime` a string (e.g. "node" for javascript, "gcc" for
 *   c++) or null. Cached by the browser for CACHE_SECONDS (cache-control: private, so never by
 *   a shared cache): a runtime installed on the server shows up within that time, or at once
 *   after a hard reload. The editor asks once per page load anyway
 *   (shared/components/CodeEditor/lib/codeRunner/client.js).
 *   Errors are JSON { message }, never cached, and name no variable, server or path
 *   (lib/piston.mjs > WHAT A CALLER IS TOLD; the log has the reason):
 *     a Piston error status as it is, in fixed words (lib/piston.mjs > upstreamStatusMessage;
 *          the server's own words go to the log) — except 401, 404, any 3xx, any other 2xx
 *          and a status a Response cannot carry (a 600 from an odd proxy), which become 502
 *          (lib/piston.mjs > pageStatusFor)
 *     403  the request came from another site (lib/origin.mjs > ORIGIN_REFUSED_MESSAGE). A
 *          request with no Origin and no Referer is let through: a same-origin GET carries no
 *          Origin, and a Referer can be stripped — a GET runs nothing, and another site's page
 *          cannot read the answer anyway (no CORS headers)
 *     405  not GET / HEAD (header allow: GET, HEAD)
 *     429  this client asked too often: RUNTIMES_LIMIT (lib/rateLimit.mjs; 60 per 60 s, off
 *          when CODE_RUNNER_RATE_LIMIT is "off"), with a retry-after header
 *     500  PISTON_BASE_URL / PISTON_PROXY_SECRET missing, or the secret holds a character a
 *          header cannot carry (lib/piston.mjs > configProblem: the message names no variable
 *          and never a value; the log names the variable)
 *     502  the server could not be reached, it answered with a redirect (never followed: the
 *          secret would go along), or its answer is not a JSON array
 *     504  no answer within UPSTREAM_TIMEOUT_MS (lib/piston.mjs)
 *   HEAD answers the same status and headers with no body. The checks run in that order:
 *   method, origin, rate limit, configuration. The rate limit's setting (CODE_RUNNER_RATE_LIMIT,
 *   only read for "off" here) is looked at once the method check has passed, and parsed once
 *   per warm instance (lib/rateLimit.mjs > instanceRateLimitSettings): a 405 costs no parse, and
 *   an unreadable value is logged once, not once per request. No answer carries an
 *   access-control-* header: another site's page cannot read the list, allowlisted or not (the
 *   test holds it so). Failures are logged (Netlify's function log) through lib/piston.mjs >
 *   createLogger, which replaces the secret with "[secret]". A GET runs nothing, so unlike
 *   execute.mjs it needs no media-type check.
 *
 * HOW TO CHANGE IT
 *   The browser cache time: CACHE_SECONDS. The fields kept per runtime: toRuntime() (the editor
 *   reads them in shared/components/CodeEditor/lib/codeRunner/runtimes.js). The public-site
 *   checks: lib/origin.mjs and lib/rateLimit.mjs; a test passes its own `limiter` to
 *   handleRuntimes, and the fake environment sets CODE_RUNNER_RATE_LIMIT to "off". Keep the
 *   limiter resolved inside respond(), after the method check (see THE ANSWER). A `config`
 *   export would be read now (see A MODERN NETLIFY FUNCTION for why none is set).
 *   Tests: __tests__/runtimes.test.mjs (`npm run test:shared`).
 */

import {
	BAD_GATEWAY,
	BASE_URL_VARIABLE,
	bodyExcerpt,
	callPiston,
	createLogger,
	errorResponse,
	failureResponse,
	isPlainObject,
	jsonResponse,
	loadConfig,
	pageStatusFor,
	parseJson,
	redactSecret,
	requestMethod,
	upstreamLogLine,
	upstreamStatusMessage,
	withoutBody,
} from './lib/piston.mjs';
import { FORBIDDEN, originProblem } from './lib/origin.mjs';
import { OFF, RUNTIMES_LIMIT, instanceRateLimitSettings, rateLimitRefusal, sharedLimiter } from './lib/rateLimit.mjs';

/** Label of this function's lines in the log. */
const LOG_LABEL = 'runtimes';

/** Piston's list of installed runtimes, under PISTON_BASE_URL. */
export const RUNTIMES_PATH = '/api/v2/runtimes';

/** The methods this function answers (HEAD: the same answer without a body). */
const ALLOWED_METHODS = Object.freeze(['GET', 'HEAD']);

/** How long the browser may reuse the list, in seconds. */
export const CACHE_SECONDS = 300;

/** The status of Piston's successful answer. */
const OK = 200;

/** The 502's words for a 200 whose body is not a JSON array (a wrong PISTON_BASE_URL; the log names it). */
export const UNEXPECTED_LIST_MESSAGE = "The code runner's server sent an unexpected runtime list.";

/** One runtime reduced to the editor's four fields, or null when it lacks a language or version. */
export function toRuntime(entry) {
	if (!isPlainObject(entry)) return null;
	const { language, version, aliases, runtime } = entry;
	if (typeof language !== 'string' || typeof version !== 'string') return null;
	return {
		language,
		version,
		aliases: Array.isArray(aliases) ? aliases.filter((alias) => typeof alias === 'string') : [],
		runtime: typeof runtime === 'string' ? runtime : null,
	};
}

/** The status the page sees for Piston's non-200 answer: another 2xx is no list either. */
function errorStatusFor(status) {
	if (status > OK && status < 300) return BAD_GATEWAY;
	return pageStatusFor(status);
}

/** Piston's answer for the page (see THE ANSWER in the file header); `secret` is replaced in what the log keeps. */
function answerFromUpstream(upstream, secret, log) {
	const { status, text } = upstream;
	if (status !== OK) {
		log(upstreamLogLine(status, RUNTIMES_PATH, redactSecret(text, secret)));
		return errorResponse(errorStatusFor(status), upstreamStatusMessage(status));
	}
	const parsed = parseJson(text);
	if (!parsed.ok || !Array.isArray(parsed.value)) {
		log(`The Piston server's runtime list is not a JSON array (${RUNTIMES_PATH}). Check ${BASE_URL_VARIABLE}. ${bodyExcerpt(redactSecret(text, secret))}`);
		return errorResponse(BAD_GATEWAY, UNEXPECTED_LIST_MESSAGE);
	}
	const runtimes = parsed.value.map(toRuntime).filter(Boolean);
	return jsonResponse(OK, runtimes, { 'cache-control': `private, max-age=${CACHE_SECONDS}` });
}

/** Asks Piston for the list and turns the outcome into the page's answer. */
async function fetchList(config, fetchImpl, log) {
	let upstream;
	try {
		upstream = await callPiston(config, RUNTIMES_PATH, { method: 'GET', fetchImpl });
	} catch (error) {
		return failureResponse(log, error);
	}
	return answerFromUpstream(upstream, config.secret, log);
}

/** The answer to a GET (the method check is done by the caller). */
async function respondToGet(env, fetchImpl, log) {
	const { config, failure } = loadConfig(env, log);
	if (failure) return failure;
	return fetchList(config, fetchImpl, log);
}

/** The public-site checks (see THE ANSWER: 403, 429): the refusal, or null. */
function publicSiteRefusal(request, context, env, limiter, log) {
	const refusedOrigin = originProblem(request, env, log, { originRequired: false });
	if (refusedOrigin) return errorResponse(FORBIDDEN, refusedOrigin);
	return rateLimitRefusal(request, context, limiter, log);
}

/** The limiter a request uses: the caller's, else this instance's RUNTIMES_LIMIT one (none when "off"; the setting read once per instance). */
function limiterFor(options, env, log) {
	if (options.limiter !== undefined) return options.limiter;
	if (instanceRateLimitSettings(env, log) === OFF) return null;
	return sharedLimiter(RUNTIMES_LIMIT);
}

/** Method check, the public-site checks, then the GET answer (body dropped for HEAD). */
async function respond(request, env, fetchImpl, options, log) {
	const method = requestMethod(request);
	if (!ALLOWED_METHODS.includes(method)) {
		return errorResponse(405, 'Use GET to list the runtimes.', { allow: ALLOWED_METHODS.join(', ') });
	}
	// Only now: a 405 costs no read of CODE_RUNNER_RATE_LIMIT (see THE ANSWER).
	const limiter = limiterFor(options, env, log);
	const refused = publicSiteRefusal(request, options.context, env, limiter, log);
	const response = refused ?? (await respondToGet(env, fetchImpl, log));
	if (method === 'HEAD') return withoutBody(response);
	return response;
}

/**
 * The function's logic, testable: `request` is a web Request; `options.context` is Netlify's
 * function context (its `ip` keys the rate limit; may be absent), and `env` and `limiter` (a
 * lib/rateLimit.mjs limiter, or null for none) default to the real ones. `fetchImpl` is a fetch
 * for the tests; without one the call goes over lib/piston.mjs > requestOverSocket, never the
 * global fetch. Always resolves to a Response, never rejects.
 */
export async function handleRuntimes(request, options = {}) {
	const { env = process.env, fetchImpl } = options;
	const log = createLogger(LOG_LABEL, env);
	try {
		return await respond(request, env, fetchImpl, options, log);
	} catch (error) {
		log(`Unexpected error: ${error && error.message}`);
		return errorResponse(500, 'The runtimes function failed unexpectedly.');
	}
}

/** The function Netlify runs (see A MODERN NETLIFY FUNCTION in the header). */
export default async (request, context) => handleRuntimes(request, { context });
