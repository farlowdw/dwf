/**
 * scripts/__tests__/fixture.mjs: real git repositories for the scripts' tests, in the system's temp
 * folder: a bare hub, a working clone of it, and sites beside each other that mount it with real
 * `git subtree` commands. Nothing is faked: each state a test reads is built by the commands a person
 * would run. Git runs with its own global config, which ignores `*.gz` the way a real machine's can.
 *
 *     const fixture = makeFixture();                 t.after(fixture.cleanup) in each test
 *     const site = fixture.addSite('one');           a site at the hub's tip, on master
 *     fixture.commitToHub({ 'a.txt': 'x' }, 'Subject');
 *     fixture.commitToSite(site, { 'shared/a.txt': 'y' }, 'Subject');
 *     fixture.addSharedLines(site);                  the npm lines a joined site holds, committed
 *     fixture.subtreePush(site);  fixture.rejoin(site);  fixture.subtreePull(site);
 *     fixture.status(site, '--offline');             runs the real status.mjs in that site
 *     fixture.script('push.mjs', site, '--yes');     any other script of this folder, the same way
 *     fixture.answerFromNpm('3.11.0');               what the stand-in for npm says next; null fails
 *     fixture.uninstall('react');  fixture.uninstall();  one stand-in package off the disk, or all of them
 *     const server = await startServer(t, site);     a real server, gone when the test ends
 *
 * Every site sits below one node_modules of stand-ins, one package.json for each name of the hub's RANGES, so
 * a site reads as installed the way a real one does after its npm ci: node, and the scripts, look in the
 * folders above a site too. It sits beside the sites, never in one, so no site's git sees it and a test can
 * still put a node_modules of its own, or a link to one, into a site.
 *
 * The other scripts' suites reuse this file: add a helper here, not a second fixture.
 *
 * Nothing a test starts may outlive it. A runner that is killed runs no `after` hook, and two servers
 * once ran for 7 hours that way. So a process here has three ends: stopProcess in the test's `after`,
 * a closed stdin when the test process dies however it dies, and PROCESS_LIFE_MS as the last word.
 * strays.test.mjs proves each one.
 *
 * HOW TO CHANGE IT
 *   HUB_SEED and SITE_SEED are the files each repository starts with. WORD_LIST is the fixture's
 *   private list: made-up words, because this file reaches public history too. PIN is the one
 *   Docusaurus version of the seeds, so a fixture site starts on the pin with no warning.
 *   PROCESS_LIFE_MS must stay longer than any test that waits on such a process.
 */

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_LINES, VERIFY_LINE, VERIFY_LINE_NAME } from '../lib/joinSettings.mjs';
import { loadRequirementsText } from '../lib/requirements.mjs';
import { NPM_COMMAND_ENV, REMOTE_URL_ENV, WORD_LIST_ENV } from '../lib/settings.mjs';

const SCRIPTS_FOLDER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** A script of the hub's own working copy, run in a fixture's site. */
function scriptPath(name) {
  return path.join(SCRIPTS_FOLDER, name);
}

/** Inherited variables that would point git or npm somewhere else. */
const CLEARED_VARIABLE = /^(GIT_|npm_)/i;

export const WORD_LIST = [
  '# The fixture\'s private words.',
  'zebrafish',
  'quokka',
  'quokka\tdocs/allowed.md',
  '',
].join('\n');

const REQUIREMENTS_TEXT = `module.exports = {
  KIND: { component: 'component', theme: 'theme', plugin: 'plugin', library: 'library' },
  RANGES: { react: '^19.0.0', sass: '^1.80.5', 'tiny-editor': '1.2.3' },
  ENTRIES: [
    { name: 'Styles', kind: 'plugin', configText: 'shared/css/custom.scss', packages: ['sass'], suites: [] },
    {
      name: 'Admonition', kind: 'theme', stub: 'src/theme/Admonition/Types.js',
      evidence: { configText: 'admonitionsConfig', docsPattern: '^:::keynote\\\\b' }, packages: ['react'], suites: [],
    },
    {
      name: 'Widget', kind: 'component', stub: 'src/components/Widget/index.jsx',
      evidence: { docsPattern: "['\\"]@site/src/components/Widget['\\"/]" }, packages: ['react'], suites: [],
    },
    {
      name: 'Editor', kind: 'component', stub: 'src/components/Editor/index.jsx',
      evidence: { docsPattern: "['\\"]@site/src/components/Editor['\\"/]" }, packages: ['tiny-editor'], suites: [],
    },
    { name: 'Reload', kind: 'library', clientImport: 'shared/lib/reload', packages: ['tiny-editor'], suites: [] },
  ],
  ALWAYS_SUITES: ['__tests__'],
  SCRIPT_SUITES: ['scripts/__tests__'],
  BUILT_IN_IMPORTS: [],
};
`;

