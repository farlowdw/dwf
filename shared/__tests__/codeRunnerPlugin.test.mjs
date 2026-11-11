/**
 * codeRunnerPlugin.test.mjs: wiring/index.cjs hands a site the code editor's plugin entry. A site's
 * config writes `codeRunnerPlugin()` in its `plugins` list, and Docusaurus reads a relative name from
 * the config file, so the name must lead to the plugin once shared/ is mounted at PREFIX, and it must
 * stay relative: an absolute path of this machine would land in a site's main chunk.
 *
 * HOW TO CHANGE IT
 *   A moved plugin: CODE_RUNNER_PLUGIN in wiring/index.cjs, and PLUGIN_FOLDER here. A new option goes
 *   to the plugin as it is, so it needs nothing here.
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
const { codeRunnerPlugin } = require('../wiring/index.cjs');

/** The plugin's folder, from shared/. */
const PLUGIN_FOLDER = 'plugins/monaco-editor';

test('with no options it is the plain name, relative to a site with shared/ mounted', () => {
  assert.equal(codeRunnerPlugin(), `./${PREFIX}/${PLUGIN_FOLDER}`);
});

test('the name leads to the plugin', () => {
  const inside = codeRunnerPlugin().slice(`./${PREFIX}/`.length);
  assert.equal(fs.existsSync(path.join(SHARED_ROOT, inside, 'index.js')), true);
});

test('options travel with the name, as Docusaurus reads a plugin with options', () => {
  const options = { executeUrl: '/run', runtimesUrl: '/list' };
  assert.deepEqual(codeRunnerPlugin(options), [codeRunnerPlugin(), options]);
});
