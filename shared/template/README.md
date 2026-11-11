<!--
README.md: what this site is, how to work on it and where things live.
How to change it: keep it true and short. The rules of the repository are in SITE-RULES.md, and the shared
folder has its own README at shared/README.md.
-->

# __SITE_TITLE__

A Docusaurus site, served at __SITE_URL__. Its source is at https://github.com/__SITE_REPO__.

## Work on it

```sh
nvm use                  # the Node version in .nvmrc
npm install
npm start                # a dev server with hot reload
npm run shared:verify    # every suite that proves this site
npm run build            # the same build a deploy publishes
```

## Where things live

| Path | What it holds |
|---|---|
| `docs/` | The notes. `sidebars.js` lists them. `docs/examples.mdx` shows every admonition and shared piece |
| `blog/` | The blog posts |
| `src/pages/` | The home page and any other page |
| `src/css/site.scss` | This site's own styles, which load after the shared ones |
| `src/components/` | One-line stubs that point at `shared/`, and BibRef, whose stub hands in `BibRef/bibliography.js`, this site's sources |
| `static/` | Files served as they are from the site's root |
| `shared/` | The folder this site shares with others. Roll a change out with `npm run shared:push` |
| `SITE-RULES.md` | The rules of this repository |

## Publish it

`netlify.toml` holds the build, and a deploy runs it. Deploys go out from this machine:

```sh
npm run deploy
```

The commands that start with `shared:` are in `shared/README.md`.
