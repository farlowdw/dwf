/**
 * checkHelpers.js — the CHECK PROTOCOL of an exercise (the editor's `tests` prop) and, for each
 * language that speaks it, the `check(name, got, expected)` helper as source text, in pieces
 * that exercise.js > buildCheckFiles places around the reader's code and the harness. Pure
 * strings; no React, no DOM.
 *
 * THE PROTOCOL
 *   Every check(...) call prints ONE line to standard output and flushes it at once (so the lines
 *   printed before a crash survive):
 *     @@check@@ {"name":"add(2, 3)","pass":true,"got":"5","expected":"5"}
 *   name             the name the harness gave the check
 *   pass             whether got equals expected (EQUALITY below)
 *   got / expected   the two values as text, written the language's own way (Python's repr,
 *                    Node's util.inspect, Go's %v with strings in %q, C's printf, C++'s
 *                    operator<<), cut to MAX_SHOWN_CHARS characters + '…' (WORDS.cut)
 *   When the harness has run to its end it prints   @@check@@ {"done":true}
 *   A harness that crashed half way never does (exercise.js > parseCheckResults then says
 *   `finished: false`). Everything else on stdout — the reader's own prints — is left alone.
 *   A reader could print such a line by hand and "pass": Check is for learning, not grading.
 *
 * EQUALITY (the same rules in every language, as far as the language allows)
 *   numbers     a floating-point number on either side: equal within FLOAT_TOLERANCE, relative
 *               (|got - expected| <= 1e-9 × max(1, |got|, |expected|)); within
 *               FLOAT32_TOLERANCE (1e-6) when a side is single precision (C / C++ float, Go
 *               float32: about 7 digits, shown with 7); NaN equals NaN; an infinity equals only
 *               the same infinity; integers exactly.
 *   containers  element by element with these same rules (Python lists, tuples and dicts; JS
 *               arrays and plain objects; C++ ranges and pairs; Go slices and arrays).
 *   text        exactly.
 *   the rest    the language's own equality (Python ==, Node's util.isDeepStrictEqual, C++ ==,
 *               Go's reflect.DeepEqual).
 *   python      True is not 1 (bool and int differ); a list never equals a tuple. A class of
 *               the reader's equals another object only through its own __eq__ (a @dataclass
 *               has one; without it Python compares identity). When two values differ but
 *               print the same (two Box(1) objects without __eq__), both are shown with their
 *               type, and with their address when the types are the same
 *               ("Box object at 0x7f…: Box(1)").
 *   javascript  also TypeScript, which runs as the JavaScript that tsc emits. JavaScript has
 *               one number type, so a number counts as an integer (compared exactly) only when
 *               it is whole AND a safe integer (|n| <= Number.MAX_SAFE_INTEGER, 2^53 - 1): a
 *               larger number is a rounded float and gets the tolerance (25! computed in two
 *               orders passes). Whole numbers between 2^52 and 2^53 still compare exactly (no
 *               way to tell them from integers); BigInt compares exactly.
 *   bash        check NAME GOT EXPECTED, e.g. check "add 2 3" "$(add 2 3)" 5: text, exactly;
 *               both shown in double quotes, with \ " newline tab CR escaped as C does, and any
 *               other control character as \xHH (an ANSI colour code shows as \x1b[31m).
 *   c           check is a _Generic macro over got's type: signed integers (long long), unsigned
 *               int / long / long long, float (single precision: FLOAT32_TOLERANCE) / double /
 *               long double, _Bool, char, and char * / const char * (compared character by
 *               character; NULL equals only NULL). An integer got against a float / double /
 *               long double expected compares as floating point, as in C++ (average(1, 2)
 *               returning int 1 fails against 1.5, and shows Expected 1.5); otherwise expected
 *               is converted to got's type. A struct or an array: check its fields one by
 *               one. A reader's own function named check is called from the harness as
 *               (check)(…): the parentheses keep the macro away.
 *   c++         templates (C++17): arithmetic types (int against double compares as doubles; a
 *               float on either side within FLOAT32_TOLERANCE), text (std::string,
 *               std::string_view, const char *, char arrays), std::pair, any range
 *               (std::vector, std::list, std::set, std::map …), else ==. expected may be a
 *               braced list, check("…", v, {0, 1}) (not an empty one: write std::vector<int>{}).
 *               Integers show as numbers (a uint8_t too, never as a letter); another value
 *               prints with its operator<< when it has one, else as '<unprintable>'.
 *   go          numbers of any kinds compare by value (int64(5) equals 5; a float32 on either
 *               side within FLOAT32_TOLERANCE); slices and arrays element by element; nil
 *               equals a nil or empty slice; else reflect.DeepEqual. When two values differ but
 *               print the same, both are shown with %#v (types visible).
 *
 * THE PIECES (CHECK_HELPERS, keyed by Piston language name; exercise.js > LAYOUTS places them)
 *   head   the very top of the harness file: C / C++ #includes, Go's package clause and imports
 *          (under names of their own: dwffmt …, so a harness may import "fmt" too); '' elsewhere.
 *          C and C++ include AS LITTLE AS THEY CAN, because the reader's code sees every header
 *          the helper includes during a check, though not during a Run: math.h's pow / y0 / y1,
 *          string.h's strlen / index, stdbool.h's true and false, <algorithm>'s count would
 *          clash with a reader's own names and fail a check of code that runs (seen on the
 *          server, 2026-10-25). So C includes only <stdio.h> (its own string loops and gcc's
 *          __builtin_isnan / __builtin_isinf / __builtin_fabs do the rest: inline, no symbol a
 *          reader's own strlen could answer at link time), and C++ only <initializer_list>,
 *          <iostream>, <iterator>, <optional>, <sstream>, <string>, <string_view>,
 *          <type_traits>, <utility> and <vector>. A harness #includes what else it uses
 *          (<stdbool.h> for true, <math.h> for INFINITY, <cmath> for HUGE_VAL …).
 *   body   the helper. Where it goes, and why:
 *            python      a module of its own, dwf_check.py, imported AFTER the reader's names, so
 *                        its `check` wins over a reader's, and a reader's `max` or `print`
 *                        cannot reach the helper's builtins
 *            javascript  before the reader's code runs (its module scope wins anyway)
 *            bash        after `source ./solution.sh`, so its `check` wins over a reader's
 *            c / c++     BEFORE the reader's code, so a reader's #define cannot rewrite it;
 *                        C++ calls its own templates qualified (dwf_check::show), so a reader's
 *                        function of the same name is never picked by argument-dependent lookup
 *            go          anywhere in main.go (the reader's code is another file)
 *   tail   after the reader's code: C's `check` macro (before it, it would rewrite a reader's own
 *          check( … )); '' elsewhere. Its _Generic names its types through typedefs (dwf_uint_t
 *          …, declared in the body, BEFORE the reader's code): the macro's text is expanded
 *          where the harness calls it, after the reader's #defines, and a reader's
 *          `#define int long long` would turn `unsigned int` into a second
 *          `unsigned long long` (or `#define float double` make two `double`s), which gcc
 *          refuses; a typedef's name no reader macro touches.
 *   done   the statement that prints the "done" line, placed after the harness (Python's calls
 *          check_done under the name exercise.js's import line gives it, _dwf_check_done)
 *   Every name a helper adds besides `check` starts with dwf / _dwf / DWF (the namespace
 *   dwf_check in C++; Python's other names stay in their module). Clashes that remain: in Go a
 *   reader's own top-level `check` (or `len`) clashes with the helper (one package, no
 *   overloading); in C++ a reader's non-template check(std::string, …) of three arguments would
 *   be chosen over the helper's templates; a header the HARNESS #includes is in the reader's
 *   scope too (it goes to the top of the file: placed after the reader's code, a reader's
 *   `#define int long long` would rewrite the header instead), so a harness that includes
 *   <algorithm> makes a reader's global `count` ambiguous under `using namespace std`.
 *   TypeScript's type checker needs check's declaration: TYPESCRIPT_CHECK_DECLARATION.
 *
 * HOW TO CHANGE IT
 *   The protocol's marker: CHECK_MARKER (each helper takes it from here). How long a shown value
 *   may be: MAX_SHOWN_CHARS; the tolerances: FLOAT_TOLERANCE and FLOAT32_TOLERANCE (all written
 *   into the helpers), and the digits a single-precision value shows: FLOAT32_SHOWN_DIGITS;
 *   the words the helpers print: WORDS. Every helper must print valid JSON (each control
 *   character escaped): parseCheckResults tries once more with them escaped, but a record it
 *   cannot read is lost from the results.
 *   A helper: its source below — each is plain code of its language, in a String.raw template
 *   (backslashes stay as written; `${…}` puts a constant in; a template cannot hold `${` itself,
 *   so Bash's `${` is written `${DOLLAR}{`). After a change, run its fixture again on the Piston
 *   server (__tests__/fixtures/exercise/capture.mjs; its header says how): the test
 *   __tests__/exercise.test.js fails while the harness files differ from the ones captured.
 *   C / C++'s head: add a header only when the helper cannot do without it, and capture the
 *   c-reader-names / cpp-reader-names fixtures again (a reader whose own strlen, pow, bool,
 *   count, y1, index and `#define int long long` must still pass).
 *   A new language: a helper here, a layout in exercise.js > LAYOUTS.
 *   The helper sources name src/lib/codeRunner/checkHelpers.js on purpose (the library's home
 *   before 2026-10-26): the server-captured fixtures (__tests__/exercise.test.js) hold that text
 *   byte for byte, so the name changes only with a re-capture (fixtures/exercise/capture.mjs).
 */

