/**
 * scripts/__tests__/check-mui-api.test.mjs: tests for check-mui-api.mjs. From a site:
 *   node --test shared/scripts/__tests__/check-mui-api.test.mjs
 *
 * The rules are tested as functions. Every exit code and message is tested by running the real
 * command on a throwaway git repo in the system's temp folder. The last tests copy the whole shared
 * tree, this script included, to shared/ of such a repo, so a name that lands in shared/ goes red
 * here before it stops a site's build.
 *
 * How to change it: add a case beside the rule it covers. A new row of lib/oldMuiApis.json needs a
 * line in SAMPLES, and a new place to read goes in FOLDERS or ENDINGS.
 *
 * This file names old APIs on purpose. The check leaves test folders out.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  EXIT_CLEAN,
  EXIT_FOUND,
  EXIT_REFUSED,
  hitsIn,
  isScanned,
  readRows,
  rowsThatCannotMatch,
} from '../check-mui-api.mjs';

const SCRIPT = fileURLToPath(new URL('../check-mui-api.mjs', import.meta.url));
const LIB = fileURLToPath(new URL('../lib', import.meta.url));
const LIST_NAME = 'oldMuiApis.json';
const SHARED_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MOUNTED_SCRIPT = 'shared/scripts/check-mui-api.mjs';

/** What the check reads, written out here, so a folder dropped from the script goes red. */
const FOLDERS = ['src', 'plugins', 'docs', 'blog', 'shared'];
const ENDINGS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.md', '.mdx', '.css', '.scss'];

/** Folders of the shared tree that a site's mount never holds. */
const NOT_MOUNTED = new Set(['.git', 'node_modules']);

/** A line of code that uses each old name, the way a page or a component would. */
const SAMPLES = {
  componentsProps: '<Tooltip componentsProps={{ tooltip: {} }} />',
  'components={{': '<Stack components={{ Toolbar: Mine }} />',
  '<Grid item': '<Grid item xs={6}>',
  GridToolbar: 'const Toolbar = GridToolbar;',
  useDemoData: 'const { data } = useDemoData({ rowLength: 5 });',
  'pageSize=': '<Table pageSize={5} />',
  rowsPerPageOptions: '<Table rowsPerPageOptions={[5]} />',
  disableSelectionOnClick: '<Table disableSelectionOnClick />',
  'experimentalFeatures newEditingApi': '<Table experimentalFeatures={{ newEditingApi: true }} />',
  getActions: "const column = { type: 'actions', getActions: () => [] };",
  'valueGetter: (params': 'const column = { valueGetter: (params) => params.value };',
  'InputProps=': '<TextField InputProps={{ readOnly: true }} />',
  'InputLabelProps=': '<TextField InputLabelProps={{ shrink: true }} />',
  'FormHelperTextProps=': '<TextField FormHelperTextProps={{ error: true }} />',
  'SelectProps=': '<TextField select SelectProps={{ native: true }} />',
  '<TextField inputProps': '<TextField label="Name" inputProps={{ maxLength: 4 }} />',
  'params.InputProps': 'const input = params.InputProps;',
  'PaperProps=': '<Menu PaperProps={{ elevation: 0 }} />',
  'PopperProps=': '<Tooltip PopperProps={{ disablePortal: true }} />',
  'TransitionComponent=': '<Tooltip TransitionComponent={Zoom} />',
  'TransitionProps=': '<Dialog TransitionProps={{ onEntered }} />',
  'BackdropComponent=': '<Modal BackdropComponent={Fade} />',
  'onBackdropClick=': '<Dialog onBackdropClick={close} />',
  'primaryTypographyProps=': '<ListItemText primaryTypographyProps={{ noWrap: true }} />',
  '<Typography paragraph': '<Typography variant="body2" onClick={() => go()} paragraph>',
  'renderTags=': '<Autocomplete renderTags={(value) => value} />',
  'ListboxProps=': '<Autocomplete ListboxProps={{ style: {} }} />',
  "'@mui/material/Hidden'": "import Hidden from '@mui/material/Hidden';",
  '<Grid xs=': '<Grid xs={12} md={6}>',
  'valueFormatter: (params': 'const column = { valueFormatter: (params) => params.value };',
  'valueSetter: (params': 'const column = { valueSetter: (params) => params.row };',
  'MuiInputBase-inputMultiline': '[data-touch] :global(.MuiInputBase-inputMultiline) { font-size: 16px; }',
  'MuiBarLabel-root': "const labels = { '& .MuiBarLabel-root': { fontSize: 10 } };",
  'MuiLineElement-root': "const line = { '& .MuiLineElement-root': { strokeDasharray: '5 4' } };",
  'MuiRadarGrid-root': '.chart :global(.MuiRadarGrid-radial) { stroke: gray; }',
};

