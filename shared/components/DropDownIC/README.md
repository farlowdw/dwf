# `shared/components/DropDownIC` — the inline dropdown of the notes

`<DropDownIC title="…">…</DropDownIC>` (2026-10-20) is Interview Cake's inline dropdown on a
Docusaurus site: in the middle of a sentence a phrase with a dashed underline and a small blue ↴ — the same
text glyph Interview Cake uses (U+21B4), at 0.8 of the text's size and aligned to the top of
the line as they place it (measured against their page: the glyph's ink sits 0.045 em under
the cap height and ends 0.02 em under the baseline on both sites), right after the last
letter — they pull theirs back over a period; after a tall letter a pull lands the arrow's top
stroke on it, so here the glyphs' own side bearings make the gap (`--ddic-arrow-pull`), in the
site's link blue; a click opens a
bordered box **right there in the paragraph** — the words
before it stay above, the words after it carry on below — and a second click closes it. The box
holds any MDX: an imported partial with paragraphs, code blocks, display maths and lists, or
inline text. The title can hold inline markdown and maths.

A note imports it through the site's one-line stub, `src/components/DropDownIC/index.jsx` (no
global registration):

```mdx
import DropDownIC from '@site/src/components/DropDownIC';
```

A site with a guide page of its own may show every form working there; keep such a section and
this README in step.

## The folder is the whole component

| File | What it is |
|---|---|
| `index.jsx` | the component: the trigger, the panel, the four-phase motion; React only |
| `styles.module.css` | the look and the motion; Infima's variables, with the shared greys first and Infima's as fallbacks |
| `mdx.cjs` | the two MDX plugins (remark: a string `title` read as markdown + maths; rehype: the paragraph that holds a dropdown becomes a `<div>`, a block-level one gets `block`, a mid-sentence one is joined back into its sentence) and the preprocessor (the mid-sentence form with a body of blocks, rewritten into what MDX reads); CommonJS whatever a site's `package.json` says |
| `__tests__/mdx.test.cjs`, `__tests__/render.test.mjs`, `__tests__/jsxHooks.mjs` | the tests and their own JSX loader; they read nothing of a site, so they run on any of them: `node --test "shared/components/DropDownIC/__tests__/*.test.cjs" "shared/components/DropDownIC/__tests__/*.test.mjs"` (the maths cases skip themselves where remark-math / rehype-katex are not installed) |

A site's `docusaurus.config.js` takes these from `shared/wiring/index.cjs` for docs, blog and
pages, next to remark-math / rehype-katex:

```js
const { preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc } = require('./shared/wiring/index.cjs');
// in the config:
markdown: { preprocessor: preprocessDropDownIc },
// in each of docs, blog and pages:
remarkPlugins: [remarkMath, remarkDropDownIc],
rehypePlugins: [rehypeDropDownIc, [rehypeKatex, { … }]],
```

**On a site:** add the stub, a plain `export { default } from '@site/shared/components/DropDownIC';`
(never a wrapper: the plugin writes `<DropDownIC.Title>`), add those lines to the site's config
(remark-math and rehype-katex only if titles are to hold maths; without them a `$` is a `$`),
and import it in a note as `DropDownIC`. It assumes Docusaurus 3 (MDX 3, the `@site` alias, CSS
modules, Infima's CSS variables) and React 18 or 19 (`inert` is set on the element in an
effect and the layout effect is skipped on the server, because React 18 drops a boolean
`inert` prop and warns about `useLayoutEffect` there), and installs nothing. A site's own wiring
is checked by `shared/__tests__/siteWiring.test.mjs`, outside the folder: with the stub there,
every docs, blog and pages block must run both plugins, and a preprocessor of the site's own must
run `preprocessDropDownIc`. A docs, blog or pages plugin of the site's own, in `plugins:`, must run
both as well once a Markdown file of its folder holds a dropdown.

## Writing one

