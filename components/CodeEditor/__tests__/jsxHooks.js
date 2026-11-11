/**
 * jsxHooks.js — Node module hooks that let render.test.js import the editor's .jsx files the way
 * webpack does on the site (the same approach as shared/components/DropDownIC/__tests__/
 * jsxHooks.mjs). Test-only; CodeRef/__tests__/render.test.js registers this same file.
 *
 *     import { register } from 'node:module';
 *     register('./jsxHooks.js', import.meta.url);        // then DYNAMIC imports of the .jsx files
 *
 *   - a .jsx file of the editor's folder (its subfolders included: CodeRef/, lib/) is compiled
 *     by Babel's React preset (the automatic runtime, as Docusaurus does; the preset comes with
 *     Docusaurus);
 *   - a CSS module becomes an object whose every property is its own name (styles.frame ===
 *     'frame'), so markup can be checked by class;
 *   - '@docusaurus/BrowserOnly' is its server half: it draws `fallback` — what the server render
 *     of a page shows.
 *   Nothing in the folder imports '@site/…' (files.test.js keeps it so), so no alias is needed
 *   and the folder's tests run on any site that mounts it.
 *
 * HOW TO CHANGE IT  Another kind of file or alias a rendered .jsx comes to import: a branch in
 * resolve() or load().
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Only files of the component's own folder are compiled. */
const FOLDER_URL = pathToFileURL(path.resolve(HERE, '..') + path.sep).href;

/** A CSS module: every class name reads as itself. */
const CSS_MODULE_SOURCE = "export default new Proxy({}, { get: (target, key) => (typeof key === 'string' ? key : undefined) });";

/** BrowserOnly on the server: the fallback only (Docusaurus's own does the same during SSR). */
const BROWSER_ONLY_URL = `data:text/javascript,${encodeURIComponent('export default function BrowserOnly({ fallback }) { return fallback ?? null; }')}`;

/** Babel's React preset, found from this file (so the tests may run from any folder). */
const REACT_PRESET = createRequire(import.meta.url).resolve('@babel/preset-react');

let babel = null;

/** A .jsx file's source compiled to plain JavaScript. */
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

export async function resolve(specifier, context, nextResolve) {
	if (specifier === '@docusaurus/BrowserOnly') return { url: BROWSER_ONLY_URL, shortCircuit: true };
	return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
	if (!url.startsWith(FOLDER_URL)) return nextLoad(url, context);
	if (url.endsWith('.module.css')) return { format: 'module', source: CSS_MODULE_SOURCE, shortCircuit: true };
	if (url.endsWith('.jsx')) return { format: 'module', source: await compile(readFileSync(fileURLToPath(url), 'utf8'), fileURLToPath(url)), shortCircuit: true };
	return nextLoad(url, context);
}
