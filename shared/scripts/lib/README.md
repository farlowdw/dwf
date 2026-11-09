<!--
scripts/lib/README.md: the library under the shared scripts, file by file, and what in it is easy to get wrong.
How to change it: a new file in this folder gets a row in the table below, and a value that moves changes its
row in the same commit. The sections say where a new status check, kind of piece or test suite goes.
-->

# scripts/lib

The library under the shared scripts. `status.mjs`, and the pull, push and test scripts beside it, are
thin: what they know lives here. Node and git are enough, apart from `shared:compare`, which loads a
server from the site and a browser driver from a cache folder. Neither is an import.

| File | What it holds |
|---|---|
| `settings.mjs` | The names every script agrees on: `PREFIX`, `REMOTE`, `BRANCH`, `SITE_BRANCH`, `REMOTE_URL`, the word list's path, the four site files the scripts read (`package.json`, its lock, `.nvmrc`, `netlify.toml`), and the other names two scripts share, `MS_PER_SECOND` among them |
| `exitCodes.mjs` | `EXIT`, `ScriptError`, `runScript`, and `STOP_SIGNALS`: the signals a long run stops on, with their exit codes |
| `npmArgs.mjs` | Stops when npm kept an option typed without `--` |
| `git.mjs` | The one way to start git: real exit codes, no shell, `git-subtree`'s counter filtered out |
| `gitTimed.mjs` | Runs one networked git command under a limit, and at the limit stops what git started too, ssh included |
| `checkout.mjs` | Plain facts: the root, the branch, main checkout or worktree, changed files, tracked and ignored files, whether a remote holds a commit. Also a file's text and a folder's real path, which other files read through it |
| `state.mjs` | The state reader: the six states, the commits going out and coming in, the commits a split would carry, `commitsToPublish` |
| `siblings.mjs` | The one sibling finder. The hub holds no list of sites: they are found from `.git/config` files |
| `listeners.mjs` | The preflight: refuse while a server runs from this checkout. It reads and never stops anything |
| `privacy.mjs` | The word list on this machine, the secret shapes, the scans. A hit never prints the word |
| `wordList.mjs` | The one reader of the word list's lines, for the privacy scans and `check-public.mjs` alike |
| `wordForms.mjs` | The spellings of one entry of the word list, and the views of a text both privacy scans read |
| `markers.mjs` | Conflict markers in text files |
| `muiRefusals.mjs` | The MUI X terms `shared/` must never hold |
| `oldMuiApis.json` | The old MUI names `check-mui-api.mjs` fails on. JSON, which that check does not read, so it never trips on them |
| `stubs.mjs` | Reads a site's stub: where it points, and whether it is a plain re-export |
| `requirements.mjs` | Reads `requirements.cjs` against a site: which pieces it uses, a missing stub, packages against the lock |
| `suites.mjs` | What `test:shared` runs in a site, what it leaves out and why |
| `testEvents.mjs` | The second reporter `test:shared` hands node, and what its file says: a planned file with no test, the tests skipped |
| `range.mjs` | A small version-range comparator, since `shared/` has no `semver`, and `readVersionWord` for a version typed after a command |
| `pin.mjs` | The one version pin in `template/`: a site's manifest, lock and Node against it, and what npm has: the newest Docusaurus, one version, every version |
| `pinRange.mjs` | A Docusaurus version against the `@docusaurus` ranges of `requirements.cjs`: the refusal `shared:all -- bump` and `shared:bump` share, with the newest version npm has inside them |
| `checks.mjs` | The list of `shared:status` checks, how a result prints, and the four kinds of result `--check` of a join makes too |
| `once.mjs` | A value worked out on first use, then kept |
| `preflight.mjs` | The refusals pull and push share: worktree, branch, open merge, word list, changed tree, a hub out of reach |
| `hubChanges.mjs` | The files a pull would bring, read from the fetched commits before anything merges |
| `published.mjs` | The mixed commits a push would really publish, and the record a rejoin writes |
| `mixedCommit.mjs` | The refusal for a mixed commit, with the way to split it that fits |
| `carried.mjs` | What status, push and pull say when a split would carry this site's own commits, and the line that closes it |
| `testGate.mjs` | Runs `test:shared` for a push. Anything but green stops it |
| `ask.mjs` | One yes-or-no question on the terminal |
| `phrases.mjs` | Small pieces of wording for messages. A count printed with its noun goes through `counted`, a long list through `capped`, a line to paste beside a sibling through `inSite` |
| `compareSettings.mjs` | Every number, list and path of `shared:compare`: the two windows, the 37 properties, what is left out, the timeouts, the cache, the lock, the browser |
| `compareLock.mjs` | The sweep lock: one run at a time on a machine, in a format another tool can share |
| `compareServers.mjs` | Serves a build with the site's own `serve-handler` on a free port, inside this process, never on a port Chrome refuses, and refuses a range that leaves fewer ports than the run serves at once |
| `compareBrowser.mjs` | `puppeteer-core` from the cache, the browser's path, one Chrome started and stopped |
| `comparePage.mjs` | One load of one page in one theme and one window: wait until it rests, read it, take the screenshot |
| `comparePixels.mjs` | The two screenshots of a view, compared pixel by pixel: a PNG reader on node's own zlib |
| `compareDiff.mjs` | Two loads as one result, results as one verdict. No browser, no disk |
| `compareReport.mjs` | What `shared:compare` prints, and `report.json` |
| `bumpSettings.mjs` | Every number, name and command of `shared:bump` that no other script shares: the build's shape, the install's flags, the timeouts |
| `bumpLock.mjs` | What a bump does to `package.json`, the lock and `node_modules`, and what it reads back: one version, the `@mui` entries, the `overrides` to change or add |
| `bumpUndo.mjs` | The lines that put a site's packages back, including from a commit whose by-hand override stops a plain `npm ci` |
| `bumpBuild.mjs` | The one way a bump builds, and whether the current build can stand in for the old side |
| `bumpRun.mjs` | Runs one step in its own process group, with a log and a timeout |
| `deployLine.mjs` | The one chained line that publishes what a run tested |
| `siteGate.mjs` | The proof `shared:bump` and `shared:all` share: the old build kept, a cold build, the suites, the compare, and a build that went red set aside out of `build/` |
| `redRecord.mjs` | The note a red run leaves inside a site's `.git` folder, where it stands now (holds, waiting, settled), and the words status, the refusals and the Next lines say about it |
| `joinSettings.mjs` | Every name, npm line and subject of `shared:join` that no other script shares |
| `joinFacts.mjs` | What a join reads about a folder. It writes nothing, so `--check` may read any folder |
| `joinChecks.mjs` | The lines of `--check`, and the `FAIL` lines a join refuses on |
| `joinHousekeeping.mjs` | The `.gitignore`, deploy line and `netlify.toml` a joined site needs, worked out as text |
| `joinStubs.mjs` | Which component folders are copies of shared code, and the stub that replaces one |
| `joinPatch.mjs` | How the MUI patch fits a site, and the one `git apply` line |
| `joinNetlify.mjs` | Whether Netlify builds a linked site on a push. One word comes out of the CLI's answer |
| `joinByHand.mjs` | The list a join prints at its end |
| `siteLines.mjs` | Which npm lines are shared's, what a site holds of them, the lines a site held before `shared:leave`, and the one writer of a site's `package.json` |
| `newSiteSettings.mjs` | Every name, shape, token and subject of `shared:new` |
| `newSiteFiles.mjs` | Turns the new site's `shared/template` into its own files, with the tokens filled |
| `newSiteHosting.mjs` | The one fish block `shared:new` prints, and runs none of |
| `allArgs.mjs` | The words of `shared:all`, and the ready lines that repeat them |
| `allSites.mjs` | Which sites a run covers, in which order, and what a run says about what it found |
| `allStatus.mjs` | `shared:all -- status`: one row per site |
| `allPreflight.mjs` | What every site is asked before any is touched |
| `allPin.mjs` | Moves the pin and publishes it, behind one question |
| `allSite.mjs` | One site's turn: what it needs, then the pull, the bump or the proof |
| `allReport.mjs` | How a run ends: the undo, the sites left alone, the lines to paste |
| `allRed.mjs` | What a turn leaves for the next run: a new red note, the old one back, or none after a green proof, and the publish lines a red run printed |

