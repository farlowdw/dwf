/**
 * useExercise.test.js — the pure helpers of the exercise hook (../useExercise.js), loaded through
 * this folder's module hooks (jsxHooks.js compiles the .jsx files it reaches):
 *   - checkRunInput: a check sends the same input as Run — the Input field's text (or the page's
 *     `stdin` when the editor passes none) and the page's args — with the page's limits;
 *   - checkedInLabel: the checked language's name only when the editor now shows another one;
 *   - buttonsWhileChecking: Check (as Stop) stays while a check waits, even in a language
 *     without tests;
 *   - checkViewOf: ExercisePanel's `check` prop carries those results and `checkedIn`;
 *   - the hints area's state (2026-10-26), through the REAL hook driven by ./reactHookShim.js (no
 *     renderer, no Monaco: nothing here touches them): closed on every load, the light bulb's
 *     toggle, "Show hint N of M" and an eye wired to exerciseView.js; Reset and a language switch
 *     (made as CodeEditorClient.jsx makes it: the language, then followModel) leave the hints as
 *     they are — the shim runs an effect again when its dependencies change, so a reset keyed
 *     on the language would be caught; a close and a reopen keep them; an editor without hints
 *     has nothing to open;
 *   - the idle line's hint cue (hintCueFor, and the hook's hints.cue): every hint while the area
 *     is closed, 0 while it is open, 0 without hints.
 * Check's URL (2026-10-26): through the real hook with a recording fetch, a check posts to the
 * `executeUrl` the hook was given (the plugin's option, as Run does) and, without one, to the
 * library's default — a sibling site whose functions live elsewhere must get its checks there.
 * The rest of Check needs Monaco and a code runner: it is checked by hand (README.md > How to
 * change it). Run with `npm run test:shared`.
 * To change it: a new helper or hint state of ../useExercise.js gets a test here.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./jsxHooks.js', import.meta.url);
register('./reactHookShim.js', import.meta.url);

const { renderHook, useEffect: useEffectShim, useState: useStateShim } = await import('./reactHookShim.js');
const { buttonsWhileChecking, checkRunInput, checkViewOf, checkedInLabel, hintCueFor, useExercise } = await import('../useExercise.js');
const { HINTS_START } = await import('../exerciseView.js');
const { normalizeEditorProps } = await import('../props.js');
const { RUN_PHASES, useCodeRun } = await import('../useCodeRun.js');
const { EXECUTE_URL } = await import('../lib/codeRunner/client.js');

/** A Piston answer of a finished check with no cases (enough for the hook to accept it). */
const CHECK_ANSWER = Object.freeze({ language: 'python', version: '3.12.0', run: { stdout: '', stderr: '', code: 0, signal: null, output: '' } });

/** `globalThis.fetch` replaced for the test by one that records the URLs and answers CHECK_ANSWER. */
function recordingFetch(t) {
	const urls = [];
	const original = globalThis.fetch;
	globalThis.fetch = (url) => {
		urls.push(url);
		return Promise.resolve(new Response(JSON.stringify(CHECK_ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }));
	};
	t.after(() => {
		globalThis.fetch = original;
	});
	return urls;
}

/** A Python exercise with tests, its Run hook on `executeUrl`, and the real useExercise with that URL; `runCheck()` through a fake surface. */
function checkingHook(executeUrl) {
	const settings = normalizeEditorProps({ initialCode: 'x = 1', language: 'python', tests: 'check("x", x, 1)' });
	const codeRun = renderHook(() => useCodeRun(executeUrl)).current;
	const surfaceRef = { current: { getValue: () => 'x = 1', setValue() {}, focus() {} } };
	return renderHook(() =>
		useExercise({ settings, language: 'python', stdin: '', surfaceRef, monacoRef: { current: null }, runtime: { runLanguage: 'python', version: '3.12.0' }, codeRun, executeUrl, onSolutionUsed() {} }),
	);
}

/** The next turns of the event loop: a check's fetch has been sent by then. */
function settle() {
	return new Promise((resolve) => setTimeout(resolve, 20));
}

test("a check posts to the executeUrl the hook was given (the plugin's option, where Run goes); without one, to the library's default", async (t) => {
	const urls = recordingFetch(t);
	const configured = checkingHook('/api/run');
	assert.equal(configured.current.buttons.check, true, 'the exercise has a Check button');
	configured.current.runCheck();
	await settle();
	assert.deepEqual(urls, ['/api/run'], "a sibling site's checks go to its own function, not to the default path");
	configured.unmount();
	const plain = checkingHook(undefined);
	plain.current.runCheck();
	await settle();
	assert.deepEqual(urls, ['/api/run', EXECUTE_URL], "no option: the library's default, as before");
	plain.unmount();
});

