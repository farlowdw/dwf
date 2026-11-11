# codeRunner — the code editor's library

The pure logic behind the in-page code editor (`shared/components/CodeEditor`): which languages it
knows, which installed runtime runs a snippet, the request it sends, how it reads the answer,
and which lines it folds when it opens — and, for its teaching layer (2026-10-25), the line
specs and magic comments that mark lines, the steps, where a run's errors point in the reader's
code, TypeScript's source maps, and exercises (expected output, the check protocol and the
files of a check). No React and no DOM here, so `node --test` covers all of it (`__tests__/`,
part of `npm run test:shared`; the error and exercise modules against real answers of a
Piston server in `__tests__/fixtures/`). The only I/O is `fetch`, in `client.js`.

Import it in one line from a file of the editor's folder (a relative, fully specified path —
nothing in the folder imports `@site/…`, so the folder works on any site that mounts `shared/`):

```js
import { pickRuntime, executeCode, summarizeResult } from './lib/codeRunner/index.js';
```

Under `node --test`, import the module files themselves (`index.js` or a single module): Node
needs a file path.

## The path of a run

1. `fetchRuntimes({ url })` asks the site's runtimes URL once per page load (and URL) which
   languages and versions the site's Piston server has installed (never a hard-coded list).
   The URL is the monaco-editor plugin's `runtimesUrl` option, which the editor reads through
   `usePluginData`; the default, `RUNTIMES_URL`, is `/.netlify/functions/runtimes`.
2. `pickRuntime(runtimes, language, version)` chooses the newest installed version that matches
   what the page asked for ("3.12", "3.x", nothing), or says the version or the whole language
   is missing.
3. `buildExecuteRequest(…)` builds Piston's JSON: the limits come from `effectiveLimits()` (the
   page's limits over the defaults, the timeouts clamped to the server's 10 s to compile and 3 s
   to run), and "latest" or no version goes as `*`. `executeCode(payload, { signal, url })`
   posts it as `application/json` to the site's execute URL (the plugin's `executeUrl` option;
   the default, `EXECUTE_URL`, is `/.netlify/functions/execute`), a function that adds the
   server's secret and passes it on.
4. `summarizeResult(answer)` says what happened; `describeResult(summary)` writes the one-line
   status ("Exit code 0 · 52 ms CPU · 113 ms total · 13.7 MB").

## The modules

