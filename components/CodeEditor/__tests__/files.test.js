/**
 * files.test.js — the parts of <CodeEditor> that cannot run in node (the .jsx files and the
 * hooks need a browser, Monaco and webpack) are at least checked statically, with Babel's parser
 * (it comes with Docusaurus; the test skips itself if it is missing):
 *   - every .js / .jsx file of the folder parses (JSX included);
 *   - every import resolves: a relative path to a file INSIDE the folder (the folder
 *     works whole on any site, so nothing may point outside it or at '@site/…'), '@theme/…' to
 *     a swizzled or Docusaurus theme component, '@docusaurus/…' to a Docusaurus client export or
 *     package, anything else to an installed package of ALLOWED_BARE_IMPORTS (and its sub-path,
 *     e.g. one MUI icon file) — the packages the porting recipe (README.md) installs;
 *   - every NAMED import from a file of the folder is really exported there (following
 *     `export * from` — this is what catches a library function renamed under the editor);
 *   - every `styles.someClass` used in a component exists in the styles.module.css it imports;
 *   - every name a file uses is defined in it, imported, or a browser / JavaScript global
 *     (KNOWN_GLOBALS; Babel's scope analysis): a call left behind after a refactor (2026-10-25:
 *     a hook's removed parameter, still called) otherwise fails only when a reader clicks;
 *   - the page's first download stays light: following index.jsx's STATIC imports (not the lazy
 *     import() of the editor) the way webpack does — a named import from the run library's
 *     index.js leads only to the file that defines the name (its package.json says
 *     sideEffects: false) — reaches none of CLIENT_ONLY_FILES. Every file reached is bundled
 *     into each page with an editor, before the editor itself is wanted.
 * The whole folder is walked (its root, CodeRef/, lib/codeRunner/, lib/registry/; never a
 * __tests__ folder), so every rule covers the whole component.
 * Run with `npm run test:shared`.
 * To change it: a package the folder may import goes in ALLOWED_BARE_IMPORTS (and the README's porting
 * recipe), a new global in KNOWN_GLOBALS, and a file the first download must not reach in
 * CLIENT_ONLY_FILES.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOLDER, NODE_MODULES, SITE } from './paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STYLESHEET = path.join(FOLDER, 'styles.module.css');

/** The folders of the component whose source is walked (relative to FOLDER). */
const SOURCE_FOLDERS = Object.freeze(['.', 'CodeRef', 'lib/codeRunner', 'lib/registry']);

/** A test folder's name: never walked. */
const TESTS_FOLDER = '__tests__';

/**
 * The packages a file of the folder may import by name (what the porting recipe installs or
 * every Docusaurus site has; a sub-path such as '@mui/icons-material/Close' counts for its
 * package). '@docusaurus/…' and '@theme/…' are checked separately.
 */
const ALLOWED_BARE_IMPORTS = Object.freeze([
	'react', 'react-dom', 'clsx', '@mui/material', '@mui/icons-material', '@monaco-editor/react', '@monaco-editor/loader',
	'prism-react-renderer', // Docusaurus's own (theme-classic): the static view's highlighting (prismTheme.js, StaticCode.jsx)
]);

/** The alias the site's notes use for the component; never used INSIDE the folder (it works on any site as it is). */
const SITE_ALIAS = '@site/';

/** The extensions webpack tries for an import without one (.js before .jsx). */
const TRY_EXTENSIONS = Object.freeze(['', '.js', '.jsx', '.mjs', '.ts', '.tsx']);

/**
 * Files only the lazily loaded editor needs (CodeEditorClient.jsx and what it imports): if the
 * placeholder's static imports reach one, webpack puts the whole file in every page with an
 * editor (found 2026-10-25: props.js imported exerciseView.js and runMarkers.js, ~4 KB gzip).
 */
