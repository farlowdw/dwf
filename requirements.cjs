/**
 * requirements.cjs — what each shared piece needs from the site that uses it. shared/ installs
 * nothing: a site's package.json stays the one source of truth. `npm run shared:status` works out
 * which pieces a site uses, checks their packages against the site's lock, and prints the exact
 * `npm install --save-exact` line for anything missing, or shared:bump for a @docusaurus package, which
 * moves with all the others. `npm run test:shared` reads the same rows
 * to run only the suites of the pieces a site has. A .cjs file with no imports, so any script or
 * test can require it, whatever a site's package.json says about modules.
 *
 * AN ENTRY
 *   name        the piece, as the scripts print it
 *   kind        how a site reaches it, one of KIND below; it says which of the next fields is set
 *   stub        (component, theme) the site's file, from the site's root
 *   namedOnly   (component, theme) true for a piece with no default export: shared:join writes its
 *               stub as `export *`, where every other stub is `export { default }`
 *   configText  (plugin) text found on the piece's line in the site's docusaurus.config.js
 *   clientImport  (library) the path a client module under src/clientModules imports
 *   script      (script) the line in the site's package.json that runs it
 *   evidence    (component, theme) what proves a site uses the piece, so that a missing stub is an
 *               error and not "not used": { configText?, docsPattern?, srcPattern?, clientImport? }.
 *               docsPattern is the source of a RegExp, read with the m flag over docs, blog and src/pages;
 *               srcPattern is one read the same way over the site's own code, every script and page under
 *               src/, for a piece that another component imports and no page does; clientImport is text
 *               a client module under src/clientModules holds, such as its import line
 *   needsConfig (any kind) what the site's docusaurus.config.js must hold while the site uses the piece: a
 *               list of { text, what }. `text` is looked for in the config with its comments left out, so
 *               a line that is commented out counts as gone; `what` says in a few words what the line is,
 *               for the message. Without such a line the build passes and the piece breaks in the
 *               browser, so shared:status fails on it (its `config` line) and test:shared does too.
 *               A site's own copy where the stub belongs is not asked: it is the site's code
 *   packages    names in RANGES the piece needs to build and run
 *   testPackages  names in RANGES only its suites need
 *   cachePackages names in RANGES a script loads from the cache folder outside every repo, not from
 *               the site's lock, so a site's install never sees them
 *   suites      test folders of the piece, from shared/
 *
 * RANGES  A caret range (^1.2.3), or an exact version where a piece needs exactly one. @babel/parser and
 *   @babel/traverse are here for tests that load them through createRequire, which the self-containment
 *   test reads as imports. A package
 *   counts as present when the site's lock holds a version in range, whether or not its
 *   package.json lists it: @docusaurus/theme-common comes with theme-classic, @mdx-js/mdx and
 *   remark-gfm with Docusaurus. The ranges are the sites' own, so locks that differ both pass. A
 *   name in cachePackages holds the one exact version the cache must have.
 *
 * HOW TO CHANGE IT
 *   A new component: its package names in RANGES, a row in ENTRIES (copy LC's), and a render test in its
 *   __tests__ folder, as LC's shows, named in the row's suites. Another shape of
 *   piece: a row of its kind. A plugin needs only configText, a library only clientImport, a script
 *   only its line.
 *   A piece that works only with a line in the site's config, such as a plugin that serves its files:
 *   needsConfig in its row, as CodeEditor's shows.
 *   A new test folder: the row's suites, or ALWAYS_SUITES when every site runs it.
 *   A name webpack resolves and npm does not hold: BUILT_IN_IMPORTS.
 */

/** How a site reaches a piece, and so how the scripts tell that it uses it. */
const KIND = Object.freeze({
  /** A stub under src/components (`stub`). */
  component: 'component',
  /** A stub under src/theme (`stub`). */
  theme: 'theme',
  /** A line in docusaurus.config.js (`configText`): a plugin, a stylesheet, the wiring. */
  plugin: 'plugin',
  /** An import in a client module (`clientImport`). */
  library: 'library',
  /** A line in the site's package.json (`script`). */
  script: 'script',
});

