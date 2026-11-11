/**
 * monacoEditor.test.js — shared/plugins/monaco-editor: it finds the installed monaco-editor on disk
 * (the version package.json pins, with its AMD build), hands the page a vs URL without a
 * trailing slash that carries that version, copies the whole min/vs folder into a build (byte
 * for byte, skipped when a complete copy is already there, never left half-written), serves the
 * same folder under `npm start`, and the site uses it instead of jsDelivr. Writes only into
 * temporary folders. Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   Add a test beside the behaviour it checks; the fake package trees come from fakeMonaco().
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const monacoEditorPlugin = require('..');

const { DEFAULT_OPTIONS, NOTICE_FILES, PLUGIN_NAME, REQUIRED_FILES, STAGING_SUFFIX, copyNotices, copyVs, findMonacoPackage, readOptions, vsPathFor } = monacoEditorPlugin;

/** What marks a folder as a Docusaurus site. */
const CONFIG_FILE = 'docusaurus.config.js';

/** The nearest folder at or above `from` holding a site's config: shared/ may sit at any depth. */
function findSite(from) {
	for (let dir = from; dir !== path.dirname(dir); dir = path.dirname(dir)) {
		if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
	}
	throw new Error(`no ${CONFIG_FILE} above ${from}: this suite runs in a site, through npm run test:shared`);
}

const REPO = findSite(__dirname);
const CONFIG = path.join(REPO, CONFIG_FILE);

/** The code editor, beside this plugin in shared/ on every site. */
const EDITOR_DIR = path.resolve(__dirname, '..', '..', '..', 'components', 'CodeEditor');
const THIRD_PARTY_HOSTS = /cdn\.jsdelivr|unpkg\.com|cdnjs/;
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);

/** A temporary folder, removed after the test. */
function tempDir(t, prefix) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}

/** Writes node_modules/monaco-editor (version, and the given files under min/vs) into root. */
function fakeMonaco(root, { version = '9.9.9', name = 'monaco-editor', files = REQUIRED_FILES } = {}) {
	const packageDir = path.join(root, 'node_modules', 'monaco-editor');
	fs.mkdirSync(packageDir, { recursive: true });
	fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name, version }));
	for (const file of files) {
		const filePath = path.join(packageDir, 'min', 'vs', file);
		fs.mkdirSync(path.dirname(filePath), { recursive: true });
		fs.writeFileSync(filePath, `// ${file} of ${version}\n`);
	}
	return packageDir;
}

/** Every file under dir, as paths relative to it, sorted. */
function listFiles(dir) {
	return fs
		.readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
		.sort();
}

/** The text of every source file of the code editor's folder (tests excluded). */
function editorSource() {
	return listFiles(EDITOR_DIR)
		.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)) && !file.split(path.sep).includes('__tests__'))
		.map((file) => fs.readFileSync(path.join(EDITOR_DIR, file), 'utf8'))
		.join('\n');
}

test('finds the installed monaco-editor on disk: the version package.json pins, with its AMD build', () => {
	const monaco = findMonacoPackage(REPO);
	assert.equal(monaco.packageDir, path.join(REPO, 'node_modules', 'monaco-editor'));
	assert.equal(monaco.vsDir, path.join(monaco.packageDir, 'min', 'vs'));
	assert.match(monaco.version, /^\d+\.\d+\.\d+$/);
	assert.equal(require(path.join(REPO, 'package.json')).dependencies['monaco-editor'], monaco.version, 'package.json pins exactly this version');
	for (const file of REQUIRED_FILES) assert.ok(fs.existsSync(path.join(monaco.vsDir, file)), file);
	assert.deepEqual(findMonacoPackage(), monaco, 'the default start folder is the site');
});

test('looks in each folder above the start folder, as Node does, and skips a package of another name', (t) => {
	const root = tempDir(t, 'monaco-find-');
	const nested = path.join(root, 'site', 'plugins');
	fs.mkdirSync(nested, { recursive: true });
	fakeMonaco(root, { version: '1.2.3' });
	fakeMonaco(path.join(root, 'site'), { name: 'not-monaco', version: '0.0.1' });
	const monaco = findMonacoPackage(nested);
	assert.equal(monaco.version, '1.2.3');
	assert.equal(monaco.vsDir, path.join(root, 'node_modules', 'monaco-editor', 'min', 'vs'));
});

test('says so plainly when monaco-editor is missing or has no AMD build', (t) => {
	const empty = tempDir(t, 'monaco-none-');
	assert.throws(() => findMonacoPackage(empty), /monaco-editor is not installed.*npm ci/);
	const noAmd = tempDir(t, 'monaco-esm-only-');
	fakeMonaco(noAmd, { version: '2.0.0', files: [path.join('editor', 'editor.main.js')] });
	assert.throws(() => findMonacoPackage(noAmd), /monaco-editor 2\.0\.0 has no AMD build.*loader\.js/);
});

