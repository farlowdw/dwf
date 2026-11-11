/**
 * languages.js — what the code editor knows about each programming language: the name to show,
 * the Monaco highlighting mode, and the file name the code runner (Piston) is given. Pure data
 * and one lookup function; no React, no DOM.
 *
 * WHY
 *   Piston names a language one way ("c++", "rscript", "sqlite3"), Monaco another ("cpp", "r",
 *   "sql"), and a reader expects a third ("C++", "R", "SQLite"). An author may also write a
 *   familiar alias ("py", "js", "cpp"). languageInfo() turns any of these into one record, so
 *   the rest of the editor never compares language names by hand.
 *
 *   This list is NOT the list of languages the editor can run: that comes from the Piston
 *   server (/api/v2/runtimes, runtimes.js). A language missing here still runs; it only falls
 *   back to plain-text highlighting, its Piston name as its label, and the file name main.txt.
 *
 * HOW TO CHANGE IT
 *   Add a language: one entry in LANGUAGES, keyed by its Piston language name exactly as
 *   /api/v2/runtimes reports it (`language`), with
 *     label     the name readers see in the editor ("Python", "C++");
 *     monaco    a Monaco language id ('plaintext' when Monaco has none — the ids it has are the
 *               folders of node_modules/monaco-editor/esm/vs/basic-languages, plus 'c' beside
 *               'cpp'; __tests__/languages.test.js checks every entry against the installed
 *               Monaco);
 *     fileName  the file name readers see, and the file Piston writes the code into (Java, C#
 *               and Scala want Main.*);
 *     submitName (optional) the name sent to Piston when its runner adds the extension itself.
 *               Default: fileName.
 *   Add an alias: one line in ALIASES (lower case, pointing at a LANGUAGES key). The tests fail
 *   when an alias points nowhere or hides a LANGUAGES key.
 *
 * WHICH RUNNERS ADD THE EXTENSION (checked on a Piston server, 2026-10-23/24)
 *   go, c, c++, typescript   the runner adds .go / .c / .cpp / .ts to the name it is given, so
 *                            "main.c" compiled as main.c.c and every error read main.c.c:1:18.
 *                            These send SUBMIT_NAME_BARE ("main"): errors read main.c:1:18.
 *   bash, javascript, python the runner uses the name as given: they send fileName.
 *   java, csharp, kotlin     NOT installed on the server, so unverified: they still send
 *                            Main.java / Main.cs / main.kt. Piston's scripts suggest their runners
 *                            add the extension too; install one, run a compile error, and look at
 *                            the file name it prints before changing them.
 *   Every other language sends fileName (unchecked). A TypeScript runtime on deno (not installed)
 *   would need main.ts: deno runs the name as given, so the name would then depend on the engine.
 *
 * PYTHON 2 is a language of its own in Piston ('python2', aliases py2 / python2), not a version
 * of 'python': LANGUAGES.python2, with ALIASES.py2, keeps language="py2" from running Python 3.
 */

/** Monaco's language id for "no highlighting". */
export const PLAIN_TEXT_MODE = 'plaintext';

/** The file name for code in a language this file does not list. */
export const FALLBACK_FILE_NAME = 'main.txt';

/** The language a snippet is in when nothing says otherwise. */
export const DEFAULT_LANGUAGE = 'python';

/** The name sent to a runner that adds the extension itself (see the header). */
const SUBMIT_NAME_BARE = 'main';

/** One entry of LANGUAGES, frozen; `submitName` defaults to `fileName` (see the header). */
function language(label, monaco, fileName, submitName = fileName) {
	return Object.freeze({ label, monaco, fileName, submitName });
}

/**
 * Every language the editor knows by name, keyed by the canonical Piston language name.
 * The first block is the set the editor promises; the second, other languages Piston offers.
 */
