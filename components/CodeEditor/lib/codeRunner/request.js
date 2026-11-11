/**
 * request.js — building the body of a run request: the JSON Piston's /api/v2/execute expects
 * (sent through shared/functions/code-runner/execute.mjs, which checks and limits every field again), and
 * reading the old editor's `outputSettings` prop. Pure functions; no React, no DOM.
 *
 * THE PAYLOAD (Piston's names, snake_case)
 *   { language, version, files: [{ name, content }], stdin, args,
 *     compile_timeout, run_timeout, compile_memory_limit, run_memory_limit }
 *   timeouts in ms; memory limits in bytes, -1 = the server's own limit.
 *
 * LIMITS
 *   The editor speaks camelCase ({ runTimeout, compileTimeout, runMemoryLimit,
 *   compileMemoryLimit }); a limit that is not a finite number (missing, undefined, '5 s') keeps
 *   its DEFAULT_LIMITS value. effectiveLimits() then rounds both timeouts to whole ms and clamps
 *   them into TIMEOUT_BOUNDS (1 ms .. 10 s to compile, 1 ms .. 3 s to run: the Piston
 *   server refuses more with a 400). It is the ONE place the limits of a run are worked out: the
 *   payload (buildExecuteRequest) and the editor's status line ("Time limit exceeded (3 s)") both
 *   use it, so they cannot disagree. Memory limits pass through unchanged.
 *   shared/functions/code-runner/execute.mjs clamps the timeouts again with its own MAX_*_TIMEOUT_MS (a
 *   function imports nothing of the editor's folder); its tests check that its maxima equal these.
 *
 * VERSION
 *   A version selector that versions.js > isAnyVersion() accepts ('', '*', 'latest', any case) is
 *   sent as ANY_VERSION: Piston understands '*' but not 'latest'.
 *
 * HOW TO CHANGE IT
 *   The defaults: DEFAULT_LIMITS. The server's timeout limits: TIMEOUT_BOUNDS here AND
 *   MAX_COMPILE_TIMEOUT_MS / MAX_RUN_TIMEOUT_MS in shared/functions/code-runner/execute.mjs (a test fails
 *   while they differ). A new Piston field: buildExecuteRequest() here AND the function's
 *   whitelist (validateExecuteRequest in shared/functions/code-runner/execute.mjs), which drops every field
 *   it does not know. A new legacy key: LEGACY_LIMIT_KEYS / fromLegacyOutputSettings().
 */

import { languageInfo } from './languages.js';
import { isAnyVersion } from './versions.js';

/** The limits a run gets unless the page sets others (ms; bytes, -1 = the server's own limit). */
export const DEFAULT_LIMITS = Object.freeze({
	compileTimeout: 10000,
	runTimeout: 3000,
	compileMemoryLimit: -1,
	runMemoryLimit: -1,
});

/**
 * The range each timeout is clamped into, in ms. The maxima are the Piston server's own
 * limits (compile_timeout <= 10000, run_timeout <= 3000; more is refused with a 400, checked
 * 2026-10-23/24). Change them together with the server and shared/functions/code-runner/execute.mjs.
 */
export const TIMEOUT_BOUNDS = Object.freeze({
	compileTimeout: Object.freeze({ min: 1, max: 10000 }),
	runTimeout: Object.freeze({ min: 1, max: 3000 }),
});

/** The version selector sent when none is known: Piston reads it as "the newest installed". */
export const ANY_VERSION = '*';

/** The old editor's snake_case `outputSettings` keys -> the camelCase limit names. */
const LEGACY_LIMIT_KEYS = Object.freeze({
	compile_timeout: 'compileTimeout',
	run_timeout: 'runTimeout',
	compile_memory_limit: 'compileMemoryLimit',
	run_memory_limit: 'runMemoryLimit',
});

/** The old editor's other `outputSettings` keys that still mean something (same name now). */
const LEGACY_PLAIN_KEYS = Object.freeze(['language', 'version', 'stdin', 'args']);

/** DEFAULT_LIMITS with every finite number of `limits` over it. */
function mergeLimits(limits) {
	const merged = { ...DEFAULT_LIMITS };
	if (!limits || typeof limits !== 'object') return merged;
	for (const name of Object.keys(DEFAULT_LIMITS)) {
		const value = limits[name];
		if (typeof value === 'number' && Number.isFinite(value)) merged[name] = value;
	}
	return merged;
}

