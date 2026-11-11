/**
 * shared/plugins/monaco-editor — serves Monaco (the editor inside shared/components/CodeEditor)
 * from the site itself instead of jsDelivr, and hands the editor the site's settings (where its
 * two functions are) as global data.
 *
 * WHY
 *   The code editor uses @monaco-editor/react, whose loader fetches Monaco's AMD build at run
 *   time: <vs>/loader.js, then vs/editor/editor.main.js and whatever language files and workers
 *   a page needs. Out of the box <vs> is cdn.jsdelivr.net — a third party that could be down,
 *   slow, or serve something else, running in every reader's page (shared/README.md > What never
 *   goes in: anything served from a CDN). So the installed monaco-editor package's own min/vs
 *   folder is served from the site and the editor's loader is pointed at it.
 *
 * WHAT IT DOES
 *   It finds the installed monaco-editor on disk (node_modules, looking in the site folder and
 *   then in each folder above it, as Node does) and serves its min/vs folder at
 *       /vendor/monaco-editor-<version>/vs
 *   - `npm run build`: copied into build/ (postBuild). The copy goes into a staging folder that
 *     is renamed when it is complete, so the folder only ever exists whole; when it is already
 *     there (same version: the version is in the folder's name) the copy is skipped. A normal
 *     build empties build/ first, so the skip matters when an output is built over again
 *     (e.g. DOCUSAURUS_SKIP_BUNDLING=true).
 *   - `npm start`: served straight from node_modules by the dev server (configureWebpack).
 *   - The package's licence goes with it: NOTICE_FILES (LICENSE, ThirdPartyNotices.txt — Monaco's
 *     MIT licence and the notices of the code bundled inside it) are copied into the version
 *     folder, beside vs/: /vendor/monaco-editor-<version>/LICENSE (build only; copyNotices).
 *   The URL, without a trailing slash, is handed to the page as global data, with the two
 *   function URLs of the plugin's OPTIONS (the editor's folder holds no site setting, so every
 *   site reads the same folder):
 *       usePluginData('monaco-editor') -> { version: '0.55.1', vsPath: '/vendor/monaco-editor-0.55.1/vs',
 *                                          executeUrl: '/.netlify/functions/execute', runtimesUrl: '/.netlify/functions/runtimes' }
 *   and the editor calls loader.config({ paths: { vs: vsPath } }) before its first <Editor>.
 *
 * OPTIONS (a site's docusaurus.config.js: codeRunnerPlugin({ … }) from shared/wiring/index.cjs; all
 * optional)
 *   executeUrl    where the editor POSTs a run (DEFAULT_OPTIONS: /.netlify/functions/execute, a
 *                 site's shim of shared/functions/code-runner/execute.mjs)
 *   runtimesUrl   where it GETs the installed runtimes (default /.netlify/functions/runtimes)
 *   Each is a site path ('/…') or an absolute http(s) URL; anything else, or an unknown option,
 *   stops the build with a message naming it (readOptions; Docusaurus's own `id` passes). The defaults are the library's own
 *   (shared/components/CodeEditor/lib/codeRunner/client.js: EXECUTE_URL / RUNTIMES_URL; a test
 *   keeps them equal), so a site with the two shims passes no options.
 *   An upgrade of monaco-editor changes the version in the URL by itself; nothing to edit. If an
 *   upgrade ever drops the AMD build (min/vs/loader.js), start and build stop here with a message
 *   saying so (REQUIRED_FILES).
 *
 * WHY NOT require.resolve('monaco-editor/package.json')
 *   It happens to work with 0.55.1, but the package's "exports" map decides which subpaths may
 *   be resolved and has changed between versions; reading the folder on disk does not depend on
 *   it (findMonacoPackage).
 *
 * HOW TO CHANGE IT
 *   The URL folder: PUBLIC_FOLDER / folderName() / VS_FOLDER. Which folder of the package is
 *   served: BUILD_FOLDER (min/vs, the minified AMD build). The files that must be there:
 *   REQUIRED_FILES. The licence files copied beside it: NOTICE_FILES. The plugin's name is what
 *   usePluginData() takes — rename both together (shared/components/CodeEditor). A site's own
 *   function paths: the options above (a cross-origin URL needs CORS, which the functions do
 *   not offer yet — they answer OPTIONS with 405: shared/functions/code-runner/README.md >
 *   The origin guard). Tests: __tests__/monacoEditor.test.js (`npm run test:shared`).
 *   After an edit here, restart `npm start`: the dev server does not watch this file, and saving
 *   docusaurus.config.js reloads the site but keeps the old plugin. A new build takes it.
 */

