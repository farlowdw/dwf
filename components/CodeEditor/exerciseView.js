/**
 * exerciseView.js — the pure logic behind an exercise's panels (ExercisePanel.jsx, HintList.jsx):
 * which lines of an output diff to show, what a check run's results add up to, how a check value
 * is written, and how many hints are open. No React, no DOM, no Monaco and no words (each panel
 * keeps its words in its own WORDS), so __tests__/exerciseView.test.js checks all of it. (A
 * hint's inline `code` is split by codeSpans.js, shared with the step notes.)
 *
 * THE OUTPUT DIFF (diffRows)
 *   The library's compareOutput(actual, expected) (lib/codeRunner/exercise.js) gives
 *   { matches, firstDifferentLine, diff: [{ type: 'same' | 'added' | 'removed', text }] }: the
 *   changes that turn the EXPECTED output into the reader's ('removed': a line only the
 *   expected output has; 'added': a line only the reader's has). The panel shows it the other
 *   way round, from the reader's output to the expected one, as the Solution panel diffs the
 *   reader's code into the solution: a line only the reader printed is a REMOVED row (−, red),
 *   a line only the expected output has an ADDED row (+, green), so the reader's text is red
 *   and the target green in both panels (LIBRARY_TO_ROW_KIND flips them; DIFF_SIDES names each
 *   row kind's side once). In each run of changed lines the reader's rows come first, then the
 *   expected ones (as git and Monaco show a changed pair), each in its own order. A small diff
 *   is shown, not the whole output:
 *     - every changed line;
 *     - DIFF_CONTEXT_LINES matching lines before and after each change;
 *     - a run of at least MIN_SKIPPED_LINES other matching lines becomes ONE 'skip' row
 *       ("⋯ 12 matching lines"); a shorter run is shown as it is (a skip row is as tall);
 *     - at most DIFF_MAX_ROWS rows; what is left becomes one 'more' row ("… 30 more lines").
 *   Matching outputs (no change at all) give no rows.
 *
 * A CHECK RUN (checkOutcome)
 *   Check runs the reader's code against the page's harness (`tests`); each helper call prints
 *   one `@@check@@ {…}` line, which the library's parseCheckResults(stdout) reads into
 *   { cases: [{ name, pass, got, expected }], passed, total, otherOutput, finished } (`finished`:
 *   the harness reached its end and printed its "done" line). A TypeScript exercise
 *   also has a type check of the reader's code plus the harness, in the browser
 *   (typescript.js > typeCheckOnly: { ok, errorCount, diagnostics: [{ line, message, category,
 *   inHarness, … }] }; only its errors count). The
 *   check PASSES when the run finished (no compile error, crash or time limit, and the harness
 *   reached its end: a reader's exit() half way is not a pass), every case passed, there is no
 *   type error, and there was something to check (a case, or a type check).
 *
 * HINTS (the design of 2026-10-26)  normalizeHints() (defined in props.js, re-exported
 *   here: props.js is in the page's first download and must not import this file) reads the
 *   `hints` prop (blank or non-string entries dropped, with a console warning). The hints area's
 *   state is one plain object, { open, revealed, folded, announce } (HINTS_START before the
 *   reader touches it), changed only by the functions below (useExercise.js keeps it):
 *     toggleHintsArea   the light bulb: opens or closes the area. The FIRST open reveals hint 1;
 *                       closing keeps everything, so a reopen shows the area exactly as it was.
 *                       The bulb never reveals anything past hint 1.
 *     revealNextHint    "Show hint 3 of 3" under the last revealed hint: one more, unfolded.
 *     toggleHintFold    a hint's eye: folds it to its header row, or unfolds it.
 *     nextHintNumber    the number that button shows, or null once every hint is revealed.
 *     focusAfterReveal  where the keyboard focus goes after a "Show hint" press: it stays on the
 *                       button while more remain, and goes to the last hint's eye once the press
 *                       revealed the last one (the button goes with it).
 *   `announce` is the number of the hint the live region reads out (HintList.jsx): set by a
 *   reveal (the first open, a "Show hint" press), cleared by a close, so a reopen says nothing
 *   new, and by folding that hint, so a hint the reader folded is not left as page text in the
 *   region (a fold itself never speaks: aria-expanded says it). Nothing is saved: a reload
 *   starts closed, and Reset and a language switch leave the state alone.
 *
 * HOW TO CHANGE IT
 *   How much of a diff is shown: DIFF_CONTEXT_LINES, MIN_SKIPPED_LINES, DIFF_MAX_ROWS. Which
 *   library type becomes which row kind (if the library's compareOutput ever flips its
 *   direction): LIBRARY_TO_ROW_KIND; which side each row kind is: DIFF_SIDES. When a check
 *   passes: checkOutcome(). How a value is written: formatCheckValue(). What the light bulb, a
 *   "Show hint" press and an eye do: toggleHintsArea(), revealNextHint(), toggleHintFold(); where
 *   the focus goes after a "Show hint" press: focusAfterReveal(). The
 *   words: the panels' own WORDS (ExercisePanel.jsx, HintList.jsx).
 */

