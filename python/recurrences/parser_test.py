"""Tests for the recurrence parser."""

import pytest

from .parser import ParseError, is_valid_identifier, parse_recurrence
from .types import ConstantTerm, FunctionTerm


class TestIsValidIdentifier:
    """Tests for is_valid_identifier()."""

    def test_simple_letters(self) -> None:
        assert is_valid_identifier("T")
        assert is_valid_identifier("n")
        assert is_valid_identifier("foo")
        assert is_valid_identifier("FooBar")

    def test_letters_and_digits(self) -> None:
        assert is_valid_identifier("T1")
        assert is_valid_identifier("var2")
        assert is_valid_identifier("x123")

    def test_underscores(self) -> None:
        assert is_valid_identifier("foo_bar")
        assert is_valid_identifier("T_1")
        assert is_valid_identifier("n_")

    def test_curly_braces(self) -> None:
        """Curly braces are allowed for LaTeX-style subscripts."""
        assert is_valid_identifier("n_{1}")
        assert is_valid_identifier("T_{ij}")

    def test_unicode_letters(self) -> None:
        """Unicode letters are valid."""
        assert is_valid_identifier("α")
        assert is_valid_identifier("β")
        assert is_valid_identifier("μ")
        assert is_valid_identifier("λx")

    def test_invalid_starting_with_digit(self) -> None:
        assert not is_valid_identifier("1x")
        assert not is_valid_identifier("2")

    def test_invalid_starting_with_underscore(self) -> None:
        assert not is_valid_identifier("_foo")
        assert not is_valid_identifier("_")

    def test_invalid_empty(self) -> None:
        assert not is_valid_identifier("")

    def test_invalid_special_chars(self) -> None:
        assert not is_valid_identifier("foo-bar")
        assert not is_valid_identifier("foo.bar")
        assert not is_valid_identifier("foo bar")


class TestParseRecurrenceBasic:
    """Basic parsing tests."""

    def test_simple_single_term(self) -> None:
        """T(n) = T(n-1)"""
        rec = parse_recurrence("T(n) = T(n-1)")
        assert rec.lhs.func == "T"
        assert rec.lhs.vars == ["n"]
        assert rec.lhs.shifts == [0.0]
        assert len(rec.rhs) == 1
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.coef == 1.0
        assert term.func == "T"
        assert term.shifts == [-1.0]

    def test_simple_two_terms(self) -> None:
        """T(n) = T(n-1) + T(n-2) (Fibonacci)"""
        rec = parse_recurrence("T(n) = T(n-1) + T(n-2)")
        assert rec.lhs.func == "T"
        assert len(rec.rhs) == 2

        # Find terms by shift
        shifts = {tuple(t.shifts): t for t in rec.rhs if isinstance(t, FunctionTerm)}
        assert (-1.0,) in shifts
        assert (-2.0,) in shifts
        assert shifts[(-1.0,)].coef == 1.0
        assert shifts[(-2.0,)].coef == 1.0

    def test_with_coefficient(self) -> None:
        """T(n) = 2*T(n-1)"""
        rec = parse_recurrence("T(n) = 2*T(n-1)")
        assert len(rec.rhs) == 1
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.coef == 2.0
        assert term.shifts == [-1.0]

    def test_with_multiple_coefficients(self) -> None:
        """T(n) = 2*T(n-1) + 3*T(n-2)"""
        rec = parse_recurrence("T(n) = 2*T(n-1) + 3*T(n-2)")
        assert len(rec.rhs) == 2

        shifts = {tuple(t.shifts): t for t in rec.rhs if isinstance(t, FunctionTerm)}
        assert shifts[(-1.0,)].coef == 2.0
        assert shifts[(-2.0,)].coef == 3.0


class TestParseRecurrenceConstants:
    """Tests for parsing constants."""

    def test_single_constant(self) -> None:
        """T(n) = 5"""
        rec = parse_recurrence("T(n) = 5")
        assert len(rec.rhs) == 1
        term = rec.rhs[0]
        assert isinstance(term, ConstantTerm)
        assert term.coef == 5.0

    def test_constant_with_function_terms(self) -> None:
        """T(n) = T(n-1) + 1"""
        rec = parse_recurrence("T(n) = T(n-1) + 1")
        assert len(rec.rhs) == 2

        constants = [t for t in rec.rhs if isinstance(t, ConstantTerm)]
        functions = [t for t in rec.rhs if isinstance(t, FunctionTerm)]

        assert len(constants) == 1
        assert constants[0].coef == 1.0
        assert len(functions) == 1
        assert functions[0].shifts == [-1.0]

    def test_negative_constant(self) -> None:
        """T(n) = T(n-1) + -2"""
        rec = parse_recurrence("T(n) = T(n-1) + -2")
        constants = [t for t in rec.rhs if isinstance(t, ConstantTerm)]
        assert len(constants) == 1
        assert constants[0].coef == -2.0


