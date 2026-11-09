/**
 * check-public.test.mjs: tests for check-public.mjs. Run from the repo's top folder:
 *   node --test scripts/check-public.test.mjs
 *
 * The rules are tested as functions. Every exit code and message is tested by running the real
 * command on a throwaway git repo in the system's temp folder, with a made-up word list.
 *
 * How to change it: add a case beside the rule it covers.
 *
 * This file is published and is scanned by the check it tests, so it holds no value that looks
 * real: dummyLicenceKey and basicAuthLine build theirs while the tests run. Keep it that way.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  countLicenceKeys,
  EXIT_CLEAN,
  EXIT_FOUND,
  EXIT_REFUSED,
  findBasicAuthOffsets,
  isEnvFile,
  parseWordFile,
} from './check-public.mjs';

const SCRIPT = fileURLToPath(new URL('./check-public.mjs', import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);
const REAL_WORD_FILE = path.join(os.homedir(), '.config', 'docusaurus-shared', 'private-words.txt');

const WORD = 'zebrafish';
const OTHER_WORD = 'quokka';
const WORD_LIST_LINES = ['# made-up words', '', WORD, OTHER_WORD];
const WORD_LINE = 3;
const OTHER_WORD_LINE = 4;
const CLEAN_BUNDLE = 'console.log("a clean bundle");\n';
/** Long enough to find a regular expression that backtracks. */
const BIG_FILE_BYTES = 5 * 1024 * 1024;
const BIG_FILE_TIMEOUT_MS = 15000;

function keyWithPayload(payload) {
  const encoded = Buffer.from(payload).toString('base64');
  const hash = createHash('md5').update(encoded).digest('hex');
  return hash + encoded;
}

/** The three payload formats licence keys have had. Numbers and names here are invented. */
const KEY_PAYLOADS = {
  'version 1': ['ORDER:0', 'EXPIRY=1000000000000', 'KEYVERSION=1'].join(','),
  'version 2': ['O=0', 'E=1000000000000', 'S=pro', 'LM=perpetual', 'PV=initial', 'KV=2'].join(','),
  'version 3': ['O=0', 'E=1000000000000', 'S=premium', 'LM=perpetual', 'Q=1', 'AT=0', 'KV=3'].join(','),
};

function dummyLicenceKey() {
  return keyWithPayload(KEY_PAYLOADS['version 2']);
}

function dummyPair() {
  return ['someone', 'not-a-real-password'].join(':');
}

function basicAuthLine(separator) {
  const header = ['Basic', 'Auth'].join('-');
  return `${header}${separator}${dummyPair()}`;
}

function write(root, relativePath, contents) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

function git(root, ...args) {
  execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' });
}

