/**
 * muiTheme.test.mjs: what the site's MUI theme and the code editor's own MUI scope must agree on. The editor
 * carries its own copy of the values in components/CodeEditor/MuiScope.jsx, so that its folder imports nothing
 * outside itself, and a copy that drifts builds without a word: the editor's buttons, menus and tooltips then take
 * other colours than the MUI components around them.
 *   - components/MuiTheme/index.jsx and components/CodeEditor/MuiScope.jsx give the same four colours (each
 *     mode's primary, background and paper; white is both light backgrounds), font, size and radius;
 *   - MuiTheme's header names MuiScope.jsx, and README.md > Silent failures has the row that names both files
 *     and this test.
 * Everything is read as text from this folder's parent: no site file, no stub and no package. So it runs in the
 * hub and on every site, the ones without MuiTheme's stub or the editor's included, and a change to either file
 * goes red in the test:shared of whichever site it was made in.
 *
 * HOW TO CHANGE IT
 *   A new MUI option both themes share: muiValues, and the same option in both files. A file that moved: the
 *   constants below. The README row's words: README_ROW, with the row.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readShared, stripComments } from './sharedTree.mjs';

const MUI_THEME = 'components/MuiTheme/index.jsx';
const MUI_SCOPE = 'components/CodeEditor/MuiScope.jsx';
const README = 'README.md';
const SILENT_FAILURES = '## Silent failures';

/** The Silent failures row: it names MuiScope.jsx, then MuiTheme, then this test. */
const README_ROW = /`components\/CodeEditor\/MuiScope\.jsx`[^\n]*`components\/MuiTheme`[^\n]*`__tests__\/muiTheme\.test\.mjs`/;

/** A colour a file writes as a constant of its own: `const NAME = '#…';`, exported or not. */
const COLOUR_CONSTANT = /const (\w+) = '(#[0-9a-fA-F]{6})';/g;

/**
 * The values an MUI theme file gives both modes: each mode's primary and backgrounds, and the font, size and
 * radius they share. Read from the source, as both files write it:
 * `const LIGHT_OPTIONS = { palette: { primary: { main: … }, background: { default, paper } } }`, frozen or not,
 * a colour either a literal or a `const NAME = '#…'` of the same file.
 */
function muiValues(source, file) {
  const code = stripComments(source);
  const constants = Object.fromEntries([...code.matchAll(COLOUR_CONSTANT)].map((match) => [match[1], match[2]]));
  const colour = (written) => constants[written] ?? written.replace(/'/g, '');
  const block = (name) => {
    const found = new RegExp(`const ${name} = (?:Object\\.freeze\\()?\\{([\\s\\S]*?)\\n\\}\\)?;`).exec(code);
    assert.ok(found, `${file} has ${name}`);
    return found[1];
  };
  const mode = (name) => {
    const options = block(name);
    const primary = /primary: \{ main: ([^ }]+) \}/.exec(options);
    const background = /background: \{ default: '([^']+)', paper: '([^']+)' \}/.exec(options);
    assert.ok(primary && background, `${file}: ${name} has a primary and two backgrounds`);
    return { primary: colour(primary[1]), background: [background[1], background[2]] };
  };
  const shared = block('SHARED_OPTIONS');
  return {
    light: mode('LIGHT_OPTIONS'),
    dark: mode('DARK_OPTIONS'),
    fontFamily: /fontFamily: '([^']+)'/.exec(shared)?.[1],
    fontSize: Number(/fontSize: (\d+)/.exec(shared)?.[1]),
    borderRadius: Number(/borderRadius: (\d+)/.exec(shared)?.[1]),
  };
}

/** One chapter of the README: from its heading to the next heading of the same level. */
function chapter(text, heading) {
  const start = text.indexOf(`\n${heading}\n`);
  assert.ok(start >= 0, `${README} has ${heading}`);
  const next = text.indexOf('\n## ', start + heading.length + 1);
  return text.slice(start, next === -1 ? undefined : next);
}

test("MuiTheme and the editor's MuiScope give the same palette, font, size and radius, and shared/README.md says to keep them so", () => {
  const theme = muiValues(readShared(MUI_THEME), MUI_THEME);
  const scope = muiValues(readShared(MUI_SCOPE), MUI_SCOPE);
  assert.ok(theme.fontFamily && theme.fontSize > 0 && theme.borderRadius > 0, `${MUI_THEME} gives a font, a size and a radius`);
  assert.deepEqual(scope, theme, `${MUI_SCOPE} is a copy of ${MUI_THEME}'s values: change both together`);
  assert.ok(readShared(MUI_THEME).includes('CodeEditor/MuiScope.jsx'), `${MUI_THEME}'s header names ${MUI_SCOPE}`);
  assert.match(chapter(readShared(README), SILENT_FAILURES), README_ROW, `${README} > Silent failures has the row`);
});
