/**
 * useGuided.js — the guided parts of an editor: the author's marked lines (the `highlight` prop
 * and the magic comments), the `steps` walk-through (StepBar.jsx) and the requests of a <CodeRef>
 * in the prose (CodeRef, through the page registry lib/registry).
 * The drawing is decorations.js; this file decides WHEN. Its rules live in createGuide, a plain
 * object without React (so __tests__/useGuided.test.js drives it with fakes); the hook keeps
 * React's state for it and registers the editor.
 *
 *     const guided = useGuided({ settings, languageRef, language, setLanguage, surface });
 *     guided.attach(surface);          // handleMount (and the static box's mount), BEFORE the first model is shown
 *     guided.applyMarks(lang);         // a language's first show and Reset (foldLanguage, before its folds)
 *     guided.foldsStarted();           // foldLanguage, just before applyFolds: reveals wait from here …
 *     guided.foldsEnded(lang);         // … to the end of the NEWEST fold pass (its .then, after the token check)
 *     guided.clearMarks();             // Clear and "Use this solution" (their line numbers no longer describe the code)
 *     guided.modelShown();             // the end of every model show (a <CodeRef> may be waiting for it)
 *     guided.stepBar                   // StepBar's props, or null when no bar is drawn
 *     guided.announcement              // the text of the editor's polite status region ('' when quiet)
 *     guided.markSummary               // the shown language's marks in words, for screen readers ('' without)
 *     guided.isStale(lang)             // after Clear / "Use this solution": the marks are off until Reset
 *
 * THE SURFACE (2026-10-26)  The guide talks to the code through surface.js's contract, never to
 *   Monaco itself: `attach(surface)` takes the Monaco surface (monacoSurface.js) on a desktop,
 *   the static view's (staticSurface.js) on a phone, and the Monaco one again after "Tap to
 *   edit" (the marks of the surface before are disposed; the new one's go on at its first show,
 *   except for a language left stale, whose marks wait for Reset: CodeEditorClient.jsx >
 *   foldLanguage's `skipMarks`). The marks, the reveals, the text and the line count all come
 *   from the surface; the page follow-up (`follow`) measures through it too.
 *
 * THE RULES (the orchestrator's decisions of 2026-10-25, and the review's fixes)
 *   - The marks live on each language's MODEL (decorations.js's header says why) and follow the
 *     reader's edits: they are set when a language is first shown and again after Reset, never
 *     on a plain language switch. An undo or redo that brings back the page's snippet sets them
 *     again (Clear, then ⌘/Ctrl+Z).
 *   - Steps, the `highlight` prop and <CodeRef> belong to the OPENING language (props.js reads
 *     them against its code). In another language the step bar is not drawn, and a <CodeRef>
 *     first switches back to the opening language, then acts. (Each language's own magic
 *     comments do mark that language.)
 *   - Step 1 is highlighted when the editor mounts but NOT scrolled to (the author's folds stay
 *     closed and the view stays at the top); Previous / Next and a <CodeRef step> reveal the
 *     step's lines, opening any fold that hides them. Reset keeps the step: once its folds have
 *     closed again, a step past the first is revealed again (Reset's folds and its scroll to
 *     the top would hide it otherwise).
 *   - NOTHING IS REVEALED WHILE FOLDS ARE BEING CLOSED. A fold pass (folding.js > applyFolds:
 *     the first show of a language, Reset) ends by scrolling the editor to the top, and Monaco
 *     runs its fold actions only once its folding model is ready (200 ms or more after a model
 *     appears): a reveal made in between would be scrolled away — or folded away — again. So
 *     from foldsStarted to foldsEnded a <CodeRef>'s request, and the reveal of a step chosen
 *     with Previous / Next (its lines are highlighted at once), WAIT, and are carried out when
 *     the pass ends. Only the newest one waits (a reader who clicks twice wants the second).
 *   - A named editor (`id`) registers as soon as Monaco is up: the waiting above happens here,
 *     not in the registry. It registers only if it is the editor a <CodeRef> scrolls to — the
 *     first one on the page with that DOM id (ownsEditorDomId); another editor with the same
 *     id never takes requests, and the duplicate is reported once (the registry's warning).
 *   - The step bar's buttons work once the surface is up (Monaco, or a phone's static view);
 *     before that the bar is inert, as in the placeholder (a step chosen before mount could not
 *     be revealed).
 *   - After Clear or "Use this solution" the author's line numbers no longer describe that
 *     language's code: its marks go, and while the OPENING language is in that state the step
 *     bar waits for Reset (StepBar.jsx > stale) and a <CodeRef> gets a console warning (and a
 *     word for screen readers) instead of highlighting unrelated lines. Reset, or an undo back
 *     to the snippet, ends it. Kept per language: a Clear in another language leaves the
 *     opening language's steps alone.
 *   - <CodeRef lines>: the lines are cut to the code (a warning when none is left), revealed,
 *     kept in the page's window (CodeRef/goToEditor.js > keepLinesInWindow: a
 *     fit editor grows when a fold opens), then flashed. <CodeRef step>: that step (from 0),
 *     kept within the steps (a warning past the last one). Previous / Next are kept in the
 *     page's window the same way.
 *   - SCREEN READERS hear the result of a <CodeRef> in the editor's status region (the hook's
 *     `announcement`; CodeEditorClient.jsx draws it, visually hidden): "Showing lines 13 to 14
 *     of main.py.", started with "Switched to Python." when the language changed, and the
 *     step's words (StepBar.jsx > stepSpeech) when the step bar cannot say them itself (the
 *     step already shown, or the bar just appeared). A step change the bar can say, it says.
 *     The same text twice is said twice (the region is emptied first, ANNOUNCE_DELAY_MS
 *     before). `markSummary` gives the marks (colour only on screen) in words.
 *
 * HOW TO CHANGE IT
 *   The look of the marks and the flash: guided.module.css; the drawing and the reveal:
 *   decorations.js; the bar: StepBar.jsx; the page's follow-up scroll: goToEditor.js. Words for
 *   screen readers: WORDS (the lines and steps themselves: StepBar.jsx). The console warnings:
 *   messages.js > EDITOR_WARNINGS, and WARNINGS below. The request shapes:
 *   lib/registry > ACTION_TYPES (REVEAL_STEP is this file's own, never sent).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTION_TYPES, editorDomId, registerEditor, reportDuplicateEditor } from './lib/registry/index.js';
import { languageInfo } from './lib/codeRunner/index.js';
import { keepLinesInWindow } from './CodeRef/goToEditor.js';
import { rangesWithin } from './decorations.js';
import { EDITOR_WARNINGS } from './messages.js';
import { titleFor } from './props.js';
import { clampStepIndex, spokenRanges, stepSpeech } from './StepBar.jsx';

/** Every word this file says to a screen reader (the lines and steps are StepBar.jsx's words). */
export const WORDS = Object.freeze({
	showingLines: (lines, file) => `Showing ${lines} of ${file}.`,
	switchedTo: (label) => `Switched to ${label}.`,
	noLines: 'Those lines are not in the code.',
	afterClear: 'Reset the code to follow its steps and links again.',
	markSummary: (parts) => `Marked lines in the code as given: ${parts}.`,
	markPart: (lines, kind) => `${lines} ${kind}`,
	kinds: Object.freeze({
		highlight: 'highlighted',
		error: 'error',
		success: 'success',
		warning: 'warning',
		add: 'added',
		remove: 'removed',
	}),
});

