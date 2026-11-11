/**
 * themeWiring.test.js — how the reader's editor theme (2026-10-25) reaches the editor, checked
 * without a browser:
 *   - the frame's attributes (editorThemes.js > frameAttributesOf): data-ce-mode and the --ce-*
 *     colours inline; for VS Code's themes the mode is the site's and every inline colour equals
 *     the stylesheet's (the default looks exactly as before); every theme a reader can reach in
 *     the other mode than the site's sets the frame's text and the output's text, readable on
 *     the frame's backgrounds; the frame's color-scheme follows its mode;
 *   - a page cannot set the theme: the old `editorSettings.theme` and an `options.theme` reach
 *     neither <Editor> nor Monaco's options (Monaco's theme is page-wide; the reader picks it);
 *   - the CSS: every rule of the editor's CSS modules that differs by mode switches on the
 *     EDITOR's mode (data-ce-mode), never on the site's — except the placeholder's dark frame,
 *     which has no mode of its own and follows the site; the site's colours that differ by mode
 *     (the code-line tokens, read with built-in fallbacks: styles.module.css > THE CODE-LINE
 *     TOKENS, and Infima's few variables) are set again
 *     only on a frame whose theme is in the OTHER mode, so they can never apply to VS Code's
 *     themes; the frame's text and the output block's text fall back to today's when a theme
 *     leaves them unset;
 *   - CodeEditorClient.jsx (it needs Monaco and a browser, so its source is read): it registers
 *     the themes in beforeMount, puts frameAttributesOf on the frame, gives the MUI controls the
 *     theme's mode and hands the reader's family and its setter to the header; Monaco, the frame
 *     and the solution diff take the SAME theme, the reader's; it no longer reads the site's mode
 *     itself.
 * The colours themselves, picking, persistence across visits and tabs, and the menu's keyboard use
 * need a browser: README.md > How to change it lists the checks. Run with `npm run test:shared`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODE_LINE_TOKENS } from './codeLineTokens.js';
import { DEFAULT_FAMILY, EDITOR_THEMES, LAYER_PROPERTIES, THEME_FAMILIES, frameAttributesOf, resolveTheme, themeByName } from '../editorThemes.js';
import { PAGE_THEME_WARNING, PASSTHROUGH_EDITOR_PROPS, buildMonacoOptions, normalizeEditorProps } from '../props.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, '..');

/** A file of the editor's folder, or of the site, as text without its comments. */
function sourceOf(file, { css = true } = {}) {
	const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	return css ? text : text.replace(/^\s*\/\/[^\n]*$/gm, '');
}

/** The rules of a stylesheet (comments removed): [{ selectors: [..], body }], innermost blocks only. */
function rulesOf(css) {
	return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
		selectors: selector
			.trim()
			.split('\n')
			.filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('@'))
			.join(' ')
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean),
		body,
	}));
}

/** The value of `property` in a rule body, or null. */
function valueIn(body, property) {
	return body.match(new RegExp(`(?:^|;|\\s)${property}:\\s*([^;]+);`))?.[1].trim() ?? null;
}

/** The --ce-* declarations of the stylesheet's rule whose selector list is exactly `selectors`. */
function declarationsOf(rules, selectors) {
	const rule = rules.find((candidate) => candidate.selectors.join(' | ') === selectors.join(' | '));
	assert.ok(rule, `styles.module.css has the rule ${selectors.join(', ')}`);
	return rule.body;
}

const STYLESHEET = sourceOf(path.join(FOLDER, 'styles.module.css'));
const STYLE_RULES = rulesOf(STYLESHEET);

/** The placeholder's dark frame (no mode of its own: the site's) and a dark theme's frame: one rule. */
const DARK_FRAME_SELECTORS = Object.freeze([".frame[data-ce-mode='dark']", ":global(html[data-theme='dark']) .frame:not([data-ce-mode])"]);

/** A frame whose theme is in the other mode than the site's (the only place the site's own mode colours are set again). */
const OTHER_MODE_FRAMES = Object.freeze([
	":global(html:not([data-theme='dark'])) .frame[data-ce-mode='dark']",
	":global(html[data-theme='dark']) .frame[data-ce-mode='light']",
]);

