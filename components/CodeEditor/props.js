/**
 * props.js — turns <CodeEditor>'s props into ONE settings object the rest of the component
 * reads: the new props first, then the old editor's `editorSettings` / `outputSettings` (still
 * honoured, so a page written for the old editor keeps working), then the defaults below.
 * Pure: no React, no DOM, no Monaco, so `node --test` checks it (__tests__/props.test.js,
 * including a blog post's exact props).
 *
 *     normalizeEditorProps(props) -> {
 *       snippets         { languages: ['python', …], code: { python: '…' }, initialLanguage }
 *       language         the language the editor opens on (canonical Piston name)
 *       versionSelector  the version asked for the opening language ('3.12', '3.x' …) or undefined
 *       versionSelectors { [language]: selector } — every language's (an object `version` prop
 *                        names several; a string applies to the opening language only)
 *       foldedRegions    { [language]: [[start, end], …] } — the author's ranges per language,
 *                        not yet checked against the code (folding.js does that, with warnings)
 *       height           a CSS length (default '50vh'), or null with fit: true for
 *                        height="fit" (sizing.js > readHeightProp; a percentage, 'auto' or 0 is
 *                        refused with a console warning and the default applies)
 *       fit              true when the box follows the code's height (height="fit")
 *       maxHeight        a CSS length (default '60vh'; the same refusals) — the ceiling for "fit"
 *       stdin, showStdin, args, limits ({ runTimeout, … } — only the ones the page set)
 *       readOnly, title (null = the file name, see titleFor), editorOptions (the page's Monaco
 *       options, not yet merged with the defaults: buildMonacoOptions), editorProps (old
 *       editorSettings keys still passed to @monaco-editor/react's <Editor>)
 *     THE TEACHING LAYER (2026-10-25; every key has a default that changes nothing)
 *       id               the editor's name for <CodeRef to> and its DOM id code-editor-<id>
 *                        (lib/registry > normalizeEditorId: a word without
 *                        spaces), or null; a refused one gets a console warning
 *       lineKinds        { [language]: { [line]: kind } } — the magic comments of each
 *                        language's snippet (the snippets are STORED WITHOUT those lines:
 *                        codeRunner > stripMagicComments), and for the OPENING language the
 *                        `highlight` prop's lines (kind 'highlight'; a magic comment wins a line)
 *       steps            [{ ranges, note, title }] — the `steps` prop, read against the OPENING
 *                        language's code (codeRunner > normalizeSteps); [] without it
 *       hideErrors       true: no run-error marks (runMarkers.js), Monaco's squiggles off
 *       expectedOutput   a string (one leading newline dropped: an MDX template literal written
 *                        {`\n5\n`} starts with one), or null
 *       tests, solution  a string (for the opening language) or { [language]: string }, or null;
 *                        read per language through testsFor / solutionFor
 *       hints            ['…'] — normalizeHints below
 *       saveDraft, loadWhenVisible   booleans (drafts.js; useNearViewport.js in index.jsx);
 *                        saveDraft without an `id` (on an editor that is not read-only) gets
 *                        a console warning: its drafts would be shared and never cleaned up
 *     }
 *   Line numbers in `highlight`, `steps` (and <CodeRef lines>) are the lines the READER sees,
 *   after the magic comments are removed; warnings about them are given once per call.
 *
 * THE PAGE'S FIRST DOWNLOAD  index.jsx (the server-rendered placeholder) imports this file, so
 * everything it imports is in every page with an editor, before the lazy editor arrives. It
 * must not import the editor's client-only modules (exerciseView.js, runMarkers.js and, through
 * them, the run library's result.js): __tests__/files.test.js walks index.jsx's static imports
 * and fails if one is reached. That is why normalizeHints and renderValidationDecorationsFor
 * live HERE; keep one copy (exerciseView.js and runMarkers.js re-export them from here for
 * their own callers). runtimeChoice.js (small, pure) is imported for compilesInBrowser.
 *
 * THE HEADER'S RUNTIME SLOT  runtimeSlotFor: for an exercise (Hints, Solution or Check) or a
 * TypeScript editor, the header gives its runtime controls (the language picker, the version
 * picker or text) a slot of ONE fixed width, which the placeholder draws as an empty space of
 * the same width. Their text is not known when the page is built (the versions arrive with the
 * runtimes list and with Monaco), so without the slot the real header could wrap onto two lines
 * where the placeholder's fitted on one, and the page jumped 30 px (found 2026-10-25). Editors
 * without these props keep their header exactly as before (no slot).
 *
 * HEIGHT="FIT" AND THE SCROLLBAR  Monaco adds its horizontal scrollbar's height to the content
 * height whenever a line is wider than the box, which the placeholder cannot know (it has no
 * layout). A fit editor therefore gets FIT_SCROLLBAR_OPTIONS: the bar is left out of the content
 * height and drawn as thin as the bottom padding, over that padding, so the box Monaco asks for
 * is the one sizing.js estimated (buildMonacoOptions' `fit`).
 *
 * WHICH PROP WINS (new prop > old key > default)
 *   initialCode   initialCode > editorSettings.defaultValue > editorSettings.value
 *   language      language > outputSettings.language > editorSettings.language / defaultLanguage
 *   version       version > outputSettings.version          (default: the newest installed)
 *   height        height > editorSettings.height             (default: '50vh'; 'fit' follows the code)
 *   stdin / args  stdin / args > outputSettings.stdin / args
 *   limits        limits.<name> > outputSettings.<snake_case name>
 *   editorOptions editorOptions over editorSettings.options (key by key)
 *   readOnly      readOnly > editorOptions.readOnly > false
 *   theme         never the page's: the reader's Theme menu (editorSettings.theme and an
 *                 options.theme get a console warning and are dropped: PAGE_THEME_WARNING)
 *
 * The run library and the page registry live inside this folder (lib/codeRunner/,
 * lib/registry/) and every file imports them by a relative, fully specified path
 * ('./lib/codeRunner/index.js'): nothing in the folder imports '@site/…', so the whole folder
 * works on any Docusaurus site that mounts shared/ (README.md > Taking it to another Docusaurus site).
 *
 * HOW TO CHANGE IT
 *   A new prop: read it in normalizeEditorProps (new prop, then the old key if there is one,
 *   then a named default), add a row to README.md's props table and a test. A new prop must
 *   change nothing for an editor without it (__tests__/backCompat.test.js).
 *   Monaco's look and behaviour for every editor: DEFAULT_EDITOR_OPTIONS; on a touch-first
 *   device (after "Tap to edit"): touchOptions.js > TOUCH_EDITOR_OPTIONS (buildMonacoOptions'
 *   `touch`; its one-level merge, mergeOptions, lives there too).
 *   Which old editorSettings keys still reach <Editor>: PASSTHROUGH_EDITOR_PROPS.
 *   Which exercise buttons an editor shows (the placeholder and the header agree through it):
 *   exerciseButtonsFor. Which editors get the header's runtime slot: runtimeSlotFor (its
 *   widths: styles.module.css > --ce-runtime-slot / --ce-runtime-slot-several). A fit editor's
 *   scrollbar: FIT_SCROLLBAR_OPTIONS. The not-yet-near placeholder's code text:
 *   waitingCodeStyle.
 */

