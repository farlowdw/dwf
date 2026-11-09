<!--
README.md: what shared/ is, its commands, its rules and how a site mounts it. Every site holds this
file at shared/README.md.

HOW TO CHANGE IT
  Keep it short. __tests__/readme.test.mjs checks it against the scripts, the settings and the wiring.
  A new command is a row in the Commands table and a line in the package.json block. A command printed
  before its script exists is named on a "Not built yet: a, b." line under the table, and the test goes
  red once that script lands, until its name leaves the line. While no command waits there is no such line.
  A site's own page about this folder repeats the five rules and the never-in list word for word, and
  a test there compares them with this file.
-->

# docusaurus-shared

The styles, components, wiring and scripts a family of Docusaurus sites shares.

One hub repository holds them. Each site keeps its own copy at `shared/` through git subtree, so they
are ordinary tracked files: edit them in whichever site you are in, the dev server reloads as usual,
and roll a change out when you decide. No npm package, no Docusaurus theme, no submodule, and no folder
that every site reads. The hub holds no list of sites: the scripts find them from sibling `.git/config`
files.

`shared/` installs nothing. `requirements.cjs` says what each piece needs, and `npm run shared:status`
prints the exact install line for anything missing.

## What is here

| Path | What it holds |
|---|---|
| `css/` | The stylesheets a site loads first, code blocks included |
| `static/` | Fonts and icons, served from the site's root |
| `theme/Admonition/` | The admonition types beyond Docusaurus's own |
| `components/` | Components a site reaches through a stub |
| `wiring/` | The lists a site's `docusaurus.config.js` would repeat |
| `requirements.cjs` | What each piece needs from a site, and its tests |
| `template/` | A new site's starter files, and the Docusaurus version pin every site reads |
| `scripts/` | The commands below. `scripts/lib/README.md` explains the library |
| `__tests__/` | Checks every site runs: imports, file names, tokens, wiring, privacy, this file |

## Commands

| Command | What it does |
|---|---|
| `npm run shared:status` | Read only. Where this site stands against the hub, one line per check, each with its fix. `-- --offline` skips the fetch |
| `npm run shared:pull` | Brings the hub's new commits into `shared/`, after scanning them. A pull that lands on the hub's tree with commits still in the split writes a rejoin's record, so they stay out |
| `npm run shared:push` | Runs `test:shared`, asks once, publishes this site's `shared/` commits, then rejoins. `-- --yes` skips the question, `-- --skip-tests` skips the tests, `-- -m "Subject"` commits `shared/` alone first |
| `npm run test:shared` | Read only. Runs the tests of what this site uses, says which suites it left out and how many tests node skipped. `-- --scripts` adds the scripts' own suites |
| `npm run shared:new` | Makes a new site from `template/`, proves it, and prints the hosting steps: `-- <folder> --title <words> --url <address> --repo <owner/name>`. `-- --help` lists the rest |
| `npm run shared:join` | Joins an existing site: `-- <folder>`. Housekeeping, the mount, npm lines and stubs, then a by-hand list. `-- --check` only reports. `-- --help` lists the rest |
| `npm run shared:leave` | Takes this site out of the hub: its shared npm lines in one commit, then the `shared` remote. `shared/` stays as files, the other sites stop naming it, and it prints the way back. `-- --check` only reports |
| `npm run shared:bump` | Moves this site to the pinned Docusaurus, or to `-- <version>`: install, cold build, `shared:verify`, compare. Commits `package.json` and the lock unless a step is red, then prints the undo and the line that publishes the tested build. Skips a site already there. Never pushes or deploys. `-- --help` lists the rest |
| `npm run shared:all` | Runs `status`, `pull`, `bump` or `run <script>` on every site of this hub, and stops at the first site that is not green: a red, a list to read or a conflict. `-- --only a,b` keeps that order, `-- --skip a,b` leaves sites out, `-- --help` lists the rest |
| `npm run shared:compare` | Read only. Compares two builds of this site over its `comparePages`, in dark and light, at desktop and phone width. `-- --before <folder>` is the old build, `-- --after <folder>` the new one, `build` by default. `-- --help` lists the rest |
| `npm run shared:verify` | A site's own line: every suite that proves that site. `shared:bump` and `shared:all` run it |

Options go after `--`. npm keeps them otherwise, and the scripts stop and say so. Pull and push run on
`master`, in the main checkout, and refuse a changed tree and an open merge. A pull also refuses while a
server runs from this checkout. The exit codes are in `scripts/lib/exitCodes.mjs`.

In the hub itself, run the tests with `node --test "__tests__/*.test.mjs"` and
`node --test "scripts/__tests__/*.test.mjs"`.

## Roll out a change

```sh
# In any site, with nothing changed outside shared/:
npm run shared:push -- -m "Tighten the code block margins"

# Then in each other site:
npm run shared:pull
npm run test:shared
```

`-m` runs the tests, commits `shared/` alone and publishes. Any site can start, so a change goes either
way. A pull lands as two commits, a squash and its merge: build the site, look at it, then `git push`
it.
The site you pushed from holds the change and the rejoin's two commits, a squash and its merge: `git push` it too.

## Every site at once

`shared:all` finds the sites beside this one from their `.git/config` files, starts with the site you run it
from, and prints what it found.

```sh
npm run shared:all -- status            # one line per site, then the next command
npm run shared:all -- pull              # each site: pull, build, shared:verify, compare
npm run shared:all -- bump 3.11.0       # moves the pin, then moves every site to it
npm run shared:all -- run test:shared   # one npm script in each site
```

`pull` and `bump` ask every site before they touch any. One site that cannot run means nothing runs, and the
refusal prints the ready `--skip` line. A pull that changes only `shared/template/` builds nothing.

`bump` pulls first, so one proof covers both, and moves each site to the pin the hub holds. Give it a version
and it first moves the pin in `template/package.json` and publishes that one commit, behind one question,
from a site in sync with the hub. `--yes` skips the question, and `--no-pin` leaves the pin alone for a rehearsal.

| It stops at | Exit | What is left |
|---|---|---|
| A refusal | 4 | Nothing changed anywhere |
| A red | 3 | The site, the sha it was on, its exact undo, the sites it never touched, and the ready `--only` line for them |
| A conflict | 6 | The same, with the merge open |
| `a list to read` | 8 | The same, with the site's commits kept. Read the list, then run the printed line |

