/**
 * render.test.mjs: <LC> (../index.jsx) rendered on the server through the shared render hooks
 * (__tests__/renderHooks.mjs), as the site renders every page at build time:
 *   - a problem by its number reads "LC n" and links to LeetCode; type="long" adds its title;
 *   - a number written as a string, as a note's id="713" is, finds the same problem;
 *   - `local` links to the site's own page for it, /docs/<hundreds>/<n>;
 *   - children give the link a tooltip, and the link keeps its words;
 *   - a number no problem has reads LEETCODE PROBLEM REFERENCE NOT FOUND.
 * To change it: a new prop or case of ../index.jsx gets a test here. Run with `npm run test:shared`, or on its own
 * with `node --test "shared/components/LC/__tests__/*.test.mjs"` in a site.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('../../../__tests__/renderHooks.mjs', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: LC } = await import('../index.jsx');

const render = (props, children) => renderToStaticMarkup(createElement(LC, props, children));

test('a problem by its number reads LC n and links to LeetCode', () => {
  assert.equal(render({ id: 1 }), '<a href="https://leetcode.com/problems/two-sum" target="_blank">LC 1</a>');
  assert.match(render({ id: 1, type: 'long' }), />LC 1\. Two Sum<\/a>/);
});

test('a number written as a string finds the same problem', () => {
  assert.equal(render({ id: '1' }), render({ id: 1 }));
});

test('local links to the site\'s own page for the problem', () => {
  assert.match(render({ id: 1, local: true }), /<a href="\/docs\/1-99\/1" style="color:#fc6c85" target="_blank">/);
  assert.match(render({ id: '713', local: true }), /<a href="\/docs\/700-799\/713"/);
});

test('children give the link a tooltip, and the link keeps its words', () => {
  const html = render({ id: 1 }, 'an aside');
  assert.match(html, /<a href="https:\/\/leetcode\.com\/problems\/two-sum"[^>]*aria-label="an aside"[^>]*>LC 1<\/a>/);
});

test('a number no problem has reads NOT FOUND', () => {
  assert.match(render({ id: 0 }), /LEETCODE PROBLEM REFERENCE NOT FOUND/);
});
