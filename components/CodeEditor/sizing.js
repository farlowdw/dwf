/**
 * sizing.js — how tall <CodeEditor>'s editor box (and its stdin field) is. Pure functions; no
 * React, no DOM, no Monaco, so `node --test` checks them (__tests__/sizing.test.js).
 *
 * TWO MODES
 *   a fixed height   the default: DEFAULT_HEIGHT ('50vh', the original editor's size), or
 *                    the page's `height` (a CSS length, or a number of px). The box is exactly
 *                    that tall and the code scrolls inside it.
 *   fit the content  `height="fit"` (FIT_HEIGHT): the box is as tall as the code's visible lines
 *                    (folded lines do not count), never shorter than MIN_HEIGHT_PX and never
 *                    taller than `maxHeight` (default DEFAULT_MAX_HEIGHT, '60vh'). The clamping
 *                    is done by CSS (min-height / max-height on the box), so a `maxHeight` in vh
 *                    or rem works without converting it to px.
 *   Either way the reader can drag the box taller or shorter (resize.js, ResizeHandle.jsx); a
 *   drag ends fit-the-content for that editor.
 *
 * LENGTHS THAT ARE REFUSED (toCssLength; each with a console warning)
 *   A percentage ('100%', the old @monaco-editor/react default), a keyword ('auto', 'none',
 *   'fit-content' …), and 0 or less. The box's parent has no height of its own, so a percentage
 *   or 'auto' height collapsed the editor to a few pixels, and a percentage maxHeight removed the
 *   ceiling. A refused `height` means DEFAULT_HEIGHT; a refused `maxHeight` means the default.
 *   ('fit' is not a length: readHeightProp() takes it before toCssLength() would refuse it.)
 *   Accepted: a number (px), a plain number in a string ('400' = 400px), a positive number with a
 *   unit ('50vh', '24rem'), and a CSS function ('calc(100vh - 10rem)', 'min(…)', 'var(…)').
 *
 * NO JUMP ON LOAD
 *   Before Monaco has loaded (and in the server-rendered page) the box is drawn at the height
 *   the code WILL have: estimateContentHeight() counts the visible lines the way Monaco does
 *   (lines × line height + the top and bottom padding). Once Monaco is up, its own content
 *   height takes over (CodeEditorClient.jsx, onDidContentSizeChange — held while the fold cover
 *   is up). Monaco would also add its horizontal scrollbar (12 px) whenever a line is wider than
 *   the box, which no estimate can know before the page is laid out: a fit editor's options
 *   leave the bar out of the content height and draw it over the bottom padding instead
 *   (props.js > FIT_SCROLLBAR_OPTIONS), so the estimate stays right for long lines too. The
 *   stdin field's placeholder is as tall as the field will be (stdinRows).
 *
 * HOW TO CHANGE IT
 *   The default height: DEFAULT_HEIGHT. The word for fit-the-content: FIT_HEIGHT. The smallest
 *   box: MIN_HEIGHT_PX. The default ceiling: DEFAULT_MAX_HEIGHT. How Monaco turns
 *   fontSize / lineHeight into pixels: lineHeightPx() (mirrors Monaco's FontInfo rules). Which
 *   lengths are refused: checkCssText(). The stdin field's rows: STDIN_MIN_ROWS / STDIN_MAX_ROWS
 *   (its row height in px: styles.module.css > --ce-stdin-row-height).
 */

/** The editor box's height when the page sets none: the original editor's size. */
export const DEFAULT_HEIGHT = '50vh';

/** `height="fit"`: the box follows the code's height instead of a fixed one (case and spaces ignored). */
export const FIT_HEIGHT = 'fit';

/** The shortest editor box, in px: about three lines, so a one-line snippet still looks like an editor. */
export const MIN_HEIGHT_PX = 80;

/** The default `maxHeight` when the box fits its content. */
export const DEFAULT_MAX_HEIGHT = '60vh';

/** The stdin field's height range, in text rows (it grows with its text between the two). */
export const STDIN_MIN_ROWS = 2;
export const STDIN_MAX_ROWS = 10;

