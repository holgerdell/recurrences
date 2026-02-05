"""
optimize.py
------------
Optimize weights for WIS (Weighted Independent Set) branching recurrences.

This script loads a JSON file describing branching situations and rules, then uses
numerical optimization to find the best non-increasing weight vector that minimizes
the worst-case root of a recurrence relation across all situations. The optimization
is performed using scipy.optimize with multiple random restarts for robustness.

Typical usage:
    python optimize.py wis.json [--method Powell] [--restarts 10] [--seed 1234] ...

The script prints the best solution found, verifies it, and reports any issues.
"""

import argparse
import json
import math
from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np
from scipy.optimize import minimize, root_scalar


PENALTY = 1e6


@dataclass(frozen=True)
class RuleRecord:
    """
    Represents a single branching rule and its associated branch-delta vectors.

    Attributes:
        situation_id: Identifier for the situation this rule belongs to.
        signature: Human-readable signature for the situation.
        rule_id: Unique identifier for the rule.
        branch_delta_matrix: Matrix of branch-delta vectors (shape: (num_branches, d)).
    """

    situation_id: int
    signature: str
    rule_id: int
    branch_delta_matrix: np.ndarray  # shape: (num_branches, d)


@dataclass(frozen=True)
class SituationRecord:
    """
    Represents a single situation, which may contain multiple rules.

    Attributes:
        situation_id: Unique identifier for the situation.
        signature: Human-readable signature for the situation.
        rules: List of rules associated with this situation.
    """

    situation_id: int
    signature: str
    rules: list[RuleRecord]


def _load_json(path: str) -> Any:
    """
    Load and parse a JSON file from the given path.

    Args:
        path: Path to the JSON file.

    Returns:
        Parsed JSON data.
    """
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _extract_feature_keys(data: list[dict[str, Any]]) -> list[str]:
    """
    Extract feature keys from the first branchDeltas entry in the JSON data.

    Args:
        data: List of situation dictionaries from JSON.

    Returns:
        List of feature key names, preserving JSON key order.
    """
    if not data:
        raise ValueError("JSON data is empty")
    first = data[0]
    if "rules" not in first or not first["rules"]:
        raise ValueError("First situation has no rules")
    first_rule = first["rules"][0]
    branch_deltas = first_rule.get("branchDeltas")
    if not isinstance(branch_deltas, list) or not branch_deltas:
        raise ValueError("First rule has no branchDeltas")
    first_delta = branch_deltas[0]
    if not isinstance(first_delta, dict) or not first_delta:
        raise ValueError("First branchDeltas entry is not an object")
    # Preserve JSON key order.
    return list(first_delta.keys())


def _build_situations(
    data: list[dict[str, Any]], feature_keys: list[str]
) -> list[SituationRecord]:
    """
    Construct SituationRecord objects from JSON data and feature keys.

    Args:
        data: List of situation dictionaries from JSON.
        feature_keys: List of feature key names.

    Returns:
        List of constructed SituationRecord objects.
    """
    situations: list[SituationRecord] = []
    d = len(feature_keys)
    for situation in data:
        situation_id = int(situation.get("situationId", 0))
        signature = str(situation.get("signature", f"#{situation_id}"))
        situation_rules: list[RuleRecord] = []
        for rule in situation.get("rules", []):
            rule_id = int(rule.get("ruleId", 0))
            branch_deltas = rule.get("branchDeltas", [])
            if not branch_deltas:
                continue
            mat = np.zeros((len(branch_deltas), d), dtype=float)
            for bi, bd in enumerate(branch_deltas):
                for fi, key in enumerate(feature_keys):
                    mat[bi, fi] = float(bd.get(key, 0.0))
            situation_rules.append(
                RuleRecord(
                    situation_id=situation_id,
                    signature=signature,
                    rule_id=rule_id,
                    branch_delta_matrix=mat,
                )
            )
        situations.append(
            SituationRecord(
                situation_id=situation_id, signature=signature, rules=situation_rules
            )
        )
    return situations


