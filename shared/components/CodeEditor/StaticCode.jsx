/**
 * StaticCode.jsx — the editor's STATIC VIEW: the code as highlighted text, for a phone or tablet
 * (touchMode.js decides; StaticBox.jsx puts this inside the box with the "Tap to edit" bar). The
 * reader can select it (a long press), find it in the page, print it, and the page scrolls past
 * it — nothing of Monaco is loaded. What it draws comes from ONE store (staticCodeStore.js,
 * read through React's useSyncExternalStore): the text, the folds (closed or open), the
 * author's marks, the current step's lines and the flash of a <CodeRef>'s lines.
 *
 *     <StaticCode store={store} settings={settings} language="python" theme={theme} options={monacoOptions} onToggleFold={(index) => store.toggleFold(index)} />
 *
 * THE MARKUP  A region named after the file ("Code: main.py", like Monaco's ariaLabel), holding
 * one div.line per logical line of the code (data-line="n"; prism-react-renderer's tokens[i] is
 * line i+1, hidden lines included, so a fit editor's static view draws its lines at the
 * placeholder's size — the box itself has no ceiling, and a long line wraps):
 *   - classes (lineClassName): `marked` with decorations.js's global kind class
 *     (dwf-ce-kind-<kind>: guided.module.css colours it, static.module.css draws it),
 *     `currentStep`, `flash` (with data-flash-token, a new value per flash);
 *   - a line inside a closed fold carries the `hidden` ATTRIBUTE (find-in-page and a copy skip
 *     it, like Monaco's hidden lines);
 *   - inside: the step's and the flash's underlays (empty spans, drawn under the text — the flash
 *     keyed by its token, so a second flash of the same line starts its animation again), then
 *     span.number (aria-hidden and not selectable: a selection copies code only), an open fold's
 *     chevron button in the gutter, and span.code with the Prism tokens (coloured inline by the
 *     chosen editor theme: prismTheme.js) and, on a closed fold's first line, the inline
 *     "⋯ 5 lines" button. The buttons tell `onToggleFold(index)` (the fold's index in the
 *     store's list); tapping the code itself opens nothing.
 *   - the container's inline style: Monaco's font, size, line height, top and bottom padding and
 *     tab width for this editor (staticCodeStyle, the placeholder's values plus the bottom
 *     padding), the theme's text and background (the Prism theme's `plain`), the theme's line
 *     number colour (--ce-static-number) and the line height as a custom property for the
 *     chevron (--ce-static-line-height).
 * The marks' summary and the <CodeRef> announcements for screen readers are the shell's
 * (CodeEditorClient.jsx) and stay. Rendered only in the browser on the site (the server draws
 * index.jsx's placeholder); __tests__/staticCode.test.js renders it on the server through
 * jsxHooks.js all the same. Pure apart from React: no DOM, no Monaco.
 *
 * HOW TO CHANGE IT
 *   The words (the fold buttons' text and tooltips, the region's name, the bar's words that
 *   StaticBox.jsx shows): WORDS. The look: static.module.css (the colours themselves:
 *   guided.module.css). Which Prism language a Monaco language is, and the theme's colours as a
 *   Prism theme: prismTheme.js. The metrics: props.js > buildMonacoOptions (what Monaco gets;
 *   staticCodeStyle reads the same). A new kind of mark: decorations.js > LINE_KINDS (its colours
 *   in guided.module.css, its sign in static.module.css if it has one).
 */

import React, { useMemo, useSyncExternalStore } from 'react';
import { Highlight, Prism } from 'prism-react-renderer';
import { CLASS_PREFIX, FLASH_CLASS, LINE_KINDS, STEP_CLASS } from './decorations.js';
import { languageInfo } from './lib/codeRunner/index.js';
import { prismLanguageFor, prismThemeOf } from './prismTheme.js';
import { DEFAULT_EDITOR_OPTIONS, WAITING_FONT_CSS, buildMonacoOptions, titleFor } from './props.js';
import { lineHeightPx } from './sizing.js';
import { hiddenLinesOf } from './staticCodeStore.js';
import './guided.module.css'; // the kind, step and flash colours (CodeEditorClient.jsx loads it too; webpack keeps one copy)
import styles from './static.module.css';

