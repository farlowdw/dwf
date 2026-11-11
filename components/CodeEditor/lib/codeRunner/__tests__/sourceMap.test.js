/**
 * sourceMap.test.js — reading source maps (../sourceMap.js): base64 VLQ numbers (known values, a
 * round trip through an encoder written here, broken input), the relative fields of the
 * mappings string, which segment answers for a line and for a column, broken and foreign maps
 * (null, never a throw), and — with the TypeScript inside the installed monaco-editor, compiled
 * with the code editor's own options — every line of a real program mapped back to the line it
 * came from, and Node's own errors for statements written over several lines (which TypeScript
 * joins into one JavaScript line: only the column finds the failing line; skipped when
 * monaco-editor is missing). With real server answers (fixtures/typescript): Node 20's frames
 * mapped to the TypeScript line and column. Run with `npm run test:shared`.
 * To change it: a new rule of ../sourceMap.js gets a test here; new real answers go in
 * fixtures/typescript.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeMappings, decodeVlq, originalLineFor, originalPositionFor, parseSourceMap } from '../sourceMap.js';
import { resolvePackage } from '../../../__tests__/paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TS_SERVICES = path.join(resolvePackage('monaco-editor'), 'esm/vs/language/typescript/lib/typescriptServices.js');

/** Real answers of a Piston server to JavaScript the code editor's TypeScript emitted (fixtures/typescript, captured 2026-10-25). */
const TYPESCRIPT_FIXTURES = path.join(HERE, 'fixtures/typescript');

/** The code editor's compiler options (shared/components/CodeEditor/typescript.js > COMPILER_OPTIONS), in TypeScript's numbers. */
const EDITOR_COMPILER_OPTIONS = Object.freeze({ strict: true, target: 9, module: 1, moduleDetection: 3, sourceMap: true, newLine: 1 });

const BASE64_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** A base64 VLQ encoder, written independently of the decoder under test. */
function encodeVlq(numbers) {
	let text = '';
	for (const number of numbers) {
		let value = number < 0 ? -number * 2 + 1 : number * 2;
		do {
			let digit = value % 32;
			value = Math.floor(value / 32);
			if (value > 0) digit += 32;
			text += BASE64_DIGITS[digit];
		} while (value > 0);
	}
	return text;
}

/** A map object with these mappings (one source, main.ts). */
function mapWith(mappings) {
	return { version: 3, file: 'main.js', sources: ['main.ts'], names: [], mappings };
}

test('VLQ: known values, signs, several numbers in one segment', () => {
	assert.deepEqual(decodeVlq('A'), [0]);
	assert.deepEqual(decodeVlq('C'), [1]);
	assert.deepEqual(decodeVlq('D'), [-1]);
	assert.deepEqual(decodeVlq('e'), [15]);
	assert.deepEqual(decodeVlq('gB'), [16], 'a continuation digit, then the next five bits');
	assert.deepEqual(decodeVlq('hB'), [-16]);
	assert.deepEqual(decodeVlq('w+B'), [1000]);
	assert.deepEqual(decodeVlq('AAgBC'), [0, 0, 16, 1]);
	assert.deepEqual(decodeVlq(''), []);
	assert.equal(Object.is(decodeVlq('B')[0], 0), true, '"minus zero" is plain 0, not -0');
});

test('VLQ: a round trip through an independent encoder, large and negative numbers included', () => {
	const samples = [0, 1, -1, 31, 32, -32, 511, 512, 4095, -70000, 123456789, -987654321];
	for (const number of samples) assert.deepEqual(decodeVlq(encodeVlq([number])), [number], String(number));
	assert.deepEqual(decodeVlq(encodeVlq(samples)), samples);
});

test('VLQ: a character outside base64, or a number cut short, throws with the reason', () => {
	assert.throws(() => decodeVlq('A%'), /"%" is not a base64 VLQ digit/);
	assert.throws(() => decodeVlq('g'), /ends in the middle of a number/);
});

test('mappings: generated columns restart on each line, the other fields carry on across lines', () => {
	// line 1: (col 0 → src 0, line 0, col 0), (col 4 → line 0, col 6)
	// line 2: nothing
	// line 3: (col 2 → line 2, col 0, name 0), (col 5, generated only)
	const mappings = [encodeVlq([0, 0, 0, 0]) + ',' + encodeVlq([4, 0, 0, 6]), '', encodeVlq([2, 0, 2, -6, 0]) + ',' + encodeVlq([3])].join(';');
	assert.deepEqual(decodeMappings(mappings), [
		[
			{ generatedColumn: 0, sourceIndex: 0, originalLine: 0, originalColumn: 0 },
			{ generatedColumn: 4, sourceIndex: 0, originalLine: 0, originalColumn: 6 },
		],
		[],
		[{ generatedColumn: 2, sourceIndex: 0, originalLine: 2, originalColumn: 0, nameIndex: 0 }, { generatedColumn: 5 }],
	]);
});

