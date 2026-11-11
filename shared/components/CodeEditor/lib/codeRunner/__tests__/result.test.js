/**
 * result.test.js — reading Piston's answer (../result.js): one summary per outcome (success,
 * runtime error, every Piston status code, compile errors with and without a run stage,
 * unreadable answers), the status line describeResult() writes for each, and the units of
 * formatMs() / formatBytes(). Run with `npm run test:shared`.
 * To change it: a new outcome or Piston status in ../result.js gets a test here, with its status line.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { describeResult, formatBytes, formatMs, summarizeResult } from '../result.js';

/** A Piston stage with everything fine, overridden by `fields`. */
function stage(fields = {}) {
	return {
		signal: null,
		stdout: '',
		stderr: '',
		code: 0,
		output: '',
		memory: 14412000,
		message: null,
		status: null,
		cpu_time: 52,
		wall_time: 113,
		...fields,
	};
}

/** A Piston answer for Python with this run stage. */
function pythonAnswer(runFields) {
	return { run: stage(runFields), language: 'python', version: '3.12.0' };
}

/** The verified answer of a real run (print of the version). */
const REAL_ANSWER = {
	run: { signal: null, stdout: '3.12.0\n', stderr: '', code: 0, output: '3.12.0\n', memory: 14412000, message: null, status: null, cpu_time: 52, wall_time: 113 },
	language: 'python',
	version: '3.12.0',
};

const TRACEBACK = 'Traceback (most recent call last):\n  File "/piston/jobs/x/main.py", line 1, in <module>\nZeroDivisionError: division by zero\n';

test('summarizeResult: a real successful run', () => {
	assert.deepEqual(summarizeResult(REAL_ANSWER), {
		status: 'success',
		stage: 'run',
		output: '3.12.0\n',
		compileOutput: '',
		exitCode: 0,
		signal: null,
		cpuMs: 52,
		wallMs: 113,
		memoryBytes: 14412000,
		message: null,
		language: 'python',
		version: '3.12.0',
	});
});

test('summarizeResult: a non-zero exit is a runtime error (with or without Piston\'s RE)', () => {
	const withStatus = summarizeResult(pythonAnswer({ code: 1, status: 'RE', message: 'Exited with error status 1', stderr: TRACEBACK, output: TRACEBACK }));
	assert.equal(withStatus.status, 'runtime-error');
	assert.equal(withStatus.exitCode, 1);
	assert.equal(withStatus.output, TRACEBACK);
	assert.equal(withStatus.message, 'Exited with error status 1');
	assert.equal(summarizeResult(pythonAnswer({ code: 2 })).status, 'runtime-error', 'older Piston: no status field');
});

test('summarizeResult: every Piston status code', () => {
	const statusFor = (fields) => summarizeResult(pythonAnswer(fields)).status;
	assert.equal(statusFor({ status: 'TO', signal: 'SIGKILL', code: null, message: 'Time limit exceeded' }), 'timeout');
	assert.equal(statusFor({ status: 'SG', signal: 'SIGSEGV', code: null }), 'killed');
	assert.equal(statusFor({ status: 'OL', signal: 'SIGKILL', code: null }), 'output-limit');
	assert.equal(statusFor({ status: 'EL', signal: 'SIGKILL', code: null }), 'output-limit');
	assert.equal(statusFor({ status: 'XX', code: null }), 'internal-error');
	assert.equal(statusFor({ status: 'RE', code: 1 }), 'runtime-error');
	assert.equal(statusFor({ status: 'constructor', code: 0 }), 'runtime-error', 'an unknown status is a failure, never a prototype lookup');
});

test('summarizeResult: a signal without a status is a kill', () => {
	const summary = summarizeResult(pythonAnswer({ signal: 'SIGKILL', code: null }));
	assert.equal(summary.status, 'killed');
	assert.equal(summary.signal, 'SIGKILL');
	assert.equal(summary.exitCode, null);
});

test('summarizeResult: a failed compile, without a run stage', () => {
	const errors = "main.c:1:1: error: unknown type name 'nt'\n";
	const answer = { compile: stage({ code: 1, status: 'RE', stderr: errors, output: errors, cpu_time: 80, wall_time: 120, memory: 30000000 }), language: 'c', version: '10.2.0' };
	const summary = summarizeResult(answer);
	assert.equal(summary.status, 'compile-error');
	assert.equal(summary.stage, 'compile');
	assert.equal(summary.output, errors);
	assert.equal(summary.compileOutput, errors);
	assert.equal(summary.exitCode, 1);
	assert.equal(summary.cpuMs, 80, "the compiler's numbers");
	assert.equal(summary.language, 'c');
});

