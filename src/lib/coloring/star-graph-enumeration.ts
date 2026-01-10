/**
 * Canonicalizes star graphs by encoding/decoding their structure and color lists into a stable
 * string form, enabling fast equality checks and storage of generated situations.
 *
 * Canonical conventions:
 * - Colors are drawn from {0,1,2,3}; color 0 must appear in any encoded star.
 * - Center has zero halfedges; leaf halfedges are bounded by caller parameters when enumerating.
 * - Leaves are ordered by larger lists first, then higher bitmask, then smaller halfedge count.
 * - Color lists are encoded as strings of digits 0-3 (e.g., "0123"); canonical prefixes enforce
 *   ordered color renaming.
 */
import { character, popcount } from "$lib/utils"
import { Graph, type GraphNode, type GraphEdge, type Color } from "./graph"

/**
 * Returns whether node 1 has higher priority than node 2. Higher Priority means that our branching
 * algorithm would have chosen to branch on node 1. Thus, we only need to consider situations where
 * no leaf has higher priority than the center.
 */
export const hasHigherPriority = (
	degree1: number,
	degree2: number,
	listSize1: number,
	listSize2: number
): boolean => {
	return degree1 > degree2 || (degree1 === degree2 && listSize1 < listSize2)
	// return listSize1 < listSize2 || (listSize1 === listSize2 && degree1 > degree2)
}

/**
): boolean => {
	return listSize1 < listSize2 || (listSize1 === listSize2 && degree1 > degree2)
}

/**
 * Decode a color string (e.g., "0123") back into a color set.
 *
 * @param s - String of digits "0" through "3" representing colors.
 * @returns Sorted list of colors present in the string.
 */
const decodeColorStr = (s: string): Color[] => {
	return [...s].map(c => parseInt(c, 10)) as Color[]
}

/**
 * Convert a 4-bit color mask to a human-readable string of digits (e.g., 3 -> "12").
 *
 * @param mask - 4-bit mask of colors (bits 0-3 correspond to colors 0-3).
 * @returns String of digits 0-3 in ascending order.
 */
const maskToColorStr = (mask: number): string => {
	let s = ""
	for (let i = 0; i < 4; i++) {
		if (mask & (1 << i)) s += i.toString()
	}
	return s
}

/**
 * Canonical leaf descriptor used for ordering and signature emission.
 * - `size`: number of colors in the leaf list.
 * - `mask`: 4-bit color mask for the leaf list.
 * - `halfedges`: dangling edge count for the leaf.
 */
type LeafSig = { size: number; mask: number; halfedges: number }

/**
 * Leaf comparison: (1) increasing |L|, (2) increasing bitmask value, (3) increasing halfedges.
 *
 * @param a - First leaf descriptor.
 * @param b - Second leaf descriptor.
 * @returns Negative if a < b, positive if a > b, zero if equivalent under the ordering.
 */
const compareLeafOrder = (a: LeafSig, b: LeafSig): number => {
	if (a.size !== b.size) return a.size - b.size
	if (a.mask !== b.mask) return a.mask - b.mask
	return a.halfedges - b.halfedges
}

/**
 * Convert a list of colors in {0,1,2,3} to its 4-bit mask representation.
 *
 * @param colors - Colors to encode.
 * @returns 4-bit mask with bit c set for each color c.
 * @throws If a color lies outside the range 0..3.
 */
export const colorsToMask = (colors: readonly Color[]): number => {
	let mask = 0
	for (const c of colors) {
		if (c < 0 || c > 3) throw new Error("Color out of range")
		mask |= 1 << c
	}
	return mask
}

/**
 * Profile of a color's incidence across the center and leaves. Used to establish a canonical
 * ordering of colors.
 */
export type ColorProfile = {
	color: number
	centerBit: number
	leafBitsMask: number
}

/**
 * Compute canonical color relabeling given center and leaf masks.
 *
 * @param centerMask - Color mask on the center vertex.
 * @param leafMasks - Color masks on each leaf (already in canonical leaf order).
 * @returns Sorted color profiles (by incidence profile: center first, then leaf appearances).
 */
