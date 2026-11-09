/**
 * scripts/lib/range.mjs: a small version-range comparator, because shared/ has no dependencies and
 * so cannot use the `semver` package.
 *
 * It reads what npm ranges use here: 1.2.3, =1.2.3, ^1.2.3, ~1.2.3, >=1.2.3, >1.2, <2, <=2.1.0,
 * 1.x, 1.2.x, 1, *, an empty range, two terms joined by a space (both must hold), `a || b`, and
 * `1.2.3 - 2.0.0`. A partial version rounds as npm rounds it: >1.2 is >=1.3.0, <=2 is <3.0.0,
 * ^0 is <1.0.0 and ^0.0 is <0.1.0, and a partial upper end of a hyphen range takes in all of it.
 * A version with a prerelease counts by its numbers, and sits below the same version without one.
 * npm is stricter about prereleases, and satisfiesAsNpm reads a range that way: use it where the
 * answer has to be the one npm will give at an install.
 *
 * readVersionWord reads a version a person types after a command, for shared:bump and shared:all alike.
 *
 * HOW TO CHANGE IT
 *   A new operator: a case in comparatorsOf. The tests list every form with its expected answer.
 */

const FULL_VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const WILDCARD = /^[xX*]$/;
const TERM = /^(\^|~|>=|<=|>|<|=)?(.*)$/;
const HYPHEN_RANGE = /^\s*(\S+)\s+-\s+(\S+)\s*$/;
const SPACE_AFTER_OPERATOR = /(\^|~|>=|<=|>|<|=)\s+/g;
const FIRST_VERSION = /\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?/;
const LEADING_V = /^v/;

/** { numbers: [major, minor, patch], pre } or null for something that is not a version. */
export function parseVersion(text) {
  const match = FULL_VERSION.exec(String(text).trim());
  if (!match) return null;
  return { numbers: match.slice(1, 4).map(Number), pre: match[4] ?? '' };
}

/**
 * A version typed after a command, as npm writes it: 3.10.2 for v3.10.2. Anything that is no version
 * throws usageError(sentence), the calling script's own usage error.
 */
export function readVersionWord(word, usageError) {
  if (parseVersion(word) === null) throw usageError(`${word} is not a version.`);
  return word.replace(LEADING_V, '');
}

/** Compares two dotted prerelease strings, part by part, numbers as numbers. */
function comparePre(a, b) {
  if (a === b) return 0;
  if (a === '') return 1;
  if (b === '') return -1;
  return a.localeCompare(b, 'en', { numeric: true });
}

/** Below 0 when a < b, 0 when equal, above 0 when a > b. Both are parsed versions. */
export function compareVersions(a, b) {
  for (let index = 0; index < a.numbers.length; index += 1) {
    const difference = a.numbers[index] - b.numbers[index];
    if (difference !== 0) return difference;
  }
  return comparePre(a.pre, b.pre);
}

/** A version from whole numbers, with no prerelease. */
function versionOf(major, minor, patch) {
  return { numbers: [major, minor, patch], pre: '' };
}

/** A partial version: numbers up to the first wildcard or gap, and the prerelease if whole. */
function parsePartial(text) {
  const full = parseVersion(text);
  if (full) return { numbers: full.numbers, pre: full.pre };
  const parts = text.replace(/^v/, '').split('.').filter((part) => part !== '');
  const numbers = [];
  for (const part of parts) {
    if (WILDCARD.test(part)) break;
    numbers.push(Number(part));
  }
  return { numbers, pre: '' };
}

/** >= the floor and < the given ceiling. */
function between(floor, ceiling) {
  return [{ operator: '>=', version: floor }, { operator: '<', version: ceiling }];
}

/** The floor of a partial version, with missing numbers as 0. */
function floorOf({ numbers, pre }) {
  const [major = 0, minor = 0, patch = 0] = numbers;
  return { numbers: [major, minor, patch], pre };
}

/** The first version past a partial one: 1 gives 2.0.0, 1.2 gives 1.3.0. Only for one or two numbers. */
function nextAfter({ numbers }) {
  const [major, minor] = numbers;
  return numbers.length === 1 ? versionOf(major + 1, 0, 0) : versionOf(major, minor + 1, 0);
}

/** The range one partial version means by itself: 1 is 1.x, 1.2 is 1.2.x, 1.2.3 is exact. */
function plainTerm(partial) {
  const { numbers } = partial;
  const floor = floorOf(partial);
  if (numbers.length === 0) return [];
  if (numbers.length === 3) return [{ operator: '=', version: floor }];
  return between(floor, nextAfter(partial));
}

