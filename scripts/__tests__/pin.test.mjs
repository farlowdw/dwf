/**
 * scripts/__tests__/pin.test.mjs: the version pin. Each test writes a fake manifest, lock or Node file
 * into a real fixture site and reads the line `shared:status` prints, so every line fires here at
 * least once, and each trap of the real locks has a test that it stays quiet. A stand-in for npm
 * answers the question about the newest Docusaurus, so no test needs a network. The last tests read
 * this repository's own template. The checks live in lib/checks.mjs and the reading in lib/pin.mjs.
 *
 * HOW TO CHANGE IT
 *   A new pin line gets a test that makes it fire, named after the label it prints (pin:, carets:,
 *   lock:, node:, ranges:, newest:, template:), and a new trap of a real lock a test that it stays
 *   quiet. REAL_ENTRY_COUNT follows the template's @docusaurus entries.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXIT } from '../lib/exitCodes.mjs';
import {
  DOCUSAURUS_SCOPE, askNewest, docusaurusEntries, isNewer, lockedVersions, looseEntries, nodeProblems,
  pinDrift, rangeRows, readPin,
} from '../lib/pin.mjs';
import { NODE_PIN, PIN, assertLine, fixtureFor, writeFiles } from './fixture.mjs';

/** The hub's root, which holds the real template. */
const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** How many @docusaurus entries each site carries, and the template with them. */
const REAL_ENTRY_COUNT = 9;

const OLDER = '3.9.2';
const NEWER = '3.11.0';

/** The JSON text of a manifest. */
const manifestText = (manifest) => `${JSON.stringify({ name: 'fake', ...manifest }, null, 2)}\n`;

/** The JSON text of a lock holding `entries`, a map from a lock key to a version or an entry. */
function lockText(entries) {
  const asEntry = (value) => (typeof value === 'string' ? { version: value } : value);
  const packages = Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, asEntry(value)]));
  return `${JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'fake' }, ...packages } }, null, 2)}\n`;
}

/** A lock with one top-level @docusaurus/core at `version`, plus `more`. */
const coreLock = (version, more = {}) => lockText({
  'node_modules/@docusaurus/core': version,
  'node_modules/react': '19.2.3',
  'node_modules/sass': '1.97.2',
  ...more,
});

/** A fixture site with these fake files laid over its seed, uncommitted. */
function fakeSite(t, files) {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  writeFiles(site, files);
  return { fixture, site };
}

/** A folder holding only these files, for the functions that read one. Removed with the test. */
function makeNodeFolder(t, files) {
  const folder = fs.mkdtempSync(path.join(fixtureFor(t).base, 'node-'));
  writeFiles(folder, files);
  return folder;
}

/** The offline report of a site with these fake files. */
function reportFor(t, files) {
  const { fixture, site } = fakeSite(t, files);
  return fixture.status(site, '--offline');
}

test('a site on the pin: every pin line passes and ranges only reports', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'ok', 'pin', new RegExp(`1 package on the pin, Docusaurus ${PIN}`));
  assertLine(report, 'ok', 'carets', /no caret on 1 package/);
  assertLine(report, 'ok', 'lock', new RegExp(`one @docusaurus version in the lock, ${PIN}`));
  assertLine(report, 'ok', 'node', new RegExp(`Node ${NODE_PIN} in \\.nvmrc and netlify\\.toml`));
  assertLine(report, 'info', 'ranges', /react 19\.2\.3, @mui\/material absent/);
  assertLine(report, 'ok', 'newest', /npm has nothing newer than the pin, Docusaurus 3\.10\.2/);
});

test('pin: an older exact entry and lock fail, and the fix is the bump', (t) => {
  const report = reportFor(t, {
    'package.json': manifestText({ dependencies: { '@docusaurus/core': OLDER } }),
    'package-lock.json': coreLock(OLDER),
  });
  assert.equal(report.status, EXIT.CHECKS, report.output);
  const line = assertLine(report, 'FAIL', 'pin', /1 package off the pin, Docusaurus 3\.10\.2 .*fix: npm run shared:bump/);
  assert.ok(line.endsWith('(fix: npm run shared:bump)'), 'no pin moved here, so there is no way back to name');
  assert.match(report.stdout, /@docusaurus\/core: package\.json 3\.9\.2, lock 3\.9\.2/);
});

