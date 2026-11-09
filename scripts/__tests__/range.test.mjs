/**
 * scripts/__tests__/range.test.mjs: the small version-range comparator, form by form. A new form gets
 * a row in RANGE_ROWS.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareVersions, firstVersion, fullVersionOf, parseVersion, readVersionWord, satisfies, satisfiesAsNpm,
} from '../lib/range.mjs';

/** [version, range, expected] */
const RANGE_ROWS = [
  ['1.2.3', '1.2.3', true], ['1.2.4', '1.2.3', false], ['1.2.3', '=1.2.3', true], ['1.2.3', 'v1.2.3', true],
  ['1.3.0', '^1.2.3', true], ['1.2.2', '^1.2.3', false], ['2.0.0', '^1.2.3', false],
  ['0.2.9', '^0.2.5', true], ['0.3.0', '^0.2.5', false], ['0.0.3', '^0.0.3', true], ['0.0.4', '^0.0.3', false],
  ['1.2.9', '~1.2.3', true], ['1.3.0', '~1.2.3', false], ['1.9.0', '~1', true], ['2.0.0', '~1', false],
  ['19.3.0', '>=19', true], ['18.9.0', '>=19', false], ['19.0.1', '>19.0.0', true], ['19.0.0', '>19.0.0', false],
  ['1.9.9', '<2', true], ['2.0.0', '<2', false], ['2.1.0', '<=2.1.0', true], ['2.1.1', '<=2.1.0', false],
  ['1.5.0', '1.x', true], ['2.0.0', '1.x', false], ['1.2.9', '1.2.x', true], ['1.3.0', '1.2.x', false],
  ['1.2.9', '1.2', true], ['1.5.0', '1', true], ['2.0.0', '1', false],
  ['5.0.0', '*', true], ['5.0.0', '', true], ['5.0.0', 'x', true],
  ['19.2.3', '^18.0.0 || ^19.0.0', true], ['17.0.0', '^18.0.0 || ^19.0.0', false],
  ['1.5.0', '>=1.0.0 <2', true], ['2.0.0', '>=1.0.0 <2', false], ['1.104.1', '>= 1.80.5', true],
  ['1.5.0', '1.2.3 - 2.0.0', true], ['2.0.1', '1.2.3 - 2.0.0', false],
  ['3.0.0-alpha.1', '^3.0.0', false], ['3.0.0', '^3.0.0-alpha.1', true],
  ['not-a-version', '^1.0.0', false],
];

test('satisfies: every range form', () => {
  for (const [version, range, expected] of RANGE_ROWS) {
    assert.equal(satisfies(version, range), expected, `${version} in ${range}`);
  }
});

/** [version, range, expected], each answer the one the semver package gives. */
const NPM_ROWS = [
  ['4.0.0-canary-7002', '>=3.0.0', false], ['4.0.0', '>=3.0.0', true], ['3.11.0', '>=3.0.0', true],
  ['4.0.0-canary-7002', '^2.0.0-beta || ^3.0.0-alpha', false], ['4.0.0', '^2.0.0-beta || ^3.0.0-alpha', false],
  ['3.11.0', '^2.0.0-beta || ^3.0.0-alpha', true], ['3.0.0-alpha.2', '^2.0.0-beta || ^3.0.0-alpha.1', true],
  ['4.0.0-canary-7002', '^4.0.0-canary-7002', true], ['4.0.0-canary-7003', '^4.0.0-canary-7002', true],
  ['4.0.1-canary-7002', '^4.0.0-canary-7002', false], ['4.0.0-canary-7002', '*', false],
  ['not-a-version', '>=3.0.0', false],
];

test('satisfiesAsNpm: a prerelease needs a comparator of its own numbers', () => {
  for (const [version, range, expected] of NPM_ROWS) {
    assert.equal(satisfiesAsNpm(version, range), expected, `${version} in ${range}`);
  }
});

