/**
 * origin.test.mjs — shared/functions/code-runner/lib/origin.mjs: the request's origin is read from
 * Origin (else Referer), the site itself — the host of request.url — always passes (https, or http on
 * a loopback host), a site named in CODE_RUNNER_ALLOWED_ORIGINS passes (normalised: case,
 * default port, trailing slash), anything else is refused with a message that never echoes the
 * stranger's origin, an invalid entry of the variable is ignored and logged, a request with no
 * origin is refused only when the caller requires one, and the log line for the site's own host
 * over plain http (`netlify dev` opened from a phone at the machine's LAN address) says why and
 * names the one-line fix. Pure: no network.
 * Run with `npm run test:shared`.
 * To change it: a new rule of lib/origin.mjs gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	ALLOWED_ORIGINS_VARIABLE,
	ORIGIN_REFUSED_MARKER,
	ORIGIN_REFUSED_MESSAGE,
	FORBIDDEN,
	normalizeOrigin,
	requestOrigin,
	requestHost,
	isSameSite,
	parseAllowedOrigins,
	originProblem,
} from '../lib/origin.mjs';
import { SITE_HOST, SITE_ORIGIN, siteHeaders } from './fakePiston.mjs';

/** The function's path on whatever site a request is sent to. */
const FUNCTION_PATH = '/.netlify/functions/execute';

/** A log that remembers its lines. */
function memoryLog() {
	const lines = [];
	const log = (line) => lines.push(String(line));
	log.lines = lines;
	return log;
}

/** A POST to the function on `site` (the origin the request was sent to) with these headers. */
function requestWith(headers, site = SITE_ORIGIN) {
	return new Request(`${site}${FUNCTION_PATH}`, { method: 'POST', headers });
}

test('the contract constants', () => {
	assert.equal(ALLOWED_ORIGINS_VARIABLE, 'CODE_RUNNER_ALLOWED_ORIGINS');
	assert.equal(FORBIDDEN, 403);
	assert.equal(ORIGIN_REFUSED_MARKER, 'Refused origin');
	assert.ok(ORIGIN_REFUSED_MESSAGE.startsWith(`${ORIGIN_REFUSED_MARKER}:`), 'the editor matches the first words');
	assert.ok(!ORIGIN_REFUSED_MESSAGE.includes(ALLOWED_ORIGINS_VARIABLE), 'a caller is told no variable: the log and the editor\'s note name it');
});

test('normalizeOrigin: lowercase host, default port and path dropped; only http(s)', () => {
	assert.equal(normalizeOrigin('https://Other.Example.test:443/some/page?x=1'), 'https://other.example.test');
	assert.equal(normalizeOrigin('http://localhost:8888'), 'http://localhost:8888');
	assert.equal(normalizeOrigin('https://a.example.test:8443'), 'https://a.example.test:8443');
	assert.equal(normalizeOrigin(' https://a.example.test '), 'https://a.example.test');
	for (const bad of ['', 'null', 'a.example.test', 'ftp://a.example.test', 'file:///x', 'javascript:alert(1)', undefined, 7]) {
		assert.equal(normalizeOrigin(bad), null, String(bad));
	}
});

test('requestOrigin: Origin first, else the Referer\'s origin; "null" and nothing are null', () => {
	assert.equal(requestOrigin(requestWith({ origin: 'https://A.example.test/' })), 'https://a.example.test');
	assert.equal(requestOrigin(requestWith({ Origin: 'https://a.example.test', referer: 'https://b.example.test/x' })), 'https://a.example.test');
	assert.equal(requestOrigin(requestWith({ referer: 'https://b.example.test/docs/x?y=1' })), 'https://b.example.test');
	assert.equal(requestOrigin(requestWith({ origin: 'null', referer: 'https://b.example.test/' })), 'https://b.example.test', 'an opaque Origin falls back to the Referer');
	assert.equal(requestOrigin(requestWith({ origin: 'null' })), null);
	assert.equal(requestOrigin(requestWith({ referer: 'not a url' })), null);
	assert.equal(requestOrigin(requestWith({})), null);
	assert.equal(requestOrigin({}), null);
	assert.equal(requestOrigin(undefined), null);
});

