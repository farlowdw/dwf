/**
 * errors.js — the one error type of the code runner (RunError) and the plain words for each way
 * a run request can fail over HTTP. Pure; no React, no DOM.
 *
 * KINDS (RunError.kind)
 *   no-function   no Netlify Function here (npm start serves none: a 404)
 *   wall          the site's password session ended (401)
 *   refused       the Piston server refused the function's request (403: the shared secret)
 *   origin        another site's page tried to use the site's runner (the function's 403 whose
 *                 message starts "Refused origin": shared/functions/code-runner/lib/origin.mjs)
 *   rate-limited  this client ran too often (429: the function's own, whose message starts
 *                 "Too many requests" — shared/functions/code-runner/lib/rateLimit.mjs —, or Netlify's edge
 *                 rule, which sends no such body)
 *   bad-request   Piston or the function could not accept the request (400: e.g. "python-3.10.0
 *                 runtime is unknown"; 415: the function takes only application/json)
 *   too-large     the code and its input are over the size limit: the function's 413, or a 400
 *                 from Piston itself whose body names PayloadTooLargeError (its JSON parser stops
 *                 at about 100 KB and answers { stack } with no message)
 *   config        the function is missing PISTON_BASE_URL / PISTON_PROXY_SECRET (500)
 *   upstream      anything else the server side answered (500, 502, 503, 504, …)
 *   network       the request never got an answer (offline, DNS, CORS)
 *   aborted       the reader pressed Stop (the server may still finish the run)
 *
 * TWO AUDIENCES
 *   `message` is what a reader sees, on a public site too: plain words, with nothing of how the
 *   site is set up (no variable, no server's name, no file, no command), because a reader can act
 *   on none of that. `setup` is the same failure for whoever runs the site: what to check, by
 *   name, never a value. client.js prints it with console.warn after a failed run, and
 *   shared/functions/code-runner/README.md > What the reader sees has the whole table.
 *   A 5xx's own words are always `setup`: the functions' 5xx answers say what failed in fixed
 *   words, and their log names the variables. The words of a 400, a 415 or a 429 do reach
 *   the reader, because they are about the request (a field, a version, how long to wait).
 *   Neither names anything of ONE site: the folder copies to another Docusaurus site as it is, so
 *   a note says `netlify dev` and never a port (each site's `netlify dev` port is in its own
 *   netlify.toml > [dev]; __tests__/files.test.js refuses a localhost port anywhere in the folder).
 *
 * HOW TO CHANGE IT
 *   What a reader sees: the MESSAGE_* constants, UPSTREAM_MESSAGES and explainHttpError(). What
 *   whoever runs the site sees: SETUP_NOTES. A new kind: RUN_ERROR_KINDS, the list above, and
 *   wherever the editor treats kinds differently (the editor's folder). Keep the three markers at
 *   the start of the functions' messages, or change both sides together.
 */

/** Every RunError kind. */
export const RUN_ERROR_KINDS = Object.freeze([
	'no-function',
	'wall',
	'refused',
	'bad-request',
	'too-large',
	'upstream',
	'network',
	'aborted',
	'config',
	'origin',
	'rate-limited',
]);

/** The kind of a RunError made without a known one. */
const DEFAULT_KIND = 'upstream';

/** What the function's own 500 says when PISTON_BASE_URL / PISTON_PROXY_SECRET is unset. */
const MISSING_CONFIG_MARKER = 'Missing server configuration';

/** The first words of the function's 403 for a request from another site (shared/functions/code-runner/lib/origin.mjs). */
const ORIGIN_REFUSED_MARKER = 'Refused origin';

/** The first words of the function's 429 (shared/functions/code-runner/lib/rateLimit.mjs); Netlify's own 429 has no such body. */
const RATE_LIMITED_MARKER = 'Too many requests';

/** The error name in Piston's 400 for a body over its JSON parser's limit. */
const PAYLOAD_TOO_LARGE_MARKER = 'PayloadTooLargeError';

/** The longest plain-text body shown in a message (longer ones are an error page, not words). */
const MAX_PLAIN_MESSAGE_LENGTH = 300;

/** The first status of the server side's own failures (see TWO AUDIENCES). */
const FIRST_SERVER_FAILURE = 500;

export const MESSAGE_NO_FUNCTION = "The code runner isn't available here.";
export const MESSAGE_WALL = 'Your session on this site has ended: reload the page and try again.';
export const MESSAGE_REFUSED = 'The code runner is not accepting runs right now. Try again later.';
export const MESSAGE_BAD_REQUEST = 'The code runner could not accept the request.';
export const MESSAGE_NOT_JSON = 'The code runner could not accept the request: it must be sent as application/json (415).';
export const MESSAGE_TOO_LARGE = 'The code and its input are too large to send to the code runner.';
export const MESSAGE_CONFIG = "The code runner isn't available right now.";
export const MESSAGE_ORIGIN_REFUSED = "This page may not use the code runner: it answers only its own site's pages.";
export const MESSAGE_RATE_LIMITED = 'Too many runs from your connection: wait a moment and try again.';

/** Generic words for an upstream status without a message of its own. */
const UPSTREAM_MESSAGES = Object.freeze({
	500: 'The code runner failed (500). Try again in a moment.',
	502: 'The code runner could not be reached (502). Try again in a moment.',
	503: 'The code runner is unavailable right now (503). Try again in a moment.',
	504: 'The code runner took too long to answer (504). Try again in a moment.',
});

/** Where whoever runs the site reads more (a test holds the heading: readme.test.mjs beside the functions). */
const SETUP_MANUAL = 'shared/functions/code-runner/README.md > What the reader sees';

