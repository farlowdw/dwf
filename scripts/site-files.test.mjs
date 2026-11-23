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
 *   the feedback hold       in the same fake page, the reload also waits while the page-feedback card
 *                           holds text not sent yet (its registry, src/components/PageFeedback/unsentText.js,
 *                           as the client module imports it), and goes once the card lets go
 *   the feedback words      while docusaurus.config.js switches the page-feedback prompt on
 *                           (customFields.feedbackEnabled, read as text: true or false),
 *                           src/components/PageFeedback/words.js holds every word the prompt needs, and
 *                           on a site with a captcha the captcha's words too (words.js > CAPTCHA_WORDS;
 *                           customFields.feedbackCaptchaSiteKey, read as a quoted string, is not ''). A
 *                           production build shows no prompt while one is empty, and no error says so
 *   the captcha's site key  customFields.feedbackCaptchaSiteKey is '' or a Turnstile site key: at most
 *                           32 letters, digits, '_' and '-', Cloudflare's limit for a site key. A longer
 *                           value is most likely the widget's secret, which belongs in the Netlify
 *                           variable FEEDBACK_CAPTCHA_SECRET and never in a file: the config ships in
 *                           every page. No message prints the value
 *   the feedback lists      the config's two lists of pages without the prompt (forbiddenFeedbackDocPaths,
 *                           forbiddenFeedbackBlogPaths) hold page addresses only, each a quoted string:
 *                           an entry that is no page's address matches nothing, and the prompt stays on
 *                           the page it was meant to leave. An entry with a '*', or a // comment in either
 *                           list that holds a '/*' (such an entry commented out), is named first, in every
 *                           test that reads the config's code: there is no wildcard, and codeOf, which
 *                           knows no strings, would take that '/*' for a comment's start and drop the
 *                           config's code up to the next comment's end
 *   the feedback mounts     src/theme/DocItem/Layout/index.js renders the prompt between a docs page's
 *                           content and its footer, and src/theme/BlogPostItem/Content/index.js under a
 *                           post's text, on the post's own page and in the browser only (clientOnly), which
 *                           keeps it out of the feeds. Both files are copies of the theme's own, which
 *                           Docusaurus calls unsafe to swizzle, so the installed originals must still have
 *                           the shape the copies rely on: DocItemContent and then DocItemFooter, and the
 *                           feeds' id on a post's div. An upgrade that changes them still builds, and the
 *                           copies then hide the change without a word
 *   the feedback function   netlify/functions/feedback.mjs is one plain re-export of
 *                           functions/feedback/feedback.mjs; package.json > ownFunctions names
 *                           feedback, since shared/functions/code-runner/__tests__/functionShims.test.mjs
 *                           refuses a function in that folder that the list does not name; and
 *                           src/components/PageFeedback/rules.js > FEEDBACK_ENDPOINT, where the page
 *                           posts each message, is /.netlify/functions/feedback, the address Netlify
 *                           gives that shim. At any other address every Send fails and no mail goes
 *                           out. FEEDBACK_FUNCTION holds the name, and the shim's path is built from it
 *   the feedback tests      package.json > scripts['shared:verify'] names in its node --test list every
 *                           test file (.test.js, .test.mjs or .test.cjs) under the prompt's two
 *                           __tests__ folders (FEEDBACK_TEST_FOLDERS), each by its own name, and every
 *                           file of those folders it names is there. test:shared runs shared/'s suites
 *                           only, and node skips a name that matches nothing without a word, so a test
 *                           file left out, renamed or moved would never run. Names, never a pattern,
 *                           as test:shared gives its own files (shared/scripts/lib/suites.mjs says why)
 *   the mails' site address the address the function puts before a page's path in each mail
 *                           (functions/feedback/lib/mail.mjs > SITE_ORIGIN) is the config's url: the
 *                           function never takes it from the request
 *   hydrated pages          the installed Docusaurus core still marks <html> with data-has-hydrated
 *                           ("false" in the built HTML, "true" once the page is live). The prompt's
 *                           stylesheet keeps it hidden until then, so no button shows before it works;
 *                           without the mark the buttons show early, or the prompt never shows
 *   no mail key, no address no file of the page-feedback prompt (FEEDBACK_PLACES) holds a mail service's
 *                           key ('re_' and a letter or digit) or a mail address, and neither
 *                           docusaurus.config.js nor netlify.toml (SETUP_FILES), where a value copied
 *                           while setting the prompt up is most likely pasted, holds such a key. The
 *                           repository is public, and shared/scripts/check-public.mjs knows neither
 *                           shape: the key and the two addresses are Netlify variables, named in files
 *                           by name only. SETUP_FILES are not searched for an address, which may one
 *                           day stand there on purpose (a mailto: link in the footer, say)
 *
 * How to change it: a new check is a test below with a line in the list above. A name Finder or an
 * editor leaves in a folder goes in IGNORED_NAMES. A new wording of the README's sentence must still
 * match POINTER_SENTENCE. A post published for the first time adds its address to
 * PUBLISHED_POST_ADDRESSES; a post moved on purpose needs a redirect first, and then its line goes.
 * Red on the five rules after a pull: copy the list from shared/README.md into the README.
 * A deploy script that deploys again: reword "Deploying" first, then the deploy script's test.
 * The page reload: another place that holds typed text gets a test like the comment box's.
 * site-files.hooks.mjs says how the client module's imports are followed under Node; a registry
 * moves: EDITOR_REGISTRY or FEEDBACK_REGISTRY, with the client module's import.
 * The feedback prompt: a new place for its files goes in FEEDBACK_PLACES, and another file where setup
 * values are written in SETUP_FILES, so the key and address check reads it. A new test file of the
 * prompt: its name in package.json > shared:verify; a new test folder: FEEDBACK_TEST_FOLDERS too.
 * Another name for the function: FEEDBACK_FUNCTION, rules.js > FEEDBACK_ENDPOINT, the shim's file
 * name, package.json > ownFunctions and SHIM_FILE in functions/feedback/__tests__/feedback.test.mjs,
 * together; then every other line that names the old one (search the repository for
 * netlify/functions/feedback). Red on the installed originals after an upgrade: compare each copy
 * with its new original (the copies' headers say how), carry the change over, then update
 * DOCS_ORIGINAL_ORDER or BLOG_ORIGINAL_ID. A new domain: url in the config and SITE_ORIGIN in
 * functions/feedback/lib/mail.mjs, together.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, register } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseBlogFileName } from '@docusaurus/plugin-content-blog/lib/blogUtils.js';

