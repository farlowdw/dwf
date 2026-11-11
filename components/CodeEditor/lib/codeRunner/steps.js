/**
 * steps.js — reading the `steps` prop of <CodeEditor>: a walk through the code one step at a
 * time ("Step 2 of 4", Prev / Next), each step highlighting some lines and showing a note under
 * the code. Pure; no React, no DOM, no Monaco. (The step bar is
 * shared/components/CodeEditor/StepBar.jsx; the line spec rules are lineSpec.js.)
 *
 * WHAT AN AUTHOR WRITES
 *   steps={[
 *     { lines: '1-3', note: 'The function takes a list `nums`.' },
 *     { lines: [5, [7, 9]], title: 'The loop', note: 'Each pass adds `x` to `total`.' },
 *   ]}
 *   lines   which lines the step highlights: a line spec (5, '3-5,8', [3, [5, 7]]), in the
 *           lines the reader sees (after the magic comments are removed)
 *   note    the words under the code; inline `code` in backticks is drawn as code (StepBar)
 *   title   optional: a few words shown with "Step 2 of 4"
 *
 * THE RESULT (normalizeSteps)
 *   [{ ranges, note, title }, …] in the author's order: `ranges` from lineSpec.js >
 *   parseLineSpec (sorted, merged, clamped to `lineCount`), `note` a trimmed string, `title` a
 *   trimmed string or null. Readers count steps from 1 ("Step 1 of 3", <CodeRef step={1}>):
 *   step n is index n - 1 of the result.
 *
 * WHAT IS DROPPED OR FIXED (one warning each, through `warn`; never a throw)
 *   - `steps` that is not an array: one warning, [] (undefined / null: [] without a warning);
 *   - an entry that is not an object, has no `lines`, or whose lines name no line of the code:
 *     DROPPED — the steps after it move up a number, so a <CodeRef step> may need changing;
 *   - a missing note, or one that is not a string: the step stays, with an empty note;
 *   - a title that is not a string: the step stays, without a title ('' is no title, silently);
 *   - a key a step does not have (`line`, `text` …): a warning naming it (usually a typo).
 *
 * HOW TO CHANGE IT
 *   The keys a step has: STEP_KEYS. The warning words: WORDS. A rule: the function of that rule
 *   below. How `lines` is read: lineSpec.js.
 */

import { parseLineSpec } from './lineSpec.js';

/** The prefix of every warning, so the console says where it comes from. */
const WARNING_PREFIX = 'CodeEditor steps:';

/** The keys a step may have. */
const STEP_KEYS = Object.freeze(['lines', 'note', 'title']);

/** The warnings (each but notAList follows "step N", N the entry's place in the author's list, from 1). */
const WORDS = Object.freeze({
	notAList: 'the prop was ignored: `steps` is a list, [{ lines, note, title }, …].',
	notAnObject: 'was skipped: a step is an object, { lines, note, title }.',
	noLines: 'was skipped: it has no `lines` (the lines it highlights, e.g. \'3-5\').',
	noUsableLines: 'was skipped: its `lines` name no line of the code.',
	noteMissing: 'has no `note` (the words under the code): it shows none.',
	noteNotText: 'has a `note` that is not text: it shows none.',
	titleNotText: 'has a `title` that is not text: it shows none.',
	unknownKeys: (keys) => `has ${keys.map((key) => `\`${key}\``).join(', ')}, which a step does not have (it has ${STEP_KEYS.join(', ')}).`,
});

/** console.warn, looked up when called (so a test may replace console.warn). */
function consoleWarn(message) {
	console.warn(message);
}

/** Is this a plain object (not null, not an array)? */
function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** What every warning about the step at `index` (0-based in the author's list) starts with. */
function stepLabel(index) {
	return `${WARNING_PREFIX} step ${index + 1}`;
}

/** The step's note: trimmed text, or '' (with a warning when it is missing or not text). */
function readNote(entry, say) {
	if (typeof entry.note === 'string') return entry.note.trim();
	say(entry.note === undefined || entry.note === null ? WORDS.noteMissing : WORDS.noteNotText);
	return '';
}

/** The step's title: trimmed text, or null (with a warning when it is there but not text). */
function readTitle(entry, say) {
	if (entry.title === undefined || entry.title === null) return null;
	if (typeof entry.title !== 'string') {
		say(WORDS.titleNotText);
		return null;
	}
	const title = entry.title.trim();
	return title === '' ? null : title;
}

/** A warning for the keys of `entry` a step does not have. */
function checkKeys(entry, say) {
	const unknown = Object.keys(entry).filter((key) => !STEP_KEYS.includes(key));
	if (unknown.length > 0) say(WORDS.unknownKeys(unknown));
}

/** One entry of `steps` as { ranges, note, title }, or null when it is dropped (the rules are in the header). */
function readStep(entry, index, { lineCount, warn }) {
	const say = (ending) => warn(`${stepLabel(index)} ${ending}`);
	if (!isPlainObject(entry)) {
		say(WORDS.notAnObject);
		return null;
	}
	checkKeys(entry, say);
	if (entry.lines === undefined || entry.lines === null) {
		say(WORDS.noLines);
		return null;
	}
	const ranges = parseLineSpec(entry.lines, { lineCount, warn, label: `${stepLabel(index)}'s lines` });
	if (ranges.length === 0) {
		say(WORDS.noUsableLines);
		return null;
	}
	return { ranges, note: readNote(entry, say), title: readTitle(entry, say) };
}

/**
 * The editor's steps from the `steps` prop: [{ ranges, note, title }, …] (the rules are in this
 * file's header). Options: `lineCount` (the lines of the code the reader sees; unknown: no
 * clamping) and `warn` (called once per problem; default console.warn).
 */
export function normalizeSteps(steps, { lineCount, warn = consoleWarn } = {}) {
	if (steps === undefined || steps === null) return [];
	if (!Array.isArray(steps)) {
		warn(`${WARNING_PREFIX} ${WORDS.notAList}`);
		return [];
	}
	const normalized = [];
	steps.forEach((entry, index) => {
		const step = readStep(entry, index, { lineCount, warn });
		if (step !== null) normalized.push(step);
	});
	return normalized;
}
