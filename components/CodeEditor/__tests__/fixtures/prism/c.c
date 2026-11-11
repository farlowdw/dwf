// c.c fixture for prismTheme.test.js: every C snippet of a site guide's code-editor examples, joined on 2026-10-26, one "--- from <file> ---" line each,
// so that the Prism token types the editor's languages emit are known (prismTheme.js > ROLE_PRISM_TYPES / UNMAPPED_PRISM_TYPES). A new kind of code on a page: add it here; the test names any type the table lacks.
// --- from run-errors-sum.c ---
#include <stdio.h>

int main(void) {
    int total = 0;
    for (int i = 1; i <= 5; i++) total += i * i;
    printf("sum of squares 1..5 = %d\n", totl);
    return 0;
}

// --- from multi-lang-totals.c ---
#include <stdio.h>

/* totals[i] is the sum of values[0] to values[i]. */
void running_totals(const int values[], int count, int totals[]) {
    for (int i = 0; i < count; i++) {
        totals[i] = values[i]; /* TODO: add the total so far */
    }
}

int main(void) {
    int values[] = {3, 1, 4, 1, 5};
    int totals[5];
    running_totals(values, 5, totals);
    for (int i = 0; i < 5; i++) printf("%d ", totals[i]);
    printf("\n");
    return 0;
}

// --- from multi-lang-totals.solution.c ---
#include <stdio.h>

/* totals[i] is the sum of values[0] to values[i]. */
void running_totals(const int values[], int count, int totals[]) {
    int total = 0;
    for (int i = 0; i < count; i++) {
        total += values[i];
        totals[i] = total;
    }
}

int main(void) {
    int values[] = {3, 1, 4, 1, 5};
    int totals[5];
    running_totals(values, 5, totals);
    for (int i = 0; i < 5; i++) printf("%d ", totals[i]);
    printf("\n");
    return 0;
}

// --- from multi-lang-totals.tests.c ---
/* Tests of multi-lang-totals.c (site guide > Exercises > In several languages): the BODY of
   main. C's check takes a number, a char or a string, so each case checks one item of totals. */
int values[] = {3, 1, 4, 1, 5};
int totals[5];
running_totals(values, 5, totals);
check("totals[4] of {3, 1, 4, 1, 5}", totals[4], 14);

int untouched[] = {-1};
running_totals(values, 0, untouched);
check("no values: totals[0] left alone", untouched[0], -1);

int one[] = {7};
int one_total[1];
running_totals(one, 1, one_total);
check("totals[0] of {7}", one_total[0], 7);

int mixed[] = {2, -2, 5};
int mixed_totals[3];
running_totals(mixed, 3, mixed_totals);
check("totals[1] of {2, -2, 5}", mixed_totals[1], 0);

// --- from sum-of-squares.c ---
#include <stdio.h>

int main(void) {
    int total = 0;
    for (int i = 1; i <= 5; i++) total += i * i;
    printf("sum of squares 1..5 = %d\n", total);
    return 0;
}

