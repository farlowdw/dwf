/**
 * contrast.js — WCAG 2's colour arithmetic for the editor's tests (a helper, not a test): the
 * relative luminance of a colour, a translucent colour drawn over an opaque one, the contrast
 * ratio of the two, and an assertion with a readable message. Copied from editorThemes.test.js
 * (which keeps its own copy until it adopts this one); prismTheme.test.js reads it from here.
 *
 *     contrast('#6272a4', '#282a36')            // 3.03 (a #rrggbb or #rrggbbaa colour on an opaque #rrggbb background)
 *     assertContrast(color, background, MARK_CONTRAST, 'Dracula comments');
 *
 * HOW TO CHANGE IT  Another minimum (WCAG's large text, for instance): a constant beside the two
 * below. The arithmetic is WCAG 2.x's (sRGB, the 0.03928 knee): leave it.
 */

import assert from 'node:assert/strict';

/** WCAG 2's minimums: normal text, and large text / non-text marks (comments, line numbers, syntax accents). */
export const TEXT_CONTRAST = 4.5;
export const MARK_CONTRAST = 3;

/** { r, g, b, a } of #rrggbb or #rrggbbaa (channels 0 to 255, alpha 0 to 1). */
export function rgba(color) {
	const byte = (start) => parseInt(color.slice(start, start + 2), 16);
	return { r: byte(1), g: byte(3), b: byte(5), a: color.length === 9 ? byte(7) / 255 : 1 };
}

/** `color` drawn over the opaque `background`: its visible { r, g, b }. */
export function over(color, background) {
	const front = rgba(color);
	const back = rgba(background);
	const blend = (top, bottom) => top * front.a + bottom * (1 - front.a);
	return { r: blend(front.r, back.r), g: blend(front.g, back.g), b: blend(front.b, back.b) };
}

/** WCAG's relative luminance of { r, g, b }. */
export function luminance({ r, g, b }) {
	const linear = (channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The contrast ratio of `color` (alpha blended) on the opaque `background`. */
export function contrast(color, background) {
	const front = luminance(over(color, background));
	const back = luminance(rgba(background));
	return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
}

/** Fail with a readable message when `color` on `background` is under `min`. */
export function assertContrast(color, background, min, what) {
	const ratio = contrast(color, background);
	assert.ok(ratio >= min, `${what}: ${color} on ${background} is ${ratio.toFixed(2)}:1, under ${min}:1`);
}
