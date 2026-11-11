/**
 * reactHookShim.js — a stand-in for React's hooks, so a test can run one of the editor's hooks
 * (useCodeRun.js, useDrafts.js, useExercise.js, useFleetingText.js) in node, as plain function
 * calls, without a renderer or a DOM (not a test file itself). It is two things in one file:
 *   - a Node module hook (resolve): `import … from 'react'` becomes this file;
 *   - the hooks themselves (useState, useRef, useCallback, useMemo, useId, useEffect) for ONE
 *     component at a time, and renderHook() to drive it.
 *
 *     import { register } from 'node:module';
 *     register('./jsxHooks.js', import.meta.url);        // .jsx and CSS-module imports
 *     register('./reactHookShim.js', import.meta.url);   // 'react' → this file
 *     const { renderHook } = await import('./reactHookShim.js');
 *     const { useCodeRun } = await import('../useCodeRun.js');
 *     const hook = renderHook(useCodeRun);
 *     hook.current.run(payload);   // each read of `current` renders the hook again, with its state,
 *                                  //   then runs the effects whose dependencies changed
 *     hook.unmount();              // runs the effects' clean-ups
 *
 * EFFECTS  as React runs them: after the render, the first time and then whenever their
 * dependencies changed (Object.is, item by item; no list: after every render), the previous
 * run's clean-up first. So an effect keyed on a value a test changes (a language) runs again
 * on the next read of `current`, as it would in the page — what it sets shows on the read
 * after that.
 * WHAT IT DOES NOT DO  State updates do not re-render by themselves (read `current` again);
 * useCallback returns the function of the current render (the hooks' callbacks read refs and
 * setters, which stay the same here as in React); useMemo computes again on every render (its
 * dependencies are not compared); useId gives each call its own id for the component's life.
 *
 * HOW TO CHANGE IT  A hook under test that uses another React export: add it here, in the
 * same shape (one slot per call, in call order).
 */

/** Node module hook: 'react' is this file. */
export async function resolve(specifier, context, nextResolve) {
	if (specifier === 'react') return { url: import.meta.url, shortCircuit: true };
	return nextResolve(specifier, context);
}

/** The component being rendered ({ slots, pending, effectSlots }; null between renders), and its next slot's index. */
let active = null;
let slotIndex = 0;

/** The next slot of the component being rendered, made with `create()` on the first render. */
function nextSlot(create) {
	const index = slotIndex;
	slotIndex += 1;
	if (!(index in active.slots)) active.slots[index] = create();
	return active.slots[index];
}

/** The state lives in its slot: the next read of `current` sees what the setter put there. */
export function useState(initial) {
	const slot = nextSlot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
	slot.setter ??= (next) => {
		slot.value = typeof next === 'function' ? next(slot.value) : next;
	};
	return [slot.value, slot.setter];
}

export function useRef(initial) {
	return nextSlot(() => ({ current: initial }));
}

export function useCallback(callback) {
	nextSlot(() => ({}));
	return callback;
}

export function useMemo(factory) {
	nextSlot(() => ({}));
	return factory();
}

/** How many ids useId has given out (each a new one, as React's are unique on the page). */
let idCount = 0;

export function useId() {
	return nextSlot(() => {
		idCount += 1;
		return { id: `:shim${idCount}:` };
	}).id;
}

/** Have an effect's dependencies changed since its last run? No list (either time): yes, as in React. */
function depsChanged(previous, next) {
	if (!Array.isArray(previous) || !Array.isArray(next)) return true;
	if (previous.length !== next.length) return true;
	return next.some((value, index) => !Object.is(value, previous[index]));
}

/** Queues the effect to run after this render: the first time, and whenever its dependencies changed (see EFFECTS). */
export function useEffect(effect, deps) {
	const slot = nextSlot(() => ({ ran: false, deps: undefined, cleanup: undefined }));
	if (slot.ran && !depsChanged(slot.deps, deps)) return;
	slot.deps = deps;
	active.pending.push({ slot, effect });
}

/** Runs the effects the last render queued, each after its previous run's clean-up. */
function runPendingEffects(component) {
	const pending = component.pending;
	component.pending = [];
	for (const { slot, effect } of pending) {
		if (typeof slot.cleanup === 'function') slot.cleanup();
		const cleanup = effect();
		slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
		if (!slot.ran) component.effectSlots.push(slot);
		slot.ran = true;
	}
}

/** Render `hook` as a component would (see the header): { current, unmount() }. */
export function renderHook(hook) {
	const component = { slots: [], pending: [], effectSlots: [] };
	const render = () => {
		active = component;
		slotIndex = 0;
		let result;
		try {
			result = hook();
		} finally {
			active = null;
		}
		runPendingEffects(component);
		return result;
	};
	render();
	return {
		get current() {
			return render();
		},
		unmount() {
			for (const slot of component.effectSlots) {
				if (typeof slot.cleanup === 'function') slot.cleanup();
				slot.cleanup = undefined;
			}
		},
	};
}

export default { useState, useRef, useCallback, useMemo, useId, useEffect };
