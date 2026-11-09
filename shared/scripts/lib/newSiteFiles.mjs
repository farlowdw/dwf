/**
 * scripts/lib/newSiteFiles.mjs: turns shared/template into a new site's own files. The template is read from
 * the new site's mount, never from the folder this script runs in, so the files always match the shared/ they
 * sit beside, whichever site or clone started the run. Only tracked files count, so a Mac's .DS_Store stays out.
 *
 * Three files change on the way:
 *   gitignore.template   becomes .gitignore. A real one in shared/template would act inside shared/
 *   package.json         takes the site's name and title, in place of the template's own description
 *   netlify.toml         a public site's build ends with the public check (lib/joinHousekeeping.mjs)
 *
 * Every text file then has its tokens filled. A title may hold a quote, so a JavaScript file gets it escaped
 * for the single-quoted string it sits in. A token left over means a template newer than this script, and it
 * stops the run before anything is committed.
 *
 * HOW TO CHANGE IT
 *   A new token: lib/newSiteSettings.mjs > TOKENS, and tokenValues here. A new file to shape: a row in SHAPES.
 *   Where each kind of file gets its escaping: escaped.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { gitOrThrow } from './git.mjs';
import { planNetlify } from './joinHousekeeping.mjs';
import { IGNORE_FILE, IGNORE_TEMPLATE_FILE } from './joinSettings.mjs';
import { ANY_TOKEN, TEMPLATE_PATH, TOKENS } from './newSiteSettings.mjs';
import { MANIFEST_FILE, NETLIFY_FILE } from './settings.mjs';

const JSON_INDENT = 2;
const JS_FILE = /\.(?:js|jsx|mjs|cjs)$/;
const NUL_BYTE = 0;

/** The name a template file takes in the site. */
function siteName(file) {
  return file === IGNORE_TEMPLATE_FILE ? IGNORE_FILE : file;
}

/** The template's package.json with the site's own name and description. */
function shapeManifest(text, { name, title }) {
  const manifest = JSON.parse(text);
  manifest.name = name;
  manifest.description = title;
  return `${JSON.stringify(manifest, null, JSON_INDENT)}\n`;
}

/** The files that change on the way, each with what changes it. */
const SHAPES = Object.freeze({
  [MANIFEST_FILE]: shapeManifest,
  [NETLIFY_FILE]: (text, { publicSite }) => planNetlify(text, { publicSite }),
});

/** Each token with the value that replaces it. */
function tokenValues({ title, url, repo }) {
  return { [TOKENS.title]: title, [TOKENS.url]: url, [TOKENS.repo]: repo };
}

/** A value as it may stand in this file: inside a single-quoted string, in JavaScript. */
function escaped(value, file) {
  return JS_FILE.test(file) ? value.replaceAll('\\', '\\\\').replaceAll("'", "\\'") : value;
}

/** The text with its tokens filled. A function, so a `$` in a title stays a `$`. */
export function fillTokens(text, values, file) {
  return Object.entries(values).reduce((filled, [token, value]) => filled.replaceAll(token, () => escaped(value, file)), text);
}

/** True for a file that is no text, which goes across as it is. */
function isBinary(bytes) {
  return bytes.includes(NUL_BYTE);
}

/** What one template file becomes. */
function siteFile(bytes, file, site) {
  if (isBinary(bytes)) return bytes;
  const text = bytes.toString('utf8');
  const shaped = SHAPES[file] ? SHAPES[file](text, site) : text;
  return fillTokens(shaped, tokenValues(site), file);
}

/** The tracked files of the template in a new site's mount, from the template's folder. */
export function templateFiles(root, env) {
  const listed = gitOrThrow(['ls-files', '-z', '--', TEMPLATE_PATH], { cwd: root, env, read: true });
  return listed.split('\0').filter((name) => name !== '').map((name) => path.posix.relative(TEMPLATE_PATH, name));
}

/** The tokens this text still holds. */
function leftTokens(content) {
  return typeof content === 'string' ? content.match(ANY_TOKEN) ?? [] : [];
}

/** Refuses a template this script cannot fill. */
function refuseLeftTokens(written) {
  const left = [...new Set(written.flatMap(({ content }) => leftTokens(content)))];
  if (left.length === 0) return;
  const message = `The template holds ${left.join(', ')}, which this script does not fill. Run it from a site at the hub's tip.`;
  throw new ScriptError(message, EXIT.CHECKS);
}

/** Writes the site's files from its mount, and returns their paths from the site's root. */
export function writeSiteFiles(site, env) {
  const { root } = site;
  const written = templateFiles(root, env).map((file) => {
    const bytes = fs.readFileSync(path.join(root, TEMPLATE_PATH, file));
    return { file: siteName(file), content: siteFile(bytes, file, site) };
  });
  refuseLeftTokens(written);
  for (const { file, content } of written) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  return written.map(({ file }) => file);
}
