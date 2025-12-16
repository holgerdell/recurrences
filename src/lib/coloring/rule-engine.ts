import { SvelteMap, SvelteSet } from "svelte/reactivity"

// ============================================================
// Domain types
// ============================================================
export type Color = 1 | 2 | 3 | 4

export interface GraphNode {
	id: string
	label: string
	colors: readonly Color[]
	diff?: "root" | "changed" | "unchanged"
	removedColors?: readonly Color[]
}

export interface GraphEdge {
	from: string
	to: string
}

export interface Branch {
	assignments: Record<string, readonly Color[]>
}

export interface BranchingRule {
	name: string
	description: string
	root: string
	focus?: readonly string[]
	before: {
		nodes: GraphNode[]
		edges: GraphEdge[]
	}
	branches: Branch[]
}

export interface BranchAnalysis {
	after: { nodes: GraphNode[]; edges: GraphEdge[] }
	measureAfter: Measure
	delta: Measure
	hasColoring: boolean
}

export interface RuleAnalysis {
	measureBefore: Measure
	beforeHasColoring: boolean
	branchDetails: BranchAnalysis[]
	recurrenceDisplay: string
	recurrenceEquation: string
	weightVector?: WeightVector | null
	solverDisplay?: string
	solverEquation?: string
	customSolution?: string | null
}

export interface Measure {
	n3: number
	n2: number
}

export interface WeightVector {
	w3: number
	w2: number
}

export interface CanonicalSituation {
	signature: string
	nodes: GraphNode[]
	edges: GraphEdge[]
}

export interface ExhaustivenessReport {
	exhaustive: boolean
	missing: CanonicalSituation[]
	missingCount: number
	coveredCount: number
	totalSituations: number
}

// ============================================================
// Canonicalization + exhaustive situation generation
// ============================================================
const COLOR_LIST_OPTIONS: readonly (readonly Color[])[] = [
	[1, 2],
	[1, 3],
	[2, 3],
	[1, 2, 3]
] as const

const NEIGHBOR_PERMUTATIONS: readonly [number, number, number][] = [
	[0, 1, 2],
	[0, 2, 1],
	[1, 0, 2],
	[1, 2, 0],
	[2, 0, 1],
	[2, 1, 0]
] as const

function normalizeColors(colors: readonly Color[]): readonly Color[] {
	return Array.from(new SvelteSet(colors)).sort((a, b) => a - b) as readonly Color[]
}

function listsEqual(lhs: readonly Color[], rhs: readonly Color[]) {
	if (lhs.length !== rhs.length) return false
	for (let i = 0; i < lhs.length; i++) {
		if (lhs[i] !== rhs[i]) return false
	}
	return true
}

function neighborKeyMatchesRoot(neighborLists: readonly (readonly Color[])[], rootKey: string) {
	return neighborLists.some((colors) => colors.length === 2 && colorsToKey(colors) === rootKey)
}

function buildBranchesFromRoot(colors: readonly Color[]) {
	return colors.map((color) => ({
		assignments: { v: [color] as readonly Color[] }
	}))
}

function formatColorsLiteral(colors: readonly Color[]) {
	return `[${colors.join(", ")}]`
}

function formatNodeLiteral(node: GraphNode) {
	return `{ id: "${node.id}", label: "${node.label}", colors: ${formatColorsLiteral(node.colors)} }`
}

function formatEdgeLiteral(edge: GraphEdge) {
	return `{ from: "${edge.from}", to: "${edge.to}" }`
}

function formatAssignmentsLiteral(assignments: Record<string, readonly Color[]>) {
	const entries = Object.entries(assignments)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([id, colors]) => `${id}: ${formatColorsLiteral(colors)}`)
	return `{ ${entries.join(", ")} }`
}

function describeSingleAssignment(id: string, colors: readonly Color[]) {
	if (colors.length === 1) return `${id} = ${colors[0]}`
	return `${id} ∈ {${colors.join(", ")}}`
}

export function describeAssignments(assignments: Record<string, readonly Color[]>) {
	const entries = Object.entries(assignments)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([id, colors]) => describeSingleAssignment(id, colors))
	return entries.join(", ")
}

function formatBranchLiteral(assignments: Record<string, readonly Color[]>) {
	return `{ assignments: ${formatAssignmentsLiteral(assignments)} }`
}

