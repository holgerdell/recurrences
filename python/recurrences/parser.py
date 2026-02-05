"""
Parser for recurrence relations.

This module provides the parse_recurrence() function which converts a string
representation of a recurrence relation into a Recurrence object.

Example:
    >>> from recurrences.parser import parse_recurrence
    >>> rec = parse_recurrence("T(n) = 2*T(n-1) + T(n-2)")
    >>> rec.lhs.func
    'T'
    >>> len(rec.rhs)
    2
"""

import re
from typing import Final

import regex

from .types import ConstantTerm, FunctionTerm, Recurrence, Term


class ParseError(Exception):
    """Raised when a recurrence relation cannot be parsed."""

    pass


# Regex for valid identifiers: Unicode letters followed by letters, digits, _, or {}
# This matches the TypeScript pattern: /^[\p{L}][\p{L}\p{N}_{}]*$/u
# We use the 'regex' module instead of 're' because Python's re doesn't support \p{} escapes
IDENTIFIER_PATTERN: Final[regex.Pattern[str]] = regex.compile(
    r"^[\p{L}][\p{L}\p{N}_{}]*$", regex.UNICODE
)

# For use inside larger regex patterns (without anchors)
_IDENTIFIER_BODY: Final[str] = r"[\p{L}][\p{L}\p{N}_{}]*"

# Pattern for numeric literals (integers or decimals, optionally negative)
NUMBER_PATTERN: Final[re.Pattern[str]] = re.compile(r"^-?\d+(?:\.\d+)?$")


def is_valid_identifier(name: str) -> bool:
    """Check if a string is a valid identifier (function or variable name).

    Valid identifiers start with a Unicode letter and can contain Unicode
    letters, digits, underscores, and curly braces (for LaTeX-style names
    like n_{1} or α).

    Args:
        name: The string to check.

    Returns:
        True if the string is a valid identifier, False otherwise.
    """
    return bool(IDENTIFIER_PATTERN.match(name))


def _escape_regex(value: str) -> str:
    """Escape special regex characters in a string."""
    return re.escape(value)


def _split_rhs(s: str) -> list[str]:
    """Split RHS on '+' at depth 0, handling parentheses.

    This splits on '+' only when not inside parentheses, to properly
    handle terms like T(n-1) + T(n-2).

    Args:
        s: The RHS string to split.

    Returns:
        List of term strings.
    """
    out: list[str] = []
    depth = 0
    buf = ""

    for ch in s:
        if ch == "(":
            depth += 1
            buf += ch
        elif ch == ")":
            depth = max(0, depth - 1)
            buf += ch
        elif ch == "+" and depth == 0:
            if buf:
                out.append(buf)
            buf = ""
        else:
            buf += ch

    if buf:
        out.append(buf)

    return out


def parse_recurrence(text: str) -> Recurrence:
    """Parse a recurrence relation from a string.

    The input should be a single recurrence equation of the form:
        func(var1, var2, ...) = term1 + term2 + ...

    Where each term is either:
        - A function call: [coef*]func(var1[±shift1], var2[±shift2], ...)
        - A constant: numeric value

    Examples:
        T(n) = 2*T(n-1) + T(n-2)
        D(m, n) = D(m-1, n) + D(m, n-1) + D(m-1, n-1)
        T(n) = T(n-1) + 1

    Args:
        text: The recurrence relation as a string.

    Returns:
        A Recurrence object representing the parsed relation.

    Raises:
        ParseError: If the input cannot be parsed.
    """
    # Remove all whitespace
    cleaned = re.sub(r"\s+", "", text)

    if not cleaned:
        raise ParseError("Empty input")

    # Split on '='
    parts = cleaned.split("=")
    if len(parts) != 2:
        raise ParseError(f"Expected exactly one '=': {text}")

    lhs_str, rhs_str = parts

    if not lhs_str:
        raise ParseError("Empty left-hand side")
    if not rhs_str:
        raise ParseError("Empty right-hand side")

    # Parse LHS: func(var1, var2, ...)
    lhs_match = re.match(r"^([^(]+)\(([^)]*)\)$", lhs_str)
    if not lhs_match:
        raise ParseError(f"Invalid left-hand side: {lhs_str}")

    func = lhs_match.group(1)
    raw_args_str = lhs_match.group(2)

    # Validate function name
    if not is_valid_identifier(func):
        raise ParseError(f"Invalid function name: {func}")

    # Parse variable names from LHS
    raw_args = [a.strip() for a in raw_args_str.split(",") if a.strip()]
    if not raw_args:
        raise ParseError(f"No arguments in {lhs_str}")

    vars_list: list[str] = []
    for arg in raw_args:
        if not is_valid_identifier(arg):
            raise ParseError(f"Invalid variable name: {arg}")
        if arg in vars_list:
            raise ParseError(f"Duplicate variable name: {arg}")
        vars_list.append(arg)

    # Create LHS FunctionTerm (coef=1, all shifts=0)
    lhs = FunctionTerm(
        coef=1.0, func=func, vars=vars_list, shifts=[0.0] * len(vars_list)
    )

    # Parse RHS
    summands = [t.strip() for t in _split_rhs(rhs_str) if t.strip()]
    if not summands:
        raise ParseError("Empty right-hand side")

    raw_terms: list[Term] = []

    # Check if RHS is a single constant
    if len(summands) == 1 and NUMBER_PATTERN.match(summands[0]):
        constant_value = float(summands[0])
        raw_terms.append(ConstantTerm(coef=constant_value))
    else:
        for summand in summands:
            term = _parse_term(summand, func, vars_list)
            raw_terms.append(term)

    # Combine terms with same shifts
    terms = _combine_terms(raw_terms, vars_list, func)

    return Recurrence(lhs=lhs, rhs=terms)


