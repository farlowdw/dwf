/**
 * useCodeRun.js — one editor's runs: send the code, wait, keep the result.
 *
 *     const { phase, summary, response, error, run, stop, clear } = useCodeRun(executeUrl);
 *     // executeUrl: the site's run function (the monaco-editor plugin's option, through its
 *     //   global data: CodeEditorClient.jsx); undefined = the library's default, the site's own.
 *     //   BOTH runs take it: Run (CodeEditorClient.jsx) and an exercise's Check (useExercise.js)
 *     run(payload);   // payload: lib/codeRunner/request.js > buildExecuteRequest
 *     run(promise);   // or a promise of one: TypeScript is compiled in the browser first
 *
 * A PROMISED PAYLOAD  The phase is `running` from the moment run() is called, while the promise
 *   settles (TypeScript's first compile waits for Monaco's TypeScript worker) and while the code
 *   runner works. A promise that rejects is a failed run whose message is the rejection's (the
 *   TypeScript worker not ready, syntax errors that stop the run). Stop during the compile ends
 *   the wait AT ONCE, as it stops a waiting run (payloadUnlessStopped): the phase is `stopped`
 *   and the payload is never sent; the compile finishes in Monaco's worker and whatever it
 *   comes to (a payload, syntax errors) is dropped.
 *
 * `response` is Piston's answer as it came (null until one did): the error locations
 * (lib/codeRunner/errorLocations.js) read it, since the summary keeps only what is shown.
 * An editor makes one of these per kind of run: Run, and Check for an exercise — both with the
 * same `executeUrl`, so a sibling site's checks go where its runs go.
 *
 * PHASES (RUN_PHASES)
 *   idle      nothing run yet (or the output was cleared)
 *   running   compiling in the browser (TypeScript), or waiting for the code runner
 *   done      an answer came back: `summary` (lib/codeRunner/result.js > summarizeResult) —
 *             also when the program itself failed (a runtime error is an answer)
 *   failed    no answer: `error` is a RunError with a plain message for the reader (no function
 *             under `npm start`, a site password's session expired, Piston refused …;
 *             lib/codeRunner/errors.js)
 *   stopped   the reader pressed Stop: the wait ends, but the code runner may still finish the
 *             run on its side (there is no way to cancel it there). Once Stop is pressed the run
 *             ends `stopped`, whatever fails after it.
 * A new run while one is waiting replaces it (the old answer is dropped). Unmounting stops the
 * wait.
 *
 * HOW TO CHANGE IT
 *   What a run sends: CodeEditorClient.jsx (buildExecuteRequest; an exercise's Check:
 *   useExercise.js). How the answer is read: the library's result.js. How each phase is shown:
 *   OutputPanel.jsx (ExercisePanel.jsx for Check). The phases themselves: runPhases.js. The
 *   stopped notice: the library's client.js > MESSAGE_ABORTED.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MESSAGE_ABORTED, RunError, executeCode, summarizeResult } from './lib/codeRunner/index.js';
import { RUN_PHASES } from './runPhases.js';

/** The phases (see the header; they live in runPhases.js, which pure modules can import). */
export { RUN_PHASES };

/** The RunError kind of a stopped wait (lib/codeRunner/errors.js). */
const ABORTED_KIND = 'aborted';

/** The state with nothing run. */
const IDLE_STATE = Object.freeze({ phase: RUN_PHASES.idle, summary: null, response: null, error: null });

/** The state while waiting. */
const RUNNING_STATE = Object.freeze({ phase: RUN_PHASES.running, summary: null, response: null, error: null });

/** The error of a stopped wait: the library's own (client.js gives the same for a stopped fetch). */
export function abortedRunError() {
	return new RunError(MESSAGE_ABORTED, { kind: ABORTED_KIND });
}

/** The state after a failed (or stopped) wait. */
function failureState(error) {
	const phase = error?.kind === ABORTED_KIND ? RUN_PHASES.stopped : RUN_PHASES.failed;
	return { phase, summary: null, response: null, error };
}

/**
 * The payload (or a promise of one), or a rejection with abortedRunError() as soon as `signal`
 * aborts, whichever comes first (see the header: A PROMISED PAYLOAD). A payload that settles
 * after the abort is dropped; its rejection is handled (Promise.race listens to it), so it is
 * never an unhandled one.
 */
export function payloadUnlessStopped(payload, signal) {
	if (signal.aborted) return Promise.reject(abortedRunError());
	let onAbort = null;
	const stopped = new Promise((resolve, reject) => {
		onAbort = () => reject(abortedRunError());
		signal.addEventListener('abort', onAbort, { once: true });
	});
	return Promise.race([payload, stopped]).finally(() => signal.removeEventListener('abort', onAbort));
}

/** { phase, summary, response, error, run, stop, clear } — see the header. */
export function useCodeRun(url) {
	const [state, setState] = useState(IDLE_STATE);
	const controllerRef = useRef(null);
	const urlRef = useRef(url); // the function's URL never changes on a page; a ref keeps run() stable
	urlRef.current = url;

	const stop = useCallback(() => {
		controllerRef.current?.abort();
	}, []);

	const run = useCallback(async (payload) => {
		controllerRef.current?.abort();
		const controller = new AbortController();
		controllerRef.current = controller;
		setState(RUNNING_STATE);
		let next;
		try {
			// A promised payload (see the header): Stop ends this wait at once, as it ends the fetch's.
			const request = await payloadUnlessStopped(payload, controller.signal);
			const answer = await executeCode(request, { signal: controller.signal, url: urlRef.current });
			next = { phase: RUN_PHASES.done, summary: summarizeResult(answer), response: answer, error: null };
		} catch (error) {
			// Once Stop was pressed the run ends stopped, whatever failed after it.
			next = failureState(controller.signal.aborted ? abortedRunError() : error);
		}
		if (controllerRef.current !== controller) return; // a newer run (or a clear) took over
		controllerRef.current = null;
		setState(next);
	}, []);

	const clear = useCallback(() => {
		const controller = controllerRef.current;
		controllerRef.current = null;
		controller?.abort();
		setState(IDLE_STATE);
	}, []);

	useEffect(() => () => controllerRef.current?.abort(), []);

	return { ...state, run, stop, clear };
}
