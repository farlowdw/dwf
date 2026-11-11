/**
 * readerWords.test.mjs — what a reader really reads when the code runner fails, on a public site
 * too. Each row drives a real function into a failure, hands its real answer to the editor's
 * explainHttpError(), and checks the words: nothing of how the site is set up, while the setup note
 * and the function log keep the reason. So a new message in either side, or a marker dropped from
 * one, shows here. The table in README.md > What the reader sees quotes the same words, and a test
 * holds it to them. And what anyone calling a function directly reads, its raw answer: no
 * variable, no server, no path, none of the server's own words (lib/piston.mjs > WHAT A CALLER IS
 * TOLD). And where the server's own words do go on (its 400 about the request, a run's output),
 * the server's address is replaced as the secret is.
 * Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new way to fail: a row in EXECUTE_FAILURES or RUNTIMES_FAILURES, and in UPSTREAM_ERRORS when
 *   it comes from the server. A word a reader must never meet: SETUP_WORDS; one a direct caller
 *   must never meet: CALLER_MUST_NOT_SEE. Another line the README's table quotes: README_QUOTES.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
	MESSAGE_BAD_REQUEST,
	MESSAGE_CONFIG,
	MESSAGE_NOT_JSON,
	MESSAGE_NO_FUNCTION,
	MESSAGE_ORIGIN_REFUSED,
	MESSAGE_RATE_LIMITED,
	MESSAGE_REFUSED,
	MESSAGE_TOO_LARGE,
	MESSAGE_WALL,
	explainHttpError,
} from '../../../components/CodeEditor/lib/codeRunner/errors.js';
import { EDITOR_ERRORS } from '../../../components/CodeEditor/messages.js';
import { handleExecute } from '../execute.mjs';
import { createRateLimiter } from '../lib/rateLimit.mjs';
import { handleRuntimes } from '../runtimes.mjs';
import { FAKE_BASE_URL, fakeEnv, fakeFetch, fetchFailed, siteHeaders, siteRequest } from './fakePiston.mjs';

/** What a reader's words never hold: names of the setup, commands, files and the like. */
const SETUP_WORDS = /piston|netlify|npm |password|proxy|secret|variable|deploy|plugin|docusaurus|config|function|readme|[a-z]_[a-z]|\.m?js\b|\.md\b/i;

/** The README, beside this folder. */
const README_URL = new URL('../README.md', import.meta.url);

/** The heading of the table of the reader's words, and the next heading. */
const README_SECTION = '## What the reader sees';
const NEXT_SECTION = '\n## ';

/** What ends the part of a message the table quotes: the first colon or full stop. */
const END_OF_QUOTE = /[:.]/;

/** The statuses the editor has words for, and some it has not. */
const STATUSES = Object.freeze([400, 401, 403, 404, 405, 413, 415, 418, 429, 500, 501, 502, 503, 504, 520]);

/** A client's address, for the rate limit. */
const CONTEXT = Object.freeze({ ip: '203.0.113.7' });

/** A page on another site, for the origin guard. */
const OTHER_ORIGIN = 'https://other.example.test';

/** The error Node's fetch gives on a time limit. */
const TIMED_OUT = Object.freeze({ error: Object.assign(new Error('timed out'), { name: 'TimeoutError' }) });

/** A made-up host an upstream error names, which no answer may carry. */
const MARKER = 'runner-host.example.internal';

/** What a direct caller must never read in an answer: a variable, the server's name or paths, the server's own words. */
const CALLER_MUST_NOT_SEE = new RegExp(`PISTON_|CODE_RUNNER_|piston|/api/v2|${MARKER.replaceAll('.', '\\.')}`, 'i');

/** Error answers from upstream, each naming MARKER: every status the functions re-label or keep. */
const UPSTREAM_ERRORS = Object.freeze([
	{ status: 401, body: { message: `who are you, asks ${MARKER}` } },
	{ status: 403, body: `Forbidden by ${MARKER}`, contentType: 'text/plain' },
	{ status: 404, body: `<html>${MARKER}</html>`, contentType: 'text/html' },
	{ status: 302, body: '' },
	{ status: 422, body: `Unprocessable at ${MARKER}`, contentType: 'text/plain' },
	{ status: 500, body: { message: `worker pool crashed on ${MARKER}` } },
	{ status: 503, body: `<html>${MARKER} is overloaded</html>`, contentType: 'text/html' },
	{ status: 600, body: '' },
]);

