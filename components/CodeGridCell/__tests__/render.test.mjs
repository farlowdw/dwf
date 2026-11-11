/**
 * render.test.mjs: <CodeGridCell> (../index.jsx) rendered on the server through the shared render hooks
 * (__tests__/renderHooks.mjs), as the site renders every page at build time:
 *   - in light mode the cell takes the light code background, --color-gray-4, and scrolls sideways;
 *   - in dark mode it takes the dark one, --color-gray-86;
 *   - each background's fallback is the value css/custom.scss gives its token, so a page without the shared
 *     stylesheet draws the same colour;
 *   - the cell's code comes out inside it;
 *   - `styles` adds to the cell's styles, and wins where it names one the cell has.
 * To change it: a new prop or case of ../index.jsx gets a test here. Run with `npm run test:shared`, or on its own
 * with `node --test "shared/components/CodeGridCell/__tests__/*.test.mjs"` in a site.
 */

import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('../../../__tests__/renderHooks.mjs', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { COLOR_MODE_KEY } = await import('../../../__tests__/renderHooks.mjs');
const { default: CodeGridCell } = await import('../index.jsx');

/** The stylesheet that defines the gray tokens, in shared/. */
const TOKENS_FILE = new URL('../../../css/custom.scss', import.meta.url);

/** A background as React writes it: the token, then its fallback. */
const BACKGROUND = /background-color:var\((--color-gray-[\w-]+), ([^)]+)\)/;

const render = (props, children) => renderToStaticMarkup(createElement(CodeGridCell, props, children));

/** The cell's background in one colour mode: its token and fallback. */
function backgroundIn(mode) {
  globalThis[COLOR_MODE_KEY] = mode;
  try {
    const [, token, fallback] = render({}, 'x').match(BACKGROUND);
    return { token, fallback };
  } finally {
    delete globalThis[COLOR_MODE_KEY];
  }
}

/** The value css/custom.scss gives a token, or null. */
function definedValue(token) {
  const definition = readFileSync(TOKENS_FILE, 'utf8').match(new RegExp(`(?<![\\w-])${token}\\s*:\\s*([^;]+);`));
  return definition ? definition[1].trim() : null;
}

test('in light mode the cell takes the light code background and scrolls sideways', () => {
  assert.equal(render({}, 'x'), '<div style="background-color:var(--color-gray-4, #f3f5f7);overflow:auto;max-width:100%">x</div>');
});

test('in dark mode the cell takes the dark code background', (t) => {
  t.after(() => { delete globalThis[COLOR_MODE_KEY]; });
  globalThis[COLOR_MODE_KEY] = 'dark';
  assert.equal(render({}, 'x'), '<div style="background-color:var(--color-gray-86, #1c262f);overflow:auto;max-width:100%">x</div>');
});

test('each background\'s fallback is the value css/custom.scss gives its token', () => {
  for (const mode of ['light', 'dark']) {
    const { token, fallback } = backgroundIn(mode);
    assert.equal(fallback, definedValue(token), `${mode}: ${token}`);
  }
});

test('the cell\'s code comes out inside it', () => {
  const code = createElement('pre', null, 'print(1)');
  assert.match(render({}, code), /^<div style="[^"]*"><pre>print\(1\)<\/pre><\/div>$/);
});

test('styles adds to the cell\'s styles, and wins where it names one the cell has', () => {
  const html = render({ styles: { overflow: 'hidden', padding: '4px' } }, 'x');
  assert.match(html, /style="background-color:var\(--color-gray-4, #f3f5f7\);overflow:hidden;max-width:100%;padding:4px"/);
});
