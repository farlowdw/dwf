/**
 * output.js — the text "Copy output" puts on the clipboard: exactly what the output area shows
 * under the status line (OutputPanel.jsx > RunOutput): a compiled language's warnings ("Compiler
 * output", when it compiled), then the program's output. Pure; `node --test` checks it
 * (__tests__/output.test.js).
 *
 *     copyableOutput(summary)   // '' when there is nothing to copy (no run yet, or no output)
 *
 * HOW TO CHANGE IT  Keep it in step with OutputPanel.jsx > RunOutput (the blocks it draws).
 */

/** The text of the output area for a run's summary (lib/codeRunner/result.js > summarizeResult), or ''. */
export function copyableOutput(summary) {
	if (!summary) return '';
	const compilerWarnings = summary.stage === 'run' && summary.compileOutput ? summary.compileOutput : '';
	return [compilerWarnings, summary.output || ''].filter((part) => part !== '').join('\n');
}
