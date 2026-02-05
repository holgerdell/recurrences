"""Tests for the recurrence solver."""

import math

import pytest

from .parser import parse_recurrence
from .solver import PENALTY, find_root, solve_recurrence
from .types import ConstantTerm, FunctionTerm, Recurrence


class TestFindRoot:
    """Tests for the find_root() function."""

    def test_single_delta(self) -> None:
        """Single term: x^(-a) = 1 has solution x = 1."""
        assert find_root([1]) == 1.0
        assert find_root([2]) == 1.0
        assert find_root([0.5]) == 1.0

    def test_empty_deltas(self) -> None:
        """Empty deltas means divergent."""
        assert find_root([]) == math.inf

    def test_two_equal_deltas(self) -> None:
        """T(n) = 2*T(n-1) has root 2."""
        # Two terms with delta=1: 2*r^(-1) = 1 => r = 2
        result = find_root([1, 1])
        assert abs(result - 2.0) < 1e-9

    def test_fibonacci(self) -> None:
        """T(n) = T(n-1) + T(n-2) has golden ratio root."""
        # r^(-1) + r^(-2) = 1 => r = (1 + sqrt(5)) / 2
        phi = (1 + math.sqrt(5)) / 2
        result = find_root([1, 2])
        assert abs(result - phi) < 1e-12

    def test_tribonacci(self) -> None:
        """T(n) = T(n-1) + T(n-2) + T(n-3) has root ≈ 1.839."""
        result = find_root([1, 2, 3])
        assert abs(result - 1.8392867552141612) < 1e-12

    def test_geometric_base_3(self) -> None:
        """T(n) = 3*T(n-1) has root 3."""
        result = find_root([1, 1, 1])
        assert abs(result - 3.0) < 1e-9

    def test_non_positive_delta(self) -> None:
        """Non-positive deltas return PENALTY."""
        assert find_root([0, 1]) == PENALTY
        assert find_root([-1, 1]) == PENALTY
        assert find_root([1, 0]) == PENALTY

    def test_with_initial_guess(self) -> None:
        """Initial guess can speed up convergence."""
        phi = (1 + math.sqrt(5)) / 2
        result = find_root([1, 2], x0=1.6)
        assert abs(result - phi) < 1e-9

    def test_large_deltas(self) -> None:
        """Large deltas still find roots correctly."""
        # r^(-10) + r^(-20) = 1
        result = find_root([10, 20])
        # At r ≈ 1.07, we have r^(-10) + r^(-20) ≈ 1
        assert 1.0 < result < 1.1

    def test_many_terms(self) -> None:
        """Many equal terms: n*r^(-1) = 1 => r = n."""
        # 5 terms with delta=1: 5*r^(-1) = 1 => r = 5
        result = find_root([1, 1, 1, 1, 1])
        assert abs(result - 5.0) < 1e-9


