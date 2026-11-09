/**
 * scripts/lib/stubs.mjs: reads a site's stub, the small file that points a site's own import path at
 * a shared piece:
 *
 *     export { default } from '@site/shared/components/LC';            a plain re-export
 *     export * from '@site/shared/components/CodeEditor/unsavedWork.js';   one with no default
 *     import SharedBibRef from '@site/shared/components/BibRef';       a wrapper that adds site data
 *
 * A file there that names no path under shared/ is a local copy, not a stub. A comment, on its own line
 * or after the re-export, leaves a stub plain.
 *
 * HOW TO CHANGE IT
 *   SHARED_TARGET says what counts as pointing at shared/, PLAIN_REEXPORT what counts as plain.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PREFIX } from './settings.mjs';

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^\s*\/\/.*$/gm;

/** A quoted path with shared/ as one of its folders: '@site/shared/x' or '../../shared/x'. */
const SHARED_TARGET = new RegExp(`['"]((?:[^'"]*/)?${PREFIX}/[^'"]+)['"]`);

/** The one statement of a plain stub. A // comment may follow it: the path sits in quotes, so it ends first. */
const PLAIN_REEXPORT = /^export\s*(?:\{\s*default\s*\}|\*)\s*from\s*['"][^'"]+['"]\s*;?\s*(?:\/\/.*)?$/;

/** The code without its comments. */
function stripComments(text) {
  return text.replace(BLOCK_COMMENT, '').replace(LINE_COMMENT, '').trim();
}

/** { path, exists, target, plain }: target is the shared path it names, or null. */
export function readStub(root, stubPath) {
  let text;
  try {
    text = fs.readFileSync(path.join(root, stubPath), 'utf8');
  } catch {
    return { path: stubPath, exists: false, target: null, plain: false };
  }
  const code = stripComments(text);
  const target = code.match(SHARED_TARGET)?.[1] ?? null;
  return { path: stubPath, exists: true, target, plain: PLAIN_REEXPORT.test(code) };
}
