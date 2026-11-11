/**
 * monacoSetup.test.js — the Monaco helpers (../monacoSetup.js) with fake `monaco` / `editor` /
 * `document` objects: the themes (VS Code's defaults: Monaco's built-in 'vs-dark' / 'vs'),
 * re-measuring the font once it loads, model addresses, the undoable "replace all the code" of
 * Reset / Clear, and the clean-up of models. (JavaScript / TypeScript checking moved to
 * typescript.js > configureTypeScript on 2026-10-25: __tests__/typescript.test.js.) Run with
 * `npm run test:shared`.
 * To change it: a new helper of ../monacoSetup.js gets a test here, with the fakes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	THEME_DARK,
	THEME_LIGHT,
	disposeModels,
	modelPath,
	remeasureFontsWhenLoaded,
	replaceCode,
	themeNameFor,
} from '../monacoSetup.js';

test("the themes are VS Code's defaults (Monaco's built-in vs-dark / vs) and follow the colour mode", () => {
	assert.equal(THEME_DARK, 'vs-dark');
	assert.equal(THEME_LIGHT, 'vs');
	assert.equal(themeNameFor('dark'), 'vs-dark');
	assert.equal(themeNameFor('light'), 'vs');
	assert.equal(themeNameFor(undefined), 'vs');
});

test('the font is re-measured once the site mono face has loaded', async () => {
	const calls = [];
	const monaco = { editor: { remeasureFonts: () => calls.push('remeasure') } };
	const doc = {
		fonts: {
			load: async (font) => {
				calls.push(font);
				return [];
			},
			ready: Promise.resolve(),
		},
	};
	assert.equal(await remeasureFontsWhenLoaded(monaco, { fontSize: 14, fontFamily: "'IBM Plex Mono'", doc }), true);
	assert.deepEqual(calls, ["14px 'IBM Plex Mono'", 'remeasure']);

	assert.equal(await remeasureFontsWhenLoaded(monaco, { fontSize: 14, fontFamily: 'x', doc: {} }), false, 'no FontFaceSet');
	const failing = { fonts: { load: () => Promise.reject(new Error('blocked')), ready: Promise.resolve() } };
	assert.equal(await remeasureFontsWhenLoaded(monaco, { fontSize: 14, fontFamily: 'x', doc: failing }), false);
});

test('model addresses: one per editor and language, every part encoded', () => {
	assert.equal(modelPath('r3', 'python', 'main.py'), 'inmemory://code-editor/r3/python/main.py');
	assert.equal(modelPath('r3', 'c++', 'main.cpp'), 'inmemory://code-editor/r3/c%2B%2B/main.cpp');
	// React's useId() ids: ':r1:' (React 19.0) and '«r1»' (React 19.1+) must stay one path segment.
	assert.equal(modelPath(':r1:', 'python', 'main.py'), 'inmemory://code-editor/%3Ar1%3A/python/main.py');
	assert.equal(modelPath('«r1»', 'python', 'main.py'), 'inmemory://code-editor/%C2%ABr1%C2%BB/python/main.py');
	assert.notEqual(modelPath(':r1:', 'python', 'main.py'), modelPath(':r2:', 'python', 'main.py'), 'two editors never share a model');
});

/** An editor + model pair that records edits. */
function fakeEditorWith(value) {
	const log = [];
	const model = {
		value,
		getValue() {
			return this.value;
		},
		setValue(text) {
			log.push(['setValue', text]);
			this.value = text;
		},
		getFullModelRange: () => 'FULL',
	};
	const editor = {
		getModel: () => model,
		pushUndoStop: () => log.push(['undoStop']),
		executeEdits: (source, edits) => {
			log.push(['edit', source, edits]);
			model.value = edits[0].text;
			return true;
		},
	};
	return { editor, model, log };
}

test('replaceCode: one undoable edit; nothing when unchanged; a read-only editor sets the model', () => {
	const { editor, model, log } = fakeEditorWith('mine');
	replaceCode(editor, 'original');
	assert.equal(model.value, 'original');
	assert.deepEqual(log, [['undoStop'], ['edit', 'code-editor', [{ range: 'FULL', text: 'original', forceMoveMarkers: true }]], ['undoStop']]);

	log.length = 0;
	replaceCode(editor, 'original');
	assert.deepEqual(log, [], 'already that text: no edit, no undo step');

	const readOnly = fakeEditorWith('a');
	replaceCode(readOnly.editor, 'b', { readOnly: true });
	assert.deepEqual(readOnly.log, [['setValue', 'b']]);

	assert.doesNotThrow(() => replaceCode({ getModel: () => null }, 'x'));
});