Every undo is one line to paste, and a reset goes with `--keep`. A run started again skips what is done. To hold
a site back a week, run with `--skip` now and `--only` then. Nothing pushes a site, deploys or starts a server.

A red also leaves a note inside that site's `.git` folder, where no commit carries it: the step, the sha, the hub
commit, the undo and the publish lines the run printed. Until its undo runs, `shared:status` there fails on its `red`
line with that undo, and a run started again, a `shared:pull` and a `shared:bump` refuse the site with the same line,
so it never reads green. Once it is undone, the `red` line warns, and the hub line's fix and `shared:all -- status`'s
`Next:` give the way on instead of a pull that brings the change back: for a red pull, a fix forward from a site in
sync with the hub; for a red bump, the pin put back, or the site's own fix and then `bump`. A red pull whose cause is
the site's own code, such as its own copy of a component the hub now holds, takes that pull by hand there after the
undo, `npm run shared:pull`, with its fix: a pull of its own settles the note. The next green proof there
clears the note, and so does a run that finds the site past it, with a line that says so. A red at the build, the
suites or the compare moves `build/` into the run's folder, printed as `The build that went red:`, so a deploy typed
by hand finds nothing to send: build again before any deploy. A run that leaves the red site out prints the red run's
publish lines again, until each of those sites is pushed.
A site whose `node_modules` does not match its `package.json` refuses before anything moves, with the line that
fixes it, because a build there proves nothing.
Only `bump <version>` publishes, and only the pin. The end prints one chained line per site, and a site whose
pull touched only the template gets `git push` alone, because it was not built.

A red on the site you ran `bump <version>` from comes after the pin went out, so the stop also prints the line that
puts the pin back. Run the printed `Undo:` first, then that line, both in that site. The other way round the
pin-back refuses, because the red left that site's package files changed: the pin moves from that site, so no
`--skip` can leave it out, and the refusal names the undo instead. Between the two, `shared:status` cannot tell a
bump that went red here from one not run yet, so its `pin` fix names both: the bump, or, if that version went red
here, the pin-back.

A `bump` prints two sets of lines. Each site's `shared:bump` prints its own `Undo:` and `Next:` as it finishes,
in the middle of the run, and those speak for that bump alone: its undo leaves the pull in place. The lines to
act on are `shared:all`'s, at the very end. Its `Undo:` at a stop goes all the way back to the sha the site was
on, pull included, and its one line per site publishes what was tested.

## Update Docusaurus

Every site sits on the one version in `template/package.json`. The `newest` line of `shared:status` says when
npm has a newer one, with `shared:all -- bump <version>` as its fix, and `shared:all -- status` prints that line
once for all the sites. A one-site `shared:bump -- <version>` is a rehearsal, and leaves that site off the pin.

```sh
npm run shared:all -- status
npm run shared:all -- bump 3.11.0
```

The second line refuses a version outside the `@docusaurus` ranges of `requirements.cjs`, and names the newest
version npm has inside them, because every site's `shared:verify` would fail on it. Then it asks npm whether the
version exists, moves the pin, publishes that one commit, and takes each site through one proof:

1. keep the old build outside the site, so that one compare covers the pull and the bump;
2. pull the hub;
3. rewrite every `@docusaurus/*` entry, and cut them from the lock and `node_modules`;
4. `npm install`, and stop there when it fails, with nothing built;
5. check that one `@docusaurus` version is left and that no `@mui/x-*` entry moved;
6. a cold build, `shared:verify`, and a compare against the old build;
7. commit `package.json` and the lock.

The first site that is not green stops the run: "Every site at once" says what each stop leaves, and which lines to act on. A list
to read is not a red. The site has committed: read the list, then run the printed line for the sites that are
left. Posts that share a date can land in a different order on each build, and a compare then reads a list for
nothing. With such a site, `UV_THREADPOOL_SIZE=1` in the shell keeps both sides in the same order.

Never force an install. `--force` and `--legacy-peer-deps` can drop a package without a word, and the build
that follows reads green. `shared:bump` passes neither.

For a rehearsal, one site takes a version of its own, and every site can with the pin left alone:

```sh
npm run shared:bump -- 3.11.0
npm run shared:all -- bump 3.11.0 --no-pin
```

Off the pin, `shared:status` fails on `pin` until the site steps back up. That is right for a rehearsal. A version
below the ranges in `requirements.cjs` is refused before anything moves, by `shared:bump` as by `shared:all`, with
the newest version npm has inside them: `shared:verify` would fail on it, on `packages`. `shared:all`'s green end
still exits 0, and one line names the sites that read `FAIL` and gives the way back, `npm run shared:all -- bump`.
A `@docusaurus` package short of its range gets `shared:bump` as its fix, because installing a few of them by name
would mix versions.

A major version is a job of its own, not a bump: read the notes below first. Before its install, `shared:bump` names
each `overrides` line it needs, by the line `by hand`: entries to change, and packages in the lock whose peer range
shuts the version out, as npm reads it. Such a line goes in a commit of its own, before the bump. That commit's
`package.json` holds the old `@docusaurus` entries under an override at the new version, so a plain `npm ci` there
stops at ERESOLVE and leaves `node_modules` on the new version. Every printed undo allows for it: it puts the last
`package.json` npm can read in place, runs `npm ci`, and puts the file back. Until a bump commits on top of that
commit, a fresh `npm ci` of it needs the same steps.

## Docusaurus 4 notes

Docusaurus 4 is not out. These notes come from rehearsals on copies of real sites, one on 3.10.2 with
`future: { v4: true }` and one on the preview `4.0.0-canary-7002`. A release may differ. The preview needs Node
24.21 or newer.

