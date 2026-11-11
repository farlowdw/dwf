/**
 * editorThemes.js — every colour theme a reader can pick for <CodeEditor>, in ONE place: the
 * families the Theme menu lists (ThemeMenu.jsx), each family's light and / or dark variant, and
 * for each variant its Monaco definition and the colours of the frame around the editor (the
 * --ce-* custom properties of styles.module.css). Pure data and a few small functions: no React,
 * no DOM, nothing read at import (safe on the server). The reader's stored choice: themeChoice.js;
 * the page-wide hook: useEditorTheme.js.
 *
 *     resolveTheme('github', 'dark')     // EDITOR_THEMES['dwf-github-dark']: { name, mode, keyColors, monaco, frame }
 *     resolveTheme('dracula', 'light')   // EDITOR_THEMES['dwf-dracula']: its one variant, whatever the site's mode
 *     defineEditorThemes(monaco)         // registers the custom themes with Monaco, once per page
 *     THEME_MENU_FAMILIES                // the Theme menu's `families` prop (ThemeMenu.jsx)
 *     frameAttributesOf(theme)           // { 'data-ce-mode', style }: what the editor's frame element carries
 *     diffKeyOf('dwf-monokai')           // { yours, solution, outlined }: the Solution panel's colour key
 *
 * ONE THEME PER PAGE, THE READER'S  Monaco has one theme for the whole page, so the theme is the
 *   reader's pick and nothing else (useEditorTheme.js): a page cannot pin one editor to a theme
 *   (the old `editorSettings.theme` and an `options.theme` are ignored with a console warning,
 *   props.js), since that editor's frame and the page's Monaco would disagree.
 *
 * THE FAMILIES (THEME_FAMILIES, in menu order)
 *   id                menu label                              light                 dark
 *   vscode (default)  VS Code                                 vs (built-in)         vs-dark (built-in)
 *   high-contrast     High contrast                           hc-light (built-in)   hc-black (built-in)
 *   github            GitHub                                  dwf-github-light      dwf-github-dark
 *   solarized         Solarized                               dwf-solarized-light   dwf-solarized-dark
 *   dracula           Dracula (like the site's code blocks)   —                     dwf-dracula
 *   one-dark          One Dark                                —                     dwf-one-dark
 *   monokai           Monokai                                 —                     dwf-monokai
 *   A family with both variants follows the site's light / dark switch; a one-variant family keeps
 *   its own mode whatever the site's. `note` (null for every family today) would replace the line
 *   the menu writes under a label ("Follows the site's light / dark switch", "Always dark":
 *   ThemeMenu.jsx > noteFor).
 *
 * A CONCRETE THEME (EDITOR_THEMES, keyed by its Monaco name)
 *   name       the Monaco theme name (monaco.editor.setTheme, <Editor theme>)
 *   mode       'light' | 'dark': the frame's data-ce-mode and the MUI mode of the controls in it
 *   keyColors  { background, foreground, comment, lineNumber, keyword, string }: the menu's swatch
 *              (THEME_MENU_FAMILIES) and the contrast test
 *   monaco     { base, inherit, rules, colors } for monaco.editor.defineTheme; null for Monaco's
 *              four built-in themes, which need no definition
 *   frame      the --ce-* colours of the frame (FRAME_PROPERTIES), to set on the frame element
 *              (React skips a null value: that property keeps the stylesheet's, or stays unset)
 *   Everything exported is frozen; defineEditorThemes hands Monaco copies.
 *
 * THE DEFAULT IS TODAY'S EDITOR  'vscode' resolves to Monaco's own 'vs' / 'vs-dark'
 *   (monacoSetup.js > THEME_LIGHT / THEME_DARK), and their frame colours are exactly the values in
 *   styles.module.css (.frame, and its dark rule): __tests__/editorThemes.test.js reads the
 *   stylesheet and compares. Two frame properties are new (ADDED_FRAME_PROPERTIES), for the
 *   one-mode themes, whose mode can differ from the site's: --ce-text (the frame's own text: its
 *   title, notices, Retry; today the frame inherits the text colour around it) and
 *   --ce-output-block-fg (the text of the output's code block, which Docusaurus colours with the
 *   site's Prism theme). The default themes leave both unset (null), so nothing changes for them;
 *   they can do so only because VS Code's themes always take the site's mode (a test checks that
 *   no theme the reader can reach leaves them unset in the other mode).
 *
 * THE TEACHING LAYER'S COLOURS (LAYER_PROPERTIES, optional per theme)  The marked lines' bands
 *   (guided.module.css), the exercise diff's rows (ExercisePanel.module.css) and a type query's
 *   chip (twoslash.module.css) use the site's colours of the theme's MODE, tuned for VS Code's
 *   backgrounds. A theme whose text has less headroom gives its own in `layer` (see CONTRAST):
 *   each becomes a --ce-band-* / --ce-type-chip-bg property on the frame, which the stylesheets
 *   read before their own value (`var(--ce-band-error, var(--ce-line-error-bg))`). Leave a key
 *   out and the site's value applies; Monaco's four built-in themes leave every one out, so the
 *   default look is unchanged. A band stays translucent (#rrggbbaa: Monaco draws the selection
 *   under it); band(hue, alpha, darken) makes one from BAND_HUES.
 *
 * HOW A CUSTOM THEME IS MADE  Each is one entry of CUSTOM_THEMES, written from its published
 *   palette (a named constant below, credited under WHERE THE COLOURS COME FROM):
 *     syntax   a colour for every role of SYNTAX_TOKENS (which Monarch tokens each role colours,
 *              written from the tokenizers in node_modules/monaco-editor/esm/vs/basic-languages
 *              for python, typescript (JavaScript uses it), cpp (C and C++), go and shell; a rule
 *              covers every token that starts with its name, so 'string' also colours
 *              'string.escape.python'); `italic` lists the roles drawn in italics;
 *     editor   a colour for every key of EDITOR_COLOR_IDS (which Monaco colour ids each sets:
 *              background, text, line highlight, selection, line numbers, cursor, indent guides,
 *              whitespace, bracket match, the hover / suggest widgets, error and warning
 *              squiggles); `brackets` the three bracket-pair colours; `inserted` / `removed` the
 *              diff's green and red (the solution panel, and its colour key: diffKeyOf), drawn
 *              at DIFF_WORD_ALPHA on changed words and DIFF_LINE_ALPHA on changed lines;
 *              optionally `lineHighlightBorder` (the current line's outline; TRANSPARENT when
 *              left out: the line is shown by its background);
 *     frame    every FRAME_PROPERTIES colour but the LAYER_PROPERTIES ones;
 *     layer    optional: the teaching layer's colours the theme needs of its own (see THE
 *              TEACHING LAYER'S COLOURS), keyed as LAYER_PROPERTIES.
 *   buildMonacoTheme() turns that into Monaco's definition, with `inherit: false`: a token no
 *   role names takes the editor's text colour, never a colour left over from VS Code's theme.
 *
 * WHERE THE COLOURS COME FROM (open palettes, copied as values: no package, no CDN)
 *   GitHub     GitHub's Primer colours (primer/primitives, MIT) as GitHub's own VS Code themes
 *              use them (primer/github-vscode-theme: "GitHub Light Default", "GitHub Dark Default").
 *   Solarized  Ethan Schoonover's sixteen colours (altercation/solarized, MIT).
 *   Dracula    Zeno Rocha's Dracula (dracula/visual-studio-code, MIT), mapped like the site's code
 *              blocks: each role takes the colour prism-react-renderer's dracula theme gives the
 *              same kind of token (purple keywords, upright as the site draws them, and
 *              constants; pink strings; yellow attribute names; a C #include purple, as Prism
 *              reads it as a keyword), and the tokens Prism leaves plain (numbers, class names,
 *              regular expressions, punctuation) are drawn in the text colour, as there. Roles
 *              Prism has no counterpart for keep Dracula's own colours (an annotation green,
 *              an invalid character red). Its current line is an outline, as in Dracula's own
 *              VS Code theme, not a fill.
 *   One Dark   Atom's One Dark (atom/one-dark-syntax and atom/one-dark-ui, MIT).
 *   Monokai    Wimer Hazenberg's Monokai as VS Code ships it (microsoft/vscode,
 *              extensions/theme-monokai, MIT), with VS Code's lighter comment grey.
 *   VS Code and High contrast: Monaco's own built-in themes (keyColors copied from
 *   node_modules/monaco-editor, checked by the test).
 *
 * CONTRAST (tested for every theme)  The editor's text 4.5:1 on its background (WCAG AA),
 *   comments and line numbers 3:1 — and the same wherever the code is read on a shade of its
 *   own: the current line (Monaco draws it at the cursor all the time), the hover and suggest
 *   widgets (run errors, TypeScript's types: their text 4.5:1), and every band of the teaching
 *   layer (a highlighted line, the current step, error, success, warning, added and removed
 *   lines: text 4.5:1, comments 3:1, and the line number drawn on it 3:1). In the frame, the
 *   text and the muted text 4.5:1 on the editor, header and output backgrounds, the run status
 *   colours 4.5:1, the resize grip 3:1; the exercise diff's + / − inks 4.5:1 on their rows; a
 *   type query's muted text 4.5:1 on its chip. Two things are left out on purpose: a selection
 *   (a short-lived state the reader starts; the palettes' own selection colours stay) and a
 *   <CodeRef>'s flash (yellow for half a second, gone after 1.5 s). VS Code's own themes keep the
 *   site's bands exactly as before (the default look does not change): vs-dark's comments are
 *   2.99:1 on its warning band, as they always were.
 *   Where a published tone falls short, the nearest tone of the SAME palette takes its place:
 *   Solarized light's text is base01 (#586e75, 5.0:1; its usual base00 is 4.1:1) and its comments
 *   and line numbers base00; Solarized dark's text is base1 (#93a1a1, 5.6:1; its usual base0 is
 *   4.75:1 and drops under 4.5:1 on any shade) and its comments and line numbers base00 (#657b83,
 *   3.4:1; base01 is 2.8:1); One Dark's are Atom's mono-2 (#828997, 4.0:1; mono-3 is 2.3:1);
 *   GitHub light's line numbers are Primer's fg.subtle (#6e7781, 4.6:1; its #8c959f is 3.0:1 and
 *   fails under any band). Where a published shade (a current line, a widget, an output block)
 *   is too strong, it is softened toward the editor background (soften(): Solarized's base2 half
 *   way, Monokai's current line a quarter of the way). Where the site's bands are too strong, the
 *   theme's `layer` gives fainter ones, or, for a dark theme whose comments have no headroom
 *   (Dracula's are 3.0:1 on the background itself), darker tinted ones that never lighten the
 *   line. Muted text is the palette's secondary text tone where one reaches 4.5:1, else the text
 *   colour itself (Solarized, Dracula). The status colours are the palette's green and red where
 *   they reach 4.5:1, else the site's code-line inks (SITE_INKS). A hover shade the palette lacks
 *   is mixed from two of its tones (mix(), HOVER_MIX). The syntax accents are the published ones:
 *   Solarized light's yellow, cyan and green sit just under 3:1 (2.9 to 3.0), as Solarized has
 *   always had them; a reader who needs more picks High contrast.
 *
 * HOW TO CHANGE IT
 *   A new theme: its palette constant, one entry in CUSTOM_THEMES (every SYNTAX_TOKENS role,
 *   every EDITOR_COLOR_IDS key, `brackets`, `inserted`, `removed`, every FRAME_PROPERTIES key but
 *   the LAYER_PROPERTIES ones, and `layer` where the contrast test asks for it), then one family
 *   in THEME_FAMILIES. The tests check its shape, its Monaco colour ids, its token coverage and
 *   its contrast, and name any surface it fails on. The menu, the stored choice and the editor
 *   all read this file; the reader's documentation does not: name the family in README.md (> What
 *   the reader sees > Editor theme), where a test fails until it does, and in a site's own guide
 *   if that lists the themes.
 *   The default family: DEFAULT_FAMILY (today's look; the placeholder, index.jsx, always draws it).
 *   A token a language emits that no role covers (the test names it): add it to SYNTAX_TOKENS.
 *   A new --ce-* colour in styles.module.css: FRAME_PROPERTIES and every theme's frame (the vs /
 *   vs-dark values equal to the stylesheet's). A new teaching-layer colour a theme may set:
 *   LAYER_PROPERTIES, and the stylesheet reads it before its own value.
 */

