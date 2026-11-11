/**
 * messages.js — every word <CodeEditor> shows (button labels, tooltips, hints, notices), in one
 * place. Plain constants and two small functions; no React, so the server-rendered placeholder
 * (index.jsx) and the browser-only parts (Toolbar.jsx, OutputPanel.jsx, CodeEditorClient.jsx)
 * share them without pulling MUI into the page's main bundle.
 *
 * The teaching layer's panels keep their own words in a WORDS constant at the top of their file
 * (StepBar.jsx, ErrorList.jsx, ExercisePanel.jsx, ExpectedOutput.jsx, SolutionPanel.jsx,
 * HintList.jsx, drafts.js, runMarkers.js, typescript.js, twoslash.js); the header's new buttons
 * (Check, the hints' light bulb, Solution), the idle line's hint cue (HINT_CUE), the TypeScript
 * status words and the console warnings for a page's author are here.
 *
 * HOW TO CHANGE IT
 *   Edit the text here; nothing else needs to change. The run errors themselves (no function
 *   under `npm start`, a site password, Piston's refusal …) are written by the library:
 *   lib/codeRunner/errors.js. The status line after a run ("Exit code 0 · 52 ms CPU …") is
 *   lib/codeRunner/result.js > describeResult. Keep README.md's screenshots-in-words in step.
 */

/** The keyboard shortcut that runs the code, as shown to the reader. */
export const RUN_SHORTCUT = '⌘/Ctrl+Enter';

/** Shown in the editor's box until Monaco is ready (and in the server-rendered placeholder). */
export const LOADING_EDITOR = 'Loading editor…';

/** The muted line under the editor before the first run. */
export const IDLE_HINT = `Run the code to see its output (${RUN_SHORTCUT}).`;

/** The same line on a touch-first device (touchMode.js), where there is no ⌘/Ctrl+Enter to name. */
export const IDLE_HINT_TOUCH = 'Run the code to see its output.';

/**
 * The same line where there is no Run to press: the failure frame (index.jsx, with Retry) and an
 * editor whose Run is greyed out because Monaco could not load. It names no Run and no key, and
 * takes the line's place, so the frame keeps its height.
 */
export const IDLE_HINT_UNAVAILABLE = 'The output will show here once the editor loads.';

/**
 * The idle line's cue in an exercise with hints, while its hints area is closed (IdleLine.jsx,
 * the wording of 2026-10-26): "Hints available: 3 (click [light bulb] to reveal)." The
 * header's light bulb is drawn between `before` and `after`; screen readers hear `icon` in its
 * place. `icon` names the button as a screen reader announces it (its name is LABELS.hints,
 * "Hints"), so a reader who looks for it by name finds it: nothing on the page is called "light
 * bulb". The same words for one hint: "Hints available: 1 (…)".
 */
export const HINT_CUE = Object.freeze({
	before: (count) => `Hints available: ${count} (click `,
	icon: 'the Hints button',
	after: ' to reveal).',
});

/** The cue as plain text, the icon in words: "Hints available: 3 (click the Hints button to reveal)." */
export function hintCueText(count) {
	return `${HINT_CUE.before(count)}${HINT_CUE.icon}${HINT_CUE.after}`;
}

/** The Output block's title (a Docusaurus code block, with its own copy button). */
export const OUTPUT_TITLE = 'Output';

/** Shown in the Output block when a run printed nothing. */
export const NO_OUTPUT = '(no output)';

/** The Output block's title for a successful compile's warnings (compiled languages only). */
export const COMPILER_TITLE = 'Compiler output';

/** Buttons and tooltips. */
export const LABELS = Object.freeze({
	run: 'Run',
	runTooltip: `Run (${RUN_SHORTCUT})`,
	runAction: 'Run code',
	stop: 'Stop',
	stopTooltip: 'Stop waiting for the result (the code runner may still finish the run)',
	reset: 'Reset to the original code (undo with ⌘/Ctrl+Z)',
	clear: 'Clear the editor (undo with ⌘/Ctrl+Z)',
	copy: 'Copy code',
	copied: 'Copied',
	copyFailed: "Couldn't copy: select the code and copy it by hand",
	copyOutput: 'Copy output',
	copyOutputNone: 'Copy output (run the code first)',
	copyOutputFailed: "Couldn't copy: select the output and copy it by hand",
	showInput: 'Show the program input (stdin)',
	hideInput: 'Hide the program input (stdin)',
	inputField: 'Input (stdin)',
	inputPlaceholder: 'Text the program reads from standard input',
	language: 'Language',
	version: 'Version',
	editorRegion: 'Code editor',
	running: 'Running',
	retry: 'Retry',
	resize: 'Resize the editor',
	resizeTooltip: 'Drag to resize · double-click (or Enter) for the original size',
	check: 'Check',
	checkTooltip: 'Check your code against the tests',
	stopCheckTooltip: 'Stop waiting for the check (the code runner may still finish it)',
	solution: 'Solution',
	showSolution: 'Show the solution',
	hideSolution: 'Hide the solution',
	hints: 'Hints',
	showHints: 'Show hints',
	hideHints: 'Hide hints',
});

/** Why Run is greyed out. */
export const RUN_DISABLED = Object.freeze({
	loading: 'The editor is still loading',
	empty: 'There is no code to run',
	notInstalled: 'This language is not installed on the code runner',
	noEditor: 'The editor could not load',
	checking: 'Wait for the check to finish',
});