test('mappings: a segment of 2 or 3 numbers is refused; a non-string is refused', () => {
	assert.throws(() => decodeMappings('AA'), /has 2 numbers/);
	assert.throws(() => decodeMappings('AAA'), /has 3 numbers/);
	assert.throws(() => decodeMappings(undefined), /must be a string/);
});

test('originalLineFor: the first mapped segment of the line; null for a line without one or past the end', () => {
	// line 1 unmapped ("use strict"), line 2 → original line 1, line 3 → original lines 3 then 2
	const mappings = ['', encodeVlq([0, 0, 0, 0]), encodeVlq([0, 0, 2, 0]) + ',' + encodeVlq([6, 0, -1, 4])].join(';');
	const map = mapWith(mappings);
	assert.equal(originalLineFor(map, 1), null, 'a line with no mapping');
	assert.equal(originalLineFor(map, 2), 1);
	assert.equal(originalLineFor(map, 3), 3, 'the first segment answers for the line');
	assert.equal(originalLineFor(map, 4), null, 'past the last line');
	assert.equal(originalLineFor(map, 0), null);
	assert.equal(originalLineFor(map, 2.5), null);
	assert.equal(originalLineFor(JSON.stringify(map), 2), 1, 'the JSON text works as well as the object');
});

test('originalPositionFor: the segment the column falls in; before the first one, the first one', () => {
	const mappings = ['', encodeVlq([4, 0, 2, 0]) + ',' + encodeVlq([6, 0, -1, 4])].join(';');
	const map = mapWith(mappings);
	assert.deepEqual(originalPositionFor(map, 2, 5), { line: 3, column: 1, source: 'main.ts' }, 'column 5 (0-based 4) starts the first segment');
	assert.deepEqual(originalPositionFor(map, 2, 10), { line: 3, column: 1, source: 'main.ts' }, 'column 10 is still in it');
	assert.deepEqual(originalPositionFor(map, 2, 11), { line: 2, column: 5, source: 'main.ts' }, 'column 11 (0-based 10) starts the second');
	assert.deepEqual(originalPositionFor(map, 2, 1), { line: 3, column: 1, source: 'main.ts' }, 'before every segment: the first');
	assert.deepEqual(originalPositionFor(map, 2), { line: 3, column: 1, source: 'main.ts' }, 'no column: the line');
	assert.equal(originalPositionFor(map, 1, 1), null);
	assert.equal(originalPositionFor({ ...map, sources: undefined }, 2, 5).source, null, 'no sources list: source null');
});

test('broken or foreign maps give null, never a throw', () => {
	assert.equal(originalLineFor(null, 1), null);
	assert.equal(originalLineFor('{not json', 1), null);
	assert.equal(originalLineFor({ version: 3 }, 1), null, 'no mappings');
	assert.equal(originalLineFor({ version: 2, mappings: 'AAAA' }, 1), null, 'another version');
	assert.equal(originalLineFor(mapWith('AA%A'), 1), null, 'a bad character');
	assert.equal(originalLineFor(mapWith('AA%A'), 1), null, 'twice (the failure is remembered)');
	assert.equal(parseSourceMap({ mappings: 'AAAA' }).mappings, 'AAAA', 'a map without a version is read');
	assert.equal(parseSourceMap(42), null);
});

/** TypeScript from the installed Monaco, or null. */
async function loadTypeScript() {
	if (!existsSync(TS_SERVICES)) return null;
	return (await import(pathToFileURL(TS_SERVICES).href)).typescript;
}

const ts = await loadTypeScript();
const skipTs = ts ? false : 'monaco-editor (with its TypeScript) is not installed';

