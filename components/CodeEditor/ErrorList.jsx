/**
 * ErrorList.jsx — the rows under the output's status line after a FAILED run (or a Bash script
 * that ran past an error, or a TypeScript run its syntax errors stopped: runErrors.js decides):
 * one per place in the reader's code that the code runner's errors point to, so the reader sees
 * at once where to look, and one press takes them there.
 *
 *     (!) Line 4 · IndexError: list index out of range                     [Go to line]
 *     /!\ Line 9 · unused variable 'x'                                     [Go to line]
 *         2 more in the output below
 *
 * The locations are the library's (lib/codeRunner/errorLocations.js > errorLocations:
 * [{ line, column, endColumn, message, severity: 'error' | 'warning', stage }], lines of the
 * code the reader SEES, sorted); runMarkers.js puts the same ones on the code as squiggles.
 *   - An error's row has an error icon and the site's error colours, a warning's a warning
 *     icon and the warning colours (the code-line tokens of shared/css/_code-blocks.scss, the same
 *     colours as a code block's highlighted error / warning lines), light and dark.
 *   - The message is its first line, at most MAX_MESSAGE_CHARS characters (the full text stays
 *     in the output block and in the squiggle's hover); an empty one reads "Error" / "Warning".
 *   - At most MAX_ROWS rows; past that one muted line says how many more the output holds. When
 *     not all fit, a warning never takes an error's place: every error gets a row first (up to
 *     MAX_ROWS), the warnings fill the rows left, the first lines first; the rows stay in line
 *     order (a C program missing its #include lines has two warnings per library function
 *     above the one error that failed it — that error keeps its row).
 *   - Go to line calls onGoToLine(line, location) — the editor puts its cursor there
 *     (runMarkers.js > goToRunLocation). Without onGoToLine the rows have no button (the code
 *     shown is not the code that ran: another language, say).
 *   - Nothing at all when there is no location (a segfault, an error in a library's file).
 *
 * ACCESSIBILITY  A list (role="list" too: Safari drops the list role of a list without
 *   bullets) labelled WORDS.listLabel; each row starts with "Error:" or "Warning:" for screen
 *   readers only (the icon says it to the eye); each button is a real <button> named "Go to
 *   line 4" (its visible words plus the line, so voice control finds it by what it shows).
 *   The list is not a live region: the status line above it already announces the failure.
 *
 * Only draws: the locations and onGoToLine come from useRunErrors.js (through
 * OutputPanel.jsx).
 *
 * HOW TO CHANGE IT
 *   The words: WORDS. How many rows, how long a message: MAX_ROWS, MAX_MESSAGE_CHARS. Which
 *   locations get a row when not all fit: fittingLocations. The look
 *   (colours, spacing, the phone layout, the button): ErrorList.module.css. Which locations
 *   there are: the library's errorLocations.js.
 */

import React from 'react';
import clsx from 'clsx';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
// Not called `styles`: __tests__/files.test.js checks every `styles.<class>` against
// styles.module.css; __tests__/errorList.test.js checks these against ErrorList.module.css.
import listStyles from './ErrorList.module.css';

/** Every word the list shows. */
export const WORDS = Object.freeze({
	listLabel: 'Problems by line',
	line: 'Line',
	goTo: 'Go to line',
	more: 'more in the output below',
	severity: Object.freeze({ error: 'Error', warning: 'Warning' }),
});

/** The most rows the list shows; the rest are counted in one line (moreText). */
export const MAX_ROWS = 10;

/** The longest message a row shows (characters, the ellipsis included). */
export const MAX_MESSAGE_CHARS = 300;

/** A location's severity that is a warning (anything else is an error). */
const SEVERITY_WARNING = 'warning';

/** Every other location's severity. */
const SEVERITY_ERROR = 'error';

/** The first line of the code. */
const FIRST_LINE = 1;

/** Between "Line 4" and the message. */
const PART_SEPARATOR = ' · ';

/** Ends a shortened message. */
const ELLIPSIS = '…';

/** "Line 4". */
export function lineText(line) {
	return `${WORDS.line} ${line}`;
}

/** The Go to line button's accessible name: "Go to line 4". */
export function goToLabel(line) {
	return `${WORDS.goTo} ${line}`;
}

/** The line under the rows when some are left out: "2 more in the output below". */
export function moreText(count) {
	return `${count} ${WORDS.more}`;
}

/** 'warning' or 'error'. */
function severityOf(location) {
	return location.severity === SEVERITY_WARNING ? SEVERITY_WARNING : SEVERITY_ERROR;
}

/** The word for a severity: "Error" / "Warning" (an unknown one reads "Error"). */
function severityWord(severity) {
	return Object.hasOwn(WORDS.severity, severity) ? WORDS.severity[severity] : WORDS.severity.error;
}

