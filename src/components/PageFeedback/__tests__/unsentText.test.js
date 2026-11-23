/**
 * unsentText.test.js: the page-feedback card's "unsent text" registry (../unsentText.js), which
 * src/clientModules/buildIdReload.js asks before it reloads a tab after a deploy: one flag per
 * holder, released independently, and a file that does nothing at load. Run with
 * `node --test src/components/PageFeedback/__tests__/unsentText.test.js`; package.json >
 * shared:verify names this file.
 *
 * HOW TO CHANGE IT  A new rule of the registry gets a test here. That the reloader asks it is
 * tested in scripts/site-files.test.mjs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasUnsentText, resetUnsentText, setUnsentText } from '../unsentText.js';

/** The registry's own code, read as text, without its comments (the header names `window`). */
const CODE = readFileSync(new URL('../unsentText.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('the registry is set while any holder is registered', () => {
  resetUnsentText();
  const first = {};
  const second = {};
  assert.equal(hasUnsentText(), false);
  setUnsentText(first, true);
  setUnsentText(second, true);
  setUnsentText(first, true); // registering twice is harmless
  assert.equal(hasUnsentText(), true);
  setUnsentText(first, false);
  assert.equal(hasUnsentText(), true, 'the other card still holds text');
  setUnsentText(second, false);
  assert.equal(hasUnsentText(), false);
  setUnsentText(second, false); // releasing twice is harmless
  assert.equal(hasUnsentText(), false);
});

test('a holder that was never registered can be released', () => {
  resetUnsentText();
  setUnsentText({}, false);
  assert.equal(hasUnsentText(), false);
});

test('resetUnsentText forgets every holder', () => {
  setUnsentText({}, true);
  setUnsentText({}, true);
  assert.equal(hasUnsentText(), true);
  resetUnsentText();
  assert.equal(hasUnsentText(), false);
});

test('the file imports nothing and touches no browser object, so the reloader can load it on every page', () => {
  assert.doesNotMatch(CODE, /^\s*import\b/m, 'no import');
  assert.doesNotMatch(CODE, /\b(window|document|globalThis|localStorage|sessionStorage|addEventListener)\b/, 'no browser object');
});
