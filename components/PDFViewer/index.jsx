/**
 * shared/components/PDFViewer/index.jsx — the in-page PDF reader (@react-pdf-viewer/core + its default
 * layout: toolbar, thumbnails, search), themed with the site's light / dark mode. A site reaches it
 * through its one-line stub, src/components/PDFViewer/index.jsx, so a page or note keeps writing
 * import PDFViewer from '@site/src/components/PDFViewer'.
 *
 * Props: file (URL), height / width (CSS, default 100%), zoom ('page-width' default,
 * 'page-fit', 'actual-size' or a number), initialPage (0-based), onPageChange, onZoom.
 * Below 1050 px wide the page always fits the width, whatever zoom asks.
 *
 * THE WORKER
 *   PDF.js parses in a Web Worker whose version must equal the bundled pdfjs-dist. The worker
 *   is served by the site itself (shared/plugins/pdfjs-worker, named in the site's config as
 *   pdfjsWorkerPlugin() from shared/wiring/index.cjs: /vendor/pdfjs-dist-<version>/pdf.worker.min.js,
 *   copied from node_modules at build time), never from a third-party CDN. Without that plugin
 *   usePluginData('pdfjs-worker') throws, and shared:status says so first (the row's needsConfig).
 *   PDF.js runs with isEvalSupported: false (PDF_JS_OPTIONS), the published mitigation for
 *   CVE-2024-4367 (a crafted font running script) in pdfjs-dist < 4.2.67; @react-pdf-viewer
 *   3.x cannot use pdfjs-dist 4, and fonts still render (PDF.js takes its non-eval path).
 *
 * PRINT
 *   The viewer's Print button draws the pages into a layer of its own and marks <body> with
 *   rpv-print__body-printing; the style below hides the site's page under that layer, so only the
 *   PDF prints.
 *
 * TOOLBAR TEXT
 *   A browser draws a form control in a small font of its own (11 to 13 px) unless a style says
 *   otherwise, so the page-number box and the zoom label read smaller than the "/ N" beside them,
 *   and Safari on an iPhone zooms the whole page when a box under 16 px takes focus. The style below
 *   gives the viewer's text boxes (the page number; the search box has the same class) and the zoom
 *   label's button the font of the page around them. Two rules, on purpose: a browser without :has()
 *   drops the second and keeps the first. Not every button: a font on .rpv-core__minimal-button moves
 *   each icon up by half a pixel or more.
 *
 * HOW TO CHANGE IT
 *   The layout / toolbar: defaultLayoutPlugin() options. The worker's URL: shared/plugins/pdfjs-worker.
 *   A new prop: defaultProps below, and a case in __tests__/render.test.mjs. Then roll it out
 *   (shared/README.md).
 */
import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import { usePluginData } from '@docusaurus/useGlobalData';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import useMediaQuery from '@mui/material/useMediaQuery';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

/** Extra options for PDF.js's getDocument() (see THE WORKER above). */
const PDF_JS_OPTIONS = Object.freeze({ isEvalSupported: false });

/** Adds PDF_JS_OPTIONS to the parameters the viewer passes to getDocument(). */
function withPdfJsOptions(params) {
  return { ...params, ...PDF_JS_OPTIONS };
}

const PDFViewer = (props) => {
  const isSmallScreen = useMediaQuery('(max-width:1050px)');
	const { colorMode } = useColorMode();
	const { workerUrl } = usePluginData('pdfjs-worker');
	const defaultLayoutPluginInstance = defaultLayoutPlugin();
  let defaultProps = {
    height: '100%',
    width: '100%',
    file: '',
    zoom: '',
    initialPage: 0,
    onPageChange: undefined,
    onZoom: undefined
  }
  defaultProps = Object.assign(defaultProps, props);
  let { height, width, file, zoom, initialPage, onPageChange, onZoom } = defaultProps;
  if (zoom == 'actual-size') {
    zoom = SpecialZoomLevel.ActualSize;
  } else if (zoom == 'page-fit') {
    zoom = SpecialZoomLevel.PageFit;
  } else if (zoom == 'page-width' || zoom == '') {
    zoom = SpecialZoomLevel.PageWidth;
  } else {
    zoom = +zoom;
  }

	return (
		<>
			<style>
				{`@media print {
            .rpv-print__body-printing #__docusaurus {
              display: none;
            }
        }
        .rpv-core__textbox {
          font: inherit;
        }
        .rpv-core__minimal-button:has(.rpv-zoom__popover-target) {
          font: inherit;
        }`}
			</style>
			<div style={{ height, width }}>
				<Worker workerUrl={workerUrl}>
					<Viewer
						fileUrl={file}
						transformGetDocumentParams={withPdfJsOptions}
            initialPage={initialPage}
            onPageChange={onPageChange}
            onZoom={onZoom}
						plugins={[defaultLayoutPluginInstance]}
						theme={colorMode == 'dark' ? 'dark' : 'light'}
						defaultScale={isSmallScreen ? SpecialZoomLevel.PageWidth : zoom}
					/>
				</Worker>
			</div>
		</>
	);
};

export default PDFViewer;
