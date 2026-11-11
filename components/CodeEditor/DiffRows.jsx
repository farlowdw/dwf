/**
 * DiffRows.jsx — the rows of a line diff, as a list: a "−" row in red for a line only the reader's
 * side has, a "+" row in green for a line only the other side has, a plain row for a matching line,
 * and the muted gap rows ("⋯ 12 matching lines", "… 30 more lines"). Two panels draw them: the
 * output diff under a "Differs from line N" verdict (ExercisePanel.jsx: the reader's output against
 * the page's expected output) and the solution diff of the static view on a phone
 * (StaticSolution.jsx: the reader's code against the page's solution).
 *
 *     <DiffRows rows={diffRows(comparison.diff)} />
 *     <DiffRows rows={rows} sidePrefix={{ yours: 'Your code: ', expected: 'The solution: ' }} />
 *
 *   rows        exerciseView.js > diffRows(): [{ kind, text }] for 'same' / 'added' / 'removed'
 *               rows, [{ kind, count }] for 'skip' / 'more' rows
 *   sidePrefix  what a screen reader hears before a changed row's text, per side
 *               (exerciseView.js > DIFF_SIDES: 'yours', 'expected'); ExercisePanel's "Your
 *               output: " / "Expected: " unless the panel passes its own
 *
 * The markup is ExercisePanel.jsx's own, moved here unchanged (2026-10-26, for the static view):
 * a <ul role="list"> (Safari drops the list role of a list without bullets), each row a <li> with
 * the sign (hidden from screen readers), the side's prefix for them (visually hidden), then the
 * text. The signs and classes are the panel's (SIGNS, ROW_CLASSES), exported for its legend. The
 * look is ExercisePanel.module.css (.diffRows, .diffRow, .diffSign, the bands); a panel that wants
 * other bands sets --ce-band-added / --ce-band-removed on an ancestor (StaticSolution.module.css
 * does, so its rows match its colour key).
 *
 * HOW TO CHANGE IT
 *   The signs: SIGNS. A row kind's class: ROW_CLASSES (the classes live in
 *   ExercisePanel.module.css). The words of a gap row ("3 matching lines", "3 more lines") and
 *   the default prefixes: ExercisePanel.jsx > WORDS (read at render time only, so the two files
 *   may import each other). Tests: __tests__/diffRows.test.js.
 */

import React from 'react';
import clsx from 'clsx';
import { WORDS } from './ExercisePanel.jsx';
import { DIFF_SIDES, ROW_KINDS } from './exerciseView.js';
import styles from './styles.module.css';
import panelStyles from './ExercisePanel.module.css';

/** The sign at the start of each diff row (− is U+2212, the same minus as the site's removed code lines). */
export const SIGNS = Object.freeze({
	[ROW_KINDS.same]: ' ',
	[ROW_KINDS.added]: '+',
	[ROW_KINDS.removed]: '−',
	[ROW_KINDS.skip]: '⋯',
	[ROW_KINDS.more]: '…',
});

/** Each diff row kind's class (a matching row has none; a skip or more row is a gap). */
export const ROW_CLASSES = Object.freeze({
	[ROW_KINDS.same]: null,
	[ROW_KINDS.added]: panelStyles.diffRowAdded,
	[ROW_KINDS.removed]: panelStyles.diffRowRemoved,
	[ROW_KINDS.skip]: panelStyles.diffRowGap,
	[ROW_KINDS.more]: panelStyles.diffRowGap,
});

/** Is this row a gap (a skip or a more row: a count, not a line)? */
function isGapRow(row) {
	return row.kind === ROW_KINDS.skip || row.kind === ROW_KINDS.more;
}

/** A row's text: the line itself, or a gap row's words. */
function rowText(row) {
	if (row.kind === ROW_KINDS.skip) return WORDS.skipped(row.count);
	if (row.kind === ROW_KINDS.more) return WORDS.more(row.count);
	return row.text;
}

/** One row of a diff (see the header). */
export function DiffRow({ row, sidePrefix = WORDS.sidePrefix }) {
	const side = DIFF_SIDES[row.kind];
	const prefix = side && !isGapRow(row) ? sidePrefix[side] : null;
	return (
		<li className={clsx(panelStyles.diffRow, ROW_CLASSES[row.kind])}>
			<span className={panelStyles.diffSign} aria-hidden="true">
				{SIGNS[row.kind]}
			</span>
			{prefix ? <span className={styles.visuallyHidden}>{prefix}</span> : null}
			<span>{rowText(row)}</span>
		</li>
	);
}

/** The rows as one list (see the header). */
export default function DiffRows({ rows, sidePrefix = WORDS.sidePrefix }) {
	return (
		<ul role="list" className={panelStyles.diffRows}>
			{rows.map((row, index) => (
				<DiffRow key={index} row={row} sidePrefix={sidePrefix} />
			))}
		</ul>
	);
}
