/**
 * mdx.cjs — the MDX side of <DropDownIC> (index.jsx next to this file), the inline dropdown of
 * the notes: two small plugins for the docs, blog and pages pipelines, and a preprocessor for
 * the site's markdown. A site's docusaurus.config.js takes them from shared/wiring/index.cjs:
 *
 *     const { preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc } = require('./shared/wiring/index.cjs');
 *     …  markdown: { preprocessor: preprocessDropDownIc },
 *     …  remarkPlugins: [remarkMath, remarkDropDownIc],
 *        rehypePlugins: [rehypeDropDownIc, [rehypeKatex, {…}]],
 *
 * (a site with a preprocessor of its own runs both: `(args) => preprocessDropDownIc({ ...args,
 * fileContent: own(args) })`)
 * A .cjs file on purpose: the config `require`s it, whatever a site's package.json
 * says about modules, and the tests' JSX loader leaves it alone. No dependencies: it walks the
 * trees itself and parses a title with the page's own processor. The plugins look for the JSX
 * name DropDownIC (COMPONENT_NAME): a note imports the component under that name.
 *
 * WHY THEY EXIST
 *   1. A title with maths. The notes are MDX, and in MDX `title="…"` is a plain string: nothing
 *      inside an attribute is read as markdown, so `$\%$` there would stay four characters. The
 *      remark plugin (remarkDropDownIc) reads the string with THE PAGE'S OWN PARSER — the same
 *      maths, emphasis, code spans and escapes as the surrounding text — and moves the result
 *      into the element as a child `<DropDownIC.Title>`, which the component shows as the
 *      underlined words. remark-math's inline maths then goes through rehype-katex exactly like
 *      the paragraph's own, at build time (no KaTeX in the browser). In a pipeline without
 *      remark-math (another site's pages, say) a `$` in a title stays a `$`, as it does in that
 *      page's text.
 *   2. A box in the middle of a paragraph. The open dropdown is a block (paragraphs, code,
 *      maths) that must sit INSIDE the paragraph: the words before it stay above, the words
 *      after it carry on below. A <div> inside a <p> is not HTML — the browser would close the
 *      <p> at the <div> and React would see a different tree than it rendered. The rehype
 *      plugin (rehypeDropDownIc) turns every <p> holding a dropdown into
 *      <div class="ddic-paragraph">, which the component's stylesheet draws with a paragraph's
 *      margins. A dropdown written on lines of its own (not inside a paragraph) gets the
 *      attribute `block`, so the component draws it as a paragraph of its own.
 *   3. A body of blocks in the middle of a sentence. In MDX a tag opened inside a paragraph
 *      must close inside it, so
 *          This is a <DropDownIC title="code">
 *
 *          ```python …```
 *
 *          </DropDownIC> and the sentence goes on.
 *      fails to parse ("Expected a closing tag for `<DropDownIC>` … before the end of
 *      `paragraph`"). The preprocessor (preprocessDropDownIc) rewrites exactly that shape —
 *      an opening tag that ends a line with words before it (or stands on the line just under
 *      them), or a closing tag that starts a line with words after it (or has them on the line
 *      just below), around a body that holds a blank line or a fence — into the
 *      form MDX reads (the words, the tag and the body on lines of their own) and marks the
 *      tag with JOIN_ATTRIBUTE; the rehype plugin then joins the words before, the dropdown
 *      and the words after back into ONE paragraph, as written. Anything else is left
 *      byte-for-byte as it was: fenced code, MDX comments, front matter, a dropdown whose
 *      body is inline (it parses already), one on lines of its own.
 *
 * A TITLE IS PROSE  Words, emphasis, code spans and maths. Before the parse, `{`, `}` and `<`
 *   OUTSIDE `$…$` and outside code spans are backslash-escaped, so a title never becomes an
 *   expression or a JSX tag (inside `$…$` they stay as written: `$\frac{1}{2}$`, `$a < b$` —
 *   remark-math takes a span raw; inside backticks too, as CommonMark does). Whether `$…$` is
 *   maths at all is learnt from the parser itself on the first title (without remark-math
 *   the whole title is prose). A link in a title becomes its words (the
 *   trigger is a button; a link inside it could not work) and an image is dropped, each with a
 *   warning; a reference-style link or a footnote mark is shown as written (the title is read
 *   on its own, where the page's definitions are out of sight). A title holding maths also
 *   gets a `label`: its plain text with each formula's TeX as written, which the component
 *   gives the trigger as its accessible name (a screen reader gets nothing from KaTeX's
 *   markup).

 *
 * WHAT IS LEFT ALONE  `title={…}` (an expression: a JSX title from a .jsx page) is not touched.
 *   A title that does not read as one line of prose — it starts like a heading, a list, a
 *   quote, or `import ` / `export `, or is empty, or still holds MDX syntax — stays a plain
 *   string, with a warning. A dropdown inside a heading or a link is warned about (its box
 *   would open as part of the heading; a button cannot live in a link), and so is a heading
 *   inside a dropdown's body (it would land in the page's table of contents, unreachable).
 *
 * WARNINGS  go to the console (the `warn` option, console.warn by default): Docusaurus
 *   discards a vfile's messages. One per title or dropdown concerned; a production build
 *   compiles every file twice (server and client), and a warning is printed for the client
 *   compiler only, so it shows once.
 *
 * HOW TO CHANGE IT
 *   The element's name: COMPONENT_NAME (what the notes import it as — keep the two equal). The
 *   title child's name:
 *   TITLE_ELEMENT_NAME (the component's DropDownIC.Title). The paragraph class:
 *   PARAGRAPH_CLASS (styles.module.css paints it). The characters a title may not use as MDX
 *   syntax: PROSE_SYNTAX. What a title may not hold: UNWRAPPED_IN_TITLE / DROPPED_FROM_TITLE.
 *   The accessible name of a maths title: LABEL_ATTRIBUTE / plainText(). The mid-sentence
 *   rewrite: preprocessDropDownIc (the shapes it reads: OPEN_AT_LINE_END, CLOSE_AT_LINE_START)
 *   and joinParagraphs. Where warnings go: the `warn` option. Tests: __tests__/mdx.test.cjs
 *   (`npm run test:shared`).
 */

