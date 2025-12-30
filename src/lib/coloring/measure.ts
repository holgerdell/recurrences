import type { Graph, GraphNode } from "./graph-utils"

const buildFeatureGE = (L: number, d: number) => ({
	description: `number of vertices with lists of size ${L} and whose degree is ≥${d}`,
	nodeProperty: (G: Graph, n: GraphNode) => n.colors.length === L && G.degree(n.id) >= d
})

const buildFeatureEQ = (L: number, d: number) => ({
	description: `number of vertices with lists of size ${L} and whose degree is =${d}`,
	nodeProperty: (G: Graph, n: GraphNode) => n.colors.length === L && G.degree(n.id) === d
})

const FeatureDefinition = {
	"n_{4,≥5}": buildFeatureGE(4, 5),
	"n_{4,4}": buildFeatureEQ(4, 4),
	"n_{4,3}": buildFeatureEQ(4, 3),
	"n_{3,≥5}": buildFeatureGE(3, 5),
	"n_{3,4}": buildFeatureEQ(3, 4),
	"n_{3,3}": buildFeatureEQ(3, 3),
	"n_{2,≥5}": buildFeatureGE(2, 5),
	"n_{2,4}": buildFeatureEQ(2, 4),
	"n_{2,3}": buildFeatureEQ(2, 3)
} as const
export type Feature = keyof typeof FeatureDefinition
const features = Object.keys(FeatureDefinition) as Feature[]
export type FeatureVector = Record<Feature, number>

function computeFeatureVector(G: Graph): FeatureVector {
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

function subtractFeatureVectors(a: FeatureVector, b: FeatureVector): FeatureVector {
	const out = {} as FeatureVector
	for (const f of features) out[f] = a[f] - b[f]
	return out
}

function describeFeature(f: Feature): string {
	return FeatureDefinition[f].description
}

function isFeature(s: string): s is Feature {
	for (const v of features) if (s === v) return true
	return false
}

export const degreeFeatureProvider = {
	features,
	describeFeature,
	isFeature,
	computeFeatureVector,
	subtractFeatureVectors
} as const

/**
 * A *measure* is a linear combination of features.
 */
export class Measure {
	coefficients: Record<Feature, number>

	/**
	 * Construct a measure with every coefficient initialized to the provided value.
	 *
	 * @param initial - Starting value assigned to each feature coefficient (default: 0).
	 */
	constructor(initial?: number)
	constructor(coefficients: Record<Feature, number>)
	constructor(x: undefined | number | Record<Feature, number>) {
		if (x === undefined) x = 0
		if (typeof x === "number") {
			const tmp = {} as Record<Feature, number>
			for (const f of features) tmp[f] = x
			this.coefficients = tmp
		} else {
			this.coefficients = { ...x }
		}
	}

	/**
	 * Returns a human-readable string with the coefficient values and the feature names.
	 */
	toString(): string {
		return features
			.filter(f => this.coefficients[f] !== 0)
			.map(f => (this.coefficients[f] === 1 ? f : `${this.coefficients[f].toFixed(2)}·${f}`))
			.join(" + ")
	}

	/**
	 * Computes the inner product of the coefficient vector with a given feature vector.
	 */
	computeMeasure(v: FeatureVector): number {
		let s = 0
		for (const f of features) s += this.coefficients[f] * v[f]
		return s
	}
}

export function numberOfGridPoints(
	steps: number,
	minPartialMeasure: Partial<Record<Feature, number>> = {},
	maxPartialMeasure: Partial<Record<Feature, number>> = {}
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
 * Iterate over a grid of measures with the first feature fixed to 1 and all others ranging over a
 * per-feature interval.
 *
 * @param steps - Number of samples per axis (must be >= 2 to include both ends of each interval).
 * @param minPartialMeasure - Optional lower bounds for each feature (defaults to 0 when omitted).
 * @param maxPartialMeasure - Optional upper bounds for each feature (defaults to 1 when omitted).
 */
export function* iterateMeasureGrid(
	steps: number,
	minPartialMeasure: Partial<Record<Feature, number>> = {},
	maxPartialMeasure: Partial<Record<Feature, number>> = {}
): IterableIterator<Measure> {
	if (steps < 2) throw new Error("steps must be at least 2 to include 0 and 1")
	const coeffs = {} as Record<Feature, number>
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

	function* helper(index: number): IterableIterator<Measure> {
		if (index === features.length) {
			const m = new Measure()
			m.coefficients = { ...coeffs }
			yield m
			return
		}
		const f = features[index]
		const values = valueGrid[f]
		for (const v of values) {
			coeffs[f] = v
			yield* helper(index + 1)
		}
	}

	yield* helper(0)
}
