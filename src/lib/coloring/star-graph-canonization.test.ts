import { describe, expect, test } from "bun:test"
import { Graph, type GraphNode } from "./graph"
import {
	enumerateStarSignatures,
	colorsToMask,
	parseStarGraph,
	stringifyStarGraph,
	canonicalColorMap
} from "./star-graph-canonization"

type Leaf = Pick<GraphNode, "id" | "colors" | "halfedges">

type StarConfig = {
	center: Pick<GraphNode, "id" | "colors" | "halfedges"> & { role?: GraphNode["role"] }
	leaves: Leaf[]
}

const makeStarGraph = ({ center, leaves }: StarConfig) => {
	const nodes: GraphNode[] = [
		{
			id: center.id,
			colors: center.colors,
			halfedges: center.halfedges,
			role: center.role ?? "root"
		},
		...leaves.map(l => ({
			id: l.id,
			colors: l.colors,
			halfedges: l.halfedges
		}))
	]

	const edges = leaves.map(l => ({ from: center.id, to: l.id }))
	return new Graph(nodes, edges)
}

describe("star graph canonization", () => {
	test("stringify and parse round-trip preserves encoding", () => {
		const base = makeStarGraph({
			center: { id: "c", colors: [1, 2, 3, 4], halfedges: 2 },
			leaves: [
				{ id: "l0", colors: [1, 2], halfedges: 0 },
				{ id: "l1", colors: [2, 3, 4], halfedges: 1 },
				{ id: "l2", colors: [1, 4], halfedges: 0 }
			]
		})

		const encoded = stringifyStarGraph(base)
		const decoded = parseStarGraph(encoded)

		expect(stringifyStarGraph(decoded)).toBe(encoded)
	})

	test("stringify is stable under leaf and color permutations", () => {
		const canonical = makeStarGraph({
			center: { id: "c", colors: [1, 2, 3], halfedges: 1 },
			leaves: [
				{ id: "l0", colors: [1, 2], halfedges: 0 },
				{ id: "l1", colors: [2, 3], halfedges: 1 },
				{ id: "l2", colors: [1, 3], halfedges: 0 }
			]
		})

		const permuted = makeStarGraph({
			center: { id: "c", colors: [2, 3, 1], halfedges: 1 },
			leaves: [
				{ id: "l2", colors: [3, 1], halfedges: 0 },
				{ id: "l1", colors: [3, 2], halfedges: 1 },
				{ id: "l0", colors: [2, 1], halfedges: 0 }
			]
		})

		const canonicalEncoding = stringifyStarGraph(canonical)
		const permutedEncoding = stringifyStarGraph(permuted)

		expect(permutedEncoding).toBe(canonicalEncoding)
	})

	test("parse rejects invalid encodings", () => {
		expect(() => parseStarGraph("not-a-star" as string)).toThrow()
	})

	test("enumeration yields unique, canonical, parseable signatures", () => {
		const signatures = Array.from(enumerateStarSignatures(3, 2, 3, 3))

		// All signatures are already canonical and parseable
		for (const sig of signatures) {
			expect(stringifyStarGraph(parseStarGraph(sig))).toBe(sig)
		}

		// No duplicates
		expect(new Set(signatures).size).toBe(signatures.length)
	})

	test("enumeration includes trivial single-leaf cases", () => {
		const signatures = Array.from(enumerateStarSignatures(1, 1, 1, 1))
		expect(signatures).toContain("S1-C0:1-L1:1")
		expect(signatures).not.toContain("S1-C0:1-L1:2")
		expect(signatures).not.toContain("S1-C0:1-L1:3")
		expect(signatures).not.toContain("S1-C0:1-L1:4")
		expect(signatures).not.toContain("S1-C0:1-L1:0")
		expect(signatures).not.toContain("S1-C0:1-L0:1")
	})

	test("colorsToMask encodes ordered and unordered inputs identically", () => {
		expect(colorsToMask([1, 2, 4])).toBe(0b1011)
		expect(colorsToMask([4, 2, 1])).toBe(0b1011)
		expect(colorsToMask([1, 3])).toBe(0b0101)
	})

	test("colorsToMask rejects out-of-range colors", () => {
		expect(() => colorsToMask([0])).toThrow()
		expect(() => colorsToMask([5])).toThrow()
		expect(() => colorsToMask([-1, 1])).toThrow()
	})

	test("parseStarGraph rejects leaf count mismatches", () => {
		expect(() => parseStarGraph("S2-C0:1-L0:1" as string)).toThrow()
	})

	test("enumerateStarSignatures small snapshot", () => {
		const signatures = Array.from(enumerateStarSignatures(2, 3, 3, 2))
		expect(signatures).toContain("S2-C0:7-L3:3|3:3")
		expect(signatures).not.toContain("S2-C0:7-L3:C|3:C")
		expect(new Set(signatures).size).toBe(signatures.length)
	})
})

test("canonicalColorMap remaps by incidence profile (leaf-heavy colors first)", () => {
	// Center colors: {1,2,3}; leaves: {2,4} and {2,3}
	const centerMask = 0b0111
	const leafMasks = [0b1010, 0b0110]

	const map = canonicalColorMap(centerMask, leafMasks)

	// Incidence profiles:
	// color 2: center=1, leaves=11  (most frequent)
	// color 3: center=1, leaves=10
	// color 1: center=1, leaves=00
	// color 4: center=0, leaves=01

	expect(map).toEqual(
		new Map([
			[2, 1], // highest leaf incidence
			[3, 2],
			[1, 3],
			[4, 4]
		])
	)

	const remap = (mask: number) => {
		let out = 0
		for (let c = 1; c <= 4; c++) {
			if (mask & (1 << (c - 1))) {
				out |= 1 << (map.get(c)! - 1)
			}
		}
		return out
	}

	// Center stays canonical (0111 → 0111)
	expect(remap(centerMask)).toBe(0b0111)

	// Leaves remap canonically
	expect(leafMasks.map(remap)).toEqual([
		0b1001, // {2,4} → {1,4}
		0b0011 // {2,3} → {1,2}
	])
})

test("canonicalColorMap remaps by incidence profile (leaf-heavy colors first)", () => {
	// Center colors: {1}; leaves: {4} and {4}
	const centerMask = 0b0001
	const leafMasks = [0b1100, 0b1000]

	const map = canonicalColorMap(centerMask, leafMasks)

	expect(map).toEqual(
		new Map([
			[1, 1],
			[4, 2],
			[3, 3]
		])
	)

	const remap = (mask: number) => {
		let out = 0
		for (let c = 1; c <= 4; c++) {
			if (mask & (1 << (c - 1))) {
				out |= 1 << (map.get(c)! - 1)
			}
		}
		return out
	}

	// Center stays canonical (0111 → 0111)
	expect(remap(centerMask)).toBe(0b0001)

	// Leaves remap canonically
	expect(leafMasks.map(remap)).toEqual([0b0110, 0b0010])
})