const CLIENT_ONLY_FILES = Object.freeze([
	'CodeEditorClient.jsx',
	'MuiScope.jsx',
	'exerciseView.js',
	'runMarkers.js',
	'buttonInk.js',
	'draftSession.js',
	// the reader's theme (2026-10-25): the placeholder draws the default theme from the stylesheet alone
	'editorThemes.js',
	'themeChoice.js',
	'useEditorTheme.js',
	'ThemeMenu.jsx',
	// the touch reading mode and the print copy (2026-10-26): the placeholder draws neither (touchMode.js and touchOptions.js are small and pure, and reached)
	'surface.js',
	'monacoSurface.js',
	'staticSurface.js',
	'staticCodeStore.js',
	'useStaticStores.js',
	'StaticBox.jsx',
	'StaticCode.jsx',
	'StaticSolution.jsx',
	'DiffRows.jsx',
	'prismTheme.js',
	'PrintCopy.jsx',
	'usePrintRefresh.js',
	'usePendingAction.js',
	'lib/codeRunner/result.js',
	'lib/codeRunner/exercise.js',
	'lib/codeRunner/checkHelpers.js',
	'lib/codeRunner/errorLocations.js',
]);

/** Where Docusaurus's own modules live. */
const DOCUSAURUS_CLIENT_EXPORTS = path.join(NODE_MODULES, '@docusaurus/core/lib/client/exports');
const THEME_FOLDERS = Object.freeze([path.join(SITE, 'src/theme'), path.join(NODE_MODULES, '@docusaurus/theme-classic/lib/theme')].filter(existsSync)); // a site without swizzled components has no src/theme

/** Babel's parser, or null where it is not installed. */
function loadParser() {
	try {
		return createRequire(import.meta.url)('@babel/parser');
	} catch {
		return null;
	}
}

const parser = loadParser();

/** Babel's traverse (it comes with Docusaurus), or null where it is not installed. */
function loadTraverse() {
	try {
		return createRequire(import.meta.url)('@babel/traverse').default;
	} catch {
		return null;
	}
}

const traverse = loadTraverse();

/** The globals the editor's files may use without defining them (the browser's and JavaScript's own). */
const KNOWN_GLOBALS = new Set([
	'window', 'document', 'navigator', 'localStorage', 'console', 'globalThis', 'undefined', 'Infinity', 'NaN',
	'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask', 'fetch',
	'AbortController', 'IntersectionObserver', 'ResizeObserver', 'URL', 'Promise', 'Object', 'Array', 'Number',
	'String', 'Boolean', 'Math', 'JSON', 'Error', 'TypeError', 'RangeError', 'Set', 'Map', 'WeakMap', 'Symbol',
	'Date', 'RegExp', 'Intl', 'encodeURIComponent', 'decodeURIComponent', 'parseInt', 'parseFloat', 'isNaN',
	'TextEncoder', 'performance', 'getComputedStyle', 'matchMedia', 'process',
]);

/** The names an AST uses that it neither defines nor imports, and that are not KNOWN_GLOBALS: ['name:line', …]. */
function unboundNames(ast) {
	const unbound = [];
	traverse(ast, {
		ReferencedIdentifier(nodePath) {
			const name = nodePath.node.name;
			const isHtmlTag = nodePath.isJSXIdentifier() && /^[a-z]/.test(name);
			if (isHtmlTag || nodePath.parentPath.isJSXMemberExpression()) return;
			if (!nodePath.scope.hasBinding(name) && !KNOWN_GLOBALS.has(name)) unbound.push(`${name}:${nodePath.node.loc.start.line}`);
		},
	});
	return unbound;
}

/** The component's source files: every .js / .jsx of SOURCE_FOLDERS (never a test). */
function sourceFiles() {
	return SOURCE_FOLDERS.flatMap((folder) =>
		readdirSync(path.join(FOLDER, folder))
			.filter((name) => /\.(js|jsx)$/.test(name))
			.map((name) => path.join(FOLDER, folder, name)),
	);
}