test("requestHost: the host of request.url, lowercase, a default port dropped; '' when there is none", () => {
	assert.equal(requestHost(new Request('https://Notes.Example.test/.netlify/functions/runtimes')), 'notes.example.test');
	assert.equal(requestHost(new Request('https://notes.example.test:443/x')), 'notes.example.test');
	assert.equal(requestHost(new Request('http://localhost:8888/x')), 'localhost:8888');
	assert.equal(requestHost(new Request('http://10.0.0.5:8888/x')), '10.0.0.5:8888');
	assert.equal(requestHost({ url: 'not a url' }), '');
	assert.equal(requestHost({ url: 'ftp://files.example.test/x' }), '', 'not a web URL');
	assert.equal(requestHost({}), '');
	assert.equal(requestHost(undefined), '');
});

test('isSameSite: the same host over https, or over http on a loopback host only', () => {
	assert.equal(isSameSite('https://notes.example.test', 'notes.example.test'), true);
	assert.equal(isSameSite('http://notes.example.test', 'notes.example.test'), false, 'plain http on a real host is not the site');
	assert.equal(isSameSite('https://other.example.test', 'notes.example.test'), false);
	assert.equal(isSameSite('https://notes.example.test.evil.test', 'notes.example.test'), false);
	assert.equal(isSameSite('https://notes.example.test:8443', 'notes.example.test'), false, 'another port is another origin');
	for (const local of ['http://localhost:8888', 'http://127.0.0.1:8888', 'http://[::1]:8888', 'http://site.localhost:8888']) {
		assert.equal(isSameSite(local, new URL(local).host), true, local);
	}
	assert.equal(isSameSite('http://localhost:8888', 'localhost:3000'), false);
	assert.equal(isSameSite('https://notes.example.test', ''), false, 'no host: nothing to compare with');
	assert.equal(isSameSite(null, 'notes.example.test'), false);
});

test('parseAllowedOrigins: comma-separated, normalised; blanks skipped; an invalid entry logged and ignored', () => {
	const log = memoryLog();
	const env = { CODE_RUNNER_ALLOWED_ORIGINS: ' https://A.example.test:443/ ,, https://b.example.test:8443, not-an-origin, ftp://c.example.test ' };
	assert.deepEqual([...parseAllowedOrigins(env, log)], ['https://a.example.test', 'https://b.example.test:8443']);
	assert.equal(log.lines.length, 2);
	assert.match(log.lines[0], /CODE_RUNNER_ALLOWED_ORIGINS.*not-an-origin/);
	assert.match(log.lines[1], /ftp:\/\/c\.example\.test/);
	assert.equal(parseAllowedOrigins({}, log).size, 0);
	assert.equal(parseAllowedOrigins({ CODE_RUNNER_ALLOWED_ORIGINS: '   ' }, log).size, 0);
	assert.equal(parseAllowedOrigins(undefined, log).size, 0);
});

test('originProblem: the site itself passes, with or without the variable', () => {
	const log = memoryLog();
	for (const env of [{}, { CODE_RUNNER_ALLOWED_ORIGINS: 'https://other.example.test' }]) {
		assert.equal(originProblem(requestWith(siteHeaders()), env, log, { originRequired: true }), null);
		assert.equal(originProblem(requestWith({ referer: `${SITE_ORIGIN}/docs/x` }), env, log, { originRequired: true }), null);
	}
	assert.equal(log.lines.length, 0);
});