/** The JSX name the authors write and the component is registered under. */
const COMPONENT_NAME = 'DropDownIC';

/** The child element the title is moved into (the component reads it: DropDownIC.Title). */
const TITLE_ELEMENT_NAME = `${COMPONENT_NAME}.Title`;

/** The attribute holding the title, and the one the rehype plugin adds to a block-level dropdown. */
const TITLE_ATTRIBUTE = 'title';
const BLOCK_ATTRIBUTE = 'block';

/** The attribute a maths title gets: its plain text, for the trigger's accessible name. */
const LABEL_ATTRIBUTE = 'label';

/**
 * The attribute the preprocessor puts on a dropdown written in the middle of a sentence, read
 * (and removed) by the rehype plugin: which neighbours to join, and whether a space separated
 * them — JOIN.before / JOIN.after, or the -tight forms when the words touched the tag.
 */
const JOIN_ATTRIBUTE = 'data-ddic-join';
const JOIN = Object.freeze({ before: 'before', beforeTight: 'before-tight', after: 'after', afterTight: 'after-tight' });

/** A quoted, braced or bare attribute of an opening tag (what the preprocessor's patterns accept). */
const ATTRIBUTE_SOURCE = String.raw`\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|\{[^{}]*\}))?`;

/** An opening <DropDownIC …> (not self-closing) or a closing </DropDownIC>. */
const TAG_SOURCE = String.raw`<${COMPONENT_NAME}(?:${ATTRIBUTE_SOURCE})*\s*>|</${COMPONENT_NAME}\s*>`;

/** Container marks at the start of a line: blockquote markers, a list marker, indentation. */
const CONTAINER_MARKS = /^(?:\s*>)*\s*(?:(?:[-*+]|\d{1,9}[.)])\s+)?/;

/** A list marker at the end of a line's container marks (the line starts a list item). */
const LIST_MARKER_AT_END = /(?:[-*+]|\d{1,9}[.)])\s+$/;

/** A code fence opener after any container marks (list markers too): (marks)(fence)(info). */
const FENCE_OPEN = /^((?:\s*>)*\s*(?:(?:[-*+]|\d{1,9}[.)])\s+)?)(`{3,}|~{3,})(.*)$/;

/** A line that is not words of a paragraph, whatever surrounds it (a heading, a table, a tag,
 *  an expression, display maths, a directive, a rule or setext underline, a link definition, a fence). */
const NOT_WORDS = /^(?:#|\||<|\{|\$\$|:::|---|\*\*\*|___|=+\s*$|-+\s*$|\[[^\]]+\]:|`{3,}|~{3,})/;

/** Words that would start something else at the start of a line (a list, a heading, a quote, ESM,
 *  a fence, a directive, a table, a definition, a tag or an expression). */
