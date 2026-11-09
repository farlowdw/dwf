/**
 * privacy.test.mjs: nothing private sits in shared/, which is public through one of the sites. The
 * scan itself is scripts/lib/privacy.mjs, the one every script uses; here it runs over the real
 * tree and over plants. This file holds the shapes of secrets, so the shapes skip it by name; the word
 * list still reads it. Binary files are read too, for words alone.
 *   - A fixture word list, written to a temporary folder, always runs, so the test works on any
 *     machine. The machine's own list runs too when it exists, and says nothing about its words: a
 *     hit prints where it is and the word's line number in the list.
 *   - Every secret shape has a plant here. Each plant is put together when the test runs, so that
 *     no scanner of a public host takes this file for a leak.
 *
 * HOW TO CHANGE IT
 *   A new shape in scripts/lib/privacy.mjs: a row in PLANTS, under the shape's exact name (a test
 *   fails until it has one). New words go in the list on the machine, never in this repository.
 * Run with `npm run test:shared`, or on its own with `node --test "__tests__/*.test.mjs"` in the hub.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SECRET_SHAPES, describeHit, isOwnFile, readTexts, readWordList, scanNames, scanTexts,
} from '../scripts/lib/privacy.mjs';
import { PREFIX, wordListPath } from '../scripts/lib/settings.mjs';
import { SHARED_ROOT, sharedFiles } from './sharedTree.mjs';

/** Invented words for the fixture list, joined at run time: the word list reads this file too. */
const PLANTED_WORD = ['quokka', 'plume'].join('');
const ALLOWED_WORD = ['wombat', 'lantern'].join('');
const ALLOWED_IN = 'shared/docs/allowed.md';

const FIXTURE_LIST = [
  '# a comment, which is no word',
  '',
  PLANTED_WORD,
  `${ALLOWED_WORD}\t${ALLOWED_IN}`,
].join('\n');

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ';

/** `count` letters and digits that are nobody's key. */
function filler(count) {
  return LETTERS.repeat(Math.ceil(count / LETTERS.length)).slice(0, count);
}

/** One plant per shape, by the shape's name. Pieces are joined here and nowhere in the file. */
const PLANTS = {
  'a private key': ['-----BEGIN ', 'RSA PRIVATE', ' KEY-----'].join(''),
  'a GitHub token': ['ghp', '_', filler(36)].join(''),
  'an API key': ['sk', '-', filler(24)].join(''),
  'a Slack token': ['xoxb', '-', filler(12)].join(''),
  'an AWS key': ['AKIA', filler(16).toUpperCase()].join(''),
  'a Google key': ['AIza', filler(35)].join(''),
  'a Netlify token': ['nfp', '_', filler(24)].join(''),
  'a JSON web token': [['eyJ', filler(12)].join(''), ['eyJ', filler(12)].join(''), filler(12)].join('.'),
  'a licence key': [`${'a1'.repeat(16)}T`, filler(44)].join(''),
  'a password in an address': ['https', '://', 'someone', ':', 'hunter2', '@', 'example.com/x'].join(''),
  'a Basic-Auth value': ['Basic', '-Auth', ': ', 'someone', ':', 'hunter2'].join(''),
  'a secret in a setting': ['pass', 'word', ' = ', "'", filler(20), "'"].join(''),
};

/** The fixture list, read through the real reader from a real file. */
function fixtureList(t) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-privacy-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'words.txt');
  fs.writeFileSync(file, FIXTURE_LIST);
  return readWordList(file);
}

/** A file's path as a scan in a site sees it, which is what an allow line names. */
function mounted(filePath) {
  return `${PREFIX}/${filePath}`;
}

/** The real tree, every path below the mount. */
function realTree() {
  const files = sharedFiles();
  const texts = readTexts(SHARED_ROOT, files);
  return {
    paths: files.map(mounted),
    texts: texts.map((entry) => ({ ...entry, path: mounted(entry.path) })),
  };
}

/** Every hit in the tree's names and contents, as the lines a person would read. */
function treeHits({ paths, texts }, list) {
  return [...scanNames(paths, list), ...scanTexts(texts, list)].map(describeHit);
}

test('every secret shape has a plant, and every plant a shape', () => {
  const shapes = SECRET_SHAPES.map(({ name }) => name).sort();
  assert.deepEqual(Object.keys(PLANTS).sort(), shapes);
});

test('each planted secret is caught, as its own shape', (t) => {
  const list = fixtureList(t);
  for (const [name, plant] of Object.entries(PLANTS)) {
    const hits = scanTexts([{ path: 'shared/css/custom.scss', text: `one line\n${plant}\n` }], list);
    assert.ok(hits.some(({ shape }) => shape === name), `not caught: ${name}`);
    assert.ok(hits.every(({ line }) => line === 2), `wrong line: ${name}`);
  }
});

