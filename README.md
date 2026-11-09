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
