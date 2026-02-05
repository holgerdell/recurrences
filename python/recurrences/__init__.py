"""
Recurrences: A library for parsing and solving recurrence relations.

This package provides tools to:
- Parse recurrence relations from strings
- Solve for dominant roots (asymptotic growth rates)
- Format results as big-O notation

Example usage:
    from recurrences import parse_recurrence, solve_recurrence, format_asymptotics

    rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
    root = solve_recurrence(rec)
    print(format_asymptotics(rec, root))  # O(1.61803^n)
"""

from recurrences.formatter import format_asymptotics, format_recurrence
from recurrences.parser import (ParseError, is_valid_identifier,
                                parse_recurrence)
from recurrences.solver import PENALTY, find_root, solve_recurrence
from recurrences.types import (ConstantTerm, FunctionTerm, Recurrence, Root,
                               Term)

__all__ = [
    # Types
    "FunctionTerm",
    "ConstantTerm",
    "Term",
    "Recurrence",
    "Root",
    # Parser
    "parse_recurrence",
    "is_valid_identifier",
    "ParseError",
    # Solver
    "solve_recurrence",
    "find_root",
    "PENALTY",
    # Formatter
    "format_recurrence",
    "format_asymptotics",
]
