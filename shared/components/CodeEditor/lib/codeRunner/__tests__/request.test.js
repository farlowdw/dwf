/**
 * request.test.js — the run request's body (../request.js): Piston's payload shape, the default
 * file name per language, several files in order (an exercise check), the limits merged over DEFAULT_LIMITS (bad values ignored) with the
 * timeouts clamped into TIMEOUT_BOUNDS (effectiveLimits), "*" for every any-version selector,
 * and the old `outputSettings` prop read without inventing defaults. Run with `npm run test:shared`.
 * To change it: a new field or limit of ../request.js gets a test here; the bounds are its
 * DEFAULT_LIMITS and TIMEOUT_BOUNDS.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ANY_VERSION, DEFAULT_LIMITS, TIMEOUT_BOUNDS, buildExecuteRequest, effectiveLimits, fromLegacyOutputSettings } from '../request.js';

/** The keys of every payload, in Piston's names. */
const PAYLOAD_KEYS = ['args', 'compile_memory_limit', 'compile_timeout', 'files', 'language', 'run_memory_limit', 'run_timeout', 'stdin', 'version'];

test('DEFAULT_LIMITS: the promised values, frozen', () => {
	assert.deepEqual(DEFAULT_LIMITS, { compileTimeout: 10000, runTimeout: 3000, compileMemoryLimit: -1, runMemoryLimit: -1 });
	assert.equal(Object.isFrozen(DEFAULT_LIMITS), true);
});

test('buildExecuteRequest: the full Piston payload with the defaults', () => {
	const payload = buildExecuteRequest({ language: 'python', version: '3.12.0', code: 'print(1)' });
	assert.deepEqual(payload, {
		language: 'python',
		version: '3.12.0',
		files: [{ name: 'main.py', content: 'print(1)' }],
		stdin: '',
		args: [],
		compile_timeout: 10000,
		run_timeout: 3000,
		compile_memory_limit: -1,
		run_memory_limit: -1,
	});
	assert.deepEqual(Object.keys(payload).sort(), PAYLOAD_KEYS);
	assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload, 'plain JSON');
});

test('buildExecuteRequest: the file name follows the language unless one is given', () => {
	const fileFor = (options) => buildExecuteRequest({ code: '', version: '*', ...options }).files[0].name;
	assert.equal(fileFor({ language: 'java' }), 'Main.java', 'not installed: unverified, left as it was');
	assert.equal(fileFor({ language: 'c++' }), 'main', "Piston's C++ runner adds .cpp itself");
	assert.equal(fileFor({ language: 'cpp' }), 'main', 'an alias');
	assert.equal(fileFor({ language: 'c' }), 'main', "Piston's C runner adds .c itself");
	assert.equal(fileFor({ language: 'typescript' }), 'main', "Piston's TypeScript runner adds .ts itself");
	assert.equal(fileFor({ language: 'javascript' }), 'main.js', 'the runner uses the name as given');
	assert.equal(fileFor({ language: 'bash' }), 'main.sh');
	assert.equal(fileFor({ language: 'csharp' }), 'Main.cs');
	assert.equal(fileFor({ language: 'kotlin' }), 'main.kt');
	assert.equal(fileFor({ language: 'py2' }), 'main.py', 'Python 2');
	assert.equal(fileFor({ language: 'rscript' }), 'main.r');
	assert.equal(fileFor({ language: 'zig' }), 'main.zig');
	assert.equal(fileFor({ language: 'brainfuck' }), 'main.txt', 'unknown language');
	assert.equal(fileFor({ language: 'java', fileName: 'Solution.java' }), 'Solution.java');
	assert.equal(fileFor({ language: 'java', fileName: '  ' }), 'Main.java', 'a blank name is no name');
});

test('buildExecuteRequest: the language is sent as given (Piston knows its aliases)', () => {
	assert.equal(buildExecuteRequest({ language: 'py', code: '' }).language, 'py');
	assert.equal(buildExecuteRequest({ language: ' c++ ', code: '' }).language, 'c++');
});

test('buildExecuteRequest: an empty version becomes "*" (the newest installed)', () => {
	assert.equal(ANY_VERSION, '*');
	assert.equal(buildExecuteRequest({ language: 'python', code: '' }).version, '*');
	assert.equal(buildExecuteRequest({ language: 'python', version: '', code: '' }).version, '*');
	assert.equal(buildExecuteRequest({ language: 'python', version: null, code: '' }).version, '*');
	assert.equal(buildExecuteRequest({ language: 'python', version: '3.x', code: '' }).version, '3.x');
});

test('buildExecuteRequest: every any-version selector is sent as "*" (Piston does not know "latest")', () => {
	for (const version of ['latest', 'LATEST', ' Latest ', '*', ' * ', '   ']) {
		assert.equal(buildExecuteRequest({ language: 'python', version, code: '' }).version, '*', JSON.stringify(version));
	}
	assert.equal(buildExecuteRequest({ language: 'python', version: ' 3.12.0 ', code: '' }).version, '3.12.0', 'trimmed');
	assert.equal(buildExecuteRequest({ language: 'python', version: '^3.9', code: '' }).version, '^3.9', 'a range Piston understands passes');
	assert.equal(buildExecuteRequest({ language: 'python', version: 3.1, code: '' }).version, '3.1', 'a number as text');
});

