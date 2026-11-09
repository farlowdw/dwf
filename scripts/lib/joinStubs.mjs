/**
 * scripts/lib/joinStubs.mjs: the stub pass of `shared:join`. A site's component folder that is a copy of
 * the shared one gives way to a stub, and a site without the admonition stub gets it. A missing Types.js
 * is the silent failure: custom admonitions fall back to info boxes with a warning nobody reads.
 *
 * A copy counts only when every file in the site's folder has a twin in shared/ with the same code. The
 * shared files carry a header comment the old copies lack, so the opening comment on either side does not
 * count. Anything else stays as it is and goes on the by-hand list: a file only the site has may be its data,
 * and a list that merely looks older may not be.
 *
 * Copies stop matching the shared ones until a site has moved to MUI 9, so this pass runs again when
 * `shared:join` runs again.
 *
 * A stub hands on the piece's default export, unless its row says `namedOnly`: `export { default }` of a piece
 * with no default fails the build, so that row's stub is `export *`.
 *
 * HOW TO CHANGE IT
 *   What a stub looks like: stubText. What makes two files the same: sameCode. SYSTEM_FILES, in
 *   settings.mjs, are never counted. Which pieces this covers comes from requirements.cjs: kind `component`
 *   and `theme`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PREFIX, SYSTEM_FILES } from './settings.mjs';
import { readStub } from './stubs.mjs';

const SITE_SOURCE = 'src/';
const STUB_FILE_END = /(?:\/index)?\.jsx?$/;
const OPENING_COMMENT = /^\s*\/\*[\s\S]*?\*\/\s*/;

/** What a stub hands on: the usual default export, or everything a piece with no default has. */
const DEFAULT_EXPORT = '{ default }';
const ALL_EXPORTS = '*';

export const COPY = Object.freeze({
  NONE: 'none',
  STUB: 'stub',
  SAME: 'same',
  DIFFERS: 'differs',
});

/** The folder of a piece, from a site's root: src/components/LC. */
function pieceFolder(row) {
  return path.posix.dirname(row.stub);
}

/** The same folder from shared/'s root: components/LC. */
function sharedFolderOf(row) {
  return pieceFolder(row).slice(SITE_SOURCE.length);
}

/** Every file below `folder`, from it, in order. A missing folder has none. */
function filesBelow(folder, prefix = '') {
  if (!fs.existsSync(folder)) return [];
  const entries = fs.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  return entries.flatMap((entry) => {
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return filesBelow(path.join(folder, entry.name), `${name}/`);
    return SYSTEM_FILES.has(entry.name) ? [] : [name];
  });
}

/** A text without the comment it opens with. */
function codeOf(text) {
  return text.replace(OPENING_COMMENT, '');
}

/** True when two files hold the same code, their opening comments aside. */
export function sameCode(first, second) {
  return codeOf(first) === codeOf(second);
}

/** True when a site's file has a twin in shared/ with the same code. */
function matches(siteFile, sharedFile) {
  if (!fs.existsSync(sharedFile)) return false;
  return sameCode(fs.readFileSync(siteFile, 'utf8'), fs.readFileSync(sharedFile, 'utf8'));
}

/** The site's files that keep a folder from being a copy of the shared one. */
function differingFiles(root, sharedRoot, row) {
  const siteFolder = path.join(root, pieceFolder(row));
  const sharedFolder = path.join(sharedRoot, sharedFolderOf(row));
  const files = filesBelow(siteFolder);
  return files.filter((file) => !matches(path.join(siteFolder, file), path.join(sharedFolder, file)));
}

/** How one row stands in a site: { row, state, files }. */
function readCopy(root, sharedRoot, row) {
  const stub = readStub(root, row.stub);
  if (stub.target !== null) return { row, state: COPY.STUB, files: [] };
  if (filesBelow(path.join(root, pieceFolder(row))).length === 0) return { row, state: COPY.NONE, files: [] };
  const files = differingFiles(root, sharedRoot, row);
  return { row, state: files.length === 0 ? COPY.SAME : COPY.DIFFERS, files };
}

/**
 * How the site's pieces stand against the shared folder `sharedRoot`:
 *   components   the rows of kind component, each { row, state, files }
 *   theme        the rows of kind theme, each { row, exists, stub }
 */
export function readCopies(root, sharedRoot, table) {
  const rows = table.ENTRIES;
  const components = rows.filter(({ kind }) => kind === table.KIND.component);
  const themes = rows.filter(({ kind }) => kind === table.KIND.theme);
  return {
    components: components.map((row) => readCopy(root, sharedRoot, row)),
    theme: themes.map((row) => ({ row, ...readStub(root, row.stub) })),
  };
}

/** What a stub imports: src/components/LC/index.jsx gives @site/shared/components/LC. */
export function stubTarget(stubPath) {
  return `@site/${PREFIX}/${stubPath.slice(SITE_SOURCE.length).replace(STUB_FILE_END, '')}`;
}

/** A stub's whole text. `namedOnly` is the row's word for a piece with no default export. */
export function stubText(stubPath, { namedOnly = false } = {}) {
  return [
    `// ${stubPath}: points this site at the shared piece.`,
    `// To change it: see "When one site needs something different" in ${PREFIX}/README.md.`,
    `export ${namedOnly ? ALL_EXPORTS : DEFAULT_EXPORT} from '${stubTarget(stubPath)}';`,
    '',
  ].join('\n');
}

/** Writes the stub of one row of requirements.cjs. */
export function writeStub(root, row) {
  const file = path.join(root, row.stub);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stubText(row.stub, row));
}

/** The folder a copy's stub replaces, from the site's root. */
export function copyFolder(row) {
  return pieceFolder(row);
}
