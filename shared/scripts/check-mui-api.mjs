/**
 * scripts/check-mui-api.mjs: stops an old MUI API name from coming back. A site here runs MUI 9 and
 * the MUI X 9 grid, and lib/oldMuiApis.json lists what that move took out: removed props, slot props
 * and grid options. An old prop can fail without a word, because the component just ignores it, so a
 * plain search is worth having. It reads stylesheets too, so a row for an old class name finds it there.
 *
 * It reads a site's own code and pages and the shared/ folder it mounts (SCANNED_FOLDERS), tracked
 * and new files alike, and fails on any name in the list. It leaves out what only talks about an
 * old name:
 *   a comment line, a README, and a test folder, where a test proves a name is gone.
 * The rows sit in a JSON file, which it does not read, so this script is read like any other file.
 * Write no old name here outside a comment: this file would fail its own check, on every site.
 *
 * Run it from the site's top folder:
 *   node shared/scripts/check-mui-api.mjs
 *   node --test shared/scripts/__tests__/check-mui-api.test.mjs
 * The hub holds no site to read, so there it refuses. Its test mounts the hub's tree and reads that.
 *
 * A site runs it where it runs its other checks: first in its test script, or, with no test script,
 * first in netlify.toml's [build] command. A new site has it first in test:site, and shared:join writes
 * it first in shared:verify. It stays out of the test names on purpose, so a suite's count does not
 * move, and it takes under a second.
 *
 * Exit codes: 0 clean, 1 an old name was found, 2 refused because the check could not run. A check
 * that could not run is never a pass: no git repo, no files to read, or no list it can use.
 *
 * Flags:
 *   --root <folder>   the site's top folder, if it is not the current folder
 *   --help            print the flags and stop
 *
 * How to change it:
 *   another old name: add a row to lib/oldMuiApis.json. A row's name must match its own pattern, or
 *                     the check refuses, so a typo in a pattern cannot pass everything without a word
 *   a false hit: narrow that row's pattern, or take the row out
 *   another place to read: SCANNED_FOLDERS, SCANNED_ENDINGS
 *   another thing to leave out: SKIPPED_FOLDERS, SKIPPED_NAMES, COMMENT_LINE
 * It is published, so it names no site and no folder of one.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { counted } from './lib/phrases.mjs';

export const EXIT_CLEAN = 0;
export const EXIT_FOUND = 1;
export const EXIT_REFUSED = 2;

/** Each message starts with this, so a line in a long test run says where it came from. */
const LABEL = 'check-mui-api';

const USAGE = `Usage: node shared/scripts/check-mui-api.mjs [--root <folder>]
  --root <folder>   the site's top folder, if it is not the current folder
  --help            print this and stop`;

/** One row per old name: what it is called, how to find it, what to write now. */
const ROWS_FILE = fileURLToPath(new URL('./lib/oldMuiApis.json', import.meta.url));
const ROW_FIELDS = Object.freeze(['name', 'pattern', 'instead']);

/**
 * Where a site's own code and pages live, and shared/, the folder it mounts: a component there runs
 * in the site like any other. A folder a site does not have is skipped by git.
 */
const SCANNED_FOLDERS = Object.freeze(['src', 'plugins', 'docs', 'blog', 'shared']);

