/**
 * overSocket.test.mjs — the two functions as Netlify runs them, end to end on this machine: the
 * site's shims' default exports (netlify/functions/execute.mjs and runtimes.mjs; in the hub, which
 * has no site, the library's own default exports, which the shims re-export), with the two variables
 * in process.env and the functions' own transport (lib/piston.mjs > requestOverSocket), talking over
 * a real socket to fakePistonServer.mjs on the loopback address. The global fetch is replaced by a
 * recorder, as Netlify's runtime replaces it. The page's side is the editor's own client
 * (lib/codeRunner/client.js and the result readers), whose fetch hands each request to the function
 * the way Netlify would. Nothing reaches a real server: the fake replays the editor's recorded answers.
 *
 *   a Run          the recorded answer reaches the page, its output shows, the server got the cleaned request
 *   a compile error  the page reads the error's line from the answer
 *   the languages  the runtimes function passes the server's list on
 *   no global fetch  both functions reach the server without it, so Netlify's runtime cannot name the host
 *   a refusal      the server's proxy refuses the function's secret: 403, "not accepting runs"
 *   the server down  nothing listens: 502, "could not be reached"
 *   too large      over the function's limit: 413 and nothing forwarded; over Piston's: its 400 becomes the same 413
 *
 * The variables are set in this test's own process only, from the fake's generated secret, and put
 * back after each test. Every test closes its fake in a `finally`, on failure too.
 * Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new way to fail over the socket: a test here, through runnerFor() and pageFetch(). The recordings
 *   replayed: RUN_RECORDING and COMPILE_RECORDING (fakePistonServer.mjs > FIXTURES_DIR). Which
 *   functions are called: functionFile() (a site's netlify/functions, else the library).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hostSite } from '../../../__tests__/sharedTree.mjs';
import { executeCode, fetchRuntimes, resetRuntimesCache } from '../../../components/CodeEditor/lib/codeRunner/client.js';
import { errorLocations } from '../../../components/CodeEditor/lib/codeRunner/errorLocations.js';
import { MESSAGE_REFUSED, MESSAGE_TOO_LARGE } from '../../../components/CodeEditor/lib/codeRunner/errors.js';
import { buildExecuteRequest } from '../../../components/CodeEditor/lib/codeRunner/request.js';
import { RESULT_COMPILE_ERROR, RESULT_SUCCESS, describeResult, summarizeResult } from '../../../components/CodeEditor/lib/codeRunner/result.js';
import { MAX_BODY_BYTES } from '../execute.mjs';
import { BASE_URL_VARIABLE, PROXY_VARIABLE } from '../lib/piston.mjs';
import { siteHeaders, siteRequest } from './fakePiston.mjs';
import { EXECUTE_PATH, RECORDED_RUNTIMES, RUNTIMES_PATH, generateSecret, startFakePiston } from './fakePistonServer.mjs';
import { FUNCTION_EXTENSION } from './functionFolder.mjs';

/** A recorded run that prints and exits 0 (a C program with one compiler warning). */
const RUN_RECORDING = 'errors/c-warning-only';

/** A recorded C++ program that does not compile, and where its error is. */
const COMPILE_RECORDING = 'errors/cpp-compile-error';
const COMPILE_ERROR_LINE = 5;
const COMPILE_ERROR_WORDS = "no matching function for call to 'std::vector<int>::push_back(std::string)'";

/** The reader's words for a server that cannot be reached (errors.js > UPSTREAM_MESSAGES). */
const UNREACHABLE_WORDS = 'The code runner could not be reached (502). Try again in a moment.';

/** A body limit for the fake under the functions' own, so Piston's refusal can be reached. */
const SMALL_BODY_LIMIT_BYTES = 1000;

/** Every test's time limit, so a socket left open fails its test instead of holding the run for good. */
const TEST_TIMEOUT_MS = 60000;
const TIMED = Object.freeze({ timeout: TEST_TIMEOUT_MS });

/** The site this folder is mounted in, or null in the hub. */
const SITE = hostSite();

