/**
 * registry (lib/registry) — the page's list of code editors that have a name (<CodeEditor id="…">),
 * so that something else on the page can ask one of them to do something. Its user is
 * <CodeRef> (shared/components/CodeEditor/CodeRef): a phrase in the prose that, when the reader clicks it,
 * asks an editor to show some lines or to go to one of its steps.
 *
 *     // the editor, once Monaco is mounted (it holds a request back while its folds close):
 *     const unregister = registerEditor('two-sum', { perform(action) { … } });
 *     // a <CodeRef>, when the reader clicks it:
 *     const cancel = requestEditor('two-sum', { type: ACTION_TYPES.lines, ranges: [[10, 12]] });
 *     // an editor that mounts only near the viewport (loadWhenVisible), so it can mount at once:
 *     const unsubscribe = subscribeMountRequests('two-sum', () => mountNow());
 *
 * Plain module state (three Maps), no React, no DOM, no Monaco: `node --test` covers it, and it
 * is safe during the server render (nothing here touches `window`; editors register in effects,
 * which the server never runs). It describes THIS page only and is empty after a reload.
 *
 * THE RULES
 *   - A request for a registered editor is delivered at once: handle.perform(action).
 *   - A request for an editor that is not registered yet (Monaco still loading, a
 *     loadWhenVisible editor not mounted) WAITS, and is delivered the moment that editor
 *     registers. (An editor that is registered but still closing its folds keeps the request
 *     itself until they are closed: shared/components/CodeEditor/useGuided.js.) Only the newest waiting request per editor is kept: a reader who
 *     clicks two references before the editor is ready wants the place of the second one.
 *     requestEditor returns cancel(), which withdraws the request while it still waits (a
 *     <CodeRef> calls it when it unmounts: a request lives as long as the page that made it).
 *   - When a request has to wait, the editor's mount subscribers are told (fn(action)), so an
 *     editor that waits to be near the viewport mounts at once; one that subscribes while a
 *     request already waits is told at once.
 *   - Two editors with the same id: a console warning, once per id. Only the editor a <CodeRef>
 *     scrolls to — the FIRST on the page, the one document.getElementById finds — registers
 *     (useGuided.js checks before registering, and reports the other with
 *     reportDuplicateEditor), so the scroll and the request always reach the same editor. As a
 *     backstop, should two register anyway, the first one registered keeps the id (requests go
 *     to it); if it unregisters, the next one takes over.
 *   - An id is a string without white space (a number is read as its digits):
 *     normalizeEditorId. Anything else is refused with a console warning, and so is a handle
 *     without a perform function and a mount subscriber that is not a function.
 *   - A handle or a subscriber that throws gets a console warning; the others still run.
 *
 * THE ACTIONS  (the contract between <CodeRef> and <CodeEditor>; ACTION_TYPES)
 *   { type: 'lines', ranges } `ranges` is [[start, end], …]: the lines of <CodeRef lines>,
 *                             sorted and merged by shared/components/CodeEditor/lib/codeRunner/lineSpec.js >
 *                             parseLineSpec (lines="3-5,8" → [[3, 5], [8, 8]]), numbered from 1
 *                             as the reader sees them. NOT cut to the code's length (the
 *                             <CodeRef> cannot see the code): the editor cuts them to its own
 *                             lines, then reveals and flashes them
 *                             (shared/components/CodeEditor/decorations.js > revealLines, flash).
 *   { type: 'step', index }   `index` counts from 0: <CodeRef step={2}> (the reader's "Step 2 of
 *                             4") sends index 1. The editor goes to that step of its `steps`.
 *   The registry itself never looks inside an action: a new kind needs no change here, only a
 *   name in ACTION_TYPES and the editor's handling of it.
 *
 * THE DOM ID of a named editor: editorDomId(id) → 'code-editor-<id>'. <CodeEditor> puts it on
 * the element around its placeholder and its editor (so it is there before Monaco loads), and
 * <CodeRef> scrolls to it.
 *
 * TESTS  createEditorRegistry({ warn }) makes a registry of its own (with its own warning
 * function); the exported registerEditor / requestEditor / reportDuplicateEditor / … use the
 * page's one.
 *
 * HOW TO CHANGE IT
 *   A rule: the function below that carries it (one rule each). A new kind of action: a name in
 *   ACTION_TYPES, the sender (shared/components/CodeEditor/CodeRef/reference.js) and the editor's handle
 *   (shared/components/CodeEditor/useGuided.js > perform). The DOM id's form: EDITOR_DOM_ID_PREFIX.
 *   The warning words: WARNINGS. Tests: __tests__/registry.test.js (`npm run test:shared`).
 */

