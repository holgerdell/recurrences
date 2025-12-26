import { Graph, type Color, type GraphEdge, type GraphNode, type NodeId } from "./graph-utils"
import { hasProperColoring } from "./proper-coloring"
import { ALL_LOCAL_SITUATIONS } from "./3coloring-rules"

/**
 * Represents a single branch within a rule, mapping vertex ids to new color lists.
 */
export interface Branch {
	assignments: Record<NodeId, readonly Color[]>
}

/**
 * Declares the structure of a branching rule, including visualization metadata.
 */
export interface BranchingRule {
	situationId: number
	ruleId: number
	name: string
	description: string
	before: Graph
	branches: Branch[]
}

/**
 * Captures the effect of applying a single branch, including measures and colorability.
 */
export interface BranchAnalysis {
	after: Graph
	measureAfter: Measure
	delta: Measure
	hasColoring: boolean
}

/**
 * Summarizes analyzer output for an entire rule and its recurrence impact.
 */
export interface BranchingRuleWithAnalysis extends BranchingRule {
	measureBefore: Measure
	beforeHasColoring: boolean
	branchDetails: BranchAnalysis[]
	recurrenceDisplay: string
	recurrenceEquation: string
}

/**
 * Two-component measure tracking how many degree-qualified vertices have 3 or 2 colors.
 */
export type Measure = {
	n4: number
	n3: number
	n2: number
}

/**
 * Weight assignment used to project two-dimensional measures into a scalar recurrence.
 */
export type WeightVector = {
	w4: number
	w3: number
	w2: number
}

/**
 * Report describing whether a rule set covers every canonical situation.
 */
export interface ExhaustivenessReport {
	exhaustive: boolean
	missing: Graph[]
	missingCount: number
	coveredCount: number
	totalSituations: number
}

/**
 * Produces a human-readable fragment describing a single vertex assignment.
 *
 * @param id - Vertex identifier being described.
 * @param colors - Colors remaining on that vertex within the branch.
 * @returns Text such as "v = 1" or "v ∈ {1,2}".
 */
function describeSingleAssignment(id: string, colors: readonly Color[]) {
	if (colors.length === 1) return `${id} = ${colors[0]}`
	return `${id} ∈ {${colors.join(", ")}}`
}

/**
 * Formats a full assignment map into a sorted comma-separated description.
 *
 * @param assignments - Mapping from vertex id to remaining colors.
 * @returns Narrative description used inside UI tooltips.
 */
export function describeAssignments(assignments: Record<string, readonly Color[]>) {
	const entries = Object.entries(assignments)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([id, colors]) => describeSingleAssignment(id, colors))
	return entries.join(", ")
}

// ============================================================
// Apply branch + compute diffs
// ============================================================
/**
 * Applies branch assignments to the rule’s before-state and annotates node diffs.
 *
 * @param rule - Branching rule providing the baseline context.
 * @param branch - Specific branch assignments to apply.
 * @returns New node and edge arrays reflecting constraint propagation.
 */
