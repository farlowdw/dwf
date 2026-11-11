/**
 * scripts/__tests__/test.test.mjs: `test:shared` as a person runs it: the real script as a child
 * process in real sites, with small suites that pass or fail on purpose. A suite marked "must not
 * run" fails if it runs, so a suite left out by mistake and a suite run by mistake both go red. The
 * selection, the skip lines and the exit code are the contract: a new way to skip gets a test here.
 *
 * HOW TO CHANGE IT
 *   TABLE is the fixture's requirements.cjs, SUITES its test files. Both are made up, one row of each
 *   kind. The last test reads the hub's real table instead.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXIT } from '../lib/exitCodes.mjs';
import { allTestFiles, strayTestFiles, testFilesIn } from '../lib/suites.mjs';
import { FILE_LIMIT_SECONDS, TEST_LIMIT_ENV, TEST_LIMIT_SECONDS, nodeLimit, parseArgs } from '../test.mjs';
import { fixtureFor, writeFiles } from './fixture.mjs';

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const TABLE = `module.exports = {
  KIND: { component: 'component', theme: 'theme', plugin: 'plugin', library: 'library' },
  RANGES: { react: '^19.0.0', 'test-only': '^1.2.0' },
  ENTRIES: [
    {
      name: 'Widget', kind: 'component', stub: 'src/components/Widget/index.jsx',
      evidence: { docsPattern: "['\\"]@site/src/components/Widget['\\"/]" },
      packages: ['react'], suites: ['components/Widget/__tests__'],
    },
    { name: 'Editor', kind: 'component', stub: 'src/components/Editor/index.jsx', packages: [], suites: ['components/Editor/__tests__'] },
    { name: 'Styles', kind: 'plugin', configText: 'shared/css/custom.scss', packages: [], suites: [] },
    { name: 'Monaco', kind: 'plugin', configText: 'shared/plugins/monaco', packages: [], suites: ['plugins/monaco/__tests__'] },
    { name: 'Reload', kind: 'library', clientImport: 'shared/lib/reload', packages: [], suites: ['lib/reload/__tests__'] },
  ],
  ALWAYS_SUITES: ['__tests__'],
  SCRIPT_SUITES: ['scripts/__tests__'],
  BUILT_IN_IMPORTS: [],
};
`;

const passing = (name) => `import test from 'node:test';\ntest('${name}', () => {});\n`;
const passingCjs = (name) => `const test = require('node:test');\ntest('${name}', () => {});\n`;
const failing = (name) => `import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('${name}', () => assert.fail('${name}'));\n`;

const SUITES = Object.freeze({
  'requirements.cjs': TABLE,
  '__tests__/always.test.mjs': passing('always runs'),
  '__tests__/helper.mjs': "throw new Error('a helper is not a test');\n",
  'components/Widget/__tests__/format.test.cjs': passingCjs('widget cjs runs'),
  'components/Widget/__tests__/format.test.mjs': passing('widget mjs runs'),
  'components/Widget/__tests__/format.test.js': passing('widget js with import syntax runs'),
  'components/Editor/__tests__/editor.test.mjs': failing('editor must not run'),
  'plugins/monaco/__tests__/monaco.test.mjs': failing('monaco must not run'),
  'lib/reload/__tests__/reload.test.mjs': failing('reload must not run'),
  'scripts/__tests__/own.test.mjs': passing('script suite runs'),
});

/** A site on a hub that holds the suites, with `extra` hub files over them, and no package on disk until a test writes one. */
function siteWith(t, extra = {}) {
  const fixture = fixtureFor(t);
  fixture.uninstall();
  fixture.commitToHub({ ...SUITES, ...extra }, 'Add the suites');
  return { fixture, site: fixture.addSite('one') };
}

const run = (fixture, site, ...args) => fixture.script('test.mjs', site, ...args);

/** Asserts a whole line of the report. */
function assertLine(report, text) {
  assert.ok(report.stdout.split('\n').includes(text), `no line "${text}" in:\n${report.output}`);
}

