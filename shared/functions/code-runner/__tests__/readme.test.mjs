/**
 * readme.test.mjs — README.md in this folder says what the code does. A person sets a public site
 * up from it, so a stale number or a dead pointer costs a wrong setting.
 *   - Every variable the functions read has a row in its Environment variables table.
 *   - The numbers, names and markers it states are the constants in the code.
 *   - Every pointer at it from the code names a heading that is there.
 *   - Its way to turn Run off says that earlier deploys keep Run, and how to stop it everywhere.
 *   - Nothing in the code still points at a site's own Netlify notes: those stay with that site.
 * Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new number in the README: a row in STATED. A new variable: VARIABLES. A folder whose comments
 *   point at the README: POINTER_FOLDERS. A renamed heading: change the pointers with it, which is
 *   what the third test is for.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SHARED_ROOT, sharedFiles } from '../../../__tests__/sharedTree.mjs';
import {
	MAX_BODY_BYTES,
	MAX_COMPILE_TIMEOUT_MS,
	MAX_FORWARD_BYTES,
	MAX_RUN_TIMEOUT_MS,
	MIN_MEMORY_LIMIT_BYTES,
} from '../execute.mjs';
import { ALLOWED_ORIGINS_VARIABLE, LOOPBACK_HOSTS, ORIGIN_REFUSED_MARKER } from '../lib/origin.mjs';
import {
	BASE_URL_VARIABLE,
	PROXY_HEADER,
	PROXY_VARIABLE,
	SECRET_PLACEHOLDER,
	UPSTREAM_TIMEOUT_MS,
} from '../lib/piston.mjs';
import {
	CLIENT_IP_HEADERS,
	DEFAULT_EXECUTE_LIMIT,
	MAX_TRACKED_CLIENTS,
	OFF,
	RATE_LIMITED_MARKER,
	RATE_LIMIT_VARIABLE,
	RUNTIMES_LIMIT,
} from '../lib/rateLimit.mjs';
import * as piston from '../lib/piston.mjs';
import { CACHE_SECONDS } from '../runtimes.mjs';
import { EXPECTED_FUNCTIONS } from './functionFolder.mjs';

const README_FILE = 'functions/code-runner/README.md';
const VARIABLES_HEADING = 'Environment variables';

/** The folders of shared/ whose files may point at the README. */
const POINTER_FOLDERS = Object.freeze(['functions/code-runner/', 'plugins/monaco-editor/', 'components/CodeEditor/']);

/** A site's own Netlify notes, put together here so that this file does not hold the path. */
const SITE_NOTES = ['netlify', 'README.md'].join('/');

/** What introduces a pointer at a heading of the README. */
const POINTER = /code-runner\/README\.md`? (?:>|→) /g;

/** What continues a comment on its next line, so a pointer split over two lines reads as one. */
const COMMENT_LINE_BREAK = /\n[\t ]*(?:\*|\/\/)?[\t ]*/g;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const BYTES_PER_MIB = 1048576;

/** The variables the functions read. */
const VARIABLES = Object.freeze([BASE_URL_VARIABLE, PROXY_VARIABLE, RATE_LIMIT_VARIABLE, ALLOWED_ORIGINS_VARIABLE]);

/** A limit as the README writes it: `20/60`. */
function limitText({ limit, windowSeconds }) {
	return `\`${limit}/${windowSeconds}\``;
}

/** Milliseconds as the README writes them: 25 s. */
function secondsText(milliseconds) {
	return `${milliseconds / MS_PER_SECOND} s`;
}

