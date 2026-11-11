/**
 * decorations.test.js — the editor's marked lines and revealLines (../decorations.js), driven
 * with small fakes of Monaco's text model (it records deltaDecorations), editor and folding
 * model: the author's marks (one whole-line decoration per line, the kind's global classes,
 * never growing at its edges), lines and kinds that do not fit (left out), the marks living on
 * each language's MODEL (a language switch keeps them), the step's lines (a layer of their
 * own, with classes of their own that sort before every kind's, a lower zIndex and no number
 * class: an author's kind wins a line the step shares), the flash (gone after FLASH_MS; a
 * second flash alternates a class), dispose, following the reader's edits (an editable fake
 * model that moves its decorations roughly as Monaco does: a removed line takes its mark, two
 * marks on one line become one, an in-line rewrite and Enter keep it, a layer set by another
 * listener of the same edit is left alone, setValue drops all), and revealLines / revealSpan:
 * exactly the folds that hide the lines are opened (not a fold whose first line is the line),
 * then the editor scrolls — to all the lines when they fit, else to the first range; a folding
 * model whose internals changed costs only the unfolding. With the run library's real output
 * too: a snippet's magic comments (magicComments.js) as the marks, and steps (steps.js) over
 * the site guide's folded snippet (squares.py). Run with `npm run test:shared`.
 * To change it: a new rule of ../decorations.js (a mark, a layer, an edit it follows) gets a test here,
 * over the same fakes of Monaco.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	CLASS_PREFIX,
	FLASH_AGAIN_CLASS,
	FLASH_CLASS,
	FLASH_MARGIN_CLASS,
	FLASH_MS,
	FOLDING_CONTRIBUTION_ID,
	LINE_KINDS,
	STEP_CLASS,
	STEP_Z_INDEX,
	createLineDecorations,
	kindClassNames,
	lineRemovedBy,
	prefersReducedMotion,
	rangesWithin,
	regionsHiding,
	revealLines,
	revealSpan,
	revealTarget,
	stepClassNames,
} from '../decorations.js';
import { LINE_KINDS as MAGIC_COMMENT_KINDS, stripMagicComments } from '../lib/codeRunner/magicComments.js';
import { normalizeSteps } from '../lib/codeRunner/steps.js';

/** monaco.Range, reduced to its four numbers. */
class FakeRange {
	constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
		Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
	}
}

/** The id fakeMonaco gives EditorOption.lineHeight. */
const LINE_HEIGHT_OPTION = 75;

const fakeMonaco = Object.freeze({
	Range: FakeRange,
	editor: Object.freeze({
		TrackedRangeStickiness: Object.freeze({ AlwaysGrowsWhenTypingAtEdges: 0, NeverGrowsWhenTypingAtEdges: 1 }),
		ScrollType: Object.freeze({ Smooth: 0, Immediate: 1 }),
		EditorOption: Object.freeze({ lineHeight: LINE_HEIGHT_OPTION }),
	}),
});

/** A text model over `code` that keeps its decorations (id -> { range, options }) and logs deltaDecorations. */
function fakeModel(code) {
	const lines = code.split('\n');
	let nextId = 1;
	return {
		decorations: new Map(),
		calls: [],
		disposed: false,
		getLineCount: () => lines.length,
		getLineMaxColumn: (line) => lines[line - 1].length + 1,
		isDisposed() {
			return this.disposed;
		},
		deltaDecorations(oldIds, newDecorations, ...rest) {
			this.calls.push({ oldIds: [...oldIds], added: newDecorations.length, extraArguments: rest.length });
			for (const id of oldIds) this.decorations.delete(id);
			return newDecorations.map((decoration) => {
				const id = `d${nextId++}`;
				this.decorations.set(id, decoration);
				return id;
			});
		},
	};
}

/** The decorations of a model whose className holds `className`. */
function decorationsWith(model, className) {
	return [...model.decorations.values()].filter((decoration) => decoration.options.className?.split(' ').includes(className));
}

/** The lines of those decorations, in order. */
function linesWith(model, className) {
	return decorationsWith(model, className)
		.map((decoration) => decoration.range.startLineNumber)
		.sort((a, b) => a - b);
}

/**
 * Monaco's folding model over `regions` ([start, end, collapsed], in Monaco's order): regions
 * around a line come innermost first, as fresh objects each call; toggles are logged.
 */
function fakeFoldingModel(regions) {
	const state = regions.map(([start, end, collapsed]) => ({ start, end, collapsed }));
	const toRegion = (index) => ({
		regionIndex: index,
		startLineNumber: state[index].start,
		endLineNumber: state[index].end,
		isCollapsed: state[index].collapsed,
	});
	return {
		state,
		toggles: [],
		getAllRegionsAtLine(line, filter) {
			const around = state
				.map((_, index) => index)
				.filter((index) => state[index].start <= line && line <= state[index].end)
				.sort((a, b) => state[b].start - state[a].start);
			const result = [];
			around.forEach((index, depth) => {
				const region = toRegion(index);
				if (!filter || filter(region, depth + 1)) result.push(region);
			});
			return result;
		},
		toggleCollapseState(list) {
			this.toggles.push(list.map((region) => region.regionIndex));
			for (const region of list) state[region.regionIndex].collapsed = !state[region.regionIndex].collapsed;
		},
	};
}

