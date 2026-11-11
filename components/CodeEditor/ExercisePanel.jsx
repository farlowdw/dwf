/**
 * ExercisePanel.jsx — the exercise part of <CodeEditor>'s output area: the collapsed "Expected
 * output" block, the verdict after each run, and the results of Check.
 *
 *     <ExercisePanel expectedOutput={…} comparison={…} check={…} />
 *
 *   expectedOutput   the page's `expectedOutput` (a string), or null
 *   comparison       the library's compareOutput(the run's stdout, expectedOutput) after a
 *                    finished run — { matches, firstDifferentLine, diff } — or null (no run yet,
 *                    a run that did not finish, an editor without expectedOutput)
 *   check            null for an editor without `tests`; else the Check run as
 *                    { phase, summary, response, error, results, typeCheck, readerCode, harness,
 *                    limits, checkedIn }:
 *                      phase, summary, response, error   the Check run's useCodeRun() (its own one)
 *                      results     the library's parseCheckResults(response.run.stdout) once done
 *                                  ({ cases, passed, total, otherOutput, finished })
 *                      checkedIn   the name of the language the check ran in ("Python") when the
 *                                  reader has since switched the editor to another language,
 *                                  else null: the headline then starts with it ("Python · 2/4
 *                                  passed"), so results never pass for the code on screen
 *                      typeCheck   TypeScript only: typescript.js > typeCheckOnly's result
 *                                  ({ ok, errorCount, diagnostics: [{ line, message, category,
 *                                  inHarness, … }] }: the reader's code plus the harness checked
 *                                  in the browser); null otherwise
 *                      readerCode, harness   the two texts that were checked, so a type error
 *                                  can show its line's source (a type test's line says more
 *                                  than TypeScript's message); optional
 *                      limits      the limits the Check run had (for "Time limit exceeded (3 s)")
 *   checkRows        the check's run-error rows (useRunErrors.js: { locations, onGoToLine }), drawn
 *                    under the check's headline (ErrorList.jsx); null or none: nothing
 *
 * WHAT THE READER SEES (top to bottom)
 *   - after a run, the VERDICT, in the output's status-line look: "Matches the expected output"
 *     (green) or "Differs from line 3" (red) with a small line diff right under it ("− your
 *     output" in red, "+ expected" in green: from the reader's output to the expected one, the
 *     same direction and colours as the Solution panel's diff; only the changed lines and a
 *     little context: exerciseView.js > diffRows);
 *   - while Check runs, "Checking your code…" and a thin progress bar; then ONE HEADLINE, green
 *     when the whole check passed, else red: "4/5 passed" — for TypeScript with the type check
 *     beside it, "5/5 passed · No type errors", "4/5 passed · 2 type errors", or "No type
 *     errors" alone for type tests only — or "The check did not finish: Compile error (exit code
 *     1)" when the run itself failed; after a switch to another language, the checked one's
 *     name first ("Python · 2/4 passed", "Checking your Python code…") —
 *     then the "Line N · …" rows of the reader's lines the check's errors point to (a compile
 *     error, a crash, a TypeScript syntax error that stopped the check), then each case (✓ or ✗
 *     and its name; a failing one with Expected and Got), the type errors
 *     (where, what, and the line's source), the harness's other output (the reader's prints on
 *     stdout) and the error output (the compiler's output when compiling failed, else whatever
 *     the run wrote to stderr: a crash's traceback, but also a warning or a reader's own
 *     console.error in a check that finished);
 *   - the collapsed "Expected output" block (ExpectedOutput.jsx), always last, so it is where the
 *     placeholder drew it.
 * Every line and block keeps a 0.5rem gap above it (ExercisePanel.module.css), also when Check
 * runs before any Run, right under the output's "Run the code …" hint.
 * ACCESSIBILITY  The verdict and the check's headline sit in two polite live regions that exist
 * from the start (ExpectedOutput.jsx > ExerciseFrame), so a screen reader hears "Matches the
 * expected output" or "4/5 passed" after each run; the lists and blocks are not re-read. The
 * check's failed / stopped notices are MUI Alerts with NO role of their own (NOTICE_ROLE): MUI's
 * role="alert" would interrupt, and be read twice inside the polite region that already
 * announces them. The lists (cases, type errors, diff rows) say role="list" too: Safari drops
 * the list role of a list without bullets (as ErrorList.jsx does).
 * Only draws: the runs, the comparison and the parsing happen in useExercise.js and the
 * library (lib/codeRunner/exercise.js).
 *
 * HOW TO CHANGE IT
 *   The words: WORDS below. The diff rows themselves (the signs, the classes; shared with the
 *   static view's Solution panel): DiffRows.jsx. The look: ExercisePanel.module.css (the verdict and headline use the
 *   output's own status line, styles.module.css > .status). How much of a diff shows, and when a
 *   check passes: exerciseView.js. What the panel draws before any run must stay equal to
 *   ExpectedOutput.jsx > ExercisePlaceholder (the server-rendered placeholder draws that).
 */

