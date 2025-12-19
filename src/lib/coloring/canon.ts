import { SvelteMap, SvelteSet } from "svelte/reactivity"

import type { Color, GraphEdge, GraphNode } from "./graph-utils"
import { buildNeighborsMap, buildAdjacencyMatrix } from "./graph-utils"

/**
 * Canonical four-vertex situation capturing a normalized node/edge layout and its signature.
 */
export interface CanonicalSituation {
	signature: string
	nodes: GraphNode[]
	edges: GraphEdge[]
}

/**
 * Enumerates every color list considered when generating canonical neighborhoods.
 */
const COLOR_LIST_OPTIONS: readonly (readonly Color[])[] = [
	[1, 2],
	[1, 3],
	[2, 3],
	[1, 2, 3]
] as const

/**
 * Lists all neighbor orderings explored when canonicalizing adjacency.
 */
const NEIGHBOR_PERMUTATIONS: readonly [number, number, number][] = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0]
] as const

/**
 * Produces a sorted, duplicate-free list so color comparisons remain stable.
 *
 * @param colors - Raw color array drawn from a node definition.
 * @returns A normalized readonly list of colors in ascending order.
 */
function normalizeColors(colors: readonly Color[]): readonly Color[] {
	return Array.from(new SvelteSet(colors)).sort((a, b) => a - b) as readonly Color[]
}

/**
 * Checks whether two color lists contain the same values in the same order.
 *
 * @param lhs - First color combination to compare.
 * @param rhs - Second color combination to compare.
 * @returns True when the lists are identical.
 */
function listsEqual(lhs: readonly Color[], rhs: readonly Color[]) {
	if (lhs.length !== rhs.length) return false
	for (let i = 0; i < lhs.length; i++) {
		if (lhs[i] !== rhs[i]) return false
	}
	return true
}

/**
 * Detects whether any neighbor list exactly matches the root’s key, avoiding duplicates.
 *
 * @param neighborLists - Normalized neighbor color lists.
 * @param rootKey - Serialized representation of the root color list.
 * @returns True if a neighbor duplicates the root’s list.
 */
function neighborKeyMatchesRoot(neighborLists: readonly (readonly Color[])[], rootKey: string) {
	return neighborLists.some(colors => colors.length === 2 && colorsToKey(colors) === rootKey)
}

/**
 * Produces one-vertex branching assignments for every color the root can take.
 *
 * @param colors - Available colors for the root node.
 * @returns Branch descriptors where `v` is fixed to a single color.
 */
function buildBranchesFromRoot(colors: readonly Color[]) {
	return colors.map(color => ({
		assignments: { v: [color] as readonly Color[] }
	}))
}

/**
 * Converts a color list into a bracketed literal string for snippet generation.
 *
 * @param colors - Colors to stringify.
 * @returns Literal such as "[1, 2, 3]" for embedding in code.
 */
function formatColorsLiteral(colors: readonly Color[]) {
	return `[${colors.join(", ")}]`
}

/**
 * Formats a node object into a JSON-like literal line for generated snippets.
 *
 * @param node - Canonical node to format.
 * @returns String literal describing the node structure.
 */
function formatNodeLiteral(node: GraphNode) {
	return `{ id: "${node.id}", colors: ${formatColorsLiteral(node.colors)} }`
}

/**
 * Formats an edge pair into a literal string for code generation output.
 *
 * @param edge - Edge connecting two canonical nodes.
 * @returns Literal string describing the edge endpoints.
 */
function formatEdgeLiteral(edge: GraphEdge) {
	return `{ from: "${edge.from}", to: "${edge.to}" }`
}

/**
 * Converts assignment maps into deterministic literal strings for snippet building.
 *
 * @param assignments - Mapping of node ids to chosen colors.
 * @returns Sorted literal string representing the assignments.
 */
function formatAssignmentsLiteral(assignments: Record<string, readonly Color[]>) {
	const entries = Object.entries(assignments)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([id, colors]) => `${id}: ${formatColorsLiteral(colors)}`)
	return `{ ${entries.join(", ")} }`
}

