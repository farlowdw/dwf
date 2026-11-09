/**
 * scripts/lib/compareReport.mjs: what `shared:compare` prints, and report.json beside the screenshots.
 * A line per view as it finishes, then the verdict. A list prints each group once, however many views
 * it showed up on, because the groups are what a person reads.
 *
 * report.json is written after every view with `state` running, then done or stopped, so a detached
 * run can be followed by reading it. `writeReport` replaces it in one step, so a reader never sees half.
 *
 * HOW TO CHANGE IT
 *   The wording is here. How much a list prints: compareSettings.mjs > PRINTED_*. What the file holds
 *   is whatever the caller hands in.
 */

import fs from 'node:fs';
import path from 'node:path';
import { VIEW, VERDICT, mergeGroups, viewName } from './compareDiff.mjs';
import { PRINTED_GROUPS, PRINTED_PIXEL_VIEWS, PRINTED_VALUE_CHARS, PRINTED_VIEWS } from './compareSettings.mjs';
import { counted } from './phrases.mjs';

/** The file a run writes beside its screenshots. shared:bump and shared:all read it back. */
export const REPORT_FILE = 'report.json';

/** The elements of a view, or the two counts when they differ. */
function elementCount({ elementsBefore, elementsAfter }) {
  const after = counted(elementsAfter, 'element');
  return elementsBefore === elementsAfter ? after : `${elementsBefore} -> ${after}`;
}

/** "1,234 of 3,072,000 pixels", or "an unknown number of pixels". */
function pixelCount({ differing, total }) {
  if (differing === null) return 'an unknown number of pixels';
  return `${differing.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pixels`;
}

/** The words after a view's name. */
function viewOutcome(view) {
  if (view.kind === VIEW.FAILED) return `FAILED ${view.failures.join('; ')}`;
  if (view.kind === VIEW.STRUCTURE) return `${VIEW.STRUCTURE}, ${elementCount(view)}`;
  if (view.kind === VIEW.CHANGED) return `changed, ${view.changedElements} of ${elementCount(view)}`;
  if (view.kind === VIEW.PIXELS) return `${VIEW.PIXELS}: ${pixelCount(view.pixels)}, ${elementCount(view)}`;
  return `same, ${elementCount(view)}`;
}

/** The line printed when a view finishes, then one line per note. */
export function viewLines(view) {
  return [`${viewName(view)}: ${viewOutcome(view)}`, ...view.notes.map((note) => `  note ${note}`)];
}

function shortValue(value) {
  return value.length > PRINTED_VALUE_CHARS ? `${value.slice(0, PRINTED_VALUE_CHARS)}...` : value;
}

/** "/ dark, / light and 6 more views". */
function whereLine(views) {
  const named = views.slice(0, PRINTED_VIEWS).join(', ');
  const rest = views.length - PRINTED_VIEWS;
  return rest > 0 ? `${named} and ${rest} more` : named;
}

/** Two lines for a group. */
function groupLines({ selector, property, before, after, elements, views }) {
  return [
    `  ${selector} | ${property}: ${shortValue(before)} -> ${shortValue(after)}`,
    `    ${counted(elements, 'element')}: ${whereLine(views)}`,
  ];
}

function groupSection(views) {
  const groups = mergeGroups(views);
  if (groups.length === 0) return [];
  const rest = groups.length - PRINTED_GROUPS;
  const tail = rest > 0 ? [`  and ${rest} more groups in ${REPORT_FILE}`] : [];
  return ['Changes, the widest first:', ...groups.slice(0, PRINTED_GROUPS).flatMap(groupLines), ...tail];
}

function structureLine(view) {
  const place = view.firstDifference;
  const where = place ? `: first at element ${place.index}, ${place.before} -> ${place.after}` : '';
  return `  ${viewName(view)}, ${elementCount(view)}${where}`;
}

function structureSection(views) {
  const found = views.filter((view) => view.kind === VIEW.STRUCTURE);
  if (found.length === 0) return [];
  return [`${VIEW.STRUCTURE}. Open both screenshots:`, ...found.map(structureLine)];
}

/** Every view whose pixels differ, with its two shots, whatever else it showed. */
function pixelSection(views) {
  const found = views.filter((view) => view.pixels?.compared && view.pixels.differing !== 0);
  if (found.length === 0) return [];
  const listed = found.slice(0, PRINTED_PIXEL_VIEWS).map((view) => {
    const shots = view.shots ? `: ${view.shots.before} and ${view.shots.after}` : '';
    return `  ${viewName(view)}, ${pixelCount(view.pixels)}${shots}`;
  });
  const rest = found.length - PRINTED_PIXEL_VIEWS;
  const tail = rest > 0 ? [`  and ${rest} more views in ${REPORT_FILE}`] : [];
  return ['Pixels that differ. Open the two shots:', ...listed, ...tail];
}

/** New and gone console lines of every view. */
function consoleSection(views) {
  const lines = views.flatMap((view) => [
    ...view.onlyAfter.map((message) => `  ${viewName(view)}, new: ${message}`),
    ...view.onlyBefore.map((message) => `  ${viewName(view)}, gone: ${message}`),
  ]);
  return lines.length === 0 ? [] : ['Console messages that differ:', ...lines];
}

function failedSection(views) {
  const failed = views.filter((view) => view.kind === VIEW.FAILED);
  if (failed.length === 0) return [];
  return ['Did not load:', ...failed.map((view) => `  ${viewName(view)}: ${view.failures.join('; ')}`)];
}

/** Everything after the view lines, ending in the verdict. */
export function summaryLines({ views, verdict, browser, out }) {
  const read = verdict === VERDICT.NONE ? [] : [
    ...failedSection(views),
    ...structureSection(views),
    ...groupSection(views),
    ...pixelSection(views),
    ...consoleSection(views),
  ];
  const last = `${browser}, ${counted(views.length, 'view')}. Screenshots and ${REPORT_FILE}: ${out}`;
  return [...read, last, verdict];
}

/** Writes the report in one step. */
export function writeReport(out, report) {
  const file = path.join(out, REPORT_FILE);
  const partial = `${file}.part`;
  fs.writeFileSync(partial, `${JSON.stringify(report, null, 1)}\n`);
  fs.renameSync(partial, file);
}
