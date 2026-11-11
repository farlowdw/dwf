/**
 * useExercise.js — an editor that is an exercise: the `expectedOutput` verdict after each run,
 * the **Check** button (`tests`), the **Solution** panel (`solution`) and the hints area with
 * its light bulb (`hints`). The panels draw (ExercisePanel.jsx, SolutionPanel.jsx,
 * HintList.jsx); this hook keeps their state and runs the check.
 *
 *     const exercise = useExercise({ settings, language, stdin, surfaceRef, monacoRef, runtime, codeRun, executeUrl, onSolutionUsed });
 *     exercise.buttons               // { hint, solution, check }: which header buttons (props.js > exerciseButtonsFor;
 *                                    //   check also stays while a check waits: see CHECK)
 *     exercise.runCheck()            // Check (the editor first clears the old run-error marks: useRunErrors.js > beginRun)
 *     exercise.panel                 // ExercisePanel's props, or null for an editor that is not an exercise
 *     exercise.followEdit(text)      // every edit (the open solution diff follows the reader's code)
 *     exercise.followModel(lang, text)    // a language switch, with that language's text
 *     exercise.reset()               // Reset: the check's result goes, the solution panel closes (hints stay)
 *     exercise.hints                 // { list, state, areaId, cue, toggle(), revealNext(), toggleFold(index) }: see HINTS
 *   `stdin` is the Input field's text now (the editor's state); without it, the page's `stdin`.
 *   `executeUrl` is the site's run function (the monaco-editor plugin's option, as
 *   CodeEditorClient.jsx gives it to Run): a Check posts to the SAME function as Run, so a site
 *   whose functions live elsewhere gets its checks there too; undefined = the library's default.
 *   `surfaceRef.current` is the editor's surface (surface.js: Monaco, or a phone's static view),
 *   null before it is up: the code is read and replaced through it; `monacoRef` stays for
 *   TypeScript's compile (a phone mounts Monaco before a TypeScript check: touchMode.js).
 *
 * CHECK  A run of its own (a second useCodeRun, so Run's output stays): the harness and the
 *   reader's code as Piston files (lib/codeRunner/exercise.js > buildCheckFiles: the reader's
 *   code in its own file, so its error lines stay true), sent with the version the editor runs
 *   and the SAME input as Run: the Input field's text and the page's `args` (checkRunInput): the
 *   reader's top-level code runs during a check (Python's import, JavaScript's vm, Bash's
 *   source), so a top-level input() there reads what a Run would give it instead of failing on
 *   an empty stdin; the answer read by parseCheckResults (once per answer) and judged by
 *   exerciseView.js > checkOutcome.
 *   The language a check ran in is kept with it: after a switch to another language its
 *   results stay, with that language's name first in the headline (checkedInLabel: "Python ·
 *   2/4 passed"), and while it waits the Check button stays, as Stop, even in a language
 *   without tests (buttonsWhileChecking), so Run, greyed out until the check ends, never
 *   waits on a check the reader cannot stop.
 *   TypeScript is compiled in the browser first (typescriptRun.js > compileForCheck: the click's
 *   code plus the harness type-checked as one file, the harness in its own namespace, then each
 *   emitted alone; a top-level await in the reader's code stops the check like a syntax error)
 *   and runs on the newest Node; its type errors fail the check. A syntax error in the reader's TypeScript stops
 *   the check before it is sent, with "Line N" rows. Run and Check never wait at the same time
 *   (CodeEditorClient.jsx greys out each while the other waits).
 * EXPECTED OUTPUT  After a run that reached its run stage, the program's stdout (not stderr) is
 *   compared with the page's text (exercise.js > compareOutput); a crash after some output
 *   still gets its diff.
 * SOLUTION  The panel shows Monaco's diff of the reader's code (following their edits) against
 *   the solution for the language on screen (on a phone's static view: a plain diff,
 *   StaticSolution.jsx); "Use this solution" puts it in as ONE undoable edit (the surface's
 *   setValue: monacoSetup.js > replaceCode) and closes the panel. The static view has no undo:
 *   there the shell greys the button out while the language shows a restored draft
 *   (StaticSolution.jsx > `restored`), since the replacement would be saved over the draft at
 *   once and Reset brings the page's snippet, not the draft. Never offered on a read-only
 *   editor (props.js > exerciseButtonsFor). A language switch closes the panel when the new
 *   language has no solution.
 * HINTS  (the design of 2026-10-26) The state of the hints area, { open, revealed,
 *   folded, announce }, starts as exerciseView.js > HINTS_START on every load (nothing is
 *   saved) and changes only through exerciseView.js: `toggle` is the header's light bulb
 *   (toggleHintsArea: the first open reveals hint 1, a close keeps everything for the reopen),
 *   `revealNext` the "Show hint 3 of 3" button (revealNextHint), `toggleFold(index)` a hint's eye
 *   (toggleHintFold). It is one state for the editor, not per language, and Reset leaves it as
 *   it is: a language switch or Reset never hides or reveals a hint. `areaId` is the area's DOM
 *   id, named by the light bulb's aria-controls. `cue` is the number of hints the output's idle
 *   line names ("Hints available: 3 (click [bulb] to reveal)."): all of them while the area is
 *   closed, 0 (no cue) while it is open or when the editor has no hints (hintCueFor).
 *
 * HOW TO CHANGE IT
 *   Which buttons appear: props.js > exerciseButtonsFor (and buttonsWhileChecking). What a
 *   check sends besides its files: checkRunInput. When a check's results carry their
 *   language's name: checkedInLabel. When a check passes, the diff's size: exerciseView.js.
 *   The check's files: the library's exercise.js. The panels' words and looks: their WORDS and
 *   CSS modules.
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { buildCheckFiles, buildExecuteRequest, compareOutput, effectiveLimits, languageInfo, parseCheckResults } from './lib/codeRunner/index.js';
import { HINTS_START, revealNextHint, toggleHintFold, toggleHintsArea } from './exerciseView.js';
import { exerciseButtonsFor, solutionFor, testsFor } from './props.js';
import { sentRecord } from './runErrors.js';
import { compilesInBrowser } from './runtimeChoice.js';
import { BlockedRunError, compileForCheck } from './typescriptRun.js';
import { RUN_PHASES, useCodeRun } from './useCodeRun.js';

/** The stage of an answer that reached the program's run (result.js > summarizeResult). */
const RUN_STAGE = 'run';

