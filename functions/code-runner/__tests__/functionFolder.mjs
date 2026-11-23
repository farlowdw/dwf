/**
 * functionFolder.mjs — how the two layout tests read a functions folder the way Netlify does, and
 * which functions a site's folder may hold. functionsLayout.test.mjs reads the library here
 * (shared/functions/code-runner) and functionShims.test.mjs reads a site's netlify/functions.
 * Netlify deploys as a function every .js / .mjs / .zip (…) file directly in the folder (a .zip as
 * a pre-bundled function, as it is) and every subfolder holding index.* or <folder>.*: a stray file
 * there would become a public endpoint. So a site's folder holds the library's shims and the
 * functions the site lists as its own in its package.json (OWN_FUNCTIONS_FIELD), and nothing else:
 * allowedFunctions() is that list.
 *
 * HOW TO CHANGE IT
 *   A new function of the library: add its name to EXPECTED_FUNCTIONS (a <name>.mjs with a default
 *   export, like the two) and give it a one-line shim in each site's netlify/functions.
 *   A function of one site's own stays in that site, and its name goes in the OWN_FUNCTIONS_FIELD
 *   list of that site's package.json. allowedFunctions() refuses a list that names a function of
 *   the library, so a new function here cannot take a name a site already uses without a test failing.
 *   ENTRY_EXTENSIONS mirrors the bundler: functionShims.test.mjs fails when an upgrade changes the
 *   bundler's list, so update it here with that upgrade.
 */

import fs from 'node:fs';
import path from 'node:path';

/** The functions of the library, and so the shims a site has. */
export const EXPECTED_FUNCTIONS = Object.freeze(['execute', 'runtimes']);

/** The field of a site's package.json that lists, by name, the functions of the site's own. A site without one has none. */
export const OWN_FUNCTIONS_FIELD = 'ownFunctions';

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

/** True for a string with at least one character. */
function isName(value) {
	return typeof value === 'string' && value.length > 0;
}

/** The names that stand in `names` more than once, each named once. */
function repeatedNames(names) {
	return [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
}

/**
 * The functions a site's netlify/functions may hold, sorted as discoveredFunctions() sorts: the
 * library's (EXPECTED_FUNCTIONS) and `own`, the names the site lists in its package.json under
 * OWN_FUNCTIONS_FIELD (none when it lists none). It reads no file and changes nothing it is given.
 * It throws an Error that names the field when `own` is not an array of non-empty strings, names a
 * function of the library, or names one function twice.
 */
export function allowedFunctions(own = []) {
	if (!Array.isArray(own) || !own.every(isName)) {
		throw new Error(`${OWN_FUNCTIONS_FIELD} must be a list of function names, each a non-empty string`);
	}
	const library = own.filter((name) => EXPECTED_FUNCTIONS.includes(name));
	if (library.length > 0) {
		throw new Error(`${OWN_FUNCTIONS_FIELD} names the library's ${library.join(', ')} (EXPECTED_FUNCTIONS): list only the site's own functions`);
	}
	const repeated = repeatedNames(own);
	if (repeated.length > 0) {
		throw new Error(`${OWN_FUNCTIONS_FIELD} names ${repeated.join(', ')} more than once`);
	}
	return [...EXPECTED_FUNCTIONS, ...own].sort();
}
