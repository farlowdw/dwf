/**
 * shared/wiring/index.cjs — the lists every site's docusaurus.config.js would repeat, in one place.
 * A site's config destructures them at the top:
 *
 *     const { ADDITIONAL_LANGUAGES, MAGIC_COMMENTS, admonitionsConfig, katexOptions,
 *       preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc } = require('./shared/wiring/index.cjs');
 *
 * A .cjs file on purpose: plain Node at config time, never bundled. The config is read once, through a
 * loader webpack's cache does not follow, so a change here needs `npm run clear`, then a restart of the
 * dev server or a new build. A plain restart (or a cached build) does show a katex-macros.cjs or keyword
 * change on docs pages, because the docs plugin hands its options to every doc through a file of its own,
 * while blog posts and pages of the pages plugin keep the old macros and the old keywords until the clear;
 * magic comments are themeConfig, read in the browser, and change on every page after a plain restart. So
 * neither one docs page nor one code block proves the change was taken. remark-math and rehype-katex stay
 * imported by the site (they are ESM-only packages).
 *
 * HOW TO CHANGE IT
 *   A new admonition: its keyword in ADMONITION_KEYWORDS, its file in shared/theme/Admonition, its
 *   colours in shared/css/custom.scss. One site only: add ADMONITION_KEYWORDS to that site's require
 *   of this file, then write `admonitions: { keywords: [...ADMONITION_KEYWORDS, 'mine'] }` in place of
 *   `...admonitionsConfig` in its docs, blog and pages blocks.
 *   A new kind of marked code line: an entry in MAGIC_COMMENTS, drawn by shared/css/_code-blocks.scss.
 *   A new maths macro: shared/wiring/katex-macros.cjs.
 *   The code editor's plugin entry: codeRunnerPlugin below. Its options are the plugin's own
 *   (shared/plugins/monaco-editor/index.js > OPTIONS). A change to the plugin's own code needs a
 *   restart of the dev server, not a clear (a running server keeps the old plugin).
 *   KaTeX's stylesheet plugin entry, for a site with maths: katexCssPlugin below (shared/plugins/katex-css).
 *   The PDF viewer's worker plugin entry: pdfjsWorkerPlugin below (shared/plugins/pdfjs-worker); the
 *   same restart applies.
 *   The build id's plugin entry: buildIdPlugin below. It takes no options. What reads the id is
 *   shared/lib/pageReload, started by a client module of the site (shared/lib/README.md).
 */

const { preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc } = require('../components/DropDownIC/mdx.cjs');
const katexMacros = require('./katex-macros.cjs');

/** Every `:::keyword` the sites accept: Docusaurus's six, then the seven of Types.js. */
const ADMONITION_KEYWORDS = [
  'danger', 'warning', 'caution', 'info', 'tip', 'note',
  'dwf', 'key', 'perf', 'extension', 'study', 'tool', 'iio',
];

/** Spread into a docs / blog / pages block: `...admonitionsConfig`. */
const admonitionsConfig = { admonitions: { keywords: ADMONITION_KEYWORDS } };

/** The two KaTeX commands the notes may use. */
const katexTrust = (context) => ['\\htmlId', '\\href'].includes(context.command);

/**
 * rehype-katex's options, a fresh copy per call: `globalGroup` lets a page's \gdef write into the
 * macros object, so docs, blog and pages must not share one.
 */
const katexOptions = () => ({
  throwOnError: true,
  globalGroup: true,
  trust: katexTrust,
  macros: JSON.parse(JSON.stringify(katexMacros)),
});

/** One magic comment per kind of marked line; each className is drawn by _code-blocks.scss. */
const MAGIC_COMMENTS = [
  { className: 'theme-code-block-highlighted-line', line: 'highlight-next-line', block: { start: 'highlight-start', end: 'highlight-end' } },
  { className: 'code-block-error-line', line: 'highlight-error-next-line', block: { start: 'highlight-error-start', end: 'highlight-error-end' } },
  { className: 'code-block-success-line', line: 'highlight-success-next-line', block: { start: 'highlight-success-start', end: 'highlight-success-end' } },
  { className: 'code-block-warning-line', line: 'highlight-warning-next-line', block: { start: 'highlight-warning-start', end: 'highlight-warning-end' } },
  { className: 'code-block-removed-line', line: 'highlight-remove-next-line', block: { start: 'highlight-remove-start', end: 'highlight-remove-end' } },
  { className: 'code-block-added-line', line: 'highlight-add-next-line', block: { start: 'highlight-add-start', end: 'highlight-add-end' } },
];

