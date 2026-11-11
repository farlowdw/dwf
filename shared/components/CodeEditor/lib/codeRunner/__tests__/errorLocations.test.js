/**
 * errorLocations.test.js — where a failed run went wrong (../errorLocations.js): the exact
 * locations in every real Piston answer of fixtures/errors (Python 3.9-3.12 tracebacks and
 * SyntaxErrors, Node 16/18/20 stacks and headers, gcc / g++ errors and warnings, a failed
 * assert(), Go's compiler and panics — and Go's `log` lines, which are none — Bash), the
 * reader's file against the harness's in exercise checks (exercise.js's C layout with `#line`,
 * too), TypeScript's lines through a real source map (../sourceMap.js), columns with and without
 * the code (Python's indentation and code points, 3.9's caret in bytes, gcc's and Go's byte
 * columns), lineOffset and mapLine, which stage each reader reads, sorting, duplicates, the cap
 * (an error never pushed out by warnings), answers it cannot read, Node frames read in two steps,
 * and a 64 KB line made to trip each reader, read in a few milliseconds of CPU time (LINEAR TIME,
 * below). Run with `npm run test:shared`.
 * To change it: a new reader in ../errorLocations.js gets a test here, and a new fixture its entry in
 * EXPECTED (A NEW FIXTURE, below).
 *
 * The fixtures are { request, status, response } (a TypeScript one also holds the TypeScript
 * and its source `map`). ../../../components/CodeEditor/__tests__ (runMarkers, errorList) read
 * every fixture of the folder too, with the first file's text as the code.
 *
 * A NEW FIXTURE (a real answer of a Piston server; never print its address or secret)
 *   With the address in $base and the secret in $secret:
 *     curl -s "$base/api/v2/execute" -H 'content-type: application/json' \
 *       -H "x-piston-proxy-secret: $secret" \
 *       -d '{"language":"python","version":"3.12.0","files":[{"name":"main.py","content":"print(y)\n"}]}'
 *   Save fixtures/errors/<language>-<version>-<what>.json as
 *     { "request": <the request>, "status": 200, "response": <the answer> }
 *   and add its expected locations to EXPECTED below: the first test fails until every fixture
 *   has an entry. A small server runs one job at a time: keep such runs few and small.
 *
 * LINEAR TIME  Each "linear time" test times ONE errorLocations() call by the CPU time this
 *   process spent in it (process.cpuUsage), not by the clock: a process taken off the CPU for
 *   100 ms by a busy machine (a stall adds no CPU time) once turned a 1 ms call red at 105 ms, in
 *   test:shared, where it gates shared:verify and shared:push. A slow reader still goes red: the
 *   old, quadratic patterns spent 0.2 to 0.6 s of CPU on these lines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorLocations } from '../errorLocations.js';
import { originalLineFor } from '../sourceMap.js';

/** The folder of the real answers. */
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/errors/', import.meta.url));

/** A location, with the defaults filled in (no column, an error). */
function loc({ line, column = null, endColumn = null, message, severity = 'error', stage }) {
	return { line, column, endColumn, message, severity, stage };
}

/**
 * The expected locations of every fixture, and how the editor calls errorLocations for it:
 *   readerFile  the name of the reader's file in the request (default: the first file); its
 *               content is passed as `code`
 *   code        the reader's code itself, when no file of the request is exactly it (exercise.js's
 *               C layout sends it inside `reader`, behind a guard and `#line 1 "solution.c"`)
 *   fileName    what the editor passes (default: none, so the language's own file name)
 *   language    what the editor passes (default: the request's language)
 *   sourceMap   the fixture's key holding a source map: mapLine is then that map's
 *               originalLineFor (TypeScript run as JavaScript)
 */
