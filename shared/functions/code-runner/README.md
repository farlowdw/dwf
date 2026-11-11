# `shared/functions/code-runner` — the code editor's two functions

`<CodeEditor>` runs code on a [Piston](https://github.com/engineer-man/piston) server. A browser
cannot call that server: its proxy wants a secret, and a page cannot keep one. So a page asks two
Netlify functions on its own site, and they check the request, add the secret and pass it on.

```
page ── POST /.netlify/functions/execute ──▶ execute.mjs ── POST PISTON_BASE_URL/api/v2/execute ──▶ Piston
page ── GET  /.netlify/functions/runtimes ─▶ runtimes.mjs ── GET  PISTON_BASE_URL/api/v2/runtimes ─▶ Piston
```

This file is for whoever runs a site: what the functions need, how a public site runs them, and
how to change them. Each source file's header has its rules in full. The server itself is not
here: a site names one with two variables, and keeps its own notes on it.

## What is here

| File | What it does |
|---|---|
| `execute.mjs` | `POST`: runs one program |
| `runtimes.mjs` | `GET` or `HEAD`: lists what the server has installed |
| `lib/piston.mjs` | What both use: the two variables, the call with the secret, the JSON answers, the log |
| `lib/origin.mjs` | Which pages may ask |
| `lib/rateLimit.mjs` | How often one client may ask |
| `__tests__/` | The tests, against a fake fetch (`fakePiston.mjs`) and a fake Piston server on a real socket (`fakePistonServer.mjs`). `functionShims.test.mjs` reads the site, `overSocket.test.mjs` runs its shims through that server |

Nothing here deploys by itself. A site has two one-line shims in its own `netlify/functions/` and
a `[functions]` block in `netlify.toml`. esbuild bundles this folder into each function, and the
URLs stay Netlify's defaults. The lines are in `shared/components/CodeEditor/README.md` → Taking it
to another Docusaurus site, steps 5 and 6.

## The server

The functions expect three things of whatever `PISTON_BASE_URL` names:

- Piston's HTTP API at `/api/v2/execute` and `/api/v2/runtimes`.
- A proxy in front of it, over `https`, that refuses any request without the right
  `x-piston-proxy-secret` header.
- Time limits of at least 10 s to compile and 3 s to run. Piston refuses a request above its own
  limits, and the functions send those two numbers as the most a page may ask.

## Environment variables

All four are set on the site's Netlify project, scope Functions. A build needs none of them. A
change reaches the functions at the next deploy.

| Variable | Needed | What it is |
|---|---|---|
| `PISTON_BASE_URL` | Yes | The server's origin. A trailing `/` is dropped. Not a password, but keep it out of repositories: no page ever needs it |
| `PISTON_PROXY_SECRET` | Yes | The value of the `x-piston-proxy-secret` header (*The secret*). Never in a file, a URL or a browser |
| `CODE_RUNNER_RATE_LIMIT` | No | `N/S`, N runs per S seconds for one client. Unset: `20/60`. `off` switches both functions' limits off. Not a secret (*The rate limit*) |
| `CODE_RUNNER_ALLOWED_ORIGINS` | No, leave it unset | Other origins to admit, comma-separated. A site's own pages never need it. Not a secret (*The origin guard*) |

In fish, where `(pbpaste)` takes the value from the clipboard, so that it never shows:

```fish
netlify env:set PISTON_BASE_URL (pbpaste) --scope functions
netlify env:set PISTON_PROXY_SECRET (pbpaste) --scope functions
```

## Running it on a public site

A site with no password can keep Run on. The guards always run, on every site, so there is nothing
to switch on.

**What it needs**

1. The two shims and the `[functions]` block (*What is here*).
2. `PISTON_BASE_URL` and `PISTON_PROXY_SECRET` on the site's Netlify project, scope Functions.
3. Nothing else. With `CODE_RUNNER_RATE_LIMIT` unset, each client gets 20 runs in 60 s. With
   `CODE_RUNNER_ALLOWED_ORIGINS` unset, only the site's own pages are admitted, on whichever host
   served them, so there is no list of domains to keep.

**When Run goes live.** At the first deploy that holds the shims while both variables are set.
A variable set with no context reaches every deploy, a draft deploy included. To deploy with Run
off, remove both variables first. Each function then answers `500`, the editor still shows the
code, and Run shows a plain message.

```fish
netlify env:unset PISTON_BASE_URL
netlify env:unset PISTON_PROXY_SECRET
```

Earlier deploys keep Run. Netlify gives each deploy the variable values it was made with, so a
draft, and every deploy before this one, still runs code at its own
`<deploy id>--<site>.netlify.app` address until Netlify deletes it (30 days by default, 90 on paid
plans), and Publish deploy on one of them brings Run back. To stop Run at once everywhere, change
the secret on the server's proxy. That stops every site whose variables name that proxy, so give
each site that keeps Run the new `PISTON_PROXY_SECRET` and deploy it. Or delete those deploys under
Deploys.

`CODE_RUNNER_RATE_LIMIT=off` is not a way to do that: it leaves Run on with no limit. Use it for
debugging only.

| Guard | Where | Answer | What it keeps out |
|---|---|---|---|
| Only the site's own pages | `lib/origin.mjs` | `403` | Another site's page |
| A rate limit per client | `lib/rateLimit.mjs` | `429` with `retry-after` | A page firing Run in a loop, a script |
| JSON only | `execute.mjs` | `415`, and `405` for a preflight | Another site's form post or `no-cors` fetch |
| Bounds on every request | `execute.mjs` | `400`, `413` | Anything beyond what the server allows |
| The secret stays with the function | `lib/piston.mjs` | None: a page never sees it | A page, a log line or a redirect reading it |

### The origin guard

A browser says which page sent a request, and a page cannot forge that. The guard reads the
`Origin` header, or the origin of the `Referer` when there is none.

- **The site itself is admitted:** the same host as the request's URL, over `https`. Plain `http`
  counts only on `localhost`, `127.0.0.1`, `[::1]` and `*.localhost`, for `netlify dev`.
- **Anything else is a `403`**, before the body is read. The stranger's origin goes to the log and
  never into the answer.
- **No origin at all:** `execute` refuses it, since a browser always sends one on a POST and a bare
  script does not. `runtimes` lets it through: a same-origin GET carries no `Origin`, a `Referer`
  can be stripped, and a GET runs nothing.

`CODE_RUNNER_ALLOWED_ORIGINS` takes `scheme://host[:port]` entries, no path. Case and a default
port do not matter, and an entry that is not an `http(s)` origin is logged and ignored. It cannot
let another site's page use these functions. They send no `Access-Control-*` header and refuse the
preflight, so that page's own browser stops it first, and the editor there shows a network error
rather than this `403`. The variable admits only a request that arrives already carrying that
origin: a server-side proxy, or `netlify dev` opened from another device (*Checking locally*). A
second site runs its own shims instead.

### The rate limit

A token bucket per client IP, kept in the memory of the warm function instance, with no store and
no service. It holds `N` runs and refills evenly over `S` seconds, so a reader can make `N` runs at
once, and at `20/60` one run comes back every 3 s. A reader pressing Run by hand never meets it.

- **`execute`** reads `CODE_RUNNER_RATE_LIMIT`, default `20/60`. **`runtimes`** has a fixed `60/60`,
  since a page asks for the list once. `off` switches both off. The two count separately.
- **Over the limit** is a `429` saying how many runs and how long to wait, with a `retry-after`
  header in whole seconds.
- **The client** is the function context's `ip`, else `x-nf-client-connection-ip`, else `client-ip`,
  else the first address of `x-forwarded-for`, which only a host other than Netlify reaches. With
  none of them, all requests share one bucket. An IPv6 client is its `/64`, the network one home
  line or one rented server holds whole, so a new address inside it is the same client.
- **An unreadable value** is logged once and the default used, so a typing slip never means "no
  limit". The value is parsed once per warm instance.
- **Memory:** at most 1,000 clients per instance. Full buckets are forgotten first, then the oldest.

To change it, say to 40 runs a minute:

```fish
netlify env:set CODE_RUNNER_RATE_LIMIT 40/60 --scope functions
```

### What the guards do not do

- **They do not count exactly.** Netlify may run several instances, a cold one starts with full
  buckets, and a client whose address changes (with IPv6, whose `/64` changes) gets a new bucket.
  The limit bounds abuse. A determined client gets more than `N/S`, though never an unlimited
  stream, and each run stays inside the time limits.
- **They do not stop a script.** `curl` can send any `Origin`. Against a script stand the rate
  limit, the bounds and Piston's own sandbox.
- **Readers behind one address share a bucket:** an office, a school, a VPN. Raise the limit if that
  ever shows.
- **Off Netlify the client can be forged.** With no `context.ip` and no Netlify header, the bucket is
  keyed on `x-forwarded-for`, which a script picks itself. That is a note for another host.
- **Sites on one server share its queue.** A small server runs few jobs at a time, so a public
  site's traffic slows every site on that server. If it shows, give that site a server of its own
  and change its two variables. Nothing in the code changes.

### Netlify's own rate limiting

Netlify has an edge-side limit on every plan (docs.netlify.com → Rate limiting, read 2026-10-26). It
is not used here. It cannot go in `netlify.toml` for a function, because the TOML form is for
redirect rules. For a function it is the `config` export, and the docs say a rule needs the
function's `path`, which replaces the default URL the editor and the plugin use. An invalid rule
does not fail a deploy, and may say nothing.

To add it anyway, in `execute.mjs`, with the token bucket left in place behind it:

```js
export const config = {
	path: '/.netlify/functions/execute', // needed by a rule; REPLACES the default URL
	method: 'POST',
	rateLimit: {
		windowLimit: 20, // requests per client in the window…
		windowSize: 60, // …of this many seconds, at most 180
		aggregateBy: ['domain', 'ip'], // the only mode outside Enterprise
	},
};
```

Then name that URL in the plugin's `executeUrl`, drop the "no custom path" check for that function
in `__tests__/functionsLayout.test.mjs`, and try the rule on a deploy preview before relying on it.

### Check it after the first deploy

From any shell, with `<site>` the site's host. None of these reaches Piston: each stops at a guard
or at the empty request. `curl` sends whatever `origin` it is told, so these test the function's
rule, not a browser's.

```fish
# another site's page: 403, "Refused origin"
curl -s -X POST https://<site>/.netlify/functions/execute -H 'content-type: application/json' -H 'origin: https://other.example.com' --data '{}'
# no page at all: 403 too
curl -s -X POST https://<site>/.netlify/functions/execute -H 'content-type: application/json' --data '{}'
# the site's own page: 400 naming "language", so the guards passed and the empty request did not
curl -s -X POST https://<site>/.netlify/functions/execute -H 'content-type: application/json' -H 'origin: https://<site>' --data '{}'
# the rate limit: 100 one after another, counted by status: 400s first, then 429s
for i in (seq 100); curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<site>/.netlify/functions/execute -H 'content-type: application/json' -H 'origin: https://<site>' --data '{}'; end | sort | uniq -c
```

Send them one after another, not at once. Netlify may answer requests that arrive together from as
many instances, each with a full bucket, so a burst of 25 can pass whole and say nothing about the
limit. One after another they reach the warm instances in turn, and the first `429` comes after
about 20 requests for each warm instance: expect some `429`s among the 100, not "exactly the 21st".
A loop slower than the refill (one run every 3 s at `20/60`) never empties a bucket. On a site
behind a password, add that password's cookie to each line. A real Run in a browser is the last
check, and it runs code.

## What the reader sees

The editor turns each answer into plain words (`shared/components/CodeEditor/lib/codeRunner/errors.js`).
On a public site these are read by anyone, so they say nothing of how the site is set up: no
variable, no server, no command. The reason goes to whoever runs the site, in two places. After a
failed Run or Check, the browser's console has one `console.warn` line that starts `CodeEditor:`,
with the names to check and never a value. The function log, Netlify's, holds the reason in full.
A failed list of languages prints no line: it goes out on every page with an editor, with no reader
waiting, and the editor carries on without its version menu.

A `5xx`'s own words never reach the reader, whoever wrote them: they go to the console line. The
words of a `400`, `415` or `429` do, because they are about the request.

Anyone can also call the functions directly, so their answers say nothing of the setup either: no
variable, no server, no path, and none of the server's own words. A missing variable is a `500`,
*Missing server configuration.*, and an error from the server is JSON in the function's own words,
*The code runner's server answered 503.*, its status kept or relabelled (*Both functions*). Only
Piston's own `400` message passes, with the secret and the server's address replaced, because it is
about the request. The
function log has the rest: the variable to check, and the first 300 characters of the server's
answer, with the secret replaced.

| Answer | The editor says | What to look at |
|---|---|---|
| `403` from the origin guard | *This page may not use the code runner…* | A page on another site, or `netlify dev` opened at a LAN address (*Checking locally*) |
| `403` from the server's proxy | *The code runner is not accepting runs right now…* | `PISTON_PROXY_SECRET` differs from the proxy's |
| `429` | The function's words: how many runs, how long to wait. Run works again after the wait | Readers sharing one address, or a loop (*The rate limit*) |
| `500`, variables missing | *The code runner isn't available right now.* | Both variables, scope Functions, then a new deploy. A site with Run held off shows this too |
| `404` | *The code runner isn't available here.* | `npm start` and `npm run serve` have no functions. On a deployed site, the shims |
| `401` | *Your session on this site has ended…* | Only a site password's own page answers this: a Piston `401` reaches the page as `502` |
| `400` | The function's or Piston's own words | The field the message names, or a version the server lacks |
| `413` | *The code and its input are too large to send to the code runner.* | The size of the code and its input (*The two functions*) |
| `500`, any other | *The code runner failed (500)…* | The function log: a secret holding a character a header cannot carry, or the server's own `500` |
| `502`, `504` | *The code runner could not be reached (502)…*, *The code runner took too long to answer (504)…* | The function log: the server is down, `PISTON_BASE_URL` is wrong (a `400` that is not Piston's own comes as this `502`), or there was no answer within 25 s |

## The two functions

### `execute.mjs`

| Rule | What happens |
|---|---|
| Method | `POST` only, else `405` with `allow: POST` |
| Media type | `application/json`, in any case, parameters allowed, else `415` before the body is read |
| Size | At most 100,000 bytes, for the body and for what is forwarded, else `413`. Piston's parser stops at about 100 KB with a `400` that holds only a stack trace, which becomes the same `413` |
| Fields | Piston's own, each within bounds: `language`, `version` (`*`, the newest, when absent), 1 to 5 `files`, `stdin`, up to 20 `args`, timeouts, memory limits. Anything else is dropped |
| Timeouts | Clamped to 10 s to compile and 3 s to run, so a page asking for more gets the limit instead of Piston's `400`. The editor's library clamps the same way, to show the limit a run really had |
| Memory limits | At least 1 MiB, or `-1` for the server's own. Piston reads 0 to 999 as no limit at all |
| Answer | Piston's status and JSON for a run, and Piston's own `400` message, never cached. Any other error is in the function's words (*Both functions*) |

**Why JSON only.** Behind a site password the cookie is the only lock, and a browser may attach it
to a request another site makes. That site can send a form or a `text/plain` POST unasked, but not
an `application/json` one: for that the browser sends a preflight first, and the function refuses
it. On a public site the origin guard does the same job, and this stands behind it.

### `runtimes.mjs`

`GET` or `HEAD` only, else `405`. Piston's list, each entry reduced to `language`, `version`,
`aliases` and `runtime`, with `cache-control: private, max-age=300`: the browser may reuse it for
5 minutes, a shared cache never. The editor asks once per page load.

### Both functions

- **Errors are JSON `{ message }`**, which the editor reads, and are logged with `console.error`.
  That holds for an error from the server too: its status, in the function's own words, never its
  body (*What the reader sees*). Only Piston's own `400` message passes. A `400` without one is not
  Piston's (a proxy's page, an `http://` address on the proxy's `https` port) and comes as a `502`.
- **The order of the checks.** `execute`: method, media type, origin, rate limit, configuration,
  size, JSON, fields, the forwarded size. `runtimes`: method, origin, rate limit, configuration. A
  refused request's body is never read.
- **Relabelled statuses.** A `401`, a `404`, a `3xx`, or a status outside 200 to 599 from upstream
  reaches the page as `502`. The editor reads `401` and `404` as the site's own: a session ended,
  no functions here. A `2xx` that is not JSON, or not a list for `runtimes`, is `502` too.
- **No redirects.** The call to Piston refuses them, so the secret never goes anywhere else.
- **Node's own `https`, not `fetch`.** Netlify's function runtime wraps the global `fetch` and adds
  the host of each call to the function's answer, in an `x-nf-fetch-timing` header. So the call to
  the server goes over Node's `https` (`http` for an `http://` address), on a socket of its own that
  closes after the answer, and the server's host never rides on an answer to a page.
- **A time limit.** No answer within 25 s is a `504`. Netlify's own limit on a function can be
  shorter: its error then answers first, and the page reports an upstream failure.
- **Only on Netlify and under `netlify dev`.** `npm start` and `npm run serve` answer `404`.

## The secret

- `PISTON_PROXY_SECRET` goes only from a function to the server, in the `x-piston-proxy-secret`
  header, and never in a URL, the browser or a repository.
- Every line the functions log has it replaced by `[secret]`, and so has any of the server's words
  that reach a page: a run's answer, Piston's own `400` message. A run's answer that is no longer
  JSON once the value is replaced is a `502`.
- In those same words that reach a page, the server's address is replaced by `[server]`: the value
  of `PISTON_BASE_URL`, its host with the port, and its host name, in any letter case. A server or
  a proxy that names itself in an answer does not hand its address to a caller. A local name
  (`localhost`, `127.0.0.1`) is left, and the function log keeps the address.
- A value holding a character a header cannot carry is refused with a `500` that never shows it:
  a line break inside it, a control character, or anything above U+00FF. Spaces and line breaks at
  the ends are trimmed. Set it again on Netlify.
- Either variable missing or blank: `500`, *Missing server configuration.* The function log names
  both variables, and the answer names neither.
- Netlify's CLI prints the value of a variable not marked secret (`env:get`, `env:list --plain`,
  `env:list --json`), so never paste that output anywhere.

## The modern functions API

Both are modern Netlify Functions, not the Lambda-compatible shape (`exports.handler`), whose
deploys Netlify stops accepting on 2027-07-01.

- **Each is an ES module** whose default export is `async (request, context) => Response`: a web
  `Request` in, a web `Response` out. The logic is `handleExecute` or `handleRuntimes`, which the
  tests call with a fake environment, fetch and limiter.
- **No `handler` export, ever.** The bundler reads a file as modern when it has a default export and
  no `handler`. A shim stays one re-export of the default for the same reason, and because named
  exports do not pass through it.
- **No `config` export.** Its `path` replaces the default URL, and these two must stay at
  `/.netlify/functions/execute` and `/.netlify/functions/runtimes`.
- **The client's IP** is `context.ip`, and **the site's host** is the host of `request.url`.
- **The variables** are read from `process.env`, which Netlify fills for a function.

`__tests__/functionsLayout.test.mjs` holds this for the library, and
`__tests__/functionShims.test.mjs` holds it for what Netlify finds in a site.

## Checking locally

- **The functions run under `netlify dev` only.** In a folder linked to a Netlify project the CLI
  brings the project's variables, so each Run there runs real code on the server. Add `--offline`
  to run with no link and no login: then both variables are unset unless the shell sets them, and
  both functions answer `500`.
- **The guards:** the `403`s work locally. The `429` does not come. The CLI runs each request in a
  fresh worker, so the bucket is new each time (seen on netlify-cli 23.15.1). Check the limit on a
  deploy.
- **From a phone or tablet:** `netlify dev` opened at the machine's LAN address loads the page, but
  Run answers `403` and the version menu is missing, because that origin is plain `http` on a host
  that is not local. The function log says so. For the session, add a line to `.env`, which
  `netlify dev` loads and Netlify never sees, restart, and remove it afterwards:

  ```
  CODE_RUNNER_ALLOWED_ORIGINS=http://<the machine's address>:<port>
  ```
- **Without the real server:** a fake Piston on `127.0.0.1` replays the editor's recorded answers
  (`shared/components/CodeEditor/lib/codeRunner/__tests__/fixtures`), refuses a request without its
  secret, and serves the list of the recorded runtimes. Start it, and it prints the two variables, with
  a secret made for that run only:

  ```
  node shared/functions/code-runner/__tests__/fakePistonServer.mjs --port <port>
  ```

  They come as two `NAME=value` lines, which fish refuses when pasted alone. Put both in front of
  the command in the one shell that runs it, never in a file:

  ```fish
  env PISTON_BASE_URL=<the printed address> PISTON_PROXY_SECRET=<the printed secret> netlify dev --offline
  ```

  A program it has no recording of gets a `400` that says so, and Ctrl-C stops it.

## How to change it

- **A request's bounds:** the constants at the top of `execute.mjs`. The timeouts change only
  together with the server's limits and `TIMEOUT_BOUNDS` in
  `shared/components/CodeEditor/lib/codeRunner/request.js`. A test holds those two equal.
- **The size limits:** `MAX_BODY_BYTES` and `MAX_FORWARD_BYTES`, never above Piston's 102,400 bytes.
- **How long the browser keeps the list:** `CACHE_SECONDS` in `runtimes.mjs`.
- **The secret's header, the variable names, how long a function waits:** `lib/piston.mjs`
  (`PROXY_HEADER`, `BASE_URL_VARIABLE`, `PROXY_VARIABLE`, `UPSTREAM_TIMEOUT_MS`).
- **Which origins may ask:** `CODE_RUNNER_ALLOWED_ORIGINS` for a request that really arrives with
  that origin. The rule itself, the hosts allowed over plain `http`, and the `403`'s words:
  `lib/origin.mjs`.
- **How often one client may ask:** `CODE_RUNNER_RATE_LIMIT`. The defaults, the IP headers, how many
  clients are remembered and the `429`'s words: `lib/rateLimit.mjs`.
- **The words the editor reads:** keep *Refused origin*, *Too many requests* and *Missing server
  configuration* at the start of their messages, or change them with
  `shared/components/CodeEditor/lib/codeRunner/errors.js`.
- **The words a caller gets:** the messages in `lib/piston.mjs` (`CONFIG_PROBLEMS`,
  `upstreamStatusMessage`), `lib/origin.mjs` and the two functions. None may name a variable, the
  server or a path: `__tests__/readerWords.test.mjs` holds that. How much of the server's answer the
  log keeps: `LOGGED_BODY_CHARS` in `lib/piston.mjs`.
- **A new language or version:** install it on the server, with Piston's package manager through
  the same proxy. A new version shows in the editor's menu on the next page load, or up to 5 minutes
  later. A new language joins no menu by itself: give it a label, highlighting and a file name in
  `shared/components/CodeEditor/lib/codeRunner/languages.js`.
- **A new function:** a `<name>.mjs` here with a default export and no `handler`, a shim in each
  site that wants it, and its name in `EXPECTED_FUNCTIONS` in `__tests__/functionFolder.mjs`.
- **Tests:** `__tests__/` runs under `npm run test:shared`. `__tests__/readme.test.mjs` holds this
  file's numbers and the pointers at it to the code. `__tests__/readerWords.test.mjs` runs each
  function's real failures through the editor's words. `__tests__/overSocket.test.mjs` runs the
  site's shims over a real socket against the fake server, with the global `fetch` replaced by a
  recorder: a Run, a compile error's line, the list, no call through `fetch`, a refusal, the server
  down and too large.
