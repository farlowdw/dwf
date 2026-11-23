/**
 * functionsLayout.test.mjs — the shape of the library (shared/functions/code-runner) that a site's
 * shims and Netlify rely on: exactly the two functions (execute, runtimes) are function entry
 * points, the helper folders (lib/, __tests__/) are not, and each function is a MODERN Netlify
 * Function: an ES module with a default export and no `handler` export (the bundler's rule for
 * taking the modern branch) and no `config.path`, so each keeps its default
 * /.netlify/functions/<name> URL. What Netlify finds in a site is functionShims.test.mjs. The list
 * it compares a site's folder with, functionFolder.mjs > allowedFunctions(), is tested here: it
 * needs no site, so it runs in the hub too.
 * Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new function: functionFolder.mjs > EXPECTED_FUNCTIONS. If a function ever sets `config.path`
 *   on purpose, drop the "no custom path" assertion for it, and change the editor's URLs with it
 *   (shared/plugins/monaco-editor's options).
 *   What a site's list of its own functions may hold: functionFolder.mjs > allowedFunctions(), and
 *   its two tests here. OWN_EARLY and OWN_LATE are made-up names, not any site's.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	EXPECTED_FUNCTIONS,
	FUNCTION_EXTENSION,
	OWN_FUNCTIONS_FIELD,
	allowedFunctions,
	discoveredFunctions,
} from './functionFolder.mjs';

const FUNCTIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Two made-up names of a site's own functions: the first sorts before the library's, the second after. */
const OWN_EARLY = 'aaa';
const OWN_LATE = 'zzz';

/** What assert.throws checks of a refused list: a plain Error whose message starts with the field and, when given, names `name` as a word. */
function refusal(name) {
	const named = name === undefined ? '' : `.*\\b${name}\\b`;
	return { name: 'Error', message: new RegExp(`^${OWN_FUNCTIONS_FIELD}\\b${named}`) };
}

test('Netlify finds exactly the expected functions (lib/ and __tests__/ are not functions)', () => {
	assert.deepEqual(discoveredFunctions(FUNCTIONS_DIR), [...EXPECTED_FUNCTIONS].sort());
	for (const name of EXPECTED_FUNCTIONS) {
		assert.ok(fs.existsSync(path.join(FUNCTIONS_DIR, `${name}${FUNCTION_EXTENSION}`)), `${name}${FUNCTION_EXTENSION} exists`);
	}
});

test('each function is a modern Netlify Function: a default export, no handler export, no custom path', async () => {
	for (const name of EXPECTED_FUNCTIONS) {
		const fn = await import(pathToFileURL(path.join(FUNCTIONS_DIR, `${name}${FUNCTION_EXTENSION}`)));
		assert.equal(typeof fn.default, 'function', `${name}: the default export is the function`);
		assert.equal('handler' in fn, false, `${name}: a handler export would make the bundler take the retired Lambda branch`);
		assert.equal(fn.config?.path, undefined, `${name}: no config.path, so the default /.netlify/functions/${name} URL stays`);
	}
});

test("allowedFunctions: the library's functions alone when a site lists none, and with a site's own names, all sorted", () => {
	const library = [...EXPECTED_FUNCTIONS].sort();
	assert.deepEqual(allowedFunctions(), library, 'no list: a site without the field');
	assert.deepEqual(allowedFunctions([]), library, 'an empty list');
	const own = Object.freeze([OWN_LATE, OWN_EARLY]); // frozen, so a change to the list given would throw
	assert.deepEqual(allowedFunctions(own), [...EXPECTED_FUNCTIONS, ...own].sort(), 'two names, given out of order');
});

test("allowedFunctions refuses, with a plain Error that names the field, anything but a list of non-empty names, a name of the library's, and a name twice", () => {
	for (const own of [null, OWN_EARLY, { [OWN_EARLY]: true }, [OWN_EARLY, 1], [OWN_EARLY, '']]) {
		assert.throws(() => allowedFunctions(own), refusal(), `${JSON.stringify(own)} is not a list of names`);
	}
	for (const name of EXPECTED_FUNCTIONS) {
		assert.throws(() => allowedFunctions([OWN_EARLY, name]), refusal(name), `${name} is the library's`);
	}
	assert.throws(() => allowedFunctions([OWN_EARLY, OWN_LATE, OWN_EARLY]), refusal(OWN_EARLY), `${OWN_EARLY} twice`);
});