export const getColorProfiles = (
	centerMask: number,
	leafMasks: readonly number[]
): ColorProfile[] => {
	// 1. Initial color roles: is the color in the center?
	const colorLabels = [0, 1, 2, 3].map(c => ((centerMask & (1 << c)) !== 0 ? 1 : 0))

	// 2. Leaf signatures: color-invariant description of each leaf (multiset of color roles).
	const leafSigs = leafMasks.map(mask => {
		const roles: number[] = []
		for (let c = 0; c < 4; c++) {
			if (mask & (1 << c)) roles.push(colorLabels[c])
		}
		return roles.sort((a, b) => a - b).join(",")
	})

	// 3. Color incidence signatures: color role + multiset of leaf signatures.
	const colorSigs = [0, 1, 2, 3].map(c => {
		const role = colorLabels[c]
		const sigs: string[] = []
		for (let i = 0; i < leafMasks.length; i++) {
			if (leafMasks[i] & (1 << c)) sigs.push(leafSigs[i])
		}
		return `${role}|${sigs.sort().join(";")}`
	})

	// 4. Stable canonical color ranking based on signatures to use for leaf tie-breaking.
	const colors = ([0, 1, 2, 3] as Color[]).sort((a, b) => {
		const sa = colorSigs[a]
		const sb = colorSigs[b]
		if (sa !== sb) return sa < sb ? 1 : -1
		return b - a // Consistent tie-breaker
	})

	// 5. Canonical leaf order: sort leaves by their canonical color-rank bitmasks.
	const getLeafValue = (mask: number) => {
		const rankMap = new Map<number, number>()
		colors.forEach((oldC, rank) => rankMap.set(oldC, rank + 1))
		let res = 0
		for (let c = 0; c < 4; c++) {
			if (mask & (1 << c)) res |= 1 << (rankMap.get(c)! - 1)
		}
		return res
	}
	const sortedLeaves = [...leafMasks].sort((a, b) => {
		const va = getLeafValue(a)
		const vb = getLeafValue(b)
		if (va !== vb) return va - vb
		return a - b
	})

	// 6. Build profiles using the canonical leaf order.
	const profiles = [0, 1, 2, 3].map(c => {
		const centerBit = (centerMask & (1 << c)) !== 0 ? 1 : 0
		let leafBitsMask = 0
		for (let i = 0; i < sortedLeaves.length; i++) {
			if (sortedLeaves[i] & (1 << c)) leafBitsMask |= 1 << i
		}
		return { color: c, centerBit, leafBitsMask }
	})

	profiles.sort((a, b) => {
		if (a.centerBit !== b.centerBit) return b.centerBit - a.centerBit
		if (a.leafBitsMask !== b.leafBitsMask) return b.leafBitsMask - a.leafBitsMask
		return b.color - a.color
	})

	return profiles
}

/**
 * Convert a star graph into its canonical compact string representation.
 *
 * Format: `S{d}__{centerHalfedges}_{centerColors}__{leafHalfedges}_{leafColors}__...` where d is
 * the leaf count, and colors are encoded as digits 0-3.
 *
 * @param graph - Star-shaped graph with a single root and any number of leaves.
 * @returns Canonical, stable string encoding of the star.
 */
export const stringifyStarGraph = (graph: Graph): string => {
	const center = graph.nodes.find(n => n.role === "root")
	if (!center) throw new Error("Star graph must have a root")

	const leaves = graph.nodes.filter(n => n.role !== "root")
	const leafSigs: LeafSig[] = leaves.map(l => ({
		size: l.colors.length,
		mask: colorsToMask(l.colors),
		halfedges: l.halfedges ?? 0
	}))

	leafSigs.sort(compareLeafOrder)

	const centerMask = colorsToMask(center.colors)
	const { center: canonCenter, leaves: canonLeaves } = canonicalizeColorMasks(
		centerMask,
		leafSigs.map(l => l.mask)
	)

	// Re-sort leaves based on canonical properties to ensure stable string order
	const finalLeafSigs = canonLeaves.map((mask, i) => ({
		size: leafSigs[i].size,
		mask,
		halfedges: leafSigs[i].halfedges
	}))
	finalLeafSigs.sort(compareLeafOrder)

	const centerPart = `${center.halfedges ?? 0}_` + maskToColorStr(canonCenter)

	const leafPart = finalLeafSigs.map(l => `${l.halfedges}_` + maskToColorStr(l.mask)).join("__")

	return `S${leaves.length}__${centerPart}__${leafPart}`
}

/**
 * Parse a canonical star encoding back into a {@link Graph}.
 *
 * @param s - Canonical string produced by {@link stringifyStarGraph}.
 * @returns Graph whose structure and color incidences match the encoded star.
 * @throws If the encoding does not match the expected format.
 */
export const parseStarGraph = (s: string): Graph => {
	const parts = s.split("__")
	if (parts.length < 2) throw new Error("Invalid star graph encoding")

	const degreeMatch = parts[0].match(/^S(\d+)$/)
	if (!degreeMatch) throw new Error("Invalid degree segment")
	const d = Number(degreeMatch[1])

	const [chStr, ccStr] = parts[1].split("_")
	const nodes: GraphNode[] = [
		{
			id: "v",
			role: "root",
			halfedges: Number(chStr),
			colors: decodeColorStr(ccStr)
		}
	]

	const edges: GraphEdge[] = []
	const leafParts = parts.slice(2)
	if (leafParts.length !== d) throw new Error("Leaf count mismatch")

	for (let i = 0; i < d; i++) {
		const [h, c] = leafParts[i].split("_")
		const id = `${character(i)}`
		nodes.push({
			id,
			halfedges: Number(h),
			colors: decodeColorStr(c),
			role: "separator"
		})
		edges.push({ from: "v", to: id })
	}
	return new Graph(nodes, edges)
}

/**
 * Remap color masks to their canonical ordering using the incidence-profile ordering.
 *
 * @param centerMask - Bitmask for center colors.
 * @param leafMasks - Bitmasks for leaf colors in canonical leaf order.
 * @returns Remapped masks (center first, then leaves) after canonical color relabeling.
 */