/** One range per package, so two rows cannot disagree. */
const RANGES = Object.freeze({
  '@babel/core': '^7.29.0',
  '@babel/parser': '^7.29.0',
  '@babel/preset-react': '^7.29.0',
  '@babel/traverse': '^7.29.0',
  '@docusaurus/core': '^3.10.2',
  '@docusaurus/theme-classic': '^3.10.2',
  '@docusaurus/theme-common': '^3.10.2',
  '@emotion/react': '^11.14.0',
  '@emotion/styled': '^11.14.0',
  '@mdx-js/mdx': '^3.1.0',
  '@monaco-editor/loader': '1.7.0',
  '@monaco-editor/react': '4.7.0',
  '@mui/icons-material': '^9.4.0',
  '@mui/material': '^9.4.0',
  '@react-pdf-viewer/core': '^3.12.0',
  '@react-pdf-viewer/default-layout': '^3.12.0',
  clsx: '^2.0.0',
  'docusaurus-plugin-sass': '^0.2.5',
  katex: '^0.16.27',
  'monaco-editor': '0.55.1',
  'pdfjs-dist': '^3.11.174',
  postcss: '^8.5.6',
  'postcss-modules-local-by-default': '^4.2.0',
  'postcss-modules-scope': '^3.2.1',
  'prism-react-renderer': '^2.4.0',
  'puppeteer-core': '25.16.0',
  react: '^19.0.0',
  'react-dom': '^19.0.0',
  'rehype-katex': '^7.0.1',
  'remark-gfm': '^4.0.0',
  'remark-math': '^6.0.0',
  sass: '^1.80.5',
  'serve-handler': '^6.1.6',
});

/** What any piece built on MUI's components needs. */
const MUI_CORE = ['@mui/material', '@emotion/react', '@emotion/styled'];

/** A render suite compiles a component's JSX with Babel's React preset, as the site's build does. */
const JSX_TEST_PACKAGES = ['@babel/core', '@babel/preset-react', 'react-dom'];

/** The DropDownIC suites compile with Babel and MDX, as the site does. */
const MDX_TEST_PACKAGES = ['@babel/core', '@babel/preset-react', '@mdx-js/mdx', 'remark-gfm'];

/** DropDownIC's suite: its MDX plugins, and its render, which needs react-dom. */
const DROPDOWN_SUITE = 'components/DropDownIC/__tests__';

/** The source of the docs pattern that finds an import of a site's stub. */
const importedFrom = (name) => `['"]@site/src/components/${name}['"/]`;

