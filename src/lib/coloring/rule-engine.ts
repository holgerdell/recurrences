import { SvelteMap, SvelteSet } from "svelte/reactivity"

import type { Color, GraphEdge, GraphNode } from "./graph-utils"
import { openNeighborhood, computeDegreeMap, buildNeighborsMap } from "./graph-utils"
import {
	ALL_LOCAL_SITUATIONS,
	buildMissingRuleSnippets as buildMissingRuleSnippetsFromCanon,
	canonicalizeLocalSituations
} from "./canon"
import type { CanonicalSituation } from "./canon"
import { hasProperColoring } from "./proper-coloring"

/**
 * Represents a single branch within a rule, mapping vertex ids to new color lists.
 */
export interface Branch {
	assignments: Record<string, readonly Color[]>
}

/**
 * Declares the structure of a branching rule, including visualization metadata.
 */
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

/**
 * Captures the effect of applying a single branch, including measures and colorability.
 */
export interface BranchAnalysis {
	after: { nodes: GraphNode[]; edges: GraphEdge[] }
	measureAfter: Measure
	delta: Measure
	hasColoring: boolean
}

/**
 * Summarizes analyzer output for an entire rule and its recurrence impact.
 */
export interface RuleAnalysis {
	measureBefore: Measure
	beforeHasColoring: boolean
	branchDetails: BranchAnalysis[]
	recurrenceDisplay: string
	recurrenceEquation: string
	weightVector?: WeightVector | null
	solverDisplay?: string
	solverEquation?: string
}

/**
 * Two-component measure tracking how many degree-qualified vertices have 3 or 2 colors.
 */
export interface Measure {
	n3: number
	n2: number
}

/**
 * Weight assignment used to project two-dimensional measures into a scalar recurrence.
 */
export interface WeightVector {
	w3: number
	w2: number
}

/**
 * Report describing whether a rule set covers every canonical situation.
 */