def eval_poly_and_derivative(
    x: float, d: list[float] | np.ndarray
) -> tuple[float, float]:
    """
    Evaluate the function g(x) = sum_j x^(-d[j]) - 1 and its derivative g'(x).

    Uses log/exp for numerical stability: x^(-a) = exp(-a * log(x)).

    Args:
        x: The value at which to evaluate the function and its derivative.
        d: Exponents for each term in the sum.

    Returns:
        Tuple of (g(x), g'(x)).
    """
    if x <= 0:
        return float("inf"), float("inf")
    d_arr = np.asarray(d, dtype=float)
    lx = np.log(x)
    with np.errstate(over="ignore", under="ignore", invalid="ignore"):
        exp_terms = np.exp(-d_arr * lx)
        s = float(np.sum(exp_terms))
        w = float(np.sum(d_arr * exp_terms))
    g = s - 1.0
    gp = -w / x
    if not np.isfinite(g) or not np.isfinite(gp):
        return float("inf"), float("inf")
    return g, gp


num_root_calls = 0


def root(deltas: Iterable[float], *, x0: float | None = None) -> float:
    """
    Compute the unique solution to sum_j r^(-deltas[j]) - 1 = 0 for r >= 1.

    Uses analytic bracketing and root finding. If no root can be bracketed on [1, +inf),
    returns a large finite penalty.

    Args:
        deltas: Iterable of delta values for the exponents.
        x0: Optional initial guess for the root.

    Returns:
        The computed root, or a large penalty if no root exists.
    """
    global num_root_calls
    num_root_calls += 1
    d = np.asarray(list(deltas), dtype=float)
    m = d.size
    if m == 0:
        return float("inf")
    if m == 1:
        # x^{-a} = 1 has the unique solution x=1 for any real a.
        return 1.0

    # For m>=2: if any delta <= 0, then g(x) does not go to -1 as x->inf
    # (it can stay >=0 or diverge), so there is no root >= 1.
    min_delta = float(np.min(d))
    if min_delta <= 0.0:
        return PENALTY

    def g(x: float) -> float:
        return eval_poly_and_derivative(x, d)[0]

    # Analytic bracket: choose b so that g(b) <= 0.
    # Since sum x^{-d_j} <= m * x^{-min_delta}, it suffices that m*b^{-min_delta} <= 1.
    # => b >= m^{1/min_delta}.
    log_m = math.log(m)
    # Compute b in log-space to avoid OverflowError when min_delta is tiny.
    # We cap b to avoid extreme values; monotonicity still guarantees a root exists.
    b_cap = 1e12
    exponent = log_m / min_delta
    log_cap = math.log(b_cap / 1.01)
    if not math.isfinite(exponent) or exponent >= log_cap:
        b = b_cap
    else:
        b = max(2.0, math.exp(exponent) * 1.01)  # small slack for FP error
    fb = g(b)
    # In rare cases (very small min_delta or FP issues), fall back to a short expansion.
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

    # Fast path: try Newton from cached root (if provided) inside the bracket.
    if x0 is not None and np.isfinite(x0):
        x0c = float(np.clip(x0, 1.0, b))
        try:
            sol_n = root_scalar(
                lambda x: eval_poly_and_derivative(x, d)[0],
                fprime=lambda x: eval_poly_and_derivative(x, d)[1],
                method="newton",
                x0=x0c,
                maxiter=20,
            )
            if sol_n.converged and sol_n.root >= 1.0 and sol_n.root <= b * 1.000001:
                return float(sol_n.root)
        except Exception:
            pass

    # Robust path.
    sol = root_scalar(g, bracket=(1.0, b), method="brentq")
    if not sol.converged:
        return PENALTY
    return float(sol.root)


