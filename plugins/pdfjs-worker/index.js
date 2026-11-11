/**
 * shared/plugins/pdfjs-worker — serves the PDF.js worker from the site itself instead of unpkg.com.
 *
 * WHY
 *   The PDF viewer (shared/components/PDFViewer, the in-page PDF reader) runs
 *   PDF.js, whose parsing happens in a Web Worker script. It used to load that script from
 *   unpkg.com: a third party that could be down, slow, or serve something else. PDF.js also
 *   refuses a worker whose version differs from its own, so the copy must match EXACTLY the
 *   pdfjs-dist that @react-pdf-viewer/core bundles.
 *
 * WHAT IT DOES
 *   It finds that pdfjs-dist (resolved from @react-pdf-viewer/core's folder, the way webpack
 *   resolves it), and serves its build/pdf.worker.min.js at
 *       /vendor/pdfjs-dist-<version>/pdf.worker.min.js
 *   - `npm run build`: copied into build/ (postBuild);
 *   - `npm start`:     served straight from node_modules by the dev server (configureWebpack).
 *   The URL is handed to the page as global data: usePluginData('pdfjs-worker').workerUrl.
 *   An upgrade of pdfjs-dist changes the version in the URL by itself; nothing to edit.
 *   A site names it in its config's `plugins` as pdfjsWorkerPlugin(), from shared/wiring/index.cjs.
 *
 * HOW TO CHANGE IT
 *   The URL folder: PUBLIC_FOLDER / folderName(). Which file: WORKER_FILE (the minified worker).
 *   The package whose pdfjs-dist is used: VIEWER_PACKAGE. The plugin's name is what
 *   usePluginData() takes — rename both together. A change here needs a restart of `npm start`,
 *   not a clear: a running dev server keeps the old plugin. Tests: __tests__/pdfjsWorker.test.js
 *   (`npm run test:shared`).
 */

const fs = require('fs');
const path = require('path');

/** The PDF viewer package whose pdfjs-dist must match the worker. */
const VIEWER_PACKAGE = '@react-pdf-viewer/core';

/** The worker file inside pdfjs-dist/build/. */
const WORKER_FILE = 'pdf.worker.min.js';

/** The site folder the worker is served under. */
const PUBLIC_FOLDER = 'vendor';

/** Name of this plugin = the key of usePluginData(). */
const PLUGIN_NAME = 'pdfjs-worker';

/** { version, buildDir } of the pdfjs-dist that VIEWER_PACKAGE uses. */
function resolvePdfjs(fromDir = path.dirname(require.resolve(`${VIEWER_PACKAGE}/package.json`))) {
	const packageJsonPath = require.resolve('pdfjs-dist/package.json', { paths: [fromDir] });
	const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	return { version, buildDir: path.join(path.dirname(packageJsonPath), 'build') };
}

/** 'pdfjs-dist-3.11.174' — the version is part of the URL, so a new version never meets an old cached file. */
function folderName(version) {
	return `pdfjs-dist-${version}`;
}

/** The public URL of the worker (site-relative). */
function workerUrlFor(baseUrl, version) {
	return `${baseUrl}${PUBLIC_FOLDER}/${folderName(version)}/${WORKER_FILE}`;
}

/** Copy the worker into the build output; returns the written path. */
async function copyWorker(outDir, { version, buildDir }) {
	const targetDir = path.join(outDir, PUBLIC_FOLDER, folderName(version));
	await fs.promises.mkdir(targetDir, { recursive: true });
	const target = path.join(targetDir, WORKER_FILE);
	await fs.promises.copyFile(path.join(buildDir, WORKER_FILE), target);
	return target;
}

function pdfjsWorkerPlugin(context) {
	const pdfjs = resolvePdfjs();
	const baseUrl = context.baseUrl ?? '/';

	return {
		name: PLUGIN_NAME,

		async contentLoaded({ actions }) {
			actions.setGlobalData({ version: pdfjs.version, workerUrl: workerUrlFor(baseUrl, pdfjs.version) });
		},

		// `npm start`: the dev server serves pdfjs-dist/build under the same URL folder
		configureWebpack(config, isServer) {
			if (isServer) return {};
			return {
				devServer: {
					static: [{ directory: pdfjs.buildDir, publicPath: `${baseUrl}${PUBLIC_FOLDER}/${folderName(pdfjs.version)}`, watch: false }],
				},
			};
		},

		async postBuild({ outDir }) {
			await copyWorker(outDir, pdfjs);
		},
	};
}

module.exports = pdfjsWorkerPlugin;
module.exports.PLUGIN_NAME = PLUGIN_NAME;
module.exports.WORKER_FILE = WORKER_FILE;
module.exports.resolvePdfjs = resolvePdfjs;
module.exports.workerUrlFor = workerUrlFor;
module.exports.copyWorker = copyWorker;
