/**
 * drafts.test.js — the reader's saved drafts (../drafts.js), over a fake localStorage: the
 * snippet hash (FNV-1a's published values), the key (page, editor, language, snippet; a trailing
 * slash ignored; `|` and `%` escaped), a save and a load, a draft equal to the snippet (never a
 * draft), the size cap (the older draft removed), a changed snippet (the old draft never loads
 * and is removed, other drafts stay — neighbours whose names merely start the same, and the
 * drafts of OTHER id-less editors on the page, included), stored values that are not drafts, a
 * storage that refuses every way it can (a full quota removes the older draft; no storage at
 * all, as in node), the debounced saver (the last code wins, flush, another language, discard,
 * Reset's own change event, no storage) and the page-hide flush. Run with `npm run test:shared`.
 * To change it: a new rule of ../drafts.js (the key, the cap, a storage that refuses) gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_EDITOR_KEY,
	DRAFT_KEY_PREFIX,
	DRAFT_RESULTS,
	MAX_DRAFT_CHARS,
	SAVE_DELAY_MS,
	WORDS,
	browserStorage,
	clearDraft,
	createDraftSaver,
	draftKey,
	dropStaleDrafts,
	fnv1a,
	flushOnPageHide,
	loadDraft,
	saveDraft,
} from '../drafts.js';

const SNIPPET = 'def two_sum(nums, target):\n    pass\n';

/** Where a draft of the two-sum example lives. */
const WHERE = Object.freeze({ path: '/site-guide', editorKey: 'two-sum', language: 'python', snippet: SNIPPET });

/** A fixed clock. */
const NOW = 1_761_400_000_000;
const now = () => NOW;

/** An error like the browser's, with its name. */
function domError(name) {
	return Object.assign(new Error(name), { name });
}

/**
 * localStorage over a Map: getItem, setItem, removeItem, key(index), length. `refuse` lists the
 * methods that throw (a SecurityError; setItem a QuotaExceededError, as a full quota does).
 */
function fakeStorage(entries = {}, { refuse = [] } = {}) {
	const map = new Map(Object.entries(entries));
	const refuses = (method) => refuse.includes(method);
	return {
		map,
		get length() {
			if (refuses('length')) throw domError('SecurityError');
			return map.size;
		},
		key(index) {
			if (refuses('key')) throw domError('SecurityError');
			return [...map.keys()][index] ?? null;
		},
		getItem(key) {
			if (refuses('getItem')) throw domError('SecurityError');
			return map.has(key) ? map.get(key) : null;
		},
		setItem(key, value) {
			if (refuses('setItem')) throw domError('QuotaExceededError');
			map.set(key, String(value));
		},
		removeItem(key) {
			if (refuses('removeItem')) throw domError('SecurityError');
			map.delete(key);
		},
	};
}

/** A stored draft value, as saveDraft writes it. */
function stored(code, savedAt = NOW) {
	return JSON.stringify({ code, savedAt });
}

/** Fake setTimeout / clearTimeout: run() fires the waiting callbacks. */
function fakeTimers() {
	const waiting = new Map();
	let nextId = 1;
	return {
		delays: [],
		setTimer(callback, ms) {
			const id = nextId++;
			waiting.set(id, callback);
			this.delays.push(ms);
			return id;
		},
		clearTimer(id) {
			waiting.delete(id);
		},
		run() {
			const callbacks = [...waiting.values()];
			waiting.clear();
			for (const callback of callbacks) callback();
		},
		waitingCount() {
			return waiting.size;
		},
	};
}

test('fnv1a: FNV-1a 32 over UTF-8 bytes, as 8 hex digits (the published test values)', () => {
	assert.equal(fnv1a(''), '811c9dc5');
	assert.equal(fnv1a('a'), 'e40c292c');
	assert.equal(fnv1a('foobar'), 'bf9cf968');
	assert.equal(fnv1a('é'), '1e9de8c1', 'two UTF-8 bytes, not one UTF-16 unit');
	for (const text of ['', 'x', SNIPPET, 'z'.repeat(5000)]) assert.match(fnv1a(text), /^[0-9a-f]{8}$/);
});

test('draftKey: prefix, page, editor, language and the snippet hash, readable', () => {
	assert.equal(draftKey(WHERE), `${DRAFT_KEY_PREFIX}|/site-guide|two-sum|python|${fnv1a(SNIPPET)}`);
});

