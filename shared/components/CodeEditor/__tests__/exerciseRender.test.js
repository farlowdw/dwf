/**
 * exerciseRender.test.js — the exercise panels rendered on the server through this folder's
 * module hooks (jsxHooks.js), as the site renders every page at build time:
 *   - ExercisePanel.jsx before any run is EXACTLY ExpectedOutput.jsx > ExercisePlaceholder (what
 *     index.jsx's placeholder will draw), so nothing jumps when the editor arrives; nothing at
 *     all for an editor that is not an exercise;
 *   - the collapsed "Expected output" block (a closed native <details>, "(no output)" for none);
 *   - the verdict after a run, in the status line's look, in a live region: "Matches the expected
 *     output", or "Differs from line N" with the small diff (from the reader's output to the
 *     expected one: "− your output", "+ expected"; signs, screen-reader prefixes, the legend, a
 *     list with role="list"), the expected block staying last;
 *   - Check: "Checking your code…" with a progress bar; "1/2 passed" with each case (a failing
 *     one with Expected and Got) and the other output; "2/2 passed" in green; TypeScript's type
 *     check in the headline ("1/1 passed · 2 type errors") and its type errors; a check that did
 *     not finish (compile error, crash) with its error output; the stderr of a check that DID
 *     finish; a failed request and a stopped wait (notices WITHOUT role="alert": the polite
 *     region announces them); after a language switch, the checked language's name first;
 *   - with a verdict AND a check result, the output diff stays right under its verdict, before
 *     the check's headline;
 *   - every REAL check answer captured on a Piston server (each .json of
 *     lib/codeRunner/__tests__/fixtures/exercise, and …/typescript) read by the library's
 *     summarizeResult and parseCheckResults and drawn: its headline, cases, other output and
 *     error output. The fixtures are re-captured from time to time, so what each must show is
 *     worked out from its own answer, not written here as numbers;
 *   - HintList.jsx (the hints area, 2026-10-26): closed, only its empty live region; opened by
 *     the light bulb, hint 1 in its box ("Hint 1 of 3", the eye, the text with inline code) and
 *     "Show hint 2 of 3"; each reveal read out; every hint revealed, no button; a folded hint
 *     (its text `hidden`, the open eye — a click shows it —, "Show hint 2", aria-expanded false; folding the
 *     hint just read out empties the live region); a reopen as it was, reading nothing out; the
 *     eye icons are MUI's Visibility / VisibilityOff; a `hints` that is not a list draws
 *     nothing; "Show hint" keeps the focus because it is ONE element (no `key`, outside the
 *     list of hints) and its press asks exerciseView.js > focusAfterReveal where the focus goes
 *     (read from the source: effects and clicks need a browser);
 *   - SolutionPanel.jsx's frame (Monaco is not touched on the server): its title, colour key,
 *     buttons, the diff box at its first height, "already the solution", and "Use this
 *     solution" greyed out for an empty solution; its buttons' light-mode blue (dark mode
 *     untouched);
 *   - every CSS-module class the three components use exists in their stylesheet, and every
 *     class of those stylesheets is used.
 * Monaco's diff view itself needs a browser (its bookkeeping: solutionDiff.test.js). Run with
 * `npm run test:shared`.
 * To change it: a new panel state or prop gets a test here, rendered through the hooks; a new class
 * goes in its stylesheet, which the last test reads.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_OUTPUT } from '../messages.js';
import { buildMonacoOptions } from '../props.js';
import { estimateDiffHeight } from '../solutionDiff.js';
import { resolvePackage } from './paths.js';

register('./jsxHooks.js', import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, '..');

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ExercisePanel, WORDS } = await import('../ExercisePanel.jsx');
const { ExercisePlaceholder, ExpectedOutput, WORDS: EXPECTED_WORDS } = await import('../ExpectedOutput.jsx');
const { default: HintList, EYE_PATHS, WORDS: HINT_WORDS, hintAnnouncement } = await import('../HintList.jsx');
const { HINTS_START, revealNextHint, toggleHintFold, toggleHintsArea } = await import('../exerciseView.js');
const { default: SolutionPanel, WORDS: SOLUTION_WORDS, keyStyleOf } = await import('../SolutionPanel.jsx');
const { diffKeyOf } = await import('../editorThemes.js');
const { LIGHT_PRIMARY_INK_SX } = await import('../buttonInk.js');
const { ThemeProvider, createTheme } = await import('@mui/material/styles');

/** Markup without MUI's emotion <style> tags and generated css-… classes (they are not under test). */
function render(element) {
	return renderToStaticMarkup(element)
		.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
		.replace(/ ?css-[\w-]+/g, '');
}

/** The live region opening tag the panels draw. */
const LIVE_OPEN = '<div aria-live="polite">';

/** Where the </div> that closes the <div> whose content starts at `start` is (nested divs counted: MUI's Alert has some). */
function matchingClose(html, start) {
	const tags = /<div[\s>]|<\/div>/g;
	tags.lastIndex = start;
	let depth = 1;
	for (let match = tags.exec(html); match; match = tags.exec(html)) {
		depth += match[0] === '</div>' ? -1 : 1;
		if (depth === 0) return match.index;
	}
	return html.length;
}

/** The live regions' contents, in order (the panel's: [verdict region, check region]). */
function liveRegions(html) {
	const regions = [];
	let open = html.indexOf(LIVE_OPEN);
	while (open !== -1) {
		const start = open + LIVE_OPEN.length;
		const end = matchingClose(html, start);
		regions.push(html.slice(start, end));
		open = html.indexOf(LIVE_OPEN, end);
	}
	return regions;
}

/** A finished run's summary (only what the panel reads). */
const SUCCESS = Object.freeze({ status: 'success', stage: 'run', output: '', exitCode: 0 });

/** A Check run's props for the panel, finished, with these results. */
function doneCheck(overrides = {}) {
	return {
		phase: 'done',
		summary: SUCCESS,
		response: { run: { stdout: '', stderr: '' } },
		error: null,
		results: { cases: [], passed: 0, total: 0, otherOutput: '' },
		typeCheck: null,
		limits: { runTimeout: 3000, compileTimeout: 10000 },
		...overrides,
	};
}

const TWO_CASES = Object.freeze({
	cases: [
		{ name: 'two_sum([2, 7, 11, 15], 9)', pass: true, got: '[0, 1]', expected: '[0, 1]' },
		{ name: 'two_sum([3, 3], 6)', pass: false, got: '[1, 0]', expected: '[0, 1]' },
	],
	passed: 1,
	total: 2,
	otherOutput: 'debug: 42\n',
});