/** A file's path as the folder sees it ('lib/codeRunner/result.js'). */
function inFolder(file) {
	return path.relative(FOLDER, file);
}

/** Is `file` inside the component's folder (and not under a __tests__ folder)? */
function isInsideFolder(file) {
	const relative = inFolder(file);
	return !relative.startsWith('..') && !path.isAbsolute(relative) && !relative.split(path.sep).includes(TESTS_FOLDER);
}

/** The package a bare import names ('@mui/icons-material/Close' → '@mui/icons-material'). */
function packageOf(specifier) {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** A file's AST (ES module with JSX). */
function parse(file) {
	return parser.parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
}

/** A file or a folder with an index / a package.json "main" for `base`, or null. */
function resolveLocal(base) {
	for (const extension of TRY_EXTENSIONS) {
		const candidate = base + extension;
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	if (existsSync(base) && statSync(base).isDirectory()) {
		const packageJson = path.join(base, 'package.json');
		if (existsSync(packageJson)) {
			const { main } = JSON.parse(readFileSync(packageJson, 'utf8'));
			if (main) return resolveLocal(path.join(base, main));
		}
		return resolveLocal(path.join(base, 'index'));
	}
	return null;
}

/** Does a package (or a sub-path of one) exist in node_modules? */
function packageExists(specifier) {
	const target = path.join(NODE_MODULES, specifier);
	return TRY_EXTENSIONS.some((extension) => existsSync(target + extension));
}

/**
 * Where an import leads: { kind: 'local', file } for a file of the site, { kind: 'external' }
 * for something that exists elsewhere, or null when it leads nowhere.
 */
function resolveImport(specifier, fromFile) {
	if (specifier.startsWith('.')) {
		const file = resolveLocal(path.resolve(path.dirname(fromFile), specifier));
		return file ? { kind: 'local', file } : null;
	}
	if (specifier.startsWith('@theme/')) {
		const name = specifier.slice('@theme/'.length);
		return THEME_FOLDERS.some((folder) => resolveLocal(path.join(folder, name))) ? { kind: 'external' } : null;
	}
	if (specifier.startsWith('@docusaurus/') && resolveLocal(path.join(DOCUSAURUS_CLIENT_EXPORTS, specifier.slice('@docusaurus/'.length)))) {
		return { kind: 'external' };
	}
	return packageExists(specifier) ? { kind: 'external' } : null;
}

/** The import declarations of an AST: [{ source, named: [names], line }]. */
function importsOf(ast) {
	return ast.program.body
		.filter((node) => node.type === 'ImportDeclaration')
		.map((node) => ({
			source: node.source.value,
			named: node.specifiers.filter((spec) => spec.type === 'ImportSpecifier').map((spec) => spec.imported.name ?? spec.imported.value),
			hasDefault: node.specifiers.some((spec) => spec.type === 'ImportDefaultSpecifier'),
			line: node.loc.start.line,
		}));
}

/** The names a file exports (following `export * from`), with 'default' for a default export. */
function exportsOf(file, seen = new Set()) {
	if (seen.has(file)) return new Set();
	seen.add(file);
	const names = new Set();
	if (!/\.(js|jsx|mjs)$/.test(file)) return names;
	for (const node of parse(file).program.body) {
		if (node.type === 'ExportDefaultDeclaration') names.add('default');
		if (node.type === 'ExportNamedDeclaration') {
			for (const spec of node.specifiers ?? []) names.add(spec.exported.name ?? spec.exported.value);
			const declaration = node.declaration;
			if (declaration?.id) names.add(declaration.id.name);
			for (const variable of declaration?.declarations ?? []) names.add(variable.id.name);
		}
		if (node.type === 'ExportAllDeclaration' && !node.exported) {
			const target = resolveImport(node.source.value, file);
			if (target?.kind === 'local') for (const name of exportsOf(target.file, seen)) if (name !== 'default') names.add(name);
		}
	}
	return names;
}

/** Every `styles.name` member access in an AST. */
function styleNamesOf(ast) {
	const names = new Set();
	const visit = (node) => {
		if (!node || typeof node.type !== 'string') return;
		if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === 'styles' && !node.computed) {
			names.add(node.property.name);
		}
		for (const value of Object.values(node)) {
			if (Array.isArray(value)) value.forEach(visit);
			else if (value && typeof value.type === 'string') visit(value);
		}
	};
	visit(ast.program);
	return names;
}

/** The class names a stylesheet defines. */
function stylesheetClasses(stylesheet = STYLESHEET) {
	const css = readFileSync(stylesheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	return new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]));
}

