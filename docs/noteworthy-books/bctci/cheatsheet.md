---
title: >-
  Personalized Cheat Sheet
hide_title: false
sidebar_label: Cheat sheet
draft: false
description: >-
  Personal cheatsheet informed by experience
tags: 
  - BCTCI
  - Cheatsheet
keywords: 
  - bctci
  - beyond cracking the coding interview
  - cheatsheet
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

<TOCInline toc={toc} minHeadingLevel={2} maxHeadingLevel={5} />

## Big-O

## Interview checklist

## Python

### Time and space complexity

#### Time

#### Space

##### Making an actual copy as opposed to a reference

What is the space complexity of the following code?

```python
def repeated_str(s):
    strs = []
    for i in range(len(s)):
        strs.append(s)
```

On the surface, it may seem like the space complexity would be $O(n^2)$, where $n$ is the length of the string `s`. But this is not correct because there is a difference between *copying* a variable and just *referencing* it. In Python, `strs.append(s)` just appends a reference of `s`, which takes just $O(1)$ space. Hence, $n$ references are made to the same object, which takes $O(n)$ space, not $O(n^2)$.

Of course, it's not the same across all programming languages. For the "primary" interviewing programming languages, we have the following:

| Language | COPY of a string `s` | Making a REFERENCE of a string `s` |
| :-- | :-- | :-- |
| Python | `s2 = s[:]` | `s2 = s` |
| C/C++ | `s2 = s;` | `s2 = &s;` |
| Go | `s2 = s` | `s2 = s[:]` |
| JavaScript | `s2 = s.splice()` | `s2 = s` |

##### Sorting in Python

Python uses [Timsort](https://en.wikipedia.org/wiki/Timsort) under the hood in its default [`sort`](https://docs.python.org/3/howto/sorting.html) method, meaning it has a worst-case space complexity of $O(n)$ even though it does the sorting in-place.

##### Bits required to represent an integer k

With 1 bit we can represent two values. With 2 bits we can represent four values. And so on. There's a *repeated doubling* pattern in terms of the number of values that can be represented. The range doubles for each additional bit, which means a number $k$ has $\log_{10}(k) = O(\log_{10} k)$ digits, which equates to $O(\lg k)$.




## System design interview template (for AI chatbot)

```a title="AI chatbot prompt for practicing a system design round"
As a senior/staff engineer, you are conducting a system design interview.

Your task is to guide the candidate through a popular system design question in a step-by-step manner.

Follow the structure below for the interview:

1. Question Selection: Choose a popular system design question to ask.
2. Requirements: Discuss both functional and non-functional requirements.
3. High-Level Design: Guide the candidate to create a high-level design.
4. Detailed Design: Go into more detailed components such as data flows, APls, storage, etc.
5. Scaling Considerations: Address scalability and performance optimization.
6. Conclusion: Summarize the design and provide feedback or suggestions for improvement.

Please start by selecting a popular system design question to ask.
```

## Templates