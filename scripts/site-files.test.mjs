/**
 * site-files.test.mjs: checks on this site's own files that need no build. Run from the repo's top
 * folder:
 *   node --test scripts/site-files.test.mjs
 * `npm run shared:verify` runs it too.
 *
 * THE CHECKS
 *   no hidden shared file   no file in static/ sits at the path of a file in shared/static/. Both
 *                           folders are served from the site's root, and the config lists static/
 *                           first, so such a copy wins wherever a stylesheet's url() names that path,
 *                           and which of the two the site serves is not fixed. A change to the shared
 *                           file then never shows here. A doc that imports a shared icon names it
 *                           under @site/shared/static/, so the site needs no copy.
 *   the README's pointer    the README's sentence on shared/README.md sends readers to --help for
 *                           the options shared/README.md leaves out, and promises no full list of
 *                           them there: that file gives the main ones only
 *   published addresses     every blog address the site has published (its sitemap and feeds named it)
 *                           still belongs to a post, so links and feed readers keep finding it. A post's
 *                           address is the one Docusaurus gives it: the slug in its front matter, or else
 *                           the date and name of its file or folder. So a post whose date changes keeps its
 *                           old address with `slug:` in its front matter. The name rule is Docusaurus's
 *                           own parseBlogFileName, read from node_modules, so run npm ci first.
 *   the five rules          the README's list under "The five rules" says word for word what the list
 *                           under that heading in shared/README.md says, so the copy here never drifts
 *                           from the rules every site keeps
 *   the docs sidebar stub   src/theme/DocRoot/Layout/Sidebar/index.jsx stays a plain re-export of
 *                           shared/theme/DocRoot/Layout/Sidebar, the wrapper that keeps the reader's
 *                           place when the docs sidebar collapses or expands. Nothing else sees it go:
 *                           shared:status reads a missing stub as "not in use", and without it the
 *                           theme's plain column comes back and the build passes. The sidebar stays
 *                           hideable in docusaurus.config.js, or the wrapper has nothing to hold
 *   the deploy sentence     the README never calls `npm run deploy` the same as the two-step line
 *                           under "Deploying". While that script calls `netlify deploy` without
 *                           --no-build, the section says what differs: the script runs the netlify-cli
 *                           installed in this folder and builds again, so what it uploads is not what
 *                           `netlify build` made and the checks read
 *   the deploy script       package.json's deploy script deploys nothing: it prints the two steps,
 *                           `nvm use` first, and exits 1, as shared/template/package.json's does. The
 *                           README says so under "Deploying" and shows the line it prints after
 *                           `nvm use`
 *   the page reload         src/clientModules/buildIdReload.js starts the shared reloader, which
 *                           reloads an open tab onto a newer build. Here that file is RUN in a fake
 *                           browser page, with the real reloader: a newer build reloads a page that holds
 *                           nothing; the reload waits while the code editor's registry holds unsaved text,
 *                           read through the stub as the page reads it; it waits for good once the comment
 *                           box has had the focus; and a page with no build id (`npm start`) installs
 *                           nothing. No error reports a check that was dropped: the reloader's default is
 *                           "nothing is unsaved", and a page then reloads over typed text. The wiring
 *                           around it is read as text: the config names the client module as a relative
 *                           string (require.resolve would publish this machine's path in the main bundle)
 *                           and holds buildIdPlugin(), and netlify.toml serves /build-id.json with
 *                           no-cache, or a cached copy hides a deploy. It cannot see the bundle, a real
 *                           browser or the comments' frame: it runs the source files under Node
 *
 * How to change it: a new check is a test below with a line in the list above. A name Finder or an
 * editor leaves in a folder goes in IGNORED_NAMES. A new wording of the README's sentence must still
 * match POINTER_SENTENCE. A post published for the first time adds its address to
 * PUBLISHED_POST_ADDRESSES; a post moved on purpose needs a redirect first, and then its line goes.
 * Red on the five rules after a pull: copy the list from shared/README.md into the README.
 * A deploy script that deploys again: reword "Deploying" first, then the deploy script's test.
 * The page reload: another place that holds typed text gets a test like the comment box's.
 * site-files.hooks.mjs says how the client module's imports are followed under Node; the registry
 * moves: EDITOR_REGISTRY, with the client module's import.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseBlogFileName } from '@docusaurus/plugin-content-blog/lib/blogUtils.js';

// Before the first dynamic import below: the client module's Docusaurus and @site names (site-files.hooks.mjs).
register('./site-files.hooks.mjs', import.meta.url);

/** The repo's top folder, so the tests read the same files from any working folder. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_STATIC = 'static';
const SHARED_STATIC = 'shared/static';
/** Files no one ships on purpose, which may sit in both folders. */
const IGNORED_NAMES = new Set(['.DS_Store']);

