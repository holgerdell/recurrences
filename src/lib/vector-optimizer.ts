import { nelderMead } from "fmin"
import { LowDiscrepancySequence } from "./sobol"

/**
 * Callbacks for monitoring the progress of the optimization.
 */
export type OptimizationCallbacks = {
	/**
	 * Called when progress is made.
	 *
	 * @param percent - The completion percentage (0 to 1).
	 */
	onProgress?: (percent: number) => void
	/**
	 * Called when a new best solution is found.
	 *
	 * @param x - The coefficient values of the new best vector.
	 * @param value - The objective function value for this vector.
	 */
	onNewBest?: (x: number[], value: number) => void
}

/**
 * Parameters for vector optimization.
 */
export type OptimizeVectorParams = {
	/** The number of dimensions in the search space. */
	dimension: number
	/** Lower bounds for each dimension. */
	min: number[]
	/** Upper bounds for each dimension. */
	max: number[]
	/**
	 * The objective function to minimize.
	 *
	 * @param x - The vector to evaluate.
	 * @returns The value of the function, or null if the vector is invalid.
	 */
	evaluate: (x: number[]) => number | null
	/** Total number of low-discrepancy samples for global search. */
	initialSamples: number
	/** Number of top candidates to refine locally. */
	topK: number
}

/**
 * Clamps a value between a minimum and maximum.
 */
function clamp(x: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, x))
}

/**
 * Projects a vector into the defined bounds.
 */
function pointwiseClamp(x: number[], min: number[], max: number[]): number[] {
	const out = new Array(x.length)
	for (let i = 0; i < x.length; i++) {
		out[i] = clamp(x[i], min[i], max[i])
	}
	return out
}

/**
 * Optimizes a vector using a hybrid approach: global sampling followed by Nelder-Mead refinement.
 *
 * @param params - Optimization parameters including Nelder-Mead specific settings.
 * @param callbacks - Optional progress and result callbacks.
 * @returns The best vector found and its objective value.
 */
export async function optimizeVectorNelderMead(
	params: OptimizeVectorParams & {
		/** Maximum number of iterations for each Nelder-Mead refinement. */
		maxIterations: number
		/** Convergence tolerance for Nelder-Mead. */
		tolerance: number
	},
	callbacks: OptimizationCallbacks = {}
): Promise<{ x: number[]; value: number }> {
	const { dimension, min, max, evaluate, initialSamples, topK, maxIterations, tolerance } = params
	const { onProgress, onNewBest } = callbacks

	if (min.length !== dimension || max.length !== dimension) {
		throw new Error("min/max bounds must match dimension")
	}

	const sampler = new LowDiscrepancySequence(dimension)

	let bestValue = Infinity
	let bestX: number[] | null = null

	type Candidate = { x: number[]; value: number }
	const candidates: Candidate[] = []

	// Phase 1: Global sampling using a low-discrepancy sequence
	for (let i = 0; i < initialSamples; i++) {
		const u = sampler.next()

		const x = u.map((v, j) => min[j] + v * (max[j] - min[j]))

		const projected = pointwiseClamp(x, min, max)
		const value = evaluate(projected)

		if (value !== null && value < bestValue) {
			bestValue = value
			bestX = projected
			onNewBest?.(projected, value)
		}

		if (value !== null && Number.isFinite(value)) {
			candidates.push({ x: projected, value })
		}

		if (i % 50 === 0) {
			onProgress?.(0.7 * (i / initialSamples))
		}
	}

	candidates.sort((a, b) => a.value - b.value)
	const seeds = candidates.slice(0, topK)

	// Phase 2: Local refinement using Nelder-Mead starting from the best candidates
	for (let i = 0; i < seeds.length; i++) {
		const seed = seeds[i]

		const result = nelderMead(
			x => {
				const projected = pointwiseClamp(x, min, max)
				return evaluate(projected) ?? Infinity
			},
			seed.x,
			{ maxIterations, tolerance }
		)

		if (result.fx < bestValue) {
			bestValue = result.fx
			bestX = pointwiseClamp(result.x, min, max)
			onNewBest?.(bestX, result.fx)
		}

		onProgress?.(0.7 + 0.3 * ((i + 1) / seeds.length))
	}

	if (!bestX) {
		throw new Error("Optimization failed to find a valid solution")
	}

	return { x: bestX, value: bestValue }
}

