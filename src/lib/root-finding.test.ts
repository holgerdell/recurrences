// root-finding.test.ts
import { describe, test, expect } from "bun:test"
import {
	snapInt,
	formatNumber,
	formatAsymptotics,
	evaluatePolynomial,
	evaluateMonomial,
	systemResidual,
	dominantRoot,
	type Monomial,
	type Polynomial,
	type PolynomialSystem,
	type Root
} from "./root-finding"

// Helper for floating comparisons (non-integer roots)
const almostEqual = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

// ======================================================
//  Numeric helpers
// ======================================================

describe("Numeric utilities", () => {
	test("snapInt should snap values very close to an integer", () => {
		expect(snapInt(1.9999999)).toBe(2)
		expect(snapInt(2.0000001)).toBe(2)
		expect(snapInt(2.25)).toBe(2.25)
	})

	test("formatNumber should round up to 4 decimals and trim trailing zeros", () => {
		expect(formatNumber(2)).toBe("2")
		expect(formatNumber(2.1234)).toBe("2.1234")
		expect(formatNumber(2.123456)).toBe("2.1235")
		expect(formatNumber(Infinity)).toBe("Infinity")
	})

	test("formatAsymptotics should format root map into asymptotic expression", () => {
		expect(formatAsymptotics({ n: 2 })).toBe("O(2^n)")
		expect(formatAsymptotics({ n: 2, m: 3 })).toBe("O(2^n·3^m)")
		expect(formatAsymptotics(null)).toBe("")
	})
})

// ======================================================
//  Polynomial evaluation
// ======================================================

describe("Polynomial evaluation", () => {
	test("evaluateMonomial should compute product of variable powers", () => {
		const m: Monomial = { x: 2, y: 1 }
		const vals: Root = { x: 3, y: 4 }
		// 3^2 * 4^1 = 9 * 4 = 36
		expect(evaluateMonomial(m, vals)).toBe(36)
	})

	test("evaluatePolynomial should sum all term contributions", () => {
		const poly: Polynomial = {
			variables: ["x", "y"],
			terms: [
				{ coefficient: 1, monomial: { x: 1 } },
				{ coefficient: 2, monomial: { y: 2 } },
				{ coefficient: -3, monomial: {} }
			]
		}
		const val = evaluatePolynomial(poly, { x: 3, y: 2 })
		// 1*(3) + 2*(4) - 3 = 3 + 8 - 3 = 8
		expect(val).toBe(8)
	})

	test("systemResidual should compute max absolute error across multiple polynomials", () => {
		const polys: PolynomialSystem = {
			variables: ["x"],
			polynomials: [
				{
					variables: ["x"],
					terms: [
						{ coefficient: 1, monomial: { x: 1 } },
						{ coefficient: -2, monomial: {} }
					]
				},
				{ variables: ["x"], terms: [{ coefficient: 1, monomial: {} }] }
			]
		}
		const res = systemResidual(polys, { x: 2 })
		// First eq: 2 - 2 = 0, second eq: 1 -> error = 1
		expect(res).toBe(1)
	})
})

// ======================================================
//  Dominant root solving
// ======================================================