/** What each kind tells whoever runs the site, by name and never by value (see TWO AUDIENCES). */
const SETUP_NOTES = Object.freeze({
	'no-function': `the functions answered 404. They run on a deployed site and under netlify dev, never under npm start or npm run serve. On a deployed site, check the site's two shims (${SETUP_MANUAL}).`,
	wall: `a site password's page answered 401: the reader's session ended (${SETUP_MANUAL}).`,
	refused: `the Piston server refused the function's request (403): PISTON_PROXY_SECRET must equal the proxy's (${SETUP_MANUAL}).`,
	origin: `the function answers only its own site's pages: CODE_RUNNER_ALLOWED_ORIGINS names any other (${SETUP_MANUAL}).`,
	config: `PISTON_BASE_URL and PISTON_PROXY_SECRET must both be set for the functions, then a new deploy (${SETUP_MANUAL}).`,
});

/**
 * A failed run request. `kind` is one of RUN_ERROR_KINDS; `status` the HTTP status, or null;
 * `setup` the note for whoever runs the site, or null (see TWO AUDIENCES).
 */
export class RunError extends Error {
	constructor(message, { kind, status, setup } = {}) {
		super(message);
		this.name = 'RunError';
		this.kind = RUN_ERROR_KINDS.includes(kind) ? kind : DEFAULT_KIND;
		this.status = typeof status === 'number' ? status : null;
		this.setup = typeof setup === 'string' ? setup : null;
	}
}

/** Does this body look like an HTML page (an error page, the dev server's 404)? */
function looksLikeHtml(text, contentType) {
	if (String(contentType ?? '').toLowerCase().includes('html')) return true;
	return /^\s*</.test(text);
}

/** The `message` of a JSON body ({ message }), or null. */
function jsonMessage(text) {
	try {
		const body = JSON.parse(text);
		if (body && typeof body.message === 'string' && body.message.trim() !== '') return body.message.trim();
	} catch {
		// not JSON
	}
	return null;
}

/**
 * The words a body carries: its JSON `message`, else short plain text (the old function's
 * text/plain answers); null for an HTML page, an empty body or anything long.
 */
export function bodyMessage(bodyText, contentType) {
	const text = String(bodyText ?? '').trim();
	if (text === '' || looksLikeHtml(text, contentType)) return null;
	const fromJson = jsonMessage(text);
	if (fromJson !== null) return fromJson;
	if (text.startsWith('{') || text.startsWith('[')) return null;
	return text.length <= MAX_PLAIN_MESSAGE_LENGTH ? text : null;
}

/** Is this the server side's own failure, whose words are for whoever runs the site (see TWO AUDIENCES)? */
function isServerFailure(status) {
	return status >= FIRST_SERVER_FAILURE;
}

/** The reader's words for a status outside the named ones. */
function upstreamMessage(status, fromBody) {
	if (fromBody !== null && !isServerFailure(status)) return fromBody;
	return UPSTREAM_MESSAGES[status] ?? `The code runner answered with an error (${status}).`;
}

/** The setup note for a status outside the named ones: a 5xx's own words, or null. */
function upstreamSetup(status, fromBody) {
	if (fromBody === null || !isServerFailure(status)) return null;
	return `the functions answered ${status}: ${fromBody}`;
}

/** Is this Piston's 400 for a body over its parser's limit? (Its body is { stack }, no message.) */
function isPayloadTooLarge(bodyText) {
	return String(bodyText ?? '').includes(PAYLOAD_TOO_LARGE_MARKER);
}

/**
 * A RunError for a non-2xx answer, with plain words for the reader and a note for whoever runs
 * the site (see TWO AUDIENCES):
 *   status       the HTTP status
 *   bodyText     the body as text (JSON { message }, plain text, or an HTML page)
 *   contentType  the response's content-type header
 */
export function explainHttpError(status, bodyText, contentType) {
	const fromBody = bodyMessage(bodyText, contentType);
	const make = (message, kind, setup = SETUP_NOTES[kind]) => new RunError(message, { kind, status, setup });
	if (status === 400 && isPayloadTooLarge(bodyText)) return make(MESSAGE_TOO_LARGE, 'too-large');
	switch (status) {
		case 404:
			return make(MESSAGE_NO_FUNCTION, 'no-function');
		case 401:
			return make(MESSAGE_WALL, 'wall');
		case 403:
			if (fromBody !== null && fromBody.startsWith(ORIGIN_REFUSED_MARKER)) return make(MESSAGE_ORIGIN_REFUSED, 'origin');
			return make(MESSAGE_REFUSED, 'refused');
		case 429:
			// the function's own words say how many runs and how long to wait; Netlify's edge 429 (or any other body) gets the plain words
			if (fromBody !== null && fromBody.startsWith(RATE_LIMITED_MARKER)) return make(fromBody, 'rate-limited');
			return make(MESSAGE_RATE_LIMITED, 'rate-limited');
		case 400:
			return make(fromBody ?? MESSAGE_BAD_REQUEST, 'bad-request');
		case 415:
			return make(fromBody ?? MESSAGE_NOT_JSON, 'bad-request');
		case 413:
			return make(MESSAGE_TOO_LARGE, 'too-large');
		default:
			break;
	}
	if (status === 500 && fromBody !== null && fromBody.includes(MISSING_CONFIG_MARKER)) {
		return make(MESSAGE_CONFIG, 'config');
	}
	return make(upstreamMessage(status, fromBody), 'upstream', upstreamSetup(status, fromBody));
}
