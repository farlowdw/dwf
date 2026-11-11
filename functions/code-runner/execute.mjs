/**
 * shared/functions/code-runner/execute.mjs — runs a piece of code for the code editor: the page
 * POSTs JSON to /.netlify/functions/execute (a site's one-line shim in netlify/functions), this
 * function checks the request, adds the Piston server's secret and forwards it to
 * PISTON_BASE_URL + /api/v2/execute.
 *
 * A MODERN NETLIFY FUNCTION
 *   An ES module whose default export is `async (request, context) => Response` (Netlify's
 *   current functions API; the retired Lambda shape — exports.handler, event.body — is gone).
 *   The bundler takes a file as modern when it has a default export and NO `handler` export:
 *   never add one (__tests__/functionsLayout.test.mjs holds it). No `config` export: the
 *   function keeps Netlify's default URL, /.netlify/functions/execute, which the editor and the
 *   monaco-editor plugin's `executeUrl` default name (a `config.path` would REPLACE that URL).
 *   The logic is handleExecute(request, options), which the tests call with a fake environment,
 *   fetch and limiter; the default export passes the real ones.
 *
 * WHY
 *   The code editor (shared/components/CodeEditor) runs code in any language and version
 *   installed on the site's Piston server. The server's proxy needs a secret the browser must
 *   never see, so the page talks to this function and the function talks to the server
 *   (lib/piston.mjs). It is a way to run code on that server, so it accepts only Piston's own
 *   fields within fixed bounds, and a site keeps strangers out with a site password or the
 *   checks under ON A PUBLIC SITE (README.md in this folder).
 *
 * ONLY application/json (why the 415)
 *   Behind a site password, that password's cookie is the only lock, and a browser may attach it
 *   to a request another site makes. That site can send a "simple" request without asking first
 *   (a form posting text/plain, a no-cors fetch), but never one typed application/json: for that
 *   the browser asks this function first (a CORS preflight, an OPTIONS), and the 405 below refuses
 *   it. So a request whose content-type is not application/json is refused before its body is
 *   read — that is what keeps another site from running code here as a signed-in reader.
 *
 * ON A PUBLIC SITE (lib/origin.mjs, lib/rateLimit.mjs;
 * shared/functions/code-runner/README.md > Running it on a public site)
 *   Without a site password anyone can reach this function, so two more checks run before the
 *   body is read. (1) The request's origin (its Origin header, else its Referer's origin) must
 *   be the site itself (the host of request.url), or an origin named in
 *   CODE_RUNNER_ALLOWED_ORIGINS; none at all (a browser always sends one on a POST) or any
 *   other is a 403 whose message starts with "Refused origin". Note what the variable can and
 *   cannot do: this function sends NO CORS header and answers the preflight with 405 (above),
 *   so a browser PAGE on another origin can never call it, allowlisted or not — the variable
 *   only admits a request that reaches the function carrying that Origin some other way (a
 *   server-side proxy, `netlify dev` opened from a phone at the machine's LAN address:
 *   lib/origin.mjs). Each site runs its own copy of the functions, so the variable normally
 *   stays unset. (2) Each client IP (the function context's `ip`, else Netlify's
 *   x-nf-client-connection-ip header) may make CODE_RUNNER_RATE_LIMIT requests ("N/S": N per
 *   S seconds; the default is 20 per 60 s; "off" switches it off) — above that, a 429 whose
 *   message starts with "Too many requests", with a retry-after header. The bucket lives in the
 *   warm function instance (no store, no service), so it bounds abuse rather than counting
 *   exactly; a site password, where there is one, stays the real lock.
 *
 * THE REQUEST (POST, content-type application/json — parameters such as "; charset=utf-8"
 * allowed, any case; JSON with Piston's own field names;
 * shared/components/CodeEditor/lib/codeRunner/request.js builds it)
 *   language              string, 1-40 characters            "python", "c++", "javascript"
 *   version               string, 1-40 characters; "*" when   "3.12.0", "3.x", "*"
 *                         absent or blank
 *   files                 1-5 of { name?, content }           the first one is run
 *                         (name up to 100 characters)
 *   stdin                 string up to 65,536 characters; "" when absent
 *   args                  up to 20 strings of up to 1,000 characters; [] when absent
 *   compile_timeout       ms, clamped to 1..MAX_COMPILE_TIMEOUT_MS (10 s, the server's limit)
 *   run_timeout           ms, clamped to 1..MAX_RUN_TIMEOUT_MS (3 s, the server's limit)
 *   compile_memory_limit  bytes, at least MIN_MEMORY_LIMIT_BYTES (1 MiB: Piston reads 0 to 999
 *   run_memory_limit      as NO limit); -1 = the server's own limit, which is sent as "absent"
 *                         (Piston refuses -1 once a limit is set)
 *   Every other field is dropped, at the top and inside each file. The Piston server applies
 *   its own maximums on top (run_timeout above its configured limit → its 400 message).
 *   A file name is passed on as it is: which name a language needs is the library's choice
 *   (shared/components/CodeEditor/lib/codeRunner/languages.js > submitName — Piston's go, c, c++ and
 *   typescript runners add the extension themselves, so it sends "main" for those; checked on a
 *   Piston server on 2026-10-24, while java, csharp and kotlin stay unverified).
 *
 * SIZE (100 KB)
 *   The Piston server reads a request body of at most about 100 KB (102,400 bytes, its JSON
 *   parser's fixed default) and answers a larger one with a 400 that carries no message
 *   ({ stack: "PayloadTooLargeError: …" }; checked on a Piston server on 2026-10-24: 105 KB
 *   refused, 95 KB run). So this function refuses, with its own 413, a body over MAX_BODY_BYTES
 *   (the request's bytes as received, `request.arrayBuffer()` — bytes, not characters) and a
 *   cleaned request over MAX_FORWARD_BYTES (the JSON actually forwarded: the defaults it adds
 *   can make it larger than the body) — both a little under Piston's limit. Should Piston
 *   still refuse a body as too large, its 400 becomes the same 413.
 *
 * THE ANSWER (never cached, always JSON; lib/piston.mjs > WHAT A CALLER IS TOLD)
 *   A 2xx: Piston's status and JSON body as they came, 200 { run, compile?, language, version };
 *   a 2xx whose body is not JSON is a 502 (a wrong PISTON_BASE_URL). A 400: Piston's own
 *   { message }, e.g. "python-3.10.0 runtime is unknown" (about the request, so the page shows
 *   it); its PayloadTooLargeError (no message) is a 413, and a 400 with no Piston message at all
 *   (a proxy's page, an http:// address on a TLS port) a 502. Any other status from upstream
 *   keeps its status, in this function's fixed words (lib/piston.mjs > upstreamStatusMessage),
 *   except that a 401, 404, any 3xx or a status a Response cannot carry (a 600 from an odd proxy)
 *   is a 502 (lib/piston.mjs > pageStatusFor). The server's own words, and the variable to check,
 *   go to the log only; the secret is replaced wherever the server's words are kept, and the
 *   server's address too where they go on to the page (a 400's message, a run's output:
 *   lib/piston.mjs > redactForCaller). This
 *   function's own answers are JSON { message }:
 *     400  not JSON, or a field out of bounds (the message names the field)
 *     403  the request came from another site, or from no page at all: lib/origin.mjs >
 *          ORIGIN_REFUSED_MESSAGE (body never read)
 *     405  not a POST (header allow: POST) — a CORS preflight (OPTIONS) included: no answer
 *          of this function ever carries an access-control-* header (the test holds it so)
 *     413  over MAX_BODY_BYTES / MAX_FORWARD_BYTES: TOO_LARGE_MESSAGE
 *     415  content-type is not application/json: WRONG_MEDIA_TYPE_MESSAGE (body never read)
 *     429  this client has run too often: lib/rateLimit.mjs > rateLimitMessage, with a
 *          retry-after header in seconds (body never read)
 *     500  PISTON_BASE_URL / PISTON_PROXY_SECRET missing, or the secret holds a character a
 *          header cannot carry (lib/piston.mjs > configProblem: the message names no variable
 *          and never a value; the log names the variable)
 *     502  the server could not be reached, or it answered with a redirect (never followed)
 *     504  no answer within UPSTREAM_TIMEOUT_MS (lib/piston.mjs)
 *   The checks run in that order: method, media type, origin, rate limit, configuration, size,
 *   JSON, fields, the forwarded size. The rate limit's setting (CODE_RUNNER_RATE_LIMIT) is read
 *   only once the method and media-type checks have passed, and parsed once per warm instance
 *   (lib/rateLimit.mjs > instanceRateLimitSettings): a refused request costs no parse, and an
 *   unreadable value is logged once, not once per request. Failures are logged (Netlify's
 *   function log) through lib/piston.mjs > createLogger, which replaces the secret with "[secret]".
 *
 * HOW TO CHANGE IT
 *   The bounds: the constants below. MIN_TIMEOUT_MS / MAX_COMPILE_TIMEOUT_MS / MAX_RUN_TIMEOUT_MS
 *   must equal shared/components/CodeEditor/lib/codeRunner/request.js > TIMEOUT_BOUNDS (the editor
 *   clamps to the same numbers to show the limit a run really had; __tests__/execute.test.mjs
 *   checks they agree) and the Piston server's own limits.
 *   The size limits: MAX_BODY_BYTES / MAX_FORWARD_BYTES, never above Piston's 102,400 bytes.
 *   A new Piston field: add a reader in buildRequest() — anything not read there never reaches
 *   the server. The public-site checks: lib/origin.mjs and lib/rateLimit.mjs (their variables,
 *   defaults and messages); a test passes its own `limiter` to handleExecute, and the fake
 *   environment sets CODE_RUNNER_RATE_LIMIT to "off". Keep the limiter resolved inside
 *   respond(), after the method and media-type checks (see THE ANSWER). A `config` export
 *   (Netlify's options: `method`, `rateLimit`, …) would be read now — but `path` changes the
 *   URL (see A MODERN NETLIFY FUNCTION) and Netlify's rate limit needs one, so none is set.
 *   Tests: __tests__/execute.test.mjs (`npm run test:shared`).
 */

