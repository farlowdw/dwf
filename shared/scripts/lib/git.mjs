/**
 * scripts/lib/git.mjs: the one way the shared scripts start git. No shell, no pipes: a pipe hides
 * a rejected push behind the exit code of the last command in it. Every call hands back git's real
 * exit code, so scripts match codes and never git's wording, which changes between versions.
 *
 *   git(args, options)      runs and waits; { ok, status, stdout, stderr }, and never throws
 *   gitValue(args, options) the trimmed output, or null when git failed; for questions
 *   gitOrThrow(args, options) the trimmed output, or a ScriptError with git's exit code
 *   gitLive(args, options)  the same run with its output as it comes, for the slow subtree commands
 *   stripProgress(text)     drops git-subtree's redrawn counter from a text
 *
 * Options: `cwd`, `env`, `input` (text for stdin), `timeout` (ms, for a call that may wait on the
 * network; a call that runs out reads as `status: null`), `group: true` with a timeout, for a call
 * that starts ssh or another helper: at the limit everything git started stops too (lib/gitTimed.mjs),
 * `encoding: 'buffer'` for output that may be binary, and `read: true`, for a call that must leave the
 * repository alone: it sets GIT_OPTIONAL_LOCKS=0, so a status beside an editor takes no lock.
 *
 * HOW TO CHANGE IT
 *   PROGRESS_LINE is the counter's shape. MAX_OUTPUT_BYTES is the most one call may return.
 *   RUNNER_SPARE_MS is how long past its limit a timed call's runner may take to stop what git started.
 */

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { NOT_STARTED, TIMED_OUT } from './gitTimed.mjs';

/** The runner of a timed call that stops git's helpers with it. */
const TIMED_RUNNER = fileURLToPath(new URL('./gitTimed.mjs', import.meta.url));

/** The runner stops git's helpers within a grace of the limit, so this backstop never comes into play. */
const RUNNER_SPARE_MS = 15_000;

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

/** git-subtree's counter, "12/     340 (8) [0]", redrawn in place with a carriage return. */
const PROGRESS_LINE = /^\s*\d+\/\s*\d+\s+\(\d+\)\s+\[\d+\]\s*$/;

const ANY_LINE_BREAK = /\r\n|\r|\n/;

const TEXT = 'utf8';
const BYTES = 'buffer';

/** Spawn options shared by every call. */
function spawnOptions({ cwd, env = process.env, read = false, encoding = TEXT }) {
  return { cwd, env: read ? { ...env, GIT_OPTIONAL_LOCKS: '0' } : env, encoding };
}

/** True for a line worth showing: not blank, not the counter. */
function isOutputLine(line) {
  return line.trim() !== '' && !PROGRESS_LINE.test(line);
}

/** The text without git-subtree's counter and without blank lines. */
export function stripProgress(text) {
  return text.split(ANY_LINE_BREAK).filter(isOutputLine).join('\n');
}

/** What to start for a call: git itself, or the runner that stops git's helpers at the limit. */
function commandOf(args, { group = false, timeout }) {
  if (!group || timeout === undefined) return { command: 'git', commandArgs: args, limit: timeout };
  return { command: process.execPath, commandArgs: [TIMED_RUNNER, String(timeout), ...args], limit: timeout + RUNNER_SPARE_MS };
}

/** Runs git and waits. Never throws: a git that could not start, or ran out of time, reads as `status: null`. */
export function git(args, options = {}) {
  const { command, commandArgs, limit } = commandOf(args, options);
  const result = spawnSync(command, commandArgs, {
    ...spawnOptions(options),
    input: options.input,
    timeout: limit,
    maxBuffer: MAX_OUTPUT_BYTES,
  });
  const empty = options.encoding === BYTES ? Buffer.alloc(0) : '';
  const noAnswer = command !== 'git' && [TIMED_OUT, NOT_STARTED].includes(result.status);
  const status = noAnswer ? null : result.status;
  return {
    ok: status === 0,
    status,
    stdout: result.stdout ?? empty,
    stderr: stripProgress(String(result.stderr ?? '')),
  };
}

/** The trimmed output, or null when git failed. For calls where failure is an answer. */
export function gitValue(args, options = {}) {
  const result = git(args, options);
  return result.ok ? result.stdout.trim() : null;
}

/** The trimmed output, or a ScriptError naming the command and its real exit code. */
export function gitOrThrow(args, options = {}) {
  const result = git(args, options);
  if (result.ok) return result.stdout.trim();
  const reason = result.stderr ? `: ${result.stderr}` : '';
  throw new ScriptError(`git ${args[0]} stopped with exit code ${result.status}${reason}`, EXIT.GIT);
}

/** Calls onLine for each whole line a stream carries, as it arrives. Returns the two stream ends. */
function lineReader(onLine) {
  let buffer = '';
  const flushLine = (line) => {
    if (isOutputLine(line)) onLine(line);
  };
  const push = (chunk) => {
    buffer += chunk;
    const parts = buffer.split(ANY_LINE_BREAK);
    buffer = parts.pop();
    parts.forEach(flushLine);
  };
  const end = () => {
    flushLine(buffer);
    buffer = '';
  };
  return { push, end };
}

/**
 * Runs git and hands out its filtered output line by line. Resolves with { ok, status, lines, timedOut }: its real
 * exit code, or status null when it could not start or ran out of time. With `group: true` and `timeout` (ms), the
 * timed runner stops git and everything git started at the limit, as for git() (a push that waits on ssh for good).
 */
export function gitLive(args, options = {}) {
  const { onLine = (line) => console.log(line) } = options;
  const { command, commandArgs } = commandOf(args, options);
  const lines = [];
  const reader = lineReader((line) => {
    lines.push(line);
    onLine(line);
  });
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { ...spawnOptions(options), stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8').on('data', reader.push);
    child.stderr.setEncoding('utf8').on('data', reader.push);
    child.on('error', () => resolve({ ok: false, status: null, lines, timedOut: false }));
    child.on('close', (code) => {
      reader.end();
      const timedOut = command !== 'git' && code === TIMED_OUT;
      const status = command !== 'git' && [TIMED_OUT, NOT_STARTED].includes(code) ? null : code;
      resolve({ ok: status === 0, status, lines, timedOut });
    });
  });
}