/** A temp git repo with `files` tracked and a built bundle. Removed when the test ends. */
function makeRepo(t, files = { 'README.md': 'A public site.\n' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-public-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  for (const [relativePath, contents] of Object.entries(files)) {
    write(root, relativePath, contents);
    git(root, 'add', '-f', relativePath);
  }
  write(root, 'build/assets/js/main.js', CLEAN_BUNDLE);
  write(root, 'words.txt', WORD_LIST_LINES.join('\n'));
  return root;
}

function run(root, flags = ['--word-file', path.join(root, 'words.txt')], env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...flags], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

function assertSilentAbout(output, ...values) {
  for (const value of values) {
    assert.ok(!output.toLowerCase().includes(value.toLowerCase()), 'the output prints a value');
  }
}

// The licence key rule

for (const [version, payload] of Object.entries(KEY_PAYLOADS)) {
  test(`finds a licence key, ${version}`, () => {
    assert.equal(countLicenceKeys(`const key="${keyWithPayload(payload)}";`), 1);
  });
}

test('finds a licence key in a minified bundle and in escaped JSON', () => {
  const key = dummyLicenceKey();
  assert.equal(countLicenceKeys(`e.exports={a:1,b:"${key}",c:2}`), 1);
  assert.equal(countLicenceKeys(`JSON.parse('{"customFields":{"k":"${key}"}}')`), 1);
  assert.equal(countLicenceKeys(`first ${key} and second ${key}`), 2);
});

test('leaves hex hashes alone, however long', () => {
  const md5 = 'ab'.repeat(16);
  const sha512 = 'cd'.repeat(64);
  const cryptoConstant = 'ef'.repeat(1024);
  assert.equal(countLicenceKeys(`hash("${md5}")`), 0);
  assert.equal(countLicenceKeys(`hash("${sha512}")`), 0);
  assert.equal(countLicenceKeys(`prime("${cryptoConstant}")`), 0);
});

test('leaves a hash followed by random base64 alone', () => {
  const hash = 'ef'.repeat(16);
  const noise = randomBytes(200).toString('base64');
  assert.equal(countLicenceKeys(`"${hash}${noise}"`), 0);
});

test('leaves a hash followed by a long identifier alone', () => {
  const hash = '01'.repeat(16);
  assert.equal(countLicenceKeys(`${hash}ThisIsALongCamelCaseIdentifierWithNoMeaningAtAll`), 0);
});

test('finds nothing inside a base64 data URI, even with a key-like run in it', () => {
  const keyLikeRun = dummyLicenceKey();
  const blobStart = 'QUJD'.repeat(1000);
  for (const lastCharacter of ['A', '0', '+', '/']) {
    const blob = `${blobStart}${lastCharacter}${keyLikeRun}`;
    assert.equal(countLicenceKeys(`url(data:font/woff2;base64,${blob})`), 0, lastCharacter);
  }
});

test('leaves upper-case hex and a short payload alone', () => {
  const hash = 'AB'.repeat(16);
  const payload = Buffer.from(KEY_PAYLOADS['version 2']).toString('base64');
  assert.equal(countLicenceKeys(`"${hash}${payload}"`), 0);
  const shortPayload = Buffer.from('O=0,KV=2').toString('base64');
  assert.equal(countLicenceKeys(`"${'ab'.repeat(16)}${shortPayload}"`), 0);
});

test('a big file of hex or base64 takes no time', { timeout: BIG_FILE_TIMEOUT_MS }, () => {
  const hex = 'a1'.repeat(BIG_FILE_BYTES / 2);
  const base64 = 'QUJD'.repeat(BIG_FILE_BYTES / 4);
  const hashes = `${'ab'.repeat(16)} `.repeat(BIG_FILE_BYTES / 33);
  assert.equal(countLicenceKeys(hex), 0);
  assert.equal(countLicenceKeys(base64), 0);
  assert.equal(countLicenceKeys(hashes), 0);
  assert.equal(findBasicAuthOffsets(hashes).length, 0);
});

// The Basic-Auth rule

test('finds a Basic-Auth value in netlify.toml, active or commented out', () => {
  const active = basicAuthLine(' = "');
  assert.equal(findBasicAuthOffsets(`[headers.values]\n  ${active}"\n`).length, 1);
  assert.equal(findBasicAuthOffsets(`  # ${active}"\n`).length, 1);
  assert.equal(findBasicAuthOffsets(`  ${basicAuthLine(" = '''")}'''\n`).length, 1);
  assert.equal(findBasicAuthOffsets(`  ${basicAuthLine('="')}"\n`).length, 1);
});

test('finds a Basic-Auth value in a _headers file, in any case', () => {
  assert.equal(findBasicAuthOffsets(`/*\n  ${basicAuthLine(': ')}\n`).length, 1);
  assert.equal(findBasicAuthOffsets(basicAuthLine(': ').toLowerCase()).length, 1);
});

test('finds the value of an Authorization: Basic header', () => {
  const encoded = Buffer.from(dummyPair()).toString('base64');
  const header = ['Authorization', ' Basic '].join(':');
  assert.equal(findBasicAuthOffsets(`curl -H "${header}${encoded}"`).length, 1);
});

test('leaves prose, code and other headers alone', () => {
  const header = ['Basic', 'Auth'].join('-');
  const samples = [
    `Netlify's ${header} header keeps a site private.`,
    `headers['${header}'] = value;`,
    `'${header}': value,`,
    `${header}: see the docs`,
    `${header}: https://example.com/docs`,
    'Authorization: Bearer abcdefghijklmnop',
    "Authorization: 'Basic ' + token",
    `Authorization: Basic ${Buffer.from('no separator here').toString('base64')}`,
  ];
  for (const sample of samples) {
    assert.deepEqual(findBasicAuthOffsets(sample), [], sample);
  }
});

// The .env rule

test('knows a .env file', () => {
  assert.ok(isEnvFile('.env'));
  assert.ok(isEnvFile('.env.production'));
  assert.ok(isEnvFile('site/.env'));
  assert.ok(!isEnvFile('.env.example'));
  assert.ok(!isEnvFile('site/.env.example'));
  assert.ok(!isEnvFile('docs/env.md'));
  assert.ok(!isEnvFile('.environment'));
  assert.ok(!isEnvFile('.env/readme.md'));
});

// The word list's format

test('reads comments, blank lines, line numbers and CRLF', () => {
  const { entries, badLines } = parseWordFile(`# a comment\n\nFirst\r\n  # indented comment\nsecond\n`);
  assert.deepEqual(badLines, []);
  assert.deepEqual(
    entries.map(({ needle, lineNumber }) => [needle, lineNumber]),
    [['first', 3], ['second', 5]],
  );
});

test('an allow line adds a path to a word already listed, and keeps its line', () => {
  const { entries } = parseWordFile('word\nother\nword\tdocs/a.md\nword\tdocs/b.md\n');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].lineNumber, 1);
  assert.deepEqual([...entries[0].allowedPaths], ['docs/a.md', 'docs/b.md']);
});

