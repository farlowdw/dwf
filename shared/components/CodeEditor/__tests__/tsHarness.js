/**
 * tsHarness.js — Monaco's REAL TypeScript worker in node, behind a small fake `monaco`, for
 * typescript.test.js and twoslash.test.js (not a test file itself). The worker is the installed
 * monaco-editor's own class (esm/vs/language/typescript/tsWorker.js, with TypeScript 5.9 and
 * its lib files), so the compile, the type errors, the hovers and the source maps the tests see
 * are the ones a reader's browser gets. Only Monaco's plumbing around it is faked:
 *   - the language defaults (fakeDefaults: compiler / diagnostics options and extra libs, as
 *     monaco.contribution.js keeps them — addExtraLib with the same text is a no-op there too),
 *   - the worker manager (a new worker after any options change, as Monaco restarts it; extra
 *     libs handed over on each request),
 *   - text models (FakeModel: the few methods typescript.js and twoslash.js call) and their
 *     mirrors in the worker (every live TypeScript model, as Monaco syncs them),
 *   - an editor for twoslash.js (FakeEditor: model switches, edits, a language change,
 *     decorations).
 * loadTypeScript() returns null when monaco-editor is not installed: the tests then skip.
 *
 * HOW TO CHANGE IT  After a Monaco upgrade, check that tsWorker.js still exports TypeScriptWorker
 * (the tests skip with SKIP_REASON otherwise) and that the defaults' initial options below still
 * match monaco.contribution.js.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolvePackage } from './paths.js';

const TS_FOLDER = path.join(resolvePackage('monaco-editor'), 'esm/vs/language/typescript');
const TS_WORKER = path.join(TS_FOLDER, 'tsWorker.js');
const TS_SERVICES = path.join(TS_FOLDER, 'lib/typescriptServices.js');

/** Why the real-worker tests skip, when they do. */
export const SKIP_REASON = 'monaco-editor (with its TypeScript worker) is not installed';

/** Monaco's initial TypeScript / JavaScript options (monaco.contribution.js). */
const MONACO_TS_COMPILER_OPTIONS = Object.freeze({ allowNonTsExtensions: true, target: 99 });
const MONACO_JS_COMPILER_OPTIONS = Object.freeze({ allowNonTsExtensions: true, allowJs: true, target: 99 });
const MONACO_TS_DIAGNOSTICS = Object.freeze({ noSemanticValidation: false, noSyntaxValidation: false, onlyVisible: false });
const MONACO_JS_DIAGNOSTICS = Object.freeze({ noSemanticValidation: true, noSyntaxValidation: false, onlyVisible: false });

/** { TypeScriptWorker, ts } from the installed Monaco, or null when it is missing. */
export async function loadTypeScript() {
	if (!existsSync(TS_WORKER) || !existsSync(TS_SERVICES)) return null;
	const { TypeScriptWorker } = await import(pathToFileURL(TS_WORKER).href);
	const { typescript } = await import(pathToFileURL(TS_SERVICES).href);
	if (typeof TypeScriptWorker !== 'function' || !typescript) return null;
	return { TypeScriptWorker, ts: typescript };
}

/** monaco.Uri, reduced to what the worker and typescript.js read. */
export class FakeUri {
	constructor(text) {
		this.text = text;
		this.path = new URL(text.replace(/^[a-z]+:/, 'http:')).pathname;
	}

	toString() {
		return this.text;
	}
}

/** monaco.Range, reduced to its four numbers. */
export class FakeRange {
	constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
		Object.assign(this, { startLineNumber, startColumn, endLineNumber, endColumn });
	}
}

/** A text model: the methods typescript.js and twoslash.js call. */
export class FakeModel {
	constructor(text, languageId, uri) {
		this.text = text;
		this.languageId = languageId;
		this.uri = uri;
		this.versionId = 1;
		this.disposed = false;
	}

	getValue() {
		return this.text;
	}

	setValue(text) {
		this.text = text;
		this.versionId += 1;
	}

	getVersionId() {
		return this.versionId;
	}

	getLanguageId() {
		return this.languageId;
	}

	lines() {
		return this.text.split('\n');
	}

	getLineCount() {
		return this.lines().length;
	}

	getLineMaxColumn(lineNumber) {
		return this.lines()[lineNumber - 1].length + 1;
	}

	getPositionAt(offset) {
		const before = this.text.slice(0, Math.max(0, Math.min(offset, this.text.length))).split('\n');
		return { lineNumber: before.length, column: before[before.length - 1].length + 1 };
	}

	getOffsetAt({ lineNumber, column }) {
		const lines = this.lines();
		let offset = 0;
		for (let index = 0; index < lineNumber - 1; index += 1) offset += lines[index].length + 1;
		return offset + Math.min(column - 1, lines[lineNumber - 1].length);
	}

	isDisposed() {
		return this.disposed;
	}

	dispose() {
		this.disposed = true;
	}
}

