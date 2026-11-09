/**
 * scripts/lib/ask.mjs: one yes-or-no question on the terminal. It reads a line from stdin, so a test
 * can pipe an answer in. No line at all, as in a script with nothing on stdin, is not a yes: the
 * caller says how to skip the question. Once the line is read, stdin is let go, or a terminal would
 * keep the script running after its last line.
 *
 * HOW TO CHANGE IT
 *   YES_ANSWERS holds the words that count as a yes.
 */

import readline from 'node:readline';

const YES_ANSWERS = new Set(['y', 'yes']);

/** The next line of stdin, or null when stdin has ended. Stdin is let go either way. */
async function readLine(input) {
  const reader = readline.createInterface({ input, terminal: false });
  try {
    for await (const line of reader) return line;
    return null;
  } finally {
    reader.close();
    input.pause();
  }
}

/** Asks once. { answered, yes }. */
export async function askOnce(question, input = process.stdin, output = process.stdout) {
  output.write(question);
  const line = await readLine(input);
  if (line === null) output.write('\n');
  const yes = line !== null && YES_ANSWERS.has(line.trim().toLowerCase());
  return { answered: line !== null, yes };
}
