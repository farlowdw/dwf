/**
 * decide.js — the PURE rules of the after-a-deploy reload (reloader.js, started by a client
 * module of the site): when to ask the server which build is live, when a different answer may
 * reload the page, and what counts as "a chunk of the old build failed to load". No `window`,
 * no fetch, no timers — reloader.js feeds these functions what it sees, so `node --test` covers
 * every branch (__tests__/decide.test.js, `npm run test:shared`).
 *
 * WHY
 *   A tab left open on a tablet keeps running the build it loaded, for days. After a deploy its
 *   code is stale: its lazy chunks may no longer exist on the server (ChunkLoadError), a newer
 *   server may refuse what it sends, and it keeps showing the old pages. Every build writes a
 *   fresh id into the page (<meta name="site-build-id">) and into /build-id.json
 *   (shared/plugins/build-id); a tab whose id differs from the live one reloads itself — but
 *   only at a safe moment.
 *
 * THE RULES
 *   Check      when the page becomes visible / focused, at most every CHECK_INTERVAL_MS (a
 *              known newer build skips the wait: nothing needs fetching).
 *   Reload     only when the live id is known AND differs from the page's, and nothing blocks:
 *                - an editor holds unsaved text (reloader.js's `hasUnsavedWork` option: the
 *                  site's client module passes its own check, such as the code editor's
 *                  registry, shared/components/CodeEditor/unsavedWork.js, through that site's
 *                  stub of it; without the option nothing is ever held for this reason),
 *                - a text field has focus (someone may be typing): a <textarea>, a text
 *                  <input>, anything contenteditable, or an EditContext host — the code
 *                  editor's Monaco in Chrome and Edge, whose focused element is a plain <div>
 *                  (isTextEntry),
 *                - a dialog is open (anything with role dialog — an MUI Dialog, a date
 *                  picker — or a grid cell being edited: OPEN_DIALOG_SELECTOR), even without
 *                  typed text: a reload would close it,
 *                - a request to the site's own /api/ or to one of its functions by the
 *                  function's own path is in flight: a save, a code run whose answer the
 *                  reload would drop (API_PREFIXES; a site without either never counts any),
 *                - the page is hidden.
 *              A blocked reload is retried every WAIT_RETRY_MS for WAIT_RETRY_LIMIT tries while
 *              the page stays visible, then waits for the next time the page becomes visible.
 *   Chunk      a script / stylesheet of this site's /assets/ failing to load, or a promise
 *   failure    rejected with webpack's ChunkLoadError, triggers an immediate check (no
 *              interval); it reloads only when the live id differs (a real deploy, not a
 *              network blip) and at most once per CHUNK_RELOAD_GUARD_MS (sessionStorage), so a
 *              broken deploy can never loop.
 *   Unknown    an unreadable or failed /build-id.json (offline, the wall's login page, `npm
 *              start`, which has no build id) never reloads anything.
 *
 * HOW TO CHANGE IT
 *   The timings: the constants below. What blocks a reload: reloadDecision() (what counts as an
 *   open dialog: OPEN_DIALOG_SELECTOR). The meta name and the JSON path must match
 *   shared/plugins/build-id/index.js (BUILD_ID_META_NAME, BUILD_ID_FILE; its test compares them).
 *   A new name for the meta or the session key: a tab loaded before the change still reads the
 *   old meta in its own page and asks the same /build-id.json, so it reloads once and then runs
 *   the new names; what it wrote under the old session key is never read again and goes when the
 *   tab closes. Keep the meta's name ending in "build-id". A new file path is another matter: an
 *   old tab would ask for a file that is gone and never reload.
 */

/** <meta name=…> the build writes the page's own id into (shared/plugins/build-id). */
export const BUILD_ID_META_NAME = 'site-build-id';

/** Where the live build's id is served (shared/plugins/build-id writes build/build-id.json). */
export const BUILD_ID_PATH = '/build-id.json';

/** At most one /build-id.json request per this many ms (visibility / focus changes are frequent). */
export const CHECK_INTERVAL_MS = 10 * 60 * 1000;

/** While a reload is blocked and the page is visible, look again after this many ms … */
export const WAIT_RETRY_MS = 2000;

/** … at most this many times; then wait for the next time the page becomes visible. */
export const WAIT_RETRY_LIMIT = 15;

/** At most one reload for a failed chunk per this many ms per tab (loop guard). */
export const CHUNK_RELOAD_GUARD_MS = 60 * 1000;

/** sessionStorage key of the time of the last chunk-failure reload. */
export const CHUNK_RELOAD_KEY = 'site:chunkReloadAt';

/** Longest id accepted from /build-id.json (anything else is "unknown"). */
const MAX_BUILD_ID_LENGTH = 100;

/** The characters a build id may contain (shared/plugins/build-id makes letters, digits, '-', '.', ':'). */
const BUILD_ID_PATTERN = /^[\w.:-]+$/;

/** The path prefix of the site's webpack chunks (Docusaurus puts them under /assets/js and /assets/css). */
const ASSETS_PREFIX = '/assets/';

/**
 * The path prefixes of the site's own API: /api/, and a function called by its own path (the
 * code editor's run). A request there holds a reload while it runs.
 */
const API_PREFIXES = Object.freeze(['/api/', '/.netlify/functions/']);

