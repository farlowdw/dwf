/**
 * scripts/lib/allArgs.mjs: the words of `npm run shared:all`: which action, which sites, which options. It
 * also writes the ready lines a run prints, so a line that holds a site back or carries on repeats what
 * was typed.
 *
 * HOW TO CHANGE IT
 *   A new option: a row in SWITCHES or VALUE_FLAGS, its name in ACTION_OPTIONS for each action that takes
 *   it, and a line in USAGE. A script a run must never start: SERVER_SCRIPTS and SERVER_LINE.
 */

import { VERIFY_TIMEOUT_SECONDS } from './bumpSettings.mjs';
import { portsInRange } from './compareServers.mjs';
import { COMPARE_SIDES, LOCK_WAIT_SECONDS } from './compareSettings.mjs';
import { EXIT, ScriptError } from './exitCodes.mjs';
import { NO_WORD_LIST_FLAG } from './preflight.mjs';
import { readVersionWord } from './range.mjs';

export const SCRIPT = 'shared:all';

export const ACTIONS = Object.freeze({ STATUS: 'status', PULL: 'pull', BUMP: 'bump', RUN: 'run' });

const HELP_FLAG = '--help';
const ONLY_FLAG = '--only';
const SKIP_FLAG = '--skip';
const YES_FLAG = '--yes';
const NO_PIN_FLAG = '--no-pin';
const OFFLINE_FLAG = '--offline';
const KEEP_FLAG = '--keep';
const TIMEOUT_FLAG = '--verify-timeout';
const PORTS_FLAG = '--ports';
const LOCK_WAIT_FLAG = '--lock-wait';

/** Each flag and the name it goes by in the parsed options. */
const LIST_FLAGS = Object.freeze({ [ONLY_FLAG]: 'only', [SKIP_FLAG]: 'skip' });
const VALUE_FLAGS = Object.freeze({
  [KEEP_FLAG]: 'keep', [TIMEOUT_FLAG]: 'verifyTimeout', [PORTS_FLAG]: 'ports', [LOCK_WAIT_FLAG]: 'lockWait',
});
const SWITCHES = Object.freeze({
  [YES_FLAG]: 'yes',
  [NO_PIN_FLAG]: 'noPin',
  [OFFLINE_FLAG]: 'offline',
  [NO_WORD_LIST_FLAG]: 'noWordList',
});

/** Every option, for the check that npm kept none of them. */
export const FLAGS = Object.freeze([
  ...Object.keys(LIST_FLAGS), ...Object.keys(VALUE_FLAGS), ...Object.keys(SWITCHES), HELP_FLAG,
]);

/** The options each action takes, beyond --only and --skip. Any other would do nothing, so it stops. */
const ACTION_OPTIONS = Object.freeze({
  [ACTIONS.STATUS]: [OFFLINE_FLAG],
  [ACTIONS.PULL]: [KEEP_FLAG, TIMEOUT_FLAG, PORTS_FLAG, LOCK_WAIT_FLAG, NO_WORD_LIST_FLAG],
  [ACTIONS.BUMP]: [KEEP_FLAG, TIMEOUT_FLAG, PORTS_FLAG, LOCK_WAIT_FLAG, NO_WORD_LIST_FLAG, YES_FLAG, NO_PIN_FLAG],
  [ACTIONS.RUN]: [KEEP_FLAG],
});

export const USAGE = [
  `Usage: npm run ${SCRIPT} -- <action> [options]`,
  '  status                      one line per site, then the next command. Changes nothing',
  '  pull                        each site: pull, build, shared:verify, compare',
  '  bump [<version>]            each site: pull, then shared:bump to the pin. A version moves the pin first',
  '  run <script>                this npm script in each site',
  `  ${ONLY_FLAG} a,b                  these sites, in this order`,
  `  ${SKIP_FLAG} a,b                  leave these sites out`,
  `  ${KEEP_FLAG} <folder>             where old builds, logs and compares go, outside every site.`,
  '                              Default: a new temp folder',
  `  ${TIMEOUT_FLAG} <seconds>  how long a site's suites may run. Default: ${VERIFY_TIMEOUT_SECONDS}`,
  `  ${PORTS_FLAG} <from>-<to>         pull, bump: the compare serves on these ports. Default: free ports`,
  `  ${LOCK_WAIT_FLAG} <seconds>       pull, bump: how long the compare waits for the sweep lock. Default: ${LOCK_WAIT_SECONDS}`,
  `  ${NO_PIN_FLAG}                    bump: leave the pin alone, for a rehearsal`,
  `  ${YES_FLAG}                       bump: publish the pin without asking`,
  `  ${OFFLINE_FLAG}                   status: no fetch and no npm`,
  `  ${NO_WORD_LIST_FLAG}              pull, bump: go on without the word list: only secret shapes are scanned`,
  `  ${HELP_FLAG}                      this list`,
].join('\n');

/** Scripts that serve until stopped. A run waits for each script to end, and these never do. */
const SERVER_SCRIPTS = new Set(['start', 'serve']);