const EXPECTED = Object.freeze({
	'bash-command-not-found': {
		locations: [loc({ line: 2, message: 'foo_not_a_command: command not found', stage: 'run' })],
	},
	'bash-exercise-sourced-error': {
		readerFile: 'solution.sh',
		fileName: 'solution.sh',
		locations: [loc({ line: 2, message: 'not_a_command_here: command not found', stage: 'run' })],
	},
	'bash-heredoc-warning': {
		// Bash's own warning (the run exits 0).
		locations: [loc({ line: 2, message: "warning: here-document at line 1 delimited by end-of-file (wanted `EOF')", severity: 'warning', stage: 'run' })],
	},
	'bash-syntax-error': {
		locations: [loc({ line: 3, message: "syntax error near unexpected token `fi'", stage: 'run' })],
	},
	'c-assert': {
		// glibc's line in the run stage; the run script's "Aborted (core dumped)" line is no location.
		locations: [loc({ line: 4, message: "Assertion `x > 0' failed.", stage: 'run' })],
	},
	'c-compile-error': {
		locations: [
			loc({ line: 3, column: 13, endColumn: 14, message: "'y' undeclared (first use in this function)", stage: 'compile' }),
			loc({ line: 4, column: 22, endColumn: 23, message: "expected ';' before 'return'", stage: 'compile' }),
		],
	},
	'c-exercise-compile-error': {
		readerFile: 'solution',
		fileName: 'solution.c',
		locations: [loc({ line: 2, column: 16, endColumn: 17, message: "'c' undeclared (first use in this function)", stage: 'compile' })],
	},
	'c-exercise-line-directive': {
		// exercise.js's C layout: gcc names solution.c (from `#line`), with no source display.
		code: '#include <stdio.h>\n\nint add(int a, int b) {\n    return a + c;\n}\n',
		fileName: 'solution.c',
		locations: [loc({ line: 4, column: 16, message: "'c' undeclared (first use in this function)", stage: 'compile' })],
	},
	'c-non-ascii-column': {
		// gcc says column 31 (bytes: each "é" is two); the reader's `y` is character 29.
		locations: [loc({ line: 2, column: 29, endColumn: 30, message: "'y' undeclared (first use in this function)", stage: 'compile' })],
	},
	'c-missing-includes-plus-error': {
		// No #include: eleven warnings (two per library function but puts) above the one error.
		locations: [
			loc({ line: 2, column: 18, endColumn: 24, message: "implicit declaration of function 'malloc' [-Wimplicit-function-declaration]", severity: 'warning', stage: 'compile' }),
			loc({ line: 2, column: 18, message: "incompatible implicit declaration of built-in function 'malloc'", severity: 'warning', stage: 'compile' }),
			loc({ line: 3, column: 5, endColumn: 11, message: "implicit declaration of function 'strcpy' [-Wimplicit-function-declaration]", severity: 'warning', stage: 'compile' }),
			loc({ line: 3, column: 5, message: "incompatible implicit declaration of built-in function 'strcpy'", severity: 'warning', stage: 'compile' }),
			loc({ line: 4, column: 5, endColumn: 11, message: "implicit declaration of function 'printf' [-Wimplicit-function-declaration]", severity: 'warning', stage: 'compile' }),
			loc({ line: 4, column: 5, message: "incompatible implicit declaration of built-in function 'printf'", severity: 'warning', stage: 'compile' }),
			loc({ line: 4, column: 46, endColumn: 52, message: "implicit declaration of function 'strlen' [-Wimplicit-function-declaration]", severity: 'warning', stage: 'compile' }),
			loc({ line: 4, column: 46, message: "incompatible implicit declaration of built-in function 'strlen'", severity: 'warning', stage: 'compile' }),
			loc({ line: 5, column: 5, endColumn: 9, message: "implicit declaration of function 'puts' [-Wimplicit-function-declaration]", severity: 'warning', stage: 'compile' }),
			loc({ line: 6, column: 5, endColumn: 9, message: "implicit declaration of function 'free' [-Wimplicit-function-declaration]", severity: 'warning', stage: 'compile' }),
			loc({ line: 6, column: 5, message: "incompatible implicit declaration of built-in function 'free'", severity: 'warning', stage: 'compile' }),
			loc({ line: 7, column: 12, endColumn: 17, message: "'count' undeclared (first use in this function)", stage: 'compile' }),
		],
	},
	'c-segfault': { locations: [] },
	'c-warning-only': {
		locations: [
			loc({ line: 2, column: 5, endColumn: 9, message: "implicit declaration of function 'puts' [-Wimplicit-function-declaration]", severity: 'warning', stage: 'compile' }),
		],
	},
	'cpp-assert': {
		// g++ names the function's whole signature before the assertion's words.
		locations: [loc({ line: 3, message: 'Assertion `x > 0 && "x must be positive"\' failed.', stage: 'run' })],
	},
	'cpp-compile-error': {
		locations: [loc({ line: 5, column: 33, endColumn: 34, message: "no matching function for call to 'std::vector<int>::push_back(std::string)'", stage: 'compile' })],
	},
	'cpp-runtime-exception': { locations: [] },
	'go-compile-error': {
		locations: [loc({ line: 6, column: 14, message: 'undefined: x', stage: 'compile' })],
	},
	'go-exercise-compile-error': {
		readerFile: 'solution.go',
		fileName: 'solution.go',
		locations: [loc({ line: 4, column: 13, message: 'undefined: c', stage: 'compile' })],
	},
	'go-log-shortfile': {
		// log.Lshortfile: `main.go:7: starting` (exit 0) is the program's output, not the compiler's.
		locations: [],
	},
	'go-non-ascii-column': {
		// Go says column 30 (bytes); the reader's `x` is character 28.
		locations: [loc({ line: 6, column: 28, message: 'undefined: x', stage: 'compile' })],
	},
	'go-panic': {
		locations: [loc({ line: 8, message: 'panic: runtime error: index out of range [5] with length 3', stage: 'run' })],
	},
	'go-panic-nested': {
		locations: [loc({ line: 6, message: 'panic: runtime error: index out of range [3] with length 1', stage: 'run' })],
	},
	'go-unused-import': {
		locations: [loc({ line: 5, column: 2, message: 'imported and not used: "os"', stage: 'compile' })],
	},
	'javascript-16-throw-in-function': {
		locations: [loc({ line: 2, column: 9, message: 'Error: boom', stage: 'run' })],
	},
	'javascript-18-syntax-error': {
		locations: [loc({ line: 2, column: 11, endColumn: 12, message: "SyntaxError: Unexpected token ';'", stage: 'compile' })],
	},
	'javascript-20-assert-multiline': {
		// The header names node:assert; the message is its first line, not "2 !== 3" above the stack.
		locations: [loc({ line: 2, column: 8, message: 'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:', stage: 'run' })],
	},
	'javascript-20-builtin-throw': {
		locations: [loc({ line: 2, column: 19, message: "SyntaxError: Expected property name or '}' in JSON at position 1", stage: 'run' })],
	},
	'javascript-20-exercise-vm-syntax-error': {
		readerFile: 'solution.js',
		fileName: 'solution.js',
		locations: [loc({ line: 2, column: 17, endColumn: 18, message: "SyntaxError: Unexpected token ';'", stage: 'compile' })],
	},
	'javascript-20-exercise-vm-throw': {
		readerFile: 'solution.js',
		fileName: 'solution.js',
		locations: [loc({ line: 2, column: 33, message: 'RangeError: empty', stage: 'run' })],
	},
	'javascript-20-reference-error': {
		locations: [loc({ line: 2, column: 13, message: 'ReferenceError: b is not defined', stage: 'run' })],
	},
	'javascript-20-syntax-error': {
		locations: [loc({ line: 2, column: 11, endColumn: 12, message: "SyntaxError: Unexpected token ';'", stage: 'compile' })],
	},
	'javascript-20-throw-in-function': {
		locations: [loc({ line: 2, column: 9, message: 'Error: boom', stage: 'run' })],
	},
	'javascript-20-throw-string': {
		locations: [loc({ line: 2, column: 3, endColumn: 4, message: 'oops', stage: 'run' })],
	},
	'python-3.10-syntax-error-indented': {
		locations: [loc({ line: 2, column: 15, endColumn: 16, message: 'SyntaxError: invalid syntax', stage: 'compile' })],
	},
	'python-3.11-index-error': {
		locations: [loc({ line: 2, column: 12, endColumn: 20, message: 'IndexError: list index out of range', stage: 'run' })],
	},
	'python-3.12-astral-column': {
		// `"🎉" + 1`: 7 code points under Python's markers, 8 UTF-16 units in Monaco (the emoji is 2).
		locations: [loc({ line: 1, column: 5, endColumn: 13, message: 'TypeError: can only concatenate str (not "int") to str', stage: 'run' })],
	},
	'python-3.12-chained-exception': {
		locations: [loc({ line: 4, message: 'ValueError: no key', stage: 'run' })],
	},
	'python-3.12-exercise-runtime-error': {
		readerFile: 'solution.py',
		fileName: 'solution.py',
		locations: [loc({ line: 2, column: 12, endColumn: 20, message: 'IndexError: list index out of range', stage: 'run' })],
	},
	'python-3.12-exercise-syntax-error': {
		readerFile: 'solution.py',
		fileName: 'solution.py',
		locations: [loc({ line: 2, column: 17, endColumn: 18, message: "SyntaxError: '[' was never closed", stage: 'compile' })],
	},
	'python-3.12-indentation-error': {
		locations: [loc({ line: 2, column: 1, endColumn: 2, message: 'IndentationError: expected an indented block after function definition on line 1', stage: 'compile' })],
	},
	'python-3.12-index-error': {
		// `items[i]` of "    return items[i]": Python's markers `~~~~~^^^` count from `return`.
		locations: [loc({ line: 2, column: 12, endColumn: 20, message: 'IndexError: list index out of range', stage: 'run' })],
	},
	'python-3.12-name-error': {
		locations: [loc({ line: 2, column: 7, endColumn: 8, message: "NameError: name 'y' is not defined", stage: 'run' })],
	},
	'python-3.12-output-then-error': {
		locations: [loc({ line: 3, message: 'ValueError: bad value', stage: 'run' })],
	},
	'python-3.12-stdlib-frame': {
		locations: [loc({ line: 3, message: 'json.decoder.JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)', stage: 'run' })],
	},
	'python-3.12-syntax-error': {
		locations: [loc({ line: 2, column: 7, endColumn: 8, message: 'SyntaxError: invalid syntax', stage: 'compile' })],
	},
	'python-3.12-syntax-error-indented': {
		locations: [loc({ line: 2, column: 15, endColumn: 16, message: 'SyntaxError: invalid syntax', stage: 'compile' })],
	},
	'python-3.9-index-error': {
		locations: [loc({ line: 2, message: 'IndexError: list index out of range', stage: 'run' })],
	},
	'python-3.9-syntax-error': {
		locations: [loc({ line: 2, column: 7, endColumn: 8, message: 'SyntaxError: invalid syntax', stage: 'compile' })],
	},
	'python-3.9-syntax-error-wide': {
		// `print("日本" 1)`: 3.9's caret stands under byte 16 (each CJK character is 3 bytes); the `1` is character 12.
		locations: [loc({ line: 1, column: 12, endColumn: 13, message: 'SyntaxError: invalid syntax', stage: 'compile' })],
	},
	'python-3.9-syntax-error-indented': {
		locations: [loc({ line: 2, column: 15, endColumn: 16, message: 'SyntaxError: invalid syntax', stage: 'compile' })],
	},
	'typescript-node-20-source-map': {
		// main.js line 6 (the throw) is TypeScript line 7; the columns describe the JavaScript, so none.
		language: 'typescript',
		fileName: 'main.js',
		sourceMap: 'map',
		locations: [loc({ line: 7, message: 'Error: order 7 is empty', stage: 'run' })],
	},
});

