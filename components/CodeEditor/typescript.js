/**
 * typescript.js — TypeScript in the reader's browser: Monaco's own TypeScript (5.9, inside the
 * self-hosted Monaco) checks the code as the reader types — type errors, hovers — and compiles it
 * to JavaScript, which then runs on the code runner's newest Node as main.js. Node's error lines
 * are turned back into the reader's TypeScript lines through the emitted source map
 * (lib/codeRunner/sourceMap.js). No React; every function takes the `monaco` / `model`
 * objects it works on, so __tests__/typescript.test.js runs them with fakes and with Monaco's
 * real TypeScript worker.
 *
 *     configureTypeScript(monaco);                               // in each editor's beforeMount
 *     const { js, map, diagnostics, source } = await compileTypeScript(monaco, model);
 *     const same = await compileReaderSource(monaco, code);      // a text, in a temporary model
 *     const mapLine = readerLineMapper(map);                     // (main.js line, column) → TypeScript line
 *     const { ok, diagnostics } = await typeCheckOnly(monaco, model, harness);   // or typeCheckSource(monaco, code, harness)
 *     const { typeCheck, readerJs, readerMap, readerDiagnostics, harnessJs } = await prepareTypeScriptCheck(monaco, model, harness);
 *
 * THE CHECKER'S SETTINGS (configureTypeScript; PAGE-WIDE, one set for every editor)
 *   TypeScript editors: semantic checking ON (real type errors), COMPILER_OPTIONS: strict,
 *   target ES2022, CommonJS modules, a source map, and moduleDetection 'force': every reader's
 *   file is its own module, so two editors on a page (or two languages' models) that both
 *   declare `function solve` no longer clash ("Duplicate function implementation" was why
 *   checking had been off). The emitted JavaScript then starts with "use strict" and an
 *   `exports.__esModule` line, which Node runs as main.js unchanged.
 *   The built-ins the checker knows (`lib`, TS_LIB_NEWEST_NODE) follow the NEWEST NODE the code
 *   runs on, not the emit target: Node 20.11.1 has ES2023's toSorted, findLast, with and
 *   toReversed, so they are no type errors, while ES2024's Object.groupBy and
 *   Promise.withResolvers (Node 21 and 22) still are. The emitted JavaScript is the same with
 *   or without it (the target decides that), so the output stays ES2022.
 *   Top-level await (TOP_LEVEL_AWAIT_CODES): TypeScript calls it an error under CommonJS and
 *   tells the reader to change the 'module' option, which they cannot reach; Run supports it
 *   instead (typescriptRun.js), so those codes join the page's diagnosticCodesToIgnore (the
 *   codes the page ignores already are kept) and the misleading squiggle goes.
 *   JavaScript editors: semantic checking stays OFF, as before (the browser's globals and no
 *   modules there; the code runner reports real errors).
 *   Plus the declaration files of typescriptLibs.js (the Expect / Equal … helpers and Node's
 *   require, process …). Every change to these settings restarts Monaco's TypeScript worker, so
 *   each one is compared before it is set: only the first editor on a page changes anything
 *   (TS_LIB_NEWEST_NODE is one frozen array, so it compares equal to itself).
 *   This REPLACES monacoSetup.js > configureTypeScriptChecking (which only turned checking off).
 *
 * COMPILING (compileTypeScript)
 *   Asks Monaco's TypeScript worker (monaco.typescript.getTypeScriptWorker(), Monaco 0.55's
 *   top-level namespace, or monaco.languages.typescript before it) for the model's syntax and
 *   type errors and its emitted JavaScript and source map. The JavaScript is emitted even when
 *   there are errors (as tsc does); the caller decides whether to run it. The source-map comment
 *   at its end is dropped (it is the last line, so no line moves).
 *   WHICH TEXT  The model is read (`source` in the result) in the same tick as the three
 *   questions are posted to the worker, after it has been reached: Monaco sends the worker each
 *   edit as it happens, so that is exactly the text the worker answers about, even if the reader
 *   types while it works. The diagnostics' lines and columns are counted in that text (positionAt),
 *   never in the model after the answers come. A caller that wanted the text of an earlier
 *   moment (Run's click) compares it with `source` and, when they differ, compiles that text on
 *   its own (compileReaderSource: the same, for a text, in a temporary model).
 *   The worker exists only once Monaco has seen a TypeScript model and loaded its TypeScript
 *   mode, a moment after the editor appears: until then the call is retried
 *   (WORKER_RETRY_DELAYS_MS), then it fails with WORDS.notReady.
 *
 * AN EXERCISE'S TYPE CHECK (typeCheckOnly / typeCheckSource)
 *   The reader's code and the harness are checked as ONE file in a temporary model
 *   (combineWithHarness): the reader's code first (its lines keep their numbers), then the
 *   harness INSIDE `namespace __dwfTests {` … `}` (HARNESS_SCOPE_OPEN on a line of its own, so
 *   no line's columns move), with a declaration of check() at its end (typescriptLibs.js >
 *   CHECK_DECLARATION; left out when the harness defines check itself). The namespace sees the
 *   reader's top-level names, but its own names shadow them instead of clashing, as at run time,
 *   where the two are separate files: a reader's `const fromNumbers` beside the harness's, or a
 *   reader's own `function check`, is fine. Its opening line also ends a last reader statement
 *   that has no semicolon (a harness starting with `[` or `(` is not read as part of it).
 *   `type`, `interface`, `declare function check` … are allowed in it; `import` and
 *   `declare global` are not (no harness can use them today).
 *   `ok` is true when there is no error — so a type test such as `type t = [Expect<Equal<A, B>>]`
 *   in the harness passes or fails the check. Each diagnostic says whether it is in the harness
 *   (`inHarness`; its line then counts from the harness's first line). One on a line this file
 *   adds (the namespace's two lines, check's declaration) is in the harness with `line` null:
 *   e.g. a block the reader leaves open (a missing '}'), reported where the combined file ends;
 *   the reader's own editor shows it in place.
 *   A top-level await in the reader's code is an error here (WORDS.topLevelAwait): a Check runs
 *   the reader's code as a script, where it cannot work.
 *
 * AN EXERCISE'S RUN (prepareTypeScriptCheck)
 *   The check runs with lib/codeRunner/exercise.js's JavaScript layout, given JavaScript:
 *   the reader's code emitted ALONE (solution.js, so a runtime error maps through its own source
 *   map, readerLineMapper(readerMap)) and the harness emitted alone (main.js). One call does the
 *   type check and both emits. Each emitted file starts with "use strict" and an exports line;
 *   the layout gives solution.js an `exports`, and in main.js they are harmless.
 *   ONE TEXT  The reader's code is read once, when the call is made (the Check button's click),
 *   and the type check, the emit, its source map and the diagnostics all describe that text,
 *   each in a temporary model: edits made while the check waits for the worker change nothing.
 *   It also returns the reader's code's OWN diagnostics (readerDiagnostics, as compileTypeScript
 *   gives them): stop on a syntax error there before checking, as Run does — otherwise an open
 *   block of the reader's shows up in the type check at the end of the combined file, i.e. as
 *   an error "in the harness".
 *
 * A DIAGNOSTIC  { line, column, endLine, endColumn (1-based), message (one text, a chain's parts
 *   on indented lines), category ('error' | 'warning' | 'suggestion' | 'message'), code (TS1005
 *   → 1005), kind ('syntax' | 'semantic' | 'top-level-await') }, sorted by position. Codes in
 *   the page's diagnosticCodesToIgnore are left out, as Monaco leaves out their squiggles —
 *   except a top-level await (TOP_LEVEL_AWAIT_CODES, which configureTypeScript itself ignores):
 *   it is kept, with kind KIND_TOP_LEVEL_AWAIT and the site's words (WORDS.topLevelAwait), so
 *   Run knows to wrap the code (it is neither a syntax error nor a type error there) and a Check
 *   can refuse it.
 *   diagnosticsToLocations turns them into the run-error locations of
 *   lib/codeRunner/errorLocations.js (stage 'compile').
 *
 * HOW TO CHANGE IT
 *   A compiler option: COMPILER_OPTIONS (TypeScript's own numbers: Monaco's enums stop at ES2020;
 *   the worker hands the options to TypeScript as they are). The built-ins: TS_LIB_NEWEST_NODE
 *   — move it up a year (lib.es2024.full.d.ts …) only when a newer Node becomes the code
 *   runner's newest (runtimeChoice.js runs TypeScript there); always a file name of Monaco's
 *   (its worker does not read the short 'es2023'), and a `.full` one (the short file drops the
 *   DOM set: console, timers, URL, iterable URLSearchParams). Which errors JavaScript editors
 *   show: JAVASCRIPT_DIAGNOSTICS. The harness's scope: HARNESS_SCOPE_OPEN / HARNESS_SCOPE_CLOSE.
 *   The helper types and Node globals: typescriptLibs.js. How long to wait for the worker:
 *   WORKER_RETRY_DELAYS_MS. Words: WORDS.
 */

