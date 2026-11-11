/**
 * resize.js — the rules of the editor's resize handle (ResizeHandle.jsx, the strip under the
 * code): how far a drag or a key moves the editor box's bottom edge, and the bounds it stays in.
 * Pure functions; no React, no DOM, so `node --test` checks them (__tests__/resize.test.js).
 *
 *     const bounds = resizeBounds(window.innerHeight, startHeight);
 *     heightAfterDrag({ startHeight, startY, currentY }, bounds);   // the box's new height (px)
 *     heightAfterKey(currentHeight, 'ArrowDown', bounds);           // or null: not a resize key
 *
 * THE BOUNDS  Never shorter than sizing.js > MIN_HEIGHT_PX (the box still looks like an editor),
 *   never taller than MAX_VIEWPORT_SHARE of the window (the toolbar and the output stay
 *   reachable) — unless the box already was shorter or taller than that when the drag began (a
 *   page's fixed `height`), so a drag never makes it jump.
 *
 * THE KEYS  (the handle is a focusable separator): Arrow Down / Up grow / shrink by KEY_STEP_PX,
 *   Page Down / Up by PAGE_STEP_PX, End / Home to the tallest / shortest. Any other key: null.
 *   Enter (isResetKey) puts the box back to the page's size, as a double-click does.
 *
 * A DOUBLE TAP  Touch browsers rarely send dblclick, so two quick taps on the strip without a
 *   drag (isDoubleTap: within DOUBLE_TAP_MS and DOUBLE_TAP_SLOP_PX of each other) reset too.
 *
 * A DRAG STARTS  only once the pointer has moved DRAG_START_PX: a click (or the two presses of a
 *   double-click) resizes nothing and does not stop height="fit" (hasDragStarted).
 *
 * HOW TO CHANGE IT  The constants below. Where a height is applied: ResizeHandle.jsx.
 */

import { MIN_HEIGHT_PX } from './sizing.js';

/** The tallest a drag makes the box: this share of the window's height. */
export const MAX_VIEWPORT_SHARE = 0.9;

/** Arrow Up / Down: about two lines of code. */
export const KEY_STEP_PX = 40;

/** Page Up / Down. */
export const PAGE_STEP_PX = 200;

/** The key that puts the box back to the page's size (as a double-click does). */
export const RESET_KEY = 'Enter';

/** Two taps this close in time (ms) and space (px) are a double tap. */
export const DOUBLE_TAP_MS = 350;
export const DOUBLE_TAP_SLOP_PX = 24;

/** How far (px) the pointer must move before a press on the strip becomes a drag. */
export const DRAG_START_PX = 3;

/** { min, max } in px for a box `startHeight` px tall in a window `viewportHeight` px tall. */
export function resizeBounds(viewportHeight, startHeight = 0) {
	const windowMax = Math.round((Number(viewportHeight) || 0) * MAX_VIEWPORT_SHARE);
	const start = Math.round(Number(startHeight) || 0);
	return {
		min: start > 0 ? Math.min(MIN_HEIGHT_PX, start) : MIN_HEIGHT_PX,
		max: Math.max(MIN_HEIGHT_PX, windowMax, start),
	};
}

/** true once a press on the strip has moved far enough to be a drag (see the header). */
export function hasDragStarted(startY, currentY) {
	return Math.abs(currentY - startY) >= DRAG_START_PX;
}

/** true for the key that resets the box's size. */
export function isResetKey(key) {
	return key === RESET_KEY;
}

/** true when `tap` ({ time, x, y }) follows `previousTap` closely enough to be a double tap. */
export function isDoubleTap(previousTap, tap) {
	if (!previousTap || !tap) return false;
	const soon = tap.time - previousTap.time <= DOUBLE_TAP_MS && tap.time >= previousTap.time;
	const near = Math.hypot(tap.x - previousTap.x, tap.y - previousTap.y) <= DOUBLE_TAP_SLOP_PX;
	return soon && near;
}

/** `px` rounded and kept within `bounds`. */
export function clampHeight(px, { min, max }) {
	return Math.round(Math.min(max, Math.max(min, px)));
}

/** The box's height while the handle is dragged from `startY` (the box was `startHeight`) to `currentY`. */
export function heightAfterDrag({ startHeight, startY, currentY }, bounds) {
	return clampHeight(startHeight + (currentY - startY), bounds);
}

/** Each resize key's effect: a step (px) to add, or 'min' / 'max'. */
const KEY_EFFECTS = Object.freeze({
	ArrowDown: KEY_STEP_PX,
	ArrowUp: -KEY_STEP_PX,
	PageDown: PAGE_STEP_PX,
	PageUp: -PAGE_STEP_PX,
	End: 'max',
	Home: 'min',
});

/** The box's height after `key` (KeyboardEvent.key), or null when the key does not resize. */
export function heightAfterKey(currentHeight, key, bounds) {
	if (!Object.prototype.hasOwnProperty.call(KEY_EFFECTS, key)) return null;
	const effect = KEY_EFFECTS[key];
	if (effect === 'min') return bounds.min;
	if (effect === 'max') return bounds.max;
	return clampHeight(currentHeight + effect, bounds);
}