import {
	DEFAULT_LIMITS,
	exerciseTextFor,
	foldRegionsFor,
	fromLegacyOutputSettings,
	languageInfo,
	lineKindsOf,
	normalizeFoldRegions,
	normalizeSnippets,
	normalizeSteps,
	parseLineSpec,
	stripMagicComments,
	supportsChecks,
} from './lib/codeRunner/index.js';
import { normalizeEditorId } from './lib/registry/index.js';
import { compilesInBrowser } from './runtimeChoice.js';
import { mergeOptions, touchEditorOptions } from './touchOptions.js';
import {
	DEFAULT_MAX_HEIGHT,
	editorBoxStyle,
	estimateContentHeight,
	hiddenLineCount,
	lastFoldableLineOf,
	lineCountOf,
	lineHeightPx,
	readHeightProp,
	toCssLength,
} from './sizing.js';

/**
 * The not-yet-near placeholder's font, as plain CSS (the server has no page to read): the same
 * chain the client resolves at its first render (editorFont.js) — the site's --ce-font-family,
 * else Infima's monospace stack.
 */
export const WAITING_FONT_CSS = 'var(--ce-font-family, var(--ifm-font-family-monospace))';

/**
 * Monaco's options for every editor on the site (a page's `editorOptions` go over them, key by
 * key; an object value such as `scrollbar` is merged one level deep). No fontFamily here: the
 * client reads the page's (editorFont.js) and hands it to buildMonacoOptions.
 *   lineHeight 1.5            a multiple of fontSize (Monaco reads values below 8 that way)
 *   scrollbar.alwaysConsumeMouseWheel false   the page keeps scrolling past the editor
 *   fixedOverflowWidgets      hovers and suggestions are not clipped by the rounded frame
 */
