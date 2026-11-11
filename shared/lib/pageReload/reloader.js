/**
 * reloader.js — the browser side of the after-a-deploy reload: listens for the moments to check,
 * asks /build-id.json, and reloads the page when a newer build is live and nothing blocks.
 * Started once per page by a client module of the site (shared/lib/README.md shows one); every
 * rule and timing it applies lives in decide.js (pure). The browser objects are passed in
 * (`win`, `doc`, `now`), so __tests__/reloader.test.js drives it with fakes
 * (`npm run test:shared`).
 *
 * WHAT IT DOES
 *   The page carries the id of the build it came from (<meta name="site-build-id">, written by
 *   shared/plugins/build-id); /build-id.json names the build that is live now. When the page becomes
 *   visible, gets focus or is restored from the back/forward cache (at most every
 *   CHECK_INTERVAL_MS), or right after one of the site's own script / stylesheet chunks failed
 *   to load (the old build's files are gone after a deploy), it fetches /build-id.json. If the
 *   ids differ it reloads — unless an editor holds unsaved text (the `hasUnsavedWork` option:
 *   the site's client module passes its own check, such as the code editor's registry,
 *   shared/components/CodeEditor/unsavedWork.js, through that site's stub of it; WITHOUT THE
 *   OPTION NOTHING IS EVER HELD for this reason, and no error says so), a text field has focus,
 *   a dialog (or a grid cell editor) is open, a request to the site's own /api/ or to one of
 *   its functions (a code run) is still running, or the page is hidden; then it looks again every WAIT_RETRY_MS (at most
 *   WAIT_RETRY_LIMIT times) and otherwise waits for the next time the page becomes visible.
 *
 *   To know whether such a request is running, it wraps win.fetch once: calls to this site's
 *   /api/ and to its functions' own paths (decide.js > isApiRequest) are counted while they run;
 *   every other call goes straight through untouched. (On a site with neither the count stays 0.)
 *
 *   A page without the <meta> (`npm start`) installs nothing: no listener, no fetch wrapper.
 *   Navigation to a route whose chunk is gone is already handled by Docusaurus itself (it
 *   reloads — @docusaurus/core PendingNavigation); this covers the lazy parts inside a page
 *   (a component it loads on demand, e.g. a chart or a grid).
 *
 * HOW TO CHANGE IT
 *   Timings and rules: decide.js. Which events trigger a check: listen() below. Another editor
 *   that holds unsaved text: have it set the registry the site's client module already passes,
 *   or pass a `hasUnsavedWork` that asks both. A site's test should run its client module and
 *   see a reload held, because a dropped option still builds and still passes these tests.
 */

import {
	BUILD_ID_META_NAME,
	BUILD_ID_PATH,
	CHUNK_RELOAD_KEY,
	OPEN_DIALOG_SELECTOR,
	WAIT_RETRY_LIMIT,
	WAIT_RETRY_MS,
	buildIdFromJson,
	chunkReloadAllowed,
	cleanBuildId,
	isApiRequest,
	isAssetLoadFailure,
	isChunkLoadError,
	isTextEntry,
	reloadDecision,
	shouldCheck,
} from './decide.js';

/** The page's own build id, from the <meta> the build wrote (null under `npm start`). */
function readLoadedId(doc) {
	const meta = doc.querySelector(`meta[name="${BUILD_ID_META_NAME}"]`);
	return cleanBuildId(meta?.getAttribute('content') ?? null);
}

/** sessionStorage read that never throws (private mode, blocked storage): NaN when unknown. */
function readChunkReloadAt(win) {
	try {
		return Number(win.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? Number.NaN);
	} catch {
		return Number.NaN;
	}
}

function writeChunkReloadAt(win, time) {
	try {
		win.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(time));
	} catch {
		// no storage: the loop guard then relies on the ids matching after the reload
	}
}

/**
 * Start watching. Returns the state object (for the tests), or null when the page has no build
 * id and nothing was installed.
 *   win   window: fetch, location, sessionStorage, setTimeout, addEventListener
 *   doc   document: querySelector (the build id's <meta>, an open dialog), visibilityState, activeElement, addEventListener
 *   now   () => ms
 *   hasUnsavedWork   () => true while an editor holds unsaved text (the default: never)
 */
