def squares(n):
    """The first n square numbers."""
    result = []
    for i in range(1, n + 1):
        result.append(i * i)
    return result

import sys

print("Python", sys.version.split()[0])
print(squares(5))
