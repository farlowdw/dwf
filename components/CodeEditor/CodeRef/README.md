# `shared/components/CodeEditor/CodeRef` — words in a note that point into a code editor

Part of the code editor's folder (`shared/components/CodeEditor`): a site gets it with the editor,
through a one-line stub of its own, and it imports only the folder's own files.

`<CodeRef>` turns a phrase in the prose into a pointer at a `<CodeEditor>` on the same page. The
words look like a link (the link blue, with a dotted underline); a click — or Enter / Space —
brings the editor into view and makes it **show those lines** (revealed, unfolded if folded,
and briefly flashed) or **go to one of its steps**.

```mdx
import CodeEditor from '@site/src/components/CodeEditor';
import CodeRef from '@site/src/components/CodeEditor/CodeRef';
import twoSum from '!!raw-loader!./two-sum.py';

<CodeEditor id="two-sum" initialCode={twoSum} />

The <CodeRef to="two-sum" lines="4-6">inner loop</CodeRef> tries every pair, so the
<CodeRef to="two-sum" lines={9}>return</CodeRef> is reached only for a match.
```

Like `<DropDownIC>`, it is imported in each note that uses it, never registered for every page.
The editor needs an `id` — the name `to` refers to.

## Examples

```mdx
<CodeRef to="two-sum" lines="10-12">the loop</CodeRef>       {/* lines 10 to 12 */}
<CodeRef to="two-sum" lines="3-5, 8">these lines</CodeRef>   {/* several ranges */}
<CodeRef to="two-sum" lines={[3, [5, 7]]}>these</CodeRef>    {/* the same as a list */}
<CodeRef to="two-sum" step={2}>the second step</CodeRef>     {/* the editor's `steps` */}
<CodeRef to="two-sum" lines="4" />                          {/* no words: it shows "line 4" */}
<CodeRef to="two-sum">the editor above</CodeRef>            {/* only brings the editor into view */}
```

## Props

| Prop | What it does |
|---|---|
| `to` | The editor's `id` (`<CodeEditor id="two-sum">`). Required: without a usable one the words are plain text, with a console warning. A word without spaces. |
| `lines` | The lines to show, as the editor's `highlight` takes them: `5`, `"10-12"`, `"3-5, 8"`, `[3, [5, 7]]` (the same parser reads them, `../lib/codeRunner/lineSpec.js`). The lines the reader sees, numbered from 1 (after any magic comments are removed). A part that names no line gets a console warning (in the build log too) and is left out; lines past the end of the code are cut off by the editor. |
| `step` | A step's number as the reader sees it ("Step 2 of 4" → `step={2}`; `step="2"` works too). The editor must have `steps`. |
| `children` | The words. Without any, the reference names its target: "lines 10–12", "step 2", "the code editor". Inline code and emphasis are fine. |

Both `lines` and `step`: the step wins (it carries its lines and its note), with a console
warning. Neither: the click only brings the editor into view.

## What the reader gets

- **The words** in the link blue with a dotted underline (solid under a resting pointer), so
  they read as something to click but are told apart from a plain link and from a dropdown.
  Their tooltip says what the click does: "Show lines 10–12 in the code editor", "Go to step 2
  in the code editor".
- **A click, Enter or Space** scrolls the page until the editor is in view — centred under the
  navbar when it fits in the window, its top just under the navbar when it is taller; nothing
  moves when it is already wholly in view. The scroll is smooth, or a jump when the reader has
  asked for reduced motion. Once the page has stopped moving, the editor shows the lines (or
  the step), so the flash plays while the reader can see it.
- **When opening a fold makes the editor taller** (`height="fit"`), the page follows: once the
  box has grown, it scrolls the least that keeps the lines in the window (nothing moves when
  they are in view), and only then do they flash. The editor's Previous / Next do the same.
- **The focus stays on the words**, so a keyboard reader carries on from there. A screen
  reader hears what happened from the editor's status region: "Showing lines 10 to 12 of
  main.py." (started with "Switched to Python." when the editor had to switch back), or the
  step's words when the step bar cannot say them itself.
- **An editor still loading** (Monaco takes a moment on the first visit) gets the request the
  moment it is ready, and an editor still closing its folds (as it opens, or after **Reset**)
  once they are closed, so nothing scrolls the lines away again. An editor that loads only
  near the viewport (`loadWhenVisible`) starts loading at once.
- **After Clear or "Use this solution"** the editor's line numbers no longer describe its code:
  a reference does nothing but scroll (with a console warning, and a word for screen readers)
  until the reader presses **Reset**.
- **Inside a dropdown:** a reference to an editor in a closed `<DropDownIC>` cannot scroll to
  it (it has no place on the page while the dropdown is closed). The editor still gets the
  request at once, but its flash plays unseen: put such a reference inside the same dropdown,
  or say in the words that the dropdown must be opened first.

