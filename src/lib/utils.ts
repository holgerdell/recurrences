export function character(i: number) {
	if (!Number.isInteger(i) || i < 0) throw new Error("index must be a non-negative integer")
	if (i > 25) throw new Error("index out of range (max 25)")
	return String.fromCharCode("a".charCodeAt(0) + i)
}

/**
 * Popcount for 4-bit masks.
 *
 * @param x - Unsigned integer whose low 4 bits encode a color mask.
 * @returns Number of set bits in the low 4 bits of x.
 */
export const popcount = (x: number): number =>
	((x >> 0) & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1)

/**
 * Formats a duration in milliseconds into a human-readable string.
 *
 * @param ms - The duration in milliseconds.
 * @returns A formatted string (e.g., "1.2 s" or "150.0 ms").
 */
export const formatMillis = (ms: number) => {
	if (!Number.isFinite(ms)) return "-"
	if (ms < 1000) return `${ms.toFixed(1)} ms`
	return `${(ms / 1000).toFixed(2)} s`
}

/**
 * Formats a number as a percentage string.
 *
 * @param num - The number to format (e.g., 0.5).
 * @returns A percentage string (e.g., "50.0%").
 */
export const formatPercent = (num: number) => `${num.toFixed(1)}%`

/**
 * Formats numbers to a given number of decimal digits while trimming trailing zeros.
 *
 * @param x - Value to format.
 * @param digits - Number of decimal digits to keep.
 * @returns Human-readable numeric string.
 */
export function formatNumber(x: number, digits: number = 4): string {
	if (!Number.isFinite(x)) return String(x)
	const factor = 10 ** digits
	const roundedUp = Math.ceil(x * factor) / factor
	return roundedUp.toFixed(digits).replace(/\.?0+$/, "")
}

/**
 * Snaps numbers close to an integer to that integer to avoid floating noise.
 *
 * @param val - Input value to snap.
 * @param eps - Acceptable deviation from the nearest integer.
 * @returns Snapped value or the original when outside epsilon.
 */
export function snapInt(val: number, eps = 1e-6): number {
	if (!Number.isFinite(val)) return val
	const i = Math.round(val)
	return Math.abs(val - i) < eps ? i : val
}

export function map2D<T, U>(array: T[][], fn: (value: T, row: number, col: number) => U): U[][] {
	return array.map((row, i) => row.map((value, j) => fn(value, i, j)))
}
