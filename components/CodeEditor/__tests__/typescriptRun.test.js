/**
 * typescriptRun.test.js — what Run and Check do with TypeScript before anything is sent
 * (../typescriptRun.js), with Monaco's REAL TypeScript worker (./tsHarness.js; skipped when
 * monaco-editor is not installed): a valid program compiles to JavaScript that runs in node and
 * whose error lines map back to the TypeScript; type errors are counted but do not stop a run;
 * a syntax error stops it with "Line N" rows (BlockedRunError, "… then run again." / "… then
 * check again."); a check gets its type check, both emits and the reader's line mapper. Run sends
 * the code of the click even when the reader typed while the worker was starting. A top-level
 * await runs (the JavaScript wrapped in an async function, its error lines still the
 * reader's) and is no type error; in a Check it stops the check with its rows. Also the pure
 * parts (isBlocking, typeErrorCountOf, wrapForTopLevelAwait) and the whole path of a TypeScript
 * run's error: Node's stack → runErrors.js → the reader's line. Run with `npm run test:shared`.
 * To change it: a new rule of ../typescriptRun.js gets a test here, with the real worker.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sentRecord, shownLocations } from '../runErrors.js';
import { RUN_PHASES } from '../runPhases.js';
import { configureTypeScript } from '../typescript.js';
import { WORDS as TS_WORDS } from '../typescript.js';
import {
	ASYNC_WRAPPER_END,
	ASYNC_WRAPPER_START,
	BlockedRunError,
	WORDS,
	compileForCheck,
	compileForRun,
	isBlocking,
	typeErrorCountOf,
	wrapForTopLevelAwait,
} from '../typescriptRun.js';
import { SKIP_REASON, createTypeScriptMonaco, loadTypeScript } from './tsHarness.js';

const loaded = await loadTypeScript();
const skip = loaded ? false : SKIP_REASON;

/** A real-worker setup, configured as a page's first editor would be. */
function realSetup() {
	const setup = createTypeScriptMonaco(loaded.TypeScriptWorker);
	configureTypeScript(setup.monaco);
	return setup;
}

/** Run main.js in this machine's node: Piston's answer shape for runErrors ({ run: { stdout, stderr, code, … } }). */
function runInNode(js) {
	const folder = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'dwf-ts-run-')));
	try {
		writeFileSync(path.join(folder, 'main.js'), js);
		const result = spawnSync(process.execPath, ['main.js'], { cwd: folder, encoding: 'utf8', timeout: 20000 });
		// Piston names the file /box/submission/main.js; node names the temporary folder's: rename it.
		const stderr = result.stderr.split(folder).join('/box/submission');
		return { run: { stdout: result.stdout, stderr, output: result.stdout + stderr, code: result.status, signal: null, status: result.status === 0 ? null : 'RE' } };
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}

test('isBlocking and typeErrorCountOf: syntax errors stop a run, type errors are only counted', () => {
	const syntax = { kind: 'syntax', category: 'error' };
	const type = { kind: 'semantic', category: 'error' };
	const warning = { kind: 'semantic', category: 'warning' };
	assert.equal(isBlocking(syntax), true);
	assert.equal(isBlocking(type), false);
	assert.equal(isBlocking({ kind: 'syntax', category: 'warning' }), false);
	assert.equal(typeErrorCountOf([syntax, type, type, warning]), 2);
	assert.equal(typeErrorCountOf(undefined), 0);
});

test('BlockedRunError: the notice as its message (run or check), the rows as its locations', () => {
	const rows = [{ line: 2 }, { line: 5 }];
	const error = new BlockedRunError(rows);
	assert.equal(error.message, 'TypeScript found 2 syntax errors, the first on line 2: fix them, then run again.');
	assert.equal(error.locations, rows);
	assert.equal(new BlockedRunError([{ line: 1 }], 'check').message, 'TypeScript found a syntax error on line 1: fix it, then check again.');
	assert.equal(
		new BlockedRunError([{ line: 2, message: 'Expression expected.' }]).message,
		'TypeScript found a syntax error on line 2 (Expression expected.): fix it, then run again.',
		"the first error's line and TypeScript's words: the notice says where even with hideErrors",
	);
	assert.equal(
		new BlockedRunError([{ line: 2, message: "Expression expected.\nmore" }, { line: 5, message: "';' expected." }], 'check').message,
		'TypeScript found 2 syntax errors, the first on line 2 (Expression expected.): fix them, then check again.',
		'only the first line of the first message',
	);
	assert.equal(new BlockedRunError([]).message, 'TypeScript found 0 syntax errors: fix them, then run again.', 'no location: no place');
	assert.equal(new BlockedRunError([{ line: null, message: 'x' }]).message, 'TypeScript found a syntax error: fix it, then run again.', 'a location without a line (one the checker added)');
	assert.ok(error instanceof Error);
	assert.equal(new BlockedRunError(rows, 'check', WORDS.topLevelAwaitInCheck).message, WORDS.topLevelAwaitInCheck, 'another notice when given');
});

