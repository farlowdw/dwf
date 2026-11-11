/**
 * props.test.js — <CodeEditor>'s props as one settings object (../props.js): a blog post's
 * exact props (the one usage when the editor was rewritten), the defaults (a 50vh box, the original editor's size), height="fit" (the box follows
 * the code), one snippet per language, the version selectors, the old editorSettings /
 * outputSettings keys and which prop wins, the heights refused with a warning (the default
 * applies), snippets with Windows line endings, the Monaco options and the first box height (a
 * fold ending on the empty last line included); and the teaching layer's keys (2026-10-25: off
 * without their props, magic comments, `highlight` and `steps` on the opening language, `id`,
 * expectedOutput, per-language tests / solution, the exercise buttons, renderValidationDecorations,
 * the hints, the header's runtime slot, a fit editor's scrollbar options and the waiting
 * placeholder's text style).
 * Run with `npm run test:shared`.
 * To change it: a new prop of <CodeEditor> (../props.js) gets a test here, with its default and its
 * refusal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	DEFAULT_EDITOR_OPTIONS,
	FIT_SCROLLBAR_OPTIONS,
	PAGE_THEME_WARNING,
	PASSTHROUGH_EDITOR_PROPS,
	RUNTIME_SLOTS,
	VALIDATION_DECORATIONS,
	WAITING_FONT_CSS,
	buildMonacoOptions,
	exerciseButtonsFor,
	initialBoxStyle,
	initialContentHeight,
	languageOptions,
	normalizeEditorProps,
	normalizeHints,
	renderValidationDecorationsFor,
	runtimeSlotFor,
	solutionFor,
	testsFor,
	titleFor,
	waitingCodeStyle,
} from '../props.js';
import { DEFAULT_HEIGHT, DEFAULT_MAX_HEIGHT, MIN_HEIGHT_PX } from '../sizing.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A made-up stand-in for a blog post's snippet (fixtures/snippets), read the way raw-loader hands it to the page. */
const BLOG_SNIPPET = readFileSync(path.join(HERE, 'fixtures/snippets/tally-votes.py'), 'utf8');

/** The blog post's props, exactly: <CodeEditor initialCode={snippet1} editorSettings={{ height: '50vh' }} foldedRegions={[[1,6]]} /> */
const BLOG_PROPS = Object.freeze({
	initialCode: BLOG_SNIPPET,
	editorSettings: { height: '50vh' },
	foldedRegions: [[1, 6]],
});

/** Monaco's line height with the default options (14 px × 1.5) and its top + bottom padding. */
const LINE_PX = 21;
const PADDING_PX = 16;

/** Run `read` with console.warn collected: [its result, the warnings]. */
function withWarnings(read) {
	const original = console.warn;
	const warnings = [];
	console.warn = (message) => warnings.push(String(message));
	try {
		return [read(), warnings];
	} finally {
		console.warn = original;
	}
}

test('the blog post: one Python snippet, a fixed 50vh box, lines 2-6 folded', () => {
	const settings = normalizeEditorProps(BLOG_PROPS);
	assert.deepEqual(settings.snippets, { languages: ['python'], code: { python: BLOG_SNIPPET }, initialLanguage: 'python' });
	assert.equal(settings.language, 'python');
	assert.equal(settings.versionSelector, undefined, 'no version: the newest installed Python runs');
	assert.deepEqual(settings.versionSelectors, {});
	assert.deepEqual(settings.foldedRegions, { python: [[1, 6]] });
	assert.equal(settings.height, '50vh');
	assert.equal(settings.fit, false);
	assert.equal(settings.maxHeight, DEFAULT_MAX_HEIGHT);
	assert.equal(settings.stdin, '');
	assert.equal(settings.showStdin, false);
	assert.deepEqual(settings.args, []);
	assert.deepEqual(settings.limits, {});
	assert.equal(settings.readOnly, false);
	assert.equal(settings.title, null);
	assert.deepEqual(settings.editorOptions, {});
	assert.deepEqual(settings.editorProps, {}, 'height is not handed to <Editor> twice');
	assert.equal(titleFor(settings, 'python'), 'main.py');
	assert.deepEqual(initialBoxStyle(settings, 'python'), { height: '50vh' });
});