// Before the first dynamic import below: the client module's Docusaurus and @site names (site-files.hooks.mjs).
register('./site-files.hooks.mjs', import.meta.url);

/** The repo's top folder, so the tests read the same files from any working folder. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Finds installed packages as Node does from here (their package.json, for their folder). */
const requireFromHere = createRequire(import.meta.url);
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

/** The reload after a deploy: the client module, how the config names it, and the registries the editor and the feedback card write to. */
const RELOAD_MODULE = 'src/clientModules/buildIdReload.js';
const RELOAD_MODULE_ENTRY = `'./${RELOAD_MODULE}'`;
const EDITOR_REGISTRY = 'shared/components/CodeEditor/unsavedWork.js';
const FEEDBACK_REGISTRY = 'src/components/PageFeedback/unsentText.js';
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
const DROPPED_CHECK = `${RELOAD_MODULE} must hand startReloader a hasUnsavedWork that asks the code editor's registry (${EDITOR_REGISTRY}, through its stub), the comment box and the feedback card's registry (${FEEDBACK_REGISTRY})`;

/** The page-feedback prompt: its switch, its captcha's site key and its two lists in the config, read as text, and the files that judge them. */
const FEEDBACK_SWITCH = /\bfeedbackEnabled:\s*([^\s,}]+)/;
/** The captcha's site key, written as one quoted string ('' for no captcha), with no ${…} in it. */
const FEEDBACK_SITE_KEY = /\bfeedbackCaptchaSiteKey:\s*(?:'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$\n]*)`)/;
/**
 * What a Turnstile site key holds: at most 32 characters (Cloudflare's own limit for a site key), each a
 * letter, a digit, '_' or '-'. A longer value is most likely the widget's secret, whose place is this
 * Netlify variable.
 */
const SITE_KEY_MAX_LENGTH = 32;
const SITE_KEY_CHARACTERS = /^[A-Za-z0-9_-]*$/;
const CAPTCHA_SECRET_VARIABLE = 'FEEDBACK_CAPTCHA_SECRET';
const FEEDBACK_LISTS = Object.freeze(['forbiddenFeedbackDocPaths', 'forbiddenFeedbackBlogPaths']);
/**
 * What a list written out in the config may hold: white space, commas, a comment to the end of the line,
 * and entries quoted with ', " or ` (no ${…}), with no quote or backslash inside.
 */
const LIST_TOKENS = /\s+|,|\/\/[^\n]*|'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\$\n]*)`/g;
/** How a comment to the end of the line starts, and what codeOf reads as the start of a comment wherever it stands. */
const LINE_COMMENT = '//';
const BLOCK_COMMENT_START = '/*';
const FEEDBACK_WORDS = 'src/components/PageFeedback/words.js';
const FEEDBACK_RULES = 'src/components/PageFeedback/rules.js';
/** The prompt's two mounts, the line that imports it, and what each renders, white space as single spaces. */
const DOCS_MOUNT = 'src/theme/DocItem/Layout/index.js';
const BLOG_MOUNT = 'src/theme/BlogPostItem/Content/index.js';
const FEEDBACK_IMPORT = "import PageFeedback from '@site/src/components/PageFeedback';";
const DOCS_MOUNT_CODE = '<DocItemContent>{children}</DocItemContent> <PageFeedback key={metadata.permalink} permalink={metadata.permalink} unlisted={metadata.unlisted} /> <DocItemFooter />';
const BLOG_MOUNT_CODE = '{children} {isBlogPostPage && <PageFeedback key={metadata.permalink} permalink={metadata.permalink} unlisted={metadata.unlisted} clientOnly />}';
/** The installed theme's files the two mounts copy (inside its lib/), and what the copies rely on in them. */
const THEME = '@docusaurus/theme-classic';
const DOCS_ORIGINAL = 'theme/DocItem/Layout/index.js';
const BLOG_ORIGINAL = 'theme/BlogPostItem/Content/index.js';
const DOCS_ORIGINAL_ORDER = '<DocItemContent>{children}</DocItemContent> <DocItemFooter />';
const BLOG_ORIGINAL_ID = 'id={isBlogPostPage ? blogPostContainerID : undefined}';
/**
 * The function's name: the name of its shim's file in netlify/functions, its entry in package.json >
 * ownFunctions and the end of its address. Then the shim, and the one statement it holds once its
 * comments are out.
 */
const FEEDBACK_FUNCTION = 'feedback';
const FEEDBACK_SHIM = `netlify/functions/${FEEDBACK_FUNCTION}.mjs`;
const FEEDBACK_SHIM_CODE = "export { default } from '../../functions/feedback/feedback.mjs';";
/** Where Netlify serves a function of netlify/functions that keeps its default address: this, then the function's name. */
const FUNCTIONS_ROUTE = '/.netlify/functions/';
/** The shared helper that names the package.json field listing a site's own functions (OWN_FUNCTIONS_FIELD). */
const FUNCTION_FOLDER = 'shared/functions/code-runner/__tests__/functionFolder.mjs';
/** The file that writes the mail and holds the site's address (SITE_ORIGIN), and the config's url line. */
const FEEDBACK_MAIL = 'functions/feedback/lib/mail.mjs';
const SITE_URL_LINE = /^\s*url:\s*['"`]([^'"`]+)['"`]/m;
/** The installed core's files (inside its lib/) that mark <html> once a page is live, and what they hold for it. */
const CORE = '@docusaurus/core';
const HYDRATED_FILE = 'client/hasHydratedDataAttribute.js';
const HYDRATED_MARK = 'data-has-hydrated={isBrowser}';
const CORE_APP = 'client/App.js';
const HYDRATED_ELEMENT = '<HasHydratedDataAttribute />';
const FEEDBACK_STYLES = 'src/components/PageFeedback/styles.module.css';
/** Where the prompt keeps its files, and what none of them may hold: a mail service's key as Resend writes it, and a mail address. */
const FEEDBACK_PLACES = Object.freeze(['src/components/PageFeedback', 'functions/feedback', FEEDBACK_SHIM]);
const MAIL_KEY = /\bre_[A-Za-z0-9]/;
const MAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
/**
 * The two files where a value copied while setting the prompt up is most likely pasted: they may not
 * hold the key either. They are not searched for an address, which may one day stand there on purpose
 * (a mailto: link in the footer, say).
 */
const SETUP_FILES = Object.freeze([CONFIG, NETLIFY]);
/** Each shape with the words a message gives it, so that no message prints the text that matched. */
const KEY_SHAPE = Object.freeze({ words: 'a mail service key', pattern: MAIL_KEY });
const ADDRESS_SHAPE = Object.freeze({ words: 'a mail address', pattern: MAIL_ADDRESS });
/** The prompt's two test folders, and the script of package.json whose node --test list must name each of their test files. */
const FEEDBACK_TEST_FOLDERS = Object.freeze(['src/components/PageFeedback/__tests__', 'functions/feedback/__tests__']);
const VERIFY_SCRIPT = 'shared:verify';
/** A test file, by the endings test:shared takes too (shared/scripts/lib/suites.mjs > TEST_FILE). */
const TEST_FILE = /\.test\.(?:cjs|mjs|js)$/;
/** A character that makes node read a path it is given as a pattern (shared/scripts/lib/suites.mjs > PATTERN_CHARACTER). */
const PATTERN_CHARACTER = /[*?[\]{}()!]/;
/** Quotes round a word of an npm script, which the shell takes off before node sees it. */
const SHELL_QUOTES = /^(['"])(.*)\1$/;

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

/** A module of the repo, by its path from the top folder: imported inside its test, so a broken file fails that test alone. */
function repoModule(file) {
  return import(pathToFileURL(path.join(ROOT, file)).href);
}

/** The registry the feedback card writes to, by the file's own address: the one copy the client module imports. */
function feedbackRegistry() {
  return repoModule(FEEDBACK_REGISTRY);
}

/** White space as single spaces, so a check reads code whatever its line breaks. */
function spaced(text) {
  return text.replace(/\s+/g, ' ');
}

/** An installed package's file, by its path inside the package's lib/ folder. */
function installedFile(pkg, file) {
  return fs.readFileSync(path.join(path.dirname(requireFromHere.resolve(`${pkg}/package.json`)), 'lib', file), 'utf8');
}

/** The list `name` as the config writes it: its name, a colon, then what stands between its brackets. */
function listPattern(name) {
  return new RegExp(`\\b${name}:\\s*\\[([^\\]]*)\\]`);
}

/** The quoted entries among `tokens`, the matches of LIST_TOKENS in a list's inside. */
function quotedEntries(tokens) {
  return tokens.map((token) => token[1] ?? token[2] ?? token[3]).filter((entry) => entry !== undefined);
}

/**
 * The entries of the list `name` in the config's code (comments out), or null when there is no such list
 * or it holds anything but LIST_TOKENS: a constant, a spread or a call would hide its entries from here.
 */
function configList(config, name) {
  const inside = config.match(listPattern(name))?.[1];
  if (inside === undefined) return null;
  const tokens = [...inside.matchAll(LIST_TOKENS)];
  const covered = tokens.reduce((length, token) => length + token[0].length, 0);
  if (covered !== inside.length) return null;
  return quotedEntries(tokens);
}

/**
 * True for a token of a list (a match of LIST_TOKENS) that names a '*': an entry that holds one, or a //
 * comment that holds a '/*', such as an entry with a '*' commented out. codeOf takes out block comments
 * before line comments, so it reads that '/*' as the start of a block comment.
 */
function isStarred(token) {
  const [text] = token;
  return text.startsWith(LINE_COMMENT) ? text.includes(BLOCK_COMMENT_START) : text.includes('*');
}

/**
 * The tokens of the two feedback lists that name a '*' (isStarred), each as `<list> holds <token>`, read
 * from the config's raw text, before the comments are taken out: codeOf knows no strings, so it would take
 * the '/*' of such a token for the start of a comment and drop the config's code up to the next comment's
 * end.
 */
function starredEntries() {
  const raw = fs.readFileSync(path.join(ROOT, CONFIG), 'utf8');
  return FEEDBACK_LISTS.flatMap((name) => {
    const inside = raw.match(listPattern(name))?.[1] ?? '';
    return [...inside.matchAll(LIST_TOKENS)].filter(isStarred).map((token) => `${name} holds ${token[0].trim()}`);
  });
}

/**
 * The config's code, comments out, for every test that reads it. A list entry with a '*', or a // comment
 * in a list with a '/*', fails first and by name (starredEntries), so no test fails instead on a part of the
 * config that codeOf dropped.
 */
function configCode() {
  const starred = starredEntries();
  const advice = "There is no wildcard: an entry is one page's permalink, so list each page. A '/*' in a list, even in a // comment, also reads as the start of a comment to these tests";
  assert.deepEqual(starred, [], `${CONFIG} > customFields: ${starred.join('; ')}. ${advice}`);
  return codeOf(CONFIG);
}

/** The captcha's site key, as the config's code writes it: one quoted string. Null when it is written any other way. */
function captchaSiteKey(config) {
  const match = config.match(FEEDBACK_SITE_KEY);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

/** The files package.json's shared:verify gives node --test, as written there, quotes off. */
function verifiedFiles() {
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, PACKAGE), 'utf8')).scripts?.[VERIFY_SCRIPT] ?? '';
  return script
    .split('&&')
    .map((command) => command.trim().split(/\s+/))
    .filter((words) => words[0] === 'node' && words.includes('--test'))
    .flatMap((words) => words.slice(1).filter((word) => !word.startsWith('-')))
    .map((word) => path.posix.normalize(word.replace(SHELL_QUOTES, '$2')));
}

/** Every test file in the prompt's test folders, by its path from the repo's top folder, written with '/'. */
function feedbackTestFiles() {
  return FEEDBACK_TEST_FOLDERS.flatMap((folder) => filesUnder(folder).map((file) => [folder, ...file.split(path.sep)].join('/')))
    .filter((file) => TEST_FILE.test(file));
}

/** Every file of the page-feedback prompt, by its path from the repo's top folder. */
function feedbackFiles() {
  return FEEDBACK_PLACES.flatMap((place) => (
    fs.statSync(path.join(ROOT, place)).isDirectory() ? filesUnder(place).map((file) => path.join(place, file)) : [place]
  ));
}

/** The words of the shapes among `shapes` (KEY_SHAPE, ADDRESS_SHAPE) that `file` holds: never the text that matched. */
function privateShapesIn(file, shapes) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return shapes.filter(({ pattern }) => pattern.test(text)).map(({ words }) => words);
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

test('the reload after a deploy waits while the feedback card holds text not sent yet, and goes once it lets go', async () => {
  const { setUnsentText } = await feedbackRegistry();
  const card = {};
  try {
    const page = await openPage();
    setUnsentText(card, true); // as the card does while its field holds text, or while its message is on its way
    await page.fire('unhandledrejection', CHUNK_FAILURE);
    assert.equal(page.reloads, 0, `the page reloaded over feedback not sent yet: ${DROPPED_CHECK}`);
    assert.equal(page.timers.length, 1, 'held, not dropped: the reloader looks again shortly');
    await page.runTimers();
    assert.equal(page.reloads, 0, 'still not sent, so still held');
    setUnsentText(card, false); // sent, emptied or unmounted
    await page.runTimers();
    assert.equal(page.reloads, 1, 'nothing left to send: the page reloads onto the new build');
  } finally {
    setUnsentText(card, false);
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
  const config = configCode();
  const list = config.match(CLIENT_MODULES_LIST)?.[1];
  assert.ok(list, `${CONFIG} has no clientModules list: the reloader never starts, and an old tab keeps its build`);
  assert.ok(list.includes(RELOAD_MODULE_ENTRY), `${CONFIG}'s clientModules should name ${RELOAD_MODULE_ENTRY}`);
  assert.ok(!list.includes('require.resolve'), `${CONFIG}'s clientModules calls require.resolve: the config ships in the public main bundle, so write a relative string`);
  assert.ok(fs.existsSync(path.join(ROOT, RELOAD_MODULE)), `${RELOAD_MODULE} is missing`);
  assert.ok(config.includes(BUILD_ID_PLUGIN_CALL), `${CONFIG} has no ${BUILD_ID_PLUGIN_CALL} in plugins: no page carries a build id, and the reloader installs nothing`);
  assert.match(fs.readFileSync(path.join(ROOT, NETLIFY), 'utf8'), BUILD_ID_HEADER, `${NETLIFY} should serve /build-id.json with cache-control "no-cache": a cached copy hides a deploy`);
});

