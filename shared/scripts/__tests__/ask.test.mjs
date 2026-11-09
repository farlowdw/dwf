/**
 * scripts/__tests__/ask.test.mjs: the one question. A terminal keeps stdin open after the answer, and a
 * script that holds on to it never ends, so each run here answers on a pipe that it leaves open, as a
 * terminal does, and the process must end by itself.
 *
 * HOW TO CHANGE IT
 *   A new answer word: a row in ANSWERS. ENDS_WITHIN_MS is how long a process may take to end.
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stopProcess } from './fixture.mjs';

const ASK = fileURLToPath(new URL('../lib/ask.mjs', import.meta.url));

/** How long a process may take to end once it has its answer. Much longer than it needs. */
const ENDS_WITHIN_MS = 10_000;

/** [what is typed, the result askOnce gives] */
const ANSWERS = [
  ['y\n', { answered: true, yes: true }],
  ['n\n', { answered: true, yes: false }],
  ['Yes\n', { answered: true, yes: true }],
];

/** A process that asks once and prints the result. Its stdin is a pipe. */
function asker(t) {
  const code = `import(${JSON.stringify(ASK)}).then(({ askOnce }) => askOnce('Go? ')).then((r) => console.log(JSON.stringify(r)));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['pipe', 'pipe', 'inherit'] });
  t.after(() => stopProcess(child));
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  return { child, output: () => output };
}

/** Resolves with the exit code, or with 'still running' at the limit. */
function endOf(child) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('still running'), ENDS_WITHIN_MS);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

for (const [typed, result] of ANSWERS) {
  test(`an answer of ${JSON.stringify(typed.trim())} on a stdin left open ends the process by itself`, async (t) => {
    const { child, output } = asker(t);
    const ended = endOf(child);
    child.stdin.write(typed);
    assert.equal(await ended, 0, 'the process held on to stdin after the answer');
    assert.equal(output(), `Go? ${JSON.stringify(result)}\n`);
  });
}

test('a stdin that ends with no answer is no yes, and ends the process', async (t) => {
  const { child, output } = asker(t);
  const ended = endOf(child);
  child.stdin.end();
  assert.equal(await ended, 0);
  assert.equal(output(), `Go? \n${JSON.stringify({ answered: false, yes: false })}\n`);
});