/** Everything a mocked console.error received, as one string. */
function logText(mock) {
	return mock.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
}

/** A POST of a small program from the site's own page. */
function runRequest(headers = siteHeaders({ 'content-type': 'application/json' })) {
	const body = JSON.stringify({ language: 'python', version: '3.12.0', files: [{ name: 'main.py', content: 'print(1)' }] });
	return siteRequest('/.netlify/functions/execute', { method: 'POST', headers, body });
}

/** The GET the editor makes for the installed languages. */
function runtimesRequest(headers = siteHeaders()) {
	return siteRequest('/.netlify/functions/runtimes', { method: 'GET', headers });
}

/** The failures both functions share: name, what the fake server does, the kind and the reader's words. */
const SHARED_FAILURES = Object.freeze([
	['the proxy refuses the secret', { answer: { status: 403, body: { message: 'Forbidden' } } }, 'refused', MESSAGE_REFUSED],
	['the server cannot be reached', { answer: { error: fetchFailed() } }, 'upstream', 'The code runner could not be reached (502). Try again in a moment.'],
	['no answer in time', { answer: TIMED_OUT }, 'upstream', 'The code runner took too long to answer (504). Try again in a moment.'],
	['the server answers 401', { answer: { status: 401, body: { message: 'who are you' } } }, 'upstream', 'The code runner could not be reached (502). Try again in a moment.'],
	['the server answers 404', { answer: { status: 404, body: '' } }, 'upstream', 'The code runner could not be reached (502). Try again in a moment.'],
	['the server answers 500', { answer: { status: 500, body: { message: 'worker pool crashed' } } }, 'upstream', 'The code runner failed (500). Try again in a moment.'],
	['the server answers 503', { answer: { status: 503, body: 'overloaded' } }, 'upstream', 'The code runner is unavailable right now (503). Try again in a moment.'],
	['neither variable set', { env: {} }, 'config', MESSAGE_CONFIG],
	['the secret holds a line break', { env: fakeEnv({ PISTON_PROXY_SECRET: 'made\nup' }) }, 'upstream', 'The code runner failed (500). Try again in a moment.'],
	['the function itself breaks', { limiter: {} }, 'upstream', 'The code runner failed (500). Try again in a moment.'],
]);

/** The failures of a run: SHARED_FAILURES, and an answer that is not JSON. */
const EXECUTE_FAILURES = Object.freeze([
	...SHARED_FAILURES,
	['the server answers with no JSON', { answer: { status: 200, body: '<html>a parked domain</html>', contentType: 'text/html' } }, 'upstream', 'The code runner could not be reached (502). Try again in a moment.'],
]);

/** The failures of the list of languages: SHARED_FAILURES, and an answer that is not a list. */
const RUNTIMES_FAILURES = Object.freeze([
	...SHARED_FAILURES,
	['the server answers with no list', { answer: { status: 200, body: { nope: true } } }, 'upstream', 'The code runner could not be reached (502). Try again in a moment.'],
]);

/** What the editor makes of a real Response. */
async function explained(response) {
	const text = await response.text();
	return explainHttpError(response.status, text, response.headers.get('content-type'));
}

/** The options of one failure, for the function under test; its log stays out of the test's output. */
function failureOptions({ answer = { status: 200, body: [] }, env = fakeEnv(), limiter = null }) {
	return { env, fetchImpl: fakeFetch(answer), limiter, context: CONTEXT };
}

/** The checks every failure shares. */
function assertReaderWords(error, kind, words, name) {
	assert.equal(error.kind, kind, name);
	assert.equal(error.message, words, name);
	assert.doesNotMatch(error.message, SETUP_WORDS, name);
}