test('TIMEOUT_BOUNDS: the Piston server\'s limits, frozen all the way down', () => {
	assert.deepEqual(TIMEOUT_BOUNDS, { compileTimeout: { min: 1, max: 10000 }, runTimeout: { min: 1, max: 3000 } });
	assert.equal(Object.isFrozen(TIMEOUT_BOUNDS), true);
	assert.equal(Object.isFrozen(TIMEOUT_BOUNDS.compileTimeout), true);
	assert.equal(Object.isFrozen(TIMEOUT_BOUNDS.runTimeout), true);
	for (const name of Object.keys(TIMEOUT_BOUNDS)) {
		const { min, max } = TIMEOUT_BOUNDS[name];
		assert.equal(DEFAULT_LIMITS[name] >= min && DEFAULT_LIMITS[name] <= max, true, `${name}: the default is inside its bounds`);
	}
});

test('effectiveLimits: the defaults when the page sets nothing', () => {
	assert.deepEqual(effectiveLimits(), DEFAULT_LIMITS);
	assert.deepEqual(effectiveLimits({}), DEFAULT_LIMITS);
	assert.deepEqual(effectiveLimits(null), DEFAULT_LIMITS);
	assert.deepEqual(effectiveLimits('3 s'), DEFAULT_LIMITS);
	assert.notEqual(effectiveLimits(), DEFAULT_LIMITS, 'a new object');
});

test('effectiveLimits: timeouts are rounded and clamped into TIMEOUT_BOUNDS', () => {
	assert.equal(effectiveLimits({ runTimeout: 5000 }).runTimeout, 3000, 'over the server\'s 3 s');
	assert.equal(effectiveLimits({ compileTimeout: 60000 }).compileTimeout, 10000, 'over the server\'s 10 s');
	assert.equal(effectiveLimits({ runTimeout: 2000 }).runTimeout, 2000, 'inside: unchanged');
	assert.equal(effectiveLimits({ runTimeout: 1500.6 }).runTimeout, 1501, 'whole ms');
	assert.equal(effectiveLimits({ runTimeout: 0 }).runTimeout, 1);
	assert.equal(effectiveLimits({ runTimeout: 0.2 }).runTimeout, 1, 'rounds to 0, then up to the minimum');
	assert.equal(effectiveLimits({ compileTimeout: -500 }).compileTimeout, 1);
	assert.equal(effectiveLimits({ runTimeout: Number.POSITIVE_INFINITY }).runTimeout, 3000, 'not finite: the default');
});

test('effectiveLimits: memory limits pass through as before', () => {
	const limits = effectiveLimits({ runMemoryLimit: 128000000, compileMemoryLimit: -1, runTimeout: 2500 });
	assert.deepEqual(limits, { compileTimeout: 10000, runTimeout: 2500, compileMemoryLimit: -1, runMemoryLimit: 128000000 });
	assert.equal(effectiveLimits({ runMemoryLimit: Number.NaN }).runMemoryLimit, -1);
});

test('buildExecuteRequest sends exactly effectiveLimits (the payload and the status line agree)', () => {
	const pageLimits = { runTimeout: 5000, compileTimeout: 20000.4, runMemoryLimit: 64000000 };
	const limits = effectiveLimits(pageLimits);
	const payload = buildExecuteRequest({ language: 'python', code: '', limits: pageLimits });
	assert.equal(payload.run_timeout, limits.runTimeout);
	assert.equal(payload.compile_timeout, limits.compileTimeout);
	assert.equal(payload.run_memory_limit, limits.runMemoryLimit);
	assert.equal(payload.compile_memory_limit, limits.compileMemoryLimit);
	assert.equal(payload.run_timeout, 3000);
	assert.equal(payload.compile_timeout, 10000);
});

test('buildExecuteRequest: stdin, args and code are strings', () => {
	const payload = buildExecuteRequest({ language: 'python', version: '*', code: undefined, stdin: '1 2\n3', args: ['--fast', 7, null] });
	assert.equal(payload.files[0].content, '');
	assert.equal(payload.stdin, '1 2\n3');
	assert.deepEqual(payload.args, ['--fast', '7', '']);
	assert.deepEqual(buildExecuteRequest({ language: 'python', code: '', args: '--fast' }).args, [], 'args must be a list');
	assert.equal(buildExecuteRequest({ language: 'python', code: '', stdin: null }).stdin, '');
});

