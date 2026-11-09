#!/usr/bin/env node
/**
 * scripts/join.mjs: `npm run shared:join`. It brings an existing site into the family. Run it from any
 * joined site, or from a clone of the hub with `node scripts/join.mjs`, and name the folder.
 *
 *     npm run shared:join -- ../my-site --check     says what stands in the way, and changes nothing
 *     npm run shared:join -- ../my-site             does the mechanical part
 *     npm run shared:join -- --help                 the other options
 *
 * `--check` prints one line per fact, in four levels: ok, info (the join does this), warn (a person does
 * this) and FAIL (this stops a join). A join refuses on exactly the FAIL lines. A site below Docusaurus 3, a
 * changed tracked file, a folder with no repository and a branch other than master all stop it.
 *
 * On a site that passes, a join:
 *   1. adds the `shared` remote and fetches the hub, so a hub out of reach changes nothing;
 *   2. commits the housekeeping: a tracked .gitignore that lists .env, a deploy line through Netlify, and
 *      netlify.toml and .nvmrc from the template when they are absent;
 *   3. refreshes git's index, which a copied folder needs, and runs git subtree add --squash;
 *   4. commits the npm lines, a default comparePages, src/theme/Admonition/Types.js, and a stub for each
 *      component copy that holds shared code;
 *   5. prints the by-hand list. It never touches a site's config, its CSS or its MUI.
 *
 * Each step looks first, so a second run does what is left. That is how the stub pass runs again after the
 * MUI step, when more copies match: `npm run shared:join -- .` in the joined site.
 *
 * It is also the way back for a site that left through `shared:leave`, whose shared/ stayed: run in that site,
 * `node shared/scripts/join.mjs` adds the remote and puts the npm lines back in one commit, the site's own
 * shared:verify as it was before the leave. Its shared/ is mounted already, so nothing is fetched: the pull after
 * it brings what the hub took in meanwhile.
 *
 * `--public` also makes the template's netlify.toml end its build with the public check. `--exclude <path>`
 * writes a path to .git/info/exclude, which no commit carries: a public site's .gitignore must not name a
 * tool's private folder.
 *
 * It exits 0 when done or ready, 3 when `--check` found a FAIL line, 4 when a join refused and changed
 * nothing, 5 when git failed. See lib/exitCodes.mjs. A stopped run can simply run again.
 *
 * HOW TO CHANGE IT
 *   Names, npm lines and subjects: lib/joinSettings.mjs. What is read: lib/joinFacts.mjs. What each line says
 *   and what blocks: lib/joinChecks.mjs. The files it writes: lib/joinHousekeeping.mjs and lib/joinStubs.mjs. The
 *   end list: lib/joinByHand.mjs. A new option goes in BOOLEAN_FLAGS or VALUE_FLAGS, and in USAGE.
 *   The order of the steps is `runJoin`, and a step is one short function above it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshIndex } from './lib/checkout.mjs';
import { FETCH_FIX, formatResult } from './lib/checks.mjs';
import { EXIT, ScriptError, runScript } from './lib/exitCodes.mjs';
import { git, gitValue, gitOrThrow } from './lib/git.mjs';
import { byHandLines } from './lib/joinByHand.mjs';
import { blockers, checkResults, checkSummary } from './lib/joinChecks.mjs';
import { MOUNT, REMOTE_STATE, defaultPages, readFacts } from './lib/joinFacts.mjs';
import { planNetlify } from './lib/joinHousekeeping.mjs';
import {
  HOUSEKEEPING_SUBJECT, IGNORE_FILE, SCRIPT, SITE_LINES, SITE_LINES_SUBJECT, VERIFY_LINE, VERIFY_LINE_NAME,
} from './lib/joinSettings.mjs';
import { COPY, copyFolder, readCopies, writeStub } from './lib/joinStubs.mjs';
import { refuseWhenListening } from './lib/listeners.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { counted, short } from './lib/phrases.mjs';
import { refusal } from './lib/preflight.mjs';
import { requireTable } from './lib/requirements.mjs';
import { MANIFEST_FILE, NETLIFY_FILE, NVMRC_FILE, PREFIX, REMOTE, TEMPLATE_FOLDER, UPSTREAM_REF } from './lib/settings.mjs';
import { editManifest, linesBeforeLeave } from './lib/siteLines.mjs';
import { fetchHub, fetchReason } from './lib/state.mjs';

/** The shared folder this script belongs to: a site's shared/, or a clone of the hub. */
const SHARED_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CHECK_FLAG = '--check';
const PUBLIC_FLAG = '--public';
const OFFLINE_FLAG = '--offline';
const EXCLUDE_FLAG = '--exclude';
const HELP_FLAG = '--help';
const BOOLEAN_FLAGS = Object.freeze({
  [CHECK_FLAG]: 'check',
  [PUBLIC_FLAG]: 'publicSite',
  [OFFLINE_FLAG]: 'offline',
  [HELP_FLAG]: 'help',
});
const VALUE_FLAGS = Object.freeze({ [EXCLUDE_FLAG]: 'exclude' });
const FLAGS = [...Object.keys(BOOLEAN_FLAGS), ...Object.keys(VALUE_FLAGS)];
const USAGE = [
  'Usage: npm run shared:join -- [<folder>] [options]',
  '  <folder>          the site, from where you run this. Default: this repository',
  '  --check           say what stands in the way, and change nothing',
  '  --public          a public site: the build it writes ends with the public check',
  '  --exclude <path>  also write this path to .git/info/exclude. Repeat it for more',
  '  --offline         --check asks Netlify nothing',
  '  --help            this list',
].join('\n');