test('vsPathFor puts the version in the URL and ends without a slash', () => {
	assert.equal(vsPathFor('/', '0.55.1'), '/vendor/monaco-editor-0.55.1/vs');
	assert.equal(vsPathFor('/notes/', '0.55.1'), '/notes/vendor/monaco-editor-0.55.1/vs');
});

test('the page gets { version, vsPath, executeUrl, runtimesUrl } as global data (the defaults without options)', async () => {
	const monaco = findMonacoPackage(REPO);
	const plugin = monacoEditorPlugin({ siteDir: REPO, baseUrl: '/' });
	assert.equal(plugin.name, PLUGIN_NAME);
	let globalData = null;
	await plugin.contentLoaded({ actions: { setGlobalData: (data) => { globalData = data; } } });
	assert.deepEqual(globalData, { version: monaco.version, vsPath: vsPathFor('/', monaco.version), executeUrl: DEFAULT_OPTIONS.executeUrl, runtimesUrl: DEFAULT_OPTIONS.runtimesUrl });
	assert.ok(!globalData.vsPath.endsWith('/'));
});

test("the options: another site's function paths reach the page; a bad value or an unknown option stops the build, naming it", async () => {
	assert.deepEqual(DEFAULT_OPTIONS, { executeUrl: '/.netlify/functions/execute', runtimesUrl: '/.netlify/functions/runtimes' });
	assert.deepEqual(readOptions(), DEFAULT_OPTIONS, 'no options: the defaults');
	assert.deepEqual(readOptions({}), DEFAULT_OPTIONS);
	assert.deepEqual(readOptions({ executeUrl: '/api/run' }), { ...DEFAULT_OPTIONS, executeUrl: '/api/run' }, 'a site path');
	assert.deepEqual(readOptions({ runtimesUrl: 'https://runner.example.test/runtimes' }), { ...DEFAULT_OPTIONS, runtimesUrl: 'https://runner.example.test/runtimes' }, 'an absolute URL');
	for (const bad of ['', ' ', 'api/run', 'ftp://x/y', 42, null]) {
		assert.throws(() => readOptions({ executeUrl: bad }), /monaco-editor plugin: option executeUrl must be a site path/, `executeUrl ${JSON.stringify(bad)}`);
	}
	assert.throws(() => readOptions({ runtimesUrl: 'runtimes' }), /option runtimesUrl must be/);
	assert.throws(() => readOptions({ executeURL: '/x' }), /unknown option executeURL \(the options are executeUrl, runtimesUrl\)/);
	assert.deepEqual(readOptions({ id: 'default' }), DEFAULT_OPTIONS, "Docusaurus's own `id` option passes");
	const plugin = monacoEditorPlugin({ siteDir: REPO, baseUrl: '/' }, { executeUrl: '/api/run', runtimesUrl: '/api/runtimes' });
	let globalData = null;
	await plugin.contentLoaded({ actions: { setGlobalData: (data) => { globalData = data; } } });
	assert.equal(globalData.executeUrl, '/api/run');
	assert.equal(globalData.runtimesUrl, '/api/runtimes');
	assert.throws(() => monacoEditorPlugin({ siteDir: REPO, baseUrl: '/' }, { executeUrl: 'nope' }), /option executeUrl/);
});

/** The editor library's client module (an ES module). */
const LIBRARY_CLIENT = path.join(EDITOR_DIR, 'lib', 'codeRunner', 'client.js');

test("the defaults equal the editor library's EXECUTE_URL / RUNTIMES_URL (the plugin is CommonJS at config time, so the two are written twice)", async () => {
	const { EXECUTE_URL, RUNTIMES_URL } = await import(LIBRARY_CLIENT);
	assert.equal(DEFAULT_OPTIONS.executeUrl, EXECUTE_URL);
	assert.equal(DEFAULT_OPTIONS.runtimesUrl, RUNTIMES_URL);
});

test('npm start: the dev server serves min/vs from node_modules at the same URL', () => {
	const monaco = findMonacoPackage(REPO);
	const plugin = monacoEditorPlugin({ siteDir: REPO, baseUrl: '/' });
	assert.deepEqual(plugin.configureWebpack({}, true), {}, 'nothing for the server bundle');
	const { static: entries } = plugin.configureWebpack({}, false).devServer;
	assert.deepEqual(entries, [{ directory: monaco.vsDir, publicPath: vsPathFor('/', monaco.version), watch: false }]);
});

test('postBuild copies the whole min/vs folder byte for byte, at the URL the page is given', async (t) => {
	const monaco = findMonacoPackage(REPO);
	const outDir = tempDir(t, 'monaco-build-');
	const plugin = monacoEditorPlugin({ siteDir: REPO, baseUrl: '/' });
	await plugin.postBuild({ outDir });
	const targetDir = path.join(outDir, ...vsPathFor('/', monaco.version).slice(1).split('/'));
	for (const file of ['loader.js', path.join('editor', 'editor.main.js')]) {
		assert.ok(fs.readFileSync(path.join(targetDir, file)).equals(fs.readFileSync(path.join(monaco.vsDir, file))), `${file} is byte-identical`);
	}
	assert.deepEqual(listFiles(targetDir), listFiles(monaco.vsDir), 'every file of min/vs, nothing else');
	assert.ok(!fs.existsSync(`${targetDir}${STAGING_SUFFIX}`), 'no staging folder left behind');
});

