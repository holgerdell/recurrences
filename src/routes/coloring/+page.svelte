<script lang="ts">
	import GraphView from "$lib/components/GraphView.svelte"
	import {
		analyzeRules,
		buildMissingRuleSnippets,
		describeAssignments,
		testBranchingRuleExhaustiveness
	} from "$lib/coloring/rule-engine"
	import { rules } from "$lib/coloring/3coloring-rules"
	import { solveRecurrencesFromStrings } from "$lib/recurrence-solver"

	const ruleAnalyses = analyzeRules(rules)
	const recurrenceSolutions = ruleAnalyses.map((analysis) =>
		analysis.solverEquation
			? solveRecurrencesFromStrings(analysis.solverEquation)
			: Promise.resolve("No decreasing combination found")
	)
	const exhaustivenessReport = testBranchingRuleExhaustiveness(rules)
	const missingRuleSnippets = buildMissingRuleSnippets(exhaustivenessReport)
</script>

<div class="mx-auto max-w-6xl space-y-12 p-8">
	<h1 class="text-3xl font-bold">Branching Rules for List 3‑Coloring</h1>

	<p class="text-gray-700">
		Each rule below illustrates a local structure in a list-coloring instance, its branching
		options, and the resulting recurrence on the measures we track. After each rule you can inspect
		the recurrence, a weighted scalar reduction (when available), and the asymptotic solution
		produced by the recurrence solver.
	</p>

	<div class="rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm text-gray-800">
		<div class="font-semibold tracking-wide text-gray-600 uppercase">Legend</div>
		<ul class="mt-2 list-disc space-y-1 pl-5">
			<li>
				<span class="font-mono">n₃</span> — number of vertices whose lists still contain three colors
				and whose degree is at least three.
			</li>
			<li>
				<span class="font-mono">n₂</span> — number of vertices with two available colors and degree at
				least three.
			</li>
		</ul>
		(Neighbors of branching vertices are assumed to have degree at least three.)
	</div>

	<div class="rounded-lg border border-blue-200 bg-white p-4 text-sm text-gray-800">
		<div class="text-xs font-semibold tracking-wide text-blue-700 uppercase">Coverage Check</div>
		<p class="mt-2">
			Covered {exhaustivenessReport.coveredCount} of {exhaustivenessReport.totalSituations} canonical
			situations.
		</p>
		{#if exhaustivenessReport.exhaustive}
			<p class="mt-1 text-sm font-medium text-green-700">
				All eligible local situations are covered.
			</p>
		{:else}
			<p class="mt-1 text-sm font-medium text-red-700">
				Missing {exhaustivenessReport.missingCount} situations. Showing up to six examples below.
			</p>
			<div class="mt-4 grid gap-4 md:grid-cols-2">
				{#each exhaustivenessReport.missing.slice(0, 6) as situation (situation.signature)}
					<div class="space-y-2 rounded-lg border bg-gray-50 p-3">
						<div class="text-xs font-semibold text-gray-500 uppercase">Missing situation</div>
						<GraphView
							root="v"
							focus={["v"]}
							scale={0.6}
							nodes={situation.nodes.map((node, idx) => ({
								...node,
								diff: idx === 0 ? "root" : "unchanged"
							}))}
							edges={situation.edges}
						/>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#each rules as rule, i (rule.name)}
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
					{#each rule.branches as branch, j (branch.assignments)}
						{@const branchView = analysis.branchDetails[j]}

						<div class="flex-1 space-y-2 rounded-lg border bg-gray-50 p-4">
							<div class="font-semibold">{describeAssignments(branch.assignments)}</div>

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

	{#if missingRuleSnippets.length}
		<section class="space-y-4 rounded-xl border border-gray-300 bg-white p-6">
			<header>
				<h2 class="text-xl font-semibold">Generated rule templates</h2>
				<p class="mt-1 text-gray-600">
					Copy any snippet below into <span class="font-mono">rules</span> to cover the remaining cases.
				</p>
			</header>
			<pre
				class="rounded-lg border bg-gray-50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
				{missingRuleSnippets.join("\n\n")}
			</pre>
		</section>
	{/if}
</div>
