/**
 * print.test.mjs: rules that only show on paper, or on a page that has no theme set yet, where a slip builds and
 * passes every other test. It reads the stylesheets as text, comments left out, and needs no install.
 *   - css/_code-blocks.scss prints a marked line's band exactly (print-color-adjust: exact). In dark that keeps
 *     the line's near-white text on a pale band, so a print rule outside light mode gives the line and its number
 *     cell back to the browser (economy), which darkens the text and leaves the band out.
 *   - css/custom.scss sets the alerts' light tints under a selector that matches a page with no data-theme, as
 *     MUI's print window is, and never one in dark mode: Infima's dark values stay. The README and the
 *     template's site.scss, which tell a site how to set its own tint, name that same selector.
 *
 * HOW TO CHANGE IT
 *   The selectors these rules must keep: DARK_PRINT_SELECTORS and the TINTS_* patterns. The property that finds the
 *   tints' rule: TINT_PROPERTY. Run with `npm run test:shared`, or on its own with
 *   `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readShared, stripComments } from './sharedTree.mjs';

const README_FILE = 'README.md';
const TEMPLATE_SITE_STYLES = 'template/src/css/site.scss';

const CODE_LINES_FILE = 'css/_code-blocks.scss';
const CUSTOM_RULES_FILE = 'css/custom.scss';

const EXACT = /(?<!-)print-color-adjust:\s*exact/g;
const ECONOMY = /(?<!-)print-color-adjust:\s*economy\s*!important/;
const WEBKIT_ECONOMY = /-webkit-print-color-adjust:\s*economy\s*!important/;

/** The elements the exact pairs reach, as a dark print rule must name them. */
const DARK_PRINT_SELECTORS = [
  "html:not([data-theme='light']) .theme-code-block .token-line",
  "html:not([data-theme='light']) .theme-code-block .token-line > [class*='codeLineNumber_']",
];

/** One of the twelve tint properties, to find their rule by. */
const TINT_PROPERTY = '--ifm-color-warning-contrast-background';

/** A selector that needs a light data-theme misses MUI's print window; one that can match dark beats Infima. */
const TINTS_NEED_LIGHT = /\[data-theme=['"]?light/;
const TINTS_LEAVE_DARK = /:not\(\[data-theme=['"]?dark['"]?\]\)/;

/** The rules of a block's text, as { selectors, body }, each selector of a list on its own, trimmed. */
function rulesOf(block) {
  return [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.trim()),
    body: match[2],
  }));
}

/** The text of every `@media print { ... }` block, braces counted. */
function printBlocks(css) {
  const blocks = [];
  for (const match of css.matchAll(/@media\s+print\s*\{/g)) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < css.length && depth > 0) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
      index += 1;
    }
    blocks.push(css.slice(match.index + match[0].length, index - 1));
  }
  return blocks;
}

/** The selector of the rule that declares `token`, or null. */
function selectorDeclaring(css, token) {
  const at = css.indexOf(`${token}:`);
  if (at === -1) return null;
  const open = css.lastIndexOf('{', at);
  const before = css.lastIndexOf('}', open);
  return css.slice(before + 1, open).trim();
}

const codeLines = stripComments(readShared(CODE_LINES_FILE), { regexLiterals: false });
const customRules = stripComments(readShared(CUSTOM_RULES_FILE), { regexLiterals: false });

test('marked code lines print their band exactly, so the premise of the dark rule holds', () => {
  assert.ok((codeLines.match(EXACT) ?? []).length > 0, `no exact print pair in ${CODE_LINES_FILE}: is the dark rule still needed?`);
});

test('in dark, a print gives marked lines and their number cells back to the browser', () => {
  const rules = printBlocks(codeLines).flatMap(rulesOf);
  const rule = rules.find(({ selectors }) => DARK_PRINT_SELECTORS.every((selector) => selectors.includes(selector)));
  assert.ok(rule, `no @media print rule in ${CODE_LINES_FILE} names ${DARK_PRINT_SELECTORS.join(' and ')}`);
  assert.match(rule.body, ECONOMY);
  assert.match(rule.body, WEBKIT_ECONOMY);
});

test('the reader finds a print block, its rules and the selector of a token', () => {
  assert.deepEqual(printBlocks('a { b: c } @media print { x { y: z } } d { e: f }'), [' x { y: z } ']);
  assert.deepEqual(rulesOf(' a .b,\n a .b > c { d: e } f { g: h } '), [
    { selectors: ['a .b', 'a .b > c'], body: ' d: e ' }, { selectors: ['f'], body: ' g: h ' },
  ]);
  assert.equal(selectorDeclaring('a { b: c }\n:root:where(.x) {\n  --t: 1;\n}', '--t'), ':root:where(.x)');
});

test('the alerts\' light tints match a page with no theme set, and never dark mode', () => {
  const selector = selectorDeclaring(customRules, TINT_PROPERTY);
  assert.ok(selector, `${TINT_PROPERTY} is set nowhere in ${CUSTOM_RULES_FILE}`);
  assert.doesNotMatch(selector, TINTS_NEED_LIGHT, `${selector} needs data-theme='light', which MUI's print window lacks`);
  assert.match(selector, TINTS_LEAVE_DARK, `${selector} can match in dark mode`);
  assert.match(selector, /^:root\b/);
});

test('the README and the template\'s site.scss name the tints\' selector, where a site sets its own', () => {
  const selector = selectorDeclaring(customRules, TINT_PROPERTY);
  for (const file of [README_FILE, TEMPLATE_SITE_STYLES]) {
    assert.ok(readShared(file).includes(selector), `${file} does not name ${selector}`);
  }
});
