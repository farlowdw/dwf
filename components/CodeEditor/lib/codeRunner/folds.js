/**
 * folds.js — checking the line ranges an author asks the editor to fold when it opens
 * (the `foldedRegions` prop), before the editor hands them to Monaco. Pure functions; no React,
 * no DOM. (The Monaco side — selecting each range and folding it — is
 * shared/components/CodeEditor/folding.js.)
 *
 * A REGION is [start, end]: 1-based line numbers, both included. Line `start` stays visible
 * (it carries the fold's arrow); lines start+1 … end are hidden. [1, 6] shows line 1 and hides
 * lines 2-6.
 *
 * THE RULES (normalizeFoldRegions; each dropped region gets a warning saying why)
 *   - a region must be an array of two whole numbers, start >= 1;
 *   - end must be greater than start (a fold hides at least one line);
 *   - an end past the last line is moved to the last line (with a warning); a region that
 *     starts on or after the last line is dropped;
 *   - the regions are sorted by start (a longer region first when two start together); an exact
 *     duplicate is dropped silently;
 *   - a region inside another is kept (nested folds); a region that CROSSES another (starts
 *     inside it, ends after it) is dropped — Monaco would refuse it — and so is a second region
 *     starting on the same line (a line opens only one fold; Monaco keeps the last made).
 *
 *   Fold nested regions INNERMOST FIRST (innermostFirst): selecting a range inside a fold that
 *   is already closed makes Monaco open that fold again to show the selection.
 *
 * A PER-LANGUAGE prop (foldRegionsFor): `foldedRegions` may be one list for the snippet, or an
 * object { python: [[1, 6]], javascript: [[1, 4]] } when the editor holds one snippet per
 * language; its keys may be any name languages.js > languageInfo knows ('py', 'Python').
 *
 * HOW TO CHANGE IT
 *   A rule: the check functions below (one rule each). The warning words: warn().
 */

import { languageInfo } from './languages.js';

/** Prefix of every warning, so the console says where it comes from. */
const WARNING_PREFIX = 'CodeEditor foldedRegions:';

/** A region as text for a warning: [1, 6]. */
function show(region) {
	try {
		return JSON.stringify(region).replace(/,/g, ', ');
	} catch {
		return String(region);
	}
}

/** One warning line. */
function warn(region, reason) {
	return `${WARNING_PREFIX} ${show(region)} ${reason}`;
}

/** Is this a usable line count (a whole number >= 0)? Anything else means "unknown: do not clamp". */
function knownLineCount(lineCount) {
	return Number.isInteger(lineCount) && lineCount >= 0;
}

/**
 * The first check of one item: null when it is a usable [start, end], else why not.
 * (Order and overlap are checked later, against the other regions.)
 */
function shapeProblem(item) {
	if (!Array.isArray(item) || item.length !== 2) return 'was skipped: a region is a pair of line numbers, [start, end].';
	const [start, end] = item;
	if (!Number.isInteger(start) || !Number.isInteger(end)) return 'was skipped: start and end must be whole line numbers.';
	if (start < 1) return 'was skipped: lines are numbered from 1.';
	if (end <= start) return 'was skipped: a fold needs at least one hidden line (end must be greater than start).';
	return null;
}

/** [start, end] fitted to the code: { region, warning } (region null when nothing is left to fold). */
function fitToCode(region, lineCount) {
	const [start, end] = region;
	if (!knownLineCount(lineCount) || end <= lineCount) return { region: [start, end], warning: null };
	if (start >= lineCount) {
		return { region: null, warning: warn(region, `was skipped: the code has only ${lineCount} lines, so nothing after line ${start} can be hidden.`) };
	}
	return { region: [start, lineCount], warning: warn(region, `ends after the last line (${lineCount}): folded to line ${lineCount} instead.`) };
}

/** Sort order: by start, then the longer region first (so a region comes before the ones inside it). */
function byStartThenLongest(a, b) {
	if (a[0] !== b[0]) return a[0] - b[0];
	return b[1] - a[1];
}

/** Are these the same region? */
function sameRegion(a, b) {
	return a[0] === b[0] && a[1] === b[1];
}

/**
 * Keep the regions that nest; drop crossing ones and second regions on one start line.
 * `sorted` is in byStartThenLongest order. Returns { kept, warnings }.
 */
function keepNesting(sorted) {
	const kept = [];
	const warnings = [];
	const open = [];
	for (const region of sorted) {
		const previous = kept[kept.length - 1];
		if (previous && sameRegion(previous, region)) continue;
		if (previous && previous[0] === region[0]) {
			warnings.push(warn(region, `was skipped: line ${region[0]} already opens the fold ${show(previous)} (a line opens only one fold).`));
			continue;
		}
		while (open.length > 0 && open[open.length - 1][1] < region[0]) open.pop();
		const parent = open[open.length - 1];
		if (parent && region[1] > parent[1]) {
			warnings.push(warn(region, `was skipped: it crosses ${show(parent)} (folds may nest, but not overlap).`));
			continue;
		}
		kept.push(region);
		open.push(region);
	}
	return { kept, warnings };
}

/**
 * The regions Monaco can fold, from the author's `regions` and the code's `lineCount`
 * (unknown / not given: no clamping): { regions: [[start, end], …], warnings: string[] }.
 * The input is not changed; the rules are in this file's header.
 */
export function normalizeFoldRegions(regions, lineCount) {
	if (regions === undefined || regions === null) return { regions: [], warnings: [] };
	if (!Array.isArray(regions)) {
		return { regions: [], warnings: [`${WARNING_PREFIX} expected an array of [start, end] pairs, got ${show(regions)}.`] };
	}
	const warnings = [];
	const usable = [];
	for (const item of regions) {
		const problem = shapeProblem(item);
		if (problem !== null) {
			warnings.push(warn(item, problem));
			continue;
		}
		const fitted = fitToCode(item, lineCount);
		if (fitted.warning !== null) warnings.push(fitted.warning);
		if (fitted.region !== null) usable.push(fitted.region);
	}
	const nesting = keepNesting(usable.sort(byStartThenLongest));
	return { regions: nesting.kept, warnings: warnings.concat(nesting.warnings) };
}

/**
 * The order to fold `regions` in (normalizeFoldRegions' output): every region after the
 * regions inside it — the reverse of document order. A new array; the input is not changed.
 */
export function innermostFirst(regions) {
	if (!Array.isArray(regions)) return [];
	return regions.slice().reverse();
}

/** The value of the key of `object` that names the same language as `language`, or undefined. */
function valueForLanguage(object, language) {
	if (Object.hasOwn(object, language)) return object[language];
	const wanted = languageInfo(language).id;
	const key = Object.keys(object).find((name) => languageInfo(name).id === wanted);
	return key === undefined ? undefined : object[key];
}

/**
 * The fold list for one language from the `foldedRegions` prop: the prop itself when it is an
 * array (it applies to every language), its entry for `language` when it is an object (any key
 * languageInfo knows as that language), else [].
 */
export function foldRegionsFor(foldedRegions, language) {
	if (Array.isArray(foldedRegions)) return foldedRegions;
	if (!foldedRegions || typeof foldedRegions !== 'object') return [];
	const value = valueForLanguage(foldedRegions, String(language ?? ''));
	return Array.isArray(value) ? value : [];
}
