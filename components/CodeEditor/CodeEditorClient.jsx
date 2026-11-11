/**
 * CodeEditorClient.jsx — the browser half of <CodeEditor>: everything that touches Monaco or
 * `window`. index.jsx loads it lazily, in the browser only (BrowserOnly + React.lazy), so Monaco,
 * MUI and this file stay out of the page's first download and out of the server render.
 *
 * WHAT IT DOES
 *   - Monaco from the site itself (useMonacoLoader.js: /vendor/monaco-editor-<version>/vs, served by
 *     shared/plugins/monaco-editor), in the theme the reader picked in the header's Theme menu
 *     (2026-10-25: useEditorTheme.js, remembered in their browser; one theme for every editor
 *     of the page, since Monaco has one) — by default VS Code's own light and dark themes,
 *     following the light / dark switch, exactly as before. The whole editor takes the theme
 *     (CodeEditorClient below): Monaco (its custom themes registered in beforeMount:
 *     editorThemes.js > defineEditorThemes), the frame's --ce-* colours and its data-ce-mode
 *     (editorThemes.js > frameAttributesOf; the CSS modules switch on that mode, not the
 *     site's), and the MUI controls (<MuiScope mode>, the editor's own ThemeProvider: MuiScope.jsx).
 *     Monaco, the frame and the solution diff
 *     always show the SAME theme, the reader's: a page cannot pin one (props.js >
 *     PAGE_THEME_WARNING), since Monaco's theme is page-wide and a pinned editor's frame would
 *     disagree with its code.
 *   - One Monaco text model per language (monacoSetup.js > modelPath, through <Editor path>):
 *     the language picker switches models, so each language keeps its own edits, undo history
 *     and folds. The addresses carry this editor's useId(), so two editors on a page never
 *     share a model. The models are disposed together with the editor (its onDidDispose),
 *     never earlier. The editor's listeners (⌘/Ctrl+Enter, the auto height, the model switch,
 *     the run-error markers, TypeScript's type queries) live in an effect, so they come back
 *     when React re-runs effects (Fast Refresh, StrictMode).
 *   - The author's folds (folding.js) close when a language is first shown — while they close,
 *     the code is covered by the loading box AND the box keeps its height (useFitHeight's
 *     hold), so neither the code nor the page below jumps — and again on Reset. A language with
 *     no folds is left as it is on its first show (folding.js > NOTHING TO FOLD), so a waiting
 *     <CodeRef> does not wait for Monaco's folding model. Switching back to a language keeps
 *     the reader's own folds.
 *   - The version menu and what Run sends: runtimeChoice.js (from the installed runtimes,
 *     useRuntimes.js). Runs: useCodeRun.js. Output: OutputPanel.jsx. Header: Toolbar.jsx.
 *   - ⌘/Ctrl+Enter in the editor runs: an editor ACTION (editor.addAction), scoped to this
 *     editor and calling the CURRENT run function through a ref. (editor.addCommand is global
 *     in Monaco's standalone editor: with two editors on a page, the last one's command ran
 *     for both, and it can never be removed.)
 *   - The box is 50vh by default (or the page's `height`); the reader can drag it taller or
 *     shorter with the strip under the code (ResizeHandle.jsx; a double-click goes back).
 *   - With height="fit", the box follows the code's height (onDidContentSizeChange and
 *     onDidLayoutChange, through fitWhenLaidOut — never a height Monaco measured in a hidden box,
 *     monacoSetup.js > laidOutContentHeight — applied in
 *     the next animation frame so Monaco's own resize observer never loops: autoHeight.js),
 *     between sizing.js > MIN_HEIGHT_PX and `maxHeight`. Monaco sends no size event when it
 *     shows a model again, so a switch back to a language fits the box itself
 *     (handleModelShown). While the fold cover is up the new heights are only remembered; the
 *     last one is applied when the folds are done, when the cover's safety timer
 *     (FOLD_COVER_MAX_MS) gives up, or when a newer fold without a cover takes over. A drag on
 *     the resize strip stops the fitting (the reader's height stays) until a double-click.
 *   - While any language's code differs from the page's, the editor's unsavedWork.js flag is
 *     set, and a site's after-deploy reloader (which reads the flag) does
 *     not reload the tab: the reader's edits are not thrown away. The
 *     page's snippets have \n line endings only (the library's normalizeSnippets), like the text
 *     Monaco hands back, so untouched code always compares equal. A restored draft counts as
 *     edited from the start, shown or not (Monaco sends no change event for the code an editor
 *     opens with): useUnsavedWork, dirtyLanguages.js. Typed program input (stdin) sets the
 *     flag too, under a holder of its own, while it differs from the page's: the reloader holds
 *     a focused field by itself, but the input stays typed after the focus has left. Putting
 *     the field back to the page's value (emptying it, on a page that gives none) ends that
 *     hold; Reset does not, it is about the code (useUnsavedInput.js).
 *   - Reset and Clear are single undoable edits (⌘/Ctrl+Z brings the reader's code back), and
 *     both put the focus in the editor, so ⌘/Ctrl+Z works at once (and the draft notice's
 *     Discard, which is Reset and unmounts with its notice, never drops the focus to the page).
 *   - Copy code copies the editor's text — or the page's snippet while there is no editor
 *     (Monaco still loading, or failed to load), never an empty clipboard.
 *   - The run limits are the library's effectiveLimits (the page's, clamped to the code
 *     runner's: at most 3 s to run, 10 s to compile). They are kept with the run, like its
 *     "Running …" label, so the status line ("Time limit exceeded (3 s)") names the limit the run
 *     really had.
 *
 * THE TWO VIEWS AND THE SURFACE (2026-10-26)  index.jsx decides ONCE, when the editor mounts,
 *   whether the device is touch-first (touchMode.js: a phone, a tablet) and passes `view`:
 *   - VIEWS.monaco (a desktop): Monaco exactly as before — the same options, the same markup,
 *     nothing of the touch mode in the DOM (__tests__/viewGate.test.js, backCompat.test.js).
 *   - VIEWS.static (touch): the STATIC VIEW instead of the Monaco box and the resize strip —
 *     the code as highlighted text in the chosen theme that scrolls with the page, the marks,
 *     the step and a <CodeRef>'s flash drawn on its lines, folds as "⋯ N lines" markers
 *     (StaticBox.jsx, StaticCode.jsx, staticCodeStore.js) — and under it the full-width
 *     "Tap to edit" bar. Monaco is not even downloaded until the tap (useMonacoLoader's
 *     `enabled`). The tap (startEditing) mounts Monaco with touch options (props.js >
 *     buildMonacoOptions' `touch`: touchOptions.js) in a box AS TALL AS THE CODE, up to the
 *     screen — starting at the static view's own height (staticCodeHeight, withTapHeight), so
 *     the tap changes nothing until Monaco has laid out
 *     (touchMode.js > touchSettings: the fit machinery with TOUCH_BOX, so the tap moves
 *     nothing below the editor and no empty area swallows swipes; the strip still resizes it),
 *     with the static view's current text; the output, hints, steps, drafts, theme and stdin stay; the
 *     author's folds are applied again only where the text is still the snippet
 *     (useDrafts.js > foldsFor(lang, text)), and the marks of a language left stale by Clear or
 *     "Use this solution" stay off until Reset (foldLanguage's `skipMarks`). There is no way
 *     back to the static view (a follow-up) — except when Monaco cannot load after the tap
 *     (touchMode.js > viewAfterLoad): the static view comes back, with the text it held
 *     (staticDrafts), under the error's notice, a Run or Check that waited for Monaco is dropped
 *     (usePendingAction.js > cancel), "Tap to edit" is greyed out, and Run stays greyed out only
 *     for a language that compiles in Monaco (runBlockingError). The frame carries TOUCH_ATTRIBUTE (data-ce-touch)
 *     in both states, the only hook the touch CSS keys on (static.module.css: a 16 px Monaco
 *     textarea so iOS does not zoom, the same for the Input field).
 *   Whichever view, the shell and its hooks talk to the code through ONE SURFACE (surface.js:
 *   monacoSurface.js over Monaco, staticSurface.js over the static view): `surfaceRef` for the
 *   handlers, `surface` in React's state for the hooks and the buttons (`surfaceReady`, which
 *   is what "the editor is up" means now). What only Monaco can do keeps `editorRef` /
 *   `monacoRef`: the fold pass (folding.js, the cover, the fit height), TypeScript
 *   (typescript.js, typescriptRun.js, twoslash.js), the Monaco solution diff (SolutionPanel.jsx;
 *   the static view shows a plain diff: StaticSolution.jsx), the ⌘/Ctrl+Enter action. Run and
 *   Check from the static view send its text as they would Monaco's; a TypeScript editor must
 *   compile in Monaco's worker, so its Run or Check mounts Monaco first and the action runs
 *   once it has a model (touchMode.js > staticRunPolicy, usePendingAction.js). The idle line
 *   on touch names no ⌘/Ctrl+Enter (OutputPanel.jsx > touch).
 *   PRINT: in the Monaco view a hidden copy of the code follows the box (PrintCopy.jsx, shown
 *   only in print, refreshed with the editor's text on `beforeprint`; styles.module.css hides
 *   the box and the strip there); the static view prints its own lines, folds opened.
 *
 * THE TEACHING LAYER (2026-10-25; each part only with its props, except the run-error markers)
 *   - Run-error markers (every editor; `hideErrors` turns them off): after a failed run the
 *     lines its errors point to are squiggled and listed as "Line N" rows (useRunErrors.js).
 *     What a run sent is kept with it (lastRun.sent, runErrors.js > sentRecord), so its answer
 *     is read against the code that ran, not the code on screen.
 *   - Magic comments, `highlight`, `steps` and <CodeRef> (useGuided.js; the step bar under the
 *     code, StepBar.jsx). The snippets come without their magic comment lines (props.js).
 *     Screen readers get the marks in words (a hidden summary before the code) and a
 *     <CodeRef>'s result in a hidden status region; reveals wait for a fold pass to end
 *     (foldLanguage tells useGuided.js: foldsStarted … foldsEnded).
 *   - An exercise: `expectedOutput`, Check (`tests`), Solution, the hints' light bulb
 *     (useExercise.js; the hints area and the solution panel under the step bar, the exercise
 *     panel in the output area). While the hints area is closed, the idle line names how many
 *     hints there are (useExercise.js > hints.cue, passed as OutputPanel.jsx > hintCue;
 *     IdleLine.jsx); the placeholder draws the same.
 *   - `saveDraft` (useDrafts.js; the "Restored your saved code · Discard" notice under the
 *     header; Discard is Reset, and the focus goes to the editor).
 *   - TypeScript is checked and compiled in the browser by Monaco's own TypeScript
 *     (typescript.js > configureTypeScript in beforeMount; typescriptRun.js when Run or Check is
 *     pressed) and the emitted JavaScript runs on the newest Node (runtimeChoice.js). A syntax
 *     error stops the run with "Line N" rows; type errors do not ("· 2 type errors"). `// ^?`
 *     shows an inferred type (twoslash.js).
 *   - `loadWhenVisible` and the DOM id `code-editor-<id>` live in index.jsx (before Monaco).
 * The props are read once, when the editor mounts (`settings`, from props.js): a Monaco model
 * keeps its own text, so a later prop change could not reach it anyway. Under `npm start`,
 * reload the page to see a changed snippet.
 *
 * HOW TO CHANGE IT
 *   Words: messages.js (the panels: their own WORDS). Monaco's options: props.js >
 *   DEFAULT_EDITOR_OPTIONS (or a page's `editorOptions`); on touch: touchOptions.js. Colours: the themes are editorThemes.js
 *   (Monaco's and the frame's colours together; the default family there), the frame's layout
 *   and the placeholder's colours styles.module.css (--ce-*). The run request: run() / runPayload() below and
 *   the library's request.js (effectiveLimits, buildExecuteRequest). The ⌘/Ctrl+Enter key:
 *   runKeybinding(). The stdin field's rows: sizing.js > STDIN_*_ROWS. A teaching feature: the
 *   hook named above (each keeps its own state and rules), not this file. Which devices get
 *   the static view: touchMode.js. What the static view draws: StaticCode.jsx and its CSS.
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import { usePluginData } from '@docusaurus/useGlobalData';
import { buildExecuteRequest, effectiveLimits, languageInfo } from './lib/codeRunner/index.js';
import { setUnsavedWork } from './unsavedWork.js';
import { useUnsavedInput } from './useUnsavedInput.js';
import { createAutoHeight } from './autoHeight.js';
import { monacoLayoutSettled, monacoLinesBox } from './CodeRef/goToEditor.js';
import { createDirtyLanguages } from './dirtyLanguages.js';
import { WORDS as DRAFT_WORDS } from './drafts.js';
import MuiScope from './MuiScope.jsx';
import { defineEditorThemes, frameAttributesOf } from './editorThemes.js';
import { firstFamilyOf, resolveFontFamily } from './editorFont.js';
import { applyFolds } from './folding.js';
import HintList from './HintList.jsx';
import { CHECK_DISABLED, EDITOR_ERRORS, LABELS, LOADING_EDITOR, RUN_DISABLED } from './messages.js';
import { disposeModels, ignoreMonacoCancellations, laidOutContentHeight, modelPath, remeasureFontsWhenLoaded } from './monacoSetup.js';
import { createMonacoSurface } from './monacoSurface.js';
import PrintCopy from './PrintCopy.jsx';
import { buildMonacoOptions, initialBoxStyle, languageOptions, titleFor } from './props.js';
import { sentRecord } from './runErrors.js';
import { chooseRuntime, compilesInBrowser } from './runtimeChoice.js';
import { STDIN_MAX_ROWS, STDIN_MIN_ROWS } from './sizing.js';
import SolutionPanel from './SolutionPanel.jsx';
import StaticBox from './StaticBox.jsx';
import { TOUCH_BAR_SELECTOR } from './staticSurface.js';
import StaticSolution from './StaticSolution.jsx';
import StepBar from './StepBar.jsx';
import { SURFACE_KINDS } from './surface.js';
import { RUN_POLICIES, TOUCH_ATTRIBUTE, VIEWS, runBlockingError, staticRunPolicy, touchSettings, viewAfterLoad } from './touchMode.js';
import { applyTypeQueries } from './twoslash.js';
import { configureTypeScript, typeScriptNamespace } from './typescript.js';
import { BlockedRunError, compileForRun } from './typescriptRun.js';
import { copyText } from './clipboard.js';
import { copyableOutput } from './output.js';
import OutputPanel from './OutputPanel.jsx';
import ResizeHandle from './ResizeHandle.jsx';
import Toolbar, { COPY_STATES } from './Toolbar.jsx';
import { RUN_PHASES, useCodeRun } from './useCodeRun.js';
import { useDrafts } from './useDrafts.js';
import { useEditorTheme } from './useEditorTheme.js';
import { useExercise } from './useExercise.js';
import { useGuided } from './useGuided.js';
import { useMonacoLoader } from './useMonacoLoader.js';
import { PENDING_ACTIONS, usePendingAction } from './usePendingAction.js';
import { useRunErrors } from './useRunErrors.js';
import { useRuntimes } from './useRuntimes.js';
// Global classes for Monaco's decorations (the marked lines and the type queries' answers).
import './guided.module.css';
import './twoslash.module.css';
import styles from './styles.module.css';

/** The plugin that serves Monaco (shared/plugins/monaco-editor): usePluginData(PLUGIN_NAME).vsPath. */
const PLUGIN_NAME = 'monaco-editor';

