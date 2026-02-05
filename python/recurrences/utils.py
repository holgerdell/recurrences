"""
Numeric utilities for the recurrences package.

Provides helper functions for number formatting and snapping values
to integers when they're very close.
"""

import math


def snap_int(val: float, ndigits: int = 6) -> float:
    """Snap a value to the nearest integer if it rounds to one at given precision.

    Useful for cleaning up floating-point results that should be integers.

    Args:
        val: The value to potentially snap.
        ndigits: Decimal places to consider (default 6, i.e., within 1e-6).

    Returns:
        The integer (as float) if val rounds to it, otherwise the rounded value.

    Examples:
        >>> snap_int(1.9999999)
        2.0
        >>> snap_int(2.0000001)
        2.0
        >>> snap_int(2.25)
        2.25
    """
    if not math.isfinite(val):
        return val
    rounded = round(val, ndigits)
    if rounded == int(rounded):
        return float(int(rounded))
    return rounded


def format_number(x: float, digits: int = 5) -> str:
    """Format a number with specified decimal digits, trimming trailing zeros.

    Args:
        x: The number to format.
        digits: Maximum number of decimal digits to show.

    Returns:
        A human-readable string representation.

    Examples:
        >>> format_number(2)
        '2'
        >>> format_number(2.1234)
        '2.1234'
        >>> format_number(2.123456)
        '2.12346'
        >>> format_number(float('inf'))
        'inf'
    """
    if not math.isfinite(x):
        return str(x)

    # Round up to the specified number of digits
    factor = 10**digits
    rounded = math.ceil(x * factor) / factor

    # Format and trim trailing zeros
    formatted = f"{rounded:.{digits}f}"
    return formatted.rstrip("0").rstrip(".")
