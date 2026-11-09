/**
 * scripts/__tests__/onePlace.test.mjs: a value lives in one place. Over every script at the top of scripts/
 * and in scripts/lib/, a top-level constant or function whose name and whole text stand in a second file is
 * a copy: change one and the other stays behind. So is a list or a map that a second file holds under
 * another name. The copy imports the value instead: lib/settings.mjs holds the names every script shares,
 * lib/phrases.mjs the wording, lib/exitCodes.mjs the codes and the signals. It reads text and needs no git.
 *
 * HOW TO CHANGE IT
 *   Two files that must keep the same text apart on purpose: a row in SEPARATE_ON_PURPOSE, with the reason.
 *   A row that no longer names a copy goes red too, so the list stays true. What counts as a list or a map:
 *   STRUCTURED_VALUE. From the hub: node --test scripts/__tests__/onePlace.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/** The scripts folder this test sits in: scripts/ in the hub, shared/scripts in a site. */
const SCRIPTS_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIB_FOLDER = 'lib';
const SCRIPT_FILE = /\.mjs$/;

/** A top-level constant, and a top-level function. Both start at the line's first column. */
const CONSTANT_START = /^(?:export )?const (\w+) = /;
const FUNCTION_START = /^(?:export )?(?:async )?function (\w+)\(/;

/** A value that holds a list or a map: the same one under two names is still one value. */
const STRUCTURED_VALUE = /^(?:Object\.freeze\(|new (?:Set|Map)\(|\[)/;

const OWN_OPTIONS = 'each command names its own options, and may rename one without the others';
const BUILD_CHECK_CODES = 'the three build checks are run by their path, and each documents its own three exit codes';
const TIME_STAMP = 'shared:bump and shared:all each name their own folder from the time';

/**
 * Names whose text two files hold on purpose, each with the reason. A name here covers every file that
 * holds it, so a third copy needs no new row: read the reason first.
 */
const SEPARATE_ON_PURPOSE = Object.freeze({
  HELP_FLAG: OWN_OPTIONS,
  CHECK_FLAG: OWN_OPTIONS,
  OFFLINE_FLAG: OWN_OPTIONS,
  YES_FLAG: OWN_OPTIONS,
  FLAGS: "the same words over each file's own VALUE_FLAGS",
  usageError: "the same words over each file's own USAGE",
  WHOLE_NUMBER: 'each command checks the numbers typed after it',
  EXIT_CLEAN: BUILD_CHECK_CODES,
  EXIT_FOUND: BUILD_CHECK_CODES,
  EXIT_REFUSED: BUILD_CHECK_CODES,
  isRunDirectly: "each build check asks whether it was run itself: the answer reads that file's own address",
  SHARED_ROOT: "each script's own folder, worked out from where the file sits",
  require: "each file's own require, made from that file's own address",
  DEFAULT_INDENT: 'join.mjs and lib/bumpLock.mjs each write package.json, and read its indent by their own rules',
  PIN_LABEL: 'allPin.mjs names its own step. allStatus.mjs reads the label lib/checks.mjs spells in place, '
    + 'where readme.test.mjs reads it',
  POLL_MS: "two unrelated waits, a page's and a process's, that happen to poll as often",
  FIELD_SEPARATOR: 'each file writes its own git format and splits what it wrote: the separator goes with it',
  NOT_A_DIGIT: TIME_STAMP,
  STAMP_DIGITS: TIME_STAMP,
});

/** The scripts the test reads, as paths from the scripts folder. */
function scriptFiles(root) {
  const inFolder = (folder) => fs.readdirSync(path.join(root, folder))
    .filter((name) => SCRIPT_FILE.test(name))
    .map((name) => path.join(folder, name));
  return [...inFolder(''), ...inFolder(LIB_FOLDER)].sort();
}

/** Where a constant's statement ends: its own line, or the first line after it that ends with a semicolon. */
function constantEnd(lines, start) {
  let end = start;
  while (end < lines.length - 1 && !lines[end].trimEnd().endsWith(';') && lines[end].trim() !== '') end += 1;
  return end;
}

/** Where a function ends: the first closing brace in the line's first column. */
function functionEnd(lines, start) {
  let end = start;
  while (end < lines.length - 1 && lines[end] !== '}') end += 1;
  return end;
}

/** Every top-level constant and function of a text, as { name, text, value }. `value` is a constant's text after `=`. */
function definitionsOf(source) {
  const lines = source.split('\n');
  const found = [];
  lines.forEach((line, index) => {
    const constant = CONSTANT_START.exec(line);
    const named = constant ?? FUNCTION_START.exec(line);
    if (named === null) return;
    const end = constant ? constantEnd(lines, index) : functionEnd(lines, index);
    const text = lines.slice(index, end + 1).join('\n').replace(/^export /, '');
    const value = constant ? text.slice(text.indexOf(' = ') + 3) : null;
    found.push({ name: named[1], text, value });
  });
  return found;
}

/** Adds an entry's name and file under `key`. A list held under one name is found by both keys, and counted once. */
function addTo(map, key, entry) {
  if (!map.has(key)) map.set(key, { names: new Set(), files: new Set() });
  map.get(key).names.add(entry.name);
  map.get(key).files.add(entry.file);
}

/**
 * The copies across files: [{ names, files }] for each text that two or more files hold, by name and
 * text, or by a structured value alone. `sources` maps a file to its text.
 */
function copiesOf(sources) {
  const byText = new Map();
  for (const [file, source] of Object.entries(sources)) {
    for (const definition of definitionsOf(source)) {
      const entry = { ...definition, file };
      addTo(byText, `text ${definition.text}`, entry);
      const structured = definition.value !== null && STRUCTURED_VALUE.test(definition.value);
      if (structured) addTo(byText, `value ${definition.value}`, entry);
    }
  }
  const copies = [...byText.values()]
    .filter(({ files }) => files.size > 1)
    .map(({ names, files }) => ({ names: [...names].sort(), files: [...files].sort() }));
  const once = new Map(copies.map((copy) => [JSON.stringify(copy), copy]));
  return [...once.values()];
}

/** The scripts' own copies. */
function realCopies() {
  const read = (file) => [file, fs.readFileSync(path.join(SCRIPTS_ROOT, file), 'utf8')];
  return copiesOf(Object.fromEntries(scriptFiles(SCRIPTS_ROOT).map(read)));
}

/** True when every name of a copy is kept apart on purpose. */
const onPurpose = ({ names }) => names.every((name) => Object.hasOwn(SEPARATE_ON_PURPOSE, name));

/** "NAME in a.mjs, b.mjs" for a message. */
const described = ({ names, files }) => `${names.join(' / ')} in ${files.join(', ')}`;

test('the copy finder sees a constant or a function written the same in two files, and a map under two names', () => {
  const first = [
    'export const LIMIT = 12;',
    'const CODES = Object.freeze({', '  ONE: 1,', '});',
    'function cut(list) {', '  return list.slice(0, LIMIT);', '}',
    "const OWN = 'a';",
  ];
  const second = [
    'const LIMIT = 12;',
    'export const SIGNALS = Object.freeze({', '  ONE: 1,', '});',
    'export function cut(list) {', '  return list.slice(0, LIMIT);', '}',
    "const OWN = 'b';",
  ];
  const copies = copiesOf({ 'a.mjs': first.join('\n'), 'b.mjs': second.join('\n') });
  assert.deepEqual(copies.map(described).sort(), [
    'CODES / SIGNALS in a.mjs, b.mjs',
    'LIMIT in a.mjs, b.mjs',
    'cut in a.mjs, b.mjs',
  ]);
});

test('no value of the scripts is written in two files, apart from the ones kept apart on purpose', () => {
  const copies = realCopies().filter((copy) => !onPurpose(copy)).map(described);
  const fix = 'import the value from the file that holds it, or add a row with its reason to SEPARATE_ON_PURPOSE';
  assert.deepEqual(copies, [], fix);
});

test('every value kept apart on purpose still stands in two files', () => {
  const kept = new Set(realCopies().flatMap(({ names }) => names));
  const stale = Object.keys(SEPARATE_ON_PURPOSE).filter((name) => !kept.has(name));
  assert.deepEqual(stale, [], 'take these rows out of SEPARATE_ON_PURPOSE: no second copy is left');
});
