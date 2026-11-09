/**
 * scripts/lib/compareDiff.mjs: turns two loads of a page into a result, and many results into one
 * verdict. It knows nothing of the browser or the disk, so every rule here has a plain test.
 *
 * The verdict is "0 changed", a list to read, or red when a page did not load. It is never a score:
 * every view of a site can read as changed from one navbar padding, so what a person reads is a list
 * of groups, one per selector, property and pair of values, each saying where it showed up.
 *
 * Elements are paired by position, so that only works while both pages have the same elements. When
 * the counts or the tags differ, pairing would blame thousands of elements for one removed block, so
 * that view says "structure changed, read by eye" and lists nothing.
 *
 * The two screenshots are compared too. A view whose elements read the same and whose pixels differ says
 * "pixels differ, open the two shots": the change is one the listed properties do not hold, such as new
 * words that leave every box the same size, and it is a list to read, never "0 changed".
 *
 * HOW TO CHANGE IT
 *   What counts as a change: compareSettings.mjs > COMPUTED_PROPERTIES and SUB_PIXEL_PROPERTIES.
 *   What a selector looks like: selectorOf. A new kind of view: VIEW, then `verdictOf`.
 */

import {
  COMPUTED_PROPERTIES, SELECTOR_CHARS, SELECTOR_CLASSES, SUB_PIXEL_PROPERTIES, SUB_PIXEL_TOLERANCE_PX, VIEWPORTS,
} from './compareSettings.mjs';

/** The window a view's name leaves unsaid. */
const DEFAULT_VIEWPORT = VIEWPORTS[0].name;

/** What a view came to. */
export const VIEW = Object.freeze({
  SAME: 'same',
  CHANGED: 'changed',
  STRUCTURE: 'structure changed, read by eye',
  PIXELS: 'pixels differ, open the two shots',
  FAILED: 'failed',
});

/** What a run came to. */
export const VERDICT = Object.freeze({
  NONE: '0 changed',
  READ: 'a list to read',
  RED: 'red',
});

const PIXELS = /^(-?\d+(?:\.\d+)?)px$/;

/** Docusaurus names a CSS module's class <local>_<4 characters>, and those differ between builds. */
const MODULE_CLASS = /^([A-Za-z][A-Za-z0-9-]*)_([A-Za-z0-9_-]{4})$/;

/** foo__bar is a plain name: a double underscore and a word, not a hash. */
const PLAIN_WORD_TAIL = /^_[a-z]+$/;

/** foo_ETCw becomes foo_. Other names stay as they are. */
function stableClass(name) {
  const match = MODULE_CLASS.exec(name);
  if (!match || PLAIN_WORD_TAIL.test(match[2])) return name;
  return `${match[1]}_`;
}

/** "div.col.col--4", from a row's tag and class text. */
export function selectorOf({ tag, classes }) {
  const names = classes.split(/\s+/).filter(Boolean).map(stableClass).slice(0, SELECTOR_CLASSES);
  return [tag, ...names].join('.').slice(0, SELECTOR_CHARS);
}

/** "379.984px" as a number, or null. */
function pixels(value) {
  const match = PIXELS.exec(value);
  return match ? Number(match[1]) : null;
}

/** True for a change that is only rounding. */
export function isSubPixel(property, before, after) {
  if (!SUB_PIXEL_PROPERTIES.has(property)) return false;
  const [a, b] = [pixels(before), pixels(after)];
  return a !== null && b !== null && Math.abs(a - b) < SUB_PIXEL_TOLERANCE_PX;
}

/** The first place the tags differ: { index, before, after }, or null when they never do. */
export function firstStructureDifference(beforeRows, afterRows) {
  const shared = Math.min(beforeRows.length, afterRows.length);
  for (let index = 0; index < shared; index += 1) {
    if (beforeRows[index].tag !== afterRows[index].tag) {
      return { index, before: selectorOf(beforeRows[index]), after: selectorOf(afterRows[index]) };
    }
  }
  return null;
}

/** Adds one element's changes to the groups. Returns whether it changed. */
function addElementChanges(groups, beforeRow, afterRow, stripValue) {
  let changed = false;
  COMPUTED_PROPERTIES.forEach((property, index) => {
    const before = stripValue(beforeRow.values[index], 'before');
    const after = stripValue(afterRow.values[index], 'after');
    if (before === after || isSubPixel(property, before, after)) return;
    changed = true;
    const selector = selectorOf(beforeRow);
    const key = JSON.stringify([selector, property, before, after]);
    const group = groups.get(key) ?? { selector, property, before, after, elements: 0 };
    group.elements += 1;
    groups.set(key, group);
  });
  return changed;
}