test("a real TypeScript program, compiled with the editor's options: every statement maps back to its line", { skip: skipTs }, () => {
	const source = [
		'type Pair = [number, number];', // 1 (no JavaScript)
		'const first: number = 1;', // 2
		'', // 3
		'interface Point { x: number; y: number }', // 4 (no JavaScript)
		'class Box { value = 5; get doubled(): number { return this.value * 2; } }', // 5 (several JS lines)
		'function sum(values: number[]): number {', // 6
		'  let total = 0;', // 7
		'  for (const value of values) total += value;', // 8
		'  if (total > 100) throw new Error("too big");', // 9
		'  return total;', // 10
		'}', // 11
		'enum Color { Red, Green }', // 12 (several JS lines)
		'console.log(sum([first, 2]), new Box().doubled, Color.Green);', // 13
	].join('\n');
	const { outputText, sourceMapText } = ts.transpileModule(source, { compilerOptions: EDITOR_COMPILER_OPTIONS, fileName: 'main.ts' });
	const generated = outputText.split('\n');
	const map = JSON.parse(sourceMapText);
	const lineOf = (needle) => generated.findIndex((line) => line.includes(needle)) + 1;

	assert.equal(generated[0], '"use strict";');
	assert.equal(lineOf('__esModule'), 2, 'moduleDetection force: the file is a module');
	assert.equal(originalLineFor(map, 1), null, '"use strict" has no TypeScript line');
	assert.equal(originalLineFor(map, 2), null, 'nor has the __esModule line');
	assert.equal(originalLineFor(map, lineOf('const first')), 2);
	assert.equal(originalLineFor(map, lineOf('class Box')), 5);
	assert.equal(originalLineFor(map, lineOf('value = 5')), 5, 'a class field on its own JavaScript line');
	assert.equal(originalLineFor(map, lineOf('get doubled')), 5);
	assert.equal(originalLineFor(map, lineOf('function sum')), 6);
	assert.equal(originalLineFor(map, lineOf('let total')), 7);
	assert.equal(originalLineFor(map, lineOf('for (const value')), 8);
	assert.equal(originalLineFor(map, lineOf('throw new Error')), 9, 'the throw, which TypeScript puts on a line of its own');
	assert.equal(originalLineFor(map, lineOf('return total')), 10);
	assert.equal(originalLineFor(map, lineOf('var Color')), 12);
	assert.equal(originalLineFor(map, lineOf('Color["Green"]')), 12);
	assert.equal(originalLineFor(map, lineOf('console.log')), 13);

	const throwLine = lineOf('throw new Error');
	const throwColumn = generated[throwLine - 1].indexOf('throw') + 1;
	assert.deepEqual(originalPositionFor(map, throwLine, throwColumn), { line: 9, column: source.split('\n')[8].indexOf('throw') + 1, source: 'main.ts' });
});

/** Run `js` as main.js in this machine's node: its stderr. */
function stderrOfNode(js) {
	const folder = mkdtempSync(path.join(os.tmpdir(), 'dwf-source-map-test-'));
	try {
		writeFileSync(path.join(folder, 'main.js'), js);
		return spawnSync(process.execPath, ['main.js'], { cwd: folder, encoding: 'utf8', timeout: 20000 }).stderr;
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}

test('a call, an arrow and a parameter list written over several lines become ONE JavaScript line: only the column finds the line that failed', { skip: skipTs }, () => {
	const cases = [
		{ source: ['const data: any = null;', 'console.log(', '  "total",', '  data.size,', ');'], failing: 4, statement: 2 },
		{ source: ['const data: any = null;', 'const out = [1, 2].map((n) =>', '  n + data.size);', 'console.log(out);'], failing: 3, statement: 2 },
		{ source: ['const data: any = null;', 'function add(a: number,', '  b: number) { return a + b + data.size; }', 'add(1,', '  2);'], failing: 3, statement: 2 },
	];
	for (const { source, failing, statement } of cases) {
		const { outputText, sourceMapText } = ts.transpileModule(source.join('\n'), { compilerOptions: EDITOR_COMPILER_OPTIONS, fileName: 'main.ts' });
		const map = JSON.parse(sourceMapText);
		const frame = stderrOfNode(outputText).match(/main\.js:(\d+):(\d+)/);
		assert.ok(frame, `no frame for ${source.join(' / ')}`);
		const [line, column] = [Number(frame[1]), Number(frame[2])];
		assert.equal(originalPositionFor(map, line, column).line, failing, `${source[failing - 1].trim()}: the line and column`);
		assert.equal(originalLineFor(map, line), statement, 'the line alone: where the statement starts');
	}
});

test("a real server's answer: Node 20's frames (line and column) map to the TypeScript line and column", () => {
	const run = JSON.parse(readFileSync(path.join(TYPESCRIPT_FIXTURES, 'typescript-run-throw.json'), 'utf8'));
	const frames = [...run.response.run.stderr.matchAll(/\/main\.js:(\d+):(\d+)/g)].map((match) => [Number(match[1]), Number(match[2])]);
	assert.deepEqual(frames, [
		[6, 15],
		[12, 13],
	]);
	const tsLines = run.typescript.split('\n');
	assert.deepEqual(originalPositionFor(run.map, 6, 15), { line: 7, column: tsLines[6].indexOf('new Error') + 1, source: 'main.ts' }, 'the throw');
	assert.deepEqual(originalPositionFor(run.map, 12, 13), { line: 14, column: tsLines[13].indexOf('firstItem') + 1, source: 'main.ts' }, 'its caller');

	const check = JSON.parse(readFileSync(path.join(TYPESCRIPT_FIXTURES, 'typescript-check-throw.json'), 'utf8'));
	const readerFrame = check.response.run.stderr.match(/\/solution\.js:(\d+):(\d+)/);
	assert.equal(originalPositionFor(check.readerMap, Number(readerFrame[1]), Number(readerFrame[2])).line, 2, "the reader's throw, through the reader's own map");
});