export const DEFAULT_EDITOR_OPTIONS = Object.freeze({
	minimap: Object.freeze({ enabled: false }),
	fontSize: 14,
	lineHeight: 1.5,
	scrollBeyondLastLine: false,
	automaticLayout: true,
	showFoldingControls: 'always',
	padding: Object.freeze({ top: 8, bottom: 8 }),
	tabSize: 4,
	scrollbar: Object.freeze({ alwaysConsumeMouseWheel: false }),
	fixedOverflowWidgets: true,
});

/**
 * A height="fit" editor's scrollbar options, under the page's `editorOptions` (a page can still
 * set its own): the horizontal bar is not counted in Monaco's content height (so the box is the
 * height sizing.js estimated, wide lines or not), and it is as thin as the bottom padding, which
 * it covers instead of the last line. See HEIGHT="FIT" AND THE SCROLLBAR in the header.
 */
export const FIT_SCROLLBAR_OPTIONS = Object.freeze({
	ignoreHorizontalScrollbarInContentHeight: true,
	horizontalScrollbarSize: DEFAULT_EDITOR_OPTIONS.padding.bottom,
});

/** The header's runtime slots (runtimeSlotFor): for the version alone, or for the language picker and the version. */
export const RUNTIME_SLOTS = Object.freeze({ single: 'single', several: 'several' });

/** Monaco's renderValidationDecorations values (renderValidationDecorationsFor). */
export const VALIDATION_DECORATIONS = Object.freeze({ on: 'on', off: 'off', editable: 'editable' });

/**
 * Keys of the old `editorSettings` that are still handed to <Editor> (the component owns the
 * rest: value, language, path, height, options, loading, line, and theme — see
 * PAGE_THEME_WARNING). onMount / onChange / beforeMount run AFTER the component's own handlers.
 */
export const PASSTHROUGH_EDITOR_PROPS = Object.freeze([
	'width',
	'className',
	'wrapperProps',
	'overrideServices',
	'onValidate',
	'beforeMount',
	'onMount',
	'onChange',
]);

/**
 * The warning for a page that names a Monaco theme (the old `editorSettings.theme`, or `theme` in
 * `editorOptions` / `editorSettings.options`). Monaco has ONE theme for the whole page, and the
 * reader picks it in the header's Theme menu (editorThemes.js > ONE THEME PER PAGE): a theme one
 * editor named would recolour every editor's code but only its own frame. So it is ignored.
 */
export const PAGE_THEME_WARNING =
	'CodeEditor: a page cannot set the editor theme (editorSettings.theme or editorOptions.theme is ignored). Monaco has one theme per page, and the reader picks it in the header\'s Theme menu.';

