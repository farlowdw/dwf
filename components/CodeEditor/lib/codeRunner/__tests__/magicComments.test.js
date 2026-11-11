/**
 * magicComments.test.js — the site's magic comments in an editor's snippet (../magicComments.js):
 * a snippet without them comes back as the very same string (the site's own snippets included);
 * every kind, as one line and as a block; each language's comment syntax, as Docusaurus maps
 * them; the lines marked (stacked comments, overlapping blocks, which kind wins a line); every
 * other byte kept (CRLF and mixed line endings too); the odd cases that warn; MAGIC_COMMENTS
 * (against shared/wiring: shared/__tests__/codeEditorTokens.test.mjs; against a site's config
 * and stylesheet: that site's own wiring test); and the installed
 * Docusaurus 3 (theme-common > codeBlockUtils.js): every language's comment syntaxes and its
 * marking rules still those magicComments.js copies. If those two fail after a Docusaurus
 * upgrade, read the new codeBlockUtils.js and bring magicComments.js in line; they skip once
 * the file is gone (Docusaurus v4). Run with `npm run test:shared`.
 * To change it: a new kind is a row in MAGIC_COMMENTS with a test here; after a Docusaurus upgrade,
 * bring magicComments.js in line, not this test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINE_KINDS, MAGIC_COMMENTS, stripMagicComments } from '../magicComments.js';
import { resolvePackage } from '../../../__tests__/paths.js';

/** The editor's copies of the site's snippets (a site guide's, which that site's wiring test keeps equal to the live files, and a made-up stand-in for a blog post's), and the language of each file extension. */
const SNIPPETS = fileURLToPath(new URL('../../../__tests__/fixtures/snippets/', import.meta.url));
const LANGUAGE_OF_EXTENSION = { '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.c': 'c', '.cpp': 'c++', '.go': 'go', '.sh': 'bash' };

/** stripMagicComments with its warnings collected: [result, warnings]. */
function stripped(code, language) {
	const warnings = [];
	const result = stripMagicComments(code, language, { warn: (message) => warnings.push(message) });
	return [result, warnings];
}

/** The result, asserting there was no warning. */
function quietly(code, language) {
	const [result, warnings] = stripped(code, language);
	assert.deepEqual(warnings, [], `no warning for ${JSON.stringify(code)}`);
	return result;
}

/** Lines joined into a snippet. */
const lines = (...items) => items.join('\n');

test('a snippet without magic comments comes back as the very same string', () => {
	const snippets = [
		['print("hi")\n', 'python'],
		['', 'python'],
		['\n\n', 'javascript'],
		['x = 1  # highlight-next-line\n', 'python'],
		['# highlight-next-line is a comment about highlighting\n', 'python'],
		['# Highlight-Next-Line\n', 'python'],
		['# highlight-foo\n', 'python'],
		['// highlight-next-line\n', 'python'],
		['# highlight-next-line\n', 'javascript'],
		['a\r\nb\r\n\tc\n', 'go'],
	];
	for (const [code, language] of snippets) {
		const result = quietly(code, language);
		assert.equal(result.code, code, JSON.stringify(code));
		assert.deepEqual(result.lineKinds, {});
		assert.deepEqual(result.removedLines, []);
	}
});

test("the site's own snippets come back unchanged (the ones without magic comments)", () => {
	let checked = 0;
	for (const name of fs.readdirSync(SNIPPETS)) {
		const language = LANGUAGE_OF_EXTENSION[path.extname(name)];
		if (!language) continue;
		const code = fs.readFileSync(path.join(SNIPPETS, name), 'utf8');
		if (code.includes('highlight-')) continue;
		const result = quietly(code, language);
		assert.equal(result.code, code, name);
		assert.deepEqual(result.lineKinds, {}, name);
		checked += 1;
	}
	assert.ok(checked >= 7, `the guide's snippets and the blog's were checked (${checked})`);
});