/** The same, read from a script's own line. */
export const SERVER_LINE = /\b(?:docusaurus\s+(?:start|serve)|netlify\s+(?:dev|serve))\b/;

const WHOLE_NUMBER = /^[1-9]\d*$/;
const SECONDS = /^\d+$/;
const NAME_SEPARATOR = ',';

/** A usage error, with the list of options. */
function usageError(sentence) {
  return new ScriptError(`${sentence}\n${USAGE}`, EXIT.USAGE);
}

/** Takes the value of `flag` off the list, or a usage error. */
function valueOf(flag, rest) {
  const value = rest.shift();
  if (value === undefined || value.startsWith('--')) throw usageError(`${flag} needs a value.`);
  return value;
}

/** "a,b" as ['a', 'b']. */
function namesIn(flag, value) {
  const names = value.split(NAME_SEPARATOR).filter(Boolean);
  if (names.length === 0) throw usageError(`${flag} needs at least one site.`);
  return names;
}

/** The action, then what that action takes. */
function readPositional(args, word) {
  if (args.action === undefined) {
    if (!Object.values(ACTIONS).includes(word)) throw usageError(`Unknown action ${word}.`);
    args.action = word;
  } else if (args.action === ACTIONS.BUMP && args.version === undefined) {
    args.version = readVersionWord(word, usageError);
  } else if (args.action === ACTIONS.RUN && args.script === undefined) {
    args.script = word;
  } else {
    throw usageError(`Unexpected word ${word}.`);
  }
  args.words.push(args.version === undefined ? word : args.version);
}

/** Reads one word off the list into `args`. */
function readWord(args, rest) {
  const word = rest.shift();
  if (word === HELP_FLAG) {
    args.help = true;
  } else if (SWITCHES[word] !== undefined) {
    args[SWITCHES[word]] = true;
    args.options.push(word);
    args.words.push(word);
  } else if (VALUE_FLAGS[word] !== undefined) {
    const value = valueOf(word, rest);
    args[VALUE_FLAGS[word]] = value;
    args.options.push(word);
    args.words.push(word, value);
  } else if (LIST_FLAGS[word] !== undefined) {
    args[LIST_FLAGS[word]].push(...namesIn(word, valueOf(word, rest)));
  } else if (word.startsWith('-')) {
    throw usageError(`Unknown option ${word}.`);
  } else {
    readPositional(args, word);
  }
}

/** What the words must add up to, once they are all read. */
function refuseBadShape(args) {
  if (args.action === undefined) throw usageError('Name an action.');
  if (args.action === ACTIONS.RUN && args.script === undefined) throw usageError('Name the script to run.');
  if (SERVER_SCRIPTS.has(args.script)) throw usageError(`${args.script} serves until stopped, and a run waits for each script to end.`);
  const allowed = ACTION_OPTIONS[args.action];
  const stray = args.options.find((option) => !allowed.includes(option));
  if (stray !== undefined) throw usageError(`${args.action} does not take ${stray}.`);
  if (args.verifyTimeout !== undefined && !WHOLE_NUMBER.test(args.verifyTimeout)) {
    throw usageError(`${TIMEOUT_FLAG} wants seconds, and reads ${args.verifyTimeout}.`);
  }
  if (args.ports !== undefined) portsInRange(args.ports, COMPARE_SIDES);
  if (args.lockWait !== undefined && !SECONDS.test(args.lockWait)) {
    throw usageError(`${LOCK_WAIT_FLAG} wants seconds, and reads ${args.lockWait}.`);
  }
}

/**
 * The options as { action, version, script, only, skip, keep, verifyTimeout, ports, lockWait, yes, noPin, offline,
 * noWordList, help, words }, or a usage error. `words` is what was typed, apart from --only and --skip.
 */
export function parseArgs(argv) {
  const args = { only: [], skip: [], options: [], words: [] };
  const rest = [...argv];
  while (rest.length > 0) readWord(args, rest);
  if (!args.help) refuseBadShape(args);
  return args;
}

/** The words of a line for these sites. */
function scopeWords({ only = [], skip = [] }) {
  return [
    ...(only.length > 0 ? [ONLY_FLAG, only.join(NAME_SEPARATOR)] : []),
    ...(skip.length > 0 ? [SKIP_FLAG, skip.join(NAME_SEPARATOR)] : []),
  ];
}

/** A line with these words, for these sites. */
function commandLine(words, scope) {
  return `npm run ${SCRIPT} -- ${[...words, ...scopeWords(scope)].join(' ')}`;
}

/** The line that runs what was typed again, for the sites in `scope`: { only } or { skip }. */
export function rerunLine(args, scope) {
  return commandLine(args.words, scope);
}

/** The line for another action, over the sites this run was told to cover. */
export function actionLine(action, { only, skip }) {
  return commandLine([action], { only, skip });
}

/** The sites of a run without `names`, in the form that was typed. */
export function scopeWithout(args, siteNames, names) {
  if (args.only.length > 0) return { only: siteNames.filter((name) => !names.includes(name)) };
  return { skip: [...args.skip, ...names] };
}
