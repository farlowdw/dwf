/**
 * render.test.mjs — <DropDownIC> (../index.jsx) rendered on the server through the folder's
 * own JSX hooks (jsxHooks.mjs), as the site renders every page at build time:
 *   - closed by default: a span[role=button] with aria-expanded="false" and aria-controls
 *     naming the panel; the panel without the open class (inert is set on the element in the
 *     browser, never in the markup); the title's words
 *     underlined in two spans, the last word and the arrow (aria-hidden) in one unbreakable
 *     piece (the arrow is Interview Cake's text glyph ↴, aria-hidden);
 *   - `defaultOpen`: expanded, shown and open; the phase rules and the close
 *     duration read from the stylesheet (pure functions);
 *   - the title: a <DropDownIC.Title> child wins over the prop; the body never shows the marker;
 *     withArrow's splitting (the last word, a last node, a trailing fragment, nothing);
 *   - `label`: the trigger's aria-label when given (what the plugin sets for a maths title);
 *   - `block`: both parts inside one block wrapper; otherwise two siblings, no wrapper;
 *   - end to end: an MDX paragraph compiled with ../mdx.cjs + remark-math + rehype-katex and
 *     rendered with the real component gives <div class="ddic-paragraph"> holding the words,
 *     the trigger (KaTeX in its title), the panel, then the words after it — skipped where
 *     remark-math and rehype-katex are not installed (another site without maths).
 * To change it: a new prop or state of ../index.jsx gets a test here, rendered through the hooks; a
 * new kind of file the component comes to import is a branch in jsxHooks.mjs's load(). The knobs
 * themselves are in ../README.md, "How to change it".
 * A .mjs file, so it is a module whatever the site's package.json says. The clicks and keys (a
 * double-click's second click, a held key, a link inside a JSX title) need a browser: they are
 * checked by hand on the built site. Run with `npm run test:shared`, or on its own with
 * `node --test "shared/components/DropDownIC/__tests__/*.test.mjs"`.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('./jsxHooks.mjs', import.meta.url);

const { createElement, Fragment } = await import('react');
const runtime = await import('react/jsx-runtime');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: DropDownIC, CLOSE_GRACE_MS, OPENED_EVENT, PHASE, TOGGLE_KEYS, longestDurationMs, toggled, withArrow } = await import('../index.jsx');

/** The maths pipeline, when the site has it (this one does); null elsewhere. */
async function mathsPipeline() {
	try {
		const [{ default: remarkMath }, { default: rehypeKatex }] = await Promise.all([import('remark-math'), import('rehype-katex')]);
		return { remarkMath, rehypeKatex };
	} catch {
		return null;
	}
}

const render = (element) => renderToStaticMarkup(element);

/** The first tag with these attributes, as a string of its attributes. */
function tag(html, pattern) {
	const match = html.match(pattern);
	assert.ok(match, `expected ${pattern} in ${html}`);
	return match[0];
}

const ARROW = '<span class="arrow" aria-hidden="true">↴</span>';

test('closed by default: the trigger, the underlined words with the arrow on the last one; the panel closed', () => {
	const html = render(createElement(DropDownIC, { title: 'the modulus operator' }, 'the body'));
	const trigger = tag(html, /<span class="trigger" role="button" tabindex="0" aria-expanded="false" aria-controls="([^"]+)">/);
	const panelId = /aria-controls="([^"]+)"/.exec(trigger)[1];
	assert.ok(html.includes(`<div id="${panelId}" class="panel">`), `the panel is named by aria-controls: ${html}`);
	assert.doesNotMatch(html, /inert/, 'inert is set on the element in the browser (React 18 drops the prop, 19 warns about a string): nothing in the server markup');
	assert.ok(html.includes(`<span class="title"><span class="words">the modulus </span><span class="tail"><span class="words">operator</span>${ARROW}`), `the words, then the last word and the arrow in one unbreakable span: ${html}`);
	assert.match(html, /<div class="clip"><div class="box">the body<\/div><\/div>/);
	assert.doesNotMatch(html, /class="panel shown/);
	assert.doesNotMatch(html, /class="block"/, 'no wrapper unless block');
	assert.ok(html.startsWith('<span class="trigger"'), 'two siblings: the trigger first…');
	assert.ok(html.endsWith('</div></div></div>'), '…the panel last');
});

test('defaultOpen: expanded, shown and open', () => {
	const html = render(createElement(DropDownIC, { title: 't', defaultOpen: true }, 'b'));
	assert.match(html, /aria-expanded="true"/);
	assert.match(html, /<div id="[^"]+" class="panel shown open">/);
});

test('the phases: a click opens a closed one in two steps, closes an open one, and reverses a closing one', () => {
	assert.equal(toggled(PHASE.closed), PHASE.opening);
	assert.equal(toggled(PHASE.opening), PHASE.closing);
	assert.equal(toggled(PHASE.open), PHASE.closing);
	assert.equal(toggled(PHASE.closing), PHASE.open);
});

