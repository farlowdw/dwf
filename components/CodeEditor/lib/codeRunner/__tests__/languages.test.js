/**
 * languages.test.js — the language table (../languages.js): the promised entries with their
 * labels, Monaco modes and file names; the name sent to Piston ("main" where its runner adds the
 * extension); Python 2 as a language of its own; every Monaco mode known to the INSTALLED
 * monaco-editor; the aliases; and languageInfo() for any input (case, aliases, unknown names,
 * names of Object.prototype). Run with `npm run test:shared`.
 * To change it: a new language is an entry in ../languages.js and a row of the promised entries here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ALIASES, DEFAULT_LANGUAGE, FALLBACK_FILE_NAME, LANGUAGES, PLAIN_TEXT_MODE, languageInfo } from '../languages.js';
import { resolvePackage } from '../../../__tests__/paths.js';

/** Where the installed Monaco keeps one folder per highlighted language (the editor's tests find packages through paths.js). */
const MONACO_LANGUAGES_DIR = path.join(resolvePackage('monaco-editor'), 'esm', 'vs', 'basic-languages');

/**
 * The entries the editor promises (the contract with the editor's folder):
 * key -> [label, monaco, fileName, submitName (default: fileName)].
 */
const PROMISED = {
	python: ['Python', 'python', 'main.py'],
	javascript: ['JavaScript', 'javascript', 'main.js'],
	typescript: ['TypeScript', 'typescript', 'main.ts', 'main'],
	java: ['Java', 'java', 'Main.java'],
	c: ['C', 'c', 'main.c', 'main'],
	'c++': ['C++', 'cpp', 'main.cpp', 'main'],
	csharp: ['C#', 'csharp', 'Main.cs'],
	go: ['Go', 'go', 'main.go', 'main'],
	rust: ['Rust', 'rust', 'main.rs'],
	ruby: ['Ruby', 'ruby', 'main.rb'],
	bash: ['Bash', 'shell', 'main.sh'],
	kotlin: ['Kotlin', 'kotlin', 'main.kt'],
	swift: ['Swift', 'swift', 'main.swift'],
	php: ['PHP', 'php', 'main.php'],
	sqlite3: ['SQLite', 'sql', 'main.sql'],
	lua: ['Lua', 'lua', 'main.lua'],
	scala: ['Scala', 'scala', 'Main.scala'],
	haskell: ['Haskell', 'plaintext', 'main.hs'],
	rscript: ['R', 'r', 'main.r'],
	perl: ['Perl', 'perl', 'main.pl'],
	dart: ['Dart', 'dart', 'main.dart'],
	elixir: ['Elixir', 'elixir', 'main.exs'],
};

/** The languages whose Piston runner adds the extension itself (checked on a Piston server, 2026-10-24). */
const BARE_NAME_LANGUAGES = ['c', 'c++', 'go', 'typescript'];

/** The language ids the installed Monaco registers (from its *.contribution.js files), or null when it is not installed. */
function installedMonacoIds() {
	if (!fs.existsSync(MONACO_LANGUAGES_DIR)) return null;
	const ids = new Set([PLAIN_TEXT_MODE]);
	for (const folder of fs.readdirSync(MONACO_LANGUAGES_DIR)) {
		const file = path.join(MONACO_LANGUAGES_DIR, folder, `${folder}.contribution.js`);
		if (!fs.existsSync(file)) continue;
		for (const match of fs.readFileSync(file, 'utf8').matchAll(/id:\s*["']([^"']+)["']/g)) ids.add(match[1]);
	}
	return ids;
}

test('LANGUAGES holds every promised entry, exactly', () => {
	for (const [key, [label, monaco, fileName, submitName = fileName]] of Object.entries(PROMISED)) {
		assert.deepEqual(LANGUAGES[key], { label, monaco, fileName, submitName }, key);
	}
});

