import { describe, test, expect } from "bun:test"
import {
	parseRecurrences,
	formatRecurrences,
	IDENTIFIER_PATTERN,
	solveRecurrenceSystem,
	isWeightedCausal,
	type WeightedCausalDebug
} from "./recurrence-solver"
import { initGLPK } from "$lib/glpk-instance"

await initGLPK()

const almostEqual = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

describe("IDENTIFIER_PATTERN", () => {
	test("should accept valid identifiers", () => {
		expect(IDENTIFIER_PATTERN.test("T")).toBe(true)
		expect(IDENTIFIER_PATTERN.test("T_7")).toBe(true)
		expect(IDENTIFIER_PATTERN.test("n3")).toBe(true)
		expect(IDENTIFIER_PATTERN.test("fibonacci_seq")).toBe(true)
		expect(IDENTIFIER_PATTERN.test("A1B2C3")).toBe(true)
		expect(IDENTIFIER_PATTERN.test("myVar_123")).toBe(true)
	})

	test("should reject invalid identifiers", () => {
		expect(IDENTIFIER_PATTERN.test("7T")).toBe(false) // starts with digit
		expect(IDENTIFIER_PATTERN.test("_var")).toBe(false) // starts with underscore
		expect(IDENTIFIER_PATTERN.test("T-7")).toBe(false) // contains hyphen
		expect(IDENTIFIER_PATTERN.test("T 7")).toBe(false) // contains space
		expect(IDENTIFIER_PATTERN.test("T.7")).toBe(false) // contains dot
		expect(IDENTIFIER_PATTERN.test("")).toBe(false) // empty string
	})
})

describe("parseRecurrences", () => {
	test("should reject different function names", () => {
		const result = parseRecurrences(["T_1(n)=T_1(n-1)", "S_2(n)=S_2(n-1)"])
		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.error).toContain("same function name")
		}
	})

	test("should reject inconsistent argument count", () => {
		const result = parseRecurrences(["T_seq(n3)=T_seq(n3-1)", "T_seq(n3,k2)=T_seq(n3-1,k2)"])
		expect(result.ok).toBe(false)
		if (!result.ok) {
			expect(result.error).toContain("Inconsistent number of arguments")
		}
	})

	test("should parse valid simple recurrence with new naming", () => {
		const result = parseRecurrences(["T_7(n3)=2*T_7(n3-1)"])
		expect(result.ok).toBe(true)
	})

	test("should parse valid triangular recurrence with new naming", () => {
		const result = parseRecurrences([
			"Fib_2D(n1,k2)=Fib_2D(n1-1,k2)+Fib_2D(n1,k2-1)",
			"Fib_2D(n1,0)=2*Fib_2D(n1-1,0)"
		])
		expect(result.ok).toBe(true)
	})

	test("should parse 3D recurrence system with new naming", () => {
		const result = parseRecurrences([
			"T3D(n1,k2,j3)=T3D(n1-1,k2,j3)+T3D(n1,k2-1,j3)+T3D(n1,k2,j3-1)",
			"T3D(n1,k2,0)=T3D(n1-1,k2,0)+T3D(n1,k2-1,0)",
			"T3D(n1,0,0)=2*T3D(n1-1,0,0)"
		])
		expect(result.ok).toBe(true)
	})

	test("should reject invalid function names", () => {
		const result = parseRecurrences(["7T(n)=7T(n-1)"])
		expect(result.ok).toBe(false)
	})

	test("should reject invalid variable names", () => {
		const result = parseRecurrences(["T(_n)=T(_n-1)"])
		expect(result.ok).toBe(false)
	})

	test("should parse positive and negative shifts in RHS", () => {
		const result = parseRecurrences(["T(n)=T(n-2)+T(n+1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const rec = result.recurrences[0]
			const fterms = rec.terms.filter((t) => t.type === "function")
			expect(fterms.length).toBe(2)
			const v = rec.vars[0]
			const offs = fterms.map((t) => (t.type === "function" ? t.shifts[v] : 0))
			expect(offs).toContain(-2)
			expect(offs).toContain(1)
		}
	})
})

