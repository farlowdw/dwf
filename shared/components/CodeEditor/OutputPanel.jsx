/**
 * OutputPanel.jsx — the part of <CodeEditor> under the code: what the last run did.
 *
 *   before any run   a muted hint: "Run the code to see its output (⌘/Ctrl+Enter)." (IdleLine.jsx,
 *                    shared with the placeholder) — in an exercise with hints, while its hints
 *                    area is closed, followed by "Hints available: 3 (click [bulb] to reveal)."
 *   running          a thin progress bar and "Running Python 3.12.0…"
 *   an answer        a status line — what ran and how it went (lib/codeRunner/result.js >
 *                    describeResult: "Python 3.12.0 · Exit code 0 · 52 ms CPU · 113 ms total ·
 *                    13.7 MB", "Time limit exceeded (3 s)", "Compile error (exit code 1)") in
 *                    green or red — then the output in a Docusaurus code block titled "Output"
 *                    (its own copy button; "(no output)" when the program printed nothing).
 *                    A compiled language's warnings, when it compiled, come first in a
 *                    "Compiler output" block.
 *   no answer        a red notice with the library's plain explanation (no function under
 *                    `npm start`, a site password's session expired, Piston refused …)
 *   stopped          a notice that the wait was stopped but the code runner may still finish
 * The status line and notices are in an aria-live="polite" region, so a screen reader announces
 * the result; the output block itself is not re-read on every run.
 *
 * THE TEACHING LAYER (2026-10-25; each part only when the editor has it)
 *   - Run-error rows: after a failed run (or a TypeScript run stopped by syntax errors), the
 *     "Line 4 · IndexError: …" rows with their Go to line buttons, right under the status line or
 *     notice, outside the live region (ErrorList.jsx; which locations: runErrors.js). Nothing for
 *     a run without a location, and a successful run marks nothing (except a Bash script that ran
 *     past an error: runErrors.js > MARKED_AFTER_SUCCESS), so it looks exactly as before.
 *   - A TypeScript run: the status line names what ran as the header does ("TypeScript 5.9.3 ·
 *     Node 20.11.1", `ranLabel`) and ends with "· 2 type errors" when the code ran with some
 *     (`typeErrorCount`; type errors do not stop a run).
 *   - An exercise (`exercise`): ExercisePanel.jsx LAST in the output area — the expected-output
 *     verdict and diff, Check's headline and results, the collapsed "Expected output" block —
 *     inside .output, where the placeholder draws its part (and Check's bar sits on .output's
 *     top edge).
 *   - The hint cue (`hintCue`, 2026-10-26): the number of hints the idle line names while the
 *     hints area is closed (IdleLine.jsx; the editor works it out: useExercise.js > hints.cue).
 *     It sits inside the polite region, so closing the hints area before a run reads it out once
 *     ("Hints available: 3 (click the Hints button to reveal).") — the way back to them; opening
 *     it removes the words silently.
 *   - `touch` (2026-10-26): on a phone or tablet (touchMode.js) the idle line drops the
 *     ⌘/Ctrl+Enter shortcut (messages.js > IDLE_HINT_TOUCH).
 *   - `editorFailed` (2026-11-10): Monaco could not load and Run is greyed out, so the idle line
 *     names no Run (messages.js > IDLE_HINT_UNAVAILABLE; IdleLine.jsx > unavailable).
 *
 * HOW TO CHANGE IT
 *   The words: messages.js. The idle line and its hint cue: IdleLine.jsx. What Copy output copies
 *   (keep it in step with RunOutput): output.js.
 *   The colours and spacing: styles.module.css (.output, .status…). The status line's wording:
 *   the library's describeResult. The long-output scroll height: styles.module.css >
 *   .outputBlock. The rows: ErrorList.jsx; the exercise part: ExercisePanel.jsx.
 */

import React from 'react';
import clsx from 'clsx';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import CodeBlock from '@theme/CodeBlock';
import { RESULT_SUCCESS, describeResult, languageInfo } from './lib/codeRunner/index.js';
import {
	COMPILER_TITLE,
	LABELS,
	NO_OUTPUT,
	OUTPUT_TITLE,
	PART_SEPARATOR,
	RUN_FAILED,
	STOPPED_NOTICE,
	runningText,
	typeErrorsText,
} from './messages.js';
import ErrorList from './ErrorList.jsx';
import ExercisePanel from './ExercisePanel.jsx';
import IdleLine from './IdleLine.jsx';
import { RUN_PHASES } from './useCodeRun.js';
import styles from './styles.module.css';

/** The code block language for program output: plain text, no highlighting. */
const OUTPUT_LANGUAGE = 'text';

/** "Python 3.12.0" from the answer (what actually ran), or '' when the answer does not say. */
function ranWith(summary) {
	if (!summary.language) return '';
	const label = languageInfo(summary.language).label;
	return summary.version ? `${label} ${summary.version}` : label;
}

