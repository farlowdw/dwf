/**
 * dirtyLanguages.test.js — which languages hold the reader's edits (../dirtyLanguages.js), told
 * to the REAL registry (../unsavedWork.js, which a site's after-deploy reloader reads) as CodeEditorClient.jsx >
 * useUnsavedWork tells it:
 *   - restored drafts are edits from the start, shown or not (the after-deploy reload waits);
 *   - the last language made clean again lets the reload go ahead;
 *   - with nothing restored, nothing is registered until an edit;
 *   - release() (unmount) lets go, and publish() (React re-running effects) holds again.
 * Run with `npm run test:shared`.
 * To change it: a new rule of ../dirtyLanguages.js gets a test here, told to the real registry.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnsavedWork, resetUnsavedWork, setUnsavedWork } from '../unsavedWork.js';
import { createDirtyLanguages } from '../dirtyLanguages.js';

/** A dirty set wired as the editor wires it: one holder in the real registry, and every report kept. */
function wired(initiallyDirty) {
	resetUnsavedWork();
	const holder = {};
	const reports = [];
	const dirty = createDirtyLanguages({
		initiallyDirty,
		report: (active) => {
			reports.push(active);
			setUnsavedWork(holder, active);
		},
	});
	return { dirty, reports };
}

test('restored drafts hold the reload from the moment the editor mounts, before any edit', () => {
	const { dirty, reports } = wired(new Set(['python', 'javascript']));
	assert.equal(hasUnsavedWork(), false, 'nothing until the editor mounts');
	dirty.publish();
	assert.equal(hasUnsavedWork(), true, 'a restored draft is unsaved work');
	assert.deepEqual(reports, [true]);
	assert.equal(dirty.isDirty('javascript'), true, 'a restored language not shown yet counts too');
});

test('Discard / Reset of the last restored language lets the reload go ahead; another one still holds it', () => {
	const { dirty } = wired(['python', 'javascript']);
	dirty.publish();
	dirty.mark('python', false);
	assert.equal(hasUnsavedWork(), true, 'JavaScript still holds a restored draft');
	dirty.mark('javascript', false);
	assert.equal(hasUnsavedWork(), false);
	dirty.mark('javascript', true);
	assert.equal(hasUnsavedWork(), true, 'a new edit holds it again');
});

test('with nothing restored, nothing is registered until the reader edits', () => {
	const { dirty, reports } = wired([]);
	dirty.publish();
	assert.equal(hasUnsavedWork(), false);
	assert.deepEqual(reports, [false]);
	dirty.mark('python', true);
	assert.equal(hasUnsavedWork(), true);
	dirty.mark('python', false);
	assert.equal(hasUnsavedWork(), false, 'typed back to the snippet: clean again');
});

test('release (unmount) lets go whatever is dirty; publish (effects re-run) holds again', () => {
	const { dirty } = wired(['python']);
	dirty.publish();
	dirty.release();
	assert.equal(hasUnsavedWork(), false, 'an unmounted editor never holds the page');
	dirty.publish();
	assert.equal(hasUnsavedWork(), true, 'StrictMode / Fast Refresh: registered again');
	assert.equal(dirty.isDirty('python'), true, 'release did not forget the edits');
});

test('no initiallyDirty given: an empty set', () => {
	const reports = [];
	const dirty = createDirtyLanguages({ report: (active) => reports.push(active) });
	dirty.publish();
	assert.deepEqual(reports, [false]);
});
