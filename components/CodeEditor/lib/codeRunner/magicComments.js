/**
 * magicComments.js — the site's code-block MAGIC COMMENTS in a <CodeEditor> snippet: a comment
 * line such as `# highlight-next-line`, or `// highlight-error-start` … `// highlight-error-end`,
 * is taken out of the code the reader sees (and runs), and the lines it marks get that kind's
 * colours — the same comments marking the same lines as in the site's ``` code blocks. Pure; no
 * React, no DOM, no Monaco. (The colouring is the editor's decorations.js.)
 *
 * THE COMMENTS (MAGIC_COMMENTS: a copy of shared/wiring/index.cjs > MAGIC_COMMENTS, the list a
 * site's config hands to Prism, with each entry's `kind` added;
 * shared/__tests__/codeEditorTokens.test.mjs fails on every site when the two differ)
 *   kind        one line                    a block
 *   highlight   highlight-next-line         highlight-start … highlight-end
 *   error       highlight-error-next-line   highlight-error-start … highlight-error-end
 *   success     highlight-success-next-line highlight-success-start … highlight-success-end
 *   warning     highlight-warning-next-line highlight-warning-start … highlight-warning-end
 *   remove      highlight-remove-next-line  highlight-remove-start … highlight-remove-end
 *   add         highlight-add-next-line     highlight-add-start … highlight-add-end
 *   A magic comment is alone on its line (spaces and tabs around it are fine; such a line inside
 *   a multi-line string counts too, as in Docusaurus, which reads lines, not code), written in the
 *   language's comment syntax, chosen as Docusaurus chooses it (SYNTAXES_BY_LANGUAGE, its own
 *   table, plus Piston's names python2 and sqlite3; aliases such as 'py' or 'sh' go through
 *   languages.js > languageInfo):
 *     python, bash               # highlight-next-line
 *     javascript, typescript     // highlight-next-line, or the same in a slash-star block comment
 *     any other language         every popular syntax: //, a slash-star block comment, the same
 *     (c, c++, go, java …)       inside { } (JSX), #, and <!-- … --> (Docusaurus's default)
 *
 * WHICH LINES ARE MARKED (Docusaurus 3's rules: theme-common > lib/utils/codeBlockUtils.js >
 * parseLines; COPIED here, not imported — Docusaurus v4 drops that function)
 *   - `…-next-line` marks the next line that is not itself a magic comment;
 *   - `…-start` … `…-end` marks every line between the two; blocks of different kinds may
 *     overlap or nest;
 *   - every magic comment line is removed, so the line numbers are those the reader sees;
 *   - two kinds on one line: the one LATER in MAGIC_COMMENTS wins (add over remove over warning
 *     over success over error over highlight), as in the site's code blocks, where the later
 *     rule of shared/css/_code-blocks.scss wins.
 *   Where Docusaurus's result is an accident of its code, this file marks nothing and warns
 *   (through `warn`) instead: an `…-end` with no open `…-start` (Docusaurus marks from the first
 *   line), an empty block (Docusaurus marks the lines on either side of it), a second `…-start`
 *   of a block already open (ignored: the block runs from the first one), a `…-start` that is
 *   never ended (Docusaurus marks nothing either), a `…-next-line` with no line after it.
 *
 * BACK-COMPAT  A snippet without magic comments comes back as the very same string. With some,
 *   only their lines go, each with its own line ending: every other byte is kept (the other
 *   lines' "\n" or "\r\n", tabs, a final newline; a snippet that ends with a magic comment and
 *   no newline ends, as it did, without one). Lines are split on "\n" and "\r\n", as Docusaurus
 *   splits them. (Docusaurus also drops a code block's final newline; this file does not: the
 *   editor shows the snippet as written.)
 *
 * THE RESULT  stripMagicComments(code, language) ->
 *   { code: 'the code the reader sees', lineKinds: { 3: 'highlight', 7: 'error' }, removedLines: [2, 6] }
 *   lineKinds is keyed by the line the reader sees (1-based); removedLines are the numbers of
 *   the removed lines in the ORIGINAL snippet (1-based). Each call warns again: call it where
 *   the props are read (props.js), never on an edit.
 *
 * HOW TO CHANGE IT
 *   A new kind: an entry in MAGIC_COMMENTS — and the same in shared/wiring/index.cjs, its colours in
 *   shared/css/_code-blocks.scss, and its decoration class in the editor (decorations.js). A comment
 *   syntax: COMMENT_SYNTAXES (regular-expression source, copied from Docusaurus). Which language
 *   uses which: SYNTAXES_BY_LANGUAGE (anything not listed gets POPULAR_SYNTAXES). The warning
 *   words: WORDS.
 */

