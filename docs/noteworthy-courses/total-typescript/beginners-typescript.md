---
title: >-
  Beginner's TypeScript - Solutions and Notes
hide_title: false
sidebar_label: Beginner's TypeScript
draft: false
description: >-
  Solutions and notes to the free tutorial "Beginner's TypeScript" by Matt Pocock
tags: 
  - Course Notes
  - Total TypeScript
keywords:
  - total typescript
  - matt pocock
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
import PDFViewer from '@site/src/components/PDFViewer';

## 1 - The implicit "any" type error

<Tabs>
<TabItem value='p' label='Problem'>

```typescript
import { expect, it } from "vitest";

//highlight-error-next-line
export const addTwoNumbers = (a, b) => {
  return a + b;
};

it("Should add the two numbers together", () => {
  expect(addTwoNumbers(2, 4)).toEqual(6);
  expect(addTwoNumbers(10, 10)).toEqual(20);
});
```

</TabItem>
<TabItem value='s1' label='Solution'>

```ts
import { expect, it } from "vitest";

//highlight-success-next-line
export const addTwoNumbers = (a: number, b: number) => {
  return a + b;
};

it("Should add the two numbers together", () => {
  expect(addTwoNumbers(2, 4)).toEqual(6);
  expect(addTwoNumbers(10, 10)).toEqual(20);
});
```

</TabItem>
<TabItem value='d' label='Discussion'>

As [explained here](https://www.totaltypescript.com/concepts/parameter-x-implicitly-has-an-any-type), the `Parameter X implicitly has an 'any' type` error arises when you fail to add a type annotation to a parameter in a function. This is because strict mode, which TypeScript generally

</TabItem>
</Tabs>