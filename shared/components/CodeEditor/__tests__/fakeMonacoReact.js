/**
 * fakeMonacoReact.js — a stand-in for @monaco-editor/react, so a test can run useMonacoLoader.js
 * in node with no Monaco (not a test file itself). It is two things in one file, as
 * reactHookShim.js is: a Node module hook, and the fake `loader`, which counts its calls.
 *
 *     import { register } from 'node:module';
 *     register('./fakeMonacoReact.js', import.meta.url);   // '@monaco-editor/react' → this file
 *     const { loaderCalls } = await import('./fakeMonacoReact.js');
 *     loaderFailure.reason = new Error('x');                 // every later init() rejects with it (null: never settles)
 *
 * HOW TO CHANGE IT  A file under test that uses another export of the package: add it here.
 */

/** Node module hook: '@monaco-editor/react' is this file. */
export async function resolve(specifier, context, nextResolve) {
	if (specifier === '@monaco-editor/react') return { url: import.meta.url, shortCircuit: true };
	return nextResolve(specifier, context);
}

/** How many times the fake loader was asked to do something. */
export const loaderCalls = { config: 0, init: 0 };

/** What init() does: with a `reason`, the load fails with it (as @monaco-editor/loader's does when Monaco's files fail). */
export const loaderFailure = { reason: null };

/** A load that never finishes (or fails with loaderFailure.reason), with the cancel() a real one has. */
function pendingLoad() {
	const load = loaderFailure.reason === null ? new Promise(() => {}) : Promise.reject(loaderFailure.reason);
	load.cancel = () => {};
	return load;
}

/** The small part of @monaco-editor/loader that useMonacoLoader.js uses. */
export const loader = {
	config() {
		loaderCalls.config += 1;
	},
	init() {
		loaderCalls.init += 1;
		return pendingLoad();
	},
};