| Where | What happened | What it takes |
|---|---|---|
| Install | Old peer ranges stop at ERESOLVE: the preview wants React `^19.3.0`, and plugins pin the old `@docusaurus/*` | Move React first, and give those plugins an `overrides` line. `shared:bump` names each plugin the lock shows, and npm's output names what only the new packages ask for, such as React. Never force an install |
| Install, by hand | A failed install leaves the old packages, and the next build reads exit 0 | `shared:bump` stops at a failed install. A bump by hand must too |
| MDX | With `mdx1Compat` off, an HTML comment such as `<!--truncate-->`, a commented-out import and a `{#id}` heading id stop compiling | `node shared/scripts/mdx-check.mjs --strict` lists every page. Write `{/* truncate */}` and `{/* #id */}` |
| Admonitions | With `mdx1Compat` off, `:::note Some title` compiles and prints as plain text, with no warning | The same check lists them. Write `:::note[Some title]` |
| Sidebars | `useScrollController` left `@docusaurus/theme-common/internal`, with no public replacement | Rework a swizzled sidebar |
| Dark mode, cascade layers | Unlayered `:root` tokens beat Infima's layered dark values, so stock admonition text turned dark on dark. `shared/` keeps its contrast tokens out of bare `:root` | Run `shared:compare`, and read the admonitions in dark |
| Admonition icons | Emotion's unlayered `width: 1em` now beats the theme's layered icon size, and custom kinds shrink from 25.6 to 16 px. Colours do not move | Read them in the compare |
| Dark mode, `@docusaurus/faster` | One stray U+FEFF before `html[data-theme=dark]` killed the whole dark rule | `['docusaurus-plugin-sass', { sassOptions: { charset: false } }]` |
| Broken anchors | `onBrokenAnchors` is `throw`, so a broken anchor fails the build | Fix the anchors first |
| A dev-server proxy | `http-proxy-middleware` moved from 2.0.10 to 4.2.1. A site's proxy tests failed and hung | Fix a proxy plugin before you run a dev server on it |
| Stock admonition types | The preview's `Types` dropped caution, secondary, important and success | `theme/Admonition/Types.js` defines the four itself |
| `docusaurus2-dotenv` | It crashes Rspack | Take it out before the move |

The two dark-mode rows and the admonition icons were silent: every build and test stayed green, and only the
compare saw them. Setting `mdx1Compat` back on gets a site past the MDX row, and the titles then break the day
it comes off, so fix both while `--strict` lists them.

## Compare two builds

A build and every test can pass while a page has lost its dark mode. This is the check that sees it.
Keep the old build outside the site, make the change, build again, and compare:

```sh
cp -R build ../keep-build
# change something, then build
npm run shared:compare -- --before ../keep-build
```

It serves both builds on free local ports with the site's own `serve-handler`, loads each page of
`comparePages` in dark and light, in a desktop window of 1,280 px and a phone's of 375 px, in headless
Chrome, compares 37 computed properties on every element plus the console, and compares the two screenshots of
each view pixel by pixel. Screenshots of both sides and `report.json` go to a folder outside the site, printed
at the end, or to `-- --out <folder>`. A page nobody listed is not compared, so list a site's awkward pages.

| It ends with | Exit | What it means |
|---|---|---|
| `0 changed` | 0 | Every view reads the same on both sides, and its two screenshots hold the same pixels |
| `a list to read` | 8 | Both sides loaded and they differ. Each group gives a selector, a property, both values and where it showed up, and a view whose pixels differ names its two shots. Read them: one navbar padding can touch every view |
| `red` | 3 | A page did not load, on either side. It never counts as no change |

A view whose elements differ prints `structure changed, read by eye`: pairing them by position would blame
thousands of elements for one removed block, so open its two screenshots. A view whose elements read the same
and whose shots do not prints `pixels differ, open the two shots`: the change is one the 37 properties do not
hold, such as a shadow or new words that leave every box the same size. Widths and heights that differ by less
than a pixel are rounding, and are ignored.

It reads each element's tag, classes and computed styles, the console, and the top 2,400 px of each view as a
picture. What shows in none of those stays out of it: a change to an attribute alone, such as a `title`, an
`aria-label` or a link's `href`, anything below the first 2,400 px, and a width between the two windows. A
text box's caret is never drawn, because it blinks on its own timer, so a change to its colour is not seen either.
`0 changed` says the listed pages look the same there, not that their HTML is. To see the rest,
diff the two `build/` folders.

The first run stops and prints the one `npm install --prefix` line that puts `puppeteer-core` in
`~/.cache/docusaurus-shared/compare`, outside every repository. A run takes the machine's sweep lock in the
same folder and waits for whoever holds it. Three variables move these: `DOCUSAURUS_SHARED_CACHE`,
`DOCUSAURUS_SHARED_SWEEP_LOCK` and `DOCUSAURUS_SHARED_CHROME`. A site served below a path other than `/` is
not supported yet.

`--ports <from>-<to>` keeps a compare's servers in a range, and `--lock-wait <seconds>` says how long it waits for
that lock. A range walks past the dev servers' ports and past every port Chrome refuses with `net::ERR_UNSAFE_PORT`,
6000 among them, so `6000-6009` serves on 6001. A range left with no port is a usage error that says why, and so is a
`--before-url` or `--after-url` on a refused port. Two builds are served at once, one port each, so a range must leave
two ports, or one beside a `--before-url` or `--after-url`. `shared:bump` and `shared:all`'s `pull` and `bump` take
both and hand them to their compare:

```sh
npm run shared:bump -- 3.11.0 --ports 4100-4109 --lock-wait 60
npm run shared:all -- pull --ports 4100-4109
```

## Before a public site goes out

`scripts/check-public.mjs` is the last check on a public site. It has no npm line, because a build runs it:
add `&& node shared/scripts/check-public.mjs` to the end of `command` under `[build]` in `netlify.toml`, so
`netlify build` and `netlify deploy` both stop at a hit. A predeploy line would not do: a plain `netlify
deploy` never runs one.

It prints a place and a number, never a value, and a word only as its line in the list.

| It fails on | What to change |
|---|---|
| A licence key's shape, in a built file or a tracked file | Take the key out of that file, or out of what the build reads |
| A Basic-Auth value or a `.env` in a tracked file | Take it out of git |
| A word of the list in a tracked file or path | Take it out, or give it `word<TAB>path` in the list if it belongs there |
| A word of the list in any file under `build/` | Whatever put it there. An absolute path usually comes from `require.resolve` in the site's config: write it as a relative string. A file that `static/` holds, tracked or not, is copied into the build as it is |
| A `.DS_Store` anywhere under `build/` | Delete it from `static/`, then build again |

Tracked files show what a person wrote, so they are read as plain text. Every built file is read too, pages,
styles, scripts and whatever `static/` held, for what only the build knows, and two kinds of hit stay out of
it. A word with an allow line has a known home, so it sits in the built files too. A word in the middle of a
longer word, with a letter or digit on both sides, is chance: minified code is full of long names.

