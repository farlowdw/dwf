/**
 * snippets.test.js — reading the `initialCode` prop (../snippets.js): one string, one snippet per
 * language (canonical names, order, which one opens, duplicates), line endings made Unix, and
 * every empty or odd value. Run with `npm run test:shared`.
 * To change it: a new form of the initialCode prop in ../snippets.js gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSnippets } from '../snippets.js';

const PYTHON = 'print("hi")\n';
const JAVASCRIPT = 'console.log("hi");\n';
const CPP = '#include <iostream>\nint main() { std::cout << "hi"; }\n';

test('a string is one snippet, in Python by default', () => {
	assert.deepEqual(normalizeSnippets(PYTHON), { languages: ['python'], code: { python: PYTHON }, initialLanguage: 'python' });
	assert.deepEqual(normalizeSnippets(PYTHON, ''), normalizeSnippets(PYTHON));
	assert.deepEqual(normalizeSnippets(PYTHON, '   '), normalizeSnippets(PYTHON));
	assert.deepEqual(normalizeSnippets(PYTHON, null), normalizeSnippets(PYTHON));
});

test('a string in another language, by any name for it', () => {
	assert.deepEqual(normalizeSnippets(JAVASCRIPT, 'js'), { languages: ['javascript'], code: { javascript: JAVASCRIPT }, initialLanguage: 'javascript' });
	assert.deepEqual(normalizeSnippets(CPP, 'C++').languages, ['c++']);
	assert.deepEqual(normalizeSnippets(CPP, 'cpp').languages, ['c++']);
	assert.deepEqual(normalizeSnippets('x', 'Zig').languages, ['zig']);
	assert.deepEqual(normalizeSnippets('x', 'osabie').languages, ['osabie'], 'a language languages.js does not list');
});

test('an empty string is still a snippet', () => {
	assert.deepEqual(normalizeSnippets(''), { languages: ['python'], code: { python: '' }, initialLanguage: 'python' });
});

test('an object is one snippet per language, in the author\'s order, by canonical name', () => {
	const result = normalizeSnippets({ py: PYTHON, js: JAVASCRIPT, cpp: CPP });
	assert.deepEqual(result.languages, ['python', 'javascript', 'c++']);
	assert.deepEqual(result.code, { python: PYTHON, javascript: JAVASCRIPT, 'c++': CPP });
	assert.equal(result.initialLanguage, 'python', 'the first key');
});

test('an object opens on `language` when it is one of the keys (any name), else on the first key', () => {
	const snippets = { python: PYTHON, javascript: JAVASCRIPT };
	assert.equal(normalizeSnippets(snippets, 'javascript').initialLanguage, 'javascript');
	assert.equal(normalizeSnippets(snippets, 'JS').initialLanguage, 'javascript');
	assert.equal(normalizeSnippets(snippets, 'go').initialLanguage, 'python');
	assert.equal(normalizeSnippets({ js: JAVASCRIPT, py: PYTHON }).initialLanguage, 'javascript');
	assert.equal(normalizeSnippets({ js: JAVASCRIPT, py: PYTHON }, '').initialLanguage, 'javascript', 'no language: the first key, not Python');
});

test('two keys naming one language: the first wins', () => {
	const result = normalizeSnippets({ python: 'first', py: 'second', Python: 'third' });
	assert.deepEqual(result, { languages: ['python'], code: { python: 'first' }, initialLanguage: 'python' });
});

test('values that are not strings', () => {
	const result = normalizeSnippets({ python: null, javascript: undefined, go: 42 });
	assert.deepEqual(result.code, { python: '', javascript: '', go: '42' });
});

test('keys that name no language are skipped', () => {
	assert.deepEqual(normalizeSnippets({ '': 'x', '  ': 'y', ruby: 'puts 1' }).languages, ['ruby']);
	assert.deepEqual(normalizeSnippets({ '': 'x' }, 'go'), { languages: ['go'], code: { go: '' }, initialLanguage: 'go' }, 'nothing usable: one empty snippet');
});

test('undefined, null, an empty object and other values give one empty snippet', () => {
	const empty = { languages: ['python'], code: { python: '' }, initialLanguage: 'python' };
	for (const value of [undefined, null, {}, [], ['print(1)'], 42, true]) {
		assert.deepEqual(normalizeSnippets(value), empty, JSON.stringify(value));
	}
	assert.deepEqual(normalizeSnippets(undefined, 'rust'), { languages: ['rust'], code: { rust: '' }, initialLanguage: 'rust' });
});

test('line endings: every \\r\\n and lone \\r becomes \\n (what Monaco\'s model holds)', () => {
	assert.equal(normalizeSnippets('a\r\nb\r\n').code.python, 'a\nb\n', 'Windows');
	assert.equal(normalizeSnippets('a\rb\r').code.python, 'a\nb\n', 'old Mac');
	assert.equal(normalizeSnippets('a\r\nb\nc\rd').code.python, 'a\nb\nc\nd', 'mixed');
	assert.equal(normalizeSnippets('a\n\rb').code.python, 'a\n\nb', '\\n then \\r: two line breaks, as in Monaco');
	assert.equal(normalizeSnippets('a\r\r\nb').code.python, 'a\n\nb');
	assert.equal(normalizeSnippets(PYTHON).code.python, PYTHON, 'Unix text unchanged');
	const perLanguage = normalizeSnippets({ py: 'x = 1\r\ny = 2\r\n', js: 'let a;\rlet b;\n' });
	assert.deepEqual(perLanguage.code, { python: 'x = 1\ny = 2\n', javascript: 'let a;\nlet b;\n' });
});

test('the input is not changed', () => {
	const snippets = { py: PYTHON, js: JAVASCRIPT };
	const copy = JSON.stringify(snippets);
	normalizeSnippets(snippets, 'js');
	assert.equal(JSON.stringify(snippets), copy);
});
