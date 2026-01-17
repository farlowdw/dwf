---
title: >-
  Trigger Thinking
hide_title: false
sidebar_label: Trigger thinking
draft: false
description: >-
  Trigger Thinking
tags: 
  - BCTCI
  - Trigger Thinking
keywords: 
  - bctci
  - beyond cracking the coding interview
  - triggers
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

<!-- <TOCInline toc={toc} minHeadingLevel={2} maxHeadingLevel={4} /> -->

Triggers should not be memorized. The point is that triggers for a given technique should become intuitive once you understand that technique.

## Trigger list (personal)

| Trigger | Keywords | Description |
| :-- | :-- | :-- |
|  |  |  |


## Trigger list (BCTCI)

The following trigger list is from <BibRef id='bctci' pages=''></BibRef>:

| Trigger | Keywords | Description |
| :-- | :-- | :-- |
| Two pointers | palindrome, reverse, swap, merge, partition | The input consists of one or two arrays/strings/linked lists. We need to use $O(1)$ extra memory or modify the input in place. The input is sorted. The naive solution is $O(n^2)$, and we want to get to $O(n)$. |
| Binary search | sorted, threshold, range, boundary, find, search, minimum/maximum, first/last, smallest/largest | The input is a sorted array/string. The brute force involves repeated linear scans. We are given an optimization problem that's hard to optimize directly. |
| Sets and maps | frequency, unique, duplicate, grouping, union, intersection, anagram, caching | There is some "key-like" concept in the problem. We are doing multiple linear scans in arrays. The input and/or output order is irrelevant in our algorithm. Linear-time target complexity. The problem is a sliding window problem. |
| Stacks and queues | Right-to-left combinations/transformations; undo/redo actions; balanced parentheses. Brackets like `[]`, `()`, `{}`, and `<>`, quotation marks, code comment markers like `/* /`, and even the double asterisks (`**`) used to bold text in Markdown. Next Greatest Element. | nested, bracket, parentheses |
| Recursion | The input data is a recursive data structure or has a recursive or "nesting" nature (e.g., a binary tree or an array where each element can itself be an array). The problem statement includes a self-referential definition (e.g., Fibonacci). You find yourself wanting to write a number of nested loops that depend on the input. The problem is related to merge sort or quicksort. | nested, quicksort, merge sort |
| Linked lists | The input is a linked list. We need $O(1)$ access to both the beginning and the end of a data structure while maintaining insertion order. Data structure design questions. |  |
| Graphs | The input is an edge list or a grid. The topic is related to connectivity, reachability, or distance. Problems involving pairwise relationships between input elements. Geometric problems. | path, source, destination, goal, steps, travel, maze, points |
| Heaps | The data is dynamic, like in "data structure design" questions where the answer changes over time; top-$k$ type problems; the naive solution uses sorting; the goal is to optimize the extra space. | top/bottom, minimum/maximum, largest/smallest, median |
| Sliding windows | The input type is just an array of numbers or a string, and maybe a number. The lower bound is linear. | subarray, substring, length, contiguous, consecutive, range, longest, or shortest |
| Backtracking | Problems with maximum input sizes in the lower 2-digits; enumeration problems or problems with exponential-sized outputs in general; NP-complete problems, especially optimization ones; games and puzzles (like N-queens, sudoku, knight's tour problem); subset-based or permutation-based problems; problems where you'd think of using DP but there are no overlapping subproblems. |  |
| Dynamic programming | It's an optimization or counting problem, and the naive solution is backtracking. You have to make a sequence of choices. Path-finding problems where you can't go back. |  |
| Greedy | optimization problems; interval problems; problems where you'd use backtracking but you need better-than-exponential runtime. |  |
| Topological sort | The input is a DAG, or at least a directed graph; there is some notion of dependencies or prerequisites (even if the input is not a graph); the question is about distances or paths; the runtime upperbound is linear. |  |
| Prefix sums | The input consists of an array/strings. We need to use $O(1)$ extra memory or modify the input in place. Problems with multiple subarrays, especially when sliding windows don't seem to work. The input is sorted. The naive solution is $O(n^2)$, and we want to get to $O(n)$. Problems with ranges or intervals. | prefix, suffix, partition, subarray |