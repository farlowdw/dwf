/**
 * scripts/lib/requirements.mjs: reads shared/requirements.cjs against one site. Which pieces does the
 * site use, is a stub missing, and does its lock hold the packages they need? `shared:status` prints
 * the answers and `test:shared` picks its suites from the same pieces.
 *
 * A piece has one of five kinds, and the kind says how a site reaches it (USE_BY_KIND below):
 *   component, theme   a stub file. A site uses it when the stub exists or when its evidence says so,
 *                      so a deleted stub reads as an error, not as "not used". Evidence is a config line,
 *                      a docs pattern, a pattern over the site's own code under src/ (srcPattern), or a
 *                      client module's import (clientImport). It is read only while the stub is missing,
 *                      the cheapest kind first: a site with its stubs in place reads no docs for them.
 *   plugin             a line in docusaurus.config.js
 *   library            an import in a client module, under src/clientModules
 *   script             a line in the site's package.json
 *
 * A row of any kind may also name lines the site's config must hold while the site uses the piece
 * (needsConfig). They are looked for in the config with its comments left out (lib/sourceText.mjs), so a
 * line that is commented out is missing. A piece comes back with the ones the config lacks (missingConfig).
 * Only a piece the site reaches in shared/ is asked: a stub that points there, or a plugin, library or script
 * in use. A local copy where a stub belongs is the site's own code, and a missing stub is its own error.
 *
 * A package counts as present when the site's lock holds a version in range, whether or not its
 * package.json lists it. Without a lock it counts when package.json declares it. A name in a row's
 * cachePackages is not looked for here: the script that loads it checks the cache itself.
 *
 * A package has one way to reach a site, given by fixLine. A @docusaurus name moves with every other one, so its
 * fix is shared:bump: an `npm install` of a few of them would mix versions in one tree.
 *
 * A table that does not load, from a slip such as a lost comma, comes back as { loadError }, and every
 * reader prints that as one line with the way back. A pull loads the hub's new table before it merges
 * (loadRequirementsText), so a table that does not load never reaches a site that way.
 *
 * HOW TO CHANGE IT
 *   A new piece or package is a row in shared/requirements.cjs, not a change here. A new kind is an
 *   entry in USE_BY_KIND and its required field in REQUIRED_FIELD. A list every reader needs goes in
 *   TABLE_LISTS. Another kind of evidence: a key hasEvidence reads, and its place in requirements.cjs's
 *   header. Where a source pattern looks: SOURCE_FOLDER.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { trackedFiles } from './checkout.mjs';
import { ScriptError } from './exitCodes.mjs';
import { once } from './once.mjs';
import { isPinned } from './pin.mjs';
import { readTexts } from './privacy.mjs';
import { firstVersion, satisfies } from './range.mjs';
import { PREFIX } from './settings.mjs';
import { stripComments } from './sourceText.mjs';
import { readStub } from './stubs.mjs';

const require = createRequire(import.meta.url);

export const REQUIREMENTS_FILE = 'requirements.cjs';
const CONFIG_FILES = ['docusaurus.config.js', 'docusaurus.config.mjs', 'docusaurus.config.ts'];
const CLIENT_MODULES = 'src/clientModules';

/** Where a docs pattern looks, and which files count. */
const DOCS_FOLDERS = ['docs', 'blog', 'src/pages'];
const DOCS_FILE = /\.(?:md|mdx|js|jsx|ts|tsx)$/;

/** Where a source pattern looks: the site's own code, pages and components alike. The same files count. */
const SOURCE_FOLDER = 'src';

/** What moves every @docusaurus package together. */
export const BUMP_LINE = 'npm run shared:bump';

/** The field each kind must fill in. */
const REQUIRED_FIELD = Object.freeze({
  component: 'stub',
  theme: 'stub',
  plugin: 'configText',
  library: 'clientImport',
  script: 'script',
});

/** The lists every reader of the table needs, and what each must be. */
const TABLE_LISTS = Object.freeze({ ENTRIES: 'list', RANGES: 'table' });

