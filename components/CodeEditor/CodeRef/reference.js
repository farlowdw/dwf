/**
 * reference.js — what a <CodeRef> (index.jsx) points at, read from its props: the editor's id,
 * the request a click sends it, the tooltip, the words it shows when it has no words of its
 * own, and a warning for each mistake in the props. Pure functions; no React, no DOM (the click
 * itself is goToEditor.js).
 *
 *     readReference({ to: 'two-sum', lines: '10-12' })
 *     → { id: 'two-sum', action: { type: 'lines', ranges: [[10, 12]] }, label: 'lines 10–12',
 *         description: 'Show lines 10–12 in the code editor', warnings: [] }
 *
 * THE RULES
 *   - `to` names the editor (<CodeEditor id="two-sum">): a word without spaces (the registry's
 *     normalizeEditorId, shared/components/CodeEditor/lib/registry). Missing or unusable: id null and a
 *     warning; the component then shows its words as plain text.
 *   - `lines` is a line spec, as the editor's `highlight` takes it: 5, '10-12', '3-5, 8',
 *     [3, [5, 7]]. It is read here by the run library's parser (shared/components/CodeEditor/lib/codeRunner/lineSpec.js
 *     > parseLineSpec, the one every line prop uses) into sorted, merged ranges, and those are
 *     sent: [[10, 12]]. Its warnings (a part that is no line, a line below 1 …) come out at
 *     render, so the author sees them in the build log. This file cannot see the code, so the
 *     ranges are NOT cut to its length: the editor cuts them (shared/components/CodeEditor/
 *     decorations.js > revealLines and flash). A spec that names no line at all gets one more
 *     warning and is left out.
 *   - `step` is the step's number as the reader sees it ("Step 2 of 4"): a whole number from 1,
 *     or the same number as a string (MDX writes step="2"). It is sent as an index from 0
 *     (step 2 → index 1). Anything else gets a warning and is left out.
 *   - Both `lines` and `step`: a warning, and the step wins (a step carries its lines AND its
 *     note).
 *   - Neither (or neither usable): the reference only brings the editor into view (action
 *     null).
 *
 * THE WORDS  WORDS: the tooltip ("Show lines 10–12 in the code editor") and the words shown
 * when the element has no children ("lines 10–12"). The lines are shown as the ranges read
 * from the spec, each range with an en dash, in order: '8,3-5' → 'lines 3–5, 8'; one line is
 * "line 5". The console warnings (for the author, in the build log and the browser's
 * console): WARNINGS, and parseLineSpec's own (they start with LINES_LABEL).
 *
 * HOW TO CHANGE IT
 *   The words: WORDS; the warnings: WARNINGS (and LINES_LABEL, the start of the parser's). A
 *   rule: the small function that carries it (rangesOf, stepIndexOf, targetOf). What a line
 *   spec may look like: shared/components/CodeEditor/lib/codeRunner/lineSpec.js. A new kind of reference: a name in
 *   the registry's ACTION_TYPES, a branch in targetOf, the prop in index.jsx, and its handling
 *   in the editor.
 *   Tests: __tests__/reference.test.js (`npm run test:shared`).
 */

import { ACTION_TYPES, normalizeEditorId } from '../lib/registry/index.js';
import { parseLineSpec } from '../lib/codeRunner/lineSpec.js';

/** The en dash a line range is shown with (10–12). */
const EN_DASH = '–';

/** Every word a reader sees from this file. */
export const WORDS = Object.freeze({
	line: (text) => `line ${text}`,
	lines: (text) => `lines ${text}`,
	step: (number) => `step ${number}`,
	editor: 'the code editor',
	show: (what) => `Show ${what} in the code editor`,
	goTo: (what) => `Go to ${what} in the code editor`,
	goToEditor: 'Go to the code editor',
});

/** Prefix of every warning, so the console says where it comes from. */
const WARNING_PREFIX = 'CodeRef:';

/** What the line spec parser's warnings start with ("CodeRef lines: '3-x' was skipped: …"). */
export const LINES_LABEL = 'CodeRef lines';