const fs = require('fs');
const path = require('path');

/** The npm package whose AMD build is served. */
const PACKAGE = 'monaco-editor';

/** The package's licence and third-party notices, copied into the version folder with the build. */
const NOTICE_FILES = ['LICENSE', 'ThirdPartyNotices.txt'];

/** The folder of the package that holds the minified AMD build (the loader's `vs` folder). */
const BUILD_FOLDER = path.join('min', 'vs');

/** Files the editor's loader asks for first; their absence means the AMD build is gone. */
const REQUIRED_FILES = ['loader.js', path.join('editor', 'editor.main.js')];

/** The site folder it is served under (a site's other self-hosted files may sit there too). */
const PUBLIC_FOLDER = 'vendor';

/** The last part of the URL: the loader's paths.vs points at this folder. */
const VS_FOLDER = 'vs';

/** Added to the target folder's name while a copy is in progress. */
const STAGING_SUFFIX = '.partial';

/** Name of this plugin = the key of usePluginData(). */
const PLUGIN_NAME = 'monaco-editor';

/** The site's own folder (three levels up), used when Docusaurus does not pass siteDir. */
const DEFAULT_SITE_DIR = path.resolve(__dirname, '..', '..', '..');

/** The plugin's options and their defaults: the editor's two function URLs (see OPTIONS in the header). */
const DEFAULT_OPTIONS = Object.freeze({
	executeUrl: '/.netlify/functions/execute',
	runtimesUrl: '/.netlify/functions/runtimes',
});

/** Docusaurus adds this option to every plugin instance ('default' unless the config names one): not ours, passed through. */
const DOCUSAURUS_OPTIONS = Object.freeze(['id']);

/** What an option's value may look like: a site path, or an absolute http(s) URL. */
const URL_SHAPE = /^(\/|https?:\/\/)/;

/** Throws for a value that is not a site path or an absolute URL. */
function assertUrlOption(name, value) {
	if (typeof value === 'string' && value.trim() !== '' && URL_SHAPE.test(value)) return;
	throw new Error(`${PLUGIN_NAME} plugin: option ${name} must be a site path ('/…') or an absolute URL (http:// or https://); got ${JSON.stringify(value)}.`);
}

/** The options with the defaults filled in; an unknown option or a bad value stops the build with a message naming it. */
function readOptions(options = {}) {
	const given = options ?? {};
	for (const name of Object.keys(given)) {
		if (!(name in DEFAULT_OPTIONS) && !DOCUSAURUS_OPTIONS.includes(name)) {
			throw new Error(`${PLUGIN_NAME} plugin: unknown option ${name} (the options are ${Object.keys(DEFAULT_OPTIONS).join(', ')}).`);
		}
	}
	const read = { ...DEFAULT_OPTIONS };
	for (const name of Object.keys(DEFAULT_OPTIONS)) {
		if (given[name] === undefined) continue;
		assertUrlOption(name, given[name]);
		read[name] = given[name];
	}
	return Object.freeze(read);
}

/** The folder and each folder above it, up to the root of the disk. */
function foldersUpFrom(startDir) {
	const folders = [];
	let dir = path.resolve(startDir);
	while (true) {
		folders.push(dir);
		const parent = path.dirname(dir);
		if (parent === dir) return folders;
		dir = parent;
	}
}