/**
 * An editor showing `model`: its folding controller hands out `foldingModel` (null: folding is
 * off; `controller: false`: no folding controller at all); its window is `height` px of
 * `lineHeight` px lines; reveals are logged.
 */
function fakeEditor(model, { foldingModel = null, controller = true, height = 210, lineHeight = 21 } = {}) {
	return {
		model,
		reveals: [],
		getModel() {
			return this.model;
		},
		getContribution(id) {
			if (!controller || id !== FOLDING_CONTRIBUTION_ID) return null;
			return { getFoldingModel: () => (foldingModel ? Promise.resolve(foldingModel) : null) };
		},
		revealLinesInCenterIfOutsideViewport(start, end, scrollType) {
			this.reveals.push([start, end, scrollType]);
		},
		getLayoutInfo: () => ({ height }),
		getOption: (id) => (id === LINE_HEIGHT_OPTION ? lineHeight : undefined),
	};
}

/** Timers that run only when told to. */
function fakeTimers() {
	const pending = new Map();
	let nextId = 1;
	return {
		pending,
		setTimer: (callback, ms) => {
			const id = nextId++;
			pending.set(id, { callback, ms });
			return id;
		},
		clearTimer: (id) => pending.delete(id),
		runAll() {
			for (const [id, { callback }] of [...pending]) {
				pending.delete(id);
				callback();
			}
		},
	};
}

const CODE = ['def f(n):', '    total = 0', '', '    for i in range(n):', '        total += i', '    return total', 'print(f(4))'].join('\n');

test("the author's marks: one whole-line decoration per line, with the kind's global classes, never growing at its edges", () => {
	const model = fakeModel(CODE);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	assert.equal(lines.set({ 2: 'highlight', 3: 'error', 5: 'add' }), 3);
	const [error] = decorationsWith(model, `${CLASS_PREFIX}kind-error`);
	assert.deepEqual(error.options, {
		isWholeLine: true,
		stickiness: 1,
		className: 'dwf-ce-line dwf-ce-kind-error',
		marginClassName: 'dwf-ce-margin dwf-ce-kind-error',
		lineNumberClassName: 'dwf-ce-number dwf-ce-kind-error',
	});
	assert.deepEqual({ ...error.range }, { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 1 }, 'an empty line: an empty range');
	const [added] = decorationsWith(model, `${CLASS_PREFIX}kind-add`);
	const line5 = CODE.split('\n')[4];
	assert.deepEqual({ ...added.range }, { startLineNumber: 5, startColumn: 1, endLineNumber: 5, endColumn: line5.length + 1 }, 'to the end of the line, so it follows its text');
	assert.deepEqual(linesWith(model, 'dwf-ce-line'), [2, 3, 5]);
});

test('every kind has its classes; the names start with the prefix guided.module.css uses', () => {
	assert.equal(LINE_KINDS, MAGIC_COMMENT_KINDS, "magicComments.js's own list: a kind a snippet can name is a kind drawn here");
	assert.deepEqual([...LINE_KINDS].sort(), ['add', 'error', 'highlight', 'remove', 'success', 'warning']);
	for (const kind of LINE_KINDS) {
		const names = kindClassNames(kind);
		for (const part of ['className', 'marginClassName', 'lineNumberClassName']) {
			assert.match(names[part], new RegExp(`^${CLASS_PREFIX}\\w+ ${CLASS_PREFIX}kind-${kind}$`));
		}
	}
	assert.ok(STEP_CLASS.startsWith(CLASS_PREFIX));
	assert.deepEqual(stepClassNames(), { className: `${CLASS_PREFIX}line ${STEP_CLASS}`, marginClassName: `${CLASS_PREFIX}margin ${STEP_CLASS}` });
});

test("the step's class names sort BEFORE every kind's (Monaco's margin draws by class name: the author's band goes over the step's)", () => {
	const step = stepClassNames();
	for (const kind of LINE_KINDS) {
		const names = kindClassNames(kind);
		assert.ok(step.className < names.className, `behind the code: ${step.className} before ${names.className}`);
		assert.ok(step.marginClassName < names.marginClassName, `under the gutter: ${step.marginClassName} before ${names.marginClassName}`);
	}
	assert.ok(STEP_Z_INDEX < 0, "behind the code Monaco sorts by zIndex first: the step's is below the marks' default 0");
});

test('lines the code lacks, unknown kinds and junk keys are left out; a new set replaces the old; {} and null take them off', () => {
	const model = fakeModel(CODE);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	assert.equal(lines.set({ 0: 'error', 1: 'error', 8: 'error', 2: 'glow', x: 'error', 2.5: 'error', 7: 'success' }), 2);
	assert.deepEqual(linesWith(model, 'dwf-ce-line'), [1, 7]);
	const firstIds = [...model.decorations.keys()];
	lines.set({ 4: 'warning' });
	assert.deepEqual(model.calls.at(-1).oldIds, firstIds, 'the earlier marks are removed in the same call');
	assert.deepEqual(linesWith(model, 'dwf-ce-line'), [4]);
	assert.equal(lines.set({}), 0);
	assert.equal(model.decorations.size, 0);
	lines.set({ 4: 'warning' });
	assert.equal(lines.set(null), 0);
	assert.equal(model.decorations.size, 0);
});

