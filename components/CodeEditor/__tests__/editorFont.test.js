/**
 * editorFont.test.js — the editor's font stack from the page's CSS variables (../editorFont.js):
 *   - --ce-font-family first (the site's choice), else --ifm-font-family-monospace (Infima's,
 *     every Docusaurus site), else the built-in FALLBACK_FONT;
 *   - values are trimmed (getPropertyValue keeps a leading space), an empty or unreadable one
 *     counts as unset, quotes are kept as written;
 *   - firstFamilyOf: the first family of a stack, quotes kept (what Monaco waits for).
 * Run with `npm run test:shared`.
 * To change it: a new source of the font in ../editorFont.js gets a test here, at its place in the
 * order.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_FONT, FONT_VARIABLE, INFIMA_MONO, firstFamilyOf, resolveFontFamily } from '../editorFont.js';

/** A reader over a table of variables, as getComputedStyle(…).getPropertyValue gives them. */
function readerOf(variables) {
	return (name) => variables[name] ?? '';
}

/** The shared stack (shared/css/custom.scss > --ce-font-family). */
const SITE_STACK = "'IBM Plex Mono', Menlo, Consolas, monospace";

test('the variable names and the last resort', () => {
	assert.equal(FONT_VARIABLE, '--ce-font-family');
	assert.equal(INFIMA_MONO, '--ifm-font-family-monospace');
	assert.equal(FALLBACK_FONT, 'Menlo, Consolas, monospace');
});

test("--ce-font-family wins: the site's own stack, trimmed, quotes kept", () => {
	const read = readerOf({ [FONT_VARIABLE]: ` ${SITE_STACK}`, [INFIMA_MONO]: "'IBM Plex Mono Regular', monospace" });
	assert.equal(resolveFontFamily(read), SITE_STACK);
});

test("without it, Infima's monospace stack (a stock Docusaurus site)", () => {
	const infima = "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
	assert.equal(resolveFontFamily(readerOf({ [INFIMA_MONO]: `\n    ${infima}\n` })), infima);
	assert.equal(resolveFontFamily(readerOf({ [FONT_VARIABLE]: '   ', [INFIMA_MONO]: infima })), infima, 'blank counts as unset');
});

test('neither set: FALLBACK_FONT; a reader that throws or returns no string counts as unset', () => {
	assert.equal(resolveFontFamily(readerOf({})), FALLBACK_FONT);
	assert.equal(resolveFontFamily(() => { throw new Error('no document'); }), FALLBACK_FONT);
	assert.equal(resolveFontFamily(() => undefined), FALLBACK_FONT);
});

test('firstFamilyOf: the first family of a stack, quotes kept; nothing for nothing', () => {
	assert.equal(firstFamilyOf(SITE_STACK), "'IBM Plex Mono'");
	assert.equal(firstFamilyOf('Menlo, Consolas, monospace'), 'Menlo');
	assert.equal(firstFamilyOf(' "Fira Code" , monospace'), '"Fira Code"');
	assert.equal(firstFamilyOf('monospace'), 'monospace');
	assert.equal(firstFamilyOf(''), '');
	assert.equal(firstFamilyOf(undefined), '');
});
