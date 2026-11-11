/**
 * monacoTouchContract.test.js — three facts about the INSTALLED Monaco that the touch reading
 * mode rests on (read from node_modules, so an upgrade that changes them fails here, not on a
 * phone):
 *   - Monaco writes its hidden textarea's font size INLINE (textAreaEditContext.js:
 *     `ta.setFontSize(…)`), which is why static.module.css gives that textarea 16 px with
 *     !important under [data-ce-touch] (iOS Safari zooms the page when a focused field is
 *     smaller; a stylesheet's !important beats an inline value);
 *   - Monaco's touch handler registers `touchmove` with `passive: false` and prevents the default
 *     of a move that started on the code (touch.js), so a swipe on the code scrolls the editor,
 *     never the page — the fact behind the guide's "swipe on the line numbers or outside the box
 *     to scroll past it";
 *   - Monaco 0.55 has an `editContext` option, on by default, and where the browser has the
 *     EditContext API its view picks NativeEditContext (view.js), which renders a
 *     `.native-edit-context` div and an `ime-text-area` instead of `textarea.inputarea`
 *     (nativeEditContext.js) — so no `inputarea` for the 16 px rule to reach. That is why
 *     touchOptions.js sets `editContext: false`: an upgrade that renames the option would make
 *     it a no-op, and one that drops the textarea path would strand the rule; both fail here.
 * Skipped where monaco-editor is not installed. Run with `npm run test:shared`.
 * To change it: a new fact of the installed Monaco that the touch mode rests on gets a test here, read
 * from node_modules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePackage } from './paths.js';
import { TOUCH_EDITOR_OPTIONS } from '../touchOptions.js';

const MONACO = resolvePackage('monaco-editor');

/** The files read, inside Monaco's ESM build. */
const TEXT_AREA_FILE = path.join(MONACO, 'esm/vs/editor/browser/controller/editContext/textArea/textAreaEditContext.js');
const TOUCH_FILE = path.join(MONACO, 'esm/vs/base/browser/touch.js');
const OPTIONS_FILE = path.join(MONACO, 'esm/vs/editor/common/config/editorOptions.js');
const VIEW_FILE = path.join(MONACO, 'esm/vs/editor/browser/view.js');
const NATIVE_FILE = path.join(MONACO, 'esm/vs/editor/browser/controller/editContext/native/nativeEditContext.js');

const FILES = [TEXT_AREA_FILE, TOUCH_FILE, OPTIONS_FILE, VIEW_FILE, NATIVE_FILE];
const skip = FILES.every((file) => existsSync(file)) ? false : 'monaco-editor (its ESM build) is not installed';

test("Monaco sets its hidden textarea's font size inline (what the 16 px !important rule overrides)", { skip }, () => {
	const source = readFileSync(TEXT_AREA_FILE, 'utf8');
	assert.match(source, /\.setFontSize\(/, 'textAreaEditContext.js writes the font size through setFontSize(…) — if this moved, check static.module.css\'s rule still reaches the textarea');
});

test('Monaco listens to touchmove with passive: false and prevents the default of a move on the code (the scroll trap the guide describes)', { skip }, () => {
	const source = readFileSync(TOUCH_FILE, 'utf8');
	assert.match(source, /'touchmove'[^\n]*passive: false/, 'touchmove is not passive');
	assert.match(source, /preventDefault\(\)/, 'a move is prevented');
});

test("Monaco's `editContext` option exists (on by default) and its native path has no `inputarea`: why touchOptions.js pins the textarea", { skip }, () => {
	const options = readFileSync(OPTIONS_FILE, 'utf8');
	assert.match(options, /'editContext',\s*true/, "editorOptions.js registers 'editContext' with the default true — renamed, the touch option would be a no-op");
	assert.equal(TOUCH_EDITOR_OPTIONS.editContext, false, 'the touch options turn it off');
	const view = readFileSync(VIEW_FILE, 'utf8');
	assert.match(view, /createInstance\(NativeEditContext,/, 'view.js picks NativeEditContext when the effective option is on');
	const native = readFileSync(NATIVE_FILE, 'utf8');
	assert.match(native, /setClassName\(`native-edit-context`\)/, 'the native path renders a .native-edit-context element');
	assert.match(native, /setClassName\(`ime-text-area`\)/, 'and an ime-text-area');
	assert.doesNotMatch(native, /inputarea/, 'and no textarea.inputarea: the 16 px rule would reach nothing there');
});