test('the close duration is read from the stylesheet: the longest of a list, in ms, 0 without a transition', () => {
	assert.equal(longestDurationMs('0.24s'), 240);
	assert.equal(longestDurationMs('240ms'), 240);
	assert.equal(longestDurationMs('0.24s, 0.4s'), 400);
	assert.equal(longestDurationMs('0s'), 0);
	assert.equal(longestDurationMs(''), 0);
	assert.equal(longestDurationMs(undefined), 0);
	assert.equal(CLOSE_GRACE_MS, 50);
	assert.equal(OPENED_EVENT, 'resize', 'what the code blocks listen for');
});

test('the title: a <DropDownIC.Title> child wins over the prop and never shows in the body', () => {
	const html = render(
		createElement(DropDownIC, { title: 'the prop' }, createElement(DropDownIC.Title, null, 'from the ', createElement('strong', null, 'child')), 'the body'),
	);
	assert.ok(html.includes(`<span class="title"><span class="words">from the </span><span class="tail"><span class="words"><strong>child</strong></span>${ARROW}`), `a last node that is not text is the tail: ${html}`);
	assert.doesNotMatch(html, /the prop/);
	assert.match(html, /<div class="box">the body<\/div>/);
});

test('a title of React nodes (from a .jsx page) renders as given, a trailing fragment opened up', () => {
	const html = render(createElement(DropDownIC, { title: createElement(Fragment, null, 'a ', createElement('em', null, 'b')) }, 'c'));
	assert.ok(html.includes(`<span class="title"><span class="words">a </span><span class="tail"><span class="words"><em>b</em></span>${ARROW}`), html);
});

test('withArrow: the last word (or the last node) and the arrow share the unbreakable tail', () => {
	const words = render(createElement(Fragment, null, withArrow('modulus operator (%)')));
	assert.equal(words, `<span class="words">modulus operator </span><span class="tail"><span class="words">(%)</span>${ARROW}</span>`);
	assert.ok(render(createElement(Fragment, null, withArrow('modulus'))).startsWith(`<span class="tail"><span class="words">modulus</span>${ARROW}`), 'one word: no span before the tail');
	assert.ok(render(createElement(Fragment, null, withArrow(['a formula ', createElement('em', null, 'x'), '  ']))).startsWith(`<span class="words">a formula </span><span class="tail"><span class="words"><em>x</em></span>${ARROW}`), 'trailing whitespace is dropped; the element is the tail');
	assert.ok(render(createElement(Fragment, null, withArrow(''))).startsWith(`<span class="tail"><span class="words"></span>${ARROW}`), 'no words: the arrow alone');
	assert.ok(render(createElement(Fragment, null, withArrow(undefined))).startsWith(`<span class="tail"><span class="words"></span>${ARROW}`));
});

test('label: the trigger’s accessible name when given (a maths title), name-from-content otherwise', () => {
	assert.match(render(createElement(DropDownIC, { title: 'x', label: 'x squared' }, 'b')), /<span class="trigger" role="button" tabindex="0" aria-label="x squared" aria-expanded="false"/);
	assert.doesNotMatch(render(createElement(DropDownIC, { title: 'x' }, 'b')), /aria-label/);
});

test('block: trigger and panel inside one wrapper', () => {
	const html = render(createElement(DropDownIC, { title: 't', block: true }, 'b'));
	assert.ok(html.startsWith('<div class="block"><span class="trigger"'));
	assert.ok(html.endsWith('</div></div></div></div>'));
});

test('the keys that toggle are Enter and Space', () => {
	assert.deepEqual(TOGGLE_KEYS, ['Enter', ' ']);
});

test('end to end: an MDX paragraph with a maths title, compiled by the plugins and rendered with the real component', { skip: (await mathsPipeline()) ? false : 'remark-math and rehype-katex are not installed here' }, async () => {
	const { evaluate } = await import('@mdx-js/mdx');
	const { remarkMath, rehypeKatex } = await mathsPipeline();
	const { remarkDropDownIc, rehypeDropDownIc } = await import('../mdx.cjs');
	const warnings = [];
	const warn = (message) => warnings.push(message);
	const { default: Content } = await evaluate('Before the <DropDownIC title="modulus operator ($\\%$)">the **body**</DropDownIC>. After.', {
		...runtime,
		Fragment,
		useMDXComponents: () => ({ DropDownIC }),
		remarkPlugins: [remarkMath, [remarkDropDownIc, { warn }]],
		rehypePlugins: [[rehypeDropDownIc, { warn }], rehypeKatex],
	});
	assert.deepEqual(warnings, []);
	const html = render(createElement(Content));
	assert.ok(html.startsWith('<div class="ddic-paragraph">Before the <span class="trigger" role="button" tabindex="0" aria-label="modulus operator (\\%)"'), `the maths title’s label is the accessible name: ${html}`);
	assert.match(html, /<span class="title"><span class="words">modulus operator \(<span class="katex">/, 'KaTeX markup in the title');
	assert.match(html, /<span class="tail"><span class="words">\)<\/span><span class="arrow" aria-hidden="true">↴<\/span>/, 'the closing bracket is the last word, with the arrow');
	assert.match(html, /<div class="box">the <strong>body<\/strong><\/div><\/div><\/div>\. After\.<\/div>$/, 'the panel, then the words after it, inside the paragraph div');
});
