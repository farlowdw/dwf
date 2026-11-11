package main

import "fmt"

func main() {
	total := 0
	for i := 1; i <= 5; i++ {
		total += i * i
	}
	fmt.Println("sum of squares 1..5 =", total)
}
