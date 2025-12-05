// root-finding.ts
// ======================================================
//   Polynomial definitions + dominant root solver
// ======================================================

/**
 * Product of variables raised to powers, e.g. x^2·y^3
 */
export type Monomial = Record<string, number>

/**
 * A single polynomial term: coefficient * monomial
 */
export interface PolynomialTerm {
	coefficient: number
	monomial: Monomial
}

/**
 * A multivariate polynomial implicitly equal to 0:
 * Σ_i (c_i · ∏_v v^{p_i,v}) = 0
 */
export interface Polynomial {
	terms: PolynomialTerm[]
	variables: string[]
}

/**
 * A system of polynomial equations, all equal to 0
 */
export interface PolynomialSystem {
	polynomials: Polynomial[]
	variables: string[]
}

/**
 * Root: a mapping from variable name → positive real number
 */
export type Root = Record<string, number>

// ======================================================
//   Numeric helpers
// ======================================================

export function snapInt(val: number, eps = 1e-6): number {
	if (!Number.isFinite(val)) return val
	const i = Math.round(val)
	return Math.abs(val - i) < eps ? i : val
}

export function formatNumber(x: number): string {
	if (!Number.isFinite(x)) return String(x)
	const roundedUp = Math.ceil(x * 1e4) / 1e4
	return roundedUp.toFixed(4).replace(/\.?0+$/, "")
}

export function formatAsymptotics(root: Root | null): string {
	if (!root) return ""
	const parts: string[] = []
	for (const [v, val] of Object.entries(root)) {
		parts.push(`${formatNumber(val)}^${v}`)
	}
	return "O(" + parts.join("·") + ")"
}

// ======================================================
//   Core Polynomial Evaluation Utilities
// ======================================================

/**
 * Evaluates a single monomial given variable values.
 */
export function evaluateMonomial(m: Monomial, vars: Root): number {
	let val = 1
	for (const [v, pow] of Object.entries(m)) {
		const rv = vars[v]
		if (!Number.isFinite(rv)) return NaN
		val *= Math.pow(rv, pow)
	}
	return val
}

/**
 * Evaluates the polynomial under a given assignment.
 */
export function evaluatePolynomial(poly: Polynomial, vars: Root): number {
	let sum = 0
	for (const term of poly.terms) {
		const termVal = term.coefficient * evaluateMonomial(term.monomial, vars)
		sum += termVal
	}
	return sum
}

/**
 * Computes the absolute residual for a system under given roots.
 */
export function systemResidual(system: PolynomialSystem, roots: Root): number {
	let maxErr = 0
	for (const poly of system.polynomials) {
		const err = Math.abs(evaluatePolynomial(poly, roots))
		if (err > maxErr) maxErr = err
	}
	return maxErr
}

// ======================================================
//   Numerical Root Solvers
// ======================================================

/**
 * Finds a positive real solution of f(x) = 0 between bounds.
 * Returns null if no root found.
 */
function findPositiveRoot(f: (x: number) => number, loInit = 0.0001, hiInit = 10): number | null {
	let lo = loInit
	let hi = hiInit
	let flo = f(lo)
	let fhi = f(hi)

	// Expand until we detect a sign change or until it's clearly monotonic.
	while (flo * fhi > 0 && hi < 1e6) {
		lo = hi
		hi *= 2
		fhi = f(hi)
	}

	// --- NEW LOGIC: if still same sign, check for monotonic convergence ---
	if (flo * fhi > 0) {
		const fLarge = f(hi * 100)
		// If approaches zero but never crosses, treat as unbounded (Infinity root)
		if (Math.abs(fLarge) < 1e-6 || Math.sign(fLarge) === Math.sign(fhi)) {
			return Infinity
		}
		return null
	}

	// Normal bisection process.
	for (let i = 0; i < 100; i++) {
		const mid = 0.5 * (lo + hi)
		const fm = f(mid)
		if (Math.abs(fm) < 1e-12) return snapInt(mid)
		if (flo * fm < 0) {
			hi = mid
			fhi = fm
		} else {
			lo = mid
			flo = fm
		}
	}

	return snapInt(0.5 * (lo + hi))
}

/**
 * Attempts to solve a 1‑variable polynomial equation for dominant (largest) positive root.
 */
function solve1DPolynomial(poly: Polynomial): number | null {
	if (poly.variables.length !== 1) return null
	const v = poly.variables[0]

	function f(x: number): number {
		const vals: Root = { [v]: x }
		return evaluatePolynomial(poly, vals)
	}
	return findPositiveRoot(f, 0.0001, 10)
}