function applyBranchWithDiff(rule: BranchingRule, branch: Branch): Graph {
	const roots = new Set<NodeId>()
	for (const n of rule.before.nodes) {
		if (n.role === "root") roots.add(n.id)
	}
	const assignments = branch.assignments
	const singleAssignments = Object.entries(assignments)
		.filter(([, colors]) => colors.length === 1)
		.map(([id, colors]) => ({ id, color: colors[0] as Color | undefined }))
		.filter((entry): entry is { id: string; color: Color } => entry.color !== undefined)
	const listsMatch = (a: readonly Color[], b: readonly Color[]) => {
		if (a.length !== b.length) return false
		const setA = new Set(a)
		for (const color of b) {
			if (!setA.has(color)) return false
		}
		return true
	}

	const baseNodes: GraphNode[] = Array.from(rule.before.nodes).map(n => {
		const assigned = assignments[n.id]

		if (assigned) {
			const removed = n.colors.filter(c => !assigned.includes(c))
			return {
				...n,
				colors: assigned,
				removedColors: removed.length ? removed : undefined,
				diff: "changed"
			}
		}

		const toRemove = new Set<Color>()
		for (const { id, color } of singleAssignments) {
			if (id === n.id) continue
			const adjacent = Array.from(rule.before.edges).some(
				e => (e.from === id && e.to === n.id) || (e.to === id && e.from === n.id)
			)

			if (adjacent && n.colors.includes(color)) {
				toRemove.add(color)
			}
		}

		if (toRemove.size > 0) {
			const filtered = n.colors.filter(c => !toRemove.has(c))
			const removed = n.colors.filter(c => toRemove.has(c))

			return {
				...n,
				colors: filtered,
				removedColors: removed.length ? removed : undefined,
				diff: removed.length ? "changed" : "unchanged"
			}
		}

		return {
			...n,
			diff: "unchanged"
		}
	})

	const nodeLookup = new Map(baseNodes.map(node => [node.id, node] as const))
	const enhancedNodes: GraphNode[] = baseNodes.map(node => {
		const neighbors = rule.before.neighbors(node.id)
		if (!neighbors || neighbors.size < 2 || node.colors.length === 0) return node
		const removal = new Set<Color>()
		const neighborIds = Array.from(neighbors)
		for (let i = 0; i < neighborIds.length; i++) {
			for (let j = i + 1; j < neighborIds.length; j++) {
				const left = nodeLookup.get(neighborIds[i])
				const right = nodeLookup.get(neighborIds[j])
				if (!left || !right) continue
				if (!rule.before.neighbors(left.id)?.has(right.id)) continue
				if (left.colors.length !== 2 || right.colors.length !== 2) continue
				if (!listsMatch(left.colors, right.colors)) continue
				for (const color of left.colors) removal.add(color)
			}
		}
		if (removal.size === 0) return node
		const filtered = node.colors.filter(c => !removal.has(c))
		if (filtered.length === node.colors.length) return node
		const removedColors = node.colors.filter(c => removal.has(c))
		return {
			...node,
			colors: filtered,
			removedColors: removedColors.length
				? [...new Set([...(node.removedColors ?? []), ...removedColors])]
				: node.removedColors,
			diff: "changed"
		}
	})

	const nodesById = new Map(enhancedNodes.map(node => [node.id, { ...node }]))
	let workingEdges = Array.from(rule.before.edges).map(edge => ({ ...edge }))

	const rebuildAdjacency = () => {
		const map = new Map<NodeId, Set<NodeId>>()
		for (const id of nodesById.keys()) map.set(id, new Set())
		for (const edge of workingEdges) {
			if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue
			map.get(edge.from)?.add(edge.to)
			map.get(edge.to)?.add(edge.from)
		}
		return map
	}

	const findMergePair = (adjacency: Map<NodeId, Set<NodeId>>) => {
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
		const [id_a, id_b] = pair.toSorted((lhs, rhs) => lhs.localeCompare(rhs))
		const node_a = nodesById.get(id_a)
		const node_b = nodesById.get(id_b)
		if (!node_a || !node_b) continue
		const combinedID = id_a + id_b
		const combinedRemoved = new Set([
			...(node_a.removedColors ?? []),
			...(node_b.removedColors ?? [])
		])
		const newDiff = node_a.diff === "changed" || node_b.diff === "changed" ? "changed" : "unchanged"
		nodesById.set(combinedID, {
			...node_a,
			id: combinedID,
			removedColors: combinedRemoved.size ? [...combinedRemoved] : node_a.removedColors,
			diff: newDiff
		})
		nodesById.delete(id_a)
		nodesById.delete(id_b)
		workingEdges = workingEdges
			.map(edge => ({
				from: edge.from in [id_a, id_b] ? combinedID : edge.from,
				to: edge.to in [id_a, id_b] ? combinedID : edge.to
			}))
			.filter(edge => edge.from !== edge.to)
	}

	const dedupedEdgesMap = new Map<string, GraphEdge>()
	for (const edge of workingEdges) {
		if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue
		if (
			new Set(nodesById.get(edge.from)?.colors).isDisjointFrom(
				new Set(nodesById.get(edge.to)?.colors)
			)
		)
			continue
		const [low, high] = edge.from < edge.to ? [edge.from, edge.to] : [edge.to, edge.from]
		const key = `${low}|${high}`
		if (!dedupedEdgesMap.has(key)) dedupedEdgesMap.set(key, edge)
	}
	const finalNodes: GraphNode[] = []
	for (const node of enhancedNodes) {
		const current = nodesById.get(node.id)
		if (current) finalNodes.push(current)
	}

	return new Graph(finalNodes, Array.from(dedupedEdgesMap.values()))
}

/**
 * Computes the (n₃, n₂) measure for vertices with degree ≥ 3 or adjacent to the roots.
 *
 * @param G - A graph
 * @returns Measure counting qualifying 3-color and 2-color vertices.
 */
function computeMeasure(G: Graph): Measure {
	let n4 = 0
	let n3 = 0
	let n2 = 0
	for (const node of G.nodes) {
		const qualifies = G.degree(node.id) >= 3
		if (!qualifies) continue
		if (node.colors.length === 4) n4 += 1
		else if (node.colors.length === 3) n3 += 1
		else if (node.colors.length === 2) n2 += 1
	}
	return { n4, n3, n2 }
}

/**
 * Builds TeX-like and plain recurrence strings summarizing the branch measure drops.
 *
 * @param deltas - Measure deltas for each branch.
 * @returns Display string and compact equation form.
 */
