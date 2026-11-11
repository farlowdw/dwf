/**
 * capture.mjs — runs each exercise-check CASE on a Piston server and saves the answer
 * as a fixture beside this file (<name>.json: { input, request, status, response }), for
 * ../../exercise.test.js. Not a test itself (nothing runs it but you).
 *
 * WHY
 *   exercise.js > buildCheckFiles puts the reader's code and the harness into files for Piston,
 *   and checkHelpers.js writes the `check` helper of each language. Whether those files compile
 *   and print the right protocol lines can only be seen on the real server: these fixtures are
 *   that proof. The test checks that buildCheckFiles still builds exactly the files captured here
 *   (so the layout that ships is the one that ran) and reads the captured output.
 *
 * RUN IT (from the site's folder; never print the two values, and keep runs few: a small server
 * runs one job at a time)
 *   env PISTON_BASE_URL=<the server's address> PISTON_PROXY_SECRET=<its secret> \
 *       node shared/components/CodeEditor/lib/codeRunner/__tests__/fixtures/exercise/capture.mjs [case-name …]
 *   No names: every case. It prints one line per case (never the secret).
 *
 * HOW TO CHANGE IT
 *   A case: an entry in CASES (name = the fixture's file name; the language and version it runs
 *   on — the oldest installed versions for the crash cases, so the helpers stay compatible with
 *   them). Then capture it and add its expectations to ../../exercise.test.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCheckFiles } from '../../../exercise.js';

/** This folder: the fixtures are written here. */
const FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** How long one run may take before the script gives up (ms). */
const REQUEST_TIMEOUT_MS = 60000;

/** Lines of code, each ending with "\n". */
function lines(...parts) {
	return parts.map((part) => `${part}\n`).join('');
}

