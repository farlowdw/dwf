/**
 * render.test.mjs: <PDFViewer> (../index.jsx) rendered on the server, its packages replaced by stand-ins that
 * record what the viewer hands them (viewerHooks.mjs), so each promise of its header is held here:
 *   - the worker comes from the URL shared/plugins/pdfjs-worker hands the page, never from a CDN;
 *   - PDF.js runs with isEvalSupported false, the viewer's other parameters kept;
 *   - the file, the first page and the two callbacks reach the viewer (a site remembers its place through them);
 *   - zoom maps to the viewer's scale, and below 1050 px the page fits the width whatever zoom asks;
 *   - the viewer takes the site's colour mode, and fills the box its height and width give;
 *   - print hides the site's page under the viewer's own print layer;
 *   - the text boxes and the zoom label take the page's font, the icon buttons keep theirs;
 *   - the stand-ins name what the real packages export, so a renamed export goes red here.
 * HOW TO CHANGE IT  A new prop or case of ../index.jsx gets a test here. Run with `npm run test:shared`, or on its own
 * with `node --test "shared/components/PDFViewer/__tests__/*.test.mjs"` in a site.
 */

import { createRequire, register } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

register('../../../__tests__/renderHooks.mjs', import.meta.url);
register('./viewerHooks.mjs', import.meta.url);

const { COLOR_MODE_KEY } = await import('../../../__tests__/renderHooks.mjs');
const { VIEWER_KEY } = await import('./viewerHooks.mjs');
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: PDFViewer } = await import('../index.jsx');

const require = createRequire(import.meta.url);

/** What the worker plugin hands a page whose site is at the root. */
const WORKER_URL = '/vendor/pdfjs-dist-3.11.174/pdf.worker.min.js';
const NARROW_QUERY = '(max-width:1050px)';

/** Renders the viewer; returns the markup and what the stand-ins recorded. */
function render(props, { small = false, colorMode = 'light' } = {}) {
  globalThis[VIEWER_KEY] = { small, pluginData: { 'pdfjs-worker': { version: '3.11.174', workerUrl: WORKER_URL } } };
  globalThis[COLOR_MODE_KEY] = colorMode;
  const html = renderToStaticMarkup(createElement(PDFViewer, props));
  return { html, ...globalThis[VIEWER_KEY] };
}

test('the worker comes from the URL the worker plugin hands the page', () => {
  const { worker, html } = render({ file: '/a.pdf' });
  assert.equal(worker.workerUrl, WORKER_URL);
  assert.doesNotMatch(html, /unpkg|jsdelivr|cdnjs/);
});

test('PDF.js runs with isEvalSupported false, and the viewer\'s own parameters stay', () => {
  const { viewer } = render({ file: '/a.pdf' });
  const params = viewer.transformGetDocumentParams({ url: '/a.pdf', isEvalSupported: true, withCredentials: false });
  assert.deepEqual(params, { url: '/a.pdf', isEvalSupported: false, withCredentials: false });
});

test('the file, the first page and the two callbacks reach the viewer', () => {
  const onPageChange = () => {};
  const onZoom = () => {};
  const { viewer } = render({ file: '/b.pdf', initialPage: 3, onPageChange, onZoom });
  assert.equal(viewer.fileUrl, '/b.pdf');
  assert.equal(viewer.initialPage, 3);
  assert.equal(viewer.onPageChange, onPageChange);
  assert.equal(viewer.onZoom, onZoom);
  const plain = render({ file: '/b.pdf' }).viewer;
  assert.deepEqual([plain.initialPage, plain.onPageChange, plain.onZoom], [0, undefined, undefined]);
  assert.deepEqual(plain.plugins, [{ name: 'default-layout' }]);
});

test('zoom: page width by default, the two named fits, actual size and a number', () => {
  const scale = (zoom) => render({ file: '/a.pdf', zoom }).viewer.defaultScale;
  assert.equal(render({ file: '/a.pdf' }).viewer.defaultScale, 'PageWidth');
  assert.equal(scale('page-width'), 'PageWidth');
  assert.equal(scale('page-fit'), 'PageFit');
  assert.equal(scale('actual-size'), 'ActualSize');
  assert.equal(scale(1.75), 1.75);
  assert.equal(scale('1.5'), 1.5);
});

test('below 1050 px wide the page fits the width, whatever zoom asks', () => {
  const { viewer, query } = render({ file: '/a.pdf', zoom: 1.75 }, { small: true });
  assert.equal(query, NARROW_QUERY);
  assert.equal(viewer.defaultScale, 'PageWidth');
});

test('the viewer takes the site\'s colour mode', () => {
  assert.equal(render({ file: '/a.pdf' }, { colorMode: 'dark' }).viewer.theme, 'dark');
  assert.equal(render({ file: '/a.pdf' }, { colorMode: 'light' }).viewer.theme, 'light');
});

test('the viewer fills the box its height and width give, all of it by default', () => {
  assert.match(render({ file: '/a.pdf' }).html, /<div style="height:100%;width:100%">/);
  assert.match(render({ file: '/a.pdf', height: '80vh' }).html, /<div style="height:80vh;width:100%">/);
});

test('print hides the site\'s page under the viewer\'s own print layer', () => {
  const style = render({ file: '/a.pdf' }).html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  assert.match(style, /@media print\s*\{\s*\.rpv-print__body-printing #__docusaurus\s*\{\s*display: none;\s*\}\s*\}/);
});

test('the text boxes and the zoom label take the page\'s font, and the icon buttons keep theirs', () => {
  const style = render({ file: '/a.pdf' }).html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  // Outside the print rule, or the font would hold on paper only.
  const onScreen = style.replace(/@media print\s*\{[^{}]*\{[^{}]*\}\s*\}/, '');
  // Two rules of their own: a browser without :has() drops the second and keeps the first.
  assert.match(onScreen, /(^|\})\s*\.rpv-core__textbox\s*\{\s*font: inherit;\s*\}/);
  assert.match(onScreen, /\}\s*\.rpv-core__minimal-button:has\(\.rpv-zoom__popover-target\)\s*\{\s*font: inherit;\s*\}/);
  // A font on every button moves each icon, so no rule names the bare class.
  assert.doesNotMatch(onScreen, /\.rpv-core__minimal-button\s*[,{]/);
});

test('the stand-ins name what the real packages export', () => {
  const core = require('@react-pdf-viewer/core');
  assert.equal(typeof core.Worker, 'function');
  assert.equal(typeof core.Viewer, 'function');
  assert.deepEqual({ ...core.SpecialZoomLevel }, { ActualSize: 'ActualSize', PageFit: 'PageFit', PageWidth: 'PageWidth' });
  assert.equal(typeof require('@react-pdf-viewer/default-layout').defaultLayoutPlugin, 'function');
  assert.equal(typeof require('@mui/material/useMediaQuery').default, 'function');
});
