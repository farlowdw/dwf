/**
 * HintList.jsx — an exercise's hints area (the `hints` prop), between the code and the output.
 * The header's light bulb opens and closes it (Toolbar.jsx; the design of 2026-10-26):
 *
 *     +- Hint 1 of 3 --------------------- (eye-off) -+    shown: the crossed-out eye hides it
 *     |  Sort the list first.                         |
 *     +-----------------------------------------------+
 *     +- Hint 2 of 3 ------------------------- (eye) -+    folded: its header row only; the open
 *     +-----------------------------------------------+    eye shows it again
 *     [Show hint 3 of 3]
 *
 *     <HintList id={areaId} hints={['Sort the list first.', 'Two pointers: `i` and `j`.', '…']}
 *               state={{ open: true, revealed: 2, folded: [1], announce: 2 }}
 *               onRevealNext={() => …} onToggleFold={(index) => …} />
 *
 *   - The revealed hints are stacked in order, hint 1 on top. Each is a box: a header row with
 *     "Hint 2 of 3" on the left and an eye button on the far right, the text under it. The eye
 *     says what a click DOES, as a password field's does (decided on 2026-10-28): the
 *     crossed-out eye while the text shows (a click hides it), the open eye while the hint is
 *     folded (a click shows it) — not the hint's current state. The text may hold inline
 *     `code` (backticks, as in Markdown: codeSpans.js, shared with the step notes); nothing else of
 *     Markdown is read. The eye folds the hint to its header row, and unfolds it.
 *   - While some hint is still hidden, "Show hint 3 of 3" under the last revealed one reveals the
 *     next (unfolded); it goes once every hint is revealed.
 *   - Closed (the light bulb not pressed), nothing of the area is drawn; the editor keeps the
 *     state (useExercise.js), so a reopen shows it exactly as it was. The rules of the state:
 *     exerciseView.js > HINTS.
 *
 * ACCESSIBILITY
 *   - The area is a group named "Hints", with the id the light bulb's aria-controls names.
 *   - Each eye is a real <button>: "Hide hint 2" / "Show hint 2" (aria-label, and the same words
 *     as its tooltip, `title`), aria-expanded, aria-controls naming the hint's text — which stays
 *     in the page with `hidden` while folded, so that id always names an element.
 *   - "Show hint 3 of 3" keeps the keyboard focus while more hints remain (the SAME element, with
 *     no `key` and outside the list of hints: the new hint is added above it). The press that
 *     reveals the last one moves the focus to that hint's eye, since the button goes (a removed
 *     button would drop the focus to the page). Which of the two: exerciseView.js >
 *     focusAfterReveal.
 *   - A polite live region (role="status", visually hidden), there from the start and OUTSIDE the
 *     area so it lives through a close, reads out the hint a reveal brought: "Hint 2 of 3: Two
 *     pointers: i and j." (inline code as plain words; state.announce: the first open and each
 *     "Show hint" press). It holds the words only a few seconds (useFleetingText.js), and folding
 *     that hint empties it at once, so a screen reader in browse mode does not meet the hint a
 *     second time there, or a hint the reader folded. The area itself is not live: a reopen
 *     says nothing new, and a fold is said by its eye's aria-expanded.
 * No MUI here: plain HTML and two inline icons (MUI's Visibility / VisibilityOff paths), so it
 * renders on the server as it is.
 *
 * HOW TO CHANGE IT
 *   The words: WORDS below. The look: HintList.module.css. The icons: EYE_PATHS. Which hints
 *   count (blank ones are dropped): props.js > normalizeHints. What the light bulb, a "Show hint"
 *   press and an eye do to the state: exerciseView.js (toggleHintsArea, revealNextHint,
 *   toggleHintFold; the focus after a press: focusAfterReveal). How long the live region holds
 *   a hint: useFleetingText.js > FLEETING_HOLD_MS. Where the area sits: CodeEditorClient.jsx.
 */

import React, { useEffect, useId, useRef } from 'react';
import { splitCodeSpans } from './codeSpans.js';
import { FOCUS_AFTER_REVEAL, focusAfterReveal, hintsStateOf, nextHintNumber } from './exerciseView.js';
import { useFleetingText } from './useFleetingText.js';
import hintStyles from './HintList.module.css';

/** Every word the hints area shows or says. */
export const WORDS = Object.freeze({
	region: 'Hints',
	hintOf: (number, total) => `Hint ${number} of ${total}`,
	showNext: (number, total) => `Show hint ${number} of ${total}`,
	fold: (number) => `Hide hint ${number}`,
	unfold: (number) => `Show hint ${number}`,
	announcement: (number, total, text) => `Hint ${number} of ${total}: ${text}`,
});