test("the marks live on each language's MODEL (no owner): a language switch keeps them, and they are not set again", () => {
	const python = fakeModel(CODE);
	const javascript = fakeModel('const a = 1;\nconsole.log(a);');
	const editor = fakeEditor(python);
	const lines = createLineDecorations(editor, fakeMonaco);
	lines.set({ 1: 'highlight', 6: 'success' });
	editor.model = javascript;
	lines.set({ 2: 'error' });
	assert.deepEqual(linesWith(python, 'dwf-ce-line'), [1, 6], "Python's marks are still on its model");
	assert.deepEqual(linesWith(javascript, 'dwf-ce-line'), [2]);
	assert.ok([...python.calls, ...javascript.calls].every((call) => call.extraArguments === 0), 'deltaDecorations without an owner id: every editor of the model shows them');
	editor.model = python;
	lines.set({ 3: 'warning' });
	assert.equal(python.calls.at(-1).oldIds.length, 2, "back on Python, a new set replaces Python's own marks");
	assert.deepEqual(linesWith(javascript, 'dwf-ce-line'), [2], "and leaves JavaScript's alone");
});

test("the step's lines: classes of their own, replacing the previous step's, and a layer of their own", () => {
	const model = fakeModel(CODE);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	lines.set({ 7: 'error' });
	assert.equal(lines.showStep([[2, 3], [5, 5]]), 3);
	assert.deepEqual(linesWith(model, STEP_CLASS), [2, 3, 5]);
	const [first] = decorationsWith(model, STEP_CLASS);
	assert.deepEqual(first.options, {
		isWholeLine: true,
		stickiness: 1,
		zIndex: STEP_Z_INDEX,
		className: `dwf-ce-line ${STEP_CLASS}`,
		marginClassName: `dwf-ce-margin ${STEP_CLASS}`,
	});
	lines.showStep([[6, 99]]);
	assert.deepEqual(linesWith(model, STEP_CLASS), [6, 7], 'cut to the code');
	assert.deepEqual(linesWith(model, 'dwf-ce-kind-error'), [7], "the author's marks are untouched");
	lines.set({});
	assert.deepEqual(linesWith(model, STEP_CLASS), [6, 7], "and set() leaves the step's lines alone");
	assert.equal(lines.showStep(null), 0);
	assert.equal(model.decorations.size, 0);
});

test("a step over lines the author marked: the step gives the number no class and stays under the marks, so the kind's colours win", () => {
	const model = fakeModel(CODE);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	lines.set({ 2: 'error', 3: 'highlight', 4: 'add' });
	lines.showStep([[2, 4]]);
	const step = decorationsWith(model, STEP_CLASS);
	assert.equal(step.length, 3);
	for (const decoration of step) {
		assert.equal(decoration.options.lineNumberClassName, undefined, 'no number class: Monaco would join it onto the kind-coloured number');
		assert.ok(decoration.options.zIndex < 0);
	}
	const marks = [...model.decorations.values()].filter((decoration) => decoration.options.lineNumberClassName);
	assert.deepEqual(
		marks.map((decoration) => decoration.options.lineNumberClassName),
		['dwf-ce-number dwf-ce-kind-error', 'dwf-ce-number dwf-ce-kind-highlight', 'dwf-ce-number dwf-ce-kind-add'],
		"each marked line's number carries its own kind only",
	);
	for (const mark of marks) {
		assert.equal(mark.options.zIndex, undefined, "the marks keep Monaco's default stack order (0), above the step's");
		assert.ok(step[0].options.marginClassName < mark.options.marginClassName, 'and sort after the step under the gutter');
	}
});

test('a flash: the flash classes on its lines, gone after FLASH_MS', () => {
	const model = fakeModel(CODE);
	const timers = fakeTimers();
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco, timers);
	assert.equal(lines.flash([[4, 5]]), 2);
	const [first] = decorationsWith(model, FLASH_CLASS);
	assert.equal(first.options.marginClassName, FLASH_MARGIN_CLASS);
	assert.equal(first.options.isWholeLine, true);
	assert.deepEqual(linesWith(model, FLASH_CLASS), [4, 5]);
	assert.deepEqual([...timers.pending.values()].map(({ ms }) => ms), [FLASH_MS]);
	timers.runAll();
	assert.equal(model.decorations.size, 0);
});

test('a second flash ends the first, restarts the timer and alternates a class (so Monaco redraws the lines)', () => {
	const model = fakeModel(CODE);
	const timers = fakeTimers();
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco, timers);
	lines.flash([[4, 4]]);
	lines.flash([[4, 4]]);
	assert.equal(timers.pending.size, 1, 'one timer: the first was cleared');
	assert.deepEqual(linesWith(model, FLASH_CLASS), [4], 'the first flash is gone');
	assert.ok(decorationsWith(model, FLASH_AGAIN_CLASS).length === 1, 'the second carries the alternating class');
	lines.flash([[4, 4]]);
	assert.equal(decorationsWith(model, FLASH_AGAIN_CLASS).length, 0, 'the third does not');
	assert.equal(lines.flash([]), 0, 'nothing to flash: nothing set, no timer');
	assert.equal(timers.pending.size, 0);
	assert.equal(model.decorations.size, 0);
});

