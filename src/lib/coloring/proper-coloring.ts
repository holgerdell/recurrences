import { Graph, type Color } from "./graph-utils"

/**
 * Performs a simple backtracking search to determine if a proper coloring exists.
 *
 * @param G - Graph.
 * @returns True when a valid list coloring assignment is found.
 */
export function hasProperColoring(G: Graph): boolean {
	const nodes = Array.from(G.nodes)
	if (nodes.length === 0) return true
	const assignment: Record<string, Color | undefined> = {}

	const canUse = (nodeId: string, color: Color): boolean => {
		for (const neighbor of G.neighbors(nodeId)) {
			if (assignment[neighbor] === color) return false
		}
		return true
	}

	const search = (index: number): boolean => {
		if (index === nodes.length) return true
		const node = nodes[index]
		if (node.colors.length === 0) return false
		for (const color of node.colors) {
			if (!canUse(node.id, color)) continue
			assignment[node.id] = color
			if (search(index + 1)) return true
			delete assignment[node.id]
		}
		return false
	}

	return search(0)
}
