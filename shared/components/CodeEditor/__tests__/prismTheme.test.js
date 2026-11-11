/**
 * prismTheme.test.js — the editor theme as a prism-react-renderer theme (../prismTheme.js), the
 * colours of the static view a touch device reads instead of Monaco:
 *   - the table: every key of ROLE_PRISM_TYPES is a role of editorThemes.js > SYNTAX_TOKENS and
 *     every role has an entry, no Prism type is listed twice (nor both painted and unmapped);
 *   - every theme of the registry maps: `plain` is its key colours, every role has a #rrggbb
 *     colour and an italic flag, one style entry per painting role in the table's order, italics
 *     where the theme draws them (Solarized's comments, Dracula's variables) and nowhere in
 *     Monaco's built-in themes;
 *   - the built-in colours are Monaco's own: comment / keyword / string equal the registry's key
 *     colours, and every role equals the rule the installed Monaco's themes.js resolves for the
 *     role's first token (the longest rule it starts with, else the default text);
 *   - contrast (WCAG 2): every painted role 3:1 on its theme's background, the text 4.5:1 — but
 *     Solarized light's published green, cyan and yellow, kept as the registry keeps them
 *     (editorThemes.js > CONTRAST), each checked to be really under the minimum;
 *   - the real Prism (prism-react-renderer's instance, bash loaded the way Docusaurus's client
 *     module loads an additional language) tokenizing the fixtures of fixtures/prism/ (this
 *     site's guide snippets, one file per language of the editor) emits no type outside
 *     painted ∪ UNMAPPED_PRISM_TYPES, and every unmapped type is really emitted (no stale entry);
 *   - what a leaf token gets through <Highlight> (rendered on the server): the LAST type wins
 *     (a C `#include` word is a keyword, its hash a directive; `console` is a type), an unmapped
 *     type gets no style (the text colour);
 *   - prismLanguageFor: the aliases, a grammar the instance lacks → plain text;
 *   - prismThemeOf: one frozen object per name, an unknown name → the default family's light theme.
 * Run with `npm run test:shared`.
 * To change it: a Prism type goes in ROLE_PRISM_TYPES or UNMAPPED_PRISM_TYPES (../prismTheme.js), and a
 * new language of the editor gets its file in fixtures/prism/.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { Highlight, Prism, normalizeTokens } from 'prism-react-renderer';
import { DEFAULT_FAMILY, EDITOR_THEMES, SYNTAX_TOKENS, resolveTheme } from '../editorThemes.js';
import {
	BUILT_IN_SYNTAX,
	PLAIN_PRISM_LANGUAGE,
	PRISM_LANGUAGE_ALIASES,
	ROLE_PRISM_TYPES,
	UNMAPPED_PRISM_TYPES,
	prismLanguageFor,
	prismThemeOf,
	roleColorsOf,
} from '../prismTheme.js';
import { MARK_CONTRAST, TEXT_CONTRAST, assertContrast, contrast } from './contrast.js';
import { resolvePackage } from './paths.js';

const { renderToStaticMarkup } = await import('react-dom/server');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MONACO_THEMES = path.join(resolvePackage('monaco-editor'), 'esm/vs/editor/standalone/common/themes.js');
const FIXTURES = path.join(HERE, 'fixtures/prism');

/** Prism's bash grammar in the prismjs package (Docusaurus's own dependency), loaded onto prism-react-renderer's instance. */
const BASH_GRAMMAR = path.join(resolvePackage('prismjs'), 'components/prism-bash.js');

/** The fixtures' languages, by extension: the editor's languages as Prism names them. */
const FIXTURE_LANGUAGES = Object.freeze({ '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.c': 'c', '.cpp': 'cpp', '.go': 'go', '.sh': 'bash' });

/** Monaco's built-in themes, as the registry and the table name them. */
const BUILT_IN_NAMES = Object.freeze(['vs', 'vs-dark', 'hc-light', 'hc-black']);

const OPAQUE_HEX = /^#[0-9a-f]{6}$/;

