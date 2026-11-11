# python.py fixture for prismTheme.test.js: every Python snippet of a site guide's code-editor examples, joined on 2026-10-26, one "--- from <file> ---" line each,
# so that the Prism token types the editor's languages emit are known (prismTheme.js > ROLE_PRISM_TYPES / UNMAPPED_PRISM_TYPES). A new kind of code on a page: add it here; the test names any type the table lacks.
# --- from run-errors-average.py ---
def average(scores):
    total = 0
    for i in range(len(scores) + 1):
        total += scores[i]
    return total / len(scores)

print(average([90, 85, 77]))

# --- from multi-lang-totals.py ---
def running_totals(values):
    """Each total is the sum of the values up to and including that one."""
    totals = []
    for value in values:
        totals.append(value)  # TODO: add the total so far
    return totals


print(running_totals([3, 1, 4, 1, 5]))

# --- from multi-lang-totals.solution.py ---
def running_totals(values):
    """Each total is the sum of the values up to and including that one."""
    totals = []
    total = 0
    for value in values:
        total += value
        totals.append(total)
    return totals


print(running_totals([3, 1, 4, 1, 5]))

# --- from multi-lang-totals.tests.py ---
# Tests of multi-lang-totals.py (site guide > Exercises > In several languages): top-level code
# that calls the reader's function by name; one check(name, got, expected) per case.
check("running_totals([3, 1, 4, 1, 5])", running_totals([3, 1, 4, 1, 5]), [3, 4, 8, 9, 14])
check("running_totals([])", running_totals([]), [])
check("running_totals([7])", running_totals([7]), [7])
check("running_totals([2, -2, 5])", running_totals([2, -2, 5]), [2, 0, 5])

# --- from pattern.py ---
rows = 5
for row in range(1, rows):
    print("*" * row)

# --- from saved-draft.py ---
# Change this code, then reload the page: your version comes back.
greeting = "Hello"
for name in ["Ada", "Grace", "Linus"]:
    print(f"{greeting}, {name}!")

# --- from two-sum.py ---
def two_sum(numbers, target):
    """The positions of the two numbers that add up to target, or None."""
    for i in range(len(numbers)):
        for j in range(i, len(numbers)):
            if numbers[i] + numbers[j] == target:
                return [i, j]
    return None


if __name__ == "__main__":
    print(two_sum([2, 7, 11, 15], 9))

# --- from two-sum.tests.py ---
check("two_sum([2, 7, 11, 15], 9)", two_sum([2, 7, 11, 15], 9), [0, 1])
check("two_sum([3, 2, 4], 6)", two_sum([3, 2, 4], 6), [1, 2])
check("two_sum([3, 3], 6)", two_sum([3, 3], 6), [0, 1])
check("two_sum([-1, -2, -3, -4, -5], -8)", two_sum([-1, -2, -3, -4, -5], -8), [2, 4])
check("two_sum([1, 2, 3], 7)", two_sum([1, 2, 3], 7), None)

# --- from marks-binary-search.py ---
def binary_search(items, target):
    low, high = 0, len(items) - 1
    while low <= high:
        middle = (low + high) // 2
        if items[middle] == target:
            return middle
        if items[middle] < target:
            low = middle + 1
        else:
            high = middle - 1
    return -1

numbers = [2, 3, 5, 7, 11, 13, 17]
print(binary_search(numbers, 11))
print(binary_search(numbers, 4))

# --- from marks-longest-word.py ---
words = ["pear", "fig", "banana", "kiwi"]

# highlight-remove-start
longest = words[0]
for word in words:
    if len(word) > len(longest):
        longest = word
# highlight-remove-end
# highlight-add-next-line
longest = max(words, key=len)

print(longest)

# --- from marks-mean.py ---
def mean(values):
    # highlight-warning-next-line
    return sum(values) / len(values)  # an empty list would divide by zero

# highlight-next-line
week = [18, 21, 19, 24, 22, 20, 23]

# highlight-start
print("mean:", round(mean(week), 1))
print("warmest:", max(week))
# highlight-end

# --- from steps-difference-array.py ---
def running_sums(values):
    """Each value plus every value before it."""
    sums = []
    total = 0
    for value in values:
        total += value
        sums.append(total)
    return sums

def apply_updates(length, updates):
    diff = [0] * (length + 1)
    for left, right, amount in updates:
        diff[left] += amount
        diff[right + 1] -= amount
    return running_sums(diff)[:length]

updates = [(1, 3, 2), (2, 4, 3), (0, 2, -2)]
print(apply_updates(5, updates))  # [-2, 0, 3, 5, 3]

# --- from read-input.py ---
n = int(input())
numbers = list(map(int, input().split()))
print(f"{n} numbers, sum {sum(numbers)}, largest {max(numbers)}")

# --- from lesson-pivot-index.py ---
def pivot_index(nums):
    """The first i where sum(nums[:i]) == sum(nums[i + 1:]), else -1."""
    # Your code here
    return -1


if __name__ == "__main__":
    print(pivot_index([1, 7, 3, 6, 5, 6]))  # 3

# --- from lesson-pivot-index.solution.py ---
def pivot_index(nums):
    """The first i where sum(nums[:i]) == sum(nums[i + 1:]), else -1."""
    total = sum(nums)
    left = 0
    for i, x in enumerate(nums):
        if left == total - left - x:
            return i
        left += x
    return -1


if __name__ == "__main__":
    print(pivot_index([1, 7, 3, 6, 5, 6]))  # 3

# --- from lesson-pivot-index.tests.py ---
# Tests of lesson-pivot-index.py (site guide > Putting it together > A whole lesson): top-level
# code that calls the reader's function by name; one check(name, got, expected) per case.
check("pivot_index([1, 7, 3, 6, 5, 6])", pivot_index([1, 7, 3, 6, 5, 6]), 3)
check("pivot_index([2, 1, -1])", pivot_index([2, 1, -1]), 0)
check("pivot_index([1, 2, 3])", pivot_index([1, 2, 3]), -1)
check("pivot_index([0, 0])", pivot_index([0, 0]), 0)
check("pivot_index([])", pivot_index([]), -1)

# --- from lesson-prefix-sums.py ---
def prefix_sums(nums):
    """prefix[i] is the sum of the first i numbers."""
    prefix = [0]
    for x in nums:
        prefix.append(prefix[-1] + x)
    return prefix


def range_sum(prefix, i, j):
    """The sum of nums[i:j], in one subtraction."""
    return prefix[j] - prefix[i]


nums = [3, 1, 4, 1, 5, 9]
prefix = prefix_sums(nums)
print("prefix:", prefix)
print("sum of nums[2:5]:", range_sum(prefix, 2, 5))

# --- from squares.py ---
def squares(n):
    """The first n square numbers."""
    result = []
    for i in range(1, n + 1):
        result.append(i * i)
    return result

import sys

print("Python", sys.version.split()[0])
print(squares(5))

# --- from sum-of-squares.py ---
total = sum(i * i for i in range(1, 6))
print("sum of squares 1..5 =", total)

