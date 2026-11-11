/**
 * runtimes.test.js — finding and choosing runtimes in Piston's list (../runtimes.js): matching a
 * language by name, alias or canonical name in any case, newest first, Python 2 kept apart from
 * Python 3, every pickRuntime() reason, and the menu label. Run with `npm run test:shared`.
 * To change it: a new rule of ../runtimes.js, or a new pickRuntime() reason, gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PICK_LANGUAGE_MISSING, PICK_OK, PICK_VERSION_MISSING, pickRuntime, runtimeLabel, runtimesFor } from '../runtimes.js';

/** A Piston runtimes list (/api/v2/runtimes, as the function maps it), deliberately unsorted. */
const RUNTIMES = Object.freeze([
	{ language: 'python', version: '3.10.0', aliases: ['py', 'py3', 'python3', 'python3.10'], runtime: null },
	{ language: 'javascript', version: '20.11.1', aliases: ['node-javascript', 'node-js', 'javascript', 'js'], runtime: 'node' },
	{ language: 'python', version: '3.12.0', aliases: ['py', 'py3', 'python3', 'python3.12'], runtime: null },
	{ language: 'c++', version: '10.2.0', aliases: ['cpp', 'g++'], runtime: 'gcc' },
	{ language: 'c', version: '10.2.0', aliases: ['gcc'], runtime: 'gcc' },
	{ language: 'python2', version: '2.7.18', aliases: ['py2', 'python2'], runtime: null },
	{ language: 'javascript', version: '1.32.3', aliases: ['deno-js', 'deno-javascript'], runtime: 'deno' },
	{ language: 'python', version: '3.9.4', aliases: ['py', 'py3', 'python3'], runtime: null },
	{ language: 'rscript', version: '4.1.1', aliases: ['r'], runtime: null },
	{ language: 'zig', version: '0.10.1', aliases: ['ziglang'], runtime: null },
	{ language: 'bash', version: '5.2.0', aliases: ['sh'], runtime: null },
]);

/** The versions of a list of runtimes. */
const versionsOf = (runtimes) => runtimes.map((runtime) => runtime.version);

test('runtimesFor: the runtimes of a language, newest first', () => {
	assert.deepEqual(versionsOf(runtimesFor(RUNTIMES, 'python')), ['3.12.0', '3.10.0', '3.9.4']);
	assert.deepEqual(versionsOf(runtimesFor(RUNTIMES, 'bash')), ['5.2.0']);
});

test('runtimesFor: any case, aliases and canonical names find the same runtimes', () => {
	const python = runtimesFor(RUNTIMES, 'python');
	for (const name of ['Python', 'PYTHON', ' python ', 'py', 'py3', 'python3', 'Py']) {
		assert.deepEqual(runtimesFor(RUNTIMES, name), python, name);
	}
	assert.deepEqual(versionsOf(runtimesFor(RUNTIMES, 'python2')), ['2.7.18'], "Piston's own language: Python 2 only");
	assert.deepEqual(versionsOf(runtimesFor(RUNTIMES, 'PY2')), ['2.7.18']);
	assert.deepEqual(runtimesFor(RUNTIMES, 'cpp').map((runtime) => runtime.language), ['c++']);
	assert.deepEqual(runtimesFor(RUNTIMES, 'C++').map((runtime) => runtime.language), ['c++']);
	assert.deepEqual(runtimesFor(RUNTIMES, 'r').map((runtime) => runtime.language), ['rscript']);
	assert.deepEqual(runtimesFor(RUNTIMES, 'sh').map((runtime) => runtime.language), ['bash']);
	assert.deepEqual(runtimesFor(RUNTIMES, 'shell').map((runtime) => runtime.language), ['bash'], "Monaco's name");
});

test('runtimesFor: C and C++ stay apart', () => {
	assert.deepEqual(runtimesFor(RUNTIMES, 'c').map((runtime) => runtime.language), ['c']);
	assert.deepEqual(runtimesFor(RUNTIMES, 'gcc').map((runtime) => runtime.language), ['c']);
});

test('runtimesFor: every engine of a language (node and deno for JavaScript)', () => {
	const javascript = runtimesFor(RUNTIMES, 'js');
	assert.deepEqual(javascript.map((runtime) => `${runtime.runtime} ${runtime.version}`), ['node 20.11.1', 'deno 1.32.3']);
	assert.deepEqual(runtimesFor(RUNTIMES, 'deno-js').map((runtime) => runtime.runtime), ['deno'], 'a Piston alias picks its runtime');
});

test('runtimesFor: a language languages.js does not know is found by its Piston name and aliases', () => {
	const runtimes = [...RUNTIMES, { language: 'osabie', version: '1.0.1', aliases: ['05ab1e', 'usable'], runtime: null }];
	assert.deepEqual(versionsOf(runtimesFor(runtimes, 'osabie')), ['1.0.1']);
	assert.deepEqual(versionsOf(runtimesFor(runtimes, 'OSABIE')), ['1.0.1']);
	assert.deepEqual(versionsOf(runtimesFor(runtimes, '05AB1E')), ['1.0.1']);
	assert.deepEqual(versionsOf(runtimesFor(RUNTIMES, 'Ziglang')), ['0.10.1'], 'a Piston alias languages.js does not list');
});

test('runtimesFor: nothing for an unknown language, an empty name or a list that is not one', () => {
	assert.deepEqual(runtimesFor(RUNTIMES, 'cobol'), []);
	assert.deepEqual(runtimesFor(RUNTIMES, ''), []);
	assert.deepEqual(runtimesFor(RUNTIMES, undefined), []);
	assert.deepEqual(runtimesFor(undefined, 'python'), []);
	assert.deepEqual(runtimesFor({ python: [] }, 'python'), []);
});

