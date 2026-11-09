/**
 * scripts/lib/siblings.mjs: the one way a script finds the other sites on this machine. The hub
 * holds no list of sites, because its history is public. A site is any sibling folder whose
 * `.git/config` has a `shared` remote pointing at the same hub as this one.
 *
 * Remotes compare by host, owner and repo, so these are one hub:
 *   git@github.com:owner/repo.git   ssh://git@github.com/owner/repo   https://github.com/owner/repo
 * A local path compares by where it really is. That is how fixtures and scratch copies are found.
 *
 * It reads config files only: no git, about 30 ms over 50 folders. A file, a worktree, a dangling
 * symlink or an unreadable folder is simply not a site.
 *
 * A real mount with no `shared` remote is one of two things, told apart by its package.json. With its shared
 * npm lines it looks like a fresh clone, which a roll-out would miss, so the scripts warn. With none of them it
 * is a site that left the hub through `shared:leave`, and the scripts pass it by without a word.
 *
 * HOW TO CHANGE IT
 *   A new remote form: extend WEB_ADDRESS or SCP_ADDRESS, and add a row to the test.
 *   MOUNT_MARK is the file that says a folder without the remote still holds a real mount. Which npm lines
 *   are shared's: lib/siteLines.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PREFIX, REMOTE, remoteUrl } from './settings.mjs';
import { readScripts, sharedLineNames } from './siteLines.mjs';

const CONFIG_PATH = path.join('.git', 'config');

/** A file that a real mount always has, so an unrelated `shared/` folder raises no warning. */
const MOUNT_MARK = path.join(PREFIX, 'requirements.cjs');

const SECTION_LINE = /^\s*\[(.+)\]\s*$/;
const URL_LINE = /^\s*url\s*=\s*(.+?)\s*$/i;
const FILE_ADDRESS = /^file:\/\/(.+)$/i;
const WEB_ADDRESS = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/i;
const SCP_ADDRESS = /^(?:[^@/]+@)?([^:/]+):(.+)$/;

/** The path with its trailing slashes and `.git` removed. */
function repoPath(value) {
  return value.replace(/\/+$/, '').replace(/\.git$/, '');
}

/** The real path of something on disk, or the path as given. */
function realPath(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

/** The identity of a local repository path. A relative path is read from `base`, as git does. */
function localKey(address, base) {
  return `local:${repoPath(realPath(path.resolve(base, address)))}`;
}

/** The identity of a hub's address: host, owner and repo in lower case, or a local path. */
export function remoteKey(address, base = process.cwd()) {
  const fileAddress = address.match(FILE_ADDRESS);
  if (fileAddress) return localKey(fileAddress[1], base);
  const hosted = address.match(WEB_ADDRESS) ?? address.match(SCP_ADDRESS);
  if (!hosted) return localKey(address, base);
  const [, host, repo] = hosted;
  return `${host}/${repoPath(repo).replace(/^\/+/, '')}`.toLowerCase();
}

/** The first `url` of a remote's section in a git config text, or null. */
export function remoteUrlFromConfig(text, remote = REMOTE) {
  const wanted = `remote "${remote}"`;
  let inSection = false;
  for (const line of text.split('\n')) {
    const section = line.match(SECTION_LINE);
    if (section) {
      inSection = section[1] === wanted;
      continue;
    }
    const url = inSection ? line.match(URL_LINE) : null;
    if (url) return url[1].replace(/^"(.*)"$/, '$1');
  }
  return null;
}

/** A folder's git config, or null for anything that is not a main checkout we can read. */
function readConfig(folder) {
  try {
    return fs.readFileSync(path.join(folder, CONFIG_PATH), 'utf8');
  } catch {
    return null;
  }
}

/** The identity of the hub this checkout uses, falling back to the settings' hub. */
function hubKeyOf(root, env) {
  const config = readConfig(root);
  const address = config === null ? null : remoteUrlFromConfig(config);
  return remoteKey(address ?? remoteUrl(env), root);
}

/** True for a folder whose package.json reads and holds no shared npm line: a site that left. */
function hasLeft(folder) {
  const scripts = readScripts(folder);
  return scripts !== null && sharedLineNames(scripts).length === 0;
}

/** Sorts one sibling into the lists of findSiblings. */
function placeSibling(found, folder, config, wantedKey) {
  const entry = { name: path.basename(folder), root: folder };
  const address = remoteUrlFromConfig(config);
  if (address === null) {
    if (!fs.existsSync(path.join(folder, MOUNT_MARK))) return;
    (hasLeft(folder) ? found.left : found.withoutRemote).push(entry);
    return;
  }
  const sameHub = remoteKey(address, folder) === wantedKey;
  (sameHub ? found.sites : found.otherHub).push({ ...entry, remote: address });
}

/**
 * The other sites beside `root`, in name order:
 *   sites          same hub
 *   otherHub       a `shared` remote that points somewhere else
 *   withoutRemote  a real mount with no `shared` remote and its shared npm lines, so a roll-out would miss it
 *   left           a real mount with no `shared` remote and no shared npm line: it left the hub
 */
export function findSiblings(root, { env = process.env } = {}) {
  const here = realPath(root);
  const parent = path.dirname(here);
  const wantedKey = hubKeyOf(here, env);
  const found = { sites: [], otherHub: [], withoutRemote: [], left: [] };
  const seen = new Set([here]);
  for (const name of fs.readdirSync(parent).sort()) {
    const folder = realPath(path.join(parent, name));
    const config = seen.has(folder) ? null : readConfig(folder);
    if (config === null) continue;
    seen.add(folder);
    placeSibling(found, folder, config, wantedKey);
  }
  return found;
}
