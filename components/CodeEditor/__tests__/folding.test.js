/**
 * folding.test.js — the pre-folding of chosen line ranges (../folding.js), driven with a small
 * fake Monaco editor that records every selection and action: a blog post's [[1, 6]] on a
 * snippet of the same shape, nested folds (innermost first), a range ending on an empty line, a range ending
 * on the EMPTY LAST line (a final newline: clamped or dropped, with a warning), the clean-up of
 * earlier folds, the author's mistakes (warned about, not thrown), a Monaco without the folding
 * actions, a language switch while it waits, the code replaced in the same model while it waits
 * (its version changes: it stops, with no warning and no fold of the old text's lines), and a
 * first show with nothing to fold (`clear: false`: nothing done at all). Run with `npm run test:shared`.
 * To change it: a new folding rule of ../folding.js gets a test here, over the fake editor.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	FOLD_SELECTION_ACTION,
	REMOVE_MANUAL_FOLDS_ACTION,
	UNFOLD_ALL_ACTION,
	applyFolds,
	clearFolds,
	lastFoldableLine,
	selectionForRegion,
} from '../folding.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BLOG_SNIPPET = readFileSync(path.join(HERE, 'fixtures/snippets/tally-votes.py'), 'utf8'); // a made-up stand-in for a blog post's snippet

const ALL_ACTIONS = Object.freeze([FOLD_SELECTION_ACTION, REMOVE_MANUAL_FOLDS_ACTION, UNFOLD_ALL_ACTION]);

/** monaco.Selection, reduced to its four numbers. */
class FakeSelection {
	constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
		this.range = [startLineNumber, startColumn, endLineNumber, endColumn];
	}
}

const fakeMonaco = Object.freeze({ Selection: FakeSelection });

/** A text model over `code` (only what folding.js reads). */
function fakeModel(code) {
	const lines = code.split('\n');
	return {
		getLineCount: () => lines.length,
		getLineMaxColumn: (lineNumber) => lines[lineNumber - 1].length + 1,
	};
}

/** An editor that logs ['select', range], ['run', actionId, range] and ['scroll', position]. */
function fakeEditor(code, { actions = ALL_ACTIONS } = {}) {
	const log = [];
	const editor = {
		log,
		model: fakeModel(code),
		selection: null,
		getModel() {
			return this.model;
		},
		setSelection(selection) {
			this.selection = selection;
			log.push(['select', selection.range]);
		},
		setScrollPosition(position) {
			log.push(['scroll', position]);
		},
		getAction(actionId) {
			if (!actions.includes(actionId)) return null;
			return {
				isSupported: () => true,
				run: async () => {
					log.push(['run', actionId, editor.selection?.range ?? null]);
				},
			};
		},
	};
	return editor;
}

/** The ranges the fold action ran on, in order. */
function foldedRanges(editor) {
	return editor.log.filter(([kind, actionId]) => kind === 'run' && actionId === FOLD_SELECTION_ACTION).map((entry) => entry[2]);
}

const noWait = () => Promise.resolve();

test('the blog post: [[1, 6]] folds lines 2-6 of its snippet, then the view goes back to the top', async () => {
	const editor = fakeEditor(BLOG_SNIPPET);
	const warnings = [];
	const done = await applyFolds(editor, fakeMonaco, [[1, 6]], { warn: (message) => warnings.push(message), waitFrame: noWait });
	assert.equal(done, true);
	assert.deepEqual(warnings, []);
	const line6 = BLOG_SNIPPET.split('\n')[5];
	assert.deepEqual(foldedRanges(editor), [[1, 1, 6, line6.length + 1]]);
	assert.deepEqual(editor.log.slice(-2), [
		['select', [1, 1, 1, 1]],
		['scroll', { scrollTop: 0, scrollLeft: 0 }],
	]);
});

test('earlier folds are cleared first: unfold all, then remove the manual ranges over the whole code', async () => {
	const editor = fakeEditor('a\nb\nc');
	await applyFolds(editor, fakeMonaco, [[1, 3]], { waitFrame: noWait });
	assert.deepEqual(editor.log.slice(0, 4), [
		['run', UNFOLD_ALL_ACTION, null],
		['select', [1, 1, 3, 2]],
		['run', REMOVE_MANUAL_FOLDS_ACTION, [1, 1, 3, 2]],
		['select', [1, 1, 3, 2]],
	]);
});