/** The kind the `highlight` prop gives its lines (codeRunner > LINE_KINDS). */
const HIGHLIGHT_KIND = 'highlight';

/** What each warning about the `highlight` prop starts with (codeRunner > parseLineSpec's `label`). */
const HIGHLIGHT_LABEL = 'CodeEditor highlight';

/** The warning for an `id` the registry cannot use. */
function badIdWarning(value) {
	return `CodeEditor id: ${JSON.stringify(value)} cannot name an editor: give a word without spaces, e.g. id="two-sum".`;
}

/**
 * The warning for `saveDraft` on an editor without an `id`: drafts.js then keys its drafts by
 * the page and the snippet alone (DEFAULT_EDITOR_KEY), so two such editors with the same snippet
 * share one draft, and an old draft is never removed.
 */
const SAVE_DRAFT_WITHOUT_ID_WARNING =
	'CodeEditor saveDraft: give the editor an id, e.g. id="two-sum"; without one, editors with the same snippet on this page share one draft and its old drafts are never removed.';

/** The warning for a `tests` / `solution` prop that is neither text nor { [language]: text }. */
function badExerciseTextWarning(prop) {
	return `CodeEditor ${prop}: give a string, or one string per language ({ python: '…' }); it was ignored.`;
}

/** A plain object (not null, not an array), or {} for anything else. */
function asObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Is this a plain object? */
function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The first argument that is neither undefined nor null. */
function firstDefined(...values) {
	return values.find((value) => value !== undefined && value !== null);
}

/** A non-empty string prop (trimmed), else undefined. */
function nonEmptyText(value) {
	if (typeof value !== 'string') return undefined;
	const text = value.trim();
	return text === '' ? undefined : text;
}

/**
 * A version selector from a prop value: a non-empty string, or a number as text; else
 * undefined. (Write versions as strings: the number 3.10 is 3.1.)
 */
function selectorText(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return nonEmptyText(value);
}

/** Every language's version selector (see the header): { [language]: selector }. */
function versionSelectorsFor(version, languages, initialLanguage) {
	if (!isPlainObject(version)) {
		const selector = selectorText(version);
		return selector === undefined ? {} : { [initialLanguage]: selector };
	}
	const selectors = {};
	for (const [key, value] of Object.entries(version)) {
		const id = languageInfo(key).id;
		const selector = selectorText(value);
		if (selector === undefined || !languages.includes(id) || id in selectors) continue;
		selectors[id] = selector;
	}
	return selectors;
}

/** The author's fold ranges per language: { [language]: [[start, end], …] }. */
function foldedRegionsFor(foldedRegions, languages) {
	const byLanguage = {};
	for (const language of languages) byLanguage[language] = foldRegionsFor(foldedRegions, language);
	return byLanguage;
}

/** Program arguments as strings ([] for anything but an array). */
function argsFrom(args) {
	if (!Array.isArray(args)) return [];
	return args.map((arg) => String(arg ?? ''));
}

/** The run limits a props object sets: only the known names with a finite number. */
function limitsFrom(limits) {
	const picked = {};
	const source = asObject(limits);
	for (const name of Object.keys(DEFAULT_LIMITS)) {
		const value = source[name];
		if (typeof value === 'number' && Number.isFinite(value)) picked[name] = value;
	}
	return picked;
}

/** A string prop, or `fallback` when it is not a string. */
function textOr(value, fallback) {
	return typeof value === 'string' ? value : fallback;
}

/** Warn (PAGE_THEME_WARNING) when the page names a Monaco theme anywhere; the theme itself is dropped (passthroughProps, buildMonacoOptions). */
function warnAboutPageTheme(editorSettings, editorOptions) {
	if (editorSettings.theme !== undefined || editorOptions.theme !== undefined) console.warn(PAGE_THEME_WARNING);
}

