/**
 * functionShims.test.mjs — what Netlify finds in a site that uses these functions, which is the
 * site's netlify/functions and not this folder: exactly the two shims and nothing else that would
 * deploy, each one plain re-export of the library's function (the function itself, nothing beside
 * it, because named exports do not pass through a shim), the installed bundler
 * (`@netlify/zip-it-and-ship-it`, under netlify-cli) reads them as modern ES modules at their
 * default URLs, and netlify.toml's [functions] block names the folder and esbuild. This file reads
 * the host site, so that each site that mounts shared/ is checked as itself. The library's own
 * shape is functionsLayout.test.mjs.
 * Run with `npm run test:shared`. In the hub there is no site, so these tests skip there.
 *
 * HOW TO CHANGE IT
 *   A new function: functionFolder.mjs > EXPECTED_FUNCTIONS.
 *   A site with a function of its own fails the first test on purpose, because a stray file in
 *   that folder is a public endpoint. Make the site's own functions a list the site keeps, and
 *   compare against that and the two.
 *   The bundler check skips itself, with the reason, on a site without netlify-cli installed;
 *   where it runs, it also fails when an upgrade changes the bundler's list of entry extensions,
 *   so functionFolder.mjs > ENTRY_EXTENSIONS is updated with it (BUNDLER_FINDER_FILE holds the list).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PREFIX } from '../../../scripts/lib/settings.mjs';
import { hostSite, stripComments } from '../../../__tests__/sharedTree.mjs';
import { ENTRY_EXTENSIONS, EXPECTED_FUNCTIONS, FUNCTION_EXTENSION, discoveredFunctions } from './functionFolder.mjs';

/** The site this folder is mounted in, or null in the hub. */
const SITE = hostSite();

/** Every test here reads the site. */
const withSite = { skip: SITE === null ? 'no site here: this is the hub' : false };

/** The folder Netlify reads in a site, from the site's root. */
const SITE_FUNCTIONS_FOLDER = 'netlify/functions';

/** The library, from that folder, as a shim's import names it. */
const LIBRARY_FROM_SHIM = `../../${PREFIX}/functions/code-runner`;

/** The library's folder on disk. */
const LIBRARY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where the bundler Netlify uses may be installed (the CLI nests its own copy). */
const BUNDLER_CANDIDATES = Object.freeze([
	'node_modules/@netlify/zip-it-and-ship-it/dist/main.js',
	'node_modules/netlify-cli/node_modules/@netlify/zip-it-and-ship-it/dist/main.js',
]);

/** The bundler's finder, next to its main module, whose `allowedExtensions` ENTRY_EXTENSIONS mirrors. */
const BUNDLER_FINDER_FILE = 'runtimes/node/finder.js';

/** The line of that finder holding the list, e.g. `const allowedExtensions = ['.js', '.zip', …];`. */
const ALLOWED_EXTENSIONS_PATTERN = /allowedExtensions\s*=\s*(\[[^\]]*\])/;

/** What the bundler reports for a modern function written as an ES module. */
const MODERN_API_VERSION = 2;
const ESM_FORMAT = 'esm';

/** The site's functions folder. Called inside a test, so the hub, which has none, can skip. */
function siteFunctions() {
	return path.join(SITE, SITE_FUNCTIONS_FOLDER);
}

/** The path of one shim. */
function shimFile(name) {
	return path.join(siteFunctions(), `${name}${FUNCTION_EXTENSION}`);
}

/** The one line a shim holds, comments aside. */
function plainReExport(name) {
	return `export { default } from '${LIBRARY_FROM_SHIM}/${name}${FUNCTION_EXTENSION}';`;
}

/** The entry extensions the installed bundler's finder lists (read as text: the list is not exported). */
function bundlerEntryExtensions(bundler) {
	const source = fs.readFileSync(path.join(path.dirname(bundler), BUNDLER_FINDER_FILE), 'utf8');
	const match = source.match(ALLOWED_EXTENSIONS_PATTERN);
	assert.ok(match, `${BUNDLER_FINDER_FILE} still declares allowedExtensions`);
	return JSON.parse(match[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
}

/** The installed bundler's main module, or null when none is installed. */
function installedBundler() {
	const file = BUNDLER_CANDIDATES.map((candidate) => path.join(SITE, candidate)).find((candidate) => fs.existsSync(candidate));
	return file ?? null;
}

test("a site's netlify/functions holds the two shims and no other function, so no stray file becomes a public endpoint", withSite, () => {
	assert.deepEqual(discoveredFunctions(siteFunctions()), [...EXPECTED_FUNCTIONS].sort());
	for (const name of EXPECTED_FUNCTIONS) {
		assert.ok(fs.existsSync(shimFile(name)), `${SITE_FUNCTIONS_FOLDER}/${name}${FUNCTION_EXTENSION} exists`);
	}
});

test("each shim is one plain re-export: the library's function itself, and nothing beside it", withSite, async () => {
	for (const name of EXPECTED_FUNCTIONS) {
		assert.equal(stripComments(fs.readFileSync(shimFile(name), 'utf8')).trim(), plainReExport(name), `${name}: one line, a default export and no handler`);
		const shim = await import(pathToFileURL(shimFile(name)));
		const library = await import(pathToFileURL(path.join(LIBRARY_DIR, `${name}${FUNCTION_EXTENSION}`)));
		assert.deepEqual(Object.keys(shim), ['default'], `${name}: the default export and no other`);
		assert.equal(shim.default, library.default, `${name}: the same function, not a wrapper`);
	}
});

test('the installed bundler lists the entry extensions this test mirrors, and reads both functions as modern ES modules at their default URLs', withSite, async (t) => {
	const bundler = installedBundler();
	if (bundler === null) {
		t.skip('netlify-cli (and its @netlify/zip-it-and-ship-it) is not installed here');
		return;
	}
	assert.deepEqual(bundlerEntryExtensions(bundler), [...ENTRY_EXTENSIONS], 'ENTRY_EXTENSIONS mirrors the bundler\'s allowedExtensions');
	const { listFunctions } = await import(pathToFileURL(bundler));
	const functions = await listFunctions([siteFunctions()], { parseISC: true });
	assert.deepEqual(functions.map((fn) => fn.name).sort(), [...EXPECTED_FUNCTIONS].sort());
	for (const fn of functions) {
		assert.equal(fn.runtimeAPIVersion, MODERN_API_VERSION, `${fn.name} is read as a modern function`);
		assert.equal(fn.inputModuleFormat, ESM_FORMAT, `${fn.name} is read as an ES module`);
		assert.equal(fn.extension, FUNCTION_EXTENSION, fn.name);
		assert.deepEqual(fn.routes ?? [], [], `${fn.name} has no custom route`);
	}
});

test('netlify.toml names the functions folder and the esbuild bundler', withSite, () => {
	const toml = fs.readFileSync(path.join(SITE, 'netlify.toml'), 'utf8');
	const block = toml.split(/^\[functions\]\s*$/m)[1];
	assert.ok(block, 'netlify.toml has a [functions] block');
	const body = block.split(/^\[/m)[0];
	assert.match(body, /^\s*directory\s*=\s*"netlify\/functions"\s*$/m);
	assert.match(body, /^\s*node_bundler\s*=\s*"esbuild"\s*$/m);
});
