/**
 * Canonicalizes star graphs by encoding/decoding their structure and color lists into a stable
 * string form, enabling fast equality checks and storage of generated situations.
 *
 * Canonical conventions:
 * - Colors are drawn from {1,2,3,4}; color 1 must appear in any encoded star.
 * - Center has zero halfedges; leaf halfedges are bounded by caller parameters when enumerating.
 * - Leaves are ordered by larger lists first, then higher bitmask, then smaller halfedge count.
 * - Color lists are encoded as hex masks; canonical prefixes enforce ordered color renaming.
 */
import { character, popcount } from "$lib/utils"
import { Graph, type GraphNode, type GraphEdge, type Color } from "./graph"

/**
 * Decode a single hex digit produced by {@link encodeColors} back into a color set.
 *
 * @param hex - One hexadecimal digit (0–F) encoding the bitmask of colors.
 * @returns Sorted list of colors present in the mask.
 */
const decodeColors = (hex: string): Color[] => {
	const mask = parseInt(hex, 16)
	const colors: Color[] = []
	for (let i = 0; i < 4; i++) {
		if (mask & (1 << i)) colors.push(i + 1)
	}
	return colors
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
 * Convert a list of colors in {1,2,3,4} to its 4-bit mask representation.
 *
 * @param colors - Colors to encode.
 * @returns 4-bit mask with bit (c-1) set for each color c.
 * @throws If a color lies outside the range 1..4.
 */
export const colorsToMask = (colors: readonly Color[]): number => {
	let mask = 0
	for (const c of colors) {
		if (c < 1 || c > 4) throw new Error("Color out of range")
		mask |= 1 << (c - 1)
	}
	return mask
}

/**
 * Compute canonical color relabeling given center and leaf masks.
 *
 * @param centerMask - Color mask on the center vertex.
 * @param leafMasks - Color masks on each leaf (already in canonical leaf order).
 * @returns Mapping from original color -> canonical color index (1-based).
 */
export const canonicalColorMap = (
	centerMask: number,
	leafMasks: readonly number[]
): Map<number, number> => {
	const usedMask = leafMasks.reduce((acc, m) => acc | m, centerMask)
	const colors: number[] = []
	for (let c = 1; c <= 4; c++) if (usedMask & (1 << (c - 1))) colors.push(c)

	type Profile = {
		color: number
		centerBit: number
		leafBitsMask: number
	}

	const profiles: Profile[] = colors.map(color => {
		const centerBit = (centerMask & (1 << (color - 1))) !== 0 ? 1 : 0
		let leafBitsMask = 0
		for (let i = 0; i < leafMasks.length; i++) {
			if (leafMasks[i] & (1 << (color - 1))) leafBitsMask |= 1 << i
		}
		return { color, centerBit, leafBitsMask }
	})

	profiles.sort((a, b) => {
		if (a.centerBit !== b.centerBit) return b.centerBit - a.centerBit
		if (a.leafBitsMask !== b.leafBitsMask) return b.leafBitsMask - a.leafBitsMask
		return a.color - b.color
	})

	const map = new Map<number, number>()
	profiles.forEach((p, i) => map.set(p.color, i + 1))
	return map
}

/**
 * Convert a star graph into its canonical compact string representation.
 *
 * Format: `S{d}-C{halfedges}:{centerColors}-L{leafHalfedges}:{leafColors}|...` where d is the leaf
 * count, halfedges counts dangling edges, and colors are encoded as uppercase hex masks after
 * canonical color relabeling.
 *
 * @param graph - Star-shaped graph with a single root and any number of leaves.
 * @returns Canonical, stable string encoding of the star.
 */
export const stringifyStarGraph = (graph: Graph): string => {
	const nodes = [...graph.nodes]

	const center = nodes.find(n => n.role === "root")
	if (!center) throw new Error("Star graph must have a root")

	const leaves = nodes.filter(n => n.role !== "root")
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

	const centerPart = `C${center.halfedges ?? 0}:` + canonCenter.toString(16).toUpperCase()

	const leafPart = canonLeaves
		.map((mask, idx) => `${leafSigs[idx].halfedges}:` + mask.toString(16).toUpperCase())
		.join("|")

	return `S${leaves.length}-${centerPart}-L${leafPart}`
}

/**
 * Parse a canonical star encoding back into a {@link Graph}.
 *
 * @param s - Canonical string produced by {@link stringifyStarGraph}.
 * @returns Graph whose structure and color incidences match the encoded star.
 * @throws If the encoding does not match the expected format.
 */
export const parseStarGraph = (s: string): Graph => {
	const m = s.match(/^S(\d+)-C(\d+):([0-9A-F])-L(.+)$/)
	if (!m) throw new Error("Invalid star graph encoding")

	const [, dStr, chStr, cc, leafStr] = m
	const d = Number(dStr)

	const nodes: GraphNode[] = [
		{
			id: "v",
			role: "root",
			halfedges: Number(chStr),
			colors: decodeColors(cc)
		}
	]

	const edges: GraphEdge[] = []

	const parts = leafStr.split("|")
	if (parts.length !== d) throw new Error("Leaf count mismatch")

	for (let i = 0; i < d; i++) {
		const [h, c] = parts[i].split(":")
		const id = `${character(i + 1)}`
		nodes.push({
			id,
			halfedges: Number(h),
			colors: decodeColors(c),
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
	const colorMap = canonicalColorMap(centerMask, leafMasks)
	const remapMaskWithMap = (mask: number, colorMap: Map<number, number>): number => {
		let out = 0
		for (let c = 1; c <= 4; c++) {
			if (mask & (1 << (c - 1))) out |= 1 << (colorMap.get(c)! - 1)
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
	for (let mask = 0; mask < 16; mask++) tmp[popcount(mask)].push(mask)
	return tmp
})()

/**
 * Enumerate canonical star signature strings across degree and list-size ranges.
 *
 * Conventions enforced:
 * - Center has zero halfedges.
 * - Color 1 must appear in the used color set (anchors canonical labels).
 * - Center color mask is a prefix (1<<k)-1 within size bounds.
 * - Leaf color masks and center mask must all satisfy the given list-size bounds.
 * - Color assignments that would be relabeled by canonicalization are skipped to avoid duplicate
 *   signatures.
 *
 * @param minDegree - Minimum number of leaves to enumerate.
 * @param maxDegree - Maximum number of leaves to enumerate.
 * @param minHalfedges - Minimum halfedges allowed per leaf.
 * @param maxHalfedges - Maximum halfedges allowed per leaf.
 * @param minListSize - Minimum distinct colors allowed in any vertex list.
 * @param maxListSize - Maximum distinct colors allowed in any vertex list.
 * @returns Generator emitting canonical signatures of the form `S{d}-C{0}:{centerColors}-L...`.
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

	for (const _ of backtrackLeaves(0)) {
		void _

		// Canonicalize colors across center and leaves
		const { center: canonCenter, leaves: canonLeaves } = canonicalizeColorMasks(centerMask, leaves)

		// Reject color assignments that are not already canonical; this prevents duplicates from
		// different color permutations mapping to the same canonical signature.
		// Also reject if a leaf does not intersect the center
		let reject = false
		for (let i = 0; i < canonLeaves.length; i++) {
			if (canonLeaves[i] !== leaves[i] || (canonLeaves[i] & centerMask) === 0) {
				reject = true
				break
			}
		}
		if (reject) continue

		// Leaves are already generated in canonical order and we only keep non-recolored cases,
		// so no additional sort is needed after canonicalization.
		let leafPart = ""
		for (let i = 0; i < canonLeaves.length; i++) {
			if (i > 0) leafPart += "|"
			leafPart += `${halfedges}:` + canonLeaves[i].toString(16).toUpperCase()
		}

		const centerHex = canonCenter.toString(16).toUpperCase()
		yield `S${degree}-C0:${centerHex}-L${leafPart}`
	}
}

/**
 * Enumerates all possible star graph signatures within defined constraints. @yields Canonical star
 * graph signatures.
 */
export function* enumerateSituations() {
	for (let centerListSize = 2; centerListSize <= 4; centerListSize++) {
		for (let leafListSize = centerListSize; leafListSize <= 4; leafListSize++) {
			for (let degree = 3; degree <= 10; degree++) {
				for (let halfedges = 2; halfedges <= 10; halfedges++) {
					if (centerListSize === leafListSize && degree < halfedges + 1) continue
					yield* enumerateStarSignatures(degree, halfedges, centerListSize, leafListSize)
				}
			}
		}
	}
}
