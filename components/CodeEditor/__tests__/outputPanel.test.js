/**
 * outputPanel.test.js — the output area's notices (../OutputPanel.jsx), rendered on the server
 * through this folder's module hooks (jsxHooks.js), with '@theme/CodeBlock' (Docusaurus's code
 * block, which needs the site's theme) drawing nothing:
 *   - a failed request and a stopped wait are notices WITHOUT role="alert" (MUI's Alert would
 *     interrupt a screen reader), inside the polite live region that announces them;
 *   - the idle hint is there before any run;
 *   - the hint cue (2026-10-26): with `hintCue` the idle line adds "Hints available: 3 (click
 *     [bulb] to reveal)." — the same words for one hint — the header's light bulb drawn inline
 *     (MUI's LightbulbOutlined path, compared with MUI's own file), hidden from screen readers,
 *     who hear "the Hints button" instead (the button's name); none for a `hintCue` of 0 (or
 *     anything but a whole number above 0) or once a run is on its way — that the editor passes
 *     0 while the hints area is open is useExercise.test.js's (hints.cue);
 *   - placeholder parity: the server-rendered placeholder (index.jsx) draws exactly the idle
 *     line the editor's output area draws, cue and icon included, so nothing jumps on load.
 * Run with `npm run test:shared`.
 * To change it: a new notice or idle line of ../OutputPanel.jsx gets a test here, rendered through the
 * hooks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { resolvePackage } from './paths.js';

/** A module hook: '@theme/CodeBlock' draws nothing (the notices never draw one). */
const CODE_BLOCK_STUB = 'export default function CodeBlock() { return null; }';
const CODE_BLOCK_HOOK = [
	'export async function resolve(specifier, context, nextResolve) {',
	`	if (specifier === '@theme/CodeBlock') return { url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(CODE_BLOCK_STUB)}`)}, shortCircuit: true };`,
	'	return nextResolve(specifier, context);',
	'}',
].join('\n');

register('./jsxHooks.js', import.meta.url);
register(`data:text/javascript,${encodeURIComponent(CODE_BLOCK_HOOK)}`);

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: OutputPanel } = await import('../OutputPanel.jsx');
const { RUN_PHASES } = await import('../useCodeRun.js');
const { HINT_CUE, IDLE_HINT, IDLE_HINT_TOUCH, IDLE_HINT_UNAVAILABLE, RUN_SHORTCUT, STOPPED_NOTICE, hintCueText } = await import('../messages.js');
const { default: CodeEditor } = await import('../index.jsx');
const { LIGHTBULB_PATH } = await import('../IdleLine.jsx');

/** The panel for `phase`, with nothing else to show. */
function renderPhase(phase, overrides = {}) {
	return renderToStaticMarkup(createElement(OutputPanel, { phase, summary: null, error: null, runningLabel: '', limits: {}, errorRows: [], ...overrides }));
}

/** The text of the polite live region (the first aria-live="polite" element). */
function liveRegion(html) {
	const match = html.match(/<[a-z]+[^>]*aria-live="polite"[^>]*>([\s\S]*)/);
	return match ? match[1] : '';
}

test('a failed request: a notice with no role="alert", inside the polite region', () => {
	const html = renderPhase(RUN_PHASES.failed, { error: new Error('The code runner did not answer.') });
	assert.ok(html.includes('The code runner did not answer.'));
	assert.doesNotMatch(html, /role="alert"/);
	assert.ok(liveRegion(html).includes('The code runner did not answer.'), 'announced by the polite region around it');
});

test('a stopped wait: a notice with no role="alert", inside the polite region', () => {
	const html = renderPhase(RUN_PHASES.stopped);
	assert.ok(html.includes(STOPPED_NOTICE));
	assert.doesNotMatch(html, /role="alert"/);
	assert.ok(liveRegion(html).includes(STOPPED_NOTICE));
});

test('before any run: the idle hint', () => {
	assert.ok(renderPhase(RUN_PHASES.idle).includes(IDLE_HINT));
});

test('before any run, when the editor could not load (Run greyed out): one idle line that names no Run, no shortcut and no cue', () => {
	for (const touch of [false, true]) {
		const html = renderPhase(RUN_PHASES.idle, { editorFailed: true, hintCue: 3, touch });
		assert.equal(idleLineOf(html), `<p class="hint">${IDLE_HINT_UNAVAILABLE}</p>`, `touch ${touch}`);
		assert.ok(!html.includes(IDLE_HINT) && !html.includes(IDLE_HINT_TOUCH) && !html.includes(RUN_SHORTCUT), 'no "Run the code"');
		assert.doesNotMatch(html, /Hints available/);
	}
	assert.doesNotMatch(IDLE_HINT_UNAVAILABLE, /\bRun\b|⌘|Ctrl/, 'the words themselves name no Run and no key');
});

/** The idle line (<p class="hint">…</p>) of a piece of markup, or null. */
function idleLineOf(html) {
	return html.match(/<p class="hint">[\s\S]*?<\/p>/)?.[0] ?? null;
}

/** The text a screen reader gets from markup: tags dropped, aria-hidden parts (the icon) left out. */
function spokenText(html) {
	return html.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '');
}

test('the hint cue: "Hints available: 3 (click [bulb] to reveal)." after the idle hint, inside the polite region', () => {
	const html = renderPhase(RUN_PHASES.idle, { hintCue: 3 });
	const line = idleLineOf(html);
	assert.ok(line.startsWith(`<p class="hint">${IDLE_HINT} <span>${HINT_CUE.before(3)}<svg class="cueIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`));
	assert.ok(line.includes(`<path d="${LIGHTBULB_PATH}"></path></svg><span class="visuallyHidden">${HINT_CUE.icon}</span>${HINT_CUE.after}</span></p>`));
	assert.equal(spokenText(line), `${IDLE_HINT} ${hintCueText(3)}`, 'read out as "… (click the Hints button to reveal)."');
	assert.ok(liveRegion(html).includes('Hints available: 3'), 'in the same polite region as the idle hint');
});

