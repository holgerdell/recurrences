<script lang="ts">
	import { browser } from "$app/environment"
	import { goto } from "$app/navigation"
	import RecurrenceCard from "$lib/components/RecurrenceCard.svelte"
	import { LocalStorageState } from "$lib/persistent-state.svelte"
	import {
		formatRecurrences,
		parseRecurrences,
		solveRecurrenceSystem,
		type Recurrence
	} from "$lib/recurrence-solver"
	import type { Root } from "$lib/root-finding"

	// --- Persistent log state ---
	const logState = new LocalStorageState<string[]>({
		key: "recurrence-log-v3",
		defaultValue: [],
		validate: (v): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string")
	})

	// --- Clean up legacy keys ---
	if (browser && localStorage) {
		localStorage.removeItem("recurrence-log")
		localStorage.removeItem("recurrence-log-v2")
	}

	// --- Component state ---
	let S = $state<{ text: string }>({ text: "" })

	// --- Sync URL <-> text ---
	if (browser) {
		const params = new URLSearchParams(location.search)
		const q = params.get("q")
		if (q) S.text = decodeURIComponent(q)

		window.addEventListener("popstate", () => {
			const params = new URLSearchParams(location.search)
			const q = params.get("q")
			S.text = q ? decodeURIComponent(q) : ""
		})
	}

	$effect(() => {
		if (!browser) return
		const q = S.text.trim()
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(`?q=${encodeURIComponent(q)}`, {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		})
	})

	function computeRoot(s: string): Root | null | "divergent" {
		const parsed = parseRecurrences(s)
		if (!parsed.ok) return null
		return solveRecurrenceSystem(parsed.recurrences)
	}

	// --- Input parsing ---
	let parsed = $derived(parseRecurrences(S.text))
	let previewPromise = $derived(parsed.ok ? solveRecurrenceSystem(parsed.recurrences) : undefined)

	// --- Actions ---
	function add() {
		const lines = S.text.split(/\r?\n/).filter(Boolean)
		S.text = ""

		const clean = lines.join("\n")
		const parsed = parseRecurrences(clean)
		if (!parsed.ok) return

		if (!logState.value.includes(clean)) {
			logState.set([...logState.value, clean])
		}
	}

	function loadRecurrence(r: Recurrence) {
		S.text = formatRecurrences(r)
	}

	function clearLog() {
		logState.reset()
	}

	function deleteResult(index: number) {
		logState.set(logState.value.filter((_, i) => i !== index))
	}

	// --- Examples ---
	const examples = [
		{
			title: "Fibonacci Sequence",
			equations: ["F(n)=F(n-1)+F(n-2)"]
		},
		{
			title: "2D Delannoy System",
			description: "D(m,n) is the number of paths from (0,0) to (m,n) with diagonal moves.",
			equations: ["D(m,n)=D(m,n-1)+D(m-1,n)+D(m-1,n-1)"]
		}
	].map(x => {
		const result = parseRecurrences(x.equations)
		if (!result.ok) throw Error
		return { ...x, recurrences: result.recurrences }
	})
</script>

<div class="mx-auto max-w-4xl p-6">
	<h1 class="mb-8 text-3xl font-bold text-gray-800">Recurrence Relation Solver</h1>

	<!-- Input Section -->
	<div class="mb-8 flex flex-col gap-4">
		<label for="recurrence-input" class="mb-2 font-medium text-gray-700">
			Enter one or more recurrence relations (each on a new line):
		</label>

		<textarea
			id="recurrence-input"
			bind:value={S.text}
			rows="4"
			placeholder="Enter recurrence relations here..."
			class="rounded-lg border border-gray-300 p-3 font-mono transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
		></textarea>

		{#if S.text}
			<RecurrenceCard
				title="Preview"
				recurrences={parsed.ok ? formatRecurrences(parsed.recurrences) : undefined}
				root={previewPromise}
				error={parsed.ok ? undefined : parsed.error}
				kind="current"
				emptyMessage={S.text.trim() ? undefined : "No input provided"} />
		{/if}

		{#if parsed.ok}
			<div class="mt-3 flex">
				<button
					onclick={add}
					class="inline-flex items-center gap-2 rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700">
					Add to Stored
					<span aria-hidden="true">▼</span>
				</button>
			</div>
		{/if}
	</div>

	<!-- Stored Results -->
	<div class="mb-8">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-xl font-semibold text-gray-800">Stored Results</h2>

			{#if logState.value.length > 0}
				<button
					onclick={clearLog}
					class="rounded bg-red-600 px-3 py-1 text-sm text-white transition-colors hover:bg-red-700">
					Clear All
				</button>
			{/if}
		</div>

		{#if logState.value.length === 0}
			<div class="py-8 text-center text-gray-400 italic">
				No stored recurrences yet. Add some above!
			</div>
		{:else}
			<div class="mb-12 space-y-4">
				{#each logState.value as s, index (s)}
					<RecurrenceCard
						title={`System #${index + 1}`}
						recurrences={s}
						root={computeRoot(s)}
						showDelete={true}
						kind="stored"
						onDelete={() => deleteResult(index)}
						onSelect={() => {
							S.text = s
						}} />
				{/each}
			</div>
		{/if}
	</div>

	<!-- Examples Section -->
	<div class="mb-8">
		<h2 class="mb-4 text-xl font-semibold text-gray-800">Examples</h2>

		<div class="space-y-4">
			{#each examples as ex, i (i)}
				<RecurrenceCard
					title={ex.title}
					recurrences={formatRecurrences(ex.recurrences)}
					root={solveRecurrenceSystem(ex.recurrences)}
					description={ex.description}
					kind="example"
					onSelect={() => loadRecurrence(ex.recurrences)} />
			{/each}
		</div>
	</div>
</div>
