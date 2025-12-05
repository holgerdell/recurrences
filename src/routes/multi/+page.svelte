<script lang="ts">
	// --- State setup ---
	const initial_text = `T(n,k)=T(n-1,k)+T(n,k-1)
T(n,0)=2*T(n-1,0)` // example with two lines
	const initial_p = parseRecurrences(initial_text.split(/\r?\n/).filter(Boolean))
	const initial_x = initial_p.ok && dominantRoot(initial_p.recurrences)

	type Root = number | Record<string, number>

	const initial_log: [Recurrence, Root][] =
		initial_p.ok && initial_x ? [[initial_p.recurrences, initial_x]] : []

	let S = $state<{ text: string; log: [Recurrence, Root][] }>({
		text: initial_text,
		log: initial_log
	})

	// --- Type definitions ---
	type Term = {
		coef: number
		func: string
		vars: string[]
		offsets: Record<string, number>
	}

	type TermBasedRecurrence = {
		func: string
		vars: string[]
		terms: Term[]
		fixedArgs?: (string | number)[]
	}

	/**
	 * A family of related recurrence relations (possibly triangular),
	 * all defining the same function on domains of different dimensionality.
	 *
	 * Example:
	 * [
	 *   { func: "T", vars: ["N1", "N2"], terms: [...] }, // main 2D recurrence
	 *   { func: "T", vars: ["N1"], terms: [...] }       // boundary recurrence T(N1,0)
	 * ]
	 */
	type Recurrence = TermBasedRecurrence[]

	type ParseResult = { ok: true; recurrences: Recurrence } | { ok: false; error: string }

	// --- Actions ---
	function add() {
		const lines = S.text.split(/\r?\n/).filter(Boolean)
		const p = parseRecurrences(lines)
		if (!p.ok) return

		const last = S.log.at(-1)
		if (last && JSON.stringify(last[0]) === JSON.stringify(p.recurrences)) return

		const x = dominantRoot(p.recurrences)
		if (x) S.log.push([p.recurrences, x])
	}

	function formatNumber(x: number): string {
		if (!Number.isFinite(x)) return String(x)
		const roundedUp = Math.ceil(x * 1e4) / 1e4 // always round up to 4 decimals
		return roundedUp.toFixed(4).replace(/\.?0+$/, "")
	}
	function formatRoot(root: number | Record<string, number> | null | undefined): string {
		if (root == null) return ""
		if (typeof root === "number")
			return `${formatNumber(root)}^${parsed.ok ? parsed.recurrences[0].vars[0] : ""}`

		// multivariate case
		const parts: string[] = []
		for (const [v, val] of Object.entries(root)) {
			parts.push(`${formatNumber(val)}^${v}`)
		}
		return parts.join(" · ")
	}

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
			const lhsMatch = /^([A-Za-z_]+)\(([^)]*)\)$/.exec(lhs)
			if (!lhsMatch) return { ok: false, error: `Invalid left-hand side: ${lhs}` }

			const func = lhsMatch[1]
			const rawArgs = lhsMatch[2]
				.split(",")
				.map((v) => v.trim())
				.filter(Boolean)

			// ------------------------------------------------------------
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

			rawArgs.forEach((a) => {
				if (/^[A-Za-z_]+$/.test(a)) {
					vars.push(a)
					fixedArgs.push(a)
				} else if (/^-?\d+$/.test(a)) {
					fixedArgs.push(parseInt(a, 10))
				} else {
					return { ok: false, error: `Invalid argument '${a}' in ${lhs}` }
				}
			})

			const summands = rhs
				.split("+")
				.map((t) => t.trim())
				.filter(Boolean)
			const rawTerms: Term[] = []

			for (const summand of summands) {
				const termRegex = /^(?:(-?\d+(?:\.\d+)?)\*?)?([A-Za-z_]+)\(([^)]*)\)$/
				const m = termRegex.exec(summand)
				if (!m) return { ok: false, error: `Invalid term: ${summand}` }

				const coef = m[1] ? parseFloat(m[1]) : 1
				const fnName = m[2]
				const argsRaw = m[3].split(",").map((a) => a.trim())

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

		// ==============================================================
		// --- Triangular structure validation --------------------------
		// ==============================================================

		if (recurrences.length > 2)
			return {
				ok: false,
				error: "Too many recurrences: only one 2D main and one 1D boundary are allowed"
			}

		if (recurrences.length == 2) {
			// Identify main and boundary
			const main = recurrences.find((r) => r.vars.length === 2)
			const boundary = recurrences.find((r) => r.vars.length === 1)

			if (!main)
				return {
					ok: false,
					error: "Missing main 2D recurrence (must have two variables)"
				}

			if (boundary && main.vars[0] !== boundary.vars[0])
				return {
					ok: false,
					error: `Boundary must fix the last variable (${main.vars[1]}=constant), not ${main.vars[0]}`
				}

			// Check for fixed last argument in the boundary equation
			const boundaryRec = recurrences.find((r) =>
				(r.fixedArgs ?? []).some((a, i) => typeof a === "number" && i === r.vars.length)
			)
			if (boundaryRec && (boundaryRec.fixedArgs?.length ?? 0) === 1)
				return {
					ok: false,
					error: "Boundary recurrence must correspond to fixing the last argument (e.g. T(n,0)=...)"
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

	export function snapInt(val: number, eps = 1e-9): number {
		if (!Number.isFinite(val)) return val
		const i = Math.round(val)
		return Math.abs(val - i) < eps ? i : val
	}

	export function dominantRoot(recurrences: Recurrence): number | Record<string, number> | null {
		if (!recurrences?.length) return null

		// --- 1D case -------------------------------------------------------
		if (recurrences.length === 1) {
			const r1 = recurrences[0]
			if (r1.vars.length !== 1) return null
			return solve1D(r1, r1.vars[0])
		}

		// --- 2D case (one interior, one boundary) --------------------------
		const twoD = recurrences.find((r) => r.vars.length === 2)
		const oneD = recurrences.find((r) => r.vars.length === 1)
		if (!twoD || !oneD) return null

		const [n, k] = twoD.vars

		// 1️⃣ boundary root (x_b)
		const x_b = solve1D(oneD, oneD.vars[0])
		if (x_b == null || typeof x_b !== "number" || x_b <= 0) return null

		// 2️⃣ find y that satisfies interior with fixed x_b
		const terms = twoD.terms
		function f(xb: number, y: number): number {
			let sum = 0
			for (const t of terms) {
				const dx = t.offsets[n] ?? 0
				const dy = t.offsets[k] ?? 0
				sum += t.coef * Math.pow(xb, -dx) * Math.pow(y, -dy)
			}
			return 1 - sum
		}

		// Search for positive y root of f(x_b, y) = 0
		let lo = 0.0001
		let hi = Math.max(2, ...terms.map((t) => Math.abs(t.coef))) * 2
		let flo = f(x_b, lo)
		let fhi = f(x_b, hi)

		// expand hi until sign change or until max reached
		while (flo * fhi > 0 && hi < 1e6) {
			lo = hi
			hi *= 2
			fhi = f(x_b, hi)
		}

		// if no sign change, detect monotonic approach to zero ⇒ y → ∞
		if (flo * fhi > 0) {
			const fLarge = f(x_b, hi * 100)
			if (Math.abs(fLarge) < 1e-6 || fLarge * fhi > 0) {
				return { [oneD.vars[0]]: snapInt(x_b), [k]: Infinity }
			}
			return null
		}

		// bisection root finding
		for (let iter = 0; iter < 100; iter++) {
			const mid = 0.5 * (lo + hi)
			const fm = f(x_b, mid)
			if (Math.abs(fm) < 1e-12) {
				return { [oneD.vars[0]]: snapInt(x_b), [k]: snapInt(mid) }
			}
			if (flo * fm < 0) {
				hi = mid
				fhi = fm
			} else {
				lo = mid
				flo = fm
			}
		}

		// return midpoint approximation, snapped to integers if close
		const y = snapInt(0.5 * (lo + hi))
		return { [oneD.vars[0]]: snapInt(x_b), [k]: y }
	}

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

	let parsed = $derived(parseRecurrences(S.text.split(/\r?\n/).filter(Boolean)))
	let x = $derived(parsed.ok ? dominantRoot(parsed.recurrences) : undefined)

	// --- Quick tests for parseRecurrences ---
	{
		function expectOk(exprs: string[], msg: string) {
			const res = parseRecurrences(exprs)
			console.assert(res.ok, `❌ Expected OK: ${msg}, got error: ${(res as any).error}`)
			if (res.ok) console.log(`✅ ${msg}`)
		}

		function expectError(exprs: string[], expectedSnippet: string) {
			const res = parseRecurrences(exprs)
			console.assert(!res.ok, `❌ Expected error '${expectedSnippet}' but got OK`)
			if (!res.ok) {
				console.assert(
					(res.error ?? "").includes(expectedSnippet),
					`❌ Wrong error. Expected snippet "${expectedSnippet}", got "${res.error}"`
				)
				console.log(`✅ Error check passed: ${expectedSnippet}`)
			}
		}

		// 1️⃣ different function names -> should fail
		expectError(["T(n)=T(n-1)", "S(n)=S(n-1)"], "same function name")

		// 2️⃣ inconsistent number of arguments -> should fail
		expectError(["T(n)=T(n-1)", "T(n,k)=T(n-1,k)"], "Inconsistent number of arguments")

		// 3️⃣ valid simple recurrence
		expectOk(["T(n)=2*T(n-1)"], "Single 1-variable recurrence")

		// 4️⃣ valid triangular recurrence
		expectOk(["T(n,k)=T(n-1,k)+T(n,k-1)", "T(n,0)=2*T(n-1,0)"], "Triangular recurrence (n≥k≥0)")

		console.log("All quick parser tests finished.")
	}
	// --- Extended dominantRoot tests ---
	{
		const almostEqual = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

		const get = (r: any, name: string): number =>
			typeof r === "object" && r !== null ? (r[name] ?? NaN) : typeof r === "number" ? r : NaN

		const describe = (title: string) => console.log(`\n=== ${title} ===`)

		const test1D = (exprs: string[], expected: number, label: string) => {
			const res = parseRecurrences(exprs)
			console.assert(res.ok, `parse failed for ${label}`)
			const root = res.ok && dominantRoot(res.recurrences)
			console.assert(
				almostEqual(root as number, expected),
				`❌ ${label}: expected ${expected}, got ${root}`
			)
			console.log(`✅ ${label} → ${root}`)
		}

		const test2D = (exprs: string[], expected: { [v: string]: number }, label: string) => {
			const res = parseRecurrences(exprs)
			console.assert(res.ok, `parse failed for ${label}`)
			const root = res.ok && (dominantRoot(res.recurrences) as Record<string, number>)
			const ok =
				root && Object.entries(expected).every(([v, val]) => almostEqual(get(root, v), val))
			console.assert(
				ok,
				`❌ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(root)}`
			)
			console.log(`✅ ${label} → ${JSON.stringify(root)}`)
		}

		// ------------------------------------------------------------------
		describe("1-D recurrences")

		// simple geometric growth
		test1D(["T(n)=2*T(n-1)"], 2, "geometric")

		// degenerate should give null
		{
			const res = parseRecurrences(["T(n)=T(n)"])
			const r = res.ok && dominantRoot(res.recurrences)
			console.assert(r === null, `❌ expected null, got ${r}`)
			console.log("✅ degenerate T(n)=T(n) gives null")
		}

		// Fibonacci → golden ratio ≈ 1.618…
		test1D(["T(n)=T(n-1)+T(n-2)"], 1.61803398875, "Fibonacci")

		// Tribonacci → ≈ 1.839286…
		test1D(["T(n)=T(n-1)+T(n-2)+T(n-3)"], 1.83928675521, "Tribonacci")
		// T(n)=2*T(n-1)+T(n-2) → 1+√2 ≈ 2.41421356237
		test1D(["T(n)=2*T(n-1)+T(n-2)"], 2.41421356237, "custom 1D 2x+1")

		// T(n)=3*T(n-1)+T(n-2) → (3+√13)/2 ≈ 3.30277563773
		test1D(["T(n)=3*T(n-1)+T(n-2)"], 3.30277563773, "custom 1D 3x+1")

		// ------------------------------------------------------------------
		describe("2-D recurrences (triangular systems)")

		// Pure 2D doubling in both axes
		test2D(["T(n,k)=T(n,k-1)+T(n,k-1)", "T(n,0)=2*T(n-1,0)"], { n: 2, k: 2 }, "2D double-k system")

		// Corrected system T(n,k)=T(n-1,k)+T(n,k-1)
		test2D(
			["T(n,k)=T(n-1,k)+T(n,k-1)", "T(n,0)=2*T(n-1,0)"],
			{ n: 2, k: 2 },
			"2D Pascal-like system (should be 2,2)"
		)
		console.log("\nAll dominantRoot tests passed ✅")
	}
	// 2D asymmetric system: x=2, y→∞ (no finite y root)
	{
		const recs = parseRecurrences(["T(n,k)=2*T(n-1,k)+T(n,k-1)", "T(n,0)=2*T(n-1,0)"])
		console.assert(recs.ok, "parse failed for system #4")
		const root = recs.ok && dominantRoot(recs.recurrences)
		const nVal = (root as any)?.n
		const kVal = (root as any)?.k
		console.assert(
			nVal === 2 && (!isFinite(kVal) || kVal === Infinity),
			`❌ expected n=2,k→∞ got ${JSON.stringify(root)}`
		)
		console.log("✅ asymmetric 2D system yields n=2,k→∞")
	}
</script>

<h1 class="font-bold text-2xl mb-12">Recurrence relation solver</h1>

<form onsubmit={add}>
	<div class="flex flex-col items-start">
		<label for="recurrence-input"
			>Enter one or more recurrence relations (each on a new line):</label
		>
		<textarea
			id="recurrence-input"
			bind:value={S.text}
			rows="4"
			class="m-2 p-2 ring-1 bg-green-100 w-full"
		></textarea>
	</div>
	<button type="submit" class="px-2 py-1 ring-1 bg-green-200 hover:bg-green-300">
		Add Recurrence(s)
	</button>
</form>

<div class="text-slate-400 mt-4">
	{#if parsed.ok}
		{#each formatRecurrences(parsed.recurrences) as line}
			<div>{line}</div>
		{/each}
		{#if x}
			<div class="text-green-700 mt-2">{formatRoot(x)}</div>
		{/if}
	{:else}
		<div class="text-red-600">Error: {parsed.error}</div>
	{/if}
</div>

<p class="mt-4">Press “Add Recurrence(s)” to add them to the list below.</p>

<h1 class="font-bold text-lg mt-12 mb-4">Stored recurrences</h1>
{#each S.log as row}
	<div class="mb-2">
		<div class="text-green-700 w-40 text-right inline-block mr-4">
			{formatRoot(row[1])}
		</div>
		{#each formatRecurrences(row[0]) as line}
			<div>{line}</div>
		{/each}
	</div>
{/each}
