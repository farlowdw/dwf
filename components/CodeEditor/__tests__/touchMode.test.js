/**
 * touchMode.test.js — the gate between the editor's two views (../touchMode.js): the media
 * query pinned, isTouchFirst / viewFor against fake windows (the query matches, does not match,
 * matchMedia throws, there is no matchMedia, there is no window), and how a Run or Check from
 * the static view proceeds per language (TypeScript and its alias mount Monaco first; Python,
 * Bash and JavaScript run the static text as it is); the sizing of the box that mounts after
 * the tap (touchSettings: the page's height replaced by a fit up to the screen, nothing else
 * touched); and when Monaco cannot load after the tap (viewAfterLoad: back to the static view,
 * on touch only) and which views it disables Run in (runBlockingError: the Monaco view, and in
 * the static view only a language compiled in Monaco's worker). Run with `npm run test:shared`.
 * To change it: a new rule of ../touchMode.js (the query, a language's way from the static view) gets a
 * test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	RUN_POLICIES,
	TOUCH_ATTRIBUTE,
	TOUCH_BOX,
	TOUCH_MEDIA_QUERY,
	VIEWS,
	isTouchFirst,
	runBlockingError,
	staticRunPolicy,
	touchSettings,
	viewAfterLoad,
	viewFor,
} from '../touchMode.js';
import { normalizeEditorProps } from '../props.js';
import { editorBoxStyle } from '../sizing.js';

/** A window whose matchMedia answers `matches` for every query, recording the queries asked. */
function fakeWindow(matches) {
	const queries = [];
	return {
		queries,
		matchMedia(query) {
			queries.push(query);
			return { matches, media: query };
		},
	};
}

/** A window whose matchMedia throws (a browser that refuses the query). */
function throwingWindow() {
	return {
		matchMedia() {
			throw new Error('matchMedia is not supported');
		},
	};
}

test('the media query and the attribute are pinned: the CSS and the guide name them', () => {
	assert.equal(TOUCH_MEDIA_QUERY, '(hover: none) and (pointer: coarse)');
	assert.equal(TOUCH_ATTRIBUTE, 'data-ce-touch');
	assert.deepEqual(VIEWS, { monaco: 'monaco', static: 'static' });
	assert.ok(Object.isFrozen(VIEWS));
	assert.deepEqual(RUN_POLICIES, { now: 'now', mountFirst: 'mountFirst' });
	assert.ok(Object.isFrozen(RUN_POLICIES));
});

test('a window whose primary pointer cannot hover and is coarse is touch-first: the static view', () => {
	const win = fakeWindow(true);
	assert.equal(isTouchFirst(win), true);
	assert.equal(viewFor(win), VIEWS.static);
	assert.deepEqual(win.queries, [TOUCH_MEDIA_QUERY, TOUCH_MEDIA_QUERY], 'exactly the pinned query is asked, once per call');
});

test('a window the query does not match keeps Monaco', () => {
	const win = fakeWindow(false);
	assert.equal(isTouchFirst(win), false);
	assert.equal(viewFor(win), VIEWS.monaco);
});

test('matchMedia that throws, a window without matchMedia, and no window at all: Monaco, never an error', () => {
	assert.equal(isTouchFirst(throwingWindow()), false);
	assert.equal(viewFor(throwingWindow()), VIEWS.monaco);
	assert.equal(isTouchFirst({}), false, 'no matchMedia');
	assert.equal(viewFor({}), VIEWS.monaco);
	assert.equal(isTouchFirst({ matchMedia: 'not a function' }), false);
	assert.equal(isTouchFirst(undefined), false, 'no window');
	assert.equal(viewFor(undefined), VIEWS.monaco);
	assert.equal(isTouchFirst(null), false);
	assert.equal(viewFor(null), VIEWS.monaco);
});

test('only a true `matches` counts (a truthy string or an object is not a match)', () => {
	assert.equal(isTouchFirst({ matchMedia: () => ({ matches: 'yes' }) }), false);
	assert.equal(isTouchFirst({ matchMedia: () => ({}) }), false);
	assert.equal(isTouchFirst({ matchMedia: () => ({ matches: true }) }), true);
});

test('without an argument the gate reads globalThis.window: in node there is none, so Monaco', () => {
	assert.equal(globalThis.window, undefined, 'the test runs without a DOM');
	assert.equal(isTouchFirst(), false);
	assert.equal(viewFor(), VIEWS.monaco);
});

