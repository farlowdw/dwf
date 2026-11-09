/**
 * scripts/__tests__/allFixture.mjs: sites for the shared:all tests, on what fixture.mjs and bumpFixture.mjs
 * already give. The git is real, and so is the hub. The hub here also holds the real scripts, so a site runs its
 * own shared/scripts/all.mjs and its own pull and bump, as a mounted site does, and a pull replaces the file
 * that is running. npm and the compare are the bump suite's stand-ins.
 *
 *     const context = allSites(t);                         sites one, two and zed on the pin, each with a fresh build
 *     const context = allSites(t, { on: FROM });           the same sites off the pin
 *     const context = allSites(t, { scenario });           what the stand-ins do, `sites` for one site
 *     context.all(site, 'pull');                           runs shared:all there, with a new --keep folder
 *     context.hubChange();                                 a hub commit outside template/
 *     context.steps();                                     "<site> <step>" lines, in the order they ran
 *     context.line(site, printed);                         runs a printed `npm run shared:all` line
 *
 * HOW TO CHANGE IT
 *   Another fact a test reads: a helper in the returned object. What a stand-in can do: bumpFixture.mjs.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPARE_SCRIPT_ENV } from '../lib/bumpSettings.mjs';
import { NPM_COMMAND_ENV } from '../lib/settings.mjs';
import { TEST_SCRIPT_ENV } from '../lib/testGate.mjs';
import { freshen, installFromLock, lockOn, manifestOn, pageOf, siteFiles, writeStandIns } from './bumpFixture.mjs';
import { PIN, fixtureFor, writeFiles } from './fixture.mjs';
import { stubTests } from './flows.mjs';

const SCRIPTS_FOLDER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OWN_ALL = path.join('shared', 'scripts', 'all.mjs');
const KEPT_ACTIONS = new Set(['pull', 'bump', 'run']);
const COMMAND_START = 'npm run shared:all -- ';

const SITE_NAMES = Object.freeze(['one', 'two', 'zed']);

/** The scripts and the library as a map from a hub path to its text. Not the tests: they hold the word list's words. */
function realScripts() {
  const files = {};
  for (const folder of ['', 'lib']) {
    const here = path.join(SCRIPTS_FOLDER, folder);
    for (const name of fs.readdirSync(here).filter((file) => file.endsWith('.mjs'))) {
      files[path.join('scripts', folder, name)] = fs.readFileSync(path.join(here, name), 'utf8');
    }
  }
  return files;
}

/** One site on `version`, mounted, installed and built. */
function addBuiltSite(fixture, name, version) {
  const files = siteFiles({ manifest: manifestOn(version), lock: lockOn(version) });
  const site = fixture.addSite(name, files);
  installFromLock(site);
  writeFiles(site, { 'build/index.html': pageOf(version) });
  freshen(site);
  return site;
}

/** The lines of a jsonl file, or nothing. */
function readJsonLines(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}

/** The words of a printed line. */
function wordsOf(printed) {
  const start = printed.indexOf(COMMAND_START);
  return printed.slice(start + COMMAND_START.length).trim().split(' ');
}

/** The first output line that holds `piece`, or the empty text. */
export function lineWith(output, piece) {
  return output.split('\n').find((line) => line.includes(piece))?.trim() ?? '';
}

/** Sites on one hub, with everything a suite reads. */
export function allSites(t, { names = SITE_NAMES, on = PIN, scenario = {}, tests = {} } = {}) {
  const fixture = fixtureFor(t);
  const npm = writeStandIns(fixture.base);
  const { base } = fixture;
  fixture.commitToHub(realScripts(), 'Add the scripts');
  const sites = Object.fromEntries(names.map((name) => [name, addBuiltSite(fixture, name, on)]));
  const pushTests = stubTests(fixture, tests);
  const env = {
    ...fixture.env,
    ...pushTests.env,
    BUMP_FIXTURE: base,
    PATH: `${path.dirname(npm)}:${fixture.env.PATH}`,
    [NPM_COMMAND_ENV]: npm,
    [COMPARE_SCRIPT_ENV]: path.join(base, 'compare-stand-in.mjs'),
  };
  fs.writeFileSync(path.join(base, 'scenario.json'), JSON.stringify(scenario));
  let keepCount = 0;
  const withKeep = (args) => {
    const needed = KEPT_ACTIONS.has(args[0]) && !args.includes('--keep');
    keepCount += 1;
    return needed ? [...args, '--keep', path.join(base, `keep-${keepCount}`)] : args;
  };
  const all = (site, ...args) => {
    const result = spawnSync(process.execPath, [OWN_ALL, ...withKeep(args)], { cwd: site, env, encoding: 'utf8', input: '' });
    return { ...result, output: `${result.stdout}${result.stderr}` };
  };
  const allAnswering = (site, input, ...args) => {
    const result = spawnSync(process.execPath, [OWN_ALL, ...withKeep(args)], { cwd: site, env, encoding: 'utf8', input });
    return { ...result, output: `${result.stdout}${result.stderr}` };
  };
  const steps = () => {
    const file = path.join(base, 'steps.log');
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : [];
  };
  return {
    fixture, sites, env, base, npm, all, allAnswering, steps, pushTests,
    ownAll: OWN_ALL,
    keep: () => path.join(base, 'keep-named'),
    line: (site, printed) => all(site, ...wordsOf(printed)),
    calls: () => readJsonLines(path.join(base, 'npm-calls.jsonl')),
    compares: () => readJsonLines(path.join(base, 'compare-calls.jsonl')),
    setScenario: (next) => fs.writeFileSync(path.join(base, 'scenario.json'), JSON.stringify(next)),
    hubChange: (subject = 'Change the styles') => fixture.commitToHub({ 'css/custom.scss': `${subject}\n` }, subject),
    templateChange: () => fixture.commitToHub({ 'template/notes.txt': 'A note for new sites.\n' }, 'Add a note to the template'),
    head: (site) => fixture.git(['rev-parse', 'HEAD'], site),
    changes: (site) => fixture.git(['status', '--porcelain'], site),
    subject: (site) => fixture.git(['log', '-1', '--format=%s'], site),
    hubHead: () => fixture.git(['rev-parse', 'main'], fixture.hub),
    hubPin: () => JSON.parse(fixture.git(['show', 'main:template/package.json'], fixture.hub)).dependencies['@docusaurus/core'],
    readSite: (site, name) => fs.readFileSync(path.join(site, name), 'utf8'),
    shell: (cwd, line) => spawnSync('sh', ['-c', line], { cwd, env, encoding: 'utf8' }),
    pathOfFreshBuild: (site) => freshen(site),
    builtJustNow: (site) => {
      const now = new Date();
      fs.utimesSync(path.join(site, 'build/index.html'), now, now);
    },
  };
}
