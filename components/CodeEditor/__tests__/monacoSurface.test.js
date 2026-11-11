/**
 * monacoSurface.test.js — the Monaco half of the contract (../monacoSurface.js), with the fake
 * editor / model / Monaco of decorations.test.js and runMarkers.test.js: a whole surface
 * (isSurface), each member delegating with the same arguments (the model's text and lines,
 * replaceCode as one undoable edit or a plain set, the content listener, the marks on the model,
 * reveal / revealSpan through decorations.js, the injected page geometry, the run markers
 * through runMarkers.js, Go to line revealing first and then positioning), and the marks
 * disposed with the editor.
 * Run with `npm run test:shared`.
 * To change it: a new member of the contract (../surface.js) gets a test here for its Monaco half.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonacoSurface } from '../monacoSurface.js';
import { RUN_MARKER_OWNER } from '../runMarkers.js';
import { SURFACE_KINDS, isSurface } from '../surface.js';

class FakeRange {
	constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
		Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
	}
}

/** A Monaco with ranges, the stickiness and scroll enums, and markers kept per model. */
function fakeMonaco() {
	const markers = new Map();
	return {
		Range: FakeRange,
		MarkerSeverity: { Error: 8, Warning: 4 },
		editor: {
			TrackedRangeStickiness: { NeverGrowsWhenTypingAtEdges: 1 },
			ScrollType: { Smooth: 0, Immediate: 1 },
			setModelMarkers: (model, owner, list) => markers.set(model, { owner, list }),
		},
		markers,
	};
}

/** A text model over `code` that keeps its decorations and counts its edits. */
function fakeModel(code) {
	let text = code;
	let nextId = 1;
	let version = 1;
	return {
		decorations: new Map(),
		getValue: () => text,
		setValue(value) {
			text = value;
			version += 1;
		},
		getLineCount: () => text.split('\n').length,
		getLineMaxColumn: (line) => text.split('\n')[line - 1].length + 1,
		getLineFirstNonWhitespaceColumn: () => 1,
		getFullModelRange: () => new FakeRange(1, 1, text.split('\n').length, 1),
		getAlternativeVersionId: () => version,
		isDisposed: () => false,
		deltaDecorations(oldIds, added) {
			for (const id of oldIds) this.decorations.delete(id);
			return added.map((decoration) => {
				const id = `d${nextId++}`;
				this.decorations.set(id, decoration);
				return id;
			});
		},
	};
}

/** An editor over one model, every call it gets recorded. */
function fakeEditor(model) {
	const calls = [];
	const contentListeners = new Set();
	const disposeListeners = [];
	const node = { name: 'container' };
	return {
		calls,
		node,
		getModel: () => model,
		getContainerDomNode: () => node,
		getContribution: () => null,
		focus: () => calls.push(['focus']),
		pushUndoStop: () => calls.push(['pushUndoStop']),
		executeEdits: (source, edits) => {
			calls.push(['executeEdits', source, edits[0].text]);
			model.setValue(edits[0].text);
		},
		revealLinesInCenterIfOutsideViewport: (start, end) => calls.push(['reveal', start, end]),
		revealLineInCenterIfOutsideViewport: (line) => calls.push(['revealLine', line]),
		setPosition: (position) => calls.push(['setPosition', position]),
		onDidChangeModelContent(listener) {
			contentListeners.add(listener);
			return { dispose: () => contentListeners.delete(listener) };
		},
		onDidChangeModel: () => ({ dispose() {} }),
		onDidDispose: (listener) => disposeListeners.push(listener),
		fireContent: (event) => {
			for (const listener of [...contentListeners]) listener(event);
		},
		fireDispose: () => {
			for (const listener of disposeListeners) listener();
		},
		contentListenerCount: () => contentListeners.size,
	};
}

/** A surface over a fresh fake editor showing `code`, with recorded geometry calls. */
function setup(code = 'a = 1\nb = 2\nc = 3') {
	const model = fakeModel(code);
	const editor = fakeEditor(model);
	const monaco = fakeMonaco();
	const geometry = [];
	const surface = createMonacoSurface(editor, monaco, {
		linesBox: (...args) => {
			geometry.push(['linesBox', ...args]);
			return { top: 10, bottom: 50 };
		},
		layoutSettled: (...args) => {
			geometry.push(['layoutSettled', ...args]);
			return Promise.resolve('settled');
		},
	});
	return { model, editor, monaco, surface, geometry };
}

test('a whole surface of the monaco kind; the model gives the text and the lines; the container is its node', () => {
	const { surface, editor } = setup();
	assert.equal(isSurface(surface), true);
	assert.equal(surface.kind, SURFACE_KINDS.monaco);
	assert.equal(surface.hasModel(), true);
	assert.equal(surface.getValue(), 'a = 1\nb = 2\nc = 3');
	assert.equal(surface.lineCount(), 3);
	assert.equal(surface.domNode(), editor.node);
	surface.focus();
	assert.deepEqual(editor.calls.at(-1), ['focus']);
});

test('without a model: hasModel false, an empty text, no lines', () => {
	const editor = fakeEditor(null);
	const surface = createMonacoSurface(editor, fakeMonaco());
	assert.equal(surface.hasModel(), false);
	assert.equal(surface.getValue(), '');
	assert.equal(surface.lineCount(), 0);
});

