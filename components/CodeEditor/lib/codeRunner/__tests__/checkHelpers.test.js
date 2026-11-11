/**
 * checkHelpers.test.js — the check helpers (../checkHelpers.js): every language's pieces are
 * there, the constants are written into each helper, C and C++ include as little as they can,
 * C's integer-against-floating dispatch, Python's fallback for unequal values that print the
 * same, and the JavaScript helper — the one Node can run here — follows the protocol and the
 * equality rules (safe integers exact, larger numbers within the tolerance). The other
 * languages ran on the Piston server: fixtures/exercise, read by exercise.test.js. Run with
 * `npm run test:shared`.
 * To change it: a new language's helper in ../checkHelpers.js gets a test here, and its real answers in
 * fixtures/exercise.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
	CHECK_HELPERS,
	CHECK_MARKER,
	FLOAT32_TOLERANCE,
	FLOAT_TOLERANCE,
	MAX_SHOWN_CHARS,
	TYPESCRIPT_CHECK_DECLARATION,
} from '../checkHelpers.js';
import { parseCheckResults } from '../exercise.js';

/** The languages that promise a helper. */
const LANGUAGES = ['python', 'javascript', 'bash', 'c', 'c++', 'go'];

/** Node's require, for the JavaScript helper. */
const nodeRequire = createRequire(import.meta.url);

/**
 * Runs the JavaScript helper and then `harness` (JavaScript) in this process, with a console
 * that collects the lines; returns stdout as text.
 */
function runJavaScriptHarness(harness) {
	const printed = [];
	const fakeConsole = { log: (...parts) => printed.push(`${parts.join(' ')}\n`) };
	const program = new Function('require', 'console', '__dirname', `${CHECK_HELPERS.javascript.body}\n${harness}\n${CHECK_HELPERS.javascript.done}`);
	program(nodeRequire, fakeConsole, '/nowhere');
	return printed.join('');
}

/** The one case a JavaScript `check(...)` line produces. */
function oneJavaScriptCase(checkCall) {
	const result = parseCheckResults(runJavaScriptHarness(checkCall));
	assert.equal(result.total, 1, checkCall);
	return result.cases[0];
}

test('every promised language has a helper with a head, a body and a done statement', () => {
	assert.deepEqual(Object.keys(CHECK_HELPERS).sort(), [...LANGUAGES].sort());
	for (const language of LANGUAGES) {
		const helper = CHECK_HELPERS[language];
		assert.equal(Object.isFrozen(helper), true, language);
		for (const piece of ['head', 'body', 'done']) assert.equal(typeof helper[piece], 'string', `${language}.${piece}`);
		assert.notEqual(helper.body, '', language);
		assert.notEqual(helper.done, '', language);
		assert.match(helper.body, /\bcheck\b/, `${language} defines check`);
	}
	assert.equal(Object.isFrozen(CHECK_HELPERS), true);
});