/** The fixture names of the folder (file names without .json). */
function fixtureNames() {
	return fs.readdirSync(FIXTURES_DIR).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, '')).sort();
}

/** A fixture: { request, status, response }. */
function loadFixture(name) {
	return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf8'));
}

/** The content of a file of the fixture's request (default: the first file). */
function fileContent(request, fileName) {
	const file = fileName === undefined ? request.files[0] : request.files.find((candidate) => candidate.name === fileName);
	assert.ok(file, `the request has a file named ${fileName}`);
	return file.content;
}

/** The mapLine of a fixture whose EXPECTED entry names its source map, else undefined. */
function mapLineOf(fixture, sourceMapKey) {
	if (sourceMapKey === undefined) return undefined;
	return (line) => originalLineFor(fixture[sourceMapKey], line);
}

/** errorLocations() of a fixture, as the editor would call it (overridden by `options`). */
function locationsOf(name, options = {}) {
	const fixture = loadFixture(name);
	const { request, response } = fixture;
	const expected = EXPECTED[name] ?? {};
	const defaults = {
		language: expected.language ?? request.language,
		fileName: expected.fileName,
		code: expected.code ?? fileContent(request, expected.readerFile),
		mapLine: mapLineOf(fixture, expected.sourceMap),
	};
	return errorLocations(response, { ...defaults, ...options });
}

/** A Piston answer whose run wrote `stderr` (and failed). */
function runAnswer(stderr, language = 'python') {
	return { language, version: '1', run: { stdout: '', stderr, output: stderr, code: 1, signal: null, status: 'RE' } };
}

