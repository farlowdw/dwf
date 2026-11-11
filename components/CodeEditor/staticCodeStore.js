/**
 * staticCodeStore.js — what the editor's STATIC VIEW shows (StaticCode.jsx, on a phone or
 * tablet: touchMode.js), as one small store per language: the text, its lines, the folds (each
 * closed or open), the author's marks, the current step's lines and the flash of a <CodeRef>'s
 * lines. It is the static half of what a Monaco text model plus decorations.js hold; the shell
 * reaches it through staticSurface.js, the view reads it through React's useSyncExternalStore
 * (`subscribe` and `getSnapshot` never change identity; a new snapshot object only when
 * something changed, so React draws nothing again for a call that changed nothing). Pure: no
 * React, no DOM, no Monaco, so __tests__/staticCodeStore.test.js drives it with node's timers.
 *
 *     const store = createStaticCodeStore({ text, foldRegions: [[1, 6]] });
 *     store.getSnapshot()   // { text, lines, folds: [{ start, end, open }], lineKinds, stepLines: Set, flash: { lines: Set, token } }
 *     store.setText(text)              // Reset, Clear, "Use this solution": the lines re-split; the folds and marks go
 *     store.setFolds([[1, 6]])         // the author's folds, all closed (checked as folding.js checks them)
 *     store.openFoldsHiding([[4, 4]])  // a <CodeRef>, Go to line: opens exactly the closed folds hiding a line; true when it opened one
 *     store.toggleFold(index)          // a tap on a fold's marker or chevron
 *     store.setMarks({ 3: 'error' })   // the author's marks (decorations.js > set)
 *     store.showStep([[4, 6]])         // the current step's lines (decorations.js > showStep)
 *     store.flash([[4, 6]])            // a flash of FLASH_MS (decorations.js > flash)
 *
 * THE RULES (the same as the Monaco view's, so a phone behaves like a desktop)
 *   - Lines are counted as Monaco counts them: a final newline makes one more, empty line
 *     (splitLines; sizing.js > lineCountOf agrees).
 *   - setText drops the folds and the marks: their line numbers described the old text (the
 *     restored-draft rule of useDrafts.js). The shell sets both again after Reset.
 *   - setFolds checks the regions with the library (lib/codeRunner/folds.js >
 *     normalizeFoldRegions, against sizing.js > lastFoldableLineOf: bad, crossing or too-long
 *     ranges dropped or clamped, each with a console warning through `warn`) and closes them all.
 *     A closed fold hides the lines start+1 … end; a nested fold hides its lines once
 *     (hiddenLinesOf is a Set).
 *   - openFoldsHiding opens exactly the closed folds whose HIDDEN lines include a line of the
 *     ranges (decorations.js > regionsHiding's rule, Monaco's own for revealing the cursor): a
 *     fold whose first, visible line is the target stays closed.
 *   - setMarks keeps a line only when the code has it and its kind is one of decorations.js >
 *     LINE_KINDS; showStep and flash cut their ranges to the code (decorations.js > rangesWithin).
 *   - A flash gets a new token each call (StaticCode.jsx keys the flash band by it, so the same
 *     line flashes again), and ends after FLASH_MS (decorations.js's length; a new flash ends
 *     the one before).
 *
 * HOW TO CHANGE IT  What setText keeps: setText. The fold rules: the library's folds.js (the
 * checks) and foldsHiding (what a reveal opens). The flash's length: decorations.js > FLASH_MS.
 * The timers (`setTimer` / `clearTimer`) and `warn` are arguments for the tests.
 */

import { normalizeFoldRegions } from './lib/codeRunner/folds.js';
import { linesOf } from './lib/codeRunner/lineSpec.js';
import { FLASH_MS, LINE_KINDS, rangesWithin } from './decorations.js';
import { lastFoldableLineOf, lineCountOf } from './sizing.js';

/** No flash: no lines, token 0 (a flash's token is always above 0). */
export const EMPTY_FLASH = Object.freeze({ lines: Object.freeze(new Set()), token: 0 });

/** No marks, no step. */
const NO_KINDS = Object.freeze({});
const NO_LINES = Object.freeze(new Set());

/** console.warn, looked up when called (so a test may replace console.warn). */
function consoleWarn(message) {
	console.warn(message);
}

/** setTimeout / clearTimeout, looked up when called (so a test may pass its own). */
function defaultSetTimer(callback, ms) {
	return setTimeout(callback, ms);
}

function defaultClearTimer(timer) {
	clearTimeout(timer);
}

/** The lines of `text`, as Monaco counts them: '' is one empty line, a final newline makes one more. */
export function splitLines(text) {
	return typeof text === 'string' ? text.split('\n') : [''];
}

/** The lines every CLOSED fold of `folds` hides (start+1 … end), each once. */
export function hiddenLinesOf(folds) {
	const hidden = new Set();
	for (const fold of folds ?? []) {
		if (fold.open) continue;
		for (let line = fold.start + 1; line <= fold.end; line += 1) hidden.add(line);
	}
	return hidden;
}

/** Does this closed fold hide `line` (a line after its first, up to its end)? */
function foldHides(fold, line) {
	return !fold.open && line > fold.start && line <= fold.end;
}

/**
 * The indexes (into `folds`) of the closed folds that hide a line of `ranges` (decorations.js >
 * regionsHiding's rule), in the folds' order, each once.
 */
export function foldsHiding(folds, ranges) {
	const found = new Set();
	const lines = linesOf(ranges);
	(folds ?? []).forEach((fold, index) => {
		if (lines.some((line) => foldHides(fold, line))) found.add(index);
	});
	return [...found];
}

