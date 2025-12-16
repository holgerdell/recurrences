import { SvelteMap, SvelteSet } from "svelte/reactivity"

/**
 * Canonical color identifiers used throughout the coloring visualizations.
 */
export type Color = 1 | 2 | 3 | 4

/**
 * Minimal node representation used by both the rule engine and graph utilities.
 */
export interface GraphNode {
	id: string
	label: string
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
 * Builds a symmetric adjacency map to accelerate local graph traversals.
 *
 * @param nodes - Nodes that define allowed adjacency entries.
 * @param edges - Edge list that will be inserted bidirectionally.
 * @returns Map from node id to a set of neighboring ids.
 */
export function buildAdjacencyMap(nodes: GraphNode[], edges: GraphEdge[]) {
	const adjacency = new SvelteMap<string, SvelteSet<string>>()
	for (const node of nodes) adjacency.set(node.id, new SvelteSet())
	for (const edge of edges) {
		if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue
		adjacency.get(edge.from)?.add(edge.to)
		adjacency.get(edge.to)?.add(edge.from)
	}
	return adjacency
}

/**
 * Converts an adjacency map into a dense boolean matrix over a fixed node ordering.
 *
 * @param nodeIds - Node identifiers defining row/column order.
 * @param adjacency - Adjacency map produced by buildAdjacencyMap.
 * @returns Boolean matrix indicating connectivity.
 */
export function buildAdjacencyMatrix(
	nodeIds: readonly string[],
	adjacency: SvelteMap<string, SvelteSet<string>>
) {
	const size = nodeIds.length
	const matrix = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
	const lookup = new SvelteMap<string, number>()
	nodeIds.forEach((id, idx) => lookup.set(id, idx))
	for (let i = 0; i < size; i++) {
		const neighbors = adjacency.get(nodeIds[i])
		if (!neighbors) continue
		for (const neighborId of neighbors) {
			const j = lookup.get(neighborId)
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
export function computeDegreeMap(nodes: GraphNode[], edges: GraphEdge[]) {
	const degrees = new SvelteMap<string, number>()
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
export function collectSpecialNeighbors(focus: readonly string[], edges: GraphEdge[]) {
	const focusSet = new SvelteSet(focus)
	const special = new SvelteSet<string>()
	for (const edge of edges) {
		if (focusSet.has(edge.from)) special.add(edge.to)
		if (focusSet.has(edge.to)) special.add(edge.from)
	}
	return special
}