## How it works

1. `reference.js` reads the props: the editor's id, the request (`{ type: 'lines', ranges }`
   with the line spec read into sorted, merged ranges — `"3-5,8"` → `[[3, 5], [8, 8]]` — by the
   run library's `parseLineSpec`, or `{ type: 'step', index }` counting from 0), the tooltip,
   and a warning for each mistake (shown once in the console, and in the build log).
2. A click runs `goToEditor.js`: it finds the element `#code-editor-<to>` (the
   `<CodeEditor id>` puts it around its placeholder and its editor, so it is there before
   Monaco loads), scrolls it into view, waits for the scroll to settle (`scrollend`, or
   150 ms without a scroll event, 1.5 s at most), then sends the request through the page
   registry.
3. The registry (`../lib/registry`) delivers the request to the editor of that name
   at once if it is ready, or keeps it (the newest one only) until the editor registers — and
   tells a `loadWhenVisible` editor to mount. A `<CodeRef>` that unmounts (the reader left the
   page) withdraws a request that still waits.
4. The editor (`../useGuided.js`) cuts the ranges to its own code
   (a console warning when none is left), unfolds and reveals the lines, keeps them in the
   page's window (`goToEditor.js > keepLinesInWindow`), and flashes them; or goes to the step
   (a warning past the last one). Lines and steps are the editor's OPENING language's: an
   editor showing another language switches back to it first. An editor registers as soon as
   Monaco is up; a request that arrives while it is closing folds waits in the editor until
   the fold pass is over (its last step scrolls to the top, which would undo the reveal).

A `to` naming no editor on the page gives a console warning at the click (`CodeRef: there is
no editor called "…"`), and nothing at build time, so a typo in an id shows only then. Two
editors with the same `id` give one warning, as soon as the second one is in the page (even if
it never loads: `../index.jsx > useMountRequests`): only the first one
on the page — the one the click scrolls to — takes the references; the other ignores them, and
a reference never makes it load. Give each editor its own id.

## The files

| File | What it is |
|---|---|
| `index.jsx` | the component: the span[role=button] (a `<button>` could not wrap over two lines like text — `<DropDownIC>`'s trigger is built the same way), its keys, the cancel on unmount |
| `reference.js` | the props → `{ id, action, label, description, warnings }`; the words (`WORDS`) and the warnings (`WARNINGS`, plus the line spec parser's, which start with `LINES_LABEL`) |
| `goToEditor.js` | the click: where the editor lands (`scrollTopFor`), the scroll, the wait (`waitForScrollToSettle`), the request; and the editor's follow-up after a reveal (`keepLinesInWindow`, `scrollTopToShow`) |
| `styles.module.css` | the look (`--coderef-*`) |
| `package.json` | `"type": "module"`, so `node --test` reads the `.js` files as ES modules |
| `__tests__/` | `reference` (the props), `goToEditor` (the landing place, the scroll, the wait, the whole click against a fake page, the follow-up with a fake editor whose box grows), `render` (the markup on the server through the editor folder's `__tests__/jsxHooks.js`, the keys, the folder's imports and classes); the registry has its own in `../lib/registry/__tests__`, the editor's side in `../__tests__/useGuided.test.js` |

## How to change it

- **Words** (the tooltip, the words shown without children): `reference.js > WORDS`. The
  warnings: `reference.js > WARNINGS`, `goToEditor.js > WARNINGS`.
- **The look:** `styles.module.css` — the colour, the underline's style, thickness and offset
  are custom properties on `.reference`.
- **Where the editor lands, and the wait:** `goToEditor.js` (`TOP_GAP_PX`, `SCROLL_IDLE_MS`,
  `SCROLL_SETTLE_MAX_MS`); where revealed lines land and how long a fit editor may take to
  grow: `scrollTopToShow`, `LAYOUT_SETTLE_MS`.
- **What screen readers hear:** `../useGuided.js > WORDS` (the lines and
  steps in StepBar.jsx's words).
- **A new kind of reference** (say, a fold to open): a name in the registry's `ACTION_TYPES`,
  a branch in `reference.js > targetOf`, the prop here, and the editor's handling of it
  (`../useGuided.js > perform`).
- **Tests:** `npm run test:shared` (both folders are in its list), or on their own
  `node --test "shared/components/CodeEditor/CodeRef/__tests__/*.test.js" "shared/components/CodeEditor/lib/registry/__tests__/*.test.js"`.
  The browser parts are checked by hand on the built site: a reference above and below its
  editor, with the editor in view and out of it, in light and dark mode, at 375 px, with the
  keyboard (Tab to it, Enter, Space), with reduced motion on (macOS: System Settings →
  Accessibility → Display → Reduce motion), on a `loadWhenVisible` editor far down the page,
  and in a closed dropdown.