test('an allow line on its own still lists the word', () => {
  const { entries } = parseWordFile('word\tdocs/a.md\n');
  assert.equal(entries[0].needle, 'word');
  assert.equal(entries[0].lineNumber, 1);
});

test('a # inside a word is part of the word', () => {
  const { entries } = parseWordFile('c#\n');
  assert.equal(entries[0].needle, 'c#');
});

test('reports a line it cannot read', () => {
  assert.deepEqual(parseWordFile('fine\none\ttwo\tthree\n\tno-word\n').badLines, [2, 3]);
});

// The command: clean

test('the exit codes are 0, 1 and 2', () => {
  assert.deepEqual([EXIT_CLEAN, EXIT_FOUND, EXIT_REFUSED], [0, 1, 2]);
});

test('a clean repo passes and says what it read', (t) => {
  const root = makeRepo(t);
  const { status, output } = run(root);
  assert.equal(status, EXIT_CLEAN, output);
  assert.match(output, /1 built files, 1 tracked files \(0 with nothing to read\), 2 listed words/);
});

// The command: licence keys

test('fails on a key in a bundle and names the file, not the key', (t) => {
  const root = makeRepo(t);
  const key = dummyLicenceKey();
  write(root, 'build/assets/js/chunk.js', `a="${key}"`);
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, /licence key shape: build\/assets\/js\/chunk\.js \(1 found\)/);
  assertSilentAbout(output, key, key.slice(0, 32), key.slice(32));
});

test('fails on a key in a bundle folder below BUNDLE_DIR, in any file type', (t) => {
  const root = makeRepo(t);
  write(root, 'build/assets/js/nested/chunk.js.map', `{"k":"${dummyLicenceKey()}"}`);
  assert.equal(run(root).status, EXIT_FOUND);
});

test('fails on a key in a tracked file', (t) => {
  const root = makeRepo(t, { 'docs/config.md': `key ${dummyLicenceKey()}\n` });
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, /licence key shape: docs\/config\.md/);
});

// The command: Basic-Auth

test('fails on a Basic-Auth value, gives its line, and prints no value', (t) => {
  const toml = `[build]\n  publish = "build"\n  ${basicAuthLine(' = "')}"\n`;
  const root = makeRepo(t, { 'netlify.toml': toml });
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, /Basic-Auth value: netlify\.toml \(line 3, 1 found\)/);
  assertSilentAbout(output, dummyPair(), 'not-a-real-password');
});

// The command: .env

test('fails on a tracked .env, even one deleted from the working tree', (t) => {
  const root = makeRepo(t, { '.env': 'NAME=value\n' });
  assert.equal(run(root).status, EXIT_FOUND);
  fs.rmSync(path.join(root, '.env'));
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, /tracked \.env file: \.env/);
});

test('passes on a tracked .env.example and an untracked .env', (t) => {
  const root = makeRepo(t, { '.env.example': 'NAME=\n' });
  write(root, '.env', 'NAME=value\n');
  assert.equal(run(root).status, EXIT_CLEAN);
});

// The command: words

test('a word hit prints its line number, never the word', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `first\nsecond ${WORD} third\n` });
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, new RegExp(`word list line ${WORD_LINE}: docs/a\\.md \\(line 2\\)`));
  assertSilentAbout(output, WORD);
});

test('a word matches in any case', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `${WORD.toUpperCase()}\n` });
  assert.equal(run(root).status, EXIT_FOUND);
});