/** A Piston answer whose compile stage wrote `stderr` (and failed, so there is no real run). */
function compileAnswer(stderr, language = 'c') {
	const failed = { stdout: '', stderr, output: stderr, code: 1, signal: null, status: 'RE' };
	return { language, version: '10.2.0', compile: failed, run: { ...failed } };
}

test('every fixture has its expected locations, and every expectation its fixture', () => {
	const names = fixtureNames();
	assert.ok(names.length > 0, 'the fixtures are there');
	for (const name of names) assert.ok(Object.hasOwn(EXPECTED, name), `${name}.json has no entry in EXPECTED`);
	for (const name of Object.keys(EXPECTED)) assert.ok(names.includes(name), `EXPECTED names ${name}, but there is no ${name}.json`);
});

for (const name of Object.keys(EXPECTED)) {
	test(`fixture ${name}: the exact locations`, () => {
		assert.deepEqual(locationsOf(name), EXPECTED[name].locations);
	});
}

test('the reader file, not the harness: an exercise check names the harness only when asked for it', () => {
	assert.deepEqual(locationsOf('python-3.12-exercise-runtime-error', { fileName: 'main.py', code: undefined }), [
		loc({ line: 2, message: 'IndexError: list index out of range', stage: 'run' }),
	]);
	assert.deepEqual(locationsOf('javascript-20-exercise-vm-throw', { fileName: 'main.js', code: undefined }), [
		loc({ line: 4, column: 13, message: 'RangeError: empty', stage: 'run' }),
	]);
	assert.deepEqual(locationsOf('c-exercise-compile-error', { fileName: 'main.c' }), []);
	assert.deepEqual(locationsOf('go-exercise-compile-error', { fileName: 'main.go' }), []);
	assert.deepEqual(locationsOf('bash-exercise-sourced-error', { fileName: 'main.sh' }), []);
});

test("fileName: languages.js's submitName ('main') gets the language's extension; a path counts by its name", () => {
	const expected = EXPECTED['c-compile-error'].locations;
	assert.deepEqual(locationsOf('c-compile-error', { fileName: 'main' }), expected);
	assert.deepEqual(locationsOf('c-compile-error', { fileName: '/box/submission/main.c' }), expected);
	assert.deepEqual(locationsOf('c-compile-error', { fileName: '  main.c  ' }), expected);
	assert.deepEqual(locationsOf('c-compile-error', { fileName: 'other.c' }), []);
	assert.deepEqual(locationsOf('cpp-compile-error', { fileName: 'main' }), EXPECTED['cpp-compile-error'].locations);
	assert.deepEqual(locationsOf('go-compile-error', { fileName: 'main' }), EXPECTED['go-compile-error'].locations);
	assert.deepEqual(locationsOf('c-exercise-compile-error', { fileName: 'solution' }), EXPECTED['c-exercise-compile-error'].locations);
});

test('language: any name languages.js knows; TypeScript reads Node and defaults to main.js', () => {
	const expected = EXPECTED['javascript-20-throw-in-function'].locations;
	assert.deepEqual(locationsOf('javascript-20-throw-in-function', { language: 'JS' }), expected);
	assert.deepEqual(locationsOf('javascript-20-throw-in-function', { language: 'node' }), expected);
	assert.deepEqual(locationsOf('javascript-20-throw-in-function', { language: 'typescript' }), expected);
	assert.deepEqual(locationsOf('python-3.12-name-error', { language: 'py' }), EXPECTED['python-3.12-name-error'].locations);
	assert.deepEqual(locationsOf('cpp-compile-error', { language: 'cpp' }), EXPECTED['cpp-compile-error'].locations);
	assert.deepEqual(locationsOf('bash-command-not-found', { language: 'sh' }), EXPECTED['bash-command-not-found'].locations);
});

test('without the code: Python has no columns, gcc and Go keep their byte columns', () => {
	assert.deepEqual(locationsOf('python-3.12-index-error', { code: undefined }), [loc({ line: 2, message: 'IndexError: list index out of range', stage: 'run' })]);
	assert.deepEqual(locationsOf('python-3.12-syntax-error-indented', { code: undefined }), [loc({ line: 2, message: 'SyntaxError: invalid syntax', stage: 'compile' })]);
	assert.deepEqual(locationsOf('c-non-ascii-column', { code: undefined }), [
		loc({ line: 2, column: 31, endColumn: 32, message: "'y' undeclared (first use in this function)", stage: 'compile' }),
	]);
	assert.deepEqual(locationsOf('go-non-ascii-column', { code: undefined }), [loc({ line: 6, column: 30, message: 'undefined: x', stage: 'compile' })]);
	assert.deepEqual(locationsOf('javascript-20-reference-error', { code: undefined }), EXPECTED['javascript-20-reference-error'].locations, 'Node needs no code');
});

test("Python: code that is not what ran gives no columns (the line is never guessed)", () => {
	const changed = 'def get(items, i):\n    return items[i + 0]\n\nvalues = [1, 2, 3]\nprint(get(values, 5))\n';
	assert.deepEqual(locationsOf('python-3.12-index-error', { code: changed }), [loc({ line: 2, message: 'IndexError: list index out of range', stage: 'run' })]);
});

test('Python: tabs as indentation count as one character each', () => {
	const stderr = '  File "/box/submission/main.py", line 2\n    return x +* 2\n              ^\nSyntaxError: invalid syntax\n';
	assert.deepEqual(errorLocations(runAnswer(stderr), { language: 'python', code: 'def f(x):\n\t\treturn x +* 2\n' }), [
		loc({ line: 2, column: 13, endColumn: 14, message: 'SyntaxError: invalid syntax', stage: 'compile' }),
	]);
});

