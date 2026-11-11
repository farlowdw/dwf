/**
 * useFleetingText.js — text for a live region that is there only long enough to be spoken: the
 * new text at once, then '' once it has been held for FLEETING_HOLD_MS. The hints area
 * (HintList.jsx) puts a revealed hint in its polite region with it, so a screen reader announces
 * the hint, and a reader moving through the page in browse mode later meets the hint only once,
 * in its box — not a second time as stray text in the region.
 *
 *     const spoken = useFleetingText(hintAnnouncement(list, view));
 *     <span className={hintStyles.visuallyHidden} role="status">{spoken}</span>
 *
 *   - A NEW text shows at once and starts its own hold (a quick second reveal is read out too).
 *   - Emptying a live region is not announced (aria-relevant: additions text, the default), and
 *     speech already under way is not cut off.
 *   - The same text again right after its hold ended stays silent: it is the text the region has
 *     already said. (The hints never repeat one: each reveal names a new hint.)
 *   - On the server and in the first render the text is the given one (no effect has run); the
 *     hints' region starts empty anyway, as the area starts closed.
 *
 * HOW TO CHANGE IT
 *   How long the text stays: FLEETING_HOLD_MS (long enough for VoiceOver to pick it up — very
 *   short times can lose it — and short enough that browse mode rarely meets it).
 */

import { useEffect, useState } from 'react';

/** How long a text stays in the region, in ms. */
export const FLEETING_HOLD_MS = 3000;

/** See the header. `text`: what the region should say now ('' for nothing); `holdMs`: how long it stays. */
export function useFleetingText(text, holdMs = FLEETING_HOLD_MS) {
	// The text whose hold has ended: while `text` is still that one, the region is empty.
	const [heldText, setHeldText] = useState('');

	useEffect(() => {
		if (text === '') return undefined;
		const timer = setTimeout(() => setHeldText(text), holdMs);
		return () => clearTimeout(timer);
	}, [text, holdMs]);

	return text === heldText ? '' : text;
}
