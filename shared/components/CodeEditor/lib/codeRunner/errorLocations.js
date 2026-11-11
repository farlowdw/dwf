/**
 * errorLocations.js — where a run went wrong in the reader's code: the lines (and columns) that
 * the compiler's or the program's error output names, read from Piston's answer, so the editor
 * can underline them and list them ("Line 4 · IndexError: list index out of range"). Pure; no
 * React, no DOM, no Monaco.
 *
 *     errorLocations(response, { language, fileName, code, lineOffset, mapLine })
 *       -> [{ line, column, endColumn, message, severity, stage }, …]
 *
 * `response` is Piston's answer as it came ({ language, version, compile?, run }: result.js's
 * header). When compiling failed only the compile stage is read (Piston repeats the compiler's
 * output as the run); otherwise both, each by its own reader (READERS: { compile, run }): for
 * C / C++, gcc's diagnostics come from the compile stage only (gcc writes nothing while the
 * program runs, so a program's own `main.c:4: warning: …` on stderr is not the compiler's) and a
 * failed assert() from the run only; every other language reads both stages the same way. Of
 * each stage the reader reads `stderr`, where every tool below writes its errors (`output` when
 * a stage has no stderr).
 *
 * THE OPTIONS
 *   language    the language that ran (any name languages.js > languageInfo knows). It picks
 *               the reader in READERS; a language without one gives [].
 *   fileName    the reader's own file, as the error output names it: main.py, main.js, main.c,
 *               main.cpp, main.go, main.sh (in an exercise check: solution.py …). A name without
 *               an extension (languages.js > submitName, 'main') gets the language's extension.
 *               Default: the language's file name (languages.js > fileName), and main.js for
 *               TypeScript, which runs as JavaScript (RUN_FILE_NAMES).
 *   code        the text of that file, line for line as the error output numbers it (optional;
 *               for an ordinary run, the code exactly as sent). It is used for three things:
 *               Python's columns (Python counts them from the first non-blank character of the
 *               line, in code points, so without the line itself they are null); gcc's and Go's
 *               columns (they count bytes, Monaco counts UTF-16 units: "é" is 2 bytes, an emoji
 *               4 bytes, one code point and 2 units); and a line past the end of the file, which
 *               moves to the last line. In an exercise check it is the reader's code as given to
 *               exercise.js > buildCheckFiles (for C / C++ the file sent holds two lines more,
 *               but `#line 1` numbers the reader's lines from 1 again).
 *   lineOffset  how many lines were added above the reader's code in the sent file (default 0):
 *               subtracted from every line; a location inside the added lines is dropped.
 *   mapLine     (line, column) -> line | null, applied after lineOffset (TypeScript: a line of
 *               the emitted JavaScript -> its TypeScript line, through the source map). The
 *               column is the sent file's (1-based, or undefined when the output names none):
 *               TypeScript joins a call's arguments written over several lines into ONE
 *               JavaScript line, and only the column says which of them failed. null drops
 *               the location; the columns become null (they describe the JavaScript). With
 *               mapLine, `code` is not used: the editor's code is then the source, not the file
 *               that ran, and its line count would cut the run's lines short.
 *
 * A LOCATION
 *   line        1-based, in the reader's code
 *   column      1-based start, or null when the output names no column (mark the whole line)
 *   endColumn   1-based EXCLUSIVE end, or null when only the start is known. A location may
 *               point just past the end of its line (gcc's "expected ';' before …").
 *   message     what went wrong, in the tool's own words: "IndexError: list index out of range",
 *               "'y' undeclared (first use in this function)", "undefined: x" (never empty:
 *               WORDS.noMessage when the output has none)
 *   severity    'warning' for gcc's and Bash's own warnings, 'error' for everything else
 *   stage       'compile' when the code was rejected before it ran (gcc's and Go's compilers, a
 *               Python or Node SyntaxError), 'run' when it failed while running
 *   Only lines of the reader's own file count — never the harness's, a library's or the
 *   runtime's. The list is sorted by line, then column, has no duplicates, and holds at most
 *   MAX_LOCATIONS entries, where a warning never takes an error's place (every error is kept
 *   first, up to the limit; the warnings fill the room left, the first lines first: a C program
 *   missing its #include lines has two warnings per library function above the one error that
 *   failed it). A failure that names no line of it (a segfault, an uncaught C++ exception, a
 *   linker error, `exit 1`) gives [].
 *
 * WHAT EACH READER LOOKS FOR (formats taken from real answers of a Piston server:
 * __tests__/fixtures/errors/*.json, one test each in __tests__/errorLocations.test.js)
 *   python   (3.9-3.12) The LAST traceback (a chained exception prints several), and in it the
 *            deepest frame in the reader's file, `File "/box/submission/main.py", line 2, in
 *            get`. The message is the first line at column 0 after the frames. The column comes
 *            from the marker line under the frame's source line (3.11+: `~~~~~^^^`; SyntaxError's
 *            caret in every version). A frame without ", in …" is SyntaxError's own: stage
 *            compile. Python 3.12 leaves the markers out when they would cover the whole line.
 *            What a marker counts depends on the version (Piston's answer's `version`): one per
 *            code point on the server's 3.10, 3.11 and 3.12.0; 3.9's SyntaxError caret counts
 *            UTF-8 BYTES (PYTHON_BYTE_CARETS: in `print("日本" 1)` it stands four columns right
 *            of the `1`), so it is made a character column as gcc's is.
 *            A NEWER PYTHON: CPython 3.12.4 and later (seen on 3.12.4, 3.12.13, 3.13 and 3.14)
 *            size a RUNTIME frame's markers by display width — an East Asian Wide or Fullwidth
 *            character (CJK, an emoji) takes two, as their traceback.py > _display_width does —
 *            while their SyntaxError carets still count code points. pythonColumns counts code
 *            points, so on such a version every wide character in or before the marked span
 *            would move the squiggle a column right: capture a fixture with one there (a
 *            runtime error and a SyntaxError) before installing it, and count width for that
 *            version's runtime frames.
 *   javascript, typescript (Node 16-20)
 *            The first stack frame in the reader's file, `at f (/box/submission/main.js:2:9)`
 *            (the deepest call): its place is the `:line:column` that ends the line, its path
 *            what comes before, after the last ` (`. Without one: the header Node prints above
 *            the error, `/box/submission/main.js:2` with the source line and a caret under the
 *            column below it — the only place a SyntaxError names its line (stage compile). The
 *            message is the error's first line, "ReferenceError: b is not defined": the first
 *            line after the header's caret, whatever file the header names (node:assert:126
 *            too, whose message runs over several lines), else the last line above the stack.
 *            Node's columns already count UTF-16 units.
 *   c, c++   (gcc / g++ 10) In the compile stage: `main.c:3:13: error: …` and `warning: …`;
 *            notes, "In function" and "required from here" lines attach to nothing (so a
 *            template error that gcc places in a library header marks no line). The marked range
 *            under gcc's source display (`^~~~`) gives endColumn. gcc 10 counts columns in bytes,
 *            a tab as one; gcc 11 and later count display columns by default (a tab up to 8): a
 *            newer gcc needs a fixture with a tab and an "é" before trusting characterColumn().
 *            In the run stage: a failed assert(), glibc's `a.out: main.c:4: main: Assertion
 *            `x > 0' failed.` (C++ names the function's whole signature, `int check(int)`): stage
 *            run, no column, the message from "Assertion" on.
 *   go       (1.16) The compiler's `./main.go:6:14: undefined: x`, always with a column (Go
 *            compiles inside its run stage; stage compile). A line without one, `main.go:7:
 *            starting`, is the `log` package's (log.Lshortfile / Llongfile): the program's own
 *            output, never a location. A panic's first frame in the reader's file,
 *            `/box/submission/main.go:8 +0x1d`, with the `panic: …` (or `fatal error: …`) line as
 *            its message.
 *   bash     (5.2) `main.sh: line 2: foo: command not found`. After a syntax error Bash echoes
 *            the offending line ("main.sh: line 3: `fi'"): that echo is dropped. Bash's own
 *            warnings (`main.sh: line 2: warning: here-document …`) have severity 'warning'.
 *   A path counts as the reader's file when its name is one of the reader's names and it is
 *   relative (main.c, ./main.go) or in the run's directory on the server
 *   (SUBMISSION_DIRECTORIES) — so the standard library's own unittest/main.py never does.
 *
 * LINEAR TIME  A program may print a line as long as Piston lets a stream be (64 KB), and the
 *   locations are worked out while the page draws, so every line is read in time proportional
 *   to its length. The patterns that end in `.*` carry the `s` flag: without it `.` stops at a
 *   lone "\r", U+2028 or U+2029 (a line can hold one: lines are split at "\n" only), the end
 *   is never reached, and the pattern retried every earlier start — 0.2-0.6 s on such a line.
 *   A Node frame is read in two steps (NODE_FRAME_PLACE, then the last NODE_FRAME_OPEN before
 *   it), never by one pattern that tried every ` (` against every `:line:column`; a glibc
 *   assertion by its start and plain string searches. __tests__/errorLocations.test.js times a
 *   64 KB line made to trip each reader. A new pattern: never two unbounded parts that can
 *   match the same text next to each other, and the `s` flag on a `.*` that must reach the end.
 *
 * HOW TO CHANGE IT
 *   A new language: a read<Format>(text, context) function returning raw locations
 *   ({ line, column, endColumn, message, severity, stage }, line in the SENT file) and its
 *   entry in READERS (sameInEveryStage(read), or { compile, run } when the stages hold
 *   different tools' words, as GCC_READERS); capture a real answer as a fixture in
 *   __tests__/fixtures/errors (the test file's header says how) and add its expected locations
 *   to EXPECTED there.
 *   Where the server runs the code: SUBMISSION_DIRECTORIES. The longest list: MAX_LOCATIONS.
 *   The words used when the output has none: WORDS. What makes a gcc line a location:
 *   GCC_SEVERITIES; a failed assert(): GLIBC_ASSERTION_*; a Bash warning: BASH_WARNING_START.
 *   Which Python versions count a caret in bytes: PYTHON_BYTE_CARETS.
 */

