// go.go fixture for prismTheme.test.js: every Go snippet of a site guide's code-editor examples, joined on 2026-10-26, one "--- from <file> ---" line each,
// so that the Prism token types the editor's languages emit are known (prismTheme.js > ROLE_PRISM_TYPES / UNMAPPED_PRISM_TYPES). A new kind of code on a page: add it here; the test names any type the table lacks.
// --- from run-errors-sum.go ---
package main

import "fmt"

func main() {
	squares := []int{1, 4, 9, 16, 25}
	total := 0
	for i := 0; i <= len(squares); i++ {
		total += squares[i]
	}
	fmt.Println("sum of squares 1..5 =", total)
}

// --- from multi-lang-totals.go ---
package main

import "fmt"

// Each total is the sum of the values up to and including that one.
func runningTotals(values []int) []int {
	totals := []int{}
	for _, value := range values {
		totals = append(totals, value) // TODO: add the total so far
	}
	return totals
}

func main() {
	fmt.Println(runningTotals([]int{3, 1, 4, 1, 5}))
}

// --- from multi-lang-totals.solution.go ---
package main

import "fmt"

// Each total is the sum of the values up to and including that one.
func runningTotals(values []int) []int {
	totals := []int{}
	total := 0
	for _, value := range values {
		total += value
		totals = append(totals, total)
	}
	return totals
}

func main() {
	fmt.Println(runningTotals([]int{3, 1, 4, 1, 5}))
}

// --- from multi-lang-totals.tests.go ---
// Tests of multi-lang-totals.go (site guide > Exercises > In several languages): the BODY of
// main. check compares slices item by item; a nil slice equals an empty one.
check("runningTotals([]int{3, 1, 4, 1, 5})", runningTotals([]int{3, 1, 4, 1, 5}), []int{3, 4, 8, 9, 14})
check("runningTotals(nil)", runningTotals(nil), []int{})
check("runningTotals([]int{7})", runningTotals([]int{7}), []int{7})
check("runningTotals([]int{2, -2, 5})", runningTotals([]int{2, -2, 5}), []int{2, 0, 5})

// --- from sum-of-squares.go ---
package main

import "fmt"

func main() {
	total := 0
	for i := 1; i <= 5; i++ {
		total += i * i
	}
	fmt.Println("sum of squares 1..5 =", total)
}

