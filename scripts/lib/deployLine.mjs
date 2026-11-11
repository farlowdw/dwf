/**
 * scripts/lib/deployLine.mjs: the one line that publishes what a run just tested, for shared:bump and
 * shared:all to print. It is one chained line because fish runs on after a failed line, and it uses
 * `--no-build` because the build in build/ is the one the suites and the compare read.
 *
 * `--no-build` skips the command in netlify.toml's [build], so a public site's check of its build has
 * to be chained in by hand: it is read from that command. This file reads that one line of netlify.toml
 * and prints only the check's own command. shared:pull puts the same check in front of its `git push`
 * (publicCheck): a plain `npm run build` does not run it either, and a push to a public site stays.
 *
 * HOW TO CHANGE IT
 *   DEPLOY_STEPS is the line. PUBLIC_CHECK is what a [build] command's check looks like.
 */

import fs from 'node:fs';
import path from 'node:path';
import { NETLIFY_FILE } from './settings.mjs';

const DEPLOY_STEPS = Object.freeze(['git push', 'netlify deploy --prod --no-build']);

/** A `command = "..."` line that runs a check-public script. A commented-out line does not count. */
const PUBLIC_CHECK = /^[ \t]*command[ \t]*=.*?(node[ \t]+\S*check-public\.mjs)/m;

/** The public check of this site's build command, or null. */
export function publicCheck(root) {
  try {
    return fs.readFileSync(path.join(root, NETLIFY_FILE), 'utf8').match(PUBLIC_CHECK)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** The line to paste, with a site's public check first when it has one. */
export function deployLine(root) {
  const check = publicCheck(root);
  return [...(check === null ? [] : [check]), ...DEPLOY_STEPS].join(' && ');
}
