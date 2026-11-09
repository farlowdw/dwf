/**
 * shared/wiring/index.cjs — the lists every site's docusaurus.config.js would repeat, in one place.
 * A site's config destructures them at the top:
 *
 *     const { ADDITIONAL_LANGUAGES, MAGIC_COMMENTS, admonitionsConfig, katexOptions,
 *       preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc } = require('./shared/wiring/index.cjs');
 *
 * A .cjs file on purpose: plain Node at config time, never bundled. The config is read once, through a
 * loader webpack's cache does not follow, so a change here needs `npm run clear`, then a restart of the
 * dev server or a new build. A plain restart does show a katex-macros.cjs change on docs pages, because the
 * docs plugin hands its options to every doc through a file of its own, while pages of the pages plugin keep
 * the old macros until the clear: one docs page proves nothing. remark-math and rehype-katex stay imported by
 * the site (they are ESM-only packages).
 *
 * HOW TO CHANGE IT
 *   A new admonition: its keyword in ADMONITION_KEYWORDS, its file in shared/theme/Admonition, its
 *   colours in shared/css/custom.scss. One site only: add ADMONITION_KEYWORDS to that site's require
 *   of this file, then write `admonitions: { keywords: [...ADMONITION_KEYWORDS, 'mine'] }` in place of
 *   `...admonitionsConfig` in its docs, blog and pages blocks.
 *   A new kind of marked code line: an entry in MAGIC_COMMENTS, drawn by shared/css/_code-blocks.scss.
 *   A new maths macro: shared/wiring/katex-macros.cjs.
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
  katexOptions,
  preprocessDropDownIc,
  rehypeDropDownIc,
  remarkDropDownIc,
};