/** The fixture template's package.json with every @docusaurus entry on `version`. */
function templateOn(site, version) {
  const text = fs.readFileSync(path.join(site, 'shared', 'template', 'package.json'), 'utf8');
  return text.replaceAll(`"${PIN}"`, `"${version}"`);
}

test('pin: a site the pin moved away from hears the bump, and the line that puts the pin back if that went red here', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/template/package.json': templateOn(site, NEWER) }, `Move the Docusaurus pin to ${NEWER}`);
  const line = assertLine(fixture.status(site, '--offline'), 'FAIL', 'pin', /1 package off the pin, Docusaurus 3\.11\.0 /);
  const both = `(fix: npm run shared:bump, or if Docusaurus ${NEWER} went red here, put the pin back: npm run shared:all -- bump ${PIN} --yes)`;
  assert.ok(line.endsWith(both), line);
});

test('pin: the way back is the pin before the last move, past a commit that moves no version', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.commitToSite(site, { 'shared/template/package.json': templateOn(site, NEWER) }, `Move the Docusaurus pin to ${NEWER}`);
  const moved = templateOn(site, NEWER);
  const widened = moved.replace('"^9.4.0"', '"^9.5.0"');
  assert.notEqual(widened, moved);
  fixture.commitToSite(site, { 'shared/template/package.json': widened }, 'Widen a range in the template');
  const line = assertLine(fixture.status(site, '--offline'), 'FAIL', 'pin', /off the pin/);
  assert.ok(line.endsWith(`put the pin back: npm run shared:all -- bump ${PIN} --yes)`), line);
});

test('pin: a site that stood on no earlier pin hears the bump alone', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  writeFiles(site, {
    'package.json': manifestText({ dependencies: { '@docusaurus/core': OLDER } }),
    'package-lock.json': coreLock(OLDER),
  });
  fixture.commitToSite(site, { 'shared/template/package.json': templateOn(site, NEWER) }, `Move the Docusaurus pin to ${NEWER}`);
  const line = assertLine(fixture.status(site, '--offline'), 'FAIL', 'pin', /off the pin, Docusaurus 3\.11\.0 /);
  assert.ok(line.endsWith('(fix: npm run shared:bump)'), line);
});

test('pin: a lock that lags an exact package.json fails, and so does one that leads it', (t) => {
  const behind = reportFor(t, { 'package-lock.json': coreLock(OLDER) });
  assert.equal(behind.status, EXIT.CHECKS, behind.output);
  assertLine(behind, 'FAIL', 'pin', /1 package off the pin/);
  const ahead = reportFor(t, { 'package.json': manifestText({ dependencies: { '@docusaurus/core': OLDER } }) });
  assertLine(ahead, 'FAIL', 'pin', /1 package off the pin/);
});

test('pin: an entry the lock lacks fails', (t) => {
  const report = reportFor(t, {
    'package.json': manifestText({ dependencies: { '@docusaurus/core': PIN, '@docusaurus/types': PIN } }),
  });
  assertLine(report, 'FAIL', 'pin', /1 package off the pin/);
  assert.match(report.stdout, /@docusaurus\/types: package\.json 3\.10\.2, lock nothing/);
});

test('pin: a dev dependency counts like any other', (t) => {
  const report = reportFor(t, {
    'package.json': manifestText({ devDependencies: { '@docusaurus/core': OLDER } }),
    'package-lock.json': coreLock(OLDER),
  });
  assertLine(report, 'FAIL', 'pin', /1 package off the pin/);
});

