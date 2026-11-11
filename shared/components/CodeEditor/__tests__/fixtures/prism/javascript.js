// javascript.js fixture for prismTheme.test.js: every JavaScript snippet of a site guide's code-editor examples, joined on 2026-10-26, one "--- from <file> ---" line each,
// so that the Prism token types the editor's languages emit are known (prismTheme.js > ROLE_PRISM_TYPES / UNMAPPED_PRISM_TYPES). A new kind of code on a page: add it here; the test names any type the table lacks.
// --- from run-errors-sum.js ---
const squares = [1, 4, 9, 16, 25];
const total = squares.sum();
console.log(`sum of squares 1..5 = ${total}`);

// --- from is-palindrome.js ---
// True when the text reads the same backwards, ignoring capitals, spaces and punctuation.
function isPalindrome(text) {
    return text === text.split('').reverse().join('');
}

console.log(isPalindrome('Racecar'));

// --- from is-palindrome.solution.js ---
// True when the text reads the same backwards, ignoring capitals, spaces and punctuation.
function isPalindrome(text) {
    const letters = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    return letters === letters.split('').reverse().join('');
}

console.log(isPalindrome('Racecar'));

// --- from is-palindrome.tests.js ---
// Tests of is-palindrome.js (site guide > Exercises > Hints and the solution): top-level code
// that calls the reader's function by name (no import); one check(name, got, expected) per case.
check("isPalindrome('level')", isPalindrome('level'), true);
check("isPalindrome('hello')", isPalindrome('hello'), false);
check("isPalindrome('Racecar')", isPalindrome('Racecar'), true);
check("isPalindrome('never odd or even')", isPalindrome('never odd or even'), true);
check("isPalindrome('A man, a plan, a canal: Panama!')", isPalindrome('A man, a plan, a canal: Panama!'), true);

// --- from multi-lang-totals.js ---
// Each total is the sum of the values up to and including that one.
function runningTotals(values) {
    const totals = [];
    for (const value of values) {
        totals.push(value); // TODO: add the total so far
    }
    return totals;
}

console.log(runningTotals([3, 1, 4, 1, 5]));

// --- from multi-lang-totals.solution.js ---
// Each total is the sum of the values up to and including that one.
function runningTotals(values) {
    const totals = [];
    let total = 0;
    for (const value of values) {
        total += value;
        totals.push(total);
    }
    return totals;
}

console.log(runningTotals([3, 1, 4, 1, 5]));

// --- from multi-lang-totals.tests.js ---
// Tests of multi-lang-totals.js (site guide > Exercises > In several languages): top-level code
// that calls the reader's function by name (no import); one check(name, got, expected) per case.
check('runningTotals([3, 1, 4, 1, 5])', runningTotals([3, 1, 4, 1, 5]), [3, 4, 8, 9, 14]);
check('runningTotals([])', runningTotals([]), []);
check('runningTotals([7])', runningTotals([7]), [7]);
check('runningTotals([2, -2, 5])', runningTotals([2, -2, 5]), [2, 0, 5]);

// --- from marks-sort-numbers.js ---
const prices = [25, 100, 7, 3];

// highlight-error-next-line
console.log(prices.sort()); // sorts as text: "100" before "25"
// highlight-success-next-line
console.log(prices.sort((a, b) => a - b)); // sorts as numbers

// --- from sum-of-squares.js ---
let total = 0;
for (let i = 1; i <= 5; i++) total += i * i;
console.log(`sum of squares 1..5 = ${total} (Node ${process.version})`);