/** The old editorSettings keys that still reach <Editor> (PASSTHROUGH_EDITOR_PROPS). */
function passthroughProps(editorSettings) {
	const props = {};
	for (const key of PASSTHROUGH_EDITOR_PROPS) {
		if (editorSettings[key] !== undefined) props[key] = editorSettings[key];
	}
	return props;
}

/**
 * A warn function that says each message once (console.warn, looked up when called): `highlight`
 * and `steps` are read against the code, and one mistake should be reported once per editor.
 */
function warnOnce() {
	const said = new Set();
	return (message) => {
		if (said.has(message)) return;
		said.add(message);
		console.warn(message);
	};
}

/**
 * Each snippet without its magic comments (the code the reader sees, runs, resets to and saves
 * drafts against; the placeholder's height), and per language the kinds of the lines they mark:
 * { code: { [language]: '…' }, magicKinds: { [language]: { [line]: kind } } }. A snippet without
 * magic comments comes back as the very same string.
 */
function stripSnippets(snippets, warn) {
	const code = {};
	const magicKinds = {};
	for (const language of snippets.languages) {
		const stripped = stripMagicComments(snippets.code[language], language, { warn });
		code[language] = stripped.code;
		magicKinds[language] = stripped.lineKinds;
	}
	return { code, magicKinds };
}

/**
 * Per language: the magic comments' kinds, and for the OPENING language the `highlight` prop's
 * lines under them (a magic comment's kind wins a line). Clamped to the code's last line (not
 * Monaco's empty line after a final newline: sizing.js > lastFoldableLineOf).
 */
function lineKindsFor({ highlight, code, magicKinds, openingLanguage, warn }) {
	const lineKinds = {};
	for (const [language, text] of Object.entries(code)) {
		const fromProp = language === openingLanguage && highlight !== undefined && highlight !== null
			? lineKindsOf(parseLineSpec(highlight, { lineCount: lastFoldableLineOf(text), warn, label: HIGHLIGHT_LABEL }), HIGHLIGHT_KIND)
			: {};
		lineKinds[language] = { ...fromProp, ...magicKinds[language] };
	}
	return lineKinds;
}

/** The `steps` prop, read against the opening language's code ([] without it). */
function stepsFor(steps, openingCode, warn) {
	if (steps === undefined || steps === null) return [];
	return normalizeSteps(steps, { lineCount: lastFoldableLineOf(openingCode), warn });
}

/** The `id` prop: a word without spaces (a number reads as its digits), or null; a refused one warns. */
function editorIdFrom(value) {
	if (value === undefined || value === null) return null;
	const id = normalizeEditorId(value);
	if (id === null) console.warn(badIdWarning(value));
	return id;
}

/**
 * `saveDraft`: true only for true. On an editor that is not read-only, an `id` that was not
 * given at all warns (SAVE_DRAFT_WITHOUT_ID_WARNING); a refused id has had its own warning.
 */
function saveDraftFrom(value, { idGiven, readOnly }) {
	const saveDraft = value === true;
	if (saveDraft && !readOnly && !idGiven) console.warn(SAVE_DRAFT_WITHOUT_ID_WARNING);
	return saveDraft;
}

/** `expectedOutput`: a string with one leading newline dropped (see the header), or null. */
function expectedOutputFrom(value) {
	if (typeof value !== 'string') return null;
	return value.startsWith('\n') ? value.slice(1) : value;
}

/** `tests` / `solution`: a string or { [language]: string } as given, else null (anything else warns). */
function exerciseTextFrom(value, prop) {
	if (value === undefined || value === null) return null;
	if (typeof value === 'string' || isPlainObject(value)) return value;
	console.warn(badExerciseTextWarning(prop));
	return null;
}

/**
 * The `hints` prop as a list of hint texts: strings that are not blank, in the page's order. A
 * single string is one hint; anything else in the list is dropped with a console warning (`warn`
 * is for the tests). Here and not in exerciseView.js, which hands it on: see THE PAGE'S FIRST
 * DOWNLOAD in the header.
 */
