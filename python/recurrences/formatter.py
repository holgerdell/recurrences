"""
Formatter for recurrence relations and asymptotic results.

This module provides functions to format recurrence relations back to strings
and to format the solved root as big-O asymptotic notation.

Example:
    >>> from recurrences import parse_recurrence, solve_recurrence
    >>> from recurrences.formatter import format_recurrence, format_asymptotics
    >>> rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
    >>> format_recurrence(rec)
    'T(n) = T(n-1) + T(n-2)'
    >>> root = solve_recurrence(rec)
    >>> format_asymptotics(rec, root)
    'O(1.61803^n)'
"""

import math

from .types import ConstantTerm, FunctionTerm, Recurrence, Root
from .utils import format_number


def format_recurrence(rec: Recurrence) -> str:
    """Format a Recurrence object back to a human-readable string.

    This produces a canonical string representation of the recurrence,
    suitable for display or round-trip parsing.

    Args:
        rec: The Recurrence object to format.

    Returns:
        A string like "T(n) = 2*T(n-1) + T(n-2)".

    Examples:
        >>> rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
        >>> format_recurrence(rec)
        'T(n) = T(n-1) + T(n-2)'
    """
    # Format LHS: func(var1, var2, ...)
    lhs = f"{rec.lhs.func}({', '.join(rec.lhs.vars)})"

    # Format RHS terms
    if not rec.rhs:
        return f"{lhs} = 0"

    rhs_parts: list[str] = []

    for term in rec.rhs:
        if isinstance(term, ConstantTerm):
            rhs_parts.append(_format_constant(term.coef))
        else:
            rhs_parts.append(_format_function_term(term))

    # Join with " + " and fix "+-" to "-"
    rhs = " + ".join(rhs_parts)
    rhs = rhs.replace(" + -", " - ")

    return f"{lhs} = {rhs}"


def _format_constant(coef: float) -> str:
    """Format a constant coefficient."""
    if coef == int(coef):
        return str(int(coef))
    return format_number(coef)


def _format_function_term(term: FunctionTerm) -> str:
    """Format a function term like '2*T(n-1)'."""
    # Format coefficient
    if term.coef == 1:
        coef_str = ""
    elif term.coef == -1:
        coef_str = "-"
    else:
        coef_str = f"{_format_constant(term.coef)}*"

    # Format arguments with shifts
    args: list[str] = []
    for var, shift in zip(term.vars, term.shifts):
        if shift == 0:
            args.append(var)
        elif shift < 0:
            # Format as "n-1" (shift is already negative)
            shift_str = _format_constant(-shift)
            args.append(f"{var}-{shift_str}")
        else:
            # Format as "n+1"
            shift_str = _format_constant(shift)
            args.append(f"{var}+{shift_str}")

    return f"{coef_str}{term.func}({', '.join(args)})"


def format_asymptotics(rec: Recurrence, root: Root) -> str:
    """Format the asymptotic growth rate as big-O notation.

    Args:
        rec: The Recurrence object (used to get variable names).
        root: The solved root (dominant base for the single variable).

    Returns:
        A string like "O(1.61803^n)" or "O(2^n)" for integer roots.
        Returns "O(∞)" for divergent (infinite) roots.
        Returns "O(1)" if the root is 1 (constant growth).

    Examples:
        >>> rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
        >>> root = solve_recurrence(rec)
        >>> format_asymptotics(rec, root)
        'O(1.61803^n)'
    """
    if len(rec.lhs.vars) != 1:
        raise ValueError(
            f"only single-variable recurrences are supported, got {len(rec.lhs.vars)}"
        )

    # Check for divergent
    if math.isinf(root):
        return "O(∞)"
    if root == 1.0:
        return "O(1)"

    var = rec.lhs.vars[0]
    return f"O({format_number(root)}^{var})"
