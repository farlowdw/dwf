/**
 * prismTheme.js — the CHOSEN editor theme (editorThemes.js) as a prism-react-renderer theme, so
 * that the static view a touch device gets instead of Monaco (StaticCode.jsx) colours its code
 * like the editor would: one data table from the registry's syntax ROLES to Prism's token TYPES,
 * the four built-in Monaco themes' role colours (Monaco keeps those in its own code, not in the
 * registry), and three lookups. Pure data and small functions: no React, no DOM, nothing read
 * at import; the Prism instance it reads is prism-react-renderer's own (Docusaurus's, the one
 * its client module extends with `themeConfig.prism.additionalLanguages`), never a CDN.
 *
 *     prismThemeOf('dwf-dracula')       // { plain: { color, backgroundColor }, styles: [{ types, style }] } for <Highlight theme>
 *     roleColorsOf(theme)               // { comment: { color: '#6272a4', italic: false }, keyword: …, … } for an EDITOR_THEMES entry
 *     prismLanguageFor('shell')         // 'bash'; 'plaintext' → 'text'; a grammar this Prism lacks → 'text'
 *
 * HOW A COLOUR IS CHOSEN  Each role of editorThemes.js > SYNTAX_TOKENS has a colour in every
 *   theme: a custom theme's comes from its Monaco definition (the rule of the role's first
 *   Monarch token: 'comment', 'keyword.directive', 'variable.predefined', …; italic when that
 *   rule says so), a built-in theme's from BUILT_IN_SYNTAX below. ROLE_PRISM_TYPES says which
 *   Prism token types each role paints; a Prism type no role names (UNMAPPED_PRISM_TYPES, and
 *   anything else) stays in the text colour — the same rule as the registry's `inherit: false`:
 *   nothing is left over from another theme.
 *
 * WHAT WINS ON A TOKEN  prism-react-renderer gives a leaf token every type of the tokens around
 *   it, outer first, each followed by its alias, and merges their styles in that order, so the
 *   LAST type with a style wins. Two cases worth knowing: a C `#include`'s word is
 *   macro › directive › keyword (its alias), so it takes the keyword colour (the directive colour
 *   paints the hash and the spaces); JavaScript's `console` carries the alias class-name, so it
 *   takes the type colour, where Monaco draws plain text. And one departure from the plan's table:
 *   Prism's `property` type is NOT painted. In the editor's languages it reaches a page only as
 *   the alias of a C / C++ macro (it would otherwise beat the macro's directive colour on the
 *   hash); a JavaScript object key, which Prism also calls `property`, then stays in the text
 *   colour — exactly what Monaco does with it (an identifier).
 *
 * WHERE THE BUILT-IN COLOURS COME FROM  BUILT_IN_SYNTAX copies the token rules of Monaco's own
 *   themes (node_modules/monaco-editor/esm/vs/editor/standalone/common/themes.js: vs, vs-dark,
 *   hc-black, hc-light; Microsoft, MIT), resolved as Monaco resolves them: the longest rule a
 *   token starts with, else the theme's default text (so `identifier` is the text colour,
 *   `directive` the keyword colour, hc-black's `predefined` its variable colour, which has no
 *   rule of its own there). __tests__/prismTheme.test.js reads the installed file and compares.
 *
 * HOW TO CHANGE IT
 *   A Prism type that shows up uncoloured (the test names it): add it to a role in
 *   ROLE_PRISM_TYPES, or to UNMAPPED_PRISM_TYPES when the text colour is right for it (as
 *   Monaco draws it) — never to both. A new custom theme in editorThemes.js needs nothing here.
 *   A new built-in Monaco theme: one entry in BUILT_IN_SYNTAX (every role). A Monaco language id
 *   Prism calls otherwise: PRISM_LANGUAGE_ALIASES. The mapping is tested against the fixtures of
 *   __tests__/fixtures/prism/ (a site guide's snippets, one file per language): a new kind of
 *   code on a page emitting a type the table lacks is found by adding it to those fixtures.
 */

import { Prism } from 'prism-react-renderer';
import { DEFAULT_FAMILY, SYNTAX_TOKENS, resolveTheme, themeByName } from './editorThemes.js';

/**
 * The Prism token types each syntax role paints (see WHAT WINS ON A TOKEN). A role with no
 * types (`predefined`: Monaco's shell $1, which Prism reads as a plain variable) paints nothing.
 */
