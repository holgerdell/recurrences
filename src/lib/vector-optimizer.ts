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
	/**
	 * Called when the optimization phase changes.
	 *
	 * @param phase - A description of the current phase.
	 */
	onPhase?: (phase: string) => void
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

function dot(a: readonly number[], b: readonly number[]): number {
	let s = 0
	for (let i = 0; i < a.length; i++) s += a[i] * b[i]
	return s
}

function l2Norm(a: readonly number[]): number {
	return Math.sqrt(dot(a, a))
}

function add(a: readonly number[], b: readonly number[]): number[] {
	const out = new Array(a.length)
	for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i]
	return out
}

function sub(a: readonly number[], b: readonly number[]): number[] {
	const out = new Array(a.length)
	for (let i = 0; i < a.length; i++) out[i] = a[i] - b[i]
	return out
}

function scale(a: readonly number[], s: number): number[] {
	const out = new Array(a.length)
	for (let i = 0; i < a.length; i++) out[i] = a[i] * s
	return out
}

function matVec(H: readonly number[][], v: readonly number[]): number[] {
	const out = new Array(v.length).fill(0)
	for (let i = 0; i < v.length; i++) {
		let s = 0
		for (let j = 0; j < v.length; j++) s += H[i][j] * v[j]
		out[i] = s
	}
	return out
}

function identityMatrix(n: number): number[][] {
	const H: number[][] = []
	for (let i = 0; i < n; i++) {
		const row = new Array(n).fill(0)
		row[i] = 1
		H.push(row)
	}
	return H
}

function outer(a: readonly number[], b: readonly number[]): number[][] {
	const n = a.length
	const out: number[][] = []
	for (let i = 0; i < n; i++) {
		const row = new Array(n)
		for (let j = 0; j < n; j++) row[j] = a[i] * b[j]
		out.push(row)
	}
	return out
}

function matMul(A: readonly number[][], B: readonly number[][]): number[][] {
	const n = A.length
	const out: number[][] = []
	for (let i = 0; i < n; i++) {
		const row = new Array(n).fill(0)
		for (let k = 0; k < n; k++) {
			const aik = A[i][k]
			if (aik === 0) continue
			for (let j = 0; j < n; j++) row[j] += aik * B[k][j]
		}
		out.push(row)
	}
	return out
}

