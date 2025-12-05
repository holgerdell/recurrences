import { describe, test, expect } from "bun:test"
import {
	parseRecurrences,
	dominantRoot,
	formatRecurrences,
	snapInt,
	formatNumber,
	formatAsymptotics,
	IDENTIFIER_PATTERN
} from "./recurrence-solver"

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
		if (!result.ok) {
			expect(result.error).toContain("must match pattern [A-Za-z][A-Za-z0-9_]*")
		}
	})
})

describe("dominantRoot", () => {
	test("geometric growth with new naming", () => {
		const result = parseRecurrences(["T_geom(n1)=2*T_geom(n1-1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = dominantRoot(result.recurrences)
			expect(root).not.toBeNull()
			if (root !== null) {
				expect(almostEqual(Object.values(root)[0], 2)).toBe(true)
			}
		}
	})

	test("Fibonacci sequence with new naming", () => {
		const result = parseRecurrences(["Fib_seq(n_val)=Fib_seq(n_val-1)+Fib_seq(n_val-2)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = dominantRoot(result.recurrences)
			expect(root).not.toBeNull()
			if (root !== null) {
				expect(almostEqual(Object.values(root)[0], 1.61803398875)).toBe(true)
			}
		}
	})

	test("Tribonacci sequence with new naming", () => {
		const result = parseRecurrences(["T3(n_var)=T3(n_var-1)+T3(n_var-2)+T3(n_var-3)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = dominantRoot(result.recurrences)
			expect(root).not.toBeNull()
			if (root !== null) {
				expect(almostEqual(Object.values(root)[0], 1.83928675521)).toBe(true)
			}
		}
	})

	test("2D triangular system with new naming", () => {
		const result = parseRecurrences([
			"T2D(n1,k2)=T2D(n1-1,k2)+T2D(n1,k2-1)",
			"T2D(n1,0)=2*T2D(n1-1,0)"
		])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = dominantRoot(result.recurrences) as Record<string, number>
			expect(root).toBeTruthy()
			expect(almostEqual(root.n1, 2)).toBe(true)
			expect(almostEqual(root.k2, 2)).toBe(true)
		}
	})

	test("should return null for degenerate case", () => {
		const result = parseRecurrences(["T_deg(n1)=T_deg(n1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = dominantRoot(result.recurrences)
			expect(root).toBe(null)
		}
	})
})

describe("higher-dimensional systems", () => {
	test("Asymmetric 2D recurrence with boundary condition", () => {
		const result = parseRecurrences(["F(m,0) = 4*F(m-1,0)", "F(m,n) = 2*F(m-1,n) + F(m,n-1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = dominantRoot(result.recurrences)
			expect(root).not.toBeNull()
			if (root !== null) {
				expect(almostEqual(root.m, 4)).toBe(true)
				expect(almostEqual(root.n, 2)).toBe(true)
			}
		}
	})

	test("Symmetric 2D recurrence without boundary condition", () => {
		const result = parseRecurrences(["F(m,n) = 2*F(m-1,n) + F(m,n-1)"])
		expect(result.ok).toBe(true)
		if (result.ok) {
			const root = dominantRoot(result.recurrences)
			expect(root).not.toBeNull()
			if (root !== null) {
				expect(almostEqual(root.m, 3)).toBe(true)
				expect(almostEqual(root.n, 3)).toBe(true)
			}
		}
	})

	test("2D Delannoy-type system (lattice paths with diagonal moves)", () => {
		// This represents counting lattice paths where you can move
		// right, up, or diagonally: (1,0), (0,1), or (1,1)
		// D(m,n) counts paths from (0,0) to (m,n)
		const result = parseRecurrences([
			"D(m,n)=D(m-1,n)+D(m,n-1)+D(m-1,n-1)" // main 2D recurrence
		])
		expect(result.ok).toBe(true)

		if (result.ok) {
			const root = dominantRoot(result.recurrences) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.m).toBe("number")
			expect(typeof root.n).toBe("number")
			// The boundary condition should give m = 2
			expect(almostEqual(root.m, 2.41421356)).toBe(true)
			// With m=2 fixed, the 2D system should give n = 3
			expect(almostEqual(root.n, 2.41421356)).toBe(true)
		}
	})

	test("3D Delannoy-type system (lattice paths in 3D)", () => {
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
			const root = dominantRoot(result.recurrences) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.n).toBe("number")
			expect(typeof root.k).toBe("number")
			expect(typeof root.j).toBe("number")
			// For this system, we expect the boundary condition to dominate
			expect(almostEqual(root.n, 2)).toBe(true)
		}
	})

	test("3D Trinomial-type system (symmetric lattice paths)", () => {
		// Represents a 3D generalization where each dimension can contribute
		// symmetrically, similar to trinomial coefficients
		const result = parseRecurrences([
			"T3(x,y,z)=T3(x-1,y,z)+T3(x,y-1,z)+T3(x,y,z-1)+T3(x-1,y-1,z-1)", // main with diagonal
			"T3(x,y,0)=T3(x-1,y,0)+T3(x,y-1,0)+T3(x-1,y-1,0)", // 2D boundary
			"T3(x,0,0)=3*T3(x-1,0,0)" // 1D boundary
		])
		expect(result.ok).toBe(true)

		if (result.ok) {
			const root = dominantRoot(result.recurrences) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.x).toBe("number")
			expect(typeof root.y).toBe("number")
			expect(typeof root.z).toBe("number")
			expect(almostEqual(root.x, 3)).toBe(true)
		}
	})

	test("4D hypercubic lattice paths", () => {
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
			const root = dominantRoot(result.recurrences) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.n).toBe("number")
			expect(typeof root.k).toBe("number")
			expect(typeof root.j).toBe("number")
			expect(typeof root.i).toBe("number")
			// The 1D boundary condition should dominate
			expect(almostEqual(root.n, 2)).toBe(true)
		}
	})

	test("4D Fibonacci-type system with geometric growth", () => {
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
			const root = dominantRoot(result.recurrences) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.a).toBe("number")
			expect(typeof root.b).toBe("number")
			expect(typeof root.c).toBe("number")
			expect(typeof root.d).toBe("number")
			// Should have the golden ratio from the Fibonacci boundary
			expect(almostEqual(root.a, 1.61803398875)).toBe(true)
		}
	})

	test("4D Catalan-type system", () => {
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
			const root = dominantRoot(result.recurrences) as Record<string, number>
			expect(root).toBeTruthy()
			expect(typeof root.w).toBe("number")
			expect(typeof root.x).toBe("number")
			expect(typeof root.y).toBe("number")
			expect(typeof root.z).toBe("number")
			expect(almostEqual(root.w, 3)).toBe(true)
		}
	})
})

describe("utility functions", () => {
	test("snapInt should snap close integers", () => {
		expect(snapInt(1.9999999)).toBe(2)
		expect(snapInt(2.0000001)).toBe(2)
		expect(snapInt(1.5)).toBe(1.5)
	})

	test("formatNumber should format correctly", () => {
		expect(formatNumber(2)).toBe("2")
		expect(formatNumber(2.0)).toBe("2")
		expect(formatNumber(2.1234)).toBe("2.1234")
		expect(formatNumber(2.1234)).toBe("2.1234")
	})

	test("formatRoot should format single and multi-variable roots with new naming", () => {
		expect(formatAsymptotics({ n1: 2 })).toBe("O(2^n1)")
		expect(formatAsymptotics({ n_1: 2, k_2: 3 })).toBe("O(2^n_1·3^k_2)")
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
		if (result.ok) {
			const formatted = formatRecurrences(result.recurrences)
			expect(formatted[0]).toBe("T_2D(n1) = 2*T_2D(n1) + T_2D(n1-1)")
		}
	})
})