/** The settings fields the helpers read (props.js > normalizeEditorProps gives the real ones). */
const SETTINGS = Object.freeze({ stdin: '3\n1 2 3\n', args: ['--verbose'], limits: { runTimeout: 2000 } });

test('checkRunInput: the Input field\'s text and the page\'s args, as Run sends them, with the page\'s limits', () => {
	assert.deepEqual(checkRunInput({ settings: SETTINGS, stdin: '5\n' }), { stdin: '5\n', args: ['--verbose'], limits: { runTimeout: 2000 } });
	assert.equal(checkRunInput({ settings: SETTINGS, stdin: '' }).stdin, '', 'an emptied field is sent empty, as Run would');
	assert.equal(checkRunInput({ settings: SETTINGS }).stdin, '3\n1 2 3\n', "no stdin passed: the page's own");
	assert.equal(checkRunInput({ settings: { args: [], limits: {} } }).stdin, '', 'neither: empty');
});

test('checkedInLabel: the name of the language the check ran in, only when another language is on screen', () => {
	assert.equal(checkedInLabel('python', 'c'), 'Python');
	assert.equal(checkedInLabel('typescript', 'javascript'), 'TypeScript', "the editor's language, not the runtime's (TypeScript runs on Node)");
	assert.equal(checkedInLabel('python', 'py'), null, 'the same language under another name');
	assert.equal(checkedInLabel('c++', 'cpp'), null);
	assert.equal(checkedInLabel(null, 'python'), null, 'no check yet');
});

test('buttonsWhileChecking: Check stays (as Stop) while a check waits; otherwise the buttons as they are', () => {
	const noTests = Object.freeze({ hint: true, solution: false, check: false });
	assert.deepEqual(buttonsWhileChecking(noTests, true), { hint: true, solution: false, check: true });
	assert.equal(buttonsWhileChecking(noTests, false), noTests, 'not checking: the same object');
	const withTests = Object.freeze({ hint: false, solution: true, check: true });
	assert.equal(buttonsWhileChecking(withTests, true), withTests);
});

test('checkViewOf: the run, its parsed results, what it was sent with, and checkedIn', () => {
	const checkRun = { phase: 'done', error: null, summary: { status: 'success' }, response: { run: { stdout: '' } } };
	const results = { cases: [], passed: 0, total: 0, otherOutput: '', finished: true };
	const lastCheck = { language: 'python', typeCheck: null, readerCode: 'x = 1', harness: 'check("x", x, 1)', limits: { runTimeout: 3000 } };
	const view = checkViewOf({ checkRun, results, lastCheck, language: 'go' });
	assert.deepEqual(view, {
		phase: 'done',
		error: null,
		summary: { status: 'success' },
		response: { run: { stdout: '' } },
		results,
		typeCheck: null,
		readerCode: 'x = 1',
		harness: 'check("x", x, 1)',
		limits: { runTimeout: 3000 },
		checkedIn: 'Python',
	});
	assert.equal(checkViewOf({ checkRun, results, lastCheck, language: 'python' }).checkedIn, null);
});

/**
 * The real useExercise for these props, as CodeEditorClient.jsx calls it before Monaco is up;
 * `view.language` is the language on screen (change it, then read `current`: a language switch).
 */
function exerciseHook(props, view = { language: 'python' }) {
	const settings = normalizeEditorProps(props);
	const codeRun = { phase: RUN_PHASES.idle, response: null, summary: null };
	const refs = { surfaceRef: { current: null }, monacoRef: { current: null } };
	return renderHook(() =>
		useExercise({ settings, language: view.language, stdin: '', ...refs, runtime: { runLanguage: view.language, version: '*' }, codeRun, onSolutionUsed() {} }),
	);
}

const THREE_HINTS = Object.freeze({ initialCode: { python: 'x = 1', javascript: 'let x = 1;' }, hints: ['One.', 'Two.', 'Three.'] });

test('the hints area starts closed on every load, with a DOM id for the light bulb to name', () => {
	const hook = exerciseHook(THREE_HINTS);
	const { hints, buttons } = hook.current;
	assert.equal(buttons.hint, true);
	assert.deepEqual(hints.list, ['One.', 'Two.', 'Three.']);
	assert.deepEqual(hints.state, HINTS_START);
	assert.equal(typeof hints.areaId, 'string');
	assert.equal(exerciseHook(THREE_HINTS).current.hints.areaId !== hints.areaId, true, 'each editor its own id');
	hook.unmount();
});