test("the guide's squares.py with magic comments added: the reader sees the file as it is, with the lines marked", () => {
	const original = fs.readFileSync(path.join(SNIPPETS, 'squares.py'), 'utf8');
	const fileLines = original.split('\n');
	const marked = [
		...fileLines.slice(0, 3),
		'    # highlight-start',
		...fileLines.slice(3, 5),
		'    # highlight-end',
		...fileLines.slice(5, 10),
		'# highlight-success-next-line',
		...fileLines.slice(10),
	].join('\n');
	const result = quietly(marked, 'python');
	assert.equal(result.code, original);
	assert.deepEqual(result.lineKinds, { 4: 'highlight', 5: 'highlight', 11: 'success' });
	assert.deepEqual(result.removedLines, [4, 7, 13]);
});

test('python: `# highlight-next-line` marks the next line and is removed', () => {
	const result = quietly(lines('a = 1', '# highlight-next-line', 'b = 2', 'c = 3'), 'python');
	assert.deepEqual(result, { code: lines('a = 1', 'b = 2', 'c = 3'), lineKinds: { 2: 'highlight' }, removedLines: [2] });
});

test('a block marks every line between its start and its end', () => {
	const code = lines('def f(x):', '    # highlight-start', '    y = x * 2', '    return y', '    # highlight-end', 'f(1)');
	assert.deepEqual(quietly(code, 'python'), {
		code: lines('def f(x):', '    y = x * 2', '    return y', 'f(1)'),
		lineKinds: { 2: 'highlight', 3: 'highlight' },
		removedLines: [2, 5],
	});
});

test('every kind, as one line and as a block', () => {
	for (const { kind, line, block } of MAGIC_COMMENTS) {
		assert.deepEqual(quietly(lines('a', `# ${line}`, 'b'), 'python').lineKinds, { 2: kind }, line);
		assert.deepEqual(quietly(lines(`# ${block.start}`, 'a', 'b', `# ${block.end}`, 'c'), 'python').lineKinds, { 1: kind, 2: kind }, block.start);
	}
});

test('the kinds, in order of precedence', () => {
	assert.deepEqual(LINE_KINDS, ['highlight', 'error', 'success', 'warning', 'remove', 'add']);
});

test('javascript and typescript: // and the slash-star block comment, not #', () => {
	for (const language of ['javascript', 'typescript', 'js', 'ts', 'node']) {
		const code = lines('// highlight-next-line', 'a();', '/* highlight-error-next-line */', 'b();', '# highlight-next-line', 'c();');
		const result = quietly(code, language);
		assert.equal(result.code, lines('a();', 'b();', '# highlight-next-line', 'c();'), language);
		assert.deepEqual(result.lineKinds, { 1: 'highlight', 2: 'error' }, language);
	}
});

test('python and bash: # only', () => {
	for (const language of ['python', 'py', 'python2', 'bash', 'sh', 'shell']) {
		const code = lines('# highlight-next-line', 'a', '// highlight-next-line', 'b', '/* highlight-next-line */', 'c');
		const result = quietly(code, language);
		assert.equal(result.code, lines('a', '// highlight-next-line', 'b', '/* highlight-next-line */', 'c'), language);
		assert.deepEqual(result.lineKinds, { 1: 'highlight' }, language);
	}
});

test("c, c++, go and other languages: every popular syntax (Docusaurus's default)", () => {
	const code = lines(
		'// highlight-next-line', 'a',
		'/* highlight-error-next-line */', 'b',
		'{/* highlight-success-next-line */}', 'c',
		'# highlight-warning-next-line', 'd',
		'<!-- highlight-add-next-line -->', 'e',
	);
	for (const language of ['c', 'c++', 'cpp', 'go', 'golang', 'java', 'rust', 'zig', 'some-new-language', '', undefined]) {
		const result = quietly(code, language);
		assert.equal(result.code, lines('a', 'b', 'c', 'd', 'e'), String(language));
		assert.deepEqual(result.lineKinds, { 1: 'highlight', 2: 'error', 3: 'success', 4: 'warning', 5: 'add' }, String(language));
	}
});

