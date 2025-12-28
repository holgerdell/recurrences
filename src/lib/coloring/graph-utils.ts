/**
 * Canonical color identifiers used throughout the coloring visualizations.
 */
export type Color = number
export type NodeId = string

/**
 * Minimal node representation used by both the rule engine and graph utilities.
 */
export interface GraphNode {
	id: NodeId
	colors: readonly Color[]
	diff?: "changed" | "unchanged"
	removedColors?: readonly Color[]
	role?: "root" | "separator"
	halfedges?: number
}

/**
 * Assigns a stable priority to node roles for canonical sorting (root < undefined < separator).
 */
const roleRank = (role: GraphNode["role"]) => {
	if (role === "root") return 0
	if (role === undefined) return 1
	if (role === "separator") return 2
	return 3
}

/**
 * Undirected edge definition connecting two node identifiers.
 */
export interface GraphEdge {
	from: NodeId
	to: NodeId
}

/**
 * Undirected graphs
 */
export class Graph {
	private _nodes: GraphNode[]
	private _edges: GraphEdge[]
	private _neighbors: Record<NodeId, Set<NodeId>>
	private _nodeById: Record<NodeId, GraphNode>

	constructor(nodes: readonly GraphNode[], edges: readonly GraphEdge[]) {
		this._nodes = nodes.map(n => ({ ...n }))
		this._nodes.sort((a, b) => {
			const rankDiff = roleRank(a.role) - roleRank(b.role)
			if (rankDiff !== 0) return rankDiff
			return a.id.localeCompare(b.id)
		})
		this._edges = edges.map(e => {
			if (e.from <= e.to) return { from: e.from, to: e.to }
			else return { from: e.to, to: e.from }
		})
		this._nodeById = {}
		this._neighbors = {}
		for (const n of this._nodes) {
			this._nodeById[n.id] = n
			this._neighbors[n.id] = new Set()
		}
		for (const { from, to } of this._edges) {
			this._neighbors[from].add(to)
			this._neighbors[to].add(from)
		}
	}

	get nodeIds() {
		return new Set(this._nodes.map(n => n.id))
	}

	get nodes() {
		return new Set(this._nodes)
	}

	get edges() {
		return new Set(this._edges)
	}

	nodeById(id: NodeId) {
		return this._nodeById[id]
	}

	neighbors(id: NodeId) {
		return new Set(this._neighbors[id])
	}

	adjacent(u: NodeId, v: NodeId) {
		return this._neighbors[u].has(v)
	}

	degree(id: NodeId) {
		return this._neighbors[id].size + (this._nodeById[id].halfedges ?? 0)
	}

	openNeighborhood(roots: readonly NodeId[]): Set<NodeId> {
		let result = new Set<NodeId>()
		for (const r of roots) {
			result = result.union(this._neighbors[r])
		}
		return result.difference(new Set(roots))
	}

	hasAutomorphism(f: Partial<Record<NodeId, NodeId>>, c?: Partial<Record<Color, Color>>): boolean {
		const domain = new Set(Object.keys(f))
		const range = new Set(Object.values(f))
		if (domain.size !== range.size) return false
		if (!domain.isSubsetOf(this.nodeIds)) return false
		if (!range.isSubsetOf(this.nodeIds)) return false

		if (c) {
			const C = new Set(Object.keys(c))
			const D = new Set(Object.values(c))
			if (C.size !== D.size) return false
		}

		for (const u of this._nodes) {
			const imageId = f[u.id]
			if (!imageId) return false
			const image = this.nodeById(imageId)
			if (u.role !== image.role) return false
			if (c) {
				const C = new Set(u.colors.map(x => c[x]))
				const D = new Set(image.colors)
				if (C.symmetricDifference(D).size > 0) return false
			}
		}
		for (const u of this._nodes) {
			for (const v of this._nodes) {
				if (this.adjacent(u.id, v.id) !== this.adjacent(f[u.id]!, f[v.id]!)) return false
			}
		}
		return true
	}

