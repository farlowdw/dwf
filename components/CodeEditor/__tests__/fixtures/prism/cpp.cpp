// cpp.cpp fixture for prismTheme.test.js: every C++ snippet of a site guide's code-editor examples, joined on 2026-10-26, one "--- from <file> ---" line each,
// so that the Prism token types the editor's languages emit are known (prismTheme.js > ROLE_PRISM_TYPES / UNMAPPED_PRISM_TYPES). A new kind of code on a page: add it here; the test names any type the table lacks.
// --- from multi-lang-totals.cpp ---
#include <iostream>
#include <vector>

// Each total is the sum of the values up to and including that one.
std::vector<int> running_totals(const std::vector<int> &values) {
    std::vector<int> totals;
    for (int value : values) {
        totals.push_back(value); // TODO: add the total so far
    }
    return totals;
}

int main() {
    for (int total : running_totals({3, 1, 4, 1, 5})) std::cout << total << ' ';
    std::cout << '\n';
}

// --- from multi-lang-totals.solution.cpp ---
#include <iostream>
#include <vector>

// Each total is the sum of the values up to and including that one.
std::vector<int> running_totals(const std::vector<int> &values) {
    std::vector<int> totals;
    int total = 0;
    for (int value : values) {
        total += value;
        totals.push_back(total);
    }
    return totals;
}

int main() {
    for (int total : running_totals({3, 1, 4, 1, 5})) std::cout << total << ' ';
    std::cout << '\n';
}

// --- from multi-lang-totals.tests.cpp ---
// Tests of multi-lang-totals.cpp (site guide > Exercises > In several languages): the BODY of
// main. check compares whole vectors; the expected one may be a braced list, but not an empty one.
check("running_totals({3, 1, 4, 1, 5})", running_totals({3, 1, 4, 1, 5}), {3, 4, 8, 9, 14});
check("running_totals({})", running_totals({}), std::vector<int>{});
check("running_totals({7})", running_totals({7}), {7});
check("running_totals({2, -2, 5})", running_totals({2, -2, 5}), {2, 0, 5});

// --- from sum-of-squares.cpp ---
#include <iostream>
#include <numeric>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3, 4, 5};
    int total = std::accumulate(v.begin(), v.end(), 0,
                                [](int acc, int x) { return acc + x * x; });
    std::cout << "sum of squares 1..5 = " << total << "\n";
}