function buildRecurrenceStrings(deltas: Measure[]) {
	interface CountedDelta {
		key: string
		delta: Measure
		count: number
	}

	const map = new Map<string, CountedDelta>()
	for (const delta of deltas) {
		const key = `${delta.n3}|${delta.n2}`
		const existing = map.get(key)
		if (existing) existing.count += 1
		else map.set(key, { key, delta, count: 1 })
	}

	const makeArg = (label: "n4" | "n3" | "n2", drop: number) => {
		const displayLabel = label === "n4" ? "n₄" : label === "n3" ? "n₃" : "n₂"
		if (drop === 0) return displayLabel
		return drop < 0 ? `${displayLabel}+${-drop}` : `${displayLabel}-${drop}`
	}

	const terms = Array.from(map.values())
		// .sort((a, b) => a.delta.n3 - b.delta.n3 || a.delta.n2 - b.delta.n2)
		.map(({ delta, count }) => {
			const base = `T(${makeArg("n4", delta.n4)},${makeArg("n3", delta.n3)},${makeArg("n2", delta.n2)})`
			return count > 1 ? `${count}*${base}` : base
		})

	const lhs = "T(n₄,n₃,n₂)"
	const display = `${lhs} = ${terms.join(" + ")}`
	const equation = `${lhs}=${terms.join("+")}`
	return { display, equation }
}

/**
 * Projects the measure deltas onto a scalar recurrence using the supplied weights.
 *
 * @param deltas - Measure drops for each branch.
 * @param weights - Weight vector defining the scalar measure.
 * @returns Display/equation strings plus the list of drops.
 */
export function buildScalarRecurrence(
	deltas: Measure[],
	weights: WeightVector
): { equation: string; drops: number[]; decreasing: boolean } {
	const drops = deltas.map(
		delta => weights.w4 * delta.n4 + weights.w3 * delta.n3 + weights.w2 * delta.n2
	)
	const counts = new Map<number, number>()
	for (const drop of drops) {
		counts.set(drop, (counts.get(drop) ?? 0) + 1)
	}
	const termEntries = Array.from(counts.entries())
	if (termEntries.length === 0) {
		return {
			equation: "T(n)=T(n)",
			drops: [],
			decreasing: false
		}
	}
	const terms = termEntries
		.sort((a, b) => a[0] - b[0])
		.filter(([, count]) => count !== 0)
		.map(([drop, count]) => {
			const base = `T(n-${drop})`
			return count !== 1 ? `${count}*${base}` : base
		})
	const decreasing = termEntries.every(([drop]) => drop > 0)
	const equation = `T(n)=${terms.join("+")}`
	return { equation, drops, decreasing }
}

/**
 * Runs the full analyzer on a rule: applies each branch, measures deltas, and builds recurrences.
 *
 * @param rule - Branching rule to analyze.
 * @returns Detailed analysis including measure drops, solver text, and invariants.
 */
export function analyzeRule(rule: BranchingRule): BranchingRuleWithAnalysis {
	const measureBefore = computeMeasure(rule.before)
	const beforeHasColoring = hasProperColoring(rule.before)
	const branchDetails = rule.branches.map(branch => {
		const after = applyBranchWithDiff(rule, branch)
		const measureAfter = computeMeasure(after)
		const hasColoring = hasProperColoring(after)
		const delta: Measure = {
			n4: measureBefore.n4 - measureAfter.n4,
			n3: measureBefore.n3 - measureAfter.n3,
			n2: measureBefore.n2 - measureAfter.n2
		}
		return { after, measureAfter, delta, hasColoring }
	})
	const deltas = branchDetails.map(b => b.delta)
	const { display, equation } = buildRecurrenceStrings(deltas)
	return {
		...rule,
		measureBefore,
		beforeHasColoring,
		branchDetails,
		recurrenceDisplay: display,
		recurrenceEquation: equation
	}
}

/**
 * Convenience helper that analyzes a batch of rules sequentially.
 *
 * @param rulesToAnalyze - Rules queued for analysis.
 * @returns Array of rule analysis results in the same order as input.
 */
export function analyzeRules(rulesToAnalyze: BranchingRule[]): BranchingRuleWithAnalysis[] {
	return rulesToAnalyze.map(rule => analyzeRule(rule))
}

/**
 * Checks whether the provided rule set covers every canonical local situation.
 *
 * @param rulesToCheck - Rules evaluated for signature coverage.
 * @returns Exhaustiveness report summarizing coverage counts and missing signatures.
 */
export function testBranchingRuleExhaustiveness(
	rulesToCheck: BranchingRule[]
): ExhaustivenessReport {
	const coverage = new Set<string>()
	for (const rule of rulesToCheck) {
		const canon = rule.before.canon()
		coverage.add(canon.signature)
	}
	const missing = ALL_LOCAL_SITUATIONS.filter(situation => !coverage.has(situation.signature)).map(
		x => x.canon
	)
	return {
		exhaustive: missing.length === 0,
		missing,
		missingCount: missing.length,
		coveredCount: coverage.size,
		totalSituations: ALL_LOCAL_SITUATIONS.length
	}
}
