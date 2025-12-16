import type { BranchingRule } from "./rule-engine"

/**
 * Curated catalog of branching rules used by the coloring rule engine demo cases.
 */
export const rules: BranchingRule[] = [
	{
		name: "Degree ≥ 3, full list",
		description: "Vertex v has colors {1,2,3} and degree at least 3. Branch on the color of v.",
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2, 3] },
				{ id: "u1", colors: [1, 2, 3] },
				{ id: "u2", colors: [1, 2, 3] },
				{ id: "u3", colors: [1, 2, 3] }
			],
			edges: [
				{ from: "v", to: "u1" },
				{ from: "v", to: "u2" },
				{ from: "v", to: "u3" }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2, 3] },
				{ id: "u1", colors: [1, 2, 3] },
				{ id: "u2", colors: [1, 2, 3] },
				{ id: "u3", colors: [1, 2, 3] }
			],
			edges: [
				{ from: "v", to: "u1" },
				{ from: "v", to: "u2" },
				{ from: "v", to: "u3" }
			]
		},
		branches: [{ assignments: { v: [1] } }, { assignments: { v: [2, 3] } }]
	},
	{
		name: "Mixed neighbor lists for {1,2}-vertex",
		description:
			"Vertex v has colors {1,2}. Two neighbors have {1,3}, one neighbor has {2,3}. Branch on v = 1 vs v = 2.",
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2] },
				{ id: "u1", colors: [1, 3] },
				{ id: "u2", colors: [1, 3] },
				{ id: "u3", colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "u1" },
				{ from: "v", to: "u2" },
				{ from: "v", to: "u3" }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2] },
				{ id: "u1", colors: [2, 3] },
				{ id: "u2", colors: [2, 3] },
				{ id: "u3", colors: [2, 3] }
			],
			edges: [
				{ from: "v", to: "u1" },
				{ from: "v", to: "u2" },
				{ from: "v", to: "u3" }
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
		root: "v1",
		focus: ["v1", "v2"],
		before: {
			nodes: [
				{ id: "v1", colors: [1, 2, 3] },
				{ id: "v2", colors: [1, 2, 3] },
				{ id: "u1", colors: [1, 2, 3] },
				{ id: "u2", colors: [1, 2, 3] }
			],
			edges: [
				{ from: "v1", to: "v2" },
				{ from: "v1", to: "u1" },
				{ from: "v1", to: "u2" },
				{ from: "v2", to: "u1" },
				{ from: "v2", to: "u2" }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2] },
				{ id: "a", colors: [1, 2, 3] },
				{ id: "b", colors: [1, 3] },
				{ id: "c", colors: [2, 3] }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 3] },
				{ id: "a", colors: [1, 2, 3] },
				{ id: "b", colors: [1, 2] },
				{ id: "c", colors: [2, 3] }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [2, 3] },
				{ id: "a", colors: [1, 2, 3] },
				{ id: "b", colors: [1, 2] },
				{ id: "c", colors: [1, 3] }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2, 3] },
				{ id: "a", colors: [1, 2] },
				{ id: "b", colors: [1, 3] },
				{ id: "c", colors: [2, 3] }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2, 3] },
				{ id: "a", colors: [1, 2, 3] },
				{ id: "b", colors: [1, 2] },
				{ id: "c", colors: [1, 3] }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2, 3] },
				{ id: "a", colors: [1, 2, 3] },
				{ id: "b", colors: [1, 2] },
				{ id: "c", colors: [2, 3] }
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
		root: "v",
		focus: ["v"],
		before: {
			nodes: [
				{ id: "v", colors: [1, 2, 3] },
				{ id: "a", colors: [1, 2, 3] },
				{ id: "b", colors: [1, 3] },
				{ id: "c", colors: [2, 3] }
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
]
