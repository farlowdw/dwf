/**
 * check-mui-api.mjs: stops an old MUI API name from coming back. The site moved to MUI 9 and the
 * MUI X 9 grid, and OLD_APIS lists what that move took out. An old prop can fail without a word,
 * because the component just ignores it, so a plain search for the names is worth having.
 *
 * It reads the site's own code and pages and the shared/ folder a site mounts (SCANNED_FOLDERS),
 * tracked and new files alike, and fails on any name in OLD_APIS. It leaves out what only talks
 * about an old name:
 *   a comment line, a README, and a test folder, where a test proves a name is gone.
 *
 * Run it from the repo's top folder:
 *   node scripts/check-mui-api.mjs
 * Each site runs it where it runs its other checks: first in `npm run test:site`, or, on a site
 * with no test script, first in netlify.toml's [build] command. It stays out of the test names on
 * purpose, so a suite's count does not move, and it takes under a second.
 *
 * Exit codes: 0 clean, 1 an old name was found, 2 refused because the check could not run. A check
 * that could not run is never a pass: no git repo, no files to read, or a row that cannot match.
 *
 * Flags:
 *   --root <folder>   the repo's top folder, if it is not the current folder
 *
 * How to change it:
 *   another old name: add a row to OLD_APIS. A row's name must match its own pattern, or the check
 *                     refuses, so a typo in a pattern cannot pass everything without a word
 *   a false hit: narrow that row's pattern, or take the row out
 *   another place to read: SCANNED_FOLDERS, SCANNED_ENDINGS
 *   another thing to leave out: SKIPPED_FOLDERS, SKIPPED_NAMES, COMMENT_LINE
 * The file is the same on every site that has it, so change it on each. It is published, so it
 * names no site and no folder of one.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const EXIT_CLEAN = 0;
const EXIT_FOUND = 1;
const EXIT_REFUSED = 2;

/** Each message starts with this, so a line in a long test run says where it came from. */
const LABEL = 'check-mui-api';

/**
 * One row per old name: what it is called, how to find it, what to write now. Patterns carry the g
 * flag, because a file can hold a name more than once, and they run over a whole file, so \s can
 * cross a line break.
 */
const OLD_APIS = Object.freeze([
  { name: 'componentsProps', pattern: /\bcomponentsProps\b/g, instead: 'slotProps' },
  { name: 'components={{', pattern: /\bcomponents=\{\{/g, instead: 'slots={{' },
  { name: '<Grid item', pattern: /<Grid\s+item\b/g, instead: '<Grid size={...}>' },
  { name: 'GridToolbar', pattern: /\bGridToolbar\w*/g, instead: "showToolbar, or the grid's Toolbar parts" },
  { name: 'useDemoData', pattern: /\buseDemoData\b/g, instead: 'rows and columns written in the page' },
  { name: 'pageSize=', pattern: /\bpageSize=/g, instead: 'initialState.pagination.paginationModel' },
  { name: 'rowsPerPageOptions', pattern: /\browsPerPageOptions\b/g, instead: 'pageSizeOptions' },
  { name: 'disableSelectionOnClick', pattern: /\bdisableSelectionOnClick\b/g, instead: 'disableRowSelectionOnClick' },
  { name: 'experimentalFeatures', pattern: /\bexperimentalFeatures\b/g, instead: 'nothing: the feature is standard now' },
  { name: 'getActions', pattern: /\bgetActions\b/g, instead: 'renderCell with GridActionsCell' },
  { name: 'valueGetter: (params', pattern: /\bvalueGetter:\s*\(params\b/g, instead: 'valueGetter: (value, row) =>' },
]);

/**
 * Where the site's own code and pages live, and shared/, the folder a site mounts: a component there
 * runs in the site like any other. A folder a site does not have is skipped by git.
 */
const SCANNED_FOLDERS = Object.freeze(['src', 'plugins', 'docs', 'blog', 'shared']);

const SCANNED_ENDINGS = Object.freeze(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.md', '.mdx']);

/** A test here may name an old API to prove it is gone. */
const SKIPPED_FOLDERS = Object.freeze(['__tests__']);

/** A README may name an old API to say what replaced it. */
const SKIPPED_NAMES = Object.freeze(['README.md']);

/** A line that starts as a comment. A comment after code on the same line still counts as code. */
const COMMENT_LINE = /^\s*(?:\*|\/\/|\/\*)/;

/** Asks git for the list, so build output and node_modules stay out. Tracked and new files both. */
const LIST_FILES = Object.freeze(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--']);

/** The file list of a large site is a few hundred KB. Past this limit git's output is cut off. */
const MAX_LIST_BYTES = 64 * 1024 * 1024;

/** Stops the run with a reason. Never a pass. */
function refuse(reason) {
  console.error(`${LABEL}: refused: ${reason}`);
  process.exit(EXIT_REFUSED);
}

/** The repo's top folder, from --root or the current folder. */
function readRoot() {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' } } });
    return path.resolve(values.root ?? process.cwd());
  } catch (error) {
    return refuse(error.message);
  }
}

/** The rows whose pattern misses their own name. Such a row would pass everything. */
function rowsThatCannotMatch() {
  return OLD_APIS.filter((row) => row.name.search(row.pattern) === -1);
}

/** Whether one path from git is a file this check reads. */
function isScanned(file) {
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
function hitsIn(file, text) {
  const hits = [];
  for (const row of OLD_APIS) {
    for (const match of text.matchAll(row.pattern)) {
      if (COMMENT_LINE.test(lineAt(text, match.index))) continue;
      hits.push({ file, line: lineNumberAt(text, match.index), row });
    }
  }
  return hits;
}

function main() {
  const root = readRoot();
  const broken = rowsThatCannotMatch();
  if (broken.length > 0) refuse(`a row misses its own name: ${broken.map((row) => row.name).join(', ')}`);

  const files = listFiles(root);
  if (files === null) refuse(`git could not list the files of ${path.basename(root)}`);
  if (files.length === 0) refuse(`no files to read in ${SCANNED_FOLDERS.join(', ')}`);

  const hits = files.flatMap((file) => hitsIn(file, readText(root, file)));
  for (const { file, line, row } of hits) {
    console.error(`${LABEL}: ${file}:${line}: ${row.name} is an old MUI name. Use ${row.instead}.`);
  }
  if (hits.length > 0) {
    console.error(`${LABEL}: ${hits.length} old MUI name(s) found. The list and its rules are in this script.`);
    process.exit(EXIT_FOUND);
  }
  console.log(`${LABEL}: clean, ${OLD_APIS.length} names in ${files.length} files`);
  process.exit(EXIT_CLEAN);
}

main();
