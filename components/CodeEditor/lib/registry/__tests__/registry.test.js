/**
 * registry.test.js — the page registry of named code editors (../index.js): ids and DOM ids, a
 * request delivered at once or kept until the editor registers (the newest one only, cancel
 * withdraws it), the mount requests a loadWhenVisible editor listens to, two editors with one
 * id (one warning, saying the first on the page wins; the first registered keeps it, the next
 * takes over; reportDuplicateEditor gives the same warning once), refused ids, handles and
 * subscribers, a handle or subscriber that throws, and the page-wide functions sharing one
 * registry. Each test makes its own registry (createEditorRegistry) with a warning list it can
 * read. Run with `npm run test:shared`.
 * To change it: a new rule of the registry (../index.js) gets a test here, on a registry of its own
 * from createEditorRegistry.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	ACTION_TYPES,
	EDITOR_DOM_ID_PREFIX,
	createEditorRegistry,
	editorDomId,
	isEditorRegistered,
	normalizeEditorId,
	registerEditor,
	reportDuplicateEditor,
	requestEditor,
	subscribeMountRequests,
} from '../index.js';

/** A registry of its own and the warnings it gave: { registry, warnings }. */
function freshRegistry() {
	const warnings = [];
	const registry = createEditorRegistry({ warn: (message) => warnings.push(message) });
	return { registry, warnings };
}

/** A fake editor handle that records what it was asked: { handle, received }. */
function fakeEditor() {
	const received = [];
	return { handle: { perform: (action) => received.push(action) }, received };
}

const SHOW_LINES = Object.freeze({ type: ACTION_TYPES.lines, ranges: Object.freeze([Object.freeze([10, 12])]) });
const GO_TO_STEP = Object.freeze({ type: ACTION_TYPES.step, index: 1 });

test('ids: a word without spaces, trimmed; a number becomes its digits; anything else is refused', () => {
	assert.equal(normalizeEditorId('two-sum'), 'two-sum');
	assert.equal(normalizeEditorId('  two-sum '), 'two-sum');
	assert.equal(normalizeEditorId(2), '2');
	for (const bad of ['', '   ', 'two sum', 'two\tsum', null, undefined, NaN, Infinity, {}, ['a'], true]) {
		assert.equal(normalizeEditorId(bad), null, String(bad));
	}
});

test("the DOM id: 'code-editor-' and the id; null when the id is refused", () => {
	assert.equal(EDITOR_DOM_ID_PREFIX, 'code-editor-');
	assert.equal(editorDomId('two-sum'), 'code-editor-two-sum');
	assert.equal(editorDomId(' two-sum '), 'code-editor-two-sum');
	assert.equal(editorDomId(7), 'code-editor-7');
	assert.equal(editorDomId('two sum'), null);
	assert.equal(editorDomId(undefined), null);
});

test('the action kinds are frozen names', () => {
	assert.deepEqual({ ...ACTION_TYPES }, { lines: 'lines', step: 'step' });
	assert.ok(Object.isFrozen(ACTION_TYPES));
});

test('a request for a registered editor is delivered at once, untouched', () => {
	const { registry, warnings } = freshRegistry();
	const editor = fakeEditor();
	registry.registerEditor('two-sum', editor.handle);
	assert.equal(registry.isEditorRegistered('two-sum'), true);
	registry.requestEditor('two-sum', SHOW_LINES);
	registry.requestEditor(' two-sum ', GO_TO_STEP);
	assert.deepEqual(editor.received, [SHOW_LINES, GO_TO_STEP]);
	assert.equal(editor.received[0], SHOW_LINES, 'the same object: the registry never looks inside an action');
	assert.deepEqual(warnings, []);
});

test('a request for an editor not registered yet waits, and is delivered when it registers', () => {
	const { registry } = freshRegistry();
	const editor = fakeEditor();
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.equal(registry.isEditorRegistered('two-sum'), false);
	registry.registerEditor('two-sum', editor.handle);
	assert.deepEqual(editor.received, [SHOW_LINES], 'delivered inside registerEditor');
	registry.requestEditor('two-sum', GO_TO_STEP);
	assert.deepEqual(editor.received, [SHOW_LINES, GO_TO_STEP], 'later requests go straight through');
});

test('only the newest waiting request is kept', () => {
	const { registry } = freshRegistry();
	const editor = fakeEditor();
	registry.requestEditor('two-sum', SHOW_LINES);
	registry.requestEditor('two-sum', GO_TO_STEP);
	registry.registerEditor('two-sum', editor.handle);
	assert.deepEqual(editor.received, [GO_TO_STEP]);
});

test('a waiting request is delivered once only (an editor registered again receives nothing more)', () => {
	const { registry } = freshRegistry();
	const editor = fakeEditor();
	registry.requestEditor('two-sum', SHOW_LINES);
	const unregister = registry.registerEditor('two-sum', editor.handle);
	unregister();
	registry.registerEditor('two-sum', editor.handle); // StrictMode / Fast Refresh: the effect runs again
	assert.deepEqual(editor.received, [SHOW_LINES]);
});

