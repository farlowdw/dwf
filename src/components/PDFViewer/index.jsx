import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { useMediaQuery } from '@mui/material';

import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const PDFViewer = (props) => {
  const isSmallScreen = useMediaQuery('(max-width:1050px)');
	const { colorMode } = useColorMode();
	const defaultLayoutPluginInstance = defaultLayoutPlugin();
  let defaultProps = {
    height: '100%',
    width: '100%',
    file: '',
    zoom: ''
  }
  defaultProps = Object.assign(defaultProps, props);
  let { height, width, file, zoom } = defaultProps;
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
        }`}
			</style>
			<div style={{ height, width }}>
				<Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.js">
					<Viewer
						fileUrl={file}
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