const EXPECTED_BLOCK = (text) =>
	`<details class="expected"><summary class="expectedSummary">${EXPECTED_WORDS.expectedTitle}</summary><pre class="expectedBlock" tabindex="0"><code>${text}</code></pre></details>`;

test('before any run the panel is exactly the placeholder: two empty live regions, then the closed "Expected output" block', () => {
	const panel = render(createElement(ExercisePanel, { expectedOutput: '1\n2\n3\n' }));
	const placeholder = render(createElement(ExercisePlaceholder, { expectedOutput: '1\n2\n3\n' }));
	assert.equal(panel, placeholder);
	assert.equal(panel, `<div class="exercise"><div aria-live="polite"></div><div aria-live="polite"></div>${EXPECTED_BLOCK('1\n2\n3')}</div>`);
	assert.doesNotMatch(panel, /<details[^>]* open/, 'closed until the reader opens it');
});

test('an editor with tests only: the panel and the placeholder match too (the live regions, no block)', () => {
	const check = { phase: 'idle', summary: null, response: null, error: null, results: null, typeCheck: null };
	const panel = render(createElement(ExercisePanel, { check }));
	assert.equal(panel, render(createElement(ExercisePlaceholder, { hasChecks: true })));
	assert.equal(panel, '<div class="exercise"><div aria-live="polite"></div><div aria-live="polite"></div></div>');
});

test('not an exercise (no expectedOutput, no check): nothing at all, in the panel and the placeholder', () => {
	assert.equal(render(createElement(ExercisePanel, {})), '');
	assert.equal(render(createElement(ExercisePlaceholder, {})), '');
});

test('the expected block: an expected empty output reads "(no output)"; line endings are \\n', () => {
	assert.equal(render(createElement(ExpectedOutput, { text: '' })), EXPECTED_BLOCK(NO_OUTPUT));
	assert.equal(render(createElement(ExpectedOutput, { text: 'a\r\nb\r\n' })), EXPECTED_BLOCK('a\nb'));
});

test('a matching run: "Matches the expected output" in green in the first live region; no diff', () => {
	const html = render(createElement(ExercisePanel, { expectedOutput: '1\n', comparison: { matches: true, firstDifferentLine: null, diff: [{ type: 'same', text: '1' }] } }));
	const [verdict] = liveRegions(html);
	assert.match(verdict, /^<p class="status statusSuccess"><svg[^>]*class="[^"]*statusIcon[^"]*"[^>]*aria-hidden="true"[\s\S]*<span>Matches the expected output<\/span><\/p>$/);
	assert.doesNotMatch(html, /class="diff"/);
	assert.ok(html.endsWith(`${EXPECTED_BLOCK('1')}</div>`), 'the expected block stays last');
});

test('a run that differs: "Differs from line 2" in red, then the small diff with signs, prefixes and its legend', () => {
	const comparison = {
		matches: false,
		firstDifferentLine: 2,
		diff: [
			{ type: 'same', text: '1' },
			{ type: 'removed', text: '2' },
			{ type: 'added', text: '20' },
			{ type: 'same', text: '3' },
		],
	};
	const html = render(createElement(ExercisePanel, { expectedOutput: '1\n2\n3\n', comparison }));
	const [verdict] = liveRegions(html);
	assert.match(verdict, /class="status statusFailure"[\s\S]*<span>Differs from line 2<\/span>/);
	assert.ok(html.includes('<p class="diffLegend" aria-hidden="true"><span class="legendItem diffRowRemoved">− your output</span><span class="legendItem diffRowAdded">+ expected</span></p>'));
	assert.ok(html.includes(`<div class="diffScroll" role="region" aria-label="${WORDS.diffLabel}" tabindex="0"><ul role="list" class="diffRows">`), 'the rows are a list Safari keeps as one');
	assert.ok(html.includes('<li class="diffRow"><span class="diffSign" aria-hidden="true"> </span><span>1</span></li>'), 'a matching line: no prefix');
	const readerRow = '<li class="diffRow diffRowRemoved"><span class="diffSign" aria-hidden="true">−</span><span class="visuallyHidden">Your output: </span><span>20</span></li>';
	const expectedRow = '<li class="diffRow diffRowAdded"><span class="diffSign" aria-hidden="true">+</span><span class="visuallyHidden">Expected: </span><span>2</span></li>';
	assert.ok(html.includes(readerRow), "the reader's line: removed (red, −)");
	assert.ok(html.includes(expectedRow), 'the expected line: added (green, +)');
	assert.ok(html.indexOf(readerRow) < html.indexOf(expectedRow), "the reader's line first, as git and the Solution panel show a changed pair");
	assert.ok(html.indexOf('class="diff"') < html.indexOf('<details'), 'the diff comes before the expected block');
});

test('a long differing output: skip and "more" rows in the muted gap look', () => {
	const diff = [...Array.from({ length: 10 }, (_, index) => ({ type: 'same', text: `s${index}` })), { type: 'added', text: 'x' }];
	const html = render(createElement(ExercisePanel, { expectedOutput: 'x', comparison: { matches: false, firstDifferentLine: 11, diff } }));
	assert.ok(html.includes(`<li class="diffRow diffRowGap"><span class="diffSign" aria-hidden="true">⋯</span><span>${WORDS.skipped(8)}</span></li>`));
	assert.equal(WORDS.skipped(1), '1 matching line');
	assert.equal(WORDS.more(3), '3 more lines');
});

test('Check running: "Checking your code…" in the second live region and a progress bar', () => {
	const html = render(createElement(ExercisePanel, { check: doneCheck({ phase: 'running', summary: null, results: null }) }));
	const [verdict, check] = liveRegions(html);
	assert.equal(verdict, '');
	assert.equal(check, `<p class="hint">${WORDS.checking}</p>`);
	assert.match(html, /MuiLinearProgress-root[^>]*aria-label="Checking"|aria-label="Checking"[^>]*MuiLinearProgress-root/);
});