import { languageInfo } from './languages.js';

/**
 * The words this module adds itself (every other word is the tools' own): a location's message
 * when the output has none, per severity.
 */
const WORDS = Object.freeze({
	noMessage: Object.freeze({ error: 'Error', warning: 'Warning' }),
});

/**
 * The most locations returned (a cascade of compiler errors is cut here, after sorting; a warning
 * makes room for an error: capped()).
 */
const MAX_LOCATIONS = 50;

/** Severities and stages of a location (see the header). */
const SEVERITY_ERROR = 'error';
const SEVERITY_WARNING = 'warning';
const STAGE_COMPILE = 'compile';
const STAGE_RUN = 'run';

/**
 * Directories the server runs the reader's files in: isolate's box on a current server, and
 * older Piston versions' per-job folder. A path in any other directory is never the reader's.
 */
const SUBMISSION_DIRECTORIES = Object.freeze([/^\/box\/submission$/, /^\/piston\/jobs\/[^/]+$/]);

/** The prefix of a file URL in a stack frame (Node's ES modules). */
const FILE_URL_PREFIX = /^file:\/\//;

/** The file a language's run names when it is not languages.js > fileName (see the header). */
const RUN_FILE_NAMES = Object.freeze({
	typescript: 'main.js',
});

/** A line break in the tools' output or in the code (Piston's output has "\n"). */
const LINE_BREAK = /\r?\n/;

