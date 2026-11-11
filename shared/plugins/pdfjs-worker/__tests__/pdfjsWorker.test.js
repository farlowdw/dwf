/**
 * pdfjsWorker.test.js — shared/plugins/pdfjs-worker: the worker served is the one of the pdfjs-dist
 * that @react-pdf-viewer/core really uses (same version, same bytes), its URL carries that
 * version, and the viewer (shared/components/PDFViewer) names no third-party host. Writes only into
 * a temporary folder. It needs the site's node_modules, so it runs in a site: `npm run test:shared`
 * runs it wherever the site uses the viewer, and a site's test:site may name this folder too.
 *
 * HOW TO CHANGE IT  A new behaviour of the plugin gets a test here. If the viewer moves, VIEWER_SOURCE.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pdfjsWorkerPlugin = require('..');

const { PLUGIN_NAME, WORKER_FILE, copyWorker, resolvePdfjs, workerUrlFor } = pdfjsWorkerPlugin;

/** The shared folder: this file is shared/plugins/pdfjs-worker/__tests__/pdfjsWorker.test.js. */
const SHARED = path.resolve(__dirname, '..', '..', '..');
const VIEWER_SOURCE = path.join(SHARED, 'components', 'PDFViewer', 'index.jsx');

test('the version is the one @react-pdf-viewer/core loads (the API and the worker must match)', () => {
	const { version, buildDir } = resolvePdfjs();
	const viewerDir = path.dirname(require.resolve('@react-pdf-viewer/core/package.json'));
	const apiEntry = require.resolve('pdfjs-dist', { paths: [viewerDir] });
	assert.equal(path.dirname(apiEntry), buildDir, 'the worker sits next to the pdf.js the viewer requires');
	assert.match(version, /^\d+\.\d+\.\d+$/);
	assert.ok(fs.readFileSync(path.join(buildDir, WORKER_FILE), 'utf8').includes(version), 'the worker file names its version');
});

test('workerUrlFor puts the version in the URL', () => {
	assert.equal(workerUrlFor('/', '3.11.174'), '/vendor/pdfjs-dist-3.11.174/pdf.worker.min.js');
});

test('postBuild copies the exact file; the page gets its URL as global data', async () => {
	const pdfjs = resolvePdfjs();
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfjs-worker-'));
	try {
		const plugin = pdfjsWorkerPlugin({ baseUrl: '/' });
		assert.equal(plugin.name, PLUGIN_NAME);
		let globalData = null;
		await plugin.contentLoaded({ actions: { setGlobalData: (data) => { globalData = data; } } });
		assert.deepEqual(globalData, { version: pdfjs.version, workerUrl: workerUrlFor('/', pdfjs.version) });
		const written = await copyWorker(outDir, pdfjs);
		assert.equal(path.relative(outDir, written), globalData.workerUrl.slice(1).split('/').join(path.sep));
		assert.ok(fs.readFileSync(written).equals(fs.readFileSync(path.join(pdfjs.buildDir, WORKER_FILE))), 'byte-identical');
	} finally {
		fs.rmSync(outDir, { recursive: true, force: true });
	}
});

test('npm start: the dev server serves the same folder from node_modules', () => {
	const pdfjs = resolvePdfjs();
	const plugin = pdfjsWorkerPlugin({ baseUrl: '/' });
	assert.deepEqual(plugin.configureWebpack({}, true), {}, 'nothing for the server bundle');
	const [entry] = plugin.configureWebpack({}, false).devServer.static;
	assert.equal(entry.directory, pdfjs.buildDir);
	assert.equal(`${entry.publicPath}/${WORKER_FILE}`, workerUrlFor('/', pdfjs.version));
});

test('the PDF viewer loads no worker from a third-party host', () => {
	const source = fs.readFileSync(VIEWER_SOURCE, 'utf8');
	assert.doesNotMatch(source, /unpkg\.com|cdn\.jsdelivr|cdnjs/);
	assert.match(source, new RegExp(`usePluginData\\('${PLUGIN_NAME}'\\)`));
});