const README = 'README.md';
/** The README's sentence about what shared/README.md holds, read with its line breaks as spaces. */
const POINTER_SENTENCE = /`shared\/README\.md` says [^.]*\./;
/** `-- --help` after an npm command, or `--help` after a node one. */
const HELP_POINTER = /--help` lists the rest/;
const FULL_LIST_CLAIM = /\bevery option\b/;

/** The README's section on deploying, the npm script it warns about, and the two wordings the test reads. */
const DEPLOYING_HEADING = 'Deploying';
const PACKAGE = 'package.json';
const DEPLOY_SCRIPT_BUILDS = (line) => /\bnetlify deploy\b/.test(line) && !line.includes('--no-build');
const SAME_AS_TWO_STEPS = /`npm run deploy` does the same/;
const OWN_CLI_BUILDS_AGAIN = /`npm run deploy` is not the same: it runs the `netlify-cli` installed in this folder[^.]*\bbuilds again\b/;
/** The deploy script that deploys nothing: printf of quoted lines, then exit 1, and no other command. */
const PRINTS_AND_EXITS_1 = /^printf (?:'[^']*' )+&& exit 1$/;
const QUOTED = /'([^']*)'/g;
/** How the steps the script prints start: Node's switch, which reads .nvmrc, comes before the build. */
const SWITCH_NODE_FIRST = 'nvm use && ';
const DEPLOYS_NOTHING = /`npm run deploy` deploys nothing: it prints\b/;

const SHARED_README = 'shared/README.md';
/** The heading both READMEs give the rules, at any level from ## to ####. */
const FIVE_RULES_HEADING = 'The five rules';
const FIVE_RULES_COUNT = 5;
const HEADING_LINE = /^(#{1,6}) (.*)$/;
const NUMBERED_LINE = /^\d+\. /;
/** A wrapped line of a numbered item: indented under the item's text. */
const ITEM_CONTINUATION = /^ {2,}\S/;

const BLOG = 'blog';
/** The blog's route: Docusaurus's default routeBasePath, which docusaurus.config.js keeps. */
const BLOG_ROUTE = '/blog';
/** Every blog address the live site has published, as its sitemap and feeds named them in January 2026. */
const PUBLISHED_POST_ADDRESSES = [
  '/blog/2026/01/13/2026/working-with-arbitrary-bases',
  '/blog/2026/01/15/2026/algorithm-grading-rubric',
  '/blog/2026/01/15/2026/docusaurus-mui-light-dark',
  '/blog/2026/01/15/2026/feynman-technique',
  '/blog/2026/01/19/2026/excerpts-from-polya',
];
const POST_FILE = /\.mdx?$/;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const SLUG_LINE = /^slug:[ \t]*['"]?([^'"\r\n]+?)['"]?[ \t]*\r?$/m;
const DRAFT_LINE = /^draft:[ \t]*true[ \t]*\r?$/m;

const CONFIG = 'docusaurus.config.js';
/** The docs sidebar's stub, the one statement it holds once its comments are out, and the file it names. */
const SIDEBAR_STUB = 'src/theme/DocRoot/Layout/Sidebar/index.jsx';
const SIDEBAR_STUB_CODE = "export { default } from '@site/shared/theme/DocRoot/Layout/Sidebar';";
const SIDEBAR_WRAPPER = 'shared/theme/DocRoot/Layout/Sidebar/index.jsx';
/** themeConfig.docs.sidebar with hideable on: the collapse button and the expand strip exist. */
const HIDEABLE = /\bdocs:\s*\{\s*sidebar:\s*\{[^}]*\bhideable:\s*true\b/;

/** The reload after a deploy: the client module, how the config names it, and the registry the editor writes to. */
const RELOAD_MODULE = 'src/clientModules/buildIdReload.js';
const RELOAD_MODULE_ENTRY = `'./${RELOAD_MODULE}'`;
const EDITOR_REGISTRY = 'shared/components/CodeEditor/unsavedWork.js';
/** The config's clientModules list, up to its closing bracket, and the plugin that writes the build ids. */
const CLIENT_MODULES_LIST = /\bclientModules:\s*\[([^\]]*)\]/;
const BUILD_ID_PLUGIN_CALL = 'buildIdPlugin()';
/** netlify.toml's block for the live build's id: its path, then no-cache, with comment lines allowed between. */
const NETLIFY = 'netlify.toml';
const BUILD_ID_HEADER = /\[\[headers\]\]\s*\n\s*for = "\/build-id\.json"\s*\n\s*\[headers\.values\]\s*\n(?:\s*#[^\n]*\n)*\s*cache-control = "no-cache"/i;
/** The fake page: its address, the build it loaded and the build that is live. */
const ORIGIN = 'https://site.test';
const LOADED_BUILD = 'old-1';
const LIVE_BUILD = 'new-2';
/** What webpack rejects with when a chunk of the old build is gone: the reloader then checks at once. */
const CHUNK_FAILURE = Object.freeze({ reason: { name: 'ChunkLoadError', message: 'Loading chunk 1 failed.' } });
/** What document.activeElement is on a plain page, and while the focus is in the comments' frame. */
const PAGE_BODY = Object.freeze({ tagName: 'BODY', closest: () => null });
const COMMENTS_WIDGET = Object.freeze({
  tagName: 'GISCUS-WIDGET',
  closest: (selector) => (selector.split(',').some((part) => part.trim() === 'giscus-widget') ? COMMENTS_WIDGET : null),
});
const DROPPED_CHECK = `${RELOAD_MODULE} must hand startReloader a hasUnsavedWork that asks the code editor's registry (${EDITOR_REGISTRY}, through its stub) and the comment box`;