/** The console warnings of this file (the others are messages.js > EDITOR_WARNINGS). */
export const WARNINGS = Object.freeze({
	refAfterClear: (id) =>
		`CodeRef: the editor "${id}" was cleared or given the solution, so its line numbers no longer describe the code; the reference waits for Reset.`,
});

/** How long the status region stays empty before a new message (ms): the same text twice must be a change. */
export const ANNOUNCE_DELAY_MS = 100;

/** The waiting reveal of the step chosen with Previous / Next during a fold pass (never sent by a <CodeRef>). */
export const REVEAL_STEP = 'revealStep';

/** No language has had its marks cleared. */
const NO_LANGUAGES = Object.freeze(new Set());

/** console.warn, looked up when called (so a test may replace it). */
function consoleWarn(...parts) {
	console.warn(...parts);
}

/** "2 to 4" style runs of the lines of one kind: [[2, 4], [7, 7]] from [2, 3, 4, 7]. */
function runsOf(lines) {
	const runs = [];
	for (const line of lines) {
		const last = runs.at(-1);
		if (last && line === last[1] + 1) last[1] = line;
		else runs.push([line, line]);
	}
	return runs;
}

/**
 * The marks ({ [line]: kind }) in words: "Marked lines in the code as given: line 2
 * highlighted; lines 7 to 10 error; line 12 added." ('' without marks). Consecutive lines of
 * one kind make one range; the parts go in the order of their first line.
 */
