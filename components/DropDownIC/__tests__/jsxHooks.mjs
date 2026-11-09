/**
 * jsxHooks.mjs — Node module hooks that let render.test.mjs import ../index.jsx the way
 * webpack does on the site: a .jsx file is compiled by Babel's React preset (the automatic
 * runtime, as Docusaurus does; the preset comes with Docusaurus), and a CSS module becomes an
 * object whose every property is its own name (styles.box === 'box'), so markup can be checked
 * by class. Nothing of the site is needed: the component imports only react, react-dom and its
 * stylesheet, so the folder's tests run wherever the folder is copied. Test-only.
 *
 *     import { register } from 'node:module';
 *     register('./jsxHooks.mjs', import.meta.url);        // then DYNAMIC imports of the component
 *
 * HOW TO CHANGE IT  Another kind of file the component comes to import: a branch in load().
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/** Only files of the component's own folder are compiled (this file is in its __tests__). */
const FOLDER_URL = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') + path.sep).href;

/** A CSS module: every class name reads as itself. */
const CSS_MODULE_SOURCE = "export default new Proxy({}, { get: (target, key) => (typeof key === 'string' ? key : undefined) });";

/** Babel's React preset, found from this file (so the tests may run from any folder). */
const REACT_PRESET = createRequire(import.meta.url).resolve('@babel/preset-react');

let babel = null;

async function compile(source, filename) {
	babel ??= await import('@babel/core');
	const result = await babel.transformAsync(source, {
		filename,
		babelrc: false,
		configFile: false,
		sourceType: 'module',
		presets: [[REACT_PRESET, { runtime: 'automatic' }]],
	});
	return result.code;
}

export async function load(url, context, nextLoad) {
	if (!url.startsWith(FOLDER_URL)) return nextLoad(url, context);
	if (url.endsWith('.module.css')) return { format: 'module', source: CSS_MODULE_SOURCE, shortCircuit: true };
	if (url.endsWith('.jsx')) return { format: 'module', source: await compile(readFileSync(fileURLToPath(url), 'utf8'), fileURLToPath(url)), shortCircuit: true };
	return nextLoad(url, context);
}
