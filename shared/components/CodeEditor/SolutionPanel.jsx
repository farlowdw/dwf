/**
 * SolutionPanel.jsx — the panel the **Solution** button opens: Monaco's diff view of the reader's
 * code against the page's solution (the `solution` prop), with **Use this solution** and
 * **Close**.
 *
 *     <SolutionPanel
 *       id="…"                   the panel's DOM id (the Solution button's aria-controls)
 *       monaco={monaco}          the Monaco the editor loaded (CodeEditorClient.jsx > monacoRef)
 *       readerCode={…}           the reader's code now (follow their edits while it is open)
 *       solution={…}             the solution for the editor's current language
 *       language="python"        Monaco's language id (languages.js > monaco)
 *       theme="vs-dark"          the editor's Monaco theme (the reader's, useEditorTheme.js; Monaco
 *                                has one theme per page, so the diff always shows the editor's)
 *       editorOptions={…}        the editor's Monaco options (for the same font and line height)
 *       onUse={…}                "Use this solution": the editor puts the solution in, as ONE
 *                                undoable edit (useExercise.js; ⌘/Ctrl+Z brings the
 *                                reader's code back)
 *       onClose={…}              "Close"
 *     />
 *
 * WHAT THE READER SEES
 *   A header bar — "Solution", a colour key (red: your code, green: the solution, in the diff
 *   colours of the editor's theme: editorThemes.js > diffKeyOf; outlined, as the diff draws
 *   them, in a high-contrast theme) and the two buttons — over the diff: the reader's code on the left, the
 *   solution on the right (one column on a phone or a narrow page, the reader's removed lines
 *   in red above the solution's in green). Both sides are read-only: the reader changes their
 *   code in the editor above, and the diff follows. When their code already is the solution, a
 *   note says so and "Use this solution" is greyed out. It is greyed out too when the solution
 *   is empty (the page gives none for this language): using it would only empty the editor.
 *
 * MONACO, IMPERATIVELY  The diff view and its two text models are made and taken down by
 *   solutionDiff.js (createSolutionDiff), not by @monaco-editor/react's <DiffEditor>, which
 *   disposes its models in the wrong order (that file's header says why and in which order it
 *   goes). It is made once, when the panel mounts (an effect, so React's StrictMode or Fast
 *   Refresh simply makes it again), and later props reach it through update(). The view's
 *   height starts at an estimate (solutionDiff.js > estimateDiffHeight: the longer side's
 *   lines) and then follows the diff's real height, one change per frame (autoHeight.js),
 *   between the CSS min- and max-height of .diffHost. On the server (the build) only the frame
 *   is drawn: effects do not run there.
 *
 * CONTRAST  In light mode the two buttons are drawn in the theme's darker blue (primary.dark,
 *   #075f91: 6.2:1 on the header grey #f3f3f3, and 6.9:1 under the white label of "Use this
 *   solution"), not MUI's primary.main (#0b89d0: 3.4:1 and 3.8:1, under the 4.5:1 a 13 px label
 *   needs): buttonInk.js > LIGHT_PRIMARY_INK_SX (shared with the header's Run and Check),
 *   through MUI Button's own colour variables, so the disabled look stays MUI's. Dark mode
 *   keeps MUI's blue (#48adf6 on #252526: 6.3:1). The site-wide MUI theme is left alone (it
 *   colours every MUI component on the site).
 *
 * HOW TO CHANGE IT
 *   The words: WORDS below. The look: SolutionPanel.module.css (--sp-max-height: the tallest
 *   the diff grows before it scrolls); the buttons' light-mode blue: buttonInk.js
 *   (check any new colour at 4.5:1 on #f3f3f3, hover included). What the diff view shows and
 *   copies from the editor: solutionDiff.js (DIFF_EDITOR_OPTIONS, INHERITED_EDITOR_OPTIONS,
 *   INLINE_BELOW_PX).
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import { createAutoHeight } from './autoHeight.js';
import { LIGHT_PRIMARY_INK_SX } from './buttonInk.js';
import { diffKeyOf } from './editorThemes.js';
import { hasText } from './exerciseView.js';
import { PLAIN_TEXT, createSolutionDiff, estimateDiffHeight, isSameCode } from './solutionDiff.js';
import styles from './styles.module.css';
import solutionStyles from './SolutionPanel.module.css';

/** Every word this panel shows. */
export const WORDS = Object.freeze({
	title: 'Solution',
	keyYours: 'your code',
	keySolution: 'the solution',
	use: 'Use this solution',
	useTooltip: 'Put the solution in the editor (undo with ⌘/Ctrl+Z)',
	sameTooltip: 'Your code is already the solution',
	emptyTooltip: 'There is no solution for this language',
	close: 'Close',
	same: 'Your code is the same as the solution.',
	yourCode: 'Your code',
	theSolution: 'The solution',
});