test('originProblem: an allowed site passes; any other is refused with the fixed message, and logged', () => {
	const log = memoryLog();
	const env = { CODE_RUNNER_ALLOWED_ORIGINS: 'https://other.example.test' };
	assert.equal(originProblem(requestWith({ origin: 'https://other.example.test' }), env, log, { originRequired: true }), null);
	const refused = originProblem(requestWith({ origin: 'https://evil.example.test' }), env, log, { originRequired: false });
	assert.equal(refused, ORIGIN_REFUSED_MESSAGE);
	assert.ok(!refused.includes('evil'), "the stranger's origin is never echoed back");
	assert.equal(log.lines.length, 1);
	assert.match(log.lines[0], /evil\.example\.test.*notes\.example\.test/, 'the log names both sides');
});

test('originProblem: no origin at all is refused only when required', () => {
	const log = memoryLog();
	const none = requestWith({});
	assert.equal(originProblem(none, {}, log, { originRequired: false }), null);
	assert.equal(originProblem(none, {}, log, { originRequired: true }), ORIGIN_REFUSED_MESSAGE);
	assert.equal(log.lines.length, 1);
	assert.match(log.lines[0], /no Origin or Referer/);
});

test('originProblem: a page on the site\'s host over plain http is refused (not the site) unless loopback', () => {
	const log = memoryLog();
	assert.equal(originProblem(requestWith({ origin: `http://${SITE_HOST}` }), {}, log, { originRequired: true }), ORIGIN_REFUSED_MESSAGE);
	const netlifyDev = requestWith({ origin: 'http://localhost:8888' }, 'http://localhost:8888');
	assert.equal(originProblem(netlifyDev, {}, log, { originRequired: true }), null);
});

test("originProblem: the site's host over plain http (netlify dev from a phone on the LAN): the log says why and names the .env line", () => {
	const log = memoryLog();
	const lanSite = 'http://10.0.0.5:8888';
	const lan = requestWith({ origin: lanSite }, lanSite);
	assert.equal(originProblem(lan, {}, log, { originRequired: true }), ORIGIN_REFUSED_MESSAGE, 'refused: the 403 keeps its fixed words');
	assert.equal(log.lines.length, 1);
	assert.match(log.lines[0], /http:\/\/10\.0\.0\.5:8888: it is this site's host, but plain http is accepted only on localhost \/ 127\.0\.0\.1 \/ \[::1\] \/ \*\.localhost/);
	assert.match(log.lines[0], /CODE_RUNNER_ALLOWED_ORIGINS=http:\/\/10\.0\.0\.5:8888 in \.env/, 'the one-line fix');

	// The same request from the Referer only (the runtimes GET of that page).
	const lanGet = requestWith({ referer: `${lanSite}/site-guide` }, lanSite);
	assert.equal(originProblem(lanGet, {}, log, { originRequired: false }), ORIGIN_REFUSED_MESSAGE);
	assert.match(log.lines[1], /plain http is accepted only on/);

	// With the line in .env (netlify dev loads it) both pass.
	const env = { CODE_RUNNER_ALLOWED_ORIGINS: lanSite };
	assert.equal(originProblem(lan, env, log, { originRequired: true }), null);
	assert.equal(originProblem(lanGet, env, log, { originRequired: false }), null);
	assert.equal(log.lines.length, 2);

	// A stranger, and another port on the same host, keep the plain line (no .env advice).
	assert.equal(originProblem(requestWith({ origin: 'https://evil.example.test' }, lanSite), {}, log, { originRequired: true }), ORIGIN_REFUSED_MESSAGE);
	assert.match(log.lines[2], /^Refused a request from the origin https:\/\/evil\.example\.test \(the site is 10\.0\.0\.5:8888\)\.$/);
	assert.equal(originProblem(requestWith({ origin: 'http://10.0.0.5:3000' }, lanSite), {}, log, { originRequired: true }), ORIGIN_REFUSED_MESSAGE);
	assert.match(log.lines[3], /\(the site is 10\.0\.0\.5:8888\)\.$/, 'another port is another origin, not the http case');
});
