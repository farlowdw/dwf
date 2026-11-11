#include <iostream>
#include <numeric>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3, 4, 5};
    int total = std::accumulate(v.begin(), v.end(), 0,
                                [](int acc, int x) { return acc + x * x; });
    std::cout << "sum of squares 1..5 = " << total << "\n";
}