class TestParseRecurrenceShifts:
    """Tests for different shift formats."""

    def test_positive_shift(self) -> None:
        """T(n) = T(n+1)"""
        rec = parse_recurrence("T(n) = T(n+1)")
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.shifts == [1.0]

    def test_zero_shift(self) -> None:
        """T(n) = 2*T(n)"""
        rec = parse_recurrence("T(n) = 2*T(n)")
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.shifts == [0.0]

    def test_decimal_shift(self) -> None:
        """T(n) = T(n-0.5)"""
        rec = parse_recurrence("T(n) = T(n-0.5)")
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.shifts == [-0.5]

    def test_large_shift(self) -> None:
        """T(n) = T(n-100)"""
        rec = parse_recurrence("T(n) = T(n-100)")
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.shifts == [-100.0]


class TestParseRecurrenceMultiVariable:
    """Tests for multi-variable recurrences."""

    def test_two_variables(self) -> None:
        """T(m, n) = T(m-1, n) + T(m, n-1)"""
        rec = parse_recurrence("T(m, n) = T(m-1, n) + T(m, n-1)")
        assert rec.lhs.vars == ["m", "n"]
        assert rec.lhs.shifts == [0.0, 0.0]
        assert len(rec.rhs) == 2

        shifts = {tuple(t.shifts): t for t in rec.rhs if isinstance(t, FunctionTerm)}
        assert (-1.0, 0.0) in shifts
        assert (0.0, -1.0) in shifts

    def test_delannoy(self) -> None:
        """D(m, n) = D(m-1, n) + D(m, n-1) + D(m-1, n-1)"""
        rec = parse_recurrence("D(m, n) = D(m-1, n) + D(m, n-1) + D(m-1, n-1)")
        assert rec.lhs.func == "D"
        assert rec.lhs.vars == ["m", "n"]
        assert len(rec.rhs) == 3

        shifts = {tuple(t.shifts): t for t in rec.rhs if isinstance(t, FunctionTerm)}
        assert (-1.0, 0.0) in shifts
        assert (0.0, -1.0) in shifts
        assert (-1.0, -1.0) in shifts

    def test_three_variables(self) -> None:
        """T(a, b, c) = T(a-1, b, c) + T(a, b-1, c) + T(a, b, c-1)"""
        rec = parse_recurrence(
            "T(a, b, c) = T(a-1, b, c) + T(a, b-1, c) + T(a, b, c-1)"
        )
        assert rec.lhs.vars == ["a", "b", "c"]
        assert len(rec.rhs) == 3


class TestParseRecurrenceWhitespace:
    """Tests for whitespace handling."""

    def test_no_whitespace(self) -> None:
        """T(n)=T(n-1)+T(n-2)"""
        rec = parse_recurrence("T(n)=T(n-1)+T(n-2)")
        assert rec.lhs.func == "T"
        assert len(rec.rhs) == 2

    def test_extra_whitespace(self) -> None:
        """T( n )  =  T( n - 1 )  +  T( n - 2 )"""
        rec = parse_recurrence("  T( n )  =  T( n - 1 )  +  T( n - 2 )  ")
        assert rec.lhs.func == "T"
        assert len(rec.rhs) == 2

    def test_tabs_and_newlines(self) -> None:
        """T(n)\t=\nT(n-1)"""
        rec = parse_recurrence("T(n)\t=\nT(n-1)")
        assert rec.lhs.func == "T"
        assert len(rec.rhs) == 1


class TestParseRecurrenceUnicode:
    """Tests for Unicode identifiers."""

    def test_greek_function_name(self) -> None:
        """φ(n) = φ(n-1) + φ(n-2)"""
        rec = parse_recurrence("φ(n) = φ(n-1) + φ(n-2)")
        assert rec.lhs.func == "φ"
        assert len(rec.rhs) == 2

    def test_greek_variable_name(self) -> None:
        """T(α) = T(α-1)"""
        rec = parse_recurrence("T(α) = T(α-1)")
        assert rec.lhs.vars == ["α"]

    def test_mixed_unicode(self) -> None:
        """μ(λ) = 2*μ(λ-1)"""
        rec = parse_recurrence("μ(λ) = 2*μ(λ-1)")
        assert rec.lhs.func == "μ"
        assert rec.lhs.vars == ["λ"]


