// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import { themes as prismThemes } from 'prism-react-renderer';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
const katexMacros = require('./katex-macros');

const admonitionsConfig = {
  admonitions: {
    keywords: [
      'danger',
      'warning',
      'caution',
      'info',
      'tip',
      'note',
      'dwf',
      'key',
      'perf',
      'extension',
      'study',
      'tool',
      'iio',
    ],
  },
}

/** @typedef {import('katex').TrustContext} TrustContext */

/** @param {TrustContext} context */
const katexTrust = (context) => ['\\htmlId', '\\href'].includes(context.command);

/** @param {Record<string, string>} macros */
const cloneMacros = (macros) => JSON.parse(JSON.stringify(macros));

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Daniel W. Farlow',
  tagline: 'Exploring life one problem at a time',
  favicon: 'img/favicon.ico',
  url: 'https://danielwfarlow.com',
  baseUrl: '/',
  onBrokenLinks: 'warn',

  customFields: {
    forbiddenGiscusDocPaths: [
      '/docs/intro',
      '/docs/admonitions',
      '/docs/reference-list',
    ],
    forbiddenGiscusBlogPaths: [
    ],
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
      onBrokenMarkdownImages: 'throw'
    }
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({

        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/farlowdw/dwf/tree/master/',
          remarkPlugins: [remarkMath],
          rehypePlugins: [[rehypeKatex, {
            throwOnError: true,
            globalGroup: true,
            trust: katexTrust,
            macros: cloneMacros(katexMacros)
          }]],
          ...admonitionsConfig,
        },

        blog: {
          editUrl: 'https://github.com/farlowdw/dwf/tree/master/',
          remarkPlugins: [remarkMath],
          rehypePlugins: [[rehypeKatex, {
            throwOnError: true,
            globalGroup: true,
            trust: katexTrust,
            macros: cloneMacros(katexMacros)
          }]],
          blogTitle: `Blog`,
          blogDescription: `Blog entries from Daniel W. Farlow's personal website.`,
          postsPerPage: 'ALL',
          blogSidebarCount: 0,
          sortPosts: 'descending',
          showReadingTime: false,
          showLastUpdateTime: true,
          ...admonitionsConfig,
        },

        theme: {
          customCss: [
            require.resolve('./src/css/custom.scss'),
            require.resolve('./src/css/buy-me-a-coffee.scss'),
          ]
        },

        pages: {
          rehypePlugins: [[rehypeKatex, {
            throwOnError: true,
            globalGroup: true,
            trust: katexTrust,
            macros: cloneMacros(katexMacros)
          }]],
          ...admonitionsConfig,
        },

      }),
    ],
  ],

  stylesheets: [
    // KaTeX
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.13.24/dist/katex.min.css',
      type: 'text/css',
      integrity:
        'sha384-odtC+0UGzzFL/6PNoE8rX/SPcQDXBJ+uRepguP4QkPCm2LBxH3FA3y+fKSiJ+AmM',
      crossorigin: 'anonymous',
    },
    // Pseudocode (ref: https://www.npmjs.com/package/pseudocode)
    {
      href: 'https://cdn.jsdelivr.net/npm/pseudocode@latest/build/pseudocode.min.css',
      type: 'text/css',
      crossorigin: 'anonymous',
    },
  ],

  scripts: [
    // KaTeX
    {
      src: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.7/katex.min.js",
      async: true,
    },
    // Pseudocode (ref: https://www.npmjs.com/package/pseudocode)
    {
      src: "https://cdn.jsdelivr.net/npm/pseudocode@latest/build/pseudocode.min.js",
      async: true,
    },
  ],

  plugins: [
    'docusaurus-plugin-sass',
    require.resolve("docusaurus-plugin-image-zoom"),
    'my-loaders',
    '@docusaurus/theme-mermaid'
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },
      docs: {
        sidebar: {
          hideable: true,
          autoCollapseCategories: true,
        },
      },
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 5,
      },
      navbar: {
        title: 'Daniel W. Farlow',
        logo: {
          alt: 'Logo depicted by a chemistry set conveying a spirit of experimentation',
          src: 'img/logo.svg',
        },
        hideOnScroll: true,
        items: [
          {
            to: '/docs/intro',
            label: 'Explorations',
            position: 'left',
            activeBaseRegex: `^/docs/(?!tags$).+`,
          },
          {
            to: '/docs/tags',
            label: 'Tags',
            position: 'left',
            activeBaseRegex: `^/docs/tags/?$`,
          },
          {
            to: '/blog',
            label: 'Blog',
            position: 'left',
            activeBaseRegex: `/blog(?!/archive|/tags)`,
          },
          {
            to: '/blog/archive',
            label: 'Blog Archive',
            position: 'left'
          },
          {
            to: '/blog/tags',
            label: 'Blog Tags',
            position: 'left'
          },
          {
            label: 'SQL',
            position: 'right',
            type: 'dropdown',
            items: [
              {
                label: 'Formatting guidelines',
                to: '/docs/software-engineering/sql/formatting-guidelines',
              },
              {
                label: 'Query execution order',
                to: '/docs/software-engineering/sql/query-execution-order',
              },
              {
                label: 'Window functions',
                to: '/docs/software-engineering/sql/window-functions',
              },
              {
                label: 'Common table expressions (CTEs)',
                to: '/docs/software-engineering/sql/ctes',
              },
            ],
          },
          {
            label: 'BCTCI',
            position: 'right',
            type: 'dropdown',
            items: [
              {
                label: 'Submit Bug',
                href: 'https://bctci.co/bugs',
              },
              {
                label: 'Errata',
                href: 'https://bctci.co/errata',
              },
              {
                label: 'Changelog',
                href: 'https://start.interviewing.io/beyond-ctci/part-i-preface/what-is-this-book#changelog',
              },
              {
                label: 'Practice (IIO AI)',
                href: 'https://start.interviewing.io/interview-ai',
              },
              {
                type: 'html',
                value: '<hr class="navbar__dropdown-separator" />',
              },
              {
                label: 'Book work and notes',
                to: '/docs/noteworthy-books/bctci/overview',
              },
              {
                label: 'Interview checklist',
                to: '/docs/noteworthy-books/bctci/checklist',
              },
              {
                label: 'Postmortem',
                to: '/docs/noteworthy-books/bctci/postmortem',
              },
              {
                label: 'Cheat sheet',
                to: '/docs/noteworthy-books/bctci/cheatsheet',
              },
              {
                label: 'Bug list',
                to: '/docs/noteworthy-books/bctci/bugs',
              },
              {
                label: 'Triggers',
                to: '/docs/noteworthy-books/bctci/triggers',
              },
              {
                label: 'Catalog of technical topics',
                to: '/docs/noteworthy-books/bctci/catalog',
              },
            ],
          },
          {
            to: '/about',
            label: 'About',
            position: 'right'
          },
          {
            href: 'https://www.buymeacoffee.com/danielwfarlow',
            position: 'right',
            className: 'header-coffee-link',
            'aria-label': 'Buy me a coffee',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          {
            href: `https://github.com/farlowdw/dwf`,
            position: 'right',
            className: 'header-github-link',
            'aria-label': 'Vist GitHub repository',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Explorations',
            items: [
              {
                to: '/docs/teaching-portfolio',
                label: 'Educational Philosophy',
              },
            ],
          },
          {
            title: 'Blog',
            items: [
              {
                label: 'Feynman Technique for Learning',
                to: '/blog/2026/01/15/2026/feynman-technique',
              },
            ],
          },
          {
            title: 'External',
            items: [
              {
                label: 'Hacker News',
                href: 'https://news.ycombinator.com/',
              },
            ],
          },
          {
            title: 'Bloggers',
            items: [
              {
                label: 'Josh W. Comeau',
                href: 'https://www.joshwcomeau.com/',
              },
              {
                label: 'Anil Dash',
                href: 'https://www.anildash.com/',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} danielwfarlow.com`,
      },
      zoom: {
        selector: '.markdown :not(em) > img',
        config: {
          // options you can specify via https://github.com/francoischalifour/medium-zoom#usage
          background: {
            light: 'rgb(255, 255, 255)',
            dark: 'rgb(50, 50, 50)'
          }
        }
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        magicComments: [
          {
            className: 'theme-code-block-highlighted-line',
            line: 'highlight-next-line',
            block: { start: 'highlight-start', end: 'highlight-end' },
          },
          {
            className: 'code-block-error-line',
            line: 'highlight-error-next-line',
            block: { start: 'highlight-error-start', end: 'highlight-error-end' },
          },
          {
            className: 'code-block-error-line-numbers',
            line: 'highlight-error-next-line-numbers',
            block: { start: 'highlight-error-start-numbers', end: 'highlight-error-end-numbers' },
          },
          {
            className: 'code-block-success-line',
            line: 'highlight-success-next-line',
            block: { start: 'highlight-success-start', end: 'highlight-success-end' },
          },
          {
            className: 'code-block-success-line-numbers',
            line: 'highlight-success-next-line-numbers',
            block: { start: 'highlight-success-start-numbers', end: 'highlight-success-end-numbers' },
          },
          {
            className: 'code-block-warning-line',
            line: 'highlight-warning-next-line',
            block: { start: 'highlight-warning-start', end: 'highlight-warning-end' },
          },
          {
            className: 'code-block-warning-line-numbers',
            line: 'highlight-warning-next-line-numbers',
            block: { start: 'highlight-warning-start-numbers', end: 'highlight-warning-end-numbers' },
          },
          {
            className: 'code-block-removed-line',
            line: 'highlight-remove-next-line',
            block: { start: 'highlight-remove-start', end: 'highlight-remove-end' },
          },
          {
            className: 'code-block-added-line',
            line: 'highlight-add-next-line',
            block: { start: 'highlight-add-start', end: 'highlight-add-end' },
          },
        ],
        additionalLanguages: [
          "apacheconf",
          "applescript",
          "asciidoc",
          "aspnet",
          "awk",
          "bash",
          "basic",
          "c",
          "clojure",
          "cpp",
          "csharp",
          "css",
          "csv",
          "docker",
          "editorconfig",
          "ejs",
          "elixir",
          "erlang",
          "excel-formula",
          "flow",
          "fortran",
          "git",
          "go",
          "go-module",
          "graphql",
          "handlebars",
          "http",
          "java",
          "javadoclike",
          "javascript",
          "js-extras",
          "jsdoc",
          "json",
          "jsonp",
          "jsx",
          "latex",
          "less",
          "lisp",
          "log",
          "lua",
          "makefile",
          "markdown",
          "markup",
          "markup-templating",
          "mongodb",
          "nginx",
          "perl",
          "php",
          "php-extras",
          "phpdoc",
          "plsql",
          "powerquery",
          "powershell",
          "pug",
          "python",
          "r",
          "regex",
          "ruby",
          "rust",
          "sas",
          "sass",
          "scheme",
          "scss",
          "shell-session",
          "sql",
          "systemd",
          "toml",
          "tsx",
          "turtle",
          "typescript",
          "vim",
          "visual-basic",
          "wasm",
          "wiki",
          "wolfram",
          "yaml"
        ]
      },
    }),
};

export default config;