/**
 * runErrors.test.js — which run-error locations an editor shows, and which of them it squiggles
 * (../runErrors.js), with the REAL Piston answers of lib/codeRunner/__tests__/fixtures/errors
 * read through the library's errorLocations: a failed run shows every location; a successful
 * run nothing — not an error the program caught and printed (Python's traceback.print_exc /
 * logging.exception, Node's console.error(err) / console.trace, Go's log lines) — except Bash's
 * errors ("command not found", also under the name 'sh'), and never a warning (gcc's);
 * TypeScript reads its main.js lines back through the source map; an exercise check reads the
 * reader's own file (solution.py); the syntax errors that stopped a TypeScript run are rows
 * without squiggles; `hideErrors` (a stopped TypeScript run included), a waiting run and no run
 * show nothing. Run with `npm run test:shared`.
 * To change it: a new rule of ../runErrors.js gets a test here; a new real answer goes in
 * lib/codeRunner/__tests__/fixtures/errors.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalPositionFor } from '../lib/codeRunner/sourceMap.js';
import { summarizeResult } from '../lib/codeRunner/result.js';
import { MARKED_AFTER_SUCCESS, NO_LOCATIONS, SEVERITY_ERROR, locationsOfAnswer, sentRecord, shownLocations } from '../runErrors.js';
import { RUN_PHASES } from '../runPhases.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(HERE, '../lib/codeRunner/__tests__/fixtures/errors');

/** A captured answer: { request, response, summary, ... } (the fixture's other keys kept). */
function fixture(name) {
	const data = JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8'));
	return { ...data, summary: summarizeResult(data.response) };
}

/** The text of a file the fixture's request sent (default: the first). */
function sentFile(data, fileName) {
	const file = fileName ? data.request.files.find((candidate) => candidate.name === fileName) : data.request.files[0];
	return file.content;
}

/** What the editor shows for a finished run of `data` with `sent`. */
function shownAfter(data, sent, extra = {}) {
	return shownLocations({ phase: RUN_PHASES.done, summary: data.summary, response: data.response, sent, ...extra });
}

test('a failed run: every location, squiggled (Python 3.11 IndexError at its columns)', () => {
	const data = fixture('python-3.11-index-error');
	const shown = shownAfter(data, sentRecord({ language: 'python', code: sentFile(data) }));
	assert.equal(shown.mark, true);
	assert.equal(shown.locations.length, 1);
	assert.deepEqual(
		{ line: shown.locations[0].line, column: shown.locations[0].column, endColumn: shown.locations[0].endColumn },
		{ line: 2, column: 12, endColumn: 20 },
	);
	assert.match(shown.locations[0].message, /^IndexError: list index out of range$/);
});

test('a successful run: its errors only (Bash carries on after "command not found" and exits 0)', () => {
	const data = fixture('bash-command-not-found');
	assert.equal(data.summary.status, 'success', 'the fixture exits 0');
	const shown = shownAfter(data, sentRecord({ language: 'bash', code: sentFile(data) }));
	assert.equal(shown.mark, true);
	assert.deepEqual(shown.locations.map((location) => [location.line, location.severity]), [[2, SEVERITY_ERROR]]);
});

test("a successful run: Bash's errors under any of its names ('sh' too), and only Bash's", () => {
	const data = fixture('bash-command-not-found');
	const lines = (language) => shownAfter(data, sentRecord({ language, code: sentFile(data) })).locations.map((location) => location.line);
	assert.deepEqual(lines('sh'), [2]);
	assert.deepEqual(lines('shell'), [2]);
	assert.deepEqual(MARKED_AFTER_SUCCESS, ['bash']);
	assert.ok(Object.isFrozen(MARKED_AFTER_SUCCESS));
});

/**
 * A finished run's answer and summary whose stderr is `stderr` and whose exit code is `code`
 * (the stderr below is what Python 3 and Node print, with the paths of the server's box).
 */
function answered(language, stderr, code = 0) {
	const response = { language, version: '1', run: { stdout: '', stderr, output: stderr, code, signal: null, status: code === 0 ? null : 'RE' } };
	return { response, summary: summarizeResult(response) };
}

