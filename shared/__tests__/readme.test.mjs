/**
 * readme.test.mjs: README.md says what is true. People paste from it, and a site's own page about
 * shared/ is written from it, so a stale line costs a broken command.
 *   - The Commands table and the printed package.json lines name the same commands, in the same order.
 *   - Every `npm run` anywhere in the README is one of those commands.
 *   - A printed line runs a script in scripts/, or the README's "Not built yet" line names it. A name
 *     stays on that line only until its script lands: then the test goes red.
 *   - Every script at the top of scripts/ has a line, apart from NO_NPM_LINE.
 *   - Every option the README shows beside a command is in that script's own --help, and so is every
 *     option of its sections on check-public.mjs, check-mui-api.mjs and mdx-check.mjs, which have no npm line.
 *   - The git lines use scripts/lib/settings.mjs, the config block's names are what wiring/index.cjs
 *     exports and its paths are relative strings, every path in What is here exists, and there are
 *     five rules. The clear rule, there, in Silent failures and in the two wiring headers, says that a plain
 *     restart shows a macros change on docs pages alone; there, in Silent failures and in wiring/index.cjs,
 *     that blog posts keep the old lists too and magic comments change everywhere, never that a restart and
 *     a cached build keep the old macros and lists (they take part of it). A change under plugins/ names a
 *     restart, in the README and in the plugin's own header. The hot-update line says what a JS or MDX edit
 *     loses (text typed without saveDraft) and that a fixed syntax error in an editor file needs a reload.
 *     The compare's example of what it cannot see is a property it does not read (a text shadow).
 *   - In a site, a line the site holds equals the printed one. A site may lack a line, because a site
 *     takes the commands in steps. A site's own lines are the site's business.
 *   - A config line that names a plugin of the site's own (requirements.cjs > needsConfig, PDFViewer's
 *     my-loaders) is printed under Mount it on a site with the plugin's two files and its package.json line.
 *   - Every exit code the stops table names is the one the scripts use.
 *   - The undo lines are the ones status prints, a raw reset or subtree line follows the index refresh,
 *     a pull's revert keeps -m 1, and no draft note is left.
 *   - The chapters a reader looks for are there, Silent failures names only real status lines, and a run
 *     of shared:all says which of its two sets of Undo and Next lines to act on.
 *
 * HOW TO CHANGE IT
 *   A new command: a row in the Commands table and a line in the package.json block. A script a build
 *   or a person runs by its path: NO_NPM_LINE. A line every site writes for itself: SITE_OWN_LINES.
 *   A renamed section of the README: the *_HEADING constants or CHAPTERS. A row of the stops table that names an
 *   exit code: ROW_EXITS. A changed undo: the *_LINE constants, the README and status together.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MARKERS_RESTORE, hubCheck, markersCheck } from '../scripts/lib/checks.mjs';
import { COMPUTED_PROPERTIES } from '../scripts/lib/compareSettings.mjs';
import { EXIT } from '../scripts/lib/exitCodes.mjs';
import { BRANCH, PREFIX, REMOTE, REMOTE_URL } from '../scripts/lib/settings.mjs';
import { STATES } from '../scripts/lib/state.mjs';
import { SHARED_ROOT, hostSite, readShared } from './sharedTree.mjs';

const require = createRequire(import.meta.url);
const wiring = require('../wiring/index.cjs');

const README_FILE = 'README.md';
const COMMANDS_HEADING = 'Commands';
const CONTENTS_HEADING = 'What is here';
const RULES_HEADING = 'The five rules';
const NEVER_IN_HEADING = 'What never goes in';
const MOUNT_HEADING = 'Mount it on a site';
const STOPS_HEADING = 'When a pull or push stops';
const UNDO_HEADING = 'Undo a bad pull';
const PUBLIC_HEADING = 'Before a public site goes out';
const MUI_HEADING = 'Old MUI names';
const MDX_HEADING = 'MDX check';
const EVERY_SITE_HEADING = 'Every site at once';
const SILENT_HEADING = 'Silent failures';
const COMPARE_HEADING = 'Compare two builds';
const UPDATE_HEADING = 'Update Docusaurus';

/** What the shared:all row says of its stops: a red, a list to read and a conflict all stop it. */
const ALL_STOPS = 'stops at the first site that is not green';
const KEEP_STEP = '. keep the old build outside the site';
const PULL_STEP = '. pull the hub;';
const ALL_SITE_FILE = 'scripts/lib/allSite.mjs';