/** The two sides' names for screen readers (Monaco's originalAriaLabel / modifiedAriaLabel). */
const SIDE_LABELS = Object.freeze({ original: WORDS.yourCode, modified: WORDS.theSolution });

/**
 * Spread on a tooltip's <span> wrapper: MUI's Tooltip would give the span its text as
 * aria-label (not allowed on a plain span); the button inside has its own name (Toolbar.jsx does
 * the same).
 */
const UNLABELLED = Object.freeze({ 'aria-label': undefined });

/**
 * The colour key: a red swatch for the reader's code, a green one for the solution (`outlined`:
 * drawn as outlines, as a high-contrast theme's diff draws them). A key to colours only, so
 * screen readers skip it: they get the two sides' names from Monaco (SIDE_LABELS) and its
 * accessible diff viewer (F7 in the diff).
 */
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

/**
 * The key's colours for the panel's element (diffKeyOf): its --sp-key-* properties, left out when
 * null (VS Code's themes: the stylesheet's own values, unchanged).
 */
export function keyStyleOf(key) {
	const style = {};
	if (key.yours) style['--sp-key-yours'] = key.yours;
	if (key.solution) style['--sp-key-solution'] = key.solution;
	return style;
}

/** Why "Use this solution" is greyed out (its tooltip), or null when it can be used. */
function blockedReasonOf({ same, empty }) {
	if (empty) return WORDS.emptyTooltip;
	if (same) return WORDS.sameTooltip;
	return null;
}

/** "Use this solution" (greyed out when there is nothing to use; the tooltip says why) and "Close". */
function Actions({ same, empty, onUse, onClose }) {
	const blockedReason = blockedReasonOf({ same, empty });
	return (
		<div className={solutionStyles.actions}>
			<Tooltip title={blockedReason ?? WORDS.useTooltip}>
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

/**
 * The diff view, or null with a console warning when Monaco cannot make it: the panel then stays
 * without its diff, and the editor keeps working (a throw here would take the whole editor down
 * to its failure frame).
 */
function tryCreateDiff(monaco, host, options) {
	try {
		return createSolutionDiff(monaco, host, options);
	} catch (error) {
		console.warn('CodeEditor: the solution diff could not be made.', error);
		return null;
	}
}

/**
 * The diff view in `hostRef`'s element: made once per Monaco with the first props (solutionDiff.js),
 * later props through update(), taken down when the panel goes.
 */
function useSolutionDiff(hostRef, { monaco, readerCode, solution, language, theme, editorOptions }) {
	const viewRef = useRef(null);

	useEffect(() => {
		const host = hostRef.current;
		if (!monaco || !host) return undefined;
		const autoHeight = createAutoHeight({
			setHeight: (px) => {
				host.style.height = `${px}px`;
			},
		});
		const view = tryCreateDiff(monaco, host, {
			readerCode,
			solution,
			language,
			theme,
			editorOptions,
			labels: SIDE_LABELS,
			onContentHeight: autoHeight.fit,
		});
		if (!view) return () => autoHeight.dispose();
		viewRef.current = view;
		return () => {
			viewRef.current = null;
			view.dispose();
			autoHeight.dispose();
		};
		// Only `monaco` on purpose: the first props make the view, the effect below passes on the rest.
	}, [monaco]);

	useEffect(() => {
		viewRef.current?.update({ readerCode, solution, language, theme });
	}, [readerCode, solution, language, theme]);
}

/** See the header. */
export default function SolutionPanel({
	id,
	monaco,
	readerCode = '',
	solution = '',
	language = PLAIN_TEXT,
	theme,
	editorOptions,
	onUse,
	onClose,
}) {
	const titleId = useId();
	const hostRef = useRef(null);
	const [firstHeight] = useState(() => estimateDiffHeight(readerCode, solution, editorOptions));
	const empty = !hasText(solution);
	const same = !empty && isSameCode(readerCode, solution);
	useSolutionDiff(hostRef, { monaco, readerCode, solution, language, theme, editorOptions });
	const key = diffKeyOf(theme);
	return (
		<section id={id} className={solutionStyles.solution} style={keyStyleOf(key)} aria-labelledby={titleId}>
			<div className={solutionStyles.header}>
				<span id={titleId} className={solutionStyles.title}>
					{WORDS.title}
				</span>
				<ColourKey outlined={key.outlined} />
				<Actions same={same} empty={empty} onUse={onUse} onClose={onClose} />
			</div>
			<div aria-live="polite">{same ? <p className={solutionStyles.same}>{WORDS.same}</p> : null}</div>
			<div ref={hostRef} className={solutionStyles.diffHost} style={{ height: `${firstHeight}px` }} />
		</section>
	);
}