test('a site runs what it uses, in all three formats, and each suite it leaves out says why', (t) => {
  const { fixture, site } = siteWith(t);
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  for (const name of ['always runs', 'widget cjs runs', 'widget mjs runs', 'widget js with import syntax runs']) {
    assert.match(report.stdout, new RegExp(name));
  }
  assert.doesNotMatch(report.stdout, /must not run|a helper is not a test|script suite runs/);
  assert.match(report.stdout, /^✔ always runs/m);
  assertLine(report, 'run   __tests__: every site runs it, 1 file');
  assertLine(report, 'run   components/Widget/__tests__: Widget: its stub src/components/Widget/index.jsx is here, 3 files');
  assertLine(report, 'skip  components/Editor/__tests__: Editor: this site has no src/components/Editor/index.jsx');
  assertLine(report, 'skip  plugins/monaco/__tests__: Monaco: docusaurus.config.js does not name shared/plugins/monaco');
  assertLine(report, 'skip  lib/reload/__tests__: Reload: no client module imports shared/lib/reload');
  assert.match(report.stdout, /^skip {2}scripts\/__tests__: .*shared\/scripts matches hub [0-9a-f]{7}, the commit this site recorded, so the hub's own run of them covers it\. To run them: npm run test:shared -- --scripts$/m);
  assertLine(report, 'test:shared: 2 suites run (4 files), 4 left out, node skipped 0 tests, exit 0');
});

test('it runs from a subfolder, on the same plan', (t) => {
  const { fixture, site } = siteWith(t);
  const report = run(fixture, path.join(site, 'docs'));
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'test:shared: 2 suites run (4 files), 4 left out, node skipped 0 tests, exit 0');
});

test('a stub brings its suite in, and a failing test is the exit code, with the skips still printed', (t) => {
  const { fixture, site } = siteWith(t);
  writeFiles(site, { 'src/components/Editor/index.jsx': "export { default } from '@site/shared/components/Editor';\n" });
  const report = run(fixture, site);
  assert.equal(report.status, 1, report.output);
  assert.match(report.stdout, /editor must not run/);
  assertLine(report, 'skip  lib/reload/__tests__: Reload: no client module imports shared/lib/reload');
  assertLine(report, 'test:shared: 3 suites run (5 files), 3 left out, node skipped 0 tests, exit 1');
});

test('a config line and a client module bring in the suites of a plugin and a library', (t) => {
  const { fixture, site } = siteWith(t);
  writeFiles(site, {
    'docusaurus.config.js': "module.exports = { plugins: ['./shared/plugins/monaco'] };\n",
    'src/clientModules/reload.js': "import '@site/shared/lib/reload';\n",
  });
  fixture.git(['add', '--', 'src/clientModules/reload.js'], site);
  const report = run(fixture, site);
  assert.equal(report.status, 1, report.output);
  assert.match(report.stdout, /monaco must not run/);
  assert.match(report.stdout, /reload must not run/);
});

test('a piece in use with its stub gone still runs its suite, and the line says so', (t) => {
  const { fixture, site } = siteWith(t);
  fs.rmSync(path.join(site, 'src/components/Widget/index.jsx'));
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'run   components/Widget/__tests__: Widget: in use, but its stub src/components/Widget/index.jsx is missing, 3 files');
});

test('a folder two rows name runs once and prints one line, with one row in use or both', (t) => {
  const table = TABLE.replace("suites: ['components/Editor/__tests__']", "suites: ['components/Widget/__tests__', 'components/Editor/__tests__']");
  const { fixture, site } = siteWith(t, { 'requirements.cjs': table, 'components/Editor/__tests__/editor.test.mjs': passing('editor runs') });
  const folderLines = (report) => report.stdout.match(/^(?:run|skip) +components\/Widget\/__tests__/gm).length;
  assert.equal(folderLines(run(fixture, site)), 1);
  writeFiles(site, { 'src/components/Editor/index.jsx': "export { default } from '@site/shared/components/Editor';\n" });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.equal(folderLines(report), 1, report.output);
  assert.equal(report.stdout.match(/^✔ widget cjs runs/gm).length, 1, report.output);
});

test('a suite with no test files is exit 3 while every test passes: no glob quietly matches nothing', (t) => {
  const table = TABLE.replace("suites: ['components/Editor/__tests__']", "suites: ['components/Gone/__tests__', 'components/Editor/__tests__']");
  const { fixture, site } = siteWith(t, { 'requirements.cjs': table });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assertLine(report, 'FAIL  components/Gone/__tests__ is named in requirements.cjs and holds no test files');
  assert.match(report.stdout, /exit 3$/m);
});

test('a test file in no suite is exit 3, because nothing would ever run it', (t) => {
  const { fixture, site } = siteWith(t, { 'components/Widget/__tests__/deep/nested.test.mjs': passing('nested') });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assertLine(report, 'FAIL  components/Widget/__tests__/deep/nested.test.mjs is in no suite of requirements.cjs, so nothing runs it');
});