test("Python: a library file named like the reader's (unittest/main.py) is not the reader's", () => {
	const stderr = [
		'Traceback (most recent call last):',
		'  File "/box/submission/main.py", line 7, in <module>',
		'    unittest.main()',
		'  File "/piston/packages/python/3.12.0/lib/python3.12/unittest/main.py", line 105, in __init__',
		'    self.runTests()',
		'SystemExit: 1',
		'',
	].join('\n');
	assert.deepEqual(errorLocations(runAnswer(stderr), { language: 'python' }), [loc({ line: 7, message: 'SystemExit: 1', stage: 'run' })]);
});

test("older Piston's job folder (/piston/jobs/<id>/) counts as the run's directory", () => {
	const stderr = 'Traceback (most recent call last):\n  File "/piston/jobs/x/main.py", line 1, in <module>\nZeroDivisionError: division by zero\n';
	assert.deepEqual(errorLocations(runAnswer(stderr), { language: 'python' }), [loc({ line: 1, message: 'ZeroDivisionError: division by zero', stage: 'run' })]);
	const elsewhere = stderr.replace('/piston/jobs/x/main.py', '/tmp/x/main.py');
	assert.deepEqual(errorLocations(runAnswer(elsewhere), { language: 'python' }), []);
});

test('no words in the output: the fallback words, per severity', () => {
	const stderr = 'Traceback (most recent call last):\n  File "/box/submission/main.py", line 3, in <module>\n    f()\n';
	assert.deepEqual(errorLocations(runAnswer(stderr), { language: 'python' }), [loc({ line: 3, message: 'Error', stage: 'run' })], 'a traceback cut short');
	const gcc = 'main.c:2:5: warning: \n';
	assert.deepEqual(errorLocations(compileAnswer(gcc), { language: 'c' }), [loc({ line: 2, column: 5, message: 'Warning', severity: 'warning', stage: 'compile' })]);
});

test("Node: a frame given as a file URL (ES modules) is the reader's", () => {
	const stderr = 'Error: boom\n    at f (file:///box/submission/main.js:3:9)\n    at file:///box/submission/main.js:5:1\n';
	assert.deepEqual(errorLocations(runAnswer(stderr, 'javascript'), { language: 'javascript' }), [loc({ line: 3, column: 9, message: 'Error: boom', stage: 'run' })]);
});

test("Node: the message after another file's header is the last error's own, never an earlier one's", () => {
	const rejection = [
		'Error: logged first',
		'    at /box/submission/main.js:1:20',
		'node:internal/process/promises:288',
		'            triggerUncaughtException(err, true /* fromPromise */);',
		'            ^',
		'',
		'TypeError: thrown later',
		'    at g (/box/submission/main.js:5:9)',
		'',
	].join('\n');
	assert.deepEqual(errorLocations(runAnswer(rejection, 'javascript'), { language: 'javascript' }), [
		loc({ line: 5, column: 9, message: 'TypeError: thrown later', stage: 'run' }),
	]);
	const noHeader = [
		'node:assert:126',
		'  throw new AssertionError(obj);',
		'  ^',
		'',
		'AssertionError [ERR_ASSERTION]: first',
		'    at /box/submission/main.js:2:8',
		'Error: no header of its own, at step:3',
		'    at /box/submission/main.js:7:3',
		'',
	].join('\n');
	assert.deepEqual(errorLocations(runAnswer(noHeader, 'javascript'), { language: 'javascript' }), [
		loc({ line: 7, column: 3, message: 'Error: no header of its own, at step:3', stage: 'run' }),
	]);
});

test('Python: code points become UTF-16 columns, a caret past the end of the line included', () => {
	const afterEmoji = '  File "/box/submission/main.py", line 1\n    print("\u{1F389}" +* 2)\n               ^\nSyntaxError: invalid syntax\n';
	assert.deepEqual(errorLocations(runAnswer(afterEmoji), { language: 'python', code: 'print("\u{1F389}" +* 2)\n' }), [
		loc({ line: 1, column: 13, endColumn: 14, message: 'SyntaxError: invalid syntax', stage: 'compile' }),
	], 'the caret is under `*`, the 12th code point, UTF-16 column 13');
	const pastEnd = '  File "/box/submission/main.py", line 1\n    x = "\u{1F389}" +\n             ^\nSyntaxError: invalid syntax\n';
	assert.deepEqual(errorLocations(runAnswer(pastEnd), { language: 'python', code: 'x = "\u{1F389}" +\n' }), [
		loc({ line: 1, column: 11, endColumn: 12, message: 'SyntaxError: invalid syntax', stage: 'compile' }),
	], 'just past the end: 9 code points, 10 UTF-16 units, column 11');
});

test('Go: a deadlock (fatal error) names its first frame in the reader\'s file', () => {
	const stderr = 'fatal error: all goroutines are asleep - deadlock!\n\ngoroutine 1 [chan receive]:\nmain.main()\n\t/box/submission/main.go:5 +0x45\nexit status 2\n';
	assert.deepEqual(errorLocations(runAnswer(stderr, 'go'), { language: 'go' }), [loc({ line: 5, message: 'fatal error: all goroutines are asleep - deadlock!', stage: 'run' })]);
});

test("Bash: only a syntax error's echo of its line is dropped", () => {
	const stderr = "main.sh: line 4: `x': not a valid identifier\nmain.sh: line 4: `y': not a valid identifier\n";
	assert.deepEqual(errorLocations(runAnswer(stderr, 'bash'), { language: 'bash' }), [
		loc({ line: 4, message: "`x': not a valid identifier", stage: 'run' }),
		loc({ line: 4, message: "`y': not a valid identifier", stage: 'run' }),
	]);
});

