/**
 * runtimeChoice.test.js — which version the editor runs and what its header shows
 * (../runtimeChoice.js): the newest installed version by default, a selector, the fallback when
 * the asked version is missing (and its notice), the reader's own pick, a language that is not
 * installed, and runtimes that could not be loaded (`npm start`); TypeScript (2026-10-25:
 * compiled in the browser, run on the newest Node, its versions as text). Run with
 * `npm run test:shared`.
 * To change it: a new rule of ../runtimeChoice.js gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	BROWSER_COMPILED,
	RUNTIMES_FAILED,
	RUNTIMES_LOADING,
	RUNTIMES_READY,
	chooseRuntime,
	compilesInBrowser,
	versionOptions,
} from '../runtimeChoice.js';

/** A code runner with two Pythons, two JavaScript engines and gcc's C++ (Piston's list shape). */
const RUNTIMES = Object.freeze([
	{ language: 'python', version: '3.9.4', aliases: ['py', 'python3'], runtime: null },
	{ language: 'javascript', version: '1.32.3', aliases: ['js', 'deno'], runtime: 'deno' },
	{ language: 'python', version: '3.12.0', aliases: ['py', 'py3', 'python3', 'python3.12'], runtime: null },
	{ language: 'javascript', version: '20.11.1', aliases: ['node-javascript', 'node-js', 'javascript', 'js'], runtime: 'node' },
	{ language: 'c++', version: '10.2.0', aliases: ['cpp', 'g++'], runtime: 'gcc' },
]);

/** chooseRuntime with the runtimes known. */
function choose(language, selector, choice) {
	return chooseRuntime({ status: RUNTIMES_READY, runtimes: RUNTIMES, language, selector, choice });
}

test('no selector: the newest installed version, a menu of all of them, newest first', () => {
	const runtime = choose('python');
	assert.equal(runtime.version, '3.12.0');
	assert.equal(runtime.runLanguage, 'python');
	assert.equal(runtime.text, 'Python 3.12.0');
	assert.equal(runtime.canRun, true);
	assert.equal(runtime.notice, null);
	assert.deepEqual(
		runtime.options.map((option) => [option.version, option.label, option.shortLabel]),
		[
			['3.12.0', 'Python 3.12.0', '3.12.0'],
			['3.9.4', 'Python 3.9.4', '3.9.4'],
		],
	);
});

test('a selector picks the newest matching version', () => {
	assert.equal(choose('python', '3.9').version, '3.9.4');
	assert.equal(choose('python', '3.x').version, '3.12.0');
	assert.equal(choose('python', '3.12.0').version, '3.12.0');
	assert.equal(choose('py', '3').version, '3.12.0', 'an alias names the language');
});

test('a missing version falls back to the newest, with an info notice, until the reader picks one', () => {
	const fallback = choose('python', '3.10');
	assert.equal(fallback.version, '3.12.0');
	assert.equal(fallback.canRun, true);
	assert.deepEqual(fallback.notice, { severity: 'info', message: "Python 3.10 isn't installed; using 3.12.0." });

	const picked = choose('python', '3.10', '3.9.4');
	assert.equal(picked.version, '3.9.4');
	assert.equal(picked.notice, null, 'the reader chose: no notice');

	const pickedNewest = choose('python', '3.10', '3.12.0');
	assert.equal(pickedNewest.notice, null);
});

test("the reader's pick wins over the selector; a pick that is not installed is ignored", () => {
	assert.equal(choose('python', '3.12', '3.9.4').version, '3.9.4');
	assert.equal(choose('python', '3.9', '2.7.18').version, '3.9.4');
});

test('several engines: the label names the engine, Run sends Piston\'s language name', () => {
	const runtime = choose('JavaScript');
	assert.equal(runtime.version, '20.11.1');
	assert.equal(runtime.runLanguage, 'javascript');
	assert.deepEqual(
		runtime.options.map((option) => [option.label, option.shortLabel]),
		[
			['JavaScript 20.11.1 (node)', '20.11.1 (node)'],
			['JavaScript 1.32.3 (deno)', '1.32.3 (deno)'],
		],
	);
	const cpp = choose('cpp');
	assert.equal(cpp.runLanguage, 'c++');
	assert.equal(cpp.text, 'C++ 10.2.0 (gcc)');
});

