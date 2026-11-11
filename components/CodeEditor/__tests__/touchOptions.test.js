/**
 * touchOptions.test.js — Monaco's options on a touch-first device (../touchOptions.js): the
 * site's options come back by identity off touch (a desktop editor builds exactly what it built
 * before), the seven touch keys land on touch (2026-10-26: also no trigger-character
 * suggestions, no parameter hints, and Monaco pinned to its textarea with `editContext: false`),
 * the page's own value wins over them, a nested option (`hover`, `parameterHints`) merges one
 * level deep, and no input is ever mutated; mergeOptions itself
 * (the rule props.js builds every editor's options with). Run with `npm run test:shared`.
 * To change it: a new touch key of ../touchOptions.js gets a test here, with the page's own value still
 * winning.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUCH_EDITOR_OPTIONS, mergeOptions, touchEditorOptions } from '../touchOptions.js';

/** A site's options, frozen as props.js freezes DEFAULT_EDITOR_OPTIONS. */
const SITE_OPTIONS = Object.freeze({
	fontSize: 14,
	lineHeight: 1.5,
	minimap: Object.freeze({ enabled: false }),
	scrollbar: Object.freeze({ alwaysConsumeMouseWheel: false }),
	padding: Object.freeze({ top: 8, bottom: 8 }),
});

/** A deep copy, to check an input afterwards. */
function snapshotOf(value) {
	return JSON.parse(JSON.stringify(value));
}

test('the touch options are the seven of the spec, frozen', () => {
	assert.deepEqual(TOUCH_EDITOR_OPTIONS, {
		wordWrap: 'on',
		hover: { enabled: false },
		quickSuggestions: false,
		suggestOnTriggerCharacters: false,
		parameterHints: { enabled: false },
		lineNumbersMinChars: 3,
		editContext: false,
	});
	assert.ok(Object.isFrozen(TOUCH_EDITOR_OPTIONS));
	assert.ok(Object.isFrozen(TOUCH_EDITOR_OPTIONS.hover), 'the nested object too');
	assert.ok(Object.isFrozen(TOUCH_EDITOR_OPTIONS.parameterHints));
	assert.equal(TOUCH_EDITOR_OPTIONS.editContext, false, "Monaco keeps its textarea on every browser: static.module.css's 16 px rule reaches it");
});

test('off touch the site options come back by identity: a desktop editor is untouched', () => {
	const page = { fontSize: 16 };
	assert.equal(touchEditorOptions(SITE_OPTIONS, page, false), SITE_OPTIONS, 'the same object (===)');
	assert.equal(touchEditorOptions(SITE_OPTIONS, page, undefined), SITE_OPTIONS, 'an absent flag is off');
	assert.equal(touchEditorOptions(SITE_OPTIONS, {}, false), SITE_OPTIONS);
});

test('on touch the seven touch keys are added under the page options; the site options stay', () => {
	const options = touchEditorOptions(SITE_OPTIONS, {}, true);
	assert.notEqual(options, SITE_OPTIONS, 'a new object');
	assert.equal(options.wordWrap, 'on');
	assert.deepEqual(options.hover, { enabled: false });
	assert.equal(options.quickSuggestions, false);
	assert.equal(options.suggestOnTriggerCharacters, false, "no suggest widget on a '.' in JavaScript / TypeScript");
	assert.deepEqual(options.parameterHints, { enabled: false }, "no signature card on a '('");
	assert.equal(options.lineNumbersMinChars, 3);
	assert.equal(options.editContext, false);
	assert.equal(options.fontSize, 14, 'the site options stay');
	assert.deepEqual(options.minimap, { enabled: false });
	assert.deepEqual(options.scrollbar, { alwaysConsumeMouseWheel: false });
	assert.deepEqual(options, { ...SITE_OPTIONS, ...TOUCH_EDITOR_OPTIONS }, 'nothing else is added');
	assert.ok(!Object.isFrozen(options), 'buildMonacoOptions goes on editing it');
});

