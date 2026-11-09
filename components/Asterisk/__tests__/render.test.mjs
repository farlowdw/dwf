/**
 * render.test.mjs: <Asterisk> (../index.jsx) rendered on the server through the shared render hooks
 * (__tests__/renderHooks.mjs), as the site renders every page at build time:
 *   - the mark is a raised [*] in a link, with the help cursor, and the aside its tooltip's words;
 *   - `symbol` and `cursor` change the mark and the cursor;
 *   - the link takes the light blue in light mode and the dark blue in dark mode.
 * To change it: a new prop or case of ../index.jsx gets a test here. Run with `npm run test:shared`, or on its own
 * with `node --test "shared/components/Asterisk/__tests__/*.test.mjs"` in a site.
 */

import { register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('../../../__tests__/renderHooks.mjs', import.meta.url);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { COLOR_MODE_KEY } = await import('../../../__tests__/renderHooks.mjs');
const { default: Asterisk } = await import('../index.jsx');

const render = (props, children) => renderToStaticMarkup(createElement(Asterisk, props, children));

/** The rules emotion writes for the link, from a render. */
function linkRules(html) {
  return [...html.matchAll(/<style data-emotion="css [^"]*MuiLink[^"]*">([^<]*)<\/style>/g)].map((match) => match[1]).join('');
}

test('the mark is a raised [*] in a link, and the aside its tooltip', () => {
  const html = render({}, 'the aside');
  const mark = html.match(/<span [^>]*>/)[0];
  assert.match(mark, /style="cursor:help;vertical-align:super;margin-left:1px;font-size:0\.75em"/);
  assert.match(mark, /aria-label="the aside"/);
  assert.match(html, /<a class="[^"]*MuiLink-root[^"]*">\[\*\]<\/a>/);
});

test('symbol and cursor change the mark and the cursor', () => {
  const html = render({ symbol: '†', cursor: 'pointer' }, 'the aside');
  assert.match(html, /style="cursor:pointer;/);
  assert.match(html, />†<\/a>/);
});

test('the link takes the blue of the colour mode', (t) => {
  t.after(() => { delete globalThis[COLOR_MODE_KEY]; });
  assert.match(linkRules(render({}, 'x')), /color:#0676c8/);
  globalThis[COLOR_MODE_KEY] = 'dark';
  assert.match(linkRules(render({}, 'x')), /color:#48adf6/);
});