/** VS Code's two themes: the default family's. */
const DEFAULT_THEMES = Object.freeze([resolveTheme(DEFAULT_FAMILY, 'light'), resolveTheme(DEFAULT_FAMILY, 'dark')]);

/* ---- the frame's attributes ---- */

test("frameAttributesOf: the theme's mode as data-ce-mode and its --ce-* colours as the frame's style", () => {
	for (const theme of Object.values(EDITOR_THEMES)) {
		const attributes = frameAttributesOf(theme);
		assert.deepEqual(Object.keys(attributes).sort(), ['data-ce-mode', 'style']);
		assert.equal(attributes['data-ce-mode'], theme.mode, theme.name);
		assert.equal(attributes.style, theme.frame, `${theme.name}: the registry's frame colours, as they are`);
	}
});

test("the default family: data-ce-mode is the site's mode, and every inline colour is the stylesheet's own (no visible change)", () => {
	for (const siteMode of ['light', 'dark']) {
		const theme = resolveTheme(DEFAULT_FAMILY, siteMode);
		const { 'data-ce-mode': mode, style } = frameAttributesOf(theme);
		assert.equal(mode, siteMode, `VS Code follows the site (${siteMode})`);
		const block = siteMode === 'dark' ? declarationsOf(STYLE_RULES, DARK_FRAME_SELECTORS) : declarationsOf(STYLE_RULES, ['.frame']);
		for (const [property, value] of Object.entries(style)) {
			if (value === null) {
				assert.equal(valueIn(block, property), null, `${theme.name}: ${property} stays unset, as before`);
			} else {
				assert.equal(value, valueIn(block, property), `${theme.name}: ${property} inline equals the stylesheet's`);
			}
		}
	}
});

test('themeByName: a registry theme by its Monaco name, null for anything else', () => {
	for (const name of [undefined, null, 42, '', 'toString', '__proto__', 'constructor', 'my-own-theme']) assert.equal(themeByName(name), null, String(name));
	assert.equal(themeByName('dwf-dracula'), EDITOR_THEMES['dwf-dracula']);
});

/* ---- a theme in the other mode than the site's ---- */