	*generateAutomorphisms() {
		const roots = this._nodes.filter(n => n.role === "root")
		const inners = this._nodes.filter(n => n.role === undefined)
		const separators = this._nodes.filter(n => n.role === "separator")

		const rootsPermutations = generatePermutationMap(roots.map(n => n.id))
		const innersPermutations = generatePermutationMap(inners.map(n => n.id))
		const separatorsPermutations = generatePermutationMap(separators.map(n => n.id))

		const occuringColor = this._nodes.map(n => new Set(n.colors)).reduce((C, D) => C.union(D))
		const colorDomain = Array.from(occuringColor).toSorted()

		for (const p1 of rootsPermutations)
			for (const p2 of innersPermutations)
				for (const p3 of separatorsPermutations) {
					const f: Partial<Record<NodeId, NodeId>> = { ...p1, ...p2, ...p3 }
					for (const c of generateBijections(colorDomain)) {
						if (this.hasAutomorphism(f)) yield { nodeMap: f, colorMap: c }
					}
				}
	}

	canon(): { canon: Graph; signature: string } {
		let bestGraph: Graph
		let bestSignature: string | undefined
		for (const automorphism of this.generateAutomorphisms()) {
			const canon = this.applyAutomorphism(
				automorphism.nodeMap as Record<string, string>,
				automorphism.colorMap
			)
			const signature = canon.signature()
			if (!bestSignature || signature < bestSignature) {
				bestGraph = canon
				bestSignature = signature
			}
		}
		return { canon: bestGraph!, signature: bestSignature! }
	}

	applyAutomorphism(nodeMap: Record<NodeId, NodeId>, colorMap: Record<number, number>): Graph {
		const newNodes: GraphNode[] = this._nodes.map(n => ({
			...n,
			id: nodeMap[n.id],
			colors: n.colors.map(c => colorMap[c]) as readonly Color[]
		}))
		const newEdges: GraphEdge[] = this._edges.map(({ to, from }) => ({
			to: nodeMap[to],
			from: nodeMap[from]
		}))
		return new Graph(newNodes, newEdges)
	}

	signature(): string {
		const nodeRoles = this._nodes.map(n => roleRank(n.role))
		const nodeColors = this._nodes.map(n => n.colors.toSorted().join(",")).join("|")
		let adjacencyPart = ""
		for (const u of this._nodes) {
			for (const v of this._nodes) {
				adjacencyPart += this.adjacent(u.id, v.id) ? "1" : "0"
			}
		}
		return `${nodeRoles}#${nodeColors}#${adjacencyPart}`
	}
}

/**
 * Iteratively yields every permutation as a map from each original item to its current counterpart.
 *
 * @param items - Ordered collection whose permutations should be produced.
 * @returns Generator emitting one map per permutation.
 */
export function* generatePermutationMap<T extends string | number>(
	items: readonly T[]
): Generator<Record<T, T>> {
	for (const bijection of generateBijections(items)) {
		const permutation: Partial<Record<T, T>> = {}
		for (const item of items) {
			const targetIndex = bijection[item] - 1
			permutation[item] = items[targetIndex]
		}
		yield permutation as Record<T, T>
	}
}

/**
 * Generates every bijection from the provided items onto the set {1, ..., items.length}.
 */
export function* generateBijections<T extends string | number>(
	items: readonly T[]
): Generator<Record<T, number>> {
	if (items.length === 0) {
		yield {} as Record<T, number>
		return
	}
	const targets = Array.from({ length: items.length }, (_, i) => i + 1)
	const picks = Array<number>(items.length).fill(-1) // indices into targets
	const used = Array<boolean>(items.length).fill(false)
	let depth = 0
	while (depth >= 0) {
		if (picks[depth] !== -1) used[picks[depth]] = false
		let nextIndex = picks[depth] + 1
		while (nextIndex < targets.length && used[nextIndex]) nextIndex++
		if (nextIndex >= targets.length) {
			picks[depth] = -1
			depth--
			continue
		}
		picks[depth] = nextIndex
		used[nextIndex] = true
		if (depth === items.length - 1) {
			const mapping: Partial<Record<T, number>> = {}
			for (let i = 0; i < items.length; i++) mapping[items[i]] = targets[picks[i]]
			yield mapping as Record<T, number>
			continue
		}
		depth++
		picks[depth] = -1
	}
}
