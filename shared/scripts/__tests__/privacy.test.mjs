/**
 * scripts/__tests__/privacy.test.mjs: the privacy scan. The fixture's words are made up, and the
 * planted secrets are built at run time, so this file holds neither. A hit must never print the word.
 * A new secret shape gets a row in plantedSecrets. A new way to write an entry gets a row in SPELLINGS.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SECRET_SHAPES, describeHit, isOwnFile, maskWords, readTexts, readWordList, scanCommits, scanNames,
  scanTexts, shapeHits, wordHits,
} from '../lib/privacy.mjs';
import { parseWordFile } from '../check-public.mjs';
import { WORD_LIST, fixtureFor, writeFiles } from './fixture.mjs';

/** The list from a text, by way of a temp file that goes when the test ends. */
function listFrom(t, text = WORD_LIST) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-words-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const file = path.join(folder, 'words.txt');
  fs.writeFileSync(file, text);
  return readWordList(file);
}

/** A string of each shape, none of them written whole in this file. */
function plantedSecrets() {
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [
    ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' '),
    `${'gh'}p_${letters}`,
    `${'github'}_pat_${letters}`,
    `${'sk'}-${letters}`,
    `${'xox'}b-${letters}`,
    `${'AK'}IA${'ABCDEFGHIJKLMNOP'}`,
    `${'AI'}za${letters.slice(1)}`,
    `${'nf'}p_${letters}`,
    `${'ey'}J${letters}.${'ey'}J${letters}.${letters}`,
    `${'0123456789abcdef'.repeat(2)}T${'QUJD'.repeat(12)}`,
    `https://${'user'}:${'pass'}@example.com/`,
    `Basic-Auth = "${'user'}:${'pass'}"`,
    `api_key = "${letters}"`,
  ];
}

test('the word list: comments, blanks, CRLF, case, allow lines and line numbers', (t) => {
  const list = listFrom(t, '# a comment\n\nZebrafish\r\nquokka\nquokka\tdocs/allowed.md\n');
  const plain = { forms: [], multiPart: false };
  assert.deepEqual(list.words, [
    { ...plain, lower: 'zebrafish', line: 3, forms: ['zebrafish'] },
    { ...plain, lower: 'quokka', line: 4, forms: ['quokka'] },
  ]);
  assert.deepEqual(list.allowed, [{ lower: 'quokka', path: 'docs/allowed.md' }]);
  assert.equal(list.missing, false);
});

/** A list with every kind of line, the two kinds of bad line among them. */
const EVERY_KIND_OF_LINE = '# a comment\n\n  # an indented comment\nZebrafish\r\nquokka\tdocs/a.md\nquokka\tdocs/b.md\nc#\nzebrafish\nfish\tdocs/a.md\textra\n\tdocs/no-word.md\n';

test('the scripts and check-public read one list the same, line for line', (t) => {
  const list = listFrom(t, EVERY_KIND_OF_LINE);
  const { entries, badLines } = parseWordFile(EVERY_KIND_OF_LINE);
  assert.deepEqual(list.words.map(({ lower, line }) => [lower, line]), [['zebrafish', 4], ['quokka', 5], ['c#', 7], ['fish', 9]]);
  assert.deepEqual(entries.map(({ needle, lineNumber }) => [needle, lineNumber]), list.words.map(({ lower, line }) => [lower, line]));
  assert.deepEqual(entries.map(({ forms }) => forms), list.words.map(({ forms }) => forms));
  const pathsOf = (word) => list.allowed.filter(({ lower }) => lower === word).map((entry) => entry.path);
  assert.deepEqual(entries.map(({ allowedPaths }) => [...allowedPaths].sort()), entries.map(({ needle }) => pathsOf(needle).sort()));
  assert.deepEqual(list.badLines, [9, 10]);
  assert.deepEqual(badLines, list.badLines);
});

test('a list with no word in it reads as missing: an emptied file must not scan nothing and read clean', (t) => {
  for (const text of ['', '\n\n', '# a comment\n']) {
    const list = listFrom(t, text);
    assert.equal(list.missing, true, JSON.stringify(text));
    assert.deepEqual(list.words, []);
  }
});

test('a missing list says so instead of reading as empty and clean', (t) => {
  const fixture = fixtureFor(t);
  const list = readWordList(path.join(fixture.base, 'no-such-file'));
  assert.equal(list.missing, true);
  assert.deepEqual(list.words, []);
});

test('a word hits in any case, with its line, and an allow line clears one path only', (t) => {
  const list = listFrom(t);
  assert.deepEqual(wordHits('fine\nA ZebraFish here\n', list), [{ line: 2, listLine: 2 }]);
  const text = 'a quokka\n';
  assert.deepEqual(wordHits(text, list, 'docs/allowed.md'), []);
  assert.deepEqual(wordHits(text, list, 'docs/other.md'), [{ line: 1, listLine: 3 }]);
});

