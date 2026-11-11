/**
 * fakePistonServer.mjs — a stand-in for a Piston server and the proxy in front of it, on a real
 * HTTP socket on the loopback address, for the tests and for a local check under `netlify dev`.
 * Not a test itself (`node --test` runs only the *.test.mjs files). It never reaches a real server:
 * every answer is a recording the editor's tests already hold, so nothing is made up.
 *
 *   GET  /api/v2/runtimes   RECORDED_RUNTIMES: the runtimes the recordings were made on
 *   POST /api/v2/execute    replays the recording of the same language and the same file contents:
 *                           the same version when there is one, else the newest
 *   any other path/method   404
 *   no or a wrong x-piston-proxy-secret header: 403, before anything else is read, as the proxy does
 *
 * A run with no recording gets a 400 that says so and is listed by unmatched(), so a test can fail
 * on it. A body over BODY_LIMIT_BYTES gets the 400 Piston's JSON parser sends ({ stack:
 * "PayloadTooLargeError: …" }, no message). The secret is generated for each start and never kept
 * in `requests`.
 *
 * As a module:
 *     const piston = await startFakePiston();                // port 0: any free port
 *     piston.url, piston.secret, piston.requests, piston.runs(), piston.unmatched()
 *     piston.queue('errors/python-3.12-index-error');        // the next run gets this recording
 *     piston.queue({ status: 400, body: { message: 'x' } }); // or this answer
 *     piston.queue({ hang: true });                          // or no answer yet (a reader's Stop)
 *     piston.releaseHeld('errors/python-3.12-index-error');  // a held run gets its late answer
 *     await piston.close();                                  // always, in a finally
 *
 * From a shell, for `netlify dev --offline`: it prints the two variables for that shell only, and
 * stops on Ctrl-C or a signal. The secret is good for this run only.
 *     node shared/functions/code-runner/__tests__/fakePistonServer.mjs --port <p> [--fixtures <folder>]
 *
 * HOW TO CHANGE IT
 *   The list of runtimes: RECORDED_RUNTIMES (fakePistonServer.test.mjs checks that it names every
 *   recording's language and version). Where the recordings are: FIXTURES_DIR, or `fixturesDir`. The
 *   proxy's header and Piston's two paths are written out here on purpose, not imported from the
 *   functions, so a function that sends the wrong header or path is refused, as the real server
 *   would refuse it. The answers to a bad request: REFUSALS. Tests: fakePistonServer.test.mjs (this
 *   file) and overSocket.test.mjs (the functions through it).
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** The header the server's proxy checks, and so the one a function must send its secret in. */
export const PROXY_HEADER = 'x-piston-proxy-secret';

/** Piston's two paths. */
export const RUNTIMES_PATH = '/api/v2/runtimes';
export const EXECUTE_PATH = '/api/v2/execute';

/** The only address it listens on. */
export const LOOPBACK = '127.0.0.1';

/** The editor's recorded answers of a real Piston server ({ request, status, response } each). */
export const FIXTURES_DIR = fileURLToPath(new URL('../../../components/CodeEditor/lib/codeRunner/__tests__/fixtures', import.meta.url));

/** Random bytes in a generated secret (twice as many hex characters). */
const SECRET_BYTES = 24;

/** Piston's JSON parser refuses a body past this many bytes, with a 400 that has no message. */
export const BODY_LIMIT_BYTES = 102400;

/** What a recording's file name ends with. */
const FIXTURE_EXTENSION = '.json';

/** The last line the command prints once it is listening, which a script can wait for. */
export const READY_LINE = 'the secret is good for this run only';

/** The exit code of a command line it cannot use. */
const USAGE_EXIT = 2;

const USAGE = 'Usage: node fakePistonServer.mjs --port <number> [--fixtures <folder>]';

/**
 * The runtimes the recordings were made on, as Piston lists them, with its aliases. Newest versions
 * last. Every recording's language and version is here (a test holds it).
 */
export const RECORDED_RUNTIMES = Object.freeze([
	{ language: 'bash', version: '5.2.0', aliases: ['sh'] },
	{ language: 'c', version: '10.2.0', aliases: ['gcc'], runtime: 'gcc' },
	{ language: 'c++', version: '10.2.0', aliases: ['cpp', 'g++'], runtime: 'gcc' },
	{ language: 'go', version: '1.16.2', aliases: ['go', 'golang'] },
	{ language: 'javascript', version: '16.3.0', aliases: ['node-javascript', 'node-js', 'javascript', 'js'], runtime: 'node' },
	{ language: 'javascript', version: '18.15.0', aliases: ['node-javascript', 'node-js', 'javascript', 'js'], runtime: 'node' },
	{ language: 'javascript', version: '20.11.1', aliases: ['node-javascript', 'node-js', 'javascript', 'js'], runtime: 'node' },
	{ language: 'python', version: '3.9.4', aliases: ['py', 'py3', 'python3'] },
	{ language: 'python', version: '3.10.0', aliases: ['py', 'py3', 'python3', 'python3.10'] },
	{ language: 'python', version: '3.11.0', aliases: ['py', 'py3', 'python3', 'python3.11'] },
	{ language: 'python', version: '3.12.0', aliases: ['py', 'py3', 'python3', 'python3.12'] },
	{ language: 'typescript', version: '5.0.3', aliases: ['ts', 'node-ts', 'tsc'], runtime: 'node' },
]);

