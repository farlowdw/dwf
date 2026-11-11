/**
 * exercise.js — the pure logic of the editor's exercises: comparing a run's output with the
 * page's `expectedOutput`, reading the result lines of a check, and building the files of a check
 * run (the `tests` prop) for Piston. No React, no DOM. (The check protocol and the per-language
 * `check` helpers are checkHelpers.js; the panels that show all this are the editor's.)
 *
 * EXPECTED OUTPUT (compareOutput)
 *   compareOutput(actual, expected) -> { matches, firstDifferentLine, diff }
 *   Both texts are first made comparable: "\r\n" and a lone "\r" become "\n", spaces and tabs at
 *   the end of each line go, and so do blank lines at the end. Then
 *     matches             the two are the same
 *     firstDifferentLine  null when they match, else the first line (1-based) where they differ;
 *                         when one is the start of the other, the line after the shorter one
 *     diff                the lines, in order, as [{ type, text }]: 'same' (in both), 'removed'
 *                         (expected, but not printed), 'added' (printed, but not expected) — the
 *                         changes that turn the expected output into the reader's. A line diff
 *                         by longest common subsequence, BOUNDED: the lines both texts start and
 *                         end with are matched first; when what is left in between is larger than
 *                         MAX_DIFF_CELLS (lines × lines), it shows as all removed, then all added.
 *
 * CHECK RESULTS (parseCheckResults)
 *   parseCheckResults(stdout) -> { cases, passed, total, otherOutput, finished }
 *     cases        [{ name, pass, got, expected }] in the order they ran (strings and a boolean)
 *     passed/total how many cases passed / ran
 *     otherOutput  everything else the run printed on stdout (the reader's own prints), one
 *                  "\n" after each line; '' when there is none
 *     finished     the harness ran to its end (it printed the "done" line); false after a crash,
 *                  a timeout or an exit half way — then `total` counts only the cases that ran
 *   A protocol line may follow other text on the same line (a print without a newline): the text
 *   before the marker counts as other output. A record with a raw control character in it (JSON
 *   wants them escaped) is read with them escaped. A marker followed by something that is still
 *   not a JSON object counts as other output. The parsing never throws, whatever the program
 *   printed (stdout is the reader's, and the editor parses while it draws): a name that is not
 *   text is written as JSON, a value too deeply nested to write shows as UNPRINTABLE_VALUE, and
 *   a record that still cannot be read counts as other output.
 *
 * THE FILES OF A CHECK (buildCheckFiles)
 *   buildCheckFiles({ language, readerCode, harness })
 *     -> { files, runLanguage, readerFileName, harnessFileName, lineOffset }, or null for a
 *        language without a check helper (exerciseProps.js > supportsChecks)
 *     files            for Piston's /execute (request.js > buildExecuteRequest({ files })): the
 *                      HARNESS first (Piston runs files[0]), the READER'S CODE second, in a file
 *                      of its own, so the line numbers of its errors stay the reader's own, then
 *                      Python's helper module (three files; the function accepts up to five)
 *     runLanguage      the Piston language to run with ('javascript' for TypeScript)
 *     readerFileName   the reader's file as error messages name it (errorLocations' `fileName`)
 *     harnessFileName  the harness file as error messages name it
 *     lineOffset       how many lines come before the reader's first line in its file: always 0
 *                      with these layouts (C and C++ number the reader's lines with #line)
 *   The harness is written in the language of the exercise and calls check(name, got, expected)
 *   (checkHelpers.js). How each language finds the reader's code (verified on a Piston
 *   server, 2026-10-25: __tests__/fixtures/exercise):
 *     python      main.py: `from solution import *`, then `from dwf_check import check, …` (the
 *                 helper, a module of its own: dwf_check.py, the third file), the harness, the
 *                 done line. The reader's top-level code RUNS on that import (its prints show as
 *                 other output; a block under `if __name__ == '__main__':` does not run). Names
 *                 that start with _ are not imported (Python's rule for import *).
 *     javascript  main.js: the helper, then dwfLoadReaderCode('solution.js'), which runs the
 *                 reader's file as a script (Node's vm.runInThisContext, with its real path as
 *                 the file name, so errors read /box/submission/solution.js:L:C): its top-level
 *                 functions, classes, let / const / var become names the harness uses directly,
 *                 no export needed; its top-level code runs. `require`, `module` and `exports`
 *                 exist for it.
 *     typescript  as javascript, with the JavaScript the browser emitted: the integrator passes
 *                 the reader's EMITTED code as readerCode and the harness's emitted code as
 *                 harness (a TypeScript harness uses the reader's names directly, no import).
 *     bash        main.sh: `source ./solution.sh`, the helper, the harness, the done line. The
 *                 reader's top-level commands run on that source; an `exit` there ends the check.
 *     c / c++     main (main.c / main.cpp): in C, a COPY of the reader's feature-test macro
 *                 lines (#define _GNU_SOURCE, _POSIX_C_SOURCE …, C_FEATURE_MACRO_LINE: they must
 *                 come before the first header, and the helper's headers come before the
 *                 reader's code; without the copy M_PI, strdup or getline would be missing in
 *                 the check, though present in a Run); the helper's #includes and the harness's
 *                 own #include lines, the helper, `int main(void)` — which calls
 *                 dwf_run_checks() (C_CHECKS_FUNCTION) and prints the done line — then
 *                 `#define main reader_main` and `#include "reader.c"` (".cpp"), C's `check`
 *                 macro, and `static void dwf_run_checks(void)` holding the harness.
 *                 main comes BEFORE the reader's code, so no #define of the reader's can reach
 *                 it: a competitive programmer's `#define int long long` (with `signed main()`)
 *                 would otherwise turn it into `long long main(void)`, which g++ refuses. The
 *                 harness comes after the reader's code, so it sees the reader's types and
 *                 macros (`int` meaning long long there, as in the reader's code).
 *                 The reader's file is sent as `reader` (Piston's runner makes it reader.c /
 *                 reader.cpp and compiles EVERY file) and holds `#ifdef DWF_CHECK_HARNESS`,
 *                 `#line 1 "solution.c"` (".cpp"), the reader's code and `#endif`: compiled on
 *                 its own it is empty; included, it is the reader's code, and gcc names its lines
 *                 solution.c:L with the reader's own L.
 *                 No file solution.c exists, ON PURPOSE: gcc quotes the source line of an error
 *                 from the file #line names, and in reader.c that line would be two lines off
 *                 (the guard and the #line come first), so an error shows no quoted line instead
 *                 of a wrong one (both seen on the server, 2026-10-25).
 *                 The reader's code is included from a file of its own, not pasted into main, so
 *                 an unclosed comment or #if in it stops at the end of that file. An unclosed
 *                 `{` does not: the compiler reports it at the end of main.c / main.cpp (no
 *                 marker in the reader's code; the compiler's text shows it).
 *                 The reader's own `main` is renamed reader_main (never called); in C++, when the
 *                 reader's code has a `main(`, g++'s missing-return warning is turned off around
 *                 it (renamed, it loses main's implicit `return 0`).
 *                 The harness is the BODY of dwf_run_checks, a void function main calls:
 *                 statements (helpers as lambdas in C++, nested functions in GNU C), and no
 *                 `return value;` (an error in C++; a bare `return;` ends the cases early, and
 *                 the done line still prints); its lines that start with #include go to the
 *                 top (before the reader's code: after it, a reader's #define would rewrite
 *                 the header).
 *     go          main (main.go): package main, the helper's imports and the harness's own
 *                 one-line `import "…"` lines (an alias and a // comment allowed; not an
 *                 `import (` block), the helper, and func main() holding the harness. The
 *                 reader's code is solution.go, the same package (Piston's runner runs
 *                 `go run *.go`); its own `func main(` becomes `func _   (` — a blank function
 *                 of the same width, never called — so no line or column moves. The harness is
 *                 the BODY of main (helpers as closures).
 *   Line endings of the harness become "\n" (the reader's code comes from Monaco's model, which
 *   already has them).
 *
 * WHICH LANGUAGES CHECK, AND THE PER-LANGUAGE PROPS  exerciseProps.js (supportsChecks,
 *   exerciseTextFor, CHECK_LANGUAGES): a module of its own, light enough for the editor's
 *   server-rendered placeholder, so the check helpers' source text (checkHelpers.js, imported
 *   here) stays out of a page's first download (moved there 2026-10-25). CHECK_LANGUAGES and
 *   LAYOUTS below name the same languages (__tests__/exerciseProps.test.js).
 *
 * HOW TO CHANGE IT
 *   The normalising rules: comparableLines(). The diff's bound: MAX_DIFF_CELLS. A language's
 *   layout: its entry in LAYOUTS and its build function below; then capture its fixture again on
 *   the server (__tests__/fixtures/exercise/capture.mjs, whose header says how): the tests fail
 *   while the files differ from those captured. A new language: a helper in checkHelpers.js, a
 *   layout here, its name in exerciseProps.js > CHECK_LANGUAGES. The protocol: checkHelpers.js.
 */

