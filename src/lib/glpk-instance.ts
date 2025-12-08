import GLPKConstructor, { type GLPK } from "glpk.js"

let glpkInstance: GLPK | undefined

/**
 * Pre-loads the correct GLPK build (async if browser, sync if Node/Bun)
 * Call this once at startup (await it) before any solver calls.
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

/** Returns the preloaded GLPK instance synchronously. */
export function getGLPK() {
	if (!glpkInstance) throw new Error("GLPK not initialized. Call await initGLPK() first.")
	return glpkInstance
}
