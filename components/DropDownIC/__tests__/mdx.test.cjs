/**
 * mdx.test.cjs — the MDX plugins of <DropDownIC> (../mdx.cjs), run through the real MDX
 * compiler (@mdx-js/mdx and remark-gfm, which come with Docusaurus) with remark-math and
 * rehype-katex as the docs have them — the maths cases skip themselves, with the reason, where
 * those two are not installed (another site without maths):
 *   - a string `title` is read as the page's text: its maths becomes KaTeX markup, its `**bold**`
 *     a <strong>, inside a <DropDownIC.Title> child; the attribute is gone;
 *   - the TeX inside `$…$` reaches KaTeX untouched (braces, `<`, a `$$…$$` span, a `$$` run
 *     inside a `$…$` span), a code span's text too, while MDX's own characters outside them
 *     ({, }, <) are shown, never read; without remark-math a `$` is a `$`; a title with maths
 *     gets a `label` (its plain text, the TeX as written) for the trigger's accessible name;
 *   - a link in a title becomes its words; an image is left out; each with a warning; a
 *     reference-style link or a footnote mark is shown as written (the page's own get resolved);
 *   - the paragraph holding a dropdown becomes <div class="ddic-paragraph">; other paragraphs
 *     stay <p>; a tight list item keeps the dropdown directly inside the <li>; a table cell too;
 *   - a dropdown that is a block of its own gets `block` (also when it stood alone in a
 *     paragraph, which MDX unravels); an author's own `block` is kept;
 *   - a title that is not one line of prose (a heading, a list, a quote, `import …`, empty,
 *     MDX syntax that survived) stays a string, with a warning; `title={…}` is left alone; a
 *     dropdown in a heading or a link, or a heading inside a dropdown, is warned about;
 *   - a warning is printed for the client compiler only (a production build runs two);
 *   - a dropdown opened mid-sentence around a body of blocks (the preprocessor's rewrite + the
 *     rehype join) is ONE paragraph: the words before, the dropdown (its body intact), the words
 *     after, with the author's space or none; chains, nesting, list items and quotes too; and
 *     everything the preprocessor must not touch comes back byte-for-byte (inline bodies,
 *     own-line dropdowns, fenced code, MDX comments, front matter, files without a dropdown).
 * To change it: a new rule of ../mdx.cjs gets a test beside the cases of its kind, compiled through
 * pipeline() as a page is; a package the plugins come to need joins pipeline() and, like the maths,
 * skips its cases with the reason where a site lacks it. The knobs themselves are in ../README.md,
 * "How to change it".
 * A .cjs file, so it loads whatever the site's package.json says about modules; nothing of a
 * site is read (its config lines are checked by shared/__tests__/siteWiring.test.mjs). Run with
 * `npm run test:shared`, or on its own with `node --test "shared/components/DropDownIC/__tests__/*.test.cjs"`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const plugin = require('../mdx.cjs');

const { BLOCK_ATTRIBUTE, CLIENT_COMPILER, COMPONENT_NAME, JOIN_ATTRIBUTE, LABEL_ATTRIBUTE, PARAGRAPH_CLASS, TITLE_ATTRIBUTE, TITLE_ELEMENT_NAME, asProse, preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc } = plugin;

/** The ESM-only pieces of the pipeline, loaded once; `maths` is null where remark-math / rehype-katex are missing. */
let loaded = null;
async function pipeline() {
	if (!loaded) {
		const [{ compile }, { default: remarkGfm }] = await Promise.all([import('@mdx-js/mdx'), import('remark-gfm')]);
		let maths = null;
		try {
			const [{ default: remarkMath }, { default: rehypeKatex }] = await Promise.all([import('remark-math'), import('rehype-katex')]);
			maths = { remarkMath, rehypeKatex };
		} catch {
			maths = null;
		}
		loaded = { compile, remarkGfm, maths };
	}
	return loaded;
}

/** Skips a test that needs the maths pipeline where remark-math / rehype-katex are missing; true when skipped. */
async function skippedWithoutMaths(t) {
	if ((await pipeline()).maths) return false;
	t.skip('remark-math and rehype-katex are not installed here');
	return true;
}

/** A rehype plugin that keeps the tree after ours ran, so the tests can look at it. */
function capture(into) {
	return () => (tree) => {
		into.tree = tree;
	};
}

