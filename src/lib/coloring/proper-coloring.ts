import { SvelteMap } from "svelte/reactivity"

import type { Color, GraphEdge, GraphNode } from "./graph-utils"

/**
 * Performs a simple backtracking search to determine if a proper coloring exists.
 *
 * @param nodes - Graph nodes with color lists.
 * @param edges - Graph edges constraining adjacent colors.
 * @returns True when a valid list coloring assignment is found.
 */
export function hasProperColoring(nodes: GraphNode[], edges: GraphEdge[]): boolean {
	if (nodes.length === 0) return true

	const adjacency = new SvelteMap<string, string[]>()
	for (const node of nodes) adjacency.set(node.id, [])
	for (const edge of edges) {
		adjacency.get(edge.from)?.push(edge.to)
		adjacency.get(edge.to)?.push(edge.from)
	}

	const ordered = [...nodes].sort((a, b) => a.colors.length - b.colors.length)
	const assignment = new SvelteMap<string, Color>()

	function backtrack(index: number): boolean {
		if (index === ordered.length) return true
		const node = ordered[index]
		if (node.colors.length === 0) return false

		for (const color of node.colors) {
			let conflict = false
			for (const neighbor of adjacency.get(node.id) ?? []) {
				if (assignment.get(neighbor) === color) {
					conflict = true
					break
				}
			}
			if (conflict) continue

			assignment.set(node.id, color)
			if (backtrack(index + 1)) return true
			assignment.delete(node.id)
		}

		return false
	}

	return backtrack(0)
}