export function normalizeHints(hints, { warn = (message) => console.warn(message) } = {}) {
	if (hints === undefined || hints === null) return [];
	const list = typeof hints === 'string' ? [hints] : hints;
	if (!Array.isArray(list)) {
		warn('CodeEditor: `hints` should be a list of strings; it was ignored.');
		return [];
	}
	return list.filter((hint, index) => {
		if (nonEmptyText(hint) !== undefined) return true;
		warn(`CodeEditor: hint ${index + 1} is not a non-empty string; it was left out.`);
		return false;
	});
}

/** <CodeEditor>'s props as one settings object (the shape and the rules are in the header). */
export function normalizeEditorProps(props = {}) {
	const source = asObject(props);
	const editorSettings = asObject(source.editorSettings);
	const legacy = fromLegacyOutputSettings(asObject(source.outputSettings));
	const initialCode = firstDefined(source.initialCode, editorSettings.defaultValue, editorSettings.value);
	const requestedLanguage = firstDefined(source.language, legacy.language, editorSettings.language, editorSettings.defaultLanguage);
	const warnGuided = warnOnce();
	const parsedSnippets = normalizeSnippets(initialCode, requestedLanguage);
	const { code, magicKinds } = stripSnippets(parsedSnippets, warnGuided);
	const snippets = { ...parsedSnippets, code };
	const language = snippets.initialLanguage;
	const versionSelectors = versionSelectorsFor(firstDefined(source.version, legacy.version), snippets.languages, language);
	const editorOptions = { ...asObject(editorSettings.options), ...asObject(source.editorOptions) };
	warnAboutPageTheme(editorSettings, editorOptions);
	const stdin = textOr(firstDefined(source.stdin, legacy.stdin), '');
	const { height, fit } = readHeightProp(firstDefined(source.height, editorSettings.height));
	const readOnly = Boolean(firstDefined(source.readOnly, editorOptions.readOnly, false));
	return {
		snippets,
		language,
		versionSelector: versionSelectors[language],
		versionSelectors,
		foldedRegions: foldedRegionsFor(source.foldedRegions, snippets.languages),
		height,
		fit,
		maxHeight: toCssLength(source.maxHeight, { prop: 'maxHeight' }) ?? DEFAULT_MAX_HEIGHT,
		stdin,
		showStdin: typeof source.showStdin === 'boolean' ? source.showStdin : stdin !== '',
		args: argsFrom(firstDefined(source.args, legacy.args)),
		limits: { ...limitsFrom(legacy.limits), ...limitsFrom(source.limits) },
		readOnly,
		title: nonEmptyText(source.title) ?? null,
		editorOptions,
		editorProps: passthroughProps(editorSettings),
		id: editorIdFrom(source.id),
		lineKinds: lineKindsFor({ highlight: source.highlight, code, magicKinds, openingLanguage: language, warn: warnGuided }),
		steps: stepsFor(source.steps, code[language], warnGuided),
		hideErrors: source.hideErrors === true,
		expectedOutput: expectedOutputFrom(source.expectedOutput),
		tests: exerciseTextFrom(source.tests, 'tests'),
		solution: exerciseTextFrom(source.solution, 'solution'),
		hints: normalizeHints(source.hints),
		saveDraft: saveDraftFrom(source.saveDraft, { idGiven: source.id !== undefined && source.id !== null, readOnly }),
		loadWhenVisible: source.loadWhenVisible === true,
	};
}

/**
 * The renderValidationDecorations option an editor with run-error marks needs (runMarkers.js):
 * 'off' with hideErrors (no marks at all, Monaco's own squiggles included), else the page's own
 * editorOptions value when it is one of Monaco's, else 'on' (Monaco's default, 'editable',
 * hides every mark on a read-only editor). Here and not in runMarkers.js, which hands it on: see
 * THE PAGE'S FIRST DOWNLOAD in the header.
 */
