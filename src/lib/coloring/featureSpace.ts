import { solveRecurrencesFromStrings } from "$lib/recurrence-solver"
import { formatNumber } from "$lib/utils"
import type { Graph, GraphNode } from "./graph"
import { buildScalarRecurrence, type TFeatureVector } from "./rule-engine"

/**
 * Represents the feature vector deltas for each branch of a rule.
 */
// A rule with k branches is encoded as an array of k feature vectors.
// Each feature vector is a number[] whose indices align with the optimizer's weight vector.
export type RuleDeltas = number[][]

/**
 * Computes the value of a given measure with respect to multiple rule groups.
 *
 * For each local situation, it selects the best rule (the one with the smallest base) under the
 * given measure. It then returns the value of the worst situation (the one with the largest "best"
 * base).
 *
 * @param w - The weight vector (measure) to evaluate.
 * @param ruleDeltasGroups - Groups of rules (one group per situation), where each rule is represented by its branch deltas.
 * @returns The base value of the limiting situation.
 */
export function evaluateMeasure(w: number[], ruleDeltasGroups: number[][][][]): number {
	const weights = Object.fromEntries(w.map((v, i) => [`x${i}`, v])) as TFeatureVector
	const dim = w.length
	if (dim === 0) return Infinity
	const toDeltaObject = (vec: readonly number[]): TFeatureVector =>
		Object.fromEntries(vec.map((v, i) => [`x${i}`, v])) as TFeatureVector

	let valueOfWorstSituation = -Infinity
	for (const situation of ruleDeltasGroups) {
		if (valueOfWorstSituation === Infinity) break
		let valueOfThisSituation = Infinity
		for (const rule of situation) {
			if (rule.length === 0) continue
			if (rule.some(branchDelta => branchDelta.length !== dim)) continue
			const deltas: TFeatureVector[] = rule.map(branchDelta => toDeltaObject(branchDelta))
			const r = buildScalarRecurrence(deltas, weights)
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

/**
 * Builds a feature definition for vertices with a specific list size and a minimum degree.
 *
 * @param L - The required list size.
 * @param d - The minimum degree.
 * @returns A feature definition object.
 */
const buildFeatureGE = (L: number, d: number) => ({
	description: `number of vertices with lists of size ${L} and whose degree is ≥${d}`,
	nodeProperty: (G: Graph, n: GraphNode) => n.colors.length === L && G.degree(n.id) >= d,
	requiresListSize: L,
	normalizer: true // if L is maximum
})

/**
 * Builds a feature definition for vertices with a specific list size and an exact degree.
 *
 * @param L - The required list size.
 * @param d - The exact degree.
 * @returns A feature definition object.
 */
const buildFeatureEQ = (L: number, d: number) => ({
	description: `number of vertices with lists of size ${L} and whose degree is =${d}`,
	nodeProperty: (G: Graph, n: GraphNode) => n.colors.length === L && G.degree(n.id) === d,
	requiresListSize: L,
	normalizer: false
})

/**
 * Definitions for all features used in the measure. Each feature is defined by a description and a
 * property that checks if a node matches the feature.
 */
const L_SIZES = [4, 3, 2] as const
const DEG_CONFIGS = [
	{ suffix: "≥5", type: "GE", d: 5 },
	{ suffix: "4", type: "EQ", d: 4 },
	{ suffix: "3", type: "EQ", d: 3 }
] as const

/**
 * Represents a valid feature key.
 */
export type Feature = `n_{${(typeof L_SIZES)[number]},${(typeof DEG_CONFIGS)[number]["suffix"]}}`

export const FeatureDefinition = Object.fromEntries(
	L_SIZES.flatMap(L =>
		DEG_CONFIGS.map(conf => {
			const key = `n_{${L},${conf.suffix}}`
			const feat = conf.type === "GE" ? buildFeatureGE(L, conf.d) : buildFeatureEQ(L, conf.d)
			return [key, feat]
		})
	)
) as Record<Feature, ReturnType<typeof buildFeatureGE>>

/**
 * An array of all available feature keys.
 */
export const features = Object.keys(FeatureDefinition) as Feature[]

/**
 * A mapping from feature keys to their numeric values.
 */
export type FeatureVector = Record<string, number>

/**
 * A partial mapping from feature keys to their numeric values.
 */
export type PartialFeatureVector = Partial<FeatureVector>

/**
 * Computes the feature vector for a given graph.
 *
 * @param G - The graph to analyze.
 * @returns A vector where each entry is the count of vertices matching the corresponding feature.
 */
export function computeFeatureVector(G: Graph): FeatureVector {
	const mu = {} as FeatureVector
	for (const variable of features) {
		mu[variable] = 0
	}
	for (const n of G.nodes) {
		for (const variable of features) {
			const feature = FeatureDefinition[variable]
			if (feature.nodeProperty(G, n)) mu[variable] += 1
		}
	}
	return mu
}

/**
 * Computes the difference between two feature vectors.
 *
 * @param a - The first feature vector.
 * @param b - The second feature vector.
 * @returns A new feature vector representing a - b.
 */
export function subtractFeatureVectors(a: TFeatureVector, b: TFeatureVector): TFeatureVector {
	const out = {} as TFeatureVector
	const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
	for (const k of keys) out[k] = (a[k] ?? 0) - (b[k] ?? 0)
	return out
}

/**
 * Adds two feature vectors.
 *
 * @param a - The first feature vector.
 * @param b - The second feature vector.
 * @returns A new feature vector representing a + b.
 */
export function addFeatureVectors(a: TFeatureVector, b: TFeatureVector): TFeatureVector {
	const out = {} as TFeatureVector
	const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)])
	for (const k of keys) out[k] = (a[k] ?? 0) + (b[k] ?? 0)
	return out
}