export function markedLinesSummary(lineKinds) {
	const linesByKind = new Map();
	const entries = Object.entries(lineKinds ?? {})
		.map(([line, kind]) => [Number(line), kind])
		.filter(([line, kind]) => Number.isInteger(line) && line >= 1 && Object.hasOwn(WORDS.kinds, kind))
		.sort((a, b) => a[0] - b[0]);
	for (const [line, kind] of entries) {
		if (!linesByKind.has(kind)) linesByKind.set(kind, []);
		linesByKind.get(kind).push(line);
	}
	const parts = [];
	for (const [kind, lines] of linesByKind) {
		for (const run of runsOf(lines)) parts.push({ first: run[0], text: WORDS.markPart(spokenRanges([run]), WORDS.kinds[kind]) });
	}
	if (parts.length === 0) return '';
	parts.sort((a, b) => a.first - b.first);
	return WORDS.markSummary(parts.map((part) => part.text).join('; '));
}

/**
 * Is `surface` (surface.js: its domNode() is the element the code is drawn in) the editor a
 * <CodeRef to={id}> scrolls to: inside the first element of the page with the editor's DOM id
 * (document.getElementById)? true when it cannot be told (no document, no such element, a
 * surface without its DOM node).
 */
export function ownsEditorDomId(doc, id, surface) {
	const domId = editorDomId(id);
	const anchor = domId === null ? null : doc?.getElementById?.(domId);
	const node = surface?.domNode?.();
	if (!anchor || !node) return true;
	return anchor.contains(node);
}

/**
 * The guided logic of one editor, without React (see THE RULES):
 *   settings          props.js > normalizeEditorProps (id, language, steps, lineKinds, snippets, fit, title)
 *   currentLanguage() the language the editor shows now
 *   showLanguage(id)  switches the editor to that language
 *   report            what React must draw: { stepIndex(index), staleLanguages(set), announce(text) }
 *   warn, follow      for the tests: console.warn, and goToEditor.js > keepLinesInWindow
 * Returns { attach, applyMarks, clearMarks, foldsStarted, foldsEnded, modelShown, changeStep,
 * perform, isStale }; attach(surface) takes the surface the editor shows the code on (THE SURFACE).
 */
