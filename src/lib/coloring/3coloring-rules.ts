import type { BranchingRule } from "./rule-engine"

const v = { id: "v", role: "root" } as const
const v1 = { id: "v1", role: "root" } as const
const v2 = { id: "v2", role: "root" } as const
const a = { id: "a", role: "separator" } as const
const b = { id: "b", role: "separator" } as const
const c = { id: "c", role: "separator" } as const

/**
 * Curated catalog of branching rules used by the coloring rule engine demo cases.
 */
export const rules: BranchingRule[] = [
	{
		name: "Degree ≥ 3, full list",
		description: "Vertex v has colors {1,2,3} and degree at least 3. Branch on the color of v.",
		before: {
			nodes: [
				{ ...v, colors: [1, 2, 3] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 2, 3] },
				{ ...c, colors: [1, 2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [
			{ assignments: { v: [1] } },
			{ assignments: { v: [2] } },
			{ assignments: { v: [3] } }
		]
	},
	{
		name: "One‑vs‑two split",
		description: "Vertex v has colors {1,2,3}. Branch into v = 1 and v ∈ {2,3}.",
		before: {
			nodes: [
				{ ...v, colors: [1, 2, 3] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 2, 3] },
				{ ...c, colors: [1, 2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [{ assignments: { v: [1] } }, { assignments: { v: [2, 3] } }]
	},
	{
		name: "Mixed neighbor lists for {1,2}-vertex",
		description:
			"Vertex v has colors {1,2}. Two neighbors have {1,3}, one neighbor has {2,3}. Branch on v = 1 vs v = 2.",
		before: {
			nodes: [
				{ ...v, colors: [1, 2] },
				{ ...a, colors: [1, 3] },
				{ ...b, colors: [1, 3] },
				{ ...c, colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [
			{
				assignments: { v: [1] }
			},
			{
				assignments: { v: [2] }
			}
		]
	},
	{
		name: "Same neighbor lists for {1,2}-vertex",
		description: "Vertex v has colors {1,2}. Three neighbors have {2,3}. Branch on v = 1 vs v = 2.",
		before: {
			nodes: [
				{ ...v, colors: [1, 2] },
				{ ...a, colors: [2, 3] },
				{ ...b, colors: [2, 3] },
				{ ...c, colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [
			{
				assignments: { v: [1] }
			},
			{
				assignments: { v: [2] }
			}
		]
	},
	{
		name: "Edge with two common neighbors",
		description:
			"Vertices v₁ and v₂ share neighbors u₁ and u₂. Branch on whether each vertex is fixed to 1 or remains in {2,3}.",
		before: {
			nodes: [
				{ ...v1, colors: [1, 2, 3] },
				{ ...v2, colors: [1, 2, 3] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 2, 3] }
			],
			edges: [
				{ from: "v1", to: "v2" },
				{ from: "v1", to: "a" },
				{ from: "v1", to: "b" },
				{ from: "v2", to: "a" },
				{ from: "v2", to: "b" }
			]
		},
		branches: [
			{
				assignments: { v1: [1], v2: [2, 3] }
			},
			{
				assignments: { v1: [2, 3], v2: [1] }
			},
			{
				assignments: { v1: [2, 3], v2: [2, 3] }
			}
		]
	},
	{
		name: "Generated rule 1",
		description: "Auto-generated for missing signature 12|123|13|23:111000",
		before: {
			nodes: [
				{ ...v, colors: [1, 2] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 3] },
				{ ...c, colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [{ assignments: { v: [1] } }, { assignments: { v: [2] } }]
	},

	{
		name: "Generated rule 2",
		description: "Auto-generated for missing signature 13|123|12|23:111000",
		before: {
			nodes: [
				{ ...v, colors: [1, 3] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 2] },
				{ ...c, colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [{ assignments: { v: [1] } }, { assignments: { v: [3] } }]
	},

	{
		name: "Generated rule 3",
		description: "Auto-generated for missing signature 23|123|12|13:111000",
		before: {
			nodes: [
				{ ...v, colors: [2, 3] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 2] },
				{ ...c, colors: [1, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [{ assignments: { v: [2] } }, { assignments: { v: [3] } }]
	},

	{
		name: "Generated rule 4",
		description: "Auto-generated for missing signature 123|12|13|23:111000",
		before: {
			nodes: [
				{ ...v, colors: [1, 2, 3] },
				{ ...a, colors: [1, 2] },
				{ ...b, colors: [1, 3] },
				{ ...c, colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [
			{ assignments: { v: [1] } },
			{ assignments: { v: [2] } },
			{ assignments: { v: [3] } }
		]
	},

	{
		name: "Generated rule 5",
		description: "Auto-generated for missing signature 123|123|12|13:111000",
		before: {
			nodes: [
				{ ...v, colors: [1, 2, 3] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 2] },
				{ ...c, colors: [1, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [
			{ assignments: { v: [1] } },
			{ assignments: { v: [2] } },
			{ assignments: { v: [3] } }
		]
	},
	{
		name: "Generated rule 6",
		description: "Auto-generated for missing signature 123|123|12|23:111000",
		before: {
			nodes: [
				{ ...v, colors: [1, 2, 3] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 2] },
				{ ...c, colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [
			{ assignments: { v: [1] } },
			{ assignments: { v: [2] } },
			{ assignments: { v: [3] } }
		]
	},
	{
		name: "Generated rule 7",
		description: "Auto-generated for missing signature 123|123|13|23:111000",
		before: {
			nodes: [
				{ ...v, colors: [1, 2, 3] },
				{ ...a, colors: [1, 2, 3] },
				{ ...b, colors: [1, 3] },
				{ ...c, colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "a" },
				{ from: "v", to: "b" },
				{ from: "v", to: "c" }
			]
		},
		branches: [
			{ assignments: { v: [1] } },
			{ assignments: { v: [2] } },
			{ assignments: { v: [3] } }
		]
	}
] as const