export const ROLE_PRISM_TYPES = freezeDeep({
	comment: ['comment', 'prolog', 'doctype', 'cdata'],
	keyword: ['keyword', 'boolean', 'important', 'atrule'],
	directive: ['macro', 'directive'],
	string: ['string', 'char', 'template-string', 'attr-value', 'interpolation-punctuation', 'triple-quoted-string'],
	number: ['number'],
	regexp: ['regex'],
	type: ['class-name', 'maybe-class-name', 'builtin'],
	identifier: ['function', 'function-variable', 'function-name', 'method', 'console', 'symbol'],
	delimiter: ['punctuation', 'operator'],
	variable: ['variable', 'environment', 'assign-left', 'for-or-select'],
	predefined: [],
	constant: ['constant'],
	tag: ['decorator', 'tag'],
	annotation: ['shebang', 'annotation'],
	attribute: ['attr-name', 'parameter'],
	invalid: ['invalid'],
});

/**
 * The Prism types the editor's languages (python, javascript, typescript, c, cpp, go, bash) emit
 * on the site's code that stay in the text colour on purpose — mostly the wrappers around
 * tokens that are painted by what they hold (a regex's source and flags, a template string's
 * interpolation, a Python f-string, a C macro's hash and `property` alias, a TypeScript generic),
 * and `plain` itself. The test keeps this list exactly what the fixtures emit: nothing stale.
 */
export const UNMAPPED_PRISM_TYPES = Object.freeze([
	'plain',
	'arrow',
	'char-class',
	'char-class-negation',
	'char-class-punctuation',
	'control-flow',
	'directive-hash',
	'double-colon',
	'generic',
	'generic-function',
	'interpolation',
	'language-regex',
	'property',
	'property-access',
	'range',
	'range-punctuation',
	'regex-delimiter',
	'regex-flags',
	'regex-source',
	'string-interpolation',
	'template-punctuation',
]);

/** The role colours of Monaco's four built-in themes (see WHERE THE BUILT-IN COLOURS COME FROM), #rrggbb lower case. */
export const BUILT_IN_SYNTAX = freezeDeep({
	vs: {
		comment: '#008000',
		keyword: '#0000ff',
		directive: '#0000ff',
		string: '#a31515',
		number: '#098658',
		regexp: '#800000',
		type: '#008080',
		identifier: '#000000',
		delimiter: '#000000',
		variable: '#001188',
		predefined: '#4864aa',
		constant: '#dd0000',
		tag: '#800000',
		annotation: '#808080',
		attribute: '#ff0000',
		invalid: '#cd3131',
	},
	'vs-dark': {
		comment: '#608b4e',
		keyword: '#569cd6',
		directive: '#569cd6',
		string: '#ce9178',
		number: '#b5cea8',
		regexp: '#b46695',
		type: '#3dc9b0',
		identifier: '#d4d4d4',
		delimiter: '#dcdcdc',
		variable: '#74b0df',
		predefined: '#4864aa',
		constant: '#569cd6',
		tag: '#569cd6',
		annotation: '#cc6666',
		attribute: '#9cdcfe',
		invalid: '#f44747',
	},
	'hc-light': {
		comment: '#008000',
		keyword: '#0000ff',
		directive: '#0000ff',
		string: '#a31515',
		number: '#098658',
		regexp: '#800000',
		type: '#008080',
		identifier: '#292929',
		delimiter: '#000000',
		variable: '#264f70',
		predefined: '#4864aa',
		constant: '#dd0000',
		tag: '#800000',
		annotation: '#808080',
		attribute: '#264f78',
		invalid: '#b5200d',
	},
	'hc-black': {
		comment: '#608b4e',
		keyword: '#569cd6',
		directive: '#569cd6',
		string: '#ce9178',
		number: '#ffffff',
		regexp: '#c0c0c0',
		type: '#3dc9b0',
		identifier: '#ffffff',
		delimiter: '#ffff00',
		variable: '#1aebff',
		predefined: '#1aebff',
		constant: '#569cd6',
		tag: '#569cd6',
		annotation: '#569cd6',
		attribute: '#569cd6',
		invalid: '#f44747',
	},
});

/** Monaco language ids whose Prism grammar has another name. */
export const PRISM_LANGUAGE_ALIASES = Object.freeze({ shell: 'bash', plaintext: 'text' });

/** The Prism "grammar" of plain text (no tokens), used for any language this Prism has no grammar for. */
export const PLAIN_PRISM_LANGUAGE = 'text';