/** What the last check was sent with, before any check (`language`: the one it runs in; null before the first). */
function emptyCheck(settings, language = null) {
	return { language, typeCheck: null, readerCode: '', harness: '', limits: effectiveLimits(settings.limits), sent: null };
}

/**
 * What a check sends besides its files: the same input as Run — the Input field's text
 * (`stdin`; the page's own when the editor passes none) and the page's args — and the page's
 * limits (the library clamps them).
 */
export function checkRunInput({ settings, stdin }) {
	return { stdin: typeof stdin === 'string' ? stdin : (settings.stdin ?? ''), args: settings.args, limits: settings.limits };
}

/** The name of the language a check ran in ("Python"), when the editor now shows another; else null. */
export function checkedInLabel(checkedLanguage, shownLanguage) {
	if (!checkedLanguage) return null;
	const checked = languageInfo(checkedLanguage);
	return checked.id === languageInfo(shownLanguage).id ? null : checked.label;
}

/** The header's buttons: Check (as Stop) stays while a check waits, even in a language without tests. */
export function buttonsWhileChecking(buttons, checking) {
	return checking && !buttons.check ? { ...buttons, check: true } : buttons;
}

/** The parsed results of a finished check run, or null. */
function resultsOf(phase, response) {
	return phase === RUN_PHASES.done ? parseCheckResults(response?.run?.stdout ?? '') : null;
}

/** The expected-output comparison of the last run, or null (no expectedOutput, no finished run, or no run stage). */
function comparisonOf(expectedOutput, codeRun) {
	if (expectedOutput === null || codeRun.phase !== RUN_PHASES.done) return null;
	if (!codeRun.response?.run || codeRun.summary?.stage !== RUN_STAGE) return null;
	return compareOutput(codeRun.response.run.stdout ?? '', expectedOutput);
}

/**
 * The idle line's hint cue (HINTS in the header): how many hints it names — every hint while the
 * light bulb is shown (`hasBulb`) and the area is closed; 0, no cue, otherwise.
 */
export function hintCueFor({ hasBulb, open, total }) {
	if (!hasBulb || open) return 0;
	return total;
}

/** ExercisePanel's `check` prop: the check run, its parsed `results`, and what it was sent with (see its header). */
export function checkViewOf({ checkRun, results, lastCheck, language }) {
	return {
		phase: checkRun.phase,
		error: checkRun.error,
		summary: checkRun.summary,
		response: checkRun.response,
		results,
		typeCheck: lastCheck.typeCheck,
		readerCode: lastCheck.readerCode,
		harness: lastCheck.harness,
		limits: lastCheck.limits,
		checkedIn: checkedInLabel(lastCheck.language, language),
	};
}