test('every planted secret is caught, and every shape is planted', () => {
  const planted = plantedSecrets();
  const shapes = new Set();
  for (const secret of planted) {
    const hits = shapeHits(`before\n${secret}\nafter\n`);
    assert.ok(hits.length > 0, `not caught: shape number ${planted.indexOf(secret)}`);
    hits.forEach((hit) => shapes.add(hit.shape));
    assert.equal(hits[0].line, 2);
  }
  assert.equal(shapes.size, SECRET_SHAPES.length);
});

test('ordinary code is not a secret', () => {
  const clean = [
    'const token = useToken();',
    'password: process.env.SITE_PASSWORD,',
    'https://example.com/path:with:colons',
    'import x from "@site/shared/components/LC";',
    '--ifm-color-primary-contrast-foreground: #123456;',
  ];
  assert.deepEqual(shapeHits(clean.join('\n')), []);
});

test('scanTexts reads text and binaries, and its own files skip the shapes alone', (t) => {
  const fixture = fixtureFor(t);
  const list = readWordList(fixture.wordList);
  const [secret] = plantedSecrets();
  writeFiles(fixture.base, {
    'tree/one.md': 'a zebrafish\n',
    'tree/scripts/lib/privacy.mjs': `a zebrafish\n${secret}\n`,
    'tree/__tests__/privacy.test.mjs': `${secret}\n`,
  });
  const folder = path.join(fixture.base, 'tree');
  const picture = Buffer.concat([Buffer.from([0x89, 0x50, 0, 0, 1]), Buffer.from(`tEXt Author zebrafish ${secret}`)]);
  fs.writeFileSync(path.join(folder, 'picture.png'), picture);
  fs.writeFileSync(path.join(folder, 'font.woff2'), Buffer.from([0, 1, 2, 122, 101, 98, 114, 97]));
  const paths = ['one.md', 'scripts/lib/privacy.mjs', '__tests__/privacy.test.mjs', 'picture.png', 'font.woff2', 'missing.md'];
  const texts = readTexts(folder, paths);
  assert.deepEqual(texts.map((entry) => [entry.path, entry.binary]), [
    ['one.md', false], ['scripts/lib/privacy.mjs', false], ['__tests__/privacy.test.mjs', false],
    ['picture.png', true], ['font.woff2', true],
  ]);
  assert.deepEqual(readTexts(folder, paths, { binaries: false }).map((entry) => entry.path), paths.slice(0, 3));
  const hits = scanTexts(texts, list).map(({ path: file, line, listLine, shape }) => [file, line, listLine ?? shape]);
  assert.deepEqual(hits, [['one.md', 1, 2], ['scripts/lib/privacy.mjs', 1, 2], ['picture.png', 0, 2]]);
  assert.equal(describeHit({ path: 'picture.png', line: 0, where: 'content', listLine: 2 }), 'picture.png, a binary file, matches line 2 of the word list');
});

test('only the scan\'s own three files skip the shapes, in the hub or below shared/', () => {
  const own = ['scripts/lib/privacy.mjs', 'shared/scripts/lib/privacy.mjs', '__tests__/privacy.test.mjs',
    'scripts/__tests__/privacy.test.mjs', 'shared/__tests__/privacy.test.mjs', 'shared/scripts/__tests__/privacy.test.mjs'];
  const others = ['shared/components/Foo/__tests__/privacy-notes.js', 'shared/components/privacy.mjs', 'docs/scripts/lib/privacy.mjs',
    '__tests__/privacy.helpers.mjs', 'shared/__tests__/privacy.test.mjs.orig'];
  own.forEach((file) => assert.equal(isOwnFile(file), true, file));
  others.forEach((file) => assert.equal(isOwnFile(file), false, file));
});

test('a word in the scan\'s own files is caught like any other', (t) => {
  const list = listFrom(t);
  for (const file of ['shared/scripts/lib/privacy.mjs', 'shared/scripts/__tests__/privacy.test.mjs', 'shared/__tests__/privacy.test.mjs']) {
    assert.deepEqual(scanTexts([{ path: file, text: 'a zebrafish here' }], list).map((hit) => hit.listLine), [2], file);
  }
});

test('a content hit in a file whose name holds a word masks that name', (t) => {
  const list = listFrom(t);
  const [secret] = plantedSecrets();
  const texts = [{ path: 'shared/zebrafish/notes.md', text: `a line\nanother zebrafish\n${secret}\n` }];
  const lines = scanTexts(texts, list).map(describeHit);
  assert.deepEqual(lines, [
    'shared/*********/notes.md:2 matches line 2 of the word list',
    'shared/*********/notes.md:3 looks like a private key',
  ]);
});