test('a word list in another case still matches', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `${WORD}\n` });
  write(root, 'words.txt', `${WORD.toUpperCase()}\n`);
  assert.equal(run(root).status, EXIT_FOUND);
});

test('word<TAB>path allows the word in that path', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `${WORD}\n` });
  write(root, 'words.txt', `${WORD}\n${WORD}\tdocs/a.md\n`);
  const { status, output } = run(root);
  assert.equal(status, EXIT_CLEAN, output);
});

test('word<TAB>path allows nothing in any other path', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `${WORD}\n`, 'docs/b.md': `${WORD}\n` });
  write(root, 'words.txt', `${WORD}\n${WORD}\tdocs/a.md\n`);
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, /word list line 1: docs\/b\.md/);
  assert.doesNotMatch(output, /docs\/a\.md/);
});

test('an allowed word does not allow another word in that path', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `${WORD} ${OTHER_WORD}\n` });
  write(root, 'words.txt', `${WORD}\tdocs/a.md\n${OTHER_WORD}\n`);
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, /word list line 2: docs\/a\.md/);
});

test('a word in a tracked path fails, and the path is hidden', (t) => {
  const root = makeRepo(t, { [`docs/${WORD}-notes.md`]: 'plain text\n' });
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, new RegExp(`word list line ${WORD_LINE}: \\(a path that holds a listed word\\)`));
  assertSilentAbout(output, WORD);
});

test('a hit in a file whose path holds another word hides the path', (t) => {
  const root = makeRepo(t, { [`docs/${OTHER_WORD}.md`]: `${WORD}\n` });
  const { status, output } = run(root);
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, new RegExp(`word list line ${WORD_LINE}: \\(a path that holds`));
  assert.match(output, new RegExp(`word list line ${OTHER_WORD_LINE}: \\(a path that holds`));
  assertSilentAbout(output, WORD, OTHER_WORD);
});

test('one word in many files does not hide another word', (t) => {
  const files = { 'docs/last.md': `${OTHER_WORD}\n` };
  for (let index = 0; index < 8; index += 1) {
    files[`docs/a${index}.md`] = `${WORD}\n`;
  }
  const { status, output } = run(makeRepo(t, files));
  assert.equal(status, EXIT_FOUND, output);
  assert.match(output, new RegExp(`word list line ${WORD_LINE}: and 3 more`));
  assert.match(output, new RegExp(`word list line ${OTHER_WORD_LINE}: docs/last\\.md`));
});

test('a word in a binary file counts', (t) => {
  const root = makeRepo(t);
  const contents = Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(WORD), Buffer.from([0])]);
  write(root, 'static/picture.png', contents);
  git(root, 'add', '-f', 'static/picture.png');
  assert.equal(run(root).status, EXIT_FOUND);
});

// The command: the missing word list

test('a missing word list refuses, with the default path and the flag in the message', (t) => {
  const root = makeRepo(t);
  const home = path.join(root, 'empty-home');
  fs.mkdirSync(home);
  const { status, output } = run(root, [], { HOME: home });
  assert.equal(status, EXIT_REFUSED, output);
  assert.match(output, /REFUSED, no word list at ~\/\.config\/docusaurus-shared\/private-words\.txt/);
  assert.match(output, /--allow-missing-word-file/);
});

test('the default path is read when it exists', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `${WORD}\n` });
  const home = path.join(root, 'home');
  write(home, '.config/docusaurus-shared/private-words.txt', `${WORD}\n`);
  assert.equal(run(root, [], { HOME: home }).status, EXIT_FOUND);
});

test('the override runs the other checks and says the word check did not run', (t) => {
  const root = makeRepo(t);
  const flags = ['--word-file', path.join(root, 'missing.txt'), '--allow-missing-word-file'];
  const { status, output } = run(root, flags);
  assert.equal(status, EXIT_CLEAN, output);
  assert.match(output, /word check did not run/);
});

test('the override still fails on a key', (t) => {
  const root = makeRepo(t);
  write(root, 'build/assets/js/chunk.js', `a="${dummyLicenceKey()}"`);
  const flags = ['--word-file', path.join(root, 'missing.txt'), '--allow-missing-word-file'];
  assert.equal(run(root, flags).status, EXIT_FOUND);
});