test('summarizeResult: a failed compile wins over a placeholder run stage', () => {
	const answer = { compile: stage({ code: 1, output: 'error' }), run: stage({ code: null, output: '' }), language: 'c++', version: '10.2.0' };
	assert.equal(summarizeResult(answer).status, 'compile-error');
	assert.equal(summarizeResult(answer).output, 'error');
});

test('summarizeResult: a compile that timed out or was killed', () => {
	const timedOut = summarizeResult({ compile: stage({ status: 'TO', signal: 'SIGKILL', code: null }), language: 'rust', version: '1.68.2' });
	assert.equal(timedOut.status, 'timeout');
	assert.equal(timedOut.stage, 'compile');
	const killed = summarizeResult({ compile: stage({ status: 'SG', signal: 'SIGKILL', code: null }), language: 'rust', version: '1.68.2' });
	assert.equal(killed.status, 'killed');
	assert.equal(killed.stage, 'compile');
});

test('summarizeResult: a successful compile shows the run; its warnings stay in compileOutput', () => {
	const warning = 'main.c:3:5: warning: unused variable\n';
	const answer = { compile: stage({ output: warning }), run: stage({ output: 'hi\n' }), language: 'c', version: '10.2.0' };
	const summary = summarizeResult(answer);
	assert.equal(summary.status, 'success');
	assert.equal(summary.stage, 'run');
	assert.equal(summary.output, 'hi\n');
	assert.equal(summary.compileOutput, warning);
});

test('summarizeResult: output falls back to stdout + stderr', () => {
	const summary = summarizeResult(pythonAnswer({ output: undefined, stdout: 'out\n', stderr: 'err\n' }));
	assert.equal(summary.output, 'out\nerr\n');
	assert.equal(summarizeResult(pythonAnswer({ output: undefined, stdout: undefined, stderr: undefined })).output, '');
});

test('summarizeResult: missing numbers are null', () => {
	const summary = summarizeResult({ run: { stdout: 'x', output: 'x', code: 0 }, language: 'python', version: '3.12.0' });
	assert.equal(summary.status, 'success');
	assert.equal(summary.cpuMs, null);
	assert.equal(summary.wallMs, null);
	assert.equal(summary.memoryBytes, null);
	assert.equal(summary.signal, null);
	assert.equal(summary.message, null);
});

test('summarizeResult: an answer it cannot read is an internal error, never a throw', () => {
	for (const answer of [null, undefined, 'oops', 42]) {
		const summary = summarizeResult(answer);
		assert.equal(summary.status, 'internal-error', String(answer));
		assert.equal(summary.output, '');
		assert.equal(typeof summary.message, 'string');
	}
	const noRun = summarizeResult({ language: 'python', version: '3.12.0' });
	assert.equal(noRun.status, 'internal-error');
	assert.equal(noRun.language, 'python');
	const withMessage = summarizeResult({ message: 'python-3.10.0 runtime is unknown' });
	assert.equal(withMessage.message, 'python-3.10.0 runtime is unknown');
});

test('describeResult: success and runtime errors show the exit code and the numbers', () => {
	assert.equal(describeResult(summarizeResult(REAL_ANSWER)), 'Exit code 0 · 52 ms CPU · 113 ms total · 13.7 MB');
	const failed = summarizeResult(pythonAnswer({ code: 1, status: 'RE', cpu_time: 1500, wall_time: 2250, memory: 2048 }));
	assert.equal(describeResult(failed), 'Exit code 1 · 1.5 s CPU · 2.3 s total · 2 KB');
});

test('describeResult: only the numbers that are known', () => {
	const summary = summarizeResult({ run: { output: '', code: 0, wall_time: 40 }, language: 'python', version: '3.12.0' });
	assert.equal(describeResult(summary), 'Exit code 0 · 40 ms total');
	const bare = summarizeResult({ run: { output: '' }, language: 'python', version: '3.12.0' });
	assert.equal(describeResult(bare), 'Finished');
});

