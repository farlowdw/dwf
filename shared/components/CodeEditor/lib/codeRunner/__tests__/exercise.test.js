/**
 * exercise.test.js — the exercise library (../exercise.js): comparing output with the expected
 * output (normalising, the first different line, the bounded line diff), reading check results
 * (never throwing, whatever the program printed), the files of a check in every language (the
 * reader's code kept with its own line numbers; C and C++'s main out of the reader's macros'
 * reach), the per-language props, and the REAL answers of a Piston server in
 * fixtures/exercise (captured by fixtures/exercise/capture.mjs: the files built today must be
 * the files that ran; among them readers whose own strlen, pow, bool, count, y1, index and
 * `#define int long long` the helpers' headers used to break).
 * Run with `npm run test:shared`.
 * To change it: a new layout or rule of ../exercise.js gets a test here; new real answers come from
 * fixtures/exercise/capture.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_DIFF_CELLS, UNPRINTABLE_VALUE, buildCheckFiles, compareOutput, parseCheckResults } from '../exercise.js';
// Moved out of exercise.js on 2026-10-25 (exerciseProps.js's header says why); the tests are unchanged.
import { exerciseTextFor, supportsChecks } from '../exerciseProps.js';
import { CHECK_HELPERS, CHECK_MARKER, MAX_SHOWN_CHARS } from '../checkHelpers.js';
import { errorLocations } from '../errorLocations.js';

/** The captured server answers. */
const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/exercise/', import.meta.url));

/** One protocol line. */
function protocolLine(record) {
	return `${CHECK_MARKER} ${JSON.stringify(record)}\n`;
}

/** The "done" line. */
const DONE_LINE = protocolLine({ done: true });

/** A captured fixture by name. */
function fixture(name) {
	return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8'));
}

/** The file of `built` sent under `name`. */
function fileNamed(built, name) {
	return built.files.find((file) => file.name === name);
}

// ---------------------------------------------------------------- compareOutput

test('compareOutput: the same text matches, with an all-same diff', () => {
	assert.deepEqual(compareOutput('a\nb\n', 'a\nb\n'), {
		matches: true,
		firstDifferentLine: null,
		diff: [
			{ type: 'same', text: 'a' },
			{ type: 'same', text: 'b' },
		],
	});
});

test('compareOutput: line endings, trailing spaces and trailing blank lines do not count', () => {
	assert.equal(compareOutput('a\r\nb\r\n', 'a\nb').matches, true, 'CRLF');
	assert.equal(compareOutput('a\rb', 'a\nb').matches, true, 'a lone CR');
	assert.equal(compareOutput('a  \nb\t\n', 'a\nb').matches, true, 'spaces and tabs at line ends');
	assert.equal(compareOutput('a\nb\n\n\n  \n', 'a\nb').matches, true, 'blank lines at the end');
	assert.equal(compareOutput('', '\n\n').matches, true, 'nothing and blank lines');
	assert.equal(compareOutput(null, undefined).matches, true, 'null and undefined are empty');
});

test('compareOutput: what still counts — leading spaces, leading blank lines, inner blank lines, case', () => {
	assert.equal(compareOutput('  a', 'a').matches, false);
	assert.equal(compareOutput('\na', 'a').matches, false);
	assert.equal(compareOutput('a\n\nb', 'a\nb').matches, false);
	assert.equal(compareOutput('A', 'a').matches, false);
});

test('compareOutput: the first different line', () => {
	assert.equal(compareOutput('1\n2\nX\n4', '1\n2\n3\n4').firstDifferentLine, 3);
	assert.equal(compareOutput('1\n2', '1\n2\n3').firstDifferentLine, 3, 'the output stops early');
	assert.equal(compareOutput('1\n2\n3\n4', '1\n2\n3').firstDifferentLine, 4, 'the output goes on');
	assert.equal(compareOutput('', 'x').firstDifferentLine, 1, 'nothing printed');
	assert.equal(compareOutput('x', '').firstDifferentLine, 1, 'nothing expected');
});

test('compareOutput: the diff turns the expected output into the printed one', () => {
	assert.deepEqual(compareOutput('1\nX\n3\n4\n5', '1\n2\n3\n5').diff, [
		{ type: 'same', text: '1' },
		{ type: 'removed', text: '2' },
		{ type: 'added', text: 'X' },
		{ type: 'same', text: '3' },
		{ type: 'added', text: '4' },
		{ type: 'same', text: '5' },
	]);
	assert.deepEqual(compareOutput('b\nc', 'a\nb\nc').diff, [
		{ type: 'removed', text: 'a' },
		{ type: 'same', text: 'b' },
		{ type: 'same', text: 'c' },
	]);
	assert.deepEqual(compareOutput('a  \n', 'b').diff, [
		{ type: 'removed', text: 'b' },
		{ type: 'added', text: 'a' },
	], 'the lines as compared (trailing spaces gone)');
});