/** Code that MUI 9 still takes: none of it is an old name. */
const STILL_VALID = [
  "<Select inputProps={{ 'aria-label': 'Sort' }} />",
  '<InputBase inputProps={{ maxLength: 4 }} />',
  "import type { SelectProps, TextFieldProps } from '@mui/material';",
  '<Dialog PaperComponent={Draggable} />',
  "<DataGridPremium experimentalFeatures={{ virtualizerLayoutMode: 'controlled' }} />",
  'const { Hidden } = parts;',
  '<Grid size={{ xs: 12, md: 6 }}>',
  '<Typography variant="h1" component="p">',
  '<TextField slotProps={{ input: { readOnly: true }, htmlInput: { maxLength: 4 } }} />',
  'const slots = params.slotProps.input;',
  '[data-touch] :global(.MuiInputBase-multiline) :global(.MuiInputBase-input) { font-size: 16px; }',
  "const labels = { '& .MuiBarChart-label': { fontSize: 10 } };",
  "const line = { '& .MuiLineChart-line': { strokeDasharray: '5 4' } };",
  '.chart :global(.MuiRadarChart-gridRadial) { stroke: gray; }',
];
const ANY_SAMPLE = SAMPLES.componentsProps;
const OLD_APIS = readRows();
const CLEAN_CODE = 'export const fine = 1;\n';