import {
	BAD_GATEWAY,
	BASE_URL_VARIABLE,
	bodyExcerpt,
	callPiston,
	createLogger,
	errorResponse,
	failureResponse,
	headerValue,
	isPlainObject,
	JSON_CONTENT_TYPE,
	loadConfig,
	messageFromBody,
	pageStatusFor,
	parseJson,
	redactForCaller,
	redactSecret,
	requestMethod,
	textResponse,
	upstreamLogLine,
	upstreamStatusMessage,
} from './lib/piston.mjs';
import { FORBIDDEN, originProblem } from './lib/origin.mjs';
import { instanceRateLimitSettings, rateLimitRefusal, sharedLimiter } from './lib/rateLimit.mjs';

/** Label of this function's lines in the log. */
const LOG_LABEL = 'execute';

/** Piston's run endpoint, under PISTON_BASE_URL. */
export const EXECUTE_PATH = '/api/v2/execute';

/** The only media type accepted (see ONLY application/json in the header). */
const REQUIRED_MEDIA_TYPE = 'application/json';

/** The 415 message. */
export const WRONG_MEDIA_TYPE_MESSAGE = 'Send the request as application/json.';

/** Largest request body accepted, in bytes; under Piston's 102,400 (see SIZE). */
export const MAX_BODY_BYTES = 100000;