test('a language that is not installed cannot run, and says so', () => {
	const runtime = choose('ruby', '3');
	assert.equal(runtime.canRun, false);
	assert.deepEqual(runtime.options, []);
	assert.deepEqual(runtime.notice, { severity: 'warning', message: "Ruby isn't installed on the code runner." });
	assert.equal(runtime.text, 'Ruby');
	assert.equal(choose('python', undefined).canRun, true);
	assert.equal(chooseRuntime({ status: RUNTIMES_READY, runtimes: [], language: 'python' }).canRun, false, 'an empty list: nothing is installed');
});

test('runtimes unknown (loading, or failed as under npm start): editing goes on, Run sends the selector as it is', () => {
	for (const status of [RUNTIMES_LOADING, RUNTIMES_FAILED]) {
		const asked = chooseRuntime({ status, runtimes: [], language: 'python', selector: '3.10' });
		assert.deepEqual(asked, { options: [], version: '3.10', runLanguage: 'python', text: 'Python 3.10', notice: null, canRun: true });
		const none = chooseRuntime({ status, runtimes: [], language: 'py' });
		assert.equal(none.version, '*', "no selector: Piston's 'newest installed'");
		assert.equal(none.text, 'Python');
		assert.equal(none.runLanguage, 'python');
	}
});

test('versionOptions keeps one entry per version, in the given order', () => {
	const options = versionOptions([
		{ language: 'python', version: '3.12.0', aliases: [], runtime: null },
		{ language: 'python', version: '3.12.0', aliases: [], runtime: 'other' },
		{ language: 'python', version: '3.9.4', aliases: [], runtime: null },
	]);
	assert.deepEqual(options.map((option) => option.version), ['3.12.0', '3.9.4']);
});

// ---- TypeScript (2026-10-25): compiled in the browser, run on the newest Node ----

/** A server's list: two Nodes and Piston's own (no longer used) TypeScript. */
const NODES = Object.freeze([
	{ language: 'javascript', version: '16.3.0', aliases: ['node-js', 'js'], runtime: 'node' },
	{ language: 'javascript', version: '20.11.1', aliases: ['node-js', 'js'], runtime: 'node' },
	{ language: 'typescript', version: '5.0.3', aliases: ['ts'], runtime: null },
]);

test('TypeScript runs on the NEWEST Node as JavaScript: no menu, its versions as text, any `version` ignored', () => {
	const runtime = chooseRuntime({ status: RUNTIMES_READY, runtimes: NODES, language: 'ts', selector: '5.0', typescriptVersion: '5.9.3' });
	assert.equal(runtime.runLanguage, 'javascript');
	assert.equal(runtime.version, '20.11.1');
	assert.deepEqual(runtime.options, [], 'no version menu');
	assert.equal(runtime.textOnly, true);
	assert.equal(runtime.text, 'TypeScript 5.9.3 · Node 20.11.1');
	assert.equal(runtime.shortText, '5.9.3 · Node 20.11.1', 'beside a language picker');
	assert.equal(runtime.notice, null);
	assert.equal(runtime.canRun, true);
	assert.equal(compilesInBrowser('typescript'), true);
	assert.equal(compilesInBrowser('ts'), true);
	assert.equal(compilesInBrowser('javascript'), false);
	assert.deepEqual(BROWSER_COMPILED, { typescript: 'javascript' });
});

test('TypeScript before Monaco or the runtimes are known: the words without the missing version; Run sends the newest Node', () => {
	const early = chooseRuntime({ status: RUNTIMES_LOADING, runtimes: [], language: 'typescript' });
	assert.deepEqual([early.runLanguage, early.version, early.text, early.canRun], ['javascript', '*', 'TypeScript · Node', true]);
	const noMonacoYet = chooseRuntime({ status: RUNTIMES_READY, runtimes: NODES, language: 'typescript' });
	assert.equal(noMonacoYet.text, 'TypeScript · Node 20.11.1');
});

test('TypeScript without any JavaScript runtime installed: a warning and no Run', () => {
	const runtime = chooseRuntime({ status: RUNTIMES_READY, runtimes: [NODES[2]], language: 'typescript', typescriptVersion: '5.9.3' });
	assert.equal(runtime.canRun, false);
	assert.deepEqual(runtime.notice, { severity: 'warning', message: "JavaScript isn't installed on the code runner." });
	assert.equal(runtime.textOnly, true);
});