/**
 * Compiles `source` as the docs do (math on, when installed) or as a pipeline without
 * remark-math does; returns the JS, the hast (as rehype-katex left it) and the warnings. `data`
 * is the vfile's (the compiler's name).
 */
async function compileMdx(rawSource, { math = true, data, preprocess = true } = {}) {
	const { compile, remarkGfm, maths } = await pipeline();
	const source = preprocess ? preprocessDropDownIc({ fileContent: rawSource, filePath: 'test.mdx' }) : rawSource;
	const useMaths = math && maths;
	const warnings = [];
	const warn = (message) => warnings.push(message);
	const captured = {};
	const code = String(
		await compile(data ? { value: source, data } : source, {
			remarkPlugins: [remarkGfm, ...(useMaths ? [maths.remarkMath] : []), [remarkDropDownIc, { warn }]],
			rehypePlugins: [[rehypeDropDownIc, { warn }], capture(captured), ...(useMaths ? [maths.rehypeKatex] : [])],
			providerImportSource: '@mdx-js/react',
		}),
	);
	return { code, tree: captured.tree, warnings };
}

/** Every node of a tree, depth first. */
function nodes(tree) {
	const out = [];
	(function walk(node) {
		out.push(node);
		(node.children || []).forEach(walk);
	})(tree);
	return out;
}

const dropDowns = (tree) => nodes(tree).filter((n) => (n.type === 'mdxJsxTextElement' || n.type === 'mdxJsxFlowElement') && n.name === COMPONENT_NAME);
const elements = (tree, tagName) => nodes(tree).filter((n) => n.type === 'element' && n.tagName === tagName);
const attribute = (node, name) => (node.attributes || []).find((a) => a.type === 'mdxJsxAttribute' && a.name === name);
const titleChild = (node) => (node.children || []).find((c) => c.type === 'mdxJsxTextElement' && c.name === TITLE_ELEMENT_NAME);
/** The TeX each formula of a node handed to KaTeX (the MathML annotation it writes). */
const texOf = (node) => elements(node, 'annotation').map((a) => a.children.map((c) => c.value).join(''));
const text = (node) =>
	nodes(node)
		.filter((n) => n.type === 'text')
		.map((n) => n.value)
		.join('');

