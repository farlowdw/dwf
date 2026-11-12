/**
 * joinPlans.test.mjs: the pure rules of `shared:join`, with no site around them: the ignore plan, the
 * deploy line, what makes two files the same, what a stub looks like, how the patch fits, the shape of the
 * template's netlify.toml and of the patch in scripts/patches/.
 *
 * HOW TO CHANGE IT
 *   A new line a joined .gitignore needs: a row in OLD_FILES or a new test beside it. Repositories belong in
 *   join.test.mjs.
 * Run with `npm run test:shared -- --scripts`, or `node --test "scripts/__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { holdsEnv, planDeploy, planIgnore, planNetlify } from '../lib/joinHousekeeping.mjs';
import { applyLine, patchFit, patchedFiles } from '../lib/joinPatch.mjs';
import { readOnPush, ON_PUSH } from '../lib/joinNetlify.mjs';
import {
  DEPLOY_LINE, DEPLOY_STEPS_LINE, IGNORE_TEMPLATE_FILE, MUI_PATCH, OLD_DEPLOY_LINES, PLAIN_BUILD_LINE, PUBLIC_BUILD_LINE,
  PUBLIC_CHECK_LINE,
} from '../lib/joinSettings.mjs';
import { sameCode, stubTarget, stubText, writeStub } from '../lib/joinStubs.mjs';
import { NVMRC_FILE } from '../lib/settings.mjs';
import { readStub } from '../lib/stubs.mjs';
import { SHARED_ROOT } from './joinFixture.mjs';

/** The README's sections a line of `shared:join` or a stub names. */
const NAMED_SECTIONS = ['Join an existing site', 'Mount it on a site', 'When one site needs something different'];

/** The template's file, which a site with no .gitignore gets. */
const STARTER = fs.readFileSync(path.join(SHARED_ROOT, 'template', IGNORE_TEMPLATE_FILE), 'utf8');

const FIT = { keepNetlifyOut: false, starter: STARTER };
const KEEP_OUT = { keepNetlifyOut: true, starter: STARTER };

/** A folder for one test. */
function tempFolder(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-join-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}

test('a sound ignore file needs no change', () => {
  const text = 'node_modules\n.env\n.netlify\n';
  assert.deepEqual(planIgnore(text, FIT), { text, changes: [] });
});

test('the line that ignores the file itself goes, in both spellings', () => {
  for (const line of ['.gitignore', '/.gitignore']) {
    const { text, changes } = planIgnore(`node_modules\n.env\n.netlify\n${line}\n`, FIT);
    assert.equal(text.split('\n').includes(line), false);
    assert.deepEqual(changes, ['drops the line that ignores .gitignore itself']);
  }
});

test('a netlify.toml line goes when the file is not sitting out of git', () => {
  for (const line of ['netlify.toml', '/netlify.toml']) {
    const { text, changes } = planIgnore(`node_modules\n.env\n.netlify\n${line}\n`, FIT);
    assert.equal(text.includes('netlify.toml'), false);
    assert.deepEqual(changes, ['drops the netlify.toml line']);
  }
});

test('a netlify.toml line gets a slash while the file sits out of git, so the mount\'s stays visible', () => {
  const { text, changes } = planIgnore('node_modules\n.env\n.netlify\nnetlify.toml\n', KEEP_OUT);
  assert.ok(text.split('\n').includes('/netlify.toml'));
  assert.equal(text.split('\n').includes('netlify.toml'), false);
  assert.deepEqual(changes, ['anchors the netlify.toml line']);
});

test('an anchored line stays as it is while the file sits out of git', () => {
  const text = 'node_modules\n.env\n.netlify\n/netlify.toml\n';
  assert.deepEqual(planIgnore(text, KEEP_OUT), { text, changes: [] });
});

test('a root-only node_modules line beside one for any folder stays, and the file needs nothing', () => {
  const text = '# Dependencies\n/node_modules\n# Any folder\'s.\nnode_modules\n.env\n.netlify\n';
  assert.deepEqual(planIgnore(text, FIT), { text, changes: [] });
});

test('the root-only node_modules line widens, so a stray one under shared/ stays out', () => {
  for (const line of ['/node_modules', '/node_modules/']) {
    const { text, changes } = planIgnore(`${line}\n.env\n.netlify\n`, FIT);
    assert.ok(text.split('\n').includes('node_modules'));
    assert.equal(text.split('\n').includes(line), false);
    assert.deepEqual(changes, [`widens ${line} to node_modules`]);
  }
});

test('.env and .netlify are added when absent, and .env.local does not count for .env', () => {
  const { text, changes } = planIgnore('node_modules\n.env.local\n', FIT);
  const lines = text.split('\n');
  assert.ok(lines.includes('.env'));
  assert.ok(lines.includes('.netlify'));
  assert.deepEqual(changes, ['adds .env, .netlify']);
  assert.ok(text.endsWith('\n'));
});