/**
 * Wraps assignment literals with the `assignments` key for branch entries.
 *
 * @param assignments - Mapping of vertex ids to color lists.
 * @returns Literal string representing a branch object.
 */
function formatBranchLiteral(assignments: Record<string, readonly Color[]>) {
	return `{ assignments: ${formatAssignmentsLiteral(assignments)} }`
}

/**
 * Appends formatted literals to an array with consistent trailing commas.
 *
 * @param lines - Target array collecting formatted lines.
 * @param items - Literal strings to append.
 * @param indent - Indentation prefix for each emitted line.
 */
function appendLiterals(lines: string[], items: readonly string[], indent: string) {
	items.forEach((literal, index) => {
		const suffix = index === items.length - 1 ? "" : ","
		lines.push(`${indent}${literal}${suffix}`)
	})
}

/**
 * Creates canonical node ordering (v,a,b,c) after applying a permutation.
 *
 * @param rootColors - Colors on the root vertex.
 * @param neighborColors - Colors on each neighbor before permutation.
 * @param permutation - Permutation defining neighbor order.
 * @returns Array of graph nodes prepared for serialization.
 */
function buildAdjacencyNodes(
	rootColors: readonly Color[],
	neighborColors: readonly (readonly Color[])[],
	permutation: readonly number[]
) {
	const labels = ["v", "a", "b", "c"] as const
	const orderedNeighbors = permutation.map(index => neighborColors[index])
	const nodes: GraphNode[] = [{ id: labels[0], colors: [...rootColors] as readonly Color[] }]
	orderedNeighbors.forEach((colors, idx) => {
		nodes.push({
			id: labels[idx + 1],
			colors: [...colors] as readonly Color[]
		})
	})
	return nodes
}

/**
 * Builds canonical edge list by mapping adjacency matrix entries to ordered labels.
 *
 * @param adjacencyMatrix - Matrix over the four-vertex induced subgraph.
 * @param permutation - Neighbor permutation describing canonical order.
 * @returns List of edges between canonical labels.
 */
function buildCanonicalEdges(adjacencyMatrix: boolean[][], permutation: readonly number[]) {
	const labels = ["v", "a", "b", "c"] as const
	const order = [0, permutation[0] + 1, permutation[1] + 1, permutation[2] + 1]
	const edges: GraphEdge[] = []
	for (let i = 0; i < labels.length; i++) {
		for (let j = i + 1; j < labels.length; j++) {
			if (adjacencyMatrix[order[i]][order[j]]) edges.push({ from: labels[i], to: labels[j] })
		}
	}
	return edges
}

/**
 * Serializes a color list into a string key used for deduplication.
 *
 * @param colors - Colors to serialize.
 * @returns Joined string representation such as "123".
 */
function colorsToKey(colors: readonly Color[]) {
	return colors.join("")
}

/**
 * Determines whether a color list qualifies for local canonicalization.
 *
 * @param colors - Color list to test.
 * @returns True when the list contains two or three colors.
 */
function isEligibleList(colors: readonly Color[]) {
	return colors.length === 2 || colors.length === 3
}

/**
 * Converts a root with three neighbors into a canonical form if it meets eligibility rules.
 *
 * @param rootNode - Candidate root vertex.
 * @param neighborIds - Neighbor identifiers to include in the subset.
 * @param nodeLookup - Lookup table of all graph nodes.
 * @param neighbors - Adjacency map on the full graph.
 * @returns Canonical situation or null when the subset is invalid.
 */