import React from 'react';
import clsx from 'clsx';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlinedIcon from '@mui/icons-material/ErrorOutlined';
import { RESULT_RUNTIME_ERROR, RESULT_SUCCESS, describeResult } from './lib/codeRunner/index.js';
import DiffRows, { ROW_CLASSES, SIGNS } from './DiffRows.jsx';
import ErrorList from './ErrorList.jsx';
import { ExerciseFrame, ExpectedOutput } from './ExpectedOutput.jsx';
import {
	CHECK_STATES,
	DIFF_SIDES,
	MAX_TYPE_ERRORS_SHOWN,
	ROW_KINDS,
	checkCases,
	checkErrorOutput,
	checkOutcome,
	diffRows,
	hasText,
	outputVerdict,
	typeErrorsOf,
} from './exerciseView.js';
import { RUN_PHASES } from './useCodeRun.js';
import styles from './styles.module.css';
import panelStyles from './ExercisePanel.module.css';

/** Between the parts of a headline ("4/5 passed · 2 type errors"), as in the output's status line. */
const PART_SEPARATOR = ' · ';

/** "line" or "lines" for a count. */
function plural(count, word) {
	return count === 1 ? word : `${word}s`;
}

/** Every word this panel shows. */
export const WORDS = Object.freeze({
	matches: 'Matches the expected output',
	differsFrom: (line) => `Differs from line ${line}`,
	differs: 'Differs from the expected output',
	diffLabel: 'Differences from the expected output',
	legend: Object.freeze({ expected: 'expected', yours: 'your output' }),
	sidePrefix: Object.freeze({ expected: 'Expected: ', yours: 'Your output: ' }),
	skipped: (count) => `${count} matching ${plural(count, 'line')}`,
	more: (count) => `${count} more ${plural(count, 'line')}`,
	checking: 'Checking your code…',
	checkingIn: (language) => `Checking your ${language} code…`,
	inLanguage: (language, headline) => `${language}${PART_SEPARATOR}${headline}`,
	checkingLabel: 'Checking',
	passed: (passed, total) => `${passed}/${total} passed`,
	noChecks: 'Nothing was checked: the tests reported no results',
	unfinished: (description) => `The check did not finish: ${description}`,
	runtimeError: (exitCode) => (Number.isInteger(exitCode) ? `Runtime error (exit code ${exitCode})` : 'Runtime error'),
	unknownFailure: 'an error',
	endedEarly: 'the program ended before the last check',
	typeCheckOk: 'No type errors',
	typeCheckErrors: (count) => `${count} type ${plural(count, 'error')}`,
	casesLabel: 'Check results',
	casePassed: 'Passed: ',
	caseFailed: 'Failed: ',
	caseFallback: (index) => `Check ${index}`,
	expected: 'Expected',
	got: 'Got',
	typeErrorsLabel: 'Type errors',
	readerLine: (line) => `Line ${line}`,
	harnessLine: (line) => `Test line ${line}`,
	harness: 'Tests',
	moreTypeErrors: (count) => `and ${count} more`,
	otherOutputTitle: 'Other output',
	errorOutputTitle: 'Error output',
	checkFailed: 'The code could not be checked.',
	checkStopped: 'Stopped waiting for the check. The code runner may still finish it on its side.',
});

/** The legend's order: the reader's side first ("− your output · + expected"), as in the Solution panel's key (your code, then the solution). */
const LEGEND_KINDS = Object.freeze([ROW_KINDS.removed, ROW_KINDS.added]);

/**
 * The role of the check's notices (failed, stopped): none of their own. MUI's Alert says
 * role="alert", which would interrupt, and the polite region around it already announces it.
 * null, not undefined: MUI's own default would fill undefined back in.
 */
const NOTICE_ROLE = null;

/** A line in the output's status-line look: a green tick or a red mark, then the words. */
function StatusLine({ success, children }) {
	const Icon = success ? CheckCircleOutlinedIcon : ErrorOutlinedIcon;
	return (
		<p className={clsx(styles.status, success ? styles.statusSuccess : styles.statusFailure)}>
			<Icon fontSize="inherit" className={styles.statusIcon} aria-hidden="true" />
			<span>{children}</span>
		</p>
	);
}

/** "Matches the expected output", or "Differs from line 3". */
function VerdictLine({ verdict }) {
	if (verdict.matches) return <StatusLine success>{WORDS.matches}</StatusLine>;
	return <StatusLine success={false}>{verdict.line ? WORDS.differsFrom(verdict.line) : WORDS.differs}</StatusLine>;
}