/** Characters Python strips from the start of a source line before showing it (each one UTF-16 unit). */
const PYTHON_BLANKS = Object.freeze([' ', '\t', '\f']);

/** Python: the line that starts each traceback. */
const PYTHON_TRACEBACK_HEADER = 'Traceback (most recent call last):';

/** Python: a frame, `  File "/box/submission/main.py", line 2, in get` (", in …" absent for a SyntaxError). */
const PYTHON_FRAME = /^(\s*)File "(.+)", line (\d+)(, in .*)?$/s;

/**
 * Python versions (Piston's `version`) whose SyntaxError caret counts UTF-8 bytes, not code
 * points: 3.9's parser (3.10 counts characters). Older versions are not installed: unchecked.
 */
const PYTHON_BYTE_CARETS = /^3\.9(?:\.|$)/;

/** Python: the marker line under a frame's source line (`~~~~~^^^`, a SyntaxError's `^`). */
const PYTHON_MARKER_LINE = /^\s*[~^][~^ ]*$/;

/** Python: one marker character. */
const PYTHON_MARKER = /[~^]/;

/** Node: any line of a stack, `    at JSON.parse (<anonymous>)` included. */
const NODE_STACK_LINE = /^\s+at /;

/**
 * Node: the place that ends a stack frame's line, `:2:9)` of `    at f (/box/submission/main.js:2:9)`
 * or `:4:1` of `    at /box/submission/main.js:4:1` (the leftmost match that reaches the end).
 */
const NODE_FRAME_PLACE = /:(\d+):(\d+)\)?$/;

/** Node: what opens a frame's path when the frame names a function, `at f (`. */
const NODE_FRAME_OPEN = ' (';

/** Node: the header above an uncaught error, `/box/submission/main.js:2`. */
const NODE_HEADER = /^(\S.*):(\d+)$/;

/** Node: the caret line under the header's source line. */
const NODE_CARET_LINE = /^[ \t]*\^+\s*$/;

/** Node: the error name that means the file could not be compiled. */
const NODE_SYNTAX_ERROR = 'SyntaxError';

/** gcc / g++: a diagnostic, `main.c:3:13: error: 'y' undeclared …` (the column may be missing). */
const GCC_DIAGNOSTIC = /^(.+?):(\d+):(?:(\d+):)? (fatal error|error|warning|note): (.*)$/s;

/** gcc: the kinds that become a location, and their severity (a note attaches to nothing). */
const GCC_SEVERITIES = Object.freeze({
	'fatal error': SEVERITY_ERROR,
	error: SEVERITY_ERROR,
	warning: SEVERITY_WARNING,
});

/** gcc: its display of a source line, `    3 |     int x = y + 1;`. */
const GCC_SOURCE_DISPLAY = /^\s*(\d+) \| /;

/** gcc: the line under it that marks the range, `      |             ^~~~`. */
const GCC_RANGE_DISPLAY = /^\s+\| (.*)$/s;

/**
 * glibc: the start of a failed assert()'s line, the program, then the file and line:
 * `a.out: main.c:4: ` of `a.out: main.c:4: main: Assertion `x > 0' failed.`
 */
const GLIBC_ASSERTION_START = /^[^:\s]+: ([^:\s]+):(\d+): /;

/** glibc: the assertion's own words start with this (after the function's name and ": ", if any) … */
const GLIBC_ASSERTION_WORDS = 'Assertion `';

/** … and end with this. */
const GLIBC_ASSERTION_END = "' failed.";

/** glibc: between the function's name and the assertion's words. */
const GLIBC_FUNCTION_END = ': ';

/**
 * Go: a compiler error, `./main.go:6:14: undefined: x` — always with a column (the `log`
 * package's `main.go:7: starting` has none, and is the program's output, not the compiler's).
 */
const GO_COMPILER_ERROR = /^(.+?\.go):(\d+):(\d+): (.*)$/s;

/** Go: the first line of a crash, `panic: …` or `fatal error: …`. */
const GO_CRASH_START = /^(panic|fatal error): /;

/** Go: a frame of a crash's goroutine trace, a tab then `/box/submission/main.go:8 +0x1d`. */
const GO_FRAME = /^\t(.+?\.go):(\d+)(?: \+0x[0-9a-f]+)?$/;