/** The start of every protocol line. */
export const CHECK_MARKER = '@@check@@';

/** Values are shown cut to this many characters (then WORDS.cut). */
export const MAX_SHOWN_CHARS = 300;

/** Relative tolerance of a floating-point comparison (see EQUALITY in the header). */
export const FLOAT_TOLERANCE = 1e-9;

/**
 * Relative tolerance when a side is SINGLE precision (C / C++ `float`, Go `float32`): a float
 * holds about 7 digits, so 1e-9 would make `check("area", area(2), 12.566371)` fail for the very
 * value the program prints.
 */
export const FLOAT32_TOLERANCE = 1e-6;

/** How many significant digits a single-precision value is shown with (C, C++; Go's %v picks its own). */
const FLOAT32_SHOWN_DIGITS = 7;

/** The few words the helpers print. */
const WORDS = Object.freeze({
	unprintable: '<unprintable>',
	cut: '…',
});

/** A dollar sign, for Bash's `${` (a template literal cannot hold `${` itself). */
const DOLLAR = '$';

/** The JSON of the "done" line's record. */
const DONE_RECORD = '{"done":true}';

/** The same inside a double-quoted string literal (C, C++, Go): each " as \". */
const DONE_RECORD_ESCAPED = '{\\"done\\":true}';

/**
 * Python 3 (3.9 and later): a MODULE of its own (exercise.js writes it as dwf_check.py), so the
 * reader's names that `from solution import *` brings into main.py (a `max` or `len` of their
 * own, say) cannot change the builtins the helper uses.
 */