test('a hit names no secret', (t) => {
  const list = fixtureList(t);
  for (const [name, plant] of Object.entries(PLANTS)) {
    const [hit] = scanTexts([{ path: 'shared/a.md', text: plant }], list);
    assert.ok(!describeHit(hit).includes(plant), name);
  }
});

test('a listed word is caught in a text and in a file name, and a hit never shows it', (t) => {
  const list = fixtureList(t);
  const inText = scanTexts([{ path: 'shared/a.md', text: `one\n${PLANTED_WORD.toUpperCase()}\n` }], list);
  const inName = scanNames([`shared/${PLANTED_WORD}.md`], list);
  assert.equal(inText.length, 1);
  assert.equal(inName.length, 1);
  assert.match(describeHit(inText[0]), /shared\/a\.md:2 matches line 3 of the word list/);
  assert.ok(![...inText, ...inName].map(describeHit).join('\n').toLowerCase().includes(PLANTED_WORD));
});

test('an allow line frees a word in its one path and no other', (t) => {
  const list = fixtureList(t);
  assert.deepEqual(scanTexts([{ path: ALLOWED_IN, text: ALLOWED_WORD }], list), []);
  assert.equal(scanTexts([{ path: 'shared/other.md', text: ALLOWED_WORD }], list).length, 1);
});

test('a comment line of the list is no word', (t) => {
  const list = fixtureList(t);
  assert.deepEqual(scanTexts([{ path: 'shared/a.md', text: 'a comment, which is no word' }], list), []);
});

test('the shapes skip the scan\'s own files and no others, and the word list skips none', (t) => {
  const list = fixtureList(t);
  const own = ['__tests__/privacy.test.mjs', 'shared/__tests__/privacy.test.mjs', 'scripts/lib/privacy.mjs', 'shared/scripts/lib/privacy.mjs'];
  const others = ['__tests__/tokens.test.mjs', 'components/privacy.test.mjs', 'shared/notprivacy.mjs', 'shared/components/A/__tests__/privacy-notes.js'];
  const plant = PLANTS['an API key'];
  for (const file of own) {
    assert.equal(isOwnFile(file), true, file);
    assert.deepEqual(scanTexts([{ path: file, text: plant }], list), [], file);
    assert.equal(scanTexts([{ path: file, text: `one\n${PLANTED_WORD}\n` }], list).length, 1, file);
  }
  for (const file of others) {
    assert.equal(isOwnFile(file), false, file);
    assert.equal(scanTexts([{ path: file, text: plant }], list).length, 1, file);
  }
});

test('a word inside a picture, a PDF or a font is caught, and a binary\'s random bytes are no secret', (t) => {
  const list = fixtureList(t);
  const binary = (text) => ({ text: `\u0000\u0001${text}`, binary: true });
  const files = [
    { path: 'shared/static/a.png', ...binary(`tEXt Comment ${PLANTED_WORD}`) },
    { path: 'shared/static/a.pdf', ...binary(`/Author (${PLANTED_WORD.toUpperCase()})`) },
    { path: 'shared/static/a.woff2', ...binary(`name ${PLANTED_WORD}`) },
    { path: 'shared/static/b.png', ...binary(PLANTS['a GitHub token']) },
  ];
  const lines = scanTexts(files, list).map(describeHit);
  assert.deepEqual(lines, [
    'shared/static/a.png, a binary file, matches line 3 of the word list',
    'shared/static/a.pdf, a binary file, matches line 3 of the word list',
    'shared/static/a.woff2, a binary file, matches line 3 of the word list',
  ]);
});

test('a content hit in a file whose name holds a word never shows that name', (t) => {
  const list = fixtureList(t);
  const hits = scanTexts([{ path: `shared/${PLANTED_WORD}/notes.md`, text: `one\n${PLANTED_WORD}\n${PLANTS['an API key']}\n` }], list);
  assert.equal(hits.length, 2);
  assert.ok(!hits.map(describeHit).join('\n').toLowerCase().includes(PLANTED_WORD));
});

test('the real tree is clean against the fixture list and every shape', (t) => {
  const tree = realTree();
  assert.ok(tree.texts.length > 0, 'no files read');
  assert.deepEqual(treeHits(tree, fixtureList(t)), []);
  const binaries = tree.texts.filter(({ binary }) => binary).length;
  t.diagnostic(`${tree.paths.length} files read, ${binaries} of them binary`);
});

const machineList = readWordList(wordListPath());
const machineSkip = machineList.missing ? 'no word list on this machine' : false;

test('the real tree is clean against the machine\'s word list', { skip: machineSkip }, (t) => {
  assert.deepEqual(treeHits(realTree(), machineList), []);
  t.diagnostic(`${machineList.words.length} entries in the list`);
});
