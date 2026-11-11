/**
 * piston.test.mjs — shared/functions/code-runner/lib/piston.mjs, the part both functions share:
 * reading the configuration (a secret a header cannot carry is refused, never shown; the 500 names
 * no variable, the log line does), one call to the Piston server (secret header, redirects refused,
 * timeout, network failure), the log (the secret replaced by "[secret]"; an upstream answer's
 * status, path and body kept there, not in the page's words) and the web Responses the functions
 * answer with. A fake fetch stands
 * in for the server (fakePiston.mjs); the default transport (requestOverSocket: Node's own http,
 * never the global fetch Netlify's runtime wraps) runs against throwaway servers on 127.0.0.1:
 * the global fetch is never called, a redirect is refused and its target never gets the secret,
 * the request carries its length and closes its socket, a cut answer or a silent server fails
 * cleanly. No other network.
 * Run with `npm run test:shared`.
 * To change it: a new rule of lib/piston.mjs gets a test here, over fakePiston.mjs, or a throwaway
 * server (startLoopbackServer) where it needs the real transport.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
	INVALID_SECRET_MESSAGE,
	MISSING_CONFIG_MESSAGE,
	NETWORK_CODE,
	REDIRECT_MODE,
	PROXY_HEADER,
	SECRET_PLACEHOLDER,
	TIMEOUT_CODE,
	UPSTREAM_TIMEOUT_MS,
	callPiston,
	configProblem,
	createLogger,
	errorResponse,
	failureResponse,
	headerValue,
	jsonResponse,
	loadConfig,
	messageFromBody,
	pageStatusFor,
	pistonConfig,
	redactSecret,
	requestMethod,
	textResponse,
	withoutBody,
} from '../lib/piston.mjs';
import * as piston from '../lib/piston.mjs';
import { FAKE_BASE_URL, FAKE_SECRET, assertNoSecret, bodyOf, fakeEnv, fakeFetch, fetchFailed, loggedText } from './fakePiston.mjs';

/** The loopback address the redirect test's server listens on (never leaves this machine). */
const LOOPBACK = '127.0.0.1';

/** Paths of the redirect test's server: the first answers 302 to the second. */
const REDIRECTING_PATH = '/api/v2/execute';
const REDIRECT_TARGET_PATH = '/elsewhere';

/** A URL for the Requests the helper tests build (never fetched). */
const ANY_URL = 'https://notes.example.test/.netlify/functions/execute';

/** Starts a server on LOOPBACK that redirects REDIRECTING_PATH; resolves to { baseUrl, requests, close }. */
function startRedirectingServer() {
	const requests = [];
	const server = http.createServer((request, response) => {
		requests.push({ url: request.url, secret: request.headers[PROXY_HEADER] });
		if (request.url === REDIRECTING_PATH) {
			response.writeHead(302, { location: REDIRECT_TARGET_PATH });
			response.end();
			return;
		}
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end('{}');
	});
	return new Promise((resolve) => {
		server.listen(0, LOOPBACK, () => {
			const baseUrl = `http://${LOOPBACK}:${server.address().port}`;
			resolve({ baseUrl, requests, close: () => new Promise((done) => server.close(done)) });
		});
	});
}

/**
 * Starts a server on LOOPBACK that answers with `answer(request, response)` once a request's body
 * has arrived. Resolves to { baseUrl, requests, openSockets(), close }: each request recorded with
 * its url, method, headers and body. close() ends every socket, a held one too.
 */
