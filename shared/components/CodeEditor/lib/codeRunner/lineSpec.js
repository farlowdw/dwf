/**
 * lineSpec.js — reading a LINE SPEC: the lines an author names in a <CodeEditor> prop
 * (`highlight`, a step's `lines`, <CodeRef lines>) turned into sorted, merged ranges the editor
 * can colour and scroll to. Pure functions; no React, no DOM, no Monaco.
 *
 * WHAT AN AUTHOR MAY WRITE
 *   5              one line
 *   '3-5,8'        a string of parts separated by commas; a part is a line ('8') or a range
 *                  ('3-5', both ends included). Spaces anywhere ('3 - 5, 8'), an en dash
 *                  ('3–5'), and braces around the whole as in a code block's metastring
 *                  ('{3-5,8}') are fine.
 *   [3, [5, 7]]    an array of lines, [start, end] pairs and strings like the one above.
 *                  The array is a LIST: [3, 5] is lines 3 and 5; lines 3 to 5 are [[3, 5]]
 *                  or '3-5'.
 *   The numbers are the lines the READER sees, from 1: after the magic comments are removed
 *   (magicComments.js).
 *
 * THE RESULT (parseLineSpec)
 *   [[start, end], …] sorted by start, overlapping and touching ranges merged ([3, 5] and
 *   [6, 8] -> [3, 8]); one line is [n, n]. Nothing at all (undefined, null, '', []) -> [].
 *
 * WHAT IS DROPPED OR FIXED (one warning each, through `warn`; parseLineSpec never throws)
 *   - a part that is neither a whole number nor a range of two ('3-x', 2.5, '-1', [1, 2, 3]);
 *   - a line below 1, or above MAX_LINE_NUMBER (a typo: no snippet is that long);
 *   - a range written backwards ('5-3') is read forwards (3-5);
 *   - with a known `lineCount`: a range that starts after the last line is dropped, one that
 *     ends after it ends on the last line. Without one (undefined, not a whole number) nothing
 *     is clamped;
 *   - a value of another type (an object, true): one warning, [].
 *   An empty part ('3,,5', a trailing comma) is skipped without a warning.
 *
 * THE OTHER HELPERS
 *   linesOf(ranges)            every line of the ranges: [[3, 5], [8, 8]] -> [3, 4, 5, 8]
 *   formatLineSpec(ranges)     the ranges as text for a reader: '3-5, 8'
 *   lineKindsOf(ranges, kind)  { 3: kind, 4: kind, 5: kind, 8: kind } — the shape
 *                              magicComments.js gives, so the two can be merged
 *   Pass them ranges from parseLineSpec (with a lineCount, so a range is never huge). An item
 *   that is not a [start, end] pair of whole numbers with 1 <= start <= end is left out.
 *
 * HOW TO CHANGE IT
 *   What a part may look like: LINE_PART / RANGE_PART / BRACES. The largest line number:
 *   MAX_LINE_NUMBER. The warning words: WORDS (and DEFAULT_LABEL, the name a warning starts with
 *   when the caller gives no `label`). A rule: the function of that rule below.
 */

/** The name a warning starts with when the caller gives none (callers pass 'CodeEditor highlight' …). */
const DEFAULT_LABEL = 'CodeEditor lines';

/** The largest line number accepted: no snippet is a million lines long, so a bigger one is a typo. */
const MAX_LINE_NUMBER = 1000000;

/** A part that is one line: '8'. */
const LINE_PART = /^\d+$/;

/** A part that is a range: '3-5', '3 - 5', '3–5' (an en dash). Groups: start, end. */
const RANGE_PART = /^(\d+)\s*[-–]\s*(\d+)$/;

/** Braces around a whole string spec, as in a code block's metastring: '{3-5,8}'. Group: the inside. */
const BRACES = /^\{(.*)\}$/s;

/** What separates the parts of a string spec. */
const PART_SEPARATOR = ',';

