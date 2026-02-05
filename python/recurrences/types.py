"""
Type definitions for recurrence relations.

This module defines the core data structures used throughout the recurrences package:
- FunctionTerm: A function call with coefficient (e.g., 2*T(n-1))
- ConstantTerm: A constant value in a recurrence
- Recurrence: A complete recurrence relation (lhs = sum of rhs terms)
    - Root: The solution type (float for the dominant root)
"""

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass
class FunctionTerm:
    """A function call with coefficient: coef * func(vars with shifts).

    Example: 2*T(n-1, m) has:
        coef = 2
        func = "T"
        vars = ["n", "m"]
        shifts = [-1, 0]

    The shifts list is parallel to vars (same length, same order).
    """

    coef: float
    func: str
    vars: list[str]
    shifts: list[float]

    def __post_init__(self) -> None:
        if len(self.vars) != len(self.shifts):
            raise ValueError(
                f"vars and shifts must have same length: "
                f"{len(self.vars)} vs {len(self.shifts)}"
            )


@dataclass
class ConstantTerm:
    """A constant value in a recurrence RHS.

    Example: In T(n) = T(n-1) + 5, the constant term has coef = 5.
    """

    coef: float


# Union type for terms on the RHS of a recurrence
Term = FunctionTerm | ConstantTerm


@dataclass
class Recurrence:
    """A recurrence relation: lhs = sum(rhs).

    Example: T(n) = 2*T(n-1) + T(n-2)
        lhs = FunctionTerm(coef=1, func="T", vars=["n"], shifts=[0])
        rhs = [
            FunctionTerm(coef=2, func="T", vars=["n"], shifts=[-1]),
            FunctionTerm(coef=1, func="T", vars=["n"], shifts=[-2]),
        ]

    The lhs always has coef=1 and all shifts=0 (it defines the function signature).
    """

    lhs: FunctionTerm
    rhs: Sequence[Term]

    def __post_init__(self) -> None:
        if self.lhs.coef != 1:
            raise ValueError(f"lhs.coef must be 1, got {self.lhs.coef}")
        if any(s != 0 for s in self.lhs.shifts):
            raise ValueError(f"lhs.shifts must all be 0, got {self.lhs.shifts}")


# Result of solving a recurrence - dominant root
Root = float