test('cancel() withdraws a waiting request; after delivery, or once replaced, it does nothing', () => {
	const { registry } = freshRegistry();
	const editor = fakeEditor();
	const cancel = registry.requestEditor('two-sum', SHOW_LINES);
	cancel();
	registry.registerEditor('two-sum', editor.handle);
	assert.deepEqual(editor.received, [], 'withdrawn before the editor came');

	const other = fakeEditor();
	const cancelOld = registry.requestEditor('binary-search', SHOW_LINES);
	registry.requestEditor('binary-search', GO_TO_STEP); // replaces it
	cancelOld(); // must not withdraw the newer one
	registry.registerEditor('binary-search', other.handle);
	assert.deepEqual(other.received, [GO_TO_STEP]);

	const cancelDelivered = registry.requestEditor('binary-search', SHOW_LINES);
	cancelDelivered(); // delivered at once: nothing to withdraw
	assert.deepEqual(other.received, [GO_TO_STEP, SHOW_LINES]);
});

test('unregister: requests wait again; calling it twice is harmless', () => {
	const { registry } = freshRegistry();
	const editor = fakeEditor();
	const unregister = registry.registerEditor('two-sum', editor.handle);
	unregister();
	unregister();
	assert.equal(registry.isEditorRegistered('two-sum'), false);
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.deepEqual(editor.received, [], 'it is gone: the request waits');
	const next = fakeEditor();
	registry.registerEditor('two-sum', next.handle);
	assert.deepEqual(next.received, [SHOW_LINES]);
});

test('mount requests: a subscriber is told when a request has to wait, with the action', () => {
	const { registry } = freshRegistry();
	const told = [];
	const unsubscribe = registry.subscribeMountRequests('two-sum', (action) => told.push(action));
	assert.deepEqual(told, [], 'nothing waits yet');
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.deepEqual(told, [SHOW_LINES]);
	registry.requestEditor('other-editor', GO_TO_STEP);
	assert.deepEqual(told, [SHOW_LINES], 'only its own id');
	unsubscribe();
	unsubscribe(); // twice is harmless
	registry.requestEditor('two-sum', GO_TO_STEP);
	assert.deepEqual(told, [SHOW_LINES], 'unsubscribed');
});

test('mount requests: a subscriber that comes while a request waits is told at once', () => {
	const { registry } = freshRegistry();
	registry.requestEditor('two-sum', SHOW_LINES);
	const told = [];
	registry.subscribeMountRequests('two-sum', (action) => told.push(action));
	assert.deepEqual(told, [SHOW_LINES]);
});

test('mount requests: nobody is told when the editor is registered (the request is delivered instead)', () => {
	const { registry } = freshRegistry();
	const editor = fakeEditor();
	const told = [];
	registry.subscribeMountRequests('two-sum', (action) => told.push(action));
	registry.registerEditor('two-sum', editor.handle);
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.deepEqual(told, []);
	assert.deepEqual(editor.received, [SHOW_LINES]);
});

test('mount requests: the same function subscribed twice is told once; a subscriber may unsubscribe while being told', () => {
	const { registry } = freshRegistry();
	let calls = 0;
	const subscriber = () => {
		calls += 1;
	};
	registry.subscribeMountRequests('two-sum', subscriber);
	registry.subscribeMountRequests('two-sum', subscriber);
	const told = [];
	const unsubscribeSelf = registry.subscribeMountRequests('two-sum', () => {
		told.push('self');
		unsubscribeSelf();
	});
	registry.subscribeMountRequests('two-sum', () => told.push('after'));
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.equal(calls, 1);
	assert.deepEqual(told, ['self', 'after'], 'the one after it is still told');
	registry.requestEditor('two-sum', GO_TO_STEP);
	assert.deepEqual(told, ['self', 'after', 'after']);
});

test('two editors with one id: one warning (once per id); the first keeps it; the next takes over when it goes', () => {
	const { registry, warnings } = freshRegistry();
	const first = fakeEditor();
	const second = fakeEditor();
	const unregisterFirst = registry.registerEditor('two-sum', first.handle);
	const unregisterSecond = registry.registerEditor('two-sum', second.handle);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /^CodeEditor id: two editors on this page are called "two-sum"/);
	assert.match(warnings[0], /scrolls to and reaches only the first one on the page; the other ignores it/, 'it says which one wins');
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.deepEqual(first.received, [SHOW_LINES]);
	assert.deepEqual(second.received, []);
	unregisterFirst();
	registry.requestEditor('two-sum', GO_TO_STEP);
	assert.deepEqual(second.received, [GO_TO_STEP], 'the second editor took over');
	const third = fakeEditor();
	registry.registerEditor('two-sum', third.handle);
	assert.equal(warnings.length, 1, 'still one warning for that id');
	unregisterSecond();
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.deepEqual(third.received, [SHOW_LINES]);
});

