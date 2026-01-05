import {
	evaluateMeasure,
	features,
	type FeatureVector,
	type PartialFeatureVector,
	type RuleDeltas
} from "$lib/coloring/featureSpace"
import {
	optimizeVectorNelderMead,
	type OptimizationCallbacks,
	type OptimizeVectorParams
} from "$lib/vector-optimizer"

/**
 * Input message for the grid optimization worker.
 */
export type OptimizationWorkerInput = {
	/** The type of action to perform. */
	type: "start"
	/** The groups of rule deltas to optimize against. */
	ruleDeltasGroups: RuleDeltas[][]
	/** Optional lower bounds for the feature vector coefficients. */
	minPartialMeasure?: PartialFeatureVector
	/** Optional upper bounds for the feature vector coefficients. */
	maxPartialMeasure?: PartialFeatureVector
}

/**
 * Output messages sent from the grid optimization worker.
 */
export type OptimizationWorkerOutput =
	| {
			/** Progress update message. */
			type: "progress"
			/** Completion percentage (0 to 1). */
			percent: number
	  }
	| {
			/** New best solution found message. */
			type: "currentBest"
			/** The coefficient values of the best feature vector. */
			x: number[]
			/** The base value (objective function result) for this vector. */
			value: number
	  }
	| {
			/** Search completion message. */
			type: "done"
	  }
	| {
			/** Error message. */
			type: "error"
			/** The error description. */
			message: string
	  }

/**
 * Sends a message from the worker to the main thread.
 *
 * @param message - The message to send.
 */
function postMessage(message: OptimizationWorkerOutput): void {
	self.postMessage(message)
}

/**
 * Handles incoming messages from the main thread to start or manage optimization.
 */
self.onmessage = async (event: MessageEvent<OptimizationWorkerInput>) => {
	if (event.data?.type !== "start") return

	const { ruleDeltasGroups, minPartialMeasure, maxPartialMeasure } = event.data

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
				const w = Object.fromEntries(features.map((f, i) => [f, x[i]])) as FeatureVector
				return evaluateMeasure(w, ruleDeltasGroups)
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
