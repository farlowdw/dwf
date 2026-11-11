/**
 * draftSession.test.js — the `saveDraft` rules of one editor (../draftSession.js, which
 * useDrafts.js wires to React), over a fake localStorage and fake timers, with settings from the
 * real props.js > normalizeEditorProps:
 *   - off without `saveDraft` and on a read-only editor: nothing loaded even when a draft is
 *     stored, save / discard touch no storage, the author's folds stay;
 *   - a snippet with magic comments: the draft stored against the STRIPPED snippet is restored,
 *     one stored against the raw text is not;
 *   - two languages, one restored: no author folds over the restored one, the other keeps them;
 *   - discard: the draft gone, the author's folds back AT ONCE (Reset folds in the same click),
 *     the restored set without that language (the same set when nothing changed);
 *   - a save then flush() inside the delay is written (unmount, the page hidden).
 * Run with `npm run test:shared`.
 * To change it: a new saveDraft rule of ../draftSession.js gets a test here, over the fake storage and
 * timers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftSession, draftsEnabled } from '../draftSession.js';
import { SAVE_DELAY_MS, createDraftSaver, draftKey } from '../drafts.js';
import { normalizeEditorProps } from '../props.js';

const PATH = '/site-guide';
const PYTHON = 'def two_sum(nums, target):\n    pass\n';
const JAVASCRIPT = 'function twoSum(nums, target) {\n}\n';
const FOLDS = { python: [[1, 2]], javascript: [[1, 2]] };

/** localStorage over a Map (only what drafts.js uses); `writes` counts setItem and removeItem. */
function fakeStorage(entries = {}) {
	const map = new Map(Object.entries(entries));
	const storage = {
		map,
		writes: 0,
		get length() {
			return map.size;
		},
		key: (index) => [...map.keys()][index] ?? null,
		getItem: (key) => (map.has(key) ? map.get(key) : null),
		setItem(key, value) {
			storage.writes += 1;
			map.set(key, String(value));
		},
		removeItem(key) {
			storage.writes += 1;
			map.delete(key);
		},
	};
	return storage;
}

/** Fake setTimeout / clearTimeout: nothing fires by itself (so only flush() writes). */
function fakeTimers() {
	const delays = [];
	return { delays, setTimer: (callback, ms) => delays.push(ms), clearTimer: () => {} };
}

/** A stored draft value, as drafts.js writes it. */
function stored(code) {
	return JSON.stringify({ code, savedAt: 1 });
}

/** The storage key of `language`'s draft for these settings (the stripped snippet, as the session uses). */
function keyOf(settings, language) {
	return draftKey({ path: PATH, editorKey: settings.id, language, snippet: settings.snippets.code[language] });
}

/** Settings from the real props.js (an id, so its drafts are its own). */
function settingsWith(props) {
	return normalizeEditorProps({ id: 'two-sum', initialCode: { python: PYTHON, javascript: JAVASCRIPT }, foldedRegions: FOLDS, ...props });
}