/** The editor action behind ⌘/Ctrl+Enter (also listed in Monaco's F1 command palette as "Run code"). */
const RUN_ACTION_ID = 'codeEditor.run';

/** How long the copy button shows its check mark (or its failure). */
const COPY_FEEDBACK_MS = 1500;

/** The longest the code stays covered while the first folds close (ms): a safety net, folding takes a frame or two. */
const FOLD_COVER_MAX_MS = 2000;

/** ⌘/Ctrl+Enter, from Monaco's key codes. */
function runKeybinding(monaco) {
	return monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter;
}

/** Why Run is disabled right now, or null when it is enabled (`pending`: a Run or Check waiting for Monaco to mount, on touch). */
function runDisabledReason({ editorError, surfaceReady, canRun, isEmpty, checking, pending = false }) {
	if (editorError) return RUN_DISABLED.noEditor;
	if (!surfaceReady || pending) return RUN_DISABLED.loading;
	if (!canRun) return RUN_DISABLED.notInstalled;
	if (isEmpty) return RUN_DISABLED.empty;
	if (checking) return RUN_DISABLED.checking;
	return null;
}

/** Why an exercise's Check is disabled right now, or null when it is enabled. */
function checkDisabledReason({ editorError, surfaceReady, canRun, isEmpty, running, pending = false }) {
	if (editorError) return CHECK_DISABLED.noEditor;
	if (!surfaceReady || pending) return CHECK_DISABLED.loading;
	if (!canRun) return CHECK_DISABLED.notInstalled;
	if (isEmpty) return CHECK_DISABLED.empty;
	if (running) return CHECK_DISABLED.running;
	return null;
}