test('LANGUAGES and ALIASES are frozen, entries too', () => {
	assert.equal(Object.isFrozen(LANGUAGES), true);
	assert.equal(Object.isFrozen(ALIASES), true);
	for (const [key, entry] of Object.entries(LANGUAGES)) assert.equal(Object.isFrozen(entry), true, key);
	assert.throws(() => {
		LANGUAGES.python.label = 'Snake';
	}, TypeError, 'ES modules are strict: writing to a frozen entry throws');
});

test('every entry is complete: a label, a Monaco mode, a file name with an extension', () => {
	for (const [key, entry] of Object.entries(LANGUAGES)) {
		assert.equal(key, key.toLowerCase(), `${key}: keys are lower case (Piston's names)`);
		assert.equal(typeof entry.label, 'string', key);
		assert.notEqual(entry.label, '', key);
		assert.match(entry.monaco, /^[a-z0-9+#-]+$/, key);
		assert.match(entry.fileName, /^[\w-]+\.[\w]+$/, key);
	}
});

test('every Monaco mode is one the installed monaco-editor registers', (t) => {
	const ids = installedMonacoIds();
	if (ids === null) {
		t.skip('monaco-editor is not installed');
		return;
	}
	for (const [key, entry] of Object.entries(LANGUAGES)) {
		assert.equal(ids.has(entry.monaco), true, `${key}: Monaco has no language "${entry.monaco}"`);
	}
});

test('every alias is lower case, points at a LANGUAGES key, and never hides one', () => {
	for (const [alias, target] of Object.entries(ALIASES)) {
		assert.equal(alias, alias.toLowerCase(), alias);
		assert.equal(Object.hasOwn(LANGUAGES, target), true, `${alias} -> ${target}: no such language`);
		assert.equal(Object.hasOwn(LANGUAGES, alias), false, `${alias} is a LANGUAGES key itself`);
	}
});

test('submitName: "main" exactly where the runner adds the extension; every other language sends its file name', () => {
	for (const [key, entry] of Object.entries(LANGUAGES)) {
		const expected = BARE_NAME_LANGUAGES.includes(key) ? 'main' : entry.fileName;
		assert.equal(entry.submitName, expected, key);
	}
	// not installed on the server, so unverified: they keep their full names until checked
	assert.equal(LANGUAGES.java.submitName, 'Main.java');
	assert.equal(LANGUAGES.csharp.submitName, 'Main.cs');
	assert.equal(LANGUAGES.kotlin.submitName, 'main.kt');
	// the name readers see keeps its extension
	assert.equal(LANGUAGES.c.fileName, 'main.c');
	assert.equal(LANGUAGES.typescript.fileName, 'main.ts');
});

test('Python 2 is a language of its own (Piston\'s python2), never an alias of Python 3', () => {
	assert.deepEqual(LANGUAGES.python2, { label: 'Python 2', monaco: 'python', fileName: 'main.py', submitName: 'main.py' });
	assert.equal(ALIASES.py2, 'python2');
	assert.equal(Object.hasOwn(ALIASES, 'python2'), false, 'python2 is a key, not an alias');
	assert.equal(languageInfo('python2').id, 'python2');
	assert.equal(languageInfo('PY2').id, 'python2');
	assert.equal(languageInfo('Python2').label, 'Python 2');
	assert.notEqual(languageInfo('py2').id, 'python');
});

test('the promised aliases', () => {
	const expected = {
		py: 'python', py3: 'python', python3: 'python', py2: 'python2',
		js: 'javascript', node: 'javascript', 'node-js': 'javascript',
		ts: 'typescript',
		cpp: 'c++', cxx: 'c++', 'g++': 'c++',
		cs: 'csharp', 'c#': 'csharp',
		sh: 'bash', golang: 'go', rs: 'rust', rb: 'ruby', kt: 'kotlin',
		r: 'rscript', sql: 'sqlite3', hs: 'haskell', pl: 'perl', exs: 'elixir',
	};
	for (const [alias, target] of Object.entries(expected)) assert.equal(ALIASES[alias], target, alias);
});

test('languageInfo: a canonical name gives its entry with its id', () => {
	assert.deepEqual(languageInfo('python'), { id: 'python', label: 'Python', monaco: 'python', fileName: 'main.py', submitName: 'main.py' });
	assert.deepEqual(languageInfo('c++'), { id: 'c++', label: 'C++', monaco: 'cpp', fileName: 'main.cpp', submitName: 'main' });
	assert.deepEqual(languageInfo('rscript'), { id: 'rscript', label: 'R', monaco: 'r', fileName: 'main.r', submitName: 'main.r' });
	assert.equal(languageInfo(DEFAULT_LANGUAGE).id, 'python');
});

test('languageInfo: any case and surrounding spaces', () => {
	assert.equal(languageInfo('Python').id, 'python');
	assert.equal(languageInfo('  PYTHON ').id, 'python');
	assert.equal(languageInfo('JavaScript').id, 'javascript');
	assert.equal(languageInfo('C++').id, 'c++');
	assert.equal(languageInfo('SQLite3').id, 'sqlite3');
});

test('languageInfo: aliases resolve to the canonical entry', () => {
	assert.deepEqual(languageInfo('py'), languageInfo('python'));
	assert.deepEqual(languageInfo('PY3'), languageInfo('python'));
	assert.deepEqual(languageInfo('python3'), languageInfo('python'));
	assert.equal(languageInfo('js').id, 'javascript');
	assert.equal(languageInfo('node').id, 'javascript');
	assert.equal(languageInfo('ts').id, 'typescript');
	assert.equal(languageInfo('cpp').id, 'c++');
	assert.equal(languageInfo('G++').id, 'c++');
	assert.equal(languageInfo('C#').id, 'csharp');
	assert.equal(languageInfo('shell').id, 'bash', "Monaco's name for Bash");
	assert.equal(languageInfo('sh').label, 'Bash');
	assert.equal(languageInfo('golang').fileName, 'main.go');
	// Piston's Go runner adds .go itself: "main.go" would compile as main.go.go
	assert.equal(languageInfo('golang').submitName, 'main');
	assert.equal(languageInfo('R').id, 'rscript');
	assert.equal(languageInfo('sql').label, 'SQLite');
});

test('languageInfo: an unknown language falls back to plain text', () => {
	assert.deepEqual(languageInfo('Brainfuck'), { id: 'brainfuck', label: 'Brainfuck', monaco: PLAIN_TEXT_MODE, fileName: FALLBACK_FILE_NAME, submitName: FALLBACK_FILE_NAME });
	assert.deepEqual(languageInfo('  Osabie '), { id: 'osabie', label: 'Osabie', monaco: 'plaintext', fileName: 'main.txt', submitName: 'main.txt' });
});

test('languageInfo: names of Object.prototype are not languages', () => {
	for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
		const info = languageInfo(name);
		assert.equal(info.monaco, 'plaintext', name);
		assert.equal(info.fileName, 'main.txt', name);
		assert.equal(info.id, name.toLowerCase(), name);
	}
});

test('languageInfo: empty and non-string input never throws', () => {
	assert.deepEqual(languageInfo(undefined), { id: '', label: '', monaco: 'plaintext', fileName: 'main.txt', submitName: 'main.txt' });
	assert.deepEqual(languageInfo(null), { id: '', label: '', monaco: 'plaintext', fileName: 'main.txt', submitName: 'main.txt' });
	assert.equal(languageInfo('').id, '');
	assert.equal(languageInfo(42).id, '42');
});

test('languageInfo returns a fresh object every time', () => {
	const first = languageInfo('python');
	first.label = 'changed';
	assert.equal(languageInfo('python').label, 'Python');
	assert.equal(LANGUAGES.python.label, 'Python');
});