/** The small line diff under a "Differs" verdict (exerciseView.js > diffRows), with its legend; the rows: DiffRows.jsx. */
function OutputDiff({ diff }) {
	const rows = diffRows(diff);
	if (rows.length === 0) return null;
	return (
		<div className={panelStyles.diff}>
			<p className={panelStyles.diffLegend} aria-hidden="true">
				{LEGEND_KINDS.map((kind) => (
					<span key={kind} className={clsx(panelStyles.legendItem, ROW_CLASSES[kind])}>
						{`${SIGNS[kind]} ${WORDS.legend[DIFF_SIDES[kind]]}`}
					</span>
				))}
			</p>
			<div className={panelStyles.diffScroll} role="region" aria-label={WORDS.diffLabel} tabIndex={0}>
				<DiffRows rows={rows} />
			</div>
		</div>
	);
}

/** A block of program text with a title bar, in the look of the output's own code blocks. */
function TitledBlock({ title, text }) {
	return (
		<div className={panelStyles.titledBlock}>
			<div className={panelStyles.blockTitle}>{title}</div>
			<pre className={panelStyles.blockBody} tabIndex={0}>
				<code>{text}</code>
			</pre>
		</div>
	);
}

/**
 * Why a check run did not finish, in a few words: the program ended without an error but before
 * the harness's end (an exit() in the reader's code); "Runtime error (exit code 1)" for a crash
 * (the status line's "Exit code 1 · 52 ms CPU …" says too much here); else the library's own
 * line ("Compile error (exit code 1)", "Time limit exceeded (3 s)" …).
 */
function unfinishedReason(summary, limits) {
	if (summary?.status === RESULT_SUCCESS) return WORDS.endedEarly;
	if (summary?.status === RESULT_RUNTIME_ERROR) return WORDS.runtimeError(summary.exitCode);
	return describeResult(summary, limits) || WORDS.unknownFailure;
}

/**
 * The words of a finished check's headline: "4/5 passed"; for TypeScript the type check joins
 * it ("4/5 passed · 2 type errors", "5/5 passed · No type errors"), or stands alone when the
 * harness holds type tests only ("No type errors").
 */
function headlineWords(outcome, hasTypeCheck) {
	const parts = [];
	if (outcome.total > 0) parts.push(WORDS.passed(outcome.passed, outcome.total));
	if (hasTypeCheck) parts.push(outcome.typeErrors === 0 ? WORDS.typeCheckOk : WORDS.typeCheckErrors(outcome.typeErrors));
	return parts.join(PART_SEPARATOR);
}

/** The words of a finished check's headline, before any language name: why it did not finish, "Nothing was checked", or the tally. */
function outcomeWords(outcome, { hasTypeCheck, summary, limits }) {
	switch (outcome.state) {
		case CHECK_STATES.unfinished:
			return WORDS.unfinished(unfinishedReason(summary, limits));
		case CHECK_STATES.nothingChecked:
			return WORDS.noChecks;
		default:
			return headlineWords(outcome, hasTypeCheck);
	}
}

/** `words` with the checked language's name first when the editor now shows another language (`checkedIn`). */
function inCheckedLanguage(words, checkedIn) {
	return checkedIn ? WORDS.inLanguage(checkedIn, words) : words;
}

/** The headline of a finished check: green only when the whole check passed, else red (or why it did not finish). */
function CheckHeadline({ check }) {
	const outcome = checkOutcome(check);
	const words = outcomeWords(outcome, { hasTypeCheck: Boolean(check.typeCheck), summary: check.summary, limits: check.limits });
	return <StatusLine success={outcome.state === CHECK_STATES.passed}>{inCheckedLanguage(words, check.checkedIn)}</StatusLine>;
}

/** What the check's live region says for its phase (nothing before the first check). */
function CheckMessage({ check }) {
	switch (check.phase) {
		case RUN_PHASES.running:
			return <p className={styles.hint}>{check.checkedIn ? WORDS.checkingIn(check.checkedIn) : WORDS.checking}</p>;
		case RUN_PHASES.failed:
			return (
				<Alert severity="error" variant="outlined" role={NOTICE_ROLE} className={styles.notice}>
					{check.error?.message || WORDS.checkFailed}
				</Alert>
			);
		case RUN_PHASES.stopped:
			return (
				<Alert severity="info" variant="outlined" role={NOTICE_ROLE} className={styles.notice}>
					{WORDS.checkStopped}
				</Alert>
			);
		case RUN_PHASES.done:
			return <CheckHeadline check={check} />;
		default:
			return null;
	}
}

