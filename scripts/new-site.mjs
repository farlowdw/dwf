#!/usr/bin/env node
/**
 * scripts/new-site.mjs: `npm run shared:new`. It makes a new site from template/, proves it, and prints the
 * hosting steps. Run it from any joined site, or from a clone of the hub with `node scripts/new-site.mjs`.
 *
 *     npm run shared:new -- ../my-site --title "My site" --url https://my-site.example.com --repo owner/my-site
 *     npm run shared:new -- --help      the other options
 *
 * In this order, and a step that fails stops the rest:
 *   1. it reads the arguments, refuses a folder that holds anything, and asks the hub, so nothing is made
 *      when it cannot run;
 *   2. git init and a first empty commit, because git subtree add refuses without a commit;
 *   3. adds the `shared` remote, fetches, refreshes git's index and runs git subtree add --squash;
 *   4. fills the template from that mount and commits it (lib/newSiteFiles.mjs);
 *   5. npm install, a cold build, shared:verify, and on a public site the public check;
 *   6. commits the lock, and prints one fish block for the hosting steps (lib/newSiteHosting.mjs).
 *
 * Nothing is pushed and nothing is deployed. It runs neither gh nor netlify: the block is printed, not run.
 *
 * `--public` makes the build in netlify.toml end with the public check, and the block make a public repository
 * with no wall. `--exclude <path>` writes a path to .git/info/exclude, which no commit carries: a public site's
 * .gitignore must not name a tool's private folder.
 *
 * It exits 0 when done, 2 on bad arguments, 3 when a step went red, 4 when it refused and made nothing, and 5
 * when git failed. See lib/exitCodes.mjs. After a red the folder stays as it stood, and the message says so.
 *
 * HOW TO CHANGE IT
 *   Names, shapes and subjects: lib/newSiteSettings.mjs. The files: template/ and lib/newSiteFiles.mjs. The
 *   block: lib/newSiteHosting.mjs. A new option goes in OPTIONS, FLAGS and USAGE. The order of the steps is
 *   `runNewSite`, and a step is one short function above it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runLogged } from './lib/bumpRun.mjs';
import { INSTALL_ARGS, INSTALL_TIMEOUT_SECONDS, VERIFY_TIMEOUT_SECONDS } from './lib/bumpSettings.mjs';
import { FETCH_FIX } from './lib/checks.mjs';
import { EXIT, ScriptError, runScript } from './lib/exitCodes.mjs';
import { git, gitOrThrow, gitValue } from './lib/git.mjs';
import { hubAddress } from './lib/joinFacts.mjs';
import {
  CONTROL_CHARACTER, FILES_SUBJECT, HUB_TIMEOUT_MS, LOCK_SUBJECT, LOGS_PREFIX, NAME_SHAPE, NETLIFY_HOST_END, PROJECT_SHAPE,
  PUBLIC_CHECK_SCRIPT, REPO_SHAPE, ROOT_PATH, SCRIPT, START_SUBJECT, URL_PROTOCOL, WORD_FILE_FLAG,
} from './lib/newSiteSettings.mjs';
import { writeSiteFiles } from './lib/newSiteFiles.mjs';
import { hostingBlock } from './lib/newSiteHosting.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { counted, short } from './lib/phrases.mjs';
import { refusal } from './lib/preflight.mjs';
import { readWordList } from './lib/privacy.mjs';
import { BRANCH, LOCK_FILE, PREFIX, REMOTE, SITE_BRANCH, UPSTREAM_REF, npmCommand, wordListPath } from './lib/settings.mjs';
import { buildAfter, failureOf, gateJob, red, runSuites, stepLine, timedStep } from './lib/siteGate.mjs';
import { fetchHub, fetchReason } from './lib/state.mjs';
import { commitFiles, subtreeAdd, writeExcludes } from './join.mjs';

/** The shared folder this script belongs to: a site's shared/, or a clone of the hub. */
const SHARED_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const OPTIONS = Object.freeze({
  title: { type: 'string' },
  url: { type: 'string' },
  repo: { type: 'string' },
  public: { type: 'boolean' },
  exclude: { type: 'string', multiple: true },
  'verify-timeout': { type: 'string' },
  help: { type: 'boolean' },
});
const FLAGS = Object.keys(OPTIONS).map((name) => `--${name}`);
const WHOLE_SECONDS = /^\d+$/;
const REQUIRED_OPTIONS = Object.freeze(['title', 'url', 'repo']);
const USAGE = [
  'Usage: npm run shared:new -- <folder> --title <words> --url <address> --repo <owner/name> [options]',
  '  <folder>             the new site, from where you run this. New or empty, and in no repository',
  '  --title <words>      its title',
  '  --url <address>      where it will live: https, and no path',
  '  --repo <owner/name>  its GitHub repository',
  '  --public             a public site: its build ends with the public check, and it has no wall',
  '  --exclude <path>     also write this path to .git/info/exclude. Repeat it for more',
  `  --verify-timeout <s> how long the site's suites may run. Default: ${VERIFY_TIMEOUT_SECONDS}`,
  '  --help               this list',
].join('\n');

