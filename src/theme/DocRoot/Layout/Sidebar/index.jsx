/**
 * src/theme/DocRoot/Layout/Sidebar/index.jsx: a stub. Docusaurus reads this path for the docs
 * sidebar's column, and the wrapper that keeps the reader's place when the sidebar collapses or
 * expands lives in shared/theme/DocRoot/Layout/Sidebar. Without this file the theme's plain column
 * comes back and the build still passes: scripts/site-files.test.mjs holds it.
 *
 * HOW TO CHANGE IT  The wrapper, for every site: shared/theme/DocRoot/Layout/Sidebar. This site back
 * on the theme's plain column: delete this file and its two checks in scripts/site-files.test.mjs.
 */
export { default } from '@site/shared/theme/DocRoot/Layout/Sidebar';