/** Bash: an error, `main.sh: line 2: foo: command not found`. */
const BASH_ERROR = /^(.+?): line (\d+): (.*)$/s;

/** Bash: the start of a syntax error's message, and the echo of the offending line after it. */
const BASH_SYNTAX_ERROR_START = 'syntax error';
const BASH_OFFENDING_LINE_ECHO = /^`.*'$/;

/** Bash: the start of its own warnings' message (`main.sh: line 2: warning: here-document …`). */
const BASH_WARNING_START = 'warning: ';

/** The largest code point UTF-8 writes in 1, 2 and 3 bytes (anything above takes 4). */
const UTF8_ONE_BYTE_MAX = 0x7f;
const UTF8_TWO_BYTES_MAX = 0x7ff;
const UTF8_THREE_BYTES_MAX = 0xffff;

// Small helpers

/** The value when it is a string, else ''. */
function textOf(value) {
	return typeof value === 'string' ? value : '';
}

/** The lines of a text ([] for ''). */
function splitLines(text) {
	return text === '' ? [] : text.split(LINE_BREAK);
}

/** The last item of a list, or undefined. */
function lastOf(list) {
	return list[list.length - 1];
}

/** A raw location (line in the SENT file; columns null when unknown). */
function rawLocation(line, { column = null, endColumn = null, message, severity = SEVERITY_ERROR, stage }) {
	const words = textOf(message).trim();
	return { line, column, endColumn, message: words === '' ? WORDS.noMessage[severity] : words, severity, stage };
}

/** A string of digits as a number, or null for undefined. */
function numberOf(digits) {
	return digits === undefined ? null : Number(digits);
}

/** How many bytes UTF-8 takes for one code point. */
function utf8Length(codePoint) {
	if (codePoint <= UTF8_ONE_BYTE_MAX) return 1;
	if (codePoint <= UTF8_TWO_BYTES_MAX) return 2;
	if (codePoint <= UTF8_THREE_BYTES_MAX) return 3;
	return 4;
}

/**
 * The 1-based column, in characters as Monaco counts them (UTF-16 code units), of a 1-based
 * UTF-8 BYTE column of `lineText` (gcc and Go count bytes). Past the end of the line, the extra
 * bytes count one column each.
 */
function characterColumn(lineText, byteColumn) {
	const bytesBefore = byteColumn - 1;
	let bytes = 0;
	let index = 0;
	while (index < lineText.length && bytes < bytesBefore) {
		const codePoint = lineText.codePointAt(index);
		bytes += utf8Length(codePoint);
		index += String.fromCodePoint(codePoint).length;
	}
	return index + 1 + Math.max(0, bytesBefore - bytes);
}

/** A byte column as a character column when the line's text is known (else as it is). */
function byteToCharacterColumn(byteColumn, lineText) {
	if (byteColumn === null || lineText === null) return byteColumn;
	return characterColumn(lineText, byteColumn);
}

/**
 * How many UTF-16 units (what Monaco counts) the first `codePoints` code points of `text` take
 * (Python counts code points: an emoji is one for Python, two for Monaco). Past the end of the
 * text, one each.
 */
function utf16Length(text, codePoints) {
	let units = 0;
	let counted = 0;
	while (units < text.length && counted < codePoints) {
		units += String.fromCodePoint(text.codePointAt(units)).length;
		counted += 1;
	}
	return units + (codePoints - counted);
}

// The reader's file

/** The part of a path after its last "/". */
function baseName(path) {
	return path.slice(path.lastIndexOf('/') + 1);
}

/** The extension of a file name, with its dot ('' when it has none). */
function extensionOf(fileName) {
	const dot = fileName.lastIndexOf('.');
	return dot < 0 ? '' : fileName.slice(dot);
}

/** The file a language's run writes the reader's code into (see the header: fileName). */
function defaultFileName(languageId) {
	if (Object.hasOwn(RUN_FILE_NAMES, languageId)) return RUN_FILE_NAMES[languageId];
	return languageInfo(languageId).fileName;
}

/** The names the reader's file may have in the output: the given one, plus its extension if it has none. */
function readerFileNames(fileName, languageId) {
	const fallback = defaultFileName(languageId);
	const given = baseName(textOf(fileName).trim()) || fallback;
	if (extensionOf(given) !== '') return [given];
	return [given, `${given}${extensionOf(fallback)}`];
}

/** Is this the directory part of a path the server ran the reader's code from? */
function isSubmissionDirectory(directory) {
	if (directory === '' || directory === '.') return true;
	return SUBMISSION_DIRECTORIES.some((pattern) => pattern.test(directory));
}

/** A test: does a path in the output name the reader's file? */
function readerFileTest(names) {
	return (path) => {
		const clean = textOf(path).replace(FILE_URL_PREFIX, '');
		const slash = clean.lastIndexOf('/');
		const directory = slash < 0 ? '' : clean.slice(0, slash);
		return names.includes(baseName(clean)) && isSubmissionDirectory(directory);
	};
}

/**
 * What every reader is given besides the text:
 *   isReaderFile(path)   does this path name the reader's file?
 *   sourceLine(line)     that line of the sent code, or null (no code, or no such line)
 *   lineCount            the sent code's line count, or null without code
 *   version              the version that ran (Piston's answer's `version`), or ''
 */
function readerContext({ language, fileName, code, version }) {
	const languageId = languageInfo(language).id;
	const codeLines = typeof code === 'string' ? code.split(LINE_BREAK) : null;
	return {
		isReaderFile: readerFileTest(readerFileNames(fileName, languageId)),
		sourceLine: (line) => codeLines?.[line - 1] ?? null,
		lineCount: codeLines === null ? null : codeLines.length,
		version: textOf(version),
	};
}

// Python

/** How many characters Python strips from the start of this line. */
function pythonIndent(lineText) {
	let count = 0;
	while (count < lineText.length && PYTHON_BLANKS.includes(lineText[count])) count += 1;
	return count;
}

/** Is line `index` the source line shown under a frame indented by `frameIndent`? */
function isPythonSourceLine(lines, index, frameIndent) {
	const text = lines[index];
	if (text === undefined || text.trim() === '' || PYTHON_FRAME.test(text)) return false;
	return text.length - text.trimStart().length > frameIndent;
}

/** One frame at line `index`: { path, line, isSyntaxError, source, marker, end } (end: its last line's index). */
function pythonFrameAt(lines, index, match) {
	const frame = {
		path: match[2],
		line: Number(match[3]),
		isSyntaxError: match[4] === undefined,
		source: null,
		marker: null,
		end: index,
	};
	if (!isPythonSourceLine(lines, index + 1, match[1].length)) return frame;
	frame.source = lines[index + 1];
	frame.end = index + 1;
	if (PYTHON_MARKER_LINE.test(lines[index + 2] ?? '')) {
		frame.marker = lines[index + 2];
		frame.end = index + 2;
	}
	return frame;
}

/** Every frame of a traceback's lines, in order. */
function pythonFrames(lines) {
	const frames = [];
	lines.forEach((text, index) => {
		const match = PYTHON_FRAME.exec(text);
		if (match) frames.push(pythonFrameAt(lines, index, match));
	});
	return frames;
}

/** The lines of the last traceback (all lines when there is no header: a SyntaxError in the main file). */
function lastTraceback(lines) {
	return lines.slice(lines.lastIndexOf(PYTHON_TRACEBACK_HEADER) + 1);
}

/** The exception line: the first line at column 0 after line `afterIndex`. */
function pythonMessage(lines, afterIndex) {
	const rest = lines.slice(afterIndex + 1);
	return rest.find((text) => text.trim() !== '' && !/^\s/.test(text)) ?? '';
}

/** Where the marker line's first and last marker are: { start, end } (end exclusive), as indexes of the line. */
function markerSpan(marker) {
	const start = marker.search(PYTHON_MARKER);
	let end = marker.length;
	while (end > start && !PYTHON_MARKER.test(marker[end - 1])) end -= 1;
	return { start, end };
}

/** Does this frame's marker count UTF-8 bytes (a SyntaxError's caret of a version in PYTHON_BYTE_CARETS)? */
function markerCountsBytes(frame, context) {
	return frame.isSyntaxError && PYTHON_BYTE_CARETS.test(context.version);
}

/**
 * How many UTF-16 units (what Monaco counts) the start of `readerText` takes that `count`
 * marker positions stand for: `count` UTF-8 bytes when `countsBytes`, else `count` code points.
 */
function pythonUnits(readerText, count, countsBytes) {
	if (countsBytes) return characterColumn(readerText, count + 1) - 1;
	return utf16Length(readerText, count);
}

/**
 * The columns a frame's marker line points at, in the reader's line: Python shows the line
 * without its indentation and puts the markers under that (one per code point, or per byte:
 * see the header), so the indentation comes from the sent code and the markers become UTF-16
 * units there. Unknown (null) without a marker, without the code, or when the code's line is
 * not the one Python showed.
 */
function pythonColumns(frame, context) {
	const unknown = { column: null, endColumn: null };
	const codeLine = context.sourceLine(frame.line);
	if (frame.marker === null || codeLine === null) return unknown;
	const indent = pythonIndent(codeLine);
	const readerText = codeLine.slice(indent);
	if (readerText.trimEnd() !== frame.source.trim()) return unknown;
	const shownFrom = frame.source.length - frame.source.trimStart().length;
	const { start, end } = markerSpan(frame.marker);
	if (start < shownFrom) return unknown;
	const countsBytes = markerCountsBytes(frame, context);
	const column = indent + pythonUnits(readerText, start - shownFrom, countsBytes) + 1;
	const endColumn = indent + pythonUnits(readerText, end - shownFrom, countsBytes) + 1;
	return { column, endColumn };
}

/** Python: the deepest frame in the reader's file of the last traceback (see the header). */
function readPython(text, context) {
	const lines = lastTraceback(splitLines(text));
	const frames = pythonFrames(lines);
	const deepest = lastOf(frames.filter((frame) => context.isReaderFile(frame.path)));
	if (!deepest) return [];
	const message = pythonMessage(lines, lastOf(frames).end);
	const stage = deepest.isSyntaxError ? STAGE_COMPILE : STAGE_RUN;
	return [rawLocation(deepest.line, { ...pythonColumns(deepest, context), message, stage })];
}

// Node (JavaScript, and TypeScript run as JavaScript)

/**
 * A frame's path from the text between `at ` and its place: what follows the last ` (` that has
 * at least one character after it (the frame names a function), else all of it.
 */
function nodeFramePath(before) {
	const lastStart = before.length - NODE_FRAME_OPEN.length - 1;
	const open = lastStart < 0 ? -1 : before.lastIndexOf(NODE_FRAME_OPEN, lastStart);
	return open < 0 ? before : before.slice(open + NODE_FRAME_OPEN.length);
}

/** The stack frame on a line, { path, line, column, index }, or null (see the header: LINEAR TIME). */
function nodeFrameAt(lines, index) {
	const text = lines[index];
	const start = NODE_STACK_LINE.exec(text);
	const place = start ? NODE_FRAME_PLACE.exec(text) : null;
	if (!place || place.index <= start[0].length) return null;
	const path = nodeFramePath(text.slice(start[0].length, place.index));
	return { path, line: Number(place[1]), column: Number(place[2]), index };
}

/** The caret line's columns: { column, endColumn } (endColumn exclusive), or nulls without one. */
function caretColumns(caretLine) {
	if (caretLine === undefined || !NODE_CARET_LINE.test(caretLine)) return { column: null, endColumn: null };
	const start = caretLine.indexOf('^');
	const end = caretLine.lastIndexOf('^') + 1;
	return { column: start + 1, endColumn: end + 1 };
}

/** The LAST header naming the reader's file: { index, line, column, endColumn, end }, or null. */
function lastNodeHeader(lines, context) {
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const match = NODE_HEADER.exec(lines[index]);
		if (!match || !context.isReaderFile(match[1])) continue;
		const columns = caretColumns(lines[index + 2]);
		const end = columns.column === null ? index + 1 : index + 2;
		return { index, line: Number(match[2]), ...columns, end };
	}
	return null;
}

/** Is line `index` a line of a stack? */
function isStackLine(lines, index) {
	return NODE_STACK_LINE.test(lines[index]);
}

/** The frames with a place on lines `fromIndex` … `toIndex` (exclusive), in order. */
function framesBetween(lines, fromIndex, toIndex) {
	const frames = [];
	for (let index = fromIndex; index < toIndex; index += 1) {
		const frame = nodeFrameAt(lines, index);
		if (frame) frames.push(frame);
	}
	return frames;
}

/** The last unbroken run of stack lines (the error printed last): { start, end } (end exclusive), or null. */
function lastStack(lines) {
	let end = lines.length;
	while (end > 0 && !isStackLine(lines, end - 1)) end -= 1;
	if (end === 0) return null;
	let start = end - 1;
	while (start > 0 && isStackLine(lines, start - 1)) start -= 1;
	return { start, end };
}

/** The first non-blank line after `afterIndex` that is not a stack line, or ''. */
function firstWordsAfter(lines, afterIndex) {
	const text = lines.slice(afterIndex + 1).find((line) => line.trim() !== '');
	return text === undefined || NODE_STACK_LINE.test(text) ? '' : text;
}

/** The last non-blank line before `beforeIndex`, or ''. */
function lastWordsBefore(lines, beforeIndex) {
	return lastOf(lines.slice(0, beforeIndex).filter((line) => line.trim() !== '')) ?? '';
}

/**
 * The index of the caret line of the nearest header above line `stackStart`, whatever file it
 * names (node:assert:126, undefined:1), without going past an earlier stack; -1 when there is
 * none. Only a header with its caret line counts: an error's own words may end in ":2".
 */
function caretLineAbove(lines, stackStart) {
	for (let index = stackStart - 1; index >= 0; index -= 1) {
		if (isStackLine(lines, index)) return -1;
		const caretIndex = index + 2;
		if (NODE_HEADER.test(lines[index]) && caretColumns(lines[caretIndex]).column !== null) return caretIndex;
	}
	return -1;
}

/**
 * The message of the error whose stack starts at `stackStart`: the first words after Node's
 * header (a message may run over several lines: an assertion's "2 !== 3" comes after its first
 * line), else the last words above the stack.
 */
function messageAbove(lines, stackStart) {
	const caretIndex = caretLineAbove(lines, stackStart);
	if (caretIndex < 0) return lastWordsBefore(lines, stackStart);
	return firstWordsAfter(lines, caretIndex);
}

/** The error's frames and message: after the reader's header when Node printed one, else the last stack. */
function nodeError(lines, header) {
	if (header) {
		return { frames: framesBetween(lines, header.index, lines.length), message: firstWordsAfter(lines, header.end) };
	}
	const stack = lastStack(lines);
	if (stack === null) return { frames: [], message: '' };
	return { frames: framesBetween(lines, stack.start, stack.end), message: messageAbove(lines, stack.start) };
}

/** Node: the first stack frame in the reader's file, else the header (see the header comment). */
function readNode(text, context) {
	const lines = splitLines(text);
	const header = lastNodeHeader(lines, context);
	const { frames, message } = nodeError(lines, header);
	const frame = frames.find((candidate) => context.isReaderFile(candidate.path));
	if (frame) return [rawLocation(frame.line, { column: frame.column, message, stage: STAGE_RUN })];
	if (!header) return [];
	const stage = message.startsWith(NODE_SYNTAX_ERROR) ? STAGE_COMPILE : STAGE_RUN;
	return [rawLocation(header.line, { column: header.column, endColumn: header.endColumn, message, stage })];
}

// gcc / g++

/**
 * The range gcc marks under its display of line `line` right after the diagnostic at `index`
 * (`^~~~`, or `~~~^~~`): { before, length } — how many marked characters come before the caret,
 * and how many there are in all. null when the display is not there.
 */
function gccMarkedRange(lines, index, line) {
	const source = GCC_SOURCE_DISPLAY.exec(lines[index + 1] ?? '');
	const range = GCC_RANGE_DISPLAY.exec(lines[index + 2] ?? '');
	if (!source || Number(source[1]) !== line || !range) return null;
	const marks = range[1];
	const caret = marks.indexOf('^');
	if (caret < 0) return null;
	let start = caret;
	while (start > 0 && marks[start - 1] === '~') start -= 1;
	let end = caret + 1;
	while (marks[end] === '~') end += 1;
	return { before: caret - start, length: end - start };
}

/** The columns of one gcc diagnostic: its byte column made a character column, widened to the marked range. */
function gccColumns(lines, index, line, byteColumn, context) {
	const caretColumn = byteToCharacterColumn(byteColumn, context.sourceLine(line));
	if (caretColumn === null) return { column: null, endColumn: null };
	const range = gccMarkedRange(lines, index, line);
	if (range === null) return { column: caretColumn, endColumn: null };
	const column = caretColumn - range.before;
	return { column, endColumn: column + range.length };
}

/** gcc / g++, in the compile stage: every error and warning in the reader's file (see the header). */
function readGcc(text, context) {
	const lines = splitLines(text);
	const locations = [];
	lines.forEach((lineText, index) => {
		const match = GCC_DIAGNOSTIC.exec(lineText);
		if (!match || !context.isReaderFile(match[1]) || !Object.hasOwn(GCC_SEVERITIES, match[4])) return;
		const line = Number(match[2]);
		const columns = gccColumns(lines, index, line, numberOf(match[3]), context);
		locations.push(rawLocation(line, { ...columns, message: match[5], severity: GCC_SEVERITIES[match[4]], stage: STAGE_COMPILE }));
	});
	return locations;
}

/**
 * The words of a failed assertion after its file and line, `Assertion `x > 0' failed.`, from
 * `rest` = `main: Assertion `x > 0' failed.` (or without the function's name); null when it is
 * not one. Plain string searches (see the header: LINEAR TIME).
 */
