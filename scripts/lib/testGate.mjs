/**
 * scripts/lib/testGate.mjs: runs test:shared for shared:push. Red tests stop a push, and the one way
 * past is the push's own --skip-tests. A test run that could not start counts as red.
 *
 * It starts the test script beside this folder, not the site's npm line, so a site that lacks the
 * line is still gated.
 *
 * HOW TO CHANGE IT
 *   TEST_SCRIPT is the file it runs. TEST_SCRIPT_ENV lets a fixture hand in a stand-in, so that the
 *   scripts' own suites never start the real tests from inside a fixture site.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS_FOLDER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEST_SCRIPT = 'test.mjs';

/** Set this variable to run another script in place of test:shared. Fixtures use it. */
export const TEST_SCRIPT_ENV = 'DOCUSAURUS_SHARED_TEST_SCRIPT';

/** Runs the tests in the site with their output on the terminal: { green, why }. */
export function runSharedTests(root, env = process.env) {
  const script = env[TEST_SCRIPT_ENV] || path.join(SCRIPTS_FOLDER, TEST_SCRIPT);
  if (!fs.existsSync(script)) return { green: false, why: `${script} does not exist` };
  const { status } = spawnSync(process.execPath, [script], { cwd: root, env, stdio: 'inherit' });
  return { green: status === 0, why: `it stopped with exit code ${status}` };
}
