/**
 * scripts/__tests__/stubs.test.mjs: the stub reader, on the shapes a site really has. A new stub
 * shape gets a row here.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { readStub } from '../lib/stubs.mjs';
import { fixtureFor, writeFiles } from './fixture.mjs';

test('reads each shape of stub', (t) => {
  const { base } = fixtureFor(t);
  const root = path.join(base, 'tree');
  writeFiles(root, {
    'plain.jsx': "// A stub.\nexport { default } from '@site/shared/components/LC';\n",
    'header.js': "/**\n * A stub with a long header.\n */\n\nexport { default } from '@site/shared/theme/Admonition/Types';\n",
    'wrapper.jsx': "import React from 'react';\nimport SharedBibRef from '@site/shared/components/BibRef';\nimport items from './bibliography.js';\n\nexport default function BibRef(props) {\n  return <SharedBibRef bibItems={items} {...props} />;\n}\n",
    'function.mjs': "export { default } from '../../shared/functions/code-runner/execute.mjs';\n",
    'named.js': "export * from '@site/shared/components/Registry/flags.js';\n",
    'copy.jsx': "// Not from '@site/shared/components/LC' at all.\nexport default function LC() {\n  return null;\n}\n",
    'unshared.jsx': "export { default } from '@site/src/components/shareditems/Thing';\n",
    'trailing.jsx': "export { default } from '@site/shared/components/DropDownIC'; // the shared piece\n",
    'trailing-named.js': "export * from '@site/shared/components/Registry/flags.js' // no semicolon\n",
    'two.jsx': "export { default } from '@site/shared/components/LC'; export const more = 1;\n",
  });
  const read = (name) => readStub(root, name);
  assert.deepEqual(read('plain.jsx'), { path: 'plain.jsx', exists: true, target: '@site/shared/components/LC', plain: true });
  assert.equal(read('header.js').plain, true);
  assert.equal(read('wrapper.jsx').target, '@site/shared/components/BibRef');
  assert.equal(read('wrapper.jsx').plain, false);
  assert.equal(read('function.mjs').target, '../../shared/functions/code-runner/execute.mjs');
  assert.deepEqual(read('named.js'), { path: 'named.js', exists: true, target: '@site/shared/components/Registry/flags.js', plain: true });
  assert.equal(read('copy.jsx').target, null);
  assert.equal(read('unshared.jsx').target, null);
  assert.deepEqual(read('missing.jsx'), { path: 'missing.jsx', exists: false, target: null, plain: false });
  assert.deepEqual(read('trailing.jsx'), { path: 'trailing.jsx', exists: true, target: '@site/shared/components/DropDownIC', plain: true });
  assert.equal(read('trailing-named.js').plain, true, 'a trailing comment with no semicolon');
  assert.equal(read('two.jsx').plain, false, 'more code after the re-export is no plain stub');
});