const PYTHON_BODY = String.raw`# dwf_check.py — the check helper of an exercise (src/lib/codeRunner/checkHelpers.js)
import json
import math

MARKER = '${CHECK_MARKER}'
TOLERANCE = ${FLOAT_TOLERANCE}
SHOWN_MAX = ${MAX_SHOWN_CHARS}


def _close(got, expected):
    if got == expected:
        return True
    try:
        got, expected = float(got), float(expected)
    except OverflowError:
        return False
    if math.isnan(got) and math.isnan(expected):
        return True
    if math.isinf(got) or math.isinf(expected):
        return False
    scale = max(1.0, abs(got), abs(expected))
    return abs(got - expected) <= TOLERANCE * scale


def _is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _same_items(got, expected):
    if len(got) != len(expected):
        return False
    return all(_same(one, other) for one, other in zip(got, expected))


def _same(got, expected):
    if isinstance(got, bool) or isinstance(expected, bool):
        return type(got) is type(expected) and got == expected
    if _is_number(got) and _is_number(expected):
        if isinstance(got, float) or isinstance(expected, float):
            return _close(got, expected)
        return got == expected
    if isinstance(got, (list, tuple)) and type(got) is type(expected):
        return _same_items(got, expected)
    if isinstance(got, dict) and isinstance(expected, dict):
        if got.keys() != expected.keys():
            return False
        return all(_same(got[key], expected[key]) for key in got)
    try:
        return bool(got == expected)
    except Exception:
        return False


def _show(value):
    try:
        text = repr(value)
    except Exception:
        text = '${WORDS.unprintable}'
    if len(text) > SHOWN_MAX:
        text = text[:SHOWN_MAX] + '${WORDS.cut}'
    return text


def _show_kind(value, other):
    kind = type(value)
    label = kind.__qualname__
    if type(other) is kind:
        label += f' object at {id(value):#x}'
    return label + ': ' + _show(value)


def check(name, got, expected):
    passed = _same(got, expected)
    got_text, expected_text = _show(got), _show(expected)
    if not passed and got_text == expected_text:
        got_text, expected_text = _show_kind(got, expected), _show_kind(expected, got)
    record = {'name': str(name), 'pass': passed, 'got': got_text, 'expected': expected_text}
    print(MARKER + ' ' + json.dumps(record), flush=True)
    return passed


def check_done():
    print(MARKER + ' ${DONE_RECORD}', flush=True)
`;

/**
 * JavaScript (Node 16 and later) and TypeScript's emitted JavaScript. dwfLoadReaderCode runs the
 * reader's file as a script of this program, so its top-level functions, classes and variables
 * become names the harness can use without an export (exercise.js > LAYOUTS has the call).
 */
const JAVASCRIPT_BODY = String.raw`
// --- check helper (src/lib/codeRunner/checkHelpers.js) ---
const dwfFs = require('fs');
const dwfPath = require('path');
const dwfUtil = require('util');
const dwfVm = require('vm');

const DWF_MARKER = '${CHECK_MARKER}';
const DWF_TOLERANCE = ${FLOAT_TOLERANCE};
const DWF_SHOWN_MAX = ${MAX_SHOWN_CHARS};

function dwfCloseNumbers(got, expected) {
	if (got === expected) return true;
	if (Number.isNaN(got) && Number.isNaN(expected)) return true;
	if (!Number.isFinite(got) || !Number.isFinite(expected)) return false;
	if (Number.isSafeInteger(got) && Number.isSafeInteger(expected)) return false;
	const scale = Math.max(1, Math.abs(got), Math.abs(expected));
	return Math.abs(got - expected) <= DWF_TOLERANCE * scale;
}

function dwfIsPlainObject(value) {
	if (value === null || typeof value !== 'object') return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function dwfSameArrays(got, expected) {
	if (got.length !== expected.length) return false;
	return got.every((item, index) => dwfSame(item, expected[index]));
}

function dwfSameObjects(got, expected) {
	const keys = Object.keys(got);
	if (keys.length !== Object.keys(expected).length) return false;
	return keys.every((key) => Object.prototype.hasOwnProperty.call(expected, key) && dwfSame(got[key], expected[key]));
}

function dwfSame(got, expected) {
	if (typeof got === 'number' && typeof expected === 'number') return dwfCloseNumbers(got, expected);
	if (Array.isArray(got) && Array.isArray(expected)) return dwfSameArrays(got, expected);
	if (dwfIsPlainObject(got) && dwfIsPlainObject(expected)) return dwfSameObjects(got, expected);
	return dwfUtil.isDeepStrictEqual(got, expected);
}

function dwfShow(value) {
	let text;
	try {
		text = dwfUtil.inspect(value, { compact: true, depth: 6, breakLength: Infinity, maxArrayLength: 100, maxStringLength: DWF_SHOWN_MAX });
	} catch (error) {
		text = '${WORDS.unprintable}';
	}
	if (text.length > DWF_SHOWN_MAX) text = text.slice(0, DWF_SHOWN_MAX) + '${WORDS.cut}';
	return text;
}

function check(name, got, expected) {
	const pass = dwfSame(got, expected);
	const record = { name: String(name), pass, got: dwfShow(got), expected: dwfShow(expected) };
	console.log(DWF_MARKER + ' ' + JSON.stringify(record));
	return pass;
}

function dwfCheckDone() {
	console.log(DWF_MARKER + ' ${DONE_RECORD}');
}

function dwfLoadReaderCode(fileName) {
	const file = dwfPath.join(__dirname, fileName);
	const readerModule = { exports: {} };
	globalThis.require = require;
	globalThis.module = readerModule;
	globalThis.exports = readerModule.exports;
	dwfVm.runInThisContext(dwfFs.readFileSync(file, 'utf8'), { filename: file });
}
// --- end of the check helper ---
`;