/** A usage error, with the list of options. */
function usageError(sentence) {
  return new ScriptError(`${sentence}\n${USAGE}`, EXIT.USAGE);
}

/** The options as node reads them, or a usage error. */
function readOptions(argv) {
  try {
    return parseArgs({ args: argv, options: { ...OPTIONS }, allowPositionals: true, strict: true });
  } catch (error) {
    throw usageError(error.message);
  }
}

/** The address as a URL, or null when it is none. */
function parsedUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** True for https at the root of a host, with nothing else in the address. */
function isPlainSite(url) {
  const extras = [url.search, url.hash, url.username, url.port];
  return url.protocol === URL_PROTOCOL && url.pathname === ROOT_PATH && extras.every((part) => part === '');
}

/** The address as a plain origin, or a usage error. */
function originOf(value) {
  const url = parsedUrl(value);
  if (url === null || !isPlainSite(url)) {
    throw usageError(`--url ${value} must be https, at the root of its host, with nothing after it.`);
  }
  return url.origin;
}

/** The named folder, from where this runs. */
function folderNamed(positionals) {
  if (positionals.length !== 1) throw usageError('Name one folder.');
  const [folder] = positionals;
  const name = path.basename(path.resolve(folder));
  if (!NAME_SHAPE.test(name)) {
    throw usageError(`The folder's name ${name} becomes the package's name: lower case, with no spaces.`);
  }
  return { folder, name, root: path.resolve(folder) };
}

/** The three values every site needs. */
function requiredValues(values) {
  const missing = REQUIRED_OPTIONS.filter((name) => values[name] === undefined || values[name].trim() === '');
  if (missing.length > 0) throw usageError(`Give ${missing.map((name) => `--${name}`).join(', ')}.`);
  if (CONTROL_CHARACTER.test(values.title)) throw usageError('--title must be one line.');
  if (!REPO_SHAPE.test(values.repo)) throw usageError(`--repo ${values.repo} must read owner/name.`);
  return { title: values.title.trim(), url: originOf(values.url), repo: values.repo };
}

/**
 * The Netlify project's name: the one a netlify.app address holds, or else the folder's. It must suit the
 * netlify CLI, or the block it goes in stops halfway, after the GitHub repository was made.
 */
function projectOf(url, name) {
  const { hostname } = new URL(url);
  const onNetlify = hostname.endsWith(NETLIFY_HOST_END);
  const project = onNetlify ? hostname.slice(0, -NETLIFY_HOST_END.length) : name;
  if (onNetlify && !PROJECT_SHAPE.test(project)) {
    throw usageError(`--url ${url}: a Netlify address is <project>${NETLIFY_HOST_END}, with letters, digits and hyphens in <project>.`);
  }
  if (!PROJECT_SHAPE.test(project)) {
    throw usageError(`The folder's name ${name} becomes the Netlify project's name, which takes only letters, digits and hyphens: name the folder so, or give a --url on ${NETLIFY_HOST_END.slice(1)}.`);
  }
  return project;
}