import { originalPositionFor } from './lib/codeRunner/sourceMap.js';
import { CHECK_DECLARATION, EXTRA_LIBS } from './typescriptLibs.js';

/** Every word this file can show (an Error's message, or a diagnostic's: topLevelAwait). */
export const WORDS = Object.freeze({
	notReady: "TypeScript isn't ready in this browser yet. Try again in a moment.",
	noOutput: 'TypeScript produced no JavaScript for this code.',
	topLevelAwait: 'A top-level await does not run in a Check: put this code in an async function and call it.',
});

/** Monaco's language id of a TypeScript model. */
export const TYPESCRIPT_LANGUAGE_ID = 'typescript';

/** TypeScript's own numbers for the options below (ts.ScriptTarget.ES2022, ts.ModuleKind.CommonJS, ts.ModuleDetectionKind.Force, ts.NewLineKind.LineFeed). */
export const TS_TARGET_ES2022 = 9;
export const TS_MODULE_COMMONJS = 1;
export const TS_MODULE_DETECTION_FORCE = 3;
export const TS_NEW_LINE_LF = 1;

/**
 * The built-ins the checker knows (see the header): those of the code runner's newest Node
 * (20.11.1: ES2023, with the DOM set Monaco's full lib brings). A file name of Monaco's, and ONE
 * frozen array, so configureTypeScript finds it already set (compared by reference).
 */
