import type { BranchingRuleWithAnalysis, WeightVector } from "$lib/coloring/rule-engine"
import {
	axisValue,
	buildCell,
	GRID_AXIS_COUNT,
	GRID_SEARCH_STEP,
	type WeightGridCell
} from "./weight-grid-shared"

export type GridWorkerInput = {
	type: "start"
	ruleGroups: BranchingRuleWithAnalysis[][]
	w?: Partial<WeightVector>
	axisCount?: number
	step?: number
}

export type GridWorkerCellMessage = {
	type: "cell"
	cell: WeightGridCell
}

export type GridWorkerDoneMessage = {
	type: "done"
	bestWeights: WeightVector | null
	bestBase: number | null
}

export type GridWorkerErrorMessage = {
	type: "error"
	message: string
}

export type GridWorkerMessage =
	| GridWorkerCellMessage
	| GridWorkerDoneMessage
	| GridWorkerErrorMessage

self.onmessage = async (event: MessageEvent<GridWorkerInput>) => {
	if (event.data?.type !== "start") return
	const {
		ruleGroups,
		axisCount = GRID_AXIS_COUNT,
		step = GRID_SEARCH_STEP,
		w: fixedW = {}
	} = event.data

	try {
		let best: { weights?: WeightVector; base: number } = { base: Infinity }

		const w4Values = (() => {
			if (fixedW.w4 !== undefined) return [fixedW.w4]
			return Array.from({ length: axisCount }, (_, i) => axisValue(i, axisCount, step))
		})()

		const w3Values = (() => {
			if (fixedW.w3 !== undefined) return [fixedW.w3]
			return Array.from({ length: axisCount }, (_, i) => axisValue(i, axisCount, step))
		})()

		const w2Values = (() => {
			if (fixedW.w2 !== undefined) return [fixedW.w2]
			return Array.from({ length: axisCount }, (_, j) => axisValue(j, axisCount, step))
		})()

		for (const w4 of w4Values) {
			for (const w3 of w3Values) {
				for (const w2 of w2Values) {
					const cell = await buildCell({ w: { w4, w3, w2 }, ruleGroups })
					self.postMessage({ type: "cell", cell })
					const base = cell.maxBase
					if (base !== null && base < best.base) {
						best = { weights: cell.w, base }
					}
				}
			}
		}
		const done: GridWorkerDoneMessage = {
			type: "done",
			bestWeights: best?.weights ?? null,
			bestBase: best?.base ?? null
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