test('Check done, one case failing: "1/2 passed" in red, each case, Expected and Got, and the other output', () => {
	const html = render(createElement(ExercisePanel, { check: doneCheck({ results: TWO_CASES }) }));
	const [, check] = liveRegions(html);
	assert.match(check, /^<p class="status statusFailure">[\s\S]*<span>1\/2 passed<\/span><\/p>$/);
	assert.ok(html.includes(`<ul role="list" class="cases" aria-label="${WORDS.casesLabel}">`));
	assert.match(html, /<li class="caseRow casePassed"><span class="caseHead"><svg[^>]*aria-hidden="true"[\s\S]*?<\/svg><span class="visuallyHidden">Passed: <\/span><span class="caseName">two_sum\(\[2, 7, 11, 15\], 9\)<\/span><\/span><\/li>/);
	assert.match(html, /<li class="caseRow caseFailed">[\s\S]*?<span class="visuallyHidden">Failed: <\/span><span class="caseName">two_sum\(\[3, 3\], 6\)<\/span><\/span><dl class="caseValues"><dt>Expected<\/dt><dd>\[0, 1\]<\/dd><dt>Got<\/dt><dd>\[1, 0\]<\/dd><\/dl><\/li>/);
	assert.ok(html.includes(`<div class="titledBlock"><div class="blockTitle">${WORDS.otherOutputTitle}</div><pre class="blockBody" tabindex="0"><code>debug: 42\n</code></pre></div>`));
	assert.doesNotMatch(html, new RegExp(WORDS.errorOutputTitle), 'a finished check shows no error output');
});

test('Check done, every case passing: "2/2 passed" in green; an unnamed case is "Check 2"', () => {
	const results = { cases: [{ name: 'a', pass: true }, { pass: true }], passed: 2, total: 2, otherOutput: '' };
	const html = render(createElement(ExercisePanel, { check: doneCheck({ results }) }));
	assert.match(liveRegions(html)[1], /class="status statusSuccess"[\s\S]*<span>2\/2 passed<\/span>/);
	assert.ok(html.includes('<span class="caseName">Check 2</span>'));
	assert.doesNotMatch(html, /titledBlock/, 'no other output: no block');
});

test('TypeScript: the type-check line, the type errors (where, what, the source line), type tests alone', () => {
	const typeCheck = {
		ok: false,
		errorCount: 2,
		diagnostics: [
			{ line: 3, column: 10, message: "Type 'false' does not satisfy the constraint 'true'.", category: 'error', inHarness: true },
			{ line: 4, column: 3, message: "Type 'string' is not assignable to type 'number'.\n  It really is not.", category: 'error', inHarness: false },
			{ line: 1, column: 1, message: 'A note.', category: 'suggestion', inHarness: false },
		],
	};
	const harness = 'const result = sum(1, 2);\ncheck("sum", result, 3);\ntype t = [Expect<Equal<typeof result, number>>];\n';
	const readerCode = 'function sum(a: number, b: number) {\n  let total = 0;\n  total = a + b;\n  total = "x";\n  return total;\n}\n';
	const results = { cases: [{ name: 'sum', pass: true }], passed: 1, total: 1, otherOutput: '' };
	const failing = render(createElement(ExercisePanel, { check: doneCheck({ results, typeCheck, readerCode, harness }) }));
	const [, check] = liveRegions(failing);
	assert.match(check, /^<p class="status statusFailure">[\s\S]*<span>1\/1 passed · 2 type errors<\/span><\/p>$/, 'one red headline: a type error fails the check; the suggestion does not count');
	assert.ok(failing.includes(`<ul role="list" class="typeErrors" aria-label="${WORDS.typeErrorsLabel}">`));
	assert.ok(failing.includes(`<li class="typeError"><span class="typeErrorPlace">Test line 3</span> · <span class="typeErrorMessage">Type &#x27;false&#x27; does not satisfy the constraint &#x27;true&#x27;.</span><code class="typeErrorSource">type t = [Expect&lt;Equal&lt;typeof result, number&gt;&gt;];</code></li>`));
	assert.ok(failing.includes(`<li class="typeError"><span class="typeErrorPlace">Line 4</span> · <span class="typeErrorMessage">Type &#x27;string&#x27; is not assignable to type &#x27;number&#x27;.\n  It really is not.</span><code class="typeErrorSource">total = &quot;x&quot;;</code></li>`));
	assert.doesNotMatch(failing, /A note\./);

	const typeOnly = render(createElement(ExercisePanel, { check: doneCheck({ typeCheck: { ok: true, errorCount: 0, diagnostics: [] } }) }));
	const [, typeOnlyCheck] = liveRegions(typeOnly);
	assert.match(typeOnlyCheck, /^<p class="status statusSuccess">[\s\S]*<span>No type errors<\/span><\/p>$/, 'type tests only: the type check is the headline');
	assert.equal(WORDS.typeCheckErrors(1), '1 type error');
	const allPass = render(createElement(ExercisePanel, { check: doneCheck({ results, typeCheck: { ok: true, errorCount: 0, diagnostics: [] } }) }));
	assert.match(liveRegions(allPass)[1], /^<p class="status statusSuccess">[\s\S]*<span>1\/1 passed · No type errors<\/span><\/p>$/);

	const manyErrors = { diagnostics: Array.from({ length: 7 }, (_, index) => ({ line: index + 1, message: `e${index}`, category: 'error' })) };
	const many = render(createElement(ExercisePanel, { check: doneCheck({ typeCheck: manyErrors }) }));
	assert.equal(many.match(/<li class="typeError">/g).length, 6, 'five shown, then "and 2 more"');
	assert.ok(many.includes(`<li class="typeError">${WORDS.moreTypeErrors(2)}</li>`));
});

test('a check that did not finish: why ("Compile error (exit code 1)", "Runtime error (exit code 1)") and its error output', () => {
	const compileError = { status: 'compile-error', stage: 'compile', output: 'solution.c:3:5: error: expected ;', exitCode: 1 };
	const compiled = render(createElement(ExercisePanel, { check: doneCheck({ summary: compileError, results: { cases: [], passed: 0, total: 0, otherOutput: '' } }) }));
	assert.match(liveRegions(compiled)[1], /class="status statusFailure"[\s\S]*<span>The check did not finish: Compile error \(exit code 1\)<\/span>/);
	assert.ok(compiled.includes(`<div class="blockTitle">${WORDS.errorOutputTitle}</div><pre class="blockBody" tabindex="0"><code>solution.c:3:5: error: expected ;</code></pre>`));

	const crash = { status: 'runtime-error', stage: 'run', output: '', exitCode: 1 };
	const response = { run: { stdout: '@@check@@ {}', stderr: 'IndexError: list index out of range' } };
	const crashed = render(createElement(ExercisePanel, { check: doneCheck({ summary: crash, response, results: TWO_CASES }) }));
	assert.match(liveRegions(crashed)[1], /<span>The check did not finish: Runtime error \(exit code 1\)<\/span>/);
	assert.ok(crashed.includes('<code>IndexError: list index out of range</code>'));
	assert.match(crashed, /class="caseRow casePassed"/, 'the cases that ran before the crash still show');

	const endedEarly = render(createElement(ExercisePanel, { check: doneCheck({ results: { ...TWO_CASES, finished: false } }) }));
	assert.match(liveRegions(endedEarly)[1], new RegExp(`<span>The check did not finish: ${WORDS.endedEarly}</span>`), 'exit code 0 before the done line');

	const timeout = { status: 'timeout', stage: 'run', output: '' };
	assert.match(render(createElement(ExercisePanel, { check: doneCheck({ summary: timeout }) })), /The check did not finish: Time limit exceeded \(3 s\)/);
});

