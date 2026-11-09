/**
 * scripts/check-public.mjs: the last check before a public site goes out. It fails the build when
 * something private is about to become public.
 *
 * It fails on any of these:
 *   1. a licence-key-shaped string in any built file (BUILD_DIR) or in a tracked file;
 *   2. a Basic-Auth value in a tracked file (a rule about its shape, see BASIC_AUTH_SHAPES);
 *   3. a tracked .env file;
 *   4. a tracked file, or a tracked path, that holds an entry of the machine's word list;
 *   5. a built file, any file below BUILD_DIR, that holds an entry of the word list (see "Words in
 *      built files"). A build copies whatever static/ holds, untracked files and all;
 *   6. a .DS_Store anywhere under the build folder.
 *
 * It never prints what it found. A hit gives a path and a number, and a word gives only its line
 * in the word list. A path that holds a listed word is hidden too. Checks 5 and 6 add a line that
 * says what to change.
 *
 * Words in built files. Tracked files are read as plain text, so what a person wrote is caught
 * there. This scan is for what only the build knows, such as an absolute path that require.resolve
 * in a site's config writes into the main chunk, or an untracked file in static/ that the build
 * copies. Two kinds of hit are left out on purpose:
 *   a word with an allow line: it has a known home in a tracked file, so it sits in built JS too.
 *   a word in the middle of a longer word, with a letter or digit on both sides. Minified code is
 *   full of long names, and a short entry lands inside some of them by chance. An entry that starts
 *   or ends with anything else, a slash say, stands alone wherever it sits.
 *
 * Run it from the repo's top folder, after the build:
 *   node shared/scripts/check-public.mjs
 *   node --test shared/scripts/__tests__/check-public.test.mjs
 *
 * It belongs in netlify.toml's [build] command, after the site build:
 *   command = "npm run build && node shared/scripts/check-public.mjs"
 * That way `netlify build` and `netlify deploy` both run it and a hit stops them. A predeploy npm
 * script would not do: only `npm run deploy` runs one, never a plain `netlify deploy`.
 *
 * Flags:
 *   --allow-missing-word-file   run the other checks when the word list does not exist. It changes
 *                               nothing when the list exists. A build on a host that has no word
 *                               list needs this flag, or it refuses.
 *   --root <folder>             the repo's top folder, if it is not the current folder
 *   --word-file <path>          read another word list (the tests use this)
 *   --help                      print the flags and stop
 *
 * Exit codes: 0 clean, 1 something was found, 2 refused because a check could not run. A check
 * that could not run is never a pass: no word list, no build, or no git repo all refuse.
 *
 * The word list is one plain file outside every repo, so it cannot be published by accident
 * (WORD_LIST_FROM_HOME in lib/settings.mjs, under the home folder). It holds no secrets, because the
 * secret shapes below need none. lib/wordList.mjs reads it, for this check and for the shared scripts
 * alike, so the two never take a line differently:
 *   one entry per line, matched as plain text in any case, anywhere in a file's bytes. An entry with
 *   parts is matched in each common spelling of them, and over a wrapped line or Markdown's marks:
 *   lib/wordForms.mjs
 *   a line that starts with #, indented or not, is a comment, and blank lines are skipped
 *   word<TAB>path allows that word in that one tracked path, and still lists it in every other
 *   tracked path. Built files are a different matter: an allow line takes the word out of that scan.
 *   a line with more than one tab, or with no word, makes this check refuse the list.
 *
 * How to change it:
 *   a new kind of Basic-Auth value: add a row to BASIC_AUTH_SHAPES
 *   a new licence key format: see LICENCE_KEY_CANDIDATE and payloadIsPlainText
 *   the folder of built files: BUILD_DIR
 *   what counts as part of a longer word: WORD_CHARACTER
 *   what a fix line says: BUILT_WORD_FIX, SYSTEM_FILE_FIX
 *   another file a Mac writes: SYSTEM_FILE
 *   a harmless .env-style file that should stay tracked: ENV_FILES_ALLOWED
 *   a false hit on a word: add word<TAB>path to the word list, not an exception here
 *   how a line of the word list is read: lib/wordList.mjs, which the shared scripts read it with too
 * Add a test to __tests__/check-public.test.mjs for every change. Neither file may hold a real value,
 * the name of a site or a word of the list: this file is published, and it scans itself.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { counted } from './lib/phrases.mjs';
import { WORD_LIST_FROM_HOME } from './lib/settings.mjs';
import { holdsForm, linesOf, textViews } from './lib/wordForms.mjs';
import { parseWordList } from './lib/wordList.mjs';

export const EXIT_CLEAN = 0;
export const EXIT_FOUND = 1;
export const EXIT_REFUSED = 2;

/** Under the home folder. Spelled with `~` in messages, so a message names no home folder. */
const WORD_FILE_SHOWN = `~/${WORD_LIST_FROM_HOME}`;
const ALLOW_MISSING_FLAG = '--allow-missing-word-file';