export function startReloader({ win, doc, now = () => Date.now(), hasUnsavedWork = () => false }) {
	const loadedId = readLoadedId(doc);
	if (loadedId === null) return null;
	const state = { loadedId, liveId: null, lastCheckAt: now(), checking: false, retries: 0, retryTimer: null, requestsInFlight: 0 };
	const originalFetch = trackApiRequests(win, state);
	const isVisible = () => doc.visibilityState !== 'hidden';

	/** The live build's id, or null when it cannot be read (offline, the wall's login page, …). */
	async function fetchLiveId() {
		try {
			const response = await originalFetch(`${BUILD_ID_PATH}?t=${now()}`, { cache: 'no-store', credentials: 'same-origin' });
			if (!response.ok) return null;
			return buildIdFromJson(await response.json());
		} catch {
			return null;
		}
	}

	/** Reload now if nothing blocks; otherwise look again shortly. */
	function reloadIfSafe(chunk) {
		const decision = reloadDecision({
			loadedId: state.loadedId,
			liveId: state.liveId,
			unsavedWork: hasUnsavedWork(),
			editing: isTextEntry(doc.activeElement),
			dialogOpen: doc.querySelector(OPEN_DIALOG_SELECTOR) !== null,
			requestsInFlight: state.requestsInFlight,
			visible: isVisible(),
		});
		if (decision === 'reload') {
			if (chunk) writeChunkReloadAt(win, now());
			win.location.reload();
		} else if (decision === 'wait') {
			scheduleRetry(chunk);
		}
	}

	function scheduleRetry(chunk) {
		if (state.retryTimer !== null || state.retries >= WAIT_RETRY_LIMIT) return;
		state.retryTimer = win.setTimeout(() => {
			state.retryTimer = null;
			state.retries += 1;
			reloadIfSafe(chunk);
		}, WAIT_RETRY_MS);
	}

	/** One check: ask for the live id when due (or forced), then reload if it differs and it is safe. */
	async function check({ force = false, chunk = false } = {}) {
		const newerKnown = state.liveId !== null && state.liveId !== state.loadedId;
		if (!newerKnown) {
			if (state.checking || !shouldCheck({ visible: isVisible(), now: now(), lastCheckAt: state.lastCheckAt, force })) return;
			state.checking = true;
			state.lastCheckAt = now();
			const liveId = await fetchLiveId();
			state.checking = false;
			if (liveId !== null) state.liveId = liveId;
		}
		state.retries = 0;
		reloadIfSafe(chunk);
	}

	function onChunkFailure() {
		if (!chunkReloadAllowed({ now: now(), lastChunkReloadAt: readChunkReloadAt(win) })) return;
		check({ force: true, chunk: true });
	}

	listen({ win, doc, isVisible, check, onChunkFailure });
	return state;
}

/** Count the requests to this site's own API (decide.js > isApiRequest) while they run; returns the unwrapped fetch. */
function trackApiRequests(win, state) {
	const original = win.fetch.bind(win);
	win.fetch = function trackedFetch(input, init) {
		if (!isApiRequest(input, win.location.origin)) return original(input, init);
		state.requestsInFlight += 1;
		let pending;
		try {
			pending = original(input, init);
		} catch (error) {
			state.requestsInFlight -= 1;
			throw error;
		}
		return pending.finally(() => {
			state.requestsInFlight -= 1;
		});
	};
	return original;
}

/** The moments that trigger a check, and the two kinds of chunk failure. */
function listen({ win, doc, isVisible, check, onChunkFailure }) {
	doc.addEventListener('visibilitychange', () => {
		if (isVisible()) check();
	});
	win.addEventListener('focus', () => check());
	win.addEventListener('pageshow', () => check());
	// capture phase: a failed <script> / <link> does not bubble, but it is seen on the way down
	win.addEventListener('error', (event) => {
		if (isAssetLoadFailure(event.target, win.location.origin)) onChunkFailure();
	}, true);
	win.addEventListener('unhandledrejection', (event) => {
		if (isChunkLoadError(event.reason)) onChunkFailure();
	});
}