test('a flash on another model ends the one before on its own model', () => {
	const python = fakeModel(CODE);
	const javascript = fakeModel('let a;\nlet b;');
	const editor = fakeEditor(python);
	const timers = fakeTimers();
	const lines = createLineDecorations(editor, fakeMonaco, timers);
	lines.flash([[1, 2]]);
	editor.model = javascript;
	lines.flash([[2, 2]]);
	assert.equal(python.decorations.size, 0);
	assert.deepEqual(linesWith(javascript, FLASH_CLASS), [2]);
	timers.runAll();
	assert.equal(javascript.decorations.size, 0);
});

test('dispose: every layer off every model (a disposed model is skipped), the timer cleared, later calls do nothing', () => {
	const python = fakeModel(CODE);
	const go = fakeModel('package main');
	const javascript = fakeModel('let a;');
	const editor = fakeEditor(python);
	const timers = fakeTimers();
	const lines = createLineDecorations(editor, fakeMonaco, timers);
	lines.set({ 1: 'error' });
	lines.showStep([[2, 2]]);
	lines.flash([[3, 3]]);
	editor.model = go;
	lines.set({ 1: 'success' });
	editor.model = javascript;
	lines.set({ 1: 'warning' });
	javascript.disposed = true;
	const javascriptCalls = javascript.calls.length;
	lines.dispose();
	assert.equal(python.decorations.size, 0);
	assert.equal(go.decorations.size, 0);
	assert.equal(javascript.calls.length, javascriptCalls, 'a disposed model is not touched');
	assert.equal(timers.pending.size, 0);
	assert.equal(lines.set({ 1: 'error' }), 0);
	assert.equal(lines.showStep([[1, 1]]), 0);
	assert.equal(lines.flash([[1, 1]]), 0);
	assert.doesNotThrow(() => lines.dispose(), 'twice is fine');
});

test('no model: nothing is set and nothing throws', () => {
	const editor = fakeEditor(null);
	const lines = createLineDecorations(editor, fakeMonaco, fakeTimers());
	assert.equal(lines.set({ 1: 'error' }), 0);
	assert.equal(lines.showStep([[1, 1]]), 0);
	assert.equal(lines.flash([[1, 1]]), 0);
	assert.doesNotThrow(() => lines.dispose());
});

test('rangesWithin: cut to the code; anything that is not a pair of whole numbers is left out', () => {
	assert.deepEqual(rangesWithin([[0, 2], [4, 9], [12, 14], [3, 3]], 10), [[1, 2], [4, 9], [3, 3]]);
	assert.deepEqual(rangesWithin([[1, 2, 3], [2.5, 3], 'x', null, [5, 4]], 10), []);
	assert.deepEqual(rangesWithin(undefined, 10), []);
	assert.deepEqual(rangesWithin([[1, 3]], 0), [], 'empty code');
});

test('revealTarget: every line when they fit; else the first range; else its top lines', () => {
	assert.deepEqual(revealTarget([[3, 5], [8, 9]], 10), [3, 9]);
	assert.deepEqual(revealTarget([[3, 5], [40, 42]], 10), [3, 5], 'a step of 3-5 and 40-42 does not centre on line 22');
	assert.deepEqual(revealTarget([[3, 30]], 10), [3, 12]);
	assert.deepEqual(revealTarget([[3, 5]], 0), [3, 3], 'no room at all: the first line');
	assert.deepEqual(revealTarget([[3, 5], [40, 42]], Infinity), [3, 42]);
});

test('revealLines opens exactly the collapsed folds that hide the lines, then scrolls to them', async () => {
	const code = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join('\n');
	// Monaco's order: [1, 10] around [3, 6], and a separate [20, 30]; all collapsed but [12, 15].
	const folding = fakeFoldingModel([
		[1, 10, true],
		[3, 6, true],
		[12, 15, false],
		[20, 30, true],
	]);
	const editor = fakeEditor(fakeModel(code), { foldingModel: folding, height: 420, lineHeight: 21 });
	assert.equal(await revealLines(editor, fakeMonaco, [[4, 5], [13, 13]], { smooth: true }), true);
	assert.deepEqual(folding.toggles, [[1, 0]], 'the inner fold and the one around it, each once; the open one and [20, 30] are left alone');
	assert.deepEqual(editor.reveals, [[4, 13, 0]], 'both ranges fit in 20 lines: all of them, smoothly');
});