function formatMeasureTerm(coefficient: number, label: string) {
	if (coefficient === 0) return null
	return coefficient === 1 ? label : `${coefficient}·${label}`
}

function appendLiterals(lines: string[], items: readonly string[], indent: string) {
	items.forEach((literal, index) => {
		const suffix = index === items.length - 1 ? "" : ","
		lines.push(`${indent}${literal}${suffix}`)
	})
}

function formatBranchingRuleTemplate(situation: CanonicalSituation, index: number) {
	const rootNode = situation.nodes.find((node) => node.id === "v") ?? situation.nodes[0]
	if (!rootNode || (rootNode.colors.length !== 2 && rootNode.colors.length !== 3)) return null
	const branches = buildBranchesFromRoot(rootNode.colors)
	const nodeLines = situation.nodes.map((node) => formatNodeLiteral(node))
	const edgeLines = situation.edges.map((edge) => formatEdgeLiteral(edge))
	const branchLines = branches.map((branch) => formatBranchLiteral(branch.assignments))
	const lines: string[] = []
	lines.push("{")
	lines.push(`  name: "Generated rule ${index + 1}",`)
	lines.push(`  description: "Auto-generated for missing signature ${situation.signature}",`)
	lines.push('  root: "v",')
	lines.push('  focus: ["v"],')
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

function isEligibleList(colors: readonly Color[]) {
	return colors.length === 2 || colors.length === 3
}

function colorsToKey(colors: readonly Color[]) {
	return colors.join("")
}

function buildAdjacencyMap(nodes: GraphNode[], edges: GraphEdge[]) {
	const adjacency = new SvelteMap<string, SvelteSet<string>>()
	for (const node of nodes) adjacency.set(node.id, new SvelteSet())
	for (const edge of edges) {
		if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue
		adjacency.get(edge.from)?.add(edge.to)
		adjacency.get(edge.to)?.add(edge.from)
	}
	return adjacency
}

function createSignature(
	colorStrings: readonly string[],
	adjacencyMatrix: boolean[][],
	order: readonly number[]
) {
	const colorPart = order.map((index) => colorStrings[index]).join("|")
	const edges: string[] = []
	for (let i = 0; i < order.length; i++) {
		for (let j = i + 1; j < order.length; j++) {
			edges.push(adjacencyMatrix[order[i]][order[j]] ? "1" : "0")
		}
	}
	return `${colorPart}:${edges.join("")}`
}

function buildCanonicalNodes(
	rootColors: readonly Color[],
	neighborColors: readonly (readonly Color[])[],
	permutation: readonly number[]
) {
	const labels = ["v", "a", "b", "c"] as const
	const orderedNeighbors = permutation.map((index) => neighborColors[index])
	const nodes: GraphNode[] = [
		{ id: labels[0], label: labels[0], colors: [...rootColors] as readonly Color[] }
	]
	orderedNeighbors.forEach((colors, idx) => {
		nodes.push({
			id: labels[idx + 1],
			label: labels[idx + 1],
			colors: [...colors] as readonly Color[]
		})
	})
	return nodes
}

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

function buildAdjacencyMatrix(
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

function canonicalizeSubset(
	rootNode: GraphNode,
	neighborIds: readonly string[],
	nodeLookup: SvelteMap<string, GraphNode>,
	adjacency: SvelteMap<string, SvelteSet<string>>
): CanonicalSituation | null {
	if (neighborIds.length !== 3) return null
	const neighborNodes = neighborIds
		.map((id) => nodeLookup.get(id))
		.filter((node): node is GraphNode => Boolean(node))
	if (neighborNodes.length !== 3) return null
	const rootColors = normalizeColors(rootNode.colors)
	const neighborColors = neighborNodes.map((node) => normalizeColors(node.colors))
	if (
		rootColors.length === 2 &&
		neighborColors.some((colors) => colors.length === 2 && listsEqual(colors, rootColors))
	) {
		return null
	}
	const nodeIds = [rootNode.id, ...neighborIds]
	const adjacencyMatrix = buildAdjacencyMatrix(nodeIds, adjacency)
	const colorStrings = [rootColors, ...neighborColors].map((colors) => colorsToKey(colors))
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
		nodes: buildCanonicalNodes(rootColors, neighborColors, bestPermutation),
		edges: buildCanonicalEdges(adjacencyMatrix, bestPermutation)
	}
}

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

function canonicalizeLocalSituations(nodes: GraphNode[], edges: GraphEdge[], rootId: string) {
	const nodeLookup = new SvelteMap(nodes.map((node) => [node.id, node] as const))
	const rootNode = nodeLookup.get(rootId)
	if (!rootNode || !isEligibleList(rootNode.colors)) return []
	const adjacency = buildAdjacencyMap(nodes, edges)
	const eligibleNeighbors = Array.from(adjacency.get(rootId) ?? []).filter((neighborId) => {
		const node = nodeLookup.get(neighborId)
		return Boolean(node && isEligibleList(node?.colors ?? []))
	})
	if (eligibleNeighbors.length < 3) return []
	const seen = new SvelteSet<string>()
	const results: CanonicalSituation[] = []
	for (const subset of combinations(eligibleNeighbors, 3)) {
		const canonical = canonicalizeSubset(rootNode, subset, nodeLookup, adjacency)
		if (!canonical) continue
		if (seen.has(canonical.signature)) continue
		seen.add(canonical.signature)
		results.push(canonical)
	}
	return results
}

function generateAllLocalSituations() {
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
					const neighborKeys = neighborNormalized.map((colors) => colorsToKey(colors))
					if (new SvelteSet(neighborKeys).size !== neighborKeys.length) continue
					if (rootHasTwoColors && neighborKeyMatchesRoot(neighborNormalized, rootKey)) continue
					const nodes: GraphNode[] = [
						{ id: "root", label: "v", colors: rootColors },
						{ id: "n0", label: "u₁", colors: firstNeighbor },
						{ id: "n1", label: "u₂", colors: secondNeighbor },
						{ id: "n2", label: "u₃", colors: thirdNeighbor }
					]
					const edges: GraphEdge[] = [
						{ from: "root", to: "n0" },
						{ from: "root", to: "n1" },
						{ from: "root", to: "n2" }
					]
					const canonicalSituations = canonicalizeLocalSituations(nodes, edges, "root")
					for (const situation of canonicalSituations) {
						if (!seen.has(situation.signature)) seen.set(situation.signature, situation)
					}
				}
			}
		}
	}
	return Array.from(seen.values())
}