/** Every word this file (and the bar, StaticBox.jsx) shows the reader. */
export const WORDS = Object.freeze({
	hiddenLines: (count) => (count === 1 ? '⋯ 1 line' : `⋯ ${count} lines`),
	showHidden: 'Show the hidden lines',
	hideLines: (count) => (count === 1 ? 'Hide 1 line' : `Hide ${count} lines`),
	region: (title) => `Code: ${title}`,
	tapToEdit: 'Tap to edit',
	tapToEditTooltip: 'Open the editor to change and run the code',
});

/** The container's custom properties (static.module.css reads them). */
const NUMBER_COLOR_PROPERTY = '--ce-static-number';
const LINE_HEIGHT_PROPERTY = '--ce-static-line-height';

/** The global class of a marked line's kind (decorations.js gives Monaco the same name). */
export function kindClass(kind) {
	return `${CLASS_PREFIX}kind-${kind}`;
}

/** The author's kind of `line` in `snapshot`, or null when it has none (or an unknown one). */
function kindOf(snapshot, line) {
	const kind = snapshot.lineKinds?.[line];
	return LINE_KINDS.includes(kind) ? kind : null;
}

/** Is `line` one of the current step's lines? */
function inStep(snapshot, line) {
	return Boolean(snapshot.stepLines?.has(line));
}

/** Is `line` flashing now? */
function isFlashing(snapshot, line) {
	return Boolean(snapshot.flash?.lines?.has(line));
}

/** The class names of div.line for line `line` of `snapshot` (`styles`: the CSS module; see THE MARKUP). */
export function lineClassName(snapshot, line, styles) {
	const classes = [styles.line];
	const kind = kindOf(snapshot, line);
	if (kind) classes.push(styles.marked, kindClass(kind));
	if (inStep(snapshot, line)) classes.push(styles.currentStep);
	if (isFlashing(snapshot, line)) classes.push(styles.flash);
	return classes.join(' ');
}

/** Monaco's font size from its options (a number of px), else the default. */
function fontSizeOf(options) {
	return typeof options.fontSize === 'number' && options.fontSize > 0 ? options.fontSize : DEFAULT_EDITOR_OPTIONS.fontSize;
}

/**
 * The container's metrics as inline style: what index.jsx's placeholder draws its code with
 * (props.js > waitingCodeStyle: the font, size, line height, top padding and tab width Monaco
 * will use for this editor) plus Monaco's bottom padding. `options`: the Monaco options the
 * client built (the resolved font family, the page's editorOptions); without them the options
 * are built from `settings` as the placeholder builds them.
 */
export function staticCodeStyle(settings, options = buildMonacoOptions(settings.editorOptions, settings)) {
	return {
		fontFamily: options.fontFamily ?? WAITING_FONT_CSS,
		fontSize: `${fontSizeOf(options)}px`,
		lineHeight: `${lineHeightPx(options)}px`,
		paddingTop: `${options.padding?.top ?? 0}px`,
		paddingBottom: `${options.padding?.bottom ?? 0}px`,
		tabSize: options.tabSize,
	};
}

/** The theme's line number colour, or null when the theme does not say (the stylesheet's muted colour then). */
function numberColorOf(theme) {
	return theme?.keyColors?.lineNumber ?? null;
}

/** The container's whole inline style: the metrics, the theme's text and background (`plain`: the Highlight render's style), the two custom properties. */
function containerStyle({ settings, options, theme, plain }) {
	const metrics = staticCodeStyle(settings, options);
	const style = { ...metrics, ...plain, [LINE_HEIGHT_PROPERTY]: metrics.lineHeight };
	const numberColor = numberColorOf(theme);
	if (numberColor) style[NUMBER_COLOR_PROPERTY] = numberColor;
	return style;
}