describe("solveRecurrenceSystem", () => {
	test("geometric growth with new naming", async () => {
		const result = parseRecurrences(["T_geom(n1)=2*T_geom(n1-1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = await solveRecurrenceSystem(result.recurrences)
			expect(root).not.toBeNull()
			if (root !== null) {
				expect(almostEqual(Object.values(root)[0], 2)).toBe(true)
			}
		}
	})

	test("Fibonacci sequence with new naming", async () => {
		const result = parseRecurrences(["Fib_seq(n_val)=Fib_seq(n_val-1)+Fib_seq(n_val-2)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = await solveRecurrenceSystem(result.recurrences)
			expect(root).not.toBeNull()
			if (root !== null) {
				expect(almostEqual(Object.values(root)[0], 1.61803398875)).toBe(true)
			}
		}
	})

	test("Tribonacci sequence with new naming", async () => {
		const result = parseRecurrences(["T3(n_var)=T3(n_var-1)+T3(n_var-2)+T3(n_var-3)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = await solveRecurrenceSystem(result.recurrences)
			expect(root).not.toBeNull()
			if (root !== null) {
				expect(almostEqual(Object.values(root)[0], 1.83928675521)).toBe(true)
			}
		}
	})

	test("2D triangular system with new naming", async () => {
		const result = parseRecurrences([
			"T2D(n1,k2)=T2D(n1-1,k2)+T2D(n1,k2-1)",
			"T2D(n1,0)=2*T2D(n1-1,0)"
		])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = (await solveRecurrenceSystem(result.recurrences)) as Record<string, number>
			expect(root).toBeTruthy()
			expect(almostEqual(root.n1, 2)).toBe(true)
			expect(almostEqual(root.k2, 2)).toBe(true)
		}
	})
})

describe("higher-dimensional systems", () => {
	test("Asymmetric 2D recurrence with boundary condition", async () => {
		const result = parseRecurrences(["F(m,0) = 4*F(m-1,0)", "F(m,n) = 2*F(m-1,n) + F(m,n-1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = await solveRecurrenceSystem(result.recurrences)
			expect(root).not.toBeNull()
			expect(root).not.toBe("divergent")
			if (root !== null && root !== "divergent") {
				expect(almostEqual(root.m, 4)).toBe(true)
				expect(almostEqual(root.n, 2)).toBe(true)
			}
		}
	})

	test("Symmetric 2D recurrence without boundary condition", async () => {
		const result = parseRecurrences(["F(m,n) = 2*F(m-1,n) + F(m,n-1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = await solveRecurrenceSystem(result.recurrences)
			expect(root).not.toBeNull()
			expect(root).not.toBe("divergent")
			if (root !== null && root !== "divergent") {
				expect(almostEqual(root.m, 3)).toBe(true)
				expect(almostEqual(root.n, 3)).toBe(true)
			}
		}
	})

	test("2D Delannoy-type system (lattice paths with diagonal moves)", async () => {
		// This represents counting lattice paths where you can move
		// right, up, or diagonally: (1,0), (0,1), or (1,1)
		// D(m,n) counts paths from (0,0) to (m,n)
		const result = parseRecurrences([
			"D(m,n)=D(m-1,n)+D(m,n-1)+D(m-1,n-1)" // main 2D recurrence
		])
		expect(result.ok).toBe(true)

		if (result.ok) {
			const root = (await solveRecurrenceSystem(result.recurrences)) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.m).toBe("number")
			expect(typeof root.n).toBe("number")
			// The boundary condition should give m = 2
			expect(almostEqual(root.m, 2.41421356)).toBe(true)
			// With m=2 fixed, the 2D system should give n = 3
			expect(almostEqual(root.n, 2.41421356)).toBe(true)
		}
	})

	test("3D Delannoy-type system (lattice paths in 3D)", async () => {
		// This represents counting lattice paths in 3D space where you can move
		// in three directions: (1,0,0), (0,1,0), or (0,0,1)
		// T(n,k,j) counts paths from (0,0,0) to (n,k,j)
		const result = parseRecurrences([
			"D3(n,k,j)=D3(n-1,k,j)+D3(n,k-1,j)+D3(n,k,j-1)", // main 3D recurrence
			"D3(n,k,0)=D3(n-1,k,0)+D3(n,k-1,0)", // 2D boundary (j=0)
			"D3(n,0,0)=2*D3(n-1,0,0)" // 1D boundary (k=0, j=0)
		])
		expect(result.ok).toBe(true)

		if (result.ok) {
			const root = (await solveRecurrenceSystem(result.recurrences)) as Record<string, number>
			expect(root).toBeTruthy()
			expect(root.n).toBe(2)
			expect(root.k).toBe(2)
			expect(root.j).toBe(Infinity)
		}
	})

	test("3D Trinomial-type system (symmetric lattice paths)", async () => {
		// Represents a 3D generalization where each dimension can contribute
		// symmetrically, similar to trinomial coefficients
		const result = parseRecurrences([
			"T3(x,y,z)=T3(x-1,y,z)+T3(x,y-1,z)+T3(x,y,z-1)+T3(x-1,y-1,z-1)", // main with diagonal
			"T3(x,y,0)=T3(x-1,y,0)+T3(x,y-1,0)+T3(x-1,y-1,0)", // 2D boundary
			"T3(x,0,0)=3*T3(x-1,0,0)" // 1D boundary
		])
		expect(result.ok).toBe(true)

		if (result.ok) {
			const root = (await solveRecurrenceSystem(result.recurrences)) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.x).toBe("number")
			expect(typeof root.y).toBe("number")
			expect(typeof root.z).toBe("number")
			expect(almostEqual(root.x, 3)).toBe(true)
		}
	})

	test("4D hypercubic lattice paths", async () => {
		// Represents counting paths in 4D hypercubic lattice
		// Moving in four orthogonal directions: (1,0,0,0), (0,1,0,0), (0,0,1,0), (0,0,0,1)
		const result = parseRecurrences([
			"H4(n,k,j,i)=H4(n-1,k,j,i)+H4(n,k-1,j,i)+H4(n,k,j-1,i)+H4(n,k,j,i-1)", // main 4D
			"H4(n,k,j,0)=H4(n-1,k,j,0)+H4(n,k-1,j,0)+H4(n,k,j-1,0)", // 3D boundary
			"H4(n,k,0,0)=H4(n-1,k,0,0)+H4(n,k-1,0,0)", // 2D boundary
			"H4(n,0,0,0)=2*H4(n-1,0,0,0)" // 1D boundary
		])
		expect(result.ok).toBe(true)

		if (result.ok) {
			const root = (await solveRecurrenceSystem(result.recurrences)) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.n).toBe("number")
			expect(typeof root.k).toBe("number")
			expect(typeof root.j).toBe("number")
			expect(typeof root.i).toBe("number")
			// The 1D boundary condition should dominate
			expect(almostEqual(root.n, 2)).toBe(true)
		}
	})

	test("4D Fibonacci-type system with geometric growth", async () => {
		// A 4D system where each dimension has Fibonacci-like recurrence
		// but with exponential boundary conditions
		const result = parseRecurrences([
			"F4(a,b,c,d)=F4(a-1,b,c,d)+F4(a,b-1,c,d)+F4(a,b,c-1,d)+F4(a,b,c,d-1)+F4(a-1,b-1,c-1,d-1)", // main with diagonal
			"F4(a,b,c,0)=F4(a-1,b,c,0)+F4(a,b-1,c,0)+F4(a,b,c-1,0)+F4(a-1,b-1,c-1,0)", // 3D boundary
			"F4(a,b,0,0)=F4(a-1,b,0,0)+F4(a,b-1,0,0)+F4(a-1,b-1,0,0)", // 2D boundary
			"F4(a,0,0,0)=F4(a-1,0,0,0)+F4(a-2,0,0,0)" // 1D Fibonacci
		])
		expect(result.ok).toBe(true)

		if (result.ok) {
			const root = (await solveRecurrenceSystem(result.recurrences)) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.a).toBe("number")
			expect(typeof root.b).toBe("number")
			expect(typeof root.c).toBe("number")
			expect(typeof root.d).toBe("number")
			// Should have the golden ratio from the Fibonacci boundary
			expect(almostEqual(root.a, 1.61803398875)).toBe(true)
		}
	})

	test("4D Catalan-type system", async () => {
		// Inspired by multidimensional Catalan numbers
		// Each step can be in any of 4 directions with restriction pattern
		const result = parseRecurrences([
			"C4(w,x,y,z)=C4(w-1,x,y,z)+C4(w,x-1,y,z)+C4(w,x,y-1,z)+C4(w,x,y,z-1)", // main 4D
			"C4(w,x,y,0)=C4(w-1,x,y,0)+C4(w,x-1,y,0)+C4(w,x,y-1,0)", // 3D boundary
			"C4(w,x,0,0)=2*C4(w-1,x,0,0)+C4(w,x-1,0,0)", // 2D boundary with weight
			"C4(w,0,0,0)=3*C4(w-1,0,0,0)" // 1D boundary
		])
		expect(result.ok).toBe(true)

		if (result.ok) {
			const root = (await solveRecurrenceSystem(result.recurrences)) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.w).toBe("number")
			expect(typeof root.x).toBe("number")
			expect(typeof root.y).toBe("number")
			expect(typeof root.z).toBe("number")
			expect(almostEqual(root.w, 3)).toBe(true)
		}
	})
})