test('describeResult: time limits, with the limit when it is known', () => {
	const timedOut = summarizeResult(pythonAnswer({ status: 'TO', signal: 'SIGKILL', code: null }));
	assert.equal(describeResult(timedOut, { runTimeout: 3000 }), 'Time limit exceeded (3 s)');
	assert.equal(describeResult(timedOut, { runTimeout: 1500 }), 'Time limit exceeded (1.5 s)');
	assert.equal(describeResult(timedOut), 'Time limit exceeded');
	const compileTimedOut = summarizeResult({ compile: stage({ status: 'TO', code: null }), language: 'rust', version: '1.68.2' });
	assert.equal(describeResult(compileTimedOut, { runTimeout: 3000, compileTimeout: 10000 }), 'Compile time limit exceeded (10 s)');
	assert.equal(describeResult(compileTimedOut, { runTimeout: 3000 }), 'Compile time limit exceeded');
});

test('describeResult: compile errors, kills, output limits, internal errors', () => {
	assert.equal(describeResult(summarizeResult({ compile: stage({ code: 1 }), language: 'c', version: '10.2.0' })), 'Compile error (exit code 1)');
	assert.equal(describeResult({ status: 'compile-error', stage: 'compile', exitCode: null, signal: 'SIGKILL' }), 'Compile error (SIGKILL)');
	assert.equal(describeResult({ status: 'compile-error', stage: 'compile', exitCode: null, signal: null }), 'Compile error');
	assert.equal(describeResult(summarizeResult(pythonAnswer({ status: 'SG', signal: 'SIGKILL', code: null }))), 'Killed (SIGKILL)');
	assert.equal(describeResult({ status: 'killed', stage: 'run', signal: null }), 'Killed');
	assert.equal(describeResult({ status: 'killed', stage: 'compile', signal: 'SIGKILL' }), 'Compile killed (SIGKILL)');
	assert.equal(describeResult(summarizeResult(pythonAnswer({ status: 'OL', signal: 'SIGKILL' }))), 'Output too long');
	assert.equal(describeResult(summarizeResult(pythonAnswer({ status: 'EL' }))), 'Output too long');
	assert.equal(describeResult(summarizeResult(pythonAnswer({ status: 'XX', message: 'isolate failed' }))), 'Internal error on the code runner: isolate failed');
	assert.equal(describeResult(summarizeResult(null)), 'Internal error on the code runner: The code runner sent no result.');
});

test('describeResult: nothing to describe', () => {
	assert.equal(describeResult(null), '');
	assert.equal(describeResult(undefined), '');
});

test('formatMs: ms below a second, seconds from one on', () => {
	assert.equal(formatMs(0), '0 ms');
	assert.equal(formatMs(52), '52 ms');
	assert.equal(formatMs(52.4), '52 ms');
	assert.equal(formatMs(999), '999 ms');
	assert.equal(formatMs(999.6), '1 s', 'rounds to a whole second');
	assert.equal(formatMs(1000), '1 s');
	assert.equal(formatMs(1500), '1.5 s');
	assert.equal(formatMs(3000), '3 s');
	assert.equal(formatMs(12345), '12.3 s');
	assert.equal(formatMs(150000), '150 s');
});

test('formatMs: anything but a number >= 0 is empty', () => {
	for (const value of [null, undefined, Number.NaN, -1, '52', Number.POSITIVE_INFINITY]) assert.equal(formatMs(value), '', String(value));
});

test('formatBytes: units of 1024, one decimal below 100', () => {
	assert.equal(formatBytes(0), '0 B');
	assert.equal(formatBytes(512), '512 B');
	assert.equal(formatBytes(1023), '1023 B');
	assert.equal(formatBytes(1024), '1 KB');
	assert.equal(formatBytes(1536), '1.5 KB');
	assert.equal(formatBytes(150 * 1024), '150 KB');
	assert.equal(formatBytes(14412000), '13.7 MB');
	assert.equal(formatBytes(1024 ** 3), '1 GB');
	assert.equal(formatBytes(1024 ** 5), '1024 TB', 'the largest unit keeps counting');
});

test('formatBytes: anything but a number >= 0 is empty', () => {
	for (const value of [null, undefined, Number.NaN, -5, '1024', Number.POSITIVE_INFINITY]) assert.equal(formatBytes(value), '', String(value));
});
