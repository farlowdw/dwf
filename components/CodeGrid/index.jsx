/**
 * shared/components/CodeGrid/index.jsx — code blocks side by side: as many columns as fit at 275 px or more each,
 * so one column on a phone, and rows of equal height. A note writes each block in a <CodeGridCell> inside it:
 * <CodeGrid><CodeGridCell>a block</CodeGridCell><CodeGridCell>another</CodeGridCell></CodeGrid>. The `styles`
 * prop adds to the grid's own styles, and wins where it names the same one. A site reaches it through its one-line
 * stub, src/components/CodeGrid/index.jsx, which is what a note imports.
 *
 * HOW TO CHANGE IT  The layout every grid gets: baseStyles below. One grid's own change: its `styles` prop. A
 * cell's look: ../CodeGridCell. A change here shows on every page that holds a grid, so read those pages in both
 * themes, at a phone's width and a desktop's.
 */
import React from 'react';

export default function CodeGrid({ children, styles={} }) {
  let baseStyles = {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(275px, 1fr))',
    gridAutoRows: '1fr',
    gridRowGap: '1em',
    gridColumnGap: '5px',
    alignContent: 'start',
    marginBottom: '1em'
  };
  return (
    <div style={Object.assign({}, baseStyles, styles)}>
      {children}
    </div>
  );
}