test("revealLines leaves a fold closed when the line is the fold's first, visible line", async () => {
	const folding = fakeFoldingModel([
		[1, 10, true],
		[3, 6, true],
	]);
	const editor = fakeEditor(fakeModel(CODE.repeat(2)), { foldingModel: folding });
	await revealLines(editor, fakeMonaco, [[3, 3]], { smooth: false });
	assert.deepEqual(folding.toggles, [[0]], 'line 3 is hidden by [1, 10] only; [3, 6] keeps lines 4-6 folded');
	const header = fakeFoldingModel([[1, 6, true]]);
	await revealLines(fakeEditor(fakeModel(CODE), { foldingModel: header }), fakeMonaco, [[1, 1]], { smooth: false });
	assert.deepEqual(header.toggles, [], 'line 1 carries the fold arrow: already visible');
});

test('regionsHiding: each region once, even when it hides many of the lines', () => {
	const folding = fakeFoldingModel([[2, 20, true]]);
	const hiding = regionsHiding(folding, [[3, 8], [10, 12]]);
	assert.deepEqual(
		hiding.map((region) => region.regionIndex),
		[0],
	);
});

test('without folding (off, or no controller, or a controller that throws) revealLines only scrolls', async () => {
	const off = fakeEditor(fakeModel(CODE), { foldingModel: null });
	assert.equal(await revealLines(off, fakeMonaco, [[2, 3]], { smooth: true }), true);
	assert.deepEqual(off.reveals, [[2, 3, 0]]);
	const none = fakeEditor(fakeModel(CODE), { controller: false });
	assert.equal(await revealLines(none, fakeMonaco, [[2, 3]], { smooth: true }), true);
	const broken = fakeEditor(fakeModel(CODE));
	broken.getContribution = () => {
		throw new Error('changed internals');
	};
	assert.equal(await revealLines(broken, fakeMonaco, [[5, 5]], { smooth: true }), true);
	assert.deepEqual(broken.reveals, [[5, 5, 0]]);
});

test('revealLines: reduced motion scrolls at once; the first range when all of them do not fit', async () => {
	const code = Array.from({ length: 60 }, (_, index) => `x${index}`).join('\n');
	const editor = fakeEditor(fakeModel(code), { height: 210, lineHeight: 21 });
	await revealLines(editor, fakeMonaco, [[40, 42], [3, 5]], { smooth: false });
	assert.deepEqual(editor.reveals, [[3, 5, 1]], 'sorted first, then the first range (10 lines of room), immediately');
});

test('revealLines does nothing without a model or a usable range, or when the model changes while it waits', async () => {
	assert.equal(await revealLines(fakeEditor(null), fakeMonaco, [[1, 1]]), false);
	const editor = fakeEditor(fakeModel(CODE));
	assert.equal(await revealLines(editor, fakeMonaco, [[50, 60]]), false, 'past the end of the code');
	assert.equal(await revealLines(editor, fakeMonaco, 'junk'), false);
	assert.deepEqual(editor.reveals, []);

	const folding = fakeFoldingModel([[1, 6, true]]);
	const switching = fakeEditor(fakeModel(CODE));
	switching.getContribution = () => ({
		getFoldingModel: () => {
			switching.model = fakeModel('other');
			return Promise.resolve(folding);
		},
	});
	assert.equal(await revealLines(switching, fakeMonaco, [[3, 3]]), false);
	assert.deepEqual(folding.toggles, [], 'no fold of the old model is opened');
	assert.deepEqual(switching.reveals, []);
});

test('prefersReducedMotion: the media query, and false where it cannot be asked', () => {
	const asking = (matches) => ({ matchMedia: (query) => ({ matches: query === '(prefers-reduced-motion: reduce)' && matches }) });
	assert.equal(prefersReducedMotion(asking(true)), true);
	assert.equal(prefersReducedMotion(asking(false)), false);
	assert.equal(prefersReducedMotion({}), false, 'no matchMedia');
	assert.equal(prefersReducedMotion(undefined), false, 'no window (the server, node)');
	assert.equal(
		prefersReducedMotion({
			matchMedia: () => {
				throw new Error('blocked');
			},
		}),
		false,
	);
});

test('ranges that overlap draw each line once (no line twice as dark)', () => {
	const model = fakeModel(CODE);
	const timers = fakeTimers();
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco, timers);
	assert.equal(lines.showStep([[2, 4], [3, 5], [4, 4]]), 4);
	assert.deepEqual(linesWith(model, STEP_CLASS), [2, 3, 4, 5]);
	assert.equal(lines.flash([[1, 2], [2, 2]]), 2);
	assert.deepEqual(linesWith(model, FLASH_CLASS), [1, 2]);
});

test('revealTarget: a range inside the one before it does not cut the span short', () => {
	assert.deepEqual(revealTarget([[3, 40], [5, 6]], 10), [3, 12], 'lines 3-40 do not fit in 10: the top of the first range');
	assert.deepEqual(revealTarget([[3, 8], [4, 5]], 10), [3, 8]);
});

