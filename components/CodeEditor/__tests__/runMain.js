/**
 * runMain.js — runs a program a test wrote into a folder (its main.js) in this machine's node,
 * for typescript.test.js, typescriptRun.test.js and lib/codeRunner/__tests__/sourceMap.test.js
 * (not a test file itself). The program gets this process's environment without FORCE_COLOR.
 * Node's test runner sets FORCE_COLOR=1 for every test file when it prints to a terminal, and a
 * node that inherits it colours what console.log prints (a number, a boolean) and the frames of
 * an error's stack, although its output is a pipe. The tests compare plain text, so with the
 * variable handed on they pass where the run's output goes to a pipe and fail in a terminal.
 *
 * HOW TO CHANGE IT  Another variable that changes what a program prints goes in LEFT_OUT, with
 * a test in runMain.test.js. RUN_LIMIT_MS is how long a program may take.
 */

import { spawnSync } from 'node:child_process';

/** The file node is started on, in the folder a test wrote its program into. */
const MAIN_FILE = 'main.js';

/** A program still running after this is stopped (spawnSync's timeout). */
const RUN_LIMIT_MS = 20000;

/** What a program must not inherit from the test run around it: it changes what the program prints. */
const LEFT_OUT = Object.freeze(['FORCE_COLOR']);

/** `env` (this process's when none is given) without LEFT_OUT, as a new object. */
export function programEnv(env = process.env) {
	const copy = { ...env };
	for (const name of LEFT_OUT) delete copy[name];
	return copy;
}

/** Run `folder`'s main.js in this machine's node: spawnSync's answer ({ status, stdout, stderr, … }, the two texts as strings). */
export function runMain(folder) {
	return spawnSync(process.execPath, [MAIN_FILE], { cwd: folder, encoding: 'utf8', timeout: RUN_LIMIT_MS, env: programEnv() });
}
