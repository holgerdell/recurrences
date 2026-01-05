// Browser-safe Sobol / Halton-style sequence (base-prime version)
// Deterministic, low-discrepancy, worker-safe

const PRIMES = [
	2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
	101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193,
	197, 199
]

export class LowDiscrepancySequence {
	private index = 1
	private readonly dim: number

	constructor(dim: number) {
		this.dim = dim
	}

	private radicalInverse(n: number, base: number): number {
		let val = 0
		const invBase = 1 / base
		let inv = invBase

		while (n > 0) {
			const digit = n % base
			val += digit * inv
			n = Math.floor(n / base)
			inv *= invBase
		}

		return val
	}

	next(): number[] {
		const out = new Array(this.dim)
		for (let i = 0; i < this.dim; i++) {
			out[i] = this.radicalInverse(this.index, PRIMES[i % PRIMES.length])
		}
		this.index++
		return out
	}
}
