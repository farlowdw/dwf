/**
 * staticStyles.test.js — static.module.css (the static view's stylesheet), compiled the way the
 * site's build compiles a CSS module (css-loader's own PostCSS plugins, as guidedStyles.test.js
 * does) and read against the code that depends on it:
 *   - its colours come from guided.module.css's global classes, so it reads only the
 *     --dwf-ce-* properties that file sets (never the site's --code-line-* names, never a
 *     theme's --ce-band-*: themeWiring.test.js counts those reads), names only kind classes
 *     decorations.js has, and agrees with guided.module.css on which kinds keep their own left
 *     edge under the step and on the + / − glyphs;
 *   - a dark theme is the editor's mode (data-ce-mode) only, never the site's; no media query
 *     for a touch device (the frame's data-ce-touch is the only hook; touchMode.js decides);
 *   - the flash's animation is as long as decorations.js > FLASH_MS, with no fade for a reader
 *     who asks for less motion, and names its keyframes after the build renames them;
 *   - the touch rules (the 16 px Monaco textarea and stdin field), and that the stdin rule
 *     reaches the field: its MUI classes are on a multi-line TextField as the INSTALLED MUI
 *     renders it on the server, and it outweighs styles.module.css's `.stdinField textarea`
 *     (MUI 9 dropped MuiInputBase-inputMultiline, and a rule on it matched nothing for days);
 *     the print rules (hidden lines
 *     shown, nothing to tap), the bar (44 px, no double-tap zoom), the selection rules (the
 *     numbers never copied), the gutter's width (the frame's --ce-code-text-left, the same
 *     fallback).
 * Run with `npm run test:shared`.
 * To change it: a new rule of static.module.css that code depends on gets a test here; the Input
 * field's MUI classes are STDIN_TOUCH_CLASSES.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASS_PREFIX, FLASH_MS, LINE_KINDS } from '../decorations.js';
import { STDIN_MAX_ROWS, STDIN_MIN_ROWS } from '../sizing.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);

const STATIC_CSS = readFileSync(path.join(FOLDER, 'static.module.css'), 'utf8');
const GUIDED_CSS = readFileSync(path.join(FOLDER, 'guided.module.css'), 'utf8');
const FRAME_CSS = readFileSync(path.join(FOLDER, 'styles.module.css'), 'utf8');

/** A stylesheet without its comments (the build drops them too, so a name in a comment proves nothing). */
function withoutComments(css) {
	return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const STATIC_RULES_CSS = withoutComments(STATIC_CSS);

/** What the build appends to a local name (Docusaurus: `[local]_[contenthash:base64:4]`). */
const HASH_SUFFIX = '_h4sh';

/** The touch rule of the Input (stdin) field: MUI 9's classes of a multi-line field, root then textarea. */
const STDIN_TOUCH_CLASSES = Object.freeze(['MuiInputBase-multiline', 'MuiInputBase-input']);
const STDIN_TOUCH_SELECTOR = `[data-ce-touch] ${STDIN_TOUCH_CLASSES.map((name) => `:global(.${name})`).join(' ')}`;
/** The field's own rule in styles.module.css, which sets a smaller size on every device. */
const STDIN_FIELD_SELECTOR = '.stdinField textarea';
/** What CodeEditorClient.jsx > StdinField renders, as far as its classes go. */
const STDIN_FIELD_PROPS = Object.freeze({ multiline: true, minRows: STDIN_MIN_ROWS, maxRows: STDIN_MAX_ROWS, size: 'small', fullWidth: true, className: 'stdinField' });
/** The frame's touch attribute (touchMode.js > TOUCH_ATTRIBUTE). */
const TOUCH_ATTRIBUTE = 'data-ce-touch';

/** The site's build tools, or null where they are missing (the compiled tests then skip). */
function loadCssModules() {
	try {
		return {
			postcss: require('postcss'),
			localByDefault: require('postcss-modules-local-by-default'),
			scope: require('postcss-modules-scope'),
		};
	} catch {
		return null;
	}
}

const tools = loadCssModules();
const skip = tools ? false : 'postcss or the CSS-module plugins are not installed';

/** A CSS module compiled as css-loader compiles it: { css, exported: { localName: builtName } }. */
async function compileModule(source, from) {
	const { postcss, localByDefault, scope } = tools;
	const plugins = [localByDefault({ mode: 'local' }), scope({ generateScopedName: (name) => `${name}${HASH_SUFFIX}` })];
	const result = await postcss(plugins).process(source, { from });
	result.root.walkComments((comment) => comment.remove());
	const exported = {};
	result.root.walkRules(':export', (rule) => {
		rule.walkDecls((declaration) => {
			exported[declaration.prop] = declaration.value;
		});
		rule.remove();
	});
	return { css: result.root.toString(), exported };
}

/** Every plain rule of a stylesheet, top level or inside an at-rule: [{ selector, body }]. */
function rulesOf(css) {
	const rules = [];
	for (const [, selectorText, body] of withoutComments(css).matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
		rules.push({ selector: selectorText.trim(), body: body.trim() });
	}
	return rules;
}

/** The body of the first rule whose selector is exactly `selector` ('' when there is none). */
function ruleFor(css, selector) {
	return rulesOf(css).find((rule) => rule.selector === selector)?.body ?? '';
}

/** The contents of the first `@media <query> { … }` block of `css` ('' when there is none). */
function mediaBlockOf(css, query) {
	const start = withoutComments(css).indexOf(`@media ${query}`);
	if (start === -1) return '';
	const open = withoutComments(css).indexOf('{', start);
	let depth = 0;
	for (let at = open; at < withoutComments(css).length; at += 1) {
		const char = withoutComments(css)[at];
		if (char === '{') depth += 1;
		if (char === '}') depth -= 1;
		if (depth === 0) return withoutComments(css).slice(open + 1, at);
	}
	return '';
}

/** The kinds whose guided.module.css rule draws a left edge (a --dwf-ce-bar that is not transparent), highlight aside. */
function kindsWithAnEdge() {
	const rules = rulesOf(GUIDED_CSS);
	return LINE_KINDS.filter((kind) => {
		const rule = rules.find((candidate) => candidate.selector.split(/,\s*/).includes(`:global(.${CLASS_PREFIX}kind-${kind})`));
		return rule && !/--dwf-ce-bar: transparent/.test(rule.body);
	}).filter((kind) => kind !== 'highlight');
}

/** The kinds named by `:global(.dwf-ce-kind-…)` in `selector`, sorted. */
function kindsIn(selector) {
	return [...selector.matchAll(new RegExp(`\\.${CLASS_PREFIX}kind-([\\w-]+)`, 'g'))].map((match) => match[1]).sort();
}

test('the local classes come out of the build renamed, the global names unchanged, the keyframes renamed with their animation', { skip }, async () => {
	const { css, exported } = await compileModule(STATIC_CSS, 'static.module.css');
	const expected = ['staticBox', 'static', 'line', 'marked', 'currentStep', 'step', 'number', 'code', 'foldMarker', 'foldChevron', 'chevronIcon', 'flash', 'flashBand', 'touchBar', 'flashFade'];
	assert.deepEqual(Object.keys(exported).sort(), expected.sort(), 'exactly these local names (the keyframes among them)');
	for (const kind of LINE_KINDS) {
		const name = `${CLASS_PREFIX}kind-${kind}`;
		if (STATIC_RULES_CSS.includes(name)) assert.ok(!css.includes(`${name}${HASH_SUFFIX}`), `${name} stays global`);
	}
	assert.ok(!css.includes(`monaco-editor${HASH_SUFFIX}`) && !css.includes(`inputarea${HASH_SUFFIX}`), "Monaco's classes stay global");
	assert.ok(css.includes(`[data-ce-touch] ${STDIN_TOUCH_CLASSES.map((name) => `.${name}`).join(' ')} {`), "MUI's classes stay global");
	const keyframes = css.match(/@keyframes ([\w-]+)/)?.[1];
	assert.equal(keyframes, exported.flashFade, 'the keyframes take their built name');
	const animations = [...css.matchAll(/animation: ([\w-]+) (\d+)ms/g)];
	assert.equal(animations.length, 1, 'one animated rule: the flash');
	assert.equal(animations[0][1], keyframes, 'it names the keyframes by their built name');
	assert.equal(Number(animations[0][2]), FLASH_MS, 'as long as decorations.js keeps the flash');
	assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;/, 'no fade for a reader who asks for less motion');
});

