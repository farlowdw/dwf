---
title: >-
  Postmortem template
hide_title: false
sidebar_label: Postmortem
draft: false
description: >-
  Postmortem template
tags: 
  - BCTCI
  - Postmortem
keywords: 
  - bctci
  - beyond cracking the coding interview
  - postmortem
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

It's recommended in <BibRef id='bctci' pages=''></BibRef> to complete a postmortem after each practice question in order to pinpoint what went well and what could use improvement. Common mistakes will surface over time, and those mistakes can be added to a *bug list* for heightened awareness.

## Template

The following template should be completed after each practice problem for your own development purposes:

- **Date:** 
- **Problem:** 
- **Time to design the algorithm:** 
- **Time to code:** 
- **Solutions considered/missed:** 
- **Solution optimality:** 
- **Triggers found/missed:** 
- **Mistakes made:** 
- **What could be done differently:** 
- **Takeaways:** 
- **Anything to add to bug list (commonly made mistakes)?:** 
- **Anything to add to cheat sheet (tips, templates, etc.)?:** 
- **Rubric self-rating**
  + *Problem-solving:* `0`/`5`. 
    * How much difficulty did they have finding an algorithm and optimizing it, relative to the difficulty of the problem?
    * How much help did they need, relative to other candidates?
    * Did they discuss tradeoffs in terms of the time and space complexity?
    * Did they use appropriate data structures and algorithms to solve the problem?
  + *Coding:* `0`/`5`. 
    * Could they translate their ideas into correct code?
    * Did they overcomplicate the logic?
    * Did they demonstrate good coding hygiene (clear variable names, abstracting relevant code into reusable helper functions instead of copy/pasting, consistent and reasonable style, etc.)?
    * Is the code well organized and idiomatic to the language used?
    * Did they demonstrate internalized software engineering principles?
  + *Verification:* `0`/`5`. 
    * Did they ask good clarifying questions (that weren't already answered in the question description or examples)?
    * Did they proactively consider edge cases?
    * Did they test their code or provide a good argument for its correctness?
    * Were they able to spot and fix any bugs?
  + *Communication:* `0`/`5`. 
    *  Were they able to clearly communicate their thoughts, even when the conversation got technical?
    *  Were they able to answer technical questions?
    *  Were they open to feedback?
    *  If they were confused, were they able to articulate why?

## Template example

Here's an example of the template above in use for the problem <LC id='200' type='long' ></LC>:

- **Date:** Jan 22, 2025
- **Problem:** <LC id='200' type='long' ></LC> 
- **Time to design the algorithm:** 7 minutes
- **Time to code:** 19 minutes
- **Solutions considered/missed:** I identified DFS and BFS, but missed the union-find solution.
- **Solution optimality:** `T: O(R * C)`; `S: O(R * C)`; it was optimal
- **Triggers found/missed:** Grid cells connected four-directionally is a trigger for grid graphs (similar to the 'rotting oranges' problem). Missed: "merging" adjacent 1's together (into the same island) is a trigger for union-find.
- **Mistakes made:** Yes! I forgot to check if a cell had been visited before recursing in the DFS, resulting in an infinite loop
- **What could be done differently:** I could have used BFS to avoid the possibility of stack overflow.
- **Takeaways:** I need to review the DFS recipe, so I don't waste time on this part of the interview next time. Missing the union-find solution was silly since this problem is clearly about connected components. Union-find is slightly slower than DFS for this problem, but I will focus on exploring union-find when I see that trigger in the future.
- **Anything to add to bug list (commonly made mistakes)?:** Yes. Always check if a cell is visited before performing DFS.
- **Anything to add to cheat sheet (tips, templates, etc.)?:** Yes. The "connected component loop" recipe is helpful.
- **Rubric self-rating**
  + *Problem-solving:* `4`/`5`. Missed a possible solution.
  + *Coding:* `4`/`5`. 
  + *Verification:* `5`/`5`. Found the DFS bug before running the code.
  + *Communication:* `0`/`5`. Totally forgot to talk out loud.

