/**
 * buttonInk.js — the light-mode blue of the editor's own blue MUI buttons: Run and Check in the
 * header (Toolbar.jsx), "Use this solution" and Close in the solution panel (SolutionPanel.jsx).
 *
 *     <Button variant="contained" sx={LIGHT_PRIMARY_INK_SX.contained}>Run</Button>
 *
 * WHY  MUI draws a primary button in primary.main, the site's blue #0b89d0: on the header's grey
 *   #f3f3f3 that is 3.4:1 as text or a border, and white on it is 3.8:1 — under the 4.5:1 a
 *   13 px label needs. In light mode these buttons take the theme's darker blue instead,
 *   primary.dark (#075f91: 6.2:1 on #f3f3f3, white on it 6.9:1). Dark mode keeps MUI's blue
 *   (#48adf6 on #252526: 6.3:1). The site-wide MUI theme is left alone: it colours every MUI
 *   component on the site.
 *
 * HOW  Each `sx` sets only MUI Button's own colour variables (@mui/material/Button:
 *   --variant-textColor, --variant-outlinedColor, --variant-outlinedBorder, --variant-containedBg),
 *   so MUI's disabled look still wins, and nothing at all in dark mode. The hover keeps MUI's
 *   pattern: an outlined border turns solid, a contained background gets darker (MUI's own
 *   hover colour, primary.dark, is now the resting one: CONTAINED_HOVER_DARKEN).
 *
 * HOW TO CHANGE IT
 *   Another colour: inLightMode's `theme.palette.primary.dark` (check it at 4.5:1 on #f3f3f3,
 *   hover included). The hover: CONTAINED_HOVER_DARKEN, OUTLINED_BORDER_ALPHA. A button that
 *   should get it: its variant's entry as its `sx`. Tests: __tests__/buttonInk.test.js.
 */

import { darken } from '@mui/material/styles';

/** How much darker a contained button gets on hover in light mode (MUI's hover colour, primary.dark, is now its resting one). */
export const CONTAINED_HOVER_DARKEN = 0.2;

/** An outlined button's resting border: the ink at half strength, as MUI draws primary.main's. */
const OUTLINED_BORDER_ALPHA = 0.5;

/** The light theme's primary.dark as `variables(ink)` gives them; nothing in dark mode. */
function inLightMode(theme, variables) {
	return theme.palette.mode === 'light' ? variables(theme.palette.primary.dark) : {};
}

/** The light-mode blue per MUI Button variant, as an `sx` (see the header). */
export const LIGHT_PRIMARY_INK_SX = Object.freeze({
	text: (theme) => inLightMode(theme, (ink) => ({ '--variant-textColor': ink })),
	outlined: (theme) =>
		inLightMode(theme, (ink) => ({
			'--variant-outlinedColor': ink,
			'--variant-outlinedBorder': theme.alpha(ink, OUTLINED_BORDER_ALPHA),
			'@media (hover: hover)': { '&:hover': { '--variant-outlinedBorder': ink } },
		})),
	contained: (theme) =>
		inLightMode(theme, (ink) => ({
			'--variant-containedBg': ink,
			'@media (hover: hover)': { '&:hover': { '--variant-containedBg': darken(ink, CONTAINED_HOVER_DARKEN) } },
		})),
});
