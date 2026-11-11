/**
 * editorThemes.test.js — the editor's theme registry (../editorThemes.js), checked against the
 * spec (THEME-SPEC.md, 2026-10-25), the installed Monaco and the site's own stylesheets:
 *   - the shape: the seven families of the spec's table, in its order (the default first; a
 *     family added later may sit anywhere among them), each naming concrete themes of the right
 *     mode; every concrete theme's fields; the Theme menu's `families` prop (ThemeMenu.jsx >
 *     PROPS); the README names every family (a new theme cannot leave the reader's
 *     documentation behind);
 *   - the default is today's editor: 'vscode' resolves to the names monacoSetup.js uses, and the
 *     vs / vs-dark frame colours equal styles.module.css's --ce-* values exactly (read from the
 *     stylesheet); the built-in themes' key colours are Monaco's own (read from the installed
 *     package through paths.js);
 *     SITE_INKS are the site's code-line inks; Dracula's colours are the site's code blocks'
 *     (every role Prism styles, and Prism's plain text where it leaves a kind unstyled);
 *   - every custom theme's Monaco definition: a valid defineTheme argument, every colour id one
 *     the installed Monaco registers (a typo is otherwise ignored without a word), every token the
 *     editor's languages emit covered by a rule (read from Monaco's tokenizers), every editor
 *     colour the spec lists set;
 *   - contrast (WCAG 2): every theme's text 4.5:1 on its background, comments and line numbers
 *     3:1, and the same on the current line and on every band of the teaching layer (the theme's
 *     own `layer` or the site's band of its mode, read from the stylesheets), the widgets' text
 *     4.5:1; in the frame, text, muted text and status colours 4.5:1, the resize grip 3:1, the
 *     exercise diff's inks and a type query's muted text 4.5:1 on their shades;
 *   - the Solution panel's colour key matches each theme's diff (diffKeyOf);
 *   - resolveTheme (two-variant families follow the site, one-variant ones do not; unknown input
 *     reads as the default) and defineEditorThemes (once per Monaco, copies, a fake monaco);
 *   - the registry is frozen.
 * Run with `npm run test:shared`.
 * To change it: a new family is a row in SPEC_TABLE here and an entry in ../editorThemes.js; a new rule
 * of the spec gets a test here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	ADDED_FRAME_PROPERTIES,
	DEFAULT_FAMILY,
	EDITOR_COLOR_IDS,
	EDITOR_THEMES,
	FRAME_PROPERTIES,
	SITE_INKS,
	SYNTAX_TOKENS,
	THEME_FAMILIES,
	LAYER_PROPERTIES,
	THEME_MENU_FAMILIES,
	buildMonacoTheme,
	defineEditorThemes,
	diffKeyOf,
	findFamily,
	resolveTheme,
} from '../editorThemes.js';
import { THEME_DARK, THEME_LIGHT, themeNameFor } from '../monacoSetup.js';
import { resolvePackage } from './paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, '..');
const MONACO_VS = path.join(resolvePackage('monaco-editor'), 'esm/vs');
const STYLESHEET = path.join(FOLDER, 'styles.module.css');
const GUIDED_CSS = path.join(FOLDER, 'guided.module.css');
const EXERCISE_CSS = path.join(FOLDER, 'ExercisePanel.module.css');
const TWOSLASH_CSS = path.join(FOLDER, 'twoslash.module.css');
const SOLUTION_CSS = path.join(FOLDER, 'SolutionPanel.module.css');
const README = path.join(FOLDER, 'README.md');
const requireFromSite = createRequire(import.meta.url);

/** prism-react-renderer (Docusaurus brings it), or null where it cannot be resolved: those tests then skip. */
function loadPrismThemes() {
	try {
		return requireFromSite('prism-react-renderer').themes;
	} catch {
		return null;
	}
}

const prismThemes = loadPrismThemes();
const skipWithoutPrism = prismThemes ? false : 'prism-react-renderer is not installed';

/** The spec's table (THEME-SPEC.md): id, menu label, light and dark Monaco theme names. */
const SPEC_TABLE = Object.freeze([
	{ id: 'vscode', label: 'VS Code', light: 'vs', dark: 'vs-dark' },
	{ id: 'high-contrast', label: 'High contrast', light: 'hc-light', dark: 'hc-black' },
	{ id: 'github', label: 'GitHub', light: 'dwf-github-light', dark: 'dwf-github-dark' },
	{ id: 'solarized', label: 'Solarized', light: 'dwf-solarized-light', dark: 'dwf-solarized-dark' },
	{ id: 'dracula', label: "Dracula (like the site's code blocks)", light: null, dark: 'dwf-dracula' },
	{ id: 'one-dark', label: 'One Dark', light: null, dark: 'dwf-one-dark' },
	{ id: 'monokai', label: 'Monokai', light: null, dark: 'dwf-monokai' },
]);

/** Monaco's built-in themes: no definition needed. */
const BUILT_IN_NAMES = Object.freeze(['vs', 'vs-dark', 'hc-light', 'hc-black']);

/** The name rule of monaco.editor.defineTheme (standaloneThemeService.js). */
const MONACO_THEME_NAME = /^[a-z0-9-]+$/i;

/** The key colours every concrete theme lists. */
const KEY_COLOR_NAMES = Object.freeze(['background', 'foreground', 'comment', 'lineNumber', 'keyword', 'string']);

/** WCAG 2's minimums: normal text, and large text / non-text marks (comments, line numbers, the grip). */
const TEXT_CONTRAST = 4.5;
const MARK_CONTRAST = 3;

/** The frame colours that are backgrounds: opaque #rrggbb in every theme. */
const FRAME_BACKGROUNDS = Object.freeze(['--ce-editor-bg', '--ce-header-bg', '--ce-control-bg', '--ce-output-block-bg', '--ce-handle-hover']);

/** The frame's contrast rules: a colour, the backgrounds it is drawn on, its minimum. */
const FRAME_CONTRAST_RULES = Object.freeze([
	{ color: '--ce-editor-fg', on: ['--ce-editor-bg'], min: TEXT_CONTRAST },
	{ color: '--ce-text', on: ['--ce-editor-bg', '--ce-header-bg'], min: TEXT_CONTRAST },
	{ color: '--ce-muted', on: ['--ce-editor-bg', '--ce-header-bg', '--ce-output-block-bg'], min: TEXT_CONTRAST },
	{ color: '--ce-output-block-fg', on: ['--ce-output-block-bg'], min: TEXT_CONTRAST },
	{ color: '--ce-success', on: ['--ce-editor-bg'], min: TEXT_CONTRAST },
	{ color: '--ce-failure', on: ['--ce-editor-bg'], min: TEXT_CONTRAST },
	{ color: '--ce-grip', on: ['--ce-header-bg'], min: MARK_CONTRAST },
]);