/** The cases: { name, language, version, readerCode, harness }. */
const CASES = [
	{
		name: 'python-checks',
		language: 'python',
		version: '3.12.0',
		readerCode: lines(
			'def max(a, b):',
			'    return a if a > b else b',
			'',
			'',
			'def add(a, b):',
			'    return a + b',
			'',
			'',
			'def ratio(a, b):',
			'    return a / b',
			'',
			'',
			'def is_even(n):',
			'    return 1 if n % 2 == 0 else 0',
			'',
			'',
			'class Box:',
			'    def __init__(self, size):',
			'        self.size = size',
			'',
			'    def __repr__(self):',
			'        return f"Box({self.size})"',
			'',
			'',
			'print("solution loaded")',
			'',
			'if __name__ == "__main__":',
			'    print("demo: not run by a check")',
		),
		harness: lines(
			'check("add(2, 3)", add(2, 3), 5)',
			'check("add(2, 2)", add(2, 2), 5)',
			'check("ratio(1, 3)", ratio(1, 3), 0.333333333333)',
			'check("0.1 + 0.2", add(0.1, 0.2), 0.3)',
			'check("lists", [add(1, 1), 3.0], [2, 3])',
			'check("dict", {"a": add(1, 2)}, {"a": 3})',
			'check("is_even(4)", is_even(4), True)',
			'check("text", "say \\"hi\\"\\n", "say \\"hi\\"\\n")',
			'check("infinities", float("-inf"), float("inf"))',
			'check("reader max", max(2, 3), 3)',
			'check("box", Box(1), Box(1))',
		),
	},
	{
		name: 'javascript-checks',
		language: 'javascript',
		version: '20.11.1',
		readerCode: lines(
			'const add = (a, b) => a + b;',
			'',
			'function pair(a, b) {',
			'  return [a, b];',
			'}',
			'',
			'class Counter {',
			'  constructor() { this.count = 0; }',
			'  increment() { return ++this.count; }',
			'}',
			'',
			'console.log("solution loaded");',
			'module.exports = { add, pair, Counter };',
		),
		harness: lines(
			'check(\'add(2, 3)\', add(2, 3), 5);',
			'check(\'add(2, 2)\', add(2, 2), 5);',
			'check(\'0.1 + 0.2\', add(0.1, 0.2), 0.3);',
			'check(\'pair\', pair(1, \'a\'), [1, \'a\']);',
			'check(\'object\', { total: add(1, 2) }, { total: 3 });',
			'const counter = new Counter();',
			'counter.increment();',
			'check(\'Counter\', counter.increment(), 2);',
			'check(\'missing\', undefined, null);',
			'check(\'infinities\', -Infinity, Infinity);',
			'check(\'beyond 2^53\', 0.1 * 3 * 1e17, 3e16);',
		),
	},
	{
		name: 'bash-checks',
		language: 'bash',
		version: '5.2.0',
		readerCode: lines(
			'add() {',
			'  echo $(( $1 + $2 ))',
			'}',
			'',
			'greet() {',
			'  printf \'%s\\n\' "hello, $1"',
			'}',
			'',
			'red() {',
			'  printf \'\\e[31m%s\\e[0m\' "$1"',
			'}',
			'',
			'echo "solution loaded"',
		),
		harness: lines(
			'check "add 2 3" "$(add 2 3)" 5',
			'check "add 2 2" "$(add 2 2)" 5',
			'check "greet" "$(greet "world")" "hello, world"',
			'check \'quotes and \\\\\' \'say "hi" \\\\ tab\' \'say "hi" \\\\ tab\'',
			'check "tab" "$(printf \'a\\tb\')" "a b"',
			'check "colour" "$(red hi)" "hi"',
			'check "amp & tilde" "a&b~" "a&b~"',
		),
	},
	{
		name: 'c-checks',
		language: 'c',
		version: '10.2.0',
		readerCode: lines(
			'#define _GNU_SOURCE',
			'#include <math.h>',
			'#include <stdio.h>',
			'#include <string.h>',
			'#define value 42',
			'',
			'int add(int a, int b) {',
			'    return a + b;',
			'}',
			'',
			'double average(int a, int b) {',
			'    return (a + b) / 2;',
			'}',
			'',
			'int middle(int a, int b) {',
			'    return (a + b) / 2;',
			'}',
			'',
			'const char *greeting(void) {',
			'    return "hello";',
			'}',
			'',
			'float area(float r) {',
			'    return 3.14159265f * r * r;',
			'}',
			'',
			'double circle(double r) {',
			'    return M_PI * r * r;',
			'}',
			'',
			'int has_ll(const char *text) {',
			'    return strcasestr(text, "LL") != NULL;',
			'}',
			'',
			'int main(void) {',
			'    printf("%d\\n", add(2, 3));',
			'    return 0;',
			'}',
		),
		harness: lines(
			'#include <ctype.h>',
			'#include <stdbool.h>',
			'check("add(2, 3)", add(2, 3), 5);',
			'check("add(2, 2)", add(2, 2), 5);',
			'check("average(1, 2)", average(1, 2), 1.5);',
			'check("average(2, 4)", average(2, 4), 3.0);',
			'check("middle(1, 2)", middle(1, 2), 1.5);',
			'check("middle(2, 4)", middle(2, 4), 3.0);',
			'check("greeting()", greeting(), "hello");',
			'check("strlen", strlen(greeting()), 5);',
			'check("strlen vs 5.5", strlen(greeting()), 5.5);',
			'check("first letter", (char)toupper(greeting()[0]), \'H\');',
			'check("is it true", add(1, 1) == 2 ? true : false, true);',
			'check("null", (const char *)NULL, "x");',
			'int sum3(int a, int b, int c) { return add(add(a, b), c); }',
			'check("nested function", sum3(1, 2, 3), 6);',
			'check("infinities", -INFINITY, INFINITY);',
			'check("macro value", value, 42);',
			'check("area(2)", area(2), 12.566371);',
			'check("area(2) far", area(2), 12.5);',
			'check("circle(1)", circle(1), 3.141592653589793);',
			'check("has_ll", has_ll("Hello"), 1);',
			'check("long text", "01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789", "x");',
		),
	},
	{
		name: 'cpp-checks',
		language: 'c++',
		version: '10.2.0',
		readerCode: lines(
			'#include <iostream>',
			'#include <map>',
			'#include <string>',
			'#include <vector>',
			'using namespace std;',
			'',
			'class Solution {',
			'public:',
			'    vector<int> twoSum(vector<int>& nums, int target) {',
			'        for (int i = 0; i < (int)nums.size(); i++)',
			'            for (int j = i + 1; j < (int)nums.size(); j++)',
			'                if (nums[i] + nums[j] == target) return {i, j};',
			'        return {};',
			'    }',
			'};',
			'',
			'string shout(const string& word) { return word + "!"; }',
			'',
			'float area(float r) { return 3.14159265f * r * r; }',
			'unsigned char letter() { return 65; }',
			'',
			'struct Point { int x, y; };',
			'bool operator==(const Point& a, const Point& b) { return a.x == b.x && a.y == b.y; }',
			'ostream& operator<<(ostream& out, const Point& p) { return out << "(" << p.x << ", " << p.y << ")"; }',
			'string show(const Point&) { return "the reader\'s show"; }',
			'',
			'int main() {',
			'    vector<int> nums = {2, 7, 11, 15};',
			'    cout << Solution().twoSum(nums, 9)[0] << endl;',
			'}',
		),
		harness: lines(
			'#include <cmath>',
			'#include <map>',
			'std::vector<int> nums = {2, 7, 11, 15};',
			'check("twoSum(9)", Solution().twoSum(nums, 9), {0, 1});',
			'check("twoSum(26)", Solution().twoSum(nums, 26), {1, 2});',
			'check("shout", shout("hi"), "hi!");',
			'check("halves", 1 / 2.0, 0.5);',
			'check("int vs double", 7 / 2, 3.5);',
			'check("pair", std::make_pair(1, std::string("a")), std::make_pair(1, std::string("a")));',
			'std::map<std::string, int> counts = {{"a", 1}};',
			'check("map", counts, std::map<std::string, int>{{"a", 2}});',
			'check("point", Point{1, 2}, Point{1, 3});',
			'check("infinities", -HUGE_VAL, HUGE_VAL);',
			'check("area(2)", area(2), 12.566371);',
			'check("floats", std::vector<float>{0.5f, area(1)}, {0.5, 3.141593});',
			'check("letter", letter(), 66);',
		),
	},
	{
		name: 'go-checks',
		language: 'go',
		version: '1.16.2',
		readerCode: lines(
			'package main',
			'',
			'import "fmt"',
			'',
			'func add(a, b int) int64 {',
			'\treturn int64(a + b)',
			'}',
			'',
			'func words() []string {',
			'\treturn []string{"a", "b"}',
			'}',
			'',
			'func ratio(a, b float64) float64 {',
			'\treturn a / b',
			'}',
			'',
			'func area(r float32) float32 {',
			'\treturn 3.14159265 * r * r',
			'}',
			'',
			'func main() {',
			'\tfmt.Println(add(2, 3))',
			'}',
		),
		harness: lines(
			'import "strings" // ToUpper',
			'import "math"',
			'check("add(2, 3)", add(2, 3), 5)',
			'check("add(2, 2)", add(2, 2), 5)',
			'check("words", words(), []string{"a", "b"})',
			'check("ratio", ratio(1, 3), 0.333333333333)',
			'check("upper", strings.ToUpper("go"), "GO")',
			'check("text vs number", "5", 5)',
			'var nothing []int',
			'check("nil slice", nothing, []int{})',
			'check("infinities", math.Inf(-1), math.Inf(1))',
			'check("area(2)", area(2), 12.566371)',
			'check("area(2) far", area(2), 12.5)',
		),
	},
	{
		name: 'c-reader-names',
		language: 'c',
		version: '10.2.0',
		readerCode: lines(
			'#include <stdio.h>',
			'#define int long long',
			'#define float double',
			'',
			'typedef enum { false, true } bool;',
			'',
			'int strlen(const char *text) {',
			'    int length = 0;',
			"    while (text[length] != '\\0') length++;",
			'    return length;',
			'}',
			'',
			'int pow(int base, int exponent) {',
			'    int result = 1;',
			'    while (exponent-- > 0) result *= base;',
			'    return result;',
			'}',
			'',
			'bool is_even(int n) {',
			'    return n % 2 == 0 ? true : false;',
			'}',
			'',
			'float half(float x) {',
			'    return x / 2;',
			'}',
			'',
			'signed main(void) {',
			'    printf("%lld %lld %d\\n", pow(2, 10), strlen("hello"), is_even(4));',
			'    return 0;',
			'}',
		),
		harness: lines(
			'check("strlen(\\"hello\\")", strlen("hello"), 5);',
			'check("pow(2, 10)", pow(2, 10), 1024);',
			'check("is_even(4)", is_even(4), true);',
			'check("half(3)", half(3), 1.5);',
		),
	},
	{
		name: 'cpp-reader-names',
		language: 'c++',
		version: '10.2.0',
		readerCode: lines(
			'#include <iostream>',
			'using namespace std;',
			'#define int long long',
			'',
			'int count = 0;',
			'int x0, y0, x1, y1;',
			'int index = 3;',
			'',
			'int tally() {',
			'    count++;',
			'    return count;',
			'}',
			'',
			'int area(int width, int height) {',
			'    x1 = width;',
			'    y1 = height;',
			'    return x1 * y1;',
			'}',
			'',
			'signed main() {',
			'    tally();',
			'    cout << area(2, 3) << " " << index << endl;',
			'}',
		),
		harness: lines(
			'check("tally()", tally(), 1);',
			'check("area(2, 3)", area(2, 3), 6);',
			'check("index", index, 3);',
			'check("count after one tally", count, 1);',
		),
	},
	{
		name: 'python-reader-crash',
		language: 'python',
		version: '3.9.4',
		readerCode: lines(
			'def get(items, i):',
			'    return items[i]',
		),
		harness: lines(
			'check("get first", get([1, 2, 3], 0), 1)',
			'check("get tenth", get([1, 2, 3], 9), None)',
			'check("never runs", 1, 1)',
		),
	},
	{
		name: 'javascript-reader-crash',
		language: 'javascript',
		version: '16.3.0',
		readerCode: lines(
			'function first(items) {',
			'  return items[0].name;',
			'}',
		),
		harness: lines(
			'check(\'first\', first([{ name: \'a\' }]), \'a\');',
			'check(\'first of none\', first([]), undefined);',
		),
	},
	{
		name: 'python-reader-syntax-error',
		language: 'python',
		version: '3.12.0',
		readerCode: lines(
			'def add(a, b):',
			'    return a +',
		),
		harness: lines(
			'check("add", add(1, 2), 3)',
		),
	},
	{
		name: 'javascript-reader-syntax-error',
		language: 'javascript',
		version: '20.11.1',
		readerCode: lines(
			'function add(a, b) {',
			'  return a +;',
			'}',
		),
		harness: lines(
			'check(\'add\', add(1, 2), 3);',
		),
	},
	{
		name: 'bash-reader-error',
		language: 'bash',
		version: '5.2.0',
		readerCode: lines(
			'count() {',
			'  wc_not_a_command -l',
			'  echo 0',
			'}',
		),
		harness: lines(
			'check "count" "$(count)" 0',
		),
	},
	{
		name: 'c-reader-compile-error',
		language: 'c',
		version: '10.2.0',
		readerCode: lines(
			'#include <stdio.h>',
			'',
			'int add(int a, int b) {',
			'    return a + c;',
			'}',
		),
		harness: lines(
			'check("add", add(1, 2), 3);',
		),
	},
	{
		name: 'cpp-reader-compile-error',
		language: 'c++',
		version: '10.2.0',
		readerCode: lines(
			'#include <string>',
			'',
			'int twice(int x) {',
			'    return x * 2',
			'}',
			'',
			'int main() {',
			'}',
		),
		harness: lines(
			'check("twice", twice(2), 4);',
		),
	},
	{
		name: 'go-reader-compile-error',
		language: 'go',
		version: '1.16.2',
		readerCode: lines(
			'package main',
			'',
			'func add(a, b int) int {',
			'\treturn a + c',
			'}',
			'',
			'func main() {',
			'}',
		),
		harness: lines(
			'check("add", add(1, 2), 3)',
		),
	},
];

