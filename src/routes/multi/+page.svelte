<script lang="ts">
	import {
		parseRecurrences,
		dominantRoot,
		formatRecurrences,
		formatRoot,
		type Recurrence,
		type Root
	} from "./recurrence-solver"

	// --- State setup ---
	const initial_text = `T(n,k)=T(n-1,k)+T(n,k-1)
T(n,0)=2*T(n-1,0)` // example with two lines
	const initial_p = parseRecurrences(initial_text.split(/\r?\n/).filter(Boolean))
	const initial_x = initial_p.ok && dominantRoot(initial_p.recurrences)

	const initial_log: [Recurrence, Root][] =
		initial_p.ok && initial_x ? [[initial_p.recurrences, initial_x]] : []

	let S = $state<{ text: string; log: [Recurrence, Root][] }>({
		text: initial_text,
		log: initial_log
	})

	// --- Actions ---
	function add() {
		const lines = S.text.split(/\r?\n/).filter(Boolean)
		const p = parseRecurrences(lines)
		if (!p.ok) return

		const last = S.log.at(-1)
		if (last && JSON.stringify(last[0]) === JSON.stringify(p.recurrences)) return

		const x = dominantRoot(p.recurrences)
		if (x) S.log.push([p.recurrences, x])
	}

	let parsed = $derived(parseRecurrences(S.text.split(/\r?\n/).filter(Boolean)))
	let x = $derived(parsed.ok ? dominantRoot(parsed.recurrences) : undefined)
</script>

<h1 class="font-bold text-2xl mb-12">Recurrence relation solver</h1>

<form onsubmit={add}>
	<div class="flex flex-col items-start">
		<label for="recurrence-input"
			>Enter one or more recurrence relations (each on a new line):</label
		>
		<textarea
			id="recurrence-input"
			bind:value={S.text}
			rows="4"
			class="m-2 p-2 ring-1 bg-green-100 w-full"
		></textarea>
	</div>
	<button type="submit" class="px-2 py-1 ring-1 bg-green-200 hover:bg-green-300">
		Add Recurrence(s)
	</button>
</form>

<div class="text-slate-400 mt-4">
	{#if parsed.ok}
		{#each formatRecurrences(parsed.recurrences) as line}
			<div>{line}</div>
		{/each}
		{#if x}
			<div class="text-green-700 mt-2">
				{formatRoot(x, parsed.recurrences[0]?.vars)}
			</div>
		{/if}
	{:else}
		<div class="text-red-600">Error: {parsed.error}</div>
	{/if}
</div>

<p class="mt-4">Press "Add Recurrence(s)" to add them to the list below.</p>

<h1 class="font-bold text-lg mt-12 mb-4">Stored recurrences</h1>
{#each S.log as row}
	<div class="mb-2">
		<div class="text-green-700 w-40 text-right inline-block mr-4">
			{formatRoot(row[1], row[0][0]?.vars)}
		</div>
		{#each formatRecurrences(row[0]) as line}
			<div>{line}</div>
		{/each}
	</div>
{/each}