export const TS_LIB_NEWEST_NODE = Object.freeze(['lib.es2023.full.d.ts']);

/** The TypeScript compiler options of every TypeScript editor (see the header). allowNonTsExtensions is Monaco's own default, kept. */
export const COMPILER_OPTIONS = Object.freeze({
	allowNonTsExtensions: true,
	strict: true,
	target: TS_TARGET_ES2022,
	lib: TS_LIB_NEWEST_NODE,
	module: TS_MODULE_COMMONJS,
	moduleDetection: TS_MODULE_DETECTION_FORCE,
	sourceMap: true,
	newLine: TS_NEW_LINE_LF,
});

/**
 * TypeScript's codes for a top-level await under CommonJS: TS1378 (`await`) and TS1432
 * (`for await`). See the header: their squiggle is hidden, Run wraps the code, a Check refuses it.
 */
export const TOP_LEVEL_AWAIT_CODES = Object.freeze([1378, 1432]);

/** TypeScript editors: syntax AND type errors. */
export const TYPESCRIPT_DIAGNOSTICS = Object.freeze({ noSemanticValidation: false, noSyntaxValidation: false });

/** JavaScript editors: syntax errors only, as before (see the header). */
export const JAVASCRIPT_DIAGNOSTICS = Object.freeze({ noSemanticValidation: true });

/** A diagnostic's category, by TypeScript's number (Warning 0, Error 1, Suggestion 2, Message 3). */
const CATEGORY_NAMES = Object.freeze(['warning', 'error', 'suggestion', 'message']);
export const CATEGORY_ERROR = 'error';
export const CATEGORY_WARNING = 'warning';

/** A diagnostic's kind: from the parser (syntax), the type checker (semantic), or a top-level await (see the header). */
export const KIND_SYNTAX = 'syntax';
export const KIND_SEMANTIC = 'semantic';
export const KIND_TOP_LEVEL_AWAIT = 'top-level-await';

