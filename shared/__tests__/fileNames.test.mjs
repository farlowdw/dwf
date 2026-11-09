/**
 * fileNames.test.mjs: names that work on one machine and fail on another, or vanish without a word.
 *   - Case-only collisions. macOS is case-insensitive, so two paths that differ only in case cannot
 *     both exist there: one is lost on checkout. They can still sit in git, so tracked names count.
 *   - Names the machine's global ignore file drops. git says nothing: the file stays on this Mac,
 *     never reaches the hub, and a fresh clone is the first place it is missed. A copy of that file's
 *     lines is read here, and git itself is asked too, which reads whatever ignore files this machine
 *     has; the copy holds on a machine without them.
 *   - x.js beside X.jsx. webpack tries .js first, so `import X from './X'` loads the wrong file and
 *     the page crashes.
 * template/ is skipped: a new site's files, which follow a site's rules.
 *
 * HOW TO CHANGE IT
 *   A name added to the machine's global ignore file: IGNORED_NAMES, IGNORED_ENDINGS for a `*.ext`
 *   line, or IGNORED_PATTERNS for any other pattern. Extensions an import may leave out: RESOLVED_EXTENSIONS.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { SHARED_ROOT, TEMPLATE_FOLDER, isTemplatePath, sharedFiles } from './sharedTree.mjs';

/** Exact names in the global ignore file. They count for a folder as well as a file. */
const IGNORED_NAMES = new Set([
  '.dwf-ref', '.env', '.env.local', '.nyc_output', '.Spotlight-V100', '.Trashes', '.venv', '__pycache__',
  'config', 'config.js', 'dist', 'ehthumbs.db', 'env.sh', 'sessions', 'Thumbs.db', 'venv',
]);

/** The global ignore file's other patterns: `._*`, a Mac's resource forks, and `.DS_Store?`. */
const IGNORED_PATTERNS = [/^\._/, /^\.DS_Store.$/];

/** The `*.ext` lines of the global ignore file. */
const IGNORED_ENDINGS = [
  '.7z', '.class', '.com', '.dll', '.dmg', '.exe', '.gz', '.iso', '.jar', '.log', '.o', '.pyc',
  '.rar', '.so', '.sql', '.sqlite', '.tar', '.zip',
];

const RESOLVED_EXTENSIONS = ['.js', '.jsx'];

/** Every folder and file a path names: a/b/c.js gives a, a/b and a/b/c.js. */
function steps(filePath) {
  const parts = filePath.split('/');
  return parts.map((part, index) => parts.slice(0, index + 1).join('/'));
}

/** Pairs of paths, folders included, that differ only in case. */
function caseCollisions(paths) {
  const firstSeen = new Map();
  const collisions = new Set();
  for (const step of paths.flatMap(steps)) {
    const key = step.toLowerCase();
    const seen = firstSeen.get(key);
    if (seen !== undefined && seen !== step) collisions.add(`${seen} and ${step}`);
    if (seen === undefined) firstSeen.set(key, step);
  }
  return [...collisions];
}

/** True for a file or folder name git would drop. */
function isIgnoredName(name) {
  if (IGNORED_NAMES.has(name) || IGNORED_PATTERNS.some((pattern) => pattern.test(name))) return true;
  return IGNORED_ENDINGS.some((ending) => name.endsWith(ending));
}

/** The names git itself would drop here, by every ignore file it reads, or null outside a git checkout. */
function ignoredByGit(names) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  const input = names.map((name) => `${name}\0`).join('');
  const result = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], { cwd: SHARED_ROOT, encoding: 'utf8', env, input });
  const NONE_IGNORED = 1;
  if (result.status === NONE_IGNORED) return [];
  if (result.status !== 0) return null;
  return result.stdout.split('\0').filter(Boolean);
}

/** The paths with a part git would drop. */
function ignoredPaths(paths) {
  return paths.filter((filePath) => filePath.split('/').some(isIgnoredName));
}

/** The name an import without its extension would use, by folder, case aside. */
function importKey(filePath) {
  const { dir, name } = path.posix.parse(filePath);
  return `${dir}/${name}`.toLowerCase();
}

/** "x.js and X.jsx" for each .js with a .jsx of the same name beside it. */
function jsBesideJsx(paths) {
  const [plain, jsx] = RESOLVED_EXTENSIONS;
  const jsxFiles = new Map(paths.filter((file) => file.endsWith(jsx)).map((file) => [importKey(file), file]));
  const pairs = paths.filter((file) => file.endsWith(plain) && jsxFiles.has(importKey(file)));
  return pairs.map((file) => `${file} and ${jsxFiles.get(importKey(file))}`);
}

/** The tracked names here, which may collide even where the disk cannot show it. */
function trackedNames() {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: SHARED_ROOT, encoding: 'utf8', env });
  if (result.status !== 0) return [];
  return result.stdout.split('\0').filter((name) => name !== '' && !isTemplatePath(name));
}

/** Every name to judge: on disk and in git, without template/. */
function realNames() {
  return [...new Set([...sharedFiles({ skipTemplate: true }), ...trackedNames()])].sort();
}

test('a case-only collision is found, in a file or a folder', () => {
  assert.deepEqual(caseCollisions(['a/Thing.js', 'a/thing.js']), ['a/Thing.js and a/thing.js']);
  assert.deepEqual(caseCollisions(['a/Box/x.js', 'a/box/y.js']), ['a/Box and a/box']);
  assert.deepEqual(caseCollisions(['a/one.js', 'a/two.js', 'b/one.js']), []);
});

test('a name the global ignore file drops is found, in a file or a folder', () => {
  const dropped = [
    'config.js', 'config/site.mjs', 'dist/bundle.js', 'sessions/a.md', 'notes/run.log', 'old.gz',
    'pack.zip', '.env', 'components/Probe/.dwf-ref', 'components/Probe/._index.jsx', '.DS_Store1',
    '.Spotlight-V100/store.db', '.Trashes',
  ];
  assert.deepEqual(ignoredPaths(dropped), dropped);
  assert.deepEqual(ignoredPaths(['configure.js', 'distance.js', 'logs.md', 'wiring/index.cjs', 'a._b.js', '.DS_Store.old']), []);
});

test('x.js beside X.jsx is found, and only beside it', () => {
  assert.deepEqual(jsBesideJsx(['a/thing.js', 'a/Thing.jsx']), ['a/thing.js and a/Thing.jsx']);
  assert.deepEqual(jsBesideJsx(['a/Thing.js', 'a/Thing.jsx']), ['a/Thing.js and a/Thing.jsx']);
  assert.deepEqual(jsBesideJsx(['a/thing.js', 'b/Thing.jsx', 'a/other.jsx', 'a/thing.mjs']), []);
});

test('template/ is left out of the real names', () => {
  const inTemplate = realNames().filter((name) => name.startsWith(`${TEMPLATE_FOLDER}/`));
  assert.deepEqual(inTemplate, []);
});

test('no two names differ only in case', () => {
  assert.deepEqual(caseCollisions(realNames()), []);
});

test('no name is one the global ignore file drops', () => {
  assert.deepEqual(ignoredPaths(realNames()), []);
});

test('no name is one git drops here, by any ignore file this machine has', (t) => {
  const ignored = ignoredByGit(realNames());
  if (ignored === null) {
    t.skip('git cannot read this folder as a checkout');
    return;
  }
  assert.deepEqual(ignored, []);
});

test('no x.js sits beside an X.jsx', () => {
  assert.deepEqual(jsBesideJsx(realNames()), []);
});