/**
 * What an open dialog looks like in the page (document.querySelector): ARIA dialogs (MUI's
 * Dialog paper, pickers, panels), a native <dialog open>, MUI's dialog root while it is still in
 * the page, and a grid cell in edit mode (an open select editor has no text focus).
 */
export const OPEN_DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"], dialog[open], .MuiDialog-root, .MuiDataGrid-cell--editing';

/** <input type=…> values that do not take typed text (focus on them does not block a reload). */
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

/** A usable build id (a short string of BUILD_ID_PATTERN), or null. */
export function cleanBuildId(value) {
	if (typeof value !== 'string') return null;
	if (value.length === 0 || value.length > MAX_BUILD_ID_LENGTH) return null;
	return BUILD_ID_PATTERN.test(value) ? value : null;
}

/** The id inside /build-id.json's parsed body ({ buildId }), or null when it is not one. */
export function buildIdFromJson(body) {
	if (!body || typeof body !== 'object') return null;
	return cleanBuildId(body.buildId);
}

/**
 * Should the page ask the server for the live id now?
 *   visible       the page is visible
 *   now           current time (ms)
 *   lastCheckAt   when it last asked (ms; the page's load time before the first check)
 *   force         true after a chunk failure (skip the interval)
 */
export function shouldCheck({ visible, now, lastCheckAt, force = false }) {
	if (force) return true;
	if (!visible) return false;
	return now - lastCheckAt >= CHECK_INTERVAL_MS;
}

/**
 * 'none' (same build, or not known), 'wait' (newer build, but something blocks) or 'reload'.
 *   loadedId          the page's own id (null under `npm start`)
 *   liveId            the id /build-id.json answered (null when unknown)
 *   unsavedWork       an editor holds unsaved text (reloader.js's `hasUnsavedWork` option)
 *   editing           a text field has focus (isTextEntry)
 *   dialogOpen        a dialog or a grid cell editor is open (OPEN_DIALOG_SELECTOR)
 *   requestsInFlight  number of requests to the site's own API (isApiRequest) not finished yet
 *   visible           the page is visible
 */
export function reloadDecision({ loadedId, liveId, unsavedWork, editing, dialogOpen = false, requestsInFlight, visible }) {
	if (!loadedId || !liveId || loadedId === liveId) return 'none';
	if (unsavedWork || editing || dialogOpen || requestsInFlight > 0 || !visible) return 'wait';
	return 'reload';
}

/** May a chunk failure reload the page now? (No other chunk reload in the last CHUNK_RELOAD_GUARD_MS.) */
export function chunkReloadAllowed({ now, lastChunkReloadAt }) {
	if (!Number.isFinite(lastChunkReloadAt)) return true;
	return now - lastChunkReloadAt >= CHUNK_RELOAD_GUARD_MS;
}

/** Is this rejection reason webpack's "a chunk could not be loaded"? */
export function isChunkLoadError(reason) {
	if (!reason || typeof reason !== 'object') return false;
	if (reason.name === 'ChunkLoadError') return true;
	return /Loading (CSS )?chunk [\w-]+ failed/.test(String(reason.message ?? ''));
}

/** Is `url` (string, resolved against `origin`) a path of this origin that starts with `prefix`? */
function isOwnPath(url, origin, prefix) {
	if (typeof url !== 'string' || url === '') return false;
	try {
		const parsed = new URL(url, origin);
		return parsed.origin === origin && parsed.pathname.startsWith(prefix);
	} catch {
		return false;
	}
}

/**
 * Did one of the site's own chunk files fail to load? `element` is the target of a window
 * 'error' event (captured): a <script src> or <link rel=stylesheet href> under /assets/.
 *   element   { tagName, src?, href?, rel? } (a DOM element, or a plain object in the tests)
 */
export function isAssetLoadFailure(element, origin) {
	if (!element || typeof element.tagName !== 'string') return false;
	const tag = element.tagName.toUpperCase();
	if (tag === 'SCRIPT') return isOwnPath(element.src, origin, ASSETS_PREFIX);
	if (tag === 'LINK' && String(element.rel ?? '').toLowerCase() === 'stylesheet') return isOwnPath(element.href, origin, ASSETS_PREFIX);
	return false;
}

/** Is this fetch() input (a string, URL or Request) a request to the site's own API (API_PREFIXES)? */
export function isApiRequest(input, origin) {
	const url = typeof input === 'string' ? input : (input?.url ?? input?.href ?? '');
	return API_PREFIXES.some((prefix) => isOwnPath(String(url), origin, prefix));
}

/**
 * Does this focused element take typed text? (<textarea>, a text-like <input>, anything
 * contenteditable, an EditContext host such as Monaco in Chromium.) `element` is
 * document.activeElement or a plain object in the tests.
 */
export function isTextEntry(element) {
	if (!element || typeof element.tagName !== 'string') return false;
	if (element.isContentEditable === true) return true;
	// An EditContext editing host (Monaco 0.55's div.native-edit-context in Chrome and Edge, and
	// any later EditContext editor): it takes typed text but reports isContentEditable === false.
	// `!= null`: the property is null where EditContext exists but is not set, undefined elsewhere.
	if (element.editContext != null) return true;
	const tag = element.tagName.toUpperCase();
	if (tag === 'TEXTAREA') return true;
	if (tag !== 'INPUT') return false;
	return !NON_TEXT_INPUT_TYPES.has(String(element.type ?? 'text').toLowerCase());
}