/** The family an editor shows when the reader has picked nothing (or something unknown). */
export const DEFAULT_FAMILY = 'vscode';

/** The two modes: of the site (Docusaurus's colour mode) and of a concrete theme. */
const LIGHT = 'light';
const DARK = 'dark';

/** The Monaco base theme of a custom theme, by its mode. */
const BASE_FOR_MODE = Object.freeze({ [LIGHT]: 'vs', [DARK]: 'vs-dark' });

/** The diff's green and red: their opacity on changed words and on changed lines. */
const DIFF_WORD_ALPHA = 0.25;
const DIFF_LINE_ALPHA = 0.12;

/** How far a mixed hover shade moves from its first tone toward its second (see CONTRAST). */
const HOVER_MIX = 0.2;

/** How far a softened shade keeps toward the palette's own tone from the editor background (soften(); see CONTRAST). */
const SOFT_HALF = 0.5;
const SOFT_THREE_QUARTERS = 0.75;

/** A colour Monaco draws as nothing (the current line's border, which most custom themes drop). */
const TRANSPARENT = '#00000000';

/** Black, the colour a band's hue is darkened toward (band()). */
const BLACK = '#000000';

/**
 * The hues of a theme's own bands (`layer`; see THE TEACHING LAYER'S COLOURS): the site's
 * code-line hues (styles.module.css > THE CODE-LINE TOKENS: error red, warning yellow, success green, added
 * mint), a clear blue for a highlighted line and the current step (where the site's grey-blue
 * would need too much strength to show), and an amber for a warning that must stay dark.
 */
const BAND_HUES = Object.freeze({
	blue: '#005aff',
	red: '#ff0000',
	yellow: '#ffff00',
	amber: '#ffc800',
	green: '#00ff00',
	mint: '#00ff95',
});

/** A type query's chip a shade fainter than the site's dark one (rgba(97, 97, 97, 0.3), twoslash.module.css). */
const FAINT_TYPE_CHIP = '#61616133';

/**
 * The teaching layer's colours a theme may set of its own (its `layer`, see THE TEACHING
 * LAYER'S COLOURS): the key in `layer`, the --ce-* property it becomes on the frame. Read by
 * guided.module.css (the bands; `removed` and `added` also by ExercisePanel.module.css's diff
 * rows) and twoslash.module.css (the chip), each before its own value.
 */
export const LAYER_PROPERTIES = deepFreeze({
	highlight: '--ce-band-highlight',
	error: '--ce-band-error',
	success: '--ce-band-success',
	warning: '--ce-band-warning',
	added: '--ce-band-added',
	removed: '--ce-band-removed',
	typeChip: '--ce-type-chip-bg',
});

/**
 * The frame's colours: the --ce-* custom properties a theme sets on the frame element. The first
 * eleven are today's (styles.module.css); ADDED_FRAME_PROPERTIES are new (see the header), and so
 * are the optional LAYER_PROPERTIES (null unless the theme's `layer` gives one).
 */
export const ADDED_FRAME_PROPERTIES = Object.freeze(['--ce-text', '--ce-output-block-fg']);
export const FRAME_PROPERTIES = Object.freeze([
	'--ce-editor-bg',
	'--ce-header-bg',
	'--ce-border',
	'--ce-control-bg',
	'--ce-output-block-bg',
	'--ce-handle-hover',
	'--ce-grip',
	'--ce-muted',
	'--ce-editor-fg',
	'--ce-success',
	'--ce-failure',
	...ADDED_FRAME_PROPERTIES,
	...Object.values(LAYER_PROPERTIES),
]);

/**
 * The editor's built-in code-line inks (styles.module.css > THE CODE-LINE TOKENS: the fallbacks
 * of --ce-line-success-ink and --ce-line-error-ink, which equal shared/css's
 * --code-line-* tokens), by mode: the status colours of a theme whose own green or red is too
 * faint (see CONTRAST). __tests__/editorThemes.test.js keeps them equal to the stylesheet's.
 */