/** The editor colours the spec lists, which every custom theme must set. */
const SPEC_COLOR_IDS = Object.freeze([
	'editor.background',
	'editor.foreground',
	'editor.lineHighlightBackground',
	'editor.selectionBackground',
	'editorLineNumber.foreground',
	'editorLineNumber.activeForeground',
	'editorCursor.foreground',
	'editorIndentGuide.background1',
	'editorIndentGuide.activeBackground1',
	'editorWhitespace.foreground',
	'editorBracketMatch.background',
	'editorBracketMatch.border',
	'editorWidget.background',
	'editorHoverWidget.background',
	'editorSuggestWidget.background',
	'diffEditor.insertedTextBackground',
	'diffEditor.insertedLineBackground',
	'diffEditor.removedTextBackground',
	'diffEditor.removedLineBackground',
]);

/** The tokens the spec lists, which every custom theme must cover. */
const SPEC_TOKENS = Object.freeze([
	'keyword', 'string', 'number', 'comment', 'type', 'type.identifier', 'identifier', 'delimiter', 'operator',
	'regexp', 'predefined', 'constant', 'tag', 'attribute.name', 'attribute.value',
]);

/** The tokenizers of the editor's languages (JavaScript has its own file on top of TypeScript's; C uses cpp's). */
const TOKENIZER_FILES = Object.freeze([
	'basic-languages/python/python.js',
	'basic-languages/typescript/typescript.js',
	'basic-languages/javascript/javascript.js',
	'basic-languages/cpp/cpp.js',
	'basic-languages/go/go.js',
	'basic-languages/shell/shell.js',
]);

/** Tokens that need no colour (whitespace). */
const UNCOLOURED_TOKENS = Object.freeze(['white']);

/** A few tokens the parser must find (a guard on the parser itself). */
const KNOWN_EMITTED_TOKENS = Object.freeze([
	'comment', 'comment.doc', 'keyword', 'keyword.directive', 'string', 'string.escape', 'number', 'number.hex',
	'regexp', 'type.identifier', 'identifier', 'delimiter', 'delimiter.bracket', 'tag', 'annotation', 'metatag',
	'attribute.name', 'variable', 'variable.predefined', 'constants', 'invalid',
]);

const ALL_THEMES = Object.values(EDITOR_THEMES);
const CUSTOM = ALL_THEMES.filter((theme) => theme.monaco !== null);
const DEFAULT_THEME_NAMES = Object.freeze([THEME_LIGHT, THEME_DARK]);

/* ---- colour arithmetic (WCAG 2 relative luminance and contrast ratio) ---- */

const OPAQUE_HEX = /^#[0-9a-f]{6}$/i;
const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/** { r, g, b, a } of #rrggbb or #rrggbbaa (channels 0 to 255, alpha 0 to 1). */
function rgba(color) {
	const byte = (start) => parseInt(color.slice(start, start + 2), 16);
	return { r: byte(1), g: byte(3), b: byte(5), a: color.length === 9 ? byte(7) / 255 : 1 };
}

/** `color` drawn over the opaque `background`: its visible { r, g, b }. */
function over(color, background) {
	const front = rgba(color);
	const back = rgba(background);
	const blend = (top, bottom) => top * front.a + bottom * (1 - front.a);
	return { r: blend(front.r, back.r), g: blend(front.g, back.g), b: blend(front.b, back.b) };
}

