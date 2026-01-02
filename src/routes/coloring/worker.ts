import { degreeFeatureProvider, type Feature, Measure } from "$lib/coloring/measure"
import type { BranchingRuleWithAnalysis } from "$lib/coloring/rule-engine"
import { evaluateMeasure } from "./weight-grid-shared"
import {
	optimizeVectorNelderMead,
	type OptimizationCallbacks,
	type OptimizeVectorParams
} from "$lib/vector-optimizer"
/* -----------------------------
   Worker message types
-------------------------------- */

export type GridWorkerInput = {
	type: "start"
	ruleGroups: BranchingRuleWithAnalysis[][]
	minPartialMeasure?: Partial<Record<Feature, number>>
	maxPartialMeasure?: Partial<Record<Feature, number>>
}

export type GridWorkerMessage =
	| { type: "progress"; percent: number }
	| { type: "currentBest"; x: number[]; value: number }
	| { type: "done" }
	| { type: "error"; message: string }

function postMessage(message: GridWorkerMessage): void {
	self.postMessage(message)
}

/* -----------------------------
   Worker entry point
-------------------------------- */

self.onmessage = async (event: MessageEvent<GridWorkerInput>) => {
	if (event.data?.type !== "start") return

	const { ruleGroups, minPartialMeasure, maxPartialMeasure } = event.data

	const features = degreeFeatureProvider.features
	const dimension = features.length
	const min = features.map(f => minPartialMeasure?.[f] ?? 0)
	const max = features.map(f => maxPartialMeasure?.[f] ?? 1)

	const callbacks: OptimizationCallbacks = {
		onProgress: percent => {
			postMessage({ type: "progress", percent })
		},
		onNewBest: (x, value) => {
			postMessage({ type: "currentBest", x, value })
		}
	}
	try {
		const param: OptimizeVectorParams = {
			dimension,
			min,
			max,
			evaluate: x => {
				const w = new Measure(
					Object.fromEntries(features.map((f, i) => [f, x[i]])) as Record<Feature, number>
				)
				return evaluateMeasure(w, ruleGroups)
			},
			initialSamples: 3000 * dimension,
			topK: 200
		}
		await optimizeVectorNelderMead(
			{
				...param,
				maxIterations: 400,
				tolerance: 1e-6
			},
			callbacks
		)
		// await optimizeVectorCMAES(
		// 	{
		// 		...param,
		// 		generations: 120,
		// 		sigma: 0.25,
		// 		populationSize: 20
		// 	},
		// 	callbacks
		// )
		postMessage({ type: "done" })
	} catch (error) {
		postMessage({
			type: "error",
			message: error instanceof Error ? error.message : String(error)
		})
	}
}