test('the override changes nothing when the word list exists', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `${WORD}\n` });
  const flags = ['--word-file', path.join(root, 'words.txt'), '--allow-missing-word-file'];
  assert.equal(run(root, flags).status, EXIT_FOUND);
});

test('a word list with no entries refuses, even with the override', (t) => {
  const root = makeRepo(t);
  write(root, 'words.txt', '# only a comment\n\n');
  const flags = ['--word-file', path.join(root, 'words.txt'), '--allow-missing-word-file'];
  const { status, output } = run(root, flags);
  assert.equal(status, EXIT_REFUSED, output);
  assert.match(output, /has no entries/);
});

test('a word list line it cannot read refuses, by line number', (t) => {
  const root = makeRepo(t);
  write(root, 'words.txt', `${WORD}\none\ttwo\tthree\n`);
  const { status, output } = run(root);
  assert.equal(status, EXIT_REFUSED, output);
  assert.match(output, /word list line\(s\) 2/);
  assertSilentAbout(output, WORD);
});

// The command: a check that cannot run never passes

test('no build refuses', (t) => {
  const root = makeRepo(t);
  fs.rmSync(path.join(root, 'build'), { recursive: true });
  const { status, output } = run(root);
  assert.equal(status, EXIT_REFUSED, output);
  assert.match(output, /Run the build first/);
});

test('an empty build folder refuses', (t) => {
  const root = makeRepo(t);
  fs.rmSync(path.join(root, 'build/assets/js/main.js'));
  assert.equal(run(root).status, EXIT_REFUSED);
});

test('a folder that is not a git repo refuses', (t) => {
  const root = makeRepo(t);
  fs.rmSync(path.join(root, '.git'), { recursive: true });
  const { status, output } = run(root);
  assert.equal(status, EXIT_REFUSED, output);
  assert.match(output, /not a git repo/);
});

test('a repo with nothing tracked refuses', (t) => {
  const root = makeRepo(t, {});
  const { status, output } = run(root);
  assert.equal(status, EXIT_REFUSED, output);
  assert.match(output, /tracks no files/);
});

test('a subfolder of the repo refuses, because git would list only part of it', (t) => {
  const root = makeRepo(t, { 'docs/a.md': 'text\n' });
  const flags = ['--root', path.join(root, 'docs'), '--word-file', path.join(root, 'words.txt')];
  const { status, output } = run(root, flags);
  assert.equal(status, EXIT_REFUSED, output);
  assert.match(output, /not the repo's top folder/);
});

test('an unknown flag refuses', (t) => {
  const root = makeRepo(t);
  assert.equal(run(root, ['--allow-missing']).status, EXIT_REFUSED);
});

test('--root checks another folder', (t) => {
  const root = makeRepo(t, { 'docs/a.md': `${WORD}\n` });
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'check-public-cwd-'));
  t.after(() => fs.rmSync(elsewhere, { recursive: true, force: true }));
  const flags = ['--root', root, '--word-file', path.join(root, 'words.txt')];
  assert.equal(run(elsewhere, flags).status, EXIT_FOUND);
});

test('a tracked symlink to a folder and a deleted file are counted, not read', (t) => {
  const root = makeRepo(t, { 'docs/a.md': 'text\n', 'docs/gone.md': 'text\n' });
  fs.symlinkSync('docs', path.join(root, 'link'));
  git(root, 'add', '-f', 'link');
  fs.rmSync(path.join(root, 'docs/gone.md'));
  const { status, output } = run(root);
  assert.equal(status, EXIT_CLEAN, output);
  assert.match(output, /3 tracked files \(2 with nothing to read\)/);
});

// These two files are published, and they are scanned like any other

for (const file of [SCRIPT, THIS_FILE]) {
  const name = path.basename(file);

  test(`${name} holds no key and no Basic-Auth value`, () => {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(countLicenceKeys(text), 0);
    assert.deepEqual(findBasicAuthOffsets(text), []);
  });

  test(
    `${name} holds no word of this machine's word list`,
    { skip: fs.existsSync(REAL_WORD_FILE) ? false : 'no word list on this machine' },
    () => {
      const text = fs.readFileSync(file, 'utf8').toLowerCase();
      const { entries } = parseWordFile(fs.readFileSync(REAL_WORD_FILE, 'utf8'));
      const hitLines = entries.filter((entry) => text.includes(entry.needle));
      assert.deepEqual(hitLines.map((entry) => entry.lineNumber), []);
    },
  );
}
