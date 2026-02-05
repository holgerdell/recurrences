"""
Solver for recurrence relations.

This module provides functions to find the dominant root of a recurrence relation,
which determines its asymptotic growth rate.

The core algorithm solves equations of the form:
    sum_j coef_j * r^(-delta_j) = 1  for r >= 1

where delta_j are the shifts in the recurrence. The solution r gives the base
of the exponential growth: T(n) = O(r^n).

Example:
    >>> from recurrences import parse_recurrence, solve_recurrence
    >>> rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
    >>> root = solve_recurrence(rec)
    >>> root  # Golden ratio ≈ 1.618
    1.618...
"""

import math
from collections.abc import Iterable
from typing import Final

import numpy as np
from scipy.optimize import root_scalar

from .types import FunctionTerm, Recurrence, Root
from .utils import snap_int

# Large penalty value returned when no valid root exists
PENALTY: Final[float] = 1e6


def _eval_poly_and_derivative(x: float, deltas: np.ndarray) -> tuple[float, float]:
    """Evaluate g(x) = sum_j x^(-delta_j) - 1 and its derivative g'(x).

    Uses log/exp for numerical stability: x^(-a) = exp(-a * log(x)).

    Args:
        x: The value at which to evaluate.
        deltas: Array of delta (shift) values.

    Returns:
        Tuple of (g(x), g'(x)).
    """
    if x <= 0:
        return float("inf"), float("inf")

    lx = np.log(x)
    with np.errstate(over="ignore", under="ignore", invalid="ignore"):
        exp_terms = np.exp(-deltas * lx)
        s = float(np.sum(exp_terms))
        w = float(np.sum(deltas * exp_terms))

    g = s - 1.0
    gp = -w / x

    if not np.isfinite(g) or not np.isfinite(gp):
        return float("inf"), float("inf")

    return g, gp


def find_root(
    deltas: Iterable[float],
    *,
    x0: float | None = None,
) -> float:
    """Find the unique solution to sum_j r^(-delta_j) = 1 for r >= 1.

    This function solves the characteristic equation derived from a recurrence
    relation. The solution r is the base of the exponential growth rate.

    Args:
        deltas: Iterable of delta values (shifts from the recurrence).
        x0: Optional initial guess for Newton's method (used as fast path).

    Returns:
        The computed root r >= 1, or special values:
        - 1.0 if there's only one term (trivial case)
        - math.inf if the recurrence is divergent (root → ∞)
        - PENALTY if no valid root exists (e.g., non-positive deltas)

    Examples:
        >>> find_root([1, 2])  # T(n) = T(n-1) + T(n-2) → golden ratio
        1.618...
        >>> find_root([1])  # T(n) = T(n-1) → linear growth
        1.0
        >>> find_root([1, 1])  # T(n) = 2*T(n-1) → base 2
        2.0
    """
    d = np.asarray(list(deltas), dtype=float)
    m = d.size

    # Empty case: no terms means divergent
    if m == 0:
        return float("inf")

    # Single term: x^(-a) = 1 always has solution x = 1
    if m == 1:
        return 1.0

    # For m >= 2: if any delta <= 0, there's no root >= 1
    min_delta = float(np.min(d))
    if min_delta <= 0.0:
        return PENALTY

    def g(x: float) -> float:
        return _eval_poly_and_derivative(x, d)[0]

    # Analytic bracket: choose b so that g(b) <= 0
    # Since sum x^(-d_j) <= m * x^(-min_delta), we need m * b^(-min_delta) <= 1
    # => b >= m^(1/min_delta)
    log_m = math.log(m)
    b_cap = 1e12

    # Compute b in log-space to avoid overflow when min_delta is tiny
    exponent = log_m / min_delta
    log_cap = math.log(b_cap / 1.01)

    if not math.isfinite(exponent) or exponent >= log_cap:
        b = b_cap
    else:
        b = max(2.0, math.exp(exponent) * 1.01)  # small slack for FP error

    fb = g(b)

    # Fallback: expand bracket if needed
    if not (np.isfinite(fb) and fb <= 0.0):
        bb = b
        for _ in range(40):
            bb = min(bb * 2.0, 1e12)
            fb = g(bb)
            if np.isfinite(fb) and fb <= 0.0:
                b = bb
                break
        else:
            return PENALTY

    # Fast path: try Newton from initial guess if provided
    if x0 is not None and np.isfinite(x0):
        x0c = float(np.clip(x0, 1.0, b))
        try:
            sol_n = root_scalar(
                lambda x: _eval_poly_and_derivative(x, d)[0],
                fprime=lambda x: _eval_poly_and_derivative(x, d)[1],
                method="newton",
                x0=x0c,
                maxiter=20,
            )
            if sol_n.converged and 1.0 <= sol_n.root <= b * 1.000001:
                return float(sol_n.root)
        except Exception:
            pass

    # Robust path: Brent's method with bracket [1, b]
    sol = root_scalar(g, bracket=(1.0, b), method="brentq")
    if not sol.converged:
        return PENALTY

    return float(sol.root)


