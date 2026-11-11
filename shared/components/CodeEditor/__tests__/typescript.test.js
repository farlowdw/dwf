/**
 * typescript.test.js — TypeScript in the browser (../typescript.js, ../typescriptLibs.js).
 * With small fakes: the page-wide settings (set once per page, other options kept, Monaco 0.55's
 * top-level `monaco.typescript` and the older `monaco.languages.typescript`), waiting for the
 * worker, chained messages, the emit, the reader's code joined to a harness, the run-error
 * locations and the line mapper. With Monaco's REAL TypeScript worker (./tsHarness.js; skipped
 * when monaco-editor is missing): a program compiled and run in this machine's node, type and
 * syntax errors at the right places, the strict options, two editors that no longer clash, the
 * helper types (Expect, Equal …) and the Node globals (with require.main, setImmediate,
 * process.hrtime(), global), the newest Node's built-ins (ES2023's toSorted … known, ES2024's
 * Object.groupBy not), a top-level await kept with the site's words, diagnostics counted in the
 * text the worker read (an edit made while it works moves nothing), a Node stack trace mapped
 * back to the TypeScript line (with the column, inside a call written over several lines), and
 * an exercise's type check and run (reader + harness, the harness in its own namespace: no
 * clash with the reader's names or own check(), no ASI across the two; the reader's own
 * diagnostics; one text, the click's, even when the reader edits while it waits). With two real
 * answers of a Piston server (lib/codeRunner/__tests__/fixtures/typescript, captured
 * 2026-10-25 by running this file's emitted JavaScript on javascript 20.11.1): the server's
 * stack frames mapped back to the reader's lines, and through errorLocations.js the rows the
 * reader sees (skipped while that file is missing). Run with `npm run test:shared`.
 * To change it: a new setting or step of ../typescript.js gets a test here; a new real answer goes in
 * lib/codeRunner/__tests__/fixtures/typescript.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	COMPILER_OPTIONS,
	HARNESS_SCOPE_CLOSE,
	HARNESS_SCOPE_OPEN,
	JAVASCRIPT_DIAGNOSTICS,
	KIND_TOP_LEVEL_AWAIT,
	TOP_LEVEL_AWAIT_CODES,
	TS_LIB_NEWEST_NODE,
	TYPESCRIPT_DIAGNOSTICS,
	WORDS,
	WORKER_RETRY_DELAYS_MS,
	combineWithHarness,
	compileReaderSource,
	compileTypeScript,
	compileTypeScriptSource,
	configureTypeScript,
	diagnosticsToLocations,
	flattenMessage,
	getTypeScriptWorkerFor,
	harnessDefinesCheck,
	isTypeScriptModel,
	positionAt,
	prepareTypeScriptCheck,
	readEmit,
	readerLineMapper,
	typeCheckOnly,
	typeCheckSource,
	typeScriptNamespace,
} from '../typescript.js';
import { CHECK_DECLARATION, EXTRA_LIBS, NODE_GLOBALS_PATH, TYPE_HELPERS_PATH } from '../typescriptLibs.js';
import { FakeModel, FakeUri, SKIP_REASON, createTypeScriptMonaco, fakeDefaults, loadTypeScript } from './tsHarness.js';

const loaded = await loadTypeScript();
const skipReal = loaded ? false : SKIP_REASON;

/** The exercise builder's modules (lib/codeRunner), loaded only when they exist: { exercise, checkHelpers } or null. */
const LIBRARY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lib/codeRunner');

async function loadExerciseLibrary() {
	try {
		const exercise = await import(path.join(LIBRARY, 'exercise.js'));
		const checkHelpers = await import(path.join(LIBRARY, 'checkHelpers.js'));
		if (typeof exercise.buildCheckFiles !== 'function' || typeof exercise.parseCheckResults !== 'function') return null;
		return { exercise, checkHelpers };
	} catch {
		return null;
	}
}

const exerciseLibrary = await loadExerciseLibrary();
const skipExercise = skipReal || (exerciseLibrary ? false : 'lib/codeRunner/exercise.js is not there');

/** The run-error reader (lib/codeRunner/errorLocations.js), loaded only when it exists: its errorLocations(), or null. */
async function loadErrorLocations() {
	try {
		const library = await import(pathToFileURL(path.join(LIBRARY, 'errorLocations.js')).href);
		return typeof library.errorLocations === 'function' ? library.errorLocations : null;
	} catch {
		return null;
	}
}

const errorLocations = await loadErrorLocations();
const skipErrorLocations = errorLocations ? false : 'lib/codeRunner/errorLocations.js is not there';

/** Real answers of a Piston server (javascript 20.11.1) to JavaScript this file's code emitted (captured 2026-10-25). */
const SERVER_FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lib/codeRunner/__tests__/fixtures/typescript');

/** A captured fixture: { typescript, map, request, status, response, … }. */
function serverFixture(name) {
	return JSON.parse(readFileSync(path.join(SERVER_FIXTURES, `${name}.json`), 'utf8'));
}

/** The line numbers of every stack frame in `fileName` (frames with a column; Node's header line has none). */
function frameLines(stderr, fileName) {
	const pattern = new RegExp(`/${fileName.replace('.', '\\.')}:(\\d+):\\d+`, 'g');
	return [...stderr.matchAll(pattern)].map((match) => Number(match[1]));
}

/** Monaco's initial defaults (monaco.contribution.js), as fakes. */
function monacoDefaults() {
	return {
		typescriptDefaults: fakeDefaults({ allowNonTsExtensions: true, target: 99 }, { noSemanticValidation: false, noSyntaxValidation: false, onlyVisible: false }),
		javascriptDefaults: fakeDefaults({ allowNonTsExtensions: true, allowJs: true, target: 99 }, { noSemanticValidation: true, noSyntaxValidation: false, onlyVisible: false }),
	};
}

/** No waiting between the worker's tries (records the delays asked for). */
function recordingWait(delays) {
	return async (ms) => {
		delays.push(ms);
	};
}

/** A real-worker setup, configured as a page's first editor would. */
function realSetup() {
	const setup = createTypeScriptMonaco(loaded.TypeScriptWorker);
	configureTypeScript(setup.monaco);
	return setup;
}

