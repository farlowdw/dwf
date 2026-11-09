/**
 * scripts/lib/hubChanges.mjs: what a pull would bring, read from the fetched commits before anything
 * is merged. shared:pull scans these, because a file that lands in a site reaches that site's history,
 * and a public site publishes it with its next git push. Paths come back as a site sees them, under
 * shared/, so the word list's allow lines read the same here and in shared:status.
 *
 * A binary file comes back too, marked `binary`, so the word list reads a picture, a PDF or a font as
 * shared:status does (lib/privacy.mjs > readTexts). A reader of lines skips it: textFilesOf.
 *
 * HOW TO CHANGE IT
 *   What counts as binary: lib/privacy.mjs > isBinary.
 */

import { git } from './git.mjs';
import { isBinary } from './privacy.mjs';
import { PREFIX } from './settings.mjs';

/** One file at a hub commit: { text, binary }. Its bytes are read as UTF-8, as readTexts reads them. */
function fileAt(root, sha, file, env) {
  const { stdout } = git(['cat-file', 'blob', `${sha}:${file}`], { cwd: root, env, read: true, encoding: 'buffer' });
  return { text: stdout.toString('utf8'), binary: isBinary(stdout) };
}

/** The files that differ between two hub commits: { paths, texts }. A deleted file is left out. */
export function hubChanges(root, from, to, env) {
  const args = ['diff', '--name-only', '--no-renames', '--diff-filter=d', '-z', from, to];
  const { stdout } = git(args, { cwd: root, env, read: true });
  const files = stdout.split('\0').filter(Boolean);
  const texts = files.map((file) => ({ path: `${PREFIX}/${file}`, ...fileAt(root, to, file, env) }));
  return { paths: files.map((file) => `${PREFIX}/${file}`), texts };
}