const BLOCK_START = /^(?:[-*+](?=\s|$)|\d{1,9}[.)](?=\s|$)|#{1,6}(?=\s|$)|>|import\s|export\s|`{3,}|~{3,}|:::|=+\s*$|\||\[[^\]]+\]:|<|\{)/;

/** Put before such words: an empty MDX expression, so the line is plain words of a paragraph. */
const TEXT_GUARD = "{''}";

/** The class of a paragraph that became a <div> because it holds a dropdown. */
const PARAGRAPH_CLASS = 'ddic-paragraph';

/** The MDX node types a JSX element can have: inline (text) and block (flow). */
const JSX_TEXT = 'mdxJsxTextElement';
const JSX_FLOW = 'mdxJsxFlowElement';

/** MDX's own nodes: a title that still holds one after the parse is not prose. */
const MDX_NODE_TYPES = [JSX_TEXT, JSX_FLOW, 'mdxTextExpression', 'mdxFlowExpression', 'mdxjsEsm'];

/**
 * Characters that would turn a title into MDX syntax (an expression, a JSX tag) and are
 * backslash-escaped outside `$…$` and outside code spans before the title is read (one the
 * author escaped already is left alone). Inside maths they are TeX; inside backticks, code.
 */
const PROSE_SYNTAX = ['{', '}', '<'];

/** The maths delimiter remark-math reads (a run of them opens a span; the next run of the same length closes it; `\$` is a dollar). */
const MATH_DELIMITER = '$';

/** The code span delimiter (a run of them opens a span; the next run of the same length closes it). */
const CODE_DELIMITER = '`';

/** Nodes a title may hold only as their words (a link cannot sit inside the button). */
const UNWRAPPED_IN_TITLE = ['link'];

/** Nodes a title cannot hold at all, and their names in a warning. */
const DROPPED_FROM_TITLE = { image: 'an image' };

/** The node remark-math makes of `$…$`. */
const INLINE_MATH = 'inlineMath';

/** Elements a dropdown must not sit inside (warned about, not changed). */
const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const FORBIDDEN_WRAPPERS = ['a', ...HEADING_TAGS];

/** The compiler whose warnings are printed (a production build also runs 'server' over every file). */
const CLIENT_COMPILER = 'client';

const PLUGIN_NAME = 'dropdown-ic';

/** Is this node a <DropDownIC> element (inline or block)? */
function isDropDown(node) {
	return (node.type === JSX_TEXT || node.type === JSX_FLOW) && node.name === COMPONENT_NAME;
}

/** Depth-first over `children`; `visit(node, ancestors)` with the nearest ancestor first. */
function walk(node, visit, ancestors = []) {
	visit(node, ancestors);
	if (!Array.isArray(node.children)) return;
	const inner = [node, ...ancestors];
	for (const child of node.children) walk(child, visit, inner);
}

/** Every node below `node` (not `node` itself). */
function descendants(node) {
	const out = [];
	walk(node, (child) => {
		if (child !== node) out.push(child);
	});
	return out;
}

/** Does this node hold a dropdown anywhere below it? */
function containsDropDown(node) {
	return descendants(node).some(isDropDown);
}

/** The parse of a title string sits at the title's own line 1: that place means nothing in the file. */
function stripPositions(node) {
	delete node.position;
	if (Array.isArray(node.children)) node.children.forEach(stripPositions);
	return node;
}

/** The run of `delimiter` starting at `index` in `line`. */
function runAt(line, index, delimiter) {
	let run = '';
	while (line[index + run.length] === delimiter) run += delimiter;
	return run;
}

/**
 * The title as the parser should see it: one line; `{ } <` escaped except inside `$…$` (with
 * maths on: a run of `$` opens a span and the next run of the same length closes it, as
 * remark-math reads them) and inside a code span (the same rule with backticks); a backslash keeps its next character
 * as written, so `\$` and `\{` pass untouched.
 */