test("while the feedback prompt is switched on, words.js holds every word it needs, the captcha's too on a site with a captcha", async () => {
  const config = configCode();
  const value = config.match(FEEDBACK_SWITCH)?.[1];
  assert.ok(value === 'true' || value === 'false', `${CONFIG} > customFields.feedbackEnabled should be written as true or false: this test reads it as text`);
  if (value === 'false') return;
  const siteKey = captchaSiteKey(config);
  assert.ok(siteKey !== null, `${CONFIG} > customFields.feedbackCaptchaSiteKey should be written as one quoted string, '' for no captcha: this test reads it as text`);
  const captcha = siteKey.trim() !== '';
  const { missingWords } = await repoModule(FEEDBACK_WORDS);
  const missing = missingWords(undefined, { captcha });
  const site = captcha ? ' and the site has a captcha (customFields.feedbackCaptchaSiteKey is set)' : '';
  assert.deepEqual(missing, [], `the feedback prompt is switched on${site}, but ${FEEDBACK_WORDS} has no words yet for ${missing.join(', ')}: a production build shows no prompt until they are written`);
});

test("the captcha's site key in the config is '' or a site key, never the widget's secret", () => {
  const siteKey = captchaSiteKey(configCode());
  const field = `${CONFIG} > customFields.feedbackCaptchaSiteKey`;
  assert.ok(siteKey !== null, `${field} should be written as one quoted string, '' for no captcha: this test reads it as text`);
  // assert.ok, not assert.equal or assert.match: the value may be the secret, and no message prints it.
  const secret = `most likely the widget's secret, which belongs in the Netlify variable ${CAPTCHA_SECRET_VARIABLE} and never in a file: the config ships in every page`;
  assert.ok(siteKey.length <= SITE_KEY_MAX_LENGTH, `${field} holds ${siteKey.length} characters, and a Turnstile site key at most ${SITE_KEY_MAX_LENGTH}: the value is ${secret}`);
  assert.ok(SITE_KEY_CHARACTERS.test(siteKey), `${field} should hold only letters, digits, '_' and '-', as a Turnstile site key does: copy it again from the widget's page at Cloudflare`);
});