import { languageInfo } from './languages.js';

/** One entry of MAGIC_COMMENTS, frozen: its kind, the class Docusaurus gives its lines, its comments. */
function magicComment(kind, className, line, start, end) {
	return Object.freeze({ kind, className, line, block: Object.freeze({ start, end }) });
}

/**
 * The magic comments, in shared/wiring/index.cjs's order (which is also the order of precedence:
 * a later kind wins a line marked twice).
 */
export const MAGIC_COMMENTS = Object.freeze([
	magicComment('highlight', 'theme-code-block-highlighted-line', 'highlight-next-line', 'highlight-start', 'highlight-end'),
	magicComment('error', 'code-block-error-line', 'highlight-error-next-line', 'highlight-error-start', 'highlight-error-end'),
	magicComment('success', 'code-block-success-line', 'highlight-success-next-line', 'highlight-success-start', 'highlight-success-end'),
	magicComment('warning', 'code-block-warning-line', 'highlight-warning-next-line', 'highlight-warning-start', 'highlight-warning-end'),
	magicComment('remove', 'code-block-removed-line', 'highlight-remove-next-line', 'highlight-remove-start', 'highlight-remove-end'),
	magicComment('add', 'code-block-added-line', 'highlight-add-next-line', 'highlight-add-start', 'highlight-add-end'),
]);

/** Every kind of marked line, weakest first: ['highlight', 'error', 'success', 'warning', 'remove', 'add']. */
export const LINE_KINDS = Object.freeze(MAGIC_COMMENTS.map((comment) => comment.kind));

/**
 * The comment syntaxes, as regular-expression source for the text before and after the
 * directive (copied from Docusaurus's commentPatterns).
 */
const COMMENT_SYNTAXES = Object.freeze({
	js: { start: '\\/\\/', end: '' },
	jsBlock: { start: '\\/\\*', end: '\\*\\/' },
	jsx: { start: '\\{\\s*\\/\\*', end: '\\*\\/\\s*\\}' },
	bash: { start: '#', end: '' },
	html: { start: '<!--', end: '-->' },
	lua: { start: '--', end: '' },
	wasm: { start: '\\;\\;', end: '' },
	tex: { start: '%', end: '' },
	vb: { start: "['‘’]", end: '' },
	vbnet: { start: "(?:_\\s*)?['‘’]", end: '' },
	rem: { start: '[Rr][Ee][Mm]\\b', end: '' },
	f90: { start: '!', end: '' },
	ml: { start: '\\(\\*', end: '\\*\\)' },
	cobol: { start: '\\*>', end: '' },
});

/** The syntaxes a language not listed in SYNTAXES_BY_LANGUAGE accepts (Docusaurus's default). */
const POPULAR_SYNTAXES = Object.freeze(['js', 'jsBlock', 'jsx', 'bash', 'html']);

/** Which syntaxes each language accepts: Docusaurus's table (its Prism names), plus Piston's python2 and sqlite3. */
const SYNTAXES_BY_LANGUAGE = Object.freeze({
	js: ['js', 'jsBlock'],
	javascript: ['js', 'jsBlock'],
	ts: ['js', 'jsBlock'],
	typescript: ['js', 'jsBlock'],
	jsx: ['js', 'jsBlock', 'jsx'],
	tsx: ['js', 'jsBlock', 'jsx'],
	html: ['js', 'jsBlock', 'html'],
	python: ['bash'],
	py: ['bash'],
	python2: ['bash'],
	bash: ['bash'],
	markdown: ['html', 'jsx', 'bash'],
	md: ['html', 'jsx', 'bash'],
	tex: ['tex'],
	latex: ['tex'],
	matlab: ['tex'],
	lua: ['lua'],
	haskell: ['lua'],
	sql: ['lua', 'jsBlock'],
	sqlite3: ['lua', 'jsBlock'],
	wasm: ['wasm'],
	vb: ['vb', 'rem'],
	vba: ['vb', 'rem'],
	'visual-basic': ['vb', 'rem'],
	vbnet: ['vbnet', 'rem'],
	batch: ['rem'],
	basic: ['rem', 'f90'],
	fsharp: ['js', 'ml'],
	ocaml: ['ml'],
	sml: ['ml'],
	fortran: ['f90'],
	cobol: ['cobol'],
});