/** Each way of writing a listed entry with parts that must still be caught, by the list line it hits. */
const SPELLINGS = [
  ['joined', 'see otterraft here'],
  ['with a space', 'see otter raft here'],
  ['with an underscore', 'see otter_raft here'],
  ['as written', 'see Otter-Raft here'],
  ['in camel case', 'see OtterRaft here'],
  ['over a line', 'see the otter-\n  raft here'],
  ['over a line with no hyphen', 'see the otter\n  raft here'],
  ['over a comment line', '// see the otter\n// raft here'],
];

test('an entry with parts is caught in every spelling, joined or wrapped', (t) => {
  const list = listFrom(t, 'otter-raft\nCamelRaft\n');
  for (const [name, text] of SPELLINGS) {
    assert.deepEqual(wordHits(text, list, 'shared/a.js').map((hit) => hit.listLine), [1], name);
  }
  assert.deepEqual(wordHits('the camel raft\n', list).map((hit) => hit.listLine), [2], 'a list entry in camel case');
  assert.equal(wordHits('see the otter-\n  raft', list)[0].line, 1, 'a wrapped hit names the line it starts on');
});

test('Markdown and HTML marks inside an entry hide nothing, and only there are they taken out', (t) => {
  const list = listFrom(t, 'otter-raft\nzebrafish\n');
  for (const text of ['an otter-**raft**', 'an *otter*-raft', 'an `otter`-raft', 'an otter-<em>raft</em>', 'a zebra<b>fish</b>']) {
    assert.equal(wordHits(text, list, 'shared/docs/a.md').length, 1, text);
    assert.equal(wordHits(text, list, 'shared/docs/a.html').length, 1, text);
  }
  assert.deepEqual(wordHits('a zebra_fish_name', list, 'shared/a.js'), [], 'underscores are code outside Markdown');
});

test('a plain word never joins the next line, and a short joined spelling is not tried', (t) => {
  const list = listFrom(t, 'zebrafish\nab-cd\n');
  assert.deepEqual(wordHits('a zebra\nfish', list), [], 'two words that meet at a line break');
  assert.deepEqual(wordHits('abcd and ab cd', list), [], 'abcd is too short to try');
  assert.equal(wordHits('ab-cd', list).length, 1, 'the entry as written still counts');
});

test('a name hit by another spelling is masked too, and an allow line frees every spelling', (t) => {
  const list = listFrom(t, 'otter-raft\notter-raft\tdocs/allowed.md\n');
  const [nameHit] = scanNames(['docs/otter raft/otter_raft.md'], list);
  assert.equal(nameHit.path, 'docs/**********/**********.md');
  assert.deepEqual(wordHits('an otterraft', list, 'docs/allowed.md'), []);
  assert.equal(wordHits('an otterraft', list, 'docs/other.md').length, 1);
});

test('a binary file is read whole, and every spelling counts there too', (t) => {
  const list = listFrom(t, 'otter-raft\n');
  const bytes = Buffer.concat([Buffer.from([0, 0xff, 0xfe]), Buffer.from('%PDF /Author (Otter Raft)')]);
  const hits = scanTexts([{ path: 'shared/static/a.pdf', text: bytes.toString('utf8'), binary: true }], list);
  assert.deepEqual(hits.map(({ line, listLine, shape }) => [line, listLine, shape]), [[0, 1, undefined]]);
});

test('a file name hit is masked, and no description ever holds the word', (t) => {
  const list = listFrom(t);
  const [nameHit] = scanNames(['docs/Zebrafish/zebrafish-notes.md'], list);
  assert.equal(nameHit.path, 'docs/*********/*********-notes.md');
  assert.equal(maskWords('plain.md', list), 'plain.md');
  const contentHit = { path: 'a.md', line: 4, where: 'content', listLine: 2 };
  const commitHit = { sha: 'abcdef0123', where: 'subject', listLine: 2 };
  const lines = [nameHit, contentHit, commitHit].map(describeHit);
  assert.deepEqual(lines.slice(1), ['a.md:4 matches line 2 of the word list', "commit abcdef0's subject matches line 2 of the word list"]);
  for (const line of lines) assert.doesNotMatch(line, /zebrafish/i);
});

test('scanCommits reads subjects and bodies, and says which', (t) => {
  const list = listFrom(t);
  const commits = [
    { sha: 'a'.repeat(40), subject: 'Fix the zebrafish page', body: '' },
    { sha: 'b'.repeat(40), subject: 'A clean subject', body: 'The body names a quokka.' },
    { sha: 'c'.repeat(40), subject: 'All clean' },
  ];
  const hits = scanCommits(commits, list);
  assert.deepEqual(hits.map((hit) => [hit.sha[0], hit.where]), [['a', 'subject'], ['b', 'body']]);
});
