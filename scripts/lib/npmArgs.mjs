/**
 * scripts/lib/npmArgs.mjs: catches the one npm trap that matters here. An option typed WITHOUT `--`
 * in front never reaches the script: npm keeps it and leaves only a trace in the environment.
 *
 *     npm run shared:status --offline      argv [], npm_config_offline=true (the option is gone)
 *     npm run shared:status -- --offline   argv ['--offline'] (the right way)
 *
 * Each script lists its options. Before it does anything it calls refuseNpmKeptOptions, which stops
 * with a message showing the command with `--` in the right place. npm sets the same variable for a
 * setting in an npmrc (yes=true) or in the environment (npm_config_yes), so the message names that
 * cause too, with the way round it: the script run with node, which npm cannot touch.
 *
 * HOW TO CHANGE IT
 *   A new option in a script goes in that script's own list, the `flags` passed in here. npm turns
 *   `--some-flag` into npm_config_some_flag, and `--no-some-flag` into the same variable with the
 *   value '': npmConfigName does that mapping.
 */

import path from 'node:path';
import { EXIT, ScriptError } from './exitCodes.mjs';

/** '--dry-run' and '--no-dry-run' both become 'npm_config_dry_run'. */
export function npmConfigName(flag) {
  const bare = flag.replace(/^--(no-)?/, '');
  return `npm_config_${bare.replaceAll('-', '_')}`;
}

/** The flags npm kept for itself in this run. Empty when npm did not start the script. */
export function npmKeptOptions(env, flags) {
  if (!env.npm_lifecycle_event) return [];
  return flags.filter((flag) => env[npmConfigName(flag)] !== undefined);
}

/** The script as `node <path>`, from the folder npm ran it in. */
function directLine(scriptFile, cwd) {
  return `node ${path.relative(cwd, scriptFile)}`;
}

/**
 * Throws a usage ScriptError when npm kept any of `flags`. `script` is e.g. 'shared:status'. `scriptFile`
 * and `cwd` say how to run the script without npm: they default to this run's own.
 */
export function refuseNpmKeptOptions({ env = process.env, flags, script, example, scriptFile = process.argv[1], cwd = process.cwd() }) {
  const kept = npmKeptOptions(env, flags);
  if (kept.length === 0) return;
  const pronoun = kept.length === 1 ? 'it' : 'them';
  const settings = kept.map((flag) => npmConfigName(flag)).join(', ');
  throw new ScriptError(
    `npm kept ${kept.join(', ')} for itself, so \`npm run ${script}\` never saw ${pronoun}. Nothing was done. ` +
      `Put options after \`--\`, for example: ${example}\n` +
      `If they were after \`--\` already, an npmrc or the environment sets ${settings}: take that setting out, ` +
      `or run the script without npm: ${directLine(scriptFile, cwd)}`,
    EXIT.USAGE,
  );
}
