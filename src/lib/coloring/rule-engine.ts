import { Graph, type Color, type GraphEdge, type GraphNode, type NodeId } from "./graph"
import { features, innerProduct, type Feature, type FeatureVector } from "./featureSpace"
import { hasProperColoring } from "./proper-coloring"

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
 * Summarizes analyzer output for an entire rule and its recurrence impact.
 */
export interface BranchingRuleWithAnalysis extends BranchingRule {
	featuresBefore: FeatureVector
	beforeHasColoring: boolean
	branchDetails: ReadonlyArray<{
		after: Graph
		featuresAfter: FeatureVector
		featuresDelta: FeatureVector
		hasColoring: boolean
	}>
	recurrenceEquation: string
}

/**
 * Generate all possible branching rules for a given local situation. Note that in general, canon
 * may have multiple roots, and we only want to enumerate assignments that are compatible.
 */
export function autogenerateRules({
	canon,
	situationId
}: {
	canon: Graph
	situationId: number
}): BranchingRule[] {
	const roots = Array.from(canon.nodes).filter(node => node.role === "root")
	if (roots.length !== 1) return []

	const root = roots[0]
	if (root.colors.length === 0) return []

	const rules: BranchingRule[] = []

	if (root.colors.length >= 2) {
		const singletonBranches: BranchingRule["branches"] = root.colors.map(color => ({
			assignments: { [root.id]: [color] as readonly Color[] }
		}))
		rules.push({
			situationId,
			ruleId: rules.length,
			name: `Rule ${situationId}:${rules.length}`,
			description: `Auto-generated for situation #${situationId}`,
			before: canon,
			branches: singletonBranches
		})
	}

	// one-rest split. Eg. 1,2,3 -> 1 | 2,3
	if (root.colors.length >= 3) {
		const neighborIds = Array.from(canon.neighbors[root.id]).toSorted((a, b) => a.localeCompare(b))
		const seenTypes = new Set<string>()
		for (const color of root.colors) {
			const typeKey = neighborIds.filter(id => canon.nodeById[id]?.colors.includes(color)).join("|")
			if (seenTypes.has(typeKey)) continue
			seenTypes.add(typeKey)
			const remaining = root.colors.filter(c => c !== color) as readonly Color[]
			const splitBranches: BranchingRule["branches"] = [
				{ assignments: { [root.id]: [color] as readonly Color[] } },
				{ assignments: { [root.id]: remaining } }
			]
			rules.push({
				situationId,
				ruleId: rules.length,
				name: `Rule ${situationId}:${rules.length}`,
				description: `Auto-generated for situation #${situationId}`,
				before: canon,
				branches: splitBranches
			})
		}
	}

	// two-rest split. Eg. 1,2,3,4 -> 1,3 | 2,4
	if (root.colors.length >= 4) {
		const seenSplits = new Set<string>()
		for (let i = 0; i < root.colors.length; i++) {
			for (let j = i + 1; j < root.colors.length; j++) {
				const first = [root.colors[i], root.colors[j]] as readonly Color[]
				const second = root.colors.filter((_, idx) => idx !== i && idx !== j) as readonly Color[]
				const aKey = [...first].toSorted().join(",")
				const bKey = [...second].toSorted().join(",")
				const splitKey = aKey <= bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
				if (seenSplits.has(splitKey)) continue
				seenSplits.add(splitKey)
				const splitBranches: BranchingRule["branches"] = [
					{ assignments: { [root.id]: first } },
					{ assignments: { [root.id]: second } }
				]
				rules.push({
					situationId,
					ruleId: rules.length,
					name: `Rule ${situationId}:${rules.length}`,
					description: `Auto-generated for situation #${situationId}`,
					before: canon,
					branches: splitBranches
				})
			}
		}
	}
	return rules
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
 * Applies branch assignments for the independent set problem. In this case, color 1 means "in the
 * independent set" and color 2 means "not in".
 *
 * @param rule - Branching rule providing the baseline context.
 * @param branch - Specific branch assignments to apply.
 * @returns New graph reflecting the independent set constraints.
 */
function applyIndependentSetBranch(rule: BranchingRule, branch: Branch): Graph {
	const nodes = rule.before.nodes.map(n => ({
		...n,
		colors: [...n.colors],
		removedColors: n.removedColors ? [...n.removedColors] : undefined,
		diff: "unchanged" as "changed" | "unchanged"
	}))
	const nodeMap = new Map(nodes.map(n => [n.id, n]))

	// Apply direct assignments from the branch
	for (const [id, colors] of Object.entries(branch.assignments)) {
		const node = nodeMap.get(id)
		if (node) {
			const removed = node.colors.filter(c => !colors.includes(c))
			node.colors = [...colors]
			if (removed.length > 0) {
				node.removedColors = [...new Set([...(node.removedColors ?? []), ...removed])]
				node.diff = "changed"
			}
		}
	}

	// Propagate constraints: if a node is in the independent set (color 1),
	// all its neighbors must be out of the independent set (color 2).
	for (const node of nodes) {
		if (node.colors.length === 1 && node.colors[0] === 1) {
			const neighbors = rule.before.neighbors[node.id]
			if (neighbors) {
				for (const neighborId of neighbors) {
					const neighbor = nodeMap.get(neighborId)
					if (neighbor && neighbor.colors.includes(1)) {
						neighbor.colors = neighbor.colors.filter(c => c !== 1)
						neighbor.removedColors = [...new Set([...(neighbor.removedColors ?? []), 1])]
						neighbor.diff = "changed"
					}
				}
			}
		}
	}

	// Filter out edges incident to nodes with a singleton color set.
	const finalEdges = Array.from(rule.before.edges).filter(edge => {
		const u = nodeMap.get(edge.from)
		const v = nodeMap.get(edge.to)
		if (!u || !v) return false
		if (u.colors.length === 1 || v.colors.length === 1) return false
		return true
	})

	return new Graph(nodes, finalEdges)
}

/**
 * Applies branch assignments to the rule’s before-state and annotates node diffs.
 *
 * @param rule - Branching rule providing the baseline context.
 * @param branch - Specific branch assignments to apply.
 * @returns New node and edge arrays reflecting constraint propagation.
 */
function applyBranchingRule(
	rule: BranchingRule,
	branch: Branch,
	problem: "independent set" | "list coloring"
): Graph {
	if (problem === "independent set") {
		return applyIndependentSetBranch(rule, branch)
	}
	return applyListColoringBranch(rule, branch)
}

/**
 * Applies branch assignments for standard list-coloring, including constraint propagation (e.g.,
 * neighbor exclusion) and node merging for common neighbors.
 *
 * @param rule - Branching rule providing the baseline context.
 * @param branch - Specific branch assignments to apply.
 * @returns New graph reflecting the list-coloring constraints.
 */
function applyListColoringBranch(rule: BranchingRule, branch: Branch): Graph {
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
		const neighbors = rule.before.neighbors[node.id]
		if (!neighbors || neighbors.size < 2 || node.colors.length === 0) return node
		const removal = new Set<Color>()
		const neighborIds = Array.from(neighbors)
		for (let i = 0; i < neighborIds.length; i++) {
			for (let j = i + 1; j < neighborIds.length; j++) {
				const left = nodeLookup.get(neighborIds[i])
				const right = nodeLookup.get(neighborIds[j])
				if (!left || !right) continue
				if (!rule.before.neighbors[left.id]?.has(right.id)) continue
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
 * Builds TeX-like and plain recurrence strings summarizing the branch measure drops.
 *
 * @param deltas - Difference of feature vectors, showing how each feature drops in a branch.
 * @returns Display string and compact equation form.
 */
export function buildRecurrenceStrings(deltas: FeatureVector[], onlyRHS = false) {
	const nonZero = new Set<Feature>()
	for (const delta of deltas) {
		for (const f of features) {
			if (delta[f] !== 0) nonZero.add(f)
		}
	}
	function makeFunction(delta: FeatureVector) {
		return (
			"T(" +
			features
				.filter(f => nonZero.has(f))
				.map(f => (!delta[f] ? f : delta[f] > 0 ? `${f}−${delta[f]}` : `${f}+${-delta[f]}`))
				.join(",") +
			")"
		)
	}
	const RHS = deltas.map(makeFunction).join("+")
	if (onlyRHS) return RHS
	const LHS = makeFunction({} as FeatureVector)
	return `${LHS}=${RHS}`
}

/**
 * Represents a scalar recurrence that has been weighted by a feature vector.
 */
export type WeightedScalarRecurrence = { equation: string; drops: number[]; decreasing: boolean }

/**
 * Projects the measure deltas onto a scalar recurrence using the supplied weights.
 *
 * @param deltas - Measure drops for each branch.
 * @param weights - Weight vector defining the scalar measure.
 * @returns Display/equation strings plus the list of drops.
 */
export function buildScalarRecurrence(
	deltas: FeatureVector[],
	weights: FeatureVector
): WeightedScalarRecurrence {
	const drops = deltas.map(delta => innerProduct(weights, delta))
	const counts = new Map<number, number>()
	for (const drop of drops) {
		counts.set(drop, (counts.get(drop) ?? 0) + 1)
	}
	const termEntries = Array.from(counts.entries())
	if (termEntries.length === 0) {
		return {
			equation: "T(μ)=T(μ)",
			drops: [],
			decreasing: false
		}
	}
	const terms = termEntries
		.sort((a, b) => a[0] - b[0])
		.filter(([, count]) => count !== 0)
		.map(([drop, count]) => {
			const base = drop < 0 ? `T(μ+${-drop})` : `T(μ-${drop})`
			return count !== 1 ? `${count}*${base}` : base
		})
	const decreasing = termEntries.every(([drop]) => drop > 0)
	const equation = `T(μ)=${terms.join("+")}`
	return { equation, drops, decreasing }
}

/**
 * Runs the full analyzer on a rule: applies each branch, measures deltas, and builds recurrences.
 *
 * @param rule - Branching rule to analyze.
 * @returns Detailed analysis including measure drops, solver text, and invariants.
 */
export function analyzeRule(
	rule: BranchingRule,
	computeFeatureVector: (G: Graph) => FeatureVector,
	subtractFeatureVectors: (a: FeatureVector, b: FeatureVector) => FeatureVector,
	problem: "independent set" | "list coloring"
): BranchingRuleWithAnalysis {
	const featuresBefore = computeFeatureVector(rule.before)
	const beforeHasColoring = hasProperColoring(rule.before)
	const branchDetails = rule.branches.map(branch => {
		const after = applyBranchingRule(rule, branch, problem)
		const featuresAfter = computeFeatureVector(after)
		const hasColoring = hasProperColoring(after)
		const featuresDelta = subtractFeatureVectors(featuresBefore, featuresAfter)
		return { after, featuresAfter, featuresDelta, hasColoring }
	})
	const deltas = branchDetails.map(b => b.featuresDelta)
	const recurrenceEquation = buildRecurrenceStrings(deltas)
	return {
		...rule,
		featuresBefore,
		beforeHasColoring,
		branchDetails,
		recurrenceEquation
	}
}