class TestParseRecurrenceTermCombining:
    """Tests for combining like terms."""

    def test_combine_same_shifts(self) -> None:
        """T(n) = T(n-1) + 2*T(n-1) should become 3*T(n-1)"""
        rec = parse_recurrence("T(n) = T(n-1) + 2*T(n-1)")
        assert len(rec.rhs) == 1
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.coef == 3.0
        assert term.shifts == [-1.0]

    def test_combine_constants(self) -> None:
        """T(n) = T(n-1) + 1 + 2 should combine to T(n-1) + 3"""
        rec = parse_recurrence("T(n) = T(n-1) + 1 + 2")
        constants = [t for t in rec.rhs if isinstance(t, ConstantTerm)]
        assert len(constants) == 1
        assert constants[0].coef == 3.0

    def test_cancel_terms(self) -> None:
        """T(n) = T(n-1) + -1*T(n-1) should cancel out"""
        rec = parse_recurrence("T(n) = T(n-1) + -1*T(n-1)")
        functions = [t for t in rec.rhs if isinstance(t, FunctionTerm)]
        assert len(functions) == 0


class TestParseRecurrenceErrors:
    """Tests for error handling."""

    def test_empty_input(self) -> None:
        with pytest.raises(ParseError, match="Empty input"):
            parse_recurrence("")

    def test_whitespace_only(self) -> None:
        with pytest.raises(ParseError, match="Empty input"):
            parse_recurrence("   ")

    def test_no_equals(self) -> None:
        with pytest.raises(ParseError, match="Expected exactly one '='"):
            parse_recurrence("T(n)")

    def test_multiple_equals(self) -> None:
        with pytest.raises(ParseError, match="Expected exactly one '='"):
            parse_recurrence("T(n) = T(n-1) = T(n-2)")

    def test_invalid_lhs_format(self) -> None:
        with pytest.raises(ParseError, match="Invalid left-hand side"):
            parse_recurrence("T = T(n-1)")

    def test_invalid_function_name(self) -> None:
        with pytest.raises(ParseError, match="Invalid function name"):
            parse_recurrence("1T(n) = 1T(n-1)")

    def test_no_arguments(self) -> None:
        with pytest.raises(ParseError, match="No arguments"):
            parse_recurrence("T() = T()")

    def test_invalid_variable_name(self) -> None:
        with pytest.raises(ParseError, match="Invalid variable name"):
            parse_recurrence("T(1) = T(0)")

    def test_duplicate_variable(self) -> None:
        with pytest.raises(ParseError, match="Duplicate variable"):
            parse_recurrence("T(n, n) = T(n-1, n-1)")

    def test_mismatched_function_name(self) -> None:
        with pytest.raises(ParseError, match="different function name"):
            parse_recurrence("T(n) = S(n-1)")

    def test_wrong_arity(self) -> None:
        with pytest.raises(ParseError, match="expected 1"):
            parse_recurrence("T(n) = T(n-1, m-1)")

    def test_invalid_term(self) -> None:
        with pytest.raises(ParseError, match="Invalid term"):
            parse_recurrence("T(n) = foo")

    def test_invalid_argument_in_term(self) -> None:
        with pytest.raises(ParseError, match="Invalid argument"):
            parse_recurrence("T(n) = T(m-1)")

    def test_empty_rhs(self) -> None:
        with pytest.raises(ParseError, match="Empty right-hand side"):
            parse_recurrence("T(n) = ")


class TestParseRecurrenceDecimalCoefficients:
    """Tests for decimal coefficients."""

    def test_decimal_coefficient(self) -> None:
        """T(n) = 1.5*T(n-1)"""
        rec = parse_recurrence("T(n) = 1.5*T(n-1)")
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.coef == 1.5

    def test_negative_coefficient(self) -> None:
        """T(n) = -2*T(n-1)"""
        rec = parse_recurrence("T(n) = -2*T(n-1)")
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.coef == -2.0

    def test_negative_decimal_coefficient(self) -> None:
        """T(n) = -0.5*T(n-1)"""
        rec = parse_recurrence("T(n) = -0.5*T(n-1)")
        term = rec.rhs[0]
        assert isinstance(term, FunctionTerm)
        assert term.coef == -0.5
