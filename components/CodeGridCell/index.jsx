/**
 * shared/components/CodeGridCell/index.jsx — one cell of a <CodeGrid> (../CodeGrid): a box with the code blocks'
 * own background of the colour mode, which scrolls sideways when its code is wider than the cell. The `styles`
 * prop adds to the cell's own styles, and wins where it names the same one. A site reaches it through its one-line
 * stub, src/components/CodeGridCell/index.jsx, which is what a note imports.
 *
 * HOW TO CHANGE IT  The two backgrounds: LIGHT_BACKGROUND and DARK_BACKGROUND. Each reads a gray token of
 * css/custom.scss, with that token's value as its fallback for a page that does not load the shared stylesheet, so
 * a new value goes in both places at once; the render test compares them.
 */
import React from 'react';
import { useColorMode } from '@docusaurus/theme-common';

/** The cell's background in light mode: the token code blocks use there, then its value. */
const LIGHT_BACKGROUND = 'var(--color-gray-4, #f3f5f7)';

/** The cell's background in dark mode: the token code blocks use there, then its value. */
const DARK_BACKGROUND = 'var(--color-gray-86, #1c262f)';

export default function CodeGridCell({ children, styles={} }) {
  const { colorMode } = useColorMode();
  const codeBackgroundColor = colorMode == 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND;

  let baseStyles = {
    backgroundColor: codeBackgroundColor,
    overflow: 'auto',
    maxWidth: '100%',
  };

  return (
    <div style={Object.assign({}, baseStyles, styles)}>
      {children}
    </div>
  );
}
