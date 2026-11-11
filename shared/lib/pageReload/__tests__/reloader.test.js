/**
 * reloader.test.js — the browser side of the after-a-deploy reload (../reloader.js), driven with
 * a fake window / document: nothing installed without a build id, the check interval, each
 * blocker (unsaved text through the `hasUnsavedWork` option, which a site's client module
 * passes, a focused text field — Monaco's EditContext <div> in Chrome included —, an open
 * dialog, an /api/ request or a code run in flight), the bounded retries, and the chunk-failure path with its
 * loop guard. Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new blocker or trigger in reloader.js gets a case here: fakePage() makes the page, and a
 *   new thing the page can hold is one more field of it. These tests pass the option themselves,
 *   so they cannot see a site whose client module drops it: that is a test of the site's own.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { startReloader } from '../reloader.js';
import { CHECK_INTERVAL_MS, CHUNK_RELOAD_KEY, OPEN_DIALOG_SELECTOR, WAIT_RETRY_LIMIT } from '../decide.js';

const ORIGIN = 'https://site.test';
const START = 1_800_000_000_000;

/**
 * A fake page: `live` is what /build-id.json answers; `api` holds the unresolved /api/ requests;
 * `dialog` true = an open dialog is in the page (what OPEN_DIALOG_SELECTOR finds); `unsaved`
 * true = an editor holds unsaved text (what the `hasUnsavedWork` option answers).
 */
function fakePage({ meta = 'old-1', live = 'new-2' } = {}) {
	const page = { clock: START, live, reloads: 0, timers: [], api: [], listeners: {}, session: new Map(), buildIdRequests: 0, dialog: false, unsaved: false };
	const on = (type, fn) => {
		(page.listeners[type] ??= []).push(fn);
	};
	page.doc = {
		visibilityState: 'visible',
		activeElement: { tagName: 'BODY' },
		querySelector: (selector) => {
			if (selector === OPEN_DIALOG_SELECTOR) return page.dialog ? { tagName: 'DIV' } : null;
			return meta === null ? null : { getAttribute: () => meta };
		},
		addEventListener: on,
	};
	page.originalFetch = async (url) => {
		if (String(url).startsWith('/build-id.json')) {
			page.buildIdRequests += 1;
			return page.live === null ? { ok: false } : { ok: true, json: async () => ({ buildId: page.live }) };
		}
		return new Promise((resolve) => page.api.push(resolve));
	};
	page.win = {
		fetch: page.originalFetch,
		location: { origin: ORIGIN, reload: () => { page.reloads += 1; } },
		addEventListener: on,
		setTimeout: (fn) => page.timers.push(fn),
		sessionStorage: { getItem: (key) => page.session.get(key) ?? null, setItem: (key, value) => page.session.set(key, value) },
	};
	page.now = () => page.clock;
	page.fire = async (type, event = {}) => {
		for (const fn of page.listeners[type] ?? []) fn(event);
		await settle();
	};
	page.runTimers = async () => {
		const due = page.timers;
		page.timers = [];
		due.forEach((fn) => fn());
		await settle();
	};
	page.start = () => startReloader({ win: page.win, doc: page.doc, now: page.now, hasUnsavedWork: () => page.unsaved });
	return page;
}

/** Let the awaited fetch / json promises finish. */
async function settle() {
	for (let round = 0; round < 5; round += 1) await Promise.resolve();
	await new Promise((resolve) => setImmediate(resolve));
}

test('no build id in the page (npm start): nothing is installed', () => {
	const page = fakePage({ meta: null });
	assert.equal(page.start(), null);
	assert.equal(page.win.fetch, page.originalFetch, 'fetch untouched');
	assert.deepEqual(page.listeners, {});
});

test('a newer build reloads on the next visible moment after the interval, not before', async () => {
	const page = fakePage();
	page.start();
	await page.fire('visibilitychange');
	assert.equal(page.buildIdRequests, 0, 'right after load: throttled');
	page.clock += CHECK_INTERVAL_MS;
	page.doc.visibilityState = 'hidden';
	await page.fire('visibilitychange');
	assert.equal(page.buildIdRequests, 0, 'hidden: no check');
	page.doc.visibilityState = 'visible';
	await page.fire('visibilitychange');
	assert.equal(page.buildIdRequests, 1);
	assert.equal(page.reloads, 1);
});

test('the same build, or an unreadable answer, never reloads', async () => {
	for (const live of ['old-1', null]) {
		const page = fakePage({ live });
		page.start();
		page.clock += CHECK_INTERVAL_MS;
		await page.fire('focus');
		assert.equal(page.buildIdRequests, 1);
		assert.equal(page.reloads, 0, `live ${live}`);
		assert.equal(page.timers.length, 0, 'nothing to wait for');
	}
});