| In MDX | What you get |
|---|---|
| `…the <DropDownIC title="modulus operator">the remainder after dividing</DropDownIC>. More…` | inline, in the paragraph; the body is inline markdown |
| `<DropDownIC title="the modulus operator ($\%$) and **bold**">…</DropDownIC>` | a title with maths and markdown |
| `…a <DropDownIC title="code block">` ending a line, then the body (blank lines, a code block, a list), then a line starting `</DropDownIC> and the sentence goes on.` | a body of blocks in the middle of a sentence: one paragraph, as written (the preprocessor rewrites it for MDX; the opening tag must end its line, the closing tag start one) |
| `<DropDownIC title="more"><Modulus /></DropDownIC>` with `import Modulus from './_partials/modulus.mdx';` at the top | a body with paragraphs, code blocks, display maths, lists — written in a partial |
| the element on lines of its own, a blank line before and after its tags, blocks inside | a paragraph of its own: the title alone on its line, the box under it (`block` is set for you) |
| `<DropDownIC title="…" defaultOpen>…</DropDownIC>` | open when the page loads |
| in a list item, a quotation, a table cell | works wherever text does |
| from a `.jsx` page: `<DropDownIC title={<>any nodes</>}>…</DropDownIC>` or a child `<DropDownIC.Title>…</DropDownIC.Title>` | the title as React nodes; the child wins over the prop |

