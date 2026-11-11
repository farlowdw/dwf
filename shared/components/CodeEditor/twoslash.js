/**
 * twoslash.js — type queries in a TypeScript editor, as the TypeScript handbook writes them
 * ("twoslash"): a comment line `// ^?` under an expression shows the type TypeScript infers for
 * the code the caret points at, at the end of that comment line, and keeps it up to date while
 * the reader edits.
 *
 *     const total = [1, 2, 3].reduce((sum, n) => sum + n, 0);
 *     //    ^? const total: number                      ← the part after ^? is drawn by Monaco
 *
 * THE RULES (findTypeQueries; pure)
 *   - A query line holds only `//`, spaces and `^?` (QUERY_LINE). Lines are counted from 1.
 *   - The caret's column on its line is the column it points at on the line ABOVE, counted in
 *     characters as twoslash counts them (a tab is one character: indent the comment the same
 *     way as the code above it).
 *   - Stacked queries point past each other: the line a query points at is the nearest line
 *     above it that is not a query line, so two carets under one line ask about two places.
 *   - A caret past the end of that line, or with no line above, points at nothing: the comment
 *     then says WORDS.nothingAtCaret, so the author sees the caret is misplaced.
 *   - Every line is read, even one inside a template string or a block comment (rare enough).
 *
 * THE DISPLAY (applyTypeQueries; Monaco)
 *   One decoration per query, injected text after the comment's last character
 *   (TYPE_QUERY_CLASS, styled in twoslash.module.css with :global, because Monaco decorations
 *   need global class names): TypeScript's quick info for that position (what its hover says
 *   first, e.g. "const total: number"), on one line, at most MAX_TYPE_LENGTH characters. The
 *   cursor does not stop inside it. The queries are asked again TYPE_QUERY_DELAY_MS after the
 *   reader stops typing, when the editor shows another model, and when a model's language
 *   changes; a model that is not TypeScript gets no decorations. An answer that arrives after a
 *   newer edit is dropped. At most MAX_TYPE_QUERIES per model. If Monaco's TypeScript worker
 *   cannot be reached the decorations stay as they were.
 *   Takes the `editor` / `monaco` objects and, optionally, a worker (or a getter of one; none:
 *   Monaco's own), so __tests__/twoslash.test.js runs it with fakes and with Monaco's real
 *   TypeScript worker.
 *
 * HOW TO CHANGE IT
 *   The look: twoslash.module.css (imported once by CodeEditorClient.jsx). The delay, the cap
 *   and the length: the constants below. Words: WORDS.
 */

import { getTypeScriptWorkerFor, isTypeScriptModel } from './typescript.js';

/** Every word this file shows. */
export const WORDS = Object.freeze({
	nothingAtCaret: '(nothing under the ^ here)',
});

/** The decoration's class: GLOBAL (twoslash.module.css declares it with :global). */
export const TYPE_QUERY_CLASS = 'dwf-twoslash-type';

/** The decorations' description (Monaco shows it in its developer tools only). */
const DECORATION_DESCRIPTION = 'dwf-twoslash-type-query';

/** How long after the last edit the queries are asked again (ms). */
export const TYPE_QUERY_DELAY_MS = 300;

/** The most queries answered in one model (each is one question to the worker). */
export const MAX_TYPE_QUERIES = 50;

/** The longest type text shown (characters); a longer one ends with ELLIPSIS. */
export const MAX_TYPE_LENGTH = 160;
const ELLIPSIS = '…';

/** A query line: only //, spaces and ^? (see the header). */
const QUERY_LINE = /^\s*\/\/\s*\^\?\s*$/;

/** The caret of a query line. */
const CARET = '^';

/** Monaco's InjectedTextCursorStops.None (the cursor never stops inside the injected text), when the fake monaco of a test has no enum. */
const CURSOR_STOPS_NONE = 3;

/** Is this line a type query (see the header)? */
export function isTypeQueryLine(text) {
	return QUERY_LINE.test(text);
}

/** The nearest line above `index` (0-based) that is not a query line, or -1. */
function targetLineIndex(lines, index) {
	for (let above = index - 1; above >= 0; above -= 1) {
		if (!isTypeQueryLine(lines[above])) return above;
	}
	return -1;
}

/** One query, from the query line at `index` (0-based) of `lines`. */
function queryAt(lines, index) {
	const caretIndex = lines[index].indexOf(CARET);
	const target = targetLineIndex(lines, index);
	const onCode = target >= 0 && caretIndex < lines[target].length;
	return {
		line: index + 1,
		column: caretIndex + 1,
		targetLine: target >= 0 ? target + 1 : null,
		targetColumn: caretIndex + 1,
		onCode,
	};
}

/**
 * Every type query of `code`, in order (see the header):
 * [{ line, column (the comment line and its caret, 1-based), targetLine, targetColumn (the place
 * asked about; targetLine null when there is no line above), onCode (false: nothing there) }].
 */