/**
 * The eye's two icons, MUI's Visibility and VisibilityOff (@mui/icons-material, MIT), in their
 * 24 × 24 box, named by what a click does: `show` (the open eye) while the hint is folded,
 * `hide` (the crossed-out eye) while its text shows — the password-field convention (the header).
 */
export const EYE_PATHS = Object.freeze({
	show: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5M12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5m0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3',
	hide:
		'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7M2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2m4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3z',
});

/** A hint's text as it is read out: its inline `code` as plain words. */
function spokenHint(text) {
	return splitCodeSpans(text)
		.map((part) => part.text)
		.join('')
		.trim();
}

/** What the live region says for `state.announce` ('' for none): "Hint 2 of 3: …". */
export function hintAnnouncement(hints, state) {
	const list = Array.isArray(hints) ? hints : [];
	const { announce } = hintsStateOf(state, list.length);
	if (announce === 0) return '';
	return WORDS.announcement(announce, list.length, spokenHint(list[announce - 1]));
}

/** A hint's text with its inline `code` as <code> elements. */
function HintText({ text }) {
	return splitCodeSpans(text).map((part, index) =>
		part.code ? <code key={index}>{part.text}</code> : <React.Fragment key={index}>{part.text}</React.Fragment>,
	);
}

/** The eye (decoration: its button's name says what it does, and so does the icon: the open eye shows a folded hint, the crossed-out one hides a shown hint). */
function EyeGlyph({ folded }) {
	return (
		<svg className={hintStyles.eyeIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
			<path d={folded ? EYE_PATHS.show : EYE_PATHS.hide} />
		</svg>
	);
}

/** One revealed hint: its header row ("Hint 2 of 3" and the eye) and, unless folded, its text. */
function HintBox({ text, number, total, folded, textId, eyeRef, onToggleFold }) {
	const eyeLabel = folded ? WORDS.unfold(number) : WORDS.fold(number);
	return (
		<li className={hintStyles.hint}>
			<div className={hintStyles.header}>
				<span className={hintStyles.label}>{WORDS.hintOf(number, total)}</span>
				<button
					ref={eyeRef}
					type="button"
					className={hintStyles.eye}
					aria-label={eyeLabel}
					title={eyeLabel}
					aria-expanded={!folded}
					aria-controls={textId}
					onClick={onToggleFold}>
					<EyeGlyph folded={folded} />
				</button>
			</div>
			<div id={textId} className={hintStyles.text} hidden={folded}>
				<HintText text={text} />
			</div>
		</li>
	);
}

/**
 * See the header. `id`: the area's DOM id (the light bulb's aria-controls; one of this list's
 * own when not given); `hints`: the hint texts (props.js > normalizeHints; anything but a list
 * counts as none: nothing is drawn); `state`: { open, revealed, folded, announce }
 * (exerciseView.js > HINTS_START and the functions after it); onRevealNext() and
 * onToggleFold(index, from 0): the editor changes the state (useExercise.js).
 */
export default function HintList({ id, hints = [], state, onRevealNext, onToggleFold }) {
	const ownId = useId();
	const areaId = id ?? ownId;
	const eyeRefs = useRef([]);
	const focusLastEyeRef = useRef(false);
	const list = Array.isArray(hints) ? hints : [];
	const total = list.length;
	const view = hintsStateOf(state, total);
	const next = nextHintNumber(view, total);
	const spoken = useFleetingText(hintAnnouncement(list, view));

	// The press that revealed the last hint removed its button: the focus goes to that hint's eye.
	useEffect(() => {
		if (!focusLastEyeRef.current) return;
		focusLastEyeRef.current = false;
		eyeRefs.current[view.revealed - 1]?.focus();
	}, [view.revealed]);

	if (total === 0) return null;

	function revealNext() {
		focusLastEyeRef.current = focusAfterReveal(view, total) === FOCUS_AFTER_REVEAL.lastEye;
		onRevealNext?.();
	}

	return (
		<div className={hintStyles.hints}>
			<span className={hintStyles.visuallyHidden} role="status">
				{spoken}
			</span>
			{view.open ? (
				<div id={areaId} className={hintStyles.area} role="group" aria-label={WORDS.region}>
					<ol role="list" className={hintStyles.list}>
						{list.slice(0, view.revealed).map((text, index) => (
							<HintBox
								key={index}
								text={text}
								number={index + 1}
								total={total}
								folded={view.folded.includes(index)}
								textId={`${areaId}-text-${index + 1}`}
								eyeRef={(element) => {
									eyeRefs.current[index] = element;
								}}
								onToggleFold={() => onToggleFold?.(index)}
							/>
						))}
					</ol>
					{next === null ? null : (
						<button type="button" className={hintStyles.next} onClick={revealNext}>
							{WORDS.showNext(next, total)}
						</button>
					)}
				</div>
			) : null}
		</div>
	);
}