test('the two lists of pages without the feedback prompt hold page addresses only', async () => {
  const { listProblems } = await repoModule(FEEDBACK_RULES);
  const config = configCode();
  for (const name of FEEDBACK_LISTS) {
    const entries = configList(config, name);
    assert.ok(entries !== null, `${CONFIG} > customFields.${name} should be a list of quoted page addresses, as in '/docs/intro', or [] for none`);
    assert.deepEqual(listProblems(entries), [], `${CONFIG} > customFields.${name}: an entry that is no page's address matches nothing, and the prompt stays on that page`);
  }
});

test("the feedback prompt is mounted in both theme copies: under a docs page's content, and under a post's text in the browser only", () => {
  for (const mount of [DOCS_MOUNT, BLOG_MOUNT]) {
    assert.ok(codeOf(mount).includes(FEEDBACK_IMPORT), `${mount} should hold ${FEEDBACK_IMPORT}`);
  }
  assert.ok(spaced(codeOf(DOCS_MOUNT)).includes(DOCS_MOUNT_CODE), `${DOCS_MOUNT} should render the prompt between the page's content and its footer, keyed on the page: ${DOCS_MOUNT_CODE}`);
  assert.ok(spaced(codeOf(BLOG_MOUNT)).includes(BLOG_MOUNT_CODE), `${BLOG_MOUNT} should render the prompt under a post's text, on the post's own page and in the browser only (clientOnly keeps it out of the feeds): ${BLOG_MOUNT_CODE}`);
});

