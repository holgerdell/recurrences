import { describe, expect, test } from "bun:test"
import { Graph, type GraphNode } from "./graph"
import {
	enumerateStarSignatures,
	colorsToMask,
	parseStarGraph,
	stringifyStarGraph,
	getColorProfiles
} from "./star-graph-enumeration"

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
			center: { id: "c", colors: [0, 1, 2, 3], halfedges: 2 },
			leaves: [
				{ id: "l0", colors: [0, 1], halfedges: 0 },
				{ id: "l1", colors: [1, 2, 3], halfedges: 1 },
				{ id: "l2", colors: [0, 3], halfedges: 0 }
			]
		})

		const encoded = stringifyStarGraph(base)
		const decoded = parseStarGraph(encoded)

		expect(stringifyStarGraph(decoded)).toBe(encoded)
	})

	test("stringify is stable under leaf and color permutations", () => {
		const canonical = makeStarGraph({
			center: { id: "c", colors: [0, 1, 2], halfedges: 1 },
			leaves: [
				{ id: "l0", colors: [0, 1], halfedges: 0 },
				{ id: "l1", colors: [1, 2], halfedges: 1 },
				{ id: "l2", colors: [0, 2], halfedges: 0 }
			]
		})

		const permuted = makeStarGraph({
			center: { id: "c", colors: [1, 2, 0], halfedges: 1 },
			leaves: [
				{ id: "l2", colors: [2, 0], halfedges: 0 },
				{ id: "l1", colors: [2, 1], halfedges: 1 },
				{ id: "l0", colors: [1, 0], halfedges: 0 }
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
		expect(signatures).toContain("S1__0_0__1_0")
		expect(signatures).not.toContain("S1__0_0__1_1")
		expect(signatures).not.toContain("S1__0_0__1_01")
		expect(signatures).not.toContain("S1__0_0__1_02")
		expect(signatures).not.toContain("S1__0_0__1_3")
		expect(signatures).not.toContain("S1__0_0__0_0")
	})

	test("colorsToMask encodes ordered and unordered inputs identically", () => {
		expect(colorsToMask([0, 1, 3])).toBe(0b1011)
		expect(colorsToMask([3, 1, 0])).toBe(0b1011)
		expect(colorsToMask([0, 2])).toBe(0b0101)
	})

	test("colorsToMask rejects out-of-range colors", () => {
		expect(() => colorsToMask([4])).toThrow()
		expect(() => colorsToMask([5])).toThrow()
		expect(() => colorsToMask([-1, 1])).toThrow()
	})

	test("parseStarGraph rejects leaf count mismatches", () => {
		expect(() => parseStarGraph("S2__0_0__0_0" as string)).toThrow()
	})

	test("enumerateStarSignatures small snapshot", () => {
		const signatures = Array.from(enumerateStarSignatures(2, 3, 3, 2))
		expect(signatures).toContain("S2__0_012__3_01__3_01")
		expect(signatures).not.toContain("S2__0_012__3_23__3_23")
		expect(new Set(signatures).size).toBe(signatures.length)
	})
})

const remap = (map: Map<number, number>, mask: number) => {
	let out = 0
	for (let c = 0; c < 4; c++) {
		if (mask & (1 << c)) {
			out |= 1 << (map.get(c)! - 1)
		}
	}
	return out
}

test("getColorProfiles remaps by incidence profile (leaf-heavy colors first)", () => {
	// Center colors: {0,1,2}; leaves: {1,3} and {1,2}
	const centerMask = 0b0111
	const leafMasks = [0b1010, 0b0110]

	const profiles = getColorProfiles(centerMask, leafMasks)

	// Incidence profiles:
	// color 1: center=1, leaves=11  (most frequent)
	// color 2: center=1, leaves=01
	// color 0: center=1, leaves=00
	// color 3: center=0, leaves=10

	expect(profiles).toEqual([
		{ color: 1, centerBit: 1, leafBitsMask: 3 },
		{ color: 2, centerBit: 1, leafBitsMask: 1 },
		{ color: 0, centerBit: 1, leafBitsMask: 0 },
		{ color: 3, centerBit: 0, leafBitsMask: 2 }
	])

	const map = new Map(profiles.map((p, i) => [p.color, i + 1]))

	// Center stays canonical (0111 → 0111)
	expect(remap(map, centerMask)).toBe(0b0111)

	// Leaves remap canonically
	expect(leafMasks.map(x => remap(map, x))).toEqual([
		0b1001, // {1,3} → {0,3}
		0b0011 // {1,2} → {0,1}
	])
})

test("getColorProfiles remaps by incidence profile (leaf-heavy colors first)", () => {
	const centerMask = 0b1100
	const leafMasks = [0b1010, 0b1001, 0b1100]

	const profiles = getColorProfiles(centerMask, leafMasks)

	expect(profiles).toEqual([
		{ color: 3, centerBit: 1, leafBitsMask: 7 },
		{ color: 2, centerBit: 1, leafBitsMask: 1 },
		{ color: 0, centerBit: 0, leafBitsMask: 4 },
		{ color: 1, centerBit: 0, leafBitsMask: 2 }
	])

	const map = new Map(profiles.map((p, i) => [p.color, i + 1]))

	expect(remap(map, centerMask)).toBe(0b0011)
	expect(leafMasks.map(x => remap(map, x))).toEqual([0b1001, 0b0101, 0b0011])
})
