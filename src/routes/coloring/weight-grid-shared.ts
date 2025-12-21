import { buildWeightedScalarRecurrence } from "$lib/coloring/rule-engine"
import type { WeightVector, analyzeRules } from "$lib/coloring/rule-engine"
import { solveRecurrencesFromStrings } from "$lib/recurrence-solver"

export type WeightedScalarRecurrence = ReturnType<typeof buildWeightedScalarRecurrence>
export type RuleAnalyses = ReturnType<typeof analyzeRules>
export type RuleSolutionSummary = { ruleName: string; solution: string; base: number | null }
export type WeightGridCell = {
	id: string
	w3: number
	w2: number
	limitingRule?: string
	solution?: string
	color: string
	tooltip: string
}

export const GRID_AXIS_COUNT = 100
export const GRID_SEARCH_STEP = 0.01
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

export const quantizeWeight = (value: number) => Number(value.toFixed(2))
export const formatWeight = (value: number) => value.toFixed(2)
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

export const buildWeightKey = (w3: number, w2: number) => `${formatWeight(w3)}-${formatWeight(w2)}`

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

export const buildRuleIndexMap = (rules: Array<{ name: string }>) =>
	new Map(rules.map((rule, index) => [rule.name, index]))

export const buildRuleColorMap = (
	rules: Array<{ name: string }>,
	palette: readonly string[] = ruleColorPalette
) => new Map(rules.map((rule, index) => [rule.name, palette[index % palette.length]]))

export const getRuleColor = (
	ruleName: string,
	ruleColorMap: Map<string, string>,
	defaultColor: string = DEFAULT_RULE_COLOR
) => ruleColorMap.get(ruleName) ?? defaultColor

export const buildPendingTooltip = (w3: number, w2: number) =>
	`Evaluating… • w₃=${formatWeight(w3)}, w₂=${formatWeight(w2)}`

export function createBaseCell(w3: number, w2: number): WeightGridCell {
	return {
		id: buildWeightKey(w3, w2),
		w3,
		w2,
		color: "#e5e7eb",
		tooltip: buildPendingTooltip(w3, w2)
	}
}

export function buildInitialWeightGrid(axisCount: number = GRID_AXIS_COUNT) {
	const cells: WeightGridCell[] = []
	for (let i = 0; i < axisCount; i += 1) {
		const w3 = axisValue(i, axisCount)
		for (let j = 0; j < axisCount; j += 1) {
			const w2 = axisValue(j, axisCount)
			cells.push(createBaseCell(w3, w2))
		}
	}
	return cells
}

export const extractGrowthBase = (solution: string) => {
	const powerMatch = solution.match(/([0-9]+(?:\.[0-9]+)?)\^n/)
	if (powerMatch) return parseFloat(powerMatch[1])
	const fallbackMatch = solution.match(/([0-9]+(?:\.[0-9]+)?)/)
	return fallbackMatch ? parseFloat(fallbackMatch[1]) : null
}

export function buildWeightedRecurrencesForWeights(
	weights: WeightVector,
	analyses: RuleAnalyses
): Array<WeightedScalarRecurrence | null> {
	if (weights.w3 === 0 && weights.w2 === 0) {
		return analyses.map(() => null)
	}
	return analyses.map(analysis => {
		const deltas = analysis.branchDetails.map(branch => branch.delta)
		const drops = deltas.map(delta => weights.w3 * delta.n3 + weights.w2 * delta.n2)
		if (drops.some(drop => drop <= 0)) return null
		const weighted = buildWeightedScalarRecurrence(deltas, weights)
		return weighted.drops.length ? weighted : null
	})
}

export function buildRecurrenceSolutionsForWeights(
	_weights: WeightVector,
	recurrences: Array<WeightedScalarRecurrence | null>
): Array<Promise<string> | null> {
	return recurrences.map(weighted =>
		weighted ? solveRecurrencesFromStrings(weighted.equation) : null
	)
}

async function resolveRuleResult(ruleName: string, solutionPromise: Promise<string>) {
	const solution = await solutionPromise
	return { ruleName, solution, base: extractGrowthBase(solution) }
}

export async function buildGroupedMaxScalarSolutionForWeights(options: {
	activeRuleNames: Set<string>
	ruleGroups: string[][]
	ruleIndexMap: Map<string, number>
	recurrences: Array<WeightedScalarRecurrence | null>
	solutions: Array<Promise<string> | null>
}): Promise<RuleSolutionSummary | null> {
	const { activeRuleNames, ruleGroups, ruleIndexMap, recurrences, solutions } = options

	const groupBest: RuleSolutionSummary[] = []

	for (const group of ruleGroups) {
		const candidates = group
			.filter(name => activeRuleNames.has(name))
			.map(name => {
				const idx = ruleIndexMap.get(name)
				if (idx === undefined) return null
				const recurrence = recurrences[idx]
				const solutionPromise = solutions[idx]
				if (!recurrence || !solutionPromise) return null
				return { name, promise: solutionPromise }
			})
			.filter((entry): entry is { name: string; promise: Promise<string> } => entry !== null)

		if (!candidates.length) continue

		const resolved = await Promise.all(
			candidates.map(candidate => resolveRuleResult(candidate.name, candidate.promise))
		)
		const valid = resolved.filter(result => result.base !== null)
		if (!valid.length) continue
		const bestInGroup = valid.reduce<RuleSolutionSummary | null>((best, entry) => {
			if (!best) return entry
			return entry.base! < best.base! ? entry : best
		}, null)
		if (bestInGroup) groupBest.push(bestInGroup)
	}

	if (!groupBest.length) return null

	const worstOfBest = groupBest.reduce<RuleSolutionSummary | null>((worst, entry) => {
		if (!worst) return entry
		return entry.base! > worst.base! ? entry : worst
	}, null)

	return worstOfBest ?? null
}

export async function buildCell({
	w3,
	w2,
	activeRuleNames,
	ruleGroups,
	ruleIndexMap,
	analyses,
	ruleColorMap
}: {
	w3: number
	w2: number
	activeRuleNames: readonly string[]
	ruleGroups: string[][]
	ruleIndexMap: Map<string, number>
	analyses: RuleAnalyses
	ruleColorMap: Map<string, string>
}): Promise<WeightGridCell> {
	const weights = { w3, w2 }
	const recurrences = buildWeightedRecurrencesForWeights(weights, analyses)
	const solutions = buildRecurrenceSolutionsForWeights(weights, recurrences)
	const summary = await buildGroupedMaxScalarSolutionForWeights({
		activeRuleNames: new Set(activeRuleNames),
		ruleGroups,
		ruleIndexMap,
		recurrences,
		solutions
	})

	const color = summary?.ruleName
		? getRuleColor(summary.ruleName, ruleColorMap)
		: INVALID_WEIGHT_COLOR
	const tooltip = summary
		? `${summary.ruleName} • w₃=${formatWeight(w3)}, w₂=${formatWeight(w2)}\n${summary.solution}`
		: `Invalid weights • w₃=${formatWeight(w3)}, w₂=${formatWeight(w2)}`

	return {
		id: buildWeightKey(w3, w2),
		w3,
		w2,
		limitingRule: summary?.ruleName,
		solution: summary?.solution,
		color,
		tooltip
	}
}
