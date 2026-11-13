/**
 * commentsFocus.js: tells buildIdReload.js whether the comment box has had the focus since this
 * page loaded, so that a reload after a deploy never drops a comment a visitor is typing.
 *
 * WHY
 *   The comments are giscus (src/theme/DocItem/Layout, src/theme/BlogPostItem/Content): a frame
 *   of another site. This page cannot read what a visitor types there, and giscus keeps an unsent
 *   comment in memory only, so a reload would drop it. What the page can see is the focus: while
 *   it is in the frame, document.activeElement is the widget. So once the widget has held the
 *   focus, the answer stays true until the tab loads a page afresh, and the reloader waits. That
 *   tab keeps its build, as every tab did before the site had a reloader.
 *
 * WHEN IT LOOKS
 *   When the window loses the focus (a click or a Tab into the frame takes it), and each time it
 *   is asked (a tab that comes back with the cursor still in the frame).
 *
 * HOW TO CHANGE IT
 *   Another comments widget, or another frame that takes typed text: its element in
 *   COMMENTS_SELECTOR. To let a tab reload again once the visitor has left the page with the
 *   comment: first make sure the widget, and the text in it, is gone by then; then set `seen`
 *   back from an onRouteDidUpdate export of buildIdReload.js.
 *   Tests: scripts/site-files.test.mjs.
 */

/** The comments widget as the page sees it: giscus's web component, or its plain frame. */
export const COMMENTS_SELECTOR = 'giscus-widget, .giscus-frame';

/** Is `element` (document.activeElement) the comments widget, or inside it? */
export function isCommentsFocus(element) {
  return typeof element?.closest === 'function' && element.closest(COMMENTS_SELECTOR) !== null;
}

/**
 * Start watching. Returns a function that answers true once the comments have held the focus.
 *   win   window: addEventListener, setTimeout
 *   doc   document: activeElement
 */
export function watchCommentsFocus({ win, doc }) {
  let seen = false;
  const look = () => {
    if (isCommentsFocus(doc.activeElement)) seen = true;
  };
  // A browser may name the frame as the active element only after the blur event, so look twice.
  win.addEventListener('blur', () => {
    look();
    win.setTimeout(look, 0);
  });
  return () => {
    look();
    return seen;
  };
}
