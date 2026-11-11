/**
 * scripts/lib/joinStubs.mjs: the stub pass of `shared:join`. A site's component folder that is a copy of
 * the shared one gives way to a stub, and a site without the stub of a theme piece gets it: the admonition
 * types, and every other row of kind theme. A missing Types.js is the silent failure: custom admonitions
 * fall back to info boxes with a warning nobody reads. A theme file of the site's own is never replaced:
 * it goes on the by-hand list.
 *
 * A copy counts only when every file in the site's folder has a twin in shared/ with the same code. The
 * shared files carry a header comment the old copies lack, so the opening comment on either side does not
 * count. Anything else stays as it is and goes on the by-hand list: a file only the site has may be its data,
 * and a list that merely looks older may not be.
 *
 * Copies stop matching the shared ones until a site has moved to MUI 9, so this pass runs again when
 * `shared:join` runs again.
 *
 * A row whose stub is an index file is a folder piece; any other stub (unsavedWork.js) is a one-file piece. A row
 * can sit inside another's folder (CodeRef inside CodeEditor, and unsavedWork.js too): each row compares only what
 * is its own, its folder less the nested rows' folders and files. Rows that share a folder tree move together: when
 * one of them differs, the others that match stay as they are too (KEPT), since a stub for one alone would split the
 * piece, a site's own CodeRef reading its own registry while the stub's reads shared/'s. A copy goes file by file,
 * the files it compared and nothing else, so a nested row's files never go with it.
 *
 * A stub hands on the piece's default export, unless its row says `namedOnly`: `export { default }` of a piece
 * with no default fails the build, so that row's stub is `export *`.
 *
 * HOW TO CHANGE IT
 *   What a stub looks like: stubText. What makes two files the same: sameCode. SYSTEM_FILES, in
 *   settings.mjs, are never counted. Which pieces this covers comes from requirements.cjs: kind `component`
 *   and `theme`. What makes a folder piece: FOLDER_STUB. How a tree moves together: holdTogether.
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

/** A stub that is its folder's index: the piece is the whole folder. */
const FOLDER_STUB = /\/index\.jsx?$/;

export const COPY = Object.freeze({
  NONE: 'none',
  STUB: 'stub',
  SAME: 'same',
  DIFFERS: 'differs',
  KEPT: 'kept',
});

/** True for a row whose piece is a folder; false for a one-file piece. */
function isFolderRow(row) {
  return FOLDER_STUB.test(row.stub);
}

/** The folder of a piece, from a site's root: src/components/LC. A one-file piece's is the folder it sits in. */
function pieceFolder(row) {
  return path.posix.dirname(row.stub);
}

/** The piece's own place from a site's root: its folder, or its one file. */
function piecePath(row) {
  return isFolderRow(row) ? pieceFolder(row) : row.stub;
}

/** True when `inner`'s piece sits inside the folder of `outer`, a folder row. */
function sitsInside(inner, outer) {
  return inner !== outer && isFolderRow(outer) && piecePath(inner).startsWith(`${piecePath(outer)}/`);
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

/**
 * The files a row compares, from the site's root: a one-file piece's file when it is there; a folder piece's files
 * less those of every row inside it (a nested folder whole, a one-file piece's file).
 */
function ownFiles(root, row, rows) {
  if (!isFolderRow(row)) return fs.existsSync(path.join(root, row.stub)) ? [row.stub] : [];
  const folder = pieceFolder(row);
  const nested = rows.filter((other) => sitsInside(other, row));
  const isNested = (file) => nested.some((other) => (isFolderRow(other) ? file.startsWith(`${piecePath(other)}/`) : file === other.stub));
  return filesBelow(path.join(root, folder)).map((file) => `${folder}/${file}`).filter((file) => !isNested(file));
}

/** A site's file as the row's detail names it: from the piece's folder. */
function shownFile(row, file) {
  return path.posix.relative(pieceFolder(row), file);
}

/** How one row stands in a site: { row, state, files, compared }. `compared` are the files a copy's stub replaces. */
function readCopy(root, sharedRoot, row, rows) {
  const stub = readStub(root, row.stub);
  if (stub.target !== null) return { row, state: COPY.STUB, files: [], compared: [] };
  const compared = ownFiles(root, row, rows);
  if (compared.length === 0) return { row, state: COPY.NONE, files: [], compared };
  const sharedOf = (file) => path.join(sharedRoot, file.slice(SITE_SOURCE.length));
  const differing = compared.filter((file) => !matches(path.join(root, file), sharedOf(file)));
  const state = differing.length === 0 ? COPY.SAME : COPY.DIFFERS;
  return { row, state, files: differing.map((file) => shownFile(row, file)), compared };
}

/** The outermost folder row that holds a row, or the row itself: the tree it moves with. */
function treeOf(row, rows) {
  const holders = rows.filter((other) => sitsInside(row, other));
  return holders.reduce((outer, other) => (piecePath(other).length < piecePath(outer).length ? other : outer), row);
}

/**
 * Rows that share a folder tree move together: in a tree where a row differs, every row that matches is KEPT, and
 * the row that differs names them in `keeps`.
 */
function holdTogether(results, rows) {
  const differing = (tree) => results.filter((one) => one.state === COPY.DIFFERS && treeOf(one.row, rows) === tree);
  return results.map((one) => {
    const tree = treeOf(one.row, rows);
    const blockers = differing(tree);
    if (one.state === COPY.SAME && blockers.length > 0) return { ...one, state: COPY.KEPT, keptWith: blockers.map(({ row }) => row.name) };
    if (one.state !== COPY.DIFFERS) return one;
    const keeps = results.filter((other) => other.state === COPY.SAME && treeOf(other.row, rows) === tree);
    return { ...one, keeps: keeps.map(({ row }) => row.name) };
  });
}

/**
 * How the site's pieces stand against the shared folder `sharedRoot`:
 *   components   the rows of kind component, each { row, state, files, compared }, with `keptWith` on a KEPT row
 *                and `keeps` on a row that differs
 *   theme        the rows of kind theme, each { row, exists, stub }
 */
export function readCopies(root, sharedRoot, table) {
  const rows = table.ENTRIES;
  const components = rows.filter(({ kind }) => kind === table.KIND.component);
  const themes = rows.filter(({ kind }) => kind === table.KIND.theme);
  const read = components.map((row) => readCopy(root, sharedRoot, row, components));
  return {
    components: holdTogether(read, components),
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