/** Errors a program caught and printed itself, and then ended well (exit code 0). */
const CAUGHT_AND_PRINTED = Object.freeze([
	{
		what: "Python's traceback.print_exc()",
		language: 'python',
		code: 'import traceback\ntry:\n    [][1]\nexcept IndexError:\n    traceback.print_exc()\n',
		stderr: 'Traceback (most recent call last):\n  File "/box/submission/main.py", line 3, in <module>\n    [][1]\n    ~~^^^\nIndexError: list index out of range\n',
	},
	{
		what: "Python's logging.exception()",
		language: 'python',
		code: 'import logging\ntry:\n    1 / 0\nexcept ZeroDivisionError:\n    logging.exception("could not divide")\n',
		stderr: 'ERROR:root:could not divide\nTraceback (most recent call last):\n  File "/box/submission/main.py", line 3, in <module>\n    1 / 0\n    ~~^~~\nZeroDivisionError: division by zero\n',
	},
	{
		what: "Node's console.error(err) in a catch",
		language: 'javascript',
		code: 'try {\n  JSON.parse("{");\n} catch (err) {\n  console.error(err);\n}\n',
		stderr: "SyntaxError: Expected property name or '}' in JSON at position 1\n    at JSON.parse (<anonymous>)\n    at Object.<anonymous> (/box/submission/main.js:2:8)\n    at Module._compile (node:internal/modules/cjs/loader:1256:14)\n",
	},
	{
		what: "Node's console.trace() (TypeScript runs as Node too)",
		language: 'typescript',
		code: null,
		stderr: 'Trace: f called with 2\n    at f (/box/submission/main.js:2:11)\n    at Object.<anonymous> (/box/submission/main.js:4:1)\n',
	},
	{
		what: "Go's log with Lshortfile (not even a location: the compiler's lines have a column)",
		language: 'go',
		code: null,
		stderr: 'main.go:7: starting\nmain.go:9: x is 3\n',
		failedWouldShow: 0,
	},
]);

for (const { what, language, code, stderr, failedWouldShow = 1 } of CAUGHT_AND_PRINTED) {
	test(`a successful run marks nothing: ${what}`, () => {
		const { response, summary } = answered(language, stderr);
		assert.equal(summary.status, 'success');
		const sent = sentRecord({ language, code, mapLine: language === 'typescript' ? (line) => line : null });
		assert.deepEqual(shownLocations({ phase: RUN_PHASES.done, summary, response, sent }), NO_LOCATIONS);
		const failed = { ...summary, status: 'runtime-error' };
		assert.equal(locationsOfAnswer({ summary: failed, response, sent }).length, failedWouldShow, 'the library reads it: the rule is what leaves it out');
	});
}

test('the same traceback after a FAILED run is marked (the exit code decides, not the text)', () => {
	const printed = CAUGHT_AND_PRINTED[0];
	const { response, summary } = answered('python', printed.stderr, 1);
	const shown = shownLocations({ phase: RUN_PHASES.done, summary, response, sent: sentRecord({ language: 'python', code: printed.code }) });
	assert.equal(shown.mark, true);
	assert.deepEqual(shown.locations.map((location) => [location.line, location.message]), [[3, 'IndexError: list index out of range']]);
});

test("a successful run: Go's real log lines (the server's answer) mark nothing", () => {
	const data = fixture('go-log-shortfile');
	assert.equal(data.summary.status, 'success');
	assert.deepEqual(shownAfter(data, sentRecord({ language: 'go', code: sentFile(data) })), NO_LOCATIONS);
});

test('a successful run: never its warnings (gcc warns, the program compiled and ran)', () => {
	const data = fixture('c-warning-only');
	assert.equal(data.summary.status, 'success');
	const sent = sentRecord({ language: 'c', code: 'int main(void) {\n    puts("hi");\n    return 0;\n}\n' });
	assert.equal(locationsOfAnswer({ summary: { ...data.summary, status: 'runtime-error' }, response: data.response, sent }).length, 1, 'a failed run would show the warning');
	assert.deepEqual(shownAfter(data, sent), NO_LOCATIONS);
});

