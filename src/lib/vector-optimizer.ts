import { nelderMead } from "fmin"
import { LowDiscrepancySequence } from "./sobol"

/* -----------------------------
   Types
-------------------------------- */

export type OptimizationCallbacks = {
	onProgress?: (percent: number) => void
	onNewBest?: (x: number[], value: number) => void
}

export type OptimizeVectorParams = {
	dimension: number
	min: number[]
	max: number[]
	evaluate: (x: number[]) => number | null
	initialSamples: number // total low-discrepancy samples
	topK: number // how many seeds to refine
}

/* -----------------------------
   Helpers
-------------------------------- */

function clamp(x: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, x))
}

function projectToBounds(x: number[], min: number[], max: number[]): number[] {
	const out = new Array(x.length)
	for (let i = 0; i < x.length; i++) {
		out[i] = clamp(x[i], min[i], max[i])
	}
	return out
}

/* -----------------------------
   Main optimizer
-------------------------------- */

export async function optimizeVectorNelderMead(
	params: OptimizeVectorParams & {
		/* Local refinement (Nelder–Mead) */
		maxIterations: number // per-seed NM iterations
		tolerance: number // convergence threshold
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

	/* --- Phase 1: global sampling --- */

	for (let i = 0; i < initialSamples; i++) {
		const u = sampler.next()

		const x = u.map((v, j) => min[j] + v * (max[j] - min[j]))

		const projected = projectToBounds(x, min, max)
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

	/* --- Phase 2: Nelder–Mead refinement --- */

	for (let i = 0; i < seeds.length; i++) {
		const seed = seeds[i]

		const result = nelderMead(
			x => {
				const projected = projectToBounds(x, min, max)
				return evaluate(projected) ?? Infinity
			},
			seed.x,
			{ maxIterations, tolerance }
		)

		if (result.fx < bestValue) {
			bestValue = result.fx
			bestX = projectToBounds(result.x, min, max)
			onNewBest?.(bestX, result.fx)
		}

		onProgress?.(0.7 + 0.3 * ((i + 1) / seeds.length))
	}

	if (!bestX) {
		throw new Error("Optimization failed to find a valid solution")
	}

	return { x: bestX, value: bestValue }
}

/* -----------------------------
   CMA-ES optimizer
-------------------------------- */

export async function optimizeVectorCMAES(
	params: OptimizeVectorParams & {
		/* CMA-ES specific */
		sigma?: number // initial step size
		generations: number
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

	/* ---------- helpers ---------- */

	const randn = (): number => {
		let u = 0,
			v = 0
		while (u === 0) u = Math.random()
		while (v === 0) v = Math.random()
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
	}

	const project = (x: number[]) => projectToBounds(x, min, max)

	/* ---------- Phase 1: global sampling ---------- */

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

	/* ---------- Phase 2: CMA-ES ---------- */

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