/** The kinds of request an editor understands (see THE ACTIONS above). */
export const ACTION_TYPES = Object.freeze({
	lines: 'lines',
	step: 'step',
});

/** A named editor's DOM id is this prefix and its id: 'code-editor-two-sum'. */
export const EDITOR_DOM_ID_PREFIX = 'code-editor-';

/** Prefix of every warning, so the console says where it comes from. */
const WARNING_PREFIX = 'CodeEditor id:';

/** Every console warning of the registry. */
const WARNINGS = Object.freeze({
	badId: (id) => `${WARNING_PREFIX} ${describeValue(id)} cannot name an editor: give a word without spaces, e.g. id="two-sum".`,
	badHandle: (id) => `${WARNING_PREFIX} the editor "${id}" registered without a perform(action) function; it was ignored.`,
	duplicate: (id) =>
		`${WARNING_PREFIX} two editors on this page are called "${id}": a <CodeRef to="${id}"> scrolls to and reaches only the first one on the page; the other ignores it. Give each editor its own id.`,
	handleFailed: (id) => `${WARNING_PREFIX} the editor "${id}" could not carry out a request.`,
	subscriberFailed: (id) => `${WARNING_PREFIX} a mount request for the editor "${id}" failed.`,
	badSubscriber: (id) => `${WARNING_PREFIX} a mount subscriber for the editor "${id}" is not a function; it was ignored.`,
});

/** What an unregister / unsubscribe / cancel returns when there is nothing to undo. */
const NOTHING_TO_UNDO = () => {};

/** console.warn, looked up at each call (so a test may replace it). */
function consoleWarn(...parts) {
	console.warn(...parts);
}

/** A value as text for a warning: "two sum", 42, undefined. */
function describeValue(value) {
	if (typeof value === 'string') return JSON.stringify(value);
	return String(value);
}

/**
 * An id as the registry keeps it: a string without white space, trimmed (a finite number
 * becomes its digits), or null when the value cannot name an editor.
 */
export function normalizeEditorId(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (typeof value !== 'string') return null;
	const id = value.trim();
	if (id === '' || /\s/.test(id)) return null;
	return id;
}

/** The DOM id of the editor called `id` ('code-editor-two-sum'), or null when `id` cannot name one. */
export function editorDomId(id) {
	const key = normalizeEditorId(id);
	return key === null ? null : `${EDITOR_DOM_ID_PREFIX}${key}`;
}

/**
 * A registry of its own: { registerEditor, requestEditor, subscribeMountRequests,
 * isEditorRegistered, reportDuplicateEditor }. The page uses one (the exports below); a test
 * makes its own, with a `warn` it can read.
 */