test('a folding model whose internals changed: a warning, no unfolding, and the lines are still scrolled to', async (t) => {
	const warnings = [];
	t.mock.method(console, 'warn', (...parts) => warnings.push(parts));
	const changed = {
		getAllRegionsAtLine() {
			throw new TypeError('getAllRegionsAtLine is not a function');
		},
		toggleCollapseState() {
			throw new Error('must not be reached');
		},
	};
	const editor = fakeEditor(fakeModel(CODE), { foldingModel: changed });
	assert.equal(await revealLines(editor, fakeMonaco, [[4, 5]], { smooth: false }), true);
	assert.deepEqual(editor.reveals, [[4, 5, 1]]);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0][0], /folds over these lines could not be opened/);
	const missing = fakeEditor(fakeModel(CODE), { foldingModel: {} });
	assert.equal(await revealLines(missing, fakeMonaco, [[2, 2]], { smooth: false }), true, 'a folding model without the methods: the same');
	assert.deepEqual(missing.reveals, [[2, 2, 1]]);
});

test("a real snippet's magic comments (magicComments.js) become the marks, each line with its kind", () => {
	const snippet = [
		'def f(n):',
		'    # highlight-next-line',
		'    total = 0',
		'    # highlight-error-start',
		'    for i in range(n):',
		'        total += i',
		'    # highlight-error-end',
		'    # highlight-add-next-line',
		'    return total',
		'print(f(4))',
	].join('\n');
	const stripped = stripMagicComments(snippet, 'python');
	const model = fakeModel(stripped.code);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	assert.equal(lines.set(stripped.lineKinds), 4);
	assert.deepEqual(linesWith(model, 'dwf-ce-kind-highlight'), [2]);
	assert.deepEqual(linesWith(model, 'dwf-ce-kind-error'), [3, 4]);
	assert.deepEqual(linesWith(model, 'dwf-ce-kind-add'), [5]);
	assert.equal(model.getLineCount(), 6, 'the comment lines are gone: the marks are on the lines the reader sees');
});

test("the site guide's folded snippet (squares.py, foldedRegions [[1, 6]]): a step inside the fold opens it, one below it does not", async () => {
	const snippet = readFileSync(new URL('./fixtures/snippets/squares.py', import.meta.url), 'utf8'); // the guide's, a copy
	const model = fakeModel(snippet);
	const steps = normalizeSteps(
		[
			{ lines: '4-5', note: 'The loop.' },
			{ lines: '10-11', note: 'The output.' },
		],
		{ lineCount: model.getLineCount(), warn: assert.fail },
	);
	const below = fakeFoldingModel([[1, 6, true]]);
	await revealLines(fakeEditor(model, { foldingModel: below }), fakeMonaco, steps[1].ranges, { smooth: false });
	assert.deepEqual(below.toggles, [], 'lines 10-11 are not hidden by [1, 6]');
	const inside = fakeFoldingModel([[1, 6, true]]);
	const editor = fakeEditor(model, { foldingModel: inside });
	assert.equal(await revealLines(editor, fakeMonaco, steps[0].ranges, { smooth: false }), true);
	assert.deepEqual(inside.toggles, [[0]], 'the helper is unfolded');
	assert.deepEqual(editor.reveals, [[4, 5, 1]]);
});

/** Line and column of `offset` in `text` (1-based, as Monaco counts). */
function positionIn(text, offset) {
	const before = text.slice(0, offset).split('\n');
	return { line: before.length, column: before.at(-1).length + 1 };
}

/** The offset of (line, column) in `text`. */
function offsetIn(text, line, column) {
	const lines = text.split('\n');
	let offset = 0;
	for (let index = 0; index < line - 1; index += 1) offset += lines[index].length + 1;
	return offset + column - 1;
}

/** Monaco's MarkerMoveSemantics (intervalTree.js). */
const MARKER = Object.freeze({ defined: 0, forceMove: 1, forceStay: 2 });

/** Monaco's adjustMarkerBeforeColumn (intervalTree.js): does the marker stay before `check`? */
function staysBefore(marker, stickToPrevious, check, semantics) {
	if (marker < check) return true;
	if (marker > check) return false;
	if (semantics === MARKER.forceMove) return false;
	if (semantics === MARKER.forceStay) return true;
	return stickToPrevious;
}

/**
 * How Monaco moves a NeverGrowsWhenTypingAtEdges decoration { start, end } (offsets) when
 * [from, to) is replaced by `length` characters: its nodeAcceptEdit (intervalTree.js, 0.55),
 * copied so the fake model moves decorations exactly as the editor does.
 */
function acceptEdit(node, { from, to, length, forceMoveMarkers = false }) {
	const startSticks = false;
	const endSticks = true;
	const deleting = to - from;
	const common = Math.min(deleting, length);
	const { start, end } = node;
	let startDone = false;
	let endDone = false;
	const first = forceMoveMarkers ? MARKER.forceMove : deleting > 0 ? MARKER.forceStay : MARKER.defined;
	if (staysBefore(start, startSticks, from, first)) startDone = true;
	if (staysBefore(end, endSticks, from, first)) endDone = true;
	if (common > 0 && !forceMoveMarkers) {
		const second = deleting > length ? MARKER.forceStay : MARKER.defined;
		if (!startDone && staysBefore(start, startSticks, from + common, second)) startDone = true;
		if (!endDone && staysBefore(end, endSticks, from + common, second)) endDone = true;
	}
	const third = forceMoveMarkers ? MARKER.forceMove : MARKER.defined;
	if (!startDone && staysBefore(start, startSticks, to, third)) {
		node.start = from + length;
		startDone = true;
	}
	if (!endDone && staysBefore(end, endSticks, to, third)) {
		node.end = from + length;
		endDone = true;
	}
	if (!startDone) node.start = Math.max(0, start + length - deleting);
	if (!endDone) node.end = Math.max(0, end + length - deleting);
	if (node.start > node.end) node.end = node.start;
}