test('the installed theme files the two copies come from still have the shape the copies rely on', () => {
  const advice = 'compare the copy with the new original (its header says how) and carry the change over';
  assert.ok(spaced(installedFile(THEME, DOCS_ORIGINAL)).includes(DOCS_ORIGINAL_ORDER), `the installed ${THEME} lib/${DOCS_ORIGINAL} no longer renders DocItemContent and then DocItemFooter, between which ${DOCS_MOUNT} puts the prompt: ${advice}`);
  assert.ok(spaced(installedFile(THEME, BLOG_ORIGINAL)).includes(BLOG_ORIGINAL_ID), `the installed ${THEME} lib/${BLOG_ORIGINAL} no longer gives its div the feeds' id on a post's page, the div ${BLOG_MOUNT} keeps the prompt out of: ${advice}`);
});

test("the feedback function is one plain re-export in netlify/functions, package.json names it as the site's own, and the page posts to its address", async () => {
  assert.ok(fs.existsSync(path.join(ROOT, FEEDBACK_SHIM)), `${FEEDBACK_SHIM} is missing: Netlify deploys no feedback function, and every message fails`);
  assert.equal(codeOf(FEEDBACK_SHIM), FEEDBACK_SHIM_CODE, `${FEEDBACK_SHIM} must stay one plain re-export of the function, with no handler`);
  const { OWN_FUNCTIONS_FIELD } = await repoModule(FUNCTION_FOLDER);
  const own = JSON.parse(fs.readFileSync(path.join(ROOT, PACKAGE), 'utf8'))[OWN_FUNCTIONS_FIELD];
  assert.ok(Array.isArray(own) && own.includes(FEEDBACK_FUNCTION), `${PACKAGE} > ${OWN_FUNCTIONS_FIELD} should name ${FEEDBACK_FUNCTION}: the shared shim test refuses a function in netlify/functions that the list does not name`);
  const { FEEDBACK_ENDPOINT } = await repoModule(FEEDBACK_RULES);
  const address = `${FUNCTIONS_ROUTE}${FEEDBACK_FUNCTION}`;
  assert.equal(FEEDBACK_ENDPOINT, address, `${FEEDBACK_RULES} > FEEDBACK_ENDPOINT should be ${address}, the address Netlify gives ${FEEDBACK_SHIM}: at any other, every Send fails and no mail goes out`);
});