/** WCAG's relative luminance of { r, g, b }. */
function luminance({ r, g, b }) {
	const linear = (channel) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** The contrast ratio of `color` (alpha blended) on the opaque `background`. */
function contrast(color, background) {
	const front = luminance(over(color, background));
	const back = luminance(rgba(background));
	return (Math.max(front, back) + 0.05) / (Math.min(front, back) + 0.05);
}

/** Fail with a readable message when `color` on `background` is under `min`. */
function assertContrast(color, background, min, what) {
	const ratio = contrast(color, background);
	assert.ok(ratio >= min, `${what}: ${color} on ${background} is ${ratio.toFixed(2)}:1, under ${min}:1`);
}

/* ---- reading the installed Monaco ---- */

/** Every .js file under `folder`. */
function jsFilesUnder(folder) {
	return readdirSync(folder, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
		.map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

/** Every colour id the installed Monaco registers (registerColor('<id>', …)). */
function registeredColorIds() {
	const ids = new Set();
	for (const file of jsFilesUnder(MONACO_VS)) {
		for (const [, id] of readFileSync(file, 'utf8').matchAll(/registerColor\('([A-Za-z0-9.]+)'/g)) ids.add(id);
	}
	return ids;
}

/** Add `token` to `tokens` unless it is a state ('@…') or empty; `$0`-style parts become one sample word. */
function addToken(tokens, token) {
	if (!token || token.startsWith('@')) return;
	tokens.add(token.replace(/\$\w+/g, 'sample'));
}

/**
 * The tokens a Monarch tokenizer file can emit, read from its source: `token: "…"`, the
 * `defaultToken`, the `cases` values ("@keywords": "keyword"), a rule's token after its regex
 * (/…/, "string") and a group's tokens (/…/, ["string", "string.escape", …]).
 */
function emittedTokens(source) {
	const tokens = new Set();
	const patterns = [/token:\s*"([^"]*)"/g, /defaultToken:\s*"([^"]*)"/g, /"@\w+":\s*"([^"]*)"/g, /\/[dgimsuy]*,\s*"([^"]*)"/g];
	for (const pattern of patterns) {
		for (const [, token] of source.matchAll(pattern)) addToken(tokens, token);
	}
	for (const [, group] of source.matchAll(/\/[dgimsuy]*,\s*\[([^\]]*)\]/g)) {
		for (const [, token] of group.matchAll(/"([^"]*)"/g)) addToken(tokens, token);
	}
	return tokens;
}

/** The tokens of every tokenizer of the editor's languages, by file. */
function tokensByFile() {
	return Object.fromEntries(TOKENIZER_FILES.map((file) => [file, emittedTokens(readFileSync(path.join(MONACO_VS, file), 'utf8'))]));
}

/** Does a rule (other than the default '') colour `token`? Monaco matches rules by leading dot-separated parts. */
function isCovered(token, rules) {
	return rules.some((rule) => rule.token !== '' && (token === rule.token || token.startsWith(`${rule.token}.`)));
}

/** A built-in theme's block of Monaco's themes.js ('vs' → the text between "Begin vs theme" and "End vs theme"). */
function monacoThemeBlock(source, name) {
	const block = source.match(new RegExp(`Begin ${name} theme[\\s\\S]*?End ${name} theme`));
	assert.ok(block, `Monaco's themes.js has a block for ${name}`);
	return block[0];
}

/** A token rule's foreground in a themes.js block, as #rrggbb (lower case). */
function monacoRuleColor(block, token) {
	const escaped = token.replace('.', '\\.');
	const match = block.match(new RegExp(`\\{ token: '${escaped}', foreground: '([0-9A-Fa-f]{6})'`));
	assert.ok(match, `a '${token}' rule`);
	return `#${match[1].toLowerCase()}`;
}

/** The colour registry's default of `id` per theme type ({ dark, light, hcDark, hcLight }), Color.white / Color.black read as hex. */
function monacoColorDefaults(id) {
	const source = readFileSync(path.join(MONACO_VS, 'editor/common/core/editorColorRegistry.js'), 'utf8');
	const match = source.match(new RegExp(`registerColor\\('${id.replace(/\./g, '\\.')}', \\{([^}]*)\\}`));
	assert.ok(match, `Monaco registers ${id}`);
	const named = { 'Color.white': '#ffffff', 'Color.black': '#000000' };
	const values = {};
	for (const [, key, value] of match[1].matchAll(/(\w+):\s*([^,]+)/g)) {
		const text = value.trim().replace(/'/g, '');
		values[key] = (named[text] ?? text).toLowerCase();
	}
	return values;
}

/* ---- reading the site's stylesheets ---- */

/** The innermost { … } blocks of a stylesheet without comments: [{ selector, declarations: { name: value } }]. */
function cssBlocks(source) {
	const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
	return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
		selector: selector.trim(),
		declarations: Object.fromEntries(
			body
				.split(';')
				.map((part) => part.trim())
				.filter((part) => part.includes(':'))
				.map((part) => [part.slice(0, part.indexOf(':')).trim(), part.slice(part.indexOf(':') + 1).trim()]),
		),
	}));
}

/**
 * The editor's built-in value of a code-line token for a mode: the fallback of
 * `--ce-line-<token>: var(--code-line-<token>, <value>)` on the light or dark frame rule
 * (styles.module.css > THE CODE-LINE TOKENS; equal to shared/css/_code-blocks.scss's).
 */
function codeLineFallback(mode, token) {
	const value = frameColorBlocks()[mode][`--ce-line-${token}`];
	const fallback = value?.match(new RegExp(`^var\\(--code-line-${token}, (.+)\\)$`))?.[1];
	assert.ok(fallback, `styles.module.css's ${mode} frame rule reads --code-line-${token} with a fallback`);
	return fallback.trim();
}

/** The frame's light and dark colour blocks of styles.module.css (the dark one: any selector of .frame that says dark). */
function frameColorBlocks() {
	const blocks = cssBlocks(readFileSync(STYLESHEET, 'utf8')).filter((block) => '--ce-editor-bg' in block.declarations);
	const light = blocks.find((block) => block.selector === '.frame');
	const dark = blocks.find((block) => block.selector.includes('.frame') && block.selector.includes('dark'));
	assert.ok(light && dark, 'styles.module.css has the light .frame colours and a dark rule');
	return { light: light.declarations, dark: dark.declarations };
}

/* ---- the shape ---- */

test("the spec's seven families are all there, in the spec's order, the default first (a later family may sit anywhere)", () => {
	assert.equal(DEFAULT_FAMILY, 'vscode');
	assert.equal(THEME_FAMILIES[0].id, DEFAULT_FAMILY);
	const specIds = SPEC_TABLE.map((row) => row.id);
	const fromSpec = THEME_FAMILIES.filter((family) => specIds.includes(family.id));
	assert.deepEqual(
		fromSpec.map(({ id, label, light, dark }) => ({ id, label, light, dark })),
		SPEC_TABLE.map((row) => ({ ...row })),
		"each of the spec's families, as the spec names it, in the spec's order",
	);
	const ids = THEME_FAMILIES.map((family) => family.id);
	assert.equal(new Set(ids).size, ids.length, 'no family twice');
	for (const family of THEME_FAMILIES) {
		assert.deepEqual(Object.keys(family).sort(), ['dark', 'id', 'label', 'light', 'note']);
		assert.equal(family.note, null, `${family.id}: the menu writes its own note (ThemeMenu.jsx > noteFor)`);
		assert.equal(findFamily(family.id), family);
	}
	assert.equal(findFamily('nope'), null);
	assert.equal(findFamily(undefined), null);
});

test('every family names concrete themes of the right mode; the built-in ones are exactly Monaco\'s four', () => {
	for (const family of THEME_FAMILIES) {
		assert.ok(family.light || family.dark, `${family.id} has a variant`);
		if (family.light) assert.equal(EDITOR_THEMES[family.light]?.mode, 'light', `${family.id} light`);
		if (family.dark) assert.equal(EDITOR_THEMES[family.dark]?.mode, 'dark', `${family.id} dark`);
	}
	const named = THEME_FAMILIES.flatMap((family) => [family.light, family.dark]).filter(Boolean);
	assert.deepEqual([...named].sort(), Object.keys(EDITOR_THEMES).sort(), 'every concrete theme belongs to exactly one family');
	assert.deepEqual(
		ALL_THEMES.filter((theme) => theme.monaco === null).map((theme) => theme.name),
		BUILT_IN_NAMES,
	);
});

test('every concrete theme has the full shape: name, mode, key colours, Monaco definition or null, every frame colour', () => {
	for (const [name, theme] of Object.entries(EDITOR_THEMES)) {
		assert.deepEqual(Object.keys(theme).sort(), ['frame', 'keyColors', 'mode', 'monaco', 'name']);
		assert.equal(theme.name, name);
		assert.ok(['light', 'dark'].includes(theme.mode), `${name}: mode`);
		assert.deepEqual(Object.keys(theme.keyColors).sort(), [...KEY_COLOR_NAMES].sort(), `${name}: key colours`);
		for (const key of KEY_COLOR_NAMES) assert.match(theme.keyColors[key], OPAQUE_HEX, `${name}: keyColors.${key}`);
		assert.deepEqual(Object.keys(theme.frame).sort(), [...FRAME_PROPERTIES].sort(), `${name}: frame colours`);
		assert.equal(theme.frame['--ce-editor-bg'], theme.keyColors.background, `${name}: the loading box is the editor's background (no flash)`);
		assert.equal(theme.frame['--ce-editor-fg'], theme.keyColors.foreground, `${name}: the waiting placeholder's text is the editor's`);
		for (const property of FRAME_BACKGROUNDS) assert.match(theme.frame[property], OPAQUE_HEX, `${name}: ${property} is an opaque colour`);
	}
});

/** The frame's optional teaching-layer colours (a theme's `layer`): null unless the theme gives one. */
const LAYER_FRAME_PROPERTIES = Object.freeze(Object.values(LAYER_PROPERTIES));

test('only the default themes leave frame colours to the site (var() or unset); every other theme gives a colour', () => {
	for (const theme of ALL_THEMES) {
		for (const [property, value] of Object.entries(theme.frame)) {
			if (LAYER_FRAME_PROPERTIES.includes(property)) {
				if (value !== null) assert.match(value, HEX, `${theme.name}: ${property} is a colour the contrast test can check`);
			} else if (DEFAULT_THEME_NAMES.includes(theme.name)) {
				assert.ok(value === null || typeof value === 'string', `${theme.name}: ${property}`);
				if (value === null) assert.ok(ADDED_FRAME_PROPERTIES.includes(property), `${theme.name}: only the new ${property} may be unset`);
			} else {
				assert.match(value, HEX, `${theme.name}: ${property} is a colour the contrast test can check`);
			}
		}
	}
});

test("the Theme menu's families: one entry per family, a swatch per variant (light first) in its key colours", () => {
	assert.deepEqual(
		THEME_MENU_FAMILIES.map(({ id, label, note }) => ({ id, label, note })),
		THEME_FAMILIES.map(({ id, label, note }) => ({ id, label, note })),
	);
	THEME_MENU_FAMILIES.forEach((entry, index) => {
		const family = THEME_FAMILIES[index];
		const names = [family.light, family.dark].filter(Boolean);
		assert.deepEqual(
			entry.swatches,
			names.map((name) => {
				const { mode, keyColors } = EDITOR_THEMES[name];
				return { mode, background: keyColors.background, foreground: keyColors.foreground, accent: keyColors.keyword };
			}),
		);
	});
});

/* ---- the default is today's editor ---- */

test("the default family is today's editor: Monaco's vs / vs-dark, the names monacoSetup.js uses, following the site", () => {
	assert.equal(resolveTheme(DEFAULT_FAMILY, 'light').name, THEME_LIGHT);
	assert.equal(resolveTheme(DEFAULT_FAMILY, 'dark').name, THEME_DARK);
	for (const mode of ['light', 'dark', undefined]) assert.equal(resolveTheme(DEFAULT_FAMILY, mode).name, themeNameFor(mode));
	assert.equal(EDITOR_THEMES[THEME_LIGHT].monaco, null, 'no definition: Monaco\'s own theme, unchanged');
	assert.equal(EDITOR_THEMES[THEME_DARK].monaco, null);
});

test("the teaching layer's colours: Monaco's built-in themes give none (the site's bands, as before); a theme's own are translucent", () => {
	assert.deepEqual(Object.keys(LAYER_PROPERTIES).sort(), ['added', 'error', 'highlight', 'removed', 'success', 'typeChip', 'warning']);
	for (const property of LAYER_FRAME_PROPERTIES) assert.ok(FRAME_PROPERTIES.includes(property), `${property} is a frame property`);
	for (const name of BUILT_IN_NAMES) {
		for (const property of LAYER_FRAME_PROPERTIES) assert.equal(EDITOR_THEMES[name].frame[property], null, `${name}: ${property} stays the site's`);
	}
	let given = 0;
	for (const theme of CUSTOM) {
		for (const property of LAYER_FRAME_PROPERTIES) {
			const value = theme.frame[property];
			if (value === null) continue;
			given += 1;
			assert.match(value, /^#[0-9a-f]{8}$/i, `${theme.name}: ${property} is #rrggbbaa`);
			assert.ok(rgba(value).a < 1, `${theme.name}: ${property} is translucent (Monaco draws the selection under a band)`);
		}
	}
	assert.ok(given > 0, 'some theme gives its own');
	const stylesheet = readFileSync(STYLESHEET, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	for (const property of LAYER_FRAME_PROPERTIES) assert.doesNotMatch(stylesheet, new RegExp(`${property}:`), `styles.module.css never sets ${property}: unset, the bands fall back`);
});

test("vs / vs-dark frame colours are exactly today's --ce-* values in styles.module.css", () => {
	const { light, dark } = frameColorBlocks();
	const todays = FRAME_PROPERTIES.filter((property) => !ADDED_FRAME_PROPERTIES.includes(property) && !LAYER_FRAME_PROPERTIES.includes(property));
	const darkProperties = Object.keys(dark).filter((property) => property.startsWith('--ce-') && !property.startsWith('--ce-line-')); // --ce-line-*: the code-line tokens, not a theme's (styles.module.css > THE CODE-LINE TOKENS)
	assert.deepEqual([...darkProperties].sort(), [...todays].sort(), "the stylesheet's colour properties are the registry's (a new one belongs in FRAME_PROPERTIES)");
	for (const property of todays) {
		assert.equal(EDITOR_THEMES.vs.frame[property], light[property], `vs ${property}`);
		assert.equal(EDITOR_THEMES['vs-dark'].frame[property], dark[property], `vs-dark ${property}`);
	}
	for (const property of ADDED_FRAME_PROPERTIES) {
		assert.equal(EDITOR_THEMES.vs.frame[property], null, `vs leaves the new ${property} unset (nothing changes)`);
		assert.equal(EDITOR_THEMES['vs-dark'].frame[property], null, `vs-dark leaves the new ${property} unset`);
	}
});

test("the built-in themes' key colours are the installed Monaco's own", () => {
	const source = readFileSync(path.join(MONACO_VS, 'editor/standalone/common/themes.js'), 'utf8');
	const lineNumbers = monacoColorDefaults('editorLineNumber.foreground');
	const colorType = { vs: 'light', 'vs-dark': 'dark', 'hc-light': 'hcLight', 'hc-black': 'hcDark' };
	for (const name of BUILT_IN_NAMES) {
		const block = monacoThemeBlock(source, name);
		const defaults = block.match(/\{ token: '', foreground: '([0-9A-Fa-f]{6})', background: '([0-9A-Fa-f]{6})' \}/);
		assert.ok(defaults, `${name}: a default rule`);
		assert.deepEqual(EDITOR_THEMES[name].keyColors, {
			background: `#${defaults[2].toLowerCase()}`,
			foreground: `#${defaults[1].toLowerCase()}`,
			comment: monacoRuleColor(block, 'comment'),
			lineNumber: lineNumbers[colorType[name]],
			keyword: monacoRuleColor(block, 'keyword'),
			string: monacoRuleColor(block, 'string'),
		}, name);
	}
});

test("SITE_INKS are the editor's built-in code-line inks (styles.module.css's fallbacks), light and dark", () => {
	assert.equal(SITE_INKS.light.success, codeLineFallback('light', 'success-ink'));
	assert.equal(SITE_INKS.light.failure, codeLineFallback('light', 'error-ink'));
	assert.equal(SITE_INKS.dark.success, codeLineFallback('dark', 'success-ink'));
	assert.equal(SITE_INKS.dark.failure, codeLineFallback('dark', 'error-ink'));
});

test("Dracula is like the site's code blocks: prism-react-renderer's dracula", { skip: skipWithoutPrism }, () => {
	const prism = prismThemes.dracula;
	const toHex = (rgbText) => `#${rgbText.match(/\d+/g).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
	const styleOf = (type) => prism.styles.find((entry) => entry.types.includes(type)).style;
	const theme = EDITOR_THEMES['dwf-dracula'];
	const rule = (token) => theme.monaco.rules.find((entry) => entry.token === token);
	assert.equal(theme.keyColors.background, prism.plain.backgroundColor.toLowerCase());
	assert.equal(theme.keyColors.foreground, prism.plain.color.toLowerCase());
	assert.equal(theme.keyColors.comment, toHex(styleOf('comment').color));
	assert.equal(theme.keyColors.keyword, toHex(styleOf('keyword').color));
	// shared/css/_code-blocks.scss draws Dracula's italic keywords upright, and so does the editor
	assert.equal(styleOf('keyword').fontStyle, 'italic', "Prism's Dracula has italic keywords");
	assert.equal(rule('keyword').fontStyle, '', 'upright in the editor too');
	assert.equal(rule('variable').fontStyle, styleOf('variable').fontStyle, "variables italic, as Prism's (the site leaves them)");
	assert.equal(theme.keyColors.string, toHex(styleOf('string').color));
});

/** Each Dracula role with a Prism counterpart: the Monarch token the role colours first, the Prism token type. */
const DRACULA_PRISM_ROLES = Object.freeze({
	keyword: 'keyword',
	variable: 'variable',
	constant: 'constant',
	'variable.predefined': 'builtin',
	string: 'string',
	tag: 'tag',
	'attribute.name': 'attr-name',
	comment: 'comment',
	delimiter: 'punctuation',
});

/** The kinds Prism's Dracula leaves unstyled (drawn in its plain text colour): the Monarch token, the Prism type. */
const DRACULA_PRISM_PLAIN = Object.freeze({ number: 'number', 'type.identifier': 'class-name', regexp: 'regex', identifier: 'plain' });

test("Dracula colours every kind of token as the site's code blocks do: Prism's colour, or its plain text where Prism has none", { skip: skipWithoutPrism }, () => {
	const themes = prismThemes;
	const prism = themes.dracula;
	const toHex = (rgbText) => `#${rgbText.match(/\d+/g).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
	const prismColorOf = (type) => prism.styles.find((entry) => entry.types.includes(type))?.style.color;
	const rules = EDITOR_THEMES['dwf-dracula'].monaco.rules;
	// Monaco's rule for a token: the longest rule name it starts with (keyword.directive over keyword), else the default ''
	const colorOf = (token) => {
		const matching = rules.filter((entry) => entry.token !== '' && (token === entry.token || token.startsWith(`${entry.token}.`)));
		const rule = matching.sort((a, b) => b.token.length - a.token.length)[0] ?? rules[0];
		return `#${rule.foreground}`;
	};
	for (const [token, type] of Object.entries(DRACULA_PRISM_ROLES)) {
		assert.ok(prismColorOf(type), `Prism styles ${type}`);
		assert.equal(colorOf(token), toHex(prismColorOf(type)), `${token}: Prism's ${type}`);
	}
	const plain = prism.plain.color.toLowerCase();
	for (const [token, type] of Object.entries(DRACULA_PRISM_PLAIN)) {
		if (type !== 'plain') assert.equal(prismColorOf(type), undefined, `Prism leaves ${type} unstyled`);
		assert.equal(colorOf(token), plain, `${token}: plain text, as Prism draws a ${type}`);
	}
	assert.equal(colorOf('keyword.directive'), toHex(prismColorOf('keyword')), "a C #include: Prism reads its directive as a keyword (alias 'keyword')");
});

/* ---- the custom themes' Monaco definitions ---- */

test("every custom theme's Monaco definition is a valid defineTheme argument", () => {
	for (const theme of CUSTOM) {
		const { name, mode, monaco } = theme;
		assert.match(name, MONACO_THEME_NAME, `${name}: Monaco's name rule`);
		assert.ok(name.startsWith('dwf-') && !BUILT_IN_NAMES.includes(name), `${name}: its own name, never a built-in one`);
		assert.deepEqual(Object.keys(monaco).sort(), ['base', 'colors', 'inherit', 'rules']);
		assert.equal(monaco.base, mode === 'dark' ? 'vs-dark' : 'vs', `${name}: base`);
		assert.equal(monaco.inherit, false, `${name}: nothing left over from VS Code's theme`);
		for (const rule of monaco.rules) {
			assert.equal(typeof rule.token, 'string', `${name}: a rule's token`);
			if ('foreground' in rule) assert.match(rule.foreground, /^[0-9a-f]{6}$/i, `${name}: ${rule.token}'s foreground (six digits, no #)`);
			if ('fontStyle' in rule) assert.ok(['', 'italic', 'bold'].includes(rule.fontStyle), `${name}: ${rule.token}'s font style`);
		}
		for (const [id, value] of Object.entries(monaco.colors)) assert.match(value, HEX, `${name}: ${id}`);
		const defaults = monaco.rules.find((rule) => rule.token === '');
		assert.equal(`#${defaults.foreground}`, monaco.colors['editor.foreground'], `${name}: the default rule is the editor's text`);
		assert.equal(`#${defaults.background}`, monaco.colors['editor.background'], `${name}: the default rule is the editor's background`);
		assert.equal(monaco.colors['editor.background'], theme.keyColors.background, `${name}: key background`);
		assert.equal(monaco.colors['editor.foreground'], theme.keyColors.foreground, `${name}: key text`);
		assert.equal(monaco.colors['editorLineNumber.foreground'], theme.keyColors.lineNumber, `${name}: key line numbers`);
		assert.equal(`#${monaco.rules.find((rule) => rule.token === 'comment').foreground}`, theme.keyColors.comment, `${name}: key comment`);
	}
});

test('every Monaco colour id a custom theme sets is one the installed Monaco registers', () => {
	const registered = registeredColorIds();
	assert.ok(registered.size > 100, `found Monaco's colour registry (${registered.size} ids)`);
	for (const ids of Object.values(EDITOR_COLOR_IDS)) {
		for (const id of ids) assert.ok(registered.has(id), `EDITOR_COLOR_IDS: ${id} is not a Monaco colour`);
	}
	for (const theme of CUSTOM) {
		const unknown = Object.keys(theme.monaco.colors).filter((id) => !registered.has(id));
		assert.deepEqual(unknown, [], `${theme.name}: colour ids Monaco does not know`);
	}
});

test('every custom theme sets the editor colours the spec lists', () => {
	for (const theme of CUSTOM) {
		const missing = SPEC_COLOR_IDS.filter((id) => !(id in theme.monaco.colors));
		assert.deepEqual(missing, [], `${theme.name}: missing editor colours`);
	}
});

test("every custom theme colours every token the editor's languages emit (python, javascript, typescript, c, cpp, go, shell)", () => {
	const byFile = tokensByFile();
	for (const [file, tokens] of Object.entries(byFile)) assert.ok(tokens.size > 0, `${file}: tokens found`);
	const emitted = new Set(Object.values(byFile).flatMap((tokens) => [...tokens]));
	for (const token of KNOWN_EMITTED_TOKENS) assert.ok(emitted.has(token), `the parser finds '${token}'`);
	const toColour = [...emitted, ...SPEC_TOKENS].filter((token) => !UNCOLOURED_TOKENS.includes(token));
	for (const theme of CUSTOM) {
		const uncovered = toColour.filter((token) => !isCovered(token, theme.monaco.rules));
		assert.deepEqual(uncovered, [], `${theme.name}: tokens no rule colours (add them to SYNTAX_TOKENS)`);
	}
});

test('every syntax role colours its tokens, in italics only where the theme says so', () => {
	const roles = Object.keys(SYNTAX_TOKENS);
	assert.ok(roles.length > 0);
	const dracula = EDITOR_THEMES['dwf-dracula'].monaco.rules;
	const fontStyleOf = (token) => dracula.find((rule) => rule.token === token).fontStyle;
	assert.equal(fontStyleOf('variable'), 'italic', "Dracula's variables are italic, as in the site's code blocks");
	assert.equal(fontStyleOf('variable.predefined'), '', 'a role not in `italic` says so explicitly (no italic inherited from variable)');
	assert.equal(fontStyleOf('keyword'), '', "its keywords upright, as the shared code blocks draw them");
	assert.equal(fontStyleOf('string'), '');
	for (const theme of CUSTOM) {
		for (const tokens of Object.values(SYNTAX_TOKENS)) {
			for (const token of tokens) assert.ok(theme.monaco.rules.some((rule) => rule.token === token), `${theme.name}: a rule for ${token}`);
		}
	}
});

test('buildMonacoTheme turns a definition into the same object EDITOR_THEMES holds (a pure function)', () => {
	const definition = {
		name: 'dwf-test',
		mode: 'light',
		italic: ['comment'],
		syntax: Object.fromEntries(Object.keys(SYNTAX_TOKENS).map((role) => [role, '#123456'])),
		editor: {
			...Object.fromEntries(Object.keys(EDITOR_COLOR_IDS).map((key) => [key, '#abcdef'])),
			background: '#ffffff',
			foreground: '#000000',
			brackets: ['#111111', '#222222', '#333333'],
			inserted: '#00ff00',
			removed: '#ff0000',
		},
	};
	const built = buildMonacoTheme(definition);
	assert.equal(built.base, 'vs');
	assert.equal(built.inherit, false);
	assert.deepEqual(built.rules[0], { token: '', foreground: '000000', background: 'ffffff' });
	assert.equal(built.rules.find((rule) => rule.token === 'comment').fontStyle, 'italic');
	assert.equal(built.colors['editorBracketHighlight.foreground2'], '#222222');
	assert.equal(built.colors['diffEditor.insertedTextBackground'], '#00ff0040');
	assert.equal(built.colors['diffEditor.removedLineBackground'], '#ff00001f');
	assert.equal(built.colors['editor.lineHighlightBorder'], '#00000000', 'the current line has a background, no border');
	assert.deepEqual(buildMonacoTheme(definition), built, 'the same definition, the same result');
	const outlined = buildMonacoTheme({ ...definition, editor: { ...definition.editor, lineHighlight: '#00000000', lineHighlightBorder: '#445566' } });
	assert.equal(outlined.colors['editor.lineHighlightBorder'], '#445566', 'a theme may outline its current line instead');
	assert.equal(EDITOR_THEMES['dwf-dracula'].monaco.colors['editor.lineHighlightBorder'], '#44475a', "Dracula's current line: an outline in its currentLine colour, as its own VS Code theme");
	assert.equal(EDITOR_THEMES['dwf-dracula'].monaco.colors['editor.lineHighlightBackground'], '#00000000', 'and no fill');
});

/* ---- contrast ---- */

test('every theme: text 4.5:1, comments and line numbers 3:1 on the editor background', () => {
	for (const { name, keyColors } of ALL_THEMES) {
		assertContrast(keyColors.foreground, keyColors.background, TEXT_CONTRAST, `${name} text`);
		assertContrast(keyColors.comment, keyColors.background, MARK_CONTRAST, `${name} comments`);
		assertContrast(keyColors.lineNumber, keyColors.background, MARK_CONTRAST, `${name} line numbers`);
	}
	for (const { name, monaco } of CUSTOM) {
		assertContrast(monaco.colors['editorLineNumber.activeForeground'], monaco.colors['editor.background'], MARK_CONTRAST, `${name} the current line's number`);
	}
});

test("every theme's frame: text, muted text and status colours 4.5:1, the resize grip 3:1 (where the theme gives a colour)", () => {
	let checked = 0;
	for (const { name, frame } of ALL_THEMES) {
		for (const rule of FRAME_CONTRAST_RULES) {
			const color = frame[rule.color];
			if (typeof color !== 'string' || !HEX.test(color)) continue; // the default themes' var() / unset values: the site's own colours
			for (const background of rule.on) {
				assertContrast(color, frame[background], rule.min, `${name} ${rule.color} on ${background}`);
				checked += 1;
			}
		}
	}
	assert.ok(checked > CUSTOM.length * FRAME_CONTRAST_RULES.length, `the rules ran (${checked} checks)`);
});

/* ---- contrast where the code is read on a shade of its own ---- */

/** rgb(…) / rgba(…) / #rrggbb(aa) as #rrggbbaa (alpha 1 when not given). */
function cssColorToHex(value) {
	if (HEX.test(value)) return value.length === 7 ? `${value}ff` : value;
	const parts = value.match(/rgba?\(([^)]*)\)/)?.[1].split(',').map((part) => Number(part.trim()));
	assert.ok(parts && parts.length >= 3, `a colour the test can read: ${value}`);
	const [r, g, b, a = 1] = parts;
	return `#${[r, g, b, Math.round(a * 255)].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** The value a stylesheet gives `property` in its fallback form `var(--ce-…, <value>)` — the n-th one (0: light, 1: dark). */
function fallbackValue(source, property, index) {
	const found = [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(new RegExp(`${property}: var\\(--ce-[\\w-]+, (rgba?\\([^)]*\\)|var\\([^)]*\\))\\);`, 'g'))];
	assert.ok(found[index], `${property} #${index} reads a theme's colour first, with a fallback`);
	return found[index][1];
}

