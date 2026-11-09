// @ts-check
/*
 * docusaurus.config.js: the site's configuration: its title and address, the docs, blog and pages, the
 * plugins, the navbar and the footer. The lists every site of the family repeats (admonition keywords,
 * KaTeX options, <DropDownIC>'s MDX plugins, Prism's languages) come from shared/wiring/index.cjs, and
 * shared/ also holds the stylesheets, fonts and icons (customCss, staticDirectories). This site's own
 * rules go in src/css/site.scss. plugins/katex-css serves KaTeX's stylesheet and fonts from the site.
 *
 * HOW TO CHANGE IT
 *   The title, address and repository: the three constants below. A list from shared/wiring: edit it
 *   there and roll it out (shared/README.md). A keyword of this site only: add ADMONITION_KEYWORDS to the
 *   require below, then, in the docs, blog and pages blocks, write
 *   `admonitions: { keywords: [...ADMONITION_KEYWORDS, 'mine'] }` in place of `...admonitionsConfig`.
 *   Its component and colours: shared/README.md > When one site needs something different.
 *   Navbar items: themeConfig.navbar.items. The options of Docusaurus itself:
 *   https://docusaurus.io/docs/api/docusaurus-config
 *   Paths here stay relative strings, for Docusaurus to resolve. This config ships in the public main
 *   bundle, so require.resolve would publish this machine's absolute path there.
 * (`@type` JSDoc annotations below give editor autocompletion with `@ts-check`.)
 */

import { themes as prismThemes } from 'prism-react-renderer';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
// The lists every site shares, and the inline dropdown's MDX plugins (<DropDownIC>).
const {
  ADDITIONAL_LANGUAGES, MAGIC_COMMENTS, admonitionsConfig, katexOptions,
  preprocessDropDownIc, rehypeDropDownIc, remarkDropDownIc,
} = require('./shared/wiring/index.cjs');

const SITE_TITLE = '__SITE_TITLE__';
const SITE_URL = '__SITE_URL__';
const GITHUB_REPO_URL = 'https://github.com/__SITE_REPO__';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: SITE_TITLE,
  tagline: 'Notes, kept in one place',
  favicon: 'img/logo.svg',
  url: SITE_URL,
  baseUrl: '/',
  onBrokenLinks: 'throw',

  // shared/static holds the fonts and icons every site serves; both folders land at the site's root.
  staticDirectories: ['static', 'shared/static'],

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    // Rewrites a <DropDownIC> opened mid-sentence around a body of blocks into a form MDX parses.
    preprocessor: preprocessDropDownIc,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
      onBrokenMarkdownImages: 'throw',
    },
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: `${GITHUB_REPO_URL}/tree/master/`,
          remarkPlugins: [remarkMath, remarkDropDownIc],
          rehypePlugins: [rehypeDropDownIc, [rehypeKatex, katexOptions()]],
          ...admonitionsConfig,
        },

        blog: {
          editUrl: `${GITHUB_REPO_URL}/tree/master/`,
          remarkPlugins: [remarkMath, remarkDropDownIc],
          rehypePlugins: [rehypeDropDownIc, [rehypeKatex, katexOptions()]],
          postsPerPage: 'ALL',
          blogSidebarCount: 0,
          showReadingTime: false,
          ...admonitionsConfig,
        },

        pages: {
          remarkPlugins: [remarkMath, remarkDropDownIc],
          rehypePlugins: [rehypeDropDownIc, [rehypeKatex, katexOptions()]],
          ...admonitionsConfig,
        },

        theme: {
          customCss: [
            './shared/css/custom.scss',
            './src/css/site.scss',
          ],
        },
      }),
    ],
  ],

  plugins: [
    'docusaurus-plugin-sass',
    './plugins/katex-css',
    '@docusaurus/theme-mermaid',
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
        title: SITE_TITLE,
        logo: {
          alt: `${SITE_TITLE} logo`,
          src: 'img/logo.svg',
        },
        hideOnScroll: true,
        items: [
          { to: '/docs/intro', label: 'Notes', position: 'left', activeBaseRegex: '^/docs(/|$)' },
          { to: '/blog', label: 'Blog', position: 'left' },
          {
            href: GITHUB_REPO_URL,
            position: 'right',
            className: 'header-github-link',
            'aria-label': 'Visit GitHub repository',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Site',
            items: [
              { to: '/docs/intro', label: 'Notes' },
              { to: '/blog', label: 'Blog' },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} ${SITE_TITLE}`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        // A magic comment gives the lines it marks a class, drawn by shared/css/_code-blocks.scss.
        magicComments: MAGIC_COMMENTS,
        additionalLanguages: ADDITIONAL_LANGUAGES,
      },
    }),
};

export default config;
