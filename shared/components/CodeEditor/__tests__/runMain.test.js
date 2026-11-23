/**
 * runMain.test.js — how the tests run a program in this machine's node (./runMain.js): what the
 * program prints, and the stack of one that fails, are plain text also where node's test runner
 * forces colours (in a terminal it sets FORCE_COLOR=1 for every test file; these tests set it
 * themselves, so a run whose output goes to a pipe checks it too); every other variable still
 * reaches the program; this process's own environment is left as it was.
 * Run with `npm run test:shared`.
 * To change it: a variable added to ./runMain.js > LEFT_OUT gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { programEnv, runMain } from './runMain.js';

/** The variable node's test runner sets for its test files when it prints to a terminal. */
const FORCED_COLOURS = 'FORCE_COLOR';

/** A variable of these tests' own: the rest of the environment must reach the program. */
const PROBE = 'CODE_EDITOR_RUN_MAIN_PROBE';

/** The start of every colour code a terminal reads (ESC and an opening bracket). */
const COLOUR_CODE_START = '\u001b[';

/** Write `js` as the main.js of a new folder, hand the folder to `use`, then remove it. */
function withProgram(js, use) {
	const folder = mkdtempSync(path.join(os.tmpdir(), 'dwf-run-main-test-'));
	try {
		writeFileSync(path.join(folder, 'main.js'), js);
		return use(folder);
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}

/** Call `run` while this process's environment holds `variables`, then put the environment back as it was. */
function withEnvironment(variables, run) {
	const before = Object.keys(variables).map((name) => [name, process.env[name]]);
	Object.assign(process.env, variables);
	try {
		return run();
	} finally {
		for (const [name, value] of before) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
}

test('programEnv: FORCE_COLOR is left out, every other variable is kept, the environment it was given is not changed', () => {
	const given = { PATH: '/bin', [FORCED_COLOURS]: '1', NO_COLOR: '1' };
	assert.deepEqual(programEnv(given), { PATH: '/bin', NO_COLOR: '1' });
	assert.deepEqual(given, { PATH: '/bin', [FORCED_COLOURS]: '1', NO_COLOR: '1' });
});

test('a program prints plain text where colours are forced (FORCE_COLOR=1, as in a run on a terminal): a number, a boolean, an array', () => {
	const result = withEnvironment({ [FORCED_COLOURS]: '1' }, () => withProgram("console.log(3, true, [1, 'a']);\n", runMain));
	assert.equal(result.status, 0);
	assert.equal(result.stdout, "3 true [ 1, 'a' ]\n");
	assert.equal(result.stderr, '');
});

test("a failing program's stack is plain text there too: its frames are not cut by colour codes", () => {
	const result = withEnvironment({ [FORCED_COLOURS]: '1' }, () => withProgram("function fail() { throw new Error('boom'); }\nfail();\n", runMain));
	assert.equal(result.status, 1);
	assert.ok(!result.stderr.includes(COLOUR_CODE_START), `colour codes in:\n${result.stderr}`);
	assert.match(result.stderr, /Error: boom\n {4}at fail \(.*[\\/]main\.js:1:25\)\n/);
});

test('every other variable reaches the program, and this process keeps its own environment', () => {
	const program = `console.log(process.env.${PROBE}, typeof process.env.${FORCED_COLOURS});\n`;
	withEnvironment({ [FORCED_COLOURS]: '1', [PROBE]: 'here' }, () => {
		assert.equal(withProgram(program, runMain).stdout, 'here undefined\n');
		assert.equal(process.env[FORCED_COLOURS], '1');
		assert.equal(process.env[PROBE], 'here');
	});
});
