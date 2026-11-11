/**
 * staticBox.test.js — the static view's box (StaticBox.jsx), rendered on the server through this
 * folder's module hooks (jsxHooks.js; staticViewFakes.js stands in for the store, the surface
 * and the theme mapping, which have their own tests):
 *   - the host element holds the code (StaticCode.jsx, on the shown language's store, made
 *     with the restored draft or the snippet and the author's folds) and then the "Tap to edit"
 *     bar — a plain button with data-touch-bar (the surface's focus() finds it), its tooltip and
 *     its words; a read-only editor has no bar; while the editor cannot load (`editBlockedReason`)
 *     the bar is greyed out with the reason as its tooltip, since a tap would only fail again;
 *   - the surface is made in a layout effect (none on the server), so the shell gets it only
 *     once the box is in the page;
 *   - STATIC_BOX_PROPS documents every prop the component reads.
 * The stores hook is useStaticStores.test.js (it needs the React shim, which this render must
 * not have). Run with `npm run test:shared`.
 * To change it: a new prop of StaticBox.jsx goes in its STATIC_BOX_PROPS and gets a test here.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEditorProps } from '../props.js';

register('./jsxHooks.js', import.meta.url);
register('./staticViewFakes.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const fakes = await import('./staticViewFakes.js');
const { default: StaticBox, STATIC_BOX_PROPS, TouchBar, useStaticStores } = await import('../StaticBox.jsx');
const { WORDS } = await import('../StaticCode.jsx');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, '..');

const SNIPPET = 'def f():\n    a = 1\n    b = 2\n    return a + b\n';
const SETTINGS = normalizeEditorProps({ initialCode: SNIPPET, foldedRegions: [[1, 3]] });
const THEME = { name: 'vs', keyColors: { lineNumber: '#237893' } };

/** useDrafts.js's shape: no draft, so the snippet and the author's folds. */
function draftsOf(settings) {
	return { startingCode: (lang) => settings.snippets.code[lang] ?? '', foldsFor: (lang) => settings.foldedRegions[lang] ?? [] };
}

function render(props = {}) {
	const settings = props.settings ?? SETTINGS;
	const element = createElement(StaticBox, { settings, language: 'python', theme: THEME, drafts: draftsOf(settings), onEdit() {}, ...props });
	return renderToStaticMarkup(element);
}

const BAR = `<button type="button" class="touchBar" data-touch-bar="" title="${WORDS.tapToEditTooltip}">${WORDS.tapToEdit}</button>`;

test('the host holds the code, then the bar; the store starts with the snippet and the author\'s folds (closed)', () => {
	const before = fakes.createdStores.length;
	const html = render();
	assert.match(html, /^<div class="staticBox"><div class="static" role="region" aria-label="Code: main\.py"/);
	assert.ok(html.endsWith(`${BAR}</div>`), 'the bar is the last thing in the host');
	assert.equal(fakes.createdStores.length, before + 1, 'one store, for the shown language');
	assert.deepEqual(fakes.createdStores.at(-1).config, { text: SNIPPET, foldRegions: [[1, 3]], lineKinds: {} });
	assert.equal([...html.matchAll(/ hidden=""/g)].length, 2, 'lines 2 and 3 are hidden by the closed fold');
	assert.ok(html.includes('⋯ 2 lines'), 'the fold marker');
});

test('a restored draft starts the store, without folds (useDrafts.js decides both)', () => {
	const drafts = { startingCode: () => 'print(1)\n', foldsFor: () => [] };
	const html = render({ drafts });
	assert.deepEqual(fakes.createdStores.at(-1).config, { text: 'print(1)\n', foldRegions: [], lineKinds: {} });
	assert.doesNotMatch(html, /hidden=""/);
});

test('a read-only editor has no bar', () => {
	const settings = normalizeEditorProps({ initialCode: SNIPPET, readOnly: true });
	const html = render({ settings });
	assert.doesNotMatch(html, /touchBar|data-touch-bar/);
	assert.ok(html.endsWith('</div></div>'), 'the host ends with the code');
});

test('TouchBar: a plain button, its tooltip and its words', () => {
	assert.equal(renderToStaticMarkup(createElement(TouchBar, { onEdit() {} })), BAR);
	assert.equal(renderToStaticMarkup(createElement(TouchBar, {})), BAR, 'without onEdit it still draws (and then does nothing)');
});

test('TouchBar and the box: while the editor cannot load, the bar is greyed out and says why', () => {
	const reason = 'The editor could not load';
	const blocked = `<button type="button" class="touchBar" data-touch-bar="" title="${reason}" disabled="">${WORDS.tapToEdit}</button>`;
	assert.equal(renderToStaticMarkup(createElement(TouchBar, { onEdit() {}, blockedReason: reason })), blocked);
	assert.equal(renderToStaticMarkup(createElement(TouchBar, { onEdit() {}, blockedReason: null })), BAR, 'no reason: the bar as it always was');
	assert.ok(render({ editBlockedReason: reason }).endsWith(`${blocked}</div>`), 'the box hands the reason to its bar');
	assert.ok(render({ editBlockedReason: null }).endsWith(`${BAR}</div>`));
});

test('the surface and the stores are handed over in layout effects: nothing on the server', () => {
	const surfaces = fakes.createdSurfaces.length;
	const calls = [];
	render({ onSurface: (surface) => calls.push(['surface', surface]), onStores: (stores) => calls.push(['stores', stores]), onModelShown: () => calls.push(['shown']) });
	assert.equal(fakes.createdSurfaces.length, surfaces, 'no surface made by a server render');
	assert.deepEqual(calls, [], 'no callback called by a server render');
	const source = readFileSync(path.join(FOLDER, 'StaticBox.jsx'), 'utf8');
	assert.match(source, /useLayoutEffect\(\(\) => \{\s*const surface = createStaticSurface\(\{ currentStore: \(\) => stores\.storeFor\(languageRef\.current\), host: hostRef\.current \}\);/, 'the surface: one, over the current store and the host');
	assert.match(source, /onSurfaceRef\.current\?\.\(surface\);\s*return \(\) => onSurfaceRef\.current\?\.\(null\);/, 'handed over, and null at unmount');
	assert.ok(source.indexOf('onStoresRef.current?.(stores)') < source.indexOf('createStaticSurface('), 'the stores before the surface');
	assert.ok(source.indexOf('createStaticSurface(') < source.indexOf('onModelShownRef.current?.(language)'), 'the surface before the first onModelShown (which carries the language)');
	assert.match(source, /onToggleFold=\{\(index\) => store\.toggleFold\(index\)\}/, 'a fold button toggles the shown store');
});

test('STATIC_BOX_PROPS names every prop the component reads', () => {
	const source = readFileSync(path.join(FOLDER, 'StaticBox.jsx'), 'utf8');
	const read = source.match(/export default function StaticBox\(\{ ([^}]+) \}\)/)[1].split(',').map((name) => name.trim());
	assert.deepEqual(Object.keys(STATIC_BOX_PROPS).sort(), read.sort());
	assert.equal(typeof useStaticStores, 'function', 'the stores hook is exported here too');
});
