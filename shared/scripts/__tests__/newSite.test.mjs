/**
 * newSite.test.mjs: `shared:new` on real git, built by fixture.mjs. The hub holds the real template and the real
 * scripts. npm is a stand-in, so a run needs no network and a test can turn any step red, and stand-ins for gh and
 * netlify prove neither one runs. A real install and build of the template are proved by hand, on both Nodes,
 * because each costs a minute and a gigabyte.
 *
 * HOW TO CHANGE IT
 *   A new option: a row in the usage or refusal tests, and a look at the block's test. What the stand-in npm does:
 *   NPM_STAND_IN. Every test cleans up after itself: each child's TMPDIR is a folder of its fixture, so the
 *   logs a red run keeps go when the fixture goes.
 * Run with `npm run test:shared -- --scripts`, or `node --test "scripts/__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { sharedFiles } from '../../__tests__/sharedTree.mjs';
import { EXIT } from '../lib/exitCodes.mjs';
import { PLAIN_BUILD_LINE, PUBLIC_BUILD_LINE } from '../lib/joinSettings.mjs';
import { FILES_SUBJECT, LOCK_SUBJECT, START_SUBJECT } from '../lib/newSiteSettings.mjs';
import { fillTokens } from '../lib/newSiteFiles.mjs';
import { NPM_COMMAND_ENV, REMOTE_URL_ENV, WORD_LIST_ENV } from '../lib/settings.mjs';
import { readRequest } from '../new-site.mjs';
import { WORD_LIST, fixtureFor, runScript, writeFiles } from './fixture.mjs';
import { SHARED_ROOT } from './joinFixture.mjs';

const SCRIPT_FROM_SHARED = 'scripts/new-site.mjs';

/** Tests that read the printed block as fish skip on a machine without it. */
const HAS_FISH = spawnSync('fish', ['--version']).status === 0;

const GOOD_ARGS = Object.freeze(['--title', 'My site', '--url', 'https://my-site.example.com', '--repo', 'owner/my-site']);

/** The real files a fixture's hub needs for a run: the template, and the scripts without their tests. */
const REAL_FILES = /^(?:template\/|scripts\/[^/]+\.mjs$|scripts\/lib\/)/;

/** A word of the fixture's list. It lands in a built file to turn the public check red. */
const LISTED_WORD = WORD_LIST.split('\n')[1];

/** Stands in for npm: `install` writes the lock, `run build` a page and a chunk, and a named step can fail. */
const NPM_STAND_IN = (base) => `#!/bin/sh
step="$1"
[ "$1" = run ] && step="$2"
echo "$step" >> "${base}/npm-steps"
if [ "$(cat "${base}/npm-red" 2>/dev/null)" = "$step" ]; then
  echo "$step went red"
  exit 1
fi
case "$step" in
  install) echo '{ "lockfileVersion": 3 }' > package-lock.json ;;
  build)
    mkdir -p build/assets/js
    printf '<!DOCTYPE html>\\n<html></html>\\n' > build/index.html
    cat "${base}/built-text" > build/assets/js/main.js 2>/dev/null || echo 'plain' > build/assets/js/main.js
    ;;
esac
`;

/** A command that notes it ran. */
const OUTSIDE_STAND_IN = (base) => `#!/bin/sh\necho "$0 $*" >> "${base}/outside-calls"\n`;

/** Writes the stand-ins and returns the environment a run gets. */
function runEnv(fixture) {
  const { base } = fixture;
  const bin = path.join(base, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(base, 'fake-npm-new'), NPM_STAND_IN(base), { mode: 0o755 });
  for (const name of ['gh', 'netlify']) fs.writeFileSync(path.join(bin, name), OUTSIDE_STAND_IN(base), { mode: 0o755 });
  const temp = path.join(base, 'tmp');
  fs.mkdirSync(temp);
  return { ...fixture.env, [NPM_COMMAND_ENV]: path.join(base, 'fake-npm-new'), PATH: `${bin}:${process.env.PATH}`, TMPDIR: temp };
}

/** The real files as a map from a path to its text. */
function realFiles() {
  const files = sharedFiles().filter((file) => REAL_FILES.test(file));
  return Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(SHARED_ROOT, file), 'utf8')]));
}

