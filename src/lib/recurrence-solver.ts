// recurrenceSolver.ts
// ======================================================
// Recurrence parser + formatter + link to polynomial solver
// ======================================================

import { getGLPK } from "$lib/glpk-instance" // or the exact path to that build
import type { GLPK } from "glpk.js"
import {
	type Monomial,
	type Polynomial,
	type PolynomialTerm,
	type PolynomialSystem,
	type Root,
	dominantRoot,
	formatAsymptotics
} from "./root-finding"

// ======================================================
//   Recurrence type definitions
// ======================================================

export type Term =
	| {
			type: "function"
			coef: number
			func: string
			vars: string[]
			shifts: Record<string, number>
	  }
	| { type: "constant"; coef: number }

export type TermBasedRecurrence = {
	func: string
	vars: string[]
	terms: Term[]
	fixedArgs?: (string | number)[]
}

/** A family of related recurrence relations for the same function. */
export type Recurrence = TermBasedRecurrence[]

export type ParseResult = { ok: true; recurrences: Recurrence } | { ok: false; error: string }

export const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/

// ======================================================
//   Utility functions (from previous version)
// ======================================================

/**
 * Snap a numeric value to the nearest integer when within a small epsilon.
 * Useful to normalize values that are essentially integers due to rounding.
 * @param val Value to snap
 * @param eps Maximum distance from an integer to allow snapping
 * @returns Snapped value if close enough, otherwise the original value
 */
export function snapIntVal(val: number, eps = 1e-6): number {
	if (!Number.isFinite(val)) return val
	const i = Math.round(val)
	return Math.abs(val - i) < eps ? i : val
}

// ======================================================
//   Parser
// ======================================================

/**
 * Parse one or more recurrence relations into an internal representation.
 * Enforces a single function name and consistent arity across all lines.
 * Supports positive and negative shifts (e.g., n-2, n+1) and numeric fixed arguments.
 * Returns a structured error when the input is invalid.
 * @param lines Source lines containing recurrence equations
 * @returns Result with parsed recurrences or an error message
 */
