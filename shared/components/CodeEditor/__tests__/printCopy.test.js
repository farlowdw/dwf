/**
 * printCopy.test.js — the printout's copy of the code (../PrintCopy.jsx, ../PrintCopy.module.css),
 * rendered on the server through this folder's module hooks (jsxHooks.js) and its stylesheet
 * compiled the way the site's build compiles a CSS module (the tools guidedStyles.test.js uses):
 *   - the markup: ONE <pre class="printCopy" aria-hidden="true"> holding the code as it is
 *     (markup characters escaped, tabs and newlines kept), nothing else;
 *   - printCopyStyle: the editor's font, size, line height and tab width from the built Monaco
 *     options — the numbers the waiting placeholder's text gets (props.js > waitingCodeStyle),
 *     a page's editorOptions counted, Monaco's defaults for a value it would refuse;
 *   - the stylesheet: nothing on screen (display: none, the only screen rule), under @media
 *     print a wrapped block (display: block, white-space: pre-wrap) at Monaco's text column in
 *     paper ink (--ce-print-fg, never the theme's --ce-editor-fg: a dark theme's text would be
 *     near-invisible on white), local classes only, and every styles.<class> the component uses defined
 *     there (files.test.js checks styles.<class> against the module a file imports as `styles`:
 *     this file's own);
 *   - its own paper: in print every copy of the code (this one, and styles.module.css's
 *     placeholder copies: .printOnly, the waiting text, the failure message) has an opaque
 *     background of its own, printed even with backgrounds off (print-color-adjust: exact), on
 *     which the paper ink reads at 7:1 or more. A transparent one let the frame's background
 *     show through when backgrounds print: black code on a dark theme's #1e1e1e, 1.26:1;
 *   - the hook is wired: the <pre>'s ref and getCode go to usePrintRefresh (what it does:
 *     printRefresh.test.js), and PRINT_EVENT is passed on for the shell.
 * Run with `npm run test:shared`.
 * To change it: a new rule of the printout's copy (../PrintCopy.jsx or its stylesheet) gets a test
 * here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertContrast } from './contrast.js';

register('./jsxHooks.js', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: PrintCopy, PRINT_EVENT, printCopyStyle } = await import('../PrintCopy.jsx');
const { WAITING_FONT_CSS, buildMonacoOptions, normalizeEditorProps, waitingCodeStyle } = await import('../props.js');
const { PRINT_EVENT: HOOK_PRINT_EVENT } = await import('../usePrintRefresh.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOLDER = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);

const COMPONENT_SOURCE = readFileSync(path.join(FOLDER, 'PrintCopy.jsx'), 'utf8');
const STYLESHEET = readFileSync(path.join(FOLDER, 'PrintCopy.module.css'), 'utf8');
const FRAME_STYLESHEET = readFileSync(path.join(FOLDER, 'styles.module.css'), 'utf8');

/** The least contrast of the print ink on a print copy's own paper (WCAG's AAA for normal text). */
const PRINT_CONTRAST = 7;

/** Monaco's line height with the default options (14 px × 1.5). */
const LINE_PX = 21;

/** The inline style React writes for the default options. */
const DEFAULT_STYLE_ATTRIBUTE = `font-family:${WAITING_FONT_CSS};font-size:14px;line-height:${LINE_PX}px;tab-size:4`;

/** What the build appends to a local name (Docusaurus: `[local]_[contenthash:base64:4]`). */
const HASH_SUFFIX = '_h4sh';

/** The copy rendered with the default options (`props` over them). */
function render(props) {
	return renderToStaticMarkup(createElement(PrintCopy, { options: buildMonacoOptions({}, {}), ...props }));
}

test('the markup: one <pre class="printCopy" aria-hidden="true"> holding the code as it is, nothing else', () => {
	const code = 'def f(a, b):\n\treturn a < b & c  # "quotes" & \'ticks\'\n';
	const html = render({ code });
	assert.ok(html.startsWith(`<pre class="printCopy" style="${DEFAULT_STYLE_ATTRIBUTE}" aria-hidden="true">`), html);
	assert.ok(html.endsWith('</pre>'));
	assert.ok(html.includes('return a &lt; b &amp; c  # &quot;quotes&quot; &amp; &#x27;ticks&#x27;\n'), 'markup characters escaped, the tab and newlines kept');
	assert.equal((html.match(/<[a-z]/g) ?? []).length, 1, 'no other element');
});

