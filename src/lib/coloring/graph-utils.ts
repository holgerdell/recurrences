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
	role?: "root" | "separator"
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
	const neighborsMap: Record<string, Set<string>> = {}
	for (const node of nodes) neighborsMap[node.id] = new Set()
	for (const edge of edges) {
		neighborsMap[edge.from].add(edge.to)
		neighborsMap[edge.to].add(edge.from)
	}
	return neighborsMap
}

/**
 * Converts an Neighbors map into a dense boolean matrix over a fixed node ordering.
 *
 * @param nodeIds - Node identifiers defining row/column order.
 * @param neighborsMap - Neighbors map produced by buildNeighborsMap.
 * @returns Boolean matrix indicating connectivity.
 */
export function buildAdjacencyMatrix(
	nodeIds: readonly string[],
	neighborsMap: Readonly<Record<string, Set<string>>>
) {
	const size = nodeIds.length
	const matrix = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
	const lookup: Record<string, number> = {}
	nodeIds.forEach((id, idx) => (lookup[id] = idx))
	for (let i = 0; i < size; i++) {
		const neighbors = neighborsMap[nodeIds[i]]
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
	const degrees: Record<string, number> = {}
	for (const node of nodes) degrees[node.id] = 0
	for (const edge of edges) {
		degrees[edge.from] = degrees[edge.from] + 1
		degrees[edge.to] = degrees[edge.to] + 1
	}
	return degrees
}

/**
 * Compute the open neighborhood of a set of vertices
 *
 * @param roots - A set of vertices, given by their IDs
 * @param edges - Graph edges describing adjacency.
 * @returns Set of node ids that are adjacent to a root vertex.
 */
export function openNeighborhood(roots: readonly string[], edges: readonly GraphEdge[]): string[] {
	const S = new Set<string>(roots)
	const neighborhood = new Set<string>()
	for (const edge of edges) {
		if (S.has(edge.from)) neighborhood.add(edge.to)
		if (S.has(edge.to)) neighborhood.add(edge.from)
	}
	return [...neighborhood].toSorted()
}