/** WCAG 2 contrast of two opaque #rrggbb colours. */
function contrast(first, second) {
	const luminance = (hex) => {
		const linear = [1, 3, 5].map((start) => {
			const value = parseInt(hex.slice(start, start + 2), 16) / 255;
			return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
	};
	const [a, b] = [luminance(first), luminance(second)].sort((x, y) => y - x);
	return (a + 0.05) / (b + 0.05);
}

/** The frame's backgrounds its own text and the output's text are drawn on. */
const TEXT_BACKGROUNDS = Object.freeze({ '--ce-text': ['--ce-editor-bg', '--ce-header-bg', '--ce-output-block-bg'], '--ce-output-block-fg': ['--ce-output-block-bg'] });

test("every theme a reader can reach in the other mode than the site's sets the frame's text and the output's text, 4.5:1 on its backgrounds", () => {
	// Unset, the frame would inherit the PAGE's text (dark on the light site) onto the theme's dark
	// header: 1.1:1 (found 2026-10-25 with a page-pinned vs-dark, which is no longer possible).
	let reached = 0;
	for (const family of THEME_FAMILIES) {
		for (const siteMode of ['light', 'dark']) {
			const theme = resolveTheme(family.id, siteMode);
			if (theme.mode === siteMode) continue;
			reached += 1;
			const { style } = frameAttributesOf(theme);
			for (const [text, backgrounds] of Object.entries(TEXT_BACKGROUNDS)) {
				assert.match(style[text] ?? '', /^#[0-9a-f]{6}$/i, `${theme.name} on the ${siteMode} site: ${text} is set`);
				for (const background of backgrounds) {
					const ratio = contrast(style[text], style[background]);
					assert.ok(ratio >= 4.5, `${theme.name} on the ${siteMode} site: ${text} on ${background} is ${ratio.toFixed(2)}:1`);
				}
			}
		}
	}
	assert.ok(reached >= 3, `the one-mode themes are reached in the other mode (${reached})`);
	for (const theme of DEFAULT_THEMES) {
		assert.equal(resolveTheme(DEFAULT_FAMILY, theme.mode), theme, `${theme.name} is reached only on the ${theme.mode} site`);
	}
});

test("the frame's color-scheme is its theme's mode (native scrollbars and controls inside a dark theme on the light site); the placeholder keeps the page's", () => {
	for (const mode of ['light', 'dark']) {
		const rule = STYLE_RULES.find((candidate) => candidate.selectors.length === 1 && candidate.selectors[0] === `.frame[data-ce-mode='${mode}']`);
		assert.ok(rule, `a rule for .frame[data-ce-mode='${mode}'] alone`);
		assert.equal(valueIn(rule.body, 'color-scheme'), mode);
	}
	const elsewhere = STYLE_RULES.filter((rule) => valueIn(rule.body, 'color-scheme') !== null && !rule.selectors.every((selector) => /^\.frame\[data-ce-mode='(light|dark)'\]$/.test(selector)));
	assert.deepEqual(elsewhere.map((rule) => rule.selectors.join(', ')), [], 'set nowhere else (not on the placeholder, which has no data-ce-mode)');
});

/* ---- a page cannot set the theme ---- */

/** Run `fn` with console.warn recorded; returns the messages. */
function warningsOf(fn) {
	const original = console.warn;
	const messages = [];
	console.warn = (message) => messages.push(message);
	try {
		fn();
	} finally {
		console.warn = original;
	}
	return messages;
}

test("a page's theme (the old editorSettings.theme, an options.theme) reaches neither <Editor> nor Monaco's options, with one warning", () => {
	assert.ok(!PASSTHROUGH_EDITOR_PROPS.includes('theme'), 'theme is no longer handed to <Editor>');
	for (const props of [
		{ editorSettings: { theme: 'vs-dark' } },
		{ editorSettings: { options: { theme: 'hc-black' } } },
		{ editorOptions: { theme: 'vs' } },
	]) {
		let settings;
		const warnings = warningsOf(() => {
			settings = normalizeEditorProps({ initialCode: 'print(1)', ...props });
		});
		assert.deepEqual(warnings, [PAGE_THEME_WARNING], `${JSON.stringify(props)}: one warning`);
		assert.equal(settings.editorProps.theme, undefined, `${JSON.stringify(props)}: not passed to <Editor>`);
		assert.equal('theme' in buildMonacoOptions(settings.editorOptions, settings), false, `${JSON.stringify(props)}: not in Monaco's options (updateOptions would set it page-wide)`);
	}
	assert.deepEqual(warningsOf(() => normalizeEditorProps({ initialCode: 'print(1)', editorSettings: { height: '300px' } })), [], 'no theme, no warning');
});

/* ---- the CSS switches on the editor's mode ---- */

test("the editor's CSS modules switch on the editor's mode (data-ce-mode), never on the site's — but the placeholder's dark frame", () => {
	const modules = readdirSync(FOLDER).filter((name) => name.endsWith('.module.css'));
	assert.ok(modules.length >= 8, 'every CSS module of the folder is read');
	const siteModeSelectors = [];
	for (const name of modules) {
		for (const rule of rulesOf(sourceOf(path.join(FOLDER, name)))) {
			for (const selector of rule.selectors) {
				if (selector.includes('data-theme') && !selector.includes('data-ce-mode')) siteModeSelectors.push(`${name}: ${selector}`);
			}
		}
	}
	assert.deepEqual(siteModeSelectors, [], 'a rule keyed on the site\'s mode alone would colour a Dracula editor like the light site');
	const darkFrame = declarationsOf(STYLE_RULES, DARK_FRAME_SELECTORS);
	assert.equal(valueIn(darkFrame, '--ce-editor-bg'), '#1e1e1e', "the dark frame rule holds vs-dark's colours");
	const guided = sourceOf(path.join(FOLDER, 'guided.module.css'));
	assert.match(guided, /:global\(\[data-ce-mode='dark'\] \.dwf-ce-kind-highlight\)/, "the marked lines' dark band");
	assert.match(guided, /:global\(\[data-ce-mode='dark'\] \.dwf-ce-flash\)/, "the flash's dark band");
	assert.match(sourceOf(path.join(FOLDER, 'ExercisePanel.module.css')), /:global\(\[data-ce-mode='light'\]\) \.diff \{/, "the diff's darker removed ink in a light theme");
});

/** The fallback of `--ce-line-<token>: var(--code-line-<token>, <fallback>);` in a rule body, or null. */
function fallbackIn(body, token) {
	return body.match(new RegExp(`--ce-line-${token}: var\\(--code-line-${token}, ([^;]+)\\);`))?.[1].trim() ?? null;
}

test("the code-line tokens: the light and dark frame rules read the site's with built-in fallbacks; a frame in the other mode declares the site's names as that mode's literals", () => {
	const light = declarationsOf(STYLE_RULES, ['.frame']);
	const dark = declarationsOf(STYLE_RULES, DARK_FRAME_SELECTORS);
	const [darkOnLightSite, lightOnDarkSite] = OTHER_MODE_FRAMES;
	const darkLiterals = declarationsOf(STYLE_RULES, [darkOnLightSite]);
	const lightLiterals = declarationsOf(STYLE_RULES, [lightOnDarkSite]);
	for (const token of CODE_LINE_TOKENS) {
		const lightFallback = fallbackIn(light, token);
		const darkFallback = fallbackIn(dark, token);
		assert.ok(lightFallback, `--ce-line-${token}: the light rule reads the site's token with a fallback`);
		assert.ok(darkFallback, `--ce-line-${token}: the dark rule reads the site's token with a fallback`);
		assert.notEqual(lightFallback, darkFallback, `--ce-line-${token}: light and dark differ`);
		assert.equal(valueIn(darkLiterals, `--code-line-${token}`), darkFallback, `a dark theme on the light site: --code-line-${token} is the dark fallback`);
		assert.equal(valueIn(lightLiterals, `--code-line-${token}`), lightFallback, `a light theme on the dark site: --code-line-${token} is the light fallback`);
	}
	assert.equal((light.match(/--ce-line-[\w-]+:/g) ?? []).length, CODE_LINE_TOKENS.length, 'the light rule defines exactly these');
	assert.equal((dark.match(/--ce-line-[\w-]+:/g) ?? []).length, CODE_LINE_TOKENS.length, 'the dark rule defines exactly these');
	assert.equal((darkLiterals.match(/--code-line-[\w-]+:/g) ?? []).length, CODE_LINE_TOKENS.length);
	assert.equal((lightLiterals.match(/--code-line-[\w-]+:/g) ?? []).length, CODE_LINE_TOKENS.length);
	for (const name of readdirSync(FOLDER).filter((file) => file.endsWith('.module.css') || /\.jsx?$/.test(file))) {
		const reads = [...sourceOf(path.join(FOLDER, name)).matchAll(/var\((--code-line-[\w-]+)/g)];
		assert.deepEqual(name === 'styles.module.css' ? [] : reads.map((match) => match[1]), [], `${name} reads only the editor's --ce-line-* names (the fallbacks live in styles.module.css)`);
	}
});

/** The site's mode-dependent variables the editor sets again for a theme in the other mode. */
const OTHER_MODE_VARIABLES = Object.freeze({ '--ifm-font-color-base': 'var(--ce-text)', '--ifm-color-emphasis-300': 'var(--ce-border)' });

test("Infima's mode colours inside the frame are set again only on a frame whose theme is in the other mode", () => {
	const variables = declarationsOf(STYLE_RULES, OTHER_MODE_FRAMES);
	for (const [property, value] of Object.entries(OTHER_MODE_VARIABLES)) {
		assert.equal(valueIn(variables, property), value, `${property}: the theme's colour`);
		const elsewhere = STYLE_RULES.filter((rule) => valueIn(rule.body, property) !== null && rule.body !== variables);
		assert.deepEqual(elsewhere.map((rule) => rule.selectors.join(', ')), [], `${property} is set nowhere else in styles.module.css`);
	}
	const inlineCode = STYLE_RULES.filter((rule) => rule.selectors.some((selector) => selector.endsWith('> code')));
	const coloured = inlineCode.filter((rule) => valueIn(rule.body, 'background-color') !== null);
	assert.equal(coloured.length, 1, "one rule restyles inline code's background");
	assert.deepEqual(
		coloured[0].selectors,
		OTHER_MODE_FRAMES.map((frame) => `${frame} :where(:not(pre)) > code`),
		'only inside a frame in the other mode',
	);
	assert.equal(valueIn(coloured[0].body, 'background-color'), 'var(--ce-handle-hover)');
	// The frame's only other inline-code rule (2026-10-28) puts the code on the text's baseline, in both modes.
	const baseline = inlineCode.filter((rule) => rule !== coloured[0]);
	assert.deepEqual(
		baseline.map((rule) => rule.selectors),
		[['.frame :where(:not(pre)) > code']],
		'the baseline rule, for the whole frame, and no other rule on inline code',
	);
	assert.equal(valueIn(baseline[0].body, 'vertical-align'), 'baseline');
	assert.deepEqual(baseline[0].body.trim().split(';').filter(Boolean), ['vertical-align: baseline'], 'it sets nothing else: no colour, nothing that differs by mode');
	for (const theme of DEFAULT_THEMES) {
		const siteMode = theme === DEFAULT_THEMES[0] ? 'light' : 'dark';
		assert.equal(theme.mode, siteMode, "VS Code's themes take the site's mode, so the other-mode rules never match them");
	}
});

test("the frame's text and the output block's text: the theme's when it gives one, else exactly today's", () => {
	assert.equal(valueIn(declarationsOf(STYLE_RULES, ['.frame']), 'color'), 'var(--ce-text)', 'unset (VS Code): the page\'s text, inherited as before');
	const output = declarationsOf(STYLE_RULES, ['.output .outputBlock', '.output .outputBlock button']);
	assert.equal(valueIn(output, 'color'), 'var(--ce-output-block-fg, var(--prism-color))', "unset (VS Code): the site's Prism colour, as Docusaurus's own rules");
	const lines = declarationsOf(STYLE_RULES, ['.output .outputBlock pre', '.output .outputBlock :global(.token-line)']);
	assert.equal(
		valueIn(lines, 'color'),
		'var(--ce-output-block-fg, var(--prism-color)) !important',
		"the <pre> and its lines carry Prism's colour inline: only !important reaches them, falling back to that same colour",
	);
	for (const theme of DEFAULT_THEMES) {
		assert.equal(theme.frame['--ce-text'], null, `${theme.name} leaves the frame's text to the page`);
		assert.equal(theme.frame['--ce-output-block-fg'], null, `${theme.name} leaves the output block to Prism`);
	}
	for (const theme of Object.values(EDITOR_THEMES).filter((candidate) => !DEFAULT_THEMES.includes(candidate))) {
		assert.ok(theme.frame['--ce-text'], `${theme.name}: a text colour (the other-mode rules read it)`);
		assert.ok(theme.frame['--ce-output-block-fg'], `${theme.name}: an output text colour`);
	}
});

test("the output block's BACKGROUND is the theme's on any site: forced with !important over the inline Prism variable, the container and the <pre> (2026-10-26)", () => {
	// A stock Docusaurus site paints the block from its Prism theme: theme-classic's Container
	// sets --prism-background-color inline and its <pre> redeclares --ifm-pre-background from
	// it, so a declaration on .output reaches nothing there — and the text, forced below, would
	// sit unreadable on the site's block (Dracula's light text on a light github block).
	const container = declarationsOf(STYLE_RULES, ['.output .outputBlock']);
	assert.equal(valueIn(container, '--prism-background-color'), 'var(--ce-output-block-bg) !important', 'the inline Prism variable is beaten');
	assert.equal(valueIn(container, 'background'), 'var(--ce-output-block-bg) !important', 'and the container painted from it');
	const pre = declarationsOf(STYLE_RULES, ['.output .outputBlock pre']);
	assert.equal(valueIn(pre, 'background-color'), 'var(--ce-output-block-bg) !important', "the <pre>'s inline background too");
	assert.equal(valueIn(declarationsOf(STYLE_RULES, ['.output']), '--ifm-pre-background'), 'var(--ce-output-block-bg)', "the exercise panel's plain <pre>s read it through Infima's own rule");
	assert.doesNotMatch(STYLESHEET, /_code-blocks\.scss reads it/, "no rule of the folder leans on a site's SCSS for the block");
});

test("a theme's own teaching-layer colours: every --ce-band-* / --ce-type-chip-bg a stylesheet reads is in LAYER_PROPERTIES, each read first with today's value as the fallback", () => {
	const modules = readdirSync(FOLDER).filter((name) => name.endsWith('.module.css'));
	const read = new Map();
	for (const name of modules) {
		for (const [, property, fallback] of sourceOf(path.join(FOLDER, name)).matchAll(/var\((--ce-(?:band-[\w-]+|type-chip-bg)),\s*([^;]+)\);/g)) {
			read.set(property, [...(read.get(property) ?? []), `${name}: ${fallback.trim()}`]);
		}
	}
	const layer = Object.values(LAYER_PROPERTIES);
	assert.deepEqual([...read.keys()].filter((property) => !layer.includes(property)), [], 'no stylesheet reads a property the registry cannot set');
	for (const property of layer) assert.ok(read.has(property), `${property} is read by a stylesheet (else the theme's colour goes nowhere)`);
	assert.equal(read.get('--ce-band-added').length, 2, 'the added band: the marked lines and the exercise diff');
	assert.equal(read.get('--ce-band-removed').length, 2, 'the removed band: the marked lines and the exercise diff');
	assert.equal(read.get('--ce-band-highlight').length, 2, 'highlight: its light and its dark band');
	assert.equal(read.get('--ce-type-chip-bg').length, 2, 'the type chip: light and dark');
});

/* ---- CodeEditorClient.jsx (read as source: it needs Monaco and a browser) ---- */

const CLIENT = sourceOf(path.join(FOLDER, 'CodeEditorClient.jsx'), { css: false });

test('CodeEditorClient registers the themes before <Editor> names one, in beforeMount', () => {
	const beforeMount = CLIENT.match(/const handleBeforeMount = useCallback\(\s*\(monaco\) => \{([\s\S]*?)\n\t\t\},/);
	assert.ok(beforeMount, 'handleBeforeMount is found');
	assert.match(beforeMount[1], /^\s*defineEditorThemes\(monaco\);/, 'first, before the page\'s own beforeMount');
});

test("no file of the folder imports the site's MuiTheme (the editor brings its own MUI scope: MuiScope.jsx)", () => {
	for (const name of readdirSync(FOLDER).filter((file) => /\.(js|jsx)$/.test(file))) {
		assert.doesNotMatch(sourceOf(path.join(FOLDER, name), { css: false }), /MuiTheme/, `${name} must not name MuiTheme`);
	}
});

test("CodeEditorClient: the frame carries the theme's attributes, MUI takes its mode, the header gets the reader's family", () => {
	assert.match(CLIENT, /<section className=\{styles\.frame\} \{\.\.\.frameAttributesOf\(theme\)\}/);
	assert.match(CLIENT, /<MuiScope mode=\{theme\.mode\}>/, "the editor's own MUI scope (MuiScope.jsx) takes the theme's mode");
	assert.match(CLIENT, /import MuiScope from '\.\/MuiScope\.jsx';/);
	assert.match(CLIENT, /const \{ family, setFamily, theme \} = useEditorTheme\(\);/);
	assert.match(CLIENT, /<CodeEditorWidget initialSettings=\{settings\} theme=\{theme\}/, "the frame's theme is the reader's");
	assert.match(CLIENT, /const monacoTheme = theme\.name;/, "Monaco's theme is the frame's: the reader's, never the page's");
	assert.doesNotMatch(CLIENT, /frameThemeFor|editorProps\.theme|theme: pageTheme/, 'no page theme anywhere');
	assert.match(CLIENT, /themeFamily=\{themeFamily\}\s+onThemeChange=\{onThemeChange\}/);
	assert.equal(CLIENT.match(/theme=\{monacoTheme\}/g)?.length, 2, 'Monaco and the solution diff show the same theme');
	assert.doesNotMatch(CLIENT, /useColorMode|themeNameFor/, "the site's mode reaches the editor only through useEditorTheme");
});

test('every family the menu offers resolves to a theme for both site modes (nothing the reader can pick is missing)', () => {
	for (const family of THEME_FAMILIES) {
		for (const siteMode of ['light', 'dark']) {
			const theme = resolveTheme(family.id, siteMode);
			assert.ok(theme && frameAttributesOf(theme)['data-ce-mode'], `${family.id} on the ${siteMode} site`);
		}
	}
});
