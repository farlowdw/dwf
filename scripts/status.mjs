#!/usr/bin/env node
/**
 * scripts/status.mjs: `npm run shared:status`. It says where this site's shared/ stands against the
 * hub and whether anything is wrong: one line per check, with the command that fixes it. It also
 * holds the site to the version pin in shared/template (lib/pin.mjs) and says when npm has a newer
 * Docusaurus. It changes nothing, apart from fetching the hub and refreshing git's index, so run it
 * whenever you like.
 *
 *     npm run shared:status
 *     npm run shared:status -- --offline     no fetch and no npm: the hub as last fetched, no network
 *
 * It exits 0 with warnings (behind, ahead, a changed file) and information lines, and 3 when a check
 * failed.
 *
 * HOW TO CHANGE IT
 *   The checks and the shape of a printed line live in lib/checks.mjs. A new option goes in FLAGS.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot } from './lib/checkout.mjs';
import { LEVELS, formatResult, makeContext, runChecks } from './lib/checks.mjs';
import { EXIT, ScriptError, runScript } from './lib/exitCodes.mjs';
import { refuseNpmKeptOptions } from './lib/npmArgs.mjs';
import { counted } from './lib/phrases.mjs';
import { PREFIX } from './lib/settings.mjs';

const OFFLINE_FLAG = '--offline';
const HELP_FLAG = '--help';
const FLAGS = [OFFLINE_FLAG, HELP_FLAG];
const USAGE = 'Usage: npm run shared:status [-- --offline]';

/** The options, or a usage error for anything else. */
export function parseArgs(argv) {
  const unknown = argv.filter((option) => !FLAGS.includes(option));
  if (unknown.length > 0) throw new ScriptError(`Unknown option ${unknown[0]}. ${USAGE}`, EXIT.USAGE);
  return { offline: argv.includes(OFFLINE_FLAG), help: argv.includes(HELP_FLAG) };
}

/** The last line of the report. */
export function summary(results) {
  const count = (level) => results.filter((result) => result.level === level).length;
  return `${count(LEVELS.OK)} ok, ${counted(count(LEVELS.WARN), 'warning')}, ${count(LEVELS.FAIL)} failed`;
}

/** Runs the checks, prints the report and returns the exit code. */
export function runStatus({ root, env = process.env, offline = false, print = console.log }) {
  const results = runChecks(makeContext({ root, env, offline }));
  results.flatMap(formatResult).forEach((line) => print(line));
  print(summary(results));
  const failed = results.some((result) => result.level === LEVELS.FAIL);
  return failed ? EXIT.CHECKS : EXIT.OK;
}

/** The script's entry point. */
function main() {
  refuseNpmKeptOptions({ flags: [OFFLINE_FLAG], script: 'shared:status', example: 'npm run shared:status -- --offline' });
  const { offline, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(USAGE);
    return EXIT.OK;
  }
  const root = findRoot();
  if (!fs.existsSync(path.join(root, PREFIX))) {
    throw new ScriptError(`${root} has no ${PREFIX}/ folder. Run this from a site.`, EXIT.USAGE);
  }
  return runStatus({ root, offline });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runScript(main);
}
