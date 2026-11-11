/**
 * versions.test.js — comparing versions and matching selectors (../versions.js): numeric
 * segments ("3.10.0" > "3.9.4"), missing segments, pre-release text, every selector form
 * (any, exact, prefix, wildcards), and resolveVersion() picking the highest match. Run with
 * `npm run test:shared`.
 * To change it: a new selector form of ../versions.js gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isAnyVersion, matchesSelector, resolveVersion } from '../versions.js';

/** Python versions Piston offers, in no particular order. */
const PYTHONS = ['3.9.1', '3.12.0', '2.7.18', '3.10.0', '3.5.10', '3.9.4', '3.11.0'];

/** The sign of a comparison: -1, 0 or 1. */
const sign = (value) => Math.sign(value);

test('compareVersions: segments compare as numbers, not text', () => {
	assert.equal(sign(compareVersions('3.10.0', '3.9.4')), 1);
	assert.equal(sign(compareVersions('3.9.4', '3.10.0')), -1);
	assert.equal(sign(compareVersions('10.2.0', '9.0.0')), 1);
	assert.equal(sign(compareVersions('1.68.2', '1.50.0')), 1);
	assert.equal(sign(compareVersions('3.5.10', '3.5.9')), 1);
	assert.equal(sign(compareVersions('3.12.0', '3.12.0')), 0);
});

test('compareVersions: a missing segment counts as 0', () => {
	assert.equal(compareVersions('3.12', '3.12.0'), 0);
	assert.equal(compareVersions('3', '3.0.0'), 0);
	assert.equal(sign(compareVersions('3.12', '3.12.1')), -1);
	assert.equal(sign(compareVersions('3.12.0.1', '3.12')), 1);
});

test('compareVersions: text after a number sorts just below the plain number', () => {
	assert.equal(sign(compareVersions('4.7.0-rc.0', '4.7.0')), -1);
	assert.equal(sign(compareVersions('4.7.0', '4.7.0-rc.0')), 1);
	assert.equal(sign(compareVersions('4.7.0-rc.1', '4.7.0-rc.0')), 1);
	assert.equal(sign(compareVersions('1.0.0-alpha', '1.0.0-beta')), -1);
	assert.equal(sign(compareVersions('4.7.0-rc.0', '4.6.9')), 1);
});

test('compareVersions: empty, null and numbers never throw', () => {
	assert.equal(compareVersions('', ''), 0);
	assert.equal(compareVersions(null, undefined), 0);
	assert.equal(sign(compareVersions('1.0.0', '')), 1);
	assert.equal(compareVersions(3.12, '3.12.0'), 0);
	assert.equal(compareVersions(' 3.12.0 ', '3.12.0'), 0);
});

test('compareVersions sorts a list newest first', () => {
	const sorted = PYTHONS.slice().sort((a, b) => compareVersions(b, a));
	assert.deepEqual(sorted, ['3.12.0', '3.11.0', '3.10.0', '3.9.4', '3.9.1', '3.5.10', '2.7.18']);
});

test('matchesSelector: empty, "*" and "latest" match every version', () => {
	for (const selector of [undefined, null, '', '   ', '*', ' * ', 'latest', 'LATEST', 'Latest']) {
		assert.equal(matchesSelector('3.12.0', selector), true, String(selector));
		assert.equal(isAnyVersion(selector), true, String(selector));
	}
	assert.equal(isAnyVersion('3'), false);
	assert.equal(isAnyVersion('x'), false, '"x" is a wildcard segment, not the any-version word');
});

test('matchesSelector: the exact version', () => {
	assert.equal(matchesSelector('3.12.0', '3.12.0'), true);
	assert.equal(matchesSelector('3.12.0', '3.12.1'), false);
	assert.equal(matchesSelector('3.12.0', ' 3.12.0 '), true);
	assert.equal(matchesSelector('4.7.0-rc.0', '4.7.0-rc.0'), true);
	assert.equal(matchesSelector('4.7.0', '4.7.0-rc.0'), false);
});

test('matchesSelector: a prefix of whole segments', () => {
	assert.equal(matchesSelector('3.12.0', '3'), true);
	assert.equal(matchesSelector('3.12.0', '3.12'), true);
	assert.equal(matchesSelector('3.10.0', '3.10'), true);
	assert.equal(matchesSelector('3.12.0', '3.1'), false, 'whole segments only');
	assert.equal(matchesSelector('3.10.0', '3.1'), false);
	assert.equal(matchesSelector('3.12.0', '2'), false);
	assert.equal(matchesSelector('13.0.0', '1'), false);
});