/** Monaco reads a lineHeight below this as a multiple of fontSize (and never draws a line shorter). */
const MONACO_MIN_LINE_HEIGHT = 8;

/** Monaco's own line height, as a multiple of fontSize, when the options set none (its macOS value). */
const MONACO_DEFAULT_LINE_HEIGHT_RATIO = 1.5;

/** Monaco's default font size (px), when the options set none. */
const MONACO_DEFAULT_FONT_SIZE = 14;

/** A plain number written as text ('400', '320.5', '-5'): read as px. */
const PLAIN_NUMBER = /^-?(\d+(\.\d+)?|\.\d+)$/;

/** A number with a unit ('50vh', '24rem', '0px'): [whole, number, unit]. */
const NUMBER_WITH_UNIT = /^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z]+)$/i;

/** A word on its own ('auto', 'none', 'fit-content', 'inherit'): a CSS keyword, not a length. */
const KEYWORD = /^[a-z-]+$/i;

/** A CSS function ('calc(…)', 'min(…)', 'clamp(…)', 'var(…)'): passed on as written. */
const CSS_FUNCTION = /^[a-z-]+\(.*\)$/i;

/** Why a length is refused (the middle of the console warning). */
const REFUSED = Object.freeze({
	percentage: 'a percentage has nothing to measure against here',
	keyword: 'a keyword is not a length',
	notPositive: 'it must be more than 0',
	notALength: 'it is not a CSS length',
});

/** What happens instead when a prop's length is refused (the end of the console warning). */
const INSTEAD = Object.freeze({
	height: `the default height (${DEFAULT_HEIGHT}) applies`,
	maxHeight: `the default ceiling (${DEFAULT_MAX_HEIGHT}) applies`,
});

/** console.warn, looked up when called (so a test may replace console.warn). */
function consoleWarn(message) {
	console.warn(message);
}

/** A prop value as the warning shows it: a string in quotes ('100%'), anything else as text. */
function shown(value) {
	return typeof value === 'string' ? `'${value}'` : String(value);
}

/** { length } for a usable string, { problem } for a refused one (`text`: trimmed, not empty). */
function checkCssText(text) {
	if (text.includes('%')) return { problem: REFUSED.percentage };
	if (KEYWORD.test(text)) return { problem: REFUSED.keyword };
	if (PLAIN_NUMBER.test(text)) return Number(text) > 0 ? { length: `${text}px` } : { problem: REFUSED.notPositive };
	const withUnit = NUMBER_WITH_UNIT.exec(text);
	if (withUnit) return Number(withUnit[1]) > 0 ? { length: text } : { problem: REFUSED.notPositive };
	if (CSS_FUNCTION.test(text)) return { length: text };
	return { problem: REFUSED.notALength };
}

/** { length } for a usable prop value, { problem } for a refused one, {} when there is no value at all. */
function checkCssLength(value) {
	if (value === undefined || value === null) return {};
	if (typeof value === 'number') {
		return Number.isFinite(value) && value > 0 ? { length: `${value}px` } : { problem: REFUSED.notPositive };
	}
	if (typeof value !== 'string') return { problem: REFUSED.notALength };
	const text = value.trim();
	return text === '' ? {} : checkCssText(text);
}

/**
 * A CSS length from the `height` or `maxHeight` prop (`prop` names which, for the warning): a
 * number -> 'Npx'; a plain number in a string -> 'Npx'; a positive length or a CSS function as
 * it is; nothing (undefined, '') -> undefined. A refused value (see the header) -> undefined and
 * a console warning (`warn`, for the tests).
 */
export function toCssLength(value, { prop = 'height', warn = consoleWarn } = {}) {
	const checked = checkCssLength(value);
	if (checked.problem) {
		warn(`CodeEditor ${prop}: ${shown(value)} was ignored (${checked.problem}); ${INSTEAD[prop] ?? 'it is left out'}.`);
	}
	return checked.length;
}