/** Every file under a folder of the repo, as paths relative to that folder. */
function filesUnder(folder) {
  const top = path.join(ROOT, folder);
  return fs
    .readdirSync(top, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !IGNORED_NAMES.has(entry.name))
    .map((entry) => path.relative(top, path.join(entry.parentPath, entry.name)))
    .sort();
}

/** The shared static files that this site also keeps a file of its own for, at the same path. */
function hiddenSharedFiles() {
  return filesUnder(SHARED_STATIC).filter((file) => fs.existsSync(path.join(ROOT, SITE_STATIC, file)));
}

/** A file's code: its comments taken out, the ends trimmed. */
function codeOf(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
}

/** A heading line's level and text, or null for any other line. */
function headingOf(line) {
  const match = line.match(HEADING_LINE);
  return match ? { level: match[1].length, text: match[2] } : null;
}

/**
 * The numbered items under the first heading called `heading` (## or deeper), up to the next heading,
 * each with its wrapped lines joined by single spaces. Text between the heading and the list is not an item.
 */
function numberedItemsUnder(file, heading) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const start = lines.findIndex((line) => {
    const found = headingOf(line);
    return found !== null && found.level >= 2 && found.text === heading;
  });
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING_LINE.test(line)) break;
    if (NUMBERED_LINE.test(line)) items.push(line.trim());
    else if (items.length > 0 && ITEM_CONTINUATION.test(line)) items[items.length - 1] += ` ${line.trim()}`;
  }
  return items.map((item) => item.replace(/\s+/g, ' '));
}

/** The text under the first heading called `heading` (## or deeper), up to the next heading, line breaks as spaces. */
function textUnder(file, heading) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  const start = lines.findIndex((line) => {
    const found = headingOf(line);
    return found !== null && found.level >= 2 && found.text === heading;
  });
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => HEADING_LINE.test(line));
  return rest.slice(0, end === -1 ? rest.length : end).join(' ').replace(/\s+/g, ' ').trim();
}

/** The address Docusaurus gives one post, or null for a draft, which has no page. */
function postAddress(relativePath, text) {
  const frontMatter = text.match(FRONT_MATTER)?.[1] ?? '';
  if (DRAFT_LINE.test(frontMatter)) return null;
  const slug = frontMatter.match(SLUG_LINE)?.[1] ?? parseBlogFileName(relativePath).slug;
  return `${BLOG_ROUTE}/${slug}`.replace(/\/{2,}/g, '/');
}

