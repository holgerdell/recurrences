import { describe, expect, test } from "bun:test"
import { findPositiveRoot } from "./root-finding"

describe("findPositiveRoot (Brent's Method)", () => {
	test("finds root of a linear function", () => {
		// f(x) = x - 5
		const f = (x: number) => x - 5
		const root = findPositiveRoot(f)
		expect(root).toBeCloseTo(5, 10)
	})

	test("finds root of a quadratic function", () => {
		// f(x) = x^2 - 4
		const f = (x: number) => x * x - 4
		const root = findPositiveRoot(f)
		expect(root).toBeCloseTo(2, 10)
	})

	test("finds the golden ratio", () => {
		// f(x) = x^2 - x - 1
		const f = (x: number) => x * x - x - 1
		const root = findPositiveRoot(f)
		const goldenRatio = (1 + Math.sqrt(5)) / 2
		expect(root).toBeCloseTo(goldenRatio, 10)
	})

	test("expands bounds to find a large root", () => {
		// f(x) = x - 100
		const f = (x: number) => x - 100
		const root = findPositiveRoot(f, 1, 10)
		expect(root).toBeCloseTo(100, 10)
	})

	test("returns Infinity for divergent functions", () => {
		// f(x) = 1/x (never crosses zero, approaches from above)
		const f = (x: number) => 1 / x
		const root = findPositiveRoot(f)
		expect(root).toBe(Infinity)
	})

	test("returns Infinity for exponential decay (approaches zero)", () => {
		// f(x) = e^-x
		const f = (x: number) => Math.exp(-x)
		const root = findPositiveRoot(f)
		expect(root).toBe(Infinity)
	})

	test("returns null when no root is found and not divergent", () => {
		// f(x) = x^2 + 1 (always positive, doesn't approach zero)
		const f = (x: number) => x * x + 1
		const root = findPositiveRoot(f)
		expect(root).toBeNull()
	})

	test("returns null for increasing function with no root", () => {
		// f(x) = x + 1 (always positive, moves away from zero)
		const f = (x: number) => x + 1
		const root = findPositiveRoot(f)
		expect(root).toBeNull()
	})

	test("finds root exactly at loInit", () => {
		// f(x) = x - 1
		const f = (x: number) => x - 1
		const root = findPositiveRoot(f, 1, 10)
		expect(root).toBe(1)
	})

	test("handles functions that are negative at loInit", () => {
		// f(x) = 4 - x (root at 4, f(1)=3, f(10)=-6)
		const f = (x: number) => 4 - x
		const root = findPositiveRoot(f, 1, 10)
		expect(root).toBeCloseTo(4, 10)
	})
})