test("Docusaurus's other syntaxes: lua and haskell (--), sql (-- and the block comment), ocaml", () => {
	assert.deepEqual(quietly(lines('-- highlight-next-line', 'x'), 'lua').lineKinds, { 1: 'highlight' });
	assert.deepEqual(quietly(lines('-- highlight-next-line', 'x'), 'haskell').lineKinds, { 1: 'highlight' });
	assert.equal(quietly(lines('// highlight-next-line', 'x'), 'lua').code, lines('// highlight-next-line', 'x'), 'not // in lua');
	assert.deepEqual(quietly(lines('-- highlight-next-line', 'x', '/* highlight-next-line */', 'y'), 'sql').lineKinds, { 1: 'highlight', 2: 'highlight' });
	assert.deepEqual(quietly(lines('/* highlight-next-line */', 'x'), 'sqlite3').lineKinds, { 1: 'highlight' });
	assert.deepEqual(quietly(lines('(* highlight-next-line *)', 'x'), 'ocaml').lineKinds, { 1: 'highlight' });
});

test('spaces and tabs around a magic comment are fine; anything else on the line is not', () => {
	const code = lines('\t  #   highlight-next-line   ', 'a', '#highlight-next-line', 'b', 'c  # highlight-next-line', 'd');
	const result = quietly(code, 'python');
	assert.equal(result.code, lines('a', 'b', 'c  # highlight-next-line', 'd'));
	assert.deepEqual(result.lineKinds, { 1: 'highlight', 2: 'highlight' });
});

test('stacked one-line comments all mark the next code line; the later kind wins', () => {
	const result = quietly(lines('# highlight-add-next-line', '# highlight-error-next-line', 'x', 'y'), 'python');
	assert.equal(result.code, lines('x', 'y'));
	assert.deepEqual(result.lineKinds, { 1: 'add' }, 'add is later than error');
	assert.deepEqual(result.removedLines, [1, 2]);
});

test('blocks of different kinds overlap and nest; a line in two takes the later kind', () => {
	const code = lines(
		'# highlight-start', 'a',
		'# highlight-warning-start', 'b',
		'# highlight-end', 'c',
		'# highlight-warning-end', 'd',
	);
	const result = quietly(code, 'python');
	assert.equal(result.code, lines('a', 'b', 'c', 'd'));
	assert.deepEqual(result.lineKinds, { 1: 'highlight', 2: 'warning', 3: 'warning' });
	assert.deepEqual(result.removedLines, [1, 3, 5, 7]);
});

test('a one-line comment inside a block', () => {
	const code = lines('# highlight-start', 'a', '# highlight-error-next-line', 'b', 'c', '# highlight-end', 'd');
	const result = quietly(code, 'python');
	assert.equal(result.code, lines('a', 'b', 'c', 'd'));
	assert.deepEqual(result.lineKinds, { 1: 'highlight', 2: 'error', 3: 'highlight' });
});

test('a one-line comment right before a block marks its first line', () => {
	const result = quietly(lines('# highlight-error-next-line', '# highlight-start', 'a', '# highlight-end', 'b'), 'python');
	assert.deepEqual(result.lineKinds, { 1: 'error' });
});

test('a block may hold blank lines, and a one-line comment may mark a blank line', () => {
	assert.deepEqual(quietly(lines('# highlight-start', 'a', '', 'b', '# highlight-end'), 'python').lineKinds, { 1: 'highlight', 2: 'highlight', 3: 'highlight' });
	assert.deepEqual(quietly(lines('# highlight-next-line', '', 'a'), 'python').lineKinds, { 1: 'highlight' });
});

test('every other byte is kept: CRLF line endings, tabs, a final newline', () => {
	const result = quietly('a\r\n# highlight-next-line\r\n\tb\r\n', 'python');
	assert.deepEqual(result, { code: 'a\r\n\tb\r\n', lineKinds: { 2: 'highlight' }, removedLines: [2] });
	assert.equal(quietly('x\n# highlight-start\ny\n# highlight-end\n', 'python').code, 'x\ny\n', 'the final newline stays');
	assert.equal(quietly('x\n# highlight-start\ny\n# highlight-end', 'python').code, 'x\ny', 'and no newline is added');
});

