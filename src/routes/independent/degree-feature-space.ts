import type { FeatureSpace } from "$lib/coloring/feature-space"
import type { Graph } from "$lib/coloring/graph"
import type { FeatureVector } from "$lib/coloring/feature-space"

const MIN_EXACT_DEGREE = 2

function buildDegreeFeatures(maxDegree: number): readonly string[] {
	if (!Number.isInteger(maxDegree) || maxDegree < MIN_EXACT_DEGREE) {
		throw new Error(`maxDegree must be an integer ≥ ${MIN_EXACT_DEGREE}`)
	}
	const out: string[] = [`n_{≥${maxDegree}}`]
	for (let k = maxDegree - 1; k >= MIN_EXACT_DEGREE; k--) {
		out.push(`n_{${k}}`)
	}
	return out
}

/**
 * Builds the degree-only feature space used by the independent-set route.
 *
 * Features are buckets:
 * - `n_{≥d}`: count of vertices with degree ≥ d
 * - `n_{k}`: count of vertices with degree = k, for k = d-1, ..., 3
 */
export function createDegreeFeatureSpace(maxDegree: number): FeatureSpace {
	const features = buildDegreeFeatures(maxDegree)

	function createFeatureVector(x: number | Partial<FeatureVector> = 0): FeatureVector {
		const out: Record<string, number> = {}
		for (const f of features) out[f] = 0
		if (typeof x === "number") {
			for (const f of features) out[f] = x
			return out as FeatureVector
		}
		for (const f of features) out[f] = x[f] ?? 0
		return out as FeatureVector
	}

	function describeFeature(f: string): string {
		if (f === `n_{≥${maxDegree}}`) return `number of vertices with chain-degree ≥${maxDegree}`
		if (f.startsWith("n_{") && f.endsWith("}")) {
			const inner = f.slice(3, -1)
			if (/^\d+$/.test(inner)) return `number of vertices with chain-degree =${inner}`
		}
		return "(unknown feature)"
	}

	function computeFeatureVector(G: Graph): FeatureVector {
		const mu = createFeatureVector(0)
		const geKey = `n_{≥${maxDegree}}`
		for (const n of G.nodes) {
			// Only count vertices that still have a binary list {0,1}.
			if (n.colors.length < 2) continue
			const d = G.chainDegree(n.id)
			if (d >= maxDegree) {
				mu[geKey] += 1
			} else if (d >= MIN_EXACT_DEGREE) {
				const eqKey = `n_{${d}}`
				if (eqKey in mu) mu[eqKey] += 1
			}
		}
		return mu
	}

	return { features, createFeatureVector, describeFeature, computeFeatureVector } as const
}
