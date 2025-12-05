<script lang="ts">
	import { browser } from "$app/environment"
	import RecurrenceCard from "./RecurrenceCard.svelte"
	import type { Root } from "$lib/root-finding"
	import {
		formatRecurrences,
		parseRecurrences,
		solveRecurrenceSystem,
		type Recurrence
	} from "$lib/recurrence-solver"

	// --- State setup ---
	let S = $state<{ text: string; log: Recurrence[] }>({
		text: "",
		log: loadFromStorage()
	})

	// --- Recompute roots for stored recurrences once on client ---
	let storedRoots: (Root | null)[] = $derived(
		browser && S.log.length ? S.log.map((r) => solveRecurrenceSystem(r)) : []
	)

	// --- URL initialization ---
	if (browser) {
		const params = new URLSearchParams(location.search)
		const q = params.get("q")
		if (q) S.text = decodeURIComponent(q)
	}

	// --- localStorage functions ---
	function loadFromStorage(): Recurrence[] {
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
			if (S.log.length === 0) localStorage.removeItem("recurrence-log")
			else localStorage.setItem("recurrence-log", JSON.stringify(S.log))
		} catch {
			/* silent */
		}
	})

	// Listen for localStorage changes from other tabs
	$effect(() => {
		if (!browser) return
		function handleStorageChange(e: StorageEvent) {
			if (e.key === "recurrence-log") {
				S.log = loadFromStorage()
				storedRoots = S.log.map((r) => solveRecurrenceSystem(r))
			}
		}
		window.addEventListener("storage", handleStorageChange)
		return () => window.removeEventListener("storage", handleStorageChange)
	})

	// --- Sync URL to text ---
	$effect(() => {
		if (!browser) return
		const q = S.text.trim()
		const newUrl = q ? `${location.pathname}?q=${encodeURIComponent(q)}` : location.pathname
		if (location.search !== (q ? `?q=${encodeURIComponent(q)}` : "")) {
			history.replaceState(null, "", newUrl)
		}
	})

	if (browser) {
		window.addEventListener("popstate", () => {
			const params = new URLSearchParams(location.search)
			const q = params.get("q")
			S.text = q ? decodeURIComponent(q) : ""
		})
	}

	// --- Examples ---
	const examples = [
		{
			title: "Fibonacci Sequence",
			equations: ["F(n)=F(n-1)+F(n-2)"]
		},
		{
			title: "2D Delannoy System",
			description:
				"D(m,n) is the number of paths from (0,0) to (m,n) with diagonal moves. You can move North, East, or Northeast.",
			equations: ["D(m,n)=D(m,n-1)+D(m-1,n)+D(m-1,n-1)"]
		}
	].map((x) => {
		const result = parseRecurrences(x.equations)
		if (!result.ok) throw Error
		return { ...x, recurrences: result.recurrences }
	})

	// --- Actions ---
	function add() {
		const lines = S.text.split(/\r?\n/).filter(Boolean)
		const p = parseRecurrences(lines)
		if (!p.ok) return
		const last = S.log.at(-1)
		if (last && JSON.stringify(last) === JSON.stringify(p.recurrences)) return
		S.log.push(p.recurrences)
		storedRoots.push(solveRecurrenceSystem(p.recurrences))
		S.text = ""
	}

	function loadRecurrence(r: Recurrence) {
		S.text = formatRecurrences(r).join("\n")
	}

	function clearLog() {
		S.log = []
		storedRoots = []
	}

	function deleteResult(index: number) {
		S.log = S.log.filter((_, i) => i !== index)
		storedRoots.splice(index, 1)
	}

	let parsed = $derived(parseRecurrences(S.text.split(/\r?\n/).filter(Boolean)))
	let x = $derived(parsed.ok ? solveRecurrenceSystem(parsed.recurrences) : undefined)
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
				recurrences={parsed.ok ? parsed.recurrences : undefined}
				root={x}
				error={parsed.ok ? undefined : parsed.error}
				kind="current"
				emptyMessage={S.text.trim() ? undefined : "No input provided"}
			/>{/if}

		{#if parsed.ok}
			<div class="mt-3 flex">
				<button
					onclick={add}
					class="inline-flex items-center gap-2 rounded bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700"
				>
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
			<div class="mb-12 space-y-4">
				{#each S.log as recurrences, index (index)}
					<RecurrenceCard
						title={`System #${index + 1}`}
						{recurrences}
						root={storedRoots[index]}
						showDelete={true}
						kind="stored"
						onDelete={() => deleteResult(index)}
						onSelect={() => loadRecurrence(recurrences)}
					/>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Examples Section (moved below stored recurrences) -->
	<div class="mb-8">
		<h2 class="mb-4 text-xl font-semibold text-gray-800">Examples</h2>
		<div class="space-y-4">
			{#each examples as ex, i (i)}
				<RecurrenceCard
					title={ex.title}
					recurrences={ex.recurrences}
					root={solveRecurrenceSystem(ex.recurrences)}
					description={ex.description}
					kind="example"
					onSelect={() => loadRecurrence(ex.recurrences)}
				/>
			{/each}
		</div>
	</div>
</div>
