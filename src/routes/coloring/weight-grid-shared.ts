import type { Measure } from "$lib/coloring/measure"
import { buildScalarRecurrence } from "$lib/coloring/rule-engine"
import type { BranchingRuleWithAnalysis } from "$lib/coloring/rule-engine"
import { solveRecurrencesFromStrings } from "$lib/recurrence-solver"

export type WeightedScalarRecurrence = ReturnType<typeof buildScalarRecurrence>
export type RuleSolutionSummary = { ruleName: string; solution: string; base: number | null }
export type WeightGridCell = {
	w: Measure
	limitingRuleId: number
	limitingSituationId: number
	maxBase: number
}

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

export function buildWeightedRecurrencesForWeights(
	weights: Measure,
	analyses: BranchingRuleWithAnalysis[]
): Array<WeightedScalarRecurrence | null> {
	return analyses.map(analysis => {
		const deltas = analysis.branchDetails.map(branch => branch.featuresDelta)
		const weighted = buildScalarRecurrence(deltas, weights)
		return weighted
	})
}

export function buildRecurrenceSolutionsForWeights(
	_weights: Measure,
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
	w: Measure
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
				r.branchDetails.map(b => b.featuresDelta),
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
			const base = !x.ok || x.divergent ? null : Object.values(x.root)[0]
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
		w,
		limitingSituationId,
		limitingRuleId,
		maxBase
	}
}