/** Is this text empty for running purposes (nothing but white space)? */
function isBlank(text) {
	return (text ?? '').trim() === '';
}

/** The page's snippet for `language` ('' when it gave none): \n line endings only, magic comments removed (props.js). */
function snippetOf(settings, language) {
	return settings.snippets.code[language] ?? '';
}

/** What the last run was sent with, before any run: its label, its limits, what it sent (runErrors.js), its type errors. */
function emptyRun(settings) {
	return { label: '', limits: effectiveLimits(settings.limits), sent: null, typeErrorCount: 0 };
}

/** [copyState, copy(text)]: copies to the clipboard (clipboard.js, with its fallback) and shows a check mark (or a failure) for COPY_FEEDBACK_MS. */
function useCopyFeedback() {
	const [copyState, setCopyState] = useState(COPY_STATES.idle);
	const timerRef = useRef(null);
	useEffect(() => () => clearTimeout(timerRef.current), []);
	const show = useCallback((state) => {
		clearTimeout(timerRef.current);
		setCopyState(state);
		timerRef.current = setTimeout(() => setCopyState(COPY_STATES.idle), COPY_FEEDBACK_MS);
	}, []);
	const copy = useCallback(
		async (text) => {
			show((await copyText(text)) ? COPY_STATES.copied : COPY_STATES.failed);
		},
		[show],
	);
	return [copyState, copy];
}

/**
 * markDirty(language, dirty): keeps the editor's own registry (unsavedWork.js, which a site's
 * after-deploy reloader reads) told whether any language
 * holds edits (dirtyLanguages.js). `initiallyDirty`: the languages whose drafts were restored at
 * mount (useDrafts.js), edited from the start: Monaco sends no change event for the code an
 * editor opens with. Registered in an effect, so it comes back when React re-runs effects.
 */
function useUnsavedWork(initiallyDirty) {
	const holderRef = useRef({});
	const [dirty] = useState(() =>
		createDirtyLanguages({ initiallyDirty, report: (active) => setUnsavedWork(holderRef.current, active) }),
	);
	useEffect(() => {
		dirty.publish();
		return () => dirty.release();
	}, [dirty]);
	return dirty.mark;
}

/**
 * The box's height when it fits its content (height="fit"; autoHeight.js; all of them do nothing
 * with a fixed height), as stable callbacks:
 *   fitHeight(contentHeight)  sets it in the next animation frame — while held, only remembers it
 *   holdHeight()              keeps the box at its current height (while the fold cover is up)
 *   releaseHeight()           ends the hold and applies the last height fitHeight was given
 *   stopFitting()             the reader dragged the box (ResizeHandle.jsx): their height stays
 *   resumeFitting()           back to following the code (a double-click on the handle)
 */
function useFitHeight(boxRef, enabled) {
	const [autoHeight] = useState(() => {
		if (!enabled) return null;
		return createAutoHeight({
			setHeight: (px) => {
				if (boxRef.current) boxRef.current.style.height = `${px}px`;
			},
		});
	});
	// Cancel and forget a waiting frame when React disposes the effects (unmount, and Fast Refresh
	// or StrictMode re-running them): a frame id left behind would block every later fitHeight.
	useEffect(() => () => autoHeight?.dispose(), [autoHeight]);
	return useMemo(
		() => ({
			fitHeight: (contentHeight) => autoHeight?.fit(contentHeight),
			holdHeight: () => autoHeight?.hold(),
			releaseHeight: () => autoHeight?.release(),
			stopFitting: () => autoHeight?.stop(),
			resumeFitting: () => autoHeight?.resume(),
		}),
		[autoHeight],
	);
}