test('nested folds close innermost first (selecting inside a closed fold would open it again)', async () => {
	const code = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n');
	const editor = fakeEditor(code);
	await applyFolds(editor, fakeMonaco, [[1, 10], [3, 5], [7, 9]], { waitFrame: noWait });
	assert.deepEqual(
		foldedRanges(editor).map((range) => [range[0], range[2]]),
		[
			[7, 9],
			[3, 5],
			[1, 10],
		],
	);
});

test('a range that ends on an empty line selects to the start of the next line (Monaco would drop the empty line)', () => {
	const model = fakeModel('def f():\n    return 1\n\nprint(f())');
	assert.deepEqual(selectionForRegion(fakeMonaco, model, [1, 3]).range, [1, 1, 4, 1]);
	assert.deepEqual(selectionForRegion(fakeMonaco, model, [1, 2]).range, [1, 1, 2, 13]);
	const endsEmpty = fakeModel('a\nb\n');
	assert.deepEqual(selectionForRegion(fakeMonaco, endsEmpty, [1, 3]).range, [1, 1, 3, 1], 'the last line has no next line');
});

test('lastFoldableLine: the last line, or the one before it when the last line is empty', () => {
	assert.equal(lastFoldableLine(fakeModel('a\nb\nc')), 3);
	assert.equal(lastFoldableLine(fakeModel('a\nb\nc\n')), 3);
	assert.equal(lastFoldableLine(fakeModel('a\n\n')), 2, 'an empty line before the empty last line can still end a fold');
	assert.equal(lastFoldableLine(fakeModel('')), 1);
});

test('a fold cannot end on the empty last line: [1, N] is clamped to N-1, [N-1, N] is dropped, each with a warning', async () => {
	const code = 'a\nb\nc\n'; // line 4 is the empty line after the final newline
	const clamped = fakeEditor(code);
	const clampWarnings = [];
	await applyFolds(clamped, fakeMonaco, [[1, 4]], { warn: (message) => clampWarnings.push(message), waitFrame: noWait });
	assert.deepEqual(foldedRanges(clamped), [[1, 1, 3, 2]], 'lines 2-3 hidden, exactly what Monaco folds');
	assert.equal(clampWarnings.length, 1);
	assert.match(clampWarnings[0], /folded to line 3 instead/);

	const dropped = fakeEditor(code);
	const dropWarnings = [];
	await applyFolds(dropped, fakeMonaco, [[3, 4]], { warn: (message) => dropWarnings.push(message), waitFrame: noWait });
	assert.deepEqual(foldedRanges(dropped), [], 'Monaco would have folded nothing, silently');
	assert.equal(dropWarnings.length, 1);
	assert.match(dropWarnings[0], /was skipped/);
});

test("the author's mistakes are warned about and skipped; the rest still folds", async () => {
	const editor = fakeEditor('1\n2\n3\n4\n5\n6');
	const warnings = [];
	const done = await applyFolds(editor, fakeMonaco, [[4, 2], [1, 99], 'x'], { warn: (message) => warnings.push(message), waitFrame: noWait });
	assert.equal(done, true);
	assert.equal(warnings.length, 3);
	for (const warning of warnings) assert.match(warning, /^CodeEditor foldedRegions:/);
	assert.deepEqual(foldedRanges(editor), [[1, 1, 6, 2]], '[1, 99] is clamped to the last line');
});

test('a Monaco without the folding actions: nothing folds, nothing throws, the view still resets', async () => {
	const editor = fakeEditor('a\nb\nc', { actions: [] });
	const done = await applyFolds(editor, fakeMonaco, [[1, 3]], { waitFrame: noWait });
	assert.equal(done, true);
	assert.deepEqual(foldedRanges(editor), []);
	assert.deepEqual(editor.log.at(-1), ['scroll', { scrollTop: 0, scrollLeft: 0 }]);
});

test('an action that is turned off (folding: false) is skipped like a missing one', async () => {
	const editor = fakeEditor('a\nb\nc');
	editor.getAction = () => ({ isSupported: () => false, run: async () => assert.fail('must not run') });
	assert.equal(await applyFolds(editor, fakeMonaco, [[1, 3]], { waitFrame: noWait }), true);
});

