/**
 * typescriptRun.js — what Run and Check do with TypeScript before anything is sent: the code is
 * compiled IN THE BROWSER by Monaco's own TypeScript (typescript.js) and the JavaScript it emits
 * goes to the code runner's newest Node (runtimeChoice.js > BROWSER_COMPILED). No React; it takes
 * the `monaco` / `model` objects it works on, so __tests__/typescriptRun.test.js runs it with
 * fakes.
 *
 *     const compiled = await compileForRun(monaco, model);
 *     // { code: the JavaScript, sent as main.js; mapLine: its lines back to the TypeScript; typeErrorCount; topLevelAwait }
 *     const prepared = await compileForCheck(monaco, model, harness);
 *     // { readerJs, readerMap, harnessJs, typeCheck, mapLine }
 *
 * THE RULES (the orchestrator's decisions of 2026-10-25)
 *   - A SYNTAX error stops the run (or the check) before it is sent: TypeScript's output for a
 *     broken file would only fail in a more confusing way. The promise rejects with a
 *     BlockedRunError: its message ("TypeScript found 2 syntax errors, the first on line 2
 *     (Expression expected.): fix them, then run again." — the first error's line and words, in
 *     source order, so the notice says where even with `hideErrors`) is the failed run's notice,
 *     its `locations` are the "Line N" rows (typescript.js > diagnosticsToLocations). Monaco's
 *     own checking already squiggles them, so they get no second squiggle (runErrors.js).
 *   - TYPE errors do not stop a run, as tsc emits anyway: the code runs, and the status line
 *     ends with "· 2 type errors" (typeErrorCount). In a Check they do count: the check passes
 *     only with no type error in the reader's code plus the harness AND every runtime check
 *     passing (typeCheck, judged by exerciseView.js > checkOutcome).
 *   - Monaco's TypeScript worker not ready (the first seconds after the editor appears, or no
 *     TypeScript in this Monaco): the promise rejects with typescript.js > WORDS.notReady, which
 *     the reader sees as the failed run's notice.
 *   - WHAT RUN SENDS is the code as it was when Run was pressed (compileForRun reads the model at
 *     once, at the call): normally the live model is compiled (the worker has it checked
 *     already); when the reader typed while the worker was still starting, so the text it
 *     compiled is another, that click-time text is compiled again on its own.
 *   - TOP-LEVEL AWAIT (`await` or `for await` outside a function; typescript.js >
 *     KIND_TOP_LEVEL_AWAIT): CommonJS has none, so Run sends the JavaScript inside an async
 *     function (wrapForTopLevelAwait: ASYNC_WRAPPER_START in front of line 1, the "use strict"
 *     line that has no mapping, ASYNC_WRAPPER_END on a new last line, so no mapped line or
 *     column moves and the error rows still name the reader's lines). It is not a type error
 *     there (typeErrorCount leaves it out). A Check runs the reader's code as a script
 *     (lib/codeRunner/exercise.js), where a top-level await can never work and wrapping
 *     would let the tests run before the awaited code ends: the check stops before it is sent,
 *     like a syntax error (a BlockedRunError, WORDS.topLevelAwaitInCheck, its "Line N" rows).
 *
 * HOW TO CHANGE IT
 *   Which diagnostics stop a run: isBlocking. The words: messages.js > syntaxBlockedText, and
 *   WORDS here. The wrapper: ASYNC_WRAPPER_START / ASYNC_WRAPPER_END (keep the start on line 1
 *   and the end on a line of its own). The compiler's options and the check's layout:
 *   typescript.js.
 */

import {
	CATEGORY_ERROR,
	KIND_SEMANTIC,
	KIND_SYNTAX,
	KIND_TOP_LEVEL_AWAIT,
	compileReaderSource,
	compileTypeScript,
	diagnosticsToLocations,
	prepareTypeScriptCheck,
	readerLineMapper,
} from './typescript.js';
import { AGAIN, syntaxBlockedText } from './messages.js';

/** Every word this file shows (as a BlockedRunError's message). */
export const WORDS = Object.freeze({
	topLevelAwaitInCheck: 'A Check cannot run a top-level await: move that code into an async function and call it, then check again.',
});

/** Run's wrapper for a top-level await (see the header): before line 1, and a last line of its own. */
export const ASYNC_WRAPPER_START = '(async () => {';
export const ASYNC_WRAPPER_END = '})();\n';

/**
 * A run or check stopped before it was sent (see the header): the notice as its message (naming
 * the first location's line), the rows as `locations`. `again`: messages.js > AGAIN (what the notice tells the reader to do
 * next). `message`: another notice than the syntax errors' (a top-level await in a Check).
 */
