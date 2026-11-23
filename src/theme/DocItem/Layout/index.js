/**
 * src/theme/DocItem/Layout/index.js: the frame of every docs page (the article, the Previous / Next
 * buttons, the table of contents). A copy (swizzle, eject) of @docusaurus/theme-classic 3.10.2's
 * DocItem/Layout, with two additions:
 *   - Giscus, the comment box, under the Previous / Next buttons below a horizontal bar, except on
 *     the pages in docusaurus.config.js > customFields.forbiddenGiscusDocPaths;
 *   - the page-feedback prompt (src/components/PageFeedback), between the page's content and its
 *     footer (the Tags and "Edit this page" rows). The prompt decides itself whether it shows:
 *     customFields.feedbackEnabled and forbiddenFeedbackDocPaths, and the page's own unlisted flag.
 * Apart from those, the copy differs from the original only in spacing and the original's licence
 * header. styles.module.css beside it is the original's, without that header.
 *
 * HOW TO CHANGE IT
 *   After a Docusaurus upgrade, compare this copy with the installed original (-w hides the spacing):
 *     diff -w node_modules/@docusaurus/theme-classic/lib/theme/DocItem/Layout/index.js src/theme/DocItem/Layout/index.js
 *   and carry over what changed there, keeping the two additions. scripts/site-files.test.mjs goes red
 *   when the original no longer renders DocItemContent and then DocItemFooter, the place the prompt
 *   sits, and when the prompt is no longer mounted here. The prompt itself: src/components/PageFeedback.
 */
import React from 'react';
import clsx from 'clsx';
import { useWindowSize } from '@docusaurus/theme-common';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import DocItemPaginator from '@theme/DocItem/Paginator';
import DocVersionBanner from '@theme/DocVersionBanner';
import DocVersionBadge from '@theme/DocVersionBadge';
import DocItemFooter from '@theme/DocItem/Footer';
import DocItemTOCMobile from '@theme/DocItem/TOC/Mobile';
import DocItemTOCDesktop from '@theme/DocItem/TOC/Desktop';
import DocItemContent from '@theme/DocItem/Content';
import DocBreadcrumbs from '@theme/DocBreadcrumbs';
import ContentVisibility from '@theme/ContentVisibility';
import styles from './styles.module.css';
import Giscus from '@giscus/react';
import { useColorMode } from '@docusaurus/theme-common';
import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import PageFeedback from '@site/src/components/PageFeedback';
/**
 * Decide if the toc should be rendered, on mobile or desktop viewports
 */
function useDocTOC() {
  const { frontMatter, toc } = useDoc();
  const windowSize = useWindowSize();
  const hidden = frontMatter.hide_table_of_contents;
  const canRender = !hidden && toc.length > 0;
  const mobile = canRender ? <DocItemTOCMobile /> : undefined;
  const desktop =
    canRender && (windowSize === 'desktop' || windowSize === 'ssr') ? (
      <DocItemTOCDesktop />
    ) : undefined;
  return {
    hidden,
    mobile,
    desktop,
  };
}
export default function DocItemLayout({ children }) {
  const docTOC = useDocTOC();
  const { metadata } = useDoc();
  const { colorMode } = useColorMode();
  const location = useLocation();
  const { siteConfig } = useDocusaurusContext();
  const { forbiddenGiscusDocPaths } = siteConfig.customFields;
  const giscus = (
    <React.Fragment>
      <hr />
      <br></br>
      <Giscus
        id="comments"
        repo="farlowdw/dwf"
        repoId="R_kgDOQ7b7Eg"
        category="Announcements"
        categoryId="DIC_kwDOQ7b7Es4C1Duy"
        mapping="pathname"
        reactionsEnabled="1"
        emitMetadata="0"
        inputPosition="top"
        theme={colorMode}
        lang="en"
        loading="lazy"
      />
    </React.Fragment>
  )
  return (
    <div className="row">
      <div className={clsx('col', !docTOC.hidden && styles.docItemCol)}>
        <ContentVisibility metadata={metadata} />
        <DocVersionBanner />
        <div className={styles.docItemContainer}>
          <article>
            <DocBreadcrumbs />
            <DocVersionBadge />
            {docTOC.mobile}
            <DocItemContent>{children}</DocItemContent>
            <PageFeedback key={metadata.permalink} permalink={metadata.permalink} unlisted={metadata.unlisted} />
            <DocItemFooter />
          </article>
          <DocItemPaginator />
          {!forbiddenGiscusDocPaths.includes(location.pathname) && giscus}
        </div>
      </div>
      {docTOC.desktop && <div className="col col--3">{docTOC.desktop}</div>}
    </div>
  );
}
