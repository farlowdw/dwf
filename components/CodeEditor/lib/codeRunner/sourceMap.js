/**
 * sourceMap.js — reading a source map (version 3, the format TypeScript writes) to say which
 * line of the ORIGINAL code a line of the generated code came from. The code editor compiles a
 * reader's TypeScript to JavaScript in the browser (shared/components/CodeEditor/typescript.js) and
 * runs the JavaScript on the code runner; Node's error then names a line of main.js, and this
 * file turns it back into the line of TypeScript the reader wrote. Pure functions; no React, no
 * DOM.
 *
 *     originalLineFor(map, 7)            // 5: generated line 7 came from line 5 (or null)
 *     originalPositionFor(map, 7, 13)    // { line: 5, column: 9, source: 'main.ts' } (or null)
 *
 * Lines and columns given to and returned by these functions are 1-based, as an error message
 * and the editor count them; inside a source map both are 0-based.
 *
 * THE FORMAT (the "mappings" string of a source map)
 *   One group per generated line, separated by ';' (an empty group: a line with no mapping, e.g.
 *   TypeScript's "use strict" line). A group holds segments separated by ','. A segment is 1, 4
 *   or 5 numbers, each written in base64 VLQ:
 *     1  the generated column
 *     2  the index of the original file in `sources`
 *     3  the original line
 *     4  the original column
 *     5  the index of a name in `names`
 *   Every number is RELATIVE to the same field of the segment before it. The generated column
 *   starts again from 0 on each line; the other four carry on across lines.
 *   Base64 VLQ: each character is 6 bits; the top bit (32) says "more characters follow", the
 *   other 5 bits are the next 5 bits of the number, least significant first; in the finished
 *   number the lowest bit is the sign (1 = negative) and the rest is the size.
 *
 * WHICH ORIGINAL LINE (when a generated line has several segments)
 *   originalLineFor: the first segment of the line that points at an original position.
 *   originalPositionFor: the last segment that starts at or before the column (the one the
 *   column falls in); a column before the first such segment uses the first one.
 *   A generated line with no mapping gives null (TypeScript's "use strict" and __esModule lines).
 *   Use the column whenever it is known: TypeScript joins a call's arguments, a parameter list
 *   or an arrow's body written over several lines into ONE line of JavaScript, so for
 *     console.log(        // line 2
 *       data.a,           // line 3: the TypeError is here
 *     );
 *   Node names that one JavaScript line: the line alone gives 2, the line and column give 3.
 *
 * BROKEN INPUT  A map that is not version 3, has no `mappings` string, or holds a character that
 *   is not base64 VLQ is unreadable: the lookups return null (they are used while showing an
 *   error, so they never throw). decodeMappings() itself throws, with a message saying why.
 *
 * HOW TO CHANGE IT
 *   Which segment answers for a line: chooseSegmentForLine / chooseSegmentForColumn. Indexed
 *   maps ("sections", which TypeScript never writes) are not read: add a reader beside
 *   parseSourceMap if one is ever needed.
 */

/** The source map version this file reads. */
export const SOURCE_MAP_VERSION = 3;

/** The 64 base64 digits, in order: a digit's value is its index here. */
const BASE64_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 VLQ: bits of the number per character, the "more follows" bit, the value bits. */
const VLQ_BITS_PER_DIGIT = 5;
const VLQ_CONTINUATION_BIT = 32;
const VLQ_VALUE_MASK = 31;

/** Separators in the mappings string. */
const LINE_SEPARATOR = ';';
const SEGMENT_SEPARATOR = ',';

/** The lengths a segment may have (see the header). */
const SEGMENT_GENERATED_ONLY = 1;
const SEGMENT_WITH_SOURCE = 4;
const SEGMENT_WITH_NAME = 5;

/** Each base64 digit's value, built once from BASE64_DIGITS. */
const DIGIT_VALUES = buildDigitValues();

/** Decoded mappings per source map object, so several lookups decode once (null: unreadable). */
const decodedCache = new WeakMap();

/** { character: value } for the 64 base64 digits. */
function buildDigitValues() {
	const values = new Map();
	for (let index = 0; index < BASE64_DIGITS.length; index += 1) values.set(BASE64_DIGITS[index], index);
	return values;
}

/** The value of one base64 digit; throws for any other character. */
function digitValue(character) {
	const value = DIGIT_VALUES.get(character);
	if (value === undefined) throw new Error(`sourceMap: "${character}" is not a base64 VLQ digit.`);
	return value;
}

/** A finished VLQ number: the lowest bit is the sign, the rest the size ('B', "minus zero", is 0). */
function fromVlqSigned(value) {
	const size = Math.floor(value / 2);
	if (size === 0) return 0;
	return value % 2 === 1 ? -size : size;
}

/**
 * The numbers of one segment ('AAgBC' → [0, 0, 16, 1]). Throws for a character that is not a
 * base64 digit, or when the text ends in the middle of a number.
 */
export function decodeVlq(text) {
	const numbers = [];
	let value = 0;
	let shift = 0;
	let inNumber = false;
	for (const character of text) {
		const digit = digitValue(character);
		value += (digit & VLQ_VALUE_MASK) * 2 ** shift;
		inNumber = (digit & VLQ_CONTINUATION_BIT) !== 0;
		if (inNumber) {
			shift += VLQ_BITS_PER_DIGIT;
			continue;
		}
		numbers.push(fromVlqSigned(value));
		value = 0;
		shift = 0;
	}
	if (inNumber) throw new Error(`sourceMap: the segment "${text}" ends in the middle of a number.`);
	return numbers;
}