/** Largest JSON forwarded to Piston, in bytes (UTF-8); under Piston's 102,400 (see SIZE). */
export const MAX_FORWARD_BYTES = 100000;

/** Bytes in the "KB" of TOO_LARGE_MESSAGE. */
const BYTES_PER_KB = 1000;

/** The 413 message, for either size limit and for Piston's own refusal. */
export const TOO_LARGE_MESSAGE = `The code and its input are too large to run (at most ${MAX_FORWARD_BYTES / BYTES_PER_KB} KB).`;

/** The words in Piston's 400 body when its JSON parser refused the body as too large. */
const PAYLOAD_TOO_LARGE_MARKER = 'PayloadTooLargeError';

/** Status of this function's "too large" answer. */
const PAYLOAD_TOO_LARGE = 413;

/** Status of this function's "not application/json" answer. */
const UNSUPPORTED_MEDIA_TYPE = 415;

/** Longest `language`, in characters. */
const MAX_LANGUAGE_CHARS = 40;

/** Longest `version` (or selector), in characters. */
const MAX_VERSION_CHARS = 40;

/** The version sent when the request names none: the newest installed. */
export const DEFAULT_VERSION = '*';

/** Fewest and most files per request. */
const MIN_FILES = 1;
const MAX_FILES = 5;