/** A git that reads no setting of the machine, and no variable a hook left behind. */
function isolatedEnv() {
  const kept = Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'));
  return { ...Object.fromEntries(kept), GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' };
}

function write(root, relativePath, contents) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

function git(root, ...args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore', env: isolatedEnv() });
}

function tempFolder(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-mui-api-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

/** A temp git repo that holds `files`, all of them tracked. */
function makeSite(t, files) {
  const root = tempFolder(t);
  git(root, 'init', '-q');
  for (const [relativePath, contents] of Object.entries(files)) {
    write(root, relativePath, contents);
    git(root, 'add', '-f', '--', relativePath);
  }
  return root;
}

function run(root, { script = SCRIPT, flags = [], cwd = root } = {}) {
  const result = spawnSync(process.execPath, [script, ...flags], { cwd, encoding: 'utf8', env: isolatedEnv() });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

/** A list file in a temp folder, and its path. `rows` goes in as it is, so it may be wrong. */
function listFile(t, rows) {
  const file = path.join(tempFolder(t), LIST_NAME);
  fs.writeFileSync(file, JSON.stringify({ rows }));
  return file;
}

/** The whole shared tree, at shared/ of a temp repo, as a site mounts it. New files, so nothing to add. */
function mountTree(t) {
  const root = tempFolder(t);
  git(root, 'init', '-q');
  const mounted = (source) => !NOT_MOUNTED.has(path.basename(source));
  fs.cpSync(SHARED_ROOT, path.join(root, 'shared'), { recursive: true, filter: mounted });
  return root;
}

// The rules

test('the exit codes are 0, 1 and 2', () => {
  assert.deepEqual([EXIT_CLEAN, EXIT_FOUND, EXIT_REFUSED], [0, 1, 2]);
});

test('every row matches its own name, and a row with a typo is named', () => {
  assert.deepEqual(rowsThatCannotMatch(OLD_APIS), []);
  const typo = { name: 'componentsProps', pattern: /\bcomponentProps\b/g, instead: 'slotProps' };
  assert.deepEqual(rowsThatCannotMatch([...OLD_APIS, typo]), [typo]);
});

test('a list it cannot use is refused, never passed', (t) => {
  const row = { name: 'one', pattern: 'one', instead: 'two' };
  const notJson = path.join(tempFolder(t), LIST_NAME);
  fs.writeFileSync(notJson, '{ not json');
  assert.throws(() => readRows(path.join(tempFolder(t), 'gone.json')), /cannot read the list of old names/);
  assert.throws(() => readRows(notJson), /cannot read the list of old names/);
  assert.throws(() => readRows(listFile(t, [])), /the list of old names is empty/);
  assert.throws(() => readRows(listFile(t, 'one')), /the list of old names is empty/);
  for (const field of ['name', 'pattern', 'instead']) {
    assert.throws(() => readRows(listFile(t, [{ ...row, [field]: undefined }])), /a row needs name, pattern, instead/, field);
    assert.throws(() => readRows(listFile(t, [{ ...row, [field]: '' }])), /a row needs name, pattern, instead/, field);
  }
  assert.throws(() => readRows(listFile(t, [{ ...row, pattern: '(' }])), /row one: /);
});

test('a row comes back with a pattern that finds every place in a file', (t) => {
  const [row] = readRows(listFile(t, [{ name: 'one', pattern: '\\bone\\b', instead: 'two' }]));
  assert.equal(row.pattern.flags, 'g');
  assert.equal('one and one'.match(row.pattern).length, 2);
});

test('every row has its sample here, and no sample stands for a row that is gone', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), OLD_APIS.map(({ name }) => name).sort());
});

for (const row of OLD_APIS) {
  test(`finds ${row.name} on the line it sits on`, () => {
    const text = `${CLEAN_CODE}${SAMPLES[row.name]}\n${CLEAN_CODE}`;
    const hits = hitsIn('src/a.js', text, OLD_APIS);
    assert.deepEqual(hits.map(({ file, line, row: found }) => [file, line, found.name]), [['src/a.js', 2, row.name]]);
  });
}

test('code MUI 9 still takes is no hit: inputProps on Select, a type import, a current grid option', () => {
  for (const line of STILL_VALID) assert.deepEqual(hitsIn('src/a.jsx', `${line}\n`, OLD_APIS), [], line);
});

test('a stylesheet is read too, a comment line left out', () => {
  assert.equal(isScanned('src/components/A/styles.module.css'), true);
  assert.equal(isScanned('shared/css/custom.scss'), true);
  const css = `/* ${SAMPLES.componentsProps} */\n.a { --b: 'componentsProps'; }\n`;
  assert.deepEqual(hitsIn('src/a.module.css', css, OLD_APIS).map(({ line }) => line), [2]);
});

test('a name inside a longer word is left alone', () => {
  const words = ['myComponentsProps', 'rowsPerPageOptionsList', 'pageSizeOptions={[5]}', 'ungetActions', 'useDemoDataSource'];
  assert.deepEqual(hitsIn('src/a.js', words.join('\n'), OLD_APIS), []);
});

test('GridToolbar finds every name that starts with it', () => {
  const hits = hitsIn('src/a.js', 'GridToolbarContainer\nGridToolbarExport\n', OLD_APIS);
  assert.deepEqual(hits.map(({ line }) => line), [1, 2]);
});

test('<Grid item and valueGetter can cross a line break, and the hit is where they start', () => {
  const hits = hitsIn('src/a.js', `${CLEAN_CODE}<Grid\n  item\n  xs={6}>\nvalueGetter:\n  (params) => 1\n`, OLD_APIS);
  assert.deepEqual(hits.map(({ line, row }) => [line, row.name]), [[2, '<Grid item'], [5, 'valueGetter: (params']]);
});

