/**
 * shared/plugins/katex-css: serves KaTeX's stylesheet and fonts from the site as their own files,
 * and links the stylesheet from every page. A site with maths names it in its config's `plugins`
 * as katexCssPlugin(), from shared/wiring/index.cjs.
 *
 * WHY
 *   Maths needs KaTeX's CSS on every page (build-time maths in docs, blog and pages, and any maths
 *   a page typesets in the browser). Imported through webpack (a clientModules entry), the CSS
 *   landed in the site's render-blocking main stylesheet, and Docusaurus's url-loader inlined
 *   every font file under 10 KB into it as base64 (woff2 + woff + ttf of six families: ~88 KB
 *   gzipped on every first paint, most of it fonts no page used). As separate files the
 *   stylesheet is ~3.5 KB gzipped and cached, and the browser downloads a font (woff2 only)
 *   the first time a formula needs it. Everything is served from the site: no third-party
 *   stylesheet, and never a version other than the one that typeset the maths.
 *
 * WHAT IT DOES
 *   It finds the installed `katex` (the one the site's lock holds, the same version rehype-katex
 *   typesets with; Node looks in the site's node_modules from here) and serves its
 *   dist/katex.min.css and dist/fonts/ at
 *       /vendor/katex-<version>/katex.min.css   (+ /vendor/katex-<version>/fonts/…)
 *   - `npm run build`: copied into build/ (postBuild);
 *   - `npm start`:     served straight from node_modules by the dev server (configureWebpack).
 *   Every page's <head> gets <link rel="stylesheet" href="/vendor/katex-<version>/katex.min.css">
 *   (injectHtmlTags). The stylesheet names its fonts relative to itself (url(fonts/…)), so the
 *   folder is copied as it is. An upgrade of katex changes the version in the URL by itself.
 *
 * HOW TO CHANGE IT
 *   The URL folder: PUBLIC_FOLDER / folderName(). Which stylesheet: STYLESHEET_FILE (KaTeX
 *   also ships katex-swap.min.css, with font-display: swap). The fonts folder: FONTS_FOLDER.
 *   The name a site's config uses: KATEX_CSS_PLUGIN in shared/wiring/index.cjs. A change here
 *   needs a restart of `npm start` (a running dev server keeps the old plugin), or a new build.
 *   Tests: __tests__/katexCss.test.js (`npm run test:shared`).
 */

const fs = require('fs');
const path = require('path');

/** The npm package whose stylesheet and fonts are served. */
const PACKAGE = 'katex';

/** Inside the package's dist/: the stylesheet and the fonts folder it names. */
const STYLESHEET_FILE = 'katex.min.css';
const FONTS_FOLDER = 'fonts';

/** The site folder they are served under, beside the other files a site serves itself. */
const PUBLIC_FOLDER = 'vendor';

const PLUGIN_NAME = 'katex-css';

/** { version, distDir } of the installed katex. */
function resolveKatex() {
	const packageJsonPath = require.resolve(`${PACKAGE}/package.json`);
	const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
	return { version, distDir: path.join(path.dirname(packageJsonPath), 'dist') };
}

/** 'katex-0.16.47' — the version is part of the URL, so a new version never meets an old cached file. */
function folderName(version) {
	return `${PACKAGE}-${version}`;
}

/** The public URL of the stylesheet (site-relative). */
function stylesheetUrlFor(baseUrl, version) {
	return `${baseUrl}${PUBLIC_FOLDER}/${folderName(version)}/${STYLESHEET_FILE}`;
}

/** Copy the stylesheet and its fonts into the build output; returns the folder written. */
async function copyStylesheet(outDir, { version, distDir }) {
	const targetDir = path.join(outDir, PUBLIC_FOLDER, folderName(version));
	await fs.promises.mkdir(targetDir, { recursive: true });
	await fs.promises.copyFile(path.join(distDir, STYLESHEET_FILE), path.join(targetDir, STYLESHEET_FILE));
	await fs.promises.cp(path.join(distDir, FONTS_FOLDER), path.join(targetDir, FONTS_FOLDER), { recursive: true });
	return targetDir;
}

function katexCssPlugin(context) {
	const katex = resolveKatex();
	const baseUrl = context.baseUrl ?? '/';

	return {
		name: PLUGIN_NAME,

		injectHtmlTags() {
			return { headTags: [{ tagName: 'link', attributes: { rel: 'stylesheet', href: stylesheetUrlFor(baseUrl, katex.version) } }] };
		},

		// `npm start`: the dev server serves katex/dist under the same URL folder
		configureWebpack(config, isServer) {
			if (isServer) return {};
			return {
				devServer: {
					static: [{ directory: katex.distDir, publicPath: `${baseUrl}${PUBLIC_FOLDER}/${folderName(katex.version)}`, watch: false }],
				},
			};
		},

		async postBuild({ outDir }) {
			await copyStylesheet(outDir, katex);
		},
	};
}

module.exports = katexCssPlugin;
module.exports.PLUGIN_NAME = PLUGIN_NAME;
module.exports.STYLESHEET_FILE = STYLESHEET_FILE;
module.exports.FONTS_FOLDER = FONTS_FOLDER;
module.exports.resolveKatex = resolveKatex;
module.exports.stylesheetUrlFor = stylesheetUrlFor;
module.exports.copyStylesheet = copyStylesheet;