test('the blog snippet without a height: the default 50vh box, the same as the post asks for', () => {
	const settings = normalizeEditorProps({ initialCode: BLOG_SNIPPET, foldedRegions: [[1, 6]] });
	assert.equal(settings.height, DEFAULT_HEIGHT);
	assert.equal(DEFAULT_HEIGHT, '50vh');
	assert.equal(settings.fit, false);
	assert.deepEqual(initialBoxStyle(settings, 'python'), { height: '50vh' });
	assert.deepEqual(initialBoxStyle(settings, 'python'), initialBoxStyle(normalizeEditorProps(BLOG_PROPS), 'python'));
});

test('height="fit": the blog snippet\'s box fits its 21 visible lines, between the minimum and maxHeight', () => {
	const settings = normalizeEditorProps({ initialCode: BLOG_SNIPPET, foldedRegions: [[1, 6]], height: 'fit' });
	assert.equal(settings.fit, true);
	assert.equal(settings.height, null, 'no fixed height in fit mode');
	assert.equal(settings.maxHeight, DEFAULT_MAX_HEIGHT);
	const lines = BLOG_SNIPPET.split('\n').length;
	assert.equal(lines, 26, 'the snippet this test was written against');
	assert.equal(initialContentHeight(settings, 'python'), (lines - 5) * LINE_PX + PADDING_PX);
	assert.deepEqual(initialBoxStyle(settings, 'python'), {
		height: `${(lines - 5) * LINE_PX + PADDING_PX}px`,
		minHeight: `${MIN_HEIGHT_PX}px`,
		maxHeight: DEFAULT_MAX_HEIGHT,
	});
});

test('height="fit": any case and spaces, the old editorSettings.height too, and maxHeight is its ceiling', () => {
	const shouted = normalizeEditorProps({ initialCode: 'a\nb', height: ' FIT ' });
	assert.equal(shouted.fit, true);
	assert.equal(shouted.height, null);
	const legacy = normalizeEditorProps({ initialCode: 'a\nb', editorSettings: { height: 'fit' } });
	assert.equal(legacy.fit, true);
	assert.deepEqual(legacy.editorProps, {}, 'height is never handed to <Editor>');
	const overridden = normalizeEditorProps({ initialCode: 'a\nb', height: 'fit', editorSettings: { height: '50vh' } });
	assert.equal(overridden.fit, true, 'the height prop beats editorSettings.height');
	const fixedOverLegacyFit = normalizeEditorProps({ initialCode: 'a\nb', height: '20rem', editorSettings: { height: 'fit' } });
	assert.deepEqual([fixedOverLegacyFit.height, fixedOverLegacyFit.fit], ['20rem', false]);
	const capped = normalizeEditorProps({ initialCode: 'a\nb', height: 'fit', maxHeight: '30rem' });
	assert.deepEqual(initialBoxStyle(capped, 'python'), {
		height: `${2 * LINE_PX + PADDING_PX}px`,
		minHeight: `${MIN_HEIGHT_PX}px`,
		maxHeight: '30rem',
	});
});

test('no props at all: an empty Python editor in the default 50vh box', () => {
	const settings = normalizeEditorProps();
	assert.deepEqual(settings.snippets, { languages: ['python'], code: { python: '' }, initialLanguage: 'python' });
	assert.equal(settings.height, '50vh');
	assert.equal(settings.fit, false);
	assert.deepEqual(initialBoxStyle(settings, 'python'), { height: '50vh' });
	assert.equal(settings.maxHeight, '60vh');
	assert.deepEqual(settings.foldedRegions, { python: [] });
	assert.deepEqual(languageOptions(settings), [{ id: 'python', label: 'Python' }]);
	assert.equal(initialContentHeight(settings, 'python'), LINE_PX + PADDING_PX);
	assert.deepEqual(normalizeEditorProps(null), settings, 'null props read as none');
});

test('one snippet per language: the picker order, the opening language, aliases', () => {
	const settings = normalizeEditorProps({
		initialCode: { py: 'print(1)', javascript: 'console.log(1)', cpp: 'int main() {}' },
		language: 'JS',
	});
	assert.deepEqual(settings.snippets.languages, ['python', 'javascript', 'c++']);
	assert.equal(settings.language, 'javascript');
	assert.deepEqual(languageOptions(settings), [
		{ id: 'python', label: 'Python' },
		{ id: 'javascript', label: 'JavaScript' },
		{ id: 'c++', label: 'C++' },
	]);
	assert.equal(titleFor(settings, 'c++'), 'main.cpp');
	assert.equal(normalizeEditorProps({ initialCode: { ruby: 'p 1', go: '' } }).language, 'ruby', 'no language prop: the first key');
	assert.equal(normalizeEditorProps({ initialCode: 'x = 1', language: 'rust' }).language, 'rust', 'a string snippet in the named language');
});

