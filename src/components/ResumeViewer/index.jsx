/**
 * src/components/ResumeViewer/index.jsx: the resume on /resume (src/pages/resume.js), in the shared PDF
 * viewer at 175% on a wide window. Below 1050 px the viewer fits the page to the width, as it does everywhere.
 *
 * HOW TO CHANGE IT  The zoom: RESUME_ZOOM. The file: the require below, which webpack turns into the address
 * of a copy with a content hash. The viewer itself: shared/components/PDFViewer, through its stub.
 */
import React from 'react';
import PDFViewer from '@site/src/components/PDFViewer';

/** The resume's scale on a wide window: 1.75 is 175%. */
const RESUME_ZOOM = 1.75;

const ResumeViewer = () => (
	<PDFViewer file={require('@site/static/docs/Daniel_Farlow_resume.pdf').default} zoom={RESUME_ZOOM} />
);

export default ResumeViewer;