test('matchesSelector: segments past the end of the version count as 0', () => {
	assert.equal(matchesSelector('3.12', '3.12.0'), true);
	assert.equal(matchesSelector('3.12.0', '3.12.0.0'), true);
	assert.equal(matchesSelector('3.12.0', '3.12.0.1'), false);
});

test('matchesSelector: wildcard segments x, X and *', () => {
	assert.equal(matchesSelector('3.12.0', '3.x'), true);
	assert.equal(matchesSelector('3.12.0', '3.X'), true);
	assert.equal(matchesSelector('3.12.0', '3.*'), true);
	assert.equal(matchesSelector('3.12.0', '3.12.x'), true);
	assert.equal(matchesSelector('3.12.0', '3.x.0'), true);
	assert.equal(matchesSelector('3.12.1', '3.x.0'), false);
	assert.equal(matchesSelector('3.12.0', 'x'), true);
	assert.equal(matchesSelector('3.12.0', 'x.12'), true);
	assert.equal(matchesSelector('2.7.18', '3.x'), false);
});

test('matchesSelector: numbers are read as their text (write versions as strings)', () => {
	assert.equal(matchesSelector('3.12.0', 3), true);
	assert.equal(matchesSelector('3.12.0', 3.12), true);
	assert.equal(matchesSelector('3.10.0', 3.10), false, 'the number 3.10 is 3.1');
});

test('matchesSelector: ranges are not understood, an empty version matches nothing specific', () => {
	assert.equal(matchesSelector('3.12.0', '^3'), false);
	assert.equal(matchesSelector('3.12.0', '>=3.9'), false);
	assert.equal(matchesSelector('', '3'), false);
	assert.equal(matchesSelector(undefined, '3'), false);
	assert.equal(matchesSelector('', '*'), true);
});

test('resolveVersion: the highest matching version', () => {
	assert.deepEqual(resolveVersion(PYTHONS, '*'), { version: '3.12.0', exact: false });
	assert.deepEqual(resolveVersion(PYTHONS, undefined), { version: '3.12.0', exact: false });
	assert.deepEqual(resolveVersion(PYTHONS, '3'), { version: '3.12.0', exact: false });
	assert.deepEqual(resolveVersion(PYTHONS, '3.9'), { version: '3.9.4', exact: false });
	assert.deepEqual(resolveVersion(PYTHONS, '3.x'), { version: '3.12.0', exact: false });
	assert.deepEqual(resolveVersion(PYTHONS, '2'), { version: '2.7.18', exact: false });
	assert.deepEqual(resolveVersion(PYTHONS, '3.5'), { version: '3.5.10', exact: false });
});

test('resolveVersion: exact is true only when the selector is that version', () => {
	assert.deepEqual(resolveVersion(PYTHONS, '3.10.0'), { version: '3.10.0', exact: true });
	assert.deepEqual(resolveVersion(PYTHONS, ' 3.10.0 '), { version: '3.10.0', exact: true });
	assert.deepEqual(resolveVersion(PYTHONS, '3.10'), { version: '3.10.0', exact: false });
	assert.deepEqual(resolveVersion(['3.12.0'], '3.12.0'), { version: '3.12.0', exact: true });
});

test('resolveVersion: nothing matches', () => {
	assert.deepEqual(resolveVersion(['3.12.0'], '3.10'), { version: null, exact: false });
	assert.deepEqual(resolveVersion([], '*'), { version: null, exact: false });
	assert.deepEqual(resolveVersion(undefined, '*'), { version: null, exact: false });
	assert.deepEqual(resolveVersion('3.12.0', '*'), { version: null, exact: false }, 'a string is not a list');
});

test('resolveVersion: skips entries that are not strings, handles duplicates, keeps the input', () => {
	const versions = ['3.9.4', null, 3.12, { version: '9' }, '3.12.0', '3.12.0'];
	const copy = versions.slice();
	assert.deepEqual(resolveVersion(versions, '3'), { version: '3.12.0', exact: false });
	assert.deepEqual(versions, copy);
});
