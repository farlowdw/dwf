/**
 * src/components/BibRef/bibliography.js: this site's sources, one group per kind. The stub beside this file
 * hands them to the shared <BibRef>. These two are examples: docs/examples.mdx cites the first.
 *
 * HOW TO CHANGE IT  A source: a row { id, title, author?, time?, link?, hidden? } in a group. A note names it
 * by `id`. A group's name is yours: the list on /docs/reference-list sorts by author, then title.
 */

const bibliography = {
  books: [
    { id: 'example-book', title: 'An Example Book', author: 'Author, Ann', time: '2024' },
  ],
  articles: [
    { id: 'example-article', title: 'An Example Article', author: 'Writer, Will', time: '2025', link: 'https://example.com/' },
  ],
};

export default bibliography;