test('the reader switches language while it waits: it stops and says so (the caller folds that model later)', async () => {
	const editor = fakeEditor('a\nb\nc');
	const switchModel = async () => {
		editor.model = fakeModel('other\ncode');
	};
	const done = await applyFolds(editor, fakeMonaco, [[1, 3]], { waitFrame: switchModel });
	assert.equal(done, false);
	assert.deepEqual(editor.log, []);
});

/** A model whose text can be replaced in place, as Monaco's setValue does: its version id changes, and a line past the end throws as Monaco's does. */
function replaceableModel(code) {
	let lines = code.split('\n');
	let version = 1;
	const lineOf = (lineNumber) => {
		if (lineNumber < 1 || lineNumber > lines.length) throw new Error('Illegal value for lineNumber');
		return lines[lineNumber - 1];
	};
	return {
		getLineCount: () => lines.length,
		getLineMaxColumn: (lineNumber) => lineOf(lineNumber).length + 1,
		getVersionId: () => version,
		replace(text) {
			lines = text.split('\n');
			version += 1;
		},
	};
}

test('the code is replaced in the same model while it waits (a page sets new code at mount): it stops, quietly, and folds nothing of the old text', async () => {
	const twelve = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n');
	const editor = fakeEditor(twelve);
	editor.model = replaceableModel(twelve);
	const warnings = [];
	const done = await applyFolds(editor, fakeMonaco, [[1, 6]], {
		warn: (message) => warnings.push(message),
		waitFrame: async () => {
			editor.model.replace('short\ncode');
		},
	});
	assert.equal(done, false, 'not done: the caller folds the language again when it is shown next (useDrafts.js then gives no folds over other text)');
	assert.deepEqual(foldedRanges(editor), [], "no fold of the old text's lines");
	assert.deepEqual(warnings, []);
});

test('a model without a version id (an older Monaco, a fake) folds as before', async () => {
	const editor = fakeEditor('a\nb\nc');
	assert.equal(typeof editor.model.getVersionId, 'undefined');
	assert.equal(await applyFolds(editor, fakeMonaco, [[1, 3]], { waitFrame: noWait }), true);
	assert.equal(foldedRanges(editor).length, 1);
});

test('no model: nothing to fold', async () => {
	const editor = fakeEditor('a');
	editor.model = null;
	assert.equal(await applyFolds(editor, fakeMonaco, [[1, 2]], { waitFrame: noWait }), false);
	await clearFolds(editor, fakeMonaco);
	assert.deepEqual(editor.log, []);
});

test('no regions: earlier folds are still cleared (Reset) and the view resets', async () => {
	const editor = fakeEditor('a\nb');
	assert.equal(await applyFolds(editor, fakeMonaco, [], { waitFrame: noWait }), true);
	assert.deepEqual(
		editor.log.filter(([kind]) => kind === 'run').map((entry) => entry[1]),
		[UNFOLD_ALL_ACTION, REMOVE_MANUAL_FOLDS_ACTION],
	);
});

test('a first show with nothing to fold (clear: false): nothing at all, at once — no frame, no action, no scroll', async () => {
	const editor = fakeEditor('a\nb');
	let framesWaited = 0;
	const countFrame = () => {
		framesWaited += 1;
		return Promise.resolve();
	};
	assert.equal(await applyFolds(editor, fakeMonaco, [], { clear: false, waitFrame: countFrame }), true);
	assert.equal(await applyFolds(editor, fakeMonaco, [[2, 2]], { clear: false, warn: () => {}, waitFrame: countFrame }), true, 'every region dropped: nothing to fold either');
	assert.equal(framesWaited, 0, 'no wait for a frame (nor for Monaco\'s folding model)');
	assert.deepEqual(editor.log, [], 'no action, no selection, never setScrollPosition');
});

test('a first show WITH regions (clear: false) folds exactly as before', async () => {
	const editor = fakeEditor(BLOG_SNIPPET);
	const reference = fakeEditor(BLOG_SNIPPET);
	assert.equal(await applyFolds(editor, fakeMonaco, [[1, 6]], { clear: false, waitFrame: noWait }), true);
	await applyFolds(reference, fakeMonaco, [[1, 6]], { waitFrame: noWait });
	assert.deepEqual(editor.log, reference.log);
});