/** A usage error, with the list of options. */
function usageError(sentence) {
  return new ScriptError(`${sentence}\n${USAGE}`, EXIT.USAGE);
}

/** Stores the value of an option that takes one. */
function readValueFlag(options, flag, value) {
  if (value === undefined || value.startsWith('--')) throw usageError(`${flag} needs a value.`);
  options[VALUE_FLAGS[flag]].push(value);
}

/** The options as { folder, check, publicSite, offline, exclude, help }, or a usage error. */
export function parseArgs(argv) {
  const options = { exclude: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const word = argv[index];
    if (BOOLEAN_FLAGS[word] !== undefined) {
      options[BOOLEAN_FLAGS[word]] = true;
    } else if (VALUE_FLAGS[word] !== undefined) {
      readValueFlag(options, word, argv[index + 1]);
      index += 1;
    } else if (word.startsWith('-')) {
      throw usageError(`Unknown option ${word}.`);
    } else if (options.folder !== undefined) {
      throw usageError('Name one folder.');
    } else {
      options.folder = word;
    }
  }
  return options;
}

/** Prints what the folder needs. Writes nothing. */
export function runCheck(job) {
  const results = checkResults(readFacts(job), job.env);
  results.flatMap(formatResult).forEach((line) => job.print(line));
  job.print(checkSummary(results));
  return blockers(results).length > 0 ? EXIT.CHECKS : EXIT.OK;
}

/** Every blocker as one refusal, with the fix beside each. */
function refuseBlockers(results) {
  const stops = blockers(results);
  if (stops.length === 0) return;
  const details = stops.map(({ text, fix }) => (fix ? `${text} (fix: ${fix})` : text));
  throw refusal(SCRIPT, `${counted(stops.length, 'blocker')}.`, { details });
}

/** Adds the remote and fetches. A hub out of reach leaves the site as it was. */
function connectHub({ root, remote, hub, mount }, env) {
  const added = remote.state === REMOTE_STATE.NONE;
  if (added) gitOrThrow(['remote', 'add', REMOTE, hub], { cwd: root, env });
  if (mount === MOUNT.MOUNTED) return;
  const fetched = fetchHub(root, env);
  if (fetched.ok) return;
  if (added) git(['remote', 'remove', REMOTE], { cwd: root, env });
  const reason = fetchReason(fetched).map((line) => `  ${line}`);
  const message = [`Could not reach the hub at ${hub}, so nothing was changed. git said:`, ...reason, `Fix: ${FETCH_FIX}, then run this again.`];
  throw new ScriptError(message.join('\n'), EXIT.GIT);
}

/** Writes one file of the site, from its root. */
function writeSiteFile(root, name, text) {
  fs.writeFileSync(path.join(root, name), text);
}