/**
 * [covered, setCovered]: whether the loading cover hides the code. Once the editor is up it never
 * stays longer than FOLD_COVER_MAX_MS; then `onGiveUp` runs too (it ends the height hold).
 */
function useFoldCover(initiallyCovered, editorReady, onGiveUp) {
	const [covered, setCovered] = useState(initiallyCovered);
	useEffect(() => {
		if (!covered || !editorReady) return undefined;
		const timer = setTimeout(() => {
			setCovered(false);
			onGiveUp();
		}, FOLD_COVER_MAX_MS);
		return () => clearTimeout(timer);
	}, [covered, editorReady, onGiveUp]);
	return [covered, setCovered];
}

/** The message shown instead of the editor when Monaco cannot start, or null. */
function editorErrorFor(vsPath, loadError) {
	if (!vsPath) return EDITOR_ERRORS.notServed;
	if (loadError) return EDITOR_ERRORS.failedToLoad;
	return null;
}

/**
 * Fit the box to the editor's content height — unless the editor has no width yet (hidden while
 * being created: monacoSetup.js > laidOutContentHeight), when the height would be nonsense.
 */
function fitWhenLaidOut(editor, fitHeight) {
	const height = laidOutContentHeight(editor);
	if (height !== null) fitHeight(height);
}

/**
 * The static view's code height at the tap (its box minus the "Tap to edit" bar; StaticBox.jsx),
 * rounded, or null when it cannot be measured: the Monaco box starts at that height.
 */
function staticCodeHeight(surface) {
	const host = surface?.domNode?.();
	if (!host?.getBoundingClientRect) return null;
	const bar = host.querySelector?.(TOUCH_BAR_SELECTOR);
	const height = host.getBoundingClientRect().height - (bar ? bar.getBoundingClientRect().height : 0);
	return height > 0 ? Math.round(height) : null;
}

/** `style` (sizing.js > editorBoxStyle) with the tap's height in place of the estimate — a fit box only; a fixed height is the page's. */
function withTapHeight(style, tapHeight, fit) {
	if (!fit || tapHeight === null) return style;
	return { ...style, height: `${tapHeight}px` };
}

/** The frame's touch attribute (touchMode.js > TOUCH_ATTRIBUTE) on a touch-first device; nothing at all on a desktop. */
function touchAttributes(touch) {
	return touch ? { [TOUCH_ATTRIBUTE]: '' } : {};
}

/** The stdin field (a monospace multi-line text field). */
function StdinField({ value, onChange }) {
	return (
		<div className={styles.stdin}>
			<TextField
				label={LABELS.inputField}
				placeholder={LABELS.inputPlaceholder}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				multiline
				minRows={STDIN_MIN_ROWS}
				maxRows={STDIN_MAX_ROWS}
				size="small"
				fullWidth
				className={styles.stdinField}
				slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off' } }}
			/>
		</div>
	);
}

/**
 * The notice after a saved draft was restored (useDrafts.js): "Restored your saved code ·
 * Discard". role="status" (MUI's Alert says role="alert", which would interrupt a screen reader
 * on every page load). Discard is Reset: one undoable edit, the draft and the output gone. The
 * notice and its button then unmount, so Reset puts the focus in the editor (⌘/Ctrl+Z undoes at
 * once), never on the page.
 */
function DraftNotice({ onDiscard, disabled }) {
	return (
		<Alert
			severity="info"
			role="status"
			square
			className={styles.banner}
			action={
				<button type="button" className={styles.retryButton} title={DRAFT_WORDS.discardTooltip} onClick={onDiscard} disabled={disabled}>
					{DRAFT_WORDS.discard}
				</button>
			}>
			{DRAFT_WORDS.restored}
		</Alert>
	);
}

/**
 * The editor itself (inside <MuiScope>). `initialSettings`: props.js > normalizeEditorProps.
 * `theme`: the reader's concrete theme (editorThemes.js, see CodeEditorClient below): Monaco's,
 * the frame's and the solution diff's;
 * `themeFamily` / `onThemeChange`: the reader's family and the Theme menu's pick (useEditorTheme.js).
 * `initialView`: the gate's answer (index.jsx: VIEWS.monaco, or VIEWS.static on a touch-first device).
 */
