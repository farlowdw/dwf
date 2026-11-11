/**
 * twoslash.test.js — type queries (`// ^?`, ../twoslash.js). Pure: which lines are queries,
 * where each caret points (stacked queries, a caret past the end of the line, a query with no
 * line above, tabs, CRLF), and the type text (one line, cut at its maximum). With a fake editor
 * (./tsHarness.js > FakeEditor) and Monaco's REAL TypeScript worker (skipped when monaco-editor
 * is missing): the inferred type drawn after the comment, refreshed after an edit (once per
 * pause), the "nothing here" note, a JavaScript model, a model switch, a language change, an
 * answer that arrives too late, a worker that fails, a worker object instead of a getter, the
 * cap on queries, and dispose. And the stylesheet (../twoslash.module.css): each rule names the
 * class under `.monaco-editor`, so it outranks Monaco's run-time one-class token colours.
 * Run with `npm run test:shared`.
 * To change it: a new rule of ../twoslash.js gets a test here, pure where it can be and with the real
 * worker where it cannot.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	MAX_TYPE_LENGTH,
	MAX_TYPE_QUERIES,
	TYPE_QUERY_CLASS,
	WORDS,
	applyTypeQueries,
	findTypeQueries,
	isTypeQueryLine,
	typeTextOf,
} from '../twoslash.js';
import { configureTypeScript } from '../typescript.js';
import { FakeEditor, FakeModel, FakeUri, SKIP_REASON, createTypeScriptMonaco, loadTypeScript } from './tsHarness.js';

const loaded = await loadTypeScript();
const skipReal = loaded ? false : SKIP_REASON;

/** Resolves after `ms` milliseconds. */
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How long waitFor polls before it gives up (ms): generous, the suites run in parallel. */
const WAIT_LIMIT_MS = 5000;
const POLL_MS = 10;

/** Resolves once `condition()` is true; rejects after WAIT_LIMIT_MS. */
async function waitFor(condition, what) {
	const deadline = Date.now() + WAIT_LIMIT_MS;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		await sleep(POLL_MS);
	}
}

/** Do two lists of shown decorations match? */
function sameShown(actual, expected) {
	return JSON.stringify(actual) === JSON.stringify(expected);
}