/** The first line of what went wrong while loading, without the path of the machine. */
function loadErrorOf(error) {
  const first = String(error?.message ?? error).split('\n')[0];
  return `${error?.name ?? 'Error'}: ${first}`;
}

/** What makes a loaded table unreadable, or null when it holds every list. */
function shapeError(table) {
  if (table === null || typeof table !== 'object') return 'it exports no table';
  for (const [name, kind] of Object.entries(TABLE_LISTS)) {
    const value = table[name];
    const fits = kind === 'list' ? Array.isArray(value) : value !== null && typeof value === 'object';
    if (!fits) return `its ${name} is not a ${kind}`;
  }
  return null;
}

/**
 * The site's requirements table, null when the mount has no such file, or { loadError } when it does not
 * load or lacks one of its lists. A reader prints that line, never a stack.
 */
export function loadRequirements(root) {
  const file = path.join(root, PREFIX, REQUIREMENTS_FILE);
  if (!fs.existsSync(file)) return null;
  let table;
  try {
    table = require(file);
  } catch (error) {
    return { loadError: loadErrorOf(error) };
  }
  const problem = shapeError(table);
  return problem === null ? table : { loadError: problem };
}

/**
 * A requirements.cjs as text, loaded the way require would load it, for a file that is not on disk yet:
 * { table } or { loadError }. `file` is where it would sit, so its own require calls resolve from there.
 */
export function loadRequirementsText(text, file) {
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require: createRequire(file), __filename: file, __dirname: path.dirname(file) };
  try {
    vm.runInNewContext(text, sandbox, { filename: file });
  } catch (error) {
    return { loadError: loadErrorOf(error) };
  }
  const problem = shapeError(module.exports);
  return problem === null ? { table: module.exports } : { loadError: problem };
}

/** The table, or a ScriptError with the load error and the way back, for a script that cannot go on without it. */
export function requireTable(root, { exitCode, missingFix }) {
  const table = loadRequirements(root);
  if (table === null) throw new ScriptError(`${PREFIX}/${REQUIREMENTS_FILE} is missing. Try: ${missingFix}`, exitCode);
  if (table.loadError) {
    const lines = [`FAIL  ${PREFIX}/${REQUIREMENTS_FILE} does not load: ${table.loadError}`, `Fix: ${LOAD_UNDO}`];
    throw new ScriptError(lines.join('\n'), exitCode);
  }
  return table;
}

/** The way back from a table that does not load. shared:status prints the same. */
export const LOAD_UNDO = 'if a pull just brought it: git update-index -q --refresh && git reset --keep HEAD~1; otherwise mend the file';

/** True for one line of a row's needsConfig that the readers can use: { text, what }, both with words. */
function isConfigLine(line) {
  const hasWords = (value) => typeof value === 'string' && value.trim() !== '';
  return line !== null && typeof line === 'object' && hasWords(line.text) && hasWords(line.what);
}

/** What is wrong with a row's needsConfig, as a list of sentences. A row without one has nothing wrong. */
function configProblems(row) {
  if (row.needsConfig === undefined) return [];
  const sound = Array.isArray(row.needsConfig) && row.needsConfig.every(isConfigLine);
  return sound ? [] : [`${row.name}: needsConfig is a list of { text, what }`];
}

/** What is wrong with one row, as a list of sentences. */
function rowProblems(row, ranges) {
  const field = REQUIRED_FIELD[row.kind];
  if (!field) return [`${row.name}: unknown kind ${row.kind}`];
  const problems = row[field] ? [] : [`${row.name}: a ${row.kind} needs ${field}`];
  const names = [...(row.packages ?? []), ...(row.testPackages ?? []), ...(row.cachePackages ?? [])];
  const unknown = names.filter((name) => !ranges[name]);
  return [...problems, ...configProblems(row), ...unknown.map((name) => `${row.name}: ${name} has no range`)];
}

/** What is wrong with the table. Empty when every row is sound. */
export function tableProblems(table) {
  return table.ENTRIES.flatMap((row) => rowProblems(row, table.RANGES));
}