test('a name twice in a file is two hits', () => {
  assert.equal(hitsIn('src/a.js', `${ANY_SAMPLE}\n${ANY_SAMPLE}\n`, OLD_APIS).length, 2);
  assert.equal(hitsIn('src/a.js', 'componentsProps, componentsProps\n', OLD_APIS).length, 2);
});

test('a line that starts as a comment is left out', () => {
  const lines = [`// ${ANY_SAMPLE}`, `  // ${ANY_SAMPLE}`, `/* ${ANY_SAMPLE} */`, ` * ${ANY_SAMPLE}`, `\t* ${ANY_SAMPLE}`];
  assert.deepEqual(hitsIn('src/a.js', lines.join('\n'), OLD_APIS), []);
});

test('a comment after code on the same line still counts as code', () => {
  assert.equal(hitsIn('src/a.js', `const a = 1; // ${ANY_SAMPLE}\n`, OLD_APIS).length, 1);
});

test('a name in a string or in prose counts: the check does not read code', () => {
  assert.equal(hitsIn('docs/a.md', 'Set `componentsProps` on it.\n', OLD_APIS).length, 1);
  assert.equal(hitsIn('src/a.js', "const name = 'componentsProps';\n", OLD_APIS).length, 1);
});

test('reads every ending on its list, in any folder', () => {
  for (const ending of ENDINGS) {
    assert.equal(isScanned(`src/a${ending}`), true, ending);
    assert.equal(isScanned(`shared/components/deep/a${ending}`), true, ending);
  }
});

test('leaves out other endings', () => {
  for (const file of ['src/a.sass', 'src/a.less', 'src/a.json', 'shared/scripts/patches/a.patch', 'docs/a.txt', 'docs/a.md.bak']) {
    assert.equal(isScanned(file), false, file);
  }
});

test('leaves out a test folder at any depth, and a README by name in any folder', () => {
  for (const file of ['src/__tests__/a.js', 'shared/__tests__/a.mjs', 'shared/scripts/__tests__/a.mjs', 'README.md', 'src/deep/README.md']) {
    assert.equal(isScanned(file), false, file);
  }
  assert.equal(isScanned('src/tests/a.js'), true);
  assert.equal(isScanned('docs/readme.md'), true);
});

test('reads this script like any other file, and never its list', () => {
  assert.equal(isScanned(MOUNTED_SCRIPT), true);
  assert.equal(isScanned(`shared/scripts/lib/${LIST_NAME}`), false);
});

test('this script names no old API outside a comment, or it would fail its own check', () => {
  assert.deepEqual(hitsIn(MOUNTED_SCRIPT, fs.readFileSync(SCRIPT, 'utf8'), OLD_APIS), []);
});

// The command

test('a clean site exits 0 and says what it read', (t) => {
  const root = makeSite(t, { 'src/a.js': CLEAN_CODE, 'docs/a.md': 'A page.\n' });
  const { status, stdout, stderr } = run(root);
  assert.equal(status, EXIT_CLEAN, stderr);
  assert.equal(stdout, `check-mui-api: clean, ${OLD_APIS.length} names in 2 files\n`);
  assert.equal(stderr, '');
});

test('one file reads as one', (t) => {
  const root = makeSite(t, { 'src/a.js': CLEAN_CODE });
  assert.match(run(root).stdout, /names in 1 file$/m);
});

test('every row is found in every folder, in every ending', (t) => {
  const text = `${OLD_APIS.map(({ name }) => SAMPLES[name]).join('\n')}\n`;
  const files = FOLDERS.flatMap((folder) => ENDINGS.map((ending) => `${folder}/plant${ending}`));
  const root = makeSite(t, Object.fromEntries(files.map((file) => [file, text])));
  const { status, stderr } = run(root);
  assert.equal(status, EXIT_FOUND, stderr);
  const printed = new Set(stderr.trimEnd().split('\n'));
  for (const file of files) {
    OLD_APIS.forEach(({ name, instead }, index) => {
      const line = `check-mui-api: ${file}:${index + 1}: ${name} is an old MUI name. Use ${instead}.`;
      assert.ok(printed.has(line), `${line} was not printed`);
    });
  }
  const total = files.length * OLD_APIS.length;
  assert.equal(printed.size, total + 1);
  assert.ok(printed.has(`check-mui-api: ${total} old MUI names found. The list is lib/oldMuiApis.json, the rules are in this script.`));
});

