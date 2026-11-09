/**
 * shared/wiring/katex-macros.cjs — the maths macros every site's notes may use, grouped by purpose
 * in katexMacros and exported flat, as one plain object. shared/wiring/index.cjs hands rehype-katex
 * a fresh copy per pipeline (katexOptions). A .cjs file because a site's config requires it at
 * start-up: a change here needs `npm run clear`, then a restart of the dev server or a new build. A plain
 * restart shows the change on docs pages alone: pages of the pages plugin keep the old macros until the clear.
 *
 * HOW TO CHANGE IT  A new macro: a line `"\\name": "TeX"` in its group, or a new group. If a name
 * appears twice, the later group wins.
 */
const katexMacros = {
  mathNotation: {
    "\\RI": "\\mathscr{R}",
    "\\CV": "\\mathscr{C}",
    "\\R": "\\mathbb{R}",
    "\\C": "\\mathbb{C}",
    "\\N": "\\mathbb{N}",
    "\\W": "\\mathbb{W}",
    "\\Q": "\\mathbb{Q}",
    "\\Z": "\\mathbb{Z}",
    "\\U": "\\mathbb{U}",
    "\\F": "\\mathbb{F}",
    "\\pmi": "\\mathbb{PMI}",
    "\\wop": "\\mathbb{WOP}",
    "\\re": "\\operatorname{Re}{#1}",
    "\\im": "\\operatorname{Im}{#1}",
    "\\endproof": "\\;\\blacktriangle",
  },
  sampleCommands: {
    "\\x": "x+1",
    "\\y": "x^2+1",
    "\\z": "x^3+1",
  },
  mathFunctions: {
    "\\Ind": "\\operatorname{Ind}{#1}",
    "\\diam": "\\operatorname{diam}{#1}",
    "\\lcm": "\\operatorname{lcm}{#1}",
    "\\gcd": "\\operatorname{gcd}{#1}",
    "\\len": "\\operatorname{len}{#1}",
    "\\dist": "\\operatorname{dist}{#1}",
    "\\prev": "\\operatorname{prev}{#1}",
    "\\diff": "\\operatorname{diff}{#1}",
    "\\gs": "\\bigl| #1 \\bigr\\rangle",
  },
  generalPurpose: {
    "\\circled": "{\\large\\textcircled{\\small #1}}"
  },
  complexityPerformance: {
    "\\perfVeryGood": "\\colorbox{darkgreen}{$#1(#2)$}",
    "\\perfGood": "\\colorbox{darkolivegreen}{$#1(#2)$}",
    "\\perfAverage": "\\colorbox{b3a800}{$#1(#2)$}",
    "\\perfBad": "\\colorbox{b36200}{$#1(#2)$}",
    "\\perfVeryBad": "\\colorbox{darkred}{$#1(#2)$}",
    "\\perfCustom": "\\colorbox{#3}{$#1(#2)$}",
    "\\perfNeutral": "\\colorbox{gray}{$#1(#2)$}",
  },
  equationLabeling: {
    "\\eqref": "\\href{###1}{(\\text{#1})}",
    "\\ref": "\\href{###1}{\\text{#1}}",
    "\\label": "\\htmlId{#1}{}"
  }
}

/** @type {Record<string, string>} */
let allMacros = {};
for (const macrosCategory in katexMacros) {
  Object.assign(allMacros, katexMacros[macrosCategory])
}

module.exports = JSON.parse(JSON.stringify(allMacros));
