# `functions/feedback`: the page-feedback function

The prompt under a docs page or a blog post (`src/components/PageFeedback`) sends one message per
Send to this function. The function checks it, asks Cloudflare Turnstile about the captcha's token
when the site has a captcha, and sends one plain-text mail through Resend.

```
page ── POST /.netlify/functions/feedback ──▶ feedback.mjs ── POST siteverify ──▶ Cloudflare Turnstile (only with a captcha)
                                                           └─ POST /emails ─────▶ Resend ──▶ FEEDBACK_EMAIL_TO
```

This file is for whoever runs the site: what the function needs, how to set it up and try it,
what its answers and log lines mean, where to look when no mail arrives, how to stop it, and how
to change the mail service. Each source file's header has its rules in full.

## What is here

| File | What it does |
|---|---|
| `feedback.mjs` | The function: the checks in order, the answers, the log |
| `lib/fields.mjs` | What the body of a message may hold |
| `lib/captcha.mjs` | The question to Cloudflare Turnstile |
| `lib/mail.mjs` | The mail, and the one call to Resend |
| `lib/helpers.mjs` | What the function borrows from the code editor's functions (`shared/functions/code-runner/lib`), and the small helpers its parts share |
| `__tests__/` | The tests, against a fake fetch and a fake of `node:https`'s request (`fakes.mjs`): no network, no socket |

Nothing here deploys by itself. `netlify/functions/feedback.mjs`, a one-line shim, is what Netlify
deploys at `/.netlify/functions/feedback`, and `package.json > ownFunctions` names it. The rules
the page and the function share, the codes of the answers among them, are
`src/components/PageFeedback/rules.js`.

## The variables

All four are set on the Netlify project, scope Functions. A build needs none of them. A changed
value reaches the function at the next deploy, because each deploy keeps the values it was made
with.

| Variable | Needed | What it holds |
|---|---|---|
| `FEEDBACK_EMAIL_API_KEY` | Yes | A Resend key with sending access only, limited to the sending subdomain. Never in a file, a URL or a browser |
| `FEEDBACK_EMAIL_FROM` | Yes | The sending address, on the subdomain Resend has verified. A name may stand before it, with the address in angle brackets |
| `FEEDBACK_EMAIL_TO` | Yes | The one address the mail goes to |
| `FEEDBACK_CAPTCHA_SECRET` | No | The secret of the Turnstile widget. Unset or blank: no captcha check. Its site key, which is public, is `feedbackCaptchaSiteKey` in `docusaurus.config.js` |

Set the key and the secret in the Netlify UI, on the project's environment variables. Netlify's
CLI prints the value of a variable that is not marked secret (`env:get`, `env:list --plain`,
`env:list --json`), so never paste that output anywhere. Each value is trimmed. A key holding a
character a header cannot carry, such as a line break pasted inside it, is refused as `setup`.

With a captcha, the site key and the secret go together. A secret without a site key refuses
every message (`fields`, *captcha token*). A site key without a secret sends tokens that nobody
checks.

## Setting it up

The accounts, the sending subdomain, the key and the widget are made on Resend's and Cloudflare's
own pages. What this function needs:

- **The widget's hostnames** are the site's own host, which also covers its subdomains. A draft or
  a deploy preview lives at `<name>--<site>.netlify.app`, which is not a subdomain of
  `<site>.netlify.app`, so the captcha fails there unless that exact host is on the widget's list.
  `netlify deploy --alias <name>` gives a draft a fixed host for that. `netlify.app` itself never
  goes on the list: it would cover every site on Netlify.
- **The variables** are set before the deploy that switches the prompt on (`feedbackEnabled` in
  `docusaurus.config.js`), because each deploy keeps the values it was made with.
- **The first test** is one message with each thumb. Both mails arrive, and the function log has
  no line. When one does not arrive: *When no mail arrives*.

## What it checks

In this order. Checks 1 to 5 refuse a request without reading its body. Nothing goes to Cloudflare
before check 8, and nothing to Resend before check 9.