function canonicalizeSubset(
	rootNode: GraphNode,
	neighborIds: readonly string[],
	nodeLookup: SvelteMap<string, GraphNode>,
	neighbors: Record<string, Set<string>>
): CanonicalSituation | null {
	if (neighborIds.length !== 3) return null
	const neighborNodes = neighborIds
		.map(id => nodeLookup.get(id))
		.filter((node): node is GraphNode => Boolean(node))
	if (neighborNodes.length !== 3) return null
	const rootColors = normalizeColors(rootNode.colors)
	const neighborColors = neighborNodes.map(node => normalizeColors(node.colors))
	if (
		rootColors.length === 2 &&
		neighborColors.some(colors => colors.length === 2 && listsEqual(colors, rootColors))
	) {
		return null
	}
	const nodeIds = [rootNode.id, ...neighborIds]
	const adjacencyMatrix = buildAdjacencyMatrix(nodeIds, neighbors)
	const colorStrings = [rootColors, ...neighborColors].map(colors => colorsToKey(colors))
	let bestSignature = ""
	let bestPermutation = NEIGHBOR_PERMUTATIONS[0]
	for (const permutation of NEIGHBOR_PERMUTATIONS) {
		const order = [0, permutation[0] + 1, permutation[1] + 1, permutation[2] + 1]
		const signature = createSignature(colorStrings, adjacencyMatrix, order)
		if (bestSignature === "" || signature < bestSignature) {
			bestSignature = signature
			bestPermutation = permutation
		}
	}
	return {
		signature: bestSignature,
		nodes: buildAdjacencyNodes(rootColors, neighborColors, bestPermutation),
		edges: buildCanonicalEdges(adjacencyMatrix, bestPermutation)
	}
}

/**
 * Produces a lexicographically comparable signature from color keys and adjacency bits.
 *
 * @param colorStrings - Serialized colors for root and neighbors.
 * @param adjacencyMatrix - Boolean adjacency matrix over the induced subgraph.
 * @param order - Index order describing the canonical permutation.
 * @returns Signature string uniquely identifying the situation.
 */
function createSignature(
	colorStrings: readonly string[],
	adjacencyMatrix: boolean[][],
	order: readonly number[]
) {
	const colorPart = order.map(index => colorStrings[index]).join("|")
	const edges: string[] = []
	for (let i = 0; i < order.length; i++) {
		for (let j = i + 1; j < order.length; j++) {
			edges.push(adjacencyMatrix[order[i]][order[j]] ? "1" : "0")
		}
	}
	return `${colorPart}:${edges.join("")}`
}

/**
 * Generates all size-k combinations of the provided items.
 *
 * @param items - Collection to draw from.
 * @param k - Desired combination length.
 * @returns Array of combinations preserving input order.
 */
function combinations<T>(items: readonly T[], k: number) {
	const results: T[][] = []
	if (k === 0) {
		results.push([])
		return results
	}
	const current: T[] = []
	const backtrack = (index: number, remaining: number) => {
		if (remaining === 0) {
			results.push([...current])
			return
		}
		for (let i = index; i <= items.length - remaining; i++) {
			current.push(items[i])
			backtrack(i + 1, remaining - 1)
			current.pop()
		}
	}
	backtrack(0, k)
	return results
}

/**
 * Enumerates unique canonical situations centered at a given root node.
 *
 * @param nodes - Nodes forming the local graph.
 * @param edges - Edges describing adjacencies.
 * @param roots - Identifier of the root vertices.
 * @returns Collection of canonical situations derived from this subgraph.
 */
export function canonicalizeLocalSituations(
	nodes: readonly GraphNode[],
	edges: readonly GraphEdge[],
	roots: readonly string[]
) {
	const nodeLookup = new SvelteMap(nodes.map(node => [node.id, node] as const))
	const rootNode = nodeLookup.get(roots[0])
	if (!rootNode || !isEligibleList(rootNode.colors)) return []
	const neighbors = buildNeighborsMap(nodes, edges)
	const eligibleNeighbors = Array.from(neighbors[roots[0]] ?? []).filter(neighborId => {
		const node = nodeLookup.get(neighborId)
		return Boolean(node && isEligibleList(node.colors))
	})
	if (eligibleNeighbors.length < 3) return []
	const seen = new SvelteSet<string>()
	const results: CanonicalSituation[] = []
	for (const subset of combinations(eligibleNeighbors, 3)) {
		const canonical = canonicalizeSubset(rootNode, subset, nodeLookup, neighbors)
		if (!canonical) continue
		if (seen.has(canonical.signature)) continue
		seen.add(canonical.signature)
		results.push(canonical)
	}
	return results
}