/** How long to wait before each new try while Monaco's TypeScript worker is not there yet (ms). */
export const WORKER_RETRY_DELAYS_MS = Object.freeze([100, 300, 1000]);

/** Where the temporary models live (typeCheckSource, compileTypeScriptSource; never shown; disposed at once). */
const CHECK_MODEL_ROOT = 'inmemory://code-editor-check';
const CHECK_MODEL_FILE = 'check.ts';

/** The source-map comment at the end of TypeScript's JavaScript. */
const SOURCE_MAP_COMMENT = /\n\/\/# sourceMappingURL=[^\n]*\n?$/;

/** A harness that defines check itself (then CHECK_DECLARATION is not added). */
const HARNESS_DEFINES_CHECK = /^\s*(?:declare\s+)?(?:function|const|let|var)\s+check\b/m;

/** The harness's own scope in the combined file of a type check (see the header); each on a line of its own. */
export const HARNESS_SCOPE_OPEN = 'namespace __dwfTests {';
export const HARNESS_SCOPE_CLOSE = '}';

/** The indent of each further part of a chained diagnostic message. */
const MESSAGE_INDENT = '  ';

/** Counts the temporary models, so each has an address of its own. */
let checkModelCount = 0;

/** Monaco's TypeScript namespace ('monaco.typescript' since 0.55, 'monaco.languages.typescript' before), or null. */
export function typeScriptNamespace(monaco) {
	const namespace = monaco?.typescript ?? monaco?.languages?.typescript;
	if (!namespace || namespace.deprecated) return null;
	return namespace;
}

/** Is every key of `wanted` already that value in `current`? */
function hasValues(current, wanted) {
	return Object.keys(wanted).every((key) => current?.[key] === wanted[key]);
}

/** The codes a diagnostics options object ignores (its diagnosticCodesToIgnore, or none). */
function ignoredCodesIn(options) {
	return Array.isArray(options?.diagnosticCodesToIgnore) ? options.diagnosticCodesToIgnore : [];
}

/**
 * Merge `wanted` into one language's diagnostics options, and add `ignoreCodes` to the codes
 * it ignores (keeping those already there); 1 when that changed them, else 0.
 */
function applyDiagnosticsOptions(defaults, wanted, ignoreCodes = []) {
	if (typeof defaults?.setDiagnosticsOptions !== 'function') return 0;
	const current = typeof defaults.getDiagnosticsOptions === 'function' ? defaults.getDiagnosticsOptions() : {};
	const ignored = ignoredCodesIn(current);
	const missing = ignoreCodes.filter((code) => !ignored.includes(code));
	if (hasValues(current, wanted) && missing.length === 0) return 0;
	const next = { ...current, ...wanted };
	if (missing.length > 0) next.diagnosticCodesToIgnore = [...ignored, ...missing];
	defaults.setDiagnosticsOptions(next);
	return 1;
}

/** Merge `wanted` into one language's compiler options; 1 when that changed them, else 0. */
function applyCompilerOptions(defaults, wanted) {
	if (typeof defaults?.setCompilerOptions !== 'function') return 0;
	const current = typeof defaults.getCompilerOptions === 'function' ? defaults.getCompilerOptions() : {};
	if (hasValues(current, wanted)) return 0;
	defaults.setCompilerOptions({ ...current, ...wanted });
	return 1;
}

/** Add each declaration file the checker does not hold yet (same path, same text); how many were added. */
function addMissingLibs(defaults, libs) {
	if (typeof defaults?.addExtraLib !== 'function') return 0;
	const present = typeof defaults.getExtraLibs === 'function' ? defaults.getExtraLibs() : {};
	let added = 0;
	for (const { filePath, content } of libs) {
		if (present?.[filePath]?.content === content) continue;
		defaults.addExtraLib(content, filePath);
		added += 1;
	}
	return added;
}

/**
 * Set up Monaco's TypeScript and JavaScript checking for the whole page (see the header). Safe to
 * call from every editor's beforeMount: a setting already in place is not set again (a change
 * restarts the worker). Returns how many settings it changed (0 once the page is set up).
 */