/** The folder of the library's two functions. */
const LIBRARY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The folder Netlify reads in a site, from the site's root. */
const SITE_FUNCTIONS_FOLDER = path.join('netlify', 'functions');

/** The two variables the functions read. */
const VARIABLES = Object.freeze([BASE_URL_VARIABLE, PROXY_VARIABLE]);

/** Each test is a reader of its own, so the functions' rate limit never carries over. */
let readerCount = 0;

/** The file Netlify would run for `name`: the site's shim, or the library's function in the hub. */
function functionFile(name) {
	const folder = SITE === null ? LIBRARY_DIR : path.join(SITE, SITE_FUNCTIONS_FOLDER);
	return path.join(folder, `${name}${FUNCTION_EXTENSION}`);
}

/** The default export of that file, as Netlify calls it: (request, context) => Response. */
async function netlifyFunction(name) {
	const module = await import(pathToFileURL(functionFile(name)));
	return module.default;
}

/**
 * A fetch for the editor's client that hands each request to `fn` as Netlify would: a web Request to
 * the site's own host, with the page's Origin on a POST (a same-origin GET carries none), and
 * Netlify's context. Each answer's status, headers and body go into `seen`, as the page got them.
 */
function pageFetch(fn, context, seen) {
	return async (url, init = {}) => {
		const headers = init.method === 'POST' ? siteHeaders(init.headers) : { ...init.headers };
		const response = await fn(siteRequest(url, { method: init.method, headers, body: init.body }), context);
		seen.push({ status: response.status, headers: [...response.headers], text: await response.clone().text() });
		return response;
	};
}

/** The variables as they were, to put back. */
function savedVariables() {
	return VARIABLES.map((name) => [name, process.env[name]]);
}

function restoreVariables(saved) {
	for (const [name, value] of saved) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
}

/**
 * Replaces the global fetch with one that records each call and passes it on, as Netlify's
 * function runtime does (it times each call by host and names that host in the function's
 * answer). Returns { calls, restore }.
 */
function recordGlobalFetch() {
	const realFetch = globalThis.fetch;
	const calls = [];
	globalThis.fetch = async (...args) => {
		calls.push(String(args[0]?.url ?? args[0]));
		return realFetch(...args);
	};
	return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

/**
 * Runs `body` with a fake server, the variables pointing at it and the page's two fetches:
 *   secretFor(piston)  the secret the functions send (default: the fake's own)
 *   down               the fake is closed before the test, so nothing listens on its address
 *   fake               options for startFakePiston
 * `body` gets { piston, execute, runtimes, seen, errors, warnings, globalFetches }: the two
 * fetches, what the page received, the mocked console.error (the functions' log) and console.warn
 * (the editor's note), and the URLs the global fetch was called with (recordGlobalFetch).
 */
async function runnerFor(t, body, { secretFor = (piston) => piston.secret, down = false, fake = {} } = {}) {
	const piston = await startFakePiston(fake);
	const saved = savedVariables();
	const globalFetch = recordGlobalFetch();
	try {
		if (down) await piston.close();
		process.env[BASE_URL_VARIABLE] = piston.url;
		process.env[PROXY_VARIABLE] = secretFor(piston);
		resetRuntimesCache();
		readerCount += 1;
		const context = { ip: `reader-${readerCount}` };
		const seen = [];
		const errors = t.mock.method(console, 'error', () => {});
		const warnings = t.mock.method(console, 'warn', () => {});
		const execute = pageFetch(await netlifyFunction('execute'), context, seen);
		const runtimes = pageFetch(await netlifyFunction('runtimes'), context, seen);
		await body({ piston, execute, runtimes, seen, errors, warnings, globalFetches: globalFetch.calls });
	} finally {
		globalFetch.restore();
		restoreVariables(saved);
		resetRuntimesCache();
		await piston.close();
	}
}

/** A recording's program, as the editor sends it. */
function payloadOf(piston, name) {
	const { language, version, files } = piston.recording(name).request;
	return buildExecuteRequest({ language, version, code: files[0].content });
}

/** Everything a mock received, as one string. */
function mockText(mock) {
	return mock.mock.calls.map((call) => call.arguments.join(' ')).join('\n');
}

/** Fails when `secret` is anywhere in what the page received. */
function assertPageNeverSaw(seen, secret) {
	assert.ok(seen.length > 0, 'the page received an answer');
	assert.ok(!JSON.stringify(seen).includes(secret), 'the secret never reaches the page');
}

/** The RunError the promise rejects with. */
async function rejection(promise) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	assert.fail('the call should have failed');
	return null;
}

