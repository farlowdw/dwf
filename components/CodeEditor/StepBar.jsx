/**
 * StepBar.jsx — the step bar of a <CodeEditor> with `steps`: it walks the reader through the
 * code one step at a time. Drawn under the code:
 *
 *     Step 2 of 4   Building the table                     [‹ Previous] [Next ›]
 *     The loop fills `dp[i]` from the two cells before it.
 *
 *   - "Step 2 of 4", the step's title (when it has one), Previous / Next, and the step's note
 *     with its inline `code` (codeSpans.js). useGuided.js keeps the current step,
 *     highlights its lines and scrolls them into view, unfolding them (decorations.js >
 *     showStep, revealLines); this file only draws and calls onStepChange(index).
 *   - Previous is off on the first step, Next on the last.
 *   - The buttons never move between steps (a long title wraps beside them); on a phone they
 *     always take a line of their own (StepBar.module.css).
 *   - STALE (`stale`): after Clear or "Use this solution" the step's line numbers no longer
 *     describe the code (useGuided.js), so the bar waits for Reset: the counter and title are
 *     muted, both buttons are disabled, and the note says WORDS.stale instead. (The focus is
 *     never on the bar then: Clear and "Use this solution" are elsewhere.)
 *
 * ACCESSIBILITY
 *   - The two are real <button>s (Tab, Enter, Space), named "Previous step" / "Next step" (the
 *     visible word first, WCAG 2.5.3).
 *   - At either end a button is aria-disabled, NOT disabled: a disabled button drops the
 *     keyboard focus to the page — exactly when the reader has pressed Next to reach the last
 *     step (the same reason Run and Stop are one button, Toolbar.jsx). Its click does nothing.
 *   - The note is a polite live region (aria-atomic): a step change is read out as "Step 3 of
 *     4, lines 7 to 9: Title. The note…" — the visible counter and title are hidden from screen
 *     readers (aria-hidden), because the region says them, with the lines a screen-reader user
 *     cannot see highlighted. A range is said in words ("7 to 9", WORDS.range): screen readers
 *     read the hyphen of "7-9" as "dash", "minus" or not at all. Nothing is read when the page
 *     loads (a live region speaks only when it changes). A stale bar says WORDS.stale alone.
 *   - stepSpeech (the region's whole text) and spokenRanges ("lines 3 to 5, 8") are exported:
 *     useGuided.js says the same words in the editor's status region when this one cannot
 *     speak (a <CodeRef step> to the step already shown) and for <CodeRef lines>.
 *
 * THE PLACEHOLDER  Without onStepChange (index.jsx's server-rendered placeholder) both buttons
 * are plainly disabled and nothing else changes, so the placeholder draws this same bar at the
 * same size and nothing moves when the editor arrives. No hooks: the bar is drawn from its
 * props alone (and __tests__/stepBar.test.js calls it directly).
 *
 * HOW TO CHANGE IT
 *   The words: WORDS below. The look: StepBar.module.css (the editor's --ce-* colours). The
 *   chevrons: CHEVRON_PATHS. Where the bar sits in the editor: CodeEditorClient.jsx (and
 *   index.jsx's placeholder, in the same place).
 */

import React from 'react';
import { splitCodeSpans } from './codeSpans.js';
import stepStyles from './StepBar.module.css';

/** Every word the step bar shows or says. */
export const WORDS = Object.freeze({
	group: 'Steps through the code',
	previous: 'Previous',
	next: 'Next',
	previousStep: 'Previous step',
	nextStep: 'Next step',
	counter: (number, total) => `Step ${number} of ${total}`,
	oneLine: (text) => `line ${text}`,
	someLines: (text) => `lines ${text}`,
	range: (start, end) => `${start} to ${end}`,
	stale: 'Reset the code to follow the steps again.',
});

/** The chevrons' paths, in a 16 × 16 box. */
const CHEVRON_PATHS = Object.freeze({
	previous: 'M10 3.5 5.5 8l4.5 4.5',
	next: 'M6 3.5 10.5 8 6 12.5',
});

/** A move of one step back or forward. */
const BACK = -1;
const FORWARD = 1;

/** `index` kept within the steps: 0 … count - 1 (0 for no steps, or an index that is not a whole number). */
export function clampStepIndex(index, count) {
	if (!Number.isInteger(index) || !Number.isInteger(count) || count <= 0) return 0;
	return Math.min(Math.max(index, 0), count - 1);
}

/** The step after a move of `delta` (BACK or FORWARD) from `index`, kept within the steps. */
export function stepAfter(index, delta, count) {
	return clampStepIndex(clampStepIndex(index, count) + delta, count);
}

/** Is this a [start, end] pair of whole numbers with 1 <= start <= end (what normalizeSteps gives)? */
function isLineRange(value) {
	if (!Array.isArray(value) || value.length !== 2) return false;
	const [start, end] = value;
	return Number.isInteger(start) && Number.isInteger(end) && start >= 1 && start <= end;
}

/** Does `ranges` name exactly one line? */
function isOneLine(ranges) {
	return ranges.length === 1 && ranges[0][0] === ranges[0][1];
}

/** One range as it is read out: '8', or '3 to 5' (see the header). */
function spokenRange([start, end]) {
	return start === end ? String(start) : WORDS.range(start, end);
}

/** "line 8" / "lines 3 to 5, 8", or '' when the ranges name no lines (what a screen reader is told). */
export function spokenRanges(ranges) {
	const usable = Array.isArray(ranges) ? ranges.filter(isLineRange) : [];
	if (usable.length === 0) return '';
	const text = usable.map(spokenRange).join(', ');
	return isOneLine(usable) ? WORDS.oneLine(text) : WORDS.someLines(text);
}

