/**
 * src/components/CodeEditor/unsavedWork.js: a stub, so src/clientModules/buildIdReload.js reads the
 * one registry the editor writes to, shared/components/CodeEditor/unsavedWork.js.
 *
 * HOW TO CHANGE IT  Edit the registry there and roll it out (shared/README.md). Keep this file a plain
 * re-export: a copy or a wrapper hands the reloader an empty registry, with no error, and a tab then
 * reloads over typed text (shared/__tests__/siteWiring.test.mjs holds it).
 */
export * from '@site/shared/components/CodeEditor/unsavedWork.js';
