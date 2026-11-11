/**
 * shared/functions/code-runner/lib/origin.mjs — which pages may use the code runner: the request's
 * origin (its Origin header, or its Referer's origin) must be the site itself, or one of the
 * origins named in CODE_RUNNER_ALLOWED_ORIGINS. Used by execute.mjs (strictly) and runtimes.mjs
 * (leniently). Pure: no network, no state. Takes a web Request (the modern functions API).
 *
 * WHY
 *   On a site with no site password anyone can reach the functions. A browser always tells a
 *   function which PAGE made a request (the Origin header on every POST; the Referer on most
 *   GETs), and a page cannot forge either: so another site's page that tries to run code here
 *   is refused by its origin, before the body is read. A script outside a browser can forge an
 *   Origin, so this is a guard against other SITES; the rate limit (lib/rateLimit.mjs) and the
 *   JSON-only rule in execute.mjs are the guards against the rest.
 *
 * WHAT THE ALLOWLIST CAN AND CANNOT DO
 *   The functions send no CORS header and answer a preflight (OPTIONS) with 405 — on purpose:
 *   the refused preflight is execute.mjs's guard against another site's page. So a browser PAGE
 *   on an origin named in CODE_RUNNER_ALLOWED_ORIGINS still cannot call them: the browser stops
 *   its request before this file is consulted. The variable admits only a request that reaches
 *   a function carrying that Origin some other way — a server-side proxy (another site's
 *   rewrite to this function), or `netlify dev` opened from another device on the machine's LAN
 *   address (below). Each site runs its own copy of the functions, so on a deployed site the
 *   variable normally stays unset (shared/functions/code-runner/README.md > The origin guard).
 *
 * PLAIN HTTP IS THE SITE ONLY ON A LOOPBACK HOST
 *   isSameSite accepts http only on LOOPBACK_HOSTS and *.localhost, where `netlify dev` is
 *   opened on the machine itself; a deployed site is always https. Opened from a phone or tablet
 *   at the machine's LAN address (http://10.0.0.5:8888), the page's origin is that address over
 *   http: the host matches but the scheme does not, so it is refused — and the log says so,
 *   with the one-line fix: CODE_RUNNER_ALLOWED_ORIGINS=http://10.0.0.5:8888 in .env for the
 *   session (`netlify dev` loads .env; shared/functions/code-runner/README.md > Checking locally).
 *
 * THE RULE
 *   requestOrigin(request) the Origin header, or the origin of the Referer; null when neither is
 *                          there or the Origin is "null" (a sandboxed frame, a file:// page).
 *   requestHost(request)   the host the request was sent to: the host of `request.url` (the URL
 *                          the page asked for, as Netlify and `netlify dev` hand it over:
 *                          lowercase, a default port dropped), '' when it cannot be read.
 *   isSameSite(origin, host)
 *                          the origin's host equals the request's host, and its scheme is https —
 *                          or http on a loopback host (`netlify dev`: http://localhost:8888).
 *   parseAllowedOrigins(env, log)
 *                          CODE_RUNNER_ALLOWED_ORIGINS, comma-separated origins
 *                          ("https://other.example.com, https://also.example.org"), each
 *                          normalised (lowercase host, default port dropped, no path); an entry
 *                          that is not an http(s) origin is logged and ignored (never allowed).
 *                          Unset or blank: only the site itself.
 *   originProblem(request, env, log, { originRequired })
 *                          null when the request may go on, else ORIGIN_REFUSED_MESSAGE (the
 *                          403's message; its first words are ORIGIN_REFUSED_MARKER, which the
 *                          editor reads to tell this 403 from the Piston proxy's). A request with
 *                          no origin at all is refused when originRequired (execute.mjs: a
 *                          browser always sends one on a POST) and allowed otherwise
 *                          (runtimes.mjs: a same-origin GET has no Origin and the Referer can be
 *                          stripped).
 *
 * HOW TO CHANGE IT
 *   The variable name: ALLOWED_ORIGINS_VARIABLE (also shared/functions/code-runner/README.md >
 *   The origin guard). The hosts allowed over plain http: LOOPBACK_HOSTS (and the *.localhost
 *   rule in isLoopbackHost). The 403's words: ORIGIN_REFUSED_MESSAGE (keep ORIGIN_REFUSED_MARKER at its
 *   start: the editor matches it; the variable's name belongs in the log line, refusalLogLine,
 *   not in words a reader sees). Tests: __tests__/origin.test.mjs (`npm run test:shared`).
 */

import { headerValue } from './piston.mjs';

/**
 * Environment variable naming other origins whose requests are admitted (comma-separated). Not
 * other sites' PAGES: without CORS the browser stops those first (see WHAT THE ALLOWLIST CAN
 * AND CANNOT DO).
 */
export const ALLOWED_ORIGINS_VARIABLE = 'CODE_RUNNER_ALLOWED_ORIGINS';

/** The status of a refused origin. */
export const FORBIDDEN = 403;

/** The first words of the 403's message: the editor reads them (shared/components/CodeEditor/lib/codeRunner/errors.js). */
export const ORIGIN_REFUSED_MARKER = 'Refused origin';

