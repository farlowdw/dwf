/**
 * render.test.mjs: <CodeGrid> (../index.jsx) rendered on the server through the shared render hooks
 * (__tests__/renderHooks.mjs), as the site renders every page at build time:
 *   - the grid is one div with the layout every grid gets: columns of 275 px or more, rows of equal height, the
 *     gaps and the margin below, written in that order;
 *   - its cells come out inside it, in their order;
 *   - `styles` adds to the grid's styles, and wins where it names one the grid has.
 * To change it: a new prop or case of ../index.jsx gets a test here. Run with `npm run test:shared`, or on its own
 * with `node --test "shared/components/CodeGrid/__tests__/*.test.mjs"` in a site.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('../../../__tests__/renderHooks.mjs', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: CodeGrid } = await import('../index.jsx');

/** The style every grid gets, as React writes it into the page. */
const GRID_STYLE = 'width:100%;display:grid;grid-template-columns:repeat(auto-fit, minmax(275px, 1fr));'
  + 'grid-auto-rows:1fr;grid-row-gap:1em;grid-column-gap:5px;align-content:start;margin-bottom:1em';

const render = (props, ...children) => renderToStaticMarkup(createElement(CodeGrid, props, ...children));

test('the grid is one div with the layout every grid gets', () => {
  assert.equal(render({}), `<div style="${GRID_STYLE}"></div>`);
});

test('its cells come out inside it, in their order', () => {
  const cells = ['one', 'two', 'three'].map((word) => createElement('div', { key: word }, word));
  assert.equal(render({}, ...cells), `<div style="${GRID_STYLE}"><div>one</div><div>two</div><div>three</div></div>`);
});

test('styles adds to the grid\'s styles, and wins where it names one the grid has', () => {
  const html = render({ styles: { marginBottom: '2em', fontSize: '0.9em' } });
  assert.match(html, /margin-bottom:2em;font-size:0\.9em"/);
  assert.doesNotMatch(html, /margin-bottom:1em/);
  assert.match(html, /^<div style="width:100%;display:grid;grid-template-columns:repeat\(auto-fit, minmax\(275px, 1fr\)\);/);
});
