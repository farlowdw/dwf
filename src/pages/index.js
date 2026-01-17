import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import clsx from 'clsx';
import styles from './index.module.scss';
import Button from '@mui/material/Button';

const features = [
  {
    title: `Education and Learning`,
    content:
      `I love learning. I also love the art of trying to share what I've learned with others. My equal love for learning and education makes me who I am, namely someone intensely interested in solving problems but equally interested in helping others solve their problems.`,
  },
  {
    title: `Math and Philosophy`,
    content:
      `My love for learning is rooted in philosophy. What's more important than critically analyzing who we are and why we do what we do? Growing up, my biggest influences were C. S. Lewis and Nigel Warburton, specifically their books "A Grief Observed" and "Philosophy: The Basics", respectively. Perhaps my personal quest for truth led me to mathematics (my undergraduate degree is in mathematics). I love math. But my love for math is largely rooted in its often-overlooked historical, social, and philosophical foundations.`,
  },
  {
    title: `Software and Engineering`,
    content:
      `This is what I get paid to do (currently). Software engineering. It's wild. What other field has such a beautiful intersection of creativity and logic? Not to mention the accessible means by which most people can learn and tinker (i.e., a computer). It's a fascinating discipline. But it can, at times, be infuriating too. I didn't come to software engineering the conventional way (i.e., computer science). I'm grateful for this because I feel like it's helped me have a more profound appreciation and respect for what the early pioneers of computer science endured.`,
  },
];

function Home() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;

  return (
    <Layout
      permalink={'/'}
      description={`Loading page for Daniel W. Farlow's personal site.`}
    >
      <div className={clsx('hero', styles.heroBanner)}>
        <div className="container">
          <img
            className={clsx(styles.heroBannerLogo, 'margin-vert--sm')}
            alt="Logo depicted by a chemistry set conveying a spirit of experimentation"
            src={useBaseUrl('img/logo.svg')}
          />
          <h1 className="hero__title">{siteConfig.title}</h1>
          <p className="hero__subtitle">{siteConfig.tagline}</p>
          <div className={styles.getStarted} >
            <Button variant="contained" color="inherit">
              <Link className={styles.checkItOut} to={useBaseUrl('docs/intro')}>
                <span style={{ fontFamily: 'IBM Plex Sans' }}>Explore with me</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
      {features && features.length && (
        <div className={styles.features}>
          <div className="container">
            <div className="row">
              {features.map(({ title, content }, idx) => (
                <div key={idx} className={clsx('col col--4', styles.feature)}>
                  <h2>{title}</h2>
                  <p>{content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default Home;