/**
 * scripts/lib/exitCodes.mjs: the exit codes of the shared scripts and the error they throw, so a
 * shell (or you, after `echo $status` in fish) can tell why a run stopped.
 *
 *   0  ok
 *   1  something unexpected: a bug or a disk error, the message says what
 *   2  usage: an unknown option, or an option npm kept for itself (lib/npmArgs.mjs)
 *   3  shared:status: at least one check failed, each failed line gives its fix. shared:pull: the pull
 *      landed, and the site lacks a package it now needs: the line to run is printed. test:shared:
 *      node was green and a suite or a test file is wrong, each FAIL line says which. Node's own exit
 *      code stands when a test failed. shared:compare: red, a page did not load. shared:bump: red at
 *      the step it names: the two files stay changed, and it prints the undo. shared:join --check: a
 *      line reads FAIL, and a join would refuse. shared:new: red at the step it names, and the folder stays
 *   4  refused: the script stopped before changing anything
 *   5  git: a git command failed, the message gives its real exit code
 *   6  shared:pull stopped at a conflict: the merge is open, and the message gives both ways out
 *   7  shared:push published, and the rejoin did not finish: run it again on a clean tree
 *   8  shared:compare: both builds loaded and they differ. Not red: read the list it printed.
 *      shared:bump: the same, and it has committed
 *
 * shared:all leaves with the code of whatever stopped it, so each number means the same there: 3 at a red, 4
 * when a site or the pin refused and nothing moved, 6 at a conflict, 8 at a list to read. A signal leaves with
 * its usual code.
 *
 * HOW TO CHANGE IT
 *   Change or add a number here. The scripts import EXIT and never spell a code themselves. A signal a
 *   long run stops on, and the code it leaves with: STOP_SIGNALS. Which stops count as a red: isRedStop.
 */

export const EXIT = Object.freeze({
  OK: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  CHECKS: 3,
  REFUSED: 4,
  GIT: 5,
  CONFLICT: 6,
  NOT_REJOINED: 7,
  TO_READ: 8,
});

/** The signals a long run stops on, each with its usual exit code: 128 and the signal's number. */
export const STOP_SIGNALS = Object.freeze({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 });

/** True for a stop that is a red: a step went red (3), or a signal stopped one. These leave a red record. */
export function isRedStop(code) {
  return code === EXIT.CHECKS || Object.values(STOP_SIGNALS).includes(code);
}

/** An error with a message for the reader and the exit code to leave with. */
export class ScriptError extends Error {
  constructor(message, code = EXIT.UNEXPECTED) {
    super(message);
    this.name = 'ScriptError';
    this.code = code;
  }
}

/**
 * Runs a script's main function and sets the exit code from what it returns (a number, or nothing
 * for 0). A ScriptError prints its message alone. Anything else is a bug, so it prints the stack.
 */
export async function runScript(main) {
  try {
    const code = await main();
    process.exitCode = code ?? EXIT.OK;
  } catch (error) {
    const known = error instanceof ScriptError;
    console.error(known ? error.message : error);
    process.exitCode = known ? error.code : EXIT.UNEXPECTED;
  }
}
