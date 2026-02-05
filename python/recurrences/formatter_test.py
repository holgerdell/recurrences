"""Tests for the recurrence formatter."""

import math

import pytest

from .formatter import format_asymptotics, format_recurrence
from .parser import parse_recurrence
from .solver import solve_recurrence
from .types import FunctionTerm, Recurrence


class TestFormatRecurrence:
    """Tests for format_recurrence()."""

    def test_simple_single_term(self) -> None:
        """T(n) = T(n-1)"""
        rec = parse_recurrence("T(n) = T(n-1)")
        result = format_recurrence(rec)
        assert result == "T(n) = T(n-1)"

    def test_fibonacci(self) -> None:
        """T(n) = T(n-1) + T(n-2)"""
        rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
        result = format_recurrence(rec)
        assert result == "T(n) = T(n-1) + T(n-2)"

    def test_with_coefficient(self) -> None:
        """T(n) = 2*T(n-1)"""
        rec = parse_recurrence("T(n) = 2*T(n-1)")
        result = format_recurrence(rec)
        assert result == "T(n) = 2*T(n-1)"

    def test_with_multiple_coefficients(self) -> None:
        """T(n) = 2*T(n-1) + 3*T(n-2)"""
        rec = parse_recurrence("T(n) = 2*T(n-1) + 3*T(n-2)")
        result = format_recurrence(rec)
        # Order may vary, check both terms present
        assert "2*T(n-1)" in result
        assert "3*T(n-2)" in result
        assert result.startswith("T(n) = ")

    def test_with_constant(self) -> None:
        """T(n) = T(n-1) + 1"""
        rec = parse_recurrence("T(n) = T(n-1) + 1")
        result = format_recurrence(rec)
        assert "T(n-1)" in result
        assert "1" in result

    def test_constant_only(self) -> None:
        """T(n) = 5"""
        rec = parse_recurrence("T(n) = 5")
        result = format_recurrence(rec)
        assert result == "T(n) = 5"

    def test_positive_shift(self) -> None:
        """T(n) = T(n+1)"""
        rec = parse_recurrence("T(n) = T(n+1)")
        result = format_recurrence(rec)
        assert result == "T(n) = T(n+1)"

    def test_zero_shift(self) -> None:
        """T(n) = 2*T(n)"""
        rec = parse_recurrence("T(n) = 2*T(n)")
        result = format_recurrence(rec)
        assert result == "T(n) = 2*T(n)"

    def test_negative_coefficient(self) -> None:
        """T(n) = T(n-1) + -1*T(n-2) formatted nicely."""
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rhs = [
            FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[-1.0]),
            FunctionTerm(coef=-1.0, func="T", vars=["n"], shifts=[-2.0]),
        ]
        rec = Recurrence(lhs=lhs, rhs=rhs)
        result = format_recurrence(rec)
        assert result == "T(n) = T(n-1) - T(n-2)"

    def test_empty_rhs(self) -> None:
        """Empty RHS formats as '= 0'."""
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rec = Recurrence(lhs=lhs, rhs=[])
        result = format_recurrence(rec)
        assert result == "T(n) = 0"

    def test_unicode_identifiers(self) -> None:
        """Unicode function and variable names."""
        rec = parse_recurrence("φ(α) = φ(α-1) + φ(α-2)")
        result = format_recurrence(rec)
        assert result == "φ(α) = φ(α-1) + φ(α-2)"


class TestFormatRecurrenceRoundTrip:
    """Round-trip tests: parse -> format -> parse."""

    def test_roundtrip_fibonacci(self) -> None:
        """Fibonacci round-trips correctly."""
        original = "T(n) = T(n-1) + T(n-2)"
        rec = parse_recurrence(original)
        formatted = format_recurrence(rec)
        rec2 = parse_recurrence(formatted)
        assert rec.lhs.func == rec2.lhs.func
        assert rec.lhs.vars == rec2.lhs.vars

    def test_roundtrip_with_coefficient(self) -> None:
        """Coefficient recurrence round-trips."""
        original = "T(n) = 3*T(n-1)"
        rec = parse_recurrence(original)
        formatted = format_recurrence(rec)
        rec2 = parse_recurrence(formatted)
        assert len(rec2.rhs) == 1

    def test_roundtrip_tribonacci(self) -> None:
        """Tribonacci round-trips."""
        original = "T(n) = T(n-1) + T(n-2) + T(n-3)"
        rec = parse_recurrence(original)
        formatted = format_recurrence(rec)
        rec2 = parse_recurrence(formatted)
        assert len(rec2.rhs) == 3


class TestFormatAsymptotics:
    """Tests for format_asymptotics()."""

    def test_fibonacci_golden_ratio(self) -> None:
        """Fibonacci gives O(1.61803^n)."""
        rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)
        assert result.startswith("O(1.618")
        assert "^n)" in result

    def test_doubling(self) -> None:
        """T(n) = 2*T(n-1) gives O(2^n)."""
        rec = parse_recurrence("T(n) = 2*T(n-1)")
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)
        assert result == "O(2^n)"

    def test_tripling(self) -> None:
        """T(n) = 3*T(n-1) gives O(3^n)."""
        rec = parse_recurrence("T(n) = 3*T(n-1)")
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)
        assert result == "O(3^n)"

    def test_linear_growth(self) -> None:
        """T(n) = T(n-1) gives O(1)."""
        rec = parse_recurrence("T(n) = T(n-1)")
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)
        assert result == "O(1)"

    def test_constant_recurrence(self) -> None:
        """T(n) = 5 gives O(1)."""
        rec = parse_recurrence("T(n) = 5")
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)
        assert result == "O(1)"

    def test_divergent(self) -> None:
        """Divergent root gives O(∞)."""
        rec = parse_recurrence("T(n) = T(n-1)")
        # Manually set root to infinity
        result = format_asymptotics(rec, math.inf)
        assert result == "O(∞)"

    def test_tribonacci(self) -> None:
        """Tribonacci gives O(1.83929^n)."""
        rec = parse_recurrence("T(n) = T(n-1) + T(n-2) + T(n-3)")
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)
        assert result.startswith("O(1.839")
        assert "^n)" in result

    def test_multi_variable_raises(self) -> None:
        """Multi-variable recurrences raise ValueError."""
        rec = parse_recurrence("T(m, n) = T(m-1, n)")
        with pytest.raises(ValueError, match="single-variable"):
            format_asymptotics(rec, 1.0)


class TestFormatAsymptoticsFromTypes:
    """Tests using manually constructed objects."""

    def test_manual_root(self) -> None:
        """Manually specify root value."""
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rec = Recurrence(lhs=lhs, rhs=[])
        result = format_asymptotics(rec, 2.5)
        assert result == "O(2.5^n)"

    def test_integer_root_no_decimal(self) -> None:
        """Integer roots formatted without decimal point."""
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rec = Recurrence(lhs=lhs, rhs=[])
        result = format_asymptotics(rec, 5.0)
        assert result == "O(5^n)"