export const LANGUAGES = Object.freeze({
	python: language('Python', 'python', 'main.py'),
	javascript: language('JavaScript', 'javascript', 'main.js'),
	typescript: language('TypeScript', 'typescript', 'main.ts', SUBMIT_NAME_BARE),
	java: language('Java', 'java', 'Main.java'),
	c: language('C', 'c', 'main.c', SUBMIT_NAME_BARE),
	'c++': language('C++', 'cpp', 'main.cpp', SUBMIT_NAME_BARE),
	csharp: language('C#', 'csharp', 'Main.cs'),
	go: language('Go', 'go', 'main.go', SUBMIT_NAME_BARE),
	rust: language('Rust', 'rust', 'main.rs'),
	ruby: language('Ruby', 'ruby', 'main.rb'),
	bash: language('Bash', 'shell', 'main.sh'),
	kotlin: language('Kotlin', 'kotlin', 'main.kt'),
	swift: language('Swift', 'swift', 'main.swift'),
	php: language('PHP', 'php', 'main.php'),
	sqlite3: language('SQLite', 'sql', 'main.sql'),
	lua: language('Lua', 'lua', 'main.lua'),
	scala: language('Scala', 'scala', 'Main.scala'),
	haskell: language('Haskell', PLAIN_TEXT_MODE, 'main.hs'),
	rscript: language('R', 'r', 'main.r'),
	perl: language('Perl', 'perl', 'main.pl'),
	dart: language('Dart', 'dart', 'main.dart'),
	elixir: language('Elixir', 'elixir', 'main.exs'),

	clojure: language('Clojure', 'clojure', 'main.clj'),
	coffeescript: language('CoffeeScript', 'coffeescript', 'main.coffee'),
	crystal: language('Crystal', PLAIN_TEXT_MODE, 'main.cr'),
	d: language('D', PLAIN_TEXT_MODE, 'main.d'),
	erlang: language('Erlang', PLAIN_TEXT_MODE, 'main.erl'),
	fortran: language('Fortran', PLAIN_TEXT_MODE, 'main.f90'),
	groovy: language('Groovy', PLAIN_TEXT_MODE, 'main.groovy'),
	julia: language('Julia', 'julia', 'main.jl'),
	nim: language('Nim', PLAIN_TEXT_MODE, 'main.nim'),
	ocaml: language('OCaml', PLAIN_TEXT_MODE, 'main.ml'),
	pascal: language('Pascal', 'pascal', 'main.pas'),
	powershell: language('PowerShell', 'powershell', 'main.ps1'),
	prolog: language('Prolog', PLAIN_TEXT_MODE, 'main.pl'),
	python2: language('Python 2', 'python', 'main.py'),
	racket: language('Racket', 'scheme', 'main.rkt'),
	zig: language('Zig', PLAIN_TEXT_MODE, 'main.zig'),
});

/**
 * Other names an author (or Piston) may use, lower case -> the LANGUAGES key. A LANGUAGES key
 * never appears here: it is found directly.
 */
export const ALIASES = Object.freeze({
	py: 'python',
	py3: 'python',
	python3: 'python',
	py2: 'python2',

	js: 'javascript',
	node: 'javascript',
	nodejs: 'javascript',
	'node-js': 'javascript',
	'node-javascript': 'javascript',

	ts: 'typescript',
	tsc: 'typescript',
	'node-ts': 'typescript',

	gcc: 'c',

	cpp: 'c++',
	cxx: 'c++',
	'g++': 'c++',

	cs: 'csharp',
	'c#': 'csharp',
	mono: 'csharp',
	'mono-csharp': 'csharp',

	golang: 'go',
	rs: 'rust',
	rb: 'ruby',

	sh: 'bash',
	shell: 'bash',

	kt: 'kotlin',

	sql: 'sqlite3',
	sqlite: 'sqlite3',

	hs: 'haskell',
	r: 'rscript',
	pl: 'perl',
	exs: 'elixir',
	sc: 'scala',

	clj: 'clojure',
	coffee: 'coffeescript',
	erl: 'erlang',
	f90: 'fortran',
	jl: 'julia',
	ml: 'ocaml',
	ps1: 'powershell',
	pwsh: 'powershell',
	rkt: 'racket',
});

/** The lookup key for any value: trimmed, lower case ('' for null / undefined). */
function lookupKey(value) {
	return String(value ?? '').trim().toLowerCase();
}

/** The LANGUAGES key for a lookup key, or null (own properties only: 'constructor' is no language). */
function canonicalKey(key) {
	if (Object.hasOwn(LANGUAGES, key)) return key;
	if (Object.hasOwn(ALIASES, key)) return ALIASES[key];
	return null;
}

/**
 * Everything the editor needs about `language` (any case, a canonical name or an alias):
 *   { id, label, monaco, fileName, submitName }   id = the canonical Piston name.
 * A language this file does not list: { id: <trimmed, lower case>, label: <trimmed input>,
 * monaco: 'plaintext', fileName: 'main.txt', submitName: 'main.txt' }.
 */
export function languageInfo(language) {
	const key = lookupKey(language);
	const id = canonicalKey(key);
	if (id !== null) return { id, ...LANGUAGES[id] };
	return {
		id: key,
		label: String(language ?? '').trim(),
		monaco: PLAIN_TEXT_MODE,
		fileName: FALLBACK_FILE_NAME,
		submitName: FALLBACK_FILE_NAME,
	};
}
