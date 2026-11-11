/**
 * buildId.test.js — shared/plugins/build-id: the id's shape (accepted by the reloader's
 * decide.js > cleanBuildId), the <meta> and build-id.json of a production build, and nothing at
 * all under `npm start`. Writes only into a temporary folder. Run with `npm run test:shared`.
 *
 * HOW TO CHANGE IT
 *   A new name for the meta or the file: the first test compares the plugin's with the
 *   reloader's (shared/lib/pageReload/decide.js), so change both. A new thing the plugin
 *   writes gets its case beside the second test.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const buildIdPlugin = require('..');

const { BUILD_ID_FILE, BUILD_ID_META_NAME, createBuildId } = buildIdPlugin;

test('ids are unique, time-ordered and accepted by the reloader', async () => {
	const { BUILD_ID_META_NAME: clientMetaName, BUILD_ID_PATH, cleanBuildId } = await import('../../../lib/pageReload/decide.js');
	const first = createBuildId(new Date('2026-09-29T14:15:03.120Z'));
	assert.match(first, /^20260929T141503120Z-[0-9a-f]{8}$/);
	assert.notEqual(createBuildId(), createBuildId());
	assert.equal(cleanBuildId(first), first);
	assert.equal(clientMetaName, BUILD_ID_META_NAME, 'the plugin and the client agree on the meta name');
	assert.equal(BUILD_ID_PATH, `/${BUILD_ID_FILE}`, 'and on the file');
});

test('a production build injects the meta and writes build-id.json with the same id', async () => {
	const plugin = buildIdPlugin({}, { production: true });
	const [tag] = plugin.injectHtmlTags().headTags;
	assert.equal(tag.tagName, 'meta');
	assert.equal(tag.attributes.name, BUILD_ID_META_NAME);
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-id-'));
	try {
		await plugin.postBuild({ outDir });
		const written = JSON.parse(fs.readFileSync(path.join(outDir, BUILD_ID_FILE), 'utf8'));
		assert.equal(written.buildId, tag.attributes.content);
		assert.ok(!Number.isNaN(Date.parse(written.builtAt)));
		assert.deepEqual(Object.keys(written).sort(), ['buildId', 'builtAt'], 'nothing else in the file');
	} finally {
		fs.rmSync(outDir, { recursive: true, force: true });
	}
});

test('npm start (not production): no meta, no file', async () => {
	const plugin = buildIdPlugin({}, { production: false });
	assert.deepEqual(plugin.injectHtmlTags(), {});
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-id-'));
	try {
		await plugin.postBuild({ outDir });
		assert.equal(fs.existsSync(path.join(outDir, BUILD_ID_FILE)), false);
	} finally {
		fs.rmSync(outDir, { recursive: true, force: true });
	}
});