An entry with parts, such as `my-name` or `MyName`, is found in each common spelling of its parts: `myname`,
`my name`, `my_name` and `my-name`. It is also found where a line break, with the next line's indentation and
comment leader, splits it, and in Markdown and HTML where a tag or `*`, `_` or a backtick splits it. Text that
is compressed or encoded, such as a PDF's inflated streams or a base64 `data:` address, is not decoded.

It exits 0 when clean, 1 on a hit, and 2 when a check could not run, which is never a pass: no word list, no
build, no repository. A build on a host holds no word list, so there it needs `--allow-missing-word-file`,
which runs the other checks and says the word check did not run. `--help` lists the flags.

## Old MUI names

`scripts/check-mui-api.mjs` stops a name MUI 9 took out from coming back: an old prop can fail without a word,
because the component just ignores it. It has no npm line of its own, because a site runs it with its other checks.
A new site runs it first in `test:site`, which `shared:verify` runs, and `shared:join` writes it first in
`shared:verify`. A site with a line of its own puts it first in its test script or, with no test script, first in
`command` under `[build]` in `netlify.toml`.

```sh
node shared/scripts/check-mui-api.mjs
```

It reads code, pages and stylesheets in `src`, `plugins`, `docs`, `blog` and `shared/`, tracked and new files
alike, and leaves out comment lines, READMEs and test folders. A hit prints the place and what to write now.
The list, `scripts/lib/oldMuiApis.json`, holds MUI 9's removed props, such as `InputProps`, `PaperProps` and
`TransitionComponent`, the old slot props, `Hidden`, the old `Grid` props, the MUI X 9 grid options that went, and
the class names MUI 9 no longer sets on `InputBase` and the charts, such as `.MuiInputBase-inputMultiline` and
`.MuiBarLabel-root`, whose rules match nothing. A name the list lacks passes, so a new one is a row there. The rows sit in JSON, which the check does not read,
so it never trips on them.

It exits 0 when clean, 1 on a hit, and 2 when it could not run, which is never a pass: no repository, no files
to read, or a list it cannot use. `--root` reads another folder, and `--help` lists the flags.

## MDX check

`scripts/mdx-check.mjs` compiles every page of a site with MDX 3 and lists each one that fails. A build stops at
the first bad page, and this gives the whole list in seconds. Run it before a major version of Docusaurus, and
on an older site before it joins. It has no npm line, because no build needs it, and it changes nothing.

```sh
node shared/scripts/mdx-check.mjs
node shared/scripts/mdx-check.mjs --strict
node shared/scripts/mdx-check.mjs --root ../old-site
```

The first line reads this site as Docusaurus reads it today. `--strict` reads it with `mdx1Compat` off, as
`future.v4` and the next major do: an HTML comment and a `{#id}` heading id stop compiling, and `:::note Some
title` compiles and prints as plain text, which only this check sees. `--root` reads another site with this
site's packages, and `--packages <folder>` takes them from another one. Those packages need to be installed.

A partial, a file with a leading `_` in its path, is listed and leaves the result alone: a build compiles one
only when a page imports it, and then the build says so.

A page written for MDX 1 usually fails on `<details>`. The script's header holds one regular expression that
fixes those, with what it did on four older sites. It stays a note, because a person should read that diff.

It exits 0 when no page fails, 1 when one does, and 2 when it could not run, which is never a pass: no pages,
or no packages to compile with. `--help` lists the flags.

## Add a component

1. Add its folder under `components/`, its tests, and a row in `requirements.cjs` that names them in its
   `suites`, in a commit that holds nothing outside `shared/`. A render test, as `components/LC/__tests__` has, is
   the least: `test:shared` is the only gate before a push. A `git mv` from `src/` is a mixed commit, and `shared:push` refuses those.
2. In a separate commit of the site, delete the old folder and leave a stub at the same path, so no
   note changes.
3. Every file opens with a comment saying what it is for and how to change it.

```jsx
// src/components/LC/index.jsx
export { default } from '@site/shared/components/LC';
```

A piece with no default export takes `namedOnly: true` in its row, and its stub is `export * from`. `shared:join`
reads that row, because `export { default }` of such a piece fails the build.

A site that still holds its own copy of the component goes red at `shared:verify` once it pulls the component, with
`a local copy of <name>, not a stub`. So roll such a component out site by site, never with `shared:all -- pull`:
`npm run shared:pull`, the stub in place of the copy in a commit of the site, then `npm run shared:verify`.

## When one site needs something different

A site differs from the others in five places only:

1. a stub, for data and defaults;
2. `src/css/site.scss`, for tokens and rules, which load after the shared ones and win over a rule there with the
   same selector: `:root` for most tokens, `:root:where(:not([data-theme='dark']))` for the alerts' light tints,
   where a `:root` value loses;
3. its own `docusaurus.config.js`;
4. its own `src/theme`;
5. two lines in its `package.json`: `shared:verify` and `comparePages`.

A stub that hands in data:

```jsx
// src/components/BibRef/index.jsx (bibliography.js stays beside it)
import React from 'react';
import SharedBibRef from '@site/shared/components/BibRef';
import bibItems from './bibliography.js';

export default function BibRef(props) {
  return <SharedBibRef bibItems={bibItems} {...props} />;
}
```

A site whose reference list page is not `/docs/reference-list` passes its path too, as
`<SharedBibRef bibItems={bibItems} listPath="/docs/reference/citations" {...props} />`: the citations' links are
plain anchors, and no build checks them.

DropDownIC's stub stays a plain re-export: its MDX plugin writes `<DropDownIC.Title>`, and a wrapper
fails the build.

A site's own admonition type:

```js
// src/theme/Admonition/Types.js
import Types from '@site/shared/theme/Admonition/Types';
import AdmonitionTypeMine from './Type/Mine';

export default { ...Types, mine: AdmonitionTypeMine };
```

Its keyword goes in the site's config: add `ADMONITION_KEYWORDS` to the require from
`shared/wiring/index.cjs`, then write `admonitions: { keywords: [...ADMONITION_KEYWORDS, 'mine'] }`
in place of `...admonitionsConfig` in the docs, blog and pages blocks. Its colours go in `site.scss`.

## When a pull or push stops

