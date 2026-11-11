/**
 * runtimes.js — choosing what to run code with, from the runtimes the code runner reports
 * (Piston's /api/v2/runtimes, through shared/functions/code-runner/runtimes.mjs and client.js > fetchRuntimes).
 * Pure functions; no React, no DOM.
 *
 * A RUNTIME is one installed language + version, as Piston lists it:
 *   { language: 'python', version: '3.12.0', aliases: ['py', 'py3', …], runtime: null }
 *   (`runtime` names the engine when a language has several: 'node' / 'deno' for JavaScript,
 *   'gcc' for C and C++.)
 *
 * THE RULES
 *   Which runtimes are "Python"?  Those whose `language`, one of whose `aliases`, or whose
 *     canonical name (languages.js > languageInfo) is the requested language or its canonical
 *     name, compared in lower case — so 'py', 'Python' and 'python3' all find Piston's python.
 *     Python 2 is Piston's separate language 'python2' ('py2'): it never answers to 'python',
 *     and 'python2' never finds a Python 3.
 *   Order                         newest version first (versions.js > compareVersions).
 *   Which one runs?               the newest whose version matches the selector
 *     (versions.js > resolveVersion). A selector nothing matches, while the language is
 *     installed, falls back to the newest version ('version-missing': the editor says so and
 *     runs it). A language with no runtime at all: 'language-missing' (the editor cannot run it).
 *
 * HOW TO CHANGE IT
 *   What counts as the same language: runtimeMatches(). The fallback when a version is missing:
 *   pickRuntime(). How a runtime is named in a menu: runtimeLabel().
 */

import { languageInfo } from './languages.js';
import { compareVersions, resolveVersion } from './versions.js';

/** pickRuntime() reasons. */
export const PICK_OK = 'ok';
export const PICK_VERSION_MISSING = 'version-missing';
export const PICK_LANGUAGE_MISSING = 'language-missing';

/** A value in lower case for comparing names ('' for anything that is not a string). */
function lower(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** The names a runtime answers to, in lower case: its language, its aliases, its canonical name. */
function namesOf(runtime) {
	const aliases = Array.isArray(runtime.aliases) ? runtime.aliases : [];
	const names = new Set(aliases.map(lower));
	names.add(lower(runtime.language));
	names.add(languageInfo(runtime.language).id);
	names.delete('');
	return names;
}

/** Does `runtime` run `language` (any case, alias or canonical name)? */
function runtimeMatches(runtime, language) {
	if (!runtime || typeof runtime !== 'object') return false;
	if (typeof runtime.language !== 'string' || typeof runtime.version !== 'string') return false;
	const wanted = [lower(language), languageInfo(language).id].filter((name) => name !== '');
	const names = namesOf(runtime);
	return wanted.some((name) => names.has(name));
}

/** The runtimes (of Piston's list) that run `language`, newest version first. The input is not changed. */
export function runtimesFor(runtimes, language) {
	if (!Array.isArray(runtimes)) return [];
	const matching = runtimes.filter((runtime) => runtimeMatches(runtime, language));
	return matching.sort((a, b) => compareVersions(b.version, a.version));
}

/** The distinct versions of these runtimes, in their order. */
function distinctVersions(runtimes) {
	const versions = [];
	for (const runtime of runtimes) {
		if (!versions.includes(runtime.version)) versions.push(runtime.version);
	}
	return versions;
}

/**
 * What to run `language` with, given the version `selector` the author asked for:
 *   { runtime, versions, reason }
 *     runtime   the chosen entry of `runtimes` (null when the language is missing)
 *     versions  every installed version of the language, newest first (for a version menu)
 *     reason    'ok' | 'version-missing' (runtime = the newest) | 'language-missing'
 */
export function pickRuntime(runtimes, language, selector) {
	const candidates = runtimesFor(runtimes, language);
	const versions = distinctVersions(candidates);
	if (candidates.length === 0) return { runtime: null, versions, reason: PICK_LANGUAGE_MISSING };
	const resolved = resolveVersion(versions, selector);
	if (resolved.version === null) return { runtime: candidates[0], versions, reason: PICK_VERSION_MISSING };
	const runtime = candidates.find((candidate) => candidate.version === resolved.version);
	return { runtime, versions, reason: PICK_OK };
}

/**
 * How a runtime is named in a menu: "Python 3.12.0"; with its engine when Piston names one,
 * "JavaScript 20.11.1 (node)". '' for anything that is not a runtime.
 */
export function runtimeLabel(runtime) {
	if (!runtime || typeof runtime.language !== 'string') return '';
	const name = `${languageInfo(runtime.language).label} ${runtime.version ?? ''}`.trim();
	if (typeof runtime.runtime === 'string' && runtime.runtime !== '') return `${name} (${runtime.runtime})`;
	return name;
}
