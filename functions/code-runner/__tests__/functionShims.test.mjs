/**
 * functionShims.test.mjs — what Netlify finds in a site that uses these functions, which is the
 * site's netlify/functions and not this folder: the two shims, the functions the site lists as its
 * own in its package.json (functionFolder.mjs > OWN_FUNCTIONS_FIELD), and nothing else that would
 * deploy. Each of the two shims is one plain re-export of the library's function (the function
 * itself, nothing beside it, because named exports do not pass through a shim). The installed bundler
 * (`@netlify/zip-it-and-ship-it`, under netlify-cli) reads the two shims as modern ES modules at
 * their default URLs, and each of the site's own functions as a modern function. netlify.toml's
 * [functions] block names the folder and esbuild. This file reads the host site, so that each site
 * that mounts shared/ is checked as itself, and it reads the site's list inside the tests only. The
 * library's own shape is functionsLayout.test.mjs. When the folder or the bundler's list differs
 * from the functions allowed (functionFolder.mjs > allowedFunctions()), the failure prints
 * ALLOWED_FUNCTIONS_RULE, then the functions found and the ones allowed, and Node's own diff below
 * them where Node prints one: every entry file there deploys, listed or not, so a file the site
 * does not mean to publish is deleted, not listed.
 * Run with `npm run test:shared`. In the hub there is no site, so every test that reads one skips
 * there.
 *
 * HOW TO CHANGE IT
 *   A new function of the library: functionFolder.mjs > EXPECTED_FUNCTIONS.
 *   A function of the site's own: its name in the site's package.json, in the list that
 *   functionFolder.mjs > OWN_FUNCTIONS_FIELD names. Any other function in that folder fails the
 *   first test on purpose, because a stray file there is a public endpoint. A site's own function
 *   is held here only to being a modern function: the rest of its shape is for the site's own tests.
 *   What a failed comparison says: ALLOWED_FUNCTIONS_RULE, then the functions found and allowed
 *   (assertOnlyAllowed), so the message names them on every Node, with its diff or without.
 *   The bundler check skips itself, with the reason, on a site without netlify-cli installed;
 *   where it runs, it also fails when an upgrade changes the bundler's list of entry extensions,
 *   so functionFolder.mjs > ENTRY_EXTENSIONS is updated with it (BUNDLER_FINDER_FILE holds the list).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MANIFEST_FILE, PREFIX } from '../../../scripts/lib/settings.mjs';
import { hostSite, stripComments } from '../../../__tests__/sharedTree.mjs';
import {
	ENTRY_EXTENSIONS,
	EXPECTED_FUNCTIONS,
	FUNCTION_EXTENSION,
	OWN_FUNCTIONS_FIELD,
	allowedFunctions,
	discoveredFunctions,
} from './functionFolder.mjs';

/** The site this folder is mounted in, or null in the hub. */
const SITE = hostSite();

/** For each test that reads the site, so that it skips in the hub. */
const withSite = { skip: SITE === null ? 'no site here: this is the hub' : false };

/** The folder Netlify reads in a site, from the site's root. */
const SITE_FUNCTIONS_FOLDER = 'netlify/functions';

/** Where Netlify serves a function of that folder by default: this, then the function's name. */
const FUNCTION_URL_PREFIX = '/.netlify/functions/';

/**
 * What a comparison of the functions found with the ones allowed prints first when the two differ,
 * before the two lists: a name on the list does not stop a file deploying, so the list is only for
 * a function the site means to publish, and any other file goes.
 */
const ALLOWED_FUNCTIONS_RULE = [
	`Every entry file in a site's ${SITE_FUNCTIONS_FOLDER} deploys as a public endpoint, by default at ${FUNCTION_URL_PREFIX}<name>, listed or not.`,
	`A name goes under ${MANIFEST_FILE} > ${OWN_FUNCTIONS_FIELD} only for a function the site means to publish, with guards and tests of its own.`,
	`Delete any other entry file from ${SITE_FUNCTIONS_FOLDER}.`,
].join(' ');

/** A made-up function that no list allows, for the test of that rule: not any site's. */
const STRAY_FUNCTION = 'stray';

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

/**
 * The site's own functions as its package.json lists them under OWN_FUNCTIONS_FIELD: undefined when
 * it lists none, and as written otherwise, for allowedFunctions() to check. Called inside a test, so
 * the hub, which has no site, can skip.
 */
function ownFunctions() {
	const manifest = JSON.parse(fs.readFileSync(path.join(SITE, MANIFEST_FILE), 'utf8'));
	return manifest[OWN_FUNCTIONS_FIELD];
}

/** True for a function of the library, which a site holds as a shim. */
function isLibraryFunction(name) {
	return EXPECTED_FUNCTIONS.includes(name);
}

/** Function names for a message: comma-separated, or 'none'. */
function namesOf(names) {
	return names.length === 0 ? 'none' : names.join(', ');
}

/**
 * Fails unless the functions `found` are exactly the `allowed` ones, with ALLOWED_FUNCTIONS_RULE and then
 * both lists: the message names the functions on every Node, and one that prints its diff under a
 * message adds it below.
 */
function assertOnlyAllowed(found, allowed) {
	assert.deepEqual(found, allowed, `${ALLOWED_FUNCTIONS_RULE} Found: ${namesOf(found)}. Allowed: ${namesOf(allowed)}.`);
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

/** What the bundler must report of a shim of the library's, beyond being modern: an ES module, `.mjs`, at its default URL. */
function assertShimShape(fn) {
	assert.equal(fn.inputModuleFormat, ESM_FORMAT, `${fn.name} is read as an ES module`);
	assert.equal(fn.extension, FUNCTION_EXTENSION, fn.name);
	assert.deepEqual(fn.routes ?? [], [], `${fn.name} has no custom route`);
}

test("a site's netlify/functions holds the two shims, the functions its package.json lists as its own, and no other, so no stray file becomes a public endpoint", withSite, () => {
	assertOnlyAllowed(discoveredFunctions(siteFunctions()), allowedFunctions(ownFunctions()));
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
	assertOnlyAllowed(functions.map((fn) => fn.name).sort(), allowedFunctions(ownFunctions()));
	for (const fn of functions) {
		assert.equal(fn.runtimeAPIVersion, MODERN_API_VERSION, `${fn.name} is read as a modern function`);
		if (isLibraryFunction(fn.name)) assertShimShape(fn);
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

test('a function the site may not hold fails with the rule first, and the message names that function after it', () => {
	const allowed = allowedFunctions();
	assert.throws(() => assertOnlyAllowed([...allowed, STRAY_FUNCTION].sort(), allowed), (error) => {
		assert.ok(error.message.startsWith(ALLOWED_FUNCTIONS_RULE), 'the rule comes first');
		assert.ok(error.message.includes(STRAY_FUNCTION, ALLOWED_FUNCTIONS_RULE.length), 'the message names the function after the rule');
		return true;
	});
});
