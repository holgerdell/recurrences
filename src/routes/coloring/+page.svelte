<script lang="ts">
	import { onMount } from "svelte"
	import { browser } from "$app/environment"
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
	const ruleIndexMap = new Map(rules.map((rule, index) => [rule.name, index]))

	const defaultEnabledRules = Object.fromEntries(
		rules.map(r => [
			r.name,
			r.name !== "One‑vs‑two split" && r.name !== "Edge with two common neighbors"
		])
	)
	let enabledRules = $state(defaultEnabledRules)
	const activeRules = $derived(rules.filter(rule => enabledRules[rule.name] ?? true))
	const exhaustivenessReport = $derived(testBranchingRuleExhaustiveness(activeRules))
	const missingRuleSnippets = $derived(buildMissingRuleSnippets(exhaustivenessReport))

	let userWeights = $state<WeightVector>({ w3: 1, w2: 0.6241 })
	let isWeightSearchRunning = $state(false)

	const GRID_SEARCH_STEP = 0.01
	const GRID_SEARCH_STEPS = Math.round(1 / GRID_SEARCH_STEP)

	const extractGrowthBase = (solution: string) => {
		const powerMatch = solution.match(/([0-9]+(?:\.[0-9]+)?)\^n/)
		if (powerMatch) return parseFloat(powerMatch[1])
		const fallbackMatch = solution.match(/([0-9]+(?:\.[0-9]+)?)/)
		return fallbackMatch ? parseFloat(fallbackMatch[1]) : null
	}

	const quantizeWeight = (value: number) => Number(value.toFixed(2))

	type RuleSolutionSummary = { ruleName: string; solution: string; base: number | null }

	function buildWeightedRecurrencesForWeights(
		weights: WeightVector,
		analyses = ruleAnalyses
	): Array<WeightedScalarRecurrence | null> {
		if (weights.w3 === 0 && weights.w2 === 0) {
			return analyses.map(() => null)
		}
		return analyses.map(analysis => {
			const deltas = analysis.branchDetails.map(branch => branch.delta)
			const drops = deltas.map(delta => weights.w3 * delta.n3 + weights.w2 * delta.n2)
			if (drops.some(drop => drop <= 0)) return null
			const weighted = buildWeightedScalarRecurrence(deltas, weights)
			return weighted.drops.length ? weighted : null
		})
	}

	function buildRecurrenceSolutionsForWeights(
		weights: WeightVector,
		recurrences = buildWeightedRecurrencesForWeights(weights)
	): Array<Promise<string> | null> {
		return recurrences.map(weighted =>
			weighted ? solveRecurrencesFromStrings(weighted.equation) : null
		)
	}

	function buildMaxScalarSolutionForWeights(
		weights: WeightVector,
		activeRuleList: typeof rules,
		recurrences = buildWeightedRecurrencesForWeights(weights),
		solutions = buildRecurrenceSolutionsForWeights(weights, recurrences)
	): Promise<RuleSolutionSummary | null> | null {
		const candidates = activeRuleList
			.map(rule => {
				const idx = ruleIndexMap.get(rule.name)
				if (idx === undefined) return null
				const recurrence = recurrences[idx]
				const solutionPromise = solutions[idx]
				if (!recurrence || !solutionPromise) return null
				return { ruleName: rule.name, promise: solutionPromise }
			})
			.filter((entry): entry is { ruleName: string; promise: Promise<string> } => entry !== null)

		if (!candidates.length) return null

		return Promise.all(
			candidates.map(async candidate => {
				const solution = await candidate.promise
				return {
					ruleName: candidate.ruleName,
					solution,
					base: extractGrowthBase(solution)
				}
			})
		).then(results => {
			if (!results.length) return null
			const best = results.reduce<RuleSolutionSummary | null>((current, entry) => {
				if (!current) return entry
				if (entry.base === null) return current
				if (current.base === null || entry.base > current.base) return entry
				return current
			}, null)
			return best ?? results[0]
		})
	}

	const weightedRecurrences = $derived(buildWeightedRecurrencesForWeights(userWeights))

	const recurrenceSolutions = $derived(
		buildRecurrenceSolutionsForWeights(userWeights, weightedRecurrences)
	)

	type RuleCompatibilityIssue = { name: string; reason: string }
	const incompatibleRules = $derived(
		activeRules
			.map(rule => {
				const idx = ruleIndexMap.get(rule.name)
				if (idx === undefined) return null
				const weighted = weightedRecurrences[idx]
				const solutionPromise = recurrenceSolutions[idx]
				if (weighted && solutionPromise) return null
				return {
					name: rule.name,
					reason: !weighted
						? "Selected weights do not decrease every branch."
						: "Recurrence solver unavailable for these weights."
				}
			})
			.filter((issue): issue is RuleCompatibilityIssue => issue !== null)
	)

	const maxScalarSolution = $derived(
		buildMaxScalarSolutionForWeights(
			userWeights,
			activeRules,
			weightedRecurrences,
			recurrenceSolutions
		)
	)

	async function runGridSearchOnLoad() {
		if (!browser) return
		if (isWeightSearchRunning) return
		isWeightSearchRunning = true
		try {
			const activeRuleSnapshot = [...activeRules]
			let best: { weights: WeightVector; base: number } | null = null
			for (let i = 0; i <= GRID_SEARCH_STEPS; i += 1) {
				const w3 = quantizeWeight(i * GRID_SEARCH_STEP)
				for (let j = 0; j <= GRID_SEARCH_STEPS; j += 1) {
					const w2 = quantizeWeight(j * GRID_SEARCH_STEP)
					const weights = { w3, w2 }
					const recurrences = buildWeightedRecurrencesForWeights(weights)
					const solutions = buildRecurrenceSolutionsForWeights(weights, recurrences)
					const summaryPromise = buildMaxScalarSolutionForWeights(
						weights,
						activeRuleSnapshot,
						recurrences,
						solutions
					)
					if (!summaryPromise) continue
					let summary: RuleSolutionSummary | null
					try {
						summary = await summaryPromise
					} catch {
						continue
					}
					if (!summary || summary.base === null) continue
					if (!best || summary.base < best.base) {
						best = { weights, base: summary.base }
						userWeights = best.weights
					}
				}
				await Promise.resolve()
			}
			if (best) {
				userWeights = best.weights
			}
		} finally {
			isWeightSearchRunning = false
		}
	}

	onMount(() => {
		runGridSearchOnLoad()
	})

	const setRuleEnabled = (ruleName: string, isEnabled: boolean) => {
		enabledRules = { ...enabledRules, [ruleName]: isEnabled }
	}
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
					bind:value={userWeights.w3} />
			</label>
			<label
				class="flex flex-col gap-1 text-xs font-semibold tracking-wide text-gray-600 uppercase">
				<span>Coefficient c₂ (n₂)</span>
				<input
					type="number"
					min="0"
					step="0.1"
					class="rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none"
					bind:value={userWeights.w2} />
			</label>
		</div>
		<p class="mt-3 text-xs text-gray-500">
			Current measure: <span class="font-mono">n = {userWeights.w3}·n₁ + {userWeights.w2}·n₂</span>
		</p>
		{#if isWeightSearchRunning}
			<div class="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700">
				<span
					class="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"
					aria-hidden="true"></span>
				<span>Searching optimal weights…</span>
			</div>
		{/if}
	</div>

	<div class="rounded-lg border border-purple-200 bg-white p-4 text-sm text-gray-800">
		<div class="text-xs font-semibold tracking-wide text-purple-700 uppercase">
			Slowest Custom Solution
		</div>
		{#if maxScalarSolution}
			{#await maxScalarSolution}
				<p class="mt-2 text-gray-500">Computing aggregate…</p>
			{:then summary}
				{#if summary}
					<p class="mt-2">
						Worst-case among active rules:
						<span class="font-semibold">{summary.ruleName}</span>
					</p>
					<p class="mt-1 font-mono text-base text-gray-800">{summary.solution}</p>
				{:else}
					<p class="mt-2 text-gray-500">No active rule has a solvable scalar recurrence.</p>
				{/if}
			{:catch error}
				<p class="mt-2 text-red-600">
					Failed to aggregate solutions: {error instanceof Error ? error.message : String(error)}
				</p>
			{/await}
		{:else}
			<p class="mt-2 text-gray-500">Enable at least one rule with a valid scalar recurrence.</p>
		{/if}
		{#if incompatibleRules.length}
			<div class="mt-3 space-y-1 text-xs text-amber-700">
				<p class="font-semibold tracking-wide uppercase">Incompatible measure for:</p>
				<ul class="list-disc space-y-1 pl-5">
					{#each incompatibleRules as issue (issue.name)}
						<li>
							<span class="font-semibold">{issue.name}</span>
							<span class="text-gray-600">— {issue.reason}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
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
				Missing {exhaustivenessReport.missing.length} situations. Showing up to six examples below.
			</p>
			<div class="mt-4 grid gap-4 md:grid-cols-2">
				{#each exhaustivenessReport.missing.slice(0, 6) as situation (situation.signature())}
					<div class="space-y-2 rounded-lg border bg-gray-50 p-3">
						<div class="text-xs font-semibold text-gray-500 uppercase">Missing situation</div>
						<GraphView graph={situation} scale={0.6} />
					</div>
				{/each}
			</div>
		{/if}
	</div>
	{#each rules as rule, i (rule.name)}
		{@const analysis = ruleAnalyses[i]}
		{@const isRuleEnabled = enabledRules[rule.name] ?? true}
		<section
			class={`space-y-8 rounded-xl border border-gray-300 p-6 ${isRuleEnabled ? "" : "opacity-60"}`}>
			<header class="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 class="text-xl font-semibold">{rule.name}</h2>
					<p class="mt-1 text-gray-600">{rule.description}</p>
				</div>
				<label
					class="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-600 uppercase">
					<input
						type="checkbox"
						class="h-4 w-4 accent-emerald-600"
						checked={isRuleEnabled}
						onchange={e =>
							setRuleEnabled(rule.name, (e.currentTarget as HTMLInputElement).checked)} />
					<span>Include in analysis</span>
				</label>
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
					<GraphView graph={rule.before} />
				</div>
			</div>

			<!-- AFTER -->
			<div>
				<h3 class="mb-3 font-medium">After branching</h3>

				<div class="flex flex-wrap gap-6">
					{#each rule.branches as branch, j (branch.assignments)}
						<div class="flex-1 space-y-2 rounded-lg bg-gray-50 p-2 ring ring-amber-300">
							<div class="font-semibold">{describeAssignments(branch.assignments)}</div>
							<GraphView graph={analysis.branchDetails[j].after} scale={0.65} />
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
				{missingRuleSnippets.join(",\n")}
			</pre>
		</section>
	{/if}
</div>