/** Is this a segment length the format allows (1, 4 or 5)? */
function isValidSegmentLength(length) {
	return length === SEGMENT_GENERATED_ONLY || length === SEGMENT_WITH_SOURCE || length === SEGMENT_WITH_NAME;
}

/**
 * One segment in absolute numbers, from its relative ones and the running `state` (which it
 * updates). All 0-based; a generated-only segment has no source fields.
 */
function absoluteSegment(numbers, state) {
	state.generatedColumn += numbers[0];
	const segment = { generatedColumn: state.generatedColumn };
	if (numbers.length < SEGMENT_WITH_SOURCE) return segment;
	state.sourceIndex += numbers[1];
	state.originalLine += numbers[2];
	state.originalColumn += numbers[3];
	segment.sourceIndex = state.sourceIndex;
	segment.originalLine = state.originalLine;
	segment.originalColumn = state.originalColumn;
	if (numbers.length === SEGMENT_WITH_NAME) {
		state.nameIndex += numbers[4];
		segment.nameIndex = state.nameIndex;
	}
	return segment;
}

/** The segments of one generated line ('' → []), in absolute numbers; updates `state`. */
function decodeLine(lineText, state) {
	state.generatedColumn = 0;
	const segments = [];
	if (lineText === '') return segments;
	for (const segmentText of lineText.split(SEGMENT_SEPARATOR)) {
		const numbers = decodeVlq(segmentText);
		if (!isValidSegmentLength(numbers.length)) {
			throw new Error(`sourceMap: the segment "${segmentText}" has ${numbers.length} numbers (1, 4 or 5 expected).`);
		}
		segments.push(absoluteSegment(numbers, state));
	}
	return segments;
}

/**
 * A source map's `mappings` string decoded: one array per generated line (index 0 = line 1), each
 * holding that line's segments in absolute, 0-based numbers:
 *   { generatedColumn, sourceIndex?, originalLine?, originalColumn?, nameIndex? }
 * Throws when the string is not valid (see the header).
 */
export function decodeMappings(mappings) {
	if (typeof mappings !== 'string') throw new Error('sourceMap: "mappings" must be a string.');
	const state = { generatedColumn: 0, sourceIndex: 0, originalLine: 0, originalColumn: 0, nameIndex: 0 };
	return mappings.split(LINE_SEPARATOR).map((lineText) => decodeLine(lineText, state));
}

/**
 * The source map as an object: `map` itself, or the JSON text of one parsed; null when it is not
 * a version-3 map with a `mappings` string.
 */
export function parseSourceMap(map) {
	let parsed = map;
	if (typeof map === 'string') {
		try {
			parsed = JSON.parse(map);
		} catch {
			return null;
		}
	}
	if (!parsed || typeof parsed !== 'object' || typeof parsed.mappings !== 'string') return null;
	if (parsed.version !== undefined && parsed.version !== SOURCE_MAP_VERSION) return null;
	return parsed;
}

/** The decoded lines of a parsed map, decoded once per map object; null when unreadable. */
function decodedLinesOf(parsed) {
	if (decodedCache.has(parsed)) return decodedCache.get(parsed);
	let lines = null;
	try {
		lines = decodeMappings(parsed.mappings);
	} catch {
		lines = null;
	}
	decodedCache.set(parsed, lines);
	return lines;
}

/** Does this segment point at an original position? */
function hasOriginal(segment) {
	return segment.originalLine !== undefined;
}

/** The segments of generated line `line` (1-based) that point at an original position, or []. */
function mappedSegmentsOn(map, line) {
	const parsed = parseSourceMap(map);
	if (!parsed || !Number.isInteger(line) || line < 1) return { parsed, segments: [] };
	const lines = decodedLinesOf(parsed);
	if (!lines || line > lines.length) return { parsed, segments: [] };
	return { parsed, segments: lines[line - 1].filter(hasOriginal) };
}

/** The segment that answers for a whole line: the first one with an original position. */
function chooseSegmentForLine(segments) {
	return segments[0] ?? null;
}

/**
 * The segment that answers for a 1-based column: the last one starting at or before it, or the
 * line's first one when the column comes before them all.
 */
function chooseSegmentForColumn(segments, column) {
	const zeroBasedColumn = column - 1;
	let chosen = segments[0] ?? null;
	for (const segment of segments) {
		if (segment.generatedColumn > zeroBasedColumn) break;
		chosen = segment;
	}
	return chosen;
}

/** A segment as the 1-based position this file returns. */
function positionOf(segment, parsed) {
	const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
	return {
		line: segment.originalLine + 1,
		column: segment.originalColumn + 1,
		source: sources[segment.sourceIndex] ?? null,
	};
}

/**
 * The original line (1-based) that generated line `generatedLine` (1-based) came from, or null
 * when the line has no mapping or the map cannot be read. `map`: the object or its JSON text.
 */
export function originalLineFor(map, generatedLine) {
	const { parsed, segments } = mappedSegmentsOn(map, generatedLine);
	const segment = chooseSegmentForLine(segments);
	return segment ? positionOf(segment, parsed).line : null;
}

/**
 * The original { line, column, source } (1-based) of a generated line and column (1-based, as
 * Node's stack frames give them), or null (see originalLineFor). Without a usable column (a
 * whole number from 1) it answers for the whole line, as originalLineFor does.
 */
export function originalPositionFor(map, generatedLine, generatedColumn) {
	const { parsed, segments } = mappedSegmentsOn(map, generatedLine);
	const usableColumn = Number.isInteger(generatedColumn) && generatedColumn >= 1;
	const segment = usableColumn ? chooseSegmentForColumn(segments, generatedColumn) : chooseSegmentForLine(segments);
	return segment ? positionOf(segment, parsed) : null;
}
