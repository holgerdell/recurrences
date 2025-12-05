// recurrenceSolver.ts
// ======================================================
// Recurrence parser + formatter + link to polynomial solver
// ======================================================

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
			offsets: Record<string, number>
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

export function snapIntVal(val: number, eps = 1e-6): number {
	if (!Number.isFinite(val)) return val
	const i = Math.round(val)
	return Math.abs(val - i) < eps ? i : val
}

// export function formatNumber(x: number): string {
// 	if (!Number.isFinite(x)) return String(x)
// 	const roundedUp = Math.ceil(x * 1e4) / 1e4
// 	return roundedUp.toFixed(4).replace(/\.?0+$/, "")
// }

// ======================================================
//   Parser
// ======================================================

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

		const summands = rhs
			.split("+")
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

				const offsets: Record<string, number> = {}
				let varIndex = 0
				for (const arg of argsRaw) {
					if (/^-?\d+$/.test(arg)) continue
					const v = vars[varIndex]
					if (!v) return { ok: false, error: `Unexpected arg '${arg}'` }
					const matchArg = new RegExp(`^${v}([+-]\\d+)?$`).exec(arg)
					if (!matchArg) return { ok: false, error: `Invalid arg '${arg}'` }
					const offset = matchArg[1] ? parseInt(matchArg[1], 10) : 0
					offsets[v] = -offset
					varIndex++
				}

				rawTerms.push({ type: "function", coef, func, vars, offsets })
			}
		}

		// combine same-offset terms
		const terms: Term[] = []
		const functionMap = new Map<string, number>()
		let constantSum = 0
		for (const term of rawTerms) {
			if (term.type === "constant") constantSum += term.coef
			else {
				const key = vars.map((v) => term.offsets[v] ?? 0).join(",")
				functionMap.set(key, (functionMap.get(key) ?? 0) + term.coef)
			}
		}
		if (Math.abs(constantSum) > 1e-12) terms.push({ type: "constant", coef: constantSum })
		for (const [key, coef] of functionMap) {
			if (Math.abs(coef) < 1e-12) continue
			const offsets: Record<string, number> = {}
			const values = key.split(",").map(Number)
			vars.forEach((v, i) => (offsets[v] = values[i]))
			terms.push({ type: "function", coef, func, vars, offsets })
		}

		// check degenerate F(...) = F(...)
		const hasSelf = terms.some(
			(t) => t.type === "function" && vars.every((v) => (t.offsets[v] ?? 0) === 0)
		)
		if (hasSelf)
			return {
				ok: false,
				error: `Invalid recurrence: function defined in terms of itself without offsets in '${line}'`
			}

		recurrences.push({ func, vars, terms, fixedArgs })
	}

	if (!recurrences.length) return { ok: false, error: "No valid recurrence lines found." }

	return { ok: true, recurrences }
}

// ======================================================
//   Formatter (used for pretty-printing back out)
// ======================================================

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
				const off = term.offsets[arg] ?? 0
				if (off === 0) return arg
				if (off > 0) return `${arg}-${off}`
				return `${arg}+${-off}`
			})
			return `${coefStr}${func}(${args.join(",")})`
		})
		const rhs = rhsParts.join(" + ").replace(/\+\s*-/g, "- ")
		return `${lhs} = ${rhs}`
	})
}

// ======================================================
//   Conversion: Recurrence → Characteristic Polynomials
// ======================================================

function recurrenceToPolynomial(rec: TermBasedRecurrence): Polynomial {
	const terms: PolynomialTerm[] = []
	// Build characteristic polynomial: 1 - Σ(coef * ∏(x_i^(-offset_i))) = 0
	terms.push({ coefficient: 1, monomial: {} })
	for (const term of rec.terms) {
		if (term.type !== "function") continue
		const monomial: Monomial = {}
		for (const v of rec.vars) {
			const offset = term.offsets[v] ?? 0
			if (offset !== 0) monomial[v] = -offset
		}
		terms.push({ coefficient: -term.coef, monomial })
	}
	return { variables: rec.vars, terms }
}

/**
 * Convert a Recurrence system into a PolynomialSystem (characteristic equations).
 */
function recurrencesToPolynomialSystem(recurrences: Recurrence): PolynomialSystem {
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

export function solveRecurrenceSystem(recurrences: Recurrence): Root | null {
	const system = recurrencesToPolynomialSystem(recurrences)
	const roots = dominantRoot(system)
	return roots
}

/**
 * Convenience parser + solver wrapper.
 */
export function solveRecurrencesFromStrings(lines: string[]): string {
	const parsed = parseRecurrences(lines)
	if (!parsed.ok) return `Error: ${parsed.error}`
	const roots = solveRecurrenceSystem(parsed.recurrences)
	return formatAsymptotics(roots)
}
