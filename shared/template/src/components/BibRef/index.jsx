/**
 * src/components/BibRef/index.jsx: the shared citation with this site's sources handed in. A note imports
 * this file: <BibRef id="example-book" pages="p. 4" />, and <BibRef listAll /> prints the whole list.
 *
 * HOW TO CHANGE IT  The sources: bibliography.js beside this file. The citation itself: shared/components/BibRef.
 */
import React from 'react';
import SharedBibRef from '@site/shared/components/BibRef';
import bibItems from './bibliography.js';

export default function BibRef(props) {
  return <SharedBibRef bibItems={bibItems} {...props} />;
}
