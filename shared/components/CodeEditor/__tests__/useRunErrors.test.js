/**
 * useRunErrors.test.js — the run-error rows' Go to line button (../useRunErrors.js), through the
 * REAL hook driven by ./reactHookShim.js (no renderer), with a REAL Piston answer
 * (lib/codeRunner/__tests__/fixtures/errors/python-3.11-index-error.json, an IndexError on line 2):
 *   - with a surface (the editor is up), a failed run's rows carry Go to line, and pressing it goes
 *     to the row's line on that surface;
 *   - with no surface (Monaco could not load after "Tap to edit", so the view drew no code), the
 *     rows stay but carry no Go to line: a button there could do nothing;
 *   - the button shows only while the language that ran is on screen (as before).
 * The rules of which locations show: runErrors.test.js. Run with `npm run test:shared`.
 * To change it: a new rule of the hook's rows gets a test here.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

register('./reactHookShim.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { useRunErrors } = await import('../useRunErrors.js');
const { sentRecord } = await import('../runErrors.js');
const { RUN_PHASES } = await import('../runPhases.js');
const { summarizeResult } = await import('../lib/codeRunner/result.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANSWER_FILE = path.resolve(HERE, '../lib/codeRunner/__tests__/fixtures/errors/python-3.11-index-error.json');

/** The captured answer, its summary and what the run sent. */
function failedRun() {
	const data = JSON.parse(readFileSync(ANSWER_FILE, 'utf8'));
	const sent = sentRecord({ language: 'python', code: data.request.files[0].content });
	return { phase: RUN_PHASES.done, summary: summarizeResult(data.response), response: data.response, sent };
}

/** No run yet (a check that never ran). */
const NOTHING = Object.freeze({ phase: RUN_PHASES.idle, summary: null, response: null, sent: null });

/** A surface that records where Go to line went (surface.js's contract, the parts the hook uses). */
function recordingSurface() {
	const went = [];
	return {
		went,
		markers: { clear() {}, begin: () => null, show() {}, watch: () => ({ dispose() {} }) },
		goTo: async (location) => {
			went.push(location.line);
		},
	};
}

/** The hook as the shell calls it; change `view.*`, then read `current`. */
function errorsHook(view) {
	return renderHook(() =>
		useRunErrors({
			settings: { hideErrors: false },
			surfaceRef: view.surfaceRef,
			surfaceReady: view.surfaceRef.current !== null,
			language: view.language,
			run: view.run,
			check: NOTHING,
		}),
	);
}

test('with a surface, a failed run\'s row carries Go to line, and it goes to that line', async () => {
	const surface = recordingSurface();
	const view = { surfaceRef: { current: surface }, language: 'python', run: failedRun() };
	const hook = errorsHook(view);
	const rows = hook.current.runRows;
	assert.equal(rows.locations.length, 1, 'the IndexError on line 2');
	assert.equal(typeof rows.onGoToLine, 'function');
	await rows.onGoToLine(rows.locations[0].line, rows.locations[0]);
	assert.deepEqual(surface.went, [2]);
	hook.unmount();
});

test('with no surface (Monaco could not load after the tap), the row stays but carries no Go to line', () => {
	const view = { surfaceRef: { current: null }, language: 'python', run: failedRun() };
	const hook = errorsHook(view);
	const rows = hook.current.runRows;
	assert.equal(rows.locations.length, 1, 'the row is still there: the traceback is still true');
	assert.equal(rows.onGoToLine, null, 'no button that does nothing');
	view.surfaceRef.current = recordingSurface();
	assert.equal(typeof hook.current.runRows.onGoToLine, 'function', 'the button comes back with the surface (the static view again)');
	hook.unmount();
});

test('Go to line shows only while the language that ran is on screen', () => {
	const view = { surfaceRef: { current: recordingSurface() }, language: 'javascript', run: failedRun() };
	const hook = errorsHook(view);
	assert.equal(hook.current.runRows.onGoToLine, null, 'another language is shown');
	view.language = 'python';
	assert.equal(typeof hook.current.runRows.onGoToLine, 'function');
	assert.equal(hook.current.checkRows.onGoToLine, null, 'no check ran');
	hook.unmount();
});