function asProse(title, mathOn = true) {
	const line = title.replace(/\s+/g, ' ').trim();
	let out = '';
	let mathOpener = ''; // the `$` run that opened the maths being copied, or ''
	let codeOpener = ''; // the backtick run that opened the code span being copied, or ''
	for (let i = 0; i < line.length; i += 1) {
		const char = line[i];
		if (char === CODE_DELIMITER) {
			const run = runAt(line, i, CODE_DELIMITER);
			if (!codeOpener) codeOpener = run;
			else if (run === codeOpener) codeOpener = '';
			out += run;
			i += run.length - 1;
		} else if (codeOpener) {
			out += char;
		} else if (char === '\\' && i + 1 < line.length) {
			out += char + line[i + 1];
			i += 1;
		} else if (mathOn && char === MATH_DELIMITER) {
			const run = runAt(line, i, MATH_DELIMITER);
			if (!mathOpener) mathOpener = run;
			else if (run === mathOpener) mathOpener = '';
			out += run;
			i += run.length - 1;
		} else if (!mathOpener && PROSE_SYNTAX.includes(char)) {
			out += `\\${char}`;
		} else {
			out += char;
		}
	}
	return out;
}

/** Does this processor read `$…$` as maths (remark-math is on)? Asked of the parser itself. */
function parsesMath(processor) {
	try {
		const root = processor.parse('$x$');
		return root.children[0]?.children?.[0]?.type === 'inlineMath';
	} catch {
		return false;
	}
}

/**
 * A title's phrasing nodes read as markdown by `processor` (the page's parser), tidied for the
 * trigger, or null with a reason when the text is not one line of prose.
 */
function parseTitle(processor, title, mathOn) {
	let root;
	try {
		root = processor.parse(asProse(title, mathOn));
	} catch {
		return { nodes: null, reason: 'it does not parse as markdown (a title starting with "import " or "export ", say)' };
	}
	const [only] = root.children;
	if (root.children.length !== 1 || only.type !== 'paragraph') {
		return { nodes: null, reason: 'it starts like a heading, a list or a quote, or it is empty' };
	}
	if (descendants(only).some((node) => MDX_NODE_TYPES.includes(node.type))) {
		return { nodes: null, reason: 'it holds MDX syntax (an expression or a tag)' };
	}
	return { nodes: only.children.map(stripPositions), reason: null };
}

/**
 * Links in a title become their words and images, footnote marks and raw HTML go, so the
 * trigger holds nothing a click or a key could reach. Returns the notes to warn about.
 */
function tidyTitle(nodes) {
	const notes = [];
	const tidy = (list) =>
		list.flatMap((node) => {
			if (UNWRAPPED_IN_TITLE.includes(node.type)) {
				notes.push('a link in a title is shown as its words (a link cannot sit inside the dropdown\'s button)');
				return tidy(node.children || []);
			}
			if (DROPPED_FROM_TITLE[node.type]) {
				notes.push(`${DROPPED_FROM_TITLE[node.type]} cannot sit in a title and was left out`);
				return [];
			}
			if (Array.isArray(node.children)) node.children = tidy(node.children);
			return [node];
		});
	return { nodes: tidy(nodes), notes };
}

/** The words of a title's nodes, each formula and code span as its source (for the trigger's accessible name). */
function plainText(nodes) {
	return nodes
		.map((node) => {
			if (typeof node.value === 'string') return node.value;
			return Array.isArray(node.children) ? plainText(node.children) : '';
		})
		.join('');
}

/** Does the title hold a formula? Then the trigger needs a spoken name of its own. */
function holdsMath(nodes) {
	return nodes.some((node) => node.type === INLINE_MATH || (Array.isArray(node.children) && holdsMath(node.children)));
}

/** The element the title moves into, first among the dropdown's children. */
function titleElement(children) {
	return { type: JSX_TEXT, name: TITLE_ELEMENT_NAME, attributes: [], children };
}

/** The `title="…"` attribute of a dropdown, when it is a plain string (an expression is left alone). */
function stringTitleAttribute(node) {
	const attribute = (node.attributes || []).find((a) => a.type === 'mdxJsxAttribute' && a.name === TITLE_ATTRIBUTE);
	return attribute && typeof attribute.value === 'string' ? attribute : null;
}

/** A warning for the terminal, naming the file — printed once per file (the client compiler's). */
function report(file, warn, text) {
	const compiler = file.data?.compilerName;
	if (compiler && compiler !== CLIENT_COMPILER) return;
	warn(`[${PLUGIN_NAME}] ${file.path || 'MDX'}: ${text}`);
}

/**
 * remarkDropDownIc — reads every string `title` with the page's own parser and moves it into
 * a <DropDownIC.Title> child (see the file comment). Options: { warn } (default console.warn).
 */