test('draftKey: a trailing slash is ignored; no path is the root; no editorKey is the default', () => {
	assert.equal(draftKey({ ...WHERE, path: '/site-guide/' }), draftKey(WHERE));
	assert.equal(draftKey({ ...WHERE, path: '' }), draftKey({ ...WHERE, path: '/' }));
	assert.equal(draftKey({ ...WHERE, path: undefined }), draftKey({ ...WHERE, path: '/' }));
	assert.ok(draftKey({ ...WHERE, editorKey: undefined }).includes(`|${DEFAULT_EDITOR_KEY}|python|`));
	assert.equal(draftKey({ ...WHERE, editorKey: '' }), draftKey({ ...WHERE, editorKey: undefined }));
});

test('draftKey: `|` and `%` in a part are escaped, so no part runs into the next', () => {
	const tricky = draftKey({ ...WHERE, editorKey: 'a|b%c' });
	assert.ok(tricky.includes('|a%7Cb%25c|python|'), tricky);
	assert.notEqual(draftKey({ ...WHERE, path: '/x|y', editorKey: 'z' }), draftKey({ ...WHERE, path: '/x', editorKey: 'y|z' }));
});

test('draftKey: another snippet, language, editor or page is another key', () => {
	const keys = new Set([
		draftKey(WHERE),
		draftKey({ ...WHERE, snippet: `${SNIPPET}# changed\n` }),
		draftKey({ ...WHERE, language: 'javascript' }),
		draftKey({ ...WHERE, editorKey: 'other' }),
		draftKey({ ...WHERE, path: '/blog/post' }),
	]);
	assert.equal(keys.size, 5);
});

test('saveDraft then loadDraft: the code comes back with when it was saved', () => {
	const storage = fakeStorage();
	assert.equal(saveDraft(WHERE, 'print(42)\n', { storage, now }), DRAFT_RESULTS.saved);
	assert.deepEqual(JSON.parse(storage.map.get(draftKey(WHERE))), { code: 'print(42)\n', savedAt: NOW });
	assert.deepEqual(loadDraft(WHERE, { storage }), { code: 'print(42)\n', savedAt: NOW });
});

test('an empty editor is a draft too (the reader cleared it)', () => {
	const storage = fakeStorage();
	assert.equal(saveDraft(WHERE, '', { storage, now }), DRAFT_RESULTS.saved);
	assert.deepEqual(loadDraft(WHERE, { storage }), { code: '', savedAt: NOW });
});

test('code equal to the snippet is not a draft: saving it removes the stored one', () => {
	const storage = fakeStorage({ [draftKey(WHERE)]: stored('print(1)') });
	assert.equal(saveDraft(WHERE, SNIPPET, { storage, now }), DRAFT_RESULTS.cleared);
	assert.equal(storage.map.size, 0);
	assert.equal(loadDraft(WHERE, { storage }), null);
});

test('a stored draft equal to the snippet loads as nothing and is removed', () => {
	const storage = fakeStorage({ [draftKey(WHERE)]: stored(SNIPPET) });
	assert.equal(loadDraft(WHERE, { storage }), null);
	assert.equal(storage.map.size, 0);
});

test('the size cap: MAX_DRAFT_CHARS is kept; one more is not saved and removes the older draft', () => {
	const storage = fakeStorage();
	const atCap = 'x'.repeat(MAX_DRAFT_CHARS);
	assert.equal(saveDraft(WHERE, atCap, { storage, now }), DRAFT_RESULTS.saved);
	assert.equal(loadDraft(WHERE, { storage }).code.length, MAX_DRAFT_CHARS);
	assert.equal(saveDraft(WHERE, `${atCap}y`, { storage, now }), DRAFT_RESULTS.tooLarge);
	assert.equal(loadDraft(WHERE, { storage }), null, 'never code older than what the reader last saw');
	assert.equal(storage.map.size, 0);
});