export const SITE_INKS = Object.freeze({
	[LIGHT]: Object.freeze({ success: '#1a7f37', failure: '#d1242f' }),
	[DARK]: Object.freeze({ success: '#56d364', failure: '#ff7b72' }),
});

/* ---- the published palettes (see WHERE THE COLOURS COME FROM) ---- */

/** GitHub's Primer colours, light ("GitHub Light Default"). */
const PRIMER_LIGHT = Object.freeze({
	canvas: '#ffffff',
	canvasSubtle: '#f6f8fa',
	neutralSubtle: '#eaeef2',
	fg: '#1f2328',
	fgMuted: '#59636e',
	fgSubtle: '#6e7781', // also the line numbers (GitHub's own #8c959f is 3.0:1: see CONTRAST)
	border: '#d0d7de',
	whitespace: '#afb8c1',
	accent: '#0969da',
	success: '#1a7f37',
	danger: '#d1242f',
	attention: '#9a6700',
	green: '#4ac26b',
	// the syntax colours (Primer's "prettylights")
	comment: '#6e7781',
	keyword: '#cf222e',
	string: '#0a3069',
	constant: '#0550ae',
	entity: '#8250df',
	entityTag: '#116329',
	variable: '#953800',
	invalid: '#82071e',
});

/** GitHub's Primer colours, dark ("GitHub Dark Default"). */
const PRIMER_DARK = Object.freeze({
	canvas: '#0d1117',
	canvasSubtle: '#161b22',
	neutralSubtle: '#21262d',
	fg: '#e6edf3',
	fgMuted: '#8b949e',
	fgSubtle: '#6e7681',
	border: '#30363d',
	lineNumber: '#6e7681',
	whitespace: '#484f58',
	accent: '#2f81f7',
	success: '#3fb950',
	danger: '#f85149',
	attention: '#d29922',
	green: '#3fb950',
	greenBright: '#56d364',
	yellowBright: '#e3b341',
	// the syntax colours (Primer's "prettylights")
	comment: '#8b949e',
	keyword: '#ff7b72',
	string: '#a5d6ff',
	constant: '#79c0ff',
	entity: '#d2a8ff',
	entityTag: '#7ee787',
	variable: '#ffa657',
	invalid: '#ffa198',
});

/** Solarized's sixteen colours (base03 is the darkest background, base3 the lightest). */
const SOLARIZED = Object.freeze({
	base03: '#002b36',
	base02: '#073642',
	base01: '#586e75',
	base00: '#657b83',
	base0: '#839496',
	base1: '#93a1a1',
	base2: '#eee8d5',
	base3: '#fdf6e3',
	yellow: '#b58900',
	orange: '#cb4b16',
	red: '#dc322f',
	magenta: '#d33682',
	violet: '#6c71c4',
	blue: '#268bd2',
	cyan: '#2aa198',
	green: '#859900',
});

/** Dracula's colours, with the darker and lighter backgrounds of its VS Code theme. */
const DRACULA = Object.freeze({
	background: '#282a36',
	currentLine: '#44475a',
	foreground: '#f8f8f2',
	comment: '#6272a4',
	cyan: '#8be9fd',
	green: '#50fa7b',
	orange: '#ffb86c',
	pink: '#ff79c6',
	purple: '#bd93f9',
	red: '#ff5555',
	yellow: '#f1fa8c',
	bgLighter: '#424450',
	bgLight: '#343746',
	bgDark: '#21222c',
	bgDarker: '#191a21',
	cursor: '#f8f8f0',
});

/** Atom's One Dark: the syntax colours (mono = greys, hue = accents) and the UI's. */
const ONE_DARK = Object.freeze({
	background: '#282c34',
	mono1: '#abb2bf',
	mono2: '#828997',
	mono3: '#5c6370',
	cyan: '#56b6c2',
	blue: '#61afef',
	purple: '#c678dd',
	green: '#98c379',
	red: '#e06c75',
	orange: '#d19a66',
	yellow: '#e5c07b',
	cursor: '#528bff',
	selection: '#3e4451',
	cursorLine: '#2c313c',
	uiBase: '#21252b',
	uiText: '#9da5b4',
	uiInput: '#1d1f23',
	uiHover: '#2c313a',
});

/** Monokai as VS Code ships it. */
const MONOKAI = Object.freeze({
	background: '#272822',
	foreground: '#f8f8f2',
	comment: '#88846f',
	pink: '#f92672',
	orange: '#fd971f',
	yellow: '#e6db74',
	green: '#a6e22e',
	blue: '#66d9ef',
	purple: '#ae81ff',
	lineHighlight: '#3e3d32',
	selection: '#878b91',
	lineNumber: '#90908a',
	lineNumberActive: '#c2c2bf',
	cursor: '#f8f8f0',
	guide: '#464741',
	guideActive: '#767771',
	widget: '#1e1f1c',
	border: '#414339',
	hoverBorder: '#75715e',
	tabText: '#ccccc7',
});

/* ---- colour helpers ---- */

/** `color` (#rrggbb) at `alpha` (0 to 1) as #rrggbbaa. */
function withAlpha(color, alpha) {
	const byte = Math.round(alpha * 255).toString(16).padStart(2, '0');
	return `${color.slice(0, 7)}${byte}`;
}

/** The red, green and blue channels of #rrggbb. */
function channels(color) {
	return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
}

