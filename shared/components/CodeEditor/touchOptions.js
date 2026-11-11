/**
 * touchOptions.js — Monaco's options for an editor mounted on a touch-first device (after
 * "Tap to edit": touchMode.js), and the one-level merge the editor's options are built with.
 * Pure: no React, no DOM, no Monaco, so `node --test` checks it (__tests__/touchOptions.test.js).
 *
 * WHERE IT SITS  props.js > buildMonacoOptions lays the options in three coats: the site's
 *   (DEFAULT_EDITOR_OPTIONS, plus FIT_SCROLLBAR_OPTIONS for a fit editor), then — on touch
 *   only — TOUCH_EDITOR_OPTIONS, then the page's `editorOptions`. The page still wins, as it
 *   does over the fit scrollbar: a page that sets `wordWrap: 'off'` keeps it on a phone too.
 *   Off touch, touchEditorOptions returns the site's options BY IDENTITY, so an editor on a
 *   desktop builds exactly the options it built before (__tests__/backCompat.test.js).
 *
 * WHY THESE SEVEN (2026-10-26)
 *   wordWrap 'on'                      a phone is narrow and a swipe on the code scrolls Monaco,
 *                                      not the page (Monaco's touch handler): a long line wraps
 *                                      instead of needing a sideways swipe
 *   hover disabled                     there is no pointer to hover with; a tap would open the
 *                                      hover card over the code instead of placing the caret
 *   quickSuggestions false             the suggestion widget fights the on-screen keyboard for
 *                                      the little room left; Ctrl+Space still opens it on a
 *                                      hardware keyboard
 *   suggestOnTriggerCharacters false   the SAME widget opens on every '.' in JavaScript and
 *                                      TypeScript (Monaco's TypeScript worker triggers on it);
 *                                      the other languages have no trigger characters
 *   parameterHints disabled            the signature card opens on every '(' and ',' in those
 *                                      two languages and takes the same room over the keyboard
 *   lineNumbersMinChars 3              a narrower gutter on a narrow screen (Monaco's default is 5)
 *   editContext false                  Monaco 0.55 defaults to the EditContext API where the
 *                                      browser has it (Chrome, Edge today) and then renders a
 *                                      `.native-edit-context` div plus an `ime-text-area`
 *                                      instead of `textarea.inputarea`; false keeps the textarea
 *                                      path on every browser — the one static.module.css's 16 px
 *                                      rule, the contract test and the README rest on — so iOS
 *                                      stays guarded the day WebKit ships EditContext
 *                                      (__tests__/monacoTouchContract.test.js reads the facts)
 *
 * HOW TO CHANGE IT
 *   Another option for touch: a key in TOUCH_EDITOR_OPTIONS (freeze an object value) and a line
 *   above; the page keeps the last word. The merge rule: mergeOptions (props.js reuses it, so a
 *   change here changes every editor's options).
 */

/** Monaco's options for an editor on a touch-first device, under the page's own (see the header). */
export const TOUCH_EDITOR_OPTIONS = Object.freeze({
	wordWrap: 'on',
	hover: Object.freeze({ enabled: false }),
	quickSuggestions: false,
	suggestOnTriggerCharacters: false,
	parameterHints: Object.freeze({ enabled: false }),
	lineNumbersMinChars: 3,
	editContext: false,
});

/** Is this a plain object (not null, not an array)? */
function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * `overrides` over `defaults`, key by key; a plain-object value (`scrollbar`, `hover`, `padding`)
 * is merged one level deep. Always a new object, with new nested objects: neither argument is
 * touched, so frozen defaults stay frozen and safe to share.
 */
export function mergeOptions(defaults, overrides) {
	const merged = {};
	for (const [key, value] of Object.entries(defaults)) merged[key] = isPlainObject(value) ? { ...value } : value;
	for (const [key, value] of Object.entries(overrides)) {
		merged[key] = isPlainObject(value) && isPlainObject(merged[key]) ? { ...merged[key], ...value } : value;
	}
	return merged;
}

/**
 * The options under the page's `editorOptions`: `siteOptions` itself when `touch` is false
 * (the same object, so nothing changes off touch), else `siteOptions` with TOUCH_EDITOR_OPTIONS
 * over them and `pageOptions` over both (the page wins).
 */
export function touchEditorOptions(siteOptions, pageOptions, touch) {
	if (!touch) return siteOptions;
	return mergeOptions(mergeOptions(siteOptions, TOUCH_EDITOR_OPTIONS), pageOptions ?? {});
}