/** The roles that paint something (a role with no Prism type is never drawn in the static view). */
const PAINTED_ROLES = Object.freeze(Object.keys(ROLE_PRISM_TYPES).filter((role) => ROLE_PRISM_TYPES[role].length > 0));

/** Every Prism type a role paints. */
const PAINTED_TYPES = Object.freeze(Object.values(ROLE_PRISM_TYPES).flat());

/**
 * The accents under 3:1 kept on purpose: Solarized light's published green (keywords), cyan
 * (strings) and yellow (types) sit at 2.9 to 3.0:1 on its background, as Solarized has always
 * had them (editorThemes.js > CONTRAST; a reader who needs more picks High contrast).
 */
const KEPT_AS_PUBLISHED = Object.freeze([
	{ theme: 'dwf-solarized-light', role: 'keyword' },
	{ theme: 'dwf-solarized-light', role: 'string' },
	{ theme: 'dwf-solarized-light', role: 'type' },
]);

/** Is this pair one of KEPT_AS_PUBLISHED? */
function keptAsPublished(themeName, role) {
	return KEPT_AS_PUBLISHED.some((entry) => entry.theme === themeName && entry.role === role);
}

/* ---- the bash grammar, loaded as Docusaurus's prism-include-languages does ---- */

/** Load prism-bash onto `prism` (the grammar file reads the global `Prism`); false when prismjs is not installed. */
async function loadBash(prism) {
	if (!existsSync(BASH_GRAMMAR)) return false;
	globalThis.Prism = prism;
	try {
		await import(pathToFileURL(BASH_GRAMMAR).href);
	} finally {
		delete globalThis.Prism;
	}
	return typeof prism.languages.bash === 'object';
}

const bashLoaded = await loadBash(Prism);

/* ---- reading the installed Monaco ---- */

/** A built-in theme's block of Monaco's themes.js ('vs' → the text between "Begin vs theme" and "End vs theme"). */
function monacoThemeBlock(source, name) {
	const block = source.match(new RegExp(`Begin ${name} theme[\\s\\S]*?End ${name} theme`));
	assert.ok(block, `Monaco's themes.js has a block for ${name}`);
	return block[0];
}