/** Pairs the elements of two equal structures: { changedElements, groups }, biggest group first. */
function pairElements(beforeRows, afterRows, stripValue) {
  const groups = new Map();
  let changedElements = 0;
  for (let index = 0; index < beforeRows.length; index += 1) {
    if (addElementChanges(groups, beforeRows[index], afterRows[index], stripValue)) changedElements += 1;
  }
  return { changedElements, groups: [...groups.values()].sort((a, b) => b.elements - a.elements) };
}

/** A function that takes each side's origin out of a value: a url() holds it. */
function originStripper(origins) {
  return (value, side) => (value.includes(origins[side]) ? value.replaceAll(origins[side], '') : value);
}

/** The red reasons of a view: 'before: ...', 'after: ...'. */
function failuresOf(before, after) {
  const named = [['before', before], ['after', after]].filter(([, load]) => load.failure !== null);
  return named.map(([side, load]) => `${side}: ${load.failure}`);
}

/** The notes of a view, each with its side. */
function notesOf(before, after) {
  const side = (name, load) => load.notes.map((note) => `${name}: ${note}`);
  return [...side('before', before), ...side('after', after)];
}

/** True when the shots were compared and differ. A count of null means they differ by an unknown amount. */
function pixelsDiffer(pixels) {
  return Boolean(pixels?.compared) && pixels.differing !== 0;
}

/** The kind of a view both sides could read. */
function kindOf({ structure, changedElements, onlyBefore, onlyAfter, pixels }) {
  if (structure) return VIEW.STRUCTURE;
  const quiet = changedElements === 0 && onlyBefore.length === 0 && onlyAfter.length === 0;
  if (!quiet) return VIEW.CHANGED;
  return pixelsDiffer(pixels) ? VIEW.PIXELS : VIEW.SAME;
}

/** A shot that could not be compared, as a note. */
function pixelNotes(pixels) {
  return pixels && !pixels.compared ? ['screenshots not compared: one is missing or is no PNG'] : [];
}

/**
 * The two loads of a page in a theme and a window, as one result. Only numbers and text: it goes in the
 * report. `pixels` is what comparePixels said about the two shots, and `shots` their two files.
 */
export function diffView({ pagePath, theme, viewport = null, before, after, origins, pixels = null, shots = null }) {
  const base = {
    pagePath, theme, viewport, elementsBefore: before.total, elementsAfter: after.total,
    changedElements: 0, groups: [], firstDifference: null, onlyBefore: [], onlyAfter: [], pixels, shots,
    failures: failuresOf(before, after), notes: [...notesOf(before, after), ...pixelNotes(pixels)],
  };
  if (base.failures.length > 0) return { ...base, kind: VIEW.FAILED };
  const firstDifference = firstStructureDifference(before.rows, after.rows);
  const structure = before.total !== after.total || firstDifference !== null;
  const paired = structure ? { changedElements: 0, groups: [] } : pairElements(before.rows, after.rows, originStripper(origins));
  const onlyBefore = before.console.filter((message) => !after.console.includes(message));
  const onlyAfter = after.console.filter((message) => !before.console.includes(message));
  const parts = { structure, firstDifference, ...paired, onlyBefore, onlyAfter };
  return { ...base, ...parts, kind: kindOf({ ...parts, pixels }) };
}

/** "/docs/intro/ dark", and "/docs/intro/ dark phone" for any window but the first. */
export function viewName({ pagePath, theme, viewport = null }) {
  const window = viewport === null || viewport === undefined || viewport === DEFAULT_VIEWPORT ? '' : ` ${viewport}`;
  return `${pagePath} ${theme}${window}`;
}

/** The same change across every view: one row, saying where. Widest first, then biggest. */
export function mergeGroups(views) {
  const merged = new Map();
  for (const view of views) {
    for (const { selector, property, before, after, elements } of view.groups) {
      const key = JSON.stringify([selector, property, before, after]);
      const group = merged.get(key) ?? { selector, property, before, after, elements: 0, views: [] };
      group.elements += elements;
      group.views.push(viewName(view));
      merged.set(key, group);
    }
  }
  return [...merged.values()].sort((a, b) => b.views.length - a.views.length || b.elements - a.elements);
}

/** One word for the run. A view that did not load is red, whatever the others say. */
export function verdictOf(views) {
  if (views.some((view) => view.kind === VIEW.FAILED)) return VERDICT.RED;
  return views.every((view) => view.kind === VIEW.SAME) ? VERDICT.NONE : VERDICT.READ;
}