/** The prefix of every warning, so the console says where it comes from. */
const WARNING_PREFIX = 'CodeEditor magic comments:';

/** The warnings (each follows "line N (`the comment`)"). */
const WORDS = Object.freeze({
	strayEnd: (start) => `has no open \`${start}\` before it, so it marks nothing.`,
	emptyBlock: 'ends a block with no lines in it, so it marks nothing.',
	alreadyOpen: (line) => `was ignored: the block opened on line ${line} is still open (blocks of one kind do not nest).`,
	neverEnded: (end) => `is never ended by \`${end}\`, so it marks nothing.`,
	nothingAfter: 'has no line after it to mark.',
});

/** The line break that ends a line ("\n"; a "\r" before it belongs to the same line ending). */
const LINE_BREAK = '\n';

/**
 * What the code is split on: a line ending, "\n" or "\r\n" (as Docusaurus splits). The capture
 * keeps each ending in split()'s result, so it can be put back exactly.
 */
const LINE_ENDING_SPLIT = /(\r?\n)/;

/** Every directive's text -> { comment (its MAGIC_COMMENTS entry), kind, role: 'line' | 'start' | 'end' }. */
const DIRECTIVES = Object.freeze(Object.fromEntries(MAGIC_COMMENTS.flatMap((comment) => [
	[comment.line, { comment, kind: comment.kind, role: 'line' }],
	[comment.block.start, { comment, kind: comment.kind, role: 'start' }],
	[comment.block.end, { comment, kind: comment.kind, role: 'end' }],
])));

