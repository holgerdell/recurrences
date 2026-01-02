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

/**
 * This is the main function that is used to compute the value of a given Measure with respect to
 * given ruleGroups. For each local situation, we use the best rule under the given measure. Then we
 * determine the worst local situation.
 */
export function evaluateMeasure(w: Measure, ruleGroups: BranchingRuleWithAnalysis[][]): number {
	let valueOfWorstSituation = -Infinity
	for (const situation of ruleGroups) {
		if (valueOfWorstSituation === Infinity) break
		let valueOfThisSituation = Infinity
		for (const rule of situation) {
			const r = buildScalarRecurrence(
				rule.branchDetails.map(b => b.featuresDelta),
				w
			)
			if (!r.decreasing) continue
			const solution = solveRecurrencesFromStrings(r.equation)
			if (!solution.ok || solution.divergent) continue
			const valueOfThisRule = Object.values(solution.root)[0]
			if (valueOfThisRule < valueOfThisSituation) {
				valueOfThisSituation = valueOfThisRule
			}
		}
		if (valueOfThisSituation > valueOfWorstSituation) {
			valueOfWorstSituation = valueOfThisSituation
		}
	}
	return valueOfWorstSituation
}