/** [version, range, expected] for a partial version after an operator, each answer the one npm's semver gives. */
const PARTIAL_ROWS = [
  ['1.2.3', '>1.2', false], ['1.3.0', '>1.2', true], ['1.2.0', '>1', false], ['1.9.9', '>1', false], ['2.0.0', '>1', true],
  ['2.3.0', '<=2', true], ['2.9.9', '<=2', true], ['3.0.0', '<=2', false], ['1.2.9', '<=1.2', true], ['1.3.0', '<=1.2', false],
  ['2.3.9', '1.2.3 - 2.3', true], ['2.4.0', '1.2.3 - 2.3', false], ['2.9.0', '1.2.3 - 2', true], ['3.0.0', '1.2.3 - 2', false],
  ['1.2.0', '1.2 - 2.0.0', true], ['1.1.9', '1.2 - 2.0.0', false],
  ['0.0.4', '^0', true], ['0.17.0', '^0', true], ['1.0.0', '^0', false],
  ['0.0.4', '^0.0', true], ['0.1.0', '^0.0', false], ['0.1.5', '^0.1', true], ['0.2.0', '^0.1', false], ['0.3.0', '^0.2', false],
  ['1.9.0', '^1.2', true],
  ['3.10.2', '>3.10', false], ['3.11.0', '>3.10', true], ['3.10.2', '<=3', true], ['4.0.0', '<=3', false],
];

test('a partial version after >, <=, ^0, ^0.0 or at a hyphen range\'s upper end rounds as npm rounds it', () => {
  for (const [version, range, expected] of PARTIAL_ROWS) {
    assert.equal(satisfiesAsNpm(version, range), expected, `${version} in ${range}, as npm`);
    assert.equal(satisfies(version, range), expected, `${version} in ${range}`);
  }
});

test('fullVersionOf fills a partial version with zeros, and gives null for no version', () => {
  assert.equal(fullVersionOf('3.9'), '3.9.0');
  assert.equal(fullVersionOf('3'), '3.0.0');
  assert.equal(fullVersionOf('3.10.2'), '3.10.2');
  assert.equal(fullVersionOf('4.0.0-canary-7002'), '4.0.0-canary-7002');
  assert.equal(fullVersionOf(null), null);
  assert.equal(fullVersionOf('latest'), null);
});

test('the ranges requirements.cjs uses hold for the locks that differ today', () => {
  assert.equal(satisfies('1.104.1', '^1.80.5'), true);
  assert.equal(satisfies('1.97.2', '^1.80.5'), true);
  assert.equal(satisfies('19.3.0', '^19.0.0'), true);
  assert.equal(satisfies('19.2.3', '^19.0.0'), true);
  assert.equal(satisfies('5.18.0', '^9.4.0'), false);
});

test('compareVersions orders numbers as numbers, and a prerelease below its release', () => {
  const ordered = ['1.2.9', '1.10.0', '2.0.0-rc.2', '2.0.0-rc.10', '2.0.0'];
  const shuffled = [...ordered].reverse().map(parseVersion);
  const sorted = shuffled.sort(compareVersions);
  assert.deepEqual(sorted, ordered.map(parseVersion));
});

test('parseVersion refuses what is no version, and firstVersion picks the number to install', () => {
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('latest'), null);
  assert.equal(firstVersion('^9.4.0'), '9.4.0');
  assert.equal(firstVersion('0.55.1'), '0.55.1');
  assert.equal(firstVersion('*'), null);
});

test('readVersionWord takes a version as npm writes it, without a leading v, and refuses the rest with the caller\'s error', () => {
  const usageError = (sentence) => new Error(`usage: ${sentence}`);
  assert.equal(readVersionWord('3.10.2', usageError), '3.10.2');
  assert.equal(readVersionWord('v3.10.2', usageError), '3.10.2');
  assert.equal(readVersionWord('3.11.0-canary.1', usageError), '3.11.0-canary.1');
  assert.throws(() => readVersionWord('3.10', usageError), { message: 'usage: 3.10 is not a version.' });
  assert.throws(() => readVersionWord('latest', usageError), { message: 'usage: latest is not a version.' });
});