/**
 * The `height` prop read as { height, fit }: 'fit' -> { height: null, fit: true }; a usable
 * length -> { height: that length, fit: false }; nothing, or a refused length (with its console
 * warning) -> { height: DEFAULT_HEIGHT, fit: false }.
 */
export function readHeightProp(value, { warn = consoleWarn } = {}) {
	if (typeof value === 'string' && value.trim().toLowerCase() === FIT_HEIGHT) return { height: null, fit: true };
	return { height: toCssLength(value, { prop: 'height', warn }) ?? DEFAULT_HEIGHT, fit: false };
}

/** Monaco's line height in px for these editor options (rounded, as Monaco rounds it). */
export function lineHeightPx({ fontSize, lineHeight } = {}) {
	const size = typeof fontSize === 'number' && fontSize > 0 ? fontSize : MONACO_DEFAULT_FONT_SIZE;
	let height = typeof lineHeight === 'number' && lineHeight > 0 ? lineHeight : MONACO_DEFAULT_LINE_HEIGHT_RATIO;
	if (height < MONACO_MIN_LINE_HEIGHT) height *= size;
	return Math.max(MONACO_MIN_LINE_HEIGHT, Math.round(height));
}

/** How many lines the code has, counted as Monaco counts them (a final newline starts one more line). */
export function lineCountOf(code) {
	if (typeof code !== 'string' || code === '') return 1;
	return code.split('\n').length;
}

/**
 * The last line a fold can end on: the last line, or the one before it when the code ends with
 * a newline (that final line is empty, and Monaco drops a last line a selection touches only at
 * column 1, so a fold ending there would end a line early). folding.js > lastFoldableLine is
 * the same rule for a Monaco model.
 */
export function lastFoldableLineOf(code) {
	const lineCount = lineCountOf(code);
	return lineCount > 1 && code.endsWith('\n') ? lineCount - 1 : lineCount;
}

/**
 * How many lines these fold regions hide ([start, end]: lines start+1 … end). A line hidden by
 * two regions (a nested fold) counts once.
 */
export function hiddenLineCount(regions) {
	if (!Array.isArray(regions)) return 0;
	const sorted = regions.filter(Array.isArray).slice().sort((a, b) => a[0] - b[0]);
	let hidden = 0;
	let hiddenUpTo = 0;
	for (const [start, end] of sorted) {
		const firstHidden = Math.max(start + 1, hiddenUpTo + 1);
		if (end < firstHidden) continue;
		hidden += end - firstHidden + 1;
		hiddenUpTo = end;
	}
	return hidden;
}

/** The height (px) of the visible code: lines × line height + Monaco's top and bottom padding. */
export function estimateContentHeight({ lineCount, hiddenLines = 0, lineHeight, paddingTop = 0, paddingBottom = 0 }) {
	const visibleLines = Math.max(1, lineCount - hiddenLines);
	return visibleLines * lineHeight + paddingTop + paddingBottom;
}

/**
 * The editor box's inline style:
 *   fit the content   { height: '<contentHeight>px', minHeight: MIN_HEIGHT_PX, maxHeight }
 *   otherwise         { height } (DEFAULT_HEIGHT when there is none)
 */
export function editorBoxStyle({ height, fit = false, maxHeight = DEFAULT_MAX_HEIGHT, contentHeight }) {
	if (!fit) return { height: height || DEFAULT_HEIGHT };
	return {
		height: `${Math.round(contentHeight)}px`,
		minHeight: `${MIN_HEIGHT_PX}px`,
		maxHeight,
	};
}

/**
 * How many text rows the stdin field shows for `stdin`: one per line (a final newline starts
 * one more, as in the field), between STDIN_MIN_ROWS and STDIN_MAX_ROWS. A long line that wraps
 * in the field is not counted: its width is not known before the page is drawn.
 */
export function stdinRows(stdin) {
	return Math.min(STDIN_MAX_ROWS, Math.max(STDIN_MIN_ROWS, lineCountOf(stdin)));
}
