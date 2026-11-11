/**
 * codeSpans.test.js — splitting an author's note into plain text and inline `code`
 * (../codeSpans.js), by Markdown's rules for code spans: a span is closed by the next run of
 * backticks of the same length, a run without a partner stays plain, one space is dropped at
 * each end of a padded span. Run with `npm run test:shared`.
 * To change it: a new Markdown rule ../codeSpans.js follows gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCodeSpans } from '../codeSpans.js';

const plain = (text) => ({ code: false, text });
const code = (text) => ({ code: true, text });

test('a note with inline code: plain, code, plain', () => {
	assert.deepEqual(splitCodeSpans('Fill `dp[i]` first.'), [plain('Fill '), code('dp[i]'), plain(' first.')]);
	assert.deepEqual(splitCodeSpans('use `a` and `b`'), [plain('use '), code('a'), plain(' and '), code('b')]);
	assert.deepEqual(splitCodeSpans('`x`'), [code('x')], 'a span at both ends: no empty plain parts');
});

test('no backticks, an empty note, or something that is not a string', () => {
	assert.deepEqual(splitCodeSpans('Just words.'), [plain('Just words.')]);
	assert.deepEqual(splitCodeSpans(''), []);
	assert.deepEqual(splitCodeSpans(undefined), []);
	assert.deepEqual(splitCodeSpans(42), []);
});

test('a run without a partner of its length stays plain text', () => {
	assert.deepEqual(splitCodeSpans('a ` b'), [plain('a ` b')]);
	assert.deepEqual(splitCodeSpans('`` then `x`'), [plain('`` then '), code('x')], 'the unmatched pair is plain; the later span still counts');
	assert.deepEqual(splitCodeSpans('`a``b`'), [code('a``b')], 'a run of another length inside a span is part of the code');
});

test('two backticks around code that holds one; padding spaces dropped once at each end', () => {
	assert.deepEqual(splitCodeSpans('the ``a ` b`` case'), [plain('the '), code('a ` b'), plain(' case')]);
	assert.deepEqual(splitCodeSpans('`` `x` ``'), [code('`x`')]);
	assert.deepEqual(splitCodeSpans('`  two  `'), [code(' two ')], 'only one space each side');
	assert.deepEqual(splitCodeSpans('`   `'), [code('   ')], 'all spaces: kept as they are');
	assert.deepEqual(splitCodeSpans('` x`'), [code(' x')], 'a space at one end only: kept');
});

test('anything else stays plain text (React escapes it when drawn)', () => {
	assert.deepEqual(splitCodeSpans('*bold* and <b>tags</b>'), [plain('*bold* and <b>tags</b>')]);
});

test('a longer run without a partner stays plain, and a shorter span after it still counts', () => {
	assert.deepEqual(splitCodeSpans('``` then `x`'), [plain('``` then '), code('x')]);
	assert.deepEqual(splitCodeSpans('`a` and `'), [code('a'), plain(' and `')], 'a lone backtick at the end');
});