test('compareOutput: the longest common subsequence is kept (lines moved around)', () => {
	const result = compareOutput('c\na\nb', 'a\nb\nc');
	const kept = result.diff.filter((line) => line.type === 'same').map((line) => line.text);
	assert.deepEqual(kept, ['a', 'b']);
	assert.equal(result.diff.length, 4);
});

test('compareOutput: beyond MAX_DIFF_CELLS the middle is all removed, then all added; start and end still match', () => {
	const size = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 10;
	const expected = ['top', ...Array.from({ length: size }, (_, i) => `e${i}`), 'bottom'];
	const actual = ['top', ...Array.from({ length: size }, (_, i) => `a${i}`), 'bottom'];
	const { diff, firstDifferentLine } = compareOutput(actual.join('\n'), expected.join('\n'));
	assert.equal(firstDifferentLine, 2);
	assert.deepEqual(diff[0], { type: 'same', text: 'top' });
	assert.deepEqual(diff[diff.length - 1], { type: 'same', text: 'bottom' });
	assert.equal(diff.length, 2 + 2 * size);
	assert.equal(diff.slice(1, 1 + size).every((line) => line.type === 'removed'), true);
	assert.equal(diff.slice(1 + size, 1 + 2 * size).every((line) => line.type === 'added'), true);
});

test('compareOutput: a long output with one changed line stays cheap (start and end are matched first)', () => {
	const lines = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
	const changed = lines.slice();
	changed[10000] = 'changed';
	const { firstDifferentLine, diff } = compareOutput(changed.join('\n'), lines.join('\n'));
	assert.equal(firstDifferentLine, 10001);
	assert.deepEqual(diff.filter((line) => line.type !== 'same'), [
		{ type: 'removed', text: 'line 10000' },
		{ type: 'added', text: 'changed' },
	]);
});

// ---------------------------------------------------------------- parseCheckResults

test('parseCheckResults: cases, counts, other output and the done line', () => {
	const stdout = [
		'hello from the reader\n',
		protocolLine({ name: 'add', pass: true, got: '5', expected: '5' }),
		protocolLine({ name: 'sub', pass: false, got: '1', expected: '2' }),
		'more output\n',
		DONE_LINE,
	].join('');
	assert.deepEqual(parseCheckResults(stdout), {
		cases: [
			{ name: 'add', pass: true, got: '5', expected: '5' },
			{ name: 'sub', pass: false, got: '1', expected: '2' },
		],
		passed: 1,
		total: 2,
		otherOutput: 'hello from the reader\nmore output\n',
		finished: true,
	});
});

test('parseCheckResults: no done line means the harness stopped early', () => {
	const result = parseCheckResults(protocolLine({ name: 'a', pass: true, got: '1', expected: '1' }));
	assert.equal(result.finished, false);
	assert.equal(result.total, 1);
});

test('parseCheckResults: empty or missing stdout', () => {
	const empty = { cases: [], passed: 0, total: 0, otherOutput: '', finished: false };
	assert.deepEqual(parseCheckResults(''), empty);
	assert.deepEqual(parseCheckResults(undefined), empty);
	assert.deepEqual(parseCheckResults(null), empty);
});

test('parseCheckResults: a marker after other text on the same line (a print without a newline)', () => {
	const result = parseCheckResults(`progress...${protocolLine({ name: 'a', pass: true, got: '1', expected: '1' })}`);
	assert.equal(result.total, 1);
	assert.equal(result.otherOutput, 'progress...\n');
});

test('parseCheckResults: a marker without a JSON object after it is other output', () => {
	const stdout = `${CHECK_MARKER} not json\n${CHECK_MARKER} [1, 2]\n${CHECK_MARKER} null\n`;
	const result = parseCheckResults(stdout);
	assert.equal(result.total, 0);
	assert.equal(result.otherOutput, stdout);
});

test('parseCheckResults: odd records are read safely', () => {
	const result = parseCheckResults(protocolLine({ name: 7, pass: 'yes', got: [1, 2], expected: null }) + protocolLine({ pass: true }));
	assert.deepEqual(result.cases, [
		{ name: '7', pass: false, got: '[1,2]', expected: 'null' },
		{ name: '', pass: true, got: '', expected: '' },
	]);
	assert.equal(result.passed, 1);
});

test('parseCheckResults: never throws on what a program prints — a name that is not text, a value nested too deep to write', () => {
	const badName = `${CHECK_MARKER} {"name":{"toString":1},"pass":false,"got":"1","expected":"2"}\n`;
	const nested = '['.repeat(10000) + ']'.repeat(10000);
	const deep = `${CHECK_MARKER} {"name":"deep","pass":false,"got":${nested},"expected":"1"}\n`;
	const valid = protocolLine({ name: 'after', pass: true, got: '1', expected: '1' });
	let result;
	assert.doesNotThrow(() => {
		result = parseCheckResults(badName + deep + valid + DONE_LINE);
	});
	assert.deepEqual(result.cases[0], { name: '{"toString":1}', pass: false, got: '1', expected: '2' }, 'the name written as JSON, never String()');
	assert.deepEqual(result.cases[1], { name: 'deep', pass: false, got: UNPRINTABLE_VALUE, expected: '1' });
	assert.deepEqual(result.cases[2], { name: 'after', pass: true, got: '1', expected: '1' }, 'the next record is still read');
	assert.equal(result.finished, true);
	for (const entry of result.cases) {
		for (const field of ['name', 'got', 'expected']) assert.equal(typeof entry[field], 'string', field);
	}
});