/** The deploy line. Returns true when package.json changed. */
function setDeployLine(root, { line, state }) {
  if (state !== 'replace') return false;
  return editManifest(root, (manifest) => {
    manifest.scripts = { ...manifest.scripts, deploy: line };
  });
}

/** Writes a template file into a site that lacks it. Returns the file's name, or nothing. */
function fromTemplate(root, sharedRoot, name, shape = (text) => text) {
  if (fs.existsSync(path.join(root, name))) return [];
  const text = fs.readFileSync(path.join(sharedRoot, TEMPLATE_FOLDER, name), 'utf8');
  writeSiteFile(root, name, shape(text));
  return [name];
}

/** Stages the files and commits them. `-f` because an old rule may still name a file meant for git. */
export function commitFiles(root, files, subject, env) {
  if (files.length === 0) return null;
  gitOrThrow(['add', '-f', '--', ...files], { cwd: root, env });
  gitOrThrow(['commit', '-q', '-m', subject], { cwd: root, env });
  return gitOrThrow(['rev-parse', 'HEAD'], { cwd: root, env, read: true });
}

/** The ignore file, the deploy line, netlify.toml and .nvmrc, in one commit. */
function housekeep({ root, ignore, deploy, sharedRoot, publicSite }, env) {
  const files = [];
  if (ignore.plan.changes.length > 0) writeSiteFile(root, IGNORE_FILE, ignore.plan.text);
  if (ignore.plan.changes.length > 0 || !ignore.tracked) files.push(IGNORE_FILE);
  if (setDeployLine(root, deploy)) files.push(MANIFEST_FILE);
  const shapeNetlify = (text) => planNetlify(text, { publicSite });
  files.push(...fromTemplate(root, sharedRoot, NETLIFY_FILE, shapeNetlify));
  files.push(...fromTemplate(root, sharedRoot, NVMRC_FILE));
  return { files, sha: commitFiles(root, files, HOUSEKEEPING_SUBJECT, env) };
}

/** git subtree add. The refresh first: on a copied folder it stops at a clean tree without it. */
export function subtreeAdd(root, env) {
  refreshIndex(root, env);
  return git(['subtree', 'add', '--prefix', PREFIX, UPSTREAM_REF, '--squash'], { cwd: root, env });
}

/** Mounts the hub on a site that lacks it. Returns the hub's sha, or null when it was mounted already. */
function mountHub({ root, mount }, env) {
  if (mount === MOUNT.MOUNTED) return null;
  const result = subtreeAdd(root, env);
  if (result.ok) return gitOrThrow(['rev-parse', UPSTREAM_REF], { cwd: root, env, read: true });
  const message = `git subtree add stopped with exit code ${result.status}: ${result.stderr}`;
  throw new ScriptError(`${message}\nThe housekeeping commit stands. Fix what it says and run this again.`, EXIT.GIT);
}

/**
 * The lines a join writes where a site lacks them, in order. A site that left through shared:leave gets back
 * the lines it held just before, in their order: its own shared:verify as it was, and every command in the
 * form SITE_LINES gives now. A command added since comes after them.
 */
export function linesToWrite(root, env) {
  const own = linesBeforeLeave(root, env);
  return { ...own, ...SITE_LINES, [VERIFY_LINE_NAME]: own[VERIFY_LINE_NAME] ?? VERIFY_LINE };
}

/** The npm lines a site lacks, and comparePages. Returns true when package.json changed. */
function addManifestLines(root, env) {
  const pages = defaultPages(root);
  const lines = linesToWrite(root, env);
  return editManifest(root, (manifest) => {
    const held = manifest.scripts ?? {};
    const added = Object.entries(lines).filter(([name]) => held[name] === undefined);
    manifest.scripts = { ...held, ...Object.fromEntries(added) };
    manifest.comparePages ??= pages;
  });
}

/** Writes the theme's missing stubs. Returns their paths. */
function writeThemeStubs(root, theme) {
  const missing = theme.filter(({ exists }) => !exists);
  missing.forEach(({ row }) => writeStub(root, row));
  return missing.map(({ row }) => row.stub);
}