/** See the header. */
export function useExercise({ settings, language, stdin, surfaceRef, monacoRef, runtime, codeRun, executeUrl, onSolutionUsed }) {
	const checkRun = useCodeRun(executeUrl); // the site's run function, as Run's (useCodeRun.js)
	const [lastCheck, setLastCheck] = useState(() => emptyCheck(settings));
	const [hintsState, setHintsState] = useState(HINTS_START);
	const hintsAreaId = useId();
	const [solutionCode, setSolutionCode] = useState(null); // the reader's code in the diff; null: the panel is closed
	const checkTokenRef = useRef(0);
	const solutionPanelId = useId();

	const buttons = exerciseButtonsFor(settings, language);
	const tests = testsFor(settings, language);
	const solution = solutionFor(settings, language);
	const { phase: runPhase, response: runResponse, summary: runSummary } = codeRun;
	const comparison = useMemo(
		() => comparisonOf(settings.expectedOutput, { phase: runPhase, response: runResponse, summary: runSummary }),
		[settings.expectedOutput, runPhase, runResponse, runSummary],
	);
	const checkResults = useMemo(() => resultsOf(checkRun.phase, checkRun.response), [checkRun.phase, checkRun.response]);
	const checking = checkRun.phase === RUN_PHASES.running;

	/** The check's Piston payload (a promise: TypeScript compiles first); records what was sent while the check is the newest. */
	async function checkPayload({ monaco, base, token, input }) {
		const record = (fields) => {
			if (token === checkTokenRef.current) setLastCheck((current) => ({ ...current, ...fields }));
		};
		let built;
		if (compilesInBrowser(language)) {
			let prepared;
			try {
				prepared = await compileForCheck(monaco, base.readerCode, base.harness);
			} catch (error) {
				if (error instanceof BlockedRunError) record({ sent: sentRecord({ language, blockedLocations: error.locations }) });
				throw error;
			}
			built = buildCheckFiles({ language, readerCode: prepared.readerJs, harness: prepared.harnessJs });
			record({ typeCheck: prepared.typeCheck, sent: sentRecord({ language, fileName: built.readerFileName, lineOffset: built.lineOffset, mapLine: prepared.mapLine }) });
		} else {
			built = buildCheckFiles({ language, readerCode: base.readerCode, harness: base.harness });
			record({ sent: sentRecord({ language, code: base.readerCode, fileName: built.readerFileName, lineOffset: built.lineOffset }) });
		}
		return buildExecuteRequest({ language: runtime.runLanguage, version: runtime.version, files: built.files, ...input });
	}

	function runCheck() {
		const surface = surfaceRef.current;
		const monaco = monacoRef.current;
		if (!surface || !buttons.check) return;
		if (compilesInBrowser(language) && !monaco) return; // TypeScript needs Monaco's worker (the shell mounts it first)
		checkTokenRef.current += 1;
		const base = { ...emptyCheck(settings, language), readerCode: surface.getValue(), harness: tests };
		setLastCheck(base);
		const input = checkRunInput({ settings, stdin });
		checkRun.run(checkPayload({ monaco, base, token: checkTokenRef.current, input }));
	}

	const followEdit = useCallback((text) => {
		setSolutionCode((open) => (open === null ? null : text));
	}, []);

	const followModel = useCallback(
		(lang, text) => {
			setSolutionCode((open) => (open === null || solutionFor(settings, lang) === '' ? null : text));
		},
		[settings],
	);

	function applySolution() {
		const surface = surfaceRef.current;
		if (!surface || solution === '' || settings.readOnly) return;
		surface.setValue(solution, { undoable: true });
		setSolutionCode(null);
		onSolutionUsed();
		surface.focus();
	}

	function toggleSolution() {
		setSolutionCode((open) => (open === null ? (surfaceRef.current?.getValue() ?? '') : null));
	}

	/** The Close button unmounts with the panel: the focus goes back to the editor, not to the page. */
	function closeSolution() {
		setSolutionCode(null);
		surfaceRef.current?.focus();
	}

	const hintTotal = settings.hints.length;
	const hints = {
		list: settings.hints,
		state: hintsState,
		areaId: hintsAreaId,
		cue: hintCueFor({ hasBulb: buttons.hint, open: hintsState.open, total: hintTotal }),
		toggle: () => setHintsState((current) => toggleHintsArea(current, hintTotal)),
		revealNext: () => setHintsState((current) => revealNextHint(current, hintTotal)),
		toggleFold: (index) => setHintsState((current) => toggleHintFold(current, index, hintTotal)),
	};

	function reset() {
		checkRun.clear();
		setSolutionCode(null);
	}

	// The check's results stay after a language switch (labelled with their language), also in a language without tests.
	const showsCheck = buttons.check || checkRun.phase !== RUN_PHASES.idle;
	const isExercise = settings.expectedOutput !== null || showsCheck;
	return {
		buttons: buttonsWhileChecking(buttons, checking),
		checkRun,
		lastCheck,
		runCheck,
		stopCheck: checkRun.stop,
		clearCheck: checkRun.clear,
		reset,
		followEdit,
		followModel,
		hints,
		solutionPanel: {
			id: solutionPanelId,
			open: solutionCode !== null,
			readerCode: solutionCode ?? '',
			solution,
			toggle: toggleSolution,
			close: closeSolution,
			use: applySolution,
		},
		panel: isExercise
			? {
					expectedOutput: settings.expectedOutput,
					comparison,
					check: showsCheck ? checkViewOf({ checkRun, results: checkResults, lastCheck, language }) : null,
				}
			: null,
	};
}
