/**
 * guidedStyles.test.js — the two stylesheets of the guided parts, compiled the way the site's
 * build compiles a CSS module (css-loader's own PostCSS plugins: postcss-modules-local-by-default
 * and postcss-modules-scope, from node_modules), then checked against the code that uses them:
 *   - guided.module.css (Monaco's decorations, decorations.js): every class name decorations.js
 *     gives Monaco comes out of the build UNCHANGED (global: Monaco writes the names as they
 *     are), no local class leaks out, every kind has its rule and reads the site's code-line
 *     tokens (--ce-line-*, defined light and dark on the frame in styles.module.css), the current step shares highlight's
 *     look (light and dark), an author's kind wins a line the step shares (the number rule
 *     names every coloured kind; the step's edge goes exactly where the kind has an edge of its
 *     own; nothing of the step on an author's highlight), and the flash's animation still names
 *     its keyframes after the build renames them, with FLASH_MS as its length;
 *   - StepBar.module.css: every stepStyles.<class> StepBar.jsx uses is defined (files.test.js
 *     checks `styles.<class>` against styles.module.css only), it is all local, and no hover
 *     turns the buttons' text the site's blue (too faint: 2.9:1 in dark mode).
 * Run with `npm run test:shared`.
 * To change it: a new kind or class of either stylesheet gets a test here, read from the compiled CSS.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	CLASS_PREFIX,
	FLASH_AGAIN_CLASS,
	FLASH_CLASS,
	FLASH_MARGIN_CLASS,
	FLASH_MS,
	LINE_KINDS,
	STEP_CLASS,
	kindClassNames,
	stepClassNames,
} from '../decorations.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);

const GUIDED_CSS = readFileSync(path.join(FOLDER, 'guided.module.css'), 'utf8');
const STEP_BAR_CSS = readFileSync(path.join(FOLDER, 'StepBar.module.css'), 'utf8');
const STEP_BAR_JSX = readFileSync(path.join(FOLDER, 'StepBar.jsx'), 'utf8');
const FRAME_CSS = readFileSync(path.join(FOLDER, 'styles.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** What the build appends to a local name (Docusaurus: `[local]_[contenthash:base64:4]`). */
const HASH_SUFFIX = '_h4sh';

/** The site's build tools, or null where they are missing (the CSS tests then skip). */
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

/**
 * A CSS module compiled as css-loader compiles it: { css, exported: { localName: builtName } }.
 * Comments are dropped (the build drops them too), so a name in a comment proves nothing.
 */
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

/** Every class name decorations.js hands Monaco that must have a rule (FLASH_AGAIN_CLASS only alternates: no rule). */
function decorationClassNames() {
	const names = new Set([FLASH_CLASS, FLASH_MARGIN_CLASS]);
	const sets = [...LINE_KINDS.map(kindClassNames), stepClassNames()];
	for (const set of sets) {
		for (const value of Object.values(set)) for (const name of value.split(' ')) names.add(name);
	}
	return [...names];
}

/** Does compiled CSS hold the class `name` exactly (not a longer name, not a hashed one)? */
function hasClass(css, name) {
	return new RegExp(`\\.${name}(?![\\w-])`).test(css);
}

test('guided.module.css: every class decorations.js gives Monaco survives the build unchanged (global)', { skip }, async () => {
	const { css, exported } = await compileModule(GUIDED_CSS, 'guided.module.css');
	for (const name of decorationClassNames()) {
		assert.ok(name.startsWith(CLASS_PREFIX), `${name} has the prefix`);
		assert.ok(hasClass(css, name), `.${name} is in the built stylesheet as it is`);
		assert.ok(!css.includes(`${name}${HASH_SUFFIX}`), `.${name} was not renamed`);
	}
	assert.ok(!hasClass(css, FLASH_AGAIN_CLASS), `${FLASH_AGAIN_CLASS} needs no rule: it only makes Monaco draw the lines anew`);
	assert.deepEqual(Object.keys(exported), ['flash'], 'no local class leaks out: only the keyframes have a built name');
});