test('CRLF: a magic comment on the last line, with no final newline, leaves no stray "\\r"', () => {
	assert.equal(quietly('a\r\n# highlight-start\r\nb\r\n# highlight-end', 'python').code, 'a\r\nb');
	assert.equal(quietly('a\r\nb\r\n// highlight-remove-start\r\nc\r\n// highlight-remove-end', 'c').code, 'a\r\nb\r\nc');
	const [result] = stripped('x\r\n# highlight-next-line', 'python');
	assert.equal(result.code, 'x');
});

test('mixed line endings: each kept line keeps its own ending', () => {
	const result = quietly('a\n# highlight-next-line\r\nb\r\nc\n', 'python');
	assert.deepEqual(result, { code: 'a\nb\r\nc\n', lineKinds: { 2: 'highlight' }, removedLines: [2] });
	assert.equal(quietly('a\r\n# highlight-next-line\nb', 'python').code, 'a\r\nb');
});

test('a block ending on the last line, before the final newline', () => {
	const result = quietly('a\n# highlight-start\nb\nc\n# highlight-end\n', 'python');
	assert.deepEqual(result, { code: 'a\nb\nc\n', lineKinds: { 2: 'highlight', 3: 'highlight' }, removedLines: [2, 5] });
});

test('a one-line comment with no line after it marks nothing, with a warning', () => {
	for (const code of ['a\n# highlight-next-line', 'a\n# highlight-next-line\n']) {
		const [result, warnings] = stripped(code, 'python');
		assert.equal(result.code, code.endsWith('\n') ? 'a\n' : 'a');
		assert.deepEqual(result.lineKinds, {}, JSON.stringify(code));
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /^CodeEditor magic comments: line 2 \(`# highlight-next-line`\) has no line after it to mark\.$/);
	}
});

test('an end with no open start marks nothing, with a warning (Docusaurus would mark from line 1)', () => {
	const [result, warnings] = stripped(lines('a', 'b', '# highlight-end', 'c'), 'python');
	assert.deepEqual(result, { code: lines('a', 'b', 'c'), lineKinds: {}, removedLines: [3] });
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /line 3 \(`# highlight-end`\) has no open `highlight-start` before it/);
});

test('an empty block marks nothing, with a warning (Docusaurus would mark the lines around it)', () => {
	const [result, warnings] = stripped(lines('a', '# highlight-start', '# highlight-end', 'b'), 'python');
	assert.deepEqual(result, { code: lines('a', 'b'), lineKinds: {}, removedLines: [2, 3] });
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /line 3 .* ends a block with no lines in it/);
});

test('a second start of an open block is ignored, with a warning; the later end is then stray', () => {
	const code = lines('# highlight-start', 'a', '# highlight-start', 'b', '# highlight-end', 'c', '# highlight-end', 'd');
	const [result, warnings] = stripped(code, 'python');
	assert.equal(result.code, lines('a', 'b', 'c', 'd'));
	assert.deepEqual(result.lineKinds, { 1: 'highlight', 2: 'highlight' });
	assert.equal(warnings.length, 2);
	assert.match(warnings[0], /line 3 .* was ignored: the block opened on line 1 is still open/);
	assert.match(warnings[1], /line 7 .* has no open `highlight-start`/);
});

test('a start never ended marks nothing, with a warning', () => {
	const [result, warnings] = stripped(lines('a', '# highlight-error-start', 'b', 'c'), 'python');
	assert.deepEqual(result, { code: lines('a', 'b', 'c'), lineKinds: {}, removedLines: [2] });
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /line 2 \(`# highlight-error-start`\) is never ended by `highlight-error-end`/);
});