function remarkDropDownIc(options = {}) {
	const processor = this;
	const warn = options.warn || ((message) => console.warn(message));
	let mathOn = null; // learnt from the parser on the first title (never in the attacher: parsing freezes the processor)
	return (tree, file) => {
		walk(tree, (node) => {
			if (!isDropDown(node)) return;
			const attribute = stringTitleAttribute(node);
			if (!attribute) return;
			if (mathOn === null) mathOn = parsesMath(processor);
			const parsed = parseTitle(processor, attribute.value, mathOn);
			if (!parsed.nodes) {
				report(file, warn, `the <${COMPONENT_NAME}> title ${JSON.stringify(attribute.value)} is shown as plain text: ${parsed.reason}.`);
				return;
			}
			const { nodes, notes } = tidyTitle(parsed.nodes);
			for (const note of notes) report(file, warn, `in the <${COMPONENT_NAME}> title ${JSON.stringify(attribute.value)}, ${note}.`);
			node.attributes = node.attributes.filter((a) => a !== attribute);
			if (holdsMath(nodes) && !node.attributes.some((a) => a.type === 'mdxJsxAttribute' && a.name === LABEL_ATTRIBUTE)) {
				node.attributes.push({ type: 'mdxJsxAttribute', name: LABEL_ATTRIBUTE, value: plainText(nodes) });
			}
			node.children = [titleElement(nodes), ...(node.children || [])];
		});
	};
}

/** A line with its inline code spans and one-line MDX comments blanked out (positions kept). */
function visibleText(line) {
	return line
		.replace(/(`+)[^`]*?\1/g, (span) => ' '.repeat(span.length))
		.replace(/\{\/\*.*?\*\/\}/g, (comment) => ' '.repeat(comment.length));
}

/** The dropdown tags of a line, in order: { index, end, closing } (code spans and comments ignored). */
function tagsOf(line) {
	const text = visibleText(line);
	const pattern = new RegExp(TAG_SOURCE, 'g');
	const tags = [];
	let match;
	while ((match = pattern.exec(text))) tags.push({ index: match.index, end: match.index + match[0].length, closing: match[0].startsWith('</') });
	return tags;
}

/** The fence a line opens ('```', '~~~~' …), or null. A backtick fence's info string holds no backtick. */
function fenceOpenedBy(line) {
	const match = FENCE_OPEN.exec(line);
	if (!match) return null;
	if (match[2][0] === '`' && match[3].includes('`')) return null;
	return match[2];
}

/** Does this line close a fence opened with `fence`? */
function closesFence(line, fence) {
	const match = FENCE_OPEN.exec(line);
	return Boolean(match && match[2][0] === fence[0] && match[2].length >= fence.length && match[3].trim() === '');
}

/**
 * The lines the preprocessor must not read: front matter, fenced code (any container marks
 * before the fence, list markers too) and MDX comments {/* … *\/} that span lines. One flag
 * per line. Code spans are ignored when looking for a comment's start or end.
 */
function skippedLines(lines) {
	const skipped = new Array(lines.length).fill(false);
	let i = 0;
	if (lines[0] !== undefined && /^---\s*$/.test(lines[0])) {
		skipped[0] = true;
		for (i = 1; i < lines.length; i += 1) {
			skipped[i] = true;
			if (/^---\s*$/.test(lines[i])) {
				i += 1;
				break;
			}
		}
	}
	let fence = null;
	let inComment = false;
	for (; i < lines.length; i += 1) {
		const line = lines[i];
		if (fence) {
			skipped[i] = true;
			if (closesFence(line, fence)) fence = null;
			continue;
		}
		const text = line.replace(/(`+)[^`]*?\1/g, (span) => ' '.repeat(span.length));
		if (inComment) {
			skipped[i] = true;
			if (text.includes('*/}')) inComment = false;
			continue;
		}
		const opened = fenceOpenedBy(line);
		if (opened) {
			skipped[i] = true;
			fence = opened;
			continue;
		}
		const start = text.lastIndexOf('{/*');
		if (start >= 0 && !text.includes('*/}', start)) {
			skipped[i] = true;
			inComment = true;
		}
	}
	return skipped;
}

/** Where the dropdown opened at (line `from`, column `after`) closes: { line, index, end }, or null. */
function matchingClose(lines, skipped, from, after) {
	let depth = 1;
	for (let j = from; j < lines.length; j += 1) {
		if (skipped[j]) continue;
		for (const tag of tagsOf(lines[j])) {
			if (j === from && tag.index < after) continue;
			depth += tag.closing ? -1 : 1;
			if (depth === 0) return { line: j, index: tag.index, end: tag.end };
		}
	}
	return null;
}

