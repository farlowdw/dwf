/**
 * render.test.mjs: <BibRef> (../index.jsx) rendered on the server through the shared render hooks
 * (__tests__/renderHooks.mjs), as the site renders every page at build time:
 *   - a citation of a listed item is [n], n its place in the sorted list, linking to the list page at
 *     /docs/reference-list#n, or at the stub's `listPath`;
 *   - a hidden item is found too, and links to its own address as [∗] or its refSymbol;
 *   - an id no item has reads ITEM NOT FOUND;
 *   - listAll prints every item that is not hidden, in order, each under an h4 whose id the citations name.
 * To change it: a new prop or case of ../index.jsx gets a test here. Run with `npm run test:shared`, or on its own
 * with `node --test "shared/components/BibRef/__tests__/*.test.mjs"` in a site.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('../../../__tests__/renderHooks.mjs', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: BibRef, REFERENCE_LIST_PATH } = await import('../index.jsx');

/** A small bibliography: two items listed out of order, and one hidden. */
const BIB_ITEMS = {
  books: [
    { id: 'second', title: 'Zebra Notes', author: 'Bea Author' },
    { id: 'first', title: 'Aardvark Notes', author: 'Abe Author', link: 'https://example.com/a' },
  ],
  hidden: [{ id: 'aside', title: 'An Aside', hidden: true, link: 'https://example.com/aside' }],
};

const render = (props) => renderToStaticMarkup(createElement(BibRef, { bibItems: BIB_ITEMS, ...props }));

test('a citation links to its place on the list page', () => {
  assert.equal(REFERENCE_LIST_PATH, '/docs/reference-list');
  assert.match(render({ id: 'first' }), /<a href="\/docs\/reference-list#1"[^>]*>\[1\]<\/a>/);
  assert.match(render({ id: 'second' }), /<a href="\/docs\/reference-list#2"[^>]*>\[2\]<\/a>/);
});

test('a site whose list page lives elsewhere names it with listPath', () => {
  const html = render({ id: 'second', listPath: '/docs/reference/citations' });
  assert.match(html, /<a href="\/docs\/reference\/citations#2"[^>]*>\[2\]<\/a>/);
  assert.doesNotMatch(html, /reference-list/);
});

test('a hidden item is found, and links to its own address', () => {
  const html = render({ id: 'aside' });
  assert.match(html, /<a href="https:\/\/example\.com\/aside" target="_blank"[^>]*>\[∗\]<\/a>/);
  assert.match(render({ id: 'aside', refSymbol: '†' }), />\[†\]<\/a>/);
});

test('an id no item has reads ITEM NOT FOUND', () => {
  assert.match(render({ id: 'missing' }), /ITEM NOT FOUND/);
  assert.match(renderToStaticMarkup(createElement(BibRef, { id: 'first' })), /ITEM NOT FOUND/);
});

test('listAll prints the items that are not hidden, in order, under the ids the citations name', () => {
  const html = render({ listAll: true });
  assert.deepEqual([...html.matchAll(/<h4 id="(\d+)" class="bibHeader">\[(\d+)\]<\/h4>/g)].map((match) => match[1]), ['1', '2']);
  assert.ok(html.indexOf('Aardvark Notes') < html.indexOf('Zebra Notes'), html);
  assert.doesNotMatch(html, /An Aside/);
});