test("guided.module.css: the flash's animation names its keyframes after the build, for FLASH_MS", { skip }, async () => {
	const { css, exported } = await compileModule(GUIDED_CSS, 'guided.module.css');
	const keyframes = css.match(/@keyframes ([\w-]+)/)?.[1];
	assert.equal(keyframes, exported.flash, 'the keyframes take their built name');
	const animations = [...css.matchAll(/animation: ([\w-]+) (\d+)ms/g)];
	assert.ok(animations.length > 0, 'the flash rule has its animation');
	for (const [, name, ms] of animations) {
		assert.equal(name, keyframes, 'the rule names the keyframes by their built name');
		assert.equal(Number(ms), FLASH_MS, 'decorations.js removes the flash when the animation ends');
	}
	assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none;/, 'no fade for a reader who asks for less motion');
});

/** guided.module.css without its comments. */
const GUIDED_RULES_CSS = GUIDED_CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every plain rule of guided.module.css: [{ selectors: ['…', …], body }] (selectors split at the top-level commas). */
function guidedRules() {
	const rules = [];
	for (const [, selectorText, body] of GUIDED_RULES_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = selectorText.split(/,\s*(?=:global|html|$)/).map((selector) => selector.trim());
		rules.push({ selectors, body });
	}
	return rules;
}

/** The body of the first rule one of whose selectors is exactly `selector` ('' when there is none). */
function ruleFor(selector) {
	return guidedRules().find((rule) => rule.selectors.includes(selector))?.body ?? '';
}

/** The first rule one of whose selectors contains `marker`: its selector, or ''. */
function selectorWith(marker) {
	for (const rule of guidedRules()) {
		const found = rule.selectors.find((selector) => selector.includes(marker));
		if (found) return found;
	}
	return '';
}

/** The kinds named in the first :is(…) of `selector`, sorted. */
function kindsListedIn(selector) {
	const list = selector.match(/:is\(([^)]*)\)/)?.[1] ?? '';
	return [...list.matchAll(new RegExp(`\\.${CLASS_PREFIX}kind-([\\w-]+)`, 'g'))].map((match) => match[1]).sort();
}

/** The kinds whose rule draws a left edge (a --dwf-ce-bar that is not transparent). */
function kindsWithAnEdge() {
	return LINE_KINDS.filter((kind) => !/--dwf-ce-bar: transparent/.test(ruleFor(`:global(.${CLASS_PREFIX}kind-${kind})`)));
}

