import { Graph, type GraphEdge, type GraphNode } from "$lib/coloring/graph"

const BINARY_LIST = [0, 1] as const

function assertNonNegativeInt(name: string, value: number): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${name} must be a non-negative integer`)
	}
}

function makeNodeId(depth: number, index: number): string {
	if (depth === 0) return "root"
	return `${String(depth)}-${String(index)}`
}

/**
 * Construct the unique uniform rooted tree described by a degree vector.
 *
 * Semantics:
 * - All nodes have color-list {0,1}.
 * - For depths 0..L-2: nodes at depth d have graph-degree `degrees[d]`.
 * - For the root (depth 0): this means it has `degrees[0]` children.
 * - For depths d>0: this means each node has `degrees[d]-1` children (the parent edge counts).
 * - The last entry `degrees[L-1]` is the number of halfedges on each leaf. (So a leaf's total degree
 *   is `1 + degrees[L-1]` for L>1.)
 */
export function uniformTree01FromDegrees(degrees: number[]): Graph {
	if (degrees.length === 0) throw new Error("degrees must be non-empty")
	for (let i = 0; i < degrees.length; i++) assertNonNegativeInt(`degrees[${i}]`, degrees[i])

	const lastDepth = degrees.length - 1
	const leafHalfedges = degrees[lastDepth] - 1

	if (lastDepth >= 1 && degrees[0] === 0) {
		throw new Error("degrees[0] must be ≥ 1 when the tree has depth ≥ 1")
	}
	for (let depth = 1; depth < lastDepth; depth++) {
		if (degrees[depth] < 2) {
			throw new Error(`degrees[${depth}] must be ≥ 2 for internal levels (needs parent + ≥1 child)`)
		}
	}

	const nodes: GraphNode[] = [
		{
			id: "root",
			role: "root",
			colors: BINARY_LIST,
			halfedges: 0
		}
	]
	const nodeIndexById = new Map<string, number>([["root", 0]])
	const edges: GraphEdge[] = []

	let currentLevel: string[] = ["root"]
	for (let depth = 0; depth < lastDepth; depth++) {
		const childrenPerNode = depth === 0 ? degrees[0] : degrees[depth] - 1
		const nextLevel: string[] = []

		let childIndex = 0
		for (const parentId of currentLevel) {
			for (let k = 0; k < childrenPerNode; k++) {
				const id = makeNodeId(depth + 1, childIndex++)
				nodeIndexById.set(id, nodes.length)
				nodes.push({
					id,
					role: "separator",
					colors: BINARY_LIST,
					halfedges: 0
				})
				edges.push({ from: parentId, to: id })
				nextLevel.push(id)
			}
		}
		currentLevel = nextLevel
	}

	// Assign halfedges to leaves.
	if (lastDepth === 0) {
		// Single-node tree: the root is also the leaf.
		nodes[0] = { ...nodes[0], halfedges: leafHalfedges }
	} else {
		for (const id of currentLevel) {
			const idx = nodeIndexById.get(id)
			if (idx !== undefined) nodes[idx] = { ...nodes[idx], halfedges: leafHalfedges }
		}
	}

	return new Graph(nodes, edges, `star01_${degrees.join("_")}`)
}

/**
 * Enumerate canonical star signatures for the Weighted Independent Set encoding.
 *
 * Convention:
 * - The independent set problem is encoded with binary lists {0,1}.
 * - So both the center and every leaf have list size 2.
 *
 * The output strings are in the same format as star-graph-enumeration:
 * `S{d}__0_{centerColors}__{leafHalfedges}_{leafColors}__...`
 */
export function* enumerateIndependentSetLocalSituations(options?: {
	minDegree?: number
	maxDegree?: number
	depth?: number
}): Generator<Graph> {
	const { minDegree = 3, maxDegree = 6, depth = 2 } = options ?? {}

	const degrees: number[] = []

	function* backtrack(currentDepth = 0): Generator<Graph> {
		if (currentDepth === depth) {
			yield uniformTree01FromDegrees(degrees)
			return
		}
		for (let degree = minDegree; degree <= maxDegree; degree++) {
			if (currentDepth > 0 && degree > degrees[0]) return
			degrees.push(degree)
			yield* backtrack(currentDepth + 1)
			if (currentDepth < depth - 1) {
				degrees.push(2)
				yield* backtrack(currentDepth + 1)
				degrees.pop()
			}
			degrees.pop()
		}
	}
	yield* backtrack()

	// for (let degree0 = minDegree; degree0 <= maxDegree; degree0++) {
	// 	for (let degree1 = minDegree; degree1 <= maxDegree; degree1++) {
	// 		if (degree1 > degree0) break
	// 		for (let degree2 = minDegree; degree2 <= maxDegree; degree2++) {
	// 			if (degree2 > degree0) break
	// 			// yield uniformTree01FromDegrees([degree0, degree1, degree2])
	// 			// yield uniformTree01FromDegrees([degree0, degree1, 2, degree2])
	// 			// yield uniformTree01FromDegrees([degree0, 2, degree1, 2, degree2])
	// 			// yield uniformTree01FromDegrees([degree0, 2, degree1, degree2])

	// 			for (let degree3 = minDegree; degree3 <= maxDegree; degree3++) {
	// 				if (degree3 > degree0) break
	// 				yield uniformTree01FromDegrees([degree0, degree1, degree2, degree3])
	// 				yield uniformTree01FromDegrees([degree0, degree1, 2, degree2, degree3])
	// 				yield uniformTree01FromDegrees([degree0, 2, degree1, 2, degree2, degree3])
	// 				yield uniformTree01FromDegrees([degree0, 2, degree1, degree2, degree3])
	// 			}
	// 		}
	// 	}
	// }
}