/**
 * Bash (5.x). The replacement texts are quoted, so Bash 5.2's patsub_replacement leaves them
 * alone. dwf_escape escapes EVERY control character: JSON allows none raw, and a record that is
 * not valid JSON would drop out of the results (an ANSI colour code in a reader's output did).
 */
const BASH_BODY = String.raw`
# --- check helper (src/lib/codeRunner/checkHelpers.js) ---
dwf_escape() {
	local text=$1 format=$2 code hex char escaped
	text=${DOLLAR}{text//'\'/'\\'}
	text=${DOLLAR}{text//'"'/'\"'}
	text=${DOLLAR}{text//$'\n'/'\n'}
	text=${DOLLAR}{text//$'\r'/'\r'}
	text=${DOLLAR}{text//$'\t'/'\t'}
	if [[ $text == *[[:cntrl:]]* ]]; then
		for (( code = 1; code < 32; code++ )); do
			printf -v hex '%02x' "$code"
			printf -v char "\\x$hex"
			printf -v escaped "$format" "$code"
			text=${DOLLAR}{text//"$char"/"$escaped"}
		done
	fi
	DWF_ESCAPED=$text
}

dwf_json() {
	dwf_escape "$1" '\\u%04x'
	printf '"%s"' "$DWF_ESCAPED"
}

dwf_show() {
	dwf_escape "$1" '\\x%02x'
	local text="\"$DWF_ESCAPED\""
	if (( ${DOLLAR}{#text} > ${MAX_SHOWN_CHARS} )); then
		text="${DOLLAR}{text:0:${MAX_SHOWN_CHARS}}${WORDS.cut}"
	fi
	printf '%s' "$text"
}

check() {
	local name=$1 got=$2 expected=$3 pass=false
	if [[ "$got" == "$expected" ]]; then
		pass=true
	fi
	printf '${CHECK_MARKER} {"name":%s,"pass":%s,"got":%s,"expected":%s}\n' \
		"$(dwf_json "$name")" "$pass" "$(dwf_json "$(dwf_show "$got")")" "$(dwf_json "$(dwf_show "$expected")")"
	return 0
}

dwf_check_done() {
	printf '%s\n' '${CHECK_MARKER} ${DONE_RECORD}'
}
# --- end of the check helper ---
`;

/**
 * C (C11, gcc): the headers, at the top of the file. Only <stdio.h>: every header here is in
 * the reader's scope during a check (THE PIECES in the header says why that matters).
 */
const C_HEAD = String.raw`/* --- check helper: headers (src/lib/codeRunner/checkHelpers.js) --- */
#include <stdio.h>
`;

/**
 * C (C11, gcc): the helper. Its own dwf_length / dwf_copy / dwf_same_text instead of <string.h>
 * (gcc's __builtin_strlen would still call a reader's own strlen at link time), and gcc's
 * __builtin_isnan / __builtin_isinf / __builtin_fabs instead of <math.h> (inline: no symbol,
 * no -lm). The typedefs name the types of the check macro's _Generic (C_TAIL).
 */