test('a string title is read as the page’s text: maths → KaTeX, **bold** → strong, in a <DropDownIC.Title> child; the attribute is gone', async (t) => {
	if (await skippedWithoutMaths(t)) return;
	const { code, tree, warnings } = await compileMdx('Before the <DropDownIC title="modulus operator ($\\%$) and **bold**">the body</DropDownIC>. After.');
	assert.deepEqual(warnings, []);
	const [dropDown] = dropDowns(tree);
	assert.equal(attribute(dropDown, TITLE_ATTRIBUTE), undefined, 'the attribute was moved');
	const title = titleChild(dropDown);
	assert.ok(title, 'a title child');
	assert.equal(dropDown.children[0], title, 'first among the children');
	assert.ok(nodes(title).some((n) => n.type === 'element' && n.tagName === 'strong'), '**bold** became <strong>');
	assert.deepEqual(texOf(title), ['\\%'], 'KaTeX received the TeX as written');
	assert.match(code, /DropDownIC\.Title, \{\s*children: \["modulus operator \(", _jsxs\(_components\.span, \{\s*className: "katex"/, 'the maths is KaTeX markup inside the title');
	assert.equal(text(dropDown.children[1]), 'the body', 'the body follows');
});

test('the TeX inside $…$ reaches KaTeX untouched: braces, <, an escaped brace; $$…$$ too', async (t) => {
	if (await skippedWithoutMaths(t)) return;
	const { tree, warnings } = await compileMdx('A <DropDownIC title="half is $\\frac{1}{2}$, $x^{2}$, $a < b$, the set $\\{1,2\\}$ and $$\\sqrt{2}$$">b</DropDownIC> c.');
	assert.deepEqual(warnings, []);
	assert.deepEqual(texOf(titleChild(dropDowns(tree)[0])), ['\\frac{1}{2}', 'x^{2}', 'a < b', '\\{1,2\\}', '\\sqrt{2}']);
});

test('a code span in a title is read as code: its { } < and $ stay as written, and the maths after it is still maths', async (t) => {
	if (await skippedWithoutMaths(t)) return;
	const { tree, warnings } = await compileMdx('A <DropDownIC title="the `{x}` operator, `a < b`, the `$5` note {y} and $x^{2}$">b</DropDownIC> c.');
	assert.deepEqual(warnings, []);
	const title = titleChild(dropDowns(tree)[0]);
	assert.deepEqual(elements(title, 'code').filter((c) => !c.properties?.className).map((c) => text(c)), ['{x}', 'a < b', '$5']);
	assert.deepEqual(texOf(title), ['x^{2}'], 'the $ inside the code span did not open a formula');
	assert.ok(text(title).includes(' note {y} and '), '{y} outside the code span is shown');
});

test('a title with maths carries a label for the trigger’s accessible name: its plain text, each formula as written', async (t) => {
	if (await skippedWithoutMaths(t)) return;
	const { tree } = await compileMdx('A <DropDownIC title="the modulus operator ($\\%$) and **bold** `code`">b</DropDownIC> c <DropDownIC title="no maths here">d</DropDownIC> e <DropDownIC title="$x$" label="x squared">f</DropDownIC>.');
	const [maths, plain, own] = dropDowns(tree);
	assert.equal(attribute(maths, LABEL_ATTRIBUTE).value, 'the modulus operator (\\%) and bold code');
	assert.equal(attribute(plain, LABEL_ATTRIBUTE), undefined, 'words alone name the trigger');
	assert.equal(attribute(own, LABEL_ATTRIBUTE).value, 'x squared', 'the author’s own label is kept');
});

test('MDX’s own characters outside the maths are shown, never read: { } < (and a backslash the author wrote stays one)', async (t) => {
	if (await skippedWithoutMaths(t)) return;
	const { tree, warnings, code } = await compileMdx('A <DropDownIC title="a {x} and \\{y\\} and <b> here, then $y^{2}$">b</DropDownIC> c.');
	assert.deepEqual(warnings, []);
	const title = titleChild(dropDowns(tree)[0]);
	assert.equal(text(title).replace(/y\^\{2\}/g, '').replace(/y2/g, ''), 'a {x} and {y} and <b> here, then ');
	assert.deepEqual(texOf(title), ['y^{2}']);
	assert.doesNotMatch(code, /_components\.b\b/, 'no <b> element was made');
});

test('without remark-math (another site’s pipeline) a $ in a title stays a $, and braces are shown, like the page’s own text', async () => {
	const { tree, warnings } = await compileMdx('A <DropDownIC title="costs $5 and $x^{2}$ {y}">b</DropDownIC> c.', { math: false });
	assert.deepEqual(warnings, []);
	assert.equal(text(titleChild(dropDowns(tree)[0])), 'costs $5 and $x^{2}$ {y}');
});

test('a link in a title becomes its words, an image is left out; each is warned about; a reference-style link and a footnote mark are shown as written while the page’s own resolve', async () => {
	const { tree, warnings } = await compileMdx('A <DropDownIC title="see [the rule](/docs/x) and ![pic](/img/x.png) here">b</DropDownIC> c.\n\nA <DropDownIC title="see [the rule][x] and a note[^1]">b</DropDownIC> c, see [the rule][x] and a note[^1].\n\n[x]: /docs/x\n\n[^1]: the note');
	assert.equal(warnings.length, 2, warnings.join('\n'));
	assert.match(warnings[0], /a link in a title is shown as its words/);
	assert.match(warnings[1], /an image cannot sit in a title/);
	const [first, second] = dropDowns(tree);
	assert.equal(text(titleChild(first)), 'see the rule and  here');
	assert.equal(elements(titleChild(first), 'a').length, 0);
	assert.equal(elements(titleChild(first), 'img').length, 0);
	assert.equal(text(titleChild(second)), 'see [the rule][x] and a note[^1]', 'the title is read on its own, without the page’s definitions');
	const paragraph = elements(tree, 'div')[1];
	assert.ok(elements(paragraph, 'a').some((a) => a.properties.href === '/docs/x'), 'the page’s own reference link resolved');
	assert.ok(elements(paragraph, 'sup').length >= 1, 'the page’s own footnote mark became a reference');
});

test('the paragraph holding a dropdown becomes <div class="ddic-paragraph">; other paragraphs stay <p>', async () => {
	const { tree } = await compileMdx('Plain paragraph.\n\nWith a <DropDownIC title="t">b</DropDownIC> inside.\n\nAnother plain one.');
	assert.equal(elements(tree, 'p').length, 2);
	const [div] = elements(tree, 'div');
	assert.ok(div, 'one div');
	assert.deepEqual(div.properties.className, [PARAGRAPH_CLASS]);
	assert.ok(dropDowns(div).length === 1, 'the dropdown is inside it');
	assert.equal(text(div), 'With a tb inside.');
});

test('a tight list item and a table cell keep the dropdown directly inside the <li> / <td> (no <p> to turn into a div)', async () => {
	const { tree, warnings } = await compileMdx('- one <DropDownIC title="t">b</DropDownIC> two\n- three\n\n| a | b |\n|---|---|\n| cell <DropDownIC title="c">d</DropDownIC> | x |');
	assert.deepEqual(warnings, []);
	assert.equal(elements(tree, 'div').length, 0);
	assert.equal(elements(tree, 'p').length, 0);
	const [li] = elements(tree, 'li');
	assert.ok(li.children.some((c) => c.type === 'mdxJsxTextElement' && c.name === COMPONENT_NAME), 'the dropdown is a child of the li');
	const cell = elements(tree, 'td').find((td) => dropDowns(td).length);
	assert.ok(cell, 'the dropdown is inside a td');
});

test('a loose list item and a quote: their paragraph becomes the div', async () => {
	const { tree } = await compileMdx('- one <DropDownIC title="t">b</DropDownIC>\n\n- two\n\n> quoted <DropDownIC title="q">b</DropDownIC> text');
	assert.equal(elements(tree, 'div').length, 2);
	const [blockquote] = elements(tree, 'blockquote');
	assert.ok(blockquote.children.some((c) => c.type === 'element' && c.tagName === 'div'), 'the quote holds the div');
});

test('a dropdown that is a block of its own gets `block`; an author’s own `block` is kept', async () => {
	const { tree, warnings } = await compileMdx(
		['<DropDownIC title="own lines">', '', 'A paragraph.', '', '</DropDownIC>', '', '<DropDownIC title="alone">inline body</DropDownIC>', '', '<DropDownIC title="kept" block={false}>x</DropDownIC>', '', 'Text <DropDownIC title="inline">y</DropDownIC> here.'].join('\n'),
	);
	assert.deepEqual(warnings, []);
	const [ownLines, alone, kept, inline] = dropDowns(tree);
	assert.equal(ownLines.type, 'mdxJsxFlowElement');
	assert.equal(attribute(ownLines, BLOCK_ATTRIBUTE).value, null, 'block (true)');
	assert.ok(elements(ownLines, 'p').length === 1, 'its body keeps its paragraph');
	assert.equal(alone.type, 'mdxJsxFlowElement', 'MDX unravelled the paragraph that held only the element');
	assert.equal(attribute(alone, BLOCK_ATTRIBUTE).value, null);
	assert.equal(attribute(kept, BLOCK_ATTRIBUTE).value.type, 'mdxJsxAttributeValueExpression', 'the author’s block={false} stays');
	assert.equal(attribute(inline, BLOCK_ATTRIBUTE), undefined, 'an inline one gets none');
	assert.equal(elements(tree, 'div').length, 1, 'only the paragraph with the inline one became a div');
});

test('a title that is not one line of prose stays a string, with a warning', async () => {
	const { maths } = await pipeline();
	const cases = [
		['# heading', /starts like a heading/],
		['- item', /starts like a heading/],
		['> quote', /starts like a heading/],
		['1. step', /starts like a heading/],
		['', /starts like a heading/],
		['import duties and tariffs', /does not parse/],
		['export controls', /does not parse/],
		...(maths ? [['costs $5 and {x}', /holds MDX syntax/]] : []), // an unclosed $ leaves {x} unescaped: an expression
	];
	for (const [title, reason] of cases) {
		const { tree, warnings } = await compileMdx(`A <DropDownIC title="${title}">b</DropDownIC> c.`);
		const [dropDown] = dropDowns(tree);
		assert.equal(attribute(dropDown, TITLE_ATTRIBUTE).value, title, `${JSON.stringify(title)} is kept`);
		assert.equal(titleChild(dropDown), undefined);
		assert.equal(warnings.length, 1, `one warning for ${JSON.stringify(title)}`);
		assert.match(warnings[0], /is shown as plain text/);
		assert.match(warnings[0], reason);
	}
});

test('title={…} (an expression) is left alone', async () => {
	const { tree, warnings } = await compileMdx('A <DropDownIC title={<b>x</b>}>b</DropDownIC> c.');
	assert.deepEqual(warnings, []);
	const [dropDown] = dropDowns(tree);
	assert.equal(attribute(dropDown, TITLE_ATTRIBUTE).value.type, 'mdxJsxAttributeValueExpression');
	assert.equal(titleChild(dropDown), undefined);
});

test('a dropdown in a heading or a link, or a heading inside a dropdown, is warned about and left as it is', async () => {
	const { tree, warnings } = await compileMdx(['## Head <DropDownIC title="h">x</DropDownIC>', '', 'A [link <DropDownIC title="l">x</DropDownIC>](/x).', '', '<DropDownIC title="own">', '', '### Inside', '', '</DropDownIC>'].join('\n'));
	assert.equal(warnings.length, 3, warnings.join('\n'));
	assert.match(warnings[0], /inside <h2>/);
	assert.match(warnings[1], /inside <a>/);
	assert.match(warnings[2], /a <h3> sits inside a <DropDownIC>/);
	assert.equal(elements(tree, 'h2').length, 1, 'the heading is unchanged');
	assert.equal(elements(tree, 'div').length, 1, 'the link’s paragraph still became a div (it holds a dropdown)');
});

test('a warning is printed for the client compiler only (a production build also runs the server one)', async () => {
	const source = 'A <DropDownIC title="# x">b</DropDownIC> c.';
	assert.equal((await compileMdx(source, { data: { compilerName: 'server' } })).warnings.length, 0, 'server: silent');
	assert.equal((await compileMdx(source, { data: { compilerName: CLIENT_COMPILER } })).warnings.length, 1, 'client: once');
	assert.equal((await compileMdx(source)).warnings.length, 1, 'no compiler named (the tests): once');
});

test('a dropdown nested in another’s body (through a partial, or inline) is handled like any other', async () => {
	const { tree, warnings } = await compileMdx('A <DropDownIC title="outer">text <DropDownIC title="inner (x)">deep</DropDownIC> more</DropDownIC> c.');
	assert.deepEqual(warnings, []);
	const [outer, inner] = dropDowns(tree);
	assert.equal(text(titleChild(outer)), 'outer');
	assert.ok(titleChild(inner), 'the inner title was read too');
	assert.equal(elements(tree, 'div').length, 1);
});

test('asProse: one line; {, } and < escaped outside the maths and outside code spans (an existing escape kept); everywhere but code when maths is off', () => {
	assert.equal(asProse('  a\n  b   c '), 'a b c');
	assert.equal(asProse('{x} <y> \\{z\\}'), '\\{x\\} \\<y> \\{z\\}');
	assert.equal(asProse('{x} $\\frac{1}{2}$ <y> $$a<b$$ {z}'), '\\{x\\} $\\frac{1}{2}$ \\<y> $$a<b$$ \\{z\\}');
	assert.equal(asProse('costs \\$5 {x}'), 'costs \\$5 \\{x\\}', 'an escaped dollar is a dollar');
	assert.equal(asProse('C:\\\\{dir}'), 'C:\\\\\\{dir\\}', 'a brace after an escaped backslash is still escaped');
	assert.equal(asProse('the `{x}` and `a < b` and `$5` {y}'), 'the `{x}` and `a < b` and `$5` \\{y\\}', 'code spans are copied as they are');
	assert.equal(asProse('``a ` b`` {x}'), '``a ` b`` \\{x\\}', 'a code span closes at a run of the same length');
	assert.equal(asProse('$x$$y<z$ {w}'), '$x$$y<z$ \\{w\\}', 'a maths span closes at a run of its opener’s length too');
	assert.equal(asProse('{x} $\\frac{1}{2}$ <y> `{z}`', false), '\\{x\\} $\\frac\\{1\\}\\{2\\}$ \\<y> `{z}`', 'maths off: everything but code is prose');
});

/** The shape of a joined paragraph, for comparison: text as is, a dropdown as [title | body tags]. */
function shape(node) {
	if (node.type === 'text') return node.value.replace(/\s+/g, ' ');
	if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && node.name === COMPONENT_NAME) {
		const title = text(titleChild(node));
		const body = node.children.filter((c) => c.type === 'element').map((c) => c.tagName);
		return `[${title}|${body.join(',')}]`;
	}
	return (node.children || []).map(shape).join('');
}

test('mid-sentence with a body of blocks: ONE paragraph — the words before, the dropdown with its code block, the words after', async () => {
	const source = 'This is a <DropDownIC title="Python code block" defaultOpen> \n\n```python\nx = 1\n```\n\n</DropDownIC>  and is meant to show what it looks like in a code block.';
	const { tree, warnings } = await compileMdx(source);
	assert.deepEqual(warnings, []);
	const divs = elements(tree, 'div').filter((d) => (d.properties.className || []).includes(PARAGRAPH_CLASS));
	assert.equal(divs.length, 1, 'one paragraph');
	assert.equal(shape(divs[0]), 'This is a [Python code block|pre] and is meant to show what it looks like in a code block.');
	const [dropDown] = dropDowns(tree);
	assert.equal(dropDown.type, 'mdxJsxTextElement', 'inline again');
	assert.equal(attribute(dropDown, JOIN_ATTRIBUTE), undefined, 'the marker is gone');
	assert.equal(attribute(dropDown, BLOCK_ATTRIBUTE), undefined, 'not a block of its own');
	assert.ok(attribute(dropDown, 'defaultOpen'), 'the author’s attributes are kept');
	assert.equal(elements(tree, 'p').length, 0, 'no stray paragraph left over');
});

test('mid-sentence: the space the author wrote, or none (a word or a comma against the tag)', async () => {
	const { tree } = await compileMdx('A word<DropDownIC title="t">\n\nbody\n\n</DropDownIC>, then more.');
	assert.equal(shape(elements(tree, 'div')[0]), 'A word[t|p], then more.');
});

test('mid-sentence: words on one side only', async () => {
	const before = await compileMdx('Words before <DropDownIC title="t">\n\nbody\n\n</DropDownIC>\n\nNext paragraph.');
	assert.equal(shape(elements(before.tree, 'div')[0]), 'Words before [t|p]');
	assert.equal(elements(before.tree, 'p').filter((p) => text(p) === 'Next paragraph.').length, 1, 'the next paragraph stays its own');
	const after = await compileMdx('<DropDownIC title="t">\n\nbody\n\n</DropDownIC> then words.');
	assert.equal(shape(elements(after.tree, 'div')[0]), '[t|p] then words.');
});

test('mid-sentence: two in one sentence, one inside another, in a list item and in a quote', async () => {
	const chain = await compileMdx('A <DropDownIC title="one">\n\nb1\n\n</DropDownIC> middle <DropDownIC title="two">\n\nb2\n\n</DropDownIC> end.');
	assert.equal(shape(elements(chain.tree, 'div')[0]), 'A [one|p] middle [two|p] end.');
	const nested = await compileMdx('Outer <DropDownIC title="o">\n\nInner <DropDownIC title="i">\n\nib\n\n</DropDownIC> inner after.\n\n</DropDownIC> outer after.');
	const outer = elements(nested.tree, 'div')[0];
	assert.equal(shape(outer), 'Outer [o|div] outer after.');
	assert.equal(shape(elements(outer, 'div')[1]), 'Inner [i|p] inner after.', 'the inner paragraph (elements() lists the outer one first)');
	const list = await compileMdx('- item text <DropDownIC title="t">\n\n  body\n\n  </DropDownIC> and more\n- second');
	assert.equal(shape(elements(elements(list.tree, 'li')[0], 'div')[0]), 'item text [t|p] and more');
	const quote = await compileMdx('> quoted <DropDownIC title="t">\n>\n> body\n>\n> </DropDownIC> after');
	assert.equal(shape(elements(elements(quote.tree, 'blockquote')[0], 'div')[0]), 'quoted [t|p] after');
});

test('mid-sentence: words after that would start a list or a heading stay words', async () => {
	const { tree } = await compileMdx('A <DropDownIC title="t">\n\nbody\n\n</DropDownIC> - not a list');
	assert.equal(shape(elements(tree, 'div')[0]), 'A [t|p] - not a list');
	assert.equal(elements(tree, 'ul').length, 0);
});

test('the preprocessor leaves everything else byte-for-byte as it was', () => {
	const untouched = [
		'No dropdown here.\n\n```js\nx\n```',
		'Some <DropDownIC title="t">inline body</DropDownIC> text.',
		'Some <DropDownIC title="t">\ninline body\n</DropDownIC> text.',
		'Para.\n\n<DropDownIC title="t">\n\nbody\n\n</DropDownIC>\n\nNext.',
		'```mdx\nThis is a <DropDownIC title="t">\n\nbody\n\n</DropDownIC> and more\n```',
		'~~~\nThis is a <DropDownIC title="t">\n\nbody\n\n</DropDownIC> and more\n~~~',
		'{/*\nThis is a <DropDownIC title="t">\n\nbody\n\n</DropDownIC> and more\n*/}',
		'---\ntitle: a <DropDownIC title="t">\n\ndescription: x\n</DropDownIC> y\n---\n\nText.',
		'Intro.\n\n- <DropDownIC title="t">\n\n  body\n\n  </DropDownIC>\n\n- second',
		'1. ```mdx\n   This is a <DropDownIC title="t">\n\n   body\n\n   </DropDownIC> and more\n   ```',
		'Para.\n\n[x]: /docs/x\n<DropDownIC title="t">\n\nbody\n\n</DropDownIC>\n\nNext.',
		'Write `This is a <DropDownIC title="t">` in code.\n\nbody\n\n</DropDownIC> x',
	];
	for (const source of untouched) assert.equal(preprocessDropDownIc({ fileContent: source, filePath: 'x.md' }), source, source);
});

test('the preprocessor’s rewrite: the words, the marked tag and the body on lines of their own, container marks kept', () => {
	assert.equal(
		preprocessDropDownIc({ fileContent: 'This is a <DropDownIC title="a > b" defaultOpen> \n\nbody\n\n</DropDownIC>  and more.' }),
		`This is a\n\n<DropDownIC title="a > b" defaultOpen ${JOIN_ATTRIBUTE}="before after">\n\nbody\n\n</DropDownIC>\n\nand more.`,
	);
	assert.equal(
		preprocessDropDownIc({ fileContent: '> quoted <DropDownIC title="t">\n>\n> body\n>\n> </DropDownIC> after' }),
		`> quoted\n>\n> <DropDownIC title="t" ${JOIN_ATTRIBUTE}="before after">\n>\n> body\n>\n> </DropDownIC>\n>\n> after`,
	);
});

test('mid-sentence: the tag on the line just under the words, the words on the line just under the closing tag (one paragraph in Markdown)', async () => {
	const { tree } = await compileMdx('Some words and this one holds a\n<DropDownIC title="t">\n\nbody\n\n</DropDownIC>\nand the sentence goes on.');
	assert.equal(shape(elements(tree, 'div')[0]), 'Some words and this one holds a [t|p] and the sentence goes on.');
	assert.equal(elements(tree, 'p').filter((p) => /holds a|goes on/.test(text(p))).length, 0, 'no words left in a paragraph of their own');
	const heading = await compileMdx('### A heading\n<DropDownIC title="t">\n\nbody\n\n</DropDownIC>\n\nNext.');
	assert.equal(elements(heading.tree, 'div').length, 0, 'a heading above is not words of the sentence');
});

/** Every dropdown of a compiled tree has lost the preprocessor's mark. */
function assertNoMarks(tree) {
	for (const dropDown of dropDowns(tree)) assert.equal(attribute(dropDown, JOIN_ATTRIBUTE), undefined, 'no join attribute reaches the component');
}

test('list items: one that starts with a dropdown keeps it (and the list); a tag on an item’s continuation line joins the item’s words', async () => {
	const starts = await compileMdx('- <DropDownIC title="t">\n\n  body\n\n  </DropDownIC> and more\n- second');
	const items = elements(starts.tree, 'li');
	assert.equal(items.length, 2, 'the list is whole');
	assert.equal(shape(elements(items[0], 'div')[0]), '[t|p] and more');
	assert.equal(text(items[1]).trim(), 'second');
	const continuation = await compileMdx('- a list item\n  <DropDownIC title="t">\n\n  body\n\n  </DropDownIC>\n\nNext.');
	const [item] = elements(continuation.tree, 'li');
	assert.equal(shape(elements(item, 'div')[0]), 'a list item [t|p]', 'the dropdown stays in the item, after its words');
	const ordered = await compileMdx('1. item\n\n   <DropDownIC title="t">\n\n   body\n\n   </DropDownIC> and more\n2. second');
	assert.equal(elements(ordered.tree, 'li').length, 2, 'the second item is an item, not words');
	assertNoMarks(ordered.tree);
});

test('words moved after a closing tag stay words: a number, a list mark, import / export, a directive, a fence', async () => {
	const cases = [
		['</DropDownIC> 2007. It had four sections.', '[t|p] 2007. It had four sections.'],
		['</DropDownIC> 2) is wrong.', '[t|p] 2) is wrong.'],
		['</DropDownIC> - not a list', '[t|p] - not a list'],
		['</DropDownIC> import this, as I said.', '[t|p] import this, as I said.'],
		['</DropDownIC> export the data later.', '[t|p] export the data later.'],
		['</DropDownIC> :::note is a directive', '[t|p] :::note is a directive'],
		['</DropDownIC> ~~~ tildes', '[t|p] ~~~ tildes'],
	];
	for (const [closing, expected] of cases) {
		const { tree } = await compileMdx(`<DropDownIC title="t">\n\nbody\n\n${closing}`);
		assert.equal(shape(elements(tree, 'div')[0]), expected, closing);
		assert.equal(elements(tree, 'ul').length + elements(tree, 'ol').length, 0, closing);
	}
});

test('back-to-back dropdowns, and two closed on one line, stay one sentence with the author’s spaces', async () => {
	const backToBack = await compileMdx('A <DropDownIC title="one">\n\nb1\n\n</DropDownIC> <DropDownIC title="two">\n\nb2\n\n</DropDownIC> end.');
	assert.equal(shape(elements(backToBack.tree, 'div')[0]), 'A [one|p] [two|p] end.');
	assertNoMarks(backToBack.tree);
	const twoClosed = await compileMdx('Outer <DropDownIC title="o">\n\nInner <DropDownIC title="i">\n\nib\n\n</DropDownIC></DropDownIC> after.');
	const outer = elements(twoClosed.tree, 'div')[0];
	assert.equal(shape(outer), 'Outer [o|div] after.');
	assert.equal(shape(elements(outer, 'div')[1]), 'Inner [i|p]');
	assertNoMarks(twoClosed.tree);
});

test('code spans and list-item fences do not confuse the preprocessor about comments and fences', async () => {
	const comment = await compileMdx('Write `{/*` to open a comment.\n\nThis is a <DropDownIC title="t">\n\nbody\n\n</DropDownIC> and more.');
	assert.equal(shape(elements(comment.tree, 'div')[0]), 'This is a [t|p] and more.');
	const span = await compileMdx('```js``` is inline code.\n\nThis is a <DropDownIC title="t">\n\nbody\n\n</DropDownIC> and more.');
	assert.equal(shape(elements(span.tree, 'div')[0]), 'This is a [t|p] and more.');
	const fence = await compileMdx('- ```js\n  x = 1\n  ```\n\nThis is a <DropDownIC title="t">\n\nbody\n\n</DropDownIC> and more.');
	assert.equal(shape(elements(fence.tree, 'div')[0]), 'This is a [t|p] and more.');
});

test('a link definition or a heading next to a dropdown is not words of its sentence', async () => {
	const definition = await compileMdx('Para.\n\n[x]: /docs/x\n<DropDownIC title="t">\n\nbody\n\n</DropDownIC>\n\nNext.');
	assert.equal(elements(definition.tree, 'div').length, 0, 'no paragraph is pulled in');
	assert.equal(attribute(dropDowns(definition.tree)[0], BLOCK_ATTRIBUTE).value, null, 'a dropdown of its own');
	const below = await compileMdx('Words <DropDownIC title="t">\n\nbody\n\n</DropDownIC>\n[x]: /docs/x\n\nNext.');
	assert.equal(shape(elements(below.tree, 'div')[0]), 'Words [t|p]');
	assert.equal(elements(below.tree, 'p').filter((p) => text(p) === 'Next.').length, 1);
});