/** The answers to a request it will not run. */
const REFUSALS = Object.freeze({
	proxy: { status: 403, body: { message: 'fake Piston: no valid proxy header on this request' } },
	notFound: { status: 404, body: { message: 'fake Piston: only the runtimes list and execute are served' } },
	tooLarge: { status: 400, body: { stack: 'PayloadTooLargeError: request entity too large' } },
	notJson: { status: 400, body: { message: 'fake Piston: the body is not JSON' } },
});

/** The 400 for a run that has no recording. */
function noRecording(run) {
	return { status: 400, body: { message: `fake Piston has no recording of this ${run.language} ${run.version} request` } };
}

/** A new secret, for one start. */
export function generateSecret() {
	return randomBytes(SECRET_BYTES).toString('hex');
}

/** What identifies a request among the recordings: its language and every file's text, in order. */
function requestKey(request) {
	const contents = (request.files ?? []).map((file) => file.content ?? '');
	return JSON.stringify([request.language, contents]);
}

/** Compares '3.9.4' and '3.12.0' as numbers: below 0 when `first` is older. */
function compareVersions(first, second) {
	const parts = (version) => String(version).split('.').map(Number);
	const [a, b] = [parts(first), parts(second)];
	for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

/** Every file below `folder`, as paths relative to it with "/" between parts, sorted. */
function filesBelow(folder) {
	const names = fs.readdirSync(folder, { recursive: true }).map(String);
	const files = names.filter((name) => fs.statSync(path.join(folder, name)).isFile());
	return files.map((file) => file.split(path.sep).join('/')).sort();
}

/** The recordings below `fixturesDir`, by name ("errors/c-compile-error"). A .json without a request and an answer is left out. */
export function readRecordings(fixturesDir = FIXTURES_DIR) {
	const recordings = new Map();
	for (const file of filesBelow(fixturesDir)) {
		if (!file.endsWith(FIXTURE_EXTENSION)) continue;
		const fixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
		if (!fixture.request || fixture.response === undefined) continue;
		const name = file.slice(0, -FIXTURE_EXTENSION.length);
		recordings.set(name, { name, request: fixture.request, status: fixture.status ?? 200, body: fixture.response });
	}
	return recordings;
}

/** Language and contents -> the recordings of every version, newest first. */
function indexRecordings(recordings) {
	const index = new Map();
	for (const recording of recordings.values()) {
		const key = requestKey(recording.request);
		if (!index.has(key)) index.set(key, []);
		index.get(key).push(recording);
	}
	for (const sameCode of index.values()) {
		sameCode.sort((a, b) => compareVersions(b.request.version, a.request.version));
	}
	return index;
}

/** The recording for a run: the same version when there is one, else the newest; null when none. */
function findRecording(index, run) {
	const sameCode = index.get(requestKey(run));
	if (!sameCode) return null;
	return sameCode.find((recording) => recording.request.version === run.version) ?? sameCode[0];
}

function sendJson(response, status, body) {
	const text = JSON.stringify(body);
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
	response.end(text);
}

/** The whole body, keeping at most `limit` bytes of it: { text, bytes } with the real byte count. */
function readBody(request, limit) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let bytes = 0;
		request.on('data', (chunk) => {
			bytes += chunk.length;
			if (bytes <= limit) chunks.push(chunk);
		});
		request.on('end', () => resolve({ text: Buffer.concat(chunks).toString('utf8'), bytes }));
		request.on('error', reject);
	});
}

