/**
 * katexCss.test.js — shared/plugins/katex-css: the stylesheet served is the installed katex's, at the
 * version rehype-katex resolves in the site's lock, every font it names is copied next
 * to it, every page links it, the wiring names it by a relative path that leads here, and the site's
 * config uses it, bundles no KaTeX CSS and names no KaTeX stylesheet on a third-party host. A KaTeX
 * script from a CDN is beyond this suite (a site whose pseudocode blocks typeset in the browser keeps
 * one); a site that allows none holds that in a test of its own, as it holds an exact pin of katex.
 * Writes only into a temporary folder. Run with `npm run test:shared`.
 *
 * In the hub, with no site around shared/, the tests that read a site's packages or config skip with
 * "outside a site"; the URL and the wiring are checked anyway.
 *
 * HOW TO CHANGE IT
 *   Add a test beside the behaviour it checks. The hosts a stylesheet must not come from:
 *   THIRD_PARTY_STYLESHEET. What makes the folder above shared/ a site: CONFIG_FILE and MOUNT_FOLDER.
 *   Where the lock holds the katex rehype-katex resolves: TYPESETTER_ENTRIES.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const katexCssPlugin = require('..');
const { katexCssPlugin: wiringEntry } = require('../../../wiring/index.cjs');

const { PLUGIN_NAME, STYLESHEET_FILE, copyStylesheet, resolveKatex, stylesheetUrlFor } = katexCssPlugin;

/** What marks a folder as a Docusaurus site, and the folder shared/ is mounted at inside it. */
const CONFIG_FILE = 'docusaurus.config.js';
const LOCK_FILE = 'package-lock.json';
const MOUNT_FOLDER = 'shared';

/**
 * Where the lock holds the katex rehype-katex resolves, nearest first: a copy nested under rehype-katex,
 * else the site's own. A katex nested under another package (mermaid's, say) is that package's alone.
 */
const TYPESETTER_ENTRIES = ['node_modules/rehype-katex/node_modules/katex', 'node_modules/katex'];

/** A KaTeX stylesheet on a third-party host, in any case (cdnjs spells the folder KaTeX). */
const THIRD_PARTY_STYLESHEET = /(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)[^'"`]*katex[^'"`]*\.css/i;

/** A webpack import of KaTeX's CSS, which inlines its fonts into the main stylesheet. */
const BUNDLED_STYLESHEET = /require\.resolve\('katex\/dist\/katex(\.min)?\.css'\)/;

/** The plugin's call on a line of its own, so a commented-out one does not count. */
const PLUGIN_LINE = /^\s*katexCssPlugin\(\)/m;

/** shared/'s root: the hub's root, or the mount in a site. */
const SHARED_ROOT = path.resolve(__dirname, '..', '..', '..');

/** The site shared/ is mounted in, or null in the hub. */
function hostSite() {
	const parent = path.dirname(SHARED_ROOT);
	const isMount = path.basename(SHARED_ROOT) === MOUNT_FOLDER;
	return isMount && fs.existsSync(path.join(parent, CONFIG_FILE)) ? parent : null;
}

const REPO = hostSite();
const inSite = { skip: REPO === null ? 'outside a site' : false };

/** The version of katex rehype-katex resolves, as the site's lock records it. */
function typesetterVersion() {
	const { packages = {} } = JSON.parse(fs.readFileSync(path.join(REPO, LOCK_FILE), 'utf8'));
	return packages[TYPESETTER_ENTRIES.find((where) => packages[where])]?.version;
}

test('the version is the installed katex (the one rehype-katex typesets with)', inSite, () => {
	const { version, distDir } = resolveKatex();
	assert.equal(version, require(require.resolve('katex/package.json', { paths: [REPO] })).version, 'the site\'s own katex');
	assert.equal(typesetterVersion(), version, 'rehype-katex resolves the version served');
	assert.ok(fs.existsSync(path.join(distDir, STYLESHEET_FILE)));
});

test('stylesheetUrlFor puts the version in the URL', () => {
	assert.equal(stylesheetUrlFor('/', '0.16.47'), '/vendor/katex-0.16.47/katex.min.css');
});

test('postBuild copies the stylesheet byte for byte, and every font it names', inSite, async () => {
	const katex = resolveKatex();
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'katex-css-'));
	try {
		const written = await copyStylesheet(outDir, katex);
		assert.equal(path.relative(outDir, path.join(written, STYLESHEET_FILE)), stylesheetUrlFor('/', katex.version).slice(1).split('/').join(path.sep));
		const css = fs.readFileSync(path.join(written, STYLESHEET_FILE));
		assert.ok(css.equals(fs.readFileSync(path.join(katex.distDir, STYLESHEET_FILE))), 'byte-identical');
		const fonts = [...css.toString('utf8').matchAll(/url\(([^)]+)\)/g)].map((match) => match[1]);
		assert.ok(fonts.length > 0);
		for (const font of fonts) assert.ok(fs.existsSync(path.join(written, font)), font);
	} finally {
		fs.rmSync(outDir, { recursive: true, force: true });
	}
});

test('every page links the stylesheet; npm start serves the same folder from node_modules', inSite, () => {
	const katex = resolveKatex();
	const plugin = katexCssPlugin({ baseUrl: '/' });
	assert.equal(plugin.name, PLUGIN_NAME);
	assert.deepEqual(plugin.injectHtmlTags().headTags, [{ tagName: 'link', attributes: { rel: 'stylesheet', href: stylesheetUrlFor('/', katex.version) } }]);
	assert.deepEqual(plugin.configureWebpack({}, true), {}, 'nothing for the server bundle');
	const [entry] = plugin.configureWebpack({}, false).devServer.static;
	assert.equal(entry.directory, katex.distDir);
	assert.equal(`${entry.publicPath}/${STYLESHEET_FILE}`, stylesheetUrlFor('/', katex.version));
});

test('the site config uses the plugin, bundles no KaTeX CSS, and names no third-party host for it', inSite, () => {
	const source = fs.readFileSync(path.join(REPO, CONFIG_FILE), 'utf8');
	assert.match(source, PLUGIN_LINE, 'katexCssPlugin() in plugins, on a line of its own');
	assert.doesNotMatch(source, BUNDLED_STYLESHEET, 'a clientModules import would inline its fonts into the main CSS');
	assert.doesNotMatch(source, THIRD_PARTY_STYLESHEET, 'a KaTeX stylesheet from a CDN');
});

test('the wiring names the plugin by a relative path from the site, and that path leads here', () => {
	const name = wiringEntry();
	const mounted = `./${MOUNT_FOLDER}/`;
	assert.ok(name.startsWith(mounted), `${name} is relative to a site with shared/ mounted`);
	assert.equal(path.join(SHARED_ROOT, name.slice(mounted.length)), path.resolve(__dirname, '..'));
});
