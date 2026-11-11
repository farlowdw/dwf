/**
 * errors.test.js — the code runner's errors (../errors.js): RunError's fields, and the kind, the
 * reader's words and the setup note explainHttpError() gives every HTTP status (404 under npm
 * start, a site password's 401, Piston's 403 and 400, 413 and Piston's PayloadTooLargeError 400,
 * the function's 415, the function's missing-configuration 500, upstream 5xx), with JSON,
 * plain-text and HTML bodies. functions/code-runner/__tests__/readerWords.test.mjs runs the
 * functions' real answers through the same code. Run with `npm run test:shared`.
 * To change it: a new status or kind in ../errors.js gets a test here, with its words.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_CONFIG, MESSAGE_NOT_JSON, MESSAGE_NO_FUNCTION, MESSAGE_ORIGIN_REFUSED, MESSAGE_RATE_LIMITED, MESSAGE_REFUSED, MESSAGE_TOO_LARGE, MESSAGE_WALL, RUN_ERROR_KINDS, RunError, bodyMessage, explainHttpError } from '../errors.js';

const JSON_TYPE = 'application/json; charset=utf-8';
const HTML_TYPE = 'text/html; charset=utf-8';

/** Piston's answer to a body over its parser's ~100 KB limit (seen 2026-10-24): a stack, no message. */
const PISTON_TOO_LARGE_BODY = JSON.stringify({
	stack: 'PayloadTooLargeError: request entity too large\n    at readStream (/piston_api/node_modules/raw-body/index.js:155:17)',
});

/** The 404 page the dev server sends for a POST it has no route for. */
const DEV_SERVER_404 = '<!DOCTYPE html>\n<html lang="en"><head><title>Error</title></head><body><pre>Cannot POST /.netlify/functions/execute</pre></body></html>';

test('RunError: an Error with a name, a kind and a status', () => {
	const error = new RunError('Nope', { kind: 'refused', status: 403 });
	assert.equal(error instanceof Error, true);
	assert.equal(error instanceof RunError, true);
	assert.equal(error.name, 'RunError');
	assert.equal(error.message, 'Nope');
	assert.equal(error.kind, 'refused');
	assert.equal(error.status, 403);
	assert.equal(error.setup, null);
	assert.equal(typeof error.stack, 'string');
});

test('RunError: `setup` is a string or null', () => {
	assert.equal(new RunError('x', { setup: 'check this' }).setup, 'check this');
	assert.equal(new RunError('x').setup, null);
	assert.equal(new RunError('x', { setup: 42 }).setup, null);
});

test('RunError: a missing or unknown kind is "upstream", a missing status null', () => {
	assert.equal(new RunError('x').kind, 'upstream');
	assert.equal(new RunError('x', {}).kind, 'upstream');
	assert.equal(new RunError('x', { kind: 'gremlins' }).kind, 'upstream');
	assert.equal(new RunError('x').status, null);
	assert.equal(new RunError('x', { status: '500' }).status, null, 'a status is a number');
	for (const kind of RUN_ERROR_KINDS) assert.equal(new RunError('x', { kind }).kind, kind);
});

test('RUN_ERROR_KINDS: the promised kinds, frozen', () => {
	assert.deepEqual([...RUN_ERROR_KINDS].sort(), ['aborted', 'bad-request', 'config', 'network', 'no-function', 'origin', 'rate-limited', 'refused', 'too-large', 'upstream', 'wall']);
	assert.equal(Object.isFrozen(RUN_ERROR_KINDS), true);
});

test('404: no Netlify Functions here (npm start)', () => {
	const error = explainHttpError(404, DEV_SERVER_404, HTML_TYPE);
	assert.equal(error.kind, 'no-function');
	assert.equal(error.status, 404);
	assert.equal(error.message, MESSAGE_NO_FUNCTION);
	assert.match(error.setup, /npm start/);
	assert.match(error.setup, /netlify dev/);
	assert.doesNotMatch(`${error.message} ${error.setup}`, /localhost|:\d{4}/, "no port: every site has its own netlify dev port (netlify.toml > [dev])");
	assert.doesNotMatch(`${error.message} ${error.setup}`, /<html|Cannot POST/, 'never the HTML page');
	assert.equal(explainHttpError(404, '', '').kind, 'no-function');
});

test('401: the password session ended', () => {
	const error = explainHttpError(401, '<html>Password required</html>', HTML_TYPE);
	assert.equal(error.kind, 'wall');
	assert.equal(error.message, MESSAGE_WALL);
	assert.match(error.message, /reload/i);
	assert.doesNotMatch(error.message, /password/i);
	assert.match(error.setup, /password/i);
});

