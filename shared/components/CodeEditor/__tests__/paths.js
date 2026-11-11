/**
 * paths.js — where the editor's tests find things, so that they run on ANY site that mounts
 * shared/ (README.md > Taking it to another Docusaurus site) and read nothing of the site:
 *   FOLDER          the component's folder (shared/components/CodeEditor on a site)
 *   SITE            the site the folder sits in: the nearest folder above FOLDER that holds a
 *                   node_modules (no fixed depth, so the folder may sit anywhere under the site)
 *   NODE_MODULES    that site's node_modules
 *   resolvePackage(name)   an installed package's folder, as Node resolves it from here (its
 *                   package.json; a package whose exports map hides it falls back to
 *                   NODE_MODULES/<name>)
 * A test reads the site's installed packages through these (Monaco's sources, MUI's icons,
 * Docusaurus's theme and utils) and this folder's own fixtures (fixtures/); the site's own
 * files (its pages, blog, CSS, config) are never read here — that is the site's business, in
 * a wiring test of its own — and files.test.js refuses a test that names them.
 *
 * HOW TO CHANGE IT  Another package a test needs: resolvePackage(name) in the test; nothing here.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The folder Node looks in for packages. */
const PACKAGES_FOLDER = 'node_modules';

/** The component's folder. */
export const FOLDER = path.resolve(HERE, '..');

/** The nearest folder at or above `from` holding a node_modules; `from` itself when none does. */
function siteOf(from) {
	let dir = path.dirname(from);
	while (true) {
		if (existsSync(path.join(dir, PACKAGES_FOLDER))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return from;
		dir = parent;
	}
}

/** The site the folder sits in. */
export const SITE = siteOf(FOLDER);

/** The site's installed packages. */
export const NODE_MODULES = path.join(SITE, PACKAGES_FOLDER);

const require = createRequire(import.meta.url);

/** The folder of an installed package (see the header). */
export function resolvePackage(name) {
	try {
		const manifest = `${name}/package.json`;
		return path.dirname(require.resolve(manifest));
	} catch {
		return path.join(NODE_MODULES, name);
	}
}