const C_BODY = String.raw`
/* --- check helper (src/lib/codeRunner/checkHelpers.js) --- */
#define DWF_SHOWN_MAX ${MAX_SHOWN_CHARS}
#define DWF_TEXT_SIZE (DWF_SHOWN_MAX + 16)
#define DWF_TOLERANCE ${FLOAT_TOLERANCE}
#define DWF_SINGLE_TOLERANCE ${FLOAT32_TOLERANCE}
#define DWF_SINGLE_FORMAT "%.${FLOAT32_SHOWN_DIGITS}g"
#define DWF_CUT "${WORDS.cut}"

typedef _Bool dwf_bool_t;
typedef char dwf_char_t;
typedef char *dwf_string_t;
typedef const char *dwf_const_string_t;
typedef float dwf_float_t;
typedef double dwf_double_t;
typedef long double dwf_long_double_t;
typedef unsigned int dwf_uint_t;
typedef unsigned long dwf_ulong_t;
typedef unsigned long long dwf_ullong_t;

typedef struct {
	char text[DWF_TEXT_SIZE];
	size_t length;
	int full;
} dwf_text;

static size_t dwf_length(const char *text) {
	size_t length = 0;
	while (text[length] != '\0') length++;
	return length;
}

static void dwf_copy(char *to, const char *from) {
	size_t index;
	for (index = 0; from[index] != '\0'; index++) to[index] = from[index];
	to[index] = '\0';
}

static int dwf_same_text(const char *one, const char *other) {
	size_t index = 0;
	while (one[index] != '\0' && one[index] == other[index]) index++;
	return one[index] == other[index];
}

static void dwf_append(dwf_text *shown, const char *part) {
	size_t part_length = dwf_length(part);
	if (shown->full) return;
	if (shown->length + part_length > DWF_SHOWN_MAX) {
		dwf_copy(shown->text + shown->length, DWF_CUT);
		shown->length += dwf_length(DWF_CUT);
		shown->full = 1;
		return;
	}
	dwf_copy(shown->text + shown->length, part);
	shown->length += part_length;
}

static void dwf_append_char(dwf_text *shown, char c, char quote) {
	char part[8];
	if (c == quote || c == '\\') snprintf(part, sizeof part, "\\%c", c);
	else if (c == '\n') dwf_copy(part, "\\n");
	else if (c == '\r') dwf_copy(part, "\\r");
	else if (c == '\t') dwf_copy(part, "\\t");
	else if ((unsigned char)c < 0x20) snprintf(part, sizeof part, "\\x%02x", (unsigned char)c);
	else snprintf(part, sizeof part, "%c", c);
	dwf_append(shown, part);
}

static void dwf_show_string(dwf_text *shown, const char *value) {
	if (value == NULL) {
		dwf_append(shown, "NULL");
		return;
	}
	dwf_append(shown, "\"");
	for (const char *p = value; *p != '\0' && !shown->full; p++) dwf_append_char(shown, *p, '"');
	dwf_append(shown, "\"");
}

static void dwf_print_json(const char *text) {
	putchar('"');
	for (const unsigned char *p = (const unsigned char *)text; *p != '\0'; p++) {
		if (*p == '"' || *p == '\\') printf("\\%c", *p);
		else if (*p == '\n') fputs("\\n", stdout);
		else if (*p == '\r') fputs("\\r", stdout);
		else if (*p == '\t') fputs("\\t", stdout);
		else if (*p < 0x20) printf("\\u%04x", *p);
		else putchar(*p);
	}
	putchar('"');
}

static int dwf_report(const char *name, int pass, const char *got, const char *expected) {
	fputs("${CHECK_MARKER} {\"name\":", stdout);
	dwf_print_json(name == NULL ? "" : name);
	printf(",\"pass\":%s,\"got\":", pass ? "true" : "false");
	dwf_print_json(got);
	fputs(",\"expected\":", stdout);
	dwf_print_json(expected);
	fputs("}\n", stdout);
	fflush(stdout);
	return pass;
}

static int dwf_close_enough(double got, double expected, double tolerance) {
	double scale = 1.0;
	if (got == expected) return 1;
	if (__builtin_isnan(got) && __builtin_isnan(expected)) return 1;
	if (__builtin_isinf(got) || __builtin_isinf(expected)) return 0;
	if (__builtin_fabs(got) > scale) scale = __builtin_fabs(got);
	if (__builtin_fabs(expected) > scale) scale = __builtin_fabs(expected);
	return __builtin_fabs(got - expected) <= tolerance * scale;
}

static int dwf_check_integer(const char *name, long long got, long long expected) {
	char got_text[32], expected_text[32];
	snprintf(got_text, sizeof got_text, "%lld", got);
	snprintf(expected_text, sizeof expected_text, "%lld", expected);
	return dwf_report(name, got == expected, got_text, expected_text);
}

static int dwf_check_unsigned(const char *name, unsigned long long got, unsigned long long expected) {
	char got_text[32], expected_text[32];
	snprintf(got_text, sizeof got_text, "%llu", got);
	snprintf(expected_text, sizeof expected_text, "%llu", expected);
	return dwf_report(name, got == expected, got_text, expected_text);
}

static int dwf_check_double(const char *name, double got, double expected) {
	char got_text[40], expected_text[40];
	snprintf(got_text, sizeof got_text, "%.15g", got);
	snprintf(expected_text, sizeof expected_text, "%.15g", expected);
	return dwf_report(name, dwf_close_enough(got, expected, DWF_TOLERANCE), got_text, expected_text);
}

static int dwf_check_float(const char *name, float got, float expected) {
	char got_text[40], expected_text[40];
	snprintf(got_text, sizeof got_text, DWF_SINGLE_FORMAT, got);
	snprintf(expected_text, sizeof expected_text, DWF_SINGLE_FORMAT, expected);
	return dwf_report(name, dwf_close_enough(got, expected, DWF_SINGLE_TOLERANCE), got_text, expected_text);
}

static int dwf_check_bool(const char *name, _Bool got, _Bool expected) {
	return dwf_report(name, got == expected, got ? "true" : "false", expected ? "true" : "false");
}

static int dwf_check_char(const char *name, char got, char expected) {
	dwf_text got_text = { { 0 }, 0, 0 };
	dwf_text expected_text = { { 0 }, 0, 0 };
	dwf_append(&got_text, "'");
	dwf_append_char(&got_text, got, '\'');
	dwf_append(&got_text, "'");
	dwf_append(&expected_text, "'");
	dwf_append_char(&expected_text, expected, '\'');
	dwf_append(&expected_text, "'");
	return dwf_report(name, got == expected, got_text.text, expected_text.text);
}

static int dwf_check_string(const char *name, const char *got, const char *expected) {
	dwf_text got_text = { { 0 }, 0, 0 };
	dwf_text expected_text = { { 0 }, 0, 0 };
	int pass = (got == NULL || expected == NULL) ? got == expected : dwf_same_text(got, expected);
	dwf_show_string(&got_text, got);
	dwf_show_string(&expected_text, expected);
	return dwf_report(name, pass, got_text.text, expected_text.text);
}

static void dwf_check_done(void) {
	puts("${CHECK_MARKER} ${DONE_RECORD_ESCAPED}");
	fflush(stdout);
}
/* --- end of the check helper --- */
`;

/**
 * C: the check macro, AFTER the reader's code (it would rewrite a reader's own `check(`). The
 * types are the body's typedefs (THE PIECES > tail); DWF_INTEGER_OR_FLOATING sends an integer
 * `got` against a floating `expected` to the floating-point comparison (EQUALITY > c).
 */