/**
 * Exhaustively generates every canonical situation reachable under the eligible color lists.
 *
 * @returns Array of canonical situations representing the complete search space.
 */
export function generateAllLocalSituations() {
	const seen = new SvelteMap<string, CanonicalSituation>()
	for (const rootColors of COLOR_LIST_OPTIONS) {
		const normalizedRoot = normalizeColors(rootColors)
		const rootKey = colorsToKey(normalizedRoot)
		const rootHasTwoColors = normalizedRoot.length === 2
		for (const firstNeighbor of COLOR_LIST_OPTIONS) {
			for (const secondNeighbor of COLOR_LIST_OPTIONS) {
				for (const thirdNeighbor of COLOR_LIST_OPTIONS) {
					const neighborNormalized = [
						normalizeColors(firstNeighbor),
						normalizeColors(secondNeighbor),
						normalizeColors(thirdNeighbor)
					]
					const neighborKeys = neighborNormalized.map(colors => colorsToKey(colors))
					if (new SvelteSet(neighborKeys).size !== neighborKeys.length) continue
					if (rootHasTwoColors && neighborKeyMatchesRoot(neighborNormalized, rootKey)) continue
					const nodes: GraphNode[] = [
						{ id: "root", colors: rootColors },
						{ id: "n0", colors: firstNeighbor },
						{ id: "n1", colors: secondNeighbor },
						{ id: "n2", colors: thirdNeighbor }
					]
					const edges: GraphEdge[] = [
						{ from: "root", to: "n0" },
						{ from: "root", to: "n1" },
						{ from: "root", to: "n2" }
					]
					const canonicalSituations = canonicalizeLocalSituations(nodes, edges, ["root"])
					for (const situation of canonicalSituations) {
						if (!seen.has(situation.signature)) seen.set(situation.signature, situation)
					}
				}
			}
		}
	}
	return Array.from(seen.values())
}

/**
 * Memoized list of canonical situations produced at module load for reuse.
 */
export const ALL_LOCAL_SITUATIONS = generateAllLocalSituations()

/**
 * Builds a code snippet template for adding a missing branching rule signature.
 *
 * @param situation - Canonical local situation lacking coverage.
 * @param index - Sequential identifier used for naming.
 * @returns Multi-line snippet string or null when the root colors are invalid.
 */
export function formatBranchingRuleTemplate(situation: CanonicalSituation, index: number) {
	const rootNode = situation.nodes.find(node => node.id === "v") ?? situation.nodes[0]
	if (!rootNode || (rootNode.colors.length !== 2 && rootNode.colors.length !== 3)) return null
	const branches = buildBranchesFromRoot(rootNode.colors)
	const nodeLines = situation.nodes.map(node => formatNodeLiteral(node))
	const edgeLines = situation.edges.map(edge => formatEdgeLiteral(edge))
	const branchLines = branches.map(branch => formatBranchLiteral(branch.assignments))
	const lines: string[] = []
	lines.push("{")
	lines.push(`  name: "Generated rule ${index + 1}",`)
	lines.push(`  description: "Auto-generated for missing signature ${situation.signature}",`)
	lines.push('  roots: ["v"],')
	lines.push("  before: {")
	lines.push("    nodes: [")
	appendLiterals(lines, nodeLines, "      ")
	lines.push("    ],")
	lines.push("    edges: [")
	appendLiterals(lines, edgeLines, "      ")
	lines.push("    ]")
	lines.push("  },")
	lines.push("  branches: [")
	appendLiterals(lines, branchLines, "    ")
	lines.push("  ]")
	lines.push("}")
	return lines.join("\n")
}

/**
 * Converts a report of missing situations into ready-to-paste rule snippets.
 *
 * @param report - Exhaustiveness report containing missing canonical situations.
 * @returns Array of formatted snippet strings.
 */
export function buildMissingRuleSnippets(report: { missing: CanonicalSituation[] }) {
	return report.missing
		.map((situation, index) => formatBranchingRuleTemplate(situation, index))
		.filter((snippet): snippet is string => Boolean(snippet))
}