/** A timeout rounded to whole ms and held inside `bounds` ({ min, max }). */
function clampTimeout(value, bounds) {
	return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

/**
 * The limits a run really gets: DEFAULT_LIMITS with the page's finite numbers over them, and
 * both timeouts rounded and clamped into TIMEOUT_BOUNDS (the header's LIMITS). Always a full
 * { compileTimeout, runTimeout, compileMemoryLimit, runMemoryLimit }.
 */
export function effectiveLimits(limits = {}) {
	const merged = mergeLimits(limits);
	for (const name of Object.keys(TIMEOUT_BOUNDS)) {
		merged[name] = clampTimeout(merged[name], TIMEOUT_BOUNDS[name]);
	}
	return merged;
}

/** Program arguments as strings (anything but an array gives none). */
function argsList(args) {
	if (!Array.isArray(args)) return [];
	return args.map((arg) => String(arg ?? ''));
}

/** The one file of an ordinary run: `fileName`, or the language's submitName (languages.js). */
function singleFile(language, code, fileName) {
	const name = typeof fileName === 'string' && fileName.trim() !== '' ? fileName.trim() : languageInfo(language).submitName;
	return { name, content: String(code ?? '') };
}

/** Several files as Piston takes them: each `{ name, content }` as strings (a missing name is left out). */
function filesToSend(files) {
	return files.map((file) => {
		const sent = { content: String(file?.content ?? '') };
		if (typeof file?.name === 'string' && file.name.trim() !== '') sent.name = file.name.trim();
		return sent;
	});
}

/** The version selector to send: ANY_VERSION for every "any version" selector, else the given one, trimmed. */
function versionToSend(version) {
	if (isAnyVersion(version)) return ANY_VERSION;
	return String(version).trim();
}

/**
 * The JSON body of one run (see the header for its shape):
 *   language   the Piston language name (or an alias Piston knows)
 *   version    a version or selector; sent as '*' when it is empty, '*' or 'latest' (any case)
 *   code       the source text
 *   fileName   default: languages.js's submitName for the language (main.py, Main.java, "main"
 *              for Go, C, C++ and TypeScript, …)
 *   stdin      text the program reads from standard input
 *   args       command-line arguments
 *   limits     { runTimeout, compileTimeout, runMemoryLimit, compileMemoryLimit }, through
 *              effectiveLimits() (over DEFAULT_LIMITS, timeouts clamped into TIMEOUT_BOUNDS)
 *   files      instead of `code` / `fileName`: several files [{ name, content }], the first one
 *              run (an exercise check: the harness, then the reader's code; exercise.js >
 *              buildCheckFiles). shared/functions/code-runner/execute.mjs accepts 1 to 5.
 */
export function buildExecuteRequest({ language, version, code, fileName, files, stdin = '', args = [], limits = {} }) {
	const merged = effectiveLimits(limits);
	return {
		language: String(language ?? '').trim(),
		version: versionToSend(version),
		files: Array.isArray(files) && files.length > 0 ? filesToSend(files) : [singleFile(language, code, fileName)],
		stdin: String(stdin ?? ''),
		args: argsList(args),
		compile_timeout: merged.compileTimeout,
		run_timeout: merged.runTimeout,
		compile_memory_limit: merged.compileMemoryLimit,
		run_memory_limit: merged.runMemoryLimit,
	};
}

/**
 * The old editor's `outputSettings` (snake_case Piston names) as the new props:
 *   { language?, version?, stdin?, args?, limits: { compileTimeout?, runTimeout?, … } }
 * A key that is absent (or null / undefined) is absent here too — never a default, so newer
 * props and the defaults merged after it are not overwritten. `limits` is always an object.
 */
export function fromLegacyOutputSettings(outputSettings = {}) {
	const settings = outputSettings && typeof outputSettings === 'object' ? outputSettings : {};
	const result = {};
	for (const key of LEGACY_PLAIN_KEYS) {
		if (settings[key] !== undefined && settings[key] !== null) result[key] = settings[key];
	}
	const limits = {};
	for (const [legacyKey, name] of Object.entries(LEGACY_LIMIT_KEYS)) {
		if (settings[legacyKey] !== undefined && settings[legacyKey] !== null) limits[name] = settings[legacyKey];
	}
	result.limits = limits;
	return result;
}