test('parseCheckResults: a record with a raw control character still counts (never lost from the results)', () => {
	const escape = String.fromCharCode(0x1b);
	const raw = `${CHECK_MARKER} {"name":"colour","pass":false,"got":"${escape}[31mhi","expected":"hi"}\n`;
	const result = parseCheckResults(`${raw}${DONE_LINE}`);
	assert.deepEqual(result.cases, [{ name: 'colour', pass: false, got: `${escape}[31mhi`, expected: 'hi' }]);
	assert.equal(result.passed, 0);
	assert.equal(result.otherOutput, '');
	const twice = parseCheckResults(raw + raw);
	assert.equal(twice.total, 2, 'the same rule for every line (no regexp state between lines)');
});

test('parseCheckResults: Windows line endings and a last line without a newline', () => {
	const stdout = `a\r\n${protocolLine({ name: 'x', pass: true, got: '1', expected: '1' }).trimEnd()}\r\nb`;
	const result = parseCheckResults(stdout);
	assert.equal(result.total, 1);
	assert.equal(result.otherOutput, 'a\nb\n');
});

// ---------------------------------------------------------------- buildCheckFiles

test('supportsChecks: the six languages and TypeScript, by any name', () => {
	for (const name of ['python', 'py', 'Python3', 'javascript', 'js', 'node', 'typescript', 'ts', 'bash', 'sh', 'c', 'gcc', 'c++', 'cpp', 'g++', 'go', 'golang']) {
		assert.equal(supportsChecks(name), true, name);
	}
	for (const name of ['ruby', 'java', 'rust', 'python2', '', undefined, 'constructor']) assert.equal(supportsChecks(name), false, String(name));
	assert.equal(buildCheckFiles({ language: 'ruby', readerCode: 'x', harness: 'y' }), null);
});

test('buildCheckFiles: names, the language run, and the reader\'s file in error messages', () => {
	const expected = {
		python: { files: ['main.py', 'solution.py', 'dwf_check.py'], runLanguage: 'python', readerFileName: 'solution.py', harnessFileName: 'main.py' },
		javascript: { files: ['main.js', 'solution.js'], runLanguage: 'javascript', readerFileName: 'solution.js', harnessFileName: 'main.js' },
		typescript: { files: ['main.js', 'solution.js'], runLanguage: 'javascript', readerFileName: 'solution.js', harnessFileName: 'main.js' },
		bash: { files: ['main.sh', 'solution.sh'], runLanguage: 'bash', readerFileName: 'solution.sh', harnessFileName: 'main.sh' },
		c: { files: ['main', 'reader'], runLanguage: 'c', readerFileName: 'solution.c', harnessFileName: 'main.c' },
		'c++': { files: ['main', 'reader'], runLanguage: 'c++', readerFileName: 'solution.cpp', harnessFileName: 'main.cpp' },
		go: { files: ['main', 'solution.go'], runLanguage: 'go', readerFileName: 'solution.go', harnessFileName: 'main.go' },
	};
	for (const [language, want] of Object.entries(expected)) {
		const built = buildCheckFiles({ language, readerCode: 'x\n', harness: 'y\n' });
		assert.deepEqual(built.files.map((file) => file.name), want.files, language);
		assert.equal(built.runLanguage, want.runLanguage, language);
		assert.equal(built.readerFileName, want.readerFileName, language);
		assert.equal(built.harnessFileName, want.harnessFileName, language);
		assert.equal(built.lineOffset, 0, language);
	}
});

test('buildCheckFiles: Python, JavaScript and Bash send the reader\'s code byte for byte', () => {
	const code = 'line one\r\n\tline two  \nno final newline';
	for (const language of ['python', 'javascript', 'typescript', 'bash']) {
		assert.equal(buildCheckFiles({ language, readerCode: code, harness: '' }).files[1].content, code, language);
	}
});

test('buildCheckFiles: Python imports the reader, then the helper module, then runs the harness and the done line', () => {
	const built = buildCheckFiles({ language: 'py', readerCode: 'def add(a, b):\n    return a + b\n', harness: 'check("add", add(1, 2), 3)' });
	assert.equal(built.files[0].content, [
		'from solution import *',
		'from dwf_check import check, check_done as _dwf_check_done',
		'check("add", add(1, 2), 3)',
		'_dwf_check_done()',
		'',
	].join('\n'));
	assert.equal(built.files[2].content, CHECK_HELPERS.python.body);
});

