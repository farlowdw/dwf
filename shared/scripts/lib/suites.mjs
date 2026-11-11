/**
 * scripts/lib/suites.mjs: works out what `test:shared` runs in a site, what it leaves out and why.
 *
 * A suite is a test folder named in requirements.cjs, from shared/. Three lists name them:
 *   ALWAYS_SUITES   every site runs them
 *   a row's suites  run when the site uses that piece; requirements.mjs decides, for all four kinds
 *   SCRIPT_SUITES   the scripts' own real-git suites, 6 to 8 minutes on a quiet machine and more under
 *                   load: on --scripts, or when shared/scripts differs from the hub commit the site
 *                   recorded, so a plain test:shared after a pull that changed shared/scripts takes that long
 *
 * The files are listed here and given to `node --test` by name, never as a glob, because a glob that
 * matches nothing exits 0. So a suite with no test files is a problem, and so is a test file in no
 * suite or one node would drop: nothing would run it, and no line would say so. A file named the way
 * node's own runner names a test, x-test.mjs or x.test.mts say, that TEST_FILE does not take, is a
 * problem too: it looks like a test and never runs. A suite is its folder's own files, not those of
 * folders inside it, so a row lists each folder.
 *
 * HOW TO CHANGE IT
 *   A new suite is a row's `suites` in requirements.cjs, not a change here. TEST_FILE holds the
 *   formats, OTHER_TEST_NAME node's other names for a test. NOT_WALKED holds the folders no suite lives in.
 */

import fs from 'node:fs';
import path from 'node:path';
import { git, gitValue } from './git.mjs';
import { short } from './phrases.mjs';
import { tableProblems } from './requirements.mjs';
import { PREFIX, SCRIPTS_FOLDER } from './settings.mjs';
import { hubRecords, pickRecorded, readRecords } from './state.mjs';

const TEST_FILE = /\.test\.(?:cjs|mjs|js)$/;

/**
 * The other names node's runner takes for a test: -test, _test, a test- start, and the TypeScript endings.
 * A bare test.mjs is left out: scripts/test.mjs is no test.
 */
const OTHER_TEST_NAME = /(?:[-_]test\.[cm]?[jt]s|\.test\.[cm]?ts|^test-.+\.[cm]?[jt]s)$/;

/** Folders that hold no suites. A new site's files in template/ are that site's own. */
const NOT_WALKED = new Set(['.git', 'node_modules', 'template']);

/**
 * node reads every path it is given as a pattern. A file named x[1].test.js matches nothing, and node
 * drops it without a word, so a name like that is a problem and not a test.
 */
const PATTERN_CHARACTER = /[*?[\]{}()!]/;


/** The words for those suites in a report line. */
export const SCRIPTS_SUITES = "the scripts' own suites";

/** How a line about a skipped run says what to do. */
const SCRIPTS_COMMAND = 'npm run test:shared -- --scripts';

/** The test files of one folder, from the shared root, sorted. A missing folder has none. */
export function testFilesIn(sharedRoot, folder) {
  const absolute = path.join(sharedRoot, folder);
  if (!fs.existsSync(absolute)) return [];
  const names = fs.readdirSync(absolute).filter((name) => TEST_FILE.test(name));
  return names.sort().map((name) => path.posix.join(folder, name));
}

/** Every file below a folder of the shared root whose name passes `matches`. */
function filesNamed(sharedRoot, matches, folder = '') {
  const entries = fs.readdirSync(path.join(sharedRoot, folder), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const inner = path.posix.join(folder, entry.name);
    if (entry.isDirectory()) return NOT_WALKED.has(entry.name) ? [] : filesNamed(sharedRoot, matches, inner);
    return matches(entry.name) ? [inner] : [];
  });
}

/** Every test file below a folder of the shared root. */
export function allTestFiles(sharedRoot, folder = '') {
  return filesNamed(sharedRoot, (name) => TEST_FILE.test(name), folder);
}

/** Every file node would take for a test and test:shared never runs. */
export function strayTestFiles(sharedRoot, folder = '') {
  return filesNamed(sharedRoot, (name) => OTHER_TEST_NAME.test(name) && !TEST_FILE.test(name), folder);
}