| # | Check | Answer | `code` |
|---|---|---|---|
| 1 | The method is `POST`. A CORS preflight (`OPTIONS`) is refused like any other | `405`, with `allow: POST` | `method` |
| 2 | The content type is `application/json` (parameters allowed, any case) | `415` | `media-type` |
| 3 | An `Origin` header names this site: the host the request was sent to, over `https`, or over `http` on `localhost`, `127.0.0.1`, `[::1]` or `*.localhost` | `403` | `origin` |
| 4 | At most 5 messages in 600 s per client, then one more every 120 s | `429`, with `retry-after` | `rate` |
| 5 | The three mail variables are set | `500` | `setup` |
| 6 | The `content-length` and the bytes read are at most 16,384 | `413` | `size` |
| 7 | The fields: `thumb`, `page`, `text`, the captcha's token when there is a captcha, and `id` (optional; kept when it matches `SEND_ID_PATTERN`, and never a refusal). Any other key is ignored | `400` | `fields` |
| 8 | The captcha, only when `FEEDBACK_CAPTCHA_SECRET` is set | `403`, or `503` when Cloudflare gave no verdict | `captcha`, `captcha-unavailable` |
| 9 | The mail | `503` for Resend's `429`, `504` after 6 s, `502` for anything else | `mail-quota`, `mail-timeout`, `mail` |

Sent: `200 { "ok": true }`. Every refusal is `{ "ok": false, "code": … }`. A failure no check
foresaw is `500 { "ok": false }`, with no code. No answer is cached, none carries a CORS header,
and none holds a word of the request, a variable's name, a service's name or an address. The page
turns the status and the code into the reader's words (`rules.js > outcomeOf`).

- **The rate limit** is a token bucket per client IP, kept in the memory of the warm function
  instance (`shared/functions/code-runner/lib/rateLimit.mjs`). Several instances, or a cold start,
  give a client more than 5. It bounds a script. A reader meets it only after five messages in a
  few minutes.
- **The captcha** fails closed: no connection, a `5xx`, no answer within 3 s, or Cloudflare's own
  `internal-error` is `captcha-unavailable`, and no mail goes out. A token is accepted only when
  Cloudflare says `success` and names the host the request was sent to. The reader's IP address is
  never sent to Cloudflare.
- **Text is required after a thumbs down**, on the server as in the page.
- **Both outgoing calls** go over Node's own `https`, not `fetch`. Netlify's runtime adds the host
  of every `fetch` call to the function's answer, which would name both services to any caller.
  A redirect is refused, never followed, and nothing is retried inside the function. Cloudflare
  gets 3 s and Resend 6 s: 9 s at worst, inside the shortest limit Netlify has had for a function
  of this kind (10 s), and well inside the page's own 15 s (`rules.js > SEND_TIMEOUT_MS`).

## What the mail holds

```
Subject: [page feedback] 👍 /docs/software-engineering/sql/ctes

<the reader's text, as cleaned; or "(no message)">

-----
Page:   https://<the site>/docs/software-engineering/sql/ctes
Thumb:  up
```

👎 for a thumbs down. The reader's words come first, so a mail client's preview shows them. The
subject and the last three lines (the rule, `Page` and `Thumb`) are always the function's own,
built from checked values: whatever the reader's text holds comes before them. The mail holds no
time of its own; its `Date` header has the time. The address of the site is `SITE_ORIGIN` in
`lib/mail.mjs`, never the host of the request; `scripts/site-files.test.mjs` holds it equal to
`url` in `docusaurus.config.js`. Plain text only: no `html` and no `reply_to`. The mail holds no
IP address and no user agent.

Reply, in a mail client, goes to the sending address, never to a reader, because the prompt asks
for no address. The page and the thumb are what the request said: a script that sends the site's
`Origin` can name any page of the accepted shape (`rules.js > PAGE_PATTERN`), and only the captcha
ties a message to a browser on the site.