/** A fixture whose hub holds the real files, and how to run the real script beside its sites. */
function setUp(t) {
  const fixture = fixtureFor(t);
  fixture.commitToHub(realFiles(), 'Add the real template and scripts');
  const env = runEnv(fixture);
  const newSite = (args, options = {}) => {
    const script = options.script ?? path.join(SHARED_ROOT, SCRIPT_FROM_SHARED);
    return runScript(script, options.cwd ?? fixture.sites, args, options.env ?? env);
  };
  const made = (name = 'my-site') => {
    const result = newSite([name, ...GOOD_ARGS]);
    assert.equal(result.status, EXIT.OK, result.output);
    return { result, root: path.join(fixture.sites, name) };
  };
  return { fixture, env, newSite, made };
}

/** A file of a site as text. */
function read(root, name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

/** Every subject in a repository, oldest first. */
function subjects(fixture, root) {
  return fixture.git(['log', '--reverse', '--format=%s'], root).split('\n');
}

/** Which of `step`s the stand-in npm saw, in order. */
function npmSteps(fixture) {
  return read(fixture.base, 'npm-steps').trim().split('\n');
}

test('--help lists every option', (t) => {
  const { newSite, fixture } = setUp(t);
  const { status, stdout } = newSite(['--help']);
  assert.equal(status, EXIT.OK);
  for (const option of ['--title', '--url', '--repo', '--public', '--exclude', '--help']) assert.match(stdout, new RegExp(option));
  assert.deepEqual(fs.readdirSync(fixture.sites), []);
});

const USAGE_ERRORS = Object.freeze([
  ['no folder', [...GOOD_ARGS], /Name one folder/],
  ['two folders', ['one', 'two', ...GOOD_ARGS], /Name one folder/],
  ['no title', ['site', '--url', 'https://a.example.com', '--repo', 'o/n'], /Give --title/],
  ['a blank title', ['site', '--title', '  ', '--url', 'https://a.example.com', '--repo', 'o/n'], /Give --title/],
  ['no url', ['site', '--title', 'T', '--repo', 'o/n'], /Give --url/],
  ['no repo', ['site', '--title', 'T', '--url', 'https://a.example.com'], /Give --repo/],
  ['a title of two lines', ['site', '--title', 'T\nU', '--url', 'https://a.example.com', '--repo', 'o/n'], /one line/],
  ['plain http', ['site', '--title', 'T', '--url', 'http://a.example.com', '--repo', 'o/n'], /must be https/],
  ['an address with a path', ['site', '--title', 'T', '--url', 'https://a.example.com/x', '--repo', 'o/n'], /must be https/],
  ['an address with a query', ['site', '--title', 'T', '--url', 'https://a.example.com/?a=1', '--repo', 'o/n'], /must be https/],
  ['no address at all', ['site', '--title', 'T', '--url', 'somewhere', '--repo', 'o/n'], /must be https/],
  ['a repo without its owner', ['site', '--title', 'T', '--url', 'https://a.example.com', '--repo', 'name'], /owner\/name/],
  ['a folder npm cannot name', ['My Site', ...GOOD_ARGS], /lower case/],
  ['an unknown option', ['site', ...GOOD_ARGS, '--nope'], /--nope/],
  ['--exclude with no path', ['site', ...GOOD_ARGS, '--exclude'], /--exclude/],
]);

for (const [name, args, message] of USAGE_ERRORS) {
  test(`usage: ${name} stops it, and makes nothing`, (t) => {
    const { newSite, fixture } = setUp(t);
    const result = newSite(args);
    assert.equal(result.status, EXIT.USAGE, result.output);
    assert.match(result.stderr, message);
    assert.match(result.stderr, /Usage: npm run shared:new/);
    assert.deepEqual(fs.readdirSync(fixture.sites), []);
  });
}

test('an option npm kept for itself is named, with the line that works', (t) => {
  const { newSite, env, fixture } = setUp(t);
  const kept = { ...env, npm_lifecycle_event: 'shared:new', npm_config_title: 'My site' };
  const result = newSite(['site', '--url', 'https://a.example.com', '--repo', 'o/n'], { env: kept });
  assert.equal(result.status, EXIT.USAGE);
  assert.match(result.stderr, /npm kept --title/);
  assert.deepEqual(fs.readdirSync(fixture.sites), []);
});

test('a folder that holds anything is refused, and left as it was', (t) => {
  const { newSite, fixture } = setUp(t);
  const target = path.join(fixture.sites, 'taken');
  writeFiles(target, { 'keep.txt': 'Mine.\n' });
  const result = newSite(['taken', ...GOOD_ARGS]);
  assert.equal(result.status, EXIT.REFUSED, result.output);
  assert.match(result.stderr, /taken is not empty: it holds 1 entry/);
  assert.match(result.stderr, /Nothing was changed/);
  assert.deepEqual(fs.readdirSync(target), ['keep.txt']);
  assert.equal(read(target, 'keep.txt'), 'Mine.\n');
});

test('a hidden file counts: a folder with only a dot file is refused too', (t) => {
  const { newSite, fixture } = setUp(t);
  writeFiles(path.join(fixture.sites, 'taken'), { '.hidden': 'x' });
  assert.equal(newSite(['taken', ...GOOD_ARGS]).status, EXIT.REFUSED);
});

test('a file in the folder\'s place is refused', (t) => {
  const { newSite, fixture } = setUp(t);
  writeFiles(fixture.sites, { taken: 'A file.\n' });
  const result = newSite(['taken', ...GOOD_ARGS]);
  assert.equal(result.status, EXIT.REFUSED);
  assert.match(result.stderr, /taken is a file/);
});

test('a folder inside a repository is refused, however deep', (t) => {
  const { newSite, fixture } = setUp(t);
  const repository = fixture.addRepository('holder', { 'a.txt': 'x' });
  const result = newSite(['deep/down/my-site', ...GOOD_ARGS], { cwd: repository });
  assert.equal(result.status, EXIT.REFUSED, result.output);
  assert.match(result.stderr, /sits inside a repository/);
  assert.equal(fs.existsSync(path.join(repository, 'deep')), false);
});

test('the index is refreshed just before git subtree add', (t) => {
  const { fixture, newSite, env } = setUp(t);
  const bin = path.join(fixture.base, 'git-bin');
  const calls = path.join(fixture.base, 'git-calls');
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho "$*" >> "${calls}"\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
  const result = newSite(['my-site', ...GOOD_ARGS], { env: { ...env, PATH: `${bin}:${env.PATH}` } });
  assert.equal(result.status, EXIT.OK, result.output);
  const lines = read(fixture.base, 'git-calls').split('\n');
  const add = lines.findIndex((line) => line.startsWith('subtree add --prefix shared'));
  assert.ok(add > 0, lines.join('\n'));
  assert.equal(lines[add - 1], 'update-index -q --refresh');
});

test('a hub out of reach makes nothing', (t) => {
  const { newSite, env, fixture } = setUp(t);
  const result = newSite(['my-site', ...GOOD_ARGS], { env: { ...env, [REMOTE_URL_ENV]: path.join(fixture.base, 'no-hub.git') } });
  assert.equal(result.status, EXIT.GIT, result.output);
  assert.match(result.stderr, /Could not reach the hub/);
  assert.deepEqual(fs.readdirSync(fixture.sites), []);
});

test('--public without a word list is refused before anything is made', (t) => {
  const { newSite, env, fixture } = setUp(t);
  const lost = { ...env, [WORD_LIST_ENV]: path.join(fixture.base, 'no-list.txt') };
  const result = newSite(['my-site', ...GOOD_ARGS, '--public'], { env: lost });
  assert.equal(result.status, EXIT.REFUSED, result.output);
  assert.match(result.stderr, /needs the word list/);
  assert.deepEqual(fs.readdirSync(fixture.sites), []);
});

test('an empty folder is taken', (t) => {
  const { newSite, fixture } = setUp(t);
  fs.mkdirSync(path.join(fixture.sites, 'my-site'));
  const result = newSite(['my-site', ...GOOD_ARGS]);
  assert.equal(result.status, EXIT.OK, result.output);
  assert.equal(fs.existsSync(path.join(fixture.sites, 'my-site/.git')), true);
});

test('a run makes the five commits in order, on master, with a clean tree', (t) => {
  const { fixture, made } = setUp(t);
  const { root, result } = made();
  const log = subjects(fixture, root);
  assert.equal(log.length, 5, log.join('\n'));
  assert.ok(log.includes(START_SUBJECT));
  assert.equal(log.at(-2), FILES_SUBJECT);
  assert.equal(log.at(-1), LOCK_SUBJECT);
  assert.equal(fixture.git(['branch', '--show-current'], root), 'master');
  assert.equal(fixture.git(['status', '--porcelain'], root), '');
  assert.deepEqual(npmSteps(fixture), ['install', 'build', 'shared:verify']);
  assert.match(result.stdout, /24 files from the template/);
});

test('the mount equals the hub, and a status reads it in sync with no commits carried', (t) => {
  const { fixture, made, env } = setUp(t);
  const { root } = made();
  const hubTree = fixture.git(['rev-parse', 'main^{tree}'], fixture.hub);
  assert.equal(fixture.git(['rev-parse', 'HEAD:shared'], root), hubTree);
  const status = runScript(path.join(root, 'shared/scripts/status.mjs'), root, ['--offline'], env);
  assert.match(status.stdout, /hub +in sync at/);
  assert.match(status.stdout, /split +a split carries none of this site's own commits/);
});

test('a run from a site takes the hub that site uses', (t) => {
  const { fixture, newSite, env } = setUp(t);
  const site = fixture.addSite('older');
  const { [REMOTE_URL_ENV]: gone, ...fromSite } = env;
  const script = path.join(site, 'shared', SCRIPT_FROM_SHARED);
  const result = newSite(['../my-site', ...GOOD_ARGS], { script, cwd: site, env: fromSite });
  assert.equal(result.status, EXIT.OK, result.output);
  assert.equal(fixture.git(['remote', 'get-url', 'shared'], path.join(fixture.sites, 'my-site')), gone);
});

test('a run from a clone of the hub takes the clone\'s origin', (t) => {
  const { fixture, newSite, env } = setUp(t);
  const clone = path.join(fixture.base, 'hub-clone');
  fixture.git(['clone', '-q', fixture.hub, clone], fixture.base);
  const { [REMOTE_URL_ENV]: gone, ...fromClone } = env;
  const script = path.join(clone, SCRIPT_FROM_SHARED);
  const result = newSite(['../sites/my-site', ...GOOD_ARGS], { script, cwd: clone, env: fromClone });
  assert.equal(result.status, EXIT.OK, result.output);
  assert.equal(fixture.git(['remote', 'get-url', 'shared'], path.join(fixture.sites, 'my-site')), gone);
});

test('the template becomes the site\'s own files', (t) => {
  const { fixture, made } = setUp(t);
  const { root } = made();
  assert.equal(fs.existsSync(path.join(root, 'gitignore.template')), false);
  assert.match(read(root, '.gitignore'), /^\.env$/m);
  const manifest = JSON.parse(read(root, 'package.json'));
  assert.equal(manifest.name, 'my-site');
  assert.equal(manifest.description, 'My site');
  assert.equal(read(root, '.nvmrc'), read(SHARED_ROOT, 'template/.nvmrc'));
  assert.equal(read(root, 'netlify.toml'), read(SHARED_ROOT, 'template/netlify.toml'));
  const tracked = fixture.git(['ls-files'], root).split('\n').filter((file) => !file.startsWith('shared/'));
  assert.ok(tracked.includes('.gitignore'));
  assert.ok(tracked.includes('src/components/BibRef/bibliography.js'));
  assert.ok(tracked.includes('package-lock.json'));
  for (const file of tracked) assert.doesNotMatch(read(root, file), /__SITE_[A-Z_]+__/, file);
  const config = read(root, 'docusaurus.config.js');
  assert.match(config, /const SITE_TITLE = 'My site';/);
  assert.match(config, /const SITE_URL = 'https:\/\/my-site\.example\.com';/);
  assert.match(config, /https:\/\/github\.com\/owner\/my-site/);
});

test('a title with quotes stays a string in JavaScript, and plain words in a README', () => {
  const title = 'Dan\'s "notes" \\ $& more';
  const js = fillTokens("const SITE_TITLE = '__SITE_TITLE__';", { __SITE_TITLE__: title }, 'docusaurus.config.js');
  assert.equal(new Function(`${js} return SITE_TITLE;`)(), title);
  assert.equal(fillTokens('# __SITE_TITLE__', { __SITE_TITLE__: title }, 'README.md'), `# ${title}`);
});

test('a template with a token this script does not know stops the run before a commit', (t) => {
  const { fixture, newSite } = setUp(t);
  fixture.commitToHub({ 'template/docs/next.md': 'Made by __SITE_AUTHOR__.\n' }, 'Add a token from the future');
  const result = newSite(['my-site', ...GOOD_ARGS]);
  assert.equal(result.status, EXIT.CHECKS, result.output);
  assert.match(result.stderr, /__SITE_AUTHOR__/);
  assert.equal(fs.existsSync(path.join(fixture.base, 'npm-steps')), false);
  assert.equal(fixture.git(['log', '-1', '--format=%s'], path.join(fixture.sites, 'my-site')).includes(FILES_SUBJECT), false);
});

test('a binary file of the template goes across as it is', (t) => {
  const { fixture, newSite } = setUp(t);
  const bytes = Buffer.from([0x89, 0x50, 0x00, 0xff, 0x0a]);
  const work = fixture.hubWork;
  fs.writeFileSync(path.join(work, 'template/static/img/mark.bin'), bytes);
  fixture.git(['add', '--', 'template/static/img/mark.bin'], work);
  fixture.git(['commit', '-q', '-m', 'Add a binary file'], work);
  fixture.git(['push', '-q', 'origin', 'main'], work);
  assert.equal(newSite(['my-site', ...GOOD_ARGS]).status, EXIT.OK);
  assert.deepEqual(fs.readFileSync(path.join(fixture.sites, 'my-site/static/img/mark.bin')), bytes);
});

for (const [step, label] of [['install', 'the install'], ['build', 'the build'], ['shared:verify', 'shared:verify']]) {
  test(`red at ${step}: exit 3, its log, no lock commit, no block, and the folder stays`, (t) => {
    const { fixture, newSite } = setUp(t);
    fs.writeFileSync(path.join(fixture.base, 'npm-red'), `${step}\n`);
    const result = newSite(['my-site', ...GOOD_ARGS]);
    assert.equal(result.status, EXIT.CHECKS, result.output);
    assert.match(result.stderr, new RegExp(`my-site: RED at ${label}: exit code 1`));
    assert.match(result.stderr, new RegExp(`${step} went red`));
    assert.match(result.stderr, /Log: /);
    const log = result.stderr.split('\n').find((line) => line.startsWith('Log: ')).slice('Log: '.length);
    assert.ok(log.startsWith(`${fixture.base}${path.sep}`), `the kept log ${log} sits outside the fixture`);
    assert.match(result.stderr, /Delete that folder, then run this again/);
    assert.doesNotMatch(result.output, /gh repo create/);
    const root = path.join(fixture.sites, 'my-site');
    assert.equal(subjects(fixture, root).at(-1), FILES_SUBJECT);
  });
}

test('a private site: the plain build, a private repository, and the wall before the deploy', (t) => {
  const { made } = setUp(t);
  const { root, result } = made();
  assert.ok(read(root, 'netlify.toml').includes(PLAIN_BUILD_LINE));
  const { stdout } = result;
  assert.match(stdout, /gh repo create owner\/my-site --private --source \. --remote origin --push/);
  const order = ['gh repo create', 'netlify sites:create --name my-site', 'Visitor access', 'CNAME record', 'read -P', 'netlify api updateSite', 'netlify deploy --prod --no-build', 'curl '];
  const places = order.map((text) => stdout.indexOf(text));
  assert.ok(places.every((place) => place >= 0), places.join(' '));
  assert.deepEqual(places, [...places].sort((a, b) => a - b));
  assert.match(stdout, /custom_domain\\":\\"my-site\.example\.com/);
  assert.match(stdout, /and npm run build && git push && netlify deploy --prod --no-build && curl .* https:\/\/my-site\.example\.com$/m);
});

test('a public site: the public check in [build] and at the end of the run, no wall, nothing tracked names the tool', (t) => {
  const { fixture, newSite } = setUp(t);
  const result = newSite(['my-site', ...GOOD_ARGS, '--public', '--exclude', '.toolfolder/']);
  assert.equal(result.status, EXIT.OK, result.output);
  const root = path.join(fixture.sites, 'my-site');
  const { stdout } = result;
  assert.ok(read(root, 'netlify.toml').includes(PUBLIC_BUILD_LINE));
  assert.match(stdout, /public +ok, the public check/);
  assert.match(stdout, /gh repo create owner\/my-site --public/);
  assert.doesNotMatch(stdout, /Visitor access/);
  assert.match(stdout, /&& node shared\/scripts\/check-public\.mjs && git push && netlify deploy/);
  assert.match(read(root, '.git/info/exclude'), /^\.toolfolder\/$/m);
  for (const file of ['.gitignore', 'netlify.toml']) assert.equal(read(root, file).includes('toolfolder'), false, file);
});

test('a red public check stops the run, and prints no word', (t) => {
  const { fixture, newSite } = setUp(t);
  fs.writeFileSync(path.join(fixture.base, 'built-text'), `a ${LISTED_WORD} b\n`);
  const result = newSite(['my-site', ...GOOD_ARGS, '--public']);
  assert.equal(result.status, EXIT.CHECKS, result.output);
  assert.match(result.stderr, /RED at the public check/);
  assert.equal(result.output.includes(LISTED_WORD), false);
  assert.equal(subjects(fixture, path.join(fixture.sites, 'my-site')).at(-1), FILES_SUBJECT);
});

test('a Netlify address needs no domain and no DNS, and a public one nothing to wait for', (t) => {
  const { newSite } = setUp(t);
  const args = ['my-site', '--title', 'T', '--url', 'https://my-site.netlify.app', '--repo', 'owner/my-site', '--public'];
  const { stdout, status } = newSite(args);
  assert.equal(status, EXIT.OK);
  for (const absent of [/custom_domain/, /CNAME/, /read -P/]) assert.doesNotMatch(stdout, absent);
});

test('neither gh nor netlify runs', (t) => {
  const { fixture, made } = setUp(t);
  made();
  assert.equal(fs.existsSync(path.join(fixture.base, 'outside-calls')), false);
});

test('the block is one fish program, for any folder name fish must read quoted', { skip: !HAS_FISH && 'no fish' }, (t) => {
  const { fixture, newSite } = setUp(t);
  const { stdout } = newSite(["it's/my-site", ...GOOD_ARGS]);
  const block = stdout.slice(stdout.indexOf('# Needs gh'));
  assert.match(block, /^cd 'it\\'s\/my-site'$/m);
  const parsed = spawnSync('fish', ['--no-execute', '--command', block], { cwd: fixture.sites, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
});

/** Stand-ins for what the block starts. Each notes its name, and a name in `red` fails. `given` is the project's name Netlify gives. */
function blockStandIns(fixture, red, given = 'my-site') {
  const { base } = fixture;
  const bin = path.join(base, 'block-bin');
  fs.mkdirSync(bin);
  const note = (name) => `echo ${name} >> "${base}/block-steps"\n[ "${red}" = ${name} ] && exit 1\n`;
  const scripts = {
    gh: `#!/bin/sh\n${note('gh')}git remote add origin "${fixture.base}/origin.git"\ngit push -q --set-upstream origin master\n`,
    netlify: `#!/bin/sh\necho "netlify $1" >> "${base}/block-steps"\n[ "${red}" = "netlify $1" ] && exit 1\n`
      + 'if [ "$1" = sites:create ]; then mkdir .netlify; echo \'{ "siteId": "a-site-id" }\' > .netlify/state.json; fi\n'
      + `if [ "$1" = api ] && [ "$2" = getSite ]; then echo '{ "name": "${given}" }'; fi\n`,
    npm: `#!/bin/sh\n${note('npm')}exit 0\n`,
    curl: `#!/bin/sh\n${note('curl')}echo 401\n`,
  };
  for (const [name, text] of Object.entries(scripts)) fs.writeFileSync(path.join(bin, name), text, { mode: 0o755 });
  return bin;
}

/** Runs a printed block in fish beside the sites, with stand-ins first on the PATH and Enter on stdin. */
function runBlock(fixture, stdout, bin) {
  const block = stdout.slice(stdout.indexOf('# Needs gh'));
  fixture.git(['init', '-q', '--bare', 'origin.git'], fixture.base);
  const env = { ...fixture.env, PATH: `${bin}:${process.env.PATH}` };
  return spawnSync('fish', ['--no-config', '--command', block], { cwd: fixture.sites, env, input: '\n', encoding: 'utf8' });
}

/** The steps a block reached, in order. */
function blockSteps(fixture) {
  return read(fixture.base, 'block-steps').trim().split('\n');
}

test('the block runs to its end in fish, in order, with stand-ins for all it starts', { skip: !HAS_FISH && 'no fish' }, (t) => {
  const { fixture, made } = setUp(t);
  const { result, root } = made();
  const run = runBlock(fixture, result.stdout, blockStandIns(fixture, 'none'));
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.deepEqual(blockSteps(fixture), ['gh', 'netlify sites:create', 'netlify api', 'netlify api', 'npm', 'netlify deploy', 'curl']);
  assert.equal(fixture.git(['rev-parse', 'master'], path.join(fixture.base, 'origin.git')), fixture.git(['rev-parse', 'HEAD'], root));
});

test('the block stops at the first line that fails, with nothing deployed', { skip: !HAS_FISH && 'no fish' }, (t) => {
  const { fixture, made } = setUp(t);
  const { result } = made();
  const run = runBlock(fixture, result.stdout, blockStandIns(fixture, 'netlify sites:create'));
  assert.notEqual(run.status, 0);
  assert.deepEqual(blockSteps(fixture), ['gh', 'netlify sites:create']);
});

test('a netlify.app address names the project, and the block stops when Netlify named it otherwise', { skip: !HAS_FISH && 'no fish' }, (t) => {
  const { fixture, newSite } = setUp(t);
  const args = ['dwf-foo', '--title', 'T', '--url', 'https://foo-notes.netlify.app', '--repo', 'owner/dwf-foo', '--public'];
  const result = newSite(args);
  assert.equal(result.status, EXIT.OK, result.output);
  assert.match(result.stdout, /^and netlify sites:create --name foo-notes$/m);
  assert.match(result.stdout, /curl .* https:\/\/\$project\.netlify\.app$/m);
  const taken = runBlock(fixture, result.stdout, blockStandIns(fixture, 'none', 'foo-notes-554'));
  assert.notEqual(taken.status, 0);
  assert.match(taken.stdout, /Netlify named the project foo-notes-554, not foo-notes/);
  assert.deepEqual(blockSteps(fixture), ['gh', 'netlify sites:create', 'netlify api']);
});

test('a custom domain\'s DNS line names the project Netlify gave, and fits a bare domain too', (t) => {
  const { made } = setUp(t);
  const { result } = made();
  const line = result.stdout.split('\n').find((text) => text.includes('At your DNS host'));
  assert.ok(line.startsWith('and echo "At your DNS host, point my-site.example.com at $project.netlify.app:'), line);
  for (const word of ['a CNAME record for a subdomain', 'a bare domain an ALIAS or ANAME record', 'load-balancer A record']) {
    assert.ok(line.includes(word), word);
  }
});

test('a folder name Netlify would refuse for a project stops before anything is made', (t) => {
  const { fixture, newSite } = setUp(t);
  for (const name of ['my_site', 'my.site']) {
    const result = newSite([name, ...GOOD_ARGS]);
    assert.equal(result.status, EXIT.USAGE, result.output);
    assert.match(result.stderr, /takes only letters, digits and hyphens/);
    assert.equal(fs.existsSync(path.join(fixture.sites, name)), false, name);
  }
  const odd = newSite(['my-site', '--title', 'T', '--url', 'https://a.b.netlify.app', '--repo', 'owner/my-site']);
  assert.equal(odd.status, EXIT.USAGE, odd.output);
});

test('every line after the first goes on only if the one before it worked', (t) => {
  const { made } = setUp(t);
  const { result } = made();
  const block = result.stdout.slice(result.stdout.indexOf('# Needs gh')).trim().split('\n');
  const steps = block.filter((line) => !line.startsWith('#'));
  assert.deepEqual(steps.slice(1).filter((line) => !line.startsWith('and ')), []);
});

test('the parts of a request read as one object', () => {
  const request = readRequest(['../my-site', ...GOOD_ARGS, '--exclude', 'a/', '--exclude', 'b/', '--public']);
  assert.equal(request.folder, '../my-site');
  assert.equal(request.name, 'my-site');
  assert.equal(request.project, 'my-site');
  assert.equal(request.url, 'https://my-site.example.com');
  assert.equal(request.publicSite, true);
  assert.deepEqual(request.exclude, ['a/', 'b/']);
});
