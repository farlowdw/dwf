/**
 * netlify/functions/feedback.mjs: a shim, so Netlify finds this site's own function here and its URL
 * stays /.netlify/functions/feedback (src/components/PageFeedback/rules.js > FEEDBACK_ENDPOINT). The
 * function is functions/feedback/feedback.mjs, the page-feedback prompt's. package.json > ownFunctions
 * names it, or shared/functions/code-runner/__tests__/functionShims.test.mjs fails on this file.
 *
 * HOW TO CHANGE IT  Edit the function there (functions/feedback/README.md). Keep this file one line:
 * a default export and no `handler`, which the bundler reads as a modern function
 * (scripts/site-files.test.mjs holds it). To take the function off the site: switch the prompt off
 * first (docusaurus.config.js > customFields.feedbackEnabled), then, together, delete this file, its
 * name in package.json > ownFunctions, the tests that need this file (in scripts/site-files.test.mjs,
 * the function's test and FEEDBACK_SHIM in FEEDBACK_PLACES; in
 * functions/feedback/__tests__/feedback.test.mjs, the test of this shim), the lines of README.md and
 * netlify.toml that name the function, and those of functions/feedback/README.md that name this file.
 */
export { default } from '../../functions/feedback/feedback.mjs';
