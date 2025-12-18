<script lang="ts">
	import { rules } from "$lib/coloring/3coloring-rules"
	import {
		analyzeRules,
		buildMissingRuleSnippets,
		buildWeightedScalarRecurrence,
		describeAssignments,
		testBranchingRuleExhaustiveness,
		type WeightVector
	} from "$lib/coloring/rule-engine"
	import GraphView from "$lib/components/GraphView.svelte"
	import { solveRecurrencesFromStrings } from "$lib/recurrence-solver"

	type WeightedScalarRecurrence = ReturnType<typeof buildWeightedScalarRecurrence>

	const ruleAnalyses = analyzeRules(rules)
	const exhaustivenessReport = testBranchingRuleExhaustiveness(rules)
	const missingRuleSnippets = buildMissingRuleSnippets(exhaustivenessReport)

	let coeffN1 = $state(1)
	let coeffN2 = $state(1)

	const sanitizeWeight = (value: number) => (Number.isFinite(value) ? value : 0)

	const userWeights: WeightVector = $derived({
		w3: sanitizeWeight(coeffN1),
		w2: sanitizeWeight(coeffN2)
	})

	const weightedRecurrences = $derived.by<Array<WeightedScalarRecurrence | null>>(() => {
		const weights = userWeights
		return ruleAnalyses.map(analysis => {
			const deltas = analysis.branchDetails.map(branch => branch.delta)
			if (weights.w3 === 0 && weights.w2 === 0) return null
			const drops = deltas.map(delta => weights.w3 * delta.n3 + weights.w2 * delta.n2)
			if (drops.some(drop => drop <= 0)) return null
			const weighted = buildWeightedScalarRecurrence(deltas, weights)
			return weighted.drops.length ? weighted : null
		})
	})

	const recurrenceSolutions = $derived.by<Array<Promise<string> | null>>(() =>
		weightedRecurrences.map(weighted =>
			weighted ? solveRecurrencesFromStrings(weighted.equation) : null
		)
	)
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

	<div class="rounded-lg border border-emerald-200 bg-white p-4 text-sm text-gray-800">
		<div class="text-xs font-semibold tracking-wide text-emerald-700 uppercase">Custom Measure</div>
		<p class="mt-2">
			Set the coefficients for <span class="font-mono">n₁</span> and
			<span class="font-mono">n₂</span>
			to define the scalar measure <span class="font-mono">n = c₁·n₁ + c₂·n₂</span> that the solver will
			use for every rule.
		</p>
		<div class="mt-4 grid gap-4 md:grid-cols-2">
			<label
				class="flex flex-col gap-1 text-xs font-semibold tracking-wide text-gray-600 uppercase">
				<span>Coefficient c₁ (n₁)</span>
				<input
					type="number"
					min="0"
					step="0.1"
					class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none"
					bind:value={coeffN1} />
			</label>
			<label
				class="flex flex-col gap-1 text-xs font-semibold tracking-wide text-gray-600 uppercase">
				<span>Coefficient c₂ (n₂)</span>
				<input
					type="number"
					min="0"
					step="0.1"
					class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none"
					bind:value={coeffN2} />
			</label>
		</div>
		<p class="mt-3 text-xs text-gray-500">
			Current measure: <span class="font-mono">n = {userWeights.w3}·n₁ + {userWeights.w2}·n₂</span>
		</p>
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
							edges={situation.edges} />
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

				<div class="mt-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
					Scalar Recurrence (custom measure)
				</div>
				{#if weightedRecurrences[i]}
					<div class="font-mono text-base">{weightedRecurrences[i]?.display}</div>
				{:else}
					<div class="text-sm text-red-600">
						The chosen coefficients do not decrease every branch.
					</div>
				{/if}

				<div class="mt-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">Solution</div>
				<div class="font-mono text-base text-gray-800">
					{#if weightedRecurrences[i] && recurrenceSolutions[i]}
						{#await recurrenceSolutions[i]}
							<span class="text-gray-500">Computing…</span>
						{:then solution}
							{solution}
						{:catch error}
							<span class="text-red-600">
								{error instanceof Error ? error.message : String(error)}
							</span>
						{/await}
					{:else}
						<span class="text-red-600">Provide coefficients that decrease all branches.</span>
					{/if}
				</div>
			</div>

			<!-- BEFORE -->
			<div>
				<h3 class="mb-2 font-medium">Before branching</h3>
				<div class="mx-auto w-fit space-y-2 rounded-lg border bg-gray-50 p-4">
					<GraphView
						root={rule.root}
						focus={rule.focus ?? [rule.root]}
						nodes={rule.before.nodes.map(n => ({
							...n,
							diff: (rule.focus ?? [rule.root]).includes(n.id) ? "root" : "unchanged"
						}))}
						edges={rule.before.edges} />
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
								edges={branchView.after.edges} />
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