test('an empty code: an empty <pre>; no options: the default metrics', () => {
	assert.equal(render({ code: '' }), `<pre class="printCopy" style="${DEFAULT_STYLE_ATTRIBUTE}" aria-hidden="true"></pre>`);
	assert.equal(renderToStaticMarkup(createElement(PrintCopy, { code: 'x' })), `<pre class="printCopy" style="${DEFAULT_STYLE_ATTRIBUTE}" aria-hidden="true">x</pre>`);
});

test("printCopyStyle: the waiting placeholder's numbers (font, size, line height, tab width) from the built options", () => {
	const defaults = buildMonacoOptions({}, {});
	assert.deepEqual(printCopyStyle(defaults), { fontFamily: WAITING_FONT_CSS, fontSize: '14px', lineHeight: `${LINE_PX}px`, tabSize: 4 });
	const { paddingTop, ...placeholder } = waitingCodeStyle(normalizeEditorProps({ initialCode: 'x' }));
	assert.deepEqual(printCopyStyle(defaults), placeholder, "the same numbers as the placeholder's text (its top padding aside)");
	assert.ok(paddingTop, 'the placeholder alone has the top padding');
});

test("printCopyStyle: a page's editorOptions count, and a page's font family wins", () => {
	const options = buildMonacoOptions({ fontSize: 20, tabSize: 2, fontFamily: '"Fira Code", monospace' }, {});
	assert.deepEqual(printCopyStyle(options), { fontFamily: '"Fira Code", monospace', fontSize: '20px', lineHeight: '30px', tabSize: 2 });
	const sitesFont = buildMonacoOptions({}, { fontFamily: "'IBM Plex Mono', monospace" });
	assert.equal(printCopyStyle(sitesFont).fontFamily, "'IBM Plex Mono', monospace", "the site's font, read by the client (editorFont.js), reaches the copy");
});

test("printCopyStyle: Monaco's defaults for a value it would refuse, and for no options at all", () => {
	assert.deepEqual(printCopyStyle({ fontSize: 0, tabSize: 2.5 }), { fontFamily: WAITING_FONT_CSS, fontSize: '14px', lineHeight: `${LINE_PX}px`, tabSize: 4 });
	assert.deepEqual(printCopyStyle({ fontSize: '16', tabSize: '2' }), { fontFamily: WAITING_FONT_CSS, fontSize: '14px', lineHeight: `${LINE_PX}px`, tabSize: 4 });
	assert.deepEqual(printCopyStyle(), { fontFamily: WAITING_FONT_CSS, fontSize: '14px', lineHeight: `${LINE_PX}px`, tabSize: 4 });
});

test("the hook is wired: the <pre>'s ref and getCode go to usePrintRefresh; PRINT_EVENT is the hook's, passed on", () => {
	assert.match(COMPONENT_SOURCE, /import \{ PRINT_EVENT, usePrintRefresh \} from '\.\/usePrintRefresh\.js';/);
	assert.match(COMPONENT_SOURCE, /const nodeRef = useRef\(null\);\s*usePrintRefresh\(nodeRef, getCode\);/);
	assert.match(COMPONENT_SOURCE, /<pre ref=\{nodeRef\}/);
	assert.equal(PRINT_EVENT, HOOK_PRINT_EVENT);
	assert.equal(PRINT_EVENT, 'beforeprint');
});

/** Every `styles.<name>` the component's code uses (its comments and import lines, which name the module's file, left out). */
function styleNamesUsed(source) {
	const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^import .*$/gm, '');
	return [...new Set([...code.matchAll(/\bstyles\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]))];
}