/** Longest file name, in characters. */
const MAX_FILE_NAME_CHARS = 100;

/** Longest standard input, in characters. */
const MAX_STDIN_CHARS = 65536;

/** Most command-line arguments, and the longest one in characters. */
const MAX_ARGS = 20;
const MAX_ARG_CHARS = 1000;

/**
 * Bounds a timeout is clamped into, in milliseconds. The maxima are the Piston server's own limits
 * (its PISTON_COMPILE_TIMEOUT / PISTON_RUN_TIMEOUT, read from a server's 400 answers on 2026-10-23):
 * Piston REFUSES a request above them ("run_timeout cannot exceed the configured limit of 3000"),
 * so clamping here keeps a page's larger `limits` working. Change them together with the server
 * AND shared/components/CodeEditor/lib/codeRunner/request.js > TIMEOUT_BOUNDS (the tests check the
 * two agree).
 */
export const MIN_TIMEOUT_MS = 1;
export const MAX_COMPILE_TIMEOUT_MS = 10000;
export const MAX_RUN_TIMEOUT_MS = 3000;

/** Piston's answer to a request it cannot run (e.g. a version it lacks): the page shows its message; not logged. */
const PISTON_BAD_REQUEST = 400;

/** The 502's words for a 2xx whose body is not JSON (a wrong PISTON_BASE_URL; the log names it). */
export const NOT_JSON_MESSAGE = "The code runner's server sent a reply that is not JSON.";

/** The 502's words for a 400 without Piston's JSON message: the same words as any re-labelled status. */
export const NOT_PISTON_BAD_REQUEST_MESSAGE = upstreamStatusMessage(PISTON_BAD_REQUEST);

/** The memory limit meaning "the server's own limit" (left out of the forwarded request). */
const SERVER_MEMORY_LIMIT = -1;

/**
 * The smallest memory limit forwarded, in bytes (1 MiB). Piston gives its sandbox value / 1000
 * KiB and reads 0 KiB as NO limit, and a request value of 0 also skips its own maximum check
 * (Piston v3.1.1 api/v2.js, job.js), so any value under 1000 would switch the server's memory
 * limit off.
 */
export const MIN_MEMORY_LIMIT_BYTES = 1048576;

/** A request field that breaks the rules above; its message goes back to the page as a 400. */
class ValidationError extends Error {}

/** True when the field was left out (undefined or null). */
function isAbsent(value) {
	return value === undefined || value === null;
}

/** A required string field, trimmed, of 1..maxChars characters. */
function readName(value, field, maxChars) {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new ValidationError(`"${field}" must be a non-empty string.`);
	}
	const trimmed = value.trim();
	if (trimmed.length > maxChars) {
		throw new ValidationError(`"${field}" must be at most ${maxChars} characters.`);
	}
	return trimmed;
}