/** The CSS module a file imports as `styles` (CodeRef/index.jsx has its own), else the editor's styles.module.css. */
function stylesheetOf(file, ast) {
	const own = ast.program.body.find((node) => node.type === 'ImportDeclaration' && node.source.value.endsWith('.module.css') && node.specifiers.some((spec) => spec.type === 'ImportDefaultSpecifier' && spec.local.name === 'styles'));
	return own ? path.resolve(path.dirname(file), own.source.value) : STYLESHEET;
}

/** The names a file declares and exports itself (not those it passes on from another file). */
function ownExportNames(file) {
	const names = new Set();
	for (const node of parse(file).program.body) {
		if (node.type === 'ExportDefaultDeclaration') names.add('default');
		if (node.type !== 'ExportNamedDeclaration' || node.source) continue;
		for (const spec of node.specifiers ?? []) names.add(spec.exported.name ?? spec.exported.value);
		if (node.declaration?.id) names.add(node.declaration.id.name);
		for (const variable of node.declaration?.declarations ?? []) names.add(variable.id.name);
	}
	return names;
}

/** The file that declares `name`, starting at `file` and following its `export * from` lines; null if none does. */
function definerOf(name, file, seen = new Set()) {
	if (seen.has(file) || !/\.(js|jsx|mjs)$/.test(file)) return null;
	seen.add(file);
	if (ownExportNames(file).has(name)) return file;
	const passOns = parse(file).program.body.filter((node) => node.type === 'ExportAllDeclaration' && !node.exported);
	for (const node of passOns) {
		const target = resolveImport(node.source.value, file);
		const found = target?.kind === 'local' ? definerOf(name, target.file, seen) : null;
		if (found) return found;
	}
	return null;
}

/**
 * The local files a file's static imports lead to, as webpack bundles them: a named import to
 * the file that defines the name (a barrel's `export *` is looked through), anything else (a
 * default import, a CSS module, a bare import) to the file imported.
 */
function staticTargetsOf(file) {
	const targets = new Set();
	for (const { source, named } of importsOf(parse(file))) {
		const target = resolveImport(source, file);
		if (target?.kind !== 'local') continue;
		if (named.length === 0 || !/\.(js|jsx|mjs)$/.test(target.file)) {
			targets.add(target.file);
			continue;
		}
		for (const name of named) targets.add(definerOf(name, target.file) ?? target.file);
	}
	return targets;
}

/** Every local JS file reachable from `entry` through static imports. */
function staticallyReached(entry) {
	const reached = new Set([entry]);
	const queue = [entry];
	while (queue.length > 0) {
		const file = queue.shift();
		if (!/\.(js|jsx|mjs)$/.test(file)) continue;
		for (const target of staticTargetsOf(file)) {
			if (reached.has(target)) continue;
			reached.add(target);
			queue.push(target);
		}
	}
	return reached;
}

const skip = parser ? false : '@babel/parser is not installed';

test('every source file parses (JSX included)', { skip }, () => {
	const files = sourceFiles();
	assert.ok(files.length >= 10, 'the folder holds the component');
	for (const file of files) assert.doesNotThrow(() => parse(file), path.basename(file));
});

