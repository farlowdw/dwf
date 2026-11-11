/**
 * <MuiScope mode> — the code editor's own MUI ThemeProvider: the MUI controls inside an editor
 * (its buttons, tooltips, menus, the Input field, the alerts) take the EDITOR's mode — the
 * reader's editor theme (editorThemes.js), light or dark whatever the site's mode — with the
 * page's own font (Infima's --ifm-font-family-base) and the editor's two blues.
 *
 *     <MuiScope mode={theme.mode}>…</MuiScope>       // CodeEditorClient.jsx, around the editor
 *
 * WHY ITS OWN  The editor's folder works on any Docusaurus site that mounts shared/ (README.md >
 * Taking it to another Docusaurus site), so it imports nothing of a site: until 2026-10-26 it
 * wrapped itself in a site's own MUI theme component; the two themes here are that component's
 * values, copied, so nothing changed where it ran. Two themes are created once, at module level
 * (creating one is not free, and they never change).
 *
 * THE VALUES  the shared blues and greys (shared/css/custom.scss > --ifm-color-primary, and
 * --color-gray-90 / -82 for the dark backgrounds), which are also the editor's own defaults on
 * a site with other colours: an MUI palette is a few colours of its own, so the controls look
 * right on a stock site too. The light primary's `dark` shade, which MUI computes from LIGHT_PRIMARY, is
 * the header's icon ink (buttonInk.js: #075f91 — __tests__/muiScope.test.js keeps it so).
 *
 * HOW TO CHANGE IT
 *   The colours: LIGHT_OPTIONS / DARK_OPTIONS; what both modes share (font, size, radius):
 *   SHARED_OPTIONS. No useColorMode here on purpose: the mode comes in as a prop
 *   (CodeEditorClient.jsx > useEditorTheme). Tests: __tests__/muiScope.test.js, and
 *   themeWiring.test.js checks that CodeEditorClient wraps the editor in it.
 */

import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

/** The two modes an editor theme has (editorThemes.js). */
const MODE_DARK = 'dark';

/** Options both modes share: the page's own font, MUI's default size, Infima's radius (0.25rem). */
const SHARED_OPTIONS = Object.freeze({
	typography: {
		fontFamily: 'var(--ifm-font-family-base)',
		fontSize: 14,
	},
	shape: {
		borderRadius: 4,
	},
});

/** The light primary blue (shared/css/custom.scss > --ifm-color-primary). */
export const LIGHT_PRIMARY = '#0b89d0';

/** The dark primary blue: the same blue lifted a little, for dark backgrounds. */
export const DARK_PRIMARY = '#48adf6';

/** Light mode: the primary blue on a white page. */
const LIGHT_OPTIONS = Object.freeze({
	palette: {
		mode: 'light',
		primary: { main: LIGHT_PRIMARY },
		background: { default: '#ffffff', paper: '#ffffff' },
	},
});

/** Dark mode: the lifted blue on dark greys (shared/css's --color-gray-90 / --color-gray-86: #141c22 / #1c262f). */
const DARK_OPTIONS = Object.freeze({
	palette: {
		mode: 'dark',
		primary: { main: DARK_PRIMARY },
		background: { default: '#141c22', paper: '#1c262f' },
	},
});

// Module level on purpose: creating a theme is not free, and the objects never change.
export const lightTheme = createTheme({ ...SHARED_OPTIONS, ...LIGHT_OPTIONS });
export const darkTheme = createTheme({ ...SHARED_OPTIONS, ...DARK_OPTIONS });

/** The MUI theme of an editor mode: 'dark' gives the dark one, anything else the light one. */
export function muiThemeFor(mode) {
	return mode === MODE_DARK ? darkTheme : lightTheme;
}

/** The editor's MUI scope: `mode` is the editor theme's ('light' | 'dark'). Safe on the server. */
export default function MuiScope({ mode, children }) {
	return <ThemeProvider theme={muiThemeFor(mode)}>{children}</ThemeProvider>;
}
