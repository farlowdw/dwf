/**
 * snippets.js — reading the editor's `initialCode` prop: one snippet (a string), or one snippet
 * per language ({ python: '…', javascript: '…' }), into one shape the editor can use. Pure; no
 * React, no DOM.
 *
 * THE SHAPE
 *   { languages: ['python', 'javascript'], code: { python: '…', javascript: '…' },
 *     initialLanguage: 'python' }
 *   Every language is its canonical name (languages.js > languageInfo: 'py' -> 'python',
 *   'cpp' -> 'c++'), in the author's order.
 *
 * THE RULES
 *   a string           one snippet, in `language` (default python)
 *   an object          one snippet per key; the editor opens on `language` when it is one of the
 *                      keys (any name for it), else on the first key. Two keys naming the same
 *                      language ('py' and 'python'): the first wins. A value that is not a string
 *                      becomes '' (null / undefined) or its text.
 *   anything else      (undefined, null, an empty object, an array, a number) one empty
 *                      snippet in `language` (default python)
 *   line endings       every "\r\n" and lone "\r" in a snippet becomes "\n". Monaco does the
 *                      same to the text of its model, so without this a snippet file with
 *                      Windows or mixed line endings never equals the editor's text: Reset
 *                      would always count as an edit and the page would stay "unsaved".
 *
 * HOW TO CHANGE IT
 *   The default language: languages.js > DEFAULT_LANGUAGE. The rules: the functions below.
 */

import { DEFAULT_LANGUAGE, languageInfo } from './languages.js';

/** A Windows ("\r\n") or old Mac ("\r") line break. */
const NON_UNIX_LINE_BREAK = /\r\n?/g;

/** The Unix line break every snippet uses. */
const UNIX_LINE_BREAK = '\n';

/** `text` with every line break as "\n" (what Monaco's model holds). */
function unixLineEndings(text) {
	return text.replace(NON_UNIX_LINE_BREAK, UNIX_LINE_BREAK);
}

/** The canonical name of `language`, or of the default language when it is empty. */
function canonical(language) {
	const text = String(language ?? '').trim();
	return languageInfo(text === '' ? DEFAULT_LANGUAGE : text).id;
}

/** A snippet's text with Unix line endings ('' for null / undefined). */
function snippetText(value) {
	if (value === undefined || value === null) return '';
	return unixLineEndings(String(value));
}

/** Is this a plain object of snippets (not null, not an array)? */
function isSnippetObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** One snippet in one language. */
function singleSnippet(text, language) {
	const id = canonical(language);
	return { languages: [id], code: { [id]: text }, initialLanguage: id };
}

/** One snippet per key of `snippets` (a non-empty object). */
function snippetsPerLanguage(snippets, language) {
	const languages = [];
	const code = {};
	for (const [key, value] of Object.entries(snippets)) {
		const id = languageInfo(key).id;
		if (id === '' || languages.includes(id)) continue;
		languages.push(id);
		code[id] = snippetText(value);
	}
	if (languages.length === 0) return singleSnippet('', language);
	return { languages, code, initialLanguage: openingLanguage(languages, language) };
}

/** The language an editor with several snippets opens on: `language` when it is one of them, else the first. */
function openingLanguage(languages, language) {
	const text = String(language ?? '').trim();
	if (text === '') return languages[0];
	const wanted = languageInfo(text).id;
	return languages.includes(wanted) ? wanted : languages[0];
}

/** The editor's snippets from `initialCode` and the `language` prop (the shape and rules above). */
export function normalizeSnippets(initialCode, language) {
	if (typeof initialCode === 'string') return singleSnippet(snippetText(initialCode), language);
	if (isSnippetObject(initialCode) && Object.keys(initialCode).length > 0) {
		return snippetsPerLanguage(initialCode, language);
	}
	return singleSnippet('', language);
}