test('the hint cue for one hint uses the same words: "Hints available: 1 (click [bulb] to reveal)."', () => {
	const line = idleLineOf(renderPhase(RUN_PHASES.idle, { hintCue: 1 }));
	assert.equal(spokenText(line), `${IDLE_HINT} Hints available: 1 (click the Hints button to reveal).`);
});

test('no cue for a hintCue of 0 (or anything but a whole number above 0), and none once a run is on its way', () => {
	for (const hintCue of [0, undefined, -2, 1.5, null]) {
		assert.equal(idleLineOf(renderPhase(RUN_PHASES.idle, { hintCue })), `<p class="hint">${IDLE_HINT}</p>`, `hintCue ${hintCue}`);
	}
	assert.doesNotMatch(renderPhase(RUN_PHASES.running, { hintCue: 3 }), /Hints available/);
	assert.doesNotMatch(renderPhase(RUN_PHASES.stopped, { hintCue: 3 }), /Hints available/);
});

test("the cue's light bulb is the header's: MUI's LightbulbOutlined, path for path", () => {
	const mui = readFileSync(path.join(resolvePackage('@mui/icons-material'), 'LightbulbOutlined.js'), 'utf8');
	assert.equal(LIGHTBULB_PATH, mui.match(/\bd: "([^"]+)"/)[1]);
	const toolbar = readFileSync(new URL('../Toolbar.jsx', import.meta.url), 'utf8');
	assert.match(toolbar, /import LightbulbOutlinedIcon from '@mui\/icons-material\/LightbulbOutlined';/, 'the header draws that icon');
});

test('placeholder parity: the server-rendered placeholder draws exactly the idle line the output area draws (with and without hints)', () => {
	const cases = [
		[{ initialCode: 'x', hints: ['a', 'b', 'c'] }, 3],
		[{ initialCode: 'x', hints: ['a'] }, 1],
		[{ initialCode: 'x', hints: ['a', 'b'], tests: 'check("x", x, 1)', expectedOutput: '1\n' }, 2],
		[{ initialCode: 'x' }, 0],
	];
	for (const [props, hintCue] of cases) {
		const placeholder = idleLineOf(renderToStaticMarkup(createElement(CodeEditor, props)));
		const editor = idleLineOf(renderPhase(RUN_PHASES.idle, { hintCue }));
		assert.equal(placeholder, editor, JSON.stringify(props));
	}
});
