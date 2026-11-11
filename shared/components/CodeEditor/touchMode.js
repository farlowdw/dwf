/**
 * touchMode.js — the gate between the editor's two views, and the rules that depend on it.
 * Pure: no React, no DOM, so `node --test` checks it (__tests__/touchMode.test.js). It imports
 * only runtimeChoice.js (already in the page's first download through props.js), so it may be
 * read by index.jsx before the lazy editor loads (__tests__/files.test.js's first-download walk).
 *
 * THE TWO VIEWS (2026-10-26)
 *   VIEWS.monaco   Monaco, exactly as before: every device whose primary pointer hovers or is
 *                  fine (a desktop, a laptop, an iPad with a trackpad still counts as touch —
 *                  WebKit flips only `any-hover` / `any-pointer` for it).
 *   VIEWS.static   the touch reading mode: the code as highlighted text that scrolls with the
 *                  page (StaticBox.jsx), with a "Tap to edit" bar that mounts Monaco.
 * The device is read ONCE, at the editor's mount (index.jsx: viewFor(window) inside the
 * BrowserOnly callback, so a window always exists): pairing a keyboard later never flips a
 * mounted editor. The real editor's frame carries TOUCH_ATTRIBUTE whenever the gate said touch,
 * before AND after Tap to edit; every touch rule of the editor's CSS keys on that attribute, and
 * the stylesheets hold no media query of their own (__tests__/viewGate.test.js).
 *
 * THE BOX AFTER THE TAP (2026-10-26)  The static view has no height of its own (the page
 *   scrolls past the code), so the page's `height` was never shown on this device. Taking it at
 *   the tap — 50vh by default — moved the content below by the difference, under the reader's
 *   finger, and a short program left an empty editor area where Monaco's touch handler swallows
 *   every swipe (the page could then be scrolled only on the gutter or the margins). So on a
 *   touch-first device the Monaco box FITS THE CODE, up to the screen: touchSettings replaces the
 *   page's sizing with TOUCH_BOX (`fit`, the machinery of height="fit": sizing.js, autoHeight.js),
 *   and the resize strip still lets the reader make it bigger (a drag ends the fitting, as it
 *   does for a fit editor; a double-tap brings the fitting back).
 *
 * RUNNING FROM THE STATIC VIEW  Run and Check read the static text and send it as the Monaco
 *   view would (RUN_POLICIES.now) — except a language compiled in the reader's browser
 *   (TypeScript: runtimeChoice.js > BROWSER_COMPILED), which needs Monaco's worker: the click
 *   mounts Monaco first and the action runs once it has a model (RUN_POLICIES.mountFirst;
 *   CodeEditorClient.jsx + usePendingAction.js).
 *
 * WHEN MONACO CANNOT LOAD AFTER THE TAP (2026-11-10)  Monaco's files fail (a lost connection, a
 *   missing file): the Monaco view would show no code and a greyed-out Run. On a touch-first
 *   device the static view can do without Monaco, so the editor goes back to it
 *   (viewAfterLoad): the code and Run come back under the error's notice, a Run or Check that
 *   waited for Monaco is dropped, and "Tap to edit" is greyed out (the loader keeps its failure,
 *   so a second tap would fail at once). A desktop has no static view and stays as it is. Run and
 *   Check stay disabled in the static view only for a language compiled in Monaco's worker
 *   (runBlockingError).
 *
 * HOW TO CHANGE IT
 *   Which devices get the static view: TOUCH_MEDIA_QUERY (it must stay a media query the
 *   browser answers at mount; the editor never listens for changes). The attribute the CSS
 *   keys on: TOUCH_ATTRIBUTE (static.module.css reads the same name). Which languages mount
 *   Monaco before a run: runtimeChoice.js > BROWSER_COMPILED, never a list here. How tall the
 *   box is after the tap: TOUCH_BOX (its `maxHeight`; MIN_HEIGHT_PX in sizing.js floors it).
 */

import { compilesInBrowser } from './runtimeChoice.js';

/** The editor's two views (see the header). */
export const VIEWS = Object.freeze({ monaco: 'monaco', static: 'static' });

/**
 * The devices that get the static view: a primary pointer that cannot hover and is coarse — a
 * phone or a tablet, with or without a keyboard. Both conditions, so a touch-screen laptop (its
 * primary pointer is the fine, hovering trackpad) keeps Monaco.
 */
export const TOUCH_MEDIA_QUERY = '(hover: none) and (pointer: coarse)';

/** The attribute on the editor's frame while the gate said touch (the CSS's only touch hook). */
export const TOUCH_ATTRIBUTE = 'data-ce-touch';

/** What a Run or Check click does in the static view (staticRunPolicy). */
export const RUN_POLICIES = Object.freeze({
	now: 'now', // send the static text as it is
	mountFirst: 'mountFirst', // mount Monaco, then run (the language is compiled in the browser)
});

/**
 * Is `win` a touch-first device (TOUCH_MEDIA_QUERY matches)? False without a window, without
 * matchMedia (an old browser, a test), or when matchMedia throws: the editor then stays Monaco,
 * exactly as before.
 */
export function isTouchFirst(win = globalThis.window) {
	if (!win || typeof win.matchMedia !== 'function') return false;
	try {
		return win.matchMedia(TOUCH_MEDIA_QUERY).matches === true;
	} catch {
		return false;
	}
}

/** The view an editor mounting in `win` opens with. */
export function viewFor(win = globalThis.window) {
	return isTouchFirst(win) ? VIEWS.static : VIEWS.monaco;
}

/**
 * The sizing of the Monaco box that mounts after "Tap to edit" (THE BOX AFTER THE TAP): it fits
 * the code, up to the whole screen, so a long program still gets a screen of editor.
 */
export const TOUCH_BOX = Object.freeze({ fit: true, height: null, maxHeight: '100vh' });

/**
 * `settings` (props.js > normalizeEditorProps) for an editor that opened in the static view: the
 * page's sizing replaced by TOUCH_BOX, everything else as it is. A new object; `settings` is
 * not touched. Off touch the shell keeps the page's settings by identity (CodeEditorClient.jsx).
 */
export function touchSettings(settings) {
	return { ...settings, ...TOUCH_BOX };
}

/** How a Run or Check from the static view proceeds for `language` (any name the run library knows; see the header). */
export function staticRunPolicy(language) {
	return compilesInBrowser(language) ? RUN_POLICIES.mountFirst : RUN_POLICIES.now;
}

/**
 * The view to show now that Monaco's load has an answer (WHEN MONACO CANNOT LOAD AFTER THE TAP):
 * an editor that opened in the static view (`initialView`) and moved to Monaco goes back to the
 * static view when Monaco failed (`editorError`) before it was up (`monacoReady`); otherwise `view`.
 */
export function viewAfterLoad({ initialView, view, editorError, monacoReady }) {
	if (initialView === VIEWS.static && view === VIEWS.monaco && editorError && !monacoReady) return VIEWS.static;
	return view;
}

/**
 * The error that greys out Run and Check in `view` for `language`, or null: the Monaco view cannot
 * run without Monaco; the static view sends its own text, except for a language compiled in
 * Monaco's worker (staticRunPolicy), whose Run would only mount Monaco and fail again.
 */
export function runBlockingError({ view, language, editorError }) {
	if (!editorError) return null;
	if (view === VIEWS.monaco || staticRunPolicy(language) === RUN_POLICIES.mountFirst) return editorError;
	return null;
}
