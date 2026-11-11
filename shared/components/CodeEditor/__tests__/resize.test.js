/**
 * resize.test.js — the rules of the editor's resize strip (../resize.js, used by
 * ResizeHandle.jsx): the bounds (never below sizing.js > MIN_HEIGHT_PX, never above 90% of the
 * window — unless the box was already taller when the drag began), a drag up / down / past either
 * bound, every resize key (Arrow Up / Down, Page Up / Down, Home / End) and every other key
 * (null: not a resize key), and the rounding to whole px. Pure functions, no DOM. Run with
 * `npm run test:shared`.
 *
 * HOW TO CHANGE IT  A new key: a row in KEYS below. Other steps or another window share: the
 * constants in ../resize.js (the tests read them, so they follow).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	KEY_STEP_PX,
	MAX_VIEWPORT_SHARE,
	PAGE_STEP_PX,
	clampHeight,
	heightAfterDrag,
	heightAfterKey,
	resizeBounds,
} from '../resize.js';
import { MIN_HEIGHT_PX } from '../sizing.js';

/** A window 1000 px tall: the tallest a drag makes the box is 900 px. */
const VIEWPORT_PX = 1000;
const WINDOW_MAX_PX = 900;

/** The bounds for a 400 px box in that window. */
const BOUNDS = Object.freeze({ min: MIN_HEIGHT_PX, max: WINDOW_MAX_PX });

/** Every resize key and its effect on a 400 px box in BOUNDS. */
const KEYS = Object.freeze([
	['ArrowDown', 400 + KEY_STEP_PX],
	['ArrowUp', 400 - KEY_STEP_PX],
	['PageDown', 400 + PAGE_STEP_PX],
	['PageUp', 400 - PAGE_STEP_PX],
	['End', WINDOW_MAX_PX],
	['Home', MIN_HEIGHT_PX],
]);

/** Keys that do not resize (including names an object inherits, which must not count as keys). */
const OTHER_KEYS = Object.freeze([
	'ArrowLeft',
	'ArrowRight',
	'Enter',
	' ',
	'Tab',
	'Escape',
	'a',
	'arrowdown',
	'',
	undefined,
	null,
	'toString',
	'constructor',
	'hasOwnProperty',
	'__proto__',
	'valueOf',
]);

test('the constants: 90% of the window, about two lines per arrow key, 200 px per page key', () => {
	assert.equal(MAX_VIEWPORT_SHARE, 0.9);
	assert.equal(KEY_STEP_PX, 40);
	assert.equal(PAGE_STEP_PX, 200);
	assert.ok(KEY_STEP_PX < PAGE_STEP_PX);
});

test('resizeBounds: from the smallest editor box to 90% of the window', () => {
	assert.deepEqual(resizeBounds(VIEWPORT_PX, 400), BOUNDS);
	assert.deepEqual(resizeBounds(VIEWPORT_PX), BOUNDS, 'no start height: the window decides');
	assert.equal(resizeBounds(777, 300).max, 699, '699.3 px rounds to whole px');
	assert.equal(resizeBounds(1001, 300).max, 901, '900.9 px rounds up');
});

test('resizeBounds: a box already taller than 90% of the window may stay that tall (no jump when the drag begins)', () => {
	assert.deepEqual(resizeBounds(VIEWPORT_PX, 1200), { min: MIN_HEIGHT_PX, max: 1200 });
	assert.equal(resizeBounds(VIEWPORT_PX, 1200.6).max, 1201, 'rounded');
	assert.equal(resizeBounds(VIEWPORT_PX, WINDOW_MAX_PX).max, WINDOW_MAX_PX, 'exactly 90%: the same ceiling');
});

test('resizeBounds: a tiny, missing or nonsense window still leaves the minimum as the ceiling (never max < min)', () => {
	assert.deepEqual(resizeBounds(50, 0), { min: MIN_HEIGHT_PX, max: MIN_HEIGHT_PX });
	assert.deepEqual(resizeBounds(0), { min: MIN_HEIGHT_PX, max: MIN_HEIGHT_PX }, 'no window (the server render)');
	assert.deepEqual(resizeBounds(undefined, undefined), { min: MIN_HEIGHT_PX, max: MIN_HEIGHT_PX });
	assert.deepEqual(resizeBounds(Number.NaN, 'tall'), { min: MIN_HEIGHT_PX, max: MIN_HEIGHT_PX });
	assert.equal(resizeBounds('1000', '300').max, WINDOW_MAX_PX, 'numbers as text are read as numbers');
	for (const [viewport, start] of [[0, 0], [10, 5], [100, 20], [VIEWPORT_PX, 50]]) {
		const { min, max } = resizeBounds(viewport, start);
		assert.ok(max >= min, `${viewport} / ${start}: max ${max} >= min ${min}`);
	}
});