test('every word a reader can meet by status alone says nothing of the setup', () => {
	const constants = [MESSAGE_BAD_REQUEST, MESSAGE_CONFIG, MESSAGE_NOT_JSON, MESSAGE_NO_FUNCTION, MESSAGE_ORIGIN_REFUSED, MESSAGE_RATE_LIMITED, MESSAGE_REFUSED, MESSAGE_TOO_LARGE, MESSAGE_WALL];
	for (const words of [...constants, ...Object.values(EDITOR_ERRORS)]) assert.doesNotMatch(words, SETUP_WORDS, words);
	for (const status of STATUSES) assert.doesNotMatch(explainHttpError(status, '', '').message, SETUP_WORDS, String(status));
});

test('execute: each failure on the server side, in the words a reader gets', async (t) => {
	t.mock.method(console, 'error', () => {});
	for (const [name, failure, kind, words] of EXECUTE_FAILURES) {
		assertReaderWords(await explained(await handleExecute(runRequest(), failureOptions(failure))), kind, words, name);
	}
});

test('runtimes: each failure on the server side, in the words a reader gets', async (t) => {
	t.mock.method(console, 'error', () => {});
	for (const [name, failure, kind, words] of RUNTIMES_FAILURES) {
		assertReaderWords(await explained(await handleRuntimes(runtimesRequest(), failureOptions(failure))), kind, words, name);
	}
});

test("README.md > What the reader sees quotes the reader's words as they are", () => {
	const readme = fs.readFileSync(README_URL, 'utf8');
	const start = readme.indexOf(README_SECTION);
	const section = readme.slice(start, readme.indexOf(NEXT_SECTION, start + README_SECTION.length));
	const statusLines = [500, 502, 504].map((status) => explainHttpError(status, '', '').message);
	const quotes = [MESSAGE_ORIGIN_REFUSED, MESSAGE_REFUSED, MESSAGE_CONFIG, MESSAGE_NO_FUNCTION, MESSAGE_WALL, MESSAGE_TOO_LARGE, ...statusLines];
	for (const words of quotes) {
		const quote = `*${words.split(END_OF_QUOTE)[0]}`;
		assert.ok(section.includes(quote), `the table quotes ${quote}`);
	}
});

test("the function's 5xx words go to the note, and the function log names what to check, never a value", async (t) => {
	const errorLog = t.mock.method(console, 'error', () => {});
	const notJson = await explained(await handleExecute(runRequest(), failureOptions({ answer: { status: 200, body: 'not json', contentType: 'text/plain' } })));
	assert.match(notJson.setup, /^the functions answered 502: .*not JSON/);
	const badValue = await explained(await handleExecute(runRequest(), failureOptions({ env: fakeEnv({ PISTON_PROXY_SECRET: 'made\nup' }) })));
	assert.match(badValue.setup, /^the functions answered 500: Invalid server configuration/);
	const log = logText(errorLog);
	assert.match(log, /not JSON \(\/api\/v2\/execute\)\. Check PISTON_BASE_URL\./);
	assert.match(log, /PISTON_PROXY_SECRET contains a character a header cannot carry/);
	for (const words of [notJson.setup, badValue.setup, log]) assert.doesNotMatch(words, /made/, 'never the value');
});

test("a direct caller of either function is told nothing of the setup: no variable, no server, no path, none of the server's words", async (t) => {
	t.mock.method(console, 'error', () => {});
	const foreign = siteHeaders({ 'content-type': 'application/json', origin: OTHER_ORIGIN });
	const answers = [
		await handleExecute(runRequest(foreign), failureOptions({})),
		await handleRuntimes(runtimesRequest({ origin: OTHER_ORIGIN }), failureOptions({})),
		await handleExecute(runRequest(), failureOptions({ answer: { status: 400, body: `Bad request at ${MARKER}`, contentType: 'text/plain' } })),
		await handleExecute(runRequest(), failureOptions({ answer: { status: 200, body: `<html>${MARKER}</html>`, contentType: 'text/html' } })),
	];
	for (const failure of [...UPSTREAM_ERRORS.map((answer) => ({ answer })), { answer: { error: fetchFailed() } }, { answer: TIMED_OUT }, { env: {} }, { env: fakeEnv({ PISTON_PROXY_SECRET: 'made\nup' }) }]) {
		answers.push(await handleExecute(runRequest(), failureOptions(failure)));
		answers.push(await handleRuntimes(runtimesRequest(), failureOptions(failure)));
	}
	answers.push(await handleRuntimes(runtimesRequest(), failureOptions({ answer: { status: 200, body: { list: MARKER } } })));
	for (const answer of answers) {
		const text = await answer.text();
		assert.ok(answer.status >= 400, `${answer.status} ${text}`);
		assert.equal(answer.headers.get('content-type'), 'application/json; charset=utf-8', text);
		assert.doesNotMatch(text, CALLER_MUST_NOT_SEE, `${answer.status} ${text}`);
	}
});