/** The body as JSON, or null. */
function parseRun(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

class FakePiston {
	constructor({ secret, runtimes, recordings, bodyLimitBytes }) {
		this.secret = secret;
		this.runtimes = runtimes;
		this.recordings = recordings;
		this.bodyLimitBytes = bodyLimitBytes;
		this.index = indexRecordings(recordings);
		/** One entry per request, in order: { method, path, proxyOk, answeredWith, … }. Never the secret. */
		this.requests = [];
		this.queued = [];
		/** Responses a { hang: true } answer holds open. */
		this.held = [];
		this.server = null;
		this.url = null;
		this.port = null;
	}

	recordingNames() {
		return [...this.recordings.keys()].sort();
	}

	recording(name) {
		const recording = this.recordings.get(name);
		if (!recording) throw new Error(`no recording named ${name}`);
		return recording;
	}

	/** The next run gets this: a recording's name, { status, body }, or { hang: true }. */
	queue(answer) {
		if (typeof answer === 'string') this.recording(answer);
		this.queued.push(answer);
	}

	/** Answers every held run now, with a recording's name or { status, body }. */
	releaseHeld(answer) {
		const { status, body } = typeof answer === 'string' ? this.recording(answer) : answer;
		for (const response of this.held.splice(0)) {
			if (!response.destroyed) sendJson(response, status, body);
		}
	}

	/** Runs that passed the proxy and still had no answer to replay. */
	unmatched() {
		return this.runs().filter((entry) => entry.answeredWith === null);
	}

	/** Run requests that passed the proxy. */
	runs() {
		return this.requests.filter((entry) => entry.path === EXECUTE_PATH && entry.proxyOk);
	}

	answerFor(run) {
		const queued = this.queued.shift();
		if (queued === undefined) return findRecording(this.index, run);
		return typeof queued === 'string' ? this.recording(queued) : queued;
	}

	async onRun(request, response, entry) {
		const { text, bytes } = await readBody(request, this.bodyLimitBytes);
		entry.bytes = bytes;
		if (bytes > this.bodyLimitBytes) return sendJson(response, REFUSALS.tooLarge.status, REFUSALS.tooLarge.body);
		const run = parseRun(text);
		if (run === null) return sendJson(response, REFUSALS.notJson.status, REFUSALS.notJson.body);
		Object.assign(entry, { run, answeredWith: null });
		const answer = this.answerFor(run);
		if (answer === null) {
			const { status, body } = noRecording(run);
			return sendJson(response, status, body);
		}
		entry.answeredWith = answer.name ?? (answer.hang ? 'hang' : 'queued');
		if (answer.hang) {
			this.held.push(response);
			return undefined;
		}
		return sendJson(response, answer.status, answer.body);
	}

	async route(request, response) {
		const { pathname } = new URL(request.url, `http://${LOOPBACK}`);
		const proxyOk = request.headers[PROXY_HEADER] === this.secret;
		const entry = { method: request.method, path: pathname, proxyOk, answeredWith: undefined };
		this.requests.push(entry);
		if (proxyOk && request.method === 'POST' && pathname === EXECUTE_PATH) return this.onRun(request, response, entry);
		// A body left unread resets the connection under a client that is still sending it.
		request.resume();
		if (!proxyOk) return sendJson(response, REFUSALS.proxy.status, REFUSALS.proxy.body);
		if (request.method === 'GET' && pathname === RUNTIMES_PATH) return sendJson(response, 200, this.runtimes);
		return sendJson(response, REFUSALS.notFound.status, REFUSALS.notFound.body);
	}

	listen(port) {
		this.server = http.createServer((request, response) => {
			this.route(request, response).catch((error) => {
				if (!response.headersSent) sendJson(response, 500, { message: String(error.message) });
			});
		});
		return new Promise((resolve, reject) => {
			this.server.on('error', reject);
			this.server.listen(port, LOOPBACK, () => {
				this.port = this.server.address().port;
				this.url = `http://${LOOPBACK}:${this.port}`;
				resolve(this);
			});
		});
	}

	/** Ends every open socket, a held one too, and frees the port. */
	close() {
		return new Promise((resolve) => {
			if (!this.server?.listening) {
				resolve();
				return;
			}
			this.server.close(() => resolve());
			this.server.closeAllConnections();
		});
	}
}

/**
 * Starts the fake. `port` 0 (the default) takes any free port. A folder with no recordings is refused.
 * @returns {Promise<FakePiston>}
 */
export async function startFakePiston({
	port = 0, fixturesDir = FIXTURES_DIR, secret = generateSecret(), runtimes = RECORDED_RUNTIMES, bodyLimitBytes = BODY_LIMIT_BYTES,
} = {}) {
	if (!Number.isInteger(port) || port < 0) throw new Error(`fake Piston needs a port number, not ${port}`);
	const recordings = readRecordings(fixturesDir);
	if (recordings.size === 0) throw new Error(`no recordings in ${fixturesDir}`);
	return new FakePiston({ secret, runtimes, recordings, bodyLimitBytes }).listen(port);
}

/** The command line's options, or null when it cannot be used. */
function readOptions(argv) {
	try {
		const { values } = parseArgs({ args: argv, options: { port: { type: 'string' }, fixtures: { type: 'string' } } });
		const port = Number(values.port);
		if (values.port === undefined || !Number.isInteger(port)) return null;
		return { port, fixturesDir: values.fixtures ?? FIXTURES_DIR };
	} catch {
		return null;
	}
}

/** `node fakePistonServer.mjs --port <p>`: serves until it is sent a signal. */
async function main() {
	const options = readOptions(process.argv.slice(2));
	if (options === null) {
		console.error(USAGE);
		process.exit(USAGE_EXIT);
	}
	const piston = await startFakePiston(options);
	console.log(`PISTON_BASE_URL=${piston.url}`);
	console.log(`PISTON_PROXY_SECRET=${piston.secret}`);
	console.log(`${piston.recordings.size} recordings; ${READY_LINE}`);
	const stop = () => piston.close().then(() => process.exit(0));
	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