test('a changed snippet: the old draft never loads, and loading removes it (other drafts stay)', () => {
	const changed = { ...WHERE, snippet: `${SNIPPET}# a new line\n` };
	const keep = {
		otherLanguage: draftKey({ ...WHERE, language: 'javascript' }),
		otherEditor: draftKey({ ...WHERE, editorKey: 'three-sum' }),
		otherPage: draftKey({ ...WHERE, path: '/blog/post' }),
		unrelated: 'theme',
	};
	const storage = fakeStorage({
		[draftKey(WHERE)]: stored('the old draft'),
		[keep.otherLanguage]: stored('js'),
		[keep.otherEditor]: stored('three'),
		[keep.otherPage]: stored('blog'),
		[keep.unrelated]: 'dark',
	});
	assert.equal(loadDraft(changed, { storage }), null);
	assert.equal(storage.map.has(draftKey(WHERE)), false, 'the stale draft is gone');
	assert.deepEqual([...storage.map.keys()].sort(), Object.values(keep).sort());
});

test('a changed snippet never touches a neighbour whose id, page or language merely starts the same', () => {
	const changed = { ...WHERE, snippet: `${SNIPPET}# changed\n` };
	const neighbours = [
		draftKey({ ...WHERE, editorKey: 'two-sum-2' }),
		draftKey({ ...WHERE, path: '/site-guide-2' }),
		draftKey({ ...WHERE, path: '/site-guide/more' }),
		draftKey({ ...WHERE, language: 'python3' }),
		draftKey({ ...WHERE, editorKey: 'two', path: '/site-guide' }),
	];
	const storage = fakeStorage(Object.fromEntries(neighbours.map((key) => [key, stored('mine')])));
	assert.equal(dropStaleDrafts(changed, { storage }), 0);
	assert.deepEqual([...storage.map.keys()].sort(), [...neighbours].sort());
});

test('without an id, drafts for other snippets are other editors\' and stay (two id-less editors on one page)', () => {
	const first = { path: '/site-guide', language: 'python', snippet: 'print(1)\n' };
	const second = { path: '/site-guide', language: 'python', snippet: 'print(2)\n' };
	const storage = fakeStorage();
	assert.equal(saveDraft(first, 'first edits', { storage, now }), DRAFT_RESULTS.saved);
	assert.equal(saveDraft(second, 'second edits', { storage, now }), DRAFT_RESULTS.saved);
	assert.equal(dropStaleDrafts(first, { storage }), 0);
	assert.equal(loadDraft(first, { storage }).code, 'first edits');
	assert.equal(loadDraft(second, { storage }).code, 'second edits', 'the first editor\'s load did not remove it');
	assert.equal(loadDraft(first, { storage }).code, 'first edits', 'nor the second\'s the first');
});

test('dropStaleDrafts keeps the current draft and counts what it removed', () => {
	const storage = fakeStorage({
		[draftKey(WHERE)]: stored('current'),
		[draftKey({ ...WHERE, snippet: 'old 1' })]: stored('a'),
		[draftKey({ ...WHERE, snippet: 'old 2' })]: stored('b'),
	});
	assert.equal(dropStaleDrafts(WHERE, { storage }), 2);
	assert.deepEqual([...storage.map.keys()], [draftKey(WHERE)]);
	assert.equal(dropStaleDrafts(WHERE, { storage }), 0);
});

test('a stored value that is not a draft loads as nothing and is removed', () => {
	for (const raw of ['not json', 'null', '42', JSON.stringify({ text: 'x' }), JSON.stringify({ code: 7 }), stored('x'.repeat(MAX_DRAFT_CHARS + 1))]) {
		const storage = fakeStorage({ [draftKey(WHERE)]: raw });
		assert.equal(loadDraft(WHERE, { storage }), null, raw.slice(0, 30));
		assert.equal(storage.map.size, 0, raw.slice(0, 30));
	}
});

test('a draft without a usable savedAt still loads (savedAt null)', () => {
	const storage = fakeStorage({ [draftKey(WHERE)]: JSON.stringify({ code: 'print(2)' }) });
	assert.deepEqual(loadDraft(WHERE, { storage }), { code: 'print(2)', savedAt: null });
});

test('clearDraft removes the draft and says so', () => {
	const storage = fakeStorage({ [draftKey(WHERE)]: stored('print(3)') });
	assert.equal(clearDraft(WHERE, { storage }), true);
	assert.equal(storage.map.size, 0);
	assert.equal(clearDraft(WHERE, { storage }), true, 'nothing left is fine');
});

