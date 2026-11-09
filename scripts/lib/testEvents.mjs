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
 * HOW TO CHANGE IT
 *   A new fact to read: a field in lineOf, and its reading in readEvents. KEPT_EVENTS are the event kinds
 *   written.
 */

import fs from 'node:fs';

/** The events written: a test's end, either way, and the run's totals. */
const KEPT_EVENTS = new Set(['test:pass', 'test:fail', 'test:summary']);

/** One event as the line written for it. */
function lineOf({ type, data }) {
  const { name, nesting, file, skip, todo, counts } = data ?? {};
  return `${JSON.stringify({ type, name, nesting, file, skip: skip !== undefined && skip !== false, todo, counts })}\n`;
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

/**
 * What the events say about the planned files: { finished, emptyFiles, skipped }. `files` are the paths as
 * node was given them, from `root`. A file whose only top-level test is named by its own path holds no
 * test, and so does one node never reported. `finished` is false when node wrote no totals: then nothing
 * is said about the files.
 */
export function readEvents(eventsFile, files, root) {
  const events = eventsIn(eventsFile);
  const totals = events.filter(({ type, file }) => type === 'test:summary' && file === undefined).at(-1);
  if (totals === undefined) return { finished: false, emptyFiles: [], skipped: 0 };
  const ends = events.filter(({ type, nesting, file }) => type !== 'test:summary' && nesting === 0 && file);
  const byFile = new Map();
  for (const event of ends) {
    const key = realPath(event.file);
    byFile.set(key, [...(byFile.get(key) ?? []), event]);
  }
  const emptyFiles = files.filter((file) => {
    const own = byFile.get(realPath(`${root}/${file}`)) ?? [];
    return own.every((event) => event.name === file);
  });
  return { finished: true, emptyFiles, skipped: totals.counts?.skipped ?? 0 };
}
