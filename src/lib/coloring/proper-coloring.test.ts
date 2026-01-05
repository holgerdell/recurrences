import { describe, test, expect } from "bun:test"
import { hasProperColoring } from "./proper-coloring"
import { Graph, type GraphEdge, type GraphNode } from "./graph"

const triangleEdges: GraphEdge[] = [
	{ from: "a", to: "b" },
	{ from: "b", to: "c" },
	{ from: "c", to: "a" }
]

const k4Edges: GraphEdge[] = [
	{ from: "a", to: "b" },
	{ from: "a", to: "c" },
	{ from: "a", to: "d" },
	{ from: "b", to: "c" },
	{ from: "b", to: "d" },
	{ from: "c", to: "d" }
]

describe("hasProperColoring", () => {
	test("triangle cannot be colored with only two colors", () => {
		const nodes: GraphNode[] = ["a", "b", "c"].map(id => ({
			id,
			colors: [1, 2]
		}))
		expect(hasProperColoring(new Graph(nodes, triangleEdges))).toBe(false)
	})
	test("triangle can be colored with three colors", () => {
		const nodes: GraphNode[] = ["a", "b", "c"].map(id => ({
			id,
			colors: [1, 2, 3]
		}))
		expect(hasProperColoring(new Graph(nodes, triangleEdges))).toBe(true)
	})
	test("K4 is not 3-colorable", () => {
		const nodes: GraphNode[] = ["a", "b", "c", "d"].map(id => ({
			id,
			colors: [1, 2, 3]
		}))
		expect(hasProperColoring(new Graph(nodes, k4Edges))).toBe(false)
	})
	test("K4 is 4-colorable", () => {
		const nodes: GraphNode[] = ["a", "b", "c", "d"].map(id => ({
			id,
			colors: [1, 2, 3, 4]
		}))
		expect(hasProperColoring(new Graph(nodes, k4Edges))).toBe(true)
	})
	test("K4 minus one edge is 3-colorable", () => {
		const nodes: GraphNode[] = ["a", "b", "c", "d"].map(id => ({
			id,
			colors: [1, 2, 3]
		}))
		const edges: GraphEdge[] = [...k4Edges]
		edges.pop()
		expect(hasProperColoring(new Graph(nodes, edges))).toBe(true)
	})
})