/** The teaching layer's kinds: the site's token name for each, and the key a theme's `layer` gives it under. */
const BAND_KINDS = Object.freeze({ highlight: 'highlighted', error: 'error', success: 'success', warning: 'warning', added: 'added', removed: 'removed' });

/** The editor's band and line-number ink of a kind, for a mode, as it draws them (styles.module.css's fallbacks, guided.module.css). */
function siteBand(kind, mode) {
	if (kind === 'highlight' && mode === 'dark') {
		return { band: cssColorToHex(fallbackValue(readFileSync(GUIDED_CSS, 'utf8'), '--dwf-ce-bg', 1)), ink: null };
	}
	const band = cssColorToHex(codeLineFallback(mode, `${BAND_KINDS[kind]}-bg`));
	const ink = kind === 'highlight' ? null : codeLineFallback(mode, `${BAND_KINDS[kind]}-ink`);
	return { band, ink };
}

/** A theme's band of a kind: its own (`layer`), else the site's of its mode; and the ink of the line number on it. */
function bandOf(theme, kind) {
	const own = theme.frame[LAYER_PROPERTIES[kind]];
	const site = siteBand(kind, theme.mode);
	return { band: own ?? site.band, ink: site.ink ?? theme.keyColors.lineNumber, own: own !== null };
}