test('403: Piston refused the request (the shared secret)', () => {
	const error = explainHttpError(403, 'Forbidden', 'text/plain');
	assert.equal(error.kind, 'refused');
	assert.equal(error.status, 403);
	assert.equal(error.message, MESSAGE_REFUSED);
	assert.match(error.setup, /PISTON_PROXY_SECRET/);
});

test("403 starting \"Refused origin\": another site's page (the function's origin check), in plain words", () => {
	const body = JSON.stringify({ message: "Refused origin: the code runner answers only its own site's pages (CODE_RUNNER_ALLOWED_ORIGINS names any other site allowed)." });
	const error = explainHttpError(403, body, 'application/json');
	assert.equal(error.kind, 'origin');
	assert.equal(error.status, 403);
	assert.equal(error.message, MESSAGE_ORIGIN_REFUSED);
	assert.match(MESSAGE_ORIGIN_REFUSED, /^This page may not use the code runner/, "functions/code-runner/README.md > What the reader sees quotes these words");
	assert.match(error.setup, /CODE_RUNNER_ALLOWED_ORIGINS/);
});

test("429: the function's own words (how many runs, how long to wait); any other body (Netlify's edge rule) gets the plain words", () => {
	const words = 'Too many requests from your connection (at most 20 in 60 s): try again in 12 s.';
	const own = explainHttpError(429, JSON.stringify({ message: words }), 'application/json');
	assert.equal(own.kind, 'rate-limited');
	assert.equal(own.status, 429);
	assert.equal(own.message, words);
	const edge = explainHttpError(429, '<html><body>Too Many Requests</body></html>', 'text/html');
	assert.equal(edge.kind, 'rate-limited');
	assert.equal(edge.message, MESSAGE_RATE_LIMITED);
	assert.equal(own.setup, null, 'a reader running too often is nothing to set up');
	assert.equal(edge.setup, null);
});

test("400: Piston's own words", () => {
	const error = explainHttpError(400, '{"message":"python-3.10.0 runtime is unknown"}', JSON_TYPE);
	assert.equal(error.kind, 'bad-request');
	assert.equal(error.message, 'python-3.10.0 runtime is unknown');
	assert.equal(explainHttpError(400, '{"message":"Invalid JSON body"}', '').message, 'Invalid JSON body', 'JSON without a content-type');
	assert.equal(explainHttpError(400, '{}', JSON_TYPE).message, 'The code runner could not accept the request.');
	assert.equal(explainHttpError(400, '', '').message, 'The code runner could not accept the request.');
	assert.equal(explainHttpError(400, '<html>bad</html>', HTML_TYPE).message, 'The code runner could not accept the request.');
	assert.equal(error.setup, null, 'a request the runner turned down is nothing to set up');
});

test('413: too large', () => {
	const error = explainHttpError(413, '{"message":"Payload too large"}', JSON_TYPE);
	assert.equal(error.kind, 'too-large');
	assert.match(error.message, /too large/);
	assert.equal(explainHttpError(413, 'Payload too large', 'text/plain').kind, 'too-large', "the old function's plain text");
	assert.equal(error.setup, null);
});

test("400 naming PayloadTooLargeError: Piston's own size limit, too large", () => {
	const error = explainHttpError(400, PISTON_TOO_LARGE_BODY, JSON_TYPE);
	assert.equal(error.kind, 'too-large');
	assert.equal(error.status, 400);
	assert.equal(error.message, MESSAGE_TOO_LARGE);
	assert.doesNotMatch(error.message, /PayloadTooLargeError|raw-body/, 'never the stack trace');
	assert.equal(explainHttpError(400, '{"message":"Request body too large"}', JSON_TYPE).kind, 'bad-request', 'only the error name counts');
	assert.equal(explainHttpError(500, PISTON_TOO_LARGE_BODY, JSON_TYPE).kind, 'upstream', 'only a 400');
});

test('415: the function wants application/json, in its own words', () => {
	const error = explainHttpError(415, '{"message":"Send the request as application/json."}', JSON_TYPE);
	assert.equal(error.kind, 'bad-request');
	assert.equal(error.status, 415);
	assert.equal(error.message, 'Send the request as application/json.');
	const bare = explainHttpError(415, '', '');
	assert.equal(bare.kind, 'bad-request');
	assert.equal(bare.message, MESSAGE_NOT_JSON);
	assert.match(bare.message, /application\/json/);
});

