/**
 * functionsLayout.test.mjs — the shape of the library (shared/functions/code-runner) that a site's
 * shims and Netlify rely on: exactly the two functions (execute, runtimes) are function entry
 * points, the helper folders (lib/, __tests__/) are not, and each function is a MODERN Netlify
 * Function: an ES module with a default export and no `handler` export (the bundler's rule for
 * taking the modern branch) and no `config.path`, so each keeps its default
 * /.netlify/functions/<name> URL. What Netlify finds in a site is functionShims.test.mjs.
 * Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new function: functionFolder.mjs > EXPECTED_FUNCTIONS. If a function ever sets `config.path`
 *   on purpose, drop the "no custom path" assertion for it, and change the editor's URLs with it
 *   (shared/plugins/monaco-editor's options).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EXPECTED_FUNCTIONS, FUNCTION_EXTENSION, discoveredFunctions } from './functionFolder.mjs';

const FUNCTIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