test('one hit reads as one, and a hit prints nothing to stdout', (t) => {
  const root = makeSite(t, { 'src/a.js': `${ANY_SAMPLE}\n` });
  const { status, stdout, stderr } = run(root);
  assert.equal(status, EXIT_FOUND, stderr);
  assert.equal(stdout, '');
  assert.match(stderr, /^check-mui-api: 1 old MUI name found\./m);
});

test('a new file is read as well as a tracked one', (t) => {
  const root = makeSite(t, { 'src/a.js': CLEAN_CODE });
  write(root, 'src/new.js', `${ANY_SAMPLE}\n`);
  const { status, stderr } = run(root);
  assert.equal(status, EXIT_FOUND, stderr);
  assert.match(stderr, /src\/new\.js:1: componentsProps/);
});

test('a file git ignores is not read', (t) => {
  const root = makeSite(t, { '.gitignore': 'src/made/\n', 'src/a.js': CLEAN_CODE });
  write(root, 'src/made/a.js', `${ANY_SAMPLE}\n`);
  const { status, stdout } = run(root);
  assert.equal(status, EXIT_CLEAN, stdout);
  assert.match(stdout, /in 1 file$/m);
});

test('a folder off the list is not read', (t) => {
  const root = makeSite(t, { 'src/a.js': CLEAN_CODE, 'scripts/a.mjs': `${ANY_SAMPLE}\n`, 'a.js': `${ANY_SAMPLE}\n`, 'static/a.js': `${ANY_SAMPLE}\n` });
  assert.equal(run(root).status, EXIT_CLEAN);
});

test('a comment line, a README and a test folder pass a run', (t) => {
  const root = makeSite(t, {
    'src/a.js': `// ${ANY_SAMPLE}\n`,
    'src/README.md': `${ANY_SAMPLE}\n`,
    'src/__tests__/a.test.js': `${ANY_SAMPLE}\n`,
  });
  const { status, output } = run(root);
  assert.equal(status, EXIT_CLEAN, output);
  assert.match(output, /in 1 file$/m);
});

test('a path git lists that is not a file on disk is read as empty', (t) => {
  const root = makeSite(t, { 'src/a.js': CLEAN_CODE, 'src/gone.js': CLEAN_CODE });
  fs.symlinkSync('.', path.join(root, 'src/link.js'));
  fs.rmSync(path.join(root, 'src/gone.js'));
  const { status, output } = run(root);
  assert.equal(status, EXIT_CLEAN, output);
  assert.match(output, /in 3 files$/m);
});

test('--root reads that folder from anywhere', (t) => {
  const root = makeSite(t, { 'src/a.js': `${ANY_SAMPLE}\n` });
  const { status } = run(root, { flags: ['--root', root], cwd: os.tmpdir() });
  assert.equal(status, EXIT_FOUND);
});

test('--help lists the flags, exits 0 and reads nothing', (t) => {
  const { status, stdout } = run(tempFolder(t), { flags: ['--help'] });
  assert.equal(status, EXIT_CLEAN);
  for (const flag of ['--root', '--help']) assert.ok(stdout.includes(flag), flag);
});

// A check that could not run is never a pass

test('a folder that is no git repo refuses', (t) => {
  const root = tempFolder(t);
  write(root, 'src/a.js', `${ANY_SAMPLE}\n`);
  const { status, stderr } = run(root);
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /^check-mui-api: refused: git could not list the files of /);
});