function assertionWords(rest) {
	if (!rest.endsWith(GLIBC_ASSERTION_END)) return null;
	if (rest.startsWith(GLIBC_ASSERTION_WORDS)) return rest;
	const wordsAt = rest.indexOf(`${GLIBC_FUNCTION_END}${GLIBC_ASSERTION_WORDS}`);
	return wordsAt < 0 ? null : rest.slice(wordsAt + GLIBC_FUNCTION_END.length);
}

/** C / C++, in the run stage: every failed assert() in the reader's file (see the header). */
function readGlibcAssertions(text, context) {
	const locations = [];
	for (const lineText of splitLines(text)) {
		const start = GLIBC_ASSERTION_START.exec(lineText);
		if (!start || !context.isReaderFile(start[1])) continue;
		const message = assertionWords(lineText.slice(start[0].length));
		if (message !== null) locations.push(rawLocation(Number(start[2]), { message, stage: STAGE_RUN }));
	}
	return locations;
}

// Go

/** Go: the compiler's errors in the reader's file. */
function goCompilerErrors(lines, context) {
	const locations = [];
	for (const lineText of lines) {
		const match = GO_COMPILER_ERROR.exec(lineText);
		if (!match || !context.isReaderFile(match[1])) continue;
		const line = Number(match[2]);
		const column = byteToCharacterColumn(Number(match[3]), context.sourceLine(line));
		locations.push(rawLocation(line, { column, message: match[4], stage: STAGE_COMPILE }));
	}
	return locations;
}

