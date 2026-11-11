/**
 * useMonacoLoader.js — loads Monaco FROM THIS SITE and says when it is ready or failed.
 *
 *     const { ready, error } = useMonacoLoader(vsPath);   // vsPath: '/vendor/monaco-editor-0.55.1/vs'
 *     useMonacoLoader(vsPath, { enabled: false });        // nothing yet: a phone's static view (touchMode.js)
 *
 * WHY
 *   @monaco-editor/react loads Monaco with its own small AMD loader, by default from a public
 *   CDN (jsDelivr). shared/ holds nothing served from a CDN (shared/README.md > What never goes in), so
 *   shared/plugins/monaco-editor serves the installed monaco-editor's `min/vs` folder at
 *   /vendor/monaco-editor-<version>/vs and hands that path to the page
 *   (usePluginData('monaco-editor').vsPath). loader.config() must point the loader there
 *   BEFORE the first loader.init() — that is, before any <Editor> mounts — and only once per
 *   page (configureMonacoOnce; a module flag).
 *   The hook also calls loader.init() itself (it is shared: <Editor> gets the same Monaco), so
 *   a failed load shows a message instead of "Loading editor…" for ever.
 *   Without a vsPath (the plugin is not registered) nothing is loaded at all: the caller shows
 *   the reader a short notice rather than letting the loader fall back to the CDN, and the hook
 *   says why in the console, once per page load (messages.js > EDITOR_WARNINGS.notServed). With
 *   `enabled` false (the static view of a phone, until "Tap to edit") nothing is configured or
 *   loaded either: Monaco's download starts only when the view becomes Monaco.
 *
 * THE LOADER'S LEFTOVERS (2026-11-10)  When Monaco's files fail, @monaco-editor/loader rejects
 *   every loader.init() it handed out (this hook's and each <Editor>'s), and for each one it also
 *   leaves a copy of the failure that nothing handles (its makeCancelable chains a `.then` with
 *   no rejection handler), so the console showed "Uncaught (in promise)" once per call, though the
 *   reader is already told. Once a load has failed, an `unhandledrejection` whose reason IS that
 *   failure is marked handled (quietLoaderLeftover; one listener per page, added at the first
 *   failure). Any other rejection on the page is left alone. @monaco-editor/react's own
 *   console.error ("Monaco initialization: error: …") still says it, once per editor.
 *
 * HOW TO CHANGE IT
 *   Where Monaco comes from: shared/plugins/monaco-editor. What the reader sees while it loads or when
 *   it fails: CodeEditorClient.jsx and messages.js.
 */

import { useEffect, useState } from 'react';
import { loader } from '@monaco-editor/react';
import { EDITOR_WARNINGS } from './messages.js';

/** What @monaco-editor/loader rejects with when a load is cancelled (not a failure). */
const CANCELATION = 'cancelation';

/** The vs path the loader was pointed at (null until configureMonacoOnce runs). */
let configuredVsPath = null;

/**
 * Point the loader at `vsPath`, once per page. Returns false if an earlier call chose another
 * path (the loader cannot be moved after it started).
 */
export function configureMonacoOnce(vsPath) {
	if (configuredVsPath !== null) return configuredVsPath === vsPath;
	loader.config({ paths: { vs: vsPath } });
	configuredVsPath = vsPath;
	return true;
}

/** Has this page load said EDITOR_WARNINGS.notServed? A page may hold many editors. */
let notServedSaid = false;

/** The reasons Monaco's load failed with on this page (THE LOADER'S LEFTOVERS). */
const loadFailures = new Set();

/** The page the leftovers' listener was added to (null: none yet). */
let quietedPage = null;

/**
 * An `unhandledrejection` listener: a rejection whose reason is a failure of Monaco's load seen
 * here is marked handled (true); anything else is left alone (false).
 */
export function quietLoaderLeftover(event) {
	if (event.reason === undefined || event.reason === null || !loadFailures.has(event.reason)) return false;
	event.preventDefault();
	return true;
}

/** Remember a failure of Monaco's load, and listen for its leftovers on the page (once per page). */
function rememberFailure(reason) {
	if (reason === undefined || reason === null) return;
	loadFailures.add(reason);
	const page = globalThis.window;
	if (!page || page === quietedPage || typeof page.addEventListener !== 'function') return;
	page.addEventListener('unhandledrejection', quietLoaderLeftover);
	quietedPage = page;
}

/** console.warn, looked up when called (so a test may replace console.warn). */
function warn(message) {
	console.warn(message);
}

/** Says EDITOR_WARNINGS.notServed, once per page load. */
function sayNotServed() {
	if (notServedSaid) return;
	notServedSaid = true;
	warn(EDITOR_WARNINGS.notServed);
}

/** { ready, error } of Monaco's load from `vsPath` (nothing happens without one, or while `enabled` is false). */
export function useMonacoLoader(vsPath, { enabled = true } = {}) {
	const [state, setState] = useState({ ready: false, error: null });
	// During render, so the loader is configured before <Editor>'s own effect calls loader.init().
	if (vsPath && enabled) configureMonacoOnce(vsPath);
	useEffect(() => {
		if (!vsPath) sayNotServed();
		if (!vsPath || !enabled) return undefined;
		const loading = loader.init();
		loading.then(
			() => setState({ ready: true, error: null }),
			(error) => {
				if (error?.type === CANCELATION) return;
				rememberFailure(error);
				setState({ ready: false, error: error ?? new Error('Monaco did not load') });
			},
		);
		return () => loading.cancel();
	}, [vsPath, enabled]);
	return state;
}
