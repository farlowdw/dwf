/**
 * runtimeChoice.js — which language version the editor runs, and what its header shows about
 * it. Pure: no React, no DOM, so `node --test` checks it (__tests__/runtimeChoice.test.js).
 *
 * The editor never hard-codes a version: it asks the code runner which runtimes are installed
 * (lib/codeRunner/client.js > fetchRuntimes, once per page load) and chooses from that list
 * (lib/codeRunner/runtimes.js > pickRuntime):
 *
 *   the runtimes are known, the language is installed
 *       a version menu of every installed version, newest first ("Python 3.12.0"); the page's
 *       `version` selector picks the first entry ('3.12', '3.x', '*'; none = the newest). A
 *       selector nothing matches falls back to the newest, with an info notice ("Python 3.10
 *       isn't installed; using 3.12.0."), until the reader picks a version from the menu.
 *   the runtimes are known, the language is not installed
 *       a warning notice ("Ruby isn't installed on the code runner.") and Run is disabled.
 *   the runtimes are not known (still loading, or the request failed — e.g. `npm start`, which
 *   has no Netlify Functions)
 *       editing works; the header shows the version asked for as text ("Python 3.10", or just
 *       "Python"), and Run sends the selector as it is ('*' when there is none) — the run then
 *       reports the real problem (lib/codeRunner/errors.js).
 *
 * TYPESCRIPT (2026-10-25)  is compiled IN THE BROWSER (typescript.js: Monaco's own TypeScript)
 *   and the JavaScript it emits runs on the code runner's NEWEST Node (`javascript`), as main.js:
 *   its output is ES2022, which Node 16 cannot all run (.at(), Object.hasOwn). So a TypeScript
 *   editor has no version menu: its header reads "TypeScript 5.9.3 · Node 20.11.1" (Monaco's
 *   TypeScript version, handed in as `typescriptVersion` once Monaco has loaded, and the newest
 *   installed Node), Run sends runLanguage 'javascript', and a page's `version` for TypeScript
 *   selects nothing. Piston's own TypeScript runtime is no longer used. No JavaScript runtime
 *   installed: the same warning and disabled Run as a missing language. Its choice carries two
 *   more fields: textOnly (true: the header shows text, never a menu) and shortText (the text
 *   without the word "TypeScript", beside a language picker that already names it).
 *
 * chooseRuntime() returns
 *   { options: [{ version, language, label, shortLabel }], version, runLanguage, text, notice, canRun }
 *     options      the version menu (empty when the runtimes are unknown or the language missing)
 *     version      the version (or selector) Run sends
 *     runLanguage  the language name Run sends (Piston's own name for the chosen runtime)
 *     text         the header's plain text when there is no menu ("Python 3.12.0")
 *     notice       { severity: 'info' | 'warning', message } or null
 *     canRun       false only when the language is not installed
 *
 * HOW TO CHANGE IT
 *   The notices' words: messages.js. How a menu entry is named: versionOptions() (the full
 *   label is the library's runtimeLabel; shortLabel drops the language, for an editor whose
 *   language picker already names it). The choosing rules: the library's runtimes.js. Which
 *   language is compiled in the browser and what it runs on: BROWSER_COMPILED; its header text:
 *   messages.js > typescriptRuntimeText.
 */

import {
	ANY_VERSION,
	PICK_LANGUAGE_MISSING,
	PICK_VERSION_MISSING,
	languageInfo,
	pickRuntime,
	runtimeLabel,
	runtimesFor,
} from './lib/codeRunner/index.js';
import { languageMissingNotice, typescriptRuntimeText, versionMissingNotice } from './messages.js';

/** useRuntimes() states. */
export const RUNTIMES_LOADING = 'loading';
export const RUNTIMES_READY = 'ready';
export const RUNTIMES_FAILED = 'failed';

/**
 * The languages compiled in the reader's browser, and the Piston language their output runs on
 * (see TYPESCRIPT in the header).
 */
export const BROWSER_COMPILED = Object.freeze({ typescript: 'javascript' });

/** Is `language` (any name the library knows) compiled in the browser before it runs? */
export function compilesInBrowser(language) {
	return Object.hasOwn(BROWSER_COMPILED, languageInfo(language).id);
}