test('gcc: a column after a 4-byte character (an emoji, two UTF-16 units)', () => {
	const code = 'int main(void) {\n    char *s = "\u{1F600}"; int x = y;\n}\n';
	const stderr = "main.c:2:31: error: 'y' undeclared (first use in this function)\n";
	assert.deepEqual(errorLocations(compileAnswer(stderr), { language: 'c', code }), [
		loc({ line: 2, column: 29, message: "'y' undeclared (first use in this function)", stage: 'compile' }),
	]);
});

test('gcc: a range with marks before the caret (`~~~^~~`) starts at its first mark; a missing column is null', () => {
	// The caret is on `<` (column 9); the marks cover `i < n + 1u`, columns 7-16.
	const stderr = [
		'main.c:3:9: warning: comparison of integer expressions of different signedness [-Wsign-compare]',
		'    3 |   if (i < n + 1u) return;',
		'      |       ~~^~~~~~~~',
		'main.c:5: error: something without a column',
		'',
	].join('\n');
	assert.deepEqual(errorLocations(compileAnswer(stderr), { language: 'c' }), [
		loc({ line: 3, column: 7, endColumn: 17, message: 'comparison of integer expressions of different signedness [-Wsign-compare]', severity: 'warning', stage: 'compile' }),
		loc({ line: 5, message: 'something without a column', stage: 'compile' }),
	]);
});

test('lineOffset: lines added above the reader\'s code are taken off; a location inside them is dropped', () => {
	assert.deepEqual(locationsOf('c-compile-error', { lineOffset: 1 }).map(({ line }) => line), [2, 3]);
	assert.deepEqual(locationsOf('c-compile-error', { lineOffset: 3 }).map(({ line }) => line), [1]);
	assert.deepEqual(locationsOf('c-compile-error', { lineOffset: 4 }), []);
	for (const bad of [-1, 1.5, '2', null]) {
		assert.deepEqual(locationsOf('c-compile-error', { lineOffset: bad }), EXPECTED['c-compile-error'].locations, `lineOffset ${bad} counts as 0`);
	}
});

test('mapLine: applied after lineOffset; columns become null; null or a bad line drops the location', () => {
	const seen = [];
	const mapped = locationsOf('javascript-20-throw-in-function', {
		lineOffset: 1,
		mapLine: (line) => {
			seen.push(line);
			return line + 10;
		},
	});
	assert.deepEqual(seen, [1]);
	assert.deepEqual(mapped, [loc({ line: 11, message: 'Error: boom', stage: 'run' })]);
	assert.deepEqual(locationsOf('javascript-20-throw-in-function', { mapLine: () => null }), []);
	assert.deepEqual(locationsOf('javascript-20-throw-in-function', { mapLine: () => 0 }), []);
	assert.deepEqual(locationsOf('javascript-20-throw-in-function', { mapLine: () => 2.5 }), []);
	assert.deepEqual(locationsOf('javascript-20-throw-in-function', { mapLine: 'not a function' }), EXPECTED['javascript-20-throw-in-function'].locations);
});

test("mapLine: the code is not used (the editor's TypeScript is shorter than the JavaScript that ran)", () => {
	const typescript = 'f();\n'; // two lines; the JavaScript's error is on its line 7
	const answer = runAnswer('Error: boom\n    at f (/box/submission/main.js:7:9)\n', 'javascript');
	const lines = errorLocations(answer, { language: 'typescript', code: typescript, mapLine: (line) => line - 4 }).map(({ line }) => line);
	assert.deepEqual(lines, [3], 'line 7 mapped, not first cut to line 2');
});

test('with the code, a line past its end moves to the last line', () => {
	const stderr = 'main.sh: line 9: syntax error: unexpected end of file\n';
	const answer = runAnswer(stderr, 'bash');
	assert.deepEqual(errorLocations(answer, { language: 'bash', code: 'if true; then\n  echo hi\n' }), [
		loc({ line: 3, message: 'syntax error: unexpected end of file', stage: 'run' }),
	]);
	assert.deepEqual(errorLocations(answer, { language: 'bash' }).map(({ line }) => line), [9], 'without the code: as reported');
});

test('stages: a failed compile is read alone (not its repeat as the run); a good compile is read with the run', () => {
	const failed = compileAnswer("main.c:3:13: error: 'y' undeclared\n");
	failed.run.stderr = "main.c:9:1: error: only in the run\n";
	assert.deepEqual(errorLocations(failed, { language: 'c' }), [loc({ line: 3, column: 13, message: "'y' undeclared", stage: 'compile' })]);

	const warned = {
		compile: { stderr: "main.c:2:5: warning: unused variable 'u'\n", code: 0, signal: null, status: null },
		run: { stderr: "main.c:7:1: error: printed by the run\na.out: main.c:8: main: Assertion `u' failed.\n", code: 134, signal: null, status: 'RE' },
	};
	assert.deepEqual(errorLocations(warned, { language: 'c' }).map(({ line, severity, stage }) => [line, severity, stage]), [
		[2, 'warning', 'compile'],
		[8, 'error', 'run'],
	], "gcc's words from the compile stage only, the assert from the run only");
});

test("C / C++: a program's own gcc-like lines on stderr are not the compiler's (only the compile stage is gcc's)", () => {
	const ran = (stderr, code) => ({ compile: { stderr: '', code: 0, signal: null, status: null }, run: { stderr, code, signal: null, status: code === 0 ? null : 'RE' } });
	assert.deepEqual(errorLocations(ran('main.c:4: warning: value out of range, clamped\n', 1), { language: 'c' }), [], 'fprintf(stderr, "%s:%d: warning: …", __FILE__, __LINE__)');
	assert.deepEqual(errorLocations(ran('main.cpp:5: error: oops\n', 0), { language: 'c++' }), []);
	const compiled = { compile: { stderr: 'a.out: main.c:4: main: Assertion `x\' failed.\n', code: 1, signal: null, status: 'RE' } };
	assert.deepEqual(errorLocations(compiled, { language: 'c' }), [], "glibc's assertion line is read in the run stage only");
});