/** A session over `storage`, with a saver over the same storage and fake timers. */
function sessionOver(settings, storage) {
	const timers = fakeTimers();
	const saver = createDraftSaver({ storage, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
	return { session: createDraftSession({ settings, path: PATH, storage, saver }), timers };
}

test('draftsEnabled: only with saveDraft, never read-only', () => {
	assert.equal(draftsEnabled({ saveDraft: true, readOnly: false }), true);
	assert.equal(draftsEnabled({ saveDraft: false, readOnly: false }), false);
	assert.equal(draftsEnabled({ saveDraft: true, readOnly: true }), false);
});

for (const [name, props] of [
	['without saveDraft', {}],
	['read-only', { saveDraft: true, readOnly: true }],
]) {
	test(`${name}: nothing loaded although a draft is stored, no storage touched, the author's folds stay`, () => {
		const settings = settingsWith(props);
		const storage = fakeStorage({ [keyOf(settings, 'python')]: stored('print(1)\n') });
		const { session } = sessionOver(settings, storage);
		assert.equal(session.enabled, false);
		assert.equal(session.startingCode('python'), PYTHON);
		assert.deepEqual([...session.restored()], []);
		assert.deepEqual(session.foldsFor('python'), [[1, 2]]);
		session.save('python', 'print(2)\n');
		session.discard('python');
		session.flush();
		assert.equal(storage.writes, 0, 'save, discard and flush wrote nothing');
		assert.equal(storage.map.size, 1, 'the stored draft is left alone');
	});
}

test('a snippet with magic comments: the draft stored against the STRIPPED snippet is restored', () => {
	const raw = 'def f():\n    # highlight-next-line\n    return 1\n';
	const settings = normalizeEditorProps({ id: 'magic', initialCode: raw, saveDraft: true });
	assert.equal(settings.snippets.code.python, 'def f():\n    return 1\n', 'props.js strips the comment line');
	const strippedKey = keyOf(settings, 'python');
	const rawKey = draftKey({ path: PATH, editorKey: 'magic', language: 'python', snippet: raw });
	const restored = sessionOver(settings, fakeStorage({ [strippedKey]: stored('def f():\n    return 2\n') })).session;
	assert.equal(restored.startingCode('python'), 'def f():\n    return 2\n');
	assert.deepEqual([...restored.restored()], ['python']);
	const ignored = sessionOver(settings, fakeStorage({ [rawKey]: stored('def f():\n    return 3\n') })).session;
	assert.equal(ignored.startingCode('python'), settings.snippets.code.python, 'a draft keyed by the raw text is not this snippet\'s');
	assert.deepEqual([...ignored.restored()], []);
});

test('two languages, one restored: no author folds over the restored one; the other keeps them', () => {
	const settings = settingsWith({ saveDraft: true });
	const { session } = sessionOver(settings, fakeStorage({ [keyOf(settings, 'javascript')]: stored('console.log(1);\n') }));
	assert.equal(session.enabled, true);
	assert.deepEqual([...session.restored()], ['javascript']);
	assert.equal(session.startingCode('javascript'), 'console.log(1);\n');
	assert.equal(session.startingCode('python'), PYTHON);
	assert.deepEqual(session.foldsFor('javascript'), []);
	assert.deepEqual(session.foldsFor('python'), [[1, 2]]);
});

test('discard: the draft gone, the author\'s folds back at once, the language out of the restored set', () => {
	const settings = settingsWith({ saveDraft: true });
	const storage = fakeStorage({ [keyOf(settings, 'python')]: stored('print(1)\n'), [keyOf(settings, 'javascript')]: stored('x;\n') });
	const { session } = sessionOver(settings, storage);
	const before = session.restored();
	const after = session.discard('python');
	assert.equal(storage.map.has(keyOf(settings, 'python')), false, 'the stored draft is removed');
	assert.deepEqual(session.foldsFor('python'), [[1, 2]], 'the very next call, with no re-render in between (Reset folds in the same click)');
	assert.deepEqual([...after], ['javascript']);
	assert.equal(session.restored(), after);
	assert.notEqual(after, before, 'a new set, so React draws the notice away');
	assert.deepEqual([...before], ['python', 'javascript'], 'the old set is not changed in place');
	assert.equal(session.discard('python'), after, 'nothing changed: the same set (React then draws nothing again)');
});

test('save then flush inside the delay: the draft is written (unmount, the page hidden)', () => {
	const settings = settingsWith({ saveDraft: true });
	const storage = fakeStorage();
	const { session, timers } = sessionOver(settings, storage);
	session.save('python', 'print(42)\n');
	assert.deepEqual(timers.delays, [SAVE_DELAY_MS]);
	assert.equal(storage.map.size, 0, 'nothing written before the delay');
	session.flush();
	assert.equal(JSON.parse(storage.map.get(keyOf(settings, 'python'))).code, 'print(42)\n');
});

test('the default saver writes to the same storage the drafts were loaded from', () => {
	const settings = settingsWith({ saveDraft: true });
	const storage = fakeStorage();
	const session = createDraftSession({ settings, path: PATH, storage });
	session.save('javascript', 'let x = 1;\n');
	session.flush();
	assert.equal(JSON.parse(storage.map.get(keyOf(settings, 'javascript'))).code, 'let x = 1;\n');
});