test('buildCheckFiles: JavaScript loads the reader\'s file after the helper, before the harness', () => {
	const main = buildCheckFiles({ language: 'js', readerCode: '', harness: "check('a', 1, 1);" }).files[0].content;
	const loadAt = main.indexOf("dwfLoadReaderCode('solution.js');");
	assert.equal(main.startsWith(CHECK_HELPERS.javascript.body), true);
	assert.ok(loadAt > 0);
	assert.ok(main.indexOf("check('a', 1, 1);") > loadAt);
	assert.equal(main.endsWith('dwfCheckDone();\n'), true);
});

test('buildCheckFiles: Bash sources the reader\'s file before the helper (so the helper\'s check wins)', () => {
	const main = buildCheckFiles({ language: 'sh', readerCode: '', harness: 'check a 1 1' }).files[0].content;
	assert.equal(main.startsWith('source ./solution.sh\n'), true);
	assert.ok(main.indexOf('check a 1 1') > main.indexOf('dwf_check_done() {'));
	assert.equal(main.endsWith('dwf_check_done\n'), true);
});

test('buildCheckFiles: C and C++ number the reader\'s lines as solution.c from line 1, and close the guard after the code', () => {
	for (const [language, name] of [['c', 'solution.c'], ['cpp', 'solution.cpp']]) {
		const reader = buildCheckFiles({ language, readerCode: 'int one;\nint two;\n', harness: '' }).files[1].content;
		assert.equal(reader, `#ifdef DWF_CHECK_HARNESS\n#line 1 "${name}"\nint one;\nint two;\n#endif\n`, language);
		const noNewline = buildCheckFiles({ language, readerCode: 'int last;', harness: '' }).files[1].content;
		assert.equal(noNewline.endsWith('int last;\n#endif\n'), true, `${language}: #endif on its own line`);
	}
});

test('buildCheckFiles: C\'s main file — helper first, main, then the reader with its main renamed, the macro, and the harness as the body of the function main calls', () => {
	const main = buildCheckFiles({ language: 'c', readerCode: 'int main(void) { return 0; }\n', harness: '#include <ctype.h>\ncheck("a", 1, 1);\r\n' }).files[0].content;
	const order = [
		'#include <stdio.h>',
		'#include <ctype.h>',
		'static int dwf_report(',
		'static void dwf_run_checks(void);',
		'int main(void) {',
		'\tdwf_run_checks();',
		'\tdwf_check_done();',
		'\treturn 0;',
		'#define DWF_CHECK_HARNESS 1',
		'#define main reader_main',
		'#include "reader.c"',
		'#undef main',
		'#define check(name, got, expected) _Generic',
		'static void dwf_run_checks(void) {',
		'check("a", 1, 1);',
	];
	let at = -1;
	for (const piece of order) {
		const next = main.indexOf(piece, at + 1);
		assert.ok(next > at, `${piece} in order`);
		at = next;
	}
	assert.equal(main.includes('\r'), false, 'the harness\'s line endings made Unix');
	assert.equal(main.includes('#pragma'), false, 'C never needs the warning turned off');
	assert.equal(main.split('#include <ctype.h>').length, 2, 'the harness\'s #include moved, not copied');
});

test('buildCheckFiles: C and C++ — no #define of the reader\'s can reach main (a reader\'s `#define int long long` with `signed main()`)', () => {
	const readerCode = '#include <bits/stdc++.h>\nusing namespace std;\n#define int long long\nint sum(vector<int> v) { int s = 0; for (int x : v) s += x; return s; }\nsigned main() {}\n';
	for (const [language, include] of [['c++', '#include "reader.cpp"'], ['c', '#include "reader.c"']]) {
		const main = buildCheckFiles({ language, readerCode, harness: 'check("sum", sum({1, 2, 3}), 6);\n' }).files[0].content;
		const includeAt = main.indexOf(include);
		assert.ok(main.indexOf('int main(void) {') < includeAt, `${language}: main's signature comes before the reader's code`);
		assert.ok(main.indexOf('static void dwf_run_checks(void);') < includeAt, `${language}: and so does the declaration of the function it calls`);
		assert.ok(main.indexOf('static void dwf_run_checks(void) {') > includeAt, `${language}: the harness comes after the reader's code (it sees the reader's names)`);
		assert.equal(main.slice(includeAt).includes('int main'), false, `${language}: nothing after the reader's code says int main`);
	}
});

test('buildCheckFiles: C\'s check macro names its _Generic types through typedefs (a reader\'s `#define int long long` or `#define float double` cannot merge two of them)', () => {
	const { tail, body } = CHECK_HELPERS.c;
	const generic = tail.slice(tail.indexOf('_Generic'));
	for (const bare of [/\bunsigned int\b/, /\bfloat\s*:/, /\bdouble\s*:/, /\blong double\b/, /\b_Bool\s*:/, /\bchar \*/]) {
		assert.doesNotMatch(generic, bare, `no bare ${bare} in the macro`);
	}
	for (const name of ['dwf_bool_t', 'dwf_char_t', 'dwf_string_t', 'dwf_const_string_t', 'dwf_float_t', 'dwf_double_t', 'dwf_long_double_t', 'dwf_uint_t', 'dwf_ulong_t', 'dwf_ullong_t']) {
		assert.match(body, new RegExp(`typedef [^;]+\\b${name};`), `${name} declared in the body (before the reader's code)`);
		assert.ok(tail.includes(`${name}:`), `${name} used in the macro`);
	}
});