/**
 * An editable text model: decorations kept as offsets and moved by each edit (acceptEdit), a
 * version id, onDidChangeContent listeners told after each edit with Monaco's event shape
 * (the change's range in the coordinates from before the edit). edit(range, text, options) edits
 * (forceMoveMarkers as monacoSetup.js > replaceCode passes it; the rest goes into the event);
 * flush(text) replaces everything as setValue does (isFlush: decorations lost).
 */
function editableModel(code) {
	let text = code;
	let version = 1;
	let nextId = 1;
	const decorations = new Map();
	const listeners = new Set();
	const tell = (event) => {
		for (const listener of [...listeners]) listener(event);
	};
	return {
		decorations,
		getValue: () => text,
		getLineCount: () => text.split('\n').length,
		getLineMaxColumn: (line) => text.split('\n')[line - 1].length + 1,
		getVersionId: () => version,
		isDisposed: () => false,
		getDecorationRange(id) {
			const decoration = decorations.get(id);
			if (!decoration) return null;
			const start = positionIn(text, decoration.start);
			const end = positionIn(text, decoration.end);
			return new FakeRange(start.line, start.column, end.line, end.column);
		},
		deltaDecorations(oldIds, added) {
			for (const id of oldIds) decorations.delete(id);
			return added.map(({ range, options }) => {
				const id = `e${nextId++}`;
				decorations.set(id, {
					start: offsetIn(text, range.startLineNumber, range.startColumn),
					end: offsetIn(text, range.endLineNumber, range.endColumn),
					options,
				});
				return id;
			});
		},
		onDidChangeContent(listener) {
			listeners.add(listener);
			return { dispose: () => listeners.delete(listener) };
		},
		listenerCount: () => listeners.size,
		edit(range, insert, { forceMoveMarkers = false, ...extra } = {}) {
			const from = offsetIn(text, range.startLineNumber, range.startColumn);
			const to = offsetIn(text, range.endLineNumber, range.endColumn);
			text = text.slice(0, from) + insert + text.slice(to);
			for (const decoration of decorations.values()) acceptEdit(decoration, { from, to, length: insert.length, forceMoveMarkers });
			version += 1;
			tell({ changes: [{ range, text: insert }], versionId: version, isUndoing: false, isRedoing: false, isFlush: false, ...extra });
		},
		flush(insert) {
			text = insert;
			decorations.clear();
			version += 1;
			tell({ changes: [], versionId: version, isUndoing: false, isRedoing: false, isFlush: true });
		},
	};
}

/** A range from (startLine, startColumn) to (endLine, endColumn). */
function rangeOf(startLine, startColumn, endLine, endColumn) {
	return new FakeRange(startLine, startColumn, endLine, endColumn);
}

/** The lines of a model's decorations with `className`, as the editable model says now. */
function linesNow(model, className) {
	return [...model.decorations.entries()]
		.filter(([, decoration]) => decoration.options.className?.split(' ').includes(className))
		.map(([id]) => model.getDecorationRange(id).startLineNumber)
		.sort((a, b) => a - b);
}

const TEN_LINES = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join('\n');

test('lineRemovedBy: the whole text and a line break gone; not a rewrite, not Enter, not an empty line the change only ends at', () => {
	const line5 = { line: 5, maxColumn: 7 };
	assert.equal(lineRemovedBy({ range: rangeOf(5, 1, 6, 1) }, line5), true, 'delete-line: the text and the break after it');
	assert.equal(lineRemovedBy({ range: rangeOf(4, 7, 5, 7) }, line5), true, 'the break before it and its text (delete-line on a last line)');
	assert.equal(lineRemovedBy({ range: rangeOf(1, 1, 10, 8) }, line5), true, 'select-all and paste');
	assert.equal(lineRemovedBy({ range: rangeOf(5, 1, 5, 7) }, line5), false, 'its text rewritten: the line stays');
	assert.equal(lineRemovedBy({ range: rangeOf(5, 3, 5, 3) }, line5), false, 'Enter in the middle');
	assert.equal(lineRemovedBy({ range: rangeOf(5, 7, 6, 1) }, line5), false, 'Backspace at the start of the next line: a join, both stay');
	assert.equal(lineRemovedBy({ range: rangeOf(4, 3, 5, 4) }, line5), false, 'part of its text: it stays (joined with the line above)');
	const empty = { line: 6, maxColumn: 1 };
	assert.equal(lineRemovedBy({ range: rangeOf(5, 1, 6, 1) }, empty), false, 'an empty line the change only ends at: the line above went, it stays');
	assert.equal(lineRemovedBy({ range: rangeOf(6, 1, 7, 1) }, empty), true, 'delete-line on the empty line itself');
	assert.equal(lineRemovedBy({ range: rangeOf(6, 1, 6, 1) }, empty), false, 'typing into it');
});