/** Whether shared/scripts has moved on from the hub: { run, why }. It only reads. */
export function readScriptsChange(root, env = process.env) {
  const folder = `${PREFIX}/${SCRIPTS_FOLDER}`;
  const options = { cwd: root, env, read: true };
  const uncommitted = git(['status', '--porcelain', '--', folder], options).stdout.trim() !== '';
  if (uncommitted) return { run: true, why: `${SCRIPTS_SUITES}: ${folder} has uncommitted changes` };
  const records = hubRecords(readRecords(root, env));
  const recorded = records.length > 0 ? pickRecorded(root, records, env) : { known: false };
  if (!recorded.known) {
    return { run: false, why: `${SCRIPTS_SUITES}: the hub commit this site recorded is not here to compare. To run them: ${SCRIPTS_COMMAND}` };
  }
  const here = gitValue(['rev-parse', '--verify', '--quiet', `HEAD:${folder}`], options);
  const there = gitValue(['rev-parse', '--verify', '--quiet', `${recorded.sha}:${SCRIPTS_FOLDER}`], options);
  if (here !== there) return { run: true, why: `${SCRIPTS_SUITES}: ${folder} differs from the hub commit this site recorded` };
  const hub = short(recorded.sha);
  return { run: false, why: `${SCRIPTS_SUITES}: ${folder} matches hub ${hub}, the commit this site recorded, so the hub's own run of them covers it. To run them: ${SCRIPTS_COMMAND}` };
}

/** How the way a site reaches a piece reads in a sentence. */
function useWords(row) {
  if (row.stub) return { has: `its stub ${row.stub} is here`, lacks: `this site has no ${row.stub}` };
  if (row.configText) {
    return { has: `docusaurus.config.js names ${row.configText}`, lacks: `docusaurus.config.js does not name ${row.configText}` };
  }
  return { has: `a client module imports ${row.clientImport}`, lacks: `no client module imports ${row.clientImport}` };
}

/** One decision per suite of a piece. A used piece runs, even with its stub missing. */
function pieceDecisions({ row, used, missingStub }) {
  const words = useWords(row);
  const has = missingStub ? `in use, but its stub ${row.stub} is missing` : words.has;
  const why = `${row.name}: ${used ? has : words.lacks}`;
  return (row.suites ?? []).map((folder) => ({ folder, run: used, why }));
}

/** The first decision for each folder, in order. */
function oncePerFolder(decisions) {
  const byFolder = new Map();
  for (const decision of decisions) {
    if (!byFolder.has(decision.folder)) byFolder.set(decision.folder, decision);
  }
  return [...byFolder.values()];
}

/** What disagrees between the table and the folder. */
function folderProblems(sharedRoot, folders) {
  const listed = new Set(folders.flatMap((folder) => testFilesIn(sharedRoot, folder)));
  const empty = folders.filter((folder) => testFilesIn(sharedRoot, folder).length === 0);
  const orphans = allTestFiles(sharedRoot).filter((file) => !listed.has(file));
  const patterns = [...listed].filter((file) => PATTERN_CHARACTER.test(file));
  const strays = strayTestFiles(sharedRoot);
  return [
    ...empty.map((folder) => `${folder} is named in requirements.cjs and holds no test files`),
    ...orphans.map((file) => `${file} is in no suite of requirements.cjs, so nothing runs it`),
    ...patterns.map((file) => `${file}: node reads this name as a pattern and drops the file, so rename it`),
    ...strays.map((file) => `${file} is named like a test, and test:shared runs only .test.cjs, .test.mjs and .test.js files: rename it`),
  ];
}

/**
 * What to run and what to leave out. `pieces` come from readPieces, `scripts` from
 * readScriptsChange. Returns { runs: [{ folder, why, files }], skips: [{ folder, why }], problems }.
 * Two rows may name one folder: it runs when either piece is in use, and it runs once.
 */
export function planSuites({ sharedRoot, table, pieces, scripts }) {
  const always = table.ALWAYS_SUITES.map((folder) => ({ folder, run: true, why: 'every site runs it' }));
  const own = table.SCRIPT_SUITES.map((folder) => ({ folder, ...scripts }));
  const decisions = [...always, ...pieces.flatMap(pieceDecisions), ...own];
  const running = oncePerFolder(decisions.filter(({ run }) => run));
  const runFolders = new Set(running.map(({ folder }) => folder));
  const left = oncePerFolder(decisions).filter(({ folder }) => !runFolders.has(folder));
  const folders = oncePerFolder(decisions).map(({ folder }) => folder);
  return {
    runs: running.map(({ folder, why }) => ({ folder, why, files: testFilesIn(sharedRoot, folder) })),
    skips: left.map(({ folder, why }) => ({ folder, why })),
    problems: [...tableProblems(table), ...folderProblems(sharedRoot, folders)],
  };
}
