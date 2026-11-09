/**
 * scripts/__tests__/compareDiff.test.mjs: the rules of a comparison, on made-up loads, so no browser
 * is needed. The four changes from the first version of this tool each have a test: a page that did
 * not load is red, a changed structure says so, rounding is ignored, and the verdict is never a score.
 *
 * HOW TO CHANGE IT
 *   A new rule in lib/compareDiff.mjs gets a test here. `load` and `row` build a side by hand.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VERDICT, VIEW, diffView, firstStructureDifference, isSubPixel, mergeGroups, selectorOf, verdictOf,
} from '../lib/compareDiff.mjs';
import { COMPUTED_PROPERTIES } from '../lib/compareSettings.mjs';

const ORIGINS = { before: 'http://127.0.0.1:4001', after: 'http://127.0.0.1:4002' };

/** A row with every property at 'x', apart from `changes`. */
function row(tag = 'div', classes = '', changes = {}) {
  return { tag, classes, values: COMPUTED_PROPERTIES.map((property) => changes[property] ?? 'x') };
}

/** One side of a view. */
function load(rows, extra = {}) {
  return { failure: null, total: rows.length, rows, console: [], notes: [], ...extra };
}

function diff(before, after) {
  return diffView({ pagePath: '/', theme: 'dark', before, after, origins: ORIGINS });
}

test('the list holds 37 properties, the ones a hidden, turned or moved element changes among them', () => {
  assert.equal(COMPUTED_PROPERTIES.length, 37);
  assert.equal(new Set(COMPUTED_PROPERTIES).size, 37);
  for (const name of ['visibility', 'fontStyle', 'textAlign', 'transform', 'height', 'flexDirection']) {
    assert.ok(COMPUTED_PROPERTIES.includes(name), name);
  }
});

test('elements that read the same with shots that differ are a list to read, never 0 changed', () => {
  const same = () => load([row(), row('p')]);
  const pixels = { compared: true, differing: 2733, total: 3072000 };
  const view = diffView({ pagePath: '/', theme: 'dark', viewport: 'phone', before: same(), after: same(), origins: ORIGINS, pixels });
  assert.equal(view.kind, VIEW.PIXELS);
  assert.equal(verdictOf([view]), VERDICT.READ);
  const equal = diffView({ pagePath: '/', theme: 'dark', before: same(), after: same(), origins: ORIGINS, pixels: { ...pixels, differing: 0 } });
  assert.equal(equal.kind, VIEW.SAME);
  const unknown = diffView({ pagePath: '/', theme: 'dark', before: same(), after: same(), origins: ORIGINS, pixels: { ...pixels, differing: null } });
  assert.equal(unknown.kind, VIEW.PIXELS, 'shots that differ by an unknown amount still differ');
  const missing = diffView({ pagePath: '/', theme: 'dark', before: same(), after: same(), origins: ORIGINS, pixels: { compared: false, differing: null, total: null } });
  assert.equal(missing.kind, VIEW.SAME);
  assert.ok(missing.notes.some((note) => note.includes('screenshots not compared')), missing.notes.join('; '));
});

test('two equal loads are the same', () => {
  const view = diff(load([row(), row('p')]), load([row(), row('p')]));
  assert.equal(view.kind, VIEW.SAME);
  assert.deepEqual(view.groups, []);
  assert.equal(view.changedElements, 0);
});

test('a changed value lands in a group of its selector, property and pair of values', () => {
  const before = load([row('a', 'link', { color: 'red' }), row('a', 'link', { color: 'red' }), row('p')]);
  const after = load([row('a', 'link', { color: 'blue' }), row('a', 'link', { color: 'blue' }), row('p')]);
  const view = diff(before, after);
  assert.equal(view.kind, VIEW.CHANGED);
  assert.equal(view.changedElements, 2);
  assert.deepEqual(view.groups, [{ selector: 'a.link', property: 'color', before: 'red', after: 'blue', elements: 2 }]);
});

test('one element with two changes counts once, and makes two groups', () => {
  const view = diff(load([row('a', '', { color: 'red', opacity: '1' })]), load([row('a', '', { color: 'blue', opacity: '0.5' })]));
  assert.equal(view.changedElements, 1);
  assert.equal(view.groups.length, 2);
});

test('rounding of a width is ignored, a whole pixel is not, and other properties stay exact', () => {
  assert.equal(isSubPixel('width', '379.984px', '380px'), true);
  assert.equal(isSubPixel('width', '380px', '379.984px'), true);
  assert.equal(isSubPixel('width', '380px', '381px'), false);
  assert.equal(isSubPixel('width', 'auto', '380px'), false);
  assert.equal(isSubPixel('paddingLeft', '16px', '16.5px'), false);
  const view = diff(load([row('div', '', { width: '379.984px' })]), load([row('div', '', { width: '380px' })]));
  assert.equal(view.kind, VIEW.SAME);
  const real = diff(load([row('div', '', { width: '378px' })]), load([row('div', '', { width: '380px' })]));
  assert.equal(real.kind, VIEW.CHANGED);
});

