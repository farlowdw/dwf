/**
 * scripts/__tests__/pinRange.test.mjs: a Docusaurus version against requirements.cjs's @docusaurus ranges
 * (lib/pinRange.mjs). Which ranges count, which version is the newest inside them, and the three endings of a
 * refusal: the newest npm has inside, none inside, and npm out of reach. A small folder in the temp directory
 * holds the table, and a stand-in npm prints what a test hands it, so nothing here needs the network.
 * shared:all and shared:bump each have a test of their own that the refusal comes before anything changes.
 *
 * HOW TO CHANGE IT
 *   A new ending of the refusal: a case in the last tests, and a line in NPM_STAND_IN when npm must answer
 *   another way. From the hub: node --test scripts/__tests__/pinRange.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EXIT } from '../lib/exitCodes.mjs';
import { docusaurusRanges, newestInside, rangesMissed, refuseOutsideRanges } from '../lib/pinRange.mjs';
import { NPM_COMMAND_ENV } from '../lib/settings.mjs';

const SCRIPT = 'shared:test';

/** Prints the variable's text for `npm view @docusaurus/core versions`, or fails when it is unset. */
const NPM_STAND_IN = `#!/bin/sh
if [ -z "$NPM_ANSWER" ]; then exit 1; fi
printf '%s\\n' "$NPM_ANSWER"
`;

const TABLE = `module.exports = {
  RANGES: {
    '@docusaurus/core': '^3.10.2',
    '@docusaurus/theme-common': '^3.10.2',
    '@docusaurus/types': '^3.9.0',
    '@docusaurus/responsive-loader': '^1.7.0',
    react: '^19.0.0',
  },
  ENTRIES: [],
};
`;

/** A folder with shared/requirements.cjs holding `table`, or no table at all, and the stand-in npm. */
function siteWith(t, table) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-range-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'shared'));
  if (table !== null) fs.writeFileSync(path.join(root, 'shared', 'requirements.cjs'), table);
  const npm = path.join(root, 'npm');
  fs.writeFileSync(npm, NPM_STAND_IN, { mode: 0o755 });
  return { root, env: (answer) => ({ ...process.env, [NPM_COMMAND_ENV]: npm, NPM_ANSWER: answer ?? '' }) };
}

/** The refusal's text, or null when the version passed. */
function refusalOf(run) {
  try {
    run();
    return null;
  } catch (error) {
    assert.equal(error.code, EXIT.REFUSED);
    return error.message;
  }
}

const TABLE_ROWS = { RANGES: { '@docusaurus/core': '^3.10.2', '@docusaurus/react-loadable': '6.0.0', react: '^19.0.0' } };

test('the ranges are those of the packages one version moves, by name', () => {
  assert.deepEqual(docusaurusRanges(TABLE_ROWS), [{ name: '@docusaurus/core', range: '^3.10.2' }]);
});

test('a version misses a range as npm reads it, and the newest inside every range is never a prerelease', () => {
  const rows = [{ name: '@docusaurus/core', range: '^3.10.2' }, { name: '@docusaurus/types', range: '^3.9.0' }];
  assert.deepEqual(rangesMissed(rows, '3.10.1').map(({ name }) => name), ['@docusaurus/core']);
  assert.deepEqual(rangesMissed(rows, '3.11.0'), []);
  assert.deepEqual(rangesMissed(rows, '3.12.0-canary.1').map(({ name }) => name), ['@docusaurus/core', '@docusaurus/types']);
  assert.equal(newestInside(['3.9.2', '3.11.0', '3.10.2', '3.12.0-canary.1', '4.0.0'], rows), '3.11.0');
  assert.equal(newestInside(['3.9.2', '4.0.0'], rows), null);
});

test('a refusal names each range missed, grouped by range, and the newest version npm has inside them all', (t) => {
  const { root, env } = siteWith(t, TABLE);
  const answer = JSON.stringify(['3.9.2', '3.10.2', '3.11.0', '4.0.0']);
  const stays = 'The pin stays at 3.10.2.';
  const text = refusalOf(() => refuseOutsideRanges({ root, env: env(answer), version: '3.8.0', script: SCRIPT, stays, fix: 'pick one' }));
  const reason = 'shared:test refused: Docusaurus 3.8.0 is outside what shared/requirements.cjs asks: ^3.10.2 of '
    + '@docusaurus/core and @docusaurus/theme-common and ^3.9.0 of @docusaurus/types, so shared:verify would fail on it. '
    + 'The newest version npm has inside ^3.10.2 and ^3.9.0 is 3.11.0. The pin stays at 3.10.2.';
  assert.equal(text, `${reason}\nFix: pick one\nNothing was changed.`);
});

test('a version inside every range passes', (t) => {
  const { root, env } = siteWith(t, TABLE);
  assert.equal(refusalOf(() => refuseOutsideRanges({ root, env: env(undefined), version: '3.10.2', script: SCRIPT })), null);
});

test('npm with no version inside, or out of reach, says so', (t) => {
  const { root, env } = siteWith(t, TABLE);
  const none = refusalOf(() => refuseOutsideRanges({ root, env: env('"3.9.2"'), version: '3.9.2', script: SCRIPT }));
  assert.match(none, /npm has no version inside \^3\.10\.2 and \^3\.9\.0\./);
  const unreachable = refusalOf(() => refuseOutsideRanges({ root, env: env(undefined), version: '3.9.2', script: SCRIPT }));
  assert.match(unreachable, /npm could not be asked for the versions inside \^3\.10\.2 and \^3\.9\.0\./);
});

test('no table, or a table with no @docusaurus range, rules nothing out', (t) => {
  const missing = siteWith(t, null);
  assert.equal(refusalOf(() => refuseOutsideRanges({ root: missing.root, env: missing.env(), version: '1.0.0', script: SCRIPT })), null);
  const plain = siteWith(t, "module.exports = { RANGES: { react: '^19.0.0' }, ENTRIES: [] };\n");
  assert.equal(refusalOf(() => refuseOutsideRanges({ root: plain.root, env: plain.env(), version: '1.0.0', script: SCRIPT })), null);
});

test('a table that does not load is refused with the way back', (t) => {
  const { root, env } = siteWith(t, 'module.exports = { RANGES: {\n');
  const text = refusalOf(() => refuseOutsideRanges({ root, env: env(), version: '3.10.2', script: SCRIPT }));
  assert.match(text, /^shared:test refused: shared\/requirements\.cjs does not load: SyntaxError/);
  assert.match(text, /Fix: if a pull just brought it/);
});