test('each blocker delays the reload until it clears (unsaved text, an /api/ request, a focused field)', async () => {
	const page = fakePage();
	page.start();
	page.clock += CHECK_INTERVAL_MS;
	page.unsaved = true;
	await page.fire('visibilitychange');
	assert.equal(page.reloads, 0, 'unsaved text');
	assert.equal(page.timers.length, 1, 'a retry is scheduled');

	page.unsaved = false;
	const request = page.win.fetch('/api/notes/intro');
	await page.runTimers();
	assert.equal(page.reloads, 0, 'an /api/ request is running');
	page.api.forEach((resolve) => resolve({ ok: true }));
	await request;

	page.doc.activeElement = { tagName: 'TEXTAREA' };
	await page.runTimers();
	assert.equal(page.reloads, 0, 'a text field has focus');

	page.doc.activeElement = { tagName: 'BODY' };
	await page.runTimers();
	assert.equal(page.reloads, 1, 'reloads once everything is clear');
	assert.equal(page.buildIdRequests, 1, 'the known newer id is not asked for again');
});

test('a code run on its way holds the reload until its answer is in (a request to one of the site\'s functions)', async () => {
	const page = fakePage();
	const state = page.start();
	page.clock += CHECK_INTERVAL_MS;
	page.doc.activeElement = { tagName: 'BUTTON' };
	const run = page.win.fetch('/.netlify/functions/execute', { method: 'POST' });
	assert.equal(state.requestsInFlight, 1);
	await page.fire('visibilitychange');
	assert.equal(page.reloads, 0, 'the run is still on its way');
	assert.equal(page.timers.length, 1, 'a retry is scheduled');
	page.api.forEach((resolve) => resolve({ ok: true }));
	await run;
	await page.runTimers();
	assert.equal(page.reloads, 1, 'reloads once the answer is in');
});

test('a focused code editor in Chrome (an EditContext <div>, not contenteditable) waits like a text field', async () => {
	const page = fakePage();
	page.start();
	page.clock += CHECK_INTERVAL_MS;
	page.doc.activeElement = { tagName: 'DIV', isContentEditable: false, editContext: {} };
	await page.fire('focus');
	assert.equal(page.reloads, 0, 'the reader clicked into the editor: no reload under the cursor');
	assert.equal(page.timers.length, 1, 'a retry is scheduled');
	page.doc.activeElement = { tagName: 'BODY' };
	await page.runTimers();
	assert.equal(page.reloads, 1, 'reloads once the editor lost the focus');
});

test('a blocked reload retries WAIT_RETRY_LIMIT times, then waits for the next visible moment', async () => {
	const page = fakePage();
	page.start();
	page.clock += CHECK_INTERVAL_MS;
	page.unsaved = true;
	await page.fire('focus');
	let rounds = 0;
	while (page.timers.length > 0 && rounds < 100) {
		rounds += 1;
		await page.runTimers();
	}
	assert.equal(rounds, WAIT_RETRY_LIMIT);
	page.unsaved = false;
	await page.fire('visibilitychange');
	assert.equal(page.reloads, 1, 'no interval needed: the newer build is already known');
});

test('other fetches pass through untouched and are not counted', async () => {
	const page = fakePage();
	const state = page.start();
	page.win.fetch(`${ORIGIN}/api/images/01J`);
	assert.equal(state.requestsInFlight, 1);
	await page.win.fetch('/build-id.json');
	assert.equal(state.requestsInFlight, 1, 'not an /api/ request');
	page.api.forEach((resolve) => resolve({ ok: true }));
	await settle();
	assert.equal(state.requestsInFlight, 0);
});

test('a failed chunk: immediate check, reload only for a newer build, at most once a minute', async () => {
	const page = fakePage({ live: 'old-1' });
	page.start();
	await page.fire('error', { target: { tagName: 'SCRIPT', src: `${ORIGIN}/assets/js/123.abc.js` } });
	assert.equal(page.buildIdRequests, 1, 'checked at once, no interval');
	assert.equal(page.reloads, 0, 'same build: a network blip');

	page.live = 'new-2';
	await page.fire('error', { target: { tagName: 'IMG', src: `${ORIGIN}/assets/images/a.png` } });
	assert.equal(page.buildIdRequests, 1, 'an image is not a chunk');
	await page.fire('unhandledrejection', { reason: { name: 'ChunkLoadError', message: 'Loading chunk 1 failed.' } });
	assert.equal(page.reloads, 1);
	assert.equal(page.session.get(CHUNK_RELOAD_KEY), String(page.clock), 'the loop guard is stamped');

	const again = fakePage({ live: 'newer-3' });
	again.session = page.session; // the same tab after its reload (sessionStorage survives it)
	again.win.sessionStorage = page.win.sessionStorage;
	again.start();
	again.clock += 1000;
	await again.fire('error', { target: { tagName: 'SCRIPT', src: '/assets/js/9.js' } });
	assert.equal(again.buildIdRequests, 0, 'within a minute of the last chunk reload: no second one');
	assert.equal(again.reloads, 0);
});

test('an open dialog blocks the reload even without typed text (a read-only dialog, a picker); it reloads once the dialog closes', async () => {
	const page = fakePage();
	page.start();
	page.clock += CHECK_INTERVAL_MS;
	page.dialog = true;
	await page.fire('visibilitychange');
	assert.equal(page.reloads, 0, 'a dialog is open');
	await page.runTimers();
	assert.equal(page.reloads, 0, 'still open');
	page.dialog = false;
	await page.runTimers();
	assert.equal(page.reloads, 1, 'closed: reloaded');
});
