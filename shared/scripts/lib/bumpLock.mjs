/**
 * scripts/lib/bumpLock.mjs: what `shared:bump` does to package.json, the lock and node_modules, and
 * what it reads back from them afterwards.
 *
 * Why the lock is cut by hand. With every @docusaurus entry made exact, a plain `npm install` can keep
 * an old version nested under a package that asked for a range, and then two versions sit in one
 * tree: one site of nine failed 46 paths that way. Taking the entries out first leaves npm one version
 * to place, and it moved fewer other packages too. A package nested below a removed one goes with it,
 * because nothing else in the lock says why it is there.
 *
 * The pin covers what pin.mjs says it covers: react-loadable and responsive-loader keep their numbers.
 *
 * What a new major needs by hand comes from two places, read before the install: an `overrides` entry that
 * shuts the version out (overrideLines), and a package in the lock whose peer range does, with no entry
 * yet (peerOverrideLines). A peer range is read as npm reads it, because npm is what stops at ERESOLVE.
 *
 * HOW TO CHANGE IT
 *   What a bump may move: MUI_SCOPE and MUI_X_PREFIX in bumpSettings.mjs. The pure functions take and
 *   return plain objects, so __tests__/bumpLock.test.mjs reaches every case without npm.
 */

import fs from 'node:fs';
import path from 'node:path';
import { HIDDEN_LOCK, MUI_SCOPE, MUI_X_PREFIX } from './bumpSettings.mjs';
import { docusaurusEntries, installedName, isPinned, lockedVersions } from './pin.mjs';
import { firstVersion, fullVersionOf, parseVersion, satisfies, satisfiesAsNpm } from './range.mjs';
import { LOCK_FILE, MANIFEST_FILE } from './settings.mjs';

const NODE_MODULES_START = 'node_modules/';
/** The blocks of package.json a bump changes, and an undo compares. */
export const DEPENDENCY_BLOCKS = Object.freeze(['dependencies', 'devDependencies']);

/** npm's way of saying "the version of this other entry" in an override. */
const OVERRIDE_REFERENCE = '$';

/** The version an override's key may carry: "a-plugin@2" sets the override for that version of a-plugin. */
const VERSION_IN_KEY = /(?<=.)@.*$/;

const DEFAULT_INDENT = '  ';
const FIRST_INDENT = /^[ \t]+/m;

/** The file as JSON. */
function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The site's package.json. */
export function readManifest(root) {
  return readJson(path.join(root, MANIFEST_FILE));
}

/** The site's lock. */
export function readLock(root) {
  return readJson(path.join(root, LOCK_FILE));
}

/** The manifest's @docusaurus entries under the pin: [{ name, spec }]. */
export function pinnedEntries(manifest) {
  return docusaurusEntries({ ...manifest.dependencies, ...manifest.devDependencies });
}

/** A copy of the manifest with every entry under the pin at `version`. */
export function rewriteManifest(manifest, version) {
  const copy = structuredClone(manifest);
  for (const block of DEPENDENCY_BLOCKS) {
    for (const name of Object.keys(copy[block] ?? {})) {
      if (isPinned(name)) copy[block][name] = version;
    }
  }
  return copy;
}

/** JSON in the file's own layout, so the diff holds the changed lines and nothing else. */
function sameLayout(oldText, value) {
  const indent = oldText.match(FIRST_INDENT)?.[0] ?? DEFAULT_INDENT;
  const ending = oldText.endsWith('\n') ? '\n' : '';
  return `${JSON.stringify(value, null, indent)}${ending}`;
}

/** Writes every entry under the pin into package.json. Returns how many there are. */
export function writeManifest(root, version) {
  const file = path.join(root, MANIFEST_FILE);
  const text = fs.readFileSync(file, 'utf8');
  const manifest = rewriteManifest(JSON.parse(text), version);
  fs.writeFileSync(file, sameLayout(text, manifest));
  return pinnedEntries(manifest).length;
}

/** The lock keys of packages under the pin, wherever they sit in the tree. */
function pinnedKeys(lock) {
  return Object.keys(lock.packages ?? {}).filter((key) => {
    const name = installedName(key);
    return name !== null && isPinned(name);
  });
}

/** The lock keys to take out: `keys`, and everything nested below one of them. */
function withNestedKeys(lock, keys) {
  const below = keys.map((key) => `${key}/`);
  return Object.keys(lock.packages ?? {}).filter((key) => keys.includes(key) || below.some((start) => key.startsWith(start)));
}

/** { lock, removed }: a copy of the lock without the pin's packages, and the keys it lost. */
export function cutLock(lock) {
  const removed = withNestedKeys(lock, pinnedKeys(lock));
  const packages = Object.fromEntries(Object.entries(lock.packages ?? {}).filter(([key]) => !removed.includes(key)));
  return { lock: { ...lock, packages }, removed };
}

/** Takes the pin's packages out of the lock and out of node_modules. Returns how many went. */
export function cutInstalled(root) {
  const file = path.join(root, LOCK_FILE);
  const text = fs.readFileSync(file, 'utf8');
  const { lock, removed } = cutLock(JSON.parse(text));
  fs.writeFileSync(file, sameLayout(text, lock));
  for (const key of removed.filter((name) => name.startsWith(NODE_MODULES_START))) {
    fs.rmSync(path.join(root, key), { recursive: true, force: true });
  }
  fs.rmSync(path.join(root, HIDDEN_LOCK), { force: true });
  return removed.length;
}

