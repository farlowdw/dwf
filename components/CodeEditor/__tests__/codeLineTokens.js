/**
 * codeLineTokens.js — the code-line tokens the editor reads with fallbacks (styles.module.css >
 * THE CODE-LINE TOKENS): the one list of them, for two tests. themeWiring.test.js here holds the
 * stylesheet to the list. shared/__tests__/codeEditorTokens.test.mjs compares each token with
 * shared/css/_code-blocks.scss, and it runs on every site, the ones without the editor included.
 *
 * HOW TO CHANGE IT  A new token: its name here (without --ce-line- or --code-line-), then its
 * values in styles.module.css and shared/css/_code-blocks.scss. The two tests name what is missing.
 */

export const CODE_LINE_TOKENS = Object.freeze([
	'highlighted-bg',
	'error-bg', 'error-bar', 'error-ink',
	'success-bg', 'success-bar', 'success-ink',
	'warning-bg', 'warning-bar', 'warning-ink',
	'removed-bg', 'removed-ink',
	'added-bg', 'added-ink',
]);