/** The Docusaurus version of the fixture's pin. */
export const PIN = '3.10.2';

/** The Node version of the fixture's pin. */
export const NODE_PIN = '22';

const TEMPLATE_MANIFEST = JSON.stringify({
  name: 'fixture-template',
  dependencies: { '@docusaurus/core': PIN, '@docusaurus/theme-classic': PIN, react: '^19.0.0', '@mui/material': '^9.4.0' },
  devDependencies: { '@docusaurus/types': PIN },
}, null, 2);

const HUB_SEED = Object.freeze({
  'README.md': 'The fixture hub.\n',
  'package.json': '{ "name": "fixture-hub", "version": "0.0.0", "private": true }\n',
  'requirements.cjs': REQUIREMENTS_TEXT,
  'components/Widget/index.jsx': 'export default function Widget() {\n  return null;\n}\n',
  'css/custom.scss': 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n',
  'template/package.json': `${TEMPLATE_MANIFEST}\n`,
  'template/.nvmrc': `${NODE_PIN}\n`,
});

const LOCK_TEXT = JSON.stringify({
  lockfileVersion: 3,
  packages: {
    'node_modules/@docusaurus/core': { version: PIN },
    'node_modules/react': { version: '19.2.3' },
    'node_modules/sass': { version: '1.97.2' },
  },
}, null, 2);

const SITE_MANIFEST = JSON.stringify({
  name: 'fixture-site',
  private: true,
  dependencies: { '@docusaurus/core': PIN, react: '^19.0.0' },
}, null, 2);

const SITE_SEED = Object.freeze({
  'package.json': `${SITE_MANIFEST}\n`,
  'package-lock.json': `${LOCK_TEXT}\n`,
  '.nvmrc': `${NODE_PIN}\n`,
  'netlify.toml': `[build.environment]\n  NODE_VERSION = "${NODE_PIN}"\n`,
  'docusaurus.config.js': "module.exports = { customCss: ['./shared/css/custom.scss'] };\n",
  'src/components/Widget/index.jsx': "export { default } from '@site/shared/components/Widget';\n",
  'docs/intro.md': "import Widget from '@site/src/components/Widget';\n\n<Widget />\n",
});

