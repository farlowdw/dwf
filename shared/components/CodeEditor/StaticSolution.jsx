/**
 * StaticSolution.jsx — the Solution panel of the STATIC VIEW (a phone or tablet before "Tap to
 * edit": CodeEditorClient.jsx renders it there instead of SolutionPanel.jsx, which needs Monaco's
 * diff view). The same header — "Solution", the colour key, **Use this solution**, **Close** —
 * over a plain line diff of the reader's code against the page's solution, drawn as rows
 * (DiffRows.jsx: the reader's lines in red with "−", the solution's in green with "+", every
 * matching line shown between them).
 *
 *     <StaticSolution
 *       id="…"               the panel's DOM id (the Solution button's aria-controls)
 *       readerCode={…}       the reader's code now (useExercise.js > solutionPanel.readerCode)
 *       solution={…}         the solution for the editor's current language
 *       theme={theme}        the editor's concrete theme (useEditorTheme.js: { name, … })
 *       onUse={…}            "Use this solution": the static view's text becomes the solution
 *                            (useExercise.js > applySolution through the surface); Reset brings
 *                            the PAGE's code back (there is no undo stack without Monaco)
 *       onClose={…}          "Close"
 *       restored={false}     true while the language shows a RESTORED DRAFT (useDrafts.js >
 *                            restored.has(language)): "Use this solution" is then greyed out
 *                            with WORDS.restoredTooltip — the draft is the only reader-written
 *                            code the static view can show, the replacement would be saved
 *                            over it at once and Reset brings the snippet, not the draft
 *                            (2026-10-26); in the Monaco view the same action is one undoable edit
 *     />
 *
 * WHAT THE READER SEES  The header bar as SolutionPanel.jsx draws it: the title, a red swatch
 *   for their code and a green one for the solution in the diff colours of the editor's theme
 *   (editorThemes.js > diffKeyOf; outlined in a high-contrast theme), and the two buttons. Under
 *   it the rows, scrolling inside the box past --sp-max-height, their bands in the key's own
 *   colours (StaticSolution.module.css sets the --ce-band-* properties DiffRows reads from the
 *   key's --sp-key-* ones, so the key and the rows always match; a high-contrast theme, whose
 *   diff has no fill, colours the signs instead). The whole diff is shown — STATIC_DIFF_CONTEXT
 *   keeps every matching line, so the rows read as the code — up to STATIC_DIFF_MAX_ROWS rows,
 *   then one "… N more lines" row. When the code already is the solution, a note says so and
 *   "Use this solution" is greyed out; it is greyed out too when the page gives no solution for
 *   this language (using it would only empty the code), and while the language shows a restored
 *   draft (`restored`: Tap to edit first, where ⌘/Ctrl+Z undoes it).
 *   The comparison is the library's compareOutput (lib/codeRunner/exercise.js), made for program
 *   output: spaces at the ends of lines and blank lines at the very end do not count. Code that
 *   differs only there gets no rows and its own note (WORDS.onlyBlanksDiffer), and "Use this
 *   solution" stays usable (solutionDiff.js > isSameCode ignores only the very end).
 *
 * ACCESSIBILITY  A titled region (aria-labelledby), the colour key hidden from screen readers
 *   (they hear each row's side instead: "Your code: " / "The solution: ", DiffRows's sidePrefix),
 *   the notes in a polite live region, the rows in a focusable region named WORDS.diffLabel so a
 *   keyboard can scroll them (as the output diff's region, ExercisePanel.jsx). The buttons' light
 *   mode blue is buttonInk.js's, as in SolutionPanel.jsx.
 *
 * HOW TO CHANGE IT
 *   The words: WORDS below (the shared ones — the title, the key, the buttons, "already the
 *   solution" — are SolutionPanel.jsx > WORDS, so both panels say the same). The look:
 *   SolutionPanel.module.css (the header, the key, the note) and StaticSolution.module.css (the
 *   rows' box and the band bridge). How much shows: STATIC_DIFF_CONTEXT, STATIC_DIFF_MAX_ROWS.
 *   The rows themselves: DiffRows.jsx. The key and the buttons are drawn here exactly as
 *   SolutionPanel.jsx's private ColourKey and Actions draw them: when both panels change, export
 *   those two from SolutionPanel.jsx and drop the copies below. Tests:
 *   __tests__/staticSolution.test.js.
 */

import React, { useId } from 'react';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { LIGHT_PRIMARY_INK_SX } from './buttonInk.js';
import { compareOutput } from './lib/codeRunner/exercise.js';
import { diffKeyOf } from './editorThemes.js';
import { diffRows, hasText } from './exerciseView.js';
import { isSameCode } from './solutionDiff.js';
import { WORDS as SOLUTION_WORDS, keyStyleOf } from './SolutionPanel.jsx';
import DiffRows from './DiffRows.jsx';
import styles from './styles.module.css';
import solutionStyles from './SolutionPanel.module.css';
import ownStyles from './StaticSolution.module.css';

/** Every matching line is shown: the rows read as the code, with no "⋯ N matching lines" gaps. */
export const STATIC_DIFF_CONTEXT = Number.POSITIVE_INFINITY;

