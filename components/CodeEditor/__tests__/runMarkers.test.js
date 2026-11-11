/**
 * runMarkers.test.js — the run-error markers (../runMarkers.js) with fake `monaco` / `editor` /
 * model objects that record every setModelMarkers call: one owner ('dwf-run'); exact columns, a
 * column alone (the word there), no column (the whole line); severities and the hover's source;
 * lines outside the code dropped and a missing message replaced; markers replaced, cleared after
 * a language switch, never another editor's, skipped on a disposed model; the snapshot (no marks
 * once the code changed during the run, marks again after undoing back); the next edit and a
 * language switch clear them; Go to line (column, first non-blank character, clamped, focus);
 * renderValidationDecorations for read-only editors and hideErrors; a missing editor or Monaco
 * API is no work, never a throw; and the REAL answers of lib/codeRunner/__tests__/fixtures/
 * errors, read by the library's errorLocations, mark every location they hold, with columns
 * Monaco accepts. Run with `npm run test:shared`.
 * To change it: a new rule of ../runMarkers.js gets a test here, over the recording fakes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { errorLocations } from '../lib/codeRunner/errorLocations.js';
import {
	RUN_MARKER_OWNER,
	SEVERITY_WARNING,
	VALIDATION_DECORATIONS,
	WORDS,
	clearRunMarkers,
	goToRunLocation,
	isSnapshotCurrent,
	markerColumns,
	markerMessage,
	renderValidationDecorationsFor,
	runSnapshot,
	showRunMarkers,
	toMarkerData,
	watchRunMarkers,
} from '../runMarkers.js';

/** Monaco's MarkerSeverity values (monaco-editor/esm/vs/editor/editor.api.d.ts). */
const MARKER_SEVERITY = Object.freeze({ Hint: 1, Info: 2, Warning: 4, Error: 8 });

/** A Monaco whose setModelMarkers keeps the markers on the fake model, per owner, and logs each call. */
function fakeMonaco() {
	const calls = [];
	return {
		calls,
		MarkerSeverity: MARKER_SEVERITY,
		editor: {
			setModelMarkers(model, owner, markers) {
				calls.push({ model, owner, markers });
				model.markers[owner] = markers;
			},
		},
	};
}

/** A text model over `code`: lines, columns, an alternative version id that `edit` / `undo` move. */
function fakeModel(code) {
	let lines = code.split('\n');
	const history = [];
	let versionId = 1;
	let disposed = false;
	return {
		markers: {},
		getLineCount: () => lines.length,
		getLineMaxColumn: (lineNumber) => lines[lineNumber - 1].length + 1,
		getLineFirstNonWhitespaceColumn: (lineNumber) => {
			const index = lines[lineNumber - 1].search(/\S/);
			return index === -1 ? 0 : index + 1;
		},
		getAlternativeVersionId: () => versionId,
		isDisposed: () => disposed,
		dispose: () => {
			disposed = true;
		},
		edit(nextCode) {
			history.push({ lines, versionId });
			lines = nextCode.split('\n');
			versionId += 1;
		},
		undo() {
			({ lines, versionId } = history.pop());
		},
	};
}

/** An editor showing `model`: logs setPosition / reveal / focus, and lets a test fire its content and model events. */
function fakeEditor(model) {
	const listeners = { content: new Set(), model: new Set() };
	const subscribe = (kind) => (listener) => {
		listeners[kind].add(listener);
		return { dispose: () => listeners[kind].delete(listener) };
	};
	return {
		model,
		log: [],
		listeners,
		getModel() {
			return this.model;
		},
		setPosition(position) {
			this.log.push(['position', position]);
		},
		revealLineInCenterIfOutsideViewport(line) {
			this.log.push(['reveal', line]);
		},
		focus() {
			this.log.push(['focus']);
		},
		onDidChangeModelContent: subscribe('content'),
		onDidChangeModel: subscribe('model'),
		fire(kind) {
			for (const listener of [...listeners[kind]]) listener();
		},
		switchTo(nextModel) {
			this.model = nextModel;
			this.fire('model');
		},
	};
}

/** The run markers on a fake model ([] when none). */
function runMarkersOf(model) {
	return model.markers[RUN_MARKER_OWNER] ?? [];
}

const PYTHON = 'def get(items, i):\n    return items[i]\n\nvalues = [1, 2, 3]\nprint(get(values, 5))\n';
const INDEX_ERROR = Object.freeze({ line: 2, column: 12, endColumn: 20, message: 'IndexError: list index out of range', severity: 'error', stage: 'run' });