test('a folder that does not exist refuses', (t) => {
  const { status, stderr } = run(tempFolder(t), { flags: ['--root', path.join(os.tmpdir(), 'check-mui-api-no-such-folder')] });
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /refused: git could not list/);
});

test('a repo with nothing to read refuses', (t) => {
  const root = makeSite(t, { 'scripts/a.mjs': CLEAN_CODE, 'src/README.md': 'A note.\n' });
  const { status, stderr } = run(root);
  assert.equal(status, EXIT_REFUSED);
  assert.ok(stderr.includes(`no files to read in ${FOLDERS.join(', ')}`), stderr);
});

test('a flag it does not know refuses, and so does a stray word', (t) => {
  const root = makeSite(t, { 'src/a.js': CLEAN_CODE });
  for (const flags of [['--nope'], ['src'], ['--root']]) {
    const { status, stderr } = run(root, { flags });
    assert.equal(status, EXIT_REFUSED, flags.join(' '));
    assert.match(stderr, /^check-mui-api: refused: /);
  }
});

/** A copy of the script and its lib folder, with the list changed by `change`, and its path. */
function scriptWithList(t, change) {
  const copy = path.join(tempFolder(t), 'scripts');
  fs.cpSync(LIB, path.join(copy, 'lib'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(copy, 'check-mui-api.mjs'));
  const list = path.join(copy, 'lib', LIST_NAME);
  const source = fs.readFileSync(list, 'utf8');
  const changed = change(source);
  assert.notEqual(changed, source, 'the text this test changes is gone');
  fs.writeFileSync(list, changed);
  return path.join(copy, 'check-mui-api.mjs');
}

test('a row whose pattern misses its own name refuses the whole run', (t) => {
  const root = makeSite(t, { 'src/a.js': CLEAN_CODE });
  const script = scriptWithList(t, (source) => source.replace('\\\\bcomponentsProps\\\\b', '\\\\bcomponentProps\\\\b'));
  const { status, stderr } = run(root, { script });
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /refused: a row misses its own name: componentsProps/);
});

test('a list it cannot use refuses the whole run, with a plain line', (t) => {
  const root = makeSite(t, { 'src/a.js': `${ANY_SAMPLE}\n` });
  const empty = scriptWithList(t, () => '{ "rows": [] }\n');
  assert.equal(run(root, { script: empty }).status, EXIT_REFUSED);
  const broken = scriptWithList(t, () => '{ not json');
  const { status, stderr } = run(root, { script: broken });
  assert.equal(status, EXIT_REFUSED);
  assert.match(stderr, /^check-mui-api: refused: cannot read the list of old names/);
});

test('the hub holds no site, so run there it refuses', () => {
  const { status, stderr } = run(SHARED_ROOT);
  assert.equal(status, EXIT_REFUSED, stderr);
  assert.match(stderr, /refused: this is the shared tree, not a site/);
});

// The shared tree itself, mounted the way a site mounts it

test('the shared tree, mounted, reads clean, with this script among its files, so a pull turns no site red', (t) => {
  const root = mountTree(t);
  assert.ok(fs.existsSync(path.join(root, MOUNTED_SCRIPT)), 'the script is not where a site runs it');
  const { status, stdout, stderr } = run(root, { script: path.join(root, MOUNTED_SCRIPT) });
  assert.equal(status, EXIT_CLEAN, stderr);
  assert.match(stdout, /clean, \d+ names in \d+ files$/m);
});

test('the mounted script finds a name that lands in shared/', (t) => {
  const root = mountTree(t);
  write(root, 'shared/components/Plant/index.jsx', `${ANY_SAMPLE}\n`);
  const { status, stderr } = run(root, { script: path.join(root, MOUNTED_SCRIPT) });
  assert.equal(status, EXIT_FOUND, stderr);
  assert.match(stderr, /shared\/components\/Plant\/index\.jsx:1: componentsProps/);
  assert.match(stderr, /1 old MUI name found/);
});