/** True when every entry names `version` exactly and the lock holds that version alone. */
export function isOnVersion(root, version) {
  const entries = pinnedEntries(readManifest(root));
  const locked = lockedVersions(root);
  if (locked === null || locked.size !== 1 || !locked.has(version)) return false;
  return entries.length > 0 && entries.every(({ spec }) => spec === version);
}

/** The direct entries whose folder in node_modules does not hold `version`: [{ name, found }]. */
export function installedOffVersion(root, entries, version) {
  const found = entries.map(({ name }) => ({ name, found: installedVersion(root, name) }));
  return found.filter((entry) => entry.found !== version);
}

/** The direct entries whose folder in node_modules is not what package.json asks for: [{ name, spec, found }]. */
export function installedOffManifest(root, entries) {
  const found = entries.map(({ name, spec }) => ({ name, spec, found: installedVersion(root, name) }));
  return found.filter((entry) => firstVersion(entry.spec) !== null && !satisfies(entry.found, entry.spec));
}

/** The version in a package's folder, or null. */
function installedVersion(root, name) {
  try {
    return readJson(path.join(root, NODE_MODULES_START, name, MANIFEST_FILE)).version;
  } catch {
    return null;
  }
}

/** Every @mui entry of a lock, as a Map from its key to its version. */
export function muiVersions(lock) {
  const versions = new Map();
  for (const [key, { version }] of Object.entries(lock.packages ?? {})) {
    if (installedName(key)?.startsWith(MUI_SCOPE)) versions.set(key, version);
  }
  return versions;
}

/** The entries that differ between two readings: [{ name, from, to }]. A missing side is null. */
export function muiMoves(before, after) {
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const moved = keys.filter((key) => before.get(key) !== after.get(key));
  return moved.map((key) => ({ name: installedName(key), from: before.get(key) ?? null, to: after.get(key) ?? null }));
}

/** The moves of the packages no bump may move. */
export function muiXMoves(moves) {
  return moves.filter(({ name }) => name.startsWith(MUI_X_PREFIX));
}

/**
 * True when an override's value lets `version` in. A prerelease counts as the release it leads to. A
 * version that cannot be read is never called shut out: nothing can be said about it.
 */
function overrideAllows(value, version) {
  const parsed = parseVersion(version);
  if (parsed === null) return true;
  return value.startsWith(OVERRIDE_REFERENCE) || satisfies(parsed.numbers.join('.'), value);
}

/** The override entries under the pin that `version` falls outside: [{ trail, value }]. */
function blockedOverrides(block, version, trail) {
  return Object.entries(block).flatMap(([name, value]) => {
    const here = [...trail, name];
    if (typeof value === 'object' && value !== null) return blockedOverrides(value, version, here);
    return isPinned(name) && !overrideAllows(value, version) ? [{ trail: here, value }] : [];
  });
}

/** One sentence per `overrides` entry to change by hand. Only a new major leaves any. */
export function overrideLines(manifest, version) {
  const found = blockedOverrides(manifest.overrides ?? {}, version, []);
  return found.map(({ trail, value }) => `overrides > ${trail.join(' > ')} is ${value}: change it to ^${version}`);
}

/**
 * The overrides that shut out a manifest's own @docusaurus entries, each as "a-plugin > @docusaurus/core". A
 * by-hand override at a new version sits under old entries until the bump commits, and `npm ci` stops there.
 * An entry reads as the first version it names, filled out with zeros: ^3.9 is 3.9.0 and 3.x is 3.0.0.
 */
export function blockedEntries(manifest) {
  const firsts = pinnedEntries(manifest).map(({ spec }) => fullVersionOf(firstVersion(spec)));
  const versions = new Set(firsts.filter(Boolean));
  const found = [...versions].flatMap((version) => blockedOverrides(manifest.overrides ?? {}, version, []));
  return [...new Set(found.map(({ trail }) => trail.join(' > ')))];
}

/** The override that sets `peer` for package `name`, or for the whole tree, or undefined. */
function overrideOf(overrides, name, peer) {
  const key = Object.keys(overrides).find((word) => word.replace(VERSION_IN_KEY, '') === name);
  return overrides[key]?.[peer] ?? overrides[peer];
}

/** True for a peer the entry can do without and the tree does not hold: npm then has nothing to resolve. */
function isAbsentOptional(lock, entry, peer) {
  return entry.peerDependenciesMeta?.[peer]?.optional === true && lock.packages[`${NODE_MODULES_START}${peer}`] === undefined;
}

/** Every package outside the pin that asks for one under it: [{ name, held, peer, range }]. */
function peerRows(lock) {
  return Object.entries(lock.packages ?? {}).flatMap(([key, entry]) => {
    const name = installedName(key);
    if (name === null || isPinned(name)) return [];
    const peers = Object.entries(entry.peerDependencies ?? {}).filter(([peer]) => isPinned(peer) && !isAbsentOptional(lock, entry, peer));
    return peers.map(([peer, range]) => ({ name, held: entry.version, peer, range }));
  });
}

/**
 * One sentence per override `version` needs and package.json lacks: a package in the lock whose peer range shuts
 * the version out. An entry that is already there is overrideLines' to judge. Read the lock before the cut.
 */
export function peerOverrideLines(manifest, lock, version) {
  const overrides = manifest.overrides ?? {};
  const isMissing = ({ name, peer, range }) => !satisfiesAsNpm(version, range) && overrideOf(overrides, name, peer) === undefined;
  const lines = peerRows(lock).filter(isMissing).map(({ name, held, peer, range }) =>
    `overrides > ${name} > ${peer} is not set: add it at ^${version}, because ${name} ${held} asks for ${range}`);
  return [...new Set(lines)];
}