test('a storage that refuses: nothing throws, every function says what happened', () => {
	const key = draftKey(WHERE);
	assert.equal(loadDraft(WHERE, { storage: fakeStorage({ [key]: stored('x') }, { refuse: ['getItem'] }) }), null);
	const full = fakeStorage({ [key]: stored('older') }, { refuse: ['setItem'] });
	assert.equal(saveDraft(WHERE, 'x', { storage: full, now }), DRAFT_RESULTS.failed, 'a full quota');
	assert.equal(full.map.size, 0, 'the older draft is removed: a reload never brings back older code');
	assert.equal(clearDraft(WHERE, { storage: fakeStorage({ [key]: stored('x') }, { refuse: ['removeItem'] }) }), false);
	assert.equal(saveDraft(WHERE, SNIPPET, { storage: fakeStorage({ [key]: stored('x') }, { refuse: ['removeItem'] }), now }), DRAFT_RESULTS.failed);
	const unlistable = fakeStorage({ [key]: stored('still here') }, { refuse: ['length', 'key'] });
	assert.equal(dropStaleDrafts(WHERE, { storage: unlistable }), 0);
	assert.deepEqual(loadDraft(WHERE, { storage: unlistable }), { code: 'still here', savedAt: NOW }, 'listing refused, reading allowed');
});

test('no storage at all: nothing to load, saving is unavailable, clearing says false', () => {
	assert.equal(loadDraft(WHERE, { storage: null }), null);
	assert.equal(saveDraft(WHERE, 'x', { storage: null, now }), DRAFT_RESULTS.unavailable);
	assert.equal(clearDraft(WHERE, { storage: null }), false);
	assert.equal(dropStaleDrafts(WHERE, { storage: null }), 0);
});

test('browserStorage: the window\'s localStorage; null without a window or when reading it throws', () => {
	const storage = fakeStorage();
	assert.equal(browserStorage({ localStorage: storage }), storage);
	assert.equal(browserStorage(undefined), null, 'no window, as in node');
	const blocked = Object.defineProperty({}, 'localStorage', { get: () => { throw domError('SecurityError'); } });
	assert.equal(browserStorage(blocked), null, 'site data blocked');
	assert.equal(loadDraft(WHERE), null, 'the default storage in node: none');
	assert.equal(saveDraft(WHERE, 'x'), DRAFT_RESULTS.unavailable);
});

test('the saver writes SAVE_DELAY_MS after the last change, the last code only', () => {
	const storage = fakeStorage();
	const timers = fakeTimers();
	const results = [];
	const saver = createDraftSaver({ storage, now, setTimer: timers.setTimer.bind(timers), clearTimer: timers.clearTimer, onResult: (result, where) => results.push([result, where.language]) });
	saver.schedule(WHERE, 'p');
	saver.schedule(WHERE, 'pr');
	saver.schedule(WHERE, 'print');
	assert.equal(timers.waitingCount(), 1, 'one timer, restarted at each change');
	assert.deepEqual(timers.delays, [SAVE_DELAY_MS, SAVE_DELAY_MS, SAVE_DELAY_MS]);
	assert.equal(saver.hasPending(), true);
	assert.equal(storage.map.size, 0, 'nothing written before the delay');
	timers.run();
	assert.equal(loadDraft(WHERE, { storage }).code, 'print');
	assert.deepEqual(results, [[DRAFT_RESULTS.saved, 'python']]);
	assert.equal(saver.hasPending(), false);
});

test('flush writes the waiting draft now; with nothing waiting it returns null', () => {
	const storage = fakeStorage();
	const timers = fakeTimers();
	const saver = createDraftSaver({ storage, now, setTimer: timers.setTimer.bind(timers), clearTimer: timers.clearTimer });
	assert.equal(saver.flush(), null);
	saver.schedule(WHERE, 'print(5)');
	assert.equal(saver.flush(), DRAFT_RESULTS.saved);
	assert.equal(timers.waitingCount(), 0, 'its timer is cancelled');
	assert.equal(loadDraft(WHERE, { storage }).code, 'print(5)');
	assert.equal(saver.flush(), null, 'written once');
});