export class BlockedRunError extends Error {
	constructor(locations, again = AGAIN.run, message = syntaxBlockedText(locations.length, again, locations[0] ?? null)) {
		super(message);
		this.name = 'BlockedRunError';
		this.locations = locations;
	}
}

/** Does this diagnostic stop a run (a syntax error, not a warning)? */
export function isBlocking(diagnostic) {
	return diagnostic?.kind === KIND_SYNTAX && diagnostic?.category === CATEGORY_ERROR;
}

/** How many type errors (semantic errors) the diagnostics hold. */
export function typeErrorCountOf(diagnostics) {
	return (diagnostics ?? []).filter((diagnostic) => diagnostic?.kind === KIND_SEMANTIC && diagnostic?.category === CATEGORY_ERROR).length;
}

/** The diagnostics that are a top-level await (see the header). */
function topLevelAwaitsOf(diagnostics) {
	return (diagnostics ?? []).filter((diagnostic) => diagnostic?.kind === KIND_TOP_LEVEL_AWAIT);
}

/** Throw a BlockedRunError when the diagnostics hold a syntax error (see the header). */
function stopOnSyntaxErrors(diagnostics, again) {
	const blocking = (diagnostics ?? []).filter(isBlocking);
	if (blocking.length > 0) throw new BlockedRunError(diagnosticsToLocations(blocking), again);
}

/** Throw a BlockedRunError when the reader's code of a Check holds a top-level await (see the header). */
function stopOnTopLevelAwait(diagnostics) {
	const awaits = topLevelAwaitsOf(diagnostics);
	if (awaits.length > 0) throw new BlockedRunError(diagnosticsToLocations(awaits), AGAIN.check, WORDS.topLevelAwaitInCheck);
}

/**
 * The emitted JavaScript inside an async function that is called at once, so a top-level await
 * runs under CommonJS (see the header): no mapped line or column moves.
 */
export function wrapForTopLevelAwait(js) {
	const body = js.endsWith('\n') ? js : `${js}\n`;
	return `${ASYNC_WRAPPER_START}${body}${ASYNC_WRAPPER_END}`;
}

/**
 * The model compiled as it was at the click (`code`, see the header: WHAT RUN SENDS): the live
 * model while the worker read that same text, else `code` again in a temporary model.
 */
async function compileClickedCode(monaco, model, code) {
	const compiled = await compileTypeScript(monaco, model);
	if (compiled.source === code) return compiled;
	return compileReaderSource(monaco, code);
}

/**
 * The model's TypeScript compiled for Run: { code (the emitted JavaScript, wrapped when it holds
 * a top-level await), mapLine ((line, column) → TypeScript line), typeErrorCount, topLevelAwait
 * (was it wrapped) }. `code`: the text Run was pressed with (by default the model's text now —
 * call this at the click). Rejects with a BlockedRunError on a syntax error, and as
 * typescript.js > compileTypeScript does when the worker is not ready.
 */
export async function compileForRun(monaco, model, code = model.getValue()) {
	const { js, map, diagnostics } = await compileClickedCode(monaco, model, code);
	stopOnSyntaxErrors(diagnostics, AGAIN.run);
	const topLevelAwait = topLevelAwaitsOf(diagnostics).length > 0;
	return {
		code: topLevelAwait ? wrapForTopLevelAwait(js) : js,
		mapLine: readerLineMapper(map),
		typeErrorCount: typeErrorCountOf(diagnostics),
		topLevelAwait,
	};
}

/**
 * The model's TypeScript (or its text) and the exercise's harness prepared for Check
 * (typescript.js > prepareTypeScriptCheck, which reads the model at once — call this at the
 * click): { readerJs, readerMap, harnessJs, typeCheck, mapLine }. Rejects with a BlockedRunError
 * on a syntax error in the READER's code (an open block of theirs would otherwise show up as an
 * error "in the tests") and on a top-level await there (see the header).
 */
export async function compileForCheck(monaco, modelOrCode, harness) {
	const prepared = await prepareTypeScriptCheck(monaco, modelOrCode, harness);
	stopOnSyntaxErrors(prepared.readerDiagnostics, AGAIN.check);
	stopOnTopLevelAwait(prepared.readerDiagnostics);
	return {
		readerJs: prepared.readerJs,
		readerMap: prepared.readerMap,
		harnessJs: prepared.harnessJs,
		typeCheck: prepared.typeCheck,
		mapLine: readerLineMapper(prepared.readerMap),
	};
}