test('version: a string applies to the opening language, an object names each language', () => {
	const single = normalizeEditorProps({ initialCode: 'print(1)', version: '3.10' });
	assert.equal(single.versionSelector, '3.10');
	assert.deepEqual(single.versionSelectors, { python: '3.10' });

	const several = normalizeEditorProps({
		initialCode: { python: '', javascript: '' },
		version: { py: '3.x', node: '18', ruby: '3', javascript: '20' },
	});
	assert.deepEqual(several.versionSelectors, { python: '3.x', javascript: '18' }, 'aliases count; the first key wins; languages without a snippet are ignored');
	assert.equal(several.versionSelector, '3.x');

	const stringOnMany = normalizeEditorProps({ initialCode: { python: '', javascript: '' }, language: 'javascript', version: '20' });
	assert.deepEqual(stringOnMany.versionSelectors, { javascript: '20' });

	assert.deepEqual(normalizeEditorProps({ version: '  ' }).versionSelectors, {}, 'a blank version is no version');
	assert.deepEqual(normalizeEditorProps({ version: 3 }).versionSelectors, { python: '3' }, 'a number is read as text');
});

test('the old outputSettings still work (snake_case limits, language, version, stdin, args)', () => {
	const settings = normalizeEditorProps({
		initialCode: 'console.log(1)',
		outputSettings: {
			language: 'javascript',
			version: '18.15.0',
			stdin: 'hello',
			args: [1, 'two'],
			run_timeout: 5000,
			compile_memory_limit: -1,
			editorRef: {},
			initial_code: 'ignored',
		},
	});
	assert.equal(settings.language, 'javascript');
	assert.equal(settings.versionSelector, '18.15.0');
	assert.equal(settings.stdin, 'hello');
	assert.equal(settings.showStdin, true, 'stdin given: the input field starts open');
	assert.deepEqual(settings.args, ['1', 'two']);
	assert.deepEqual(settings.limits, { runTimeout: 5000, compileMemoryLimit: -1 });
});

test('new props win over the old ones', () => {
	const settings = normalizeEditorProps({
		initialCode: 'x',
		language: 'ruby',
		version: '3.2',
		stdin: '',
		args: ['new'],
		limits: { runTimeout: 1000, compileTimeout: 'soon' },
		height: 300,
		editorOptions: { fontSize: 18 },
		readOnly: false,
		outputSettings: { language: 'python', version: '3.12', stdin: 'old', args: ['old'], run_timeout: 9000, compile_timeout: 9000 },
		editorSettings: { height: '50vh', options: { fontSize: 12, tabSize: 2, readOnly: true } },
	});
	assert.equal(settings.language, 'ruby');
	assert.equal(settings.versionSelector, '3.2');
	assert.equal(settings.stdin, '');
	assert.equal(settings.showStdin, false);
	assert.deepEqual(settings.args, ['new']);
	assert.deepEqual(settings.limits, { runTimeout: 1000, compileTimeout: 9000 }, 'a limit that is not a number does not override');
	assert.equal(settings.height, '300px');
	assert.deepEqual(settings.editorOptions, { fontSize: 18, tabSize: 2, readOnly: true });
	assert.equal(settings.readOnly, false, 'the readOnly prop beats editorOptions.readOnly');
});

