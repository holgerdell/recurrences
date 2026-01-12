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
	/** Optional BFS layer (0 for roots), used for visualization layout. */
	layer?: number
}

/**
 * Assigns a stable priority to node roles for canonical sorting. The order is: root (0) < undefined
 * (1) < separator (2) < others (3).
 *
 * @param role - The role of the graph node.
 * @returns A numeric rank for sorting.
 */
function roleRank(role: GraphNode["role"]): number {
	switch (role) {
		case "root":
			return 0
		case undefined:
			return 1
		case "separator":
			return 2
		default:
			return 3
	}
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
	/** The list of nodes in the graph, sorted by role and ID. */
	nodes: readonly GraphNode[]

	/** The list of edges in the graph, normalized so from <= to. */
	edges: readonly GraphEdge[]

	/** Adjacency list mapping node IDs to sets of neighbor IDs. */

	neighbors: Readonly<Record<NodeId, Readonly<Set<NodeId>>>>

	/** Mapping from node ID to the node object. */
	nodeById: Readonly<Record<NodeId, GraphNode>>

	/** Optional signature string assigned by the graph enumeration method. */
	readonly signature?: string

	/**
	 * Creates a new Graph instance.
	 *
	 * @param nodes - The nodes of the graph.
	 * @param edges - The edges of the graph.
	 * @param signature - Optional signature string assigned by the graph enumeration method.
	 */
	constructor(nodes: readonly GraphNode[], edges: readonly GraphEdge[], signature?: string) {
		this.signature = signature
		this.nodes = nodes
			.map(n => ({ ...n }))
			.toSorted((a, b) => {
				const rankDiff = roleRank(a.role) - roleRank(b.role)
				if (rankDiff !== 0) return rankDiff
				return a.id.localeCompare(b.id)
			})
		this.edges = edges.map(e => {
			if (e.from <= e.to) return { from: e.from, to: e.to }
			else return { from: e.to, to: e.from }
		})
		const nodeById: Record<NodeId, GraphNode> = {}
		const neighbors: Record<NodeId, Set<NodeId>> = {}
		for (const n of this.nodes) {
			nodeById[n.id] = n
			neighbors[n.id] = new Set()
		}
		for (const { from, to } of this.edges) {
			neighbors[from].add(to)
			neighbors[to].add(from)
		}
		this.nodeById = nodeById
		this.neighbors = neighbors

		// Compute BFS layers from root nodes for layout (do not overwrite pre-set layers).
		const rootIds = this.nodes.filter(n => n.role === "root").map(n => n.id)
		if (rootIds.length > 0) {
			const dist = new Map<NodeId, number>()
			const queue: NodeId[] = []

			for (const id of rootIds) {
				if (dist.has(id)) continue
				dist.set(id, 0)
				queue.push(id)
			}

			while (queue.length > 0) {
				const v = queue.shift()!
				const d = dist.get(v)!
				for (const u of neighbors[v]) {
					if (!dist.has(u)) {
						dist.set(u, d + 1)
						queue.push(u)
					}
				}
			}

			let max = 0
			for (const d of dist.values()) max = Math.max(max, d)

			for (const n of this.nodes) {
				if (n.layer !== undefined) continue
				const d = dist.get(n.id)
				n.layer = d !== undefined ? d : max + 1
			}
		} else {
			// No roots: default all unset layers to 0 for stable layout.
			for (const n of this.nodes) {
				if (n.layer === undefined) n.layer = 0
			}
		}
	}

	/**
	 * Checks if two nodes are adjacent.
	 *
	 * @param u - The ID of the first node.
	 * @param v - The ID of the second node.
	 * @returns True if there is an edge between u and v.
	 */
	adjacent(u: NodeId, v: NodeId) {
		return this.neighbors[u].has(v)
	}

	/**
	 * Computes the degree of a node, including half-edges.
	 *
	 * @param id - The ID of the node.
	 * @returns The degree of the node.
	 */
	degree(id: NodeId) {
		return this.neighbors[id].size + (this.nodeById[id].halfedges ?? 0)
	}

	/**
	 * Computes the chain-degree of a node, defined as the number of degree-3 vertices reachable via
	 * induced paths. If the node has degree at most 2, then the chain-degree is defined as the degree.
	 */
	chainDegree(id: NodeId): number {
		const deg = this.degree(id)
		if (deg <= 2) return deg

		let count = this.nodeById[id].halfedges ?? 0
		const visited = new Set<NodeId>([id])
		const stack: NodeId[] = [...this.neighbors[id]]

		while (stack.length > 0) {
			const current = stack.pop()!
			if (visited.has(current)) continue
			visited.add(current)
			if (this.degree(current) >= 3) {
				count++
			} else {
				for (const neighbor of this.neighbors[current]) {
					stack.push(neighbor)
				}
			}
		}

		return count
	}

	/**
	 * Computes the open neighborhood of a set of root nodes. The open neighborhood is the set of nodes
	 * adjacent to at least one root, excluding the roots themselves.
	 *
	 * @param roots - An array of root node IDs.
	 * @returns A set of node IDs in the open neighborhood.
	 */
	openNeighborhood(roots: readonly NodeId[]): Set<NodeId> {
		let result = new Set<NodeId>()
		for (const r of roots) {
			result = result.union(this.neighbors[r])
		}
		return result.difference(new Set(roots))
	}
}
