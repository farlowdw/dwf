/**
 * versions.js — comparing runtime versions ("3.10.0" vs "3.9.4") and matching the version an
 * author asks for (a "selector": "3.12", "3.x", "*") against the versions the code runner has.
 * Pure functions; no React, no DOM.
 *
 * THE RULES
 *   Compare   segment by segment (split on "."), as numbers: "3.10.0" is newer than "3.9.4".
 *             A missing segment counts as 0 ("3.12" equals "3.12.0"). A segment with text after
 *             its number ("0-rc1") sorts just below the plain number ("0"), then by that text.
 *   Select    a selector matches a version when it is
 *               - empty, "*" or "latest" (any case): every version;
 *               - the version itself;
 *               - a prefix of whole segments: "3" and "3.12" match "3.12.0", "3.1" does not;
 *               - any of these with wildcard segments "x", "X" or "*": "3.x", "3.12.*".
 *             A selector segment past the end of the version must be 0 or a wildcard
 *             ("3.12.0.0" matches "3.12.0", like compareVersions). Ranges ("^3", ">=3.9") and
 *             a leading "v" or "=" ("v3.12", "=3.12") are not understood: they match nothing
 *             here (Piston itself, which uses semver, would accept them).
 *             Piston does NOT understand "latest": request.js sends "*" for every selector
 *             isAnyVersion() accepts.
 *   Resolve   the HIGHEST matching version wins.
 *
 *   Write a version as a string in MDX: version={3.10} is the NUMBER 3.1, which "3.10.0" does
 *   not match; version="3.10" is right.
 *
 * HOW TO CHANGE IT
 *   What counts as "every version": ANY_VERSION_SELECTORS. Wildcard segments:
 *   WILDCARD_SEGMENTS. The comparison of one segment: compareSegments().
 */

/** Selectors (trimmed, lower case) that match every version. */
const ANY_VERSION_SELECTORS = new Set(['', '*', 'latest']);

/** Selector segments that match any version segment. */
const WILDCARD_SEGMENTS = new Set(['x', 'X', '*']);

/** What a missing version segment counts as. */
const MISSING_SEGMENT = '0';

/** A version or selector as a trimmed string ('' for null / undefined; numbers are allowed). */
function asText(value) {
	return String(value ?? '').trim();
}

/** "3.12.0" -> ['3', '12', '0']; '' -> []. */
function segmentsOf(value) {
	const text = asText(value);
	if (text === '') return [];
	return text.split('.');
}

/** One segment as { number, rest }: "12" -> { 12, '' }, "0-rc1" -> { 0, '-rc1' }, "beta" -> { 0, 'beta' }. */
function parseSegment(segment) {
	const digits = /^\d+/.exec(segment);
	if (digits === null) return { number: 0, rest: segment };
	return { number: Number(digits[0]), rest: segment.slice(digits[0].length) };
}

/** Negative / 0 / positive for two segments: by number, then a plain number above one with text after it. */
function compareSegments(a, b) {
	const left = parseSegment(a);
	const right = parseSegment(b);
	if (left.number !== right.number) return left.number - right.number;
	if (left.rest === right.rest) return 0;
	if (left.rest === '') return 1;
	if (right.rest === '') return -1;
	return left.rest < right.rest ? -1 : 1;
}

/**
 * Negative when `a` is older than `b`, 0 when they are the same version, positive when newer.
 * Sort newest first with `versions.sort((x, y) => compareVersions(y, x))`.
 */
export function compareVersions(a, b) {
	const left = segmentsOf(a);
	const right = segmentsOf(b);
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		const order = compareSegments(left[index] ?? MISSING_SEGMENT, right[index] ?? MISSING_SEGMENT);
		if (order !== 0) return order;
	}
	return 0;
}

/** Does one selector segment accept one version segment? (Wildcards accept anything; numbers compare as numbers.) */
function segmentMatches(selectorSegment, versionSegment) {
	if (WILDCARD_SEGMENTS.has(selectorSegment)) return true;
	return compareSegments(selectorSegment, versionSegment) === 0;
}

/** Does `selector` match every version? */
export function isAnyVersion(selector) {
	return ANY_VERSION_SELECTORS.has(asText(selector).toLowerCase());
}

/** Does `version` satisfy `selector`? (The rules in this file's header.) */
export function matchesSelector(version, selector) {
	if (isAnyVersion(selector)) return true;
	if (asText(version) === asText(selector)) return true;
	const wanted = segmentsOf(selector);
	const actual = segmentsOf(version);
	if (actual.length === 0) return false;
	return wanted.every((segment, index) => segmentMatches(segment, actual[index] ?? MISSING_SEGMENT));
}

/**
 * The highest of `versions` that matches `selector`:
 *   { version, exact }   exact = the selector was that very version ("3.12.0", not "3.12");
 *   { version: null, exact: false } when none matches (or `versions` is not an array).
 */
export function resolveVersion(versions, selector) {
	const candidates = Array.isArray(versions) ? versions.filter((version) => typeof version === 'string') : [];
	let best = null;
	for (const version of candidates) {
		if (!matchesSelector(version, selector)) continue;
		if (best === null || compareVersions(version, best) > 0) best = version;
	}
	if (best === null) return { version: null, exact: false };
	return { version: best, exact: asText(selector) === best };
}