describe("formatRecurrences", () => {
	test("should format simple recurrence correctly with new naming", () => {
		const result = parseRecurrences(["T_func(n_var)=2*T_func(n_var-1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const formatted = formatRecurrences(result.recurrences)
			expect(formatted[0]).toBe("T_func(n_var) = 2*T_func(n_var-1)")
		}
	})

	test("should format 2D recurrence correctly with new naming", () => {
		const result = parseRecurrences(["T_2D(n1)=T_2D(n1-1)+2T_2D(n1)"])
		expect(result.ok).toBe(true)
	})

	test("should format mixed positive/negative shifts correctly", () => {
		const result = parseRecurrences(["T(n)=T(n-2)+T(n+1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const formatted = formatRecurrences(result.recurrences)
			expect(formatted[0]).toBe("T(n) = T(n-2) + T(n+1)")
		}
	})
})

const printDebug = (name: string, dbg: WeightedCausalDebug) => {
	console.group(`Result for ${name}`)
	console.log(`Feasible: ${dbg.feasible}`)
	console.log(`Status: ${dbg.statusName}`)
	console.log(`Weights:`, dbg.weights)
	dbg.dotProducts?.forEach((d) =>
		console.log(`  shift [${d.shift.join(", ")}] · w = ${d.dot.toFixed(6)}`)
	)
	console.groupEnd()
}

describe("isWeightedCausal (LP-based, diagnostic mode)", () => {
	//
	// 🚫 Divergent systems
	//
	const divergent = [
		"T(n)=T(n)", // self ref
		"T(n)=T(n+1)", // forward
		"F(n)=F(n-1)+F(n+1)", // mixed
		"D(n,m)=D(n,m+1)", // forward in m
		"D(n,m)=D(n,m+1)+D(n,m-1)" // symmetric — not downhill
	]

	for (const expr of divergent) {
		test(`should mark ${expr} as non-causal (divergent)`, async () => {
			const result = parseRecurrences([expr])
			expect(result.ok).toBe(true)
			if (!result.ok) return

			const dbg = await isWeightedCausal(result.recurrences)
			expect(dbg.feasible).toBe(false)
			if (dbg.feasible) printDebug(expr, dbg)
		})
	}

	//
	// ✅ Causal (non-divergent) systems
	//
	const causal = [
		"T(n)=T(n-1)+T(n-2)", // Fibonacci
		"T(n,m)=2*T(n-1,m)+T(n,m-1)", // monotone 2D
		"D(n,m)=D(n-1,m)+D(n,m-1)+D(n-1,m-1)", // Delannoy
		"S(i,j)=S(i-2,j+1)", // mixed but consistent
		"A(n,m,k)=A(n-1,m,k)+A(n,m-1,k)+A(n,m,k-1)", // 3D monotone
		"T(n,m)=T(n-2,m+1)+T(n-3,m)", // mixed but downhill
		"R(x,y,z)=R(x-2,y,z+1)+R(x-1,y-3,z)", // asymmetric downhill
		"H(i,j)=H(i-1,j-2)", // all negative
		"S(n)=S(n-1)+S(n-3)", // long negative steps
		"Q(n,m,p)=Q(n-1,m+1,p)+Q(n,m-1,p+1)", // consistent hierarchy
		"A(x,y,z)=A(x+1,y-2,z+3)" // mixed signs in one term
	]

	for (const expr of causal) {
		test(`should mark ${expr} as causal (non-divergent)`, async () => {
			const result = parseRecurrences(expr)
			expect(result.ok).toBe(true)
			if (!result.ok) return

			const dbg = await isWeightedCausal(result.recurrences)
			expect(dbg.feasible).toBe(true)
			if (!dbg.feasible) printDebug(expr, dbg)
		})
	}
})
