/**
 * scripts/lib/pin.mjs: the one version pin. shared/template/package.json and the .nvmrc beside it say
 * which Docusaurus and which Node every site runs. `shared:status` reads a site against them here.
 *
 * The pin covers @docusaurus/* only: one exact version, on every entry. React and MUI stay ranges in
 * the template, and a site's lock is read against them for information, never as a failure.
 *
 * What it answers, all of it read from files apart from askNewest:
 *   readPin          the pin itself, and what is wrong with the template
 *   docusaurusEntries, looseEntries, pinDrift   a site's package.json and lock against the pin
 *   lockedVersions   every @docusaurus version the lock holds, anywhere in its tree
 *   nodeProblems     the site's .nvmrc and netlify.toml against the template's .nvmrc
 *   rangeRows        the React and MUI ranges against the lock
 *   askNewest        the newest Docusaurus on npm
 *   versionOnNpm, versionsOnNpm   whether npm has one version, and every version it has
 *   hubPin           the pin as the hub holds it, read from the fetched commit
 *   pinBefore        the pin the site's history held before this one, and pinBackLine, the line that goes back to it
 * The three npm questions are the only lines here that use the network.
 *
 * HOW TO CHANGE IT
 *   Move the pin: edit shared/template/package.json, .nvmrc and NODE_VERSION in netlify.toml, not this file. A package under
 *   @docusaurus/ that keeps version numbers of its own goes in SEPARATELY_VERSIONED. Another package
 *   for the information line goes in INFORMATION_PACKAGES. A new line of the report is a function
 *   here and a check in checks.mjs.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readText } from './checkout.mjs';
import { git } from './git.mjs';
import { compareVersions, parseVersion, satisfies } from './range.mjs';
import {
  LOCK_FILE, MANIFEST_FILE, NETLIFY_FILE, NVMRC_FILE, PREFIX, TEMPLATE_FOLDER, UPSTREAM_REF, npmCommand,
} from './settings.mjs';

/** The packages the pin covers, and the word the report calls them by. */
export const DOCUSAURUS_SCOPE = '@docusaurus/';
export const DOCUSAURUS_LABEL = '@docusaurus';

/** Under the scope, on their own version numbers, and so outside the pin. */
const SEPARATELY_VERSIONED = new Set(['@docusaurus/react-loadable', '@docusaurus/responsive-loader']);

/** The ranges the information line prints, in this order. */
const INFORMATION_PACKAGES = ['react', 'react-dom', '@mui/material', '@mui/icons-material'];

/** What marks a package's folder in a lock's keys. */
const NODE_MODULES = 'node_modules/';

