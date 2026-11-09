/**
 * scripts/lib/joinPatch.mjs: how the MUI patch fits one site. The patch moves a site's own components to
 * MUI 9. Not every site holds every file, and a site may have changed one, so `git apply` would stop at the
 * first that does not fit. This asks git about each file on its own, and gives the one line that applies what
 * fits. A file left out that the site holds is one it changed: the join's list names it, to move by hand. It only
 * asks: `git apply --check` writes nothing.
 *
 * HOW TO CHANGE IT
 *   The patch is scripts/patches/, and the path in lib/joinSettings.mjs. DIFF_LINE is how a file starts in it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';
import { MUI_PATCH } from './joinSettings.mjs';
import { PREFIX } from './settings.mjs';

/** The patch as a person types it in a site. */
export const SHOWN_PATCH = `${PREFIX}/scripts/${MUI_PATCH}`;

const DIFF_LINE = /^diff --git a\/(\S+) b\//gm;

/** The files a patch changes, from a site's root, in its order. */
export function patchedFiles(patchFile) {
  const text = fs.readFileSync(patchFile, 'utf8');
  return [...text.matchAll(DIFF_LINE)].map((match) => match[1]);
}

/** True when git could apply this one file of the patch to the folder as it stands. */
function fits(root, patchFile, file, env) {
  return git(['apply', '--check', `--include=${file}`, patchFile], { cwd: root, env, read: true }).ok;
}

/**
 * { fitting, leftOut, changed }: the patch's files that apply here, those that do not, and of those the ones
 * the site holds, which it has changed, so the patch cannot move them.
 */
export function patchFit(root, patchFile, env = process.env) {
  const files = patchedFiles(patchFile);
  const fitting = files.filter((file) => fits(root, patchFile, file, env));
  const leftOut = files.filter((file) => !fitting.includes(file));
  const changed = leftOut.filter((file) => fs.existsSync(path.join(root, file)));
  return { fitting, leftOut, changed };
}

/** The line that applies what fits. */
export function applyLine(leftOut, patch = SHOWN_PATCH) {
  const excludes = leftOut.map((file) => `--exclude=${file}`);
  return ['git', 'apply', ...excludes, patch].join(' ');
}
