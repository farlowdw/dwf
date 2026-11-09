// @ts-check
/*
 * docusaurus.config.js: the whole site's configuration: title and URL, the docs, blog and pages,
 * the plugins, the navbar and the footer. The lists every site of the family repeats (admonition
 * keywords, KaTeX options, <DropDownIC>'s MDX plugins, Prism's languages and magic comments) come
 * from shared/wiring/index.cjs, and shared/ also holds the global stylesheets (customCss) and static
 * files (staticDirectories).
 *
 * HOW TO CHANGE IT
 *   A list from shared/wiring: edit it there and roll it out (shared/README.md). A keyword of this
 *   site only: add ADMONITION_KEYWORDS to the require below, then, in the docs, blog and pages
 *   blocks, write `admonitions: { keywords: [...ADMONITION_KEYWORDS, 'mine'] }` in place of
 *   `...admonitionsConfig`. Its component and colours: shared/README.md > When one site needs
 *   something different.
 *   A style of this site only: src/css/site.scss and _site-dark.scss. Keep customCss as relative
 *   strings: require.resolve would write this machine's path into the public bundle.
 *   The options of Docusaurus itself: https://docusaurus.io/docs/api/docusaurus-config
 * (`@type` JSDoc annotations below give editor autocompletion with `@ts-check`.)
 */

import { themes as prismThemes } from 'prism-react-renderer';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// The lists every site shares, and the inline dropdown's MDX plugins (<DropDownIC>,
// shared/components/DropDownIC/mdx.cjs: a title read as markdown and maths, and the paragraph that
// holds it drawn as a <div>).
const {
  ADDITIONAL_LANGUAGES, MAGIC_COMMENTS, admonitionsConfig, katexOptions,
  preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc,
} = require('./shared/wiring/index.cjs');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Daniel W. Farlow',
  tagline: 'Exploring life one problem at a time',
  favicon: 'img/favicon.ico',
  url: 'https://danielwfarlow.com',
  baseUrl: '/',
  onBrokenLinks: 'warn',

  // shared/static holds the fonts and icons every site serves; both folders land at the site's root.
  staticDirectories: ['static', 'shared/static'],

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
    // A <DropDownIC> opened mid-sentence around a body of blocks (code, paragraphs) is rewritten
    // into a form MDX parses and joined back into one paragraph by rehypeDropDownIc: see
    // shared/components/DropDownIC/mdx.cjs > preprocessDropDownIc. Everything else passes untouched.
    preprocessor: preprocessDropDownIc,
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
          // Paths in this config are relative strings that Docusaurus resolves itself. The site's
          // config ships in the public main bundle, so require.resolve would publish this machine's
          // absolute path there.
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/farlowdw/dwf/tree/master/',
          remarkPlugins: [remarkMath, remarkDropDownIc],
          rehypePlugins: [rehypeDropDownIc, [rehypeKatex, katexOptions()]],
          ...admonitionsConfig,
        },

        blog: {
          editUrl: 'https://github.com/farlowdw/dwf/tree/master/',
          remarkPlugins: [remarkMath, remarkDropDownIc],
          rehypePlugins: [rehypeDropDownIc, [rehypeKatex, katexOptions()]],
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
            './shared/css/custom.scss',
            './src/css/site.scss',
            './src/css/buy-me-a-coffee.scss',
          ]
        },

        pages: {
          // No remark-math here: a `$` on a page is a dollar sign.
          remarkPlugins: [remarkDropDownIc],
          rehypePlugins: [rehypeDropDownIc, [rehypeKatex, katexOptions()]],
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
    'docusaurus-plugin-image-zoom',
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
        magicComments: MAGIC_COMMENTS,
        additionalLanguages: ADDITIONAL_LANGUAGES
      },
    }),
};

export default config;