import { type RuleDeltas, evaluateMeasure } from "./coloring/featureSpace"
import {
	type OptimizationCallbacks,
	type OptimizeVectorParams,
	optimizeVectorBFGS
} from "./vector-optimizer"

/**
 * Input message for the grid optimization worker.
 */
export type OptimizationWorkerInput = {
	/** The type of action to perform. */
	type: "start"
	/** The groups of rule deltas to optimize against. */
	ruleDeltasGroups: RuleDeltas[][]
	/** Point-wise lower and upper bounds for the solution vector. */
	min: number[]
	max: number[]
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
			/** Phase update message. */
			type: "phase"
			/** Description of the current phase. */
			phase: string
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

	const { ruleDeltasGroups, min, max } = event.data
	const dimension = min.length
	if (dimension === 0 || max.length !== dimension) {
		postMessage({
			type: "error",
			message: "Invalid optimization bounds: min/max must be non-empty and have the same length."
		})
		return
	}

	const callbacks: OptimizationCallbacks = {
		onProgress: percent => {
			postMessage({ type: "progress", percent })
		},
		onNewBest: (x, value) => {
			postMessage({ type: "currentBest", x, value })
		},
		onPhase: phase => {
			postMessage({ type: "phase", phase })
		}
	}
	try {
		const param: OptimizeVectorParams = {
			dimension,
			min,
			max,
			evaluate: x => {
				return evaluateMeasure(x, ruleDeltasGroups)
			},
			initialSamples: 600 * dimension,
			topK: 5
		}
		await optimizeVectorBFGS(
			{
				...param,
				maxIterations: 4000,
				tolerance: 1e-6
			},
			callbacks
		)
		// await optimizeVectorNelderMead(
		// 	{
		// 		...param,
		// 		maxIterations: 4000,
		// 		tolerance: 1e-6
		// 	},
		// 	callbacks
		// )
		// await optimizeVectorCMAES(
		// 	{
		// 		...param,
		// 		topK: 1,
		// 		generations: 200,
		// 		sigma: 0.25,
		// 		populationSize: 80
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