/** An editor on the Python snippet, with its Monaco. */
function setup(code = PYTHON) {
	const model = fakeModel(code);
	return { model, editor: fakeEditor(model), monaco: fakeMonaco() };
}

test("the owner is 'dwf-run' (never Monaco's own checking's)", () => {
	assert.equal(RUN_MARKER_OWNER, 'dwf-run');
	const { model, editor, monaco } = setup();
	showRunMarkers(editor, monaco, [INDEX_ERROR]);
	assert.ok(monaco.calls.every((call) => call.owner === 'dwf-run'));
	assert.equal(runMarkersOf(model).length, 1);
});

test('a location with a column and an end column marks exactly those columns, on its line, with its message and source', () => {
	const { model, editor, monaco } = setup();
	assert.equal(showRunMarkers(editor, monaco, [INDEX_ERROR]), 1);
	assert.deepEqual(runMarkersOf(model), [
		{
			severity: MARKER_SEVERITY.Error,
			message: 'IndexError: list index out of range',
			startLineNumber: 2,
			startColumn: 12,
			endLineNumber: 2,
			endColumn: 20,
			source: WORDS.source.run,
		},
	]);
});

test('a column alone is an empty range (Monaco marks the word there); no column marks the whole line', () => {
	assert.deepEqual(markerColumns({ column: 13 }), [13, 13]);
	assert.deepEqual(markerColumns({ column: 13, endColumn: 13 }), [13, 13], 'an end not after the start is ignored');
	assert.deepEqual(markerColumns({ column: 13, endColumn: 4 }), [13, 13]);
	assert.deepEqual(markerColumns({ column: 3, endColumn: 9 }), [3, 9]);
	assert.deepEqual(markerColumns({}), [1, Number.MAX_VALUE], "Monaco's whole-line rule: from the first non-blank character");
	assert.deepEqual(markerColumns({ column: null }), [1, Number.MAX_VALUE]);
	assert.deepEqual(markerColumns({ column: 0 }), [1, Number.MAX_VALUE], 'a column counts from 1');
	assert.deepEqual(markerColumns({ column: 2.5 }), [1, Number.MAX_VALUE]);
	assert.deepEqual(markerColumns(), [1, Number.MAX_VALUE]);
});

test("severities: 'warning' is Monaco's Warning, everything else its Error; the source names the stage", () => {
	const monaco = fakeMonaco();
	const warning = toMarkerData(monaco, { line: 5, column: 9, message: "unused variable 'x'", severity: SEVERITY_WARNING, stage: 'compile' });
	assert.equal(warning.severity, MARKER_SEVERITY.Warning);
	assert.equal(warning.source, WORDS.source.compile);
	const error = toMarkerData(monaco, { line: 3, message: "'y' undeclared", severity: 'error', stage: 'compile' });
	assert.equal(error.severity, MARKER_SEVERITY.Error);
	const unknown = toMarkerData(monaco, { line: 3, message: 'x', severity: 'fatal' });
	assert.equal(unknown.severity, MARKER_SEVERITY.Error);
	assert.equal('source' in unknown, false, 'no stage, no source');
	assert.equal(WORDS.source.compile, 'compiler');
	assert.equal(WORDS.source.run, 'runtime');
});

test('a missing or blank message gets a word (Monaco drops a marker without one); a message is trimmed', () => {
	assert.equal(markerMessage({ message: '', severity: 'error' }), WORDS.noMessage.error);
	assert.equal(markerMessage({ message: '   ', severity: SEVERITY_WARNING }), WORDS.noMessage.warning);
	assert.equal(markerMessage({ severity: 'error' }), 'Error');
	assert.equal(markerMessage({ message: 42 }), 'Error');
	assert.equal(markerMessage({ message: '  NameError: x  ' }), 'NameError: x');
	assert.equal(markerMessage(), 'Error');
});

test('lines outside the code are dropped (Monaco would move them onto the first or last line)', () => {
	const { model, editor, monaco } = setup('a\nb\nc');
	const locations = [{ line: 0 }, { line: -1 }, { line: 4 }, { line: 2.5 }, { line: '2' }, {}, null, { line: 3, message: 'kept' }];
	assert.equal(showRunMarkers(editor, monaco, locations), 1);
	assert.deepEqual(
		runMarkersOf(model).map((marker) => [marker.startLineNumber, marker.message]),
		[[3, 'kept']],
	);
});

