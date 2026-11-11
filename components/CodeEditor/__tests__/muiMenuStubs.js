/**
 * muiMenuStubs.js — stand-ins for MUI's Select and Menu, so a test can read the props the
 * header hands them (menuScroll.test.js; not a test file itself). It is two things in one file,
 * like reactHookShim.js:
 *   - a Node module hook (resolve): `import Select from '@mui/material/Select'` and
 *     `import Menu from '@mui/material/Menu'` become this file, with `?stub=Select` or
 *     `?stub=Menu` on its address;
 *   - the stand-in itself (the default export): a component that draws nothing and records
 *     { component, props } in `globalThis[RECORDS]`, read with recordedProps().
 *
 *     import { register } from 'node:module';
 *     register('./jsxHooks.js', import.meta.url);
 *     register('./muiMenuStubs.js', import.meta.url);   // after jsxHooks: it is asked first
 *     const { recordedProps } = await import('./muiMenuStubs.js');
 *     … render the header on the server …
 *     recordedProps('Select')   // the props of every Select drawn so far
 *
 * HOW TO CHANGE IT  Another MUI component to stand in for: a line in STUBBED.
 */

/** The imports this file stands in for, and the name each is recorded under. */
const STUBBED = Object.freeze({
	'@mui/material/Select': 'Select',
	'@mui/material/Menu': 'Menu',
});

/** Where the stand-ins record what they were given (shared by the Select and Menu modules). */
const RECORDS = '__codeEditorMuiMenuStubs';

/** Node module hook: a stubbed import is this file, its name in the address. */
export async function resolve(specifier, context, nextResolve) {
	const name = STUBBED[specifier];
	if (name) return { url: `${new URL(import.meta.url).href.split('?')[0]}?stub=${name}`, shortCircuit: true };
	return nextResolve(specifier, context);
}

/** The props of every `component` ('Select' or 'Menu') drawn so far, in order. */
export function recordedProps(component) {
	return (globalThis[RECORDS] ?? []).filter((record) => record.component === component).map((record) => record.props);
}

/** Forget what was recorded (before the next render). */
export function clearRecords() {
	globalThis[RECORDS] = [];
}

/** The stand-in: records its props under the name in its own address, and draws nothing. */
export default function MuiMenuStub(props) {
	const component = new URL(import.meta.url).searchParams.get('stub');
	globalThis[RECORDS] ??= [];
	globalThis[RECORDS].push({ component, props });
	return null;
}