test("the colours are guided.module.css's: only its --dwf-ce-* properties are read, never the site's tokens or a theme's bands", () => {
	assert.doesNotMatch(STATIC_RULES_CSS, /var\(--code-line-/, "the site's names are read only in styles.module.css");
	assert.doesNotMatch(STATIC_RULES_CSS, /--ce-band-|--ce-line-/, 'the kinds are coloured by guided.module.css alone (themeWiring.test.js counts its reads)');
	const read = new Set([...STATIC_RULES_CSS.matchAll(/var\((--dwf-ce-[\w-]+)/g)].map((match) => match[1]));
	assert.deepEqual([...read].sort(), ['--dwf-ce-bar', '--dwf-ce-bg', '--dwf-ce-flash-bg', '--dwf-ce-ink']);
	for (const property of read) assert.ok(withoutComments(GUIDED_CSS).includes(`${property}:`), `${property} is set by guided.module.css`);
	assert.match(ruleFor(STATIC_CSS, '.marked'), /background-color: var\(--dwf-ce-bg\);\s*box-shadow: inset 3px 0 0 0 var\(--dwf-ce-bar\);/, "the author's band and edge, as the code blocks draw them");
	assert.match(ruleFor(STATIC_CSS, '.currentStep > .step'), /background-color: var\(--dwf-ce-bg\);\s*box-shadow: inset 3px 0 0 0 var\(--dwf-ce-bar\);/, "the step's underlay: the same look");
	assert.match(ruleFor(STATIC_CSS, '.currentStep > .step'), /z-index: -1/, "under the text, over the line's own band");
	assert.match(ruleFor(STATIC_CSS, '.number'), /color: var\(--dwf-ce-ink, var\(--ce-static-number, var\(--ce-muted\)\)\)/, "the kind's ink, else the theme's number colour, else muted");
	for (const kind of kindsIn(STATIC_RULES_CSS)) assert.ok(LINE_KINDS.includes(kind), `${kind} is a kind decorations.js knows`);
});

test("an author's kind wins its line: the step's edge goes exactly where the kind has one, and the step draws nothing on a highlight (guided.module.css's rules)", () => {
	const edgeRule = rulesOf(STATIC_CSS).find((rule) => rule.selector.endsWith('> .step') && rule.selector.includes(':is('));
	assert.ok(edgeRule, "a rule that drops the step's edge under a kind");
	assert.equal(edgeRule.body, 'box-shadow: none;');
	assert.deepEqual(kindsIn(edgeRule.selector), kindsWithAnEdge().sort(), 'every kind with a left edge of its own, and only those');
	assert.equal(ruleFor(STATIC_CSS, `.marked:global(.${CLASS_PREFIX}kind-highlight) > .step`), 'display: none;', 'nothing more on a highlight');
});

test("add / remove: the + / − in the gutter, the same glyphs as guided.module.css's", () => {
	const glyphOf = (css, kind, selector) => ruleFor(css, selector).match(/content: '([^']*)'/)?.[1];
	for (const kind of ['add', 'remove']) {
		const guided = glyphOf(GUIDED_CSS, kind, `:global(.monaco-editor .margin-view-overlays .dwf-ce-margin.${CLASS_PREFIX}kind-${kind})::before`);
		const here = glyphOf(STATIC_CSS, kind, `.marked:global(.${CLASS_PREFIX}kind-${kind}) > .number::before`);
		assert.ok(guided, `guided.module.css draws ${kind}'s glyph`);
		assert.equal(here, guided, `${kind}: the same glyph`);
	}
	const shared = rulesOf(STATIC_CSS).find((rule) => rule.selector.endsWith('> .number::before') && rule.selector.includes(':is('));
	assert.ok(shared, 'one rule places both glyphs');
	assert.deepEqual(kindsIn(shared.selector), ['add', 'remove']);
	assert.match(shared.body, /position: absolute;\s*top: 0;\s*left: 0;/, "at the line's left edge, like Monaco's glyph margin");
	assert.match(shared.body, /color: var\(--dwf-ce-ink\)/);
});

test("a dark theme is the editor's mode only, and no media query decides for a touch device", () => {
	assert.doesNotMatch(STATIC_RULES_CSS, /data-theme/, "nothing switches on the site's mode (the dark bands come from guided.module.css's data-ce-mode rules)");
	assert.doesNotMatch(STATIC_RULES_CSS, /hover: none|pointer: coarse|any-hover|any-pointer/, 'the frame\'s data-ce-touch is the only hook (touchMode.js reads the query once)');
	const queries = [...STATIC_RULES_CSS.matchAll(/@media ([^{]+)\{/g)].map((match) => match[1].trim());
	assert.deepEqual(queries, ['(prefers-reduced-motion: reduce)', 'print']);
});

test('the touch rules: the Monaco textarea and the stdin field at 16 px under the frame\'s data-ce-touch (iOS zooms below it)', () => {
	assert.equal(ruleFor(STATIC_CSS, '[data-ce-touch] :global(.monaco-editor textarea.inputarea)'), 'font-size: 16px !important;', "Monaco writes the size inline: only !important reaches it");
	assert.equal(ruleFor(STATIC_CSS, STDIN_TOUCH_SELECTOR), 'font-size: 16px;', "MUI's textarea of the Input field");
	const touchRules = rulesOf(STATIC_CSS).filter((rule) => rule.selector.includes('data-ce-touch'));
	assert.equal(touchRules.length, 2, 'nothing else keys on the attribute here');
});

/** Elements of server-rendered markup, each with its tag, its attributes and its parent. Styles and void tags handled. */
function elementsOf(markup) {
	const VOID = new Set(['area', 'br', 'col', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);
	const elements = [];
	const open = [];
	const html = markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
	for (const [, closing, tag, attributeText, selfClosing] of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g)) {
		if (closing) {
			open.pop();
			continue;
		}
		const attributes = Object.fromEntries([...attributeText.matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, value ?? '']));
		const element = { tag: tag.toLowerCase(), attributes, parent: open.at(-1) ?? null };
		elements.push(element);
		if (!selfClosing && !VOID.has(element.tag)) open.push(element);
	}
	return elements;
}

/** True when one compound of a selector (`.a.b`, `[name]`, `tag`) fits an element. */
function compoundFits(compound, element) {
	const classes = new Set((element.attributes.class ?? '').split(/\s+/));
	const parts = compound.match(/\.[\w-]+|\[[\w-]+\]|^[a-z][\w-]*/g) ?? [];
	return parts.every((part) => {
		if (part.startsWith('.')) return classes.has(part.slice(1));
		if (part.startsWith('[')) return part.slice(1, -1) in element.attributes;
		return element.tag === part;
	});
}

/** True when a selector of descendant compounds (the CSS module's :global() taken off) matches an element. */
function selectorMatches(selector, element) {
	const compounds = selector.replace(/:global\(([^)]*)\)/g, '$1').trim().split(/\s+/);
	if (!compoundFits(compounds.at(-1), element)) return false;
	let ancestor = element.parent;
	for (const compound of compounds.slice(0, -1).reverse()) {
		while (ancestor && !compoundFits(compound, ancestor)) ancestor = ancestor.parent;
		if (!ancestor) return false;
		ancestor = ancestor.parent;
	}
	return true;
}

/** A selector's weight as [ids, classes and attributes, tags]: enough for these plain selectors. */
function specificityOf(selector) {
	const plain = selector.replace(/:global\(([^)]*)\)/g, '$1');
	const ids = (plain.match(/#[\w-]+/g) ?? []).length;
	const classes = (plain.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;
	const tags = (plain.match(/(?:^|\s)[a-z][\w-]*/g) ?? []).length;
	return [ids, classes, tags];
}

const outweighs = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

test("the stdin touch rule reaches MUI's textarea as the installed MUI renders it, and outweighs the field's own size", async () => {
	const { createElement } = await import('react');
	const { renderToStaticMarkup } = await import('react-dom/server');
	const { default: TextField } = await import('@mui/material/TextField');
	const markup = renderToStaticMarkup(createElement('div', { [TOUCH_ATTRIBUTE]: '' }, createElement(TextField, STDIN_FIELD_PROPS)));
	const textareas = elementsOf(markup).filter((element) => element.tag === 'textarea');
	const typedInto = textareas.filter((element) => !('aria-hidden' in element.attributes));
	assert.equal(typedInto.length, 1, 'one textarea to type in (MUI adds a hidden one to measure rows)');
	// The stylesheet's own rule, whatever it names: the one touch rule on an MUI class.
	const touchRule = rulesOf(STATIC_CSS).find((rule) => rule.selector.startsWith(`[${TOUCH_ATTRIBUTE}]`) && rule.selector.includes(':global(.Mui'));
	assert.ok(touchRule, 'a touch rule on the field');
	assert.ok(typedInto.every((element) => selectorMatches(touchRule.selector, element)), `${touchRule.selector} reaches no class of ${markup.match(/<textarea[^>]*>/)?.[0]}`);
	assert.ok(textareas.every((element) => selectorMatches(STDIN_FIELD_SELECTOR, element)), 'the field\'s own rule reaches it too, so the weights decide');
	assert.match(ruleFor(FRAME_CSS, STDIN_FIELD_SELECTOR), /font-size: 0\.875rem/, 'the size the touch rule must beat');
	assert.ok(outweighs(specificityOf(touchRule.selector), specificityOf(STDIN_FIELD_SELECTOR)) > 0, '16 px wins on a touch screen');
});

test('print: every hidden line shown, nothing to tap, the bands kept', () => {
	const print = mediaBlockOf(STATIC_CSS, 'print');
	assert.ok(print, 'a print block');
	assert.match(print, /\.line\[hidden\]\s*\{\s*display: flex;/, 'a fold\'s hidden lines print');
	assert.match(print, /\.foldMarker,\s*\.foldChevron,\s*\.touchBar\s*\{\s*display: none;/, 'the buttons and the bar do not');
	assert.match(ruleFor(STATIC_CSS, '.static'), /print-color-adjust: exact/, 'the bands print');
	assert.equal(ruleFor(STATIC_CSS, '.line[hidden]'), 'display: none;', "on screen the attribute wins over the line's display: flex");
});

test('the bar: 44 px, the header shade with a top border, no double-tap zoom; the fold buttons likewise', () => {
	const bar = ruleFor(STATIC_CSS, '.touchBar');
	assert.match(bar, /min-height: 44px/);
	assert.match(bar, /border-top: 1px solid var\(--ce-border\)/);
	assert.match(bar, /background: var\(--ce-header-bg\)/);
	assert.match(bar, /width: 100%/);
	assert.match(bar, /touch-action: manipulation/);
	for (const selector of ['.foldMarker', '.foldChevron']) assert.match(ruleFor(STATIC_CSS, selector), /touch-action: manipulation/, `${selector}: a tap, not a zoom`);
	assert.match(ruleFor(STATIC_CSS, '.foldMarker:focus-visible,\n.foldChevron:focus-visible,\n.touchBar:focus-visible'), /outline: 2px solid var\(--ifm-color-primary\)/);
});

test('the selection copies code only: the container selectable, the numbers and the fold marker not; long lines wrap', () => {
	assert.match(ruleFor(STATIC_CSS, '.static'), /user-select: text/);
	assert.match(ruleFor(STATIC_CSS, '.number'), /user-select: none/);
	assert.match(ruleFor(STATIC_CSS, '.foldMarker'), /user-select: none/);
	assert.match(ruleFor(STATIC_CSS, '.code'), /white-space: pre-wrap;\s*overflow-wrap: anywhere;\s*tab-size: inherit;/);
	assert.match(ruleFor(STATIC_CSS, '.line'), /isolation: isolate/, "the underlays' z-index stays inside the line");
});

test("the gutter is as wide as the frame's text column (--ce-code-text-left), with the same fallback as the placeholder's value", () => {
	const frameValue = FRAME_CSS.match(/--ce-code-text-left: ([^;]+);/)?.[1];
	assert.ok(frameValue, 'styles.module.css sets --ce-code-text-left on the frame');
	assert.match(ruleFor(STATIC_CSS, '.number'), new RegExp(`width: var\\(--ce-code-text-left, ${frameValue}\\)`));
	assert.match(ruleFor(STATIC_CSS, '.foldChevron'), new RegExp(`left: calc\\(var\\(--ce-code-text-left, ${frameValue}\\) - 22px\\)`));
	assert.match(ruleFor(STATIC_CSS, '.number'), /padding-right: 22px/, 'room for the chevron');
	assert.match(ruleFor(STATIC_CSS, '.foldChevron'), /width: 22px/);
});