/** Go: a crash's first frame in the reader's file, with the crash's first line as its message. */
function goCrash(lines, context) {
	const start = lines.findIndex((lineText) => GO_CRASH_START.test(lineText));
	if (start < 0) return [];
	for (const lineText of lines.slice(start + 1)) {
		const match = GO_FRAME.exec(lineText);
		if (match && context.isReaderFile(match[1])) {
			return [rawLocation(Number(match[2]), { message: lines[start], stage: STAGE_RUN })];
		}
	}
	return [];
}

/** Go: compiler errors and a crash (see the header). */
function readGo(text, context) {
	const lines = splitLines(text);
	return [...goCompilerErrors(lines, context), ...goCrash(lines, context)];
}

// Bash

/** Is this Bash's echo of the line a syntax error was just reported on? */
function isOffendingLineEcho(previous, line, message) {
	if (!previous || previous.line !== line) return false;
	return previous.message.startsWith(BASH_SYNTAX_ERROR_START) && BASH_OFFENDING_LINE_ECHO.test(message);
}

/** Bash: a message's severity (its own warnings say so). */
function bashSeverity(message) {
	return message.startsWith(BASH_WARNING_START) ? SEVERITY_WARNING : SEVERITY_ERROR;
}

/** Bash: every `<file>: line N: …` of the reader's file (see the header). */
function readBash(text, context) {
	const locations = [];
	for (const lineText of splitLines(text)) {
		const match = BASH_ERROR.exec(lineText);
		if (!match || !context.isReaderFile(match[1])) continue;
		const line = Number(match[2]);
		const message = match[3];
		if (isOffendingLineEcho(lastOf(locations), line, message)) continue;
		locations.push(rawLocation(line, { message, severity: bashSeverity(message), stage: STAGE_RUN }));
	}
	return locations;
}

