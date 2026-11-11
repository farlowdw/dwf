/**
 * useFleetingText.test.js — the hints' live-region text (../useFleetingText.js), through the REAL
 * hook driven by ./reactHookShim.js (no renderer) and node's mock timers:
 *   - a new text shows at once and goes after FLEETING_HOLD_MS (so a screen reader in browse mode
 *     does not meet a revealed hint a second time in the region);
 *   - a second text before the first one's hold ended shows at once, with a hold of its own;
 *   - '' schedules nothing, and an unmount clears a waiting timer;
 *   - HintList.jsx draws the region from this hook, not from the state directly.
 * Run with `npm run test:shared`.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

register('./reactHookShim.js', import.meta.url);

const { renderHook } = await import('./reactHookShim.js');
const { FLEETING_HOLD_MS, useFleetingText } = await import('../useFleetingText.js');

/** The hook with the text in `view.text` (change it, then read `current`). */
function fleetingHook(view, holdMs) {
	return renderHook(() => useFleetingText(view.text, holdMs));
}

test('FLEETING_HOLD_MS: long enough for a screen reader to pick the text up, short enough not to linger', () => {
	assert.ok(FLEETING_HOLD_MS >= 1500 && FLEETING_HOLD_MS <= 5000, `${FLEETING_HOLD_MS} ms`);
});

test('a new text shows at once, then goes once its hold has ended', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const view = { text: '' };
	const hook = fleetingHook(view, 1000);
	assert.equal(hook.current, '', 'nothing to say');
	view.text = 'Hint 1 of 3: Sort the list first.';
	assert.equal(hook.current, 'Hint 1 of 3: Sort the list first.', 'at once: the live region announces it');
	t.mock.timers.tick(999);
	assert.equal(hook.current, 'Hint 1 of 3: Sort the list first.', 'still held');
	t.mock.timers.tick(1);
	assert.equal(hook.current, '', 'held long enough: the region is empty again');
	assert.equal(hook.current, '', 'and stays empty');
	hook.unmount();
});

test('a second text before the first one\'s hold ended: shown at once, with a hold of its own', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const view = { text: 'Hint 1 of 3: one' };
	const hook = fleetingHook(view, 1000);
	t.mock.timers.tick(600);
	view.text = 'Hint 2 of 3: two';
	assert.equal(hook.current, 'Hint 2 of 3: two');
	t.mock.timers.tick(600);
	assert.equal(hook.current, 'Hint 2 of 3: two', "the first text's timer was cleared: it does not cut the second short");
	t.mock.timers.tick(400);
	assert.equal(hook.current, '');
	view.text = 'Hint 3 of 3: three';
	assert.equal(hook.current, 'Hint 3 of 3: three', 'a later reveal is announced again');
	hook.unmount();
});

test("'' at any time empties the region at once (a close, or a fold of that hint), and schedules nothing", (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const view = { text: 'Hint 2 of 3: two' };
	const hook = fleetingHook(view, 1000);
	view.text = '';
	assert.equal(hook.current, '');
	t.mock.timers.tick(5000);
	assert.equal(hook.current, '');
	hook.unmount();
});

test('an unmount clears a waiting timer (nothing is set on an unmounted component)', (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] });
	const cleared = [];
	const clearTimeoutBefore = globalThis.clearTimeout;
	globalThis.clearTimeout = (id) => {
		cleared.push(id);
		return clearTimeoutBefore(id);
	};
	try {
		const hook = fleetingHook({ text: 'Hint 1 of 1: one' }, 1000);
		hook.unmount();
		assert.equal(cleared.length, 1);
	} finally {
		globalThis.clearTimeout = clearTimeoutBefore;
	}
});

test("HintList.jsx draws its live region from useFleetingText, not from the state directly", () => {
	const source = readFileSync(new URL('../HintList.jsx', import.meta.url), 'utf8');
	assert.match(source, /import \{ useFleetingText \} from '\.\/useFleetingText\.js';/);
	assert.match(source, /const spoken = useFleetingText\(hintAnnouncement\(list, view\)\);/);
	assert.match(source, /role="status">\s*\{spoken\}\s*<\/span>/, 'the region shows the fleeting text');
});