const ALL_LOCAL_SITUATIONS = generateAllLocalSituations()

// ============================================================
// Apply branch + compute diffs
// ============================================================
function applyBranchWithDiff(
	rule: BranchingRule,
	branch: Branch
): { nodes: GraphNode[]; edges: GraphEdge[] } {
	const focusSet = new SvelteSet(rule.focus ?? [rule.root])
	const assignments = branch.assignments
	const singleAssignments = Object.entries(assignments)
		.filter(([, colors]) => colors.length === 1)
		.map(([id, colors]) => ({ id, color: colors[0] as Color | undefined }))
		.filter((entry): entry is { id: string; color: Color } => entry.color !== undefined)
	const initialAdjacency = new SvelteMap<string, SvelteSet<string>>()
	for (const node of rule.before.nodes) initialAdjacency.set(node.id, new SvelteSet())
	for (const edge of rule.before.edges) {
		initialAdjacency.get(edge.from)?.add(edge.to)
		initialAdjacency.get(edge.to)?.add(edge.from)
	}
	const listsMatch = (a: readonly Color[], b: readonly Color[]) => {
		if (a.length !== b.length) return false
		const setA = new SvelteSet(a)
		for (const color of b) {
			if (!setA.has(color)) return false
		}
		return true
	}

	const baseNodes: GraphNode[] = rule.before.nodes.map((n) => {
		const assigned = assignments[n.id]

		if (assigned) {
			const removed = n.colors.filter((c) => !assigned.includes(c))
			return {
				...n,
				colors: assigned,
				removedColors: removed.length ? removed : undefined,
				diff: focusSet.has(n.id) ? "root" : "changed"
			}
		}

		const toRemove = new SvelteSet<Color>()
		for (const { id, color } of singleAssignments) {
			if (id === n.id) continue
			const adjacent = rule.before.edges.some(
				(e) => (e.from === id && e.to === n.id) || (e.to === id && e.from === n.id)
			)

			if (adjacent && n.colors.includes(color)) {
				toRemove.add(color)
			}
		}

		if (toRemove.size > 0) {
			const filtered = n.colors.filter((c) => !toRemove.has(c))
			const removed = n.colors.filter((c) => toRemove.has(c))

			return {
				...n,
				colors: filtered,
				removedColors: removed.length ? removed : undefined,
				diff: removed.length ? "changed" : "unchanged"
			}
		}

		return {
			...n,
			diff: focusSet.has(n.id) ? "root" : "unchanged"
		}
	})

	const nodeLookup = new SvelteMap(baseNodes.map((node) => [node.id, node] as const))
	const enhancedNodes: GraphNode[] = baseNodes.map((node) => {
		const neighbors = initialAdjacency.get(node.id)
		if (!neighbors || neighbors.size < 2 || node.colors.length === 0) return node
		const removal = new SvelteSet<Color>()
		const neighborIds = Array.from(neighbors)
		for (let i = 0; i < neighborIds.length; i++) {
			for (let j = i + 1; j < neighborIds.length; j++) {
				const left = nodeLookup.get(neighborIds[i])
				const right = nodeLookup.get(neighborIds[j])
				if (!left || !right) continue
				if (!initialAdjacency.get(left.id)?.has(right.id)) continue
				if (left.colors.length !== 2 || right.colors.length !== 2) continue
				if (!listsMatch(left.colors, right.colors)) continue
				for (const color of left.colors) removal.add(color)
			}
		}
		if (removal.size === 0) return node
		const filtered = node.colors.filter((c) => !removal.has(c))
		if (filtered.length === node.colors.length) return node
		const removedColors = node.colors.filter((c) => removal.has(c))
		return {
			...node,
			colors: filtered,
			removedColors: removedColors.length
				? [...new SvelteSet([...(node.removedColors ?? []), ...removedColors])]
				: node.removedColors,
			diff: node.diff === "root" ? "root" : "changed"
		}
	})

	const nodesById = new SvelteMap(enhancedNodes.map((node) => [node.id, { ...node }]))
	let workingEdges = rule.before.edges.map((edge) => ({ ...edge }))

	const rebuildAdjacency = () => {
		const map = new SvelteMap<string, SvelteSet<string>>()
		for (const id of nodesById.keys()) map.set(id, new SvelteSet())
		for (const edge of workingEdges) {
			if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue
			map.get(edge.from)?.add(edge.to)
			map.get(edge.to)?.add(edge.from)
		}
		return map
	}

	const findMergePair = (adjacency: SvelteMap<string, SvelteSet<string>>) => {
		for (const [cId, neighbors] of adjacency) {
			const center = nodesById.get(cId)
			if (!center || !neighbors || neighbors.size < 2) continue
			const neighborIds = Array.from(neighbors)
			for (let i = 0; i < neighborIds.length; i++) {
				for (let j = i + 1; j < neighborIds.length; j++) {
					const aId = neighborIds[i]
					const bId = neighborIds[j]
					const aNode = nodesById.get(aId)
					const bNode = nodesById.get(bId)
					if (!aNode || !bNode) continue
					if (!listsMatch(aNode.colors, bNode.colors)) continue
					if (!listsMatch(aNode.colors, center.colors)) continue
					return [aId, bId] as const
				}
			}
		}
		return null
	}

	while (true) {
		const adjacency = rebuildAdjacency()
		const pair = findMergePair(adjacency)
		if (!pair) break
		const [aId, bId] = pair
		const keep = nodesById.get(aId)
		const remove = nodesById.get(bId)
		if (!keep || !remove) continue
		const labelPieces = [keep.label, remove.label].sort((lhs, rhs) => lhs.localeCompare(rhs))
		const combinedLabel = labelPieces.join("")
		const combinedRemoved = new SvelteSet([
			...(keep.removedColors ?? []),
			...(remove.removedColors ?? [])
		])
		const newDiff =
			keep.diff === "root" || remove.diff === "root"
				? "root"
				: keep.diff === "changed" || remove.diff === "changed"
					? "changed"
					: "unchanged"
		nodesById.set(aId, {
			...keep,
			label: combinedLabel,
			removedColors: combinedRemoved.size ? [...combinedRemoved] : keep.removedColors,
			diff: newDiff
		})
		nodesById.delete(bId)
		workingEdges = workingEdges
			.map((edge) => ({
				from: edge.from === bId ? aId : edge.from,
				to: edge.to === bId ? aId : edge.to
			}))
			.filter((edge) => edge.from !== edge.to)
	}

	const dedupedEdgesMap = new SvelteMap<string, GraphEdge>()
	for (const edge of workingEdges) {
		if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue
		const [low, high] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from]
		const key = `${low}|${high}`
		if (!dedupedEdgesMap.has(key)) dedupedEdgesMap.set(key, edge)
	}
	const finalNodes: GraphNode[] = []
	for (const node of enhancedNodes) {
		const current = nodesById.get(node.id)
		if (current) finalNodes.push(current)
	}

	return {
		edges: Array.from(dedupedEdgesMap.values()),
		nodes: finalNodes
	}
}