describe("dominantRoot solver", () => {
	test("should return unity roots for an empty system (O(1))", () => {
		const sys: PolynomialSystem = { polynomials: [], variables: ["n", "m"] }
		const root = dominantRoot(sys)
		expect(root).not.toBe(null)
		if (root !== null) {
			expect(root).toEqual({ n: 1, m: 1 })
		}
	})

	test("should return unity roots for all-constant polynomials", () => {
		const sys: PolynomialSystem = {
			variables: ["n"],
			polynomials: [
				{
					variables: ["n"],
					terms: [{ coefficient: 5, monomial: {} }]
				}
			]
		}
		const root = dominantRoot(sys)
		expect(root).not.toBe(null)
		if (root !== null) {
			expect(root.n).toBe(1)
		}
	})

	test("should correctly find a single 1D root (1 - 2x^-1 = 0  =>  x = 2)", () => {
		const sys: PolynomialSystem = {
			variables: ["x"],
			polynomials: [
				{
					variables: ["x"],
					terms: [
						{ coefficient: 1, monomial: {} },
						{ coefficient: -2, monomial: { x: -1 } }
					]
				}
			]
		}
		const root = dominantRoot(sys)
		expect(root).not.toBe(null)
		if (root !== null) {
			expect(root.x).toBe(2)
		}
	})

	test("should find the golden ratio in a Fibonacci-like 1D polynomial", () => {
		// Characteristic: 1 - x^-1 - x^-2 = 0
		const poly: Polynomial = {
			variables: ["x"],
			terms: [
				{ coefficient: 1, monomial: {} },
				{ coefficient: -1, monomial: { x: -1 } },
				{ coefficient: -1, monomial: { x: -2 } }
			]
		}
		const sys: PolynomialSystem = { variables: ["x"], polynomials: [poly] }
		const root = dominantRoot(sys)
		expect(root).not.toBe(null)
		if (root !== null) {
			expect(almostEqual(root.x, 1.61803398875)).toBe(true)
		}
	})

	test("should solve a basic 2D symmetric system: 1 - x^-1 - y^-1 = 0 → x = y = 2", () => {
		const poly: Polynomial = {
			variables: ["x", "y"],
			terms: [
				{ coefficient: 1, monomial: {} },
				{ coefficient: -1, monomial: { x: -1 } },
				{ coefficient: -1, monomial: { y: -1 } }
			]
		}
		const sys: PolynomialSystem = { variables: ["x", "y"], polynomials: [poly] }
		const root = dominantRoot(sys)
		expect(root).not.toBe(null)
		if (root !== null) {
			expect(root.x).toBe(2)
			expect(root.y).toBe(2)
		}
	})

	test("should solve a higher-dimensional system progressively using known roots", () => {
		// 1D: 1 - 2*n^-1 = 0  → n = 2
		// then 2D: 1 - n^-1 - k^-1 = 0  → k = 2
		const polys: Polynomial[] = [
			{
				variables: ["n"],
				terms: [
					{ coefficient: 1, monomial: {} },
					{ coefficient: -2, monomial: { n: -1 } }
				]
			},
			{
				variables: ["n", "k"],
				terms: [
					{ coefficient: 1, monomial: {} },
					{ coefficient: -1, monomial: { n: -1 } },
					{ coefficient: -1, monomial: { k: -1 } }
				]
			}
		]
		const sys: PolynomialSystem = {
			variables: ["n", "k"],
			polynomials: polys
		}
		const root = dominantRoot(sys)
		expect(root).not.toBe(null)
		if (root !== null) {
			expect(root.n).toBe(2)
			expect(root.k).toBe(2)
		}
	})

	test("should return Infinity for monotonic non-crossing case (unbounded dimension)", () => {
		// 1D: n = 2, 2D: k = 2, 3D monotonic: z → ∞
		const polys: PolynomialSystem = {
			variables: ["x", "y", "z"],
			polynomials: [
				{
					variables: ["x"],
					terms: [
						{ coefficient: 1, monomial: {} },
						{ coefficient: -2, monomial: { x: -1 } }
					]
				},
				{
					variables: ["x", "y"],
					terms: [
						{ coefficient: 1, monomial: {} },
						{ coefficient: -1, monomial: { x: -1 } },
						{ coefficient: -1, monomial: { y: -1 } }
					]
				},
				{
					variables: ["x", "y", "z"],
					terms: [
						{ coefficient: 1, monomial: {} },
						{ coefficient: -1, monomial: { x: -1 } },
						{ coefficient: -1, monomial: { y: -1 } },
						{ coefficient: -1, monomial: { z: -1 } }
					]
				}
			]
		}

		const root = dominantRoot(polys)
		expect(root).not.toBe(null)
		if (root !== null) {
			expect(root.x).toBe(2)
			expect(root.y).toBe(2)
			expect(root.z).toBe(Infinity)
		}
	})
})

// ======================================================
//  Additional asymmetric multivariate cases
// ======================================================

test("should correctly solve an asymmetric 3D system with distinct roots", () => {
	// 1D: 1 - 2*x^-1 = 0  → x = 2
	// 2D: 1 - x^-1 - 3*y^-1 = 0 → plug x=2 → 1 - 0.5 - 3*y^-1 = 0 → y = 6
	// 3D: 1 - 0.5*x^-1 - 0.25*y^-1 - 2*z^-1 = 0 → plug x=2,y=6 → z=8
	const polys: Polynomial[] = [
		{
			variables: ["x"],
			terms: [
				{ coefficient: 1, monomial: {} },
				{ coefficient: -2, monomial: { x: -1 } }
			]
		},
		{
			variables: ["x", "y"],
			terms: [
				{ coefficient: 1, monomial: {} },
				{ coefficient: -1, monomial: { x: -1 } },
				{ coefficient: -3, monomial: { y: -1 } }
			]
		},
		{
			variables: ["x", "y", "z"],
			terms: [
				{ coefficient: 1, monomial: {} },
				{ coefficient: -0.5, monomial: { x: -1 } },
				{ coefficient: -0.25, monomial: { y: -1 } },
				{ coefficient: -2, monomial: { z: -1 } }
			]
		}
	]

	const sys: PolynomialSystem = { variables: ["x", "y", "z"], polynomials: polys }
	const root = dominantRoot(sys)
	expect(root).not.toBe(null)
	if (root !== null) {
		expect(root.x).toBe(2)
		expect(root.y).toBe(6)
		expect(almostEqual(root.z, 2.8235294117)).toBe(true)
	}
})