/** The warnings (each ends the sentence that starts with the label and the part). */
const WORDS = Object.freeze({
	notASpec: 'was ignored: name lines as 5, \'3-5,8\' or [3, [5, 7]].',
	notAPart: 'was skipped: a part is a line (8) or a range (3-5).',
	belowOne: 'was skipped: lines are numbered from 1.',
	tooLarge: `was skipped: no line number is above ${MAX_LINE_NUMBER}.`,
	backwards: (start, end) => `was read as ${start}-${end} (a range goes from the smaller line to the larger).`,
	pastTheEnd: (lineCount) => (lineCount === 1 ? 'was skipped: the code has only 1 line.' : `was skipped: the code has only ${lineCount} lines.`),
	clamped: (lineCount) => `ends after the last line (${lineCount}): it ends on line ${lineCount} instead.`,
});

/** A value as a warning shows it: a string in quotes, anything else as JSON ([1, 2]) or text. */
function shown(value) {
	if (typeof value === 'string') return `'${value}'`;
	try {
		return JSON.stringify(value).replace(/,/g, ', ');
	} catch {
		return String(value);
	}
}

/** Is this a usable line count (a whole number >= 0)? Anything else means "unknown: do not clamp". */
function knownLineCount(lineCount) {
	return Number.isInteger(lineCount) && lineCount >= 0;
}

/** Is this a [start, end] pair of whole numbers? */
function isPair(value) {
	return Array.isArray(value) && value.length === 2 && Number.isInteger(value[0]) && Number.isInteger(value[1]);
}

/**
 * Checks one candidate range against the rules that need no line count: { range } or
 * { problem } (a warning's ending). A backwards range is turned round, with `note` set.
 */
function checkRange(start, end) {
	const low = Math.min(start, end);
	const high = Math.max(start, end);
	if (low < 1) return { problem: WORDS.belowOne };
	if (high > MAX_LINE_NUMBER) return { problem: WORDS.tooLarge };
	const note = start > end ? WORDS.backwards(low, high) : null;
	return { range: [low, high], note };
}

/** The [start, end] a string part names, or null when it names none ('3-x'). */
function rangeOfText(part) {
	if (LINE_PART.test(part)) return [Number(part), Number(part)];
	const match = RANGE_PART.exec(part);
	return match ? [Number(match[1]), Number(match[2])] : null;
}

/** The inside of a string spec: braces taken off ('{3-5}' -> '3-5'), spaces trimmed. */
function stringInside(text) {
	const trimmed = text.trim();
	const braced = BRACES.exec(trimmed);
	return braced ? braced[1] : trimmed;
}

/**
 * Collects the candidate ranges of one value of a spec into `found` ({ range, part }), and
 * the parts that name no range into `bad`. `topLevel` is false inside an array (an array
 * inside an array is a pair, not a list).
 */
function collect(value, found, bad, topLevel) {
	if (typeof value === 'number') {
		if (Number.isInteger(value)) found.push({ range: [value, value], part: value });
		else bad.push(value);
		return;
	}
	if (typeof value === 'string') {
		collectText(value, found, bad);
		return;
	}
	if (topLevel && Array.isArray(value)) {
		for (const item of value) collectItem(item, found, bad);
		return;
	}
	bad.push(value);
}

/** One item of an array spec: a line, a [start, end] pair, or a string. */
function collectItem(item, found, bad) {
	if (isPair(item)) {
		found.push({ range: [item[0], item[1]], part: item });
		return;
	}
	collect(item, found, bad, false);
}

/** Every part of a string spec. */
function collectText(text, found, bad) {
	for (const rawPart of stringInside(text).split(PART_SEPARATOR)) {
		const part = rawPart.trim();
		if (part === '') continue;
		const range = rangeOfText(part);
		if (range) found.push({ range, part });
		else bad.push(part);
	}
}

/** [start, end] fitted to the code: { range } (null when nothing of it is left) and a warning ending or null. */
function fitToCode(range, lineCount) {
	const [start, end] = range;
	if (!knownLineCount(lineCount) || end <= lineCount) return { range, problem: null };
	if (start > lineCount) return { range: null, problem: WORDS.pastTheEnd(lineCount) };
	return { range: [start, lineCount], problem: WORDS.clamped(lineCount) };
}

