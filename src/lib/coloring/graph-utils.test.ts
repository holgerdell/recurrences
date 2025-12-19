import { describe, test, expect } from "bun:test"
import { generatePermutationMap, Graph } from "./graph-utils"

describe("generatePermutationMap", () => {
	const cases = [
		{ title: "length 0", list: [] as number[], expected: 1 },
		{
			title: "length 1",
			list: [72],
			expected: 1
		},
		{ title: "length 2", list: [3, 6], expected: 2 },
		{ title: "length 3", list: [0, 1, 5], expected: 6 },
		{ title: "length 4", list: [1, 2, 3, 4], expected: 24 }
	]
	for (const { title, list, expected } of cases) {
		test(`produces ${title} permutations`, () => {
			const perms = Array.from(generatePermutationMap(list))
			expect(perms.length).toBe(expected)
		})
	}
})

describe("hasAutomorphism", () => {
	test("returns true for the identity permutation", () => {
		const nodes = [
			{ id: "v", role: "root", colors: [1, 2] },
			{ id: "a", role: "separator", colors: [1, 2] }
		] as const
		const edges = [{ from: "v", to: "a" }] as const
		const G = new Graph(nodes, edges)
		expect(G.hasAutomorphism({ v: "v", a: "a" })).toBe(true)
		expect(G.hasAutomorphism({ v: "v", a: "a" }, { 1: 1, 2: 2 })).toBe(true)
		expect(G.hasAutomorphism({ v: "v", a: "a" }, { 1: 2, 2: 1 })).toBe(true)
		expect(G.hasAutomorphism({ v: "v", a: "a" }, { 1: 1, 2: 1 })).toBe(false)
		expect(G.hasAutomorphism({ v: "v", a: "v" })).toBe(false)
		expect(G.hasAutomorphism({ v: "a", a: "v" })).toBe(false)
		expect(G.hasAutomorphism({ v: "v", a: "a" }, { 1: 2, 2: 3 })).toBe(false)
	})

	test("detects adjacency mismatches on four-vertex graphs", () => {
		const nodes = [
			{ id: "v", colors: [1, 2] },
			{ id: "a", colors: [1, 2] },
			{ id: "b", colors: [1, 2] },
			{ id: "c", colors: [1, 2] }
		] as const
		const edges = [
			{ from: "v", to: "a" },
			{ from: "a", to: "b" },
			{ from: "b", to: "c" }
		]
		const G = new Graph(nodes, edges)
		expect(G.hasAutomorphism({ v: "v", a: "c", b: "a", c: "b" })).toBe(false)
		expect(G.hasAutomorphism({ v: "c", a: "b", b: "a", c: "v" })).toBe(true)
	})
})

describe("canonize", () => {
	test("produces the same representative for permuted four-vertex graphs", () => {
		const nodes = [
			{ id: "v", role: "root", colors: [1, 2, 3] },
			{ id: "a", role: "separator", colors: [1, 3] },
			{ id: "b", role: "separator", colors: [2, 3] },
			{ id: "c", role: "separator", colors: [1, 2] }
		] as const
		const edges = [
			{ from: "v", to: "a" },
			{ from: "v", to: "b" },
			{ from: "v", to: "c" }
		] as const
		const G = new Graph(nodes, edges)
		const scrambledNodes = [nodes[2], nodes[0], nodes[3], nodes[1]] as const
		const scrambledEdges = [
			{ from: "b", to: "v" },
			{ from: "c", to: "v" },
			{ from: "a", to: "v" }
		]
		const H = new Graph(scrambledNodes, scrambledEdges)
		const resultA = G.canon()
		const resultB = H.canon()
		expect(resultB.signature).toBe(resultA.signature)
	})

	test("produces the same representative for permuted four-vertex graphs", () => {
		const nodesG = [
			{ id: "v", role: "root", colors: [1, 2, 3] },
			{ id: "a", role: "separator", colors: [1, 3] },
			{ id: "b", role: "separator", colors: [1, 3] },
			{ id: "c", role: "separator", colors: [2] }
		] as const
		const nodesH = [
			{ id: "v", role: "root", colors: [3, 1, 2] },
			{ id: "a", role: "separator", colors: [2, 1] },
			{ id: "b", role: "separator", colors: [1, 2] },
			{ id: "c", role: "separator", colors: [3] }
		] as const
		const edges = [
			{ from: "v", to: "a" },
			{ from: "v", to: "b" },
			{ from: "v", to: "c" }
		] as const
		const G = new Graph(nodesG, edges)
		const H = new Graph(nodesH, edges)
		const resultA = G.canon()
		const resultB = H.canon()
		expect(resultB.signature).toBe(resultA.signature)
	})
})