test('copyVs skips a complete copy of the same version and replaces a half-written one', async (t) => {
	const root = tempDir(t, 'monaco-copy-');
	fakeMonaco(root, { version: '3.0.0' });
	const monaco = findMonacoPackage(root);
	const outDir = path.join(root, 'build');

	const first = await copyVs(outDir, monaco);
	assert.equal(first.skipped, false);
	assert.equal(first.targetDir, path.join(outDir, 'vendor', 'monaco-editor-3.0.0', 'vs'));
	assert.deepEqual(listFiles(first.targetDir), listFiles(monaco.vsDir));

	const second = await copyVs(outDir, monaco);
	assert.deepEqual(second, { targetDir: first.targetDir, skipped: true }, 'already there: no second copy');

	fs.rmSync(path.join(first.targetDir, 'loader.js'));
	fs.mkdirSync(`${first.targetDir}${STAGING_SUFFIX}`);
	fs.writeFileSync(path.join(`${first.targetDir}${STAGING_SUFFIX}`, 'stale.js'), '');
	const third = await copyVs(outDir, monaco);
	assert.equal(third.skipped, false, 'an incomplete folder is copied again');
	assert.deepEqual(listFiles(third.targetDir), listFiles(monaco.vsDir));
	assert.ok(!fs.existsSync(`${first.targetDir}${STAGING_SUFFIX}`), 'the stale staging folder is gone');
});

test('a new version goes into a folder of its own', async (t) => {
	const root = tempDir(t, 'monaco-versions-');
	const outDir = path.join(root, 'build');
	fakeMonaco(path.join(root, 'old'), { version: '4.0.0' });
	fakeMonaco(path.join(root, 'new'), { version: '4.1.0' });
	const oldCopy = await copyVs(outDir, findMonacoPackage(path.join(root, 'old')));
	const newCopy = await copyVs(outDir, findMonacoPackage(path.join(root, 'new')));
	assert.equal(newCopy.skipped, false, 'another version is never mistaken for a finished copy');
	assert.notEqual(newCopy.targetDir, oldCopy.targetDir);
	assert.match(fs.readFileSync(path.join(newCopy.targetDir, 'loader.js'), 'utf8'), /4\.1\.0/);
});

test('the site config uses the plugin; the code editor points Monaco at it, never at a third-party host', () => {
	assert.match(fs.readFileSync(CONFIG, 'utf8'), /^\s*codeRunnerPlugin\(/m, 'a line of its own, so a commented-out one does not count');
	// assert.ok, not assert.match: a failure names the rule instead of printing every source file
	const source = editorSource();
	assert.ok(!THIRD_PARTY_HOSTS.test(source), 'the code editor names a third-party host');
	assert.ok(/usePluginData\(/.test(source), 'the code editor never calls usePluginData()');
	assert.ok(new RegExp(`['"]${PLUGIN_NAME}['"]`).test(source), `the code editor never names the plugin '${PLUGIN_NAME}'`);
	assert.ok(/loader\.config\(/.test(source), 'the code editor never calls loader.config(): @monaco-editor/react then loads Monaco from jsDelivr');
});

test("postBuild ships Monaco's licence and third-party notices beside vs/, byte for byte", async (t) => {
	const monaco = findMonacoPackage(REPO);
	const outDir = tempDir(t, 'monaco-notices-');
	await monacoEditorPlugin({ siteDir: REPO, baseUrl: '/' }).postBuild({ outDir });
	const versionDir = path.dirname(path.join(outDir, ...vsPathFor('/', monaco.version).slice(1).split('/')));
	assert.deepEqual(NOTICE_FILES, ['LICENSE', 'ThirdPartyNotices.txt']);
	for (const file of NOTICE_FILES) {
		assert.ok(fs.readFileSync(path.join(versionDir, file)).equals(fs.readFileSync(path.join(monaco.packageDir, file))), `${file} is byte-identical`);
	}
});

test('copyNotices skips a notice file the package lacks, with a warning, and goes on', async (t) => {
	const root = tempDir(t, 'monaco-no-notices-');
	fakeMonaco(root);
	const monaco = findMonacoPackage(root);
	fs.writeFileSync(path.join(monaco.packageDir, 'LICENSE'), 'MIT');
	const warnings = [];
	const written = await copyNotices(tempDir(t, 'monaco-out-'), monaco, { warn: (message) => warnings.push(message) });
	assert.deepEqual(written.map((file) => path.basename(file)), ['LICENSE']);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /ThirdPartyNotices\.txt/);
});