test("guided.module.css: every kind has its rule, reading the editor's code-line tokens that styles.module.css defines for both modes", () => {
	const tokenOf = { highlight: 'highlighted', add: 'added', remove: 'removed' };
	for (const kind of LINE_KINDS) {
		const rule = ruleFor(`:global(.${CLASS_PREFIX}kind-${kind})`);
		assert.ok(rule, `a rule for the kind ${kind}`);
		const token = tokenOf[kind] ?? kind;
		const layerKey = { add: 'added', remove: 'removed' }[kind] ?? kind;
		assert.match(
			rule,
			new RegExp(`--dwf-ce-bg: var\\(--ce-band-${layerKey}, var\\(--ce-line-${token}-bg\\)\\)`),
			`${kind}: its band is a theme's own --ce-band-${layerKey} (editorThemes.js > LAYER_PROPERTIES), else the editor's --ce-line-${token}-bg`,
		);
	}
	const dark = ruleFor(`:global([data-ce-mode='dark'] .${CLASS_PREFIX}kind-highlight)`);
	assert.match(dark, /--dwf-ce-bg: var\(--ce-band-highlight, rgba\(100, 150, 210, 0\.2\)\)/, "highlight's dark band: a theme's own first, else today's");
	for (const [, token] of GUIDED_CSS.matchAll(/var\((--ce-line-[\w-]+)\)/g)) {
		const definitions = FRAME_CSS.match(new RegExp(`${token}: var\\(--code-line-`, 'g')) ?? [];
		assert.equal(definitions.length, 2, `${token} is defined for light and dark on the frame in styles.module.css`);
	}
	assert.doesNotMatch(GUIDED_CSS, /var\(--code-line-/, "the site's names are read only in styles.module.css (with fallbacks)");
});

test("guided.module.css: the current step has highlight's look, in light and dark mode", () => {
	const light = ruleFor(`:global(.${STEP_CLASS})`);
	assert.ok(light, 'a rule for the step');
	assert.equal(light, ruleFor(`:global(.${CLASS_PREFIX}kind-highlight)`), "the same rule as highlight's: one look for both");
	// dark: the EDITOR's theme (the frame's data-ce-mode), not the site's (styles.module.css > THE EDITOR'S MODE)
	const dark = ruleFor(`:global([data-ce-mode='dark'] .${STEP_CLASS})`);
	assert.ok(dark, 'a dark-theme rule for the step');
	assert.equal(dark, ruleFor(`:global([data-ce-mode='dark'] .${CLASS_PREFIX}kind-highlight)`));
	assert.doesNotMatch(GUIDED_CSS.replace(/\/\*[\s\S]*?\*\//g, ''), /data-theme/, "no rule switches on the site's mode");
	assert.match(light, /--dwf-ce-bar: rgba\(/, 'the blue left edge');
});

test("guided.module.css: the line number's colour names every coloured kind (so no other class on the number can cancel it)", () => {
	const selector = selectorWith('.line-numbers.dwf-ce-number');
	assert.doesNotMatch(selector, /:not\(/, 'not "every kind but highlight": a second class would cancel that');
	const coloured = LINE_KINDS.filter((kind) => kind !== 'highlight').sort();
	assert.deepEqual(kindsListedIn(selector), coloured);
});

test("guided.module.css: an author's kind wins a line the step shares — the step's edge goes exactly where the kind has one", () => {
	const edgeRule = guidedRules().find((rule) => rule.selectors.some((selector) => selector.includes(`> .${STEP_CLASS}`) && selector.includes(':is(')));
	assert.ok(edgeRule, "a rule that drops the step's edge under a kind");
	assert.match(edgeRule.body, /box-shadow: none/);
	const listed = kindsListedIn(edgeRule.selectors[0]);
	const withEdge = kindsWithAnEdge()
		.filter((kind) => kind !== 'highlight')
		.sort();
	assert.deepEqual(listed, withEdge, 'every kind with a left edge of its own, and only those (add / remove leave the step its edge)');
	assert.match(edgeRule.selectors[0], /\.margin-view-overlays > div:has\(> \.dwf-ce-margin:is\(/, 'read from the same margin line');
});

test("guided.module.css: on an author's highlight the step draws nothing more, behind the code and under the gutter", () => {
	const highlightRule = guidedRules().find((rule) => rule.selectors.some((selector) => selector.includes(`:has(> .${CLASS_PREFIX}kind-highlight) > .${STEP_CLASS}`)));
	assert.ok(highlightRule);
	assert.ok(highlightRule.selectors.some((selector) => selector.includes('.margin-view-overlays')), 'under the gutter');
	assert.ok(highlightRule.selectors.some((selector) => selector.includes('.monaco-editor .view-overlays')), 'behind the code');
	assert.match(highlightRule.body, /background-color: transparent/);
	assert.match(highlightRule.body, /box-shadow: none/);
});

test('StepBar.module.css: every stepStyles.<class> StepBar.jsx uses is defined, and all of it is local', { skip }, async () => {
	const { css, exported } = await compileModule(STEP_BAR_CSS, 'StepBar.module.css');
	const used = new Set([...STEP_BAR_JSX.matchAll(/stepStyles\.(\w+)/g)].map((match) => match[1]));
	assert.ok(used.size >= 8, 'the bar uses its stylesheet');
	for (const name of used) assert.ok(name in exported, `StepBar.jsx uses stepStyles.${name}, which StepBar.module.css does not define`);
	assert.doesNotMatch(STEP_BAR_CSS, /:global/, 'no global names: the bar is not drawn by Monaco');
	assert.match(css, /@media \(max-width: 480px\)/, 'the phone rule survives');
});

test("StepBar.module.css: no hover turns the buttons' text the site's blue (2.9:1 on the dark control colour)", () => {
	const css = STEP_BAR_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
	for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (!selector.includes(':hover')) continue;
		assert.doesNotMatch(body, /(^|[^-])color: var\(--ifm-color-primary\)/, `${selector.trim()} keeps the text colour`);
		assert.match(body, /background: var\(--ce-handle-hover\)/, `${selector.trim()} shows the hover by its shade`);
	}
});