/** `version`: DEFAULT_VERSION when absent or blank, else a string of 1..MAX_VERSION_CHARS. */
function readVersion(value) {
	if (isAbsent(value)) return DEFAULT_VERSION;
	if (typeof value === 'string' && value.trim() === '') return DEFAULT_VERSION;
	return readName(value, 'version', MAX_VERSION_CHARS);
}

/** One file: { content } plus `name` when it has one; any other key is dropped. */
function readFile(file, index) {
	if (!isPlainObject(file) || typeof file.content !== 'string') {
		throw new ValidationError(`"files[${index}]" must be an object with a string "content".`);
	}
	const clean = { content: file.content };
	if (isAbsent(file.name) || file.name === '') return clean;
	if (typeof file.name !== 'string' || file.name.length > MAX_FILE_NAME_CHARS) {
		throw new ValidationError(`"files[${index}].name" must be a string of at most ${MAX_FILE_NAME_CHARS} characters.`);
	}
	clean.name = file.name;
	return clean;
}

/** `files`: an array of MIN_FILES..MAX_FILES files. */
function readFiles(value) {
	if (!Array.isArray(value) || value.length < MIN_FILES || value.length > MAX_FILES) {
		throw new ValidationError(`"files" must be an array of ${MIN_FILES} to ${MAX_FILES} files.`);
	}
	return value.map(readFile);
}

/** `stdin`: '' when absent, else a string of at most MAX_STDIN_CHARS. */
function readStdin(value) {
	if (isAbsent(value)) return '';
	if (typeof value !== 'string' || value.length > MAX_STDIN_CHARS) {
		throw new ValidationError(`"stdin" must be a string of at most ${MAX_STDIN_CHARS} characters.`);
	}
	return value;
}

/** `args`: [] when absent, else up to MAX_ARGS strings of at most MAX_ARG_CHARS each. */
function readArgs(value) {
	if (isAbsent(value)) return [];
	if (!Array.isArray(value) || value.length > MAX_ARGS) {
		throw new ValidationError(`"args" must be an array of at most ${MAX_ARGS} strings.`);
	}
	const allValid = value.every((arg) => typeof arg === 'string' && arg.length <= MAX_ARG_CHARS);
	if (!allValid) {
		throw new ValidationError(`Each of "args" must be a string of at most ${MAX_ARG_CHARS} characters.`);
	}
	return [...value];
}

/** A whole number of milliseconds within min..max. */
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, Math.round(value)));
}

/** Copies a timeout into `request`, clamped; leaves it out when the request has none. */
function addTimeout(request, input, field, maxMs) {
	const value = input[field];
	if (isAbsent(value)) return;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new ValidationError(`"${field}" must be a number of milliseconds.`);
	}
	request[field] = clamp(value, MIN_TIMEOUT_MS, maxMs);
}

/** Copies a memory limit into `request`; leaves it out when absent or SERVER_MEMORY_LIMIT. */
function addMemoryLimit(request, input, field) {
	const value = input[field];
	if (isAbsent(value) || value === SERVER_MEMORY_LIMIT) return;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < MIN_MEMORY_LIMIT_BYTES) {
		const rule = `a number of bytes, at least ${MIN_MEMORY_LIMIT_BYTES} (1 MiB), or ${SERVER_MEMORY_LIMIT} for the server's own limit`;
		throw new ValidationError(`"${field}" must be ${rule}.`);
	}
	request[field] = Math.round(value);
}

/** The clean request to forward, built ONLY from the fields read here. Throws ValidationError. */
function buildRequest(input) {
	if (!isPlainObject(input)) {
		throw new ValidationError('The request must be a JSON object.');
	}
	const request = {
		language: readName(input.language, 'language', MAX_LANGUAGE_CHARS),
		version: readVersion(input.version),
		files: readFiles(input.files),
		stdin: readStdin(input.stdin),
		args: readArgs(input.args),
	};
	addTimeout(request, input, 'compile_timeout', MAX_COMPILE_TIMEOUT_MS);
	addTimeout(request, input, 'run_timeout', MAX_RUN_TIMEOUT_MS);
	addMemoryLimit(request, input, 'compile_memory_limit');
	addMemoryLimit(request, input, 'run_memory_limit');
	return request;
}