test('wrapForTopLevelAwait: the opening in front of line 1, the closing on a new last line (no other line moves)', () => {
	const js = '"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nawait 1;\n';
	const wrapped = wrapForTopLevelAwait(js);
	assert.equal(wrapped, `${ASYNC_WRAPPER_START}${js}${ASYNC_WRAPPER_END}`);
	assert.deepEqual(wrapped.split('\n').slice(1, 3), js.split('\n').slice(1, 3), 'lines 2 and 3 unchanged, at the same columns');
	assert.equal(wrapForTopLevelAwait('a;'), `${ASYNC_WRAPPER_START}a;\n${ASYNC_WRAPPER_END}`, 'a last line without a newline gets one');
});

test('real worker: a valid program compiles for Run; type errors are counted, not blocking', { skip }, async () => {
	const { monaco, createModel } = realSetup();
	const clean = await compileForRun(monaco, createModel('const xs = [1, 2, 3];\nconsole.log(xs.at(-1));\n'));
	assert.equal(clean.typeErrorCount, 0);
	assert.equal(typeof clean.mapLine, 'function');
	assert.equal(runInNode(clean.code).run.stdout, '3\n', 'ES2022 output runs on a current Node');
	const typed = await compileForRun(monaco, createModel('const n: number = "x";\nconsole.log(n);\n', 'inmemory://code-editor/r2/typescript/main.ts'));
	assert.equal(typed.typeErrorCount, 1);
	assert.equal(runInNode(typed.code).run.stdout, 'x\n', 'the code runs anyway, as tsc emits anyway');
	assert.equal(clean.topLevelAwait, false);
	assert.ok(!clean.code.startsWith(ASYNC_WRAPPER_START), 'code without a top-level await is sent as emitted');
});

test("real worker: Run sends the code of the click, even when the reader typed while the worker was starting", { skip }, async () => {
	const setup = realSetup();
	const clicked = 'console.log("clicked");\n';
	const model = setup.createModel(clicked);
	const getWorker = setup.monaco.typescript.getTypeScriptWorker;
	let typed = false;
	setup.monaco.typescript.getTypeScriptWorker = async () => {
		if (!typed) {
			typed = true;
			model.setValue('console.log("typed later");\nconst broken = ;\n'); // typed while TypeScript was still loading
		}
		return getWorker();
	};
	const compiled = await compileForRun(setup.monaco, model);
	assert.equal(runInNode(compiled.code).run.stdout, 'clicked\n', 'the click-time code, not the later (broken) text');
	assert.equal(compiled.mapLine(3), 1, "its map is the click-time code's");
	assert.equal(setup.models.filter((other) => other !== model).every((other) => other.isDisposed()), true, 'compiled again in a temporary model, disposed');

	const steady = realSetup();
	const same = steady.createModel(clicked);
	await compileForRun(steady.monaco, same, clicked);
	assert.deepEqual(steady.models, [same], 'no edit meanwhile: the live model only, no second compile');
});

test('real worker: a top-level await runs (wrapped in an async function), is no type error, and its errors keep their TypeScript lines', { skip }, async () => {
	const { monaco, createModel } = realSetup();
	const code = [
		'const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));', // 1
		'async function* numbers() { yield 1; yield 2; }', // 2
		'await sleep(5);', // 3
		'for await (const n of numbers()) console.log(n);', // 4
		'const text: string | undefined = undefined as string | undefined;', // 5
		'console.log(text!.split(","));', // 6: the TypeError
		'',
	].join('\n');
	const compiled = await compileForRun(monaco, createModel(code));
	assert.equal(compiled.topLevelAwait, true);
	assert.equal(compiled.typeErrorCount, 0, 'not "· 1 type error" for code that runs');
	assert.ok(compiled.code.startsWith(`${ASYNC_WRAPPER_START}"use strict";`), 'the opening goes in front of the "use strict" line');
	const response = runInNode(compiled.code);
	assert.equal(response.run.stdout, '1\n2\n');
	assert.match(response.run.stderr, /TypeError: Cannot read properties of undefined/);
	const shown = shownLocations({ phase: RUN_PHASES.done, summary: { status: 'runtime-error' }, response, sent: sentRecord({ language: 'typescript', mapLine: compiled.mapLine }) });
	assert.deepEqual(shown.locations.map((location) => location.line), [6], 'the line of the TypeError, through the source map');

	const rejected = await compileForRun(monaco, createModel('await Promise.reject(new Error("boom"));\n', 'inmemory://code-editor/r2/typescript/main.ts'));
	const failed = runInNode(rejected.code);
	assert.equal(failed.run.code, 1, 'an awaited rejection ends the program as an uncaught error does');
	assert.match(failed.run.stderr, /Error: boom/);
});

