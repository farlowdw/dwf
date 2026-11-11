/**
 * useNearViewport.js — "is this element near the window yet?", for an editor with
 * `loadWhenVisible`: Monaco mounts only when the editor comes within DEFAULT_ROOT_MARGIN of the
 * window, and the placeholder (index.jsx) stands in until then. It is for a page with many
 * editors; an editor without the prop is visible at once, exactly as before.
 *
 *     const anchorRef = useRef(null);                 // on an element that is always drawn
 *     const [visible, forceVisible] = useNearViewport(anchorRef, { enabled: settings.loadWhenVisible });
 *     // visible: false until the element nears the window; then true for good
 *     // forceVisible(): true now (a <CodeRef> to this editor, lib/registry)
 *
 * THE RULES
 *   - `enabled` falsy (the default): visible from the first render, no observer at all.
 *   - Once visible, always visible: an editor that has mounted is never taken down again — not
 *     when it scrolls away, not if `enabled` changes later.
 *   - It cannot watch, so it shows at once: no element in the ref, no IntersectionObserver (an
 *     old browser), or an observer that refuses the margin. An editor that never loads would be
 *     worse than one that loads early.
 *   - SSR-safe: the first render's answer depends only on `enabled` (false while enabled), the
 *     same on the server and in the browser; the observer starts in an effect, after mount.
 *   - The margin is a CSS margin around the window, as IntersectionObserver reads it:
 *     '100% 0px' starts loading one window height before the editor scrolls into view, so it
 *     is usually ready when the reader gets there.
 *   - Inside a closed <DropDownIC> (its panel is display:none) the editor is never near: it mounts
 *     as the dropdown opens and its box grows into the window.
 *
 * The parts that matter are plain functions — watchNearViewport (the observer) and
 * nearViewportEffect (the effect's decision) — so __tests__/useNearViewport.test.js drives them
 * with a fake IntersectionObserver; the hook only wires them to React.
 *
 * HOW TO CHANGE IT
 *   How early an editor loads: DEFAULT_ROOT_MARGIN (or the `rootMargin` option). Which editors
 *   use it: the `loadWhenVisible` prop (props.js) and index.jsx, which draws the placeholder
 *   while `visible` is false.
 */

import { useCallback, useEffect, useState } from 'react';

/** How far around the window an element counts as near: one window height above and below. */
export const DEFAULT_ROOT_MARGIN = '100% 0px';

/** Any visible pixel inside the margin counts. */
const THRESHOLD = 0;

/** Does nothing (what a stop function is when there was nothing to stop). */
function noop() {}

/** Is this observer entry inside the margin? (intersectionRatio for browsers that lack isIntersecting.) */
function isNear(entry) {
	return entry.isIntersecting === true || entry.intersectionRatio > 0;
}

/**
 * Watch `element` until it comes within `rootMargin` of the window, then call `onNear()` once and
 * stop. Calls `onNear()` at once when it cannot watch (see the header). `Observer` is for the
 * tests (default: the browser's IntersectionObserver, looked up when called). Returns stop(), safe
 * to call more than once.
 */
export function watchNearViewport(element, { rootMargin = DEFAULT_ROOT_MARGIN, onNear = noop, Observer = globalThis.IntersectionObserver } = {}) {
	if (!element || typeof Observer !== 'function') {
		onNear();
		return noop;
	}
	let observer = null;
	let stopped = false;

	function stop() {
		stopped = true;
		observer?.disconnect();
		observer = null;
	}

	function handleEntries(entries) {
		if (stopped || !entries.some(isNear)) return;
		stop();
		onNear();
	}

	try {
		observer = new Observer(handleEntries, { rootMargin, threshold: THRESHOLD });
		observer.observe(element);
	} catch {
		stop();
		onNear();
		return noop;
	}
	return stop;
}

/**
 * The hook's effect, as a plain function: nothing to do once `near`; not `enabled` → near now
 * (so a later `enabled` never takes the editor down); otherwise watch `element`. Returns the
 * effect's clean-up (or undefined).
 */
export function nearViewportEffect({ near, enabled, element, rootMargin, markNear, Observer }) {
	if (near) return undefined;
	if (!enabled) {
		markNear();
		return undefined;
	}
	return watchNearViewport(element, { rootMargin, onNear: markNear, Observer });
}

/** [visible, forceVisible] for the element in `ref` (see the header). */
export function useNearViewport(ref, { enabled = false, rootMargin = DEFAULT_ROOT_MARGIN } = {}) {
	const [near, setNear] = useState(() => !enabled);
	const forceVisible = useCallback(() => setNear(true), []);
	useEffect(
		() => nearViewportEffect({ near, enabled, element: ref.current, rootMargin, markNear: forceVisible }),
		[near, enabled, ref, rootMargin, forceVisible],
	);
	return [near || !enabled, forceVisible];
}