| What happened | What to do |
|---|---|
| A changed tree | Commit or stash it, then run the command again |
| A push, behind the hub | Pull, then push again. No rejoin ran, so there is nothing to undo |
| A conflict in a pull, exit 6 | Edit each file it lists, then `git add -- <files>` and `git commit --no-edit`. Or `git merge --abort` to drop the pull. Never `git add -A` with a conflict open: that commits the markers |
| Conflict markers in a commit | `git add -A` during a conflict commits them, and every untracked file of yours with them. `shared:status` fails and a push refuses. Undo the pull with `git reset --keep HEAD~1`, then pull again and resolve it. The reset deletes those files of yours, and `git status` shows nothing, so status lists them and prints the `git restore --source=<the merge's sha> -- <file>` line that brings them back. A new commit that fixes them also works, but the commit that holds them then reaches the hub's history |
| A mixed commit | Its subject would reach the hub while only its shared files travel. The refusal prints how to split it |
| A private word or a secret shape | The refusal prints the place and the word's line number in the list, never the word. Take it out. If a commit holds it, amend that commit before the push: a new commit leaves the old one in the hub's history, and the push warns |
| A push landed, the rejoin did not, exit 7 | Run the push again: it picks up at the rejoin. If `git status` lists a change, commit or stash it first. A file whose content stayed the same, touched by an editor or Finder, no longer stops it |
| The hub out of reach, exit 5 | A pull or a push changes nothing. Read git's own lines under the refusal: a dropped network wants another try later, a refused SSH key, a wrong hub URL or a missing repository wants that fixed first. `shared:status` warns with the same lines and carries on, and `-- --offline` needs no network. A silent network costs a status about a minute before it warns, and leaves no ssh behind |
| A push the hub rejects, exit 5 | No rejoin ran, so this site is as it was, and the same push works once the hub takes it. The push fetches the hub again and says which case it is: a push that lost a race to another site says to pull, then push; a hub that declined it, by a rule or a hook, points at git's `remote:` lines, because a pull changes nothing there |
| A bad push | Fix forward with a new commit from any site. Never force-push the hub: every site records its commits |
| The split would carry this site's own commits | A commit without `shared/`, from `git rm -r shared` or a revert of the add, makes every later split carry the site's history. Bringing the folder back does not help. `shared:status` fails on its `split` line, and `shared:push` refuses, `--yes` too. A pull closes it when it lands on the hub's tree, so it needs a new hub commit. Behind: `npm run shared:pull`. In sync: publish any commit from another site, then pull here. Ahead or diverged: make this site's `shared/` change in another site and publish it there, then pull here |
| In sync, with commits waiting in the split | Those commits go out with the next change this site publishes, subject and all, though `shared/` equals the hub. A conflict resolved wholly to the hub's side lands here. The hub's tip stays right, and the plan printed before a push lists them. The next pull that brings a hub commit drops them |
| A branch merged, with `shared/` changes | Its merge reaches the hub by its subject, `Merge branch 'stale-work'` and all. Name such branches for a stranger |
| A first push that takes a while | Normal. Until the first rejoin every split walks the site's whole history, and a push runs at least two. After that they start from the rejoin |
| A reverted pull, shown as ahead | Do not push: that publishes the revert to every site. To take the hub again, revert the revert, then pull. Status and pull print the sha |
| A rewritten hub | Do not push: that publishes the old commit again, and the push refuses. If the status line prints a reset, run it, then pull. If the pull is pushed, see below |

### After a rewritten hub, once the pull is pushed

Put one clean commit on the hub first, from a site that never held the bad commit. Two records may not name
one hub commit: `git subtree` stops with `cache for <sha> already exists` on every split after that. Then one
pull by hand, which writes a rejoin's record. In fish:

```fish
git fetch shared main
git update-index -q --refresh
set hub (git rev-parse shared/main)
set here (git rev-parse HEAD)
git subtree merge --prefix shared --squash shared/main -m "shared: pull "(string sub -l 7 $hub)"

git-subtree-dir: shared
git-subtree-mainline: $here
git-subtree-split: $hub"
```

## Undo a bad pull

Not pushed yet, with the pull as the last commit:

```sh
git update-index -q --refresh
git reset --keep HEAD~1
```

Both of its commits go, and the same pull is clean later. A change of yours in a file the pull touched
stops the reset, and nothing moves.

A merge made with `git add -A` while its conflict was open, as `git ci` does, also holds every untracked file of
yours, and the reset deletes them with nothing in `git status`. So before the reset, list them and note the merge's
sha; after it, bring each back from that sha. `shared:status` prints this line with both filled in:

```sh
git diff --name-only --diff-filter=AM HEAD~1 HEAD -- . ':(exclude)shared'
git rev-parse --short HEAD
git update-index -q --refresh
git reset --keep HEAD~1
git restore --source=<that sha> -- <each file>
```

Pushed:

```sh
git log --first-parent --format='%h %s' -5
git revert -m 1 --no-edit <the "shared: pull" sha>
```

Keep `-m 1`: `-m 2` takes the whole site away.

While a revert stands, `shared:status` reads ahead, and both it and `shared:pull` print the way back. Do not
run `shared:push` unless every site should lose the change: it publishes the revert. A pull leaves the
reverted change out, and one that changes the same lines stops at a conflict: `git merge --abort`. To take the hub again,
revert the revert first:

```sh
git revert --no-edit <the revert's sha>
npm run shared:pull
```

`shared:status` then reads in sync, with commits waiting in the split as in the table above.

Keep `shared/` in every commit. A commit without it, from `git rm -r shared` or a revert of the add, makes
every later split carry this site's history, and the table above says how to close that.

## Silent failures

These build and pass their tests, so nothing stops. Each has a line that sees it.

`shared:status` reads these, one line each:

| Line | What it catches |
|---|---|
| `markers` | Conflict markers committed under `shared/` |
| `stubs` | A piece in use with no stub. With no admonition stub, a custom `:::keyword` draws an info box and the build still passes |
| `ignored` | A file under `shared/` that git ignores, so no other site gets it. A global ignore can drop `config`, `dist`, `sessions` and `*.gz` without a word |
| `node_modules` | A `shared/node_modules`. `shared/` installs nothing |
| `packages` | A package a shared piece needs that this site lacks, with the install line. A lock in range with the package not on disk, as in a fresh clone or a new worktree, warns with `npm ci` |
| `pin` | Docusaurus on another version than the pin |
| `carets` | A caret on a pinned package, so that the next install moves it |
| `lock` | Two `@docusaurus` versions in the lock |
| `split` | A commit without `shared/`, which would send this site's own history to the hub |
| `red` | A red `shared:all` or `shared:bump` here: it fails while the site still holds what went red, which would build and pass on a second run, and warns once that is undone and a plain pull would bring it back |

