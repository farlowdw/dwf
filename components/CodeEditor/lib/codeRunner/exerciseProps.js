/**
 * exerciseProps.js — the two questions about an exercise's props that the editor asks BEFORE
 * anything runs: can this language run checks (supportsChecks: the Check button), and what are
 * the `tests` / `solution` for this language (exerciseTextFor). Pure; no React, no DOM.
 *
 * WHY A FILE OF ITS OWN  The editor's server-rendered placeholder (shared/components/CodeEditor/
 * index.jsx, part of a page's first download) needs both answers, to draw a space for the Check
 * button. exercise.js, which builds a check's files, imports the check helpers' source text
 * (checkHelpers.js, about 25 KB): importing it from the placeholder would put that text into
 * every page with an editor. So these two live here, and exercise.js stays in the editor's lazy
 * chunk. (Moved out of exercise.js on 2026-10-25, unchanged.)
 *
 * PER-LANGUAGE PROPS (exerciseTextFor)
 *   `tests` and `solution` are a string, or one per language like `initialCode`. A string belongs
 *   to the language the editor's string snippet is in (or opens on; snippets.js >
 *   normalizeSnippets(…).initialLanguage): exerciseTextFor(value, language, stringLanguage) gives
 *   it for that language only; an object gives its entry for `language` under any name
 *   languages.js knows ('py', 'Python'); '' when there is none.
 *
 * HOW TO CHANGE IT
 *   A language that can check: its name in CHECK_LANGUAGES, AND its layout in exercise.js >
 *   LAYOUTS and its helper in checkHelpers.js (__tests__/exerciseProps.test.js fails while the
 *   list and the layouts differ).
 */

import { DEFAULT_LANGUAGE, languageInfo } from './languages.js';

/** The languages with a check helper and a check layout (canonical names; exercise.js > LAYOUTS). */
export const CHECK_LANGUAGES = Object.freeze(['python', 'javascript', 'typescript', 'bash', 'c', 'c++', 'go']);

/** Can `language` (any name languages.js knows: 'py', 'cpp', 'golang' …) run checks? */
export function supportsChecks(language) {
	return CHECK_LANGUAGES.includes(languageInfo(language).id);
}

/** The value of the key of `object` that names the same language as `language`, or undefined. */
function entryForLanguage(object, language) {
	const wanted = languageInfo(language).id;
	const key = Object.keys(object).find((name) => languageInfo(name).id === wanted);
	return key === undefined ? undefined : object[key];
}

/** The canonical name of `language`, or of the default language when it is empty (as snippets.js reads it). */
function canonicalOrDefault(language) {
	const text = String(language ?? '').trim();
	return languageInfo(text === '' ? DEFAULT_LANGUAGE : text).id;
}

/**
 * The text of a per-language prop (`tests`, `solution`) for `language` (PER-LANGUAGE PROPS in
 * the header): a string for `stringLanguage` only (empty: the default language, python, as for
 * a string snippet); an object's entry for `language`; else ''.
 */
export function exerciseTextFor(value, language, stringLanguage) {
	if (typeof value === 'string') {
		return canonicalOrDefault(language) === canonicalOrDefault(stringLanguage) ? value : '';
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return '';
	const entry = entryForLanguage(value, language);
	return typeof entry === 'string' ? entry : '';
}
