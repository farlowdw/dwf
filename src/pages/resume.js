import React from 'react';
import Layout from '@theme/Layout';
import Head from '@docusaurus/Head';
import ResumeViewer from '@site/src/components/ResumeViewer';

const ResumePage = () => (
  <Layout>
    <Head>
      <title>Resume - Daniel W. Farlow</title>
      <meta name="description" content="Current resume for Daniel W. Farlow, a software engineer based in Nashville, TN" />
      <meta property="og:title" content="Resume - Daniel W. Farlow" />
      <meta property="og:description" content="Current resume for Daniel W. Farlow, a software engineer based in Nashville, TN" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://danielwfarlow.com/resume/" />
      <meta property="og:image" content="https://danielwfarlow.com/img/logo.svg" />
    </Head>
    <ResumeViewer />
  </Layout>
);

export default ResumePage;