The rest need a step of their own:

| What goes wrong | What sees it |
|---|---|
| A stylesheet change that loses dark mode | `shared:compare`. Build and tests stay green, so list a site's awkward pages in `comparePages` |
| A failed install leaves the old packages, and the next build reads exit 0 on them | `shared:bump` stops there |
| A failed undo leaves the new packages under the old `package.json`, and a compare reads the new side against itself | `shared:bump` and `shared:all` refuse before they build |
| A change to an attribute alone, or words that leave every box the same size | Nothing in `shared:compare`: diff the two `build/` folders |
| An install forced past a conflict drops a package | Nothing: never force one |
| A KaTeX option list without the macros, so a page builds and shows red text | `katexOptions()`, never a shortened copy |
| A change under `wiring/` or to DropDownIC's `mdx.cjs`: a restarted dev server and a cached build keep the old macros and lists. After a plain restart, docs pages do show a `katex-macros.cjs` change while pages of the pages plugin keep the old macros, so one docs page proves nothing | The site's `clear` script before the build or the restart. `shared:pull` clears the cache itself when it brings such a change |
| An old MUI prop or class name on its list, which the component just ignores or no element carries | `scripts/check-mui-api.mjs`, for the names in `scripts/lib/oldMuiApis.json`. A removed name the list lacks passes |
| A test glob that matches nothing, or a test file left with no test: `node --test` exits 0 | `test:shared`, which calls a suite with no test files, a planned file with no test and a file named like a test that never runs a problem |
| A DropDownIC stub with a docs, blog or pages block that lacks its MDX plugins: the page throws React error #418 | `test:shared`, whose wiring rule asks every block for `remarkDropDownIc` and `rehypeDropDownIc`, and a docs, blog or pages plugin of the site's own too while a Markdown file of its folder holds a dropdown |
| A config that drops `shared/css/custom.scss` from `customCss`: the site builds without the shared look | `test:shared`, whose `customCss` rule runs once `src/css/site.scss` exists |
| A machine's path in the main chunk, from `require.resolve` in a config | `scripts/check-public.mjs` |
| A legacy admonition title once `mdx1Compat` is off | `scripts/mdx-check.mjs --strict` |

## The five rules

1. Commit `shared/` alone, with a subject that reads well in the hub, because a public site's history
   carries it.
2. A clean tracked tree before a pull or a push.
3. `--squash` in every site, forever.
4. A branch that holds a subtree pull is merged back, never rebased.
5. Never amend or squash a subtree bookkeeping commit.

## What never goes in

Nothing here imports from a site, reaches outside this folder, or needs a secret or a site's data.

Never in `shared/`, apart from `shared/template/`, which may hold a new site's starter `netlify.toml`,
`bibliography.js`, docs and blog post and nothing else on this list:

- a site's own data: source PDFs, data extracted from them, data read from another service;
- notes, blog posts and backups;
- `.env` values or any other secret;
- MUI X licence wiring or any `@mui/x-*` import;
- a site's own application code, such as its sync code;
- a site's `bibliography.js`, `netlify.toml` or Netlify notes;
- the code runner's server;
- anything served from a CDN.

The scans read a word list kept on each machine, outside every repository, at
`~/.config/docusaurus-shared/private-words.txt`: one entry per line, `#` for a comment, `word<TAB>path` to
allow a word in one path. Pull and push refuse without it, unless given `--no-word-list`, which scans for
secret shapes only. An entry with parts is found in each common spelling of them, as `check-public.mjs` finds
it. A binary file, a picture, a PDF or a font, is read whole for the words and gives no line; the secret
shapes skip binaries, whose random bytes look like keys, and the scan's own three files, which spell them.

## Make a new site

Run it from any joined site, or from a clone of the hub with `node scripts/new-site.mjs`:

```sh
npm run shared:new -- ../my-site --title "My site" --url https://my-site.example.com --repo owner/my-site
```

The folder must be new or empty, and in no repository. It makes the repository, mounts the hub, fills
`template/` from that mount, installs, builds cold, runs `shared:verify`, commits the lock and prints one fish
block. A run takes a minute or two.

The block makes the GitHub repository and the Netlify project, waits at the terminal while you set the wall
and the DNS record, gives the project its domain, then builds, deploys and asks the address what it answers.
It stops at the first line that fails. The script runs none of it: nothing is pushed or deployed. A wall goes
on before the first deploy, and in Netlify's pages, because a command would hold the password.

The Netlify project is named after a `netlify.app` address's first part, or else after the folder, so either
must hold letters, digits and hyphens alone: the script refuses any other name before it makes anything. Netlify
gives a project another name when that one is taken, so the block reads the name it got: the DNS line and the
last check use that one, and a `netlify.app` site whose project got another name stops there. The DNS line covers
a subdomain, which takes a CNAME record, and a bare domain, which takes an ALIAS or ANAME record, a flattened
CNAME or Netlify's load-balancer A record instead.

| It ends with | Exit | What is left |
|---|---|---|
| The block | 0 | A site on `master`, clean, with five commits |
| A usage line | 2 | Nothing made |
| `RED at` a step | 3 | The folder, as that step left it, and the step's log. Delete the folder, then run it again |
| `refused` | 4 | Nothing made |
| `Could not reach the hub` | 5 | Nothing made |

`--public` makes a public repository with no wall, and ends the site's build with the public check, which also
runs at the end of a `shared:new`. It needs the word list. `--exclude <path>` writes a path to
`.git/info/exclude`, which no commit carries, for a tool's folder that a public site's `.gitignore` must not name.

A new site comes with one page that shows every admonition and shared piece, `docs/examples.mdx`, and its rules
in `SITE-RULES.md`, a name no tool owns. `comparePages` and `shared:verify` start with sensible lines. Adjust both
as the site grows. `template/gitignore.template` becomes its `.gitignore`.

## Join an existing site

Run it from any joined site that is in sync with the hub, or from a clone of the hub's tip with
`node scripts/join.mjs`. The join reads the pin, `netlify.toml` and `.nvmrc` from the shared folder it runs
from, while it mounts the hub's tip, so a site held behind gives the new site an older Node and an older pin:

```sh
npm run shared:join -- ../my-site --check
npm run shared:join -- ../my-site
```

`--check` changes nothing. Each line reads `ok`, `info` for what the join does itself, `warn` for what stays
a person's, or `FAIL` for what stops a join. It exits 3 on a `FAIL`. A join refuses on exactly those lines
and exits 4, with nothing changed.

