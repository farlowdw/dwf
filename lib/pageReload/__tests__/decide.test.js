/**
 * decide.test.js — the rules of the after-a-deploy reload (../decide.js): when to ask for the
 * live build id, when a different id may reload the page, the chunk-failure loop guard, and
 * the element / URL tests the client module feeds in. Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new rule in decide.js gets its case here, beside the rule it is nearest to. The two names
 *   a page and its build share (the meta, the session key) are compared in
 *   shared/plugins/build-id/__tests__/buildId.test.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	CHECK_INTERVAL_MS,
	CHUNK_RELOAD_GUARD_MS,
	buildIdFromJson,
	chunkReloadAllowed,
	cleanBuildId,
	isApiRequest,
	isAssetLoadFailure,
	isChunkLoadError,
	isTextEntry,
	reloadDecision,
	shouldCheck,
} from '../decide.js';

const ORIGIN = 'https://notes.example.test';
const NOW = 1_800_000_000_000;

/** Everything clear: a newer build is live and nothing blocks. */
const CLEAR = Object.freeze({ loadedId: 'old-1', liveId: 'new-2', unsavedWork: false, editing: false, dialogOpen: false, requestsInFlight: 0, visible: true });

test('cleanBuildId / buildIdFromJson accept only a short plain id', () => {
	assert.equal(cleanBuildId('20260929T141503120Z-3fa9c2d1'), '20260929T141503120Z-3fa9c2d1');
	assert.equal(cleanBuildId(''), null);
	assert.equal(cleanBuildId('x'.repeat(101)), null);
	assert.equal(cleanBuildId('<script>'), null);
	assert.equal(cleanBuildId(42), null);
	assert.equal(buildIdFromJson({ buildId: 'abc-1' }), 'abc-1');
	assert.equal(buildIdFromJson({ id: 'abc-1' }), null);
	assert.equal(buildIdFromJson(null), null);
	assert.equal(buildIdFromJson('abc-1'), null);
});

test('shouldCheck: visible and due, or forced by a chunk failure', () => {
	assert.equal(shouldCheck({ visible: true, now: NOW, lastCheckAt: NOW - CHECK_INTERVAL_MS }), true);
	assert.equal(shouldCheck({ visible: true, now: NOW, lastCheckAt: NOW - CHECK_INTERVAL_MS + 1 }), false, 'throttled');
	assert.equal(shouldCheck({ visible: false, now: NOW, lastCheckAt: 0 }), false, 'hidden');
	assert.equal(shouldCheck({ visible: true, now: NOW, lastCheckAt: NOW, force: true }), true, 'forced');
});

test('reloadDecision: reload only for a known, different id with nothing blocking', () => {
	assert.equal(reloadDecision(CLEAR), 'reload');
	assert.equal(reloadDecision({ ...CLEAR, liveId: 'old-1' }), 'none', 'same build');
	assert.equal(reloadDecision({ ...CLEAR, liveId: null }), 'none', 'live id unknown (offline, wall)');
	assert.equal(reloadDecision({ ...CLEAR, loadedId: null }), 'none', 'npm start: no id of its own');
});

test('reloadDecision: each blocker turns a reload into a wait', () => {
	assert.equal(reloadDecision({ ...CLEAR, unsavedWork: true }), 'wait', 'an editor holds unsaved text');
	assert.equal(reloadDecision({ ...CLEAR, editing: true }), 'wait', 'a text field has focus');
	assert.equal(reloadDecision({ ...CLEAR, dialogOpen: true }), 'wait', 'a dialog (or a grid cell editor) is open');
	assert.equal(reloadDecision({ ...CLEAR, requestsInFlight: 1 }), 'wait', 'an /api/ request is running');
	assert.equal(reloadDecision({ ...CLEAR, visible: false }), 'wait', 'the page is hidden');
	assert.equal(reloadDecision({ ...CLEAR, unsavedWork: true, liveId: 'old-1' }), 'none', 'nothing to wait for on the same build');
});

test('chunkReloadAllowed: at most one chunk reload per guard window', () => {
	assert.equal(chunkReloadAllowed({ now: NOW, lastChunkReloadAt: Number.NaN }), true, 'never reloaded');
	assert.equal(chunkReloadAllowed({ now: NOW, lastChunkReloadAt: NOW - 1000 }), false);
	assert.equal(chunkReloadAllowed({ now: NOW, lastChunkReloadAt: NOW - CHUNK_RELOAD_GUARD_MS }), true);
});