export function createGuide({ settings, currentLanguage, showLanguage, report = {}, warn = consoleWarn, follow = keepLinesInWindow }) {
	const steps = settings.steps ?? [];
	const opening = settings.language;
	const state = { surface: null, lines: null, listener: null, stepIndex: 0, pending: null, folding: false, switched: false, stale: new Set() };

	/** Says `text` in the editor's status region (report.announce). */
	function tell(text) {
		report.announce?.(text);
	}

	function hasModel() {
		return Boolean(state.surface?.hasModel());
	}

	function stepRanges(index) {
		return steps[index]?.ranges ?? [];
	}

	function isStale(lang) {
		return state.stale.has(lang);
	}

	function markStale(lang, stale) {
		if (stale === isStale(lang)) return;
		if (stale) state.stale.add(lang);
		else state.stale.delete(lang);
		report.staleLanguages?.(new Set(state.stale));
	}

	/** Steps can be drawn and revealed now: Monaco is up, the opening language shows, its marks were not cleared. */
	function stepsLive() {
		return hasModel() && currentLanguage() === opening && !isStale(opening);
	}

	function applyMarks(lang) {
		if (!state.lines) return;
		state.lines.set(settings.lineKinds?.[lang] ?? {});
		state.lines.showStep(lang === opening ? stepRanges(state.stepIndex) : []);
		markStale(lang, false);
	}

	function clearMarks() {
		state.lines?.set({});
		state.lines?.showStep([]);
		markStale(currentLanguage(), true);
	}

	/** An undo or redo that brings back the page's snippet brings back its marks (Clear, then ⌘/Ctrl+Z). */
	function contentChanged(event) {
		if (!event?.isUndoing && !event?.isRedoing) return;
		const lang = currentLanguage();
		const snippet = settings.snippets?.code?.[lang];
		if (typeof snippet === 'string' && state.surface?.getValue() === snippet) applyMarks(lang);
	}

	/** Let go of the surface attached now: its marks off, its listener gone. */
	function detach() {
		state.lines?.dispose();
		state.listener?.();
		Object.assign(state, { surface: null, lines: null, listener: null });
	}

	/** The surface the guide works on from now on (surface.js); a previous one is detached first. */
	function attach(surface) {
		detach();
		if (!surface) return;
		Object.assign(state, { surface, lines: surface.marks, listener: surface.onDidChange(contentChanged) });
	}

	/** "Switched to Python. " once after a <CodeRef> switched the language ('' otherwise). */
	function takeSwitchNote() {
		if (!state.switched) return '';
		state.switched = false;
		return `${WORDS.switchedTo(languageInfo(opening).label)} `;
	}

	/** Reveal `ranges` in the editor, then keep them in the page's window; resolves true when it revealed. */
	async function revealAndFollow(ranges) {
		const { surface } = state;
		const revealed = await surface.reveal(ranges);
		const span = revealed ? surface.revealSpan(ranges) : null;
		if (span) await follow(surface, span, { waitForGrowth: Boolean(settings.fit) });
		return revealed;
	}

	function revealStep(index) {
		revealAndFollow(stepRanges(index)).catch((error) => warn(EDITOR_WARNINGS.refFailed(settings.id), error));
	}

	/** Step `index` (kept within the steps) becomes the current one: drawn at once, revealed now or after the folds. */
	function changeStep(index) {
		const next = clampStepIndex(index, steps.length);
		state.stepIndex = next;
		report.stepIndex?.(next);
		if (!stepsLive()) return;
		state.lines?.showStep(stepRanges(next));
		if (state.folding) state.pending = { type: REVEAL_STEP };
		else revealStep(next);
	}

	/** <CodeRef lines>: cut to the code, revealed (unfolded), kept in the window, then flashed and said. */
	function showReferencedLines(ranges) {
		const lineCount = state.surface.lineCount();
		const lines = rangesWithin(ranges, lineCount);
		const note = takeSwitchNote();
		if (lines.length === 0) {
			warn(EDITOR_WARNINGS.refPastEnd(settings.id, lineCount));
			tell(`${note}${WORDS.noLines}`);
			return;
		}
		revealAndFollow(lines)
			.then((revealed) => {
				if (!revealed) return;
				state.lines?.flash(lines);
				tell(`${note}${WORDS.showingLines(spokenRanges(lines), titleFor(settings, opening))}`);
			})
			.catch((error) => warn(EDITOR_WARNINGS.refFailed(settings.id), error));
	}

	/** <CodeRef step>: step `index` (from 0), kept within the steps; a warning past the last one. */
	function goToReferencedStep(index) {
		if (index >= steps.length) warn(EDITOR_WARNINGS.refNoStep(settings.id, index + 1, steps.length));
		if (steps.length === 0) return;
		const target = clampStepIndex(index, steps.length);
		// The step bar's live region says nothing for the step it already shows, or when it has just appeared.
		const barSilent = target === state.stepIndex || state.switched;
		const note = takeSwitchNote();
		changeStep(target);
		if (barSilent) tell(`${note}${stepSpeech(steps[target], target, steps.length)}`);
	}

	/** After Clear / "Use this solution": a <CodeRef> waits for Reset (a warning, and a word for screen readers). */
	function refuseAfterClear(action) {
		if (action.type === REVEAL_STEP) return;
		warn(WARNINGS.refAfterClear(settings.id));
		tell(WORDS.afterClear);
	}

	/** Keep `action` until the opening language shows and no fold pass runs (switching back to it if needed). */
	function wait(action) {
		state.pending = action;
		if (currentLanguage() === opening) return;
		state.switched = true;
		showLanguage(opening);
	}

	/** A <CodeRef>'s request (lib/registry > THE ACTIONS), or the step bar's waiting reveal. */
	function perform(action) {
		if (!action || !hasModel()) return;
		if (isStale(opening)) {
			refuseAfterClear(action);
			return;
		}
		if (currentLanguage() !== opening || state.folding) {
			wait(action);
			return;
		}
		if (action.type === ACTION_TYPES.lines) showReferencedLines(action.ranges);
		else if (action.type === ACTION_TYPES.step) goToReferencedStep(action.index);
		else if (action.type === REVEAL_STEP) revealStep(state.stepIndex);
	}

	/** Carries out the waiting action if nothing holds it back any more; true when it did. */
	function flushPending() {
		if (!state.pending || state.folding || currentLanguage() !== opening) return false;
		const action = state.pending;
		state.pending = null;
		perform(action);
		return true;
	}

	function foldsStarted() {
		state.folding = true;
	}

	/** The newest fold pass ended: the waiting action goes ahead; else, after Reset, a step past the first is revealed again. */
	function foldsEnded(lang) {
		state.folding = false;
		if (flushPending()) return;
		if (lang === opening && state.stepIndex > 0 && stepsLive()) revealStep(state.stepIndex);
	}

	function modelShown() {
		flushPending();
	}

	return { attach, applyMarks, clearMarks, foldsStarted, foldsEnded, modelShown, changeStep, perform, isStale };
}