/** One language's defaults, as monaco.contribution.js keeps them; `changes` counts what would restart the worker. */
export function fakeDefaults(compilerOptions, diagnosticsOptions) {
	return {
		compilerOptions: { ...compilerOptions },
		diagnosticsOptions: { ...diagnosticsOptions },
		extraLibs: Object.create(null),
		changes: 0,
		getCompilerOptions() {
			return this.compilerOptions;
		},
		setCompilerOptions(options) {
			this.compilerOptions = options;
			this.changes += 1;
		},
		getDiagnosticsOptions() {
			return this.diagnosticsOptions;
		},
		setDiagnosticsOptions(options) {
			this.diagnosticsOptions = options;
			this.changes += 1;
		},
		getExtraLibs() {
			return this.extraLibs;
		},
		addExtraLib(content, filePath) {
			const existing = this.extraLibs[filePath];
			if (existing && existing.content === content) return { dispose() {} };
			this.extraLibs[filePath] = { content, version: (existing?.version ?? 0) + 1 };
			return { dispose: () => delete this.extraLibs[filePath] };
		},
	};
}

/** The worker's view of a model (Monaco's mirror model). */
function mirrorOf(model) {
	return { uri: model.uri, version: model.getVersionId(), getValue: () => model.getValue() };
}

/**
 * A fake `monaco` around the real worker class: { monaco, models, createModel(text, uri),
 * workerRequests } — `models` holds every model made (disposed ones too), `workerRequests` the
 * URIs each worker request was synced with.
 */
export function createTypeScriptMonaco(TypeScriptWorker) {
	const models = [];
	const workerRequests = [];
	const typescriptDefaults = fakeDefaults(MONACO_TS_COMPILER_OPTIONS, MONACO_TS_DIAGNOSTICS);
	const javascriptDefaults = fakeDefaults(MONACO_JS_COMPILER_OPTIONS, MONACO_JS_DIAGNOSTICS);
	const context = {
		getMirrorModels: () => models.filter((model) => !model.isDisposed() && model.getLanguageId() === 'typescript').map(mirrorOf),
	};
	let worker = null;
	let workerChanges = -1;

	/** The worker, made again after any options change (as Monaco restarts it). */
	function currentWorker() {
		if (!worker || workerChanges !== typescriptDefaults.changes) {
			worker = new TypeScriptWorker(context, { compilerOptions: typescriptDefaults.getCompilerOptions(), extraLibs: { ...typescriptDefaults.getExtraLibs() }, inlayHintsOptions: {} });
			workerChanges = typescriptDefaults.changes;
		}
		worker.updateExtraLibs({ ...typescriptDefaults.getExtraLibs() });
		return worker;
	}

	function createModel(text, languageId, uri) {
		const model = new FakeModel(text, languageId, uri);
		models.push(model);
		return model;
	}

	const monaco = {
		typescript: {
			typescriptDefaults,
			javascriptDefaults,
			getTypeScriptWorker: async () => async (...uris) => {
				workerRequests.push(uris.map(String));
				return currentWorker();
			},
		},
		languages: { typescript: { deprecated: true } },
		Uri: { parse: (text) => new FakeUri(text) },
		Range: FakeRange,
		editor: { createModel, InjectedTextCursorStops: { None: 3 } },
	};
	return {
		monaco,
		models,
		workerRequests,
		createModel: (text, uri = 'inmemory://code-editor/r1/typescript/main.ts') => createModel(text, 'typescript', new FakeUri(uri)),
	};
}

/** A Monaco editor as twoslash.js uses it: model switches, edits, and a decorations collection. */
export class FakeEditor {
	constructor(model) {
		this.model = model;
		this.listeners = { content: new Set(), model: new Set(), language: new Set() };
		this.decorations = [];
		this.collections = 0;
	}

	getModel() {
		return this.model;
	}

	/** Show another model (fires onDidChangeModel). */
	setModel(model) {
		this.model = model;
		for (const listener of this.listeners.model) listener();
	}

	/** Replace the model's text as a reader's edit would (fires onDidChangeModelContent). */
	edit(text) {
		this.model.setValue(text);
		for (const listener of this.listeners.content) listener();
	}

	/** Give the model another language, as monaco.editor.setModelLanguage would (fires onDidChangeModelLanguage). */
	setLanguage(languageId) {
		this.model.languageId = languageId;
		for (const listener of this.listeners.language) listener();
	}

	listen(kind, listener) {
		this.listeners[kind].add(listener);
		return { dispose: () => this.listeners[kind].delete(listener) };
	}

	onDidChangeModelContent(listener) {
		return this.listen('content', listener);
	}

	onDidChangeModel(listener) {
		return this.listen('model', listener);
	}

	onDidChangeModelLanguage(listener) {
		return this.listen('language', listener);
	}

	listenerCount() {
		return this.listeners.content.size + this.listeners.model.size + this.listeners.language.size;
	}

	createDecorationsCollection() {
		this.collections += 1;
		return {
			set: (decorations) => {
				this.decorations = decorations;
			},
			clear: () => {
				this.decorations = [];
			},
		};
	}

	/** The decorations as [line, column, text] (the injected text without its leading space). */
	shown() {
		return this.decorations.map((decoration) => [decoration.range.startLineNumber, decoration.range.startColumn, decoration.options.after.content.slice(1)]);
	}
}
