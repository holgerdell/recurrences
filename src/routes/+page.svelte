<script lang="ts">
	import {
		parseRecurrences,
		dominantRoot,
		type Recurrence,
		type Root
	} from "$lib/recurrence-solver"
	import { browser } from "$app/environment"
	import RecurrenceCard from "./RecurrenceCard.svelte"

	// --- State setup ---
	let S = $state<{ text: string; log: [Recurrence, Root][] }>({
		text: "",
		log: loadFromStorage()
	})

	// --- localStorage functions ---
	function loadFromStorage(): [Recurrence, Root][] {
		if (!browser) return []
		try {
			const stored = localStorage.getItem("recurrence-log")
			return stored ? JSON.parse(stored) : []
		} catch {
			return []
		}
	}

	// Save to localStorage whenever log changes
	$effect(() => {
		if (!browser) return
		try {
			if (S.log.length == 0) localStorage.removeItem("recurrence-log")
			else localStorage.setItem("recurrence-log", JSON.stringify(S.log))
		} catch {
			// Handle storage errors silently
		}
	})

	// Listen for localStorage changes from other tabs
	$effect(() => {
		if (!browser) return

		function handleStorageChange(event: StorageEvent) {
			if (event.key === "recurrence-log") {
				S.log = loadFromStorage()
			}
		}

		window.addEventListener("storage", handleStorageChange)
		return () => window.removeEventListener("storage", handleStorageChange)
	})

	// --- Example systems ---
	const examples = [
		{
			title: "1D: Fibonacci Sequence",
			equations: ["F(n)=F(n-1)+F(n-2)"]
		},
		{
			title: "2D: Triangular System",
			equations: ["T(n,k)=T(n-1,k)+T(n,k-1)", "T(n,0)=2*T(n-1,0)"]
		}
	]

	// --- Actions ---
	function add(event: Event) {
		event.preventDefault()
		const lines = S.text.split(/\r?\n/).filter(Boolean)
		const p = parseRecurrences(lines)
		if (!p.ok) return

		const last = S.log.at(-1)
		if (last && JSON.stringify(last[0]) === JSON.stringify(p.recurrences)) return

		const x = dominantRoot(p.recurrences)
		if (x) S.log.push([p.recurrences, x])
	}

	function loadExample(equations: string[]) {
		S.text = equations.join("\n")
	}

	function clearLog() {
		S.log = []
	}

	function deleteResult(index: number) {
		S.log = S.log.filter((_, i) => i !== index)
	}

	let parsed = $derived(parseRecurrences(S.text.split(/\r?\n/).filter(Boolean)))
	let x = $derived(parsed.ok ? dominantRoot(parsed.recurrences) : undefined)
</script>

<div class="mx-auto max-w-4xl p-6">
	<h1 class="mb-8 text-3xl font-bold text-gray-800">Recurrence Relation Solver</h1>

	<!-- Examples Section -->
	<div class="mb-8">
		<h2 class="mb-4 text-lg font-medium text-slate-600">Examples</h2>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			{#each examples as example (example.equations)}
				<div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
					<h3 class="mb-2 font-medium text-slate-700">{example.title}</h3>
					<div class="mb-3 space-y-0">
						{#each example.equations as equation (equation)}
							<code class="block bg-slate-100 px-2 py-2 text-sm text-slate-600">
								{equation}
							</code>
						{/each}
					</div>
					<button
						onclick={() => loadExample(example.equations)}
						class="rounded bg-slate-600 px-3 py-1 text-sm text-white transition-colors hover:bg-slate-700"
					>
						Load Example
					</button>
				</div>
			{/each}
		</div>
	</div>

	<!-- Input Section -->
	<form onsubmit={add} class="mb-8">
		<div class="flex flex-col">
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
		</div>
		<button
			type="submit"
			class="mt-3 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
		>
			Add Recurrence(s)
		</button>
	</form>

	<!-- Current Parse Result -->
	<div class="mb-8">
		<h3 class="mb-3 font-medium text-gray-700">Current Input</h3>
		<RecurrenceCard
			title="Preview"
			recurrences={parsed.ok ? parsed.recurrences : undefined}
			root={x}
			error={parsed.ok ? undefined : parsed.error}
			emptyMessage={S.text.trim() ? undefined : "No input provided"}
		/>
	</div>

	<!-- Stored Results -->
	<div class="mb-8">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-xl font-semibold text-gray-800">Stored Results</h2>
			{#if S.log.length > 0}
				<button
					onclick={clearLog}
					class="rounded bg-red-600 px-3 py-1 text-sm text-white transition-colors hover:bg-red-700"
				>
					Clear All
				</button>
			{/if}
		</div>

		{#if S.log.length === 0}
			<div class="py-8 text-center text-gray-400 italic">
				No stored recurrences yet. Add some above!
			</div>
		{:else}
			<div class="space-y-4">
				{#each S.log as [recurrences, root], index (index)}
					<RecurrenceCard
						title="System #{index + 1}"
						{recurrences}
						{root}
						showDelete={true}
						onDelete={() => deleteResult(index)}
					/>
				{/each}
			</div>
		{/if}
	</div>
</div>