/** [text, announce(message)]: the status region's text, emptied first so the same message is said again. */
function useAnnouncer() {
	const [text, setText] = useState('');
	const timerRef = useRef(null);
	useEffect(() => () => clearTimeout(timerRef.current), []);
	const announce = useCallback((message) => {
		clearTimeout(timerRef.current);
		setText('');
		timerRef.current = setTimeout(() => setText(message), ANNOUNCE_DELAY_MS);
	}, []);
	return [text, announce];
}

/** See the header. `surface`: the editor's surface once it is up (surface.js), null before. */
export function useGuided({ settings, languageRef, language, setLanguage, surface }) {
	const [stepIndex, setStepIndex] = useState(0);
	const [staleLanguages, setStaleLanguages] = useState(NO_LANGUAGES);
	const [announcement, announce] = useAnnouncer();
	const [guide] = useState(() =>
		createGuide({
			settings,
			currentLanguage: () => languageRef.current,
			showLanguage: setLanguage,
			report: { stepIndex: setStepIndex, staleLanguages: setStaleLanguages, announce },
		}),
	);

	useEffect(() => {
		if (settings.id === null || !surface) return undefined;
		if (!ownsEditorDomId(globalThis.document, settings.id, surface)) {
			reportDuplicateEditor(settings.id);
			return undefined;
		}
		return registerEditor(settings.id, { perform: guide.perform });
	}, [settings.id, surface, guide]);

	const opening = settings.language;
	const stale = staleLanguages.has(opening);
	const showBar = settings.steps.length > 0 && language === opening;
	const ready = surface !== null && !stale;
	return {
		attach: guide.attach,
		applyMarks: guide.applyMarks,
		clearMarks: guide.clearMarks,
		foldsStarted: guide.foldsStarted,
		foldsEnded: guide.foldsEnded,
		modelShown: guide.modelShown,
		isStale: guide.isStale,
		stepBar: showBar ? { steps: settings.steps, index: stepIndex, onStepChange: ready ? guide.changeStep : null, stale } : null,
		announcement,
		markSummary: staleLanguages.has(language) ? '' : markedLinesSummary(settings.lineKinds?.[language]),
	};
}
