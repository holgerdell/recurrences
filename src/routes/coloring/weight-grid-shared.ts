import { buildScalarRecurrence } from "$lib/coloring/rule-engine"
import type {
	BranchingRule,
	BranchingRuleWithAnalysis,
	WeightVector
} from "$lib/coloring/rule-engine"
import { solveRecurrencesFromStrings } from "$lib/recurrence-solver"

export type WeightedScalarRecurrence = ReturnType<typeof buildScalarRecurrence>
export type RuleSolutionSummary = { ruleName: string; solution: string; base: number | null }
export type WeightGridCell = {
	id: string
	w: WeightVector
	limitingRuleId: number
	limitingSituationId: number
	maxBase: number
}

export const GRID_AXIS_COUNT = 500
export const GRID_SEARCH_STEP = 0.002
export const INVALID_WEIGHT_COLOR = "#9ca3af"
export const DEFAULT_RULE_COLOR = "#1f2937"
export const ruleColorPalette = [
	"#0072B2",
	"#E69F00",
	"#56B4E9",
	"#009E73",
	"#F0E442",
	"#D55E00",
	"#CC79A7",
	"#999999"
] as const

export const quantizeWeight = (value: number) => Number(value.toFixed(4))
export const formatWeight = (value: number) => value.toFixed(4)
export const axisValue = (
	index: number,
	axisCount: number = GRID_AXIS_COUNT,
	step: number = GRID_SEARCH_STEP
) => (index === axisCount - 1 ? 1 : quantizeWeight(index * step))

export const snapToAxis = (value: number, step: number = GRID_SEARCH_STEP) => {
	if (value >= 1) return 1
	if (value <= 0) return 0
	return quantizeWeight(Math.round(value / step) * step)
}

export const buildWeightKey = (w: WeightVector) => Object.values(w).map(formatWeight).join("-")

export const weightIndex = (
	w: number,
	step: number = GRID_SEARCH_STEP,
	axisCount: number = GRID_AXIS_COUNT
) => {
	const snapped = snapToAxis(w, step)
	if (snapped === 1) return axisCount - 1
	const idx = Math.round(snapped / step)
	return Math.min(Math.max(idx, 0), axisCount - 1)
}

export const buildRuleIndexMap = (rules: BranchingRule[]) =>
	new Map(rules.map((rule, index) => [rule.name, index]))

export const getRuleColor = (
	ruleName: string,
	ruleColorMap: Map<string, string>,
	defaultColor: string = DEFAULT_RULE_COLOR
) => ruleColorMap.get(ruleName) ?? defaultColor

export const buildPendingTooltip = (w: WeightVector) =>
	`Evaluating… • w4=${formatWeight(w.w4)}, w₃=${formatWeight(w.w3)}, w₂=${formatWeight(w.w2)}`

// export function createBaseCell(w: WeightVector): WeightGridCell {
// 	return {
// 		id: buildWeightKey(w),
// 		w,
// 		// color: "#e5e7eb",
// 		// tooltip: buildPendingTooltip(w)
// 	}
// }

// export function buildInitialWeightGrid(
// 	axisCount: number = GRID_AXIS_COUNT,
// 	w?: Partial<WeightVector>
// ) {
// 	const { w4 = 1, w3 = 1 } = w ?? {}
// 	const cells: WeightGridCell[] = []
// 	for (let j = 0; j < axisCount; j += 1) {
// 		const w2 = axisValue(j, axisCount)
// 		cells.push(createBaseCell({ w4, w3, w2 }))
// 	}
// 	return cells
// }

// export const extractGrowthBase = (solution: string) => {
// 	const powerMatch = solution.match(/([0-9]+(?:\.[0-9]+)?)\^n/)
// 	if (powerMatch) return parseFloat(powerMatch[1])
// 	const fallbackMatch = solution.match(/([0-9]+(?:\.[0-9]+)?)/)
// 	return fallbackMatch ? parseFloat(fallbackMatch[1]) : null
// }

export function buildWeightedRecurrencesForWeights(
	weights: WeightVector,
	analyses: BranchingRuleWithAnalysis[]
): Array<WeightedScalarRecurrence | null> {
	if (weights.w4 === 0 && weights.w3 === 0 && weights.w2 === 0) {
		return analyses.map(() => null)
	}
	return analyses.map(analysis => {
		const deltas = analysis.branchDetails.map(branch => branch.delta)
		const weighted = buildScalarRecurrence(deltas, weights)
		return weighted
	})
}

export function buildRecurrenceSolutionsForWeights(
	_weights: WeightVector,
	recurrences: Array<WeightedScalarRecurrence | null>
): Array<ReturnType<typeof solveRecurrencesFromStrings> | null> {
	return recurrences.map(weighted =>
		weighted ? solveRecurrencesFromStrings(weighted.equation) : null
	)
}

export async function buildCell({
	w,
	ruleGroups
}: {
	w: WeightVector
	ruleGroups: BranchingRuleWithAnalysis[][]
}): Promise<WeightGridCell> {
	let maxBase = -Infinity
	let limitingRuleId = -1
	let limitingSituationId = -1
	for (const group of ruleGroups) {
		if (maxBase === Infinity) {
			break
		}

		const groupRecurrences = group.map(r =>
			buildScalarRecurrence(
				r.branchDetails.map(b => b.delta),
				w
			)
		)

		const solutions = await Promise.all(
			groupRecurrences.map(x => x.equation).map(solveRecurrencesFromStrings)
		)
		if (solutions.length < groupRecurrences.length || groupRecurrences.length === 0) {
			maxBase = Infinity
			break
		}
		let groupMinBase = Infinity
		let groupBestRuleId = -1
		for (let i = 0; i < solutions.length; i++) {
			const x = solutions[i]
			const base = !x.ok || x.divergent ? null : Object.values(x.root ?? {})[0]
			if (!groupRecurrences[i].decreasing || base === null || !Number.isFinite(base)) {
				if (groupMinBase === Infinity) {
					groupBestRuleId = group[i].ruleId
				}
			} else if (base < groupMinBase) {
				groupMinBase = base
				groupBestRuleId = group[i].ruleId
			}
		}
		if (groupMinBase > maxBase) {
			maxBase = groupMinBase
			limitingRuleId = groupBestRuleId
			limitingSituationId = group[0].situationId
		}
	}

	return {
		id: buildWeightKey(w),
		w,
		limitingSituationId,
		limitingRuleId,
		maxBase
	}
}