test('the old editorSettings: height, options, language and value hints, and the keys still passed to <Editor>', () => {
	const onMount = () => {};
	const warnings = [];
	const originalWarn = console.warn;
	console.warn = (message) => warnings.push(message);
	let settings;
	try {
		settings = normalizeEditorProps({
			editorSettings: {
				height: '400',
				language: 'javascript',
				value: 'let a = 1;',
				options: { readOnly: true, wordWrap: 'on' },
				theme: 'hc-black',
				onMount,
				path: 'mine',
				loading: 'wait',
				line: 4,
			},
		});
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(settings.height, '400px', 'a plain number in a string is px');
	assert.equal(settings.language, 'javascript');
	assert.equal(settings.snippets.code.javascript, 'let a = 1;');
	assert.equal(settings.readOnly, true);
	assert.deepEqual(settings.editorOptions, { readOnly: true, wordWrap: 'on' });
	assert.deepEqual(settings.editorProps, { onMount }, "the theme is the reader's (Monaco has one per page): not handed to <Editor>");
	assert.deepEqual(warnings, [PAGE_THEME_WARNING], 'the page is told why its theme is ignored');
	for (const key of Object.keys(settings.editorProps)) assert.ok(PASSTHROUGH_EDITOR_PROPS.includes(key));
});

test("buildMonacoOptions never hands Monaco a theme (its updateOptions would set it for the whole page)", () => {
	assert.equal('theme' in buildMonacoOptions({ theme: 'vs-dark', wordWrap: 'on' }), false);
	assert.equal(buildMonacoOptions({ theme: 'vs-dark', wordWrap: 'on' }).wordWrap, 'on', 'the other options stay');
});

test('foldedRegions: one list for every language, or one per language (any name for it)', () => {
	const list = normalizeEditorProps({ initialCode: { python: '', javascript: '' }, foldedRegions: [[1, 3]] });
	assert.deepEqual(list.foldedRegions, { python: [[1, 3]], javascript: [[1, 3]] });

	const perLanguage = normalizeEditorProps({
		initialCode: { python: '', javascript: '' },
		foldedRegions: { py: [[2, 4]], JavaScript: [[1, 2]] },
	});
	assert.deepEqual(perLanguage.foldedRegions, { python: [[2, 4]], javascript: [[1, 2]] });
	assert.deepEqual(normalizeEditorProps({ foldedRegions: 'nonsense' }).foldedRegions, { python: [] });
});

test('heights, titles and stdin flags', () => {
	assert.equal(normalizeEditorProps({ height: '20rem' }).height, '20rem');
	assert.equal(normalizeEditorProps({ height: '20rem' }).fit, false);
	const [zero, zeroWarnings] = withWarnings(() => normalizeEditorProps({ height: 0 }));
	assert.deepEqual([zero.height, zero.fit], [DEFAULT_HEIGHT, false], 'zero is refused: the default height, not fit-the-content');
	assert.equal(zeroWarnings.length, 1, 'with a warning');
	assert.match(zeroWarnings[0], /the default height \(50vh\) applies\.$/);
	assert.equal(normalizeEditorProps({ maxHeight: 300 }).maxHeight, '300px');
	assert.equal(normalizeEditorProps({ title: '  two-sum.py ' }).title, 'two-sum.py');
	assert.equal(titleFor(normalizeEditorProps({ title: 'Solution' }), 'python'), 'Solution');
	assert.equal(normalizeEditorProps({ stdin: '5\n1 2 3', showStdin: false }).showStdin, false);
	assert.equal(normalizeEditorProps({ showStdin: true }).showStdin, true);
});

test("a percentage or 'auto' height is refused with a warning: the default 50vh box (and a refused maxHeight is the default)", () => {
	const [settings, warnings] = withWarnings(() => normalizeEditorProps({ initialCode: 'a', editorSettings: { height: '100%' }, maxHeight: '50%' }));
	assert.equal(settings.height, DEFAULT_HEIGHT, "the old @monaco-editor/react default '100%' collapsed the box");
	assert.equal(settings.fit, false);
	assert.equal(settings.maxHeight, DEFAULT_MAX_HEIGHT);
	assert.equal(warnings.length, 2);
	assert.match(warnings[0], /^CodeEditor height: '100%' was ignored .*; the default height \(50vh\) applies\.$/);
	assert.match(warnings[1], /^CodeEditor maxHeight: '50%' was ignored/);
	assert.deepEqual(initialBoxStyle(settings, 'python'), { height: '50vh' }, 'the fixed default, no min / max');
	const [auto, autoWarnings] = withWarnings(() => normalizeEditorProps({ height: 'auto' }));
	assert.deepEqual([auto.height, auto.fit], [DEFAULT_HEIGHT, false]);
	assert.match(autoWarnings[0], /a keyword is not a length/);
	const [fitContent, fitContentWarnings] = withWarnings(() => normalizeEditorProps({ height: 'fit-content' }));
	assert.deepEqual([fitContent.height, fitContent.fit], [DEFAULT_HEIGHT, false], "only the word 'fit' turns fitting on");
	assert.equal(fitContentWarnings.length, 1);
});

test('snippets with Windows or old Mac line endings read as \\n only (Monaco\'s text compares equal: no false "edited")', () => {
	assert.equal(normalizeEditorProps({ initialCode: 'a\r\nb\rc\n' }).snippets.code.python, 'a\nb\nc\n');
	assert.deepEqual(normalizeEditorProps({ initialCode: { python: 'x\r\ny', javascript: 'p\rq' } }).snippets.code, { python: 'x\ny', javascript: 'p\nq' });
	assert.equal(normalizeEditorProps({ editorSettings: { value: '1\r\n2' } }).snippets.code.python, '1\n2', 'the old editorSettings.value too');
});

test('a fold ending on the empty last line (a final newline): the estimate hides exactly what Monaco will', () => {
	const code = 'l1\nl2\nl3\nl4\n'; // five lines, the last one empty
	const clamped = initialContentHeight(normalizeEditorProps({ initialCode: code, foldedRegions: [[1, 5]] }), 'python');
	assert.equal(clamped, 2 * LINE_PX + PADDING_PX, '[1, 5] folds lines 2-4: lines 1 and 5 stay');
	const dropped = initialContentHeight(normalizeEditorProps({ initialCode: code, foldedRegions: [[4, 5]] }), 'python');
	assert.equal(dropped, 5 * LINE_PX + PADDING_PX, '[4, 5] folds nothing');
	const plain = initialContentHeight(normalizeEditorProps({ initialCode: 'l1\nl2\nl3\nl4', foldedRegions: [[1, 4]] }), 'python');
	assert.equal(plain, 1 * LINE_PX + PADDING_PX, 'without a final newline the last line can end a fold');
});

test('buildMonacoOptions: the site defaults, the page options over them, readOnly from the prop', () => {
	const options = buildMonacoOptions({ fontSize: 16, scrollbar: { vertical: 'hidden' }, readOnly: true }, { readOnly: false, ariaLabel: 'Code editor: main.py' });
	assert.equal(options.fontSize, 16);
	assert.deepEqual(options.scrollbar, { alwaysConsumeMouseWheel: false, vertical: 'hidden' }, 'nested options merge one level deep');
	assert.equal(options.readOnly, false);
	assert.equal(options.ariaLabel, 'Code editor: main.py');
	assert.equal(options.minimap.enabled, false);
	assert.equal(options.automaticLayout, true);
	assert.equal(options.scrollBeyondLastLine, false);
	assert.equal(options.showFoldingControls, 'always');
	assert.deepEqual(options.padding, { top: 8, bottom: 8 });
	assert.equal(options.tabSize, 4);
	assert.equal(options.fontFamily, undefined, 'no font stack unless the client passes the page\'s (editorFont.js)');

	options.minimap.enabled = true;
	assert.equal(DEFAULT_EDITOR_OPTIONS.minimap.enabled, false, 'the defaults are copied, never shared');
	assert.equal(buildMonacoOptions().readOnly, false);
});

test("buildMonacoOptions: the page's font stack when given; a page's editorOptions.fontFamily wins", () => {
	const stack = "'IBM Plex Mono', Menlo, Consolas, monospace";
	assert.equal(buildMonacoOptions({}, { fontFamily: stack }).fontFamily, stack);
	assert.equal(buildMonacoOptions({ fontFamily: 'Fira Code, monospace' }, { fontFamily: stack }).fontFamily, 'Fira Code, monospace');
	assert.equal(buildMonacoOptions({ fontFamily: 'Fira Code, monospace' }).fontFamily, 'Fira Code, monospace');
	assert.equal('fontFamily' in buildMonacoOptions({}, { fontFamily: '' }), false, 'an empty stack is no stack');
	assert.equal('fontFamily' in DEFAULT_EDITOR_OPTIONS, false, 'nothing hard-coded in the folder');
});

test('a bigger font in editorOptions changes the estimated height', () => {
	const settings = normalizeEditorProps({ initialCode: 'a\nb', editorOptions: { fontSize: 20 } });
	assert.equal(initialContentHeight(settings, 'python'), 2 * 30 + PADDING_PX);
});

// ---- the teaching layer (2026-10-25): every new key has a default that changes nothing ----

test('the teaching layer: without its props every new key is off, and the snippets are untouched', () => {
	const settings = normalizeEditorProps(BLOG_PROPS);
	assert.equal(settings.id, null);
	assert.deepEqual(settings.lineKinds, { python: {} });
	assert.deepEqual(settings.steps, []);
	assert.equal(settings.hideErrors, false);
	assert.equal(settings.expectedOutput, null);
	assert.equal(settings.tests, null);
	assert.equal(settings.solution, null);
	assert.deepEqual(settings.hints, []);
	assert.equal(settings.saveDraft, false);
	assert.equal(settings.loadWhenVisible, false);
	assert.equal(settings.snippets.code.python, BLOG_SNIPPET, 'no magic comments: the very same string');
	assert.deepEqual(exerciseButtonsFor(settings, 'python'), { hint: false, solution: false, check: false });
});

test('magic comments: removed from the code the reader sees (and runs), their lines marked per language', () => {
	const [settings, warnings] = withWarnings(() =>
		normalizeEditorProps({
			initialCode: { python: 'a = 1\n# highlight-error-next-line\nb = 2\nc = 3\n', javascript: 'let a = 1;\n// highlight-next-line\nlet b = 2;\n' },
			highlight: '1-2, x',
			steps: [{ lines: '3', note: 'c' }, { lines: 1, note: 'a' }],
		}),
	);
	assert.equal(settings.snippets.code.python, 'a = 1\nb = 2\nc = 3\n');
	assert.equal(settings.snippets.code.javascript, 'let a = 1;\nlet b = 2;\n');
	assert.deepEqual(settings.lineKinds.python, { 1: 'highlight', 2: 'error' }, 'the magic comment wins line 2');
	assert.deepEqual(settings.lineKinds.javascript, { 2: 'highlight' }, '`highlight` is the opening language\'s only; JavaScript keeps its own magic comment');
	assert.equal(settings.steps.length, 2, 'the steps are read against the opening language');
	assert.deepEqual(settings.steps[0].ranges, [[3, 3]]);
	assert.equal(warnings.filter((warning) => warning.includes("'x'")).length, 1, 'one warning for the bad part, once');
	assert.equal(initialContentHeight(settings, 'python'), 4 * LINE_PX + PADDING_PX, 'the placeholder measures the code without the comment line');
});

test('id: a word without spaces (a number reads as its digits); a refused one is null, with a warning', () => {
	assert.equal(normalizeEditorProps({ id: ' two-sum ' }).id, 'two-sum');
	assert.equal(normalizeEditorProps({ id: 2 }).id, '2');
	const [settings, warnings] = withWarnings(() => normalizeEditorProps({ id: 'two sum' }));
	assert.equal(settings.id, null);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /CodeEditor id:/);
});