/** The type queries' stylesheet, its comments left out. */
const TWOSLASH_CSS = readFileSync(new URL('../twoslash.module.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The selectors of every rule in `css` (the text before each '{'), trimmed. */
function selectorsOf(css) {
	return [...css.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim());
}

/** A real-worker setup and an editor showing `code` in a TypeScript model. */
function realEditor(code) {
	const setup = createTypeScriptMonaco(loaded.TypeScriptWorker);
	configureTypeScript(setup.monaco);
	const model = setup.createModel(code);
	return { ...setup, model, editor: new FakeEditor(model) };
}

/** A fake monaco for the fake-worker tests (Range and the cursor-stops enum only). */
const plainMonaco = Object.freeze({
	Range: class {
		constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
			Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
		}
	},
	editor: { InjectedTextCursorStops: { None: 3 } },
});

/** A TypeScript model without a worker behind it. */
function tsModel(code, name = 'r1') {
	return new FakeModel(code, 'typescript', new FakeUri(`inmemory://code-editor/${name}/typescript/main.ts`));
}

/** A worker whose quick info is always `text` (counts its calls). */
function constantWorker(text) {
	const worker = {
		calls: 0,
		getQuickInfoAtPosition: async () => {
			worker.calls += 1;
			return { displayParts: [{ text, kind: 'text' }] };
		},
	};
	return worker;
}

// ---- pure ----

test('a query line holds only //, spaces and ^?', () => {
	for (const line of ['//    ^?', '//^?', '\t//  ^?  ', '  // ^?']) assert.equal(isTypeQueryLine(line), true, JSON.stringify(line));
	for (const line of ['// ^? extra', 'x; // ^?', '/* ^? */', '//  ^', '// ?^', '# ^?', '']) assert.equal(isTypeQueryLine(line), false, JSON.stringify(line));
});

test('findTypeQueries: the caret points at its column on the line above', () => {
	const code = 'const total = [1, 2, 3].reduce((sum, n) => sum + n, 0);\n//    ^?\n';
	assert.deepEqual(findTypeQueries(code), [{ line: 2, column: 7, targetLine: 1, targetColumn: 7, onCode: true }]);
	assert.equal(code.split('\n')[0][6], 't', "column 7 is total's first letter");
	assert.deepEqual(findTypeQueries('const a = 1;\n'), [], 'no query');
	assert.deepEqual(findTypeQueries(undefined), []);
});

test('findTypeQueries: stacked queries both point at the code line above them', () => {
	const code = "const pair = { name: 'a', size: 2 };\n//             ^?\n//                        ^?\n";
	const queries = findTypeQueries(code);
	assert.deepEqual(
		queries.map((query) => [query.line, query.targetLine, query.targetColumn]),
		[
			[2, 1, 16],
			[3, 1, 27],
		],
	);
	assert.equal(code.split('\n')[0].slice(15, 19), 'name');
	assert.equal(code.split('\n')[0].slice(26, 30), 'size');
});

test('findTypeQueries: a caret past the end of the line, or with no line above, points at nothing', () => {
	const [pastEnd] = findTypeQueries('x;\n//          ^?\n');
	assert.equal(pastEnd.onCode, false);
	assert.equal(pastEnd.targetLine, 1);
	const [first] = findTypeQueries('// ^?\nconst a = 1;\n');
	assert.deepEqual(first, { line: 1, column: 4, targetLine: null, targetColumn: 4, onCode: false });
});

test('findTypeQueries: tabs count one character each; CRLF line endings are read as LF', () => {
	const [tabbed] = findTypeQueries('\tconst a = 1;\n\t//    ^?\n');
	assert.equal(tabbed.targetColumn, 8, 'the tab is column 1, so "a" is column 8');
	assert.equal('\tconst a = 1;'[7], 'a');
	const [crlf] = findTypeQueries('const b = 2;\r\n//    ^?\r\n');
	assert.deepEqual([crlf.line, crlf.targetColumn, crlf.onCode], [2, 7, true]);
});

test('typeTextOf: the quick info on one line, cut at its maximum; empty without one', () => {
	assert.equal(typeTextOf({ displayParts: [{ text: 'const' }, { text: ' ' }, { text: 'a' }, { text: ': ' }, { text: 'number' }] }), 'const a: number');
	assert.equal(typeTextOf({ displayParts: [{ text: 'const p: {\n    x: number;\n    y: number;\n}' }] }), 'const p: { x: number; y: number; }');
	const long = typeTextOf({ displayParts: [{ text: 'x'.repeat(MAX_TYPE_LENGTH + 20) }] });
	assert.equal(long.length, MAX_TYPE_LENGTH);
	assert.ok(long.endsWith('…'));
	assert.equal(typeTextOf(undefined), '');
	assert.equal(typeTextOf({}), '');
});

test("the stylesheet: every rule names the class under .monaco-editor (two classes beat Monaco's run-time `.mtk1 { color }`), light and dark", () => {
	const selectors = selectorsOf(TWOSLASH_CSS);
	// dark: the EDITOR's theme (the frame's data-ce-mode), not the site's
	assert.deepEqual(selectors, [`:global(.monaco-editor .${TYPE_QUERY_CLASS})`, `:global([data-ce-mode='dark'] .monaco-editor .${TYPE_QUERY_CLASS})`]);
	assert.match(TWOSLASH_CSS, /color: var\(--twoslash-ink\)/, 'the muted ink is set by the two-class rule');
});

// ---- with Monaco's real TypeScript worker ----

test('real worker: the inferred type is drawn after the comment, as injected text the cursor skips', { skip: skipReal }, async () => {
	const code = 'const total = [1, 2, 3].reduce((sum, n) => sum + n, 0);\n//    ^?\nconst pair = { name: "a", size: 2 };\n//             ^?\n';
	const { editor, monaco } = realEditor(code);
	const queries = applyTypeQueries(editor, monaco, null, { delayMs: 5 });
	try {
		assert.deepEqual(await queries.refresh(), ['const total: number', '(property) name: string']);
		assert.deepEqual(editor.shown(), [
			[2, 9, 'const total: number'],
			[4, 18, '(property) name: string'],
		]);
		const { options } = editor.decorations[0];
		assert.equal(options.after.inlineClassName, TYPE_QUERY_CLASS);
		assert.equal(options.after.cursorStops, 3, "Monaco's InjectedTextCursorStops.None");
		assert.equal(options.showIfCollapsed, true);
	} finally {
		queries.dispose();
	}
});

test('real worker: an edit refreshes the types after a pause — once for several quick edits', { skip: skipReal }, async () => {
	const { editor, monaco } = realEditor('const total = 1 + 2;\n//    ^?\n');
	let workerRequests = 0;
	const countingWorker = async (uri) => {
		workerRequests += 1;
		const getWorker = await monaco.typescript.getTypeScriptWorker();
		return getWorker(uri);
	};
	const queries = applyTypeQueries(editor, monaco, countingWorker, { delayMs: 20 });
	try {
		await waitFor(() => editor.shown().length === 1, 'the first refresh');
		assert.deepEqual(editor.shown(), [[2, 9, 'const total: number']], 'the first refresh comes by itself');
		workerRequests = 0;
		editor.edit('const total = "1" + 2;\n//    ^?\n');
		editor.edit('const total = `${1}`;\n//    ^?\n');
		editor.edit('const total = [1].map(String);\n//    ^?\n');
		await waitFor(() => sameShown(editor.shown(), [[2, 9, 'const total: string[]']]), 'the refresh after the edits');
		await sleep(50);
		assert.equal(workerRequests, 1, 'three quick edits, one refresh');
	} finally {
		queries.dispose();
	}
});

test('real worker: a caret on nothing says so', { skip: skipReal }, async () => {
	const { editor, monaco } = realEditor('const a = 1;      \n//               ^?\nx;\n//      ^?\n');
	const queries = applyTypeQueries(editor, monaco, null, { delayMs: 5 });
	try {
		assert.deepEqual(await queries.refresh(), [WORDS.nothingAtCaret, WORDS.nothingAtCaret], 'trailing spaces, then past the end of the line');
	} finally {
		queries.dispose();
	}
});

test('real worker: a JavaScript model gets no types; switching to a TypeScript model shows its own', { skip: skipReal }, async () => {
	const { editor, monaco, createModel } = realEditor('const a = 1;\n//    ^?\n');
	const queries = applyTypeQueries(editor, monaco, null, { delayMs: 5 });
	try {
		await queries.refresh();
		assert.equal(editor.shown().length, 1);
		editor.setModel(new FakeModel('const b = 2;\n//    ^?\n', 'javascript', new FakeUri('inmemory://code-editor/r1/javascript/main.js')));
		assert.deepEqual(await queries.refresh(), []);
		assert.deepEqual(editor.shown(), [], 'cleared for JavaScript');
		editor.setModel(createModel('const word = "hi";\n//    ^?\n', 'inmemory://code-editor/r1/typescript2/main.ts'));
		await waitFor(() => sameShown(editor.shown(), [[2, 9, 'const word: "hi"']]), 'the refresh after the model switch');
	} finally {
		queries.dispose();
	}
});

// ---- with fake workers ----

test('an answer that arrives after a newer edit is dropped', async () => {
	const model = tsModel('const a = 1;\n//    ^?\n');
	const editor = new FakeEditor(model);
	let release;
	const slowWorker = () =>
		new Promise((resolve) => {
			release = () => resolve(constantWorker('const a: 1'));
		});
	const queries = applyTypeQueries(editor, plainMonaco, slowWorker, { delayMs: 10000 });
	try {
		const pending = queries.refresh();
		await sleep(0);
		model.setValue('const a = "x";\n//    ^?\n');
		release();
		assert.equal(await pending, null, 'the text changed while it waited');
		assert.deepEqual(editor.shown(), []);
	} finally {
		queries.dispose();
	}
});

test('a worker that cannot be reached leaves the decorations as they were', async () => {
	const model = tsModel('const a = 1;\n//    ^?\n');
	const editor = new FakeEditor(model);
	let fail = false;
	const flakyWorker = async () => {
		if (fail) throw new Error("TypeScript isn't ready");
		return constantWorker('const a: 1');
	};
	const queries = applyTypeQueries(editor, plainMonaco, flakyWorker, { delayMs: 10000 });
	try {
		await queries.refresh();
		assert.deepEqual(editor.shown(), [[2, 9, 'const a: 1']]);
		fail = true;
		assert.equal(await queries.refresh(), null);
		assert.deepEqual(editor.shown(), [[2, 9, 'const a: 1']], 'kept');
	} finally {
		queries.dispose();
	}
});

test(`at most ${MAX_TYPE_QUERIES} queries are answered in one model`, async () => {
	const lines = [];
	for (let index = 0; index < MAX_TYPE_QUERIES + 10; index += 1) lines.push(`const v${index} = ${index};`, '//    ^?');
	const editor = new FakeEditor(tsModel(lines.join('\n')));
	const worker = constantWorker('const v: number');
	const queries = applyTypeQueries(editor, plainMonaco, async () => worker, { delayMs: 10000 });
	try {
		await queries.refresh();
		assert.equal(editor.shown().length, MAX_TYPE_QUERIES);
		assert.equal(worker.calls, MAX_TYPE_QUERIES);
	} finally {
		queries.dispose();
	}
});

test('a worker object can be given instead of a getter (the third argument)', async () => {
	const editor = new FakeEditor(tsModel('const a = 1;\n//    ^?\n'));
	const worker = constantWorker('const a: 1');
	const queries = applyTypeQueries(editor, plainMonaco, worker, { delayMs: 10000 });
	try {
		assert.deepEqual(await queries.refresh(), ['const a: 1']);
		assert.deepEqual(editor.shown(), [[2, 9, 'const a: 1']]);
	} finally {
		queries.dispose();
	}
});

test("the model's language changing refreshes: cleared for JavaScript, back for TypeScript", async () => {
	const editor = new FakeEditor(tsModel('const a = 1;\n//    ^?\n'));
	const worker = constantWorker('const a: 1');
	const queries = applyTypeQueries(editor, plainMonaco, async () => worker, { delayMs: 5 });
	try {
		await waitFor(() => editor.shown().length === 1, 'the first refresh');
		editor.setLanguage('javascript');
		await waitFor(() => editor.shown().length === 0, 'the refresh after the switch to JavaScript');
		editor.setLanguage('typescript');
		await waitFor(() => sameShown(editor.shown(), [[2, 9, 'const a: 1']]), 'the refresh after the switch back');
	} finally {
		queries.dispose();
	}
});

test('dispose removes the decorations and the listeners; later edits do nothing', async () => {
	const model = tsModel('const a = 1;\n//    ^?\n');
	const editor = new FakeEditor(model);
	const worker = constantWorker('const a: 1');
	const queries = applyTypeQueries(editor, plainMonaco, async () => worker, { delayMs: 5 });
	await queries.refresh();
	assert.equal(editor.listenerCount(), 3);
	queries.dispose();
	assert.deepEqual(editor.shown(), []);
	assert.equal(editor.listenerCount(), 0);
	const calls = worker.calls;
	editor.edit('const a = 2;\n//    ^?\n');
	await sleep(30);
	assert.equal(worker.calls, calls, 'no refresh after dispose');
	assert.equal(await queries.refresh(), null, 'refresh after dispose asks nothing');
	assert.equal(worker.calls, calls);
	assert.deepEqual(editor.shown(), []);
});