test('each kind keeps its own block: an end of one kind does not close another', () => {
	const [result, warnings] = stripped(lines('# highlight-start', 'a', '# highlight-error-end', 'b', '# highlight-end'), 'python');
	assert.deepEqual(result.lineKinds, { 1: 'highlight', 2: 'highlight' });
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /has no open `highlight-error-start`/);
});

test('code that is not a string', () => {
	assert.deepEqual(quietly(undefined, 'python'), { code: '', lineKinds: {}, removedLines: [] });
	assert.deepEqual(quietly(null, 'python'), { code: '', lineKinds: {}, removedLines: [] });
	assert.deepEqual(quietly(42, 'python'), { code: '42', lineKinds: {}, removedLines: [] });
});

test('warnings go to console.warn when no `warn` is given', (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	stripMagicComments(lines('a', '# highlight-end'), 'python');
	assert.equal(warn.mock.callCount(), 1);
	assert.match(warn.mock.calls[0].arguments[0], /^CodeEditor magic comments:/);
});

// MAGIC_COMMENTS equal to shared/wiring/index.cjs > MAGIC_COMMENTS: shared/__tests__/codeEditorTokens.test.mjs.
// Their order to shared/css/_code-blocks.scss's: a site's own wiring test
// (the folder's own tests read nothing of the site).

/** Where Docusaurus 3 keeps the logic this file copies (Docusaurus v4 drops it: the tests below then skip). */
const DOCUSAURUS_CODE_BLOCK_UTILS = path.join(resolvePackage('@docusaurus/theme-common'), 'lib/utils/codeBlockUtils.js');

/** One comment written in each of Docusaurus's comment syntaxes (its commentPatterns keys), around `directive`. */
const SYNTAX_SAMPLES = {
	js: (directive) => `// ${directive}`,
	jsBlock: (directive) => `/* ${directive} */`,
	jsx: (directive) => `{/* ${directive} */}`,
	bash: (directive) => `# ${directive}`,
	html: (directive) => `<!-- ${directive} -->`,
	lua: (directive) => `-- ${directive}`,
	wasm: (directive) => `;; ${directive}`,
	tex: (directive) => `% ${directive}`,
	vb: (directive) => `' ${directive}`,
	vbnet: (directive) => `_ ' ${directive}`,
	rem: (directive) => `REM ${directive}`,
	f90: (directive) => `! ${directive}`,
	ml: (directive) => `(* ${directive} *)`,
	cobol: (directive) => `*> ${directive}`,
};

/** Languages that take Docusaurus's default branch (all popular syntaxes) and that languages.js does not alias into its table. */
const DEFAULT_BRANCH_LANGUAGES = ['c', 'c++', 'go', 'java', 'rust', 'ruby'];

/** The installed Docusaurus file's text, or null when it is gone (Docusaurus v4). */
function docusaurusCodeBlockUtils() {
	if (!fs.existsSync(DOCUSAURUS_CODE_BLOCK_UTILS)) return null;
	const source = fs.readFileSync(DOCUSAURUS_CODE_BLOCK_UTILS, 'utf8');
	return source.includes('function parseCodeLinesFromContent') ? source : null;
}

/** A JavaScript string literal's text without its escapes ('\\/\\/' -> \/\/). */
function unescapeLiteral(text) {
	return text.replace(/\\(.)/g, '$1');
}

