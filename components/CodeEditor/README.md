# `shared/components/CodeEditor` — the in-page code editor

`<CodeEditor>` puts an editor (Monaco, the editor of VS Code, in VS Code's default dark and
light colours, or the theme the reader picks in its header) on a page, with a header bar, an
output panel and a **Run** button that runs the
code on the site's code runner — a Piston server reached through the site's Netlify functions —
in **any language and version installed there**. It can open with chosen blocks of code
**folded**, and one editor can hold **one snippet per language** with a language picker. The
box is 50vh tall unless the page says otherwise, and the reader can drag it taller or shorter.

**The teaching layer** (2026-10-25), each part switched on by its own prop: marked lines
(`highlight`, and the site's magic comments in the snippet), a step-by-step walk through the
code (`steps`), words in the prose that point into the editor (`<CodeRef>`, needs `id`),
exercises (`expectedOutput`, `tests` with a **Check** button, `solution`, `hints`), saved drafts
(`saveDraft`) and loading near the viewport (`loadWhenVisible`). One part is on for every
editor: after a failed run the lines its errors point to are squiggled and listed
(`hideErrors` turns it off). **TypeScript** is checked and compiled in the reader's browser and
runs on the newest Node (→ TypeScript).

A note imports it through the site's one-line stub (→ Taking it to another Docusaurus site):

```mdx
import CodeEditor from '@site/src/components/CodeEditor';
import snippet1 from '!!raw-loader!./snippet-1.py';

<CodeEditor initialCode={snippet1} foldedRegions={[[1, 6]]} />
```

Running code needs the Netlify functions: they exist on the live site and under `netlify dev`
(each site's port is in its own `netlify.toml` → `[dev]`), **not** under `npm start` (there,
editing works, Run says the code runner isn't available here, and the browser's console says why,
with no port, because the folder's words are every site's: `lib/codeRunner/errors.js`).

## The folder is the whole component

The editor is ONE folder, on the model of `shared/components/DropDownIC`: nothing in it imports
`@site/…` or a file outside it (`__tests__/files.test.js` refuses one), and its tests read nothing
of a site. A note imports two paths, both one-line stubs of the site, and a site that reloads
tabs after a deploy may read a third; everything else is internal:

```js
import CodeEditor from '@site/src/components/CodeEditor';
import CodeRef from '@site/src/components/CodeEditor/CodeRef';
import { hasUnsavedWork } from '@site/src/components/CodeEditor/unsavedWork.js'; // optional: a site's own reloader
```

| Where | What it is |
|---|---|
| `index.jsx`, `CodeEditorClient.jsx` and the files beside them | the component (→ The files below) |
| `MuiScope.jsx` | the editor's own MUI `ThemeProvider` (the controls follow the editor theme's mode; the shared blues and greys, which are also the defaults on a site with other colours) |
| `editorFont.js` | the code's font, read from the page at the first render: `--ce-font-family` (`shared/css/custom.scss` sets it), else Infima's `--ifm-font-family-monospace`, else a built-in stack |
| `unsavedWork.js` | the editor's registry of "an editor holds unsaved text"; the dependency points from the site to the editor (a site's reloader imports `hasUnsavedWork` through a stub) |
| `CodeRef/` | `<CodeRef>`, words in the prose that point into an editor (its own README) |
| `lib/codeRunner/` | the run library: languages, versions, the request, the answer, errors, folds, line specs, magic comments, steps, error locations, source maps, exercises (its own README; no React) |
| `lib/registry/` | the page registry that delivers a `<CodeRef>` request to the editor of that name |
| `styles.module.css` and the other `.module.css` files | the look: the frame's `--ce-*` colours (VS Code's), and the code-line tokens read from the site with built-in fallbacks (`--ce-line-*`: → Taking it to another Docusaurus site) |
| `__tests__/` (+ `lib/codeRunner/__tests__/`, `lib/registry/__tests__/`, `CodeRef/__tests__/`) | the tests, with their own JSX loader (`jsxHooks.js`), `paths.js` (the site's packages found from the folder, at any depth) and `fixtures/` (real Piston answers, and `snippets/`: copies of a site's snippets, which that site's wiring test keeps equal to the live files): `npm run test:shared` runs them, as the CodeEditor row of `shared/requirements.cjs` lists them |

Beside the folder in `shared/`, two things the site and Netlify need:
`shared/plugins/monaco-editor/` (serves Monaco from the site and hands the editor the site's
settings) and `shared/functions/code-runner/` (the two functions that reach the Piston server):
→ Taking it to another Docusaurus site. How one site wires the folder (its config, its
reloader, its guide page) is that site's own, tested in a wiring test of its own. The
stylesheets' tokens, the font and the magic comments are tested on every site, in
`shared/__tests__/codeEditorTokens.test.mjs`.

## Taking it to another Docusaurus site

The editor comes with `shared/`, so a site takes it by mounting that folder, never by copying
files. After the mount this folder, `shared/plugins/monaco-editor/` and
`shared/functions/code-runner/` are all there, and a pull updates them. The site itself adds
the packages, the stubs, one config line and the two function shims below.

Checked on a new site from `npm run shared:new` on 2026-11-01: the steps below as written, then
`npm run build`, `npm run test:shared` and the result in the browser (Monaco from `/vendor`, a
fold, `<CodeRef>`, the touch reading mode). A real Run needs a Piston server, so it was not part
of that check.

1. **Mount `shared/`**, if the site has not: `shared/README.md` → Mount it on a site, or → Join
   an existing site. The Piston server is not in `shared/`: a site points at one it already has
   (step 6).
2. **Install** the editor's packages, exact versions, so two sites cannot drift
   (prism-react-renderer, React and the Babel presets come with Docusaurus; MUI X is NOT needed):
   `npm install --save-exact monaco-editor@0.55.1 @monaco-editor/react@4.7.0 @monaco-editor/loader@1.7.0 @mui/material@9.4.0 @mui/icons-material@9.4.0 @emotion/react@11.14.0 @emotion/styled@11.14.1 clsx@2.1.1 raw-loader@4.0.2`
   The ranges a site must stay inside are the CodeEditor row of `shared/requirements.cjs`.
3. **Add two stubs**, so a note imports from the site and never from `shared/`. Each is one plain
   re-export under a header comment (`shared/README.md` → Add a component):

   ```jsx
   // src/components/CodeEditor/index.jsx
   export { default } from '@site/shared/components/CodeEditor';

   // src/components/CodeEditor/CodeRef/index.jsx
   export { default } from '@site/shared/components/CodeEditor/CodeRef';
   ```

4. **Register the plugin** in `docusaurus.config.js`, on a line of its own:

   ```js
   const { codeRunnerPlugin } = require('./shared/wiring/index.cjs');
   // in plugins:
   codeRunnerPlugin(),
   ```

   That is the same as `codeRunnerPlugin({ executeUrl: '/.netlify/functions/execute', runtimesUrl: '/.netlify/functions/runtimes' })`.
   A site whose functions live elsewhere gives its paths (a site path or an absolute URL; a
   cross-origin URL would need CORS, which the functions do not offer yet). The list of
   magic comments, so the site's own code blocks mark lines as the editor does, is the same
   file's `MAGIC_COMMENTS` (`shared/README.md` → Mount it on a site).
5. **Add the two function shims and the `[functions]` block**, so Netlify finds the functions in
   the site and their URLs stay `/.netlify/functions/execute` and `/.netlify/functions/runtimes`:

   ```js
   // netlify/functions/execute.mjs
   export { default } from '../../shared/functions/code-runner/execute.mjs';

   // netlify/functions/runtimes.mjs
   export { default } from '../../shared/functions/code-runner/runtimes.mjs';
   ```

   ```toml
   # netlify.toml
   [functions]
   directory = "netlify/functions"
   node_bundler = "esbuild"
   ```

   Keep each shim one re-export of the default, with no `handler`: Netlify then reads it as a
   modern function. Anything else in that folder deploys as a public endpoint, and
   `functionShims.test.mjs` fails on it.
6. **On Netlify** (names only; the values are the server's): `PISTON_BASE_URL` and
   `PISTON_PROXY_SECRET`, and optionally `CODE_RUNNER_RATE_LIMIT` (runs per client, default
   `20/60`; the guards are on whether the site has a password or not). Leave
   `CODE_RUNNER_ALLOWED_ORIGINS` unset: a site's own pages never need it, and it cannot admit
   another site's page (the functions send no CORS header), so each site runs its own shims. All
   of it, and a public site: `shared/functions/code-runner/README.md`.
7. **Tests:** `npm run test:shared` runs the six test folders of the CodeEditor row once the stub
   is there (the cases that need Babel's parser, postcss or prism-react-renderer skip
   themselves, with the reason, where those are not installed; Docusaurus brings them all). The
   editor folder's tests read nothing outside it; two of the others read the site, and pass when
   steps 4 and 5 are followed as written: `shared/plugins/monaco-editor/__tests__` expects
   `codeRunnerPlugin(` at the start of a line of `docusaurus.config.js`, and
   `shared/functions/code-runner/__tests__/functionShims.test.mjs` reads the shims and
   `netlify.toml`.
8. **Optional:**
   - the after-deploy reload: a third stub, `src/components/CodeEditor/unsavedWork.js`, holding
     `export * from '@site/shared/components/CodeEditor/unsavedWork.js';`, for the site's own
     reloader to import `hasUnsavedWork` from. It must stay a plain re-export: a copy or a wrapper
     is a second, empty registry, with no error;
   - the marked lines' colours: `--code-line-<kind>-bg` / `-bar` / `-ink` on `:root` and
     `html[data-theme='dark']` (kinds: `highlighted`, `error`, `success`, `warning`, `removed`,
     `added`; `-bar` for the first three after `highlighted`). `shared/css/_code-blocks.scss`
     sets them on a site that loads `shared/css/custom.scss`; without them the built-in fallbacks
     in `styles.module.css` apply, with the same values;
   - the font: `--ce-font-family` on `:root`, which `shared/css/custom.scss` sets; without it the
     editor takes the site's `--ifm-font-family-monospace` (every Docusaurus site has it);
   - coloured Bash on phones: the editor's languages that Prism does not bundle (`bash`) in
     `themeConfig.prism.additionalLanguages`, as `ADDITIONAL_LANGUAGES` in
     `shared/wiring/index.cjs` does; without it the static view shows Bash as plain text
     (`prismTheme.js > prismLanguageFor` falls back to `text`, no crash).
     `prism-react-renderer` itself comes with Docusaurus: nothing to install.
9. **In a note:** `import CodeEditor from '@site/src/components/CodeEditor';` and, for words that
   point into an editor, `import CodeRef from '@site/src/components/CodeEditor/CodeRef';`.

What it assumes: Docusaurus 3 (Infima's variables, `@theme/CodeBlock` for the output, CSS
modules, `raw-loader` for the snippets, the `@site` alias for the stubs and the note's import
only — never inside the folder); React 18 or 19; a Netlify-style function path (or the plugin's
options) and a Piston server behind it. The two functions are Netlify's (modern Netlify
Functions: ES modules whose default export takes a web `Request` and answers a `Response`;
`shared/functions/code-runner/README.md`): a site on another host writes its own proxy that
answers the same JSON at the two URLs the plugin's options name (`execute.mjs` and
`runtimes.mjs` say what they take and return; the library's `request.js` and `result.js` what
the editor sends and reads), on the site's own origin, since the editor sends no CORS request.
The dev-server notice (`lib/codeRunner/errors.js`) names `netlify dev` and no port: nothing in
the folder is one site's (`__tests__/files.test.js` refuses a localhost port). The output
block's colours need no site CSS: the folder forces the theme's background and text over the
site's Prism theme (`styles.module.css` > the output area; on a stock site the block would
otherwise keep its Prism colours under the theme's text). A site with a guide page of its own
may carry a short version of this section; keep the two in step.

