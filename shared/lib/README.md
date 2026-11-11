<!--
lib/README.md: what the lib/ folder is for, and how a site reaches a library in it.
How to change it: a library that moves in gets a line under "What is here", in the commit that brings it.
A library a site must wire by hand gets its own section after that list, as pageReload has.
-->

# lib

Plain JavaScript that runs in the browser and is no component: code a site's client module imports. It has
no stub. A client module under the site's `src/clientModules` imports the library by its path under
`shared/`, and stays the site's own file.

## What is here

- `pageReload/`: reloads an open tab after a deploy, at a safe moment. `decide.js` holds the rules and
  timings, `reloader.js` the browser side. It reads the id `plugins/build-id` writes.

## pageReload: reload an open tab after a deploy

A tab left open keeps running the build it loaded. Every production build gets a fresh id, in each page
(`<meta name="site-build-id">`) and in `/build-id.json`. When the tab becomes visible or gets focus, at
most every ten minutes, or at once when a chunk of its old build fails to load, it asks for
`/build-id.json`. A different id reloads the page, but never while a text field has focus, a dialog is
open, a request to the site's own `/api/` or to one of its functions runs (a save, a code run), the
page is hidden, or the site says text is unsaved.

A site takes it in three places:

1. `docusaurus.config.js`: `buildIdPlugin()` from `shared/wiring/index.cjs` in `plugins`, and the client
   module's path in `clientModules`.
2. A client module of the site, which stays the site's own file:

   ```js
   // src/clientModules/buildIdReload.js
   import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
   import { startReloader } from '../../shared/lib/pageReload/reloader.js';
   import { hasUnsavedWork } from '../components/CodeEditor/unsavedWork.js';

   if (ExecutionEnvironment.canUseDOM) startReloader({ win: window, doc: document, hasUnsavedWork });
   ```

3. The host serves `/build-id.json` with `Cache-Control: no-cache`, or a cached copy hides a deploy. On
   Netlify that is a `[[headers]]` block for `/build-id.json` in `netlify.toml`.

`hasUnsavedWork` is the site's own check: a function that answers true while an editor holds text that is
not saved. A site with the code editor passes that editor's registry, through its stub, as above. A site
with editors of its own passes their registry. A site with nothing to lose leaves the option out.

Without the option nothing is ever held for unsaved text, and no error says so: a dropped argument, or a
second copy of the registry, builds and passes this folder's tests, and a reload then takes typed text
with it. So a site with an editor keeps a test of its own that runs its client module, registers unsaved
text the way its editor does and sees the reload wait.

Under `npm start` the plugin writes no id, so nothing reloads there. A page behind a login wall that
answers `/build-id.json` with its login page reads as "unknown" and never reloads.

The meta's name and the session key (`site:chunkReloadAt`, the time of the last reload after a failed
chunk) are the same on every site. A tab loaded before a change to either still reloads: it reads the old
meta in its own page and asks the same `/build-id.json`. What it stored under an old key is not read
again and goes when the tab closes.

## Add a library

1. Add its folder here with its tests, and a row of kind `library` in `requirements.cjs`: `clientImport` is
   text the site's client module holds, such as the path it imports, and `suites` names the tests. The
   commit holds nothing outside `shared/`.
2. In a separate commit of the site, point the client module at the new path and delete the old folder
   under `src/lib/`. `npm run test:shared` names every file left there that `shared/` now holds.
3. Every file opens with a comment saying what it is for and how to change it.
