/**
 * usePendingAction.test.js — an action kept until the editor can do it (../usePendingAction.js),
 * through the REAL hook driven by ./reactHookShim.js (no renderer):
 *   - nothing pending at first; a request is remembered while the editor is not ready, and the
 *     button can read it (`pending`);
 *   - once ready, the action runs exactly once (not again on a later render), and `pending` is
 *     cleared before it runs;
 *   - a request while already ready runs on the next render; the last request wins; a name
 *     outside PENDING_ACTIONS is ignored;
 *   - the `run` of the latest render is the one called (no stale closure);
 *   - an unmount drops a waiting request: nothing runs;
 *   - cancel() drops a waiting request (Monaco could not load after the tap): `pending` is null
 *     at once, and nothing runs, not even once the editor is ready.
 * Run with `npm run test:shared`.
 * To change it: a new pending action goes in PENDING_ACTIONS (../usePendingAction.js) and gets a test
 * here.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./reactHookShim.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { PENDING_ACTIONS, isPendingAction, usePendingAction } = await import('../usePendingAction.js');

/** The hook as the shell calls it: `view.ready` is the editor's readiness, `view.run` what runs (change them, then read `current`). */
function pendingHook(view) {
	return renderHook(() => {
		const pending = usePendingAction();
		pending.takeWhen(view.ready, view.run);
		return pending;
	});
}

/** A view whose runs are recorded in `calls`. */
function recordingView(ready) {
	const calls = [];
	return { calls, view: { ready, run: (name) => calls.push(name) } };
}

test('PENDING_ACTIONS: run and check; isPendingAction knows them', () => {
	assert.deepEqual(PENDING_ACTIONS, { run: 'run', check: 'check' });
	assert.equal(isPendingAction('run'), true);
	assert.equal(isPendingAction('check'), true);
	assert.equal(isPendingAction('fold'), false);
	assert.equal(isPendingAction(null), false);
});

test('a request while the editor is not ready is remembered, shown as `pending`, and runs nothing', () => {
	const { calls, view } = recordingView(false);
	const hook = pendingHook(view);
	assert.equal(hook.current.pending, null, 'nothing pending at first');
	hook.current.request(PENDING_ACTIONS.run);
	assert.equal(hook.current.pending, 'run', 'the button can show its loading reason');
	assert.equal(hook.current.pending, 'run', 'and keeps it across renders');
	assert.deepEqual(calls, []);
	hook.unmount();
});

test('once ready, the remembered action runs exactly once and `pending` is cleared', () => {
	const { calls, view } = recordingView(false);
	const hook = pendingHook(view);
	hook.current.request(PENDING_ACTIONS.check);
	view.ready = true;
	assert.equal(hook.current.pending, 'check', 'the render that sees ready=true: the effect runs after it');
	assert.deepEqual(calls, ['check'], 'the action ran');
	assert.equal(hook.current.pending, null, 'forgotten');
	assert.equal(hook.current.pending, null);
	assert.deepEqual(calls, ['check'], 'not again on later renders');
	hook.unmount();
});

test('a request while already ready runs on the next render; the last request wins', () => {
	const { calls, view } = recordingView(true);
	const hook = pendingHook(view);
	hook.current.request(PENDING_ACTIONS.run);
	hook.current; // eslint-disable-line no-unused-expressions -- the render whose effect runs it
	assert.deepEqual(calls, ['run']);
	const { request } = hook.current; // two requests in one event (one render), as two quick clicks would be
	request(PENDING_ACTIONS.run);
	request(PENDING_ACTIONS.check);
	hook.current; // eslint-disable-line no-unused-expressions
	assert.deepEqual(calls, ['run', 'check'], 'only the last request ran');
	hook.unmount();
});

test('a name outside PENDING_ACTIONS is ignored', () => {
	const { calls, view } = recordingView(true);
	const hook = pendingHook(view);
	hook.current.request('fold');
	assert.equal(hook.current.pending, null);
	assert.deepEqual(calls, []);
	hook.unmount();
});

test('the `run` of the latest render is called (the shell\'s closures over its surface are never stale)', () => {
	const { view } = recordingView(false);
	const first = [];
	const second = [];
	view.run = (name) => first.push(name);
	const hook = pendingHook(view);
	hook.current.request(PENDING_ACTIONS.run);
	view.run = (name) => second.push(name);
	view.ready = true;
	hook.current; // eslint-disable-line no-unused-expressions
	assert.deepEqual(first, []);
	assert.deepEqual(second, ['run']);
	hook.unmount();
});

test('an unmount drops a waiting request: nothing runs', () => {
	const { calls, view } = recordingView(false);
	const hook = pendingHook(view);
	hook.current.request(PENDING_ACTIONS.run);
	assert.equal(hook.current.pending, 'run');
	hook.unmount();
	assert.deepEqual(calls, []);
});

test('cancel drops a waiting request: `pending` is null at once, and nothing runs later', () => {
	const { calls, view } = recordingView(false);
	const hook = pendingHook(view);
	hook.current.request(PENDING_ACTIONS.run);
	assert.equal(hook.current.pending, 'run');
	hook.current.cancel();
	assert.equal(hook.current.pending, null, 'Run and Check leave their "loading" reason');
	view.ready = true;
	assert.equal(hook.current.pending, null);
	assert.deepEqual(calls, [], 'a cancelled run never runs');
	hook.current.request(PENDING_ACTIONS.check);
	assert.deepEqual(calls, [], 'the render that takes the request');
	hook.current; // eslint-disable-line no-unused-expressions -- the render whose effect runs it
	assert.deepEqual(calls, ['check'], 'a new request after a cancel works as before');
	hook.unmount();
});