/** Does the body between the two lines hold a blank line or a fence (where an inline tag would fail)? */
function bodyBreaksParagraph(lines, skipped, open, close) {
	for (let k = open + 1; k < close; k += 1) {
		if (skipped[k] || lines[k].replace(/^[\s>]*/, '') === '') return true;
	}
	return false;
}

/** A line's container marks (blockquote markers, a list marker, indentation). */
function containerOf(line) {
	return CONTAINER_MARKS.exec(line)[0];
}

/** The marks of a continuation line in the same container: a list marker becomes the spaces it stands for. */
function continuationOf(marks) {
	return marks.replace(/(?:[-*+]|\d{1,9}[.)])(?=\s+$)/, (marker) => ' '.repeat(marker.length));
}

/** A blank line in that container: its blockquote markers only. */
function blankLineOf(marks) {
	return (/^(?:\s*>)*/.exec(marks)[0]).trimEnd();
}

/**
 * Is line `k` words of the paragraph a tag in the container `marks` belongs to? Not blank, not
 * skipped, not a heading, table, tag, expression, maths, directive, rule or definition; in the
 * same container (a list marker counts as the spaces it stands for); and, when `newItemEnds` is
 * set, not the first line of another list item. (In Markdown, lines with no blank line between
 * them are one paragraph; MDX lets a tag on a line of its own interrupt it.)
 */
function wordsOnLine(lines, skipped, k, marks, newItemEnds) {
	if (k < 0 || k >= lines.length || skipped[k]) return false;
	const own = containerOf(lines[k]);
	const text = lines[k].slice(own.length).trim();
	if (!text || NOT_WORDS.test(text)) return false;
	if (newItemEnds && LIST_MARKER_AT_END.test(own)) return false;
	const quotes = (value) => (value.match(/>/g) || []).length;
	return quotes(own) === quotes(marks) && continuationOf(own).length === continuationOf(marks).length;
}

/** The join tokens an opening tag already carries (the preprocessor's own mark), and the tag without them. */
function joinsOf(tag) {
	const pattern = new RegExp(`\\s+${JOIN_ATTRIBUTE}="([^"]*)"`, 'g');
	const tokens = [];
	const bare = tag.replace(pattern, (whole, value) => {
		tokens.push(...value.split(/\s+/).filter(Boolean));
		return '';
	});
	return { tokens, bare };
}

/** The opening tag with one join attribute holding `tokens` (no duplicates), before its `>`. */
function withJoins(tag, tokens) {
	const { bare } = joinsOf(tag);
	return bare.replace(/\s*>$/, ` ${JOIN_ATTRIBUTE}="${[...new Set(tokens)].join(' ')}">`);
}

/** If `text` is an opening tag ending its line (another dropdown opened right after a closing tag), its length. */
function openingTagAtStart(text) {
	const match = new RegExp(`^<${COMPONENT_NAME}(?:${ATTRIBUTE_SOURCE})*\\s*>`).exec(text);
	return match && text.slice(match[0].length).trim() === '' ? match[0].length : 0;
}

/**
 * preprocessDropDownIc({ fileContent }) — rewrites a dropdown that opens at the end of a line
 * of words (or on the line just under them) and closes at the start of a line of words (or
 * just above them), around a body of blocks (file comment, 3.), into the form MDX parses,
 * marked for the rehype plugin to join back. Everything else is returned as it was.
 * Docusaurus calls it as `markdown.preprocessor`. Each rewrite adds up to four lines, so a
 * position MDX reports further down that page is that many lines lower than in the source.
 */