/**
 * The few pairs under the minimum that are kept on purpose (see editorThemes.js > CONTRAST): VS
 * Code's own themes keep the site's bands exactly as before (non-negotiable 1 of the spec).
 */
const KEPT_AS_BEFORE = Object.freeze([{ theme: 'vs-dark', kind: 'warning', what: 'comments' }]);

/** Is this pair one of KEPT_AS_BEFORE? */
function keptAsBefore(theme, kind, what) {
	return KEPT_AS_BEFORE.some((entry) => entry.theme === theme && entry.kind === kind && entry.what === what);
}

/** `color` (maybe translucent) on `shade` (maybe translucent) over the opaque `background`: the ratio. */
function contrastOnShade(color, shade, background) {
	const shown = over(shade, background);
	const hex = `#${[shown.r, shown.g, shown.b].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
	return { ratio: contrast(color, hex), hex };
}

/** Fail with a readable message when `color` on `shade` over `background` is under `min`. */
function assertOnShade(color, shade, background, min, what) {
	const { ratio, hex } = contrastOnShade(color, shade, background);
	assert.ok(ratio >= min, `${what}: ${color} on ${shade} over ${background} (${hex}) is ${ratio.toFixed(2)}:1, under ${min}:1`);
}

test('the current line (drawn at the cursor all the time): text 4.5:1, comments 3:1', () => {
	for (const { name, keyColors, monaco } of CUSTOM) {
		const line = monaco.colors['editor.lineHighlightBackground'];
		assertOnShade(keyColors.foreground, line, keyColors.background, TEXT_CONTRAST, `${name} text on the current line`);
		assertOnShade(keyColors.comment, line, keyColors.background, MARK_CONTRAST, `${name} comments on the current line`);
	}
});

test("the hover and suggest widgets (run errors, TypeScript's types, completions): their text 4.5:1", () => {
	const widgets = ['editorWidget', 'editorHoverWidget', 'editorSuggestWidget'];
	for (const { name, monaco } of CUSTOM) {
		for (const widget of widgets) {
			assertOnShade(monaco.colors[`${widget}.foreground`], monaco.colors[`${widget}.background`], monaco.colors['editor.background'], TEXT_CONTRAST, `${name} ${widget}`);
		}
	}
});

test("every band of the teaching layer: text 4.5:1, comments and the line number on it 3:1 (a theme's own band, else the site's)", () => {
	let checked = 0;
	for (const theme of ALL_THEMES) {
		const { name, keyColors } = theme;
		for (const kind of Object.keys(BAND_KINDS)) {
			const { band, ink } = bandOf(theme, kind);
			const pairs = [
				{ what: 'text', color: keyColors.foreground, min: TEXT_CONTRAST },
				{ what: 'comments', color: keyColors.comment, min: MARK_CONTRAST },
				{ what: 'line number', color: ink, min: MARK_CONTRAST },
			];
			for (const { what, color, min } of pairs) {
				if (keptAsBefore(name, kind, what)) continue;
				assertOnShade(color, band, keyColors.background, min, `${name} ${what} on the ${kind} band`);
				checked += 1;
			}
		}
	}
	assert.ok(checked >= ALL_THEMES.length * 17, `the pairs ran (${checked})`);
});

test('the pairs kept as before are really under the minimum, and belong to a theme that cannot change (VS Code\'s)', () => {
	for (const { theme: name, kind, what } of KEPT_AS_BEFORE) {
		assert.ok(DEFAULT_THEME_NAMES.includes(name), `${name}: only the default look is kept as it was`);
		const theme = EDITOR_THEMES[name];
		const { band, own } = bandOf(theme, kind);
		assert.equal(own, false, `${name} draws the site's ${kind} band`);
		const color = what === 'comments' ? theme.keyColors.comment : theme.keyColors.foreground;
		const { ratio } = contrastOnShade(color, band, theme.keyColors.background);
		assert.ok(ratio < MARK_CONTRAST, `${name} ${what} on ${kind}: ${ratio.toFixed(2)}:1 (drop the entry once it passes)`);
	}
});