/** What the README must state, each row built from the constant it depends on. */
const STATED = Object.freeze([
	['the default runs limit', limitText(DEFAULT_EXECUTE_LIMIT)],
	['the default in words', `${DEFAULT_EXECUTE_LIMIT.limit} runs in ${DEFAULT_EXECUTE_LIMIT.windowSeconds} s`],
	['the runtime list limit', limitText(RUNTIMES_LIMIT)],
	['the word that switches the limits off', `\`${OFF}\``],
	['the clients remembered', `${MAX_TRACKED_CLIENTS.toLocaleString('en-US')} clients`],
	['the body limit', `${MAX_BODY_BYTES.toLocaleString('en-US')} bytes`],
	['the forwarded limit', `${MAX_FORWARD_BYTES.toLocaleString('en-US')} bytes`],
	['the compile limit', `${secondsText(MAX_COMPILE_TIMEOUT_MS)} to compile`],
	['the run limit', `${secondsText(MAX_RUN_TIMEOUT_MS)} to run`],
	['the wait for the server', secondsText(UPSTREAM_TIMEOUT_MS)],
	['the memory floor', `${MIN_MEMORY_LIMIT_BYTES / BYTES_PER_MIB} MiB`],
	['the list cache', `max-age=${CACHE_SECONDS}`],
	['the list cache in words', `${CACHE_SECONDS / SECONDS_PER_MINUTE} minutes`],
	['the secret header', PROXY_HEADER],
	['the log placeholder', `\`${SECRET_PLACEHOLDER}\``],
	['what the log keeps of an answer', `first ${piston.LOGGED_BODY_CHARS} characters of the server's`],
	['the 403 marker', ORIGIN_REFUSED_MARKER],
	['the 429 marker', RATE_LIMITED_MARKER],
	...LOOPBACK_HOSTS.map((host) => [`the plain-http host ${host}`, `\`${host}\``]),
	...CLIENT_IP_HEADERS.map((header) => [`the client header ${header}`, `\`${header}\``]),
	...EXPECTED_FUNCTIONS.map((name) => [`the URL of ${name}`, `/.netlify/functions/${name}`]),
]);

/** A shared/ file as text. */
function readShared(filePath) {
	return fs.readFileSync(path.join(SHARED_ROOT, filePath), 'utf8');
}

/** The README's headings, without their marks. */
function headings(readme) {
	return [...readme.matchAll(/^#{2,4} (.+)$/gm)].map((match) => match[1]);
}

/** The README's section under `heading`, up to the next heading of its level. */
function section(readme, heading) {
	const start = readme.indexOf(`\n## ${heading}\n`);
	assert.notEqual(start, -1, `the README has the section ${heading}`);
	const end = readme.indexOf('\n## ', start + 1);
	return readme.slice(start, end === -1 ? undefined : end);
}

/** The files that may point at the README, with their paths from shared/. */
function pointerFiles() {
	return sharedFiles().filter((file) => POINTER_FOLDERS.some((folder) => file.startsWith(folder)));
}

/** What follows each pointer in `text`, with comment line breaks read as spaces. */
function pointersIn(text) {
	const flat = text.replace(COMMENT_LINE_BREAK, ' ');
	return [...flat.matchAll(POINTER)].map((match) => flat.slice(match.index + match[0].length));
}

test('the README has a row for every variable the functions read', () => {
	const table = section(readShared(README_FILE), VARIABLES_HEADING);
	for (const name of VARIABLES) {
		assert.ok(table.includes(`| \`${name}\` |`), `${name} has a row`);
	}
});

test("the README's numbers, names and markers are the code's", () => {
	const readme = readShared(README_FILE);
	for (const [what, text] of STATED) {
		assert.ok(readme.includes(text), `the README states ${what}: ${text}`);
	}
});

test('every pointer at the README names a heading that is there', () => {
	const known = headings(readShared(README_FILE));
	const pointers = pointerFiles().flatMap((file) => pointersIn(readShared(file)).map((rest) => ({ file, rest })));
	assert.ok(pointers.length > 0, 'the code points at the README');
	for (const { file, rest } of pointers) {
		const heading = known.find((name) => rest.startsWith(name));
		assert.ok(heading !== undefined, `${file} points at a heading the README lacks: ${rest.slice(0, 50)}`);
	}
});

test("the README's way to turn Run off names earlier deploys and the proxy's secret", () => {
	const publicSite = section(readShared(README_FILE), 'Running it on a public site');
	for (const words of ['Earlier deploys keep Run', 'Publish deploy', "secret on the server's proxy"]) {
		assert.ok(publicSite.includes(words), `the section says: ${words}`);
	}
});

test("nothing in the code points at a site's own Netlify notes", () => {
	for (const file of pointerFiles()) {
		assert.ok(!readShared(file).includes(SITE_NOTES), `${file} names ${SITE_NOTES}`);
	}
});