test('clampHeight: inside the bounds as it is, outside them the nearest bound, always whole px', () => {
	assert.equal(clampHeight(400, BOUNDS), 400);
	assert.equal(clampHeight(10, BOUNDS), MIN_HEIGHT_PX);
	assert.equal(clampHeight(-50, BOUNDS), MIN_HEIGHT_PX);
	assert.equal(clampHeight(5000, BOUNDS), WINDOW_MAX_PX);
	assert.equal(clampHeight(400.4, BOUNDS), 400);
	assert.equal(clampHeight(400.5, BOUNDS), 401);
	assert.equal(clampHeight(MIN_HEIGHT_PX, BOUNDS), MIN_HEIGHT_PX, 'the bounds themselves are allowed');
	assert.equal(clampHeight(WINDOW_MAX_PX, BOUNDS), WINDOW_MAX_PX);
});

test('heightAfterDrag: the bottom edge follows the pointer, down taller and up shorter', () => {
	const start = { startHeight: 400, startY: 600 };
	assert.equal(heightAfterDrag({ ...start, currentY: 600 }, BOUNDS), 400, 'no move: no change');
	assert.equal(heightAfterDrag({ ...start, currentY: 750 }, BOUNDS), 550, '150 px down: 150 px taller');
	assert.equal(heightAfterDrag({ ...start, currentY: 450 }, BOUNDS), 250, '150 px up: 150 px shorter');
	assert.equal(heightAfterDrag({ ...start, currentY: -200 }, BOUNDS), MIN_HEIGHT_PX, 'far up (outside the window, 800 px): the minimum');
});

test('heightAfterDrag: clamped at both bounds, and rounded (a finger reports fractions of a px)', () => {
	const start = { startHeight: 400, startY: 600 };
	assert.equal(heightAfterDrag({ ...start, currentY: 280 }, BOUNDS), MIN_HEIGHT_PX, '320 px up would be 80 px: exactly the minimum');
	assert.equal(heightAfterDrag({ ...start, currentY: 100 }, BOUNDS), MIN_HEIGHT_PX, 'further up: still the minimum');
	assert.equal(heightAfterDrag({ ...start, currentY: 1100 }, BOUNDS), WINDOW_MAX_PX, '500 px down would be 900 px: exactly the maximum');
	assert.equal(heightAfterDrag({ ...start, currentY: 5000 }, BOUNDS), WINDOW_MAX_PX, 'further down: still the maximum');
	assert.equal(heightAfterDrag({ ...start, currentY: 650.3 }, BOUNDS), 450);
	assert.equal(heightAfterDrag({ ...start, currentY: 650.5 }, BOUNDS), 451);
	assert.equal(heightAfterDrag({ startHeight: 400.4, startY: 600, currentY: 600 }, BOUNDS), 400);
});

test('heightAfterDrag: a box that began taller than 90% of the window can shrink and grow back, never past where it began', () => {
	const bounds = resizeBounds(VIEWPORT_PX, 1200);
	const start = { startHeight: 1200, startY: 1100 };
	assert.equal(heightAfterDrag({ ...start, currentY: 1100 }, bounds), 1200, 'pressing does not make it jump to 900 px');
	assert.equal(heightAfterDrag({ ...start, currentY: 800 }, bounds), 900);
	assert.equal(heightAfterDrag({ ...start, currentY: 1000 }, bounds), 1100, 'back down in the same drag');
	assert.equal(heightAfterDrag({ ...start, currentY: 1400 }, bounds), 1200, 'never taller than it began');
});

test('heightAfterKey: every resize key from a 400 px box', () => {
	for (const [key, expected] of KEYS) {
		assert.equal(heightAfterKey(400, key, BOUNDS), expected, key);
	}
});