/** The chapters a reader looks for by name. */
const CHAPTERS = Object.freeze([
  'Make a new site', 'Join an existing site', 'Remove a site', 'Hold a site back', 'Update Docusaurus',
  SILENT_HEADING, 'Docusaurus 4 notes', MDX_HEADING,
]);

const RULE_COUNT = 5;
const TEMPLATE_EXCEPTION = 'apart from `shared/template/`';

/** The rows of the stops table that name an exit code, and the code each must name. */
const ROW_EXITS = Object.freeze({
  'A conflict in a pull': EXIT.CONFLICT,
  'A push landed, the rejoin did not': EXIT.NOT_REJOINED,
  'The hub out of reach': EXIT.GIT,
  'A push the hub rejects': EXIT.GIT,
});

const REFRESH_LINE = 'git update-index -q --refresh';
const RESET_LINE = 'git reset --keep HEAD~1';
/** The line that lists the files of a person's own a pull's merge took in, before its reset. */
const TAKEN_IN_LINE = "git diff --name-only --diff-filter=AM HEAD~1 HEAD -- . ':(exclude)shared'";
const SUBTREE_ADD = 'git subtree add';
const PULL_LINE = 'npm run shared:pull';
const REVERT_LINE = 'git revert --no-edit';
const REVERT_PULL_LINE = 'git revert -m 1 --no-edit';
const MINUS_TWO_WARNING = '`-m 2` takes the whole site away';
const KEEP_SHARED = 'Keep `shared/` in every commit';
const DRAFT_WORD = /\bDRAFT\b/;
const ROW_EXIT = /, exit \d+ \|/g;
const SHORT_SHA_LENGTH = 7;
const CONFLICT_MARKER = `${'<'.repeat(7)} HEAD`;

/** Lines of package.json every site writes for itself: `shared:verify` runs that site's own suites. */
const SITE_OWN_LINES = new Set(['shared:verify']);

/** Scripts a site's build or a person runs by their path, so no npm line points at them. */
const NO_NPM_LINE = new Set(['check-public.mjs', 'check-mui-api.mjs', 'mdx-check.mjs']);

const SCRIPTS_FOLDER = 'scripts';
const HELP_FLAG = '--help';
const PUBLIC_CHECK = 'check-public.mjs';
const MUI_CHECK = 'check-mui-api.mjs';
const MDX_CHECK = 'mdx-check.mjs';
const CHECKS_FILE = 'scripts/lib/checks.mjs';
const TWO_SETS_OF_LINES = 'its undo leaves the pull in place';