test('.env* and /.env count as holding .env', () => {
  for (const line of ['.env*', '/.env', '.env']) assert.equal(holdsEnv(`a\n${line}\n`), true, line);
  for (const line of ['.env.local', '.envrc', '# .env']) assert.equal(holdsEnv(`a\n${line}\n`), false, line);
});

test('a site\'s other lines stay in their order', () => {
  const { text } = planIgnore('# Custom\n.vscode\n/node_modules\nz.py\n.env\n.netlify\n', FIT);
  assert.equal(text, '# Custom\n.vscode\nnode_modules\nz.py\n.env\n.netlify\n');
});

test('the plan holds after one pass', () => {
  const start = '/node_modules\n/build\nnetlify.toml\n.gitignore\n.env.local\n';
  for (const options of [FIT, KEEP_OUT]) {
    const { text } = planIgnore(start, options);
    assert.deepEqual(planIgnore(text, options), { text, changes: [] });
  }
  const { text } = planIgnore(null, FIT);
  assert.deepEqual(planIgnore(text, FIT), { text, changes: [] });
});

test('no ignore file gets a new one that opens with a comment and lists .env', () => {
  const { text, changes } = planIgnore(null, FIT);
  assert.deepEqual(changes, ['writes a new .gitignore']);
  assert.match(text, /^# /);
  assert.equal(holdsEnv(text), true);
});

test('a line with a carriage return still reads as itself', () => {
  assert.equal(holdsEnv('.env\r\nb\r\n'), true);
  const { changes } = planIgnore('.gitignore\r\nnode_modules\r\n.env\r\n.netlify\r\n', FIT);
  assert.deepEqual(changes, ['drops the line that ignores .gitignore itself']);
});

test('the deploy line: absent or old is replaced, Netlify stays, anything else is the site\'s', () => {
  assert.deepEqual(planDeploy(undefined), { line: DEPLOY_LINE, state: 'replace' });
  assert.deepEqual(planDeploy('docusaurus deploy'), { line: DEPLOY_LINE, state: 'replace' });
  assert.deepEqual(planDeploy('netlify deploy --prod --context production'), { line: DEPLOY_LINE, state: 'replace' });
  assert.deepEqual(planDeploy(DEPLOY_LINE), { line: DEPLOY_LINE, state: 'ok' });
  assert.deepEqual(planDeploy('netlify deploy --prod'), { line: 'netlify deploy --prod', state: 'ok' });
  assert.deepEqual(planDeploy('sh ship.sh'), { line: 'sh ship.sh', state: 'own' });
});

test('the deploy line deploys nothing: it prints the two steps, nvm use first, and exits 1', () => {
  const { status, stdout, stderr } = spawnSync('sh', ['-c', DEPLOY_LINE], { encoding: 'utf8' });
  assert.equal(status, 1, 'a chain that runs npm run deploy stops there');
  assert.equal(stderr, '');
  assert.deepEqual(stdout.split('\n'), [
    'Nothing was deployed: this script only says how.',
    'Deploy in two steps, with the netlify command on your PATH:',
    `  ${DEPLOY_STEPS_LINE}`,
    '',
  ]);
  assert.ok(DEPLOY_STEPS_LINE.startsWith('nvm use && '), 'Node switches first');
  assert.ok(DEPLOY_STEPS_LINE.endsWith(' && netlify deploy --prod --no-build'), 'the deploy publishes the build netlify build made');
  assert.equal(OLD_DEPLOY_LINES.includes(DEPLOY_LINE), false);
});

test('the template\'s netlify.toml has the line --public changes, and its Node is the pin', () => {
  const text = fs.readFileSync(path.join(SHARED_ROOT, 'template', 'netlify.toml'), 'utf8');
  assert.ok(text.includes(PLAIN_BUILD_LINE));
  assert.equal(planNetlify(text, { publicSite: false }), text);
  const shaped = planNetlify(text, { publicSite: true });
  assert.ok(shaped.includes(PUBLIC_BUILD_LINE));
  assert.ok(shaped.includes(PUBLIC_CHECK_LINE));
  assert.equal(shaped.includes(PLAIN_BUILD_LINE), false);
  const node = fs.readFileSync(path.join(SHARED_ROOT, 'template', NVMRC_FILE), 'utf8').trim();
  assert.match(text, new RegExp(`NODE_VERSION = "${node}"`));
  assert.match(text, /SKIP_HTML_MINIFICATION = "true"/);
});

test('two files are the same when only their opening comments differ', () => {
  const code = 'export default 1;\n';
  assert.equal(sameCode(`/**\n * A header.\n */\n\n${code}`, code), true);
  assert.equal(sameCode(`/* one */\n${code}`, `/* two */\n${code}`), true);
  assert.equal(sameCode(code, 'export default 2;\n'), false);
  assert.equal(sameCode(`${code}/* a later comment */\n`, code), false);
  assert.equal(sameCode(`// a line comment\n${code}`, code), false);
});

test('a stub names the shared piece, opens with a comment and reads as a plain re-export', (t) => {
  assert.equal(stubTarget('src/components/LC/index.jsx'), '@site/shared/components/LC');
  assert.equal(stubTarget('src/theme/Admonition/Types.js'), '@site/shared/theme/Admonition/Types');
  assert.match(stubText('src/components/LC/index.jsx'), /^\/\/ src\/components\/LC\/index\.jsx: /);
  const root = tempFolder(t);
  writeStub(root, { stub: 'src/theme/Admonition/Types.js' });
  const stub = readStub(root, 'src/theme/Admonition/Types.js');
  assert.equal(stub.target, '@site/shared/theme/Admonition/Types');
  assert.equal(stub.plain, true);
});

test('a row with no default export gets `export *`, and that reads as a plain stub too', (t) => {
  const stubPath = 'src/components/Registry/flags.js';
  assert.match(stubText(stubPath, { namedOnly: true }), /^export \* from '@site\/shared\/components\/Registry\/flags';$/m);
  assert.doesNotMatch(stubText(stubPath, { namedOnly: true }), /default/);
  assert.match(stubText(stubPath), /^export \{ default \} from /m);
  const root = tempFolder(t);
  writeStub(root, { stub: stubPath, namedOnly: true });
  const stub = readStub(root, stubPath);
  assert.equal(stub.target, '@site/shared/components/Registry/flags');
  assert.equal(stub.plain, true);
});

test('the patch fits file by file, and the line excludes what a site lacks or has changed', (t) => {
  const root = tempFolder(t);
  const patch = path.join(root, 'small.patch');
  fs.writeFileSync(path.join(root, 'kept.txt'), 'old\n');
  fs.writeFileSync(path.join(root, 'moved.txt'), 'something else\n');
  const hunk = (name) => [
    `diff --git a/${name} b/${name}`, `--- a/${name}`, `+++ b/${name}`, '@@ -1 +1 @@', '-old', '+new', '',
  ].join('\n');
  fs.writeFileSync(patch, `# A comment git apply skips.\n\n${hunk('kept.txt')}${hunk('moved.txt')}${hunk('gone.txt')}`);
  assert.deepEqual(patchedFiles(patch), ['kept.txt', 'moved.txt', 'gone.txt']);
  spawnSync('git', ['init', '-q'], { cwd: root });
  const { fitting, leftOut, changed } = patchFit(root, patch);
  assert.deepEqual(fitting, ['kept.txt']);
  assert.deepEqual(leftOut, ['moved.txt', 'gone.txt']);
  assert.deepEqual(changed, ['moved.txt'], 'a file the site holds and has changed is told apart from one it lacks');
  const line = applyLine(leftOut, 'small.patch');
  assert.equal(line, 'git apply --exclude=moved.txt --exclude=gone.txt small.patch');
  const { status } = spawnSync('sh', ['-c', line], { cwd: root });
  assert.equal(status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'kept.txt'), 'utf8'), 'new\n');
  assert.equal(fs.readFileSync(path.join(root, 'moved.txt'), 'utf8'), 'something else\n');
});

