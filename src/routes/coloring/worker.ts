import {
	iterateMeasureGrid,
	numberOfGridPoints,
	type Feature,
	type Measure
} from "$lib/coloring/measure"
import type { BranchingRuleWithAnalysis } from "$lib/coloring/rule-engine"
import { buildCell, type WeightGridCell } from "./weight-grid-shared"

export type GridWorkerInput = {
	type: "start"
	ruleGroups: BranchingRuleWithAnalysis[][]
	minPartialMeasure?: Partial<Record<Feature, number>>
	maxPartialMeasure?: Partial<Record<Feature, number>>
	samplesPerAxis: number
}

export type GridWorkerProgressMessage = {
	type: "progress"
	percent: number
}

export type GridWorkerCellMessage = {
	type: "currentBest"
	cell: WeightGridCell
}

export type GridWorkerDoneMessage = {
	type: "done"
}

export type GridWorkerErrorMessage = {
	type: "error"
	message: string
}

export type GridWorkerMessage =
	| GridWorkerProgressMessage
	| GridWorkerCellMessage
	| GridWorkerDoneMessage
	| GridWorkerErrorMessage

self.onmessage = async (event: MessageEvent<GridWorkerInput>) => {
	if (event.data?.type !== "start") return
	const { ruleGroups, samplesPerAxis, minPartialMeasure, maxPartialMeasure } = event.data

	try {
		let best: { weights?: Measure; base: number } = { base: Infinity }

		const totalNumberOfGridPoints = numberOfGridPoints(
			samplesPerAxis,
			minPartialMeasure,
			maxPartialMeasure
		)
		let seenGridPoints = 0
		let percent = 0
		self.postMessage({ type: "progress", percent })
		for (const w of iterateMeasureGrid(samplesPerAxis, minPartialMeasure, maxPartialMeasure)) {
			const cell = await buildCell({ w, ruleGroups })
			const base = cell.maxBase
			if (base !== null && base < best.base) {
				self.postMessage({ type: "currentBest", cell })
				best = { weights: cell.w, base }
			}
			seenGridPoints += 1
			const progressCandidate = seenGridPoints / totalNumberOfGridPoints
			if (progressCandidate - percent > 0.001) {
				percent = progressCandidate
				self.postMessage({ type: "progress", percent })
			}
		}
		const done: GridWorkerDoneMessage = {
			type: "done"
		}
		self.postMessage(done)
	} catch (error) {
		const message: GridWorkerErrorMessage = {
			type: "error",
			message: error instanceof Error ? error.message : String(error)
		}
		self.postMessage(message)
	}
}