test('a check that finished still shows what the run wrote to stderr (a warning, a "command not found", the reader\'s own stderr)', () => {
	const results = { cases: [{ name: 'count', pass: true, got: '"0"', expected: '"0"' }], passed: 1, total: 1, otherOutput: '', finished: true };
	const response = { run: { stdout: '', stderr: './solution.sh: line 2: wc_not_a_command: command not found\n' } };
	const html = render(createElement(ExercisePanel, { check: doneCheck({ results, response }) }));
	assert.match(liveRegions(html)[1], /class="status statusSuccess"[\s\S]*<span>1\/1 passed<\/span>/, 'the check passed');
	assert.ok(html.includes(`<div class="blockTitle">${WORDS.errorOutputTitle}</div><pre class="blockBody" tabindex="0"><code>./solution.sh: line 2: wc_not_a_command: command not found\n</code></pre>`));
	const blank = render(createElement(ExercisePanel, { check: doneCheck({ results, response: { run: { stdout: '', stderr: '  \n' } } }) }));
	assert.doesNotMatch(blank, new RegExp(WORDS.errorOutputTitle), 'white space only: no block');
});

test('a verdict and a check result together: the output diff stays right under its verdict, before the check headline', () => {
	const comparison = { matches: false, firstDifferentLine: 1, diff: [{ type: 'removed', text: '1' }, { type: 'added', text: '2' }] };
	const html = render(createElement(ExercisePanel, { expectedOutput: '1\n', comparison, check: doneCheck({ results: TWO_CASES }) }));
	const [verdict, check] = liveRegions(html);
	assert.match(verdict, /Differs from line 1/);
	assert.match(check, /1\/2 passed/);
	const verdictAt = html.indexOf('Differs from line 1');
	const diffAt = html.indexOf('class="diff"');
	const headlineAt = html.indexOf('1/2 passed');
	assert.ok(verdictAt < diffAt && diffAt < headlineAt, 'verdict, its diff, then the check headline');
	assert.ok(html.indexOf('class="cases"') > headlineAt, 'the cases under their headline');
	assert.ok(html.endsWith(`${EXPECTED_BLOCK('1')}</div>`), 'the expected block stays last');
});

test('nothing reported: "Nothing was checked" in red', () => {
	const html = render(createElement(ExercisePanel, { check: doneCheck() }));
	assert.match(liveRegions(html)[1], new RegExp(`class="status statusFailure"[\\s\\S]*<span>${WORDS.noChecks}</span>`));
});

test('a failed request and a stopped wait: notices in the live region', () => {
	const failed = render(createElement(ExercisePanel, { check: doneCheck({ phase: 'failed', error: { message: 'Your session on this site has ended.' } }) }));
	assert.match(liveRegions(failed)[1], /MuiAlert-root[\s\S]*Your session on this site has ended\./);
	const noMessage = render(createElement(ExercisePanel, { check: doneCheck({ phase: 'failed', error: null }) }));
	assert.match(noMessage, new RegExp(WORDS.checkFailed.replace('.', '\\.')));
	const stopped = render(createElement(ExercisePanel, { check: doneCheck({ phase: 'stopped' }) }));
	assert.match(liveRegions(stopped)[1], /MuiAlert-standardInfo|MuiAlert-outlinedInfo|MuiAlert-colorInfo/);
	assert.ok(stopped.includes('Stopped waiting for the check.'));
	for (const [name, html] of [['failed', failed], ['failed without a message', noMessage], ['stopped', stopped]]) {
		assert.doesNotMatch(html, /role="alert"/, `${name}: no role="alert" (it would interrupt, and be read twice inside the polite region)`);
	}
});

test('after a switch to another language, the check\'s headline starts with the language it ran in', () => {
	const results = { cases: [{ name: 'a', pass: true }, { name: 'b', pass: false, got: '1', expected: '2' }], passed: 1, total: 2, otherOutput: '', finished: true };
	const switched = render(createElement(ExercisePanel, { check: doneCheck({ results, checkedIn: 'Python' }) }));
	assert.match(liveRegions(switched)[1], /class="status statusFailure"[\s\S]*<span>Python · 1\/2 passed<\/span>/);
	const same = render(createElement(ExercisePanel, { check: doneCheck({ results, checkedIn: null }) }));
	assert.match(liveRegions(same)[1], /<span>1\/2 passed<\/span>/, 'the same language: no name');
	const unfinished = render(createElement(ExercisePanel, { check: doneCheck({ summary: { status: 'compile-error', stage: 'compile', output: 'x', exitCode: 1 }, checkedIn: 'C' }) }));
	assert.match(liveRegions(unfinished)[1], /<span>C · The check did not finish: Compile error \(exit code 1\)<\/span>/);
	const waiting = render(createElement(ExercisePanel, { check: doneCheck({ phase: 'running', summary: null, results: null, checkedIn: 'Go' }) }));
	assert.equal(liveRegions(waiting)[1], `<p class="hint">${WORDS.checkingIn('Go')}</p>`);
	assert.equal(WORDS.checkingIn('Go'), 'Checking your Go code…');
});

/** The library's exercise module (compareOutput, parseCheckResults), or null where it is missing (the test then skips). */
async function loadExerciseLibrary() {
	try {
		return await import('../lib/codeRunner/exercise.js');
	} catch {
		return null;
	}
}

const exerciseLibrary = await loadExerciseLibrary();
const withLibrary = { skip: exerciseLibrary ? false : 'lib/codeRunner/exercise.js is not there' };