/** Monaco's font style for italics, as a theme's rules write it. */
const ITALIC = 'italic';

/** Freeze `value` and everything in it (the tables are read-only). */
function freezeDeep(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.values(value).forEach(freezeDeep);
		Object.freeze(value);
	}
	return value;
}

/** A Monaco rule's foreground (six hex digits) as #rrggbb, lower case. */
function hexOf(ruleForeground) {
	return `#${ruleForeground.toLowerCase()}`;
}

/** A custom theme's Monaco rule for `role`: the rule of the role's first token (editorThemes.js > syntaxRules writes one per token), or null. */
function ruleOf(theme, role) {
	const token = SYNTAX_TOKENS[role][0];
	return theme.monaco.rules.find((rule) => rule.token === token) ?? null;
}

/** A custom theme's colour of `role`: its rule's colour and italics, the text colour when no rule names the token. */
function customRoleColor(theme, role) {
	const rule = ruleOf(theme, role);
	if (!rule || !rule.foreground) return { color: theme.keyColors.foreground, italic: false };
	return { color: hexOf(rule.foreground), italic: rule.fontStyle === ITALIC };
}

/** A built-in theme's colour of `role`: BUILT_IN_SYNTAX's, the text colour for a built-in theme the table does not know. */
function builtInRoleColor(theme, role) {
	return { color: BUILT_IN_SYNTAX[theme.name]?.[role] ?? theme.keyColors.foreground, italic: false };
}

/**
 * The colour of every syntax role in a concrete theme (an EDITOR_THEMES entry):
 * { [role]: { color: '#rrggbb', italic } } — see HOW A COLOUR IS CHOSEN.
 */
export function roleColorsOf(theme) {
	const colors = {};
	for (const role of Object.keys(SYNTAX_TOKENS)) {
		colors[role] = theme.monaco ? customRoleColor(theme, role) : builtInRoleColor(theme, role);
	}
	return colors;
}

/** A prism-react-renderer style for a role's colour: italics only when the theme draws the role so. */
function prismStyleOf({ color, italic }) {
	return italic ? { color, fontStyle: ITALIC } : { color };
}

/** The prism-react-renderer theme of a concrete theme: its text and background as `plain`, one entry per role that paints something, in ROLE_PRISM_TYPES order. */
function buildPrismTheme(theme) {
	const roles = roleColorsOf(theme);
	const entries = [];
	for (const [role, types] of Object.entries(ROLE_PRISM_TYPES)) {
		if (types.length > 0) entries.push({ types: [...types], style: prismStyleOf(roles[role]) });
	}
	return freezeDeep({
		plain: { color: theme.keyColors.foreground, backgroundColor: theme.keyColors.background },
		styles: entries,
	});
}

/** The prism-react-renderer themes built so far, by the concrete theme's name (one per theme per page). */
const prismThemes = new Map();

/**
 * The prism-react-renderer theme (the `theme` prop of <Highlight>) for the concrete theme whose
 * Monaco name is `themeName`: built once per name and frozen (Highlight only reads it). A name
 * the registry does not know reads as the default family's light theme, as resolveTheme reads
 * unknown input.
 */
export function prismThemeOf(themeName) {
	const theme = themeByName(themeName) ?? resolveTheme(DEFAULT_FAMILY, undefined);
	if (!prismThemes.has(theme.name)) prismThemes.set(theme.name, buildPrismTheme(theme));
	return prismThemes.get(theme.name);
}

/** Does this Prism hold a grammar called `id`? (Its `languages` also carries helper functions: only an object counts.) */
function hasGrammar(prism, id) {
	const languages = prism?.languages;
	return Boolean(languages) && typeof id === 'string' && Object.hasOwn(languages, id) && typeof languages[id] === 'object' && languages[id] !== null;
}

/**
 * The Prism language for a Monaco language id ('python', 'cpp', 'shell' → 'bash', 'plaintext' →
 * 'text'), or PLAIN_PRISM_LANGUAGE when `prism` (prism-react-renderer's instance unless another
 * is given) has no such grammar — so a site that does not list `bash` among its
 * `themeConfig.prism.additionalLanguages` shows plain Bash, and nothing crashes.
 */
export function prismLanguageFor(monacoId, prism = Prism) {
	const id = PRISM_LANGUAGE_ALIASES[monacoId] ?? monacoId;
	return hasGrammar(prism, id) ? id : PLAIN_PRISM_LANGUAGE;
}