export function renderValidationDecorationsFor({ hideErrors = false, pageValue } = {}) {
	if (hideErrors) return VALIDATION_DECORATIONS.off;
	if (Object.values(VALIDATION_DECORATIONS).includes(pageValue)) return pageValue;
	return VALIDATION_DECORATIONS.on;
}

/**
 * Monaco's renderValidationDecorations for an editor, or undefined to leave Monaco's own default
 * ('editable': marks show on an editable editor). A read-only editor needs 'on' to show its
 * run errors at all, `hideErrors` turns every mark off ('off'), and a page's own value wins
 * (renderValidationDecorationsFor). An editable editor without hideErrors keeps its options
 * exactly as before.
 */
function validationDecorations({ readOnly, hideErrors, pageValue }) {
	if (!readOnly && !hideErrors) return pageValue;
	return renderValidationDecorationsFor({ hideErrors, pageValue });
}

/** The site's options for an editor before the page's own: a height="fit" editor's scrollbar too (FIT_SCROLLBAR_OPTIONS). */
function siteOptionsFor(fit) {
	if (!fit) return DEFAULT_EDITOR_OPTIONS;
	return mergeOptions(DEFAULT_EDITOR_OPTIONS, { scrollbar: FIT_SCROLLBAR_OPTIONS });
}

/**
 * The options handed to Monaco: DEFAULT_EDITOR_OPTIONS (with `fit`, a height="fit" editor, also
 * FIT_SCROLLBAR_OPTIONS), the page's `editorOptions` over them, `fontFamily` (the page's stack,
 * read by the client: editorFont.js; a page's editorOptions.fontFamily wins), then `readOnly`
 * (the prop decides), `ariaLabel` (what a screen reader calls the editor) and renderValidationDecorations
 * (validationDecorations above: read-only editors, `hideErrors`). Never a `theme`: Monaco's
 * updateOptions would set it for the whole page (PAGE_THEME_WARNING). `touch` (a touch-first
 * device, touchMode.js): touchOptions.js > TOUCH_EDITOR_OPTIONS between the site's options and
 * the page's — the page still wins; with `touch` false the site options are taken by identity,
 * so the result is exactly what it was (__tests__/backCompat.test.js, viewGate.test.js).
 */
export function buildMonacoOptions(editorOptions = {}, { readOnly = false, ariaLabel, hideErrors = false, fit = false, fontFamily, touch = false } = {}) {
	const page = asObject(editorOptions);
	const options = mergeOptions(touchEditorOptions(siteOptionsFor(fit), page, touch), page);
	delete options.theme;
	if (options.fontFamily === undefined && fontFamily) options.fontFamily = fontFamily; // the page's stack (editorFont.js); a page's editorOptions win
	options.readOnly = Boolean(readOnly);
	if (ariaLabel) options.ariaLabel = ariaLabel;
	const decorations = validationDecorations({ readOnly: options.readOnly, hideErrors, pageValue: options.renderValidationDecorations });
	if (decorations !== undefined) options.renderValidationDecorations = decorations;
	return options;
}

/** The header's title for `language`: the page's `title`, else the language's file name (main.py). */
export function titleFor(settings, language) {
	return settings.title ?? languageInfo(language).fileName;
}

/** The language picker's entries: [{ id, label }], in the page's order. */
export function languageOptions(settings) {
	return settings.snippets.languages.map((id) => ({ id, label: languageInfo(id).label }));
}

/**
 * The code's height (px) once `language`'s folds are closed — what Monaco will report (sizing.js).
 * The folds are checked against the last line a fold can end on (sizing.js > lastFoldableLineOf),
 * as folding.js checks them, so the estimate hides exactly the lines Monaco will hide.
 */