/** The request as one object, or a usage error. `help` needs nothing else. */
export function readRequest(argv) {
  const { values, positionals } = readOptions(argv);
  if (values.help) return { help: true };
  const { exclude = [] } = values;
  const folder = folderNamed(positionals);
  const required = requiredValues(values);
  const verifyTimeout = verifyTimeoutOf(values['verify-timeout']);
  return { ...folder, ...required, project: projectOf(required.url, folder.name), publicSite: Boolean(values.public), exclude, verifyTimeout };
}

/** --verify-timeout as seconds, or the default. */
function verifyTimeoutOf(text) {
  if (text === undefined) return VERIFY_TIMEOUT_SECONDS;
  if (!WHOLE_SECONDS.test(text) || Number(text) === 0) throw usageError(`--verify-timeout wants seconds, and reads ${text}.`);
  return Number(text);
}

/** What a folder holds, or null when it is not a folder. A folder not there yet holds nothing. */
function entriesOf(root) {
  if (!fs.existsSync(root)) return [];
  return fs.statSync(root).isDirectory() ? fs.readdirSync(root) : null;
}

/** The nearest folder that exists, at or above `folder`. */
function nearestFolder(folder) {
  return fs.existsSync(folder) ? folder : nearestFolder(path.dirname(folder));
}

/** A site inside another repository would be a repository in that one's tree. */
function refuseInsideRepository({ root, folder }, env) {
  const inside = gitValue(['rev-parse', '--show-toplevel'], { cwd: nearestFolder(root), env, read: true });
  if (inside === null) return;
  throw refusal(SCRIPT, `${folder} sits inside a repository.`, { fix: 'name a folder beside this site, such as ../my-site' });
}

/** The folder must be new or empty. */
function refuseTarget(request, env) {
  const { root, folder } = request;
  const entries = entriesOf(root);
  const fix = 'name a new folder';
  if (entries === null) throw refusal(SCRIPT, `${folder} is a file.`, { fix });
  if (entries.length > 0) throw refusal(SCRIPT, `${folder} is not empty: it holds ${counted(entries.length, 'entry')}.`, { fix });
  refuseInsideRepository(request, env);
}

/** A public site's last step reads the word list, so its absence stops the run here. */
function refuseNoWordList({ publicSite }, env) {
  if (!publicSite) return;
  const list = readWordList(wordListPath(env));
  if (!list.missing) return;
  const fix = 'fill in the file: see What never goes in, in the README of the shared folder';
  throw refusal(SCRIPT, `a public site needs the word list, and it is missing or empty at ${list.file}.`, { fix });
}

/** Asks the hub for its branch, so a hub out of reach makes nothing. */
function refuseNoHub(hub, env) {
  const answer = git(['ls-remote', '--exit-code', hub, BRANCH], { env, timeout: HUB_TIMEOUT_MS, read: true, group: true });
  if (answer.ok) return;
  const reason = fetchReason(answer).map((line) => `  ${line}`);
  const lines = [`Could not reach the hub at ${hub}, so nothing was made. git said:`, ...reason, `Fix: ${FETCH_FIX}, then run this again.`];
  throw new ScriptError(lines.join('\n'), EXIT.GIT);
}

/** What is left after a stop part way. */
function leftLine({ folder }) {
  return `${folder} stands as this step left it. Delete that folder, then run this again.`;
}

/** The error of a git step that stopped part way. */
function gitStop(request, command, { status, stderr }) {
  return new ScriptError(`${command} stopped with exit code ${status}: ${stderr}\n${leftLine(request)}`, EXIT.GIT);
}

/** The repository with its first commit, and the hub mounted. Returns the hub's sha. */
function startRepository(request, hub, env) {
  const { root } = request;
  const options = { cwd: root, env };
  fs.mkdirSync(root, { recursive: true });
  gitOrThrow(['init', '-q', '-b', SITE_BRANCH], options);
  gitOrThrow(['commit', '-q', '--allow-empty', '-m', START_SUBJECT], options);
  gitOrThrow(['remote', 'add', REMOTE, hub], options);
  const fetched = fetchHub(root, env);
  if (!fetched.ok) throw gitStop(request, 'git fetch', fetched);
  const mounted = subtreeAdd(root, env);
  if (!mounted.ok) throw gitStop(request, 'git subtree add', mounted);
  return gitOrThrow(['rev-parse', UPSTREAM_REF], { ...options, read: true });
}

