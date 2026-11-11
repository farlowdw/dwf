/**
 * output.test.js — what "Copy output" copies (output.js > copyableOutput): exactly what the
 * output area shows (OutputPanel.jsx > RunOutput). Run with `npm run test:shared`.
 * To change it: a new kind of output in OutputPanel.jsx > RunOutput gets a case here, so Copy output
 * copies it too.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { copyableOutput } from '../output.js';

test('no run yet, or a run with no answer: nothing to copy', () => {
	assert.equal(copyableOutput(null), '');
	assert.equal(copyableOutput(undefined), '');
});

test("a run's output is copied as it is", () => {
	assert.equal(copyableOutput({ stage: 'run', output: '[1, 4, 9]\n' }), '[1, 4, 9]\n');
	assert.equal(copyableOutput({ stage: 'run', output: '' }), '', 'a program that printed nothing: nothing to copy');
});

test("a compiled language's warnings come first, as the output area shows them", () => {
	const summary = { stage: 'run', compileOutput: 'main.c:1:5: warning: …', output: 'sum = 55\n' };
	assert.equal(copyableOutput(summary), 'main.c:1:5: warning: …\nsum = 55\n');
});

test('a failed compile: the output area shows the compiler output once, so it is copied once', () => {
	const summary = { stage: 'compile', compileOutput: 'main.c:1:17: error: …', output: 'main.c:1:17: error: …' };
	assert.equal(copyableOutput(summary), 'main.c:1:17: error: …');
});