test('nothing to mark: no markers set, 0 returned (and not an array is nothing)', () => {
	const { model, editor, monaco } = setup();
	assert.equal(showRunMarkers(editor, monaco, []), 0);
	assert.equal(showRunMarkers(editor, monaco, undefined), 0);
	assert.equal(showRunMarkers(editor, monaco, [{ line: 99 }]), 0);
	assert.deepEqual(runMarkersOf(model), []);
	assert.ok(monaco.calls.every((call) => call.markers.length === 0), 'only clearing calls');
});

test('a new run replaces the earlier markers; clearRunMarkers removes them and is safe to repeat', () => {
	const { model, editor, monaco } = setup();
	showRunMarkers(editor, monaco, [INDEX_ERROR, { line: 5, message: 'second' }]);
	assert.equal(runMarkersOf(model).length, 2);
	showRunMarkers(editor, monaco, [{ line: 4, message: 'only this' }]);
	assert.deepEqual(
		runMarkersOf(model).map((marker) => marker.message),
		['only this'],
	);
	clearRunMarkers(editor, monaco);
	assert.deepEqual(runMarkersOf(model), []);
	assert.doesNotThrow(() => clearRunMarkers(editor, monaco));
});

test("after a language switch, clearRunMarkers clears the model that holds them (not only the one shown)", () => {
	const { model: python, editor, monaco } = setup();
	showRunMarkers(editor, monaco, [INDEX_ERROR]);
	const javascript = fakeModel('console.log(1);');
	editor.model = javascript; // switched without the event (watchRunMarkers is tested below)
	clearRunMarkers(editor, monaco);
	assert.deepEqual(runMarkersOf(python), []);
	assert.deepEqual(runMarkersOf(javascript), []);
});

test("two editors: clearing one leaves the other's markers alone", () => {
	const first = setup();
	const second = { model: fakeModel(PYTHON) };
	second.editor = fakeEditor(second.model);
	showRunMarkers(first.editor, first.monaco, [INDEX_ERROR]);
	showRunMarkers(second.editor, first.monaco, [INDEX_ERROR]);
	clearRunMarkers(first.editor, first.monaco);
	assert.deepEqual(runMarkersOf(first.model), []);
	assert.equal(runMarkersOf(second.model).length, 1);
});

test('a disposed model is skipped (Monaco removed its markers with it); no model is no work', () => {
	const { model, editor, monaco } = setup();
	showRunMarkers(editor, monaco, [INDEX_ERROR]);
	model.dispose();
	editor.model = null;
	const callsBefore = monaco.calls.length;
	assert.doesNotThrow(() => clearRunMarkers(editor, monaco));
	assert.equal(monaco.calls.length, callsBefore, 'nothing set on a disposed model');
	assert.equal(showRunMarkers(editor, monaco, [INDEX_ERROR]), 0);
});

test('the snapshot: the same code marks; an edit during the run, or a language switch, marks nothing; undoing back marks again', () => {
	const { model, editor, monaco } = setup();
	const snapshot = runSnapshot(editor);
	assert.equal(isSnapshotCurrent(editor, snapshot), true);
	assert.equal(showRunMarkers(editor, monaco, [INDEX_ERROR], { snapshot }), 1);

	model.edit(`# a new first line\n${PYTHON}`);
	assert.equal(isSnapshotCurrent(editor, snapshot), false);
	assert.equal(showRunMarkers(editor, monaco, [INDEX_ERROR], { snapshot }), 0);
	assert.deepEqual(runMarkersOf(model), [], 'the old marks are cleared too');

	model.undo();
	assert.equal(showRunMarkers(editor, monaco, [INDEX_ERROR], { snapshot }), 1, 'the same text again');

	editor.model = fakeModel(PYTHON); // another language's model, untouched (the same version id)
	assert.equal(isSnapshotCurrent(editor, snapshot), false, 'another model is never the code that ran');
	assert.equal(showRunMarkers(editor, monaco, [INDEX_ERROR], { snapshot }), 0);
	assert.equal(isSnapshotCurrent(editor, null), false);
});

test('runSnapshot without a model is null, and a null snapshot means "do not check"', () => {
	const { model, editor, monaco } = setup();
	editor.model = null;
	assert.equal(runSnapshot(editor), null);
	editor.model = model;
	assert.equal(showRunMarkers(editor, monaco, [INDEX_ERROR], { snapshot: null }), 1);
});