const C_TAIL = String.raw`
/* --- check helper: the macro (src/lib/codeRunner/checkHelpers.js) --- */
#define DWF_INTEGER_OR_FLOATING(expected, integer_check) _Generic((expected), \
	dwf_float_t: dwf_check_float, \
	dwf_double_t: dwf_check_double, \
	dwf_long_double_t: dwf_check_double, \
	default: integer_check)
#define check(name, got, expected) _Generic((got), \
	dwf_bool_t: dwf_check_bool, \
	dwf_char_t: dwf_check_char, \
	dwf_string_t: dwf_check_string, \
	dwf_const_string_t: dwf_check_string, \
	dwf_float_t: dwf_check_float, \
	dwf_double_t: dwf_check_double, \
	dwf_long_double_t: dwf_check_double, \
	dwf_uint_t: DWF_INTEGER_OR_FLOATING((expected), dwf_check_unsigned), \
	dwf_ulong_t: DWF_INTEGER_OR_FLOATING((expected), dwf_check_unsigned), \
	dwf_ullong_t: DWF_INTEGER_OR_FLOATING((expected), dwf_check_unsigned), \
	default: DWF_INTEGER_OR_FLOATING((expected), dwf_check_integer))((name), (got), (expected))
`;

/**
 * C++ (C++17, g++): the headers, at the top of the file. No <algorithm>, <cmath>, <cstring> or
 * <iomanip>: they would put std::count, ::y0 / ::y1, ::index … in the reader's scope during a
 * check (THE PIECES in the header).
 */
const CPP_HEAD = String.raw`// --- check helper: headers (src/lib/codeRunner/checkHelpers.js) ---
#include <initializer_list>
#include <iostream>
#include <iterator>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>
#include <vector>
`;

/** C++ (C++17, g++): the helper. */
const CPP_BODY = String.raw`
// --- check helper (src/lib/codeRunner/checkHelpers.js) ---
namespace dwf_check {

constexpr double tolerance = ${FLOAT_TOLERANCE};
constexpr double single_tolerance = ${FLOAT32_TOLERANCE};
constexpr int single_digits = ${FLOAT32_SHOWN_DIGITS};
constexpr int double_digits = 15;
constexpr std::size_t shown_max = ${MAX_SHOWN_CHARS};

template <class T, class = void> struct is_printable : std::false_type {};
template <class T> struct is_printable<T, std::void_t<decltype(std::declval<std::ostream &>() << std::declval<const T &>())>> : std::true_type {};

template <class T, class = void> struct is_range : std::false_type {};
template <class T> struct is_range<T, std::void_t<decltype(std::begin(std::declval<const T &>())), decltype(std::end(std::declval<const T &>()))>> : std::true_type {};

template <class T> struct is_pair : std::false_type {};
template <class A, class B> struct is_pair<std::pair<A, B>> : std::true_type {};

template <class T> struct is_text : std::false_type {};
template <> struct is_text<std::string> : std::true_type {};
template <> struct is_text<std::string_view> : std::true_type {};
template <> struct is_text<const char *> : std::true_type {};
template <> struct is_text<char *> : std::true_type {};
template <std::size_t N> struct is_text<char[N]> : std::true_type {};
template <std::size_t N> struct is_text<const char[N]> : std::true_type {};

template <class T>
std::optional<std::string> text_of(const T &value) {
	if constexpr (std::is_pointer_v<T>) {
		if (value == nullptr) return std::nullopt;
	}
	return std::string(value);
}

inline std::string escaped(const std::string &text, char quote) {
	std::string shown(1, quote);
	for (char c : text) {
		if (c == quote || c == '\\') shown += std::string("\\") + c;
		else if (c == '\n') shown += "\\n";
		else if (c == '\r') shown += "\\r";
		else if (c == '\t') shown += "\\t";
		else shown += c;
	}
	return shown + quote;
}

inline std::string unicode_escape(unsigned char c) {
	const char *hex_digits = "0123456789abcdef";
	return std::string("\\u00") + hex_digits[c / 16] + hex_digits[c % 16];
}

inline std::string json(const std::string &text) {
	std::ostringstream out;
	out << '"';
	for (unsigned char c : text) {
		if (c == '"' || c == '\\') out << '\\' << c;
		else if (c == '\n') out << "\\n";
		else if (c == '\r') out << "\\r";
		else if (c == '\t') out << "\\t";
		else if (c < 0x20) out << unicode_escape(c);
		else out << c;
	}
	out << '"';
	return out.str();
}

inline std::string shorten(const std::string &text) {
	if (text.size() <= shown_max) return text;
	return text.substr(0, shown_max) + "${WORDS.cut}";
}

template <class T> std::string show(const T &value);

template <class T>
std::string number_text(const T &value, int digits) {
	std::ostringstream out;
	out.precision(digits);
	out << value;
	return out.str();
}

template <class T>
std::string show_range(const T &values) {
	std::string shown = "[";
	bool first = true;
	for (const auto &item : values) {
		if (!first) shown += ", ";
		shown += dwf_check::show(item);
		first = false;
		if (shown.size() > shown_max) break;
	}
	return shown + "]";
}

template <class T>
std::string show(const T &value) {
	if constexpr (std::is_same_v<T, bool>) {
		return value ? "true" : "false";
	} else if constexpr (std::is_same_v<T, char>) {
		return escaped(std::string(1, value), '\'');
	} else if constexpr (is_text<T>::value) {
		std::optional<std::string> text = text_of(value);
		return text ? escaped(*text, '"') : "nullptr";
	} else if constexpr (std::is_same_v<T, float>) {
		return number_text(value, single_digits);
	} else if constexpr (std::is_floating_point_v<T>) {
		return number_text(value, double_digits);
	} else if constexpr (std::is_integral_v<T>) {
		return std::to_string(value);
	} else if constexpr (is_pair<T>::value) {
		return "(" + dwf_check::show(value.first) + ", " + dwf_check::show(value.second) + ")";
	} else if constexpr (is_range<T>::value) {
		return dwf_check::show_range(value);
	} else if constexpr (is_printable<T>::value) {
		std::ostringstream out;
		out << value;
		return out.str();
	} else {
		return "${WORDS.unprintable}";
	}
}

inline double larger(double one, double other) {
	return one > other ? one : other;
}

inline bool close_enough(double got, double expected, double allowed) {
	if (got == expected) return true;
	if (__builtin_isnan(got) && __builtin_isnan(expected)) return true;
	if (__builtin_isinf(got) || __builtin_isinf(expected)) return false;
	double scale = larger(1.0, larger(__builtin_fabs(got), __builtin_fabs(expected)));
	return __builtin_fabs(got - expected) <= allowed * scale;
}

template <class G, class E>
constexpr double tolerance_for() {
	return std::is_same_v<G, float> || std::is_same_v<E, float> ? single_tolerance : tolerance;
}

template <class G, class E> bool same(const G &got, const E &expected);

template <class G, class E>
bool same_range(const G &got, const E &expected) {
	auto one = std::begin(got);
	auto other = std::begin(expected);
	for (; one != std::end(got) && other != std::end(expected); ++one, ++other) {
		if (!dwf_check::same(*one, *other)) return false;
	}
	return one == std::end(got) && other == std::end(expected);
}

template <class G, class E>
bool same(const G &got, const E &expected) {
	if constexpr (std::is_arithmetic_v<G> && std::is_arithmetic_v<E>) {
		if constexpr (std::is_floating_point_v<G> || std::is_floating_point_v<E>) return close_enough(double(got), double(expected), tolerance_for<G, E>());
		else return got == expected;
	} else if constexpr (is_text<G>::value && is_text<E>::value) {
		return text_of(got) == text_of(expected);
	} else if constexpr (is_pair<G>::value && is_pair<E>::value) {
		return dwf_check::same(got.first, expected.first) && dwf_check::same(got.second, expected.second);
	} else if constexpr (is_range<G>::value && is_range<E>::value) {
		return dwf_check::same_range(got, expected);
	} else {
		return got == expected;
	}
}

inline bool report(const std::string &name, bool pass, const std::string &got, const std::string &expected) {
	std::cout << "${CHECK_MARKER} {\"name\":" << json(name) << ",\"pass\":" << (pass ? "true" : "false")
		<< ",\"got\":" << json(shorten(got)) << ",\"expected\":" << json(shorten(expected)) << "}" << std::endl;
	return pass;
}

inline void done() {
	std::cout << "${CHECK_MARKER} ${DONE_RECORD_ESCAPED}" << std::endl;
}

} // namespace dwf_check

template <class G, class E>
bool check(const std::string &name, const G &got, const E &expected) {
	return dwf_check::report(name, dwf_check::same(got, expected), dwf_check::show(got), dwf_check::show(expected));
}

template <class G, class E>
bool check(const std::string &name, const G &got, std::initializer_list<E> expected) {
	return dwf_check::report(name, dwf_check::same(got, expected), dwf_check::show(got), dwf_check::show(expected));
}
// --- end of the check helper ---
`;

