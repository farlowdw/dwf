/**
 * ExpectedOutput.jsx — the collapsed "Expected output" block of an exercise (the `expectedOutput`
 * prop), and the part of the exercise panel the server-rendered placeholder draws.
 *
 *     <ExpectedOutput text={settings.expectedOutput} />                  // inside ExercisePanel.jsx
 *     <ExercisePlaceholder expectedOutput={…} hasChecks={…} inert />    // inside index.jsx's placeholder
 *
 *   - A native <details> (closed until the reader opens it; keyboard and screen-reader friendly
 *     without any script): its <summary> says "Expected output", its body is the text in a plain
 *     code block ("(no output)" when the page expects none).
 *   - ExercisePlaceholder is EXACTLY what ExercisePanel.jsx draws before anything was run or
 *     checked: the panel's wrapper, its two (empty) live regions and this block, so the real
 *     editor replaces the placeholder without a jump. __tests__/exerciseRender.test.js compares
 *     the two markups.
 *   - INERT IN THE PLACEHOLDER (`inert`, the HTML attribute on the wrapper)  The real editor
 *     replaces the placeholder with NEW elements, so a block the reader opened (or focused)
 *     while the editor loads would snap shut under them and drop the keyboard focus to the page.
 *     index.jsx sets `inert` while the editor loads or waits to load (no click, no focus, out of
 *     the accessibility tree; it works before any script runs), and leaves it off in the
 *     failure frame, where the block stays readable.
 * No MUI and no Docusaurus theme component here, on purpose: index.jsx (the page's first
 * download) imports this file, and MUI belongs in the editor's lazy chunk only.
 *
 * HOW TO CHANGE IT
 *   The words: WORDS below. The look: ExercisePanel.module.css (.exercise, .expected,
 *   .expectedSummary, .expectedBlock). Something new the panel draws BEFORE a run: draw it in
 *   ExercisePlaceholder too (the render test fails until both match).
 */

import React from 'react';
import { NO_OUTPUT } from './messages.js';
import panelStyles from './ExercisePanel.module.css';

/** Every word this file shows. */
export const WORDS = Object.freeze({
	expectedTitle: 'Expected output',
});

/** The expected text as shown: a final newline dropped (no empty last line), "(no output)" for none. */
export function expectedTextOf(text) {
	const source = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
	const shown = source.endsWith('\n') ? source.slice(0, -1) : source;
	return shown === '' ? NO_OUTPUT : shown;
}

/** The collapsed "Expected output" block (see the header). */
export function ExpectedOutput({ text }) {
	return (
		<details className={panelStyles.expected}>
			<summary className={panelStyles.expectedSummary}>{WORDS.expectedTitle}</summary>
			<pre className={panelStyles.expectedBlock} tabIndex={0}>
				<code>{expectedTextOf(text)}</code>
			</pre>
		</details>
	);
}

/**
 * The exercise panel's wrapper (shared with ExercisePanel.jsx, so the two can never differ): the
 * two polite live regions exist from the start, because a live region that appears together
 * with its words is often not read out.
 *   verdict         the run's verdict line (in the first live region)
 *   verdictDetails  what belongs to the verdict but is not read out: the output diff, drawn
 *                   right under its verdict, so it never ends up under the check's headline
 *   checkMessage    Check's line or notice (in the second live region)
 *   children        the rest (the check's details, then the "Expected output" block)
 *   inert           the placeholder's copy only (see INERT IN THE PLACEHOLDER in the header)
 * Before any run only the two (empty) regions and the children are drawn: ExercisePlaceholder.
 */
export function ExerciseFrame({ verdict = null, verdictDetails = null, checkMessage = null, inert = false, children }) {
	return (
		<div className={panelStyles.exercise} inert={inert || undefined}>
			<div aria-live="polite">{verdict}</div>
			{verdictDetails}
			<div aria-live="polite">{checkMessage}</div>
			{children}
		</div>
	);
}

/**
 * What the exercise panel looks like before any run or check (index.jsx's placeholder draws it).
 * Nothing when the editor is not an exercise (no `expectedOutput`, no `tests`). `inert`: see
 * INERT IN THE PLACEHOLDER in the header (without it the markup is exactly the panel's).
 */
export function ExercisePlaceholder({ expectedOutput = null, hasChecks = false, inert = false }) {
	const hasExpected = typeof expectedOutput === 'string';
	if (!hasExpected && !hasChecks) return null;
	return <ExerciseFrame inert={inert}>{hasExpected ? <ExpectedOutput text={expectedOutput} /> : null}</ExerciseFrame>;
}

export default ExpectedOutput;