const ENTRIES = Object.freeze([
  {
    name: 'stylesheets',
    kind: KIND.plugin,
    configText: 'shared/css/custom.scss',
    packages: ['sass', 'docusaurus-plugin-sass'],
    suites: [],
  },
  {
    name: 'Admonition',
    kind: KIND.theme,
    stub: 'src/theme/Admonition/Types.js',
    evidence: { configText: 'admonitionsConfig', docsPattern: '^:::(dwf|key|perf|extension|study|tool|iio)\\b' },
    packages: ['react', 'clsx', '@docusaurus/theme-classic', '@mui/icons-material', ...MUI_CORE],
    suites: [],
  },
  {
    // The docs sidebar's column, wrapped so that a collapse or an expand keeps the reader's place. A site
    // takes it with the stub alone, so the row has no evidence: a site that drops its stub goes back to the
    // theme's plain column with no error, and each site that uses it holds the stub in a test of its own.
    name: 'DocRoot/Layout/Sidebar',
    kind: KIND.theme,
    stub: 'src/theme/DocRoot/Layout/Sidebar/index.jsx',
    packages: ['react', '@docusaurus/theme-classic', '@docusaurus/theme-common'],
    suites: ['theme/DocRoot/Layout/Sidebar/__tests__'],
  },
  {
    name: 'Asterisk',
    kind: KIND.component,
    stub: 'src/components/Asterisk/index.jsx',
    evidence: { docsPattern: importedFrom('Asterisk') },
    packages: ['react', '@docusaurus/theme-common', ...MUI_CORE],
    testPackages: JSX_TEST_PACKAGES,
    suites: ['components/Asterisk/__tests__'],
  },
  {
    name: 'BibRef',
    kind: KIND.component,
    stub: 'src/components/BibRef/index.jsx',
    evidence: { docsPattern: importedFrom('BibRef') },
    packages: ['react', '@docusaurus/theme-common', '@mui/icons-material', ...MUI_CORE],
    testPackages: JSX_TEST_PACKAGES,
    suites: ['components/BibRef/__tests__'],
  },
  {
    name: 'CodeGrid',
    kind: KIND.component,
    stub: 'src/components/CodeGrid/index.jsx',
    evidence: { docsPattern: importedFrom('CodeGrid') },
    packages: ['react'],
    testPackages: JSX_TEST_PACKAGES,
    suites: ['components/CodeGrid/__tests__'],
  },
  {
    name: 'CodeGridCell',
    kind: KIND.component,
    stub: 'src/components/CodeGridCell/index.jsx',
    evidence: { docsPattern: importedFrom('CodeGridCell') },
    packages: ['react', '@docusaurus/theme-common'],
    testPackages: JSX_TEST_PACKAGES,
    suites: ['components/CodeGridCell/__tests__'],
  },
  {
    name: 'DropDownIC',
    kind: KIND.component,
    stub: 'src/components/DropDownIC/index.jsx',
    evidence: { docsPattern: importedFrom('DropDownIC') },
    packages: ['react', 'react-dom'],
    testPackages: MDX_TEST_PACKAGES,
    suites: [DROPDOWN_SUITE],
  },
  {
    // The wiring hands every page DropDownIC's preprocessor and MDX plugins, stub or no stub, so a site on it runs
    // their suite. This row comes after DropDownIC's: a site with the stub reads that suite under DropDownIC's name.
    name: 'wiring',
    kind: KIND.plugin,
    configText: 'shared/wiring/index.cjs',
    packages: ['@docusaurus/core'],
    testPackages: ['react', 'react-dom', ...MDX_TEST_PACKAGES],
    suites: [DROPDOWN_SUITE],
  },
  {
    // A site's maths: remark-math and rehype-katex, which its config imports itself, and KaTeX under them. The
    // wiring's katexOptions() is a plain object, so a site on the wiring without maths needs none of the three.
    // KaTeX's stylesheet and fonts come from plugins/katex-css, named in the config as katexCssPlugin(): without
    // that line the site builds and no page links KaTeX's stylesheet from the site. The plugin's suite is this row's.
    name: 'maths',
    kind: KIND.plugin,
    configText: 'rehype-katex',
    needsConfig: [{ text: 'katexCssPlugin(', what: 'the KaTeX stylesheet plugin, katexCssPlugin() in plugins' }],
    packages: ['remark-math', 'rehype-katex', 'katex'],
    suites: ['plugins/katex-css/__tests__'],
  },
  {
    name: 'LC',
    kind: KIND.component,
    stub: 'src/components/LC/index.jsx',
    evidence: { docsPattern: importedFrom('LC') },
    packages: ['react', ...MUI_CORE],
    testPackages: JSX_TEST_PACKAGES,
    suites: ['components/LC/__tests__'],
  },
  {
    // One MUI ThemeProvider that follows the colour mode, for a site's own MUI components. Its importers are
    // mostly a site's components, which evidence does not read, and a missing stub there fails the build. The
    // code editor keeps a copy of its values in MuiScope.jsx: __tests__/muiTheme.test.mjs holds the two equal.
    name: 'MuiTheme',
    kind: KIND.component,
    stub: 'src/components/MuiTheme/index.jsx',
    evidence: { docsPattern: importedFrom('MuiTheme') },
    packages: ['react', '@docusaurus/theme-common', ...MUI_CORE],
    testPackages: JSX_TEST_PACKAGES,
    suites: ['components/MuiTheme/__tests__'],
  },
  {
    // The PDF reader. Its worker comes from shared/plugins/pdfjs-worker, which the site's config names as
    // pdfjsWorkerPlugin(): without it the viewer has no worker URL. 'my-loaders' is each site's own webpack
    // plugin, whose canvas alias lets webpack bundle pdf.js (README.md > Mount it on a site prints its two files). A site's own component may import the viewer where
    // no page does, hence srcPattern. The plugin's suite is listed here, as Monaco's is in CodeEditor's row.
    name: 'PDFViewer',
    kind: KIND.component,
    stub: 'src/components/PDFViewer/index.jsx',
    evidence: { docsPattern: importedFrom('PDFViewer'), srcPattern: importedFrom('PDFViewer') },
    needsConfig: [
      { text: 'pdfjsWorkerPlugin(', what: 'the worker plugin, pdfjsWorkerPlugin() in plugins' },
      { text: 'my-loaders', what: "the webpack plugin pdf.js needs, 'my-loaders' in plugins (the site's own: README.md > Mount it on a site prints it)" },
    ],
    packages: [
      'react', '@docusaurus/core', '@docusaurus/theme-common', '@react-pdf-viewer/core',
      '@react-pdf-viewer/default-layout', 'pdfjs-dist', ...MUI_CORE,
    ],
    testPackages: JSX_TEST_PACKAGES,
    suites: ['components/PDFViewer/__tests__', 'plugins/pdfjs-worker/__tests__'],
  },
  {
    // The editor, its Monaco plugin (codeRunnerPlugin() in the site's config) and its two functions
    // (one-line shims in netlify/functions). A suite is its folder's own files, so each is listed.
    name: 'CodeEditor',
    kind: KIND.component,
    stub: 'src/components/CodeEditor/index.jsx',
    evidence: { docsPattern: importedFrom('CodeEditor') },
    needsConfig: [{ text: 'codeRunnerPlugin(', what: 'the Monaco plugin, codeRunnerPlugin() in plugins' }],
    packages: [
      'react', 'clsx', 'prism-react-renderer', '@docusaurus/core', '@docusaurus/theme-classic',
      '@docusaurus/theme-common', '@monaco-editor/loader', '@monaco-editor/react', 'monaco-editor',
      '@mui/icons-material', ...MUI_CORE,
    ],
    testPackages: [
      'react-dom', '@babel/core', '@babel/preset-react', 'postcss', 'postcss-modules-local-by-default',
      'postcss-modules-scope',
    ],
    suites: [
      'components/CodeEditor/__tests__',
      'components/CodeEditor/lib/codeRunner/__tests__',
      'components/CodeEditor/lib/registry/__tests__',
      'components/CodeEditor/CodeRef/__tests__',
      'plugins/monaco-editor/__tests__',
      'functions/code-runner/__tests__',
    ],
  },
  {
    // The editor's reference links. Its suite is in the CodeEditor row.
    name: 'CodeRef',
    kind: KIND.component,
    stub: 'src/components/CodeEditor/CodeRef/index.jsx',
    evidence: { docsPattern: importedFrom('CodeEditor/CodeRef') },
    packages: ['react'],
    suites: [],
  },
  {
    // The flag a site's reloader reads. Only that site has this stub, and it must stay a plain re-export
    // (a copy is a second, empty registry, with no error). The reloader's import line is the evidence, so
    // a deleted stub that a client module still imports is an error. Its suite is CodeEditor's.
    name: 'unsavedWork',
    kind: KIND.component,
    stub: 'src/components/CodeEditor/unsavedWork.js',
    namedOnly: true,
    evidence: { clientImport: "'../components/CodeEditor/unsavedWork" },
    packages: [],
    suites: [],
  },
  {
    // Gives each production build an id: a meta in every page and /build-id.json. The helper takes no
    // options, so a site's config holds the call as it is written here. The pageReload row below is what
    // reads the id.
    name: 'build-id',
    kind: KIND.plugin,
    configText: 'buildIdPlugin()',
    packages: [],
    suites: ['plugins/build-id/__tests__'],
  },
  {
    // Reloads an open tab after a deploy, at a safe moment. A client module of the site starts it and hands
    // it the site's own unsaved-text check. Without the plugin's line no page carries an id, and the reloader
    // then installs nothing, with no error: so the row asks for the line.
    name: 'pageReload',
    kind: KIND.library,
    clientImport: 'shared/lib/pageReload/',
    needsConfig: [{ text: 'buildIdPlugin()', what: 'the build id plugin in plugins' }],
    packages: [],
    suites: ['lib/pageReload/__tests__'],
  },
  {
    // Serves builds with the site's own serve-handler, which Docusaurus brings, and drives a browser
    // with puppeteer-core from the cache. Neither is an import: both load from their own folder.
    name: 'shared:compare',
    kind: KIND.script,
    script: 'shared:compare',
    packages: ['serve-handler'],
    cachePackages: ['puppeteer-core'],
    suites: [],
  },
]);

/** Test folders every site runs, from shared/. */
const ALWAYS_SUITES = Object.freeze(['__tests__']);

/** The scripts' own real-git suites, from shared/: on request, or when shared/scripts changed. */
const SCRIPT_SUITES = Object.freeze(['scripts/__tests__']);

/** Import names Docusaurus's webpack resolves, so no package holds them. A trailing / is a prefix. */
const BUILT_IN_IMPORTS = Object.freeze([
  '@theme/', '@theme-original/', '@docusaurus/BrowserOnly', '@docusaurus/Translate', '@docusaurus/router',
  '@docusaurus/useGlobalData',
]);

module.exports = { ALWAYS_SUITES, BUILT_IN_IMPORTS, ENTRIES, KIND, RANGES, SCRIPT_SUITES };
