/**
 * <CodeEditor> — an in-page code editor (Monaco, as in VS Code) that RUNS the code on the
 * site's code runner (a Piston server, through the Netlify functions in shared/functions/code-runner/) in
 * any language and version installed there, and can open with chosen blocks of code folded.
 *
 *     import CodeEditor from '@site/src/components/CodeEditor';
 *     import snippet from '!!raw-loader!./snippet-1.py';
 *
 *     <CodeEditor initialCode={snippet} foldedRegions={[[1, 6]]} />
 *     <CodeEditor initialCode={{ python: py, javascript: js }} version={{ python: '3.12' }} />
 *
 * Every prop, with examples (one language, several languages, folding, stdin, versions):
 * README.md beside this file. The old props (`editorSettings`, `outputSettings`) still work.
 *
 * THIS FILE  is what the server renders and the page loads first. Monaco touches `window`, so
 * the real editor (CodeEditorClient.jsx, with Monaco, MUI and the run logic) is loaded only in
 * the browser, lazily (BrowserOnly + React.lazy): it stays out of the page's main bundle. Until
 * it arrives, a placeholder of the SAME size is drawn — the same frame; the same header, with
 * the buttons as empty spaces of their size (so on a phone it wraps onto the same two lines);
 * the editor box (50vh, or the page's `height`; with height="fit" the code's height once its
 * folds are closed); the resize strip (inert here, with the same pill and grip); the stdin field
 * when it starts open (as many rows as the field will show); and the idle line (IdleLine.jsx) —
 * so the page never jumps when the editor appears.
 *
 * THE TEACHING LAYER (2026-10-25)  The placeholder draws what the real editor draws before
 * anything happens, so nothing moves when it arrives: the header's spaces for an exercise's
 * light bulb (the hints) and Solution icon buttons and its Check button (props.js > exerciseButtonsFor, which the
 * header reads too), the header's runtime slot for an exercise or a TypeScript editor (an
 * empty space as wide as the real header's slot, so both wrap at the same widths whatever the
 * version text turns out to be: props.js > runtimeSlotFor, which the header reads too), the step
 * bar under the code (StepBar.jsx, inert), and the exercise part of the output
 * (ExpectedOutput.jsx > ExercisePlaceholder: the collapsed "Expected output" block, INERT here —
 * the editor replaces it with a new element, so a block opened now would snap shut and lose the
 * keyboard focus; the failure frame leaves it working), and an exercise's hint cue on the idle
 * line ("Hints available: 3 (click [bulb] to reveal).", IdleLine.jsx: the same component, light
 * bulb included, that the output area draws). The failure frame leaves the cue out: it has no
 * light bulb to click (its header is empty spaces), and it replaces the editor instead of
 * standing in for it. The hints area is closed on every load (nothing
 * about it is saved) and the solution panel opens only on a click, so neither is drawn here. The
 * restored-draft notice may add one banner's height once a draft is found (only for
 * `saveDraft` editors that have one: accepted).
 *   An editor with an `id` or `loadWhenVisible` is wrapped in one element (styles.anchor) that
 * exists before Monaco loads: it carries the DOM id code-editor-<id> that <CodeRef> scrolls to
 * (lib/registry > editorDomId), and useNearViewport.js watches it — with
 * `loadWhenVisible` the real editor is made only when this element comes within one window
 * height of the view, or at once when a <CodeRef> asks for the editor (subscribeMountRequests).
 * Two editors with one id: the second is reported as soon as it is in the page (a console
 * warning, once per id) and never answers a <CodeRef> (useMountRequests; useGuided.js checks
 * the same before registering). An editor with neither prop renders exactly as before, with no
 * wrapper.
 *   Until then (in the browser, after hydration) the placeholder is WAITING: nothing is loading,
 * so it is not aria-busy and its box shows the snippet as plain text where Monaco will draw it
 * (styles.waitingCode, clipped to the box: the size does not change), so find-in-page, a
 * printout and a screen reader see the code. The server render and the moment the editor really
 * loads (the Suspense fallback) keep "Loading editor…" and aria-busy.
 *
 * PRINT (2026-10-26)  A printout shows every editor's whole code, in whatever state the page is:
 * the waiting placeholder prints its own box (its text, unclipped); the loading placeholder and
 * the failure frame, whose box holds only a message, carry a PRINT COPY of the snippet after the
 * resize strip, where the loaded editor puts its own (PrintOnlyCode: nothing on screen,
 * `display: none`, aria-hidden; the whole text in print,
 * wrapped, as PrintCopy.jsx prints the loaded editor's), so the server's HTML already holds the
 * code and a printout made before the editor's chunk arrives, or after it failed, is not blank.
 * The failure frame's box stays visible in print too (styles.editorBoxFailed), so its message
 * and Retry button print with the code. The ink is paper black whatever the theme, on each
 * copy's own white paper (styles.module.css > @media print: --ce-print-fg).
 *
 * THE READER'S THEME (2026-10-25)  The server cannot read the reader's stored theme
 * (localStorage), so the placeholder always draws the DEFAULT one, VS Code's, in the site's
 * light / dark mode; a stored theme recolours the editor when it arrives (colours only, never a
 * size). The placeholder carries no data-ce-mode: its colours follow the site's mode through
 * styles.module.css (html[data-theme='dark'] .frame:not([data-ce-mode])), which Docusaurus sets
 * before the first paint. A data-ce-mode written by the server would be the configured default
 * mode, not the reader's (useColorMode is the default until hydration), and a light-mode reader
 * would see a dark placeholder until the page's script ran. None of the theme files
 * (editorThemes.js, themeChoice.js, useEditorTheme.js, ThemeMenu.jsx) is imported here: they
 * stay out of the page's first download (__tests__/files.test.js).
 *
 * WHEN THE EDITOR'S CODE FAILS  (its chunk does not arrive — a dropped connection, or a deploy
 * that replaced it — or it throws while drawing) a small error boundary (ClientErrorBoundary)
 * shows the placeholder frame with EDITOR_ERRORS.clientFailed and a Retry button: only this
 * editor fails, never the whole page. Retry helps after a dropped connection; after a deploy
 * the page asks for a file that is gone, so the words name a reload as well. React.lazy keeps a failed import's error for ever, so a
 * failure swaps the shared lazy component for a NEW one (clientAfter: a fresh import()), which
 * Retry and every editor drawn later (another page of the same visit) use.
 *
 * THE TOUCH GATE (2026-10-26)  Which view the browser-only editor opens with — Monaco, or on a
 * touch-first device the static view (the code as text, "Tap to edit") — is decided here, once
 * per mount, inside the BrowserOnly callback: ClientEditor below (touchMode.js > viewFor). The
 * placeholder knows nothing of it.
 *
 * HOW TO CHANGE IT
 *   Props and defaults: props.js (normalizeEditorProps). The placeholder: EditorPlaceholder
 *   below and styles.module.css (it shares the real editor's classes; keep ICON_BUTTONS equal
 *   to the icon buttons Toolbar.jsx draws, and iconSpacesFor in step with props.js >
 *   exerciseButtonsFor — __tests__/render.test.js and __tests__/backCompat.test.js compare
 *   them; the runtime slot's widths: styles.module.css > --ce-runtime-slot). The waiting
 *   placeholder's text: props.js > waitingCodeStyle and styles.module.css > .waitingCode; the
 *   print copy of the other two frames: PrintOnlyCode and styles.module.css > .printOnly. The
 *   idle line and its hint cue: IdleLine.jsx (shared with OutputPanel.jsx, so the two always
 *   match). The failure's words: messages.js. How early a lazy editor loads: useNearViewport.js.
 *   Everything else: CodeEditorClient.jsx and the files it imports (README.md has the map).
 */