import { RESULT_SUCCESS } from './lib/codeRunner/index.js';

// Defined in props.js (the page's first download needs it, and must not import this file).
export { normalizeHints } from './props.js';

/** Matching lines shown before and after each changed line of an output diff. */
export const DIFF_CONTEXT_LINES = 2;

/** The shortest run of hidden matching lines that becomes a skip row (a shorter run is shown). */
export const MIN_SKIPPED_LINES = 2;

/** The most rows an output diff shows; the rest becomes one 'more' row. */
export const DIFF_MAX_ROWS = 40;

/** The kinds of row diffRows() returns. */
export const ROW_KINDS = Object.freeze({
	same: 'same',
	added: 'added',
	removed: 'removed',
	skip: 'skip',
	more: 'more',
});

/**
 * The row kind of each of the library's diff types (THE OUTPUT DIFF in the header): the panel
 * diffs from the reader's output to the expected one, the library the other way.
 */
export const LIBRARY_TO_ROW_KIND = Object.freeze({
	same: ROW_KINDS.same,
	added: ROW_KINDS.removed,
	removed: ROW_KINDS.added,
});

/** Which side of the comparison each changed row kind is (see the header): the reader's output, or the expected one. */
export const DIFF_SIDES = Object.freeze({
	[ROW_KINDS.removed]: 'yours',
	[ROW_KINDS.added]: 'expected',
});

/** The most type errors a TypeScript check lists; the rest are only counted. */
export const MAX_TYPE_ERRORS_SHOWN = 5;

/** What a check run came to (checkOutcome().state). */
export const CHECK_STATES = Object.freeze({
	passed: 'passed',
	failed: 'failed',
	unfinished: 'unfinished',
	nothingChecked: 'nothing-checked',
});

/** A positive whole line number, or null. */
function lineNumberOf(value) {
	return Number.isInteger(value) && value > 0 ? value : null;
}

/** Is this a diff entry compareOutput gives ({ type, text })? */
function isDiffEntry(entry) {
	return Boolean(entry) && typeof entry.type === 'string' && typeof entry.text === 'string';
}

/** Is this diff entry a changed line (not a matching one)? */
function isChange(entry) {
	return entry.type === ROW_KINDS.added || entry.type === ROW_KINDS.removed;
}

/** A library diff entry with its type as the panel's row kind (LIBRARY_TO_ROW_KIND; an unknown type stays as it is). */
function asRowEntry(entry) {
	const type = Object.hasOwn(LIBRARY_TO_ROW_KIND, entry.type) ? LIBRARY_TO_ROW_KIND[entry.type] : entry.type;
	return { type, text: entry.text };
}

/** A run of changed entries with the reader's lines (removed) first, then the expected ones (added), each in its order. */
function readerLinesFirst(run) {
	const readers = run.filter((entry) => entry.type === ROW_KINDS.removed);
	const expected = run.filter((entry) => entry.type === ROW_KINDS.added);
	return [...readers, ...expected];
}

/** The entries with every run of changed ones put in readerLinesFirst order (matching lines stay where they are). */
function orderChangeRuns(entries) {
	const ordered = [];
	let run = [];
	for (const entry of entries) {
		if (isChange(entry)) {
			run.push(entry);
			continue;
		}
		ordered.push(...readerLinesFirst(run), entry);
		run = [];
	}
	ordered.push(...readerLinesFirst(run));
	return ordered;
}

