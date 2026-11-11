/**
 * muiScope.test.js — the editor's own MUI scope (../MuiScope.jsx):
 *   - muiThemeFor('light' / 'dark') give the two module-level themes, with the editor's exact
 *     palette (the blues and greys a site's own MUI theme had when the editor stopped importing
 *     it on 2026-10-26: nothing may change where it ran) and the page's font;
 *   - the light primary's computed `dark` shade is the header's icon ink (buttonInk.js: #075f91 —
 *     its contract, as MUI writes it: rgb(7, 95, 145));
 *   - <MuiScope mode> renders its children on the server through this folder's module hooks
 *     (jsxHooks.js), as the site renders every page at build time.
 * Run with `npm run test:shared`.
 * To change it: a new colour of the editor's palette in ../MuiScope.jsx gets a test here, with its
 * exact value.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: MuiScope, DARK_PRIMARY, LIGHT_PRIMARY, darkTheme, lightTheme, muiThemeFor } = await import('../MuiScope.jsx');

/** The palette the editor had under a site's own MUI theme, copied on 2026-10-26. */
const EXPECTED = Object.freeze({
	light: { primary: '#0b89d0', background: '#ffffff', paper: '#ffffff' },
	dark: { primary: '#48adf6', background: '#141c22', paper: '#1c262f' },
});

/** buttonInk.js's ink: the light theme's primary.dark as MUI computes it. */
const LIGHT_PRIMARY_DARK = 'rgb(7, 95, 145)';

test('muiThemeFor: dark gives the dark theme, anything else the light one, always the same objects', () => {
	assert.equal(muiThemeFor('dark'), darkTheme);
	assert.equal(muiThemeFor('light'), lightTheme);
	assert.equal(muiThemeFor(undefined), lightTheme);
	assert.equal(muiThemeFor('dark'), muiThemeFor('dark'), 'created once, at module level');
});

test("the palettes are the editor's exact values (the site's blues and greys)", () => {
	for (const [mode, expected] of Object.entries(EXPECTED)) {
		const { palette } = muiThemeFor(mode);
		assert.equal(palette.mode, mode);
		assert.equal(palette.primary.main, expected.primary, `${mode} primary`);
		assert.equal(palette.background.default, expected.background, `${mode} background`);
		assert.equal(palette.background.paper, expected.paper, `${mode} paper`);
	}
	assert.equal(LIGHT_PRIMARY, EXPECTED.light.primary);
	assert.equal(DARK_PRIMARY, EXPECTED.dark.primary);
});

test("the light primary's dark shade is buttonInk.js's ink (#075f91)", () => {
	assert.equal(lightTheme.palette.primary.dark, LIGHT_PRIMARY_DARK);
});

test("both themes take the page's font, MUI's size and Infima's radius", () => {
	for (const theme of [lightTheme, darkTheme]) {
		assert.equal(theme.typography.fontFamily, 'var(--ifm-font-family-base)');
		assert.equal(theme.typography.fontSize, 14);
		assert.equal(theme.shape.borderRadius, 4);
	}
});

test('<MuiScope mode> renders its children on the server', () => {
	const markup = renderToStaticMarkup(createElement(MuiScope, { mode: 'dark' }, createElement('span', { id: 'inside' }, 'the editor')));
	assert.match(markup, /<span id="inside">the editor<\/span>/);
});
