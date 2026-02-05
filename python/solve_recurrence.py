#!/usr/bin/env python3
"""
Command-line interface for the recurrences package.

Usage:
    # Solve a recurrence from command line argument
    python solve_recurrence.py "T(n) = T(n-1) + T(n-2)"

    # Solve from a file
    python solve_recurrence.py input.txt

    # Solve from stdin
    echo "T(n) = 2*T(n-1)" | python solve_recurrence.py

    # JSON output
    python solve_recurrence.py "T(n) = T(n-1) + T(n-2)" --json

    # Verbose output
    python solve_recurrence.py "T(n) = T(n-1) + T(n-2)" -v
"""

import argparse
import json
import math
import sys
from pathlib import Path

from recurrences.formatter import format_asymptotics, format_recurrence
from recurrences.parser import ParseError, parse_recurrence
from recurrences.solver import PENALTY, solve_recurrence
from recurrences.types import Recurrence


def main(argv: list[str] | None = None) -> int:
    """Main entry point for the CLI.

    Args:
        argv: Command-line arguments (defaults to sys.argv[1:]).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    parser = argparse.ArgumentParser(
        prog="recurrences",
        description="Parse and solve recurrence relations to find asymptotic growth rates.",
        epilog="Examples:\n"
        '  %(prog)s "T(n) = T(n-1) + T(n-2)"\n'
        "  %(prog)s input.txt\n"
        '  echo "T(n) = 2*T(n-1)" | %(prog)s',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="Recurrence relation string or path to file containing one. "
        "If omitted, reads from stdin.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Show verbose output including parsed recurrence.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON.",
    )

    args = parser.parse_args(argv)

    # Get input text
    try:
        text = _get_input(args.input)
    except FileNotFoundError as e:
        _error(f"File not found: {e.filename}", args.json)
        return 1
    except Exception as e:
        _error(str(e), args.json)
        return 1

    if not text.strip():
        _error("Empty input", args.json)
        return 1

    # Parse the recurrence
    try:
        rec = parse_recurrence(text)
    except ParseError as e:
        _error(f"Parse error: {e}", args.json)
        return 1

    # Solve the recurrence
    try:
        root = solve_recurrence(rec)
    except ValueError as e:
        _error(f"Solver error: {e}", args.json)
        return 1

    # Format output
    if args.json:
        _output_json(rec, root, args.verbose)
    else:
        _output_text(rec, root, args.verbose)

    return 0


def _get_input(input_arg: str | None) -> str:
    """Get input text from argument, file, or stdin.

    Args:
        input_arg: The input argument (string, file path, or None for stdin).

    Returns:
        The input text.
    """
    if input_arg is None:
        # Read from stdin
        if sys.stdin.isatty():
            # Interactive mode - prompt for input
            print("Enter recurrence relation (Ctrl+D to finish):", file=sys.stderr)
        return sys.stdin.read()

    # Check if it's a file path
    path = Path(input_arg)
    if path.exists() and path.is_file():
        return path.read_text()

    # Treat as direct recurrence string
    return input_arg


def _error(message: str, as_json: bool) -> None:
    """Output an error message.

    Args:
        message: The error message.
        as_json: Whether to output as JSON.
    """
    if as_json:
        print(json.dumps({"ok": False, "error": message}))
    else:
        print(f"Error: {message}", file=sys.stderr)


def _output_json(rec: Recurrence, root: float, verbose: bool) -> None:
    """Output results as JSON.

    Args:
        rec: The parsed recurrence.
        root: The solved root.
        verbose: Whether to include verbose information.
    """

    # Check for special cases
    is_divergent = math.isinf(root)
    is_invalid = root >= PENALTY

    result: dict[str, object] = {"ok": True}

    if is_divergent:
        result["divergent"] = True
    elif is_invalid:
        result["ok"] = False
        result["error"] = "No valid root found (non-positive shifts)"
    else:
        result["divergent"] = False
        result["root"] = {rec.lhs.vars[0]: root}
        result["asymptotics"] = format_asymptotics(rec, root)

    if verbose:
        result["recurrence"] = format_recurrence(rec)
        result["function"] = rec.lhs.func
        result["variables"] = rec.lhs.vars

    print(json.dumps(result, indent=2))


def _output_text(rec: Recurrence, root: float, verbose: bool) -> None:
    """Output results as human-readable text.

    Args:
        rec: The parsed recurrence.
        root: The solved root.
        verbose: Whether to include verbose information.
    """

    if verbose:
        print(f"Recurrence: {format_recurrence(rec)}")
        print(f"Function:   {rec.lhs.func}")
        print(f"Variable:   {rec.lhs.vars[0]}")

    # Check for special cases
    is_divergent = math.isinf(root)
    is_invalid = root >= PENALTY

    if is_divergent:
        print("Result: Divergent (infinite growth)")
    elif is_invalid:
        print("Result: No valid root (check for non-positive shifts)")
    else:
        if verbose:
            print(f"Root:       {root}")
            print(f"Asymptotics: {format_asymptotics(rec, root)}")
        else:
            print(format_asymptotics(rec, root))


if __name__ == "__main__":
    sys.exit(main())