test('buildCheckFiles: C copies the reader\'s feature-test macros above the helper\'s headers; the reader\'s file keeps them in place', () => {
	const readerCode = '#define _GNU_SOURCE\n#define _POSIX_C_SOURCE 200809L // getline\n#include <math.h>\n#define VALUE 1\ndouble pi(void) { return M_PI; }\n';
	const built = buildCheckFiles({ language: 'c', readerCode, harness: '' });
	const main = built.files[0].content;
	assert.equal(main.startsWith('#define _GNU_SOURCE\n#define _POSIX_C_SOURCE 200809L // getline\n/* --- check helper: headers'), true);
	assert.equal(main.includes('#define VALUE'), false, 'only feature-test macros are copied');
	assert.equal(built.files[1].content, `#ifdef DWF_CHECK_HARNESS\n#line 1 "solution.c"\n${readerCode}#endif\n`, 'the reader\'s lines unchanged');
	const plain = buildCheckFiles({ language: 'c', readerCode: '#include <stdio.h>\n', harness: '' }).files[0].content;
	assert.equal(plain.startsWith(CHECK_HELPERS.c.head), true, 'nothing copied when there is none');
	const cpp = buildCheckFiles({ language: 'c++', readerCode: '#define _GNU_SOURCE\n', harness: '' }).files[0].content;
	assert.equal(cpp.startsWith(CHECK_HELPERS['c++'].head), true, 'C++ copies nothing (g++ defines _GNU_SOURCE itself)');
});

test('buildCheckFiles: C++ turns the missing-return warning off only when the reader\'s code has a main', () => {
	const withMain = buildCheckFiles({ language: 'c++', readerCode: 'int main() {\n}\n', harness: '' }).files[0].content;
	assert.match(withMain, /#pragma GCC diagnostic push\n#pragma GCC diagnostic ignored "-Wreturn-type"\n#define DWF_CHECK_HARNESS 1\n#define main reader_main\n#include "reader.cpp"\n#undef main\n#pragma GCC diagnostic pop\n/);
	const without = buildCheckFiles({ language: 'c++', readerCode: 'int twice(int x) { return 2 * x; }\n', harness: '' }).files[0].content;
	assert.equal(without.includes('#pragma'), false);
	assert.ok(without.indexOf('namespace dwf_check') < without.indexOf('#include "reader.cpp"'), 'the helper before the reader\'s code');
});

test('buildCheckFiles: Go renames the reader\'s func main without moving a line or a column', () => {
	const code = 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println(1)\n}\n\nfunc (s S) main() {}\nfunc mainly() {}\n  func  main (x int) {}\n';
	const reader = buildCheckFiles({ language: 'go', readerCode: code, harness: '' }).files[1].content;
	const before = code.split('\n');
	const after = reader.split('\n');
	assert.equal(after.length, before.length);
	before.forEach((line, index) => assert.equal(after[index].length, line.length, `line ${index + 1} keeps its width`));
	assert.equal(after[4], 'func _   () {');
	assert.equal(after[8], 'func (s S) main() {}', 'a method named main is left alone');
	assert.equal(after[9], 'func mainly() {}');
	assert.equal(after[10], '  func  _    (x int) {}');
});

test('buildCheckFiles: Go\'s main file — package, helper imports, the harness\'s imports, the helper, the harness as main\'s body', () => {
	const main = buildCheckFiles({ language: 'golang', readerCode: '', harness: 'import "strings"\nimport m "math"\ncheck("up", strings.ToUpper("a"), "A")\n' }).files[0].content;
	assert.equal(main.startsWith('package main\n'), true);
	const order = ['dwfreflect "reflect"', 'import "strings"', 'import m "math"', 'func check(', 'func main() {', 'check("up"', '\tdwfCheckDone()'];
	let at = -1;
	for (const piece of order) {
		const next = main.indexOf(piece, at + 1);
		assert.ok(next > at, `${piece} in order`);
		at = next;
	}
});

test('buildCheckFiles: a Go import line may carry a // comment; an import block or other code stays in main', () => {
	const harness = 'import "strings" // ToUpper\nimport (\n\t"os"\n)\nx := "import \\"fmt\\""\n';
	const main = buildCheckFiles({ language: 'go', readerCode: '', harness }).files[0].content;
	const mainBody = main.slice(main.indexOf('func main() {'));
	assert.equal(main.indexOf('import "strings" // ToUpper') < main.indexOf('func check('), true, 'hoisted with its comment');
	assert.equal(mainBody.includes('import (\n\t"os"\n)'), true, 'a block is not hoisted');
	assert.equal(mainBody.includes('x := "import \\"fmt\\""'), true);
});

