/**
 * Canonical color identifiers used throughout the coloring visualizations.
 */
export type Color = 1 | 2 | 3 | 4

/**
 * Minimal node representation used by both the rule engine and graph utilities.
 */
export interface GraphNode {
	id: string
	colors: readonly Color[]
	diff?: "root" | "changed" | "unchanged"
	removedColors?: readonly Color[]
}

/**
 * Undirected edge definition connecting two node identifiers.
 */
export interface GraphEdge {
	from: string
	to: string
}

/**
 * Builds a symmetric Neighbors map to accelerate local graph traversals.
 *
 * @param nodes - Nodes that define allowed adjacency entries.
 * @param edges - Edge list that will be inserted bidirectionally.
 * @returns Map from node id to a set of neighboring ids.
 */
export function buildNeighborsMap(nodes: readonly GraphNode[], edges: readonly GraphEdge[]) {
	const neighborsMap: Record<string, string[]> = {}
	for (const node of nodes) neighborsMap[node.id] = []
	for (const edge of edges) {
		neighborsMap[edge.from].push(edge.to)
		neighborsMap[edge.to].push(edge.from)
	}
	return neighborsMap
}

/**
 * Converts an Neighbors map into a dense boolean matrix over a fixed node ordering.
 *
 * @param nodeIds - Node identifiers defining row/column order.
 * @param adjacency - Neighbors map produced by buildNeighborsMap.
 * @returns Boolean matrix indicating connectivity.
 */
export function buildAdjacencyMatrix(
	nodeIds: readonly string[],
	adjacency: Readonly<Record<string, readonly string[]>>
) {
	const size = nodeIds.length
	const matrix = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
	const lookup: Record<string, number> = {}
	nodeIds.forEach((id, idx) => (lookup[id] = idx))
	for (let i = 0; i < size; i++) {
		const neighbors = adjacency[nodeIds[i]]
		if (!neighbors) continue
		for (const neighborId of neighbors) {
			const j = lookup[neighborId]
			if (j === undefined) continue
			matrix[i][j] = true
		}
	}
	return matrix
}

/**
 * Counts incident edges for every node to support rule measures.
 *
 * @param nodes - Graph nodes receiving degree entries.
 * @param edges - Graph edges used to increment degree counts.
 * @returns Map from node id to its degree.
 */
export function computeDegreeMap(nodes: readonly GraphNode[], edges: readonly GraphEdge[]) {
	const degrees = new Map<string, number>()
	for (const node of nodes) degrees.set(node.id, 0)
	for (const edge of edges) {
		degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1)
		degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1)
	}
	return degrees
}

/**
 * Collects all vertices adjacent to any focus vertex, marking special neighbors.
 *
 * @param focus - IDs designated as focal roots.
 * @param edges - Graph edges describing adjacency.
 * @returns Set of node ids that border a focus vertex.
 */
export function collectSpecialNeighbors(
	focus: readonly string[],
	edges: readonly GraphEdge[]
): string[] {
	const special = []
	for (const edge of edges) {
		if (edge.from in focus) special.push(edge.to)
		if (edge.to in focus) special.push(edge.from)
	}
	return special
}