test('real worker: a top-level await in a Check stops it before it is sent, with its rows', { skip }, async () => {
	const { monaco, createModel } = realSetup();
	const reader = 'const ready = await Promise.resolve(1);\nfunction add(a: number, b: number): number {\n\treturn a + b + ready - 1;\n}\n';
	await assert.rejects(compileForCheck(monaco, createModel(reader), 'check("add", add(2, 3), 5);\n'), (error) => {
		assert.ok(error instanceof BlockedRunError);
		assert.equal(error.message, WORDS.topLevelAwaitInCheck);
		assert.deepEqual(error.locations.map((location) => [location.line, location.message]), [[1, TS_WORDS.topLevelAwait]]);
		return true;
	});
});

test('real worker: a syntax error stops the run with its rows (a BlockedRunError)', { skip }, async () => {
	const { monaco, createModel } = realSetup();
	await assert.rejects(compileForRun(monaco, createModel('console.log(1);\nconst a = ;\n')), (error) => {
		assert.ok(error instanceof BlockedRunError);
		assert.equal(error.message, 'TypeScript found a syntax error on line 2 (Expression expected.): fix it, then run again.');
		assert.deepEqual(error.locations.map((location) => [location.line, location.stage, location.severity]), [[2, 'compile', 'error']]);
		return true;
	});
});

test("real worker: a TypeScript run's runtime error goes back to the reader's TypeScript line (runErrors.js through the source map)", { skip }, async () => {
	const { monaco, createModel } = realSetup();
	const code = ['type Order = { id: number };', '', 'function first(orders: Order[]): Order {', '\tif (orders.length === 0) {', '\t\tthrow new Error("no orders");', '\t}', '\treturn orders[0];', '}', '', 'console.log(first([]).id);', ''].join('\n');
	const compiled = await compileForRun(monaco, createModel(code));
	const response = runInNode(compiled.code);
	const shown = shownLocations({ phase: RUN_PHASES.done, summary: { status: 'runtime-error' }, response, sent: sentRecord({ language: 'typescript', mapLine: compiled.mapLine }) });
	assert.equal(shown.mark, true);
	assert.deepEqual(shown.locations.map((location) => [location.line, location.message]), [[5, 'Error: no orders']], 'the throw, on its TypeScript line');
});

test('real worker: Check — the type check, both emits and the line mapper; a reader syntax error stops it', { skip }, async () => {
	const { monaco, createModel } = realSetup();
	const reader = 'function add(a: number, b: number): number {\n\treturn a + b;\n}\n';
	const prepared = await compileForCheck(monaco, createModel(reader), 'check("add", add(2, 3), 5);\ntype t = Expect<Equal<ReturnType<typeof add>, number>>;\n');
	assert.equal(prepared.typeCheck.ok, true);
	assert.match(prepared.readerJs, /function add\(a, b\)/);
	assert.match(prepared.harnessJs, /check\("add", add\(2, 3\), 5\)/);
	assert.equal(typeof prepared.mapLine, 'function');
	const failingType = await compileForCheck(monaco, createModel(reader, 'inmemory://code-editor/r3/typescript/main.ts'), 'type t = Expect<Equal<ReturnType<typeof add>, string>>;\n');
	assert.equal(failingType.typeCheck.ok, false, 'a type test that fails fails the check');
	await assert.rejects(compileForCheck(monaco, createModel('function add(a: number {\n', 'inmemory://code-editor/r4/typescript/main.ts'), 'check("x", 1, 1);\n'), (error) => {
		assert.ok(error instanceof BlockedRunError);
		assert.match(error.message, /then check again\.$/);
		return true;
	});
});