test('a change in another language writes the waiting draft of the first at once', () => {
	const storage = fakeStorage();
	const timers = fakeTimers();
	const saver = createDraftSaver({ storage, now, setTimer: timers.setTimer.bind(timers), clearTimer: timers.clearTimer });
	const js = { ...WHERE, language: 'javascript', snippet: 'function twoSum() {}\n' };
	saver.schedule(WHERE, 'python edits');
	saver.schedule(js, 'js edits');
	assert.equal(loadDraft(WHERE, { storage }).code, 'python edits', 'written when the language changed');
	assert.equal(loadDraft(js, { storage }), null, 'the new one still waits');
	timers.run();
	assert.equal(loadDraft(js, { storage }).code, 'js edits');
});

test('discard drops a waiting save of that key and removes the stored draft (Reset)', () => {
	const storage = fakeStorage({ [draftKey(WHERE)]: stored('older') });
	const timers = fakeTimers();
	const saver = createDraftSaver({ storage, now, setTimer: timers.setTimer.bind(timers), clearTimer: timers.clearTimer });
	saver.schedule(WHERE, 'newer');
	assert.equal(saver.discard(WHERE), true);
	assert.equal(saver.hasPending(), false);
	assert.equal(timers.waitingCount(), 0);
	timers.run();
	assert.equal(storage.map.size, 0, 'the waiting save never lands');
});

test('discard of another key leaves the waiting save alone', () => {
	const storage = fakeStorage();
	const timers = fakeTimers();
	const saver = createDraftSaver({ storage, now, setTimer: timers.setTimer.bind(timers), clearTimer: timers.clearTimer });
	saver.schedule(WHERE, 'python edits');
	saver.discard({ ...WHERE, language: 'go' });
	assert.equal(saver.hasPending(), true);
	timers.run();
	assert.equal(loadDraft(WHERE, { storage }).code, 'python edits');
});

test('the saver with no storage given looks for the browser\'s at each save (none in node: unavailable, nothing throws)', () => {
	const timers = fakeTimers();
	const results = [];
	const saver = createDraftSaver({ now, setTimer: timers.setTimer.bind(timers), clearTimer: timers.clearTimer, onResult: (result) => results.push(result) });
	saver.schedule(WHERE, 'print(6)');
	timers.run();
	assert.deepEqual(results, [DRAFT_RESULTS.unavailable]);
	assert.equal(saver.discard(WHERE), false);
});

test('a save of the snippet itself through the saver clears the draft (Reset, then the change event it causes)', () => {
	const storage = fakeStorage({ [draftKey(WHERE)]: stored('older') });
	const timers = fakeTimers();
	const results = [];
	const saver = createDraftSaver({ storage, now, setTimer: timers.setTimer.bind(timers), clearTimer: timers.clearTimer, onResult: (result) => results.push(result) });
	saver.discard(WHERE);
	saver.schedule(WHERE, SNIPPET);
	timers.run();
	assert.deepEqual(results, [DRAFT_RESULTS.cleared]);
	assert.equal(storage.map.size, 0);
});

test('flushOnPageHide: pagehide and a hidden page flush; a visible one does not; stop() stops listening', () => {
	const listeners = { window: new Map(), document: new Map() };
	const target = (map) => ({
		addEventListener: (type, fn) => map.set(type, fn),
		removeEventListener: (type, fn) => {
			if (map.get(type) === fn) map.delete(type);
		},
	});
	const doc = { visibilityState: 'visible', ...target(listeners.document) };
	const win = { document: doc, ...target(listeners.window) };
	let flushes = 0;
	const stop = flushOnPageHide({ flush: () => { flushes += 1; } }, win);
	listeners.window.get('pagehide')();
	assert.equal(flushes, 1);
	listeners.document.get('visibilitychange')();
	assert.equal(flushes, 1, 'still visible: nothing');
	doc.visibilityState = 'hidden';
	listeners.document.get('visibilitychange')();
	assert.equal(flushes, 2);
	stop();
	assert.equal(listeners.window.size + listeners.document.size, 0);
});

test('flushOnPageHide without a window (the server) returns a harmless stop', () => {
	const stop = flushOnPageHide({ flush() {} }, undefined);
	assert.equal(typeof stop, 'function');
	assert.doesNotThrow(stop);
});

test('the notice words are frozen strings', () => {
	assert.ok(Object.isFrozen(WORDS));
	for (const word of Object.values(WORDS)) assert.equal(typeof word, 'string');
});