/** A sentence's last mark: a title that already ends with one gets no full stop. */
const SENTENCE_END = /[.!?…]$/;

/** `text` ending as a sentence ends (a full stop added when it has no mark of its own). */
function asSentence(text) {
	return SENTENCE_END.test(text) ? text : `${text}.`;
}

/**
 * What the live region says before the note: "Step 2 of 4, lines 3 to 5: Building the table."
 * (without the lines or the title when the step has none: "Step 2 of 4.").
 */
export function stepAnnouncement(step, index, count) {
	const counter = WORDS.counter(index + 1, count);
	const lines = spokenRanges(step?.ranges);
	const head = lines ? `${counter}, ${lines}` : counter;
	const title = step?.title ? String(step.title).trim() : '';
	return asSentence(title ? `${head}: ${title}` : head);
}

/** A note as it is read out: its inline `code` as plain words. */
function spokenNote(note) {
	if (typeof note !== 'string') return '';
	return splitCodeSpans(note)
		.map((part) => part.text)
		.join('')
		.trim();
}

/** Everything the live region says for a step: "Step 2 of 4, lines 3 to 5: Building the table. The note…" */
export function stepSpeech(step, index, count) {
	const note = spokenNote(step?.note);
	const head = stepAnnouncement(step, index, count);
	return note ? `${head} ${note}` : head;
}

/** A note with its inline `code` drawn in <code>. */
function NoteText({ text }) {
	return splitCodeSpans(text).map((part, index) =>
		part.code ? <code key={index}>{part.text}</code> : <React.Fragment key={index}>{part.text}</React.Fragment>,
	);
}

/** A chevron (decoration: the button's name says where it goes). */
function Chevron({ direction }) {
	return (
		<svg className={stepStyles.chevron} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
			<path d={CHEVRON_PATHS[direction]} />
		</svg>
	);
}

/**
 * Previous or Next. `onMove` null: the placeholder (disabled); `atEnd`: aria-disabled, its
 * click ignored (the focus stays on it; see the header).
 */
function StepButton({ direction, label, name, atEnd, onMove }) {
	const inert = !onMove;
	const handleClick = () => {
		if (!inert && !atEnd) onMove();
	};
	return (
		<button
			type="button"
			className={stepStyles.stepButton}
			aria-label={name}
			aria-disabled={!inert && atEnd ? 'true' : undefined}
			disabled={inert}
			onClick={handleClick}>
			{direction === 'previous' ? <Chevron direction="previous" /> : null}
			<span>{label}</span>
			{direction === 'next' ? <Chevron direction="next" /> : null}
		</button>
	);
}

/** What a button calls to move `delta` steps from `current`, or null for the placeholder (no onStepChange). */
function moveHandler(onStepChange, current, delta, count) {
	if (!onStepChange) return null;
	return () => onStepChange(stepAfter(current, delta, count));
}

/** The live region: the step's announcement (hidden) and its note — or, while stale, WORDS.stale alone. */
function NoteRegion({ step, current, count, stale }) {
	const note = typeof step.note === 'string' ? step.note : '';
	const shown = stale || note !== '';
	const noteClass = shown ? stepStyles.stepNote : `${stepStyles.stepNote} ${stepStyles.stepNoteEmpty}`;
	return (
		<div className={noteClass} aria-live="polite" aria-atomic="true">
			{stale ? (
				WORDS.stale
			) : (
				<>
					<span className={stepStyles.visuallyHidden}>{`${stepAnnouncement(step, current, count)} `}</span>
					<NoteText text={note} />
				</>
			)}
		</div>
	);
}

/**
 * Props: steps ([{ ranges, note, title }], the library's normalizeSteps), index (the current
 * step, from 0; kept within the steps), onStepChange(index) (none: the placeholder's inert bar,
 * or a bar that is not ready yet), stale (true: the bar waits for Reset; see the header).
 * Draws nothing when there are no steps.
 */
export default function StepBar({ steps, index = 0, onStepChange = null, stale = false }) {
	const count = Array.isArray(steps) ? steps.length : 0;
	if (count === 0) return null;
	const current = clampStepIndex(index, count);
	const step = steps[current] ?? {};
	const title = step.title ? String(step.title) : '';
	const onMove = stale ? null : onStepChange;
	const barClass = stale ? `${stepStyles.stepBar} ${stepStyles.stepBarStale}` : stepStyles.stepBar;
	return (
		<div className={barClass} role="group" aria-label={WORDS.group}>
			<div className={stepStyles.stepHeader}>
				<span className={stepStyles.stepCount} aria-hidden="true">
					{WORDS.counter(current + 1, count)}
				</span>
				{title ? (
					<span className={stepStyles.stepTitle} aria-hidden="true">
						{title}
					</span>
				) : null}
				<span className={stepStyles.stepButtons}>
					<StepButton
						direction="previous"
						label={WORDS.previous}
						name={WORDS.previousStep}
						atEnd={current === 0}
						onMove={moveHandler(onMove, current, BACK, count)}
					/>
					<StepButton
						direction="next"
						label={WORDS.next}
						name={WORDS.nextStep}
						atEnd={current === count - 1}
						onMove={moveHandler(onMove, current, FORWARD, count)}
					/>
				</span>
			</div>
			<NoteRegion step={step} current={current} count={count} stale={stale} />
		</div>
	);
}
