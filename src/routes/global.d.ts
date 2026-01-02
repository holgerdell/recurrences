declare module "fmin" {
	export function nelderMead(
		f: (x: number[]) => number,
		initial: number[],
		options?: {
			maxIterations?: number
			tolerance?: number
		}
	): {
		x: number[]
		fx: number
		iterations: number
	}
}