Build the site and keep that build outside it before you start, because the last step compares against it:

```sh
cp -R build ../keep-build
```

| What stops a join | What to do |
|---|---|
| No repository | `git init`, read what `git status` lists, then make a first commit |
| A changed tracked file | Commit or stash it |
| Docusaurus below 3 | Migrate first: "From Docusaurus 2" below. Then run `--check` again |
| Another branch, a worktree, an open merge | What its line says |
| A `shared/` that git subtree did not add, or a `shared` remote that points elsewhere | Rename the folder, or set the remote's address |

On a site that passes, a join:

1. adds the `shared` remote and fetches, so a hub out of reach changes nothing;
2. commits the housekeeping: a tracked `.gitignore` that lists `.env`, `deploy` through Netlify, and
   `netlify.toml` and `.nvmrc` from `template/` when they are absent;
3. refreshes the index and runs `git subtree add --squash`;
4. commits the npm lines, a default `comparePages`, `src/theme/Admonition/Types.js`, and a stub for each
   component folder that holds the same code as `shared/`, its opening comment aside.

A `netlify.toml` already on disk and out of git stays out, because it may hold a secret. Read it, then
`git add -f netlify.toml`. The next join takes its ignore line out.

A join never pushes, and never touches a site's config, CSS or MUI. It ends with what is left, in order, and
each line prints only while it is still open:

1. read a `netlify.toml` that sits out of git, then `git add -f` it;
2. run `npm uninstall docusaurus2-dotenv`, then delete its block from `plugins` in the config;
3. patch the site's own components with the `git apply` line it prints, and move any copy it names as changed by hand;
4. delete `src/components/CustomToolbar` and `src/components/_IllustrationsOnly` if no page imports them;
5. clear the site's MUI X packages, because npm stops at `ERESOLVE` until they go;
6. move MUI with the `npm install` line it prints;
7. install, with the line it prints, and commit what the shared pieces need and the site lacks, such as MUI on a
   site that has none: the stubs the join wrote import it, and the bump builds the site first;
8. list the site's awkward pages in `comparePages`, commit, and move to the pinned Docusaurus with `npm run shared:bump`;
9. run the join again, so that a copy that now matches becomes a stub;
10. write the stubs of the copies that still differ;
11. move any admonition type of the site's own into a `Types.js`, or, if every type is shared's, delete the folder
    and run the join again, which writes the stub;
12. wire `docusaurus.config.js` from "Mount it on a site";
13. move the site's own styles to `src/css/site.scss`, load `shared/css/custom.scss` first, and delete the old files
    `shared:verify` names;
14. on a public site, add the public check and keep each tool's private folder out;
15. stop builds on push if deploys come from this machine;
16. compare against the kept build. A site that comes back after `shared:leave` skips it: its `shared/` stayed.

Steps 3 to 7 come before the bump because `shared:bump` runs `shared:verify`, and the line a join writes there opens
with the old-MUI check, which fails on a site still on the old names. Old copies only match `shared/` on MUI 9, which
is why step 9 comes after them. A config with `future: { v4: true }`, as a new create-docusaurus site has, needs
`@docusaurus/faster` at the site's own version before the bump, because Docusaurus 3.10 loads it under that flag,
and its pages clean under `node shared/scripts/mdx-check.mjs --strict`, because the flag also turns MDX's old mode
off. Each step of a join looks first, so a second run does what is left, and a stopped run
can simply run again:

```sh
npm run shared:join -- .
```

**The MUI steps.** `scripts/patches/mui-9-components.patch` holds the MUI 9 changes to the components older sites
copied. `--check` prints its `git apply` line, with an `--exclude` for each file the site lacks or has changed, so
that the rest applies. The join's list names each changed file it left out, to move to MUI 9 by hand:
`node shared/scripts/check-mui-api.mjs` lists its old props. Apply it before
step 4 deletes anything, or that line no longer fits. Take the `npm install` line from the join's list: the one in
`shared:status` puts the bump first, for a site past its join. MUI X code stays out of `shared/`, so a component that
imports it takes its change by hand. Search `docs`, `blog` and `src/pages` for `CustomToolbar`, `DataGridBad` and
`DataGridGood`. With no hit, the site shows no grid: delete those files and uninstall every MUI X package the list
names. With a hit, uninstall the paid and generator packages, add the free grid at its MUI 9 major to the `npm install`
line of step 6, and copy those files from a site that has made this step.

**The stubs.** A copy that holds a site's data never matches `shared/`, so the join leaves it. `LC` is a plain stub, as
in Add a component, and its old `problems.js` goes: the hub's list holds every older entry. `BibRef` keeps
`bibliography.js` and takes the stub that hands it in, as in "When one site needs something different". If its old
citations link to another list page than `/docs/reference-list`, the stub passes that path as `listPath`.

**The styles.** Start from a joined site's `src/css/site.scss` and `_site-dark.scss`, not from the old `custom.scss`:
most of that file is `shared/css` now. Compile the old file and read what it holds that `shared/css` lacks, then keep
what a page uses. Once the config loads `shared/css/custom.scss`, `shared:verify` fails on each file `shared/` now
holds, such as `static/fonts`. Delete those. A file a doc imports from `@site/static` goes too: it hides `shared/`'s
file at the same address, in the stylesheet's `url()` and in what the address serves. Point the import at
`@site/shared/static/` and delete the copy in the same commit.

**The compare.** Custom admonitions need the `Types.js` a join writes. Without it Docusaurus draws them as `info`
and logs one console message for each, so a site with none before reads a list on those pages, with the messages
gone. A site from before Docusaurus 3.10 reads `structure changed` on each listed page with a code block, first at
`span.token-line -> div.token-line`, because 3.10 draws a code line as a block. Its screenshots stop at 2,400 px, so
open such a page on the served site and read a code block there.

`--public` makes the `netlify.toml` it writes end its build with the public check. On a site that has one, add
that yourself. `--exclude <path>` writes a path to `.git/info/exclude`, which no commit carries, for a tool's
folder that a public site's `.gitignore` must not name.

A site has joined when `shared:status` reads 0 failed, `shared:verify` passes, a cold build exits 0, and
`shared:compare` reads `0 changed` or a list you have read.

### From Docusaurus 2

A join needs Docusaurus 3, and MDX 3 is most of that move. List the work first, from a joined site, before
anything is installed in the old one. This changes nothing:

