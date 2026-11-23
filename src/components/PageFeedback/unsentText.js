/**
 * unsentText.js: the page-feedback card's own registry of "a card on this page holds text that is
 * not sent yet": one flag per card. The card (index.jsx) sets its flag while its field holds text a
 * reader could see, and while a message is on its way; the text is kept when the card is closed, so
 * the flag stays set until the text is sent, emptied or the page is left.
 * src/clientModules/buildIdReload.js asks hasUnsentText() before it reloads a tab after a deploy,
 * and holds the reload while it is true, so a reload never takes typed feedback with it.
 *
 *     const holder = {};                   // any object, one per card
 *     setUnsentText(holder, true);         // while it holds unsent text, or is sending
 *     setUnsentText(holder, false);        // sent, emptied or unmounted
 *     hasUnsentText();                     // true while at least one holder is registered
 *
 * Plain module state (one Set): no import, no listener, no React, no storage, nothing at load. It
 * describes THIS page only and is empty after a reload. Safe during the static build (nothing
 * touches `window`). The same shape as the code editor's registry,
 * shared/components/CodeEditor/unsavedWork.js, which the reloader asks too.
 *
 * HOW TO CHANGE IT
 *   When the card holds the reload: the effect in index.jsx that calls setUnsentText. Who asks:
 *   src/clientModules/buildIdReload.js. Keep this file free of imports: that client module loads it
 *   on every page.
 *   Tests: __tests__/unsentText.test.js (package.json > shared:verify names it).
 */

const holders = new Set();

/** Register (`active` true) or release (`active` false) one holder. */
export function setUnsentText(holder, active) {
  if (active) holders.add(holder);
  else holders.delete(holder);
}

/** true while at least one card on the page holds unsent text. */
export function hasUnsentText() {
  return holders.size > 0;
}

/** For the tests: forget every holder. */
export function resetUnsentText() {
  holders.clear();
}
