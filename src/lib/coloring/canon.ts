import { Graph, type Color, type GraphEdge, type GraphNode } from "./graph-utils"

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
	const rolestring = node.role ? `, role: "${node.role}"` : ""
	return `{ id: "${node.id}", colors: ${formatColorsLiteral(node.colors)}${rolestring} }`
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
 * Builds a code snippet template for adding a missing branching rule signature.
 *
 * @param situation - Canonical local situation lacking coverage.
 * @param index - Sequential identifier used for naming.
 * @returns Multi-line snippet string or null when the root colors are invalid.
 */
export function formatBranchingRuleTemplate(canon: Graph, index: number) {
	const nodes = Array.from(canon.nodes)
	const edges = Array.from(canon.edges)
	const rootNode = nodes.find(node => node.id === "v") ?? nodes[0]
	if (!rootNode || (rootNode.colors.length !== 2 && rootNode.colors.length !== 3)) return null
	const branches = buildBranchesFromRoot(rootNode.colors)
	const nodeLines = nodes.map(node => formatNodeLiteral(node))
	const edgeLines = edges.map(edge => formatEdgeLiteral(edge))
	const branchLines = branches.map(branch => formatBranchLiteral(branch.assignments))
	const lines: string[] = []
	lines.push("{")
	lines.push(`  name: "Generated rule ${7 + index + 1}",`)
	lines.push(`  description: "Auto-generated for missing signature ${canon.signature()}",`)
	lines.push("  before: new Graph([")
	appendLiterals(lines, nodeLines, "      ")
	lines.push("    ],")
	lines.push("    [")
	appendLiterals(lines, edgeLines, "      ")
	lines.push("    ]")
	lines.push("  ),")
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
export function buildMissingRuleSnippets(report: { missing: Graph[] }) {
	return report.missing
		.map((situation, index) => formatBranchingRuleTemplate(situation, index))
		.filter((snippet): snippet is string => Boolean(snippet))
}