function startLoopbackServer(answer) {
	const requests = [];
	const sockets = new Set();
	const server = http.createServer((request, response) => {
		const chunks = [];
		request.on('data', (chunk) => chunks.push(chunk));
		request.on('end', () => {
			requests.push({ url: request.url, method: request.method, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
			answer(request, response);
		});
	});
	server.on('connection', (socket) => {
		sockets.add(socket);
		socket.on('close', () => sockets.delete(socket));
	});
	return new Promise((resolve) => {
		server.listen(0, LOOPBACK, () => {
			const baseUrl = `http://${LOOPBACK}:${server.address().port}`;
			const close = () => new Promise((done) => {
				server.close(() => done());
				server.closeAllConnections();
			});
			resolve({ baseUrl, requests, openSockets: () => sockets.size, close });
		});
	});
}

/** An answer of `status` with a small JSON body (a redirect status gets a Location too). */
function answerWith(status) {
	return (request, response) => {
		response.writeHead(status, { 'content-type': 'application/json', location: REDIRECT_TARGET_PATH });
		response.end('{}');
	};
}

/** The messages of an error and its causes, as one string. */
function causeChain(error) {
	const messages = [];
	for (let link = error; link; link = link.cause) messages.push(String(link.message));
	return messages.join(' <- ');
}

/** How long a test waits for the server to see the client's socket close. */
const SOCKET_CLOSE_WAIT_MS = 2000;

/** Resolves once `check()` is true, or after `ms` (the caller asserts). */
async function waitFor(check, ms) {
	const deadline = Date.now() + ms;
	while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
}

/** A console.error mock's log lines, read through a logger made for the fake environment. */
function fakeLogger(t, env = fakeEnv()) {
	const errorLog = t.mock.method(console, 'error', () => {});
	return { log: createLogger('test', env), errorLog };
}

/** A short timeout so the timeout tests finish at once. */
const QUICK_TIMEOUT_MS = 20;

test('the contract constants', () => {
	assert.equal(PROXY_HEADER, 'x-piston-proxy-secret');
	assert.equal(UPSTREAM_TIMEOUT_MS, 25000);
	assert.equal(REDIRECT_MODE, 'error', 'a redirect would carry the secret to its target');
	assert.equal(SECRET_PLACEHOLDER, '[secret]');
});

test('a configuration problem tells a caller no variable: the 500 says what is wrong, the log line names the variable', () => {
	const { CONFIG_PROBLEMS } = piston;
	assert.equal(MISSING_CONFIG_MESSAGE, 'Missing server configuration.', 'the editor reads these first words');
	assert.equal(INVALID_SECRET_MESSAGE, 'Invalid server configuration.');
	assert.deepEqual(CONFIG_PROBLEMS?.missing, { message: MISSING_CONFIG_MESSAGE, log: 'Missing server configuration (PISTON_BASE_URL / PISTON_PROXY_SECRET).' });
	assert.deepEqual(CONFIG_PROBLEMS?.invalidSecret, { message: INVALID_SECRET_MESSAGE, log: 'Invalid server configuration: PISTON_PROXY_SECRET contains a character a header cannot carry.' });
});

test("the page's words for an error from the server are its status only; the log line keeps the path, the variable to check and the start of the body", () => {
	const { upstreamStatusMessage, upstreamLogLine, bodyExcerpt, LOGGED_BODY_CHARS } = piston;
	assert.equal(upstreamStatusMessage(503, '/api/v2/execute', '{"message":"behind host.internal"}'), "The code runner's server answered 503.");
	assert.equal(LOGGED_BODY_CHARS, 300);
	assert.equal(upstreamLogLine(503, '/api/v2/execute', 'overloaded'), 'The Piston server answered 503 for /api/v2/execute. Body: overloaded');
	assert.equal(upstreamLogLine(401, '/api/v2/runtimes', ''), 'The Piston server answered 401 for /api/v2/runtimes. Check PISTON_BASE_URL. The body was empty.');
	assert.equal(bodyExcerpt('<html>\n\t<h1>502</h1>\r\n\u0007</html>'), 'Body: <html> <h1>502</h1> </html>', 'one line: white space and control characters as one space');
	const long = bodyExcerpt('x'.repeat(LOGGED_BODY_CHARS + 50));
	assert.equal(long, `Body: ${'x'.repeat(LOGGED_BODY_CHARS)} [cut at ${LOGGED_BODY_CHARS} characters]`);
});

test('pistonConfig trims, drops trailing slashes, and is null when anything is missing', () => {
	assert.deepEqual(pistonConfig(fakeEnv({ PISTON_BASE_URL: ` ${FAKE_BASE_URL}// ` })), { baseUrl: FAKE_BASE_URL, secret: FAKE_SECRET });
	assert.equal(pistonConfig(fakeEnv({ PISTON_BASE_URL: undefined })), null);
	assert.equal(pistonConfig(fakeEnv({ PISTON_BASE_URL: '/' })), null);
	assert.equal(pistonConfig(fakeEnv({ PISTON_PROXY_SECRET: '' })), null);
	assert.equal(pistonConfig({}), null);
	assert.equal(pistonConfig(undefined), null);
});

test('a secret holding a character a header cannot carry is refused, without showing it', async () => {
	const unsafe = [
		`${FAKE_SECRET}\n${FAKE_SECRET}`, // a value pasted across two lines
		`${FAKE_SECRET}\r\nmore`,
		`${FAKE_SECRET}\0`,
		`${FAKE_SECRET}\u0001`, // another control character
		`${FAKE_SECRET}\u007f`, // DEL
		`${FAKE_SECRET}€`, // above 0xFF
		`${FAKE_SECRET}😀`,
	];
	for (const secret of unsafe) {
		const env = fakeEnv({ PISTON_PROXY_SECRET: secret });
		assert.equal(pistonConfig(env), null, JSON.stringify(secret));
		assert.equal(configProblem(env), piston.CONFIG_PROBLEMS?.invalidSecret);
		await assertNoSecret(configProblem(env));
	}
	// What a header CAN carry: tab, space, visible ASCII, 0x80-0xFF; the ends are trimmed.
	for (const secret of [`${FAKE_SECRET} x`, `${FAKE_SECRET}\tx`, `${FAKE_SECRET}é`, `${FAKE_SECRET}\r\n`]) {
		const env = fakeEnv({ PISTON_PROXY_SECRET: secret });
		assert.equal(configProblem(env), null, JSON.stringify(secret));
		assert.equal(pistonConfig(env).secret, secret.trim());
	}
	assert.equal(configProblem(fakeEnv({ PISTON_BASE_URL: '' })), piston.CONFIG_PROBLEMS?.missing);
	assert.equal(configProblem(fakeEnv()), null);
});

test('loadConfig: the config, or a logged 500 answer whose message never shows a value or a variable; the log names the variable', async (t) => {
	const { log, errorLog } = fakeLogger(t);
	assert.deepEqual(loadConfig(fakeEnv(), log), { config: pistonConfig(fakeEnv()), failure: null });
	assert.equal(errorLog.mock.callCount(), 0, 'nothing logged for a usable configuration');

	const missing = loadConfig(fakeEnv({ PISTON_PROXY_SECRET: undefined }), log);
	assert.equal(missing.config, null);
	assert.equal(missing.failure.status, 500);
	assert.deepEqual(await bodyOf(missing.failure), { message: MISSING_CONFIG_MESSAGE });

	const invalid = loadConfig(fakeEnv({ PISTON_PROXY_SECRET: `${FAKE_SECRET}\n${FAKE_SECRET}` }), log);
	assert.equal(invalid.config, null);
	assert.equal(invalid.failure.status, 500);
	await assertNoSecret(invalid.failure);
	assert.deepEqual(await bodyOf(invalid.failure), { message: INVALID_SECRET_MESSAGE });
	for (const message of [MISSING_CONFIG_MESSAGE, INVALID_SECRET_MESSAGE]) {
		assert.doesNotMatch(message, /PISTON_|CODE_RUNNER_/, 'the two answers above: a caller is told no variable');
	}
	assert.equal(errorLog.mock.callCount(), 2);
	assert.match(loggedText(errorLog), /PISTON_BASE_URL \/ PISTON_PROXY_SECRET/);
	assert.match(loggedText(errorLog), /PISTON_PROXY_SECRET contains a character/);
	await assertNoSecret(loggedText(errorLog));
});

test('createLogger writes "[label] message" with every occurrence of the secret replaced', async (t) => {
	const { log, errorLog } = fakeLogger(t);
	log(`first ${FAKE_SECRET} then ${FAKE_SECRET}.`);
	assert.equal(loggedText(errorLog), '[test] first [secret] then [secret].');
	const unsafeEnv = fakeEnv({ PISTON_PROXY_SECRET: `${FAKE_SECRET}\n${FAKE_SECRET}` });
	createLogger('test', unsafeEnv)(`Headers.append: "${FAKE_SECRET}\n${FAKE_SECRET}" is an invalid header value.`);
	await assertNoSecret(loggedText(errorLog));
	assert.equal(redactSecret('nothing to hide', ''), 'nothing to hide');
	assert.equal(redactSecret('nothing to hide', undefined), 'nothing to hide');
});

test("failureResponse logs the error's causes with the secret replaced, and answers 502", async (t) => {
	const { log, errorLog } = fakeLogger(t);
	// The shape of Node's fetch error for a value a header cannot carry: it quotes the value.
	const quoting = new TypeError(`Headers.append: "${FAKE_SECRET}" is an invalid header value.`);
	const config = pistonConfig(fakeEnv());
	const error = await callPiston(config, '/x', { fetchImpl: fakeFetch({ error: quoting }) }).catch((caught) => caught);
	assert.equal(error.code, NETWORK_CODE);
	const response = failureResponse(log, error);
	assert.equal(response.status, 502);
	assert.deepEqual(await bodyOf(response.clone()), { message: 'Could not reach the code runner. Try again in a moment.' }, 'the answer names no server');
	assert.match(loggedText(errorLog), /^\[test\] Could not reach the Piston server \(\/x\)\. \(TypeError: Headers\.append: "\[secret\]"/);
	await assertNoSecret(loggedText(errorLog));
	await assertNoSecret(response);
});

test('callPiston sends the secret and a JSON body, and resolves whatever the status', async () => {
	const fetchImpl = fakeFetch({ status: 418, body: 'teapot', contentType: 'text/plain' });
	const config = pistonConfig(fakeEnv());
	const answer = await callPiston(config, '/api/v2/execute', { method: 'POST', body: '{}', fetchImpl });
	assert.deepEqual(answer, { status: 418, contentType: 'text/plain', text: 'teapot' });
	const [{ url, init }] = fetchImpl.calls;
	assert.equal(url, `${FAKE_BASE_URL}/api/v2/execute`);
	assert.equal(init.method, 'POST');
	assert.equal(init.body, '{}');
	assert.equal(init.headers[PROXY_HEADER], FAKE_SECRET);
	assert.equal(init.headers['content-type'], 'application/json');
	assert.equal(init.redirect, 'error', 'a redirect is never followed');
	assert.ok(init.signal, 'the request can be aborted');
});

test('the default transport: a redirect is a NETWORK_CODE failure and its target never gets the secret', async () => {
	const server = await startRedirectingServer();
	try {
		const config = { baseUrl: server.baseUrl, secret: FAKE_SECRET };
		await assert.rejects(callPiston(config, REDIRECTING_PATH, { method: 'POST', body: '{}' }), (error) => {
			assert.equal(error.code, NETWORK_CODE);
			assert.match(causeChain(error), /unexpected redirect/, 'the cause says why');
			return true;
		});
		assert.deepEqual(server.requests, [{ url: REDIRECTING_PATH, secret: FAKE_SECRET }], 'only the Piston address was asked');
	} finally {
		await server.close();
	}
});

test("the default transport is Node's own http, never the global fetch, which Netlify's runtime wraps to name the host it reached in the function's answer", async () => {
	const server = await startLoopbackServer(answerWith(200));
	const realFetch = globalThis.fetch;
	const globalCalls = [];
	globalThis.fetch = async (...args) => {
		globalCalls.push(args);
		return realFetch(...args);
	};
	try {
		const answer = await callPiston({ baseUrl: server.baseUrl, secret: FAKE_SECRET }, '/api/v2/runtimes');
		assert.deepEqual(answer, { status: 200, contentType: 'application/json', text: '{}' });
		assert.equal(server.requests.length, 1, 'the server got the request');
		assert.equal(globalCalls.length, 0, 'the global fetch was never called');
	} finally {
		globalThis.fetch = realFetch;
		await server.close();
	}
});

test('the default transport sends the body with its length in bytes, closes its socket, and puts the secret in its header only', async () => {
	const server = await startLoopbackServer(answerWith(200));
	try {
		const config = { baseUrl: server.baseUrl, secret: FAKE_SECRET };
		const body = JSON.stringify({ language: 'python', files: [{ content: 'print("é")' }] });
		await callPiston(config, '/api/v2/execute', { method: 'POST', body });
		await callPiston(config, '/api/v2/runtimes');
		const [post, get] = server.requests;
		assert.equal(post.method, 'POST');
		assert.equal(post.url, '/api/v2/execute');
		assert.equal(post.body, body);
		assert.equal(post.headers['content-length'], String(Buffer.byteLength(body, 'utf8')), 'bytes, not characters');
		assert.equal(post.headers['content-type'], 'application/json');
		assert.equal(get.method, 'GET');
		assert.equal(get.body, '', 'a GET sends no body');
		for (const seen of [post, get]) {
			assert.equal(seen.headers.connection, 'close', 'never a kept-alive socket');
			assert.equal(seen.headers[PROXY_HEADER], FAKE_SECRET);
			assert.ok(!seen.url.includes(FAKE_SECRET), 'the secret is never in the URL');
		}
		await waitFor(() => server.openSockets() === 0, SOCKET_CLOSE_WAIT_MS);
		assert.equal(server.openSockets(), 0, 'each socket closed after its answer');
	} finally {
		await server.close();
	}
});

test('the default transport refuses the five redirect statuses fetch refuses, and hands a 300 or a 304 over as a status', async () => {
	const server = await startLoopbackServer((request, response) => answerWith(Number(request.url.split('/').pop()))(request, response));
	try {
		const config = { baseUrl: server.baseUrl, secret: FAKE_SECRET };
		for (const status of [301, 302, 303, 307, 308]) {
			await assert.rejects(callPiston(config, `/status/${status}`), (error) => {
				assert.equal(error.code, NETWORK_CODE, String(status));
				assert.match(causeChain(error), /unexpected redirect/);
				return true;
			});
		}
		for (const status of [300, 304]) {
			assert.equal((await callPiston(config, `/status/${status}`)).status, status);
		}
		assert.ok(server.requests.every((request) => request.url.startsWith('/status/')), 'no redirect was followed');
		assert.equal(server.requests.length, 7);
	} finally {
		await server.close();
	}
});

test('the default transport: an answer cut off halfway is a NETWORK_CODE failure, never an error thrown outside the call', async () => {
	const server = await startLoopbackServer((request, response) => {
		response.writeHead(200, { 'content-type': 'application/json', 'content-length': '100' });
		response.write('{"run":');
		setTimeout(() => response.socket.destroy(), 20);
	});
	try {
		await assert.rejects(callPiston({ baseUrl: server.baseUrl, secret: FAKE_SECRET }, '/api/v2/execute', { method: 'POST', body: '{}' }), { code: NETWORK_CODE });
	} finally {
		await server.close();
	}
});

test('the default transport: a server that never answers is a TIMEOUT_CODE failure, and the request is stopped', async () => {
	const server = await startLoopbackServer(() => {});
	try {
		await assert.rejects(callPiston({ baseUrl: server.baseUrl, secret: FAKE_SECRET }, '/api/v2/runtimes', { timeoutMs: QUICK_TIMEOUT_MS }), { code: TIMEOUT_CODE });
		await waitFor(() => server.openSockets() === 0, SOCKET_CLOSE_WAIT_MS);
		assert.equal(server.openSockets(), 0, 'the abort closed the socket');
	} finally {
		await server.close();
	}
});

test('the default transport speaks TLS to an https:// address, and refuses any scheme but http and https', async () => {
	const server = await startLoopbackServer(answerWith(200));
	try {
		const tlsToPlain = { baseUrl: server.baseUrl.replace('http:', 'https:'), secret: FAKE_SECRET };
		await assert.rejects(callPiston(tlsToPlain, '/api/v2/runtimes'), { code: NETWORK_CODE }, 'a TLS hello to a plain-http server fails');
		assert.equal(server.requests.length, 0, 'no plain-http request was made instead');
		await assert.rejects(callPiston({ baseUrl: 'ftp://127.0.0.1:21', secret: FAKE_SECRET }, '/x'), (error) => {
			assert.equal(error.code, NETWORK_CODE);
			assert.match(causeChain(error), /ftp:/);
			return true;
		});
	} finally {
		await server.close();
	}
});

test('callPiston gives up after timeoutMs, whether or not fetch honours the abort', async () => {
	const config = pistonConfig(fakeEnv());
	const honoursAbort = fakeFetch({ hang: true });
	await assert.rejects(callPiston(config, '/api/v2/runtimes', { fetchImpl: honoursAbort, timeoutMs: QUICK_TIMEOUT_MS }), (error) => {
		assert.equal(error.code, TIMEOUT_CODE);
		assert.ok(!error.message.includes(FAKE_SECRET));
		return true;
	});
	assert.equal(honoursAbort.calls[0].init.signal.aborted, true, 'the request is aborted');

	const ignoresAbort = async () => new Promise(() => {});
	await assert.rejects(callPiston(config, '/api/v2/runtimes', { fetchImpl: ignoresAbort, timeoutMs: QUICK_TIMEOUT_MS }), { code: TIMEOUT_CODE });
});

test("callPiston: a network failure is NETWORK_CODE; undici's own timeouts are TIMEOUT_CODE", async () => {
	const config = pistonConfig(fakeEnv());
	await assert.rejects(callPiston(config, '/x', { fetchImpl: fakeFetch({ error: fetchFailed('ECONNREFUSED') }) }), (error) => {
		assert.equal(error.code, NETWORK_CODE);
		assert.equal(error.cause.cause.code, 'ECONNREFUSED', 'the original error is kept as the cause');
		return true;
	});
	await assert.rejects(callPiston(config, '/x', { fetchImpl: fakeFetch({ error: fetchFailed('UND_ERR_BODY_TIMEOUT') }) }), { code: TIMEOUT_CODE });
	const timeoutError = new DOMException('timed out', 'TimeoutError');
	await assert.rejects(callPiston(config, '/x', { fetchImpl: fakeFetch({ error: timeoutError }) }), { code: TIMEOUT_CODE });
});

test('jsonResponse / errorResponse: web Responses with JSON, never cached unless overridden', async () => {
	const answer = jsonResponse(200, [1, 2]);
	assert.ok(answer instanceof Response);
	assert.equal(answer.status, 200);
	assert.equal(answer.headers.get('content-type'), 'application/json; charset=utf-8');
	assert.equal(answer.headers.get('cache-control'), 'no-store');
	assert.equal(await answer.text(), '[1,2]');
	const cached = jsonResponse(200, [], { 'cache-control': 'private, max-age=300' });
	assert.equal(cached.headers.get('cache-control'), 'private, max-age=300');
	const error = errorResponse(405, 'Use POST.', { allow: 'POST' });
	assert.equal(error.status, 405);
	assert.equal(error.headers.get('allow'), 'POST');
	assert.deepEqual(await bodyOf(error), { message: 'Use POST.' });
});

test('textResponse passes a body through as it is, and gives none on a status that forbids one', async () => {
	const passed = textResponse(403, 'Forbidden', { 'content-type': 'text/plain' });
	assert.equal(passed.status, 403);
	assert.equal(passed.headers.get('content-type'), 'text/plain');
	assert.equal(passed.headers.get('cache-control'), 'no-store');
	assert.equal(await passed.text(), 'Forbidden');
	for (const status of [204, 205, 304]) {
		const empty = textResponse(status, 'ignored');
		assert.equal(empty.status, status, `a Response may not carry a body with ${status}`);
		assert.equal(await empty.text(), '');
	}
});

test('withoutBody keeps the status and headers and drops the body (a HEAD answer)', async () => {
	const full = jsonResponse(200, [1], { 'cache-control': 'private, max-age=300' });
	const head = withoutBody(full);
	assert.equal(head.status, 200);
	assert.equal(head.headers.get('cache-control'), 'private, max-age=300');
	assert.equal(head.headers.get('content-type'), 'application/json; charset=utf-8');
	assert.equal(await head.text(), '');
});

test('pageStatusFor re-labels the statuses the page reads as the site\'s own, any 3xx, and any status a Response cannot carry', () => {
	assert.equal(pageStatusFor(401), 502);
	assert.equal(pageStatusFor(404), 502);
	for (const status of [300, 301, 302, 303, 304, 307, 308, 399]) {
		assert.equal(pageStatusFor(status), 502, `a ${status} is no answer`);
	}
	// Outside 200-599 `new Response()` throws a RangeError. fetch never delivers a 1xx (it keeps
	// waiting), so 199 is a unit case only; a 600 from an odd proxy is real.
	for (const status of [199, 600, 999]) {
		assert.equal(pageStatusFor(status), 502, `a ${status} cannot be a Response`);
	}
	for (const status of [200, 400, 403, 413, 500, 502, 503, 504, 599]) {
		assert.equal(pageStatusFor(status), status);
	}
});

test('small helpers: requestMethod, headerValue, messageFromBody', () => {
	assert.equal(requestMethod(new Request(ANY_URL, { method: 'post' })), 'POST');
	assert.equal(requestMethod({ method: 'options' }), 'OPTIONS');
	assert.equal(requestMethod({}), '');
	assert.equal(requestMethod(undefined), '');
	const request = new Request(ANY_URL, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
	assert.equal(headerValue(request, 'content-type'), 'application/json; charset=utf-8');
	assert.equal(headerValue(request, 'Content-Type'), 'application/json; charset=utf-8', 'Headers compare names in any case');
	assert.equal(headerValue(request, 'origin'), '', 'absent: an empty string, never null');
	assert.equal(headerValue({}, 'origin'), '');
	assert.equal(headerValue(undefined, 'origin'), '');
	assert.equal(messageFromBody('{"message":"python-3.10.0 runtime is unknown"}'), 'python-3.10.0 runtime is unknown');
	assert.equal(messageFromBody('{"message":""}'), null);
	assert.equal(messageFromBody('[]'), null);
	assert.equal(messageFromBody('<html>'), null);
});