/** npm install, which also writes the lock. */
async function install(job) {
  const { env, root, stepEnv, print } = job;
  const command = npmCommand(env);
  const options = { command, args: [...INSTALL_ARGS], cwd: root, env: stepEnv, timeoutSeconds: INSTALL_TIMEOUT_SECONDS };
  const result = await timedStep(job, 'install', (logFile) => runLogged({ ...options, logFile }));
  if (result.code !== 0) throw red(job, 'the install', failureOf(result), result.logFile);
  print(stepLine('install', `ok, ${result.seconds} s`));
}

/** The public check, run the way a deploy runs it, on the build just made. */
async function checkPublic(job) {
  const { env, root, stepEnv, print } = job;
  const args = [PUBLIC_CHECK_SCRIPT, WORD_FILE_FLAG, wordListPath(env)];
  const options = { command: process.execPath, args, cwd: root, env: stepEnv };
  const result = await timedStep(job, 'public', (logFile) => runLogged({ ...options, logFile }));
  if (result.code !== 0) throw red(job, 'the public check', failureOf(result), result.logFile);
  print(stepLine('public', 'ok, the public check'));
}

/** The install, the build, the site's suites and, on a public site, the public check. */
async function proveSite(request, job) {
  await install(job);
  await buildAfter(job);
  await runSuites(job);
  if (request.publicSite) await checkPublic(job);
}

/** The folder for this run's logs. */
function logsFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), LOGS_PREFIX));
}

/** Prints what was made, then the block. */
function printEnd(request, print) {
  print(`Made ${request.folder}. Nothing was pushed or deployed.`);
  print('The hosting steps are yours: paste this block in fish, and it stops at the first line that fails.');
  print('');
  hostingBlock(request).forEach((line) => print(line));
}

/** Everything that stands in the way, before anything is made. Returns the hub's address. */
function refuseOrFindHub({ request, env, sharedRoot }) {
  refuseTarget(request, env);
  refuseNoWordList(request, env);
  const hub = hubAddress(sharedRoot, env);
  refuseNoHub(hub, env);
  return hub;
}

/** The site's files in one commit, and the private lines of the exclude file. */
function addSiteFiles({ request, env, print }) {
  const { root, exclude } = request;
  const files = writeSiteFiles(request, env);
  const sha = commitFiles(root, files, FILES_SUBJECT, env);
  print(stepLine('files', `${counted(files.length, 'file')} from the template, in ${short(sha)}`));
  const excluded = writeExcludes(root, exclude, env);
  if (excluded.length > 0) print(stepLine('exclude', `.git/info/exclude gained ${excluded.join(', ')}`));
}

/** Installs, builds and proves the site, then commits the lock. The logs go once the site is green. */
async function proveAndLock({ request, env, print }) {
  const { root } = request;
  const keep = logsFolder();
  const scriptsFolder = path.join(root, PREFIX, 'scripts');
  const { verifyTimeout } = request;
  await proveSite(request, gateJob({ root, env, print, keep, scriptsFolder, verifyTimeout, undoLines: () => [leftLine(request)] }));
  const sha = commitFiles(root, [LOCK_FILE], LOCK_SUBJECT, env);
  print(stepLine('lock', `committed, in ${short(sha)}`));
  fs.rmSync(keep, { recursive: true, force: true });
}

/** Refuses, or makes the site. A red leaves the folder and says so. */
export async function runNewSite(job) {
  const { request, env, print } = job;
  const hub = refuseOrFindHub(job);
  const hubSha = startRepository(request, hub, env);
  print(stepLine('mounted', `${PREFIX}/ at ${short(hubSha)}`));
  addSiteFiles(job);
  await proveAndLock(job);
  printEnd(request, print);
  return EXIT.OK;
}

/** The script's entry point. */
async function main() {
  const example = 'npm run shared:new -- ../my-site --title "My site" --url https://example.com --repo owner/my-site';
  refuseNpmKeptOptions({ flags: FLAGS, script: SCRIPT, example });
  const request = readRequest(process.argv.slice(2));
  if (request.help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  return runNewSite({ request, sharedRoot: SHARED_ROOT, env: process.env, print: console.log });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
