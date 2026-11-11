/**
 * shared/theme/DocRoot/Layout/Sidebar — wraps the theme's docs sidebar column so that collapsing or
 * expanding the sidebar keeps the reader's place. A site reaches this file through its one-line
 * src/theme/DocRoot/Layout/Sidebar/index.jsx. A site without that stub keeps the theme's plain
 * column with no error, so a site that uses it holds the stub in a test of its own
 * (shared/README.md > Silent failures).
 *
 * WHAT IT DOES  It renders the theme's own column unchanged, except for the setter it is given:
 *   setHiddenSidebarContainer first holds the reader's place (readingPlace.js > holdReadingPlace),
 *   then changes the state as before. Docusaurus calls that setter for EVERY collapse ("⇤" at the
 *   sidebar's foot) and every expand (the strip left behind, by click or key), from the event
 *   itself, before React redraws: the page is still exactly as the reader sees it. No class names,
 *   no listeners on buttons. The stylesheet beside it (styles.module.css) lets the browser's own
 *   scroll anchoring work on docs pages; readingPlace.js explains why both are needed.
 *
 * AFTER A DOCUSAURUS UPGRADE  Docusaurus does not list DocRoot/Layout/Sidebar among the components
 *   safe to swizzle, and useScrollController comes from '@docusaurus/theme-common/internal' (no
 *   public export). Both are the same since 3.0. `npm run test:shared` checks them in the site's
 *   node_modules in every site that has the stub (__tests__/docusaurusContract.test.js): if it
 *   fails after an upgrade, the theme changed how the sidebar toggles and this wrapper must
 *   follow it — or the fix would silently stop working.
 *
 * HOW TO CHANGE IT  The hold itself (how long, what ends it, which block is the anchor):
 *   readingPlace.js. A change here reaches every site that has the stub: roll it out as any
 *   change to shared/. To take one site back to the theme's plain column: delete its stub.
 */

import React, { useCallback } from 'react';
import Sidebar from '@theme-original/DocRoot/Layout/Sidebar';
import { useScrollController } from '@docusaurus/theme-common/internal';
import { holdReadingPlace } from './readingPlace';
import './styles.module.css';

export default function SidebarWrapper(props) {
	const { setHiddenSidebarContainer } = props;
	const scrollController = useScrollController();
	const setHiddenKeepingPlace = useCallback(
		(value) => {
			try {
				holdReadingPlace(scrollController);
			} catch (error) {
				// Keeping the place is a nicety: whatever went wrong, the sidebar still collapses / expands.
				console.error('Docs sidebar: could not keep the reading place.', error);
			}
			setHiddenSidebarContainer(value);
		},
		[scrollController, setHiddenSidebarContainer],
	);
	return <Sidebar {...props} setHiddenSidebarContainer={setHiddenKeepingPlace} />;
}
