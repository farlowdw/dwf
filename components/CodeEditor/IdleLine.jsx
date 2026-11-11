/**
 * IdleLine.jsx — the muted line in the output area before any run, "Run the code to see its
 * output (⌘/Ctrl+Enter).", and for an exercise with hints, while its hints area is closed, the
 * cue after it (the wording of 2026-10-26):
 *
 *     Run the code to see its output (⌘/Ctrl+Enter). Hints available: 3 (click [bulb] to reveal).
 *
 *     <IdleLine />                    // an editor without hints: exactly the line it always was
 *     <IdleLine hintCount={3} />      // with the cue
 *     <IdleLine touch />              // on a phone or tablet (touchMode.js): no ⌘/Ctrl+Enter to name (IDLE_HINT_TOUCH)
 *     <IdleLine unavailable />        // no Run to press (the failure frame; Monaco could not load): IDLE_HINT_UNAVAILABLE, never the cue
 *
 *   - [bulb] is the header's light-bulb button's own icon (MUI's LightbulbOutlined: the same path,
 *     LIGHTBULB_PATH, which __tests__/outputPanel.test.js compares with MUI's file), drawn inline
 *     at the text's size and in its colour (styles.module.css > .cueIcon). It is decoration
 *     (aria-hidden): screen readers hear "click the Hints button to reveal" from visually hidden
 *     words in its place (messages.js > HINT_CUE.icon: the button's name as they announce it).
 *   - The SAME component draws the line in the server-rendered placeholder (index.jsx) and in the
 *     editor (OutputPanel.jsx), so a page with an exercise never jumps when the editor arrives
 *     (the hints area is closed on every load: nothing about it is saved). The failure frame
 *     (index.jsx with onRetry) has no light bulb, so it passes hintCount 0.
 *   - The cue goes while the hints area is open (useExercise.js > hints.cue is 0 then) and,
 *     like the rest of the line, once a run has an answer.
 *   - `touch` (2026-10-26): the editor's output area on a touch-first device drops the shortcut
 *     from the line (there is no ⌘/Ctrl+Enter on a phone). The placeholder cannot know the
 *     device and keeps the line it always had.
 *   - `unavailable` (2026-11-10): where there is no Run to press — the failure frame (index.jsx,
 *     with Retry) and an editor whose Run is greyed out because Monaco could not load
 *     (OutputPanel.jsx > editorFailed) — the line says where the output will show instead of
 *     asking for a Run, in the same <p>, so the frame keeps its height; never the cue.
 * No MUI and no hooks here, on purpose: index.jsx (the page's first download) imports this file.
 *
 * HOW TO CHANGE IT
 *   The words: messages.js (IDLE_HINT, IDLE_HINT_TOUCH, IDLE_HINT_UNAVAILABLE, HINT_CUE). The icon's size and place on the line:
 *   styles.module.css > .cueIcon. Another icon: LIGHTBULB_PATH below, and Toolbar.jsx's icon with
 *   it (the cue names the header's button).
 */

import React from 'react';
import { HINT_CUE, IDLE_HINT, IDLE_HINT_TOUCH, IDLE_HINT_UNAVAILABLE } from './messages.js';
import styles from './styles.module.css';

/** MUI's LightbulbOutlined icon (@mui/icons-material, MIT), in its 24 × 24 box: the header's light bulb. */
export const LIGHTBULB_PATH =
	'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7m2.85 11.1-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1';

/** The light bulb as an inline icon (decoration: the words beside it say it). */
export function LightbulbGlyph() {
	return (
		<svg className={styles.cueIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<path d={LIGHTBULB_PATH} />
		</svg>
	);
}

/** "Hints available: 3 (click [bulb] to reveal)." — the bulb in words for screen readers. */
export function HintCue({ count }) {
	return (
		<span>
			{HINT_CUE.before(count)}
			<LightbulbGlyph />
			<span className={styles.visuallyHidden}>{HINT_CUE.icon}</span>
			{HINT_CUE.after}
		</span>
	);
}

/** Is this a number of hints the cue can name (a whole number above 0)? */
function hasHints(count) {
	return Number.isInteger(count) && count > 0;
}

/** The idle line's words: no Run to press, a touch device, or the line it always was. */
function idleWords({ touch, unavailable }) {
	if (unavailable) return IDLE_HINT_UNAVAILABLE;
	return touch ? IDLE_HINT_TOUCH : IDLE_HINT;
}

/**
 * See the header. `hintCount`: the hints the cue names, or 0 (the default) for no cue; `touch`:
 * the line without the shortcut; `unavailable`: there is no Run to press (the line names none, and no cue).
 */
export default function IdleLine({ hintCount = 0, touch = false, unavailable = false }) {
	return (
		<p className={styles.hint}>
			{idleWords({ touch, unavailable })}
			{!unavailable && hasHints(hintCount) ? (
				<>
					{' '}
					<HintCue count={hintCount} />
				</>
			) : null}
		</p>
	);
}