class TestSolveRecurrence:
    """Tests for solve_recurrence() with parsed recurrences."""

    def test_linear_recurrence(self) -> None:
        """T(n) = T(n-1) has root 1."""
        rec = parse_recurrence("T(n) = T(n-1)")
        root = solve_recurrence(rec)
        assert root == 1.0

    def test_doubling_recurrence(self) -> None:
        """T(n) = 2*T(n-1) has root 2."""
        rec = parse_recurrence("T(n) = 2*T(n-1)")
        root = solve_recurrence(rec)
        assert abs(root - 2.0) < 1e-9

    def test_fibonacci_recurrence(self) -> None:
        """T(n) = T(n-1) + T(n-2) has golden ratio root."""
        rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
        root = solve_recurrence(rec)
        phi = (1 + math.sqrt(5)) / 2
        # Note: result is snapped to 6 decimal places
        assert abs(root - phi) < 1e-5

    def test_tribonacci_recurrence(self) -> None:
        """T(n) = T(n-1) + T(n-2) + T(n-3) has root ≈ 1.839."""
        rec = parse_recurrence("T(n) = T(n-1) + T(n-2) + T(n-3)")
        root = solve_recurrence(rec)
        assert abs(root - 1.8392867552141612) < 1e-6

    def test_constant_only_rhs(self) -> None:
        """T(n) = 5 (constant RHS) has root 1."""
        rec = parse_recurrence("T(n) = 5")
        root = solve_recurrence(rec)
        assert root == 1.0

    def test_function_plus_constant(self) -> None:
        """T(n) = T(n-1) + 1 behaves like T(n) = T(n-1) for asymptotics."""
        rec = parse_recurrence("T(n) = T(n-1) + 1")
        root = solve_recurrence(rec)
        assert root == 1.0

    def test_coefficient_greater_than_one(self) -> None:
        """T(n) = 3*T(n-1) has root 3."""
        rec = parse_recurrence("T(n) = 3*T(n-1)")
        root = solve_recurrence(rec)
        assert abs(root - 3.0) < 1e-9

    def test_fractional_coefficient(self) -> None:
        """T(n) = 0.5*T(n-1) has root 0.5, but we require root >= 1."""
        rec = parse_recurrence("T(n) = 0.5*T(n-1)")
        root = solve_recurrence(rec)
        # 0.5 * r^(-1) = 1 => r = 0.5, but we want r >= 1
        # This should return PENALTY or 1.0 depending on implementation
        # The sum 0.5*r^(-1) at r=1 is 0.5 < 1, so no root >= 1
        assert root == PENALTY

    def test_snaps_to_integer(self) -> None:
        """Results close to integers are snapped."""
        rec = parse_recurrence("T(n) = 2*T(n-1)")
        root = solve_recurrence(rec)
        # Should be exactly 2, not 1.9999999...
        assert root == 2.0
        assert isinstance(root, float)


class TestSolveRecurrenceEdgeCases:
    """Edge case tests for solve_recurrence()."""

    def test_unicode_identifiers(self) -> None:
        """Unicode function and variable names work."""
        rec = parse_recurrence("φ(α) = φ(α-1) + φ(α-2)")
        root = solve_recurrence(rec)
        phi = (1 + math.sqrt(5)) / 2
        # Note: result is snapped to 6 decimal places
        assert abs(root - phi) < 1e-5

    def test_large_shift(self) -> None:
        """T(n) = T(n-10) has root 1."""
        rec = parse_recurrence("T(n) = T(n-10)")
        root = solve_recurrence(rec)
        assert root == 1.0

    def test_combined_like_terms(self) -> None:
        """Parser combines like terms: T(n) = T(n-1) + T(n-1) becomes 2*T(n-1)."""
        rec = parse_recurrence("T(n) = T(n-1) + T(n-1)")
        root = solve_recurrence(rec)
        assert abs(root - 2.0) < 1e-9

    def test_multi_variable_raises(self) -> None:
        """Multi-variable recurrences raise ValueError."""
        rec = parse_recurrence("T(m, n) = T(m-1, n) + T(m, n-1)")
        with pytest.raises(ValueError, match="single-variable"):
            solve_recurrence(rec)


class TestSolveRecurrenceFromTypes:
    """Tests using manually constructed Recurrence objects."""

    def test_manual_fibonacci(self) -> None:
        """Manually construct Fibonacci recurrence."""
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rhs = [
            FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[-1.0]),
            FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[-2.0]),
        ]
        rec = Recurrence(lhs=lhs, rhs=rhs)
        root = solve_recurrence(rec)
        phi = (1 + math.sqrt(5)) / 2
        # Note: result is snapped to 6 decimal places
        assert abs(root - phi) < 1e-5

    def test_empty_rhs(self) -> None:
        """Empty RHS returns root 1."""
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rec = Recurrence(lhs=lhs, rhs=[])
        root = solve_recurrence(rec)
        assert root == 1.0

    def test_constant_only(self) -> None:
        """RHS with only constants returns root 1."""
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rhs = [ConstantTerm(coef=5.0)]
        rec = Recurrence(lhs=lhs, rhs=rhs)
        root = solve_recurrence(rec)
        assert root == 1.0
