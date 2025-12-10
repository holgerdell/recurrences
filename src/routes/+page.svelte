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
	import { goto } from "$app/navigation"

	const RECURRENCE_LOG_KEY = "recurrence-log-v3"

	// --- State setup ---
	let S = $state<{
		text: string
		log: string[]
		logRoots: Record<string, Root | null | "divergent">
	}>({
		text: "",
		log: loadFromStorage(RECURRENCE_LOG_KEY),
		logRoots: {}
	})

	if (browser) {
		recomputeLogRoots(S.log)
		localStorage.removeItem("recurrence-log")
		localStorage.removeItem("recurrence-log-v2")

		// --- URL initialization ---
		const params = new URLSearchParams(location.search)
		const q = params.get("q")
		if (q) S.text = decodeURIComponent(q)
		window.addEventListener("popstate", () => {
			const params = new URLSearchParams(location.search)
			const q = params.get("q")
			S.text = q ? decodeURIComponent(q) : ""
		})
	}

	function recomputeLogRoots(list: string[]) {
		for (const s of list) {
			const r = parseRecurrences(s)
			if (!r.ok) continue
			solveRecurrenceSystem(r.recurrences).then((sol) => {
				S.logRoots[s] = sol
			})
		}
	}

	function isListOfStrings(value: unknown): value is string[] {
		return Array.isArray(value) && value.every((item) => typeof item === "string")
	}

	// --- localStorage functions ---
	function loadFromStorage(key: string): string[] {
		if (!browser) return []
		const stored = localStorage.getItem(key)
		if (!stored) return []
		try {
			const parsed = JSON.parse(stored)
			if (isListOfStrings(parsed)) {
				return parsed
			} else {
				console.warn(`⚠️ ${key} does not contain a valid list of strings.`)
				return []
			}
		} catch (err) {
			console.error(`❌ Failed to parse ${key} from localStorage:`, err)
			return []
		}
	}

	function saveToStorage(key: string, value: string[]) {
		if (!browser) return
		try {
			if (value.length === 0) localStorage.removeItem(key)
			else localStorage.setItem(key, JSON.stringify(value))
		} catch {
			/* silent */
		}
	}

	// Save to localStorage whenever log changes
	$effect(() => {
		if (!browser) return
		saveToStorage(RECURRENCE_LOG_KEY, S.log)
	})

	// Listen for localStorage changes from other tabs
	$effect(() => {
		if (!browser) return
		function handleStorageChange(e: StorageEvent) {
			if (e.key === RECURRENCE_LOG_KEY) {
				S.log = loadFromStorage(RECURRENCE_LOG_KEY)
				recomputeLogRoots(S.log)
			}
		}
		window.addEventListener("storage", handleStorageChange)
		return () => window.removeEventListener("storage", handleStorageChange)
	})

	// --- Sync URL to text ---
	$effect(() => {
		if (!browser) return
		const q = S.text.trim()
		goto(`?q=${encodeURIComponent(q)}`, { replaceState: true, noScroll: true, keepFocus: true })
	})

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
		const result = parseRecurrences(x.equations.join("\n"))
		if (!result.ok) throw Error
		return { ...x, recurrences: result.recurrences }
	})

	// --- Actions ---
	function add() {
		const lines = S.text.split(/\r?\n/).filter(Boolean)
		S.text = ""
		const clean = lines.join("\n")
		const p = parseRecurrences(clean)
		if (!p.ok) return
		if (!(clean in S.logRoots)) {
			solveRecurrenceSystem(p.recurrences).then((sol) => {
				S.logRoots[clean] = sol
			})
		}
		if (!(clean in S.log)) S.log.push(clean)
	}

	function loadRecurrence(r: Recurrence) {
		S.text = formatRecurrences(r)
	}

	function clearLog() {
		S.log = []
		S.logRoots = {}
	}

	function deleteResult(index: number) {
		S.log = S.log.filter((_, i) => i !== index)
	}

	let parsed = $derived(parseRecurrences(S.text))
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
				recurrences={parsed.ok ? formatRecurrences(parsed.recurrences) : undefined}
				root={await x}
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
				{#each S.log as s, index (index)}
					<RecurrenceCard
						title={`System #${index + 1}`}
						recurrences={s}
						root={S.logRoots[s]}
						showDelete={true}
						kind="stored"
						onDelete={() => deleteResult(index)}
						onSelect={() => {
							S.text = s
						}}
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
					recurrences={formatRecurrences(ex.recurrences)}
					root={await solveRecurrenceSystem(ex.recurrences)}
					description={ex.description}
					kind="example"
					onSelect={() => loadRecurrence(ex.recurrences)}
				/>
			{/each}
		</div>
	</div>
</div>
