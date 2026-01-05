import { browser } from "$app/environment"
import type { Color, Graph } from "$lib/coloring/graph"
import {
	computeFeatureVector,
	FeatureDefinition,
	features,
	subtractFeatureVectors,
	type FeatureVector,
	type PartialFeatureVector
} from "$lib/coloring/featureSpace"
import {
	analyzeRule,
	autogenerateRules,
	type BranchingRuleWithAnalysis
} from "$lib/coloring/rule-engine"
import { enumerateStarSignatures, parseStarGraph } from "$lib/coloring/star-graph-canonization"
import type { OptimizationWorkerInput, OptimizationWorkerOutput } from "./worker"

/**
 * Represents the available options for restricting color list sizes in the graph.
 */
export type ColorListSizes = "size234" | "size23" | "size2"

/**
 * Represents the available color palettes for the coloring problem.
 */
export type ColorPalette = "1234" | "123"

/**
 * Represents a local situation (neighborhood) in a graph, including its canonical form.
 */
export interface LocalSituation {
	/** The canonical graph representation of the situation. */
	canon: Graph
	/** A unique identifier for the situation. */
	situationId: number
	/** The string signature used to generate the situation. */
	signature: string
}

/**
 * Configuration options for color list size restrictions in the UI.
 */
export const colorListSizeOptions: Array<{
	key: ColorListSizes
	label: string
	description: string
	listSizes?: number[]
}> = [
	{
		key: "size234",
		label: "Lists of size 2, 3, or 4",
		description: "Enumerate every canonical neighborhood.",
		listSizes: [2, 3, 4]
	},
	{
		key: "size23",
		label: "Lists of size 2 or 3",
		description: "Keep situations where every node has 2 or 3 colors.",
		listSizes: [2, 3]
	},
	{
		key: "size2",
		label: "Lists of size 2",
		description: "Keep situations where every node has 2 colors.",
		listSizes: [2]
	}
]

/**
 * Configuration options for color palette selection in the UI.
 */
export const colorPaletteOptions: Array<{
	key: ColorPalette
	label: string
	description: string
	colors: readonly number[]
}> = [
	{
		key: "1234",
		label: "List 4-Coloring",
		description: "Color Palette = {1,2,3,4}",
		colors: [1, 2, 3, 4]
	},
	{
		key: "123",
		label: "List 3-Coloring",
		description: "Color Palette = {1,2,3}",
		colors: [1, 2, 3]
	}
]

/**
 * Checks if all nodes in a graph use colors from the allowed palette.
 *
 * @param G - The graph to check.
 * @param allowedColors - The list of allowed colors.
 * @returns True if the graph matches the palette, false otherwise.
 */
export function matchesColorPalette(G: Graph, allowedColors?: readonly Color[]): boolean {
	if (allowedColors === undefined) return true
	for (const n of G.nodes) {
		for (const c of n.colors) {
			if (!allowedColors.includes(c)) return false
		}
	}
	return true
}

/**
 * Checks if all nodes in a graph have list sizes from the allowed set.
 *
 * @param G - The graph to check.
 * @param allowedSizes - The list of allowed list sizes.
 * @returns True if the graph matches the list size restrictions, false otherwise.
 */
export function matchesColorListSizes(G: Graph, allowedSizes?: readonly number[]): boolean {
	if (allowedSizes === undefined) return true
	for (const n of G.nodes) {
		if (!allowedSizes.includes(n.colors.length)) return false
	}
	return true
}

/**
 * Determines which feature coefficients should be fixed based on the selected palette and list
 * sizes.
 *
 * @param selectedPalette - The active color palette.
 * @param selectedColorListSize - The active list size restriction.
 * @returns A partial feature vector with fixed coefficients.
 */
export function getFixedPartialMeasure(
	selectedPalette: ColorPalette,
	selectedColorListSize: ColorListSizes
) {
	const result: PartialFeatureVector = {}
	let listSizeUpTo = 4
	if (selectedPalette === "1234") {
		listSizeUpTo = 4
	} else if (selectedPalette === "123") {
		listSizeUpTo = 3
	}
	if (selectedColorListSize === "size23") {
		listSizeUpTo = 3
	} else if (selectedColorListSize === "size2") {
		listSizeUpTo = 2
	}
	for (const f of features) {
		const def = FeatureDefinition[f]
		if (def.requiresListSize > listSizeUpTo) result[f] = 0
		if (def.requiresListSize === listSizeUpTo && def.normalizer) result[f] = 1
	}
	return result
}

