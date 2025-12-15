<script lang="ts">
	import GraphView from "$lib/components/GraphView.svelte"
	import { solveRecurrencesFromStrings } from "$lib/recurrence-solver"
	import { SvelteMap, SvelteSet } from "svelte/reactivity"

	// ============================================================
	// Domain types
	// ============================================================
	type Color = 1 | 2 | 3

	interface GraphNode {
		id: string
		label: string
		colors: readonly Color[]
		diff?: "root" | "changed" | "unchanged"
		removedColors?: readonly Color[]
	}

	interface GraphEdge {
		from: string
		to: string
	}

	interface Branch {
		label: string
		assignments: Record<string, readonly Color[]>
	}

	interface BranchingRule {
		name: string
		description: string
		root: string
		focus?: readonly string[]
		before: {
			nodes: GraphNode[]
			edges: GraphEdge[]
		}
		branches: Branch[]
	}

	interface BranchAnalysis {
		after: { nodes: GraphNode[]; edges: GraphEdge[] }
		measureAfter: Measure
		delta: Measure
	}

	interface RuleAnalysis {
		measureBefore: Measure
		branchDetails: BranchAnalysis[]
		recurrenceDisplay: string
		recurrenceEquation: string
		weightVector?: WeightVector | null
		solverDisplay?: string
		solverEquation?: string
	}

	interface Measure {
		n3: number
		n2: number
	}

	interface WeightVector {
		w3: number
		w2: number
	}

	// ============================================================
	// Example branching rules
	// ============================================================
	const rules: BranchingRule[] = [
		// --------------------------------------------------------
		// Rule 1: full list, degree ≥ 3
		// --------------------------------------------------------
		{
			name: "Degree ≥ 3, full list",
			description: "Vertex v has colors {1,2,3} and degree at least 3. Branch on the color of v.",
			root: "v",
			focus: ["v"],
			before: {
				nodes: [
					{ id: "v", label: "v", colors: [1, 2, 3] },
					{ id: "u1", label: "u₁", colors: [1, 2, 3] },
					{ id: "u2", label: "u₂", colors: [1, 2, 3] },
					{ id: "u3", label: "u₃", colors: [1, 2, 3] }
				],
				edges: [
					{ from: "v", to: "u1" },
					{ from: "v", to: "u2" },
					{ from: "v", to: "u3" }
				]
			},
			branches: [
				{ label: "v = 1", assignments: { v: [1] } },
				{ label: "v = 2", assignments: { v: [2] } },
				{ label: "v = 3", assignments: { v: [3] } }
			]
		},

		// --------------------------------------------------------
		// Rule 2: one-vs-two split
		// --------------------------------------------------------
		{
			name: "One‑vs‑two split",
			description: "Vertex v has colors {1,2,3}. Branch into v = 1 and v ∈ {2,3}.",
			root: "v",
			focus: ["v"],
			before: {
				nodes: [
					{ id: "v", label: "v", colors: [1, 2, 3] },
					{ id: "u1", label: "u₁", colors: [1, 2, 3] },
					{ id: "u2", label: "u₂", colors: [1, 2, 3] },
					{ id: "u3", label: "u₃", colors: [1, 2, 3] }
				],
				edges: [
					{ from: "v", to: "u1" },
					{ from: "v", to: "u2" },
					{ from: "v", to: "u3" }
				]
			},
			branches: [
				{ label: "v = 1", assignments: { v: [1] } },
				{ label: "v ∈ {2,3}", assignments: { v: [2, 3] } }
			]
		},

		// --------------------------------------------------------
		// Rule 3: v has {1,2}, mixed neighbor lists
		// --------------------------------------------------------
		{
			name: "Mixed neighbor lists for {1,2}-vertex",
			description:
				"Vertex v has colors {1,2}. Two neighbors have {1,3}, one neighbor has {2,3}. Branch on v = 1 vs v = 2.",
			root: "v",
			focus: ["v"],
			before: {
				nodes: [
					{ id: "v", label: "v", colors: [1, 2] },
					{ id: "u1", label: "u₁", colors: [1, 3] },
					{ id: "u2", label: "u₂", colors: [1, 3] },
					{ id: "u3", label: "u₃", colors: [2, 3] }
				],
				edges: [
					{ from: "v", to: "u1" },
					{ from: "v", to: "u2" },
					{ from: "v", to: "u3" }
				]
			},
			branches: [
				{
					label: "v = 1",
					assignments: { v: [1] }
				},
				{
					label: "v = 2",
					assignments: { v: [2] }
				}
			]
		},

		// --------------------------------------------------------
		// Rule 3: v has {1,2}, same neighbor lists
		// --------------------------------------------------------
		{
			name: "Same neighbor lists for {1,2}-vertex",
			description:
				"Vertex v has colors {1,2}. Three neighbors have {2,3}. Branch on v = 1 vs v = 2.",
			root: "v",
			focus: ["v"],
			before: {
				nodes: [
					{ id: "v", label: "v", colors: [1, 2] },
					{ id: "u1", label: "u₁", colors: [2, 3] },
					{ id: "u2", label: "u₂", colors: [2, 3] },
					{ id: "u3", label: "u₃", colors: [2, 3] }
				],
				edges: [
					{ from: "v", to: "u1" },
					{ from: "v", to: "u2" },
					{ from: "v", to: "u3" }
				]
			},
			branches: [
				{
					label: "v = 1",
					assignments: { v: [1] }
				},
				{
					label: "v = 2",
					assignments: { v: [2] }
				}
			]
		},
		// --------------------------------------------------------
		// Rule 4: edge with two common neighbors
		// --------------------------------------------------------
		{
			name: "Edge with two common neighbors",
			description:
				"Vertices v₁ and v₂ have two common neighbors u₁ and u₂. Branch on all valid colorings of v₁ and v₂.",
			root: "v1",
			focus: ["v1", "v2"],
			before: {
				nodes: [
					{ id: "v1", label: "v₁", colors: [1, 2, 3] },
					{ id: "v2", label: "v₂", colors: [1, 2, 3] },
					{ id: "u1", label: "u₁", colors: [1, 2, 3] },
					{ id: "u2", label: "u₂", colors: [1, 2, 3] }
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
					label: "v₁ = 1, v₂ = 2",
					assignments: { v1: [1], v2: [2] }
				},
				{
					label: "v₁ = 1, v₂ = 3",
					assignments: { v1: [1], v2: [3] }
				},
				{
					label: "v₁ = 2, v₂ = 1",
					assignments: { v1: [2], v2: [1] }
				},
				{
					label: "v₁ = 2, v₂ = 3",
					assignments: { v1: [2], v2: [3] }
				},
				{
					label: "v₁ = 3, v₂ = 1",
					assignments: { v1: [3], v2: [1] }
				},
				{
					label: "v₁ = 3, v₂ = 2",
					assignments: { v1: [3], v2: [2] }
				}
			]
		}
	]

	// ============================================================
	// Apply branch + compute diffs
	// ============================================================
	function applyBranchWithDiff(
		rule: BranchingRule,
		branch: Branch
	): { nodes: GraphNode[]; edges: GraphEdge[] } {
		const focusSet = new SvelteSet(rule.focus ?? [rule.root])
		const assignments = branch.assignments
		const singleAssignments = Object.entries(assignments)
			.filter(([, colors]) => colors.length === 1)
			.map(([id, colors]) => ({ id, color: colors[0] as Color | undefined }))
			.filter((entry): entry is { id: string; color: Color } => entry.color !== undefined)

		return {
			edges: rule.before.edges,
			nodes: rule.before.nodes.map((n) => {
				const assigned = assignments[n.id]

				if (assigned) {
					const removed = n.colors.filter((c) => !assigned.includes(c))

					return {
						...n,
						colors: assigned,
						removedColors: removed.length ? removed : undefined,
						diff: focusSet.has(n.id) ? "root" : "changed"
					}
				}

				const toRemove = new SvelteSet<Color>()
				for (const { id, color } of singleAssignments) {
					if (id === n.id) continue
					const adjacent = rule.before.edges.some(
						(e) => (e.from === id && e.to === n.id) || (e.to === id && e.from === n.id)
					)

					if (adjacent && n.colors.includes(color)) {
						toRemove.add(color)
					}
				}

				if (toRemove.size > 0) {
					const filtered = n.colors.filter((c) => !toRemove.has(c))
					const removed = n.colors.filter((c) => toRemove.has(c))

					return {
						...n,
						colors: filtered,
						removedColors: removed.length ? removed : undefined,
						diff: removed.length ? "changed" : "unchanged"
					}
				}

				return {
					...n,
					diff: focusSet.has(n.id) ? "root" : "unchanged"
				}
			})
		}
	}

	function computeDegreeMap(nodes: GraphNode[], edges: GraphEdge[]) {
		const degrees = new SvelteMap<string, number>()
		for (const node of nodes) degrees.set(node.id, 0)
		for (const edge of edges) {
			degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1)
			degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1)
		}
		return degrees
	}

	function collectSpecialNeighbors(focus: readonly string[], edges: GraphEdge[]) {
		const focusSet = new SvelteSet(focus)
		const special = new SvelteSet<string>()
		for (const edge of edges) {
			if (focusSet.has(edge.from)) special.add(edge.to)
			if (focusSet.has(edge.to)) special.add(edge.from)
		}
		return special
	}

	function computeMeasure(
		nodes: GraphNode[],
		edges: GraphEdge[],
		focus: readonly string[]
	): Measure {
		const degrees = computeDegreeMap(nodes, edges)
		const specialNeighbors = collectSpecialNeighbors(focus, edges)
		return nodes.reduce<Measure>(
			(total, node) => {
				const degree = degrees.get(node.id) ?? 0
				const qualifies = degree >= 3 || specialNeighbors.has(node.id)
				if (!qualifies) return total
				if (node.colors.length === 3) return { ...total, n3: total.n3 + 1 }
				if (node.colors.length === 2) return { ...total, n2: total.n2 + 1 }
				return total
			},
			{ n3: 0, n2: 0 }
		)
	}

	function buildRecurrenceStrings(deltas: Measure[]) {
		interface CountedDelta {
			key: string
			delta: Measure
			count: number
		}

		const map = new SvelteMap<string, CountedDelta>()
		for (const delta of deltas) {
			const key = `${delta.n3}|${delta.n2}`
			const existing = map.get(key)
			if (existing) existing.count += 1
			else map.set(key, { key, delta, count: 1 })
		}

		const makeArg = (label: "n3" | "n2", drop: number) => {
			const displayLabel = label === "n3" ? "n₃" : "n₂"
			if (drop === 0) return displayLabel
			return drop < 0 ? `${displayLabel}+${-drop}` : `${displayLabel}-${drop}`
		}

		const terms = Array.from(map.values())
			.sort((a, b) => a.delta.n3 - b.delta.n3 || a.delta.n2 - b.delta.n2)
			.map(({ delta, count }) => {
				const base = `T(${makeArg("n3", delta.n3)},${makeArg("n2", delta.n2)})`
				return count > 1 ? `${count}*${base}` : base
			})

		const lhs = "T(n₃,n₂)"
		const display = `${lhs} = ${terms.join(" + ")}`
		const equation = `${lhs}=${terms.join("+")}`
		return { display, equation }
	}

	function findWeightVector(deltas: Measure[]): WeightVector | null {
		const MAX_WEIGHT = 12
		for (let w3 = 1; w3 <= MAX_WEIGHT; w3++) {
			for (let w2 = 0; w2 <= MAX_WEIGHT; w2++) {
				if (w2 === 0 && deltas.some((d) => d.n3 <= 0)) continue
				const ok = deltas.every((delta) => w3 * delta.n3 + w2 * delta.n2 > 0)
				if (ok) return { w3, w2 }
			}
		}
		return null
	}

	function buildWeightedScalarRecurrence(
		deltas: Measure[],
		weights: WeightVector
	): { display: string; equation: string; drops: number[] } {
		const drops = deltas.map((delta) => weights.w3 * delta.n3 + weights.w2 * delta.n2)
		const counts = new SvelteMap<number, number>()
		for (const drop of drops) {
			if (drop <= 0) continue
			counts.set(drop, (counts.get(drop) ?? 0) + 1)
		}
		const termEntries = Array.from(counts.entries())
		if (termEntries.length === 0) {
			return {
				display: "T(n) = T(n)",
				equation: "T(n)=T(n)",
				drops: []
			}
		}
		const terms = termEntries
			.sort((a, b) => a[0] - b[0])
			.map(([drop, count]) => {
				const base = `T(n-${drop})`
				return count > 1 ? `${count}*${base}` : base
			})
		const display = `T(n) = ${terms.join(" + ")}`
		const equation = `T(n)=${terms.join("+")}`
		return { display, equation, drops }
	}

	function analyzeRule(rule: BranchingRule): RuleAnalysis {
		const focus = rule.focus ?? [rule.root]
		const measureBefore = computeMeasure(rule.before.nodes, rule.before.edges, focus)
		const branchDetails = rule.branches.map((branch) => {
			const after = applyBranchWithDiff(rule, branch)
			const measureAfter = computeMeasure(after.nodes, after.edges, focus)
			const rawDelta: Measure = {
				n3: measureBefore.n3 - measureAfter.n3,
				n2: measureBefore.n2 - measureAfter.n2
			}
			const delta = rawDelta.n3 === 0 && rawDelta.n2 === 0 ? { n3: 0, n2: 1 } : rawDelta
			return { after, measureAfter, delta }
		})
		const deltas = branchDetails.map((b) => b.delta)
		const { display, equation } = buildRecurrenceStrings(deltas)
		const weightVector = findWeightVector(deltas)
		let solverDisplay: string | undefined
		let solverEquation: string | undefined
		if (weightVector) {
			const weighted = buildWeightedScalarRecurrence(deltas, weightVector)
			const components = [
				`${weightVector.w3}·n₃`,
				weightVector.w2 > 0 ? `${weightVector.w2}·n₂` : undefined
			].filter((part): part is string => Boolean(part))
			const measureLabel = components.join(" + ")
			solverDisplay = `Measure n = ${measureLabel}: ${weighted.display}`
			solverEquation = weighted.equation
		}
		return {
			measureBefore,
			branchDetails,
			recurrenceDisplay: display,
			recurrenceEquation: equation,
			weightVector,
			solverDisplay,
			solverEquation
		}
	}

	const ruleAnalyses = rules.map((rule) => analyzeRule(rule))
	const recurrenceSolutions = ruleAnalyses.map((analysis) =>
		analysis.solverEquation
			? solveRecurrencesFromStrings(analysis.solverEquation)
			: Promise.resolve("No decreasing combination found")
	)