test('each side\'s own port is left out of a url(), so two ports read as one page', () => {
  const image = (origin) => ({ backgroundImage: `url("${origin}/img/a.png")` });
  const view = diff(load([row('div', '', image(ORIGINS.before))]), load([row('div', '', image(ORIGINS.after))]));
  assert.equal(view.kind, VIEW.SAME);
  const other = diff(load([row('div', '', image(ORIGINS.before))]), load([row('div', '', { backgroundImage: `url("${ORIGINS.after}/img/b.png")` })]));
  assert.equal(other.groups[0].before, 'url("/img/a.png")');
  assert.equal(other.groups[0].after, 'url("/img/b.png")');
});

test('different element counts say structure changed and blame no element', () => {
  const before = load([row(), row('p'), row('p'), row('p')]);
  const after = load([row(), row('p', '', { color: 'red' })]);
  const view = diff(before, after);
  assert.equal(view.kind, VIEW.STRUCTURE);
  assert.equal(view.kind, 'structure changed, read by eye');
  assert.deepEqual(view.groups, []);
  assert.equal(view.changedElements, 0);
  assert.deepEqual([view.elementsBefore, view.elementsAfter], [4, 2]);
});

test('equal counts with other tags are a changed structure too, and it says where', () => {
  const view = diff(load([row('div'), row('p', 'lead')]), load([row('div'), row('h2', 'title')]));
  assert.equal(view.kind, VIEW.STRUCTURE);
  assert.deepEqual(view.firstDifference, { index: 1, before: 'p.lead', after: 'h2.title' });
  assert.equal(firstStructureDifference([row('a')], [row('a'), row('b')]), null);
});

test('a total past the elements read still counts as a changed structure', () => {
  const view = diff(load([row()], { total: 50 }), load([row()], { total: 49 }));
  assert.equal(view.kind, VIEW.STRUCTURE);
});

test('a load that failed is a failed view, on either side and on both', () => {
  const dead = load([], { failure: 'net::ERR_CONNECTION_REFUSED' });
  assert.deepEqual(diff(dead, load([row()])).failures, ['before: net::ERR_CONNECTION_REFUSED']);
  assert.equal(diff(dead, load([row()])).kind, VIEW.FAILED);
  assert.equal(diff(load([row()]), dead).kind, VIEW.FAILED);
  const both = diff(dead, dead);
  assert.equal(both.kind, VIEW.FAILED);
  assert.equal(both.failures.length, 2);
});

test('a console line on one side only is a change, and on both sides it is not', () => {
  const view = diff(load([row()], { console: ['old', 'shared'] }), load([row()], { console: ['shared', 'new'] }));
  assert.equal(view.kind, VIEW.CHANGED);
  assert.deepEqual(view.onlyBefore, ['old']);
  assert.deepEqual(view.onlyAfter, ['new']);
  assert.equal(diff(load([row()], { console: ['shared'] }), load([row()], { console: ['shared'] })).kind, VIEW.SAME);
});

test('notes keep their side', () => {
  const view = diff(load([row()], { notes: ['fonts not settled'] }), load([row()]));
  assert.deepEqual(view.notes, ['before: fonts not settled']);
  assert.equal(view.kind, VIEW.SAME);
});

test('a selector drops the hash of a CSS module and keeps plain names', () => {
  assert.equal(selectorOf({ tag: 'div', classes: '' }), 'div');
  assert.equal(selectorOf({ tag: 'div', classes: 'col col--4' }), 'div.col.col--4');
  assert.equal(selectorOf({ tag: 'a', classes: 'menu__link navbar__item' }), 'a.menu__link.navbar__item');
  assert.equal(selectorOf({ tag: 'li', classes: 'codeLine_lJS_ tocItem_ab1X' }), 'li.codeLine_.tocItem_');
  assert.equal(selectorOf({ tag: 'p', classes: 'foo__bar' }), 'p.foo__bar');
  assert.equal(selectorOf({ tag: 'p', classes: 'a b c d e' }), 'p.a.b.c');
});

test('one change across views is one row that says where, the widest first', () => {
  const shared = { selector: 'nav', property: 'paddingLeft', before: '16px', after: '24px', elements: 1 };
  const local = { selector: 'p', property: 'color', before: 'red', after: 'blue', elements: 90 };
  const views = [
    { pagePath: '/', theme: 'dark', groups: [shared] },
    { pagePath: '/', theme: 'light', groups: [shared, local] },
  ];
  const [first, second] = mergeGroups(views);
  assert.equal(first.selector, 'nav');
  assert.equal(first.elements, 2);
  assert.deepEqual(first.views, ['/ dark', '/ light']);
  assert.equal(second.selector, 'p');
});

test('the verdict is 0 changed, a list to read or red, and red wins', () => {
  const view = (kind) => ({ kind });
  assert.equal(verdictOf([view(VIEW.SAME), view(VIEW.SAME)]), VERDICT.NONE);
  assert.equal(verdictOf([view(VIEW.SAME), view(VIEW.CHANGED)]), VERDICT.READ);
  assert.equal(verdictOf([view(VIEW.STRUCTURE)]), VERDICT.READ);
  assert.equal(verdictOf([view(VIEW.CHANGED), view(VIEW.FAILED)]), VERDICT.RED);
  assert.equal(VERDICT.NONE, '0 changed');
});