test('buildCheckFiles: missing code or harness is empty, never a crash', () => {
	const built = buildCheckFiles({ language: 'python' });
	assert.equal(built.files[1].content, '');
	assert.match(built.files[0].content, /^from solution import \*\n/);
	assert.equal(buildCheckFiles(), null, 'no options: no language');
});

// ---------------------------------------------------------------- exerciseTextFor

test('exerciseTextFor: a string belongs to the string snippet\'s language only', () => {
	assert.equal(exerciseTextFor('tests', 'python', 'python'), 'tests');
	assert.equal(exerciseTextFor('tests', 'py', 'Python'), 'tests', 'any name for it');
	assert.equal(exerciseTextFor('tests', 'javascript', 'python'), '');
	assert.equal(exerciseTextFor('tests', 'python', undefined), 'tests', 'no language given: Python, as for a string snippet');
	assert.equal(exerciseTextFor('tests', 'go', ''), '');
});

test('exerciseTextFor: an object gives its entry for the language, under any name', () => {
	const tests = { py: 'python tests', JavaScript: 'js tests', go: 42 };
	assert.equal(exerciseTextFor(tests, 'python', 'go'), 'python tests');
	assert.equal(exerciseTextFor(tests, 'js', 'go'), 'js tests');
	assert.equal(exerciseTextFor(tests, 'go', 'go'), '', 'not a string');
	assert.equal(exerciseTextFor(tests, 'ruby', 'go'), '');
	for (const value of [undefined, null, 5, ['a']]) assert.equal(exerciseTextFor(value, 'python', 'python'), '', String(value));
});

// ---------------------------------------------------------------- the server's answers

/**
 * What each fixture must show. passed / total / finished from parseCheckResults; failing: the
 * names of the cases that fail; shown: { case name: [got, expected] } for the display rules;
 * other: the other output; output: patterns the run's error text must match (the reader's file
 * and line), noOutput: patterns it must not match; compileOutput: the compiler's whole output
 * ('' = not even a warning: the copied feature-test macros, the quieted C++ main).
 */
const EXPECTATIONS = {
	'python-checks': {
		passed: 7, total: 11, finished: true,
		failing: ['add(2, 2)', 'is_even(4)', 'infinities', 'box'],
		shown: { text: ["'say \"hi\"\\n'", "'say \"hi\"\\n'"], lists: ['[2, 3.0]', '[2, 3]'], 'is_even(4)': ['1', 'True'] },
		other: 'solution loaded\n',
	},
	'javascript-checks': {
		passed: 6, total: 9, finished: true,
		failing: ['add(2, 2)', 'missing', 'infinities'],
		shown: { pair: ["[ 1, 'a' ]", "[ 1, 'a' ]"], object: ['{ total: 3 }', '{ total: 3 }'], missing: ['undefined', 'null'] },
		other: 'solution loaded\n',
	},
	'bash-checks': {
		passed: 4, total: 7, finished: true,
		failing: ['add 2 2', 'tab', 'colour'],
		shown: {
			'quotes and \\\\': ['"say \\"hi\\" \\\\\\\\ tab"', '"say \\"hi\\" \\\\\\\\ tab"'],
			tab: ['"a\\tb"', '"a b"'],
			colour: ['"\\x1b[31mhi\\x1b[0m"', '"hi"'],
			'amp & tilde': ['"a&b~"', '"a&b~"'],
		},
		other: 'solution loaded\n',
	},
	'c-checks': {
		passed: 12, total: 20, finished: true,
		failing: ['add(2, 2)', 'average(1, 2)', 'middle(1, 2)', 'strlen vs 5.5', 'null', 'infinities', 'area(2) far', 'long text'],
		shown: {
			'greeting()': ['"hello"', '"hello"'],
			'first letter': ["'H'", "'H'"],
			null: ['NULL', '"x"'],
			'average(1, 2)': ['1', '1.5'],
			'middle(1, 2)': ['1', '1.5'],
			'middle(2, 4)': ['3', '3'],
			'strlen vs 5.5': ['5', '5.5'],
			'area(2)': ['12.56637', '12.56637'],
			'circle(1)': ['3.14159265358979', '3.14159265358979'],
		},
		other: '',
		compileOutput: '',
	},
	'cpp-checks': {
		passed: 6, total: 12, finished: true,
		failing: ['twoSum(26)', 'int vs double', 'map', 'point', 'infinities', 'letter'],
		shown: {
			'twoSum(26)': ['[2, 3]', '[1, 2]'],
			pair: ['(1, "a")', '(1, "a")'],
			map: ['[("a", 1)]', '[("a", 2)]'],
			point: ['(1, 2)', '(1, 3)'],
			'area(2)': ['12.56637', '12.566371'],
			floats: ['[0.5, 3.141593]', '[0.5, 3.141593]'],
			letter: ['65', '66'],
		},
		other: '',
		compileOutput: '',
	},
	'c-reader-names': {
		passed: 4, total: 4, finished: true, failing: [], other: '',
	},
	'cpp-reader-names': {
		passed: 4, total: 4, finished: true, failing: [], other: '',
		compileOutput: '',
	},
	'go-checks': {
		passed: 6, total: 10, finished: true,
		failing: ['add(2, 2)', 'text vs number', 'infinities', 'area(2) far'],
		shown: {
			words: ['[a b]', '[a b]'],
			upper: ['"GO"', '"GO"'],
			'text vs number': ['"5"', '5'],
			infinities: ['-Inf', '+Inf'],
			'area(2)': ['12.566371', '12.566371'],
		},
		other: '',
	},
	'python-reader-crash': {
		passed: 1, total: 1, finished: false, failing: [], other: '',
		output: [/File "\/box\/submission\/solution\.py", line 2, in get/, /IndexError: list index out of range/],
	},
	'javascript-reader-crash': {
		passed: 1, total: 1, finished: false, failing: [], other: '',
		output: [/^\/box\/submission\/solution\.js:2\n/, /at first \(\/box\/submission\/solution\.js:2:19\)/],
	},
	'python-reader-syntax-error': {
		passed: 0, total: 0, finished: false, failing: [], other: '',
		output: [/File "\/box\/submission\/solution\.py", line 2\n/, /SyntaxError: invalid syntax/],
	},
	'javascript-reader-syntax-error': {
		passed: 0, total: 0, finished: false, failing: [], other: '',
		output: [/^\/box\/submission\/solution\.js:2\n/, /SyntaxError: Unexpected token ';'/],
	},
	'bash-reader-error': {
		passed: 1, total: 1, finished: true, failing: [], other: '',
		output: [/^\.\/solution\.sh: line 2: wc_not_a_command: command not found/],
	},
	'c-reader-compile-error': {
		passed: 0, total: 0, finished: false, failing: [], other: '',
		output: [/^solution\.c:4:16: error: 'c' undeclared/m],
		noOutput: [/^\s+\d+ \|/m],
	},
	'cpp-reader-compile-error': {
		passed: 0, total: 0, finished: false, failing: [], other: '',
		output: [/^solution\.cpp:4:17: error: expected ';' before '}' token/m],
		noOutput: [/^\s+\d+ \|/m],
	},
	'go-reader-compile-error': {
		passed: 0, total: 0, finished: false, failing: [], other: '',
		output: [/^\.\/solution\.go:4:13: undefined: c$/m],
	},
};

