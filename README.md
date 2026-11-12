# danielwfarlow.com

The source of [danielwfarlow.com](https://danielwfarlow.com), a personal site with notes and a blog,
built with [Docusaurus](https://docusaurus.io/) and hosted on Netlify.

This file is the quick start. Keep its commands in step with `package.json`.

## Setup

Node 22 (`.nvmrc`) and npm.

```sh
npm ci
```

Install with `npm ci`, never `npm update`: `package-lock.json` holds the exact versions.

## Commands

| Command | What |
|---|---|
| `npm start` | Dev server on http://localhost:3000. Most changes show without a restart. |
| `env SKIP_HTML_MINIFICATION=true npm run build` | Production build into `build/`. Netlify builds with that variable set, so set it here too or the HTML differs. |
| `npm run serve` | Serves `build/` on http://localhost:3000. |
| `npm run clear` | Removes Docusaurus's caches and `build/`. |
| `node --test scripts/site-files.test.mjs` | Checks on this site's own files that need no build: no file in `static/` hides one in `shared/static/`, the sentence below on `shared/README.md` sends readers to `--help`, every blog address the site has published still belongs to a post (a post whose date changes keeps its address with `slug:` in its front matter), the five rules below say what `shared/README.md`'s say, the docs sidebar's stub is still there, with the sidebar hideable, and Deploying says that `npm run deploy` deploys nothing and shows the steps it prints, `nvm use` first. The file's header lists them. |
| `node shared/scripts/check-mui-api.mjs` | Fails on an old MUI API name, such as `componentsProps` or `GridToolbar`. The Netlify build command runs it first, so a hit stops the build in under a second. Exit 0 is clean, 1 found a name, 2 could not run. The list is `shared/scripts/lib/oldMuiApis.json`, and the script's header says how to change it. |

## The shared folder

`shared/` is a copy of a separate repository, mounted here with `git subtree`. It holds what this site
has in common with other Docusaurus sites: the lists in `shared/wiring/index.cjs`, some components,
the admonition types, the global stylesheets (`shared/css/`, with this site's own rules in
`src/css/site.scss` and `_site-dark.scss`), and the fonts and icons. A
file such as `src/components/LC/index.jsx` is a one-line stub, so a note keeps its import path.
`src/components/BibRef/index.jsx` is a stub too, and it hands
this site's `bibliography.js` to the shared citation. `src/theme/DocRoot/Layout/Sidebar/index.jsx` gives the
docs sidebar the shared wrapper that keeps the reader's place when the sidebar collapses or expands: without
the stub the theme's plain column comes back with no error, so `scripts/site-files.test.mjs` holds it. A
doc that imports a shared icon names it under `@site/shared/static/`. `static/` keeps no file at a path `shared/static/` holds: it would win over the
shared one, and `scripts/site-files.test.mjs` fails on it. `shared/README.md` says what each piece is and
how to change it, and the main options of the commands below; `-- --help` lists the rest.

| Command | What |
|---|---|
| `npm run shared:status` | Read only. Where this site stands against the shared repository, one line per check, each with its fix. |
| `npm run shared:pull` | Brings the shared repository's new commits into `shared/`. |
| `npm run shared:push` | Publishes this site's `shared/` commits to the shared repository. |
| `npm run test:shared` | Runs the tests of the shared pieces this site uses. |
| `npm run shared:verify` | Everything that proves this site: `shared/scripts/check-mui-api.mjs`, the public check's tests, `scripts/site-files.test.mjs` and `test:shared`. `shared:bump` and `shared:all` run it. |
| `npm run shared:compare` | Read only. Compares two builds over the pages in `comparePages` in `package.json`, in dark and light: `-- --before <folder>` is the old build. It sees a lost dark mode when a build and every test pass. Exit 0 is `0 changed`, 8 a list to read, 3 red. |
| `npm run shared:bump` | Moves this site to the pinned Docusaurus, or to `-- <version>`: install, cold build, `shared:verify`, compare. Commits `package.json` and the lock unless a step is red, prints the undo and the line that publishes the tested build, and never pushes or deploys. |
| `npm run shared:all` | Runs `status`, `pull`, `bump` or `run <script>` on every site that mounts the same shared repository, and stops at the first site that is not green: a red, a list to read or a conflict. In a `bump`, each site's `shared:bump` prints its own `Undo:` and `Next:` mid-run. The lines to act on are `shared:all`'s at the very end, and its `Undo:` takes back the pull too. |
| `npm run shared:new` | Makes a new site from `shared/template/`, proves it and prints the hosting steps: `-- <folder> --title <words> --url <address> --repo <owner/name>`. It pushes and deploys nothing. |
| `npm run shared:join` | Joins an existing site: `-- <folder>`. `-- --check` only reports and changes nothing. |
| `npm run shared:leave` | Takes this site out of the shared repository: its shared npm lines in one commit, then the `shared` remote. `shared/` stays as files, the other sites stop naming it, and it prints the way back. `-- --check` only reports and changes nothing. |
| `node shared/scripts/mdx-check.mjs` | Read only. Compiles every page with MDX 3 and lists each one that fails, where a build stops at the first. `--strict` reads with `mdx1Compat` off, as the next major does, and also lists a `:::note Title` that would print as plain text. Exit 0 clean, 1 a page fails, 2 could not run. |

The `@docusaurus/*` packages are pinned to one exact version, the one in
`shared/template/package.json`, and `shared:status` holds this site to it.

`shared/README.md`'s chapters say how to update Docusaurus, how to hold this site back, and what fails
without a word.

## Rules

Every commit here keeps these.

### The five rules

The shared folder's, word for word as `shared/README.md` gives them. `scripts/site-files.test.mjs` fails
when the two lists differ.

1. Commit `shared/` alone, with a subject that reads well in the hub, because a public site's history
   carries it.
2. A clean tracked tree before a pull or a push.
3. `--squash` in every site, forever.
4. A branch that holds a subtree pull is merged back, never rebased.
5. Never amend or squash a subtree bookkeeping commit.

### This site's own

- Nothing private goes in: no `.env` value, licence key, password, machine path or word of the word
  list, in a file, a path or a commit subject. The public check reads files and paths, never a
  subject, so read each subject before a push: this history is public.
- A tool's own folder or notes file stays out of git through `.git/info/exclude`, which is never
  pushed, not through `.gitignore`, which is.
- Every file opens with a comment that says what it is for and how to change it. Named constants,
  short functions, one documented file per list, and this README changes in the same commit as what
  it describes.

### Checks before a push

1. `npm run shared:verify`: the old-MUI check, the public check's tests, `scripts/site-files.test.mjs`
   and `test:shared`.
2. `env SKIP_HTML_MINIFICATION=true npm run build`, then `node shared/scripts/check-public.mjs` on that
   build, as the command in `netlify.toml` does.
3. `npm run shared:status`: 0 failed.

## The code editor

`<CodeEditor>` on a doc page is the shared editor, `shared/components/CodeEditor`: Monaco and a Run
button. `src/components/CodeEditor/index.jsx` and `src/components/CodeEditor/CodeRef/index.jsx` are
one-line stubs, so a note keeps its import path. `codeRunnerPlugin()` in `docusaurus.config.js` serves
Monaco from this site, at `/vendor/monaco-editor-<version>/`, and tells the editor where its functions
are. No page loads it from a CDN.

Run sends the code to two Netlify functions, `netlify/functions/execute.mjs` and `runtimes.mjs`. Each
is a one-line shim of `shared/functions/code-runner`, so the URLs stay `/.netlify/functions/execute`
and `/.netlify/functions/runtimes`. They pass the code on to a Piston server named by two variables on
the Netlify project, `PISTON_BASE_URL` and `PISTON_PROXY_SECRET`, scope Functions. Without them each
function answers 500, and Run says so in plain words. This site is public, so the functions' own
guards decide who may run: only this site's pages, and 20 runs per 60 s for each client. That is the
default, because `CODE_RUNNER_RATE_LIMIT` is left unset. Nothing else goes in `netlify/functions/`:
any other file there deploys as a public endpoint, and `npm run test:shared` fails on it.

| Command | What |
|---|---|
| `netlify dev` | The site with its two functions: the dev server on 3020, served with the functions on http://localhost:8892. `npm start` serves no function, so Run fails there. The ports are in `netlify.toml`, under `[dev]`. Run needs the folder linked once with `netlify link`, so the CLI brings the two variables. |

`shared/components/CodeEditor/README.md` lists the props, and `shared/functions/code-runner/README.md`
says what the functions need and how a public site runs them.

## The PDF viewer

`<PDFViewer file=... />` on a doc page is the shared viewer, `shared/components/PDFViewer`, reached through the
one-line stub `src/components/PDFViewer/index.jsx`. `pdfjsWorkerPlugin()` in `docusaurus.config.js` serves PDF.js's
worker from this site, at `/vendor/pdfjs-dist-<version>/`, so no page loads it from a CDN; `my-loaders` lets
webpack bundle PDF.js. `src/components/ResumeViewer` is the same viewer at 175% for `/resume`. The props are in the
viewer's header.

## Maths

Maths in docs and posts is typeset at build time by `rehype-katex`, with the shared `katexOptions()`.
`katexCssPlugin()` in `docusaurus.config.js` (`shared/plugins/katex-css`) links the installed
`katex`'s stylesheet, served from this site at `/vendor/katex-<version>/` with its fonts: the version
that typeset the page. `package.json` pins `katex` exactly.

The `<Pseudocode>` blocks still load `pseudocode.js`, its stylesheet and the KaTeX script it typesets
with from CDNs (`stylesheets` and `scripts` in the config). Pseudocode's stylesheet imports KaTeX
0.16.7's stylesheet from cdnjs, and it comes after this site's, so where the two define the same rule
or font, cdnjs's wins: the KaTeX fonts a page uses still come from cdnjs, each only when a formula
needs it.

Known limit: on a page with a code editor, Monaco's loader puts `define.amd` on the page. A CDN script
that arrives after it (the KaTeX script, `pseudocode.js`, or the copy `<Pseudocode>` adds when it
mounts) registers with that loader and sets no global, so `window.katex` and `window.pseudocode` stay
undefined in that tab, the console shows "Can only have one anonymous define call per script file",
and pseudocode blocks reached from there by a link stay unrendered until the page is loaded again.
Bundling both from npm in `src/components/Pseudocode` would end it.

## Deploying

Through Netlify, built on this machine. Link the folder to the Netlify project once with
`netlify link`, then:

```sh
netlify build && netlify deploy --prod --no-build
```

Deploy with the line above, after `nvm use` (Node 22). `npm run deploy` deploys nothing: it prints
these steps, `nvm use` first, and exits with status 1. The line above reads `netlify.toml`, and
`netlify build` takes `SKIP_HTML_MINIFICATION` from the Netlify project. Never use
`docusaurus deploy`: it publishes to GitHub Pages, not to Netlify.

## The public check

This repository and the site are public, so every Netlify build ends with the shared copy of the
check, `shared/scripts/check-public.mjs`. The command is in `netlify.toml`, under `[build]`. It stops
the build when something private is about to go out:

- a licence-key-shaped string in any built file or in a tracked file;
- a Basic-Auth value in a tracked file;
- a tracked `.env` file;
- a word from the machine's word list in a tracked file or path;
- a word from the word list in any built file, such as a machine path that `require.resolve` writes
  into the main chunk, or a file that `static/` holds, tracked or not;
- a `.DS_Store` anywhere under `build/`: delete it from `static/`, then build again.

The word list is `~/.config/docusaurus-shared/private-words.txt`, one plain file outside every
repo. A hit prints a path and a number, never the value or the word.

| Command | What |
|---|---|
| `node shared/scripts/check-public.mjs` | Runs the check by hand, from the top folder, after a build. Exit 0 is clean, 1 found something, 2 could not run. |
| `node --test shared/scripts/__tests__/check-public.test.mjs` | The check's tests. `npm run shared:verify` runs them too. |

A machine with no word list refuses with exit 2, and so does a build on Netlify's own servers. To
let hosted builds pass, add `--allow-missing-word-file` to the command in `netlify.toml`. It changes
nothing while the list exists, but a lost list then skips the word check with one printed line. The
script's header says how to change a rule or allow a word in one path, and `shared/README.md`,
"Before a public site goes out", what to change for each kind of hit.
