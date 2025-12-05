// --- Type definitions ---
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

/**
 * A family of related recurrence relations (possibly multi-dimensional),
 * all defining the same function on domains of different dimensionality.
 */
export type Recurrence = TermBasedRecurrence[]

export type Root = Record<string, number>

export type ParseResult = { ok: true; recurrences: Recurrence } | { ok: false; error: string }

// --- Constants ---
/**
 * Pattern for valid identifiers (function names and variable names):
 * Must start with a letter, followed by letters, digits, or underscores
 */
export const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/

// --- Utility functions ---
export function snapInt(val: number, eps = 1e-6): number {
	if (!Number.isFinite(val)) return val
	const i = Math.round(val)
	return Math.abs(val - i) < eps ? i : val
}

export function formatNumber(x: number): string {
	if (!Number.isFinite(x)) return String(x)
	const roundedUp = Math.ceil(x * 1e4) / 1e4 // always round up to 4 decimals
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

// --- Parser ---
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

		// Validate function name
		if (!IDENTIFIER_PATTERN.test(func)) {
			return {
				ok: false,
				error: `Invalid function name '${func}': must match pattern [A-Za-z][A-Za-z0-9_]*`
			}
		}

		// Enforce single function name / consistent argument count
		if (globalFunc === null) globalFunc = func
		else if (func !== globalFunc)
			return {
				ok: false,
				error: `All recurrences must use the same function name (${globalFunc}), found '${func}' in '${lhs}'`
			}

		if (globalArgCount === null) globalArgCount = rawArgs.length
		else if (rawArgs.length !== globalArgCount)
			return {
				ok: false,
				error: `Inconsistent number of arguments: expected ${globalArgCount} but got ${rawArgs.length} in '${lhs}'`
			}

		if (rawArgs.length === 0) return { ok: false, error: `No arguments found in ${lhs}` }

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
					error: `Invalid argument '${a}' in ${lhs}: variables must match pattern [A-Za-z][A-Za-z0-9_]*`
				}
			}
		}

		const summands = rhs
			.split("+")
			.map((t) => t.trim())
			.filter(Boolean)
		const rawTerms: Term[] = []

		// Check if RHS is just a constant (boundary condition)
		if (summands.length === 1 && /^-?\d+(\.\d+)?$/.test(summands[0])) {
			const constantValue = parseFloat(summands[0])
			rawTerms.push({ type: "constant", coef: constantValue })
		} else {
			// Regular case: parse function calls
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
					return {
						ok: false,
						error: `Invalid function name '${fnName}' in term '${summand}': must match pattern [A-Za-z][A-Za-z0-9_]*`
					}
				}

				if (fnName !== func)
					return {
						ok: false,
						error: `Term '${summand}' uses a different function name (${fnName}) than LHS (${func})`
					}

				if (argsRaw.length !== globalArgCount)
					return {
						ok: false,
						error: `Term '${summand}' has ${argsRaw.length} arguments, expected ${globalArgCount}`
					}

				const offsets: Record<string, number> = {}
				let varIndex = 0
				for (const arg of argsRaw) {
					if (/^-?\d+$/.test(arg)) continue
					const v = vars[varIndex]
					if (!v)
						return {
							ok: false,
							error: `Unexpected argument '${arg}' in term '${summand}'`
						}
					const matchArg = new RegExp(`^${v}([+-]\\d+)?$`).exec(arg)
					if (!matchArg)
						return {
							ok: false,
							error: `Invalid argument '${arg}' in term '${summand}'`
						}
					const offset = matchArg[1] ? parseInt(matchArg[1], 10) : 0
					offsets[v] = -offset
					varIndex++
				}

				if (varIndex !== vars.length)
					return {
						ok: false,
						error: `Term '${summand}' is missing variable arguments (${lhs})`
					}

				rawTerms.push({ type: "function", coef, func, vars, offsets })
			}
		}

		// Combine identical terms
		const constantTerms: Term[] = []
		const functionTermMap = new Map<string, number>()

		for (const term of rawTerms) {
			if (term.type === "constant") {
				constantTerms.push(term)
			} else {
				const key = vars.map((v) => term.offsets[v] ?? 0).join(",")
				functionTermMap.set(key, (functionTermMap.get(key) ?? 0) + term.coef)
			}
		}

		const terms: Term[] = []

		// Add constants
		if (constantTerms.length > 0) {
			const totalConstant = constantTerms.reduce((sum, t) => sum + t.coef, 0)
			if (Math.abs(totalConstant) >= 1e-12) {
				terms.push({ type: "constant", coef: totalConstant })
			}
		}

		// Add function terms
		for (const [key, coef] of functionTermMap) {
			if (Math.abs(coef) < 1e-12) continue
			const offsets: Record<string, number> = {}
			const values = key.split(",").map(Number)
			vars.forEach((v, i) => (offsets[v] = values[i]))
			terms.push({ type: "function", coef, func, vars, offsets })
		}

		terms.sort((a, b) => {
			if (a.type === "constant" && b.type === "function") return -1
			if (a.type === "function" && b.type === "constant") return 1
			if (a.type === "constant" && b.type === "constant") return 0

			// Both are function terms
			if (a.type === "function" && b.type === "function") {
				for (const v of vars) {
					const diff = (a.offsets[v] ?? 0) - (b.offsets[v] ?? 0)
					if (diff !== 0) return diff
				}
			}
			return 0
		})

		recurrences.push({ func, vars, terms, fixedArgs })
	}

	if (recurrences.length === 0) return { ok: false, error: "No valid recurrence lines found" }

	return { ok: true, recurrences }
}