test('the MUI patch is a sound patch, opens with a comment and holds no MUI X package', () => {
  const file = path.join(SHARED_ROOT, 'scripts', MUI_PATCH);
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /^# /);
  assert.equal(text.includes('@mui/x-'), false);
  assert.equal(patchedFiles(file).length, 5);
  for (const name of patchedFiles(file)) assert.match(name, /^src\/components\//);
  const { status, stderr } = spawnSync('git', ['apply', '--stat', file], { cwd: SHARED_ROOT, encoding: 'utf8' });
  assert.equal(status, 0, stderr);
});

test('the README holds the sections the messages send a reader to', () => {
  const readme = fs.readFileSync(path.join(SHARED_ROOT, 'README.md'), 'utf8');
  for (const heading of NAMED_SECTIONS) assert.ok(readme.includes(`\n## ${heading}\n`), `no section "${heading}"`);
});

test('a folder with no Netlify state is unlinked, and an unreadable one too', (t) => {
  const root = tempFolder(t);
  assert.equal(readOnPush(root), ON_PUSH.UNLINKED);
  fs.mkdirSync(path.join(root, '.netlify'));
  fs.writeFileSync(path.join(root, '.netlify', 'state.json'), 'not json');
  assert.equal(readOnPush(root), ON_PUSH.UNLINKED);
});
