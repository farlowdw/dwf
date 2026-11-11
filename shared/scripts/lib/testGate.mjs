/**
 * scripts/lib/testGate.mjs: runs test:shared for shared:push. Red tests stop a push, and the one way
 * past is the push's own --skip-tests. A test run that could not start counts as red.
 *
 * It starts the test script beside this folder, not the site's npm line, so a site that lacks the
 * line is still gated.
 *
 * Nothing here waits for ever: test.mjs stops its own run (its RUN_LIMIT_SECONDS), and GATE_LIMIT_SECONDS stops
 * test.mjs itself, which reads as red.
 *
 * HOW TO CHANGE IT
 *   TEST_SCRIPT is the file it runs. TEST_SCRIPT_ENV lets a fixture hand in a stand-in, so that the
 *   scripts' own suites never start the real tests from inside a fixture site. GATE_LIMIT_SECONDS is the stop.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUN_LIMIT_SECONDS } from '../test.mjs';
import { MS_PER_SECOND } from './settings.mjs';

const SCRIPTS_FOLDER = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEST_SCRIPT = 'test.mjs';

/** Set this variable to run another script in place of test:shared. Fixtures use it. */
export const TEST_SCRIPT_ENV = 'DOCUSAURUS_SHARED_TEST_SCRIPT';

/**
 * The last stop for the tests a push runs: above test.mjs's own limit for its whole run, which stops node and its
 * files first. At this mark the test script itself is stopped, and it stops node on the way out.
 */
export const GATE_LIMIT_SECONDS = RUN_LIMIT_SECONDS + 600;

/** Runs the tests in the site with their output on the terminal: { green, why }. */
export function runSharedTests(root, env = process.env) {
  const script = env[TEST_SCRIPT_ENV] || path.join(SCRIPTS_FOLDER, TEST_SCRIPT);
  if (!fs.existsSync(script)) return { green: false, why: `${script} does not exist` };
  const options = { cwd: root, env, stdio: 'inherit', timeout: GATE_LIMIT_SECONDS * MS_PER_SECOND, killSignal: 'SIGTERM' };
  const { status, error } = spawnSync(process.execPath, [script], options);
  if (error?.code === 'ETIMEDOUT') return { green: false, why: `the tests ran out of time: still running after ${GATE_LIMIT_SECONDS} s, so they were stopped` };
  return { green: status === 0, why: `it stopped with exit code ${status}` };
}