/** The token rules of a themes.js block that give a colour: [{ token, color: '#rrggbb' }] (the default rule has token ''). */
function monacoRulesOf(block) {
	return [...block.matchAll(/\{ token: '([^']*)', foreground: '([0-9A-Fa-f]{6})'/g)].map(([, token, color]) => ({ token, color: `#${color.toLowerCase()}` }));
}

/** The colour Monaco gives `token` under `rules`: the longest rule the token equals or starts with (dot-separated), else the default rule's. */
function monacoColorFor(rules, token) {
	const matching = rules.filter((rule) => rule.token !== '' && (token === rule.token || token.startsWith(`${rule.token}.`)));
	const best = matching.sort((a, b) => b.token.length - a.token.length)[0] ?? rules.find((rule) => rule.token === '');
	assert.ok(best, `a rule for '${token}'`);
	return best.color;
}

/* ---- tokenizing the fixtures ---- */

/** The fixture files of fixtures/prism/: [{ file, language }]. */
function fixtures() {
	return readdirSync(FIXTURES)
		.filter((name) => FIXTURE_LANGUAGES[path.extname(name)])
		.map((name) => ({ file: path.join(FIXTURES, name), language: FIXTURE_LANGUAGES[path.extname(name)] }));
}

/** Every type the leaf tokens of `code` carry, as <Highlight> would see them (the enclosing tokens' types and aliases included). */
function typesEmitted(code, language) {
	const types = new Set();
	for (const line of normalizeTokens(Prism.tokenize(code, Prism.languages[language]))) {
		for (const token of line) token.types.forEach((type) => types.add(type));
	}
	return types;
}

/** The leaf tokens of `code` as <Highlight> renders them with the theme `themeName`: [{ content, types, color }] (color null when no style applies). */
function renderedTokens(code, language, themeName) {
	let captured = [];
	const children = ({ tokens, getTokenProps }) => {
		captured = tokens.flat().map((token) => ({ content: token.content, types: token.types, color: getTokenProps({ token }).style?.color ?? null }));
		return null;
	};
	renderToStaticMarkup(createElement(Highlight, { prism: Prism, theme: prismThemeOf(themeName), code, language }, children));
	return captured;
}

/** The rendered token whose content is `content` (the first one). */
function tokenNamed(tokens, content) {
	const found = tokens.find((token) => token.content === content);
	assert.ok(found, `a token '${content}' among ${JSON.stringify(tokens.map((token) => token.content))}`);
	return found;
}

/* ---- the table ---- */

test('ROLE_PRISM_TYPES: every registry role, nothing else, no Prism type twice, none both painted and unmapped', () => {
	assert.deepEqual(Object.keys(ROLE_PRISM_TYPES), Object.keys(SYNTAX_TOKENS), "the roles, in the registry's order");
	assert.equal(new Set(PAINTED_TYPES).size, PAINTED_TYPES.length, 'a Prism type under one role only');
	for (const type of [...PAINTED_TYPES, ...UNMAPPED_PRISM_TYPES]) assert.match(type, /^[a-z][a-z-]*$/, `${type}: a Prism type name`);
	assert.deepEqual(UNMAPPED_PRISM_TYPES.filter((type) => PAINTED_TYPES.includes(type)), [], 'an unmapped type is not painted');
	assert.equal(new Set(UNMAPPED_PRISM_TYPES).size, UNMAPPED_PRISM_TYPES.length, 'no unmapped type twice');
	assert.ok(UNMAPPED_PRISM_TYPES.includes('plain'), 'plain text is the text colour');
	assert.deepEqual(ROLE_PRISM_TYPES.predefined, [], "Monaco's shell $1 has no Prism counterpart: the role paints nothing");
	assert.ok(PAINTED_ROLES.length >= 14, `most roles paint (${PAINTED_ROLES.length})`);
	assert.ok(Object.isFrozen(ROLE_PRISM_TYPES) && Object.isFrozen(ROLE_PRISM_TYPES.string) && Object.isFrozen(UNMAPPED_PRISM_TYPES) && Object.isFrozen(BUILT_IN_SYNTAX.vs));
});

/* ---- every theme maps ---- */

test('every theme of the registry maps: plain = its key colours, a colour and an italic flag per role, one style entry per painting role in order', () => {
	for (const [name, theme] of Object.entries(EDITOR_THEMES)) {
		const roles = roleColorsOf(theme);
		assert.deepEqual(Object.keys(roles), Object.keys(SYNTAX_TOKENS), `${name}: every role`);
		for (const [role, { color, italic }] of Object.entries(roles)) {
			assert.match(color, OPAQUE_HEX, `${name} ${role}: an opaque #rrggbb, lower case`);
			assert.equal(typeof italic, 'boolean', `${name} ${role}: italic flag`);
		}
		const prism = prismThemeOf(name);
		assert.deepEqual(prism.plain, { color: theme.keyColors.foreground, backgroundColor: theme.keyColors.background }, `${name}: plain text`);
		assert.deepEqual(
			prism.styles.map((entry) => entry.types),
			PAINTED_ROLES.map((role) => ROLE_PRISM_TYPES[role]),
			`${name}: one entry per painting role, in ROLE_PRISM_TYPES order`,
		);
		prism.styles.forEach((entry, index) => {
			const role = PAINTED_ROLES[index];
			assert.equal(entry.style.color, roles[role].color, `${name} ${role}: the role's colour`);
			assert.equal(entry.style.fontStyle, roles[role].italic ? 'italic' : undefined, `${name} ${role}: italics only where the theme has them`);
			assert.deepEqual(Object.keys(entry), ['types', 'style'], `${name} ${role}: no languages filter (the theme is one for every language)`);
		});
	}
});

test("italics follow the theme: Solarized's comments and Dracula's variables, nothing in Monaco's built-in themes", () => {
	assert.equal(roleColorsOf(EDITOR_THEMES['dwf-solarized-light']).comment.italic, true);
	assert.equal(roleColorsOf(EDITOR_THEMES['dwf-solarized-dark']).comment.italic, true);
	assert.equal(roleColorsOf(EDITOR_THEMES['dwf-dracula']).variable.italic, true);
	assert.equal(roleColorsOf(EDITOR_THEMES['dwf-dracula']).keyword.italic, false, "Dracula's keywords upright, as the site's code blocks draw them");
	assert.equal(roleColorsOf(EDITOR_THEMES['dwf-dracula']).predefined.italic, false, 'a role not in `italic` says so (no italic inherited from variable)');
	for (const name of BUILT_IN_NAMES) {
		for (const [role, { italic }] of Object.entries(roleColorsOf(EDITOR_THEMES[name]))) assert.equal(italic, false, `${name} ${role}`);
		for (const entry of prismThemeOf(name).styles) assert.equal('fontStyle' in entry.style, false, `${name}: no font style`);
	}
});

test("a custom theme's role colours are its Monaco rules' (the rule of the role's first token)", () => {
	for (const theme of Object.values(EDITOR_THEMES).filter((entry) => entry.monaco)) {
		const roles = roleColorsOf(theme);
		for (const [role, tokens] of Object.entries(SYNTAX_TOKENS)) {
			const rule = theme.monaco.rules.find((entry) => entry.token === tokens[0]);
			assert.ok(rule, `${theme.name}: a rule for ${tokens[0]}`);
			assert.equal(roles[role].color, `#${rule.foreground.toLowerCase()}`, `${theme.name} ${role}`);
			assert.equal(roles[role].italic, rule.fontStyle === 'italic', `${theme.name} ${role}: italics`);
		}
		assert.equal(roles.comment.color, theme.keyColors.comment, `${theme.name}: the key comment colour`);
		assert.equal(roles.keyword.color, theme.keyColors.keyword);
		assert.equal(roles.string.color, theme.keyColors.string);
	}
});

/* ---- the built-in colours are Monaco's own ---- */

test("the built-in themes' comment / keyword / string equal the registry's key colours", () => {
	assert.deepEqual(Object.keys(BUILT_IN_SYNTAX).sort(), [...BUILT_IN_NAMES].sort(), 'the four built-in themes');
	for (const name of BUILT_IN_NAMES) {
		assert.equal(EDITOR_THEMES[name].monaco, null, `${name} is built in`);
		assert.deepEqual(Object.keys(BUILT_IN_SYNTAX[name]), Object.keys(SYNTAX_TOKENS), `${name}: every role, in order`);
		const { keyColors } = EDITOR_THEMES[name];
		assert.equal(BUILT_IN_SYNTAX[name].comment, keyColors.comment, `${name} comment`);
		assert.equal(BUILT_IN_SYNTAX[name].keyword, keyColors.keyword, `${name} keyword`);
		assert.equal(BUILT_IN_SYNTAX[name].string, keyColors.string, `${name} string`);
		assert.deepEqual(roleColorsOf(EDITOR_THEMES[name]), Object.fromEntries(Object.entries(BUILT_IN_SYNTAX[name]).map(([role, color]) => [role, { color, italic: false }])), `${name}: roleColorsOf reads the table`);
	}
});

test("every built-in role equals the rule the installed Monaco's themes.js resolves for the role's first token", () => {
	const source = readFileSync(MONACO_THEMES, 'utf8');
	for (const name of BUILT_IN_NAMES) {
		const rules = monacoRulesOf(monacoThemeBlock(source, name));
		assert.ok(rules.length > 10, `${name}: rules found`);
		for (const [role, tokens] of Object.entries(SYNTAX_TOKENS)) {
			assert.equal(BUILT_IN_SYNTAX[name][role], monacoColorFor(rules, tokens[0]), `${name} ${role} ('${tokens[0]}')`);
		}
		assert.equal(BUILT_IN_SYNTAX[name].identifier, EDITOR_THEMES[name].keyColors.foreground, `${name}: an identifier is the text colour`);
	}
	assert.equal(BUILT_IN_SYNTAX['hc-black'].predefined, BUILT_IN_SYNTAX['hc-black'].variable, "hc-black has no variable.predefined rule: Monaco falls back to 'variable'");
});

/* ---- contrast ---- */

test('every painted role 3:1 on its background, plain text 4.5:1 — but the accents kept as published', () => {
	let checked = 0;
	for (const [name, theme] of Object.entries(EDITOR_THEMES)) {
		const { color, backgroundColor: background } = prismThemeOf(name).plain;
		assertContrast(color, background, TEXT_CONTRAST, `${name} text`);
		for (const [role, { color }] of Object.entries(roleColorsOf(theme))) {
			if (!PAINTED_ROLES.includes(role) || keptAsPublished(name, role)) continue;
			assertContrast(color, background, MARK_CONTRAST, `${name} ${role}`);
			checked += 1;
		}
	}
	assert.ok(checked >= Object.keys(EDITOR_THEMES).length * (PAINTED_ROLES.length - 1), `the pairs ran (${checked})`);
});

test('the accents kept as published are really under 3:1 (drop the entry once one passes)', () => {
	for (const { theme: name, role } of KEPT_AS_PUBLISHED) {
		assert.ok(PAINTED_ROLES.includes(role), `${name} ${role} paints something (else the entry is pointless)`);
		const { color } = roleColorsOf(EDITOR_THEMES[name])[role];
		const ratio = contrast(color, EDITOR_THEMES[name].keyColors.background);
		assert.ok(ratio < MARK_CONTRAST, `${name} ${role}: ${ratio.toFixed(2)}:1`);
	}
});

/* ---- the real Prism over the fixtures ---- */

test('the fixtures cover every language of the editor, and the Prism instance has each grammar (bash loaded as Docusaurus loads it)', { skip: bashLoaded ? false : 'prismjs is not installed: bash cannot be loaded' }, () => {
	const languages = fixtures().map((fixture) => fixture.language);
	assert.deepEqual([...languages].sort(), Object.values(FIXTURE_LANGUAGES).sort(), 'one fixture per language');
	for (const language of languages) assert.equal(prismLanguageFor(language === 'bash' ? 'shell' : language), language, `${language}: its grammar`);
});

test('tokenizing the fixtures with the real Prism emits no type outside painted ∪ UNMAPPED, and every unmapped type is emitted', { skip: bashLoaded ? false : 'prismjs is not installed: bash cannot be loaded' }, () => {
	const known = new Set([...PAINTED_TYPES, ...UNMAPPED_PRISM_TYPES]);
	const emitted = new Set();
	for (const { file, language } of fixtures()) {
		const types = typesEmitted(readFileSync(file, 'utf8'), language);
		assert.ok(types.size > 3, `${path.basename(file)}: tokens found`);
		const unknown = [...types].filter((type) => !known.has(type));
		assert.deepEqual(unknown, [], `${path.basename(file)} emits types the table does not know (add them to ROLE_PRISM_TYPES or UNMAPPED_PRISM_TYPES)`);
		types.forEach((type) => emitted.add(type));
	}
	assert.deepEqual(UNMAPPED_PRISM_TYPES.filter((type) => !emitted.has(type)), [], 'an unmapped type no fixture emits is stale');
	for (const type of ['comment', 'keyword', 'string', 'number', 'punctuation', 'operator', 'function', 'builtin', 'macro', 'template-string', 'regex', 'variable']) {
		assert.ok(emitted.has(type), `the fixtures exercise '${type}'`);
	}
});

test('on a leaf token the LAST type wins: a C #include word is a keyword and its hash a directive, console is a type; an unmapped type gets no style', () => {
	const vs = BUILT_IN_SYNTAX.vs;
	const c = renderedTokens('#include <stdio.h>\nint x = 1;', 'c', 'vs');
	assert.deepEqual(tokenNamed(c, 'include').types, ['macro', 'property', 'directive', 'keyword'], "the macro's property alias, then the directive with its keyword alias");
	assert.equal(tokenNamed(c, 'include').color, vs.keyword);
	assert.deepEqual(tokenNamed(c, '#').types, ['macro', 'property', 'directive-hash']);
	assert.equal(tokenNamed(c, '#').color, vs.directive, "the hash keeps the macro's colour: property is not painted, directive-hash is unmapped");
	assert.equal(tokenNamed(c, '<stdio.h>').color, vs.string, 'the header name is a string');
	assert.equal(tokenNamed(c, 'int').color, vs.keyword);
	assert.equal(tokenNamed(c, '1').color, vs.number);
	const js = renderedTokens("console.log(a.b, 'hi') // c", 'javascript', 'vs');
	assert.deepEqual(tokenNamed(js, 'console').types, ['console', 'class-name']);
	assert.equal(tokenNamed(js, 'console').color, vs.type, "Prism's alias makes console a class name");
	assert.equal(tokenNamed(js, 'log').color, vs.identifier, 'a method is an identifier');
	assert.equal(tokenNamed(js, 'b').color, null, 'property-access is unmapped: no style, the text colour');
	assert.equal(tokenNamed(js, "'hi'").color, vs.string);
	assert.equal(tokenNamed(js, '// c').color, vs.comment);
	assert.equal(tokenNamed(js, '(').color, vs.delimiter);
	const dracula = renderedTokens('x = 1  # one', 'python', 'dwf-dracula');
	assert.equal(tokenNamed(dracula, '# one').color, EDITOR_THEMES['dwf-dracula'].keyColors.comment);
	assert.equal(tokenNamed(dracula, '1').color, EDITOR_THEMES['dwf-dracula'].keyColors.foreground, "Dracula's numbers are plain text, as in the site's code blocks");
});

/* ---- prismLanguageFor ---- */

test("prismLanguageFor: Monaco's ids, the two aliases, plain text for a grammar the instance lacks", () => {
	assert.deepEqual(PRISM_LANGUAGE_ALIASES, { shell: 'bash', plaintext: 'text' });
	assert.equal(PLAIN_PRISM_LANGUAGE, 'text');
	for (const id of ['python', 'javascript', 'typescript', 'c', 'cpp', 'go']) assert.equal(prismLanguageFor(id), id, id);
	assert.equal(prismLanguageFor('plaintext'), 'text');
	assert.equal(prismLanguageFor('shell'), bashLoaded ? 'bash' : 'text', 'bash once its grammar is loaded');
	const withoutBash = { languages: { text: {}, python: { comment: /#.*/ } } };
	assert.equal(prismLanguageFor('shell', withoutBash), 'text', 'a site without bash among its additional languages: plain Bash');
	assert.equal(prismLanguageFor('python', withoutBash), 'python');
	assert.equal(prismLanguageFor('plaintext', withoutBash), 'text');
	assert.equal(prismLanguageFor('toString', withoutBash), 'text', "a name of Object's prototype is no grammar");
	assert.equal(prismLanguageFor('extend'), 'text', "Prism's helper functions on `languages` are no grammars");
	for (const missing of [undefined, null, 42, '']) assert.equal(prismLanguageFor(missing, withoutBash), 'text', String(missing));
	assert.equal(prismLanguageFor('python', { languages: { text: {} } }), 'text');
	assert.equal(prismLanguageFor('python', {}), 'text', 'no languages at all');
	assert.equal(prismLanguageFor('python', null), 'text');
});

/* ---- prismThemeOf ---- */

test('prismThemeOf: one frozen object per name, an unknown name reads as the default family\'s light theme', () => {
	for (const name of Object.keys(EDITOR_THEMES)) {
		const theme = prismThemeOf(name);
		assert.equal(prismThemeOf(name), theme, `${name}: cached`);
		for (const value of [theme, theme.plain, theme.styles, theme.styles[0], theme.styles[0].style, theme.styles[0].types]) assert.ok(Object.isFrozen(value), `${name}: frozen`);
	}
	assert.notEqual(prismThemeOf('vs'), prismThemeOf('vs-dark'));
	const fallback = prismThemeOf(resolveTheme(DEFAULT_FAMILY, undefined).name);
	for (const unknown of ['nope', '', undefined, null, 42, 'a-theme-the-page-made']) assert.equal(prismThemeOf(unknown), fallback, String(unknown));
	assert.equal(fallback, prismThemeOf('vs'));
});
