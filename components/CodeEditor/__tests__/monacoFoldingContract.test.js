/**
 * monacoFoldingContract.test.js — what decorations.js and guided.module.css rely on in Monaco,
 * read from the installed monaco-editor package. revealLines opens folds through Monaco's
 * folding controller and its folding model, which are NOT in monaco.d.ts: an upgrade may change
 * them without notice, and revealLines would then quietly stop unfolding (it only scrolls when
 * it cannot reach them). The stylesheet relies on the class names Monaco gives its own DOM. If
 * a test here fails after an upgrade, read the new
 * node_modules/monaco-editor/esm/vs/editor/contrib/folding/browser/*.js (and the view parts
 * named below) and adapt decorations.js > foldingModelOf / regionsHiding or the stylesheet.
 * Also the ORDER Monaco draws a line's bands in (the current step must stay under an author's
 * mark: by zIndex, then class name, behind the code; by class name only under the gutter) and
 * the one div per line the stylesheet's :has() rules read. The public API it uses (and
 * useGuided.js and goToEditor.js > keepLinesInWindow use) is checked against editor.api.d.ts
 * too. Run with `npm run test:shared`.
 * To change it: a new fact of the installed Monaco that the editor rests on gets a test here, read from
 * node_modules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { FOLDING_CONTRIBUTION_ID, LINE_KINDS, STEP_Z_INDEX, kindClassNames, stepClassNames } from '../decorations.js';

const require = createRequire(import.meta.url);
const MONACO = dirname(require.resolve('monaco-editor/package.json'));
const EDITOR = join(MONACO, 'esm/vs/editor');

const monacoFile = (file) => readFileSync(join(EDITOR, file), 'utf8');
const FOLDING = 'contrib/folding/browser';
const API = monacoFile('editor.api.d.ts');

test("the folding controller's id, and its getFoldingModel() (a promise of the folding model)", () => {
	const folding = monacoFile(`${FOLDING}/folding.js`);
	assert.match(folding, new RegExp(`static \\{ this\\.ID = '${FOLDING_CONTRIBUTION_ID.replace(/\./g, '\\.')}'; \\}`));
	assert.match(folding, /getFoldingModel\(\) \{\s*return this\.foldingModelPromise;\s*\}/);
	assert.match(folding, /registerEditorContribution\(FoldingController\.ID, FoldingController,/, 'every editor gets one (getContribution finds it)');
});

test("Monaco's own cursor reveal opens folds by the rule regionsHiding copies", () => {
	const folding = monacoFile(`${FOLDING}/folding.js`);
	assert.match(folding, /foldingModel\.getAllRegionsAtLine\(lineNumber, r => r\.isCollapsed && lineNumber > r\.startLineNumber\)/);
	assert.match(folding, /foldingModel\.toggleCollapseState\(toToggle\)/);
});

test('the folding model: getAllRegionsAtLine(line, filter), toggleCollapseState(regions), and the region getters', () => {
	const model = monacoFile(`${FOLDING}/foldingModel.js`);
	assert.match(model, /getAllRegionsAtLine\(lineNumber, filter\) \{/);
	assert.match(model, /toggleCollapseState\(toggledRegions\) \{/);
	assert.match(model, /toggledRegions\.sort\(\(r1, r2\) => r1\.regionIndex - r2\.regionIndex\)/, 'regions are told apart by regionIndex (regionsHiding de-duplicates by it)');
	const ranges = monacoFile(`${FOLDING}/foldingRanges.js`);
	for (const getter of ['startLineNumber', 'endLineNumber', 'regionIndex', 'isCollapsed']) {
		assert.match(ranges, new RegExp(`class FoldingRegion \\{[\\s\\S]*?get ${getter}\\(\\)`), `FoldingRegion.${getter}`);
	}
});

test('the public API decorations.js uses is in editor.api.d.ts', () => {
	assert.match(API, /deltaDecorations\(oldDecorations: string\[\], newDecorations: IModelDeltaDecoration\[\], ownerId\?: number\): string\[\];/, "a model's own decorations (no owner: every editor of the model shows them)");
	const modelDelta = API.match(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*deltaDecorations\(oldDecorations: string\[\], newDecorations: IModelDeltaDecoration\[\], ownerId\?/);
	assert.ok(modelDelta && !modelDelta[1].includes('@deprecated'), "the model's deltaDecorations is not deprecated (the editor's is)");
	for (const option of ['isWholeLine?: boolean;', 'className?: string | null;', 'marginClassName?: string | null;', 'lineNumberClassName?: string | null;', 'stickiness?: TrackedRangeStickiness;']) {
		assert.ok(API.includes(option), `IModelDecorationOptions.${option}`);
	}
	assert.match(API, /NeverGrowsWhenTypingAtEdges = 1,/);
	assert.match(API, /export enum ScrollType \{\s*Smooth = 0,\s*Immediate = 1\s*\}/);
	assert.match(API, /revealLinesInCenterIfOutsideViewport\(lineNumber: number, endLineNumber: number, scrollType\?: ScrollType\): void;/);
	assert.match(API, /getContribution<T extends IEditorContribution>\(id: string\): T \| null;/);
	assert.match(API, /getLayoutInfo\(\): EditorLayoutInfo;/);
});

test("the DOM guided.module.css styles: Monaco's overlay layers, the margin decoration, the line numbers, the glyph margin", () => {
	const overlays = monacoFile('browser/view/viewOverlays.js');
	assert.match(overlays, /setClassName\('view-overlays'\)/);
	assert.match(overlays, /setClassName\('margin-view-overlays'\)/);
	assert.match(monacoFile('browser/viewParts/decorations/decorations.js'), /'<div class="cdr '\s*\+ d\.options\.className/, 'a whole-line decoration: a div with its className, in the view overlays');
	assert.match(monacoFile('browser/viewParts/marginDecorations/marginDecorations.css'), /\.monaco-editor \.margin-view-overlays \.cmdr \{\s*position: absolute;/, 'the margin decoration: an absolute div (the sign is placed in it)');
	const lineNumbers = monacoFile('browser/viewParts/lineNumbers/lineNumbers.js');
	assert.match(lineNumbers, /static \{ this\.CLASS_NAME = 'line-numbers'; \}/);
	assert.match(lineNumbers, /extraClassNames \+= ' ' \+ options\.lineNumberClassName;/);
	assert.match(monacoFile('common/config/editorOptions.js'), /new EditorBooleanOption\(\d+ \/\* EditorOption\.glyphMargin \*\/, 'glyphMargin', true,/, 'the glyph margin is on by default: the + / − have their column');
});

test("the order Monaco draws a line's bands in: behind the code by zIndex then class name; under the gutter by class name only", () => {
	const decorations = monacoFile('browser/viewParts/decorations/decorations.js');
	assert.match(
		decorations,
		/decorations\.sort\(\(a, b\) => \{\s*if \(a\.options\.zIndex < b\.options\.zIndex\) \{\s*return -1;[\s\S]*?const aClassName = a\.options\.className;/,
		'behind the code: zIndex first, then the class name',
	);
	const margin = monacoFile('browser/viewParts/glyphMargin/glyphMargin.js');
	assert.match(margin, /\/\/ Sort decorations by className, then by startLineNumber and then by endLineNumber/);
	assert.match(margin, /return \(a\.className < b\.className \? -1 : 1\);/, 'under the gutter: the class name alone (zIndex is ignored)');
	assert.match(monacoFile('common/model/textModel.js'), /this\.zIndex = options\.zIndex \|\| 0;/, "a decoration without zIndex counts as 0: the marks' default");
	const step = stepClassNames();
	for (const kind of LINE_KINDS) {
		assert.ok(step.marginClassName < kindClassNames(kind).marginClassName, `under the gutter the step (${step.marginClassName}) is drawn before ${kind}`);
	}
	assert.ok(STEP_Z_INDEX < 0);
});

test('one div per line in both overlays, holding that line\'s decoration divs (what the :has() rules read)', () => {
	const overlays = monacoFile('browser/view/viewOverlays.js');
	assert.match(overlays, /sb\.appendString\('<div style="top:'\);[\s\S]*?sb\.appendString\(result\);\s*sb\.appendString\('<\/div>'\);/);
	assert.match(monacoFile('browser/viewParts/marginDecorations/marginDecorations.js'), /lineOutput \+= '<div class="cmdr ' \+ decoration\.className \+ '" style=""><\/div>';/);
});

test('the public API the edit following, the undo check and the page follow-up use is in editor.api.d.ts', () => {
	for (const member of [
		'zIndex?: number;',
		'onDidChangeContent(listener: (e: IModelContentChangedEvent) => void): IDisposable;',
		'readonly onWillDispose: IEvent<void>;',
		'getDecorationRange(id: string): Range | null;',
		'getVersionId(): number;',
		'readonly isUndoing: boolean;',
		'readonly isRedoing: boolean;',
		'readonly isFlush: boolean;',
		'readonly onDidChangeModelContent: IEvent<IModelContentChangedEvent>;',
		'readonly onDidLayoutChange: IEvent<EditorLayoutInfo>;',
		'getContainerDomNode(): HTMLElement;',
		'getDomNode(): HTMLElement | null;',
	]) {
		assert.ok(API.includes(member), member);
	}
	assert.match(API, /The old range that got replaced\.\s*\*\/\s*readonly range: IRange;/, "a change's range is in the coordinates from before the edit");
	assert.match(API, /getScrolledVisiblePosition\(position: IPosition\): \{\s*top: number;\s*left: number;\s*height: number;\s*\} \| null;/);
});