/** `text` with every character a regular expression treats specially escaped. */
function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The syntaxes `language` accepts: by its own name first (Docusaurus's names), then by its canonical name. */
function syntaxesFor(language) {
	const name = String(language ?? '').trim().toLowerCase();
	if (Object.hasOwn(SYNTAXES_BY_LANGUAGE, name)) return SYNTAXES_BY_LANGUAGE[name];
	const id = languageInfo(name).id;
	if (Object.hasOwn(SYNTAXES_BY_LANGUAGE, id)) return SYNTAXES_BY_LANGUAGE[id];
	return POPULAR_SYNTAXES;
}

/**
 * The pattern of a magic comment line in these syntaxes: the whole line is one comment holding
 * one directive (one capture group per syntax; the matching group holds the directive).
 */
function directivePattern(syntaxNames) {
	const directives = Object.keys(DIRECTIVES).map(escapeRegExp).join('|');
	const alternatives = syntaxNames.map((name) => {
		const { start, end } = COMMENT_SYNTAXES[name];
		return `(?:${start}\\s*(${directives})\\s*${end})`;
	});
	return new RegExp(`^\\s*(?:${alternatives.join('|')})\\s*$`);
}

/** The directive on `line`, or null when the line is not a magic comment. */
function directiveOf(line, pattern) {
	const match = pattern.exec(line);
	if (!match) return null;
	const text = match.slice(1).find((group) => group !== undefined);
	return { text, ...DIRECTIVES[text] };
}

/**
 * The lines of `text`, each with the line ending that follows it: [{ text, ending }] ('' for the
 * last line). 'a\r\nb\n' -> [{ text: 'a', ending: '\r\n' }, { text: 'b', ending: '\n' },
 * { text: '', ending: '' }].
 */
function splitLines(text) {
	const parts = text.split(LINE_ENDING_SPLIT);
	const lines = [];
	for (let index = 0; index < parts.length; index += 2) {
		lines.push({ text: parts[index], ending: parts[index + 1] ?? '' });
	}
	return lines;
}

/**
 * The kept lines as one string: each followed by its own line ending, but the last one by none.
 * (When the snippet's last line was a magic comment, the line before it ends the code, without
 * the ending that led to the removed line: 'a\r\n# highlight-end' -> 'a', never 'a\r'.)
 */
function joinLines(kept) {
	let code = '';
	kept.forEach((line, index) => {
		const isLast = index === kept.length - 1;
		code += isLast ? line.text : line.text + line.ending;
	});
	return code;
}

/** A fresh reading state (see stripMagicComments). */
function newState() {
	return {
		kept: [], // the lines the reader sees, so far ({ text, ending })
		removedLines: [], // the removed lines' numbers in the snippet (1-based)
		marks: [], // { kind, line } from the blocks
		nextLineMarks: [], // { kind, line, source } from the one-line comments (their line is checked at the end)
		open: {}, // kind -> { firstLine, source } of its block while it is open
	};
}

/** One warning about the magic comment `source` ({ line, comment }). */
function warnAbout(warn, source, ending) {
	warn(`${WARNING_PREFIX} line ${source.line} (\`${source.comment}\`) ${ending}`);
}

/** A `…-next-line`: the next line the reader sees (it may not exist; checked at the end). */
function readNextLine(state, directive, source) {
	state.nextLineMarks.push({ kind: directive.kind, line: state.kept.length + 1, source });
}

/** A `…-start`: the block's first line is the next line the reader sees. */
function readStart(state, directive, source, warn) {
	const open = state.open[directive.kind];
	if (open) {
		warnAbout(warn, source, WORDS.alreadyOpen(open.source.line));
		return;
	}
	state.open[directive.kind] = { firstLine: state.kept.length + 1, source };
}

/** A `…-end`: marks the lines since the block's start (the lines kept so far after it). */
function readEnd(state, directive, source, warn) {
	const open = state.open[directive.kind];
	if (!open) {
		warnAbout(warn, source, WORDS.strayEnd(directive.comment.block.start));
		return;
	}
	delete state.open[directive.kind];
	const lastLine = state.kept.length;
	if (open.firstLine > lastLine) {
		warnAbout(warn, source, WORDS.emptyBlock);
		return;
	}
	for (let line = open.firstLine; line <= lastLine; line += 1) state.marks.push({ kind: directive.kind, line });
}

/** One line of the snippet ({ text, ending }; `index`: 0-based in the snippet): kept, or read as a magic comment and removed. */
function readLine(state, line, index, pattern, warn) {
	const directive = directiveOf(line.text, pattern);
	if (directive === null) {
		state.kept.push(line);
		return;
	}
	const source = { line: index + 1, comment: line.text.trim() };
	state.removedLines.push(index + 1);
	if (directive.role === 'line') readNextLine(state, directive, source);
	else if (directive.role === 'start') readStart(state, directive, source, warn);
	else readEnd(state, directive, source, warn);
}

/** Warnings for the blocks still open at the end, and for `…-next-line`s with no line after them. */
function warnAtTheEnd(state, lastLine, warn) {
	for (const comment of MAGIC_COMMENTS) {
		const open = state.open[comment.kind];
		if (open) warnAbout(warn, open.source, WORDS.neverEnded(comment.block.end));
	}
	for (const mark of state.nextLineMarks) {
		if (mark.line > lastLine) warnAbout(warn, mark.source, WORDS.nothingAfter);
	}
}

/**
 * The last line a magic comment can mark: the last line the reader sees, or the one before it
 * when the snippet ends with a newline (the empty "line" after it is not a line of the code,
 * as Docusaurus counts).
 */
function lastMarkableLine(kept, endsWithNewline) {
	return endsWithNewline ? kept.length - 1 : kept.length;
}

/** { [line]: kind } from the marks (up to `lastLine`); a line marked twice takes the later kind of LINE_KINDS. */
function kindsByLine(marks, lastLine) {
	const lineKinds = {};
	for (const { kind, line } of marks) {
		if (line > lastLine) continue;
		const current = lineKinds[line];
		if (current === undefined || LINE_KINDS.indexOf(kind) > LINE_KINDS.indexOf(current)) lineKinds[line] = kind;
	}
	return lineKinds;
}

/** console.warn, looked up when called (so a test may replace console.warn). */
function consoleWarn(message) {
	console.warn(message);
}

/**
 * `code` without its magic comments, and the lines they mark (the rules and the result are in
 * this file's header). `language`: any name languages.js knows, or a Prism name ('tsx').
 * Option: `warn` (called once per odd comment; default console.warn).
 */
export function stripMagicComments(code, language, { warn = consoleWarn } = {}) {
	const text = typeof code === 'string' ? code : String(code ?? '');
	const pattern = directivePattern(syntaxesFor(language));
	const state = newState();
	splitLines(text).forEach((line, index) => readLine(state, line, index, pattern, warn));
	if (state.removedLines.length === 0) return { code: text, lineKinds: {}, removedLines: [] };
	const lastLine = lastMarkableLine(state.kept, text.endsWith(LINE_BREAK));
	warnAtTheEnd(state, lastLine, warn);
	const marks = state.marks.concat(state.nextLineMarks);
	return {
		code: joinLines(state.kept),
		lineKinds: kindsByLine(marks, lastLine),
		removedLines: state.removedLines,
	};
}
