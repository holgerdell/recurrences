import { browser } from "$app/environment"
import { type RuleDeltas, features } from "$lib/coloring/featureSpace"
import type { TFeatureVector } from "./coloring/rule-engine"
import type { OptimizationWorkerOutput, OptimizationWorkerInput } from "./vector-optimizer-worker"

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
		/**
		 * The ordered list of feature keys corresponding to the optimizer vector indices.
		 *
		 * If omitted, defaults to `$lib/coloring/featureSpace.features`.
		 */
		featureKeys?: readonly string[]
		/**
		 * Numeric rule deltas grouped by situation.
		 *
		 * Expected shape:
		 * - `ruleDeltasGroups[situationIndex][ruleIndex][branchIndex][featureIndex]`
		 *
		 * Meanings:
		 * - `situationIndex`: which local situation / instance we are optimizing against
		 * - `ruleIndex`: which branching rule within that situation
		 * - `branchIndex`: which branch of that branching rule
		 * - `featureIndex`: index into the optimizer weight vector `w: number[]`
		 *
		 * Invariants:
		 * - Every `branchDelta` vector must have length `features.length`.
		 * - The `featureIndex` ordering must match the global `features` array from the supplied
		 *   `featureKeys` array.
		 */
		ruleDeltasGroups: RuleDeltas[][]
		bounds: { min: Partial<TFeatureVector>; max: Partial<TFeatureVector> }
		onProgress: (percent: number) => void
		onPhase: (phase: string) => void
		onBest: (weights: TFeatureVector, base: number) => void
		onDone: () => void
		onError: (msg: string) => void
	}) {
		if (!browser) return
		this.stop()
		const version = ++this.searchVersion
		const featureKeys = params.featureKeys ?? features

		this.worker = new Worker(new URL("./vector-optimizer-worker.ts", import.meta.url), {
			type: "module"
		})
		this.worker.onmessage = (event: MessageEvent<OptimizationWorkerOutput>) => {
			if (version !== this.searchVersion) return
			const message = event.data
			if (message.type === "progress") {
				params.onProgress(message.percent)
			} else if (message.type === "phase") {
				params.onPhase(message.phase)
			} else if (message.type === "currentBest") {
				const { x, value } = message
				const w = Object.fromEntries(featureKeys.map((f, i) => [f, x[i]])) as Record<string, number>
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
			ruleDeltasGroups: params.ruleDeltasGroups,
			min: featureKeys.map(f => params.bounds.min?.[f] ?? 0),
			max: featureKeys.map(f => params.bounds.max?.[f] ?? 1)
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