## Examples

**One snippet, a block folded.** `[1, 6]` keeps line 1 visible — it carries the
fold arrow — and hides lines 2–6:

```mdx
<CodeEditor initialCode={snippet1} editorSettings={{ height: '50vh' }} foldedRegions={[[1,6]]} />
```

(`editorSettings.height` is the old editor's prop, read as `height`; 50vh is also the default.)

**A size.** Without `height` the box is 50vh and the code scrolls inside it:

```mdx
<CodeEditor initialCode={snippet} height="24rem" />                 {/* a fixed height */}
<CodeEditor initialCode={snippet} height="fit" />                   {/* as tall as the code, up to 60vh */}
<CodeEditor initialCode={snippet} height="fit" maxHeight="80vh" />  {/* … up to 80vh */}
```

**A version.** Without `version` the newest installed version runs. A selector picks the newest
match; a version that is not installed falls back to the newest, with a notice:

```mdx
<CodeEditor initialCode={snippet} version="3.12" />        {/* 3.12.x */}
<CodeEditor initialCode={snippet} version="3.x" />         {/* the newest 3.* */}
<CodeEditor initialCode={snippet} language="javascript" />  {/* a string snippet in another language */}
```

**One snippet per language** (a language picker appears; each language keeps its own edits):

```mdx
import py from '!!raw-loader!./two-sum.py';
import js from '!!raw-loader!./two-sum.js';
import java from '!!raw-loader!./TwoSum.java';

<CodeEditor
  initialCode={{ python: py, javascript: js, java }}
  language="javascript"
  version={{ python: '3.12', javascript: '20' }}
  foldedRegions={{ python: [[1, 4]], java: [[3, 9], [5, 7]] }}
/>
```

**Program input, arguments, limits, read-only:**

```mdx
<CodeEditor initialCode={snippet} stdin={'5\n1 2 3 4 5'} args={['--verbose']} limits={{ runTimeout: 2000 }} />
<CodeEditor initialCode={snippet} readOnly title="The final solution" />
```

**Inside a dropdown** (`shared/components/DropDownIC`). Put **a blank line before and after the editor**: MDX ends a paragraph at a
line holding only a JSX tag, so without them the page does not build ("Expected a closing tag
for `<DropDownIC>` … before the end of `paragraph`"). On lines of its own, or mid-sentence with
the opening tag ending a line and the closing tag starting one (DropDownIC's preprocessor rewrites
that form, `mdx.cjs > preprocessDropDownIc`):

```mdx
<DropDownIC title="the squares program">

<CodeEditor initialCode={snippet} foldedRegions={[[1, 6]]} />

</DropDownIC>

…try <DropDownIC title="the sum of squares in Python and Go">

<CodeEditor initialCode={{ python: py, go: go }} height="fit" />

</DropDownIC> and the sentence carries on below it.
```

Everything works inside (checked 2026-10-24): the editor is made while the dropdown is closed
(its folds already applied) and lays itself out to the box's width when it opens (Monaco's
`automaticLayout`); keys typed in it never toggle the dropdown (DropDownIC listens to its title
only); the pickers' menus and Monaco's pop-ups draw outside the box's clip (MUI portals,
`fixedOverflowWidgets`); a resize grows the dropdown with it; closing and opening keeps the code,
the output and the size. `height="fit"` keeps a short program's dropdown short. Each editor loads
with the page even in a closed dropdown: fine for a few per page. With `loadWhenVisible` it loads
only as the dropdown opens (a closed dropdown's box is not displayed, so it is never near the
view before), after a moment of "Loading editor…" (`useNearViewport.js`).

**What loading costs.** The first editor a page loads brings Monaco (about 4 MB, 1 MB
compressed, from `/vendor/`, cached by the browser for a year), the editor's own chunk and the
runtimes request (`/.netlify/functions/runtimes`, cached privately for 5 minutes); each further
editor only its own setup. So ONE editor without `loadWhenVisible` loads all of that with the
page, wherever it sits. An editor in a dropdown with no `loadWhenVisible` is ready the moment its
dropdown opens; the other editors of that page, even with `loadWhenVisible`, then save their own
setup but not Monaco's download. The editor's chunk (`CodeEditorClient.jsx` and everything it imports: over
100 KB, about 36 KB compressed, measured on 2026-10-25) is the same for every editor: it
carries the whole teaching layer (the check helpers, TypeScript, the solution diff, drafts)
even for a plain editor that uses none of it. An accepted trade-off;
splitting off the check helpers and the solution panel would save about a third of it.

**Marked lines and steps** (the line numbers are the lines the reader sees, after the magic
comments are removed; they belong to the OPENING language):

```mdx
<CodeEditor initialCode={snippet} highlight="3-5, 8" />
<CodeEditor
  id="squares"
  initialCode={snippet}
  steps={[
    { lines: '2-4', title: 'Build the list', note: 'The loop fills `result`.' },
    { lines: 7, note: 'Print the sum.' },
  ]}
/>
The <CodeRef to="squares" lines="2-4">loop</CodeRef> runs once per number.   {/* import CodeRef from '@site/src/components/CodeEditor/CodeRef' */}
```

In the snippet itself, the site's code-block comments mark lines and are removed from what the
reader sees and runs: `# highlight-next-line`, `// highlight-start` … `// highlight-end`, and the
kinds `error`, `success`, `warning`, `add`, `remove` (`# highlight-error-next-line` …), exactly
as in `shared/wiring/index.cjs` > `MAGIC_COMMENTS`.

**An exercise:**

```mdx
<CodeEditor
  initialCode={starter}
  expectedOutput={`
5
`}
  tests={`check("add(2, 3)", add(2, 3), 5)`}
  solution={solution}
  hints={['Use the `+` operator.', 'Return `a + b`.']}
  saveDraft
  id="add-exercise"
/>
```

**TypeScript** (no other prop needed):

```mdx
<CodeEditor language="typescript" initialCode={`const total = [1, 2, 3].reduce((s, n) => s + n, 0);
//    ^?
type t = Expect<Equal<typeof total, number>>;
`} />
```

## Props

