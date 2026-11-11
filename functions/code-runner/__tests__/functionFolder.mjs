/**
 * functionFolder.mjs — how the two layout tests read a functions folder the way Netlify does.
 * functionsLayout.test.mjs reads the library here (shared/functions/code-runner) and
 * functionShims.test.mjs reads a site's netlify/functions. Netlify deploys as a function every
 * .js / .mjs / .zip (…) file directly in the folder (a .zip as a pre-bundled function, as it is)
 * and every subfolder holding index.* or <folder>.*: a stray file there would become a public
 * endpoint.
 *
 * HOW TO CHANGE IT
 *   A new function: add its name to EXPECTED_FUNCTIONS (a <name>.mjs with a default export, like
 *   the two) and give it a one-line shim in each site's netlify/functions.
 *   ENTRY_EXTENSIONS mirrors the bundler: functionShims.test.mjs fails when an upgrade changes the
 *   bundler's list, so update it here with that upgrade.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The functions of the library, and so the shims a site has. */
export const EXPECTED_FUNCTIONS = Object.freeze(['execute', 'runtimes']);

/** The extension the two functions use (an ES module, whatever any package.json says). */
export const FUNCTION_EXTENSION = '.mjs';

/**
 * File extensions Netlify treats as a function's entry point directly in the folder: a mirror
 * of `allowedExtensions` in the bundler's runtimes/node/finder.js (a .zip is deployed as a
 * pre-bundled function; a .jsx is NOT an entry). functionShims.test.mjs compares the two.
 */
export const ENTRY_EXTENSIONS = Object.freeze(['.js', '.zip', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

/** The extensions that make a subfolder a function (index.* / <folder>.*; the bundler's getMainFile never looks for a .zip there). */
const FOLDER_ENTRY_EXTENSIONS = Object.freeze(ENTRY_EXTENSIONS.filter((extension) => extension !== '.zip'));

/** True when `name` ends with one of ENTRY_EXTENSIONS. */
function isEntryFile(name) {
	return ENTRY_EXTENSIONS.includes(path.extname(name));
}

/** True when a subfolder of `functionsDir` holds an entry point (index.* or <folder>.*). */
function folderIsFunction(functionsDir, folder) {
	const names = fs.readdirSync(path.join(functionsDir, folder));
	const entryBases = ['index', folder];
	const isFolderEntry = (name) => FOLDER_ENTRY_EXTENSIONS.includes(path.extname(name)) && entryBases.includes(path.basename(name, path.extname(name)));
	return names.some(isFolderEntry);
}

/** The function names Netlify would find in `functionsDir` (a name twice when two entry files share it). */
export function discoveredFunctions(functionsDir) {
	const entries = fs.readdirSync(functionsDir, { withFileTypes: true });
	const files = entries.filter((entry) => entry.isFile() && isEntryFile(entry.name)).map((entry) => path.basename(entry.name, path.extname(entry.name)));
	const folders = entries.filter((entry) => entry.isDirectory() && folderIsFunction(functionsDir, entry.name)).map((entry) => entry.name);
	return [...files, ...folders].sort();
}
