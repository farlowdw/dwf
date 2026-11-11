/**
 * fakePistonServer.test.mjs — the fake Piston server itself (fakePistonServer.mjs), over a real
 * socket on the loopback address, with the editor's real recordings: what it serves, what it
 * refuses, and its command line. overSocket.test.mjs drives the two functions through it, so a
 * wrong answer here would make those tests prove nothing. Every test closes what it starts, in a
 * `finally`, on failure too.
 * Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new answer of the fake gets a test here. KNOWN and OLDER are recordings the tests replay: a
 *   renamed fixture changes them. COMMAND_WAIT_MS bounds how long the command line may take to start, TEST_TIMEOUT_MS any test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROXY_HEADER as FUNCTIONS_HEADER } from '../lib/piston.mjs';
import { EXECUTE_PATH as FUNCTION_EXECUTE_PATH } from '../execute.mjs';
import { RUNTIMES_PATH as FUNCTION_RUNTIMES_PATH } from '../runtimes.mjs';
import {
	BODY_LIMIT_BYTES,
	EXECUTE_PATH,
	FIXTURES_DIR,
	LOOPBACK,
	PROXY_HEADER,
	READY_LINE,
	RECORDED_RUNTIMES,
	RUNTIMES_PATH,
	generateSecret,
	readRecordings,
	startFakePiston,
} from './fakePistonServer.mjs';

/** A recording the tests replay, and an older version of another program. */
const KNOWN = 'errors/python-3.12-output-then-error';
const OLDER = 'errors/python-3.9-syntax-error';

/** The command line. */
const SERVER_FILE = fileURLToPath(new URL('./fakePistonServer.mjs', import.meta.url));

/** The longest the command line may take to say it is listening. */
const COMMAND_WAIT_MS = 15000;

/** How long a held run is watched before it counts as waiting. */
const HELD_WAIT_MS = 200;

/** Every test's time limit, so a socket left open fails its test instead of holding the run for good. */
const TEST_TIMEOUT_MS = 60000;
const TIMED = Object.freeze({ timeout: TEST_TIMEOUT_MS });

/** Runs `body` with a fresh fake and closes it afterwards, whatever happens. */
async function withFake(body, options = {}) {
	const piston = await startFakePiston(options);
	try {
		await body(piston);
	} finally {
		await piston.close();
	}
}

/** One request on a connection of its own: { status, text, json() }. */
function call(url, method, route, { headers = {}, body } = {}) {
	return new Promise((resolve, reject) => {
		const request = http.request(`${url}${route}`, { method, headers, agent: false }, (response) => {
			const chunks = [];
			response.on('data', (chunk) => chunks.push(chunk));
			response.on('end', () => {
				const text = Buffer.concat(chunks).toString('utf8');
				resolve({ status: response.statusCode, text, json: () => JSON.parse(text) });
			});
		});
		request.on('error', reject);
		request.end(body);
	});
}

