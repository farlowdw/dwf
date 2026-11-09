/**
 * scripts/__tests__/phrases.test.mjs: the wording every script shares. A count reads through `counted`,
 * so "1 warnings" has one place to come back from, and this is where it would show.
 *
 * How to change it: a new phrase in lib/phrases.mjs gets a test here. From the hub:
 *   node --test scripts/__tests__/phrases.test.mjs
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_DETAILS, capped, counted, listed, short } from '../lib/phrases.mjs';

test('counted: one is singular, every other number is plural', () => {
  assert.equal(counted(1, 'warning'), '1 warning');
  assert.equal(counted(0, 'warning'), '0 warnings');
  assert.equal(counted(2, 'warning'), '2 warnings');
});

test('counted: a noun of several words takes the plural on its last word', () => {
  assert.equal(counted(1, 'changed tracked file'), '1 changed tracked file');
  assert.equal(counted(3, 'changed tracked file'), '3 changed tracked files');
});

test('counted: a noun that ends in y', () => {
  assert.equal(counted(1, 'entry'), '1 entry');
  assert.equal(counted(2, 'entry'), '2 entries');
  assert.equal(counted(2, 'local copy'), '2 local copies');
});

test('short: seven characters of a sha', () => {
  assert.equal(short('4a0251256aed5918'), '4a02512');
});

test('capped: a list up to MAX_DETAILS stays whole, and a longer one keeps that many and counts the rest', () => {
  const lines = (count) => Array.from({ length: count }, (_, index) => `line ${index + 1}`);
  assert.deepEqual(capped([]), []);
  assert.deepEqual(capped(lines(MAX_DETAILS)), lines(MAX_DETAILS));
  assert.deepEqual(capped(lines(MAX_DETAILS + 1)), [...lines(MAX_DETAILS), 'and 1 more']);
  assert.deepEqual(capped(lines(MAX_DETAILS + 3)), [...lines(MAX_DETAILS), 'and 3 more']);
});

test('listed: one word as it is, two with and, more with commas and a last and', () => {
  assert.equal(listed([]), '');
  assert.equal(listed(['a']), 'a');
  assert.equal(listed(['a', 'b']), 'a and b');
  assert.equal(listed(['a', 'b', 'c']), 'a, b and c');
});