/**
 * The green / red line that says what ran and how it went. `ranLabel` names what ran instead of
 * the answer (a TypeScript run: "TypeScript 5.9.3 · Node 20.11.1"); `typeErrorCount` adds
 * "2 type errors" at the end.
 */
function StatusLine({ summary, limits, ranLabel = null, typeErrorCount = 0 }) {
	const succeeded = summary.status === RESULT_SUCCESS;
	const Icon = succeeded ? CheckCircleOutlinedIcon : ErrorOutlinedIcon;
	const typeErrors = typeErrorCount > 0 ? typeErrorsText(typeErrorCount) : '';
	const parts = [ranLabel ?? ranWith(summary), describeResult(summary, limits), typeErrors].filter(Boolean);
	return (
		<p className={clsx(styles.status, succeeded ? styles.statusSuccess : styles.statusFailure)}>
			<Icon fontSize="inherit" className={styles.statusIcon} aria-hidden="true" />
			<span>{parts.join(PART_SEPARATOR)}</span>
		</p>
	);
}

/** The line or notice for the current phase (inside the aria-live region); before any run, the idle line with its hint cue. */
function PhaseMessage({ phase, summary, error, runningLabel, limits, ranLabel, typeErrorCount, hintCue, touch, editorFailed }) {
	switch (phase) {
		case RUN_PHASES.running:
			return <p className={styles.hint}>{runningText(runningLabel)}</p>;
		case RUN_PHASES.done:
			return summary ? <StatusLine summary={summary} limits={limits} ranLabel={ranLabel} typeErrorCount={typeErrorCount} /> : null;
		case RUN_PHASES.failed:
			return (
				// No role of its own: MUI's Alert says role="alert", which would interrupt, and the polite region around it already announces it.
				<Alert severity="error" variant="outlined" role={null} className={styles.notice}>
					{error?.message || RUN_FAILED}
				</Alert>
			);
		case RUN_PHASES.stopped:
			return (
				// No role of its own: MUI's Alert says role="alert", which would interrupt, and the polite region around it already announces it.
				<Alert severity="info" variant="outlined" role={null} className={styles.notice}>
					{STOPPED_NOTICE}
				</Alert>
			);
		default:
			return <IdleLine hintCount={hintCue} touch={touch} unavailable={editorFailed} />;
	}
}

/** The output block(s) of an answer: the compiler's warnings (if any), then the program's output. */
function RunOutput({ summary }) {
	const compilerWarnings = summary.stage === 'run' && summary.compileOutput ? summary.compileOutput : '';
	return (
		<>
			{compilerWarnings ? (
				<CodeBlock title={COMPILER_TITLE} language={OUTPUT_LANGUAGE} className={styles.outputBlock}>
					{compilerWarnings}
				</CodeBlock>
			) : null}
			<CodeBlock title={OUTPUT_TITLE} language={OUTPUT_LANGUAGE} className={styles.outputBlock}>
				{summary.output || NO_OUTPUT}
			</CodeBlock>
		</>
	);
}

/**
 * Props: phase / summary / error (useCodeRun.js), runningLabel ("Python 3.12.0"), limits
 * ({ runTimeout, compileTimeout } the run had, for "Time limit exceeded (3 s)").
 * The teaching layer's (all optional; see the header): errorRows ({ locations, onGoToLine }:
 * useRunErrors.js), ranLabel and typeErrorCount (a TypeScript run), exercise (ExercisePanel's
 * props, or null), hintCue (the hints the idle line names, or 0 for no cue), touch (a
 * touch-first device: the idle line without the ⌘/Ctrl+Enter shortcut; IdleLine.jsx),
 * editorFailed (Run is greyed out because Monaco could not load: the idle line names no Run).
 */
export default function OutputPanel({
	phase,
	summary,
	error,
	runningLabel,
	limits,
	errorRows = null,
	ranLabel = null,
	typeErrorCount = 0,
	exercise = null,
	hintCue = 0,
	touch = false,
	editorFailed = false,
}) {
	const running = phase === RUN_PHASES.running;
	return (
		<div className={styles.output}>
			{running ? <LinearProgress className={styles.progress} aria-label={LABELS.running} /> : null}
			<div aria-live="polite">
				<PhaseMessage
					phase={phase}
					summary={summary}
					error={error}
					runningLabel={runningLabel}
					limits={limits}
					ranLabel={ranLabel}
					typeErrorCount={typeErrorCount}
					hintCue={hintCue}
					touch={touch}
					editorFailed={editorFailed}
				/>
			</div>
			{errorRows ? <ErrorList locations={errorRows.locations} onGoToLine={errorRows.onGoToLine} /> : null}
			{phase === RUN_PHASES.done && summary ? <RunOutput summary={summary} /> : null}
			{exercise ? <ExercisePanel {...exercise} /> : null}
		</div>
	);
}
