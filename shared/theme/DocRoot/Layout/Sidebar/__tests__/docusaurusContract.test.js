/**
 * docusaurusContract.test.js — the Docusaurus internals the docs sidebar's reading-place fix
 * relies on (../index.jsx, ../readingPlace.js, ../styles.module.css), read from the site's
 * installed packages. DocRoot/Layout/Sidebar is not listed as safe to swizzle and
 * useScrollController is only in '@docusaurus/theme-common/internal', so a Docusaurus upgrade may
 * change either without notice; the wrapper would then simply never be called and the fix would
 * stop working with no error. If a test here fails after an upgrade, read the new
 * node_modules/@docusaurus/theme-classic/lib/theme/DocRoot/Layout/** and adapt the wrapper.
 * Also: the wrapper's own wiring (it passes its setter, the stylesheet's rule). Run with
 * `npm run test:shared` in a site that has the stub: the packages it reads are that site's.
 *
 * HOW TO CHANGE IT  A new internal the wrapper relies on: a test here that reads it from the
 * installed theme. A renamed file in the theme: the path in theme() or common().
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CONTENT_SELECTOR, NAVBAR_SELECTOR, SIDEBAR_SELECTOR } from '../readingPlace.js';

const require = createRequire(import.meta.url);
const THEME_CLASSIC = join(dirname(require.resolve('@docusaurus/theme-classic/package.json')), 'lib', 'theme');
const THEME_COMMON = dirname(require.resolve('@docusaurus/theme-common/internal'));

const theme = (file) => readFileSync(join(THEME_CLASSIC, file), 'utf8');
const common = (file) => readFileSync(join(THEME_COMMON, file), 'utf8');
const own = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('DocRoot/Layout hands the sidebar column the setter of hiddenSidebarContainer', () => {
	const layout = theme('DocRoot/Layout/index.js');
	assert.match(layout, /useState\(false\)/);
	assert.match(layout, /<DocRootLayoutSidebar[\s\S]*?setHiddenSidebarContainer=\{setHiddenSidebarContainer\}/);
});

test('every collapse and expand goes through that one setter, from toggleSidebar', () => {
	const sidebar = theme('DocRoot/Layout/Sidebar/index.js');
	assert.equal(sidebar.match(/setHiddenSidebarContainer\(/g)?.length, 1, 'one call, in toggleSidebar');
	assert.match(sidebar, /const toggleSidebar = useCallback\([\s\S]*?setHiddenSidebarContainer\(\(value\) => !value\)/);
	assert.match(sidebar, /onCollapse=\{toggleSidebar\}/, 'the collapse button');
	assert.match(sidebar, /<ExpandButton toggleSidebar=\{toggleSidebar\}/, 'the expand strip');
});

test('the scroll controller is still in theme-common/internal, with its two switches', () => {
	assert.match(common('internal.js'), /useScrollController[\s\S]*?from '\.\/utils\/scrollUtils'/);
	const scrollUtils = common('utils/scrollUtils.js');
	assert.match(scrollUtils, /disableScrollEvents: \(\) => \{\s*scrollEventsEnabledRef\.current = false;/);
	assert.match(scrollUtils, /enableScrollEvents: \(\) => \{\s*scrollEventsEnabledRef\.current = true;/);
});

test('the selectors readingPlace.js uses still name the sidebar column, the navbar and the doc', () => {
	assert.match(common('utils/ThemeClassNames.js'), new RegExp(`docSidebarContainer: '${SIDEBAR_SELECTOR.slice(1)}'`));
	assert.match(theme('Navbar/Layout/index.js'), new RegExp(`'${NAVBAR_SELECTOR.slice(1)}'`));
	assert.match(theme('DocRoot/Layout/Main/index.js'), new RegExp(`<${CONTENT_SELECTOR}\\b`));
});

test('this site’s wiring: the wrapper passes its own setter and loads the stylesheet; the aside leaves scroll anchoring', () => {
	const wrapper = own('index.jsx');
	assert.match(wrapper, /from '@theme-original\/DocRoot\/Layout\/Sidebar'/);
	assert.match(wrapper, /setHiddenSidebarContainer=\{setHiddenKeepingPlace\}/);
	assert.match(wrapper, /import '\.\/styles\.module\.css';/);
	assert.match(own('styles.module.css'), /:global\(\.theme-doc-sidebar-container\)\s*\{\s*overflow-anchor: none;\s*\}/);
});