test('disposeModels disposes every model but the one still shown (and none twice)', () => {
	const disposed = [];
	const model = (name, alreadyDisposed = false) => ({
		isDisposed: () => alreadyDisposed,
		dispose: () => disposed.push(name),
	});
	const shown = model('python');
	disposeModels(new Set([shown, model('javascript'), model('rust', true), model('go')]), shown);
	assert.deepEqual(disposed, ['javascript', 'go']);
});

test('ignoreMonacoCancellations quiets Monaco\'s own CancellationError and nothing else, once per window', async () => {
	const { ignoreMonacoCancellations, isMonacoCancellation, MONACO_CANCELED } = await import('../monacoSetup.js');
	const listeners = [];
	const win = { addEventListener: (type, fn) => listeners.push([type, fn]) };
	assert.equal(ignoreMonacoCancellations(win), true);
	assert.equal(ignoreMonacoCancellations(win), false, 'a second call adds no second listener');
	assert.deepEqual(listeners.map(([type]) => type), ['unhandledrejection']);
	const fire = (reason) => {
		let prevented = false;
		listeners[0][1]({ reason, preventDefault: () => { prevented = true; } });
		return prevented;
	};
	const canceled = Object.assign(new Error(MONACO_CANCELED), { name: MONACO_CANCELED });
	assert.equal(fire(canceled), true, "Monaco's cancellation is quieted");
	assert.equal(fire(new Error(MONACO_CANCELED)), false, 'an Error named Error is not');
	assert.equal(fire(new TypeError('fetch failed')), false);
	assert.equal(fire(undefined), false);
	assert.equal(isMonacoCancellation({ name: 'Canceled', message: 'Canceled' }), true);
	assert.equal(isMonacoCancellation({ name: 'Canceled', message: 'something else' }), false);
	assert.equal(ignoreMonacoCancellations(undefined), false, 'no window (the server): nothing to do');
});


test('laidOutContentHeight: the content height once the editor is laid out, null in a hidden box (Monaco measures it 5 px wide, no room for text)', async () => {
	const { laidOutContentHeight } = await import('../monacoSetup.js');
	const editor = ({ offsetWidth, contentWidth, height = 163 }) => ({
		getContainerDomNode: () => ({ offsetWidth }),
		getLayoutInfo: () => ({ width: offsetWidth === 0 ? 5 : offsetWidth, contentWidth }),
		getContentHeight: () => height,
	});
	// Hidden (display: none) while being created: Monaco measured width 5, contentWidth -46, 2,599 px for four lines (Chrome, 2026-10-26).
	assert.equal(laidOutContentHeight(editor({ offsetWidth: 0, contentWidth: -46, height: 2599 })), null);
	assert.equal(laidOutContentHeight(editor({ offsetWidth: 341, contentWidth: -46, height: 2599 })), null, 'rendered but no room for text yet');
	assert.equal(laidOutContentHeight(editor({ offsetWidth: 341, contentWidth: 290 })), 163);
	assert.equal(laidOutContentHeight({ getLayoutInfo: () => ({ contentWidth: 290 }), getContentHeight: () => 163 }), 163, 'no container to ask: the layout decides');
	assert.equal(laidOutContentHeight({ getContentHeight: () => 163 }), null, 'no layout info at all: not laid out');
	assert.equal(laidOutContentHeight(editor({ offsetWidth: 341, contentWidth: 290, height: -1 })), null, "Monaco's -1 before it has a model is no height");
});

test('the two facts the hidden-box guard rests on hold in the installed packages (an upgrade fails here, not on a phone)', async () => {
	const { readFileSync } = await import('node:fs');
	const path = await import('node:path');
	const { resolvePackage } = await import('./paths.js');
	const observer = readFileSync(path.join(resolvePackage('monaco-editor'), 'esm/vs/editor/browser/config/elementSizeObserver.js'), 'utf8');
	assert.match(observer, /Math\.max\(5, observedWidth\)/, 'Monaco clamps a measured width to 5 px: a hidden box is never width 0, so the guard reads contentWidth');
	const wrapper = readFileSync(path.join(resolvePackage('@monaco-editor/react'), 'dist/index.mjs'), 'utf8');
	assert.match(wrapper, /display:\s*"none"/, '@monaco-editor/react hides the container until the editor exists (the comments in monacoSetup.js and CodeEditorClient.jsx rest on it)');
});