/** ^: changes that leave the leftmost non-zero number alone. A number not given is free: ^0 is <1.0.0. */
function caretTerm(partial) {
  const floor = floorOf(partial);
  const [major, minor, patch] = floor.numbers;
  const given = partial.numbers.length;
  if (major > 0 || given === 1) return between(floor, versionOf(major + 1, 0, 0));
  if (minor > 0 || given === 2) return between(floor, versionOf(0, minor + 1, 0));
  return between(floor, versionOf(0, 0, patch + 1));
}

/** > and <= with a partial version, rounded as npm rounds them: >1.2 is >=1.3.0, <=2 is <3.0.0. */
function roundedTerm(operator, partial) {
  const partialGiven = partial.numbers.length === 1 || partial.numbers.length === 2;
  if (partialGiven && operator === '>') return [{ operator: '>=', version: nextAfter(partial) }];
  if (partialGiven && operator === '<=') return [{ operator: '<', version: nextAfter(partial) }];
  return [{ operator, version: floorOf(partial) }];
}

/** ~: patch changes, or minor changes when only a major was given. */
function tildeTerm(partial) {
  const floor = floorOf(partial);
  const [major, minor] = floor.numbers;
  const ceiling = partial.numbers.length < 2 ? versionOf(major + 1, 0, 0) : versionOf(major, minor + 1, 0);
  return between(floor, ceiling);
}

/** One space-free term as a list of { operator, version }. */
function comparatorsOf(term) {
  const [, operator = '', rest] = TERM.exec(term);
  const partial = parsePartial(rest);
  if (operator === '^') return caretTerm(partial);
  if (operator === '~') return tildeTerm(partial);
  if (operator === '' || operator === '=') return plainTerm(partial);
  return roundedTerm(operator, partial);
}

/** True when `version` passes one comparator. */
function passes(version, { operator, version: wanted }) {
  const order = compareVersions(version, wanted);
  if (operator === '=') return order === 0;
  if (operator === '>') return order > 0;
  if (operator === '>=') return order >= 0;
  if (operator === '<') return order < 0;
  return order <= 0;
}

/** One side of `||` as a list of comparators. */
function alternativeOf(text) {
  const hyphen = HYPHEN_RANGE.exec(text);
  const plain = hyphen ? `>=${hyphen[1]} <=${hyphen[2]}` : text.replace(SPACE_AFTER_OPERATOR, '$1');
  return plain.trim().split(/\s+/).filter(Boolean).flatMap(comparatorsOf);
}

/** True when `version` passes every comparator of one side of `||`. */
function passesAll(version, comparators) {
  return comparators.every((item) => passes(version, item));
}

/** True when the version text is inside the range. A text that is no version never is. */
export function satisfies(versionText, range) {
  const version = parseVersion(versionText);
  if (version === null) return false;
  return String(range).split('||').map(alternativeOf).some((comparators) => passesAll(version, comparators));
}

/** True when two versions hold the same three numbers. */
function sameNumbers(first, second) {
  return first.numbers.every((number, index) => number === second.numbers[index]);
}

/** npm's rule: a prerelease counts only beside a comparator of the same numbers that names one too. */
function admitsPrerelease(version, comparators) {
  if (version.pre === '') return true;
  return comparators.some(({ version: wanted }) => wanted.pre !== '' && sameNumbers(wanted, version));
}

/** True when npm would call the version inside the range. >=3.0.0 takes 4.0.0 and not 4.0.0-canary-1. */
export function satisfiesAsNpm(versionText, range) {
  const version = parseVersion(versionText);
  if (version === null) return false;
  const alternatives = String(range).split('||').map(alternativeOf);
  return alternatives.some((comparators) => passesAll(version, comparators) && admitsPrerelease(version, comparators));
}

/** The first version written in a range: the one an `npm install` line suggests. */
export function firstVersion(range) {
  return FIRST_VERSION.exec(String(range))?.[0] ?? null;
}

/** A partial version filled out with zeros, as text: 3.9 is 3.9.0, 3 is 3.0.0. Null for no version. */
export function fullVersionOf(text) {
  if (text === null || text === undefined) return null;
  const partial = parsePartial(String(text));
  if (partial.numbers.length === 0 || partial.numbers.some(Number.isNaN)) return null;
  const { numbers, pre } = floorOf(partial);
  return `${numbers.join('.')}${pre === '' ? '' : `-${pre}`}`;
}
