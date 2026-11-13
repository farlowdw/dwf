/**
 * buildIdReload.js: reloads a tab that still runs an OLD build after a deploy, at a safe moment
 * (never while a code editor holds unsaved text, after the comment box has had the focus, while a
 * dialog is open or a text field has focus, or during a code run). A Docusaurus client module
 * (docusaurus.config.js > clientModules): it runs once per page load, in the browser only. During
 * the static build and under `npm start` (no build id in the page) it does nothing.
 *
 * How it works: shared/lib/pageReload/reloader.js (the browser side) and decide.js (the rules and
 * timings), the one copy every site that mounts shared/ runs. This file stays the site's own and
 * hands the reloader this site's unsaved-text check, which asks two things:
 *   - the code editor's own flag (shared/components/CodeEditor/unsavedWork.js > hasUnsavedWork),
 *     imported through the stub src/components/CodeEditor/unsavedWork.js. The stub must stay a
 *     plain re-export: a copy would be a second, empty registry, and no error says so;
 *   - the comment box (./commentsFocus.js): its text is in a frame of another site, where this
 *     page cannot see it, so the tab keeps its build once that frame has had the focus.
 * The ids come from shared/plugins/build-id (buildIdPlugin() in docusaurus.config.js), and
 * netlify.toml serves /build-id.json with no cache.
 * The reloader's default is "nothing is unsaved": drop the argument below and a reload can take
 * typed text with it, with no error. scripts/site-files.test.mjs runs this file and fails then.
 *
 * HOW TO CHANGE IT
 *   Rules and timings: shared/lib/pageReload/decide.js, rolled out to every site
 *   (shared/README.md). Another place that holds typed text: one more question in hasUnsavedWork
 *   below, with a test beside the others. Remove the feature: drop this file from
 *   docusaurus.config.js > clientModules, buildIdPlugin() from its plugins, and the
 *   /build-id.json block from netlify.toml.
 */

import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import { hasUnsavedWork as editorHasUnsavedWork } from '../components/CodeEditor/unsavedWork.js';
import { startReloader } from '../../shared/lib/pageReload/reloader.js';
import { watchCommentsFocus } from './commentsFocus.js';

if (ExecutionEnvironment.canUseDOM) {
  /** Answers false until the reloader has started: a page with no build id watches nothing. */
  let commentsHadFocus = () => false;
  const hasUnsavedWork = () => editorHasUnsavedWork() || commentsHadFocus();
  const started = startReloader({ win: window, doc: document, hasUnsavedWork });
  if (started !== null) commentsHadFocus = watchCommentsFocus({ win: window, doc: document });
}