| Prop | Default | What it does |
|---|---|---|
| `initialCode` | `''` | The code: a string (one language), or `{ [language]: string }` (one snippet per language, in that order). Language names may be any name the library knows: `py`, `python3`, `js`, `node`, `cpp`, `c#`, `golang` … |
| `language` | the first key of `initialCode`, else `'python'` | The language a string snippet is in, or the one an object opens on. |
| `version` | the newest installed | A version selector: `'3.12.0'`, `'3.12'`, `'3'`, `'3.x'`, `'*'`. A string applies to the opening language; `{ [language]: selector }` names each. Write it as a string (the number `3.10` is `3.1`). |
| `foldedRegions` | none | `[[start, end], …]` — 1-based, inclusive; line `start` stays visible, `start+1 … end` are hidden. One list applies to every language; `{ [language]: [[start, end], …] }` gives each its own. Nested folds work; crossing ones are dropped (with a console warning). A fold cannot end on the empty line after a final newline (raw-loader files have one): it ends on the line before, with a console warning. |
| `height` | `'50vh'` | The box's height: a CSS length (`'24rem'`, `'70vh'`, `'calc(100vh - 10rem)'`) or a number of px; the code scrolls inside. `'fit'` makes the box follow the code instead: as tall as the visible code (folded lines do not count), between 80 px and `maxHeight`. A percentage (`'100%'`), `'auto'` or another keyword, or 0 is ignored with a console warning (the box's parent has no height to measure against, so it collapsed the editor): the default height (50vh) applies. Either way the reader can resize the box (→ The box's size). |
| `maxHeight` | `'60vh'` | The ceiling with `height="fit"` (a fixed height ignores it). The same values are ignored (with a warning): the default applies. |
| `stdin` | `''` | Text the program reads from standard input. |
| `showStdin` | `stdin !== ''` | Whether the Input (stdin) field starts open (the reader can toggle it). |
| `args` | `[]` | Command-line arguments. |
| `limits` | 3 s run, 10 s compile | `{ runTimeout, compileTimeout, runMemoryLimit, compileMemoryLimit }` in ms / bytes (`-1` = the server's own). **The effective limits:** a run gets at most **3 s to run and 10 s to compile** (the Piston server's own limits); a larger value is lowered, never refused. The editor applies the rule itself (the library's `effectiveLimits`, used for the request AND the status line, so "Time limit exceeded (3 s)" names the limit the run really had), and the function applies it again. Memory: at most **256 MiB to run and 320 MiB to compile** (the server's settings); a larger value gets Piston's 400, and a value under 1 MiB is refused by the function (Piston would read 0 to 999 as no limit at all). |
| `readOnly` | `false` | The reader can run and fold the code but not change it (no Clear button). |
| `title` | the file name (`main.py`) | The header's title. |
| `editorOptions` | — | Monaco options over the site's defaults (`props.js > DEFAULT_EDITOR_OPTIONS`), e.g. `{ fontSize: 16, wordWrap: 'on' }`. |
| `id` | none | The editor's name for `<CodeRef to>` (`CodeRef/`), its DOM id `code-editor-<id>`, and the key of its saved drafts: a word without spaces (a number reads as its digits). A refused one: a console warning. Two editors with one id: a console warning, and only the first one on the page (the one a `<CodeRef>` scrolls to) takes references. The second is reported as soon as it is in the page, even if it never loads (`index.jsx > useMountRequests`), and a `<CodeRef>` never loads it. |
| `highlight` | none | Lines to highlight: `5`, `'3-5, 8'`, `[3, [5, 7]]` (one console warning per bad part). The OPENING language's lines; a magic comment wins a line marked by both. |
| `steps` | none | `[{ lines, note, title? }]`: a step bar under the code ("Step 2 of 4", Previous / Next), the step's lines highlighted and brought into view (unfolded when folded), its note (inline `` `code` `` allowed) under the bar. Step 1 is highlighted when the editor opens but not scrolled to. The steps follow the OPENING language's code; in another language the bar is hidden. A step whose lines name nothing is dropped with a warning. The bar is inert until Monaco is up, as in the placeholder. Reset keeps the step and brings its lines back into view. After Clear or Use this solution the bar waits for Reset (muted, its buttons off, the note asks for Reset). |
| `hideErrors` | `false` | No run-error marks: no squiggles, no "Line N" rows, and Monaco's own squiggles hidden too (`renderValidationDecorations: 'off'`). A TypeScript syntax error, which stops the run before anything is sent, is named in the notice instead (its line and TypeScript's words). |
| `expectedOutput` | none | The output the program should print: a collapsed "Expected output" block, and after each run a verdict ("Matches the expected output" / "Differs from line N" with a small line diff (− your output, + expected)). Compared on stdout; spaces at line ends, trailing blank lines and CRLF are ignored; one leading newline of the prop is dropped (an MDX template literal starts with one). |
| `tests` | none | A harness (a string for the opening language, or `{ [language]: string }`): a **Check** button that runs the reader's code against it and shows "4/5 passed" with Expected / Got for each failing case. Python, JavaScript, TypeScript, Bash, C, C++, Go (→ Exercises). |
| `solution` | none | The solution (a string, or per language): a **Solution** button opening Monaco's diff of the reader's code against it, with "Use this solution" (one undoable edit). Not on a read-only editor. Its magic comments are removed. |
| `hints` | none | `['…', '…']` (inline `` `code` `` allowed): a light-bulb button in the header that shows and hides the hints area under the code (the first open reveals hint 1; "Show hint 2 of 3" reveals the next; each hint's eye folds it), and before a run the output's idle line adds "Hints available: 3 (click [bulb] to reveal)." while the area is closed (→ What the reader sees > Hints). |
| `saveDraft` | `false` | The reader's code (per language) is kept in their browser (localStorage) and comes back after a reload, with "Restored your saved code · Discard"; Discard and Reset remove it (undoable with ⌘/Ctrl+Z). A changed snippet starts afresh. Give the editor an `id`: without one the console warns (`props.js`), since two id-less editors with the same snippet would share one draft, and old drafts would never be removed. Ignored when `readOnly`. Restored code opens without the author's folds until Discard or Reset. Discard, like Reset, puts the focus in the editor, so ⌘/Ctrl+Z undoes it at once. |
| `loadWhenVisible` | `false` | Monaco mounts only when the editor comes within one window height of the view (`useNearViewport.js`); the placeholder (showing the code as text) until then. A `<CodeRef>` to it mounts it at once. For pages with many editors. |

**The old props still work** (a page written for the old editor needs no change; new props win):

| Old prop | Read as |
|---|---|
| `editorSettings.height` | `height` |
| `editorSettings.options` | `editorOptions` (key by key; `options.readOnly` → `readOnly`) |
| `editorSettings.language` / `defaultLanguage`, `.value` / `defaultValue` | `language`, `initialCode` |
| `editorSettings.width`, `className`, `wrapperProps`, `overrideServices`, `onValidate`, `beforeMount`, `onMount`, `onChange` | passed to `<Editor>` (the three callbacks run after the editor's own) |
| `editorSettings.theme`, `editorOptions.theme` (`editorSettings.options.theme`) | **ignored**, with a console warning (`props.js > PAGE_THEME_WARNING`): Monaco has one theme for the whole page and the reader picks it (→ Editor theme), so a theme one editor named would recolour every editor's code but only its own frame (changed 2026-10-25; no page used it) |
| `outputSettings.language`, `version`, `stdin`, `args` | the same props |
| `outputSettings.run_timeout`, `compile_timeout`, `run_memory_limit`, `compile_memory_limit` | `limits.runTimeout` … |

## What the reader sees

- **Header:** the title, the language picker (only with several snippets), the version picker
  (every installed version, newest first: "Python 3.12.0"; one version shows as text), then
  Reset · Copy code · Clear · Input (stdin) · Copy output · Editor theme (a palette icon) ·
  **Run** (an exercise adds the light bulb (Hints), Solution and **Check** before Run). Every
  icon button has a tooltip. Stop
  replaces Run while a run is waiting (it stops the wait; the server may still finish the run);
  Run and Stop are one button, so the keyboard focus stays on it when a run starts or ends.
  Up to 620 px wide (a phone, a phone on its side, a narrow split view) the header always takes
  two lines (the buttons get a line of their own), so it does not jump when the version picker
  arrives; on a 320 px phone the buttons lose their small gaps, so Run stays on their line.
  The two pickers' menus and the Theme menu leave the page's scroll alone while they are open
  (MUI's `disableScrollLock`: `Toolbar.jsx > PICKER_MENU_PROPS`, `ThemeMenu.jsx`). MUI's scroll
  lock moved a phone's page that is a few pixels wider than the screen by about 535 px, and the
  menu closed under the finger.
- **Colours:** by default VS Code's default themes — its dark one in dark mode, its light one in
  light mode (Monaco's own `vs-dark` / `vs`), switching with the site's colour mode — and the
  frame around the editor (header, borders, pickers, the output's block) in the same VS Code
  colours. In light mode Run (contained) and Check (outlined) use the theme's primary.dark
  (#075f91: 6.2:1 on the header grey #f3f3f3, white on it 6.9:1; `buttonInk.js`), like the
  solution panel's buttons; dark mode keeps MUI's blue. The light failure red is the site's
  `--code-line-error-ink` (#d1242f, 5.2:1 on the editor background).
- **Editor theme** (2026-10-25; the palette icon after Copy output, tooltip "Editor theme"): a
  menu of theme families, the current one checked — VS Code (the default), High contrast,
  GitHub, Solarized, Dracula (like the site's code blocks), One Dark, Monokai — each with a
  swatch and a note ("Follows the site's light / dark switch", or "Always dark"). A family with
  a light and a dark version follows the site's switch; Dracula, One Dark and Monokai stay dark
  on the light site too. A pick recolours **every editor on the page at once** (Monaco has one
  theme per page) and is remembered in the reader's browser (`localStorage`, key
  `code-editor.theme`, the family's id), so it holds on every page, on later visits
  and in other open tabs (the `storage` event); blocked storage (a private window) only means
  it is not remembered. The WHOLE editor follows the theme: Monaco, the frame's `--ce-*`
  colours, the MUI controls (pickers, buttons, the stdin field: the theme's light / dark MUI
  mode), the teaching layer's parts (marked lines, steps, error rows, the exercise panel, type
  queries, the solution diff). They switch on the frame's `data-ce-mode` (the THEME's mode),
  not on the site's (`styles.module.css` > THE EDITOR'S MODE; a theme in the other mode than the
  site's gets the site's code-line tokens and a few Infima colours of its own mode, and the
  browser's own scrollbars in its color-scheme). The Solution panel's colour key shows the
  theme's own diff colours (outlined in High contrast, as its diff is). A page cannot set the
  theme (the old `editorSettings.theme` is ignored, see the table above). The menu is a MUI
  Menu: Enter / Space / ↓ opens it on the checked entry, ↑ / ↓ move, a letter moves to the
  theme whose name starts with it, Enter picks, Escape closes, the focus goes back to the
  button. Every theme's text is 4.5:1 on its background, comments and line numbers 3:1 — and
  on the current line, under every marked line's band (a theme with little headroom has fainter
  or darker bands of its own: `editorThemes.js > LAYER_PROPERTIES`), in the hover and suggest
  widgets (4.5:1), on the exercise diff's rows and a type query's chip
  (`__tests__/editorThemes.test.js` computes it; a selection and a `<CodeRef>`'s brief flash
  are left out, and VS Code's dark theme keeps its 2.99:1 comments on a warning line, as before).
- **The resize strip** under the code (a short bar in its middle, a grip in its right corner):
  drag it to make the box taller or shorter (→ The box's size). Its tooltip: "Drag to resize ·
  double-click (or Enter) for the original size".
- **Input (stdin)** opens the program's input field between the code and the output, on the
  header's grey with space all round; it grows with its text from 2 to 10 rows.
- **Copy code** copies the editor's text — or the page's snippet while the editor is still
  loading or could not load (never an empty clipboard). **Copy output** (a console-window icon,
  so it never looks like Copy code's two sheets) copies what the output area shows: a compiled
  language's warnings, then the program's output (`output.js`); it is greyed out until a run
  printed something, and while a run is waiting. Each result ("Copied", or "Couldn't copy …")
  shows as a check mark and in the tooltip, and is said to screen readers (a polite live
  region). Both try the Clipboard API first and fall back to the old copy command when a browser
  refuses it (`clipboard.js`: an app's built-in browser or a webview may).
- **⌘/Ctrl+Enter** in the editor runs (also in Monaco's F1 palette as "Run code").
- **Reset** brings back this language's original code, closes its folds again and clears the
  output; **Clear** empties the editor. Reset and Clear are single undoable edits, and both put
  the focus in the editor (⌘/Ctrl+Z works at once). Reset's tooltip: "Reset to the original
  code (undo with ⌘/Ctrl+Z)".
- **Output:** a status line — what ran and how it went ("Python 3.12.0 · Exit code 0 · 52 ms CPU
  · 113 ms total · 13.7 MB", "Time limit exceeded (3 s)", "Compile error (exit code 1)") in green
  or red — and the output in a code block titled "Output" (Docusaurus's own copy button on it
  still works; the header's Copy output is the visible one). A failed
  request shows the library's plain words, which say nothing of how the site is set up (the
  code runner isn't available here, the session ended, try again in a moment …); the reason
  goes to the browser's console, for whoever runs the site (`lib/codeRunner/errors.js`).
- **Notices** under the header: "Python 3.10 isn't installed; using 3.12.0." (info, until the
  reader picks a version) or "Ruby isn't installed on the code runner." (warning; Run is off).
- While the reader has edited any language, a site's after-deploy reload waits (`unsavedWork.js`).
  A restored draft counts as edited from the start, shown or not (`dirtyLanguages.js`): Monaco
  sends no change event for the code an editor opens with. The reload waits for typed program
  input too, focused or not, until the field is back at the page's own value
  (`useUnsavedInput.js`).
- **Run errors** (every editor, unless `hideErrors`): after a failed run the lines the errors
  point to are squiggled in the code (the message in the hover; Alt+F8 / Shift+Alt+F8, Option+F8
  on a Mac, step through them — not plain F8, which can jump to another editor's model) and
  listed under the status line ("Line 4 · IndexError: list index out of range", at most 10, then
  "N more in the output below"), each with **Go to line** (any fold opened, the cursor there,
  the focus in the editor). After a successful run nothing is marked, even an error the program
  caught and printed itself (`traceback.print_exc()`, `console.error(err)`, Go's log lines),
  except Bash's errors (Bash goes on after "command not found"; `runErrors.js >
  MARKED_AFTER_SUCCESS`); never warnings. When more rows would show than fit, errors keep theirs
  before warnings. A failed C/C++ `assert()` is marked on its line. The squiggles go on the next
  edit, run, Reset, Clear or language switch; the rows stay with the output. A read-only editor
  shows them too.
- **Marked lines and steps** (`highlight`, magic comments, `steps`): the site's code-line colours
  (`shared/css/_code-blocks.scss`), light and dark, except that a highlighted line — and the
  current step's lines — also get a blue bar on the left and a stronger blue-tinted band in dark
  mode (`guided.module.css`). A step over a line the author marked leaves that line its kind's
  colours (band, edge, number); the step shows underneath. The marks follow the reader's edits;
  a line the reader deletes or pastes over takes its mark with it. The step bar sits under the
  code. A `<CodeRef>` scrolls the editor into view, then reveals its lines, keeps them in the
  window (a fit editor grows when a fold opens) and briefly flashes them (or goes to its step);
  a request that arrives while the editor closes folds waits for them. Screen readers hear a
  `<CodeRef>`'s result from a hidden status region and get the marks in words from a hidden
  summary before the code.
- **Exercises:** the light bulb (Hints) and Solution are icon buttons after Editor theme;
  **Check** is an outlined text button just before Run (Stop while the check waits; Run and
  Check never wait at the same time). The hints area and the solution panel sit under the step
  bar, above the stdin field; the verdict, the check's results and the "Expected output" block
  in the output area.
- **Hints** (`hints`; the design of 2026-10-26, `HintList.jsx`):
  - The light bulb is a show / hide toggle of the hints area, like Input (stdin): one name,
    "Hints", aria-pressed, tooltip "Show hints" / "Hide hints". The FIRST open reveals hint 1;
    closing hides the whole area; reopening brings it back exactly as it was (how many hints
    are revealed, which are folded). The bulb never reveals anything past hint 1.
  - The revealed hints are stacked in order, hint 1 on top, each a box: a header row with "Hint
    2 of 3" on the left and an eye button on the far right, the text under it (inline
    `` `code` ``). The eye folds the hint to its header row and unfolds it: a real button, "Hide
    hint 2" / "Show hint 2", aria-expanded, aria-controls naming the text. Its icon says what the
    click does, as a password field's eye does (decided on 2026-10-28): the crossed-out
    eye while the text shows (click: hide), the open eye while the hint is folded (click: show).
  - While a hint is still hidden, "Show hint 3 of 3" under the last revealed one reveals the
    next (unfolded) and keeps the focus; the press that reveals the last one moves the focus to
    that hint's eye, since the button goes (`exerciseView.js > focusAfterReveal`). A polite
    live region reads each revealed hint out ("Hint 2 of 3: …") and empties itself a few
    seconds later (`useFleetingText.js`), so the hint is not left in the page a second time for
    a screen reader to meet; folding that hint empties it at once. A reopen reads nothing new.
  - The cue: before any run, while the area is closed, the output's idle line adds "Hints
    available: 3 (click [bulb] to reveal)." — the same words for one hint — with the header's
    light bulb drawn inline at the text's size (screen readers hear "the Hints button", the
    button's name as they announce it; `IdleLine.jsx`, which the placeholder draws too, so
    nothing jumps on load; the failure frame has no light bulb and no cue). The editor works
    out the count (`useExercise.js > hints.cue`: 0 while the area is open).
  - Nothing is saved: a reload starts closed. Reset (the code) and a language switch leave the
    hints as they are (one state for the editor, `useExercise.js`; the rules:
    `exerciseView.js` > HINTS).
- **Saved drafts:** the notice "Restored your saved code · Discard" under the header (it may
  add one banner's height after the page loads).
- **Reading on a phone or tablet** (2026-10-26; `touchMode.js`): a device whose primary pointer
  cannot hover and is coarse (`(hover: none) and (pointer: coarse)`: iPhone, iPad — with a
  trackpad too —, Android; never a desktop, a laptop or a touch-screen laptop) gets the STATIC
  VIEW instead of Monaco, decided once when the editor mounts (`index.jsx > ClientEditor`,
  inside the BrowserOnly callback; the placeholder is the same on every device). The code is
  highlighted text in the chosen editor theme (`prism-react-renderer`, Docusaurus's own, coloured
  from `editorThemes.js` through `prismTheme.js`: a few small differences from Monaco's
  tokenizer — `console` in the type colour, a C `#include` hash in the directive colour,
  Python's `print` in the type colour), with line numbers, the author's bands and the current
  step on its lines, a `<CodeRef>`'s flash, and the folds as "⋯ 5 lines" markers that open on
  a tap (a chevron closes them again). It can be selected (a long press copies code only, no
  numbers), found in the page, and it scrolls WITH the page: no fixed height, no inner scroll —
  a 50vh editor becomes as tall as its code when the view arrives (one height change; a
  `height="fit"` editor's changes too: its lines are the placeholder's size, but the box has no
  ceiling where the placeholder stops at `maxHeight`, a long line wraps, and the Tap to edit bar
  is 44 px where the strip was 24). Monaco is not downloaded. Under the code, where
  the resize strip would be, a full-width **Tap to edit** bar (44 px; none on a read-only
  editor) mounts Monaco in a box as tall as the code, up to the screen, starting at the height
  the static code had, so nothing moves under the finger until Monaco has laid out — and never
  at the height Monaco measures in its still-hidden box, which with word wrap on is one line per
  character (`monacoSetup.js > laidOutContentHeight`; an iPhone showed a full-screen box for four
  lines before that guard, 2026-10-26) (`touchMode.js >
  touchSettings` / `TOUCH_BOX`: the fit machinery, whatever `height` the page gave — the static
  view never showed it, and a 50vh box at the tap moved the page under the finger and left an
  empty area whose swipes Monaco swallowed; the strip still resizes it), with the static view's
  current text and touch options (`touchOptions.js`: word wrap on, hover off, suggestions off — the quick
  ones and the ones a `.` triggers — and parameter hints off, a three-digit gutter, and Monaco
  pinned to its hidden textarea with `editContext: false`) and that textarea at 16 px so iOS
  does not zoom on the first tap (the Input field's too, through MUI 9's `MuiInputBase-multiline`
  and `MuiInputBase-input`, which `staticStyles.test.js` reads off a field the installed MUI renders;
  `static.module.css` under the frame's `data-ce-touch`; the pin keeps the rule reaching the focused input on every browser, since
  Monaco 0.55 otherwise renders an EditContext element instead where the browser has the API). Output, hints, steps, drafts,
  theme and stdin stay through the tap; the author's folds come back only where the text is
  still the snippet; the marks of a language left stale by Clear or "Use this solution" wait
  for Reset; the static view's open folds are not carried over. There is no way back to the
  static view (a follow-up), except when Monaco cannot load after the tap (a lost connection, a
  missing file): then the static view comes back with its text and a working Run, under the
  notice "The editor could not load. Reload the page to try again."; a Run that waited for Monaco
  is dropped, **Tap to edit** is greyed out (the loader keeps its failure, so a second tap would
  fail at once), and only a TypeScript editor's Run and Check stay greyed out (they compile in
  Monaco); Go to line shows only while there is code to go to (`touchMode.js > viewAfterLoad`,
  `runBlockingError`). To scroll past the open editor, swipe on the line numbers or
  outside the box (Monaco takes a swipe on the code). Run, Check, Copy code, Reset, Clear, the
  Solution panel (a plain diff, `StaticSolution.jsx`; "Use this solution" puts it in — there is
  no undo in the static view, so Reset brings the page's code back, and while the language
  shows a restored draft the button is greyed out: Tap to edit first, where ⌘/Ctrl+Z undoes
  it), Go to
  line on an error row (the fold opens, the line flashes, the page scrolls to it; no squiggles)
  and a `<CodeRef>` all work on the static text; a TypeScript editor's Run or Check mounts the
  editor first and runs once it has a model (TypeScript compiles in Monaco's worker;
  `usePendingAction.js`). The idle line says "Run the code to see its output." (no ⌘/Ctrl+Enter).
- **Printing:** a printout shows every editor's whole code, folds opened, as the reader last
  left it: in the Monaco view the box and its resize strip are hidden in print and a plain copy
  of the code takes their place (`PrintCopy.jsx`: a hidden `<pre>` after the box, refreshed with
  the editor's text on the browser's `beforeprint` event); the static view prints its own lines
  with the hidden ones shown and the buttons left out; every placeholder prints its snippet — the
  waiting one its own box, the loading one and the failure frame a print-only copy after the box
  (`index.jsx > PrintOnlyCode`, in the server's HTML already; the failure message prints too).
  The Monaco print copy and the placeholders print in paper black whatever the theme
  (`--ce-print-fg`, set on the frame under `@media print` in `styles.module.css`; a dark theme's
  text would be near-invisible on white), each on white paper of its own that prints even with
  the browser's "Background graphics" off (`print-color-adjust: exact`): with backgrounds on, a
  transparent copy let a dark theme's frame show through (black on #1e1e1e, 1.26:1). The static view is the exception, on purpose: its
  tokens are coloured inline, so it prints its theme block as it is (`print-color-adjust`), the
  bands with it — legible, and dark for a dark theme.

## The box's size

`sizing.js` reads the page's `height` (`readHeightProp`) and gives the box its first style
(`editorBoxStyle`):

| The page gives | The box |
|---|---|
| no `height` | 50vh (`DEFAULT_HEIGHT`, the original editor's size); the code scrolls inside |
| a length (`height="24rem"`, `height={400}`) | that height |
| `height="fit"` | as tall as the visible code (folded lines do not count), between 80 px (`MIN_HEIGHT_PX`) and `maxHeight` (default 60vh); it follows edits, folds and language switches (`autoHeight.js`) |
| a refused length (`'100%'`, `'auto'`, `0`) | 50vh, with a console warning ("… the default height (50vh) applies") |

**The reader resizes it** with the strip under the code (`ResizeHandle.jsx`; the rules in
`resize.js`):

- **Drag** the strip, or the grip in its right corner, up or down — with a mouse, a pen or a
  finger (the strip has `touch-action: none`, so a finger's drag does not scroll the page; the
  drag goes on when the pointer leaves the strip, through `setPointerCapture`). A press becomes a
  drag only after the pointer moves 3 px (`DRAG_START_PX`), so a click changes nothing; only the
  pointer that pressed counts. On a touch screen the strip is 24 px tall (12 px with a mouse).
- **Keys:** the strip is a focusable separator called "Resize the editor", after the editor in
  the Tab order (inside the editor Tab indents: reach the strip with Shift+Tab from the Input
  field or the text below, or press Ctrl+M — Ctrl+Shift+M on a Mac — so Tab leaves the editor).
  Then Arrow Down / Up (40 px taller / shorter, `KEY_STEP_PX`), Page Down / Up (200 px,
  `PAGE_STEP_PX`), Home (the shortest), End (the tallest), Enter (the page's size). Screen
  readers hear its height (aria-valuenow, in px).
- **Bounds:** never shorter than 80 px, never taller than 90% of the window
  (`MAX_VIEWPORT_SHARE`) — unless the box already was shorter or taller when the drag began (a
  page's fixed `height`), so a drag never makes it jump.
- **Double-click** the strip (two quick taps on a touch screen, or Enter): back to the page's
  size (the fixed height, or following the code).
- **With `height="fit"`** a drag or a key stops the box following the code (`autoHeight.js >
  stop`: the box is pinned at the height it is drawn at, then the `maxHeight` ceiling is lifted,
  so nothing jumps) until that reset (`resume`, which also puts the ceiling back).
- The reader's size is not saved: a reload brings back the page's.

## Page-wide Monaco settings

Some of Monaco's settings are one per PAGE, not per editor: the JavaScript / TypeScript checking
options (`typescript.js > configureTypeScript`, which replaced `monacoSetup.js >
configureTypeScriptChecking` on 2026-10-25), the themes (so the reader's theme is one for the
page: `useEditorTheme.js` keeps one store that every editor reads, and each editor's
`beforeMount` calls `editorThemes.js > defineEditorThemes`, which registers the custom themes
once per page), and Monaco's own model defaults. Every
change to the TypeScript options restarts Monaco's TypeScript worker, so each editor's
`beforeMount` calls `configureTypeScript` but only the first one changes anything (it compares
before it sets). TypeScript is checked strictly (with `moduleDetection: force`, so two editors
declaring the same names no longer clash); JavaScript keeps syntax checking only. Infima's global
`code` rule is undone inside the editor (`styles.module.css`: border, size, vertical alignment),
so inline code in Monaco's hovers looks like Monaco's own.

## TypeScript

TypeScript is checked and compiled **in the reader's browser** by the self-hosted Monaco's own
TypeScript (5.9.3): live type errors and hovers, strict mode, target ES2022, CommonJS modules,
and the built-ins of the newest Node (20.11.1: ES2023's `toSorted`, `findLast` …;
`typescript.js > TS_LIB_NEWEST_NODE` — the lib follows the newest Node, not the target). The
emitted JavaScript runs on the code runner's **newest Node** as `main.js` (`runtimeChoice.js >
BROWSER_COMPILED`; ES2022 needs a recent Node), so a TypeScript editor has no version menu: its
header reads "TypeScript 5.9.3 · Node 20.11.1", and a `version` prop for TypeScript selects
nothing (Piston's own TypeScript runtime is no longer used).

- A **syntax** error stops the run before it is sent: "TypeScript found a syntax error on line 2
  (Expression expected.): fix it, then run again." (several: "TypeScript found 3 syntax errors,
  the first on line 2 (…): fix them, …"; `messages.js > syntaxBlockedText`) with its "Line N"
  rows (Monaco already squiggles it); the notice names the line even when `hideErrors` hides the
  rows. **Type** errors do not (as tsc emits anyway): the code runs and the status line ends
  with "· 2 type errors".
- A top-level `await` / `for await` runs: Run sends the JavaScript inside `(async () => {` …
  `})();` (`typescriptRun.js > wrapForTopLevelAwait`; the opening goes on the unmapped "use
  strict" line, so error lines still map) and does not count it as a type error. TypeScript's
  "set the 'module' option" squiggle is hidden (codes 1378 / 1432 join
  `diagnosticCodesToIgnore`). Check refuses it before sending, since the reader's code runs as a
  script there: "A Check cannot run a top-level await …" with its "Line N" rows.
- Run and Check use the code as it was at the click. Check type-checks and emits that one text
  in temporary models (`prepareTypeScriptCheck`). Run compiles it again on its own if the reader
  typed while the worker was starting. Stop during the compile ends the wait at once
  (`useCodeRun.js > payloadUnlessStopped`), and nothing is sent.
- A runtime error's line is mapped back from `main.js` to the TypeScript through the emitted
  source map, by line and column (TypeScript joins a call written over several lines into one
  JavaScript line).
- The global type helpers `Expect`, `Equal`, `NotEqual`, `IsAny`, `IsUnknown`, `Debug` and Node's
  `require` (with `require.main`, `require.resolve`), `process` (with `process.hrtime()`),
  `module`, `setImmediate`, `global` … need no import (`typescriptLibs.js`).
- `// ^?` on the line under an expression shows its inferred type at the end of that comment line
  (twoslash style; `twoslash.js`). It is drawn text: screen readers get the same type from the
  hover (Ctrl/⌘+K Ctrl/⌘+I).
- In an exercise, **Check** passes when the reader's code plus the harness has no type error (so
  a harness can hold type tests: `type t = Expect<Equal<A, B>>;`) AND every runtime `check(…)`
  passes. `check` is typed `check<T>(name, got: T, expected: NoInfer<T>)`: cast a deliberate
  mismatch. The harness is type-checked after the reader's code, inside its own `namespace`
  (`typescript.js > combineWithHarness`). Its names shadow the reader's instead of clashing (a
  reader's own `check` or `const result` is fine), and the reader's code cannot call `check()`
  (it cannot at run time either). An error on a line the checker adds reads "Tests", with no
  line number.

## Exercises

`tests` is a harness that calls `check(name, got, expected)` for each case; Check runs it with
the reader's code in a file of its own (so its error lines stay true) and reads one result line
per check (`lib/codeRunner/exercise.js`, `checkHelpers.js`):

- **Python, JavaScript, TypeScript, Bash:** top-level code that uses the reader's names
  directly (Python: the reader's top-level code runs on import; an `if __name__ == '__main__':`
  block does not). Bash: `check "add 2 3" "$(add 2 3)" 5`.
- **C, C++, Go:** the BODY of `main` (statements; in C and C++ the body of a void function `main`
  calls, so no `return` with a value); `#include` lines and one-line Go `import "pkg"` lines move
  to the top. The reader's own `main` is renamed and never runs, and no `#define` of the
  reader's (`#define int long long`) reaches the real one. The C helper includes only
  `<stdio.h>`, the C++ one only `<iostream>`, `<sstream>`, `<string>`, `<string_view>`,
  `<vector>`, `<optional>`, `<iterator>`, `<utility>`, `<type_traits>` and
  `<initializer_list>`, so a reader's own `strlen`, `pow`, `count`, `y1` or `index` compiles as
  in a Run. A harness #includes what else it uses (`<stdbool.h>` for `true`, `<math.h>` for
  `INFINITY`, `<cmath>` for `HUGE_VAL`).
- **Equality:** floats within 1e-9 (relative; single precision within 1e-6); Python's `True` is
  not `1`; Go's nil slice equals an empty slice. C compares an integer against a floating
  expected value as floating point (an `int` 1 fails against 1.5); JavaScript compares whole
  numbers exactly only up to 2^53 (larger ones are floats, within the tolerance; BigInt is
  exact); a Python class equals another object only through its `__eq__`, and two unequal values
  that print the same are shown with their type.
- Check gives the program the same Input (stdin) and `args` as Run (the reader's top-level code
  runs during a check, so an `input()` there reads the Input field).
- The verdict: "4/5 passed" (green only when everything passed), each failing case with Expected
  and Got, the harness's other output, the error output; a crash or compile error says "The check
  did not finish …" and marks the reader's lines as a run would; after a switch to another
  language the result stays, under the checked language's name ("Python · 2/4 passed"), and a
  waiting check keeps its Stop button.

## How the version is chosen

The editor never hard-codes a version. It asks the code runner which runtimes are installed
(`GET /.netlify/functions/runtimes` → Piston's `/api/v2/runtimes`, once per page load for all
editors) and chooses from that list (`runtimeChoice.js`, the library's `runtimes.js`):

| The runtimes are… | The editor |
|---|---|
| known, the language installed | runs the newest version matching `version` (none = the newest); a selector nothing matches → the newest + an info notice; the reader can pick any installed version |
| known, the language missing | shows a warning and disables Run |
| unknown (loading, or the request failed — `npm start`) | keeps editing working, shows the asked version as text, and Run sends the selector as it is (`'*'` without one, or for `'latest'`): the run then reports the real problem |

Installing a new **version** on the Piston server is all it takes for it to appear in that
language's version menu on the next page load. A new **language** is used by giving a page a
snippet in it (`initialCode` / `language`): the language picker lists only the languages the
page gave code for, so a language is never added to a menu by itself. A language the library
does not list still runs if Piston has it (it is highlighted as plain text): add it to
`lib/codeRunner/languages.js` for its label, highlighting and file name.

## How the folds are made reliable

`folding.js` (the old editor folded before Monaco was ready, never cleared old folds, and lost a
fold ending on an empty line): the ranges are checked first (`lib/codeRunner/folds.js`:
bad, crossing or too-long ranges are dropped or clamped, each with a console warning) against
the last line a fold can end on — the last line, or the one before it when the code ends with
a newline (Monaco would end a fold on that empty last line one line early, and fold `[N-1, N]`
not at all); then, one frame after the model is shown, earlier folds are cleared, each range
is selected and folded **innermost first** with Monaco's "Create Folding Range from
Selection" (awaited), and the view goes back to line 1. While a language's first folds close,
the loading cover hides the code; with `height="fit"` the box also keeps its height
(`autoHeight.js`: Monaco reports the unfolded height first), so neither the code nor the page
below jumps, and takes the code's height when the folds are done (or after 2 s at most). Each
language is folded once, when first shown; switching back keeps the reader's own folds (and,
with `height="fit"`, fits the box to that language's code); Reset folds again. On a language's
first show, an editor with no folds is left as it is (`folding.js > applyFolds` with `clear:
false`), so a waiting `<CodeRef>` does not wait the 200 ms or more for Monaco's folding model.

## Loading without a jump, and Monaco from the site

`index.jsx` is what the server renders: a placeholder of the editor's final size (the same
frame and hint; the same header, its buttons drawn as empty spaces of their size so a phone
wraps it the same way — an exercise's light bulb, Solution and Check included; the box at 50vh
or the page's `height` — with `height="fit"`, as tall as the code will be once folded; the resize
strip, an inert one of the same height; the step bar, inert; the stdin field's space, as many rows
as the field will show, when it starts open; the idle line, with an exercise's hint cue and its
light bulb (`IdleLine.jsx`, shared with the output area); an exercise's closed "Expected output"
block). The hints area is closed on every load, so it is not drawn.
For an exercise or a TypeScript editor the header's pickers or version text sit in a runtime
slot of one fixed width (13rem; 16rem with a language picker; `props.js > runtimeSlotFor`),
drawn empty in the placeholder, so both headers wrap at the same widths whatever version text
arrives later; a longer text ends in an ellipsis. The placeholder's "Expected output" block is
inert until the editor arrives (it is replaced, so an opened block would snap shut); in the
failure frame it works. A `loadWhenVisible` editor that is not near yet is not "loading": its
placeholder shows the snippet as plain text where Monaco will draw it (no aria-busy;
find-in-page, printing and screen readers see the code); "Loading editor…" shows only while the
editor really loads. With `height="fit"`, Monaco's horizontal scrollbar is not counted in the
box's height and is 8 px thin, over the bottom padding (`props.js > FIT_SCROLLBAR_OPTIONS`), so
a long line no longer makes the box 12 px taller on load.
The server cannot read the reader's stored theme, so the placeholder always draws the DEFAULT
theme (VS Code's, in the site's mode, from `styles.module.css` alone: it carries no
`data-ce-mode`, and `html[data-theme='dark'] .frame:not([data-ce-mode])` follows the mode
Docusaurus sets before the first paint); a stored theme recolours the editor when it arrives —
colours only, never a size. None of the theme files is in the page's first download.
An editor with `id` or `loadWhenVisible` is wrapped in one element that carries the DOM id
`code-editor-<id>` and that `useNearViewport.js` watches; an editor with neither renders
exactly as before (`__tests__/backCompat.test.js`).
The real editor (`CodeEditorClient.jsx`, with Monaco and MUI) loads in the browser only, in its
own chunk. If that chunk does not arrive (a dropped connection, a deploy that replaced it) or
the editor crashes, only this editor fails: an error boundary shows the placeholder frame with
"The editor could not load. Retry, or reload the page." and a **Retry** button, which imports
the chunk again (a failed import is not remembered: editors drawn later try again too). Retry
cannot bring back a chunk that a deploy replaced (the page still asks for the old file's name);
a reload can, hence the words. Where there is no Run to press —
that frame, and an editor whose Run is greyed out because Monaco could not load — the idle line
says "The output will show here once the editor loads." instead of asking for a Run, in the
same place, so the frame keeps its height (`IdleLine.jsx > unavailable`). Monaco's files are served by the
site itself (`shared/plugins/monaco-editor`: `/vendor/monaco-editor-<version>/vs`, from the installed
`monaco-editor` package) — never a CDN; without that plugin the editor shows an error instead
of loading from elsewhere.

## The files

| File | What it is |
|---|---|
| `index.jsx` | the public component: normalises the props, the server-rendered placeholder, the lazy browser-only client inside its error boundary (Retry), the wrapper with the DOM id and `loadWhenVisible` |
| `CodeEditorClient.jsx` | the editor in the browser: Monaco, models per language, folds, runs (and TypeScript's compile before them), the auto height, the resize (`startResize`, `resetSize`), the unsaved-work flag; it wires the teaching layer's hooks below |
| `useGuided.js` | the marked lines, the steps and `<CodeRef>` requests (when to set marks, change step, reveal and flash; the registry handle); `createGuide` (the rules, without React): reveals wait for a fold pass, stale steps after Clear, the screen-reader words; tested by `__tests__/useGuided.test.js` |
| `decorations.js`, `guided.module.css` | the marked lines on each language's model (kinds, the step drawn under them, the flash; global classes; marks that follow edits) and `revealLines` (unfold, then scroll) |
| `StepBar.jsx`, `StepBar.module.css`, `codeSpans.js` | the step bar ("Step 2 of 4", Previous / Next, the note in a live region); inline `` `code` `` in notes and hints |
| `useRunErrors.js`, `runErrors.js` | the run-error markers in the editor; which locations are shown and squiggled (pure: a failed run all, a successful one nothing but Bash's errors — `MARKED_AFTER_SUCCESS` —, TypeScript's blocking syntax errors rows only) |
| `runMarkers.js`, `ErrorList.jsx`, `ErrorList.module.css` | the squiggles (Monaco markers, owner `dwf-run`), Go to line, the `renderValidationDecorations` rule (defined in `props.js`, re-exported); the "Line N · …" rows (at most 10, errors before warnings: `fittingLocations`) |
| `useExercise.js` | an exercise's state: Check (its own run), the expected-output comparison, the solution panel, the hints area (open, revealed, folded: one state per editor, kept through Reset and a language switch) |
| `ExercisePanel.jsx`, `ExercisePanel.module.css`, `ExpectedOutput.jsx`, `exerciseView.js` | the exercise part of the output (verdict and diff, Check's headline, cases, type errors, outputs; the collapsed "Expected output" and its placeholder, MUI-free); their pure logic, and the hints area's rules (`HINTS_START`, `toggleHintsArea`, `revealNextHint`, `toggleHintFold`, `nextHintNumber`) |
| `SolutionPanel.jsx`, `SolutionPanel.module.css`, `solutionDiff.js` | the Solution panel: Monaco's diff view made imperatively (not `@monaco-editor/react`'s `DiffEditor`, bug #647), its colour key in the theme's diff colours (`editorThemes.js > diffKeyOf`), "Use this solution", "Close" |
| `HintList.jsx`, `HintList.module.css`, `useFleetingText.js` | the hints area under the code: the revealed hints as boxes ("Hint 1 of 3", the eye that folds one, its text), "Show hint 2 of 3", the live region that reads a revealed hint out and empties itself a few seconds later (`useFleetingText`); MUI-free (the eye icons are MUI's paths, inline) |
| `IdleLine.jsx` | the output's line before any run, with an exercise's hint cue ("Hints available: 3 (click [bulb] to reveal).", the header's light bulb inline); MUI-free, drawn by the placeholder and the output area alike |
| `drafts.js` | saved drafts in localStorage: the key, load / save / clear, the debounced saver, the page-hide flush |
| `draftSession.js` | the `saveDraft` rules without React (`createDraftSession`, `draftsEnabled`) |
| `useDrafts.js` | the React side of `draftSession.js` (one session per mount; flush on page hide and unmount) |
| `dirtyLanguages.js` | which languages hold edits, told to the editor's own `unsavedWork.js`; restored drafts are dirty from mount |
| `unsavedWork.js` | the registry of "an editor holds unsaved text" (one flag per editor); a site's after-deploy reloader reads `hasUnsavedWork()` (→ The folder is the whole component) |
| `useUnsavedInput.js` | typed program input (stdin) sets that registry's flag too, under a holder of its own, while it differs from the page's |
| `MuiScope.jsx` | the editor's own MUI theme provider: light and dark palettes (the shared blues and greys), the page's font; `muiThemeFor(mode)` |
| `editorFont.js` | the code's font stack from the page's CSS variables (`resolveFontFamily`, `firstFamilyOf`); nothing hard-coded |
| `CodeRef/`, `lib/codeRunner/`, `lib/registry/` | `<CodeRef>` and its README; the run library and its README; the page registry |
| `useNearViewport.js` | the IntersectionObserver hook behind `loadWhenVisible` |
| `touchMode.js` | the touch gate (2026-10-26): `VIEWS`, `TOUCH_MEDIA_QUERY` (which devices get the static view), `TOUCH_ATTRIBUTE` (the frame's `data-ce-touch`, the CSS's only touch hook), `TOUCH_BOX` / `touchSettings` (after the tap the box fits the code, up to the screen), `viewFor(window)`, `staticRunPolicy` (TypeScript mounts Monaco before a run), `viewAfterLoad` (back to the static view when Monaco cannot load after the tap), `runBlockingError` (the views a failed Monaco greys Run out in) |
| `touchOptions.js` | Monaco's options after "Tap to edit" (`TOUCH_EDITOR_OPTIONS`: word wrap, no hover, no suggestions (quick or on a trigger character), no parameter hints, `lineNumbersMinChars` 3, `editContext: false` so Monaco keeps its textarea; the page's options still win), `mergeOptions` (the one-level merge `props.js` uses too) |
| `surface.js`, `monacoSurface.js`, `staticSurface.js` | the ONE contract the shell and the hooks use to reach the code (`hasModel`, `getValue`, `setValue`, `marks`, `reveal`, `linesBox`, `markers`, `goTo` …; `isSurface`, `noopMarkers`), over Monaco (delegating to `decorations.js`, `runMarkers.js`, `monacoSetup.js`, `CodeRef/goToEditor.js`'s `monacoLinesBox` / `monacoLayoutSettled`) and over the static view's stores and host element |
| `staticCodeStore.js`, `useStaticStores.js` | the static view's store (the text, its lines, the folds closed or open, the marks, the step, the flash; `openFoldsHiding` opens exactly the folds that hide a line, `setText` drops the folds and marks), one per language for the editor's life (`storeFor`, `reset`) |
| `StaticBox.jsx`, `StaticCode.jsx`, `static.module.css` | the static view: the box (one surface for its life, `onModelShown(language)` on each switch, the **Tap to edit** bar: `TouchBar`, `STATIC_BOX_PROPS`) and the code as highlighted text (`WORDS`: the fold buttons' and the bar's words; `staticCodeStyle`: Monaco's metrics; the lines carry `decorations.js`'s global kind classes, so `guided.module.css` colours them); the look, the two touch rules (the 16 px textareas) and the print rules |
| `prismTheme.js` | the editor theme as a Prism theme: `ROLE_PRISM_TYPES` (registry role → Prism token types), `UNMAPPED_PRISM_TYPES` (what stays in the text colour), `BUILT_IN_SYNTAX` (vs / vs-dark / hc-light / hc-black, from Monaco's `themes.js`), `roleColorsOf`, `prismThemeOf(name)`, `prismLanguageFor(monacoId)` (`shell` → `bash`; `text` for a grammar the site lacks) |
| `StaticSolution.jsx`, `StaticSolution.module.css`, `DiffRows.jsx` | the static view's Solution panel: a plain diff of the reader's code against the solution (every line, `STATIC_DIFF_MAX_ROWS`; its bands take the colour key's colours), Use / Close as `SolutionPanel.jsx` draws them; the diff rows list shared with the output diff (`SIGNS`, `ROW_CLASSES`) |
| `usePendingAction.js` | a Run or Check kept until Monaco has a model (`PENDING_ACTIONS`): TypeScript from the static view; `cancel()` drops it when Monaco cannot load |
| `PrintCopy.jsx`, `PrintCopy.module.css`, `usePrintRefresh.js` | the printout's copy of the code: a hidden `<pre>` after the Monaco box, shown only under `@media print` (wrapped; a `<pre>` hides no fold), its text replaced with the editor's current code on the window's `beforeprint` (`PRINT_EVENT`, `refreshPrintText`) |
| `typescript.js`, `typescriptLibs.js`, `typescriptRun.js` | TypeScript in the browser: the page-wide checker settings (`configureTypeScript`), compiling with Monaco's worker, an exercise's type check and emits, the line mapper; the global declaration files; what Run and Check do with it (syntax errors stop, type errors are counted) |
| `twoslash.js`, `twoslash.module.css` | `// ^?` type queries (visual only: the hover gives the same type from the keyboard) |
| `runPhases.js` | the run phases (useCodeRun re-exports them), importable by pure modules |
| `autoHeight.js` | the box's height with `height="fit"`: one change per animation frame, held while the fold cover is up, stopped by a drag (resumed by a double-click) |
| `ResizeHandle.jsx` | the resize strip under the code and its corner grip: pointer drag, keys, double-click / double tap / Enter |
| `resize.js` | the resize rules: the bounds, when a press becomes a drag, a drag's height, each key's step, the reset key, a double tap |
| `output.js` | what Copy output copies (what the output area shows) |
| `clipboard.js` | putting text on the clipboard, with the old-command fallback |
| `Toolbar.jsx` | the header bar (title, pickers, actions) |
| `buttonInk.js` | the light-mode primary.dark (#075f91) for Run, Check and the solution panel's buttons |
| `OutputPanel.jsx` | the status line, notices and output blocks; the idle line (`IdleLine.jsx`) before any run |
| `props.js` | the props → one settings object (new > old > default); Monaco's default options; the first box height |
| `sizing.js` | heights: the default (50vh) and `height="fit"`, CSS lengths (and the refused ones), Monaco's line height, the last foldable line, the estimate before Monaco loads, the stdin field's rows |
| `runtimeChoice.js` | which version runs and what the header shows (TypeScript: the newest Node, as text) |
| `folding.js` | the Monaco side of pre-folding |
| `editorThemes.js` | the themes registry, in one place: the families of the Theme menu (`THEME_FAMILIES`, `DEFAULT_FAMILY` = VS Code), each concrete theme's Monaco definition and frame colours (`EDITOR_THEMES`; a theme's own teaching-layer bands and type chip: `LAYER_PROPERTIES`), `resolveTheme(family, siteMode)`, `defineEditorThemes(monaco)` (once per page), `THEME_MENU_FAMILIES` (the menu's prop), `frameAttributesOf` (the frame's `data-ce-mode` and `--ce-*` style), `diffKeyOf` (the Solution panel's colour key); pure data, no React; each palette credited in its header |
| `themeChoice.js` | the reader's theme in `localStorage`: the key, read / write / validate, other tabs' `storage` events (no React; nothing throws) |
| `useEditorTheme.js` | the page's one theme: a store over `useSyncExternalStore` (one `storage` listener per page), and `useEditorTheme()` → `{ family, setFamily, theme }`, resolved for the site's colour mode |
| `ThemeMenu.jsx`, `ThemeMenu.module.css` | the header's Theme button and its menu (one `menuitemradio` per family, swatches whose "Aa" is CSS generated text so type-ahead reads the label, notes; words in `ThemeMenu.jsx > WORDS`) |
| `monacoSetup.js` | the default family's theme names (`THEME_DARK` / `THEME_LIGHT`, `themeNameFor`, read from `editorThemes.js`), font re-measuring, model addresses, undoable replace, model clean-up |
| `useMonacoLoader.js`, `useRuntimes.js`, `useCodeRun.js` | hooks: load Monaco from the site (after a failed load, the loader's own unhandled copies of that failure are marked handled: THE LOADER'S LEFTOVERS); the installed runtimes; one editor's runs (Stop — at once, also during a TypeScript compile — replace, phases; a payload or a promise of one) |
| `messages.js` | every word the editor shows (the panels: their own `WORDS`) |
| `styles.module.css` | the look (the frame's `--ce-*` colours — the default theme's, VS Code's, light and dark; the editor's mode, `data-ce-mode`, its color-scheme, and a theme in the other mode than the site's; the header's two lines up to 620 px and its gapless actions below 341 px; the resize strip; spacing; the Check button; `.anchor`) |
| `package.json` | `"type": "module"`, so `node --test` reads the `.js` files as ES modules (the three subfolders carry their own) |
| `__tests__/` | `paths.js` (where the site's packages are: `resolvePackage`, `SITE`, `NODE_MODULES`; no fixed depth), `fixtures/snippets/` (copies of a site guide's snippets, and `tally-votes.py`, a made-up stand-in for a blog post's), `fixtures/prism/` (the guide's snippets joined per language, for the Prism token check), `jsxHooks.js` (the JSX loader, also used by `CodeRef/__tests__`), `staticViewFakes.js` (fakes of `prismTheme` / `staticCodeStore` / `staticSurface` for the static view's markup tests), `contrast.js` (the WCAG ratio), `codeLineTokens.js` (the code-line tokens, one list for `themeWiring.test.js` and `shared/__tests__/codeEditorTokens.test.mjs`); the touch reading mode: `touchMode`, `touchOptions`, `viewGate` (the static view never renders without the touch query: the gate's answers, the sources of `index.jsx` and `CodeEditorClient.jsx` read as text, every guide editor's server render and Monaco options unchanged, no `hover: none` in any stylesheet), `monacoTouchContract` (the installed Monaco writes its textarea's font size inline, traps `touchmove`, and has the `editContext` option whose native path drops the textarea), `prismTheme`, `staticCodeStore`, `surface`, `monacoSurface`, `staticSurface`, `staticCode`, `staticStyles`, `staticBox`, `useStaticStores`, `staticSolution`, `diffRows`, `usePendingAction` (and its `cancel`), `useRunErrors` (Go to line only with a surface, through `reactHookShim.js` and a real Piston answer), `printCopy`, `printRefresh`; `props`, `sizing`, `autoHeight`, `resize` (the bounds, a drag, every key), `runtimeChoice`, `folding` (a first show with nothing to fold does nothing; code replaced in the same model while it waits stops it quietly), `monacoSetup`, `output`, `clipboard` (pure logic and fakes); `render` (the placeholder, the failure frame and the header rendered on the server through `jsxHooks.js`, as DropDownIC's tests do; `index.jsx > ownsDomId`; the header's narrow layouts up to 620 px and at 320 px; the light bulb as a toggle and its tooltips; the placeholder's hint cue, none in the failure frame); `outputPanel` (the failed / stopped notices have no role="alert"; the hint cue, one hint and three, its light bulb MUI's own path; the placeholder's idle line equal to the output area's); `buttonInk` (each variant; Run and Check in the header); `menuScroll` (the two pickers' and the Theme menu's MUI props: no scroll lock; MUI's Select and Menu stood in for by `muiMenuStubs.js`, which records their props); `backCompat` (the guide's seven editors and the blog post's: no new element, control or Monaco option without the new props, except a height="fit" editor's two scrollbar keys; no light bulb, no hint cue); `files` (every file parses, every import and named import resolves, every name is defined, every CSS class exists; and `index.jsx`'s static imports reach no client-only file: `CodeEditorClient`, `exerciseView`, `runMarkers`, `buttonInk`, `draftSession`, the theme files `editorThemes` / `themeChoice` / `useEditorTheme` / `ThemeMenu`, the library's `result` / `exercise` / `checkHelpers` / `errorLocations`; the folder is self-contained: no `@site/` import, no import leaving it, bare imports only from the recipe's packages; its tests name no file of the site); `muiScope` (the palettes, buttonInk's ink, the provider on the server), `editorFont` (the three levels, trimming, `firstFamilyOf`), `unsavedWork`, `useRuntimes` (the site's URL reaches the fetch); the editor theme: `editorThemes` (the registry against the spec, Monaco's colour ids and tokenizers, the stylesheet's default colours, WCAG contrast on the background, the current line, the widgets, every band, the exercise diff and the type chip; Dracula against Prism's; the Solution key; this README names every family), `themeChoice` (fake and throwing storages, unusable values left in place, other tabs' events), `useEditorTheme` (the store with a fake window; the hook on the server through the real React, with a stubbed `useColorMode`), `themeMenu` (the button and the open menu on the server; each entry's text starts with its label, for type-ahead), `themeWiring` (the frame's attributes equal to the stylesheet for VS Code's themes, every mode rule keyed on `data-ce-mode`, the other-mode rules and text colours, the frame's color-scheme, a page's theme ignored, the layer colours read by the stylesheets, `CodeEditorClient.jsx`'s wiring); the teaching layer: `decorations`, `codeSpans`, `stepBar`, `guidedStyles`, `monacoFoldingContract` (Monaco's folding internals), `useGuided` (`createGuide`'s rules), `runMarkers`, `errorList`, `runErrors` (real Piston answers), `exerciseView` (also the hints area's rules: the toggle, reveal-next, the eyes, where the focus goes after a reveal), `exerciseRender` (every captured exercise answer; the hints area closed, opened, revealed, folded, reopened, its eye icons MUI's own paths), `useExercise` (its pure helpers; the hints area through the real hook and `reactHookShim.js`, which re-runs an effect when its dependencies change: Reset and a language switch keep it; `hints.cue`, 0 while the area is open), `useFleetingText` (the hints' live region empties itself after its hold: node's mock timers), `solutionDiff`, `drafts`, `draftSession`, `useDrafts` (the real hook through `reactHookShim.js`, a router stub, a fake window), `dirtyLanguages` (with the real `unsavedWork.js`), `useNearViewport`, `useCodeRun` (the real hook through `reactHookShim.js`: Stop during a compile), `notServed` (a site that does not serve Monaco: the reader's notice and one console line, the real hook with `fakeMonacoReact.js`), `loaderRejections` (a failed load: only that failure's unhandled copies are marked handled, the real hook with `fakeMonacoReact.js` set to fail), `typescript`, `twoslash`, `typescriptRun` (Monaco's real TypeScript worker through `tsHarness.js`) |

The run itself — the request, the answer, the errors, the fold-range rules, the snippet shapes,
the line specs, magic comments, steps, error locations, source maps and exercises — is the
library `lib/codeRunner/` (its own README). `<CodeRef>` and the page registry: `CodeRef/` (its own
README) and `lib/registry/`. The Netlify functions that reach the Piston server:
`shared/functions/code-runner/` (its own README).

## How to change it

- **Words** (buttons, tooltips, the hint cue, notices): `messages.js`; the teaching layer's panels:
  the `WORDS` of `StepBar.jsx`, `ErrorList.jsx`, `ExercisePanel.jsx`, `ExpectedOutput.jsx`,
  `SolutionPanel.jsx`, `HintList.jsx`, `drafts.js`, `runMarkers.js`, `typescript.js`,
  `typescriptRun.js` (a top-level await in a Check), `twoslash.js`, `useGuided.js` (what screen
  readers hear after a `<CodeRef>`).
- **The light-mode button blue** (Run, Check, the solution panel's buttons): `buttonInk.js`.
- **A CSS-module rule for an MUI component** needs TWO classes (`.actions .runButton`): MUI's
  emotion styles load after the site's in the production build and win over one class.
- **A new prop:** `props.js > normalizeEditorProps` (new prop, then the old key if any, then a
  default), the props table above, a test in `__tests__/props.test.js`.
- **Monaco's defaults** for every editor (tab size, minimap …): `props.js >
  DEFAULT_EDITOR_OPTIONS`; one page: `editorOptions`. The font is the page's
  (`editorFont.js`: `--ce-font-family` in `shared/css/custom.scss`); a page's
  `editorOptions.fontFamily` still wins.
- **The MUI controls' palette** (the blues, the dark greys): `MuiScope.jsx`.
- **The marked lines' colours** (bands, bars, inks; the error rows; the exercise diff): the
  `--code-line-*` tokens of `shared/css/_code-blocks.scss`, which the editor reads with
  built-in fallbacks (`styles.module.css` > THE CODE-LINE TOKENS;
  `shared/__tests__/codeEditorTokens.test.mjs` keeps the two equal); on a site without them the
  fallbacks, or that site's own tokens.
- **Colours and themes:** `editorThemes.js`, one file: a new theme is one `CUSTOM_THEMES` entry
  (from its published palette: every syntax role, editor colour and frame colour, and a `layer`
  of fainter or darker bands where the contrast test asks for one) plus one family in
  `THEME_FAMILIES` — the menu, the stored choice and the editor read it from there, and the
  tests check its shape, Monaco ids, token coverage and contrast (naming the surface that
  fails). Then name the family in → What the reader sees > Editor theme above
  (`editorThemes.test.js` fails until it does), and in a site's own guide if that lists the
  themes. The default family:
  `DEFAULT_FAMILY` (VS Code's `vs` / `vs-dark`). The frame's default colours are ALSO in
  `styles.module.css` (`--ce-*`; light on `.frame`, dark under `.frame[data-ce-mode='dark']`),
  which the placeholder draws: keep them equal to `vs` / `vs-dark`'s frames (a test compares),
  and `--ce-editor-bg` equal to the theme's editor background, or the loading box flashes when
  Monaco appears. A CSS rule that differs by mode keys on `[data-ce-mode='dark']` (the editor's
  theme), never on `html[data-theme='dark']` (`__tests__/themeWiring.test.js` fails otherwise).
  The menu's words: `ThemeMenu.jsx > WORDS`; the storage key: `themeChoice.js >
  THEME_STORAGE_KEY`.
- **The storage keys, Monaco ids and lib paths are site-neutral on purpose** (2026-10-26:
  `code-editor.theme`, `code-editor:draft:v1`, `codeEditor.run`, `file:///code-editor/…`;
  `__tests__/files.test.js` refuses the site's name in the folder), so every site reads them
  alike. A key change forgets every reader's stored theme choice and drafts once: rename before a
  site's first deploy, not after.
- **The default height:** `sizing.js > DEFAULT_HEIGHT` (and `DEFAULT_MAX_HEIGHT`, the ceiling
  for `height="fit"`; `MIN_HEIGHT_PX`, the shortest box).
- **The resize strip:** its steps and bounds in `resize.js` (`KEY_STEP_PX`, `PAGE_STEP_PX`,
  `MAX_VIEWPORT_SHARE`); its look in `styles.module.css` (`--ce-resize-height`, `.resizeHandle`,
  `.resizeGrip`); its words in `messages.js` (`LABELS.resize`, `LABELS.resizeTooltip`).
- **A language's label, highlighting or file name:** `lib/codeRunner/languages.js`.
- **The run limits' defaults:** `lib/codeRunner/request.js > DEFAULT_LIMITS`; their
  ceilings (3 s / 10 s): `TIMEOUT_BOUNDS` there, kept equal to the function's
  `MAX_RUN_TIMEOUT_MS` / `MAX_COMPILE_TIMEOUT_MS` (a test compares them).
- **A new header button:** `Toolbar.jsx`, and `index.jsx > ICON_BUTTONS` one higher (the
  placeholder draws a space per button; `__tests__/render.test.js` compares the two). A button
  only some editors have: `props.js > exerciseButtonsFor` (the header and the placeholder both
  read it).
- **A teaching feature:** its hook (`useGuided.js`, `useRunErrors.js`, `useExercise.js`,
  `useDrafts.js`) or `typescriptRun.js`, not `CodeEditorClient.jsx`; a new prop must change
  nothing for an editor without it (`__tests__/backCompat.test.js`). The hooks reach the code
  through the surface (`surface.js`), never through Monaco: a new thing a hook needs from the
  code is a member of the contract, in both adapters.
- **The touch reading mode:** which devices get it: `touchMode.js > TOUCH_MEDIA_QUERY` (read
  once at mount; the CSS keys on `TOUCH_ATTRIBUTE`, never on a media query:
  `__tests__/viewGate.test.js`); Monaco's options after the tap:
  `touchOptions.js > TOUCH_EDITOR_OPTIONS`; the box's size after the tap:
  `touchMode.js > TOUCH_BOX`; the fold buttons' and the bar's words:
  `StaticCode.jsx > WORDS`; the bar's height: `static.module.css > .touchBar`; the Prism
  colours of a theme: `prismTheme.js > ROLE_PRISM_TYPES` / `BUILT_IN_SYNTAX` (a new Monaco
  built-in theme needs a `BUILT_IN_SYNTAX` entry; a custom theme's colours come from its
  Monaco rules); the static Solution panel's words and size: `StaticSolution.jsx > WORDS` /
  `STATIC_DIFF_CONTEXT` / `STATIC_DIFF_MAX_ROWS`; the idle line's touch words:
  `messages.js > IDLE_HINT_TOUCH`.
- **Printing:** the copy's look in print: `PrintCopy.module.css`; its metrics:
  `PrintCopy.jsx > printCopyStyle`; the event and what it writes:
  `usePrintRefresh.js > PRINT_EVENT` / `refreshPrintText`; the paper ink and what the Monaco
  view and the placeholders hide or print: `styles.module.css` > `@media print` (`--ce-print-fg`,
  `.printOnly`, `.editorBoxWaiting` / `.editorBoxFailed`); what the static view prints:
  `static.module.css`'s.
- **The hints:** what the light bulb, "Show hint 2 of 3" and an eye do: `exerciseView.js` >
  HINTS (`toggleHintsArea`, `revealNextHint`, `toggleHintFold`; where the focus goes after a
  reveal: `focusAfterReveal`); the area's words: `HintList.jsx > WORDS`; how long the live
  region keeps a revealed hint: `useFleetingText.js > FLEETING_HOLD_MS`; its look:
  `HintList.module.css`; the light bulb's name and tooltips: `messages.js > LABELS` (`hints`,
  `showHints`, `hideHints`; which tooltip when: `Toolbar.jsx > hintsTooltip`); when the cue
  shows: `useExercise.js > hints.cue`; the idle line's cue:
  `messages.js > HINT_CUE`, its icon `IdleLine.jsx > LIGHTBULB_PATH` (the header's
  `LightbulbOutlined`: change both together; a test compares them) and its size
  `styles.module.css > .cueIcon`.
- **Tests:** `npm run test:shared`.
  The browser parts are checked by hand: `netlify dev`, then a page with an editor in light and
  dark mode, at 375 px, with ⌘/Ctrl+Enter, Reset (folds return), a language switch and back
  (with `height="fit"` the box fits each language), the resize strip (a drag with the mouse and
  with a finger, the keys, a double-click back; with `height="fit"` the drag stops the fitting),
  Stop (the focus stays on the button), Copy before the editor has loaded, and Retry (block the `CodeEditorClient` chunk in the browser's developer tools,
  reload, unblock, press Retry). The teaching layer: a failed run's squiggles, hover and rows
  (Go to line into a fold), steps (Previous / Next unfold), a `<CodeRef>` (lines, a step, a
  `loadWhenVisible` editor far down), Check / Solution (Use this solution, then ⌘/Ctrl+Z), the
  hints (the cue on the idle line, its light bulb sitting on the text in both modes and every
  theme; the cue goes while the hints are open and comes back when they are closed; the light
  bulb opens hint 1; "Show hint" keeps the focus, then hands it to the last eye — reveal every
  hint of a three-hint exercise from the keyboard, then press Space: the last eye folds its
  hint; an eye folds and unfolds; close and reopen as it was; Reset and a language switch keep
  them; a screen reader hears each revealed hint once, and in browse mode a few seconds later
  meets it only in its box),
  a saved draft across a reload (Discard), Reset and Discard leaving the focus in the editor
  (⌘/Ctrl+Z at once), TypeScript (a type error runs, a syntax error stops, `// ^?`), Run and
  Check in #075f91 in light mode, all at 375 px and in both colour modes. The header between
  500 and 620 px and at 320 px with a runtimes list (under `netlify dev`, or with
  `/.netlify/functions/runtimes` answered from the installed list): the placeholder's header
  and the real one the same height once the version picker arrives, Run on the icons' line at
  320 px. The editor theme: with nothing stored the editor looks as before in both modes; the
  menu from the keyboard (opens on the checked entry, Enter picks, Escape closes, the focus back
  on the button; a letter — "m", "s" — moves to that theme; no tooltip over the open menu); a
  pick recolours every editor of the page and survives a reload, another page and another tab;
  Dracula on the light site (frame, pickers, stdin field, output block and its scrollbar, error
  rows, step bar, marked lines, the solution diff and its key all dark); High contrast's
  solution key outlined; a private window (picks work, are not remembered); 375 px and 820 px.