test('every import resolves to a file or an installed package', { skip }, () => {
	for (const file of sourceFiles()) {
		for (const { source, line } of importsOf(parse(file))) {
			assert.ok(resolveImport(source, file), `${inFolder(file)}:${line} imports '${source}', which leads nowhere`);
		}
	}
});

test("the folder is self-contained: no '@site/…' import, no relative import leaving it, bare imports only from the recipe's packages", { skip }, () => {
	for (const file of sourceFiles()) {
		for (const { source, line } of importsOf(parse(file))) {
			const where = `${inFolder(file)}:${line} imports '${source}'`;
			assert.ok(!source.startsWith(SITE_ALIAS), `${where}: the folder never imports '@site/…' (it works on any site as it is)`);
			if (source.startsWith('.')) {
				const target = resolveImport(source, file);
				assert.ok(target && isInsideFolder(target.file), `${where}, which leaves the folder`);
			} else if (!source.startsWith('@docusaurus/') && !source.startsWith('@theme/')) {
				assert.ok(ALLOWED_BARE_IMPORTS.includes(packageOf(source)), `${where}: not one of ALLOWED_BARE_IMPORTS (add the package to README.md's recipe first)`);
			}
		}
	}
});

test("every named import from the folder's files is exported there", { skip }, () => {
	for (const file of sourceFiles()) {
		for (const { source, named, hasDefault, line } of importsOf(parse(file))) {
			const target = resolveImport(source, file);
			if (target?.kind !== 'local' || !/\.(js|jsx|mjs)$/.test(target.file)) continue;
			const exported = exportsOf(target.file);
			for (const name of named) {
				assert.ok(exported.has(name), `${inFolder(file)}:${line} imports { ${name} } from '${source}', which does not export it`);
			}
			if (hasDefault) assert.ok(exported.has('default'), `${inFolder(file)}:${line}: '${source}' has no default export`);
		}
	}
});

test('relative imports inside the folder name their file exactly (the folder is "type": "module")', { skip }, () => {
	for (const file of sourceFiles()) {
		for (const { source, line } of importsOf(parse(file))) {
			if (!source.startsWith('.')) continue;
			assert.ok(existsSync(path.resolve(path.dirname(file), source)), `${inFolder(file)}:${line}: '${source}' needs its extension`);
		}
	}
});

test('every styles.<class> a component uses is defined in the styles.module.css it imports', { skip }, () => {
	for (const file of sourceFiles()) {
		const ast = parse(file);
		const defined = stylesheetClasses(stylesheetOf(file, ast));
		for (const name of styleNamesOf(ast)) {
			assert.ok(defined.has(name), `${inFolder(file)} uses styles.${name}, which its styles.module.css does not define`);
		}
	}
});

test('every name a file uses is defined, imported or a known global', { skip: skip || (traverse ? false : '@babel/traverse is not installed') }, () => {
	for (const file of sourceFiles()) {
		assert.deepEqual(unboundNames(parse(file)), [], `${inFolder(file)} uses names it never defines or imports`);
	}
});

test('no inline <style> tags and no third-party hosts in the component', () => {
	for (const file of sourceFiles()) {
		const source = readFileSync(file, 'utf8');
		assert.doesNotMatch(source, /<style[\s>]/, `${inFolder(file)}: styles belong in styles.module.css`);
		assert.doesNotMatch(source, /https?:\/\/(?!localhost)[a-z0-9.-]+\.(com|net|org|io|dev)\b/i, `${inFolder(file)}: no third-party URLs (Monaco comes from the site itself)`);
	}
});

/** What shared/ holds beside the components folder, each one a climb of three levels from `__tests__`. */
const SHARED_NEIGHBOURS = Object.freeze(['css', 'functions', 'plugins', 'scripts', 'static', 'theme', 'wiring']);

/**
 * What a test file of the folder may not name: a file of the site (the site's own wiring test
 * reads those), a file of shared/ outside this folder (a site's stylesheets sit there now), by its
 * path from the site or by a relative climb, or a path climbing out of the folder through a fixed
 * depth (three levels from `__tests__` is shared/, four the site: paths.js finds the site with no
 * fixed depth). The closing quote keeps `'../../../__tests__/paths.js'` (a lib test reaching this
 * folder) allowed.
 */
