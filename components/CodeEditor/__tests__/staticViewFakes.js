/**
 * staticViewFakes.js — stand-ins for the three modules the static view's files import but that
 * are not under test there (prismTheme.js, staticCodeStore.js, staticSurface.js; each has its
 * own test), so staticCode.test.js and staticBox.test.js check StaticCode.jsx, StaticBox.jsx and
 * useStaticStores.js alone, with fakes that record what they were asked. Two things in one
 * file, as reactHookShim.js is:
 *   - a Node module hook (resolve): an import of './prismTheme.js', './staticCodeStore.js' or
 *     './staticSurface.js' from a file of the editor's folder becomes THIS file;
 *   - the fakes themselves (the same exports those modules have), plus helpers for the tests.
 *
 *     register('./jsxHooks.js', import.meta.url);          // .jsx and CSS-module imports
 *     register('./staticViewFakes.js', import.meta.url);   // the three modules → this file
 *     const fakes = await import('./staticViewFakes.js');  // the SAME instance the components get
 *
 *   prismThemeOf(name)          FAKE_PRISM_THEME (keyword magenta, comment green italic), the
 *                               names asked recorded in `themeNamesAsked`
 *   prismLanguageFor(monacoId)  shell → bash, plaintext → text, else the id (the spec's rule)
 *   createStaticCodeStore(…)    a small working store: the snapshot shape of staticCodeStore.js,
 *                               folds closed at first, every method recorded in `calls`; each
 *                               one is pushed to `createdStores`
 *   hiddenLinesOf(folds)        the lines start+1 … end of each closed fold (a Set)
 *   createStaticSurface(…)      { kind: 'static', options } pushed to `createdSurfaces`
 *   fakeStore(snapshot)         a store whose snapshot is exactly `snapshot` (for the markup tests)
 *
 * HOW TO CHANGE IT  A module the static view comes to import that its tests should fake: its
 * name in FAKED_MODULES and its exports below.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The component's folder, as a URL prefix. */
const FOLDER_URL = pathToFileURL(path.resolve(HERE, '..') + path.sep).href;

/** The modules this file stands in for (imported as './<name>' from the folder's files). */
const FAKED_MODULES = Object.freeze(['prismTheme.js', 'staticCodeStore.js', 'staticSurface.js']);

/** Node module hook: a faked module, imported from the folder, is this file. */
export async function resolve(specifier, context, nextResolve) {
	const fromFolder = typeof context.parentURL === 'string' && context.parentURL.startsWith(FOLDER_URL);
	if (fromFolder && specifier.startsWith('./') && FAKED_MODULES.includes(specifier.slice(2))) {
		return { url: import.meta.url, shortCircuit: true };
	}
	return nextResolve(specifier, context);
}

/* ---- prismTheme.js ---- */

/** The Prism theme every name resolves to: plain colours and two token colours the tests look for. */
export const FAKE_PRISM_THEME = Object.freeze({
	plain: Object.freeze({ color: '#111111', backgroundColor: '#fefefe' }),
	styles: Object.freeze([
		Object.freeze({ types: ['keyword'], style: Object.freeze({ color: '#ff00ff' }) }),
		Object.freeze({ types: ['comment'], style: Object.freeze({ color: '#00aa00', fontStyle: 'italic' }) }),
	]),
});

/** Every theme name prismThemeOf was asked for, in order. */
export const themeNamesAsked = [];

export function prismThemeOf(name) {
	themeNamesAsked.push(name);
	return FAKE_PRISM_THEME;
}

export function prismLanguageFor(monacoId) {
	if (monacoId === 'shell') return 'bash';
	if (monacoId === 'plaintext') return 'text';
	return monacoId;
}

/* ---- staticCodeStore.js ---- */

/** The lines start+1 … end of every closed fold (a Set). */
export function hiddenLinesOf(folds) {
	const hidden = new Set();
	for (const fold of folds ?? []) {
		if (fold.open) continue;
		for (let line = fold.start + 1; line <= fold.end; line += 1) hidden.add(line);
	}
	return hidden;
}

/** Every store createStaticCodeStore made, in order. */
export const createdStores = [];

/** The folds of `regions` ([[start, end], …]), all closed. */
function closedFolds(regions) {
	return (regions ?? []).map(([start, end]) => ({ start, end, open: false }));
}

/** A small working store with the snapshot shape of staticCodeStore.js (see the header). */
export function createStaticCodeStore({ text, foldRegions = [], lineKinds = {} }) {
	const listeners = new Set();
	const calls = [];
	let snapshot = {
		text,
		lines: text.split('\n'),
		folds: closedFolds(foldRegions),
		lineKinds: { ...lineKinds },
		stepLines: new Set(),
		flash: { lines: new Set(), token: 0 },
	};

	function change(next) {
		snapshot = { ...snapshot, ...next };
		for (const listener of listeners) listener();
	}

	const store = {
		config: { text, foldRegions, lineKinds },
		calls,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => snapshot,
		setText(nextText) {
			calls.push(['setText', nextText]);
			change({ text: nextText, lines: nextText.split('\n'), folds: [], lineKinds: {} });
		},
		setFolds(regions) {
			calls.push(['setFolds', regions]);
			change({ folds: closedFolds(regions) });
		},
		openFoldsHiding(ranges) {
			calls.push(['openFoldsHiding', ranges]);
			return false;
		},
		toggleFold(index) {
			calls.push(['toggleFold', index]);
			change({ folds: snapshot.folds.map((fold, at) => (at === index ? { ...fold, open: !fold.open } : fold)) });
		},
		closeFolds() {
			calls.push(['closeFolds']);
			change({ folds: snapshot.folds.map((fold) => ({ ...fold, open: false })) });
		},
		setMarks(kinds) {
			calls.push(['setMarks', kinds]);
			change({ lineKinds: { ...kinds } });
		},
		showStep(ranges) {
			calls.push(['showStep', ranges]);
		},
		flash(ranges) {
			calls.push(['flash', ranges]);
		},
		lineCount: () => snapshot.lines.length,
		isHidden: (line) => hiddenLinesOf(snapshot.folds).has(line),
	};
	createdStores.push(store);
	return store;
}

/** A store whose snapshot is exactly `snapshot` (the markup tests build the state by hand). */
export function fakeStore(snapshot) {
	return {
		subscribe: () => () => {},
		getSnapshot: () => snapshot,
		toggleFold() {},
	};
}

/* ---- staticSurface.js ---- */

/** Every surface createStaticSurface made, in order. */
export const createdSurfaces = [];

export function createStaticSurface(options) {
	const surface = { kind: 'static', options };
	createdSurfaces.push(surface);
	return surface;
}