Each message carries an id the page makes (`rules.js > SEND_ID_PATTERN`). The function sends it to
Resend as the `idempotency-key` `page-feedback/<id>`, which Resend keeps for 24 hours. A repeat
under the same id is the same request, byte for byte, and Resend answers it as it answered the
first, without a second mail. The page takes a new id after a `mail` or `mail-quota` answer
(`rules.js > isMailRefusal`), because Resend may keep that answer under the id and give it again;
after every other answer it keeps the id while the message stays the same.

## The log and the codes

The function log on Netlify, for the function `feedback`. One line per refusal or failure, in the
form `[feedback] <code>: <a few fixed words>`. A message that was sent logs nothing. A line never
holds the text, the page's address, the client's address or a token, and of an answer from Resend
or Cloudflare only the status and the error name. The key and the captcha's secret are replaced by
`[secret]` in every line.

| `code` | What it means | What to look at |
|---|---|---|
| `method`, `media-type` | Not the page's request: a crawler, a script | Nothing |
| `origin` | No `Origin` header, or another site's | `netlify dev` opened from another device: plain `http` on a host that is not local is refused. Try from the machine itself |
| `rate` | Over 5 messages in 600 s from one client | Readers behind one shared address, or a script |
| `setup` | A mail variable is missing or blank, or the key holds a character a header cannot carry | The line names the variable. Set it in the Netlify UI and deploy |
| `size` | A body over 16,384 bytes | A script: the largest message the rules allow is about 12,400 bytes |
| `fields` | A field breaks its rule. The line names the field, never its value | *captcha token*: the secret is set but the page sent no token (an empty site key, or a page from before the key was set). Anything else: an old tab, or a script |
| `captcha` | Cloudflare refused the token (its error codes are in the line), or the token was solved on another host | `invalid-input-secret`: the secret is wrong. `missing-input-secret`, `bad-request`: the call to Cloudflare was malformed, a bug. *another host*: the widget's hostnames, or Cloudflare's dummy keys (*Trying it*) |
| `captcha-unavailable` | Cloudflare gave no verdict | Cloudflare's status page. Nothing was sent |
| `mail` | Resend refused the mail, or could not be reached. The line has the status and Resend's error name | `401`: the key is missing or not valid. `403`: the key is not active, or the sending subdomain is not verified. `400`, `422`: Resend refused a field, such as the `from` or `to` value. `409`: a second try while the first is still under way, or the same id with another body (after a deploy that changed the mail, say) |
| `mail-quota` | Resend answered `429` | `daily_quota_exceeded`: no mail until the quota resets at midnight UTC. `monthly_quota_exceeded`: the month's quota is used up. `rate_limit_exceeded`: too many calls in one second |
| `mail-timeout` | No answer from Resend within 6 s | Resend's status page. The mail may still have gone out |
| `unexpected` | A failure no check foresaw (answer `500`, no code). The line names the error, never its message | A body cut off on its way in, or a bug |

## When no mail arrives

- **Resend's Emails page** shows the status of every message the function handed over.
- **After a hard bounce or a spam complaint**, Resend puts the receiving address on its
  suppression list. From then on it marks every mail to that address as suppressed and delivers
  none, until the address is removed on Resend's Suppressions page. Resend's docs name no refusal
  for such a mail, so most likely it still takes each one: the function answers `200`, the reader
  sees the thanks, and the log has no line. So an unwanted feedback mail is deleted, never marked
  as spam.
- **A revoked key or a used-up quota** shows as `mail` or `mail-quota` lines in the function log
  (*The log and the codes*), which Netlify keeps for a limited time.
- **A reader whose browser cannot load the captcha's script** leaves no line anywhere, because the
  page never posts.
- **After a deploy that touches the feature**, send one message with each thumb.

## Trying it

- **`npm start` and `npm run serve` serve no function**, so Send ends in the failure state there.
- **`netlify dev` serves it**, at `http://localhost:8892` (`netlify.toml > [dev]`). In a folder
  linked to the Netlify project, the CLI brings each of the project's variables that has a value
  for the Local development context. A variable marked as holding a secret value has none there
  unless it is given one: without the three mail variables, every Send ends in `setup`. And with
  the captcha's secret present, a Send from localhost fails unless the widget lists localhost. A
  Send that does go through sends a real mail and counts towards Resend's quota.