test('setValue: one undoable edit (replaceCode) by default; a plain set with undoable false; nothing for the same text', () => {
	const { surface, editor, model } = setup();
	surface.setValue('x = 1');
	assert.deepEqual(editor.calls, [['pushUndoStop'], ['executeEdits', 'code-editor', 'x = 1'], ['pushUndoStop']]);
	assert.equal(model.getValue(), 'x = 1');
	editor.calls.length = 0;
	surface.setValue('y = 2', { undoable: false });
	assert.deepEqual(editor.calls, [], 'a read-only replace sets the model without an edit');
	assert.equal(model.getValue(), 'y = 2');
	surface.setValue('y = 2');
	assert.deepEqual(editor.calls, [], 'the same text: nothing');
});

test('onDidChange: the editor\'s content event, passed through; the returned function disposes it', () => {
	const { surface, editor } = setup();
	const events = [];
	const dispose = surface.onDidChange((event) => events.push(event));
	editor.fireContent({ isUndoing: true });
	assert.deepEqual(events, [{ isUndoing: true }]);
	dispose();
	editor.fireContent({ isUndoing: false });
	assert.equal(events.length, 1);
	assert.equal(editor.contentListenerCount(), 0);
});

test('marks: set / showStep / flash decorate the model; dispose takes them off, and the editor\'s disposal does too', () => {
	const { surface, model, editor } = setup();
	assert.equal(surface.marks.set({ 2: 'error' }), 1);
	assert.equal(surface.marks.showStep([[1, 1]]), 1);
	assert.equal(model.decorations.size, 2);
	assert.equal(surface.marks.flash([[3, 3]]), 1);
	assert.equal(model.decorations.size, 3);
	editor.fireDispose();
	assert.equal(model.decorations.size, 0, 'disposed with the editor');
	assert.equal(surface.marks.set({ 2: 'error' }), 0, 'later calls do nothing');
	const fresh = setup();
	fresh.surface.marks.set({ 1: 'add' });
	fresh.surface.marks.dispose();
	assert.equal(fresh.model.decorations.size, 0);
});

test('reveal scrolls the editor (decorations.js > revealLines); revealSpan gives the span; out of the code: false / null', async () => {
	const { surface, editor } = setup();
	assert.equal(await surface.reveal([[2, 3]]), true);
	assert.deepEqual(editor.calls.at(-1), ['reveal', 2, 3]);
	assert.deepEqual(surface.revealSpan([[3, 3], [2, 2]]), [2, 3]);
	assert.equal(await surface.reveal([[10, 12]]), false);
	assert.equal(surface.revealSpan([[10, 12]]), null);
});

test('linesBox and layoutSettled call the injected geometry with the editor first', async () => {
	const { surface, editor, geometry } = setup();
	assert.deepEqual(surface.linesBox([1, 2]), { top: 10, bottom: 50 });
	const win = { name: 'win' };
	assert.equal(await surface.layoutSettled(win, 150), 'settled');
	assert.deepEqual(geometry, [
		['linesBox', editor, [1, 2]],
		['layoutSettled', editor, win, 150],
	]);
	const bare = createMonacoSurface(fakeEditor(fakeModel('x')), fakeMonaco());
	assert.equal(bare.linesBox([1, 1]), null, 'no geometry injected: no box');
	assert.equal(await bare.layoutSettled({}, 1), undefined);
});

test('markers: a snapshot, the squiggles on the model under the run owner, clear, and a watch that clears on the next edit', () => {
	const { surface, model, monaco, editor } = setup();
	const snapshot = surface.markers.begin();
	assert.deepEqual(snapshot, { model, versionId: 1 });
	assert.equal(surface.markers.show([{ line: 2, message: 'boom', severity: 'error', stage: 'run' }], snapshot), 1);
	assert.equal(monaco.markers.get(model).owner, RUN_MARKER_OWNER);
	assert.equal(monaco.markers.get(model).list.length, 1);
	surface.markers.clear();
	assert.deepEqual(monaco.markers.get(model).list, []);
	assert.equal(surface.markers.show([{ line: 2 }], snapshot), 1);
	const watch = surface.markers.watch();
	editor.fireContent({});
	assert.deepEqual(monaco.markers.get(model).list, [], 'the next edit clears them');
	watch.dispose();
	model.setValue('changed');
	assert.equal(surface.markers.show([{ line: 1 }], snapshot), 0, 'the code changed since the snapshot: nothing marked');
});

test('goTo: reveals the line first (unfolding), then puts the cursor there and focuses; true', async () => {
	const { surface, editor } = setup();
	assert.equal(await surface.goTo({ line: 3, column: 2 }), true);
	const names = editor.calls.map((call) => call[0]);
	assert.ok(names.indexOf('reveal') < names.indexOf('setPosition'), 'reveal before the cursor');
	assert.deepEqual(editor.calls.find((call) => call[0] === 'setPosition'), ['setPosition', { lineNumber: 3, column: 2 }]);
	assert.ok(names.includes('focus'));
	const bare = createMonacoSurface(fakeEditor(null), fakeMonaco());
	assert.equal(await bare.goTo({ line: 1 }), false, 'no model: false');
});