test('watchRunMarkers: the next edit clears them, a language switch clears them, dispose stops listening', () => {
	const { model, editor, monaco } = setup();
	const watch = watchRunMarkers(editor, monaco);
	showRunMarkers(editor, monaco, [INDEX_ERROR]);
	editor.fire('content');
	assert.deepEqual(runMarkersOf(model), [], 'an edit (typing, Reset, Clear) clears');

	showRunMarkers(editor, monaco, [INDEX_ERROR]);
	editor.switchTo(fakeModel('console.log(1);'));
	assert.deepEqual(runMarkersOf(model), [], 'a language switch clears the model that held them');

	watch.dispose();
	assert.equal(editor.listeners.content.size, 0);
	assert.equal(editor.listeners.model.size, 0);
});

test("goToRunLocation: the cursor at the error's column, the line revealed, the focus in the editor", () => {
	const { editor } = setup();
	assert.equal(goToRunLocation(editor, INDEX_ERROR), true);
	assert.deepEqual(editor.log, [['position', { lineNumber: 2, column: 12 }], ['reveal', 2], ['focus']]);
});

test("goToRunLocation: no column → the line's first non-blank character; a blank line → column 1; a column past the end → the end", () => {
	const { editor } = setup();
	goToRunLocation(editor, { line: 2 });
	assert.deepEqual(editor.log[0], ['position', { lineNumber: 2, column: 5 }], 'after the indentation');
	editor.log.length = 0;
	goToRunLocation(editor, { line: 3 });
	assert.deepEqual(editor.log[0], ['position', { lineNumber: 3, column: 1 }], 'the empty line 3');
	editor.log.length = 0;
	goToRunLocation(editor, { line: 4, column: 500 });
	assert.deepEqual(editor.log[0], ['position', { lineNumber: 4, column: 'values = [1, 2, 3]'.length + 1 }]);
});

test('goToRunLocation: a line past the end goes to the last line, a bad one to line 1; focus: false keeps the focus; no model → false', () => {
	const { editor } = setup('a\nb\nc');
	goToRunLocation(editor, { line: 40 }, { focus: false });
	assert.deepEqual(editor.log, [['position', { lineNumber: 3, column: 1 }], ['reveal', 3]]);
	editor.log.length = 0;
	goToRunLocation(editor, { line: Number.NaN });
	assert.deepEqual(editor.log[0], ['position', { lineNumber: 1, column: 1 }]);
	editor.model = null;
	assert.equal(goToRunLocation(editor, { line: 1 }), false);
});

test("renderValidationDecorations: 'off' with hideErrors, else the page's value, else 'on' (a read-only editor shows its run errors)", () => {
	assert.equal(renderValidationDecorationsFor(), 'on');
	assert.equal(renderValidationDecorationsFor({ hideErrors: false }), 'on');
	assert.equal(renderValidationDecorationsFor({ hideErrors: true }), 'off');
	assert.equal(renderValidationDecorationsFor({ hideErrors: true, pageValue: 'on' }), 'off', 'hideErrors wins');
	assert.equal(renderValidationDecorationsFor({ pageValue: 'editable' }), 'editable', "the page's own choice");
	assert.equal(renderValidationDecorationsFor({ pageValue: 'sometimes' }), 'on', 'not one of Monaco\'s values');
	assert.deepEqual(Object.values(VALIDATION_DECORATIONS).sort(), ['editable', 'off', 'on']);
});

test('no editor, no model or no marker API: no work and no throw (0 / false / a dispose that does nothing)', () => {
	const { model, editor, monaco } = setup();
	assert.doesNotThrow(() => clearRunMarkers(null, monaco));
	assert.equal(showRunMarkers(null, monaco, [INDEX_ERROR]), 0);
	assert.equal(runSnapshot(null), null);
	assert.equal(isSnapshotCurrent(undefined, { model, versionId: 1 }), false);
	assert.equal(goToRunLocation(null, INDEX_ERROR), false);
	assert.equal(showRunMarkers(editor, {}, [INDEX_ERROR]), 0, 'a Monaco without setModelMarkers');
	assert.equal(showRunMarkers(editor, undefined, [INDEX_ERROR]), 0);
	assert.doesNotThrow(() => clearRunMarkers(editor, undefined));
	assert.deepEqual(runMarkersOf(model), []);
	assert.equal(monaco.calls.length, 0);
	const watch = watchRunMarkers({}, monaco);
	assert.doesNotThrow(() => watch.dispose());
});

test("a stage that is not one of WORDS.source's own keys adds no source (never Object.prototype's)", () => {
	const monaco = fakeMonaco();
	assert.equal('source' in toMarkerData(monaco, { line: 1, message: 'x', stage: 'toString' }), false);
	assert.equal('source' in toMarkerData(monaco, { line: 1, message: 'x', stage: 'constructor' }), false);
});

/** The real answers of a Piston server (lib/codeRunner/__tests__/fixtures/errors). */
const FIXTURES_DIR = new URL('../lib/codeRunner/__tests__/fixtures/errors/', import.meta.url);

