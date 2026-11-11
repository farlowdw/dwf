/**
 * result.js — reading the code runner's answer: what happened (success, error, time limit …),
 * the text to show, and one short status line for the output panel. Pure functions; no React,
 * no DOM.
 *
 * PISTON'S ANSWER (/api/v2/execute, 200)
 *   { language, version, run: STAGE, compile?: STAGE }   compiled languages have `compile`;
 *   when compiling fails there may be no `run` at all.
 *   STAGE = { stdout, stderr, output (both, interleaved), code (exit code), signal ('SIGKILL'),
 *             status, message, memory (bytes), cpu_time, wall_time (ms) }
 *   status: null when all went well, else 'RE' runtime error (non-zero exit), 'SG' died on a
 *   signal, 'TO' timeout, 'OL' stdout too long, 'EL' stderr too long, 'XX' internal error.
 *
 * THE SUMMARY (summarizeResult)
 *   status       'success' | 'runtime-error' | 'compile-error' | 'timeout' | 'killed' |
 *                'output-limit' | 'internal-error'
 *   stage        'compile' when compiling failed (output, exit code and timings are then the
 *                compiler's), else 'run'
 *   output       the text to show: the compiler's output when compiling failed, else the run's
 *   compileOutput  the compiler's output in every case ('' without a compile stage: warnings
 *                of a successful compile live here)
 *   exitCode, signal, cpuMs, wallMs, memoryBytes, language, version, message (Piston's own
 *   words, e.g. "Time limit exceeded"; null when it has none)
 *
 * HOW TO CHANGE IT
 *   What a Piston status means: STATUS_BY_PISTON_CODE. The status line's wording:
 *   describeResult() and its helpers. Units: formatMs() / formatBytes().
 */

/** summarizeResult() statuses. */
export const RESULT_SUCCESS = 'success';
export const RESULT_RUNTIME_ERROR = 'runtime-error';
export const RESULT_COMPILE_ERROR = 'compile-error';
export const RESULT_TIMEOUT = 'timeout';
export const RESULT_KILLED = 'killed';
export const RESULT_OUTPUT_LIMIT = 'output-limit';
export const RESULT_INTERNAL_ERROR = 'internal-error';

/** Piston's stage status codes -> a summary status (RE, a plain non-zero exit, is decided by the stage). */
const STATUS_BY_PISTON_CODE = Object.freeze({
	TO: RESULT_TIMEOUT,
	SG: RESULT_KILLED,
	OL: RESULT_OUTPUT_LIMIT,
	EL: RESULT_OUTPUT_LIMIT,
	XX: RESULT_INTERNAL_ERROR,
});

/** Separator between the parts of the status line. */
const PART_SEPARATOR = ' · ';

/** Below this many ms a duration is shown in ms, from it on in seconds. */
const MS_PER_SECOND = 1000;

/** Byte units for formatBytes(), each 1024 times the one before. */
const BYTE_UNITS = Object.freeze(['B', 'KB', 'MB', 'GB', 'TB']);
const BYTES_PER_UNIT = 1024;

/** From this value on a number is shown without a decimal (12.3 KB, but 123 KB). */
const NO_DECIMAL_FROM = 100;

/** The stage when it is an object, else null. */
function stageOf(value) {
	return value && typeof value === 'object' ? value : null;
}