function preprocessDropDownIc({ fileContent }) {
	if (!fileContent.includes(`<${COMPONENT_NAME}`)) return fileContent;
	const lines = fileContent.split('\n');
	let skipped = skippedLines(lines);
	let changed = false;
	for (let i = 0; i < lines.length; i += 1) {
		if (skipped[i]) continue;
		const tags = tagsOf(lines[i]);
		const last = tags[tags.length - 1];
		if (!last || last.closing || visibleText(lines[i]).slice(last.end).trim()) continue; // an opening tag must end the line
		if (tags.reduce((depth, tag) => depth + (tag.closing ? -1 : 1), 0) !== 1) continue; // and stay open there
		const marks = containerOf(lines[i]);
		if (last.index < marks.length) continue;
		const beforeRaw = lines[i].slice(marks.length, last.index);
		const before = beforeRaw.trimEnd();
		const close = matchingClose(lines, skipped, i, last.end);
		if (!close || !bodyBreaksParagraph(lines, skipped, i, close.line)) continue;
		const closeLine = lines[close.line];
		const inner = closeLine.slice(0, Math.min(close.index, /^[\s>]*/.exec(closeLine)[0].length)); // the closing tag's container
		const head = closeLine.slice(inner.length, close.index).trimEnd(); // body on the closing tag's line
		const afterRaw = closeLine.slice(close.end);
		const after = afterRaw.trim();
		const tag = lines[i].slice(last.index, last.end);
		const marked = joinsOf(tag).tokens;
		const itemStart = LIST_MARKER_AT_END.test(marks);
		const wordsAbove = !before && !itemStart && !marked.length && wordsOnLine(lines, skipped, i - 1, marks, false);
		const wordsBelow = !after && wordsOnLine(lines, skipped, close.line + 1, inner, true);
		if (!before && !wordsAbove && !after && !wordsBelow && !head) continue; // already in the form MDX reads
		const joins = [...marked];
		if (before) joins.push(beforeRaw.length > before.length ? JOIN.before : JOIN.beforeTight);
		else if (wordsAbove) joins.push(JOIN.before);
		if (after) joins.push(/^\s/.test(afterRaw) ? JOIN.after : JOIN.afterTight);
		else if (wordsBelow) joins.push(JOIN.after);
		// the closing side first: its lines come later, so the opening line's index stays put
		const closeLines = [];
		if (head) closeLines.push(`${inner}${head}`, blankLineOf(inner));
		closeLines.push(`${inner}</${COMPONENT_NAME}>`);
		if (after) {
			const chained = openingTagAtStart(after);
			let text = after;
			if (chained) text = withJoins(after.slice(0, chained), [/^\s/.test(afterRaw) ? JOIN.before : JOIN.beforeTight]);
			else if (BLOCK_START.test(after)) text = `${TEXT_GUARD}${after}`;
			closeLines.push(blankLineOf(inner), `${inner}${text}`);
		} else if (wordsBelow) {
			closeLines.push(blankLineOf(inner));
		}
		lines.splice(close.line, 1, ...closeLines);
		const marksOfTag = continuationOf(marks);
		let openLines;
		if (before) openLines = [`${marks}${before}`, blankLineOf(marks), `${marksOfTag}${withJoins(tag, joins)}`];
		else if (wordsAbove) openLines = [blankLineOf(marks), `${marks}${withJoins(tag, joins)}`];
		else openLines = [`${marks}${withJoins(tag, joins)}`];
		lines.splice(i, 1, ...openLines);
		skipped = skippedLines(lines);
		changed = true;
	}
	return changed ? lines.join('\n') : fileContent;
}

/** Is this hast node whitespace-only text? */
function isBlankText(node) {
	return node.type === 'text' && !/\S/.test(node.value);
}

/** The join tokens of a dropdown's JOIN_ATTRIBUTE(s), the attributes removed; null when it has none. */
function takeJoins(node) {
	const marks = (node.attributes || []).filter((a) => a.type === 'mdxJsxAttribute' && a.name === JOIN_ATTRIBUTE);
	if (!marks.length) return null;
	node.attributes = node.attributes.filter((a) => !marks.includes(a));
	return marks.flatMap((a) => String(a.value || '').split(/\s+/).filter(Boolean));
}

/** Two nodes the preprocessor laid out next to each other: at most one (blank) line between them. */
function adjacent(first, second) {
	if (!first.position || !second.position) return true;
	return second.position.start.line - first.position.end.line <= 2;
}

/** The index of the paragraph just before (-1) / after (+1) `index`, skipping blank text; -1 when there is none. */
function neighbour(children, index, direction) {
	for (let k = index + direction; k >= 0 && k < children.length; k += direction) {
		if (isBlankText(children[k])) continue;
		const candidate = children[k];
		if (candidate.type !== 'element' || candidate.tagName !== 'p') return -1;
		const [first, second] = direction < 0 ? [candidate, children[index]] : [children[index], candidate];
		return adjacent(first, second) ? k : -1;
	}
	return -1;
}

/**
 * joinParagraphs(tree) — every dropdown the preprocessor marked becomes inline again: the
 * paragraph before it, the dropdown and the paragraph after it are one <p> (which the next
 * pass turns into div.ddic-paragraph), with the space the author wrote, or none.
 */
