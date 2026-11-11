/**
 * menuScroll.test.js — the header's menus leave the page's scroll alone: the language picker, the
 * version picker (both MUI Selects in ../Toolbar.jsx) and the Theme menu (MUI's Menu in
 * ../ThemeMenu.jsx) open with `disableScrollLock`. MUI's scroll lock pads and freezes the page
 * while a menu is open; on a page a few pixels wider than a phone (maths that overflows, for one)
 * that moved the page about 535 px under the finger and closed the menu at once.
 *   - every Select the header draws (two languages and two versions, so both pickers show) gets
 *     MenuProps with disableScrollLock true;
 *   - the Theme menu's Menu gets disableScrollLock true, closed and open, and a caller's own
 *     props still reach it.
 * MUI's Select and Menu are stood in for by ./muiMenuStubs.js, which records their props: a
 * server render draws no open menu. The fix in a browser at 375 px: checked on a phone-sized
 * page that overflows (the review's probe), not here. Run with `npm run test:shared`.
 * To change it: a new menu in the header gets a line here.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./jsxHooks.js', import.meta.url);
register('./muiMenuStubs.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { clearRecords, recordedProps } = await import('./muiMenuStubs.js');
const { default: Toolbar, COPY_STATES, PICKER_MENU_PROPS } = await import('../Toolbar.jsx');
const { ThemeMenuList } = await import('../ThemeMenu.jsx');

/** A runtime with two installed versions, so the version picker is a menu (runtimeChoice.js's shape). */
const TWO_VERSIONS = Object.freeze({
	options: [
		{ version: '3.12.0', label: 'Python 3.12.0', shortLabel: '3.12.0' },
		{ version: '3.11.0', label: 'Python 3.11.0', shortLabel: '3.11.0' },
	],
	version: '3.12.0',
	runLanguage: 'python',
	text: 'Python 3.12.0',
	notice: null,
	canRun: true,
});

/** The header's props with two languages and two versions (both pickers drawn). */
function headerProps() {
	return {
		title: 'main.py',
		languages: [
			{ id: 'python', label: 'Python' },
			{ id: 'javascript', label: 'JavaScript' },
		],
		language: 'python',
		onLanguageChange() {},
		runtime: TWO_VERSIONS,
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
		themeFamily: 'vscode',
		onThemeChange() {},
	};
}

/** One family, enough for the Theme menu to draw. */
const FAMILIES = Object.freeze([{ id: 'vscode', label: 'VS Code', swatches: [{ mode: 'light', background: '#fffffe', foreground: '#000000' }] }]);

test('PICKER_MENU_PROPS turns MUI\'s scroll lock off, and is frozen', () => {
	assert.equal(PICKER_MENU_PROPS.disableScrollLock, true);
	assert.ok(Object.isFrozen(PICKER_MENU_PROPS));
});

test('both pickers of the header open their menus without the scroll lock', () => {
	clearRecords();
	renderToStaticMarkup(createElement(Toolbar, headerProps()));
	const selects = recordedProps('Select');
	assert.equal(selects.length, 2, 'the language picker and the version picker');
	for (const props of selects) {
		assert.equal(props.MenuProps?.disableScrollLock, true, `the ${props.inputProps?.['aria-label']} picker's menu locks the page's scroll`);
	}
});

test('the Theme menu in the header opens without the scroll lock', () => {
	clearRecords();
	renderToStaticMarkup(createElement(Toolbar, headerProps()));
	const menus = recordedProps('Menu');
	assert.equal(menus.length, 1, 'one Theme menu');
	assert.equal(menus[0].disableScrollLock, true);
});

test('the Theme menu keeps the scroll lock off when open, and still takes a caller\'s own props', () => {
	clearRecords();
	const list = { anchorEl: null, open: true, onClose() {}, families: FAMILIES, current: 'vscode', onPick() {}, menuId: 'm', buttonId: 'b' };
	renderToStaticMarkup(createElement(ThemeMenuList, { ...list, disablePortal: true }));
	const [menu] = recordedProps('Menu');
	assert.equal(menu.disableScrollLock, true);
	assert.equal(menu.disablePortal, true, "a caller's prop reaches MUI's Menu");
	assert.equal(menu.open, true);
});