/** The first config file the site has, as text, or ''. */
function readConfigText(root) {
  const found = CONFIG_FILES.map((name) => path.join(root, name)).find((file) => fs.existsSync(file));
  return found ? fs.readFileSync(found, 'utf8') : '';
}

/** The site's docs and pages as texts. */
function readDocTexts(root, env) {
  const files = DOCS_FOLDERS.flatMap((folder) => trackedFiles(root, folder, env));
  return readTexts(root, files.filter((file) => DOCS_FILE.test(file)), { binaries: false });
}

/** The site's own code as texts: every script and page under src/. */
function readSourceTexts(root, env) {
  const files = trackedFiles(root, SOURCE_FOLDER, env);
  return readTexts(root, files.filter((file) => DOCS_FILE.test(file)), { binaries: false });
}

/** The site's client modules as texts. */
function readClientModules(root, env) {
  return readTexts(root, trackedFiles(root, CLIENT_MODULES, env), { binaries: false });
}

/** The site's package.json scripts, or none when it cannot be read. */
function readScripts(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * A site with its slow reads kept for the whole run: docs and code are read once, and only if needed.
 * `configCode` is the config with its comments left out, for a line that must really be there.
 */
export function openSite(root, env = process.env) {
  const configText = once(() => readConfigText(root));
  return {
    root,
    configText,
    configCode: once(() => stripComments(configText())),
    scripts: once(() => readScripts(root)),
    docTexts: once(() => readDocTexts(root, env)),
    sourceTexts: once(() => readSourceTexts(root, env)),
    clientModules: once(() => readClientModules(root, env)),
  };
}

/** True when one of the texts holds a match of the pattern, a RegExp's source, read with the m flag. */
function someMatch(texts, source) {
  const pattern = new RegExp(source, 'm');
  return texts.some(({ text }) => pattern.test(text));
}

/** True when the evidence shows the site uses a piece. The cheap reads come first, the whole of src/ last. */
function hasEvidence(site, evidence = {}) {
  if (evidence.configText && site.configText().includes(evidence.configText)) return true;
  if (evidence.clientImport && site.clientModules().some(({ text }) => text.includes(evidence.clientImport))) return true;
  if (evidence.docsPattern && someMatch(site.docTexts(), evidence.docsPattern)) return true;
  return Boolean(evidence.srcPattern) && someMatch(site.sourceTexts(), evidence.srcPattern);
}

/** A piece reached through a stub. With the stub in place the site uses it, and no evidence is read. */
function stubUse(site, row) {
  const stub = readStub(site.root, row.stub);
  const evidence = !stub.exists && hasEvidence(site, row.evidence);
  return { used: stub.exists || evidence, missingStub: evidence, stub };
}

/** A piece reached through a line in the site's config. */
function configUse(site, row) {
  return { used: site.configText().includes(row.configText), missingStub: false, stub: null };
}

/** A piece reached through a client module's import. */
function clientModuleUse(site, row) {
  const used = site.clientModules().some(({ text }) => text.includes(row.clientImport));
  return { used, missingStub: false, stub: null };
}

/** A piece reached through a line in the site's package.json. */
function scriptUse(site, row) {
  return { used: site.scripts()[row.script] !== undefined, missingStub: false, stub: null };
}

const USE_BY_KIND = Object.freeze({
  component: stubUse,
  theme: stubUse,
  plugin: configUse,
  library: clientModuleUse,
  script: scriptUse,
});

/** True for a row the readers can use. tableProblems reports the others. */
function isSound(row) {
  return Boolean(row[REQUIRED_FIELD[row.kind]]);
}

/** True when the site reaches the shared piece itself: its stub points into shared/, or a row without a stub is in use. */
function reachesShared({ used, stub }) {
  return used && (stub === null || stub.target !== null);
}

/** The lines of a row's needsConfig the site's config lacks. A piece the site does not reach in shared/ needs none. */
function missingConfig(site, row, use) {
  if (!reachesShared(use) || !Array.isArray(row.needsConfig)) return [];
  return row.needsConfig.filter((line) => isConfigLine(line) && !site.configCode().includes(line.text));
}

/** Every sound row with how this site uses it: [{ row, used, missingStub, stub, missingConfig }]. */
export function readPieces(site, table) {
  return table.ENTRIES.filter(isSound).map((row) => {
    const use = USE_BY_KIND[row.kind](site, row);
    return { row, ...use, missingConfig: missingConfig(site, row, use) };
  });
}

/** package-lock.json as a function from a name to its top-level version, or null without a lock. */
export function readLock(root) {
  let lock;
  try {
    lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  } catch {
    return null;
  }
  const modern = lock.packages ?? {};
  const older = lock.dependencies ?? {};
  return (name) => modern[`node_modules/${name}`]?.version ?? older[name]?.version ?? null;
}

/** Every name the site's package.json declares, with its version text. */
export function readManifest(root) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
  return { ...manifest.dependencies, ...manifest.devDependencies };
}