const SITE_READS = Object.freeze([
	'src/css/', 'src/pages/', 'docusaurus.config', 'blog/2025', "'../../../../", "'../../..'",
	'shared/', ...SHARED_NEIGHBOURS.map((folder) => `'../../../${folder}/`),
]);

/**
 * Words the folder uses on every site, so a site named with one cannot be told from them: its
 * theme, class and namespace names start with dwf. A site named with an everyday word the folder
 * uses goes here too.
 */
const FOLDER_WORDS = Object.freeze(['dwf']);

/** The name in the package.json of the site the folder sits in. */
function siteName() {
	return JSON.parse(readFileSync(path.join(SITE, 'package.json'), 'utf8')).name;
}

/**
 * The site names the folder may not carry: its keys, ids and paths are site-neutral, so nothing of
 * a site travels with it (themeChoice.js, drafts.js, typescriptLibs.js, CodeEditorClient.jsx).
 * shared/ is public, so no site's name is written in this file: each site gives its own through
 * its package.json, and shared/__tests__/privacy.test.mjs holds every private name, through the
 * word list on the machine, over all of shared/.
 */
const SITE_NAMES = Object.freeze([siteName()].filter((name) => !FOLDER_WORDS.includes(name)));

/** A dev-server address with a port: one site's `netlify dev` port (netlify.toml > [dev]) is not another's, so no message or comment in the folder may name one. */
const LOCAL_PORT_PATTERN = /localhost:\d+|127\.0\.0\.1:\d+/;

/** Every test and helper file under the folder (its __tests__ folders, fixtures aside). */
function testFiles() {
	return SOURCE_FOLDERS.flatMap((folder) => {
		const tests = path.join(FOLDER, folder, TESTS_FOLDER);
		if (!existsSync(tests)) return [];
		return readdirSync(tests)
			.filter((name) => /\.(js|mjs)$/.test(name))
			.map((name) => path.join(tests, name));
	});
}

test("the folder's tests read nothing of the site (they travel with the folder): snippets from fixtures/, packages through paths.js", () => {
	for (const file of testFiles().filter((candidate) => candidate !== fileURLToPath(import.meta.url))) {
		const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
		for (const forbidden of SITE_READS) {
			assert.ok(!source.includes(forbidden), `${inFolder(file)} names ${forbidden}: a site file belongs in the site's own wiring test, a package in paths.js`);
		}
	}
});

test("no source file of the folder names a site: its storage keys, Monaco ids, lib paths and messages are site-neutral (nothing of one site, not even its dev-server port)", () => {
	for (const file of sourceFiles()) {
		const source = readFileSync(file, 'utf8');
		for (const name of SITE_NAMES) {
			assert.ok(!source.includes(name), `${inFolder(file)} names ${name}: a key or id with a site's name would not travel (renaming it later forgets every reader's stored choice); a site named with a word the folder uses goes in FOLDER_WORDS`);
		}
		assert.doesNotMatch(source, LOCAL_PORT_PATTERN, `${inFolder(file)} names a local port: another site's netlify dev runs on its own port (say \`netlify dev\`, and keep the port in the site's docs)`);
	}
});

test("the placeholder's static imports reach none of the lazy editor's client-only files (the page's first download)", { skip }, () => {
	const reached = [...staticallyReached(path.join(FOLDER, 'index.jsx'))].map(inFolder);
	assert.ok(reached.includes('props.js'), 'the walk follows index.jsx > props.js');
	assert.ok(reached.includes('lib/codeRunner/languages.js'), "and looks through the run library's index.js");
	for (const file of CLIENT_ONLY_FILES) {
		assert.ok(!reached.includes(file), `${file} is reached from index.jsx: it would be in every page with an editor`);
	}
});