test('pin: a site with no @docusaurus entry fails, and without a lock package.json decides', (t) => {
  const none = reportFor(t, { 'package.json': manifestText({ dependencies: { react: '^19.0.0' } }) });
  assertLine(none, 'FAIL', 'pin', /package\.json lists no @docusaurus package/);

  const { fixture, site } = fakeSite(t, {});
  fs.rmSync(path.join(site, 'package-lock.json'));
  const onPin = fixture.status(site, '--offline');
  assertLine(onPin, 'ok', 'pin', /1 package on the pin/);
  assertLine(onPin, 'warn', 'lock', /no package-lock\.json/);
  writeFiles(site, { 'package.json': manifestText({ dependencies: { '@docusaurus/core': OLDER } }) });
  assertLine(fixture.status(site, '--offline'), 'FAIL', 'pin', /1 package off the pin/);
});

test('carets: a caret fails with the exact line while the pin line still passes', (t) => {
  const report = reportFor(t, {
    'package.json': manifestText({ dependencies: { '@docusaurus/core': `^${PIN}` } }),
  });
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assertLine(report, 'ok', 'pin', /1 package on the pin/);
  const line = `npm install --save-exact @docusaurus/core@${PIN}`;
  assert.ok(assertLine(report, 'FAIL', 'carets', /1 entry without an exact version/).includes(line));
  assert.match(report.stdout, /@docusaurus\/core \^3\.10\.2/);
});

test('carets: every form that is not one exact version counts', (t) => {
  for (const spec of [`~${PIN}`, '>=3.0.0', '3.x', 'latest', '*']) {
    const report = reportFor(t, { 'package.json': manifestText({ dependencies: { '@docusaurus/core': spec } }) });
    assertLine(report, 'FAIL', 'carets', /1 entry without an exact version/);
  }
});

test('the pin covers @docusaurus only: carets elsewhere and in overrides stay quiet', (t) => {
  const report = reportFor(t, {
    'package.json': manifestText({
      dependencies: { '@docusaurus/core': PIN, react: '^19.0.0', '@mui/material': '^6.3.1', sass: '~1.97.0' },
      overrides: { 'docusaurus-plugin-image-zoom': { '@docusaurus/theme-classic': '^3.0.1' } },
    }),
  });
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'ok', 'carets', /no caret on 1 package/);
});

test('lock: a nested second version fails and names it', (t) => {
  const report = reportFor(t, {
    'package-lock.json': coreLock(PIN, {
      'node_modules/@docusaurus/utils': PIN,
      'node_modules/some-plugin/node_modules/@docusaurus/utils': OLDER,
    }),
  });
  assert.equal(report.status, EXIT.CHECKS, report.output);
  assertLine(report, 'FAIL', 'lock', /2 @docusaurus versions in the lock .*fix: npm run shared:bump/);
  assert.match(report.stdout, /3\.9\.2: 1 package, @docusaurus\/utils/);
  assert.match(report.stdout, /3\.10\.2: 2 packages, @docusaurus\/core, @docusaurus\/utils/);
});

test('lock: a transitive package on another version fires though every direct entry is on the pin', (t) => {
  const report = reportFor(t, { 'package-lock.json': coreLock(PIN, { 'node_modules/@docusaurus/utils': OLDER }) });
  assertLine(report, 'ok', 'pin', /on the pin/);
  assertLine(report, 'FAIL', 'lock', /2 @docusaurus versions/);
});

test('lock: the three traps of the real locks stay quiet', (t) => {
  const report = reportFor(t, {
    'package-lock.json': coreLock(PIN, {
      'node_modules/@docusaurus/types': PIN,
      'node_modules/@docusaurus/types/node_modules/webpack-merge': '5.10.0',
      'node_modules/react-loadable': { version: '6.0.0', name: '@docusaurus/react-loadable' },
      'node_modules/@docusaurus/responsive-loader': '1.7.1',
      'node_modules/@docusaurus/react-loadable': '6.0.0',
    }),
  });
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'ok', 'lock', new RegExp(`one @docusaurus version in the lock, ${PIN}`));
});