/** The folds by their first line: Map(start -> { start, end, open, index }). */
function foldsByStart(folds) {
	const byStart = new Map();
	(folds ?? []).forEach((fold, index) => byStart.set(fold.start, { ...fold, index }));
	return byStart;
}

/** The chevron of an open fold, in the gutter: a tap closes it again. */
function FoldChevron({ fold, onToggleFold }) {
	const count = fold.end - fold.start;
	return (
		<button type="button" className={styles.foldChevron} aria-expanded="true" aria-label={WORDS.hideLines(count)} onClick={() => onToggleFold(fold.index)}>
			<svg className={styles.chevronIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
				<path d="M4 6l4 4 4-4" />
			</svg>
		</button>
	);
}

/** The "⋯ 5 lines" button after a closed fold's first line: a tap opens it. */
function FoldMarker({ fold, onToggleFold }) {
	const count = fold.end - fold.start;
	return (
		<button type="button" className={styles.foldMarker} aria-expanded="false" title={WORDS.showHidden} onClick={() => onToggleFold(fold.index)}>
			{WORDS.hiddenLines(count)}
		</button>
	);
}

/** One line's tokens as spans, coloured by the theme (an empty line's lone "\n" token is left out: the row has its height from the number). */
function LineTokens({ tokens, getTokenProps }) {
	return tokens.filter((token) => !token.empty).map((token, index) => <span key={index} {...getTokenProps({ token })} />);
}

/** One line of the code (see THE MARKUP). */
function Line({ line, tokens, snapshot, hidden, fold, getTokenProps, onToggleFold }) {
	const flashing = isFlashing(snapshot, line);
	return (
		<div className={lineClassName(snapshot, line, styles)} data-line={line} hidden={hidden ? true : undefined} data-flash-token={flashing ? snapshot.flash.token : undefined}>
			{inStep(snapshot, line) ? <span className={`${styles.step} ${STEP_CLASS}`} /> : null}
			{flashing ? <span key={snapshot.flash.token} className={`${styles.flashBand} ${FLASH_CLASS}`} /> : null}
			<span className={styles.number} aria-hidden="true">
				{line}
			</span>
			{fold?.open ? <FoldChevron fold={fold} onToggleFold={onToggleFold} /> : null}
			<span className={styles.code}>
				<LineTokens tokens={tokens} getTokenProps={getTokenProps} />
				{fold && !fold.open ? <FoldMarker fold={fold} onToggleFold={onToggleFold} /> : null}
			</span>
		</div>
	);
}

/** See the header. `store`: staticCodeStore.js's (subscribe / getSnapshot). */
export default function StaticCode({ store, settings, language, theme, options, onToggleFold }) {
	const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
	const hidden = useMemo(() => hiddenLinesOf(snapshot.folds), [snapshot.folds]);
	const folds = useMemo(() => foldsByStart(snapshot.folds), [snapshot.folds]);
	const prismTheme = prismThemeOf(theme?.name);
	const prismLanguage = prismLanguageFor(languageInfo(language).monaco);
	return (
		<Highlight prism={Prism} theme={prismTheme} code={snapshot.text} language={prismLanguage}>
			{({ style, tokens, getTokenProps }) => (
				<div className={styles.static} role="region" aria-label={WORDS.region(titleFor(settings, language))} style={containerStyle({ settings, options, theme, plain: style })}>
					{tokens.map((lineTokens, index) => (
						<Line
							key={index + 1}
							line={index + 1}
							tokens={lineTokens}
							snapshot={snapshot}
							hidden={hidden.has(index + 1)}
							fold={folds.get(index + 1)}
							getTokenProps={getTokenProps}
							onToggleFold={onToggleFold}
						/>
					))}
				</div>
			)}
		</Highlight>
	);
}