- **The sure way to try a real mail locally** is `netlify dev --offline`, which brings no
  variable, with the three mail variables set in the shell that runs it (without them, every
  message is refused as `setup`). In fish, with the key on the clipboard so that it never shows:

  ```fish
  env FEEDBACK_EMAIL_API_KEY=(pbpaste) FEEDBACK_EMAIL_FROM='<the sending address>' FEEDBACK_EMAIL_TO='<your address>' netlify dev --offline
  ```

- **The captcha under `netlify dev`.** Cloudflare's dummy secret keys answer every token with the
  hostname `example.com`, so the function refuses them as `captcha` on any other host. To try the
  captcha locally, use a real widget whose hostnames include `localhost`; Cloudflare advises
  against adding local hosts to the widget the live site uses. Or try the rest without a captcha:
  `feedbackCaptchaSiteKey` empty, and no `FEEDBACK_CAPTCHA_SECRET`, as under `--offline` with the
  three mail variables alone.
- **The rate limit does not show locally**: the CLI runs each request in a fresh worker, as for
  the code editor's functions (`shared/functions/code-runner/README.md > Checking locally`).
- **From a phone or tablet** at the machine's LAN address, every Send is refused as `origin`.
- **Without any page**, from a shell: none of these sends a mail. The first two stop at a guard.
  The third passes the guards and stops at the empty body, or at a missing variable, which the log
  names. `curl` sends whatever `origin` it is told, so these test the function's rule, not a
  browser's.

  ```fish
  # another site: 403, {"ok":false,"code":"origin"}
  curl -s -X POST https://<site>/.netlify/functions/feedback -H 'content-type: application/json' -H 'origin: https://other.example.com' --data '{}'
  # a preflight: 405
  curl -s -o /dev/null -w '%{http_code}\n' -X OPTIONS https://<site>/.netlify/functions/feedback
  # the site's own origin and an empty body: 400 fields (or 500 setup when a variable is missing)
  curl -s -X POST https://<site>/.netlify/functions/feedback -H 'content-type: application/json' -H 'origin: https://<site>' --data '{}'
  ```

## Stopping it at once

1. **Delete the key at Resend** (its API keys page). Every deploy stops sending at that moment:
   each Send then ends in `mail` (Resend's `401` or `403`), and the reader sees the failure words.
   Removing the Netlify variable alone is not enough, because each deploy keeps the values it was
   made with: an earlier production deploy, a draft or a deploy preview would still send.
2. **Switch the prompt off:** `feedbackEnabled: false` in `docusaurus.config.js`, then deploy. The
   prompt is gone from every page of the new deploy.
3. Then, if wanted, remove the four variables from the Netlify project.

## Changing the mail service

One file: `lib/mail.mjs`. `MAIL_URL` and `sendMail` with its helpers hold everything that is
Resend's own: the address, the headers, the body, and which status means a quota. The mail's
layout, the codes and the variables' names stay as they are. Change the tests with it:
`__tests__/mail.test.mjs`, `__tests__/fakes.mjs` (Resend's address and answers) and
`__tests__/feedback.test.mjs`; and the mentions of Resend in this file.

## Tests

`node --test functions/feedback/__tests__/*.test.mjs`: `feedback.test.mjs` (the function, its
checks in order), `fields.test.mjs`, `captcha.test.mjs` and `mail.test.mjs` (its parts).
`fakes.mjs` holds what they share and is not a test. A fake fetch stands in for Cloudflare and
Resend, and node:test's mock timers for the clock of the time limits. One test runs the default
export as Netlify does, with the variables in `process.env` and the function's own transport,
`node:https`'s request replaced by a fake: both calls go over it, never through the global
`fetch`. No network, no listening socket, no waiting. `package.json > shared:verify` names each
test file, and `scripts/site-files.test.mjs` fails when one is left out of its list.