/** Notice severities (MUI Alert's). */
const INFO = 'info';
const WARNING = 'warning';

/** "3.12.0", or "20.11.1 (node)" when Piston names the engine. */
function shortLabel(runtime) {
	return runtime.runtime ? `${runtime.version} (${runtime.runtime})` : runtime.version;
}

/** The version menu for one language's runtimes (runtimesFor order: newest first), one entry per version. */
export function versionOptions(runtimes) {
	const options = [];
	for (const runtime of runtimes) {
		if (options.some((option) => option.version === runtime.version)) continue;
		options.push({
			version: runtime.version,
			language: runtime.language,
			label: runtimeLabel(runtime),
			shortLabel: shortLabel(runtime),
		});
	}
	return options;
}

/** The choice while the installed runtimes are not known: send the selector as it is. */
function unknownRuntimes(info, selector) {
	return {
		options: [],
		version: selector ?? ANY_VERSION,
		runLanguage: info.id,
		text: selector ? `${info.label} ${selector}` : info.label,
		notice: null,
		canRun: true,
	};
}

/** The choice when the language has no runtime on the code runner: nothing can run. */
function missingLanguage(info, selector) {
	return {
		options: [],
		version: selector ?? ANY_VERSION,
		runLanguage: info.id,
		text: info.label,
		notice: { severity: WARNING, message: languageMissingNotice(info.label) },
		canRun: false,
	};
}

/** The choice for a language compiled in the browser (see TYPESCRIPT in the header): the newest runtime of what it runs on. */
function browserCompiled({ status, runtimes, info, typescriptVersion }) {
	const runsOn = languageInfo(BROWSER_COMPILED[info.id]);
	const ready = status === RUNTIMES_READY;
	const newest = ready ? pickRuntime(runtimes, runsOn.id, undefined) : null;
	if (ready && newest.reason === PICK_LANGUAGE_MISSING) {
		return { ...missingLanguage(runsOn, undefined), text: info.label, textOnly: true, shortText: '' };
	}
	const version = ready ? newest.runtime.version : ANY_VERSION;
	const runVersion = ready ? version : undefined;
	return {
		options: [],
		version,
		runLanguage: ready ? newest.runtime.language : runsOn.id,
		text: typescriptRuntimeText({ label: info.label, typescriptVersion, nodeVersion: runVersion }),
		notice: null,
		canRun: true,
		textOnly: true,
		shortText: typescriptRuntimeText({ typescriptVersion, nodeVersion: runVersion }),
	};
}

/**
 * What to run `language` with (see the header):
 *   status             useRuntimes()'s state: RUNTIMES_LOADING | RUNTIMES_READY | RUNTIMES_FAILED
 *   runtimes           the installed runtimes (Piston's list)
 *   selector           the page's version selector for this language (undefined = the newest)
 *   choice             the version the reader picked from the menu (undefined = none yet)
 *   typescriptVersion  Monaco's TypeScript version ('5.9.3'), for a TypeScript editor's header
 *                      (undefined until Monaco has loaded)
 */
export function chooseRuntime({ status, runtimes, language, selector, choice, typescriptVersion }) {
	const info = languageInfo(language);
	if (compilesInBrowser(info.id)) return browserCompiled({ status, runtimes, info, typescriptVersion });
	if (status !== RUNTIMES_READY) return unknownRuntimes(info, selector);
	const pick = pickRuntime(runtimes, language, selector);
	if (pick.reason === PICK_LANGUAGE_MISSING) return missingLanguage(info, selector);
	const options = versionOptions(runtimesFor(runtimes, language));
	const picked = options.find((option) => option.version === choice);
	const chosen = picked ?? options.find((option) => option.version === pick.runtime.version) ?? options[0];
	const fellBack = pick.reason === PICK_VERSION_MISSING && picked === undefined;
	return {
		options,
		version: chosen.version,
		runLanguage: chosen.language,
		text: chosen.label,
		notice: fellBack ? { severity: INFO, message: versionMissingNotice(info.label, selector, chosen.version) } : null,
		canRun: true,
	};
}
