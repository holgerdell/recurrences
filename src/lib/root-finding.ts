import { snapInt } from "./utils"

/**
 * Finds a positive real solution of f(x)=0 using Brent's method.
 *
 * The solver first attempts to bracket the root by expanding the interval [loInit, hiInit]. If a
 * sign change is found, it uses Brent's method to find the root with the specified tolerance.
 *
 * @param f - Function whose roots are sought.
 * @param loInit - Initial lower bound (assumed >= 1).
 * @param hiInit - Initial upper bound.
 * @param tol - Convergence tolerance.
 * @returns A `number`: The positive root found. `Infinity`: If the function is monotone and approaches zero as x increases (divergent case). `null`: If no root is found within the search range and the function is not approaching zero.
 */
export function findPositiveRoot(
	f: (x: number) => number,
	loInit = 1,
	hiInit = 10,
	tol = 1e-12
): number | null {
	let a = loInit
	let b = hiInit
	let fa = f(a)
	let fb = f(b)

	// Expansion phase to bracket the root (since we expect root >= 1)
	let iter = 0
	while (iter < 20 && b < 1e6) {
		if (fa === 0) return snapInt(a)
		if (fb === 0) break
		if (Math.sign(fa) !== Math.sign(fb)) break
		a = b
		fa = fb
		b *= 2
		fb = f(b)
		iter++
	}

	if (Math.sign(fa) === Math.sign(fb) || fb === 0) {
		const fLarge = f(b * 10)
		// If the function is approaching zero (or underflowed to it), it's divergent.
		if (Math.abs(fLarge) < Math.abs(fb) || (fb === 0 && fLarge === 0)) {
			return Infinity
		}
		if (fb === 0) return snapInt(b)
		return null
	}

	// Brent's Method
	if (Math.abs(fa) < Math.abs(fb)) {
		;[a, b] = [b, a]
		;[fa, fb] = [fb, fa]
	}

	let c = a
	let fc = fa
	let mflag = true
	let d = 0

	for (let i = 0; i < 100; i++) {
		if (fb === 0 || Math.abs(b - a) < tol) return snapInt(b)

		let s: number
		if (fa !== fc && fb !== fc) {
			// Inverse quadratic interpolation
			s =
				(a * fb * fc) / ((fa - fb) * (fa - fc)) +
				(b * fa * fc) / ((fb - fa) * (fb - fc)) +
				(c * fa * fb) / ((fc - fa) * (fc - fb))
		} else {
			// Secant method
			s = b - (fb * (b - a)) / (fb - fa)
		}

		// Bisection conditions
		const condition1 = (s - (3 * a + b) / 4) * (s - b) > 0
		const condition2 = mflag && Math.abs(s - b) >= Math.abs(b - c) / 2
		const condition3 = !mflag && Math.abs(s - b) >= Math.abs(c - d) / 2
		const condition4 = mflag && Math.abs(b - c) < tol
		const condition5 = !mflag && Math.abs(c - d) < tol

		if (condition1 || condition2 || condition3 || condition4 || condition5) {
			s = (a + b) / 2
			mflag = true
		} else {
			mflag = false
		}

		const fs = f(s)
		d = c
		c = b
		fc = fb

		if (fa * fs < 0) {
			b = s
			fb = fs
		} else {
			a = s
			fa = fs
		}

		if (Math.abs(fa) < Math.abs(fb)) {
			;[a, b] = [b, a]
			;[fa, fb] = [fb, fa]
		}
	}

	return snapInt(b)
}
