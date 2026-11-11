/**
 * exerciseProps.test.js — the light half of the exercise library (../exerciseProps.js): its list
 * of the languages that can check names exactly the languages exercise.js has a layout for (so
 * the Check button never appears for a language whose check could not be built, and never
 * hides for one that could), and it imports nothing heavy (the reason it is a file of its own:
 * the editor's server-rendered placeholder reads it). Its two functions' own rules are tested in
 * exercise.test.js. Run with `npm run test:shared`.
 * To change it: a language that can check goes in ../exerciseProps.js and in exercise.js's layouts
 * together, and this test keeps the two equal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../languages.js';
import { buildCheckFiles } from '../exercise.js';
import { CHECK_LANGUAGES, supportsChecks } from '../exerciseProps.js';

test('CHECK_LANGUAGES names exactly the languages exercise.js can build a check for', () => {
	for (const language of Object.keys(LANGUAGES)) {
		const built = buildCheckFiles({ language, readerCode: '', harness: '' });
		assert.equal(supportsChecks(language), built !== null, language);
	}
	for (const language of CHECK_LANGUAGES) assert.notEqual(buildCheckFiles({ language, readerCode: '', harness: '' }), null, language);
});

test('it imports only languages.js (never the check helpers, which stay out of a page\'s first download)', () => {
	const source = readFileSync(new URL('../exerciseProps.js', import.meta.url), 'utf8');
	const imports = [...source.matchAll(/^import [^;]+ from '([^']+)';$/gm)].map((match) => match[1]);
	assert.deepEqual(imports, ['./languages.js']);
});