/** A run, sent with the fake's secret unless `secret` says otherwise (null: no header at all). */
function post(piston, payload, secret = piston.secret) {
	const headers = { 'content-type': 'application/json', ...(secret === null ? {} : { [PROXY_HEADER]: secret }) };
	return call(piston.url, 'POST', EXECUTE_PATH, { headers, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
}

/** True while something listens on the port. */
function canConnect(port) {
	return new Promise((resolve) => {
		const socket = net.connect(port, LOOPBACK);
		socket.on('connect', () => {
			socket.destroy();
			resolve(true);
		});
		socket.on('error', () => resolve(false));
	});
}

/** The .json fixtures that hold a request and an answer, by name, read without the fake's reader. */
function fixtureNamesOnDisk() {
	const entries = fs.readdirSync(FIXTURES_DIR, { recursive: true }).map((file) => file.split(path.sep).join('/'));
	const recordings = entries.filter((file) => file.endsWith('.json')).filter((file) => {
		const fixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
		return fixture.request !== undefined && fixture.response !== undefined;
	});
	return recordings.map((file) => file.slice(0, -'.json'.length)).sort();
}

test('it reads every recording of the fixtures, and nothing that is not one', TIMED, () => {
	const recordings = readRecordings();
	assert.deepEqual([...recordings.keys()].sort(), fixtureNamesOnDisk());
	assert.ok(recordings.size > 0);
	assert.ok(fs.readdirSync(FIXTURES_DIR, { recursive: true }).some((file) => !file.endsWith('.json') && file.includes('.')), 'a non-recording file sits among them');
});

test('its runtime list names every recording\'s language and version', TIMED, () => {
	const listed = new Set(RECORDED_RUNTIMES.map(({ language, version }) => `${language} ${version}`));
	for (const recording of readRecordings().values()) {
		const { language, version } = recording.request;
		assert.ok(listed.has(`${language} ${version}`), `${recording.name}: ${language} ${version}`);
	}
});

test('it checks the header the functions send, at the paths the functions call', TIMED, () => {
	assert.equal(PROXY_HEADER, FUNCTIONS_HEADER);
	assert.equal(EXECUTE_PATH, FUNCTION_EXECUTE_PATH);
	assert.equal(RUNTIMES_PATH, FUNCTION_RUNTIMES_PATH);
});

test('it listens on the loopback address only, and close frees the port', TIMED, async () => {
	const piston = await startFakePiston();
	try {
		assert.equal(new URL(piston.url).hostname, LOOPBACK);
		assert.equal(piston.server.address().address, LOOPBACK);
		assert.equal(await canConnect(piston.port), true);
	} finally {
		await piston.close();
	}
	assert.equal(await canConnect(piston.port), false);
});

test('a generated secret is long and new each time, a start gets its own, and none is kept with a request', TIMED, async () => {
	assert.equal(generateSecret().length, 48);
	assert.notEqual(generateSecret(), generateSecret());
	await withFake(async (first) => {
		await withFake(async (second) => {
			assert.notEqual(first.secret, second.secret);
		});
		await post(first, first.recording(KNOWN).request);
		assert.ok(!JSON.stringify(first.requests).includes(first.secret));
	});
});

test('GET runtimes answers the list, with the secret', TIMED, async () => {
	await withFake(async (piston) => {
		const response = await call(piston.url, 'GET', RUNTIMES_PATH, { headers: { [PROXY_HEADER]: piston.secret } });
		assert.equal(response.status, 200);
		assert.deepEqual(response.json(), RECORDED_RUNTIMES);
	});
});

for (const [label, secret] of [['no', null], ['a wrong', 'not-the-secret']]) {
	test(`${label} secret is a 403 on both paths, and nothing is replayed`, TIMED, async () => {
		await withFake(async (piston) => {
			assert.equal((await post(piston, piston.recording(KNOWN).request, secret)).status, 403);
			const headers = secret === null ? {} : { [PROXY_HEADER]: secret };
			assert.equal((await call(piston.url, 'GET', RUNTIMES_PATH, { headers })).status, 403);
			assert.equal(piston.runs().length, 0);
			assert.equal(piston.requests.filter((entry) => !entry.proxyOk).length, 2);
		});
	});
}

test('a recorded program gets its recorded answer, byte for byte', TIMED, async () => {
	await withFake(async (piston) => {
		const recording = piston.recording(KNOWN);
		const response = await post(piston, { ...recording.request, stdin: 'typed', run_timeout: 3000 });
		assert.equal(response.status, recording.status);
		assert.equal(response.text, JSON.stringify(recording.body));
		const [entry] = piston.runs();
		assert.equal(entry.answeredWith, KNOWN);
		assert.equal(entry.run.stdin, 'typed');
		assert.equal(entry.run.language, 'python');
	});
});

test('the same code gets the version asked for, else the newest recorded', TIMED, async () => {
	await withFake(async (piston) => {
		const older = piston.recording(OLDER);
		const sameCode = piston.recordingNames().filter((name) => piston.recording(name).request.files[0].content === older.request.files[0].content);
		assert.ok(sameCode.length >= 2, 'the fixtures hold one program at two versions');
		await post(piston, older.request);
		assert.equal(piston.runs().at(-1).answeredWith, OLDER);
		await post(piston, { ...older.request, version: '*' });
		const newest = piston.runs().at(-1).answeredWith;
		assert.equal(piston.recording(newest).request.version, '3.12.0');
	});
});

test('a program with no recording is a 400 that says so, and is listed', TIMED, async () => {
	await withFake(async (piston) => {
		const response = await post(piston, { language: 'python', version: '3.12.0', files: [{ content: 'print(1)' }] });
		assert.equal(response.status, 400);
		assert.match(response.json().message, /no recording/);
		assert.equal(piston.unmatched().length, 1);
	});
});

test("a body that is not JSON is a 400, and one past Piston's limit is Piston's 400 with no message", TIMED, async () => {
	await withFake(async (piston) => {
		assert.equal((await post(piston, 'not json')).status, 400);
		const tooLarge = await post(piston, { language: 'python', files: [{ content: 'x'.repeat(BODY_LIMIT_BYTES) }] });
		assert.equal(tooLarge.status, 400);
		assert.deepEqual(Object.keys(tooLarge.json()), ['stack']);
		assert.match(tooLarge.json().stack, /^PayloadTooLargeError/);
		assert.equal(piston.unmatched().length, 0, 'refused before it was read as a run');
	});
});

test('a smaller body limit can be set, so a test can reach that refusal under the functions\' own limit', TIMED, async () => {
	await withFake(async (piston) => {
		const response = await post(piston, { language: 'python', version: '3.12.0', files: [{ content: 'x'.repeat(200) }] });
		assert.equal(response.status, 400);
		assert.match(response.json().stack, /^PayloadTooLargeError/);
	}, { bodyLimitBytes: 100 });
});

test('any other path or method is a 404', TIMED, async () => {
	await withFake(async (piston) => {
		const headers = { [PROXY_HEADER]: piston.secret };
		assert.equal((await call(piston.url, 'GET', '/api/v2/packages', { headers })).status, 404);
		assert.equal((await call(piston.url, 'GET', EXECUTE_PATH, { headers })).status, 404);
		assert.equal((await call(piston.url, 'POST', RUNTIMES_PATH, { headers })).status, 404);
	});
});

test('a queued answer beats the recordings, once each, in order', TIMED, async () => {
	await withFake(async (piston) => {
		piston.queue(OLDER);
		piston.queue({ status: 400, body: { message: 'queued words' } });
		const { request } = piston.recording(KNOWN);
		assert.deepEqual((await post(piston, request)).json(), piston.recording(OLDER).body);
		assert.deepEqual((await post(piston, request)).json(), { message: 'queued words' });
		await post(piston, request);
		assert.equal(piston.runs().at(-1).answeredWith, KNOWN);
		assert.throws(() => piston.queue('no/such-recording'), /no recording named/);
	});
});

test('a held run waits, and gets its answer when released', TIMED, async () => {
	await withFake(async (piston) => {
		piston.queue({ hang: true });
		const pending = post(piston, piston.recording(KNOWN).request);
		const settled = await Promise.race([pending, new Promise((resolve) => setTimeout(() => resolve('waiting'), HELD_WAIT_MS))]);
		assert.equal(settled, 'waiting');
		piston.releaseHeld(KNOWN);
		assert.equal((await pending).status, 200);
	});
});

test('close ends a held run instead of waiting for it', TIMED, async () => {
	const piston = await startFakePiston();
	piston.queue({ hang: true });
	const pending = post(piston, piston.recording(KNOWN).request).then(() => 'answered', () => 'dropped');
	try {
		await new Promise((resolve) => setTimeout(resolve, HELD_WAIT_MS));
	} finally {
		await piston.close();
	}
	assert.equal(await pending, 'dropped');
});

test('a folder with no recordings is refused', TIMED, async () => {
	const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-piston-'));
	try {
		await assert.rejects(startFakePiston({ fixturesDir: empty }), /no recordings/);
	} finally {
		fs.rmSync(empty, { recursive: true, force: true });
	}
});

/**
 * Starts the command line on any free port. `printed` resolves with its output once it is listening,
 * and rejects when it exits first or says nothing in COMMAND_WAIT_MS; `exited` gives { code, signal }.
 */
function startCommand(args = ['--port', '0']) {
	const child = spawn(process.execPath, [SERVER_FILE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
	const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
	const printed = new Promise((resolve, reject) => {
		let text = '';
		const timer = setTimeout(() => reject(new Error(`no "${READY_LINE}" within ${COMMAND_WAIT_MS} ms: ${text}`)), COMMAND_WAIT_MS);
		child.stdout.on('data', (chunk) => {
			text += chunk;
			if (text.includes(READY_LINE)) {
				clearTimeout(timer);
				resolve(text);
			}
		});
		child.on('exit', () => {
			clearTimeout(timer);
			reject(new Error(`it exited before "${READY_LINE}": ${text}`));
		});
	});
	// A test that only waits for the exit never reads `printed`: its rejection is no failure then.
	printed.catch(() => {});
	return { child, exited, printed };
}

/** The value of a NAME=value line. */
function lineValue(text, name) {
	const line = text.split('\n').find((candidate) => candidate.startsWith(`${name}=`));
	assert.ok(line, `it printed ${name}`);
	return line.slice(name.length + 1);
}

test('from a shell it prints the two variables, serves on them, and a signal ends it', TIMED, async () => {
	const { child, exited, printed } = startCommand();
	let port = null;
	try {
		const text = await printed;
		const url = lineValue(text, 'PISTON_BASE_URL');
		const secret = lineValue(text, 'PISTON_PROXY_SECRET');
		port = Number(new URL(url).port);
		assert.equal(new URL(url).hostname, LOOPBACK);
		assert.equal((await call(url, 'GET', RUNTIMES_PATH, { headers: { [PROXY_HEADER]: secret } })).status, 200);
		assert.equal((await call(url, 'GET', RUNTIMES_PATH)).status, 403);
	} finally {
		child.kill('SIGTERM');
	}
	assert.deepEqual(await exited, { code: 0, signal: null });
	assert.equal(await canConnect(port), false);
});

test('from a shell, no port or a port that is no number is refused with exit 2', TIMED, async () => {
	for (const args of [[], ['--port', 'any'], ['--port']]) {
		const { child, exited } = startCommand(args);
		try {
			assert.deepEqual(await exited, { code: 2, signal: null }, JSON.stringify(args));
		} finally {
			child.kill('SIGTERM');
		}
	}
});