/** For each entry: is it shown (a change, or within `context` lines of one)? */
function shownEntries(entries, context) {
	const shown = entries.map(isChange);
	entries.forEach((entry, index) => {
		if (!isChange(entry)) return;
		const from = Math.max(0, index - context);
		const to = Math.min(entries.length - 1, index + context);
		for (let near = from; near <= to; near += 1) shown[near] = true;
	});
	return shown;
}

/** The rows of one run of hidden matching lines: a skip row, or the lines themselves when the run is short. */
function hiddenRunRows(run) {
	if (run.length >= MIN_SKIPPED_LINES) return [{ kind: ROW_KINDS.skip, count: run.length }];
	return run.map((entry) => ({ kind: ROW_KINDS.same, text: entry.text }));
}

/** The entries as rows: shown entries as they are, each run of hidden ones through hiddenRunRows. */
function collapseRows(entries, shown) {
	const rows = [];
	let hiddenRun = [];
	entries.forEach((entry, index) => {
		if (!shown[index]) {
			hiddenRun.push(entry);
			return;
		}
		rows.push(...hiddenRunRows(hiddenRun));
		hiddenRun = [];
		rows.push({ kind: entry.type, text: entry.text });
	});
	rows.push(...hiddenRunRows(hiddenRun));
	return rows;
}

/** How many output lines these rows stand for (a skip row stands for its count). */
function linesOf(rows) {
	return rows.reduce((total, row) => total + (row.kind === ROW_KINDS.skip ? row.count : 1), 0);
}

/** At most `maxRows` rows: the rest becomes one 'more' row. */
function capRows(rows, maxRows) {
	if (rows.length <= maxRows) return rows;
	const kept = rows.slice(0, maxRows);
	return [...kept, { kind: ROW_KINDS.more, count: linesOf(rows.slice(maxRows)) }];
}

/**
 * The rows of a small output diff, from the library's compareOutput().diff (see the header):
 * [{ kind, text }] for 'same' / 'added' (expected only) / 'removed' (the reader's only),
 * [{ kind, count }] for 'skip' / 'more'. [] when nothing differs (or no diff).
 */
export function diffRows(diff, { context = DIFF_CONTEXT_LINES, maxRows = DIFF_MAX_ROWS } = {}) {
	const entries = Array.isArray(diff) ? orderChangeRuns(diff.filter(isDiffEntry).map(asRowEntry)) : [];
	if (!entries.some(isChange)) return [];
	return capRows(collapseRows(entries, shownEntries(entries, context)), maxRows);
}

/**
 * A comparison's verdict: null without one, { matches: true }, or { matches: false, line } (the
 * first line that differs, or null when the comparison does not say).
 */
export function outputVerdict(comparison) {
	if (!comparison || typeof comparison !== 'object') return null;
	if (comparison.matches) return { matches: true };
	return { matches: false, line: lineNumberOf(comparison.firstDifferentLine) };
}