test("the exercise diff's + / − inks: 4.5:1 on their rows over the output block, in every theme", () => {
	const lightRemovedInk = readFileSync(EXERCISE_CSS, 'utf8').match(/\[data-ce-mode='light'\]\) \.diff \{\s*--ce-line-removed-ink: (#[0-9a-f]{6});/i)?.[1];
	assert.ok(lightRemovedInk, "ExercisePanel.module.css's darker removed ink in a light theme");
	for (const theme of ALL_THEMES) {
		const inks = {
			added: codeLineFallback(theme.mode, 'added-ink'),
			removed: theme.mode === 'light' ? lightRemovedInk : codeLineFallback(theme.mode, 'removed-ink'),
		};
		for (const kind of ['added', 'removed']) {
			assertOnShade(inks[kind], bandOf(theme, kind).band, theme.frame['--ce-output-block-bg'], TEXT_CONTRAST, `${theme.name} the diff's ${kind} ink`);
		}
	}
});

test("a type query's muted text: 4.5:1 on its chip (the theme's own chip, else the site's of its mode)", () => {
	const twoslash = readFileSync(TWOSLASH_CSS, 'utf8');
	const siteChips = { light: cssColorToHex(fallbackValue(twoslash, '--twoslash-bg', 0)), dark: cssColorToHex(fallbackValue(twoslash, '--twoslash-bg', 1)) };
	for (const theme of ALL_THEMES) {
		const muted = theme.frame['--ce-muted'];
		const chip = theme.frame[LAYER_PROPERTIES.typeChip] ?? siteChips[theme.mode];
		assertOnShade(muted, chip, theme.keyColors.background, TEXT_CONTRAST, `${theme.name} the type chip`);
	}
});

/* ---- the Solution panel's colour key ---- */

test("diffKeyOf: VS Code's themes keep the stylesheet's key; another theme's key is its own diff colours; high contrast is outlined", () => {
	const css = readFileSync(SOLUTION_CSS, 'utf8');
	assert.match(css, /--sp-key-yours: rgba\(255, 0, 0, 0\.36\);/, "the stylesheet's key: Monaco's default removed red, both layers");
	assert.match(css, /--sp-key-solution: rgba\(156, 204, 44, 0\.36\);/);
	for (const name of [...DEFAULT_THEME_NAMES, 'a-theme-the-page-made', undefined]) {
		assert.deepEqual(diffKeyOf(name), { yours: null, solution: null, outlined: false }, `${String(name)}: the stylesheet's own colours`);
	}
	assert.deepEqual(diffKeyOf('hc-black'), { yours: '#ff008f', solution: '#33ff2e', outlined: true }, "Monaco's hc-black outlines");
	assert.deepEqual(diffKeyOf('hc-light'), { yours: '#ad0707', solution: '#374e06', outlined: true }, "Monaco's hc-light outlines");
	for (const { name, monaco } of CUSTOM) {
		const key = diffKeyOf(name);
		assert.equal(key.outlined, false);
		for (const [side, word, line] of [
			['yours', 'diffEditor.removedTextBackground', 'diffEditor.removedLineBackground'],
			['solution', 'diffEditor.insertedTextBackground', 'diffEditor.insertedLineBackground'],
		]) {
			assert.equal(key[side].slice(0, 7), monaco.colors[word].slice(0, 7), `${name} ${side}: the diff's own hue`);
			const keyAlpha = rgba(key[side]).a;
			const diffAlpha = 1 - (1 - rgba(monaco.colors[word]).a) * (1 - rgba(monaco.colors[line]).a);
			assert.ok(Math.abs(keyAlpha - diffAlpha) < 0.01, `${name} ${side}: a changed word's strength (${keyAlpha.toFixed(2)} vs ${diffAlpha.toFixed(2)})`);
		}
	}
});

test("Monaco's high-contrast diff outlines are the installed Monaco's own (the key draws them)", () => {
	const source = readFileSync(path.join(MONACO_VS, 'platform/theme/common/colors/editorColors.js'), 'utf8');
	const defaults = (id) => source.match(new RegExp(`registerColor\\('${id.replace(/\./g, '\\.')}', \\{([^}]*)\\}`))[1];
	const read = (id, key) => defaults(id).match(new RegExp(`${key}: '(#[0-9A-Fa-f]{6})`))[1].toLowerCase();
	assert.deepEqual(diffKeyOf('hc-black'), { yours: read('diffEditor.removedTextBorder', 'hcDark'), solution: read('diffEditor.insertedTextBorder', 'hcDark'), outlined: true });
	assert.deepEqual(diffKeyOf('hc-light'), { yours: read('diffEditor.removedTextBorder', 'hcLight'), solution: read('diffEditor.insertedTextBorder', 'hcLight'), outlined: true });
	assert.match(defaults('diffEditor.insertedTextBackground'), /hcDark: null, hcLight: null/, 'and no fill in high contrast');
});

/* ---- the reader's documentation names every family ---- */

/** A family's name as the reader's documentation writes it: its label up to a bracket ("Dracula (like …)" → "Dracula"); a site's wiring test repeats the rule. */
function shortName(family) {
	return family.label.replace(/\s*\(.*$/, '');
}

test("the README's Editor theme entry names every family (a new theme updates it)", () => {
	const readme = readFileSync(README, 'utf8');
	const entry = readme.slice(readme.indexOf('- **Editor theme**'), readme.indexOf('\n- **', readme.indexOf('- **Editor theme**') + 1));
	assert.ok(entry.length > 100, "the README's Editor theme entry is found");
	for (const family of THEME_FAMILIES) {
		assert.ok(entry.includes(shortName(family)), `README.md > Editor theme names ${shortName(family)}`);
	}
});

/* ---- resolveTheme ---- */

test("resolveTheme: a two-variant family follows the site's mode, a one-variant family keeps its own", () => {
	for (const family of THEME_FAMILIES) {
		for (const siteMode of ['light', 'dark']) {
			const theme = resolveTheme(family.id, siteMode);
			const expected = family.light && family.dark ? family[siteMode] : family.light ?? family.dark;
			assert.equal(theme, EDITOR_THEMES[expected], `${family.id} on a ${siteMode} site`);
		}
	}
	assert.equal(resolveTheme('dracula', 'light').mode, 'dark', 'Dracula stays dark on a light site');
	assert.equal(resolveTheme('github', 'dark').name, 'dwf-github-dark');
	assert.equal(resolveTheme('solarized', 'light').name, 'dwf-solarized-light');
	assert.equal(resolveTheme('high-contrast', 'dark').name, 'hc-black');
});

test('resolveTheme: an unknown family reads as the default, any mode but dark as light', () => {
	for (const unknown of ['nope', '', undefined, null, 42, 'VSCODE']) {
		assert.equal(resolveTheme(unknown, 'dark').name, THEME_DARK, `${String(unknown)} on a dark site`);
		assert.equal(resolveTheme(unknown, 'light').name, THEME_LIGHT, `${String(unknown)} on a light site`);
	}
	assert.equal(resolveTheme('github', undefined).name, 'dwf-github-light');
	assert.equal(resolveTheme('github', 'sepia').name, 'dwf-github-light');
});

/* ---- defineEditorThemes ---- */

/** A fake monaco that records defineTheme calls. */
function fakeMonaco() {
	const calls = [];
	return { calls, editor: { defineTheme: (name, data) => calls.push({ name, data }) } };
}

test('defineEditorThemes registers every custom theme, never a built-in one, with copies of the definitions', () => {
	const monaco = fakeMonaco();
	assert.equal(defineEditorThemes(monaco), true);
	assert.deepEqual(monaco.calls.map((call) => call.name), CUSTOM.map((theme) => theme.name));
	for (const { name, data } of monaco.calls) {
		assert.deepEqual(data, EDITOR_THEMES[name].monaco, `${name}: the registry's definition`);
		assert.notEqual(data, EDITOR_THEMES[name].monaco, `${name}: a copy`);
		assert.equal(Object.isFrozen(data), false, `${name}: Monaco gets a plain object it may keep`);
	}
	monaco.calls[0].data.rules.length = 0;
	assert.ok(EDITOR_THEMES[monaco.calls[0].name].monaco.rules.length > 0, 'changing the copy leaves the registry alone');
});

test('defineEditorThemes is idempotent: once per Monaco (every editor calls it in beforeMount)', () => {
	const monaco = fakeMonaco();
	assert.equal(defineEditorThemes(monaco), true);
	const first = monaco.calls.length;
	assert.equal(defineEditorThemes(monaco), false);
	assert.equal(defineEditorThemes(monaco), false);
	assert.equal(monaco.calls.length, first, 'no second definition');
	const another = fakeMonaco();
	assert.equal(defineEditorThemes(another), true, 'another Monaco gets its own');
	assert.equal(another.calls.length, first);
});

test('defineEditorThemes without a usable Monaco does nothing and never throws', () => {
	for (const missing of [undefined, null, {}, { editor: {} }, { editor: { defineTheme: 'no' } }]) {
		assert.equal(defineEditorThemes(missing), false);
	}
});

/* ---- read-only ---- */

test('the registry is frozen (consumers share one copy)', () => {
	const sample = EDITOR_THEMES['dwf-solarized-dark'];
	for (const value of [
		EDITOR_THEMES, sample, sample.frame, sample.keyColors, sample.monaco, sample.monaco.rules, sample.monaco.rules[1], sample.monaco.colors,
		EDITOR_THEMES.vs.frame, THEME_FAMILIES, THEME_FAMILIES[0], THEME_MENU_FAMILIES, THEME_MENU_FAMILIES[0].swatches[0],
		SYNTAX_TOKENS, SYNTAX_TOKENS.string, EDITOR_COLOR_IDS, FRAME_PROPERTIES, SITE_INKS.dark,
	]) {
		assert.ok(Object.isFrozen(value));
	}
});
