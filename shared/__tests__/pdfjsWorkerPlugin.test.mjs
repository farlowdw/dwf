/**
 * pdfjsWorkerPlugin.test.mjs: wiring/index.cjs hands a site the PDF viewer's worker plugin entry. A site's
 * config writes `pdfjsWorkerPlugin()` in its `plugins` list, and Docusaurus reads a relative name from the
 * config file, so the name must lead to the plugin once shared/ is mounted at PREFIX, and it must stay
 * relative: an absolute path of this machine would land in a site's main chunk, which a public site publishes.
 *
 * HOW TO CHANGE IT
 *   A moved plugin: PDFJS_WORKER_PLUGIN in wiring/index.cjs, and PLUGIN_FOLDER here.
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
const { pdfjsWorkerPlugin } = require('../wiring/index.cjs');

/** The plugin's folder, from shared/. */
const PLUGIN_FOLDER = 'plugins/pdfjs-worker';

test('the worker plugin is the plain name, relative to a site with shared/ mounted', () => {
  assert.equal(pdfjsWorkerPlugin(), `./${PREFIX}/${PLUGIN_FOLDER}`);
});

test('the worker plugin\'s name leads to the plugin and its package.json', () => {
  const inside = pdfjsWorkerPlugin().slice(`./${PREFIX}/`.length);
  assert.equal(fs.existsSync(path.join(SHARED_ROOT, inside, 'index.js')), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(SHARED_ROOT, inside, 'package.json'), 'utf8')).main, 'index.js');
});