/** A value inside an array or object: strings in JSON quotes, arrays and objects with a space after each comma. */
function formatNested(value) {
	if (Array.isArray(value)) return `[${value.map(formatNested).join(', ')}]`;
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${formatNested(item)}`);
		return `{${entries.join(', ')}}`;
	}
	if (value === undefined) return 'undefined';
	return JSON.stringify(value) ?? String(value);
}

/**
 * A check's `got` or `expected` as the reader sees it. A string is shown as it is: the
 * language's helper already wrote it (Python's repr, C's printf …). Anything else (a number, a
 * list the JSON line carried) is written JSON-like: [0, 1], {"a": 1}, true, null.
 */
export function formatCheckValue(value) {
	if (typeof value === 'string') return value;
	return formatNested(value);
}

/** One case of a check run, made safe to draw: { index (1-based), name (or null), pass, got, expected }. */
function caseOf(entry, position) {
	const source = entry && typeof entry === 'object' ? entry : {};
	const name = typeof source.name === 'string' && source.name.trim() !== '' ? source.name : null;
	return {
		index: position + 1,
		name,
		pass: source.pass === true,
		got: formatCheckValue(source.got),
		expected: formatCheckValue(source.expected),
	};
}

/** The cases of a check run's results (parseCheckResults), made safe to draw; [] without results. */
export function checkCases(results) {
	const cases = Array.isArray(results?.cases) ? results.cases : [];
	return cases.map(caseOf);
}

/** { passed, total } of a check run's results: the library's counts, or counted from the cases. */
export function checkTally(results) {
	const cases = checkCases(results);
	const counted = { passed: cases.filter((entry) => entry.pass).length, total: cases.length };
	const passed = Number.isInteger(results?.passed) ? results.passed : counted.passed;
	const total = Number.isInteger(results?.total) ? results.total : counted.total;
	return { passed, total };
}

/** TypeScript's diagnostic category for an error (typescript.js > CATEGORY_ERROR); warnings and suggestions do not fail a check. */
const TYPE_ERROR_CATEGORY = 'error';

/**
 * A type check's errors, as given: typescript.js > typeCheckOnly's `diagnostics` (only those of
 * category 'error'), or a plain `errors` list.
 */
function typeErrorEntries(typeCheck) {
	if (Array.isArray(typeCheck?.diagnostics)) {
		return typeCheck.diagnostics.filter((entry) => (entry?.category ?? TYPE_ERROR_CATEGORY) === TYPE_ERROR_CATEGORY);
	}
	return Array.isArray(typeCheck?.errors) ? typeCheck.errors : [];
}

/** Line `line` (1-based) of `text`, or '' when there is no such line. */
function sourceLineOf(text, line) {
	if (typeof text !== 'string' || line === null) return '';
	return text.replace(/\r\n?/g, '\n').split('\n')[line - 1] ?? '';
}

/**
 * The type errors of a TypeScript check, made safe to draw: [{ message, line, inHarness,
 * lineText }]. `line` is the reader's line, or with inHarness the harness's (counted from its
 * first line), as typeCheckOnly places them; `lineText` is that line's source: the error's own
 * lineText, else read from `sources.readerCode` / `sources.harness` when they are given.
 */
export function typeErrorsOf(typeCheck, sources = {}) {
	return typeErrorEntries(typeCheck).map((error) => {
		const line = lineNumberOf(error?.line);
		const inHarness = error?.inHarness === true;
		const ownText = typeof error?.lineText === 'string' ? error.lineText : null;
		const lineText = ownText ?? sourceLineOf(inHarness ? sources.harness : sources.readerCode, line);
		return { message: String(error?.message ?? ''), line, inHarness, lineText: lineText.trim() };
	});
}

/**
 * What a finished check run came to (see the header):
 *   { state, passed, total, typeErrors (count), finished }
 * state: CHECK_STATES.unfinished (the run did not finish: compile error, crash, time limit, or
 * the harness stopped before its end), nothingChecked (no case and no type check), passed, or
 * failed. Results without `finished` (an older library) count as having reached the end.
 */
export function checkOutcome({ summary, results, typeCheck = null }) {
	const { passed, total } = checkTally(results);
	const typeErrors = typeCheck ? typeErrorsOf(typeCheck).length : 0;
	const harnessReachedEnd = results?.finished !== false;
	const finished = summary?.status === RESULT_SUCCESS && harnessReachedEnd;
	const counts = { passed, total, typeErrors, finished };
	if (!finished) return { state: CHECK_STATES.unfinished, ...counts };
	if (total === 0 && !typeCheck) return { state: CHECK_STATES.nothingChecked, ...counts };
	const allPassed = passed === total && typeErrors === 0;
	return { state: allPassed ? CHECK_STATES.passed : CHECK_STATES.failed, ...counts };
}

/**
 * A check run's error output: the compiler's output when compiling failed, else what the run
 * wrote to stderr (Piston's answer, `response`; the summary's `output` mixes in stdout, which
 * holds the @@check@@ lines) — a crash's traceback, or a warning or the reader's own stderr in
 * a run that finished. '' when there is none.
 */
export function checkErrorOutput(summary, response) {
	if (!summary) return '';
	if (summary.stage === 'compile') return summary.output ?? '';
	const stderr = response?.run?.stderr;
	return typeof stderr === 'string' ? stderr : '';
}

/** Is there anything in this text but white space? */
export function hasText(text) {
	return typeof text === 'string' && text.trim() !== '';
}

/**
 * The hints area before the reader touches it (HINTS in the header): closed, no hint revealed,
 * none folded, nothing to read out.
 *   open      is the area shown (the light bulb pressed)?
 *   revealed  how many hints are revealed, from hint 1 on
 *   folded    the indexes (from 0) of the revealed hints folded to their header row, in order
 *   announce  the number of the hint the live region reads out, or 0 for none
 */
export const HINTS_START = Object.freeze({ open: false, revealed: 0, folded: Object.freeze([]), announce: 0 });

/** How many hints there are: `total` as a whole number, 0 for anything else. */
function hintCount(total) {
	return Number.isInteger(total) && total > 0 ? total : 0;
}

/** How many hints are revealed: `revealed` as a whole number between 0 and `total`. */
export function clampRevealed(revealed, total) {
	if (!Number.isInteger(revealed) || revealed < 0) return 0;
	return Math.min(revealed, hintCount(total));
}

/** The folded indexes that name a revealed hint, once each, in order. */
function foldedWithin(folded, revealed) {
	const list = Array.isArray(folded) ? folded : [];
	const valid = list.filter((index) => Number.isInteger(index) && index >= 0 && index < revealed);
	return [...new Set(valid)].sort((a, b) => a - b);
}

/**
 * `state` made safe for `total` hints: every field present and within bounds (anything else
 * reads as HINTS_START). The functions below and HintList.jsx read the state through it.
 */
export function hintsStateOf(state, total) {
	const source = state && typeof state === 'object' ? state : HINTS_START;
	const revealed = clampRevealed(source.revealed, total);
	const announce = Number.isInteger(source.announce) && source.announce >= 1 && source.announce <= revealed ? source.announce : 0;
	return { open: source.open === true && revealed > 0, revealed, folded: foldedWithin(source.folded, revealed), announce };
}

/**
 * The light bulb (HINTS in the header): opens a closed area — the first time with hint 1
 * revealed and read out, later exactly as it was — or closes an open one, keeping what is
 * revealed and folded. No hints: nothing changes.
 */
export function toggleHintsArea(state, total) {
	const current = hintsStateOf(state, total);
	if (hintCount(total) === 0) return current;
	if (current.open) return { ...current, open: false, announce: 0 };
	if (current.revealed > 0) return { ...current, open: true };
	return { ...current, open: true, revealed: 1, announce: 1 };
}

/**
 * "Show hint 3 of 3": the next hint revealed, unfolded and read out. Only while the area is open
 * and some hint is still hidden; otherwise nothing changes.
 */
export function revealNextHint(state, total) {
	const current = hintsStateOf(state, total);
	if (!current.open || current.revealed >= hintCount(total)) return current;
	const revealed = current.revealed + 1;
	// unfolded: `folded` names revealed hints only, so the new one is never in it
	return { ...current, revealed, announce: revealed };
}

/**
 * A hint's eye: folds revealed hint `index` (from 0) to its header row, or unfolds it. Folding
 * the hint the live region holds empties the region (`announce` 0: the folded text is not left
 * in the page there); unfolding reads nothing out. Any other index: nothing changes.
 */
export function toggleHintFold(state, index, total) {
	const current = hintsStateOf(state, total);
	if (!Number.isInteger(index) || index < 0 || index >= current.revealed) return current;
	if (current.folded.includes(index)) {
		return { ...current, folded: current.folded.filter((other) => other !== index) };
	}
	const folded = foldedWithin([...current.folded, index], current.revealed);
	const announce = current.announce === index + 1 ? 0 : current.announce;
	return { ...current, folded, announce };
}

/** The number of the next hint "Show hint N of M" reveals, or null once every hint is revealed. */
export function nextHintNumber(state, total) {
	const current = hintsStateOf(state, total);
	return current.revealed < hintCount(total) ? current.revealed + 1 : null;
}

/** Where the keyboard focus goes after a "Show hint" press (focusAfterReveal). */
export const FOCUS_AFTER_REVEAL = Object.freeze({
	button: 'button', // it stays on "Show hint N of M" (the same element: the new hint is added above it)
	lastEye: 'lastEye', // the press revealed the last hint and its button goes: the focus moves to that hint's eye
});

/**
 * Where the focus goes after a "Show hint" press, from the state BEFORE the press: to the last
 * hint's eye when the press reveals the last hint, else it stays on the button (also when the
 * press can reveal nothing: the area closed, or every hint revealed).
 */
export function focusAfterReveal(state, total) {
	const current = hintsStateOf(state, total);
	const next = nextHintNumber(current, total);
	const revealsLast = current.open && next !== null && next === hintCount(total);
	return revealsLast ? FOCUS_AFTER_REVEAL.lastEye : FOCUS_AFTER_REVEAL.button;
}