test("TypeScript: Node's main.js line goes back to the reader's TypeScript line through the source map", () => {
	const data = fixture('typescript-node-20-source-map');
	const mapLine = (line, column) => originalPositionFor(data.map, line, column)?.line ?? null;
	const shown = shownAfter(data, sentRecord({ language: 'typescript', mapLine }));
	assert.equal(shown.mark, true);
	assert.deepEqual(shown.locations.map((location) => [location.line, location.column, location.message]), [[7, null, 'Error: order 7 is empty']]);
});

test("an exercise check: only the reader's own file counts (solution.py), with its own line numbers", () => {
	const data = fixture('python-3.12-exercise-runtime-error');
	const sent = sentRecord({ language: 'python', code: sentFile(data, 'solution.py'), fileName: 'solution.py' });
	const shown = shownAfter(data, sent);
	assert.deepEqual(shown.locations.map((location) => [location.line, location.column, location.message]), [[2, 12, 'IndexError: list index out of range']]);
	// Read as main.py it would mark the harness's `print(first([]))` (also on line 2, at column 7).
	const asIfMain = shownAfter(data, sentRecord({ language: 'python', code: sentFile(data) }));
	assert.notDeepEqual(asIfMain.locations.map((location) => location.column), [12], "the harness's frame, not the reader's");
});

test('a TypeScript run stopped by syntax errors: the rows, without squiggles (Monaco already squiggles them)', () => {
	const blocked = [{ line: 3, column: 9, endColumn: 10, message: "';' expected.", severity: 'error', stage: 'compile' }];
	const shown = shownLocations({ phase: RUN_PHASES.failed, summary: null, response: null, sent: sentRecord({ language: 'typescript', blockedLocations: blocked }) });
	assert.deepEqual(shown, { locations: blocked, mark: false });
	const otherFailure = shownLocations({ phase: RUN_PHASES.failed, summary: null, response: null, sent: sentRecord({ language: 'python', code: 'x' }) });
	assert.deepEqual(otherFailure, NO_LOCATIONS, 'a request that failed (no answer) has no locations');
});

test('hideErrors hides the rows of a TypeScript run stopped by syntax errors too (its notice says where)', () => {
	const blocked = [{ line: 2, column: 11, endColumn: 12, message: 'Expression expected.', severity: 'error', stage: 'compile' }];
	const sent = sentRecord({ language: 'typescript', blockedLocations: blocked });
	assert.deepEqual(shownLocations({ hideErrors: true, phase: RUN_PHASES.failed, summary: null, response: null, sent }), NO_LOCATIONS);
	assert.deepEqual(shownLocations({ phase: RUN_PHASES.failed, summary: null, response: null, sent }), { locations: blocked, mark: false }, 'without hideErrors: the rows');
});

test('hideErrors, a waiting run, a stopped run, no run: nothing', () => {
	const data = fixture('python-3.11-index-error');
	const sent = sentRecord({ language: 'python', code: sentFile(data) });
	assert.deepEqual(shownAfter(data, sent, { hideErrors: true }), NO_LOCATIONS);
	for (const phase of [RUN_PHASES.idle, RUN_PHASES.running, RUN_PHASES.stopped]) {
		assert.deepEqual(shownLocations({ phase, summary: data.summary, response: data.response, sent }), NO_LOCATIONS, phase);
	}
	assert.deepEqual(shownLocations({ phase: RUN_PHASES.done, summary: data.summary, response: data.response, sent: null }), NO_LOCATIONS, 'nothing was sent');
	assert.deepEqual(locationsOfAnswer({ summary: null, response: null, sent }), []);
});

test('sentRecord: every field present, with the defaults for what was not given', () => {
	assert.deepEqual(sentRecord({ language: 'go' }), { language: 'go', code: null, fileName: null, lineOffset: 0, mapLine: null, blockedLocations: [] });
});