/** Replaces each copy of shared code with a stub. Returns the stubs' paths. */
function replaceCopies(root, components, env) {
  const copies = components.filter(({ state }) => state === COPY.SAME);
  for (const { row } of copies) {
    gitOrThrow(['rm', '-r', '-q', '--ignore-unmatch', '--', copyFolder(row)], { cwd: root, env });
    writeStub(root, row);
  }
  return copies.map(({ row }) => row.stub);
}

/** The npm lines, comparePages and the stubs, in one commit. */
function addSiteLines(root, env) {
  const table = requireTable(root, { exitCode: EXIT.CHECKS, missingFix: 'npm run shared:pull' });
  const { theme, components } = readCopies(root, path.join(root, PREFIX), table);
  const stubs = [...writeThemeStubs(root, theme), ...replaceCopies(root, components, env)];
  const manifestChanged = addManifestLines(root, env);
  const files = manifestChanged ? [MANIFEST_FILE, ...stubs] : stubs;
  return { manifestChanged, stubs, sha: commitFiles(root, files, SITE_LINES_SUBJECT, env) };
}

/** Lines the exclude file lacks, added. Nothing here reaches a commit. */
export function writeExcludes(root, wanted, env) {
  if (wanted.length === 0) return [];
  const relative = gitOrThrow(['rev-parse', '--git-path', 'info/exclude'], { cwd: root, env, read: true });
  const file = path.resolve(root, relative);
  const held = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const present = new Set(held.split('\n').map((line) => line.trim()));
  const added = wanted.filter((line) => !present.has(line));
  if (added.length === 0) return [];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const start = held === '' || held.endsWith('\n') ? held : `${held}\n`;
  fs.writeFileSync(file, `${start}${added.join('\n')}\n`);
  return added;
}

/** What the steps did, as lines. */
function doneLines({ house, hubSha, site, excluded }) {
  const lines = [];
  if (house.sha) lines.push(`  housekeeping: ${house.files.join(', ')}, in ${short(house.sha)}`);
  if (hubSha) lines.push(`  mounted ${PREFIX}/ at ${short(hubSha)}`);
  if (site.sha) lines.push(`  ${site.manifestChanged ? 'npm lines and ' : ''}${counted(site.stubs.length, 'stub')}, in ${short(site.sha)}`);
  if (excluded.length > 0) lines.push(`  .git/info/exclude gained ${excluded.join(', ')}`);
  return lines;
}

/** Prints what happened and what is left. */
function printEnd(job, root, done) {
  const lines = doneLines(done);
  job.print(lines.length > 0 ? `Joined ${root}:` : `Nothing to do in ${root}.`);
  lines.forEach((line) => job.print(line));
  const steps = byHandLines(readFacts({ ...job, offline: true, folder: root }));
  job.print(steps.length > 0 ? 'By hand, in this order:' : 'Nothing is left to do by hand.');
  steps.forEach((line) => job.print(line));
  job.print('Nothing was pushed. Then, in the site: npm run shared:status');
}

/** Refuses or joins. Every step looks first, so a run after a stop does what is left. */
export function runJoin(job) {
  const { env } = job;
  const facts = readFacts(job);
  refuseBlockers(checkResults(facts, env));
  const { root } = facts;
  refuseWhenListening(root, { script: SCRIPT });
  connectHub(facts, env);
  const house = housekeep(facts, env);
  const hubSha = mountHub(facts, env);
  const site = addSiteLines(root, env);
  const excluded = writeExcludes(root, job.exclude, env);
  printEnd(job, root, { house, hubSha, site, excluded });
  return EXIT.OK;
}

/** The folder to act on: the one named, or the repository this runs in. */
function folderOf(named, env) {
  if (named !== undefined) return path.resolve(named);
  return gitValue(['rev-parse', '--show-toplevel'], { env, read: true }) ?? process.cwd();
}

/** The script's entry point. */
function main() {
  const example = `npm run ${SCRIPT} -- ../my-site ${CHECK_FLAG}`;
  refuseNpmKeptOptions({ flags: FLAGS, script: SCRIPT, example });
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  const job = {
    folder: folderOf(args.folder, process.env),
    sharedRoot: SHARED_ROOT,
    env: process.env,
    offline: Boolean(args.offline),
    publicSite: Boolean(args.publicSite),
    exclude: args.exclude,
    print: console.log,
  };
  return args.check ? runCheck(job) : runJoin(job);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