function computeDegreeMap(nodes: GraphNode[], edges: GraphEdge[]) {
	const degrees = new SvelteMap<string, number>()
	for (const node of nodes) degrees.set(node.id, 0)
	for (const edge of edges) {
		degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1)
		degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1)
	}
	return degrees
}

function collectSpecialNeighbors(focus: readonly string[], edges: GraphEdge[]) {
	const focusSet = new SvelteSet(focus)
	const special = new SvelteSet<string>()
	for (const edge of edges) {
		if (focusSet.has(edge.from)) special.add(edge.to)
		if (focusSet.has(edge.to)) special.add(edge.from)
	}
	return special
}

function hasProperColoring(nodes: GraphNode[], edges: GraphEdge[]): boolean {
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

function computeMeasure(nodes: GraphNode[], edges: GraphEdge[], focus: readonly string[]): Measure {
	const degrees = computeDegreeMap(nodes, edges)
	const specialNeighbors = collectSpecialNeighbors(focus, edges)
	return nodes.reduce<Measure>(
		(total, node) => {
			const degree = degrees.get(node.id) ?? 0
			const qualifies = degree >= 3 || specialNeighbors.has(node.id)
			if (!qualifies) return total
			if (node.colors.length === 3) return { ...total, n3: total.n3 + 1 }
			if (node.colors.length === 2) return { ...total, n2: total.n2 + 1 }
			return total
		},
		{ n3: 0, n2: 0 }
	)
}

function buildRecurrenceStrings(deltas: Measure[]) {
	interface CountedDelta {
		key: string
		delta: Measure
		count: number
	}

	const map = new SvelteMap<string, CountedDelta>()
	for (const delta of deltas) {
		const key = `${delta.n3}|${delta.n2}`
		const existing = map.get(key)
		if (existing) existing.count += 1
		else map.set(key, { key, delta, count: 1 })
	}

	const makeArg = (label: "n3" | "n2", drop: number) => {
		const displayLabel = label === "n3" ? "n₃" : "n₂"
		if (drop === 0) return displayLabel
		return drop < 0 ? `${displayLabel}+${-drop}` : `${displayLabel}-${drop}`
	}

	const terms = Array.from(map.values())
		.sort((a, b) => a.delta.n3 - b.delta.n3 || a.delta.n2 - b.delta.n2)
		.map(({ delta, count }) => {
			const base = `T(${makeArg("n3", delta.n3)},${makeArg("n2", delta.n2)})`
			return count > 1 ? `${count}*${base}` : base
		})

	const lhs = "T(n₃,n₂)"
	const display = `${lhs} = ${terms.join(" + ")}`
	const equation = `${lhs}=${terms.join("+")}`
	return { display, equation }
}

function isValidWeightVector(deltas: Measure[], weights: WeightVector) {
	return deltas.every((delta) => weights.w3 * delta.n3 + weights.w2 * delta.n2 > 0)
}

function findWeightVector(deltas: Measure[]): WeightVector | null {
	const preferred: WeightVector = { w3: 1, w2: 1 }
	if (isValidWeightVector(deltas, preferred)) return preferred
	const MAX_WEIGHT = 12
	for (let w3 = 1; w3 <= MAX_WEIGHT; w3++) {
		for (let w2 = 0; w2 <= MAX_WEIGHT; w2++) {
			if (w3 === preferred.w3 && w2 === preferred.w2) continue
			const candidate: WeightVector = { w3, w2 }
			if (isValidWeightVector(deltas, candidate)) return candidate
		}
	}
	return null
}

function buildWeightedScalarRecurrence(
	deltas: Measure[],
	weights: WeightVector
): { display: string; equation: string; drops: number[] } {
	const drops = deltas.map((delta) => weights.w3 * delta.n3 + weights.w2 * delta.n2)
	const counts = new SvelteMap<number, number>()
	for (const drop of drops) {
		if (drop <= 0) continue
		counts.set(drop, (counts.get(drop) ?? 0) + 1)
	}
	const termEntries = Array.from(counts.entries())
	if (termEntries.length === 0) {
		return {
			display: "T(n) = T(n)",
			equation: "T(n)=T(n)",
			drops: []
		}
	}
	const terms = termEntries
		.sort((a, b) => a[0] - b[0])
		.map(([drop, count]) => {
			const base = `T(n-${drop})`
			return count > 1 ? `${count}*${base}` : base
		})
	const display = `T(n) = ${terms.join(" + ")}`
	const equation = `T(n)=${terms.join("+")}`
	return { display, equation, drops }
}

function gcdInt(a: number, b: number) {
	let x = Math.abs(a)
	let y = Math.abs(b)
	if (x === 0) return y || 1
	if (y === 0) return x || 1
	while (y !== 0) {
		const temp = x % y
		x = y
		y = temp
	}
	return x || 1
}

function formatLambdaTail(numerator: number, denominator: number) {
	if (numerator === 0) return "n₂"
	const sign = numerator > 0 ? "+" : "-"
	const absNum = Math.abs(numerator)
	const ratio = denominator === 1 ? `${absNum}` : `${absNum}/${denominator}`
	const needsCoeff = !(absNum === 1 && denominator === 1)
	const coeff = needsCoeff ? `${denominator === 1 ? ratio : `(${ratio})`}·` : ""
	const term = `${coeff}n₃`
	return `n₂ ${sign} ${term}`
}

function findN3OnlyGrowthBase(entries: Array<[number, number]>) {
	if (entries.length === 0) return null
	const evaluate = (r: number) =>
		entries.reduce((sum, [drop, count]) => sum + count * Math.pow(r, -drop), 0) - 1
	const valueAtOne = entries.reduce((total, [, count]) => total + count, 0) - 1
	if (Math.abs(valueAtOne) < 1e-9) return 1
	let low = 1
	let high = 2
	let valueAtHigh = evaluate(high)
	while (valueAtHigh > 0 && high < 1e6) {
		low = high
		high *= 2
		valueAtHigh = evaluate(high)
	}
	if (valueAtHigh > 0) return null
	let result = high
	for (let i = 0; i < 80; i++) {
		const mid = (low + high) / 2
		const value = evaluate(mid)
		if (value > 0) low = mid
		else {
			result = mid
			high = mid
		}
	}
	return result
}

function buildN3OnlyInvariantSolution(deltas: Measure[]): string | null {
	if (deltas.length === 0) return null
	if (!deltas.every((delta) => delta.n3 > 0)) return null
	const dropCounts = new SvelteMap<number, number>()
	for (const delta of deltas) {
		dropCounts.set(delta.n3, (dropCounts.get(delta.n3) ?? 0) + 1)
	}
	const entries = Array.from(dropCounts.entries()).sort((a, b) => a[0] - b[0])
	const recurrenceTerms = entries.map(([drop, count]) => {
		const base = `T(n₃-${drop})`
		return count > 1 ? `${count}*${base}` : base
	})
	const recurrence = `T(n₃) = ${recurrenceTerms.join(" + ")}`
	const growth = findN3OnlyGrowthBase(entries)
	if (growth === null) return `n₃-only invariant: ${recurrence}`
	if (growth <= 1 + 1e-6) return `n₃-only invariant: ${recurrence} ⇒ O(1)`
	const formatted = growth >= 10 ? growth.toFixed(2) : growth.toFixed(4)
	return `n₃-only invariant: ${recurrence} ⇒ O(${formatted}^{n₃})`
}

function deriveInvariantSolution(branchCount: number, deltas: Measure[]): string | null {
	if (branchCount === 0 || deltas.length === 0) return null
	const [first, ...rest] = deltas
	const identicalDrops =
		first.n3 > 0 && rest.every((delta) => delta.n3 === first.n3 && delta.n2 === first.n2)
	if (identicalDrops) {
		const dropN3 = first.n3
		const dropN2 = first.n2
		const lambdaNumerator = -dropN2
		const lambdaDenominator = dropN3
		if (!Number.isFinite(lambdaNumerator) || !Number.isFinite(lambdaDenominator)) return null
		const gcd = gcdInt(lambdaNumerator, lambdaDenominator)
		const normalizedNumerator = lambdaNumerator / gcd
		const normalizedDenominator = lambdaDenominator / gcd
		const tail = formatLambdaTail(normalizedNumerator, normalizedDenominator)
		const exponent = dropN3 === 1 ? "n₃" : `n₃/${dropN3}`
		const factor = `${branchCount}^{${exponent}}`
		return `T(n₃,n₂) = ${factor} · T(0, ${tail})`
	}
	return buildN3OnlyInvariantSolution(deltas)
}

export function analyzeRule(rule: BranchingRule): RuleAnalysis {
	const focus = rule.focus ?? [rule.root]
	const measureBefore = computeMeasure(rule.before.nodes, rule.before.edges, focus)
	const beforeHasColoring = hasProperColoring(rule.before.nodes, rule.before.edges)
	const branchDetails = rule.branches.map((branch) => {
		const after = applyBranchWithDiff(rule, branch)
		const measureAfter = computeMeasure(after.nodes, after.edges, focus)
		const hasColoring = hasProperColoring(after.nodes, after.edges)
		const rawDelta: Measure = {
			n3: measureBefore.n3 - measureAfter.n3,
			n2: measureBefore.n2 - measureAfter.n2
		}
		const delta = rawDelta.n3 === 0 && rawDelta.n2 === 0 ? { n3: 0, n2: 1 } : rawDelta
		return { after, measureAfter, delta, hasColoring }
	})
	const deltas = branchDetails.map((b) => b.delta)
	const { display, equation } = buildRecurrenceStrings(deltas)
	const weightVector = findWeightVector(deltas)
	const customSolution = deriveInvariantSolution(rule.branches.length, deltas)
	let solverDisplay: string | undefined
	let solverEquation: string | undefined
	if (weightVector) {
		const weighted = buildWeightedScalarRecurrence(deltas, weightVector)
		const components = [
			formatMeasureTerm(weightVector.w3, "n₃"),
			formatMeasureTerm(weightVector.w2, "n₂")
		].filter((part): part is string => Boolean(part))
		const measureLabel = components.join(" + ")
		solverDisplay = `Measure n = ${measureLabel}: ${weighted.display}`
		solverEquation = weighted.equation
	}
	return {
		measureBefore,
		beforeHasColoring,
		branchDetails,
		recurrenceDisplay: display,
		recurrenceEquation: equation,
		weightVector,
		solverDisplay,
		solverEquation,
		customSolution
	}
}

export function analyzeRules(rulesToAnalyze: BranchingRule[]): RuleAnalysis[] {
	return rulesToAnalyze.map((rule) => analyzeRule(rule))
}

export function testBranchingRuleExhaustiveness(
	rulesToCheck: BranchingRule[]
): ExhaustivenessReport {
	const coverage = new SvelteSet<string>()
	for (const rule of rulesToCheck) {
		const canonicalSituations = canonicalizeLocalSituations(
			rule.before.nodes,
			rule.before.edges,
			rule.root
		)
		for (const situation of canonicalSituations) coverage.add(situation.signature)
	}
	const missing = ALL_LOCAL_SITUATIONS.filter((situation) => !coverage.has(situation.signature))
	return {
		exhaustive: missing.length === 0,
		missing,
		missingCount: missing.length,
		coveredCount: coverage.size,
		totalSituations: ALL_LOCAL_SITUATIONS.length
	}
}

export function buildMissingRuleSnippets(report: ExhaustivenessReport) {
	return report.missing
		.map((situation, index) => formatBranchingRuleTemplate(situation, index))
		.filter((snippet): snippet is string => Boolean(snippet))
}