/** Every fixture: { name, language, code (the first file's text, as the editor sends it), response }. */
function fixtures() {
	return readdirSync(FIXTURES_DIR)
		.filter((name) => name.endsWith('.json'))
		.map((name) => {
			const { request, response } = JSON.parse(readFileSync(new URL(name, FIXTURES_DIR), 'utf8'));
			return { name, language: request.language, code: request.files[0].content, response };
		});
}

/** The locations the editor will get for a fixture (CodeEditorClient.jsx passes the code it sent). */
function locationsOf({ language, code, response }) {
	return errorLocations(response, { language, code });
}

test('real answers: every location errorLocations finds is marked, on its line, with columns Monaco accepts', () => {
	const all = fixtures();
	assert.ok(all.length >= 20, 'the fixtures are there');
	let marked = 0;
	for (const fixture of all) {
		const locations = locationsOf(fixture);
		const { model, editor, monaco } = setup(fixture.code);
		assert.equal(showRunMarkers(editor, monaco, locations), locations.length, `${fixture.name}: no location dropped`);
		for (const [index, marker] of runMarkersOf(model).entries()) {
			assert.equal(marker.startLineNumber, locations[index].line, fixture.name);
			assert.equal(marker.endLineNumber, marker.startLineNumber, `${fixture.name}: one line`);
			assert.ok(marker.startColumn >= 1 && marker.endColumn >= marker.startColumn, `${fixture.name}: a valid range`);
			assert.ok(marker.message.length > 0, `${fixture.name}: a message (Monaco drops a marker without one)`);
			assert.ok([WORDS.source.compile, WORDS.source.run].includes(marker.source), `${fixture.name}: the stage named`);
		}
		marked += locations.length;
	}
	assert.ok(marked >= 25, 'the fixtures hold locations');
});

test("real answers: Python 3.12's IndexError marks `items[i]` in line 2, and Go to line lands on it", () => {
	const fixture = fixtures().find((entry) => entry.name === 'python-3.12-index-error.json');
	const { model, editor, monaco } = setup(fixture.code);
	showRunMarkers(editor, monaco, locationsOf(fixture));
	assert.deepEqual(runMarkersOf(model), [
		{
			severity: MARKER_SEVERITY.Error,
			message: 'IndexError: list index out of range',
			startLineNumber: 2,
			startColumn: 12,
			endLineNumber: 2,
			endColumn: 20,
			source: WORDS.source.run,
		},
	]);
	goToRunLocation(editor, locationsOf(fixture)[0]);
	assert.deepEqual(editor.log[0], ['position', { lineNumber: 2, column: 12 }]);
});

test("real answers: gcc's \"expected ';'\" just past the end of its line is kept (Monaco draws it one character wide there); Python 3.9 marks the whole line", () => {
	const gcc = fixtures().find((entry) => entry.name === 'c-compile-error.json');
	const gccSetup = setup(gcc.code);
	showRunMarkers(gccSetup.editor, gccSetup.monaco, locationsOf(gcc));
	const semicolon = runMarkersOf(gccSetup.model).find((marker) => marker.startLineNumber === 4);
	assert.equal(semicolon.startColumn, gccSetup.model.getLineMaxColumn(4), 'just past the last character');
	assert.equal(semicolon.severity, MARKER_SEVERITY.Error);
	assert.equal(semicolon.source, WORDS.source.compile);

	const python39 = fixtures().find((entry) => entry.name === 'python-3.9-index-error.json');
	const pySetup = setup(python39.code);
	showRunMarkers(pySetup.editor, pySetup.monaco, locationsOf(python39));
	const [whole] = runMarkersOf(pySetup.model);
	assert.deepEqual([whole.startLineNumber, whole.startColumn, whole.endColumn], [2, 1, Number.MAX_VALUE]);
});

test("real answers: a gcc warning of a program that compiled is Monaco's Warning; a segfault marks nothing", () => {
	const warning = fixtures().find((entry) => entry.name === 'c-warning-only.json');
	const warned = setup(warning.code);
	assert.equal(showRunMarkers(warned.editor, warned.monaco, locationsOf(warning)), 1);
	assert.equal(runMarkersOf(warned.model)[0].severity, MARKER_SEVERITY.Warning);

	const segfault = fixtures().find((entry) => entry.name === 'c-segfault.json');
	const crashed = setup(segfault.code);
	assert.equal(showRunMarkers(crashed.editor, crashed.monaco, locationsOf(segfault)), 0);
});