test('hideErrors, saveDraft, loadWhenVisible: true only for true', () => {
	const on = normalizeEditorProps({ id: 'x', initialCode: 'x', hideErrors: true, saveDraft: true, loadWhenVisible: true });
	assert.deepEqual([on.hideErrors, on.saveDraft, on.loadWhenVisible], [true, true, true]);
	const loose = normalizeEditorProps({ initialCode: 'x', hideErrors: 'yes', saveDraft: 1, loadWhenVisible: {} });
	assert.deepEqual([loose.hideErrors, loose.saveDraft, loose.loadWhenVisible], [false, false, false]);
});

test('saveDraft without an id: one console warning (not read-only, no refused id); with an id or read-only, none', () => {
	const [settings, warnings] = withWarnings(() => normalizeEditorProps({ initialCode: 'x', saveDraft: true }));
	assert.equal(settings.saveDraft, true, 'it still saves, under the page and snippet alone');
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /^CodeEditor saveDraft: give the editor an id, e\.g\. id="two-sum"/);
	assert.deepEqual(withWarnings(() => normalizeEditorProps({ initialCode: 'x', saveDraft: true, id: 'two-sum' }))[1], []);
	assert.deepEqual(withWarnings(() => normalizeEditorProps({ initialCode: 'x', saveDraft: true, readOnly: true }))[1], [], 'read-only: no drafts at all');
	assert.deepEqual(withWarnings(() => normalizeEditorProps({ initialCode: 'x' }))[1], [], 'no saveDraft: nothing to say');
	const refused = withWarnings(() => normalizeEditorProps({ initialCode: 'x', saveDraft: true, id: 'two sum' }))[1];
	assert.equal(refused.length, 1, 'a refused id has its own warning, and only that one');
	assert.match(refused[0], /CodeEditor id:/);
});