test('buildExecuteRequest: limits merge over the defaults', () => {
	const payload = buildExecuteRequest({ language: 'python', code: '', limits: { runTimeout: 2000, runMemoryLimit: 128000000 } });
	assert.equal(payload.run_timeout, 2000);
	assert.equal(payload.run_memory_limit, 128000000);
	assert.equal(payload.compile_timeout, 10000);
	assert.equal(payload.compile_memory_limit, -1);
});

test('buildExecuteRequest: a limit that is not a finite number keeps its default', () => {
	const limits = { runTimeout: undefined, compileTimeout: '5000', runMemoryLimit: Number.NaN, compileMemoryLimit: Number.POSITIVE_INFINITY };
	const payload = buildExecuteRequest({ language: 'python', code: '', limits });
	assert.equal(payload.run_timeout, 3000);
	assert.equal(payload.compile_timeout, 10000);
	assert.equal(payload.run_memory_limit, -1);
	assert.equal(payload.compile_memory_limit, -1);
	assert.equal(buildExecuteRequest({ language: 'python', code: '', limits: null }).run_timeout, 3000);
	assert.equal(buildExecuteRequest({ language: 'python', code: '', limits: { bogus: 1 } }).bogus, undefined, 'unknown limits are not sent');
});

test('fromLegacyOutputSettings: every old snake_case key', () => {
	const legacy = {
		language: 'python',
		version: '3.10.0',
		stdin: 'abc',
		args: ['x'],
		compile_timeout: 5000,
		run_timeout: 2000,
		compile_memory_limit: 1000,
		run_memory_limit: 2000,
	};
	assert.deepEqual(fromLegacyOutputSettings(legacy), {
		language: 'python',
		version: '3.10.0',
		stdin: 'abc',
		args: ['x'],
		limits: { compileTimeout: 5000, runTimeout: 2000, compileMemoryLimit: 1000, runMemoryLimit: 2000 },
	});
});

test('fromLegacyOutputSettings: absent keys stay absent (never defaults)', () => {
	assert.deepEqual(fromLegacyOutputSettings({}), { limits: {} });
	assert.deepEqual(fromLegacyOutputSettings(), { limits: {} });
	assert.deepEqual(fromLegacyOutputSettings(null), { limits: {} });
	assert.deepEqual(fromLegacyOutputSettings('python'), { limits: {} });
	const partial = fromLegacyOutputSettings({ run_timeout: 4000, version: '3.12.0' });
	assert.deepEqual(partial, { version: '3.12.0', limits: { runTimeout: 4000 } });
	assert.equal('language' in partial, false);
	assert.equal('compileTimeout' in partial.limits, false);
});

test('fromLegacyOutputSettings: null / undefined values and unknown keys are ignored; values pass as they are', () => {
	const result = fromLegacyOutputSettings({ language: null, stdin: undefined, run_timeout: null, editorRef: {}, initial_code: 'x', version: '' });
	assert.deepEqual(result, { version: '', limits: {} }, "'' is a value: the caller decides what it means");
	assert.deepEqual(fromLegacyOutputSettings({ args: [], stdin: '' }), { stdin: '', args: [], limits: {} });
});

test('fromLegacyOutputSettings feeds buildExecuteRequest', () => {
	const legacy = fromLegacyOutputSettings({ language: 'python', version: '3.12.0', run_timeout: 1500 });
	const payload = buildExecuteRequest({ ...legacy, code: 'print(2)' });
	assert.equal(payload.run_timeout, 1500);
	assert.equal(payload.compile_timeout, 10000);
	assert.equal(payload.version, '3.12.0');
});

test('buildExecuteRequest sends Go, C, C++ and TypeScript code as "main": their Piston runners add the extension', () => {
	const request = buildExecuteRequest({ language: 'go', version: '1.16.2', code: 'package main' });
	assert.equal(request.files[0].name, 'main');
	for (const language of ['c', 'c++', 'g++', 'typescript', 'ts']) {
		assert.equal(buildExecuteRequest({ language, code: 'x' }).files[0].name, 'main', language);
	}
	assert.equal(buildExecuteRequest({ language: 'python', code: 'x' }).files[0].name, 'main.py');
	assert.equal(buildExecuteRequest({ language: 'c', fileName: 'solver', code: 'x' }).files[0].name, 'solver', 'a page\'s own name wins');
});

test('buildExecuteRequest: several files (an exercise check) are sent in order, the first one run', () => {
	const payload = buildExecuteRequest({
		language: 'python',
		version: '3.12.0',
		files: [
			{ name: 'main.py', content: 'from solution import add' },
			{ name: ' solution.py ', content: 'def add(a, b): return a + b' },
			{ content: 7 },
		],
		code: 'ignored when files are given',
	});
	assert.deepEqual(payload.files, [
		{ name: 'main.py', content: 'from solution import add' },
		{ name: 'solution.py', content: 'def add(a, b): return a + b' },
		{ content: '7' },
	]);
	assert.deepEqual(buildExecuteRequest({ language: 'python', version: '*', code: 'x', files: [] }).files, [{ name: 'main.py', content: 'x' }], 'an empty list: the ordinary single file');
});