function CodeEditorWidget({ initialSettings, theme, themeFamily, onThemeChange, initialView }) {
	// On a touch-first device the Monaco that mounts after the tap fits the code (touchMode.js >
	// touchSettings): the static view never showed the page's height, so taking it at the tap
	// would move the page under the finger and leave an empty area that swallows swipes.
	const [settings] = useState(() => (initialView === VIEWS.static ? touchSettings(initialSettings) : initialSettings));
	// The page's monospace stack (editorFont.js), read once: this chunk runs in the browser only.
	const [fontFamily] = useState(() => resolveFontFamily((name) => getComputedStyle(document.documentElement).getPropertyValue(name)));
	// The site's settings from the monaco-editor plugin (shared/plugins/monaco-editor: where Monaco is served
	// and where the two functions are; absent: Monaco cannot load, and the library's default URLs).
	const { vsPath, executeUrl, runtimesUrl } = usePluginData(PLUGIN_NAME) ?? {};
	// The view: fixed on a desktop; on touch the static view until "Tap to edit" (THE TWO VIEWS in the header).
	const [view, setView] = useState(initialView);
	const touch = initialView === VIEWS.static;
	const monacoLoad = useMonacoLoader(vsPath, { enabled: view === VIEWS.monaco });
	const runtimes = useRuntimes(runtimesUrl);
	const codeRun = useCodeRun(executeUrl);
	// This editor's id in its models' addresses (monacoSetup.js > modelPath): unique on the page, never reused.
	const editorId = useId();
	const [copyState, copy] = useCopyFeedback();
	const [copyOutputState, copyOutput] = useCopyFeedback();
	const drafts = useDrafts(settings);
	const { foldsFor, save: saveDraft } = drafts;
	const markDirty = useUnsavedWork(drafts.restored); // read at mount: the restored drafts count as edits

	const [language, setLanguage] = useState(settings.language);
	const [versionChoices, setVersionChoices] = useState({});
	const [stdin, setStdin] = useState(settings.stdin);
	useUnsavedInput(stdin, settings.stdin); // typed program input holds a site's reload, focused or not
	const [stdinShown, setStdinShown] = useState(settings.showStdin);
	// The surface the code is shown on (surface.js): the ref for the handlers (set in the same
	// tick as the mount), the state for the hooks and the buttons.
	const surfaceRef = useRef(null);
	const [surface, setSurface] = useState(null);
	const surfaceReady = surface !== null;
	const monacoReady = surface?.kind === SURFACE_KINDS.monaco;
	// What the last run was sent with, kept with it: the "Running …" label, the limits it had, the code it sent.
	const [lastRun, setLastRun] = useState(() => emptyRun(settings));
	const [isEmpty, setIsEmpty] = useState(() => isBlank(drafts.startingCode(settings.language)));
	const pending = usePendingAction(); // a Run or Check that waits for Monaco to mount (touch, TypeScript)

	const boxRef = useRef(null);
	// The box's first inline style; after "Tap to edit" its height is the static view's code height
	// (tapHeight), so the box neither shrinks to the unwrapped estimate nor jumps: the fit then
	// corrects it once Monaco has laid out (fitWhenLaidOut).
	const [tapHeight, setTapHeight] = useState(null);
	const boxStyle = useMemo(() => withTapHeight(initialBoxStyle(settings, settings.language), tapHeight, settings.fit), [settings, tapHeight]);
	const { fitHeight, holdHeight, releaseHeight, stopFitting, resumeFitting } = useFitHeight(boxRef, settings.fit);
	const [covered, setCovered] = useFoldCover(foldsFor(settings.language).length > 0, monacoReady, releaseHeight);

	const editorRef = useRef(null);
	const monacoRef = useRef(null);
	const languageRef = useRef(language);
	const runRef = useRef(null);
	const foldedRef = useRef(new Set());
	const foldTokenRef = useRef(0);
	const modelsRef = useRef(new Set());
	const runTokenRef = useRef(0);
	const storesRef = useRef(null); // the static view's stores (useStaticStores.js), while it shows
	const textByLanguageRef = useRef({}); // the texts the static view changed, for Monaco's mount after the tap

	const info = languageInfo(language);
	const title = titleFor(settings, language);
	const editorError = editorErrorFor(vsPath, monacoLoad.error);
	// The static view reads without Monaco: a Monaco that cannot load disables nothing there (the
	// banner still says so), except Run and Check for a language compiled in Monaco's worker.
	const viewError = runBlockingError({ view, language, editorError });
	// Monaco could not load after "Tap to edit" (or a TypeScript Run): back to the static view,
	// which needs no Monaco (touchMode.js > viewAfterLoad). A layout effect, so the frame without
	// code is never painted; a Run or Check that waited for Monaco is dropped.
	const shownView = viewAfterLoad({ initialView, view, editorError, monacoReady });
	useLayoutEffect(() => {
		if (shownView === view) return;
		pending.cancel();
		setView(shownView);
	}, [shownView, view, pending]);
	const runtime = chooseRuntime({
		status: runtimes.status,
		runtimes: runtimes.runtimes,
		language,
		selector: settings.versionSelectors[language],
		choice: versionChoices[language],
		typescriptVersion: monacoReady ? typeScriptNamespace(monacoRef.current)?.typescriptVersion : undefined,
	});
	const monacoOptions = useMemo(
		() =>
			buildMonacoOptions(settings.editorOptions, {
				readOnly: settings.readOnly,
				hideErrors: settings.hideErrors,
				ariaLabel: `${LABELS.editorRegion}: ${title}`,
				fit: settings.fit, // a height="fit" editor's scrollbar (props.js > FIT_SCROLLBAR_OPTIONS)
				fontFamily,
				touch, // a touch-first device: touchOptions.js (word wrap, no hover …), before and after the tap
			}),
		[settings, title, fontFamily, touch],
	);
	const { beforeMount: pageBeforeMount, onMount: pageOnMount, onChange: pageOnChange, ...pageEditorProps } = settings.editorProps;
	// Monaco's theme: the reader's (useEditorTheme.js), the one the frame shows; a page cannot set one (props.js).
	const monacoTheme = theme.name;

	const guided = useGuided({ settings, languageRef, language, setLanguage, surface });
	const { attach: attachLines, applyMarks, clearMarks, foldsStarted, foldsEnded, modelShown, isStale } = guided;
	const exercise = useExercise({ settings, language, stdin, surfaceRef, monacoRef, runtime, codeRun, executeUrl, onSolutionUsed: clearMarks });
	const { checkRun, followEdit, followModel } = exercise;
	const errors = useRunErrors({
		settings,
		surfaceRef,
		surfaceReady,
		language,
		run: { phase: codeRun.phase, summary: codeRun.summary, response: codeRun.response, sent: lastRun.sent },
		check: { phase: checkRun.phase, summary: checkRun.summary, response: checkRun.response, sent: exercise.lastCheck.sent },
	});
	const { watch: watchErrors } = errors;
	const hasTypeScript = settings.snippets.languages.some((lang) => compilesInBrowser(lang));

	/** The surface changes (a mount, the static box leaving on the tap, Monaco arriving): the ref at once, the guide told, then React. */
	const takeSurface = useCallback(
		(next) => {
			surfaceRef.current = next;
			attachLines(next);
			setSurface(next);
		},
		[attachLines],
	);

	/** The text Monaco opens a language on: what the static view left (after the tap), else the draft or the snippet. */
	function startingTextFor(lang) {
		return textByLanguageRef.current[lang] ?? drafts.startingCode(lang);
	}

	/**
	 * What the static view opens each language with (StaticBox's stores, useDrafts.js's shape): the
	 * text it held before a tap whose Monaco could not load (textByLanguageRef), else the draft or
	 * the snippet; the author's folds only over the snippet.
	 */
	const staticDrafts = {
		...drafts,
		startingCode: startingTextFor,
		foldsFor: (lang, text) => drafts.foldsFor(lang, text ?? textByLanguageRef.current[lang]),
	};

	/** The static view's stores (useStaticStores.js), for Reset's fold pass; null once the box is gone. */
	function keepStores(stores) {
		storesRef.current = stores;
	}

	/**
	 * The static view's fold pass, in one tick: the marks on (unless the language is stale), the
	 * folds closed again on Reset (a first show's store already holds them), and the pass ended
	 * at once, so a waiting <CodeRef> is served now.
	 */
	function foldStaticLanguage(lang, { firstShow, skipMarks }) {
		foldTokenRef.current += 1;
		if (!skipMarks) applyMarks(lang);
		foldsStarted();
		if (!firstShow) storesRef.current?.storeFor(lang)?.setFolds(foldsFor(lang, surfaceRef.current?.getValue()));
		foldsEnded(lang);
	}

	/**
	 * Close `lang`'s folds in the current model (none while it shows a restored draft, or any
	 * other text than the snippet: useDrafts.js > foldsFor) and put its marked lines on
	 * (useGuided.js). `firstShow`: the language's model has just appeared — the code is covered
	 * while its folds close and the box's height is held, and a model with nothing to fold is
	 * left as it is (folding.js > applyFolds' `clear`: no wait for Monaco's folding model). Reset
	 * (not a first show) clears the reader's folds first. A fold without a cover (Reset, or no
	 * regions) ends an older fold's hold. While they close, useGuided.js holds every reveal back
	 * (foldsStarted … foldsEnded). `skipMarks`: the marks stay off (a language left stale by
	 * Clear or "Use this solution" when Monaco mounts after "Tap to edit"). The static view has
	 * its own, instant pass (foldStaticLanguage).
	 */
	const foldLanguage = useCallback(
		(lang, { firstShow, skipMarks = false }) => {
			const surface = surfaceRef.current;
			if (surface?.kind === SURFACE_KINDS.static) {
				foldStaticLanguage(lang, { firstShow, skipMarks });
				return;
			}
			const editor = editorRef.current;
			const monaco = monacoRef.current;
			if (!editor || !monaco) return;
			const regions = foldsFor(lang, editor.getValue());
			const token = ++foldTokenRef.current;
			if (!skipMarks) applyMarks(lang);
			foldsStarted(); // reveals (a <CodeRef>, Previous / Next) wait until this pass ends: useGuided.js
			if (firstShow && regions.length > 0) {
				setCovered(true);
				holdHeight();
			} else {
				releaseHeight();
			}
			applyFolds(editor, monaco, regions, { clear: !firstShow })
				.catch((error) => {
					console.warn('CodeEditor: the folds could not be applied.', error);
					return true;
				})
				.then((done) => {
					if (!done) foldedRef.current.delete(lang);
					if (token !== foldTokenRef.current) return;
					releaseHeight();
					if (editor.getModel()) fitWhenLaidOut(editor, fitHeight);
					setCovered(false);
					foldsEnded(lang); // the newest pass is over: a waiting reveal goes ahead; after Reset the current step comes back into view
				});
		},
		// foldStaticLanguage is not listed: it reads only refs and these same stable functions.
		[foldsFor, applyMarks, foldsStarted, foldsEnded, fitHeight, holdHeight, releaseHeight, setCovered],
	);

	/**
	 * A language's code is now on the surface (on mount, after each language switch, and when
	 * Monaco arrives after the tap). `shownLanguage`: the static box says which (its layout effect
	 * runs before this component's, where languageRef is brought up to date); Monaco's
	 * onDidChangeModel fires later, when languageRef is right.
	 */
	const handleModelShown = useCallback(
		(shownLanguage) => {
			const surface = surfaceRef.current;
			if (!surface || !surface.hasModel()) return;
			const lang = typeof shownLanguage === 'string' ? shownLanguage : languageRef.current;
			const editor = editorRef.current;
			if (surface.kind === SURFACE_KINDS.monaco) modelsRef.current.add(editor.getModel());
			const text = surface.getValue();
			setIsEmpty(isBlank(text));
			followModel(lang, text);
			if (foldedRef.current.has(lang)) {
				// Shown again: Monaco sends no content-size event for it, so fit the box to it here.
				if (surface.kind === SURFACE_KINDS.monaco) fitWhenLaidOut(editor, fitHeight);
			} else {
				foldedRef.current.add(lang);
				foldLanguage(lang, { firstShow: true, skipMarks: isStale(lang) });
			}
			modelShown();
		},
		[foldLanguage, fitHeight, followModel, modelShown, isStale],
	);

	// @monaco-editor/react keeps the FIRST beforeMount / onMount it is given: these read refs only.
	const handleBeforeMount = useCallback(
		(monaco) => {
			defineEditorThemes(monaco); // every theme of the Theme menu, before <Editor> names one (once per page)
			configureTypeScript(monaco);
			ignoreMonacoCancellations();
			pageBeforeMount?.(monaco);
		},
		// No dependencies on purpose: read once (see above).
		[],
	);

	const handleMount = useCallback(
		(editor, monaco) => {
			editorRef.current = editor;
			monacoRef.current = monaco;
			// Measure the box now that it is shown: the editor was created while @monaco-editor/react
			// kept the box hidden, a container Monaco measures as 5 px wide and lays the text out in
			// no room (monacoSetup.js > laidOutContentHeight). This runs after the box is shown
			// (@monaco-editor/react's onMount effect follows the render that unhides it), so the
			// re-wrap is synchronous and every height read below is real.
			editor.layout();
			// The other languages' models live exactly as long as the editor: @monaco-editor/react
			// disposes only the model it shows, then the editor (whose onDidDispose fires here).
			editor.onDidDispose(() => disposeModels(modelsRef.current, null));
			// The surface before the first model is shown: its marks go on there (useGuided.js).
			surfaceRef.current = createMonacoSurface(editor, monaco, { linesBox: monacoLinesBox, layoutSettled: monacoLayoutSettled });
			attachLines(surfaceRef.current);
			handleModelShown();
			remeasureFontsWhenLoaded(monaco, { fontSize: monacoOptions.fontSize, fontFamily: firstFamilyOf(fontFamily) });
			setSurface(surfaceRef.current);
			pageOnMount?.(editor, monaco);
		},
		// No dependencies on purpose: read once (see above).
		[],
	);

	// The editor's listeners, in an effect rather than in handleMount: when React re-runs the
	// effects without unmounting (Fast Refresh, StrictMode), they are disposed AND made again,
	// so ⌘/Ctrl+Enter, the auto height, the language switch, the run markers' clearing and the
	// type queries keep working.
	useEffect(() => {
		const editor = editorRef.current;
		const monaco = monacoRef.current;
		if (surface?.kind !== SURFACE_KINDS.monaco || !editor || !monaco) return undefined;
		const subscriptions = [
			editor.addAction({ id: RUN_ACTION_ID, label: LABELS.runAction, keybindings: [runKeybinding(monaco)], run: () => runRef.current?.() }),
			// The fit's two feeds, only for a box that fits its code (a fixed height never moves; the
			// guard's DOM read would be wasted): the content's height, and the first layout with room
			// — an editor created hidden (a closed dropdown or <details>; monacoSetup.js >
			// laidOutContentHeight) gets no fit from its fold pass, and on a desktop nothing re-wraps
			// when it is shown, so that layout is the only event that fits it. (A re-wrap also fires
			// a content-size event first, with the same figure: one fit per frame, the last wins.)
			settings.fit
				? editor.onDidContentSizeChange((event) => {
						if (event.contentHeightChanged) fitWhenLaidOut(editor, fitHeight);
					})
				: null,
			settings.fit ? editor.onDidLayoutChange(() => fitWhenLaidOut(editor, fitHeight)) : null,
			editor.onDidChangeModel(() => handleModelShown()),
			watchErrors(),
			hasTypeScript ? applyTypeQueries(editor, monaco) : null,
		];
		return () => {
			for (const subscription of subscriptions) subscription?.dispose?.();
		};
	}, [surface, settings.fit, fitHeight, handleModelShown, watchErrors, hasTypeScript]);

	const handleChange = useCallback(
		(value, event) => {
			const lang = languageRef.current;
			const text = value ?? '';
			// Both have \n line endings only (see the header), so untouched code is never "edited".
			markDirty(lang, text !== snippetOf(settings, lang));
			setIsEmpty(isBlank(text));
			saveDraft(lang, text);
			followEdit(text);
			pageOnChange?.(value, event);
		},
		// `settings` is fixed at mount; the others never change.
		[markDirty, saveDraft, followEdit],
	);

	// The static view's changes (Reset, Clear, "Use this solution") reach the same handler as
	// Monaco's onChange, and are kept per language for Monaco's mount after the tap.
	useEffect(() => {
		if (surface?.kind !== SURFACE_KINDS.static) return undefined;
		return surface.onDidChange(() => {
			const text = surface.getValue();
			textByLanguageRef.current[languageRef.current] = text;
			handleChange(text);
		});
	}, [surface, handleChange]);

	const running = codeRun.phase === RUN_PHASES.running;
	const checking = checkRun.phase === RUN_PHASES.running;
	const disabledReason = runDisabledReason({ editorError: viewError, surfaceReady, canRun: runtime.canRun, isEmpty, checking, pending: pending.pending !== null });
	const checkDisabled = checkDisabledReason({ editorError: viewError, surfaceReady, canRun: runtime.canRun, isEmpty, running, pending: pending.pending !== null });

	/**
	 * TypeScript before a run (typescriptRun.js): the JavaScript to send — of `code`, the text Run
	 * was pressed with — and what the run sent kept with it while it is the newest run (the
	 * source map's mapLine, the type error count, or the syntax errors that stopped it).
	 */
	async function compiledForRun(token, code) {
		const keep = (fields) => {
			if (token === runTokenRef.current) setLastRun((current) => ({ ...current, ...fields }));
		};
		try {
			const compiled = await compileForRun(monacoRef.current, editorRef.current.getModel(), code);
			keep({ sent: sentRecord({ language, mapLine: compiled.mapLine }), typeErrorCount: compiled.typeErrorCount });
			return compiled.code;
		} catch (error) {
			if (error instanceof BlockedRunError) keep({ sent: sentRecord({ language, blockedLocations: error.locations }) });
			throw error;
		}
	}

	/** The run's Piston payload: a promise, because TypeScript is compiled first (useCodeRun.js > A PROMISED PAYLOAD). */
	async function runPayload(code, token) {
		const browserCompiled = compilesInBrowser(language);
		const sentCode = browserCompiled ? await compiledForRun(token, code) : code;
		return buildExecuteRequest({
			language: runtime.runLanguage,
			version: runtime.version,
			code: sentCode,
			// what Piston's runner expects (languages.js > submitName: main.py, or 'main' for Go, C and C++);
			// TypeScript's JavaScript runs as the runtime's own file, main.js
			fileName: browserCompiled ? languageInfo(runtime.runLanguage).submitName : info.submitName,
			stdin,
			args: settings.args,
			limits: settings.limits, // the library clamps them: effectiveLimits
		});
	}

	/** The surface's text now: what Run, Check and Copy code read (null while there is no surface). */
	function readCode() {
		return surfaceRef.current?.getValue() ?? null;
	}

	/** "Tap to edit", and a TypeScript Run or Check from the static view: Monaco mounts in place of the static view (THE TWO VIEWS). */
	function startEditing() {
		foldedRef.current.clear(); // every language gets its first Monaco show (and fold pass) again
		setTapHeight(staticCodeHeight(surfaceRef.current)); // the Monaco box starts where the static code was
		setView(VIEWS.monaco);
	}

	/** Must this action from the static view mount Monaco first (TypeScript compiles there)? If so, it is kept and the tap is made. */
	function deferredToMonaco(action) {
		if (view !== VIEWS.static || staticRunPolicy(language) !== RUN_POLICIES.mountFirst) return false;
		pending.request(action);
		startEditing();
		return true;
	}

	/** The run itself, from the surface's text (Run's button, ⌘/Ctrl+Enter, or the pending run once Monaco is up). */
	function startRun() {
		const code = readCode();
		if (code === null) return;
		runTokenRef.current += 1;
		errors.beginRun();
		// Kept with the run: the "Running …" line must not follow a language switch made while it
		// waits, the status line names the limits this run had (the same effectiveLimits), and its
		// errors are read against the code it sent (runErrors.js).
		setLastRun({ ...emptyRun(settings), label: runtime.text, sent: sentRecord({ language, code }) });
		codeRun.run(runPayload(code, runTokenRef.current));
	}

	function run() {
		if (!surfaceRef.current || disabledReason) return;
		if (deferredToMonaco(PENDING_ACTIONS.run)) return;
		startRun();
	}

	/** Check (an exercise's `tests`): its own run, through useExercise.js. */
	function startCheck() {
		if (!surfaceRef.current) return;
		errors.beginRun();
		exercise.runCheck();
	}

	function check() {
		if (!surfaceRef.current || checkDisabled) return;
		if (deferredToMonaco(PENDING_ACTIONS.check)) return;
		startCheck();
	}

	// A Run or Check kept while Monaco mounted (TypeScript from the static view): pressed once it has a model.
	pending.takeWhen(monacoReady && Boolean(surface?.hasModel()), (action) => (action === PENDING_ACTIONS.check ? startCheck() : startRun()));

	/** Reset (the header) and Discard (the restored-draft notice, which unmounts with its button). */
	function reset() {
		const surface = surfaceRef.current;
		if (!surface) return;
		drafts.discard(language);
		errors.clear(); // replaceCode makes no change event when the code is already the snippet
		surface.setValue(snippetOf(settings, language), { undoable: !settings.readOnly });
		codeRun.clear();
		exercise.reset();
		foldLanguage(language, { firstShow: false });
		// Like Clear: the focus goes to the editor, so ⌘/Ctrl+Z undoes at once, and Discard's
		// button, which unmounts with its notice, does not drop the focus to the page.
		surface.focus();
	}

	/** Copy the editor's text — or the page's snippet while there is no editor (loading, or Monaco failed to load). */
	function copyCode() {
		copy(readCode() ?? drafts.startingCode(language));
	}

	/** Copy output: what the output area shows (output.js), from the last run's answer. */
	function copyRunOutput() {
		const text = copyableOutput(codeRun.summary);
		if (text !== '') copyOutput(text);
	}

	function clear() {
		const surface = surfaceRef.current;
		if (!surface) return;
		errors.clear();
		surface.setValue('', { undoable: true });
		clearMarks(); // the author's line numbers no longer describe the code
		codeRun.clear();
		exercise.clearCheck();
		surface.focus();
	}

	/**
	 * The reader starts resizing the box by hand: the code's height stops moving it. With
	 * height="fit" the box's inline height is the code's FULL height and only max-height holds it
	 * down, so it is pinned to the height it is drawn at before that ceiling goes (or it would jump).
	 */
	function startResize() {
		stopFitting();
		const box = boxRef.current;
		if (!settings.fit || !box) return;
		box.style.height = `${Math.round(box.getBoundingClientRect().height)}px`;
		box.style.maxHeight = 'none';
	}

	/** A double-click on the resize handle: back to the size the page gave the box. */
	function resetSize() {
		const box = boxRef.current;
		if (!box) return;
		if (!settings.fit) {
			box.style.height = settings.height;
			return;
		}
		box.style.maxHeight = settings.maxHeight;
		resumeFitting();
		if (editorRef.current) fitWhenLaidOut(editorRef.current, fitHeight);
	}

	function changeVersion(version) {
		setVersionChoices((choices) => ({ ...choices, [language]: version }));
	}

	// Before <Editor>'s effects run (a language switch changes its model there), so its events see the new language.
	useLayoutEffect(() => {
		languageRef.current = language;
		runRef.current = run;
	});

	const { buttons, hints, solutionPanel } = exercise;
	const ranTypeScript = lastRun.sent !== null && compilesInBrowser(lastRun.sent.language);
	return (
		<section className={styles.frame} {...frameAttributesOf(theme)} {...touchAttributes(touch)} aria-label={`${LABELS.editorRegion}: ${title}`}>
			<Toolbar
				title={title}
				languages={languageOptions(settings)}
				language={language}
				onLanguageChange={setLanguage}
				runtime={runtime}
				onVersionChange={changeVersion}
				running={running}
				runDisabledReason={disabledReason}
				onRun={run}
				onStop={codeRun.stop}
				onReset={reset}
				onClear={settings.readOnly ? null : clear}
				onCopy={copyCode}
				copyState={copyState}
				onCopyOutput={copyRunOutput}
				copyOutputState={copyOutputState}
				hasOutput={!running && copyableOutput(codeRun.summary) !== ''}
				stdinShown={stdinShown}
				onToggleStdin={() => setStdinShown((shown) => !shown)}
				themeFamily={themeFamily}
				onThemeChange={onThemeChange}
				hint={buttons.hint ? { open: hints.state.open, areaId: hints.areaId } : null}
				onToggleHints={hints.toggle}
				solution={buttons.solution ? { open: solutionPanel.open, panelId: solutionPanel.id, disabled: !surfaceReady } : null}
				onToggleSolution={solutionPanel.toggle}
				check={buttons.check ? { checking, disabledReason: checkDisabled } : null}
				onCheck={check}
				onStopCheck={exercise.stopCheck}
			/>
			{runtime.notice ? (
				<Alert severity={runtime.notice.severity} square className={styles.banner}>
					{runtime.notice.message}
				</Alert>
			) : null}
			{drafts.restored.has(language) ? <DraftNotice onDiscard={reset} disabled={!surfaceReady} /> : null}
			{/* The marks (colour only on screen) in words, for screen readers: visually hidden, so nothing moves. */}
			{guided.markSummary ? <p className={styles.visuallyHidden}>{guided.markSummary}</p> : null}
			{editorError ? (
				<Alert severity="error" square className={styles.banner}>
					{editorError}
				</Alert>
			) : null}
			{view === VIEWS.static ? (
				<StaticBox
					settings={settings}
					language={language}
					theme={theme}
					drafts={staticDrafts}
					options={monacoOptions}
					onSurface={takeSurface}
					onStores={keepStores}
					onModelShown={handleModelShown}
					onEdit={startEditing}
					editBlockedReason={editorError ? RUN_DISABLED.noEditor : null}
				/>
			) : editorError ? null : (
				<div ref={boxRef} className={styles.editorBox} style={boxStyle}>
					<Editor
						{...pageEditorProps}
						height="100%"
						path={modelPath(editorId, language, info.fileName)}
						defaultValue={startingTextFor(language)}
						language={info.monaco}
						theme={monacoTheme}
						options={monacoOptions}
						loading={null}
						beforeMount={handleBeforeMount}
						onMount={handleMount}
						onChange={handleChange}
					/>
					{!monacoReady || covered ? (
						<div className={styles.cover} aria-hidden="true">
							{monacoReady ? null : LOADING_EDITOR}
						</div>
					) : null}
				</div>
			)}
			{view === VIEWS.monaco && !editorError ? <ResizeHandle boxRef={boxRef} onResizeStart={startResize} onReset={resetSize} /> : null}
			{/* The printout's copy of the code (shown in print only; the static view prints its own lines). */}
			{view === VIEWS.monaco ? <PrintCopy code={drafts.startingCode(language)} getCode={readCode} options={monacoOptions} /> : null}
			{guided.stepBar ? <StepBar {...guided.stepBar} /> : null}
			{/* What a <CodeRef> did, said to screen readers (useGuided.js > announcement): only a named editor gets one. */}
			{settings.id !== null ? (
				<span className={styles.visuallyHidden} role="status">
					{guided.announcement}
				</span>
			) : null}
			{buttons.hint ? (
				<HintList
					id={hints.areaId}
					hints={hints.list}
					state={hints.state}
					onRevealNext={hints.revealNext}
					onToggleFold={hints.toggleFold}
				/>
			) : null}
			{solutionPanel.open && view === VIEWS.monaco && monacoRef.current ? (
				<SolutionPanel
					id={solutionPanel.id}
					monaco={monacoRef.current}
					readerCode={solutionPanel.readerCode}
					solution={solutionPanel.solution}
					language={info.monaco}
					theme={monacoTheme}
					editorOptions={monacoOptions}
					onUse={solutionPanel.use}
					onClose={solutionPanel.close}
				/>
			) : null}
			{solutionPanel.open && view === VIEWS.static ? (
				<StaticSolution
					id={solutionPanel.id}
					readerCode={solutionPanel.readerCode}
					solution={solutionPanel.solution}
					theme={theme}
					restored={drafts.restored.has(language)}
					onUse={solutionPanel.use}
					onClose={solutionPanel.close}
				/>
			) : null}
			{stdinShown ? <StdinField value={stdin} onChange={setStdin} /> : null}
			<OutputPanel
				phase={codeRun.phase}
				summary={codeRun.summary}
				error={codeRun.error}
				runningLabel={lastRun.label}
				limits={lastRun.limits}
				errorRows={errors.runRows}
				ranLabel={ranTypeScript ? lastRun.label : null}
				typeErrorCount={ranTypeScript ? lastRun.typeErrorCount : 0}
				exercise={exercise.panel ? { ...exercise.panel, checkRows: errors.checkRows } : null}
				hintCue={hints.cue}
				touch={touch}
				editorFailed={Boolean(viewError)}
			/>
		</section>
	);
}

/**
 * The browser-only editor. `settings`: props.js > normalizeEditorProps; `view`: the gate's
 * answer (index.jsx > ClientEditor: VIEWS.monaco unless the device is touch-first). Its theme
 * is the reader's (useEditorTheme.js: one store for the page, so a pick in any editor recolours
 * them all, and every editor's frame matches the page's one Monaco theme); the MUI controls
 * inside take that theme's mode, which a one-mode theme keeps on either site mode.
 */
export default function CodeEditorClient({ settings, view = VIEWS.monaco }) {
	const { family, setFamily, theme } = useEditorTheme();
	return (
		<MuiScope mode={theme.mode}>
			<CodeEditorWidget initialSettings={settings} theme={theme} themeFamily={family} onThemeChange={setFamily} initialView={view} />
		</MuiScope>
	);
}
