/**
 * surface.test.js — the contract (../surface.js): isSurface accepts a complete surface of either
 * kind and refuses a partial one or an unknown kind; noopMarkers' answers.
 * Run with `npm run test:shared`.
 * To change it: a new member of the contract goes in ../surface.js with a test here, and in the tests
 * of both halves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKERS_METHODS, MARKS_METHODS, SURFACE_KINDS, SURFACE_METHODS, isSurface, noopMarkers } from '../surface.js';

/** A complete fake surface of `kind`. */
function fakeSurface(kind) {
	const surface = { kind, marks: {}, markers: {} };
	for (const name of SURFACE_METHODS) surface[name] = () => {};
	for (const name of MARKS_METHODS) surface.marks[name] = () => {};
	for (const name of MARKERS_METHODS) surface.markers[name] = () => {};
	return surface;
}

test('isSurface: both kinds, complete', () => {
	assert.equal(isSurface(fakeSurface(SURFACE_KINDS.monaco)), true);
	assert.equal(isSurface(fakeSurface(SURFACE_KINDS.static)), true);
	assert.deepEqual(Object.values(SURFACE_KINDS), ['monaco', 'static']);
});

test('isSurface: a missing method, a missing marks or markers member, an unknown kind, or no object at all is refused', () => {
	for (const name of SURFACE_METHODS) {
		const partial = fakeSurface(SURFACE_KINDS.monaco);
		delete partial[name];
		assert.equal(isSurface(partial), false, `without ${name}`);
	}
	const noMarks = fakeSurface(SURFACE_KINDS.static);
	delete noMarks.marks.flash;
	assert.equal(isSurface(noMarks), false);
	const noMarkers = fakeSurface(SURFACE_KINDS.static);
	delete noMarkers.markers.watch;
	assert.equal(isSurface(noMarkers), false);
	assert.equal(isSurface({ ...fakeSurface(SURFACE_KINDS.static), kind: 'dom' }), false);
	assert.equal(isSurface(null), false);
	assert.equal(isSurface(undefined), false);
	assert.equal(isSurface('monaco'), false);
});

test('noopMarkers: no snapshot, nothing shown, nothing to clear, a watch that disposes', () => {
	const markers = noopMarkers();
	assert.equal(markers.begin(), null);
	assert.equal(markers.show([{ line: 1 }], null), 0);
	assert.equal(markers.clear(), undefined);
	const watch = markers.watch();
	assert.equal(typeof watch.dispose, 'function');
	assert.equal(watch.dispose(), undefined);
});