// --- Formatter ---
export function formatRecurrences(recurrences: Recurrence): string[] {
	return recurrences.map(({ func, vars, terms, fixedArgs }) => {
		const lhsArgs = fixedArgs?.length ? fixedArgs.map(String).join(",") : vars.join(",")
		const lhs = `${func}(${lhsArgs})`

		const rhsParts = terms.map((term) => {
			if (term.type === "constant") {
				return String(term.coef)
			}

			// Function term
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

// --- Root finding ---
function solve1D(r: TermBasedRecurrence, v: string): number | null {
	const terms = r.terms
	if (!terms.length) return null

	// Filter to only function terms for characteristic equation
	const functionTerms = terms.filter(
		(t): t is Extract<Term, { type: "function" }> => t.type === "function"
	)
	if (!functionTerms.length) return null

	const degree = Math.max(...functionTerms.map((t) => t.offsets[v] ?? 0))
	if (degree === 0) return null

	// Build polynomial coefficients for x^degree - Σ coef*x^(degree - offset)
	const coeffs = Array(degree + 1).fill(0)
	coeffs[0] = 1
	for (const term of functionTerms) {
		const off = term.offsets[v] ?? 0
		if (off <= degree) coeffs[off] -= term.coef
	}
	if (coeffs.every((c) => Math.abs(c) < 1e-14)) return null

	// Polynomial evaluation
	function f(x: number): number {
		let val = 0
		for (let i = 0; i <= degree; i++) val = val * x + coeffs[i]
		return val
	}

	// Numeric brackets
	let lo = 0.0001
	let hi = Math.max(2, ...functionTerms.map((t) => Math.abs(t.coef))) * 2
	let flo = f(lo)
	let fhi = f(hi)

	// Expand hi until sign change or until max limit
	while (flo * fhi > 0 && hi < 1e6) {
		lo = hi
		hi *= 2
		fhi = f(hi)
	}
	if (flo * fhi > 0) return null // no positive real root detected

	// Bisection refinement
	for (let i = 0; i < 100; i++) {
		const mid = 0.5 * (lo + hi)
		const fm = f(mid)
		if (Math.abs(fm) < 1e-14) return snapInt(mid)
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

function solveNDimensional(
	targetRec: TermBasedRecurrence,
	fixedRoots: Record<string, number>
): number | null {
	const remainingVars = targetRec.vars.filter((v) => !(v in fixedRoots))

	if (remainingVars.length !== 1) {
		return null // Can only solve for one remaining variable
	}

	const solveVar = remainingVars[0]
	const terms = targetRec.terms

	// Build equation: find y such that Σ coef * ∏(fixedRoot^(-offset_i) * y^(-offset_solveVar)) = 1
	function f(y: number): number {
		let sum = 0
		for (const term of terms) {
			if (term.type === "constant") {
				// Constant terms don't participate in characteristic equation
				continue
			}

			let termValue = term.coef

			// Apply fixed roots
			for (const [fixedVar, fixedRoot] of Object.entries(fixedRoots)) {
				const offset = term.offsets[fixedVar] ?? 0
				termValue *= Math.pow(fixedRoot, -offset)
			}

			// Apply the variable we're solving for
			const offset = term.offsets[solveVar] ?? 0
			termValue *= Math.pow(y, -offset)

			sum += termValue
		}
		return 1 - sum
	}

	// Search for positive root
	const functionTerms = terms.filter(
		(t): t is Extract<Term, { type: "function" }> => t.type === "function"
	)
	let lo = 0.0001
	let hi = Math.max(2, ...functionTerms.map((t) => Math.abs(t.coef))) * 2
	let flo = f(lo)
	let fhi = f(hi)

	// Expand hi until sign change or until max reached
	while (flo * fhi > 0 && hi < 1e6) {
		lo = hi
		hi *= 2
		fhi = f(hi)
	}

	// If no sign change, detect monotonic approach to zero ⇒ y → ∞
	if (flo * fhi > 0) {
		const fLarge = f(hi * 100)
		if (Math.abs(fLarge) < 1e-6 || fLarge * fhi > 0) {
			return Infinity
		}
		return null
	}

	// Bisection root finding
	for (let iter = 0; iter < 100; iter++) {
		const mid = 0.5 * (lo + hi)
		const fm = f(mid)
		if (Math.abs(fm) < 1e-12) {
			return snapInt(mid)
		}
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

function solve2DCharacteristic(rec: TermBasedRecurrence): Root | null {
	if (rec.vars.length !== 2) return null

	const [var1, var2] = rec.vars
	const terms = rec.terms

	// Characteristic equation: 1 = Σ coef_i * x^(-offset1_i) * y^(-offset2_i)
	function characteristicFunction(x: number, y: number): number {
		let sum = 0
		for (const term of terms) {
			if (term.type === "constant") {
				// Constant terms don't participate in characteristic equation
				continue
			}

			const offset1 = term.offsets[var1] ?? 0
			const offset2 = term.offsets[var2] ?? 0
			sum += term.coef * Math.pow(x, -offset1) * Math.pow(y, -offset2)
		}
		return 1 - sum
	}

	const ACCEPTABLE_ERROR = 1e-10

	// Try different solution strategies

	// Strategy 1: Assume symmetric solution (x = y)
	const symmetricSolution = solveSymmetricCase()
	if (symmetricSolution) return symmetricSolution

	// Strategy 2: Fix x, solve for y (and vice versa)
	const fixedVarSolution = solveByFixingOneVariable()
	if (fixedVarSolution) return fixedVarSolution

	// Strategy 3: Parametric search along different curves
	const parametricSolution = solveParametrically()
	if (parametricSolution) return parametricSolution

	return null

	function solveSymmetricCase(): Record<string, number> | null {
		// For x = y, we have: 1 = Σ coef_i * x^(-(offset1_i + offset2_i))
		function symmetricCharacteristic(x: number): number {
			return characteristicFunction(x, x)
		}

		// Use 1D root finding
		const root = find1DRoot(symmetricCharacteristic, 1.01, 10)
		if (root && Math.abs(symmetricCharacteristic(root)) < ACCEPTABLE_ERROR) {
			return { [var1]: snapInt(root), [var2]: snapInt(root) }
		}
		return null
	}

	function solveByFixingOneVariable(): Record<string, number> | null {
		// Try fixing x at various values and solving for y
		for (let x = 1.1; x <= 5; x += 0.1) {
			function solveForY(y: number): number {
				return characteristicFunction(x, y)
			}

			const y = find1DRoot(solveForY, 1.01, 10)
			if (y && Math.abs(solveForY(y)) < ACCEPTABLE_ERROR) {
				return { [var1]: snapInt(x), [var2]: snapInt(y) }
			}
		}

		// Try fixing y at various values and solving for x
		for (let y = 1.1; y <= 5; y += 0.1) {
			function solveForX(x: number): number {
				return characteristicFunction(x, y)
			}

			const x = find1DRoot(solveForX, 1.01, 10)
			if (x && Math.abs(solveForX(x)) < ACCEPTABLE_ERROR) {
				return { [var1]: snapInt(x), [var2]: snapInt(y) }
			}
		}

		return null
	}

	function solveParametrically(): Record<string, number> | null {
		// Try parametric curves: y = a*x + b for various a, b
		const parameterizations = [
			{ a: 1, b: 0 }, // y = x
			{ a: 1, b: 0.1 }, // y = x + 0.1
			{ a: 1, b: -0.1 }, // y = x - 0.1
			{ a: 1.1, b: 0 }, // y = 1.1*x
			{ a: 0.9, b: 0 }, // y = 0.9*x
			{ a: 0, b: 1 } // y = 1 (constant)
		]

		for (const { a, b } of parameterizations) {
			function parametricCharacteristic(x: number): number {
				const y = a * x + b
				if (y <= 1) return Infinity // Invalid region
				return characteristicFunction(x, y)
			}

			const x = find1DRoot(parametricCharacteristic, 1.01, 10)
			if (x) {
				const y = a * x + b
				if (y > 1 && Math.abs(characteristicFunction(x, y)) < ACCEPTABLE_ERROR) {
					return { [var1]: snapInt(x), [var2]: snapInt(y) }
				}
			}
		}

		return null
	}

	function find1DRoot(f: (x: number) => number, minX: number, maxX: number): number | null {
		// Expand search range if needed
		let lo = minX
		let hi = maxX
		let flo = f(lo)
		let fhi = f(hi)

		// Expand hi until sign change
		while (flo * fhi > 0 && hi < 100) {
			lo = hi
			hi *= 2
			flo = fhi
			fhi = f(hi)
		}

		if (flo * fhi > 0) return null // No sign change found

		// Bisection method
		for (let iter = 0; iter < 100; iter++) {
			const mid = 0.5 * (lo + hi)
			const fmid = f(mid)

			if (Math.abs(fmid) < 1e-14) return mid

			if (flo * fmid < 0) {
				hi = mid
				fhi = fmid
			} else {
				lo = mid
				flo = fmid
			}

			if (hi - lo < 1e-14) break
		}

		return 0.5 * (lo + hi)
	}
}

export function dominantRoot(recurrences: Recurrence): Root | null {
	if (!recurrences?.length) return null

	// Sort by dimension (ascending)
	const sortedRecs = [...recurrences].sort((a, b) => a.vars.length - b.vars.length)

	// Filter out boundary conditions (recurrences with only constant terms)
	const actualRecurrences = sortedRecs.filter((rec) =>
		rec.terms.some((term) => term.type === "function")
	)

	// If no actual recurrences, the function is constant → O(1)
	if (!actualRecurrences.length) {
		const allVars = new Set<string>()
		sortedRecs.forEach((rec) => rec.vars.forEach((v) => allVars.add(v)))
		const roots: Record<string, number> = {}
		allVars.forEach((v) => (roots[v] = 1))
		return roots
	}

	// Build solution progressively from lower to higher dimensions
	const roots: Record<string, number> = {}

	for (const rec of actualRecurrences) {
		const unknownVars = rec.vars.filter((v) => !(v in roots))

		if (unknownVars.length === 0) {
			// All variables already solved - skip this recurrence
			continue
		} else if (unknownVars.length === 1) {
			// Solve for the single unknown variable
			const solveVar = unknownVars[0]

			if (rec.vars.length === 1) {
				// Pure 1D case
				const root = solve1D(rec, solveVar)
				if (root !== null) {
					roots[solveVar] = root
				}
			} else {
				// Multi-dimensional with constraints
				const constraintRoots: Record<string, number> = {}
				rec.vars.forEach((v) => {
					if (v in roots) constraintRoots[v] = roots[v]
				})

				const newRoot = solveNDimensional(rec, constraintRoots)
				if (newRoot !== null) {
					roots[solveVar] = newRoot
				}
			}
		} else if (rec.vars.length === 2 && unknownVars.length === 2) {
			// Pure 2D case with no constraints
			const result = solve2DCharacteristic(rec)
			if (result) {
				Object.assign(roots, result)
			}
		} else {
			// Higher dimensions with multiple unknowns - use heuristic
			// Set all but last unknown to 1, solve for the last
			for (let i = 0; i < unknownVars.length - 1; i++) {
				roots[unknownVars[i]] = 1
			}

			const lastVar = unknownVars[unknownVars.length - 1]
			const constraintRoots: Record<string, number> = {}
			rec.vars.forEach((v) => {
				if (v in roots) constraintRoots[v] = roots[v]
			})

			const newRoot = solveNDimensional(rec, constraintRoots)
			if (newRoot !== null) {
				roots[lastVar] = newRoot
			}
		}
	}

	return Object.keys(roots).length > 0 ? roots : null
}
