/**
 * codeSpans.js — splits a short text an author writes in a prop (a step's `note`, a hint) into
 * plain text and inline `code`, the way Markdown reads backticks, so a component can draw the
 * code parts in <code>. Pure: no React, no DOM.
 *
 *     splitCodeSpans('Fill `dp[i]` first.')
 *       -> [{ code: false, text: 'Fill ' }, { code: true, text: 'dp[i]' }, { code: false, text: ' first.' }]
 *
 * THE RULES (Markdown's code spans, CommonMark 6.1, kept to what a one-line note needs)
 *   - A run of backticks opens a code span; the next run of the SAME length closes it. So a
 *     backtick inside the code needs two around it: ``a ` b`` is the code a ` b.
 *   - A run with no partner of its length is plain text (a lone ` stays a backtick).
 *   - Inside a span, one space at each end is dropped when both ends have one and the code is
 *     not all spaces: `` `x` `` is the code `x`, backticks included.
 *   - No other Markdown: *stars*, links and HTML stay plain text (React escapes it).
 *
 * HOW TO CHANGE IT  Another inline mark (bold, links): a second pass over the plain parts, with
 * its own type next to `code`. The drawing: StepBar.jsx > NoteText.
 */

/** A run of one or more backticks. */
const BACKTICK_RUN = /`+/g;

/** The space a code span may be padded with (one at each end is dropped). */
const SPAN_PADDING = ' ';

/** The next run of backticks at or after `from`: { start, end, length } or null. */
function nextRun(text, from) {
	BACKTICK_RUN.lastIndex = from;
	const match = BACKTICK_RUN.exec(text);
	if (!match) return null;
	return { start: match.index, end: match.index + match[0].length, length: match[0].length };
}

/** The next run of exactly `length` backticks at or after `from` (the closing one), or null. */
function closingRun(text, from, length) {
	for (let run = nextRun(text, from); run; run = nextRun(text, run.end)) {
		if (run.length === length) return run;
	}
	return null;
}

/** A code span's text: one space off each end when both ends have one and it is not all spaces. */
function spanText(inside) {
	const padded = inside.startsWith(SPAN_PADDING) && inside.endsWith(SPAN_PADDING);
	if (!padded || inside.trim() === '') return inside;
	return inside.slice(SPAN_PADDING.length, -SPAN_PADDING.length);
}

/** Add plain text to `parts` (nothing for an empty string). */
function pushPlain(parts, text) {
	if (text !== '') parts.push({ code: false, text });
}

/**
 * `text` as [{ code, text }, …] in reading order (the rules are in the header); [] for an empty
 * string or anything that is not a string.
 */
export function splitCodeSpans(text) {
	if (typeof text !== 'string') return [];
	const parts = [];
	let plainStart = 0;
	let searchFrom = 0;
	for (let opening = nextRun(text, searchFrom); opening; opening = nextRun(text, searchFrom)) {
		const closing = closingRun(text, opening.end, opening.length);
		if (!closing) {
			// No partner: the run stays plain text; look for the next one after it.
			searchFrom = opening.end;
			continue;
		}
		pushPlain(parts, text.slice(plainStart, opening.start));
		parts.push({ code: true, text: spanText(text.slice(opening.end, closing.start)) });
		plainStart = closing.end;
		searchFrom = closing.end;
	}
	pushPlain(parts, text.slice(plainStart));
	return parts;
}
