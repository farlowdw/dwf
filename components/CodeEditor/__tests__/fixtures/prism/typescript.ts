// typescript.ts fixture for prismTheme.test.js: every TypeScript snippet of a site guide's code-editor examples, joined on 2026-10-26, one "--- from <file> ---" line each,
// so that the Prism token types the editor's languages emit are known (prismTheme.js > ROLE_PRISM_TYPES / UNMAPPED_PRISM_TYPES). A new kind of code on a page: add it here; the test names any type the table lacks.
// --- from ts-derive-types.solution.ts ---
// Replace each unknown with a type DERIVED from getUser, not
// written out by hand: when getUser changes, they follow.
const getUser = async (id: number) => {
  return { id, name: 'Ada', admin: false };
};

type UserId = Parameters<typeof getUser>[0];
//   ^?
type User = Awaited<ReturnType<typeof getUser>>;
//   ^?

// --- from ts-derive-types.tests.ts ---
// Type tests: Check passes when the reader's code plus these lines has
// no type error. Expect and Equal need no import.
type tests = [
  Expect<Equal<UserId, number>>,
  Expect<Equal<User, { id: number; name: string; admin: boolean }>>,
];

// --- from ts-derive-types.ts ---
// Replace each unknown with a type DERIVED from getUser, not
// written out by hand: when getUser changes, they follow.
const getUser = async (id: number) => {
  return { id, name: 'Ada', admin: false };
};

type UserId = unknown;
//   ^?
type User = unknown;
//   ^?

// --- from ts-last.solution.ts ---
// Make last() return the last item of any array (undefined for an
// empty one), with a return type that follows the array:
// last([1, 2, 3]) is 3, and its type is number | undefined.
function last<T>(items: T[]): T | undefined {
  return items.at(-1);
}

console.log(last([1, 2, 3]));

// --- from ts-last.tests.ts ---
// Type tests and checks: Check passes when the reader's code plus these lines
// has no type error and every check passes. Expect, Equal and check need no import.
const fromNumbers = last([1, 2, 3]);
const fromWords = last(['red', 'green']);

type tests = [
  Expect<Equal<typeof fromNumbers, number | undefined>>,
  Expect<Equal<typeof fromWords, string | undefined>>,
];

check('last([1, 2, 3])', fromNumbers, 3);
check("last(['red', 'green'])", fromWords, 'green');
check('last([])', last([]), undefined);

// --- from ts-last.ts ---
// Make last() return the last item of any array (undefined for an
// empty one), with a return type that follows the array:
// last([1, 2, 3]) is 3, and its type is number | undefined.
function last(items: unknown[]): unknown {
  return undefined;
}

console.log(last([1, 2, 3]));

// --- from ts-modern.ts ---
// A Map, and for...of over it (in the order the keys came).
const visits = new Map<string, number>();
for (const page of ['home', 'notes', 'home', 'blog', 'home']) {
  visits.set(page, (visits.get(page) ?? 0) + 1);
}
for (const [page, count] of visits) {
  console.log(page.padEnd(6) + '#'.repeat(count));
}

// satisfies: every path must start with /, and the keys stay known.
const routes = {
  home: '/',
  notes: '/docs/intro',
  guide: '/site-guide',
} satisfies Record<string, `/${string}`>;
console.log(routes.guide);

// A const type parameter keeps the literal values.
function pickLast<const T extends readonly string[]>(options: T): T[number] {
  return options[options.length - 1];
}
const size = pickLast(['small', 'medium', 'large']);
//    ^?
console.log(size);

// NoInfer: start must be one of the colours given.
function rotate<C extends string>(colors: C[], start: NoInfer<C>): C[] {
  const from = colors.indexOf(start);
  return [...colors.slice(from), ...colors.slice(0, from)];
}
console.log(rotate(['red', 'yellow', 'green'], 'green'));
// rotate(['red', 'yellow', 'green'], 'blue');

// --- from ts-seeing-types.ts ---
const scores = [90, 72, 85];
//    ^?
const results = scores.map((score) => ({ score, passed: score >= 80 }));
//    ^?
const theme = { mode: 'dark', size: 14 } as const;
//    ^?

function first<T>(items: T[]): T | undefined {
  return items[0];
}

const winner = first(['Ada', 'Grace']);
//             ^?

function describe(value: string | number): string {
  if (typeof value === 'string') {
    return value.toUpperCase();
    //     ^?
  }
  return value.toFixed(1);
  //     ^?
}

console.log(results[1], theme.mode, winner, describe('ok'), describe(2));

// --- from ts-type-errors.ts ---
type User = {
  name: string;
  email?: string;
};

function domainOf(user: User): string {
  return user.email.split('@')[1];
}

console.log(domainOf({ name: 'Ada', email: 'ada@example.com' }));
console.log(domainOf({ name: 'Grace' }));