test('500 with "Missing server configuration": the function is not set up', () => {
	const fromJson = explainHttpError(500, '{"message":"Missing server configuration (PISTON_BASE_URL / PISTON_PROXY_SECRET)."}', JSON_TYPE);
	assert.equal(fromJson.kind, 'config');
	assert.equal(fromJson.message, MESSAGE_CONFIG);
	assert.match(fromJson.setup, /PISTON_BASE_URL/);
	assert.match(fromJson.setup, /PISTON_PROXY_SECRET/);
	const fromText = explainHttpError(500, 'Missing server configuration (PISTON_BASE_URL / PISTON_PROXY_SECRET).', 'text/plain');
	assert.equal(fromText.kind, 'config', "the old function's plain text");
});

test("500 otherwise, 502, 503, 504: upstream, in the reader's own words; a body's words go to the note", () => {
	const withMessage = explainHttpError(504, '{"message":"The code runner did not answer within 25 s."}', JSON_TYPE);
	assert.equal(withMessage.kind, 'upstream');
	assert.equal(withMessage.status, 504);
	assert.match(withMessage.message, /took too long/);
	assert.match(withMessage.setup, /504: The code runner did not answer within 25 s\./);
	for (const [text, type] of [['{"message":"boom"}', JSON_TYPE], ['boom', 'text/plain']]) {
		const error = explainHttpError(500, text, type);
		assert.doesNotMatch(error.message, /boom/);
		assert.match(error.setup, /500: boom/);
	}
	const named = explainHttpError(502, '{"message":"The Piston server sent a reply that is not JSON. Check PISTON_BASE_URL."}', JSON_TYPE);
	assert.equal(named.message, 'The code runner could not be reached (502). Try again in a moment.');
	assert.match(named.setup, /PISTON_BASE_URL/);
	const unlisted = explainHttpError(520, '{"message":"origin error"}', JSON_TYPE);
	assert.equal(unlisted.message, 'The code runner answered with an error (520).', 'a status with no line of its own hides its body too');
	assert.match(unlisted.setup, /520: origin error/);
	assert.equal(explainHttpError(502, '<html>Bad gateway</html>', HTML_TYPE).setup, null, 'a page is not words');
	assert.equal(explainHttpError(500, '', '').setup, null);
	assert.match(explainHttpError(500, '', '').message, /\(500\)/);
	assert.match(explainHttpError(502, '<html>Bad gateway</html>', HTML_TYPE).message, /\(502\)/);
	assert.match(explainHttpError(503, '', '').message, /\(503\)/);
	assert.match(explainHttpError(504, '', '').message, /\(504\)/);
	for (const status of [500, 502, 503, 504]) assert.equal(explainHttpError(status, '', '').kind, 'upstream', String(status));
});

test('any other status: upstream, naming the status', () => {
	const notAllowed = explainHttpError(405, '', '');
	assert.equal(notAllowed.kind, 'upstream');
	assert.match(notAllowed.message, /\(405\)/);
	assert.equal(explainHttpError(405, '{"message":"Method not allowed"}', JSON_TYPE).message, 'Method not allowed');
	assert.equal(explainHttpError(405, '{"message":"Method not allowed"}', JSON_TYPE).kind, 'upstream');
	assert.equal(explainHttpError(405, '{"message":"Method not allowed"}', JSON_TYPE).setup, null, 'a 4xx is about the request');
	assert.match(explainHttpError(418, null, undefined).message, /\(418\)/);
});

test('bodyMessage: JSON message, short plain text, never HTML or long text', () => {
	assert.equal(bodyMessage('{"message":"  hi  "}', JSON_TYPE), 'hi');
	assert.equal(bodyMessage('{"message":42}', JSON_TYPE), null);
	assert.equal(bodyMessage('{"error":"x"}', JSON_TYPE), null);
	assert.equal(bodyMessage('[1,2]', JSON_TYPE), null);
	assert.equal(bodyMessage('{broken json', ''), null);
	assert.equal(bodyMessage('Payload too large', 'text/plain'), 'Payload too large');
	assert.equal(bodyMessage('<p>hi</p>', 'text/plain'), null, 'looks like HTML');
	assert.equal(bodyMessage('hi', 'text/html'), null, 'served as HTML');
	assert.equal(bodyMessage('x'.repeat(301), 'text/plain'), null);
	assert.equal(bodyMessage('', ''), null);
	assert.equal(bodyMessage(undefined, undefined), null);
});