## Pull and push

Both start with `passGates`, then `refuseDirty`, and neither moves anything until every check has
passed. Six things are easy to get wrong, so keep them:

- `git subtree` refuses a changed tree at a merge and a rejoin, not at a push. So a changed tree must be
  refused first, or the push publishes and only the rejoin stops.
- That refusal reads a stale index as a changed tree, and every fresh copy of a folder has one. `dirtyPaths`
  refreshes the index first. Every `git subtree` command runs `refreshIndex` (`checkout.mjs`) right before it, as
  `shared:join` and `shared:new` do: a push's tests and question, or a pull's fetch, take long enough for an
  editor or Finder to touch a file whose content stays the same.
- The rejoin runs only after `git push` exits 0. A rejoin after a rejected push loses local work.
- A split walks back to the last rejoin, not the last pull, so a commit behind a pull's merge can still
  go out. The state reader's `outgoing` list walks the same way, and stops only at a rejoin, a pull that
  wrote a rejoin's record, and the add. A push reads its subjects and its mixed commits from the split
  itself: `commitsToPublish` and `mixedPublished`. `outgoing` guides, the split rules.
- A commit without `shared/` puts the site's own line in every later split. A clean split holds only
  copies, so `commitsToPublish` counts the site's real commits in it, and any at all stops the push before
  every other check of the split. Nothing passes that refusal. Status runs no split. It reads the same
  thing from `carriedCommits`, which walks git subtree's rules over one `rev-list` and one `cat-file`.