export function createEditorRegistry({ warn = consoleWarn } = {}) {
	// id → the registrations in order, [{ handle }, …]; the first is the one requests go to
	const editors = new Map();
	// id → { action }: the newest request not delivered yet
	const waiting = new Map();
	// id → Set of functions to call when a request for that id has to wait
	const mountSubscribers = new Map();
	// ids already warned about as duplicates (one warning per id)
	const warnedDuplicates = new Set();

	/** The handle requests for `key` go to, or null when no editor of that name is registered. */
	function activeHandle(key) {
		const registrations = editors.get(key);
		return registrations ? registrations[0].handle : null;
	}

	/** Hands `action` to the editor, catching (and reporting) anything it throws. */
	function deliver(key, handle, action) {
		try {
			handle.perform(action);
		} catch (error) {
			warn(WARNINGS.handleFailed(key), error);
		}
	}

	/** Calls one mount subscriber, catching (and reporting) anything it throws. */
	function tellSubscriber(key, subscriber, action) {
		try {
			subscriber(action);
		} catch (error) {
			warn(WARNINGS.subscriberFailed(key), error);
		}
	}

	/** Tells every mount subscriber of `key` that a request waits (a copy: one may unsubscribe meanwhile). */
	function tellSubscribers(key, action) {
		const subscribers = [...(mountSubscribers.get(key) ?? [])];
		for (const subscriber of subscribers) tellSubscriber(key, subscriber, action);
	}

	/** The first time a second editor takes an id: one warning. */
	function warnDuplicateOnce(key) {
		if (warnedDuplicates.has(key)) return;
		warnedDuplicates.add(key);
		warn(WARNINGS.duplicate(key));
	}

	/** Delivers the request waiting for `key`, if there is one and an editor to take it. */
	function deliverWaiting(key) {
		const request = waiting.get(key);
		const handle = activeHandle(key);
		if (!request || !handle) return;
		waiting.delete(key);
		deliver(key, handle, request.action);
	}

	/** Removes one registration (the others of the same id stay; the next one takes over). */
	function removeRegistration(key, registration) {
		const registrations = editors.get(key);
		if (!registrations) return;
		const index = registrations.indexOf(registration);
		if (index === -1) return;
		registrations.splice(index, 1);
		if (registrations.length === 0) editors.delete(key);
	}

	/**
	 * The editor called `id` can now act: `handle.perform(action)` will receive the requests
	 * (a waiting one at once). Returns unregister() (call it when the editor unmounts; twice is
	 * harmless).
	 */
	function registerEditor(id, handle) {
		const key = normalizeEditorId(id);
		if (key === null) {
			warn(WARNINGS.badId(id));
			return NOTHING_TO_UNDO;
		}
		if (typeof handle?.perform !== 'function') {
			warn(WARNINGS.badHandle(key));
			return NOTHING_TO_UNDO;
		}
		const registration = { handle };
		const registrations = editors.get(key) ?? [];
		registrations.push(registration);
		editors.set(key, registrations);
		if (registrations.length > 1) warnDuplicateOnce(key);
		deliverWaiting(key);
		return () => removeRegistration(key, registration);
	}

	/**
	 * Asks the editor called `id` to carry out `action` (see THE ACTIONS): at once when it is
	 * registered, else when it registers (and its mount subscribers are told). Returns cancel(),
	 * which withdraws the request while it still waits (and does nothing once it is delivered
	 * or replaced by a newer one).
	 */
	function requestEditor(id, action) {
		const key = normalizeEditorId(id);
		if (key === null) {
			warn(WARNINGS.badId(id));
			return NOTHING_TO_UNDO;
		}
		const handle = activeHandle(key);
		if (handle) {
			deliver(key, handle, action);
			return NOTHING_TO_UNDO;
		}
		const request = { action };
		waiting.set(key, request);
		tellSubscribers(key, action);
		return () => {
			if (waiting.get(key) === request) waiting.delete(key);
		};
	}

	/**
	 * Calls `subscriber(action)` whenever a request for `id` has to wait for the editor to
	 * register — at once if one already waits. Returns unsubscribe(). (The same function
	 * subscribed twice counts once.)
	 */
	function subscribeMountRequests(id, subscriber) {
		const key = normalizeEditorId(id);
		if (key === null) {
			warn(WARNINGS.badId(id));
			return NOTHING_TO_UNDO;
		}
		if (typeof subscriber !== 'function') {
			warn(WARNINGS.badSubscriber(key));
			return NOTHING_TO_UNDO;
		}
		const subscribers = mountSubscribers.get(key) ?? new Set();
		subscribers.add(subscriber);
		mountSubscribers.set(key, subscribers);
		const request = waiting.get(key);
		if (request) tellSubscriber(key, subscriber, request.action);
		return () => {
			subscribers.delete(subscriber);
			if (subscribers.size === 0 && mountSubscribers.get(key) === subscribers) mountSubscribers.delete(key);
		};
	}

	/** true while an editor called `id` is registered. */
	function isEditorRegistered(id) {
		const key = normalizeEditorId(id);
		return key !== null && editors.has(key);
	}

	/**
	 * An editor found that another one on the page has its id (and so does not register): the
	 * duplicate warning, once per id — the same one a second registration gives.
	 */
	function reportDuplicateEditor(id) {
		const key = normalizeEditorId(id);
		if (key !== null) warnDuplicateOnce(key);
	}

	return { registerEditor, requestEditor, subscribeMountRequests, isEditorRegistered, reportDuplicateEditor };
}

/** The page's registry: every editor and every <CodeRef> on the page share it. */
const pageRegistry = createEditorRegistry();

/** The page's registerEditor (see createEditorRegistry). */
export function registerEditor(id, handle) {
	return pageRegistry.registerEditor(id, handle);
}

/** The page's requestEditor (see createEditorRegistry). */
export function requestEditor(id, action) {
	return pageRegistry.requestEditor(id, action);
}

/** The page's subscribeMountRequests (see createEditorRegistry). */
export function subscribeMountRequests(id, subscriber) {
	return pageRegistry.subscribeMountRequests(id, subscriber);
}

/** The page's isEditorRegistered (see createEditorRegistry). */
export function isEditorRegistered(id) {
	return pageRegistry.isEditorRegistered(id);
}

/** The page's reportDuplicateEditor (see createEditorRegistry). */
export function reportDuplicateEditor(id) {
	return pageRegistry.reportDuplicateEditor(id);
}