/**
 * Builds default optimization bounds based on fixed coefficients.
 *
 * @param fixedPartialMeasure - The fixed coefficients.
 * @returns An object containing min and max partial feature vectors.
 */
export function buildDefaultBounds(fixedPartialMeasure: PartialFeatureVector) {
	const min: PartialFeatureVector = {}
	const max: PartialFeatureVector = {}
	for (const f of features) {
		const fixed = fixedPartialMeasure[f]
		if (fixed !== undefined) {
			min[f] = fixed
			max[f] = fixed
		} else {
			min[f] = 0
			max[f] = 1
		}
	}
	return { min, max }
}

/**
 * Enumerates all possible star graph signatures within defined constraints. @yields Canonical star
 * graph signatures.
 */
export function* enumerateSituations() {
	for (let centerListSize = 2; centerListSize <= 4; centerListSize++) {
		for (let leafListSize = centerListSize; leafListSize <= 4; leafListSize++) {
			for (let degree = 3; degree <= 7; degree++) {
				for (let halfedges = 2; halfedges <= 7; halfedges++) {
					if (centerListSize === leafListSize && degree < halfedges + 1) continue
					yield* enumerateStarSignatures(degree, halfedges, centerListSize, leafListSize)
				}
			}
		}
	}
}

/**
 * Parses a signature and generates branching rules for the resulting situation.
 *
 * @param signature - The star graph signature.
 * @param situationId - The unique ID for this situation.
 * @returns The situation object and its analyzed branching rules.
 */
export function analyzeSituation(signature: string, situationId: number) {
	const G = parseStarGraph(signature)
	const situation: LocalSituation = { canon: G, situationId, signature }
	const rules = autogenerateRules(situation).map(x =>
		analyzeRule(x, computeFeatureVector, subtractFeatureVectors)
	)
	return { situation, rules }
}

/**
 * Manages the lifecycle of the optimization Web Worker.
 */
export class OptimizationManager {
	private worker: Worker | null = null
	private searchVersion = 0

	/**
	 * Starts a new optimization search.
	 *
	 * @param params - Optimization parameters and callbacks.
	 */
	start(params: {
		ruleAnalyses: BranchingRuleWithAnalysis[][]
		bounds: { min: PartialFeatureVector; max: PartialFeatureVector }
		onProgress: (percent: number) => void
		onBest: (weights: FeatureVector, base: number) => void
		onDone: () => void
		onError: (msg: string) => void
	}) {
		if (!browser) return
		this.stop()
		const version = ++this.searchVersion

		this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
		this.worker.onmessage = (event: MessageEvent<OptimizationWorkerOutput>) => {
			if (version !== this.searchVersion) return
			const message = event.data
			if (message.type === "progress") {
				params.onProgress(message.percent)
			} else if (message.type === "currentBest") {
				const { x, value } = message
				const w = Object.fromEntries(features.map((f, i) => [f, x[i]])) as FeatureVector
				params.onBest(w, value)
			} else if (message.type === "done") {
				params.onDone()
			} else if (message.type === "error") {
				params.onError(message.message)
			}
		}
		this.worker.onerror = err => {
			if (version !== this.searchVersion) return
			params.onError(String(err))
		}

		const payload: OptimizationWorkerInput = {
			type: "start",
			ruleDeltasGroups: params.ruleAnalyses.map(group =>
				group.map(rule => rule.branchDetails.map(b => ({ ...b.featuresDelta })))
			),
			minPartialMeasure: { ...params.bounds.min },
			maxPartialMeasure: { ...params.bounds.max }
		}
		this.worker.postMessage(payload)
	}

	/**
	 * Terminates the current optimization search.
	 */
	stop() {
		this.searchVersion++
		this.worker?.terminate()
		this.worker = null
	}

	/**
	 * Whether an optimization search is currently running.
	 */
	get isRunning() {
		return this.worker !== null
	}
}
