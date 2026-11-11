/**
 * buttonInk.test.js — the light-mode blue of the editor's blue MUI buttons (../buttonInk.js):
 *   - each variant (text, outlined, contained) sets only MUI Button's own colour variables to
 *     the light theme's primary.dark, with MUI's hover pattern (a solid border, a darker
 *     background), and nothing at all in dark mode;
 *   - the header's Run (contained) and Check (outlined) carry it in a light theme, rendered on
 *     the server through this folder's module hooks (jsxHooks.js); their Stop looks (red) do not.
 * The contrast itself (4.5:1 or more on the header grey) is MUI's computed colour, checked
 * here as a value. Run with `npm run test:shared`.
 * To change it: a new variant or button that takes the ink gets a test here; the colour itself is
 * ../buttonInk.js's.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ThemeProvider, createTheme } = await import('@mui/material/styles');
const { LIGHT_PRIMARY_INK_SX } = await import('../buttonInk.js');
const { default: Toolbar, COPY_STATES } = await import('../Toolbar.jsx');

/** The editor's two MUI blues (MuiScope.jsx > LIGHT_PRIMARY / DARK_PRIMARY): MUI computes primary.dark from them. */
const LIGHT = createTheme({ palette: { mode: 'light', primary: { main: '#0b89d0' } } });
const DARK = createTheme({ palette: { mode: 'dark', primary: { main: '#48adf6' } } });

/** primary.dark of the light theme: 6.2:1 on the header grey #f3f3f3, white on it 6.9:1. */
const INK = 'rgb(7, 95, 145)';

/** An idle header with Check (an exercise), as CodeEditorClient.jsx draws it. */
function toolbarProps(overrides = {}) {
	return {
		title: 'main.py',
		languages: [{ id: 'python', label: 'Python' }],
		language: 'python',
		onLanguageChange() {},
		runtime: { options: [], version: '*', runLanguage: 'python', text: 'Python', notice: null, canRun: true },
		onVersionChange() {},
		running: false,
		runDisabledReason: null,
		onRun() {},
		onStop() {},
		onReset() {},
		onClear() {},
		onCopy() {},
		copyState: COPY_STATES.idle,
		onCopyOutput() {},
		copyOutputState: COPY_STATES.idle,
		hasOutput: false,
		stdinShown: false,
		onToggleStdin() {},
		check: { checking: false, disabledReason: null },
		onCheck() {},
		onStopCheck() {},
		...overrides,
	};
}

/** The header rendered in `theme`. */
function renderToolbar(theme, overrides) {
	return renderToStaticMarkup(createElement(ThemeProvider, { theme }, createElement(Toolbar, toolbarProps(overrides))));
}

test('light mode: each variant takes primary.dark through MUI Button\'s own variables, hover included', () => {
	assert.equal(LIGHT.palette.primary.dark, INK);
	assert.deepEqual(LIGHT_PRIMARY_INK_SX.text(LIGHT), { '--variant-textColor': INK });
	assert.deepEqual(LIGHT_PRIMARY_INK_SX.outlined(LIGHT), {
		'--variant-outlinedColor': INK,
		'--variant-outlinedBorder': 'rgba(7, 95, 145, 0.5)',
		'@media (hover: hover)': { '&:hover': { '--variant-outlinedBorder': INK } },
	});
	const contained = LIGHT_PRIMARY_INK_SX.contained(LIGHT);
	assert.equal(contained['--variant-containedBg'], INK);
	assert.equal(contained['@media (hover: hover)']['&:hover']['--variant-containedBg'], 'rgb(5, 76, 116)', 'darker still on hover');
});

test('dark mode: nothing (MUI\'s blue is 6.3:1 on the dark header)', () => {
	for (const variant of ['text', 'outlined', 'contained']) assert.deepEqual(LIGHT_PRIMARY_INK_SX[variant](DARK), {}, variant);
});

test('the header: Run and Check carry the light-mode blue; their Stop looks do not', () => {
	const idle = renderToolbar(LIGHT);
	assert.ok(idle.includes(`--variant-containedBg:${INK}`), 'Run');
	assert.ok(idle.includes(`--variant-outlinedColor:${INK}`), 'Check');
	const waiting = renderToolbar(LIGHT, { running: true, check: { checking: true, disabledReason: null } });
	assert.ok(!waiting.includes(INK), 'Stop and the check\'s Stop stay red');
	assert.ok(!renderToolbar(DARK).includes(INK), 'dark mode: MUI\'s own blue');
});
