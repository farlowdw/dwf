/**
 * shared/plugins/build-id — gives every production build a fresh id, so an open tab can tell
 * that a newer build has been deployed and reload itself (shared/lib/pageReload: reloader.js,
 * started by a client module of the site, rules in decide.js). A site names it in its config as
 * `buildIdPlugin()` from shared/wiring/index.cjs.
 *
 * WHAT IT WRITES (`npm run build` / `netlify build` only)
 *   - <meta name="site-build-id" content="<id>"> in the <head> of every page: the build the
 *     page was loaded from;
 *   - build/build-id.json = { "buildId": "<id>", "builtAt": "<ISO time>" }: the build that is
 *     live now.
 *   The id is the build's start time plus 8 random hex digits (e.g. 20260929T141503120Z-3fa9c2d1):
 *   unique per build, and nothing secret in it.
 *   Under `npm start` it writes nothing (no meta, no file), so the reloader stays off there.
 *   The site serves /build-id.json with `Cache-Control: no-cache` (shared/lib/README.md), or a
 *   cached copy hides a deploy.
 *
 * HOW TO CHANGE IT
 *   The meta name / file name: BUILD_ID_META_NAME / BUILD_ID_FILE (they must match
 *   shared/lib/pageReload/decide.js, which says what a tab loaded before such a change does).
 *   The id's shape: createBuildId() (keep to letters, digits, '-', '.', ':' and at most 100
 *   characters, which decide.js > cleanBuildId accepts).
 *   Tests: __tests__/buildId.test.js (`npm run test:shared`).
 *   After an edit here, restart `npm start`: the dev server keeps the old plugin. A new build
 *   takes it.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** The <meta name> the page's id goes into (decide.js > BUILD_ID_META_NAME). */
const BUILD_ID_META_NAME = 'site-build-id';

/** The file in the build folder that names the live build (decide.js > BUILD_ID_PATH). */
const BUILD_ID_FILE = 'build-id.json';

/** How many random bytes follow the time in an id (4 bytes = 8 hex digits). */
const RANDOM_BYTES = 4;

/** '2026-09-29T14:15:03.120Z' -> '20260929T141503120Z' (only letters and digits). */
function compactTime(date) {
	return date.toISOString().replace(/[-:.]/g, '');
}

/** A new id: the time plus a random suffix (two builds in one millisecond still differ). */
function createBuildId(date = new Date()) {
	return `${compactTime(date)}-${crypto.randomBytes(RANDOM_BYTES).toString('hex')}`;
}

/** The JSON text of build-id.json. */
function buildIdFileText(buildId, date) {
	return `${JSON.stringify({ buildId, builtAt: date.toISOString() }, null, 2)}\n`;
}

/**
 * The Docusaurus plugin. options.production (tests) overrides the check of NODE_ENV, which
 * `docusaurus build` sets to 'production' before it loads the plugins.
 */
function buildIdPlugin(context, options = {}) {
	const production = options.production ?? process.env.NODE_ENV === 'production';
	const startedAt = new Date();
	const buildId = createBuildId(startedAt);

	return {
		name: 'build-id',

		injectHtmlTags() {
			if (!production) return {};
			return { headTags: [{ tagName: 'meta', attributes: { name: BUILD_ID_META_NAME, content: buildId } }] };
		},

		async postBuild({ outDir }) {
			if (!production) return;
			await fs.promises.writeFile(path.join(outDir, BUILD_ID_FILE), buildIdFileText(buildId, startedAt));
		},
	};
}

module.exports = buildIdPlugin;
module.exports.BUILD_ID_META_NAME = BUILD_ID_META_NAME;
module.exports.BUILD_ID_FILE = BUILD_ID_FILE;
module.exports.createBuildId = createBuildId;