def _parse_term(summand: str, func: str, vars_list: list[str]) -> Term:
    """Parse a single term from the RHS.

    Args:
        summand: The term string to parse.
        func: The expected function name.
        vars_list: The list of variable names from the LHS.

    Returns:
        A Term (FunctionTerm or ConstantTerm).

    Raises:
        ParseError: If the term cannot be parsed.
    """
    # Check if it's a constant
    if NUMBER_PATTERN.match(summand):
        return ConstantTerm(coef=float(summand))

    # Try to parse as function call: [coef*]func(args)
    # Pattern: optional coefficient, function name, parenthesized args
    # Use regex module for Unicode property support (\p{L}, \p{N})
    term_pattern = regex.compile(
        rf"^(?:(-?\d+(?:\.\d+)?)\*?)?({_IDENTIFIER_BODY})\(([^)]*)\)$",
        regex.UNICODE,
    )
    match = term_pattern.match(summand)

    if not match:
        raise ParseError(f"Invalid term: {summand}")

    coef_str = match.group(1)
    fn_name = match.group(2)
    args_str = match.group(3)

    coef = float(coef_str) if coef_str else 1.0

    # Validate function name
    if not is_valid_identifier(fn_name):
        raise ParseError(f"Invalid function name: {fn_name}")

    if fn_name != func:
        raise ParseError(
            f"Term '{summand}' uses different function name '{fn_name}' than '{func}'"
        )

    # Parse arguments
    args_raw = [a.strip() for a in args_str.split(",")]
    if len(args_raw) != len(vars_list):
        raise ParseError(
            f"Term '{summand}' has {len(args_raw)} args, expected {len(vars_list)}"
        )

    # Parse shifts for each variable
    shifts: list[float] = []
    for i, arg in enumerate(args_raw):
        var = vars_list[i]
        shift = _parse_shift(arg, var, summand)
        shifts.append(shift)

    return FunctionTerm(coef=coef, func=func, vars=vars_list.copy(), shifts=shifts)


def _parse_shift(arg: str, var: str, summand: str) -> float:
    """Parse the shift value from an argument.

    Args:
        arg: The argument string (e.g., "n-1", "n", "n+2").
        var: The expected variable name.
        summand: The full summand string (for error messages).

    Returns:
        The shift value (0 if no shift specified).

    Raises:
        ParseError: If the argument format is invalid.
    """
    # Pattern: var[±number]
    shift_pattern = re.compile(
        rf"^{_escape_regex(var)}([+-]\d+(?:\.\d+)?)?$", re.UNICODE
    )
    match = shift_pattern.match(arg)

    if not match:
        raise ParseError(f"Invalid argument '{arg}' in term '{summand}'")

    shift_str = match.group(1)
    return float(shift_str) if shift_str else 0.0


def _combine_terms(
    raw_terms: list[Term], vars_list: list[str], func: str
) -> list[Term]:
    """Combine terms with the same shifts.

    This merges terms like T(n-1) + 2*T(n-1) into 3*T(n-1).

    Args:
        raw_terms: List of parsed terms.
        vars_list: The list of variable names.
        func: The function name.

    Returns:
        List of combined terms.
    """
    # Separate constants and function terms
    constant_sum = 0.0
    function_map: dict[tuple[float, ...], float] = {}  # shifts -> coef

    for term in raw_terms:
        if isinstance(term, ConstantTerm):
            constant_sum += term.coef
        else:
            key = tuple(term.shifts)
            function_map[key] = function_map.get(key, 0.0) + term.coef

    # Build combined terms list
    terms: list[Term] = []

    # Add constant if non-zero
    if abs(constant_sum) > 1e-12:
        terms.append(ConstantTerm(coef=constant_sum))

    # Add function terms
    for shifts_tuple, coef in function_map.items():
        if abs(coef) < 1e-12:
            continue
        terms.append(
            FunctionTerm(
                coef=coef, func=func, vars=vars_list.copy(), shifts=list(shifts_tuple)
            )
        )

    return terms