/** Go (1.16: no generics, interface{}): the package clause and the helper's imports, under names of its own. */
const GO_HEAD = String.raw`package main

// --- check helper: imports (src/lib/codeRunner/checkHelpers.js) ---
import (
	dwfjson "encoding/json"
	dwffmt "fmt"
	dwfmath "math"
	dwfreflect "reflect"
)
`;

/** Go: the helper. */
const GO_BODY = String.raw`
// --- check helper (src/lib/codeRunner/checkHelpers.js) ---
const dwfMarker = "${CHECK_MARKER}"
const dwfTolerance = ${FLOAT_TOLERANCE}
const dwfSingleTolerance = ${FLOAT32_TOLERANCE}
const dwfShownMax = ${MAX_SHOWN_CHARS}

func dwfUnwrap(value dwfreflect.Value) dwfreflect.Value {
	for value.IsValid() && value.Kind() == dwfreflect.Interface {
		value = value.Elem()
	}
	return value
}

func dwfIsNil(value dwfreflect.Value) bool {
	if !value.IsValid() {
		return true
	}
	switch value.Kind() {
	case dwfreflect.Chan, dwfreflect.Func, dwfreflect.Map, dwfreflect.Ptr, dwfreflect.Slice:
		return value.IsNil()
	}
	return false
}

func dwfIsSigned(value dwfreflect.Value) bool {
	switch value.Kind() {
	case dwfreflect.Int, dwfreflect.Int8, dwfreflect.Int16, dwfreflect.Int32, dwfreflect.Int64:
		return true
	}
	return false
}

func dwfIsUnsigned(value dwfreflect.Value) bool {
	switch value.Kind() {
	case dwfreflect.Uint, dwfreflect.Uint8, dwfreflect.Uint16, dwfreflect.Uint32, dwfreflect.Uint64, dwfreflect.Uintptr:
		return true
	}
	return false
}

func dwfIsFloat(value dwfreflect.Value) bool {
	return value.Kind() == dwfreflect.Float32 || value.Kind() == dwfreflect.Float64
}

func dwfIsNumber(value dwfreflect.Value) bool {
	return dwfIsSigned(value) || dwfIsUnsigned(value) || dwfIsFloat(value)
}

func dwfFloat(value dwfreflect.Value) float64 {
	if dwfIsSigned(value) {
		return float64(value.Int())
	}
	if dwfIsUnsigned(value) {
		return float64(value.Uint())
	}
	return value.Float()
}

func dwfToleranceFor(got, expected dwfreflect.Value) float64 {
	if got.Kind() == dwfreflect.Float32 || expected.Kind() == dwfreflect.Float32 {
		return dwfSingleTolerance
	}
	return dwfTolerance
}

func dwfCloseEnough(got, expected, tolerance float64) bool {
	if got == expected {
		return true
	}
	if dwfmath.IsNaN(got) && dwfmath.IsNaN(expected) {
		return true
	}
	if dwfmath.IsInf(got, 0) || dwfmath.IsInf(expected, 0) {
		return false
	}
	scale := dwfmath.Max(1, dwfmath.Max(dwfmath.Abs(got), dwfmath.Abs(expected)))
	return dwfmath.Abs(got-expected) <= tolerance*scale
}

func dwfSameIntegers(got, expected dwfreflect.Value) bool {
	if dwfIsSigned(got) && dwfIsSigned(expected) {
		return got.Int() == expected.Int()
	}
	if dwfIsUnsigned(got) && dwfIsUnsigned(expected) {
		return got.Uint() == expected.Uint()
	}
	if dwfIsSigned(got) {
		return got.Int() >= 0 && uint64(got.Int()) == expected.Uint()
	}
	return expected.Int() >= 0 && got.Uint() == uint64(expected.Int())
}

func dwfIsList(value dwfreflect.Value) bool {
	return value.Kind() == dwfreflect.Slice || value.Kind() == dwfreflect.Array
}

func dwfSameLists(got, expected dwfreflect.Value) bool {
	if got.Len() != expected.Len() {
		return false
	}
	for index := 0; index < got.Len(); index++ {
		if !dwfSame(got.Index(index), expected.Index(index)) {
			return false
		}
	}
	return true
}

func dwfIsNilOrEmpty(value dwfreflect.Value) bool {
	return dwfIsNil(value) || dwfIsList(value) && value.Len() == 0
}

func dwfSame(got, expected dwfreflect.Value) bool {
	got, expected = dwfUnwrap(got), dwfUnwrap(expected)
	if dwfIsNil(got) || dwfIsNil(expected) {
		if dwfIsList(got) || dwfIsList(expected) {
			return dwfIsNilOrEmpty(got) && dwfIsNilOrEmpty(expected)
		}
		return dwfIsNil(got) && dwfIsNil(expected)
	}
	if dwfIsNumber(got) && dwfIsNumber(expected) {
		if dwfIsFloat(got) || dwfIsFloat(expected) {
			return dwfCloseEnough(dwfFloat(got), dwfFloat(expected), dwfToleranceFor(got, expected))
		}
		return dwfSameIntegers(got, expected)
	}
	if dwfIsList(got) && dwfIsList(expected) {
		return dwfSameLists(got, expected)
	}
	if !got.CanInterface() || !expected.CanInterface() {
		return false
	}
	return dwfreflect.DeepEqual(got.Interface(), expected.Interface())
}

func dwfShorten(text string) string {
	if len(text) > dwfShownMax {
		return text[:dwfShownMax] + "${WORDS.cut}"
	}
	return text
}

func dwfShow(value interface{}, verb string) string {
	if text, isText := value.(string); isText && verb == "%v" {
		return dwfShorten(dwffmt.Sprintf("%q", text))
	}
	return dwfShorten(dwffmt.Sprintf(verb, value))
}

func dwfQuote(text string) string {
	data, _ := dwfjson.Marshal(text)
	return string(data)
}

func check(name string, got, expected interface{}) bool {
	pass := dwfSame(dwfreflect.ValueOf(got), dwfreflect.ValueOf(expected))
	gotText, expectedText := dwfShow(got, "%v"), dwfShow(expected, "%v")
	if !pass && gotText == expectedText {
		gotText, expectedText = dwfShow(got, "%#v"), dwfShow(expected, "%#v")
	}
	dwffmt.Printf("%s {\"name\":%s,\"pass\":%t,\"got\":%s,\"expected\":%s}\n", dwfMarker, dwfQuote(name), pass, dwfQuote(gotText), dwfQuote(expectedText))
	return pass
}

func dwfCheckDone() {
	dwffmt.Println(dwfMarker + " ${DONE_RECORD_ESCAPED}")
}
// --- end of the check helper ---
`;