const USAGE = [
  'Usage: node shared/scripts/check-public.mjs [flags], from the repo\'s top folder, after the build',
  `  ${ALLOW_MISSING_FLAG}   run the other checks when the word list does not exist`,
  '  --root <folder>             the repo\'s top folder, if it is not the current folder',
  '  --word-file <path>          read another word list',
  '  --help                      print this and stop',
].join('\n');

/** Built files, from the repo's top folder. Every file below it is read, whatever its extension. */
const BUILD_DIR = 'build';

/** Lower case, because the scan reads lowered text. A word runs on across one of these. */
const WORD_CHARACTER = /[a-z0-9]/;

/** A Mac writes this into a folder it opens. */
const SYSTEM_FILE = '.DS_Store';

/** What to change. Printed once, under the hits. Neither may name a listed word. */
const BUILT_WORD_FIX =
  'a word in a built file: change what put it there, then build again. An absolute path usually ' +
  'comes from require.resolve in docusaurus.config.js, so write that path as a relative string.';
const SYSTEM_FILE_FIX = `${SYSTEM_FILE}: delete it from static/, then build again.`;

/**
 * A licence key is an md5 hash in lower-case hex, then a base64 payload. The lookbehind keeps a
 * candidate at the start of a base64 token, so nothing inside a long base64 blob can match.
 */
const KEY_HASH_LENGTH = 32;
const KEY_PAYLOAD_MIN_LENGTH = 40;
const LICENCE_KEY_CANDIDATE = new RegExp(
  `(?<![0-9A-Za-z+/])[0-9a-f]{${KEY_HASH_LENGTH}}[A-Za-z0-9+/]{${KEY_PAYLOAD_MIN_LENGTH},}={0,2}`,
  'g',
);

/**
 * Basic-Auth values, by shape. `decodesToPair` means group 1 is base64 of "name:password".
 * The first row is the header in netlify.toml (=) or _headers (:), the second is the header a
 * browser sends. The (?!//) leaves out a link written after the name of the header.
 */