test('a Run: the recorded answer reaches the page through the function and the socket, and its output shows', TIMED, async (t) => {
	await runnerFor(t, async ({ piston, execute, seen, errors }) => {
		const payload = payloadOf(piston, RUN_RECORDING);
		const answer = await executeCode(payload, { fetchImpl: execute });
		assert.deepEqual(answer, piston.recording(RUN_RECORDING).body);
		const summary = summarizeResult(answer);
		assert.equal(summary.status, RESULT_SUCCESS);
		assert.equal(summary.output, 'hi\n');
		assert.equal(summary.exitCode, 0);
		const [run, ...more] = piston.runs();
		assert.equal(more.length, 0, 'one run reached the server');
		assert.equal(run.answeredWith, RUN_RECORDING);
		const { language, version, files, stdin, args, compile_timeout: compileTimeout, run_timeout: runTimeout } = payload;
		assert.deepEqual(run.run, { language, version, files: [{ content: files[0].content, name: files[0].name }], stdin, args, compile_timeout: compileTimeout, run_timeout: runTimeout }, 'the cleaned request: the -1 memory limits left out');
		assertPageNeverSaw(seen, piston.secret);
		assert.equal(errors.mock.callCount(), 0, 'a good run logs nothing');
	});
});

test('a compile error: the page reads the line of the error from the answer', TIMED, async (t) => {
	await runnerFor(t, async ({ piston, execute }) => {
		const payload = payloadOf(piston, COMPILE_RECORDING);
		const answer = await executeCode(payload, { fetchImpl: execute });
		const summary = summarizeResult(answer);
		assert.equal(summary.status, RESULT_COMPILE_ERROR);
		assert.equal(describeResult(summary), 'Compile error (exit code 1)');
		const [file] = payload.files;
		const locations = errorLocations(answer, { language: payload.language, fileName: file.name, code: file.content });
		assert.equal(locations.length, 1);
		assert.equal(locations[0].line, COMPILE_ERROR_LINE);
		assert.equal(locations[0].message, COMPILE_ERROR_WORDS);
		assert.equal(locations[0].stage, 'compile');
	});
});

test("the languages: the runtimes function passes the server's list to the page", TIMED, async (t) => {
	await runnerFor(t, async ({ piston, runtimes, seen }) => {
		const { runtimes: list, error } = await fetchRuntimes({ fetchImpl: runtimes });
		assert.equal(error, null);
		const expected = RECORDED_RUNTIMES.map(({ language, version, aliases, runtime }) => ({ language, version, aliases, runtime: runtime ?? null }));
		assert.deepEqual(list, expected);
		assert.deepEqual(piston.requests.map(({ method, path: route, proxyOk }) => ({ method, route, proxyOk })), [{ method: 'GET', route: RUNTIMES_PATH, proxyOk: true }]);
		assertPageNeverSaw(seen, piston.secret);
	});
});

test("the functions reach the server without the global fetch, which Netlify's runtime wraps to name the host it reached in the function's answer", TIMED, async (t) => {
	await runnerFor(t, async ({ piston, execute, runtimes, globalFetches }) => {
		await executeCode(payloadOf(piston, RUN_RECORDING), { fetchImpl: execute });
		const { error } = await fetchRuntimes({ fetchImpl: runtimes });
		assert.equal(error, null);
		const asked = piston.requests.map(({ path: route, proxyOk }) => [route, proxyOk]);
		assert.deepEqual(asked, [[EXECUTE_PATH, true], [RUNTIMES_PATH, true]], 'the fake got both requests, with the secret');
		assert.deepEqual(globalFetches, [], 'the global fetch was never called');
	});
});