test('runtimesFor: skips broken entries and keeps the input as it was', () => {
	const runtimes = [null, 'python', { language: 'python' }, { version: '3.12.0' }, { language: 'python', version: '3.12.0', aliases: 'py' }];
	const copy = JSON.stringify(runtimes);
	assert.deepEqual(runtimesFor(runtimes, 'python'), [runtimes[4]]);
	assert.deepEqual(runtimesFor(runtimes, 'py'), [runtimes[4]], 'found by canonical name even with broken aliases');
	assert.equal(JSON.stringify(runtimes), copy);
	const frozenCopy = runtimesFor(RUNTIMES, 'python');
	assert.notEqual(frozenCopy, RUNTIMES, 'a new array');
});

test('pickRuntime: an exact version', () => {
	const pick = pickRuntime(RUNTIMES, 'python', '3.10.0');
	assert.equal(pick.reason, PICK_OK);
	assert.equal(pick.reason, 'ok');
	assert.equal(pick.runtime, RUNTIMES[0], 'the entry of the list itself');
	assert.deepEqual(pick.versions, ['3.12.0', '3.10.0', '3.9.4']);
});

test('pickRuntime: no selector, "*", or a prefix chooses the newest that matches', () => {
	assert.equal(pickRuntime(RUNTIMES, 'python').runtime.version, '3.12.0');
	assert.equal(pickRuntime(RUNTIMES, 'python', '*').runtime.version, '3.12.0');
	assert.equal(pickRuntime(RUNTIMES, 'python', '').runtime.version, '3.12.0');
	assert.equal(pickRuntime(RUNTIMES, 'python', '3').runtime.version, '3.12.0');
	assert.equal(pickRuntime(RUNTIMES, 'python', '3.9').runtime.version, '3.9.4');
	assert.equal(pickRuntime(RUNTIMES, 'py2', '2').runtime.version, '2.7.18');
	assert.equal(pickRuntime(RUNTIMES, 'python', '3.x').reason, 'ok');
});

test('pickRuntime: a version that is not installed falls back to the newest', () => {
	const pick = pickRuntime(RUNTIMES, 'python', '3.11');
	assert.equal(pick.reason, PICK_VERSION_MISSING);
	assert.equal(pick.reason, 'version-missing');
	assert.equal(pick.runtime.version, '3.12.0');
	assert.deepEqual(pick.versions, ['3.12.0', '3.10.0', '3.9.4']);
	assert.equal(pickRuntime(RUNTIMES, 'python', '^3.9').reason, 'version-missing', 'ranges are not understood');
});

test('pickRuntime: a language with no runtime', () => {
	const pick = pickRuntime(RUNTIMES, 'java', '15');
	assert.deepEqual(pick, { runtime: null, versions: [], reason: PICK_LANGUAGE_MISSING });
	assert.equal(pick.reason, 'language-missing');
	assert.deepEqual(pickRuntime([], 'python'), { runtime: null, versions: [], reason: 'language-missing' });
	assert.deepEqual(pickRuntime(null, 'python'), { runtime: null, versions: [], reason: 'language-missing' });
});

test('Python 2 and Python 3 never stand in for each other', () => {
	assert.equal(pickRuntime(RUNTIMES, 'python', '2').reason, PICK_VERSION_MISSING, 'python lists only 3.x');
	assert.equal(pickRuntime(RUNTIMES, 'python', '2').runtime.version, '3.12.0');
	assert.deepEqual(pickRuntime(RUNTIMES, 'python2').versions, ['2.7.18']);
	assert.equal(pickRuntime(RUNTIMES, 'python2').runtime.language, 'python2');
	const withoutPython2 = RUNTIMES.filter((runtime) => runtime.language !== 'python2');
	assert.deepEqual(pickRuntime(withoutPython2, 'py2'), { runtime: null, versions: [], reason: PICK_LANGUAGE_MISSING }, 'reported missing, never Python 3');
	assert.equal(runtimeLabel(RUNTIMES[5]), 'Python 2 2.7.18');
});

test('pickRuntime: versions are distinct, and the newest engine wins a tie', () => {
	const runtimes = [
		{ language: 'typescript', version: '5.0.3', aliases: ['ts'], runtime: null },
		{ language: 'typescript', version: '5.0.3', aliases: ['deno-ts'], runtime: 'deno' },
	];
	const pick = pickRuntime(runtimes, 'ts', '5');
	assert.deepEqual(pick.versions, ['5.0.3']);
	assert.equal(pick.runtime, runtimes[0], 'the first listed of equal versions');
});

test('runtimeLabel: the language name, the version, and the engine when Piston names one', () => {
	assert.equal(runtimeLabel(RUNTIMES[2]), 'Python 3.12.0');
	assert.equal(runtimeLabel(RUNTIMES[1]), 'JavaScript 20.11.1 (node)');
	assert.equal(runtimeLabel(RUNTIMES[3]), 'C++ 10.2.0 (gcc)');
	assert.equal(runtimeLabel(RUNTIMES[8]), 'R 4.1.1');
	assert.equal(runtimeLabel(RUNTIMES[9]), 'Zig 0.10.1');
	assert.equal(runtimeLabel({ language: 'osabie', version: '1.0.1', aliases: [], runtime: null }), 'osabie 1.0.1', 'an unknown language keeps its Piston name');
	assert.equal(runtimeLabel(null), '');
	assert.equal(runtimeLabel({}), '');
});
