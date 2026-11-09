/**
 * scripts/lib/joinHousekeeping.mjs: what a site's own files must hold before it mounts shared/, worked
 * out as text so `--check` can say it and a join can write it. Nothing here touches the disk or git.
 *
 *   planIgnore    the .gitignore a joined site needs
 *   planDeploy    the deploy line
 *   planNetlify   the netlify.toml a site without one gets
 *
 * Four things in the old ignore files matter:
 *   - A line that ignores .gitignore itself means no fresh Mac has any of the rules.
 *   - `netlify.toml` without a slash also ignores shared/template/netlify.toml, and status then fails.
 *     A netlify.toml already on disk and out of git may hold a password wall's value, so it stays out:
 *     the line gets its slash, and a person reads the file before tracking it.
 *   - `/node_modules` holds only at the root, so a stray shared/node_modules would show as new files. Beside a
 *     `node_modules` line it changes nothing, so it stays: the joined sites hold both, and a second join, the way
 *     back after `shared:leave` among them, must find nothing to fix.
 *   - `.env` and `.netlify` must be listed in the site itself: a global ignore may hold .env back on one
 *     machine, and a fresh Mac has none.
 *
 * HOW TO CHANGE IT
 *   A line every joined site must hold: REQUIRED_LINES, with the pattern that counts as holding it. A line
 *   that must go: SELF_IGNORE_LINES or a new set like it, and a step in planIgnore. The file a site with
 *   no .gitignore gets is template/gitignore.template, which a caller reads and hands in as `starter`.
 */

import {
  DEPLOY_LINE, DEPLOY_SIGN, IGNORE_FILE, OLD_DEPLOY_LINE, PLAIN_BUILD_LINE, PUBLIC_BUILD_LINE,
} from './joinSettings.mjs';
import { NETLIFY_FILE } from './settings.mjs';

const SELF_IGNORE_LINES = new Set([IGNORE_FILE, `/${IGNORE_FILE}`]);
const NETLIFY_LINES = new Set([NETLIFY_FILE, `/${NETLIFY_FILE}`]);
const ROOT_NODE_MODULES_LINES = new Set(['/node_modules', '/node_modules/']);

const NODE_MODULES_LINE = 'node_modules';
const NODE_MODULES_HELD = /^node_modules\/?$/;
const ANCHORED_NETLIFY_LINE = `/${NETLIFY_FILE}`;

const ENV_HELD = /^\/?\.env\*?$/;

/** The lines a joined site's .gitignore holds, each with what counts as already holding it. */
const REQUIRED_LINES = Object.freeze([
  { line: NODE_MODULES_LINE, held: NODE_MODULES_HELD },
  { line: '.env', held: ENV_HELD },
  { line: '.netlify', held: /^\/?\.netlify\/?$/ },
]);

const ADDED_HEADING = '# Kept out of git on any machine';

/** The lines of a file, each with its line ending and outer spaces gone. */
function plainLines(text) {
  return text.split('\n').map((line) => line.trim());
}

/** A sentence saying what one step changes, kept only when `count` is above 0. */
function noted(count, sentence) {
  return count > 0 ? [sentence] : [];
}

/** The lines with the old rules taken out or corrected, and what that changed. */
function correctOldLines(lines, keepNetlifyOut) {
  const kept = [];
  const changes = [];
  const anyFolder = lines.some((line) => NODE_MODULES_HELD.test(line.trim()));
  for (const line of lines) {
    const bare = line.trim();
    if (SELF_IGNORE_LINES.has(bare)) {
      changes.push(`drops the line that ignores ${IGNORE_FILE} itself`);
    } else if (NETLIFY_LINES.has(bare)) {
      if (keepNetlifyOut) kept.push(ANCHORED_NETLIFY_LINE);
      if (!keepNetlifyOut) changes.push(`drops the ${NETLIFY_FILE} line`);
      else if (bare !== ANCHORED_NETLIFY_LINE) changes.push(`anchors the ${NETLIFY_FILE} line`);
    } else if (ROOT_NODE_MODULES_LINES.has(bare) && !anyFolder) {
      kept.push(NODE_MODULES_LINE);
      changes.push(`widens ${bare} to ${NODE_MODULES_LINE}`);
    } else {
      kept.push(line);
    }
  }
  return { kept, changes };
}

/** True when the file's lines keep .env out of git. */
export function holdsEnv(text) {
  return plainLines(text).some((line) => ENV_HELD.test(line));
}

/** The required lines the file does not hold yet. */
function missingLines(lines) {
  const held = plainLines(lines.join('\n'));
  const isHeld = ({ held: pattern }) => held.some((line) => pattern.test(line));
  return REQUIRED_LINES.filter((row) => !isHeld(row)).map(({ line }) => line);
}

/** The text with the missing lines added at its end, under one heading. */
function withAddedLines(lines, missing) {
  if (missing.length === 0) return lines;
  const body = lines.join('\n').trimEnd().split('\n');
  return [...body, '', ADDED_HEADING, ...missing, ''];
}

/**
 * The .gitignore a joined site needs: { text, changes }, where `changes` is empty when it is fine as it
 * is. `text` is the file or null, and `starter` the template's file for a site without one.
 * `keepNetlifyOut` says a netlify.toml sits on disk out of git.
 */
export function planIgnore(text, { keepNetlifyOut, starter }) {
  if (text === null) return { text: starter, changes: [`writes a new ${IGNORE_FILE}`] };
  const { kept, changes } = correctOldLines(text.split('\n'), keepNetlifyOut);
  const missing = missingLines(kept);
  const added = noted(missing.length, `adds ${missing.join(', ')}`);
  return { text: withAddedLines(kept, missing).join('\n'), changes: [...changes, ...added] };
}

/** { line, state }: the deploy line a site needs, and whether it is `ok`, `replace` or `own`. */
export function planDeploy(current) {
  if (current === undefined || current === OLD_DEPLOY_LINE) return { line: DEPLOY_LINE, state: 'replace' };
  return current.includes(DEPLOY_SIGN) ? { line: current, state: 'ok' } : { line: current, state: 'own' };
}

/** The template's netlify.toml as a site gets it. A public site's build ends with the public check. */
export function planNetlify(templateText, { publicSite }) {
  return publicSite ? templateText.replace(PLAIN_BUILD_LINE, PUBLIC_BUILD_LINE) : templateText;
}