/** Every console warning of this file (for the author of a note). */
export const WARNINGS = Object.freeze({
	badTo: (to) =>
		`${WARNING_PREFIX} to=${describeValue(to)} names no editor: give the id of a <CodeEditor id="…"> on this page, e.g. to="two-sum". Its words are shown as plain text.`,
	badLines: (lines) =>
		`${WARNING_PREFIX} lines=${describeValue(lines)} names no line (write 5, "10-12", "3-5, 8" or [3, [5, 7]]), so it was left out.`,
	badStep: (step) => `${WARNING_PREFIX} step=${describeValue(step)} is not a step number (1 is the first step), so it was left out.`,
	both: (to) => `${WARNING_PREFIX} the reference to ${describeValue(to)} gives both lines and step: it goes to the step.`,
});

/** A prop's value as text for a warning: "two sum", [3,[5,7]], {"a":1}, undefined. */
function describeValue(value) {
	if (typeof value === 'string' || (typeof value === 'object' && value !== null)) {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

/** Was the prop given at all? (undefined and null mean "not given".) */
function given(value) {
	return value !== undefined && value !== null;
}

/**
 * The ranges `lines` names ([[start, end], …], sorted and merged; [] when it names none), read
 * by the library's parseLineSpec without a line count (see THE RULES). Its warnings go to `warn`.
 */
export function rangesOf(lines, warn) {
	return parseLineSpec(lines, { warn, label: LINES_LABEL });
}

/** A step number (2, or '2') as its index from 0 (1), or null when it is not a whole number from 1. */
export function stepIndexOf(step) {
	const number = typeof step === 'string' && step.trim() !== '' ? Number(step) : step;
	if (!Number.isInteger(number) || number < 1) return null;
	return number - 1;
}

/** One range in words: [8, 8] → '8'; [3, 5] → '3–5' (an en dash). */
function rangeWords([start, end]) {
	return start === end ? String(start) : `${start}${EN_DASH}${end}`;
}

/** Ranges in words: [[5, 5]] → 'line 5'; [[3, 5], [8, 8]] → 'lines 3–5, 8'. */
export function rangesWords(ranges) {
	const oneLine = ranges.length === 1 && ranges[0][0] === ranges[0][1];
	const text = ranges.map(rangeWords).join(', ');
	return oneLine ? WORDS.line(text) : WORDS.lines(text);
}

/**
 * The request and its words: { action, label, description } — a step when `stepIndex` is a
 * number, else the lines when `ranges` names some, else only the editor (action null).
 */
function targetOf(stepIndex, ranges) {
	if (stepIndex !== null) {
		const words = WORDS.step(stepIndex + 1);
		return { action: { type: ACTION_TYPES.step, index: stepIndex }, label: words, description: WORDS.goTo(words) };
	}
	if (ranges.length > 0) {
		const words = rangesWords(ranges);
		return { action: { type: ACTION_TYPES.lines, ranges }, label: words, description: WORDS.show(words) };
	}
	return { action: null, label: WORDS.editor, description: WORDS.goToEditor };
}

/**
 * A <CodeRef>'s props read: { id, action, label, description, warnings } (see THE RULES).
 * `id` is null when `to` cannot be an editor id (missing, blank, or with a space: whether an
 * editor of that name is on the page is known only at the click, goToEditor.js); `action` is
 * null when the reference only scrolls.
 */
export function readReference({ to, lines, step } = {}) {
	const warnings = [];
	const id = normalizeEditorId(to);
	if (id === null) warnings.push(WARNINGS.badTo(to));

	const stepIndex = given(step) ? stepIndexOf(step) : null;
	if (given(step) && stepIndex === null) warnings.push(WARNINGS.badStep(step));

	const ranges = given(lines) ? rangesOf(lines, (message) => warnings.push(message)) : [];
	if (given(lines) && ranges.length === 0) warnings.push(WARNINGS.badLines(lines));
	if (ranges.length > 0 && stepIndex !== null) warnings.push(WARNINGS.both(id ?? to));

	return { id, ...targetOf(stepIndex, ranges), warnings };
}