/** The package's version when packageDir holds monaco-editor; null otherwise. */
function readPackageVersion(packageDir) {
	const packageJsonPath = path.join(packageDir, 'package.json');
	if (!fs.existsSync(packageJsonPath)) return null;
	const { name, version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	if (name !== PACKAGE) return null;
	return version;
}

/** Throws when an installed monaco-editor has no AMD build (the files the loader needs). */
function assertAmdBuild(vsDir, version) {
	const missing = REQUIRED_FILES.filter((file) => !fs.existsSync(path.join(vsDir, file)));
	if (missing.length === 0) return;
	throw new Error(
		`${PLUGIN_NAME} plugin: monaco-editor ${version} has no AMD build (missing in ${vsDir}: ${missing.join(', ')}). ` +
			'@monaco-editor/react loads Monaco through <vs>/loader.js; install a monaco-editor version that ships min/vs/loader.js.',
	);
}

/**
 * { version, packageDir, vsDir } of the monaco-editor installed for the site: the first
 * node_modules/monaco-editor found in fromDir or a folder above it (Node's own search order).
 */
function findMonacoPackage(fromDir = DEFAULT_SITE_DIR) {
	for (const dir of foldersUpFrom(fromDir)) {
		const packageDir = path.join(dir, 'node_modules', PACKAGE);
		const version = readPackageVersion(packageDir);
		if (version === null) continue;
		const vsDir = path.join(packageDir, BUILD_FOLDER);
		assertAmdBuild(vsDir, version);
		return { version, packageDir, vsDir };
	}
	throw new Error(`${PLUGIN_NAME} plugin: monaco-editor is not installed (no node_modules/${PACKAGE} in or above ${fromDir}). Run npm ci.`);
}

/** 'monaco-editor-0.55.1' — the version is part of the URL, so a new version never meets an old cached file. */
function folderName(version) {
	return `${PACKAGE}-${version}`;
}

/** The public URL of the vs folder (site-relative, NO trailing slash): what loader.config's paths.vs takes. */
function vsPathFor(baseUrl, version) {
	return `${baseUrl}${PUBLIC_FOLDER}/${folderName(version)}/${VS_FOLDER}`;
}

/** Where the vs folder goes inside a build output folder. */
function vsTargetDir(outDir, version) {
	return path.join(outDir, PUBLIC_FOLDER, folderName(version), VS_FOLDER);
}

/** True when targetDir holds a finished copy (the staging rename makes the folder appear only whole). */
function hasCompleteCopy(targetDir) {
	return REQUIRED_FILES.every((file) => fs.existsSync(path.join(targetDir, file)));
}

/**
 * Copy the vs folder into the build output; returns { targetDir, skipped }. Skipped when a
 * complete copy of this version is already there. Otherwise the folder is copied into
 * `<target>.partial` (copy-on-write where the disk supports it, as APFS does) and renamed.
 */
async function copyVs(outDir, { version, vsDir }) {
	const targetDir = vsTargetDir(outDir, version);
	if (hasCompleteCopy(targetDir)) return { targetDir, skipped: true };

	const stagingDir = `${targetDir}${STAGING_SUFFIX}`;
	await fs.promises.rm(stagingDir, { recursive: true, force: true });
	await fs.promises.mkdir(path.dirname(targetDir), { recursive: true });
	await fs.promises.cp(vsDir, stagingDir, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
	await fs.promises.rm(targetDir, { recursive: true, force: true });
	await fs.promises.rename(stagingDir, targetDir);
	return { targetDir, skipped: false };
}

/**
 * Copy the package's NOTICE_FILES into the version folder (beside vs/). A file the package does
 * not have is skipped with a warning (the build goes on). Returns the paths written.
 */
async function copyNotices(outDir, { version, packageDir }, { warn = console.warn } = {}) {
	const versionDir = path.dirname(vsTargetDir(outDir, version));
	await fs.promises.mkdir(versionDir, { recursive: true });
	const written = [];
	for (const file of NOTICE_FILES) {
		const source = path.join(packageDir, file);
		if (!fs.existsSync(source)) {
			warn(`[${PLUGIN_NAME}] ${PACKAGE} ${version} has no ${file}; it is not copied.`);
			continue;
		}
		const target = path.join(versionDir, file);
		await fs.promises.copyFile(source, target);
		written.push(target);
	}
	return written;
}

function monacoEditorPlugin(context = {}, options = {}) {
	const { executeUrl, runtimesUrl } = readOptions(options);
	const monaco = findMonacoPackage(context.siteDir ?? DEFAULT_SITE_DIR);
	const baseUrl = context.baseUrl ?? '/';
	const vsPath = vsPathFor(baseUrl, monaco.version);

	return {
		name: PLUGIN_NAME,

		async contentLoaded({ actions }) {
			actions.setGlobalData({ version: monaco.version, vsPath, executeUrl, runtimesUrl });
		},

		// `npm start`: the dev server serves monaco-editor/min/vs under the same URL
		configureWebpack(config, isServer) {
			if (isServer) return {};
			return {
				devServer: {
					static: [{ directory: monaco.vsDir, publicPath: vsPath, watch: false }],
				},
			};
		},

		async postBuild({ outDir }) {
			await copyVs(outDir, monaco);
			await copyNotices(outDir, monaco);
		},
	};
}

module.exports = monacoEditorPlugin;
module.exports.PLUGIN_NAME = PLUGIN_NAME;
module.exports.REQUIRED_FILES = REQUIRED_FILES;
module.exports.STAGING_SUFFIX = STAGING_SUFFIX;
module.exports.findMonacoPackage = findMonacoPackage;
module.exports.vsPathFor = vsPathFor;
module.exports.copyVs = copyVs;
module.exports.copyNotices = copyNotices;
module.exports.NOTICE_FILES = NOTICE_FILES;
module.exports.DEFAULT_OPTIONS = DEFAULT_OPTIONS;
module.exports.readOptions = readOptions;