test('the light bulb, "Show hint N of M" and an eye change the state; a close and a reopen keep it', () => {
	const hook = exerciseHook(THREE_HINTS);
	hook.current.hints.toggle();
	assert.deepEqual(hook.current.hints.state, { open: true, revealed: 1, folded: [], announce: 1 }, 'the first open reveals hint 1');
	hook.current.hints.revealNext();
	hook.current.hints.toggleFold(0);
	assert.deepEqual(hook.current.hints.state, { open: true, revealed: 2, folded: [0], announce: 2 });
	hook.current.hints.toggle();
	assert.deepEqual(hook.current.hints.state, { open: false, revealed: 2, folded: [0], announce: 0 }, 'closed, kept');
	hook.current.hints.toggle();
	assert.deepEqual(hook.current.hints.state, { open: true, revealed: 2, folded: [0], announce: 0 }, 'reopened as it was');
	hook.unmount();
});

/** A language switch as CodeEditorClient.jsx makes it: the language on screen changes, then handleModelShown calls followModel with the surface's text. */
function switchLanguage(hook, view, language, code) {
	view.language = language;
	hook.current.followModel(language, code);
}

test('Reset and a language switch leave the hints as they are', () => {
	const view = { language: 'python' };
	const hook = exerciseHook(THREE_HINTS, view);
	hook.current.hints.toggle();
	hook.current.hints.revealNext();
	hook.current.hints.toggleFold(1);
	const before = hook.current.hints.state;
	hook.current.reset();
	assert.deepEqual(hook.current.hints.state, before, 'Reset (the code): the hints stay');
	assert.deepEqual(hook.current.hints.state, before, 'and on the render after (an effect or a render-time reset would show here)');
	switchLanguage(hook, view, 'javascript', 'let x = 1;');
	assert.deepEqual(hook.current.hints.state, before, 'another language: the same hints, as they were');
	assert.deepEqual(hook.current.hints.state, before, 'and on the render after the switch');
	assert.equal(hook.current.buttons.hint, true, 'and the light bulb with them');
	switchLanguage(hook, view, 'python', 'x = 1');
	hook.current.reset();
	assert.deepEqual(hook.current.hints.state, before, 'back to the first language, then Reset: still as they were');
	assert.deepEqual(hook.current.hints.state, before);
	hook.unmount();
});

test('the shim runs an effect again when its dependencies change (what lets the test above catch a reset keyed on the language)', () => {
	const view = { language: 'python' };
	const runs = [];
	const hook = renderHook(() => {
		const [state, setState] = useStateShim('kept');
		useEffectShim(() => {
			runs.push(view.language);
			if (view.language !== 'python') setState('reset');
		}, [view.language]);
		return state;
	});
	assert.deepEqual(runs, ['python'], 'after the first render');
	assert.equal(hook.current, 'kept', 'the same dependencies: not run again');
	view.language = 'javascript';
	hook.current;
	assert.deepEqual(runs, ['python', 'javascript'], 'another language: run again');
	assert.equal(hook.current, 'reset', 'what it set shows on the next read');
	hook.unmount();
});

test('an editor without hints: no light bulb, and nothing to open', () => {
	const hook = exerciseHook({ initialCode: 'x = 1' });
	assert.equal(hook.current.buttons.hint, false);
	hook.current.hints.toggle();
	assert.deepEqual(hook.current.hints.state, HINTS_START);
	hook.unmount();
});

test('hintCueFor: every hint while the light bulb is there and the area is closed; 0 (no cue) otherwise', () => {
	assert.equal(hintCueFor({ hasBulb: true, open: false, total: 3 }), 3);
	assert.equal(hintCueFor({ hasBulb: true, open: false, total: 1 }), 1);
	assert.equal(hintCueFor({ hasBulb: true, open: true, total: 3 }), 0, 'open: the hints are on screen');
	assert.equal(hintCueFor({ hasBulb: false, open: false, total: 0 }), 0, 'no light bulb: no cue');
});

test("the hook's hints.cue: 3 while closed, 0 while open, 3 again after a close; 0 for an editor without hints", () => {
	const view = { language: 'python' };
	const hook = exerciseHook(THREE_HINTS, view);
	assert.equal(hook.current.hints.cue, 3, 'on load: closed');
	hook.current.hints.toggle();
	assert.equal(hook.current.hints.cue, 0, 'opened: the cue goes');
	hook.current.hints.revealNext();
	assert.equal(hook.current.hints.cue, 0, 'still open');
	hook.current.hints.toggle();
	assert.equal(hook.current.hints.cue, 3, 'closed again: the cue is back, naming every hint (not just the hidden ones)');
	switchLanguage(hook, view, 'javascript', 'let x = 1;');
	hook.current.reset();
	assert.equal(hook.current.hints.cue, 3, 'a language switch and Reset leave it');
	hook.unmount();
	const plain = exerciseHook({ initialCode: 'x = 1' });
	assert.equal(plain.current.hints.cue, 0);
	plain.current.hints.toggle();
	assert.equal(plain.current.hints.cue, 0);
	plain.unmount();
});