test('lock: no @docusaurus package in a lock warns', (t) => {
  const report = reportFor(t, { 'package-lock.json': lockText({ 'node_modules/react': '19.2.3', 'node_modules/sass': '1.97.2' }) });
  assertLine(report, 'warn', 'lock', /no @docusaurus package in the lock/);
});

test('node: each place fires alone and the exit code stays 0', (t) => {
  const cases = [
    [{ '.nvmrc': '20\n' }, /\.nvmrc says 20/],
    [{ 'netlify.toml': '[build.environment]\n  NODE_VERSION = "20"\n' }, /netlify\.toml says NODE_VERSION 20/],
    [{ 'netlify.toml': '[build]\n  publish = "build"\n' }, /netlify\.toml sets no NODE_VERSION/],
    [{ 'netlify.toml': '[build.environment]\n  # NODE_VERSION = "22"\n' }, /netlify\.toml sets no NODE_VERSION/],
  ];
  for (const [files, detail] of cases) {
    const report = reportFor(t, files);
    assert.equal(report.status, EXIT.OK, report.output);
    assertLine(report, 'warn', 'node', /1 place not on Node 22/);
    assert.match(report.stdout, detail);
  }
});

test('node: a missing .nvmrc and a missing netlify.toml fire, a second NODE_VERSION is read too', (t) => {
  const { fixture, site } = fakeSite(t, {});
  fs.rmSync(path.join(site, '.nvmrc'));
  fs.rmSync(path.join(site, 'netlify.toml'));
  const report = fixture.status(site, '--offline');
  assertLine(report, 'warn', 'node', /2 places not on Node 22/);
  assert.match(report.stdout, /\.nvmrc is missing/);
  assert.match(report.stdout, /no netlify\.toml/);

  const twice = '[build.environment]\n  NODE_VERSION = "22"\n[context.deploy-preview.environment]\n  NODE_VERSION = "24"\n';
  assert.deepEqual(nodeProblems(makeNodeFolder(t, { '.nvmrc': '22\n', 'netlify.toml': twice }), '22'), [
    'netlify.toml says NODE_VERSION 24',
  ]);
});

test('node: closer forms of the pin pass, and a different major with the same start does not', (t) => {
  const folder = (nvmrc, netlify) => makeNodeFolder(t, { '.nvmrc': nvmrc, 'netlify.toml': netlify });
  assert.deepEqual(nodeProblems(folder('22.18.0\n', 'NODE_VERSION = "22.18.0"\n'), '22'), []);
  assert.deepEqual(nodeProblems(folder('v22\n', "NODE_VERSION = '22'\n"), '22'), []);
  assert.deepEqual(nodeProblems(folder('22\n', 'NODE_VERSION = 22\n'), '22'), []);
  assert.deepEqual(nodeProblems(folder('220\n', 'NODE_VERSION = "22"\n'), '22'), ['.nvmrc says 220']);
});

test('node: a value is printed, and nothing else of netlify.toml', (t) => {
  const secretLine = `${['Basic', 'Auth'].join('-')} = "someone:not-for-printing"`;
  const report = reportFor(t, {
    'netlify.toml': `[headers.values]\n  ${secretLine}\n[build.environment]\n  NODE_VERSION = "20"\n`,
  });
  assertLine(report, 'warn', 'node', /1 place not on Node 22/);
  assert.doesNotMatch(report.output, /not-for-printing/);
});

