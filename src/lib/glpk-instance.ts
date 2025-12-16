import GLPKConstructor, { type GLPK } from "glpk.js"

/**
 * Module-level cache of the GLPK instance so solver calls share one WASM/module load.
 */
let glpkInstance: GLPK | undefined

/**
 * Preloads the appropriate GLPK build (async in browser, sync in Node/Bun) exactly once per app.
 */
export async function initGLPK() {
	if (glpkInstance) return

	if (typeof window !== "undefined") {
		// Browser → async WebAssembly build
		const mod = await Promise.resolve(GLPKConstructor()) // await the WASM loader
		glpkInstance = mod
	} else {
		// Node/Bun → synchronous build
		glpkInstance = GLPKConstructor()
	}
}

/**
 * Returns the cached GLPK instance, throwing if `initGLPK` has not completed yet.
 */
export function getGLPK() {
	if (!glpkInstance) throw new Error("GLPK not initialized. Call await initGLPK() first.")
	return glpkInstance
}
