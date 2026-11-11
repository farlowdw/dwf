#include <stdio.h>

int main(void) {
    int total = 0;
    for (int i = 1; i <= 5; i++) total += i * i;
    printf("sum of squares 1..5 = %d\n", total);
    return 0;
}