test('ranges: React and MUI outside the template are reported and never red', (t) => {
  const fixture = fixtureFor(t);
  const template = { dependencies: { '@docusaurus/core': PIN, react: '^20.0.0', '@mui/material': '^9.4.0' } };
  fixture.commitToHub({ 'template/package.json': manifestText(template) }, 'Move the ranges');
  const site = fixture.addSite('one');
  writeFiles(site, {
    'package.json': manifestText({ dependencies: { '@docusaurus/core': PIN, react: '^19.0.0', '@mui/material': '^6.3.1' } }),
    'package-lock.json': coreLock(PIN, { 'node_modules/@mui/material': '6.5.0' }),
  });
  const report = fixture.status(site, '--offline');
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'info', 'ranges', /react 19\.2\.3, @mui\/material 6\.5\.0/);
  assert.match(report.stdout, /react 19\.2\.3 is outside the template's \^20\.0\.0/);
  assert.match(report.stdout, /@mui\/material 6\.5\.0 is outside the template's \^9\.4\.0/);
});

test('ranges: an information line is left out of the summary', (t) => {
  const report = reportFor(t, {});
  const lines = report.stdout.trim().split('\n');
  const passed = lines.filter((line) => line.startsWith('ok ')).length;
  assert.equal(lines.at(-1), `${passed} ok, 0 warnings, 0 failed`);
});

test('ranges: without a lock it prints package.json and judges nothing', (t) => {
  const rows = rangeRows({ react: '^19.0.0', '@mui/material': '^9.4.0' }, { react: '^18.0.0' }, null);
  assert.deepEqual(rows, [
    { name: 'react', range: '^19.0.0', found: '^18.0.0', outside: false },
    { name: '@mui/material', range: '^9.4.0', found: null, outside: false },
  ]);
});

test('newest: a newer version is information with the exact next command, exit 0', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.answerFromNpm(NEWER);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'info', 'newest', /Docusaurus 3\.11\.0 is on npm, the pin is 3\.10\.2 .*fix: npm run shared:all -- bump 3\.11\.0\)/);
});

test('newest: --offline never starts npm', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  const report = fixture.status(site, '--offline');
  assertLine(report, 'ok', 'newest', /skipped \(--offline\)/);
  assert.equal(fixture.npmCallCount(), 0);
  fixture.status(site);
  assert.equal(fixture.npmCallCount(), 1);
});

test('newest: npm failing or answering nonsense is one quiet line', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.answerFromNpm('npm notice: nothing useful');
  assertLine(fixture.status(site), 'info', 'newest', /could not ask npm/);
  fixture.answerFromNpm(null);
  const report = fixture.status(site);
  assert.equal(report.status, EXIT.OK, report.output);
  assertLine(report, 'info', 'newest', /could not ask npm/);
});

test('newest: a pin ahead of npm is fine, and a missing or hung npm reads as no answer', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fixture.answerFromNpm(OLDER);
  assertLine(fixture.status(site), 'ok', 'newest', /npm has nothing newer than the pin, Docusaurus 3\.10\.2/);
  const noNpm = { ...fixture.env, DOCUSAURUS_SHARED_NPM: path.join(fixture.base, 'no-such-command') };
  assert.equal(askNewest({ root: site, env: noNpm }), null);
  const slow = path.join(fixture.base, 'slow-npm');
  fs.writeFileSync(slow, `#!/bin/sh\nsleep 2 > /dev/null 2>&1\necho ${NEWER}\n`, { mode: 0o755 });
  assert.equal(askNewest({ root: site, env: { ...fixture.env, DOCUSAURUS_SHARED_NPM: slow }, timeoutMs: 100 }), null);
});

test('isNewer orders versions by number, not by text', () => {
  assert.equal(isNewer('3.10.2', '3.9.2'), true);
  assert.equal(isNewer('3.9.2', '3.10.2'), false);
  assert.equal(isNewer('3.10.2', '3.10.2'), false);
  assert.equal(isNewer('4.0.0', '3.10.2'), true);
});

