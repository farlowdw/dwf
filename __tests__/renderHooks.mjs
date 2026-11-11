/**
 * __tests__/renderHooks.mjs: Node module hooks that let a component's render test (Asterisk's, BibRef's, LC's,
 * MuiTheme's and the code grid's) import its index.jsx the way the site's webpack does, so react-dom/server can
 * render it with nothing built:
 *   - a .jsx file under components/ is compiled by Babel's React preset (the automatic runtime, as Docusaurus
 *     does; the preset comes with Docusaurus), and a .js file there loads as a module, as webpack reads it;
 *   - an import without an extension from a file under components/ finds its .js or .jsx file, as webpack does;
 *   - @docusaurus/theme-common becomes a stand-in whose useColorMode() reads globalThis[COLOR_MODE_KEY], 'light'
 *     when unset: the real hook needs the theme's context, which only a built page has.
 * DropDownIC keeps its own jsxHooks.mjs, so that its folder stays whole. Test-only:
 *
 *     import { register } from 'node:module';
 *     register('../../../__tests__/renderHooks.mjs', import.meta.url);   // then DYNAMIC imports of the component
 *
 * HOW TO CHANGE IT
 *   Another kind of file a component comes to import: a branch in load(). Another Docusaurus module it reads: a
 *   stand-in in STAND_INS. The extensions an import may leave out: RESOLVED_EXTENSIONS.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Where a test sets the colour mode the stand-in reports: 'light' or 'dark'. */
export const COLOR_MODE_KEY = 'sharedRenderColorMode';

/** Only files under components/ are compiled or resolved here. */
const COMPONENTS_URL = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'components') + path.sep).href;

const RESOLVED_EXTENSIONS = ['.js', '.jsx'];

/** The Docusaurus modules a component imports, each as the source of a small module in its place. */
const STAND_INS = Object.freeze({
  '@docusaurus/theme-common': `export function useColorMode() { return { colorMode: globalThis.${COLOR_MODE_KEY} ?? 'light' }; }`,
});

/** Babel's React preset, found from this file, so the tests may run from any folder. */
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

/** The file an extension-less relative import from a component means, or null. */
function withExtension(specifier, parentURL) {
  if (!specifier.startsWith('.') || path.extname(specifier) !== '' || !parentURL?.startsWith(COMPONENTS_URL)) return null;
  const found = RESOLVED_EXTENSIONS.map((extension) => new URL(`${specifier}${extension}`, parentURL))
    .find((url) => existsSync(fileURLToPath(url)));
  return found ? found.href : null;
}

export async function resolve(specifier, context, nextResolve) {
  if (STAND_INS[specifier] !== undefined) {
    return { url: `data:text/javascript,${encodeURIComponent(STAND_INS[specifier])}`, shortCircuit: true };
  }
  const file = withExtension(specifier, context.parentURL);
  return file ? { url: file, shortCircuit: true } : nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith(COMPONENTS_URL)) return nextLoad(url, context);
  const file = fileURLToPath(url);
  if (url.endsWith('.jsx')) return { format: 'module', source: await compile(readFileSync(file, 'utf8'), file), shortCircuit: true };
  if (url.endsWith('.js')) return { format: 'module', source: readFileSync(file, 'utf8'), shortCircuit: true };
  return nextLoad(url, context);
}
