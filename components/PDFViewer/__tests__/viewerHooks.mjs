/**
 * viewerHooks.mjs: Node module hooks for render.test.mjs. They put small stand-ins in place of the packages
 * the PDF viewer (../index.jsx) imports, so the test can read what the viewer hands them:
 *   - @react-pdf-viewer/core: Worker and Viewer record their props in globalThis[VIEWER_KEY], and
 *     SpecialZoomLevel holds the real package's three values (the test checks them against the package);
 *   - @react-pdf-viewer/default-layout: defaultLayoutPlugin() returns a marker;
 *   - @mui/material/useMediaQuery: records the query and answers globalThis[VIEWER_KEY].small;
 *   - @docusaurus/useGlobalData: usePluginData(name) answers globalThis[VIEWER_KEY].pluginData[name];
 *   - a stylesheet import is an empty module.
 * Only imports made by the viewer itself are replaced, so the test can still require the real packages.
 * The JSX and useColorMode come from the shared render hooks (__tests__/renderHooks.mjs), registered first:
 *
 *     register('../../../__tests__/renderHooks.mjs', import.meta.url);
 *     register('./viewerHooks.mjs', import.meta.url);   // then a DYNAMIC import of the viewer
 *
 * HOW TO CHANGE IT
 *   Another package the viewer comes to import: a stand-in in STAND_INS. What a stand-in records: its source there.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Where the stand-ins record what they were given, and where the test sets what they answer. */
export const VIEWER_KEY = 'sharedPdfViewerRender';

/** The viewer's own file: only its imports are replaced. */
const VIEWER_URL = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.jsx')).href;

const KEY = `globalThis.${VIEWER_KEY}`;

/** Each package the viewer imports, as the source of a small module in its place. */
const STAND_INS = Object.freeze({
  '@react-pdf-viewer/core': [
    "export const SpecialZoomLevel = Object.freeze({ ActualSize: 'ActualSize', PageFit: 'PageFit', PageWidth: 'PageWidth' });",
    `export function Worker(props) { ${KEY}.worker = props; return props.children; }`,
    `export function Viewer(props) { ${KEY}.viewer = props; return null; }`,
  ].join('\n'),
  '@react-pdf-viewer/default-layout': "export function defaultLayoutPlugin() { return { name: 'default-layout' }; }",
  '@mui/material/useMediaQuery': `export default function useMediaQuery(query) { ${KEY}.query = query; return ${KEY}.small === true; }`,
  '@docusaurus/useGlobalData': [
    `export function usePluginData(name) { return ${KEY}.pluginData[name]; }`,
    'export default function useGlobalData() { return {}; }',
  ].join('\n'),
});

const STYLESHEET = /\.css$/;
const EMPTY_MODULE = 'export {};';

const asModule = (source) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL !== VIEWER_URL) return nextResolve(specifier, context);
  if (STAND_INS[specifier] !== undefined) return asModule(STAND_INS[specifier]);
  if (STYLESHEET.test(specifier)) return asModule(EMPTY_MODULE);
  return nextResolve(specifier, context);
}