test('expectedOutput: a string with ONE leading newline dropped (an MDX template literal starts with one); anything else is null', () => {
	assert.equal(normalizeEditorProps({ expectedOutput: '\n5\n8\n' }).expectedOutput, '5\n8\n');
	assert.equal(normalizeEditorProps({ expectedOutput: '\n\nx' }).expectedOutput, '\nx', 'only one');
	assert.equal(normalizeEditorProps({ expectedOutput: '' }).expectedOutput, '', 'no output expected is a string too');
	assert.equal(normalizeEditorProps({ expectedOutput: 5 }).expectedOutput, null);
});

test('tests and solution: per language through testsFor / solutionFor; a string belongs to the opening language', () => {
	const settings = normalizeEditorProps({
		initialCode: { python: 'def f(): pass\n', javascript: 'function f() {}\n', ruby: 'x' },
		tests: { python: 'check("f", f(), None)', js: 'check("f", f(), undefined);' },
		solution: 'def f():\n    # highlight-next-line\n    return 1\n',
	});
	assert.equal(testsFor(settings, 'python'), 'check("f", f(), None)');
	assert.equal(testsFor(settings, 'javascript'), 'check("f", f(), undefined);', 'any name for the language');
	assert.equal(testsFor(settings, 'ruby'), '');
	assert.equal(solutionFor(settings, 'python'), 'def f():\n    return 1\n', 'the solution without its magic comments');
	assert.equal(solutionFor(settings, 'javascript'), '', 'a string solution is the opening language\'s');
	assert.deepEqual(exerciseButtonsFor(settings, 'python'), { hint: false, solution: true, check: true });
	assert.deepEqual(exerciseButtonsFor(settings, 'javascript'), { hint: false, solution: false, check: true });
	assert.deepEqual(exerciseButtonsFor(settings, 'ruby'), { hint: false, solution: false, check: false }, 'no tests, and Ruby has no check helper');
	const [bad, warnings] = withWarnings(() => normalizeEditorProps({ tests: ['x'], solution: 3 }));
	assert.deepEqual([bad.tests, bad.solution], [null, null]);
	assert.equal(warnings.length, 2);
});