/** A NODE_VERSION line of netlify.toml. A commented-out line does not count. */
const NETLIFY_NODE_LINE = /^[ \t]*NODE_VERSION[ \t]*=[ \t]*["']?([^"'\s#]+)/gm;

/** npm answers with the version its `latest` tag points at. No retries: a failure is only a line. */
const NEWEST_PACKAGE = '@docusaurus/core';
const NEWEST_ARGS = ['view', NEWEST_PACKAGE, 'version', '--fetch-retries=0'];
const NEWEST_TIMEOUT_MS = 10000;

/** The text as JSON, or null when it is not JSON. */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The file as JSON, or null when it is missing or not JSON. */
function readJson(file) {
  const text = readText(file);
  return text === null ? null : parseJson(text);
}

/** True for a name the pin covers. */
export function isPinned(name) {
  return name.startsWith(DOCUSAURUS_SCOPE) && !SEPARATELY_VERSIONED.has(name);
}

/** True for a version text naming exactly one version. */
function isExact(spec) {
  return parseVersion(spec) !== null;
}

/** A manifest's dependencies and devDependencies under the pin: [{ name, spec }], by name. */
export function docusaurusEntries(manifest) {
  const names = Object.keys(manifest).filter(isPinned).sort();
  return names.map((name) => ({ name, spec: manifest[name] }));
}

/** The one version the template's entries agree on, and what is wrong with them. */
function readTemplateVersion(entries) {
  if (entries.length === 0) return { version: null, problems: [`it lists no ${DOCUSAURUS_LABEL} package`] };
  const loose = entries.filter(({ spec }) => !isExact(spec));
  const problems = loose.map(({ name, spec }) => `${name} is ${spec}, not one exact version`);
  const versions = [...new Set(entries.map(({ spec }) => spec).filter(isExact))];
  if (versions.length > 1) problems.push(`it holds ${versions.length} versions: ${versions.join(', ')}`);
  return { version: problems.length === 0 ? versions[0] : null, problems };
}

/** The ranges of INFORMATION_PACKAGES the template lists: { name: range }. */
function readRanges(manifest) {
  const listed = INFORMATION_PACKAGES.filter((name) => manifest[name] !== undefined);
  return Object.fromEntries(listed.map((name) => [name, manifest[name]]));
}

/**
 * The pin as a template folder states it: { version, node, ranges, problems }. `version` and `node` are
 * null when the template does not give one, and `problems` then says why.
 */
export function readTemplatePin(folder) {
  const template = readJson(path.join(folder, MANIFEST_FILE));
  const nodeText = readText(path.join(folder, NVMRC_FILE));
  const node = nodeText === null ? null : nodeText.trim();
  const nodeProblem = node ? [] : [`${NVMRC_FILE} is missing or empty`];
  if (template === null) {
    return { version: null, node, ranges: {}, problems: [`${MANIFEST_FILE} is missing or not JSON`, ...nodeProblem] };
  }
  const { version, problems } = versionOfTemplate(template);
  const ranges = readRanges({ ...template.dependencies, ...template.devDependencies });
  return { version, node, ranges, problems: [...problems, ...nodeProblem] };
}

/** { version, problems } as the template's package.json states them. */
function versionOfTemplate(template) {
  return readTemplateVersion(docusaurusEntries({ ...template.dependencies, ...template.devDependencies }));
}

/**
 * The pin as the hub holds it, read from the site's last fetch: { version, problems }. A site behind the hub
 * holds an older pin in its own shared/, so a run that moves every site reads this one.
 */
export function hubPin(root, env = process.env) {
  const name = `${UPSTREAM_REF}:${TEMPLATE_FOLDER}/${MANIFEST_FILE}`;
  const { ok, stdout } = git(['show', name], { cwd: root, env, read: true });
  const template = ok ? parseJson(stdout) : null;
  return template === null ? { version: null, problems: [`the hub has no readable ${MANIFEST_FILE} in its template`] } : versionOfTemplate(template);
}

/** How many commits that touched the template's package.json pinBefore reads, newest first. */
const PIN_HISTORY_COMMITS = 20;

/** The template's package.json as a path in a site, for git. */
const SITE_PIN_FILE = `${PREFIX}/${TEMPLATE_FOLDER}/${MANIFEST_FILE}`;

/** The pin as one commit of a site holds it, or null. */
function pinAt(root, commit, env) {
  const { ok, stdout } = git(['show', `${commit}:${SITE_PIN_FILE}`], { cwd: root, env, read: true });
  const template = ok ? parseJson(stdout) : null;
  return template === null ? null : versionOfTemplate(template).version;
}

/**
 * The pin this site held before `version`: the pin at the parent of the newest commit, on the first-parent line,
 * that moved it to `version`. A pin a pull brought and one this site published read alike. Null when no commit
 * within reach moved it, as on a site that took its first shared/ with the pin as it is.
 */
export function pinBefore(root, version, env = process.env) {
  const args = ['log', '--first-parent', `--max-count=${PIN_HISTORY_COMMITS}`, '--format=%H', 'HEAD', '--', SITE_PIN_FILE];
  const { ok, stdout } = git(args, { cwd: root, env, read: true });
  if (!ok) return null;
  for (const sha of String(stdout).split('\n').filter(Boolean)) {
    const before = pinAt(root, `${sha}^`, env);
    if (before !== version) return before;
  }
  return null;
}

/**
 * The line that puts every site's pin back at `version`: what a `shared:all -- bump <version>` that stopped after
 * publishing its pin prints, and what shared:status names beside the bump.
 */
export function pinBackLine(version) {
  return `npm run shared:all -- bump ${version} --yes`;
}

/** The pin as a site's mounted template states it. */
export function readPin(root) {
  return readTemplatePin(path.join(root, PREFIX, TEMPLATE_FOLDER));
}

/** Entries that name no exact version: a caret, a tilde, a tag, anything npm may move. */
export function looseEntries(entries) {
  return entries.filter(({ spec }) => !isExact(spec));
}

/** True when an entry stands off the pin, in package.json or in the lock. */
function isOffPin({ name, spec }, version, versionOf) {
  if (isExact(spec) && spec.replace(/^v/, '') !== version) return true;
  return versionOf !== null && versionOf(name) !== version;
}

/** The entries off the pin: [{ name, spec, locked }]. `versionOf` is null when the site has no lock. */
export function pinDrift(entries, version, versionOf) {
  const drifted = entries.filter((entry) => isOffPin(entry, version, versionOf));
  return drifted.map(({ name, spec }) => ({ name, spec, locked: versionOf ? versionOf(name) : null }));
}

/** The package a lock key installs, or null for the root and for a linked folder. */
export function installedName(key) {
  const start = key.lastIndexOf(NODE_MODULES);
  return start === -1 ? null : key.slice(start + NODE_MODULES.length);
}

/**
 * Every @docusaurus version in the lock's tree: a Map from a version to the names holding it, or
 * null without a lock. A key counts by its last folder, so a package nested under a @docusaurus
 * package is not one of them, and an alias such as react-loadable counts as what it is installed as.
 */
export function lockedVersions(root) {
  const lock = readJson(path.join(root, LOCK_FILE));
  if (lock === null) return null;
  const versions = new Map();
  for (const [key, { version }] of Object.entries(lock.packages ?? {})) {
    const name = installedName(key);
    if (name !== null && version && isPinned(name)) {
      versions.set(version, [...(versions.get(version) ?? []), name]);
    }
  }
  return versions;
}

/** True when a site's Node version is the pin, or a closer form of it: 22.18.0 passes a pin of 22. */
function nodeMatches(value, wanted) {
  const plain = value.replace(/^v/, '');
  return plain === wanted || plain.startsWith(`${wanted}.`);
}

/** What is wrong with the site's .nvmrc, as a list of sentences. */
function nvmrcProblems(root, wanted) {
  const text = readText(path.join(root, NVMRC_FILE));
  if (text === null || text.trim() === '') return [`${NVMRC_FILE} is missing`];
  const value = text.trim();
  return nodeMatches(value, wanted) ? [] : [`${NVMRC_FILE} says ${value}`];
}

/** What is wrong with the site's netlify.toml. Only NODE_VERSION's value is ever read out of it. */
function netlifyProblems(root, wanted) {
  const text = readText(path.join(root, NETLIFY_FILE));
  if (text === null) return [`no ${NETLIFY_FILE}`];
  const values = [...text.matchAll(NETLIFY_NODE_LINE)].map((match) => match[1]);
  if (values.length === 0) return [`${NETLIFY_FILE} sets no NODE_VERSION`];
  const off = values.filter((value) => !nodeMatches(value, wanted));
  return off.map((value) => `${NETLIFY_FILE} says NODE_VERSION ${value}`);
}

/** What keeps the site's Node away from the pin, as a list of sentences. */
export function nodeProblems(root, wanted) {
  return [...nvmrcProblems(root, wanted), ...netlifyProblems(root, wanted)];
}

/**
 * The template's React and MUI ranges against the site: [{ name, range, found, outside }]. `found` is
 * the lock's version, or package.json's text without a lock, or null. Only a locked version can be
 * outside: this line reports, and a site that does not use a package is no finding.
 */
export function rangeRows(ranges, manifest, versionOf) {
  return Object.entries(ranges).map(([name, range]) => {
    const locked = versionOf ? versionOf(name) : null;
    const found = locked ?? manifest[name] ?? null;
    return { name, range, found, outside: locked !== null && !satisfies(locked, range) };
  });
}

/** The newest Docusaurus on npm, or null when npm did not give a version. */
export function askNewest({ root, env = process.env, timeoutMs = NEWEST_TIMEOUT_MS }) {
  const options = { cwd: root, env, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] };
  const { status, stdout } = spawnSync(npmCommand(env), NEWEST_ARGS, options);
  if (status !== 0) return null;
  const answer = stdout.trim();
  return parseVersion(answer) === null ? null : answer;
}

