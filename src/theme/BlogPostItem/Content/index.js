/**
 * src/theme/BlogPostItem/Content/index.js: the text of a blog post, in the div whose built HTML the
 * blog plugin copies into the RSS and Atom feeds (its id, blogPostContainerID, on a post's own page;
 * node_modules/@docusaurus/plugin-content-blog/lib/feed.js reads it). A copy (swizzle, eject) of
 * @docusaurus/theme-classic 3.10.2's BlogPostItem/Content, with two additions, both on a post's own
 * page only (isBlogPostPage: the blog's lists render this file too):
 *   - Giscus, the comment box, under the post's text below a horizontal bar, except on the pages in
 *     docusaurus.config.js > customFields.forbiddenGiscusBlogPaths;
 *   - the page-feedback prompt (src/components/PageFeedback), between the text and Giscus. It is
 *     `clientOnly`: rendered in the browser only, after hydration, so it is not in the built HTML
 *     and so not in the feeds. It decides itself whether it shows: customFields.feedbackEnabled and
 *     forbiddenFeedbackBlogPaths, and the post's own unlisted flag.
 * Apart from those, the copy differs from the original only in spacing and the original's licence
 * header.
 *
 * HOW TO CHANGE IT
 *   After a Docusaurus upgrade, compare this copy with the installed original (-w hides the spacing):
 *     diff -w node_modules/@docusaurus/theme-classic/lib/theme/BlogPostItem/Content/index.js src/theme/BlogPostItem/Content/index.js
 *   and carry over what changed there, keeping the two additions. scripts/site-files.test.mjs goes red
 *   when the original no longer gives its div the feeds' id on a post's page, and when the prompt is
 *   no longer mounted here as it is. Keep `clientOnly` on the prompt, or its words and buttons enter
 *   the feeds. The prompt itself: src/components/PageFeedback.
 */
import React from 'react';
import clsx from 'clsx';
import { blogPostContainerID } from '@docusaurus/utils-common';
import { useBlogPost } from '@docusaurus/plugin-content-blog/client';
import MDXContent from '@theme/MDXContent';
import Giscus from '@giscus/react';
import { useColorMode } from '@docusaurus/theme-common';
import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import PageFeedback from '@site/src/components/PageFeedback';
export default function BlogPostItemContent({ children, className }) {
  const { isBlogPostPage, metadata } = useBlogPost();
  const { colorMode } = useColorMode();
  const { siteConfig } = useDocusaurusContext();
  const { forbiddenGiscusBlogPaths } = siteConfig.customFields;
  const location = useLocation();
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
    <div
      // This ID is used for the feed generation to locate the main content
      id={isBlogPostPage ? blogPostContainerID : undefined}
      className={clsx('markdown', className)}>
      <MDXContent>
        {children}
        {isBlogPostPage && <PageFeedback key={metadata.permalink} permalink={metadata.permalink} unlisted={metadata.unlisted} clientOnly />}
        {isBlogPostPage && !forbiddenGiscusBlogPaths.includes(location.pathname) && giscus}
      </MDXContent>
    </div>
  );
}