/** The address of every post under blog/. Docusaurus skips a file or folder whose name starts with _. */
function postAddresses() {
  return filesUnder(BLOG)
    .filter((file) => POST_FILE.test(file) && !file.split(path.sep).some((part) => part.startsWith('_')))
    .map((file) => postAddress(file.split(path.sep).join('/'), fs.readFileSync(path.join(ROOT, BLOG, file), 'utf8')))
    .filter(Boolean);
}

/** Lets the reloader's awaited fetch and its JSON finish. */
async function settle() {
  for (let round = 0; round < 5; round += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * A fake browser page for the client module. Its build id is `buildId` (null: a page of `npm start`,
 * which has none), and /build-id.json answers LIVE_BUILD. `fire` sends an event to the page's
 * listeners, `runTimers` runs what was set with setTimeout, and `reloads` counts location.reload().
 */
function fakePage(buildId) {
  const page = { reloads: 0, timers: [], listeners: {}, session: new Map() };
  const listen = (type, listener) => {
    (page.listeners[type] ??= []).push(listener);
  };
  page.document = {
    visibilityState: 'visible',
    activeElement: PAGE_BODY,
    createElement: () => ({}),
    // The build id's <meta>, when the page has one. No dialog is open: every other selector finds nothing.
    querySelector: (selector) => (buildId !== null && String(selector).startsWith('meta[') ? { getAttribute: () => buildId } : null),
    addEventListener: listen,
  };
  page.window = {
    document: page.document,
    fetch: async () => ({ ok: true, json: async () => ({ buildId: LIVE_BUILD }) }),
    location: { origin: ORIGIN, reload: () => { page.reloads += 1; } },
    addEventListener: listen,
    setTimeout: (callback) => page.timers.push(callback),
    sessionStorage: { getItem: (key) => page.session.get(key) ?? null, setItem: (key, value) => page.session.set(key, value) },
  };
  page.fire = async (type, event = {}) => {
    for (const listener of page.listeners[type] ?? []) listener(event);
    await settle();
  };
  page.runTimers = async () => {
    const due = page.timers;
    page.timers = [];
    due.forEach((callback) => callback());
    await settle();
  };
  return page;
}

let pagesOpened = 0;

/** Opens a fresh fake page and loads the client module into it, as a page load does. */
async function openPage(buildId = LOADED_BUILD) {
  const page = fakePage(buildId);
  globalThis.window = page.window;
  globalThis.document = page.document;
  pagesOpened += 1;
  await import(`${pathToFileURL(path.join(ROOT, RELOAD_MODULE)).href}?page=${pagesOpened}`);
  return page;
}

/** Takes the fake page away again. */
function closePage() {
  delete globalThis.window;
  delete globalThis.document;
}

/** The registry the code editor writes to, by the file's own address: the one copy the stub must hand on. */
function editorRegistry() {
  return import(pathToFileURL(path.join(ROOT, EDITOR_REGISTRY)).href);
}

test('no file in static/ hides a file of shared/static/', () => {
  assert.ok(fs.existsSync(path.join(ROOT, SHARED_STATIC)), `${SHARED_STATIC} is missing: is shared/ mounted?`);
  const hidden = hiddenSharedFiles();
  const advice = `delete the copy in ${SITE_STATIC}/, and import the shared file as @site/${SHARED_STATIC}/<path>`;
  assert.deepEqual(hidden, [], `${SITE_STATIC}/ hides ${hidden.join(', ')} of ${SHARED_STATIC}/: ${advice}`);
});

test("the README's pointer to shared/README.md sends readers to --help for the rest", () => {
  const text = fs.readFileSync(path.join(ROOT, README), 'utf8').replace(/\s+/g, ' ');
  const sentence = text.match(POINTER_SENTENCE)?.[0];
  assert.ok(sentence, `${README} has no sentence that starts "\`shared/README.md\` says"`);
  assert.doesNotMatch(sentence, FULL_LIST_CLAIM, `${README} promises every option, but shared/README.md gives the main ones`);
  assert.match(sentence, HELP_POINTER, `${README} should say that \`--help\` lists the rest`);
});

test('every blog address the site has published still belongs to a post', () => {
  const addresses = new Set(postAddresses());
  const lost = PUBLISHED_POST_ADDRESSES.filter((address) => !addresses.has(address));
  const advice = 'give the post that moved `slug: <its old address without /blog>` in its front matter';
  assert.deepEqual(lost, [], `no post has ${lost.join(', ')} any more: ${advice}`);
});

test('the docs sidebar stub hands on the shared wrapper', () => {
  assert.ok(fs.existsSync(path.join(ROOT, SIDEBAR_STUB)), `${SIDEBAR_STUB} is missing: the theme's plain column is back, and a collapse moves the page`);
  assert.equal(codeOf(SIDEBAR_STUB), SIDEBAR_STUB_CODE, `${SIDEBAR_STUB} must stay a plain re-export of the shared wrapper`);
  assert.ok(fs.existsSync(path.join(ROOT, SIDEBAR_WRAPPER)), `${SIDEBAR_WRAPPER} is missing: is shared/ mounted?`);
});

test('the docs sidebar can be collapsed, so the wrapper has a toggle to hold', () => {
  assert.match(fs.readFileSync(path.join(ROOT, CONFIG), 'utf8'), HIDEABLE);
});

test("the README's five rules say what shared/README.md's say", () => {
  const shared = numberedItemsUnder(SHARED_README, FIVE_RULES_HEADING);
  const here = numberedItemsUnder(README, FIVE_RULES_HEADING);
  assert.equal(shared.length, FIVE_RULES_COUNT, `${SHARED_README} has no list of ${FIVE_RULES_COUNT} under "${FIVE_RULES_HEADING}": is shared/ mounted?`);
  assert.deepEqual(here, shared, `${README}'s list under "${FIVE_RULES_HEADING}" differs from ${SHARED_README}'s: copy it from there`);
});

test("the README does not call `npm run deploy` the same as the two-step deploy", () => {
  const readme = fs.readFileSync(path.join(ROOT, README), 'utf8').replace(/\s+/g, ' ');
  assert.ok(!SAME_AS_TWO_STEPS.test(readme), `${README} says \`npm run deploy\` does the same as the two-step line: it does not`);
  const section = textUnder(README, DEPLOYING_HEADING);
  assert.ok(section, `${README} has no text under "${DEPLOYING_HEADING}"`);
  const deployScript = JSON.parse(fs.readFileSync(path.join(ROOT, PACKAGE), 'utf8')).scripts?.deploy ?? '';
  if (!DEPLOY_SCRIPT_BUILDS(deployScript)) return;
  const advice = 'say that it runs the `netlify-cli` installed in this folder and builds again';
  assert.match(section, OWN_CLI_BUILDS_AGAIN, `${README}, "${DEPLOYING_HEADING}", does not say how \`npm run deploy\` differs: ${advice}`);
});

test('the deploy script deploys nothing, and Deploying says so and shows the steps it prints, nvm use first', () => {
  const deployScript = JSON.parse(fs.readFileSync(path.join(ROOT, PACKAGE), 'utf8')).scripts?.deploy ?? '';
  assert.match(deployScript, PRINTS_AND_EXITS_1, `${PACKAGE}'s deploy script should only print how to deploy and exit 1, as shared/template/package.json's does`);
  const steps = [...deployScript.matchAll(QUOTED)].at(-1)[1].trim();
  assert.ok(steps.startsWith(SWITCH_NODE_FIRST), `the steps ${PACKAGE}'s deploy script prints should start with \`nvm use\`: ${steps}`);
  const section = textUnder(README, DEPLOYING_HEADING);
  const deployLine = steps.slice(SWITCH_NODE_FIRST.length);
  assert.ok(section.includes(deployLine), `${README}, "${DEPLOYING_HEADING}", does not show ${deployLine}, the line the deploy script prints after \`nvm use\``);
  assert.match(section, DEPLOYS_NOTHING, `${README}, "${DEPLOYING_HEADING}", should say that \`npm run deploy\` deploys nothing: it prints the steps`);
});

test('the reload after a deploy: a newer build reloads a page that holds nothing', async () => {
  try {
    const page = await openPage();
    assert.ok((page.listeners.unhandledrejection ?? []).length > 0, `${RELOAD_MODULE} started the reloader in the page`);
    assert.equal((page.listeners.blur ?? []).length, 1, 'and the watch on the comment box');
    await page.fire('unhandledrejection', CHUNK_FAILURE);
    assert.equal(page.reloads, 1, 'nothing holds the page, so it reloads. Without this, "no reload" in the tests below would prove nothing');
  } finally {
    closePage();
  }
});

test('the reload after a deploy waits while a code editor holds unsaved text, and goes once it is saved', async () => {
  const { setUnsavedWork } = await editorRegistry();
  const editor = {};
  try {
    const page = await openPage();
    setUnsavedWork(editor, true); // as the editor does while its code differs from the page's
    await page.fire('unhandledrejection', CHUNK_FAILURE);
    assert.equal(page.reloads, 0, `the page reloaded over unsaved code: ${DROPPED_CHECK}`);
    assert.equal(page.timers.length, 1, 'held, not dropped: the reloader looks again shortly');
    await page.runTimers();
    assert.equal(page.reloads, 0, 'still unsaved, so still held');
    setUnsavedWork(editor, false); // saved, reset or unmounted
    await page.runTimers();
    assert.equal(page.reloads, 1, 'nothing unsaved any more: the page reloads onto the new build');
  } finally {
    setUnsavedWork(editor, false);
    closePage();
  }
});

test('the reload after a deploy waits for good once the comment box has had the focus', async () => {
  try {
    const page = await openPage();
    page.document.activeElement = COMMENTS_WIDGET; // a click into the comments' frame
    await page.fire('blur'); // the window loses the focus to it
    page.document.activeElement = PAGE_BODY; // then a click back on the page
    await page.fire('unhandledrejection', CHUNK_FAILURE);
    assert.equal(page.reloads, 0, `the page reloaded over a comment that may be half typed: ${DROPPED_CHECK}`);
    await page.runTimers();
    await page.runTimers();
    assert.equal(page.reloads, 0, 'the focus is back on the page and the reload still waits: the typed text cannot be seen, so the tab keeps its build');
  } finally {
    closePage();
  }
});

test('the reload after a deploy also waits when the reloader asks while the focus is in the comment box, with no blur seen', async () => {
  try {
    const page = await openPage();
    page.document.activeElement = COMMENTS_WIDGET; // a tab that comes back with the cursor still in the frame
    await page.fire('unhandledrejection', CHUNK_FAILURE);
    assert.equal(page.reloads, 0, `the page reloaded with the cursor in the comment box: ${DROPPED_CHECK}`);
    page.document.activeElement = PAGE_BODY;
    await page.runTimers();
    assert.equal(page.reloads, 0, 'and it stays held after the focus has left the frame');
  } finally {
    closePage();
  }
});

test('the reload after a deploy installs nothing in a page with no build id, as under npm start', async () => {
  try {
    const page = await openPage(null);
    assert.deepEqual(Object.keys(page.listeners), [], 'no listener: neither the reloader nor the watch on the comment box');
    assert.equal(page.timers.length, 0, 'and no timer');
  } finally {
    closePage();
  }
});

test('the reload after a deploy is wired: a relative client module, the build id plugin, no cache for /build-id.json', () => {
  const config = codeOf(CONFIG);
  const list = config.match(CLIENT_MODULES_LIST)?.[1];
  assert.ok(list, `${CONFIG} has no clientModules list: the reloader never starts, and an old tab keeps its build`);
  assert.ok(list.includes(RELOAD_MODULE_ENTRY), `${CONFIG}'s clientModules should name ${RELOAD_MODULE_ENTRY}`);
  assert.ok(!list.includes('require.resolve'), `${CONFIG}'s clientModules calls require.resolve: the config ships in the public main bundle, so write a relative string`);
  assert.ok(fs.existsSync(path.join(ROOT, RELOAD_MODULE)), `${RELOAD_MODULE} is missing`);
  assert.ok(config.includes(BUILD_ID_PLUGIN_CALL), `${CONFIG} has no ${BUILD_ID_PLUGIN_CALL} in plugins: no page carries a build id, and the reloader installs nothing`);
  assert.match(fs.readFileSync(path.join(ROOT, NETLIFY), 'utf8'), BUILD_ID_HEADER, `${NETLIFY} should serve /build-id.json with cache-control "no-cache": a cached copy hides a deploy`);
});