/** The server's address and secret, from the environment (never printed). */
function serverSettings() {
	const base = process.env.PISTON_BASE_URL;
	const secret = process.env.PISTON_PROXY_SECRET;
	if (!base || !secret) throw new Error('Set PISTON_BASE_URL and PISTON_PROXY_SECRET (see the header).');
	return { url: `${base.replace(/\/+$/, '')}/api/v2/execute`, secret };
}

/** One run on the server: { status, response } (response null when the body is not JSON). */
async function execute(settings, request) {
	const answer = await fetch(settings.url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-piston-proxy-secret': settings.secret },
		body: JSON.stringify(request),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	const text = await answer.text();
	try {
		return { status: answer.status, response: JSON.parse(text) };
	} catch {
		return { status: answer.status, response: null };
	}
}

/** The fixture of one case, written to <name>.json; returns a one-line summary. */
async function capture(settings, testCase) {
	const input = { language: testCase.language, readerCode: testCase.readerCode, harness: testCase.harness };
	const built = buildCheckFiles(input);
	const request = { language: built.runLanguage, version: testCase.version, files: built.files };
	const { status, response } = await execute(settings, request);
	const record = { input, request, status, response };
	fs.writeFileSync(path.join(FIXTURE_DIR, `${testCase.name}.json`), `${JSON.stringify(record, null, 1)}\n`);
	const compile = response?.compile?.code ?? '-';
	const run = response?.run?.code ?? '-';
	return `${testCase.name.padEnd(28)} HTTP ${status}  compile ${compile}  run ${run}`;
}

/** Capture the cases named on the command line, or every case. */
async function main() {
	const settings = serverSettings();
	const wanted = process.argv.slice(2);
	const chosen = wanted.length === 0 ? CASES : CASES.filter((testCase) => wanted.includes(testCase.name));
	for (const testCase of chosen) console.log(await capture(settings, testCase));
}

await main();