import { CHECK_HELPERS, CHECK_MARKER } from './checkHelpers.js';
import { languageInfo } from './languages.js';

/** The LCS table may have at most this many cells (lines left × lines left); beyond it, no LCS. */
export const MAX_DIFF_CELLS = 250000;

/** A Windows ("\r\n") or old Mac ("\r") line break. */
const NON_UNIX_LINE_BREAK = /\r\n?/g;

/**
 * A raw control character (U+0000 to U+001F): JSON allows them only escaped. Two regexps, one to
 * test and one (/g) to replace: a /g regexp keeps its position between test() calls.
 */
const RAW_CONTROL_CHARACTER = /[\u0000-\u001f]/;
const EVERY_RAW_CONTROL_CHARACTER = /[\u0000-\u001f]/g;

/** Hex digits of a JSON \u escape. */
const JSON_ESCAPE_DIGITS = 4;

/** Spaces and tabs at the end of a line. */
const TRAILING_BLANKS = /[ \t]+$/;

/** A check value that cannot be written as text (nested too deep for JSON.stringify, say). */
export const UNPRINTABLE_VALUE = '<unprintable value>';

/** A diff line's types. */
const SAME = 'same';
const ADDED = 'added';
const REMOVED = 'removed';

/** The macro that lets the reader's C / C++ file compile only when the harness includes it. */
const READER_GUARD = 'DWF_CHECK_HARNESS';