/** The error text of a captured run: the compiler's when it has one, else the run's stderr. */
function errorText(response) {
	if (response.compile && response.compile.code !== 0) return response.compile.output;
	return response.run.stderr;
}

test('every fixture has expectations, and every expectation a fixture', () => {
	const files = fs.readdirSync(FIXTURE_DIR).filter((name) => name.endsWith('.json')).map((name) => name.replace(/\.json$/, ''));
	assert.deepEqual(files.sort(), Object.keys(EXPECTATIONS).sort());
});

test('fixtures: buildCheckFiles still builds exactly the files that ran on the server', () => {
	for (const name of Object.keys(EXPECTATIONS)) {
		const { input, request, status } = fixture(name);
		const built = buildCheckFiles(input);
		assert.equal(status, 200, name);
		assert.equal(request.language, built.runLanguage, name);
		assert.deepEqual(request.files, built.files, `${name}: the harness files changed — capture again (fixtures/exercise/capture.mjs)`);
	}
});

test('fixtures: the server\'s output reads as the expected check results', () => {
	for (const [name, want] of Object.entries(EXPECTATIONS)) {
		const { response } = fixture(name);
		const result = parseCheckResults(response.run?.stdout ?? '');
		assert.equal(result.passed, want.passed, `${name}: passed`);
		assert.equal(result.total, want.total, `${name}: total`);
		assert.equal(result.finished, want.finished, `${name}: finished`);
		assert.deepEqual(result.cases.filter((one) => !one.pass).map((one) => one.name), want.failing, `${name}: failing`);
		assert.equal(result.otherOutput, want.other, `${name}: other output`);
		for (const [caseName, [got, expected]] of Object.entries(want.shown ?? {})) {
			const found = result.cases.find((one) => one.name === caseName);
			assert.deepEqual([found.got, found.expected], [got, expected], `${name}: ${caseName}`);
		}
	}
});

test('fixtures: the reader\'s errors name the reader\'s file with the reader\'s own line numbers', () => {
	for (const [name, want] of Object.entries(EXPECTATIONS)) {
		const text = errorText(fixture(name).response);
		for (const pattern of want.output ?? []) assert.match(text, pattern, name);
		for (const pattern of want.noOutput ?? []) assert.doesNotMatch(text, pattern, `${name}: no source line quoted from the wrong place`);
	}
});

test('fixtures: C and C++ checks compile without a single warning', () => {
	for (const [name, want] of Object.entries(EXPECTATIONS)) {
		if (want.compileOutput === undefined) continue;
		assert.equal(fixture(name).response.compile.output, want.compileOutput, name);
	}
});

/**
 * Where errorLocations (../errorLocations.js) puts each captured error, read with the names
 * buildCheckFiles returns, as the editor will: { fixture: [line, message start] }.
 */