/** Writes `files`, a map from a relative path to its text, below `folder`. */
export function writeFiles(folder, files) {
  for (const [name, text] of Object.entries(files)) {
    const target = path.join(folder, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
}

/** The process's variables with everything that steers git or npm taken out. */
function cleanEnv() {
  const kept = Object.entries(process.env).filter(([name]) => !CLEARED_VARIABLE.test(name));
  return Object.fromEntries(kept);
}

/** The git config and ignore file every repository of a fixture runs with. */
function writeGitConfig(base) {
  const ignoreFile = path.join(base, 'global-ignore');
  const configFile = path.join(base, 'gitconfig');
  fs.writeFileSync(ignoreFile, '*.gz\n.DS_Store\n');
  fs.writeFileSync(configFile, [
    '[user]', '\tname = Fixture', '\temail = fixture@example.invalid',
    '[core]', `\texcludesFile = ${ignoreFile}`,
    '[init]', '\tdefaultBranch = master',
    '[commit]', '\tgpgSign = false',
    '[gc]', '\tauto = 0',
    '',
  ].join('\n'));
  return configFile;
}

/**
 * Writes a stand-in for npm: it notes each call in `calls` and prints `answer`. With no `answer` file
 * it exits 1, as npm does without a network. Returns the command.
 */
function writeFakeNpm(base, { answer, calls }) {
  const command = path.join(base, 'fake-npm');
  const script = ['#!/bin/sh', `echo "$*" >> "${calls}"`, `exec cat "${answer}" 2>/dev/null`, ''].join('\n');
  fs.writeFileSync(command, script, { mode: 0o755 });
  return command;
}

/** The stand-in packages, below the folder that holds the sites: one package.json per name of RANGES. */
function installStandIns(base) {
  const folder = path.join(base, 'node_modules');
  const { table } = loadRequirementsText(REQUIREMENTS_TEXT, path.join(base, 'requirements.cjs'));
  for (const name of Object.keys(table.RANGES)) {
    writeFiles(folder, { [`${name}/package.json`]: `${JSON.stringify({ name, version: 'stand-in' })}\n` });
  }
  return folder;
}

/** Makes the bare hub and its working clone. Returns the helpers of one fixture. */
export function makeFixture() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shared-fixture-')));
  const hub = path.join(base, 'hub.git');
  const hubWork = path.join(base, 'hub-work');
  const sites = path.join(base, 'sites');
  const wordList = path.join(base, 'private-words.txt');
  const npmAnswer = path.join(base, 'fake-npm-answer');
  const npmCalls = path.join(base, 'fake-npm-calls');
  fs.mkdirSync(sites);
  const installed = installStandIns(base);
  fs.writeFileSync(wordList, WORD_LIST);
  fs.writeFileSync(npmAnswer, `${PIN}\n`);
  const env = {
    ...cleanEnv(),
    HOME: base,
    GIT_CONFIG_GLOBAL: writeGitConfig(base),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    [REMOTE_URL_ENV]: hub,
    [WORD_LIST_ENV]: wordList,
    [NPM_COMMAND_ENV]: writeFakeNpm(base, { answer: npmAnswer, calls: npmCalls }),
  };

  /** Runs git, insists on exit 0 and returns its trimmed output. */
  const git = (args, cwd, extraEnv = {}) => {
    const result = spawnSync('git', args, { cwd, env: { ...env, ...extraEnv }, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };

  /** Writes files, stages exactly those, commits. Returns the new sha. */
  const commitFiles = (folder, files, subject) => {
    writeFiles(folder, files);
    git(['add', '--', ...Object.keys(files)], folder);
    git(['commit', '-q', '-m', subject], folder);
    return git(['rev-parse', 'HEAD'], folder);
  };

  git(['init', '-q', '--bare', '-b', 'main', hub], base);
  git(['init', '-q', '-b', 'main', hubWork], base);
  git(['remote', 'add', 'origin', hub], hubWork);
  commitFiles(hubWork, HUB_SEED, 'Seed the hub');
  git(['push', '-q', 'origin', 'main'], hubWork);

  /** What the stand-in for npm prints from now on. null makes it fail. */
  const answerFromNpm = (text) => {
    if (text === null) fs.rmSync(npmAnswer);
    else fs.writeFileSync(npmAnswer, `${text}\n`);
  };

  /** Takes one stand-in package off the disk, or all of them, as a fresh clone has none. */
  const uninstall = (name) => {
    fs.rmSync(name === undefined ? installed : path.join(installed, name), { recursive: true, force: true });
  };

  /** How many times the stand-in for npm has run. */
  const npmCallCount = () => {
    if (!fs.existsSync(npmCalls)) return 0;
    return fs.readFileSync(npmCalls, 'utf8').trim().split('\n').length;
  };

  /** A commit on the hub, pushed. Returns its sha. */
  const commitToHub = (files, subject) => {
    const sha = commitFiles(hubWork, files, subject);
    git(['push', '-q', 'origin', 'main'], hubWork);
    return sha;
  };

  /** A new folder holding a first commit of `files`. */
  const addRepository = (name, files) => {
    const root = path.join(sites, name);
    fs.mkdirSync(root);
    git(['init', '-q', '-b', 'master'], root);
    commitFiles(root, files, 'Start the site');
    return root;
  };

  /** A site that mounts the hub, as `git subtree add --squash` does it. */
  const addSite = (name, files = SITE_SEED) => {
    const root = addRepository(name, files);
    git(['remote', 'add', 'shared', hub], root);
    git(['subtree', 'add', '--prefix', 'shared', 'shared', 'main', '--squash'], root);
    return root;
  };

  /** Gives a site the npm lines a joined site holds, as a join writes them, in one commit. Returns the lines. */
  const addSharedLines = (root, own = { [VERIFY_LINE_NAME]: VERIFY_LINE }) => {
    const file = path.join(root, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.scripts = { ...manifest.scripts, ...SITE_LINES, ...own };
    commitFiles(root, { 'package.json': `${JSON.stringify(manifest, null, 2)}\n` }, 'Add the shared commands');
    return manifest.scripts;
  };

  return {
    base,
    hub,
    hubWork,
    sites,
    env,
    wordList,
    git,
    commitToHub,
    answerFromNpm,
    uninstall,
    npmCallCount,
    addRepository,
    addSite,
    addSharedLines,
    commitToSite: commitFiles,
    subtreePush: (root) => git(['subtree', 'push', '--prefix', 'shared', 'shared', 'main'], root),
    rejoin: (root) => git(['subtree', 'split', '--prefix', 'shared', '--rejoin', '--squash'], root),
    subtreePull: (root) => git(['subtree', 'pull', '--prefix', 'shared', 'shared', 'main', '--squash', '-m', 'shared: pull'], root),
    status: (root, ...args) => runScript(scriptPath('status.mjs'), root, args, env),
    statusWith: (root, otherEnv, ...args) => runScript(scriptPath('status.mjs'), root, args, otherEnv),
    statusAsync: (root, ...args) => runScriptAsync(scriptPath('status.mjs'), root, args, env),
    script: (name, root, ...args) => runScript(scriptPath(name), root, args, env),
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

/** The longest a process started for a test may live, whatever becomes of the test. */
export const PROCESS_LIFE_MS = 120_000;

/** Goes on every process's command line, so a scan can name what a run left behind. */
export const SERVER_MARK = 'shared-test-server';

/** Set this variable and each server also carries its value: strays.test.mjs tells its own apart so. */
export const RUN_MARK_ENV = 'DOCUSAURUS_SHARED_TEST_RUN';

/** Code that keeps a process alive until the limit, and no longer: a hung step that still ends. */
export function hangCode(limitMs = PROCESS_LIFE_MS) {
  return `setTimeout(() => process.exit(0), ${limitMs});setInterval(() => {}, 1000);`;
}

/** A small server: port 0 asks the system for a free port, never one of the sites' own. */
const SERVER_CODE = `
  const server = require('node:http').createServer((request, response) => response.end('ok'));
  server.listen(0, '127.0.0.1', () => console.log('up'));
  process.stdin.on('end', () => process.exit(0)).resume();
  setTimeout(() => process.exit(0), ${PROCESS_LIFE_MS});
`;

/**
 * A server's streams. It inherits none of the test's, or a run that waits on a test's output would wait
 * on a stray server too, and then find nothing left to report.
 */
const SERVER_STDIO = ['pipe', 'pipe', 'ignore'];

/** Kills a child and waits until it is gone. A child already gone is fine. */
export function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('close', resolve);
    child.kill('SIGKILL');
  });
}

/** Starts a real server in `cwd`, waits until it listens, and stops it when the test ends. */
export function startServer(t, cwd) {
  const args = ['-e', SERVER_CODE, SERVER_MARK, process.env[RUN_MARK_ENV] ?? ''];
  const child = spawn(process.execPath, args, { cwd, stdio: SERVER_STDIO });
  t.after(() => stopProcess(child));
  return new Promise((resolve, reject) => {
    child.stdout.once('data', () => resolve(child));
    child.once('exit', (code) => reject(new Error(`the server ended before it listened: ${code}`)));
  });
}

/** Runs a script in a folder: { status, stdout, stderr, output }. */
export function runScript(script, cwd, args, env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

/** The same without blocking this process, for a test whose own child must keep running. */
export function runScriptAsync(script, cwd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr, output: `${stdout}${stderr}` }));
  });
}

/** The report's line for a label at a level, or a failure showing the whole report. */
export function assertLine(report, level, label, pattern) {
  const start = `${level.padEnd(5)}${label.padEnd(13)}`;
  const line = report.stdout.split('\n').find((row) => row.startsWith(start) && pattern.test(row));
  assert.ok(line, `no ${level} ${label} line matching ${pattern} in:\n${report.output}`);
  return line;
}

/** A fixture for one test, removed when the test ends. */
export function fixtureFor(t) {
  const fixture = makeFixture();
  t.after(fixture.cleanup);
  return fixture;
}