test('template: a caret, two versions, no entry or a missing file each fail the pin line', (t) => {
  const fixture = fixtureFor(t);
  fixture.commitToHub({ 'template/package.json': manifestText({ dependencies: { '@docusaurus/core': `^${PIN}` } }) }, 'Loosen the pin');
  const loose = fixture.status(fixture.addSite('loose'), '--offline');
  assert.equal(loose.status, EXIT.CHECKS, loose.output);
  assertLine(loose, 'FAIL', 'pin', /shared\/template gives no sound pin/);
  assert.match(loose.stdout, /@docusaurus\/core is \^3\.10\.2, not one exact version/);

  const two = { dependencies: { '@docusaurus/core': PIN }, devDependencies: { '@docusaurus/types': OLDER } };
  fixture.commitToHub({ 'template/package.json': manifestText(two) }, 'Split the pin');
  const split = fixture.status(fixture.addSite('split'), '--offline');
  assert.match(split.stdout, /it holds 2 versions: 3\.10\.2, 3\.9\.2/);

  fixture.commitToHub({ 'template/package.json': manifestText({ dependencies: { react: '^19.0.0' } }) }, 'Empty the pin');
  const empty = fixture.status(fixture.addSite('empty'), '--offline');
  assert.match(empty.stdout, /it lists no @docusaurus package/);

  fixture.commitToHub({ 'template/package.json': 'not json\n' }, 'Break the pin');
  const broken = fixture.status(fixture.addSite('broken'), '--offline');
  assert.match(broken.stdout, /package\.json is missing or not JSON/);
  assertLine(broken, 'info', 'ranges', /the template lists no React or MUI range/);
});

test('template: a missing .nvmrc fails the pin line, and the node line waits for it', (t) => {
  const fixture = fixtureFor(t);
  const site = fixture.addSite('one');
  fs.rmSync(path.join(site, 'shared/template/.nvmrc'));
  const report = fixture.status(site, '--offline');
  assertLine(report, 'FAIL', 'pin', /gives no sound pin/);
  assert.match(report.stdout, /\.nvmrc is missing or empty/);
  assertLine(report, 'warn', 'node', /no Node version to compare/);
});

test('a separately versioned package is outside the pin', () => {
  const entries = docusaurusEntries({
    '@docusaurus/core': PIN,
    '@docusaurus/react-loadable': '6.0.0',
    '@docusaurus/responsive-loader': '1.7.1',
    react: '^19.0.0',
  });
  assert.deepEqual(entries.map(({ name }) => name), ['@docusaurus/core']);
});

test('pinDrift, looseEntries and lockedVersions on their own', (t) => {
  const entries = [{ name: '@docusaurus/core', spec: `^${PIN}` }, { name: '@docusaurus/types', spec: `v${PIN}` }];
  assert.deepEqual(looseEntries(entries).map(({ name }) => name), ['@docusaurus/core']);
  const versionOf = (name) => (name === '@docusaurus/core' ? PIN : OLDER);
  assert.deepEqual(pinDrift(entries, PIN, versionOf), [{ name: '@docusaurus/types', spec: `v${PIN}`, locked: OLDER }]);
  assert.deepEqual(pinDrift(entries, PIN, null), []);
  const { fixture, site } = fakeSite(t, {});
  assert.deepEqual([...lockedVersions(site).keys()], [PIN]);
  assert.equal(lockedVersions(fixture.base), null);
});

test('the real template: nine exact @docusaurus entries, one version, a Node pin, and React and MUI as ranges', (t) => {
  const pin = readPin(mountedHub(t));
  assert.deepEqual(pin.problems, []);
  assert.equal(pin.node, '22');
  assert.match(pin.version, /^\d+\.\d+\.\d+$/);
  const template = JSON.parse(fs.readFileSync(path.join(HUB_ROOT, 'template/package.json'), 'utf8'));
  const manifest = { ...template.dependencies, ...template.devDependencies };
  assert.equal(docusaurusEntries(manifest).length, REAL_ENTRY_COUNT);
  assert.equal(Object.keys(manifest).filter((name) => name.startsWith(DOCUSAURUS_SCOPE)).length, REAL_ENTRY_COUNT);
  for (const name of ['react', 'react-dom', '@mui/material', '@mui/icons-material']) {
    assert.match(pin.ranges[name], /^\^/, `${name} stays a range`);
  }
});

/** readPin looks below `<root>/shared`, which the hub is not, so a folder links this repository there. */
function mountedHub(t) {
  const folder = makeNodeFolder(t, {});
  fs.symlinkSync(HUB_ROOT, path.join(folder, 'shared'));
  return folder;
}