/** The first line of a message, trimmed ('' when it is not a string). */
function firstLineOf(message) {
	if (typeof message !== 'string') return '';
	return message.trim().split('\n')[0].trim();
}

/**
 * The message a row shows: its first line, at most MAX_MESSAGE_CHARS characters long (counted
 * as the reader sees them, so an emoji is never cut in half); "Error" / "Warning" when it has none.
 */
export function shortMessage(message, severity) {
	const firstLine = firstLineOf(message);
	if (firstLine === '') return severityWord(severity);
	const characters = Array.from(firstLine);
	if (characters.length <= MAX_MESSAGE_CHARS) return firstLine;
	const kept = characters.slice(0, MAX_MESSAGE_CHARS - ELLIPSIS.length).join('');
	return `${kept.trimEnd()}${ELLIPSIS}`;
}

/** Is this a location with a line to show (a whole number from 1 up)? */
function hasLine(location) {
	return Boolean(location) && Number.isInteger(location.line) && location.line >= FIRST_LINE;
}

/** How many rows to show: `maxRows` when it is a whole number from 1 up, else MAX_ROWS. */
function rowLimit(maxRows) {
	return Number.isInteger(maxRows) && maxRows >= 1 ? maxRows : MAX_ROWS;
}

/**
 * The locations that get a row when at most `limit` fit (see the header): every error first, up
 * to `limit`, then the warnings in the room left, the first ones first; in their own order.
 */
export function fittingLocations(locations, limit) {
	const errorCount = locations.filter((location) => severityOf(location) === SEVERITY_ERROR).length;
	const room = { [SEVERITY_ERROR]: limit, [SEVERITY_WARNING]: Math.max(0, limit - errorCount) };
	const taken = { [SEVERITY_ERROR]: 0, [SEVERITY_WARNING]: 0 };
	return locations.filter((location) => {
		const severity = severityOf(location);
		taken[severity] += 1;
		return taken[severity] <= room[severity];
	});
}

/**
 * The rows to draw: { rows: [{ key, line, severity, message, location }], hiddenCount } — the
 * locations with a line, at most `maxRows` of them (MAX_ROWS when it is not a whole number from
 * 1 up; errors before warnings: fittingLocations), and how many were left out.
 */
export function listRows(locations, { maxRows = MAX_ROWS } = {}) {
	const usable = (Array.isArray(locations) ? locations : []).filter(hasLine);
	const rows = fittingLocations(usable, rowLimit(maxRows)).map((location, index) => {
		const severity = severityOf(location);
		return {
			key: `${index}:${location.line}:${location.column ?? ''}`,
			line: location.line,
			severity,
			message: shortMessage(location.message, severity),
			location,
		};
	});
	return { rows, hiddenCount: usable.length - rows.length };
}

/** One row: icon, "Line 4 · message", and the Go to line button when there is somewhere to go. */
function ErrorRow({ row, onGoToLine }) {
	const isWarning = row.severity === SEVERITY_WARNING;
	const Icon = isWarning ? WarningAmberOutlinedIcon : ErrorOutlineOutlinedIcon;
	return (
		<li className={clsx(listStyles.row, isWarning ? listStyles.rowWarning : listStyles.rowError)}>
			<span className={listStyles.icon} aria-hidden="true">
				<Icon fontSize="inherit" />
			</span>
			<span className={listStyles.text}>
				<span className={listStyles.visuallyHidden}>{`${severityWord(row.severity)}: `}</span>
				<span className={listStyles.line}>{lineText(row.line)}</span>
				{PART_SEPARATOR}
				<span className={listStyles.message}>{row.message}</span>
			</span>
			{onGoToLine ? (
				<button type="button" className={listStyles.goTo} aria-label={goToLabel(row.line)} onClick={() => onGoToLine(row.line, row.location)}>
					{WORDS.goTo}
				</button>
			) : null}
		</li>
	);
}

/**
 * Props: locations (errorLocations' list; nothing is drawn when it is empty), onGoToLine
 * ((line, location) => void; no buttons when it is not a function), maxRows (default MAX_ROWS).
 */
export default function ErrorList({ locations, onGoToLine = null, maxRows = MAX_ROWS }) {
	const { rows, hiddenCount } = listRows(locations, { maxRows });
	if (rows.length === 0) return null;
	const goTo = typeof onGoToLine === 'function' ? onGoToLine : null;
	return (
		<ul role="list" className={listStyles.list} aria-label={WORDS.listLabel}>
			{rows.map((row) => (
				<ErrorRow key={row.key} row={row} onGoToLine={goTo} />
			))}
			{hiddenCount > 0 ? <li className={listStyles.more}>{moreText(hiddenCount)}</li> : null}
		</ul>
	);
}