test("package.json's shared:verify names every test file of the feedback prompt, each by its own name, and none that is gone", () => {
  const absent = FEEDBACK_TEST_FOLDERS.filter((folder) => !fs.existsSync(path.join(ROOT, folder)));
  assert.deepEqual(absent, [], 'FEEDBACK_TEST_FOLDERS names what is not there: list where the prompt keeps its tests now');
  const script = `${PACKAGE} > scripts['${VERIFY_SCRIPT}']`;
  const named = verifiedFiles();
  const patterns = named.filter((file) => PATTERN_CHARACTER.test(file));
  assert.deepEqual(patterns, [], `${script} gives node --test the pattern ${patterns.join(', ')}: name each file instead, as shared/scripts/lib/suites.mjs does. A pattern that matches nothing passes without a word`);
  const unnamed = feedbackTestFiles().filter((file) => !named.includes(file));
  assert.deepEqual(unnamed, [], `${script} does not name ${unnamed.join(', ')}, so nothing runs it: add each to its node --test list, by name`);
  const inFolders = (file) => FEEDBACK_TEST_FOLDERS.some((folder) => file.startsWith(`${folder}/`));
  const gone = named.filter((file) => inFolders(file) && !fs.existsSync(path.join(ROOT, file)));
  assert.deepEqual(gone, [], `${script} names ${gone.join(', ')}, which is not there: node skips a name that matches nothing without a word, so those tests no longer run. Name each test file as it is now`);
});

