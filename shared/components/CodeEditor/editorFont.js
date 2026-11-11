/**
 * editorFont.js — which monospace font stack the editor's code uses, read from the PAGE's CSS
 * variables at the client's first render (nothing hard-coded in the folder, so each site
 * gets its own font):
 *   1. --ce-font-family       the site's choice for the editor (shared/css sets it in
 *                             shared/css/custom.scss: 'IBM Plex Mono', Menlo, Consolas, monospace —
 *                             the stack the editor always had);
 *   2. --ifm-font-family-monospace   else Infima's monospace stack, which every Docusaurus
 *                             site defines (the site's code blocks' font);
 *   3. FALLBACK_FONT          else the platforms' own.
 * A page's `editorOptions.fontFamily` still wins over all three (props.js > buildMonacoOptions).
 *
 *     const fontFamily = resolveFontFamily((name) => getComputedStyle(document.documentElement).getPropertyValue(name));
 *     firstFamilyOf(fontFamily)   // "'IBM Plex Mono'": the face Monaco waits for (monacoSetup.js)
 *
 * Pure: the reader of a variable is passed in, so the tests run without a DOM, and the server
 * render never calls this (the placeholder's code uses the same chain as plain CSS:
 * props.js > waitingCodeStyle).
 *
 * HOW TO CHANGE IT  The variable names: FONT_VARIABLE / INFIMA_MONO; the last resort:
 * FALLBACK_FONT. Tests: __tests__/editorFont.test.js.
 */

/** The site's variable for the editor's font (set on :root; optional). */
export const FONT_VARIABLE = '--ce-font-family';

/** Infima's monospace stack: every Docusaurus site has it. */
export const INFIMA_MONO = '--ifm-font-family-monospace';

/** The stack when neither variable is set. */
export const FALLBACK_FONT = 'Menlo, Consolas, monospace';

/** The variables tried, in order. */
const VARIABLES_IN_ORDER = Object.freeze([FONT_VARIABLE, INFIMA_MONO]);

/** A variable's value as text, trimmed; '' when unset, empty or unreadable. */
function valueOf(readVariable, name) {
	try {
		const value = readVariable(name);
		return typeof value === 'string' ? value.trim() : '';
	} catch {
		return '';
	}
}

/**
 * The editor's font stack: the first non-empty of --ce-font-family and
 * --ifm-font-family-monospace (`readVariable(name)` gives a variable's value, as
 * getComputedStyle(…).getPropertyValue does), else FALLBACK_FONT.
 */
export function resolveFontFamily(readVariable) {
	for (const name of VARIABLES_IN_ORDER) {
		const value = valueOf(readVariable, name);
		if (value !== '') return value;
	}
	return FALLBACK_FONT;
}

/** The first family of a stack, quotes kept ("'IBM Plex Mono', Menlo" → "'IBM Plex Mono'"); '' for an empty stack. */
export function firstFamilyOf(stack) {
	if (typeof stack !== 'string') return '';
	return stack.split(',')[0].trim();
}