/** Docusaurus's commentPatterns: { name: { start, end } } (regular-expression source). */
function docusaurusCommentPatterns(source) {
	const entry = /(\w+): \{ start: (['"])((?:(?!\2)[^\\]|\\.)*)\2, end: (['"])((?:(?!\4)[^\\]|\\.)*)\4 \}/g;
	const patterns = {};
	for (const match of source.matchAll(entry)) patterns[match[1]] = { start: unescapeLiteral(match[3]), end: unescapeLiteral(match[5]) };
	return patterns;
}

/** Docusaurus's language switch: { language: [syntax names] } (the `default:` branch is left out). */
function docusaurusLanguageTable(source) {
	const found = /function getAllMagicCommentDirectiveStyles[\s\S]*?\n\}/.exec(source);
	assert.ok(found, `${DOCUSAURUS_CODE_BLOCK_UTILS} has no getAllMagicCommentDirectiveStyles any more: compare its language table with SYNTAXES_BY_LANGUAGE`);
	const body = found[0];
	const branch = /((?:\s*case '[^']+':(?:\s*\/\/[^\n]*)?)+)(?:\s*\/\/[^\n]*)*\s*return getCommentPattern\(\[([^\]]*)\]/g;
	const table = {};
	for (const [, cases, names] of body.matchAll(branch)) {
		const syntaxes = [...names.matchAll(/'([^']+)'/g)].map((match) => match[1]);
		for (const [, language] of cases.matchAll(/case '([^']+)':/g)) table[language] = syntaxes;
	}
	return table;
}

/** Does a line in Docusaurus's syntaxes `names` hold a magic comment? (Its own getCommentPattern, rebuilt.) */
function docusaurusRecognizes(line, names, patterns) {
	const directives = MAGIC_COMMENTS.flatMap((comment) => [comment.line, comment.block.start, comment.block.end]).join('|');
	const alternatives = names.map((name) => `(?:${patterns[name].start}\\s*(${directives})\\s*${patterns[name].end})`);
	return new RegExp(`^\\s*(?:${alternatives.join('|')})\\s*$`).test(line);
}

/** Does stripMagicComments read `line` as a magic comment in `language`? */
function weRecognize(line, language) {
	return quietly(lines(line, 'x'), language).removedLines.length === 1;
}

test("each language's comment syntaxes are Docusaurus's (its installed codeBlockUtils.js)", (t) => {
	const source = docusaurusCodeBlockUtils();
	if (source === null) return t.skip(`${DOCUSAURUS_CODE_BLOCK_UTILS} has no parseCodeLinesFromContent any more (Docusaurus v4?)`);
	const patterns = docusaurusCommentPatterns(source);
	assert.deepEqual(Object.keys(patterns).sort(), Object.keys(SYNTAX_SAMPLES).sort(), 'the same comment syntaxes (a new one needs a sample here and an entry in COMMENT_SYNTAXES)');
	const table = docusaurusLanguageTable(source);
	assert.ok(Object.keys(table).length >= 30, 'the language switch was read');
	const popular = ['js', 'jsBlock', 'jsx', 'bash', 'html'];
	const cases = [...Object.entries(table), ...DEFAULT_BRANCH_LANGUAGES.map((language) => [language, popular])];
	for (const [language, names] of cases) {
		for (const [syntax, sample] of Object.entries(SYNTAX_SAMPLES)) {
			const line = sample('highlight-next-line');
			assert.equal(weRecognize(line, language), docusaurusRecognizes(line, names, patterns), `${language}: ${syntax} (${line})`);
		}
	}
});

test("Docusaurus still marks lines the way this file copies (parseCodeLinesFromContent's three rules)", (t) => {
	const source = docusaurusCodeBlockUtils();
	if (source === null) return t.skip(`${DOCUSAURUS_CODE_BLOCK_UTILS} has no parseCodeLinesFromContent any more (Docusaurus v4?)`);
	// If one of these fails after an upgrade, read the new parseCodeLinesFromContent and compare it with readNextLine / readStart / readEnd.
	const rules = [
		[/\.range \+= `\$\{lineNumber\},`/, 'a -next-line marks the line that follows it'],
		[/\.start = lineNumber;/, 'a -start opens its block at the next line'],
		[/\.range \+= `\$\{blocks\[\w+\[\w+\]\]\.start\}-\$\{lineNumber - 1\},`/, 'an -end marks the block up to the line before it'],
		[/lines\.splice\(lineNumber, 1\)/, 'every magic comment line is removed'],
		[/code\.split\(\/\\r\?\\n\/\)/, 'lines are split on \\n and \\r\\n'],
	];
	for (const [rule, meaning] of rules) assert.ok(rule.test(source), `${DOCUSAURUS_CODE_BLOCK_UTILS} no longer says: ${meaning}`);
});

