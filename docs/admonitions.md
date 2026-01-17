---
title: >-
  Admonition Types
hide_title: true
sidebar_label: Admonition types
draft: false
description: >-
  Overview of the different types of admonitions used on the site
tags:
  - Overview
  - Admonitions
keywords: 
  - admonitions
authors: 
  - farlow
hide_table_of_contents: false
toc_min_heading_level: 2
toc_max_heading_level: 5
---

import Asterisk from '@site/src/components/Asterisk';

## Specific admonitions

Content on this site may be highlighted in various context-dependent ways. Specifically, an [admonition](https://docusaurus.io/docs/markdown-features/admonitions) may be used to alert the reader to content of a distinctive type:

:::dwf DWF

This is a **DWF** alert. It's my own way of making a statement within my own content. These alerts are essentially me talking to myself as if the reader is also present.

:::

:::key Key Idea

This is a **key idea** alert. I'm generally a fan of [TLDR](https://en.wikipedia.org/wiki/TL;DR)<Asterisk cursor='help' symbol='[*]' >Too Long; Didn't Read</Asterisk> , but sometimes the goal isn't just to summarize something but to really highlight the key idea (e.g., algorithm idea, data structure purpose, etc.).

:::

:::perf Performance

This is a **performance** alert. Such alerts will generally be used in the context of data structures and algorithms content and may point to how to execute some task in a performant manner (or avoid executing a task in a non-performant manner).

:::

:::extension Extension

This is an **extension** alert. Such alerts are likely to occur in problem-solving contexts in the guise of a "follow-up" or something similar.

:::

:::study Study

This is a **study** alert. Sometimes the best way to learn something is to study original sources, white papers, etc. Links highlighted in these alerts will usually be something more than just a link to refer to but something to actually spend some time with.

:::

:::tool Toolbox Disclaimer

This is a **toolbox disclaimer alert**. This generally means whatever you're looking at is actively under construction and is likely to be changed imminently or in the near future (e.g., unpolished core content, incomplete blog posts, etc.).

:::

## General admonitions

The admonitions above are unique to this site. More general admonitions are defined in a similar vein to [infima alerts](https://infima.dev/docs/components/alert):

:::danger Danger

This is a **danger** alert. Something has either gone wrong or has a high likelihood of going wrong if this alert is not heeded.

:::

:::caution Caution

This is a **caution** or **warning** alert. Ignore at your own risk!

:::

:::info Info

This is an **info** alert. Helpful information is being provided that is not critical to the topic at hand but should probably be read regardless.

:::

:::tip Tip

This is a **success** or **tip** alert. Something good or helpful is being discussed!

:::

:::note Note

This is a secondary **note** alert. Ancillary information is being provided.

:::