/**
 * The code editor's plugin, as a site's config names it. Docusaurus reads a relative name from the
 * config file, and a relative name keeps this machine's folders out of a site's main chunk.
 */
const CODE_RUNNER_PLUGIN = './shared/plugins/monaco-editor';

/**
 * The entry for a site's `plugins` list when it uses shared/components/CodeEditor: `codeRunnerPlugin()`.
 * The plugin serves Monaco from the site and tells the editor where its two functions are. Pass
 * { executeUrl, runtimesUrl } only when a site keeps them somewhere other than the defaults.
 */
const codeRunnerPlugin = (options) => (options === undefined ? CODE_RUNNER_PLUGIN : [CODE_RUNNER_PLUGIN, options]);

/** KaTeX's stylesheet and fonts, served from the site (shared/plugins/katex-css), named the same way. */
const KATEX_CSS_PLUGIN = './shared/plugins/katex-css';

/** The entry for a site's `plugins` list when its pages hold maths: `katexCssPlugin()`. It takes no options. */
const katexCssPlugin = () => KATEX_CSS_PLUGIN;

/** The PDF viewer's worker plugin, as a site's config names it: relative, for the reason above. */
const PDFJS_WORKER_PLUGIN = './shared/plugins/pdfjs-worker';

/**
 * The entry for a site's `plugins` list when it uses shared/components/PDFViewer: `pdfjsWorkerPlugin()`.
 * The plugin serves PDF.js's worker from the site and hands the viewer its URL; it takes no options.
 */
const pdfjsWorkerPlugin = () => PDFJS_WORKER_PLUGIN;

/** The plugin that gives each production build an id, named the same relative way. */
const BUILD_ID_PLUGIN = './shared/plugins/build-id';

/**
 * The entry for a site's `plugins` list when an open tab should reload itself after a deploy:
 * `buildIdPlugin()`. The plugin writes the id into every page and into /build-id.json;
 * shared/lib/pageReload compares the two. It takes no options.
 */
const buildIdPlugin = () => BUILD_ID_PLUGIN;

/** Prism's extra languages, the same 76 on every site. */
const ADDITIONAL_LANGUAGES = [
  'apacheconf', 'applescript', 'asciidoc', 'aspnet', 'awk', 'bash', 'basic', 'c', 'clojure', 'cpp',
  'csharp', 'css', 'csv', 'docker', 'editorconfig', 'ejs', 'elixir', 'erlang', 'excel-formula',
  'flow', 'fortran', 'git', 'go', 'go-module', 'graphql', 'handlebars', 'http', 'java',
  'javadoclike', 'javascript', 'js-extras', 'jsdoc', 'json', 'jsonp', 'jsx', 'latex', 'less', 'lisp',
  'log', 'lua', 'makefile', 'markdown', 'markup', 'markup-templating', 'mongodb', 'nginx', 'perl',
  'php', 'php-extras', 'phpdoc', 'plsql', 'powerquery', 'powershell', 'pug', 'python', 'r', 'regex',
  'ruby', 'rust', 'sas', 'sass', 'scheme', 'scss', 'shell-session', 'sql', 'systemd', 'toml', 'tsx',
  'turtle', 'typescript', 'vim', 'visual-basic', 'wasm', 'wiki', 'wolfram', 'yaml',
];

module.exports = {
  ADDITIONAL_LANGUAGES,
  ADMONITION_KEYWORDS,
  MAGIC_COMMENTS,
  admonitionsConfig,
  buildIdPlugin,
  codeRunnerPlugin,
  katexCssPlugin,
  katexOptions,
  pdfjsWorkerPlugin,
  preprocessDropDownIc,
  rehypeDropDownIc,
  remarkDropDownIc,
};
