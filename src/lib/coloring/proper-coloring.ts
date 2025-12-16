import { buildNeighborsMap, type Color, type GraphEdge, type GraphNode } from "./graph-utils"

/**
 * Performs a simple backtracking search to determine if a proper coloring exists.
 *
 * @param nodes - Graph nodes with color lists.
 * @param edges - Graph edges constraining adjacent colors.
 * @returns True when a valid list coloring assignment is found.
 */
export function hasProperColoring(
	nodes: readonly GraphNode[],
	edges: readonly GraphEdge[]
): boolean {
	if (nodes.length === 0) return true
	const neighbors = buildNeighborsMap(nodes, edges)
	const ordered: readonly GraphNode[] = nodes.toSorted((a, b) => a.colors.length - b.colors.length)
	const assignment: Record<string, Color | undefined> = {}

	const canUse = (nodeId: string, color: Color): boolean => {
		for (const neighbor of neighbors[nodeId] ?? []) {
			if (assignment[neighbor] === color) return false
		}
		return true
	}

	const search = (index: number): boolean => {
		if (index === ordered.length) return true
		const node = ordered[index]
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
