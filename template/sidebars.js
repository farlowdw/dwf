/**
 * sidebars.js: the docs sidebar (/docs), in the order listed here.
 *
 * HOW TO CHANGE IT
 *   A page: add its doc id, which is its path under docs/ without the extension. A group of pages: a
 *   category, with at least one item, as Docusaurus refuses an empty one:
 *
 *     { type: 'category', label: 'Books', collapsed: true, items: ['books/first-book'] },
 *
 *   BibRef's links land on reference-list, so that page stays on the site.
 */

// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    'intro',
    'examples',
    'reference-list',
  ],
};

export default sidebars;