test('a refused id: a warning, nothing registered, nothing requested, nothing subscribed', () => {
	const { registry, warnings } = freshRegistry();
	const editor = fakeEditor();
	const unregister = registry.registerEditor('two sum', editor.handle);
	const cancel = registry.requestEditor(undefined, SHOW_LINES);
	const unsubscribe = registry.subscribeMountRequests('', () => assert.fail('never told'));
	assert.equal(typeof unregister, 'function');
	assert.equal(typeof cancel, 'function');
	assert.equal(typeof unsubscribe, 'function');
	unregister();
	cancel();
	unsubscribe();
	assert.equal(warnings.length, 3);
	assert.match(warnings[0], /^CodeEditor id: "two sum" cannot name an editor/);
	assert.match(warnings[1], /^CodeEditor id: undefined cannot name an editor/);
	assert.equal(registry.isEditorRegistered('two sum'), false);
	assert.equal(registry.isEditorRegistered(undefined), false);
});

test('a handle without perform(): a warning, and it is not registered', () => {
	const { registry, warnings } = freshRegistry();
	for (const handle of [null, undefined, {}, { perform: 'yes' }, () => {}]) registry.registerEditor('two-sum', handle);
	assert.equal(warnings.length, 5);
	assert.match(warnings[0], /registered without a perform\(action\) function/);
	assert.equal(registry.isEditorRegistered('two-sum'), false);
});

test('a mount subscriber that is not a function: a warning, and it is not kept', () => {
	const { registry, warnings } = freshRegistry();
	for (const subscriber of [undefined, null, {}, 'mount']) {
		const unsubscribe = registry.subscribeMountRequests('two-sum', subscriber);
		assert.equal(typeof unsubscribe, 'function');
		unsubscribe();
	}
	assert.equal(warnings.length, 4);
	assert.match(warnings[0], /^CodeEditor id: a mount subscriber for the editor "two-sum" is not a function/);
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.equal(warnings.length, 4, 'no failing subscriber when a request waits');
});

test('a handle or a subscriber that throws: a warning with the error; the rest still runs', () => {
	const warnings = [];
	const registry = createEditorRegistry({ warn: (message, error) => warnings.push({ message, error }) });
	const broken = new Error('broken subscriber');
	const told = [];
	registry.subscribeMountRequests('two-sum', () => {
		throw broken;
	});
	registry.subscribeMountRequests('two-sum', (action) => told.push(action));
	registry.requestEditor('two-sum', SHOW_LINES);
	assert.deepEqual(told, [SHOW_LINES], 'the next subscriber is still told');
	assert.equal(warnings[0].error, broken);
	assert.match(warnings[0].message, /a mount request for the editor "two-sum" failed/);

	const failing = new Error('cannot reveal');
	assert.doesNotThrow(() =>
		registry.registerEditor('two-sum', {
			perform: () => {
				throw failing;
			},
		}),
	);
	assert.equal(warnings[1].error, failing, 'the waiting request was delivered, and its failure reported');
	assert.match(warnings[1].message, /the editor "two-sum" could not carry out a request/);
	assert.doesNotThrow(() => registry.requestEditor('two-sum', GO_TO_STEP));
	assert.equal(warnings.length, 3);
});

test('reportDuplicateEditor: the duplicate warning, once per id (also after a second registration warned), nothing registered', () => {
	const { registry, warnings } = freshRegistry();
	registry.reportDuplicateEditor('two-sum');
	registry.reportDuplicateEditor('two-sum');
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /two editors on this page are called "two-sum"/);
	registry.registerEditor('two-sum', fakeEditor().handle);
	registry.registerEditor('two-sum', fakeEditor().handle);
	assert.equal(warnings.length, 1, 'the registration of a second one does not warn again');
	assert.equal(registry.isEditorRegistered('other'), false);
	registry.reportDuplicateEditor('two sum');
	assert.equal(warnings.length, 1, 'an id that names no editor: nothing');
	assert.equal(typeof reportDuplicateEditor, 'function', "the page's own");
});

test('registries made by createEditorRegistry are separate', () => {
	const one = freshRegistry().registry;
	const two = freshRegistry().registry;
	one.registerEditor('two-sum', fakeEditor().handle);
	assert.equal(one.isEditorRegistered('two-sum'), true);
	assert.equal(two.isEditorRegistered('two-sum'), false);
});

test("the page's functions share one registry (what <CodeEditor> and <CodeRef> both import)", () => {
	const id = 'page-registry-test-editor';
	const editor = fakeEditor();
	const told = [];
	const unsubscribe = subscribeMountRequests(id, (action) => told.push(action));
	requestEditor(id, SHOW_LINES);
	assert.deepEqual(told, [SHOW_LINES]);
	const unregister = registerEditor(id, editor.handle);
	assert.equal(isEditorRegistered(id), true);
	assert.deepEqual(editor.received, [SHOW_LINES]);
	unregister();
	unsubscribe();
	assert.equal(isEditorRegistered(id), false);
});

test('the default warning goes to console.warn, looked up at each call', (t) => {
	const warn = t.mock.method(console, 'warn', () => {});
	createEditorRegistry().registerEditor('no good', fakeEditor().handle);
	assert.equal(warn.mock.callCount(), 1);
	assert.match(warn.mock.calls[0].arguments[0], /^CodeEditor id: "no good" cannot name an editor/);
});