/** Run `files` ({ name: text }; main.js first) in this machine's node: { status, stdout, stderr }. */
function runInNode(files) {
	const folder = mkdtempSync(path.join(os.tmpdir(), 'dwf-ts-test-'));
	try {
		for (const [name, text] of Object.entries(files)) writeFileSync(path.join(folder, name), text);
		const result = spawnSync(process.execPath, ['main.js'], { cwd: folder, encoding: 'utf8', timeout: 20000 });
		return { status: result.status, stdout: result.stdout, stderr: result.stderr };
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}

/**
 * A worker that answers as `worker` does, but `typed` is put in front of the model's text right
 * after its first answer: the reader typing while the worker works (the questions were all
 * asked before, about the text as it was).
 */
function typingWhileItWorks(worker, model, typed) {
	let typedYet = false;
	const answerThenType = (method) => async (...args) => {
		const answer = await worker[method](...args);
		if (!typedYet) {
			typedYet = true;
			model.setValue(typed + model.getValue());
		}
		return answer;
	};
	return {
		getSyntacticDiagnostics: answerThenType('getSyntacticDiagnostics'),
		getSemanticDiagnostics: answerThenType('getSemanticDiagnostics'),
		getEmitOutput: answerThenType('getEmitOutput'),
	};
}

/** The first stack frame in `fileName` of a Node error: { line, column }, or null. */
function firstFrameIn(stderr, fileName) {
	const match = stderr.match(new RegExp(`${fileName.replace('.', '\\.')}:(\\d+):(\\d+)`));
	return match ? { line: Number(match[1]), column: Number(match[2]) } : null;
}

// ---- the page-wide settings ----

test('configureTypeScript on Monaco 0.55: TS type checking on, JS left quiet, the compiler options and both libs added', () => {
	const { typescriptDefaults, javascriptDefaults } = monacoDefaults();
	const changed = configureTypeScript({ typescript: { typescriptDefaults, javascriptDefaults }, languages: { typescript: { deprecated: true } } });
	assert.equal(changed, 4, "Monaco's own defaults already check TS and quiet JS: the ignored codes, the options and two libs change");
	assert.deepEqual(typescriptDefaults.compilerOptions, { ...COMPILER_OPTIONS }, 'merged over Monaco\'s allowNonTsExtensions and target');
	assert.equal(typescriptDefaults.compilerOptions.target, 9, 'ES2022, not Monaco\'s Latest');
	assert.equal(typescriptDefaults.compilerOptions.lib, TS_LIB_NEWEST_NODE, 'the one frozen array, so the next editor finds it set');
	assert.equal(typescriptDefaults.diagnosticsOptions.noSemanticValidation, false);
	assert.deepEqual(typescriptDefaults.diagnosticsOptions.diagnosticCodesToIgnore, [...TOP_LEVEL_AWAIT_CODES], "a top-level await's squiggle is hidden");
	assert.equal(javascriptDefaults.diagnosticsOptions.noSemanticValidation, true);
	assert.deepEqual(Object.keys(typescriptDefaults.extraLibs), [TYPE_HELPERS_PATH, NODE_GLOBALS_PATH]);
	assert.equal(Object.keys(javascriptDefaults.extraLibs).length, 0, 'JavaScript editors get no helper types');
	assert.equal(javascriptDefaults.changes, 0, 'the JavaScript worker is not restarted');
});

test('configureTypeScript replaces the old quiet setting: TS semantic checking goes back on, the other options stay', () => {
	const { typescriptDefaults, javascriptDefaults } = monacoDefaults();
	typescriptDefaults.diagnosticsOptions = { noSemanticValidation: true, noSyntaxValidation: false, diagnosticCodesToIgnore: [2307] };
	typescriptDefaults.compilerOptions = { allowNonTsExtensions: true, target: 99, experimentalDecorators: true };
	assert.equal(configureTypeScript({ typescript: { typescriptDefaults, javascriptDefaults } }), 4);
	assert.deepEqual(typescriptDefaults.diagnosticsOptions, { ...TYPESCRIPT_DIAGNOSTICS, diagnosticCodesToIgnore: [2307, ...TOP_LEVEL_AWAIT_CODES] }, "the page's own ignored code is kept");
	assert.equal(typescriptDefaults.compilerOptions.experimentalDecorators, true, 'an option the page set is kept');
	assert.equal(javascriptDefaults.diagnosticsOptions.noSemanticValidation, JAVASCRIPT_DIAGNOSTICS.noSemanticValidation);
});

test('configureTypeScript is set once per page: the next editors change nothing (no worker restart)', () => {
	const defaults = monacoDefaults();
	const monaco = { typescript: defaults };
	assert.ok(configureTypeScript(monaco) > 0);
	const changes = defaults.typescriptDefaults.changes;
	const libs = { ...defaults.typescriptDefaults.extraLibs };
	assert.equal(configureTypeScript(monaco), 0);
	assert.equal(configureTypeScript(monaco), 0);
	assert.equal(defaults.typescriptDefaults.changes, changes, 'no setter ran again');
	assert.deepEqual({ ...defaults.typescriptDefaults.extraLibs }, libs);
	defaults.typescriptDefaults.extraLibs[TYPE_HELPERS_PATH] = { content: 'type Old = 1;', version: 1 };
	assert.equal(configureTypeScript(monaco), 1, 'a lib with other text (an older page) is replaced');
});

test('configureTypeScript: the top-level-await codes are added to the ignored ones only when missing', () => {
	const defaults = monacoDefaults();
	defaults.typescriptDefaults.diagnosticsOptions = { ...TYPESCRIPT_DIAGNOSTICS, diagnosticCodesToIgnore: [1432, 2307, 1378] };
	defaults.typescriptDefaults.compilerOptions = { ...COMPILER_OPTIONS };
	const monaco = { typescript: defaults };
	assert.equal(configureTypeScript(monaco), 2, 'only the two libs: the codes were there already (in another order)');
	assert.deepEqual(defaults.typescriptDefaults.diagnosticsOptions.diagnosticCodesToIgnore, [1432, 2307, 1378]);
	defaults.typescriptDefaults.diagnosticsOptions = { ...TYPESCRIPT_DIAGNOSTICS, diagnosticCodesToIgnore: [1378] };
	assert.equal(configureTypeScript(monaco), 1);
	assert.deepEqual(defaults.typescriptDefaults.diagnosticsOptions.diagnosticCodesToIgnore, [1378, 1432], 'the missing one added');
});

test('configureTypeScript: the older monaco.languages.typescript works; a deprecated stub or no Monaco does nothing', () => {
	const defaults = monacoDefaults();
	assert.equal(configureTypeScript({ languages: { typescript: defaults } }), 4);
	assert.equal(configureTypeScript({ languages: { typescript: { deprecated: true } } }), 0);
	assert.equal(configureTypeScript({ languages: {} }), 0);
	assert.equal(configureTypeScript(undefined), 0);
	assert.equal(typeScriptNamespace({ typescript: { deprecated: true } }), null);
	assert.equal(configureTypeScript({ typescript: { typescriptDefaults: {}, javascriptDefaults: null } }), 0, 'defaults without setters are left alone');
});

test("the compiler options are TypeScript's own numbers for ES2022, CommonJS, forced modules and LF", { skip: skipReal }, () => {
	const { ts } = loaded;
	assert.equal(COMPILER_OPTIONS.target, ts.ScriptTarget.ES2022);
	assert.equal(COMPILER_OPTIONS.module, ts.ModuleKind.CommonJS);
	assert.equal(COMPILER_OPTIONS.moduleDetection, ts.ModuleDetectionKind.Force);
	assert.equal(COMPILER_OPTIONS.newLine, ts.NewLineKind.LineFeed);
	assert.equal(COMPILER_OPTIONS.strict, true);
	assert.equal(COMPILER_OPTIONS.sourceMap, true);
});

test("the lib is a file name of Monaco's (the worker does not read the short form), the full ES2023 one, frozen", () => {
	assert.deepEqual([...TS_LIB_NEWEST_NODE], ['lib.es2023.full.d.ts']);
	assert.equal(Object.isFrozen(TS_LIB_NEWEST_NODE), true);
	assert.equal(COMPILER_OPTIONS.lib, TS_LIB_NEWEST_NODE);
	assert.deepEqual([...TOP_LEVEL_AWAIT_CODES], [1378, 1432], "TypeScript's codes for a top-level await and for await");
});

test('the extra libs: two declaration files, global (no import / export), no backticks', () => {
	assert.equal(EXTRA_LIBS.length, 2);
	for (const { filePath, content } of EXTRA_LIBS) {
		assert.ok(filePath.endsWith('.d.ts'), filePath);
		assert.doesNotMatch(content, /^\s*(import|export)\b/m, 'a module would not be global');
		assert.doesNotMatch(content, /`/);
	}
	assert.match(CHECK_DECLARATION, /^declare function check\b/);
});

// ---- waiting for the worker ----

test('getTypeScriptWorkerFor waits for the worker while TypeScript is not registered yet, then fails with plain words', async () => {
	let calls = 0;
	const worker = { name: 'worker' };
	const seen = [];
	const monaco = {
		typescript: {
			getTypeScriptWorker: async () => {
				calls += 1;
				if (calls < 3) throw 'TypeScript not registered!';
				return async (uri) => {
					seen.push(uri);
					return worker;
				};
			},
		},
	};
	const delays = [];
	assert.equal(await getTypeScriptWorkerFor(monaco, 'URI', { wait: recordingWait(delays) }), worker);
	assert.deepEqual(delays, WORKER_RETRY_DELAYS_MS.slice(0, 2), 'two waits before the third try');
	assert.deepEqual(seen, ['URI'], 'the worker is synced with the model asked about');

	const never = { typescript: { getTypeScriptWorker: async () => Promise.reject(new Error('down')) } };
	const allDelays = [];
	await assert.rejects(getTypeScriptWorkerFor(never, 'URI', { wait: recordingWait(allDelays) }), (error) => {
		assert.equal(error.message, WORDS.notReady);
		assert.equal(error.cause.message, 'down');
		return true;
	});
	assert.deepEqual(allDelays, [...WORKER_RETRY_DELAYS_MS]);
	await assert.rejects(getTypeScriptWorkerFor({}, 'URI', { retryDelaysMs: [] }), { message: WORDS.notReady });
});

test('getTypeScriptWorkerFor: a Monaco without TypeScript fails at once, without waiting', async () => {
	for (const monaco of [{}, { languages: { typescript: { deprecated: true } } }, { typescript: { typescriptDefaults: {} } }]) {
		const delays = [];
		await assert.rejects(getTypeScriptWorkerFor(monaco, 'URI', { wait: recordingWait(delays) }), { message: WORDS.notReady });
		assert.deepEqual(delays, [], JSON.stringify(monaco));
	}
});

// ---- small pure parts ----

test('flattenMessage: a text as it is; a chain on indented lines', () => {
	assert.equal(flattenMessage("Type 'string' is not assignable to type 'number'."), "Type 'string' is not assignable to type 'number'.");
	const chain = { messageText: 'Outer.', next: [{ messageText: 'Middle.', next: [{ messageText: 'Inner.' }] }, { messageText: 'Second.' }] };
	assert.equal(flattenMessage(chain), 'Outer.\n  Middle.\n    Inner.\n  Second.');
	assert.equal(flattenMessage(undefined), '');
	assert.equal(flattenMessage({ messageText: 'Alone.', next: null }), 'Alone.', 'a chain without further parts');
});

test('readEmit: the JavaScript without its source-map comment, and the parsed map', () => {
	const emit = {
		outputFiles: [
			{ name: 'inmemory://code-editor/r1/typescript/main.js.map', text: '{"version":3,"sources":["main.ts"],"mappings":"AAAA"}' },
			{ name: 'inmemory://code-editor/r1/typescript/main.js', text: '"use strict";\nconst a = 1;\n//# sourceMappingURL=main.js.map' },
		],
	};
	assert.deepEqual(readEmit(emit), { js: '"use strict";\nconst a = 1;\n', map: { version: 3, sources: ['main.ts'], mappings: 'AAAA' } });
	assert.deepEqual(readEmit({ outputFiles: [] }), { js: null, map: null });
	assert.deepEqual(readEmit(undefined), { js: null, map: null });
	assert.equal(readEmit({ outputFiles: [{ name: 'main.js.map', text: '{bad' }] }).map, null);
	assert.deepEqual(readEmit({ outputFiles: [{ text: 'nameless' }, null, { name: 'main.js', text: 'a;\n' }] }), { js: 'a;\n', map: null }, 'a file without a name is skipped');
	assert.deepEqual(readEmit({ outputFiles: 'not a list' }), { js: null, map: null });
});

test("combineWithHarness: the reader keeps its lines, the harness in its own namespace (opened on a line of its own), check() declared at its end", () => {
	const ended = combineWithHarness('a\nb\n', 'H1\nH2\n');
	assert.equal(ended.harnessStartLine, 4);
	assert.equal(ended.harnessEndLine, 5);
	assert.equal(ended.source, `a\nb\n${HARNESS_SCOPE_OPEN}\nH1\nH2\n${CHECK_DECLARATION}\n${HARNESS_SCOPE_CLOSE}\n`);
	assert.equal(ended.source.split('\n')[ended.harnessStartLine - 1], 'H1', 'the harness line keeps its columns');
	assert.equal(ended.source.split('\n')[ended.harnessEndLine - 1], 'H2');

	const open = combineWithHarness('a\nb', 'H1');
	assert.equal(open.harnessStartLine, 4);
	assert.equal(open.harnessEndLine, 4);
	assert.equal(open.source, `a\nb\n${HARNESS_SCOPE_OPEN}\nH1\n${CHECK_DECLARATION}\n${HARNESS_SCOPE_CLOSE}\n`, 'the opening line ends a last reader line without a newline');

	assert.equal(combineWithHarness('', 'H1').harnessStartLine, 2, 'no code: the opening line is line 1');
	assert.equal(combineWithHarness('a\n\n', 'H1').harnessStartLine, 4, "a blank line of the reader's stays");
	const none = combineWithHarness('a\n');
	assert.equal(none.source, `a\n${HARNESS_SCOPE_OPEN}\n${CHECK_DECLARATION}\n${HARNESS_SCOPE_CLOSE}\n`, 'no harness: the declaration only');
	assert.equal(none.harnessEndLine, none.harnessStartLine - 1, 'no harness lines');

	const ownCheck = combineWithHarness('a\n', 'function check(n: string, g: unknown, e: unknown) {}\n');
	assert.doesNotMatch(ownCheck.source, /declare function check/, 'a harness with its own check gets no second one');
	assert.match(ownCheck.source, /\}\n$/, 'the namespace is still closed');
});

test('positionAt: an offset as 1-based line and column, clamped to the text', () => {
	const text = 'ab\ncde\n\nf';
	assert.deepEqual(positionAt(text, 0), { lineNumber: 1, column: 1 });
	assert.deepEqual(positionAt(text, 2), { lineNumber: 1, column: 3 }, 'the end of line 1');
	assert.deepEqual(positionAt(text, 3), { lineNumber: 2, column: 1 });
	assert.deepEqual(positionAt(text, 7), { lineNumber: 3, column: 1 }, 'an empty line');
	assert.deepEqual(positionAt(text, 8), { lineNumber: 4, column: 1 });
	assert.deepEqual(positionAt(text, 99), { lineNumber: 4, column: 2 }, 'past the end: the end');
	assert.deepEqual(positionAt(text, -5), { lineNumber: 1, column: 1 });
	assert.deepEqual(positionAt('', 0), { lineNumber: 1, column: 1 });
});

test('harnessDefinesCheck: a definition of check, not a call or a longer name', () => {
	assert.equal(harnessDefinesCheck('function check(name: string) {}'), true);
	assert.equal(harnessDefinesCheck('  declare function check(n: string): void;'), true);
	assert.equal(harnessDefinesCheck('const check = (n: string) => {};'), true);
	assert.equal(harnessDefinesCheck('check("adds", add(2, 3), 5);'), false);
	assert.equal(harnessDefinesCheck('function checkAll() {}'), false);
});

test('diagnosticsToLocations: errors and warnings of the reader\'s code, as run-error locations', () => {
	const diagnostics = [
		{ line: 2, column: 7, endLine: 2, endColumn: 8, message: "Type 'string' is not assignable to type 'number'.", category: 'error', code: 2322, kind: 'semantic' },
		{ line: 3, column: 1, endLine: 5, endColumn: 2, message: 'Spans lines.', category: 'warning', code: 1, kind: 'semantic' },
		{ line: 4, column: 1, endLine: 4, endColumn: 4, message: 'A suggestion.', category: 'suggestion', code: 80001, kind: 'semantic' },
		{ line: 1, column: 1, endLine: 1, endColumn: 4, message: 'In the harness.', category: 'error', code: 2344, kind: 'semantic', inHarness: true },
	];
	assert.deepEqual(diagnosticsToLocations(diagnostics), [
		{ line: 2, column: 7, endColumn: 8, message: "Type 'string' is not assignable to type 'number'.", severity: 'error', stage: 'compile' },
		{ line: 3, column: 1, endColumn: null, message: 'Spans lines.', severity: 'warning', stage: 'compile' },
	]);
	assert.deepEqual(diagnosticsToLocations(undefined), []);
});

test('readerLineMapper: a JavaScript line to the TypeScript line; null without a mapping', () => {
	// JS line 1: nothing; line 2 → TS line 1; line 3 → TS line 4
	const map = { version: 3, sources: ['main.ts'], names: [], mappings: ';AAAA;AAGA' };
	const mapLine = readerLineMapper(map);
	assert.equal(mapLine(1), null);
	assert.equal(mapLine(2), 1);
	assert.equal(mapLine(3), 4);
	assert.equal(readerLineMapper(null)(2), null, 'no map: nothing to map');
});

test("readerLineMapper: with a column, the segment the column falls in (TypeScript's lines joined into one)", () => {
	// JS line 2: column 1 → TS line 2; column 16 (0-based 15) → TS line 4
	const map = { version: 3, sources: ['main.ts'], names: [], mappings: ';AACA,eAEA' };
	const mapLine = readerLineMapper(map);
	assert.equal(mapLine(2), 2, 'no column: the line where the statement starts');
	assert.equal(mapLine(2, 1), 2);
	assert.equal(mapLine(2, 15), 2, 'before the second segment');
	assert.equal(mapLine(2, 16), 4, 'in the second segment');
	assert.equal(mapLine(2, null), 2, 'a null column (errorLocations has none) counts as none');
	assert.equal(mapLine(1, 5), null, 'a line without a mapping, with or without a column');
});

test('isTypeScriptModel: by Monaco language id', () => {
	assert.equal(isTypeScriptModel({ getLanguageId: () => 'typescript' }), true);
	assert.equal(isTypeScriptModel({ getLanguageId: () => 'javascript' }), false);
	assert.equal(isTypeScriptModel(null), false);
});

test('compileTypeScript: plain words when there is no worker or no JavaScript', async () => {
	const model = { uri: { toString: () => 'inmemory://x/main.ts' }, getValue: () => 'const a = 1;\n' };
	const noWorker = { typescript: { getTypeScriptWorker: () => Promise.reject('TypeScript not registered!') } };
	await assert.rejects(compileTypeScript(noWorker, model, { retryDelaysMs: [] }), { message: WORDS.notReady });
	const silentWorker = {
		getSyntacticDiagnostics: async () => [],
		getSemanticDiagnostics: async () => [],
		getEmitOutput: async () => ({ outputFiles: [], emitSkipped: true }),
	};
	const noOutput = { typescript: { getTypeScriptWorker: async () => async () => silentWorker } };
	await assert.rejects(compileTypeScript(noOutput, model), { message: WORDS.noOutput });
	const withModels = {
		...noOutput,
		Uri: { parse: (text) => new FakeUri(text) },
		editor: { createModel: (text, languageId, uri) => new FakeModel(text, languageId, uri) },
	};
	await assert.rejects(compileReaderSource(withModels, 'const a = 1;\n'), { message: WORDS.noOutput }, "a text: the same words as a model's");
	assert.equal((await compileTypeScriptSource(withModels, 'x;\n')).js, null, 'a harness may emit nothing (it is only emitted)');
});

// ---- Monaco's real TypeScript worker ----

test('real worker: a valid program compiles without diagnostics and runs in node', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const code = [
		'type Pair = [string, number];',
		'const pairs: Pair[] = [["a", 1], ["b", 2]];',
		'class Counter { count = 0; add(n: number): this { this.count += n; return this; } }',
		'const counts = new Map<string, number>(pairs);',
		'const total = [...counts.values()].reduce((sum, n) => sum + n, 0);',
		'console.log(new Counter().add(total).count, counts.size, [1, 2, 3].at(-1));',
		'',
	].join('\n');
	const { js, map, diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(diagnostics, []);
	assert.doesNotMatch(js, /sourceMappingURL/, 'the source-map comment is dropped');
	assert.match(js, /^"use strict";\nObject\.defineProperty\(exports, "__esModule"/, 'a CommonJS module');
	assert.match(js, /class Counter \{\n\s+count = 0;/, 'ES2022: class fields stay native');
	assert.equal(map.version, 3);
	assert.deepEqual(map.sources, ['main.ts']);
	const result = runInNode({ 'main.js': js });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, '3 2 3\n');
});

test('real worker: a type error and a syntax error, at their lines, with TypeScript\'s words; JavaScript is still emitted', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const typed = await compileTypeScript(monaco, createModel('const ok = 1;\nconst n: number = "x";\n'));
	assert.equal(typed.diagnostics.length, 1);
	const { message, ...place } = typed.diagnostics[0];
	assert.deepEqual(place, { line: 2, column: 7, endLine: 2, endColumn: 8, category: 'error', code: 2322, kind: 'semantic' });
	assert.equal(message, "Type 'string' is not assignable to type 'number'.");
	assert.match(typed.js, /const n = "x";/, 'emitted anyway, as tsc does');

	const broken = await compileTypeScript(monaco, createModel('console.log(1);\nconst a = ;\n', 'inmemory://code-editor/r2/typescript/main.ts'));
	assert.equal(broken.diagnostics[0].kind, 'syntax');
	assert.equal(broken.diagnostics[0].line, 2);
	assert.equal(broken.diagnostics[0].code, 1109);
	assert.equal(typeof broken.js, 'string');
});

test('real worker: strict mode — an implicit any and a possibly-undefined value are errors', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const code = 'function twice(x) { return x * 2; }\nconst found = [1, 2].find((n) => n > 1);\nconsole.log(found.toFixed(1), twice(2));\n';
	const { diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(
		diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.code]),
		[
			[1, 7006],
			[3, 18048],
		],
	);
});

test('real worker: two editors declaring the same names do not clash (every file is a module)', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const first = createModel('function solve(n: number) { return n; }\nconst input = 1;\nconsole.log(solve(input));\n', 'inmemory://code-editor/r1/typescript/main.ts');
	const second = createModel('function solve(s: string) { return s; }\nconst input = "x";\nconsole.log(solve(input));\n', 'inmemory://code-editor/r2/typescript/main.ts');
	assert.deepEqual((await compileTypeScript(monaco, first)).diagnostics, []);
	assert.deepEqual((await compileTypeScript(monaco, second)).diagnostics, []);
});

test('real worker: the helper types work without an import, and fail exactly where a type test fails', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const code = [
		'type t1 = Expect<Equal<1, 1>>;',
		'type t2 = Expect<Equal<1, 2>>;',
		'type t3 = Expect<Equal<any, unknown>>;',
		'type t4 = Expect<IsAny<any>>;',
		'type t5 = Expect<IsUnknown<unknown>>;',
		'type t6 = Expect<IsUnknown<any>>;',
		'type t7 = Expect<NotEqual<string, number>>;',
		'type t8 = Expect<Equal<Debug<{ a: 1 } & { b: 2 }>, { a: 1; b: 2 }>>;',
		'type t9 = [Expect<Equal<ReturnType<() => string>, string>>, Expect<NotEqual<never, any>>];',
		'',
	].join('\n');
	const { diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(
		diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.code]),
		[
			[2, 2344],
			[3, 2344],
			[6, 2344],
		],
	);
	assert.match(diagnostics[0].message, /Type 'false' does not satisfy the constraint 'true'/);
});

test('real worker: Node globals type-check (require, process, module, __dirname); a DOM-free Node program runs', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const code = [
		"const input: string = require('fs').readFileSync(0, 'utf8');",
		'const args: string[] = process.argv.slice(2);',
		'module.exports = { args };',
		'console.log(typeof __dirname, typeof __filename, input.trim().length, args.length);',
		'if (process.env.NEVER_SET) process.exit(3);',
		'',
	].join('\n');
	const { js, diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(diagnostics, []);
	const result = runInNode({ 'main.js': js });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, 'string string 0 0\n');
});

test('real worker: the common Node idioms type-check (require.main === module, setImmediate, process.hrtime(), require.resolve, global) and run', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const code = [
		'function main(): void {',
		'  const start: [number, number] = process.hrtime();',
		'  const elapsed = process.hrtime(start);',
		'  const handle = setImmediate(() => console.log("later", elapsed.length));',
		'  if (process.env.NEVER_SET) clearImmediate(handle);',
		"  console.log(typeof require.resolve('fs'), typeof global.setTimeout, require.main === module, process.hrtime.bigint() > 0n);",
		'}',
		'if (require.main === module) main();',
		'',
	].join('\n');
	const { js, diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(diagnostics, []);
	const result = runInNode({ 'main.js': js });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, 'string function true true\nlater 2\n');
});

test("real worker: the newest Node's built-ins are known (ES2023's toSorted, findLast, with, toReversed; the browser's globals Node has too); ES2024's are not", { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const code = [
		'const sorted = [3, 1, 2].toSorted((a, b) => a - b);',
		'const lastBig = sorted.findLast((n) => n > 1);',
		'const changed = sorted.with(0, 9).toReversed();',
		"for (const [key, value] of new URLSearchParams('a=1')) console.log(key, value);",
		"console.log(sorted, lastBig, changed, new TextEncoder().encode('x').length);",
		"setTimeout(() => console.log(new URL('https://example.com/x').pathname), 0);",
		'',
	].join('\n');
	const { js, diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(diagnostics, [], 'no "change your lib" errors, no implicit any in their callbacks');
	assert.doesNotMatch(js, /__classPrivateFieldGet|_a\.call/, 'the emit is untouched (the target decides it)');
	const result = runInNode({ 'main.js': js });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout, 'a 1\n[ 1, 2, 3 ] 3 [ 3, 2, 9 ] 1\n/x\n');

	const newer = await compileTypeScript(monaco, createModel('const groups = Object.groupBy([1, 2], (n: number) => n % 2);\nconst ready = Promise.withResolvers<number>();\n', 'inmemory://code-editor/r2/typescript/main.ts'));
	assert.deepEqual(newer.diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.code]), [[1, 2550], [2, 2550]], 'Node 21 and 22 built-ins: still errors, as on Node 20.11.1');
});

test("real worker: a top-level await is kept (its own kind, the site's words) though the page ignores its codes; another ignored code is left out", { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	assert.deepEqual(monaco.typescript.typescriptDefaults.getDiagnosticsOptions().diagnosticCodesToIgnore, [...TOP_LEVEL_AWAIT_CODES], 'no squiggle in the editor');
	const code = 'const n: number = "x";\nconst a = await Promise.resolve(1);\nfor await (const b of [1]) console.log(a, b, n);\n';
	const { js, diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(
		diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.code, diagnostic.kind]),
		[
			[1, 2322, 'semantic'],
			[2, 1378, KIND_TOP_LEVEL_AWAIT],
			[3, 1432, KIND_TOP_LEVEL_AWAIT],
		],
	);
	assert.equal(diagnostics[1].message, WORDS.topLevelAwait, 'not "set the module option", which the reader cannot reach');
	assert.match(js, /const a = await Promise\.resolve\(1\);/, 'emitted as written');
	const defaults = monaco.typescript.typescriptDefaults;
	defaults.diagnosticsOptions = { ...defaults.diagnosticsOptions, diagnosticCodesToIgnore: [...TOP_LEVEL_AWAIT_CODES, 2322] };
	const ignoring = await compileTypeScript(monaco, createModel(code, 'inmemory://code-editor/r2/typescript/main.ts'));
	assert.deepEqual(ignoring.diagnostics.map((diagnostic) => diagnostic.code), [1378, 1432]);
});

test('real worker: the diagnostics are counted in the text the worker read, even when the reader types while it works', { skip: skipReal }, async () => {
	const setup = realSetup();
	const text = 'const ok = 1;\nconst n: number = "x";\n';
	const model = setup.createModel(text);
	const getWorker = setup.monaco.typescript.getTypeScriptWorker;
	setup.monaco.typescript.getTypeScriptWorker = async () => async (uri) => typingWhileItWorks(await (await getWorker())(uri), model, '// two lines\n// typed above\n');
	const { diagnostics, source } = await compileTypeScript(setup.monaco, model);
	assert.equal(source, text, 'the text the worker was asked about');
	assert.match(model.getValue(), /^\/\/ two lines/, 'the model did change meanwhile');
	assert.deepEqual(
		diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.column, diagnostic.code]),
		[[2, 7, 2322]],
		'line 2 of that text, not line 4 of the edited model',
	);
});

test("real worker: Node's stack trace for the emitted JavaScript maps back to the reader's TypeScript line", { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const code = [
		'interface Order { id: number; items: string[] }', // 1 (no JavaScript)
		'type Id = Order["id"];', // 2 (no JavaScript)
		'', // 3
		'function firstItem(order: Order): string {', // 4
		'  const item = order.items[0];', // 5
		'  if (item === undefined) {', // 6
		'    throw new Error(`order ${order.id} is empty`);', // 7
		'  }', // 8
		'  return item;', // 9
		'}', // 10
		'', // 11
		'const id: Id = 7;', // 12
		'console.log(firstItem({ id, items: [] }));', // 13
		'',
	].join('\n');
	const { js, map, diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(diagnostics, []);
	const result = runInNode({ 'main.js': js });
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Error: order 7 is empty/);
	const frame = firstFrameIn(result.stderr, 'main.js');
	assert.ok(frame, result.stderr);
	assert.notEqual(frame.line, 7, 'the JavaScript line differs (the interface and type are gone)');
	assert.equal(readerLineMapper(map)(frame.line), 7, 'the throw is line 7 of the TypeScript');
	// The frames with a column: the throw in firstItem, then its caller (the header line has no column).
	const callerFrame = [...result.stderr.matchAll(/main\.js:(\d+):\d+/g)].map((match) => Number(match[1]))[1];
	assert.equal(readerLineMapper(map)(callerFrame), 13, 'the call on line 13');
});

test("real worker: a call written over several lines (as a formatter writes it): Node's column finds the argument that failed", { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const code = [
		'const totals: any = undefined;', // 1
		'function show(label: string, value: number): void {', // 2
		'  console.log(label, value);', // 3
		'}', // 4
		'show(', // 5
		'  "sum",', // 6
		'  totals.sum,', // 7: the TypeError
		');', // 8
		'',
	].join('\n');
	const { js, map, diagnostics } = await compileTypeScript(monaco, createModel(code));
	assert.deepEqual(diagnostics, []);
	assert.match(js, /show\("sum", totals\.sum\);/, 'TypeScript joins the arguments into one JavaScript line');
	const result = runInNode({ 'main.js': js });
	assert.match(result.stderr, /TypeError: Cannot read properties of undefined/);
	const frame = firstFrameIn(result.stderr, 'main.js');
	assert.equal(readerLineMapper(map)(frame.line, frame.column), 7, 'with the column: the argument on line 7');
	assert.equal(readerLineMapper(map)(frame.line), 5, 'by the line alone: where the call starts');
});

test('real worker: diagnostic codes the page ignores are left out, as Monaco leaves out their squiggles', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const defaults = monaco.typescript.typescriptDefaults;
	defaults.diagnosticsOptions = { ...defaults.diagnosticsOptions, diagnosticCodesToIgnore: [2322] };
	const { diagnostics } = await compileTypeScript(monaco, createModel('const n: number = "x";\n'));
	assert.deepEqual(diagnostics, []);
});

// ---- an exercise's type check ----

const READER_ADD = 'function add(a: number, b: number): number {\n  return a + b;\n}\n';
const HARNESS_ADD = 'type t = [Expect<Equal<ReturnType<typeof add>, number>>];\ncheck("adds", add(2, 3), 5);\ncheck("adds negatives", add(-2, -3), -5);\n';

test('real worker: typeCheckOnly — a passing exercise, in a temporary model that is disposed afterwards', { skip: skipReal }, async () => {
	const { monaco, createModel, models, workerRequests } = realSetup();
	const reader = createModel(READER_ADD);
	const result = await typeCheckOnly(monaco, reader, HARNESS_ADD);
	assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
	assert.equal(result.errorCount, 0);
	assert.equal(result.harnessStartLine, 5, "after the reader's three lines and the namespace's opening line");
	assert.equal(reader.getValue(), READER_ADD, "the reader's model is untouched");
	const temporary = models.filter((model) => model !== reader);
	assert.equal(temporary.length, 1);
	assert.equal(temporary[0].isDisposed(), true, 'the temporary model is disposed');
	assert.match(workerRequests.at(-1)[0], /^inmemory:\/\/code-editor-check\/\d+\/check\.ts$/);
	assert.equal(result.js, undefined, 'a type check only: nothing to run');
});

test('real worker: typeCheckOnly — a failing type test is in the harness (its own line), a type error in the reader\'s code at the reader\'s line', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const wrongType = createModel('function add(a: number, b: number) {\n  return `${a + b}`;\n}\n');
	const failed = await typeCheckOnly(monaco, wrongType, HARNESS_ADD);
	assert.equal(failed.ok, false);
	assert.deepEqual(
		failed.diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.code, diagnostic.inHarness]),
		[
			[1, 2344, true],
			[2, 2345, true],
			[3, 2345, true],
		],
		"line 1 of the harness: the type test; lines 2-3: check() wants the reader's type (string) for the expected 5 and -5",
	);

	const readerError = createModel('function add(a: number, b: number): number {\n  return a + b + "";\n}\n', 'inmemory://code-editor/r9/typescript/main.ts');
	const result = await typeCheckOnly(monaco, readerError, HARNESS_ADD);
	assert.equal(result.ok, false);
	assert.deepEqual(result.diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.code, diagnostic.inHarness]), [[2, 2322, false]]);
	assert.deepEqual(diagnosticsToLocations(result.diagnostics).map((location) => location.line), [2], "a location for the reader's line only");
});

test("real worker: prepareTypeScriptCheck — the reader's own diagnostics, so an open block is reported in the reader's code, not only at the end of the harness", { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const open = await prepareTypeScriptCheck(monaco, createModel('function add(a: number, b: number): number {\n  return a + b;\n', 'inmemory://code-editor/o1/typescript/main.ts'), HARNESS_ADD);
	assert.deepEqual(
		open.readerDiagnostics.map((diagnostic) => [diagnostic.line, diagnostic.code, diagnostic.kind]),
		[[3, 1005, 'syntax']],
		"'}' expected at the end of the reader's own code",
	);
	assert.equal(open.typeCheck.ok, false);
	assert.equal(open.typeCheck.diagnostics.every((diagnostic) => diagnostic.inHarness), true, 'the combined file places it after the harness');
	assert.deepEqual(open.typeCheck.diagnostics.map((diagnostic) => diagnostic.line), [null], 'on a line the combined file adds: no harness line to name');

	const fine = await prepareTypeScriptCheck(monaco, createModel(READER_ADD, 'inmemory://code-editor/o2/typescript/main.ts'), HARNESS_ADD);
	assert.deepEqual(fine.readerDiagnostics, []);
	assert.equal(fine.typeCheck.ok, true);
});

test("real worker: typeCheckSource — the harness's names shadow the reader's (no clash, as at run time), a reader's own check() is fine, no ASI across the two", { skip: skipReal }, async () => {
	const { monaco } = realSetup();
	const placesOf = async (reader, harness) => (await typeCheckSource(monaco, reader, harness)).diagnostics.map((diagnostic) => [diagnostic.line, diagnostic.code, diagnostic.inHarness]);
	const LAST = 'function last<T>(items: T[]): T | undefined {\n  return items.at(-1);\n}\n';
	assert.deepEqual(await placesOf(`${LAST}const fromNumbers = last([4, 5]);\n`, 'const fromNumbers = last([1, 2, 3]);\ncheck("numbers", fromNumbers, 3);\n'), [], 'the same const in both');
	assert.deepEqual(await placesOf('function check(s: string) { return s.length > 0; }\nfunction filled(s: string) { return check(s); }\n', 'check("filled", filled("a"), true);\n'), [], "the reader's own function check");
	assert.deepEqual(await placesOf(`${LAST}console.log(last([1, 2, 3]))`, '[[1, 2], [3]].forEach((xs) => check("last", last(xs), xs[xs.length - 1]));\n'), [], 'no semicolon, then a harness starting with [');
	assert.deepEqual(await placesOf(`${LAST}console.log(last([1]))`, '(() => check("one", last([1]), 1))();\n'), [], '… or with (');
	assert.deepEqual(await placesOf('let total = 1;\n', 'var total = 2;\ncheck("total", total, 2);\n'), [], "a harness var beside a reader's let");
	assert.deepEqual(await placesOf('const a = 1;\n', 'declare function check(name: string, got: unknown, expected: unknown): void;\ncheck("a", a, 1);\n'), [], "the harness's own declare function check");
	assert.deepEqual(await placesOf('const a = 1;\ncheck("a", a, 1);\n', 'check("a", a, 1);\n'), [[2, 2304, false]], "the reader's code cannot call check(): at run time it cannot either");
	assert.deepEqual(await placesOf('const a = await Promise.resolve(1);\n', 'check("a", a, 1);\n'), [[1, 1378, false]], "a top-level await in the reader's code: an error in a check");
});

test("real worker: prepareTypeScriptCheck describes ONE text, the click's, even when the code changes while it waits", { skip: skipReal }, async () => {
	const setup = realSetup();
	const harness = 'type t = [Expect<Equal<ReturnType<typeof add>, number>>];\ncheck("adds", add(2, 3), 5);\n';
	const clicked = 'function add(a: number, b: number) {\n  return `${a + b}`;\n}\n';
	const reader = setup.createModel(clicked);
	const getWorker = setup.monaco.typescript.getTypeScriptWorker;
	let requests = 0;
	setup.monaco.typescript.getTypeScriptWorker = async () => {
		requests += 1;
		if (requests === 2) reader.setValue(READER_ADD); // "Use this solution" while the check waits for the worker
		return getWorker();
	};
	const prepared = await prepareTypeScriptCheck(setup.monaco, reader, harness);
	assert.equal(reader.getValue(), READER_ADD, 'the model did change meanwhile');
	assert.equal(prepared.readerCode, clicked);
	assert.equal(prepared.typeCheck.ok, false, "the clicked code's type test fails");
	assert.match(prepared.readerJs, /return `\$\{a \+ b\}`;/, 'and the clicked code is what runs, not the solution');
	assert.equal(setup.models.filter((model) => model !== reader).every((model) => model.isDisposed()), true, 'every temporary model is disposed');

	const fromText = await prepareTypeScriptCheck(setup.monaco, READER_ADD, harness);
	assert.equal(fromText.typeCheck.ok, true, 'a text works as a model does');
	assert.match(fromText.readerJs, /return a \+ b;/);
	assert.deepEqual(fromText.readerDiagnostics, []);
});

test('real worker: typeCheckOnly — a harness with its own check() gets no second declaration', { skip: skipReal }, async () => {
	const { monaco, createModel } = realSetup();
	const harness = 'function check(name: string, got: unknown, expected: unknown): void {\n  console.log(name, got === expected);\n}\ncheck("adds", add(2, 3), 5);\n';
	const result = await typeCheckOnly(monaco, createModel(READER_ADD), harness);
	assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
});

// ---- real answers of a Piston server ----

test("a real server's answer: Node 20's frames for the browser-emitted JavaScript map back to the TypeScript lines", () => {
	const run = serverFixture('typescript-run-throw');
	assert.equal(run.status, 200);
	assert.equal(run.response.run.stdout, '1 3\n', 'ES2022 code (Map, Array.prototype.at) ran on Node 20 as main.js');
	assert.match(run.response.run.stderr, /Error: order 7 is empty/);
	const mapLine = readerLineMapper(run.map);
	assert.deepEqual(frameLines(run.response.run.stderr, 'main.js').map(mapLine), [7, 14], 'the throw (line 7) and the call (line 14) of the TypeScript');
	assert.equal(run.typescript.split('\n')[6].trim(), 'throw new Error(`order ${order.id} is empty`);');
});

test("a real server's answer: an exercise check through exercise.js's layout — the first check ran, then the reader's throw maps to the reader's line", () => {
	const check = serverFixture('typescript-check-throw');
	assert.equal(check.status, 200);
	assert.equal(check.typeCheckOk, true);
	assert.deepEqual(check.request.files.map((file) => file.name), ['main.js', 'solution.js']);
	assert.match(check.response.run.stdout, /^@@check@@ \{"name":"adds","pass":true/, 'the first check ran before the throw');
	const readerFrames = frameLines(check.response.run.stderr, 'solution.js');
	assert.deepEqual(readerFrames.map(readerLineMapper(check.readerMap)), [2], "solution.js: the reader's line 2, through the reader's own source map");
	assert.equal(frameLines(check.response.run.stderr, 'main.js').length, 1, "the harness's call is in main.js, never mapped to the reader");
});

test("a real server's answer: errorLocations (lib/codeRunner/errorLocations.js) with readerLineMapper gives the rows the reader sees", { skip: skipErrorLocations }, () => {
	const run = serverFixture('typescript-run-throw');
	assert.deepEqual(errorLocations(run.response, { language: 'typescript', fileName: 'main.js', mapLine: readerLineMapper(run.map) }), [
		{ line: 7, column: null, endColumn: null, message: 'Error: order 7 is empty', severity: 'error', stage: 'run' },
	]);

	const check = serverFixture('typescript-check-throw');
	const options = { language: 'typescript', fileName: 'solution.js' };
	assert.deepEqual(errorLocations(check.response, { ...options, mapLine: readerLineMapper(check.readerMap) }), [
		{ line: 2, column: null, endColumn: null, message: 'RangeError: negative', severity: 'error', stage: 'run' },
	]);
	assert.equal(errorLocations(check.response, options)[0].line, 5, "without the mapper: a line of the emitted JavaScript, not the reader's");
});

// ---- with the exercise library (lib/codeRunner/exercise.js) ----

test("CHECK_DECLARATION is the exercise library's TYPESCRIPT_CHECK_DECLARATION (one signature for check())", { skip: exerciseLibrary ? false : 'lib/codeRunner/checkHelpers.js is not there' }, () => {
	assert.equal(CHECK_DECLARATION, exerciseLibrary.checkHelpers.TYPESCRIPT_CHECK_DECLARATION.trim());
});

test('real worker: compileTypeScriptSource emits a harness that uses names it cannot see, in a temporary model', { skip: skipReal }, async () => {
	const { monaco, models } = realSetup();
	const { js, diagnostics } = await compileTypeScriptSource(monaco, 'type t = [Expect<Equal<1, 1>>];\ncheck("adds", add(2, 3), 5);\n');
	assert.match(js, /check\("adds", add\(2, 3\), 5\);/);
	assert.doesNotMatch(js, /Expect/, 'types are erased');
	assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 2304), "alone, add and check are unknown names (that is why it is only emitted)");
	assert.equal(models.every((model) => model.isDisposed()), true);
});

test("real worker: prepareTypeScriptCheck + exercise.js's layout — the check runs in node, a reader's throw maps to the reader's line", { skip: skipExercise }, async () => {
	const { buildCheckFiles, parseCheckResults } = exerciseLibrary.exercise;
	const { monaco, createModel } = realSetup();
	const harness = 'type t = [Expect<Equal<ReturnType<typeof add>, number>>];\ncheck("adds", add(2, 3), 5);\ncheck("adds negatives", add(-2, -3), -5);\n';
	const runCheck = async (readerCode, uri) => {
		const prepared = await prepareTypeScriptCheck(monaco, createModel(readerCode, uri), harness);
		const built = buildCheckFiles({ language: 'typescript', readerCode: prepared.readerJs, harness: prepared.harnessJs });
		const files = Object.fromEntries(built.files.map((file) => [file.name, file.content]));
		return { prepared, built, result: runInNode(files) };
	};

	const passing = await runCheck(READER_ADD, 'inmemory://code-editor/x1/typescript/main.ts');
	assert.equal(passing.prepared.typeCheck.ok, true, JSON.stringify(passing.prepared.typeCheck.diagnostics));
	assert.equal(passing.built.runLanguage, 'javascript');
	assert.equal(passing.built.readerFileName, 'solution.js');
	assert.equal(passing.result.status, 0, passing.result.stderr);
	const parsed = parseCheckResults(passing.result.stdout);
	assert.equal(parsed.passed, 2);
	assert.equal(parsed.total, 2);

	const throwing = await runCheck('function add(a: number, b: number): number {\n  if (a < 0) throw new RangeError("negative");\n  return a + b;\n}\n', 'inmemory://code-editor/x2/typescript/main.ts');
	assert.equal(throwing.prepared.typeCheck.ok, true);
	assert.notEqual(throwing.result.status, 0);
	const frame = firstFrameIn(throwing.result.stderr, 'solution.js');
	assert.ok(frame, throwing.result.stderr);
	assert.equal(readerLineMapper(throwing.prepared.readerMap)(frame.line), 2, "the throw: the reader's line 2, through the reader's own source map");
});
