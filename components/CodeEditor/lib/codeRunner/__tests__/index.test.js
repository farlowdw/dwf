/**
 * index.test.js — the library's one import (../index.js) re-exports every export of every
 * module of the folder (a name two modules export would silently vanish from `export *`), and
 * the folder's package.json keeps its module settings. Run with `npm run test:shared`.
 * To change it: a new module needs no line here (every .js file of the folder is read); a name callers
 * rely on goes in the promised list.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as library from '../index.js';

/** The folder of the library. */
const LIBRARY_DIR = fileURLToPath(new URL('../', import.meta.url));

/** The module files of the folder (every .js but index.js). */
function moduleFiles() {
	return fs.readdirSync(LIBRARY_DIR).filter((name) => name.endsWith('.js') && name !== 'index.js').sort();
}

test('index.js re-exports every export of every module, the same values', async () => {
	const seen = new Map();
	for (const file of moduleFiles()) {
		const module = await import(new URL(`../${file}`, import.meta.url));
		for (const [name, value] of Object.entries(module)) {
			assert.equal(seen.has(name), false, `${name} is exported by both ${seen.get(name)} and ${file}`);
			seen.set(name, file);
			assert.equal(library[name], value, `${name} (${file}) is missing from index.js`);
		}
	}
	assert.deepEqual(Object.keys(library).sort(), [...seen.keys()].sort(), 'index.js exports nothing of its own');
});

test('the promised names are all there', () => {
	const promised = [
		'LANGUAGES', 'ALIASES', 'languageInfo',
		'compareVersions', 'matchesSelector', 'resolveVersion',
		'runtimesFor', 'pickRuntime',
		'DEFAULT_LIMITS', 'TIMEOUT_BOUNDS', 'effectiveLimits', 'buildExecuteRequest', 'fromLegacyOutputSettings',
		'summarizeResult', 'describeResult', 'formatMs', 'formatBytes',
		'RunError', 'explainHttpError',
		'EXECUTE_URL', 'RUNTIMES_URL', 'fetchRuntimes', 'resetRuntimesCache', 'executeCode',
		'normalizeFoldRegions', 'foldRegionsFor',
		'normalizeSnippets',
		'parseLineSpec', 'linesOf', 'formatLineSpec', 'lineKindsOf',
		'MAGIC_COMMENTS', 'LINE_KINDS', 'stripMagicComments',
		'normalizeSteps',
		'errorLocations',
		'originalLineFor', 'originalPositionFor',
		'CHECK_MARKER', 'CHECK_HELPERS', 'TYPESCRIPT_CHECK_DECLARATION',
		'compareOutput', 'parseCheckResults', 'buildCheckFiles', 'supportsChecks', 'exerciseTextFor',
	];
	for (const name of promised) assert.notEqual(library[name], undefined, name);
});

test('package.json: ES modules, index.js as the entry, no side effects', () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(LIBRARY_DIR, 'package.json'), 'utf8'));
	assert.equal(manifest.type, 'module');
	assert.equal(manifest.main, 'index.js');
	assert.equal(manifest.sideEffects, false);
	assert.equal(typeof manifest['//'], 'string', 'the comment saying why');
});

test('every module of the folder is listed in the README', () => {
	const readme = fs.readFileSync(path.join(LIBRARY_DIR, 'README.md'), 'utf8');
	for (const file of moduleFiles()) assert.match(readme, new RegExp(`\`${file.replace('.', '\\.')}\``), `${file} is missing from README.md`);
});