const SCANNED_ENDINGS = Object.freeze(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.md', '.mdx', '.css', '.scss']);

/** A test here may name an old API to prove it is gone. */
const SKIPPED_FOLDERS = Object.freeze(['__tests__']);

/** A README may name an old API to say what replaced it. */
const SKIPPED_NAMES = Object.freeze(['README.md']);

/** A line that starts as a comment, in code or a stylesheet. A comment after code on the same line still counts as code. */
const COMMENT_LINE = /^\s*(?:\*|\/\/|\/\*)/;

/** Asks git for the list, so build output and node_modules stay out. Tracked and new files both. */
const LIST_FILES = Object.freeze(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--']);

/** The file list of a large site is a few hundred KB. Past this limit git's output is cut off. */
const MAX_LIST_BYTES = 64 * 1024 * 1024;

/** The check could not run. Never a pass. */
class Refusal extends Error {}

/** The options from the command line. */
function readOptions(argv) {
  try {
    const options = { root: { type: 'string' }, help: { type: 'boolean' } };
    const { values } = parseArgs({ args: argv, options });
    return { root: path.resolve(values.root ?? process.cwd()), help: values.help === true };
  } catch (error) {
    throw new Refusal(error.message);
  }
}

/** The rows in a list file, unchecked. */
function parseRows(file) {
  try {
    const { rows } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    throw new Refusal(`cannot read the list of old names: ${error.message}`);
  }
}

/** One row with its pattern built. The g flag is there because a file can hold a name more than once. */
function compileRow(row) {
  const complete = ROW_FIELDS.every((field) => typeof row[field] === 'string' && row[field] !== '');
  if (!complete) throw new Refusal(`a row needs ${ROW_FIELDS.join(', ')}: ${JSON.stringify(row)}`);
  try {
    return { ...row, pattern: new RegExp(row.pattern, 'g') };
  } catch (error) {
    throw new Refusal(`row ${row.name}: ${error.message}`);
  }
}

/** The list, ready to run. An empty list would pass everything, so it refuses. */
export function readRows(file = ROWS_FILE) {
  const rows = parseRows(file);
  if (rows.length === 0) throw new Refusal('the list of old names is empty');
  return rows.map(compileRow);
}

/** The rows whose pattern misses their own name. Such a row would pass everything. */
export function rowsThatCannotMatch(rows) {
  return rows.filter((row) => row.name.search(row.pattern) === -1);
}

/** Whether one path from git is a file this check reads. */
export function isScanned(file) {
  const parts = file.split('/');
  const name = parts.at(-1);
  if (parts.some((part) => SKIPPED_FOLDERS.includes(part))) return false;
  if (SKIPPED_NAMES.includes(name)) return false;
  return SCANNED_ENDINGS.some((ending) => name.endsWith(ending));
}

/** The files to read, relative to the root, or null when git could not list them. */
function listFiles(root) {
  const result = spawnSync('git', [...LIST_FILES, ...SCANNED_FOLDERS], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_LIST_BYTES,
  });
  if (result.status !== 0) return null;
  return result.stdout.split('\0').filter(isScanned);
}

/** A file's text, or an empty string for a path git lists that is not a file on disk now. */
function readText(root, file) {
  const absolute = path.join(root, file);
  const stat = fs.statSync(absolute, { throwIfNoEntry: false });
  return stat?.isFile() ? fs.readFileSync(absolute, 'utf8') : '';
}

/** The whole line that holds a position in a text. */
function lineAt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? text.length : end);
}

/** The line number of a position in a text, from 1. */
function lineNumberAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Every old name in one file's text, comment lines left out. */
export function hitsIn(file, text, rows) {
  const hits = [];
  for (const row of rows) {
    for (const match of text.matchAll(row.pattern)) {
      if (COMMENT_LINE.test(lineAt(text, match.index))) continue;
      hits.push({ file, line: lineNumberAt(text, match.index), row });
    }
  }
  return hits;
}

/** What a run found, as the lines it prints. */
function reportHits(hits) {
  const lines = hits.map(({ file, line, row }) => `${LABEL}: ${file}:${line}: ${row.name} is an old MUI name. Use ${row.instead}.`);
  return [...lines, `${LABEL}: ${counted(hits.length, 'old MUI name')} found. The list is lib/oldMuiApis.json, the rules are in this script.`];
}

/** Reads the site at `root`. Returns { exitCode, lines }, or throws a Refusal. */
function checkSite(root) {
  const rows = readRows();
  const broken = rowsThatCannotMatch(rows);
  if (broken.length > 0) throw new Refusal(`a row misses its own name: ${broken.map((row) => row.name).join(', ')}`);

  const files = listFiles(root);
  if (files === null) throw new Refusal(`git could not list the files of ${path.basename(root)}`);
  if (files.length === 0) throw new Refusal(`no files to read in ${SCANNED_FOLDERS.join(', ')}`);

  const hits = files.flatMap((file) => hitsIn(file, readText(root, file), rows));
  if (hits.length > 0) return { exitCode: EXIT_FOUND, lines: reportHits(hits) };
  const clean = `${LABEL}: clean, ${counted(rows.length, 'name')} in ${counted(files.length, 'file')}`;
  return { exitCode: EXIT_CLEAN, lines: [clean] };
}

function main() {
  try {
    const { root, help } = readOptions(process.argv.slice(2));
    if (help) {
      console.log(USAGE);
      return;
    }
    const { exitCode, lines } = checkSite(root);
    const print = exitCode === EXIT_CLEAN ? console.log : console.error;
    lines.forEach((line) => print(line));
    process.exitCode = exitCode;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    console.error(`${LABEL}: refused: ${error.message}`);
    process.exitCode = EXIT_REFUSED;
  }
}

function isRunDirectly() {
  const script = process.argv[1];
  return Boolean(script) && fs.realpathSync(script) === fileURLToPath(import.meta.url);
}

if (isRunDirectly()) {
  main();
}