export function parseRecurrences(lines: string[]): ParseResult {
	const recurrences: Recurrence = []
	let globalFunc: string | null = null
	let globalArgCount: number | null = null

	for (const line of lines) {
		const cleaned = line.replace(/\s+/g, "")
		if (!cleaned) continue
		const parts = cleaned.split("=")
		if (parts.length !== 2) return { ok: false, error: `Each line must contain one '=': ${line}` }

		const [lhs, rhs] = parts
		const lhsMatch = /^([^(]+)\(([^)]*)\)$/.exec(lhs)
		if (!lhsMatch) return { ok: false, error: `Invalid left-hand side: ${lhs}` }

		const func = lhsMatch[1]
		const rawArgs = lhsMatch[2]
			.split(",")
			.map((v) => v.trim())
			.filter(Boolean)

		// Validate function name.
		if (!IDENTIFIER_PATTERN.test(func)) {
			return {
				ok: false,
				error: `Invalid function name '${func}'.`
			}
		}

		// Global consistency checks.
		if (globalFunc === null) globalFunc = func
		else if (func !== globalFunc)
			return {
				ok: false,
				error: `All recurrences must use the same function name ('${globalFunc}' expected, found '${func}')`
			}

		if (globalArgCount === null) globalArgCount = rawArgs.length
		else if (rawArgs.length !== globalArgCount)
			return {
				ok: false,
				error: `Inconsistent number of arguments.`
			}

		if (rawArgs.length === 0) return { ok: false, error: `No arguments in ${lhs}` }

		const vars: string[] = []
		const fixedArgs: (string | number)[] = []
		for (const a of rawArgs) {
			if (IDENTIFIER_PATTERN.test(a)) {
				vars.push(a)
				fixedArgs.push(a)
			} else if (/^-?\d+$/.test(a)) {
				fixedArgs.push(parseInt(a, 10))
			} else {
				return {
					ok: false,
					error: `Invalid argument '${a}' in ${lhs}.`
				}
			}
		}

		// depth-aware split on '+', ignoring '+' inside parentheses
		const splitRhs = (s: string): string[] => {
			const out: string[] = []
			let depth = 0
			let buf = ""
			for (let i = 0; i < s.length; i++) {
				const ch = s[i]
				if (ch === "(") depth++
				else if (ch === ")") depth = Math.max(0, depth - 1)
				else if (ch === "+" && depth === 0) {
					if (buf) out.push(buf)
					buf = ""
					continue
				}
				buf += ch
			}
			if (buf) out.push(buf)
			return out
		}

		const summands = splitRhs(rhs)
			.map((t) => t.trim())
			.filter(Boolean)
		const rawTerms: Term[] = []

		// constant?
		if (summands.length === 1 && /^-?\d+(\.\d+)?$/.test(summands[0])) {
			const constantValue = parseFloat(summands[0])
			rawTerms.push({ type: "constant", coef: constantValue })
		} else {
			for (const summand of summands) {
				const termRegex = new RegExp(
					`^(?:(-?\\d+(?:\\.\\d+)?)\\*?)?([A-Za-z][A-Za-z0-9_]*)\\(([^)]*)\\)$`
				)
				const m = termRegex.exec(summand)
				if (!m) return { ok: false, error: `Invalid term: ${summand}` }

				const coef = m[1] ? parseFloat(m[1]) : 1
				const fnName = m[2]
				const argsRaw = m[3].split(",").map((a) => a.trim())

				if (!IDENTIFIER_PATTERN.test(fnName)) {
					return { ok: false, error: `Invalid function name '${fnName}'.` }
				}
				if (fnName !== func)
					return {
						ok: false,
						error: `Term '${summand}' uses a different function name '${fnName}' than '${func}'`
					}
				if (argsRaw.length !== globalArgCount)
					return {
						ok: false,
						error: `Term '${summand}' has ${argsRaw.length} args, expected ${globalArgCount}`
					}

				const shifts: Record<string, number> = {}
				let varIndex = 0
				for (const arg of argsRaw) {
					if (/^-?\d+$/.test(arg)) continue
					const v = vars[varIndex]
					if (!v) return { ok: false, error: `Unexpected arg '${arg}'` }
					const matchArg = new RegExp(`^${v}([+-]\\d+)?$`).exec(arg)
					if (!matchArg) return { ok: false, error: `Invalid arg '${arg}'` }
					const shift = matchArg[1] ? parseInt(matchArg[1], 10) : 0
					shifts[v] = shift
					varIndex++
				}

				rawTerms.push({ type: "function", coef, func, vars, shifts })
			}
		}

		// combine same-shift terms
		const terms: Term[] = []
		const functionMap = new Map<string, number>()
		let constantSum = 0
		for (const term of rawTerms) {
			if (term.type === "constant") constantSum += term.coef
			else {
				const key = vars.map((v) => term.shifts[v] ?? 0).join(",")
				functionMap.set(key, (functionMap.get(key) ?? 0) + term.coef)
			}
		}
		if (Math.abs(constantSum) > 1e-12) terms.push({ type: "constant", coef: constantSum })
		for (const [key, coef] of functionMap) {
			if (Math.abs(coef) < 1e-12) continue
			const shifts: Record<string, number> = {}
			const values = key.split(",").map(Number)
			vars.forEach((v, i) => (shifts[v] = values[i]))
			terms.push({ type: "function", coef, func, vars, shifts })
		}

		recurrences.push({ func, vars, terms, fixedArgs })
	}

	if (!recurrences.length) return { ok: false, error: "No valid recurrence lines found." }

	return { ok: true, recurrences }
}

// ======================================================
//   Formatter (used for pretty-printing back out)
// ======================================================

/**
 * Pretty-print a parsed recurrence system back into readable equations.
 * Reconstructs shifts using +/- notation and combines terms with coefficients.
 * @param recurrences Parsed recurrence system
 * @returns List of formatted equation strings
 */