function matAdd(A: readonly number[][], B: readonly number[][]): number[][] {
	const n = A.length
	const out: number[][] = []
	for (let i = 0; i < n; i++) {
		const row = new Array(n)
		for (let j = 0; j < n; j++) row[j] = A[i][j] + B[i][j]
		out.push(row)
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
	const { onProgress, onNewBest, onPhase } = callbacks

	if (min.length !== dimension || max.length !== dimension) {
		throw new Error("min/max bounds must match dimension")
	}

	const sampler = new LowDiscrepancySequence(dimension)

	let bestValue = Infinity
	let bestX: number[] | null = null

	type Candidate = { x: number[]; value: number }
	const candidates: Candidate[] = []

	onPhase?.("Phase 1: Global Sampling")
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
		let currentX = [...seed.x]
		let currentFX = seed.value

		// For d ≈ 10, Nelder-Mead often needs multiple attempts with perturbations to find the global minimum.
		// We perform several restarts for each top candidate to explore the local landscape.
		const restartsPerSeed = 3
		for (let restart = 0; restart < restartsPerSeed; restart++) {
			onPhase?.(
				`Phase 2: Nelder-Mead Refinement (Seed ${i + 1}/${seeds.length}, Restart ${restart + 1}/${restartsPerSeed})`
			)
			const result = nelderMead(
				x => {
					const projected = pointwiseClamp(x, min, max)
					const val = evaluate(projected) ?? 1e10

					// Add a quadratic penalty for being out of bounds to guide the optimizer back.
					// The penalty should be large enough to discourage staying outside but not so large
					// that it causes numerical instability or masks the function's local features.
					let penalty = 0
					for (let j = 0; j < dimension; j++) {
						if (x[j] < min[j]) penalty += Math.pow(min[j] - x[j], 2)
						else if (x[j] > max[j]) penalty += Math.pow(x[j] - max[j], 2)
					}
					return val + penalty * 1e4
				},
				currentX,
				{ maxIterations, tolerance }
			)

			const projectedX = pointwiseClamp(result.x, min, max)
			const actualValue = evaluate(projectedX) ?? Infinity

			// Only update the global best if the actual (unpenalized) value is better.
			if (actualValue < bestValue) {
				bestValue = actualValue
				bestX = [...projectedX]
				onNewBest?.(bestX, actualValue)
			}

			// Update the current point for the next restart if we found an improvement.
			if (actualValue < currentFX) {
				currentFX = actualValue
				currentX = [...projectedX]
			}

			// Perturb the best point for the next restart to create a fresh simplex.
			// We use a 5% perturbation to help escape local stagnation.
			currentX = currentX.map((v, j) => {
				const range = max[j] - min[j]
				return clamp(v + (Math.random() - 0.5) * range * 0.05, min[j], max[j])
			})
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

	const { onProgress, onNewBest, onPhase } = callbacks

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

	onPhase?.("Phase 1: Global Sampling")
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
	const seeds = candidates.slice(0, topK)

	// Phase 2: CMA-ES evolution (Multi-start)
	for (let s = 0; s < seeds.length; s++) {
		const seed = seeds[s].x
		const lambda = populationSize ?? 4 + Math.floor(3 * Math.log(dimension))
		const mu = Math.floor(lambda / 2)

		// Precompute weights for Active CMA-ES
		// Positive weights for the top mu individuals, negative for the bottom.
		const weights = new Array(lambda)
		let positiveWeightSum = 0
		for (let i = 0; i < lambda; i++) {
			weights[i] = Math.log((lambda + 1) / 2) - Math.log(i + 1)
			if (weights[i] > 0) positiveWeightSum += weights[i]
		}
		// Normalize positive weights
		for (let i = 0; i < mu; i++) weights[i] /= positiveWeightSum

		const mueff = 1 / weights.slice(0, mu).reduce((sum, w) => sum + w * w, 0)

		// Evolution paths and adaptation parameters
		const csigma = (mueff + 2) / (dimension + mueff + 3)
		const dsigma = 1 + 2 * Math.max(0, Math.sqrt((mueff - 1) / (dimension + 1)) - 1) + csigma
		const cc = 4 / (dimension + 4)
		const c1 = 2 / (Math.pow(dimension + 1.3, 2) + mueff)
		const cmu = Math.min(
			1 - c1,
			(2 * (mueff - 2 + 1 / mueff)) / (Math.pow(dimension + 2, 2) + mueff)
		)

		// Scale negative weights to ensure stability
		const negativeWeightSum = weights.slice(mu).reduce((sum, w) => sum + Math.abs(w), 0)
		const alphaMu = 1 + c1 / cmu
		const alphaMueff = 1 + (2 * mueff) / (mueff + 2)
		const alphaPosDef = (1 - c1 - cmu) / (dimension * cmu)
		const scaleNeg = Math.min(alphaMu, alphaMueff, alphaPosDef) / negativeWeightSum
		for (let i = mu; i < lambda; i++) weights[i] *= scaleNeg

		let mean = [...seed]
		let stepSize = sigma

		const ps = new Array(dimension).fill(0)
		const pc = new Array(dimension).fill(0)

		// Covariance matrix (diagonal approximation for stability in JS)
		const diagC = new Array(dimension).fill(1)

		let bestValueInSeed = seeds[s].value
		let stagnationCount = 0

		for (let gen = 0; gen < generations; gen++) {
			if (gen % 20 === 0) {
				onPhase?.(
					`Phase 2: CMA-ES Evolution (Seed ${s + 1}/${seeds.length}, Gen ${gen + 1}/${generations})`
				)
			}
			const population: { x: number[]; z: number[]; value: number }[] = []

			for (let k = 0; k < lambda; k++) {
				const z = Array.from({ length: dimension }, randn)
				const x = mean.map((m, j) => m + stepSize * Math.sqrt(diagC[j]) * z[j])
				const projected = project(x)

				const actualValue = evaluate(projected) ?? Infinity
				let value = actualValue

				// Boundary handling: Add a quadratic penalty for points outside the feasible region.
				if (value !== Infinity) {
					let penalty = 0
					for (let j = 0; j < dimension; j++) {
						if (x[j] < min[j]) penalty += Math.pow(x[j] - min[j], 2)
						else if (x[j] > max[j]) penalty += Math.pow(x[j] - max[j], 2)
					}
					if (penalty > 0) {
						value += penalty * 1e6
					}
				}

				population.push({ x: projected, z, value })

				// Only update the global best with the actual (unpenalized) value
				if (actualValue < bestValue) {
					bestValue = actualValue
					bestX = projected
					onNewBest?.(projected, actualValue)
				}
			}

			// Sort by fitness
			population.sort((a, b) => a.value - b.value)

			// Check for stagnation
			if (population[0].value < bestValueInSeed - 1e-9) {
				bestValueInSeed = population[0].value
				stagnationCount = 0
			} else {
				stagnationCount++
			}

			// Early stopping: if no improvement for 100 generations or step size is tiny
			if (stagnationCount > 100 || stepSize < 1e-10) {
				break
			}

			// Update mean
			const oldMean = [...mean]
			const newMean = new Array(dimension).fill(0)
			const avgZ = new Array(dimension).fill(0)

			for (let i = 0; i < mu; i++) {
				const p = population[i]
				for (let j = 0; j < dimension; j++) {
					newMean[j] += weights[i] * p.x[j]
					avgZ[j] += weights[i] * p.z[j]
				}
			}
			mean = newMean

			// Cumulative Step-size Adaptation (CSA)
			for (let j = 0; j < dimension; j++) {
				ps[j] = (1 - csigma) * ps[j] + Math.sqrt(csigma * (2 - csigma) * mueff) * avgZ[j]
			}

			const psNorm = Math.sqrt(ps.reduce((sum, val) => sum + val * val, 0))
			const expectedZ =
				Math.sqrt(dimension) * (1 - 1 / (4 * dimension) + 1 / (21 * dimension * dimension))
			stepSize *= Math.exp((csigma / dsigma) * (psNorm / expectedZ - 1))

			// Update pc and diagonal C
			const hsig =
				psNorm / Math.sqrt(1 - Math.pow(1 - csigma, 2 * (gen + 1))) <
				(1.4 + 2 / (dimension + 1)) * expectedZ
					? 1
					: 0

			for (let j = 0; j < dimension; j++) {
				const avgD = (mean[j] - oldMean[j]) / stepSize
				pc[j] = (1 - cc) * pc[j] + hsig * Math.sqrt(cc * (2 - cc) * mueff) * avgD

				// Rank-1 update
				const rank1 = pc[j] * pc[j]
				// Rank-mu update (Active CMA-ES: uses all individuals with positive/negative weights)
				let rankMu = 0
				for (let i = 0; i < lambda; i++) {
					if (weights[i] === 0) continue
					const d = (population[i].x[j] - oldMean[j]) / stepSize
					// For negative weights, we use the distance from the mean but ensure it doesn't
					// shrink the variance too aggressively.
					const val = weights[i] >= 0 ? d * d : Math.max(0, d * d - diagC[j])
					rankMu += weights[i] * val
				}

				diagC[j] =
					(1 - c1 - cmu) * diagC[j] +
					c1 * (rank1 + (1 - hsig) * cc * (2 - cc) * diagC[j]) +
					cmu * rankMu
			}

			// Safety: prevent step size and variance from exploding or vanishing
			stepSize = Math.max(1e-11, Math.min(stepSize, 2.0))
			for (let j = 0; j < dimension; j++) {
				diagC[j] = Math.max(1e-14, Math.min(diagC[j], 1e6))
			}

			if (gen % 20 === 0) {
				onProgress?.(0.3 + 0.7 * ((s * generations + gen + 1) / (seeds.length * generations)))
			}
		}
	}

	if (!bestX) {
		throw new Error("CMA-ES failed to find a solution")
	}

	return { x: bestX, value: bestValue }
}

/**
 * Optimizes a vector using a hybrid approach: global sampling followed by BFGS refinement.
 *
 * Notes:
 * - Uses finite-difference gradients and an Armijo backtracking line search.
 * - Handles bounds by optimizing a penalized objective in the unconstrained space and returning the
 *   best projected point (unpenalized objective).
 */
export async function optimizeVectorBFGS(
	params: OptimizeVectorParams & {
		/** Maximum number of BFGS iterations for each refinement. */
		maxIterations: number
		/** Convergence tolerance (gradient norm / step norm). */
		tolerance: number
	},
	callbacks: OptimizationCallbacks = {}
): Promise<{ x: number[]; value: number }> {
	const { dimension, min, max, evaluate, initialSamples, topK, maxIterations, tolerance } = params
	const { onProgress, onNewBest, onPhase } = callbacks

	if (min.length !== dimension || max.length !== dimension) {
		throw new Error("min/max bounds must match dimension")
	}
	if (dimension === 0) {
		throw new Error("dimension must be > 0")
	}

	const sampler = new LowDiscrepancySequence(dimension)

	let bestValue = Infinity
	let bestX: number[] | null = null

	type Candidate = { x: number[]; value: number }
	const candidates: Candidate[] = []

	const penalty = (x: readonly number[]) => {
		let p = 0
		for (let j = 0; j < dimension; j++) {
			if (x[j] < min[j]) p += Math.pow(min[j] - x[j], 2)
			else if (x[j] > max[j]) p += Math.pow(x[j] - max[j], 2)
		}
		return p
	}

	const objectiveWithPenalty = (x: readonly number[]): number => {
		const projected = pointwiseClamp([...x], min, max)
		const val = evaluate(projected)
		const base = val ?? 1e10
		return base + penalty(x) * 1e4
	}

	const gradient = (x: readonly number[]): number[] => {
		const g = new Array(dimension).fill(0)
		const fx = objectiveWithPenalty(x)
		for (let i = 0; i < dimension; i++) {
			const h = 1e-6 * Math.max(1, Math.abs(x[i]))
			const xp = [...x]
			const xm = [...x]
			xp[i] += h
			xm[i] -= h
			const fp = objectiveWithPenalty(xp)
			const fm = objectiveWithPenalty(xm)
			// Fallback to forward difference if symmetric diff is numerically unstable.
			const denom = 2 * h
			let gi = (fp - fm) / denom
			if (!Number.isFinite(gi)) gi = (fp - fx) / h
			g[i] = Number.isFinite(gi) ? gi : 0
		}
		return g
	}

	onPhase?.("Phase 1: Global Sampling")
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
		if (i % 50 === 0) onProgress?.(0.7 * (i / initialSamples))
	}

	candidates.sort((a, b) => a.value - b.value)
	const seeds = candidates.slice(0, topK)

	const restartsPerSeed = 2
	for (let i = 0; i < seeds.length; i++) {
		for (let restart = 0; restart < restartsPerSeed; restart++) {
			onPhase?.(
				`Phase 2: BFGS Refinement (Seed ${i + 1}/${seeds.length}, Restart ${restart + 1}/${restartsPerSeed})`
			)

			let x = [...seeds[i].x]
			// Small random perturbation to avoid identical starts.
			if (restart > 0) {
				x = x.map((v, j) => {
					const range = max[j] - min[j]
					return clamp(v + (Math.random() - 0.5) * range * 0.05, min[j], max[j])
				})
			}

			let H = identityMatrix(dimension)
			let g = gradient(x)
			let fx = objectiveWithPenalty(x)

			for (let iter = 0; iter < maxIterations; iter++) {
				const gNorm = l2Norm(g)
				if (!Number.isFinite(gNorm) || gNorm < tolerance) break

				// Descent direction p = -H g
				let p = scale(matVec(H, g), -1)
				if (dot(p, g) >= 0) {
					// Reset if H got bad.
					H = identityMatrix(dimension)
					p = scale(g, -1)
				}

				// Armijo backtracking line search
				let alpha = 1
				const c1 = 1e-4
				const gtp = dot(g, p)
				let xNext = x
				let fNext = fx
				for (let ls = 0; ls < 20; ls++) {
					xNext = add(x, scale(p, alpha))
					fNext = objectiveWithPenalty(xNext)
					if (Number.isFinite(fNext) && fNext <= fx + c1 * alpha * gtp) break
					alpha *= 0.5
				}

				const step = sub(xNext, x)
				const stepNorm = l2Norm(step)
				x = xNext
				fx = fNext
				const gNext = gradient(x)

				// Track best using the true objective (unpenalized, projected)
				const projected = pointwiseClamp([...x], min, max)
				const actual = evaluate(projected)
				if (actual !== null && actual < bestValue) {
					bestValue = actual
					bestX = projected
					onNewBest?.(projected, actual)
				}

				if (!Number.isFinite(stepNorm) || stepNorm < tolerance) break

				// BFGS update (inverse Hessian)
				const y = sub(gNext, g)
				const s = step
				const sty = dot(s, y)
				if (Number.isFinite(sty) && sty > 1e-12) {
					const rho = 1 / sty
					const I = identityMatrix(dimension)
					const syT = outer(s, y)
					const ysT = outer(y, s)
					const ssT = outer(s, s)
					const left = matAdd(I, scaleMatrix(syT, -rho))
					const right = matAdd(I, scaleMatrix(ysT, -rho))
					H = matAdd(matMul(matMul(left, H), right), scaleMatrix(ssT, rho))
				} else {
					H = identityMatrix(dimension)
				}
				g = gNext
			}
		}

		onProgress?.(0.7 + 0.3 * ((i + 1) / seeds.length))
	}

	if (!bestX) {
		throw new Error("Optimization failed to find a valid solution")
	}
	return { x: bestX, value: bestValue }
}

function scaleMatrix(A: readonly number[][], s: number): number[][] {
	const n = A.length
	const out: number[][] = []
	for (let i = 0; i < n; i++) {
		const row = new Array(n)
		for (let j = 0; j < n; j++) row[j] = A[i][j] * s
		out.push(row)
	}
	return out
}