test('exerciseButtonsFor: Hint with hints; no Solution on a read-only editor (its edit could not be undone)', () => {
	const settings = normalizeEditorProps({ initialCode: 'x', hints: ['one', '  ', 'two'], solution: 'y', readOnly: true });
	assert.deepEqual(settings.hints, ['one', 'two']);
	assert.deepEqual(exerciseButtonsFor(settings, 'python'), { hint: true, solution: false, check: false });
});

test('buildMonacoOptions: renderValidationDecorations only where needed (read-only: on; hideErrors: off; a page value wins)', () => {
	assert.equal('renderValidationDecorations' in buildMonacoOptions({}), false, 'an editable editor keeps Monaco\'s default, exactly as before');
	assert.equal(buildMonacoOptions({}, { readOnly: true }).renderValidationDecorations, 'on', 'a read-only editor shows its run errors');
	assert.equal(buildMonacoOptions({}, { hideErrors: true }).renderValidationDecorations, 'off');
	assert.equal(buildMonacoOptions({ readOnly: true }, { readOnly: true, hideErrors: true }).renderValidationDecorations, 'off');
	assert.equal(buildMonacoOptions({ renderValidationDecorations: 'editable' }, { readOnly: true }).renderValidationDecorations, 'editable');
	assert.equal(buildMonacoOptions({ renderValidationDecorations: 'off' }).renderValidationDecorations, 'off');
});

test('normalizeHints: strings in order, blank and non-string entries dropped with a warning; one string is one hint', () => {
	const warnings = [];
	const warn = (message) => warnings.push(message);
	assert.deepEqual(normalizeHints(['Sort first.', '', 3, 'Use `i`.', '   '], { warn }), ['Sort first.', 'Use `i`.']);
	assert.equal(warnings.length, 3, 'one warning per entry left out');
	assert.deepEqual(normalizeHints(' One hint. ', { warn }), [' One hint. '], 'kept as written (the hint list shows it)');
	assert.deepEqual(normalizeHints(undefined, { warn }), []);
	assert.deepEqual(normalizeHints(null, { warn }), []);
	assert.deepEqual(normalizeHints({ a: 1 }, { warn }), []);
	assert.equal(warnings.length, 4, 'an object instead of a list warns once');
});

