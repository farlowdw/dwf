/**
 * netlify/functions/execute.mjs: a shim, so Netlify finds this site's function here and its URL stays
 * /.netlify/functions/execute. The function is shared/functions/code-runner/execute.mjs.
 *
 * HOW TO CHANGE IT  Edit the function there and roll it out (shared/README.md). Keep this file one
 * line: a default export and no `handler`, which the bundler reads as a modern function.
 */
export { default } from '../../shared/functions/code-runner/execute.mjs';