/** One check case: ✓ or ✗ and its name; a failing one with what was expected and what came back. */
function CaseRow({ entry }) {
	const Icon = entry.pass ? CheckIcon : CloseIcon;
	return (
		<li className={clsx(panelStyles.caseRow, entry.pass ? panelStyles.casePassed : panelStyles.caseFailed)}>
			<span className={panelStyles.caseHead}>
				<Icon fontSize="inherit" className={panelStyles.caseIcon} aria-hidden="true" />
				<span className={styles.visuallyHidden}>{entry.pass ? WORDS.casePassed : WORDS.caseFailed}</span>
				<span className={panelStyles.caseName}>{entry.name ?? WORDS.caseFallback(entry.index)}</span>
			</span>
			{entry.pass ? null : (
				<dl className={panelStyles.caseValues}>
					<dt>{WORDS.expected}</dt>
					<dd>{entry.expected}</dd>
					<dt>{WORDS.got}</dt>
					<dd>{entry.got}</dd>
				</dl>
			)}
		</li>
	);
}

/** Where a type error is: "Line 4" (the reader's code), "Test line 2" (the harness), or "Tests". */
function typeErrorPlace(error) {
	if (!error.line) return WORDS.harness;
	return error.inHarness ? WORDS.harnessLine(error.line) : WORDS.readerLine(error.line);
}

/** The first MAX_TYPE_ERRORS_SHOWN type errors: where, what, and the line's source. */
function TypeErrorList({ errors }) {
	const shown = errors.slice(0, MAX_TYPE_ERRORS_SHOWN);
	const hidden = errors.length - shown.length;
	return (
		<ul role="list" className={panelStyles.typeErrors} aria-label={WORDS.typeErrorsLabel}>
			{shown.map((error, index) => (
				<li key={index} className={panelStyles.typeError}>
					<span className={panelStyles.typeErrorPlace}>{typeErrorPlace(error)}</span>
					{PART_SEPARATOR}
					<span className={panelStyles.typeErrorMessage}>{error.message}</span>
					{error.lineText ? <code className={panelStyles.typeErrorSource}>{error.lineText}</code> : null}
				</li>
			))}
			{hidden > 0 ? <li className={panelStyles.typeError}>{WORDS.moreTypeErrors(hidden)}</li> : null}
		</ul>
	);
}

/**
 * Everything under a finished check's headline: the cases, the type errors, the other output, and
 * the error output — shown whenever there is some, also for a check that finished (a Bash
 * "command not found" in a passing check, or the reader's own console.error, would otherwise
 * vanish).
 */
function CheckDetails({ check }) {
	const cases = checkCases(check.results);
	const typeErrors = check.typeCheck ? typeErrorsOf(check.typeCheck, { readerCode: check.readerCode, harness: check.harness }) : [];
	const otherOutput = check.results?.otherOutput;
	const errorOutput = checkErrorOutput(check.summary, check.response);
	return (
		<>
			{cases.length > 0 ? (
				<ul role="list" className={panelStyles.cases} aria-label={WORDS.casesLabel}>
					{cases.map((entry) => (
						<CaseRow key={entry.index} entry={entry} />
					))}
				</ul>
			) : null}
			{typeErrors.length > 0 ? <TypeErrorList errors={typeErrors} /> : null}
			{hasText(otherOutput) ? <TitledBlock title={WORDS.otherOutputTitle} text={otherOutput} /> : null}
			{hasText(errorOutput) ? <TitledBlock title={WORDS.errorOutputTitle} text={errorOutput} /> : null}
		</>
	);
}

/** See the header. Nothing for an editor that is not an exercise (no expectedOutput, no check). */
export default function ExercisePanel({ expectedOutput = null, comparison = null, check = null, checkRows = null }) {
	const hasExpected = typeof expectedOutput === 'string';
	if (!hasExpected && !check) return null;
	const verdict = outputVerdict(comparison);
	const checking = check?.phase === RUN_PHASES.running;
	const checked = check?.phase === RUN_PHASES.done;
	return (
		<ExerciseFrame
			verdict={verdict ? <VerdictLine verdict={verdict} /> : null}
			verdictDetails={verdict && !verdict.matches ? <OutputDiff diff={comparison.diff} /> : null}
			checkMessage={check ? <CheckMessage check={check} /> : null}>
			{checking ? <LinearProgress className={panelStyles.checkProgress} aria-label={WORDS.checkingLabel} /> : null}
			{check && checkRows ? <ErrorList locations={checkRows.locations} onGoToLine={checkRows.onGoToLine} /> : null}
			{checked ? <CheckDetails check={check} /> : null}
			{hasExpected ? <ExpectedOutput text={expectedOutput} /> : null}
		</ExerciseFrame>
	);
}
