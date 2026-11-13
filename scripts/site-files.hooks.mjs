/**
 * site-files.hooks.mjs: Node module hooks that let site-files.test.mjs RUN the site's client module
 * src/clientModules/buildIdReload.js, which starts the reload after a deploy, under `node --test`.
 * That test registers this file before its first dynamic import. Test-only: the site never loads it.
 *
 * WHAT IT DOES (it only says where a name leads; no file's code is changed)
 *   '@docusaurus/ExecutionEnvironment'   the installed file that webpack's alias points at
 *                                        (@docusaurus/core/lib/client/exports), so canUseDOM is the
 *                                        real answer for the test's fake window
 *   '@site/<path>'                       <path> from the repo's top folder, as webpack's alias reads
 *                                        it. The stub of the code editor's registry imports that way
 *   everything else                      Node's own resolution. So the imports the test is about, the
 *                                        client module's and the stub's, are followed as written
 *   The site's own browser files in ES_MODULE_TAILS are also marked as ES modules: their folders
 *   have no package.json that says so, and Node would otherwise have to find out.
 *
 * How to change it: the client module imports another Docusaurus name: a row in DOCUSAURUS_EXPORTS
 * (the same folder as the alias). Another file of the site that the test runs: ES_MODULE_TAILS.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const requireFromHere = createRequire(import.meta.url);

/** The repo's top folder, which webpack's alias '@site' names. */
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE_ALIAS = '@site/';

/** The folder Docusaurus's webpack alias '@docusaurus' points at, inside the installed core. */
const DOCUSAURUS_EXPORTS_FOLDER = path.join(
  path.dirname(requireFromHere.resolve('@docusaurus/core/package.json')), 'lib', 'client', 'exports',
);

/** The aliased Docusaurus names the client module imports, each with its file in that folder. */
const DOCUSAURUS_EXPORTS = Object.freeze({
  '@docusaurus/ExecutionEnvironment': 'ExecutionEnvironment.js',
});

/** The site's own files the test runs, by the end of their address: read as ES modules. */
const ES_MODULE_TAILS = Object.freeze([
  '/src/clientModules/buildIdReload.js',
  '/src/clientModules/commentsFocus.js',
  '/src/components/CodeEditor/unsavedWork.js',
]);

/** An address without its '?...': the test imports the client module again with a query, for a fresh copy. */
function withoutQuery(url) {
  return String(url ?? '').split('?')[0];
}

export async function resolve(specifier, context, nextResolve) {
  const exportFile = DOCUSAURUS_EXPORTS[specifier];
  if (exportFile !== undefined) {
    return { url: pathToFileURL(path.join(DOCUSAURUS_EXPORTS_FOLDER, exportFile)).href, format: 'module', shortCircuit: true };
  }
  const asked = specifier.startsWith(SITE_ALIAS)
    ? pathToFileURL(path.join(ROOT, specifier.slice(SITE_ALIAS.length))).href
    : specifier;
  const resolved = await nextResolve(asked, context);
  if (ES_MODULE_TAILS.some((tail) => withoutQuery(resolved.url).endsWith(tail))) return { ...resolved, format: 'module' };
  return resolved;
}