- A pull writes a rejoin's record only when it landed on the hub's tree and the split would stay open.
  Not on every pull: two records that name one hub commit kill every later split with `fatal: cache for
  <sha> already exists!`, and two checkouts of a site that each pull one commit and then merge would get
  there. `lib/carried.mjs` says it in full.

## The join

`--check` and a join read one set of facts, `joinFacts.mjs`, and refuse on one set of lines, so they cannot
disagree. Three rules keep `--check` safe on any folder: every git call there uses `read: true`, tracked changes
come from `git status` and never from `dirtyPaths`, which refreshes the index, and `.env` is never opened. The
Netlify CLI runs from the temp folder, and one word comes out of its answer. A join's steps each look first, so
a second run does what is left: that is how the stub pass runs again after the MUI step. No step writes under
`shared/`, so neither of its commits is a mixed commit, and a split never carries them.

## The compare

`compare.mjs` takes the lock, serves both sides, starts one Chrome, then loads each page in each theme on
both sides and writes `report.json` after every view, with `state` running, so a detached run can be
followed by reading that file. It ends with `state` done or stopped. Four rules matter, each with a test
in `__tests__/compareDiff.test.mjs`:

- A load that failed is red. A dead server, an answer of 400 or more, a page in the wrong theme, a crash
  and a timeout all land there, so nothing can read as "0 changed" without having been read.
- Elements pair by position only while both pages hold the same tags in the same order. Otherwise the view
  says `structure changed, read by eye` and lists nothing.
- A width that moved by less than a pixel is rounding. `SUB_PIXEL_PROPERTIES` lists what this applies to.
- The result is a verdict and groups, never a score. A group is a selector, a property and a pair of
  values, once per run, with the views it showed up on.

The two sides differ in their port, so `compareDiff.mjs` takes each side's origin out of a value: a
`url()` holds it. A page must not depend on the clock or on chance, so `comparePage.mjs` fixes both before
the page's own scripts run, and `BLOCKED_HOSTS` are never reached. Two copies of one build must read
`0 changed` on every page of every site. When one does not, the fix is a stabiliser in
`compareSettings.mjs`, not a tolerance in the diff.

The lock's format is a contract: the process id on the first line, free text after it. The server sits in
this process and the browser talks over a pipe, so a killed run leaves neither behind, and the next run
clears its lock. Its test files start a real Chrome when the cache and a browser are there, and skip with
the reason when they are not.

## The bump

`bump.mjs` runs its steps in the order its header lists, and each step is a short function above `runBump`.
Its own lines stay readable because every child's output goes to a log beside the old build. Seven rules
matter, each with a test in `__tests__/bump.test.mjs`:

- Both sides of the compare are one shape. Every build goes through `coldBuild`, with `BUILD_ENV` set in the
  process, because a site's `.env` is read too late. The current build stands in for the old side only
  when it is as new as the last commit, its HTML has that shape, and it is newer than the package files and
  `shared/`. After a red run and its undo the last commit is old and `build/` is the build that went red, so
  without that last check a second run compares that build with itself and reads `0 changed`. `--before`
  names a build kept already, which is how `shared:all` hands one in.
- The old side is the site as `package.json` says. `keepBefore` refuses when an installed `@docusaurus` package
  is off the manifest: after a failed undo a build there is the new version on both sides, and can read `0 changed`.
- A failed install stops the run with nothing built. The install turns `--force` and `--legacy-peer-deps`
  off by name, so an `.npmrc` cannot turn a failure green.
- Any `@mui/x-*` lock entry that moved is red, before a build. Other `@mui` moves are counted and named.
- A step is a process group. `npm run` starts node, node starts a test file, and a hung test file outlives
  npm, so a timeout has to reach the group. A step that ends takes its group with it.
- Green means nothing was red. "0 changed" commits and exits 0. A list to read commits too and exits 8,
  because a real upgrade leaves a short list: the commit is local, and the list is printed with the undo.
  A site on the version is skipped, which is how a run starts again, and the two files left changed by a
  red run do not count as being on it.
- A red leaves the site's note (`redRecord.mjs`), and a red at the build, the suites or the compare moves `build/`
  beside the old build: after an undo, the last commit is old again and `build/` would be the build that went red,
  which a deploy typed by hand would send. A bump that commits clears a bump's note. The ones `shared:all` writes and
  clears are its own (below).

## The roll-out

`all.mjs` is thin. `lib/allSites.mjs` chooses the sites, `lib/allPreflight.mjs` asks them, `lib/allPin.mjs` moves the pin
and `lib/allSite.mjs` takes each turn. Eight rules matter, each with a test in `__tests__/all.test.mjs`:

- Every site is asked before any is touched, with the real questions: `refusePull` from `pull.mjs`,
  `refuseWrongSite`, `refuseNoCompare` and `refuseOffManifest`. They change nothing but a fetch.
- A site runs its own copy of the pull and the bump. After a pull those are the hub's new ones, and this
  process keeps running from files the pull replaced, so every import here stays static.
- A turn reads the state again, because the pin may just have reached the hub. What a site needs comes from
  the two trees, HEAD's `shared/` and the hub's, with deleted files counted. `lib/hubChanges.mjs` leaves those out.
- The old build is kept before the pull and handed to the bump with `--before`, or the bump would rebuild it
  with the pull in it, and a change on the hub would read as no change. The site that moves the pin keeps its
  build before the pin's commit, for the same reason.
- The undo is read from the disk, never from an exit code. An open merge, the two package files and a commit
  each add their line, and a site that never left has none. A printed line runs from any sibling. The install
  in it comes from `lib/bumpUndo.mjs`, as in `shared:bump`'s own lines.
- A green end exits 0 even when `shared:status` would fail a site, as a step down does. One line says which sites,
  and the way back.
- A run that moves the pin moves it from the site it runs in, so a refusal there never offers that site's `--skip`:
  it names the undo a red run there printed, or says to fix it. After that undo the site still stands on the pin
  before, which reads the same as a bump not yet run, so status's `pin` fix names the bump and the pin-back line
  (`pinBefore` and `pinBackLine` in `pin.mjs`).
- A red that leaves something to undo leaves a note in that site's `.git`, never in a commit (`redRecord.mjs`,
  `allRed.mjs`). Where it stands is read from the site each time: it holds while the bump's files or the red pull's
  hub commit are there, so `refusePull` refuses and status fails with the undo; it waits once undone, so the hub
  line and the Next lines name the way on and never a pull that brings it back; it is settled once the site is past
  it. A turn takes the note up, so the site's own pull and bump never see it, then leaves none after a green proof,
  a new one after a red, or the old one back after anything else, unless the site is past it.

## Add a status check

Write a function in `checks.mjs` that takes the context and gives a result from `ok`, `warn`, `fail` or
`info`, then add it to `CHECKS` where it should print. Add a test in `__tests__/status.test.mjs` that makes
the line fire. A warning is a normal state that wants an action and leaves the exit code at 0. A failure is
something broken and exits 3. An information line says what is so: it is never red, and the summary leaves
it out.