test("with the library's own functions: compareOutput's sides read as the panel says (− your output, + expected)", withLibrary, () => {
	const comparison = exerciseLibrary.compareOutput('1\n20\n3\n', '1\n2\n3\n');
	const html = render(createElement(ExercisePanel, { expectedOutput: '1\n2\n3\n', comparison }));
	assert.match(liveRegions(html)[0], /<span>Differs from line 2<\/span>/);
	assert.ok(html.includes('<li class="diffRow diffRowAdded"><span class="diffSign" aria-hidden="true">+</span><span class="visuallyHidden">Expected: </span><span>2</span>'), 'the expected line is the added (green) one');
	assert.ok(html.includes('<li class="diffRow diffRowRemoved"><span class="diffSign" aria-hidden="true">−</span><span class="visuallyHidden">Your output: </span><span>20</span>'), "the reader's line is the removed (red) one");
	const same = exerciseLibrary.compareOutput('1\n2\n', '1\n2\n\n');
	assert.match(liveRegions(render(createElement(ExercisePanel, { expectedOutput: '1\n2\n', comparison: same })))[0], /Matches the expected output/);
});

test("with the library's own functions: parseCheckResults feeds the check results as it is", withLibrary, () => {
	const marker = '@@check@@';
	const stdout = [
		`${marker} {"name":"sum(1, 2)","pass":true,"got":"3","expected":"3"}`,
		'debug: hello',
		`${marker} {"name":"sum(2, 2)","pass":false,"got":"5","expected":"4"}`,
		`${marker} {"done":true}`,
		'',
	].join('\n');
	const results = exerciseLibrary.parseCheckResults(stdout);
	const html = render(createElement(ExercisePanel, { check: doneCheck({ results, response: { run: { stdout, stderr: '' } } }) }));
	assert.match(liveRegions(html)[1], /class="status statusFailure"[\s\S]*<span>1\/2 passed<\/span>/);
	assert.match(html, /<span class="caseName">sum\(2, 2\)<\/span><\/span><dl class="caseValues"><dt>Expected<\/dt><dd>4<\/dd><dt>Got<\/dt><dd>5<\/dd><\/dl>/);
	assert.ok(html.includes('<code>debug: hello\n</code>'), 'the other output');
	const cut = exerciseLibrary.parseCheckResults(stdout.split('\n').slice(0, 1).join('\n'));
	const stopped = render(createElement(ExercisePanel, { check: doneCheck({ results: cut }) }));
	assert.match(liveRegions(stopped)[1], /The check did not finish/, 'no done line: not a pass, even with exit code 0');
});

/** The library's result module (summarizeResult), next to the exercise module. */
const resultLibrary = exerciseLibrary ? await import('../lib/codeRunner/result.js') : null;

/** The folder of the real check answers captured on a Piston server (B3, B4). */
const FIXTURES = path.join(FOLDER, 'lib/codeRunner/__tests__/fixtures');

/** The captured exercise answers (every .json of fixtures/exercise; [] when the folder is missing). */
function capturedCheckFiles() {
	try {
		return readdirSync(path.join(FIXTURES, 'exercise'))
			.filter((name) => name.endsWith('.json'))
			.map((name) => `exercise/${name}`);
	} catch {
		return [];
	}
}

/** A captured fixture ({ input, request, status, response }). */
function readFixture(relative) {
	return JSON.parse(readFileSync(path.join(FIXTURES, relative), 'utf8'));
}

const CAPTURED_CHECK_FILES = capturedCheckFiles();
const withFixtures = { skip: resultLibrary && CAPTURED_CHECK_FILES.length > 0 ? false : 'the library or its captured fixtures are not there' };

/** Text as renderToStaticMarkup writes it in an element. */
function escapeHtml(text) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

/** A string for new RegExp(), matching itself. */
function escapeRegExp(text) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The library's summary and results of a captured answer, read as CodeEditorClient.jsx reads a Check run. */
function readCaptured(fixture) {
	return {
		summary: resultLibrary.summarizeResult(fixture.response),
		results: exerciseLibrary.parseCheckResults(fixture.response.run?.stdout ?? ''),
	};
}

/** The panel's markup for a captured answer. */
function renderCaptured(fixture, extra = {}) {
	const { summary, results } = readCaptured(fixture);
	return render(createElement(ExercisePanel, { check: doneCheck({ summary, response: fixture.response, results, ...extra }) }));
}

/**
 * What the headline must say for a captured answer, written out from the header's rules (not
 * from the panel's helpers): { words, success }. The fixtures are re-captured from time to time,
 * so the expectations come from each answer, not from numbers written here.
 */
function expectedHeadline({ summary, results }) {
	switch (summary.status) {
		case 'compile-error':
			return { words: `The check did not finish: Compile error (exit code ${summary.exitCode})`, success: false };
		case 'runtime-error':
			return { words: `The check did not finish: Runtime error (exit code ${summary.exitCode})`, success: false };
		case 'success':
			if (!results.finished) return { words: `The check did not finish: ${WORDS.endedEarly}`, success: false };
			return { words: `${results.passed}/${results.total} passed`, success: results.total > 0 && results.passed === results.total };
		default:
			throw new Error(`a captured status this test does not know yet: ${summary.status}`);
	}
}

/** The error output a captured answer must show ('' = no block): the compiler's when compiling failed, else the run's stderr. */
function expectedErrorOutput(fixture, summary) {
	const text = summary.stage === 'compile' ? summary.output : fixture.response.run?.stderr ?? '';
	return text.trim() === '' ? '' : text;
}