test('renderValidationDecorationsFor: off with hideErrors, else the page value when it is one of Monaco\'s, else on', () => {
	assert.equal(renderValidationDecorationsFor(), 'on');
	assert.equal(renderValidationDecorationsFor({ hideErrors: true, pageValue: 'on' }), 'off', 'hideErrors wins');
	assert.equal(renderValidationDecorationsFor({ pageValue: 'editable' }), 'editable');
	assert.equal(renderValidationDecorationsFor({ pageValue: 'sometimes' }), 'on');
	assert.deepEqual(Object.values(VALIDATION_DECORATIONS).sort(), ['editable', 'off', 'on']);
});

test('height="fit": the horizontal scrollbar is left out of the content height and drawn over the bottom padding; a page can still set its own', () => {
	const fit = buildMonacoOptions({}, { fit: true });
	assert.deepEqual(fit.scrollbar, { alwaysConsumeMouseWheel: false, ...FIT_SCROLLBAR_OPTIONS });
	assert.equal(FIT_SCROLLBAR_OPTIONS.ignoreHorizontalScrollbarInContentHeight, true);
	assert.equal(FIT_SCROLLBAR_OPTIONS.horizontalScrollbarSize, DEFAULT_EDITOR_OPTIONS.padding.bottom, 'as thin as the padding it covers');
	const page = buildMonacoOptions({ scrollbar: { horizontalScrollbarSize: 14 } }, { fit: true });
	assert.equal(page.scrollbar.horizontalScrollbarSize, 14, "the page's own value wins");
	assert.equal(page.scrollbar.ignoreHorizontalScrollbarInContentHeight, true);
	assert.deepEqual(buildMonacoOptions({}).scrollbar, { alwaysConsumeMouseWheel: false }, 'a fixed-height box keeps Monaco\'s own bar');
	assert.deepEqual(buildMonacoOptions({}, { fit: false }), buildMonacoOptions({}));
	const settings = normalizeEditorProps({ initialCode: 'a\nb', height: 'fit' });
	assert.equal(initialContentHeight(settings, 'python'), 2 * LINE_PX + PADDING_PX, 'the estimate needs no width: the bar never counts');
});

test("runtimeSlotFor: a slot for an exercise button or TypeScript (several with a language picker); none otherwise, so the header stays as it was", () => {
	const none = { hint: false, solution: false, check: false };
	assert.equal(runtimeSlotFor({ buttons: none, language: 'python', languageCount: 1 }), null);
	assert.equal(runtimeSlotFor({ buttons: none, language: 'python', languageCount: 5 }), null, 'the old five-language editor: unchanged');
	assert.equal(runtimeSlotFor({ buttons: { ...none, hint: true }, language: 'python', languageCount: 1 }), RUNTIME_SLOTS.single);
	assert.equal(runtimeSlotFor({ buttons: { ...none, solution: true }, language: 'go', languageCount: 2 }), RUNTIME_SLOTS.several);
	assert.equal(runtimeSlotFor({ buttons: { ...none, check: true }, language: 'javascript', languageCount: 1 }), RUNTIME_SLOTS.single);
	assert.equal(runtimeSlotFor({ buttons: none, language: 'typescript', languageCount: 1 }), RUNTIME_SLOTS.single, 'TypeScript: "TypeScript 5.9.3 · Node 20.11.1"');
	assert.equal(runtimeSlotFor({ buttons: none, language: 'typescript', languageCount: 2 }), RUNTIME_SLOTS.several);
	const exercise = normalizeEditorProps({ initialCode: { python: 'x', javascript: 'y' }, tests: { javascript: 'check("y", y, 1)' } });
	const buttons = exerciseButtonsFor(exercise, exercise.language);
	assert.equal(runtimeSlotFor({ buttons, language: exercise.language, languageCount: exercise.snippets.languages.length }), null, 'tests for another language only: no Check here, no slot');
});

test("waitingCodeStyle: Monaco's font, size, line height, top padding and tab width for this editor", () => {
	assert.deepEqual(waitingCodeStyle(normalizeEditorProps({ initialCode: 'x' })), {
		fontFamily: WAITING_FONT_CSS,
		fontSize: '14px',
		lineHeight: `${LINE_PX}px`,
		paddingTop: '8px',
		tabSize: 4,
	});
	const bigger = waitingCodeStyle(normalizeEditorProps({ initialCode: 'x', editorOptions: { fontSize: 20, padding: { top: 4 }, tabSize: 2 } }));
	assert.deepEqual([bigger.fontSize, bigger.lineHeight, bigger.paddingTop, bigger.tabSize], ['20px', '30px', '4px', 2], "the page's editorOptions count");
});
