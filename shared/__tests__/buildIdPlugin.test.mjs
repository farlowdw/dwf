/**
 * buildIdPlugin.test.mjs: wiring/index.cjs hands a site the build id plugin's entry. A site's config
 * writes `buildIdPlugin()` in its `plugins` list, and Docusaurus reads a relative name from the config
 * file, so the name must lead to the plugin once shared/ is mounted at PREFIX, and it must stay
 * relative: an absolute path of this machine would land in a site's main chunk. The row of the library
 * that reads the id asks a site's config for the same call, so the two are compared here.
 *
 * HOW TO CHANGE IT
 *   A moved plugin: BUILD_ID_PLUGIN in wiring/index.cjs, and PLUGIN_FOLDER here. A renamed helper: the
 *   needsConfig text of the pageReload row in requirements.cjs, and HELPER_CALL here.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { PREFIX } from '../scripts/lib/settings.mjs';
import { SHARED_ROOT } from './sharedTree.mjs';

const require = createRequire(import.meta.url);
const { buildIdPlugin } = require('../wiring/index.cjs');
const { ENTRIES } = require('../requirements.cjs');

/** The plugin's folder, from shared/. */
const PLUGIN_FOLDER = 'plugins/build-id';

/** What a site's config holds where it names the plugin: the helper takes no options. */
const HELPER_CALL = 'buildIdPlugin()';

/** The row of the plugin, and the row of the library that reads what it writes. */
const PLUGIN_ROW = 'build-id';
const LIBRARY_ROW = 'pageReload';

const rowNamed = (name) => ENTRIES.find((row) => row.name === name);

test('the build id plugin is a plain name, relative to a site with shared/ mounted', () => {
  assert.equal(buildIdPlugin(), `./${PREFIX}/${PLUGIN_FOLDER}`);
});

test('the build id plugin\'s name leads to the plugin', () => {
  const inside = buildIdPlugin().slice(`./${PREFIX}/`.length);
  assert.equal(fs.existsSync(path.join(SHARED_ROOT, inside, 'index.js')), true);
});

test('the plugin\'s row and the reload library\'s row look for the helper\'s call, and the library asks for the plugin', () => {
  assert.equal(rowNamed(PLUGIN_ROW)?.configText, HELPER_CALL);
  assert.deepEqual(rowNamed(LIBRARY_ROW)?.needsConfig?.map((line) => line.text), [HELPER_CALL]);
  assert.equal(`${buildIdPlugin.name}()`, HELPER_CALL, 'the helper is still named as the rows say');
  assert.equal(buildIdPlugin.length, 0, 'and still takes no options, so the call is always written the same way');
});