```sh
node shared/scripts/mdx-check.mjs --root ../old-site
```

Most failures are `<details>` blocks, and the header of `mdx-check.mjs` holds one regular expression that
fixes them. Fix the rest by hand, take the site through Docusaurus's own upgrade guide, then run `--check`.

## Remove a site

Run it in the site that leaves:

```sh
npm run shared:leave -- --check
npm run shared:leave
```

`--check` changes nothing. The leave takes the site's shared npm lines out of `package.json` in one commit,
`test:shared` and its own `shared:verify` among them, removes the `shared` remote and prints the way back. Nothing is
pushed. `shared/` stays as ordinary files, so the site builds and deploys as before and stops taking changes. Leave the
folder there: its stubs and its config read it.

The other sites pass it by without a word: a folder with `shared/`, no `shared` remote and no shared npm line has left.
One that keeps its lines and lacks the remote looks like a fresh clone, so `shared:all` and `shared:push` name it in a
`WARNING` with the fix for a clone, and with `npm run shared:leave` for a site whose remote went by hand.

To delete the site itself, delete its folder, its hosting and its repository. The hub loses nothing: what the
site published stays.

To come back, in that site:

```sh
node shared/scripts/join.mjs && npm run shared:pull
```

The join adds the remote and puts the npm lines back in one commit, `shared:verify` as it was before the leave. The
pull brings what the hub took in meanwhile.

## Hold a site back

A site you do not pull stays exactly where it is, so holding one back is just not pulling it. Its
`shared:status` reads behind and lists what is waiting, for as long as you like.

With `shared:all`, hold a site back now and take it later:

```sh
npm run shared:all -- pull --skip my-site
npm run shared:all -- pull --only my-site
```

- One pull brings everything the hub has, in one squash. It cannot stop partway.
- A held site cannot publish: `shared:push` refuses until it has pulled, so make the change in a site that is
  up to date.
- The Docusaurus pin stays held too. It lives in `template/package.json`, so a held site keeps its version.

## Mount it on a site

```sh
git remote add shared git@github.com:farlowdw/docusaurus-shared.git
git update-index -q --refresh
git subtree add --prefix shared shared main --squash
```

The middle line changes nothing but git's own cache. Without it `git subtree add` can stop at `working
tree has modifications` on a clean tree, as it does on a fresh copy of a folder. Pull and push refresh by
themselves.

`package.json`, where the last script line and `comparePages` are the site's own:

```json
{
  "scripts": {
    "shared:status": "node shared/scripts/status.mjs",
    "shared:pull": "node shared/scripts/pull.mjs",
    "shared:push": "node shared/scripts/push.mjs",
    "test:shared": "node shared/scripts/test.mjs",
    "shared:new": "node shared/scripts/new-site.mjs",
    "shared:join": "node shared/scripts/join.mjs",
    "shared:leave": "node shared/scripts/leave.mjs",
    "shared:bump": "node shared/scripts/bump.mjs",
    "shared:all": "node shared/scripts/all.mjs",
    "shared:compare": "node shared/scripts/compare.mjs",
    "shared:verify": "node shared/scripts/check-mui-api.mjs && npm run test:shared"
  },
  "comparePages": ["/", "/docs/intro"]
}
```

Every `@docusaurus/*` entry is the one exact version in `template/package.json`, and `shared:status` holds
a site to it.

`docusaurus.config.js`:

```js
const {
  ADDITIONAL_LANGUAGES, MAGIC_COMMENTS, admonitionsConfig, katexOptions,
  preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc,
} = require('./shared/wiring/index.cjs');

staticDirectories: ['static', 'shared/static'],
markdown: { preprocessor: preprocessDropDownIc },
// in docs, blog and pages:
remarkPlugins: [remarkMath, remarkDropDownIc],
rehypePlugins: [rehypeDropDownIc, [rehypeKatex, katexOptions()]],
...admonitionsConfig,
// in presets.classic.theme:
customCss: ['./shared/css/custom.scss', './src/css/site.scss'],
// at the top level, beside presets, so the .scss stylesheets compile:
plugins: ['docusaurus-plugin-sass'],
// in themeConfig.prism:
magicComments: MAGIC_COMMENTS,
additionalLanguages: ADDITIONAL_LANGUAGES,
```

Then a stub for each piece the site uses, as in Add a component, and this one for the admonitions.
`npm run shared:status` names any stub that is missing.

```js
// src/theme/Admonition/Types.js
export { default } from '@site/shared/theme/Admonition/Types';
```

- On an existing site these lines replace the config's own: its keyword list, KaTeX options and macros file, its
  `magicComments` and its languages. `preprocessor` goes in the site's `markdown` block, when it has one. A site that
  loads `docusaurus-plugin-sass` already keeps its own `plugins` line.
- `MAGIC_COMMENTS` holds six kinds. An older list may hold `-numbers` kinds as well, so search the notes for
  `-numbers` first: a note that uses one loses its mark with no error.
- Paths in the config stay relative strings: `require.resolve` puts this machine's path in the main chunk.
- Use `katexOptions()`, never a shortened `{ throwOnError: true }`: without the macros a page builds
  with exit 0 and shows red text.
- `remark-math` and `rehype-katex` stay imported by the site: they are ESM-only. A site without them installs them,
  with `sass` and `docusaurus-plugin-sass`, from the line `shared:status` prints on `packages`.
- A change to the config needs a dev-server restart. A change under `wiring/` or to `mdx.cjs`, yours or a pull's,
  needs the site's `clear` script (`docusaurus clear`) first, then a restart or a new build: Docusaurus reads the
  config through a loader that webpack's cache does not follow, so a plain restart and a cached build keep the old
  macros and lists. One part of that differs by plugin: after a plain restart, docs pages take a `katex-macros.cjs`
  change, because the docs plugin writes its options, the macros among them, to a file every doc depends on, while
  pages of the pages plugin keep the old macros until the clear. The blog plugin writes no such file, and was not
  tried. So a docs page that shows a new macro says nothing about the other pages. `shared:pull` clears that cache itself (`.docusaurus` and `node_modules/.cache`, never `build/`)
  when it brings such a change, a conflict in such a file names the clear for after its commit, and `shared:bump`
  and `shared:all` build cold.
  Components, `.scss` and CSS modules hot-update.
- Keep `SKIP_HTML_MINIFICATION=true` in the site's build environment.
