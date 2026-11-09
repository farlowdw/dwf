/**
 * scripts/lib/joinFacts.mjs: what `shared:join` reads about a folder before it does anything. Both
 * `--check` and a real join start here, so the two can never disagree about a site.
 *
 * It writes nothing, so it may read any folder. Every git call here goes through `read: true`, which
 * sets GIT_OPTIONAL_LOCKS=0, and tracked changes come from `git status`, which can see through a stale
 * index. lib/checkout.mjs's dirtyPaths refreshes the index first, and that is a write. Package data comes from
 * package.json and the lock. .env is never opened, and netlify.toml only under --public, for its build command.
 *
 * HOW TO CHANGE IT
 *   A new fact: a small reader here and a key in readFacts. What a fact means belongs in lib/joinChecks.mjs.
 *   Names and lines: lib/joinSettings.mjs.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { MUI_SCOPE, MUI_X_PREFIX } from './bumpSettings.mjs';
import { isMainCheckout, currentBranch, readText, realPath } from './checkout.mjs';
import { git, gitValue } from './git.mjs';
import { deployLine } from './deployLine.mjs';
import { holdsEnv, planDeploy, planIgnore } from './joinHousekeeping.mjs';
import { readOnPush } from './joinNetlify.mjs';
import { patchFit } from './joinPatch.mjs';
import {
  CORE_PACKAGE, DOCS_PAGE, DOCS_PAGE_FILES, DOTENV_PACKAGE, ENV_FILE, GRID_COMPONENT, GRID_ILLUSTRATIONS, HOME_PAGE,
  IGNORE_FILE, IGNORE_TEMPLATE_FILE, MUI_PACKAGE, MUI_PATCH, PUBLIC_CHECK_LINE, SITE_LINES, VERIFY_LINE_NAME,
} from './joinSettings.mjs';
import { readCopies } from './joinStubs.mjs';
import { isPinned, rangeRows, readTemplatePin } from './pin.mjs';
import { firstVersion, parseVersion } from './range.mjs';
import { REQUIREMENTS_FILE, checkPackages, openSite, readLock, readManifest, readPieces } from './requirements.mjs';
import {
  MANIFEST_FILE, NETLIFY_FILE, NVMRC_FILE, PREFIX, REMOTE, REMOTE_URL_ENV, SCRIPTS_FOLDER, TEMPLATE_FOLDER, remoteUrl,
} from './settings.mjs';
import { remoteKey } from './siblings.mjs';
import { lastLeave } from './siteLines.mjs';

const require = createRequire(import.meta.url);

const HUB_REMOTE = 'origin';
const RECORD_LINE = `^git-subtree-dir: ${PREFIX}$`;

export const MOUNT = Object.freeze({ NONE: 'none', MOUNTED: 'mounted', FOREIGN: 'foreign' });
export const REMOTE_STATE = Object.freeze({ NONE: 'none', SAME: 'same', OTHER: 'other' });

/** The text as JSON, or null. */
function parsedJson(text) {
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** True for a folder that is there. */
function isFolder(folder) {
  return fs.statSync(folder, { throwIfNoEntry: false })?.isDirectory() ?? false;
}

/** Every file with a tracked change, read without touching the index. A leave reads its tree so too. */
export function changedFiles(options) {
  const args = ['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=no'];
  const entries = git(args, options).stdout.split('\0').filter((entry) => entry !== '');
  return entries.map((entry) => entry.slice('XY '.length));
}

/** The repository's own facts. Most stay unset outside a repository. */
function readRepository(root, env) {
  const options = { cwd: root, env, read: true };
  const top = gitValue(['rev-parse', '--show-toplevel'], options);
  const isRepo = top !== null && realPath(top) === root;
  if (!isRepo) return { isRepo, outerRepo: top };
  const has = (revision) => gitValue(['rev-parse', '--verify', '--quiet', revision], options) !== null;
  return {
    isRepo,
    hasCommit: has('HEAD^{commit}'),
    branch: currentBranch(root, env),
    mainCheckout: isMainCheckout(root, env),
    openMerge: has('MERGE_HEAD'),
    changed: changedFiles(options),
  };
}

/** True when git tracks the path. */
function isTracked(root, name, env) {
  const options = { cwd: root, env, read: true };
  return git(['ls-files', '--', name], options).stdout.trim() !== '';
}

/** The version Docusaurus stands on: the lock's, or the first one package.json's range names. */
function readDocusaurus(root) {
  const locked = readLock(root)?.(CORE_PACKAGE) ?? null;
  const range = readManifest(root)[CORE_PACKAGE];
  const version = locked ?? (range ? firstVersion(range) : null);
  const parsed = version === null ? null : parseVersion(version);
  return { version, major: parsed === null ? null : parsed.numbers[0] };
}

/** What the file holds, and how it stands in git. */
function readIgnore(root, repository, env, netlify, sharedRoot) {
  const text = readText(path.join(root, IGNORE_FILE));
  const tracked = repository.isRepo && isTracked(root, IGNORE_FILE, env);
  const listsEnv = text !== null && holdsEnv(text);
  const starter = readText(path.join(sharedRoot, TEMPLATE_FOLDER, IGNORE_TEMPLATE_FILE));
  return { text, tracked, listsEnv, plan: planIgnore(text, { keepNetlifyOut: netlify.onDisk && !netlify.tracked, starter }) };
}

/** Where netlify.toml stands. Its contents stay unread here. */
function readNetlify(root, repository, env) {
  const onDisk = fs.existsSync(path.join(root, NETLIFY_FILE));
  const tracked = repository.isRepo && isTracked(root, NETLIFY_FILE, env);
  return { onDisk, tracked };
}

/** Whether the mount is there, and whether git subtree put it there. */
function readMount(root, repository, env) {
  const onDisk = fs.existsSync(path.join(root, PREFIX));
  if (!repository.isRepo || !repository.hasCommit) return onDisk ? MOUNT.FOREIGN : MOUNT.NONE;
  const options = { cwd: root, env, read: true };
  const inHead = gitValue(['rev-parse', '--verify', '--quiet', `HEAD:${PREFIX}`], options) !== null;
  if (!inHead) return onDisk ? MOUNT.FOREIGN : MOUNT.NONE;
  const record = gitValue(['log', '-1', '--format=%H', '--grep', RECORD_LINE, 'HEAD'], options);
  return record ? MOUNT.MOUNTED : MOUNT.FOREIGN;
}

/** The address of the hub this script belongs to: the one a joining site gets. */
export function hubAddress(sharedRoot, env) {
  if (env[REMOTE_URL_ENV]) return env[REMOTE_URL_ENV];
  const options = { cwd: sharedRoot, env, read: true };
  const top = gitValue(['rev-parse', '--show-toplevel'], options);
  const inASite = top !== null && realPath(top) !== realPath(sharedRoot);
  return gitValue(['remote', 'get-url', inASite ? REMOTE : HUB_REMOTE], options) ?? remoteUrl(env);
}

/** The site's own `shared` remote against that hub. */
function readRemote(root, repository, hub, env) {
  if (!repository.isRepo) return { state: REMOTE_STATE.NONE, address: null };
  const address = gitValue(['remote', 'get-url', REMOTE], { cwd: root, env, read: true });
  if (address === null) return { state: REMOTE_STATE.NONE, address };
  const same = remoteKey(address, root) === remoteKey(hub, root);
  return { state: same ? REMOTE_STATE.SAME : REMOTE_STATE.OTHER, address };
}

/**
 * The template's MUI range against the site, or null when the template names none. `installRows` are every MUI
 * package of the template: shared/ needs them together, so one install line moves them together.
 */
function readMui(pin, root) {
  const manifest = readManifest(root);
  const rows = rangeRows(pin.ranges, manifest, readLock(root));
  const row = rows.find(({ name }) => name === MUI_PACKAGE);
  return row === undefined ? null : { ...row, installRows: rows.filter(({ name }) => name.startsWith(MUI_SCOPE)) };
}

/** The MUI X packages package.json lists. Their ranges for MUI stop an install of the next major. */
function readMuiX(declared) {
  return Object.keys(declared).filter((name) => name.startsWith(MUI_X_PREFIX)).sort();
}

/** How the patch fits a site that still has MUI to move, or null when it has nothing to move. */
function readPatch(root, mui, sharedRoot, env) {
  if (!mui?.outside) return null;
  return patchFit(root, path.join(sharedRoot, SCRIPTS_FOLDER, MUI_PATCH), env);
}

/**
 * The packages the shared pieces this site uses need, which neither its lock nor its package.json holds: a site with
 * no MUI gets the admonition stub from the join, and its first build stops without them. Docusaurus's own are left
 * out: the bump moves those.
 */
function readLacking(root, site, table) {
  try {
    const { problems } = checkPackages(root, table, readPieces(site, table));
    return problems.filter(({ name, found }) => found === null && !isPinned(name));
  } catch {
    return [];
  }
}

/** The lines of package.json the join would add, and the ones the site holds in another form. */
function readLines(manifest) {
  const scripts = manifest?.scripts ?? {};
  const names = Object.keys(SITE_LINES);
  const missing = [...names, VERIFY_LINE_NAME].filter((name) => scripts[name] === undefined);
  const differing = names.filter((name) => scripts[name] !== undefined && scripts[name] !== SITE_LINES[name]);
  return { missing, differing };
}

/** The pages a site starts with. */
export function defaultPages(root) {
  const hasDocsPage = DOCS_PAGE_FILES.some((file) => fs.existsSync(path.join(root, file)));
  return hasDocsPage ? [HOME_PAGE, DOCS_PAGE] : [HOME_PAGE];
}

/** The shared folder whose files a site is held against: its own mount, or this script's. */
function sharedFolderFor(root, mount, sharedRoot) {
  return mount === MOUNT.MOUNTED ? path.join(root, PREFIX) : sharedRoot;
}

/** Everything a join needs to know about `folder`. Reads, and only reads. */
export function readFacts({ folder, sharedRoot, env = process.env, offline = false, publicSite = false, exclude = [] }) {
  const root = realPath(path.resolve(folder));
  if (!isFolder(root)) return { root, missing: true };
  const manifest = parsedJson(readText(path.join(root, MANIFEST_FILE)));
  const repository = readRepository(root, env);
  const declared = manifest === null ? {} : readManifest(root);
  const hub = hubAddress(sharedRoot, env);
  const pin = readTemplatePin(path.join(sharedRoot, TEMPLATE_FOLDER));
  const netlify = readNetlify(root, repository, env);
  const mount = readMount(root, repository, env);
  const copiesRoot = sharedFolderFor(root, mount, sharedRoot);
  const table = require(path.join(copiesRoot, REQUIREMENTS_FILE));
  const site = openSite(root, env);
  const mui = readMui(pin, root);
  return {
    root,
    missing: false,
    sharedRoot,
    manifest,
    isSite: declared[CORE_PACKAGE] !== undefined,
    repository,
    hub,
    pin,
    docusaurus: readDocusaurus(root),
    ignore: readIgnore(root, repository, env, netlify, sharedRoot),
    envTracked: repository.isRepo && isTracked(root, ENV_FILE, env),
    netlify,
    deploy: planDeploy(manifest?.scripts?.deploy),
    hasNvmrc: fs.existsSync(path.join(root, NVMRC_FILE)),
    mui,
    muiX: readMuiX(declared),
    patch: readPatch(root, mui, sharedRoot, env),
    hasDotenv: declared[DOTENV_PACKAGE] !== undefined,
    hasGridComponent: [GRID_COMPONENT, GRID_ILLUSTRATIONS].some((folder) => fs.existsSync(path.join(root, folder))),
    mount,
    remote: readRemote(root, repository, hub, env),
    copies: readCopies(root, copiesRoot, table),
    lines: readLines(manifest),
    hasPages: Array.isArray(manifest?.comparePages),
    onPush: readOnPush(root, { env, offline }),
    runsPublicCheck: publicSite && deployLine(root).includes(PUBLIC_CHECK_LINE),
    configText: site.configText(),
    lacking: manifest === null ? [] : readLacking(root, site, table),
    hasLeft: repository.isRepo && repository.hasCommit ? lastLeave(root, env) !== null : false,
    publicSite,
    excluded: exclude.length > 0,
  };
}
