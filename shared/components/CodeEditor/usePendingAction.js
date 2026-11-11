/**
 * usePendingAction.js — one action (Run or Check) kept until the editor can do it. The static
 * view on a phone cannot run a TypeScript editor's code itself: TypeScript is compiled in the
 * browser by Monaco's worker, so a Run or Check there first mounts Monaco ("Tap to edit" without
 * the tap: touchMode.js > staticRunPolicy), and this hook remembers which button was pressed
 * until the editor has a model, then presses it once.
 *
 *     const pending = usePendingAction();
 *     pending.request(PENDING_ACTIONS.run);          // the click: remembered (the last request wins)
 *     pending.takeWhen(ready, (name) => { … });      // every render: runs the remembered action ONCE, when `ready`
 *     pending.pending                                 // 'run' | 'check' | null, so a button can show its "loading" reason meanwhile
 *     pending.cancel();                               // forget it: Monaco could not load (touchMode.js > viewAfterLoad)
 *
 *   takeWhen(ready, run) is itself a hook call (it registers an effect keyed on [ready, pending]),
 *   so it is called on EVERY render of the component, always in the same place, like any hook.
 *   The effect runs `run(name)` when `ready` is true and an action is remembered, and forgets the
 *   action first, so a re-render never runs it again; while `ready` is false nothing happens; an
 *   unmount simply drops it (effects do not run after an unmount). `run` is read fresh on each
 *   call (a ref), so the shell's closures over its surface are never stale. A name outside
 *   PENDING_ACTIONS is ignored.
 *
 * HOW TO CHANGE IT  Another action that may wait for the editor: PENDING_ACTIONS. Tests:
 *   __tests__/usePendingAction.test.js (through the folder's reactHookShim.js).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** The actions that may wait for the editor. */
export const PENDING_ACTIONS = Object.freeze({ run: 'run', check: 'check' });

/** Is this a name of PENDING_ACTIONS? */
export function isPendingAction(name) {
	return Object.values(PENDING_ACTIONS).includes(name);
}

/** See the header. */
export function usePendingAction() {
	const [pending, setPending] = useState(null);
	const runRef = useRef(null);

	const request = useCallback((name) => {
		if (!isPendingAction(name)) return;
		setPending(name);
	}, []);

	/** Forget the remembered action, if any: it will never run (the editor it waited for could not load). */
	const cancel = useCallback(() => setPending(null), []);

	/** A hook call: registers the effect that runs the remembered action once `ready` (see the header). */
	function takeWhen(ready, run) {
		runRef.current = run;
		useEffect(() => {
			if (!ready || pending === null) return;
			setPending(null);
			runRef.current(pending);
		}, [ready, pending]);
	}

	return { pending, request, cancel, takeWhen };
}
