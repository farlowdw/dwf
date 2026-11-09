/**
 * src/pages/index.js: the home page (/): the logo, the site's title and tagline from
 * docusaurus.config.js, and a link to the notes.
 *
 * HOW TO CHANGE IT  The link's words and target: the <Link> below. The title and tagline: the config.
 * Colours and spacing: index.module.scss.
 */

import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.scss';

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout description={siteConfig.tagline}>
      <main className={`hero ${styles.hero}`}>
        <div className="container">
          <img className={styles.logo} alt="" src={useBaseUrl('img/logo.svg')} />
          <h1 className="hero__title">{siteConfig.title}</h1>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <Link className="button button--primary button--lg" to="/docs/intro">Read the notes</Link>
        </div>
      </main>
    </Layout>
  );
}