export function configureTypeScript(monaco) {
	const namespace = typeScriptNamespace(monaco);
	if (!namespace) return 0;
	let changed = 0;
	changed += applyDiagnosticsOptions(namespace.javascriptDefaults, JAVASCRIPT_DIAGNOSTICS);
	changed += applyDiagnosticsOptions(namespace.typescriptDefaults, TYPESCRIPT_DIAGNOSTICS, TOP_LEVEL_AWAIT_CODES);
	changed += applyCompilerOptions(namespace.typescriptDefaults, COMPILER_OPTIONS);
	changed += addMissingLibs(namespace.typescriptDefaults, EXTRA_LIBS);
	return changed;
}

/** Resolves after `ms` milliseconds. */
function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Monaco's TypeScript worker, synced with the model at `uri` (see the header: retried while it is
 * not there yet). Rejects with WORDS.notReady (the last failure as its cause) — at once when this
 * Monaco has no TypeScript at all (waiting would not change that). Options for the tests:
 * `retryDelaysMs`, `wait`.
 */
export async function getTypeScriptWorkerFor(monaco, uri, { retryDelaysMs = WORKER_RETRY_DELAYS_MS, wait = delay } = {}) {
	const namespace = typeScriptNamespace(monaco);
	if (typeof namespace?.getTypeScriptWorker !== 'function') {
		throw new Error(WORDS.notReady, { cause: new Error('Monaco has no TypeScript worker.') });
	}
	let lastError = null;
	for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
		if (attempt > 0) await wait(retryDelaysMs[attempt - 1]);
		try {
			const getWorker = await namespace.getTypeScriptWorker();
			return await getWorker(uri);
		} catch (error) {
			lastError = error;
		}
	}
	throw new Error(WORDS.notReady, { cause: lastError });
}

/** A TypeScript diagnostic message (a text, or a chain of them) as one text; a chain's parts on indented lines. */
export function flattenMessage(messageText, depth = 0) {
	if (typeof messageText === 'string') return messageText;
	if (!messageText || typeof messageText !== 'object') return '';
	let text = messageText.messageText ?? '';
	const parts = Array.isArray(messageText.next) ? messageText.next : [];
	for (const next of parts) {
		text += `\n${MESSAGE_INDENT.repeat(depth + 1)}${flattenMessage(next, depth + 1)}`;
	}
	return text;
}

/** The category's name for TypeScript's number (an unknown number counts as an error). */
function categoryName(category) {
	return CATEGORY_NAMES[category] ?? CATEGORY_ERROR;
}

/** The diagnostic codes the page asked Monaco to ignore (typescriptDefaults' diagnosticCodesToIgnore). */
function ignoredCodesOf(monaco) {
	const defaults = typeScriptNamespace(monaco)?.typescriptDefaults;
	const options = typeof defaults?.getDiagnosticsOptions === 'function' ? defaults.getDiagnosticsOptions() : {};
	return new Set(options?.diagnosticCodesToIgnore ?? []);
}

/**
 * The 1-based { lineNumber, column } of a character offset in `text` (clamped to the text), as
 * a Monaco model's getPositionAt counts it; lines end with '\n' (the editor's models do).
 */
export function positionAt(text, offset) {
	const clamped = Math.max(0, Math.min(offset, text.length));
	const before = text.slice(0, clamped);
	const lineStart = before.lastIndexOf('\n') + 1;
	return { lineNumber: before.split('\n').length, column: clamped - lineStart + 1 };
}

/** Is this raw diagnostic a top-level await (see the header)? */
function isTopLevelAwait(raw) {
	return TOP_LEVEL_AWAIT_CODES.includes(raw.code);
}

/** One worker diagnostic as this file's shape (see the header), its offsets turned into lines and columns of `source`, the text the worker read. */
function toDiagnostic(source, raw, kind) {
	const start = raw.start ?? 0;
	const length = raw.length ?? 1;
	const from = positionAt(source, start);
	const to = positionAt(source, start + length);
	const topLevelAwait = isTopLevelAwait(raw);
	return {
		line: from.lineNumber,
		column: from.column,
		endLine: to.lineNumber,
		endColumn: to.column,
		message: topLevelAwait ? WORDS.topLevelAwait : flattenMessage(raw.messageText),
		category: categoryName(raw.category),
		code: raw.code,
		kind: topLevelAwait ? KIND_TOP_LEVEL_AWAIT : kind,
	};
}