test("the site's address in the feedback mails is the config's url", async () => {
  const url = configCode().match(SITE_URL_LINE)?.[1];
  assert.ok(url, `${CONFIG} has no url line`);
  const origin = new URL(url).origin;
  const { SITE_ORIGIN } = await repoModule(FEEDBACK_MAIL);
  assert.equal(SITE_ORIGIN, origin, `${FEEDBACK_MAIL} > SITE_ORIGIN should be ${origin}, the site at url in ${CONFIG}: each mail links to the page there`);
});

test('the installed Docusaurus core still marks a page that is live, which the feedback prompt waits for', () => {
  const advice = `${FEEDBACK_STYLES} keeps the prompt hidden while <html> has data-has-hydrated="false": read the new core and adapt that rule`;
  assert.ok(spaced(installedFile(CORE, HYDRATED_FILE)).includes(HYDRATED_MARK), `the installed ${CORE} lib/${HYDRATED_FILE} no longer sets ${HYDRATED_MARK}: ${advice}`);
  assert.ok(spaced(installedFile(CORE, CORE_APP)).includes(HYDRATED_ELEMENT), `the installed ${CORE} lib/${CORE_APP} no longer renders ${HYDRATED_ELEMENT}: ${advice}`);
});

test('no file of the feedback prompt holds a mail service key or a mail address, and neither the config nor netlify.toml holds such a key', () => {
  const missing = [...FEEDBACK_PLACES, ...SETUP_FILES].filter((place) => !fs.existsSync(path.join(ROOT, place)));
  assert.deepEqual(missing, [], 'FEEDBACK_PLACES or SETUP_FILES names what is not there: list where those files are now');
  const searched = [
    ...feedbackFiles().map((file) => [file, [KEY_SHAPE, ADDRESS_SHAPE]]),
    ...SETUP_FILES.map((file) => [file, [KEY_SHAPE]]),
  ];
  const hits = searched.flatMap(([file, shapes]) => privateShapesIn(file, shapes).map((shape) => `${file} (${shape})`));
  assert.deepEqual(hits, [], `the repository is public: the mail key and the two addresses are Netlify variables, named in files by name only (functions/feedback/README.md). Found in ${hits.join(', ')}`);
});
