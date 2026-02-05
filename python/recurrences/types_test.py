"""Tests for type definitions."""

import pytest

from recurrences.types import ConstantTerm, FunctionTerm, Recurrence


class TestFunctionTerm:
    """Tests for FunctionTerm."""

    def test_creates_valid_function_term(self) -> None:
        term = FunctionTerm(coef=2.0, func="T", vars=["n"], shifts=[-1.0])
        assert term.coef == 2.0
        assert term.func == "T"
        assert term.vars == ["n"]
        assert term.shifts == [-1.0]

    def test_creates_multi_variable_term(self) -> None:
        term = FunctionTerm(coef=1.0, func="F", vars=["m", "n"], shifts=[-1.0, 0.0])
        assert term.vars == ["m", "n"]
        assert term.shifts == [-1.0, 0.0]

    def test_rejects_mismatched_vars_and_shifts(self) -> None:
        with pytest.raises(ValueError, match="same length"):
            FunctionTerm(coef=1.0, func="T", vars=["n", "m"], shifts=[-1.0])

    def test_allows_float_shifts(self) -> None:
        term = FunctionTerm(coef=1, func="T", vars=["n"], shifts=[-0.5])
        assert term.shifts == [-0.5]


class TestConstantTerm:
    """Tests for ConstantTerm."""

    def test_creates_constant_term(self) -> None:
        term = ConstantTerm(coef=5)
        assert term.coef == 5

    def test_allows_negative_constant(self) -> None:
        term = ConstantTerm(coef=-3.5)
        assert term.coef == -3.5


class TestRecurrence:
    """Tests for Recurrence."""

    def test_creates_valid_recurrence(self) -> None:
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rhs = [
            FunctionTerm(coef=2.0, func="T", vars=["n"], shifts=[-1.0]),
            FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[-2.0]),
        ]
        rec = Recurrence(lhs=lhs, rhs=rhs)
        assert rec.lhs.func == "T"
        assert len(rec.rhs) == 2

    def test_rejects_lhs_with_non_unit_coef(self) -> None:
        lhs = FunctionTerm(coef=2.0, func="T", vars=["n"], shifts=[0.0])
        rhs = [FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[-1.0])]
        with pytest.raises(ValueError, match="lhs.coef must be 1"):
            Recurrence(lhs=lhs, rhs=rhs)

    def test_rejects_lhs_with_non_zero_shifts(self) -> None:
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[-1.0])
        rhs = [FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[-1.0])]
        with pytest.raises(ValueError, match="lhs.shifts must all be 0"):
            Recurrence(lhs=lhs, rhs=rhs)

    def test_allows_constant_in_rhs(self) -> None:
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rhs: list[FunctionTerm | ConstantTerm] = [
            FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[-1.0]),
            ConstantTerm(coef=5.0),
        ]
        rec = Recurrence(lhs=lhs, rhs=rhs)
        assert len(rec.rhs) == 2

    def test_allows_empty_rhs(self) -> None:
        # Edge case: T(n) = 0 (empty sum)
        lhs = FunctionTerm(coef=1.0, func="T", vars=["n"], shifts=[0.0])
        rec = Recurrence(lhs=lhs, rhs=[])
        assert rec.rhs == []