function joinParagraphs(tree) {
	for (;;) {
		let found = null;
		walk(tree, (node, ancestors) => {
			if (found || !isDropDown(node) || node.type !== JSX_FLOW) return;
			if ((node.attributes || []).some((a) => a.name === JOIN_ATTRIBUTE)) found = { node, parent: ancestors[0] };
		});
		if (!found) return;
		const { node, parent } = found;
		const joins = takeJoins(node);
		node.type = JSX_TEXT;
		const index = parent.children.indexOf(node);
		const first = joins.some((j) => j.startsWith(JOIN.before)) ? neighbour(parent.children, index, -1) : -1;
		const last = joins.some((j) => j.startsWith(JOIN.after)) ? neighbour(parent.children, index, 1) : -1;
		const children = [];
		if (first >= 0) children.push(...parent.children[first].children, ...(joins.includes(JOIN.before) ? [{ type: 'text', value: ' ' }] : []));
		children.push(node);
		if (last >= 0) children.push(...(joins.includes(JOIN.after) ? [{ type: 'text', value: ' ' }] : []), ...parent.children[last].children);
		const from = first >= 0 ? first : index;
		const to = last >= 0 ? last : index;
		const paragraph = first >= 0 ? parent.children[first] : { type: 'element', tagName: 'p', properties: {}, children: [] };
		paragraph.children = children;
		// the joined paragraph spans what it holds (the next dropdown checks its distance to it)
		const lastNode = last >= 0 ? parent.children[last] : node;
		const firstNode = first >= 0 ? parent.children[first] : node;
		if (firstNode.position && lastNode.position) paragraph.position = { start: firstNode.position.start, end: lastNode.position.end };
		parent.children.splice(from, to - from + 1, paragraph);
	}
}

/** Adds a class to a hast element (className is a list in hast). */
function addClass(element, className) {
	const properties = element.properties || (element.properties = {});
	const classes = Array.isArray(properties.className) ? properties.className : properties.className ? [String(properties.className)] : [];
	if (!classes.includes(className)) classes.push(className);
	properties.className = classes;
}

/** `block` (true) on a dropdown that is a block of its own, unless the author set it. */
function addBlockAttribute(node) {
	node.attributes = node.attributes || [];
	if (node.attributes.some((a) => a.type === 'mdxJsxAttribute' && a.name === BLOCK_ATTRIBUTE)) return;
	node.attributes.push({ type: 'mdxJsxAttribute', name: BLOCK_ATTRIBUTE, value: null });
}

/** The first heading element below a node, or undefined. */
function headingInside(node) {
	return descendants(node).find((child) => child.type === 'element' && HEADING_TAGS.includes(child.tagName));
}

/**
 * rehypeDropDownIc — first the dropdowns the preprocessor marked are joined back into their
 * sentence (joinParagraphs); then a <p> holding a dropdown becomes <div class="ddic-paragraph">; a dropdown
 * that is a block of its own gets `block`; one inside a heading or a link, or holding a
 * heading, is warned about (see the file comment). Options: { warn } (default console.warn).
 */
function rehypeDropDownIc(options = {}) {
	const warn = options.warn || ((message) => console.warn(message));
	return (tree, file) => {
		joinParagraphs(tree);
		walk(tree, (node, ancestors) => {
			if (node.type === 'element' && node.tagName === 'p' && containsDropDown(node)) {
				node.tagName = 'div';
				addClass(node, PARAGRAPH_CLASS);
				return;
			}
			if (!isDropDown(node)) return;
			if (node.type === JSX_FLOW) addBlockAttribute(node);
			const wrapper = ancestors.find((a) => a.type === 'element' && FORBIDDEN_WRAPPERS.includes(a.tagName));
			if (wrapper) report(file, warn, `a <${COMPONENT_NAME}> sits inside <${wrapper.tagName}>; ${wrapper.tagName === 'a' ? 'a button cannot sit inside a link' : 'its box would open as part of the heading'} (write it in the paragraph\'s text instead).`);
			const heading = headingInside(node);
			if (heading) report(file, warn, `a <${heading.tagName}> sits inside a <${COMPONENT_NAME}>; it lands in the page's table of contents but cannot be reached (use bold text instead).`);
		});
	};
}

module.exports = {
	BLOCK_ATTRIBUTE,
	CLIENT_COMPILER,
	COMPONENT_NAME,
	JOIN_ATTRIBUTE,
	LABEL_ATTRIBUTE,
	PARAGRAPH_CLASS,
	TITLE_ATTRIBUTE,
	TITLE_ELEMENT_NAME,
	asProse,
	preprocessDropDownIc,
	rehypeDropDownIc,
	remarkDropDownIc,
};