import React, { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { editorDomId, reportDuplicateEditor, subscribeMountRequests } from './lib/registry/index.js';
import { ExercisePlaceholder } from './ExpectedOutput.jsx';
import IdleLine from './IdleLine.jsx';
import { EDITOR_ERRORS, LABELS, LOADING_EDITOR } from './messages.js';
import { exerciseButtonsFor, initialBoxStyle, normalizeEditorProps, runtimeSlotFor, titleFor, waitingCodeStyle } from './props.js';
import { stdinRows } from './sizing.js';
import { ResizeGrip } from './ResizeHandle.jsx';
import StepBar from './StepBar.jsx';
import { viewFor } from './touchMode.js';
import { useNearViewport } from './useNearViewport.js';
import styles from './styles.module.css';

/**
 * The header's icon buttons (Toolbar.jsx): Reset · Copy code · Clear · Input (stdin) · Copy output
 * · Theme (ThemeMenu.jsx, 2026-10-25). A read-only editor has no Clear. Only the count matters
 * here: every icon button is the same size, so their order (set on 2026-10-26) is the Toolbar's.
 */
const ICON_BUTTONS = 6;
const ICON_BUTTONS_READ_ONLY = 5;

/** How many icon-button spaces the placeholder's header draws: the six (five read-only), plus the hints' light bulb and Solution when the editor has them. */
export function iconSpacesFor(settings) {
	const buttons = exerciseButtonsFor(settings, settings.language);
	const base = settings.readOnly ? ICON_BUTTONS_READ_ONLY : ICON_BUTTONS;
	return base + (buttons.hint ? 1 : 0) + (buttons.solution ? 1 : 0);
}

/** A new lazy component for the browser-only editor, in its own chunk (each one imports again). */
function lazyClient() {
	return lazy(() => import('./CodeEditorClient.jsx'));
}

/** The lazy editor that editors start with (shared: one import for the whole page). */
let pageClient = lazyClient();

/**
 * The lazy editor to use once `failed` has failed: a fresh one, made once per failure and shared
 * with every editor drawn after it (React.lazy would only replay the old error).
 */
function clientAfter(failed) {
	if (pageClient === failed) pageClient = lazyClient();
	return pageClient;
}

/**
 * Catches a failure of the lazily loaded editor (its chunk did not arrive, or it threw while
 * drawing): shows `fallback` instead and calls `onError`, so only this editor fails, not the
 * page. A new `key` starts it afresh (Retry).
 */
class ClientErrorBoundary extends Component {
	constructor(props) {
		super(props);
		this.state = { failed: false };
	}

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch() {
		this.props.onError?.();
	}

	render() {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

/** The header's buttons as empty spaces of their size, so the placeholder's header wraps like the real one (Check's when it has one). */
function ActionSpacers({ count, check = false }) {
	return (
		<div className={styles.actions} aria-hidden="true">
			{Array.from({ length: count }, (_, index) => (
				<span key={index} className={styles.iconSpacer} />
			))}
			{check ? (
				<span className={styles.runGroup}>
					<span className={`${styles.checkButton} ${styles.checkSpacer}`} />
					<span className={`${styles.runButton} ${styles.runSpacer}`} />
				</span>
			) : (
				<span className={`${styles.runButton} ${styles.runSpacer}`} />
			)}
		</div>
	);
}

/** The stdin field's space: as many rows as the field will show (sizing.js > stdinRows). */
function StdinSpacer({ stdin }) {
	return (
		<div className={styles.stdin}>
			<div className={styles.stdinPlaceholder} style={{ '--ce-stdin-rows': stdinRows(stdin) }} />
		</div>
	);
}

/** The editor box's message: "Loading editor…", or (with `onRetry`) the failure and a Retry button. */
function BoxMessage({ onRetry }) {
	if (!onRetry) return <div className={styles.cover}>{LOADING_EDITOR}</div>;
	return (
		<div className={styles.cover} role="alert">
			<span>{EDITOR_ERRORS.clientFailed}</span>
			<button type="button" className={styles.retryButton} onClick={onRetry}>
				{LABELS.retry}
			</button>
		</div>
	);
}

/** The snippet the editor will show (without its magic comments, as props.js prepared it). */
function snippetOf(settings) {
	return settings.snippets.code[settings.language];
}

/**
 * What the editor box holds: while WAITING (see the header) the snippet as plain text where
 * Monaco will draw it, else BoxMessage.
 */
function BoxContent({ settings, onRetry, waiting }) {
	if (!waiting) return <BoxMessage onRetry={onRetry} />;
	return (
		<pre className={styles.waitingCode} style={waitingCodeStyle(settings)}>
			{snippetOf(settings)}
		</pre>
	);
}

/**
 * The print copy of the snippet for a frame whose box holds only a message (PRINT in the
 * header): nothing on screen, the whole text in print, in the waiting text's metrics.
 */
function PrintOnlyCode({ settings }) {
	return (
		<pre className={styles.printOnly} style={waitingCodeStyle(settings)} aria-hidden="true">
			{snippetOf(settings)}
		</pre>
	);
}

/** The header's runtime slot as an empty space of its width (props.js > runtimeSlotFor); nothing for an editor without one. */
function RuntimeSlotSpacer({ slot }) {
	if (slot === null) return null;
	return <div className={styles.runtimeSlot} data-slot={slot} aria-hidden="true" />;
}

/** The box's classes: the waiting and the failed box each keep a class the print rules read (PRINT in the header). */
export function boxClassOf({ waiting, failed }) {
	if (waiting) return `${styles.editorBox} ${styles.editorBoxWaiting}`;
	if (failed) return `${styles.editorBox} ${styles.editorBoxFailed}`;
	return styles.editorBox;
}

/**
 * What the server renders, and what shows until the editor has loaded: the editor's frame at its
 * final size. With `onRetry` it is the failure frame instead (ClientErrorBoundary); with
 * `waiting` it stands in for a loadWhenVisible editor that is not near yet (see the header).
 * Exported for __tests__/render.test.js (a server render cannot reach the error boundary).
 */
export function EditorPlaceholder({ settings, onRetry = null, waiting = false }) {
	const title = titleFor(settings, settings.language);
	const buttons = exerciseButtonsFor(settings, settings.language);
	const slot = runtimeSlotFor({ buttons, language: settings.language, languageCount: settings.snippets.languages.length });
	const loading = !onRetry && !waiting;
	const boxClass = boxClassOf({ waiting, failed: Boolean(onRetry) });
	return (
		<div className={styles.frame} aria-busy={loading ? 'true' : undefined}>
			<div className={styles.toolbar}>
				<div className={styles.identity}>
					<span className={styles.title}>{title}</span>
					<RuntimeSlotSpacer slot={slot} />
				</div>
				<ActionSpacers count={iconSpacesFor(settings)} check={buttons.check} />
			</div>
			<div className={boxClass} style={initialBoxStyle(settings, settings.language)}>
				<BoxContent settings={settings} onRetry={onRetry} waiting={waiting} />
			</div>
			<div className={`${styles.resizeHandle} ${styles.resizeHandleInert}`} aria-hidden="true">
				<ResizeGrip />
			</div>
			{/* after the strip, where the loaded editor puts its PrintCopy (CodeEditorClient.jsx) */}
			{waiting ? null : <PrintOnlyCode settings={settings} />}
			<StepBar steps={settings.steps} />
			{settings.showStdin ? <StdinSpacer stdin={settings.stdin} /> : null}
			<div className={styles.output}>
				{/* No hint cue in the failure frame: there is no light bulb to click (see THE TEACHING LAYER); and no Run to name. */}
				<IdleLine hintCount={onRetry ? 0 : settings.hints.length} unavailable={Boolean(onRetry)} />
				<ExercisePlaceholder expectedOutput={settings.expectedOutput} hasChecks={buttons.check} inert={!onRetry} />
			</div>
		</div>
	);
}

/** The lazy editor inside its error boundary; each Retry is a new attempt (a new key and a fresh lazy editor). `view`: the gate's answer (ClientEditor). */
function LoadedEditor({ settings, view }) {
	const [attempt, setAttempt] = useState(() => ({ number: 0, Client: pageClient }));
	const { number, Client } = attempt;
	const forgetFailure = useCallback(() => clientAfter(Client), [Client]);
	const retry = useCallback(() => {
		const next = clientAfter(Client);
		setAttempt((previous) => ({ number: previous.number + 1, Client: next }));
	}, [Client]);
	return (
		<ClientErrorBoundary key={number} onError={forgetFailure} fallback={<EditorPlaceholder settings={settings} onRetry={retry} />}>
			<Suspense fallback={<EditorPlaceholder settings={settings} />}>
				<Client settings={settings} view={view} />
			</Suspense>
		</ClientErrorBoundary>
	);
}

/**
 * THE TOUCH GATE (2026-10-26)  Rendered only inside BrowserOnly's callback (so `window` always
 * exists) and read ONCE, when the editor mounts: a touch-first device (touchMode.js >
 * TOUCH_MEDIA_QUERY: a phone, a tablet) gets the STATIC VIEW — the code as highlighted text that
 * scrolls with the page, with a "Tap to edit" bar that mounts Monaco — and every other device
 * Monaco exactly as before. Pairing a keyboard later never flips a mounted editor; a
 * `loadWhenVisible` editor decides when it becomes visible. The placeholder is the same either
 * way (the server cannot know the device).
 */
function ClientEditor({ settings }) {
	const [view] = useState(() => viewFor(globalThis.window));
	return <LoadedEditor settings={settings} view={view} />;
}

/**
 * Is `anchor` the element a <CodeRef to={id}> scrolls to: the FIRST on the page with the editor's
 * DOM id (document.getElementById)? true when it cannot be told (no element yet, no document).
 */
export function ownsDomId(anchor, id) {
	const found = anchor?.ownerDocument?.getElementById(editorDomId(id));
	return !found || found === anchor;
}

/**
 * A named editor, once its anchor is in the page: a second editor with the same id is reported
 * at once (the registry's warning, once per id — even when that editor never loads), and only
 * the first one takes <CodeRef> requests. A <CodeRef> to a loadWhenVisible editor mounts it at
 * once (lib/registry > subscribeMountRequests: told when a request for this id has
 * to wait); the duplicate never subscribes, so a reference never loads it.
 */
function useMountRequests(settings, anchorRef, mountNow) {
	useEffect(() => {
		if (settings.id === null) return undefined;
		if (!ownsDomId(anchorRef.current, settings.id)) {
			reportDuplicateEditor(settings.id);
			return undefined;
		}
		if (!settings.loadWhenVisible) return undefined;
		return subscribeMountRequests(settings.id, mountNow);
	}, [settings.id, settings.loadWhenVisible, anchorRef, mountNow]);
}

/** <CodeEditor {...props} /> — see the header and README.md. */
export default function CodeEditor(props) {
	// Read once per props object: the visibility state below re-renders this component with the same props.
	const settings = useMemo(() => normalizeEditorProps(props), [props]);
	const anchorRef = useRef(null);
	const [visible, mountNow] = useNearViewport(anchorRef, { enabled: settings.loadWhenVisible });
	useMountRequests(settings, anchorRef, mountNow);
	const editor = (
		<BrowserOnly fallback={<EditorPlaceholder settings={settings} />}>
			{() => (visible ? <ClientEditor settings={settings} /> : <EditorPlaceholder settings={settings} waiting />)}
		</BrowserOnly>
	);
	if (settings.id === null && !settings.loadWhenVisible) return editor; // exactly as before: no wrapper
	return (
		<div ref={anchorRef} id={settings.id === null ? undefined : editorDomId(settings.id)} className={styles.anchor}>
			{editor}
		</div>
	);
}
