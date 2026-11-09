/**
 * scripts/lib/bumpUndo.mjs: the lines that put a site's packages back, for the undo `shared:bump` and
 * `shared:all` print. Each line goes through here, so what a red prints and what a person runs are one thing.
 *
 * `npm ci` is all of it on most sites. A new major is the exception. Its overrides go in by hand, in a commit of
 * their own before the bump, because npm install needs them and a bump needs a clean tree. That commit's
 * package.json holds the old @docusaurus entries under an override at the new version, so `npm ci` itself
 * stops at ERESOLVE there, and node_modules stays on the new version.
 *
 * So on such a commit the undo installs from the last package.json npm can read: that file goes in place, `npm ci`
 * runs, and git puts the file back. A by-hand override leaves the lock alone, so the lock still fits. An older
 * package.json that lists other packages would not fit it, and then the line says what to take out by hand.
 *
 * HOW TO CHANGE IT
 *   The commands: the constants below. What counts as shut out: blockedEntries in lib/bumpLock.mjs.
 */

import { CHANGED_FILES } from './bumpSettings.mjs';
import { DEPENDENCY_BLOCKS, blockedEntries } from './bumpLock.mjs';
import { gitValue } from './git.mjs';
import { short } from './phrases.mjs';
import { MANIFEST_FILE } from './settings.mjs';

/** Puts both package files back as the last commit holds them. */
export const CHECKOUT_LINE = `git checkout -- ${CHANGED_FILES.join(' ')}`;

/** How printed steps join: `&&`, because fish runs on after a failed line. */
export const CHAIN = ' && ';

const INSTALL_LINE = 'npm ci';
const RESTORE_MANIFEST_LINE = `git checkout -- ${MANIFEST_FILE}`;

/** A commit's package.json, or null when it holds none that can be read. */
function manifestAt(root, commit, env) {
  const text = gitValue(['show', `${commit}:${MANIFEST_FILE}`], { cwd: root, env, read: true });
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

/** True when two manifests list the same packages at the same specs: the one lock fits both. */
function sameEntries(first, second) {
  const entriesOf = (manifest) => JSON.stringify(DEPENDENCY_BLOCKS.map((block) => manifest[block]));
  return entriesOf(first) === entriesOf(second);
}

/** The newest commit at or below `commit` whose package.json npm can read with this lock, or null. */
function lastInstallable(root, commit, manifest, env) {
  const shas = gitValue(['log', '--format=%H', commit, '--', MANIFEST_FILE], { cwd: root, env, read: true }) ?? '';
  for (const sha of shas.split('\n').filter(Boolean)) {
    const older = manifestAt(root, sha, env);
    if (older !== null && blockedEntries(older).length === 0) return sameEntries(older, manifest) ? sha : null;
  }
  return null;
}

/** The first step on a commit whose own package.json stops `npm ci`. */
function clearOverrides(root, commit, manifest, env) {
  const clean = lastInstallable(root, commit, manifest, env);
  if (clean !== null) return `git show ${short(clean)}:${MANIFEST_FILE} > ${MANIFEST_FILE}`;
  return `take overrides > ${blockedEntries(manifest).join(', ')} out of ${MANIFEST_FILE} by hand`;
}

/** The steps that install what `commit` holds, with the tree on that commit. */
export function installSteps(root, commit, env) {
  const manifest = manifestAt(root, commit, env);
  if (manifest === null || blockedEntries(manifest).length === 0) return [INSTALL_LINE];
  return [clearOverrides(root, commit, manifest, env), INSTALL_LINE, RESTORE_MANIFEST_LINE];
}