/** `from` moved `share` (0 to 1) of the way toward `to`, both #rrggbb, as #rrggbb. */
function mix(from, to, share) {
	const target = channels(to);
	const mixed = channels(from).map((value, index) => Math.round(value + (target[index] - value) * share));
	return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

/** A palette shade (`tone`) softened toward the editor `background`, keeping `share` of the way to it (see CONTRAST). */
function soften(background, tone, share) {
	return mix(background, tone, share);
}

/**
 * A band of the teaching layer (a theme's `layer`): `hue` (BAND_HUES), first darkened toward
 * black by `darken` (0 to 1; a dark theme with no headroom gets a darker tint that never
 * lightens the line), at `alpha`, as #rrggbbaa (translucent: the selection shows through).
 */
function band(hue, alpha, darken = 0) {
	return withAlpha(mix(hue, BLACK, darken), alpha);
}

/** Freeze `value` and everything in it (the registry is read-only). */
function deepFreeze(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}

/* ---- Monaco's four built-in themes: no definition, but their key colours and frames ---- */

/** VS Code's default light theme: the frame exactly as styles.module.css's .frame. */
const VS = {
	name: 'vs',
	mode: LIGHT,
	keyColors: { background: '#fffffe', foreground: '#000000', comment: '#008000', lineNumber: '#237893', keyword: '#0000ff', string: '#a31515' },
	frame: {
		'--ce-editor-bg': '#fffffe',
		'--ce-header-bg': '#f3f3f3',
		'--ce-border': '#e5e5e5',
		'--ce-control-bg': '#ffffff',
		'--ce-output-block-bg': '#f3f3f3',
		'--ce-handle-hover': '#e8e8e8',
		'--ce-grip': '#767676',
		'--ce-muted': '#616161',
		'--ce-editor-fg': '#000000',
		'--ce-success': 'var(--ifm-color-success-darkest)',
		'--ce-failure': 'var(--ce-line-error-ink)',
		'--ce-text': null, // unset: the frame inherits the text colour around it, as today
		'--ce-output-block-fg': null, // unset: the site's Prism theme colours the output, as today
	},
};

/** VS Code's default dark theme: the frame exactly as styles.module.css's dark .frame rule. */
const VS_DARK = {
	name: 'vs-dark',
	mode: DARK,
	keyColors: { background: '#1e1e1e', foreground: '#d4d4d4', comment: '#608b4e', lineNumber: '#858585', keyword: '#569cd6', string: '#ce9178' },
	frame: {
		'--ce-editor-bg': '#1e1e1e',
		'--ce-header-bg': '#252526',
		'--ce-border': '#3c3c3c',
		'--ce-control-bg': '#3c3c3c',
		'--ce-output-block-bg': '#252526',
		'--ce-handle-hover': '#2a2d2e',
		'--ce-grip': '#858585',
		'--ce-muted': '#a0a0a0',
		'--ce-editor-fg': '#d4d4d4',
		'--ce-success': 'var(--ifm-color-success-light)',
		'--ce-failure': 'var(--ifm-color-danger-light)',
		'--ce-text': null, // unset, as for 'vs'
		'--ce-output-block-fg': null,
	},
};

/** VS Code's light high-contrast theme; the frame in its colours (#0f4a85: its contrast border). */
const HC_LIGHT = {
	name: 'hc-light',
	mode: LIGHT,
	keyColors: { background: '#ffffff', foreground: '#292929', comment: '#008000', lineNumber: '#292929', keyword: '#0000ff', string: '#a31515' },
	frame: {
		'--ce-editor-bg': '#ffffff',
		'--ce-header-bg': '#ffffff',
		'--ce-border': '#0f4a85',
		'--ce-control-bg': '#ffffff',
		'--ce-output-block-bg': '#f2f2f2',
		'--ce-handle-hover': mix('#ffffff', '#0f4a85', 0.1), // VS Code's list hover (#0f4a85 at 10%) on white
		'--ce-grip': '#0f4a85',
		'--ce-muted': '#292929',
		'--ce-editor-fg': '#292929',
		'--ce-success': '#007100', // VS Code's high-contrast "passed" and "failed" colours
		'--ce-failure': '#b5200d',
		'--ce-text': '#292929',
		'--ce-output-block-fg': '#292929',
	},
};

/** VS Code's dark high-contrast theme; the frame in its colours (#6fc3df: its contrast border). */
const HC_BLACK = {
	name: 'hc-black',
	mode: DARK,
	keyColors: { background: '#000000', foreground: '#ffffff', comment: '#608b4e', lineNumber: '#ffffff', keyword: '#569cd6', string: '#ce9178' },
	frame: {
		'--ce-editor-bg': '#000000',
		'--ce-header-bg': '#000000',
		'--ce-border': '#6fc3df',
		'--ce-control-bg': '#000000',
		'--ce-output-block-bg': '#0c141f', // VS Code's high-contrast widget background
		'--ce-handle-hover': '#0c141f',
		'--ce-grip': '#6fc3df',
		'--ce-muted': '#ffffff',
		'--ce-editor-fg': '#ffffff',
		'--ce-success': '#73c991', // VS Code's high-contrast "passed" and "failed" colours
		'--ce-failure': '#f14c4c',
		'--ce-text': '#ffffff',
		'--ce-output-block-fg': '#ffffff',
	},
};

/** Monaco's built-in themes, in the order EDITOR_THEMES lists them. */
const BUILT_IN_THEMES = [VS, VS_DARK, HC_LIGHT, HC_BLACK];

/* ---- the custom themes: from roles to Monaco's definition ---- */

/**
 * The syntax roles a custom theme colours, each with the Monarch tokens it covers (a rule covers
 * every token that starts with its name: 'comment' covers 'comment.doc.go'). From the tokenizers
 * of the editor's languages (see the header): 'keyword.directive' is C's #include / #define,
 * 'type' covers JavaScript's and TypeScript's 'type.identifier' (a Capitalised name) and shell's
 * builtins, 'tag' is a Python decorator, 'annotation' a C++ / Go [[attribute]], 'metatag' a shell
 * script's #! line, 'attribute.name' a shell option (-la), 'variable' a shell $name,
 * 'variable.predefined' a shell $1, 'constants' shell's heredoc <<, 'invalid' a character
 * JavaScript and TypeScript do not know. Whitespace ('white') needs no colour.
 */
export const SYNTAX_TOKENS = deepFreeze({
	comment: ['comment'],
	keyword: ['keyword'],
	directive: ['keyword.directive'],
	string: ['string', 'attribute.value'],
	number: ['number'],
	regexp: ['regexp'],
	type: ['type'],
	identifier: ['identifier'],
	delimiter: ['delimiter', 'operator', 'constants'],
	variable: ['variable'],
	predefined: ['variable.predefined', 'predefined'],
	constant: ['constant'],
	tag: ['tag'],
	annotation: ['annotation', 'metatag'],
	attribute: ['attribute.name', 'key'],
	invalid: ['invalid'],
});

/** Rules every custom theme has: markdown's emphasis and strong text. */
const FONT_STYLE_RULES = Object.freeze([
	Object.freeze({ token: 'emphasis', fontStyle: 'italic' }),
	Object.freeze({ token: 'strong', fontStyle: 'bold' }),
]);

/** The editor colours a custom theme names, each with the Monaco colour ids it sets. */
export const EDITOR_COLOR_IDS = deepFreeze({
	background: ['editor.background', 'editorGutter.background', 'editorStickyScroll.background'],
	foreground: ['editor.foreground', 'editorWidget.foreground', 'editorHoverWidget.foreground', 'editorSuggestWidget.foreground'],
	lineHighlight: ['editor.lineHighlightBackground'],
	selection: ['editor.selectionBackground'],
	inactiveSelection: ['editor.inactiveSelectionBackground'],
	selectionHighlight: ['editor.selectionHighlightBackground', 'editor.wordHighlightBackground'],
	lineNumber: ['editorLineNumber.foreground'],
	lineNumberActive: ['editorLineNumber.activeForeground'],
	cursor: ['editorCursor.foreground'],
	indentGuide: ['editorIndentGuide.background1'],
	indentGuideActive: ['editorIndentGuide.activeBackground1'],
	whitespace: ['editorWhitespace.foreground'],
	bracketMatch: ['editorBracketMatch.background'],
	bracketMatchBorder: ['editorBracketMatch.border'],
	widget: ['editorWidget.background', 'editorHoverWidget.background', 'editorSuggestWidget.background', 'input.background'],
	widgetBorder: ['editorWidget.border', 'editorHoverWidget.border', 'editorSuggestWidget.border', 'input.border'],
	error: ['editorError.foreground', 'editorBracketHighlight.unexpectedBracket.foreground'],
	warning: ['editorWarning.foreground'],
});

/** The Monaco colour ids of the bracket-pair colours, in order (a theme gives `brackets`, one each). */
const BRACKET_COLOR_IDS = Object.freeze(['editorBracketHighlight.foreground1', 'editorBracketHighlight.foreground2', 'editorBracketHighlight.foreground3']);

/** Monaco's colour for the current line's border: TRANSPARENT (the line's background only) unless a theme gives `lineHighlightBorder` (Dracula). */
const LINE_HIGHLIGHT_BORDER_ID = 'editor.lineHighlightBorder';

/** The diff's colour ids (the solution panel). */
const DIFF_COLOR_IDS = Object.freeze({
	insertedWord: 'diffEditor.insertedTextBackground',
	insertedLine: 'diffEditor.insertedLineBackground',
	removedWord: 'diffEditor.removedTextBackground',
	removedLine: 'diffEditor.removedLineBackground',
});

/** GitHub, light. */
const GITHUB_LIGHT = {
	name: 'dwf-github-light',
	mode: LIGHT,
	italic: [],
	syntax: {
		comment: PRIMER_LIGHT.comment,
		keyword: PRIMER_LIGHT.keyword,
		directive: PRIMER_LIGHT.keyword,
		string: PRIMER_LIGHT.string,
		number: PRIMER_LIGHT.constant,
		regexp: PRIMER_LIGHT.entityTag,
		type: PRIMER_LIGHT.variable,
		identifier: PRIMER_LIGHT.fg,
		delimiter: PRIMER_LIGHT.fg,
		variable: PRIMER_LIGHT.variable,
		predefined: PRIMER_LIGHT.constant,
		constant: PRIMER_LIGHT.constant,
		tag: PRIMER_LIGHT.entity,
		annotation: PRIMER_LIGHT.entity,
		attribute: PRIMER_LIGHT.constant,
		invalid: PRIMER_LIGHT.invalid,
	},
	editor: {
		background: PRIMER_LIGHT.canvas,
		foreground: PRIMER_LIGHT.fg,
		lineHighlight: withAlpha(PRIMER_LIGHT.neutralSubtle, 0.5),
		selection: withAlpha(PRIMER_LIGHT.accent, 0.2),
		inactiveSelection: withAlpha(PRIMER_LIGHT.accent, 0.1),
		selectionHighlight: withAlpha(PRIMER_LIGHT.green, 0.25),
		lineNumber: PRIMER_LIGHT.fgSubtle,
		lineNumberActive: PRIMER_LIGHT.fg,
		cursor: PRIMER_LIGHT.accent,
		indentGuide: withAlpha(PRIMER_LIGHT.fg, 0.12),
		indentGuideActive: withAlpha(PRIMER_LIGHT.fg, 0.24),
		whitespace: PRIMER_LIGHT.whitespace,
		bracketMatch: withAlpha(PRIMER_LIGHT.green, 0.25),
		bracketMatchBorder: withAlpha(PRIMER_LIGHT.green, 0.6),
		widget: PRIMER_LIGHT.canvas,
		widgetBorder: PRIMER_LIGHT.border,
		error: PRIMER_LIGHT.keyword,
		warning: PRIMER_LIGHT.attention,
		brackets: [PRIMER_LIGHT.accent, PRIMER_LIGHT.success, PRIMER_LIGHT.attention],
		inserted: PRIMER_LIGHT.success,
		removed: PRIMER_LIGHT.keyword,
	},
	frame: {
		'--ce-editor-bg': PRIMER_LIGHT.canvas,
		'--ce-header-bg': PRIMER_LIGHT.canvasSubtle,
		'--ce-border': PRIMER_LIGHT.border,
		'--ce-control-bg': PRIMER_LIGHT.canvas,
		'--ce-output-block-bg': PRIMER_LIGHT.canvasSubtle,
		'--ce-handle-hover': PRIMER_LIGHT.neutralSubtle,
		'--ce-grip': PRIMER_LIGHT.fgSubtle,
		'--ce-muted': PRIMER_LIGHT.fgMuted,
		'--ce-editor-fg': PRIMER_LIGHT.fg,
		'--ce-success': PRIMER_LIGHT.success,
		'--ce-failure': PRIMER_LIGHT.danger,
		'--ce-text': PRIMER_LIGHT.fg,
		'--ce-output-block-fg': PRIMER_LIGHT.fg,
	},
};

/** GitHub, dark. */
const GITHUB_DARK = {
	name: 'dwf-github-dark',
	mode: DARK,
	italic: [],
	syntax: {
		comment: PRIMER_DARK.comment,
		keyword: PRIMER_DARK.keyword,
		directive: PRIMER_DARK.keyword,
		string: PRIMER_DARK.string,
		number: PRIMER_DARK.constant,
		regexp: PRIMER_DARK.entityTag,
		type: PRIMER_DARK.variable,
		identifier: PRIMER_DARK.fg,
		delimiter: PRIMER_DARK.fg,
		variable: PRIMER_DARK.variable,
		predefined: PRIMER_DARK.constant,
		constant: PRIMER_DARK.constant,
		tag: PRIMER_DARK.entity,
		annotation: PRIMER_DARK.entity,
		attribute: PRIMER_DARK.constant,
		invalid: PRIMER_DARK.invalid,
	},
	editor: {
		background: PRIMER_DARK.canvas,
		foreground: PRIMER_DARK.fg,
		lineHighlight: withAlpha(PRIMER_DARK.fgSubtle, 0.1),
		selection: withAlpha(PRIMER_DARK.accent, 0.3),
		inactiveSelection: withAlpha(PRIMER_DARK.accent, 0.15),
		selectionHighlight: withAlpha(PRIMER_DARK.green, 0.25),
		lineNumber: PRIMER_DARK.lineNumber,
		lineNumberActive: PRIMER_DARK.fg,
		cursor: PRIMER_DARK.accent,
		indentGuide: withAlpha(PRIMER_DARK.fg, 0.12),
		indentGuideActive: withAlpha(PRIMER_DARK.fg, 0.24),
		whitespace: PRIMER_DARK.whitespace,
		bracketMatch: withAlpha(PRIMER_DARK.green, 0.25),
		bracketMatchBorder: withAlpha(PRIMER_DARK.green, 0.6),
		widget: PRIMER_DARK.canvasSubtle,
		widgetBorder: PRIMER_DARK.border,
		error: PRIMER_DARK.danger,
		warning: PRIMER_DARK.attention,
		brackets: [PRIMER_DARK.constant, PRIMER_DARK.greenBright, PRIMER_DARK.yellowBright],
		inserted: PRIMER_DARK.success,
		removed: PRIMER_DARK.danger,
	},
	frame: {
		'--ce-editor-bg': PRIMER_DARK.canvas,
		'--ce-header-bg': PRIMER_DARK.canvasSubtle,
		'--ce-border': PRIMER_DARK.border,
		'--ce-control-bg': PRIMER_DARK.canvas,
		'--ce-output-block-bg': PRIMER_DARK.canvasSubtle,
		'--ce-handle-hover': PRIMER_DARK.neutralSubtle,
		'--ce-grip': PRIMER_DARK.fgMuted,
		'--ce-muted': PRIMER_DARK.fgMuted,
		'--ce-editor-fg': PRIMER_DARK.fg,
		'--ce-success': PRIMER_DARK.success,
		'--ce-failure': PRIMER_DARK.danger,
		'--ce-text': PRIMER_DARK.fg,
		'--ce-output-block-fg': PRIMER_DARK.fg,
	},
};

/** Solarized's syntax roles: the same accents in both variants; `comment` and `text` per variant. */
function solarizedSyntax({ comment, text }) {
	return {
		comment,
		keyword: SOLARIZED.green,
		directive: SOLARIZED.orange,
		string: SOLARIZED.cyan,
		number: SOLARIZED.magenta,
		regexp: SOLARIZED.red,
		type: SOLARIZED.yellow,
		identifier: text,
		delimiter: text,
		variable: SOLARIZED.blue,
		predefined: SOLARIZED.blue,
		constant: SOLARIZED.violet,
		tag: SOLARIZED.blue,
		annotation: SOLARIZED.orange,
		attribute: SOLARIZED.violet,
		invalid: SOLARIZED.red,
	};
}

/** The editor colours both Solarized variants share (the accents). */
const SOLARIZED_SHARED_EDITOR = Object.freeze({
	selectionHighlight: withAlpha(SOLARIZED.cyan, 0.2),
	bracketMatch: withAlpha(SOLARIZED.cyan, 0.2),
	bracketMatchBorder: SOLARIZED.cyan,
	error: SOLARIZED.red,
	warning: SOLARIZED.yellow,
	brackets: Object.freeze([SOLARIZED.blue, SOLARIZED.magenta, SOLARIZED.violet]),
	inserted: SOLARIZED.green,
	removed: SOLARIZED.red,
});

/**
 * Solarized light's base2 softened half way toward its background: its current line, widgets and
 * output block (base2 itself takes the text under 4.5:1 there: see CONTRAST).
 */
const SOLARIZED_LIGHT_SHADE = soften(SOLARIZED.base3, SOLARIZED.base2, SOFT_HALF);

/** Solarized light's own bands (a highlighted line and the current step; error and removed lines): fainter than the site's. */
const SOLARIZED_LIGHT_RED_BAND = band(BAND_HUES.red, 0.05);

/** Solarized, light (base3 background; text base01, comments base00: see CONTRAST). */
const SOLARIZED_LIGHT = {
	name: 'dwf-solarized-light',
	mode: LIGHT,
	italic: ['comment'],
	syntax: solarizedSyntax({ comment: SOLARIZED.base00, text: SOLARIZED.base01 }),
	editor: {
		...SOLARIZED_SHARED_EDITOR,
		background: SOLARIZED.base3,
		foreground: SOLARIZED.base01,
		lineHighlight: SOLARIZED_LIGHT_SHADE,
		selection: withAlpha(SOLARIZED.base1, 0.4),
		inactiveSelection: withAlpha(SOLARIZED.base1, 0.2),
		lineNumber: SOLARIZED.base00,
		lineNumberActive: SOLARIZED.base02,
		cursor: SOLARIZED.base01,
		indentGuide: withAlpha(SOLARIZED.base1, 0.3),
		indentGuideActive: SOLARIZED.base1,
		whitespace: withAlpha(SOLARIZED.base1, 0.5),
		widget: SOLARIZED_LIGHT_SHADE,
		widgetBorder: SOLARIZED.base1,
	},
	frame: {
		'--ce-editor-bg': SOLARIZED.base3,
		'--ce-header-bg': SOLARIZED.base2,
		'--ce-border': SOLARIZED.base1,
		'--ce-control-bg': SOLARIZED.base3,
		'--ce-output-block-bg': SOLARIZED_LIGHT_SHADE, // the exercise diff's green ink is 4.5:1 here, not on base2
		'--ce-handle-hover': mix(SOLARIZED.base2, SOLARIZED.base1, HOVER_MIX),
		'--ce-grip': SOLARIZED.base00,
		'--ce-muted': SOLARIZED.base02, // no lighter tone reaches 4.5:1 on base2 (see CONTRAST)
		'--ce-editor-fg': SOLARIZED.base01,
		'--ce-success': SITE_INKS[LIGHT].success, // Solarized's green is 3.0:1, its red 4.3:1 on base3
		'--ce-failure': SITE_INKS[LIGHT].failure,
		'--ce-text': SOLARIZED.base02,
		'--ce-output-block-fg': SOLARIZED.base02,
	},
	layer: {
		highlight: band(BAND_HUES.blue, 0.05),
		error: SOLARIZED_LIGHT_RED_BAND,
		removed: SOLARIZED_LIGHT_RED_BAND,
	},
};

/** Solarized, dark (base03 background; text base1, comments base00: see CONTRAST). */
const SOLARIZED_DARK = {
	name: 'dwf-solarized-dark',
	mode: DARK,
	italic: ['comment'],
	syntax: solarizedSyntax({ comment: SOLARIZED.base00, text: SOLARIZED.base1 }),
	editor: {
		...SOLARIZED_SHARED_EDITOR,
		background: SOLARIZED.base03,
		foreground: SOLARIZED.base1,
		lineHighlight: soften(SOLARIZED.base03, SOLARIZED.base02, SOFT_HALF), // base02 itself takes the comments to 2.9:1
		selection: withAlpha(SOLARIZED.base01, 0.5),
		inactiveSelection: withAlpha(SOLARIZED.base01, 0.25),
		lineNumber: SOLARIZED.base00,
		lineNumberActive: SOLARIZED.base1,
		cursor: SOLARIZED.base1,
		indentGuide: withAlpha(SOLARIZED.base01, 0.4),
		indentGuideActive: SOLARIZED.base00,
		whitespace: withAlpha(SOLARIZED.base01, 0.5),
		widget: SOLARIZED.base02,
		widgetBorder: SOLARIZED.base01,
	},
	frame: {
		'--ce-editor-bg': SOLARIZED.base03,
		'--ce-header-bg': SOLARIZED.base02,
		'--ce-border': SOLARIZED.base01,
		'--ce-control-bg': SOLARIZED.base03,
		'--ce-output-block-bg': SOLARIZED.base02,
		'--ce-handle-hover': mix(SOLARIZED.base02, SOLARIZED.base01, HOVER_MIX),
		'--ce-grip': SOLARIZED.base0,
		'--ce-muted': SOLARIZED.base1, // base0 is 4.1:1 on base02 (see CONTRAST)
		'--ce-editor-fg': SOLARIZED.base1,
		'--ce-success': SOLARIZED.green,
		'--ce-failure': SITE_INKS[DARK].failure, // Solarized's red is 3.3:1 on base03
		'--ce-text': SOLARIZED.base1,
		'--ce-output-block-fg': SOLARIZED.base1,
	},
	layer: {
		highlight: band(BAND_HUES.blue, 0.11),
		warning: band(BAND_HUES.yellow, 0.5, 0.8),
		success: band(BAND_HUES.green, 0.4, 0.75),
		added: band(BAND_HUES.mint, 0.4, 0.75),
		typeChip: FAINT_TYPE_CHIP, // base1 is 4.46:1 on the site's chip
	},
};

/** Dracula's error and removed lines: a darker red tint (its comments, 3.0:1, have no headroom: see CONTRAST). */
const DRACULA_RED_BAND = band(BAND_HUES.red, 0.25, 0.45);

/**
 * Dracula, mapped like the site's code blocks (prism-react-renderer's dracula: see WHERE THE
 * COLOURS COME FROM), keywords upright as there: shared/css/_code-blocks.scss sets Dracula's italic
 * keywords upright on the site. Numbers, types (class names) and regular expressions are plain
 * text, as Prism draws them; a C directive is a keyword.
 */
const DRACULA_THEME = {
	name: 'dwf-dracula',
	mode: DARK,
	italic: ['variable'],
	syntax: {
		comment: DRACULA.comment,
		keyword: DRACULA.purple,
		directive: DRACULA.purple,
		string: DRACULA.pink,
		number: DRACULA.foreground,
		regexp: DRACULA.foreground,
		type: DRACULA.foreground,
		identifier: DRACULA.foreground,
		delimiter: DRACULA.foreground,
		variable: DRACULA.purple,
		predefined: DRACULA.purple,
		constant: DRACULA.purple,
		tag: DRACULA.pink,
		annotation: DRACULA.green,
		attribute: DRACULA.yellow,
		invalid: DRACULA.red,
	},
	editor: {
		background: DRACULA.background,
		foreground: DRACULA.foreground,
		lineHighlight: TRANSPARENT, // Dracula's own VS Code theme outlines the current line, it does not fill it
		lineHighlightBorder: DRACULA.currentLine,
		selection: DRACULA.currentLine,
		inactiveSelection: withAlpha(DRACULA.currentLine, 0.5),
		selectionHighlight: DRACULA.bgLighter,
		lineNumber: DRACULA.comment,
		lineNumberActive: DRACULA.foreground,
		cursor: DRACULA.cursor,
		indentGuide: withAlpha(DRACULA.foreground, 0.1),
		indentGuideActive: withAlpha(DRACULA.foreground, 0.27),
		whitespace: withAlpha(DRACULA.foreground, 0.1),
		bracketMatch: withAlpha(DRACULA.purple, 0.2),
		bracketMatchBorder: DRACULA.purple,
		widget: DRACULA.bgDark,
		widgetBorder: DRACULA.comment,
		error: DRACULA.red,
		warning: DRACULA.orange,
		brackets: [DRACULA.foreground, DRACULA.pink, DRACULA.cyan],
		inserted: DRACULA.green,
		removed: DRACULA.red,
	},
	frame: {
		'--ce-editor-bg': DRACULA.background,
		'--ce-header-bg': DRACULA.bgDark,
		'--ce-border': DRACULA.currentLine,
		'--ce-control-bg': DRACULA.bgLight,
		'--ce-output-block-bg': DRACULA.bgDark,
		'--ce-handle-hover': DRACULA.bgLighter,
		'--ce-grip': DRACULA.comment,
		'--ce-muted': DRACULA.foreground, // its comment tone is 3.4:1 on the header (see CONTRAST)
		'--ce-editor-fg': DRACULA.foreground,
		'--ce-success': DRACULA.green,
		'--ce-failure': DRACULA.red,
		'--ce-text': DRACULA.foreground,
		'--ce-output-block-fg': DRACULA.foreground,
	},
	layer: {
		highlight: band(BAND_HUES.blue, 0.3, 0.6),
		error: DRACULA_RED_BAND,
		removed: DRACULA_RED_BAND,
		warning: band(BAND_HUES.amber, 0.55, 0.8),
		success: band(BAND_HUES.green, 0.44, 0.8),
		added: band(BAND_HUES.mint, 0.48, 0.8),
	},
};

/** One Dark (comments and line numbers in mono-2: see CONTRAST). */
const ONE_DARK_THEME = {
	name: 'dwf-one-dark',
	mode: DARK,
	italic: ['comment'],
	syntax: {
		comment: ONE_DARK.mono2,
		keyword: ONE_DARK.purple,
		directive: ONE_DARK.purple,
		string: ONE_DARK.green,
		number: ONE_DARK.orange,
		regexp: ONE_DARK.cyan,
		type: ONE_DARK.yellow,
		identifier: ONE_DARK.mono1,
		delimiter: ONE_DARK.mono1,
		variable: ONE_DARK.red,
		predefined: ONE_DARK.cyan,
		constant: ONE_DARK.orange,
		tag: ONE_DARK.red,
		annotation: ONE_DARK.blue,
		attribute: ONE_DARK.orange,
		invalid: ONE_DARK.red,
	},
	editor: {
		background: ONE_DARK.background,
		foreground: ONE_DARK.mono1,
		lineHighlight: ONE_DARK.cursorLine,
		selection: ONE_DARK.selection,
		inactiveSelection: withAlpha(ONE_DARK.selection, 0.6),
		selectionHighlight: withAlpha(ONE_DARK.mono1, 0.12),
		lineNumber: ONE_DARK.mono2,
		lineNumberActive: ONE_DARK.mono1,
		cursor: ONE_DARK.cursor,
		indentGuide: withAlpha(ONE_DARK.mono1, 0.15),
		indentGuideActive: withAlpha(ONE_DARK.mono1, 0.35),
		whitespace: withAlpha(ONE_DARK.mono3, 0.6),
		bracketMatch: withAlpha(ONE_DARK.blue, 0.2),
		bracketMatchBorder: ONE_DARK.mono2,
		widget: ONE_DARK.uiBase,
		widgetBorder: ONE_DARK.selection,
		error: ONE_DARK.red,
		warning: ONE_DARK.orange,
		brackets: [ONE_DARK.orange, ONE_DARK.purple, ONE_DARK.cyan],
		inserted: ONE_DARK.green,
		removed: ONE_DARK.red,
	},
	frame: {
		'--ce-editor-bg': ONE_DARK.background,
		'--ce-header-bg': ONE_DARK.uiBase,
		'--ce-border': ONE_DARK.selection,
		'--ce-control-bg': ONE_DARK.uiInput,
		'--ce-output-block-bg': ONE_DARK.uiBase,
		'--ce-handle-hover': ONE_DARK.uiHover,
		'--ce-grip': ONE_DARK.mono2,
		'--ce-muted': ONE_DARK.uiText,
		'--ce-editor-fg': ONE_DARK.mono1,
		'--ce-success': ONE_DARK.green,
		'--ce-failure': SITE_INKS[DARK].failure, // One Dark's red is 4.4:1 on its background
		'--ce-text': ONE_DARK.mono1,
		'--ce-output-block-fg': ONE_DARK.mono1,
	},
	layer: {
		highlight: band(BAND_HUES.blue, 0.12),
		warning: band(BAND_HUES.yellow, 0.2, 0.45),
		typeChip: FAINT_TYPE_CHIP, // its muted text is 4.46:1 on the site's chip
	},
};

/** Monokai, as VS Code ships it. */
const MONOKAI_THEME = {
	name: 'dwf-monokai',
	mode: DARK,
	italic: [],
	syntax: {
		comment: MONOKAI.comment,
		keyword: MONOKAI.pink,
		directive: MONOKAI.pink,
		string: MONOKAI.yellow,
		number: MONOKAI.purple,
		regexp: MONOKAI.yellow,
		type: MONOKAI.green,
		identifier: MONOKAI.foreground,
		delimiter: MONOKAI.foreground,
		variable: MONOKAI.orange,
		predefined: MONOKAI.blue,
		constant: MONOKAI.purple,
		tag: MONOKAI.pink,
		annotation: MONOKAI.green,
		attribute: MONOKAI.green,
		invalid: MONOKAI.pink,
	},
	editor: {
		background: MONOKAI.background,
		foreground: MONOKAI.foreground,
		lineHighlight: soften(MONOKAI.background, MONOKAI.lineHighlight, SOFT_THREE_QUARTERS), // #3e3d32 itself takes the comments to 2.9:1
		selection: withAlpha(MONOKAI.selection, 0.5),
		inactiveSelection: withAlpha(MONOKAI.selection, 0.25),
		selectionHighlight: withAlpha(MONOKAI.selection, 0.3),
		lineNumber: MONOKAI.lineNumber,
		lineNumberActive: MONOKAI.lineNumberActive,
		cursor: MONOKAI.cursor,
		indentGuide: MONOKAI.guide,
		indentGuideActive: MONOKAI.guideActive,
		whitespace: MONOKAI.guide,
		bracketMatch: withAlpha(MONOKAI.foreground, 0.1),
		bracketMatchBorder: MONOKAI.lineNumber,
		widget: MONOKAI.widget,
		widgetBorder: MONOKAI.hoverBorder,
		error: MONOKAI.pink,
		warning: MONOKAI.orange,
		brackets: [MONOKAI.green, MONOKAI.purple, MONOKAI.blue],
		inserted: MONOKAI.green,
		removed: MONOKAI.pink,
	},
	frame: {
		'--ce-editor-bg': MONOKAI.background,
		'--ce-header-bg': MONOKAI.widget,
		'--ce-border': MONOKAI.border,
		'--ce-control-bg': MONOKAI.border,
		'--ce-output-block-bg': MONOKAI.widget,
		'--ce-handle-hover': MONOKAI.lineHighlight,
		'--ce-grip': MONOKAI.lineNumber,
		'--ce-muted': MONOKAI.tabText,
		'--ce-editor-fg': MONOKAI.foreground,
		'--ce-success': MONOKAI.green,
		'--ce-failure': SITE_INKS[DARK].failure, // Monokai's pink is 3.9:1 on its background
		'--ce-text': MONOKAI.foreground,
		'--ce-output-block-fg': MONOKAI.foreground,
	},
	layer: {
		highlight: band(BAND_HUES.blue, 0.1),
		warning: band(BAND_HUES.yellow, 0.38, 0.65),
	},
};

/** The custom themes (see HOW A CUSTOM THEME IS MADE), in the order EDITOR_THEMES lists them. */
const CUSTOM_THEMES = [GITHUB_LIGHT, GITHUB_DARK, SOLARIZED_LIGHT, SOLARIZED_DARK, DRACULA_THEME, ONE_DARK_THEME, MONOKAI_THEME];

/** A colour as a Monaco token rule wants it: six hex digits, no '#'. */
function ruleColor(color) {
	return color.slice(1, 7);
}

/** The token rules of a custom theme: the default text, then every token of every role. */
function syntaxRules({ syntax, italic, editor }) {
	const rules = [{ token: '', foreground: ruleColor(editor.foreground), background: ruleColor(editor.background) }];
	for (const [role, tokens] of Object.entries(SYNTAX_TOKENS)) {
		const fontStyle = italic.includes(role) ? 'italic' : '';
		for (const token of tokens) rules.push({ token, foreground: ruleColor(syntax[role]), fontStyle });
	}
	return [...rules, ...FONT_STYLE_RULES.map((rule) => ({ ...rule }))];
}

/** The diff's four colours from a theme's green (`inserted`) and red (`removed`). */
function diffColors({ inserted, removed }) {
	return {
		[DIFF_COLOR_IDS.insertedWord]: withAlpha(inserted, DIFF_WORD_ALPHA),
		[DIFF_COLOR_IDS.insertedLine]: withAlpha(inserted, DIFF_LINE_ALPHA),
		[DIFF_COLOR_IDS.removedWord]: withAlpha(removed, DIFF_WORD_ALPHA),
		[DIFF_COLOR_IDS.removedLine]: withAlpha(removed, DIFF_LINE_ALPHA),
	};
}

/** The Monaco colours of a custom theme (every id of EDITOR_COLOR_IDS, the current line's outline, the brackets, the diff). */
function editorColors({ editor }) {
	const colors = { [LINE_HIGHLIGHT_BORDER_ID]: editor.lineHighlightBorder ?? TRANSPARENT };
	for (const [role, ids] of Object.entries(EDITOR_COLOR_IDS)) {
		for (const id of ids) colors[id] = editor[role];
	}
	BRACKET_COLOR_IDS.forEach((id, index) => {
		colors[id] = editor.brackets[index];
	});
	return { ...colors, ...diffColors(editor) };
}

/** A custom theme's definition for monaco.editor.defineTheme (see HOW A CUSTOM THEME IS MADE). */
export function buildMonacoTheme(definition) {
	return {
		base: BASE_FOR_MODE[definition.mode],
		inherit: false,
		rules: syntaxRules(definition),
		colors: editorColors(definition),
	};
}

/** The key colours of a custom theme (the menu's swatch, the contrast test). */
function keyColorsOf({ syntax, editor }) {
	return {
		background: editor.background,
		foreground: editor.foreground,
		comment: syntax.comment,
		lineNumber: editor.lineNumber,
		keyword: syntax.keyword,
		string: syntax.string,
	};
}

/** A theme's `layer` as frame properties: every LAYER_PROPERTIES one, null where the theme gives none (the stylesheet's value applies). */
function layerFrame(layer = {}) {
	return Object.fromEntries(Object.entries(LAYER_PROPERTIES).map(([key, property]) => [property, layer[key] ?? null]));
}

/** A custom theme as EDITOR_THEMES lists it. */
function customTheme(definition) {
	return {
		name: definition.name,
		mode: definition.mode,
		keyColors: keyColorsOf(definition),
		monaco: buildMonacoTheme(definition),
		frame: { ...definition.frame, ...layerFrame(definition.layer) },
	};
}

/** A built-in theme as EDITOR_THEMES lists it (no definition: Monaco has it; no layer colours: the site's, as before). */
function builtInTheme({ name, mode, keyColors, frame }) {
	return { name, mode, keyColors: { ...keyColors }, monaco: null, frame: { ...frame, ...layerFrame() } };
}

/** Every concrete theme, keyed by its Monaco name (see A CONCRETE THEME). */
export const EDITOR_THEMES = deepFreeze(
	Object.fromEntries([...BUILT_IN_THEMES.map(builtInTheme), ...CUSTOM_THEMES.map(customTheme)].map((theme) => [theme.name, theme])),
);

/** One family of THEME_FAMILIES: its light and dark theme names (null when it has no such variant). */
function family(id, label, light, dark) {
	return { id, label, light, dark, note: null };
}

/** The theme families, in menu order (see THE FAMILIES). */
export const THEME_FAMILIES = deepFreeze([
	family('vscode', 'VS Code', 'vs', 'vs-dark'),
	family('high-contrast', 'High contrast', 'hc-light', 'hc-black'),
	family('github', 'GitHub', 'dwf-github-light', 'dwf-github-dark'),
	family('solarized', 'Solarized', 'dwf-solarized-light', 'dwf-solarized-dark'),
	family('dracula', "Dracula (like the site's code blocks)", null, 'dwf-dracula'),
	family('one-dark', 'One Dark', null, 'dwf-one-dark'),
	family('monokai', 'Monokai', null, 'dwf-monokai'),
]);

/** The family with this id, or null. */
export function findFamily(id) {
	return THEME_FAMILIES.find((entry) => entry.id === id) ?? null;
}

/**
 * The concrete theme (an EDITOR_THEMES entry) for a family and the site's colour mode ('light' |
 * 'dark', Docusaurus's useColorMode): a two-variant family follows the site, a one-variant family
 * keeps its variant. An unknown family is read as DEFAULT_FAMILY, any mode but 'dark' as light.
 */
export function resolveTheme(familyId, siteMode) {
	const chosen = findFamily(familyId) ?? findFamily(DEFAULT_FAMILY);
	const preferred = siteMode === DARK ? chosen.dark : chosen.light;
	return EDITOR_THEMES[preferred ?? chosen.light ?? chosen.dark];
}

/** The concrete theme whose Monaco name is `name` (an EDITOR_THEMES entry), or null when the registry has none. */
export function themeByName(name) {
	return typeof name === 'string' && Object.hasOwn(EDITOR_THEMES, name) ? EDITOR_THEMES[name] : null;
}

/** The colour key's swatch alpha: a changed word as the diff draws it, the word's colour over the line's (two layers of one colour). */
const DIFF_KEY_ALPHA = 1 - (1 - DIFF_WORD_ALPHA) * (1 - DIFF_LINE_ALPHA);

/**
 * Monaco's high-contrast diffs draw no fill, only a dashed outline (monaco-editor's
 * editorColors.js: diffEditor.removedTextBorder / insertedTextBorder for hcLight and hcDark).
 */
const HIGH_CONTRAST_DIFF_OUTLINES = deepFreeze({
	'hc-light': { yours: '#ad0707', solution: '#374e06' },
	'hc-black': { yours: '#ff008f', solution: '#33ff2e' },
});

/** The key SolutionPanel.module.css draws by itself: VS Code's own diff colours (vs, vs-dark). */
const STYLESHEET_DIFF_KEY = Object.freeze({ yours: null, solution: null, outlined: false });

/**
 * The Solution panel's colour key for the Monaco theme `themeName`, matching the diff Monaco draws
 * in it: { yours, solution, outlined } — the swatches' colours (the removed red, the inserted
 * green) and whether they are outlines. VS Code's themes (and a name the registry does not know)
 * give null colours: the stylesheet's own, unchanged. A custom theme gives its `removed` /
 * `inserted` as a changed word shows them (DIFF_KEY_ALPHA); the high-contrast themes give
 * Monaco's outline colours, outlined.
 */
export function diffKeyOf(themeName) {
	if (Object.hasOwn(HIGH_CONTRAST_DIFF_OUTLINES, themeName)) return { ...HIGH_CONTRAST_DIFF_OUTLINES[themeName], outlined: true };
	const colors = themeByName(themeName)?.monaco?.colors;
	if (!colors) return STYLESHEET_DIFF_KEY;
	return {
		yours: withAlpha(colors[DIFF_COLOR_IDS.removedWord], DIFF_KEY_ALPHA),
		solution: withAlpha(colors[DIFF_COLOR_IDS.insertedWord], DIFF_KEY_ALPHA),
		outlined: false,
	};
}

/**
 * The attributes the editor's frame element carries for a concrete theme: `data-ce-mode` (the
 * mode the frame's CSS and the teaching layer's colours switch on: styles.module.css > THE
 * EDITOR'S MODE) and `style`, its --ce-* colours (React leaves a null one out: the stylesheet's
 * value, or unset). For 'vs' / 'vs-dark' every value equals the stylesheet's own, so the default
 * frame looks exactly as it did before themes (__tests__/editorThemes.test.js).
 */
export function frameAttributesOf(theme) {
	return { 'data-ce-mode': theme.mode, style: theme.frame };
}

/** One swatch of the Theme menu: a variant's background, text and accent (its keyword colour). */
function swatchOf(themeName) {
	const { mode, keyColors } = EDITOR_THEMES[themeName];
	return { mode, background: keyColors.background, foreground: keyColors.foreground, accent: keyColors.keyword };
}

/** The Theme menu's `families` prop (ThemeMenu.jsx > PROPS): one entry per family, a swatch per variant, light first. */
export const THEME_MENU_FAMILIES = deepFreeze(
	THEME_FAMILIES.map(({ id, label, note, light, dark }) => ({
		id,
		label,
		note,
		swatches: [light, dark].filter(Boolean).map(swatchOf),
	})),
);

/** The Monaco namespaces whose themes are defined already (defineEditorThemes: once per page). */
const definedFor = new WeakMap();

/** A plain copy of a Monaco definition (Monaco keeps what it is given; the registry stays frozen). */
function copyOf(definition) {
	return JSON.parse(JSON.stringify(definition));
}

/**
 * Register every custom theme with Monaco (monaco.editor.defineTheme), so that any of them can be
 * set by name; the built-in ones need nothing. Once per Monaco: later calls (every editor's
 * beforeMount) do nothing and return false. Returns true when it defined them; false too when
 * `monaco` has no editor.defineTheme. Never throws for a missing Monaco.
 */
export function defineEditorThemes(monaco) {
	if (typeof monaco?.editor?.defineTheme !== 'function' || definedFor.has(monaco)) return false;
	for (const theme of Object.values(EDITOR_THEMES)) {
		if (theme.monaco) monaco.editor.defineTheme(theme.name, copyOf(theme.monaco));
	}
	definedFor.set(monaco, true);
	return true;
}