/** The names the used pieces need, each with the pieces that need it. */
function packageOwners(pieces) {
  const owners = new Map();
  for (const { row, used } of pieces.filter((piece) => piece.used)) {
    for (const name of [...(row.packages ?? []), ...(row.testPackages ?? [])]) {
      owners.set(name, [...(owners.get(name) ?? []), row.name]);
    }
  }
  return owners;
}

/** One package's problem, or null. `versionOf` is null when the site has no lock. */
function packageProblem(name, pieces, range, versionOf, manifest) {
  if (versionOf === null) {
    return manifest[name] === undefined ? { name, range, found: null, pieces } : null;
  }
  const version = versionOf(name);
  const inRange = version !== null && satisfies(version, range);
  return inRange ? null : { name, range, found: version, pieces };
}

/** True when node would find the package from `root`: its node_modules, or one in a folder above. */
function isInstalled(root, name) {
  let folder = path.resolve(root);
  for (;;) {
    if (fs.existsSync(path.join(folder, 'node_modules', name, 'package.json'))) return true;
    const parent = path.dirname(folder);
    if (parent === folder) return false;
    folder = parent;
  }
}

/**
 * The names the used pieces need that the lock holds and node cannot find on disk: a fresh clone or a new
 * worktree before its npm ci. Their suites would fail on a missing package and name no install.
 */
export function notInstalled(root, pieces) {
  const names = [...packageOwners(pieces).keys()];
  return names.filter((name) => !isInstalled(root, name)).sort();
}

/** { locked, count, problems: [{ name, range, found, pieces }] } for the pieces a site uses. */
export function checkPackages(root, table, pieces) {
  const versionOf = readLock(root);
  const manifest = readManifest(root);
  const owners = packageOwners(pieces);
  const problems = [];
  for (const [name, owner] of owners) {
    const problem = packageProblem(name, owner, table.RANGES[name], versionOf, manifest);
    if (problem) problems.push(problem);
  }
  return { locked: versionOf !== null, count: owners.size, problems };
}

/** The exact line that puts these packages in: each at the first version its range names. */
export function installLine(problems) {
  const targets = problems.map(({ name, range }) => `${name}@${firstVersion(range)}`);
  return `npm install --save-exact ${targets.join(' ')}`;
}

/**
 * The steps that fix the problems, each one a line to run, in order. A bump goes first, because it needs a
 * clean tree. The install comes as a step of its own and is never chained to the bump with &&: a bump that
 * commits and leaves a list to read exits 8, and a chain would drop the install without a word.
 */
export function fixSteps(problems) {
  const others = problems.filter(({ name }) => !isPinned(name));
  const install = others.length > 0 ? installLine(others) : null;
  if (others.length === problems.length) return [install];
  return install === null ? [BUMP_LINE] : [BUMP_LINE, install];
}

/** What a later step is called under the first. */
export const AFTER_BUMP = 'then, once the bump has ended, green or with a list to read:';

/** The first step, the one a status line's fix holds. fixSteps gives the rest. */
export function fixLine(problems) {
  return fixSteps(problems)[0];
}