test("every captured check answer: the library's summary and results drawn as the panel promises", withFixtures, () => {
	for (const file of CAPTURED_CHECK_FILES) {
		const fixture = readFixture(file);
		const { summary, results } = readCaptured(fixture);
		const html = renderCaptured(fixture);
		const headline = expectedHeadline({ summary, results });
		const look = headline.success ? 'statusSuccess' : 'statusFailure';
		assert.match(liveRegions(html)[1], new RegExp(`class="status ${look}"[\\s\\S]*<span>${escapeRegExp(escapeHtml(headline.words))}</span>`), file);
		assert.equal((html.match(/<li class="caseRow /g) ?? []).length, results.total, `${file}: one row per case that ran`);
		assert.equal((html.match(/<li class="caseRow caseFailed">/g) ?? []).length, results.total - results.passed, `${file}: the failing ones`);
		const errorOutput = expectedErrorOutput(fixture, summary);
		const errorBlock = `<div class="blockTitle">${WORDS.errorOutputTitle}</div><pre class="blockBody" tabindex="0"><code>${escapeHtml(errorOutput)}</code></pre>`;
		if (errorOutput) assert.ok(html.includes(errorBlock), `${file}: its error output, whole`);
		else assert.doesNotMatch(html, new RegExp(WORDS.errorOutputTitle), `${file}: no error block`);
		const otherBlock = `<div class="blockTitle">${WORDS.otherOutputTitle}</div><pre class="blockBody" tabindex="0"><code>${escapeHtml(results.otherOutput)}</code></pre>`;
		if (results.otherOutput.trim() !== '') assert.ok(html.includes(otherBlock), `${file}: the reader's prints`);
		else assert.doesNotMatch(html, new RegExp(WORDS.otherOutputTitle), `${file}: no other output`);
	}
});

test('captured answers cover the cases the panel draws differently: passing and failing cases, a crash, a compile error, stderr in a finished check', withFixtures, () => {
	const kinds = new Set();
	for (const file of CAPTURED_CHECK_FILES) {
		const fixture = readFixture(file);
		const { summary, results } = readCaptured(fixture);
		kinds.add(summary.status);
		if (results.passed > 0 && results.passed < results.total) kinds.add('some failing');
		if (summary.status === 'success' && expectedErrorOutput(fixture, summary)) kinds.add('stderr in a finished check');
	}
	for (const kind of ['success', 'runtime-error', 'compile-error', 'some failing', 'stderr in a finished check']) {
		assert.ok(kinds.has(kind), `a captured answer for: ${kind}`);
	}
});

test('captured TypeScript check: no type error, one case passed, then a throw: did not finish, with the stack', withFixtures, () => {
	const fixture = readFixture('typescript/typescript-check-throw.json');
	const { summary } = readCaptured(fixture);
	const typeCheck = { ok: fixture.typeCheckOk, errorCount: 0, diagnostics: [] };
	const html = renderCaptured(fixture, { typeCheck, readerCode: fixture.typescript, harness: fixture.harness });
	assert.equal(summary.status, 'runtime-error', 'the capture is a crash');
	assert.match(liveRegions(html)[1], new RegExp(`<span>The check did not finish: Runtime error \\(exit code ${summary.exitCode}\\)</span>`));
	assert.match(html, /<span class="caseName">adds<\/span>/);
	assert.ok(html.includes('RangeError: negative'));
	assert.doesNotMatch(html, /class="typeErrors"/, 'no type error: no list');
});

/** The hints the HintList tests use: the second holds inline code. */
const HINTS = Object.freeze(['Sort the list first.', 'Two pointers: `i` and `j`.', 'Stop when they meet.']);

/** The hints area's live region with `text` (what a reveal reads out). */
function hintStatus(text = '') {
	return `<span class="visuallyHidden" role="status">${text}</span>`;
}

/** One revealed hint's box, as HintList draws it in the area with DOM id `areaId`. */
function hintBox({ number, total = HINTS.length, text, folded = false, areaId = 'hints-1' }) {
	const eye = folded ? HINT_WORDS.unfold(number) : HINT_WORDS.fold(number);
	const textId = `${areaId}-text-${number}`;
	return (
		`<li class="hint"><div class="header"><span class="label">Hint ${number} of ${total}</span>` +
		`<button type="button" class="eye" aria-label="${eye}" title="${eye}" aria-expanded="${!folded}" aria-controls="${textId}">` +
		`<svg class="eyeIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${folded ? EYE_PATHS.show : EYE_PATHS.hide}"></path></svg></button></div>` +
		`<div id="${textId}" class="text"${folded ? ' hidden=""' : ''}>${text}</div></li>`
	);
}

/** The hints area drawn for `state`. */
function renderHints(state, hints = HINTS) {
	return render(createElement(HintList, { id: 'hints-1', hints, state, onRevealNext() {}, onToggleFold() {} }));
}

test('HintList closed: only its live region, empty — the area takes no space until the light bulb opens it', () => {
	assert.equal(renderHints(HINTS_START), `<div class="hints">${hintStatus()}</div>`);
	assert.equal(renderHints(undefined), `<div class="hints">${hintStatus()}</div>`, 'no state: the start state');
});

test('the light bulb\'s first open: hint 1 in its box (header row, eye, text), read out, and "Show hint 2 of 3" under it', () => {
	const html = renderHints(toggleHintsArea(HINTS_START, HINTS.length));
	assert.equal(
		html,
		`<div class="hints">${hintStatus('Hint 1 of 3: Sort the list first.')}` +
			`<div id="hints-1" class="area" role="group" aria-label="${HINT_WORDS.region}"><ol role="list" class="list">` +
			hintBox({ number: 1, text: 'Sort the list first.' }) +
			'</ol><button type="button" class="next">Show hint 2 of 3</button></div></div>',
	);
});

test('"Show hint N of M": hints stacked in order, the new one read out (inline code as plain words); no button once all are revealed', () => {
	const two = renderHints(revealNextHint(toggleHintsArea(HINTS_START, 3), 3));
	assert.ok(two.startsWith(`<div class="hints">${hintStatus('Hint 2 of 3: Two pointers: i and j.')}`));
	assert.ok(two.includes(hintBox({ number: 1, text: 'Sort the list first.' }) + hintBox({ number: 2, text: 'Two pointers: <code>i</code> and <code>j</code>.' })), 'hint 1 on top, inline code drawn as code');
	assert.match(two, /<\/ol><button type="button" class="next">Show hint 3 of 3<\/button><\/div><\/div>$/, 'the button under the last revealed hint');
	const all = renderHints(revealNextHint(revealNextHint(toggleHintsArea(HINTS_START, 3), 3), 3));
	assert.equal((all.match(/<li class="hint">/g) ?? []).length, 3);
	assert.doesNotMatch(all, /class="next"/, 'every hint revealed: the button is gone');
	assert.ok(all.includes(hintStatus('Hint 3 of 3: Stop when they meet.')));
	assert.equal(renderHints({ open: true, revealed: 9, folded: [], announce: 0 }).match(/<li /g).length, 3, 'never more than there are');
});

test("a hint's eye folds it to its header row (text hidden, the open eye that shows it again, \"Show hint 2\", aria-expanded false) and unfolds it", () => {
	const revealed = revealNextHint(toggleHintsArea(HINTS_START, 3), 3);
	const folded = toggleHintFold(revealed, 1, 3);
	const html = renderHints(folded);
	assert.ok(html.includes(hintBox({ number: 2, text: 'Two pointers: <code>i</code> and <code>j</code>.', folded: true })), 'folded: the text stays in the page (aria-controls names it) but hidden');
	assert.ok(html.includes(hintBox({ number: 1, text: 'Sort the list first.' })), 'the other hint is untouched');
	assert.match(html, /aria-label="Show hint 2" title="Show hint 2" aria-expanded="false"/);
	assert.ok(html.startsWith(`<div class="hints">${hintStatus()}`), 'hint 2 was the one read out: folding it empties the live region');
	const unfolded = renderHints(toggleHintFold(folded, 1, 3));
	assert.ok(unfolded.includes(hintBox({ number: 2, text: 'Two pointers: <code>i</code> and <code>j</code>.' })));
	assert.doesNotMatch(unfolded, /hidden=""/);
});

test('a close and a reopen: the area as it was (two revealed, hint 1 folded), and nothing new read out', () => {
	let state = revealNextHint(toggleHintsArea(HINTS_START, 3), 3);
	state = toggleHintFold(state, 0, 3);
	const closed = toggleHintsArea(state, 3);
	assert.equal(renderHints(closed), `<div class="hints">${hintStatus()}</div>`, 'closed: the whole area gone, the live region emptied');
	const reopened = renderHints(toggleHintsArea(closed, 3));
	assert.ok(reopened.startsWith(`<div class="hints">${hintStatus()}<div id="hints-1" class="area"`), 'reopened: the live region stays quiet');
	assert.ok(reopened.includes(hintBox({ number: 1, text: 'Sort the list first.', folded: true }) + hintBox({ number: 2, text: 'Two pointers: <code>i</code> and <code>j</code>.' })));
	assert.ok(reopened.includes('Show hint 3 of 3'));
});

test('HintList with one hint: no "Show hint" button; a `hints` that is not a list (or none) draws nothing', () => {
	const one = renderHints(toggleHintsArea(HINTS_START, 1), ['Add them.']);
	assert.ok(one.includes(hintBox({ number: 1, total: 1, text: 'Add them.' })));
	assert.doesNotMatch(one, /class="next"/);
	assert.equal(render(createElement(HintList, {})), '');
	assert.equal(render(createElement(HintList, { hints: 'Sort first.', state: { open: true, revealed: 1, folded: [], announce: 1 } })), '', 'not a list: nothing, no crash');
});

test('"Show hint N of M" keeps the keyboard focus: ONE element (no key, outside the list of hints), and its press asks focusAfterReveal where the focus goes', () => {
	const source = readFileSync(path.join(FOLDER, 'HintList.jsx'), 'utf8');
	const button = source.match(/<button[^>]*className=\{hintStyles\.next\}[^>]*>/);
	assert.ok(button, 'the "Show hint" button');
	assert.doesNotMatch(button[0], /\bkey=/, 'no key: React keeps the same element from one reveal to the next');
	const listEnd = source.indexOf('</ol>');
	assert.ok(listEnd !== -1 && source.indexOf(button[0]) > listEnd, 'after the list of hints, not inside its map()');
	const revealNext = source.match(/function revealNext\(\) \{([\s\S]*?)\n\t\}/)[1];
	assert.match(revealNext, /focusLastEyeRef\.current = focusAfterReveal\(view, total\) === FOCUS_AFTER_REVEAL\.lastEye;/, 'the decision is exerciseView.js > focusAfterReveal, from the state before the press');
	assert.match(source, /eyeRefs\.current\[view\.revealed - 1\]\?\.focus\(\)/, 'and the effect focuses the last revealed hint\'s eye');
});

test("hintAnnouncement: the hint a reveal brought, its inline code as plain words; '' when there is nothing to say", () => {
	assert.equal(hintAnnouncement(HINTS, { open: true, revealed: 2, folded: [], announce: 2 }), 'Hint 2 of 3: Two pointers: i and j.');
	assert.equal(hintAnnouncement(HINTS, { open: true, revealed: 2, folded: [], announce: 0 }), '');
	assert.equal(hintAnnouncement(HINTS, HINTS_START), '');
	assert.equal(hintAnnouncement(undefined, { open: true, revealed: 1, announce: 1 }), '');
});

test("the eye's icons say what a click does, path for path: MUI's VisibilityOff hides a shown hint, Visibility shows a folded one (the password-field convention, 2026-10-28)", () => {
	const muiPath = (name) => readFileSync(path.join(resolvePackage('@mui/icons-material'), `${name}.js`), 'utf8').match(/\bd: "([^"]+)"/)[1];
	assert.equal(EYE_PATHS.hide, muiPath('VisibilityOff'));
	assert.equal(EYE_PATHS.show, muiPath('Visibility'));
	// The mapping itself, so a swap back to "the icon shows the state" fails here.
	const shown = renderHints(revealNextHint(toggleHintsArea(HINTS_START, 3), 3));
	assert.ok(shown.includes(`aria-label="Hide hint 1" title="Hide hint 1" aria-expanded="true" aria-controls="hints-1-text-1"><svg class="eyeIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${EYE_PATHS.hide}"`), 'a shown hint: the crossed-out eye, named Hide');
	const folded = renderHints(toggleHintFold(revealNextHint(toggleHintsArea(HINTS_START, 3), 3), 0, 3));
	assert.ok(folded.includes(`aria-label="Show hint 1" title="Show hint 1" aria-expanded="false" aria-controls="hints-1-text-1"><svg class="eyeIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${EYE_PATHS.show}"`), 'a folded hint: the open eye, named Show');
});

const EDITOR_OPTIONS = buildMonacoOptions({}, { readOnly: false });

/** The Solution panel's props (Monaco is not needed on the server: effects do not run there). */
function solutionProps(overrides = {}) {
	return {
		id: 'solution-1',
		monaco: null,
		readerCode: 'def f(x):\n    return x\n',
		solution: 'def f(x):\n    return x * 2\n',
		language: 'python',
		theme: 'vs-dark',
		editorOptions: EDITOR_OPTIONS,
		onUse() {},
		onClose() {},
		...overrides,
	};
}

test("SolutionPanel's frame: a titled region, the colour key hidden from screen readers, the buttons, the diff box at its first height", () => {
	const props = solutionProps();
	const html = render(createElement(SolutionPanel, props));
	const labelledBy = html.match(/^<section id="solution-1" class="solution" aria-labelledby="([^"]+)">/)?.[1];
	assert.ok(labelledBy, 'a section with the given id, named by its title');
	assert.ok(html.includes(`<span id="${labelledBy}" class="title">${SOLUTION_WORDS.title}</span>`));
	assert.ok(html.includes('<span class="key" aria-hidden="true"><span class="keyItem"><span class="swatch swatchYours"></span>your code</span><span class="keyItem"><span class="swatch swatchSolution"></span>the solution</span></span>'));
	assert.match(html, /<button[^>]*MuiButton-contained[^>]*>Use this solution<\/button>/);
	assert.doesNotMatch(html.match(/<button[^>]*>Use this solution/)[0], /disabled/);
	assert.match(html, /<button[^>]*MuiButton-text[^>]*>Close<\/button>/);
	assert.doesNotMatch(html, /<span[^>]*tooltipAnchor[^>]*aria-label=/, 'the tooltip wrapper carries no aria-label');
	const height = estimateDiffHeight(props.readerCode, props.solution, EDITOR_OPTIONS);
	assert.ok(html.endsWith(`<div aria-live="polite"></div><div class="diffHost" style="height:${height}px"></div></section>`));
});

test("SolutionPanel's colour key follows the theme's diff: VS Code's as the stylesheet draws it, another theme's colours inline, high contrast outlined", () => {
	assert.deepEqual(keyStyleOf(diffKeyOf('vs-dark')), {}, "VS Code's: nothing inline, the stylesheet's key");
	const monokai = render(createElement(SolutionPanel, solutionProps({ theme: 'dwf-monokai' })));
	const key = diffKeyOf('dwf-monokai');
	assert.match(monokai, new RegExp(`^<section id="solution-1" class="solution" style="--sp-key-yours:${key.yours};--sp-key-solution:${key.solution}"`), "Monokai's own red and green on the panel");
	assert.ok(monokai.includes('<span class="key" aria-hidden="true">'), 'filled swatches');
	const highContrast = render(createElement(SolutionPanel, solutionProps({ theme: 'hc-black' })));
	assert.ok(highContrast.includes('<span class="key keyOutlined" aria-hidden="true">'), 'outlined swatches, as the high-contrast diff draws them');
	assert.match(highContrast, /style="--sp-key-yours:#ff008f;--sp-key-solution:#33ff2e"/);
});

test("SolutionPanel's buttons: light mode draws them in the theme's primary.dark (4.5:1 or more on the header grey); dark mode is left alone", () => {
	const light = createTheme({ palette: { mode: 'light', primary: { main: '#0b89d0' } } });
	const dark = createTheme({ palette: { mode: 'dark', primary: { main: '#48adf6' } } });
	assert.equal(light.palette.primary.dark, 'rgb(7, 95, 145)', "MUI's computed primary.dark: 6.2:1 on #f3f3f3, 6.9:1 under white");
	assert.deepEqual(LIGHT_PRIMARY_INK_SX.text(light), { '--variant-textColor': 'rgb(7, 95, 145)' });
	const contained = LIGHT_PRIMARY_INK_SX.contained(light);
	assert.equal(contained['--variant-containedBg'], 'rgb(7, 95, 145)');
	assert.equal(contained['@media (hover: hover)']['&:hover']['--variant-containedBg'], 'rgb(5, 76, 116)', 'darker still on hover');
	assert.deepEqual(LIGHT_PRIMARY_INK_SX.text(dark), {});
	assert.deepEqual(LIGHT_PRIMARY_INK_SX.contained(dark), {});
	const html = renderToStaticMarkup(createElement(ThemeProvider, { theme: light }, createElement(SolutionPanel, solutionProps())));
	assert.ok(html.includes('--variant-textColor:rgb(7, 95, 145)'), 'the Close button gets it');
	assert.ok(html.includes('--variant-containedBg:rgb(7, 95, 145)'), '"Use this solution" gets it');
});

test('SolutionPanel when the code already is the solution: a note, and "Use this solution" greyed out', () => {
	const html = render(createElement(SolutionPanel, solutionProps({ readerCode: 'x = 1\r\n', solution: 'x = 1' })));
	assert.ok(html.includes(`<div aria-live="polite"><p class="same">${SOLUTION_WORDS.same}</p></div>`));
	assert.match(html, /<button[^>]*disabled=""[^>]*>Use this solution<\/button>/);
});

test('SolutionPanel with an empty solution (none for this language): "Use this solution" greyed out, never emptying the editor', () => {
	for (const solution of ['', '  \n', undefined]) {
		const html = render(createElement(SolutionPanel, solutionProps({ solution })));
		assert.match(html, /<button[^>]*disabled=""[^>]*>Use this solution<\/button>/, JSON.stringify(solution));
		assert.ok(html.includes('<div aria-live="polite"></div>'), 'no "already the solution" note');
	}
	const blank = render(createElement(SolutionPanel, solutionProps({ readerCode: '', solution: '' })));
	assert.doesNotMatch(blank, new RegExp(SOLUTION_WORDS.same), 'an empty editor is not "the same as the solution"');
	assert.equal(SOLUTION_WORDS.emptyTooltip, 'There is no solution for this language');
});

/** The class names a CSS module defines (comments removed). */
function moduleClasses(file) {
	const css = readFileSync(path.join(FOLDER, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	return new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
}

/** The `<name>.<class>` accesses in these source files. */
function usedClasses(files, name) {
	const used = new Set();
	for (const file of files) {
		const source = readFileSync(path.join(FOLDER, file), 'utf8');
		for (const match of source.matchAll(new RegExp(`\\b${name}\\.(\\w+)`, 'g'))) used.add(match[1]);
	}
	return used;
}

const STYLESHEETS = Object.freeze([
	{ sheet: 'ExercisePanel.module.css', name: 'panelStyles', files: ['ExercisePanel.jsx', 'ExpectedOutput.jsx', 'DiffRows.jsx'] },
	{ sheet: 'SolutionPanel.module.css', name: 'solutionStyles', files: ['SolutionPanel.jsx'] },
	{ sheet: 'HintList.module.css', name: 'hintStyles', files: ['HintList.jsx'] },
]);

test('what the live regions show keeps a 0.5rem gap above it, strong enough to beat .status and .notice (margin 0)', () => {
	const css = readFileSync(path.join(FOLDER, 'ExercisePanel.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	assert.match(css, /\.exercise > \[aria-live\] > :first-child \{\s*margin-top: 0\.5rem;\s*\}/);
});

test('every CSS-module class the panels use is defined in their stylesheet, and every class there is used', () => {
	for (const { sheet, name, files } of STYLESHEETS) {
		const defined = moduleClasses(sheet);
		const used = usedClasses(files, name);
		assert.ok(used.size > 0, `${files.join(', ')} use ${name}`);
		for (const className of used) assert.ok(defined.has(className), `${name}.${className} is not defined in ${sheet}`);
		for (const className of defined) assert.ok(used.has(className), `${sheet} defines .${className}, which nothing uses`);
	}
});