// The answer, and the locations in the reader's code

/** A language whose compile and run stages are read the same way. */
function sameInEveryStage(read) {
	return Object.freeze({ compile: read, run: read });
}

/** C / C++: gcc's diagnostics while compiling, a failed assert() while running (see the header). */
const GCC_READERS = Object.freeze({ compile: readGcc, run: readGlibcAssertions });

/** The readers of each language, one per stage of Piston's answer (canonical names: languages.js). */
const READERS = Object.freeze({
	python: sameInEveryStage(readPython),
	javascript: sameInEveryStage(readNode),
	typescript: sameInEveryStage(readNode),
	c: GCC_READERS,
	'c++': GCC_READERS,
	go: sameInEveryStage(readGo),
	bash: sameInEveryStage(readBash),
});

/** Did this stage fail (a status, a signal, or a non-zero exit code)? The same rule as result.js. */
function stageFailed(stage) {
	if (!stage || typeof stage !== 'object') return false;
	if (textOf(stage.status) !== '' || textOf(stage.signal) !== '') return true;
	return typeof stage.code === 'number' && stage.code !== 0;
}

/** A stage's error text: its stderr, else its output. */
function errorText(stage) {
	if (!stage || typeof stage !== 'object') return '';
	return typeof stage.stderr === 'string' ? stage.stderr : textOf(stage.output);
}