const JSON_BLOCK = /```json\n([\s\S]*?)```/;
const JS_BLOCK = /```js\n([\s\S]*?)```/;
const TABLE_COMMAND = /^\| `npm run ([^`\s]+)` \|/gm;
const TABLE_PATH = /^\| `([^`]+)` \|/gm;
const NOT_BUILT_LINE = /^Not built yet: (.+)\.$/m;
const CODE_SPAN = /`([^`]+)`/g;
const NUMBERED_LINE = /^\d+\. /gm;
/** A needsConfig text that is a plugin's package name, not a wiring helper's call: the site itself holds that plugin. */
const OWN_PLUGIN_LINE = /^[\w-]+$/;
const COMMAND_NAME = /^[\w:-]+/;
const OPTION = /(?<![\w-])--?[a-z][a-z-]*/g;
const WIRING_NAMES = /const \{([^}]*)\} = require\('\.\/shared\/wiring\/index\.cjs'\)/;
/** Writes an absolute path into the site's main chunk, where a public site publishes it. */
const ABSOLUTE_PATH_CALL = 'require.resolve';
/** The stylesheets the config block gives Docusaurus, as a site copies them. */
const CUSTOM_CSS_LINE = "customCss: ['./shared/css/custom.scss', './src/css/site.scss'],";
const NPM_RUN = 'npm run ';
const SCRIPT_LINE = new RegExp(`^node ${PREFIX}/${SCRIPTS_FOLDER}/([\\w-]+\\.mjs)$`);

const README = readShared(README_FILE);

/** The text under a `## heading`, up to the next one. */
function section(heading) {
  const opening = `\n## ${heading}\n`;
  const start = README.indexOf(opening);
  assert.notEqual(start, -1, `${README_FILE} has no section "${heading}"`);
  const rest = README.slice(start + opening.length);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

/** The package.json block the README prints. */
function printedPackage() {
  const block = section(MOUNT_HEADING).match(JSON_BLOCK);
  assert.ok(block, `${README_FILE} prints no package.json block under "${MOUNT_HEADING}"`);
  return JSON.parse(block[1]);
}

/** The printed lines a site shares with every other site: name to command. */
function sharedLines() {
  const entries = Object.entries(printedPackage().scripts);
  return Object.fromEntries(entries.filter(([name]) => !SITE_OWN_LINES.has(name)));
}

/** The commands the Commands table lists, in its order. */
function tableCommands() {
  return [...section(COMMANDS_HEADING).matchAll(TABLE_COMMAND)].map((match) => match[1]);
}

/** The commands the "Not built yet" line names. No line means every script has landed. */
function notBuilt() {
  const line = section(COMMANDS_HEADING).match(NOT_BUILT_LINE);
  return line === null ? [] : [...line[1].matchAll(CODE_SPAN)].map((match) => match[1]);
}

/** The script a printed line runs, as a file name in scripts/. */
function scriptOf(name, line) {
  const match = line.match(SCRIPT_LINE);
  assert.ok(match, `${name} should read "node ${PREFIX}/${SCRIPTS_FOLDER}/<file>.mjs", and reads "${line}"`);
  return match[1];
}

function scriptExists(file) {
  return fs.existsSync(path.join(SHARED_ROOT, SCRIPTS_FOLDER, file));
}

/** Every `npm run` in the README, with the options written after it, up to the next one. */
function mentions() {
  const found = [];
  for (const line of README.split('\n')) {
    for (const piece of line.split(NPM_RUN).slice(1)) {
      found.push({ name: piece.match(COMMAND_NAME)[0], options: piece.match(OPTION) ?? [] });
    }
  }
  return found;
}

/**
 * The options a script's --help lists, as whole words. It runs --help and nothing else, because a real
 * option would make the script act. An empty environment, so that npm's variables stay out of it.
 */
function usageOptions(file) {
  const args = [path.join(SHARED_ROOT, SCRIPTS_FOLDER, file), HELP_FLAG];
  const { stdout } = spawnSync(process.execPath, args, { encoding: 'utf8', env: {} });
  return new Set(stdout.match(OPTION) ?? []);
}

/** The names the config block takes from the wiring. */
function wiringNames() {
  const block = section(MOUNT_HEADING).match(JS_BLOCK);
  assert.ok(block, `${README_FILE} prints no config block under "${MOUNT_HEADING}"`);
  const list = block[1].match(WIRING_NAMES);
  assert.ok(list, 'the config block does not require wiring/index.cjs');
  return list[1].split(',').map((name) => name.trim()).filter(Boolean);
}

/** A sentence for each shared line a site holds in another form. */
function differingLines(printed, siteScripts) {
  const held = Object.keys(printed).filter((name) => siteScripts[name] !== undefined);
  const differing = held.filter((name) => siteScripts[name] !== printed[name]);
  return differing.map((name) => `${name} reads "${siteScripts[name]}", and ${README_FILE} prints "${printed[name]}"`);
}

test('the table and the package.json lines name the same commands, in the same order', () => {
  const printed = Object.keys(printedPackage().scripts);
  assert.ok(printed.length > 0, 'the package.json block has no scripts');
  assert.deepEqual(tableCommands(), printed);
});

test('the block holds the lines a site writes for itself', () => {
  const { scripts, comparePages } = printedPackage();
  for (const name of SITE_OWN_LINES) assert.ok(scripts[name], `the package.json block lacks ${name}`);
  assert.ok(Array.isArray(comparePages), 'the package.json block lacks comparePages');
});

test('every npm run in the README is a printed line', () => {
  const printed = printedPackage().scripts;
  const unknown = mentions().filter(({ name }) => printed[name] === undefined);
  assert.deepEqual(unknown.map(({ name }) => name), []);
});

test('every printed line runs a script that exists, or is on the "Not built yet" line', () => {
  const waiting = new Set(notBuilt());
  const lines = Object.entries(sharedLines());
  const missing = lines.filter(([name, line]) => !scriptExists(scriptOf(name, line)) && !waiting.has(name));
  assert.deepEqual(missing.map(([name, line]) => `${name}: ${line}`), []);
});

test('the "Not built yet" line names only commands still waiting for their script', () => {
  const lines = sharedLines();
  for (const name of notBuilt()) {
    assert.ok(lines[name], `"Not built yet" names ${name}, which is no printed line`);
    const file = scriptOf(name, lines[name]);
    const stale = `${SCRIPTS_FOLDER}/${file} exists: take ${name} out of the "Not built yet" line in ${README_FILE}`;
    assert.equal(scriptExists(file), false, stale);
  }
});

test('every script has a printed line', () => {
  const printed = new Set(Object.entries(sharedLines()).map(([name, line]) => scriptOf(name, line)));
  const entries = fs.readdirSync(path.join(SHARED_ROOT, SCRIPTS_FOLDER));
  const scripts = entries.filter((file) => file.endsWith('.mjs') && !NO_NPM_LINE.has(file));
  assert.deepEqual(scripts.filter((file) => !printed.has(file)), []);
});

test('every option the README shows is in that script\'s --help', () => {
  const lines = sharedLines();
  const shown = mentions().filter(({ name, options }) => lines[name] && options.length > 0);
  assert.ok(shown.length > 0, 'the README shows no option, so this test read nothing');
  for (const { name, options } of shown) {
    const file = scriptOf(name, lines[name]);
    if (!scriptExists(file)) continue;
    const listed = usageOptions(file);
    for (const option of options) assert.ok(listed.has(option), `${name} --help does not list ${option}`);
  }
});

/** A section on a script with no npm line shows options, and that script's --help lists each. */
function assertSectionOptions(heading, file) {
  const shown = section(heading).match(OPTION) ?? [];
  assert.ok(shown.length > 0, 'the section shows no option, so this test read nothing');
  const listed = usageOptions(file);
  for (const option of shown) assert.ok(listed.has(option), `${file} --help does not list ${option}`);
}

test('every option the section on the public check shows is in its --help', () => {
  assertSectionOptions(PUBLIC_HEADING, PUBLIC_CHECK);
});

test('every option the section on old MUI names shows is in its --help', () => {
  assertSectionOptions(MUI_HEADING, MUI_CHECK);
});

test('the section on old MUI names prints the line a site runs', () => {
  assert.ok(section(MUI_HEADING).includes(`\nnode ${PREFIX}/${SCRIPTS_FOLDER}/${MUI_CHECK}\n`));
});

test('every option the section on the MDX check shows is in its --help', () => {
  assertSectionOptions(MDX_HEADING, MDX_CHECK);
});

test('the section on the MDX check prints the line a site runs', () => {
  assert.ok(section(MDX_HEADING).includes(`\nnode ${PREFIX}/${SCRIPTS_FOLDER}/${MDX_CHECK}\n`));
});

test('the section on the compare says what it cannot see', () => {
  const words = section(COMPARE_HEADING);
  for (const word of ['attribute', '`title`', 'diff the two `build/` folders']) assert.ok(words.includes(word), word);
});

test('the chapters a reader looks for are there', () => {
  for (const chapter of CHAPTERS) assert.ok(section(chapter).trim().length > 0, chapter);
});

test('every status line Silent failures names is a real check', () => {
  const lines = [...section(SILENT_HEADING).matchAll(TABLE_PATH)].map((match) => match[1]);
  assert.ok(lines.length > 0, `"${SILENT_HEADING}" names no status line`);
  const checks = readShared(CHECKS_FILE);
  const isCheck = (line) => new RegExp(`\\b(?:ok|warn|fail|info)\\('${line}'`).test(checks);
  assert.deepEqual(lines.filter((line) => !isCheck(line)), []);
});

test('a run of shared:all says which of its two sets of lines to act on', () => {
  assert.ok(section(EVERY_SITE_HEADING).includes(TWO_SETS_OF_LINES));
});

test('the git lines use the names the scripts use', () => {
  const lines = section(MOUNT_HEADING);
  assert.ok(lines.includes(`git remote add ${REMOTE} ${REMOTE_URL}\n`), 'the remote line differs from settings.mjs');
  const subtreeAdd = `git subtree add --prefix ${PREFIX} ${REMOTE} ${BRANCH} --squash\n`;
  assert.ok(lines.includes(subtreeAdd), 'the subtree line differs from settings.mjs');
});

test('the config block names what wiring/index.cjs exports', () => {
  const names = wiringNames();
  assert.ok(names.length > 0, 'the config block names nothing from the wiring');
  assert.deepEqual(names.filter((name) => wiring[name] === undefined), []);
});

test('the clear rule says a plain restart shows a macros change on docs pages and not on the pages plugin\'s', () => {
  const places = {
    [MOUNT_HEADING]: section(MOUNT_HEADING),
    [SILENT_HEADING]: section(SILENT_HEADING),
    'wiring/index.cjs': readShared('wiring/index.cjs'),
    'wiring/katex-macros.cjs': readShared('wiring/katex-macros.cjs'),
  };
  for (const [place, text] of Object.entries(places)) {
    const words = text.replace(/\s*\n\s*\*?\s*/g, ' ');
    assert.ok(/plain restart/.test(words) && /docs pages/.test(words) && /pages of the pages plugin keep the old macros/.test(words), place);
  }
});

test('the clear rule says blog posts keep the old lists too and magic comments change on every page, never that a restart keeps it all', () => {
  const places = {
    [MOUNT_HEADING]: section(MOUNT_HEADING),
    [SILENT_HEADING]: section(SILENT_HEADING),
    'wiring/index.cjs': readShared('wiring/index.cjs'),
  };
  for (const [place, text] of Object.entries(places)) {
    const words = text.replace(/\s*\n\s*\*?\s*/g, ' ');
    assert.ok(/magic comments/i.test(words) && /blog posts/.test(words), `${place}: names magic comments and blog posts`);
    assert.ok(!/a cached build keep the old macros and lists/.test(words), `${place}: a plain restart and a cached build take part of such a change`);
  }
});

/** The bullet of the mount section that holds `words`, with its line breaks read as spaces ('' when none does). */
function mountBullet(words) {
  const bullets = section(MOUNT_HEADING).split('\n- ').map((bullet) => bullet.replace(/\s*\n\s*/g, ' '));
  return bullets.find((bullet) => bullet.includes(words)) ?? '';
}

test('a change under plugins/ names a restart of the dev server, in the README and in the plugin\'s own header', () => {
  const bullet = mountBullet('`plugins/`');
  const sentence = bullet.split(/(?<=\.) /).find((part) => part.includes('`plugins/`')) ?? '';
  assert.match(sentence, /restart/, 'the sentence that names plugins/ names the restart');
  const header = readShared('plugins/monaco-editor/index.js').split('*/')[0];
  assert.match(header.replace(/\s*\n\s*\*?\s*/g, ' '), /restart `npm start`/, "the plugin's header says to restart");
});

test('the hot-update line says a JS or MDX edit loses text typed without saveDraft, and that a fixed syntax error needs a reload', () => {
  const bullet = mountBullet('CSS modules hot-update');
  assert.ok(bullet, 'the mount section says what hot-updates');
  assert.match(bullet, /`saveDraft`/, 'it names saveDraft');
  assert.match(bullet, /typed into a code editor without `saveDraft` is lost/, 'and that typed text is lost without it');
  assert.match(bullet, /fix a syntax error[^.]*Retry does not bring them back: reload the page/, 'a fixed syntax error in an editor file: reload the page');
});

test("the compare's example of what it cannot see is a property it does not read", () => {
  const words = section(COMPARE_HEADING).replace(/\s*\n\s*/g, ' ');
  assert.ok(COMPUTED_PROPERTIES.includes('boxShadow'), 'a box shadow is read, so "a shadow" alone would be wrong');
  assert.ok(!COMPUTED_PROPERTIES.includes('textShadow'));
  assert.match(words, /such as a text shadow/);
  assert.doesNotMatch(words, /such as a shadow/);
});

test('the config block gives Docusaurus relative strings, and says why', () => {
  const block = section(MOUNT_HEADING).match(JS_BLOCK)[1];
  assert.ok(!block.includes(ABSOLUTE_PATH_CALL), `the config block shows ${ABSOLUTE_PATH_CALL}, which a site would copy`);
  assert.ok(block.includes(CUSTOM_CSS_LINE), 'the config block lacks the customCss line');
  const reason = `\`${ABSOLUTE_PATH_CALL}\` puts this machine's path in the main chunk`;
  assert.ok(section(MOUNT_HEADING).includes(reason), 'the section does not say why');
});

test('every path in What is here exists', () => {
  const paths = [...section(CONTENTS_HEADING).matchAll(TABLE_PATH)].map((match) => match[1]);
  assert.ok(paths.length > 0, `"${CONTENTS_HEADING}" lists no path`);
  assert.deepEqual(paths.filter((name) => !fs.existsSync(path.join(SHARED_ROOT, name))), []);
});

test('the five rules are five, and the never-in list keeps its one exception', () => {
  assert.equal(section(RULES_HEADING).match(NUMBERED_LINE)?.length, RULE_COUNT);
  assert.ok(section(NEVER_IN_HEADING).includes(TEMPLATE_EXCEPTION));
});

test('a line a site holds is compared with the printed one, and a line it lacks is not', () => {
  const printed = { 'shared:pull': 'node shared/scripts/pull.mjs', 'shared:push': 'node shared/scripts/push.mjs' };
  assert.deepEqual(differingLines(printed, { 'shared:pull': printed['shared:pull'], start: 'other' }), []);
  const [sentence, ...rest] = differingLines(printed, { 'shared:pull': 'node elsewhere.mjs' });
  assert.match(sentence, /^shared:pull reads "node elsewhere\.mjs"/);
  assert.deepEqual(rest, []);
});

test('the README holds no draft note', () => {
  assert.doesNotMatch(README, DRAFT_WORD);
});

test('every exit code the README names is the one the scripts use', () => {
  const rows = section(STOPS_HEADING);
  for (const [row, code] of Object.entries(ROW_EXITS)) {
    assert.ok(rows.includes(`| ${row}, exit ${code} |`), `the row "${row}" should end in exit ${code}`);
  }
  assert.equal(rows.match(ROW_EXIT)?.length, Object.keys(ROW_EXITS).length);
});

test('the undo of a pull is the line status prints', () => {
  const texts = () => [{ path: 'a', text: CONFLICT_MARKER }];
  const { fix } = markersCheck({ root: os.tmpdir(), env: process.env, texts });
  assert.ok(fix.includes(`${RESET_LINE}, then ${PULL_LINE}`), `status prints "${fix}"`);
  assert.ok(section(STOPS_HEADING).includes(RESET_LINE), 'the stops table lacks the undo');
  assert.ok(section(UNDO_HEADING).includes(RESET_LINE), `"${UNDO_HEADING}" lacks the undo`);
});

test('the undo of a pull names the restore of the files a git add -A took in, as status prints it', () => {
  assert.ok(section(STOPS_HEADING).includes(`\`${MARKERS_RESTORE}<the merge's sha> -- <file>\``), 'the stops table lacks the restore');
  const undo = section(UNDO_HEADING);
  assert.ok(undo.includes(`${MARKERS_RESTORE}<that sha> -- <each file>\n`), `"${UNDO_HEADING}" lacks the restore`);
  assert.ok(undo.indexOf(TAKEN_IN_LINE) < undo.indexOf(`${REFRESH_LINE}\n${RESET_LINE}\n${MARKERS_RESTORE}`), 'the list comes before the reset');
});

test('the Commands row of shared:all says it stops at any site that is not green, as the stops table does', () => {
  const row = section(COMMANDS_HEADING).split('\n').find((line) => line.startsWith('| `npm run shared:all` |'));
  assert.ok(row, 'no shared:all row');
  assert.ok(row.includes(ALL_STOPS), `the row should say "${ALL_STOPS}": ${row}`);
  assert.ok(section(EVERY_SITE_HEADING).includes('| `a list to read` | 8 |'), 'the stops table lacks the list to read');
});

test('the bump\'s steps keep the old build before the pull, as shared:all runs them', () => {
  const steps = section(UPDATE_HEADING);
  assert.ok(steps.indexOf(KEEP_STEP) !== -1 && steps.indexOf(PULL_STEP) !== -1, 'a step is missing');
  assert.ok(steps.indexOf(KEEP_STEP) < steps.indexOf(PULL_STEP), 'the list pulls before it keeps the old build');
  const run = readShared(ALL_SITE_FILE);
  assert.ok(run.indexOf('await keepOldBuild(job)') < run.indexOf('await pullSite('), `${ALL_SITE_FILE} changed its order`);
});

test('the way back after a revert is the line status prints', () => {
  const revert = 'a'.repeat(40);
  const state = { state: STATES.AHEAD, upstream: revert, outgoing: [], incoming: [], leaks: [], revert };
  const [{ fix }] = hubCheck({ state: () => state, wordList: () => ({ words: [] }), offline: false });
  assert.ok(fix.includes(`${REVERT_LINE} ${revert.slice(0, SHORT_SHA_LENGTH)}, then ${PULL_LINE}`), `status prints "${fix}"`);
  assert.ok(section(UNDO_HEADING).includes(`${REVERT_LINE} <the revert's sha>\n${PULL_LINE}\n`));
});

test('the index is refreshed before a raw subtree add and a raw reset', () => {
  assert.ok(section(MOUNT_HEADING).includes(`${REFRESH_LINE}\n${SUBTREE_ADD}`), 'the mount lines lack the refresh');
  assert.ok(section(UNDO_HEADING).includes(`${REFRESH_LINE}\n${RESET_LINE}`), 'the undo lines lack the refresh');
});

test('a pull is reverted with -m 1, and -m 2 stays warned about', () => {
  const undo = section(UNDO_HEADING);
  assert.ok(undo.includes(REVERT_PULL_LINE), `"${UNDO_HEADING}" lacks ${REVERT_PULL_LINE}`);
  assert.ok(undo.includes(MINUS_TWO_WARNING), `"${UNDO_HEADING}" lacks the warning about -m 2`);
});

test('the README says to keep shared/ in every commit', () => {
  assert.ok(section(UNDO_HEADING).includes(KEEP_SHARED));
});

test("a config line that names a plugin of the site's own is printed with that plugin's files, and its row says where", () => {
  const { ENTRIES } = require('../requirements.cjs');
  const own = ENTRIES.flatMap((row) => row.needsConfig ?? []).filter(({ text }) => OWN_PLUGIN_LINE.test(text));
  assert.ok(own.length > 0, 'no row asks for such a line any more: this test can go');
  const mount = section(MOUNT_HEADING);
  for (const { text, what } of own) {
    for (const words of [`'${text}'`, `plugins/${text}/index.js`, `plugins/${text}/package.json`, `"${text}": "file:plugins/${text}"`]) {
      assert.ok(mount.includes(words), `${README_FILE} > ${MOUNT_HEADING} lacks ${words}`);
    }
    assert.ok(what.includes(`${README_FILE} > ${MOUNT_HEADING}`), `${text}: its row does not say where the plugin is printed`);
  }
});

const host = hostSite();

test('this site: its lines equal the printed ones', { skip: host === null ? 'outside a site' : false }, () => {
  const { scripts = {} } = JSON.parse(fs.readFileSync(path.join(host, 'package.json'), 'utf8'));
  assert.deepEqual(differingLines(sharedLines(), scripts), []);
});