test("a refusal: the server's proxy refuses the function's secret, and the reader is told runs are not accepted", TIMED, async (t) => {
	const wrongSecret = generateSecret();
	await runnerFor(t, async ({ piston, execute, runtimes, seen, warnings }) => {
		const error = await rejection(executeCode(payloadOf(piston, RUN_RECORDING), { fetchImpl: execute }));
		assert.equal(error.status, 403);
		assert.equal(error.kind, 'refused');
		assert.equal(error.message, MESSAGE_REFUSED);
		const list = await fetchRuntimes({ fetchImpl: runtimes });
		assert.equal(list.error.status, 403);
		assert.equal(list.error.kind, 'refused');
		assert.deepEqual(list.runtimes, []);
		assert.equal(piston.runs().length, 0, 'nothing was run');
		assert.deepEqual(piston.requests.map((entry) => [entry.path, entry.proxyOk]), [[EXECUTE_PATH, false], [RUNTIMES_PATH, false]]);
		assert.match(mockText(warnings), new RegExp(PROXY_VARIABLE), 'the console note names the variable to check');
		for (const secret of [wrongSecret, piston.secret]) {
			assertPageNeverSaw(seen, secret);
			assert.ok(!mockText(warnings).includes(secret), 'no secret in the console note');
		}
	}, { secretFor: () => wrongSecret });
});

test('the server down: nothing listens at its address, and the reader is told it could not be reached', TIMED, async (t) => {
	await runnerFor(t, async ({ piston, execute, runtimes, seen, errors }) => {
		const error = await rejection(executeCode(payloadOf(piston, RUN_RECORDING), { fetchImpl: execute }));
		assert.equal(error.status, 502);
		assert.equal(error.kind, 'upstream');
		assert.equal(error.message, UNREACHABLE_WORDS);
		const list = await fetchRuntimes({ fetchImpl: runtimes });
		assert.equal(list.error.status, 502);
		assert.equal(list.error.message, UNREACHABLE_WORDS);
		assert.equal(piston.requests.length, 0);
		assert.match(mockText(errors), /Could not reach the Piston server \(\/api\/v2\/execute\).*ECONNREFUSED/);
		assertPageNeverSaw(seen, piston.secret);
	}, { down: true });
});

test('too large: a run over the function\'s limit is a 413, and nothing reaches the server', TIMED, async (t) => {
	await runnerFor(t, async ({ piston, execute }) => {
		const payload = buildExecuteRequest({ language: 'python', version: '3.12.0', code: 'x'.repeat(MAX_BODY_BYTES) });
		const error = await rejection(executeCode(payload, { fetchImpl: execute }));
		assert.equal(error.status, 413);
		assert.equal(error.kind, 'too-large');
		assert.equal(error.message, MESSAGE_TOO_LARGE);
		assert.equal(piston.requests.length, 0);
	});
});

test("too large on the server's side: Piston's own refusal reaches the reader as the same 413", TIMED, async (t) => {
	await runnerFor(t, async ({ piston, execute }) => {
		const payload = buildExecuteRequest({ language: 'python', version: '3.12.0', code: 'x'.repeat(2 * SMALL_BODY_LIMIT_BYTES) });
		const error = await rejection(executeCode(payload, { fetchImpl: execute }));
		assert.equal(error.status, 413);
		assert.equal(error.message, MESSAGE_TOO_LARGE);
		const [entry, ...more] = piston.requests;
		assert.equal(more.length, 0);
		assert.equal(entry.proxyOk, true, 'it was forwarded with the secret');
		assert.ok(entry.bytes > SMALL_BODY_LIMIT_BYTES, 'and refused by the server for its size');
		assert.equal(piston.unmatched().length, 0);
	}, { fake: { bodyLimitBytes: SMALL_BODY_LIMIT_BYTES } });
});
