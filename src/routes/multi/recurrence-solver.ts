// --- Type definitions ---
export type Term = {
	coef: number
	func: string
	vars: string[]
	offsets: Record<string, number>
}

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

export type Root = number | Record<string, number>

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

export function formatRoot(root: Root | null | undefined, mainVars: string[] = []): string {
	if (root == null) return ""
	if (typeof root === "number") {
		const varName = mainVars.length > 0 ? mainVars[0] : "n"
		return `${formatNumber(root)}^${varName}`
	}

	// multivariate case
	const parts: string[] = []
	for (const [v, val] of Object.entries(root)) {
		parts.push(`${formatNumber(val)}^${v}`)
	}
	return parts.join(" · ")
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
				// Validate variable name
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

		for (const summand of summands) {
			const termRegex = new RegExp(
				`^(?:(-?\\d+(?:\\.\\d+)?)\\*?)?([A-Za-z][A-Za-z0-9_]*)\\(([^)]*)\\)$`
			)
			const m = termRegex.exec(summand)
			if (!m) return { ok: false, error: `Invalid term: ${summand}` }

			const coef = m[1] ? parseFloat(m[1]) : 1
			const fnName = m[2]
			const argsRaw = m[3].split(",").map((a) => a.trim())

			// Validate function name in term
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
				if (/^-?\d+$/.test(arg)) continue // skip constants
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

			rawTerms.push({ coef, func, vars, offsets })
		}

		// Combine identical terms
		const combinedMap = new Map<string, number>()
		for (const term of rawTerms) {
			const key = vars.map((v) => term.offsets[v] ?? 0).join(",")
			combinedMap.set(key, (combinedMap.get(key) ?? 0) + term.coef)
		}

		const terms: Term[] = []
		for (const [key, coef] of combinedMap) {
			if (Math.abs(coef) < 1e-12) continue
			const offsets: Record<string, number> = {}
			const values = key.split(",").map(Number)
			vars.forEach((v, i) => (offsets[v] = values[i]))
			terms.push({ coef, func, vars, offsets })
		}

		terms.sort((a, b) => {
			for (const v of vars) {
				const diff = (a.offsets[v] ?? 0) - (b.offsets[v] ?? 0)
				if (diff !== 0) return diff
			}
			return 0
		})

		recurrences.push({ func, vars, terms, fixedArgs })
	}

	if (recurrences.length === 0) return { ok: false, error: "No valid recurrence lines found" }

	// Validate hierarchical structure for multi-dimensional systems
	const dimensionCounts = new Map<number, number>()
	for (const r of recurrences) {
		const dim = r.vars.length
		dimensionCounts.set(dim, (dimensionCounts.get(dim) ?? 0) + 1)
	}

	const maxDim = Math.max(...dimensionCounts.keys())

	// For systems with multiple dimensions, validate hierarchical structure
	if (maxDim > 1) {
		for (let d = 1; d < maxDim; d++) {
			if (!dimensionCounts.has(d)) {
				return {
					ok: false,
					error: `Missing ${d}D boundary condition for ${maxDim}D system`
				}
			}
		}
	}

	return { ok: true, recurrences }
}

// --- Formatter ---
export function formatRecurrences(recurrences: Recurrence): string[] {
	return recurrences.map(({ func, vars, terms, fixedArgs }) => {
		// LHS: use fixedArgs if available
		const lhsArgs = fixedArgs?.length ? fixedArgs.map(String).join(",") : vars.join(",")
		const lhs = `${func}(${lhsArgs})`

		const rhsParts = terms.map(({ coef, offsets }) => {
			let coefStr = ""
			if (coef !== 1 && coef !== -1) coefStr = coef.toString() + "*"
			else if (coef === -1) coefStr = "-"

			// Replace the variable arguments inside fixedArgs
			const args = (fixedArgs ?? vars).map((arg) => {
				if (typeof arg === "number") return String(arg) // constant stays constant
				const off = offsets[arg] ?? 0
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

	const degree = Math.max(...terms.map((t) => t.offsets[v]))
	if (degree === 0) return null

	// Build polynomial coefficients for x^degree - Σ coef*x^(degree - offset)
	const coeffs = Array(degree + 1).fill(0)
	coeffs[0] = 1
	for (const { coef, offsets } of terms) {
		const off = offsets[v]
		if (off <= degree) coeffs[off] -= coef
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
	let hi = Math.max(2, ...terms.map((t) => Math.abs(t.coef))) * 2
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
		for (const t of terms) {
			let termValue = t.coef

			// Apply fixed roots
			for (const [fixedVar, fixedRoot] of Object.entries(fixedRoots)) {
				const offset = t.offsets[fixedVar] ?? 0
				termValue *= Math.pow(fixedRoot, -offset)
			}

			// Apply the variable we're solving for
			const offset = t.offsets[solveVar] ?? 0
			termValue *= Math.pow(y, -offset)

			sum += termValue
		}
		return 1 - sum
	}

	// Search for positive root
	let lo = 0.0001
	let hi = Math.max(2, ...terms.map((t) => Math.abs(t.coef))) * 2
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

export function dominantRoot(recurrences: Recurrence): Root | null {
	if (!recurrences?.length) return null

	// Sort by dimension (ascending)
	const sortedRecs = [...recurrences].sort((a, b) => a.vars.length - b.vars.length)
	const maxDim = sortedRecs[sortedRecs.length - 1].vars.length

	// --- 1D case -------------------------------------------------------
	if (maxDim === 1) {
		const r1 = sortedRecs[0]
		if (r1.vars.length !== 1) return null
		const root = solve1D(r1, r1.vars[0])
		return root
	}

	// --- Multi-dimensional case ----------------------------------------
	const roots: Record<string, number> = {}

	// Solve hierarchically from lowest to highest dimension
	for (let dim = 1; dim <= maxDim; dim++) {
		const currentRecs = sortedRecs.filter((r) => r.vars.length === dim)

		if (currentRecs.length === 0) {
			return null // Missing dimension
		}

		// For now, take the first recurrence of this dimension
		const currentRec = currentRecs[0]

		if (dim === 1) {
			// Base case: solve 1D directly
			const root = solve1D(currentRec, currentRec.vars[0])
			if (root === null || root <= 0) return null
			roots[currentRec.vars[0]] = root
		} else {
			// Higher dimension: solve with fixed lower-dimensional roots
			const newRoot = solveNDimensional(currentRec, roots)
			if (newRoot === null) return null

			// Find the new variable (not in previous dimensions)
			const newVar = currentRec.vars.find((v) => !(v in roots))
			if (!newVar) return null

			roots[newVar] = newRoot
		}
	}

	// Return single number for 1D, object for multi-dimensional
	if (Object.keys(roots).length === 1) {
		return Object.values(roots)[0]
	}

	return roots
}