export function formatRecurrences(recurrences: Recurrence): string[] {
	return recurrences.map(({ func, vars, terms, fixedArgs }) => {
		const lhsArgs = fixedArgs?.length ? fixedArgs.map(String).join(",") : vars.join(",")
		const lhs = `${func}(${lhsArgs})`

		const rhsParts = terms.map((term) => {
			if (term.type === "constant") return String(term.coef)
			let coefStr = ""
			if (term.coef !== 1 && term.coef !== -1) coefStr = term.coef.toString() + "*"
			else if (term.coef === -1) coefStr = "-"
			const args = (fixedArgs ?? vars).map((arg) => {
				if (typeof arg === "number") return String(arg)
				const off = term.shifts[arg] ?? 0
				if (off === 0) return arg
				if (off < 0) return `${arg}${off}`
				return `${arg}+${off}`
			})
			return `${coefStr}${func}(${args.join(",")})`
		})
		const rhs = rhsParts.join(" + ").replace(/\+\s*-/g, "- ")
		return `${lhs} = ${rhs}`
	})
}

/**
 * Convert a single term-based recurrence into its characteristic polynomial.
 * Uses argument deltas as monomial exponents and builds 1 − Σ(...) = 0.
 * @param rec Single recurrence to convert
 * @returns Polynomial representing the characteristic equation
 */
function recurrenceToPolynomial(rec: TermBasedRecurrence): Polynomial {
	const terms: PolynomialTerm[] = []
	// Build characteristic polynomial: 1 - Σ(coef * ∏(x_i^(delta_i))) = 0
	terms.push({ coefficient: 1, monomial: {} })
	for (const term of rec.terms) {
		if (term.type !== "function") continue
		const monomial: Monomial = {}
		for (const v of rec.vars) {
			const delta = term.shifts[v] ?? 0
			if (delta !== 0) monomial[v] = delta
		}
		terms.push({ coefficient: -term.coef, monomial })
	}
	return { variables: rec.vars, terms }
}

/**
 * Convert a recurrence system into a polynomial system.
 * Aggregates variables and characteristic polynomials for solving.
 * @param recurrences Parsed recurrence system
 * @returns Polynomial system ready for dominant-root solving
 */
export function recurrencesToPolynomialSystem(recurrences: Recurrence): PolynomialSystem {
	const polynomials: Polynomial[] = []
	const varSet = new Set<string>()
	for (const rec of recurrences) {
		polynomials.push(recurrenceToPolynomial(rec))
		rec.vars.forEach((v) => varSet.add(v))
	}
	return { polynomials, variables: Array.from(varSet) }
}

// ======================================================
//   Solver wrapper
// ======================================================

export interface WeightedCausalDebug {
	feasible: boolean
	status: number
	statusName: string
	weights: Record<string, number>
	shifts: number[][]
	dotProducts: Array<{ shift: number[]; dot: number }>
}

/**
 * Weighted‑causality check using a linear‑program feasibility system.
 *
 * LP formulation:
 *   minimize 0
 *   subject to:
 *     Σ_j shift_i[j] * w_j ≤ -ε   for all recursive shifts i
 *     Σ_j w_j = 1                 (normalization)
 *     w_j ≥ ε_min                 (strictly positive weights)
 *
 * Feasible → causal (non‑divergent)
 * Infeasible → divergent
 */
