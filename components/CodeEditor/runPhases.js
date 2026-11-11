/**
 * runPhases.js — the phases of a run (and of an exercise's Check), in a file of their own: no
 * React and no '@site/' import, so the pure modules that need them (runErrors.js) run under
 * `node --test`. useCodeRun.js re-exports RUN_PHASES; its header says what each phase means.
 *
 * HOW TO CHANGE IT  A new phase: here, then useCodeRun.js (which sets it) and OutputPanel.jsx /
 * ExercisePanel.jsx (which show it).
 */

/** The phases (useCodeRun.js's header describes each). */
export const RUN_PHASES = Object.freeze({
	idle: 'idle',
	running: 'running',
	done: 'done',
	failed: 'failed',
	stopped: 'stopped',
});
