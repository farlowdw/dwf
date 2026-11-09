/**
 * src/components/BibRef/index.jsx: a stub that hands this site's bibliography to the shared citation
 * component, shared/components/BibRef, so a note keeps importing @site/src/components/BibRef.
 *
 * HOW TO CHANGE IT  A reference: bibliography.js next to this file. The citation itself: the shared
 * component, then roll it out (shared/README.md). Without the bibItems prop every citation reads
 * ITEM NOT FOUND while the build still passes.
 */
import React from 'react';
import SharedBibRef from '@site/shared/components/BibRef';
import bibItems from './bibliography.js';

export default function BibRef(props) {
  return <SharedBibRef bibItems={bibItems} {...props} />;
}