export const canonicalizeColorMasks = (
	centerMask: number,
	leafMasks: readonly number[]
): { center: number; leaves: number[] } => {
	const profiles = getColorProfiles(centerMask, leafMasks)
	const colorMap = new Map<number, number>()
	profiles.forEach((p, i) => colorMap.set(p.color, i + 1))

	const remapMaskWithMap = (mask: number, colorMap: Map<number, number>): number => {
		let out = 0
		for (let c = 0; c < 4; c++) {
			if (mask & (1 << c)) out |= 1 << (colorMap.get(c)! - 1)
		}
		return out
	}

	return {
		center: remapMaskWithMap(centerMask, colorMap),
		leaves: leafMasks.map(m => remapMaskWithMap(m, colorMap))
	}
}

/**
 * Global: leafMasks[p] is a sorted array of all masks with popcount p (for p in 0..4).
 */
const leafMasks: number[][] = (() => {
	const tmp: number[][] = []
	for (let i = 0; i <= 4; i++) tmp.push([])
	for (const C1 of [1, 0])
		for (const C2 of [1, 0])
			for (const C3 of [1, 0])
				for (const C4 of [1, 0]) {
					const mask = C1 | (C2 << 1) | (C3 << 2) | (C4 << 3)
					tmp[C1 + C2 + C3 + C4].push(mask)
				}
	return tmp
})()

/**
 * Enumerate canonical star signature strings across degree and list-size ranges.
 *
 * Enforces:
 * - Center has zero halfedges.
 * - Color 0 appears in the used color set (anchors canonical labels).
 * - Center color mask is a prefix $(1<<k)-1$ within size bounds.
 * - Leaf color masks and center mask satisfy the given list-size bounds.
 * - Color assignments that would be relabeled by canonicalization are skipped to avoid duplicate
 *   signatures.
 *
 * @param degree - Number of leaves to enumerate.
 * @param halfedges - Dangling edges per leaf.
 * @param centerListSize - Size of the center vertex color list.
 * @param leafListSize - Size of the leaf vertex color lists.
 * @returns Generator emitting canonical signatures of the form `S{d}__0_{colorStr}__...`.
 */
export function* enumerateStarSignatures(
	degree: number,
	halfedges: number,
	centerListSize: number,
	leafListSize: number
): Generator<string> {
	// Center mask is always a prefix of the given size
	const centerMask = (1 << centerListSize) - 1

	// Enumerate multisets of leaves (non-decreasing sequence)
	const leaves: number[] = []
	function* backtrackLeaves(start: number): Generator<void> {
		if (leaves.length === degree) {
			yield
			return
		}
		for (let i = start; i < leafMasks[leafListSize].length; i++) {
			leaves.push(leafMasks[leafListSize][i])
			yield* backtrackLeaves(i)
			leaves.pop()
		}
	}

	const seen: Set<string> = new Set()

	for (const _ of backtrackLeaves(0)) {
		void _

		// Reject if a leaf does not intersect the center
		let reject = false
		for (let i = 0; i < leaves.length; i++) {
			if ((leaves[i] & centerMask) === 0) {
				reject = true
				break
			}
		}
		if (reject) continue

		const { center: canonCenter, leaves: canonLeaves } = canonicalizeColorMasks(centerMask, leaves)
		canonLeaves.sort((a, b) => {
			const ma = a
			const mb = b
			const sa = popcount(ma)
			const sb = popcount(mb)
			if (sa !== sb) return sa - sb
			return ma - mb
		})

		// Leaves are already generated in canonical order and we only keep non-recolored cases,
		// so no additional sort is needed after canonicalization.
		let leafPart = ""
		for (let i = 0; i < canonLeaves.length; i++) {
			if (i > 0) leafPart += "__"
			leafPart += `${halfedges}_` + maskToColorStr(canonLeaves[i])
		}

		const centerStr = maskToColorStr(canonCenter)
		const signature = `S${degree}__0_${centerStr}__${leafPart}`

		if (seen.has(signature)) continue
		seen.add(signature)

		yield signature
	}
}

/**
 * Enumerates all valid star graph signatures within defined degree and halfedge constraints.
 *
 * It iterates through:
 * - Center list sizes (2..4)
 * - Leaf list sizes (starting from center list size)
 * - Degrees (3..10)
 * - Halfedges (2..10)
 *
 * @yields Canonical star graph signatures.
 */
export function* enumerateSituations() {
	for (let centerListSize = 2; centerListSize <= 4; centerListSize++) {
		for (let leafListSize = 2; leafListSize <= 4; leafListSize++) {
			for (let degree = 3; degree <= 5; degree++) {
				for (let halfedges = 2; halfedges <= 6; halfedges++) {
					// if a leaf node would have higher priority than the center, then we would have branched on it instead, so we can skip this case
					if (hasHigherPriority(halfedges + 1, degree, leafListSize, centerListSize)) continue
					yield* enumerateStarSignatures(degree, halfedges, centerListSize, leafListSize)
				}
			}
		}
	}
}