/** A finite number or null. */
function numberOrNull(value) {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A non-empty string or null. */
function textOrNull(value) {
	return typeof value === 'string' && value !== '' ? value : null;
}

/** Did this stage fail (a status, a signal, or a non-zero exit code)? */
function stageFailed(stage) {
	if (!stage) return false;
	if (textOrNull(stage.status) !== null) return true;
	if (textOrNull(stage.signal) !== null) return true;
	return numberOrNull(stage.code) !== null && stage.code !== 0;
}

/** The stage's text: `output`, else stdout + stderr. */
function stageOutput(stage) {
	if (!stage) return '';
	if (typeof stage.output === 'string') return stage.output;
	return `${stage.stdout ?? ''}${stage.stderr ?? ''}`;
}

/** The summary status of a stage that ran ('compile' or 'run'). */
function stageStatus(stage, stageName) {
	const code = textOrNull(stage.status);
	if (code !== null && Object.hasOwn(STATUS_BY_PISTON_CODE, code)) return STATUS_BY_PISTON_CODE[code];
	if (textOrNull(stage.signal) !== null) return RESULT_KILLED;
	if (!stageFailed(stage)) return RESULT_SUCCESS;
	return stageName === 'compile' ? RESULT_COMPILE_ERROR : RESULT_RUNTIME_ERROR;
}

/** The summary of one stage's numbers and words. */
function stageDetails(stage) {
	return {
		exitCode: numberOrNull(stage?.code),
		signal: textOrNull(stage?.signal),
		cpuMs: numberOrNull(stage?.cpu_time),
		wallMs: numberOrNull(stage?.wall_time),
		memoryBytes: numberOrNull(stage?.memory),
		message: textOrNull(stage?.message),
	};
}

/** The summary of an answer that cannot be read (no run, not an object). */
function unreadableSummary(response, message) {
	return {
		status: RESULT_INTERNAL_ERROR,
		stage: 'run',
		output: '',
		compileOutput: '',
		...stageDetails(null),
		language: textOrNull(response?.language),
		version: textOrNull(response?.version),
		message,
	};
}

/**
 * Piston's answer (the parsed JSON of a 200) as one summary (see the header). Never throws: an
 * answer without a run result is an 'internal-error'.
 */
export function summarizeResult(response) {
	if (!response || typeof response !== 'object') {
		return unreadableSummary(null, 'The code runner sent no result.');
	}
	const compile = stageOf(response.compile);
	const run = stageOf(response.run);
	const compileFailed = stageFailed(compile);
	if (!compileFailed && !run) {
		return unreadableSummary(response, textOrNull(response.message) ?? 'The code runner sent an answer without a run result.');
	}
	const stage = compileFailed ? compile : run;
	const stageName = compileFailed ? 'compile' : 'run';
	const details = stageDetails(stage);
	return {
		status: stageStatus(stage, stageName),
		stage: stageName,
		output: stageOutput(stage),
		compileOutput: stageOutput(compile),
		...details,
		language: textOrNull(response.language),
		version: textOrNull(response.version),
		message: details.message ?? textOrNull(response.message),
	};
}

/** "Exit code 0 · 52 ms CPU · 113 ms total · 13.7 MB" (the parts that are known). */
function exitLine(summary) {
	const parts = [];
	if (summary.exitCode !== null && summary.exitCode !== undefined) parts.push(`Exit code ${summary.exitCode}`);
	if (numberOrNull(summary.cpuMs) !== null) parts.push(`${formatMs(summary.cpuMs)} CPU`);
	if (numberOrNull(summary.wallMs) !== null) parts.push(`${formatMs(summary.wallMs)} total`);
	if (numberOrNull(summary.memoryBytes) !== null) parts.push(formatBytes(summary.memoryBytes));
	if (parts.length === 0) return summary.status === RESULT_SUCCESS ? 'Finished' : 'Finished with an error';
	return parts.join(PART_SEPARATOR);
}

/** "Time limit exceeded (3 s)", or "Compile time limit exceeded (10 s)" for the compile stage. */
function timeoutLine(summary, { runTimeout, compileTimeout }) {
	const isCompile = summary.stage === 'compile';
	const limit = numberOrNull(isCompile ? compileTimeout : runTimeout);
	const words = isCompile ? 'Compile time limit exceeded' : 'Time limit exceeded';
	return limit === null ? words : `${words} (${formatMs(limit)})`;
}

/** "Compile error (exit code 1)" / "Compile error (SIGKILL)" / "Compile error". */
function compileErrorLine(summary) {
	if (summary.exitCode !== null && summary.exitCode !== undefined) return `Compile error (exit code ${summary.exitCode})`;
	if (summary.signal) return `Compile error (${summary.signal})`;
	return 'Compile error';
}

/** "Killed (SIGKILL)" / "Killed"; "Compile killed (…)" for the compile stage. */
function killedLine(summary) {
	const words = summary.stage === 'compile' ? 'Compile killed' : 'Killed';
	return summary.signal ? `${words} (${summary.signal})` : words;
}

/** "Internal error on the code runner: <its message>". */
function internalErrorLine(summary) {
	const words = 'Internal error on the code runner';
	return summary.message ? `${words}: ${summary.message}` : words;
}

/**
 * One short line for the output panel's status, from a summarizeResult() summary:
 *   "Exit code 0 · 52 ms CPU · 113 ms total · 13.7 MB", "Time limit exceeded (3 s)",
 *   "Compile error (exit code 1)", "Killed (SIGKILL)", "Output too long", …
 *   runTimeout / compileTimeout   the limits the run had (ms), shown with a timeout.
 */
export function describeResult(summary, { runTimeout, compileTimeout } = {}) {
	if (!summary || typeof summary !== 'object') return '';
	switch (summary.status) {
		case RESULT_TIMEOUT:
			return timeoutLine(summary, { runTimeout, compileTimeout });
		case RESULT_COMPILE_ERROR:
			return compileErrorLine(summary);
		case RESULT_KILLED:
			return killedLine(summary);
		case RESULT_OUTPUT_LIMIT:
			return 'Output too long';
		case RESULT_INTERNAL_ERROR:
			return internalErrorLine(summary);
		default:
			return exitLine(summary);
	}
}

/** A number with one decimal below NO_DECIMAL_FROM, without a trailing ".0": 1.5, 3, 12.3, 123. */
function shortNumber(value) {
	if (value >= NO_DECIMAL_FROM) return String(Math.round(value));
	const rounded = Math.round(value * 10) / 10;
	return String(rounded);
}

/** A duration: "52 ms" below a second, else "1.5 s", "3 s", "12.3 s". '' for anything but a number >= 0. */
export function formatMs(ms) {
	if (numberOrNull(ms) === null || ms < 0) return '';
	const whole = Math.round(ms);
	if (whole < MS_PER_SECOND) return `${whole} ms`;
	return `${shortNumber(ms / MS_PER_SECOND)} s`;
}

/** A size: "512 B", "1.5 KB", "13.7 MB" (units of 1024). '' for anything but a number >= 0. */
export function formatBytes(bytes) {
	if (numberOrNull(bytes) === null || bytes < 0) return '';
	let value = bytes;
	let unit = 0;
	while (value >= BYTES_PER_UNIT && unit < BYTE_UNITS.length - 1) {
		value /= BYTES_PER_UNIT;
		unit += 1;
	}
	if (unit === 0) return `${Math.round(value)} B`;
	return `${shortNumber(value)} ${BYTE_UNITS[unit]}`;
}