/** What the reader's own C / C++ `main` is renamed to (see the header). */
const C_READER_MAIN = 'reader_main';

/** The C / C++ function whose body is the harness; the generated main calls it (see the header). */
const C_CHECKS_FUNCTION = 'dwf_run_checks';

/** A C / C++ harness line that is an #include (it goes to the top of the file). */
const C_INCLUDE_LINE = /^\s*#\s*include\b/;

/** A Go harness line that is a one-line import, a // comment allowed (it goes after the helper's imports). */
const GO_IMPORT_LINE = /^\s*import\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+|\.\s+)?"[^"]+"\s*(?:\/\/.*)?$/;

/**
 * A feature-test macro line of the reader's C code (#define _GNU_SOURCE, _POSIX_C_SOURCE 200809L,
 * _XOPEN_SOURCE …): COPIED to the top of main.c, before the helper's headers (see the header).
 */
const C_FEATURE_MACRO_LINE = /^\s*#\s*define\s+(?:_[A-Z0-9_]*_SOURCE(?:_EXTENDED)?|_REENTRANT|_THREAD_SAFE|_FILE_OFFSET_BITS|_TIME_BITS)\b/;

/** A `main(` in C / C++ code (a definition, a declaration or a comment: all count). */
const C_MAIN_CALL = /\bmain\s*\(/;

/** The start of a Go top-level `func main(`: groups 1 and 2 are kept as written. */
const GO_MAIN_DECLARATION = /^([ \t]*func[ \t]+)main([ \t]*\()/gm;

/** The blank name a reader's Go main gets, padded to the width of "main". */
const GO_BLANK_MAIN = '_   ';

/** Python's helper module (checkHelpers.js > CHECK_HELPERS.python.body) and the line that imports it. */
const PYTHON_HELPER_FILE = 'dwf_check.py';
const PYTHON_HELPER_IMPORT = 'from dwf_check import check, check_done as _dwf_check_done';

/** g++'s missing-return warning: off around a reader's renamed C++ main. */
const CPP_RETURN_WARNING_OFF = Object.freeze([
	'#pragma GCC diagnostic push',
	'#pragma GCC diagnostic ignored "-Wreturn-type"',
]);
const CPP_RETURN_WARNING_BACK = '#pragma GCC diagnostic pop';

// ---------------------------------------------------------------- expected output

/** Text as lines that can be compared (see EXPECTED OUTPUT in the header). */
function comparableLines(text) {
	const unix = String(text ?? '').replace(NON_UNIX_LINE_BREAK, '\n');
	const lines = unix.split('\n').map((line) => line.replace(TRAILING_BLANKS, ''));
	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

/** The first line (1-based) where two line lists differ, or null when they are the same. */
function firstDifference(actualLines, expectedLines) {
	const longest = Math.max(actualLines.length, expectedLines.length);
	for (let index = 0; index < longest; index++) {
		if (actualLines[index] !== expectedLines[index]) return index + 1;
	}
	return null;
}

/** How many lines `a` and `b` start with in common. */
function commonPrefixLength(a, b) {
	const shortest = Math.min(a.length, b.length);
	let length = 0;
	while (length < shortest && a[length] === b[length]) length++;
	return length;
}

/** How many lines `a` and `b` end with in common, not counting their first `prefix` lines. */
function commonSuffixLength(a, b, prefix) {
	const shortest = Math.min(a.length, b.length) - prefix;
	let length = 0;
	while (length < shortest && a[a.length - 1 - length] === b[b.length - 1 - length]) length++;
	return length;
}

/** Diff lines of one type. */
function linesOfType(type, lines) {
	return lines.map((text) => ({ type, text }));
}

/**
 * The LCS table of `removed` against `added`, from the end: cell (i, j) holds the length of the
 * longest common subsequence of removed[i..] and added[j..]. Row width: added.length + 1.
 */
function lcsTable(removed, added) {
	const width = added.length + 1;
	const table = new Uint32Array((removed.length + 1) * width);
	for (let i = removed.length - 1; i >= 0; i--) {
		for (let j = added.length - 1; j >= 0; j--) {
			const cell = i * width + j;
			if (removed[i] === added[j]) table[cell] = table[cell + width + 1] + 1;
			else table[cell] = Math.max(table[cell + width], table[cell + 1]);
		}
	}
	return table;
}

/** The diff of two line lists by longest common subsequence (a removed line before an added one on a tie). */
function lcsDiff(expectedLines, actualLines) {
	const table = lcsTable(expectedLines, actualLines);
	const width = actualLines.length + 1;
	const diff = [];
	let i = 0;
	let j = 0;
	while (i < expectedLines.length && j < actualLines.length) {
		if (expectedLines[i] === actualLines[j]) {
			diff.push({ type: SAME, text: expectedLines[i] });
			i++;
			j++;
		} else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
			diff.push({ type: REMOVED, text: expectedLines[i] });
			i++;
		} else {
			diff.push({ type: ADDED, text: actualLines[j] });
			j++;
		}
	}
	return diff.concat(linesOfType(REMOVED, expectedLines.slice(i)), linesOfType(ADDED, actualLines.slice(j)));
}

/** The middle part of the diff: an LCS when it fits MAX_DIFF_CELLS, else all removed, then all added. */
function middleDiff(expectedLines, actualLines) {
	if (expectedLines.length * actualLines.length <= MAX_DIFF_CELLS) return lcsDiff(expectedLines, actualLines);
	return linesOfType(REMOVED, expectedLines).concat(linesOfType(ADDED, actualLines));
}

/** The whole line diff: the common start, the middle, the common end. */
function lineDiff(expectedLines, actualLines) {
	const prefix = commonPrefixLength(expectedLines, actualLines);
	const suffix = commonSuffixLength(expectedLines, actualLines, prefix);
	const expectedMiddle = expectedLines.slice(prefix, expectedLines.length - suffix);
	const actualMiddle = actualLines.slice(prefix, actualLines.length - suffix);
	return [
		...linesOfType(SAME, expectedLines.slice(0, prefix)),
		...middleDiff(expectedMiddle, actualMiddle),
		...linesOfType(SAME, expectedLines.slice(expectedLines.length - suffix)),
	];
}

/**
 * The reader's output against the page's expected output (EXPECTED OUTPUT in the header):
 * { matches, firstDifferentLine, diff: [{ type: 'same' | 'added' | 'removed', text }] }.
 * null / undefined count as ''.
 */
export function compareOutput(actual, expected) {
	const actualLines = comparableLines(actual);
	const expectedLines = comparableLines(expected);
	const firstDifferentLine = firstDifference(actualLines, expectedLines);
	return {
		matches: firstDifferentLine === null,
		firstDifferentLine,
		diff: lineDiff(expectedLines, actualLines),
	};
}

// ---------------------------------------------------------------- check results

/** JSON text read as a plain object, or null (not JSON, or not an object). */
function parsedObject(text) {
	try {
		const record = JSON.parse(text);
		if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
		return record;
	} catch {
		return null;
	}
}

/** A control character as a JSON escape ("\u001b"). */
function jsonEscape(character) {
	return `\\u${character.charCodeAt(0).toString(16).padStart(JSON_ESCAPE_DIGITS, '0')}`;
}

/**
 * A protocol record from the text after the marker: a plain object, or null. When the text is
 * not JSON, it is tried once more with its raw control characters escaped (a helper that left
 * one raw — an ANSI colour code in a value — would otherwise lose its case from the results).
 */
function parseRecord(text) {
	const record = parsedObject(text);
	if (record !== null || !RAW_CONTROL_CHARACTER.test(text)) return record;
	return parsedObject(text.replace(EVERY_RAW_CONTROL_CHARACTER, jsonEscape));
}

/**
 * A shown value as text (a helper always sends a string; anything else is written as JSON, or
 * as UNPRINTABLE_VALUE when even that fails: a reader's print of an array nested 10,000 deep
 * makes JSON.stringify overflow the stack).
 */
function shownText(value) {
	if (typeof value === 'string') return value;
	if (value === undefined) return '';
	try {
		return JSON.stringify(value);
	} catch {
		return UNPRINTABLE_VALUE;
	}
}

/** A case's name as text: '' when there is none; a name that is not a string is written as JSON (never String(), which throws on {"toString": 1}). */
function nameText(value) {
	if (value === undefined || value === null) return '';
	return shownText(value);
}

/** One case from a record. */
function caseFrom(record) {
	return {
		name: nameText(record.name),
		pass: record.pass === true,
		got: shownText(record.got),
		expected: shownText(record.expected),
	};
}

/** One case from a record, or null when it cannot be read (the line then counts as other output). */
function caseOrNull(record) {
	try {
		return caseFrom(record);
	} catch {
		return null;
	}
}

/** stdout as lines, without the empty piece after a final newline. */
function outputLines(stdout) {
	const lines = String(stdout ?? '').replace(NON_UNIX_LINE_BREAK, '\n').split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	return lines;
}

/**
 * What one stdout line holds: { before, done: true } (the done line), { before, entry } (a
 * case), or null (the whole line is other output: no marker, no readable record). `before` is
 * the text in front of the marker ('' when there is none).
 */
function protocolLineOf(line) {
	const at = line.indexOf(CHECK_MARKER);
	if (at === -1) return null;
	const record = parseRecord(line.slice(at + CHECK_MARKER.length));
	if (record === null) return null;
	const before = line.slice(0, at);
	if (record.done === true) return { before, done: true };
	const entry = caseOrNull(record);
	return entry === null ? null : { before, entry };
}

/**
 * The results of a check run from its stdout (CHECK RESULTS in the header):
 * { cases, passed, total, otherOutput, finished }.
 */
export function parseCheckResults(stdout) {
	const cases = [];
	const other = [];
	let finished = false;
	for (const line of outputLines(stdout)) {
		const read = protocolLineOf(line);
		if (read === null) {
			other.push(line);
			continue;
		}
		if (read.before !== '') other.push(read.before);
		if (read.done) finished = true;
		else cases.push(read.entry);
	}
	return {
		cases,
		passed: cases.filter((one) => one.pass).length,
		total: cases.length,
		otherOutput: other.map((line) => `${line}\n`).join(''),
		finished,
	};
}

// ---------------------------------------------------------------- the files of a check

/** `text` ending with "\n" ('' stays ''). */
function withFinalNewline(text) {
	if (text === '' || text.endsWith('\n')) return text;
	return `${text}\n`;
}

/** Lines of text joined into a file's text (each ending with "\n"). */
function fileText(lines) {
	return lines.map((line) => withFinalNewline(line)).join('');
}

/** The harness's lines split into those `isHoisted` picks (they go to the top) and the rest. */
function splitHarness(harness, isHoisted) {
	const hoisted = [];
	const body = [];
	for (const line of harness.split('\n')) {
		if (isHoisted.test(line)) hoisted.push(line);
		else body.push(line);
	}
	return { hoisted, body: body.join('\n') };
}

/** Python: main.py imports the reader's names from solution.py, then the helper from its own module. */
function pythonFiles({ readerCode, harness, helper }) {
	const main = fileText(['from solution import *', PYTHON_HELPER_IMPORT, harness, helper.done]);
	return { main, reader: readerCode, extra: [{ name: PYTHON_HELPER_FILE, content: helper.body }] };
}

/** JavaScript (and TypeScript's emitted code): main.js runs solution.js as a script first. */
function javascriptFiles({ readerCode, harness, helper, readerName }) {
	const main = fileText([helper.body, `dwfLoadReaderCode('${readerName}');`, harness, helper.done]);
	return { main, reader: readerCode };
}

/** Bash: main.sh sources solution.sh first. */
function bashFiles({ readerCode, harness, helper, readerName }) {
	const main = fileText([`source ./${readerName}`, helper.body, harness, helper.done]);
	return { main, reader: readerCode };
}

/** The reader's C / C++ file: empty on its own, the reader's code numbered as `readerFileName` when included. */
function cReaderFile(readerCode, readerFileName) {
	return fileText([`#ifdef ${READER_GUARD}`, `#line 1 "${readerFileName}"`, withFinalNewline(readerCode) + '#endif']);
}

/** The lines that include the reader's C / C++ file, its `main` renamed (and g++'s warning off when `quietMain`). */
function cIncludeReader(includeName, quietMain) {
	const include = [`#define ${READER_GUARD} 1`, `#define main ${C_READER_MAIN}`, `#include "${includeName}"`, '#undef main'];
	if (!quietMain) return include;
	return [...CPP_RETURN_WARNING_OFF, ...include, CPP_RETURN_WARNING_BACK];
}

/**
 * The real main of a C / C++ check, placed BEFORE the reader's code (no reader macro reaches
 * it): it runs the harness's function, then prints the done line. `void` on purpose in both
 * the declaration and the definition: an `int` there would be rewritten by a reader's
 * `#define int long long` in the definition only, and the two would clash.
 */
function cMainLines(done) {
	return [`static void ${C_CHECKS_FUNCTION}(void);`, 'int main(void) {', `\t${C_CHECKS_FUNCTION}();`, `\t${done}`, '\treturn 0;', '}'];
}

/** C and C++: main includes the reader's file; the harness is the body of the function main calls. */
function cFiles({ readerCode, harness, helper, readerFileName, includeName, quietReaderMain, readerTopLines }) {
	const { hoisted, body } = splitHarness(harness, C_INCLUDE_LINE);
	const main = fileText([
		...readerTopLines(readerCode),
		helper.head,
		...hoisted,
		helper.body,
		...cMainLines(helper.done),
		...cIncludeReader(includeName, quietReaderMain(readerCode)),
		helper.tail,
		`static void ${C_CHECKS_FUNCTION}(void) {`,
		body,
		'}',
	]);
	return { main, reader: cReaderFile(readerCode, readerFileName) };
}

/** Does C++ code have a `main(` (so its renamed main must not warn)? */
function cppDefinesMain(code) {
	return C_MAIN_CALL.test(code);
}

/** C never warns about a missing return by default: nothing to quiet. */
function neverQuiet() {
	return false;
}

/** The reader's C feature-test macro lines, copied as written (an identical #define again later is no error). */
function cFeatureMacroLines(code) {
	return code.split('\n').filter((line) => C_FEATURE_MACRO_LINE.test(line));
}

/** No reader line goes to the top (C++: g++ defines _GNU_SOURCE itself). */
function noTopLines() {
	return [];
}

/** Go code with its top-level `func main(` made a blank function of the same width. */
function withBlankGoMain(code) {
	return code.replace(GO_MAIN_DECLARATION, (match, before, after) => `${before}${GO_BLANK_MAIN}${after}`);
}

/** Go: main.go and solution.go are one package; the harness is the body of main. */
function goFiles({ readerCode, harness, helper }) {
	const { hoisted, body } = splitHarness(harness, GO_IMPORT_LINE);
	const main = fileText([helper.head, ...hoisted, helper.body, 'func main() {', body, `\t${helper.done}`, '}']);
	return { main, reader: withBlankGoMain(readerCode) };
}

/**
 * One entry of LAYOUTS, frozen:
 *   helper          the CHECK_HELPERS key
 *   runLanguage     the Piston language the check runs with
 *   readerName      the name the reader's file is sent under
 *   readerFileName  the reader's file in error messages (default: readerName)
 *   includeName     (C / C++) the reader's file as the harness includes it (Piston's runner adds
 *                   the extension to every file)
 *   build           ({ readerCode, harness, helper, readerName, readerFileName, includeName,
 *                   quietReaderMain, readerTopLines }) -> { main, reader, extra? } (extra: more
 *                   files, after)
 *   quietReaderMain (C / C++) (readerCode) -> turn g++'s missing-return warning off?
 *   readerTopLines  (C / C++) (readerCode) -> the reader's lines COPIED to the very top of main
 * The harness is sent under languages.js's submitName for runLanguage, and named fileName.
 */
function layout({
	helper,
	runLanguage,
	readerName,
	readerFileName = readerName,
	includeName = readerName,
	build,
	quietReaderMain = neverQuiet,
	readerTopLines = noTopLines,
}) {
	return Object.freeze({ helper, runLanguage, readerName, readerFileName, includeName, build, quietReaderMain, readerTopLines });
}

/** How a check runs in each language (THE FILES OF A CHECK in the header), keyed by canonical language name. */
const LAYOUTS = Object.freeze({
	python: layout({ helper: 'python', runLanguage: 'python', readerName: 'solution.py', build: pythonFiles }),
	javascript: layout({ helper: 'javascript', runLanguage: 'javascript', readerName: 'solution.js', build: javascriptFiles }),
	typescript: layout({ helper: 'javascript', runLanguage: 'javascript', readerName: 'solution.js', build: javascriptFiles }),
	bash: layout({ helper: 'bash', runLanguage: 'bash', readerName: 'solution.sh', build: bashFiles }),
	c: layout({
		helper: 'c',
		runLanguage: 'c',
		readerName: 'reader',
		readerFileName: 'solution.c',
		includeName: 'reader.c',
		build: cFiles,
		readerTopLines: cFeatureMacroLines,
	}),
	'c++': layout({
		helper: 'c++',
		runLanguage: 'c++',
		readerName: 'reader',
		readerFileName: 'solution.cpp',
		includeName: 'reader.cpp',
		build: cFiles,
		quietReaderMain: cppDefinesMain,
	}),
	go: layout({ helper: 'go', runLanguage: 'go', readerName: 'solution.go', build: goFiles }),
});

/** The layout of `language` (any name languages.js knows), or null. */
function layoutFor(language) {
	const id = languageInfo(language).id;
	return Object.hasOwn(LAYOUTS, id) ? LAYOUTS[id] : null;
}

/**
 * The files of one check run (THE FILES OF A CHECK in the header): { files: [harness, reader,
 * (Python's helper module)], runLanguage, readerFileName, harnessFileName, lineOffset }, or null
 * when `language` has no check helper.
 */
export function buildCheckFiles({ language, readerCode, harness } = {}) {
	const chosen = layoutFor(language);
	if (chosen === null) return null;
	const harnessInfo = languageInfo(chosen.runLanguage);
	const built = chosen.build({
		readerCode: String(readerCode ?? ''),
		harness: String(harness ?? '').replace(NON_UNIX_LINE_BREAK, '\n'),
		helper: CHECK_HELPERS[chosen.helper],
		readerName: chosen.readerName,
		readerFileName: chosen.readerFileName,
		includeName: chosen.includeName,
		quietReaderMain: chosen.quietReaderMain,
		readerTopLines: chosen.readerTopLines,
	});
	return {
		files: [
			{ name: harnessInfo.submitName, content: built.main },
			{ name: chosen.readerName, content: built.reader },
			...(built.extra ?? []),
		],
		runLanguage: chosen.runLanguage,
		readerFileName: chosen.readerFileName,
		harnessFileName: harnessInfo.fileName,
		lineOffset: 0,
	};
}