Rules: write it **in the text**, not inside `*emphasis*`, a link or a heading (inside a
heading the box would open as part of the heading; the build warns about a heading or a
link). A title is prose: words, emphasis, code spans and maths. Outside `$…$` and outside
backticks, `{`, `}` and `<` are shown, never read as MDX (inside they are TeX or code:
`$\frac{1}{2}$`, `$a < b$`, `` `{x}` ``); a link in a title becomes its words and an image is
left out (a warning each; a reference-style link or a footnote mark is shown as written); a
title that starts like a heading, a list, a quote or `import ` stays plain text, with a
warning in the build log. A tall formula (a `\frac`) reaches below the dashed underline:
write `\tfrac` or `a/b` in a title. A title with maths also carries the trigger's spoken name
(`label`: its text with each formula's TeX as written — a screen reader gets nothing from
KaTeX's markup); from JSX, pass `label` yourself when the words alone would not do. A dropdown
opened and closed on the same lines of a paragraph holds *inline* markdown; for paragraphs, code
blocks and lists, end the line of words with the opening tag and start a line with the closing
tag (the mid-sentence form), use a partial, or give the element lines of its own. No headings in a body (they would land in the page's table of contents, unreachable;
the build warns). On paper every dropdown is open.

## How it works

- **`mdx.cjs`** — the MDX side. The preprocessor (Docusaurus's `markdown.preprocessor`, run on
  the source before MDX parses it) handles the mid-sentence form: in MDX a tag opened inside a
  paragraph must close inside it, so a body with a blank line or a fence fails to parse ("Expected
  a closing tag … before the end of `paragraph`"). It rewrites just that shape — the words, the
  tag and the body onto lines of their own, the tag marked `data-ddic-join` — and leaves every
  other byte alone (fenced code, MDX comments, front matter, inline bodies, own-line dropdowns);
  the rehype plugin joins the words before, the dropdown and the words after back into one
  paragraph, with the author's space or none. The remark plugin reads a string `title` with the page's own
  parser (maths, emphasis, code spans, escapes) and moves the result into a child
  `<DropDownIC.Title>`, so the maths is typeset by rehype-katex at build time like the
  paragraph's own (`{ } <` are escaped outside `$…$` and outside code spans first, so a title
  is never an expression or a tag; a link becomes its words; a title with maths gets its
  `label`). Warnings go to the terminal, one per title or dropdown concerned and for the client
  compiler only (Docusaurus drops a vfile's messages and compiles every file twice in a build).
  The rehype plugin turns every `<p>` holding a dropdown into `<div class="ddic-paragraph">` (a
  box of blocks cannot live in a `<p>`: the browser would close the paragraph at the first
  `<div>` and React would see a different tree) and marks a dropdown that is a block of its
  own with `block`. Both look for the JSX name `DropDownIC`: import it as that.
- **`index.jsx`** — no measuring, no portal. The trigger is a `span[role=button]` (a
  `<button>` is inline-block and could not wrap over two lines like text) that a click, Enter
  or Space toggles — not a held key's repeats, not the second click of a double-click when it
  selected the words (a quick second click that selected nothing reverses the motion), not a
  click or key meant for a link someone put in a JSX title; the
  dashed underline is a `border-bottom` on the title's words, so it runs under a KaTeX
  inline-block too; the arrow shares a never-wrapping span with the title's last word
  (`withArrow`), so it cannot drop onto the next line alone. The panel is a `<div>` after the
  trigger, `display:none` while closed — a closed dropdown must not break its line, and its
  contents stay out of the tab order and the accessibility tree (`inert` too) — and the server
  renders that closed state, so hydration matches. When the box opens, the component sends the
  window a `resize` event: Docusaurus's code blocks decide whether to show their "Toggle word
  wrap" button at mount and on resize only, and inside a closed box they measured nothing.
  From JSX, put it in a `<div>`, never in a `<p>` (in MDX the plugin takes care of that).
- **`styles.module.css`** — the motion: the panel is a grid whose one row goes from `0fr` to
  `1fr` by a CSS transition, and its item clips the box to that row (nothing is measured, so a
  box whose contents change keeps up). Four phases in `index.jsx` make it slide both ways:
  `opening` displays the panel at `0fr` and a layout effect has the browser compute that state
  before `open` sets `1fr` (otherwise a just-displayed element jumps); `closing` sets `0fr`
  again and the panel is hidden (`closed`, `display:none`) at the transition's end — the
  panel's `transitionend`, or the stylesheet's duration plus a small grace when no event
  comes (motion off). A click during a move reverses it from wherever it is. The box's margins
  live inside the clipped row, so the text below moves with the box and nothing jumps.
  **The close eases in** (slow start, fast finish) on purpose: the words after the box sit on
  a line of their own while the box is a block and can only come back beside the title the
  instant the box is gone — a jump no CSS can animate (Interview Cake has the same one).
  Finishing fast puts that jump inside the fastest part of the motion, where it reads as the
  end of one movement; an ease-out close lingered a few pixels high and the jump showed as a
  second move. "Reduce motion" turns the motion off. (`@starting-style` with `display`
  transitions would do the opening in CSS alone, but the site's CSS minifier, cssnano 6, drops
  that rule.)

The colours follow the site: the arrow is `--ifm-link-color` (the glyph itself comes from the
device's font, so it looks exactly as a pasted ↴ does there); the box is one grey step off the
page (`--color-gray-4` on light, `--color-gray-86` on dark, with Infima's `--ifm-color-emphasis-100`
/ `--ifm-background-surface-color` as the fallbacks a site without the shared stylesheet uses) inside a softer site
blue, and inline code inside it steps one further (`--ddic-code-bg`, through Infima's
`--ifm-code-background`); a code block takes the same step through `--ifm-pre-background`, which
`shared/css/_code-blocks.scss` points the whole block at (a stock theme keeps the Prism theme's
own background for its blocks); a dropdown inside a
dropdown's box steps once more (`.box .panel`), its code too. The box keeps the paragraph's width
(`.clip { min-width: 0 }`): a wide code block scrolls inside it, never the page.

## How to change it

| What | Where |
|---|---|
| colours, timing, the box's spacing, the arrow's size and lift | the custom properties at the top of `.trigger` and `.panel` in `styles.module.css` (dark values under `html[data-theme='dark']`); the close's curve: `--ddic-ease-close` |
| the keys that toggle | `TOGGLE_KEYS` in `index.jsx` |
| what a title may not hold | `UNWRAPPED_IN_TITLE` / `DROPPED_FROM_TITLE` in `mdx.cjs` |
| the event sent to the window when a box opens | `OPENED_EVENT` in `index.jsx` |
| the arrow's character, size, pull and nudge | `ARROW_GLYPH` in `index.jsx`; `--ddic-arrow-scale`, `--ddic-arrow-pull`, `--ddic-arrow-shift` in `styles.module.css` |
| the element's name, the title child's name, the paragraph class | `COMPONENT_NAME`, `TITLE_ELEMENT_NAME`, `PARAGRAPH_CLASS` in `mdx.cjs` — the name must match the import in the notes |
| which pages get the plugins | `docusaurus.config.js` (docs, blog, pages) |
| the paragraph margins of `.ddic-paragraph` / `.block` | `styles.module.css`, copied from Infima's `p`, `.markdown > p`, `.markdown li > p`, and the theme's last-`<p>`-in-`<details>` rule |
| a nested dropdown's shades | `.box .panel` in `styles.module.css` |

Tests (`npm run test:shared`): `__tests__/mdx.test.cjs` runs the plugins through the real MDX
compiler with remark-gfm, remark-math and rehype-katex (a maths title becomes KaTeX markup, the
paragraph becomes the div, `block`, the fallbacks and warnings); `__tests__/render.test.mjs`
renders the component on the server through the folder's own `jsxHooks.mjs` (aria, the title's
precedence, the arrow on the last word, `block`, and an MDX paragraph end to end with the real
component). The clicks and keys need a browser: check them on the built site.
