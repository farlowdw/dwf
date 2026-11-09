/**
 * scripts/lib/bumpBuild.mjs: the two builds of `shared:bump`. Both sides of the compare must be the same
 * shape, so this is the one way a build is made: cold, with BUILD_ENV, by the site's own `npm run build`.
 *
 * The site's current build can stand in for the "before" side only when it is at least as new as the
 * last commit and has that same shape. A plain `npm run build` on a site that sets the shape in .env
 * is minified, and two sides of different shapes would differ on every page. It must also be newer than
 * every file an undo puts back. After a red run and its undo the last commit is old, build/ is the build
 * that went red, and a second run would compare that build with itself and read "0 changed".
 *
 * The "before" build is copied out of the repository and left in place, so a failed install leaves
 * build/ as it was. On a disk that can clone files the copy costs nothing.
 *
 * HOW TO CHANGE IT
 *   The shape and the folders: bumpSettings.mjs. What keeps a build from standing in: rebuildReason.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runLogged } from './bumpRun.mjs';
import {
  BUILD_ARGS, BUILD_ENV, BUILD_FOLDER, BUILD_SHAPE_START, BUILD_TIMEOUT_SECONDS, CHANGED_FILES, COLD_FOLDERS,
} from './bumpSettings.mjs';
import { BUILD_ENTRY, MS_PER_SECOND, PREFIX, npmCommand } from './settings.mjs';

const NO_BUILD = 'there is no build/';
const OLD_BUILD = 'build/ is older than the last commit';
const OTHER_SHAPE = 'build/ is another shape: its HTML is minified';
const CHANGED_SINCE = 'a package file or shared/ changed after build/ was made';

/** The site's first page, or null. */
function readEntry(root) {
  try {
    return fs.readFileSync(path.join(root, BUILD_FOLDER, BUILD_ENTRY), 'utf8');
  } catch {
    return null;
  }
}

/** When a path last changed, in ms, or 0 when it is gone. A link counts as itself. */
function changedAt(file) {
  try {
    return fs.lstatSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/** The newest change among the two package files and everything under shared/. */
function newestChange(root) {
  const mount = path.join(root, PREFIX);
  const below = fs.existsSync(mount) ? fs.readdirSync(mount, { recursive: true }).map((name) => path.join(mount, name)) : [];
  const files = [...CHANGED_FILES.map((name) => path.join(root, name)), ...below];
  return files.reduce((newest, file) => Math.max(newest, changedAt(file)), 0);
}

/** Why the current build cannot stand in, or null when it can. */
export function rebuildReason(root, lastCommitSeconds) {
  const page = readEntry(root);
  if (page === null) return NO_BUILD;
  const builtMs = fs.statSync(path.join(root, BUILD_FOLDER, BUILD_ENTRY)).mtimeMs;
  if (builtMs < lastCommitSeconds * MS_PER_SECOND) return OLD_BUILD;
  if (builtMs < newestChange(root)) return CHANGED_SINCE;
  return BUILD_SHAPE_START.test(page) ? null : OTHER_SHAPE;
}

/** Clears what a cold build starts without, then runs the site's build. Resolves as runLogged does. */
export function coldBuild({ root, env, logFile }) {
  for (const folder of COLD_FOLDERS) fs.rmSync(path.join(root, folder), { recursive: true, force: true });
  const command = npmCommand(env);
  const options = { cwd: root, env: { ...env, ...BUILD_ENV }, logFile, timeoutSeconds: BUILD_TIMEOUT_SECONDS };
  return runLogged({ command, args: [...BUILD_ARGS], ...options });
}

/** Copies build/ to `folder`, cloning files where the disk can. */
export function keepBuild(root, folder) {
  const options = { recursive: true, mode: fs.constants.COPYFILE_FICLONE };
  fs.cpSync(path.join(root, BUILD_FOLDER), folder, options);
}

/** True when build/ holds a site's first page. */
export function hasBuild(root) {
  return fs.existsSync(path.join(root, BUILD_FOLDER, BUILD_ENTRY));
}
