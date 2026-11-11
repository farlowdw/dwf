/**
 * scripts/lib/siteLines.mjs: which npm lines of a site belong to shared/, and what a folder holds of them.
 * `shared:leave` takes exactly these lines out, `shared:join` puts them back, and the sibling finder reads a
 * mount with none of them and no `shared` remote as a site that left the hub, not as a fresh clone.
 *
 * A shared line is every line named `shared:<something>`, the site's own `shared:verify` among them, and
 * every other line SITE_LINES names, which is `test:shared`.
 *
 * It reads package.json and git's history. Its one writer, editManifest, is how a join and a leave change
 * package.json: in the file's own indent, so the rest of the file does not move.
 *
 * HOW TO CHANGE IT
 *   The lines a join writes: SITE_LINES in lib/joinSettings.mjs. What counts as shared's: isSharedLine. The
 *   commit a leave makes, which a join reads to put the site's own lines back: LEAVE_SUBJECT.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readText } from './checkout.mjs';
import { gitValue } from './git.mjs';
import { SITE_LINES, VERIFY_LINE_NAME } from './joinSettings.mjs';
import { MANIFEST_FILE } from './settings.mjs';

/** The command that takes a site out of the hub. */
export const LEAVE_SCRIPT = 'shared:leave';

/** Every line with a name that starts so is shared's. */
export const SHARED_LINE_PREFIX = 'shared:';

/** The subject of the one commit `shared:leave` makes. It reaches public history on a public site. */
export const LEAVE_SUBJECT = 'Leave the shared hub, keeping shared/ as plain files';

/** How that commit's body opens. A join finds the commit by this line too, so a reworded subject still counts. */
export const LEAVE_BODY_START = 'The shared npm lines go and the shared remote with them.';

/** The names SITE_LINES holds without the prefix. */
const OTHER_NAMES = new Set([...Object.keys(SITE_LINES), VERIFY_LINE_NAME].filter((name) => !name.startsWith(SHARED_LINE_PREFIX)));

/** Characters a regular expression reads as more than themselves. */
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/** How package.json indents its first key, and the indent when it says nothing. */
const JSON_INDENT = /^([ \t]+)"/m;
const DEFAULT_INDENT = '  ';

/** True for a line of package.json that belongs to shared/. */
export function isSharedLine(name) {
  return name.startsWith(SHARED_LINE_PREFIX) || OTHER_NAMES.has(name);
}

/** The shared lines among `scripts`, in their order there. */
export function sharedLineNames(scripts = {}) {
  return Object.keys(scripts).filter(isSharedLine);
}

/** The scripts of a package.json text, or null when it is missing or not JSON. A file with none gives {}. */
export function scriptsOf(text) {
  if (text === null) return null;
  try {
    const scripts = JSON.parse(text).scripts;
    return scripts && typeof scripts === 'object' ? scripts : {};
  } catch {
    return null;
  }
}

/** The scripts of a folder's package.json, or null when it cannot be read. */
export function readScripts(root) {
  return scriptsOf(readText(path.join(root, MANIFEST_FILE)));
}

/** The newest commit of `shared:leave` in HEAD's history, by its subject or by its body's first line, or null. */
export function lastLeave(root, env = process.env) {
  const subject = `^${LEAVE_SUBJECT.replace(REGEX_SPECIAL, '\\$&')}$`;
  const body = `^${LEAVE_BODY_START.replace(REGEX_SPECIAL, '\\$&')}`;
  const sha = gitValue(['log', '-1', '--format=%H', '--grep', subject, '--grep', body, 'HEAD'], { cwd: root, env, read: true });
  return sha || null;
}

/**
 * The shared lines a site held just before its last leave, as { name: line }, or {} when it never left.
 * A join puts the site's own lines back from here, so `shared:verify` comes back as the site wrote it.
 */
export function linesBeforeLeave(root, env = process.env) {
  const sha = lastLeave(root, env);
  if (sha === null) return {};
  const text = gitValue(['show', `${sha}^:${MANIFEST_FILE}`], { cwd: root, env, read: true });
  const scripts = scriptsOf(text) ?? {};
  return Object.fromEntries(sharedLineNames(scripts).map((name) => [name, scripts[name]]));
}

/** The manifest's own indent, so the rest of the file does not move. */
function indentOf(text) {
  return text.match(JSON_INDENT)?.[1] ?? DEFAULT_INDENT;
}

/** Applies `change` to the site's package.json. Returns true when the file changed. */
export function editManifest(root, change) {
  const file = path.join(root, MANIFEST_FILE);
  const before = fs.readFileSync(file, 'utf8');
  const manifest = JSON.parse(before);
  change(manifest);
  const after = `${JSON.stringify(manifest, null, indentOf(before))}\n`;
  if (after === before) return false;
  fs.writeFileSync(file, after);
  return true;
}