const BASIC_AUTH_SHAPES = [
  {
    pattern: /basic-auth["'\s]*[:=]\s*["']*[^\s"':]+:(?!\/\/)[^\s"']+/gi,
    decodesToPair: false,
  },
  {
    pattern: /authorization["'\s]*[:=]\s*["']*basic\s+([A-Za-z0-9+/]{8,}={0,2})/gi,
    decodesToPair: true,
  },
];

/** A tracked .env, .env.production and so on fail. These names may stay tracked. */
const ENV_FILE_NAME = /^\.env(\.[^/]*)?$/;
const ENV_FILES_ALLOWED = new Set(['.env.example']);

/** Hits printed for one check. One word in many files must not hide another word's line. */
const MAX_HITS_SHOWN = 5;
const HIDDEN_PATH = '(a path that holds a listed word)';
const GIT_OUTPUT_LIMIT_BYTES = 256 * 1024 * 1024;

/** A check could not run. Its message is safe to print. */
class Refusal extends Error {}

function payloadIsPlainText(payload) {
  const decoded = Buffer.from(payload, 'base64');
  return decoded.every((byte) => byte >= 0x20 && byte <= 0x7e);
}

/**
 * How many licence-key-shaped strings a text holds. Every real key's payload decodes to plain text
 * (key=value pairs). Random base64 does not, and neither do the long hex constants that crypto
 * code carries, which match the candidate pattern. That is what makes this safe on real bundles.
 */
export function countLicenceKeys(text) {
  let count = 0;
  for (const match of text.matchAll(LICENCE_KEY_CANDIDATE)) {
    const payload = match[0].slice(KEY_HASH_LENGTH);
    if (payloadIsPlainText(payload)) {
      count += 1;
    }
  }
  return count;
}

function shapeMatches(shape, match) {
  if (!shape.decodesToPair) {
    return true;
  }
  const decoded = Buffer.from(match[1], 'base64').toString('latin1');
  return decoded.includes(':');
}

/** The offsets of the Basic-Auth values in a text, earliest first. Comments count. */
export function findBasicAuthOffsets(text) {
  const offsets = [];
  for (const shape of BASIC_AUTH_SHAPES) {
    for (const match of text.matchAll(shape.pattern)) {
      if (shapeMatches(shape, match)) {
        offsets.push(match.index);
      }
    }
  }
  return offsets.sort((a, b) => a - b);
}

export function isEnvFile(trackedPath) {
  const name = path.posix.basename(trackedPath);
  return ENV_FILE_NAME.test(name) && !ENV_FILES_ALLOWED.has(name);
}

function lineNumberAt(text, offset) {
  let line = 1;
  let next = text.indexOf('\n');
  while (next !== -1 && next < offset) {
    line += 1;
    next = text.indexOf('\n', next + 1);
  }
  return line;
}

/**
 * Reads the word list's text with the shared reader, as entries this check scans with: { needle, lineNumber,
 * allowedPaths, forms, multiPart }. `badLines` holds the line numbers it cannot read.
 */
export function parseWordFile(text) {
  const { words, allowed, badLines } = parseWordList(text);
  const entries = words.map(({ lower, line, forms, multiPart }) => {
    const allowedPaths = new Set(allowed.filter((entry) => entry.lower === lower).map((entry) => entry.path));
    return { needle: lower, lineNumber: line, allowedPaths, forms, multiPart };
  });
  return { entries, badLines };
}

function missingWordFileMessage(wordFileShown) {
  return (
    `no word list at ${wordFileShown}. Make it (one entry per line), or pass ` +
    `${ALLOW_MISSING_FLAG} to run the other checks without it.`
  );
}

/** The word list's entries, or null when it is missing and that is allowed. */
function loadWordEntries({ wordFile, wordFileShown, allowMissingWordFile }) {
  let text;
  try {
    text = fs.readFileSync(wordFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Refusal(`could not read the word list ${wordFileShown} (${error.code}).`);
    }
    if (allowMissingWordFile) {
      return null;
    }
    throw new Refusal(missingWordFileMessage(wordFileShown));
  }
  const { entries, badLines } = parseWordFile(text);
  if (badLines.length > 0) {
    const lines = badLines.length === 1 ? 'line' : 'lines';
    throw new Refusal(`word list ${lines} ${badLines.join(', ')}: more than one tab, or no word.`);
  }
  if (entries.length === 0) {
    throw new Refusal(`the word list ${wordFileShown} has no entries.`);
  }
  return entries;
}

function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: GIT_OUTPUT_LIMIT_BYTES,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Every tracked path. `git ls-files` lists only the current folder down, so a subfolder refuses. */
function listTrackedPaths(root) {
  let prefix;
  let listing;
  try {
    prefix = runGit(root, ['rev-parse', '--show-prefix']).trim();
    listing = runGit(root, ['ls-files', '-z']);
  } catch {
    throw new Refusal(`could not list tracked files: ${root} is not a git repo.`);
  }
  if (prefix !== '') {
    throw new Refusal(`${root} is not the repo's top folder. Run this from there.`);
  }
  const paths = listing.split('\0').filter((trackedPath) => trackedPath !== '');
  if (paths.length === 0) {
    throw new Refusal('git tracks no files here, so there is nothing to check.');
  }
  return paths;
}

/** Every regular file below the build folder: pages, styles, scripts and whatever static/ held. */
function listBuiltFiles(root) {
  const folder = path.join(root, BUILD_DIR);
  let names;
  try {
    names = fs.readdirSync(folder, { recursive: true });
  } catch {
    names = [];
  }
  const files = names
    .map((name) => path.join(BUILD_DIR, name))
    .filter((relativePath) => isRegularFile(path.join(root, relativePath)));
  if (files.length === 0) {
    throw new Refusal(`no built files in ${BUILD_DIR}. Run the build first.`);
  }
  return files;
}

function isRegularFile(fullPath) {
  const stats = fs.lstatSync(fullPath, { throwIfNoEntry: false });
  return Boolean(stats) && stats.isFile();
}

/** True when a word carries on from `edge`, the entry's own character, into `neighbour`. */
function runsOn(edge, neighbour) {
  return neighbour !== undefined && WORD_CHARACTER.test(edge) && WORD_CHARACTER.test(neighbour);
}

/** True for a place with a letter or digit on both sides of the entry. */
function isInsideLongerWord(text, offset, needle) {
  const before = text[offset - 1];
  const after = text[offset + needle.length];
  return runsOn(needle[0], before) && runsOn(needle.at(-1), after);
}

/** How many times lowered text holds one lowered spelling, the places inside a longer word left out. */
export function countBundleHits(text, needle) {
  return countEntryHits(text, { needle });
}

/** The places of one form, as [start, end), the ones inside a longer word left out. */
function formPlaces(text, form) {
  const places = [];
  let offset = text.indexOf(form);
  while (offset !== -1) {
    if (!isInsideLongerWord(text, offset, form)) places.push([offset, offset + form.length]);
    offset = text.indexOf(form, offset + form.length);
  }
  return places;
}

/** How many places lowered text holds any spelling of an entry. Spellings that overlap count once. */
export function countEntryHits(text, { needle, forms = [needle] }) {
  const places = forms.flatMap((form) => formPlaces(text, form)).sort((a, b) => a[0] - b[0]);
  let count = 0;
  let end = -1;
  for (const [start, stop] of places) {
    if (start >= end) count += 1;
    end = Math.max(end, stop);
  }
  return count;
}

/** The entries the bundle scan reads. A word with an allow line has a known home, so it is left out. */
function bundleWordEntries(wordEntries) {
  return wordEntries.filter((entry) => entry.allowedPaths.size === 0);
}

function noteBundleWords(relativePath, text, wordEntries, findings) {
  const lowered = text.toLowerCase();
  for (const entry of wordEntries) {
    const count = countEntryHits(lowered, entry);
    if (count > 0) {
      const check = `word list line ${entry.lineNumber}`;
      findings.push({ check, where: relativePath, detail: `${count} found`, fix: BUILT_WORD_FIX });
    }
  }
}

function scanBundles(root, bundleFiles, wordEntries, findings) {
  const entries = bundleWordEntries(wordEntries);
  for (const relativePath of bundleFiles) {
    const text = fs.readFileSync(path.join(root, relativePath), 'utf8');
    const count = countLicenceKeys(text);
    if (count > 0) {
      findings.push({ check: 'licence key shape', where: relativePath, detail: `${count} found` });
    }
    noteBundleWords(relativePath, text, entries, findings);
  }
}

/** Every SYSTEM_FILE at any depth of the build, not only in the built JavaScript. */
function scanSystemFiles(root, findings) {
  const names = fs.readdirSync(path.join(root, BUILD_DIR), { recursive: true });
  for (const name of names.filter((entry) => path.basename(entry) === SYSTEM_FILE)) {
    const where = path.join(BUILD_DIR, name);
    findings.push({ check: `${SYSTEM_FILE} in the build`, where, detail: '1 found', fix: SYSTEM_FILE_FIX });
  }
}

function noteSecretShapes(trackedPath, text, findings) {
  const keyCount = countLicenceKeys(text);
  if (keyCount > 0) {
    findings.push({ check: 'licence key shape', where: trackedPath, detail: `${keyCount} found` });
  }
  const offsets = findBasicAuthOffsets(text);
  if (offsets.length > 0) {
    const detail = `line ${lineNumberAt(text, offsets[0])}, ${offsets.length} found`;
    findings.push({ check: 'Basic-Auth value', where: trackedPath, detail });
  }
}

function noteWords(trackedPath, text, wordEntries, findings) {
  const views = textViews(text, trackedPath);
  for (const entry of wordEntries) {
    if (entry.allowedPaths.has(trackedPath)) {
      continue;
    }
    const check = `word list line ${entry.lineNumber}`;
    if (holdsForm(trackedPath, entry)) {
      findings.push({ check, where: trackedPath, detail: 'in the path' });
    }
    const [line] = linesOf(views, entry);
    if (line !== undefined) {
      findings.push({ check, where: trackedPath, detail: `line ${line}` });
    }
  }
}

/** Reads every tracked file on disk. A symlink, a submodule or a deleted file has nothing to read. */
function scanTrackedFiles(root, trackedPaths, wordEntries, findings) {
  let skipped = 0;
  for (const trackedPath of trackedPaths) {
    if (isEnvFile(trackedPath)) {
      findings.push({ check: 'tracked .env file', where: trackedPath, detail: 'remove it from git' });
    }
    const fullPath = path.join(root, trackedPath);
    if (!isRegularFile(fullPath)) {
      skipped += 1;
      continue;
    }
    const text = fs.readFileSync(fullPath, 'utf8');
    noteSecretShapes(trackedPath, text, findings);
    noteWords(trackedPath, text, wordEntries, findings);
  }
  return skipped;
}

function shownPath(where, wordEntries) {
  const holdsWord = wordEntries.some((entry) => holdsForm(where, entry));
  return holdsWord ? HIDDEN_PATH : where;
}

function groupByCheck(findings) {
  const groups = new Map();
  for (const finding of findings) {
    if (!groups.has(finding.check)) {
      groups.set(finding.check, []);
    }
    groups.get(finding.check).push(finding);
  }
  return groups;
}

function formatFindings(findings, wordEntries) {
  const lines = [`check-public: FAILED, ${findings.length} found. Values are not printed.`];
  for (const [check, hits] of groupByCheck(findings)) {
    for (const { where, detail } of hits.slice(0, MAX_HITS_SHOWN)) {
      lines.push(`  ${check}: ${shownPath(where, wordEntries)} (${detail})`);
    }
    if (hits.length > MAX_HITS_SHOWN) {
      lines.push(`  ${check}: and ${hits.length - MAX_HITS_SHOWN} more`);
    }
  }
  const fixes = new Set(findings.map(({ fix }) => fix).filter(Boolean));
  return [...lines, ...[...fixes].map((fix) => `  Fix for ${fix}`)];
}

function formatClean({ bundleCount, trackedCount, skipped, wordCount }) {
  return (
    `check-public: clean. ${counted(bundleCount, 'built file')}, ${counted(trackedCount, 'tracked file')} ` +
    `(${skipped} with nothing to read), ${counted(wordCount, 'listed word')}.`
  );
}

/**
 * Runs every check. Returns { exitCode, lines }; `lines` are safe to print.
 * Options: root, wordFile, wordFileShown, allowMissingWordFile.
 */
function checkPublic(options) {
  const { root } = options;
  try {
    const wordEntries = loadWordEntries(options);
    const trackedPaths = listTrackedPaths(root);
    const bundleFiles = listBuiltFiles(root);
    const findings = [];
    scanBundles(root, bundleFiles, wordEntries ?? [], findings);
    scanSystemFiles(root, findings);
    const skipped = scanTrackedFiles(root, trackedPaths, wordEntries ?? [], findings);
    if (findings.length > 0) {
      return { exitCode: EXIT_FOUND, lines: formatFindings(findings, wordEntries ?? []) };
    }
    const summary = formatClean({
      bundleCount: bundleFiles.length,
      trackedCount: trackedPaths.length,
      skipped,
      wordCount: (wordEntries ?? []).length,
    });
    const lines = [summary];
    if (wordEntries === null) {
      lines.push(`check-public: no word list, so the word check did not run (${ALLOW_MISSING_FLAG}).`);
    }
    return { exitCode: EXIT_CLEAN, lines };
  } catch (error) {
    if (error instanceof Refusal) {
      return { exitCode: EXIT_REFUSED, lines: [`check-public: REFUSED, ${error.message}`] };
    }
    throw error;
  }
}

function optionsFromArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'allow-missing-word-file': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
      root: { type: 'string', default: process.cwd() },
      'word-file': { type: 'string' },
    },
  });
  const customWordFile = values['word-file'];
  return {
    root: path.resolve(values.root),
    wordFile: customWordFile ?? path.join(os.homedir(), WORD_LIST_FROM_HOME),
    wordFileShown: customWordFile ?? WORD_FILE_SHOWN,
    allowMissingWordFile: values['allow-missing-word-file'],
    help: values.help,
  };
}

function main() {
  let options;
  try {
    options = optionsFromArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`check-public: REFUSED, ${error.message}`);
    process.exitCode = EXIT_REFUSED;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const { exitCode, lines } = checkPublic(options);
  const print = exitCode === EXIT_CLEAN ? console.log : console.error;
  lines.forEach((line) => print(line));
  process.exitCode = exitCode;
}

function isRunDirectly() {
  const script = process.argv[1];
  return Boolean(script) && fs.realpathSync(script) === fileURLToPath(import.meta.url);
}

if (isRunDirectly()) {
  main();
}