/** Sort order: by start, then by end. */
function byStart(a, b) {
	if (a[0] !== b[0]) return a[0] - b[0];
	return a[1] - b[1];
}

/** `ranges` sorted, with overlapping and touching ones merged into one (new arrays). */
function mergeRanges(ranges) {
	const merged = [];
	for (const [start, end] of ranges.slice().sort(byStart)) {
		const last = merged[merged.length - 1];
		if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
		else merged.push([start, end]);
	}
	return merged;
}

/** console.warn, looked up when called (so a test may replace console.warn). */
function consoleWarn(message) {
	console.warn(message);
}

/** Is there nothing at all to read (undefined, null, an empty or blank string, an empty array)? */
function isEmptySpec(spec) {
	if (spec === undefined || spec === null) return true;
	if (typeof spec === 'string') return spec.trim() === '';
	return Array.isArray(spec) && spec.length === 0;
}

/** Does this value have a type a spec may have (a number, a string, an array)? */
function isSpecType(spec) {
	return typeof spec === 'number' || typeof spec === 'string' || Array.isArray(spec);
}

/**
 * The lines `spec` names, as sorted, merged [[start, end], …] (the forms and the rules are in
 * this file's header). Options: `lineCount` (the lines of the code the reader sees; unknown:
 * no clamping), `warn` (called once per problem; default console.warn), `label` (what each
 * warning starts with, e.g. 'CodeEditor highlight'; default DEFAULT_LABEL).
 */
export function parseLineSpec(spec, { lineCount, warn = consoleWarn, label = DEFAULT_LABEL } = {}) {
	if (isEmptySpec(spec)) return [];
	if (!isSpecType(spec)) {
		warn(`${label}: ${shown(spec)} ${WORDS.notASpec}`);
		return [];
	}
	const found = [];
	const bad = [];
	collect(spec, found, bad, true);
	for (const part of bad) warn(`${label}: ${shown(part)} ${WORDS.notAPart}`);
	const kept = [];
	for (const { range, part } of found) {
		const checked = checkRange(range[0], range[1]);
		if (checked.problem) {
			warn(`${label}: ${shown(part)} ${checked.problem}`);
			continue;
		}
		if (checked.note) warn(`${label}: ${shown(part)} ${checked.note}`);
		const fitted = fitToCode(checked.range, lineCount);
		if (fitted.problem) warn(`${label}: ${shown(part)} ${fitted.problem}`);
		if (fitted.range) kept.push(fitted.range);
	}
	return mergeRanges(kept);
}

/** Is this a usable range: a [start, end] pair with 1 <= start <= end? */
function isUsableRange(range) {
	return isPair(range) && range[0] >= 1 && range[0] <= range[1];
}

/** The usable [start, end] pairs of `ranges` (anything else is left out). */
function usableRanges(ranges) {
	if (!Array.isArray(ranges)) return [];
	return ranges.filter(isUsableRange);
}

/** Every line of `ranges` ([[3, 5], [8, 8]] -> [3, 4, 5, 8]), in the ranges' order. */
export function linesOf(ranges) {
	const lines = [];
	for (const [start, end] of usableRanges(ranges)) {
		for (let line = start; line <= end; line += 1) lines.push(line);
	}
	return lines;
}

/** One range as a reader reads it: '8' for one line, '3-5' for several. */
function formatRange([start, end]) {
	return start === end ? String(start) : `${start}-${end}`;
}

/** `ranges` as text for a reader: [[3, 5], [8, 8]] -> '3-5, 8' ('' for none). */
export function formatLineSpec(ranges) {
	return usableRanges(ranges).map(formatRange).join(', ');
}

/** { [line]: kind } for every line of `ranges` — magicComments.js's lineKinds shape. */
export function lineKindsOf(ranges, kind) {
	const kinds = {};
	for (const line of linesOf(ranges)) kinds[line] = kind;
	return kinds;
}
