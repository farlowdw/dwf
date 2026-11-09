/**
 * scripts/lib/joinNetlify.mjs: whether Netlify builds a linked site on every push. It reads the project
 * through the Netlify CLI when the CLI can. That answer also holds the project's variables, so it stays in
 * memory: one word comes out of it, never a value.
 *
 * It runs the CLI from the system's temp folder with the project named, so nothing lands in the site, and
 * `--offline` skips it. A CLI that is missing, signed out or slow reads as "could not read", which is only
 * a line of the report.
 *
 * HOW TO CHANGE IT
 *   The command and its timeout: lib/joinSettings.mjs. What counts as building on push: buildsOnPush.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NETLIFY_STATE_FILE, NETLIFY_TIMEOUT_MS, netlifyCommand } from './joinSettings.mjs';

const MAX_ANSWER_BYTES = 16 * 1024 * 1024;

export const ON_PUSH = Object.freeze({
  UNLINKED: 'unlinked',
  SKIPPED: 'skipped',
  UNKNOWN: 'unknown',
  BUILDS: 'builds',
  STOPPED: 'stopped',
});

/** The Netlify project a folder is linked to, or null. */
export function linkedProject(root) {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(root, NETLIFY_STATE_FILE), 'utf8'));
    return state.siteId ?? null;
  } catch {
    return null;
  }
}

/** The CLI's answer for a project, parsed, or null. */
function askNetlify(project, env) {
  const args = ['api', 'getSite', '--data', JSON.stringify({ site_id: project })];
  const { status, stdout } = spawnSync(netlifyCommand(env), args, {
    cwd: os.tmpdir(),
    env,
    encoding: 'utf8',
    timeout: NETLIFY_TIMEOUT_MS,
    maxBuffer: MAX_ANSWER_BYTES,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (status !== 0) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/** True when pushes to a repository start a build: it has a repository, and builds are not stopped. */
function buildsOnPush({ build_settings: settings }) {
  return Boolean(settings?.repo_url) && settings.stop_builds !== true;
}

/** One word of ON_PUSH for this folder. */
export function readOnPush(root, { env = process.env, offline = false } = {}) {
  const project = linkedProject(root);
  if (project === null) return ON_PUSH.UNLINKED;
  if (offline) return ON_PUSH.SKIPPED;
  const answer = askNetlify(project, env);
  if (answer === null) return ON_PUSH.UNKNOWN;
  return buildsOnPush(answer) ? ON_PUSH.BUILDS : ON_PUSH.STOPPED;
}