def main() -> None:
    """
    Main entry point for the optimizer script.

    Loads JSON data, sets up the optimization problem, runs multiple restarts,
    and prints the best solution found along with verification.
    """
    global num_root_calls
    parser = argparse.ArgumentParser(
        description="Optimize weights for WIS branching recurrences"
    )
    parser.add_argument(
        "json_path", nargs="?", default="wis.json", help="Path to exported JSON"
    )
    parser.add_argument(
        "--method",
        default="Powell",
        help="scipy.optimize.minimize method (Powell recommended: objective is a max over roots)",
    )
    parser.add_argument(
        "--restarts", type=int, default=10, help="Number of random restarts"
    )
    parser.add_argument("--seed", type=int, default=9094416)

    # Effort / tolerance knobs
    parser.add_argument(
        "--maxiter",
        type=int,
        default=50000,
        help="Max iterations per restart (method-dependent; Powell uses this)",
    )
    parser.add_argument(
        "--maxfev",
        type=int,
        default=1000000,
        help="Max function evals per restart (method-dependent; Powell uses this)",
    )
    parser.add_argument(
        "--xtol",
        type=float,
        default=1e-5,
        help="Parameter tolerance (Powell: xtol)",
    )
    parser.add_argument(
        "--ftol",
        type=float,
        default=1e-6,
        help="Objective tolerance (Powell: ftol)",
    )
    args = parser.parse_args()

    data = _load_json(args.json_path)
    if not isinstance(data, list):
        raise ValueError("Expected top-level JSON array")

    feature_keys = _extract_feature_keys(data)
    dim = len(feature_keys)
    situations = _build_situations(data, feature_keys)
    rule_count = sum(len(s.rules) for s in situations)
    if rule_count == 0:
        raise ValueError("No rules found in JSON")

    print(f"Loaded {len(data)} situations, {rule_count} rules")
    print(f"Dimension d = {dim}")
    print("Features:")
    for i, k in enumerate(feature_keys):
        print(f"  x[{i}] = {k}")

    # Cache last root per rule to seed the next root solve.
    root_cache: dict[tuple[int, int], float] = {}

    # We know the optimum has non-increasing weights x[0] >= x[1] >= ... >= x[d-1].
    # Enforce this by optimizing over ratio-parameters p in [0,1]^d and mapping
    # to x via cumulative products:
    #   x[0] = p[0]
    #   x[i] = x[i-1] * p[i]
    # This parameterization represents exactly all non-increasing vectors in [0,1]^d.
    def _params_to_x(p: np.ndarray) -> np.ndarray:
        """
        Convert parameter vector p in [0,1]^d to a non-increasing weight vector x.

        Args:
            p: Parameter vector.

        Returns:
            Non-increasing weight vector x.
        """
        p = np.clip(np.asarray(p, dtype=float), 0.0, 1.0)
        return np.cumprod(p)

    def _x_to_params(x: np.ndarray) -> np.ndarray:
        """
        Convert a non-increasing weight vector x to parameter vector p in [0,1]^d.

        Args:
            x: Weight vector.

        Returns:
            Parameter vector p.
        """
        x = np.clip(np.asarray(x, dtype=float), 0.0, 1.0)
        p = np.empty_like(x)
        if x.size == 0:
            return p
        p[0] = x[0]
        prev = x[0]
        for i in range(1, x.size):
            cur = x[i]
            if prev <= 0.0:
                p[i] = 0.0
            else:
                p[i] = cur / prev
            prev = cur
        return np.clip(p, 0.0, 1.0)

    def _rule_value(x: np.ndarray, rule: RuleRecord) -> float:
        """
        Compute the root value for a given rule and weight vector x, using caching.

        Args:
            x: Weight vector.
            rule: Rule to evaluate.

        Returns:
            Root value for the rule.
        """
        deltas = rule.branch_delta_matrix @ x
        cache_key = (rule.situation_id, rule.rule_id)
        val = root(deltas, x0=root_cache.get(cache_key))
        if not np.isfinite(val):
            return PENALTY
        val_f = float(val)
        if val_f < PENALTY:
            root_cache[cache_key] = val_f
        return val_f

    def f_i(x: np.ndarray, i: int) -> float:
        """
        For the i-th situation, return the minimum root value over all its rules.

        Args:
            x: Weight vector.
            i: Situation index.

        Returns:
            Minimum root value for the situation.
        """
        sit = situations[i]
        if not sit.rules:
            return PENALTY
        best = min(_rule_value(x, r) for r in sit.rules)
        return best

    def f_x(x: np.ndarray) -> float:
        """
        Compute the maximum root value over all situations for a given weight vector x.

        Args:
            x: Weight vector.

        Returns:
            Maximum root value across all situations.
        """
        x = np.clip(np.asarray(x, dtype=float), 0.0, 1.0)
        worst = 1.0
        for i in range(len(situations)):
            v = f_i(x, i)
            if v > worst:
                worst = v
                if worst >= PENALTY:
                    return PENALTY
        return worst

    def f(p: np.ndarray) -> float:
        """
        Objective function in parameter space.

        Args:
            p: Parameter vector.

        Returns:
            Objective value for the given parameters.
        """
        return f_x(_params_to_x(p))

    bounds = [(0.0, 1.0)] * dim

    rng = np.random.default_rng(args.seed)

    # More diverse starting points (in x-space), then convert to parameter space.
    x0s: list[np.ndarray] = []

    # if dim >= 4:
    #     x0_hardcoded = np.ones(dim, dtype=float)
    #     x0_hardcoded[-4:] = np.array(
    #         [
    #             1,
    #             0.9815633146766818,
    #             0.8542797086466565,
    #             0.3524771952368303,
    #         ],
    #         dtype=float,
    #     )
    #     x0s.append(x0_hardcoded)

    x0s.extend(
        [
            np.full(dim, 0.5, dtype=float),
            np.zeros(dim, dtype=float),
            np.ones(dim, dtype=float),
        ]
    )

    p0s: list[np.ndarray] = [_x_to_params(x0) for x0 in x0s]
    for _ in range(max(0, args.restarts - len(p0s))):
        p0s.append(rng.random(dim))

    best_res = None
    for run_idx, p0 in enumerate(p0s):
        print(f"\nRun {run_idx + 1}/{len(p0s)}: minimizing…", end="")
        res = minimize(
            f,
            p0,
            method=args.method,
            bounds=bounds,
            options={
                "maxiter": args.maxiter,
                "maxfev": args.maxfev,
                "xtol": args.xtol,
                "ftol": args.ftol,
            },
        )
        if best_res is None or res.fun < best_res.fun:
            print(f" found value={res.fun}", end="")
            best_res = res
        print(f"  --- {num_root_calls} calls to f(x)")
        num_root_calls = 0

    assert best_res is not None
    p_best = np.clip(best_res.x, 0.0, 1.0)
    x_best = _params_to_x(p_best)
    val_best = float(best_res.fun)

    # Identify the worst (maximizing) situation at the optimum.
    per_situation = np.array(
        [f_i(x_best, i) for i in range(len(situations))], dtype=float
    )
    worst_situation_idx = int(np.nanargmax(per_situation))
    worst_situation = situations[worst_situation_idx]
    best_rule_val = PENALTY
    for r in worst_situation.rules:
        v = _rule_value(x_best, r)
        if v < best_rule_val:
            best_rule_val = v

    print("\n=== Result ===")
    print(f"Objective f(x) = {val_best}")
    print("x (weights):")
    for i, k in enumerate(feature_keys):
        print(f"  {k}: {x_best[i]}")
    print("Worst situation at x:")
    print(
        f"  {worst_situation.signature}  --- value (raw): {per_situation[worst_situation_idx]}"
    )

    print()
    print("Rounding to 6 decimal places and verifying solution...")
    scale = 1e6
    worst_val: float = per_situation[worst_situation_idx]
    rounded_up_from_worst: float = (
        math.ceil(np.nextafter(worst_val, np.inf) * scale) / scale
    )

    # Full verification: for every situation, evaluate every rule at the rounded bound
    # and check that at least one rule satisfies g(r) <= 0.
    # This avoids re-running the expensive optimization objective.
    failed: list[tuple[int, str, float]] = []
    worst_best_g = -float("inf")
    for si, sit in enumerate(situations):
        best_g = float("inf")
        for r in sit.rules:
            deltas = r.branch_delta_matrix @ x_best
            g_at_bound, _ = eval_poly_and_derivative(rounded_up_from_worst, deltas)
            if g_at_bound < best_g:
                best_g = float(g_at_bound)
        if not np.isfinite(best_g) or best_g > 0.0:
            failed.append((si, sit.signature, best_g))
        if best_g > worst_best_g:
            worst_best_g = best_g

    if not failed:
        print(
            f"  Verification success: for every situation, min_rule g({rounded_up_from_worst}) <= 0."
        )
        print(f"  Worst (largest) min_rule g at bound: {worst_best_g}")
    else:
        print(
            f"  WARNING: Verification failed for {len(failed)}/{len(situations)} situations at bound {rounded_up_from_worst}."
        )
        # Print a small sample to help diagnose.
        for si, sig, best_g in failed[:10]:
            print(f"    situation[{si}] {sig}: min_rule g(bound) = {best_g}")


if __name__ == "__main__":
    main()