/** Is this raw diagnostic about `fileName` (or about no file in particular)? */
function isAboutFile(raw, fileName) {
	return !raw.file || raw.file.fileName === fileName;
}

/** Before or after, by line then column. */
function byPosition(a, b) {
	return a.line - b.line || a.column - b.column;
}

/** Is this raw diagnostic one the result leaves out (another file's, or a code the page ignores; never a top-level await)? */
function isLeftOut(raw, fileName, ignoredCodes) {
	if (!isAboutFile(raw, fileName)) return true;
	return ignoredCodes.has(raw.code) && !isTopLevelAwait(raw);
}

/** The worker's diagnostics for the model's text `source`: this file's shape, ignored codes left out, sorted. */
function collectDiagnostics(source, fileName, rawByKind, ignoredCodes) {
	const diagnostics = [];
	for (const [kind, raws] of rawByKind) {
		for (const raw of raws ?? []) {
			if (isLeftOut(raw, fileName, ignoredCodes)) continue;
			diagnostics.push(toDiagnostic(source, raw, kind));
		}
	}
	return diagnostics.sort(byPosition);
}

/** The source map's JSON text as an object, or null. */
function parseMap(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** Does this emitted file's name end with `ending`? (A file without a name never does.) */
function hasNameEnding(file, ending) {
	return typeof file?.name === 'string' && file.name.endsWith(ending);
}

/** The JavaScript (source-map comment dropped) and the source map of an emit, each null when missing. */
export function readEmit(emitOutput) {
	const files = Array.isArray(emitOutput?.outputFiles) ? emitOutput.outputFiles : [];
	const jsFile = files.find((file) => hasNameEnding(file, '.js'));
	const mapFile = files.find((file) => hasNameEnding(file, '.js.map'));
	return {
		js: jsFile ? jsFile.text.replace(SOURCE_MAP_COMMENT, '\n') : null,
		map: mapFile ? parseMap(mapFile.text) : null,
	};
}

/** Diagnostics and emit of one model, from the worker: { js, map, diagnostics, source } (see the header: WHICH TEXT). */
async function compileModel(monaco, model, workerOptions) {
	const worker = await getTypeScriptWorkerFor(monaco, model.uri, workerOptions);
	const fileName = model.uri.toString();
	// Read in the same tick as the three questions below are posted: the text they are about.
	const source = model.getValue();
	const [syntactic, semantic, emitOutput] = await Promise.all([
		worker.getSyntacticDiagnostics(fileName),
		worker.getSemanticDiagnostics(fileName),
		worker.getEmitOutput(fileName),
	]);
	const rawByKind = [
		[KIND_SYNTAX, syntactic],
		[KIND_SEMANTIC, semantic],
	];
	return { ...readEmit(emitOutput), source, diagnostics: collectDiagnostics(source, fileName, rawByKind, ignoredCodesOf(monaco)) };
}

/** `result` itself, or a rejection with WORDS.noOutput when TypeScript emitted no JavaScript. */
function requireOutput(result) {
	if (result.js === null) throw new Error(WORDS.noOutput);
	return result;
}

/**
 * The model's TypeScript compiled in the browser: { js, map, diagnostics, source } (see the
 * header; `source` is the text compiled). Rejects with WORDS.notReady when Monaco's TypeScript
 * worker cannot be reached, and with WORDS.noOutput when TypeScript emitted no JavaScript.
 * `workerOptions`: for the tests.
 */
export async function compileTypeScript(monaco, model, workerOptions) {
	return requireOutput(await compileModel(monaco, model, workerOptions));
}

/** Does the harness define check() itself (see the header)? */
export function harnessDefinesCheck(harness) {
	return HARNESS_DEFINES_CHECK.test(harness);
}

/** How many lines `text` takes: '' none, and a last line left empty by a final newline does not count. */
function lineCountOf(text) {
	if (text === '') return 0;
	return text.replace(/\n$/, '').split('\n').length;
}

/**
 * The reader's code and the harness as one TypeScript file (see the header):
 * { source, harnessStartLine, harnessEndLine } — the reader's lines keep their numbers;
 * HARNESS_SCOPE_OPEN comes next (in place of an empty last line), the harness on
 * harnessStartLine … harnessEndLine (harnessEndLine is harnessStartLine - 1 for no harness),
 * then CHECK_DECLARATION (unless the harness defines check) and HARNESS_SCOPE_CLOSE.
 */
export function combineWithHarness(readerCode, harness = '') {
	const reader = String(readerCode ?? '');
	const harnessText = String(harness ?? '');
	const harnessStartLine = lineCountOf(reader) + 2; // after the reader's lines and the opening line
	const harnessEndLine = harnessStartLine + lineCountOf(harnessText) - 1;
	let source = appendLine(reader, HARNESS_SCOPE_OPEN);
	source = appendLine(source, harnessText);
	if (!harnessDefinesCheck(harnessText)) source = appendLine(source, CHECK_DECLARATION);
	return { source: `${appendLine(source, HARNESS_SCOPE_CLOSE)}\n`, harnessStartLine, harnessEndLine };
}

/** `text` with `line` after it, on a line of its own (no blank line added). */
function appendLine(text, line) {
	if (text === '' || text.endsWith('\n')) return text + line;
	return `${text}\n${line}`;
}

/** Run `work(model)` on a temporary TypeScript model holding `source`; the model is disposed afterwards, whatever happens. */
async function withTemporaryModel(monaco, source, work) {
	checkModelCount += 1;
	const uri = monaco.Uri.parse(`${CHECK_MODEL_ROOT}/${checkModelCount}/${CHECK_MODEL_FILE}`);
	const model = monaco.editor.createModel(source, TYPESCRIPT_LANGUAGE_ID, uri);
	try {
		return await work(model);
	} finally {
		model.dispose();
	}
}

/**
 * A diagnostic of the combined file, placed (see the header): in the reader's code (its own
 * line), in the harness (harness lines count from 1), or on a line combineWithHarness added
 * (in the harness, `line` and `endLine` null).
 */
function placeDiagnostic(diagnostic, { harnessStartLine, harnessEndLine }) {
	const openerLine = harnessStartLine - 1; // HARNESS_SCOPE_OPEN's line: harness line N is combined line openerLine + N
	if (diagnostic.line < openerLine) return { ...diagnostic, inHarness: false };
	if (diagnostic.line === openerLine || diagnostic.line > harnessEndLine) return { ...diagnostic, line: null, endLine: null, inHarness: true };
	return { ...diagnostic, line: diagnostic.line - openerLine, endLine: diagnostic.endLine - openerLine, inHarness: true };
}

/**
 * An exercise's type check: the reader's code (a text) plus the harness as one file (see the
 * header). Resolves { ok, errorCount, diagnostics (each with inHarness), harnessStartLine };
 * rejects with WORDS.notReady when the worker cannot be reached.
 */
export async function typeCheckSource(monaco, readerCode, harness = '', workerOptions) {
	const layout = combineWithHarness(readerCode, harness);
	const result = await withTemporaryModel(monaco, layout.source, (checkModel) => compileModel(monaco, checkModel, workerOptions));
	const diagnostics = result.diagnostics.map((diagnostic) => placeDiagnostic(diagnostic, layout));
	const errorCount = diagnostics.filter((diagnostic) => diagnostic.category === CATEGORY_ERROR).length;
	return { ok: errorCount === 0, errorCount, diagnostics, harnessStartLine: layout.harnessStartLine };
}

/** typeCheckSource for the model's code as it is now (`extraSource`: the harness). */
export async function typeCheckOnly(monaco, model, extraSource = '', workerOptions) {
	return typeCheckSource(monaco, model.getValue(), extraSource, workerOptions);
}

/**
 * Any TypeScript text compiled in a temporary model (an exercise's harness, which uses the
 * reader's names and so is only emitted, never judged on its own): { js, map, diagnostics,
 * source }; `js` null when nothing was emitted.
 */
export async function compileTypeScriptSource(monaco, source, workerOptions) {
	return withTemporaryModel(monaco, String(source ?? ''), (model) => compileModel(monaco, model, workerOptions));
}

/**
 * The reader's code as a TEXT compiled in a temporary model, as compileTypeScript compiles a
 * model (for the code of an earlier moment, a click): rejects the same ways.
 */
export async function compileReaderSource(monaco, source, workerOptions) {
	return requireOutput(await compileTypeScriptSource(monaco, source, workerOptions));
}

/** The reader's code to check: a text as it is, or a model's text now. */
function readerTextOf(modelOrCode) {
	return typeof modelOrCode === 'string' ? modelOrCode : String(modelOrCode?.getValue() ?? '');
}

/**
 * Everything an exercise's Check needs for TypeScript, in one call (see the header). The
 * reader's code is a model (read at once, at the call) or its text:
 *   typeCheck          typeCheckSource's { ok, errorCount, diagnostics } for the reader's code + harness
 *   readerJs           the reader's code emitted alone (solution.js), readerMap its source map
 *   readerDiagnostics  the reader's code's own diagnostics (compileTypeScript's): a syntax
 *                      error there means "fix the code first", as for Run
 *   harnessJs          the harness emitted alone ('' when it emitted nothing)
 *   readerCode         the text all of the above describe (see the header: ONE TEXT)
 * Rejects like compileTypeScript.
 */
export async function prepareTypeScriptCheck(monaco, modelOrCode, harness, workerOptions) {
	const readerCode = readerTextOf(modelOrCode); // before any wait: the text at the click
	const { ok, errorCount, diagnostics } = await typeCheckSource(monaco, readerCode, harness, workerOptions);
	const reader = await compileReaderSource(monaco, readerCode, workerOptions);
	const harnessOutput = await compileTypeScriptSource(monaco, harness, workerOptions);
	return {
		typeCheck: { ok, errorCount, diagnostics },
		readerJs: reader.js,
		readerMap: reader.map,
		readerDiagnostics: reader.diagnostics,
		harnessJs: harnessOutput.js ?? '',
		readerCode,
	};
}

/**
 * A function from a line of the emitted JavaScript (1-based, as Node's errors name it) — and,
 * when known, its column (1-based, the stack frame's) — to the reader's TypeScript line, or null
 * for a line with no mapping ("use strict", the exports line). Hand it to errorLocations as
 * `mapLine`. Pass the column whenever there is one: TypeScript joins a call's arguments or an
 * arrow's body written over several lines into one JavaScript line, and only the column says
 * which of those TypeScript lines failed (lib/codeRunner/sourceMap.js's header).
 */
export function readerLineMapper(map) {
	return (generatedLine, generatedColumn) => {
		const position = originalPositionFor(map, generatedLine, generatedColumn);
		return position ? position.line : null;
	};
}

/** Does this diagnostic become a run-error location (an error or a warning in the reader's code)? */
function isLocationWorthy(diagnostic) {
	if (diagnostic.inHarness) return false;
	return diagnostic.category === CATEGORY_ERROR || diagnostic.category === CATEGORY_WARNING;
}

/**
 * The diagnostics as run-error locations (lib/codeRunner/errorLocations.js's shape):
 * [{ line, column, endColumn, message, severity, stage: 'compile' }] — errors and warnings in the
 * reader's code only; endColumn null when the diagnostic runs onto another line.
 */
export function diagnosticsToLocations(diagnostics) {
	return (diagnostics ?? []).filter(isLocationWorthy).map((diagnostic) => ({
		line: diagnostic.line,
		column: diagnostic.column,
		endColumn: diagnostic.endLine === diagnostic.line ? diagnostic.endColumn : null,
		message: diagnostic.message,
		severity: diagnostic.category === CATEGORY_WARNING ? CATEGORY_WARNING : CATEGORY_ERROR,
		stage: 'compile',
	}));
}

/** Is this model TypeScript (Monaco's language id)? */
export function isTypeScriptModel(model) {
	return typeof model?.getLanguageId === 'function' && model.getLanguageId() === TYPESCRIPT_LANGUAGE_ID;
}
