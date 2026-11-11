/**
 * unsavedWork.test.js — the code editor's "unsaved work" registry (../unsavedWork.js, read by
 * a site's after-deploy reloader): one flag per holder, released independently. Run with
 * `npm run test:shared`.
 * To change it: a new rule of the registry gets a test here; the file stays one a site's stub
 * re-exports as it is.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnsavedWork, resetUnsavedWork, setUnsavedWork } from '../unsavedWork.js';

test('the registry is set while any holder is registered', () => {
	resetUnsavedWork();
	const notes = {};
	const form = {};
	assert.equal(hasUnsavedWork(), false);
	setUnsavedWork(notes, true);
	setUnsavedWork(form, true);
	setUnsavedWork(notes, true); // registering twice is harmless
	assert.equal(hasUnsavedWork(), true);
	setUnsavedWork(notes, false);
	assert.equal(hasUnsavedWork(), true, 'the other editor still holds text');
	setUnsavedWork(form, false);
	assert.equal(hasUnsavedWork(), false);
	setUnsavedWork(form, false); // releasing twice is harmless
	assert.equal(hasUnsavedWork(), false);
});