/** The folds of `regions` ([[start, end], …]), all closed. */
function closedFolds(regions) {
	return regions.map(([start, end]) => ({ start, end, open: false }));
}

/** Are these two fold lists the same folds in the same state? */
function sameFolds(a, b) {
	return a.length === b.length && a.every((fold, index) => fold.start === b[index].start && fold.end === b[index].end && fold.open === b[index].open);
}

/** Do these two Sets hold the same members? */
function sameSet(a, b) {
	return a.size === b.size && [...a].every((member) => b.has(member));
}

/** Are these two { [line]: kind } maps the same? */
function sameKinds(a, b) {
	const keysA = Object.keys(a);
	return keysA.length === Object.keys(b).length && keysA.every((key) => a[key] === b[key]);
}

/** The marks the code can carry: a line it has, with a kind decorations.js knows. */
function usableKinds(lineKinds, lineCount) {
	const kept = {};
	for (const [key, kind] of Object.entries(lineKinds ?? {})) {
		const line = Number(key);
		if (Number.isInteger(line) && line >= 1 && line <= lineCount && LINE_KINDS.includes(kind)) kept[line] = kind;
	}
	return kept;
}

/** Every line of `ranges` that the code has, as a Set. */
function linesWithin(ranges, lineCount) {
	return new Set(linesOf(rangesWithin(ranges, lineCount)));
}

/** See the header. */
export function createStaticCodeStore({ text = '', foldRegions = [], lineKinds = {}, warn = consoleWarn, setTimer = defaultSetTimer, clearTimer = defaultClearTimer } = {}) {
	const listeners = new Set();
	let flashTimer = null;
	let flashCount = 0;
	let snapshot = {
		text,
		lines: splitLines(text),
		folds: [],
		lineKinds: usableKinds(lineKinds, lineCountOf(text)),
		stepLines: NO_LINES,
		flash: EMPTY_FLASH,
	};

	/** The author's regions checked against `code` (warnings said through `warn`), all closed. */
	function checkedFolds(regions, code) {
		const checked = normalizeFoldRegions(regions, lastFoldableLineOf(code));
		for (const warning of checked.warnings) warn(warning);
		return closedFolds(checked.regions);
	}

	snapshot.folds = checkedFolds(foldRegions, text);

	function lineCount() {
		return snapshot.lines.length;
	}

	/** A new snapshot with `next` over the current one, and every listener told. */
	function change(next) {
		snapshot = { ...snapshot, ...next };
		for (const listener of [...listeners]) listener();
	}

	function subscribe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}

	function getSnapshot() {
		return snapshot;
	}

	function setText(nextText) {
		const value = typeof nextText === 'string' ? nextText : '';
		if (value === snapshot.text && snapshot.folds.length === 0 && Object.keys(snapshot.lineKinds).length === 0) return;
		change({ text: value, lines: splitLines(value), folds: [], lineKinds: NO_KINDS });
	}

	function setFolds(regions) {
		const folds = checkedFolds(regions ?? [], snapshot.text);
		if (sameFolds(folds, snapshot.folds)) return;
		change({ folds });
	}

	/** Opens the closed folds hiding a line of `ranges`; true when it opened one. */
	function openFoldsHiding(ranges) {
		const indexes = foldsHiding(snapshot.folds, ranges);
		if (indexes.length === 0) return false;
		change({ folds: snapshot.folds.map((fold, index) => (indexes.includes(index) ? { ...fold, open: true } : fold)) });
		return true;
	}

	function toggleFold(index) {
		const fold = snapshot.folds[index];
		if (!fold) return;
		change({ folds: snapshot.folds.map((entry, at) => (at === index ? { ...entry, open: !entry.open } : entry)) });
	}

	function closeFolds() {
		if (snapshot.folds.every((fold) => !fold.open)) return;
		change({ folds: snapshot.folds.map((fold) => ({ ...fold, open: false })) });
	}

	/** The author's marks ({ [line]: kind }), replacing the earlier ones; {} or null takes them off. How many lines carry one. */
	function setMarks(nextKinds) {
		const kinds = usableKinds(nextKinds, lineCount());
		if (!sameKinds(kinds, snapshot.lineKinds)) change({ lineKinds: kinds });
		return Object.keys(kinds).length;
	}

	/** The current step's lines, replacing the previous step's; [] or null takes them off. How many lines. */
	function showStep(ranges) {
		const stepLines = linesWithin(ranges, lineCount());
		if (!sameSet(stepLines, snapshot.stepLines)) change({ stepLines });
		return stepLines.size;
	}

	/** The flash off now. */
	function endFlash() {
		clearTimer(flashTimer);
		flashTimer = null;
		if (snapshot.flash !== EMPTY_FLASH) change({ flash: EMPTY_FLASH });
	}

	/** Flash these lines for FLASH_MS, with a new token (a new flash ends the one before). How many lines. */
	function flash(ranges) {
		endFlash();
		const lines = linesWithin(ranges, lineCount());
		if (lines.size === 0) return 0;
		flashCount += 1;
		change({ flash: { lines, token: flashCount } });
		flashTimer = setTimer(endFlash, FLASH_MS);
		return lines.size;
	}

	function isHidden(line) {
		return hiddenLinesOf(snapshot.folds).has(line);
	}

	return { subscribe, getSnapshot, setText, setFolds, openFoldsHiding, toggleFold, closeFolds, setMarks, showStep, flash, lineCount, isHidden };
}
