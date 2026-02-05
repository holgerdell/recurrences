# Recurrences

Parse and solve linear recurrences to get asymptotic growth rates (big-O notation).

## Quick Start

```bash
python solve_recurrence.py "T(n) = T(n-1) + T(n-2)"
python solve_recurrence.py "T(n) = 2*T(n-1)" -v
python solve_recurrence.py "T(n) = T(n-1) + T(n-2)" --json
echo "T(n) = 3*T(n-1)" | python solve_recurrence.py
```

```python
from recurrences import parse_recurrence, solve_recurrence, format_asymptotics

rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
root = solve_recurrence(rec)
print(format_asymptotics(rec, root))
```

```python
from recurrences import parse_recurrence, solve_recurrence, format_asymptotics

# Parse a recurrence relation
rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")

# Solve for the dominant root
root = solve_recurrence(rec)
print(root)  # [1.618034]

# Format as big-O notation
print(format_asymptotics(rec, root))  # O(1.61804^n)
```

## Supported Syntax

```
T(n) = T(n-1)
T(n) = T(n-1) + T(n-2)
T(n) = 2*T(n-1) + 3*T(n-2)
T(n) = T(n-1) + 1
T(n) = T(n+1)
φ(α) = φ(α-1) + φ(α-2)
```

## Examples

| Recurrence                        | Root      | Asymptotics  |
| --------------------------------- | --------- | ------------ |
| `T(n) = T(n-1)`                   | 1         | O(1)         |
| `T(n) = 2*T(n-1)`                 | 2         | O(2^n)       |
| `T(n) = T(n-1) + T(n-2)`          | φ ≈ 1.618 | O(1.61804^n) |
| `T(n) = T(n-1) + T(n-2) + T(n-3)` | ≈ 1.839   | O(1.83929^n) |

## Limitations

- Single-variable recurrences only (e.g., `T(n)`, not `T(m, n)`)
- Linear recurrences with constant coefficients
- Positive shifts required for a valid root

## License

MIT