export function initialContentHeight(settings, language) {
	const code = settings.snippets.code[language] ?? '';
	const { regions } = normalizeFoldRegions(settings.foldedRegions[language] ?? [], lastFoldableLineOf(code));
	const options = buildMonacoOptions(settings.editorOptions, settings);
	return estimateContentHeight({
		lineCount: lineCountOf(code),
		hiddenLines: hiddenLineCount(regions),
		lineHeight: lineHeightPx(options),
		paddingTop: options.padding?.top ?? 0,
		paddingBottom: options.padding?.bottom ?? 0,
	});
}

/** The editor box's first inline style for `language` (a fixed height, or the estimated content height). */
export function initialBoxStyle(settings, language) {
	return editorBoxStyle({
		height: settings.height,
		fit: settings.fit,
		maxHeight: settings.maxHeight,
		contentHeight: initialContentHeight(settings, language),
	});
}

/** The harness of `language`'s check ('' when the editor has no `tests` for it): the `tests` prop, per language. */
export function testsFor(settings, language) {
	return settings.tests === null ? '' : exerciseTextFor(settings.tests, language, settings.language);
}

/**
 * The solution for `language` ('' when the editor has none for it), without its magic comments,
 * so the diff compares like with like (the reader's code never holds them).
 */
export function solutionFor(settings, language) {
	if (settings.solution === null) return '';
	const text = exerciseTextFor(settings.solution, language, settings.language);
	return text === '' ? '' : stripMagicComments(text, language, { warn: () => {} }).code;
}

/**
 * Which exercise buttons the header shows for `language` (the placeholder draws a space for
 * each, so the two always agree): { hint, solution, check }. Hint: the light bulb that shows and
 * hides the hints area (HintList.jsx), when the editor has hints. Solution: a solution for this
 * language, and the editor is not read-only ("Use this solution" must be an undoable edit, which
 * a read-only editor cannot make). Check: tests for this language, in a language with a check
 * helper (codeRunner > supportsChecks).
 */
export function exerciseButtonsFor(settings, language) {
	return {
		hint: settings.hints.length > 0,
		solution: !settings.readOnly && solutionFor(settings, language) !== '',
		check: testsFor(settings, language) !== '' && supportsChecks(language),
	};
}

/**
 * The header's runtime slot (see THE HEADER'S RUNTIME SLOT in the header): RUNTIME_SLOTS.several
 * when the editor has a language picker, RUNTIME_SLOTS.single when it has not, or null (no slot:
 * the header as before) unless it shows an exercise button or its language is compiled in the
 * browser (TypeScript, runtimeChoice.js > compilesInBrowser). The placeholder (index.jsx) and
 * the header (Toolbar.jsx) both ask here, so they always agree.
 *   buttons        { hint, solution, check } (exerciseButtonsFor, or the header's own buttons)
 *   language       the language shown
 *   languageCount  how many languages the page gave code for
 */
export function runtimeSlotFor({ buttons, language, languageCount }) {
	const hasExerciseButton = Boolean(buttons.hint || buttons.solution || buttons.check);
	if (!hasExerciseButton && !compilesInBrowser(language)) return null;
	return languageCount > 1 ? RUNTIME_SLOTS.several : RUNTIME_SLOTS.single;
}

/**
 * The inline style of the not-yet-near placeholder's code text (index.jsx, `waiting`): the font,
 * size, line height, top padding and tab width Monaco will use for this editor (the page's
 * `editorOptions` included), so the text sits where Monaco will draw it. Its left edge:
 * styles.module.css > --ce-code-text-left.
 */
export function waitingCodeStyle(settings) {
	const options = buildMonacoOptions(settings.editorOptions, settings);
	const fontSize = typeof options.fontSize === 'number' && options.fontSize > 0 ? options.fontSize : DEFAULT_EDITOR_OPTIONS.fontSize;
	return {
		fontFamily: options.fontFamily ?? WAITING_FONT_CSS,
		fontSize: `${fontSize}px`,
		lineHeight: `${lineHeightPx(options)}px`,
		paddingTop: `${options.padding?.top ?? 0}px`,
		tabSize: options.tabSize,
	};
}