test('following edits: select-all and paste takes every mark with its line, instead of piling them onto one line', () => {
	const model = editableModel(TEN_LINES);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	lines.set({ 3: 'error', 5: 'success', 8: 'highlight' });
	lines.showStep([[4, 6]]);
	model.edit(rangeOf(1, 1, 10, 8), 'a = 1\nb = 2\nprint(a + b)');
	assert.equal(model.decorations.size, 0, 'no mark and no step line is left on the pasted code');
});

test("following edits: a whole-code replace (Reset, Clear, an undo of Reset) drops the marks, with or without forceMoveMarkers", () => {
	for (const forceMoveMarkers of [true, false]) {
		const model = editableModel(TEN_LINES);
		const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
		lines.set({ 2: 'error', 9: 'success' });
		model.edit(rangeOf(1, 1, 10, 8), 'mine = 1\nprint(mine)', { forceMoveMarkers, isUndoing: !forceMoveMarkers });
		assert.equal(model.decorations.size, 0, `forceMoveMarkers ${forceMoveMarkers}`);
	}
});

test('following edits: delete-line on a marked line takes only its mark; the marks below move up with their lines', () => {
	const model = editableModel(TEN_LINES);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	lines.set({ 3: 'error', 4: 'success', 8: 'warning' });
	model.edit(rangeOf(3, 1, 4, 1), '');
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-error'), [], "the deleted line's mark is gone");
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-success'), [3], 'the line below moved up, its mark with it');
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-warning'), [7]);
});

test('following edits: Backspace joining two marked lines leaves one decoration on the joined line (the upper one)', () => {
	const model = editableModel(TEN_LINES);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	lines.set({ 3: 'error', 4: 'success' });
	lines.showStep([[3, 4]]);
	model.edit(rangeOf(3, 7, 4, 1), '');
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-error'), [3], "the upper line's mark stays");
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-success'), [], 'the other goes: never two bands on one line');
	assert.deepEqual(linesNow(model, STEP_CLASS), [3], 'the step layer too: one decoration per line');
});

test('following edits: rewriting a marked line, Enter in it and typing above it keep the mark on its line', () => {
	const model = editableModel(TEN_LINES);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	lines.set({ 5: 'error' });
	model.edit(rangeOf(5, 1, 5, 7), 'total = 0');
	assert.equal(model.decorations.size, 1, 'a rewrite keeps it');
	model.edit(rangeOf(5, 4, 5, 4), '\n');
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-error'), [5], 'Enter in the middle: still on line 5');
	model.edit(rangeOf(1, 1, 1, 1), '# note\n');
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-error'), [6], 'a line added above: it moves down with its line');
});

test('following edits: an empty marked line below a deleted line keeps its mark', () => {
	const model = editableModel('a\nb\n\nc');
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	lines.set({ 3: 'warning' });
	model.edit(rangeOf(2, 1, 3, 1), '');
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-warning'), [2], 'the empty line moved up; its mark went with it');
});

test('following edits: marks set by another listener of the same edit, before this one, are left alone (an undo back to the snippet)', () => {
	const model = editableModel(TEN_LINES);
	const editor = fakeEditor(model);
	let lines = null;
	// a listener told BEFORE the layers' own: it sets the marks after the edit (useGuided.js on an undo back to the snippet)
	model.onDidChangeContent(() => lines.set({ 2: 'error', 9: 'success' }));
	lines = createLineDecorations(editor, fakeMonaco);
	lines.set({ 3: 'error' });
	model.edit(rangeOf(1, 1, 10, 8), TEN_LINES, { isUndoing: true });
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-error'), [2]);
	assert.deepEqual(linesNow(model, 'dwf-ce-kind-success'), [9], 'the new marks were taken after the edit: nothing of them is removed');
});

test('following edits: setValue (a flush) forgets every decoration; dispose stops listening', () => {
	const model = editableModel(TEN_LINES);
	const lines = createLineDecorations(fakeEditor(model), fakeMonaco);
	lines.set({ 3: 'error' });
	assert.equal(model.listenerCount(), 1, 'one listener per decorated model');
	model.flush('x = 1');
	assert.equal(lines.set({ 1: 'success' }), 1, 'the layers start again from nothing');
	lines.dispose();
	assert.equal(model.listenerCount(), 0);
	assert.equal(model.decorations.size, 0);
});

test('revealSpan: the lines revealLines scrolls to, in the window as it is now; null without a model or a usable range', () => {
	const code = Array.from({ length: 60 }, (_, index) => `x${index}`).join('\n');
	const editor = fakeEditor(fakeModel(code), { height: 210, lineHeight: 21 });
	assert.deepEqual(revealSpan(editor, fakeMonaco, [[40, 42], [3, 5]]), [3, 5], 'sorted, then the first range (10 lines of room)');
	assert.deepEqual(revealSpan(editor, fakeMonaco, [[3, 5], [8, 9]]), [3, 9]);
	assert.equal(revealSpan(editor, fakeMonaco, [[80, 90]]), null);
	assert.equal(revealSpan(fakeEditor(null), fakeMonaco, [[1, 1]]), null);
});