/** True when npm answers for exactly this Docusaurus version. A version npm lacks, or no answer, is false. */
export function versionOnNpm({ root, env = process.env, version, timeoutMs = NEWEST_TIMEOUT_MS }) {
  const options = { cwd: root, env, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] };
  const args = ['view', `${NEWEST_PACKAGE}@${version}`, 'version', '--fetch-retries=0'];
  const { status, stdout } = spawnSync(npmCommand(env), args, options);
  return status === 0 && (stdout ?? '').trim().split('\n').at(-1) === version;
}

/**
 * Every Docusaurus version npm has, oldest first as npm lists them, or null when npm gave no list. npm prints one
 * version as a plain string, and a list of several as an array.
 */
export function versionsOnNpm({ root, env = process.env, timeoutMs = NEWEST_TIMEOUT_MS }) {
  const options = { cwd: root, env, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] };
  const args = ['view', NEWEST_PACKAGE, 'versions', '--json', '--fetch-retries=0'];
  const { status, stdout } = spawnSync(npmCommand(env), args, options);
  if (status !== 0) return null;
  const answer = parseJson((stdout ?? '').trim());
  const versions = typeof answer === 'string' ? [answer] : answer;
  if (!Array.isArray(versions)) return null;
  return versions.filter((version) => typeof version === 'string' && parseVersion(version) !== null);
}

/** True when `newest` is a later version than `version`. */
export function isNewer(newest, version) {
  return compareVersions(parseVersion(newest), parseVersion(version)) > 0;
}