test("the page's own value wins over a touch key, on touch as off", () => {
	const page = { wordWrap: 'off', lineNumbersMinChars: 5, fontSize: 16 };
	const options = touchEditorOptions(SITE_OPTIONS, page, true);
	assert.equal(options.wordWrap, 'off');
	assert.equal(options.lineNumbersMinChars, 5);
	assert.equal(options.fontSize, 16);
	assert.equal(options.quickSuggestions, false, 'a touch key the page does not set stays');
	assert.equal(options.suggestOnTriggerCharacters, false);
	assert.deepEqual(options.parameterHints, { enabled: false });
	assert.equal(options.editContext, false);
	assert.deepEqual(options.hover, { enabled: false });
	const hintsBack = touchEditorOptions(SITE_OPTIONS, { parameterHints: { enabled: true }, suggestOnTriggerCharacters: true }, true);
	assert.deepEqual(hintsBack.parameterHints, { enabled: true }, 'a page can turn the parameter hints back on');
	assert.equal(hintsBack.suggestOnTriggerCharacters, true, 'and the trigger characters');
});

test('`hover` merges one level deep: a page keeps the hover off while setting its delay', () => {
	const options = touchEditorOptions(SITE_OPTIONS, { hover: { delay: 300 } }, true);
	assert.deepEqual(options.hover, { enabled: false, delay: 300 });
	const on = touchEditorOptions(SITE_OPTIONS, { hover: { enabled: true } }, true);
	assert.deepEqual(on.hover, { enabled: true }, 'and a page can turn it back on');
	const scrollbar = touchEditorOptions(SITE_OPTIONS, { scrollbar: { vertical: 'hidden' } }, true);
	assert.deepEqual(scrollbar.scrollbar, { alwaysConsumeMouseWheel: false, vertical: 'hidden' }, "the site's nested options merge the same way");
});

test('no input is mutated: the frozen site and touch options, the page options, their nested objects', () => {
	const page = { hover: { delay: 300 }, scrollbar: { vertical: 'hidden' }, fontSize: 16 };
	const before = snapshotOf(page);
	const options = touchEditorOptions(SITE_OPTIONS, page, true);
	options.hover.enabled = true;
	options.scrollbar.vertical = 'auto';
	options.fontSize = 18;
	assert.deepEqual(page, before, 'the page options are untouched');
	assert.deepEqual(TOUCH_EDITOR_OPTIONS.hover, { enabled: false }, 'the touch options are untouched');
	assert.deepEqual(SITE_OPTIONS.scrollbar, { alwaysConsumeMouseWheel: false }, 'the site options are untouched');
	assert.notEqual(options.hover, page.hover, 'nested objects are copies, not the inputs');
	assert.notEqual(options.scrollbar, SITE_OPTIONS.scrollbar);
	assert.notEqual(options.padding, SITE_OPTIONS.padding, 'an untouched nested object is copied too');
});

test('missing page options count as none', () => {
	assert.deepEqual(touchEditorOptions(SITE_OPTIONS, undefined, true), { ...SITE_OPTIONS, ...TOUCH_EDITOR_OPTIONS });
	assert.deepEqual(touchEditorOptions(SITE_OPTIONS, null, true), { ...SITE_OPTIONS, ...TOUCH_EDITOR_OPTIONS });
});

test("mergeOptions: overrides over defaults, plain objects one level deep, arrays and null replace, always new objects (props.js's rule)", () => {
	const defaults = Object.freeze({ a: 1, nested: Object.freeze({ x: 1, y: 2 }), list: Object.freeze([1, 2]), gone: 'yes' });
	const overrides = { a: 2, nested: { y: 3, z: 4 }, list: [3], gone: null, added: 'new' };
	const merged = mergeOptions(defaults, overrides);
	assert.deepEqual(merged, { a: 2, nested: { x: 1, y: 3, z: 4 }, list: [3], gone: null, added: 'new' });
	assert.notEqual(merged.nested, defaults.nested);
	assert.notEqual(merged.nested, overrides.nested);
	assert.equal(merged.list, overrides.list, 'an array is taken as it is, not merged');
	assert.deepEqual(mergeOptions(defaults, {}), { a: 1, nested: { x: 1, y: 2 }, list: [1, 2], gone: 'yes' });
	assert.notEqual(mergeOptions(defaults, {}).nested, defaults.nested, 'a copy even with nothing to merge');
	assert.deepEqual(mergeOptions({ nested: { x: 1 } }, { nested: 'flat' }), { nested: 'flat' }, 'a non-object override replaces the object');
	assert.deepEqual(mergeOptions({ nested: 'flat' }, { nested: { x: 1 } }), { nested: { x: 1 } }, 'and the other way round');
});