/**
 * Optimizes a vector using the Covariance Matrix Adaptation Evolution Strategy (CMA-ES).
 *
 * @param params - Optimization parameters including CMA-ES specific settings.
 * @param callbacks - Optional progress and result callbacks.
 * @returns The best vector found and its objective value.
 */
export async function optimizeVectorCMAES(
	params: OptimizeVectorParams & {
		/** Initial step size (standard deviation). */
		sigma?: number
		/** Number of generations to evolve. */
		generations: number
		/** Size of the population in each generation. */
		populationSize?: number
	},
	callbacks: OptimizationCallbacks = {}
): Promise<{ x: number[]; value: number }> {
	const {
		dimension,
		min,
		max,
		evaluate,
		initialSamples,
		topK,
		sigma = 0.1,
		generations,
		populationSize
	} = params

	const { onProgress, onNewBest } = callbacks

	if (min.length !== dimension || max.length !== dimension) {
		throw new Error("min/max bounds must match dimension")
	}

	// Helper for generating normally distributed random numbers
	const randn = (): number => {
		let u = 0,
			v = 0
		while (u === 0) u = Math.random()
		while (v === 0) v = Math.random()
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
	}

	const project = (x: number[]) => pointwiseClamp(x, min, max)

	// Phase 1: Global sampling to find a good starting point
	const sampler = new LowDiscrepancySequence(dimension)

	type Candidate = { x: number[]; value: number }
	const candidates: Candidate[] = []

	let bestValue = Infinity
	let bestX: number[] | null = null

	for (let i = 0; i < initialSamples; i++) {
		const u = sampler.next()
		const x = u.map((v, j) => min[j] + v * (max[j] - min[j]))
		const projected = project(x)
		const value = evaluate(projected)

		if (value !== null && value < bestValue) {
			bestValue = value
			bestX = projected
			onNewBest?.(projected, value)
		}

		if (value !== null && Number.isFinite(value)) {
			candidates.push({ x: projected, value })
		}

		if (i % 50 === 0) {
			onProgress?.(0.3 * (i / initialSamples))
		}
	}

	if (candidates.length === 0) {
		throw new Error("No valid samples found")
	}

	candidates.sort((a, b) => a.value - b.value)
	const seed = candidates.slice(0, topK)[0].x

	// Phase 2: CMA-ES evolution
	const lambda = populationSize ?? 4 + Math.floor(3 * Math.log(dimension))
	const mu = Math.floor(lambda / 2)

	const weights = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1))
	const weightSum = weights.reduce((a, b) => a + b, 0)
	for (let i = 0; i < weights.length; i++) weights[i] /= weightSum

	let mean = [...seed]
	let stepSize = sigma

	for (let gen = 0; gen < generations; gen++) {
		const population: number[][] = []
		const fitness: number[] = []

		for (let k = 0; k < lambda; k++) {
			const x = mean.map(m => m + stepSize * randn())
			const projected = project(x)
			const value = evaluate(projected) ?? Infinity

			population.push(projected)
			fitness.push(value)

			if (value < bestValue) {
				bestValue = value
				bestX = projected
				onNewBest?.(projected, value)
			}
		}

		const order = fitness.map((f, i) => ({ f, i })).sort((a, b) => a.f - b.f)

		const newMean = Array(dimension).fill(0)
		for (let i = 0; i < mu; i++) {
			const x = population[order[i].i]
			for (let j = 0; j < dimension; j++) {
				newMean[j] += weights[i] * x[j]
			}
		}

		mean = newMean
		stepSize *= 0.99 // mild decay

		onProgress?.(0.3 + 0.7 * ((gen + 1) / generations))
	}

	if (!bestX) {
		throw new Error("CMA-ES failed to find a solution")
	}

	return { x: bestX, value: bestValue }
}