/** One entry of CHECK_HELPERS, frozen (see THE PIECES in the header). */
function helper({ head = '', body, tail = '', done }) {
	return Object.freeze({ head, body, tail, done });
}

/** The helper of each language that can run checks, keyed by Piston language name. */
export const CHECK_HELPERS = Object.freeze({
	python: helper({ body: PYTHON_BODY, done: '_dwf_check_done()' }),
	javascript: helper({ body: JAVASCRIPT_BODY, done: 'dwfCheckDone();' }),
	bash: helper({ body: BASH_BODY, done: 'dwf_check_done' }),
	c: helper({ head: C_HEAD, body: C_BODY, tail: C_TAIL, done: 'dwf_check_done();' }),
	'c++': helper({ head: CPP_HEAD, body: CPP_BODY, done: 'dwf_check::done();' }),
	go: helper({ head: GO_HEAD, body: GO_BODY, done: 'dwfCheckDone()' }),
});

/**
 * check()'s declaration for TypeScript's type checker (the reader's code plus the harness are
 * type-checked together in the browser; the JavaScript helper above is what runs). NoInfer: T
 * comes from `got` alone, so `expected` is checked against the reader's type.
 */
export const TYPESCRIPT_CHECK_DECLARATION = 'declare function check<T>(name: string, got: T, expected: NoInfer<T>): boolean;\n';
