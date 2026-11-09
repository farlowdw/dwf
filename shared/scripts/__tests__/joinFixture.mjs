/**
 * scripts/__tests__/joinFixture.mjs: what the tests of `shared:join` read from the shared folder itself: its
 * root, and the package.json block its README prints. The repositories come from fixture.mjs.
 *
 * HOW TO CHANGE IT
 *   JSON_BLOCK is how the README prints that block. A new reader of the real tree goes here.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** This folder's grandparent: a clone of the hub, or shared/ in a site. */
export const SHARED_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const JSON_BLOCK = /```json\n([\s\S]*?)```/;

/** The package.json the README prints. */
export const README_PACKAGE = JSON.parse(fs.readFileSync(path.join(SHARED_ROOT, 'README.md'), 'utf8').match(JSON_BLOCK)[1]);