test('a planned file that holds no test is exit 3: node counts it as one passing test', (t) => {
  const emptied = "import test from 'node:test';\nconst helper = () => 1;\nexport { helper };\n";
  const { fixture, site } = siteWith(t, { '__tests__/always.test.mjs': emptied });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assertLine(report, 'FAIL  shared/__tests__/always.test.mjs holds no test: node counts it as one passing test');
  assert.match(report.stdout, /exit 3$/m);
});

test('the last line counts the tests node skipped, beside the suites left out', (t) => {
  const skipping = "import test from 'node:test';\ntest('runs', () => {});\ntest('waits', { skip: 'not here' }, () => {});\n";
  const { fixture, site } = siteWith(t, { '__tests__/always.test.mjs': skipping });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'test:shared: 2 suites run (4 files), 4 left out, node skipped 1 test, exit 0');
});

test('a file named as node names a test, but outside test:shared\'s endings, is exit 3', (t) => {
  const names = ['__tests__/planted-test.mjs', '__tests__/planted_test.mjs', '__tests__/test-planted.mjs', 'components/Widget/__tests__/planted.test.mts'];
  const { fixture, site } = siteWith(t, Object.fromEntries(names.map((name) => [name, failing(name)])));
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  for (const name of names) {
    assertLine(report, `FAIL  ${name} is named like a test, and test:shared runs only .test.cjs, .test.mjs and .test.js files: rename it`);
  }
  assert.deepEqual(strayTestFiles(path.join(site, 'shared')).sort(), [...names].sort());
});

test('a requirements.cjs that does not load is exit 3 with one FAIL line and the way back, never a stack', (t) => {
  const { fixture, site } = siteWith(t, { 'requirements.cjs': TABLE.replace("RANGES: {", "RANGES: {{") });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assert.match(report.stderr, /^FAIL {2}shared\/requirements\.cjs does not load: SyntaxError: /m);
  assert.match(report.stderr, /Fix: if a pull just brought it: git update-index -q --refresh && git reset --keep HEAD~1; otherwise mend the file/);
  assert.doesNotMatch(report.output, /\n\s+at /);
});

test('a test file whose name node reads as a pattern is exit 3: node would drop it and stay green', (t) => {
  const { fixture, site } = siteWith(t, { 'components/Widget/__tests__/x[1].test.mjs': failing('x[1] would fail') });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assertLine(report, 'FAIL  components/Widget/__tests__/x[1].test.mjs: node reads this name as a pattern and drops the file, so rename it');
});

test('a bad row is exit 3, and nothing to run never starts node, which would hunt for tests by itself', (t) => {
  const table = TABLE.replace("kind: 'library'", "kind: 'mystery'");
  const { fixture, site } = siteWith(t, { 'requirements.cjs': table });
  const badRow = run(fixture, site);
  assert.equal(badRow.status, EXIT.CHECKS, badRow.output);
  assertLine(badRow, 'FAIL  Reload: unknown kind mystery');
  const bare = `module.exports = { RANGES: {}, ENTRIES: [], ALWAYS_SUITES: [], SCRIPT_SUITES: [] };\n`;
  const { fixture: other, site: empty } = siteWith(t, { 'requirements.cjs': bare });
  writeFiles(empty, { 'decoy.test.mjs': failing('decoy') });
  const report = run(other, empty);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assert.doesNotMatch(report.stdout, /decoy/);
  assertLine(report, 'FAIL  no test files to run');
});

test('a package the suites need is named with its install line, and the suite still runs', (t) => {
  const table = TABLE.replace("packages: ['react'], suites", "packages: ['react'], testPackages: ['test-only'], suites");
  const { fixture, site } = siteWith(t, { 'requirements.cjs': table });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'warn  test-only: needs ^1.2.0, found nothing (Widget)');
  assertLine(report, 'warn  fix: npm install --save-exact test-only@1.2.0');
  assert.match(report.stdout, /widget cjs runs/);
});

test('a @docusaurus package the suites need is fixed by a bump, not an install line', (t) => {
  const table = TABLE
    .replace("packages: ['react'], suites", "packages: ['react'], testPackages: ['@docusaurus/core'], suites")
    .replace("RANGES: {", "RANGES: { '@docusaurus/core': '^3.11.0',");
  const { fixture, site } = siteWith(t, { 'requirements.cjs': table });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'warn  fix: npm run shared:bump');
});

test('a package the running suites need that the lock holds and the disk lacks is named, with npm ci', (t) => {
  const { fixture, site } = siteWith(t);
  const bare = run(fixture, site);
  assertLine(bare, 'warn  1 package the suites need is not installed here: react');
  assertLine(bare, 'warn  fix: npm ci, then run this again');
  writeFiles(site, { 'node_modules/react/package.json': '{ "version": "19.2.3" }\n' });
  const installed = run(fixture, site);
  assert.doesNotMatch(installed.stdout, /not installed here/);
});

