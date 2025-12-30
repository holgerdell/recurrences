import { Graph, type GraphJSON } from "$lib/coloring/graph-utils"
// import ALL_LOCAL_SITUATIONS_JSON from "$lib/coloring/ALL_LOCAL_SITUATIONS.json"
import { generateAllLocalSituations } from "./3coloring-rules"

type SituationEntry = {
	canon: GraphJSON
	signature: string
	situationId: number
}

type ParsedEntry = {
	canon: Graph
	signature: string
	situationId: number
}

export function parseSituations(raw: SituationEntry[]): ParsedEntry[] {
	return raw.map(entry => ({
		canon: Graph.fromJSON(entry.canon),
		signature: entry.signature,
		situationId: entry.situationId
	}))
}

export function readOrGenerate_ALL_LOCAL_SITUATIONS() {
	return generateAllLocalSituations(3, 5)
	// return parseSituations(ALL_LOCAL_SITUATIONS_JSON as SituationEntry[])
}
