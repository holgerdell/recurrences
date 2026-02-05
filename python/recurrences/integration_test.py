"""Integration tests for the recurrences package.

These tests exercise the full pipeline: string → parse → solve → format.
"""

import json
import math
import subprocess
import sys

from solve_recurrence import main

from . import (format_asymptotics, format_recurrence, parse_recurrence,
               solve_recurrence)


class TestEndToEndPipeline:
    """End-to-end tests: string → parse → solve → format."""

    def test_fibonacci(self) -> None:
        """Fibonacci sequence: T(n) = T(n-1) + T(n-2)."""
        text = "T(n) = T(n-1) + T(n-2)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)

        phi = (1 + math.sqrt(5)) / 2
        assert abs(root - phi) < 1e-5
        assert result.startswith("O(1.618")
        assert "^n)" in result

    def test_tribonacci(self) -> None:
        """Tribonacci sequence: T(n) = T(n-1) + T(n-2) + T(n-3)."""
        text = "T(n) = T(n-1) + T(n-2) + T(n-3)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)

        assert abs(root - 1.8392867552141612) < 1e-5
        assert result.startswith("O(1.839")

    def test_geometric_doubling(self) -> None:
        """Geometric doubling: T(n) = 2*T(n-1)."""
        text = "T(n) = 2*T(n-1)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)

        assert root == 2.0
        assert result == "O(2^n)"

    def test_geometric_tripling(self) -> None:
        """Geometric tripling: T(n) = 3*T(n-1)."""
        text = "T(n) = 3*T(n-1)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)

        assert root == 3.0
        assert result == "O(3^n)"

    def test_linear(self) -> None:
        """Linear recurrence: T(n) = T(n-1)."""
        text = "T(n) = T(n-1)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)

        assert root == 1.0
        assert result == "O(1)"

    def test_constant(self) -> None:
        """Constant recurrence: T(n) = 5."""
        text = "T(n) = 5"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)

        assert root == 1.0
        assert result == "O(1)"


class TestRoundTrip:
    """Round-trip tests: parse → format → parse → solve."""

    def test_roundtrip_fibonacci(self) -> None:
        """Fibonacci round-trips with same solution."""
        original = "T(n) = T(n-1) + T(n-2)"

        rec1 = parse_recurrence(original)
        root1 = solve_recurrence(rec1)

        formatted = format_recurrence(rec1)
        rec2 = parse_recurrence(formatted)
        root2 = solve_recurrence(rec2)

        assert abs(root1 - root2) < 1e-9

    def test_roundtrip_with_coefficients(self) -> None:
        """Coefficients round-trip correctly."""
        original = "T(n) = 2*T(n-1) + 3*T(n-2)"

        rec1 = parse_recurrence(original)
        root1 = solve_recurrence(rec1)

        formatted = format_recurrence(rec1)
        rec2 = parse_recurrence(formatted)
        root2 = solve_recurrence(rec2)

        assert abs(root1 - root2) < 1e-9


class TestUnicodeSupport:
    """Tests for Unicode identifier support."""

    def test_greek_function_name(self) -> None:
        """Greek function name works end-to-end."""
        text = "φ(n) = φ(n-1) + φ(n-2)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)

        phi = (1 + math.sqrt(5)) / 2
        assert abs(root - phi) < 1e-5
        assert "^n)" in result

    def test_greek_variable_name(self) -> None:
        """Greek variable name works end-to-end."""
        text = "T(α) = 2*T(α-1)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)
        result = format_asymptotics(rec, root)

        assert root == 2.0
        assert "^α)" in result


class TestCLI:
    """Tests for the command-line interface."""

    def test_cli_basic(self) -> None:
        """CLI returns success for valid input."""
        exit_code = main(["T(n) = T(n-1) + T(n-2)"])
        assert exit_code == 0

    def test_cli_verbose(self) -> None:
        """CLI verbose mode returns success."""
        exit_code = main(["T(n) = 2*T(n-1)", "-v"])
        assert exit_code == 0

    def test_cli_json(self) -> None:
        """CLI JSON mode returns success."""
        exit_code = main(["T(n) = T(n-1)", "--json"])
        assert exit_code == 0

    def test_cli_invalid_input(self) -> None:
        """CLI returns error for invalid input."""
        exit_code = main(["invalid"])
        assert exit_code == 1

    def test_cli_empty_input(self) -> None:
        """CLI returns error for empty input."""
        exit_code = main([""])
        assert exit_code == 1


class TestCLISubprocess:
    """Tests for CLI via subprocess (true integration tests)."""

    def test_subprocess_fibonacci(self) -> None:
        """CLI via subprocess solves Fibonacci."""
        result = subprocess.run(
            [sys.executable, "-m", "recurrences", "T(n) = T(n-1) + T(n-2)"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "O(1.618" in result.stdout

    def test_subprocess_json(self) -> None:
        """CLI via subprocess outputs valid JSON."""
        result = subprocess.run(
            [sys.executable, "-m", "recurrences", "T(n) = 2*T(n-1)", "--json"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        data = json.loads(result.stdout)
        assert data["ok"] is True
        assert data["root"]["n"] == 2.0
        assert data["asymptotics"] == "O(2^n)"

    def test_subprocess_error(self) -> None:
        """CLI via subprocess handles errors."""
        result = subprocess.run(
            [sys.executable, "-m", "recurrences", "invalid"],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 1
        assert "Error" in result.stderr

    def test_subprocess_stdin(self) -> None:
        """CLI via subprocess reads from stdin."""
        result = subprocess.run(
            [sys.executable, "-m", "recurrences"],
            input="T(n) = 3*T(n-1)",
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        assert "O(3^n)" in result.stdout


class TestEdgeCases:
    """Edge case tests."""

    def test_large_shift(self) -> None:
        """Large shift values work correctly."""
        text = "T(n) = T(n-100)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)

        assert root == 1.0

    def test_decimal_coefficient(self) -> None:
        """Decimal coefficients work correctly."""
        text = "T(n) = 1.5*T(n-1) + 0.5*T(n-2)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)

        # Should find a valid root > 1
        assert root > 1.0

    def test_many_terms(self) -> None:
        """Many terms work correctly."""
        text = "T(n) = T(n-1) + T(n-2) + T(n-3) + T(n-4) + T(n-5)"
        rec = parse_recurrence(text)
        root = solve_recurrence(rec)

        # Should find a valid root > 1 (approaches 2 as terms increase)
        assert 1.9 < root < 2.0

    def test_whitespace_variations(self) -> None:
        """Various whitespace formats parse correctly."""
        texts = [
            "T(n)=T(n-1)+T(n-2)",
            "T(n) = T(n-1) + T(n-2)",
            "  T( n )  =  T( n - 1 )  +  T( n - 2 )  ",
            "T(n)\t=\tT(n-1)\t+\tT(n-2)",
        ]
        roots = []
        for text in texts:
            rec = parse_recurrence(text)
            root = solve_recurrence(rec)
            roots.append(root)

        # All should give the same result
        for r in roots[1:]:
            assert abs(r - roots[0]) < 1e-9