/**
 * The stages to read, [{ name: 'compile' | 'run', text }] (a name is a key of a READERS entry):
 * the compile stage's alone when compiling failed, else compile and run.
 */
function stagesToRead(response) {
	const compile = { name: 'compile', text: errorText(response.compile) };
	if (stageFailed(response.compile)) return [compile];
	const run = { name: 'run', text: errorText(response.run) };
	return [compile, run].filter((stage) => stage.text !== '');
}

/** A whole number >= 0, else 0. */
function offsetOf(lineOffset) {
	return Number.isInteger(lineOffset) && lineOffset > 0 ? lineOffset : 0;
}

/** A raw location in the reader's code (see the header: lineOffset, mapLine), or null to drop it. */
function placeLocation(raw, { offset, mapLine, lineCount }) {
	const sentLine = lineCount === null ? raw.line : Math.min(raw.line, lineCount);
	const line = sentLine - offset;
	if (line < 1) return null;
	if (typeof mapLine !== 'function') return { ...raw, line };
	const mapped = mapLine(line, raw.column ?? undefined);
	if (!Number.isInteger(mapped) || mapped < 1) return null;
	return { ...raw, line: mapped, column: null, endColumn: null };
}

/** Sort order: by line, then column (a whole line, null, first). */
function byPosition(a, b) {
	if (a.line !== b.line) return a.line - b.line;
	return (a.column ?? 0) - (b.column ?? 0);
}

/** The locations without exact duplicates (the first of each kept). */
function withoutDuplicates(locations) {
	const seen = new Set();
	return locations.filter((location) => {
		const key = JSON.stringify([location.line, location.column, location.endColumn, location.severity, location.message]);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** The readers of a language ({ compile, run }), or null (own keys only: 'constructor' is no language). */
function readersFor(language) {
	const id = languageInfo(language).id;
	return Object.hasOwn(READERS, id) ? READERS[id] : null;
}

/** Is this location an error (not a warning)? */
function isError(location) {
	return location.severity === SEVERITY_ERROR;
}

/**
 * The first MAX_LOCATIONS of the sorted locations, where a warning never takes an error's place:
 * every error is kept (up to MAX_LOCATIONS), the warnings fill the room left, the first lines
 * first. The order is kept.
 */
function capped(locations) {
	const errorCount = locations.filter(isError).length;
	const warningRoom = Math.max(0, MAX_LOCATIONS - errorCount);
	let errorsKept = 0;
	let warningsKept = 0;
	return locations.filter((location) => {
		if (isError(location)) {
			errorsKept += 1;
			return errorsKept <= MAX_LOCATIONS;
		}
		warningsKept += 1;
		return warningsKept <= warningRoom;
	});
}

/**
 * Where Piston's answer says the reader's code went wrong: a list of
 * { line, column, endColumn, message, severity, stage } (see the header for the options and the
 * rules). Never throws (unless mapLine does); [] for an answer it cannot read or a language it
 * has no reader for.
 */
export function errorLocations(response, options) {
	const { language, fileName, code, lineOffset = 0, mapLine } = options ?? {};
	const readers = readersFor(language);
	if (!readers || !response || typeof response !== 'object') return [];
	const hasMap = typeof mapLine === 'function';
	const context = readerContext({ language, fileName, code: hasMap ? undefined : code, version: response.version });
	const raw = stagesToRead(response).flatMap((stage) => readers[stage.name](stage.text, context));
	const placing = { offset: offsetOf(lineOffset), mapLine, lineCount: context.lineCount };
	const placed = raw.map((location) => placeLocation(location, placing)).filter((location) => location !== null);
	return capped(withoutDuplicates(placed.sort(byPosition)));
}