/** The most rows the static diff shows; the rest becomes one "… N more lines" row. */
export const STATIC_DIFF_MAX_ROWS = 400;

/** The words of this panel only; the shared ones are SolutionPanel.jsx > WORDS. */
export const WORDS = Object.freeze({
	...SOLUTION_WORDS,
	useTooltipStatic: "Put the solution in (Reset brings the page's code back)",
	restoredTooltip: 'Tap to edit first: your saved code would be lost here (in the editor ⌘/Ctrl+Z undoes it)',
	diffLabel: 'Differences from your code to the solution',
	onlyBlanksDiffer: 'Your code differs from the solution only in spaces at the ends of lines.',
	sidePrefix: Object.freeze({ yours: `${SOLUTION_WORDS.yourCode}: `, expected: `${SOLUTION_WORDS.theSolution}: ` }),
});

/**
 * Spread on a tooltip's <span> wrapper: MUI's Tooltip would give the span its text as
 * aria-label (not allowed on a plain span); the button inside has its own name (SolutionPanel.jsx
 * and Toolbar.jsx do the same).
 */
const UNLABELLED = Object.freeze({ 'aria-label': undefined });

/**
 * The rows of the reader's code against the solution (DiffRows.jsx's shape): the reader's lines
 * are the removed (−) rows, the solution's the added (+) rows, every matching line between them
 * (see the header for what does not count). [] when nothing differs.
 */
export function solutionRows(readerCode, solution, { context = STATIC_DIFF_CONTEXT, maxRows = STATIC_DIFF_MAX_ROWS } = {}) {
	return diffRows(compareOutput(readerCode, solution).diff, { context, maxRows });
}

/** The colour key, as SolutionPanel.jsx > ColourKey draws it (see HOW TO CHANGE IT). */
function ColourKey({ outlined }) {
	const className = outlined ? `${solutionStyles.key} ${solutionStyles.keyOutlined}` : solutionStyles.key;
	return (
		<span className={className} aria-hidden="true">
			<span className={solutionStyles.keyItem}>
				<span className={`${solutionStyles.swatch} ${solutionStyles.swatchYours}`} />
				{WORDS.keyYours}
			</span>
			<span className={solutionStyles.keyItem}>
				<span className={`${solutionStyles.swatch} ${solutionStyles.swatchSolution}`} />
				{WORDS.keySolution}
			</span>
		</span>
	);
}

/** Why "Use this solution" is greyed out (its tooltip), or null when it can be used. Exported for the tests. */
export function blockedReasonOf({ same, empty, restored = false }) {
	if (empty) return WORDS.emptyTooltip;
	if (same) return WORDS.sameTooltip;
	if (restored) return WORDS.restoredTooltip;
	return null;
}

/** "Use this solution" (greyed out when there is nothing to use, or a restored draft to lose; the tooltip says why) and "Close", as SolutionPanel.jsx > Actions. */
function Actions({ same, empty, restored, onUse, onClose }) {
	const blockedReason = blockedReasonOf({ same, empty, restored });
	return (
		<div className={solutionStyles.actions}>
			<Tooltip title={blockedReason ?? WORDS.useTooltipStatic}>
				<span className={styles.tooltipAnchor} {...UNLABELLED}>
					<Button
						size="small"
						variant="contained"
						disableElevation
						onClick={onUse}
						disabled={blockedReason !== null}
						sx={LIGHT_PRIMARY_INK_SX.contained}>
						{WORDS.use}
					</Button>
				</span>
			</Tooltip>
			<Button size="small" variant="text" onClick={onClose} sx={LIGHT_PRIMARY_INK_SX.text}>
				{WORDS.close}
			</Button>
		</div>
	);
}

/** The note over the rows: "already the solution", "only spaces differ", or nothing. */
function noteOf({ same, empty, rowCount }) {
	if (same) return WORDS.same;
	if (!empty && rowCount === 0) return WORDS.onlyBlanksDiffer;
	return null;
}

/** See the header. */
export default function StaticSolution({ id, readerCode = '', solution = '', theme, onUse, onClose, restored = false }) {
	const titleId = useId();
	const empty = !hasText(solution);
	const same = !empty && isSameCode(readerCode, solution);
	const rows = same || empty ? [] : solutionRows(readerCode, solution);
	const note = noteOf({ same, empty, rowCount: rows.length });
	const key = diffKeyOf(theme?.name);
	const rowsClassName = key.outlined ? `${ownStyles.rows} ${ownStyles.rowsOutlined}` : ownStyles.rows;
	return (
		<section id={id} className={solutionStyles.solution} style={keyStyleOf(key)} aria-labelledby={titleId}>
			<div className={solutionStyles.header}>
				<span id={titleId} className={solutionStyles.title}>
					{WORDS.title}
				</span>
				<ColourKey outlined={key.outlined} />
				<Actions same={same} empty={empty} restored={restored} onUse={onUse} onClose={onClose} />
			</div>
			<div aria-live="polite">{note ? <p className={solutionStyles.same}>{note}</p> : null}</div>
			<div className={rowsClassName} role="region" aria-label={WORDS.diffLabel} tabIndex={0}>
				<DiffRows rows={rows} sidePrefix={WORDS.sidePrefix} />
			</div>
		</section>
	);
}