</script>

<div class="mx-auto max-w-6xl space-y-12 p-8">
	<h1 class="text-3xl font-bold">Branching Rules for List 3‑Coloring</h1>

	<p class="text-gray-700">
		Each rule below illustrates a local structure in a list-coloring instance, its branching options, and the
		resulting recurrence on the measures we track. After each rule you can inspect the
		recurrence, a weighted scalar reduction (when available), and the asymptotic solution produced by
		the recurrence solver.
	</p>

	<div class="rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm text-gray-800">
		<div class="font-semibold uppercase tracking-wide text-gray-600">Legend</div>
		<ul class="mt-2 list-disc space-y-1 pl-5">
			<li>
				<span class="font-mono">n₃</span> — number of vertices whose lists still contain three colors and whose degree is at
				least three.
			</li>
			<li>
				<span class="font-mono">n₂</span> — number of vertices with two available colors and degree at least three.
			</li>
		</ul>
		(Neighbors of branching vertices are assumed to have degree at least three.)
	</div>

	{#each rules as rule, i}
		{@const analysis = ruleAnalyses[i]}
		<section class="space-y-8 rounded-xl border border-gray-300 p-6">
			<header>
				<h2 class="text-xl font-semibold">{rule.name}</h2>
				<p class="mt-1 text-gray-600">{rule.description}</p>
			</header>

			<div class="rounded-lg border border-dashed bg-white p-4 text-sm">
				<div class="text-xs font-semibold tracking-wide text-gray-500 uppercase">Recurrence</div>
				<div class="font-mono text-base">{analysis.recurrenceDisplay}</div>

				{#if analysis.solverDisplay}
					<div class="mt-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
						Weighted Measure
					</div>
					<div class="font-mono text-base">{analysis.solverDisplay}</div>
				{/if}

				<div class="mt-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">Solution</div>
				<div class="font-mono text-base text-gray-800">
					{#await recurrenceSolutions[i]}
						<span class="text-gray-500">Computing…</span>
					{:then solution}
						{solution}
					{:catch error}
						<span class="text-red-600">
							{error instanceof Error ? error.message : String(error)}
						</span>
					{/await}
				</div>
			</div>

			<!-- BEFORE -->
			<div>
				<h3 class="mb-2 font-medium">Before branching</h3>
				<div class="mx-auto w-fit space-y-2 rounded-lg border bg-gray-50 p-4">
					<GraphView
						root={rule.root}
						focus={rule.focus ?? [rule.root]}
						nodes={rule.before.nodes.map((n) => ({
							...n,
							diff: (rule.focus ?? [rule.root]).includes(n.id) ? "root" : "unchanged"
						}))}
						edges={rule.before.edges}
					/>
				</div>
			</div>

			<!-- AFTER -->
			<div>
				<h3 class="mb-3 font-medium">After branching</h3>

				<div class="flex flex-wrap gap-6">
					{#each rule.branches as branch, j}
						{@const branchView = analysis.branchDetails[j]}

						<div class="flex-1 space-y-2 rounded-lg border bg-gray-50 p-4">
							<div class="font-semibold">{branch.label}</div>

							<GraphView
								root={rule.root}
								focus={rule.focus ?? [rule.root]}
								scale={0.65}
								nodes={branchView.after.nodes}
								edges={branchView.after.edges}
							/>
						</div>
					{/each}
				</div>
			</div>
		</section>
	{/each}
</div>
