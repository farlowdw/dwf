---
title: >-
  Interview Checklist
hide_title: false
sidebar_label: Interview checklist
draft: false
description: >-
  Interview checklist
tags: 
  - BCTCI
  - Interview Checklist
keywords: 
  - bctci
  - beyond cracking the coding interview
  - interview checklist
authors: 
  - farlow
hide_table_of_contents: false
toc_min_heading_level: 2
toc_max_heading_level: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import LC from '@site/src/components/LC';
import BibRef from '@site/src/components/BibRef';
import TOCInline from '@theme/TOCInline';

import CodeGrid from '@site/src/components/CodeGrid';
import CodeGridCell from '@site/src/components/CodeGridCell';
import CodeEditor from '@site/src/components/CodeEditor';

<!-- import snippet1 from '!!raw-loader!./snippet-1.py'; -->

<TOCInline toc={toc} minHeadingLevel={2} maxHeadingLevel={4} />

The following interview checklist is meant to mirror the one found in <BibRef id='bctci' pages='p. 191'></BibRef> but recast in a more memorable way (i.e., using my own name, **DANIEL**). But all that really matters is that each step is remembered.

| Step | Meaning | Description |
| :-: | :-- | :-- |
| **D** | **Discern** | *Discern what the actual problem is along with its constraints* |
|  |  | Read the statement (twice) |
|  |  | Work through examples out loud |
|  |  | Ask clarifying questions (e.g., edge cases, input/output format, scale constraints, etc.) |
| **A** | **Architect** | *Architect an algorithm(s) to solve the problem you've spent time discerning* |
|  |  | Minimally sketch naive solution |
|  |  | Identify upper and lower bounds |
|  |  | Look for triggers |
|  |  | Employ boosters |
| **N** | **Narrate** | *Narrate the solution you've architected by various illustrative means* |
|  |  | Examples |
|  |  | Indented English |
|  |  | Name and justify |
| **I** | **Inquire** | *Inquire whether or not you should code your narrated algorithm `X`, with time `Y` and space `Z`, or keep thinking*  |
|  |  | I would like to use `<X algorithm>` with `<Y time>` and `<Z space>` to solve the problem. Should I code this now, or should I keep thinking? |
| **E** | **Execute** | *Execute on all of the dialogue so far by actually working out a solution in code* |
|  |  | Main logic |
|  |  | Helper functions |
|  |  | Stop if you get lost |
| **L** | **Lint** | *Lint your solution to verify its accuracy and efficiency* |
|  |  | Top-to-bottom pass |
|  |  | Tricky expressions |
|  |  | Run through with tiny input |
|  |  | Check edge cases |
|  |  | Verify analysis |