/**
 * Checks a parsed request body against the rules in the file header.
 * Returns { request, error: null } with the clean request, or { request: null, error } with a
 * message for the page.
 */
export function validateExecuteRequest(input) {
	try {
		return { request: buildRequest(input), error: null };
	} catch (error) {
		if (error instanceof ValidationError) return { request: null, error: error.message };
		throw error;
	}
}

/** The media type of a content-type value, lowercased, without its parameters. */
function mediaTypeOf(contentType) {
	const [mediaType] = contentType.split(';');
	return mediaType.trim().toLowerCase();
}

/** True when the request says its body is JSON (see ONLY application/json in the header). */
function isJsonRequest(request) {
	return mediaTypeOf(headerValue(request, 'content-type')) === REQUIRED_MEDIA_TYPE;
}

/** The request body as the bytes received (none: an empty buffer). */
async function bodyBytes(request) {
	return Buffer.from(await request.arrayBuffer());
}

/** The 413 answer (see SIZE in the header). */
function tooLargeResponse() {
	return errorResponse(PAYLOAD_TOO_LARGE, TOO_LARGE_MESSAGE);
}

/**
 * The page's request read and checked: { body } — the JSON to forward — or { failure } — the
 * answer for the page (413 for a size, 400 for anything else).
 */
async function readRequest(request) {
	const bytes = await bodyBytes(request);
	if (bytes.length > MAX_BODY_BYTES) return { failure: tooLargeResponse() };
	const parsed = parseJson(bytes.toString('utf8'));
	if (!parsed.ok) return { failure: errorResponse(400, 'The request body is not valid JSON.') };
	const { request: clean, error } = validateExecuteRequest(parsed.value);
	if (error) return { failure: errorResponse(400, error) };
	const body = JSON.stringify(clean);
	if (Buffer.byteLength(body, 'utf8') > MAX_FORWARD_BYTES) return { failure: tooLargeResponse() };
	return { body };
}

/** True for a 2xx status. */
function isSuccess(status) {
	return status >= 200 && status < 300;
}

/** True when Piston's JSON parser refused the body as too large (its 400 has no message). */
function isPistonTooLarge(status, text) {
	return status === PISTON_BAD_REQUEST && String(text).includes(PAYLOAD_TOO_LARGE_MARKER);
}

/**
 * A 400 for the page: Piston's own message (about the request: a version it lacks, a limit),
 * the secret and the server's address replaced; a 400 without one is not Piston's (a proxy's page,
 * an http:// address on a TLS port), so it is logged with the variable to check and answered as a 502.
 */
function badRequestAnswer(text, config, log) {
	const message = messageFromBody(text);
	if (message !== null) return errorResponse(PISTON_BAD_REQUEST, redactForCaller(message, config));
	log(`The Piston server answered ${PISTON_BAD_REQUEST} without Piston's JSON message (${EXECUTE_PATH}). Check ${BASE_URL_VARIABLE}. ${bodyExcerpt(redactSecret(text, config.secret))}`);
	return errorResponse(BAD_GATEWAY, NOT_PISTON_BAD_REQUEST_MESSAGE);
}

/** A 2xx for the page: Piston's JSON as it came, the secret and the server's address replaced; anything that is not JSON is a 502. */
function successAnswer(status, text, config, log) {
	const safe = redactForCaller(text, config);
	if (parseJson(safe).ok) return textResponse(status, safe, { 'content-type': JSON_CONTENT_TYPE });
	log(`The Piston server sent a reply that is not JSON (${EXECUTE_PATH}). Check ${BASE_URL_VARIABLE}. ${bodyExcerpt(safe)}`);
	return errorResponse(BAD_GATEWAY, NOT_JSON_MESSAGE);
}