test('isChunkLoadError recognises webpack chunk failures only', () => {
	assert.equal(isChunkLoadError({ name: 'ChunkLoadError', message: 'x' }), true);
	assert.equal(isChunkLoadError(new Error('Loading chunk 8141 failed.\n(error: https://x/assets/js/8141.js)')), true);
	assert.equal(isChunkLoadError(new Error('Loading CSS chunk 12 failed.')), true);
	assert.equal(isChunkLoadError(new Error('Failed to fetch')), false);
	assert.equal(isChunkLoadError(undefined), false);
	assert.equal(isChunkLoadError('Loading chunk 1 failed'), false, 'a bare string is not an Error');
});

test('isAssetLoadFailure: this site\'s /assets/ scripts and stylesheets only', () => {
	assert.equal(isAssetLoadFailure({ tagName: 'SCRIPT', src: `${ORIGIN}/assets/js/main.1234.js` }, ORIGIN), true);
	assert.equal(isAssetLoadFailure({ tagName: 'LINK', rel: 'stylesheet', href: `${ORIGIN}/assets/css/styles.css` }, ORIGIN), true);
	assert.equal(isAssetLoadFailure({ tagName: 'LINK', rel: 'prefetch', href: `${ORIGIN}/assets/js/1.js` }, ORIGIN), false, 'a prefetch hint');
	assert.equal(isAssetLoadFailure({ tagName: 'SCRIPT', src: 'https://cdn.example.com/assets/x.js' }, ORIGIN), false, 'another origin');
	assert.equal(isAssetLoadFailure({ tagName: 'IMG', src: `${ORIGIN}/assets/images/a.png` }, ORIGIN), false, 'an image');
	assert.equal(isAssetLoadFailure({ tagName: 'SCRIPT', src: '' }, ORIGIN), false, 'an inline script');
	assert.equal(isAssetLoadFailure(null, ORIGIN), false);
	assert.equal(isAssetLoadFailure({}, ORIGIN), false, 'the window itself (a script error, not a load failure)');
});

test('isApiRequest: this site\'s /api/ in any fetch input form', () => {
	assert.equal(isApiRequest('/api/notes/intro', ORIGIN), true);
	assert.equal(isApiRequest(`${ORIGIN}/api/images/01J`, ORIGIN), true);
	assert.equal(isApiRequest(new URL('/api/notes', ORIGIN), ORIGIN), true);
	assert.equal(isApiRequest({ url: `${ORIGIN}/api/notes` }, ORIGIN), true, 'a Request');
	assert.equal(isApiRequest('/data/index.json', ORIGIN), false);
	assert.equal(isApiRequest('/build-id.json', ORIGIN), false);
	assert.equal(isApiRequest('https://other.example.com/api/x', ORIGIN), false);
	assert.equal(isApiRequest(undefined, ORIGIN), false);
});

test('isApiRequest: one of the site\'s functions, called by its own path, counts too (a code run)', () => {
	assert.equal(isApiRequest('/.netlify/functions/execute', ORIGIN), true);
	assert.equal(isApiRequest(new URL('/.netlify/functions/runtimes', ORIGIN), ORIGIN), true);
	assert.equal(isApiRequest('https://other.example.com/.netlify/functions/execute', ORIGIN), false);
	assert.equal(isApiRequest('/netlify/functions/execute', ORIGIN), false);
});

test('isTextEntry: text fields and editable areas, not buttons or checkboxes', () => {
	assert.equal(isTextEntry({ tagName: 'TEXTAREA' }), true);
	assert.equal(isTextEntry({ tagName: 'INPUT', type: 'text' }), true);
	assert.equal(isTextEntry({ tagName: 'INPUT' }), true, 'no type = text');
	assert.equal(isTextEntry({ tagName: 'INPUT', type: 'search' }), true);
	assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: true }), true);
	assert.equal(isTextEntry({ tagName: 'INPUT', type: 'checkbox' }), false);
	assert.equal(isTextEntry({ tagName: 'BUTTON' }), false);
	assert.equal(isTextEntry({ tagName: 'BODY', isContentEditable: false }), false);
	assert.equal(isTextEntry(null), false);
});

test('isTextEntry: an EditContext host (Monaco 0.55 in Chrome and Edge: a focused <div>, not contenteditable) takes typed text', () => {
	assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: false, editContext: {} }), true, 'div.native-edit-context');
	assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: false, editContext: null }), false, 'EditContext exists, none set');
	assert.equal(isTextEntry({ tagName: 'DIV', isContentEditable: false }), false, 'a browser without EditContext');
});
