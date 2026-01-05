import { describe, expect, test } from "bun:test"
import { Graph, type GraphEdge, type GraphNode } from "./graph"

describe("Graph", () => {
	const nodes: GraphNode[] = [
		{ id: "s1", colors: [1, 2], role: "separator" },
		{ id: "r1", colors: [1], role: "root" },
		{ id: "n1", colors: [1, 2, 3] },
		{ id: "n2", colors: [2, 3], halfedges: 1 }
	]

	const edges: GraphEdge[] = [
		{ from: "n1", to: "r1" },
		{ from: "s1", to: "n1" },
		{ from: "n2", to: "n1" }
	]

	const graph = new Graph(nodes, edges)

	test("constructor sorts nodes by role and ID", () => {
		const sortedIds = graph.nodes.map(n => n.id)
		// Order: root (r1) < undefined (n1, n2) < separator (s1)
		// n1 and n2 are both undefined, so they sort by ID: n1 < n2
		expect(sortedIds).toEqual(["r1", "n1", "n2", "s1"])
	})

	test("constructor normalizes edges", () => {
		// Edges are normalized so from <= to
		// { from: "n1", to: "r1" } -> { from: "n1", to: "r1" } (n1 > r1? No, "n" > "r" is false. "n" < "r")
		// Wait, "n1".localeCompare("r1") is -1. So "n1" < "r1".
		// Let's check:
		expect("n1" < "r1").toBe(true)

		const normalizedEdges = graph.edges
		expect(normalizedEdges).toContainEqual({ from: "n1", to: "r1" })
		expect(normalizedEdges).toContainEqual({ from: "n1", to: "s1" })
		expect(normalizedEdges).toContainEqual({ from: "n1", to: "n2" })
	})

	test("adjacent returns true for connected nodes", () => {
		expect(graph.adjacent("n1", "r1")).toBe(true)
		expect(graph.adjacent("r1", "n1")).toBe(true)
		expect(graph.adjacent("n1", "s1")).toBe(true)
	})

	test("adjacent returns false for disconnected nodes", () => {
		expect(graph.adjacent("r1", "s1")).toBe(false)
		expect(graph.adjacent("r1", "n2")).toBe(false)
	})

	test("degree computes correctly including halfedges", () => {
		// n1 has 3 neighbors (r1, s1, n2) and 0 halfedges
		expect(graph.degree("n1")).toBe(3)
		// n2 has 1 neighbor (n1) and 1 halfedge
		expect(graph.degree("n2")).toBe(2)
		// r1 has 1 neighbor (n1)
		expect(graph.degree("r1")).toBe(1)
	})

	test("openNeighborhood returns correct nodes", () => {
		// Neighbors of r1 is {n1}
		expect(Array.from(graph.openNeighborhood(["r1"]))).toEqual(["n1"])

		// Neighbors of n1 is {r1, s1, n2}
		// Open neighborhood of {r1, n1} is {s1, n2}
		const neighborhood = graph.openNeighborhood(["r1", "n1"])
		expect(neighborhood.has("s1")).toBe(true)
		expect(neighborhood.has("n2")).toBe(true)
		expect(neighborhood.size).toBe(2)
	})

	test("nodeById retrieves correct node", () => {
		const node = graph.nodeById["n2"]
		expect(node).toBeDefined()
		expect(node?.id).toBe("n2")
		expect(node?.halfedges).toBe(1)
	})
})