test('a package only a piece with no suites needs stays shared:status\'s business', (t) => {
  const table = TABLE.replace("configText: 'shared/css/custom.scss', packages: []", "configText: 'shared/css/custom.scss', packages: ['test-only']");
  const { fixture, site } = siteWith(t, { 'requirements.cjs': table });
  writeFiles(site, { 'node_modules/react/package.json': '{ "version": "19.2.3" }\n' });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.doesNotMatch(report.stdout, /^warn/m);
});

test('a new site\'s files in template/ are no suite\'s business', (t) => {
  const { fixture, site } = siteWith(t, { 'template/src/own.test.js': failing('template test') });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.doesNotMatch(report.stdout, /template test/);
});

test('--scripts runs the scripts\' suites', (t) => {
  const { fixture, site } = siteWith(t);
  const report = run(fixture, site, '--scripts');
  assert.equal(report.status, EXIT.OK, report.output);
  assert.match(report.stdout, /script suite runs/);
  assert.doesNotMatch(report.stdout, /^skip {2}scripts/m);
});

test('uncommitted work under shared/scripts runs them, a changed file or a new one', (t) => {
  const { fixture, site } = siteWith(t);
  writeFiles(site, { 'shared/scripts/new.mjs': 'export {};\n' });
  assert.match(run(fixture, site).stdout, /^run {3}scripts\/__tests__: .*uncommitted changes, 1 file$/m);
  fs.rmSync(path.join(site, 'shared/scripts/new.mjs'));
  writeFiles(site, { 'shared/scripts/__tests__/own.test.mjs': passing('script suite changed') });
  const report = run(fixture, site);
  assert.match(report.stdout, /script suite changed/);
});

test('a commit under shared/scripts runs them until it has reached the hub', (t) => {
  const { fixture, site } = siteWith(t);
  fixture.commitToSite(site, { 'shared/scripts/own.mjs': 'export {};\n' }, 'Add a script');
  assert.match(run(fixture, site).stdout, /^run {3}scripts\/__tests__: .*differs from the hub commit this site recorded, 1 file$/m);
  fixture.subtreePush(site);
  fixture.rejoin(site);
  assert.match(run(fixture, site).stdout, /^skip {2}scripts\/__tests__: .*matches hub [0-9a-f]{7}, the commit this site recorded/m);
});

test('a commit elsewhere in shared/ leaves them out, and so does a hub commit not pulled yet', (t) => {
  const { fixture, site } = siteWith(t);
  fixture.commitToSite(site, { 'shared/css/custom.scss': 'changed\n' }, 'Change the styles');
  assert.match(run(fixture, site).stdout, /^skip {2}scripts\/__tests__/m);
  fixture.commitToHub({ 'scripts/hub.mjs': 'export {};\n' }, 'Add a script on the hub');
  fixture.git(['fetch', '-q', 'shared', 'main'], site);
  assert.match(run(fixture, site).stdout, /^skip {2}scripts\/__tests__/m);
});

test('a fresh clone has no hub commits to compare, so it leaves them out and says that', (t) => {
  const { fixture, site } = siteWith(t);
  const clone = path.join(fixture.sites, 'clone');
  fixture.git(['clone', '-q', '--no-local', site, clone], fixture.sites);
  const report = run(fixture, clone);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.match(report.stdout, /^skip {2}scripts\/__tests__: .*not here to compare\. To run them: npm run test:shared -- --scripts$/m);
});

test('a run started inside a test still runs its files and keeps its exit code', (t) => {
  const { fixture, site } = siteWith(t, { '__tests__/always.test.mjs': failing('always fails') });
  fixture.env.NODE_TEST_CONTEXT = 'child-v8';
  const report = run(fixture, site);
  assert.equal(report.status, 1, report.output);
  assert.match(report.stdout, /always fails/);
});

/** A test that waits for a file that never comes, as the one that once held a run for seven hours did. */
const hanging = (name) => `import fs from 'node:fs';\nimport test from 'node:test';\ntest('${name}', async () => {\n  while (!fs.existsSync('/never/there')) await new Promise((resolve) => { setTimeout(resolve, 50); });\n});\n`;

/** The limit a hanging test is given here, and how long the whole run may take before this test calls it stuck. */
const SHORT_LIMIT_SECONDS = 3;
const STUCK_MS = 90_000;

