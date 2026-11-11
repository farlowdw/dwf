/**
 * scripts/lib/testEvents.mjs: a reporter for node's test runner that writes each finished test, and the
 * run's totals, as one JSON line. `test:shared` hands it to node beside the spec reporter, with a file of
 * its own as the destination, and reads that file afterwards: which planned file held no test, and how many
 * tests node skipped. The spec reporter stays what a person reads.
 *
 *     node --test --test-reporter=spec --test-reporter-destination=stdout \
 *       --test-reporter=<this file> --test-reporter-destination=<events file> <files>
 *
 * Node names a file that holds no test as one passing test, named by the path it was given, at the top
 * level. readEvents knows that shape, on Node 22 and on Node 24.
 *
 * It also names the tests that ran out of time: a test node failed at its limit (Node 24 times each test), and a
 * test that began and never ended because node stopped its whole file at the limit (Node 22 times each file, and
 * says only the file's path). Node writes a test's start (test:dequeue) the moment it begins, so the line is in
 * the file even when the file's process is stopped.
 *
 * HOW TO CHANGE IT
 *   A new fact to read: a field in lineOf, and its reading in readEvents. KEPT_EVENTS are the event kinds
 *   written. What counts as out of time is TIMEOUT_FAILURE and outOfTime.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The events written: a test's start, its end either way, and the run's totals. */
const KEPT_EVENTS = new Set(['test:dequeue', 'test:pass', 'test:fail', 'test:summary']);

/** A test's end, either way. */
const END_EVENTS = new Set(['test:pass', 'test:fail']);

/** What node calls a test, or a whole file, failed at its time limit. */
const TIMEOUT_FAILURE = 'testTimeoutFailure';

/** One event as the line written for it. */
function lineOf({ type, data }) {
  const { name, nesting, file, skip, todo, counts, details } = data ?? {};
  const timedOut = details?.error?.failureType === TIMEOUT_FAILURE;
  return `${JSON.stringify({ type, name, nesting, file, skip: skip !== undefined && skip !== false, todo, counts, timedOut })}\n`;
}

/** The reporter node loads: every kept event, one line each. */
export default async function* report(source) {
  for await (const event of source) {
    if (KEPT_EVENTS.has(event.type)) yield lineOf(event);
  }
}

/** The lines of an events file, or none when node wrote none. */
function eventsIn(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/** A path as the disk has it, so /var and /private/var on a Mac read as one. */
function realPath(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

/** A test's place: its file, its depth and its name. */
function keyOf({ file, nesting, name }) {
  return JSON.stringify([file ? realPath(file) : '', nesting, name]);
}

/** True for node's own entry for a whole test file: it is named by the path node was given. */
function isWholeFile(event, root) {
  return Boolean(event.file) && typeof event.name === 'string' && realPath(path.resolve(root, event.name)) === realPath(event.file);
}

/** "<file>: <name>", the file from `root`. */
function placeOf(event, root) {
  return `${path.relative(root, realPath(event.file))}: ${event.name}`;
}

/**
 * The tests that ran out of time: each one node failed at its limit, and each one that began and never ended
 * (node stopped its file). A whole file failed at its limit is not a name of its own, the test running in it is;
 * a file stopped before any of its tests began reads as the file alone.
 */
function outOfTime(events, root) {
  const tests = events.filter((event) => event.file && !isWholeFile(event, root));
  const open = new Map();
  for (const event of tests) {
    const key = keyOf(event);
    const count = open.get(key)?.count ?? 0;
    if (event.type === 'test:dequeue') open.set(key, { event, count: count + 1 });
    else if (END_EVENTS.has(event.type) && open.has(key)) open.set(key, { event: open.get(key).event, count: count - 1 });
  }
  const named = tests.filter((event) => event.type === 'test:fail' && event.timedOut).map((event) => placeOf(event, root));
  for (const { event, count } of open.values()) {
    if (count > 0) named.push(`${placeOf(event, root)} (began and did not end)`);
  }
  const stopped = events.filter((event) => event.type === 'test:fail' && event.timedOut && isWholeFile(event, root));
  for (const event of stopped) {
    const file = path.relative(root, realPath(event.file));
    if (!named.some((line) => line.startsWith(`${file}: `))) named.push(`${file}: the whole file, before a test of it began`);
  }
  return named;
}

/**
 * What the events say about the planned files: { finished, emptyFiles, skipped, outOfTime }. `files` are the paths
 * as node was given them, from `root`. A file whose only top-level test is named by its own path holds no
 * test, and so does one node never reported. `finished` is false when node wrote no totals: then nothing
 * is said about the files. `outOfTime` names the tests that ran out of time, whether node finished or not.
 */
export function readEvents(eventsFile, files, root) {
  const events = eventsIn(eventsFile);
  const late = outOfTime(events, root);
  const totals = events.filter(({ type, file }) => type === 'test:summary' && file === undefined).at(-1);
  if (totals === undefined) return { finished: false, emptyFiles: [], skipped: 0, outOfTime: late };
  const ends = events.filter(({ type, nesting, file }) => END_EVENTS.has(type) && nesting === 0 && file);
  const byFile = new Map();
  for (const event of ends) {
    const key = realPath(event.file);
    byFile.set(key, [...(byFile.get(key) ?? []), event]);
  }
  const emptyFiles = files.filter((file) => {
    const own = byFile.get(realPath(`${root}/${file}`)) ?? [];
    return own.every((event) => event.name === file);
  });
  return { finished: true, emptyFiles, skipped: totals.counts?.skipped ?? 0, outOfTime: late };
}