test("C / C++: a failed assert() in the reader's file (an exercise's solution.c too), never the harness's", () => {
	const ran = (stderr) => ({ compile: { stderr: '', code: 0 }, run: { stderr, code: 134, signal: null, status: 'RE' } });
	const solution = "a.out: solution.c:3: add: Assertion `a >= 0' failed.\n";
	assert.deepEqual(errorLocations(ran(solution), { language: 'c', fileName: 'solution.c' }), [loc({ line: 3, message: "Assertion `a >= 0' failed.", stage: 'run' })]);
	assert.deepEqual(errorLocations(ran(solution), { language: 'c' }), [], "solution.c is not main.c");
	const harness = "a.out: main.c:140: main: Assertion `add(1, 2) == 3' failed.\n";
	assert.deepEqual(errorLocations(ran(harness), { language: 'c', fileName: 'solution.c' }), [], "the harness's own assert");
	const noFunction = "a.out: main.c:2: Assertion `ok' failed.\n";
	assert.deepEqual(errorLocations(ran(noFunction), { language: 'c' }), [loc({ line: 2, message: "Assertion `ok' failed.", stage: 'run' })], 'glibc leaves the function out when it has none');
	const template = "a.out: main.cpp:6: void Box<T>::put(T) [with T = int]: Assertion `v != 0' failed.\n";
	assert.deepEqual(errorLocations(ran(template), { language: 'c++' }), [loc({ line: 6, message: "Assertion `v != 0' failed.", stage: 'run' })]);
	for (const other of ["a.out: main.c:2: main: Assertion `ok' passed.\n", 'main.c:2: main: Assertion `ok\' failed.\n', "a.out: main.c:2: main: assert `ok' failed.\n"]) {
		assert.deepEqual(errorLocations(ran(other), { language: 'c' }), [], other);
	}
});

test("Go: the log package's lines (Lshortfile, Llongfile) are no locations; the compiler's always have a column", () => {
	const fatal = '/box/submission/main.go:7: boom\nexit status 1\n';
	assert.deepEqual(errorLocations(runAnswer(fatal, 'go'), { language: 'go' }), [], 'log.Llongfile + log.Fatal');
	assert.deepEqual(errorLocations(runAnswer('solution.go:4: hi\n', 'go'), { language: 'go', fileName: 'solution.go' }), [], "an exercise's solution.go logging");
	assert.deepEqual(errorLocations(runAnswer('main.go:7: 5: x\n', 'go'), { language: 'go' }), [], 'a log message that starts with digits');
	assert.deepEqual(errorLocations(runAnswer('# command-line-arguments\n./main.go:4:7: undefined: y\n', 'go'), { language: 'go' }), [
		loc({ line: 4, column: 7, message: 'undefined: y', stage: 'compile' }),
	]);
});

test("Python: only 3.9's SyntaxError caret counts bytes (the version of the answer decides)", () => {
	const fixture = loadFixture('python-3.9-syntax-error-wide');
	const code = fixture.request.files[0].content;
	const as = (version) => errorLocations({ ...fixture.response, version }, { language: 'python', code }).map(({ column, endColumn }) => [column, endColumn]);
	assert.deepEqual(as('3.9.4'), [[12, 13]]);
	assert.deepEqual(as('3.10.0'), [[16, 17]], 'read as code points, the same caret would stand four columns right');
	assert.deepEqual(as(undefined), [[16, 17]], 'no version: code points');
	// `$` is byte 10 of `x = "é" $ 1` ("é" takes two), so 3.9 puts the caret 4 + 9 spaces in.
	const accent = `  File "/box/submission/main.py", line 1\n    x = "é" $ 1\n${' '.repeat(4 + 9)}^\nSyntaxError: invalid syntax\n`;
	const answer = { ...runAnswer(accent), version: '3.9.4' };
	assert.deepEqual(errorLocations(answer, { language: 'python', code: 'x = "é" $ 1\n' }).map(({ column }) => column), [9], 'the `$` is character 9');
});

test("a stage's stderr is read, its output only when it has no stderr", () => {
	const both = { run: { stdout: '', stderr: '', output: 'main.sh: line 1: x: command not found\n', code: 127 } };
	assert.deepEqual(errorLocations(both, { language: 'bash' }), [], 'stderr is empty: the output (with stdout) is not read');
	const noStderr = { run: { output: 'main.sh: line 1: x: command not found\n', code: 127 } };
	assert.deepEqual(errorLocations(noStderr, { language: 'bash' }), [loc({ line: 1, message: 'x: command not found', stage: 'run' })]);
});

test('sorted by line then column (a whole line first), without exact duplicates', () => {
	const stderr = [
		"main.c:9:3: error: nine",
		"main.c:2:8: error: two late",
		"main.c:2:4: error: two early",
		"main.c:9:3: error: nine",
		'',
	].join('\n');
	assert.deepEqual(errorLocations(compileAnswer(stderr), { language: 'c' }).map(({ line, column, message }) => [line, column, message]), [
		[2, 4, 'two early'],
		[2, 8, 'two late'],
		[9, 3, 'nine'],
	]);
	const wholeLine = 'main.c:4:7: error: with a column\nmain.c:4: error: without one\n';
	assert.deepEqual(errorLocations(compileAnswer(wholeLine), { language: 'c' }).map(({ line, column, message }) => [line, column, message]), [
		[4, null, 'without one'],
		[4, 7, 'with a column'],
	]);
});

