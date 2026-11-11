/**
 * __tests__/sharedTree.mjs: how the tests in this folder read the shared folder. Its root, its
 * files, the site around it (if any), and a source file with its comments gone and its strings set
 * aside, so that a commented-out line or a string that merely looks like an import proves nothing.
 *
 * The same files run in the hub, where this folder's parent is the repository, and in a site, where
 * it is shared/ and the site is one level up. Nothing here needs a package from npm.
 *
 * HOW TO CHANGE IT
 *   NEVER_WALKED: folders no test reads. TEMPLATE_FOLDER: the folder of a new site's files, which
 *   some tests skip on purpose. CONFIG_FILE: what makes the parent of a folder named shared a site.
 *   maskSource, stripComments and unquote live in scripts/lib/sourceText.mjs, which the scripts read a
 *   site's config through too: change them there. exactExists reads names letter for letter, as a
 *   case-sensitive disk does.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREFIX } from '../scripts/lib/settings.mjs';

export { maskSource, stripComments, unquote } from '../scripts/lib/sourceText.mjs';

/** This folder's parent: the hub's root, or shared/ in a site. */
export const SHARED_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A new site's files. They import @site and name site things on purpose. */
export const TEMPLATE_FOLDER = 'template';

const NEVER_WALKED = new Set(['.git', 'node_modules']);

/** Files a Mac writes by itself. */
const SYSTEM_FILES = new Set(['.DS_Store']);

const CONFIG_FILE = 'docusaurus.config.js';

/**
 * Every file below `folder`, as paths from it with forward slashes. A NEVER_WALKED name is left out whatever it
 * is, so a node_modules that is a link to a site's packages, as a test run beside them uses, is no file here.
 */
function walk(folder, prefix, found) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (NEVER_WALKED.has(entry.name)) continue;
    if (entry.isDirectory()) {
      walk(path.join(folder, entry.name), `${relative}/`, found);
    } else if (!SYSTEM_FILES.has(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

/** True for a path inside template/. */
export function isTemplatePath(filePath) {
  return filePath.startsWith(`${TEMPLATE_FOLDER}/`);
}

/** Every file of the shared folder from its root, sorted. */
export function sharedFiles({ root = SHARED_ROOT, skipTemplate = false } = {}) {
  const files = walk(root, '', []).sort();
  return skipTemplate ? files.filter((file) => !isTemplatePath(file)) : files;
}

/** The text of a shared file, by its path from the root. */
export function readShared(filePath, root = SHARED_ROOT) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

/** The site this folder is mounted in, or null in the hub. */
export function hostSite(root = SHARED_ROOT) {
  const parent = path.dirname(root);
  const isMount = path.basename(root) === PREFIX;
  return isMount && fs.existsSync(path.join(parent, CONFIG_FILE)) ? parent : null;
}

/**
 * A test of whether a path, from `root`, names a file or folder with exactly these letters. macOS finds a file
 * whatever its case, so existsSync passes './Problems' for problems.js there, and a build on Linux then fails. This
 * reads each folder's own listing, kept per folder, and compares one part at a time. A path that climbs out of
 * `root` reads false.
 */
export function exactExists(root = SHARED_ROOT) {
  const listings = new Map();
  const listing = (folder) => {
    if (!listings.has(folder)) {
      let names = [];
      try {
        names = fs.readdirSync(folder);
      } catch {
        names = [];
      }
      listings.set(folder, new Set(names));
    }
    return listings.get(folder);
  };
  return (relative) => {
    const normal = path.posix.normalize(relative.replace(/^\/+/, ''));
    if (normal === '..' || normal.startsWith('../')) return false;
    let folder = root;
    for (const part of normal.split('/').filter((piece) => piece !== '' && piece !== '.')) {
      if (!listing(folder).has(part)) return false;
      folder = path.join(folder, part);
    }
    return true;
  };
}