| Module | What it is for |
|---|---|
| `languages.js` | `LANGUAGES` (label, Monaco mode, file name per Piston language, and the name sent to Piston: `main` for Go, C, C++ and TypeScript, whose runners add the extension themselves; the editor never sends TypeScript to Piston, its compiled JavaScript goes to `javascript` as `main.js`), `ALIASES` ("py" → python, "py2" → python2: Python 2 is a language of its own), `languageInfo()` for any name |
| `versions.js` | `compareVersions()` ("3.10.0" > "3.9.4"), `matchesSelector()` ("3", "3.12", "3.x", "*"), `resolveVersion()` (the highest match) |
| `runtimes.js` | `runtimesFor()` (a language's runtimes, newest first), `pickRuntime()` (which one runs, and why), `runtimeLabel()` ("Python 3.12.0", "JavaScript 20.11.1 (node)") |
| `request.js` | `DEFAULT_LIMITS`, `TIMEOUT_BOUNDS` (the server's timeout limits), `effectiveLimits()` (the limits a run really gets: use it for the request AND for what the editor shows), `buildExecuteRequest()` (Piston's payload), `fromLegacyOutputSettings()` (the old `outputSettings` prop) |
| `result.js` | `summarizeResult()` (success, runtime / compile error, timeout, killed, output limit, internal error), `describeResult()`, `formatMs()`, `formatBytes()` |
| `errors.js` | `RunError` (with a `kind` and a `setup` note) and `explainHttpError()`: for every HTTP status (404 under `npm start`, a site password's 401, Piston's 403 / 400, the function's 413 / 415, Piston's own too-large 400, …), plain words for the reader, with nothing of how the site is set up, and a note for whoever runs it |
| `client.js` | `fetchRuntimes({ url })` (never rejects; shared by every editor on a page, per URL) and `executeCode(payload, { signal, url })` (rejects with a `RunError`; Stop aborts it). Both take `url` and default to the exported `RUNTIMES_URL` / `EXECUTE_URL` (`/.netlify/functions/runtimes` and `/execute`), which the editor feeds from the monaco-editor plugin's `runtimesUrl` / `executeUrl` options: a site whose functions live elsewhere changes its config, not this folder |
| `folds.js` | `normalizeFoldRegions()` (checks the `foldedRegions` prop: drops broken and crossing ranges with a warning, an exact duplicate silently), `innermostFirst()` (the order to fold in), `foldRegionsFor()` (one list, or one per language) |
| `snippets.js` | `normalizeSnippets()`: the `initialCode` prop (one string, or one snippet per language) in one shape, every line ending made `\n` (as Monaco's model holds it) |
| `lineSpec.js` | `parseLineSpec()`: a line spec (`5`, `'3-5,8'`, `[3, [5, 7]]`) as sorted, merged `[[start, end], …]`, clamped to the code, one warning for each bad part (never a throw). Also `linesOf()` (every line), `formatLineSpec()` (`'3-5, 8'`) and `lineKindsOf()` (`{ [line]: kind }`). Read by the editor's `highlight` and `steps` props and by `<CodeRef lines>` |
| `magicComments.js` | `MAGIC_COMMENTS` (a copy of `shared/wiring/index.cjs` > `MAGIC_COMMENTS`; a test compares them), `LINE_KINDS`, and `stripMagicComments()`: the snippet without its magic comment lines, plus `{ [line]: kind }` for the lines they mark, by Docusaurus 3's rules (copied, not imported; a test checks the installed Docusaurus still has them). A snippet without magic comments comes back as the very same string |
| `steps.js` | `normalizeSteps()`: the `steps` prop as `[{ ranges, note, title }]`; bad entries are dropped with a warning |
| `errorLocations.js` | `errorLocations()`: the lines (and columns) of the reader's code that a failed run's compiler or error output names, read from Piston's answer (Python tracebacks, Node stacks, gcc / g++, Go, Bash) and a failed C/C++ `assert()` (run stage), for the run-error markers and the "Line N" rows; only the reader's own file counts (`fileName`), with `lineOffset` / `mapLine(line, column)` for exercise harnesses and TypeScript (real answers in `__tests__/fixtures/errors`); every line read in linear time (a 64 KB line in under a millisecond); a warning never takes an error's place under the 50-location cap; Go's log lines (`main.go:7: msg`) are not compiler errors |
| `sourceMap.js` | `originalPositionFor()` / `originalLineFor()`: a line (and column) of TypeScript's emitted JavaScript back to the reader's TypeScript line, through the source map (base64 VLQ, `decodeMappings()`); use the column when known (TypeScript joins multi-line calls into one JavaScript line); never throws |
| `checkHelpers.js` | The check protocol (`CHECK_MARKER`: one line `@@check@@ {"name","pass","got","expected"}` per check, `{"done":true}` at the end) and the `check(name, got, expected)` helper of each language as source pieces, `CHECK_HELPERS` (python, javascript, bash, c, c++, go: the same equality rules everywhere; floats within `FLOAT_TOLERANCE`, single precision within `FLOAT32_TOLERANCE`), plus `TYPESCRIPT_CHECK_DECLARATION` for the type checker. C and C++ include only what the helper needs (C: `<stdio.h>`), so a reader's own names never clash |
| `exercise.js` | `compareOutput()` (the output against `expectedOutput`: normalised, first different line, a bounded line diff), `parseCheckResults()` (a check's stdout → cases, passed / total, other output, finished), `buildCheckFiles()` (the harness and the reader's code as Piston files: the reader's code in its own file with its own line numbers; verified on the server, `__tests__/fixtures/exercise`, recaptured with `capture.mjs`); `parseCheckResults` never throws, whatever the program printed |
| `exerciseProps.js` | `supportsChecks()` (`CHECK_LANGUAGES`: the languages with a check helper) and `exerciseTextFor()` (the per-language `tests` / `solution` props): what the editor's server-rendered placeholder needs, in a module of its own so the check helpers' source text stays out of a page's first download |
| `index.js` | re-exports all of the above |

Each file's header has the rules in full and says how to change them.

## An exercise's check, in one paragraph

`buildCheckFiles({ language, readerCode, harness })` gives Piston the harness as the file that
runs (`main.*`) and the reader's code in a file of its own (`solution.*`; Python adds the
helper as `dwf_check.py`; in C and C++ the reader's code is sent as `reader`, which Piston's
runner turns into `reader.c` / `reader.cpp`, the harness includes it, and its
`#line 1 "solution.c"` (`.cpp`) makes gcc name its lines `solution.c:L` — no file `solution.c`
is sent, on purpose: see `exercise.js`'s header), so its error lines stay the reader's; each `check(name, got, expected)` prints one line
`@@check@@ {"name","pass","got","expected"}` and the harness ends with `{"done":true}`;
`parseCheckResults(stdout)` reads them back. `errorLocations(answer, { fileName:
readerFileName })` then finds the reader's own lines. TypeScript is compiled in the browser
first (the editor's `typescript.js`) and checked as JavaScript.

## Adding a language

A language runs as soon as it is installed on the Piston server and a page gives a snippet
in it: its versions then appear in that editor's version menu, with plain-text highlighting and
its Piston name (no menu adds a language by itself). To give it a proper
name, highlighting and file name, add one line to `LANGUAGES` in `languages.js`:

```js
zig: language('Zig', 'plaintext', 'main.zig'),
//   key: Piston's language name, exactly as /api/v2/runtimes reports it
//   label shown to readers, Monaco language id ('plaintext' if Monaco has none), file name
```

If the language's Piston runner adds the extension itself (a compile error then names
`main.zig.zig`), give it a fourth argument, the name to send: `SUBMIT_NAME_BARE` (`main`), as
Go, C, C++ and TypeScript have. The header of `languages.js` lists which runners were checked.

Familiar other names go in `ALIASES` (lower case, pointing at the key). The tests check that
every Monaco id exists in the installed `monaco-editor` and that every alias points at a key.

## Folding, in one paragraph

A region is `[start, end]`, 1-based and inclusive: line `start` stays visible with the fold's
arrow, lines `start + 1 … end` are hidden (`[[1, 6]]` shows line 1, hides 2-6). Regions may nest
but not cross, and a line opens only one fold; an end past the last line is moved to it. Fold
in `innermostFirst()` order, because Monaco opens a closed fold again when something inside it
is selected.