def solve_recurrence(rec: Recurrence) -> Root:
    """Solve a recurrence relation to find its asymptotic growth rate.

    This function extracts the shifts from the recurrence's RHS function terms
    and finds the dominant root that determines the exponential growth rate.

    For a recurrence like T(n) = 2*T(n-1) + T(n-2), this finds r such that
    T(n) = O(r^n).

    Args:
        rec: The parsed Recurrence object (must have exactly one variable).

    Returns:
        A Root (single float) containing the growth rate base.

    Notes:
        - Only single-variable recurrences are supported
        - Constants in the RHS are ignored (they don't affect asymptotics)
        - If all terms cancel or there are no function terms, returns 1.0
        - The result value is snapped to nearby integers when very close
    """
    vars_list = rec.lhs.vars
    num_vars = len(vars_list)

    if num_vars != 1:
        raise ValueError(
            f"Only single-variable recurrences are supported, got {num_vars} variables"
        )

    # Extract function terms (ignore constants)
    func_terms = [t for t in rec.rhs if isinstance(t, FunctionTerm)]

    # No function terms means constant or empty RHS → O(1)
    if not func_terms:
        return 1.0

    # Build arrays of coefficients and deltas
    coefs: list[float] = []
    deltas: list[float] = []

    for term in func_terms:
        coefs.append(term.coef)
        deltas.append(-term.shifts[0])  # delta = -shift

    coef_arr = np.array(coefs, dtype=float)
    delta_arr = np.array(deltas, dtype=float)

    # Check for non-positive deltas
    if np.any(delta_arr <= 0):
        return PENALTY

    def g(x: float) -> float:
        """Evaluate sum_j coef_j * x^(-delta_j) - 1."""
        if x <= 0:
            return float("inf")
        lx = np.log(x)
        with np.errstate(over="ignore", under="ignore", invalid="ignore"):
            terms = coef_arr * np.exp(-delta_arr * lx)
            return float(np.sum(terms)) - 1.0

    # Check value at x=1: g(1) = sum(coefs) - 1
    g1 = g(1.0)
    if abs(g1) < 1e-12:
        return 1.0
    if g1 < 0:
        # sum(coefs) < 1: root is less than 1, which we don't handle
        return PENALTY

    # Find upper bracket
    b = 2.0
    for _ in range(50):
        fb = g(b)
        if np.isfinite(fb) and fb <= 0:
            break
        b *= 2
        if b > 1e12:
            return PENALTY
    else:
        return PENALTY

    # Brent's method
    try:
        sol = root_scalar(g, bracket=(1.0, b), method="brentq")
        if sol.converged:
            return snap_int(float(sol.root))
    except Exception:
        pass

    return PENALTY