/** Piston's answer for the page (see THE ANSWER in the file header); the secret is replaced wherever its words are kept, the server's address where they go on to the page. */
function answerFromUpstream(upstream, config, log) {
	const { status, text } = upstream;
	if (isPistonTooLarge(status, text)) {
		log(`The Piston server refused the request as too large (${PAYLOAD_TOO_LARGE_MARKER}).`);
		return tooLargeResponse();
	}
	if (status === PISTON_BAD_REQUEST) return badRequestAnswer(text, config, log);
	if (isSuccess(status)) return successAnswer(status, text, config, log);
	log(upstreamLogLine(status, EXECUTE_PATH, redactSecret(text, config.secret)));
	return errorResponse(pageStatusFor(status), upstreamStatusMessage(status));
}

/** Sends the clean request (its JSON text) to Piston and turns the outcome into the page's answer. */
async function forward(config, body, fetchImpl, log) {
	let upstream;
	try {
		upstream = await callPiston(config, EXECUTE_PATH, { method: 'POST', body, fetchImpl });
	} catch (error) {
		return failureResponse(log, error);
	}
	return answerFromUpstream(upstream, config, log);
}

/** The public-site checks (see ON A PUBLIC SITE in the header): the 403 or 429 answer, or null. */
function publicSiteRefusal(request, context, env, limiter, log) {
	const refusedOrigin = originProblem(request, env, log, { originRequired: true });
	if (refusedOrigin) return errorResponse(FORBIDDEN, refusedOrigin);
	return rateLimitRefusal(request, context, limiter, log);
}

/** The limiter a request uses: the caller's, else this instance's for the environment's settings (read once per instance). */
function limiterFor(options, env, log) {
	if (options.limiter !== undefined) return options.limiter;
	return sharedLimiter(instanceRateLimitSettings(env, log));
}

/** Every check in order (see THE ANSWER in the file header), then the forward. */
async function respond(request, env, fetchImpl, options, log) {
	if (requestMethod(request) !== 'POST') {
		return errorResponse(405, 'Use POST to run code.', { allow: 'POST' });
	}
	if (!isJsonRequest(request)) {
		return errorResponse(UNSUPPORTED_MEDIA_TYPE, WRONG_MEDIA_TYPE_MESSAGE);
	}
	// Only now: a request refused above costs no read of CODE_RUNNER_RATE_LIMIT (see THE ANSWER).
	const limiter = limiterFor(options, env, log);
	const refused = publicSiteRefusal(request, options.context, env, limiter, log);
	if (refused) return refused;
	const { config, failure } = loadConfig(env, log);
	if (failure) return failure;
	const { body, failure: refusal } = await readRequest(request);
	if (refusal) return refusal;
	return forward(config, body, fetchImpl, log);
}

/**
 * The function's logic, testable: `request` is a web Request; `options.context` is Netlify's
 * function context (its `ip` keys the rate limit; may be absent), and `env` and `limiter` (a
 * lib/rateLimit.mjs limiter, or null for none) default to the real ones. `fetchImpl` is a fetch
 * for the tests; without one the call goes over lib/piston.mjs > requestOverSocket, never the
 * global fetch. Always resolves to a Response, never rejects.
 */
export async function handleExecute(request, options = {}) {
	const { env = process.env, fetchImpl } = options;
	const log = createLogger(LOG_LABEL, env);
	try {
		return await respond(request, env, fetchImpl, options, log);
	} catch (error) {
		log(`Unexpected error: ${error && error.message}`);
		return errorResponse(500, 'The execute function failed unexpectedly.');
	}
}

/** The function Netlify runs (see A MODERN NETLIFY FUNCTION in the header). */
export default async (request, context) => handleExecute(request, { context });