/**
 * Attempts to solve a 2‑variable polynomial equation assuming symmetric behavior (x = y)
 * or by fixing one variable and solving the other.
 */
function solve2DPolynomial(poly: Polynomial): Root | null {
	if (poly.variables.length !== 2) return null
	const [v1, v2] = poly.variables

	function f(x: number, y: number): number {
		const vals: Root = { [v1]: x, [v2]: y }
		return evaluatePolynomial(poly, vals)
	}

	// symmetric x=y case
	const sym = findPositiveRoot((x) => f(x, x), 1.01, 10)
	if (sym !== null) return { [v1]: sym, [v2]: sym }

	// fix x and solve y
	for (let x = 1.1; x <= 5; x += 0.1) {
		const y = findPositiveRoot((y) => f(x, y), 1.01, 10)
		if (y !== null) return { [v1]: snapInt(x), [v2]: snapInt(y) }
	}
	// fix y and solve x
	for (let y = 1.1; y <= 5; y += 0.1) {
		const x = findPositiveRoot((x) => f(x, y), 1.01, 10)
		if (x !== null) return { [v1]: snapInt(x), [v2]: snapInt(y) }
	}
	return null
}

// ======================================================
//   Dominant Root Finder for a System
// ======================================================

/**
 * Attempts to find dominant (largest positive real) roots satisfying the given polynomial system.
 * Performs a single consistency check at the end and returns O(1) for constant systems.
 */
export function dominantRoot(system: PolynomialSystem, ACCEPTABLE_ERROR = 1e-8): Root | null {
	// --- Empty or constant system → O(1) case ---
	if (!system.polynomials.length) {
		const roots: Root = {}
		for (const v of system.variables) roots[v] = 1
		return roots
	}

	// Detect if all polynomials are constant (no variables appear)
	const allConstant = system.polynomials.every((poly) =>
		poly.terms.every((t) => Object.keys(t.monomial).length === 0)
	)
	if (allConstant) {
		const roots: Root = {}
		for (const v of system.variables) roots[v] = 1
		return roots
	}

	// --- Normal root solving ---
	const sortedPolys = [...system.polynomials].sort(
		(a, b) => a.variables.length - b.variables.length
	)

	const roots: Root = {}

	for (const poly of sortedPolys) {
		const unknowns = poly.variables.filter((v) => !(v in roots))
		const knownVars = poly.variables.filter((v) => v in roots)

		// --- Single‑variable case ---
		if (poly.variables.length === 1 && unknowns.length === 1) {
			const v = poly.variables[0]
			const r = solve1DPolynomial(poly)
			if (r === null) return null
			roots[v] = r
			continue
		}

		// --- Some variables known, one unknown ---
		if (knownVars.length > 0 && unknowns.length === 1) {
			const u = unknowns[0]
			const f = (x: number): number => {
				const vals: Root = { ...roots, [u]: x }
				return evaluatePolynomial(poly, vals)
			}
			const val = findPositiveRoot(f, 0.0001, 10)
			if (val === null) return null
			roots[u] = val
			continue
		}

		// --- Unconstrained 2D case ---
		if (poly.variables.length === 2 && unknowns.length === 2) {
			const res = solve2DPolynomial(poly)
			if (!res) return null
			Object.assign(roots, res)
			continue
		}

		// --- Higher‑dimensional fallback ---
		if (unknowns.length > 0) {
			const tempRoots = { ...roots }
			for (let i = 0; i < unknowns.length - 1; i++) tempRoots[unknowns[i]] = 1
			const lastVar = unknowns[unknowns.length - 1]
			const f = (x: number): number => {
				const vals = { ...tempRoots, [lastVar]: x }
				return evaluatePolynomial(poly, vals)
			}
			const val = findPositiveRoot(f, 0.0001, 10)
			if (val === null) return null
			tempRoots[lastVar] = val
			Object.assign(roots, tempRoots)
		}
	}

	// --- Final overall verification ---
	const systemErr = systemResidual(system, roots)
	if (systemErr > ACCEPTABLE_ERROR) return null

	// If solver somehow found no roots but we have variables, default to 1 as well
	if (!Object.keys(roots).length && system.variables.length) {
		system.variables.forEach((v) => (roots[v] = 1))
	}

	return Object.keys(roots).length ? roots : null
}