## The version pin

`template/package.json` and `template/.nvmrc` are the pin. Every `@docusaurus/*` entry there is one exact
version. React and MUI stay ranges. `shared:status` adds these lines:

| Line | Level | It fires when |
|---|---|---|
| `pin` | FAIL | a `@docusaurus/*` entry of the site, in `package.json` or the lock, is off the pin. On a site still on the pin before, its fix also names the pin-back |
| `carets` | FAIL | a `@docusaurus/*` entry of the site names anything but one exact version |
| `lock` | FAIL | the lock's tree holds two `@docusaurus` versions, however deep |
| `node` | warn | `.nvmrc` or `NODE_VERSION` in `netlify.toml` is missing or off the template's `.nvmrc` |
| `ranges` | info | always: what the lock holds of React and MUI, and which fall outside the template's ranges |
| `newest` | info | npm's `latest` is newer than the pin. It says `ok` when not, and `--offline` skips it |

`pin` and `carets` read `dependencies` and `devDependencies` only: a caret in `overrides` is the site's own
business, and it stays. A package under `@docusaurus/` on version numbers of its own goes in
`SEPARATELY_VERSIONED`. Nothing here moves a version: `npm run shared:bump` does.

## Add a kind of piece

A row in `requirements.cjs` needs no change here. A new kind needs an entry in `USE_BY_KIND` and
`REQUIRED_FIELD` in `requirements.mjs`.

## Add a test suite

A suite is a test folder named in `requirements.cjs`: a piece's `suites`, or `ALWAYS_SUITES`. `test:shared`
reads its `.test.cjs`, `.test.mjs` and `.test.js` files, the folder's own and not those of folders inside
it, so a row lists each folder. A test file in no suite fails the run, because nothing would run it, and so
does a file named the way node's own runner names a test (`x-test.mjs`, `x.test.mts`) that these endings
leave out. A planned file that holds no test fails it too: node counts such a file as one passing test, and
`testEvents.mjs`, a second reporter beside the spec one, is how the run sees that, and how many tests node
skipped. A suite of a piece the site does not use is left out, and the run prints why. The scripts' own
suites run on `npm run test:shared -- --scripts`, or when `shared/scripts` differs from the hub commit the
site recorded.

## The word list

One plain file on each machine, outside every repo, at `~/.config/docusaurus-shared/private-words.txt`:
one entry per line, a line whose first mark is `#` is a comment, `word<TAB>path` allows that word in that one
path. It can never sit in `shared/`, because public history would then publish the words it guards. A missing
file, or one with no word in it, reads as `missing: true`: status warns, and pull and push refuse.

`wordList.mjs` is the one reader of its lines, so the privacy scans and `check-public.mjs` take every line
alike. A line with more than one tab, or with a path and no word, is a bad line: status warns with its number,
and `check-public.mjs`, which runs on its own in a site's build, refuses the list, as it refuses a missing one
unless given `--allow-missing-word-file`. A bad line's word is still read. `check-public.mjs`'s header says how
the list applies to built files, where an allow line takes a word out of the scan altogether. Both match
through `wordForms.mjs`, so an entry with parts is found in the same spellings by each.

## Tests

`scripts/__tests__/fixture.mjs` builds real repositories in the temp folder, a bare hub and sites beside
each other, with real `git subtree` commands. Reuse it for every script's suite. `flows.mjs` adds what the
pull and push suites need on top of it: an answer on stdin, a stand-in for `test:shared`, hooks in the hub.
`allFixture.mjs` puts the real scripts on such a hub, so each site runs its own copies.

A test leaves nothing running. Start a server with `startServer` and a hang with `hangCode`, both in
`fixture.mjs`, and stop any other child with `stopProcess` in the test's `after`. A runner that is killed
runs no `after` hook, so a server also ends when its stdin closes, and each has a time limit.
`strays.test.mjs` proves all of it, and that a run of the server tests leaves no process.

A value lives in one file, and the others import it. `onePlace.test.mjs` goes red when a constant or a
function of the scripts is written the same in two files, or a list under two names. The few that stay
apart on purpose are listed there, each with its reason.

From the hub:

```sh
node --test "scripts/__tests__/*.test.mjs"
```
