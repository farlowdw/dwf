/**
 * shared/components/MuiTheme/index.jsx — <MuiTheme>, ONE MUI ThemeProvider for the whole site that
 * follows Docusaurus' colour mode. A site reaches it through its one-line stub,
 * src/components/MuiTheme/index.jsx, which is what a page or component imports:
 *
 *     import MuiTheme from '@site/src/components/MuiTheme';
 *     <MuiTheme><DataGridPremium … /></MuiTheme>
 *     <MuiTheme mode="dark">…</MuiTheme>   // one mode whatever the site's
 *
 * The stub re-exports the default only. The named exports below (muiLightTheme, muiDarkTheme,
 * muiThemeFor, useMuiTheme) are imported from '@site/shared/components/MuiTheme' itself.
 *
 * WHAT IT IS FOR
 *   MUI components (the data grids, tooltips, inputs) do not know about Docusaurus' light /
 *   dark switch. Wrapping them in <MuiTheme> gives them the matching MUI palette and the
 *   site's fonts, so a grid looks native in both modes. The two themes are created ONCE at
 *   module level (not on every render), which is what several existing components did by
 *   hand — reuse this instead of copying those lines again.
 *   `mode` ('light' | 'dark') fixes the mode for one part of a page instead (nothing uses it
 *   today: the code editor brought its own ThemeProvider with these same values on 2026-10-26,
 *   components/CodeEditor/MuiScope.jsx, so its folder imports nothing outside itself). Without
 *   it, the site's mode, as before.
 *
 * KEEP IN STEP WITH THE EDITOR  components/CodeEditor/MuiScope.jsx holds a copy of the palette,
 *   font, size and radius below. A change here goes there too, in the same shared-only commit:
 *   __tests__/muiTheme.test.mjs, which every site runs in test:shared, fails while the two differ
 *   (README.md > Silent failures has the row).
 *
 * HOW TO CHANGE IT
 *   - Colours / fonts for every MUI component on the site: edit SHARED_OPTIONS below.
 *   - Something only one mode needs: LIGHT_OPTIONS / DARK_OPTIONS.
 *   - Per-component overrides (`components: { MuiDataGrid: { styleOverrides … } }`) also go in
 *     SHARED_OPTIONS.
 *   The Docusaurus colour values referenced here live in css/custom.scss and
 *   css/_custom-dark.scss; keep the two in step when you change the site's palette.
 *   Tests: __tests__/render.test.mjs beside this file (the provider on the server, both modes and
 *   `mode`), and __tests__/muiTheme.test.mjs at the root of shared/ (equal to MuiScope).
 */

import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useColorMode } from '@docusaurus/theme-common';

/** Options both modes share. Font stacks are the site's Infima variables, so MUI text matches the page. */
const SHARED_OPTIONS = {
	typography: {
		fontFamily: 'var(--ifm-font-family-base)',
		fontSize: 14,
	},
	shape: {
		borderRadius: 4, // matches --ifm-global-radius (0.25rem)
	},
};

/** Light mode: the site's primary blue (--ifm-color-primary) on the page background. */
const LIGHT_OPTIONS = {
	palette: {
		mode: 'light',
		primary: { main: '#0b89d0' },
		background: { default: '#ffffff', paper: '#ffffff' },
	},
};

/** Dark mode: the same blue lifted a little, on the site's dark greys (--color-gray-90 / -86). */
const DARK_OPTIONS = {
	palette: {
		mode: 'dark',
		primary: { main: '#48adf6' },
		background: { default: '#141c22', paper: '#1c262f' },
	},
};

// Module level on purpose: creating a theme is not free, and the objects never change.
export const muiLightTheme = createTheme({ ...SHARED_OPTIONS, ...LIGHT_OPTIONS });
export const muiDarkTheme = createTheme({ ...SHARED_OPTIONS, ...DARK_OPTIONS });

/** The MUI theme of a mode: 'dark' gives the dark one, anything else the light one. */
export function muiThemeFor(mode) {
	return mode === 'dark' ? muiDarkTheme : muiLightTheme;
}

/** The theme that matches the current Docusaurus colour mode. */
export function useMuiTheme() {
	const { colorMode } = useColorMode();
	return muiThemeFor(colorMode);
}

/**
 * Wrap any MUI component tree in this. Safe during SSR (useColorMode works there too). `mode`
 * ('light' | 'dark', optional): that mode instead of the site's (see WHAT IT IS FOR).
 */
export default function MuiTheme({ children, mode }) {
	const siteTheme = useMuiTheme();
	const theme = mode ? muiThemeFor(mode) : siteTheme;
	return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
