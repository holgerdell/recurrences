"""Tests for utility functions."""

import math

from recurrences.utils import format_number, snap_int


class TestSnapInt:
    """Tests for snap_int()."""

    def test_snaps_value_very_close_to_integer(self) -> None:
        assert snap_int(1.9999999) == 2.0
        assert snap_int(2.0000001) == 2.0

    def test_preserves_value_far_from_integer(self) -> None:
        assert snap_int(2.25) == 2.25
        assert snap_int(2.5) == 2.5
        assert snap_int(2.001) == 2.001

    def test_handles_negative_values(self) -> None:
        assert snap_int(-1.9999999) == -2.0
        assert snap_int(-2.0000001) == -2.0
        assert snap_int(-2.25) == -2.25

    def test_handles_zero(self) -> None:
        assert snap_int(0.0) == 0.0
        assert snap_int(0.0000001) == 0.0
        assert snap_int(-0.0000001) == 0.0

    def test_handles_infinity(self) -> None:
        assert snap_int(math.inf) == math.inf
        assert snap_int(-math.inf) == -math.inf

    def test_handles_nan(self) -> None:
        assert math.isnan(snap_int(math.nan))

    def test_custom_ndigits(self) -> None:
        # With default ndigits=6, 2.01 is not snapped
        assert snap_int(2.01) == 2.01
        # With ndigits=1, 2.01 rounds to 2.0
        assert snap_int(2.01, ndigits=1) == 2.0
        # With ndigits=1, 2.06 rounds to 2.1 (not an integer)
        assert snap_int(2.06, ndigits=1) == 2.1


class TestFormatNumber:
    """Tests for format_number()."""

    def test_formats_integer_without_decimal(self) -> None:
        assert format_number(2) == "2"
        assert format_number(2.0) == "2"

    def test_formats_with_decimals(self) -> None:
        assert format_number(2.1) == "2.1"
        assert format_number(2.5) == "2.5"

    def test_rounds_to_specified_digits(self) -> None:
        # Default is 5 digits, rounds up
        assert format_number(2.123456) == "2.12346"
        assert format_number(2.123451) == "2.12346"  # ceil rounds up

    def test_trims_trailing_zeros(self) -> None:
        assert format_number(2.10000) == "2.1"
        assert format_number(2.00000) == "2"

    def test_handles_infinity(self) -> None:
        assert format_number(math.inf) == "inf"
        assert format_number(-math.inf) == "-inf"

    def test_handles_nan(self) -> None:
        assert format_number(math.nan) == "nan"

    def test_custom_digits(self) -> None:
        assert format_number(2.123456, digits=2) == "2.13"
        assert format_number(2.123456, digits=10) == "2.123456"
