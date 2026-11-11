/**
 * codeEditorTokens.test.mjs: what the code editor and the shared wiring and stylesheets must agree
 * on. The editor carries its own copies, so that it works on a site without the shared styles, and
 * a copy that drifts builds without a word and only shows on a page.
 *   - MAGIC_COMMENTS of wiring/index.cjs, which a site's config hands to Prism, against the editor's
 *     list in lib/codeRunner/magicComments.js: entry for entry, in the same order. The editor's
 *     entries also carry a `kind`, which Docusaurus does not read.
 *   - Each code-line token of css/_code-blocks.scss, light and dark, against the editor's
 *     styles.module.css: the fallback on its light and dark frame rules, and the literal it declares
 *     for a theme in the other mode than the site's.
 *   - css/custom.scss sets the editor's font.
 * Everything here is read from this folder's parent: no site file, no stub and no package. So it
 * runs in the hub and on a site that does not use the editor, whose editor suites are left out.
 *
 * HOW TO CHANGE IT
 *   A colour: css/_code-blocks.scss, then the editor's values, which this test names. A new kind of
 *   marked line: both MAGIC_COMMENTS lists. A new token: the one list of them, in
 *   components/CodeEditor/__tests__/codeLineTokens.js. A rule of the editor's that moved:
 *   LIGHT_FRAME, DARK_FRAME or OTHER_MODE_FRAMES. A file that moved: the constants below.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { CODE_LINE_TOKENS } from '../components/CodeEditor/__tests__/codeLineTokens.js';
import { MAGIC_COMMENTS as EDITOR_COMMENTS } from '../components/CodeEditor/lib/codeRunner/magicComments.js';
import { readShared, stripComments } from './sharedTree.mjs';

const require = createRequire(import.meta.url);
const { MAGIC_COMMENTS: WIRED_COMMENTS } = require('../wiring/index.cjs');

const CODE_LINES_FILE = 'css/_code-blocks.scss';
const CUSTOM_RULES_FILE = 'css/custom.scss';
const EDITOR_STYLES = 'components/CodeEditor/styles.module.css';

/** The two selectors a site's light and dark values sit under. */
const LIGHT_SITE = ':root';
const DARK_SITE = "html[data-theme='dark']";

/** The editor's frame rules. The dark one is a selector list, so a selector holding it counts. */
const LIGHT_FRAME = '.frame';
const DARK_FRAME = ".frame[data-ce-mode='dark']";

/** The rules that declare the site's token names on a frame in the other mode, by the frame's mode. */
const OTHER_MODE_FRAMES = Object.freeze({
  dark: ":global(html:not([data-theme='dark'])) .frame[data-ce-mode='dark']",
  light: ":global(html[data-theme='dark']) .frame[data-ce-mode='light']",
});

/** The variable the editor reads for its font, and the stack that must come first in it. */
const FONT_VARIABLE = '--ce-font-family';
const FONT_FIRST = /^'IBM Plex Mono', /;

/** A rule with no block inside it: its selector, then its body. */
const RULE = /([^{}]+)\{([^{}]*)\}/g;

/** An entry of the editor's list, as the wiring writes it. */
function withoutKind({ kind, ...comment }) {
  return comment;
}

/** A stylesheet without its comments. */
function styleText(file) {
  return stripComments(readShared(file), { regexLiterals: false });
}

/** Every innermost rule of a stylesheet, as { selector, body }. */
function rulesOf(css) {
  return [...css.matchAll(RULE)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
}

/** The selectors of a rule. Only the last line counts, since a Sass map may come before it. */
function selectorsOf(rule) {
  return rule.selector.split('\n').pop().split(',').map((part) => part.trim());
}

/** The value of `property` in the first rule of an SCSS file that lists `selector`. */
function scssValue(css, selector, property) {
  for (const rule of rulesOf(css).filter((candidate) => selectorsOf(candidate).includes(selector))) {
    const match = rule.body.match(new RegExp(`${property}:\\s*([^;]+);`));
    if (match) return match[1].trim();
  }
  return assert.fail(`${selector} declares ${property}`);
}

/** The frame rule of a mode. */
function frameRule(rules, mode) {
  const isFrame = ({ selector }) => (mode === 'dark' ? selector.includes(DARK_FRAME) : selector === LIGHT_FRAME);
  const rule = rules.find(isFrame);
  assert.ok(rule, `styles.module.css has the ${mode} frame rule`);
  return rule;
}

/** The editor's fallback for a token in a mode: `--ce-line-<token>: var(--code-line-<token>, <value>)`. */
function editorFallback(rules, mode, token) {
  const pattern = new RegExp(`--ce-line-${token}: var\\(--code-line-${token}, ([^;]+)\\);`);
  const value = frameRule(rules, mode).body.match(pattern)?.[1];
  assert.ok(value, `the ${mode} frame rule reads --code-line-${token} with a fallback`);
  return value.trim();
}

/** The literal the editor declares for a site token on a frame in the other mode. */
function otherModeLiteral(rules, frameMode, token) {
  const selector = OTHER_MODE_FRAMES[frameMode];
  const rule = rules.find((candidate) => candidate.selector === selector);
  assert.ok(rule, `styles.module.css has the rule ${selector}`);
  const value = rule.body.match(new RegExp(`--code-line-${token}: ([^;]+);`))?.[1];
  assert.ok(value, `${selector} declares --code-line-${token}`);
  return value.trim();
}

test("the editor's MAGIC_COMMENTS equal wiring/index.cjs's, entry for entry and in the same order", () => {
  assert.ok(WIRED_COMMENTS.length > 0, 'no magic comments read from wiring/index.cjs');
  assert.deepEqual(EDITOR_COMMENTS.map(withoutKind), WIRED_COMMENTS);
});

test("the editor's built-in code-line fallbacks equal this site's tokens, light and dark (and its other-mode literals)", (t) => {
  const scss = styleText(CODE_LINES_FILE);
  const rules = rulesOf(styleText(EDITOR_STYLES));
  for (const token of CODE_LINE_TOKENS) {
    const light = scssValue(scss, LIGHT_SITE, `--code-line-${token}`);
    const dark = scssValue(scss, DARK_SITE, `--code-line-${token}`);
    assert.equal(editorFallback(rules, 'light', token), light, `--code-line-${token}: the light fallback is the site's`);
    assert.equal(editorFallback(rules, 'dark', token), dark, `--code-line-${token}: the dark fallback is the site's`);
    assert.equal(otherModeLiteral(rules, 'dark', token), dark, `a dark theme on the light site: --code-line-${token} is the site's dark value`);
    assert.equal(otherModeLiteral(rules, 'light', token), light, `a light theme on the dark site: --code-line-${token} is the site's light value`);
  }
  t.diagnostic(`${CODE_LINE_TOKENS.length} tokens compared`);
});

test("custom.scss sets the editor's font (--ce-font-family), the multi-weight IBM Plex Mono first", () => {
  assert.match(scssValue(styleText(CUSTOM_RULES_FILE), LIGHT_SITE, FONT_VARIABLE), FONT_FIRST);
});