test('a language compiled in the browser mounts Monaco before a run from the static view; the others run the static text', () => {
	assert.equal(staticRunPolicy('typescript'), RUN_POLICIES.mountFirst);
	assert.equal(staticRunPolicy('ts'), RUN_POLICIES.mountFirst, 'the alias names the same language');
	assert.equal(staticRunPolicy('TypeScript'), RUN_POLICIES.mountFirst, 'any case');
	assert.equal(staticRunPolicy('python'), RUN_POLICIES.now);
	assert.equal(staticRunPolicy('bash'), RUN_POLICIES.now);
	assert.equal(staticRunPolicy('javascript'), RUN_POLICIES.now);
	assert.equal(staticRunPolicy('js'), RUN_POLICIES.now);
	assert.equal(staticRunPolicy('ruby'), RUN_POLICIES.now, 'a language the library does not list runs on the server');
});

test('touchSettings: after the tap the Monaco box fits the code up to the screen, whatever height the page gave; nothing else changes, and the page\'s settings are not touched', () => {
	assert.deepEqual(TOUCH_BOX, { fit: true, height: null, maxHeight: '100vh' });
	assert.ok(Object.isFrozen(TOUCH_BOX));
	const page = normalizeEditorProps({ initialCode: 'x = 1\n', foldedRegions: [[1, 1]], stdin: '5' });
	const before = JSON.stringify(page);
	const touched = touchSettings(page);
	assert.notEqual(touched, page, 'a new object');
	assert.equal(JSON.stringify(page), before, 'the page\'s settings are untouched');
	assert.deepEqual({ fit: touched.fit, height: touched.height, maxHeight: touched.maxHeight }, TOUCH_BOX, "the page's 50vh is replaced: a 50vh box at the tap moved the page under the finger and left an empty area that swallowed swipes");
	for (const key of Object.keys(page).filter((name) => !(name in TOUCH_BOX))) {
		assert.equal(touched[key], page[key], `${key}: as the page gave it`);
	}
	const tall = touchSettings(normalizeEditorProps({ initialCode: 'x', height: '80vh', maxHeight: '30vh' }));
	assert.deepEqual({ fit: tall.fit, height: tall.height, maxHeight: tall.maxHeight }, TOUCH_BOX, "a page's own height and ceiling are replaced too: the static view never showed them");
	assert.deepEqual(editorBoxStyle({ ...TOUCH_BOX, contentHeight: 184 }), { height: '184px', minHeight: '80px', maxHeight: '100vh' }, "the box's first style: the code's estimated height, floored and capped");
});

test('viewAfterLoad: an editor that opened in the static view goes back to it when Monaco fails to load after the tap', () => {
	assert.equal(viewAfterLoad({ initialView: VIEWS.static, view: VIEWS.monaco, editorError: 'x', monacoReady: false }), VIEWS.static, 'the code and Run come back');
	assert.equal(viewAfterLoad({ initialView: VIEWS.static, view: VIEWS.monaco, editorError: null, monacoReady: false }), VIEWS.monaco, 'still loading: wait');
	assert.equal(viewAfterLoad({ initialView: VIEWS.static, view: VIEWS.monaco, editorError: null, monacoReady: true }), VIEWS.monaco, 'Monaco is up');
	assert.equal(viewAfterLoad({ initialView: VIEWS.static, view: VIEWS.monaco, editorError: 'x', monacoReady: true }), VIEWS.monaco, 'an editor that is up stays up');
	assert.equal(viewAfterLoad({ initialView: VIEWS.static, view: VIEWS.static, editorError: 'x', monacoReady: false }), VIEWS.static, 'already back');
	assert.equal(viewAfterLoad({ initialView: VIEWS.static, view: VIEWS.static, editorError: null, monacoReady: false }), VIEWS.static, 'before any tap');
});

test('viewAfterLoad: a desktop keeps the Monaco view whatever happens (it has no static view to go back to)', () => {
	for (const editorError of [null, 'x']) {
		for (const monacoReady of [false, true]) {
			assert.equal(viewAfterLoad({ initialView: VIEWS.monaco, view: VIEWS.monaco, editorError, monacoReady }), VIEWS.monaco, `error ${editorError}, ready ${monacoReady}`);
		}
	}
});

test('runBlockingError: the Monaco view cannot run without Monaco; the static view runs its own text, except a language compiled in Monaco\'s worker', () => {
	assert.equal(runBlockingError({ view: VIEWS.monaco, language: 'python', editorError: 'x' }), 'x');
	assert.equal(runBlockingError({ view: VIEWS.monaco, language: 'python', editorError: null }), null);
	assert.equal(runBlockingError({ view: VIEWS.static, language: 'python', editorError: 'x' }), null, 'the static view sends its own text');
	assert.equal(runBlockingError({ view: VIEWS.static, language: 'javascript', editorError: 'x' }), null);
	assert.equal(runBlockingError({ view: VIEWS.static, language: 'typescript', editorError: 'x' }), 'x', 'TypeScript compiles in Monaco: a Run would only mount it and fail again');
	assert.equal(runBlockingError({ view: VIEWS.static, language: 'typescript', editorError: null }), null, 'before a failure the Run mounts Monaco as usual');
});
