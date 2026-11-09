/**
 * shared/theme/Admonition/Types.js — Docusaurus's admonitions plus the seven custom ones.
 * A site reaches this file through its one-line src/theme/Admonition/Types.js.
 *
 * LEGACY KINDS  caution, secondary, important and success are in Docusaurus 3's stock list and
 * gone from a later major's, so legacyTypes names them here and the list is the same on either.
 * Each draws a stock kind under its own label. Of the four only caution is a keyword
 * (ADMONITION_KEYWORDS in shared/wiring/index.cjs).
 *
 * HOW TO CHANGE IT  A new type <kind>: a Type/<Kind>.js here (copy Key.js), its line below, its
 * keyword in shared/wiring/index.cjs, its .alert--<kind> colours in shared/css/custom.scss.
 */
import React from 'react';
import DefaultAdmonitionTypes from '@theme-original/Admonition/Types';
import AdmonitionTypeNote from '@theme/Admonition/Type/Note';
import AdmonitionTypeTip from '@theme/Admonition/Type/Tip';
import AdmonitionTypeInfo from '@theme/Admonition/Type/Info';
import AdmonitionTypeWarning from '@theme/Admonition/Type/Warning';
import AdmonitionTypeDWF from './Type/DWF';
import AdmonitionTypeTool from './Type/Tool';
import AdmonitionTypeKey from './Type/Key';
import AdmonitionTypePerf from './Type/Perf';
import AdmonitionTypeStudy from './Type/Study';
import AdmonitionTypeIIO from './Type/IIO';
import AdmonitionTypeExtension from './Type/Extension';

const legacyTypes = {
  caution: (props) => <AdmonitionTypeWarning title="caution" {...props} />,
  secondary: (props) => <AdmonitionTypeNote title="secondary" {...props} />,
  important: (props) => <AdmonitionTypeInfo title="important" {...props} />,
  success: (props) => <AdmonitionTypeTip title="success" {...props} />,
};

export default {
  ...DefaultAdmonitionTypes,
  ...legacyTypes,
  dwf: AdmonitionTypeDWF,
  tool: AdmonitionTypeTool,
  key: AdmonitionTypeKey,
  perf: AdmonitionTypePerf,
  study: AdmonitionTypeStudy,
  iio: AdmonitionTypeIIO,
  extension: AdmonitionTypeExtension,
};
