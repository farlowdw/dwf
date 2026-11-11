/**
 * render.test.mjs: <MuiTheme> (../index.jsx) rendered on the server through the shared render hooks
 * (__tests__/renderHooks.mjs), as the site renders every page at build time. A probe inside it reads the theme
 * MUI hands its children:
 *   - a light site gives them the light theme, a dark site the dark one (MUI hands its children a theme object of
 *     its own, so the probe compares what they read: the mode, the colours, the font, the size and the radius);
 *   - `mode` fixes one mode whatever the site's, both ways;
 *   - muiThemeFor: 'dark' gives the dark theme, anything else the light one; useMuiTheme follows the site;
 *   - the values: the site's blue on white, the lifted blue on the dark greys, the page's font, 14 and 4;
 *   - the provider draws nothing of its own: the children's markup is the whole markup.
 * That the values equal the code editor's MuiScope.jsx is __tests__/muiTheme.test.mjs's, at the root of shared/.
 * To change it: a new prop or case of ../index.jsx gets a test here, and a new value its line in EXPECTED. Run with
 * `npm run test:shared`, or on its own with `node --test "shared/components/MuiTheme/__tests__/*.test.mjs"` in a site.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('../../../__tests__/renderHooks.mjs', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { useTheme } = await import('@mui/material/styles');
const { COLOR_MODE_KEY } = await import('../../../__tests__/renderHooks.mjs');
const { default: MuiTheme, muiDarkTheme, muiLightTheme, muiThemeFor, useMuiTheme } = await import('../index.jsx');

/** The values both themes are made with: each mode's blue and backgrounds, and what the modes share. */
const EXPECTED = Object.freeze({
  light: { primary: '#0b89d0', background: '#ffffff', paper: '#ffffff' },
  dark: { primary: '#48adf6', background: '#141c22', paper: '#1c262f' },
  fontFamily: 'var(--ifm-font-family-base)',
  fontSize: 14,
  borderRadius: 4,
});

/** The markup a probe child writes: the mode of the theme it was handed. */
const PROBE_MARKUP = /^<span data-mode="(light|dark)"><\/span>$/;

/** What a child reads of a theme: the mode, each colour of the palette set here, the font, the size, the radius. */
function readOf(theme) {
  const { palette, typography, shape } = theme;
  return {
    mode: palette.mode,
    primary: palette.primary.main,
    background: palette.background.default,
    paper: palette.background.paper,
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    borderRadius: shape.borderRadius,
  };
}

/** Renders <MuiTheme {...props}> around a probe on a site in `siteMode`; gives the markup and the theme seen. */
function renderOn(siteMode, props = {}) {
  globalThis[COLOR_MODE_KEY] = siteMode;
  const seen = {};
  function Probe() {
    seen.theme = useTheme();
    seen.siteTheme = useMuiTheme();
    return createElement('span', { 'data-mode': seen.theme.palette.mode });
  }
  try {
    const html = renderToStaticMarkup(createElement(MuiTheme, props, createElement(Probe)));
    return { html, theme: seen.theme, siteTheme: seen.siteTheme };
  } finally {
    delete globalThis[COLOR_MODE_KEY];
  }
}

test('a light site gives its children the light theme, a dark site the dark one', () => {
  assert.deepEqual(readOf(renderOn('light').theme), readOf(muiLightTheme));
  assert.deepEqual(readOf(renderOn('dark').theme), readOf(muiDarkTheme));
  assert.equal(renderOn('light').siteTheme, muiLightTheme, 'useMuiTheme gives the module-level light theme');
  assert.equal(renderOn('dark').siteTheme, muiDarkTheme, 'useMuiTheme gives the module-level dark theme');
});

test("mode fixes one mode whatever the site's, both ways", () => {
  assert.deepEqual(readOf(renderOn('light', { mode: 'dark' }).theme), readOf(muiDarkTheme));
  assert.deepEqual(readOf(renderOn('dark', { mode: 'light' }).theme), readOf(muiLightTheme));
  assert.equal(renderOn('light', { mode: 'dark' }).siteTheme, muiLightTheme, "useMuiTheme still reads the site's mode");
});

test("MuiTheme's muiThemeFor: dark gives the dark theme, anything else the light one, the same objects every time", () => {
  assert.equal(muiThemeFor('dark'), muiDarkTheme);
  assert.equal(muiThemeFor('light'), muiLightTheme);
  assert.equal(muiThemeFor(undefined), muiLightTheme);
  assert.equal(muiThemeFor('sepia'), muiLightTheme);
  assert.notEqual(muiLightTheme, muiDarkTheme);
});

test("the themes hold the site's blues and greys, the page's font, MUI's size and Infima's radius", () => {
  for (const [mode, theme] of [['light', muiLightTheme], ['dark', muiDarkTheme]]) {
    const { fontFamily, fontSize, borderRadius } = EXPECTED;
    assert.deepEqual(readOf(theme), { mode, ...EXPECTED[mode], fontFamily, fontSize, borderRadius }, `the ${mode} theme`);
  }
});

test('the provider draws nothing of its own: the markup is the children only', () => {
  for (const siteMode of ['light', 'dark']) {
    const { html } = renderOn(siteMode);
    assert.match(html, PROBE_MARKUP);
    assert.equal(html.match(PROBE_MARKUP)[1], siteMode);
  }
});