test('node gets a limit per test on Node 24 and later, per file before, and the variable moves it', () => {
  assert.deepEqual(nodeLimit({}, '24.21.0'), { seconds: TEST_LIMIT_SECONDS, per: 'test' });
  assert.deepEqual(nodeLimit({}, '22.18.0'), { seconds: FILE_LIMIT_SECONDS, per: 'file' });
  assert.deepEqual(nodeLimit({ [TEST_LIMIT_ENV]: '30' }, '24.0.0'), { seconds: 30, per: 'test' });
  assert.deepEqual(nodeLimit({ [TEST_LIMIT_ENV]: 'soon' }, '24.0.0'), { seconds: TEST_LIMIT_SECONDS, per: 'test' });
  assert.ok(FILE_LIMIT_SECONDS > TEST_LIMIT_SECONDS);
});

test('a test that never ends fails by its file and name, and the run ends with the other suites run', (t) => {
  const { fixture, site } = siteWith(t, {
    '__tests__/always.test.mjs': hanging('waits for a file that never comes'),
    'components/Widget/__tests__/format.test.mjs': passing('widget mjs runs'),
  });
  const env = { ...fixture.env, [TEST_LIMIT_ENV]: String(SHORT_LIMIT_SECONDS) };
  const script = path.join(HUB_ROOT, 'scripts/test.mjs');
  const started = Date.now();
  const report = spawnSync(process.execPath, [script], { cwd: site, env, encoding: 'utf8', timeout: STUCK_MS });
  const output = `${report.stdout}${report.stderr}`;
  assert.equal(report.error?.code, undefined, `the run did not end within ${STUCK_MS} ms:\n${output}`);
  assert.equal(report.status, 1, output);
  assert.match(report.stdout, /^FAIL {2}ran out of time \(.*\): shared\/__tests__\/always\.test\.mjs: waits for a file that never comes/m);
  assert.match(report.stdout, /widget mjs runs/);
  assert.ok(Date.now() - started < STUCK_MS);
});

test('a test a file declares after a top-level await still runs', (t) => {
  const late = "import test from 'node:test';\ntest('declared first', () => {});\nawait new Promise((resolve) => { setTimeout(resolve, 800); });\ntest('declared after an await', () => {});\n";
  const { fixture, site } = siteWith(t, { '__tests__/always.test.mjs': late });
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.OK, report.output);
  assert.match(report.stdout, /declared first/);
  assert.match(report.stdout, /declared after an await/, 'no flag of node may end a file before it has declared its tests');
});

test('a usage mistake is exit 2: an unknown option, an option npm kept, a repository with no shared/', (t) => {
  assert.deepEqual(parseArgs(['--scripts']), { scripts: true, help: false });
  const { fixture, site } = siteWith(t);
  assert.equal(run(fixture, site, '--nope').status, EXIT.USAGE);
  assert.equal(run(fixture, site, '--help').status, EXIT.OK);
  const plain = fixture.addRepository('plain', { 'a.txt': 'a\n' });
  assert.match(run(fixture, plain).stderr, /has no shared\/ folder/);
  fixture.env.npm_lifecycle_event = 'test:shared';
  fixture.env.npm_config_scripts = 'true';
  const kept = run(fixture, site);
  assert.equal(kept.status, EXIT.USAGE, kept.output);
  assert.match(kept.stderr, /npm run test:shared -- --scripts/);
});

test('no requirements.cjs is exit 3', (t) => {
  const { fixture, site } = siteWith(t);
  fs.rmSync(path.join(site, 'shared/requirements.cjs'));
  const report = run(fixture, site);
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assert.match(report.stderr, /requirements\.cjs is missing/);
});

test('the hub\'s real table: every suite holds test files, and every test file is in a suite', { skip: !fs.existsSync(path.join(HUB_ROOT, 'requirements.cjs')) }, async () => {
  const { default: table } = await import(path.join(HUB_ROOT, 'requirements.cjs'));
  const rowSuites = table.ENTRIES.flatMap((row) => row.suites ?? []);
  // Two rows may name one folder, as DropDownIC and the wiring do: it runs once.
  const folders = [...new Set([...table.ALWAYS_SUITES, ...table.SCRIPT_SUITES, ...rowSuites])];
  for (const folder of folders) assert.notEqual(testFilesIn(HUB_ROOT, folder).length, 0, folder);
  const listed = folders.flatMap((folder) => testFilesIn(HUB_ROOT, folder)).sort();
  assert.deepEqual(allTestFiles(HUB_ROOT).sort(), listed);
  assert.deepEqual(strayTestFiles(HUB_ROOT), [], 'a file named like a test that never runs');
});
