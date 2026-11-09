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
| `node --test scripts/site-files.test.mjs` | Checks on this site's own files that need no build: no file in `static/` hides one in `shared/static/`, the sentence below on `shared/README.md` sends readers to `--help`, and every blog address the site has published still belongs to a post (a post whose date changes keeps its address with `slug:` in its front matter). The file's header lists them. |
| `node shared/scripts/check-mui-api.mjs` | Fails on an old MUI API name, such as `componentsProps` or `GridToolbar`. The Netlify build command runs it first, so a hit stops the build in under a second. Exit 0 is clean, 1 found a name, 2 could not run. The list is `shared/scripts/lib/oldMuiApis.json`, and the script's header says how to change it. |

## The shared folder

`shared/` is a copy of a separate repository, mounted here with `git subtree`. It holds what this site
has in common with other Docusaurus sites: the lists in `shared/wiring/index.cjs`, some components,
the admonition types, the global stylesheets (`shared/css/`, with this site's own rules in
`src/css/site.scss` and `_site-dark.scss`), and the fonts and icons. A
file such as `src/components/LC/index.jsx` is a one-line stub, so a note keeps its import path.
`src/components/BibRef/index.jsx` is a stub too, and it hands
this site's `bibliography.js` to the shared citation. A doc that imports a shared icon names it under
`@site/shared/static/`. `static/` keeps no file at a path `shared/static/` holds: it would win over the
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

The five rules in `shared/README.md` bind every commit here. Its chapters say how to update Docusaurus,
how to hold this site back, and what fails without a word.

## Deploying

Through Netlify, built on this machine. Link the folder to the Netlify project once with
`netlify link`, then:

```sh
netlify build && netlify deploy --prod --no-build
```

`npm run deploy` does the same in one step. Both read `netlify.toml`, and `netlify build` takes
`SKIP_HTML_MINIFICATION` from the Netlify project. Never use `docusaurus deploy`: it publishes to
GitHub Pages, not to Netlify.

## The public check

This repository and the site are public, so every Netlify build ends with
`scripts/check-public.mjs`. The command is in `netlify.toml`, under `[build]`. It stops the build
when something private is about to go out:

- a licence-key-shaped string in `build/assets/js` or in a tracked file;
- a Basic-Auth value in a tracked file;
- a tracked `.env` file;
- a word from the machine's word list in a tracked file or path.

The word list is `~/.config/docusaurus-shared/private-words.txt`, one plain file outside every
repo. A hit prints a path and a number, never the value or the word.

| Command | What |
|---|---|
| `node scripts/check-public.mjs` | Runs the check by hand, from the top folder, after a build. Exit 0 is clean, 1 found something, 2 could not run. |
| `node --test scripts/check-public.test.mjs` | The check's tests. |

A machine with no word list refuses with exit 2, and so does a build on Netlify's own servers. To
let hosted builds pass, add `--allow-missing-word-file` to the command in `netlify.toml`. It changes
nothing while the list exists, but a lost list then skips the word check with one printed line. The
script's header says how to change a rule or allow a word in one path.