export async function isWeightedCausal(
	R: Recurrence,
	epsilon = 1e-3,
	epsilonMin = 1e-3
): Promise<WeightedCausalDebug> {
	const glpk: GLPK = getGLPK()

	// 1️⃣ Collect variable names
	const vars: string[] = []
	for (const eq of R) {
		for (const v of eq.vars) if (!vars.includes(v)) vars.push(v)
	}
	if (vars.length === 0) {
		return {
			feasible: true,
			status: glpk.GLP_FEAS,
			statusName: "no-variables",
			weights: {},
			shifts: [],
			dotProducts: []
		}
	}

	// 2️⃣ Gather all same‑function shift vectors
	const shifts: number[][] = []
	for (const eq of R) {
		for (const term of eq.terms) {
			if (term.type === "constant") continue
			if (term.func !== eq.func) continue
			const vec = vars.map((v) => term.shifts?.[v] ?? 0)

			// Self‑reference (zero shift) ⇒ non‑causal
			if (vec.every((x) => x === 0)) {
				return {
					feasible: false,
					status: glpk.GLP_INFEAS,
					statusName: "self-ref",
					weights: {},
					shifts: [vec],
					dotProducts: []
				}
			}
			shifts.push(vec)
		}
	}

	if (shifts.length === 0) {
		return {
			feasible: true,
			status: glpk.GLP_FEAS,
			statusName: "no-recursive-terms",
			weights: {},
			shifts,
			dotProducts: []
		}
	}

	// 3️⃣ Build LP model (minimize 0)
	const model = {
		name: "weighted_causal",
		objective: {
			direction: glpk.GLP_MIN,
			name: "obj",
			vars: vars.map((v) => ({ name: v, coef: 0 }))
		},
		subjectTo: [] as {
			name: string
			vars: { name: string; coef: number }[]
			bnds: { type: number; ub: number; lb: number }
		}[],
		bounds: [] as { name: string; type: number; lb: number; ub: number }[]
	}

	// positivity: w_j ≥ ε_min
	for (const v of vars) {
		model.bounds.push({
			name: v,
			type: glpk.GLP_LO,
			lb: epsilonMin,
			ub: 1e6
		})
	}

	// each shift: Σ s_j * w_j ≤ -ε
	shifts.forEach((s, i) => {
		model.subjectTo.push({
			name: `shift_${i}`,
			vars: vars.map((v, j) => ({ name: v, coef: s[j] })),
			bnds: { type: glpk.GLP_UP, ub: -epsilon, lb: -1e6 }
		})
	})

	// normalization: Σ w_j = 1
	model.subjectTo.push({
		name: "normalize",
		vars: vars.map((v) => ({ name: v, coef: 1 })),
		bnds: { type: glpk.GLP_FX, ub: 1, lb: 1 }
	})

	// 4️⃣ Solve LP
	const result = await Promise.resolve(glpk.solve(model, { msglev: glpk.GLP_MSG_OFF }))
	const status = result.result.status

	const statusNames: Record<number, string> = {
		[glpk.GLP_OPT]: "GLP_OPT (optimal)",
		[glpk.GLP_FEAS]: "GLP_FEAS (feasible)",
		[glpk.GLP_INFEAS]: "GLP_INFEAS (infeasible)",
		[glpk.GLP_NOFEAS]: "GLP_NOFEAS (no feasible solution)",
		[glpk.GLP_UNDEF]: "GLP_UNDEF (undefined)"
	}

	const feasible = status === glpk.GLP_OPT || status === glpk.GLP_FEAS

	// 5️⃣ Extract weights
	const weights: Record<string, number> = {}
	if (result.result.vars) {
		for (const [name, val] of Object.entries(result.result.vars)) {
			weights[name] = val
		}
	}

	// 6️⃣ Compute dot products (diagnostic only)
	const dotProducts = shifts.map((s) => ({
		shift: s,
		dot: vars.reduce((sum, v, i) => sum + s[i] * (weights[v] ?? 0), 0)
	}))

	// 7️⃣ Return diagnostic result
	return {
		feasible,
		status,
		statusName: statusNames[status] ?? `code ${status}`,
		weights,
		shifts,
		dotProducts
	}
}

/**
 * Compute the dominant roots for a parsed recurrence system.
 * Delegates to the polynomial system solver to obtain growth rates.
 * @param recurrences Parsed recurrence system
 * @returns Map of variable names to dominant roots, or null when unsolved
 */
export async function solveRecurrenceSystem(
	recurrences: Recurrence
): Promise<Root | "divergent" | null> {
	return isWeightedCausal(recurrences).then((x) => {
		if (!x.feasible) return "divergent"
		const system = recurrencesToPolynomialSystem(recurrences)
		const roots = dominantRoot(system)
		return roots
	})
}

/**
 * Parse and solve recurrences from raw strings and format the asymptotics.
 * Useful as a convenience wrapper for end-to-end usage.
 * @param lines Source lines containing recurrence equations
 * @returns Asymptotic big-O string or an error message
 */
export async function solveRecurrencesFromStrings(lines: string[]): Promise<string> {
	const parsed = parseRecurrences(lines)
	if (!parsed.ok) return Promise.resolve(`Error: ${parsed.error}`)
	return solveRecurrenceSystem(parsed.recurrences).then((roots) => {
		if (roots === "divergent") return "divergent"
		return formatAsymptotics(roots)
	})
}