export function findTypeQueries(code) {
	const lines = String(code ?? '').split('\n').map((line) => line.replace(/\r$/, ''));
	const queries = [];
	for (let index = 0; index < lines.length; index += 1) {
		if (isTypeQueryLine(lines[index])) queries.push(queryAt(lines, index));
	}
	return queries;
}

/** TypeScript's quick info as one short line ('' when there is none). */
export function typeTextOf(quickInfo) {
	const parts = Array.isArray(quickInfo?.displayParts) ? quickInfo.displayParts : [];
	const text = parts
		.map((part) => part.text)
		.join('')
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= MAX_TYPE_LENGTH) return text;
	return text.slice(0, MAX_TYPE_LENGTH - ELLIPSIS.length) + ELLIPSIS;
}

/** What one query's comment line shows: its type, or WORDS.nothingAtCaret. */
async function textForQuery(worker, model, query) {
	if (!query.onCode) return WORDS.nothingAtCaret;
	const offset = model.getOffsetAt({ lineNumber: query.targetLine, column: query.targetColumn });
	const quickInfo = await worker.getQuickInfoAtPosition(model.uri.toString(), offset);
	return typeTextOf(quickInfo) || WORDS.nothingAtCaret;
}

/** Monaco's decoration for one answered query: injected text at the end of the comment line. */
function decorationFor(monaco, model, query, text) {
	const endColumn = model.getLineMaxColumn(query.line);
	return {
		range: new monaco.Range(query.line, endColumn, query.line, endColumn),
		options: {
			description: DECORATION_DESCRIPTION,
			showIfCollapsed: true,
			after: {
				content: ` ${text}`,
				inlineClassName: TYPE_QUERY_CLASS,
				cursorStops: monaco.editor?.InjectedTextCursorStops?.None ?? CURSOR_STOPS_NONE,
			},
		},
	};
}

/**
 * How to reach the worker for a model's uri: `worker` itself when it is a getter (uri → worker
 * or a promise of one), a fixed worker object (anything with getQuickInfoAtPosition), or by
 * default Monaco's own, through typescript.js > getTypeScriptWorkerFor.
 */
function workerGetter(monaco, worker) {
	if (typeof worker === 'function') return worker;
	if (typeof worker?.getQuickInfoAtPosition === 'function') return async () => worker;
	return (uri) => getTypeScriptWorkerFor(monaco, uri);
}

/**
 * Show the type queries of the editor's TypeScript model and keep them up to date (see the
 * header). `worker`: a getter `(uri) => worker` (or a promise of one), a worker object, or null
 * for Monaco's own TypeScript worker (the normal case: it is synced with each model asked about).
 * Returns { refresh(), dispose() }: refresh asks at once and resolves the texts shown (null when
 * its answer was dropped or failed); dispose removes the decorations and the listeners. Option
 * for the tests: `delayMs`.
 */
export function applyTypeQueries(editor, monaco, worker = null, { delayMs = TYPE_QUERY_DELAY_MS } = {}) {
	const workerFor = workerGetter(monaco, worker);
	const decorations = editor.createDecorationsCollection();
	let timer = null;
	let latest = 0;
	let disposed = false;

	/** Is this answer still wanted (nothing newer asked, same model, same text)? */
	function stillCurrent(request, model, versionId) {
		return !disposed && request === latest && editor.getModel() === model && model.getVersionId() === versionId;
	}

	async function refresh() {
		if (disposed) return null;
		clearTimeout(timer);
		timer = null;
		latest += 1;
		const request = latest;
		const model = editor.getModel();
		const queries = isTypeScriptModel(model) ? findTypeQueries(model.getValue()).slice(0, MAX_TYPE_QUERIES) : [];
		if (queries.length === 0) {
			decorations.clear();
			return [];
		}
		const versionId = model.getVersionId();
		let texts = null;
		try {
			const typeScriptWorker = await workerFor(model.uri);
			texts = await Promise.all(queries.map((query) => textForQuery(typeScriptWorker, model, query)));
		} catch {
			return null;
		}
		if (!stillCurrent(request, model, versionId)) return null;
		decorations.set(queries.map((query, index) => decorationFor(monaco, model, query, texts[index])));
		return texts;
	}

	function schedule() {
		if (disposed) return;
		clearTimeout(timer);
		timer = setTimeout(refresh, delayMs);
	}

	const subscriptions = [editor.onDidChangeModelContent(schedule), editor.onDidChangeModel(schedule), editor.onDidChangeModelLanguage?.(schedule)];
	schedule();

	function dispose() {
		disposed = true;
		clearTimeout(timer);
		for (const subscription of subscriptions) subscription?.dispose?.();
		decorations.clear();
	}

	return { refresh, dispose };
}
