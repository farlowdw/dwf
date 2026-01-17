---
title: Introduction
hide_title: false
sidebar_label: Introduction
description: Docs introduction
draft: false
tags: 
  - Introduction
keywords: 
  - introduction
hide_table_of_contents: true
toc_min_heading_level: 2
toc_max_heading_level: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import BibRef from '@site/src/components/BibRef';
import TOCInline from '@theme/TOCInline';
import Link from '@docusaurus/Link';
import DocsLink from '@site/src/components/DocsLink';
import ArrowRight from '@site/static/icons/arrow_right.svg';
import Pseudocode from '@site/src/components/Pseudocode';
import sampleQuicksort from '!!raw-loader!@site/src/components/_PseudocodesSamples/_test-quicksort.tex';

<!-- import snippet1 from '!!raw-loader!./snippet-1.py'; -->
<TOCInline toc={toc} minHeadingLevel={2} maxHeadingLevel={4} />

My purpose is to make myself and my experience available.

William Zinsser said the same in the introduction to his book *On Writing Well* <BibRef id='WZ2016' pages='p. xi'></BibRef>, directly followed by, "If readers connect with my book it's because they don't think they're hearing from an English professor. They're hearing from a working writer." I'm a [working](/resume) software engineer (currently). So you won't be hearing from a computer science professor, a math professor, or any other kind of professor for that matter. As I mention in this site's [about section](/about), my occupational history is quite modest: chemistry researcher, math teacher, software engineer. I came to software engineering via a less conventional route too: a *web development* bootcamp.

Everything I've encountered since, including pursuing software engineering as a career in more general terms (i.e., not limited to only web development), makes me think others might stand to benefit from hearing about my experience (past, present, and future). Why? Because we neither live nor learn in a vacuum. Maybe you already know much of what I have to share. That's okay. But maybe you don't. For example, do you know the [query execution order](/docs/software-engineering/sql/query-execution-order) for SQL queries? I sure as hell didn't when I first started out. But once I did, it felt like I unlocked a superpower. Maybe, just maybe, you can unlock some of your own superpowers by reading more about my varied experiences in software engineering and beyond.

Notable posts on this site appear below (this list is dynamic and will be updated over time). Reading one or more of these highlighted posts should help convey whether or not this site will help unlock one of your superpowers. But, of course, the best way to determine whether or not this site may be of use to you is for you to poke around and prod for yourself. Happy exploring!

<div className='gallery'>
  <div className='sub-heading'>
    <h3>Explorations</h3>
  </div>
  <div className='card'>
    <h4>Educational Philosophy</h4>
    <div className='introCardDetails' >
      Short and sweet. This will give you some insight into how I approach my own learning as well as how I approaching crafting content for others.
    </div>
    <DocsLink to='/docs/teaching-portfolio/educational-philosophy'>See Educational Philosophy <ArrowRight className='arrow' /></DocsLink>
  </div>
  <div className='card'>
    <h4>Window Functions (SQL)</h4>
    <div className='introCardDetails' >An in-depth guide to SQL window/analytic functions. This is not only a guide but also a useful reference (e.g., syntax guidance, basic examples, etc.).</div>
    <DocsLink to='/docs/software-engineering/sql/window-functions'>See Window Functions <ArrowRight className='arrow' /></DocsLink>
  </div>
</div>
<br />




<div className='gallery'>
  <div className='sub-heading'>
    <h3>Blog Posts</h3>
  </div>
  <div className='card'>
    <h4>Feynman Technique</h4>
    <div className='introCardDetails' >Tired of not being able to learn things quickly? Give the Feynman Technique a try next time.</div>
    <DocsLink to='/blog/2026/01/15/2026/feynman-technique'>See Feynman Technique <ArrowRight className='arrow' /></DocsLink>
  </div>
</div>
<br />