test("should solve a 3D system with mixed coefficients creating non-equal finite roots", () => {
	// 1D: a = 3
	// 2D: 1 - 2*a^-1 - b^-1 = 0 → 1 - 2/3 - 1/b = 0 → b = 3
	// 3D: 1 - a^-1 - 0.5*b^-1 - 0.25*c^-1 = 0 → plug a=3,b=3 -> 1 - 1/3 -1/6 -0.25/c=0 → c≈4
	const polys: Polynomial[] = [
		{
			variables: ["a"],
			terms: [
				{ coefficient: 1, monomial: {} },
				{ coefficient: -3, monomial: { a: -1 } }
			]
		},
		{
			variables: ["a", "b"],
			terms: [
				{ coefficient: 1, monomial: {} },
				{ coefficient: -2, monomial: { a: -1 } },
				{ coefficient: -1, monomial: { b: -1 } }
			]
		},
		{
			variables: ["a", "b", "c"],
			terms: [
				{ coefficient: 1, monomial: {} },
				{ coefficient: -1, monomial: { a: -1 } },
				{ coefficient: -0.5, monomial: { b: -1 } },
				{ coefficient: -0.25, monomial: { c: -1 } }
			]
		}
	]
	const sys: PolynomialSystem = { variables: ["a", "b", "c"], polynomials: polys }
	const root = dominantRoot(sys)
	expect(root).not.toBe(null)
	if (root !== null) {
		expect(root.a).toBe(3)
		expect(root.b).toBe(3)
		expect(snapInt(2 * root.c)).toBe(1)
	}
})

test("should solve a 4D asymmetric polynomial system with all positive distinct roots", () => {
	// Expected analytic roots: x1=2, x2=3, x3=4, x4=5
	const polys: Polynomial[] = [
		// 1) x1 - 2 = 0
		{
			variables: ["x1"],
			terms: [
				{ coefficient: 1, monomial: { x1: 1 } },
				{ coefficient: -2, monomial: {} }
			]
		},

		// 2) 4·x1·x2 - 12·x1 = 0
		{
			variables: ["x1", "x2"],
			terms: [
				{ coefficient: 4, monomial: { x1: 1, x2: 1 } },
				{ coefficient: -12, monomial: { x1: 1 } }
			]
		},

		// 3) -6·x1·x3 + 24·x1 + 2·x2·x3 - 8·x2 + 2·x3 - 8 = 0
		{
			variables: ["x1", "x2", "x3"],
			terms: [
				{ coefficient: -6, monomial: { x1: 1, x3: 1 } },
				{ coefficient: 24, monomial: { x1: 1 } },
				{ coefficient: 2, monomial: { x2: 1, x3: 1 } },
				{ coefficient: -8, monomial: { x2: 1 } },
				{ coefficient: 2, monomial: { x3: 1 } },
				{ coefficient: -8, monomial: {} }
			]
		},

		// 4)
		// 0.7·x1·x2·x4 − 3.5·x1·x2 − 0.7·x1·x3·x4 + 3.5·x1·x3
		// − 7·x2·x3·x4 + 35·x2·x3 + 7·x3²·x4 − 35·x3² = 0
		{
			variables: ["x1", "x2", "x3", "x4"],
			terms: [
				{ coefficient: 0.7, monomial: { x1: 1, x2: 1, x4: 1 } },
				{ coefficient: -3.5, monomial: { x1: 1, x2: 1 } },
				{ coefficient: -0.7, monomial: { x1: 1, x3: 1, x4: 1 } },
				{ coefficient: 3.5, monomial: { x1: 1, x3: 1 } },
				{ coefficient: -7, monomial: { x2: 1, x3: 1, x4: 1 } },
				{ coefficient: 35, monomial: { x2: 1, x3: 1 } },
				{ coefficient: 7, monomial: { x3: 2, x4: 1 } },
				{ coefficient: -35, monomial: { x3: 2 } }
			]
		}
	]

	const sys: PolynomialSystem = { variables: ["x1", "x2", "x3", "x4"], polynomials: polys }
	const root = dominantRoot(sys)
	expect(root).not.toBe(null)
	if (root !== null) {
		expect(root.x1).toBe(2)
		expect(root.x2).toBe(3)
		expect(root.x3).toBe(4)
		expect(root.x4).toBe(5)
	}
})