test('heightAfterKey: the steps stop at the bounds (no overshoot), and Home / End go straight there', () => {
	assert.equal(heightAfterKey(MIN_HEIGHT_PX + 10, 'ArrowUp', BOUNDS), MIN_HEIGHT_PX);
	assert.equal(heightAfterKey(MIN_HEIGHT_PX, 'ArrowUp', BOUNDS), MIN_HEIGHT_PX, 'already the smallest');
	assert.equal(heightAfterKey(150, 'PageUp', BOUNDS), MIN_HEIGHT_PX);
	assert.equal(heightAfterKey(WINDOW_MAX_PX - 10, 'ArrowDown', BOUNDS), WINDOW_MAX_PX);
	assert.equal(heightAfterKey(WINDOW_MAX_PX, 'ArrowDown', BOUNDS), WINDOW_MAX_PX, 'already the tallest');
	assert.equal(heightAfterKey(800, 'PageDown', BOUNDS), WINDOW_MAX_PX);
	assert.equal(heightAfterKey(5000, 'Home', BOUNDS), MIN_HEIGHT_PX);
	assert.equal(heightAfterKey(0, 'End', BOUNDS), WINDOW_MAX_PX);
	assert.equal(heightAfterKey(0, 'ArrowDown', BOUNDS), MIN_HEIGHT_PX, 'a box not on the page (0 px): the step lands inside the bounds');
});

test('heightAfterKey: a box taller than 90% of the window keeps its own height as the ceiling', () => {
	const bounds = resizeBounds(VIEWPORT_PX, 1200);
	assert.equal(heightAfterKey(1200, 'ArrowDown', bounds), 1200);
	assert.equal(heightAfterKey(1200, 'End', bounds), 1200);
	assert.equal(heightAfterKey(1200, 'ArrowUp', bounds), 1200 - KEY_STEP_PX);
});

test('heightAfterKey: a fractional height is rounded to whole px', () => {
	assert.equal(heightAfterKey(400.6, 'ArrowDown', BOUNDS), 441);
	assert.equal(heightAfterKey(400.4, 'ArrowUp', BOUNDS), 360);
	assert.ok(Number.isInteger(heightAfterKey(333.33, 'PageDown', BOUNDS)));
});

test('heightAfterKey: any other key is not a resize key (null), whatever the height', () => {
	for (const key of OTHER_KEYS) {
		assert.equal(heightAfterKey(400, key, BOUNDS), null, `'${String(key)}'`);
		assert.equal(heightAfterKey(MIN_HEIGHT_PX, key, BOUNDS), null, `${String(key)} at the minimum`);
	}
});

test('a press becomes a drag only after DRAG_START_PX: a click or a double-click resizes nothing', async () => {
	const { hasDragStarted, DRAG_START_PX } = await import('../resize.js');
	assert.equal(hasDragStarted(100, 100), false);
	assert.equal(hasDragStarted(100, 100 + DRAG_START_PX - 1), false);
	assert.equal(hasDragStarted(100, 100 + DRAG_START_PX), true);
	assert.equal(hasDragStarted(100, 100 - DRAG_START_PX), true, 'up counts too');
});

test('Enter resets the size; other keys do not', async () => {
	const { isResetKey, heightAfterKey, resizeBounds } = await import('../resize.js');
	assert.equal(isResetKey('Enter'), true);
	for (const key of ['Escape', ' ', 'ArrowDown', 'a']) assert.equal(isResetKey(key), false, key);
	assert.equal(heightAfterKey(300, 'Enter', resizeBounds(800, 300)), null, 'Enter is not a resize step');
});

test('two taps close in time and space are a double tap; slow, far or out-of-order taps are not', async () => {
	const { isDoubleTap, DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } = await import('../resize.js');
	const first = { time: 1000, x: 100, y: 200 };
	assert.equal(isDoubleTap(first, { time: 1000 + DOUBLE_TAP_MS, x: 110, y: 205 }), true);
	assert.equal(isDoubleTap(first, { time: 1001 + DOUBLE_TAP_MS, x: 100, y: 200 }), false, 'too slow');
	assert.equal(isDoubleTap(first, { time: 1100, x: 100 + DOUBLE_TAP_SLOP_PX + 1, y: 200 }), false, 'too far');
	assert.equal(isDoubleTap(first, { time: 900, x: 100, y: 200 }), false, 'earlier than the first');
	assert.equal(isDoubleTap(null, first), false, 'no first tap');
});

test('a box that starts shorter than the minimum does not jump on the first move', async () => {
	const { resizeBounds, heightAfterDrag } = await import('../resize.js');
	const bounds = resizeBounds(800, 50);
	assert.equal(bounds.min, 50);
	assert.equal(heightAfterDrag({ startHeight: 50, startY: 10, currentY: 11 }, bounds), 51);
	assert.equal(resizeBounds(800, 0).min, 80, 'no measured height: the usual minimum');
});