/** Why Check is greyed out (an exercise's Check button). */
export const CHECK_DISABLED = Object.freeze({
	loading: RUN_DISABLED.loading,
	empty: 'There is no code to check',
	notInstalled: RUN_DISABLED.notInstalled,
	noEditor: RUN_DISABLED.noEditor,
	running: 'Wait for the run to finish',
});

/** Separator between the parts of a status line or a runtime's text (the library uses the same). */
export const PART_SEPARATOR = ' · ';

/**
 * A TypeScript editor's runtime text (runtimeChoice.js): "TypeScript 5.9.3 · Node 20.11.1", or
 * without `label` "5.9.3 · Node 20.11.1" (beside a language picker); a version not known yet is
 * left out ("TypeScript · Node").
 */
export function typescriptRuntimeText({ label = '', typescriptVersion, nodeVersion }) {
	const compiler = [label, typescriptVersion].filter(Boolean).join(' ');
	const node = nodeVersion ? `Node ${nodeVersion}` : 'Node';
	return [compiler, node].filter(Boolean).join(PART_SEPARATOR);
}

/** The end of a TypeScript run's status line: "2 type errors" (the code ran anyway, as tsc emits anyway). */
export function typeErrorsText(count) {
	return count === 1 ? '1 type error' : `${count} type errors`;
}

/** What the reader does again once a syntax error is fixed: run, or check (an exercise's Check). */
export const AGAIN = Object.freeze({ run: 'run', check: 'check' });

/** "on line 2 (Expression expected.)" for a location with a line ('' without one). */
function blockedPlace(first) {
	if (!first || !Number.isInteger(first.line) || first.line < 1) return '';
	const words = typeof first.message === 'string' ? first.message.trim().split('\n')[0].trim() : '';
	return words === '' ? `on line ${first.line}` : `on line ${first.line} (${words})`;
}

/**
 * A TypeScript run or check stopped by syntax errors. The notice names the first error's line and
 * TypeScript's words, so the reader learns where even when `hideErrors` hides the "Line N" rows
 * (runErrors.js): "TypeScript found a syntax error on line 2 (Expression expected.): fix it, then
 * run again." / "TypeScript found 3 syntax errors, the first on line 2 (…): fix them, then check
 * again." (`again`: AGAIN.run / AGAIN.check; `first`: the first location, or null).
 */
export function syntaxBlockedText(count, again = AGAIN.run, first = null) {
	const place = blockedPlace(first);
	if (count === 1) {
		const where = place === '' ? '' : ` ${place}`;
		return `TypeScript found a syntax error${where}: fix it, then ${again} again.`;
	}
	const where = place === '' ? '' : `, the first ${place}`;
	return `TypeScript found ${count} syntax errors${where}: fix them, then ${again} again.`;
}

/**
 * Console warnings for the page's author: a <CodeRef>'s request (CodeRef/), and notServed, the
 * setup detail behind EDITOR_ERRORS.notServed (useMonacoLoader.js, once per page load).
 */
export const EDITOR_WARNINGS = Object.freeze({
	refPastEnd: (id, lineCount) =>
		`CodeRef: the lines asked of the editor "${id}" are past its end (it has ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}).`,
	refNoStep: (id, step, count) =>
		`CodeRef: the editor "${id}" has ${count === 0 ? 'no steps' : `${count} ${count === 1 ? 'step' : 'steps'}`}; step ${step} was asked.`,
	refFailed: (id) => `CodeRef: the editor "${id}" could not show the lines.`,
	notServed:
		"CodeEditor: the site does not serve Monaco's files: shared/plugins/monaco-editor is not registered in docusaurus.config.js (shared/components/CodeEditor/README.md > Taking it to another Docusaurus site).",
});

/**
 * The editor could not start (shown instead of the editor). A reader may see any of these, so they
 * say nothing of how the site is set up. clientFailed: the editor's own code (CodeEditorClient.jsx's
 * chunk) did not arrive or crashed — shown in the placeholder frame with a Retry button (index.jsx);
 * it names the reload too, since Retry cannot bring back a chunk that a deploy replaced (the page
 * still asks for the old file), while a reload can. failedToLoad: Monaco itself did not load
 * (useMonacoLoader.js). notServed: the site does not serve Monaco at all, so reloading would not
 * help; EDITOR_WARNINGS.notServed says why, in the console.
 */
export const EDITOR_ERRORS = Object.freeze({
	notServed: "The editor isn't available on this site.",
	failedToLoad: 'The editor could not load. Reload the page to try again.',
	clientFailed: 'The editor could not load. Retry, or reload the page.',
});

/** The notice when a run was stopped before its answer came back. */
export const STOPPED_NOTICE = 'Stopped waiting for the result. The code runner may still finish the run on its side.';

/** Shown when a run failed without a message of its own (the library normally writes one). */
export const RUN_FAILED = 'The code could not be run.';

/** The notice when the language has no runtime on the code runner. */
export function languageMissingNotice(label) {
	return `${label} isn't installed on the code runner.`;
}

/** The notice when the version the page asks for is not installed: "Python 3.10 isn't installed; using 3.12.0." */
export function versionMissingNotice(label, selector, version) {
	return `${label} ${selector} isn't installed; using ${version}.`;
}

/** "Running Python 3.12.0…" (the label may be empty while the runtimes are unknown). */
export function runningText(label) {
	return label ? `Running ${label}…` : 'Running…';
}