export interface ExhaustivenessReport {
	exhaustive: boolean
	missing: CanonicalSituation[]
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

/**
 * Formats a linear measure term, omitting coefficients of zero and simplifying ones.
 *
 * @param coefficient - Numeric weight applied to the label.
 * @param label - Symbol such as `n₃` or `n₂`.
 * @returns Display string or null when the term vanishes.
 */
function formatMeasureTerm(coefficient: number, label: string) {
	if (coefficient === 0) return null
	return coefficient === 1 ? label : `${coefficient}·${label}`
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
	const initialNeighborsMap = buildNeighborsMap(rule.before.nodes, rule.before.edges)
	const listsMatch = (a: readonly Color[], b: readonly Color[]) => {
		if (a.length !== b.length) return false
		const setA = new SvelteSet(a)
		for (const color of b) {
			if (!setA.has(color)) return false
		}
		return true
	}

	const baseNodes: GraphNode[] = rule.before.nodes.map(n => {
		const assigned = assignments[n.id]

		if (assigned) {
			const removed = n.colors.filter(c => !assigned.includes(c))
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
			diff: focusSet.has(n.id) ? "root" : "unchanged"
		}
	})

	const nodeLookup = new SvelteMap(baseNodes.map(node => [node.id, node] as const))
	const enhancedNodes: GraphNode[] = baseNodes.map(node => {
		const neighbors = initialNeighborsMap[node.id]
		if (!neighbors || neighbors.size < 2 || node.colors.length === 0) return node
		const removal = new SvelteSet<Color>()
		const neighborIds = Array.from(neighbors)
		for (let i = 0; i < neighborIds.length; i++) {
			for (let j = i + 1; j < neighborIds.length; j++) {
				const left = nodeLookup.get(neighborIds[i])
				const right = nodeLookup.get(neighborIds[j])
				if (!left || !right) continue
				if (!initialNeighborsMap[left.id]?.has(right.id)) continue
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
				? [...new SvelteSet([...(node.removedColors ?? []), ...removedColors])]
				: node.removedColors,
			diff: node.diff === "root" ? "root" : "changed"
		}
	})

	const nodesById = new SvelteMap(enhancedNodes.map(node => [node.id, { ...node }]))
	let workingEdges = rule.before.edges.map(edge => ({ ...edge }))

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
		const [id_a, id_b] = pair.toSorted((lhs, rhs) => lhs.localeCompare(rhs))
		const node_a = nodesById.get(id_a)
		const node_b = nodesById.get(id_b)
		if (!node_a || !node_b) continue
		const combinedID = id_a + id_b
		const combinedRemoved = new SvelteSet([
			...(node_a.removedColors ?? []),
			...(node_b.removedColors ?? [])
		])
		const newDiff =
			node_a.diff === "root" || node_b.diff === "root"
				? "root"
				: node_a.diff === "changed" || node_b.diff === "changed"
					? "changed"
					: "unchanged"
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

/**
 * Computes the (n₃, n₂) measure for vertices with degree ≥ 3 or adjacent to the focus set.
 *
 * @param nodes - Graph nodes to evaluate.
 * @param edges - Graph edges for degree and neighbor calculations.
 * @param focus - Root ids whose open neighborhood always qualifies.
 * @returns Measure counting qualifying 3-color and 2-color vertices.
 */
function computeMeasure(
	nodes: readonly GraphNode[],
	edges: readonly GraphEdge[],
	focus: readonly string[]
): Measure {
	const degrees = computeDegreeMap(nodes, edges)
	const nonBranchingVertices = openNeighborhood(focus, edges)
	let n3 = 0
	let n2 = 0
	for (const node of nodes) {
		const qualifies = degrees[node.id] >= 3 || nonBranchingVertices.find(x => x === node.id)
		if (!qualifies) continue
		if (node.colors.length === 3) n3 += 1
		else if (node.colors.length === 2) n2 += 1
	}
	return { n3, n2 }
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

/**
 * Checks whether a given weight vector yields strictly positive drops for all branches.
 *
 * @param deltas - Measure deltas per branch.
 * @param weights - Candidate weights applied to (n₃, n₂).
 * @returns True when every weighted drop is positive.
 */
function isValidWeightVector(deltas: Measure[], weights: WeightVector) {
	return deltas.every(delta => weights.w3 * delta.n3 + weights.w2 * delta.n2 > 0)
}

/**
 * Searches a small integer grid for a weight vector that validates all deltas.
 *
 * @param deltas - Measure deltas per branch.
 * @returns Discovered weight vector or null when none work within bounds.
 */
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

/**
 * Projects the measure deltas onto a scalar recurrence using the supplied weights.
 *
 * @param deltas - Measure drops for each branch.
 * @param weights - Weight vector defining the scalar measure.
 * @returns Display/equation strings plus the list of drops.
 */
export function buildWeightedScalarRecurrence(
	deltas: Measure[],
	weights: WeightVector
): { display: string; equation: string; drops: number[] } {
	const drops = deltas.map(delta => weights.w3 * delta.n3 + weights.w2 * delta.n2)
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

/**
 * Runs the full analyzer on a rule: applies each branch, measures deltas, and builds recurrences.
 *
 * @param rule - Branching rule to analyze.
 * @returns Detailed analysis including measure drops, solver text, and invariants.
 */
export function analyzeRule(rule: BranchingRule): RuleAnalysis {
	const focus = rule.focus ?? [rule.root]
	const measureBefore = computeMeasure(rule.before.nodes, rule.before.edges, focus)
	const beforeHasColoring = hasProperColoring(rule.before.nodes, rule.before.edges)
	const branchDetails = rule.branches.map(branch => {
		const after = applyBranchWithDiff(rule, branch)
		const measureAfter = computeMeasure(after.nodes, after.edges, focus)
		const hasColoring = hasProperColoring(after.nodes, after.edges)
		const delta: Measure = {
			n3: measureBefore.n3 - measureAfter.n3,
			n2: measureBefore.n2 - measureAfter.n2
		}
		return { after, measureAfter, delta, hasColoring }
	})
	const deltas = branchDetails.map(b => b.delta)
	const { display, equation } = buildRecurrenceStrings(deltas)
	const weightVector = findWeightVector(deltas)
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
		solverEquation
	}
}

/**
 * Convenience helper that analyzes a batch of rules sequentially.
 *
 * @param rulesToAnalyze - Rules queued for analysis.
 * @returns Array of rule analysis results in the same order as input.
 */
export function analyzeRules(rulesToAnalyze: BranchingRule[]): RuleAnalysis[] {
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
	const coverage = new SvelteSet<string>()
	for (const rule of rulesToCheck) {
		const canonicalSituations = canonicalizeLocalSituations(
			rule.before.nodes,
			rule.before.edges,
			rule.root
		)
		for (const situation of canonicalSituations) coverage.add(situation.signature)
	}
	const missing = ALL_LOCAL_SITUATIONS.filter(situation => !coverage.has(situation.signature))
	return {
		exhaustive: missing.length === 0,
		missing,
		missingCount: missing.length,
		coveredCount: coverage.size,
		totalSituations: ALL_LOCAL_SITUATIONS.length
	}
}

/**
 * Generates code snippets for missing signatures using the canonical generator.
 *
 * @param report - Exhaustiveness report whose missing list will be converted.
 * @returns Array of snippet strings ready to paste into the rules file.
 */
export function buildMissingRuleSnippets(report: ExhaustivenessReport) {
	return buildMissingRuleSnippetsFromCanon(report)
}
