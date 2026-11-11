/**
 * runErrors.js — WHICH run-error locations an editor shows after a run or an exercise's Check,
 * and whether they also become squiggles in the code. Pure (no React, no Monaco), so
 * __tests__/runErrors.test.js checks the rules with the real Piston answers of
 * lib/codeRunner/__tests__/fixtures/errors. The squiggles themselves are runMarkers.js; the
 * "Line N" rows are ErrorList.jsx; useRunErrors.js wires the three to the editor.
 *
 *     const sent = sentRecord({ language: 'python', code });          // kept with the run
 *     const { locations, mark } = shownLocations({ hideErrors, phase, summary, response, sent });
 *
 * THE RULES (the orchestrator's decisions of 2026-10-25)
 *   - `hideErrors`: nothing, ever — no row, no squiggle, also for a TypeScript run stopped by a
 *     syntax error: that run's notice names the first error's line itself (messages.js >
 *     syntaxBlockedText), so the reader still learns where, as the output of any other
 *     language would say.
 *   - A FAILED run (its status is not success: a crash, a compile error, a time limit): every
 *     location the library finds (lib/codeRunner/errorLocations.js), errors and warnings.
 *   - A SUCCESSFUL run: nothing, except in MARKED_AFTER_SUCCESS (Bash, which carries on after
 *     "command not found" and exits 0), and there its errors only; never a warning (a gcc
 *     warning of a program that compiled is not marked). In every other language an error
 *     text on a run that went well is one the program printed on purpose — Python's
 *     traceback.print_exc() or logging.exception(), Node's console.error(err) or
 *     console.trace(), Go's log with Lshortfile — so a run that goes well marks nothing.
 *   - A run STOPPED before it was sent, by syntax errors TypeScript found in the browser
 *     (typescriptRun.js): those errors as rows, but no squiggles — Monaco's own TypeScript
 *     checking already squiggles them, and a second mark on the same place would only repeat it.
 *   - While a run waits, after Stop, before any run: nothing.
 *   Only the reader's own file counts, with its own line numbers: what the run SENT says which
 *   file that is and how its lines map back (sentRecord below). An exercise's Check follows the
 *   same rules (its sent record names the reader's file, solution.py …).
 *
 * THE SENT RECORD  What errorLocations needs to read one answer, kept with the run that sent it
 *   (the reader may type or switch language while it waits):
 *     language          the language the reader's code was in ('typescript' reads as Node)
 *     code              the reader's code AS SENT (Python columns, gcc / Go byte columns); not
 *                       used with mapLine
 *     fileName          the reader's file as the output names it (default: the language's own,
 *                       main.js for TypeScript; an exercise check's solution.py …)
 *     lineOffset        lines added above the reader's code (0 in every layout today)
 *     mapLine           TypeScript: (line, column) of the emitted JavaScript → the TypeScript line
 *     blockedLocations  the syntax errors that stopped a TypeScript run before it was sent
 *
 * HOW TO CHANGE IT
 *   Which answers mark the code: shownLocations / locationsOfAnswer. Which languages a run that
 *   went well still marks: MARKED_AFTER_SUCCESS. Severities: SEVERITY_ERROR. How a location is
 *   found in an answer: the library's errorLocations.js.
 */

import { RESULT_SUCCESS, errorLocations, languageInfo } from './lib/codeRunner/index.js';
import { RUN_PHASES } from './runPhases.js';

/** A location that is an error (the other severity is 'warning'). */
export const SEVERITY_ERROR = 'error';

/**
 * The languages (canonical names: languages.js, so 'sh' and 'shell' count as bash) whose
 * SUCCESSFUL run is still marked, its errors only: Bash carries on after "command not found"
 * and exits 0. Elsewhere an error printed by a run that went well was printed on purpose (see
 * THE RULES). The known cost: an exception in a Python thread, or asyncio's "Task exception was
 * never retrieved", also ends with exit code 0, and is not marked either.
 */
export const MARKED_AFTER_SUCCESS = Object.freeze(['bash']);

/** What an editor shows when there is nothing to show. */
export const NO_LOCATIONS = Object.freeze({ locations: Object.freeze([]), mark: false });

/** A sent record (see the header), with every field present: null / 0 / [] for what was not given. */
export function sentRecord({ language, code = null, fileName = null, lineOffset = 0, mapLine = null, blockedLocations = [] } = {}) {
	return { language, code, fileName, lineOffset, mapLine, blockedLocations };
}

/** errorLocations' options for a sent record (`code` is left out with mapLine: the library ignores it then). */
function locationOptions(sent) {
	const options = { language: sent.language, lineOffset: sent.lineOffset };
	if (sent.fileName) options.fileName = sent.fileName;
	if (typeof sent.mapLine === 'function') options.mapLine = sent.mapLine;
	else if (typeof sent.code === 'string') options.code = sent.code;
	return options;
}

/** Is a successful run in this language still marked (MARKED_AFTER_SUCCESS)? */
function markedAfterSuccess(language) {
	return MARKED_AFTER_SUCCESS.includes(languageInfo(language).id);
}

/** Is this location an error (not a warning)? */
function isError(location) {
	return location.severity === SEVERITY_ERROR;
}

/**
 * The locations of one answer (see THE RULES): every one after a failed run; after a successful
 * one nothing, except a MARKED_AFTER_SUCCESS language's errors; [] without an answer.
 */
export function locationsOfAnswer({ summary, response, sent }) {
	if (!summary || !response || !sent) return [];
	const succeeded = summary.status === RESULT_SUCCESS;
	if (succeeded && !markedAfterSuccess(sent.language)) return [];
	const found = errorLocations(response, locationOptions(sent));
	return succeeded ? found.filter(isError) : found;
}

/**
 * What to show for a run or a check right now (see THE RULES): { locations, mark } — mark false
 * means rows only, no squiggles. `hideErrors` comes first on purpose: it hides a stopped
 * TypeScript run's rows too (its notice says where).
 */
export function shownLocations({ hideErrors = false, phase, summary, response, sent }) {
	if (hideErrors || !sent) return NO_LOCATIONS;
	const blocked = Array.isArray(sent.blockedLocations) ? sent.blockedLocations : [];
	if (phase === RUN_PHASES.failed && blocked.length > 0) return { locations: blocked, mark: false };
	if (phase !== RUN_PHASES.done) return NO_LOCATIONS;
	const locations = locationsOfAnswer({ summary, response, sent });
	return locations.length === 0 ? NO_LOCATIONS : { locations, mark: true };
}