/**
 * The 403's message: never the request's origin (nothing a stranger sent is echoed back) and no
 * variable (lib/piston.mjs > WHAT A CALLER IS TOLD; the editor's console note names
 * ALLOWED_ORIGINS_VARIABLE).
 */
export const ORIGIN_REFUSED_MESSAGE = `${ORIGIN_REFUSED_MARKER}: the code runner answers only its own site's pages.`;

/** The Origin a browser sends for a page with no usable origin (a sandboxed frame, file://). */
const OPAQUE_ORIGIN = 'null';

/** Hosts a site may be served from over plain http (`netlify dev`, a local build). */
export const LOOPBACK_HOSTS = Object.freeze(['localhost', '127.0.0.1', '[::1]']);

/** Schemes an origin may have. */
const WEB_SCHEMES = Object.freeze(['https:', 'http:']);

/** Separators of the variable's list. */
const LIST_SEPARATOR = ',';

/** The URL of a text, or null when it is not an http(s) URL. */
function parseWebUrl(text) {
	let url;
	try {
		url = new URL(String(text ?? '').trim());
	} catch {
		return null;
	}
	if (!WEB_SCHEMES.includes(url.protocol)) return null;
	return url;
}

/** An origin ("https://host[:port]") normalised: lowercase host, default port dropped; null if invalid. */
export function normalizeOrigin(text) {
	const url = parseWebUrl(text);
	if (url === null) return null;
	return url.origin;
}

/** The request's origin (see THE RULE), or null. */
export function requestOrigin(request) {
	const origin = headerValue(request, 'origin').trim();
	if (origin !== '' && origin !== OPAQUE_ORIGIN) return normalizeOrigin(origin);
	const referer = headerValue(request, 'referer').trim();
	if (referer === '') return null;
	return normalizeOrigin(referer);
}

/** The host the request was sent to (see THE RULE), '' when unknown. */
export function requestHost(request) {
	const url = parseWebUrl(request && request.url);
	if (url === null) return '';
	return url.host;
}

/** True for a host a site may be served from over plain http. */
function isLoopbackHost(hostname) {
	return LOOPBACK_HOSTS.includes(hostname) || hostname.endsWith('.localhost');
}

/** True when `origin` (normalised) is the site at `host` (see THE RULE). */
export function isSameSite(origin, host) {
	const url = parseWebUrl(origin);
	if (url === null || host === '') return false;
	if (url.host !== host) return false;
	return url.protocol === 'https:' || isLoopbackHost(url.hostname);
}

/** The origins CODE_RUNNER_ALLOWED_ORIGINS names, normalised; an invalid entry is logged and skipped. */
export function parseAllowedOrigins(env, log) {
	const text = env && typeof env[ALLOWED_ORIGINS_VARIABLE] === 'string' ? env[ALLOWED_ORIGINS_VARIABLE] : '';
	const allowed = new Set();
	for (const entry of text.split(LIST_SEPARATOR)) {
		const trimmed = entry.trim();
		if (trimmed === '') continue;
		const origin = normalizeOrigin(trimmed);
		if (origin === null) {
			log(`${ALLOWED_ORIGINS_VARIABLE} holds an entry that is not an http(s) origin; it is ignored: "${trimmed}"`);
			continue;
		}
		allowed.add(origin);
	}
	return allowed;
}

/** True when the origin is the site itself or an allowed one. */
function isAllowedOrigin(origin, request, env, log) {
	if (isSameSite(origin, requestHost(request))) return true;
	return parseAllowedOrigins(env, log).has(origin);
}

/** True when `origin` is the site's host over plain http on a host that is not loopback (see PLAIN HTTP…). */
function isSiteOverPlainHttp(origin, host) {
	const url = parseWebUrl(origin);
	if (url === null || host === '' || url.host !== host) return false;
	return url.protocol === 'http:' && !isLoopbackHost(url.hostname);
}

/** The log line for a refused origin: the reason, and for the LAN case the one-line fix (words for whoever runs the site, never for a reader). */
function refusalLogLine(origin, request) {
	const host = requestHost(request);
	if (isSiteOverPlainHttp(origin, host)) {
		const httpHosts = `${LOOPBACK_HOSTS.join(' / ')} / *.localhost`;
		return `Refused a request from the origin ${origin}: it is this site's host, but plain http is accepted only on ${httpHosts} (netlify dev opened from another device: set ${ALLOWED_ORIGINS_VARIABLE}=${origin} in .env for the session).`;
	}
	return `Refused a request from the origin ${origin} (the site is ${host || 'unknown'}).`;
}

/**
 * null when the request may go on, else the 403's message (see THE RULE). `originRequired`:
 * refuse a request with no origin at all (execute.mjs) or let it through (runtimes.mjs).
 */
export function originProblem(request, env, log, { originRequired }) {
	const origin = requestOrigin(request);
	if (origin === null) {
		if (!originRequired) return null;
		log('Refused a request with no Origin or Referer.');
		return ORIGIN_REFUSED_MESSAGE;
	}
	if (isAllowedOrigin(origin, request, env, log)) return null;
	log(refusalLogLine(origin, request));
	return ORIGIN_REFUSED_MESSAGE;
}