/** The class names a stylesheet defines (comments dropped: a name in a comment proves nothing). */
function stylesheetClasses(css) {
	return new Set([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
}

test('every styles.<class> the component uses is defined in PrintCopy.module.css', () => {
	const used = styleNamesUsed(COMPONENT_SOURCE);
	assert.deepEqual(used, ['printCopy'], 'the one class');
	const defined = stylesheetClasses(STYLESHEET);
	for (const name of used) assert.ok(defined.has(name), `.${name} is defined`);
	assert.match(COMPONENT_SOURCE, /import styles from '\.\/PrintCopy\.module\.css';/, 'imported as `styles`, so files.test.js checks the names against this module');
});

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

/** The stylesheet compiled as css-loader compiles it: { root, exported: { localName: builtName } }. */
async function compileStylesheet(css = STYLESHEET, from = 'PrintCopy.module.css') {
	const { postcss, localByDefault, scope } = tools;
	const plugins = [localByDefault({ mode: 'local' }), scope({ generateScopedName: (name) => `${name}${HASH_SUFFIX}` })];
	const result = await postcss(plugins).process(css, { from });
	result.root.walkComments((comment) => comment.remove());
	const exported = {};
	result.root.walkRules(':export', (rule) => {
		rule.walkDecls((declaration) => {
			exported[declaration.prop] = declaration.value;
		});
		rule.remove();
	});
	return { root: result.root, exported };
}

/** The declarations of every rule for `.printCopy` (built name), split by where it sits: { screen: {…}, print: {…} }. */
function printCopyRules(root) {
	const rules = { screen: {}, print: {} };
	root.walkRules(`.printCopy${HASH_SUFFIX}`, (rule) => {
		const inPrint = rule.parent.type === 'atrule' && rule.parent.name === 'media' && rule.parent.params === 'print';
		const target = inPrint ? rules.print : rules.screen;
		rule.walkDecls((declaration) => {
			target[declaration.prop] = declaration.value;
		});
	});
	return rules;
}

test('PrintCopy.module.css: nothing on screen, a wrapped block in print, at Monaco\'s text column in paper ink', { skip }, async () => {
	const { root, exported } = await compileStylesheet();
	assert.deepEqual(Object.keys(exported), ['printCopy'], 'one local class, and no global one');
	const { screen, print } = printCopyRules(root);
	assert.deepEqual(screen, { display: 'none' }, 'on screen: hidden, and nothing else (no size to disturb the box)');
	assert.equal(print.display, 'block');
	assert.equal(print['white-space'], 'pre-wrap', 'long lines wrap on paper instead of being cut');
	assert.equal(print['overflow-wrap'], 'anywhere', 'a word longer than the paper breaks too');
	assert.equal(print.padding, '0 0 0 var(--ce-code-text-left)', "Monaco's text column, as the waiting placeholder prints (styles.module.css)");
	assert.equal(print.color, 'var(--ce-print-fg, #000000)', "paper ink (the frame sets --ce-print-fg in print: styles.module.css), never the theme's --ce-editor-fg");
	assert.equal(print.background, '#ffffff', "its own paper (not transparent: a dark theme's frame would show through when backgrounds print)");
	assert.equal(print.margin, '0');
	let mediaQueries = 0;
	root.walkAtRules('media', (atRule) => {
		mediaQueries += 1;
		assert.equal(atRule.params, 'print', 'the only media query is print (never a device query: touchMode.js decides the view)');
	});
	assert.equal(mediaQueries, 1);
});

/** The built name of a selector of local classes: '.a .b' → '.a_h4sh .b_h4sh'. */
function builtSelector(selector) {
	return selector.replace(/\.([A-Za-z_][\w-]*)/g, `.$1${HASH_SUFFIX}`);
}

/** The declarations of every rule for `selector` (local names) under @media print, merged in order. */
function printDeclarations(root, selector) {
	const wanted = builtSelector(selector);
	const declarations = {};
	root.walkRules((rule) => {
		const inPrint = rule.parent.type === 'atrule' && rule.parent.name === 'media' && rule.parent.params === 'print';
		if (!inPrint || !rule.selectors.includes(wanted)) return;
		rule.walkDecls((declaration) => {
			declarations[declaration.prop] = declaration.value;
		});
	});
	return declarations;
}

test("every print copy of the code has its own paper under the paper ink, printed whatever the frame's theme", { skip }, async () => {
	const copy = await compileStylesheet();
	const frame = await compileStylesheet(FRAME_STYLESHEET, 'styles.module.css');
	const ink = printDeclarations(frame.root, '.frame')['--ce-print-fg'];
	assert.match(ink ?? '', /^#[0-9a-f]{6}$/i, 'the frame sets the paper ink in print');
	const copies = [
		["the Monaco view's print copy (PrintCopy.module.css)", copy.root, '.printCopy'],
		["the loading placeholder's and the failure frame's print copy (.printOnly)", frame.root, '.printOnly'],
		["the waiting placeholder's text", frame.root, '.editorBox .waitingCode'],
		["the failure frame's message", frame.root, '.editorBoxFailed .cover'],
	];
	for (const [what, root, selector] of copies) {
		const print = printDeclarations(root, selector);
		assert.match(print.background ?? '', /^#[0-9a-f]{6}$/i, `${what}: an opaque paper of its own in print, not ${print.background}`);
		assertContrast(ink, print.background, PRINT_CONTRAST, `${what}: the paper ink on its own paper`);
		assert.equal(print['print-color-adjust'], 'exact', `${what}: its paper prints with backgrounds off too`);
		assert.equal(print['-webkit-print-color-adjust'], 'exact', `${what}: and in WebKit`);
	}
});