/**
 * Scales a feature vector by a scalar value.
 *
 * @param v - The feature vector to scale.
 * @param s - The scalar value.
 * @returns A new feature vector representing v * s.
 */
export function scaleFeatureVector(v: TFeatureVector, s: number): TFeatureVector {
	const out = {} as TFeatureVector
	const keys = new Set<string>([...Object.keys(v)])
	for (const k of keys) out[k] = (v[k] ?? 0) * s
	return out
}

/**
 * Returns a human-readable description of a feature.
 *
 * @param f - The feature to describe.
 * @returns The description string.
 */
export function describeFeature(f: Feature): string {
	return FeatureDefinition[f].description
}

/**
 * Checks if a string is a valid feature key.
 *
 * @param s - The string to check.
 * @returns True if the string is a valid feature key, false otherwise.
 */
export function isFeature(s: string): s is Feature {
	for (const v of features) if (s === v) return true
	return false
}

/**
 * Creates a feature vector with every coefficient initialized to the provided value or from an
 * existing vector.
 *
 * @param x - The initial value for all features, or an existing feature vector to copy.
 * @returns A new feature vector.
 */
export function createFeatureVector(x?: number | FeatureVector): FeatureVector {
	if (x === undefined) x = 0
	if (typeof x === "number") {
		const tmp = {} as FeatureVector
		for (const f of features) tmp[f] = x
		return tmp
	}
	return { ...x }
}

/**
 * Returns a human-readable string with the coefficient values and the feature names.
 *
 * @param v - The feature vector to format.
 * @returns A formatted string representation of the vector.
 */
export function formatMeasure(v: TFeatureVector): string {
	const keys = Object.keys(v)
	return keys
		.filter(f => v[f] !== 0)
		.map(f => `${formatNumber(v[f], 2)}·${f}`)
		.join(" + ")
}

/**
 * Computes the inner product of two feature vectors.
 *
 * @param a - The first feature vector.
 * @param b - The second feature vector.
 * @returns The scalar result of the inner product.
 */
export function innerProduct(a: TFeatureVector, b: TFeatureVector): number {
	let s = 0
	for (const f of Object.keys(a)) s += a[f] * (b[f] ?? 0)
	return s
}

/**
 * Computes the total number of points in a grid defined by the given steps and bounds.
 *
 * @param steps - Number of samples per axis.
 * @param minPartialMeasure - Optional lower bounds for each feature.
 * @param maxPartialMeasure - Optional upper bounds for each feature.
 * @returns The total number of grid points.
 */
export function numberOfGridPoints(
	steps: number,
	minPartialMeasure: PartialFeatureVector = {},
	maxPartialMeasure: PartialFeatureVector = {}
): number {
	let num = 1
	for (const f of features) {
		const min = Math.max(minPartialMeasure[f] ?? 0, 0)
		const max = Math.min(maxPartialMeasure[f] ?? 1, 1)
		if (min < max) num *= steps
	}
	return num
}

/**
 * Iterate over a grid of vectors in feature-space. Useful for grid search. This performs a standard
 * Cartesian product of the sampled values for each feature.
 *
 * @param steps - Number of samples per axis (must be >= 2 to include both ends of each interval).
 * @param minPartialMeasure - Optional lower bounds for each feature (defaults to 0 when omitted).
 * @param maxPartialMeasure - Optional upper bounds for each feature (defaults to 1 when omitted).
 * @returns An iterable iterator of feature vectors.
 */
export function* iterateMeasureGrid(
	steps: number,
	minPartialMeasure: PartialFeatureVector = {},
	maxPartialMeasure: PartialFeatureVector = {}
): IterableIterator<FeatureVector> {
	if (steps < 2) throw new Error("steps must be at least 2 to include 0 and 1")
	const valueGrid: Record<Feature, number[]> = {} as Record<Feature, number[]>
	for (const f of features) {
		const min = Math.max(minPartialMeasure[f] ?? 0, 0)
		const max = Math.min(maxPartialMeasure[f] ?? 1, 1)
		if (min === max) {
			valueGrid[f] = [min]
		} else if (min < max) {
			valueGrid[f] = Array.from({ length: steps }, (_, i) => min + ((max - min) * i) / (steps - 1))
		} else {
			valueGrid[f] = []
			return
		}
	}

	const coeffs = {} as FeatureVector
	function* helper(index: number): IterableIterator<FeatureVector> {
		if (index === features.length) {
			yield { ...coeffs }
			return
		}
		const f = features[index]
		for (const v of valueGrid[f]) {
			coeffs[f] = v
			yield* helper(index + 1)
		}
	}

	yield* helper(0)
}