const ERROR_LINES = {
	'python-reader-crash': [2, 'IndexError'],
	'python-reader-syntax-error': [2, 'SyntaxError'],
	'javascript-reader-crash': [2, 'TypeError'],
	'javascript-reader-syntax-error': [2, 'SyntaxError'],
	'bash-reader-error': [2, 'wc_not_a_command'],
	'c-reader-compile-error': [4, "'c' undeclared"],
	'cpp-reader-compile-error': [4, "expected ';'"],
	'go-reader-compile-error': [4, 'undefined: c'],
};

test('fixtures: errorLocations finds each error on the reader\'s own line (readerFileName, lineOffset)', () => {
	for (const [name, [line, messageStart]] of Object.entries(ERROR_LINES)) {
		const { input, response } = fixture(name);
		const check = buildCheckFiles(input);
		const options = { language: check.runLanguage, fileName: check.readerFileName, code: input.readerCode, lineOffset: check.lineOffset };
		const locations = errorLocations(response, options);
		assert.equal(locations.length, 1, name);
		assert.equal(locations[0].line, line, name);
		assert.equal(locations[0].message.startsWith(messageStart), true, `${name}: ${locations[0].message}`);
	}
	for (const name of ['python-checks', 'javascript-checks', 'bash-checks', 'c-checks', 'cpp-checks', 'go-checks']) {
		const { input, response } = fixture(name);
		const check = buildCheckFiles(input);
		assert.deepEqual(errorLocations(response, { language: check.runLanguage, fileName: check.readerFileName, code: input.readerCode }), [], name);
	}
});

test('fixtures: a reader\'s own strlen, pow, bool, count, y0 / y1, index and `#define int long long` compile and pass a check on the server (the helper\'s headers stay out of the reader\'s way)', () => {
	const clashingNames = {
		'c-reader-names': [/int strlen\(/, /int pow\(/, /typedef enum \{ false, true \} bool;/, /#define int long long/, /#define float double/, /signed main\(/],
		'cpp-reader-names': [/using namespace std;/, /int count = 0;/, /int x0, y0, x1, y1;/, /int index = 3;/, /#define int long long/, /signed main\(/],
	};
	for (const [name, patterns] of Object.entries(clashingNames)) {
		const { input, response } = fixture(name);
		for (const pattern of patterns) assert.match(input.readerCode, pattern, `${name}: the reader really uses ${pattern}`);
		assert.equal(response.compile.code, 0, `${name}: it compiled`);
		assert.doesNotMatch(response.compile.output, /error/, `${name}: no error`);
		assert.doesNotMatch(response.compile.output, /^main\.(c|cpp):\d+/m, `${name}: no complaint about the harness file`);
		assert.equal(parseCheckResults(response.run.stdout).passed, 4, name);
	}
});

test('fixtures: C compares an integer against a floating expected value as floating point (the integer-division lesson fails, showing 1.5)', () => {
	const cases = parseCheckResults(fixture('c-checks').response.run.stdout).cases;
	const named = (caseName) => cases.find((one) => one.name === caseName);
	assert.deepEqual(named('middle(1, 2)'), { name: 'middle(1, 2)', pass: false, got: '1', expected: '1.5' }, 'int against 1.5');
	assert.equal(named('middle(2, 4)').pass, true, 'int against 3.0');
	assert.deepEqual([named('strlen vs 5.5').pass, named('strlen vs 5.5').expected], [false, '5.5'], 'unsigned (size_t) against 5.5');
});

test('fixtures: Python shows two unequal values that print the same with their type and address (a class without __eq__)', () => {
	const box = parseCheckResults(fixture('python-checks').response.run.stdout).cases.find((one) => one.name === 'box');
	assert.equal(box.pass, false);
	assert.match(box.got, /^Box object at 0x[0-9a-f]+: Box\(1\)$/);
	assert.match(box.expected, /^Box object at 0x[0-9a-f]+: Box\(1\)$/);
	assert.notEqual(box.got, box.expected, 'two objects, two addresses');
});

test('fixtures: JavaScript gives a float beyond 2^53 the tolerance (on the server)', () => {
	const big = parseCheckResults(fixture('javascript-checks').response.run.stdout).cases.find((one) => one.name === 'beyond 2^53');
	assert.deepEqual(big, { name: 'beyond 2^53', pass: true, got: '30000000000000004', expected: '30000000000000000' });
});

test('fixtures: a long value is cut to MAX_SHOWN_CHARS + … (C on the server)', () => {
	const result = parseCheckResults(fixture('c-checks').response.run.stdout);
	const long = result.cases.find((one) => one.name === 'long text');
	assert.equal(long.got.length, MAX_SHOWN_CHARS + 1);
	assert.equal(long.got.endsWith('…'), true);
});

test('fixtures: the crash cases ran on the oldest installed versions (the helpers stay compatible)', () => {
	assert.equal(fixture('python-reader-crash').request.version, '3.9.4');
	assert.equal(fixture('javascript-reader-crash').request.version, '16.3.0');
});