test("the server's address never goes on to a caller: its own 400 words and a run's output carry a placeholder in its place", async (t) => {
	t.mock.method(console, 'error', () => {});
	const host = new URL(FAKE_BASE_URL).host;
	const named = `${FAKE_BASE_URL}/api/v2/execute refused it, says ${host.toUpperCase()}`;
	const refused = await handleExecute(runRequest(), failureOptions({ answer: { status: 400, body: { message: named } } }));
	assert.equal(refused.status, 400);
	assert.deepEqual(await refused.json(), { message: '[server]/api/v2/execute refused it, says [server]' });
	const ran = await handleExecute(runRequest(), failureOptions({ answer: { status: 200, body: { run: { stdout: `this machine is ${host}\n` } } } }));
	assert.equal(ran.status, 200);
	assert.deepEqual(await ran.json(), { run: { stdout: 'this machine is [server]\n' } });
	const local = fakeEnv({ PISTON_BASE_URL: 'http://127.0.0.1:2000' });
	const offline = await handleExecute(runRequest(), failureOptions({ env: local, answer: { status: 200, body: { run: { stdout: 'ping 127.0.0.1 and localhost\n' } } } }));
	assert.deepEqual(await offline.json(), { run: { stdout: 'ping 127.0.0.1 and localhost\n' } }, "a local server's name is no secret: a run's output keeps it");
});

test("a 400 that is not Piston's own (http:// to a TLS port) reaches the reader as the runner unreachable, with a setup note", async (t) => {
	t.mock.method(console, 'error', () => {});
	const answer = { status: 400, body: 'Client sent an HTTP request to an HTTPS server.\n', contentType: null };
	const error = await explained(await handleExecute(runRequest(), failureOptions({ answer })));
	assert.equal(error.kind, 'upstream');
	assert.doesNotMatch(error.message, /HTTPS/);
	assert.doesNotMatch(error.message, SETUP_WORDS);
	assert.notEqual(error.setup, null, 'the console gets a note');
});

test('the three markers: the words each function really sends reach the kind the editor reads them as', async (t) => {
	t.mock.method(console, 'error', () => {});
	const foreign = siteHeaders({ 'content-type': 'application/json', origin: OTHER_ORIGIN });
	assertReaderWords(await explained(await handleExecute(runRequest(foreign), failureOptions({}))), 'origin', MESSAGE_ORIGIN_REFUSED, 'execute');
	assertReaderWords(await explained(await handleRuntimes(runtimesRequest({ origin: OTHER_ORIGIN }), failureOptions({}))), 'origin', MESSAGE_ORIGIN_REFUSED, 'runtimes');
	const limiter = createRateLimiter({ limit: 1, windowSeconds: 60 });
	await handleExecute(runRequest(), failureOptions({ limiter }));
	const limited = await explained(await handleExecute(runRequest(), failureOptions({ limiter })));
	assert.equal(limited.kind, 'rate-limited');
	assert.match(limited.message, /^Too many requests from your connection \(at most 1 in 60 s\): try again in \d+ s\.$/);
	assert.doesNotMatch(limited.message, SETUP_WORDS);
	const missing = await explained(await handleExecute(runRequest(), failureOptions({ env: {} })));
	assert.equal(missing.kind, 'config');
});