test('the constants are written into every helper (no template slot left unfilled)', () => {
	for (const language of LANGUAGES) {
		const { head, body } = CHECK_HELPERS[language];
		assert.equal(body.includes(CHECK_MARKER), true, `${language}: the marker`);
		assert.equal(body.includes(String(MAX_SHOWN_CHARS)), true, `${language}: the length`);
		assert.doesNotMatch(head + body, /\$\{(CHECK_MARKER|MAX_SHOWN_CHARS|FLOAT_TOLERANCE|FLOAT32_TOLERANCE|FLOAT32_SHOWN_DIGITS|WORDS|DONE_RECORD|DOLLAR)/, language);
		if (language !== 'bash') assert.equal(body.includes(String(FLOAT_TOLERANCE)), true, `${language}: the tolerance`);
	}
});

test('single precision: C, C++ and Go compare a float within FLOAT32_TOLERANCE (C routes float to its own function)', () => {
	assert.ok(FLOAT32_TOLERANCE > FLOAT_TOLERANCE);
	for (const language of ['c', 'c++', 'go']) {
		assert.equal(CHECK_HELPERS[language].body.includes(String(FLOAT32_TOLERANCE)), true, language);
	}
	assert.match(CHECK_HELPERS.c.tail, /dwf_float_t: dwf_check_float,/);
	assert.match(CHECK_HELPERS.c.body, /static int dwf_check_float\(const char \*name, float got, float expected\)/);
	assert.match(CHECK_HELPERS['c++'].body, /std::is_same_v<G, float> \|\| std::is_same_v<E, float> \? single_tolerance : tolerance/);
	assert.match(CHECK_HELPERS.go.body, /dwfreflect\.Float32/);
});

test('Bash escapes every control character, for JSON (\\u00XX) and for the shown value (\\xHH)', () => {
	const { body } = CHECK_HELPERS.bash;
	assert.match(body, /if \[\[ \$text == \*\[\[:cntrl:\]\]\* \]\]; then/);
	assert.match(body, /dwf_escape "\$1" '\\\\u%04x'/);
	assert.match(body, /dwf_escape "\$1" '\\\\x%02x'/);
	assert.match(body, /text=\$\{text\/\/"\$char"\/"\$escaped"\}/, 'quoted replacement: patsub_replacement leaves it alone');
});

test('the done statement calls something the body defines (Python: under the name main.py imports it as)', () => {
	const doneName = {
		python: 'def check_done(',
		javascript: 'function dwfCheckDone(',
		bash: 'dwf_check_done() {',
		c: 'static void dwf_check_done(void)',
		'c++': 'inline void done()',
		go: 'func dwfCheckDone()',
	};
	for (const language of LANGUAGES) assert.equal(CHECK_HELPERS[language].body.includes(doneName[language]), true, language);
});

test('C and C++ put their headers in the head; Go its package clause and renamed imports', () => {
	assert.match(CHECK_HELPERS.c.head, /#include <stdio\.h>/);
	assert.match(CHECK_HELPERS['c++'].head, /#include <iostream>/);
	assert.match(CHECK_HELPERS.go.head, /^package main\n/);
	assert.match(CHECK_HELPERS.go.head, /dwffmt "fmt"/);
	assert.doesNotMatch(CHECK_HELPERS.go.head, /^\s*"fmt"/m, 'the helper\'s imports have names of their own, so a harness may import "fmt" too');
	for (const language of ['python', 'javascript', 'bash']) assert.equal(CHECK_HELPERS[language].head, '', language);
});

test('C and C++ include as little as they can: no header whose names clash with a reader\'s own (strlen, pow, bool, count, y1, index)', () => {
	const includes = (head) => [...head.matchAll(/#include <([^>]+)>/g)].map((match) => match[1]);
	assert.deepEqual(includes(CHECK_HELPERS.c.head), ['stdio.h'], 'C: only <stdio.h>');
	for (const header of ['algorithm', 'cmath', 'cstring', 'iomanip', 'math.h', 'string.h']) {
		assert.equal(includes(CHECK_HELPERS['c++'].head).includes(header), false, `C++: no <${header}>`);
	}
	const c = CHECK_HELPERS.c.body;
	for (const call of [/[^_]\bstrlen\(/, /\bstrcpy\(/, /\bmemcpy\(/, /\bstrcmp\(/, /[^_]\bisnan\(/, /[^_]\bisinf\(/, /[^_]\bfabs\(/]) {
		assert.doesNotMatch(c, call, `C calls no ${call} (its header is gone)`);
	}
	const cpp = CHECK_HELPERS['c++'].body;
	for (const call of ['std::max', 'std::isnan', 'std::isinf', 'std::fabs', 'std::setw', 'std::setfill', 'std::setprecision']) {
		assert.equal(cpp.includes(call), false, `C++ calls no ${call}`);
	}
});

test('C: an integer got against a floating expected goes to the floating-point comparison (signed and unsigned)', () => {
	const { tail } = CHECK_HELPERS.c;
	assert.match(tail, /#define DWF_INTEGER_OR_FLOATING\(expected, integer_check\) _Generic\(\(expected\), \\\n\tdwf_float_t: dwf_check_float, \\\n\tdwf_double_t: dwf_check_double, \\\n\tdwf_long_double_t: dwf_check_double, \\\n\tdefault: integer_check\)/);
	assert.match(tail, /default: DWF_INTEGER_OR_FLOATING\(\(expected\), dwf_check_integer\)\)\(\(name\), \(got\), \(expected\)\)/);
	for (const type of ['dwf_uint_t', 'dwf_ulong_t', 'dwf_ullong_t']) {
		assert.ok(tail.includes(`${type}: DWF_INTEGER_OR_FLOATING((expected), dwf_check_unsigned)`), type);
	}
	assert.ok(tail.indexOf('#define DWF_INTEGER_OR_FLOATING') < tail.indexOf('#define check('), 'the inner macro first');
});

test('Python: two unequal values that print the same are shown with their type (and address when the types are the same)', () => {
	const { body } = CHECK_HELPERS.python;
	assert.match(body, /def _show_kind\(value, other\):/);
	assert.match(body, /if not passed and got_text == expected_text:\n        got_text, expected_text = _show_kind\(got, expected\), _show_kind\(expected, got\)/);
	assert.match(body, /if type\(other\) is kind:\n        label \+= f' object at \{id\(value\):#x\}'/);
});

test('Bash: its ${ … } expansions survive the template, with single-quoted replacements', () => {
	const { body } = CHECK_HELPERS.bash;
	assert.match(body, /text=\$\{text\/\/'\\'\/'\\\\'\}/, 'backslash doubled');
	assert.match(body, /text=\$\{text\/\/'"'\/'\\"'\}/, 'quote escaped');
	assert.match(body, /\$\{#text\} > 300/);
});

test('the JavaScript helper prints one protocol line per check, then the done line', () => {
	const stdout = runJavaScriptHarness("check('add', 2 + 3, 5);\ncheck('wrong', 4, 5);");
	const lines = stdout.trimEnd().split('\n');
	assert.equal(lines.length, 3);
	assert.equal(lines[0], `${CHECK_MARKER} {"name":"add","pass":true,"got":"5","expected":"5"}`);
	assert.equal(lines[2], `${CHECK_MARKER} {"done":true}`);
	assert.deepEqual(parseCheckResults(stdout), {
		cases: [
			{ name: 'add', pass: true, got: '5', expected: '5' },
			{ name: 'wrong', pass: false, got: '4', expected: '5' },
		],
		passed: 1,
		total: 2,
		otherOutput: '',
		finished: true,
	});
});

test('JavaScript equality: numbers within the tolerance, integers exactly, NaN equals NaN', () => {
	assert.equal(oneJavaScriptCase("check('sum', 0.1 + 0.2, 0.3);").pass, true);
	assert.equal(oneJavaScriptCase("check('close', 1 / 3, 0.333333333333);").pass, true);
	assert.equal(oneJavaScriptCase("check('far', 1 / 3, 0.3333);").pass, false);
	assert.equal(oneJavaScriptCase("check('big', 1e12 + 0.0001, 1e12);").pass, true, 'relative');
	assert.equal(oneJavaScriptCase("check('integers', 10000000001, 10000000000);").pass, false);
	assert.equal(oneJavaScriptCase("check('nan', NaN, NaN);").pass, true);
	assert.equal(oneJavaScriptCase("check('infinity', Infinity, Infinity);").pass, true);
	assert.equal(oneJavaScriptCase("check('-infinity', -Infinity, Infinity);").pass, false);
});

test('JavaScript equality: a whole number beyond the safe integers is a rounded float (the tolerance); safe integers and BigInt stay exact', () => {
	assert.equal(oneJavaScriptCase("check('beyond 2^53', 0.1 * 3 * 1e17, 3e16);").pass, true);
	const factorials = "const down = (n) => { let f = 1; for (let i = n; i > 1; i--) f *= i; return f; };\nconst up = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };";
	assert.equal(parseCheckResults(runJavaScriptHarness(`${factorials}\ncheck('25! literal', down(25), 1.5511210043330986e25);`)).cases[0].pass, true, 'a descending factorial against the literal');
	assert.equal(parseCheckResults(runJavaScriptHarness(`${factorials}\ncheck('25! two orders', down(25), up(25));`)).cases[0].pass, true, 'two loop orders');
	assert.equal(oneJavaScriptCase("check('integers', 10000000001, 10000000000);").pass, false, 'safe integers: exact');
	assert.equal(oneJavaScriptCase("check('bigint', 10n ** 17n + 1n, 10n ** 17n);").pass, false, 'BigInt: exact');
	assert.equal(oneJavaScriptCase("check('2^52 + 1', 2 ** 52 + 1, 2 ** 52);").pass, false, 'below 2^53 still exact (the known limit)');
});

test('JavaScript equality: arrays and plain objects element by element, the rest by isDeepStrictEqual', () => {
	assert.equal(oneJavaScriptCase("check('array', [1, [0.1 + 0.2]], [1, [0.3]]);").pass, true);
	assert.equal(oneJavaScriptCase("check('length', [1, 2], [1, 2, 3]);").pass, false);
	assert.equal(oneJavaScriptCase("check('object', { a: 0.1 + 0.2, b: [1] }, { b: [1], a: 0.3 });").pass, true);
	assert.equal(oneJavaScriptCase("check('keys', { a: 1 }, { a: 1, b: undefined });").pass, false);
	assert.equal(oneJavaScriptCase("check('map', new Map([[1, 'a']]), new Map([[1, 'a']]));").pass, true);
	assert.equal(oneJavaScriptCase("check('set', new Set([1]), new Set([2]));").pass, false);
	assert.equal(oneJavaScriptCase("check('text', 'a', 'a');").pass, true);
	assert.equal(oneJavaScriptCase("check('number vs text', 5, '5');").pass, false);
	assert.equal(oneJavaScriptCase("check('undefined vs null', undefined, null);").pass, false);
});

test('JavaScript display: util.inspect on one line, cut to MAX_SHOWN_CHARS + …', () => {
	const shown = oneJavaScriptCase("check('shown', ['a', { b: 1 }], 'x');");
	assert.equal(shown.got, "[ 'a', { b: 1 } ]");
	assert.equal(shown.expected, "'x'");
	const long = oneJavaScriptCase("check('long', Array.from({ length: 500 }, (_, i) => i), []);");
	assert.equal(long.got.length, MAX_SHOWN_CHARS + 1);
	assert.equal(long.got.endsWith('…'), true);
	assert.equal(long.got.includes('\n'), false, 'one line');
	assert.equal(oneJavaScriptCase('check(42, 1, 1);').name, '42', 'the name as text');
});

test('the TypeScript declaration types check() with T taken from `got`', () => {
	assert.match(TYPESCRIPT_CHECK_DECLARATION, /^declare function check<T>\(name: string, got: T, expected: NoInfer<T>\): boolean;\n$/);
});