test('at most 50 locations: the first lines', () => {
	const lines = [];
	for (let line = 80; line >= 1; line -= 1) lines.push(`main.c:${line}:1: error: number ${line}`);
	const located = errorLocations(compileAnswer(`${lines.join('\n')}\n`), { language: 'c' });
	assert.equal(located.length, 50);
	assert.equal(located[0].line, 1);
	assert.equal(located[49].line, 50);
});

test('at most 50 locations: a warning never takes an error\'s place (the warnings fill the room left)', () => {
	const lines = [];
	for (let line = 1; line <= 60; line += 1) lines.push(`main.c:${line}:1: warning: number ${line}`);
	lines.push('main.c:61:1: error: the one that failed the build', 'main.c:62:1: warning: after it');
	const located = errorLocations(compileAnswer(`${lines.join('\n')}\n`), { language: 'c' });
	assert.equal(located.length, 50);
	assert.deepEqual(located.at(-1), loc({ line: 61, column: 1, message: 'the one that failed the build', stage: 'compile' }), 'the error is kept, in its place by line');
	assert.deepEqual(located.slice(0, -1).map(({ line }) => line), Array.from({ length: 49 }, (_, index) => index + 1), 'the first 49 warnings fill the rest');
});

test('answers it cannot read, languages it has no reader for, missing options: []', () => {
	const answer = loadFixture('python-3.12-name-error').response;
	for (const bad of [undefined, null, '', 'text', 42, {}, { run: null }, { run: { stderr: 42 } }, { compile: 'x' }]) {
		assert.deepEqual(errorLocations(bad, { language: 'python' }), [], JSON.stringify(bad));
	}
	for (const language of [undefined, '', 'ruby', 'constructor', '__proto__', 'toString']) {
		assert.deepEqual(errorLocations(answer, { language }), [], String(language));
	}
	assert.deepEqual(errorLocations(answer), []);
	assert.deepEqual(errorLocations(answer, null), []);
});

test("Node: a frame's place is the `:line:column` that ends it, its path what follows the last ` (`", () => {
	const stack = (frames) => `Error: boom\n${frames.map((frame) => `    at ${frame}`).join('\n')}\n`;
	const firstLine = (frames) => errorLocations(runAnswer(stack(frames), 'javascript'), { language: 'javascript' }).map(({ line, column }) => [line, column]);
	assert.deepEqual(firstLine(['new Thing (/box/submission/main.js:3:9)']), [[3, 9]]);
	assert.deepEqual(firstLine(['Object.<anonymous> (/box/submission/main.js:4:1)']), [[4, 1]]);
	assert.deepEqual(firstLine(['/box/submission/main.js:5:2']), [[5, 2]], 'a frame without a function');
	assert.deepEqual(firstLine(['async Promise.all (index 0)', 'f (/box/submission/main.js:6:3)']), [[6, 3]], 'a frame without a place is passed over');
	assert.deepEqual(firstLine(['g (node:internal/main:1:2)', 'f (/box/submission/other.js:2:3)']), [], 'no frame in the reader\'s file');
	assert.deepEqual(firstLine(['f (/box/submission/main.js:2:3) (/tmp/x.js:1:1)']), [], 'the path after the LAST ` (`');
});

/** The longest line Piston lets a stream hold (the server's PISTON_OUTPUT_MAX_SIZE). */
const STREAM_MAX_CHARS = 65536;

/** How long one such line may take: far under the 0.2-0.6 s the old, quadratic patterns took. */
const LINE_BUDGET_MS = 100;

/** `start`, then `piece` as often as fits in one stream, then `end`. */
function longLine(start, piece, end = '') {
	const room = STREAM_MAX_CHARS - 1 - start.length - end.length;
	return `${start}${piece.repeat(Math.floor(room / piece.length))}${end}`;
}

/** A Piston answer whose good compile was followed by a run that wrote `stderr`. */
function compiledRunAnswer(stderr) {
	return { compile: { stderr: '', code: 0, signal: null, status: null }, run: { stderr, code: 134, signal: null, status: 'RE' } };
}

/** The CPU time (ms, user and system) this process spends in `work()`: a stall off the CPU adds nothing (LINEAR TIME). */
function cpuMillisecondsOf(work) {
	const started = process.cpuUsage();
	work();
	const { user, system } = process.cpuUsage(started);
	return (user + system) / 1000;
}

/** One line per reader, each made to make a backtracking pattern retry every start (see the header: LINEAR TIME). */
const SLOW_LINES = Object.freeze([
	['javascript', 'many ` (`', runAnswer(longLine('    at ', ' ('), 'javascript')],
	['javascript', 'many ` (:1:1`', runAnswer(longLine('    at ', ' (:1:1 '), 'javascript')],
	['go', 'log-like pieces and a U+2028', runAnswer(longLine('', 'a.go:1: ', ' '), 'go')],
	['c', 'gcc-like pieces and a U+2028', compileAnswer(longLine('', 'a:1:1: error: ', ' '))],
	['c', 'assertion-like pieces', compiledRunAnswer(longLine('a.out: main.c:1: ', 'f: Assertion `', "x' failed."))],
	['bash', 'Bash-like pieces and a lone "\\r"', runAnswer(longLine('', 'a: line 1: ', '\rx'), 'bash')],
	['python', 'frame-like pieces and a U+2028', runAnswer(longLine('  File "x", line 1, in ', '", line 1, in ', ' '))],
]);

for (const [language, what, answer] of SLOW_LINES) {
	test(`linear time: a 64 KB ${language} line (${what}) is read in under ${LINE_BUDGET_MS} ms`, () => {
		const took = cpuMillisecondsOf(() => errorLocations(answer, { language }));
		assert.ok(took < LINE_BUDGET_MS, `${took.toFixed(1)} ms`);
	});
}
